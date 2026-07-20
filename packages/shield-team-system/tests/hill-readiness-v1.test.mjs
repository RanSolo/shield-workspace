import assert from "node:assert/strict";
import test from "node:test";

import {
  HILL_READINESS_DIMENSIONS,
  HILL_READINESS_REASON_CODES,
  evaluateHillReadinessV1,
} from "../contracts/hill-readiness-v1.mjs";
import { ISSUE_34_RETROSPECTIVE_FIXTURE } from "./fixtures/hill-readiness-v1-issue-34.mjs";

function candidate(statuses = {}) {
  return {
    readinessContractVersion: 1,
    missionId: "mission:58",
    subjectId: "brief:58",
    revisionId: "revision:abc123",
    artifactKind: "mission_brief",
    owningSeatId: "may",
    dimensions: HILL_READINESS_DIMENSIONS.map((dimension) => ({
      dimension,
      status: statuses[dimension] ?? "satisfied",
      evidenceRefs: [`repo:docs/issue-58#${dimension}`],
      operationalNotApplicableRationale: null,
    })),
  };
}

function observation(overrides = {}) {
  return {
    observationContractVersion: 1,
    assuranceKind: "host_asserted_non_authoritative",
    missionId: "mission:58",
    subjectId: "brief:58",
    currentRevisionId: "revision:abc123",
    artifactKind: "mission_brief",
    owningSeatId: "may",
    journalSchemaVersion: 6,
    evaluatedThroughSequence: 12,
    journalHeadEntryId: "entry:mission-58:12",
    refinementPassesCompleted: 0,
    reasoningRuntimeId: "runtime:ornith-1.0-35b",
    toolExecutorId: "executor:codex-host",
    ...overrides,
  };
}

test("all satisfied evidence produces an immutable advisory GOOD_ENOUGH result", () => {
  const result = evaluateHillReadinessV1(candidate(), observation());
  assert.equal(result.state, "evaluated");
  assert.equal(result.outcome, "GOOD_ENOUGH");
  assert.equal(result.authority, "non_authoritative");
  assert.equal(result.assessorSeatId, "hill");
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.nextOwnerSeatId, null);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.replayBinding), true);
  assert.equal(result.replayBinding.observationContractVersion, 1);
  assert.equal(result.replayBinding.missionId, "mission:58");
  assert.equal(Object.isFrozen(result.dimensionAssessments), true);
  assert.equal(Object.isFrozen(result.dimensionAssessments[0].evidenceRefs), true);
  assert.equal(Object.isFrozen(result.reasonCodes), true);
  assert.equal(Object.isFrozen(result.refinementRequests), true);
});

test("the closed operational not-applicable rationale can satisfy the rubric", () => {
  const input = candidate();
  input.dimensions[5].status = "not_applicable";
  input.dimensions[5].operationalNotApplicableRationale = "pure_value_contract";
  const result = evaluateHillReadinessV1(input, observation());
  assert.equal(result.outcome, "GOOD_ENOUGH");
});

test("every refinement status maps to its closed reason in canonical order", () => {
  const expected = [
    "SCOPE_INCOMPLETE",
    "AUTHORITY_SAFETY_INCOMPLETE",
    "CONTRACT_INCONSISTENT",
    "IMPLEMENTATION_UNBOUNDED",
    "VALIDATION_INCOMPLETE",
    "OPERATIONAL_DETAILS_INCOMPLETE",
    "OWNERSHIP_CONTINUITY_INCOMPLETE",
    "ESCALATION_PREPARATION_INCOMPLETE",
  ];
  const statuses = Object.fromEntries(
    HILL_READINESS_DIMENSIONS.map((dimension) => [dimension, "refinement_required"]),
  );
  const result = evaluateHillReadinessV1(candidate(statuses), observation());
  assert.equal(result.outcome, "NEEDS_REFINEMENT");
  assert.deepEqual(result.reasonCodes, expected);
  assert.deepEqual(result.refinementRequests.map(({ dimension }) => dimension),
    HILL_READINESS_DIMENSIONS);
  assert.equal(result.nextOwnerSeatId, "may");
  assert.equal(Object.isFrozen(result.refinementRequests[0]), true);
});

test("escalation takes precedence over refinement and preserves canonical reasons", () => {
  const result = evaluateHillReadinessV1(candidate({
    scope_completeness: "refinement_required",
    authority_safety: "escalation_required",
  }), observation());
  assert.equal(result.outcome, "BLOCKED_ESCALATE");
  assert.deepEqual(result.reasonCodes, ["SCOPE_INCOMPLETE", "AUTHORITY_DECISION_REQUIRED"]);
  assert.equal(result.nextOwnerSeatId, null);
});

test("a second asserted refinement need escalates instead of recurring", () => {
  const result = evaluateHillReadinessV1(
    candidate({ validation_readiness: "refinement_required" }),
    observation({ refinementPassesCompleted: 1 }),
  );
  assert.equal(result.outcome, "BLOCKED_ESCALATE");
  assert.deepEqual(result.reasonCodes, ["VALIDATION_INCOMPLETE", "REFINEMENT_LIMIT_REACHED"]);
  assert.equal(result.nextOwnerSeatId, null);
});

test("replay identity mismatch and stale revision fail closed before dimensions", () => {
  for (const changedBinding of [
    { subjectId: "brief:other" },
    { artifactKind: "implementation_blueprint" },
    { owningSeatId: "daisy" },
  ]) {
    const replayMismatch = evaluateHillReadinessV1(
      candidate({ scope_completeness: "refinement_required" }),
      observation(changedBinding),
    );
    assert.equal(replayMismatch.outcome, "BLOCKED_ESCALATE");
    assert.deepEqual(replayMismatch.reasonCodes, ["REPLAY_BINDING_MISMATCH"]);
  }

  const stale = evaluateHillReadinessV1(
    candidate({ authority_safety: "escalation_required" }),
    observation({ currentRevisionId: "revision:new-head" }),
  );
  assert.equal(stale.outcome, "BLOCKED_ESCALATE");
  assert.deepEqual(stale.reasonCodes, ["ARTIFACT_REVISION_STALE"]);
});

test("runtime and executor assurances cannot claim a seat identity", () => {
  for (const overrides of [
    { reasoningRuntimeId: "fury" },
    { reasoningRuntimeId: "Fitz" },
    { toolExecutorId: "may" },
    { toolExecutorId: "HILL" },
  ]) {
    assert.deepEqual(evaluateHillReadinessV1(candidate(), observation(overrides)), {
      state: "invalid",
      readinessContractVersion: 1,
      outcome: "BLOCKED_ESCALATE",
      reasonCodes: ["INVALID_EVIDENCE_RECORD"],
      nextOwnerSeatId: null,
    });
  }
  assert.equal(evaluateHillReadinessV1(
    candidate(), observation({ reasoningRuntimeId: null, toolExecutorId: null }),
  ).outcome, "GOOD_ENOUGH");
});

test("artifact ownership accepts only a closed SHIELD seat identity", () => {
  for (const owningSeatId of ["unknown-seat", "runtime:ornith-1.0-35b", "executor:host", "May"] ) {
    assert.equal(evaluateHillReadinessV1(
      { ...candidate(), owningSeatId }, observation(),
    ).state, "invalid");
    assert.equal(evaluateHillReadinessV1(
      candidate(), observation({ owningSeatId }),
    ).state, "invalid");
  }
});

test("one non-null identity cannot be both reasoning runtime and tool executor", () => {
  const result = evaluateHillReadinessV1(candidate(), observation({
    reasoningRuntimeId: "runtime:codex",
    toolExecutorId: "runtime:codex",
  }));
  assert.equal(result.state, "invalid");
  assert.deepEqual(result.reasonCodes, ["INVALID_EVIDENCE_RECORD"]);
});

test("malformed and hostile inputs return one generic value and never throw", () => {
  const accessor = candidate();
  Object.defineProperty(accessor, "missionId", { get() { throw new Error("must not run"); } });
  const sparse = candidate();
  delete sparse.dimensions[3];
  const inherited = Object.create(candidate());
  const symbol = candidate();
  symbol[Symbol("hidden")] = true;
  const throwingProxy = new Proxy({}, { ownKeys() { throw new Error("hostile"); } });
  const unknown = { ...candidate(), callerReason: "trust-me" };
  const invalidNA = candidate();
  invalidNA.dimensions[0].status = "not_applicable";
  invalidNA.dimensions[0].operationalNotApplicableRationale = "pure_value_contract";
  const duplicatedRef = candidate();
  duplicatedRef.dimensions[0].evidenceRefs = ["repo:a", "repo:a"];
  const tooManyRefs = candidate();
  tooManyRefs.dimensions[0].evidenceRefs = Array.from({ length: 9 }, (_, index) => `repo:${index}`);

  const expected = evaluateHillReadinessV1(null, null);
  for (const value of [
    accessor, sparse, inherited, symbol, throwingProxy, unknown, invalidNA, duplicatedRef, tooManyRefs,
  ]) {
    assert.doesNotThrow(() => evaluateHillReadinessV1(value, observation()));
    assert.strictEqual(evaluateHillReadinessV1(value, observation()), expected);
  }
  assert.equal(Object.isFrozen(expected), true);
  assert.equal(Object.isFrozen(expected.reasonCodes), true);
});

test("dense array inspection never invokes a proxy property get trap", () => {
  const input = candidate();
  let getTrapCount = 0;
  input.dimensions = new Proxy(input.dimensions, {
    get() {
      getTrapCount += 1;
      throw new Error("array properties must not be read through the proxy");
    },
  });
  const result = evaluateHillReadinessV1(input, observation());
  assert.equal(result.outcome, "GOOD_ENOUGH");
  assert.equal(getTrapCount, 0);
});

test("identifier, evidence, observation, order, and version bounds fail generically", () => {
  const reordered = candidate();
  [reordered.dimensions[0], reordered.dimensions[1]] =
    [reordered.dimensions[1], reordered.dimensions[0]];
  const longIdentifier = candidate();
  longIdentifier.missionId = `m${"a".repeat(128)}`;
  const badEvidence = candidate();
  badEvidence.dimensions[0].evidenceRefs = ["repo:path?secret=true"];
  const candidates = [
    { ...candidate(), readinessContractVersion: 2 },
    reordered,
    longIdentifier,
    badEvidence,
  ];
  const observations = [
    { ...observation(), observationContractVersion: 2 },
    { ...observation(), assuranceKind: "verified" },
    { ...observation(), journalSchemaVersion: 256 },
    { ...observation(), evaluatedThroughSequence: -1 },
    { ...observation(), refinementPassesCompleted: 2 },
  ];
  for (const value of candidates) assert.equal(
    evaluateHillReadinessV1(value, observation()).state, "invalid",
  );
  for (const value of observations) assert.equal(
    evaluateHillReadinessV1(candidate(), value).state, "invalid",
  );
});

test("the Issue #34 fixture is retrospective and prediction-ineligible", () => {
  assert.equal(ISSUE_34_RETROSPECTIVE_FIXTURE.fixtureKind, "retrospective_observation");
  assert.equal(ISSUE_34_RETROSPECTIVE_FIXTURE.predictionEligible, false);
  const result = evaluateHillReadinessV1(
    ISSUE_34_RETROSPECTIVE_FIXTURE.candidate,
    ISSUE_34_RETROSPECTIVE_FIXTURE.hostObservation,
  );
  assert.equal(result.outcome, ISSUE_34_RETROSPECTIVE_FIXTURE.expectedOutcome);
  assert.equal(result.nextOwnerSeatId, "may");
});

test("the reason registry contains every emitted reason", () => {
  for (const reason of [
    "INVALID_EVIDENCE_RECORD", "REPLAY_BINDING_MISMATCH", "ARTIFACT_REVISION_STALE",
    "REFINEMENT_LIMIT_REACHED", "SCOPE_INCOMPLETE", "AUTHORITY_DECISION_REQUIRED",
  ]) assert.ok(HILL_READINESS_REASON_CODES.includes(reason));
});
