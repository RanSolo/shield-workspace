import { createHash, createPublicKey, verify } from "node:crypto";

export const SUPERVISED_JOURNAL_SCHEMA_VERSION = 2 as const;
export const SUPERVISED_BRIEF_SCHEMA_VERSION = 1 as const;
export const HUMAN_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const TRUSTED_BINDING_SCHEMA_VERSION = 1 as const;
export const HUMAN_SEATS = ["coulson", "fitz", "simmons"] as const;
export const EVIDENCE_KINDS = [
  "mission_authorization",
  "technical_review",
  "product_domain_review",
] as const;
export const EVIDENCE_DECISIONS = [
  "approved",
  "changes_requested",
  "rejected",
  "paused",
  "resumed",
  "cancelled",
] as const;

export type HumanSeat = (typeof HUMAN_SEATS)[number];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type EvidenceDecision = (typeof EVIDENCE_DECISIONS)[number];
export type GovernanceState = "proposed" | "approved" | "paused" | "cancelled";
export type ExecutionStatus = "not-started" | "running" | "completed";
export type RequirementStatus = "pending" | "satisfied" | "blocked";
export type ReadinessState = "ready" | "waiting" | "blocked" | "invalid";

export interface EvidenceTimestamp {
  value: string;
  provenance: "humanRecorded" | "hostTrusted";
}

export interface MissionParticipant {
  seatId: string;
}

export interface MissionModeActivation {
  modeId: string;
  modeVersion: string;
  seatId: string;
  activationSource: string;
}

export interface MissionRiskFlags {
  production: boolean;
  destructive: boolean;
  migration: boolean;
  credentialsOrSecurity: boolean;
  externalCommunication: boolean;
  merge: boolean;
  deploy: boolean;
  release: boolean;
  hillHighRisk: boolean;
}

export interface SupervisedMissionBriefContent {
  schemaVersion: 1;
  missionId: string;
  objective: string;
  subjectId: string;
  riskFlags: MissionRiskFlags;
  participants: MissionParticipant[];
  activatedModes: MissionModeActivation[];
  requireSimmons: boolean;
  createdAt: EvidenceTimestamp;
}

export interface SupervisedMissionBrief extends SupervisedMissionBriefContent {
  revisionId: string;
}

export interface TrustedHumanBinding {
  schemaVersion: 1;
  bindingId: string;
  humanPrincipalId: string;
  seatId: HumanSeat;
  missionScope: string;
  signingKeyRef: string;
  publicKeySpkiBase64: string;
  validFromSequence: number;
  validThroughSequence: number | null;
  attestedBy: string;
  provenanceRef: string;
}

export interface TrustedBindingRegistry {
  schemaVersion: 1;
  bindings: TrustedHumanBinding[];
}

export interface EvidenceRequirement {
  schemaVersion: 1;
  requirementId: string;
  missionId: string;
  subjectKind: "mission_plan";
  subjectId: string;
  revisionId: string;
  requiredSeatId: HumanSeat;
  evidenceKind: EvidenceKind;
  allowedDecisions: EvidenceDecision[];
  createdAtSequence: number;
  supersedesRequirementId: null;
}

export interface HumanEvidencePayload {
  schemaVersion: 1;
  evidenceId: string;
  requirementId: string;
  missionId: string;
  subjectKind: "mission_plan";
  subjectId: string;
  revisionId: string;
  seatId: HumanSeat;
  evidenceKind: EvidenceKind;
  decision: EvidenceDecision;
  humanPrincipalId: string;
  bindingId: string;
  signingKeyRef: string;
  sourceRef: string;
  timestamp: EvidenceTimestamp;
  journalSequence: number;
}

export interface SignedHumanEvidence {
  payload: HumanEvidencePayload;
  signatureBase64: string;
}

export type SupervisedJournalEntry =
  | {
    schemaVersion: 2;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "mission.begun";
    timestamp: EvidenceTimestamp;
    payload: {
      brief: SupervisedMissionBrief;
      trustedBindings: TrustedHumanBinding[];
      requirements: EvidenceRequirement[];
    };
  }
  | {
    schemaVersion: 2;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "governance.decided";
    timestamp: EvidenceTimestamp;
    payload: {
      decision: "approve" | "pause" | "resume" | "cancel";
      resumeState: "proposed" | "approved" | null;
      evidence: SignedHumanEvidence;
    };
  }
  | {
    schemaVersion: 2;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "execution.transition";
    timestamp: EvidenceTimestamp;
    payload: { from: ExecutionStatus; to: ExecutionStatus; reason: string };
  }
  | {
    schemaVersion: 2;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "evidence.recorded";
    timestamp: EvidenceTimestamp;
    payload: { evidence: SignedHumanEvidence };
  };

export interface RequirementProjection extends EvidenceRequirement {
  status: RequirementStatus;
  latestEvidenceId: string | null;
  reason: string;
}

export interface ReadinessProjection {
  actionId: "execute" | "accept";
  state: ReadinessState;
  requirementStatuses: RequirementProjection[];
  reasons: string[];
  evaluatedThroughSequence: number;
}

export interface SupervisedMissionProjection {
  journalSchemaVersion: 2;
  missionId: string;
  brief: SupervisedMissionBrief;
  governance: { state: GovernanceState };
  execution: { status: ExecutionStatus };
  readiness: {
    execute: ReadinessProjection;
    accept: ReadinessProjection;
  };
  communication: { state: "not-configured" };
  trustedBindings: TrustedHumanBinding[];
  requirements: EvidenceRequirement[];
  evidence: HumanEvidencePayload[];
  lastSequence: number;
  lastTimestamp: EvidenceTimestamp;
}

export type ContractResult<T> =
  | { state: "valid"; value: T }
  | { state: "invalid"; code: string; errors: string[] };

const invalid = <T = never,>(code: string, ...errors: string[]): ContractResult<T> => ({
  state: "invalid",
  code,
  errors: errors.flat(),
});
const valid = <T,>(value: T): ContractResult<T> => ({ state: "valid", value });
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const KEY_REF = /^ed25519:sha256:[A-Za-z0-9_-]{43}$/;
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;
const RISK_FIELDS = [
  "production", "destructive", "migration", "credentialsOrSecurity",
  "externalCommunication", "merge", "deploy", "release", "hillHighRisk",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactFields(value: unknown, fields: readonly string[], label: string): string[] {
  if (!isPlainObject(value)) return [`${label} must be a plain object.`];
  const allowed = new Set(fields);
  const errors: string[] = [];
  for (const field of fields) if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  for (const field of Object.keys(value)) if (!allowed.has(field)) errors.push(`${label} has unknown field: ${field}.`);
  return errors;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function timestampErrors(value: unknown, label: string): string[] {
  const errors = exactFields(value, ["value", "provenance"], label);
  if (errors.length > 0 || !isPlainObject(value)) return errors;
  if (typeof value.value !== "string" || !ISO_UTC.test(value.value) || !Number.isFinite(Date.parse(value.value))) {
    errors.push(`${label}.value must be a valid ISO 8601 UTC timestamp.`);
  }
  if (value.provenance !== "humanRecorded" && value.provenance !== "hostTrusted") {
    errors.push(`${label}.provenance is unsupported.`);
  }
  return errors;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function computeMissionRevisionId(content: SupervisedMissionBriefContent): string {
  return `sha256:${createHash("sha256").update(canonicalJson(content)).digest("base64url")}`;
}

export function computeEd25519SigningKeyRef(publicKeySpkiBase64: string): string {
  const bytes = Buffer.from(publicKeySpkiBase64, "base64");
  return `ed25519:sha256:${createHash("sha256").update(bytes).digest("base64url")}`;
}

export function createSupervisedMissionBrief(content: SupervisedMissionBriefContent): SupervisedMissionBrief {
  return { ...content, revisionId: computeMissionRevisionId(content) };
}

function briefContent(brief: SupervisedMissionBrief): SupervisedMissionBriefContent {
  const { revisionId: _revisionId, ...content } = brief;
  return content;
}

export function validateSupervisedMissionBrief(input: unknown): ContractResult<SupervisedMissionBrief> {
  const fields = [
    "schemaVersion", "missionId", "objective", "subjectId", "revisionId", "riskFlags",
    "participants", "activatedModes", "requireSimmons", "createdAt",
  ];
  const errors = exactFields(input, fields, "Mission brief");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed", ...errors);
  if (input.schemaVersion !== 1) errors.push("Mission brief schemaVersion is unsupported.");
  for (const field of ["missionId", "subjectId", "revisionId"]) {
    if (!identifier(input[field])) errors.push(`Mission brief ${field} is invalid.`);
  }
  if (!nonEmpty(input.objective)) errors.push("Mission brief objective must be non-empty.");
  errors.push(...timestampErrors(input.createdAt, "Mission brief createdAt"));
  const riskErrors = exactFields(input.riskFlags, RISK_FIELDS, "Mission brief riskFlags");
  errors.push(...riskErrors);
  if (riskErrors.length === 0 && isPlainObject(input.riskFlags)) {
    for (const field of RISK_FIELDS) if (typeof input.riskFlags[field] !== "boolean") errors.push(`riskFlags.${field} must be boolean.`);
  }
  if (!Array.isArray(input.participants) || input.participants.length === 0) {
    errors.push("Mission brief participants must be a non-empty array.");
  } else {
    const seats = new Set<string>();
    input.participants.forEach((participant, index) => {
      const nested = exactFields(participant, ["seatId"], `participants[${index}]`);
      errors.push(...nested);
      if (nested.length === 0 && isPlainObject(participant)) {
        if (!identifier(participant.seatId)) errors.push(`participants[${index}].seatId is invalid.`);
        else if (seats.has(participant.seatId)) errors.push(`participants duplicates ${participant.seatId}.`);
        else seats.add(participant.seatId);
      }
    });
    for (const required of ["coulson", "fitz"]) if (!seats.has(required)) errors.push(`Mission brief requires participant: ${required}.`);
    if (input.requireSimmons === true && !seats.has("simmons")) errors.push("Simmons must be a participant when required.");
  }
  if (!Array.isArray(input.activatedModes)) errors.push("Mission brief activatedModes must be an array.");
  else input.activatedModes.forEach((activation, index) => {
    const nested = exactFields(activation, ["modeId", "modeVersion", "seatId", "activationSource"], `activatedModes[${index}]`);
    errors.push(...nested);
    if (nested.length === 0 && isPlainObject(activation)) {
      for (const field of ["modeId", "modeVersion", "seatId", "activationSource"]) {
        if (!identifier(activation[field])) errors.push(`activatedModes[${index}].${field} is invalid.`);
      }
    }
  });
  if (typeof input.requireSimmons !== "boolean") errors.push("Mission brief requireSimmons must be boolean.");
  if (errors.length > 0) return invalid("malformed", ...errors);
  const brief = input as unknown as SupervisedMissionBrief;
  if (brief.revisionId !== computeMissionRevisionId(briefContent(brief))) {
    return invalid("revision_mismatch", "Mission brief revisionId does not match its canonical content.");
  }
  return valid(brief);
}

export function validateTrustedBindingRegistry(input: unknown): ContractResult<TrustedBindingRegistry> {
  const errors = exactFields(input, ["schemaVersion", "bindings"], "Trusted binding registry");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed", ...errors);
  if (input.schemaVersion !== 1) errors.push("Trusted binding registry schemaVersion is unsupported.");
  if (!Array.isArray(input.bindings) || input.bindings.length === 0) errors.push("Trusted binding registry bindings must be non-empty.");
  const identities = new Set<string>();
  const seats = new Set<string>();
  if (Array.isArray(input.bindings)) input.bindings.forEach((binding, index) => {
    const fields = [
      "schemaVersion", "bindingId", "humanPrincipalId", "seatId", "missionScope",
      "signingKeyRef", "publicKeySpkiBase64", "validFromSequence", "validThroughSequence",
      "attestedBy", "provenanceRef",
    ];
    const nested = exactFields(binding, fields, `bindings[${index}]`);
    errors.push(...nested);
    if (nested.length > 0 || !isPlainObject(binding)) return;
    if (binding.schemaVersion !== 1) errors.push(`bindings[${index}].schemaVersion is unsupported.`);
    for (const field of ["bindingId", "humanPrincipalId", "attestedBy", "provenanceRef"]) {
      if (!identifier(binding[field])) errors.push(`bindings[${index}].${field} is invalid.`);
    }
    if (binding.missionScope !== "*" && !identifier(binding.missionScope)) errors.push(`bindings[${index}].missionScope is invalid.`);
    if (!HUMAN_SEATS.includes(binding.seatId as HumanSeat)) errors.push(`bindings[${index}].seatId is unsupported.`);
    if (typeof binding.signingKeyRef !== "string" || !KEY_REF.test(binding.signingKeyRef)) errors.push(`bindings[${index}].signingKeyRef is invalid.`);
    if (typeof binding.publicKeySpkiBase64 !== "string") errors.push(`bindings[${index}].publicKeySpkiBase64 is invalid.`);
    else {
      try {
        const key = createPublicKey({ key: Buffer.from(binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
        if (key.asymmetricKeyType !== "ed25519") errors.push(`bindings[${index}] key must be Ed25519.`);
        if (computeEd25519SigningKeyRef(binding.publicKeySpkiBase64) !== binding.signingKeyRef) errors.push(`bindings[${index}] signingKeyRef does not match the public key.`);
      } catch {
        errors.push(`bindings[${index}] public key is malformed.`);
      }
    }
    if (!Number.isInteger(binding.validFromSequence) || (binding.validFromSequence as number) < 0) errors.push(`bindings[${index}].validFromSequence is invalid.`);
    if (binding.validThroughSequence !== null && (!Number.isInteger(binding.validThroughSequence) || (binding.validThroughSequence as number) < 0)) errors.push(`bindings[${index}].validThroughSequence is invalid.`);
    const identity = `${String(binding.bindingId)}\0${String(binding.signingKeyRef)}`;
    if (identities.has(identity)) errors.push(`bindings[${index}] duplicates a binding identity.`);
    identities.add(identity);
    if (seats.has(String(binding.seatId))) errors.push(`bindings duplicates seatId: ${String(binding.seatId)}.`);
    seats.add(String(binding.seatId));
  });
  return errors.length > 0 ? invalid("malformed", ...errors) : valid(input as unknown as TrustedBindingRegistry);
}

function requirementId(missionId: string, revisionId: string, kind: EvidenceKind): string {
  return `req:${missionId}:${revisionId}:${kind}`;
}

export function createEvidenceRequirements(brief: SupervisedMissionBrief): EvidenceRequirement[] {
  const base = {
    schemaVersion: 1 as const,
    missionId: brief.missionId,
    subjectKind: "mission_plan" as const,
    subjectId: brief.subjectId,
    revisionId: brief.revisionId,
    createdAtSequence: 0,
    supersedesRequirementId: null,
  };
  const requirements: EvidenceRequirement[] = [
    {
      ...base,
      requirementId: requirementId(brief.missionId, brief.revisionId, "mission_authorization"),
      requiredSeatId: "coulson",
      evidenceKind: "mission_authorization",
      allowedDecisions: ["approved", "paused", "resumed", "cancelled"],
    },
    {
      ...base,
      requirementId: requirementId(brief.missionId, brief.revisionId, "technical_review"),
      requiredSeatId: "fitz",
      evidenceKind: "technical_review",
      allowedDecisions: ["approved", "changes_requested", "rejected"],
    },
  ];
  if (brief.requireSimmons) requirements.push({
    ...base,
    requirementId: requirementId(brief.missionId, brief.revisionId, "product_domain_review"),
    requiredSeatId: "simmons",
    evidenceKind: "product_domain_review",
    allowedDecisions: ["approved", "changes_requested", "rejected"],
  });
  return requirements;
}

export function validateRepositoryBindings(
  registry: TrustedBindingRegistry,
  configured: readonly { seatId: string; bindingRef: string }[],
  missionId: string,
  requireSimmons: boolean,
): ContractResult<TrustedHumanBinding[]> {
  const requiredSeats: HumanSeat[] = requireSimmons ? ["coulson", "fitz", "simmons"] : ["coulson", "fitz"];
  const selected: TrustedHumanBinding[] = [];
  for (const seatId of requiredSeats) {
    const configMatches = configured.filter((entry) => entry.seatId === seatId);
    if (configMatches.length !== 1) return invalid("binding_ambiguous", `Configured binding for ${seatId} is missing or ambiguous.`);
    const bindings = registry.bindings.filter((entry) => entry.seatId === seatId && entry.signingKeyRef === configMatches[0].bindingRef);
    if (bindings.length !== 1) return invalid("binding_missing", `Trusted Ed25519 binding for ${seatId} is missing or ambiguous.`);
    const binding = bindings[0];
    if (binding.missionScope !== "*" && binding.missionScope !== missionId) return invalid("binding_invalid", `Binding for ${seatId} does not cover this mission.`);
    selected.push(binding);
  }
  return valid(selected);
}

function validateEvidencePayload(input: unknown): ContractResult<HumanEvidencePayload> {
  const fields = [
    "schemaVersion", "evidenceId", "requirementId", "missionId", "subjectKind",
    "subjectId", "revisionId", "seatId", "evidenceKind", "decision",
    "humanPrincipalId", "bindingId", "signingKeyRef", "sourceRef", "timestamp",
    "journalSequence",
  ];
  const errors = exactFields(input, fields, "Evidence payload");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed", ...errors);
  if (input.schemaVersion !== 1) errors.push("Evidence payload schemaVersion is unsupported.");
  for (const field of ["evidenceId", "requirementId", "missionId", "subjectId", "revisionId", "humanPrincipalId", "bindingId", "sourceRef"]) {
    if (!identifier(input[field])) errors.push(`Evidence payload ${field} is invalid.`);
  }
  if (input.subjectKind !== "mission_plan") errors.push("Evidence payload subjectKind is unsupported.");
  if (!HUMAN_SEATS.includes(input.seatId as HumanSeat)) errors.push("Evidence payload seatId is unsupported.");
  if (!EVIDENCE_KINDS.includes(input.evidenceKind as EvidenceKind)) errors.push("Evidence payload evidenceKind is unsupported.");
  if (!EVIDENCE_DECISIONS.includes(input.decision as EvidenceDecision)) errors.push("Evidence payload decision is unsupported.");
  if (typeof input.signingKeyRef !== "string" || !KEY_REF.test(input.signingKeyRef)) errors.push("Evidence payload signingKeyRef is invalid.");
  if (!Number.isInteger(input.journalSequence) || (input.journalSequence as number) < 1) errors.push("Evidence payload journalSequence is invalid.");
  errors.push(...timestampErrors(input.timestamp, "Evidence payload timestamp"));
  return errors.length > 0 ? invalid("malformed", ...errors) : valid(input as unknown as HumanEvidencePayload);
}

export function verifySignedHumanEvidence(
  envelope: unknown,
  projection: Pick<SupervisedMissionProjection, "missionId" | "brief" | "requirements" | "trustedBindings">,
  expectedSequence: number,
): ContractResult<HumanEvidencePayload> {
  const envelopeErrors = exactFields(envelope, ["payload", "signatureBase64"], "Signed evidence");
  if (envelopeErrors.length > 0 || !isPlainObject(envelope)) return invalid("malformed", ...envelopeErrors);
  const payloadResult = validateEvidencePayload(envelope.payload);
  if (payloadResult.state === "invalid") return payloadResult;
  const payload = payloadResult.value;
  if (payload.missionId !== projection.missionId) return invalid("mission_mismatch", "Evidence missionId does not match.");
  if (payload.subjectId !== projection.brief.subjectId) return invalid("subject_mismatch", "Evidence subjectId does not match.");
  if (payload.revisionId !== projection.brief.revisionId) return invalid("revision_mismatch", "Evidence revisionId is stale or mismatched.");
  if (payload.journalSequence !== expectedSequence) return invalid("sequence_invalid", "Evidence journalSequence does not match the next journal sequence.");
  const requirements = projection.requirements.filter((entry) => entry.requirementId === payload.requirementId);
  if (requirements.length !== 1) return invalid("missing_requirement", "Evidence requirement is missing or ambiguous.");
  const requirement = requirements[0];
  if (requirement.requiredSeatId !== payload.seatId || requirement.evidenceKind !== payload.evidenceKind) return invalid("seat_mismatch", "Evidence seat or kind does not match its requirement.");
  if (!requirement.allowedDecisions.includes(payload.decision)) return invalid("unknown_verdict", "Evidence decision is not allowed by its requirement.");
  const bindings = projection.trustedBindings.filter((entry) => entry.bindingId === payload.bindingId && entry.seatId === payload.seatId);
  if (bindings.length !== 1) return invalid("binding_missing", "Evidence binding is missing or ambiguous.");
  const binding = bindings[0];
  if (binding.humanPrincipalId !== payload.humanPrincipalId || binding.signingKeyRef !== payload.signingKeyRef) return invalid("binding_invalid", "Evidence principal or signing key does not match its binding.");
  if (binding.missionScope !== "*" && binding.missionScope !== payload.missionId) return invalid("binding_invalid", "Evidence binding does not cover this mission.");
  if (expectedSequence < binding.validFromSequence || (binding.validThroughSequence !== null && expectedSequence > binding.validThroughSequence)) return invalid("binding_invalid", "Evidence binding is not valid at this journal sequence.");
  if (typeof envelope.signatureBase64 !== "string" || envelope.signatureBase64.length === 0) return invalid("provenance_missing", "Evidence signature is missing.");
  try {
    const publicKey = createPublicKey({ key: Buffer.from(binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    const signature = Buffer.from(envelope.signatureBase64, "base64");
    if (!verify(null, Buffer.from(canonicalJson(payload)), publicKey, signature)) return invalid("binding_invalid", "Evidence signature verification failed.");
  } catch {
    return invalid("binding_invalid", "Evidence signature or public key is malformed.");
  }
  return valid(payload);
}

function requirementProjection(requirement: EvidenceRequirement, evidence: HumanEvidencePayload[]): RequirementProjection {
  const relevant = evidence.filter((record) => record.requirementId === requirement.requirementId &&
    (record.decision === "approved" || record.decision === "changes_requested" || record.decision === "rejected"));
  const latest = relevant.at(-1);
  if (latest === undefined) return { ...requirement, status: "pending", latestEvidenceId: null, reason: `Waiting for ${requirement.requiredSeatId}.` };
  if (latest.decision === "approved") return { ...requirement, status: "satisfied", latestEvidenceId: latest.evidenceId, reason: `${requirement.requiredSeatId} approved the exact revision.` };
  return { ...requirement, status: "blocked", latestEvidenceId: latest.evidenceId, reason: `${requirement.requiredSeatId} returned ${latest.decision}.` };
}

function readiness(actionId: "execute" | "accept", requirements: RequirementProjection[], sequence: number): ReadinessProjection {
  const applicable = requirements.filter((entry) => actionId === "execute"
    ? entry.evidenceKind === "mission_authorization"
    : entry.evidenceKind === "technical_review" || entry.evidenceKind === "product_domain_review");
  if (applicable.length === 0) return { actionId, state: "invalid", requirementStatuses: [], reasons: ["requirements_undefined"], evaluatedThroughSequence: sequence };
  const state: ReadinessState = applicable.some(({ status }) => status === "blocked")
    ? "blocked"
    : applicable.some(({ status }) => status === "pending") ? "waiting" : "ready";
  return {
    actionId,
    state,
    requirementStatuses: applicable,
    reasons: applicable.filter(({ status }) => status !== "satisfied").map(({ reason }) => reason),
    evaluatedThroughSequence: sequence,
  };
}

function entryTimestamp(entry: SupervisedJournalEntry): EvidenceTimestamp {
  return entry.timestamp;
}

function transitionGovernance(state: GovernanceState, decision: string, resumeState: unknown): GovernanceState | null {
  if (decision === "approve" && state === "proposed") return "approved";
  if (decision === "pause" && (state === "proposed" || state === "approved")) return "paused";
  if (decision === "resume" && state === "paused" && (resumeState === "proposed" || resumeState === "approved")) return resumeState;
  if (decision === "cancel" && state !== "cancelled") return "cancelled";
  return null;
}

function evidenceDecisionForGovernance(decision: string): EvidenceDecision {
  return decision === "approve" ? "approved" : decision === "pause" ? "paused" : decision === "resume" ? "resumed" : "cancelled";
}

export function createMissionBegunEntry(
  brief: SupervisedMissionBrief,
  bindings: TrustedHumanBinding[],
): SupervisedJournalEntry {
  return {
    schemaVersion: 2,
    entryId: `entry:${brief.missionId}:0`,
    missionId: brief.missionId,
    sequence: 0,
    type: "mission.begun",
    timestamp: brief.createdAt,
    payload: { brief, trustedBindings: bindings, requirements: createEvidenceRequirements(brief) },
  };
}

export function replaySupervisedMissionJournal(entries: unknown): ContractResult<SupervisedMissionProjection> {
  if (!Array.isArray(entries) || entries.length === 0) return invalid("malformed", "Supervised journal must contain entries.");
  if (!isPlainObject(entries[0]) || entries[0].type !== "mission.begun") return invalid("malformed", "First v2 entry must be mission.begun.");
  const begun = entries[0];
  const begunErrors = exactFields(begun, ["schemaVersion", "entryId", "missionId", "sequence", "type", "timestamp", "payload"], "Entry 0");
  if (begunErrors.length > 0 || begun.schemaVersion !== 2 || begun.sequence !== 0 || !isPlainObject(begun.payload)) return invalid("malformed", ...begunErrors, "Entry 0 is invalid.");
  const payloadErrors = exactFields(begun.payload, ["brief", "trustedBindings", "requirements"], "mission.begun payload");
  if (payloadErrors.length > 0) return invalid("malformed", ...payloadErrors);
  const briefResult = validateSupervisedMissionBrief(begun.payload.brief);
  if (briefResult.state === "invalid") return briefResult;
  if (!identifier(begun.entryId) || begun.entryId !== `entry:${briefResult.value.missionId}:0`) {
    return invalid("sequence_invalid", "Entry 0 entryId is invalid or does not match the mission.");
  }
  const registryResult = validateTrustedBindingRegistry({ schemaVersion: 1, bindings: begun.payload.trustedBindings });
  if (registryResult.state === "invalid") return registryResult;
  const expectedRequirements = createEvidenceRequirements(briefResult.value);
  if (canonicalJson(begun.payload.requirements) !== canonicalJson(expectedRequirements)) return invalid("malformed", "mission.begun requirements are not canonical.");
  if (begun.missionId !== briefResult.value.missionId) return invalid("mission_mismatch", "Entry 0 missionId does not match the brief.");
  const firstTimeErrors = timestampErrors(begun.timestamp, "Entry 0 timestamp");
  if (firstTimeErrors.length > 0 || canonicalJson(begun.timestamp) !== canonicalJson(briefResult.value.createdAt)) return invalid("malformed", ...firstTimeErrors, "Entry 0 timestamp must match the brief.");

  let governance: GovernanceState = "proposed";
  let execution: ExecutionStatus = "not-started";
  const evidence: HumanEvidencePayload[] = [];
  const evidenceIds = new Set<string>();
  const entryIds = new Set<string>([String(begun.entryId)]);
  let previousTime = Date.parse((begun.timestamp as unknown as EvidenceTimestamp).value);
  const baseProjection = (sequence: number): SupervisedMissionProjection => {
    const projected = expectedRequirements.map((requirement) => requirementProjection(requirement, evidence));
    return {
      journalSchemaVersion: 2,
      missionId: briefResult.value.missionId,
      brief: briefResult.value,
      governance: { state: governance },
      execution: { status: execution },
      readiness: { execute: readiness("execute", projected, sequence), accept: readiness("accept", projected, sequence) },
      communication: { state: "not-configured" },
      trustedBindings: registryResult.value.bindings,
      requirements: expectedRequirements,
      evidence: [...evidence],
      lastSequence: sequence,
      lastTimestamp: entryTimestamp(entries[sequence] as SupervisedJournalEntry),
    };
  };

  for (let index = 1; index < entries.length; index += 1) {
    const input = entries[index];
    const structural = exactFields(input, ["schemaVersion", "entryId", "missionId", "sequence", "type", "timestamp", "payload"], `Entry ${index}`);
    if (structural.length > 0 || !isPlainObject(input)) return invalid("malformed", ...structural);
    if (input.schemaVersion !== 2) return invalid("unsupported_schema", `Entry ${index} schemaVersion is unsupported.`);
    if (input.sequence !== index) return invalid("sequence_invalid", `Entry ${index} sequence must be ${index}.`);
    if (input.missionId !== briefResult.value.missionId) return invalid("mission_mismatch", `Entry ${index} missionId does not match.`);
    if (!identifier(input.entryId) || entryIds.has(input.entryId)) return invalid("sequence_invalid", `Entry ${index} entryId is invalid or duplicated.`);
    entryIds.add(input.entryId);
    const timeErrors = timestampErrors(input.timestamp, `Entry ${index} timestamp`);
    if (timeErrors.length > 0 || !isPlainObject(input.timestamp)) return invalid("malformed", ...timeErrors);
    const time = Date.parse(input.timestamp.value as string);
    if (time < previousTime) return invalid("sequence_invalid", `Entry ${index} timestamp moves backward.`);
    previousTime = time;
    if (!isPlainObject(input.payload)) return invalid("malformed", `Entry ${index} payload must be a plain object.`);
    const current = baseProjection(index - 1);

    if (input.type === "governance.decided") {
      const nested = exactFields(input.payload, ["decision", "resumeState", "evidence"], `Entry ${index} governance payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      if (!["approve", "pause", "resume", "cancel"].includes(String(input.payload.decision))) return invalid("malformed", `Entry ${index} governance decision is unsupported.`);
      const next = transitionGovernance(governance, String(input.payload.decision), input.payload.resumeState);
      if (next === null) return invalid("malformed", `Entry ${index} governance transition is impossible.`);
      const checked = verifySignedHumanEvidence(input.payload.evidence, current, index);
      if (checked.state === "invalid") return checked;
      if (checked.value.seatId !== "coulson" || checked.value.evidenceKind !== "mission_authorization" || checked.value.decision !== evidenceDecisionForGovernance(String(input.payload.decision))) return invalid("seat_mismatch", `Entry ${index} does not contain matching Coulson authority evidence.`);
      if (canonicalJson(input.timestamp) !== canonicalJson(checked.value.timestamp)) return invalid("malformed", `Entry ${index} timestamp does not match its evidence.`);
      if (evidenceIds.has(checked.value.evidenceId)) return invalid("duplicate_evidence", `Entry ${index} duplicates evidenceId.`);
      evidenceIds.add(checked.value.evidenceId);
      evidence.push(checked.value);
      governance = next;
    } else if (input.type === "execution.transition") {
      const nested = exactFields(input.payload, ["from", "to", "reason"], `Entry ${index} execution payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      if (governance !== "approved") return invalid("malformed", `Entry ${index} execution requires approved governance.`);
      if (input.payload.from !== execution || !((execution === "not-started" && input.payload.to === "running") || (execution === "running" && input.payload.to === "completed"))) return invalid("malformed", `Entry ${index} execution transition is impossible.`);
      if (!nonEmpty(input.payload.reason)) return invalid("malformed", `Entry ${index} execution reason is required.`);
      execution = input.payload.to as ExecutionStatus;
    } else if (input.type === "evidence.recorded") {
      const nested = exactFields(input.payload, ["evidence"], `Entry ${index} evidence payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      const checked = verifySignedHumanEvidence(input.payload.evidence, current, index);
      if (checked.state === "invalid") return checked;
      if (checked.value.seatId === "coulson") return invalid("seat_mismatch", "Coulson governance evidence must use a mission command.");
      if (canonicalJson(input.timestamp) !== canonicalJson(checked.value.timestamp)) return invalid("malformed", `Entry ${index} timestamp does not match its evidence.`);
      if (evidenceIds.has(checked.value.evidenceId)) return invalid("duplicate_evidence", `Entry ${index} duplicates evidenceId.`);
      evidenceIds.add(checked.value.evidenceId);
      evidence.push(checked.value);
    } else {
      return invalid("malformed", `Entry ${index} type is unsupported.`);
    }
  }
  return valid(baseProjection(entries.length - 1));
}

export function parseSupervisedJournalJsonl(text: unknown): ContractResult<{ entries: SupervisedJournalEntry[]; projection: SupervisedMissionProjection }> {
  if (typeof text !== "string" || text.length === 0) return invalid("malformed", "Journal text must be non-empty.");
  if (!text.endsWith("\n")) return invalid("recovery_required", "Journal has an incomplete final line.");
  const lines = text.slice(0, -1).split("\n");
  const entries: unknown[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].length === 0) return invalid("malformed", `Journal line ${index + 1} is empty.`);
    try { entries.push(JSON.parse(lines[index])); }
    catch { return invalid("recovery_required", `Journal line ${index + 1} is malformed JSON.`); }
  }
  const replay = replaySupervisedMissionJournal(entries);
  return replay.state === "invalid" ? replay : valid({ entries: entries as SupervisedJournalEntry[], projection: replay.value });
}

export function serializeSupervisedJournalEntry(entry: SupervisedJournalEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

export function createGovernanceEntry(
  projection: SupervisedMissionProjection,
  decision: "approve" | "pause" | "resume" | "cancel",
  evidence: SignedHumanEvidence,
  resumeState: "proposed" | "approved" | null = null,
): ContractResult<SupervisedJournalEntry> {
  const next = transitionGovernance(projection.governance.state, decision, resumeState);
  if (next === null) return invalid("governance_denied", `Cannot ${decision} from ${projection.governance.state}.`);
  const checked = verifySignedHumanEvidence(evidence, projection, projection.lastSequence + 1);
  if (checked.state === "invalid") return checked;
  if (checked.value.seatId !== "coulson" || checked.value.evidenceKind !== "mission_authorization" || checked.value.decision !== evidenceDecisionForGovernance(decision)) return invalid("seat_mismatch", "Governance command requires matching Coulson evidence.");
  return valid({
    schemaVersion: 2,
    entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
    missionId: projection.missionId,
    sequence: projection.lastSequence + 1,
    type: "governance.decided",
    timestamp: checked.value.timestamp,
    payload: { decision, resumeState: decision === "resume" ? resumeState : null, evidence },
  });
}

export function createEvidenceEntry(
  projection: SupervisedMissionProjection,
  evidence: SignedHumanEvidence,
): ContractResult<SupervisedJournalEntry> {
  const checked = verifySignedHumanEvidence(evidence, projection, projection.lastSequence + 1);
  if (checked.state === "invalid") return checked;
  if (checked.value.seatId === "coulson") return invalid("seat_mismatch", "Coulson evidence must use a mission governance command.");
  return valid({
    schemaVersion: 2,
    entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
    missionId: projection.missionId,
    sequence: projection.lastSequence + 1,
    type: "evidence.recorded",
    timestamp: checked.value.timestamp,
    payload: { evidence },
  });
}

export function planMissionStep(
  projection: SupervisedMissionProjection,
  timestamp: EvidenceTimestamp,
): ContractResult<{ entry: SupervisedJournalEntry | null; outcome: "advanced" | "completed-noop" }> {
  const timestampValidation = timestampErrors(timestamp, "Step timestamp");
  if (timestampValidation.length > 0) return invalid("malformed", ...timestampValidation);
  if (projection.governance.state !== "approved") return invalid("governance_denied", "Mission step requires approved governance.");
  if (projection.execution.status === "completed") return valid({ entry: null, outcome: "completed-noop" });
  const to: ExecutionStatus = projection.execution.status === "not-started" ? "running" : "completed";
  return valid({
    entry: {
      schemaVersion: 2,
      entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
      missionId: projection.missionId,
      sequence: projection.lastSequence + 1,
      type: "execution.transition",
      timestamp,
      payload: {
        from: projection.execution.status,
        to,
        reason: "bounded-supervised-fixture-transition",
      },
    },
    outcome: "advanced",
  });
}
