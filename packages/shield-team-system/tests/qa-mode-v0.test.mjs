import assert from "node:assert/strict";
import test from "node:test";
import { createQaHandoffV0, evaluateQaValidationV0 } from "../dist/qa-mode-v0.mjs";

const head = "50afdc9de3f71f6f83deb6c2f00ace2c991fcee5";
const handoff = {
  schemaVersion: 1,
  contractVersion: "qa.mode.v0",
  missionId: "mission-103-proof",
  subjectId: "fixture-qa-reversible",
  missionBriefRevisionId: "brief-103-v0",
  repository: "RanSolo/shield-workspace",
  branch: "main",
  artifactRevisionId: head,
  acceptanceCriteria: ["The corrected behavior is observable.", "The old behavior is covered by regression evidence."],
  scenarios: [
    { scenarioId: "happy", kind: "happy_path", acceptanceCriterionRef: "criterion:observable", required: true },
    { scenarioId: "boundary", kind: "boundary_null", acceptanceCriterionRef: "criterion:observable", required: true },
    { scenarioId: "mismatch", kind: "binding_mismatch", acceptanceCriterionRef: "criterion:observable", required: true },
    { scenarioId: "refresh", kind: "refresh_stale", acceptanceCriterionRef: "criterion:observable", required: true },
    { scenarioId: "not-applicable", kind: "non_applicable", acceptanceCriterionRef: "criterion:regression", required: true },
    { scenarioId: "regression", kind: "regression", acceptanceCriterionRef: "criterion:regression", required: true },
  ],
  approvedLanes: [{ laneId: "focused", commandId: "node-test", evidenceRef: "test:qa-mode-v0" }],
  approvedTestSurfaces: ["packages/shield-team-system/tests/qa-mode-v0.test.mjs"],
};

function report(overrides = {}) {
  return {
    schemaVersion: 1,
    contractVersion: "mack.validation.v0",
    assuranceKind: "host_asserted_non_authoritative",
    missionId: handoff.missionId,
    subjectId: handoff.subjectId,
    repository: handoff.repository,
    branch: handoff.branch,
    artifactRevisionId: handoff.artifactRevisionId,
    status: "pass",
    scenarios: handoff.scenarios.map(({ scenarioId }) => ({ scenarioId, required: true, covered: true })),
    lanes: [{ laneId: "focused", commandId: "node-test", outcome: "pass" }],
    findings: [],
    evidenceRefs: ["test:qa-mode-v0"],
    limitations: [],
    editedTestSurfaces: [],
    recommendedRoute: "advance",
    ...overrides,
  };
}

test("Hill freezes an exact-head QA handoff for Mack", () => {
  const result = createQaHandoffV0(handoff);
  assert.equal(result.state, "ready");
  assert.equal(result.handoff.ownership.implementationSeatId, "may");
  assert.equal(result.handoff.ownership.validationSeatId, "mack");
  assert.equal(result.handoff.ownership.routingSeatId, "hill");
  assert.equal(result.handoff.approvedLanes[0].commandId, "node-test");
});

test("bounded proving fixture passes all six required behavioral scenarios", () => {
  const result = evaluateQaValidationV0(handoff, report());
  assert.equal(result.state, "evaluated");
  assert.equal(result.outcome, "pass");
  assert.equal(result.advancementEligibility, "eligible");
  assert.equal(result.route, "advance");
});

test("stale or mismatched handoff cannot advance", () => {
  const result = evaluateQaValidationV0(handoff, report({ artifactRevisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
  assert.equal(result.outcome, "invalid_handoff");
  assert.equal(result.advancementEligibility, "ineligible");
});

test("unapproved lanes and missing scenarios remain closed", () => {
  const lane = evaluateQaValidationV0(handoff, report({ lanes: [{ laneId: "unapproved", commandId: "shell", outcome: "pass" }] }));
  assert.equal(lane.outcome, "invalid_handoff");
  assert.ok(lane.reasonCodes.includes("APPROVED_LANE_MISMATCH"));
  const missing = evaluateQaValidationV0(handoff, report({ scenarios: report().scenarios.slice(0, -1) }));
  assert.equal(missing.outcome, "inconclusive");
  assert.ok(missing.reasonCodes.includes("REQUIRED_SCENARIO_MISSING"));
});

test("inconclusive Mack evidence cannot be promoted by QA Mode", () => {
  const result = evaluateQaValidationV0(handoff, report({ lanes: [{ laneId: "focused", commandId: "node-test", outcome: "inconclusive" }] }));
  assert.equal(result.outcome, "inconclusive");
  assert.equal(result.advancementEligibility, "ineligible");
});
