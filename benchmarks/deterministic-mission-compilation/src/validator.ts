import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

import {
  assertDigest, base64, boundedString, canonicalBytes, closedRecord, deepFreeze, denseArray,
  domainDigest, fromBase64,
} from "./canonical.js";
import {
  IDS,
  type DispatchCandidateV0,
  type HostObservationV0,
  type ReceiptPayloadV0,
  type ReceiptTrustV0,
  type Result,
  type ValidatedDispatchEnvelopeV0,
  type ValidationReceiptV0,
} from "./contracts.js";
import { ClosedFailure, fail } from "./errors.js";
import { candidateDigests, candidateProvenanceBundle, normalizeCandidate } from "./normalize.js";

const OBSERVATION_FIELDS = [
  "observationVersion", "keyId", "validatorId", "compilerId", "singleDispatchId",
  "expectedIrDigest", "expectedGovernanceDigest", "expectedRegistryDigest",
  "expectedFixtureDigest", "expectedContextDigest", "expectedRendererDigest",
  "expectedTargetProfileDigest",
  "issuanceCounter", "expiresAfterCounter", "currentAuthorization",
] as const;
const RECEIPT_FIELDS = ["format", "payloadBase64", "payloadDigest", "signatureBase64"] as const;
const PAYLOAD_FIELDS = [
  "receiptFormat", "keyId", "validatorId", "compilerId", "experimentId", "trialId",
  "replayId", "armId", "singleDispatchId", "repository", "branch", "baseCommit", "baseTree",
  "accountableSeat", "artifactOwner", "gate", "governanceHeadEntryId", "governanceSequence",
  "irDigest", "governanceDigest", "registryDigest", "fixtureDigest", "contextDigest",
  "rendererDigest", "targetProfileDigest", "issuanceCounter", "expiresAfterCounter",
] as const;

function normalizeObservation(input: unknown): HostObservationV0 {
  const record = closedRecord(input, OBSERVATION_FIELDS);
  if (record.observationVersion !== "trusted-host-observation.v0" ||
      record.validatorId !== IDS.validator || record.compilerId !== IDS.compiler ||
      record.currentAuthorization !== "authorized" ||
      !Number.isSafeInteger(record.issuanceCounter) || !Number.isSafeInteger(record.expiresAfterCounter) ||
      (record.issuanceCounter as number) < 0 ||
      (record.expiresAfterCounter as number) <= (record.issuanceCounter as number)) {
    fail("INVALID_CANDIDATE");
  }
  const expectedDigests = {
    expectedIrDigest: boundedString(record.expectedIrDigest, 64),
    expectedGovernanceDigest: boundedString(record.expectedGovernanceDigest, 64),
    expectedRegistryDigest: boundedString(record.expectedRegistryDigest, 64),
    expectedFixtureDigest: boundedString(record.expectedFixtureDigest, 64),
    expectedContextDigest: boundedString(record.expectedContextDigest, 64),
    expectedRendererDigest: boundedString(record.expectedRendererDigest, 64),
    expectedTargetProfileDigest: boundedString(record.expectedTargetProfileDigest, 64),
  };
  Object.values(expectedDigests).forEach(assertDigest);
  return Object.freeze({
    observationVersion: "trusted-host-observation.v0",
    keyId: boundedString(record.keyId), validatorId: IDS.validator, compilerId: IDS.compiler,
    singleDispatchId: boundedString(record.singleDispatchId),
    ...expectedDigests,
    issuanceCounter: record.issuanceCounter as number,
    expiresAfterCounter: record.expiresAfterCounter as number,
    currentAuthorization: "authorized",
  });
}

function receiptPayload(
  candidate: DispatchCandidateV0,
  observation: Pick<HostObservationV0, "keyId" | "singleDispatchId" | "issuanceCounter" | "expiresAfterCounter">,
): ReceiptPayloadV0 {
  const digests = candidateDigests(candidate);
  const ir = candidate.ir;
  return Object.freeze({
    receiptFormat: IDS.receipt,
    keyId: observation.keyId,
    validatorId: IDS.validator,
    compilerId: IDS.compiler,
    experimentId: ir.experimentId,
    trialId: ir.trialId,
    replayId: ir.replayId,
    armId: ir.armId,
    singleDispatchId: observation.singleDispatchId,
    repository: ir.repository,
    branch: ir.branch,
    baseCommit: ir.baseCommit,
    baseTree: ir.baseTree,
    accountableSeat: ir.accountableSeat,
    artifactOwner: ir.artifactOwner,
    gate: ir.gate,
    governanceHeadEntryId: candidate.governance.journalHeadEntryId,
    governanceSequence: candidate.governance.journalSequence,
    irDigest: digests.irDigest,
    governanceDigest: candidate.governance.digest,
    registryDigest: candidate.registry.digest,
    fixtureDigest: digests.fixtureDigest,
    contextDigest: digests.contextDigest,
    rendererDigest: candidate.renderer.digest,
    targetProfileDigest: candidate.targetProfile.digest,
    issuanceCounter: observation.issuanceCounter,
    expiresAfterCounter: observation.expiresAfterCounter,
  });
}

function receiptPayloadFromEnvelope(
  envelope: ValidatedDispatchEnvelopeV0,
  observation: Pick<HostObservationV0, "keyId" | "singleDispatchId" | "issuanceCounter" | "expiresAfterCounter">,
): ReceiptPayloadV0 {
  const ir = envelope.ir;
  return Object.freeze({
    receiptFormat: IDS.receipt, keyId: observation.keyId, validatorId: IDS.validator,
    compilerId: IDS.compiler, experimentId: ir.experimentId, trialId: ir.trialId,
    replayId: ir.replayId, armId: ir.armId, singleDispatchId: observation.singleDispatchId,
    repository: ir.repository, branch: ir.branch, baseCommit: ir.baseCommit, baseTree: ir.baseTree,
    accountableSeat: ir.accountableSeat, artifactOwner: ir.artifactOwner, gate: ir.gate,
    governanceHeadEntryId: envelope.governance.journalHeadEntryId,
    governanceSequence: envelope.governance.journalSequence,
    irDigest: domainDigest("shield:dispatch:ir:v0", canonicalBytes(ir)),
    governanceDigest: envelope.governance.digest, registryDigest: envelope.registry.digest,
    fixtureDigest: envelope.fixtureDigest, contextDigest: envelope.contextDigest,
    rendererDigest: envelope.renderer.digest, targetProfileDigest: envelope.targetProfile.digest,
    issuanceCounter: observation.issuanceCounter,
    expiresAfterCounter: observation.expiresAfterCounter,
  });
}

export function issueValidatedDispatch(
  candidateInput: unknown,
  observationInput: unknown,
  privateKeyPem: string,
): Result<ValidatedDispatchEnvelopeV0> {
  try {
    const candidate = normalizeCandidate(candidateInput);
    const observation = normalizeObservation(observationInput);
    const candidateIdentity = candidateDigests(candidate);
    if (candidateIdentity.irDigest !== observation.expectedIrDigest) fail("IR_DIGEST_MISMATCH");
    if (candidate.governance.digest !== observation.expectedGovernanceDigest) fail("GOVERNANCE_DIGEST_MISMATCH");
    if (candidate.registry.digest !== observation.expectedRegistryDigest) fail("REGISTRY_DIGEST_MISMATCH");
    if (candidateIdentity.fixtureDigest !== observation.expectedFixtureDigest) fail("FIXTURE_DIGEST_MISMATCH");
    if (candidateIdentity.contextDigest !== observation.expectedContextDigest) fail("CONTEXT_DIGEST_MISMATCH");
    if (candidate.renderer.digest !== observation.expectedRendererDigest) fail("RENDERER_DIGEST_MISMATCH");
    if (candidate.targetProfile.digest !== observation.expectedTargetProfileDigest) fail("TARGET_DIGEST_MISMATCH");
    const payload = receiptPayload(candidate, observation);
    const payloadBytes = canonicalBytes(payload);
    const payloadDigest = domainDigest("shield:dispatch:validation-receipt-payload:v0", payloadBytes);
    const signature = sign(null, payloadBytes, createPrivateKey(privateKeyPem));
    const receipt: ValidationReceiptV0 = Object.freeze({
      format: IDS.receipt,
      payloadBase64: base64(payloadBytes),
      payloadDigest,
      signatureBase64: signature.toString("base64"),
    });
    const digests = candidateDigests(candidate);
    const provenance = candidateProvenanceBundle(candidate);
    const envelope: ValidatedDispatchEnvelopeV0 = deepFreeze({
      envelopeVersion: IDS.envelope,
      ir: candidate.ir,
      irBytesBase64: base64(digests.irBytes),
      governance: candidate.governance,
      registry: candidate.registry,
      renderer: candidate.renderer,
      targetProfile: candidate.targetProfile,
      sourceBindings: provenance.sourceBindings,
      provenanceBindings: provenance.provenanceBindings,
      fixtureDigest: digests.fixtureDigest,
      contextDigest: digests.contextDigest,
      receipt,
    });
    return Object.freeze({ state: "ok", value: envelope });
  } catch (error) {
    if (error instanceof ClosedFailure) return Object.freeze({ state: "invalid", reason: error.reason });
    return Object.freeze({ state: "invalid", reason: "INVALID_CANDIDATE" });
  }
}

export function decodeReceipt(receiptInput: unknown): ReceiptPayloadV0 {
  if (receiptInput === null || receiptInput === undefined) fail("MISSING_RECEIPT");
  const receipt = closedRecord(receiptInput, RECEIPT_FIELDS);
  if (receipt.format !== IDS.receipt) fail("MALFORMED_RECEIPT");
  const payloadBytes = fromBase64(boundedString(receipt.payloadBase64, 100_000), "MALFORMED_RECEIPT");
  if (domainDigest("shield:dispatch:validation-receipt-payload:v0", payloadBytes) !== receipt.payloadDigest) {
    fail("MALFORMED_RECEIPT");
  }
  let payload: unknown;
  try { payload = JSON.parse(Buffer.from(payloadBytes).toString("utf8")); }
  catch { fail("MALFORMED_RECEIPT"); }
  try {
    const record = closedRecord(payload, PAYLOAD_FIELDS);
    if (record.receiptFormat !== IDS.receipt ||
        !Number.isSafeInteger(record.governanceSequence) || (record.governanceSequence as number) < 0 ||
        !Number.isSafeInteger(record.issuanceCounter) || (record.issuanceCounter as number) < 0 ||
        !Number.isSafeInteger(record.expiresAfterCounter) ||
        (record.expiresAfterCounter as number) <= (record.issuanceCounter as number)) {
      fail("MALFORMED_RECEIPT");
    }
    const digestFields = [
      record.irDigest, record.governanceDigest, record.registryDigest, record.fixtureDigest,
      record.contextDigest, record.rendererDigest, record.targetProfileDigest,
    ].map((value) => boundedString(value, 64));
    digestFields.forEach(assertDigest);
    const normalized: ReceiptPayloadV0 = Object.freeze({
      receiptFormat: IDS.receipt,
      keyId: boundedString(record.keyId), validatorId: boundedString(record.validatorId),
      compilerId: boundedString(record.compilerId),
      experimentId: boundedString(record.experimentId), trialId: boundedString(record.trialId),
      replayId: boundedString(record.replayId), armId: boundedString(record.armId),
      singleDispatchId: boundedString(record.singleDispatchId), repository: boundedString(record.repository),
      branch: boundedString(record.branch), baseCommit: boundedString(record.baseCommit, 40),
      baseTree: boundedString(record.baseTree, 40), accountableSeat: boundedString(record.accountableSeat),
      artifactOwner: boundedString(record.artifactOwner), gate: boundedString(record.gate),
      governanceHeadEntryId: boundedString(record.governanceHeadEntryId),
      governanceSequence: record.governanceSequence as number,
      irDigest: digestFields[0] as string, governanceDigest: digestFields[1] as string,
      registryDigest: digestFields[2] as string, fixtureDigest: digestFields[3] as string,
      contextDigest: digestFields[4] as string, rendererDigest: digestFields[5] as string,
      targetProfileDigest: digestFields[6] as string,
      issuanceCounter: record.issuanceCounter as number,
      expiresAfterCounter: record.expiresAfterCounter as number,
    });
    if (Buffer.compare(Buffer.from(canonicalBytes(normalized)), Buffer.from(payloadBytes)) !== 0) {
      fail("MALFORMED_RECEIPT");
    }
    return normalized;
  } catch {
    fail("MALFORMED_RECEIPT");
  }
}

export function verifyReceipt(
  envelope: ValidatedDispatchEnvelopeV0,
  trust: ReceiptTrustV0,
): ReceiptPayloadV0 {
  const receipt = envelope.receipt;
  const payload = decodeReceipt(receipt);
  const payloadBytes = fromBase64(receipt.payloadBase64, "MALFORMED_RECEIPT");
  if (payload.keyId !== trust.keyId) fail("RECEIPT_BINDING_MISMATCH");
  const signature = fromBase64(receipt.signatureBase64, "MALFORMED_RECEIPT");
  if (!verify(null, payloadBytes, createPublicKey(trust.publicKeyPem), signature)) fail("FORGED_RECEIPT");
  const expected = receiptPayloadFromEnvelope(envelope, {
    keyId: trust.keyId,
    singleDispatchId: payload.singleDispatchId,
    issuanceCounter: payload.issuanceCounter,
    expiresAfterCounter: payload.expiresAfterCounter,
  });
  if (Buffer.compare(Buffer.from(canonicalBytes(expected)), Buffer.from(payloadBytes)) !== 0) {
    fail("RECEIPT_BINDING_MISMATCH");
  }
  if (!Number.isSafeInteger(trust.currentCounter) || trust.currentCounter < payload.issuanceCounter ||
      trust.currentCounter > payload.expiresAfterCounter) fail("RECEIPT_EXPIRED");
  const revoked = denseArray(trust.revokedDispatchIds, 1_024).map((value) => boundedString(value));
  if (new Set(revoked).size !== revoked.length) fail("MALFORMED_RECEIPT");
  if (revoked.includes(payload.singleDispatchId)) fail("RECEIPT_REVOKED");
  return deepFreeze(payload);
}

export function derivePublicKeyPem(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem)).export({ type: "spki", format: "pem" }).toString();
}
