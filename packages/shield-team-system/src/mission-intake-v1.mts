import { types as utilTypes } from "node:util";
import {
  SUPPORTED_MODE_IDS,
  SUPPORTED_SEAT_IDS,
  validateShieldConfig,
  type ShieldConfig,
} from "./config.mjs";
import {
  createEvidenceRequirements,
  createSupervisedMissionBrief,
  validateSupervisedMissionBrief,
  type EvidenceRequirement,
  type EvidenceTimestamp,
  type MissionRiskFlags,
  type SupervisedMissionBrief,
} from "./mission-v2.mjs";
import {
  classifyMissionRisk,
  type RiskAssessment,
} from "../public/mission.mjs";
export { profileAwareMissionIntakeV1 } from "./profile-aware-mission-v1.mjs";

export const MISSION_INTAKE_SCHEMA_VERSION = 1 as const;
export const MISSION_INTAKE_CONTRACT_VERSION = "mission.intake.v1" as const;

export const MISSION_INTAKE_MAX_BRIEF_IDENTIFIER_LENGTH = 256 as const;
export const MISSION_INTAKE_MAX_OBJECTIVE_LENGTH = 512 as const;
export const MISSION_INTAKE_MAX_REPOSITORY_ID_LENGTH = 201 as const;
export const MISSION_INTAKE_MAX_BRANCH_LENGTH = 256 as const;
export const MISSION_INTAKE_MAX_REPOSITORY_REVISION_LENGTH = 128 as const;
export const MISSION_INTAKE_MAX_RUNTIME_ID_LENGTH = 256 as const;
export const MISSION_INTAKE_MAX_SOURCE_REF_LENGTH = 2_048 as const;
export const MISSION_INTAKE_MAX_ARTIFACT_PATH_LENGTH = 512 as const;
export const MISSION_INTAKE_MAX_RECOMMENDATION_REASON_LENGTH = 2_048 as const;
export const MISSION_INTAKE_MAX_PARTICIPANTS = SUPPORTED_SEAT_IDS.length;
export const MISSION_INTAKE_MAX_MODE_RECOMMENDATIONS = 16 as const;
export const MISSION_INTAKE_MAX_RUNTIME_OBSERVATIONS = 16 as const;
export const MISSION_INTAKE_MAX_EVIDENCE_REFS_PER_OBSERVATION = 16 as const;
export const MISSION_INTAKE_MAX_TOTAL_EVIDENCE_REFS = 64 as const;

const ROOT_FIELDS = [
  "schemaVersion",
  "contractVersion",
  "configObservation",
  "repositoryObservation",
  "issueObservation",
  "proposedBrief",
  "recommendedModes",
  "artifacts",
  "runtimeObservations",
] as const;
const REPOSITORY_FIELDS = [
  "assuranceKind",
  "repositoryId",
  "branch",
  "baseRevision",
  "headRevision",
  "observedAt",
  "sourceRef",
] as const;
const ISSUE_FIELDS = [
  "assuranceKind",
  "issueId",
  "issueRevisionId",
  "observedAt",
  "sourceRef",
] as const;
const BRIEF_FIELDS = [
  "missionId",
  "objective",
  "subjectId",
  "riskFlags",
  "participantSeatIds",
  "requireSimmons",
  "createdAt",
] as const;
const TIMESTAMP_FIELDS = ["value", "provenance"] as const;
const ARTIFACTS_FIELDS = [
  "missionBrief",
  "missionCommunication",
  "sharedRuntimeInstructions",
] as const;
const ARTIFACT_FIELDS = ["path", "repositoryRevision", "verification"] as const;
const RECOMMENDATION_FIELDS = ["modeId", "seatId", "reason", "source"] as const;
const RUNTIME_OBSERVATION_FIELDS = [
  "seatId",
  "status",
  "observedAt",
  "runtimeId",
  "evidenceRefs",
] as const;
const CONFIG_OBSERVED_FIELDS = [
  "source",
  "observationState",
  "assuranceKind",
  "observedAt",
  "sourceRef",
  "repositoryRevision",
  "config",
] as const;
const CONFIG_MISSING_FIELDS = [
  "source",
  "observationState",
  "assuranceKind",
  "observedAt",
  "sourceRef",
  "repositoryRevision",
] as const;
const CONFIG_BOOTSTRAP_FIELDS = [
  "source",
  "observationState",
  "assuranceKind",
  "observedAt",
  "sourceRef",
  "config",
] as const;

const BRIEF_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const REPOSITORY_ID =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ISO_UTC =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const HUMAN_SEATS = new Set(["coulson", "fitz", "simmons"]);
const SUPPORTED_SEATS = new Set<string>(SUPPORTED_SEAT_IDS);
const SUPPORTED_MODES = new Set<string>(SUPPORTED_MODE_IDS);

export type MissionIntakeReasonCodeV1 =
  | "INVALID_REQUEST"
  | "INVALID_CONFIG"
  | "REPOSITORY_CONFIG_NOT_OBSERVED"
  | "REPOSITORY_BINDING_MISMATCH"
  | "INVALID_REPOSITORY_OBSERVATION"
  | "INVALID_ISSUE_OBSERVATION"
  | "INVALID_BRIEF_INPUT"
  | "UNSUPPORTED_PARTICIPANT"
  | "HUMAN_GATE_MISSING"
  | "SIMMONS_PARTICIPATION_MISMATCH"
  | "INVALID_MODE_RECOMMENDATION"
  | "INVALID_ARTIFACT_REFERENCE"
  | "INVALID_RUNTIME_OBSERVATION"
  | "BRIEF_CONSTRUCTION_FAILED";

export interface RepositoryObservationV1 {
  readonly assuranceKind: "host_asserted";
  readonly repositoryId: string;
  readonly branch: string;
  readonly baseRevision: string;
  readonly headRevision: string;
  readonly observedAt: string;
  readonly sourceRef: string;
}

export interface IssueObservationV1 {
  readonly assuranceKind: "host_asserted";
  readonly issueId: string;
  readonly issueRevisionId: string;
  readonly observedAt: string;
  readonly sourceRef: string;
}

export interface RepositoryConfigObservationV1 {
  readonly source: "repository_file";
  readonly observationState: "observed";
  readonly assuranceKind: "host_asserted";
  readonly observedAt: string;
  readonly sourceRef: string;
  readonly repositoryRevision: string;
  readonly config: unknown;
}

export interface BootstrapConfigObservationV1 {
  readonly source: "bootstrap_input";
  readonly observationState: "provided_not_repository_observed";
  readonly assuranceKind: "human_recorded";
  readonly observedAt: string;
  readonly sourceRef: string;
  readonly config: unknown;
}

export interface MissingConfigObservationV1 {
  readonly source: "repository_file";
  readonly observationState: "missing";
  readonly assuranceKind: "host_asserted";
  readonly observedAt: string;
  readonly sourceRef: string;
  readonly repositoryRevision: string;
}

export type ConfigObservationV1 =
  | RepositoryConfigObservationV1
  | BootstrapConfigObservationV1
  | MissingConfigObservationV1;

export interface ProposedMissionBriefV1 {
  readonly missionId: string;
  readonly objective: string;
  readonly subjectId: string;
  readonly riskFlags: unknown;
  readonly participantSeatIds: unknown;
  readonly requireSimmons: boolean;
  readonly createdAt: {
    readonly value: string;
    readonly provenance: "hostTrusted" | "humanRecorded";
  };
}

export interface RecommendedModeV1 {
  readonly modeId: "delivery" | "debugger";
  readonly seatId: string;
  readonly reason: string;
  readonly source: "human_requested" | "hill_recommended";
}

export interface MissionIntakeArtifactRefV1 {
  readonly path: string;
  readonly repositoryRevision: string;
  readonly verification: "content_unverified";
}

export interface MissionIntakeArtifactRefsV1 {
  readonly missionBrief: MissionIntakeArtifactRefV1;
  readonly missionCommunication: MissionIntakeArtifactRefV1;
  readonly sharedRuntimeInstructions: MissionIntakeArtifactRefV1;
}

export interface RuntimeObservationV1 {
  readonly seatId: "may" | "daisy";
  readonly status: "human_reported_unverified" | "host_probed";
  readonly observedAt: string;
  readonly runtimeId: string | null;
  readonly evidenceRefs: readonly string[];
}

export interface MissionIntakeRequestV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "mission.intake.v1";
  readonly configObservation: ConfigObservationV1;
  readonly repositoryObservation: RepositoryObservationV1;
  readonly issueObservation: IssueObservationV1;
  readonly proposedBrief: ProposedMissionBriefV1;
  readonly recommendedModes: unknown;
  readonly artifacts: MissionIntakeArtifactRefsV1;
  readonly runtimeObservations: unknown;
}

export interface ParticipantKindV1 {
  readonly seatId: string;
  readonly kind: "dispatchable_seat" | "human_gate";
}

export interface HumanGatePreviewV1 {
  readonly seatId: "coulson" | "fitz" | "simmons";
  readonly status: "pending_non_authoritative_preview";
}

export interface MissionIntakeBlockerV1 {
  readonly code: "REPOSITORY_CONFIG_NOT_OBSERVED";
  readonly path: "configObservation";
}

export interface MissionIntakeCandidateV1 {
  readonly state: "candidate";
  readonly schemaVersion: 1;
  readonly contractVersion: "mission.intake.v1";
  readonly authority: "non_authoritative";
  readonly persistence: "not_persisted";
  readonly repositoryObservation: RepositoryObservationV1;
  readonly issueObservation: IssueObservationV1;
  readonly configObservation: ConfigObservationV1 & { readonly config: ShieldConfig };
  readonly brief: SupervisedMissionBrief;
  readonly risk: RiskAssessment;
  readonly requirements: readonly EvidenceRequirement[];
  readonly recommendedModes: readonly RecommendedModeV1[];
  readonly modeActivationState: "unsupported_after_approval";
  readonly participants: readonly ParticipantKindV1[];
  readonly seatGateEnforcement: "derived_not_schema_enforced";
  readonly artifacts: MissionIntakeArtifactRefsV1;
  readonly communication: {
    readonly missionFile: "file_backed_unverified";
    readonly journal: "journal_not_initialized";
    readonly missionWorkspace: "mission_workspace_not_created";
    readonly external: "communication_not_configured";
  };
  readonly runtimeObservations: readonly RuntimeObservationV1[];
  readonly blockers: readonly MissionIntakeBlockerV1[];
  readonly pendingHumanGates: readonly HumanGatePreviewV1[];
  readonly nextAction: "provision_repository" | "initialize_journal";
}

export interface MissionIntakeBlockedV1 {
  readonly state: "blocked";
  readonly schemaVersion: 1;
  readonly contractVersion: "mission.intake.v1";
  readonly authority: "none";
  readonly persistence: "not_persisted";
  readonly reasonCodes: readonly MissionIntakeReasonCodeV1[];
  readonly fieldPaths: readonly string[];
  readonly nextAction: "repair_intake" | "provision_repository";
}

export type MissionIntakeResultV1 =
  | MissionIntakeCandidateV1
  | MissionIntakeBlockedV1;

type PlainObject = Record<string, unknown>;

function blocked(
  reasonCode: MissionIntakeReasonCodeV1,
  path: string,
  nextAction: MissionIntakeBlockedV1["nextAction"] = "repair_intake",
): MissionIntakeBlockedV1 {
  return {
    state: "blocked",
    schemaVersion: MISSION_INTAKE_SCHEMA_VERSION,
    contractVersion: MISSION_INTAKE_CONTRACT_VERSION,
    authority: "none",
    persistence: "not_persisted",
    reasonCodes: [reasonCode],
    fieldPaths: [path],
    nextAction,
  };
}

function isPlainObject(value: unknown): value is PlainObject {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function clonePlainData(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value !== "object") throw new TypeError("non_plain_data");
  if (utilTypes.isProxy(value)) throw new TypeError("proxy");
  if (seen.has(value)) throw new TypeError("cycle");
  seen.add(value);

  const prototype = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  if (prototype !== (isArray ? Array.prototype : Object.prototype)) {
    throw new TypeError("non_plain_prototype");
  }

  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError("symbol_key");

  if (isArray) {
    const allowed = new Set(["length"]);
    for (let index = 0; index < value.length; index += 1) allowed.add(String(index));
    if (keys.some((key) => !allowed.has(key as string))) throw new TypeError("extra_array_field");
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, "value")
      ) {
        throw new TypeError("sparse_or_accessor_array");
      }
      output.push(clonePlainData(descriptor.value, seen));
    }
    seen.delete(value);
    return output;
  }

  const output: PlainObject = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.hasOwn(descriptor, "value")
    ) {
      throw new TypeError("accessor_or_hidden_field");
    }
    output[key] = clonePlainData(descriptor.value, seen);
  }
  seen.delete(value);
  return output;
}

function exactFields(
  value: unknown,
  fields: readonly string[],
): value is PlainObject {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

function boundedString(
  value: unknown,
  maximum: number,
): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= maximum
    && !CONTROL_CHARACTERS.test(value);
}

function briefIdentifier(value: unknown): value is string {
  return typeof value === "string" && BRIEF_IDENTIFIER.test(value);
}

function isoUtc(value: unknown): value is string {
  return typeof value === "string"
    && ISO_UTC.test(value)
    && Number.isFinite(Date.parse(value));
}

function denseArray(value: unknown, maximum: number): value is unknown[] {
  return Array.isArray(value)
    && Object.getPrototypeOf(value) === Array.prototype
    && value.length <= maximum
    && Reflect.ownKeys(value).every((key) => (
      key === "length"
      || (
        typeof key === "string"
        && /^(?:0|[1-9][0-9]*)$/.test(key)
        && Number(key) < value.length
      )
    ))
    && value.every((_entry, index) => Object.hasOwn(value, index));
}

function artifactPath(value: unknown): value is string {
  if (
    !boundedString(value, MISSION_INTAKE_MAX_ARTIFACT_PATH_LENGTH)
    || value.startsWith("/")
    || value.includes("\\")
    || value.includes("%")
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every((segment) => (
    segment.length > 0 && segment !== "." && segment !== ".."
  ));
}

function validRepositoryObservation(
  value: unknown,
): value is RepositoryObservationV1 {
  if (!exactFields(value, REPOSITORY_FIELDS)) return false;
  return value.assuranceKind === "host_asserted"
    && typeof value.repositoryId === "string"
    && value.repositoryId.length <= MISSION_INTAKE_MAX_REPOSITORY_ID_LENGTH
    && REPOSITORY_ID.test(value.repositoryId)
    && boundedString(value.branch, MISSION_INTAKE_MAX_BRANCH_LENGTH)
    && boundedString(
      value.baseRevision,
      MISSION_INTAKE_MAX_REPOSITORY_REVISION_LENGTH,
    )
    && boundedString(
      value.headRevision,
      MISSION_INTAKE_MAX_REPOSITORY_REVISION_LENGTH,
    )
    && isoUtc(value.observedAt)
    && boundedString(value.sourceRef, MISSION_INTAKE_MAX_SOURCE_REF_LENGTH);
}

function validIssueObservation(value: unknown): value is IssueObservationV1 {
  if (!exactFields(value, ISSUE_FIELDS)) return false;
  return value.assuranceKind === "host_asserted"
    && briefIdentifier(value.issueId)
    && briefIdentifier(value.issueRevisionId)
    && isoUtc(value.observedAt)
    && boundedString(value.sourceRef, MISSION_INTAKE_MAX_SOURCE_REF_LENGTH);
}

function validConfigObservationShape(
  value: unknown,
): value is ConfigObservationV1 {
  if (!isPlainObject(value)) return false;
  if (
    value.source === "repository_file"
    && value.observationState === "observed"
  ) {
    return exactFields(value, CONFIG_OBSERVED_FIELDS)
      && value.assuranceKind === "host_asserted"
      && isoUtc(value.observedAt)
      && boundedString(value.sourceRef, MISSION_INTAKE_MAX_SOURCE_REF_LENGTH)
      && boundedString(
        value.repositoryRevision,
        MISSION_INTAKE_MAX_REPOSITORY_REVISION_LENGTH,
      );
  }
  if (
    value.source === "repository_file"
    && value.observationState === "missing"
  ) {
    return exactFields(value, CONFIG_MISSING_FIELDS)
      && value.assuranceKind === "host_asserted"
      && isoUtc(value.observedAt)
      && boundedString(value.sourceRef, MISSION_INTAKE_MAX_SOURCE_REF_LENGTH)
      && boundedString(
        value.repositoryRevision,
        MISSION_INTAKE_MAX_REPOSITORY_REVISION_LENGTH,
      );
  }
  if (
    value.source === "bootstrap_input"
    && value.observationState === "provided_not_repository_observed"
  ) {
    return exactFields(value, CONFIG_BOOTSTRAP_FIELDS)
      && value.assuranceKind === "human_recorded"
      && isoUtc(value.observedAt)
      && boundedString(value.sourceRef, MISSION_INTAKE_MAX_SOURCE_REF_LENGTH);
  }
  return false;
}

function validArtifact(
  value: unknown,
  headRevision: string,
): value is MissionIntakeArtifactRefV1 {
  return exactFields(value, ARTIFACT_FIELDS)
    && artifactPath(value.path)
    && value.repositoryRevision === headRevision
    && value.verification === "content_unverified";
}

function normalizeRecommendations(
  value: unknown,
  config: ShieldConfig,
  participantSeatIds: readonly string[],
): readonly RecommendedModeV1[] | null {
  if (!denseArray(value, MISSION_INTAKE_MAX_MODE_RECOMMENDATIONS)) return null;
  const participants = new Set(participantSeatIds);
  const recommendations: RecommendedModeV1[] = [];
  for (const entry of value) {
    if (
      !exactFields(entry, RECOMMENDATION_FIELDS)
      || !SUPPORTED_MODES.has(String(entry.modeId))
      || !config.supportedModeIds.includes(entry.modeId as never)
      || !briefIdentifier(entry.seatId)
      || !participants.has(entry.seatId)
      || !SUPPORTED_SEATS.has(entry.seatId)
      || !boundedString(
        entry.reason,
        MISSION_INTAKE_MAX_RECOMMENDATION_REASON_LENGTH,
      )
      || (
        entry.source !== "human_requested"
        && entry.source !== "hill_recommended"
      )
    ) {
      return null;
    }
    recommendations.push(entry as unknown as RecommendedModeV1);
  }
  return recommendations;
}

function normalizeRuntimeObservations(
  value: unknown,
): readonly RuntimeObservationV1[] | null {
  if (!denseArray(value, MISSION_INTAKE_MAX_RUNTIME_OBSERVATIONS)) return null;
  const observations: RuntimeObservationV1[] = [];
  let totalEvidenceRefs = 0;
  for (const entry of value) {
    if (
      !exactFields(entry, RUNTIME_OBSERVATION_FIELDS)
      || (entry.seatId !== "may" && entry.seatId !== "daisy")
      || (
        entry.status !== "human_reported_unverified"
        && entry.status !== "host_probed"
      )
      || !isoUtc(entry.observedAt)
      || (
        entry.runtimeId !== null
        && !boundedString(
          entry.runtimeId,
          MISSION_INTAKE_MAX_RUNTIME_ID_LENGTH,
        )
      )
      || !denseArray(
        entry.evidenceRefs,
        MISSION_INTAKE_MAX_EVIDENCE_REFS_PER_OBSERVATION,
      )
      || !entry.evidenceRefs.every((reference) => (
        boundedString(reference, MISSION_INTAKE_MAX_SOURCE_REF_LENGTH)
      ))
    ) {
      return null;
    }
    totalEvidenceRefs += entry.evidenceRefs.length;
    if (totalEvidenceRefs > MISSION_INTAKE_MAX_TOTAL_EVIDENCE_REFS) return null;
    observations.push(entry as unknown as RuntimeObservationV1);
  }
  return observations;
}

function normalizeParticipantSeatIds(
  value: unknown,
): readonly string[] | null {
  if (
    !denseArray(value, MISSION_INTAKE_MAX_PARTICIPANTS)
    || value.length === 0
  ) {
    return null;
  }
  const seats: string[] = [];
  const seen = new Set<string>();
  for (const seat of value) {
    if (
      !briefIdentifier(seat)
      || !SUPPORTED_SEATS.has(seat)
      || seen.has(seat)
    ) {
      return null;
    }
    seen.add(seat);
    seats.push(seat);
  }
  return seats;
}

export function missionIntakeV1(input: unknown): MissionIntakeResultV1 {
  let normalized: unknown;
  try {
    normalized = clonePlainData(input);
  } catch {
    return blocked("INVALID_REQUEST", "$");
  }

  if (
    !exactFields(normalized, ROOT_FIELDS)
    || normalized.schemaVersion !== MISSION_INTAKE_SCHEMA_VERSION
    || normalized.contractVersion !== MISSION_INTAKE_CONTRACT_VERSION
  ) {
    return blocked("INVALID_REQUEST", "$");
  }

  if (!validRepositoryObservation(normalized.repositoryObservation)) {
    return blocked(
      "INVALID_REPOSITORY_OBSERVATION",
      "repositoryObservation",
    );
  }
  const repositoryObservation = normalized.repositoryObservation;

  if (!validIssueObservation(normalized.issueObservation)) {
    return blocked("INVALID_ISSUE_OBSERVATION", "issueObservation");
  }
  const issueObservation = normalized.issueObservation;

  if (!validConfigObservationShape(normalized.configObservation)) {
    return blocked("INVALID_CONFIG", "configObservation");
  }
  const configObservation = normalized.configObservation;
  if (
    configObservation.source === "repository_file"
    && configObservation.repositoryRevision !== repositoryObservation.headRevision
  ) {
    return blocked(
      "REPOSITORY_BINDING_MISMATCH",
      "configObservation.repositoryRevision",
    );
  }
  if (configObservation.observationState === "missing") {
    return blocked(
      "REPOSITORY_CONFIG_NOT_OBSERVED",
      "configObservation",
      "provision_repository",
    );
  }

  const configResult = validateShieldConfig(configObservation.config);
  if (configResult.state !== "valid") {
    return blocked("INVALID_CONFIG", "configObservation.config");
  }
  const config = configResult.value;
  if (config.repositoryId !== repositoryObservation.repositoryId) {
    return blocked(
      "REPOSITORY_BINDING_MISMATCH",
      "configObservation.config.repositoryId",
    );
  }

  if (!exactFields(normalized.proposedBrief, BRIEF_FIELDS)) {
    return blocked("INVALID_BRIEF_INPUT", "proposedBrief");
  }
  const proposedBrief = normalized.proposedBrief;
  if (
    !briefIdentifier(proposedBrief.missionId)
    || !boundedString(
      proposedBrief.objective,
      MISSION_INTAKE_MAX_OBJECTIVE_LENGTH,
    )
    || !briefIdentifier(proposedBrief.subjectId)
    || proposedBrief.subjectId !== issueObservation.issueId
    || typeof proposedBrief.requireSimmons !== "boolean"
    || !exactFields(proposedBrief.createdAt, TIMESTAMP_FIELDS)
    || !isoUtc(proposedBrief.createdAt.value)
    || (
      proposedBrief.createdAt.provenance !== "hostTrusted"
      && proposedBrief.createdAt.provenance !== "humanRecorded"
    )
  ) {
    return blocked("INVALID_BRIEF_INPUT", "proposedBrief");
  }

  const participantSeatIds = normalizeParticipantSeatIds(
    proposedBrief.participantSeatIds,
  );
  if (participantSeatIds === null) {
    return blocked(
      "UNSUPPORTED_PARTICIPANT",
      "proposedBrief.participantSeatIds",
    );
  }
  if (
    !participantSeatIds.includes("coulson")
    || !participantSeatIds.includes("fitz")
  ) {
    return blocked(
      "HUMAN_GATE_MISSING",
      "proposedBrief.participantSeatIds",
    );
  }
  if (
    proposedBrief.requireSimmons
    !== participantSeatIds.includes("simmons")
  ) {
    return blocked(
      "SIMMONS_PARTICIPATION_MISMATCH",
      "proposedBrief.participantSeatIds",
    );
  }

  let brief: SupervisedMissionBrief;
  try {
    brief = createSupervisedMissionBrief({
      schemaVersion: 1,
      missionId: proposedBrief.missionId,
      objective: proposedBrief.objective,
      subjectId: proposedBrief.subjectId,
      riskFlags: proposedBrief.riskFlags as MissionRiskFlags,
      participants: participantSeatIds.map((seatId) => ({ seatId })),
      activatedModes: [],
      requireSimmons: proposedBrief.requireSimmons,
      createdAt: proposedBrief.createdAt as unknown as EvidenceTimestamp,
    });
  } catch {
    return blocked("BRIEF_CONSTRUCTION_FAILED", "proposedBrief");
  }
  const briefResult = validateSupervisedMissionBrief(brief);
  if (briefResult.state !== "valid") {
    return blocked("INVALID_BRIEF_INPUT", "proposedBrief");
  }
  brief = briefResult.value;

  const recommendations = normalizeRecommendations(
    normalized.recommendedModes,
    config,
    participantSeatIds,
  );
  if (recommendations === null) {
    return blocked("INVALID_MODE_RECOMMENDATION", "recommendedModes");
  }

  if (!exactFields(normalized.artifacts, ARTIFACTS_FIELDS)) {
    return blocked("INVALID_ARTIFACT_REFERENCE", "artifacts");
  }
  const artifacts = normalized.artifacts;
  for (const field of ARTIFACTS_FIELDS) {
    if (!validArtifact(artifacts[field], repositoryObservation.headRevision)) {
      return blocked("INVALID_ARTIFACT_REFERENCE", `artifacts.${field}`);
    }
  }

  const runtimeObservations = normalizeRuntimeObservations(
    normalized.runtimeObservations,
  );
  if (runtimeObservations === null) {
    return blocked("INVALID_RUNTIME_OBSERVATION", "runtimeObservations");
  }

  const participants = participantSeatIds.map((seatId): ParticipantKindV1 => ({
    seatId,
    kind: HUMAN_SEATS.has(seatId) ? "human_gate" : "dispatchable_seat",
  }));
  const pendingHumanGates = participants
    .filter((participant) => participant.kind === "human_gate")
    .map((participant): HumanGatePreviewV1 => ({
      seatId: participant.seatId as HumanGatePreviewV1["seatId"],
      status: "pending_non_authoritative_preview",
    }));
  const bootstrap = configObservation.source === "bootstrap_input";

  return {
    state: "candidate",
    schemaVersion: MISSION_INTAKE_SCHEMA_VERSION,
    contractVersion: MISSION_INTAKE_CONTRACT_VERSION,
    authority: "non_authoritative",
    persistence: "not_persisted",
    repositoryObservation,
    issueObservation,
    configObservation: { ...configObservation, config },
    brief,
    risk: classifyMissionRisk(brief.riskFlags),
    requirements: createEvidenceRequirements(brief),
    recommendedModes: recommendations,
    modeActivationState: "unsupported_after_approval",
    participants,
    seatGateEnforcement: "derived_not_schema_enforced",
    artifacts: artifacts as unknown as MissionIntakeArtifactRefsV1,
    communication: {
      missionFile: "file_backed_unverified",
      journal: "journal_not_initialized",
      missionWorkspace: "mission_workspace_not_created",
      external: "communication_not_configured",
    },
    runtimeObservations,
    blockers: bootstrap
      ? [{
        code: "REPOSITORY_CONFIG_NOT_OBSERVED",
        path: "configObservation",
      }]
      : [],
    pendingHumanGates,
    nextAction: bootstrap ? "provision_repository" : "initialize_journal",
  };
}
