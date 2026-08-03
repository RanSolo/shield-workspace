import { createHash, createPublicKey, verify } from "node:crypto";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  validateTrustedBindingRegistry,
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
import { routingProjection, validateRoleAssignment } from "./role-taxonomy-v1.mjs";
import {
  validateRunnerAuthoritativeEffectRecord,
  validateRunnerExecutionEffectPayload,
  validateRunnerSupervisedEffectCandidate,
  type RunnerAuthoritativeEffectRecord,
  type RunnerExecutionEffectPayload,
  type RunnerSupervisedEffectCandidate,
} from "./runner-v1.mjs";
import {
  computeImplementationAuthorityDigest,
  copyAuthority,
  copySchema9RuntimeBinding,
  type ImplementationAuthorityV1,
  type Schema9RuntimeBindingV1,
  type SignedImplementationAuthorityRevocationV1,
  type SignedImplementationAuthorityV1,
  type SignedSchema9RuntimeBindingAuthorization,
  validateSchema9RuntimeBindingV1,
  verifySignedImplementationAuthorityRevocationV1,
  verifySignedImplementationAuthorityV1,
  verifySignedSchema9RuntimeBindingAuthorizationV1,
} from "./implementation-authority-v1.mjs";

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
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "implementation.authorized"; timestamp: EvidenceTimestamp; payload: { authority: SignedImplementationAuthorityV1 } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "implementation.authority_revoked"; timestamp: EvidenceTimestamp; payload: { revocation: SignedImplementationAuthorityRevocationV1 } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "execution.transition"; timestamp: EvidenceTimestamp; payload: { from: "not-started" | "running"; to: "running" | "completed" } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "execution.effect_recorded"; timestamp: EvidenceTimestamp; payload: { effect: RunnerExecutionEffectPayload } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "evidence.recorded"; timestamp: EvidenceTimestamp; payload: { evidence: SignedProfileEvidenceV1 } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "runtime.binding_recorded"; timestamp: EvidenceTimestamp; payload: { binding: Schema9RuntimeBindingV1; authorization: SignedSchema9RuntimeBindingAuthorization } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "runtime.binding_superseded"; timestamp: EvidenceTimestamp; payload: { priorBindingId: string; priorBindingVersion: number; binding: Schema9RuntimeBindingV1; authorization: SignedSchema9RuntimeBindingAuthorization } }
  | { schemaVersion: 9; entryId: string; missionId: string; sequence: number; type: "final_acceptance.recorded"; timestamp: EvidenceTimestamp; payload: { evidence: SignedProfileEvidenceV1 } };

export interface ProfileAwareProjectionV1 {
  schemaVersion: 9;
  missionId: string;
  brief: ProfileAwareMissionBriefV1;
  requirements: ProfileRequirementV1[];
  evidence: ProfileEvidenceV1[];
  authorization: "waiting" | "authorized";
  execution: "not-started" | "running" | "completed";
  implementationAuthority: ImplementationAuthorityV1 | null;
  implementationAuthorityDigest: string | null;
  implementationAuthorityState: "waiting" | "authorized" | "revoked";
  runtimeBindings: Schema9RuntimeBindingV1[];
  activeRuntimeBindings: Schema9RuntimeBindingV1[];
  readiness: { execute: "waiting" | "ready" | "blocked"; accept: "waiting" | "ready" | "blocked" };
  effects: RunnerAuthoritativeEffectRecord[];
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
  if (!Array.isArray(value.participants) || value.participants.length === 0) {
    errors.push("Profile-aware brief participants are invalid.");
  } else {
    for (const [index, participant] of value.participants.entries()) {
      if (!exact(participant, ["seatId"])) {
        errors.push(`participants[${index}] is malformed.`);
      } else if (typeof participant.seatId !== "string" || !ID.test(participant.seatId)) {
        errors.push(`participants[${index}].seatId is invalid.`);
      } else {
        const projected = routingProjection(participant.seatId);
        if (projected.state === "invalid" || (projected.value.route === "dispatch_seat" && projected.value.role.v03Enabled !== true)) {
          errors.push(`participants[${index}].seatId is not a valid dispatchable V0.3 role.`);
        }
      }
    }
  }
  if (!Array.isArray(value.activatedModes)) {
    errors.push("Profile-aware brief activated modes are invalid.");
  } else {
    value.activatedModes.forEach((activation, index) => {
      if (!exact(activation, ["modeId", "modeVersion", "seatId", "activationSource"])) {
        errors.push("Profile-aware brief activated modes are invalid.");
        return;
      }
      const activationKeys = ["modeId", "modeVersion", "seatId", "activationSource"] as const;
      const normalizedActivation = activation as Record<(typeof activationKeys)[number], unknown>;
      for (const field of activationKeys) {
        const value = normalizedActivation[field];
        if (typeof value !== "string" || !ID.test(value)) {
          errors.push(`activatedModes[${index}].${field} is invalid.`);
        }
      }
      const assignment = validateRoleAssignment(
        activation.seatId,
        "dispatch",
        { requireV03Enabled: true },
      );
      if (assignment.state === "invalid") {
        errors.push(`activatedModes[${index}].seatId is not a valid dispatchable V0.3 role.`);
      }
    });
  }
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

export function createProfileAwareExecutionEffectEntryV1(input: {
  projection: ProfileAwareProjectionV1;
  candidate: RunnerSupervisedEffectCandidate;
  timestamp: EvidenceTimestamp;
}): ProfileAwareMissionEntryV1 {
  const { projection, candidate } = input;
  const checkedCandidate = validateRunnerSupervisedEffectCandidate(candidate);
  if (checkedCandidate.state === "invalid") throw new Error(checkedCandidate.errors.join(" "));
  if (!timestamp(input.timestamp)) throw new Error("Profile-aware effect timestamp is invalid.");
  if (projection.schemaVersion !== 9 ||
      projection.authorization !== "authorized" ||
      projection.execution !== "running") {
    throw new Error("Profile-aware execution effect requires an authorized running mission.");
  }
  if (projection.effects.some(({ outcome }) => outcome === "uncertain")) {
    throw new Error("Profile-aware execution recovery requires a separate authorized contract.");
  }
  if (projection.readiness.execute !== "ready") {
    throw new Error("Profile-aware execution effect requires ready frozen gates.");
  }
  if (candidate.journalSchemaVersion !== 9 ||
      candidate.missionId !== projection.missionId ||
      candidate.subjectId !== projection.brief.subjectId ||
      candidate.revisionId !== projection.brief.revisionId ||
      candidate.expectedPreviousSequence !== projection.lastSequence ||
      candidate.intendedJournalSequence !== projection.lastSequence + 1) {
    throw new Error("Profile-aware effect candidate identity or sequence is stale.");
  }
  if (projection.effects.some(({ cycleId, effectKey }) =>
    cycleId === candidate.payload.cycleId || effectKey === candidate.payload.effectKey)) {
    throw new Error("Profile-aware effect candidate duplicates a cycle or effect.");
  }
  return {
    schemaVersion: 9,
    entryId: `entry:${projection.missionId}:${candidate.intendedJournalSequence}`,
    missionId: projection.missionId,
    sequence: candidate.intendedJournalSequence,
    type: "execution.effect_recorded",
    timestamp: input.timestamp,
    payload: { effect: candidate.payload },
  };
}

export function createProfileAwareImplementationAuthorityEntryV1(input: {
  projection: ProfileAwareProjectionV1;
  trustedBindings: TrustedHumanBinding[];
  authority: SignedImplementationAuthorityV1;
}): ProfileAwareMissionEntryV1 {
  if (input.projection.schemaVersion !== 9 ||
      input.projection.implementationAuthorityState !== "waiting" ||
      input.projection.authorization !== "authorized" ||
      input.projection.execution !== "not-started" ||
      input.projection.finalAcceptance !== "waiting") {
    throw new Error("Profile-aware implementation authority requires an authorized not-started mission.");
  }
  const checked = verifySignedImplementationAuthorityV1(
    input.authority,
    input.trustedBindings,
    input.projection.missionId,
    input.projection.brief.subjectId,
    input.projection.brief.revisionId,
    input.projection.lastSequence + 1,
  );
  if (checked.state === "invalid") throw new Error(checked.errors.join(" "));
  if (!timestamp(checked.value.timestamp) || canonicalJson(checked.value.timestamp) !== canonicalJson(input.authority.payload.timestamp)) {
    throw new Error("Profile-aware implementation authority timestamp is malformed.");
  }
  return {
    schemaVersion: 9,
    entryId: `entry:${input.projection.missionId}:${input.projection.lastSequence + 1}`,
    missionId: input.projection.missionId,
    sequence: input.projection.lastSequence + 1,
    type: "implementation.authorized",
    timestamp: { ...checked.value.timestamp },
    payload: {
      authority: {
        payload: copyAuthority(checked.value),
        signatureBase64: input.authority.signatureBase64,
      },
    },
  };
}

export function createProfileAwareImplementationAuthorityRevocationEntryV1(input: {
  projection: ProfileAwareProjectionV1;
  trustedBindings: TrustedHumanBinding[];
  revocation: SignedImplementationAuthorityRevocationV1;
}): ProfileAwareMissionEntryV1 {
  if (input.projection.schemaVersion !== 9 || input.projection.implementationAuthorityState !== "authorized" || input.projection.finalAcceptance === "accepted" || input.projection.execution === "completed") {
    throw new Error("Profile-aware implementation authority revocation requires an active mission authority.");
  }
  if (input.projection.implementationAuthority === null) throw new Error("Profile-aware implementation authority is not active.");
  const payload = {
    missionId: input.projection.missionId,
    subjectId: input.projection.brief.subjectId,
    missionRevisionId: input.projection.brief.revisionId,
    authorityRef: input.projection.implementationAuthority.authorityRef,
    authorityDigest: input.projection.implementationAuthorityDigest ?? computeImplementationAuthorityDigest(input.projection.implementationAuthority),
    authoritySequence: input.projection.implementationAuthority.journalSequence,
  };
  const checked = verifySignedImplementationAuthorityRevocationV1(input.revocation, input.trustedBindings, payload, input.projection.lastSequence + 1);
  if (checked.state === "invalid") throw new Error(checked.errors.join(" "));
  if (canonicalJson(checked.value.timestamp) !== canonicalJson(input.revocation.payload.timestamp) ||
      canonicalJson(input.revocation.payload.timestamp) !== canonicalJson(checked.value.timestamp)) {
    throw new Error("Profile-aware implementation authority revocation timestamp is malformed.");
  }
  return {
    schemaVersion: 9,
    entryId: `entry:${input.projection.missionId}:${input.projection.lastSequence + 1}`,
    missionId: input.projection.missionId,
    sequence: input.projection.lastSequence + 1,
    type: "implementation.authority_revoked",
    timestamp: { ...checked.value.timestamp },
    payload: {
      revocation: {
        ...input.revocation,
        payload: {
          ...checked.value,
        },
      },
    },
  };
}

export function createProfileAwareRuntimeBindingRecordedEntryV1(input: {
  projection: ProfileAwareProjectionV1;
  trustedBindings: TrustedHumanBinding[];
  binding: Schema9RuntimeBindingV1;
  authorization: SignedSchema9RuntimeBindingAuthorization;
}): ProfileAwareMissionEntryV1 {
  if (input.projection.schemaVersion !== 9 ||
      input.projection.implementationAuthorityState !== "authorized" ||
      input.projection.execution !== "not-started" ||
      input.projection.finalAcceptance !== "waiting") {
    throw new Error("Profile-aware runtime binding requires an active Wheels Up authority and pre-execution mission.");
  }
  const checkedBinding = validateSchema9RuntimeBindingV1(input.binding);
  if (checkedBinding.state === "invalid") throw new Error(checkedBinding.errors.join(" "));
  const binding = checkedBinding.value;
  if (!input.projection.brief.participants.some(({ seatId }) => seatId === binding.binding.seatId)) {
    throw new Error("Profile-aware runtime binding seat is not a mission participant.");
  }
  if (input.projection.brief.participants.some(({ seatId }) => seatId === binding.binding.reasoningRuntimeId || seatId === binding.binding.toolExecutorId)) {
    throw new Error("Runtime binding identities cannot be mission participants.");
  }
  if (binding.binding.bindingVersion !== 1 || binding.binding.lifecycleState !== "active" || binding.binding.activeThroughSequence !== null) {
    throw new Error("Runtime binding must be the initial active binding version 1.");
  }
  if (binding.binding.seatId !== "may") {
    throw new Error("Runtime binding seat must be may.");
  }
  if (binding.binding.coulsonAuthorizationRef !== input.authorization.payload.authorizationId) {
    throw new Error("Runtime binding authorization id must match the binding's Coulson authorization reference.");
  }
  if (!input.projection.implementationAuthority) {
    throw new Error("Profile-aware runtime binding requires an active implementation authority.");
  }
  const checkedAuthority = verifySignedSchema9RuntimeBindingAuthorizationV1(
    input.authorization,
    binding,
    {
      missionId: input.projection.missionId,
      subjectId: input.projection.brief.subjectId,
      missionRevisionId: input.projection.brief.revisionId,
      trustedBindings: input.trustedBindings,
      implementationAuthority: input.projection.implementationAuthority as ImplementationAuthorityV1,
      lastSequence: input.projection.lastSequence,
      },
    null,
    null,
  );
  if (checkedAuthority.state === "invalid") throw new Error(checkedAuthority.errors.join(" "));
  if (canonicalJson(checkedAuthority.value.timestamp) !== canonicalJson(input.authorization.payload.timestamp)) {
    throw new Error("Profile-aware runtime binding timestamp is malformed.");
  }
  return {
    schemaVersion: 9,
    entryId: `entry:${input.projection.missionId}:${input.projection.lastSequence + 1}`,
    missionId: input.projection.missionId,
    sequence: input.projection.lastSequence + 1,
    type: "runtime.binding_recorded",
    timestamp: { ...checkedAuthority.value.timestamp },
    payload: {
      binding: copySchema9RuntimeBinding(binding),
      authorization: {
        payload: { ...checkedAuthority.value, priorBindingId: null, priorBindingVersion: null },
        signatureBase64: input.authorization.signatureBase64,
      },
    },
  };
}

export function createProfileAwareRuntimeBindingSupersessionEntryV1(input: {
  projection: ProfileAwareProjectionV1;
  trustedBindings: TrustedHumanBinding[];
  priorBindingId: string;
  priorBindingVersion: number;
  binding: Schema9RuntimeBindingV1;
  authorization: SignedSchema9RuntimeBindingAuthorization;
}): ProfileAwareMissionEntryV1 {
  if (input.projection.schemaVersion !== 9 ||
      input.projection.implementationAuthorityState !== "authorized" ||
      input.projection.execution !== "not-started" ||
      input.projection.finalAcceptance !== "waiting") {
    throw new Error("Profile-aware runtime binding supersession requires an active Wheels Up authority and pre-completion mission.");
  }
  const checkedBinding = validateSchema9RuntimeBindingV1(input.binding);
  if (checkedBinding.state === "invalid") throw new Error(checkedBinding.errors.join(" "));
  const binding = checkedBinding.value;
  if (!input.projection.implementationAuthority) throw new Error("Profile-aware runtime binding supersession requires an active implementation authority.");
  const prior = input.projection.activeRuntimeBindings.filter((candidate) =>
    candidate.binding.bindingId === input.priorBindingId &&
    candidate.binding.bindingVersion === input.priorBindingVersion,
  );
  if (prior.length !== 1) throw new Error("Profile-aware runtime binding supersession requires exactly one active prior binding.");
  const active = prior[0];
  if (binding.binding.bindingId !== active.binding.bindingId ||
      binding.binding.bindingVersion !== active.binding.bindingVersion + 1 ||
      binding.binding.bindingVersion === 1 ||
      binding.binding.seatId !== active.binding.seatId ||
      binding.binding.reasoningRuntimeId !== active.binding.reasoningRuntimeId ||
      binding.binding.toolExecutorId !== active.binding.toolExecutorId ||
      binding.binding.lifecycleState !== "active" ||
      binding.binding.activeThroughSequence !== null) {
    throw new Error("Runtime binding replacement must atomically increment the same active binding.");
  }
  if (binding.binding.seatId !== "may") {
    throw new Error("Runtime binding seat must be may.");
  }
  if (binding.binding.coulsonAuthorizationRef !== input.authorization.payload.authorizationId) {
    throw new Error("Runtime binding authorization id must match the binding's Coulson authorization reference.");
  }
  if (!input.projection.brief.participants.some(({ seatId }) => seatId === binding.binding.seatId)) {
    throw new Error("Profile-aware runtime binding seat is not a mission participant.");
  }
  if (input.projection.brief.participants.some(({ seatId }) => seatId === binding.binding.reasoningRuntimeId || seatId === binding.binding.toolExecutorId)) {
    throw new Error("Runtime binding identities cannot be mission participants.");
  }
  const checkedAuthority = verifySignedSchema9RuntimeBindingAuthorizationV1(
    input.authorization,
    binding,
    {
      missionId: input.projection.missionId,
      subjectId: input.projection.brief.subjectId,
      missionRevisionId: input.projection.brief.revisionId,
      trustedBindings: input.trustedBindings,
      implementationAuthority: input.projection.implementationAuthority as ImplementationAuthorityV1,
      lastSequence: input.projection.lastSequence,
    },
    input.priorBindingId,
    input.priorBindingVersion,
  );
  if (checkedAuthority.state === "invalid") throw new Error(checkedAuthority.errors.join(" "));
  if (canonicalJson(checkedAuthority.value.timestamp) !== canonicalJson(input.authorization.payload.timestamp)) {
    throw new Error("Profile-aware runtime binding timestamp is malformed.");
  }
  return {
    schemaVersion: 9,
    entryId: `entry:${input.projection.missionId}:${input.projection.lastSequence + 1}`,
    missionId: input.projection.missionId,
    sequence: input.projection.lastSequence + 1,
    type: "runtime.binding_superseded",
    timestamp: { ...checkedAuthority.value.timestamp },
    payload: {
      priorBindingId: input.priorBindingId,
      priorBindingVersion: input.priorBindingVersion,
      binding: copySchema9RuntimeBinding(binding),
      authorization: {
        payload: { ...checkedAuthority.value },
        signatureBase64: input.authorization.signatureBase64,
      },
    },
  };
}

function verifyEvidence(evidence: SignedProfileEvidenceV1, expected: ProfileRequirementV1, bindings: TrustedHumanBinding[], missionId: string, sequence: number): string[] {
  const payload = evidence?.payload;
  const errors: string[] = [];
  if (!exact(payload, ["schemaVersion", "evidenceId", "requirementId", "missionId", "revisionId", "seatId", "evidenceKind", "decision", "humanPrincipalId", "bindingId", "signingKeyRef", "sourceRef", "timestamp", "journalSequence"])) return ["Evidence fields are not closed."];
  if (payload.schemaVersion !== 1 || !ID.test(payload.evidenceId) || payload.requirementId !== expected.requirementId || payload.missionId !== missionId || payload.revisionId !== expected.revisionId || payload.seatId !== expected.requiredRoleId || payload.evidenceKind !== expected.evidenceKind || payload.decision !== "approved" || !timestamp(payload.timestamp) || payload.journalSequence !== sequence) errors.push("Evidence identity or sequence is invalid.");
  const binding = bindings.find((candidate) => candidate.seatId === payload.seatId && candidate.bindingId === payload.bindingId);
  if (!binding || binding.humanPrincipalId !== payload.humanPrincipalId || binding.signingKeyRef !== payload.signingKeyRef || (binding.missionScope !== "*" && binding.missionScope !== missionId) || sequence < binding.validFromSequence || (binding.validThroughSequence !== null && sequence > binding.validThroughSequence)) errors.push("Evidence binding is missing, stale, or wrong-seat.");
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
  if (!exact(begun.payload, ["brief", "trustedBindings", "requirements"])) return invalid("malformed", "Profile-aware begin payload is not closed.");
  const bindingRegistry = validateTrustedBindingRegistry({ schemaVersion: 1, bindings: begun.payload.trustedBindings });
  if (bindingRegistry.state === "invalid") return invalid("binding_invalid", ...bindingRegistry.errors);
  const requirements = createProfileRequirementsV1(brief);
  if (canonicalJson(begun.payload.requirements) !== canonicalJson(requirements)) return invalid("tampered_requirements", "Profile requirements are not frozen canonically.");
  const entryIds = new Set([begun.entryId]);
  const evidenceIds = new Set<string>();
  const evidence: ProfileEvidenceV1[] = [];
  const effects: RunnerAuthoritativeEffectRecord[] = [];
  const cycleIds = new Set<string>();
  const effectKeys = new Set<string>();
  let implementationAuthority: ImplementationAuthorityV1 | null = null;
  let implementationAuthorityDigest: string | null = null;
  let implementationAuthorityState: "waiting" | "authorized" | "revoked" = "waiting";
  let runtimeBindings: Schema9RuntimeBindingV1[] = [];
  let activeRuntimeBindings: Schema9RuntimeBindingV1[] = [];
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
      if (!exact(entry.payload, ["evidence"])) return invalid("malformed", `Entry ${index} evidence payload is not closed.`);
      const signed = entry.payload.evidence;
      if (!exact(signed, ["payload", "signatureBase64"])) return invalid("malformed", `Entry ${index} signed evidence is not closed.`);
      const expectedKind: EvidenceKind = entry.type === "governance.decided" ? "mission_authorization" : entry.type === "final_acceptance.recorded" ? "final_acceptance" : signed?.payload?.evidenceKind;
      const matches = requirements.filter((requirement) => requirement.evidenceKind === signed?.payload?.evidenceKind && requirement.evidenceKind === expectedKind);
      if (matches.length !== 1 ||
          evidenceIds.has(signed?.payload?.evidenceId) ||
          evidence.some(({ requirementId }) => requirementId === signed?.payload?.requirementId)) {
        return invalid("duplicate_evidence", `Entry ${index} evidence is duplicate or ambiguous.`);
      }
      const errors = verifyEvidence(signed, matches[0], bindingRegistry.value.bindings, brief.missionId, index); if (errors.length) return invalid("evidence_invalid", ...errors);
      if (entry.type === "governance.decided") { if (authorization !== "waiting" || execution !== "not-started") return invalid("sequence_invalid", "Authorization is duplicated or late."); authorization = "authorized"; }
      if (entry.type === "evidence.recorded") { if (execution !== "not-started") return invalid("ordering_invalid", "Execution gate evidence must be frozen before execution."); if (matches[0].phase !== "execution") return invalid("evidence_invalid", "Only profile execution gates may be recorded here."); }
      if (entry.type === "final_acceptance.recorded") {
        if (authorization !== "authorized" || implementationAuthorityState !== "authorized" ||
            execution !== "completed" ||
            !effects.some(({ outcome }) => outcome === "completed") ||
            finalAcceptance === "accepted") {
          return invalid("ordering_invalid", "Final acceptance requires one authoritative completed execution effect and is single-use.");
        }
        finalAcceptance = "accepted";
      }
      evidenceIds.add(signed.payload.evidenceId); evidence.push(signed.payload);
    } else if (entry.type === "implementation.authorized") {
      if (!exact(entry.payload, ["authority"])) return invalid("malformed", `Entry ${index} implementation authority payload is not closed.`);
      const payload = entry.payload.authority;
      const checked = verifySignedImplementationAuthorityV1(
        payload,
        bindingRegistry.value.bindings,
        brief.missionId,
        brief.subjectId,
        brief.revisionId,
        index,
      );
      if (checked.state === "invalid") return checked;
      if (canonicalJson(checked.value.timestamp) !== canonicalJson(payload.payload.timestamp) || canonicalJson(entry.timestamp) !== canonicalJson(checked.value.timestamp)) {
        return invalid("malformed", "Profile-aware implementation authority timestamp is malformed.");
      }
      if (authorization !== "authorized" || execution !== "not-started" || implementationAuthorityState !== "waiting" || finalAcceptance === "accepted") {
        return invalid("ordering_invalid", "Implementation authority is duplicated or late.");
      }
      implementationAuthority = checked.value;
      implementationAuthorityDigest = computeImplementationAuthorityDigest(checked.value);
      implementationAuthorityState = "authorized";
    } else if (entry.type === "implementation.authority_revoked") {
      if (!exact(entry.payload, ["revocation"])) return invalid("malformed", `Entry ${index} implementation authority revocation payload is not closed.`);
      const payload = entry.payload.revocation;
      if (implementationAuthority === null || implementationAuthorityState !== "authorized") return invalid("ordering_invalid", "Implementation authority revocation requires an active authority.");
      if (implementationAuthorityState !== "authorized" || finalAcceptance === "accepted") return invalid("ordering_invalid", "Implementation authority revocation is too late.");
      const payloadIdentity = {
        missionId: brief.missionId,
        subjectId: brief.subjectId,
        missionRevisionId: brief.revisionId,
        authorityRef: implementationAuthority.authorityRef,
        authorityDigest: implementationAuthorityDigest ?? computeImplementationAuthorityDigest(implementationAuthority),
        authoritySequence: implementationAuthority.journalSequence,
      };
      const checked = verifySignedImplementationAuthorityRevocationV1(payload, bindingRegistry.value.bindings, payloadIdentity, index);
      if (checked.state === "invalid") return checked;
      if (canonicalJson(checked.value.timestamp) !== canonicalJson(payload.payload.timestamp) || canonicalJson(entry.timestamp) !== canonicalJson(checked.value.timestamp)) {
        return invalid("malformed", "Profile-aware implementation authority revocation timestamp is malformed.");
      }
      if (execution === "completed") return invalid("ordering_invalid", "Implementation authority revocation is too late.");
      implementationAuthorityState = "revoked";
      activeRuntimeBindings = [];
    } else if (entry.type === "runtime.binding_recorded" || entry.type === "runtime.binding_superseded") {
      if (implementationAuthorityState !== "authorized") return invalid("authority_invalid", "Runtime binding requires an active implementation authority.");
      if (execution === "completed" || finalAcceptance === "accepted") return invalid("ordering_invalid", "Runtime binding is not allowed after execution completion or final acceptance.");
      const closed = exact(entry.payload, entry.type === "runtime.binding_recorded" ? ["binding", "authorization"] : ["priorBindingId", "priorBindingVersion", "binding", "authorization"]);
      if (!closed) return invalid("malformed", `Entry ${index} runtime binding payload is not closed.`);
      const checkedBinding = validateSchema9RuntimeBindingV1(entry.payload.binding);
      if (checkedBinding.state === "invalid") return invalid(checkedBinding.code, ...checkedBinding.errors);
      const wrapper = checkedBinding.value;
      const priorBindingId = entry.type === "runtime.binding_recorded" ? null : entry.payload.priorBindingId;
      const priorBindingVersion = entry.type === "runtime.binding_recorded" ? null : entry.payload.priorBindingVersion;
      if (priorBindingId === null && priorBindingVersion !== null || priorBindingId !== null && priorBindingVersion === null) return invalid("malformed", "Runtime binding payload is missing a prior binding identity.");
      const checkedAuthorization = verifySignedSchema9RuntimeBindingAuthorizationV1(
        entry.payload.authorization,
        wrapper,
        {
          missionId: brief.missionId,
          subjectId: brief.subjectId,
          missionRevisionId: brief.revisionId,
          trustedBindings: bindingRegistry.value.bindings,
          implementationAuthority: implementationAuthority!,
          lastSequence: index - 1,
        },
        priorBindingId,
        priorBindingVersion,
      );
      if (checkedAuthorization.state === "invalid") return checkedAuthorization;
      if (canonicalJson(checkedAuthorization.value.timestamp) !== canonicalJson(entry.payload.authorization.payload.timestamp) ||
          canonicalJson(entry.timestamp) !== canonicalJson(checkedAuthorization.value.timestamp)) {
        return invalid("malformed", "Profile-aware runtime binding timestamp is malformed.");
      }
      const sameBindingId = runtimeBindings.some((candidate) => candidate.binding.bindingId === wrapper.binding.bindingId);
      const activeSeatMatch = activeRuntimeBindings.some((candidate) => candidate.binding.seatId === wrapper.binding.seatId);
      const activeMatches = activeRuntimeBindings.filter((candidate) => candidate.binding.bindingId === priorBindingId && candidate.binding.bindingVersion === priorBindingVersion);
      if (wrapper.binding.seatId !== "may") return invalid("binding_invalid", "Runtime binding seat must be may.");
      if (brief.participants.some(({ seatId }) => seatId === wrapper.binding.reasoningRuntimeId || seatId === wrapper.binding.toolExecutorId)) return invalid("seat_mismatch", "Runtime binding identities cannot be mission participants.");
      if (!brief.participants.some(({ seatId }) => seatId === wrapper.binding.seatId)) return invalid("seat_mismatch", "Runtime binding seat is not a mission participant.");
      if (wrapper.binding.coulsonAuthorizationRef !== checkedAuthorization.value.authorizationId) return invalid("binding_invalid", "Runtime binding authorization id must match the binding's Coulson authorization reference.");
      if (entry.type === "runtime.binding_recorded") {
        if (implementationAuthorityState !== "authorized") return invalid("authority_invalid", "Runtime binding can only be recorded while authority is active.");
        if (wrapper.binding.bindingVersion !== 1 || wrapper.binding.lifecycleState !== "active" || wrapper.binding.activeThroughSequence !== null) {
          return invalid("binding_invalid", "Runtime binding must be the initial active binding version 1.");
        }
        if (sameBindingId) return invalid("binding_ambiguous", "Runtime binding identity is duplicated.");
        if (activeSeatMatch) return invalid("binding_ambiguous", "Runtime binding seat already has an active binding.");
        runtimeBindings.push(copySchema9RuntimeBinding(wrapper));
        activeRuntimeBindings.push(copySchema9RuntimeBinding(wrapper));
      } else {
        if (priorBindingId === null || priorBindingVersion === null) return invalid("malformed", "Runtime binding supersession is missing prior binding identity.");
        if (activeMatches.length !== 1) return invalid("binding_invalid", "Runtime binding replacement must supersede exactly one active binding.");
        const prior = activeRuntimeBindings.filter((candidate) => candidate.binding.bindingId === priorBindingId && candidate.binding.bindingVersion === priorBindingVersion);
        if (prior.length !== 1) return invalid("binding_ambiguous", "Runtime binding supersession requires exactly one active prior binding.");
        if (wrapper.binding.bindingId !== prior[0].binding.bindingId ||
            wrapper.binding.bindingVersion !== prior[0].binding.bindingVersion + 1 ||
            wrapper.binding.seatId !== prior[0].binding.seatId ||
            wrapper.binding.reasoningRuntimeId !== prior[0].binding.reasoningRuntimeId ||
            wrapper.binding.toolExecutorId !== prior[0].binding.toolExecutorId) {
          return invalid("binding_invalid", "Runtime binding replacement must atomically increment the same active binding.");
        }
        if (wrapper.binding.lifecycleState !== "active" || wrapper.binding.activeThroughSequence !== null) {
          return invalid("binding_invalid", "Runtime binding replacement must be active and unresolved.");
        }
        activeRuntimeBindings = activeRuntimeBindings.filter((candidate) => !(candidate.binding.bindingId === prior[0].binding.bindingId && candidate.binding.bindingVersion === prior[0].binding.bindingVersion));
        runtimeBindings.push(copySchema9RuntimeBinding(wrapper));
        activeRuntimeBindings.push(copySchema9RuntimeBinding(wrapper));
      }
    } else if (entry.type === "execution.transition") {
      if (!exact(entry.payload, ["from", "to"]) || !["not-started", "running"].includes(entry.payload.from as string) || !["running", "completed"].includes(entry.payload.to as string)) return invalid("malformed", `Entry ${index} execution payload is not closed.`);
      if (authorization !== "authorized") return invalid("ordering_invalid", "Execution requires authorization and all frozen gates.");
      const pending = requirements.filter((requirement) => requirement.phase === "execution" && !evidence.some((record) => record.requirementId === requirement.requirementId));
      if (pending.length > 0) return invalid("gate_missing", "Execution cannot start before frozen specialist gates are satisfied.");
      if (entry.payload.to === "completed" &&
          !effects.some(({ outcome }) => outcome === "completed")) {
        return invalid("ordering_invalid", "Execution completion requires an authoritative completed effect.");
      }
      if (entry.payload.from !== execution || !((execution === "not-started" && entry.payload.to === "running") || (execution === "running" && entry.payload.to === "completed"))) return invalid("ordering_invalid", "Execution transition is invalid.");
      execution = entry.payload.to;
    } else if (entry.type === "execution.effect_recorded") {
      if (!exact(entry.payload, ["effect"])) return invalid("malformed", `Entry ${index} effect payload is not closed.`);
      const checkedEffect = validateRunnerExecutionEffectPayload(entry.payload.effect);
      if (checkedEffect.state === "invalid") return invalid("malformed", ...checkedEffect.errors);
      const effect = checkedEffect.value;
      if (authorization !== "authorized" || execution !== "running") return invalid("ordering_invalid", "Execution effects require an authorized running mission.");
      const pending = requirements.filter((requirement) => requirement.phase === "execution" && !evidence.some((record) => record.requirementId === requirement.requirementId));
      if (pending.length > 0) return invalid("gate_missing", "Execution effects require all frozen specialist gates.");
      if (effects.some(({ outcome }) => outcome === "uncertain")) return invalid("ordering_invalid", "Execution recovery requires a separate authorized contract.");
      if (effect.subjectId !== brief.subjectId ||
          effect.revisionId !== brief.revisionId ||
          effect.evaluatedThroughSequence !== index - 1) {
        return invalid("mission_mismatch", `Entry ${index} effect identity or sequence is stale.`);
      }
      if (cycleIds.has(effect.cycleId) || effectKeys.has(effect.effectKey)) {
        return invalid("duplicate_event", `Entry ${index} duplicates an execution cycle or effect.`);
      }
      const record: RunnerAuthoritativeEffectRecord = {
        ...effect,
        entryId: entry.entryId,
        missionId: entry.missionId,
        journalSequence: entry.sequence,
        timestamp: entry.timestamp,
      };
      const checkedRecord = validateRunnerAuthoritativeEffectRecord(record);
      if (checkedRecord.state === "invalid") return invalid("malformed", ...checkedRecord.errors);
      cycleIds.add(effect.cycleId);
      effectKeys.add(effect.effectKey);
      effects.push(checkedRecord.value);
      if (effect.outcome === "completed") execution = "completed";
    } else return invalid("unsupported_event", `Entry ${index} event type is unsupported.`);
  }
  const pendingExecution = requirements.some((requirement) => requirement.phase === "execution" && !evidence.some((record) => record.requirementId === requirement.requirementId));
  const uncertain = effects.some(({ outcome }) => outcome === "uncertain");
  return valid({
    schemaVersion: 9,
    missionId: brief.missionId,
    brief: { ...brief },
    requirements: [...requirements],
    evidence: evidence.map((entry) => ({ ...entry, timestamp: { ...entry.timestamp } })),
    implementationAuthority: implementationAuthority === null ? null : copyAuthority(implementationAuthority),
    implementationAuthorityDigest,
    implementationAuthorityState,
    runtimeBindings: runtimeBindings.map((binding) => copySchema9RuntimeBinding(binding)),
    activeRuntimeBindings: activeRuntimeBindings.map((binding) => copySchema9RuntimeBinding(binding)),
    authorization,
    execution,
    readiness: { execute: uncertain ? "blocked" : authorization === "authorized" && !pendingExecution ? "ready" : "waiting", accept: execution === "completed" && finalAcceptance === "waiting" ? "waiting" : finalAcceptance === "accepted" ? "ready" : "blocked" },
    effects: effects.map((effect) => ({ ...effect, timestamp: { ...effect.timestamp } })),
    finalAcceptance,
    lastSequence: entries.length - 1,
  });
}

export function profileIsNotWeakenedV1(selected: MissionProfileId, required: MissionProfileId): boolean { return isProfileAtLeastAsStrictV1(selected, required); }
