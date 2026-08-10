import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuditedExecutor,
  createPermissionAuthorizer,
  createRunnerPermissionDecisionV1,
  createRuntimeClaimedExecutorV1,
  evaluatePermission,
  replayRuntimeInvocationClaimsV1,
  runtimeInvocationClaimRecordIdV1,
  validateHostPermissionAttestation,
  validatePermissionAuthorizationArtifactPayload,
  validatePermissionInvocationContext,
  validateRuntimeBinding,
} from "../dist/permission-v1.mjs";
import {
  createPermissionAuditRecord,
  replayPermissionAuditLedger,
  validatePermissionAuditRecord,
  validatePermissionAuditReceipt,
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
  return { schemaVersion: 1, ledgerId: record.ledgerId, recordId: record.recordId, decisionId: record.decisionId, digest: record.digest, appended: true, ledgerSequence };
}

test("closed binding, attestation, and context contracts reject authority drift", () => {
  assert.equal(validateRuntimeBinding(binding()).state, "valid");
  assert.equal(validateRuntimeBinding({ ...binding(), seatId: "coulson" }).state, "invalid");
  assert.equal(validateRuntimeBinding({ ...binding(), seatId: "mack" }).state, "invalid");
  assert.equal(validateRuntimeBinding({ ...binding(), seatId: "oracle" }).state, "invalid");
  assert.equal(validateRuntimeBinding({ ...binding(), seatId: "user:invalid" }).state, "invalid");
  assert.equal(validateRuntimeBinding({ ...binding(), seatId: "x" }).state, "invalid");
  assert.equal(validateRuntimeBinding({ ...binding(), future: true }).state, "invalid");
  assert.equal(validateHostPermissionAttestation(attestation("capability")).state, "valid");
  assert.equal(validateHostPermissionAttestation({ ...attestation("writability"), capabilityId: "filesystem_write" }).state, "invalid");
  assert.equal(validatePermissionInvocationContext(context()).state, "valid");
  assert.equal(validatePermissionInvocationContext(context({ journalSchemaVersion: 7 })).state, "valid");
  assert.equal(validatePermissionInvocationContext(context({ journalSchemaVersion: 9 })).state, "valid");
  assert.equal(validatePermissionInvocationContext({ ...context(), journalSchemaVersion: 5 }).state, "invalid");
  for (const seatId of ["coulson", "fitz", "simmons"]) {
    assert.equal(validateRuntimeBinding(binding({ reasoningRuntimeId: seatId })).state, "invalid");
    assert.equal(validateRuntimeBinding(binding({ toolExecutorId: seatId })).state, "invalid");
  }
  for (const seatId of ["mack", "oracle"]) {
    assert.equal(validateRuntimeBinding(binding({ reasoningRuntimeId: seatId })).state, "invalid");
    assert.equal(validateRuntimeBinding(binding({ toolExecutorId: seatId })).state, "invalid");
  }
});

test("closed permission and audit shapes reject hostile accessors without invoking them", () => {
  let touched = 0;
  const hostileBinding = binding();
  Object.defineProperty(hostileBinding, "reasoningRuntimeId", { enumerable: true, get() { touched += 1; return "runtime:hostile"; } });
  assert.equal(validateRuntimeBinding(hostileBinding).state, "invalid");

  const hostileScope = binding();
  const actions = [];
  Object.defineProperty(actions, 0, { enumerable: true, get() { touched += 1; return "edit-permission-boundary"; } });
  hostileScope.approvedScope.actionIds = actions;
  assert.equal(validateRuntimeBinding(hostileScope).state, "invalid");

  const hostileEffectClasses = binding();
  const effectClasses = [];
  Object.defineProperty(effectClasses, 0, { enumerable: true, get() { touched += 1; return "behavioral_implementation"; } });
  hostileEffectClasses.approvedScope.effectClasses = effectClasses;
  assert.equal(validateRuntimeBinding(hostileEffectClasses).state, "invalid");

  const hostileAttestation = attestation("capability");
  Object.defineProperty(hostileAttestation, "observedValue", { enumerable: true, get() { touched += 1; return true; } });
  assert.equal(validateHostPermissionAttestation(hostileAttestation).state, "invalid");

  const hostileContext = context();
  const activeBindings = [];
  Object.defineProperty(activeBindings, 0, { enumerable: true, get() { touched += 1; return binding(); } });
  hostileContext.activeBindings = activeBindings;
  assert.equal(validatePermissionInvocationContext(hostileContext).state, "invalid");

  const base = createPermissionAuditRecord({ ledgerId: "ledger:accessor:test", recordId: "audit:accessor", recordType: "permission.decision", recordedAt: "2026-07-20T02:05:00Z", decisionId: "decision:accessor", outcome: "allow", missionId: "mission:issue-10", subjectId: "issue:10", seatId: "may", reasoningRuntimeId: "runtime:ornith:may", toolExecutorId: "executor:codex-host", bindingId: "binding:may", bindingVersion: 1, repositoryId: "repo:shield", canonicalWritableRoot: "/workspace/shield", branch: "benchmark", revisionId, journalSequence: 5, actionId: "edit", effectClass: "behavioral_implementation", effectKey: "effect:edit", approvedScope: ["edit"], summary: null, evidenceRefs: ["attestation:1"] });
  const hostileRecord = { ...base };
  Object.defineProperty(hostileRecord, "branch", { enumerable: true, get() { touched += 1; return "hostile"; } });
  assert.equal(validatePermissionAuditRecord(hostileRecord).state, "invalid");
  const hostileReceipt = receipt(base);
  Object.defineProperty(hostileReceipt, "digest", { enumerable: true, get() { touched += 1; return base.digest; } });
  assert.equal(validatePermissionAuditReceipt(hostileReceipt, base).state, "invalid");
  const hostileLedger = [];
  Object.defineProperty(hostileLedger, 0, { enumerable: true, get() { touched += 1; return base; } });
  assert.equal(replayPermissionAuditLedger(hostileLedger).state, "invalid");
  assert.equal(touched, 0);
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

test("pure Runner decision performs no audit write and returns an immutable exact allow", () => {
  const frozenContext = context();
  const before = JSON.stringify(frozenContext);
  const decision = createRunnerPermissionDecisionV1(plan(), frozenContext);
  assert.equal(decision.outcome, "allow");
  assert.equal(decision.reasonCode, "permission_allowed");
  assert.equal(decision.effectKey, plan().effectKey);
  assert.equal(decision.authorizationArtifact.payload.bindingId, binding().bindingId);
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.authorizationArtifact.payload), true);
  assert.equal(JSON.stringify(frozenContext), before);

  const denied = createRunnerPermissionDecisionV1(plan({ effectKey: "effect:substituted" }), frozenContext);
  assert.equal(denied.outcome, "deny");
  assert.equal(denied.reasonCode, "effect_key_out_of_scope");
});

test("authorizer requires a matching atomic append receipt before returning allow and rejects reuse", async () => {
  const records = [];
  const authorize = createPermissionAuthorizer({
    ledgerId: "ledger:permission:test",
    getContext: () => context(),
    appendIfAbsent: (record) => { records.push(record); return receipt(record, records.length - 1); },
  });
  const decision = await authorize(plan());
  assert.equal(decision.outcome, "allow");
  assert.equal(records.length, 1);
  assert.equal(validatePermissionAuthorizationArtifactPayload(decision.authorizationArtifact.payload).state, "valid");
  await assert.rejects(authorize(plan()), /decision_reused/);

  const failed = createPermissionAuthorizer({ ledgerId: "ledger:permission:test", getContext: () => context({ decisionId: "decision:bad-receipt" }), appendIfAbsent: () => ({ appended: false }) });
  await assert.rejects(failed(plan()), /audit_receipt_mismatch/);
});

test("authorizer accepts fresh context with changed clock and attestation ids", async () => {
  const records = [];
  const authorize = createPermissionAuthorizer({
    ledgerId: "ledger:permission:fresh-context:test",
    getContext: () => context({
      evaluatedAt: "2026-07-20T02:05:12Z",
      attestations: [
        attestation("repository_root", { attestationId: "attestation:repository_root:fresh" }),
        attestation("writability", { attestationId: "attestation:writability:fresh" }),
        attestation("capability", { attestationId: "attestation:capability:fresh" }),
      ],
    }),
    appendIfAbsent: (record) => { records.push(record); return receipt(record, records.length - 1); },
  });
  const decision = await authorize(plan());
  assert.equal(decision.outcome, "allow");
  assert.equal(records.length, 1);
  assert.equal(validatePermissionAuthorizationArtifactPayload(decision.authorizationArtifact.payload).state, "valid");
});

test("audited executor performs a fresh preflight and marks unverified result audit uncertain", async () => {
  const authorize = createPermissionAuthorizer({ ledgerId: "ledger:permission:test", getContext: () => context(), appendIfAbsent: (record) => receipt(record) });
  const decision = await authorize(plan());
  let calls = 0;
  const execute = createAuditedExecutor({
    ledgerId: "ledger:permission:test",
    getContext: () => context(),
    execute: () => { calls += 1; return { runnerContractVersion: 1, outcome: "completed", missionId: plan().missionId, subjectId: plan().subjectId, revisionId, evaluatedThroughSequence: 5, cycleId: plan().cycleId, seatId: "may", actionId: plan().actionId, effectClass: plan().effectClass, effectKey: plan().effectKey, summary: "Tool completed.", evidenceRefs: ["evidence:tool"] }; },
    appendIfAbsent: (record) => record.recordType === "tool.invocation" ? receipt(record) : ({ appended: false }),
    nextRecordId: () => "audit-result:issue-10:1",
    now: () => "2026-07-20T02:06:00Z",
  });
  const result = await execute(plan(), decision);
  assert.equal(calls, 1);
  assert.equal(result.outcome, "uncertain");

  const stale = createAuditedExecutor({ ...{
    ledgerId: "ledger:permission:test",
    getContext: () => context({ branch: "main" }), execute: () => { calls += 1; }, appendIfAbsent: () => { throw new Error("must not append"); }, nextRecordId: () => "audit-result:stale", now: () => "2026-07-20T02:06:00Z",
  } });
  const before = calls;
  assert.equal((await stale(plan(), decision)).outcome, "failed");
  assert.equal(calls, before);
});

test("audit ledger is closed, digest-bound, append-only, and result-order aware", () => {
  const base = { ledgerId: "ledger:permission:test", recordId: "audit:decision:1", recordType: "permission.decision", recordedAt: "2026-07-20T02:05:00Z", decisionId: "decision:1", outcome: "allow", missionId: "mission:issue-10", subjectId: "issue:10", seatId: "may", reasoningRuntimeId: "runtime:ornith:may", toolExecutorId: "executor:codex-host", bindingId: "binding:may", bindingVersion: 1, repositoryId: "repo:shield", canonicalWritableRoot: "/workspace/shield", branch: "benchmark", revisionId, journalSequence: 5, actionId: "edit", effectClass: "behavioral_implementation", effectKey: "effect:edit", approvedScope: ["edit"], summary: null, evidenceRefs: ["attestation:1"] };
  const decision = createPermissionAuditRecord(base);
  const invocation = createPermissionAuditRecord({ ...base, recordId: "audit:invocation:1", recordType: "tool.invocation", outcome: "allow" });
  const result = createPermissionAuditRecord({ ...base, recordId: "audit:result:1", recordType: "tool.result", outcome: "completed", summary: "Completed.", evidenceRefs: ["evidence:1"] });
  assert.equal(validatePermissionAuditRecord(decision).state, "valid");
  assert.equal(validatePermissionAuditRecord({ ...decision, branch: "other" }).state, "invalid");
  assert.equal(replayPermissionAuditLedger([decision, invocation, result]).state, "valid");
  assert.equal(replayPermissionAuditLedger([result]).state, "invalid");
  assert.equal(replayPermissionAuditLedger([decision, decision]).state, "invalid");
  const duplicateDecision = createPermissionAuditRecord({ ...base, recordId: "audit:decision:2" });
  const duplicateResult = createPermissionAuditRecord({ ...base, recordId: "audit:result:2", recordType: "tool.result", outcome: "completed", summary: "Completed again.", evidenceRefs: ["evidence:2"] });
  assert.equal(replayPermissionAuditLedger([decision, duplicateDecision]).state, "invalid");
  assert.equal(replayPermissionAuditLedger([decision, invocation, result, duplicateResult]).state, "invalid");
  assert.equal(validatePermissionAuditReceipt({ ...receipt(decision), ledgerId: "ledger:other" }, decision).state, "invalid");
});

test("atomic invocation consumption prevents concurrent or restarted executor reuse", async () => {
  const records = new Map();
  const appendIfAbsent = async (record) => {
    if (records.has(record.recordId)) return { appended: false };
    records.set(record.recordId, record);
    return receipt(record, records.size - 1);
  };
  const authorize = createPermissionAuthorizer({ ledgerId: "ledger:consume:test", getContext: () => context(), appendIfAbsent });
  const decision = await authorize(plan());
  let calls = 0;
  const dependencies = { ledgerId: "ledger:consume:test", getContext: () => context(), appendIfAbsent, execute: () => { calls += 1; return { runnerContractVersion: 1, outcome: "completed", missionId: plan().missionId, subjectId: plan().subjectId, revisionId, evaluatedThroughSequence: 5, cycleId: plan().cycleId, seatId: "may", actionId: plan().actionId, effectClass: plan().effectClass, effectKey: plan().effectKey, summary: "One call.", evidenceRefs: ["evidence:one"] }; }, nextRecordId: () => "audit-result:consume", now: () => "2026-07-20T02:06:00Z" };
  const firstHost = createAuditedExecutor(dependencies);
  const restartedHost = createAuditedExecutor(dependencies);
  const results = await Promise.all([firstHost(plan(), decision), restartedHost(plan(), decision)]);
  assert.equal(calls, 1);
  assert.equal(results.filter(({ outcome }) => outcome === "completed").length, 1);
  assert.equal(results.filter(({ outcome }) => outcome === "failed").length, 1);
});

test("runtime-v2 claim record atomically excludes a different decision at the same mission sequence", async () => {
  const ledger = new Map();
  const appendIfAbsent = async (record) => {
    if (ledger.has(record.recordId)) return { appended: false };
    ledger.set(record.recordId, record);
    return receipt(record, ledger.size - 1);
  };
  const secondPlan = plan({
    cycleId: "cycle:issue-10:2",
    actionId: "edit-permission-boundary-2",
    effectKey: "effect:issue-10:permission-2",
    validationId: "validation:issue-10:2",
  });
  const secondBinding = binding({
    approvedScope: {
      actionIds: [secondPlan.actionId],
      effectClasses: [secondPlan.effectClass],
      effectKeys: [secondPlan.effectKey],
      capabilities: ["filesystem_write"],
    },
  });
  const firstContext = () => context({ journalSchemaVersion: 9 });
  const secondContext = () => context({
    journalSchemaVersion: 9,
    decisionId: "decision:issue-10:2",
    activeBindings: [secondBinding],
  });
  const firstDecision = await createPermissionAuthorizer({
    ledgerId: "ledger:runtime-claim:test",
    appendIfAbsent,
    getContext: firstContext,
  })(plan());
  const secondDecision = await createPermissionAuthorizer({
    ledgerId: "ledger:runtime-claim:test",
    appendIfAbsent,
    getContext: secondContext,
  })(secondPlan);
  let calls = 0;
  const first = createRuntimeClaimedExecutorV1({
    ledgerId: "ledger:runtime-claim:test",
    appendIfAbsent,
    getContext: firstContext,
    execute: (current) => {
      calls += 1;
      return {
        runnerContractVersion: 1,
        outcome: "completed",
        missionId: current.missionId,
        subjectId: current.subjectId,
        revisionId: current.revisionId,
        evaluatedThroughSequence: current.evaluatedThroughSequence,
        cycleId: current.cycleId,
        seatId: current.seatId,
        actionId: current.actionId,
        effectClass: current.effectClass,
        effectKey: current.effectKey,
        summary: "Claim winner executed.",
        evidenceRefs: ["evidence:runtime-claim"],
      };
    },
    now: () => "2026-07-20T02:06:00Z",
  });
  const second = createRuntimeClaimedExecutorV1({
    ledgerId: "ledger:runtime-claim:test",
    appendIfAbsent,
    getContext: secondContext,
    execute: () => { calls += 1; },
    now: () => "2026-07-20T02:06:00Z",
  });
  const [firstClaim, secondClaim] = await Promise.all([
    first.claim(plan(), firstDecision),
    second.claim(secondPlan, secondDecision),
  ]);
  assert.equal(firstClaim.outcome, "claimed");
  assert.deepEqual(secondClaim, {
    runnerContractVersion: 1,
    outcome: "blocked",
    reason: "invocation_claim_conflict",
  });
  assert.match(
    [...ledger.values()].find(({ recordType }) => recordType === "tool.invocation").recordId,
    /^runtime-invocation:sha256:[A-Za-z0-9_-]{43}$/,
  );
  assert.equal(
    runtimeInvocationClaimRecordIdV1(plan().missionId, revisionId, 5),
    [...ledger.values()].find(({ recordType }) => recordType === "tool.invocation").recordId,
  );
  assert.equal((await first.execute(plan(), firstDecision)).outcome, "completed");
  assert.equal(calls, 1);
  assert.equal(replayRuntimeInvocationClaimsV1([...ledger.values()]).state, "valid");
});

test("runtime claim execution accepts fresh context and enforces exact-once execution", async () => {
  const records = new Map();
  const appendIfAbsent = async (record) => {
    if (records.has(record.recordId)) return { appended: false };
    records.set(record.recordId, record);
    return receipt(record, records.size - 1);
  };
  let currentContext = context({ journalSchemaVersion: 9 });
  const currentPlan = plan();
  const decision = await createPermissionAuthorizer({
    ledgerId: "ledger:runtime-exact:test",
    appendIfAbsent,
    getContext: () => currentContext,
  })(currentPlan);
  let calls = 0;
  const claimed = createRuntimeClaimedExecutorV1({
    ledgerId: "ledger:runtime-exact:test",
    appendIfAbsent,
    getContext: () => currentContext,
    execute: (executedPlan) => {
      calls += 1;
      return {
        runnerContractVersion: 1,
        outcome: "completed",
        missionId: executedPlan.missionId,
        subjectId: executedPlan.subjectId,
        revisionId: executedPlan.revisionId,
        evaluatedThroughSequence: executedPlan.evaluatedThroughSequence,
        cycleId: executedPlan.cycleId,
        seatId: executedPlan.seatId,
        actionId: executedPlan.actionId,
        effectClass: executedPlan.effectClass,
        effectKey: executedPlan.effectKey,
        summary: "Exact claim executed.",
        evidenceRefs: ["evidence:exact-claim"],
      };
    },
    now: () => "2026-07-20T02:06:00Z",
  });
  assert.equal((await claimed.claim(currentPlan, decision)).outcome, "claimed");
  const substitutedPlan = { ...currentPlan, validationId: "validation:substituted" };
  assert.equal((await claimed.execute(substitutedPlan, decision)).outcome, "failed");
  assert.equal(calls, 0);

  currentContext = {
    ...currentContext,
    evaluatedAt: "2026-07-20T02:05:01Z",
    attestations: [
      attestation("repository_root", { attestationId: "attestation:repository_root:v2" }),
      attestation("writability", { attestationId: "attestation:writability:v2" }),
      attestation("capability", { attestationId: "attestation:capability:v2" }),
    ],
  };
  assert.equal((await claimed.execute(currentPlan, decision)).outcome, "completed");
  assert.equal(calls, 1);

  currentContext = context({ journalSchemaVersion: 9 });
  assert.equal((await claimed.execute(currentPlan, decision)).outcome, "failed");
  assert.equal(calls, 1);
});

test("runtime claim execution rejects stable identity drift after claim", async () => {
  const records = new Map();
  const appendIfAbsent = async (record) => {
    if (records.has(record.recordId)) return { appended: false };
    records.set(record.recordId, record);
    return receipt(record, records.size - 1);
  };
  const currentContext = context({ journalSchemaVersion: 9 });
  const currentPlan = plan();
  const decision = await createPermissionAuthorizer({
    ledgerId: "ledger:runtime-claim-identity-denial:test",
    appendIfAbsent,
    getContext: () => currentContext,
  })(currentPlan);
  let calls = 0;
  let executeContext = currentContext;
  const claimed = createRuntimeClaimedExecutorV1({
    ledgerId: "ledger:runtime-claim-identity-denial:test",
    appendIfAbsent,
    getContext: () => executeContext,
    execute: () => {
      calls += 1;
      return {
        runnerContractVersion: 1,
        outcome: "completed",
        missionId: currentPlan.missionId,
        subjectId: currentPlan.subjectId,
        revisionId,
        evaluatedThroughSequence: currentPlan.evaluatedThroughSequence,
        cycleId: currentPlan.cycleId,
        seatId: currentPlan.seatId,
        actionId: currentPlan.actionId,
        effectClass: currentPlan.effectClass,
        effectKey: currentPlan.effectKey,
        summary: "Identity changed.",
        evidenceRefs: ["evidence:identity-denied"],
      };
    },
    now: () => "2026-07-20T02:06:00Z",
  });
  assert.equal((await claimed.claim(currentPlan, decision)).outcome, "claimed");
  executeContext = { ...currentContext, branch: "main" };
  assert.equal((await claimed.execute(currentPlan, decision)).outcome, "failed");
  assert.equal(calls, 0);
});

test("audited executor accepts fresh context with changed clock and attestation ids", async () => {
  const authorize = createPermissionAuthorizer({
    ledgerId: "ledger:audited-fresh-context:test",
    getContext: () => context(),
    appendIfAbsent: (record) => receipt(record),
  });
  const decision = await authorize(plan());
  let calls = 0;
  const execute = createAuditedExecutor({
    ledgerId: "ledger:audited-fresh-context:test",
    getContext: () => context({
      evaluatedAt: "2026-07-20T02:05:10Z",
      attestations: [
        attestation("repository_root", { attestationId: "attestation:repository_root:executed" }),
        attestation("writability", { attestationId: "attestation:writability:executed" }),
        attestation("capability", { attestationId: "attestation:capability:executed" }),
      ],
    }),
    execute: () => {
      calls += 1;
      return {
        runnerContractVersion: 1,
        outcome: "completed",
        missionId: plan().missionId,
        subjectId: plan().subjectId,
        revisionId,
        evaluatedThroughSequence: 5,
        cycleId: plan().cycleId,
        seatId: plan().seatId,
        actionId: plan().actionId,
        effectClass: plan().effectClass,
        effectKey: plan().effectKey,
        summary: "Executed with fresh context.",
        evidenceRefs: ["evidence:audited-fresh-context"],
      };
    },
    appendIfAbsent: (record) => receipt(record),
    nextRecordId: () => "audit-result:issue-10:3",
    now: () => "2026-07-20T02:06:00Z",
  });
  const result = await execute(plan(), decision);
  assert.equal(result.outcome, "completed");
  assert.equal(calls, 1);
});

test("runtime claim rejects plan and decision identity substitution before invocation append", async () => {
  const records = new Map();
  const appendIfAbsent = async (record) => {
    if (records.has(record.recordId)) return { appended: false };
    records.set(record.recordId, record);
    return receipt(record, records.size - 1);
  };
  const currentPlan = plan();
  const currentContext = context({ journalSchemaVersion: 9 });
  const decision = await createPermissionAuthorizer({
    ledgerId: "ledger:runtime-claim-identity:test",
    appendIfAbsent,
    getContext: () => currentContext,
  })(currentPlan);
  let calls = 0;
  const claimed = createRuntimeClaimedExecutorV1({
    ledgerId: "ledger:runtime-claim-identity:test",
    appendIfAbsent,
    getContext: () => currentContext,
    execute: () => { calls += 1; },
    now: () => "2026-07-20T02:06:00Z",
  });
  const substituted = {
    ...currentPlan,
    validationId: "validation:substituted-before-claim",
    actionId: "substituted-action",
  };
  const result = await claimed.claim(substituted, decision);
  assert.deepEqual(result, {
    runnerContractVersion: 1,
    outcome: "blocked",
    reason: "invocation_claim_failed",
  });
  assert.equal(
    [...records.values()].filter(({ recordType }) => recordType === "tool.invocation").length,
    0,
  );
  assert.equal(calls, 0);
});

test("legacy audit-invocation records remain legacy in runtime-claim replay", () => {
  const base = {
    ledgerId: "ledger:legacy-runtime:test",
    recordedAt: "2026-07-20T02:05:00Z",
    decisionId: "decision:legacy",
    missionId: "mission:issue-10",
    subjectId: "issue:10",
    seatId: "may",
    reasoningRuntimeId: "runtime:ornith:may",
    toolExecutorId: "executor:codex-host",
    bindingId: "runtime-binding:may",
    bindingVersion: 1,
    repositoryId: "repo:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    branch: "codex/issue-10-shield-benchmark",
    revisionId,
    journalSequence: 5,
    actionId: "edit-permission-boundary",
    effectClass: "behavioral_implementation",
    effectKey: "effect:issue-10:permission",
    approvedScope: [],
    summary: null,
    evidenceRefs: [],
  };
  const decision = createPermissionAuditRecord({
    ...base,
    recordId: "audit:decision:legacy",
    recordType: "permission.decision",
    outcome: "allow",
  });
  const legacy = createPermissionAuditRecord({
    ...base,
    recordId: "audit-invocation:sha256:not-a-runtime-claim",
    recordType: "tool.invocation",
    outcome: "allow",
  });
  assert.equal(replayPermissionAuditLedger([decision, legacy]).state, "valid");
  assert.equal(replayRuntimeInvocationClaimsV1([decision, legacy]).state, "valid");
});
