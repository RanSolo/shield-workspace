export declare const HILL_READINESS_SCHEMA_VERSION: 1;
export declare const HILL_READINESS_RUBRIC_VERSION: "hill.readiness.v1";
export declare const HILL_READINESS_MAX_REFINEMENTS: 1;

export declare const HILL_READINESS_DIMENSIONS: readonly [
  "scope_completeness",
  "authority_safety",
  "contract_consistency",
  "implementation_boundedness",
  "validation_readiness",
  "operational_completeness",
  "ownership_continuity",
  "escalation_fitness",
];
export type HillReadinessDimension = (typeof HILL_READINESS_DIMENSIONS)[number];

export declare const HILL_READINESS_EVIDENCE_STATUSES: readonly [
  "satisfied", "refinement_required", "escalation_required", "not_applicable",
];
export type HillReadinessEvidenceStatus =
  (typeof HILL_READINESS_EVIDENCE_STATUSES)[number];

export declare const HILL_READINESS_OUTCOMES: readonly [
  "GOOD_ENOUGH", "NEEDS_REFINEMENT", "BLOCKED_ESCALATE",
];
export type HillReadinessOutcome = (typeof HILL_READINESS_OUTCOMES)[number];

export declare const HILL_READINESS_OPERATIONAL_NA_RATIONALES: readonly [
  "pure_value_contract", "documentation_only_artifact", "no_runtime_or_persistent_effects",
];
export type HillReadinessOperationalNARationale =
  (typeof HILL_READINESS_OPERATIONAL_NA_RATIONALES)[number];

export declare const HILL_READINESS_REASON_CODES: readonly [
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
];
export type HillReadinessReasonCode = (typeof HILL_READINESS_REASON_CODES)[number];

export interface HillDimensionAssessmentV1 {
  readonly dimension: HillReadinessDimension;
  readonly status: HillReadinessEvidenceStatus;
  readonly evidenceRefs: readonly string[];
  readonly operationalNotApplicableRationale: HillReadinessOperationalNARationale | null;
}

export interface HillReadinessCandidateV1 {
  readonly readinessContractVersion: 1;
  readonly missionId: string;
  readonly subjectId: string;
  readonly revisionId: string;
  readonly artifactKind: string;
  readonly owningSeatId: string;
  readonly dimensions: readonly HillDimensionAssessmentV1[];
}

export interface HillReadinessHostObservationV1 {
  readonly observationContractVersion: 1;
  readonly assuranceKind: "host_asserted_non_authoritative";
  readonly missionId: string;
  readonly subjectId: string;
  readonly currentRevisionId: string;
  readonly artifactKind: string;
  readonly owningSeatId: string;
  readonly journalSchemaVersion: number;
  readonly evaluatedThroughSequence: number;
  readonly journalHeadEntryId: string;
  readonly refinementPassesCompleted: 0 | 1;
  readonly reasoningRuntimeId: string | null;
  readonly toolExecutorId: string | null;
}

export interface HillReadinessRefinementRequestV1 {
  readonly dimension: HillReadinessDimension;
  readonly reasonCode: HillReadinessReasonCode;
}

export interface HillReadinessEvaluatedResultV1 {
  readonly state: "evaluated";
  readonly readinessContractVersion: 1;
  readonly rubricVersion: "hill.readiness.v1";
  readonly authority: "non_authoritative";
  readonly missionId: string;
  readonly subjectId: string;
  readonly revisionId: string;
  readonly artifactKind: string;
  readonly owningSeatId: string;
  readonly dimensionAssessments: readonly HillDimensionAssessmentV1[];
  readonly replayBinding: Readonly<{
    observationContractVersion: 1;
    assuranceKind: "host_asserted_non_authoritative";
    missionId: string;
    subjectId: string;
    currentRevisionId: string;
    artifactKind: string;
    owningSeatId: string;
    journalSchemaVersion: number;
    evaluatedThroughSequence: number;
    journalHeadEntryId: string;
  }>;
  readonly assessorSeatId: "hill";
  readonly evidenceAssurance: "reference_only_unverified";
  readonly runtimeAssignmentAssurance: Readonly<{
    kind: "host_asserted_non_authoritative";
    reasoningRuntimeId: string | null;
  }>;
  readonly toolExecutorAssurance: Readonly<{
    kind: "host_asserted_non_authoritative";
    toolExecutorId: string | null;
  }>;
  readonly refinementPassesCompleted: 0 | 1;
  readonly outcome: HillReadinessOutcome;
  readonly reasonCodes: readonly HillReadinessReasonCode[];
  readonly refinementRequests: readonly HillReadinessRefinementRequestV1[];
  readonly nextOwnerSeatId: string | null;
}

export interface HillReadinessInvalidResultV1 {
  readonly state: "invalid";
  readonly readinessContractVersion: 1;
  readonly outcome: "BLOCKED_ESCALATE";
  readonly reasonCodes: readonly ["INVALID_EVIDENCE_RECORD"];
  readonly nextOwnerSeatId: null;
}

export type HillReadinessEvaluationV1 =
  | HillReadinessEvaluatedResultV1
  | HillReadinessInvalidResultV1;

export declare function evaluateHillReadinessV1(
  candidate: unknown,
  observation: unknown,
): HillReadinessEvaluationV1;
