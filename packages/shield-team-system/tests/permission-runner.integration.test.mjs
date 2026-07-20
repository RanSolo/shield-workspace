import assert from "node:assert/strict";
import test from "node:test";

import { createAuditedExecutor, createPermissionAuthorizer } from "../dist/permission-v1.mjs";
import { replayPermissionAuditLedger } from "../dist/permission-audit-v1.mjs";
import { runRunnerCycle } from "../dist/runner-v1.mjs";

const revisionId = "0123456789012345678901234567890123456789";
const artifactRevisionId = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
const mode = { modeId: "delivery", modeVersion: "1.0.0", seatId: "may", activationSource: "mission-brief" };

function plan() {
  return { runnerContractVersion: 1, cycleId: "cycle:permission:1", missionId: "mission:issue-10", subjectId: "issue:10", revisionId, evaluatedThroughSequence: 5, seatId: "may", activatedModes: [mode], actionId: "edit-permission-boundary", effectClass: "behavioral_implementation", effectKey: "effect:issue-10:permission", validationId: "validation:permission:1", stopCondition: "after_one_cycle" };
}

function binding() {
  return { bindingSchemaVersion: 1, bindingId: "runtime-binding:may", bindingVersion: 1, missionId: "mission:issue-10", subjectId: "issue:10", missionRevisionId: revisionId, seatId: "may", reasoningRuntimeId: "runtime:ornith:may", toolExecutorId: "executor:codex-host", repositoryId: "repo:shield", canonicalWritableRoot: "/workspace/shield", branch: "benchmark", artifactRevisionId, recordedAtSequence: 4, activeThroughSequence: null, lifecycleState: "active", approvedScope: { actionIds: ["edit-permission-boundary"], effectClasses: ["behavioral_implementation"], effectKeys: ["effect:issue-10:permission"], capabilities: ["filesystem_write"] }, coulsonAuthorizationRef: "authorization:runtime:1" };
}

function attestation(kind) {
  return { attestationSchemaVersion: 1, attestationId: `attestation:${kind}`, kind, hostId: "host:codex", toolExecutorId: "executor:codex-host", repositoryId: "repo:shield", canonicalWritableRoot: "/workspace/shield", capabilityId: kind === "capability" ? "filesystem_write" : null, observedValue: kind === "repository_root" ? "/workspace/shield" : true, observedAt: "2026-07-20T02:00:00Z", expiresAt: "2026-07-20T02:10:00Z" };
}

function context(overrides = {}) {
  return { permissionContractVersion: 1, journalSchemaVersion: 6, missionId: "mission:issue-10", subjectId: "issue:10", missionRevisionId: revisionId, artifactRevisionId, evaluatedThroughSequence: 5, reasoningRuntimeId: "runtime:ornith:may", toolExecutorId: "executor:codex-host", repositoryId: "repo:shield", canonicalWritableRoot: "/workspace/shield", branch: "benchmark", requiredCapabilities: ["filesystem_write"], activeBindings: [binding()], attestations: [attestation("repository_root"), attestation("writability"), attestation("capability")], evaluatedAt: "2026-07-20T02:05:00Z", decisionId: "decision:permission:1", ...overrides };
}

function input() {
  return {
    runnerContractVersion: 1,
    projection: { runnerContractVersion: 1, journalSchemaVersion: 6, missionId: "mission:issue-10", subjectId: "issue:10", revisionId, evaluatedThroughSequence: 5, governanceState: "approved", missionAuthorizationState: "authorized", executionStatus: "running", executeReadiness: "ready", participantSeatIds: ["coulson", "fitz", "hill", "may"], activatedModes: [mode], effectRecords: [] },
    resolvedModeContext: { runnerContractVersion: 1, seatId: "may", modes: [mode] },
    actionAllowlist: ["edit-permission-boundary"],
    plan: plan(),
  };
}

function validatorResult() {
  return { runnerContractVersion: 1, outcome: "passed", missionId: "mission:issue-10", subjectId: "issue:10", revisionId, evaluatedThroughSequence: 5, cycleId: "cycle:permission:1", validationId: "validation:permission:1", effectKey: "effect:issue-10:permission", summary: "Focused validation passed." };
}

test("runner v6 dispatches exactly once through fresh permission and preserves truthful audit attribution", async () => {
  const ledger = [];
  const appendIfAbsent = (record) => {
    if (ledger.some(({ recordId }) => recordId === record.recordId)) return { appended: false };
    ledger.push(record);
    return { schemaVersion: 1, ledgerId: record.ledgerId, recordId: record.recordId, decisionId: record.decisionId, digest: record.digest, appended: true, ledgerSequence: ledger.length - 1 };
  };
  const authorize = createPermissionAuthorizer({ ledgerId: "ledger:permission:integration", getContext: () => context(), appendIfAbsent });
  let invocations = 0;
  const execute = createAuditedExecutor({
    ledgerId: "ledger:permission:integration",
    getContext: () => context(), appendIfAbsent,
    execute: () => { invocations += 1; return { runnerContractVersion: 1, outcome: "completed", missionId: "mission:issue-10", subjectId: "issue:10", revisionId, evaluatedThroughSequence: 5, cycleId: "cycle:permission:1", seatId: "may", actionId: "edit-permission-boundary", effectClass: "behavioral_implementation", effectKey: "effect:issue-10:permission", summary: "Implementation completed.", evidenceRefs: ["test:permission-integration"] }; },
    nextRecordId: () => "audit:result:permission:1", now: () => "2026-07-20T02:06:00Z",
  });
  const result = await runRunnerCycle(input(), { authorize, execute, validate: validatorResult });
  assert.equal(result.state, "valid", result.errors?.join(" "));
  assert.equal(result.value.outcome, "advanced");
  assert.equal(result.value.effectRecordCandidate.journalSchemaVersion, 6);
  assert.equal(invocations, 1);
  assert.equal(ledger.length, 3);
  assert.equal(replayPermissionAuditLedger(ledger).state, "valid");
  assert.deepEqual(ledger.map(({ seatId, reasoningRuntimeId, toolExecutorId }) => ({ seatId, reasoningRuntimeId, toolExecutorId })), [
    { seatId: "may", reasoningRuntimeId: "runtime:ornith:may", toolExecutorId: "executor:codex-host" },
    { seatId: "may", reasoningRuntimeId: "runtime:ornith:may", toolExecutorId: "executor:codex-host" },
    { seatId: "may", reasoningRuntimeId: "runtime:ornith:may", toolExecutorId: "executor:codex-host" },
  ]);
});

test("runner v6 does not invoke the tool when the fresh executor binding is substituted", async () => {
  const appendIfAbsent = (record) => ({ schemaVersion: 1, ledgerId: record.ledgerId, recordId: record.recordId, decisionId: record.decisionId, digest: record.digest, appended: true, ledgerSequence: 0 });
  const authorize = createPermissionAuthorizer({ ledgerId: "ledger:permission:integration", getContext: () => context(), appendIfAbsent });
  let invocations = 0;
  const execute = createAuditedExecutor({ ledgerId: "ledger:permission:integration", getContext: () => context({ reasoningRuntimeId: "runtime:substituted" }), appendIfAbsent, execute: () => { invocations += 1; }, nextRecordId: () => "audit:result:substituted", now: () => "2026-07-20T02:06:00Z" });
  const result = await runRunnerCycle(input(), { authorize, execute, validate: validatorResult });
  assert.equal(result.state, "valid");
  assert.equal(result.value.outcome, "stopped");
  assert.equal(invocations, 0);
});
