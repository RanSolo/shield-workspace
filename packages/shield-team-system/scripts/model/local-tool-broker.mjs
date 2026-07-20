import { createAuditedExecutor, createPermissionAuthorizer } from "../../dist/permission-v1.mjs";
import { validateRunnerCyclePlan } from "../../dist/runner-v1.mjs";
import { strictParseJson } from "./strict-json.mjs";
import { createRepositoryTools } from "./repository-tools.mjs";

export const LOCAL_TOOL_LIMITS = Object.freeze({
  argumentBytes: 4_096,
  argumentDepth: 4,
  aggregateOutputBytes: 262_144,
  responseBytes: 1_048_576,
  errorBytes: 512,
  rounds: 8,
  calls: 16,
  inferenceTimeoutMs: 120_000,
  sessionTimeoutMs: 300_000,
});

export const DAISY_TOOL_MAPPINGS = Object.freeze({
  readFile: Object.freeze({ actionId: "repository.read_file", effectClass: "verification", capability: "filesystem_read" }),
  listFiles: Object.freeze({ actionId: "repository.list_files", effectClass: "verification", capability: "filesystem_list" }),
  searchRepo: Object.freeze({ actionId: "repository.search", effectClass: "verification", capability: "filesystem_search" }),
});

export const DAISY_TOOL_DEFINITIONS = Object.freeze(Object.entries({
  readFile: { description: "Read one bounded UTF-8 regular file inside the authorized repository.", field: "path" },
  listFiles: { description: "List a bounded deterministic set of files inside an authorized repository directory.", field: "directory" },
  searchRepo: { description: "Search authorized repository text with bounded ripgrep execution.", field: "pattern" },
}).map(([name, definition]) => Object.freeze({
  type: "function",
  function: Object.freeze({
    name,
    description: definition.description,
    parameters: Object.freeze({
      type: "object",
      properties: Object.freeze({ [definition.field]: Object.freeze({ type: "string" }) }),
      required: Object.freeze([definition.field]),
      additionalProperties: false,
    }),
  }),
})));

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactPlain(value, fields) {
  if (!plain(value)) return false;
  const allowed = new Set(fields);
  for (const field of fields) if (!Object.hasOwn(value, field)) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : null;
    if (typeof key !== "string" || !allowed.has(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return false;
  }
  return true;
}

function denseArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : null;
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
  }
  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return null;
    output.push(Object.getOwnPropertyDescriptor(value, String(index)).value);
  }
  return output;
}

function boundedError(code) {
  const value = String(code);
  return /^[a-z][a-z0-9_]{0,127}$/u.test(value) ? value : "tool_session_failed";
}

function validateLoopbackBaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]") || url.username || url.password || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function readBoundedResponse(response, maxBytes) {
  if (!response?.body || typeof response.body.getReader !== "function") throw new Error("lm_response_body_missing");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!(value instanceof Uint8Array)) throw new Error("lm_response_chunk_invalid");
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("lm_response_too_large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchJson(fetchImpl, url, options, { timeoutMs, maxBytes }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, redirect: "error", signal: controller.signal });
    const raw = await readBoundedResponse(response, maxBytes);
    if (!response.ok) throw new Error("lm_request_failed");
    const parsed = strictParseJson(raw, { maxBytes, maxDepth: 16, rejectControlCharacters: false });
    if (parsed.state !== "valid") throw new Error("lm_response_malformed");
    return parsed.value;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("lm_request_timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeLocalToolModel({ baseUrl, model, fetchImpl = fetch, apiToken }) {
  const origin = validateLoopbackBaseUrl(baseUrl);
  if (origin === null || typeof model !== "string" || !IDENTIFIER.test(model)) throw new Error("lm_probe_input_invalid");
  const data = await fetchJson(fetchImpl, `${origin}/api/v1/models`, {
    method: "GET",
    headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
  }, { timeoutMs: LOCAL_TOOL_LIMITS.inferenceTimeoutMs, maxBytes: LOCAL_TOOL_LIMITS.responseBytes });
  if (!exactPlain(data, ["models"])) throw new Error("lm_models_response_malformed");
  const models = denseArray(data.models);
  if (models === null) throw new Error("lm_models_response_malformed");
  const matches = [];
  for (const item of models) {
    if (!plain(item)) continue;
    const key = Object.getOwnPropertyDescriptor(item, "key")?.value;
    const capabilities = Object.getOwnPropertyDescriptor(item, "capabilities")?.value;
    const loaded = denseArray(Object.getOwnPropertyDescriptor(item, "loaded_instances")?.value);
    if (typeof key !== "string" || !plain(capabilities) || loaded === null) continue;
    const trained = Object.getOwnPropertyDescriptor(capabilities, "trained_for_tool_use")?.value === true;
    const instanceIds = loaded.map((entry) => plain(entry) ? Object.getOwnPropertyDescriptor(entry, "id")?.value : null).filter((id) => typeof id === "string" && IDENTIFIER.test(id));
    if (model === key) {
      if (trained && instanceIds.length === 1) matches.push(instanceIds[0]);
    } else if (trained && instanceIds.includes(model)) {
      matches.push(model);
    }
  }
  if (matches.length !== 1) throw new Error(matches.length === 0 ? "lm_tool_model_unavailable" : "lm_tool_model_ambiguous");
  return Object.freeze({ origin, loadedInstanceId: matches[0] });
}

function parseAssistantResponse(data) {
  if (!plain(data)) throw new Error("lm_response_malformed");
  const choices = denseArray(Object.getOwnPropertyDescriptor(data, "choices")?.value);
  if (choices === null || choices.length !== 1 || !plain(choices[0])) throw new Error("lm_response_malformed");
  const message = Object.getOwnPropertyDescriptor(choices[0], "message")?.value;
  if (!plain(message) || Object.getOwnPropertyDescriptor(message, "role")?.value !== "assistant") throw new Error("lm_response_malformed");
  const content = Object.getOwnPropertyDescriptor(message, "content")?.value;
  if (content !== null && typeof content !== "string") throw new Error("lm_response_malformed");
  if (typeof content === "string" && Buffer.byteLength(content, "utf8") > LOCAL_TOOL_LIMITS.responseBytes) throw new Error("lm_response_too_large");
  const rawCalls = Object.hasOwn(message, "tool_calls") ? denseArray(Object.getOwnPropertyDescriptor(message, "tool_calls").value) : [];
  if (rawCalls === null) throw new Error("lm_tool_calls_malformed");
  const toolCalls = rawCalls.map((call) => {
    if (!exactPlain(call, ["id", "type", "function"])) throw new Error("lm_tool_call_malformed");
    const fn = Object.getOwnPropertyDescriptor(call, "function").value;
    const id = Object.getOwnPropertyDescriptor(call, "id").value;
    if (Object.getOwnPropertyDescriptor(call, "type").value !== "function" || !IDENTIFIER.test(String(id)) || !exactPlain(fn, ["name", "arguments"])) throw new Error("lm_tool_call_malformed");
    const name = Object.getOwnPropertyDescriptor(fn, "name").value;
    const args = Object.getOwnPropertyDescriptor(fn, "arguments").value;
    if (typeof name !== "string" || typeof args !== "string") throw new Error("lm_tool_call_malformed");
    return Object.freeze({ id, type: "function", function: Object.freeze({ name, arguments: args }) });
  });
  if (toolCalls.length > 0 && content !== null && content.trim().length > 0) throw new Error("lm_response_ambiguous");
  return { content, toolCalls, assistantMessage: { role: "assistant", content, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) } };
}

function parseToolArguments(name, raw) {
  const parsed = strictParseJson(raw, { maxBytes: LOCAL_TOOL_LIMITS.argumentBytes, maxDepth: LOCAL_TOOL_LIMITS.argumentDepth });
  if (parsed.state !== "valid" || !plain(parsed.value)) throw new Error(parsed.code ?? "tool_arguments_malformed");
  const field = name === "readFile" ? "path" : name === "listFiles" ? "directory" : name === "searchRepo" ? "pattern" : null;
  if (field === null || !exactPlain(parsed.value, [field])) throw new Error(field === null ? "tool_unknown" : "tool_arguments_malformed");
  const value = Object.getOwnPropertyDescriptor(parsed.value, field).value;
  if (typeof value !== "string") throw new Error("tool_arguments_malformed");
  return { [field]: value };
}

function validateSlot(slot, mapping) {
  const checked = validateRunnerCyclePlan(slot);
  if (checked.state === "invalid") throw new Error("authority_slot_malformed");
  const plan = checked.value;
  if (plan.seatId !== "daisy" || plan.actionId !== mapping.actionId || plan.effectClass !== mapping.effectClass) throw new Error("authority_slot_mismatch");
  return plan;
}

function validateAuthorityContextIdentity(context, expected, actionId) {
  if (!plain(context)) throw new Error("authority_context_malformed");
  const read = (field) => Object.getOwnPropertyDescriptor(context, field)?.value;
  if (read("canonicalWritableRoot") !== expected.canonicalRoot || read("repositoryId") !== expected.repositoryId || read("reasoningRuntimeId") !== expected.reasoningRuntimeId || read("toolExecutorId") !== expected.toolExecutorId) {
    throw new Error("authority_context_identity_mismatch");
  }
  const mapping = Object.values(DAISY_TOOL_MAPPINGS).find((item) => item.actionId === actionId);
  const capabilities = denseArray(read("requiredCapabilities"));
  if (!mapping || capabilities === null || capabilities.length !== 1 || capabilities[0] !== mapping.capability) throw new Error("authority_context_capability_mismatch");
  return context;
}

async function appendBrokerEvent(dependencies, sessionId, counter, code, identifiers = {}) {
  const event = Object.freeze({
    brokerEventSchemaVersion: 1,
    authority: "non_authoritative",
    eventId: `broker-event:${sessionId}:${counter}`,
    sessionId,
    code,
    counter,
    toolCallId: identifiers.toolCallId ?? null,
    cycleId: identifiers.cycleId ?? null,
    decisionId: identifiers.decisionId ?? null,
    evidenceRefs: Object.freeze([`broker:${sessionId}`]),
  });
  const receipt = await dependencies.appendBrokerEvent(event);
  if (!exactPlain(receipt, ["eventId", "appended"]) || receipt.eventId !== event.eventId || receipt.appended !== true) throw new Error("broker_event_receipt_invalid");
}

function releasedToolContent(raw) {
  const body = JSON.stringify({ state: "completed", result: raw });
  return Buffer.byteLength(body, "utf8") <= LOCAL_TOOL_LIMITS.aggregateOutputBytes ? body : null;
}

export async function runLocalToolSession(request, dependencies) {
  if (!exactPlain(request, ["baseUrl", "model", "systemPrompt", "userPrompt", "sessionId", "repositoryRoot", "rgExecutable"])) throw new Error("tool_session_request_malformed");
  for (const field of ["baseUrl", "model", "systemPrompt", "userPrompt", "sessionId", "repositoryRoot", "rgExecutable"]) if (typeof request[field] !== "string") throw new Error("tool_session_request_malformed");
  if (!IDENTIFIER.test(request.sessionId) || !plain(dependencies)) throw new Error("tool_session_request_malformed");
  for (const name of ["nextCallSlot", "getAuthorizationContext", "getExecutionContext", "appendIfAbsent", "nextResultRecordId", "appendBrokerEvent", "now"]) if (typeof dependencies[name] !== "function") throw new Error("tool_session_dependency_missing");
  if (typeof dependencies.ledgerId !== "string" || !IDENTIFIER.test(dependencies.ledgerId)) throw new Error("tool_session_dependency_missing");
  for (const field of ["repositoryId", "toolExecutorId"]) if (typeof dependencies[field] !== "string" || !IDENTIFIER.test(dependencies[field])) throw new Error("tool_session_dependency_missing");

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let eventCounter = 0;
  let capability;
  let repository;
  try {
    capability = await probeLocalToolModel({ baseUrl: request.baseUrl, model: request.model, fetchImpl, apiToken: dependencies.apiToken });
    repository = await createRepositoryTools(request.repositoryRoot, { rgExecutable: request.rgExecutable });
  } catch (error) {
    eventCounter += 1;
    const code = boundedError(error instanceof Error ? error.message : "tool_session_setup_failed");
    await appendBrokerEvent(dependencies, request.sessionId, eventCounter, code);
    throw new Error(code);
  }
  const expectedIdentity = {
    canonicalRoot: repository.canonicalRoot,
    repositoryId: dependencies.repositoryId,
    reasoningRuntimeId: capability.loadedInstanceId,
    toolExecutorId: dependencies.toolExecutorId,
  };
  const startedAt = Date.now();
  const seenCallIds = new Set();
  const seenCycleIds = new Set();
  const seenEffectKeys = new Set();
  const escrow = new Map();
  let callCount = 0;
  let completedCalls = 0;
  let releasedBytes = 0;
  const messages = [
    { role: "system", content: request.systemPrompt },
    { role: "user", content: request.userPrompt },
  ];
  const authorizer = createPermissionAuthorizer({
    ledgerId: dependencies.ledgerId,
    appendIfAbsent: dependencies.appendIfAbsent,
    getContext: async (plan) => validateAuthorityContextIdentity(await dependencies.getAuthorizationContext(plan), expectedIdentity, plan.actionId),
  });

  try {
    for (let round = 0; round < LOCAL_TOOL_LIMITS.rounds; round += 1) {
      if (Date.now() - startedAt > LOCAL_TOOL_LIMITS.sessionTimeoutMs) throw new Error("tool_session_timeout");
      const data = await fetchJson(fetchImpl, `${capability.origin}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(dependencies.apiToken ? { Authorization: `Bearer ${dependencies.apiToken}` } : {}) },
        body: JSON.stringify({ model: capability.loadedInstanceId, messages, tools: DAISY_TOOL_DEFINITIONS, tool_choice: "auto" }),
      }, { timeoutMs: LOCAL_TOOL_LIMITS.inferenceTimeoutMs, maxBytes: LOCAL_TOOL_LIMITS.responseBytes });
      const assistant = parseAssistantResponse(data);
      if (assistant.toolCalls.length === 0) {
        if (completedCalls === 0 || typeof assistant.content !== "string" || assistant.content.trim().length === 0) throw new Error("tool_protocol_incomplete");
        return Object.freeze({ message: assistant.content, attribution: "untrusted_model_output", completedToolCalls: completedCalls, releasedBytes });
      }
      messages.push(assistant.assistantMessage);
      for (const call of assistant.toolCalls) {
        callCount += 1;
        if (callCount > LOCAL_TOOL_LIMITS.calls) throw new Error("tool_call_cap_reached");
        if (seenCallIds.has(call.id)) throw new Error("tool_call_id_reused");
        seenCallIds.add(call.id);
        const mapping = DAISY_TOOL_MAPPINGS[call.function.name];
        if (!mapping) throw new Error("tool_unknown");
        const args = parseToolArguments(call.function.name, call.function.arguments);
        const slot = await dependencies.nextCallSlot(Object.freeze({ sessionId: request.sessionId, toolCallId: call.id, toolName: call.function.name, ...mapping }));
        const plan = validateSlot(slot, mapping);
        if (seenCycleIds.has(plan.cycleId) || seenEffectKeys.has(plan.effectKey)) throw new Error("authority_slot_reused");
        seenCycleIds.add(plan.cycleId);
        seenEffectKeys.add(plan.effectKey);
        const decision = await authorizer(plan);
        if (decision.outcome !== "allow") throw new Error("tool_permission_denied");
        const auditedExecutor = createAuditedExecutor({
          ledgerId: dependencies.ledgerId,
          appendIfAbsent: dependencies.appendIfAbsent,
          getContext: async (decision) => validateAuthorityContextIdentity(await dependencies.getExecutionContext(decision), expectedIdentity, decision.actionId),
          nextRecordId: dependencies.nextResultRecordId,
          now: dependencies.now,
          execute: async () => {
            const operation = repository[call.function.name];
            const raw = await operation(args);
            if (raw.state !== "completed") return {
              runnerContractVersion: 1, outcome: "failed", missionId: plan.missionId, subjectId: plan.subjectId,
              revisionId: plan.revisionId, evaluatedThroughSequence: plan.evaluatedThroughSequence, cycleId: plan.cycleId,
              seatId: plan.seatId, actionId: plan.actionId, effectClass: plan.effectClass, effectKey: plan.effectKey,
              summary: "Repository tool execution failed closed.", evidenceRefs: [`broker:${request.sessionId}`],
            };
            escrow.set(plan.cycleId, raw);
            return {
              runnerContractVersion: 1, outcome: "completed", missionId: plan.missionId, subjectId: plan.subjectId,
              revisionId: plan.revisionId, evaluatedThroughSequence: plan.evaluatedThroughSequence, cycleId: plan.cycleId,
              seatId: plan.seatId, actionId: plan.actionId, effectClass: plan.effectClass, effectKey: plan.effectKey,
              summary: "Repository tool execution completed with bounded output escrowed.", evidenceRefs: [`broker:${request.sessionId}`],
            };
          },
        });
        const outcome = await auditedExecutor(plan, decision);
        if (outcome.outcome !== "completed" || !escrow.has(plan.cycleId)) {
          escrow.delete(plan.cycleId);
          throw new Error("tool_result_not_releasable");
        }
        const raw = escrow.get(plan.cycleId);
        escrow.delete(plan.cycleId);
        const content = releasedToolContent(raw);
        if (content === null || releasedBytes + Buffer.byteLength(content, "utf8") > LOCAL_TOOL_LIMITS.aggregateOutputBytes) throw new Error("tool_output_cap_reached");
        releasedBytes += Buffer.byteLength(content, "utf8");
        completedCalls += 1;
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }
    }
    throw new Error("tool_round_cap_reached");
  } catch (error) {
    escrow.clear();
    eventCounter += 1;
    await appendBrokerEvent(dependencies, request.sessionId, eventCounter, boundedError(error instanceof Error ? error.message : "tool_session_failed"));
    throw new Error(boundedError(error instanceof Error ? error.message : "tool_session_failed"));
  }
}
