import { createHash, createPublicKey, verify } from "node:crypto";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import { types as utilTypes } from "node:util";

import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  type EvidenceTimestamp,
  type TrustedHumanBinding,
} from "./mission-v2.mjs";
import { CANONICAL_ROLE_IDS } from "./role-taxonomy-v1.mjs";

export const DAISY_COORDINATION_AUTHORITY_SCHEMA_VERSION = 1 as const;
export const DAISY_COORDINATION_AUTHORITY_CONTRACT_VERSION = "daisy-coordination-authority.v1" as const;
export const DAISY_COORDINATION_AUTHORITY_KIND = "daisy_feature_flight_coordination" as const;
export const DAISY_COORDINATION_ACTION_ID = "action:feature-flight.daisy.reconnaissance" as const;
export const DAISY_COORDINATION_EFFECT_CLASS = "coordination" as const;
export const DAISY_COORDINATION_CAPABILITY_CLASS = "read_only_coordination" as const;
export const DAISY_COORDINATION_VALIDATION_ID = "validation:feature-flight.daisy-result-v1" as const;

type Valid<T> = { state: "valid"; value: T };
type Invalid = { state: "invalid"; code: string; errors: string[] };
export type DaisyCoordinationContractResult<T> = Valid<T> | Invalid;

export interface DaisyCoordinationAuthorityV1 {
  schemaVersion: 1;
  contractVersion: "daisy-coordination-authority.v1";
  authorityKind: "daisy_feature_flight_coordination";
  authorityRef: string;
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  evaluatedThroughSequence: number;
  repositoryId: string;
  canonicalRepositoryRoot: string;
  branch: string;
  headRevision: string;
  seatId: "daisy";
  actionId: "action:feature-flight.daisy.reconnaissance";
  effectClass: "coordination";
  effectKey: string;
  capabilityClass: "read_only_coordination";
  approvedReadRoots: readonly string[];
  durableArtifactRoot: string;
  issuedAt: EvidenceTimestamp;
  signingKeyRef: string;
}

export interface SignedDaisyCoordinationAuthorityV1 {
  payload: DaisyCoordinationAuthorityV1;
  authorityDigest: string;
  signatureBase64: string;
}

export interface DaisyCoordinationAuthorityRevocationV1 {
  schemaVersion: 1;
  contractVersion: "daisy-coordination-authority.v1";
  authorityRef: string;
  authorityDigest: string;
  authoritySequence: number;
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  previousJournalSequence: number;
  journalSequence: number;
  signingKeyRef: string;
  sourceRef: string;
  issuedAt: EvidenceTimestamp;
}

export interface SignedDaisyCoordinationAuthorityRevocationV1 {
  payload: DaisyCoordinationAuthorityRevocationV1;
  signatureBase64: string;
}

export interface DaisyCoordinationRuntimeBindingV1 {
  schemaVersion: 1;
  contractVersion: "daisy-coordination-runtime-binding.v1";
  bindingId: string;
  bindingVersion: number;
  priorBindingId: string | null;
  priorBindingVersion: number | null;
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  seatId: "daisy";
  runtimeId: string;
  modelId: string;
  executorId: string;
  actionId: "action:feature-flight.daisy.reconnaissance";
  effectClass: "coordination";
  effectKey: string;
  capabilityClass: "read_only_coordination";
  repositoryId: string;
  canonicalRepositoryRoot: string;
  branch: string;
  headRevision: string;
  durableArtifactRoot: string;
  authorityRef: string;
  authorityDigest: string;
  authoritySequence: number;
  effectiveSequence: number;
  lifecycleState: "active";
  coulsonAuthorizationRef: string;
}

export interface DaisyCoordinationRuntimeBindingAuthorizationV1 {
  schemaVersion: 1;
  contractVersion: "daisy-coordination-runtime-binding-authorization.v1";
  authorizationId: string;
  missionId: string;
  subjectId: string;
  seatId: "daisy";
  bindingId: string;
  bindingVersion: number;
  priorBindingId: string | null;
  priorBindingVersion: number | null;
  bindingDigest: string;
  authorityRef: string;
  authorityDigest: string;
  authoritySequence: number;
  decision: "approved";
  previousJournalSequence: number;
  journalSequence: number;
  signingKeyRef: string;
  sourceRef: string;
  issuedAt: EvidenceTimestamp;
}

export interface SignedDaisyCoordinationRuntimeBindingAuthorizationV1 {
  payload: DaisyCoordinationRuntimeBindingAuthorizationV1;
  signatureBase64: string;
}

export interface DaisyCoordinationBindingVerificationContextV1 {
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  trustedBindings: readonly TrustedHumanBinding[];
  authority: DaisyCoordinationAuthorityV1;
  authorityDigest: string;
  authoritySequence: number;
  authorityActive: boolean;
  lastSequence: number;
  participantSeatIds: readonly string[];
}

const AUTHORITY_FIELDS = [
  "schemaVersion", "contractVersion", "authorityKind", "authorityRef", "missionId", "subjectId",
  "missionRevisionId", "evaluatedThroughSequence", "repositoryId", "canonicalRepositoryRoot", "branch",
  "headRevision", "seatId", "actionId", "effectClass", "effectKey", "capabilityClass",
  "approvedReadRoots", "durableArtifactRoot", "issuedAt", "signingKeyRef",
] as const;
const REVOCATION_FIELDS = [
  "schemaVersion", "contractVersion", "authorityRef", "authorityDigest", "authoritySequence", "missionId",
  "subjectId", "missionRevisionId", "previousJournalSequence", "journalSequence", "signingKeyRef", "sourceRef", "issuedAt",
] as const;
const BINDING_FIELDS = [
  "schemaVersion", "contractVersion", "bindingId", "bindingVersion", "priorBindingId", "priorBindingVersion",
  "missionId", "subjectId", "missionRevisionId", "seatId", "runtimeId", "modelId", "executorId", "actionId",
  "effectClass", "effectKey", "capabilityClass", "repositoryId", "canonicalRepositoryRoot", "branch",
  "headRevision", "durableArtifactRoot", "authorityRef", "authorityDigest", "authoritySequence",
  "effectiveSequence", "lifecycleState", "coulsonAuthorizationRef",
] as const;
const BINDING_AUTHORIZATION_FIELDS = [
  "schemaVersion", "contractVersion", "authorizationId", "missionId", "subjectId", "seatId", "bindingId",
  "bindingVersion", "priorBindingId", "priorBindingVersion", "bindingDigest", "authorityRef", "authorityDigest",
  "authoritySequence", "decision", "previousJournalSequence", "journalSequence", "signingKeyRef", "sourceRef", "issuedAt",
] as const;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{40,64})$/;
const DIGEST = /^sha256:(?:[A-Za-z0-9_-]{43}|[a-f0-9]{64})$/;
const KEY_REF = /^ed25519:sha256:[A-Za-z0-9_-]{43}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const CANONICAL_SEATS = new Set<string>(CANONICAL_ROLE_IDS);

export function compareDaisyCanonicalStringsV1(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const valid = <T,>(value: T): Valid<T> => ({ state: "valid", value });
const invalid = (code: string, ...errors: string[]): Invalid => ({ state: "invalid", code, errors });

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    !utilTypes.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function closed(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!plain(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return false;
  return fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value");
  });
}

function denseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  if (Reflect.ownKeys(value).length !== value.length + 1) return null;
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string") return null;
    result.push(descriptor.value);
  }
  return result;
}

function sequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function timestamp(value: unknown): value is EvidenceTimestamp {
  return closed(value, ["value", "provenance"]) && typeof value.value === "string" && ISO.test(value.value) &&
    Number.isFinite(Date.parse(value.value)) && (value.provenance === "hostTrusted" || value.provenance === "humanRecorded");
}

export function isCanonicalAbsoluteRootV1(value: unknown): value is string {
  return typeof value === "string" && value.length > 1 && value.length <= 4096 && isAbsolute(value) &&
    !value.includes("\\") && !value.includes("\0") && normalize(value) === value && resolve(value) === value;
}

export function rootsOverlapV1(left: string, right: string): boolean {
  const fromLeft = relative(left, right);
  const fromRight = relative(right, left);
  return fromLeft === "" || (!fromLeft.startsWith("..") && !isAbsolute(fromLeft)) ||
    fromRight === "" || (!fromRight.startsWith("..") && !isAbsolute(fromRight));
}

function copyAuthority(value: DaisyCoordinationAuthorityV1): DaisyCoordinationAuthorityV1 {
  return { ...value, approvedReadRoots: [...value.approvedReadRoots], issuedAt: { ...value.issuedAt } };
}

function copyRevocation(value: DaisyCoordinationAuthorityRevocationV1): DaisyCoordinationAuthorityRevocationV1 {
  return { ...value, issuedAt: { ...value.issuedAt } };
}

function copyBinding(value: DaisyCoordinationRuntimeBindingV1): DaisyCoordinationRuntimeBindingV1 {
  return { ...value };
}

function copyBindingAuthorization(value: DaisyCoordinationRuntimeBindingAuthorizationV1): DaisyCoordinationRuntimeBindingAuthorizationV1 {
  return { ...value, issuedAt: { ...value.issuedAt } };
}

export function validateDaisyCoordinationAuthorityV1(input: unknown): DaisyCoordinationContractResult<DaisyCoordinationAuthorityV1> {
  if (!closed(input, AUTHORITY_FIELDS)) return invalid("malformed", "Daisy coordination authority payload is not a closed data object.");
  if (input.schemaVersion !== DAISY_COORDINATION_AUTHORITY_SCHEMA_VERSION || input.contractVersion !== DAISY_COORDINATION_AUTHORITY_CONTRACT_VERSION ||
      input.authorityKind !== DAISY_COORDINATION_AUTHORITY_KIND || input.seatId !== "daisy" ||
      input.actionId !== DAISY_COORDINATION_ACTION_ID || input.effectClass !== DAISY_COORDINATION_EFFECT_CLASS ||
      input.capabilityClass !== DAISY_COORDINATION_CAPABILITY_CLASS) {
    return invalid("malformed", "Daisy coordination authority fixed contract tuple is invalid.");
  }
  if (!identifier(input.authorityRef) || !identifier(input.missionId) || !identifier(input.subjectId) ||
      !identifier(input.repositoryId) || !identifier(input.branch) || !identifier(input.effectKey) ||
      typeof input.missionRevisionId !== "string" || !REVISION.test(input.missionRevisionId) ||
      typeof input.headRevision !== "string" || !REVISION.test(input.headRevision) || !sequence(input.evaluatedThroughSequence) ||
      typeof input.signingKeyRef !== "string" || !KEY_REF.test(input.signingKeyRef) || !timestamp(input.issuedAt)) {
    return invalid("malformed", "Daisy coordination authority identity, revision, sequence, signer, or timestamp is invalid.");
  }
  if (!isCanonicalAbsoluteRootV1(input.canonicalRepositoryRoot) || !isCanonicalAbsoluteRootV1(input.durableArtifactRoot)) {
    return invalid("malformed", "Daisy coordination authority roots must be canonical absolute paths.");
  }
  const approvedReadRoots = denseStringArray(input.approvedReadRoots);
  if (!approvedReadRoots || approvedReadRoots.length === 0 || approvedReadRoots.some((root) => !isCanonicalAbsoluteRootV1(root))) {
    return invalid("malformed", "Daisy coordination approved read roots are malformed.");
  }
  if (new Set(approvedReadRoots).size !== approvedReadRoots.length ||
      approvedReadRoots.some((root, index) => index > 0 && compareDaisyCanonicalStringsV1(approvedReadRoots[index - 1], root) >= 0)) {
    return invalid("malformed", "Daisy coordination approved read roots must be sorted and unique.");
  }
  if (rootsOverlapV1(input.durableArtifactRoot, input.canonicalRepositoryRoot) ||
      approvedReadRoots.some((root) => rootsOverlapV1(input.durableArtifactRoot as string, root))) {
    return invalid("root_overlap", "Daisy durable artifact root must not overlap the repository or approved read roots.");
  }
  return valid(copyAuthority(input as unknown as DaisyCoordinationAuthorityV1));
}

export function createDaisyCoordinationAuthorityV1(input: unknown): DaisyCoordinationAuthorityV1 {
  const checked = validateDaisyCoordinationAuthorityV1(input);
  if (checked.state === "invalid") throw new Error(checked.errors.join(" "));
  return checked.value;
}

export function computeDaisyCoordinationAuthorityDigest(authority: DaisyCoordinationAuthorityV1): string {
  return `sha256:${createHash("sha256").update(canonicalJson(copyAuthority(authority))).digest("base64url")}`;
}

function trustedCoulsonBinding(
  signingKeyRef: string,
  missionId: string,
  sequenceValue: number,
  bindings: readonly TrustedHumanBinding[],
): DaisyCoordinationContractResult<TrustedHumanBinding> {
  const matches = bindings.filter((binding) => binding.seatId === "coulson" && binding.signingKeyRef === signingKeyRef &&
    binding.validFromSequence <= sequenceValue && (binding.validThroughSequence === null || sequenceValue <= binding.validThroughSequence) &&
    (binding.missionScope === "*" || binding.missionScope === missionId));
  if (matches.length !== 1) return invalid("binding_missing", "Trusted Coulson signing binding is missing or ambiguous.");
  if (computeEd25519SigningKeyRef(matches[0].publicKeySpkiBase64) !== signingKeyRef) {
    return invalid("binding_invalid", "Trusted Coulson signing-key reference is not self-consistent.");
  }
  return valid(matches[0]);
}

function verifySignature(payload: unknown, signatureBase64: string, binding: TrustedHumanBinding, label: string): DaisyCoordinationContractResult<true> {
  try {
    const publicKey = createPublicKey({ key: Buffer.from(binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(canonicalJson(payload)), publicKey, Buffer.from(signatureBase64, "base64"))) {
      return invalid("binding_invalid", `${label} signature is invalid.`);
    }
  } catch {
    return invalid("binding_invalid", `${label} signature or public key is malformed.`);
  }
  return valid(true);
}

export function validateSignedDaisyCoordinationAuthorityV1(input: unknown): DaisyCoordinationContractResult<SignedDaisyCoordinationAuthorityV1> {
  if (!closed(input, ["payload", "authorityDigest", "signatureBase64"])) return invalid("malformed", "Signed Daisy coordination authority envelope is malformed.");
  const payload = validateDaisyCoordinationAuthorityV1(input.payload);
  if (payload.state === "invalid") return payload;
  if (typeof input.authorityDigest !== "string" || input.authorityDigest !== computeDaisyCoordinationAuthorityDigest(payload.value)) {
    return invalid("digest_invalid", "Signed Daisy coordination authority digest is invalid.");
  }
  if (typeof input.signatureBase64 !== "string" || input.signatureBase64.length === 0) return invalid("provenance_missing", "Signed Daisy coordination authority signature is missing.");
  return valid({ payload: payload.value, authorityDigest: input.authorityDigest, signatureBase64: input.signatureBase64 });
}

export function createSignedDaisyCoordinationAuthorityV1(input: unknown): SignedDaisyCoordinationAuthorityV1 {
  const checked = validateSignedDaisyCoordinationAuthorityV1(input);
  if (checked.state === "invalid") throw new Error(checked.errors.join(" "));
  return checked.value;
}

export function verifySignedDaisyCoordinationAuthorityV1(
  input: unknown,
  trustedBindings: readonly TrustedHumanBinding[],
  expected: { missionId: string; subjectId: string; missionRevisionId: string; evaluatedThroughSequence: number; authoritySequence: number },
): DaisyCoordinationContractResult<SignedDaisyCoordinationAuthorityV1> {
  const checked = validateSignedDaisyCoordinationAuthorityV1(input);
  if (checked.state === "invalid") return checked;
  const payload = checked.value.payload;
  if (payload.missionId !== expected.missionId || payload.subjectId !== expected.subjectId || payload.missionRevisionId !== expected.missionRevisionId) {
    return invalid("subject_mismatch", "Daisy coordination authority mission identity is mismatched.");
  }
  if (payload.evaluatedThroughSequence !== expected.evaluatedThroughSequence || expected.authoritySequence !== expected.evaluatedThroughSequence + 1) {
    return invalid("sequence_invalid", "Daisy coordination authority is not bound to the next journal sequence.");
  }
  const trusted = trustedCoulsonBinding(payload.signingKeyRef, payload.missionId, expected.authoritySequence, trustedBindings);
  if (trusted.state === "invalid") return trusted;
  const signature = verifySignature(payload, checked.value.signatureBase64, trusted.value, "Daisy coordination authority");
  return signature.state === "invalid" ? signature : valid(checked.value);
}

export function validateDaisyCoordinationAuthorityRevocationV1(input: unknown): DaisyCoordinationContractResult<DaisyCoordinationAuthorityRevocationV1> {
  if (!closed(input, REVOCATION_FIELDS)) return invalid("malformed", "Daisy coordination authority revocation is not a closed data object.");
  if (input.schemaVersion !== 1 || input.contractVersion !== DAISY_COORDINATION_AUTHORITY_CONTRACT_VERSION ||
      !identifier(input.authorityRef) || typeof input.authorityDigest !== "string" || !DIGEST.test(input.authorityDigest) ||
      !identifier(input.missionId) || !identifier(input.subjectId) || typeof input.missionRevisionId !== "string" || !REVISION.test(input.missionRevisionId) ||
      !sequence(input.authoritySequence) || !sequence(input.previousJournalSequence) || !sequence(input.journalSequence) ||
      input.journalSequence !== (input.previousJournalSequence as number) + 1 || typeof input.signingKeyRef !== "string" ||
      !KEY_REF.test(input.signingKeyRef) || !identifier(input.sourceRef) || !timestamp(input.issuedAt)) {
    return invalid("malformed", "Daisy coordination authority revocation fields are invalid.");
  }
  return valid(copyRevocation(input as unknown as DaisyCoordinationAuthorityRevocationV1));
}

export function createDaisyCoordinationAuthorityRevocationV1(input: unknown): DaisyCoordinationAuthorityRevocationV1 {
  const checked = validateDaisyCoordinationAuthorityRevocationV1(input);
  if (checked.state === "invalid") throw new Error(checked.errors.join(" "));
  return checked.value;
}

export function validateSignedDaisyCoordinationAuthorityRevocationV1(input: unknown): DaisyCoordinationContractResult<SignedDaisyCoordinationAuthorityRevocationV1> {
  if (!closed(input, ["payload", "signatureBase64"])) return invalid("malformed", "Signed Daisy coordination revocation envelope is malformed.");
  const payload = validateDaisyCoordinationAuthorityRevocationV1(input.payload);
  if (payload.state === "invalid") return payload;
  if (typeof input.signatureBase64 !== "string" || input.signatureBase64.length === 0) return invalid("provenance_missing", "Signed Daisy coordination revocation signature is missing.");
  return valid({ payload: payload.value, signatureBase64: input.signatureBase64 });
}

export function createSignedDaisyCoordinationAuthorityRevocationV1(input: unknown): SignedDaisyCoordinationAuthorityRevocationV1 {
  const checked = validateSignedDaisyCoordinationAuthorityRevocationV1(input);
  if (checked.state === "invalid") throw new Error(checked.errors.join(" "));
  return checked.value;
}

export function verifySignedDaisyCoordinationAuthorityRevocationV1(
  input: unknown,
  trustedBindings: readonly TrustedHumanBinding[],
  active: { authorityRef: string; authorityDigest: string; authoritySequence: number; missionId: string; subjectId: string; missionRevisionId: string },
  expectedSequence: number,
): DaisyCoordinationContractResult<DaisyCoordinationAuthorityRevocationV1> {
  const checked = validateSignedDaisyCoordinationAuthorityRevocationV1(input);
  if (checked.state === "invalid") return checked;
  const payload = checked.value.payload;
  if (payload.authorityRef !== active.authorityRef || payload.authorityDigest !== active.authorityDigest || payload.authoritySequence !== active.authoritySequence ||
      payload.missionId !== active.missionId || payload.subjectId !== active.subjectId || payload.missionRevisionId !== active.missionRevisionId) {
    return invalid("subject_mismatch", "Daisy coordination revocation target is mismatched.");
  }
  if (payload.previousJournalSequence !== expectedSequence - 1 || payload.journalSequence !== expectedSequence) {
    return invalid("sequence_invalid", "Daisy coordination revocation sequence is stale.");
  }
  const trusted = trustedCoulsonBinding(payload.signingKeyRef, payload.missionId, expectedSequence, trustedBindings);
  if (trusted.state === "invalid") return trusted;
  const signature = verifySignature(payload, checked.value.signatureBase64, trusted.value, "Daisy coordination revocation");
  return signature.state === "invalid" ? signature : valid(payload);
}

export function validateDaisyCoordinationRuntimeBindingV1(input: unknown): DaisyCoordinationContractResult<DaisyCoordinationRuntimeBindingV1> {
  if (!closed(input, BINDING_FIELDS)) return invalid("malformed", "Daisy coordination runtime binding is not a closed data object.");
  if (input.schemaVersion !== 1 || input.contractVersion !== "daisy-coordination-runtime-binding.v1" || input.seatId !== "daisy" ||
      input.actionId !== DAISY_COORDINATION_ACTION_ID || input.effectClass !== DAISY_COORDINATION_EFFECT_CLASS ||
      input.capabilityClass !== DAISY_COORDINATION_CAPABILITY_CLASS || input.lifecycleState !== "active") {
    return invalid("malformed", "Daisy coordination runtime binding fixed tuple is invalid.");
  }
  for (const field of ["bindingId", "missionId", "subjectId", "runtimeId", "modelId", "executorId", "effectKey", "repositoryId", "branch", "authorityRef", "coulsonAuthorizationRef"] as const) {
    if (!identifier(input[field])) return invalid("malformed", `Daisy coordination runtime binding ${field} is invalid.`);
  }
  if (typeof input.missionRevisionId !== "string" || !REVISION.test(input.missionRevisionId) || typeof input.headRevision !== "string" || !REVISION.test(input.headRevision) ||
      typeof input.authorityDigest !== "string" || !DIGEST.test(input.authorityDigest) || !sequence(input.bindingVersion) || input.bindingVersion < 1 ||
      !sequence(input.authoritySequence) || input.authoritySequence < 1 || !sequence(input.effectiveSequence) || input.effectiveSequence < 1 ||
      !isCanonicalAbsoluteRootV1(input.canonicalRepositoryRoot) || !isCanonicalAbsoluteRootV1(input.durableArtifactRoot)) {
    return invalid("malformed", "Daisy coordination runtime binding revisions, sequences, digest, or roots are invalid.");
  }
  if ((input.priorBindingId === null) !== (input.priorBindingVersion === null) ||
      (input.priorBindingId !== null && !identifier(input.priorBindingId)) ||
      (input.priorBindingVersion !== null && (!sequence(input.priorBindingVersion) || input.priorBindingVersion < 1))) {
    return invalid("malformed", "Daisy coordination runtime binding prior identity is malformed.");
  }
  const identities = [input.seatId, input.runtimeId, input.modelId, input.executorId] as string[];
  if (new Set(identities).size !== identities.length || identities.slice(1).some((identity) => CANONICAL_SEATS.has(identity))) {
    return invalid("seat_mismatch", "Daisy seat, runtime, model, and executor must be pairwise distinct, and executor identities cannot be canonical seats.");
  }
  return valid(copyBinding(input as unknown as DaisyCoordinationRuntimeBindingV1));
}

export function createDaisyCoordinationRuntimeBindingV1(input: unknown): DaisyCoordinationRuntimeBindingV1 {
  const checked = validateDaisyCoordinationRuntimeBindingV1(input);
  if (checked.state === "invalid") throw new Error(checked.errors.join(" "));
  return checked.value;
}

export function computeDaisyCoordinationRuntimeBindingDigest(binding: DaisyCoordinationRuntimeBindingV1): string {
  return `sha256:${createHash("sha256").update(canonicalJson(copyBinding(binding))).digest("base64url")}`;
}

export function validateDaisyCoordinationRuntimeBindingAuthorizationV1(input: unknown): DaisyCoordinationContractResult<DaisyCoordinationRuntimeBindingAuthorizationV1> {
  if (!closed(input, BINDING_AUTHORIZATION_FIELDS)) return invalid("malformed", "Daisy coordination binding authorization is not a closed data object.");
  if (input.schemaVersion !== 1 || input.contractVersion !== "daisy-coordination-runtime-binding-authorization.v1" || input.seatId !== "daisy" || input.decision !== "approved") {
    return invalid("malformed", "Daisy coordination binding authorization fixed fields are invalid.");
  }
  for (const field of ["authorizationId", "missionId", "subjectId", "bindingId", "authorityRef", "sourceRef"] as const) {
    if (!identifier(input[field])) return invalid("malformed", `Daisy coordination binding authorization ${field} is invalid.`);
  }
  if (!sequence(input.bindingVersion) || input.bindingVersion < 1 || !sequence(input.authoritySequence) || input.authoritySequence < 1 ||
      !sequence(input.previousJournalSequence) || !sequence(input.journalSequence) || input.journalSequence !== input.previousJournalSequence + 1 ||
      typeof input.bindingDigest !== "string" || !DIGEST.test(input.bindingDigest) || typeof input.authorityDigest !== "string" || !DIGEST.test(input.authorityDigest) ||
      typeof input.signingKeyRef !== "string" || !KEY_REF.test(input.signingKeyRef) || !timestamp(input.issuedAt)) {
    return invalid("malformed", "Daisy coordination binding authorization sequences, digests, signer, or timestamp are invalid.");
  }
  if ((input.priorBindingId === null) !== (input.priorBindingVersion === null) ||
      (input.priorBindingId !== null && !identifier(input.priorBindingId)) ||
      (input.priorBindingVersion !== null && (!sequence(input.priorBindingVersion) || input.priorBindingVersion < 1))) {
    return invalid("malformed", "Daisy coordination binding authorization prior identity is malformed.");
  }
  return valid(copyBindingAuthorization(input as unknown as DaisyCoordinationRuntimeBindingAuthorizationV1));
}

export function createDaisyCoordinationRuntimeBindingAuthorizationV1(input: unknown): DaisyCoordinationRuntimeBindingAuthorizationV1 {
  const checked = validateDaisyCoordinationRuntimeBindingAuthorizationV1(input);
  if (checked.state === "invalid") throw new Error(checked.errors.join(" "));
  return checked.value;
}

export function validateSignedDaisyCoordinationRuntimeBindingAuthorizationV1(input: unknown): DaisyCoordinationContractResult<SignedDaisyCoordinationRuntimeBindingAuthorizationV1> {
  if (!closed(input, ["payload", "signatureBase64"])) return invalid("malformed", "Signed Daisy coordination binding authorization envelope is malformed.");
  const payload = validateDaisyCoordinationRuntimeBindingAuthorizationV1(input.payload);
  if (payload.state === "invalid") return payload;
  if (typeof input.signatureBase64 !== "string" || input.signatureBase64.length === 0) return invalid("provenance_missing", "Daisy coordination binding authorization signature is missing.");
  return valid({ payload: payload.value, signatureBase64: input.signatureBase64 });
}

export function createSignedDaisyCoordinationRuntimeBindingAuthorizationV1(input: unknown): SignedDaisyCoordinationRuntimeBindingAuthorizationV1 {
  const checked = validateSignedDaisyCoordinationRuntimeBindingAuthorizationV1(input);
  if (checked.state === "invalid") throw new Error(checked.errors.join(" "));
  return checked.value;
}

export function verifySignedDaisyCoordinationRuntimeBindingAuthorizationV1(
  envelopeInput: unknown,
  bindingInput: unknown,
  context: DaisyCoordinationBindingVerificationContextV1,
): DaisyCoordinationContractResult<DaisyCoordinationRuntimeBindingAuthorizationV1> {
  const envelope = validateSignedDaisyCoordinationRuntimeBindingAuthorizationV1(envelopeInput);
  if (envelope.state === "invalid") return envelope;
  const binding = validateDaisyCoordinationRuntimeBindingV1(bindingInput);
  if (binding.state === "invalid") return binding;
  const authorization = envelope.value.payload;
  const value = binding.value;
  if (!context.authorityActive) return invalid("authority_invalid", "Daisy coordination binding requires an active authority.");
  if (authorization.missionId !== context.missionId || authorization.subjectId !== context.subjectId ||
      value.missionId !== context.missionId || value.subjectId !== context.subjectId || value.missionRevisionId !== context.missionRevisionId) {
    return invalid("subject_mismatch", "Daisy coordination binding mission identity is mismatched.");
  }
  if (context.participantSeatIds.includes(value.runtimeId) || context.participantSeatIds.includes(value.modelId) || context.participantSeatIds.includes(value.executorId)) {
    return invalid("seat_mismatch", "Daisy coordination runtime, model, and executor cannot impersonate mission participants.");
  }
  if (!context.participantSeatIds.includes("daisy")) return invalid("seat_mismatch", "Daisy is not a mission participant.");
  if (authorization.previousJournalSequence !== context.lastSequence || authorization.journalSequence !== context.lastSequence + 1 ||
      value.effectiveSequence !== authorization.journalSequence) {
    return invalid("sequence_invalid", "Daisy coordination binding authorization is not bound to the next sequence.");
  }
  if (authorization.bindingId !== value.bindingId || authorization.bindingVersion !== value.bindingVersion ||
      authorization.priorBindingId !== value.priorBindingId || authorization.priorBindingVersion !== value.priorBindingVersion ||
      authorization.bindingDigest !== computeDaisyCoordinationRuntimeBindingDigest(value) || value.coulsonAuthorizationRef !== authorization.authorizationId) {
    return invalid("binding_invalid", "Daisy coordination binding authorization does not exact-bind the runtime binding.");
  }
  if (authorization.authorityRef !== context.authority.authorityRef || authorization.authorityDigest !== context.authorityDigest ||
      authorization.authoritySequence !== context.authoritySequence || value.authorityRef !== context.authority.authorityRef ||
      value.authorityDigest !== context.authorityDigest || value.authoritySequence !== context.authoritySequence ||
      context.authorityDigest !== computeDaisyCoordinationAuthorityDigest(context.authority)) {
    return invalid("authority_invalid", "Daisy coordination binding does not exact-bind the active authority.");
  }
  const authority = context.authority;
  if (value.seatId !== authority.seatId || value.actionId !== authority.actionId || value.effectClass !== authority.effectClass ||
      value.effectKey !== authority.effectKey || value.capabilityClass !== authority.capabilityClass ||
      value.repositoryId !== authority.repositoryId || value.canonicalRepositoryRoot !== authority.canonicalRepositoryRoot ||
      value.branch !== authority.branch || value.headRevision !== authority.headRevision || value.durableArtifactRoot !== authority.durableArtifactRoot) {
    return invalid("binding_invalid", "Daisy coordination binding widens or mismatches authority scope.");
  }
  const trusted = trustedCoulsonBinding(authorization.signingKeyRef, authorization.missionId, authorization.journalSequence, context.trustedBindings);
  if (trusted.state === "invalid") return trusted;
  const signature = verifySignature(authorization, envelope.value.signatureBase64, trusted.value, "Daisy coordination binding authorization");
  return signature.state === "invalid" ? signature : valid(authorization);
}

export { copyAuthority as copyDaisyCoordinationAuthorityV1, copyBinding as copyDaisyCoordinationRuntimeBindingV1 };
