import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuditedExecutor,
  createPermissionAuthorizer,
  evaluatePermission,
  validateHostPermissionAttestation,
  validatePermissionAuthorizationArtifactPayload,
  validatePermissionInvocationContext,
  validateRuntimeBinding,
} from "../dist/permission-v1.mjs";
import {
  createPermissionAuditRecord,
  replayPermissionAuditLedger,
  validatePermissionAuditRecord,
} from "../dist/permission-audit-v1.mjs";

const revisionId = "0123456789012345678901234567890123456789";
const artifactRevisionId = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

function plan(overrides = {}) {
  return {
    runnerContractVersion: 1,
    cycleId: "cycle:issue-10:1",
    missionId: "mission:issue-10",
    subjectId: "issue:10",
    revisionId,
    evaluatedThroughSequence: 5,
    seatId: "may",
    activatedModes: [],
    actionId: "edit-permission-boundary",
    effectClass: "behavioral_implementation",
    effectKey: "effect:issue-10:permission",
    validationId: "validation:issue-10",
    stopCondition: "after_one_cycle",
    ...overrides,
  };
}

function binding(overrides = {}) {
  return {
    bindingSchemaVersion: 1,
    bindingId: "runtime-binding:may",
    bindingVersion: 1,
    missionId: "mission:issue-10",
    subjectId: "issue:10",
    missionRevisionId: revisionId,
    seatId: "may",
    reasoningRuntimeId: "runtime:ornith:may",
    toolExecutorId: "executor:codex-host",
    repositoryId: "repo:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    branch: "codex/issue-10-shield-benchmark",
    artifactRevisionId,
    recordedAtSequence: 4,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: ["edit-permission-boundary"],
      effectClasses: ["behavioral_implementation"],
      effectKeys: ["effect:issue-10:permission"],
      capabilities: ["filesystem_write"],
    },
    coulsonAuthorizationRef: "authorization:runtime-binding:may:1",
    ...overrides,
  };
}

function attestation(kind, overrides = {}) {
  return {
    attestationSchemaVersion: 1,
    attestationId: `attestation:${kind}`,
    kind,
    hostId: "host:codex",
    toolExecutorId: "executor:codex-host",
    repositoryId: "repo:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    capabilityId: kind === "capability" ? "filesystem_write" : null,
    observedValue: kind === "repository_root" ? "/workspace/shield-workspace" : true,
    observedAt: "2026-07-20T02:00:00Z",
    expiresAt: "2026-07-20T02:10:00Z",
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    permissionContractVersion: 1,
    journalSchemaVersion: 6,
    missionId: "mission:issue-10",
    subjectId: "issue:10",
    missionRevisionId: revisionId,
    artifactRevisionId,
    evaluatedThroughSequence: 5,
    reasoningRuntimeId: "runtime:ornith:may",
    toolExecutorId: "executor:codex-host",
    repositoryId: "repo:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    branch: "codex/issue-10-shield-benchmark",
    requiredCapabilities: ["filesystem_write"],
    activeBindings: [binding()],
    attestations: [attestation("repository_root"), attestation("writability"), attestation("capability")],
    evaluatedAt: "2026-07-20T02:05:00Z",
    decisionId: "decision:issue-10:1",
    ...overrides,
  };
}

function receipt(record, ledgerSequence = 0) {
  return { schemaVersion: 1, recordId: record.recordId, digest: record.digest, appended: true, ledgerSequence };
}

test("closed binding, attestation, and context contracts reject authority drift", () => {
  assert.equal(validateRuntimeBinding(binding()).state, "valid");
  assert.equal(validateRuntimeBinding({ ...binding(), seatId: "coulson" }).state, "invalid");
  assert.equal(validateRuntimeBinding({ ...binding(), future: true }).state, "invalid");
  assert.equal(validateHostPermissionAttestation(attestation("capability")).state, "valid");
  assert.equal(validateHostPermissionAttestation({ ...attestation("writability"), capabilityId: "filesystem_write" }).state, "invalid");
  assert.equal(validatePermissionInvocationContext(context()).state, "valid");
  assert.equal(validatePermissionInvocationContext({ ...context(), journalSchemaVersion: 5 }).state, "invalid");
});

test("pure evaluator exact-matches all three identities, scope, revisions, and attestations", () => {
  assert.deepEqual(evaluatePermission(plan(), context()).outcome, "allow");
  for (const [change, reason] of [
    [{ reasoningRuntimeId: "runtime:other" }, "reasoning_runtime_mismatch"],
    [{ toolExecutorId: "executor:other" }, "tool_executor_mismatch"],
    [{ branch: "main" }, "branch_mismatch"],
    [{ evaluatedThroughSequence: 6 }, "journal_sequence_mismatch"],
    [{ artifactRevisionId: "1111111111111111111111111111111111111111" }, "revision_mismatch"],
  ]) assert.equal(evaluatePermission(plan(), context(change)).reasonCode, reason);
  assert.equal(evaluatePermission(plan({ actionId: "deploy" }), context()).reasonCode, "action_out_of_scope");
  assert.equal(evaluatePermission(plan(), context({ attestations: [] })).reasonCode, "attestation_missing");
  assert.equal(evaluatePermission(plan(), context({ evaluatedAt: "2026-07-20T02:11:00Z" })).reasonCode, "attestation_stale");
});

test("authorizer requires a matching atomic append receipt before returning allow and rejects reuse", async () => {
  const records = [];
  const authorize = createPermissionAuthorizer({
    getContext: () => context(),
    appendIfAbsent: (record) => { records.push(record); return receipt(record, records.length - 1); },
  });
  const decision = await authorize(plan());
  assert.equal(decision.outcome, "allow");
  assert.equal(records.length, 1);
  assert.equal(validatePermissionAuthorizationArtifactPayload(decision.authorizationArtifact.payload).state, "valid");
  await assert.rejects(authorize(plan()), /decision_reused/);

  const failed = createPermissionAuthorizer({ getContext: () => context({ decisionId: "decision:bad-receipt" }), appendIfAbsent: () => ({ appended: false }) });
  await assert.rejects(failed(plan()), /audit_receipt_mismatch/);
});

test("audited executor performs a fresh preflight and marks unverified result audit uncertain", async () => {
  const authorize = createPermissionAuthorizer({ getContext: () => context(), appendIfAbsent: (record) => receipt(record) });
  const decision = await authorize(plan());
  let calls = 0;
  const execute = createAuditedExecutor({
    getContext: () => context(),
    execute: () => { calls += 1; return { runnerContractVersion: 1, outcome: "completed", missionId: plan().missionId, subjectId: plan().subjectId, revisionId, evaluatedThroughSequence: 5, cycleId: plan().cycleId, seatId: "may", actionId: plan().actionId, effectClass: plan().effectClass, effectKey: plan().effectKey, summary: "Tool completed.", evidenceRefs: ["evidence:tool"] }; },
    appendIfAbsent: () => ({ appended: false }),
    nextRecordId: () => "audit-result:issue-10:1",
    now: () => "2026-07-20T02:06:00Z",
  });
  const result = await execute(plan(), decision);
  assert.equal(calls, 1);
  assert.equal(result.outcome, "uncertain");

  const stale = createAuditedExecutor({ ...{
    getContext: () => context({ branch: "main" }), execute: () => { calls += 1; }, appendIfAbsent: () => { throw new Error("must not append"); }, nextRecordId: () => "audit-result:stale", now: () => "2026-07-20T02:06:00Z",
  } });
  const before = calls;
  assert.equal((await stale(plan(), decision)).outcome, "failed");
  assert.equal(calls, before);
});

test("audit ledger is closed, digest-bound, append-only, and result-order aware", () => {
  const base = { recordId: "audit:decision:1", recordType: "permission.decision", recordedAt: "2026-07-20T02:05:00Z", decisionId: "decision:1", outcome: "allow", missionId: "mission:issue-10", subjectId: "issue:10", seatId: "may", reasoningRuntimeId: "runtime:ornith:may", toolExecutorId: "executor:codex-host", bindingId: "binding:may", bindingVersion: 1, repositoryId: "repo:shield", canonicalWritableRoot: "/workspace/shield", branch: "benchmark", revisionId, journalSequence: 5, actionId: "edit", effectClass: "behavioral_implementation", effectKey: "effect:edit", approvedScope: ["edit"], summary: null, evidenceRefs: ["attestation:1"] };
  const decision = createPermissionAuditRecord(base);
  const result = createPermissionAuditRecord({ ...base, recordId: "audit:result:1", recordType: "tool.result", outcome: "completed", summary: "Completed.", evidenceRefs: ["evidence:1"] });
  assert.equal(validatePermissionAuditRecord(decision).state, "valid");
  assert.equal(validatePermissionAuditRecord({ ...decision, branch: "other" }).state, "invalid");
  assert.equal(replayPermissionAuditLedger([decision, result]).state, "valid");
  assert.equal(replayPermissionAuditLedger([result]).state, "invalid");
  assert.equal(replayPermissionAuditLedger([decision, decision]).state, "invalid");
});
