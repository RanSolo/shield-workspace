export const MISSION_DECISIONS = Object.freeze([
  "approve",
  "edit",
  "reject",
  "pause",
  "resume",
  "cancel",
]);

export const MISSION_STATES = Object.freeze([
  "proposed",
  "approved",
  "paused",
  "rejected",
  "cancelled",
]);

export const TERMINAL_MISSION_STATES = Object.freeze(["rejected", "cancelled"]);

const TRANSITIONS = {
  proposed: {
    approve: "approved",
    edit: "proposed",
    pause: "paused",
    reject: "rejected",
    cancel: "cancelled",
  },
  approved: { pause: "paused", cancel: "cancelled" },
  paused: { cancel: "cancelled" },
};

export function getMissionTransition(fromState, decision, context = {}) {
  if (!Object.hasOwn(TRANSITIONS, fromState)) return null;
  if (fromState === "paused" && decision === "resume") {
    const resumeState = isPlainObject(context) ? context.resumeState : undefined;
    return resumeState === "proposed" || resumeState === "approved"
      ? resumeState
      : null;
  }

  const rules = TRANSITIONS[fromState];
  if (!Object.hasOwn(rules, decision)) return null;
  return rules[decision];
}

export const RISK_FLAGS = Object.freeze([
  "production",
  "destructive",
  "migration",
  "credentialsOrSecurity",
  "externalCommunication",
  "merge",
  "deploy",
  "release",
  "hillHighRisk",
]);

const KNOWN_RISK_FLAGS = new Set(RISK_FLAGS);

function failClosedRisk(reason) {
  return {
    level: "high",
    requiresExplicitApproval: true,
    reasons: [reason],
  };
}

export function classifyMissionRisk(flags) {
  if (!isPlainObject(flags)) {
    return failClosedRisk("Input must be a plain object.");
  }

  for (const [key, value] of Object.entries(flags)) {
    if (!KNOWN_RISK_FLAGS.has(key)) {
      return failClosedRisk(`Unknown flag: "${key}".`);
    }
    if (typeof value !== "boolean") {
      return failClosedRisk(`Flag "${key}" must be boolean.`);
    }
  }

  const missing = RISK_FLAGS.filter((flag) => !Object.hasOwn(flags, flag));
  if (missing.length > 0) {
    return failClosedRisk(`Missing required flag(s): ${missing.join(", ")}.`);
  }

  const trueFlags = RISK_FLAGS.filter((flag) => flags[flag] === true);
  if (trueFlags.length === 0) {
    return {
      level: "low",
      requiresExplicitApproval: false,
      reasons: [],
    };
  }

  return {
    level: "high",
    requiresExplicitApproval: true,
    reasons: trueFlags.map((flag) => `Flag "${flag}" is enabled.`),
  };
}

export const TIMING_EVIDENCE_SOURCES = Object.freeze([
  "hostTrusted",
  "humanRecorded",
]);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

const ISO_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i;

function isValidIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return ISO_WITH_TIMEZONE.test(trimmed) && Number.isFinite(Date.parse(trimmed));
}

export function evaluateLightweightTimeout(input) {
  if (!isPlainObject(input)) return { allowed: false, reason: "invalid_input" };

  const risk = classifyMissionRisk(input.riskFlags);
  if (risk.level !== "low") {
    return { allowed: false, reason: "high_risk_denied" };
  }
  if (input.missionMode !== "operations") {
    return { allowed: false, reason: "operations_only" };
  }

  const plan =
    typeof input.recordedHillPlan === "string"
      ? input.recordedHillPlan.trim()
      : "";
  if (!plan) return { allowed: false, reason: "plan_required" };
  if (!TIMING_EVIDENCE_SOURCES.includes(input.timingEvidenceSource)) {
    return { allowed: false, reason: "unknown_evidence_source" };
  }

  const opened = input.windowOpenedAt;
  const deadline = input.deadlineAt;
  const evaluated = input.evaluatedAt;
  if (
    !isValidIsoTimestamp(opened) ||
    !isValidIsoTimestamp(deadline) ||
    !isValidIsoTimestamp(evaluated)
  ) {
    return { allowed: false, reason: "malformed_timestamps" };
  }
  if (Date.parse(opened) > Date.parse(deadline) || Date.parse(deadline) > Date.parse(evaluated)) {
    return { allowed: false, reason: "chronology_error" };
  }
  if (input.requiresSpecialists !== false) {
    return { allowed: false, reason: "specialist_required" };
  }

  return { allowed: true, reason: "verified_lightweight_timeout" };
}

export function canDispatchSpecialists(input) {
  if (!isPlainObject(input)) return false;
  return (
    input.missionState === "approved" && input.approvalSource === "coulson"
  );
}

export function authorizeRepair(input) {
  const fail = (reason, requiresCoulson = true) => ({
    allowed: false,
    requiresCoulson,
    reason,
    hardCap: 1,
  });

  if (!isPlainObject(input)) return fail("invalid_input");

  const { completedRepairs, coulsonAuthorized, hardCap: suppliedHardCap } = input;
  if (!Number.isInteger(completedRepairs) || completedRepairs < 0) {
    return fail("invalid_completed_repairs");
  }

  const hardCap =
    Number.isInteger(suppliedHardCap) && suppliedHardCap > 0 ? suppliedHardCap : 1;

  if (completedRepairs >= hardCap) {
    return {
      allowed: false,
      requiresCoulson: false,
      reason: "hard_cap_reached",
      hardCap,
    };
  }
  if (completedRepairs === 0) {
    return {
      allowed: true,
      requiresCoulson: false,
      reason: "automatic_repair",
      hardCap,
    };
  }
  if (coulsonAuthorized === true) {
    return {
      allowed: true,
      requiresCoulson: false,
      reason: "manual_repair",
      hardCap,
    };
  }
  return {
    allowed: false,
    requiresCoulson: true,
    reason: "coulson_authorization_required",
    hardCap,
  };
}
