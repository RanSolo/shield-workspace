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
] as const);

export type TddMissionStrategyV1 = (typeof TDD_MISSION_STRATEGIES)[number];
export type TddMissionCriterionDispositionV1 =
  (typeof TDD_MISSION_CRITERION_DISPOSITIONS)[number];
export type TddMissionFailureClassificationV1 =
  (typeof TDD_MISSION_FAILURE_CLASSIFICATIONS)[number];
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

interface TddCriterionStrategyCommonV1 {
  readonly criterionId: string;
  readonly rationale: string;
  readonly riskFactors: readonly string[];
  readonly laterValidation: "required";
  readonly disposition: TddMissionCriterionDispositionV1;
  readonly traceability: Readonly<TddCriterionTraceabilityV1>;
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
      normalized.push(Object.freeze({
        ...common,
        strategy: "tdd_selected" as const,
        preImplementationContract,
        preImplementationStateEvidence: stateEvidence,
      }));
      continue;
    }
    if (criterion.preImplementationContract !== null ||
        criterion.preImplementationStateEvidence !== null) return invalid("MALFORMED_INPUT");
    normalized.push(Object.freeze({
      ...common,
      strategy: "tdd_declined" as const,
      preImplementationContract: null,
      preImplementationStateEvidence: null,
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
  });
}
