import assert from "node:assert/strict";
import test from "node:test";

import * as receipt from "../dist/seat-dispatch-receipt-v1.mjs";
import * as roles from "../dist/role-taxonomy-v1.mjs";

const DISPATCHABLE_SEATS = [...roles.DISPATCHABLE_ROLE_IDS];
const HUMAN_SEATS = [...roles.HUMAN_GATE_ROLE_IDS];

const BASE_REVISION = {
  mission: "abcdef1234567890abcdef1234567890abcdef12",
  subject: "1234567890abcdef1234567890abcdef12345678",
  artifact: "abcdef1234567890abcdef1234567890abcdef12",
  repository: "0ff3aa1c8d3e1f4a9c7b5e2d1f3a4c6b7d9e0f12",
};

const RUNTIME_CONFIG = { kind: "runtime.configured", runtimeId: "runtime-1", model: "model:demo" };
const RUNTIME_REQUESTED = { kind: "runtime.requested", runtimeId: "runtime-1", model: "model:demo" };
const RUNTIME_SELF_UNAVAILABLE = { kind: "runtime.self_report.unavailable", reason: "not_reported" };
const RUNTIME_HOST_UNAVAILABLE = { kind: "runtime.host_observed.unavailable", reason: "unobserved" };
const EXECUTOR_SELF_UNAVAILABLE = { kind: "executor.self_report.unavailable", reason: "not_reported" };
const EXECUTOR_HOST_UNAVAILABLE = { kind: "executor.host_observed.unavailable", reason: "not_observed" };

function baseIdentity(overrides = {}) {
  return {
    receiptId: "receipt-1",
    dispatchId: "dispatch-1",
    parentMissionId: "mission-1",
    parentMissionRevision: BASE_REVISION.mission,
    parentSessionId: "session-1",
    repositoryRevision: BASE_REVISION.repository,
    childTaskId: "task-1",
    childSessionId: "child-session-1",
    accountableSeatId: "may",
    repositoryId: "repo-1",
    repositoryWorkspaceId: "workspace-1",
    subjectId: "subject-1",
    subjectRevision: BASE_REVISION.subject,
    artifactId: "artifact-1",
    artifactRevision: BASE_REVISION.artifact,
    configuredRuntime: { ...RUNTIME_CONFIG },
    requestedRuntime: { ...RUNTIME_REQUESTED },
    toolExecution: { kind: "tool.execution.not_requested", reason: "not_requested" },
    runtimeSelfReport: { ...RUNTIME_SELF_UNAVAILABLE },
    runtimeHostObserved: { ...RUNTIME_HOST_UNAVAILABLE },
    executorSelfReport: { ...EXECUTOR_SELF_UNAVAILABLE },
    executorHostObserved: { ...EXECUTOR_HOST_UNAVAILABLE },
    inputEvidenceRefs: [],
    timestamp: "2026-07-29T12:00:00.000Z",
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
    ...overrides,
  };
}

function started(overrides = {}) {
  return receipt.createSeatDispatchStartedEventV1(baseIdentity(overrides));
}

function identityPayload(reference) {
  return {
    receiptId: reference.receiptId,
    dispatchId: reference.dispatchId,
    parentMissionId: reference.parentMissionId,
    parentMissionRevision: reference.parentMissionRevision,
    parentSessionId: reference.parentSessionId,
    repositoryRevision: reference.repositoryRevision,
    childTaskId: reference.childTaskId,
    childSessionId: reference.childSessionId,
    accountableSeatId: reference.accountableSeatId,
    repositoryId: reference.repositoryId,
    repositoryWorkspaceId: reference.repositoryWorkspaceId,
    subjectId: reference.subjectId,
    subjectRevision: reference.subjectRevision,
    artifactId: reference.artifactId,
    artifactRevision: reference.artifactRevision,
    configuredRuntime: reference.configuredRuntime,
    requestedRuntime: reference.requestedRuntime,
    toolExecution: reference.toolExecution,
    runtimeSelfReport: reference.runtimeSelfReport,
    runtimeHostObserved: reference.runtimeHostObserved,
    executorSelfReport: reference.executorSelfReport,
    executorHostObserved: reference.executorHostObserved,
  };
}

function stepEvent(previous, overrides = {}) {
  const nextTimestamp = overrides.timestamp ?? new Date(Date.parse(previous.timestamp) + 1000).toISOString();
  return receipt.createSeatDispatchLifecycleEventV1({
    ...identityPayload(previous),
    kind: "dispatch.interrupted",
    timestamp: nextTimestamp,
    logSequence: previous.logSequence + 1,
    previousLogDigest: previous.entryDigest,
    lifecycleSequence: previous.lifecycleSequence + 1,
    previousLifecycleDigest: previous.entryDigest,
    ...overrides,
  });
}

function replay(entries) {
  return receipt.replaySeatDispatchReceiptsV1(entries);
}

function attribution(overrides = {}, replayResult = undefined, rawReceiptEntries = []) {
  const artifact = freezeArtifact("candidate");
  return {
    evaluation: receipt.evaluateSeatDispatchAttributionV1({
      ...baseIdentity(overrides),
      artifact,
      ...(replayResult ? { replayResult } : { rawReceiptEntries }),
    }),
    artifact,
  };
}

function freezeArtifact(label) {
  return Object.freeze({ marker: "artifact", label });
}

function proxyFrom(value, onGet) {
  let getCalls = 0;
  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      getCalls += 1;
      if (onGet) onGet(property, target, receiver);
      return Reflect.get(target, property, receiver);
    },
  });
  return { proxy, getCalls: () => getCalls };
}

test("dispatchable seats are accepted and human seats are rejected", () => {
  for (const seat of DISPATCHABLE_SEATS) {
    const event = started({ accountableSeatId: seat });
    assert.equal(event.accountableSeatId, seat);
  }
  for (const seat of HUMAN_SEATS) {
    assert.throws(() => started({ accountableSeatId: seat }));
  }
});

test("configured/requested/runtime/executor sources remain structurally distinct", () => {
  assert.throws(() => started({ runtimeSelfReport: { kind: "runtime.host_observed.unavailable", reason: "unobserved" } }));
  assert.throws(() => started({ runtimeHostObserved: { kind: "runtime.self_report.unavailable", reason: "not_reported" } }));
  assert.throws(() => started({ executorHostObserved: { kind: "executor.self_report.unavailable", reason: "not_reported" } }));
  assert.throws(() => started({ requestedRuntime: { kind: "runtime.configured", runtimeId: "runtime-1", model: "model:demo" } }));
});

test("repository revision uses repository grammar and is immutable in projections", () => {
  const hexStarted = started({ parentMissionRevision: "abcde12", subjectRevision: BASE_REVISION.subject, repositoryRevision: "1".repeat(40), artifactRevision: BASE_REVISION.artifact });
  assert.equal(hexStarted.repositoryRevision.length, 40);
  assert.throws(() => started({ repositoryRevision: "not-a-revision" }));

  const start = started();
  const completed = stepEvent(start, {
    kind: "dispatch.completed",
    outputEvidenceRefs: ["artifact-evidence-1"],
  });
  const result = replay([start, completed]);
  assert.equal(result.state, "valid");
  assert.equal(result.projections[0].repositoryRevision, BASE_REVISION.repository);
  assert.equal(result.projections[0].inputEvidenceRefs.length, 0);
});

test("input evidence is start-only and terminal output evidence is terminal-only", () => {
  assert.throws(() => started({ inputEvidenceRefs: undefined }));
  assert.throws(() => started({ inputEvidenceRefs: "input-1" }));
  const start = started({ inputEvidenceRefs: ["input-1"] });
  assert.throws(() => stepEvent(start, { inputEvidenceRefs: ["fail"] }));

  assert.throws(() => stepEvent(start, {
    kind: "dispatch.completed",
    timestamp: "2026-07-29T12:00:01.000Z",
  }));
  assert.throws(() => receipt.createSeatDispatchLifecycleEventV1({
    ...identityPayload(start),
    kind: "dispatch.interrupted",
    logSequence: 1,
    previousLogDigest: start.entryDigest,
    lifecycleSequence: 1,
    previousLifecycleDigest: start.entryDigest,
    timestamp: "2026-07-29T12:00:01.000Z",
    outputEvidenceRefs: ["artifact-output"],
  }));
});

test("receipt-id/dispatch-id mapping is enforced from both directions", () => {
  const first = started();
  const dispatchReuse = started({
    receiptId: "receipt-2",
    dispatchId: "dispatch-1",
    logSequence: 1,
    previousLogDigest: first.entryDigest,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
  const byReceipt = replay([first, dispatchReuse]);
  assert.equal(byReceipt.state, "invalid");
  assert.equal(byReceipt.code, "receipt_dispatch_collision");

  const receiptReuse = started({
    receiptId: "receipt-1",
    dispatchId: "dispatch-2",
    logSequence: 1,
    previousLogDigest: first.entryDigest,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
    childTaskId: "task-2",
    childSessionId: "child-session-2",
  });
  const byDispatch = replay([first, receiptReuse]);
  assert.equal(byDispatch.state, "invalid");
  assert.equal(byDispatch.code, "duplicate_start");
});

test("dispatch map allows same model/seat and same child identities across distinct seats", () => {
  const startedOne = started({ receiptId: "receipt-1", dispatchId: "dispatch-1", timestamp: "2026-07-29T12:00:00.000Z" });
  const startedTwoSameSeat = started({
    receiptId: "receipt-2",
    dispatchId: "dispatch-2",
    accountableSeatId: "may",
    logSequence: 1,
    timestamp: "2026-07-29T12:00:00.100Z",
    previousLogDigest: startedOne.entryDigest,
    childSessionId: "child-session-2",
    childTaskId: "task-2",
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
  const startedThreeOtherSeat = started({
    receiptId: "receipt-3",
    dispatchId: "dispatch-3",
    accountableSeatId: "fury",
    logSequence: 2,
    timestamp: "2026-07-29T12:00:00.200Z",
    previousLogDigest: startedTwoSameSeat.entryDigest,
    childSessionId: "child-session-3",
    childTaskId: "task-3",
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });

  const data = replay([startedOne, startedTwoSameSeat, startedThreeOtherSeat]);
  assert.equal(data.state, "valid");
  assert.equal(data.projections.length, 3);
});

test("observation history appends repeated same runtime/executor identities and rejects drift", () => {
  const interruptedRuntime = { kind: "runtime.host_observed", runtimeId: "runtime-1", model: "model:demo", evidenceRefs: ["host-1"] };
  const interruptedExecutor = { kind: "executor.host_observed", executorId: "executor-1", evidenceRefs: ["exec-1"] };
  const start = started({
    runtimeHostObserved: interruptedRuntime,
    executorHostObserved: interruptedExecutor,
  });
  const interrupted = stepEvent(start, {
    kind: "dispatch.interrupted",
    runtimeSelfReport: { kind: "runtime.self_report.observed", runtimeId: "runtime-1", model: "model:demo", evidenceRefs: ["self-1"] },
    executorSelfReport: { kind: "executor.self_report.observed", executorId: "executor-1", evidenceRefs: ["exec-self-1"] },
  });
  const resumed = stepEvent(interrupted, {
    kind: "dispatch.resumed",
    runtimeHostObserved: interruptedRuntime,
    executorHostObserved: interruptedExecutor,
  });
  const complete = stepEvent(resumed, {
    kind: "dispatch.completed",
    outputEvidenceRefs: ["artifact-output"],
    runtimeHostObserved: interruptedRuntime,
    executorHostObserved: interruptedExecutor,
    runtimeSelfReport: { kind: "runtime.self_report.observed", runtimeId: "runtime-1", model: "model:demo", evidenceRefs: ["self-2"] },
    executorSelfReport: { kind: "executor.self_report.observed", executorId: "executor-1", evidenceRefs: ["exec-self-2"] },
  });
  const result = replay([start, interrupted, resumed, complete]);
  assert.equal(result.state, "valid");
  assert.equal(result.projections[0].runtimeHostHistory.length, 4);
  assert.equal(result.projections[0].executorHostHistory.length, 4);
  assert.equal(result.projections[0].runtimeSelfReportHistory.length, 3);
  assert.equal(result.projections[0].executorSelfReportHistory.length, 3);

  const bad = stepEvent(interrupted, {
    kind: "dispatch.resumed",
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: "runtime-2", model: "model:demo", evidenceRefs: ["host-2"] },
    executorHostObserved: interruptedExecutor,
  });
  const conflicting = replay([start, interrupted, bad]);
  assert.equal(conflicting.state, "invalid");
  assert.equal(conflicting.code, "identity_mismatch");
});

test("uninterrupted completion accepts terminal runtime/executor observations while preserving pre-start gaps", () => {
  const complete = stepEvent(started(), {
    kind: "dispatch.completed",
    runtimeSelfReport: { kind: "runtime.self_report.observed", runtimeId: "runtime-1", model: "model:demo", evidenceRefs: ["self-terminal"] },
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: "runtime-1", model: "model:demo", evidenceRefs: ["host-terminal"] },
    executorSelfReport: { kind: "executor.self_report.observed", executorId: "executor-1", evidenceRefs: ["exec-self-terminal"] },
    executorHostObserved: { kind: "executor.host_observed", executorId: "executor-1", evidenceRefs: ["exec-terminal"] },
    outputEvidenceRefs: ["artifact-output"],
  });
  const result = replay([started(), complete]);
  assert.equal(result.state, "valid");
  assert.equal(result.projections[0].runtimeSelfReportHistory.length, 1);
  assert.equal(result.projections[0].runtimeHostHistory.length, 1);
  assert.equal(result.projections[0].executorSelfReportHistory.length, 1);
  assert.equal(result.projections[0].executorHostHistory.length, 1);
});

test("global and lifecycle chains reject regressions and continuity violations", () => {
  const start = started();
  const interrupted = stepEvent(start, { kind: "dispatch.interrupted" });

  const badTransition = stepEvent(start, { kind: "dispatch.resumed" });
  assert.equal(replay([start, badTransition]).state, "invalid");

  const badTimestamp = stepEvent(interrupted, {
    kind: "dispatch.completed",
    timestamp: "2026-07-29T12:00:00.500Z",
    outputEvidenceRefs: ["artifact-output"],
  });
  assert.equal(replay([start, interrupted, badTimestamp]).state, "invalid");

  const interrupted2 = stepEvent(start, {
    kind: "dispatch.interrupted",
    logSequence: start.logSequence + 2,
    previousLogDigest: start.entryDigest,
  });
  assert.equal(replay([start, interrupted2]).code, "global_sequence_gap");

  const badGlobalDigest = stepEvent(interrupted, {
    kind: "dispatch.completed",
    previousLogDigest: "sha256:" + "a".repeat(43),
    outputEvidenceRefs: ["artifact-output"],
  });
  const withBadGlobal = replay([start, interrupted, badGlobalDigest]);
  assert.equal(withBadGlobal.state, "invalid");
  assert.equal(withBadGlobal.code, "global_previous_digest");

  const badLifecycleDigest = stepEvent(started(), {
    kind: "dispatch.interrupted",
    previousLifecycleDigest: "sha256:" + "a".repeat(43),
  });
  const withBadLifecycle = replay([started(), badLifecycleDigest]);
  assert.equal(withBadLifecycle.state, "invalid");
  assert.equal(withBadLifecycle.code, "lifecycle_previous_digest");
});

test("terminal states are terminal and never attribute", () => {
  const start = started();
  const interrupted = stepEvent(start, { kind: "dispatch.interrupted", runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: "runtime-1", model: "model:demo", evidenceRefs: ["runtime"] } });
  const failed = stepEvent(interrupted, { kind: "dispatch.failed", outputEvidenceRefs: ["fail"] });
  const failedResult = replay([start, interrupted, failed]);
  assert.equal(failedResult.state, "valid");

  const failedPost = stepEvent(failed, {
    kind: "dispatch.failed",
    outputEvidenceRefs: ["fail-post"],
    timestamp: "2026-07-29T12:00:04.000Z",
  });
  assert.equal(replay([start, interrupted, failed, failedPost]).code, "post_terminal");

  const { evaluation: failedAttribution } = attribution({}, undefined, [start, interrupted, failed]);
  assert.equal(failedAttribution.state, "unattributed");
  assert.equal(failedAttribution.reasonCodes.includes("non_terminal_lifecycle"), true);

  const cancelled = stepEvent(interrupted, { kind: "dispatch.cancelled", outputEvidenceRefs: ["cancel"] });
  const { evaluation: cancelledAttribution } = attribution({}, undefined, [start, interrupted, cancelled]);
  assert.equal(cancelledAttribution.state, "unattributed");
  assert.equal(cancelledAttribution.reasonCodes.includes("non_terminal_lifecycle"), true);
});

test("attribution requires canonical host evidence, exact replay, and preserves artifact reference", () => {
  const start = started({
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: "runtime-1", model: "model:demo", evidenceRefs: ["runtime"] },
  });
  const complete = stepEvent(start, {
    kind: "dispatch.completed",
    outputEvidenceRefs: ["artifact-output"],
  });
  const validEntries = [start, complete];
  const validReplay = replay(validEntries);
  assert.equal(validReplay.state, "valid");

  const { evaluation: attributed, artifact } = attribution({}, undefined, validEntries);
  assert.equal(attributed.state, "attributed");
  assert.strictEqual(attributed.artifact, artifact);

  const missingRuntime = receipt.createSeatDispatchStartedEventV1(baseIdentity({ runtimeHostObserved: RUNTIME_HOST_UNAVAILABLE }));
  const missingRuntimeComplete = stepEvent(missingRuntime, { kind: "dispatch.completed", outputEvidenceRefs: ["artifact-output"] });
  const { evaluation: missingRuntimeAttribution, artifact: missingArtifact } = attribution({}, undefined, [missingRuntime, missingRuntimeComplete]);
  assert.equal(missingRuntimeAttribution.state, "unattributed");
  assert.strictEqual(missingRuntimeAttribution.artifact, missingArtifact);
  assert.equal(missingRuntimeAttribution.reasonCodes.includes("missing_runtime_observation"), true);

  const requestedStart = started({
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "executor-binding-1" },
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: "runtime-1", model: "model:demo", evidenceRefs: ["runtime"] },
  });
  const requestedNoExecutor = stepEvent(requestedStart, { kind: "dispatch.completed", outputEvidenceRefs: ["artifact-output"] });
  const requestedMissingExecutor = attribution({}, undefined, [requestedStart, requestedNoExecutor]);
  assert.equal(requestedMissingExecutor.evaluation.state, "unattributed");
  assert.equal(requestedMissingExecutor.evaluation.reasonCodes.includes("missing_executor_observation"), true);
  assert.strictEqual(requestedMissingExecutor.evaluation.artifact, requestedMissingExecutor.artifact);

  const { evaluation: forgedReplayResult } = attribution({}, {
    ...validReplay,
    projections: validReplay.state === "valid" ? validReplay.projections.map((projection) => ({
      ...projection,
      runtimeHostHistory: [],
    })) : [],
  });
  assert.equal(forgedReplayResult.state, "attributed");
});

test("attribution reasons from identity collisions and repository mismatch", () => {
  const start = started();
  const complete = stepEvent(start, { kind: "dispatch.completed", outputEvidenceRefs: ["artifact-output"] });
  const repositoryRevisionMismatch = attribution({ repositoryRevision: "1".repeat(7) }, undefined, [start, complete]);
  assert.equal(repositoryRevisionMismatch.evaluation.state, "unattributed");
  assert.equal(repositoryRevisionMismatch.evaluation.reasonCodes.includes("stale_repository_revision"), true);
  assert.strictEqual(repositoryRevisionMismatch.evaluation.artifact, repositoryRevisionMismatch.artifact);

  const wrongChildSession = attribution({ childSessionId: "different-child-session" }, undefined, [start, complete]);
  assert.equal(wrongChildSession.evaluation.state, "unattributed");
  assert.equal(wrongChildSession.evaluation.reasonCodes.includes("wrong_child_session"), true);
  assert.strictEqual(wrongChildSession.evaluation.artifact, wrongChildSession.artifact);

  const malformed = attribution({}, undefined, { not: "an array" });
  assert.equal(malformed.evaluation.state, "unattributed");
  assert.equal(malformed.evaluation.reasonCodes[0], "malformed_raw_log");
  assert.strictEqual(malformed.evaluation.artifact, malformed.artifact);
});

test("hostile objects, proxies, and revoked references fail closed without trap side effects", () => {
  let accessorCalls = 0;
  const accessor = baseIdentity();
  Object.defineProperty(accessor, "receiptId", {
    enumerable: true,
    get() {
      accessorCalls += 1;
      return "receipt-1";
    },
  });
  assert.throws(() => receipt.createSeatDispatchStartedEventV1(accessor));
  assert.equal(accessorCalls, 0);

  const sparse = [];
  sparse[1] = stepEvent(started(), { kind: "dispatch.completed", outputEvidenceRefs: ["artifact-output"] });
  assert.equal(replay(sparse).state, "invalid");

  const symbolBacked = baseIdentity();
  symbolBacked[Symbol("backdoor")] = "boom";
  const symbolResult = replay([symbolBacked]);
  assert.equal(symbolResult.state, "invalid");

  const nonEnum = {};
  Object.defineProperty(nonEnum, "receiptId", { enumerable: false, value: "receipt-1" });
  assert.throws(() => receipt.createSeatDispatchStartedEventV1(nonEnum));

  const hostile = Object.defineProperties({}, {
    kind: { value: "dispatch.started", enumerable: true },
    receiptId: { value: "receipt-1", enumerable: true },
    dispatchId: { value: "dispatch-1", enumerable: true },
    parentMissionId: { value: "mission-1", enumerable: true },
    parentMissionRevision: { value: BASE_REVISION.mission, enumerable: true },
    parentSessionId: { value: "session-1", enumerable: true },
    repositoryRevision: { value: BASE_REVISION.repository, enumerable: true },
    childTaskId: { value: "task-1", enumerable: true },
    childSessionId: { value: "child-session-1", enumerable: true },
    accountableSeatId: { value: "may", enumerable: true },
    repositoryId: { value: "repo-1", enumerable: true },
    repositoryWorkspaceId: { value: "workspace-1", enumerable: true },
    subjectId: { value: "subject-1", enumerable: true },
    subjectRevision: { value: BASE_REVISION.subject, enumerable: true },
    artifactId: { value: "artifact-1", enumerable: true },
    artifactRevision: { value: BASE_REVISION.artifact, enumerable: true },
    configuredRuntime: { value: { ...RUNTIME_CONFIG }, enumerable: true },
    requestedRuntime: { value: { ...RUNTIME_REQUESTED }, enumerable: true },
    toolExecution: { value: { kind: "tool.execution.not_requested", reason: "not_requested" }, enumerable: true },
    runtimeSelfReport: { value: { ...RUNTIME_SELF_UNAVAILABLE }, enumerable: true },
    runtimeHostObserved: { value: { ...RUNTIME_HOST_UNAVAILABLE }, enumerable: true },
    executorSelfReport: { value: { ...EXECUTOR_SELF_UNAVAILABLE }, enumerable: true },
    executorHostObserved: { value: { ...EXECUTOR_HOST_UNAVAILABLE }, enumerable: true },
    timestamp: { value: "2026-07-29T12:00:00.000Z", enumerable: true },
    logSequence: { value: 0, enumerable: true },
    previousLogDigest: { value: null, enumerable: true },
    lifecycleSequence: { value: 0, enumerable: true },
    previousLifecycleDigest: { value: null, enumerable: true },
    inputEvidenceRefs: { value: [], enumerable: true },
    schemaVersion: { value: 1, enumerable: true },
    contractVersion: { value: "shield.seat-dispatch.event.v1", enumerable: true },
  });
  assert.equal(replay([hostile]).state, "invalid");
  const proxy = proxyFrom(hostile);
  assert.equal(replay([proxy.proxy]).state, "invalid");
  assert.equal(proxy.getCalls(), 0);

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  assert.equal(replay([revoked.proxy]).state, "invalid");

  const { evaluation: proxyAttr } = attribution({}, { state: "valid", entries: [revoked.proxy], projections: [] });
  assert.equal(proxyAttr.state, "unattributed");
  assert.equal(proxyAttr.reasonCodes[0], "malformed_raw_log");

  assert.throws(() => started({ logSequence: Number.NaN }));
});
