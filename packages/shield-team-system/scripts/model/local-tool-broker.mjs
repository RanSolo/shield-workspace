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
  terminalEventReserveMs: 1_000,
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

function ownDataValue(value, field) {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function normalizeDependencies(value) {
  if (!plain(value)) throw new Error("tool_session_request_malformed");
  const output = {};
  for (const name of ["getRgExecutable", "monotonicNow", "nextCallSlot", "getAuthorizationContext", "getExecutionContext", "appendIfAbsent", "nextResultRecordId", "appendBrokerEvent", "now"]) {
    const dependency = ownDataValue(value, name);
    if (typeof dependency !== "function") throw new Error("tool_session_dependency_missing");
    output[name] = dependency;
  }
  for (const name of ["ledgerId", "repositoryId", "toolExecutorId"]) {
    const dependency = ownDataValue(value, name);
    if (typeof dependency !== "string" || !IDENTIFIER.test(dependency)) throw new Error("tool_session_dependency_missing");
    output[name] = dependency;
  }
  const fetchImpl = ownDataValue(value, "fetchImpl");
  if (fetchImpl !== undefined && typeof fetchImpl !== "function") throw new Error("tool_session_dependency_missing");
  const apiToken = ownDataValue(value, "apiToken");
  if (apiToken !== undefined && typeof apiToken !== "string") throw new Error("tool_session_dependency_missing");
  return Object.freeze({ ...output, ...(fetchImpl === undefined ? {} : { fetchImpl }), ...(apiToken === undefined ? {} : { apiToken }) });
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

export async function probeLocalToolModel({ baseUrl, model, fetchImpl = fetch, apiToken, timeoutMs = LOCAL_TOOL_LIMITS.inferenceTimeoutMs }) {
  const origin = validateLoopbackBaseUrl(baseUrl);
  if (origin === null || typeof model !== "string" || !IDENTIFIER.test(model)) throw new Error("lm_probe_input_invalid");
  const data = await fetchJson(fetchImpl, `${origin}/api/v1/models`, {
    method: "GET",
    headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
  }, { timeoutMs, maxBytes: LOCAL_TOOL_LIMITS.responseBytes });
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

function remainingTime(deadline, clock) {
  const remaining = deadline - clock();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error("tool_session_timeout");
  return remaining;
}

async function withinDeadline(operation, deadline, clock) {
  const timeoutMs = remainingTime(deadline, clock);
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("tool_session_timeout")), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function appendBrokerEvent(dependencies, sessionId, counter, code, identifiers = {}, timing = null) {
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
  const receipt = timing === null
    ? await dependencies.appendBrokerEvent(event)
    : await withinDeadline(() => dependencies.appendBrokerEvent(event), timing.deadline, timing.clock);
  if (!exactPlain(receipt, ["eventId", "appended"]) || receipt.eventId !== event.eventId || receipt.appended !== true) throw new Error("broker_event_receipt_invalid");
}

function releasedToolContent(raw) {
  const body = JSON.stringify({ state: "completed", result: raw });
  return Buffer.byteLength(body, "utf8") <= LOCAL_TOOL_LIMITS.aggregateOutputBytes ? body : null;
}

export async function runLocalToolSession(request, dependencies) {
  if (!exactPlain(request, ["baseUrl", "model", "systemPrompt", "userPrompt", "sessionId", "repositoryRoot"])) throw new Error("tool_session_request_malformed");
  for (const field of ["baseUrl", "model", "systemPrompt", "userPrompt", "sessionId", "repositoryRoot"]) if (typeof request[field] !== "string") throw new Error("tool_session_request_malformed");
  if (!IDENTIFIER.test(request.sessionId)) throw new Error("tool_session_request_malformed");
  dependencies = normalizeDependencies(dependencies);

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const clock = dependencies.monotonicNow;
  const sessionDeadline = clock() + LOCAL_TOOL_LIMITS.sessionTimeoutMs;
  const deadline = sessionDeadline - LOCAL_TOOL_LIMITS.terminalEventReserveMs;
  const timing = { deadline, clock };
  const terminalTiming = { deadline: sessionDeadline, clock };
  let eventCounter = 0;
  let capability;
  let repository;
  try {
    capability = await withinDeadline(() => probeLocalToolModel({
      baseUrl: request.baseUrl, model: request.model, fetchImpl, apiToken: dependencies.apiToken,
      timeoutMs: Math.min(LOCAL_TOOL_LIMITS.inferenceTimeoutMs, remainingTime(deadline, clock)),
    }), deadline, clock);
    const rgExecutable = await withinDeadline(() => dependencies.getRgExecutable(), deadline, clock);
    repository = await withinDeadline(() => createRepositoryTools(request.repositoryRoot, {
      rgExecutable,
      rgProbeTimeoutMs: Math.min(2_000, remainingTime(deadline, clock)),
    }), deadline, clock);
  } catch (error) {
    eventCounter += 1;
    const code = boundedError(error instanceof Error ? error.message : "tool_session_setup_failed");
    await appendBrokerEvent(dependencies, request.sessionId, eventCounter, code, {}, terminalTiming);
    throw new Error(code);
  }
  const expectedIdentity = {
    canonicalRoot: repository.canonicalRoot,
    repositoryId: dependencies.repositoryId,
    reasoningRuntimeId: capability.loadedInstanceId,
    toolExecutorId: dependencies.toolExecutorId,
  };
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
    appendIfAbsent: (record) => withinDeadline(() => dependencies.appendIfAbsent(record), deadline, clock),
    getContext: async (plan) => validateAuthorityContextIdentity(
      await withinDeadline(() => dependencies.getAuthorizationContext(plan), deadline, clock), expectedIdentity, plan.actionId,
    ),
  });

  try {
    for (let round = 0; round < LOCAL_TOOL_LIMITS.rounds; round += 1) {
      const inferenceTimeout = Math.min(LOCAL_TOOL_LIMITS.inferenceTimeoutMs, remainingTime(deadline, clock));
      const data = await withinDeadline(() => fetchJson(fetchImpl, `${capability.origin}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(dependencies.apiToken ? { Authorization: `Bearer ${dependencies.apiToken}` } : {}) },
        body: JSON.stringify({ model: capability.loadedInstanceId, messages, tools: DAISY_TOOL_DEFINITIONS, tool_choice: "auto" }),
      }, { timeoutMs: inferenceTimeout, maxBytes: LOCAL_TOOL_LIMITS.responseBytes }), deadline, clock);
      const assistant = parseAssistantResponse(data);
      if (assistant.toolCalls.length === 0) {
        if (completedCalls === 0 || typeof assistant.content !== "string" || assistant.content.trim().length === 0) throw new Error("tool_protocol_incomplete");
        return Object.freeze({ message: assistant.content, attribution: "untrusted_model_output", completedToolCalls: completedCalls, releasedBytes });
      }
      messages.push(assistant.assistantMessage);
      if (callCount + assistant.toolCalls.length > LOCAL_TOOL_LIMITS.calls) throw new Error("tool_call_cap_reached");
      const batchCallIds = new Set();
      const prepared = assistant.toolCalls.map((call) => {
        if (seenCallIds.has(call.id) || batchCallIds.has(call.id)) throw new Error("tool_call_id_reused");
        batchCallIds.add(call.id);
        const mapping = DAISY_TOOL_MAPPINGS[call.function.name];
        if (!mapping) throw new Error("tool_unknown");
        const args = parseToolArguments(call.function.name, call.function.arguments);
        return { call, mapping, args };
      });
      const batchCycleIds = new Set();
      const batchEffectKeys = new Set();
      for (const item of prepared) {
        const { call, mapping } = item;
        const slot = await withinDeadline(() => dependencies.nextCallSlot(Object.freeze({ sessionId: request.sessionId, toolCallId: call.id, toolName: call.function.name, ...mapping })), deadline, clock);
        const plan = validateSlot(slot, mapping);
        if (seenCycleIds.has(plan.cycleId) || seenEffectKeys.has(plan.effectKey) || batchCycleIds.has(plan.cycleId) || batchEffectKeys.has(plan.effectKey)) throw new Error("authority_slot_reused");
        batchCycleIds.add(plan.cycleId);
        batchEffectKeys.add(plan.effectKey);
        item.plan = plan;
      }
      callCount += prepared.length;
      for (const id of batchCallIds) seenCallIds.add(id);
      for (const id of batchCycleIds) seenCycleIds.add(id);
      for (const key of batchEffectKeys) seenEffectKeys.add(key);
      for (const { call, args, plan } of prepared) {
        const decision = await authorizer(plan);
        if (decision.outcome !== "allow") throw new Error("tool_permission_denied");
        const auditedExecutor = createAuditedExecutor({
          ledgerId: dependencies.ledgerId,
          appendIfAbsent: (record) => withinDeadline(() => dependencies.appendIfAbsent(record), deadline, clock),
          getContext: async (decision) => validateAuthorityContextIdentity(
            await withinDeadline(() => dependencies.getExecutionContext(decision), deadline, clock), expectedIdentity, decision.actionId,
          ),
          nextRecordId: dependencies.nextResultRecordId,
          now: dependencies.now,
          execute: async () => {
            const operation = repository[call.function.name];
            const raw = await withinDeadline(() => operation(args, timing), deadline, clock);
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
              summary: raw.truncated
                ? "Repository tool execution completed with bounded truncated output escrowed."
                : "Repository tool execution completed with bounded output escrowed.",
              evidenceRefs: [`broker:${request.sessionId}`],
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
        if (raw.truncated === true) {
          eventCounter += 1;
          await appendBrokerEvent(dependencies, request.sessionId, eventCounter, "tool_output_truncated", {
            toolCallId: call.id, cycleId: plan.cycleId, decisionId: decision.decisionId,
          }, timing);
        }
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
    await appendBrokerEvent(dependencies, request.sessionId, eventCounter, boundedError(error instanceof Error ? error.message : "tool_session_failed"), {}, terminalTiming);
    throw new Error(boundedError(error instanceof Error ? error.message : "tool_session_failed"));
  }
}
