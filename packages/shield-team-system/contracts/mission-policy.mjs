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

export const SPECIALIST_ITERATION_CONTRACT_VERSION = 1;

export const SPECIALIST_ITERATION_DISPOSITIONS = Object.freeze([
  "return_same_owner",
  "reroute",
  "advance",
  "escalate_coulson",
]);

const ITERATION_FIELDS = Object.freeze([
  "iterationContractVersion", "missionId", "subjectId", "approvedObjectiveId",
  "currentObjectiveId", "artifactRevisionId", "approvedOwningSeatId",
  "currentOwningSeatId",
  "requestedDisposition", "proposedNextSeatId", "evidenceRefs",
  "newConcreteEvidence", "observableProgress", "problemCategoryChanged",
  "validationObligationsSatisfied", "sameUnresolvedFailureRepeating",
  "materialScopeChange", "materialRiskIncrease", "authorityDecisionRequired",
  "destructiveOrExternalEffect", "unresolvedTradeoff", "finalHumanGate",
]);
const ITERATION_BOOLEAN_FIELDS = Object.freeze(ITERATION_FIELDS.slice(11));
const ITERATION_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/;
const ITERATION_EVIDENCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;

function closedDataObject(value, fields) {
  if (!isPlainObject(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || descriptor.get || descriptor.set) return null;
    output[field] = descriptor.value;
  }
  return output;
}

function iterationIdentifier(value) {
  return typeof value === "string" && ITERATION_IDENTIFIER.test(value);
}

function iterationEvidenceRefs(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > 16) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length + 1 || !keys.includes("length") || expectedKeys.some((key) => !keys.includes(key))) return null;
  const refs = [];
  const seen = new Set();
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || typeof descriptor.value !== "string" || !ITERATION_EVIDENCE_REF.test(descriptor.value) || seen.has(descriptor.value)) return null;
    seen.add(descriptor.value);
    refs.push(descriptor.value);
  }
  return Object.freeze(refs);
}

const INVALID_ITERATION = Object.freeze({
  state: "invalid",
  iterationContractVersion: SPECIALIST_ITERATION_CONTRACT_VERSION,
  authority: "non_authoritative",
  outcome: "escalate_coulson",
  requestedDisposition: null,
  nextSeatId: null,
  requiresCoulson: true,
  reason: "invalid_evidence_packet",
});

function iterationResult(input, outcome, nextSeatId, requiresCoulson, reason) {
  const evidenceFacts = {};
  for (const field of ITERATION_BOOLEAN_FIELDS) evidenceFacts[field] = input[field];
  return Object.freeze({
    state: "evaluated",
    iterationContractVersion: SPECIALIST_ITERATION_CONTRACT_VERSION,
    authority: "non_authoritative",
    missionId: input.missionId,
    subjectId: input.subjectId,
    approvedObjectiveId: input.approvedObjectiveId,
    currentObjectiveId: input.currentObjectiveId,
    artifactRevisionId: input.artifactRevisionId,
    approvedOwningSeatId: input.approvedOwningSeatId,
    currentOwningSeatId: input.currentOwningSeatId,
    evidenceRefs: input.evidenceRefs,
    evidenceAssurance: "reference_only_unverified",
    evidenceFacts: Object.freeze(evidenceFacts),
    outcome,
    requestedDisposition: input.requestedDisposition,
    nextSeatId,
    requiresCoulson,
    reason,
  });
}

function evaluateSpecialistIterationUnchecked(inputValue) {
  const input = closedDataObject(inputValue, ITERATION_FIELDS);
  if (input === null || input.iterationContractVersion !== SPECIALIST_ITERATION_CONTRACT_VERSION) return INVALID_ITERATION;
  for (const field of ["missionId", "subjectId", "approvedObjectiveId", "currentObjectiveId", "artifactRevisionId", "approvedOwningSeatId", "currentOwningSeatId"]) {
    if (!iterationIdentifier(input[field])) return INVALID_ITERATION;
  }
  if (!SPECIALIST_ITERATION_DISPOSITIONS.includes(input.requestedDisposition) ||
      (input.proposedNextSeatId !== null && !iterationIdentifier(input.proposedNextSeatId)) ||
      input.approvedOwningSeatId === "coulson" || input.currentOwningSeatId === "coulson" ||
      ITERATION_BOOLEAN_FIELDS.some((field) => typeof input[field] !== "boolean")) return INVALID_ITERATION;
  input.evidenceRefs = iterationEvidenceRefs(input.evidenceRefs);
  if (input.evidenceRefs === null) return INVALID_ITERATION;

  if (input.approvedObjectiveId !== input.currentObjectiveId) return iterationResult(input, "escalate_coulson", "coulson", true, "objective_changed");
  if (input.approvedOwningSeatId !== input.currentOwningSeatId) return iterationResult(input, "escalate_coulson", "coulson", true, "ownership_changed");
  for (const [field, reason] of [
    ["materialScopeChange", "material_scope_change"],
    ["materialRiskIncrease", "material_risk_increase"],
    ["authorityDecisionRequired", "authority_decision_required"],
    ["destructiveOrExternalEffect", "destructive_or_external_effect"],
    ["unresolvedTradeoff", "unresolved_tradeoff"],
    ["finalHumanGate", "final_human_gate"],
  ]) if (input[field]) return iterationResult(input, "escalate_coulson", "coulson", true, reason);

  if (input.proposedNextSeatId === "coulson") return iterationResult(input, "hold_for_evidence", null, false, "material_gate_not_established");
  if (input.requestedDisposition === "escalate_coulson") return iterationResult(input, "hold_for_evidence", null, false, "material_gate_not_established");
  if (input.sameUnresolvedFailureRepeating) return iterationResult(input, "hold_for_evidence", null, false, "same_failure_repeating");
  if (!input.newConcreteEvidence) return iterationResult(input, "hold_for_evidence", null, false, "new_evidence_required");
  if (!input.observableProgress) return iterationResult(input, "hold_for_evidence", null, false, "observable_progress_required");

  if (input.requestedDisposition === "return_same_owner") {
    if (input.proposedNextSeatId !== input.currentOwningSeatId) return iterationResult(input, "hold_for_evidence", null, false, "same_owner_required");
    if (input.problemCategoryChanged) return iterationResult(input, "hold_for_evidence", null, false, "category_change_requires_reroute");
    if (input.validationObligationsSatisfied) return iterationResult(input, "hold_for_evidence", null, false, "validated_work_should_advance");
    return iterationResult(input, "eligible", input.currentOwningSeatId, false, "evidence_backed_same_owner");
  }

  if (input.requestedDisposition === "reroute") {
    if (input.proposedNextSeatId === null || input.proposedNextSeatId === input.currentOwningSeatId) return iterationResult(input, "hold_for_evidence", null, false, "distinct_reroute_seat_required");
    if (!input.problemCategoryChanged) return iterationResult(input, "hold_for_evidence", null, false, "category_change_not_established");
    if (input.validationObligationsSatisfied) return iterationResult(input, "hold_for_evidence", null, false, "validated_work_should_advance");
    return iterationResult(input, "eligible", input.proposedNextSeatId, false, "evidence_backed_reroute");
  }

  if (input.proposedNextSeatId === null || input.proposedNextSeatId === input.currentOwningSeatId) return iterationResult(input, "hold_for_evidence", null, false, "next_stage_seat_required");
  if (input.problemCategoryChanged) return iterationResult(input, "hold_for_evidence", null, false, "category_change_requires_reroute");
  if (!input.validationObligationsSatisfied) return iterationResult(input, "hold_for_evidence", null, false, "validation_not_satisfied");
  return iterationResult(input, "eligible", input.proposedNextSeatId, false, "validation_gate_satisfied");
}

export function evaluateSpecialistIteration(inputValue) {
  try {
    return evaluateSpecialistIterationUnchecked(inputValue);
  } catch {
    return INVALID_ITERATION;
  }
}
