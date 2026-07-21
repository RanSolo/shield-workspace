import assert from "node:assert/strict";
import test from "node:test";

import {
  MISSION_DECISIONS,
  RISK_FLAGS,
  canDispatchSpecialists,
  classifyMissionRisk,
  evaluateLightweightTimeout,
  evaluateSpecialistIteration,
  getMissionTransition,
} from "../contracts/mission-policy.mjs";

const BASE_OPENED = "2025-01-01T12:00:00Z";
const BASE_DEADLINE = "2025-06-01T12:00:00Z";
const BASE_EVALUATED = "2025-07-01T12:00:00Z";

test("mission decisions allow only documented state transitions", () => {
  const allowed = [
    ["proposed", "approve", "approved"],
    ["proposed", "edit", "proposed"],
    ["proposed", "pause", "paused"],
    ["proposed", "reject", "rejected"],
    ["proposed", "cancel", "cancelled"],
    ["approved", "pause", "paused"],
    ["approved", "cancel", "cancelled"],
    ["paused", "cancel", "cancelled"],
  ];

  for (const [state, decision, expected] of allowed) {
    assert.equal(getMissionTransition(state, decision), expected);
  }
  assert.equal(
    getMissionTransition("paused", "resume", { resumeState: "proposed" }),
    "proposed",
  );
  assert.equal(
    getMissionTransition("paused", "resume", { resumeState: "approved" }),
    "approved",
  );

  for (const state of ["rejected", "cancelled", "unknown"]) {
    for (const decision of MISSION_DECISIONS) {
      assert.equal(getMissionTransition(state, decision), null);
    }
  }
  assert.equal(getMissionTransition("approved", "approve"), null);
  assert.equal(getMissionTransition("paused", "edit"), null);
  assert.equal(getMissionTransition("proposed", "unknown"), null);
  assert.equal(getMissionTransition("paused", "resume"), null);
  assert.equal(
    getMissionTransition("paused", "resume", { resumeState: "rejected" }),
    null,
  );
  assert.equal(getMissionTransition("toString", "approve"), null);
  assert.equal(getMissionTransition("__proto__", "approve"), null);
  assert.equal(getMissionTransition("proposed", "toString"), null);
});

test("risk classification is low only for complete all-false flags", () => {
  const allFalse = Object.fromEntries(RISK_FLAGS.map((flag) => [flag, false]));
  assert.deepEqual(classifyMissionRisk(allFalse), {
    level: "low",
    requiresExplicitApproval: false,
    reasons: [],
  });

  for (const flag of RISK_FLAGS) {
    const result = classifyMissionRisk({ ...allFalse, [flag]: true });
    assert.equal(result.level, "high");
    assert.equal(result.requiresExplicitApproval, true);
  }
});

test("risk classification fails closed for incomplete or malformed inputs", () => {
  const allFalse = Object.fromEntries(RISK_FLAGS.map((flag) => [flag, false]));
  const missing = { ...allFalse };
  const inheritedFalse = Object.create(allFalse);
  delete missing.production;

  for (const input of [
    undefined,
    null,
    [],
    missing,
    inheritedFalse,
    { ...allFalse, unknown: false },
    { ...allFalse, production: "no" },
  ]) {
    const result = classifyMissionRisk(input);
    assert.equal(result.level, "high");
    assert.equal(result.requiresExplicitApproval, true);
    assert.ok(result.reasons.length > 0);
  }
});

test("verified lightweight timeout permits only the recorded low-risk Hill plan", () => {
  const lowRiskFlags = Object.fromEntries(RISK_FLAGS.map((flag) => [flag, false]));
  const inheritedLowRiskFlags = Object.create(lowRiskFlags);
  const input = {
    riskFlags: lowRiskFlags,
    missionMode: "operations",
    recordedHillPlan: "Apply the recorded reversible documentation update.",
    timingEvidenceSource: "hostTrusted",
    windowOpenedAt: BASE_OPENED,
    deadlineAt: BASE_DEADLINE,
    evaluatedAt: BASE_EVALUATED,
    requiresSpecialists: false,
  };

  const result = evaluateLightweightTimeout(input);
  assert.deepEqual(result, {
    allowed: true,
    reason: "verified_lightweight_timeout",
  });
  assert.equal(Object.hasOwn(result, "approval"), false);

  const denied = [
    [
      { ...input, riskFlags: { ...lowRiskFlags, production: true } },
      "high_risk_denied",
    ],
    [{ ...input, riskFlags: inheritedLowRiskFlags }, "high_risk_denied"],
    [{ ...input, riskFlags: { ...lowRiskFlags, extra: false } }, "high_risk_denied"],
    [{ ...input, missionMode: "delivery" }, "operations_only"],
    [{ ...input, missionMode: "review" }, "operations_only"],
    [{ ...input, recordedHillPlan: "  " }, "plan_required"],
    [{ ...input, timingEvidenceSource: "inferred" }, "unknown_evidence_source"],
    [{ ...input, windowOpenedAt: undefined }, "malformed_timestamps"],
    [
      { ...input, windowOpenedAt: "2025-99-99T00:00:00Z" },
      "malformed_timestamps",
    ],
    [
      { ...input, deadlineAt: BASE_EVALUATED, evaluatedAt: BASE_DEADLINE },
      "chronology_error",
    ],
  ];

  for (const [candidate, reason] of denied) {
    assert.deepEqual(evaluateLightweightTimeout(candidate), {
      allowed: false,
      reason,
    });
  }
  for (const requiresSpecialists of [true, null, undefined, 0, "false"]) {
    assert.deepEqual(
      evaluateLightweightTimeout({ ...input, requiresSpecialists }),
      { allowed: false, reason: "specialist_required" },
    );
  }
});

test("specialist dispatch requires explicit Coulson approval", () => {
  assert.equal(
    canDispatchSpecialists({
      missionState: "approved",
      approvalSource: "coulson",
    }),
    true,
  );

  for (const input of [
    { missionState: "approved", approvalSource: "timeout" },
    { missionState: "approved", approvalSource: "hill" },
    { missionState: "proposed", approvalSource: "coulson" },
    {},
    null,
    [],
  ]) {
    assert.equal(canDispatchSpecialists(input), false);
  }
});

function iteration(overrides = {}) {
  return {
    iterationContractVersion: 1,
    missionId: "mission:67",
    subjectId: "issue:67",
    approvedObjectiveId: "objective:hill-iteration",
    currentObjectiveId: "objective:hill-iteration",
    artifactRevisionId: "revision:abc123",
    approvedOwningSeatId: "may",
    currentOwningSeatId: "may",
    requestedDisposition: "return_same_owner",
    proposedNextSeatId: "may",
    evidenceRefs: ["test:validation:new-failure"],
    newConcreteEvidence: true,
    observableProgress: true,
    problemCategoryChanged: false,
    validationObligationsSatisfied: false,
    sameUnresolvedFailureRepeating: false,
    materialScopeChange: false,
    materialRiskIncrease: false,
    authorityDecisionRequired: false,
    destructiveOrExternalEffect: false,
    unresolvedTradeoff: false,
    finalHumanGate: false,
    ...overrides,
  };
}

test("routine second and later evidence-backed corrections remain with the owning seat", () => {
  for (const owner of ["daisy", "may", "fury", "fitz", "simmons", "future-specialist"]) {
    for (const cycle of [2, 3, 9]) {
      const result = evaluateSpecialistIteration(iteration({
        approvedOwningSeatId: owner,
        currentOwningSeatId: owner,
        proposedNextSeatId: owner,
        evidenceRefs: [`cycle:${owner}:${cycle}`],
      }));
      assert.equal(result.state, "evaluated");
      assert.equal(result.authority, "non_authoritative");
      assert.equal(result.evidenceAssurance, "reference_only_unverified");
      assert.equal(result.evidenceFacts.newConcreteEvidence, true);
      assert.equal(Object.isFrozen(result.evidenceFacts), true);
      assert.equal(result.outcome, "eligible");
      assert.equal(result.nextSeatId, owner);
      assert.equal(result.requiresCoulson, false);
      assert.equal(result.reason, "evidence_backed_same_owner");
    }
  }
});

test("Hill can reroute changed problem categories or advance satisfied validation", () => {
  const reroute = evaluateSpecialistIteration(iteration({
    requestedDisposition: "reroute",
    proposedNextSeatId: "daisy",
    problemCategoryChanged: true,
  }));
  assert.equal(reroute.outcome, "eligible");
  assert.equal(reroute.nextSeatId, "daisy");
  assert.equal(reroute.reason, "evidence_backed_reroute");

  const advance = evaluateSpecialistIteration(iteration({
    requestedDisposition: "advance",
    proposedNextSeatId: "fury",
    validationObligationsSatisfied: true,
  }));
  assert.equal(advance.outcome, "eligible");
  assert.equal(advance.nextSeatId, "fury");
  assert.equal(advance.reason, "validation_gate_satisfied");
});

test("material gates take precedence over every Hill disposition", () => {
  const materialCases = [
    ["currentObjectiveId", "objective:changed", "objective_changed"],
    ["currentOwningSeatId", "daisy", "ownership_changed"],
    ["materialScopeChange", true, "material_scope_change"],
    ["materialRiskIncrease", true, "material_risk_increase"],
    ["authorityDecisionRequired", true, "authority_decision_required"],
    ["destructiveOrExternalEffect", true, "destructive_or_external_effect"],
    ["unresolvedTradeoff", true, "unresolved_tradeoff"],
    ["finalHumanGate", true, "final_human_gate"],
  ];
  for (const requestedDisposition of ["return_same_owner", "reroute", "advance", "escalate_coulson"]) {
    for (const [field, value, reason] of materialCases) {
      const result = evaluateSpecialistIteration(iteration({ requestedDisposition, [field]: value }));
      assert.equal(result.outcome, "escalate_coulson");
      assert.equal(result.requiresCoulson, true);
      assert.equal(result.reason, reason);
      assert.equal(result.nextSeatId, "coulson");
    }
  }
});

test("unsupported, stalled, and contradictory iteration requests hold without count escalation", () => {
  const cases = [
    [{ sameUnresolvedFailureRepeating: true }, "same_failure_repeating"],
    [{ newConcreteEvidence: false }, "new_evidence_required"],
    [{ observableProgress: false }, "observable_progress_required"],
    [{ proposedNextSeatId: "daisy" }, "same_owner_required"],
    [{ problemCategoryChanged: true }, "category_change_requires_reroute"],
    [{ validationObligationsSatisfied: true }, "validated_work_should_advance"],
    [{ requestedDisposition: "reroute", proposedNextSeatId: "may", problemCategoryChanged: true }, "distinct_reroute_seat_required"],
    [{ requestedDisposition: "reroute", proposedNextSeatId: "daisy" }, "category_change_not_established"],
    [{ requestedDisposition: "advance", proposedNextSeatId: "fury" }, "validation_not_satisfied"],
    [{ requestedDisposition: "reroute", proposedNextSeatId: "coulson", problemCategoryChanged: true }, "material_gate_not_established"],
    [{ requestedDisposition: "escalate_coulson" }, "material_gate_not_established"],
  ];
  for (const [overrides, reason] of cases) {
    const result = evaluateSpecialistIteration(iteration(overrides));
    assert.equal(result.outcome, "hold_for_evidence");
    assert.equal(result.requiresCoulson, false);
    assert.equal(result.reason, reason);
  }
});

test("specialist iteration rejects malformed, unknown, inherited, and accessor evidence", () => {
  const unknown = { ...iteration(), unknown: true };
  const inherited = Object.assign(Object.create({ inherited: true }), iteration());
  const accessor = iteration();
  Object.defineProperty(accessor, "missionId", { enumerable: true, get: () => "mission:67" });
  const hostileProxy = new Proxy(iteration(), { ownKeys: () => { throw new Error("trap"); } });
  const hostileEvidence = iteration();
  hostileEvidence.evidenceRefs = new Proxy(["test:evidence"], { getOwnPropertyDescriptor: () => { throw new Error("trap"); } });
  for (const value of [null, [], {}, unknown, inherited, accessor, hostileProxy, hostileEvidence,
    { ...iteration(), approvedOwningSeatId: "coulson", currentOwningSeatId: "coulson" },
    { ...iteration(), approvedOwningSeatId: "runtime:ornith", currentOwningSeatId: "runtime:ornith", proposedNextSeatId: "runtime:ornith" },
    { ...iteration(), proposedNextSeatId: "executor:local" },
    { ...iteration(), proposedNextSeatId: "hill" },
    { ...iteration(), evidenceRefs: [] },
    { ...iteration(), evidenceRefs: ["test:duplicate", "test:duplicate"] },
  ]) {
    const result = evaluateSpecialistIteration(value);
    assert.deepEqual(result, {
      state: "invalid", iterationContractVersion: 1, authority: "non_authoritative",
      outcome: "escalate_coulson", requestedDisposition: null, nextSeatId: null,
      requiresCoulson: true, reason: "invalid_evidence_packet",
    });
  }
});
