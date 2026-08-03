export declare const FURY_PLAN_GATE_SCHEMA_VERSION: 1;
export declare const FURY_PLAN_GATE_CONTRACT_VERSION: "fury.plan-gate.v1";
export declare const FURY_PLAN_GATE_MAX_FINDINGS: 16;
export declare const FURY_PLAN_GATE_VERDICTS: readonly ["PASS", "PASS_WITH_REQUIRED_CHANGES", "FAIL"];
export declare const FURY_PLAN_GATE_FINDING_CLASSES: readonly [
  "architecture",
  "authority",
  "compatibility",
  "replay_safety",
  "fail_closedness",
  "implementation_boundary",
  "validation_readiness",
  "operational_completeness",
];
export declare const FURY_PLAN_GATE_REASON_CODES: readonly [
  "INVALID_EXPECTED_BINDING",
  "PLAN_REVIEW_REQUIRED",
  "INVALID_PLAN_REVIEW",
  "REPLAY_BINDING_MISMATCH",
  "REVIEW_REVISION_STALE",
  "REVIEW_FAILED",
  "RECONCILIATION_REQUIRED",
  "INVALID_RECONCILIATION",
  "RECONCILIATION_BINDING_MISMATCH",
  "CORRECTED_REVISION_NOT_DISTINCT",
  "ADDITIONAL_ARCHITECTURE_CHANGE_REVIEW_REQUIRED",
  "REQUIRED_CHANGE_SET_MISMATCH",
  "RECONCILIATION_REVISION_STALE",
];

export type FuryPlanGateVerdictV1 = (typeof FURY_PLAN_GATE_VERDICTS)[number];
export type FuryPlanGateFindingClassV1 = (typeof FURY_PLAN_GATE_FINDING_CLASSES)[number];
export type FuryPlanGateReasonCodeV1 = (typeof FURY_PLAN_GATE_REASON_CODES)[number];

export interface FuryPlanGateFindingV1 {
  readonly findingId: string;
  readonly findingClass: FuryPlanGateFindingClassV1;
  readonly evidenceRefs: readonly string[];
}

export interface FuryPlanReviewV1 {
  readonly reviewSchemaVersion: 1;
  readonly contractVersion: "fury.plan-gate.v1";
  readonly assuranceKind: "host_asserted_non_authoritative";
  readonly reviewId: string;
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly baseBranch: string;
  readonly missionBranch: string;
  readonly prNumber: number;
  readonly blueprintArtifactId: string;
  readonly blueprintArtifactPath: string;
  readonly blueprintArtifactKind: "implementation_blueprint";
  readonly blueprintOwningSeatId: "may";
  readonly reviewedRevisionId: string;
  readonly verdict: FuryPlanGateVerdictV1;
  readonly findings: readonly FuryPlanGateFindingV1[];
  readonly reasoningRuntimeId: string | null;
  readonly toolExecutorId: string | null;
}

export interface FuryPlanGateDispositionV1 {
  readonly findingId: string;
  readonly disposition: "incorporated";
  readonly evidenceRefs: readonly string[];
}

export interface FuryPlanReconciliationV1 {
  readonly reconciliationSchemaVersion: 1;
  readonly contractVersion: "fury.plan-gate.v1";
  readonly assuranceKind: "host_asserted_non_authoritative";
  readonly reconciliationId: string;
  readonly reviewId: string;
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly baseBranch: string;
  readonly missionBranch: string;
  readonly prNumber: number;
  readonly blueprintArtifactId: string;
  readonly blueprintArtifactPath: string;
  readonly blueprintArtifactKind: "implementation_blueprint";
  readonly blueprintOwningSeatId: "may";
  readonly reviewedRevisionId: string;
  readonly correctedRevisionId: string;
  readonly additionalArchitectureChange: boolean;
  readonly dispositions: readonly FuryPlanGateDispositionV1[];
  readonly reasoningRuntimeId: string | null;
  readonly toolExecutorId: string | null;
}

export interface FuryPlanGateEnvelopeV1 {
  readonly planGateSchemaVersion: 1;
  readonly contractVersion: "fury.plan-gate.v1";
  readonly review: FuryPlanReviewV1;
  readonly reconciliation: FuryPlanReconciliationV1 | null;
}

export interface FuryPlanGateExpectedBindingV1 {
  readonly schemaVersion: 1;
  readonly assuranceKind: "host_asserted_non_authoritative";
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly baseBranch: string;
  readonly missionBranch: string;
  readonly prNumber: number;
  readonly blueprintArtifactId: string;
  readonly blueprintArtifactPath: string;
  readonly blueprintArtifactKind: "implementation_blueprint";
  readonly blueprintOwningSeatId: "may";
  readonly currentBlueprintRevisionId: string;
}

export interface FuryPlanGateEvaluationV1 {
  readonly state: "evaluated" | "invalid";
  readonly planGateSchemaVersion: 1;
  readonly authority: "non_authoritative";
  readonly dispatchEligibility: "eligible" | "ineligible";
  readonly reasonCodes: readonly FuryPlanGateReasonCodeV1[];
  readonly contractVersion?: "fury.plan-gate.v1";
  readonly evidenceAssurance?: "reference_only_unverified";
  readonly reviewerSeatId?: "fury";
  readonly verifierSeatId?: "hill" | null;
  readonly verdict?: FuryPlanGateVerdictV1 | null;
  readonly binding?: Readonly<FuryPlanGateExpectedBindingV1>;
  readonly review?: Readonly<FuryPlanReviewV1> | null;
  readonly reconciliation?: Readonly<FuryPlanReconciliationV1> | null;
}

export type FuryPlanGateNormalizationV1 =
  | { readonly state: "valid"; readonly planGate: Readonly<FuryPlanGateEnvelopeV1> | null }
  | { readonly state: "invalid"; readonly reason?: string };

export declare function isFuryPlanGateArtifactPath(value: unknown): boolean;
export declare function normalizeFuryPlanGateInputV1(input: unknown): FuryPlanGateNormalizationV1;
export declare function evaluateFuryPlanGateV1(
  planGateInput: unknown,
  expectedInput: unknown,
): Readonly<FuryPlanGateEvaluationV1>;
