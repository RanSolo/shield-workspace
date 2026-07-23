import { createHash } from "node:crypto";

export const HELICARRIER_V0_ID = "shield-helicarrier.v0" as const;
export const HELICARRIER_CERTIFIED_NESTED_IDENTITIES = Object.freeze({
  compilerId: "shield-compiler@0.1.0-experiment",
  validatorId: "shield-dispatch-validator@0.1.0-experiment",
  rendererId: "canonical-chat-v1",
  targetProfileId: "codex-text.v0",
  registryId: "shield-dispatch-registry.v0",
} as const);
export type HelicarrierFailureV0 = "INVALID_REQUEST" | "NESTED_IDENTITY_MISMATCH" | "VALIDATION_FAILED" | "COMPILATION_FAILED" | "OUTPUT_INVALID";
export type HelicarrierResultV0<T> = Readonly<{ state: "ok"; value: T }> | Readonly<{ state: "invalid"; reason: HelicarrierFailureV0 }>;

export interface HelicarrierCertificationIdentityV0 {
  readonly certificationId: "deterministic-mission-compilation-stage-a-certification.v1";
  readonly certificationCommit: "5fce3051d774c3315eeb86445f6d3724e630cf9b";
  readonly experimentId: "deterministic-mission-compilation-v2";
  readonly compilerId: string; readonly validatorId: string; readonly rendererId: string;
  readonly targetProfileId: string; readonly registryId: string;
}
export interface HelicarrierRequestV0 { readonly dispatchId: string; readonly envelope: unknown; readonly trust: unknown; }
export interface HelicarrierValidatedInputV0 {
  readonly value: unknown;
  readonly identity: Readonly<{ compilerId: string; validatorId: string; rendererId: string; targetProfileId: string; registryId: string }>;
}
export interface HelicarrierCompilationOutputV0 { readonly promptBytes: Uint8Array; readonly provenanceBytes: Uint8Array; readonly manifestBytes: Uint8Array; }
export interface HelicarrierDependenciesV0 {
  readonly certification: HelicarrierCertificationIdentityV0;
  readonly validate: (envelope: unknown, trust: unknown) => HelicarrierResultV0<HelicarrierValidatedInputV0>;
  readonly compile: (validated: unknown, trust: unknown) => HelicarrierResultV0<HelicarrierCompilationOutputV0>;
}
export interface HelicarrierReceiptV0 {
  readonly format: "helicarrier-compilation-receipt.v0"; readonly dispatchId: string;
  readonly certificationId: string; readonly certificationCommit: string; readonly experimentId: string;
  readonly compilerId: string; readonly validatorId: string; readonly rendererId: string;
  readonly targetProfileId: string; readonly registryId: string; readonly promptDigest: string;
  readonly provenanceDigest: string; readonly manifestDigest: string;
}
export interface HelicarrierSuccessV0 { readonly platformId: typeof HELICARRIER_V0_ID; readonly output: HelicarrierCompilationOutputV0; readonly receipt: HelicarrierReceiptV0; }

function plain(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function identifier(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/.test(value); }
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> { return plain(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field)); }
function digest(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function certificationValid(value: unknown): value is HelicarrierCertificationIdentityV0 {
  return exact(value, ["certificationId", "certificationCommit", "experimentId", "compilerId", "validatorId", "rendererId", "targetProfileId", "registryId"]) &&
    value.certificationId === "deterministic-mission-compilation-stage-a-certification.v1" && value.certificationCommit === "5fce3051d774c3315eeb86445f6d3724e630cf9b" && value.experimentId === "deterministic-mission-compilation-v2" && value.compilerId === HELICARRIER_CERTIFIED_NESTED_IDENTITIES.compilerId && value.validatorId === HELICARRIER_CERTIFIED_NESTED_IDENTITIES.validatorId && value.rendererId === HELICARRIER_CERTIFIED_NESTED_IDENTITIES.rendererId && value.targetProfileId === HELICARRIER_CERTIFIED_NESTED_IDENTITIES.targetProfileId && value.registryId === HELICARRIER_CERTIFIED_NESTED_IDENTITIES.registryId;
}
function requestValid(value: unknown): value is HelicarrierRequestV0 { return exact(value, ["dispatchId", "envelope", "trust"]) && identifier(value.dispatchId); }
function outputValid(value: unknown): value is HelicarrierCompilationOutputV0 { return plain(value) && Object.keys(value).length === 3 && value.promptBytes instanceof Uint8Array && value.provenanceBytes instanceof Uint8Array && value.manifestBytes instanceof Uint8Array; }
function identityMatches(identity: HelicarrierValidatedInputV0["identity"], certification: HelicarrierCertificationIdentityV0): boolean { return identity.compilerId === certification.compilerId && identity.validatorId === certification.validatorId && identity.rendererId === certification.rendererId && identity.targetProfileId === certification.targetProfileId && identity.registryId === certification.registryId; }

export function runHelicarrierV0(requestInput: unknown, dependencies: HelicarrierDependenciesV0): HelicarrierResultV0<HelicarrierSuccessV0> {
  try {
    if (!requestValid(requestInput) || !certificationValid(dependencies.certification)) return { state: "invalid", reason: "INVALID_REQUEST" };
  } catch {
    return { state: "invalid", reason: "INVALID_REQUEST" };
  }
  let validated: HelicarrierResultV0<HelicarrierValidatedInputV0>;
  try { validated = dependencies.validate(requestInput.envelope, requestInput.trust); }
  catch { return { state: "invalid", reason: "VALIDATION_FAILED" }; }
  if (validated.state !== "ok") return { state: "invalid", reason: "VALIDATION_FAILED" };
  try {
    if (!identityMatches(validated.value.identity, dependencies.certification)) return { state: "invalid", reason: "NESTED_IDENTITY_MISMATCH" };
  } catch {
    return { state: "invalid", reason: "NESTED_IDENTITY_MISMATCH" };
  }
  let compiled: HelicarrierResultV0<HelicarrierCompilationOutputV0>;
  try { compiled = dependencies.compile(validated.value.value, requestInput.trust); }
  catch { return { state: "invalid", reason: "COMPILATION_FAILED" }; }
  if (compiled.state !== "ok") return { state: "invalid", reason: "COMPILATION_FAILED" };
  if (!outputValid(compiled.value)) return { state: "invalid", reason: "OUTPUT_INVALID" };
  const output = Object.freeze({ promptBytes: compiled.value.promptBytes.slice(), provenanceBytes: compiled.value.provenanceBytes.slice(), manifestBytes: compiled.value.manifestBytes.slice() });
  const certification = dependencies.certification;
  const receipt: HelicarrierReceiptV0 = Object.freeze({ format: "helicarrier-compilation-receipt.v0", dispatchId: requestInput.dispatchId, certificationId: certification.certificationId, certificationCommit: certification.certificationCommit, experimentId: certification.experimentId, compilerId: certification.compilerId, validatorId: certification.validatorId, rendererId: certification.rendererId, targetProfileId: certification.targetProfileId, registryId: certification.registryId, promptDigest: digest(output.promptBytes), provenanceDigest: digest(output.provenanceBytes), manifestDigest: digest(output.manifestBytes) });
  return { state: "ok", value: Object.freeze({ platformId: HELICARRIER_V0_ID, output, receipt }) };
}
