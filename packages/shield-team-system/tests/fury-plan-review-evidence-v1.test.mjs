import assert from "node:assert/strict";
import test from "node:test";

import {
  FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION,
  deriveFuryPlanReviewEvidenceV1,
  evaluateFuryPlanReviewEvidenceV1,
  replayFuryPlanReviewEvidenceLedgerV1,
} from "../dist/fury-plan-review-evidence-v1.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";

const missionRevision = `sha256:${"A".repeat(43)}`;
const reviewedRevision = "1".repeat(40);
const correctedRevision = "2".repeat(40);

function binding(overrides = {}) {
  return {
    schemaVersion: 1,
    missionId: "mission:issue-172",
    missionRevisionId: missionRevision,
    subjectId: "github:RanSolo/shield-workspace/issue/172",
    repositoryId: "RanSolo/shield-workspace",
    baseBranch: "main",
    branch: "agent/issue-172-fury-review-evidence",
    prNumber: 180,
    blueprintArtifactId: "issue-172-blueprint",
    blueprintArtifactPath: "docs/missions/issue-172-may-blueprint.md",
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    artifactRevisionId: reviewedRevision,
    repositoryRevisionId: reviewedRevision,
    ...overrides,
  };
}

function review(overrides = {}) {
  return {
    reviewSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    assuranceKind: "host_asserted_non_authoritative",
    reviewId: "review:issue-172:1",
    missionId: "mission:issue-172",
    subjectId: "github:RanSolo/shield-workspace/issue/172",
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    missionBranch: "agent/issue-172-fury-review-evidence",
    prNumber: 180,
    blueprintArtifactId: "issue-172-blueprint",
    blueprintArtifactPath: "docs/missions/issue-172-may-blueprint.md",
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    reviewedRevisionId: reviewedRevision,
    verdict: "PASS",
    findings: [],
    reasoningRuntimeId: "runtime:fury-hosted",
    toolExecutorId: "executor:codex-host",
    ...overrides,
  };
}

function gate(reviewOverrides = {}, reconciliation = null) {
  return {
    planGateSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    review: review(reviewOverrides),
    reconciliation,
  };
}

function dispatchIdentity(overrides = {}) {
  return {
    receiptId: "receipt:fury:issue-172",
    dispatchId: "dispatch:fury:issue-172",
    parentMissionId: "mission:issue-172",
    parentMissionRevision: missionRevision,
    parentSessionId: "session:hill:issue-172",
    childTaskId: "task:fury:plan-review",
    childSessionId: "session:fury:issue-172",
    accountableSeatId: "fury",
    repositoryId: "RanSolo/shield-workspace",
    repositoryWorkspaceId: "workspace:issue-172",
    repositoryRevision: reviewedRevision,
    subjectId: "github:RanSolo/shield-workspace/issue/172",
    subjectRevision: reviewedRevision,
    artifactId: "issue-172-blueprint",
    artifactRevision: reviewedRevision,
    ...overrides,
  };
}

function receiptEntries(identity = dispatchIdentity()) {
  const runtime = {
    kind: "runtime.host_observed",
    runtimeId: "runtime:fury-hosted",
    model: "gpt-5.6-sol",
    evidenceRefs: ["host:fury:runtime"],
  };
  const executor = {
    kind: "executor.host_observed",
    executorId: "executor:codex-host",
    evidenceRefs: ["host:fury:executor"],
  };
  const shared = {
    ...identity,
    configuredRuntime: { kind: "runtime.configured", runtimeId: runtime.runtimeId, model: runtime.model },
    requestedRuntime: { kind: "runtime.requested", runtimeId: runtime.runtimeId, model: runtime.model },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:fury:tools" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: runtime,
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: executor,
  };
  const started = createSeatDispatchStartedEventV1({
    ...shared,
    inputEvidenceRefs: ["artifact:issue-172-blueprint"],
    timestamp: "2026-08-03T18:00:00Z",
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
  const completed = createSeatDispatchLifecycleEventV1({
    ...shared,
    kind: "dispatch.completed",
    outputEvidenceRefs: ["review:issue-172:pass"],
    timestamp: "2026-08-03T18:00:01Z",
    logSequence: 1,
    previousLogDigest: started.entryDigest,
    lifecycleSequence: 1,
    previousLifecycleDigest: started.entryDigest,
  });
  return [started, completed];
}

function create(overrides = {}) {
  const currentBinding = overrides.binding ?? binding();
  const identity = overrides.dispatchIdentity ?? dispatchIdentity({
    repositoryRevision: currentBinding.repositoryRevisionId,
    artifactRevision: currentBinding.artifactRevisionId,
    subjectRevision: currentBinding.artifactRevisionId,
  });
  return deriveFuryPlanReviewEvidenceV1({
    planGate: overrides.planGate ?? gate(),
    binding: currentBinding,
    dispatchIdentity: identity,
    rawReceiptEntries: overrides.rawReceiptEntries ?? receiptEntries(identity),
  });
}

function candidate(evidence, overrides = {}) {
  return {
    candidateSchemaVersion: 1,
    contractVersion: FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION,
    evidenceId: evidence.evidenceId,
    evidenceDigest: evidence.evidenceDigest,
    missionId: evidence.missionId,
    missionRevisionId: evidence.missionRevisionId,
    planDigest: evidence.planDigest,
    artifactRevisionId: evidence.artifactRevisionId,
    repositoryRevisionId: evidence.repositoryRevisionId,
    ...overrides,
  };
}

test("derives deterministic durable evidence from one completed exact Fury receipt", () => {
  const first = create();
  const second = create();
  assert.equal(first.state, "created");
  assert.equal(second.state, "created");
  assert.equal(first.evidence.evidenceId, second.evidence.evidenceId);
  assert.equal(first.evidence.evidenceDigest, second.evidence.evidenceDigest);
  assert.equal(first.evidence.reviewerSeatId, "fury");
  assert.equal(first.evidence.reasoningRuntimeId, "runtime:fury-hosted");
  assert.equal(first.evidence.reasoningModel, "gpt-5.6-sol");
  assert.equal(first.evidence.toolExecutorId, "executor:codex-host");
  assert.equal(first.evidence.furyDispatchIdentity.receiptId, "receipt:fury:issue-172");
});

test("exact candidate, independent evidence, receipt, and binding are eligible", () => {
  const created = create();
  assert.equal(created.state, "created");
  const result = evaluateFuryPlanReviewEvidenceV1(
    candidate(created.evidence),
    [created.evidence],
    receiptEntries(),
    binding(),
  );
  assert.equal(result.state, "evaluated");
  assert.equal(result.dispatchEligibility, "eligible");
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.planGateEvaluation.verdict, "PASS");
});

test("caller PASS cannot substitute for the opaque candidate or absent durable evidence", () => {
  const created = create();
  assert.equal(created.state, "created");
  assert.deepEqual(
    evaluateFuryPlanReviewEvidenceV1(
      { ...candidate(created.evidence), verdict: "PASS" }, [], receiptEntries(), binding(),
    ).reasonCodes,
    ["INVALID_EVIDENCE_CANDIDATE"],
  );
  assert.deepEqual(
    evaluateFuryPlanReviewEvidenceV1(candidate(created.evidence), [], receiptEntries(), binding()).reasonCodes,
    ["REVIEW_EVIDENCE_REQUIRED"],
  );
});

test("digest mismatch, stale revision, and absent receipt fail closed", () => {
  const created = create();
  assert.equal(created.state, "created");
  assert.deepEqual(evaluateFuryPlanReviewEvidenceV1(
    candidate(created.evidence, { evidenceDigest: `sha256:${"B".repeat(43)}` }),
    [created.evidence], receiptEntries(), binding(),
  ).reasonCodes, ["REVIEW_EVIDENCE_DIGEST_MISMATCH"]);
  assert.deepEqual(evaluateFuryPlanReviewEvidenceV1(
    candidate(created.evidence), [created.evidence], receiptEntries(),
    binding({ artifactRevisionId: correctedRevision, repositoryRevisionId: correctedRevision }),
  ).reasonCodes, ["REVIEW_EVIDENCE_STALE"]);
  assert.deepEqual(evaluateFuryPlanReviewEvidenceV1(
    candidate(created.evidence), [created.evidence], [], binding(),
  ).reasonCodes, ["INVALID_REVIEW_ATTRIBUTION"]);
});

test("duplicate durable review input and malformed reflective input fail closed", () => {
  const created = create();
  assert.equal(created.state, "created");
  assert.deepEqual(replayFuryPlanReviewEvidenceLedgerV1([created.evidence, created.evidence]), {
    state: "invalid",
    code: "duplicate",
    reasonCode: "DUPLICATE_REVIEW_EVIDENCE",
  });
  const proxy = new Proxy({}, { getPrototypeOf() { throw new Error("secret"); } });
  assert.deepEqual(replayFuryPlanReviewEvidenceLedgerV1(proxy), {
    state: "invalid",
    code: "invalid",
    reasonCode: "INVALID_REVIEW_EVIDENCE",
  });
});

test("PASS_WITH_REQUIRED_CHANGES preserves separate Hill reconciliation and current corrected head", () => {
  const finding = {
    findingId: "finding:172:1",
    findingClass: "architecture",
    evidenceRefs: ["plan:line:1"],
  };
  const currentBinding = binding({
    artifactRevisionId: correctedRevision,
    repositoryRevisionId: correctedRevision,
  });
  const identity = dispatchIdentity({
    repositoryRevision: correctedRevision,
    artifactRevision: correctedRevision,
    subjectRevision: correctedRevision,
  });
  const reconciliation = {
    reconciliationSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    assuranceKind: "host_asserted_non_authoritative",
    reconciliationId: "reconciliation:issue-172:1",
    reviewId: "review:issue-172:1",
    missionId: "mission:issue-172",
    subjectId: "github:RanSolo/shield-workspace/issue/172",
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    missionBranch: "agent/issue-172-fury-review-evidence",
    prNumber: 180,
    blueprintArtifactId: "issue-172-blueprint",
    blueprintArtifactPath: "docs/missions/issue-172-may-blueprint.md",
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    reviewedRevisionId: reviewedRevision,
    correctedRevisionId: correctedRevision,
    additionalArchitectureChange: false,
    dispositions: [{
      findingId: "finding:172:1",
      disposition: "incorporated",
      evidenceRefs: ["commit:corrected"],
    }],
    reasoningRuntimeId: "runtime:hill-hosted",
    toolExecutorId: "executor:hill-host",
  };
  const created = create({
    binding: currentBinding,
    dispatchIdentity: identity,
    rawReceiptEntries: receiptEntries(identity),
    planGate: gate({ verdict: "PASS_WITH_REQUIRED_CHANGES", findings: [finding] }, reconciliation),
  });
  assert.equal(created.state, "created");
  assert.equal(created.evidence.planGate.review.reasoningRuntimeId, "runtime:fury-hosted");
  assert.equal(created.evidence.planGate.reconciliation.reasoningRuntimeId, "runtime:hill-hosted");
  const result = evaluateFuryPlanReviewEvidenceV1(
    candidate(created.evidence), [created.evidence], receiptEntries(identity), currentBinding,
  );
  assert.equal(result.dispatchEligibility, "eligible");
  assert.equal(result.planGateEvaluation.verifierSeatId, "hill");
});
