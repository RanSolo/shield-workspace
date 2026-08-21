import assert from "node:assert/strict";
import test from "node:test";

import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
  replaySeatDispatchReceiptsV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";
import {
  FEATURE_FLIGHT_RELAY_CONTRACT_VERSION,
  FEATURE_FLIGHT_RELAY_MAX_BYTES,
  FEATURE_FLIGHT_RELAY_NEXT_ACTION,
  FEATURE_FLIGHT_RELAY_REQUESTED_OBSERVATION,
  canonicalFeatureFlightRelayBytesV1,
  createFeatureFlightRelayEntryV1,
  createFeatureFlightRelayFromSeatDispatchV1,
  createFeatureFlightRelayV1,
  featureFlightRelayDigestV1,
  inspectFeatureFlightRelaysV1,
  reconcileFeatureFlightRelayEntryV1,
  replayFeatureFlightRelayLedgerV1,
  validateFeatureFlightRelayEntryV1,
  validateFeatureFlightRelayV1,
} from "../scripts/operations/feature-flight-relay.mjs";

const REVISION = "4".repeat(40);

function identity(overrides = {}) {
  return {
    receiptId: "receipt:248:1",
    dispatchId: "dispatch:248:1",
    parentMissionId: "mission:issue-248-slice-1",
    parentMissionRevision: REVISION,
    parentSessionId: "session:248:parent",
    childTaskId: "task:248:may",
    childSessionId: "session:248:may",
    accountableSeatId: "may",
    repositoryId: "repo:shield-workspace",
    repositoryWorkspaceId: "workspace:issue-248",
    repositoryRevision: REVISION,
    subjectId: "issue:248",
    subjectRevision: REVISION,
    artifactId: "artifact:issue-248-slice-1",
    artifactRevision: REVISION,
    configuredRuntime: { kind: "runtime.configured", runtimeId: "runtime:codex", model: "model:gpt-5" },
    requestedRuntime: { kind: "runtime.requested", runtimeId: "runtime:codex", model: "model:gpt-5" },
    toolExecution: { kind: "tool.execution.not_requested", reason: "not_requested" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: { kind: "runtime.host_observed.unavailable", reason: "unobserved" },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: { kind: "executor.host_observed.unavailable", reason: "not_observed" },
    ...overrides,
  };
}

function started(overrides = {}) {
  return createSeatDispatchStartedEventV1({
    ...identity(overrides),
    inputEvidenceRefs: ["evidence:wheels-up:248"],
    timestamp: "2026-08-20T12:00:00.000Z",
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
}

function lifecycle(previous, kind, overrides = {}) {
  const source = identity({
    receiptId: previous.receiptId,
    dispatchId: previous.dispatchId,
    parentMissionId: previous.parentMissionId,
    parentMissionRevision: previous.parentMissionRevision,
    parentSessionId: previous.parentSessionId,
    childTaskId: previous.childTaskId,
    childSessionId: previous.childSessionId,
    accountableSeatId: previous.accountableSeatId,
    repositoryId: previous.repositoryId,
    repositoryWorkspaceId: previous.repositoryWorkspaceId,
    repositoryRevision: previous.repositoryRevision,
    subjectId: previous.subjectId,
    subjectRevision: previous.subjectRevision,
    artifactId: previous.artifactId,
    artifactRevision: previous.artifactRevision,
    configuredRuntime: previous.configuredRuntime,
    requestedRuntime: previous.requestedRuntime,
    toolExecution: previous.toolExecution,
    runtimeSelfReport: previous.runtimeSelfReport,
    runtimeHostObserved: previous.runtimeHostObserved,
    executorSelfReport: previous.executorSelfReport,
    executorHostObserved: previous.executorHostObserved,
  });
  const event = {
    ...source,
    kind,
    timestamp: new Date(Date.parse(previous.timestamp) + 1000).toISOString(),
    logSequence: previous.logSequence + 1,
    previousLogDigest: previous.entryDigest,
    lifecycleSequence: previous.lifecycleSequence + 1,
    previousLifecycleDigest: previous.entryDigest,
    ...overrides,
  };
  if (["dispatch.completed", "dispatch.failed", "dispatch.cancelled"].includes(kind)) event.outputEvidenceRefs = ["evidence:terminal:248"];
  return createSeatDispatchLifecycleEventV1(event);
}

function creationInput(overrides = {}) {
  const source = identity();
  return {
    repositoryRoot: "/repository/issue-248",
    receiptId: source.receiptId,
    dispatchId: source.dispatchId,
    parentMissionId: source.parentMissionId,
    parentMissionRevision: source.parentMissionRevision,
    parentSessionId: source.parentSessionId,
    childTaskId: source.childTaskId,
    childSessionId: source.childSessionId,
    sourceAccountableSeatId: source.accountableSeatId,
    repositoryId: source.repositoryId,
    repositoryWorkspaceId: source.repositoryWorkspaceId,
    repositoryRevision: source.repositoryRevision,
    subjectId: source.subjectId,
    subjectRevision: source.subjectRevision,
    artifactId: source.artifactId,
    artifactRevision: source.artifactRevision,
    recipientSeatId: "hill",
    recipientLaneId: "lane:issue-248",
    recipientControllerIdentity: "controller:hill:issue-248",
    requestedObservation: FEATURE_FLIGHT_RELAY_REQUESTED_OBSERVATION,
    ...overrides,
  };
}

function dependencies(entries, replay = replaySeatDispatchReceiptsV1(entries)) {
  return {
    readSeatDispatchReceiptLedgerV1: async () => ({ state: "valid", value: { entries } }),
    replaySeatDispatchReceiptsV1: () => replay,
  };
}

async function relayFrom(kind = "dispatch.completed", inputOverrides = {}) {
  const start = started();
  const terminal = lifecycle(start, kind);
  const result = await createFeatureFlightRelayFromSeatDispatchV1(creationInput(inputOverrides), dependencies([start, terminal]));
  assert.equal(result.state, "valid", result.reasonCodes?.join(" "));
  return { relay: result.value, entries: [start, terminal] };
}

test("derives a compact canonical authority-none relay from each exact terminal dispatch kind", async () => {
  const relays = [];
  for (const kind of ["dispatch.completed", "dispatch.failed", "dispatch.cancelled"]) {
    const { relay } = await relayFrom(kind);
    relays.push(relay);
    assert.equal(relay.kind, "relay.pending");
    assert.equal(relay.authority, "none");
    assert.equal(relay.contractVersion, FEATURE_FLIGHT_RELAY_CONTRACT_VERSION);
    assert.equal(relay.terminal.kind, kind);
    assert.equal(relay.source.sourceAccountableSeatId, "may");
    assert.equal(relay.recipient.seatId, "hill");
    assert.ok(canonicalFeatureFlightRelayBytesV1(relay).length <= FEATURE_FLIGHT_RELAY_MAX_BYTES);
    assert.equal(validateFeatureFlightRelayV1(relay).state, "valid");
  }
  assert.equal(new Set(relays.map((relay) => relay.relayId)).size, 3);
});

test("binds the exact ordered terminal/source/recipient tuple and remains byte stable", async () => {
  const { relay } = await relayFrom();
  const rebuilt = createFeatureFlightRelayV1({
    requestedObservation: relay.requestedObservation,
    recipient: { controllerIdentity: relay.recipient.controllerIdentity, laneId: relay.recipient.laneId, seatId: relay.recipient.seatId },
    terminal: { lifecycleSequence: relay.terminal.lifecycleSequence, logSequence: relay.terminal.logSequence, entryDigest: relay.terminal.entryDigest, kind: relay.terminal.kind },
    source: Object.fromEntries(Object.entries(relay.source).reverse()),
  });
  assert.equal(rebuilt.relayId, relay.relayId);
  assert.deepEqual(canonicalFeatureFlightRelayBytesV1(rebuilt), canonicalFeatureFlightRelayBytesV1(relay));

  const changed = createFeatureFlightRelayV1({
    source: relay.source,
    terminal: relay.terminal,
    recipient: { ...relay.recipient, laneId: "lane:other" },
    requestedObservation: relay.requestedObservation,
  });
  assert.notEqual(changed.relayId, relay.relayId);
  assert.throws(() => createFeatureFlightRelayV1({ ...{
    source: relay.source, terminal: relay.terminal, recipient: relay.recipient, requestedObservation: relay.requestedObservation,
  }, prompt: "wake the controller" }), /fields are not closed/u);
  assert.equal(canonicalFeatureFlightRelayBytesV1(relay).includes(Buffer.from("evidence:terminal:248")), false);
});

test("accepts only an exact single terminal replay projection and matching lastEntryDigest", async () => {
  const start = started();
  for (const kind of ["dispatch.started", "dispatch.interrupted", "dispatch.resumed"]) {
    const entries = kind === "dispatch.started" ? [start] : kind === "dispatch.interrupted"
      ? [start, lifecycle(start, kind)]
      : (() => { const interrupted = lifecycle(start, "dispatch.interrupted"); return [start, interrupted, lifecycle(interrupted, kind)]; })();
    const result = await createFeatureFlightRelayFromSeatDispatchV1(creationInput(), dependencies(entries));
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "terminal_source_required");
  }

  const terminal = lifecycle(start, "dispatch.completed");
  const validReplay = replaySeatDispatchReceiptsV1([start, terminal]);
  const ambiguous = await createFeatureFlightRelayFromSeatDispatchV1(creationInput(), dependencies([start, terminal], {
    ...validReplay,
    projections: [validReplay.projections[0], structuredClone(validReplay.projections[0])],
  }));
  assert.equal(ambiguous.code, "terminal_source_ambiguous");

  const missingEntry = await createFeatureFlightRelayFromSeatDispatchV1(creationInput(), dependencies([start, terminal], {
    ...validReplay,
    entries: [start],
  }));
  assert.equal(missingEntry.code, "terminal_source_ambiguous");

  const malformed = await createFeatureFlightRelayFromSeatDispatchV1(creationInput(), dependencies([start, terminal], {
    state: "invalid", code: "digest_mismatch", reasonCodes: [],
  }));
  assert.equal(malformed.code, "source_replay_invalid");
});

test("rejects every stale source identity and recipient mismatch", async () => {
  const mismatches = {
    receiptId: "receipt:other", dispatchId: "dispatch:other", parentMissionId: "mission:other",
    parentMissionRevision: "5".repeat(40), parentSessionId: "session:other", childTaskId: "task:other",
    childSessionId: "child-session:other", sourceAccountableSeatId: "daisy", repositoryId: "repo:other",
    repositoryWorkspaceId: "workspace:other", repositoryRevision: "6".repeat(40), subjectId: "issue:other",
    subjectRevision: "7".repeat(40), artifactId: "artifact:other", artifactRevision: "8".repeat(40),
  };
  const start = started();
  const terminal = lifecycle(start, "dispatch.failed");
  for (const [field, value] of Object.entries(mismatches)) {
    const result = await createFeatureFlightRelayFromSeatDispatchV1(creationInput({ [field]: value }), dependencies([start, terminal]));
    assert.equal(result.code, "terminal_source_ambiguous", field);
  }
  const badSeat = await createFeatureFlightRelayFromSeatDispatchV1(creationInput({ recipientSeatId: "may" }), dependencies([start, terminal]));
  assert.equal(badSeat.code, "malformed_input");

  const { relay } = await relayFrom();
  const entry = createFeatureFlightRelayEntryV1({ logSequence: 0, previousLogDigest: null, relay });
  const mismatch = replayFeatureFlightRelayLedgerV1([entry], { ...relay.recipient, laneId: "lane:other" });
  assert.equal(mismatch.code, "recipient_mismatch");
});

test("rejects unknown fields, unsupported observation, accessors, and proxies without invoking them", async () => {
  const start = started();
  const terminal = lifecycle(start, "dispatch.cancelled");
  const unknown = await createFeatureFlightRelayFromSeatDispatchV1({ ...creationInput(), done: true }, dependencies([start, terminal]));
  assert.equal(unknown.code, "malformed_input");
  const prose = await createFeatureFlightRelayFromSeatDispatchV1(creationInput({ requestedObservation: "PACKET_COMPLETE" }), dependencies([start, terminal]));
  assert.equal(prose.code, "malformed_input");
  let accesses = 0;
  const accessor = creationInput();
  Object.defineProperty(accessor, "receiptId", { enumerable: true, get() { accesses += 1; return "receipt:forged"; } });
  assert.equal((await createFeatureFlightRelayFromSeatDispatchV1(accessor, dependencies([start, terminal]))).code, "malformed_input");
  assert.equal(accesses, 0);
  const proxy = new Proxy(creationInput(), { get() { accesses += 1; throw new Error("executed"); } });
  assert.equal((await createFeatureFlightRelayFromSeatDispatchV1(proxy, dependencies([start, terminal]))).code, "malformed_input");
  assert.equal(accesses, 0);
});

test("replays only one pending lifecycle entry and projects await_delivery_binding", async () => {
  const { relay } = await relayFrom();
  const entry = createFeatureFlightRelayEntryV1({ logSequence: 0, previousLogDigest: null, relay });
  assert.equal(validateFeatureFlightRelayEntryV1(entry).state, "valid");
  const replay = replayFeatureFlightRelayLedgerV1([entry]);
  assert.equal(replay.state, "valid");
  assert.equal(replay.inspection.pending[0].lifecycleState, "pending");
  assert.equal(replay.inspection.pending[0].nextAction, FEATURE_FLIGHT_RELAY_NEXT_ACTION);
  assert.equal(replay.inspection.pending[0].repositoryRevision, REVISION);
  assert.equal(replay.inspection.pending[0].authority, "none");
  assert.equal(inspectFeatureFlightRelaysV1([entry]).pending.length, 1);

  const retry = reconcileFeatureFlightRelayEntryV1([entry], entry);
  assert.equal(retry.state, "duplicate");
  assert.equal(retry.appended, false);
  assert.equal(replayFeatureFlightRelayLedgerV1([entry, entry]).code, "duplicate_event");

  const conflictRelay = createFeatureFlightRelayV1({
    source: relay.source,
    terminal: relay.terminal,
    recipient: { ...relay.recipient, controllerIdentity: "controller:hill:other" },
    requestedObservation: relay.requestedObservation,
  });
  const conflict = createFeatureFlightRelayEntryV1({ logSequence: 1, previousLogDigest: entry.entryDigest, relay: conflictRelay });
  assert.equal(reconcileFeatureFlightRelayEntryV1([entry], conflict).code, "conflicting_reuse");
});

test("canonical helper rejects unsafe values", () => {
  assert.throws(() => featureFlightRelayDigestV1({ number: 0.5 }), /safe integers/u);
  assert.equal(validateFeatureFlightRelayV1(new Proxy({}, {})).state, "invalid");
});
