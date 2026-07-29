import { createHash, createPublicKey, verify } from "node:crypto";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  type EvidenceTimestamp,
  type MissionModeActivation,
  type MissionRiskFlags,
  type TrustedHumanBinding,
} from "./mission-v2.mjs";
import {
  getMissionProfileV1,
  isProfileAtLeastAsStrictV1,
  type MissionProfileId,
} from "./mission-profile-v1.mjs";

export const PROFILE_AWARE_BRIEF_SCHEMA_VERSION = 2 as const;
export const PROFILE_AWARE_JOURNAL_SCHEMA_VERSION = 9 as const;
export const PROFILE_AWARE_CONTRACT_VERSION = "mission.profile-aware.v1" as const;
export const MISSION_130_PREDECESSOR_ID = "mission:issue-130" as const;
export const MISSION_130_JOURNAL_DIGEST = "sha256:7f1f8c50a703cf43e1c477d88446473c5d1d755b99a4ad35a2b6662558ded7b9" as const;

type GateRole = "coulson" | "fitz" | "simmons";
type EvidenceKind = "mission_authorization" | "technical_review" | "product_domain_review" | "final_acceptance";

export interface ProfileAwareMissionBriefContentV1 {
  schemaVersion: 2;
  missionId: string;
  objective: string;
  subjectId: string;
  riskFlags: MissionRiskFlags;
  participants: { seatId: string }[];
  activatedModes: MissionModeActivation[];
  requireSimmons: boolean;
  createdAt: EvidenceTimestamp;
  profileId: MissionProfileId;
  profileVersion: 1;
  requiredExecutionGateRoleIds: GateRole[];
  requiredFinalAcceptanceGateRoleIds: ["coulson"];
  predecessorMissionId: string;
  predecessorJournalDigest: string;
}

export interface ProfileAwareMissionBriefV1 extends ProfileAwareMissionBriefContentV1 { revisionId: string }

export interface ProfileRequirementV1 {
  requirementId: string;
  requiredRoleId: GateRole;
  evidenceKind: EvidenceKind;
  phase: "authorization" | "execution" | "final_acceptance";
  revisionId: string;
}

export interface ProfileEvidenceV1 {
  schemaVersion: 1;
  evidenceId: string;
  requirementId: string;
  missionId: string;
  revisionId: string;
  seatId: GateRole;
  evidenceKind: EvidenceKind;
  decision: "approved";
  humanPrincipalId: string;
  bindingId: string;
  signingKeyRef: string;
  sourceRef: string;
  timestamp: EvidenceTimestamp;
  journalSequence: number;
}

export interface SignedProfileEvidenceV1 { payload: ProfileEvidenceV1; signatureBase64: string }

export type ProfileAwareMissionEntryV1 =
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "mission.begun"; timestamp: EvidenceTimestamp; payload: { brief: ProfileAwareMissionBriefV1; trustedBindings: TrustedHumanBinding[]; requirements: ProfileRequirementV1[] } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "governance.decided"; timestamp: EvidenceTimestamp; payload: { evidence: SignedProfileEvidenceV1 } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "execution.transition"; timestamp: EvidenceTimestamp; payload: { from: "not-started" | "running"; to: "running" | "completed" } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "evidence.recorded"; timestamp: EvidenceTimestamp; payload: { evidence: SignedProfileEvidenceV1 } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "final_acceptance.recorded"; timestamp: EvidenceTimestamp; payload: { evidence: SignedProfileEvidenceV1 } };

export interface ProfileAwareProjectionV1 {
  schemaVersion: 9;
  missionId: string;
  brief: ProfileAwareMissionBriefV1;
  requirements: ProfileRequirementV1[];
  evidence: ProfileEvidenceV1[];
  authorization: "waiting" | "authorized";
  execution: "not-started" | "running" | "completed";
  readiness: { execute: "waiting" | "ready" | "blocked"; accept: "waiting" | "ready" | "blocked" };
  finalAcceptance: "waiting" | "accepted";
  lastSequence: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/;
const DIGEST = /^sha256:(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const ROLES = new Set<GateRole>(["coulson", "fitz", "simmons"]);
const KINDS = new Set<EvidenceKind>(["mission_authorization", "technical_review", "product_domain_review", "final_acceptance"]);

const valid = <T,>(value: T) => ({ state: "valid" as const, value });
const invalid = (code: string, ...errors: string[]) => ({ state: "invalid" as const, code, errors });
export type ProfileAwareResult<T> = ReturnType<typeof invalid> | ReturnType<typeof valid<T>>;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
function timestamp(value: unknown): value is EvidenceTimestamp {
  return exact(value, ["value", "provenance"]) && typeof value.value === "string" && ISO.test(value.value) && Number.isFinite(Date.parse(value.value)) && (value.provenance === "humanRecorded" || value.provenance === "hostTrusted");
}
function revision(content: ProfileAwareMissionBriefContentV1): string {
  return `sha256:${createHash("sha256").update(canonicalJson(content)).digest("base64url")}`;
}
function requirementId(brief: ProfileAwareMissionBriefV1, kind: EvidenceKind): string { return `req:${brief.missionId}:${brief.revisionId}:${kind}`; }

export function createProfileAwareMissionBrief(input: ProfileAwareMissionBriefContentV1): ProfileAwareMissionBriefV1 {
  const profile = getMissionProfileV1(input.profileId);
  if (input.profileVersion !== profile.version || input.requiredExecutionGateRoleIds.join(",") !== profile.requiredExecutionGateRoleIds.join(",")) throw new Error("Profile gates are not canonical.");
  return { ...input, revisionId: revision(input) };
}

export function validateProfileAwareMissionBrief(input: unknown): ProfileAwareResult<ProfileAwareMissionBriefV1> {
  const fields = ["schemaVersion", "missionId", "objective", "subjectId", "riskFlags", "participants", "activatedModes", "requireSimmons", "createdAt", "profileId", "profileVersion", "requiredExecutionGateRoleIds", "requiredFinalAcceptanceGateRoleIds", "predecessorMissionId", "predecessorJournalDigest", "revisionId"];
  if (!exact(input, fields)) return invalid("malformed", "Profile-aware brief fields are not closed.");
  const value = input as unknown as ProfileAwareMissionBriefV1;
  const profile = MISSION_PROFILE_LOOKUP(value.profileId);
  const errors: string[] = [];
  if (value.schemaVersion !== 2 || !ID.test(value.missionId) || !ID.test(value.subjectId) || !ID.test(value.predecessorMissionId) || !ID.test(value.revisionId)) errors.push("Profile-aware brief identity is invalid.");
  if (typeof value.objective !== "string" || value.objective.length === 0 || value.objective.length > 512) errors.push("Profile-aware brief objective is invalid.");
  if (!timestamp(value.createdAt) || !DIGEST.test(value.predecessorJournalDigest) || value.predecessorMissionId !== MISSION_130_PREDECESSOR_ID || value.predecessorJournalDigest !== MISSION_130_JOURNAL_DIGEST) errors.push("Profile-aware brief timestamp or predecessor digest is invalid or stale.");
  if (value.profileVersion !== 1 || !profile || value.profileId !== profile.profileId) errors.push("Profile-aware brief profile is invalid.");
  if (!Array.isArray(value.requiredExecutionGateRoleIds) || value.requiredExecutionGateRoleIds.join(",") !== profile?.requiredExecutionGateRoleIds.join(",")) errors.push("Profile-aware brief execution gates are not frozen canonically.");
  if (!Array.isArray(value.requiredFinalAcceptanceGateRoleIds) || value.requiredFinalAcceptanceGateRoleIds.length !== 1 || value.requiredFinalAcceptanceGateRoleIds[0] !== "coulson") errors.push("Final acceptance gate must be Coulson.");
  if (!Array.isArray(value.participants) || value.participants.length === 0 || !value.participants.every((participant) => exact(participant, ["seatId"]) && typeof participant.seatId === "string" && ID.test(participant.seatId))) errors.push("Profile-aware brief participants are invalid.");
  if (!Array.isArray(value.activatedModes)) errors.push("Profile-aware brief activated modes are invalid.");
  if (errors.length > 0) return invalid("malformed", ...errors);
  const { revisionId: _revisionId, ...content } = value;
  if (value.revisionId !== revision(content as ProfileAwareMissionBriefContentV1)) return invalid("revision_mismatch", "Profile-aware brief revision is stale or tampered.");
  return valid(value);
}

function MISSION_PROFILE_LOOKUP(profileId: MissionProfileId) {
  try { return getMissionProfileV1(profileId); } catch { return null; }
}

export function createProfileRequirementsV1(brief: ProfileAwareMissionBriefV1): ProfileRequirementV1[] {
  const profile = getMissionProfileV1(brief.profileId);
  return [
    { requirementId: requirementId(brief, "mission_authorization"), requiredRoleId: "coulson", evidenceKind: "mission_authorization", phase: "authorization", revisionId: brief.revisionId },
    ...profile.requiredExecutionGateRoleIds.filter((role) => role !== "coulson").map((role) => ({ requirementId: requirementId(brief, role === "fitz" ? "technical_review" : "product_domain_review"), requiredRoleId: role, evidenceKind: (role === "fitz" ? "technical_review" : "product_domain_review") as EvidenceKind, phase: "execution" as const, revisionId: brief.revisionId })),
    { requirementId: requirementId(brief, "final_acceptance"), requiredRoleId: "coulson", evidenceKind: "final_acceptance", phase: "final_acceptance", revisionId: brief.revisionId },
  ];
}

export function createProfileAwareMissionBegunEntry(brief: ProfileAwareMissionBriefV1, bindings: TrustedHumanBinding[], timestampValue = brief.createdAt): ProfileAwareMissionEntryV1 {
  const checked = validateProfileAwareMissionBrief(brief);
  if (checked.state === "invalid") throw new Error(checked.errors.join(" "));
  return { schemaVersion: 9, entryId: `entry:${brief.missionId}:0`, missionId: brief.missionId, sequence: 0, type: "mission.begun", timestamp: timestampValue, payload: { brief, trustedBindings: bindings, requirements: createProfileRequirementsV1(brief) } };
}

export function profileAwareMissionIntakeV1(input: {
  brief: ProfileAwareMissionBriefContentV1;
  trustedBindings: TrustedHumanBinding[];
}): ProfileAwareResult<{ brief: ProfileAwareMissionBriefV1; entry: ProfileAwareMissionEntryV1; requirements: ProfileRequirementV1[] }> {
  let brief: ProfileAwareMissionBriefV1;
  try { brief = createProfileAwareMissionBrief(input.brief); }
  catch (error) { return invalid("profile_invalid", error instanceof Error ? error.message : "Profile-aware brief is invalid."); }
  const checked = validateProfileAwareMissionBrief(brief);
  if (checked.state === "invalid") return checked;
  const requiredRoles = new Set(createProfileRequirementsV1(brief).map(({ requiredRoleId }) => requiredRoleId));
  for (const role of requiredRoles) {
    if (input.trustedBindings.filter((binding) => binding.seatId === role).length !== 1) return invalid("binding_missing", `Profile-aware intake requires exactly one ${role} binding.`);
  }
  const entry = createProfileAwareMissionBegunEntry(brief, input.trustedBindings);
  return valid({ brief, entry, requirements: createProfileRequirementsV1(brief) });
}

function verifyEvidence(evidence: SignedProfileEvidenceV1, expected: ProfileRequirementV1, bindings: TrustedHumanBinding[], missionId: string, sequence: number): string[] {
  const payload = evidence?.payload;
  const errors: string[] = [];
  if (!exact(payload, ["schemaVersion", "evidenceId", "requirementId", "missionId", "revisionId", "seatId", "evidenceKind", "decision", "humanPrincipalId", "bindingId", "signingKeyRef", "sourceRef", "timestamp", "journalSequence"])) return ["Evidence fields are not closed."];
  if (payload.schemaVersion !== 1 || !ID.test(payload.evidenceId) || payload.requirementId !== expected.requirementId || payload.missionId !== missionId || payload.revisionId !== expected.revisionId || payload.seatId !== expected.requiredRoleId || payload.evidenceKind !== expected.evidenceKind || payload.decision !== "approved" || !timestamp(payload.timestamp) || payload.journalSequence !== sequence) errors.push("Evidence identity or sequence is invalid.");
  const binding = bindings.find((candidate) => candidate.seatId === payload.seatId && candidate.bindingId === payload.bindingId);
  if (!binding || binding.humanPrincipalId !== payload.humanPrincipalId || binding.signingKeyRef !== payload.signingKeyRef || (binding.missionScope !== "*" && binding.missionScope !== missionId)) errors.push("Evidence binding is missing, stale, or wrong-seat.");
  if (binding && computeEd25519SigningKeyRef(binding.publicKeySpkiBase64) !== payload.signingKeyRef) errors.push("Evidence signing identity is mismatched.");
  if (typeof evidence.signatureBase64 !== "string" || !binding) errors.push("Evidence signature is missing.");
  else {
    try {
      const key = createPublicKey({ key: Buffer.from(binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
      if (!verify(null, Buffer.from(canonicalJson(payload)), key, Buffer.from(evidence.signatureBase64, "base64"))) errors.push("Evidence signature is invalid.");
    } catch { errors.push("Evidence signature or key is malformed."); }
  }
  return errors;
}

export function replayProfileAwareMissionJournal(entries: unknown): ProfileAwareResult<ProfileAwareProjectionV1> {
  if (!Array.isArray(entries) || entries.length === 0) return invalid("malformed", "Profile-aware journal must contain entries.");
  const begun = entries[0] as ProfileAwareMissionEntryV1;
  if (!exact(begun, ["schemaVersion", "entryId", "missionId", "sequence", "type", "timestamp", "payload"]) || begun.schemaVersion !== 9 || begun.type !== "mission.begun" || begun.sequence !== 0) return invalid("malformed", "Profile-aware journal must begin with schema 9 mission.begun.");
  const briefResult = validateProfileAwareMissionBrief(begun.payload?.brief);
  if (briefResult.state === "invalid") return briefResult;
  const brief = briefResult.value;
  if (begun.missionId !== brief.missionId || begun.entryId !== `entry:${brief.missionId}:0` || !timestamp(begun.timestamp) || canonicalJson(begun.timestamp) !== canonicalJson(brief.createdAt)) return invalid("mission_mismatch", "Profile-aware begin identity is invalid.");
  const requirements = createProfileRequirementsV1(brief);
  if (canonicalJson(begun.payload.requirements) !== canonicalJson(requirements)) return invalid("tampered_requirements", "Profile requirements are not frozen canonically.");
  const entryIds = new Set([begun.entryId]);
  const evidenceIds = new Set<string>();
  const evidence: ProfileEvidenceV1[] = [];
  let authorization: "waiting" | "authorized" = "waiting";
  let execution: "not-started" | "running" | "completed" = "not-started";
  let finalAcceptance: "waiting" | "accepted" = "waiting";
  let previousTime = Date.parse(begun.timestamp.value);
  for (let index = 1; index < entries.length; index += 1) {
    const entry = entries[index] as ProfileAwareMissionEntryV1;
    if (!exact(entry, ["schemaVersion", "entryId", "missionId", "sequence", "type", "timestamp", "payload"]) || entry.schemaVersion !== 9 || entry.sequence !== index || entry.missionId !== brief.missionId || !timestamp(entry.timestamp)) return invalid("malformed", `Entry ${index} shape or identity is invalid.`);
    if (entryIds.has(entry.entryId)) return invalid("duplicate_event", `Entry ${index} duplicates entryId.`);
    entryIds.add(entry.entryId);
    const time = Date.parse(entry.timestamp.value); if (time < previousTime) return invalid("sequence_invalid", `Entry ${index} timestamp moves backward.`); previousTime = time;
    if (entry.type === "governance.decided" || entry.type === "evidence.recorded" || entry.type === "final_acceptance.recorded") {
      const signed = entry.payload.evidence;
      const expectedKind: EvidenceKind = entry.type === "governance.decided" ? "mission_authorization" : entry.type === "final_acceptance.recorded" ? "final_acceptance" : signed?.payload?.evidenceKind;
      const matches = requirements.filter((requirement) => requirement.evidenceKind === signed?.payload?.evidenceKind && requirement.evidenceKind === expectedKind);
      if (matches.length !== 1 || evidenceIds.has(signed?.payload?.evidenceId)) return invalid("duplicate_evidence", `Entry ${index} evidence is duplicate or ambiguous.`);
      const errors = verifyEvidence(signed, matches[0], begun.payload.trustedBindings, brief.missionId, index); if (errors.length) return invalid("evidence_invalid", ...errors);
      if (entry.type === "governance.decided") { if (authorization !== "waiting" || execution !== "not-started") return invalid("sequence_invalid", "Authorization is duplicated or late."); authorization = "authorized"; }
      if (entry.type === "evidence.recorded") { if (execution !== "not-started") return invalid("ordering_invalid", "Execution gate evidence must be frozen before execution."); if (matches[0].phase !== "execution") return invalid("evidence_invalid", "Only profile execution gates may be recorded here."); }
      if (entry.type === "final_acceptance.recorded") { if (authorization !== "authorized" || execution !== "completed" || finalAcceptance === "accepted") return invalid("ordering_invalid", "Final acceptance requires authorized successful execution and is single-use."); finalAcceptance = "accepted"; }
      evidenceIds.add(signed.payload.evidenceId); evidence.push(signed.payload);
    } else if (entry.type === "execution.transition") {
      if (authorization !== "authorized") return invalid("ordering_invalid", "Execution requires authorization and all frozen gates.");
      const pending = requirements.filter((requirement) => requirement.phase === "execution" && !evidence.some((record) => record.requirementId === requirement.requirementId));
      if (pending.length > 0) return invalid("gate_missing", "Execution cannot start before frozen specialist gates are satisfied.");
      if (entry.payload.from !== execution || !((execution === "not-started" && entry.payload.to === "running") || (execution === "running" && entry.payload.to === "completed"))) return invalid("ordering_invalid", "Execution transition is invalid.");
      execution = entry.payload.to;
    } else return invalid("unsupported_event", `Entry ${index} event type is unsupported.`);
  }
  const pendingExecution = requirements.some((requirement) => requirement.phase === "execution" && !evidence.some((record) => record.requirementId === requirement.requirementId));
  return valid({ schemaVersion: 9, missionId: brief.missionId, brief, requirements, evidence, authorization, execution, readiness: { execute: authorization === "authorized" && !pendingExecution ? "ready" : "waiting", accept: execution === "completed" && finalAcceptance === "waiting" ? "waiting" : finalAcceptance === "accepted" ? "ready" : "blocked" }, finalAcceptance, lastSequence: entries.length - 1 });
}

export function profileIsNotWeakenedV1(selected: MissionProfileId, required: MissionProfileId): boolean { return isProfileAtLeastAsStrictV1(selected, required); }
