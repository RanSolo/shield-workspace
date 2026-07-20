import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuditedExecutor,
  createPermissionAuthorizer,
} from "../dist/permission-v1.mjs";
import {
  computePermissionAuditRecordDigest,
  validatePermissionAuditAppendReceipt,
} from "../dist/permission-audit-v1.mjs";
import { runRunnerCycle, validateRunnerCycleResult } from "../dist/runner-v1.mjs";

const missionRevisionId = "0123456789012345678901234567890123456789";
const artifactRevisionId = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

const plan = {
  runnerContractVersion: 1,
  cycleId: "cycle:issue-10:integration",
  missionId: "mission:issue-10",
  subjectId: "issue:10",
  revisionId: missionRevisionId,
  evaluatedThroughSequence: 7,
  seatId: "may",
  activatedModes: [],
  actionId: "implement-permission-boundary",
  effectClass: "behavioral_implementation",
  effectKey: "effect:issue-10:integration",
  validationId: "validation:issue-10:integration",
  stopCondition: "after_one_cycle",
};

function runnerInput() {
  return {
    runnerContractVersion: 1,
    projection: {
      runnerContractVersion: 1,
      journalSchemaVersion: 6,
      missionId: plan.missionId,
      subjectId: plan.subjectId,
      revisionId: plan.revisionId,
      evaluatedThroughSequence: plan.evaluatedThroughSequence,
      governanceState: "approved",
      missionAuthorizationState: "authorized",
      executionStatus: "running",
      executeReadiness: "ready",
      participantSeatIds: ["may"],
      activatedModes: [],
      effectRecords: [],
    },
    resolvedModeContext: { runnerContractVersion: 1, seatId: "may", modes: [] },
    actionAllowlist: [plan.actionId],
    plan,
  };
}

function binding() {
  return {
    bindingSchemaVersion: 1,
    bindingId: "runtime-binding:may",
    bindingVersion: 1,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    missionRevisionId,
    seatId: "may",
    reasoningRuntimeId: "runtime:may-local",
    toolExecutorId: "executor:codex-host",
    repositoryId: "github:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    branch: "codex/issue-10-permission-boundary",
    artifactRevisionId,
    recordedAtSequence: 6,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: [plan.actionId],
      effectClasses: [plan.effectClass],
      effectKeys: [plan.effectKey],
      capabilities: ["filesystem.write"],
    },
    coulsonAuthorizationRef: "runtime-authorization:may:1",
  };
}

function attestation(kind) {
  return {
    attestationSchemaVersion: 1,
    attestationId: `attestation:${kind}`,
    kind,
    hostId: "host:codex",
    toolExecutorId: "executor:codex-host",
    repositoryId: "github:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    capabilityId: kind === "capability" ? "filesystem.write" : null,
    observedValue: kind === "repository_root" ? "/workspace/shield-workspace" : true,
    observedAt: "2026-07-19T19:59:00Z",
    expiresAt: "2026-07-19T20:01:00Z",
  };
}

function context() {
  return {
    permissionContractVersion: 1,
    journalSchemaVersion: 6,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    missionRevisionId,
    artifactRevisionId,
    evaluatedThroughSequence: plan.evaluatedThroughSequence,
    reasoningRuntimeId: "runtime:may-local",
    toolExecutorId: "executor:codex-host",
    repositoryId: "github:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    branch: "codex/issue-10-permission-boundary",
    requiredCapabilities: ["filesystem.write"],
    activeBindings: [binding()],
    attestations: [attestation("repository_root"), attestation("writability"), attestation("capability")],
    evaluatedAt: "2026-07-19T20:00:00Z",
    decisionId: "decision:issue-10:integration",
  };
}

function appendReceipt(record, ledgerSequence, overrides = {}) {
  return {
    schemaVersion: 1,
    authority: "non_authoritative",
    ledgerId: "permission-ledger:issue-10",
    recordId: record.recordId,
    decisionId: record.decisionId,
    recordDigest: computePermissionAuditRecordDigest(record),
    ledgerSequence,
    status: "appended",
    ...overrides,
  };
}

function executorResult() {
  return {
    runnerContractVersion: 1,
    outcome: "completed",
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    revisionId: plan.revisionId,
    evaluatedThroughSequence: plan.evaluatedThroughSequence,
    cycleId: plan.cycleId,
    seatId: plan.seatId,
    actionId: plan.actionId,
    effectClass: plan.effectClass,
    effectKey: plan.effectKey,
    summary: "The bound executor completed the scoped tool call.",
    evidenceRefs: ["artifact:issue-10:integration"],
  };
}

function validatorResult() {
  return {
    runnerContractVersion: 1,
    outcome: "passed",
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    revisionId: plan.revisionId,
    evaluatedThroughSequence: plan.evaluatedThroughSequence,
    cycleId: plan.cycleId,
    validationId: plan.validationId,
    effectKey: plan.effectKey,
    summary: "The scoped effect is verified.",
  };
}

test("permission authorizer and audited executor preserve pre-call order and truthful three-identity evidence", async () => {
  const calls = [];
  const records = [];
  const append = (record) => {
    calls.push(`audit:${record.recordType}`);
    records.push(record);
    const receipt = appendReceipt(record, records.length - 1);
    const checked = validatePermissionAuditAppendReceipt(receipt, record);
    assert.equal(checked.state, "valid", JSON.stringify(checked));
    return receipt;
  };
  const authorize = createPermissionAuthorizer({
    getContext: () => { calls.push("context:permission"); return context(); },
    appendAuditIfAbsent: append,
  });
  const execute = createAuditedExecutor({
    execute: (_plan, decision) => {
      calls.push("executor");
      assert.ok(Object.isFrozen(decision));
      assert.ok(Object.isFrozen(decision.authorizationArtifact));
      assert.deepEqual(
        {
          seatId: decision.authorizationArtifact.payload.seatId,
          reasoningRuntimeId: decision.authorizationArtifact.payload.reasoningRuntimeId,
          toolExecutorId: decision.authorizationArtifact.payload.toolExecutorId,
        },
        { seatId: "may", reasoningRuntimeId: "runtime:may-local", toolExecutorId: "executor:codex-host" },
      );
      return executorResult();
    },
    getContext: () => { calls.push("context:result"); return context(); },
    appendAuditIfAbsent: append,
    nextRecordId: () => "audit:tool-result:issue-10:integration",
    now: () => "2026-07-19T20:00:01Z",
  });

  const result = await runRunnerCycle(runnerInput(), {
    authorize,
    execute,
    validate: () => { calls.push("validator"); return validatorResult(); },
  });

  assert.equal(result.state, "valid", result.errors?.join(" "));
  assert.equal(result.value.outcome, "advanced");
  assert.equal(result.value.effectRecordCandidate.journalSchemaVersion, 6);
  assert.equal(validateRunnerCycleResult(result.value).state, "valid");
  assert.deepEqual(calls, [
    "context:permission",
    "audit:permission.decision",
    "context:result",
    "executor",
    "audit:tool.result",
    "validator",
  ]);
  assert.equal(calls.filter((call) => call === "executor").length, 1);
  assert.deepEqual(records.map(({ recordType }) => recordType), ["permission.decision", "tool.result"]);
  for (const record of records) {
    assert.equal(record.authority, "non_authoritative");
    assert.equal(record.seatId, "may");
    assert.equal(record.reasoningRuntimeId, "runtime:may-local");
    assert.equal(record.toolExecutorId, "executor:codex-host");
    assert.equal(record.bindingId, "runtime-binding:may");
    assert.equal(record.bindingVersion, 1);
  }
});

test("an unverifiable pre-call audit receipt fails closed before the executor", async () => {
  let executorCalls = 0;
  const authorize = createPermissionAuthorizer({
    getContext: () => context(),
    appendAuditIfAbsent: (record) => appendReceipt(record, 0, { recordDigest: "sha256:wrong" }),
  });
  const result = await runRunnerCycle(runnerInput(), {
    authorize,
    execute: () => { executorCalls += 1; return executorResult(); },
    validate: () => validatorResult(),
  });

  assert.equal(result.state, "valid");
  assert.equal(result.value.outcome, "stopped");
  assert.equal(result.value.reason, "authorization_failed");
  assert.equal(result.value.effectRecordCandidate, null);
  assert.equal(executorCalls, 0);
});
