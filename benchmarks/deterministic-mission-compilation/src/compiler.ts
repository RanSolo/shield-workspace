import {
  base64, boundedString, canonicalBytes, closedRecord, deepFreeze, denseArray,
  domainDigest, fromBase64,
} from "./canonical.js";
import {
  IDS,
  type CompilationManifestV0,
  type CompilationOutputV0,
  type ReceiptTrustV0,
  type Result,
  type ValidatedDispatchEnvelopeV0,
  type ValidationReceiptV0,
} from "./contracts.js";
import { ClosedFailure, fail } from "./errors.js";
import {
  normalizeContentBindings, normalizeGovernance, normalizeIR, normalizeProvenanceBindings,
  normalizeRegistry, normalizeSpec,
} from "./normalize.js";
import { renderCanonicalChatV1, validateProvenanceCoverage } from "./renderer.js";
import { verifyReceipt } from "./validator.js";

const ENVELOPE_FIELDS = [
  "envelopeVersion", "ir", "irBytesBase64", "governance", "registry", "renderer",
  "targetProfile", "sourceBindings", "provenanceBindings", "fixtureDigest", "contextDigest", "receipt",
] as const;
const TRUST_FIELDS = ["keyId", "publicKeyPem", "currentCounter", "revokedDispatchIds"] as const;

function normalizeTrust(input: unknown): ReceiptTrustV0 {
  const record = closedRecord(input, TRUST_FIELDS);
  if (!Number.isSafeInteger(record.currentCounter) || (record.currentCounter as number) < 0) {
    fail("MALFORMED_RECEIPT");
  }
  return Object.freeze({
    keyId: boundedString(record.keyId),
    publicKeyPem: boundedString(record.publicKeyPem, 10_000),
    currentCounter: record.currentCounter as number,
    revokedDispatchIds: Object.freeze(denseArray(record.revokedDispatchIds, 1_024).map((value) => boundedString(value))),
  });
}

function normalizeEnvelope(input: unknown): ValidatedDispatchEnvelopeV0 {
  const record = closedRecord(input, ENVELOPE_FIELDS);
  if (record.envelopeVersion !== IDS.envelope) fail("INVALID_CANDIDATE");
  const normalizedIr = normalizeIR(record.ir);
  const suppliedIrBytes = fromBase64(boundedString(record.irBytesBase64, 1_000_000));
  if (Buffer.compare(Buffer.from(suppliedIrBytes), Buffer.from(canonicalBytes(normalizedIr))) !== 0) {
    fail("IR_DIGEST_MISMATCH");
  }
  const governance = normalizeGovernance(record.governance);
  const registry = normalizeRegistry(record.registry);
  const renderer = normalizeSpec(record.renderer, IDS.renderer, "RENDERER_DIGEST_MISMATCH");
  const targetProfile = normalizeSpec(record.targetProfile, IDS.target, "TARGET_DIGEST_MISMATCH");
  const sourceBindings = normalizeContentBindings(record.sourceBindings);
  const provenanceBindings = normalizeProvenanceBindings(record.provenanceBindings, normalizedIr, sourceBindings);
  const fixtureDigest = domainDigest(
    "shield:dispatch:fixture:v0", canonicalBytes({ sourceBindings, provenanceBindings }),
  );
  const contextDigest = domainDigest("shield:dispatch:context:v0", canonicalBytes(normalizedIr.contextReferences));
  if (record.fixtureDigest !== fixtureDigest) fail("FIXTURE_DIGEST_MISMATCH");
  if (record.contextDigest !== contextDigest) fail("CONTEXT_DIGEST_MISMATCH");
  if (record.receipt === null || record.receipt === undefined) fail("MISSING_RECEIPT");
  return deepFreeze({
    envelopeVersion: IDS.envelope,
    ir: normalizedIr,
    irBytesBase64: base64(canonicalBytes(normalizedIr)),
    governance, registry, renderer, targetProfile, sourceBindings, provenanceBindings,
    fixtureDigest, contextDigest,
    receipt: record.receipt as ValidationReceiptV0,
  });
}

export function compileDispatch(
  envelopeInput: unknown,
  trustInput: unknown,
): Result<CompilationOutputV0> {
  try {
    const envelope = normalizeEnvelope(envelopeInput);
    const trust = normalizeTrust(trustInput);
    const receiptPayload = verifyReceipt(envelope, trust);
    if (receiptPayload.compilerId !== IDS.compiler || receiptPayload.validatorId !== IDS.validator) {
      fail("RECEIPT_BINDING_MISMATCH");
    }
    const rendered = renderCanonicalChatV1(envelope);
    validateProvenanceCoverage(rendered.promptBytes, rendered.spans);
    const promptDigest = domainDigest("shield:dispatch:prompt:v0", rendered.promptBytes);
    const provenanceValue = {
      format: IDS.provenance,
      promptDigest,
      spans: rendered.spans,
    };
    const provenanceBytes = canonicalBytes(provenanceValue);
    const provenanceDigest = domainDigest("shield:dispatch:provenance:v0", provenanceBytes);
    const irDigest = domainDigest(
      "shield:dispatch:ir:v0",
      fromBase64(envelope.irBytesBase64),
    );
    const manifest: CompilationManifestV0 = Object.freeze({
      format: IDS.manifest,
      compilerId: IDS.compiler,
      rendererId: IDS.renderer,
      targetProfileId: IDS.target,
      irDigest,
      governanceDigest: envelope.governance.digest,
      registryDigest: envelope.registry.digest,
      fixtureDigest: envelope.fixtureDigest,
      contextDigest: envelope.contextDigest,
      rendererDigest: envelope.renderer.digest,
      targetProfileDigest: envelope.targetProfile.digest,
      promptDigest,
      provenanceDigest,
      promptByteLength: rendered.promptBytes.byteLength,
      provenanceByteLength: provenanceBytes.byteLength,
    });
    const manifestBytes = canonicalBytes(manifest);
    return Object.freeze({
      state: "ok",
      value: Object.freeze({
        promptBytes: rendered.promptBytes.slice(),
        provenanceBytes: provenanceBytes.slice(),
        manifestBytes: manifestBytes.slice(),
        manifest,
      }),
    });
  } catch (error) {
    if (error instanceof ClosedFailure) return Object.freeze({ state: "invalid", reason: error.reason });
    return Object.freeze({ state: "invalid", reason: "INVALID_CANDIDATE" });
  }
}

export function deterministicOutputIdentity(output: CompilationOutputV0): Readonly<{
  promptDigest: string; provenanceDigest: string; manifestDigest: string;
}> {
  return Object.freeze({
    promptDigest: domainDigest("shield:dispatch:prompt:v0", output.promptBytes),
    provenanceDigest: domainDigest("shield:dispatch:provenance:v0", output.provenanceBytes),
    manifestDigest: domainDigest("shield:dispatch:deterministic-manifest:v0", output.manifestBytes),
  });
}
