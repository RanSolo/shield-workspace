import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuditedExecutor,
  createPermissionAuthorizer,
  createToolResultAuditRecord,
  evaluatePermission,
  validatePermissionAuthorizationArtifactPayload,
  validateHostPermissionAttestation,
  validatePermissionInvocationContext,
  validateRuntimeBinding,
} from "../dist/permission-v1.mjs";
import {
  computePermissionAuditRecordDigest,
  replayPermissionAuditLedger,
  validatePermissionAuditAppendReceipt,
  validatePermissionAuditRecord,
} from "../dist/permission-audit-v1.mjs";

const missionRevisionId = "0123456789012345678901234567890123456789";
const artifactRevisionId = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
const plan = {
  runnerContractVersion: 1,
  cycleId: "cycle:10:1",
  missionId: "mission:10",
  subjectId: "issue:10",
  revisionId: missionRevisionId,
  evaluatedThroughSequence: 7,
  seatId: "may",
  activatedModes: [],
  actionId: "implement-permission-boundary",
  effectClass: "behavioral_implementation",
  effectKey: "effect:issue-10:permission",
  validationId: "validation:issue-10:permission",
  stopCondition: "after_one_cycle",
};

function binding(overrides = {}) {
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
      actionIds: ["implement-permission-boundary"],
      effectClasses: ["behavioral_implementation"],
      effectKeys: [plan.effectKey],
      capabilities: ["filesystem.write"],
    },
    coulsonAuthorizationRef: "runtime-auth:10:1",
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
    repositoryId: "github:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    capabilityId: kind === "capability" ? "filesystem.write" : null,
    observedValue: kind === "repository_root" ? "/workspace/shield-workspace" : true,
    observedAt: "2026-07-19T19:59:00Z",
    expiresAt: "2026-07-19T20:01:00Z",
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    permissionContractVersion: 1,
    journalSchemaVersion: 6,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    missionRevisionId,
    artifactRevisionId,
    evaluatedThroughSequence: 7,
    reasoningRuntimeId: "runtime:may-local",
    toolExecutorId: "executor:codex-host",
    repositoryId: "github:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    branch: "codex/issue-10-permission-boundary",
    requiredCapabilities: ["filesystem.write"],
    activeBindings: [binding()],
    attestations: [attestation("repository_root"), attestation("writability"), attestation("capability")],
    evaluatedAt: "2026-07-19T20:00:00Z",
    decisionId: "decision:10:1",
    ...overrides,
  };
}

function receipt(record, overrides = {}) {
  return {
    schemaVersion: 1,
    authority: "non_authoritative",
    ledgerId: "permission-ledger:issue-10",
    recordId: record.recordId,
    decisionId: record.decisionId,
    recordDigest: computePermissionAuditRecordDigest(record),
    ledgerSequence: 0,
    status: "appended",
    ...overrides,
  };
}

test("pure evaluator allows an exact authoritative binding with fresh operational attestations", () => {
  assert.equal(validateRuntimeBinding(binding()).state, "valid");
  assert.equal(validatePermissionInvocationContext(context()).state, "valid");
  const result = evaluatePermission(plan, context());
  assert.equal(result.outcome, "allow");
  assert.equal(result.reasonCode, "permission_allowed");
  assert.deepEqual(result.attestationIds, ["attestation:capability", "attestation:repository_root", "attestation:writability"]);
});

test("identity, scope, freshness, and journal mismatches fail closed with deterministic reasons", () => {
  const cases = [
    [context({ activeBindings: [] }), "binding_missing"],
    [context({ activeBindings: [binding(), binding({ bindingId: "runtime-binding:duplicate" })] }), "binding_ambiguous"],
    [context({ reasoningRuntimeId: "runtime:substituted" }), "reasoning_runtime_mismatch"],
    [context({ toolExecutorId: "executor:other" }), "tool_executor_mismatch"],
    [context({ repositoryId: "github:RanSolo/other" }), "repository_mismatch"],
    [context({ canonicalWritableRoot: "/workspace/alias" }), "root_mismatch"],
    [context({ branch: "codex/other" }), "branch_mismatch"],
    [context({ artifactRevisionId: "9999999999999999999999999999999999999999" }), "revision_mismatch"],
    [context({ evaluatedThroughSequence: 8 }), "journal_sequence_mismatch"],
    [context({ activeBindings: [binding({ approvedScope: { ...binding().approvedScope, actionIds: ["other-action"] } })] }), "action_out_of_scope"],
    [context({ activeBindings: [binding({ approvedScope: { ...binding().approvedScope, effectClasses: ["verification"] } })] }), "effect_class_out_of_scope"],
    [context({ activeBindings: [binding({ approvedScope: { ...binding().approvedScope, effectKeys: ["effect:issue-10:other"] } })] }), "effect_key_out_of_scope"],
    [context({ requiredCapabilities: ["network.write"] }), "capability_out_of_scope"],
    [context({ attestations: [attestation("repository_root"), attestation("writability")] }), "attestation_missing"],
    [context({ attestations: [attestation("repository_root", { expiresAt: "2026-07-19T19:59:30Z" }), attestation("writability"), attestation("capability")] }), "attestation_stale"],
    [context({ attestations: [attestation("repository_root"), attestation("writability"), attestation("capability"), attestation("writability", { attestationId: "attestation:writability:conflict", observedValue: false })] }), "attestation_mismatch"],
    [context({ attestations: [attestation("repository_root"), attestation("writability", { hostId: "host:other" }), attestation("capability")] }), "attestation_mismatch"],
  ];
  for (const [input, reason] of cases) assert.equal(evaluatePermission(plan, input).reasonCode, reason);
});

test("closed contracts reject unknown fields and accessors without invoking them", () => {
  let touched = false;
  const hostile = { ...attestation("writability"), surprise: true };
  assert.equal(validateHostPermissionAttestation(hostile).state, "invalid");
  const accessor = { ...context() };
  Object.defineProperty(accessor, "decisionId", { enumerable: true, get() { touched = true; throw new Error("boom"); } });
  assert.equal(validatePermissionInvocationContext(accessor).state, "invalid");
  assert.equal(touched, false);
});

test("authorizer verifies an atomic append-if-absent receipt before returning allow", async () => {
  const records = [];
  const authorize = createPermissionAuthorizer({
    getContext: () => context(),
    appendAuditIfAbsent(record) { records.push(record); return receipt(record); },
  });
  const decision = await authorize(plan);
  assert.equal(decision.outcome, "allow");
  assert.equal(decision.authorizationArtifact.payload.seatId, "may");
  assert.equal(decision.authorizationArtifact.payload.reasoningRuntimeId, "runtime:may-local");
  assert.equal(decision.authorizationArtifact.payload.toolExecutorId, "executor:codex-host");
  assert.equal(records.length, 1);
  assert.equal(replayPermissionAuditLedger(records).state, "valid");
  assert.equal(validatePermissionAuditAppendReceipt(receipt(records[0]), records[0]).state, "valid");
  await assert.rejects(createPermissionAuthorizer({
    getContext: () => context({ decisionId: "decision:10:2" }),
    appendAuditIfAbsent: (record) => receipt(record, { recordId: "audit:wrong" }),
  })(plan), /audit_receipt_mismatch/);
});

test("audited executor converts result-ledger append failure to an uncertain executor result", async () => {
  const authorize = createPermissionAuthorizer({
    getContext: () => context(),
    appendAuditIfAbsent: (record) => receipt(record),
  });
  const decision = await authorize(plan);
  const execute = createAuditedExecutor({
    execute: () => ({
      runnerContractVersion: 1, outcome: "completed", missionId: plan.missionId,
      subjectId: plan.subjectId, revisionId: plan.revisionId,
      evaluatedThroughSequence: plan.evaluatedThroughSequence, cycleId: plan.cycleId,
      seatId: plan.seatId, actionId: plan.actionId, effectClass: plan.effectClass,
      effectKey: plan.effectKey, summary: "Executed by the bound host.", evidenceRefs: ["artifact:10"],
    }),
    getContext: () => context(),
    appendAuditIfAbsent: () => { throw new Error("disk-full"); },
    nextRecordId: () => "audit:tool-result:10:1",
    now: () => "2026-07-19T20:00:01Z",
  });
  const result = await execute(plan, decision);
  assert.equal(result.outcome, "uncertain");
  assert.match(result.summary, /not durably verified/);
});

test("executor preflight rejects post-authorization runtime substitution before the tool call", async () => {
  const authorize = createPermissionAuthorizer({
    getContext: () => context(),
    appendAuditIfAbsent: (record) => receipt(record),
  });
  const decision = await authorize(plan);
  let calls = 0;
  const execute = createAuditedExecutor({
    execute: () => { calls += 1; return null; },
    getContext: () => context({ reasoningRuntimeId: "runtime:substituted" }),
    appendAuditIfAbsent: (record) => receipt(record),
    nextRecordId: () => "audit:tool-result:substituted",
    now: () => "2026-07-19T20:00:01Z",
  });
  const result = await execute(plan, decision);
  assert.equal(result.outcome, "failed");
  assert.equal(calls, 0);
  assert.match(result.summary, /not attempted/);
});

test("audit replay rejects attribution drift, duplicate results, sparse input, and unsafe record fields", async () => {
  const decisions = [];
  const authorize = createPermissionAuthorizer({
    getContext: () => context(),
    appendAuditIfAbsent(record) { decisions.push(record); return receipt(record); },
  });
  const decision = await authorize(plan);
  const result = createToolResultAuditRecord({
    plan,
    context: context(),
    decision,
    outcome: "completed",
    reasonCode: "executor_completed",
    observedAt: "2026-07-19T20:00:01Z",
    recordId: "audit:tool-result:10:1",
  });
  assert.equal(replayPermissionAuditLedger([...decisions, result]).state, "valid");
  for (const deniedOutcome of ["deny", "wait"]) {
    assert.equal(replayPermissionAuditLedger([{ ...decisions[0], decision: deniedOutcome }, result]).state, "invalid");
  }
  assert.equal(replayPermissionAuditLedger([...decisions, { ...result, toolExecutorId: "executor:other" }]).state, "invalid");
  assert.equal(replayPermissionAuditLedger([...decisions, result, { ...result, recordId: "audit:tool-result:10:2" }]).state, "invalid");
  const sparse = [...decisions, result];
  delete sparse[0];
  assert.equal(replayPermissionAuditLedger(sparse).state, "invalid");
  let touched = false;
  const hostile = { ...decisions[0] };
  Object.defineProperty(hostile, "recordType", { enumerable: true, get() { touched = true; throw new Error("boom"); } });
  assert.equal(validatePermissionAuditRecord(hostile).state, "invalid");
  assert.equal(touched, false);
});

test("the Issue #10 artifact payload is closed and audit receipts require ledger identity", async () => {
  const records = [];
  const authorize = createPermissionAuthorizer({
    getContext: () => context(),
    appendAuditIfAbsent(record) { records.push(record); return receipt(record); },
  });
  const decision = await authorize(plan);
  assert.equal(validatePermissionAuthorizationArtifactPayload(decision.authorizationArtifact.payload).state, "valid");
  assert.equal(validatePermissionAuthorizationArtifactPayload({ ...decision.authorizationArtifact.payload, surprise: true }).state, "invalid");
  const { ledgerId: _ledgerId, ...missingLedger } = receipt(records[0]);
  assert.equal(validatePermissionAuditAppendReceipt(missingLedger, records[0]).state, "invalid");
});
