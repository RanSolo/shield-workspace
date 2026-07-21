import assert from "node:assert/strict";
import test from "node:test";

import {
  FURY_PLAN_GATE_CONTRACT_VERSION,
  FURY_PLAN_GATE_REASON_CODES,
  evaluateFuryPlanGateV1,
} from "../public/github.mjs";

const reviewed = "0123456789012345678901234567890123456789";
const corrected = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function expected(overrides = {}) {
  return {
    schemaVersion: 1,
    assuranceKind: "host_asserted_non_authoritative",
    missionId: "mission-54",
    subjectId: "issue-54",
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    missionBranch: "codex/issue-54-early-fury-gate",
    prNumber: 63,
    blueprintArtifactId: "issue-54-blueprint",
    blueprintArtifactPath: "docs/missions/issue-54-early-fury-gate.md",
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    currentBlueprintRevisionId: reviewed,
    ...overrides,
  };
}

function finding(overrides = {}) {
  return {
    findingId: "finding-1",
    findingClass: "architecture",
    evidenceRefs: ["pr:63#fury-review"],
    ...overrides,
  };
}

function review(overrides = {}) {
  return {
    reviewSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    assuranceKind: "host_asserted_non_authoritative",
    reviewId: "review-54-1",
    missionId: "mission-54",
    subjectId: "issue-54",
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    missionBranch: "codex/issue-54-early-fury-gate",
    prNumber: 63,
    blueprintArtifactId: "issue-54-blueprint",
    blueprintArtifactPath: "docs/missions/issue-54-early-fury-gate.md",
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    reviewedRevisionId: reviewed,
    verdict: "PASS",
    findings: [],
    reasoningRuntimeId: "runtime:ornith",
    toolExecutorId: "executor:codex-host",
    ...overrides,
  };
}

function reconciliation(overrides = {}) {
  return {
    reconciliationSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    assuranceKind: "host_asserted_non_authoritative",
    reconciliationId: "reconciliation-54-1",
    reviewId: "review-54-1",
    missionId: "mission-54",
    subjectId: "issue-54",
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    missionBranch: "codex/issue-54-early-fury-gate",
    prNumber: 63,
    blueprintArtifactId: "issue-54-blueprint",
    blueprintArtifactPath: "docs/missions/issue-54-early-fury-gate.md",
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    reviewedRevisionId: reviewed,
    correctedRevisionId: corrected,
    additionalArchitectureChange: false,
    dispositions: [{
      findingId: "finding-1",
      disposition: "incorporated",
      evidenceRefs: ["commit:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    }],
    reasoningRuntimeId: "runtime:ornith",
    toolExecutorId: "executor:codex-host",
    ...overrides,
  };
}

function gate(reviewOverrides = {}, reconciliationValue = null) {
  return {
    planGateSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    review: review(reviewOverrides),
    reconciliation: reconciliationValue,
  };
}

test("exports the closed v1 contract and pending review fails closed", () => {
  assert.equal(FURY_PLAN_GATE_CONTRACT_VERSION, "fury.plan-gate.v1");
  assert.ok(FURY_PLAN_GATE_REASON_CODES.includes("PLAN_REVIEW_REQUIRED"));
  const result = evaluateFuryPlanGateV1(null, expected());
  assert.equal(result.dispatchEligibility, "ineligible");
  assert.deepEqual(result.reasonCodes, ["PLAN_REVIEW_REQUIRED"]);
  assert.equal(result.authority, "non_authoritative");
});

test("an exact PASS is eligible and derives Fury identity", () => {
  const result = evaluateFuryPlanGateV1(gate(), expected());
  assert.equal(result.state, "evaluated");
  assert.equal(result.dispatchEligibility, "eligible");
  assert.equal(result.reviewerSeatId, "fury");
  assert.equal(result.verifierSeatId, null);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.review));
});

test("verdict cardinality is closed and FAIL always denies", () => {
  assert.deepEqual(
    evaluateFuryPlanGateV1(gate({ verdict: "PASS", findings: [finding()] }), expected()).reasonCodes,
    ["INVALID_PLAN_REVIEW"],
  );
  assert.deepEqual(
    evaluateFuryPlanGateV1(gate({ verdict: "FAIL", findings: [] }), expected()).reasonCodes,
    ["INVALID_PLAN_REVIEW"],
  );
  const failed = evaluateFuryPlanGateV1(
    gate({ verdict: "FAIL", findings: [finding()] }), expected(),
  );
  assert.equal(failed.dispatchEligibility, "ineligible");
  assert.deepEqual(failed.reasonCodes, ["REVIEW_FAILED"]);
});

test("PASS_WITH_REQUIRED_CHANGES needs an exact bounded reconciliation", () => {
  const reviewOverrides = { verdict: "PASS_WITH_REQUIRED_CHANGES", findings: [finding()] };
  assert.deepEqual(
    evaluateFuryPlanGateV1(gate(reviewOverrides), expected()).reasonCodes,
    ["RECONCILIATION_REQUIRED"],
  );
  const accepted = evaluateFuryPlanGateV1(
    gate(reviewOverrides, reconciliation()), expected({ currentBlueprintRevisionId: corrected }),
  );
  assert.equal(accepted.dispatchEligibility, "eligible");
  assert.equal(accepted.verifierSeatId, "hill");
});

test("reconciliation rejects same revision, extra architecture, missing findings, and stale head", () => {
  const reviewOverrides = { verdict: "PASS_WITH_REQUIRED_CHANGES", findings: [finding()] };
  for (const [record, current, reason] of [
    [reconciliation({ correctedRevisionId: reviewed }), reviewed, "CORRECTED_REVISION_NOT_DISTINCT"],
    [reconciliation({ additionalArchitectureChange: true }), corrected, "ADDITIONAL_ARCHITECTURE_CHANGE_REVIEW_REQUIRED"],
    [reconciliation({ dispositions: [] }), corrected, "REQUIRED_CHANGE_SET_MISMATCH"],
    [reconciliation(), reviewed, "RECONCILIATION_REVISION_STALE"],
  ]) {
    const result = evaluateFuryPlanGateV1(
      gate(reviewOverrides, record), expected({ currentBlueprintRevisionId: current }),
    );
    assert.deepEqual(result.reasonCodes, [reason]);
  }
});

test("contextual replay, stale PASS, and runtime identity ambiguity deny", () => {
  assert.deepEqual(
    evaluateFuryPlanGateV1(gate(), expected({ subjectId: "issue-55" })).reasonCodes,
    ["REPLAY_BINDING_MISMATCH"],
  );
  assert.deepEqual(
    evaluateFuryPlanGateV1(gate(), expected({ currentBlueprintRevisionId: corrected })).reasonCodes,
    ["REVIEW_REVISION_STALE"],
  );
  assert.deepEqual(
    evaluateFuryPlanGateV1(gate({ reasoningRuntimeId: "fury" }), expected()).reasonCodes,
    ["INVALID_PLAN_REVIEW"],
  );
  assert.deepEqual(
    evaluateFuryPlanGateV1(gate({ toolExecutorId: "runtime:ornith" }), expected()).reasonCodes,
    ["INVALID_PLAN_REVIEW"],
  );
});

test("same-context reuse is deterministic while changed workspace binding denies", () => {
  const value = gate();
  assert.deepEqual(evaluateFuryPlanGateV1(value, expected()), evaluateFuryPlanGateV1(value, expected()));
  assert.deepEqual(
    evaluateFuryPlanGateV1(value, expected({ prNumber: 64 })).reasonCodes,
    ["REPLAY_BINDING_MISMATCH"],
  );
});

test("unknown fields, accessors, sparse arrays, paths, and throwing proxies fail closed", () => {
  const withUnknown = { ...gate(), authority: "authoritative" };
  const accessor = gate();
  Object.defineProperty(accessor.review, "verdict", { get() { throw new Error("secret"); } });
  const sparse = gate({ verdict: "FAIL", findings: new Array(1) });
  const unsafePath = gate({ blueprintArtifactPath: "docs/../secret.md" });
  const proxy = new Proxy({}, { getPrototypeOf() { throw new Error("secret"); } });
  for (const value of [withUnknown, accessor, sparse, unsafePath, proxy]) {
    const result = evaluateFuryPlanGateV1(value, expected());
    assert.equal(result.dispatchEligibility, "ineligible");
    assert.deepEqual(result.reasonCodes, ["INVALID_PLAN_REVIEW"]);
    assert.doesNotMatch(JSON.stringify(result), /secret/);
  }
});
