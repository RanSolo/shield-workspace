import { createHash } from "node:crypto";

export const MISSION_PROFILE_SCHEMA_VERSION = 1 as const;
export const MISSION_PROFILE_CONTRACT_VERSION = "mission.profile.v1" as const;
export const MISSION_PROFILE_IDS = ["standard", "high_assurance", "product_sensitive"] as const;
export const MISSION_ROLE_IDS = ["coulson", "fitz", "simmons"] as const;

export type MissionProfileId = (typeof MISSION_PROFILE_IDS)[number];
export type MissionRoleId = (typeof MISSION_ROLE_IDS)[number];

export interface MissionRoleDefinitionV1 {
  readonly roleId: MissionRoleId;
  /** Existing seatId retained as a compatibility name. */
  readonly seatId: MissionRoleId;
  readonly kind: "human_authority";
  readonly identityVerification: "surface_specific_verified";
}

export interface MissionProfileV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "mission.profile.v1";
  readonly profileId: MissionProfileId;
  readonly version: 1;
  readonly authorizationRoleId: "coulson";
  readonly finalAcceptanceRoleId: "coulson";
  readonly requiredExecutionGateRoleIds: readonly MissionRoleId[];
  readonly requiredFinalAcceptanceGateRoleIds: readonly ["coulson"];
}

export interface FrozenMissionRequirementsV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "mission.profile.v1";
  readonly missionId: string;
  readonly missionRevisionId: string;
  readonly profile: MissionProfileV1;
  readonly profileDigest: string;
  readonly authorization: { readonly requiredRoleId: "coulson"; readonly status: "required" };
  readonly executionGates: readonly { readonly requiredRoleId: MissionRoleId; readonly status: "required" }[];
  readonly finalAcceptance: { readonly requiredRoleId: "coulson"; readonly status: "required" };
  readonly frozenBeforeAuthorization: true;
  readonly predecessorEvidence: readonly {
    readonly missionId: string;
    readonly journalSchemaVersion: 2;
    readonly journalDigest: string;
    readonly relation: "predecessor_journal_digest";
  }[];
}

export const CANONICAL_MISSION_ROLE_REGISTRY_V1: readonly MissionRoleDefinitionV1[] = Object.freeze([
  { roleId: "coulson", seatId: "coulson", kind: "human_authority", identityVerification: "surface_specific_verified" },
  { roleId: "fitz", seatId: "fitz", kind: "human_authority", identityVerification: "surface_specific_verified" },
  { roleId: "simmons", seatId: "simmons", kind: "human_authority", identityVerification: "surface_specific_verified" },
]);

export const MISSION_PROFILES_V1: readonly MissionProfileV1[] = Object.freeze([
  {
    schemaVersion: 1, contractVersion: MISSION_PROFILE_CONTRACT_VERSION, profileId: "standard", version: 1,
    authorizationRoleId: "coulson", finalAcceptanceRoleId: "coulson",
    requiredExecutionGateRoleIds: ["coulson"], requiredFinalAcceptanceGateRoleIds: ["coulson"],
  },
  {
    schemaVersion: 1, contractVersion: MISSION_PROFILE_CONTRACT_VERSION, profileId: "high_assurance", version: 1,
    authorizationRoleId: "coulson", finalAcceptanceRoleId: "coulson",
    requiredExecutionGateRoleIds: ["coulson", "fitz"], requiredFinalAcceptanceGateRoleIds: ["coulson"],
  },
  {
    schemaVersion: 1, contractVersion: MISSION_PROFILE_CONTRACT_VERSION, profileId: "product_sensitive", version: 1,
    authorizationRoleId: "coulson", finalAcceptanceRoleId: "coulson",
    requiredExecutionGateRoleIds: ["coulson", "simmons"], requiredFinalAcceptanceGateRoleIds: ["coulson"],
  },
]);

const PROFILE_IDS = new Set<string>(MISSION_PROFILE_IDS);
const ROLE_IDS = new Set<string>(MISSION_ROLE_IDS);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/;
const DIGEST = /^sha256:(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43})$/;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("base64url")}`;
}

function validProfile(value: unknown): value is MissionProfileV1 {
  if (!plain(value)) return false;
  const keys = ["schemaVersion", "contractVersion", "profileId", "version", "authorizationRoleId", "finalAcceptanceRoleId", "requiredExecutionGateRoleIds", "requiredFinalAcceptanceGateRoleIds"];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) return false;
  if (value.schemaVersion !== 1 || value.contractVersion !== MISSION_PROFILE_CONTRACT_VERSION || !PROFILE_IDS.has(String(value.profileId)) || value.version !== 1) return false;
  if (value.authorizationRoleId !== "coulson" || value.finalAcceptanceRoleId !== "coulson") return false;
  if (!Array.isArray(value.requiredExecutionGateRoleIds) || value.requiredExecutionGateRoleIds.length < 1 || value.requiredExecutionGateRoleIds.length > 3 || !value.requiredExecutionGateRoleIds.every((role) => ROLE_IDS.has(String(role)))) return false;
  if (new Set(value.requiredExecutionGateRoleIds).size !== value.requiredExecutionGateRoleIds.length || value.requiredExecutionGateRoleIds[0] !== "coulson") return false;
  return Array.isArray(value.requiredFinalAcceptanceGateRoleIds) && value.requiredFinalAcceptanceGateRoleIds.length === 1 && value.requiredFinalAcceptanceGateRoleIds[0] === "coulson";
}

export function validateMissionProfileV1(input: unknown): { state: "valid"; value: MissionProfileV1 } | { state: "invalid"; code: "INVALID_PROFILE" } {
  return validProfile(input) ? { state: "valid", value: input } : { state: "invalid", code: "INVALID_PROFILE" };
}

export function getMissionProfileV1(profileId: MissionProfileId): MissionProfileV1 {
  const profile = MISSION_PROFILES_V1.find((candidate) => candidate.profileId === profileId);
  if (!profile) throw new Error(`Unknown mission profile: ${profileId}`);
  return profile;
}

export function freezeMissionRequirementsV1(input: {
  missionId: string;
  missionRevisionId: string;
  profileId: MissionProfileId;
  authorizationRoleId: "coulson";
  predecessorMissionId: string;
  predecessorJournalSchemaVersion: 2;
  predecessorJournalDigest: string;
}): FrozenMissionRequirementsV1 {
  if (!ID.test(input.missionId) || !ID.test(input.missionRevisionId) || !ID.test(input.predecessorMissionId) || !DIGEST.test(input.predecessorJournalDigest)) throw new Error("Mission profile freeze input is malformed.");
  const profile = getMissionProfileV1(input.profileId);
  if (input.authorizationRoleId !== "coulson") throw new Error("Only Coulson can activate a mission profile.");
  return {
    schemaVersion: 1, contractVersion: MISSION_PROFILE_CONTRACT_VERSION,
    missionId: input.missionId, missionRevisionId: input.missionRevisionId,
    profile, profileDigest: digest(profile),
    authorization: { requiredRoleId: "coulson", status: "required" },
    executionGates: profile.requiredExecutionGateRoleIds.map((requiredRoleId) => ({ requiredRoleId, status: "required" as const })),
    finalAcceptance: { requiredRoleId: "coulson", status: "required" },
    frozenBeforeAuthorization: true,
    predecessorEvidence: [{ missionId: input.predecessorMissionId, journalSchemaVersion: 2, journalDigest: input.predecessorJournalDigest, relation: "predecessor_journal_digest" }],
  };
}

export function isProfileAtLeastAsStrictV1(selected: MissionProfileId, required: MissionProfileId): boolean {
  const selectedGates = new Set(getMissionProfileV1(selected).requiredExecutionGateRoleIds);
  return getMissionProfileV1(required).requiredExecutionGateRoleIds.every((role) => selectedGates.has(role));
}
