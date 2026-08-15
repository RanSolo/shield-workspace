import { createHash, createPublicKey, verify } from "node:crypto";
import {
  canonicalJson,
  computeRuntimeBindingDigest,
  computeEd25519SigningKeyRef,
  type EvidenceTimestamp,
  type TrustedHumanBinding,
} from "./mission-v2.mjs";
import { type RuntimeBinding, validateRuntimeBinding } from "./permission-v1.mjs";

export const IMPLEMENTATION_AUTHORITY_SCHEMA_VERSION = 1 as const;
export const IMPLEMENTATION_AUTHORITY_CONTRACT_VERSION = "implementation-authority.v1" as const;
export const IMPLEMENTATION_AUTHORITY_KIND = "wheels_up" as const;
export const SCHEMA_9_RUNTIME_BINDING_AUTHORIZATION_SCHEMA_VERSION = 1 as const;
export const SCHEMA_9_RUNTIME_BINDING_SCHEMA_VERSION = 1 as const;
export const SCHEMA_9_AUTHORITY_REVOCATION_SCHEMA_VERSION = 1 as const;

type ContractValue<T> = { state: "valid"; value: T };
type ContractError = { state: "invalid"; code: string; errors: string[] };
export type ContractResult<T> = ContractValue<T> | ContractError;

interface AuthorityScope {
  schemaVersion: 1;
  contractVersion: "implementation-authority.v1";
  authorityKind: "wheels_up";
}

export interface ImplementationAuthorityV1 extends AuthorityScope {
  authorityRef: string;
  missionId: string;
  subjectId: string;
  seatId: "may";
  missionRevisionId: string;
  artifactRevisionId: string;
  repositoryId: string;
  canonicalWritableRoot: string;
  branch: string;
  baseRevision: string;
  headRevision: string;
  modelId: string;
  approvedRelativePaths: readonly string[];
  approvedActionIds: readonly string[];
  approvedEffectClasses: readonly ExecutionEffectClass[];
  approvedEffectKeys: readonly string[];
  approvedCapabilities: readonly string[];
  validationCommandIds: readonly string[];
  journalSequence: number;
  humanPrincipalId: string;
  humanBindingId: string;
  signingKeyRef: string;
  sourceRef: string;
  evidenceRef: string;
  timestamp: EvidenceTimestamp;
}

export interface SignedImplementationAuthorityV1 {
  payload: ImplementationAuthorityV1;
  signatureBase64: string;
}

export interface ImplementationAuthorityRevocationV1 {
  schemaVersion: 1;
  contractVersion: "implementation-authority.v1";
  authorityRef: string;
  authorityDigest: string;
  authoritySequence: number;
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  previousJournalSequence: number;
  journalSequence: number;
  humanPrincipalId: string;
  humanBindingId: string;
  signingKeyRef: string;
  sourceRef: string;
  timestamp: EvidenceTimestamp;
}

export interface SignedImplementationAuthorityRevocationV1 {
  payload: ImplementationAuthorityRevocationV1;
  signatureBase64: string;
}

export interface Schema9RuntimeBindingV1 {
  schemaVersion: 1;
  binding: RuntimeBinding;
  implementationAuthorityRef: string;
  implementationAuthorityDigest: string;
  implementationAuthoritySequence: number;
  approvedRelativePaths: readonly string[];
  validationCommandIds: readonly string[];
  modelId: string;
  baseRevision: string;
  headRevision: string;
}

export interface Schema9RuntimeBindingAuthorizationPayload {
  schemaVersion: 1;
  authorizationId: string;
  missionId: string;
  subjectId: string;
  seatId: string;
  bindingId: string;
  bindingVersion: number;
  priorBindingId: string | null;
  priorBindingVersion: number | null;
  bindingDigest: string;
  schema9BindingDigest: string;
  artifactRevisionId: string;
  decision: "approved";
  previousJournalSequence: number;
  journalSequence: number;
  humanPrincipalId: string;
  humanBindingId: string;
  signingKeyRef: string;
  sourceRef: string;
  timestamp: EvidenceTimestamp;
}

export interface SignedSchema9RuntimeBindingAuthorization {
  payload: Schema9RuntimeBindingAuthorizationPayload;
  signatureBase64: string;
}

export interface Schema9RuntimeBindingVerificationContext {
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  trustedBindings: readonly TrustedHumanBinding[];
  implementationAuthority: ImplementationAuthorityV1;
  implementationAuthorityActive: boolean;
  lastSequence: number;
}

type ExecutionEffectClass = "behavioral_implementation" | "verification" | "coordination";

const valid = <T,>(value: T): ContractValue<T> => ({ state: "valid", value });
const invalid = (code: string, ...errors: string[]): ContractError => ({ state: "invalid", code, errors });

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/;
const KEY_REF = /^ed25519:sha256:[A-Za-z0-9_-]{43}$/;
const DIGEST = /^sha256:(?:[A-Za-z0-9_-]{43}|[a-f0-9]{64})$/;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{40,64})$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const EFFECT_CLASS_SET = new Set<ExecutionEffectClass>(["behavioral_implementation", "verification", "coordination"]);

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!plain(value)) return false;
  const ownKeys = Object.keys(value);
  if (ownKeys.length !== fields.length) return false;
  for (const field of fields) if (!Object.hasOwn(value, field)) return false;
  return true;
}

function canonical(value: unknown): string { return canonicalJson(value); }

interface SignedEnvelopeLike {
  payload: unknown;
  signatureBase64: string;
}

function assertSignedEnvelope(input: unknown): ContractResult<SignedEnvelopeLike> {
  if (!plain(input)) return invalid("malformed", "Envelope is malformed.");
  if (!Object.hasOwn(input, "payload") || !Object.hasOwn(input, "signatureBase64")) {
    return invalid("malformed", "Envelope fields are missing.");
  }
  if (typeof input.payload === "undefined") return invalid("malformed", "Envelope payload is missing.");
  if (typeof input.signatureBase64 !== "string" || input.signatureBase64.length === 0) {
    return invalid("provenance_missing", "Envelope signature is missing.");
  }
  return valid({ payload: input.payload, signatureBase64: input.signatureBase64 });
}

function assertTimestamp(value: unknown): value is EvidenceTimestamp {
  return exact(value, ["value", "provenance"]) &&
    typeof value.value === "string" &&
    TIMESTAMP.test(value.value) &&
    Number.isFinite(Date.parse(value.value)) &&
    (value.provenance === "humanRecorded" || value.provenance === "hostTrusted");
}

function assertIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function assertRevision(value: unknown): value is string {
  return typeof value === "string" && REVISION.test(value);
}

function assertEffectClass(value: unknown): value is ExecutionEffectClass {
  return typeof value === "string" && EFFECT_CLASS_SET.has(value as ExecutionEffectClass);
}

function assertRootPath(value: unknown): value is string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    value.length > 1 &&
    value.length <= 4096 &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.includes("//") &&
    !value.includes("/../") &&
    !value.includes("/./");
}

function assertRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return true;
}

function assertSortedUniquePlainStringArray(
  values: unknown,
  predicate: (value: unknown) => value is string,
  allowEmpty = false,
): string[] | null {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype) return null;
  for (const key of Reflect.ownKeys(values)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key)) return null;
  }
  const next: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!predicate(item) || seen.has(item)) return null;
    seen.add(item);
    next.push(item);
  }
  const sorted = [...next].sort((left, right) => left.localeCompare(right));
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] !== next[index]) return null;
  }
  if (!allowEmpty && next.length === 0) return null;
  return next;
}

function assertSortedUniqueStrings(values: unknown, label: string, allowEmpty = false): string[] | null {
  return assertSortedUniquePlainStringArray(values, assertIdentifier, allowEmpty);
}

function assertSortedUniqueRelativePaths(values: unknown, label: string, allowEmpty = false): string[] | null {
  return assertSortedUniquePlainStringArray(values, assertRelativePath, allowEmpty);
}

function assertSortedUniqueEffectClasses(values: unknown, label: string, allowEmpty = false): ExecutionEffectClass[] | null {
  const next = assertSortedUniqueStrings(values, label, allowEmpty);
  if (!next) return null;
  if (next.some((value) => !assertEffectClass(value))) return null;
  return next as ExecutionEffectClass[];
}

function copyAuthority(input: ImplementationAuthorityV1): ImplementationAuthorityV1 {
  return {
    ...input,
    approvedRelativePaths: [...input.approvedRelativePaths],
    approvedActionIds: [...input.approvedActionIds],
    approvedEffectClasses: [...input.approvedEffectClasses],
    approvedEffectKeys: [...input.approvedEffectKeys],
    approvedCapabilities: [...input.approvedCapabilities],
    validationCommandIds: [...input.validationCommandIds],
    timestamp: { ...input.timestamp },
  };
}

function copyRuntimeBinding(binding: RuntimeBinding): RuntimeBinding {
  return {
    ...binding,
    approvedScope: {
      actionIds: [...binding.approvedScope.actionIds],
      effectClasses: [...binding.approvedScope.effectClasses],
      effectKeys: [...binding.approvedScope.effectKeys],
      capabilities: [...binding.approvedScope.capabilities],
    },
  };
}

function copySchema9RuntimeBinding(binding: Schema9RuntimeBindingV1): Schema9RuntimeBindingV1 {
  return {
    ...binding,
    binding: copyRuntimeBinding(binding.binding),
    approvedRelativePaths: [...binding.approvedRelativePaths],
    validationCommandIds: [...binding.validationCommandIds],
  };
}

function assertScopeIdentifier(fields: string[], label: string, value: Record<string, unknown>): ContractResult<Record<string, unknown>> {
  for (const field of fields) {
    if (!assertIdentifier(value[field])) return invalid("malformed", `${label}.${field} is invalid.`);
  }
  return valid(value);
}

function validSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function trustedBindingForAuthority(
  input: { humanBindingId: string; humanPrincipalId: string; signingKeyRef: string; missionId: string },
  trustedBindings: readonly TrustedHumanBinding[],
  sequence: number,
): ContractResult<TrustedHumanBinding> {
  const matches = trustedBindings.filter((candidate) =>
    candidate.seatId === "coulson" &&
    candidate.bindingId === input.humanBindingId &&
    candidate.validFromSequence <= sequence &&
    (candidate.validThroughSequence === null || sequence <= candidate.validThroughSequence),
  );
  if (matches.length !== 1) return invalid("binding_missing", "Trusted Coulson binding is missing or ambiguous.");
  const trusted = matches[0];
  if (trusted.humanPrincipalId !== input.humanPrincipalId || trusted.signingKeyRef !== input.signingKeyRef) {
    return invalid("binding_invalid", "Trusted Coulson binding is mismatched with signed payload.");
  }
  if (!assertIdentifier(input.signingKeyRef) || computeEd25519SigningKeyRef(trusted.publicKeySpkiBase64) !== input.signingKeyRef) {
    return invalid("binding_invalid", "Trusted Coulson key reference is not self-consistent.");
  }
  if (!(trusted.missionScope === "*" || trusted.missionScope === input.missionId)) {
    return invalid("binding_invalid", "Trusted Coulson binding does not cover this mission.");
  }
  return valid(trusted);
}

function verifySignedEnvelope(
  envelope: SignedEnvelopeLike,
  trusted: TrustedHumanBinding,
  payload: unknown,
  label: string,
): ContractResult<true> {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(trusted.publicKeySpkiBase64, "base64"),
      format: "der",
      type: "spki",
    });
    const signature = Buffer.from(envelope.signatureBase64, "base64");
    if (!verify(null, Buffer.from(canonical(payload)), publicKey, signature)) {
      return invalid("binding_invalid", `${label} signature is invalid.`);
    }
  } catch {
    return invalid("binding_invalid", `${label} signature or key is malformed.`);
  }
  return valid(true);
}

function validateImplementationAuthorityPayload(input: unknown): ContractResult<ImplementationAuthorityV1> {
  const fields = [
    "schemaVersion", "contractVersion", "authorityKind", "authorityRef", "missionId", "subjectId",
    "seatId", "missionRevisionId", "artifactRevisionId", "repositoryId", "canonicalWritableRoot",
    "branch", "baseRevision", "headRevision", "modelId", "approvedRelativePaths",
    "approvedActionIds", "approvedEffectClasses", "approvedEffectKeys", "approvedCapabilities",
    "validationCommandIds", "journalSequence", "humanPrincipalId", "humanBindingId",
    "signingKeyRef", "sourceRef", "evidenceRef", "timestamp",
  ];
  if (!exact(input, fields)) return invalid("malformed", "Implementation authority payload is malformed.");
  if (!plain(input)) return invalid("malformed", "Implementation authority payload must be a plain object.");
  if (input.schemaVersion !== IMPLEMENTATION_AUTHORITY_SCHEMA_VERSION) return invalid("malformed", "Implementation authority schema version is unsupported.");
  if (input.contractVersion !== IMPLEMENTATION_AUTHORITY_CONTRACT_VERSION) return invalid("malformed", "Implementation authority contract version is unsupported.");
  if (input.authorityKind !== IMPLEMENTATION_AUTHORITY_KIND) return invalid("malformed", "Implementation authority kind is unsupported.");
  if (!assertIdentifier(input.authorityRef) || !assertIdentifier(input.missionId) || !assertIdentifier(input.subjectId) || input.seatId !== "may") {
    return invalid("malformed", "Implementation authority identity is invalid.");
  }
  if (!assertRevision(input.missionRevisionId) || !assertRevision(input.artifactRevisionId) ||
      !assertRevision(input.baseRevision) || !assertRevision(input.headRevision) || input.baseRevision === input.headRevision) {
    return invalid("malformed", "Implementation authority revision set is malformed.");
  }
  if (!assertIdentifier(input.repositoryId) || !assertIdentifier(input.modelId) || !assertIdentifier(input.branch) ||
      !assertIdentifier(input.sourceRef) || !assertIdentifier(input.evidenceRef) ||
      !assertIdentifier(input.humanPrincipalId) || !assertIdentifier(input.humanBindingId) || !assertIdentifier(input.signingKeyRef)) {
    return invalid("malformed", "Implementation authority human or authority identities are invalid.");
  }
  if (!assertRootPath(input.canonicalWritableRoot) || !KEY_REF.test(input.signingKeyRef)) return invalid("malformed", "Implementation authority path or key reference is invalid.");
  if (!assertTimestamp(input.timestamp)) return invalid("malformed", "Implementation authority timestamp is invalid.");
  const approvedRelativePaths = assertSortedUniqueRelativePaths(input.approvedRelativePaths, "approvedRelativePaths");
  const approvedActionIds = assertSortedUniqueStrings(input.approvedActionIds, "approvedActionIds");
  const approvedEffectKeys = assertSortedUniqueStrings(input.approvedEffectKeys, "approvedEffectKeys");
  const approvedCapabilities = assertSortedUniqueStrings(input.approvedCapabilities, "approvedCapabilities");
  const validationCommandIds = assertSortedUniqueStrings(input.validationCommandIds, "validationCommandIds");
  const approvedEffectClasses = assertSortedUniqueEffectClasses(input.approvedEffectClasses, "approvedEffectClasses");
  if (!approvedRelativePaths || !approvedActionIds || !approvedEffectKeys || !approvedCapabilities || !validationCommandIds || !approvedEffectClasses) {
    return invalid("malformed", "Implementation authority scope is malformed.");
  }
  if (!approvedActionIds.every(assertIdentifier)) return invalid("malformed", "Implementation authority scope items are malformed.");
  if (!validSequence(input.journalSequence)) return invalid("malformed", "Implementation authority sequence is invalid.");
  return valid(copyAuthority({
    ...input as unknown as ImplementationAuthorityV1,
    approvedRelativePaths,
    approvedActionIds,
    approvedEffectClasses,
    approvedEffectKeys,
    approvedCapabilities,
    validationCommandIds,
  }));
}

export function validateImplementationAuthorityV1(input: unknown): ContractResult<ImplementationAuthorityV1> {
  return validateImplementationAuthorityPayload(input);
}

export function computeImplementationAuthorityDigest(authority: ImplementationAuthorityV1): string {
  return `sha256:${createHash("sha256").update(canonical(copyAuthority(authority))).digest("base64url")}`;
}

export function verifySignedImplementationAuthorityV1(
  envelope: unknown,
  trustedBindings: readonly TrustedHumanBinding[],
  missionId: string,
  subjectId: string,
  missionRevisionId: string,
  expectedSequence: number,
): ContractResult<ImplementationAuthorityV1> {
  const envelopeResult = assertSignedEnvelope(envelope);
  if (envelopeResult.state === "invalid") return envelopeResult;
  const checkedEnvelope = envelopeResult.value;
  const checked = validateImplementationAuthorityPayload(checkedEnvelope.payload);
  if (checked.state === "invalid") return checked;
  const payload = checked.value;
  if (payload.missionId !== missionId || payload.subjectId !== subjectId || payload.missionRevisionId !== missionRevisionId) {
    return invalid("subject_mismatch", "Implementation authority mission, subject, or revision is mismatched.");
  }
  if (payload.journalSequence !== expectedSequence) {
    return invalid("sequence_invalid", "Implementation authority sequence is not the next journal sequence.");
  }
  const trustedBindingResult = trustedBindingForAuthority({
    humanBindingId: payload.humanBindingId,
    humanPrincipalId: payload.humanPrincipalId,
    signingKeyRef: payload.signingKeyRef,
    missionId,
  }, trustedBindings, payload.journalSequence);
  if (trustedBindingResult.state === "invalid") return trustedBindingResult;
  const trusted = trustedBindingResult.value;
  const signatureCheck = verifySignedEnvelope(
    checkedEnvelope,
    trusted,
    payload,
    "Implementation authority",
  );
  if (signatureCheck.state === "invalid") return signatureCheck;
  return valid(copyAuthority(payload));
}

function validateImplementationAuthorityRevocationPayload(
  input: unknown,
  expectedMissionId: string,
  expectedSubjectId: string,
  expectedMissionRevisionId: string,
  expectedSequence: number,
): ContractResult<ImplementationAuthorityRevocationV1> {
  const candidate = input as Record<string, unknown>;
  const fields = [
    "schemaVersion", "contractVersion", "authorityRef", "authorityDigest", "authoritySequence",
    "missionId", "subjectId", "missionRevisionId", "previousJournalSequence", "journalSequence",
    "humanPrincipalId", "humanBindingId", "signingKeyRef", "sourceRef", "timestamp",
  ];
  if (!exact(input, fields)) return invalid("malformed", "Implementation authority revocation payload is malformed.");
  if (!plain(input)) return invalid("malformed", "Implementation authority revocation payload must be a plain object.");
  if (input.schemaVersion !== SCHEMA_9_AUTHORITY_REVOCATION_SCHEMA_VERSION || input.contractVersion !== IMPLEMENTATION_AUTHORITY_CONTRACT_VERSION) {
    return invalid("malformed", "Implementation authority revocation contract is unsupported.");
  }
  if (!assertIdentifier(candidate.authorityRef) || !DIGEST.test(candidate.authorityDigest as string) || !assertIdentifier(candidate.missionId) || !assertIdentifier(candidate.subjectId) ||
      !assertRevision(candidate.missionRevisionId) || !assertIdentifier(candidate.humanPrincipalId) || !assertIdentifier(candidate.humanBindingId) ||
      !assertIdentifier(candidate.sourceRef) || !KEY_REF.test(candidate.signingKeyRef as string)) {
    return invalid("malformed", "Implementation authority revocation identities are malformed.");
  }
  if (!assertTimestamp(candidate.timestamp)) return invalid("malformed", "Implementation authority revocation timestamp is invalid.");
  if (!validSequence(candidate.authoritySequence) || !validSequence(candidate.previousJournalSequence) || !validSequence(candidate.journalSequence)) {
    return invalid("malformed", "Implementation authority revocation sequences are invalid.");
  }
  if ((candidate.previousJournalSequence as number) !== expectedSequence - 1 || (candidate.journalSequence as number) !== expectedSequence) {
    return invalid("sequence_invalid", "Implementation authority revocation sequence is not bound to the next journal sequence.");
  }
  if (candidate.missionId !== expectedMissionId || candidate.subjectId !== expectedSubjectId || candidate.missionRevisionId !== expectedMissionRevisionId) {
    return invalid("subject_mismatch", "Implementation authority revocation subject is mismatched.");
  }
  return valid({
    ...candidate,
    authorityDigest: candidate.authorityDigest as string,
    authoritySequence: candidate.authoritySequence as number,
    previousJournalSequence: candidate.previousJournalSequence as number,
    journalSequence: candidate.journalSequence as number,
  } as ImplementationAuthorityRevocationV1);
}

export function verifySignedImplementationAuthorityRevocationV1(
  envelope: unknown,
  trustedBindings: readonly TrustedHumanBinding[],
  activeAuthority: { missionId: string; subjectId: string; missionRevisionId: string; authorityRef: string; authorityDigest: string; authoritySequence: number; },
  expectedSequence: number,
): ContractResult<ImplementationAuthorityRevocationV1> {
  const envelopeResult = assertSignedEnvelope(envelope);
  if (envelopeResult.state === "invalid") return envelopeResult;
  const checkedEnvelope = envelopeResult.value;
  const checked = validateImplementationAuthorityRevocationPayload(
    checkedEnvelope.payload,
    activeAuthority.missionId,
    activeAuthority.subjectId,
    activeAuthority.missionRevisionId,
    expectedSequence,
  );
  if (checked.state === "invalid") return checked;
  const payload = checked.value;
  if (payload.authorityRef !== activeAuthority.authorityRef ||
      payload.authorityDigest !== activeAuthority.authorityDigest ||
      payload.authoritySequence !== activeAuthority.authoritySequence) {
    return invalid("subject_mismatch", "Implementation authority revocation target is mismatched.");
  }
  const trustedBindingResult = trustedBindingForAuthority({
    humanBindingId: payload.humanBindingId,
    humanPrincipalId: payload.humanPrincipalId,
    signingKeyRef: payload.signingKeyRef,
    missionId: payload.missionId,
  }, trustedBindings, payload.journalSequence);
  if (trustedBindingResult.state === "invalid") return trustedBindingResult;
  const signatureCheck = verifySignedEnvelope(
    checkedEnvelope,
    trustedBindingResult.value,
    payload,
    "Implementation authority revocation",
  );
  if (signatureCheck.state === "invalid") return signatureCheck;
  return valid(payload);
}

export function computeSchema9RuntimeBindingDigest(wrapper: Schema9RuntimeBindingV1): string {
  return `sha256:${createHash("sha256").update(canonical({
    schemaVersion: wrapper.schemaVersion,
    binding: copyRuntimeBinding(wrapper.binding),
    implementationAuthorityRef: wrapper.implementationAuthorityRef,
    implementationAuthorityDigest: wrapper.implementationAuthorityDigest,
    implementationAuthoritySequence: wrapper.implementationAuthoritySequence,
    approvedRelativePaths: [...wrapper.approvedRelativePaths],
    validationCommandIds: [...wrapper.validationCommandIds],
    modelId: wrapper.modelId,
    baseRevision: wrapper.baseRevision,
    headRevision: wrapper.headRevision,
  })).digest("base64url")}`;
}

export function validateSchema9RuntimeBindingV1(input: unknown): ContractResult<Schema9RuntimeBindingV1> {
  const candidate = input as Record<string, unknown>;
  const fields = [
    "schemaVersion", "binding", "implementationAuthorityRef", "implementationAuthorityDigest",
    "implementationAuthoritySequence", "approvedRelativePaths", "validationCommandIds", "modelId", "baseRevision", "headRevision",
  ];
  if (!exact(input, fields) || !plain(input)) return invalid("malformed", "Schema-9 runtime-binding payload is malformed.");
  const checkedBinding = validateRuntimeBinding(candidate.binding);
  if (checkedBinding.state === "invalid") return invalid(checkedBinding.code, ...checkedBinding.errors);
  const binding = checkedBinding.value;
  if (candidate.schemaVersion !== SCHEMA_9_RUNTIME_BINDING_SCHEMA_VERSION) {
    return invalid("malformed", "Schema-9 runtime-binding schema is unsupported.");
  }
  if (!assertIdentifier(candidate.implementationAuthorityRef) || !DIGEST.test(candidate.implementationAuthorityDigest as string) || !assertIdentifier(candidate.modelId) ||
      !assertRevision(candidate.baseRevision) || !assertRevision(candidate.headRevision)) {
    return invalid("malformed", "Schema-9 runtime-binding identity is malformed.");
  }
  if (!validSequence(candidate.implementationAuthoritySequence) || (candidate.implementationAuthoritySequence as number) < 1) {
    return invalid("malformed", "Schema-9 runtime-binding authority sequence is invalid.");
  }
  const approvedRelativePaths = assertSortedUniqueRelativePaths(candidate.approvedRelativePaths, "approvedRelativePaths");
  const validationCommandIds = assertSortedUniqueStrings(candidate.validationCommandIds, "validationCommandIds");
  if (!approvedRelativePaths || !validationCommandIds || approvedRelativePaths.length === 0 || validationCommandIds.length === 0) {
    return invalid("malformed", "Schema-9 runtime-binding scope is malformed.");
  }
  const executionIdentities = [binding.seatId, binding.reasoningRuntimeId, candidate.modelId as string, binding.toolExecutorId];
  if (new Set(executionIdentities).size !== executionIdentities.length) {
    return invalid("malformed", "Schema-9 runtime-binding seat, reasoning runtime, model, and tool executor identities must be mutually distinct.");
  }
  return valid(copySchema9RuntimeBinding({
    schemaVersion: candidate.schemaVersion as 1,
    binding,
    implementationAuthorityRef: candidate.implementationAuthorityRef as string,
    implementationAuthorityDigest: candidate.implementationAuthorityDigest as string,
    implementationAuthoritySequence: candidate.implementationAuthoritySequence as number,
    approvedRelativePaths,
    validationCommandIds,
    modelId: candidate.modelId as string,
    baseRevision: candidate.baseRevision as string,
    headRevision: candidate.headRevision as string,
  }));
}

export function validateSchema9RuntimeBindingAuthorizationPayload(input: unknown): ContractResult<Schema9RuntimeBindingAuthorizationPayload> {
  const candidate = input as Record<string, unknown>;
  const fields = [
    "schemaVersion", "authorizationId", "missionId", "subjectId", "seatId", "bindingId",
    "bindingVersion", "priorBindingId", "priorBindingVersion", "bindingDigest", "schema9BindingDigest",
    "artifactRevisionId", "decision", "previousJournalSequence", "journalSequence", "humanPrincipalId",
    "humanBindingId", "signingKeyRef", "sourceRef", "timestamp",
  ];
  if (!exact(input, fields) || !plain(input)) return invalid("malformed", "Schema-9 runtime-binding authorization payload is malformed.");
  if (candidate.schemaVersion !== SCHEMA_9_RUNTIME_BINDING_AUTHORIZATION_SCHEMA_VERSION || candidate.decision !== "approved") {
    return invalid("malformed", "Schema-9 runtime-binding authorization schema or decision is unsupported.");
  }
  const identityFields = assertScopeIdentifier(
    ["authorizationId", "missionId", "subjectId", "seatId", "bindingId", "humanPrincipalId", "humanBindingId", "sourceRef"],
    "Schema-9 runtime-binding authorization payload",
    candidate,
  );
  if (identityFields.state === "invalid") return identityFields;
  if (!assertIdentifier(candidate.artifactRevisionId) || !assertRevision(candidate.artifactRevisionId)) {
    return invalid("malformed", "Schema-9 runtime-binding authorization artifact revision is malformed.");
  }
  if (typeof candidate.bindingDigest !== "string" || !DIGEST.test(candidate.bindingDigest) || typeof candidate.schema9BindingDigest !== "string" || !DIGEST.test(candidate.schema9BindingDigest)) {
    return invalid("malformed", "Schema-9 runtime-binding authorization digests are invalid.");
  }
  if (!validSequence(candidate.bindingVersion) || (candidate.bindingVersion as number) < 1 || !validSequence(candidate.bindingVersion)) return invalid("malformed", "Schema-9 runtime-binding authorization binding version is invalid.");
  if (candidate.priorBindingId !== null && !assertIdentifier(candidate.priorBindingId)) return invalid("malformed", "Schema-9 runtime-binding authorization prior binding identity is invalid.");
  if (candidate.priorBindingVersion !== null && (!validSequence(candidate.priorBindingVersion) || (candidate.priorBindingVersion as number) < 1)) return invalid("malformed", "Schema-9 runtime-binding authorization prior binding version is invalid.");
  if ((candidate.priorBindingId === null) !== (candidate.priorBindingVersion === null)) return invalid("malformed", "Schema-9 runtime-binding authorization prior identity must be whole.");
  if (!validSequence(candidate.previousJournalSequence) || !validSequence(candidate.journalSequence) || (candidate.journalSequence as number) !== (candidate.previousJournalSequence as number) + 1) {
    return invalid("sequence_invalid", "Schema-9 runtime-binding authorization sequence is invalid.");
  }
  if (!KEY_REF.test(candidate.signingKeyRef as string) || !assertTimestamp(candidate.timestamp)) {
    return invalid("malformed", "Schema-9 runtime-binding authorization signer or timestamp is invalid.");
  }
  return valid(candidate as unknown as Schema9RuntimeBindingAuthorizationPayload);
}

export function validateSignedSchema9RuntimeBindingAuthorizationEnvelopeV1(input: unknown): ContractResult<SignedSchema9RuntimeBindingAuthorization> {
  if (!exact(input, ["payload", "signatureBase64"])) return invalid("malformed", "Schema-9 runtime-binding authorization envelope is malformed.");
  const envelope = assertSignedEnvelope(input);
  if (envelope.state === "invalid") return envelope;
  const payload = validateSchema9RuntimeBindingAuthorizationPayload(envelope.value.payload);
  if (payload.state === "invalid") return payload;
  return valid({ payload: { ...payload.value, timestamp: { ...payload.value.timestamp } }, signatureBase64: envelope.value.signatureBase64 });
}

function authorityIdentityMismatches(authority: ImplementationAuthorityV1, wrapper: Schema9RuntimeBindingV1): string[] {
  const mismatches: string[] = [];
  if (wrapper.binding.missionId !== authority.missionId) mismatches.push("missionId");
  if (wrapper.binding.subjectId !== authority.subjectId) mismatches.push("subjectId");
  if (wrapper.binding.seatId !== authority.seatId) mismatches.push("seatId");
  if (wrapper.binding.repositoryId !== authority.repositoryId) mismatches.push("repositoryId");
  if (wrapper.binding.canonicalWritableRoot !== authority.canonicalWritableRoot) mismatches.push("canonicalWritableRoot");
  if (wrapper.binding.branch !== authority.branch) mismatches.push("branch");
  if (wrapper.binding.missionRevisionId !== authority.missionRevisionId) mismatches.push("missionRevisionId");
  if (wrapper.binding.artifactRevisionId !== authority.artifactRevisionId) mismatches.push("artifactRevisionId");
  if (wrapper.baseRevision !== authority.baseRevision) mismatches.push("baseRevision");
  if (wrapper.headRevision !== authority.headRevision) mismatches.push("headRevision");
  if (wrapper.modelId !== authority.modelId) mismatches.push("modelId");
  if (wrapper.implementationAuthorityRef !== authority.authorityRef) mismatches.push("implementationAuthorityRef");
  if (wrapper.implementationAuthoritySequence !== authority.journalSequence) mismatches.push("implementationAuthoritySequence");
  if (wrapper.implementationAuthorityDigest !== computeImplementationAuthorityDigest(authority)) mismatches.push("implementationAuthorityDigest");
  if (wrapper.binding.coulsonAuthorizationRef === authority.authorityRef) mismatches.push("coulsonAuthorizationId");
  return mismatches;
}

function authorityScopeMismatches(authority: ImplementationAuthorityV1, wrapper: Schema9RuntimeBindingV1): string[] {
  const mismatches: string[] = [];
  if (wrapper.binding.approvedScope.actionIds.some((actionId) => !authority.approvedActionIds.includes(actionId))) mismatches.push("approvedActionIds");
  if (wrapper.binding.approvedScope.effectClasses.some((effectClass) => !authority.approvedEffectClasses.includes(effectClass))) mismatches.push("approvedEffectClasses");
  if (wrapper.binding.approvedScope.effectKeys.some((key) => !authority.approvedEffectKeys.includes(key))) mismatches.push("approvedEffectKeys");
  if (wrapper.binding.approvedScope.capabilities.some((capability) => !authority.approvedCapabilities.includes(capability))) mismatches.push("approvedCapabilities");
  if (!assertSubset(wrapper.approvedRelativePaths, authority.approvedRelativePaths)) mismatches.push("approvedRelativePaths");
  if (!assertSubset(wrapper.validationCommandIds, authority.validationCommandIds)) mismatches.push("validationCommandIds");
  return mismatches;
}

function assertSubset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length > right.length) return false;
  const allowed = new Set(right);
  return left.every((value) => allowed.has(value));
}

export function assertAuthoritySubsetOfScope(wrapper: Schema9RuntimeBindingV1, authority: ImplementationAuthorityV1): ContractResult<true> {
  const mismatches = authorityScopeMismatches(authority, wrapper);
  return mismatches.length > 0
    ? invalid("binding_invalid", `Schema-9 runtime-binding scope is not an exact or lawful subset: ${mismatches.join(", ")}`)
    : valid(true);
}

export function verifySignedSchema9RuntimeBindingAuthorizationV1(
  envelope: unknown,
  wrapperInput: unknown,
  context: Schema9RuntimeBindingVerificationContext,
  priorBindingId: string | null,
  priorBindingVersion: number | null,
): ContractResult<Schema9RuntimeBindingAuthorizationPayload> {
  const envelopeResult = validateSignedSchema9RuntimeBindingAuthorizationEnvelopeV1(envelope);
  if (envelopeResult.state === "invalid") return envelopeResult;
  const checkedEnvelope = envelopeResult.value;
  const payload = checkedEnvelope.payload;
  const wrapperResult = validateSchema9RuntimeBindingV1(wrapperInput);
  if (wrapperResult.state === "invalid") return wrapperResult;
  const wrapper = wrapperResult.value;

  if (payload.missionId !== wrapper.binding.missionId || payload.subjectId !== wrapper.binding.subjectId || payload.seatId !== wrapper.binding.seatId ||
      payload.bindingId !== wrapper.binding.bindingId || payload.bindingVersion !== wrapper.binding.bindingVersion) {
    return invalid("subject_mismatch", "Schema-9 runtime-binding authorization does not match its wrapper.");
  }
  if (payload.missionId !== context.missionId || payload.subjectId !== context.subjectId) {
    return invalid("subject_mismatch", "Schema-9 runtime-binding authorization mission or subject is mismatched.");
  }
  if (payload.artifactRevisionId !== wrapper.binding.artifactRevisionId) {
    return invalid("revision_mismatch", "Schema-9 runtime-binding authorization artifact revision is mismatched.");
  }
  if (payload.previousJournalSequence !== context.lastSequence ||
      payload.journalSequence !== context.lastSequence + 1 ||
      wrapper.binding.recordedAtSequence !== payload.journalSequence) {
    return invalid("sequence_invalid", "Schema-9 runtime-binding authorization is not bound to the next sequence.");
  }
  const authorityIdentity = authorityIdentityMismatches(context.implementationAuthority, wrapper);
  if (authorityIdentity.length > 0) {
    return invalid("binding_invalid", `Schema-9 runtime-binding authority identity is mismatched: ${authorityIdentity.join(", ")}`);
  }
  if (payload.artifactRevisionId !== context.implementationAuthority.artifactRevisionId) {
    return invalid("revision_mismatch", "Schema-9 runtime-binding authorization authority revision is mismatched.");
  }
  if (payload.schema9BindingDigest !== computeSchema9RuntimeBindingDigest(wrapper)) {
    return invalid("binding_invalid", "Schema-9 runtime-binding authorization does not cover the wrapped binding.");
  }
  if (payload.bindingDigest !== computeRuntimeBindingDigest(wrapper.binding)) {
    return invalid("binding_invalid", "Schema-9 runtime-binding authorization does not cover the embedded runtime binding.");
  }
  if (wrapper.binding.coulsonAuthorizationRef !== payload.authorizationId ||
      payload.authorizationId === wrapper.implementationAuthorityRef) {
    return invalid("binding_invalid", "Schema-9 runtime-binding authorization identity is not independent from its implementation authority.");
  }
  const trustedBindingResult = trustedBindingForAuthority({
    humanBindingId: payload.humanBindingId,
    humanPrincipalId: payload.humanPrincipalId,
    signingKeyRef: payload.signingKeyRef,
    missionId: payload.missionId,
  }, context.trustedBindings, payload.journalSequence);
  if (trustedBindingResult.state === "invalid") return trustedBindingResult;
  const signatureCheck = verifySignedEnvelope(
    checkedEnvelope,
    trustedBindingResult.value,
    payload,
    "Schema-9 runtime-binding authorization",
  );
  if (signatureCheck.state === "invalid") return signatureCheck;
  if (context.implementationAuthorityActive !== true) return invalid("authority_invalid", "Schema-9 runtime-binding requires an active implementation authority.");
  const scope = assertAuthoritySubsetOfScope(wrapper, context.implementationAuthority);
  if (scope.state === "invalid") return scope;
  if (payload.priorBindingId !== priorBindingId || payload.priorBindingVersion !== priorBindingVersion) {
    return invalid("binding_invalid", "Schema-9 runtime-binding prior binding identity is mismatched.");
  }
  return valid({ ...payload });
}

export { copyAuthority, copyRuntimeBinding, copySchema9RuntimeBinding };
export { computeRuntimeBindingDigest };
