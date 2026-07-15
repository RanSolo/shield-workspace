import assert from "node:assert/strict";
import test from "node:test";

import {
  MISSION_DECISIONS,
  RISK_FLAGS,
  authorizeRepair,
  canDispatchSpecialists,
  classifyMissionRisk,
  evaluateLightweightTimeout,
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

test("repair policy allows one automatic cycle and enforces authorization and cap", () => {
  assert.deepEqual(authorizeRepair({ completedRepairs: 0, hardCap: 3 }), {
    allowed: true,
    requiresCoulson: false,
    reason: "automatic_repair",
    hardCap: 3,
  });

  assert.deepEqual(authorizeRepair({ completedRepairs: 1, hardCap: 3 }), {
    allowed: false,
    requiresCoulson: true,
    reason: "coulson_authorization_required",
    hardCap: 3,
  });
  assert.deepEqual(
    authorizeRepair({
      completedRepairs: 1,
      hardCap: 3,
      coulsonAuthorized: true,
    }),
    {
      allowed: true,
      requiresCoulson: false,
      reason: "manual_repair",
      hardCap: 3,
    },
  );

  for (const input of [
    { completedRepairs: 3, hardCap: 3 },
    { completedRepairs: 3, hardCap: 3, coulsonAuthorized: true },
    { completedRepairs: 4, hardCap: 3, coulsonAuthorized: true },
  ]) {
    assert.deepEqual(authorizeRepair(input), {
      allowed: false,
      requiresCoulson: false,
      reason: "hard_cap_reached",
      hardCap: 3,
    });
  }

  for (const hardCap of [undefined, null, 0, -1, 1.5, "3"]) {
    assert.equal(authorizeRepair({ completedRepairs: 0, hardCap }).hardCap, 1);
  }
  for (const completedRepairs of [undefined, null, -1, 1.5, "1"]) {
    const result = authorizeRepair({ completedRepairs });
    assert.equal(result.allowed, false);
    assert.equal(result.requiresCoulson, true);
    assert.equal(result.reason, "invalid_completed_repairs");
  }
});
