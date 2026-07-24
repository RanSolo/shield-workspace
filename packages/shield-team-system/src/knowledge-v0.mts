export const KNOWLEDGE_ENTRY_SCHEMA_VERSION = 1 as const;
export const KNOWLEDGE_ENTRY_CONTRACT_VERSION = "knowledge.entry.v0" as const;
export const KNOWLEDGE_SLICE_SCHEMA_VERSION = 1 as const;
export const KNOWLEDGE_SLICE_CONTRACT_VERSION = "knowledge.slice.v0" as const;
export const KNOWLEDGE_ENTRY_KINDS = ["observation", "inference", "decision", "rejection", "unresolved_question"] as const;
export const KNOWLEDGE_SOURCE_KINDS = ["human", "tool", "model", "external"] as const;
export const KNOWLEDGE_TRUST_STATES = ["untrusted", "reviewed", "trusted"] as const;
export const KNOWLEDGE_FRESHNESS_STATES = ["current", "stale", "unknown"] as const;
export const KNOWLEDGE_SUPERSESSION_STATES = ["current", "superseded", "rejected"] as const;
export const KNOWLEDGE_CONFLICT_STATES = ["none", "conflicted"] as const;
export const KNOWLEDGE_REASON_CODES = [
  "MALFORMED_ENTRY",
  "PROVENANCE_INCOMPLETE",
  "UNTRUSTED_SOURCE",
  "ENTRY_STALE",
  "ENTRY_SUPERSEDED",
  "ENTRY_CONFLICT_UNRESOLVED",
  "ENTRY_DIGEST_MISMATCH",
  "MALFORMED_SLICE",
  "SLICE_BINDING_MISMATCH",
  "SLICE_MEMBER_MISMATCH",
  "SLICE_DIGEST_MISMATCH",
  "SLICE_INTERPRETATION_ATTEMPT",
] as const;

export type KnowledgeEntryKindV0 = (typeof KNOWLEDGE_ENTRY_KINDS)[number];
export type KnowledgeSourceKindV0 = (typeof KNOWLEDGE_SOURCE_KINDS)[number];
export type KnowledgeTrustStateV0 = (typeof KNOWLEDGE_TRUST_STATES)[number];
export type KnowledgeFreshnessStateV0 = (typeof KNOWLEDGE_FRESHNESS_STATES)[number];
export type KnowledgeSupersessionStateV0 = (typeof KNOWLEDGE_SUPERSESSION_STATES)[number];
export type KnowledgeConflictStateV0 = (typeof KNOWLEDGE_CONFLICT_STATES)[number];
export type KnowledgeReasonCodeV0 = (typeof KNOWLEDGE_REASON_CODES)[number];

export interface KnowledgeProvenanceV0 {
  readonly sourceKind: KnowledgeSourceKindV0;
  readonly sourceRef: string;
  readonly authorSeatId: string | null;
  readonly reasoningRuntimeId: string | null;
  readonly toolExecutorId: string | null;
  readonly capturedAt: string;
  readonly trustState: KnowledgeTrustStateV0;
}

export interface KnowledgeEntryV0 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof KNOWLEDGE_ENTRY_CONTRACT_VERSION;
  readonly entryId: string;
  readonly revisionId: string;
  readonly kind: KnowledgeEntryKindV0;
  readonly contentRef: string;
  readonly contentDigest: string;
  readonly provenance: KnowledgeProvenanceV0;
  readonly createdAt: string;
  readonly freshness: Readonly<{ state: KnowledgeFreshnessStateV0; expiresAt: string | null }>;
  readonly supersession: Readonly<{ state: KnowledgeSupersessionStateV0; supersededByRevisionId: string | null; reason: string | null }>;
  readonly conflict: Readonly<{ state: KnowledgeConflictStateV0; conflictSetId: string | null; disposition: "none" | "unresolved" | "reviewed" }>;
  readonly nonAuthoritative: true;
}

export interface KnowledgeSliceMemberV0 {
  readonly entryId: string;
  readonly revisionId: string;
  readonly contentDigest: string;
  readonly ordinal: number;
}

export interface KnowledgeSliceManifestV0 {
  readonly manifestId: string;
  readonly missionId: string;
  readonly seatId: string;
  readonly curatorProposal: Readonly<{ proposalId: string; curatorSeatId: "hill"; proposedAt: string }>;
  readonly members: readonly KnowledgeSliceMemberV0[];
  readonly sliceDigest: string;
}

export interface KnowledgeSliceEnvelopeV0 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof KNOWLEDGE_SLICE_CONTRACT_VERSION;
  readonly envelopeId: string;
  readonly manifest: KnowledgeSliceManifestV0;
  readonly entries: readonly KnowledgeEntryV0[];
  readonly nonAuthoritative: true;
}

export type KnowledgeValidationResultV0 = Readonly<{
  state: "valid" | "invalid";
  authority: "non_authoritative";
  reasonCodes: readonly KnowledgeReasonCodeV0[];
  freshness: KnowledgeFreshnessStateV0 | null;
  entry: Readonly<KnowledgeEntryV0> | null;
}>;

export type KnowledgeSliceResultV0 = Readonly<{
  state: "verified" | "invalid";
  authority: "non_authoritative";
  reasonCodes: readonly KnowledgeReasonCodeV0[];
  envelope: Readonly<KnowledgeSliceEnvelopeV0> | null;
}>;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/;
const DIGEST = /^sha256:[A-Fa-f0-9]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
function id(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && ISO_UTC.test(value) && Number.isFinite(Date.parse(value)); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 1024; }
function digest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }

function validProvenance(value: unknown): value is KnowledgeProvenanceV0 {
  return exact(value, ["sourceKind", "sourceRef", "authorSeatId", "reasoningRuntimeId", "toolExecutorId", "capturedAt", "trustState"]) &&
    KNOWLEDGE_SOURCE_KINDS.includes(value.sourceKind as KnowledgeSourceKindV0) && id(value.sourceRef) && (value.authorSeatId === null || id(value.authorSeatId)) && (value.reasoningRuntimeId === null || id(value.reasoningRuntimeId)) && (value.toolExecutorId === null || id(value.toolExecutorId)) && timestamp(value.capturedAt) && KNOWLEDGE_TRUST_STATES.includes(value.trustState as KnowledgeTrustStateV0) &&
    (value.sourceKind !== "model" || value.reasoningRuntimeId !== null) && (value.sourceKind !== "human" || value.authorSeatId !== null);
}

function validEntryShape(value: unknown): value is KnowledgeEntryV0 {
  if (!exact(value, ["schemaVersion", "contractVersion", "entryId", "revisionId", "kind", "contentRef", "contentDigest", "provenance", "createdAt", "freshness", "supersession", "conflict", "nonAuthoritative"])) return false;
  if (value.schemaVersion !== 1 || value.contractVersion !== KNOWLEDGE_ENTRY_CONTRACT_VERSION || !id(value.entryId) || !id(value.revisionId) || !KNOWLEDGE_ENTRY_KINDS.includes(value.kind as KnowledgeEntryKindV0) || !id(value.contentRef) || !digest(value.contentDigest) || !validProvenance(value.provenance) || !timestamp(value.createdAt) || value.nonAuthoritative !== true) return false;
  if (!exact(value.freshness, ["state", "expiresAt"]) || !KNOWLEDGE_FRESHNESS_STATES.includes(value.freshness.state as KnowledgeFreshnessStateV0) || (value.freshness.expiresAt !== null && !timestamp(value.freshness.expiresAt))) return false;
  if (!exact(value.supersession, ["state", "supersededByRevisionId", "reason"]) || !KNOWLEDGE_SUPERSESSION_STATES.includes(value.supersession.state as KnowledgeSupersessionStateV0) || (value.supersession.supersededByRevisionId !== null && !id(value.supersession.supersededByRevisionId)) || (value.supersession.reason !== null && !text(value.supersession.reason))) return false;
  if (!exact(value.conflict, ["state", "conflictSetId", "disposition"]) || !KNOWLEDGE_CONFLICT_STATES.includes(value.conflict.state as KnowledgeConflictStateV0) || (value.conflict.conflictSetId !== null && !id(value.conflict.conflictSetId)) || !["none", "unresolved", "reviewed"].includes(value.conflict.disposition as string)) return false;
  if (value.supersession.state === "superseded" && value.supersession.supersededByRevisionId === null) return false;
  if (value.conflict.state === "conflicted" && (value.conflict.conflictSetId === null || value.conflict.disposition === "none")) return false;
  if (value.conflict.state === "none" && (value.conflict.conflictSetId !== null || value.conflict.disposition !== "none")) return false;
  return true;
}

export function validateKnowledgeEntryV0(entryInput: unknown, evaluatedAtInput: string): KnowledgeValidationResultV0 {
  if (!validEntryShape(entryInput) || !timestamp(evaluatedAtInput)) return { state: "invalid", authority: "non_authoritative", reasonCodes: ["MALFORMED_ENTRY"], freshness: null, entry: null };
  const entry = entryInput;
  const reasons: KnowledgeReasonCodeV0[] = [];
  let freshness: KnowledgeFreshnessStateV0 = entry.freshness.state;
  if (entry.freshness.expiresAt !== null && Date.parse(entry.freshness.expiresAt) <= Date.parse(evaluatedAtInput)) freshness = "stale";
  if (freshness === "stale") reasons.push("ENTRY_STALE");
  if (freshness === "unknown") reasons.push("ENTRY_STALE");
  if (entry.supersession.state === "superseded") reasons.push("ENTRY_SUPERSEDED");
  if (entry.conflict.state === "conflicted" && entry.conflict.disposition !== "reviewed") reasons.push("ENTRY_CONFLICT_UNRESOLVED");
  if (entry.provenance.trustState === "untrusted") reasons.push("UNTRUSTED_SOURCE");
  if (entry.provenance.trustState !== "reviewed" && entry.provenance.trustState !== "trusted") reasons.push("PROVENANCE_INCOMPLETE");
  return { state: reasons.length === 0 ? "valid" : "invalid", authority: "non_authoritative", reasonCodes: Object.freeze(reasons), freshness, entry: Object.freeze({ ...entry }) };
}

function validMember(value: unknown): value is KnowledgeSliceMemberV0 {
  return exact(value, ["entryId", "revisionId", "contentDigest", "ordinal"]) && id(value.entryId) && id(value.revisionId) && digest(value.contentDigest) && typeof value.ordinal === "number" && Number.isInteger(value.ordinal) && value.ordinal >= 0;
}
function validManifest(value: unknown): value is KnowledgeSliceManifestV0 {
  return exact(value, ["manifestId", "missionId", "seatId", "curatorProposal", "members", "sliceDigest"]) && id(value.manifestId) && id(value.missionId) && id(value.seatId) && exact(value.curatorProposal, ["proposalId", "curatorSeatId", "proposedAt"]) && id(value.curatorProposal.proposalId) && value.curatorProposal.curatorSeatId === "hill" && timestamp(value.curatorProposal.proposedAt) && Array.isArray(value.members) && value.members.length > 0 && value.members.every(validMember) && new Set(value.members.map((member) => member.entryId)).size === value.members.length && new Set(value.members.map((member) => member.revisionId)).size === value.members.length && value.members.every((member, index) => member.ordinal === index) && digest(value.sliceDigest);
}
function validEnvelope(value: unknown): value is KnowledgeSliceEnvelopeV0 {
  return exact(value, ["schemaVersion", "contractVersion", "envelopeId", "manifest", "entries", "nonAuthoritative"]) && value.schemaVersion === 1 && value.contractVersion === KNOWLEDGE_SLICE_CONTRACT_VERSION && id(value.envelopeId) && validManifest(value.manifest) && Array.isArray(value.entries) && value.entries.length === value.manifest.members.length && value.entries.every(validEntryShape) && value.nonAuthoritative === true;
}

export function verifyKnowledgeSliceV0(envelopeInput: unknown, approvedManifestInput: unknown, evaluatedAtInput: string): KnowledgeSliceResultV0 {
  if (!validEnvelope(envelopeInput) || !validManifest(approvedManifestInput) || !timestamp(evaluatedAtInput)) return { state: "invalid", authority: "non_authoritative", reasonCodes: ["MALFORMED_SLICE"], envelope: null };
  const envelope = envelopeInput;
  const approvedManifest = approvedManifestInput;
  const reasons: KnowledgeReasonCodeV0[] = [];
  if (
    envelope.manifest.manifestId !== approvedManifest.manifestId ||
    envelope.manifest.missionId !== approvedManifest.missionId ||
    envelope.manifest.seatId !== approvedManifest.seatId ||
    JSON.stringify(envelope.manifest.curatorProposal) !== JSON.stringify(approvedManifest.curatorProposal) ||
    envelope.manifest.sliceDigest !== approvedManifest.sliceDigest ||
    JSON.stringify(envelope.manifest.members) !== JSON.stringify(approvedManifest.members)
  ) reasons.push("SLICE_BINDING_MISMATCH");
  for (const [index, entry] of envelope.entries.entries()) {
    const member = envelope.manifest.members[index];
    const entryResult = validateKnowledgeEntryV0(entry, evaluatedAtInput);
    if (!member || member.entryId !== entry.entryId || member.revisionId !== entry.revisionId || member.ordinal !== index) reasons.push("SLICE_MEMBER_MISMATCH");
    if (!member || member.contentDigest !== entry.contentDigest) reasons.push("SLICE_DIGEST_MISMATCH");
    reasons.push(...entryResult.reasonCodes);
  }
  if (new Set(reasons).size !== reasons.length) return { state: "invalid", authority: "non_authoritative", reasonCodes: Object.freeze([...new Set(reasons)]), envelope: Object.freeze({ ...envelope }) };
  return { state: reasons.length === 0 ? "verified" : "invalid", authority: "non_authoritative", reasonCodes: Object.freeze(reasons), envelope: Object.freeze({ ...envelope }) };
}

export function consumeKnowledgeSliceOpaqueV0(envelopeInput: unknown, approvedManifestInput: unknown, evaluatedAtInput: string, interpretationAttempt = false): KnowledgeSliceResultV0 {
  if (interpretationAttempt) return { state: "invalid", authority: "non_authoritative", reasonCodes: ["SLICE_INTERPRETATION_ATTEMPT"], envelope: null };
  return verifyKnowledgeSliceV0(envelopeInput, approvedManifestInput, evaluatedAtInput);
}
