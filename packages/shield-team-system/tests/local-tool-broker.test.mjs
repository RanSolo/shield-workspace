import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DAISY_TOOL_DEFINITIONS,
  LOCAL_TOOL_LIMITS,
  probeLocalToolModel,
  runLocalToolSession,
} from "../scripts/model/local-tool-broker.mjs";

const revisionId = "0123456789012345678901234567890123456789";
const artifactRevisionId = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

async function findRg() {
  const candidates = (process.env.PATH ?? "").split(":").filter(Boolean).map((directory) => join(directory, "rg"));
  candidates.push("/Applications/ChatGPT.app/Contents/Resources/rg");
  for (const candidate of candidates) {
    try { await access(candidate, fsConstants.X_OK); return candidate; }
    catch { /* continue */ }
  }
  throw new Error("rg_test_dependency_missing");
}

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

function modelResponse({ trained = true, instances = ["ornith-instance"] } = {}) {
  return {
    models: [{
      key: "ornith", loaded_instances: instances.map((id) => ({ id })),
      capabilities: { trained_for_tool_use: trained },
    }],
  };
}

function toolCallResponse(argumentsJson = '{"path":"visible.txt"}') {
  return {
    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call:1", type: "function", function: { name: "readFile", arguments: argumentsJson } }] } }],
  };
}

function finalResponse() {
  return { choices: [{ message: { role: "assistant", content: "Repository reconnaissance completed.\nEvidence remains bounded." } }] };
}

function repeatedSlotResponse() {
  return {
    choices: [{ message: { role: "assistant", content: null, tool_calls: [
      { id: "call:1", type: "function", function: { name: "readFile", arguments: '{"path":"visible.txt"}' } },
      { id: "call:2", type: "function", function: { name: "readFile", arguments: '{"path":"visible.txt"}' } },
    ] } }],
  };
}

function callsResponse(calls) {
  return { choices: [{ message: { role: "assistant", content: null, tool_calls: calls } }] };
}

function call(id, name = "readFile", args = '{"path":"visible.txt"}') {
  return { id, type: "function", function: { name, arguments: args } };
}

function binding(root) {
  return {
    bindingSchemaVersion: 1, bindingId: "runtime-binding:daisy", bindingVersion: 1,
    missionId: "mission:issue-34", subjectId: "issue:34", missionRevisionId: revisionId,
    seatId: "daisy", reasoningRuntimeId: "ornith-instance", toolExecutorId: "executor:local-broker",
    repositoryId: "repo:shield", canonicalWritableRoot: root, branch: "issue-34", artifactRevisionId,
    recordedAtSequence: 4, activeThroughSequence: null, lifecycleState: "active",
    approvedScope: {
      actionIds: ["repository.read_file"], effectClasses: ["verification"],
      effectKeys: ["effect:issue-34:slot-1"], capabilities: ["filesystem_read"],
    },
    coulsonAuthorizationRef: "authorization:issue-34:1",
  };
}

function attestation(root, kind) {
  return {
    attestationSchemaVersion: 1, attestationId: `attestation:${kind}`, kind,
    hostId: "host:local", toolExecutorId: "executor:local-broker", repositoryId: "repo:shield",
    canonicalWritableRoot: root, capabilityId: kind === "capability" ? "filesystem_read" : null,
    observedValue: kind === "repository_root" ? root : true,
    observedAt: "2026-07-20T04:00:00Z", expiresAt: "2026-07-20T04:10:00Z",
  };
}

function permissionContext(root, overrides = {}) {
  return {
    permissionContractVersion: 1, journalSchemaVersion: 6,
    missionId: "mission:issue-34", subjectId: "issue:34", missionRevisionId: revisionId,
    artifactRevisionId, evaluatedThroughSequence: 5, reasoningRuntimeId: "ornith-instance",
    toolExecutorId: "executor:local-broker", repositoryId: "repo:shield", canonicalWritableRoot: root,
    branch: "issue-34", requiredCapabilities: ["filesystem_read"], activeBindings: [binding(root)],
    attestations: [attestation(root, "repository_root"), attestation(root, "writability"), attestation(root, "capability")],
    evaluatedAt: "2026-07-20T04:05:00Z", decisionId: "decision:broker:1", ...overrides,
  };
}

function plan() {
  return {
    runnerContractVersion: 1, cycleId: "cycle:issue-34:slot-1", missionId: "mission:issue-34",
    subjectId: "issue:34", revisionId, evaluatedThroughSequence: 5, seatId: "daisy",
    activatedModes: [{ modeId: "debugger", modeVersion: "1.0.0", seatId: "daisy", activationSource: "mission-brief" }],
    actionId: "repository.read_file", effectClass: "verification", effectKey: "effect:issue-34:slot-1",
    validationId: "validation:issue-34:slot-1", stopCondition: "after_one_cycle",
  };
}

function request(root) {
  return {
    baseUrl: "http://127.0.0.1:1234", model: "ornith", systemPrompt: "Recon only.",
    userPrompt: "Read visible.txt and report.", sessionId: "session:issue-34:1",
    repositoryRoot: root,
  };
}

function dependencies(root, fetchImpl, overrides = {}) {
  const ledger = [];
  const events = [];
  const appendIfAbsent = async (record) => {
    if (ledger.some((item) => item.recordId === record.recordId)) return { appended: false };
    ledger.push(record);
    return {
      schemaVersion: 1, ledgerId: record.ledgerId, recordId: record.recordId,
      decisionId: record.decisionId, digest: record.digest, appended: true,
      ledgerSequence: ledger.length - 1,
    };
  };
  return {
    ledger, events, ledgerId: "ledger:issue-34", repositoryId: "repo:shield",
    toolExecutorId: "executor:local-broker",
    getRgExecutable: findRg, monotonicNow: () => Date.now(),
    fetchImpl, nextCallSlot: async () => plan(),
    getAuthorizationContext: async () => permissionContext(root),
    getExecutionContext: async () => permissionContext(root), appendIfAbsent,
    nextResultRecordId: () => "audit:result:issue-34:1", now: () => "2026-07-20T04:06:00Z",
    appendBrokerEvent: async (event) => { events.push(event); return { eventId: event.eventId, appended: true }; },
    ...overrides,
  };
}

test("defines exactly the three closed Phase 1 tools", () => {
  assert.deepEqual(DAISY_TOOL_DEFINITIONS.map((item) => item.function.name), ["readFile", "listFiles", "searchRepo"]);
  for (const item of DAISY_TOOL_DEFINITIONS) assert.equal(item.function.parameters.additionalProperties, false);
});

test("capability probe exact-matches one loaded tool-trained instance and rejects unsafe endpoints", async () => {
  const fetchImpl = async () => jsonResponse(modelResponse());
  assert.deepEqual(await probeLocalToolModel({ baseUrl: "http://127.0.0.1:1234", model: "ornith", fetchImpl }), {
    origin: "http://127.0.0.1:1234", loadedInstanceId: "ornith-instance",
  });
  await assert.rejects(() => probeLocalToolModel({ baseUrl: "http://example.com", model: "ornith", fetchImpl }), /lm_probe_input_invalid/u);
  await assert.rejects(() => probeLocalToolModel({ baseUrl: "http://127.0.0.1:1234", model: "ornith", fetchImpl: async () => jsonResponse(modelResponse({ trained: false })) }), /lm_tool_model_unavailable/u);
  await assert.rejects(() => probeLocalToolModel({ baseUrl: "http://127.0.0.1:1234", model: "ornith", fetchImpl: async () => jsonResponse(modelResponse({ instances: ["a", "b"] })) }), /lm_tool_model_unavailable/u);
});

test("capability probe enforces its inference timeout", async () => {
  const fetchImpl = async (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  await assert.rejects(() => probeLocalToolModel({ baseUrl: "http://127.0.0.1:1234", model: "ornith", fetchImpl, timeoutMs: 5 }), /lm_request_timeout/u);
});

test("tool session consumes one fresh permission and releases raw output only after completed result audit", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-session-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "visible.txt"), "bounded evidence\n", "utf8");
  const requests = [];
  const responses = [modelResponse(), toolCallResponse(), finalResponse()];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return jsonResponse(responses.shift());
  };
  const deps = dependencies(await realpath(root), fetchImpl);
  const result = await runLocalToolSession(request(root), deps);
  assert.equal(result.attribution, "untrusted_model_output");
  assert.match(result.message, /\nEvidence remains bounded\./u);
  assert.equal(result.completedToolCalls, 1);
  assert.equal(deps.ledger.length, 3);
  assert.deepEqual(deps.ledger.map((item) => item.recordType), ["permission.decision", "tool.invocation", "tool.result"]);
  assert.equal(JSON.stringify(deps.ledger).includes("bounded evidence"), false);
  assert.equal(requests[1].url, "http://127.0.0.1:1234/v1/chat/completions");
  assert.equal(requests[1].options.redirect, "error");
  const followup = JSON.parse(requests[2].options.body);
  assert.match(followup.messages.at(-1).content, /bounded evidence/u);
});

test("malformed duplicate arguments fail before authorization and emit one non-sensitive broker event", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-malformed-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "visible.txt"), "evidence\n", "utf8");
  const responses = [modelResponse(), toolCallResponse('{"path":"visible.txt","path":"other.txt"}')];
  const deps = dependencies(await realpath(root), async () => jsonResponse(responses.shift()));
  await assert.rejects(() => runLocalToolSession(request(root), deps), /json_duplicate_key/u);
  assert.equal(deps.ledger.length, 0);
  assert.equal(deps.events.length, 1);
  assert.equal(JSON.stringify(deps.events).includes("visible.txt"), false);
});

test("authority root mismatch fails closed before permission audit or filesystem access", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-root-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "visible.txt"), "evidence\n", "utf8");
  const responses = [modelResponse(), toolCallResponse()];
  const canonicalRoot = await realpath(root);
  const deps = dependencies(canonicalRoot, async () => jsonResponse(responses.shift()), {
    getAuthorizationContext: async () => permissionContext(canonicalRoot, { canonicalWritableRoot: "/different/root" }),
  });
  await assert.rejects(() => runLocalToolSession(request(root), deps), /authority_context_identity_mismatch/u);
  assert.equal(deps.ledger.length, 0);
  assert.equal(deps.events.length, 1);
});

test("raw output is withheld when the result audit receipt fails", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-audit-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "visible.txt"), "must stay escrowed\n", "utf8");
  const requests = [];
  const responses = [modelResponse(), toolCallResponse()];
  const base = dependencies(await realpath(root), async (url, options) => { requests.push({ url, options }); return jsonResponse(responses.shift()); });
  const originalAppend = base.appendIfAbsent;
  base.appendIfAbsent = async (record) => record.recordType === "tool.result" ? { appended: false } : originalAppend(record);
  await assert.rejects(() => runLocalToolSession(request(root), base), /tool_result_not_releasable/u);
  assert.equal(requests.length, 2);
  assert.equal(JSON.stringify(requests).includes("must stay escrowed"), false);
  assert.equal(base.events.length, 1);
});

test("capability failure is durably recorded before tools are advertised", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-capability-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const canonicalRoot = await realpath(root);
  const deps = dependencies(canonicalRoot, async () => jsonResponse(modelResponse({ trained: false })));
  await assert.rejects(() => runLocalToolSession(request(root), deps), /lm_tool_model_unavailable/u);
  assert.equal(deps.ledger.length, 0);
  assert.equal(deps.events.length, 1);
  assert.equal(deps.events[0].code, "lm_tool_model_unavailable");
});

test("a reused authority slot preflights the entire response before any invocation", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-slot-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "visible.txt"), "first call only\n", "utf8");
  const responses = [modelResponse(), repeatedSlotResponse()];
  const deps = dependencies(await realpath(root), async () => jsonResponse(responses.shift()));
  await assert.rejects(() => runLocalToolSession(request(root), deps), /authority_slot_reused/u);
  assert.equal(deps.ledger.length, 0);
  assert.equal(deps.events.length, 1);
});

test("broker event receipt failure stops the session fail closed", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-event-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const responses = [modelResponse(), toolCallResponse('{"path":"a","path":"b"}')];
  const deps = dependencies(await realpath(root), async () => jsonResponse(responses.shift()), {
    appendBrokerEvent: async (event) => ({ eventId: event.eventId, appended: false }),
  });
  await assert.rejects(() => runLocalToolSession(request(root), deps), /broker_event_receipt_invalid/u);
  assert.equal(deps.ledger.length, 0);
});

test("an invalid later call preflights the entire response before authorization", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-preflight-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "visible.txt"), "evidence\n", "utf8");
  for (const badCalls of [
    [call("call:1"), call("call:1")],
    [call("call:1"), call("call:2", "deleteRepo")],
  ]) {
    const responses = [modelResponse(), callsResponse(badCalls)];
    const deps = dependencies(await realpath(root), async () => jsonResponse(responses.shift()));
    await assert.rejects(() => runLocalToolSession(request(root), deps), /tool_call_id_reused|tool_unknown/u);
    assert.equal(deps.ledger.length, 0);
  }
});

test("tool-call cap rejects the whole batch before authorization", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-call-cap-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const responses = [modelResponse(), callsResponse(Array.from({ length: 17 }, (_, index) => call(`call:${index + 1}`)))];
  const deps = dependencies(await realpath(root), async () => jsonResponse(responses.shift()));
  await assert.rejects(() => runLocalToolSession(request(root), deps), /tool_call_cap_reached/u);
  assert.equal(deps.ledger.length, 0);
});

test("identity and capability substitutions fail before permission audit", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-substitution-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "visible.txt"), "evidence\n", "utf8");
  const canonicalRoot = await realpath(root);
  for (const changed of [
    { reasoningRuntimeId: "substituted-runtime" },
    { toolExecutorId: "executor:substituted" },
    { requiredCapabilities: ["filesystem_write"] },
  ]) {
    const responses = [modelResponse(), toolCallResponse()];
    const deps = dependencies(canonicalRoot, async () => jsonResponse(responses.shift()), {
      getAuthorizationContext: async () => permissionContext(canonicalRoot, changed),
    });
    await assert.rejects(() => runLocalToolSession(request(root), deps), /authority_context_(?:identity|capability)_mismatch/u);
    assert.equal(deps.ledger.length, 0);
  }
});

test("truncated output is explicit in both the result audit and broker event", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-truncated-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "visible.txt"), `${"x".repeat(70_000)}\n`, "utf8");
  const responses = [modelResponse(), toolCallResponse(), finalResponse()];
  const deps = dependencies(await realpath(root), async () => jsonResponse(responses.shift()));
  await runLocalToolSession(request(root), deps);
  assert.match(deps.ledger.find((item) => item.recordType === "tool.result").summary, /truncated/u);
  assert.equal(deps.events.some((event) => event.code === "tool_output_truncated"), true);
});

test("session deadline covers setup before inference or authorization", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-deadline-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  let tick = 0;
  const deps = dependencies(await realpath(root), async () => { throw new Error("fetch_must_not_run"); }, {
    monotonicNow: () => tick++ === 0 ? 0 : LOCAL_TOOL_LIMITS.sessionTimeoutMs + 1,
  });
  await assert.rejects(() => runLocalToolSession(request(root), deps), /tool_session_timeout/u);
  assert.equal(deps.ledger.length, 0);
});

test("durable invocation consumption prevents replay after broker restart", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-restart-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "visible.txt"), "evidence\n", "utf8");
  let responses = [modelResponse(), toolCallResponse(), finalResponse()];
  const deps = dependencies(await realpath(root), async () => jsonResponse(responses.shift()));
  await runLocalToolSession(request(root), deps);
  responses = [modelResponse(), toolCallResponse()];
  await assert.rejects(() => runLocalToolSession(request(root), deps), /audit_receipt_mismatch/u);
  assert.equal(deps.ledger.length, 3);
});

test("round cap terminates a non-final tool loop", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-round-cap-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "visible.txt"), "evidence\n", "utf8");
  const canonicalRoot = await realpath(root);
  const effectKeys = Array.from({ length: LOCAL_TOOL_LIMITS.rounds }, (_, index) => `effect:issue-34:slot-${index + 1}`);
  const wideBinding = { ...binding(canonicalRoot), approvedScope: { ...binding(canonicalRoot).approvedScope, effectKeys } };
  const planAt = (index) => ({ ...plan(), cycleId: `cycle:issue-34:slot-${index}`, effectKey: `effect:issue-34:slot-${index}` });
  const contextAt = (index) => permissionContext(canonicalRoot, { decisionId: `decision:broker:${index}`, activeBindings: [wideBinding] });
  let slot = 0;
  const responses = [modelResponse(), ...effectKeys.map((_, index) => callsResponse([call(`call:${index + 1}`)]) )];
  const deps = dependencies(canonicalRoot, async () => jsonResponse(responses.shift()), {
    nextCallSlot: async () => planAt(++slot),
    getAuthorizationContext: async (currentPlan) => contextAt(Number(currentPlan.cycleId.split("-").at(-1))),
    getExecutionContext: async (decision) => contextAt(Number(decision.cycleId.split("-").at(-1))),
    nextResultRecordId: (decision) => `audit:result:${decision.decisionId}`,
  });
  await assert.rejects(() => runLocalToolSession(request(root), deps), /tool_round_cap_reached/u);
  assert.equal(deps.ledger.length, LOCAL_TOOL_LIMITS.rounds * 3);
});
