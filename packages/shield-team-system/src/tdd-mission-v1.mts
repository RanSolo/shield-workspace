import { isProxy } from "node:util/types";

export const TDD_MISSION_SCHEMA_VERSION = 1 as const;
export const TDD_MISSION_CONTRACT_VERSION = "tdd.mission.v1" as const;
export const TDD_MISSION_STRATEGIES = Object.freeze([
  "tdd_selected",
  "tdd_declined",
] as const);
export const TDD_MISSION_CRITERION_DISPOSITIONS = Object.freeze([
  "implemented_and_proven",
  "deferred_with_linked_issue",
  "not_applicable_with_evidence",
  "blocked_pending_explicit_decision",
] as const);
export const TDD_MISSION_FAILURE_CLASSIFICATIONS = Object.freeze([
  "missing_behavior",
  "product_defect",
  "stale_expectation",
  "environment_failure",
  "harness_defect",
  "authority_failure",
  "insufficient_evidence",
] as const);
export const TDD_MISSION_EXPECTATION_AMENDMENT_KINDS = Object.freeze([
  "changed",
  "removed",
] as const);
export const TDD_MISSION_DECISIONS = Object.freeze([
  "eligible",
  "blocked",
  "packet_size_exception_required",
] as const);
export const TDD_MISSION_EVIDENCE_STAGES = Object.freeze([
  "strategy_recorded",
  "contract_prepared",
  "red_established",
  "implementation_authorized",
  "green_proven",
  "refactor_proven",
  "mack_validation_complete",
  "fury_conformance_complete",
  "disposition_recorded",
] as const);
export const TDD_MISSION_EVIDENCE_OUTCOMES = Object.freeze([
  "recorded",
  "prepared",
  "failed",
  "authorized",
  "passed",
  "deferred",
  "not_applicable",
  "pending_decision",
] as const);
export const TDD_MISSION_STRATEGY_REASON_CODES = Object.freeze([
  "MALFORMED_INPUT",
  "STRATEGY_RATIONALE_MISSING",
  "VALIDATION_CONTRACT_MISSING",
  "CRITERION_DISPOSITION_MISSING",
  "TRACEABILITY_BINDING_MISMATCH",
  "PACKET_CRITERION_MISSING",
  "PACKET_CRITERION_DUPLICATED",
  "PACKET_COUPLING_RATIONALE_MISSING",
  "PACKET_SIZE_LIMIT_EXCEEDED",
  "RED_NOT_ESTABLISHED",
  "FAILURE_EVIDENCE_MISSING",
  "WRONG_FAILURE_REASON",
  "SCAFFOLD_TREATED_AS_PASS",
  "EXPECTATION_AMENDMENT_INCOMPLETE",
  "IMPLEMENTATION_AUTHORITY_MISSING",
  "SEAT_OWNERSHIP_MISMATCH",
  "GREEN_EVIDENCE_MISSING",
  "GREEN_NOT_SMALLEST",
  "PACKET_SCOPE_EXCEEDED",
  "MACK_EVIDENCE_MISSING",
  "REFACTOR_NOT_BEHAVIOR_PRESERVING",
  "EVIDENCE_SCHEMA_INVALID",
  "BINDING_DIGEST_MISMATCH",
  "EVIDENCE_MISSING",
  "STALE_EXACT_REVISION_EVIDENCE",
  "DISPOSITION_EVIDENCE_MISSING",
  "REVIEW_EVIDENCE_MISSING",
  "BLOCKED_PENDING_EXPLICIT_DECISION",
] as const);

export type TddMissionStrategyV1 = (typeof TDD_MISSION_STRATEGIES)[number];
export type TddMissionCriterionDispositionV1 =
  (typeof TDD_MISSION_CRITERION_DISPOSITIONS)[number];
export type TddMissionFailureClassificationV1 =
  (typeof TDD_MISSION_FAILURE_CLASSIFICATIONS)[number];
export type TddMissionExpectationAmendmentKindV1 =
  (typeof TDD_MISSION_EXPECTATION_AMENDMENT_KINDS)[number];
export type TddMissionDecisionV1 = (typeof TDD_MISSION_DECISIONS)[number];
export type TddMissionEvidenceStageV1 = (typeof TDD_MISSION_EVIDENCE_STAGES)[number];
export type TddMissionEvidenceOutcomeV1 = (typeof TDD_MISSION_EVIDENCE_OUTCOMES)[number];
export type TddMissionStrategyReasonCodeV1 =
  (typeof TDD_MISSION_STRATEGY_REASON_CODES)[number];

export type TddMissionEvidenceSeatV1 = "hill" | "mack" | "fury" | "coulson" | "may";
export type TddMissionEvidenceSuccessorV1 =
  | TddMissionEvidenceStageV1
  | "mission_complete";

export interface TddMissionEvidenceTestCountsV1 {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly cancelled: number;
  readonly todo: number;
}

export interface TddMissionExactEvidenceV1 {
  readonly evidenceId: string;
  readonly missionId: string;
  readonly planDigest: string;
  readonly acceptanceContractDigest: string;
  readonly criterionId: string;
  readonly packetId: string;
  readonly stage: TddMissionEvidenceStageV1;
  readonly seatId: TddMissionEvidenceSeatV1;
  readonly runtimeId: string;
  readonly modelId: string;
  readonly executorId: string;
  readonly repositoryId: string;
  readonly branch: string;
  readonly cwd: string;
  readonly startRevisionId: string;
  readonly startTreeDigest: string;
  readonly endRevisionId: string;
  readonly endTreeDigest: string;
  readonly revisionId: string;
  readonly treeDigest: string;
  readonly command: string | null;
  readonly exitCode: number | null;
  readonly testCounts: Readonly<TddMissionEvidenceTestCountsV1> | null;
  readonly cacheEvidence: string | null;
  readonly checkpointId: string;
  readonly outcome: TddMissionEvidenceOutcomeV1;
  readonly failureClassification: TddMissionFailureClassificationV1 | null;
  readonly sourceRefs: readonly string[];
  readonly successor: TddMissionEvidenceSuccessorV1 | null;
  readonly stopCondition: string | null;
  readonly decisionOwnerSeatId: string | null;
}

export interface TddMissionEvaluationInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "tdd.mission.v1";
  readonly missionId: string;
  readonly planDigest: string;
  readonly reviewedAcceptanceContractDigest: string;
  readonly repositoryId: string;
  readonly branch: string;
  readonly planningRevisionId: string;
  readonly planningTreeDigest: string;
  readonly headRevisionId: string;
  readonly headTreeDigest: string;
  readonly strategyContract: Readonly<TddMissionStrategyContractV1>;
  readonly evidence: readonly Readonly<TddMissionExactEvidenceV1>[];
}

export type TddMissionEvaluationV1 =
  | {
      readonly state: "eligible";
      readonly reasonCodes: readonly [];
      readonly criterionIds: readonly string[];
      readonly successor: "mission_complete";
      readonly stopCondition: null;
      readonly input: Readonly<TddMissionEvaluationInputV1>;
    }
  | {
      readonly state: "blocked";
      readonly reasonCodes: readonly TddMissionStrategyReasonCodeV1[];
      readonly criterionIds: readonly string[];
      readonly successor: null;
      readonly stopCondition: string;
      readonly decisionOwnerSeatId: string | null;
    }
  | {
      readonly state: "packet_size_exception_required";
      readonly reasonCodes: readonly ["PACKET_SIZE_LIMIT_EXCEEDED"];
      readonly packetIds: readonly string[];
      readonly successor: null;
      readonly stopCondition: "feature_hill_packet_size_exception";
    };

export interface TddExecutablePreImplementationContractV1 {
  readonly contractId: string;
  readonly kind: "executable";
  readonly checkpointId: string;
  readonly expectedBehavior: string;
}

export interface TddCriterionTraceabilityV1 {
  readonly planRequirementId: string;
  readonly mackCheckpointId: string;
  readonly mayPacketId: string;
  readonly revisionId: string;
  readonly validationEvidenceId: string;
  readonly furyReviewId: string;
  readonly humanReviewId: string | null;
}

export interface TddExecutableFailureEvidenceV1 {
  readonly kind: "executable_failure";
  readonly command: string;
  readonly checkpointId: string;
  readonly revisionId: string;
  readonly exitCode: number;
  readonly observedFailureClassification: TddMissionFailureClassificationV1;
}

export interface TddFuryContractDispositionV1 {
  readonly evidenceId: string;
  readonly reviewerSeatId: "fury";
  readonly contractId: string;
  readonly acceptanceContractDigest: string;
  readonly disposition: "approved" | "changes_requested";
}

interface TddPreImplementationStateEvidenceCommonV1 {
  readonly evidenceId: string;
  readonly ownerSeatId: "mack";
  readonly contractId: string;
  readonly checkpointId: string;
  readonly revisionId: string;
  readonly expectedFailureClassification: TddMissionFailureClassificationV1;
  readonly implementationAuthority: false;
}

export interface TddContractPreparedEvidenceV1
  extends TddPreImplementationStateEvidenceCommonV1 {
  readonly state: "contract_prepared";
  readonly outcome: "not_run";
  readonly failureEvidence: null;
  readonly furyContractDisposition: null;
}

export interface TddRedEstablishedEvidenceV1
  extends TddPreImplementationStateEvidenceCommonV1 {
  readonly state: "red_established";
  readonly outcome: "failed";
  readonly failureEvidence: Readonly<TddExecutableFailureEvidenceV1>;
  readonly furyContractDisposition: Readonly<TddFuryContractDispositionV1>;
}

export type TddPreImplementationStateEvidenceV1 =
  | TddContractPreparedEvidenceV1
  | TddRedEstablishedEvidenceV1;

export interface TddExpectationAmendmentReviewV1 {
  readonly evidenceId: string;
  readonly reviewerSeatId: "fury";
  readonly criterionId: string;
  readonly amendmentKind: TddMissionExpectationAmendmentKindV1;
  readonly oldContractDigest: string;
  readonly amendedContractDigest: string;
  readonly disposition: "approved";
}

export interface TddExpectationAmendmentVerificationV1 {
  readonly evidenceId: string;
  readonly verifierSeatId: "fitz";
  readonly criterionId: string;
  readonly amendmentKind: TddMissionExpectationAmendmentKindV1;
  readonly oldContractDigest: string;
  readonly amendedContractDigest: string;
  readonly disposition: "verified";
}

export interface TddExpectationAmendmentRerunV1 {
  readonly evidenceId: string;
  readonly ownerSeatId: "mack";
  readonly criterionId: string;
  readonly oldContractDigest: string;
  readonly revisionId: string;
  readonly command: string;
  readonly outcome: "failed";
  readonly exitCode: number;
  readonly observedFailureClassification: "stale_expectation";
}

export interface TddInvalidatedAmendmentEvidenceRefsV1 {
  readonly implementationAuthorityReceiptRef: string | null;
  readonly greenReceiptRef: string | null;
  readonly refactorReceiptRef: string | null;
  readonly mackValidationReceiptRef: string | null;
  readonly conformanceReceiptRef: string | null;
}

export interface TddExpectationAmendmentV1 {
  readonly criterionId: string;
  readonly amendmentKind: TddMissionExpectationAmendmentKindV1;
  readonly oldContractDigest: string;
  readonly amendedContractDigest: string;
  readonly originalExpectationEvidenceRef: string;
  readonly failureClassification: "stale_expectation";
  readonly intentPreservationRationale: string;
  readonly contractRelevant: boolean;
  readonly furyDisposition: Readonly<TddExpectationAmendmentReviewV1> | null;
  readonly fitzVerification: Readonly<TddExpectationAmendmentVerificationV1>;
  readonly freshRerun: Readonly<TddExpectationAmendmentRerunV1>;
  readonly freshStrategyRationale: string | null;
  readonly invalidatedEvidenceRefs: Readonly<TddInvalidatedAmendmentEvidenceRefsV1>;
}

export interface TddExpectationAmendmentEffectV1 {
  readonly criterionId: string;
  readonly amendmentKind: TddMissionExpectationAmendmentKindV1;
  readonly oldContractDigest: string;
  readonly amendedContractDigest: string;
  readonly invalidatedEvidenceRefs: Readonly<TddInvalidatedAmendmentEvidenceRefsV1>;
  readonly successorState: "contract_prepared" | "strategy_recorded";
  readonly requiredBeforeImplementation: readonly (
    | "fresh_reviewed_red"
    | "fresh_amended_digest_coulson_authority"
  )[];
  readonly coulsonAuthorityContractDigest: string;
}

export interface TddImplementationAuthorityEvidenceV1 {
  readonly evidenceId: string;
  readonly authorityKind: "implementation";
  readonly grantorSeatId: "coulson";
  readonly authorizedSeatId: "may";
  readonly criterionId: string;
  readonly packetId: string;
  readonly contractDigest: string;
  readonly transition: "green" | "refactor";
  readonly authorizedPaths: readonly string[];
}

export interface TddFocusedMackEvidenceV1 {
  readonly evidenceId: string;
  readonly ownerSeatId: "mack";
  readonly criterionId: string;
  readonly packetId: string;
  readonly contractDigest: string;
  readonly revisionId: string;
  readonly command: string;
  readonly outcome: "passed";
  readonly exitCode: 0;
  readonly focus: "packet";
}

export interface TddGreenEvidenceV1 {
  readonly state: "green_proven";
  readonly evidenceId: string;
  readonly ownerSeatId: "may";
  readonly criterionId: string;
  readonly packetId: string;
  readonly contractDigest: string;
  readonly revisionId: string;
  readonly changedPaths: readonly string[];
  readonly implementationKind: "smallest_correct_green";
  readonly cleanupBundled: false;
  readonly mackEvidence: Readonly<TddFocusedMackEvidenceV1>;
}

export interface TddRefactorEvidenceV1 {
  readonly state: "refactor_proven";
  readonly evidenceId: string;
  readonly ownerSeatId: "may";
  readonly criterionId: string;
  readonly packetId: string;
  readonly contractDigest: string;
  readonly greenRevisionId: string;
  readonly revisionId: string;
  readonly changedPaths: readonly string[];
  readonly implementationKind: "behavior_preserving_refactor";
  readonly behaviorPreserved: true;
  readonly failureSemanticsPreserved: true;
  readonly authoritySemanticsPreserved: true;
  readonly persistenceSemanticsPreserved: true;
  readonly riskPreserved: true;
  readonly implementationAuthorityEvidence: Readonly<TddImplementationAuthorityEvidenceV1>;
  readonly mackEvidence: Readonly<TddFocusedMackEvidenceV1>;
}

interface TddCriterionStrategyCommonV1 {
  readonly criterionId: string;
  readonly rationale: string;
  readonly riskFactors: readonly string[];
  readonly laterValidation: "required";
  readonly disposition: TddMissionCriterionDispositionV1;
  readonly traceability: Readonly<TddCriterionTraceabilityV1>;
  readonly expectationAmendment: Readonly<TddExpectationAmendmentV1> | null;
  readonly implementationAuthorityEvidence:
    Readonly<TddImplementationAuthorityEvidenceV1> | null;
  readonly greenEvidence: Readonly<TddGreenEvidenceV1> | null;
  readonly refactorEvidence: Readonly<TddRefactorEvidenceV1> | null;
}

export interface TddSelectedCriterionStrategyV1 extends TddCriterionStrategyCommonV1 {
  readonly strategy: "tdd_selected";
  readonly preImplementationContract: Readonly<TddExecutablePreImplementationContractV1>;
  readonly preImplementationStateEvidence: Readonly<TddPreImplementationStateEvidenceV1>;
}

export interface TddDeclinedCriterionStrategyV1 extends TddCriterionStrategyCommonV1 {
  readonly strategy: "tdd_declined";
  readonly preImplementationContract: null;
  readonly preImplementationStateEvidence: null;
}

export type TddCriterionStrategyV1 =
  | TddSelectedCriterionStrategyV1
  | TddDeclinedCriterionStrategyV1;

export interface TddImplementationPacketV1 {
  readonly packetId: string;
  readonly criterionIds: readonly string[];
  readonly couplingRationale: string | null;
  readonly minimalPaths: readonly string[];
  readonly requiredInterfaces: readonly string[];
  readonly allowedEffects: readonly string[];
  readonly focusedValidation: readonly string[];
  readonly expectedOutput: string;
  readonly stopConditions: readonly string[];
  readonly successor: string;
}

export interface TddMissionStrategyContractV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "tdd.mission.v1";
  readonly acceptanceContractDigest: string;
  readonly criteria: readonly Readonly<TddCriterionStrategyV1>[];
  readonly packets: readonly Readonly<TddImplementationPacketV1>[];
}

export type TddMissionStrategyValidationV1 =
  | {
      readonly state: "valid";
      readonly contract: Readonly<TddMissionStrategyContractV1>;
      readonly amendmentEffects: readonly Readonly<TddExpectationAmendmentEffectV1>[];
    }
  | {
      readonly state: "invalid";
      readonly reasonCodes: readonly TddMissionStrategyReasonCodeV1[];
    }
  | {
      readonly state: "packet_size_exception_required";
      readonly reasonCodes: readonly ["PACKET_SIZE_LIMIT_EXCEEDED"];
      readonly packetIds: readonly string[];
    };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{40,64})$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{6,}$/u;
const CONTRACT_FIELDS = [
  "schemaVersion",
  "contractVersion",
  "acceptanceContractDigest",
  "criteria",
  "packets",
] as const;
const CRITERION_FIELDS = [
  "criterionId",
  "strategy",
  "rationale",
  "riskFactors",
  "preImplementationContract",
  "preImplementationStateEvidence",
  "laterValidation",
  "disposition",
  "traceability",
  "expectationAmendment",
  "implementationAuthorityEvidence",
  "greenEvidence",
  "refactorEvidence",
] as const;
const PRE_IMPLEMENTATION_CONTRACT_FIELDS = [
  "contractId",
  "kind",
  "checkpointId",
  "expectedBehavior",
] as const;
const TRACEABILITY_FIELDS = [
  "planRequirementId",
  "mackCheckpointId",
  "mayPacketId",
  "revisionId",
  "validationEvidenceId",
  "furyReviewId",
  "humanReviewId",
] as const;
const PACKET_FIELDS = [
  "packetId",
  "criterionIds",
  "couplingRationale",
  "minimalPaths",
  "requiredInterfaces",
  "allowedEffects",
  "focusedValidation",
  "expectedOutput",
  "stopConditions",
  "successor",
] as const;
const PRE_IMPLEMENTATION_STATE_FIELDS = [
  "state",
  "evidenceId",
  "ownerSeatId",
  "contractId",
  "checkpointId",
  "revisionId",
  "expectedFailureClassification",
  "implementationAuthority",
  "outcome",
  "failureEvidence",
  "furyContractDisposition",
] as const;
const FAILURE_EVIDENCE_FIELDS = [
  "kind",
  "command",
  "checkpointId",
  "revisionId",
  "exitCode",
  "observedFailureClassification",
] as const;
const FURY_CONTRACT_DISPOSITION_FIELDS = [
  "evidenceId",
  "reviewerSeatId",
  "contractId",
  "acceptanceContractDigest",
  "disposition",
] as const;
const EXPECTATION_AMENDMENT_FIELDS = [
  "criterionId",
  "amendmentKind",
  "oldContractDigest",
  "amendedContractDigest",
  "originalExpectationEvidenceRef",
  "failureClassification",
  "intentPreservationRationale",
  "contractRelevant",
  "furyDisposition",
  "fitzVerification",
  "freshRerun",
  "freshStrategyRationale",
  "invalidatedEvidenceRefs",
] as const;
const EXPECTATION_AMENDMENT_REVIEW_FIELDS = [
  "evidenceId",
  "reviewerSeatId",
  "criterionId",
  "amendmentKind",
  "oldContractDigest",
  "amendedContractDigest",
  "disposition",
] as const;
const EXPECTATION_AMENDMENT_VERIFICATION_FIELDS = [
  "evidenceId",
  "verifierSeatId",
  "criterionId",
  "amendmentKind",
  "oldContractDigest",
  "amendedContractDigest",
  "disposition",
] as const;
const EXPECTATION_AMENDMENT_RERUN_FIELDS = [
  "evidenceId",
  "ownerSeatId",
  "criterionId",
  "oldContractDigest",
  "revisionId",
  "command",
  "outcome",
  "exitCode",
  "observedFailureClassification",
] as const;
const INVALIDATED_AMENDMENT_EVIDENCE_REF_FIELDS = [
  "implementationAuthorityReceiptRef",
  "greenReceiptRef",
  "refactorReceiptRef",
  "mackValidationReceiptRef",
  "conformanceReceiptRef",
] as const;
const IMPLEMENTATION_AUTHORITY_FIELDS = [
  "evidenceId",
  "authorityKind",
  "grantorSeatId",
  "authorizedSeatId",
  "criterionId",
  "packetId",
  "contractDigest",
  "transition",
  "authorizedPaths",
] as const;
const FOCUSED_MACK_EVIDENCE_FIELDS = [
  "evidenceId",
  "ownerSeatId",
  "criterionId",
  "packetId",
  "contractDigest",
  "revisionId",
  "command",
  "outcome",
  "exitCode",
  "focus",
] as const;
const GREEN_EVIDENCE_FIELDS = [
  "state",
  "evidenceId",
  "ownerSeatId",
  "criterionId",
  "packetId",
  "contractDigest",
  "revisionId",
  "changedPaths",
  "implementationKind",
  "cleanupBundled",
  "mackEvidence",
] as const;
const REFACTOR_EVIDENCE_FIELDS = [
  "state",
  "evidenceId",
  "ownerSeatId",
  "criterionId",
  "packetId",
  "contractDigest",
  "greenRevisionId",
  "revisionId",
  "changedPaths",
  "implementationKind",
  "behaviorPreserved",
  "failureSemanticsPreserved",
  "authoritySemanticsPreserved",
  "persistenceSemanticsPreserved",
  "riskPreserved",
  "implementationAuthorityEvidence",
  "mackEvidence",
] as const;
const MISSION_EVALUATION_FIELDS = [
  "schemaVersion",
  "contractVersion",
  "missionId",
  "planDigest",
  "reviewedAcceptanceContractDigest",
  "repositoryId",
  "branch",
  "planningRevisionId",
  "planningTreeDigest",
  "headRevisionId",
  "headTreeDigest",
  "strategyContract",
  "evidence",
] as const;
const EXACT_EVIDENCE_FIELDS = [
  "evidenceId",
  "missionId",
  "planDigest",
  "acceptanceContractDigest",
  "criterionId",
  "packetId",
  "stage",
  "seatId",
  "runtimeId",
  "modelId",
  "executorId",
  "repositoryId",
  "branch",
  "cwd",
  "startRevisionId",
  "startTreeDigest",
  "endRevisionId",
  "endTreeDigest",
  "revisionId",
  "treeDigest",
  "command",
  "exitCode",
  "testCounts",
  "cacheEvidence",
  "checkpointId",
  "outcome",
  "failureClassification",
  "sourceRefs",
  "successor",
  "stopCondition",
  "decisionOwnerSeatId",
] as const;
const EVIDENCE_TEST_COUNT_FIELDS = [
  "total",
  "passed",
  "failed",
  "skipped",
  "cancelled",
  "todo",
] as const;

function record(value: unknown, fields: readonly string[]): Record<string, unknown> | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string") ||
        fields.some((field) => !keys.includes(field)) ||
        keys.some((key) => typeof key === "string" && !fields.includes(key))) return null;
    const output: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set ||
          !descriptor.enumerable) return null;
      output[field] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function plainRecordMissingField(value: unknown, field: string): boolean {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
      !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype &&
      !Object.hasOwn(value, field);
  } catch {
    return false;
  }
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function nonemptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2_000;
}

function failureClassification(value: unknown): value is TddMissionFailureClassificationV1 {
  return TDD_MISSION_FAILURE_CLASSIFICATIONS.includes(
    value as TddMissionFailureClassificationV1,
  );
}

function scaffoldClaimsPass(value: unknown): boolean {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const state = Object.getOwnPropertyDescriptor(value, "state");
    const outcome = Object.getOwnPropertyDescriptor(value, "outcome");
    return state?.value === "contract_prepared" && Object.hasOwn(state, "value") &&
      typeof outcome?.value === "string" && Object.hasOwn(outcome, "value") &&
      /^(?:pass|passed)$/iu.test(outcome.value);
  } catch {
    return false;
  }
}

function preImplementationStateEvidence(
  value: unknown,
  contract: TddExecutablePreImplementationContractV1,
  acceptanceContractDigest: string,
): TddPreImplementationStateEvidenceV1 | TddMissionStrategyReasonCodeV1 {
  if (scaffoldClaimsPass(value)) return "SCAFFOLD_TREATED_AS_PASS";
  const state = record(value, PRE_IMPLEMENTATION_STATE_FIELDS);
  if (state === null || (state.state !== "contract_prepared" && state.state !== "red_established") ||
      !identifier(state.evidenceId) || state.ownerSeatId !== "mack" ||
      state.contractId !== contract.contractId || state.checkpointId !== contract.checkpointId ||
      typeof state.revisionId !== "string" || !REVISION.test(state.revisionId) ||
      !failureClassification(state.expectedFailureClassification) ||
      state.implementationAuthority !== false) return "RED_NOT_ESTABLISHED";

  const common = {
    evidenceId: state.evidenceId,
    ownerSeatId: "mack" as const,
    contractId: state.contractId,
    checkpointId: state.checkpointId,
    revisionId: state.revisionId,
    expectedFailureClassification: state.expectedFailureClassification,
    implementationAuthority: false as const,
  };
  if (state.state === "contract_prepared") {
    if (state.outcome !== "not_run" || state.failureEvidence !== null ||
        state.furyContractDisposition !== null) return "RED_NOT_ESTABLISHED";
    return Object.freeze({
      ...common,
      state: "contract_prepared" as const,
      outcome: "not_run" as const,
      failureEvidence: null,
      furyContractDisposition: null,
    });
  }

  if (state.outcome !== "failed" || state.failureEvidence === null) {
    return "FAILURE_EVIDENCE_MISSING";
  }
  const failure = record(state.failureEvidence, FAILURE_EVIDENCE_FIELDS);
  if (failure === null || failure.kind !== "executable_failure" ||
      !nonemptyText(failure.command) || failure.checkpointId !== contract.checkpointId ||
      failure.revisionId !== state.revisionId || !Number.isSafeInteger(failure.exitCode) ||
      (failure.exitCode as number) === 0 ||
      !failureClassification(failure.observedFailureClassification)) {
    return "FAILURE_EVIDENCE_MISSING";
  }
  if (failure.observedFailureClassification !== state.expectedFailureClassification) {
    return "WRONG_FAILURE_REASON";
  }

  const disposition = record(
    state.furyContractDisposition,
    FURY_CONTRACT_DISPOSITION_FIELDS,
  );
  if (disposition === null || !identifier(disposition.evidenceId) ||
      disposition.reviewerSeatId !== "fury" || disposition.contractId !== contract.contractId ||
      disposition.acceptanceContractDigest !== acceptanceContractDigest ||
      disposition.disposition !== "approved") return "RED_NOT_ESTABLISHED";

  return Object.freeze({
    ...common,
    state: "red_established" as const,
    outcome: "failed" as const,
    failureEvidence: Object.freeze({
      kind: "executable_failure" as const,
      command: failure.command,
      checkpointId: failure.checkpointId,
      revisionId: failure.revisionId,
      exitCode: failure.exitCode as number,
      observedFailureClassification: failure.observedFailureClassification,
    }),
    furyContractDisposition: Object.freeze({
      evidenceId: disposition.evidenceId,
      reviewerSeatId: "fury" as const,
      contractId: disposition.contractId,
      acceptanceContractDigest,
      disposition: "approved" as const,
    }),
  });
}

function amendmentBindingMatches(
  evidence: Record<string, unknown>,
  criterionId: string,
  amendmentKind: TddMissionExpectationAmendmentKindV1,
  oldContractDigest: string,
  amendedContractDigest: string,
): boolean {
  return evidence.criterionId === criterionId && evidence.amendmentKind === amendmentKind &&
    evidence.oldContractDigest === oldContractDigest &&
    evidence.amendedContractDigest === amendedContractDigest;
}

function invalidatedAmendmentEvidenceRefs(
  value: unknown,
): Readonly<TddInvalidatedAmendmentEvidenceRefsV1> | null {
  const refs = record(value, INVALIDATED_AMENDMENT_EVIDENCE_REF_FIELDS);
  if (refs === null || INVALIDATED_AMENDMENT_EVIDENCE_REF_FIELDS.some((field) =>
    refs[field] !== null && !identifier(refs[field]))) return null;
  return Object.freeze({
    implementationAuthorityReceiptRef: refs.implementationAuthorityReceiptRef as string | null,
    greenReceiptRef: refs.greenReceiptRef as string | null,
    refactorReceiptRef: refs.refactorReceiptRef as string | null,
    mackValidationReceiptRef: refs.mackValidationReceiptRef as string | null,
    conformanceReceiptRef: refs.conformanceReceiptRef as string | null,
  });
}

function expectationAmendment(
  value: unknown,
  criterionId: string,
  strategy: TddMissionStrategyV1,
  stateEvidence: TddPreImplementationStateEvidenceV1 | null,
): {
  readonly amendment: Readonly<TddExpectationAmendmentV1>;
  readonly effect: Readonly<TddExpectationAmendmentEffectV1>;
} | null {
  const amendment = record(value, EXPECTATION_AMENDMENT_FIELDS);
  if (amendment === null || amendment.criterionId !== criterionId ||
      !TDD_MISSION_EXPECTATION_AMENDMENT_KINDS.includes(
        amendment.amendmentKind as TddMissionExpectationAmendmentKindV1,
      ) || typeof amendment.oldContractDigest !== "string" ||
      !DIGEST.test(amendment.oldContractDigest) ||
      typeof amendment.amendedContractDigest !== "string" ||
      !DIGEST.test(amendment.amendedContractDigest) ||
      amendment.oldContractDigest === amendment.amendedContractDigest ||
      !identifier(amendment.originalExpectationEvidenceRef) ||
      amendment.failureClassification !== "stale_expectation" ||
      !nonemptyText(amendment.intentPreservationRationale) ||
      typeof amendment.contractRelevant !== "boolean") return null;

  const amendmentKind = amendment.amendmentKind as TddMissionExpectationAmendmentKindV1;
  const oldContractDigest = amendment.oldContractDigest;
  const amendedContractDigest = amendment.amendedContractDigest;
  let furyDisposition: Readonly<TddExpectationAmendmentReviewV1> | null = null;
  if (amendment.furyDisposition !== null) {
    const review = record(amendment.furyDisposition, EXPECTATION_AMENDMENT_REVIEW_FIELDS);
    if (review === null || !identifier(review.evidenceId) || review.reviewerSeatId !== "fury" ||
        !amendmentBindingMatches(
          review,
          criterionId,
          amendmentKind,
          oldContractDigest,
          amendedContractDigest,
        ) || review.disposition !== "approved") return null;
    furyDisposition = Object.freeze({
      evidenceId: review.evidenceId,
      reviewerSeatId: "fury" as const,
      criterionId,
      amendmentKind,
      oldContractDigest,
      amendedContractDigest,
      disposition: "approved" as const,
    });
  } else if (amendment.contractRelevant) {
    return null;
  }

  const verification = record(
    amendment.fitzVerification,
    EXPECTATION_AMENDMENT_VERIFICATION_FIELDS,
  );
  if (verification === null || !identifier(verification.evidenceId) ||
      verification.verifierSeatId !== "fitz" || !amendmentBindingMatches(
        verification,
        criterionId,
        amendmentKind,
        oldContractDigest,
        amendedContractDigest,
      ) || verification.disposition !== "verified") return null;

  const rerun = record(amendment.freshRerun, EXPECTATION_AMENDMENT_RERUN_FIELDS);
  if (rerun === null || !identifier(rerun.evidenceId) || rerun.ownerSeatId !== "mack" ||
      rerun.criterionId !== criterionId || rerun.oldContractDigest !== oldContractDigest ||
      typeof rerun.revisionId !== "string" || !REVISION.test(rerun.revisionId) ||
      !nonemptyText(rerun.command) || rerun.outcome !== "failed" ||
      !Number.isSafeInteger(rerun.exitCode) || (rerun.exitCode as number) === 0 ||
      rerun.observedFailureClassification !== "stale_expectation") return null;

  if ((strategy === "tdd_selected" &&
      (amendment.freshStrategyRationale !== null || stateEvidence?.state !== "contract_prepared")) ||
      (strategy === "tdd_declined" && !nonemptyText(amendment.freshStrategyRationale))) return null;

  const invalidatedEvidenceRefs = invalidatedAmendmentEvidenceRefs(
    amendment.invalidatedEvidenceRefs,
  );
  if (invalidatedEvidenceRefs === null) return null;

  const normalizedAmendment = Object.freeze({
    criterionId,
    amendmentKind,
    oldContractDigest,
    amendedContractDigest,
    originalExpectationEvidenceRef: amendment.originalExpectationEvidenceRef,
    failureClassification: "stale_expectation" as const,
    intentPreservationRationale: amendment.intentPreservationRationale,
    contractRelevant: amendment.contractRelevant,
    furyDisposition,
    fitzVerification: Object.freeze({
      evidenceId: verification.evidenceId,
      verifierSeatId: "fitz" as const,
      criterionId,
      amendmentKind,
      oldContractDigest,
      amendedContractDigest,
      disposition: "verified" as const,
    }),
    freshRerun: Object.freeze({
      evidenceId: rerun.evidenceId,
      ownerSeatId: "mack" as const,
      criterionId,
      oldContractDigest,
      revisionId: rerun.revisionId,
      command: rerun.command,
      outcome: "failed" as const,
      exitCode: rerun.exitCode as number,
      observedFailureClassification: "stale_expectation" as const,
    }),
    freshStrategyRationale: amendment.freshStrategyRationale as string | null,
    invalidatedEvidenceRefs,
  });
  const requiredBeforeImplementation = strategy === "tdd_selected"
    ? Object.freeze([
        "fresh_reviewed_red" as const,
        "fresh_amended_digest_coulson_authority" as const,
      ])
    : Object.freeze(["fresh_amended_digest_coulson_authority" as const]);
  return Object.freeze({
    amendment: normalizedAmendment,
    effect: Object.freeze({
      criterionId,
      amendmentKind,
      oldContractDigest,
      amendedContractDigest,
      invalidatedEvidenceRefs,
      successorState: strategy === "tdd_selected"
        ? "contract_prepared" as const
        : "strategy_recorded" as const,
      requiredBeforeImplementation,
      coulsonAuthorityContractDigest: amendedContractDigest,
    }),
  });
}

function riskFactors(value: unknown): value is readonly string[] {
  try {
    return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
      value.length > 0 && value.length <= 64 && value.every(nonemptyText) &&
      new Set(value).size === value.length;
  } catch {
    return false;
  }
}

function textArray(value: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
        value.length === 0 || value.length > 64 || !value.every(nonemptyText) ||
        new Set(value).size !== value.length) return null;
    return Object.freeze([...value] as string[]);
  } catch {
    return null;
  }
}

function relativePaths(value: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
        value.length === 0 || value.length > 64) return null;
    const paths: string[] = [];
    for (const candidate of value) {
      if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 512 ||
          candidate.startsWith("/") || candidate.includes("\\") || candidate.includes("\0")) {
        return null;
      }
      const segments = candidate.split("/");
      if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
        return null;
      }
      paths.push(candidate);
    }
    if (new Set(paths).size !== paths.length) return null;
    return Object.freeze(paths);
  } catch {
    return null;
  }
}

function implementationAuthorityEvidence(
  value: unknown,
  criterionId: string,
  packetId: string,
  transition: "green" | "refactor",
): TddImplementationAuthorityEvidenceV1 | TddMissionStrategyReasonCodeV1 {
  const authority = record(value, IMPLEMENTATION_AUTHORITY_FIELDS);
  if (authority === null) return "IMPLEMENTATION_AUTHORITY_MISSING";
  if (authority.authorizedSeatId !== "may") return "SEAT_OWNERSHIP_MISMATCH";
  const authorizedPaths = relativePaths(authority.authorizedPaths);
  if (!identifier(authority.evidenceId) || authority.authorityKind !== "implementation" ||
      authority.grantorSeatId !== "coulson" || authority.criterionId !== criterionId ||
      authority.packetId !== packetId || typeof authority.contractDigest !== "string" ||
      !DIGEST.test(authority.contractDigest) || authority.transition !== transition ||
      authorizedPaths === null) return "IMPLEMENTATION_AUTHORITY_MISSING";
  return Object.freeze({
    evidenceId: authority.evidenceId,
    authorityKind: "implementation" as const,
    grantorSeatId: "coulson" as const,
    authorizedSeatId: "may" as const,
    criterionId,
    packetId,
    contractDigest: authority.contractDigest,
    transition,
    authorizedPaths,
  });
}

function focusedMackEvidence(
  value: unknown,
  criterionId: string,
  packetId: string,
  contractDigest: string,
  revisionId: string,
): TddFocusedMackEvidenceV1 | null {
  const evidence = record(value, FOCUSED_MACK_EVIDENCE_FIELDS);
  if (evidence === null || !identifier(evidence.evidenceId) || evidence.ownerSeatId !== "mack" ||
      evidence.criterionId !== criterionId || evidence.packetId !== packetId ||
      evidence.contractDigest !== contractDigest || evidence.revisionId !== revisionId ||
      !nonemptyText(evidence.command) || evidence.outcome !== "passed" || evidence.exitCode !== 0 ||
      evidence.focus !== "packet") return null;
  return Object.freeze({
    evidenceId: evidence.evidenceId,
    ownerSeatId: "mack" as const,
    criterionId,
    packetId,
    contractDigest,
    revisionId,
    command: evidence.command,
    outcome: "passed" as const,
    exitCode: 0 as const,
    focus: "packet" as const,
  });
}

interface TddImplementationTransitionEvidenceV1 {
  readonly implementationAuthorityEvidence:
    Readonly<TddImplementationAuthorityEvidenceV1> | null;
  readonly greenEvidence: Readonly<TddGreenEvidenceV1> | null;
  readonly refactorEvidence: Readonly<TddRefactorEvidenceV1> | null;
}

function implementationTransitionEvidence(
  criterion: Record<string, unknown>,
  strategy: TddMissionStrategyV1,
  stateEvidence: TddPreImplementationStateEvidenceV1 | null,
  expectationAmendmentValue: TddExpectationAmendmentV1 | null,
  criterionId: string,
  packetId: string,
  acceptanceContractDigest: string,
): TddImplementationTransitionEvidenceV1 | TddMissionStrategyReasonCodeV1 {
  if (expectationAmendmentValue !== null &&
      (criterion.implementationAuthorityEvidence !== null || criterion.greenEvidence !== null ||
        criterion.refactorEvidence !== null)) return "EXPECTATION_AMENDMENT_INCOMPLETE";

  let authority: TddImplementationAuthorityEvidenceV1 | null = null;
  if (criterion.implementationAuthorityEvidence !== null) {
    const authorityResult = implementationAuthorityEvidence(
      criterion.implementationAuthorityEvidence,
      criterionId,
      packetId,
      "green",
    );
    if (typeof authorityResult === "string") return authorityResult;
    authority = authorityResult;
    if (authority.contractDigest !== acceptanceContractDigest) {
      return "BINDING_DIGEST_MISMATCH";
    }
    if (strategy === "tdd_selected" && stateEvidence?.state !== "red_established") {
      return "RED_NOT_ESTABLISHED";
    }
  }

  if (criterion.greenEvidence === null) {
    if (criterion.refactorEvidence !== null) return "GREEN_EVIDENCE_MISSING";
    return Object.freeze({
      implementationAuthorityEvidence: authority,
      greenEvidence: null,
      refactorEvidence: null,
    });
  }
  if (authority === null) return "IMPLEMENTATION_AUTHORITY_MISSING";
  if (strategy === "tdd_selected" && stateEvidence?.state !== "red_established") {
    return "RED_NOT_ESTABLISHED";
  }

  const green = record(criterion.greenEvidence, GREEN_EVIDENCE_FIELDS);
  if (green === null) return "GREEN_EVIDENCE_MISSING";
  if (green.ownerSeatId !== "may") return "SEAT_OWNERSHIP_MISMATCH";
  const greenPaths = relativePaths(green.changedPaths);
  if (green.state !== "green_proven" || !identifier(green.evidenceId) ||
      green.criterionId !== criterionId || green.packetId !== packetId ||
      green.contractDigest !== authority.contractDigest || typeof green.revisionId !== "string" ||
      !REVISION.test(green.revisionId) || greenPaths === null) return "GREEN_EVIDENCE_MISSING";
  if (green.implementationKind !== "smallest_correct_green" || green.cleanupBundled !== false) {
    return "GREEN_NOT_SMALLEST";
  }
  if (greenPaths.some((path) => !authority.authorizedPaths.includes(path))) {
    return "PACKET_SCOPE_EXCEEDED";
  }
  const greenMackEvidence = focusedMackEvidence(
    green.mackEvidence,
    criterionId,
    packetId,
    authority.contractDigest,
    green.revisionId,
  );
  if (greenMackEvidence === null) return "MACK_EVIDENCE_MISSING";
  const normalizedGreen = Object.freeze({
    state: "green_proven" as const,
    evidenceId: green.evidenceId,
    ownerSeatId: "may" as const,
    criterionId,
    packetId,
    contractDigest: authority.contractDigest,
    revisionId: green.revisionId,
    changedPaths: greenPaths,
    implementationKind: "smallest_correct_green" as const,
    cleanupBundled: false as const,
    mackEvidence: greenMackEvidence,
  });

  if (criterion.refactorEvidence === null) {
    return Object.freeze({
      implementationAuthorityEvidence: authority,
      greenEvidence: normalizedGreen,
      refactorEvidence: null,
    });
  }
  const refactor = record(criterion.refactorEvidence, REFACTOR_EVIDENCE_FIELDS);
  if (refactor === null) return "REFACTOR_NOT_BEHAVIOR_PRESERVING";
  if (refactor.ownerSeatId !== "may") return "SEAT_OWNERSHIP_MISMATCH";
  const refactorAuthorityResult = implementationAuthorityEvidence(
    refactor.implementationAuthorityEvidence,
    criterionId,
    packetId,
    "refactor",
  );
  if (typeof refactorAuthorityResult === "string") return refactorAuthorityResult;
  if (refactorAuthorityResult.contractDigest !== acceptanceContractDigest) {
    return "BINDING_DIGEST_MISMATCH";
  }
  const refactorPaths = relativePaths(refactor.changedPaths);
  if (refactor.state !== "refactor_proven" || !identifier(refactor.evidenceId) ||
      refactor.evidenceId === normalizedGreen.evidenceId || refactor.criterionId !== criterionId ||
      refactor.packetId !== packetId || refactor.contractDigest !== normalizedGreen.contractDigest ||
      refactor.contractDigest !== refactorAuthorityResult.contractDigest ||
      refactorAuthorityResult.evidenceId === authority.evidenceId ||
      refactor.greenRevisionId !== normalizedGreen.revisionId ||
      typeof refactor.revisionId !== "string" || !REVISION.test(refactor.revisionId) ||
      refactor.revisionId === normalizedGreen.revisionId || refactorPaths === null ||
      refactor.implementationKind !== "behavior_preserving_refactor" ||
      refactor.behaviorPreserved !== true || refactor.failureSemanticsPreserved !== true ||
      refactor.authoritySemanticsPreserved !== true ||
      refactor.persistenceSemanticsPreserved !== true || refactor.riskPreserved !== true) {
    return "REFACTOR_NOT_BEHAVIOR_PRESERVING";
  }
  if (refactorPaths.some((path) => !refactorAuthorityResult.authorizedPaths.includes(path))) {
    return "PACKET_SCOPE_EXCEEDED";
  }
  const refactorMackEvidence = focusedMackEvidence(
    refactor.mackEvidence,
    criterionId,
    packetId,
    refactor.contractDigest,
    refactor.revisionId,
  );
  if (refactorMackEvidence === null ||
      refactorMackEvidence.evidenceId === normalizedGreen.mackEvidence.evidenceId) {
    return "MACK_EVIDENCE_MISSING";
  }
  return Object.freeze({
    implementationAuthorityEvidence: authority,
    greenEvidence: normalizedGreen,
    refactorEvidence: Object.freeze({
      state: "refactor_proven" as const,
      evidenceId: refactor.evidenceId,
      ownerSeatId: "may" as const,
      criterionId,
      packetId,
      contractDigest: refactor.contractDigest,
      greenRevisionId: normalizedGreen.revisionId,
      revisionId: refactor.revisionId,
      changedPaths: refactorPaths,
      implementationKind: "behavior_preserving_refactor" as const,
      behaviorPreserved: true as const,
      failureSemanticsPreserved: true as const,
      authoritySemanticsPreserved: true as const,
      persistenceSemanticsPreserved: true as const,
      riskPreserved: true as const,
      implementationAuthorityEvidence: refactorAuthorityResult,
      mackEvidence: refactorMackEvidence,
    }),
  });
}

function executableContract(value: unknown): TddExecutablePreImplementationContractV1 | null {
  const contract = record(value, PRE_IMPLEMENTATION_CONTRACT_FIELDS);
  if (contract === null || !identifier(contract.contractId) || contract.kind !== "executable" ||
      !identifier(contract.checkpointId) || !nonemptyText(contract.expectedBehavior)) return null;
  return Object.freeze({
    contractId: contract.contractId,
    kind: "executable" as const,
    checkpointId: contract.checkpointId,
    expectedBehavior: contract.expectedBehavior,
  });
}

function traceability(value: unknown): TddCriterionTraceabilityV1 | null {
  const spine = record(value, TRACEABILITY_FIELDS);
  if (spine === null || !identifier(spine.planRequirementId) ||
      !identifier(spine.mackCheckpointId) || !identifier(spine.mayPacketId) ||
      !identifier(spine.revisionId) || !identifier(spine.validationEvidenceId) ||
      !identifier(spine.furyReviewId) ||
      (spine.humanReviewId !== null && !identifier(spine.humanReviewId))) return null;
  return Object.freeze({
    planRequirementId: spine.planRequirementId,
    mackCheckpointId: spine.mackCheckpointId,
    mayPacketId: spine.mayPacketId,
    revisionId: spine.revisionId,
    validationEvidenceId: spine.validationEvidenceId,
    furyReviewId: spine.furyReviewId,
    humanReviewId: spine.humanReviewId,
  });
}

function invalid(...reasonCodes: TddMissionStrategyReasonCodeV1[]): TddMissionStrategyValidationV1 {
  return Object.freeze({ state: "invalid" as const, reasonCodes: Object.freeze(reasonCodes) });
}

function packetSizeException(packetIds: readonly string[]): TddMissionStrategyValidationV1 {
  return Object.freeze({
    state: "packet_size_exception_required" as const,
    reasonCodes: Object.freeze(["PACKET_SIZE_LIMIT_EXCEEDED"] as const),
    packetIds: Object.freeze([...packetIds]),
  });
}

function validateTddMissionStrategyContractInputV1(
  input: unknown,
): TddMissionStrategyValidationV1 {
  const contract = record(input, CONTRACT_FIELDS);
  if (contract === null || contract.schemaVersion !== TDD_MISSION_SCHEMA_VERSION ||
      contract.contractVersion !== TDD_MISSION_CONTRACT_VERSION ||
      typeof contract.acceptanceContractDigest !== "string" ||
      !DIGEST.test(contract.acceptanceContractDigest) ||
      !Array.isArray(contract.criteria) || Object.getPrototypeOf(contract.criteria) !== Array.prototype ||
      contract.criteria.length === 0 || contract.criteria.length > 128 ||
      !Array.isArray(contract.packets) || Object.getPrototypeOf(contract.packets) !== Array.prototype ||
      contract.packets.length === 0 || contract.packets.length > 128) {
    return invalid("MALFORMED_INPUT");
  }

  const normalized: TddCriterionStrategyV1[] = [];
  const amendmentEffects: TddExpectationAmendmentEffectV1[] = [];
  const criterionIds = new Set<string>();
  for (const candidate of contract.criteria) {
    if (plainRecordMissingField(candidate, "disposition")) {
      return invalid("CRITERION_DISPOSITION_MISSING");
    }
    const criterion = record(candidate, CRITERION_FIELDS);
    if (criterion === null || !identifier(criterion.criterionId) ||
        criterionIds.has(criterion.criterionId) ||
        !TDD_MISSION_STRATEGIES.includes(criterion.strategy as TddMissionStrategyV1) ||
        !riskFactors(criterion.riskFactors) || criterion.laterValidation !== "required") {
      return invalid("MALFORMED_INPUT");
    }
    if (!nonemptyText(criterion.rationale)) return invalid("STRATEGY_RATIONALE_MISSING");
    if (!TDD_MISSION_CRITERION_DISPOSITIONS.includes(
      criterion.disposition as TddMissionCriterionDispositionV1,
    )) return invalid("CRITERION_DISPOSITION_MISSING");
    const criterionTraceability = traceability(criterion.traceability);
    if (criterionTraceability === null) return invalid("TRACEABILITY_BINDING_MISMATCH");

    criterionIds.add(criterion.criterionId);
    const common = {
      criterionId: criterion.criterionId,
      rationale: criterion.rationale,
      riskFactors: Object.freeze([...(criterion.riskFactors as readonly string[])]),
      laterValidation: "required" as const,
      disposition: criterion.disposition as TddMissionCriterionDispositionV1,
      traceability: criterionTraceability,
    };
    if (criterion.strategy === "tdd_selected") {
      const preImplementationContract = executableContract(criterion.preImplementationContract);
      if (preImplementationContract === null) return invalid("VALIDATION_CONTRACT_MISSING");
      if (preImplementationContract.checkpointId !== criterionTraceability.mackCheckpointId) {
        return invalid("TRACEABILITY_BINDING_MISMATCH");
      }
      const rawState = record(
        criterion.preImplementationStateEvidence,
        PRE_IMPLEMENTATION_STATE_FIELDS,
      );
      if (criterion.expectationAmendment !== null && rawState?.state === "red_established") {
        return invalid("EXPECTATION_AMENDMENT_INCOMPLETE");
      }
      const stateEvidence = preImplementationStateEvidence(
        criterion.preImplementationStateEvidence,
        preImplementationContract,
        contract.acceptanceContractDigest,
      );
      if (typeof stateEvidence === "string") return invalid(stateEvidence);
      const amendmentResult = criterion.expectationAmendment === null
        ? null
        : expectationAmendment(
            criterion.expectationAmendment,
            criterion.criterionId,
            "tdd_selected",
            stateEvidence,
          );
      if (criterion.expectationAmendment !== null && amendmentResult === null) {
        return invalid("EXPECTATION_AMENDMENT_INCOMPLETE");
      }
      if (amendmentResult !== null &&
          amendmentResult.amendment.amendedContractDigest !==
            contract.acceptanceContractDigest) return invalid("BINDING_DIGEST_MISMATCH");
      if (amendmentResult !== null) amendmentEffects.push(amendmentResult.effect);
      const transitionEvidence = implementationTransitionEvidence(
        criterion,
        "tdd_selected",
        stateEvidence,
        amendmentResult?.amendment ?? null,
        criterion.criterionId,
        criterionTraceability.mayPacketId,
        contract.acceptanceContractDigest,
      );
      if (typeof transitionEvidence === "string") return invalid(transitionEvidence);
      normalized.push(Object.freeze({
        ...common,
        strategy: "tdd_selected" as const,
        preImplementationContract,
        preImplementationStateEvidence: stateEvidence,
        expectationAmendment: amendmentResult?.amendment ?? null,
        ...transitionEvidence,
      }));
      continue;
    }
    if (criterion.preImplementationContract !== null ||
        criterion.preImplementationStateEvidence !== null) return invalid("MALFORMED_INPUT");
    const amendmentResult = criterion.expectationAmendment === null
      ? null
      : expectationAmendment(
          criterion.expectationAmendment,
          criterion.criterionId,
          "tdd_declined",
          null,
        );
    if (criterion.expectationAmendment !== null && amendmentResult === null) {
      return invalid("EXPECTATION_AMENDMENT_INCOMPLETE");
    }
    if (amendmentResult !== null &&
        amendmentResult.amendment.amendedContractDigest !==
          contract.acceptanceContractDigest) return invalid("BINDING_DIGEST_MISMATCH");
    if (amendmentResult !== null) amendmentEffects.push(amendmentResult.effect);
    const transitionEvidence = implementationTransitionEvidence(
      criterion,
      "tdd_declined",
      null,
      amendmentResult?.amendment ?? null,
      criterion.criterionId,
      criterionTraceability.mayPacketId,
      contract.acceptanceContractDigest,
    );
    if (typeof transitionEvidence === "string") return invalid(transitionEvidence);
    normalized.push(Object.freeze({
      ...common,
      strategy: "tdd_declined" as const,
      preImplementationContract: null,
      preImplementationStateEvidence: null,
      expectationAmendment: amendmentResult?.amendment ?? null,
      ...transitionEvidence,
    }));
  }

  const packets: Array<{
    readonly packetId: string;
    readonly criterionIds: readonly unknown[];
    readonly couplingRationale: unknown;
    readonly minimalPaths: readonly string[];
    readonly requiredInterfaces: readonly string[];
    readonly allowedEffects: readonly string[];
    readonly focusedValidation: readonly string[];
    readonly expectedOutput: string;
    readonly stopConditions: readonly string[];
    readonly successor: string;
  }> = [];
  const packetIds = new Set<string>();
  for (const candidate of contract.packets) {
    const packet = record(candidate, PACKET_FIELDS);
    const minimalPaths = packet === null ? null : relativePaths(packet.minimalPaths);
    const requiredInterfaces = packet === null ? null : textArray(packet.requiredInterfaces);
    const allowedEffects = packet === null ? null : textArray(packet.allowedEffects);
    const focusedValidation = packet === null ? null : textArray(packet.focusedValidation);
    const stopConditions = packet === null ? null : textArray(packet.stopConditions);
    if (packet === null || !identifier(packet.packetId) || packetIds.has(packet.packetId) ||
        !Array.isArray(packet.criterionIds) ||
        Object.getPrototypeOf(packet.criterionIds) !== Array.prototype ||
        packet.criterionIds.length === 0 || packet.criterionIds.length > 128 ||
        (packet.couplingRationale !== null && typeof packet.couplingRationale !== "string") ||
        minimalPaths === null || requiredInterfaces === null || allowedEffects === null ||
        focusedValidation === null || !nonemptyText(packet.expectedOutput) ||
        stopConditions === null || !identifier(packet.successor)) {
      return invalid("MALFORMED_INPUT");
    }
    packetIds.add(packet.packetId);
    packets.push({
      packetId: packet.packetId,
      criterionIds: packet.criterionIds,
      couplingRationale: packet.couplingRationale,
      minimalPaths,
      requiredInterfaces,
      allowedEffects,
      focusedValidation,
      expectedOutput: packet.expectedOutput,
      stopConditions,
      successor: packet.successor,
    });
  }

  const oversizedPacketIds = packets
    .filter((packet) => packet.criterionIds.length >= 4)
    .map((packet) => packet.packetId);
  if (oversizedPacketIds.length > 0) return packetSizeException(oversizedPacketIds);

  const normalizedPackets: TddImplementationPacketV1[] = [];
  const ownedCriterionIds = new Set<string>();
  for (const packet of packets) {
    if (!packet.criterionIds.every(identifier)) return invalid("MALFORMED_INPUT");
    if (packet.criterionIds.length > 1 && !nonemptyText(packet.couplingRationale)) {
      return invalid("PACKET_COUPLING_RATIONALE_MISSING");
    }
    for (const criterionId of packet.criterionIds as readonly string[]) {
      if (!criterionIds.has(criterionId)) return invalid("PACKET_CRITERION_MISSING");
      if (ownedCriterionIds.has(criterionId)) return invalid("PACKET_CRITERION_DUPLICATED");
      ownedCriterionIds.add(criterionId);
    }
    normalizedPackets.push(Object.freeze({
      packetId: packet.packetId,
      criterionIds: Object.freeze([...(packet.criterionIds as readonly string[])]),
      couplingRationale: packet.couplingRationale as string | null,
      minimalPaths: packet.minimalPaths,
      requiredInterfaces: packet.requiredInterfaces,
      allowedEffects: packet.allowedEffects,
      focusedValidation: packet.focusedValidation,
      expectedOutput: packet.expectedOutput,
      stopConditions: packet.stopConditions,
      successor: packet.successor,
    }));
  }

  if (ownedCriterionIds.size !== criterionIds.size) return invalid("PACKET_CRITERION_MISSING");
  for (const criterion of normalized) {
    const criterionPacket = normalizedPackets.find(
      (packet) => packet.packetId === criterion.traceability.mayPacketId &&
        packet.criterionIds.includes(criterion.criterionId),
    );
    if (!packetIds.has(criterion.traceability.mayPacketId) || criterionPacket === undefined) {
      return invalid("TRACEABILITY_BINDING_MISMATCH");
    }
    const transitionPaths = [
      criterion.implementationAuthorityEvidence?.authorizedPaths,
      criterion.greenEvidence?.changedPaths,
      criterion.refactorEvidence?.implementationAuthorityEvidence.authorizedPaths,
      criterion.refactorEvidence?.changedPaths,
    ].filter((paths): paths is readonly string[] => paths !== undefined);
    if (transitionPaths.some((paths) =>
      paths.some((path) => !criterionPacket.minimalPaths.includes(path)))) {
      return invalid("PACKET_SCOPE_EXCEEDED");
    }
  }

  return Object.freeze({
    state: "valid" as const,
    contract: Object.freeze({
      schemaVersion: TDD_MISSION_SCHEMA_VERSION,
      contractVersion: TDD_MISSION_CONTRACT_VERSION,
      acceptanceContractDigest: contract.acceptanceContractDigest,
      criteria: Object.freeze(normalized),
      packets: Object.freeze(normalizedPackets),
    }),
    amendmentEffects: Object.freeze(amendmentEffects),
  });
}

export function validateTddMissionStrategyContractV1(
  input: unknown,
): TddMissionStrategyValidationV1 {
  try {
    return validateTddMissionStrategyContractInputV1(input);
  } catch {
    return invalid("MALFORMED_INPUT");
  }
}

function evidenceStringArray(value: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
        value.length === 0 || value.length > 64 || !value.every(identifier) ||
        new Set(value).size !== value.length) return null;
    return Object.freeze([...value] as string[]);
  } catch {
    return null;
  }
}

function evidenceTestCounts(
  value: unknown,
): Readonly<TddMissionEvidenceTestCountsV1> | null {
  const counts = record(value, EVIDENCE_TEST_COUNT_FIELDS);
  if (counts === null || EVIDENCE_TEST_COUNT_FIELDS.some((field) =>
    !Number.isSafeInteger(counts[field]) || (counts[field] as number) < 0)) return null;
  const total = counts.total as number;
  const passed = counts.passed as number;
  const failed = counts.failed as number;
  const skipped = counts.skipped as number;
  const cancelled = counts.cancelled as number;
  const todo = counts.todo as number;
  if (passed + failed + skipped + cancelled + todo !== total) return null;
  return Object.freeze({ total, passed, failed, skipped, cancelled, todo });
}

function validEvidenceStageOwnership(
  stage: TddMissionEvidenceStageV1,
  seatId: unknown,
  outcome: TddMissionEvidenceOutcomeV1,
): boolean {
  switch (stage) {
    case "strategy_recorded": return seatId === "hill" && outcome === "recorded";
    case "contract_prepared": return seatId === "mack" && outcome === "prepared";
    case "red_established": return seatId === "mack" && outcome === "failed";
    case "implementation_authorized": return seatId === "coulson" && outcome === "authorized";
    case "green_proven": return seatId === "may" && outcome === "passed";
    case "refactor_proven": return seatId === "may" && outcome === "passed";
    case "mack_validation_complete": return seatId === "mack" && outcome === "passed";
    case "fury_conformance_complete": return seatId === "fury" && outcome === "passed";
    case "disposition_recorded":
      return seatId === "hill" && ["deferred", "not_applicable", "pending_decision"]
        .includes(outcome);
  }
}

function exactEvidence(value: unknown): Readonly<TddMissionExactEvidenceV1> | null {
  const evidence = record(value, EXACT_EVIDENCE_FIELDS);
  if (evidence === null || !identifier(evidence.evidenceId) || !identifier(evidence.missionId) ||
      typeof evidence.planDigest !== "string" || !DIGEST.test(evidence.planDigest) ||
      typeof evidence.acceptanceContractDigest !== "string" ||
      !DIGEST.test(evidence.acceptanceContractDigest) ||
      !identifier(evidence.criterionId) || !identifier(evidence.packetId) ||
      !TDD_MISSION_EVIDENCE_STAGES.includes(evidence.stage as TddMissionEvidenceStageV1) ||
      !identifier(evidence.runtimeId) || !identifier(evidence.modelId) ||
      !identifier(evidence.executorId) ||
      !identifier(evidence.repositoryId) || !identifier(evidence.branch) ||
      !nonemptyText(evidence.cwd) ||
      typeof evidence.startRevisionId !== "string" || !REVISION.test(evidence.startRevisionId) ||
      typeof evidence.startTreeDigest !== "string" || !REVISION.test(evidence.startTreeDigest) ||
      typeof evidence.endRevisionId !== "string" || !REVISION.test(evidence.endRevisionId) ||
      typeof evidence.endTreeDigest !== "string" || !REVISION.test(evidence.endTreeDigest) ||
      typeof evidence.revisionId !== "string" || !REVISION.test(evidence.revisionId) ||
      typeof evidence.treeDigest !== "string" || !REVISION.test(evidence.treeDigest) ||
      evidence.revisionId !== evidence.endRevisionId ||
      evidence.treeDigest !== evidence.endTreeDigest ||
      (evidence.command !== null && !nonemptyText(evidence.command)) ||
      !(evidence.exitCode === null || (Number.isSafeInteger(evidence.exitCode) &&
        (evidence.exitCode as number) >= 0 && (evidence.exitCode as number) <= 255)) ||
      (evidence.cacheEvidence !== null && !nonemptyText(evidence.cacheEvidence)) ||
      !identifier(evidence.checkpointId) ||
      !TDD_MISSION_EVIDENCE_OUTCOMES.includes(evidence.outcome as TddMissionEvidenceOutcomeV1) ||
      (evidence.failureClassification !== null &&
        !failureClassification(evidence.failureClassification)) ||
      (evidence.successor !== null && evidence.successor !== "mission_complete" &&
        !TDD_MISSION_EVIDENCE_STAGES.includes(
          evidence.successor as TddMissionEvidenceStageV1,
        )) ||
      (evidence.stopCondition !== null && !nonemptyText(evidence.stopCondition)) ||
      (evidence.decisionOwnerSeatId !== null && !identifier(evidence.decisionOwnerSeatId))) {
    return null;
  }
  const stage = evidence.stage as TddMissionEvidenceStageV1;
  const outcome = evidence.outcome as TddMissionEvidenceOutcomeV1;
  if (!validEvidenceStageOwnership(stage, evidence.seatId, outcome)) return null;
  const testCounts = evidence.testCounts === null ? null : evidenceTestCounts(evidence.testCounts);
  if ((evidence.testCounts !== null && testCounts === null) ||
      (evidence.command === null
        ? evidence.exitCode !== null || testCounts !== null || evidence.cacheEvidence !== null
        : evidence.exitCode === null || testCounts === null || evidence.cacheEvidence === null) ||
      (evidence.command !== null && outcome === "passed" && evidence.exitCode !== 0) ||
      (evidence.command !== null && outcome === "failed" && evidence.exitCode === 0)) return null;
  const isPendingDecision = stage === "disposition_recorded" && outcome === "pending_decision";
  if (isPendingDecision
    ? evidence.successor !== null || evidence.stopCondition === null ||
      evidence.decisionOwnerSeatId === null
    : evidence.successor === null || evidence.stopCondition !== null ||
      evidence.decisionOwnerSeatId !== null) return null;
  if ((stage === "red_established") !== (evidence.failureClassification !== null) ||
      (["red_established", "mack_validation_complete"].includes(stage) &&
        evidence.command === null)) return null;
  const sourceRefs = evidenceStringArray(evidence.sourceRefs);
  if (sourceRefs === null) return null;
  return Object.freeze({
    evidenceId: evidence.evidenceId,
    missionId: evidence.missionId,
    planDigest: evidence.planDigest,
    acceptanceContractDigest: evidence.acceptanceContractDigest,
    criterionId: evidence.criterionId,
    packetId: evidence.packetId,
    stage,
    seatId: evidence.seatId as TddMissionEvidenceSeatV1,
    runtimeId: evidence.runtimeId,
    modelId: evidence.modelId,
    executorId: evidence.executorId,
    repositoryId: evidence.repositoryId,
    branch: evidence.branch,
    cwd: evidence.cwd,
    startRevisionId: evidence.startRevisionId,
    startTreeDigest: evidence.startTreeDigest,
    endRevisionId: evidence.endRevisionId,
    endTreeDigest: evidence.endTreeDigest,
    revisionId: evidence.revisionId,
    treeDigest: evidence.treeDigest,
    command: evidence.command as string | null,
    exitCode: evidence.exitCode as number | null,
    testCounts,
    cacheEvidence: evidence.cacheEvidence as string | null,
    checkpointId: evidence.checkpointId,
    outcome,
    failureClassification:
      evidence.failureClassification as TddMissionFailureClassificationV1 | null,
    sourceRefs,
    successor: evidence.successor as TddMissionEvidenceSuccessorV1 | null,
    stopCondition: evidence.stopCondition as string | null,
    decisionOwnerSeatId: evidence.decisionOwnerSeatId as string | null,
  });
}

function blockedMission(
  reasonCode: TddMissionStrategyReasonCodeV1,
  criterionIds: readonly string[] = [],
  stopCondition = "mission_completion_blocked",
  decisionOwnerSeatId: string | null = null,
): TddMissionEvaluationV1 {
  return Object.freeze({
    state: "blocked" as const,
    reasonCodes: Object.freeze([reasonCode]),
    criterionIds: Object.freeze([...criterionIds]),
    successor: null,
    stopCondition,
    decisionOwnerSeatId,
  });
}

function stageEvidence(
  evidence: readonly Readonly<TddMissionExactEvidenceV1>[],
  stage: TddMissionEvidenceStageV1,
): Readonly<TddMissionExactEvidenceV1> | null | "duplicate" {
  const matches = evidence.filter((item) => item.stage === stage);
  return matches.length === 0 ? null : matches.length === 1 ? matches[0] : "duplicate";
}

function exactPoint(
  evidence: Readonly<TddMissionExactEvidenceV1>,
  revisionId: string,
  treeDigest: string | null,
): boolean {
  return evidence.revisionId === revisionId &&
    (treeDigest === null || evidence.treeDigest === treeDigest);
}

function exactStartPoint(
  evidence: Readonly<TddMissionExactEvidenceV1>,
  revisionId: string,
  treeDigest: string,
): boolean {
  return evidence.startRevisionId === revisionId && evidence.startTreeDigest === treeDigest;
}

function containsRefs(
  evidence: Readonly<TddMissionExactEvidenceV1>,
  ...refs: readonly string[]
): boolean {
  return refs.every((ref) => evidence.sourceRefs.includes(ref));
}

function evidenceTransitionMatches(
  evidence: Readonly<TddMissionExactEvidenceV1>,
  checkpointId: string,
  successor: TddMissionEvidenceSuccessorV1,
): boolean {
  return evidence.checkpointId === checkpointId && evidence.successor === successor;
}

function evaluateTddMissionInputV1(input: unknown): TddMissionEvaluationV1 {
  const mission = record(input, MISSION_EVALUATION_FIELDS);
  if (mission === null || mission.schemaVersion !== TDD_MISSION_SCHEMA_VERSION ||
      mission.contractVersion !== TDD_MISSION_CONTRACT_VERSION ||
      !identifier(mission.missionId) || typeof mission.planDigest !== "string" ||
      !DIGEST.test(mission.planDigest) ||
      typeof mission.reviewedAcceptanceContractDigest !== "string" ||
      !DIGEST.test(mission.reviewedAcceptanceContractDigest) ||
      !identifier(mission.repositoryId) ||
      !identifier(mission.branch) || typeof mission.planningRevisionId !== "string" ||
      !REVISION.test(mission.planningRevisionId) ||
      typeof mission.planningTreeDigest !== "string" ||
      !REVISION.test(mission.planningTreeDigest) ||
      typeof mission.headRevisionId !== "string" || !REVISION.test(mission.headRevisionId) ||
      typeof mission.headTreeDigest !== "string" || !REVISION.test(mission.headTreeDigest) ||
      !Array.isArray(mission.evidence) ||
      Object.getPrototypeOf(mission.evidence) !== Array.prototype) {
    return blockedMission("MALFORMED_INPUT");
  }

  const strategy = validateTddMissionStrategyContractV1(mission.strategyContract);
  if (strategy.state === "packet_size_exception_required") {
    return Object.freeze({
      state: "packet_size_exception_required" as const,
      reasonCodes: Object.freeze(["PACKET_SIZE_LIMIT_EXCEEDED"] as const),
      packetIds: strategy.packetIds,
      successor: null,
      stopCondition: "feature_hill_packet_size_exception" as const,
    });
  }
  if (strategy.state === "invalid") return blockedMission(strategy.reasonCodes[0]);
  if (strategy.contract.acceptanceContractDigest !==
      mission.reviewedAcceptanceContractDigest) {
    return blockedMission("BINDING_DIGEST_MISMATCH");
  }

  const normalizedEvidence: Readonly<TddMissionExactEvidenceV1>[] = [];
  const evidenceIds = new Set<string>();
  const revisionTrees = new Map<string, string>();
  for (const candidate of mission.evidence) {
    const evidence = exactEvidence(candidate);
    if (evidence === null || evidenceIds.has(evidence.evidenceId)) {
      return blockedMission("EVIDENCE_SCHEMA_INVALID");
    }
    if (evidence.missionId !== mission.missionId || evidence.planDigest !== mission.planDigest ||
        evidence.acceptanceContractDigest !== mission.reviewedAcceptanceContractDigest ||
        evidence.repositoryId !== mission.repositoryId || evidence.branch !== mission.branch) {
      return blockedMission("BINDING_DIGEST_MISMATCH", [evidence.criterionId]);
    }
    const packet = strategy.contract.packets.find((item) =>
      item.packetId === evidence.packetId && item.criterionIds.includes(evidence.criterionId));
    if (packet === undefined) {
      return blockedMission("TRACEABILITY_BINDING_MISMATCH", [evidence.criterionId]);
    }
    const knownTree = revisionTrees.get(evidence.revisionId);
    if (knownTree !== undefined && knownTree !== evidence.treeDigest) {
      return blockedMission("STALE_EXACT_REVISION_EVIDENCE", [evidence.criterionId]);
    }
    revisionTrees.set(evidence.revisionId, evidence.treeDigest);
    evidenceIds.add(evidence.evidenceId);
    normalizedEvidence.push(evidence);
  }

  const completedCriterionIds: string[] = [];
  for (const criterion of strategy.contract.criteria) {
    const criterionIds = [criterion.criterionId] as const;
    const evidence = normalizedEvidence.filter((item) =>
      item.criterionId === criterion.criterionId &&
      item.packetId === criterion.traceability.mayPacketId);
    const strategyRecord = stageEvidence(evidence, "strategy_recorded");
    if (strategyRecord === "duplicate") return blockedMission("EVIDENCE_SCHEMA_INVALID", criterionIds);
    if (strategyRecord === null) return blockedMission("EVIDENCE_MISSING", criterionIds);
    const strategySuccessor = criterion.disposition !== "implemented_and_proven"
      ? "disposition_recorded" as const
      : criterion.strategy === "tdd_selected"
        ? "contract_prepared" as const
        : "implementation_authorized" as const;
    if (!exactPoint(
      strategyRecord,
      mission.planningRevisionId as string,
      mission.planningTreeDigest as string,
    ) || !evidenceTransitionMatches(
      strategyRecord,
      criterion.traceability.planRequirementId,
      strategySuccessor,
    ) || !containsRefs(strategyRecord, criterion.traceability.planRequirementId)) {
      return blockedMission("STALE_EXACT_REVISION_EVIDENCE", criterionIds);
    }

    if (criterion.disposition !== "implemented_and_proven") {
      if (evidence.some((item) =>
        item.stage !== "strategy_recorded" && item.stage !== "disposition_recorded") ||
          criterion.implementationAuthorityEvidence !== null || criterion.greenEvidence !== null ||
          criterion.refactorEvidence !== null) {
        return blockedMission("DISPOSITION_EVIDENCE_MISSING", criterionIds);
      }
      const disposition = stageEvidence(evidence, "disposition_recorded");
      if (disposition === "duplicate") {
        return blockedMission("EVIDENCE_SCHEMA_INVALID", criterionIds);
      }
      if (disposition === null) {
        return blockedMission("DISPOSITION_EVIDENCE_MISSING", criterionIds);
      }
      if (!exactPoint(
        disposition,
        mission.headRevisionId as string,
        mission.headTreeDigest as string,
      )) return blockedMission("STALE_EXACT_REVISION_EVIDENCE", criterionIds);
      if (criterion.disposition === "blocked_pending_explicit_decision") {
        if (disposition.outcome !== "pending_decision" ||
            disposition.decisionOwnerSeatId === null) {
          return blockedMission("DISPOSITION_EVIDENCE_MISSING", criterionIds);
        }
        return blockedMission(
          "BLOCKED_PENDING_EXPLICIT_DECISION",
          criterionIds,
          disposition.stopCondition ?? "explicit_decision_required",
          disposition.decisionOwnerSeatId,
        );
      }
      const expectedOutcome = criterion.disposition === "deferred_with_linked_issue"
        ? "deferred" as const
        : "not_applicable" as const;
      if (disposition.outcome !== expectedOutcome ||
          disposition.successor !== "mission_complete" ||
          (expectedOutcome === "deferred" &&
            !disposition.sourceRefs.some((ref) => ref.startsWith("issue:")))) {
        return blockedMission("DISPOSITION_EVIDENCE_MISSING", criterionIds);
      }
      completedCriterionIds.push(criterion.criterionId);
      continue;
    }

    const allowedStages = new Set<TddMissionEvidenceStageV1>([
      "strategy_recorded",
      ...(criterion.strategy === "tdd_selected"
        ? ["contract_prepared" as const, "red_established" as const]
        : []),
      "implementation_authorized",
      "green_proven",
      ...(criterion.refactorEvidence === null ? [] : ["refactor_proven" as const]),
      "mack_validation_complete",
      "fury_conformance_complete",
    ]);
    if (evidence.some((item) => !allowedStages.has(item.stage))) {
      return blockedMission("EVIDENCE_SCHEMA_INVALID", criterionIds);
    }

    let redEvidenceId: string | null = null;
    if (criterion.strategy === "tdd_selected") {
      const prepared = stageEvidence(evidence, "contract_prepared");
      const red = stageEvidence(evidence, "red_established");
      if (prepared === "duplicate" || red === "duplicate") {
        return blockedMission("EVIDENCE_SCHEMA_INVALID", criterionIds);
      }
      if (prepared === null || red === null ||
          criterion.preImplementationStateEvidence.state !== "red_established") {
        return blockedMission("RED_NOT_ESTABLISHED", criterionIds);
      }
      const state = criterion.preImplementationStateEvidence;
      if (!exactPoint(
        prepared,
        mission.planningRevisionId as string,
        mission.planningTreeDigest as string,
      ) || !evidenceTransitionMatches(
        prepared,
        criterion.preImplementationContract.checkpointId,
        "red_established",
      ) || !containsRefs(prepared, criterion.preImplementationContract.contractId) ||
          !exactPoint(red, state.revisionId, mission.planningTreeDigest as string) ||
          red.evidenceId !== state.evidenceId ||
          !evidenceTransitionMatches(
            red,
            criterion.preImplementationContract.checkpointId,
            "implementation_authorized",
          ) || red.command !== state.failureEvidence.command ||
          red.failureClassification !== state.expectedFailureClassification ||
          !containsRefs(
            red,
            prepared.evidenceId,
            state.furyContractDisposition.evidenceId,
          )) return blockedMission("STALE_EXACT_REVISION_EVIDENCE", criterionIds);
      redEvidenceId = red.evidenceId;
    }

    if (criterion.expectationAmendment !== null) {
      return blockedMission("EXPECTATION_AMENDMENT_INCOMPLETE", criterionIds);
    }
    const authority = stageEvidence(evidence, "implementation_authorized");
    const green = stageEvidence(evidence, "green_proven");
    if (authority === "duplicate" || green === "duplicate") {
      return blockedMission("EVIDENCE_SCHEMA_INVALID", criterionIds);
    }
    if (criterion.implementationAuthorityEvidence === null || authority === null) {
      return blockedMission("IMPLEMENTATION_AUTHORITY_MISSING", criterionIds);
    }
    if (criterion.greenEvidence === null || green === null) {
      return blockedMission("GREEN_EVIDENCE_MISSING", criterionIds);
    }
    const authorityReceipt = criterion.implementationAuthorityEvidence;
    const greenReceipt = criterion.greenEvidence;
    const authorityRevision = criterion.strategy === "tdd_selected"
      ? criterion.preImplementationStateEvidence.revisionId
      : mission.planningRevisionId as string;
    const authorityRefs = criterion.strategy === "tdd_selected"
      ? [redEvidenceId as string]
      : [strategyRecord.evidenceId];
    if (!exactPoint(authority, authorityRevision, mission.planningTreeDigest as string) ||
        authority.evidenceId !== authorityReceipt.evidenceId ||
        !evidenceTransitionMatches(authority, authorityReceipt.evidenceId, "green_proven") ||
        !containsRefs(authority, ...authorityRefs) ||
        green.evidenceId !== greenReceipt.evidenceId ||
        green.revisionId !== greenReceipt.revisionId ||
        !exactStartPoint(green, authority.endRevisionId, authority.endTreeDigest) ||
        !containsRefs(green, authority.evidenceId)) {
      return blockedMission("STALE_EXACT_REVISION_EVIDENCE", criterionIds);
    }

    let finalImplementationEvidence = green;
    let finalImplementationReceipt: TddGreenEvidenceV1 | TddRefactorEvidenceV1 = greenReceipt;
    if (criterion.refactorEvidence !== null) {
      const refactor = stageEvidence(evidence, "refactor_proven");
      if (refactor === "duplicate") return blockedMission("EVIDENCE_SCHEMA_INVALID", criterionIds);
      if (refactor === null || green.successor !== "refactor_proven" ||
          refactor.evidenceId !== criterion.refactorEvidence.evidenceId ||
          refactor.revisionId !== criterion.refactorEvidence.revisionId ||
          !exactStartPoint(refactor, green.endRevisionId, green.endTreeDigest) ||
          !containsRefs(
            refactor,
            green.evidenceId,
            criterion.refactorEvidence.implementationAuthorityEvidence.evidenceId,
          ) || refactor.successor !== "mack_validation_complete") {
        return blockedMission("REFACTOR_NOT_BEHAVIOR_PRESERVING", criterionIds);
      }
      finalImplementationEvidence = refactor;
      finalImplementationReceipt = criterion.refactorEvidence;
    } else if (green.successor !== "mack_validation_complete") {
      return blockedMission("EVIDENCE_SCHEMA_INVALID", criterionIds);
    }

    if (criterion.traceability.revisionId !== finalImplementationReceipt.revisionId ||
        finalImplementationEvidence.revisionId !== finalImplementationReceipt.revisionId) {
      return blockedMission("STALE_EXACT_REVISION_EVIDENCE", criterionIds);
    }
    const mack = stageEvidence(evidence, "mack_validation_complete");
    const fury = stageEvidence(evidence, "fury_conformance_complete");
    if (mack === "duplicate" || fury === "duplicate") {
      return blockedMission("EVIDENCE_SCHEMA_INVALID", criterionIds);
    }
    if (mack === null) return blockedMission("MACK_EVIDENCE_MISSING", criterionIds);
    if (fury === null) return blockedMission("REVIEW_EVIDENCE_MISSING", criterionIds);
    const focusedMack = finalImplementationReceipt.mackEvidence;
    if (!exactPoint(
      mack,
      finalImplementationEvidence.endRevisionId,
      finalImplementationEvidence.endTreeDigest,
    ) || !exactStartPoint(
      mack,
      finalImplementationEvidence.endRevisionId,
      finalImplementationEvidence.endTreeDigest,
    ) || !exactPoint(
      fury,
      finalImplementationEvidence.endRevisionId,
      finalImplementationEvidence.endTreeDigest,
    ) || !exactStartPoint(
      fury,
      finalImplementationEvidence.endRevisionId,
      finalImplementationEvidence.endTreeDigest,
    )) {
      return blockedMission("STALE_EXACT_REVISION_EVIDENCE", criterionIds);
    }
    if (mack.evidenceId !== criterion.traceability.validationEvidenceId ||
        mack.command !== focusedMack.command ||
        !evidenceTransitionMatches(
          mack,
          criterion.traceability.mackCheckpointId,
          "fury_conformance_complete",
        ) || !containsRefs(mack, finalImplementationEvidence.evidenceId) ||
        fury.evidenceId !== criterion.traceability.furyReviewId ||
        !evidenceTransitionMatches(
          fury,
          criterion.traceability.furyReviewId,
          "mission_complete",
        ) || !containsRefs(fury, mack.evidenceId) ||
        (criterion.traceability.humanReviewId !== null &&
          !containsRefs(fury, criterion.traceability.humanReviewId))) {
      return blockedMission("REVIEW_EVIDENCE_MISSING", criterionIds);
    }
    completedCriterionIds.push(criterion.criterionId);
  }

  const normalizedInput = Object.freeze({
    schemaVersion: TDD_MISSION_SCHEMA_VERSION,
    contractVersion: TDD_MISSION_CONTRACT_VERSION,
    missionId: mission.missionId as string,
    planDigest: mission.planDigest as string,
    reviewedAcceptanceContractDigest: mission.reviewedAcceptanceContractDigest as string,
    repositoryId: mission.repositoryId as string,
    branch: mission.branch as string,
    planningRevisionId: mission.planningRevisionId as string,
    planningTreeDigest: mission.planningTreeDigest as string,
    headRevisionId: mission.headRevisionId as string,
    headTreeDigest: mission.headTreeDigest as string,
    strategyContract: strategy.contract,
    evidence: Object.freeze(normalizedEvidence),
  });
  return Object.freeze({
    state: "eligible" as const,
    reasonCodes: Object.freeze([]) as readonly [],
    criterionIds: Object.freeze(completedCriterionIds),
    successor: "mission_complete" as const,
    stopCondition: null,
    input: normalizedInput,
  });
}

export function evaluateTddMissionV1(input: unknown): TddMissionEvaluationV1 {
  try {
    return evaluateTddMissionInputV1(input);
  } catch {
    return blockedMission("MALFORMED_INPUT");
  }
}
