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
] as const);

export type TddMissionStrategyV1 = (typeof TDD_MISSION_STRATEGIES)[number];
export type TddMissionCriterionDispositionV1 =
  (typeof TDD_MISSION_CRITERION_DISPOSITIONS)[number];
export type TddMissionFailureClassificationV1 =
  (typeof TDD_MISSION_FAILURE_CLASSIFICATIONS)[number];
export type TddMissionExpectationAmendmentKindV1 =
  (typeof TDD_MISSION_EXPECTATION_AMENDMENT_KINDS)[number];
export type TddMissionStrategyReasonCodeV1 =
  (typeof TDD_MISSION_STRATEGY_REASON_CODES)[number];

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

interface TddCriterionStrategyCommonV1 {
  readonly criterionId: string;
  readonly rationale: string;
  readonly riskFactors: readonly string[];
  readonly laterValidation: "required";
  readonly disposition: TddMissionCriterionDispositionV1;
  readonly traceability: Readonly<TddCriterionTraceabilityV1>;
  readonly expectationAmendment: Readonly<TddExpectationAmendmentV1> | null;
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
}

export interface TddMissionStrategyContractV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "tdd.mission.v1";
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
const CONTRACT_FIELDS = ["schemaVersion", "contractVersion", "criteria", "packets"] as const;
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
const PACKET_FIELDS = ["packetId", "criterionIds", "couplingRationale"] as const;
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
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
    value.length > 0 && value.length <= 64 && value.every(nonemptyText) &&
    new Set(value).size === value.length;
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

export function validateTddMissionStrategyContractV1(input: unknown): TddMissionStrategyValidationV1 {
  const contract = record(input, CONTRACT_FIELDS);
  if (contract === null || contract.schemaVersion !== TDD_MISSION_SCHEMA_VERSION ||
      contract.contractVersion !== TDD_MISSION_CONTRACT_VERSION ||
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
      const stateEvidence = preImplementationStateEvidence(
        criterion.preImplementationStateEvidence,
        preImplementationContract,
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
      if (amendmentResult !== null) amendmentEffects.push(amendmentResult.effect);
      normalized.push(Object.freeze({
        ...common,
        strategy: "tdd_selected" as const,
        preImplementationContract,
        preImplementationStateEvidence: stateEvidence,
        expectationAmendment: amendmentResult?.amendment ?? null,
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
    if (amendmentResult !== null) amendmentEffects.push(amendmentResult.effect);
    normalized.push(Object.freeze({
      ...common,
      strategy: "tdd_declined" as const,
      preImplementationContract: null,
      preImplementationStateEvidence: null,
      expectationAmendment: amendmentResult?.amendment ?? null,
    }));
  }

  const packets: Array<{
    readonly packetId: string;
    readonly criterionIds: readonly unknown[];
    readonly couplingRationale: unknown;
  }> = [];
  const packetIds = new Set<string>();
  for (const candidate of contract.packets) {
    const packet = record(candidate, PACKET_FIELDS);
    if (packet === null || !identifier(packet.packetId) || packetIds.has(packet.packetId) ||
        !Array.isArray(packet.criterionIds) ||
        Object.getPrototypeOf(packet.criterionIds) !== Array.prototype ||
        packet.criterionIds.length === 0 || packet.criterionIds.length > 128 ||
        (packet.couplingRationale !== null && typeof packet.couplingRationale !== "string")) {
      return invalid("MALFORMED_INPUT");
    }
    packetIds.add(packet.packetId);
    packets.push({
      packetId: packet.packetId,
      criterionIds: packet.criterionIds,
      couplingRationale: packet.couplingRationale,
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
    }));
  }

  if (ownedCriterionIds.size !== criterionIds.size) return invalid("PACKET_CRITERION_MISSING");
  for (const criterion of normalized) {
    if (!packetIds.has(criterion.traceability.mayPacketId) ||
        !normalizedPackets.some((packet) => packet.packetId === criterion.traceability.mayPacketId &&
          packet.criterionIds.includes(criterion.criterionId))) {
      return invalid("TRACEABILITY_BINDING_MISMATCH");
    }
  }

  return Object.freeze({
    state: "valid" as const,
    contract: Object.freeze({
      schemaVersion: TDD_MISSION_SCHEMA_VERSION,
      contractVersion: TDD_MISSION_CONTRACT_VERSION,
      criteria: Object.freeze(normalized),
      packets: Object.freeze(normalizedPackets),
    }),
    amendmentEffects: Object.freeze(amendmentEffects),
  });
}
