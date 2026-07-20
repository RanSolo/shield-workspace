export const HILL_READINESS_SCHEMA_VERSION = 1;
export const HILL_READINESS_RUBRIC_VERSION = "hill.readiness.v1";
export const HILL_READINESS_MAX_REFINEMENTS = 1;

export const HILL_READINESS_DIMENSIONS = Object.freeze([
  "scope_completeness",
  "authority_safety",
  "contract_consistency",
  "implementation_boundedness",
  "validation_readiness",
  "operational_completeness",
  "ownership_continuity",
  "escalation_fitness",
]);

export const HILL_READINESS_EVIDENCE_STATUSES = Object.freeze([
  "satisfied",
  "refinement_required",
  "escalation_required",
  "not_applicable",
]);

export const HILL_READINESS_OUTCOMES = Object.freeze([
  "GOOD_ENOUGH",
  "NEEDS_REFINEMENT",
  "BLOCKED_ESCALATE",
]);

export const HILL_READINESS_OPERATIONAL_NA_RATIONALES = Object.freeze([
  "pure_value_contract",
  "documentation_only_artifact",
  "no_runtime_or_persistent_effects",
]);

export const HILL_READINESS_REASON_CODES = Object.freeze([
  "INVALID_EVIDENCE_RECORD",
  "REPLAY_BINDING_MISMATCH",
  "ARTIFACT_REVISION_STALE",
  "REFINEMENT_LIMIT_REACHED",
  "SCOPE_INCOMPLETE",
  "SCOPE_DECISION_REQUIRED",
  "AUTHORITY_SAFETY_INCOMPLETE",
  "AUTHORITY_DECISION_REQUIRED",
  "CONTRACT_INCONSISTENT",
  "CONTRACT_DECISION_REQUIRED",
  "IMPLEMENTATION_UNBOUNDED",
  "IMPLEMENTATION_SCOPE_DECISION_REQUIRED",
  "VALIDATION_INCOMPLETE",
  "VALIDATION_DECISION_REQUIRED",
  "OPERATIONAL_DETAILS_INCOMPLETE",
  "OPERATIONAL_ARCHITECTURE_DECISION_REQUIRED",
  "OWNERSHIP_CONTINUITY_INCOMPLETE",
  "OWNERSHIP_DECISION_REQUIRED",
  "ESCALATION_PREPARATION_INCOMPLETE",
  "ESCALATION_TARGET_DECISION_REQUIRED",
]);

const SEAT_IDS = Object.freeze([
  "coulson", "hill", "daisy", "may", "fury", "fitz", "simmons",
]);
const CANDIDATE_FIELDS = Object.freeze([
  "readinessContractVersion", "missionId", "subjectId", "revisionId",
  "artifactKind", "owningSeatId", "dimensions",
]);
const OBSERVATION_FIELDS = Object.freeze([
  "observationContractVersion", "assuranceKind", "missionId", "subjectId",
  "currentRevisionId", "artifactKind", "owningSeatId", "journalSchemaVersion", "evaluatedThroughSequence",
  "journalHeadEntryId", "refinementPassesCompleted", "reasoningRuntimeId",
  "toolExecutorId",
]);
const ASSESSMENT_FIELDS = Object.freeze([
  "dimension", "status", "evidenceRefs", "operationalNotApplicableRationale",
]);
const IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]{0,126}[A-Za-z0-9])?$/;
const EVIDENCE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;

const REASONS = Object.freeze({
  scope_completeness: Object.freeze({
    refinement_required: "SCOPE_INCOMPLETE",
    escalation_required: "SCOPE_DECISION_REQUIRED",
  }),
  authority_safety: Object.freeze({
    refinement_required: "AUTHORITY_SAFETY_INCOMPLETE",
    escalation_required: "AUTHORITY_DECISION_REQUIRED",
  }),
  contract_consistency: Object.freeze({
    refinement_required: "CONTRACT_INCONSISTENT",
    escalation_required: "CONTRACT_DECISION_REQUIRED",
  }),
  implementation_boundedness: Object.freeze({
    refinement_required: "IMPLEMENTATION_UNBOUNDED",
    escalation_required: "IMPLEMENTATION_SCOPE_DECISION_REQUIRED",
  }),
  validation_readiness: Object.freeze({
    refinement_required: "VALIDATION_INCOMPLETE",
    escalation_required: "VALIDATION_DECISION_REQUIRED",
  }),
  operational_completeness: Object.freeze({
    refinement_required: "OPERATIONAL_DETAILS_INCOMPLETE",
    escalation_required: "OPERATIONAL_ARCHITECTURE_DECISION_REQUIRED",
  }),
  ownership_continuity: Object.freeze({
    refinement_required: "OWNERSHIP_CONTINUITY_INCOMPLETE",
    escalation_required: "OWNERSHIP_DECISION_REQUIRED",
  }),
  escalation_fitness: Object.freeze({
    refinement_required: "ESCALATION_PREPARATION_INCOMPLETE",
    escalation_required: "ESCALATION_TARGET_DECISION_REQUIRED",
  }),
});

const INVALID_RESULT = Object.freeze({
  state: "invalid",
  readinessContractVersion: HILL_READINESS_SCHEMA_VERSION,
  outcome: "BLOCKED_ESCALATE",
  reasonCodes: Object.freeze(["INVALID_EVIDENCE_RECORD"]),
  nextOwnerSeatId: null,
});

function dataRecord(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string") || keys.length !== fields.length) return null;
  if (fields.some((field) => !keys.includes(field)) || keys.some((key) => !fields.includes(key))) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) return null;
    result[field] = descriptor.value;
  }
  return result;
}

function denseDataArray(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.get ||
      lengthDescriptor.set || !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 || lengthDescriptor.value > maximum) return null;
  const length = lengthDescriptor.value;
  const keys = Reflect.ownKeys(value);
  const expectedKeys = Array.from({ length }, (_, index) => String(index));
  if (keys.length !== expectedKeys.length + 1 || !keys.includes("length")) return null;
  if (expectedKeys.some((key) => !keys.includes(key))) return null;
  const result = [];
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) return null;
    result.push(descriptor.value);
  }
  return result;
}

function identifier(value) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= 128 &&
    IDENTIFIER.test(value);
}

function evidenceReference(value) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= 256 &&
    EVIDENCE_REFERENCE.test(value);
}

function assertedIdentity(value) {
  return value === null || (identifier(value) && !SEAT_IDS.includes(value.toLowerCase()));
}

function seatIdentity(value) {
  return typeof value === "string" && SEAT_IDS.includes(value);
}

function normalizeCandidate(input) {
  const candidate = dataRecord(input, CANDIDATE_FIELDS);
  if (candidate === null || candidate.readinessContractVersion !== HILL_READINESS_SCHEMA_VERSION) {
    return null;
  }
  for (const field of ["missionId", "subjectId", "revisionId", "artifactKind"]) {
    if (!identifier(candidate[field])) return null;
  }
  if (!seatIdentity(candidate.owningSeatId)) return null;
  const dimensions = denseDataArray(candidate.dimensions, HILL_READINESS_DIMENSIONS.length);
  if (dimensions === null || dimensions.length !== HILL_READINESS_DIMENSIONS.length) return null;

  let referenceCount = 0;
  const normalizedDimensions = [];
  for (let index = 0; index < dimensions.length; index += 1) {
    const assessment = dataRecord(dimensions[index], ASSESSMENT_FIELDS);
    if (assessment === null || assessment.dimension !== HILL_READINESS_DIMENSIONS[index] ||
        !HILL_READINESS_EVIDENCE_STATUSES.includes(assessment.status)) return null;
    const refs = denseDataArray(assessment.evidenceRefs, 8);
    if (refs === null || refs.length === 0 || refs.some((ref) => !evidenceReference(ref)) ||
        new Set(refs).size !== refs.length) return null;
    referenceCount += refs.length;
    if (referenceCount > 64) return null;

    const validOperationalNA = assessment.dimension === "operational_completeness" &&
      assessment.status === "not_applicable" &&
      HILL_READINESS_OPERATIONAL_NA_RATIONALES.includes(
        assessment.operationalNotApplicableRationale,
      );
    if (assessment.status === "not_applicable") {
      if (!validOperationalNA) return null;
    } else if (assessment.operationalNotApplicableRationale !== null) return null;

    normalizedDimensions.push(Object.freeze({
      dimension: assessment.dimension,
      status: assessment.status,
      evidenceRefs: Object.freeze([...refs]),
      operationalNotApplicableRationale: assessment.operationalNotApplicableRationale,
    }));
  }

  return Object.freeze({
    readinessContractVersion: HILL_READINESS_SCHEMA_VERSION,
    missionId: candidate.missionId,
    subjectId: candidate.subjectId,
    revisionId: candidate.revisionId,
    artifactKind: candidate.artifactKind,
    owningSeatId: candidate.owningSeatId,
    dimensions: Object.freeze(normalizedDimensions),
  });
}

function normalizeObservation(input) {
  const observation = dataRecord(input, OBSERVATION_FIELDS);
  if (observation === null || observation.observationContractVersion !== 1 ||
      observation.assuranceKind !== "host_asserted_non_authoritative") return null;
  for (const field of [
    "missionId", "subjectId", "currentRevisionId", "artifactKind", "journalHeadEntryId",
  ]) {
    if (!identifier(observation[field])) return null;
  }
  if (!seatIdentity(observation.owningSeatId)) return null;
  if (!Number.isSafeInteger(observation.journalSchemaVersion) ||
      observation.journalSchemaVersion < 1 || observation.journalSchemaVersion > 255 ||
      !Number.isSafeInteger(observation.evaluatedThroughSequence) ||
      observation.evaluatedThroughSequence < 0 ||
      (observation.refinementPassesCompleted !== 0 &&
       observation.refinementPassesCompleted !== HILL_READINESS_MAX_REFINEMENTS) ||
      !assertedIdentity(observation.reasoningRuntimeId) ||
      !assertedIdentity(observation.toolExecutorId) ||
      (observation.reasoningRuntimeId !== null &&
       observation.reasoningRuntimeId === observation.toolExecutorId)) return null;

  return Object.freeze({ ...observation });
}

function evaluatedResult(candidate, observation, outcome, reasonCodes, refinementRequests, nextOwnerSeatId) {
  return Object.freeze({
    state: "evaluated",
    readinessContractVersion: HILL_READINESS_SCHEMA_VERSION,
    rubricVersion: HILL_READINESS_RUBRIC_VERSION,
    authority: "non_authoritative",
    missionId: candidate.missionId,
    subjectId: candidate.subjectId,
    revisionId: candidate.revisionId,
    artifactKind: candidate.artifactKind,
    owningSeatId: candidate.owningSeatId,
    dimensionAssessments: candidate.dimensions,
    replayBinding: Object.freeze({
      observationContractVersion: observation.observationContractVersion,
      assuranceKind: observation.assuranceKind,
      missionId: observation.missionId,
      subjectId: observation.subjectId,
      currentRevisionId: observation.currentRevisionId,
      artifactKind: observation.artifactKind,
      owningSeatId: observation.owningSeatId,
      journalSchemaVersion: observation.journalSchemaVersion,
      evaluatedThroughSequence: observation.evaluatedThroughSequence,
      journalHeadEntryId: observation.journalHeadEntryId,
    }),
    assessorSeatId: "hill",
    evidenceAssurance: "reference_only_unverified",
    runtimeAssignmentAssurance: Object.freeze({
      kind: observation.assuranceKind,
      reasoningRuntimeId: observation.reasoningRuntimeId,
    }),
    toolExecutorAssurance: Object.freeze({
      kind: observation.assuranceKind,
      toolExecutorId: observation.toolExecutorId,
    }),
    refinementPassesCompleted: observation.refinementPassesCompleted,
    outcome,
    reasonCodes: Object.freeze([...reasonCodes]),
    refinementRequests: Object.freeze(refinementRequests.map((request) => Object.freeze(request))),
    nextOwnerSeatId,
  });
}

export function evaluateHillReadinessV1(candidateInput, observationInput) {
  try {
    const candidate = normalizeCandidate(candidateInput);
    const observation = normalizeObservation(observationInput);
    if (candidate === null || observation === null) return INVALID_RESULT;

    if (candidate.missionId !== observation.missionId ||
        candidate.subjectId !== observation.subjectId ||
        candidate.artifactKind !== observation.artifactKind ||
        candidate.owningSeatId !== observation.owningSeatId) {
      return evaluatedResult(
        candidate, observation, "BLOCKED_ESCALATE", ["REPLAY_BINDING_MISMATCH"], [], null,
      );
    }
    if (candidate.revisionId !== observation.currentRevisionId) {
      return evaluatedResult(
        candidate, observation, "BLOCKED_ESCALATE", ["ARTIFACT_REVISION_STALE"], [], null,
      );
    }

    const reasonCodes = [];
    const refinementRequests = [];
    let escalationRequired = false;
    for (const assessment of candidate.dimensions) {
      const reasonCode = REASONS[assessment.dimension][assessment.status];
      if (!reasonCode) continue;
      reasonCodes.push(reasonCode);
      if (assessment.status === "escalation_required") escalationRequired = true;
      else refinementRequests.push({ dimension: assessment.dimension, reasonCode });
    }

    if (escalationRequired) {
      return evaluatedResult(
        candidate, observation, "BLOCKED_ESCALATE", reasonCodes, refinementRequests, null,
      );
    }
    if (refinementRequests.length > 0) {
      if (observation.refinementPassesCompleted === HILL_READINESS_MAX_REFINEMENTS) {
        return evaluatedResult(
          candidate,
          observation,
          "BLOCKED_ESCALATE",
          [...reasonCodes, "REFINEMENT_LIMIT_REACHED"],
          refinementRequests,
          null,
        );
      }
      return evaluatedResult(
        candidate,
        observation,
        "NEEDS_REFINEMENT",
        reasonCodes,
        refinementRequests,
        candidate.owningSeatId,
      );
    }
    return evaluatedResult(candidate, observation, "GOOD_ENOUGH", [], [], null);
  } catch {
    return INVALID_RESULT;
  }
}
