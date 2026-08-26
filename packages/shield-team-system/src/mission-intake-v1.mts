import { types as utilTypes } from "node:util";
import { createHash } from "node:crypto";
import {
  SUPPORTED_MODE_IDS,
  validateShieldConfig,
  type ShieldConfig,
} from "./config.mjs";
import {
  CANONICAL_ROLE_IDS,
  routingProjection,
  validateRoleAssignment,
} from "./role-taxonomy-v1.mjs";
import {
  createEvidenceRequirements,
  createSupervisedMissionBrief,
  validateSupervisedMissionBrief,
  canonicalJson,
  type EvidenceRequirement,
  type EvidenceTimestamp,
  type MissionRiskFlags,
  type SupervisedMissionBrief,
} from "./mission-v2.mjs";
import { getMissionProfileV1, type MissionProfileId } from "./mission-profile-v1.mjs";
import {
  classifyMissionRisk,
  type RiskAssessment,
} from "../public/mission.mjs";
import {
  createIssueIntakeMissionBegunEntryV1,
  createProfileAwareMissionBrief,
  profileAwareMissionIntakeV1,
  validateIssueIntakeSourceBindingV1,
  type IssueIntakeSourceBindingV1,
  type ProfileAwareMissionBriefContentV1,
  type ProfileAwareMissionBriefV1,
  type ProfileAwareMissionEntryV1,
} from "./profile-aware-mission-v1.mjs";
export { profileAwareMissionIntakeV1 } from "./profile-aware-mission-v1.mjs";
export * from "./profile-aware-mission-v1.mjs";

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
export const MISSION_INTAKE_MAX_PARTICIPANTS = CANONICAL_ROLE_IDS.length;
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
const SUPPORTED_MODES = new Set<string>(SUPPORTED_MODE_IDS);
const CANONICAL_ROLE_ID_SET = new Set<string>(CANONICAL_ROLE_IDS);

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

/**
 * The standing break-glass rail is admitted only for the exact, already
 * authorized issue-intake shape.  This predicate is deliberately narrower
 * than the general profile-aware mission validator: it is a routing guard,
 * not an authority producer.
 */
export function isStandingManualBreakGlassImplementationReadyV1(input: unknown): boolean {
  if (!isPlainObject(input)) return false;
  const projection = input as Record<string, unknown>;
  return projection.schemaVersion === 9 &&
    projection.authorization === "authorized" &&
    projection.implementationAuthorityState === "waiting" &&
    projection.implementationAuthority === null &&
    projection.execution === "not-started" &&
    projection.finalAcceptance === "waiting" &&
    Array.isArray(projection.runtimeBindings) && projection.runtimeBindings.length === 0 &&
    Array.isArray(projection.activeRuntimeBindings) && projection.activeRuntimeBindings.length === 0 &&
    Array.isArray(projection.publicationAuthorizations) && projection.publicationAuthorizations.length === 0 &&
    Array.isArray(projection.effects) && projection.effects.length === 0;
}

export const ISSUE_OBSERVATION_DIAGNOSTIC_SCHEMA_VERSION = 1 as const;
export const ISSUE_OBSERVATION_DIAGNOSTIC_CONTRACT_VERSION = "mission.issue-observation-diagnostic.v1" as const;

export type IssueObservationDiagnosticEventV1 = Readonly<{
  stage: "direct_observation" | "wrapper_observation" | "consistency_observation" | "error_mapping";
  callOrder: "direct:1" | "wrapper:2" | "consistency:3" | "error_mapping:2" | "error_mapping:3" | "error_mapping:4";
  adapter: "github" | "gh_cli";
  executable: "repository_adapter" | "gh_issue_view";
  cwd: "approved_root";
  timeout: "default" | "bounded";
  outcome: "success" | "network_failed" | "auth_failed" | "wrapper_failed" | "consistency_failed" | "wrapper_failure_after_direct_success";
}>;

export type IssueObservationDiagnosticSequenceResultV1 =
  | { readonly state: "valid"; readonly schemaVersion: 1; readonly contractVersion: typeof ISSUE_OBSERVATION_DIAGNOSTIC_CONTRACT_VERSION; readonly events: readonly IssueObservationDiagnosticEventV1[] }
  | { readonly state: "invalid"; readonly code: "invalid_issue_observation_diagnostic" };

const ISSUE_OBSERVATION_DIAGNOSTIC_EVENT_FIELDS = ["stage", "callOrder", "adapter", "executable", "cwd", "timeout", "outcome"] as const;
const ISSUE_OBSERVATION_DIAGNOSTIC_SEQUENCES: readonly (readonly Pick<IssueObservationDiagnosticEventV1, "stage" | "callOrder" | "outcome">[])[] = [
  [{ stage: "direct_observation", callOrder: "direct:1", outcome: "success" }, { stage: "wrapper_observation", callOrder: "wrapper:2", outcome: "success" }],
  [{ stage: "direct_observation", callOrder: "direct:1", outcome: "success" }, { stage: "wrapper_observation", callOrder: "wrapper:2", outcome: "wrapper_failed" }, { stage: "error_mapping", callOrder: "error_mapping:3", outcome: "wrapper_failure_after_direct_success" }],
  [{ stage: "direct_observation", callOrder: "direct:1", outcome: "success" }, { stage: "wrapper_observation", callOrder: "wrapper:2", outcome: "success" }, { stage: "consistency_observation", callOrder: "consistency:3", outcome: "success" }],
  [{ stage: "direct_observation", callOrder: "direct:1", outcome: "network_failed" }, { stage: "error_mapping", callOrder: "error_mapping:2", outcome: "network_failed" }],
  [{ stage: "direct_observation", callOrder: "direct:1", outcome: "auth_failed" }, { stage: "error_mapping", callOrder: "error_mapping:2", outcome: "auth_failed" }],
  [{ stage: "direct_observation", callOrder: "direct:1", outcome: "success" }, { stage: "wrapper_observation", callOrder: "wrapper:2", outcome: "success" }, { stage: "consistency_observation", callOrder: "consistency:3", outcome: "consistency_failed" }, { stage: "error_mapping", callOrder: "error_mapping:4", outcome: "consistency_failed" }],
];

function exactDiagnosticEvent(value: unknown): value is IssueObservationDiagnosticEventV1 {
  if (!isPlainObject(value) || Reflect.ownKeys(value).length !== ISSUE_OBSERVATION_DIAGNOSTIC_EVENT_FIELDS.length ||
      ISSUE_OBSERVATION_DIAGNOSTIC_EVENT_FIELDS.some((field) => !Object.hasOwn(value, field))) return false;
  return value.stage === "direct_observation" || value.stage === "wrapper_observation" || value.stage === "consistency_observation" || value.stage === "error_mapping"
    ? (value.callOrder === "direct:1" || value.callOrder === "wrapper:2" || value.callOrder === "consistency:3" || value.callOrder === "error_mapping:2" || value.callOrder === "error_mapping:3" || value.callOrder === "error_mapping:4") &&
      (value.adapter === "github" || value.adapter === "gh_cli") && (value.executable === "repository_adapter" || value.executable === "gh_issue_view") && value.cwd === "approved_root" &&
      (value.timeout === "default" || value.timeout === "bounded") && (value.outcome === "success" || value.outcome === "network_failed" || value.outcome === "auth_failed" || value.outcome === "wrapper_failed" || value.outcome === "consistency_failed" || value.outcome === "wrapper_failure_after_direct_success")
    : false;
}

export function validateIssueObservationDiagnosticSequenceV1(input: unknown): IssueObservationDiagnosticSequenceResultV1 {
  if (!isPlainObject(input) || Reflect.ownKeys(input).length !== 3 || input.schemaVersion !== ISSUE_OBSERVATION_DIAGNOSTIC_SCHEMA_VERSION ||
      input.contractVersion !== ISSUE_OBSERVATION_DIAGNOSTIC_CONTRACT_VERSION || !Object.hasOwn(input, "events") || !Array.isArray(input.events) ||
      input.events.length < 2 || input.events.length > 4 || input.events.some((event) => !exactDiagnosticEvent(event))) {
    return { state: "invalid", code: "invalid_issue_observation_diagnostic" };
  }
  const events = input.events as IssueObservationDiagnosticEventV1[];
  const matches = ISSUE_OBSERVATION_DIAGNOSTIC_SEQUENCES.some((sequence) => sequence.length === events.length && sequence.every((expected, index) => {
    const actual = events[index];
    return actual.stage === expected.stage && actual.callOrder === expected.callOrder && actual.outcome === expected.outcome;
  }));
  if (!matches) return { state: "invalid", code: "invalid_issue_observation_diagnostic" };
  return { state: "valid", schemaVersion: ISSUE_OBSERVATION_DIAGNOSTIC_SCHEMA_VERSION, contractVersion: ISSUE_OBSERVATION_DIAGNOSTIC_CONTRACT_VERSION, events: Object.freeze(events.map((event) => Object.freeze({ ...event }))) };
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
  participants: readonly ParticipantKindV1[],
): readonly RecommendedModeV1[] | null {
  if (!denseArray(value, MISSION_INTAKE_MAX_MODE_RECOMMENDATIONS)) return null;
  const participantSeatIds = new Set(participants.map(({ seatId }) => seatId));
  const recommendations: RecommendedModeV1[] = [];
  for (const entry of value) {
    if (!exactFields(entry, RECOMMENDATION_FIELDS)) return null;
    const candidate = entry as Record<string, unknown>;
    const assignment = validateRoleAssignment(
      candidate.seatId,
      "dispatch",
      { requireV03Enabled: true },
    );
    if (
      !SUPPORTED_MODES.has(String(candidate.modeId))
      || !config.supportedModeIds.includes(candidate.modeId as never)
      || !briefIdentifier(candidate.seatId)
      || !CANONICAL_ROLE_ID_SET.has(String(candidate.seatId))
      || !participantSeatIds.has(candidate.seatId as string)
      || assignment.state === "invalid"
      || !boundedString(
        candidate.reason,
        MISSION_INTAKE_MAX_RECOMMENDATION_REASON_LENGTH,
      )
      || (
        candidate.source !== "human_requested"
        && candidate.source !== "hill_recommended"
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
): readonly ParticipantKindV1[] | null {
  if (
    !denseArray(value, MISSION_INTAKE_MAX_PARTICIPANTS)
    || value.length === 0
  ) {
    return null;
  }
  const participants: ParticipantKindV1[] = [];
  const seen = new Set<string>();
  for (const seat of value as readonly unknown[]) {
    if (typeof seat !== "string") return null;
    if (!CANONICAL_ROLE_ID_SET.has(seat)) return null;
    const projected = routingProjection(seat);
    if (
      projected.state === "invalid"
      || seen.has(seat)
      || (projected.value.route === "dispatch_seat" && !projected.value.role.v03Enabled)
    ) {
      return null;
    }
    seen.add(seat);
    participants.push({
      seatId: projected.value.roleId,
      kind: projected.value.route === "wait_for_human_gate" ? "human_gate" : "dispatchable_seat",
    });
  }
  return participants;
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

  const participants = normalizeParticipantSeatIds(
    proposedBrief.participantSeatIds,
  );
  if (participants === null) {
    return blocked(
      "UNSUPPORTED_PARTICIPANT",
      "proposedBrief.participantSeatIds",
    );
  }
  const participantSeatIds = participants.map(({ seatId }) => seatId);
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
    participants,
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

export const ISSUE_INTAKE_COMPILER_SCHEMA_VERSION = 1 as const;
export const ISSUE_INTAKE_COMPILER_CONTRACT_VERSION = "mission.issue-intake-compiler.v1" as const;
export const ISSUE_INTAKE_MISSION_ID_DOMAIN = "shield.mission.issue-intake.v1" as const;
export const ISSUE_INTAKE_MAX_CRITERIA_ITEMS = 64 as const;
export const ISSUE_INTAKE_MAX_CRITERION_LENGTH = 512 as const;

export interface IssueIntakeAcceptanceCriteriaV1 {
  readonly items: readonly string[];
  readonly digest?: string;
}

export interface IssueIntakeObservationV1 {
  readonly hostRepositoryId: string;
  readonly repositoryNameWithOwner: string;
  readonly hostIssueId: string;
  readonly issueNumber: number;
  readonly issueUrl: string;
  readonly title: string;
  readonly body: string;
  readonly state: "OPEN";
  readonly labels: readonly string[];
  readonly updatedAt: string;
  readonly issueRevisionId: string;
  readonly acceptanceCriteria?: IssueIntakeAcceptanceCriteriaV1;
}

export interface IssueIntakeCompilerInputV1 {
  readonly repositoryId: string;
  readonly issueObservation: IssueIntakeObservationV1;
  readonly acceptanceCriteria?: IssueIntakeAcceptanceCriteriaV1;
  readonly profileId: MissionProfileId;
  readonly branch: string;
  readonly headRevision: string;
  readonly preparedWorktreeReceipt?: { readonly receiptDigest: string };
  readonly preparedWorktreeReceiptDigest?: string;
  readonly configBytes: string | Uint8Array;
  readonly trustedBindingRegistryBytes: string | Uint8Array;
  readonly trustedBindings: import("./mission-v2.mjs").TrustedHumanBinding[];
}

export interface IssueIntakeCompiledMissionV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof ISSUE_INTAKE_COMPILER_CONTRACT_VERSION;
  readonly brief: ProfileAwareMissionBriefV1;
  readonly sourceBinding: IssueIntakeSourceBindingV1;
  readonly entry: ProfileAwareMissionEntryV1;
}

export type IssueIntakeCompilerResultV1 =
  | { readonly state: "valid"; readonly value: IssueIntakeCompiledMissionV1 }
  | { readonly state: "invalid"; readonly code: string; readonly errors: readonly string[] };

const ISSUE_HOST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const ISSUE_REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
const ISSUE_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*$/u;
const ISSUE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const GIT_HEAD = /^[0-9a-f]{40,64}$/u;
const BYTE_DIGEST = /^(?:sha256:)?[a-f0-9]{64}$/u;

function issueCompilerInvalid(code: string, message: string): IssueIntakeCompilerResultV1 {
  return { state: "invalid", code, errors: [message] };
}

function issueBytes(value: unknown): Uint8Array | null {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array && Object.getPrototypeOf(value) === Uint8Array.prototype) return new Uint8Array(value);
  return null;
}

function byteDigest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function computeIssueIntakeMissionIdV1(repositoryHostId: string, issueHostId: string): string {
  return `mission:issue-intake:${createHash("sha256").update(canonicalJson([ISSUE_INTAKE_MISSION_ID_DOMAIN, repositoryHostId, issueHostId])).digest("base64url")}`;
}

export function computeIssueAcceptanceCriteriaDigestV1(items: readonly string[]): string {
  return `sha256:${createHash("sha256").update(canonicalJson({ schemaVersion: 1, items })).digest("hex")}`;
}

function normalizedIssueCriteria(input: unknown, observation: Record<string, unknown>): readonly string[] | null {
  const candidate = input ?? observation.acceptanceCriteria ?? observation.criteria;
  const items = Array.isArray(candidate) ? candidate : isPlainObject(candidate) ? candidate.items : null;
  if (!Array.isArray(items) || items.length === 0 || items.length > ISSUE_INTAKE_MAX_CRITERIA_ITEMS) return null;
  const normalized = items.map((item) => typeof item === "string" ? item.replace(/\r\n?/gu, "\n").trim() : null);
  if (normalized.some((item) => item === null || item.length === 0 || item.length > ISSUE_INTAKE_MAX_CRITERION_LENGTH || CONTROL_CHARACTERS.test(item))) return null;
  return normalized as string[];
}

function observationField(value: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) if (Object.hasOwn(value, name)) return value[name];
  return undefined;
}

export function compileIssueIntakeV1(input: unknown): IssueIntakeCompilerResultV1 {
  if (!isPlainObject(input) || !isPlainObject(input.issueObservation)) return issueCompilerInvalid("invalid_input", "Issue-intake compiler input is not a plain closed request.");
  const observation = input.issueObservation as Record<string, unknown>;
  const repositoryId = typeof input.repositoryId === "string" ? input.repositoryId : isPlainObject(input.repositoryObservation) && typeof input.repositoryObservation.repositoryId === "string" ? input.repositoryObservation.repositoryId : null;
  const hostRepositoryId = observationField(observation, "hostRepositoryId", "repositoryHostId");
  const repositoryNameWithOwner = observationField(observation, "repositoryNameWithOwner", "nameWithOwner");
  const hostIssueId = observationField(observation, "hostIssueId", "issueHostId");
  const issueNumber = observationField(observation, "issueNumber", "number");
  const issueNumberValue = typeof issueNumber === "number" ? issueNumber : null;
  const issueUrl = observationField(observation, "issueUrl", "url");
  const title = observation.title;
  const updatedAt = observation.updatedAt;
  const issueRevisionId = observation.issueRevisionId;
  if (repositoryId === null || !ISSUE_REPOSITORY.test(repositoryId) || typeof hostRepositoryId !== "string" || !ISSUE_HOST_ID.test(hostRepositoryId) || typeof repositoryNameWithOwner !== "string" || !ISSUE_REPOSITORY.test(repositoryNameWithOwner) || repositoryNameWithOwner !== repositoryId || typeof hostIssueId !== "string" || !ISSUE_HOST_ID.test(hostIssueId) || issueNumberValue === null || !Number.isSafeInteger(issueNumberValue) || issueNumberValue < 1 || typeof issueUrl !== "string" || !ISSUE_URL.test(issueUrl) || typeof title !== "string" || title.trim().length === 0 || title.length > MISSION_INTAKE_MAX_OBJECTIVE_LENGTH || CONTROL_CHARACTERS.test(title) || typeof updatedAt !== "string" || !isoUtc(updatedAt) || typeof issueRevisionId !== "string" || !ISSUE_REVISION.test(issueRevisionId)) {
    return issueCompilerInvalid("invalid_observation", "Issue-intake observation is malformed or not repository-bound.");
  }
  let profile: MissionProfileId;
  try {
    if (typeof input.profileId !== "string") throw new Error();
    profile = getMissionProfileV1(input.profileId as MissionProfileId).profileId;
  } catch {
    return issueCompilerInvalid("invalid_profile", "Issue-intake compiler requires an explicit supported profile.");
  }
  const branch = typeof input.branch === "string" ? input.branch : isPlainObject(input.repositoryObservation) && typeof input.repositoryObservation.branch === "string" ? input.repositoryObservation.branch : null;
  const headRevision = typeof input.headRevision === "string" ? input.headRevision : isPlainObject(input.repositoryObservation) && typeof input.repositoryObservation.headRevision === "string" ? input.repositoryObservation.headRevision : null;
  if (branch === null || branch.length === 0 || branch.length > MISSION_INTAKE_MAX_BRANCH_LENGTH || CONTROL_CHARACTERS.test(branch) || headRevision === null || !GIT_HEAD.test(headRevision)) return issueCompilerInvalid("invalid_repository", "Issue-intake branch or exact HEAD is malformed.");
  const preparedWorktreeReceiptDigest = typeof input.preparedWorktreeReceiptDigest === "string" ? input.preparedWorktreeReceiptDigest : isPlainObject(input.preparedWorktreeReceipt) && typeof input.preparedWorktreeReceipt.receiptDigest === "string" ? input.preparedWorktreeReceipt.receiptDigest : null;
  if (preparedWorktreeReceiptDigest === null || !BYTE_DIGEST.test(preparedWorktreeReceiptDigest)) return issueCompilerInvalid("invalid_prepared_worktree", "Prepared-worktree receipt digest is missing or malformed.");
  const configBytes = issueBytes(input.configBytes);
  const registryBytes = issueBytes(input.trustedBindingRegistryBytes);
  if (configBytes === null || registryBytes === null) return issueCompilerInvalid("invalid_policy_bytes", "Exact config and trusted-binding-registry bytes are required.");
  if (!Array.isArray(input.trustedBindings)) return issueCompilerInvalid("invalid_bindings", "Trusted bindings used for admission are required.");
  const criteria = normalizedIssueCriteria(input.acceptanceCriteria, observation);
  if (criteria === null) return issueCompilerInvalid("invalid_acceptance_criteria", "Exactly one bounded non-empty acceptance-criteria sequence is required.");
  const criteriaDigest = computeIssueAcceptanceCriteriaDigestV1(criteria);
  const suppliedCriteria = input.acceptanceCriteria ?? observation.acceptanceCriteria;
  if (isPlainObject(suppliedCriteria) && suppliedCriteria.digest !== undefined && suppliedCriteria.digest !== criteriaDigest) return issueCompilerInvalid("invalid_acceptance_criteria", "Acceptance-criteria digest does not match canonical criteria.");
  const missionId = computeIssueIntakeMissionIdV1(hostRepositoryId, hostIssueId);
  const expectedRequireSimmons = profile === "product_sensitive";
  const briefContent: ProfileAwareMissionBriefContentV1 = {
    schemaVersion: 2,
    missionId,
    objective: title,
    subjectId: `github:${repositoryNameWithOwner}/issue/${issueNumberValue}`,
    riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: true },
    participants: ["hill", "fury", "may", ...getMissionProfileV1(profile).requiredExecutionGateRoleIds.filter((role) => role !== "coulson"), "coulson"].filter((seatId, index, seats) => seats.indexOf(seatId) === index).sort((left, right) => CANONICAL_ROLE_IDS.indexOf(left as never) - CANONICAL_ROLE_IDS.indexOf(right as never)).map((seatId) => ({ seatId })),
    activatedModes: [{ modeId: "delivery", modeVersion: "1.0.0", seatId: "hill", activationSource: "issue-intake" }],
    requireSimmons: expectedRequireSimmons,
    createdAt: { value: updatedAt, provenance: "hostTrusted" },
    profileId: profile,
    profileVersion: 1,
    requiredExecutionGateRoleIds: [...getMissionProfileV1(profile).requiredExecutionGateRoleIds],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: "sha256:7f1f8c50a703cf43e1c477d88446473c5d1d755b99a4ad35a2b6662558ded7b9",
  };
  let brief: ProfileAwareMissionBriefV1;
  try { brief = createProfileAwareMissionBrief(briefContent); } catch (error) { return issueCompilerInvalid("brief_invalid", error instanceof Error ? error.message : "Compiled profile-aware brief is invalid."); }
  const sourceBinding: IssueIntakeSourceBindingV1 = {
    schemaVersion: 1,
    contractVersion: "mission.issue-intake-source-binding.v1",
    repositoryId,
    hostRepositoryId,
    repositoryNameWithOwner,
    hostIssueId,
    issueNumber: issueNumberValue,
    issueUrl,
    issueRevisionId,
    updatedAt,
    criteriaDigest,
    profileId: profile,
    profileVersion: 1,
    branch,
    headRevision,
    preparedWorktreeReceiptDigest,
    configBytesDigest: byteDigest(configBytes),
    trustedBindingRegistryBytesDigest: byteDigest(registryBytes),
    briefRevisionId: brief.revisionId,
  };
  const sourceCheck = validateIssueIntakeSourceBindingV1(sourceBinding, brief);
  if (sourceCheck.state === "invalid") return issueCompilerInvalid("binding_invalid", sourceCheck.errors.join(" "));
  const intake = profileAwareMissionIntakeV1({ brief: briefContent, trustedBindings: input.trustedBindings as import("./mission-v2.mjs").TrustedHumanBinding[], issueIntakeSourceBinding: sourceBinding });
  if (intake.state === "invalid") return issueCompilerInvalid(intake.code, intake.errors.join(" "));
  const entry = createIssueIntakeMissionBegunEntryV1({ brief: intake.value.brief, trustedBindings: input.trustedBindings as import("./mission-v2.mjs").TrustedHumanBinding[], issueIntakeSourceBinding: sourceBinding });
  return { state: "valid", value: { schemaVersion: ISSUE_INTAKE_COMPILER_SCHEMA_VERSION, contractVersion: ISSUE_INTAKE_COMPILER_CONTRACT_VERSION, brief: intake.value.brief, sourceBinding, entry } };
}

export const compileIssueToProfileAwareMissionV1 = compileIssueIntakeV1;
export const compileIssueToProfileAwareBriefV1 = compileIssueIntakeV1;
