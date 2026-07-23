import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMackValidationV0 } from "../dist/mack-validation-v0.mjs";

const expected = {
  missionId: "mission-95-proof",
  subjectId: "fixture-qa-1",
  repository: "RanSolo/shield-workspace",
  branch: "main",
  artifactRevisionId: "50afdc9de3f71f6f83deb6c2f00ace2c991fcee5",
  approvedTestSurfaces: ["packages/shield-team-system/tests/mack-validation-v0.test.mjs"],
};

function report(overrides = {}) {
  return {
    schemaVersion: 1,
    contractVersion: "mack.validation.v0",
    assuranceKind: "host_asserted_non_authoritative",
    missionId: expected.missionId,
    subjectId: expected.subjectId,
    repository: expected.repository,
    branch: expected.branch,
    artifactRevisionId: expected.artifactRevisionId,
    status: "pass",
    scenarios: [
      { scenarioId: "existing-behavior", required: true, covered: true },
      { scenarioId: "coverage-gap", required: true, covered: true },
    ],
    lanes: [{ laneId: "focused", commandId: "node-test", outcome: "pass" }],
    findings: [],
    evidenceRefs: ["tests/mack-validation-v0.test.mjs"],
    limitations: [],
    editedTestSurfaces: [],
    recommendedRoute: "advance",
    ...overrides,
  };
}

test("proving fixture produces an eligible non-authoritative pass", () => {
  const result = evaluateMackValidationV0(report(), expected);
  assert.equal(result.state, "evaluated");
  assert.equal(result.advancementEligibility, "eligible");
  assert.equal(result.status, "pass");
  assert.equal(result.authority, "non_authoritative");
});

test("stale or mismatched handoffs become invalid_handoff", () => {
  const result = evaluateMackValidationV0(report({ artifactRevisionId: "fedcba9876543210fedcba9876543210fedcba98" }), expected);
  assert.equal(result.status, "invalid_handoff");
  assert.ok(result.reasonCodes.includes("BINDING_MISMATCH"));
  assert.equal(result.advancementEligibility, "ineligible");
});

test("unavailable validation cannot become pass", () => {
  const result = evaluateMackValidationV0(report({ lanes: [{ laneId: "e2e", commandId: "e2e", outcome: "environment_blocked" }] }), expected);
  assert.equal(result.status, "inconclusive");
  assert.ok(result.reasonCodes.includes("VALIDATION_UNAVAILABLE"));
  assert.equal(result.advancementEligibility, "ineligible");
});

test("production-surface edits are rejected while approved test edits remain bounded", () => {
  const result = evaluateMackValidationV0(report({ editedTestSurfaces: ["packages/shield-team-system/src/mission-v2.mts"] }), expected);
  assert.equal(result.status, "invalid_handoff");
  assert.ok(result.reasonCodes.includes("TEST_SURFACE_OUT_OF_SCOPE"));
  const allowed = evaluateMackValidationV0(report({ editedTestSurfaces: expected.approvedTestSurfaces }), expected);
  assert.equal(allowed.advancementEligibility, "eligible");
});
