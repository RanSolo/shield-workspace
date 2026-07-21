import { createHash } from "node:crypto";

export const IDS = Object.freeze({
  experiment: "deterministic-mission-compilation-v2",
  trial: "stage-a-trial-003",
  candidate: "deterministic-mission-compilation-candidate.v2",
  freeze: "deterministic-mission-compilation-stage-a-freeze.v2",
  wrapper: "common-runtime-wrapper.v2",
  runtimeEnvelope: "runtime-message-envelope.v2",
  runtimeEnvelopeSpec: "runtime-message-envelope-spec.v2",
  targetProfile: "codex-text.v2",
});

const encoder = new TextEncoder();
export const utf8 = (value) => encoder.encode(value);

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function domainDigest(domain, bytes) {
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return createHash("sha256").update(utf8(domain)).update(length).update(bytes).digest("hex");
}

export const canonicalBytes = (value) => utf8(JSON.stringify(value));

export function createRuntimeArtifacts({ sharedInstructionBytes, controlPromptBytes, compiledPromptBytes }) {
  const sharedInstructionDigest = domainDigest("shield:runtime:shared-instructions:v1", sharedInstructionBytes);
  const wrapperBytes = utf8(`# common-runtime-wrapper.v2
Experiment: ${IDS.experiment}
Trial: ${IDS.trial}
Candidate: ${IDS.candidate}
Accountable seat: may
Authority: descriptive-only
Shared instructions digest: ${sharedInstructionDigest}

`);
  const wrapperDigest = domainDigest("shield:runtime:wrapper:v2", wrapperBytes);
  const targetProfileBytes = canonicalBytes(Object.freeze({
    id: IDS.targetProfile,
    transport: IDS.runtimeEnvelope,
    messages: 2,
    runtimeAdditions: "forbidden",
    encoding: "utf-8",
  }));
  const targetProfileDigest = domainDigest("shield:dispatch:target:v2", targetProfileBytes);
  const runtimeEnvelopeSpecBytes = canonicalBytes(Object.freeze({
    id: IDS.runtimeEnvelopeSpec,
    format: IDS.runtimeEnvelope,
    encoding: "canonical-json-utf8",
    messageOrder: Object.freeze(["system", "user"]),
    systemAssembly: Object.freeze([IDS.wrapper, "shared-runtime-instructions.v1"]),
    systemSeparatorBytesBase64: "",
    userAssembly: "exact-arm-prompt-bytes",
    additionalMessages: "forbidden",
    normalization: "none",
    targetProfileId: IDS.targetProfile,
  }));
  const runtimeEnvelopeSpecSha256 = sha256(runtimeEnvelopeSpecBytes);
  const systemBytes = Buffer.concat([Buffer.from(wrapperBytes), Buffer.from(sharedInstructionBytes)]);
  const envelope = (arm, promptBytes, promptDomain) => {
    const value = Object.freeze({
      format: IDS.runtimeEnvelope,
      experimentId: IDS.experiment,
      trialId: IDS.trial,
      candidateId: IDS.candidate,
      arm,
      runtimeEnvelopeSpecSha256,
      targetProfileId: IDS.targetProfile,
      targetProfileDigest,
      wrapperId: IDS.wrapper,
      wrapperDigest,
      sharedInstructionDigest,
      armPromptDigest: domainDigest(promptDomain, promptBytes),
      messages: Object.freeze([
        Object.freeze({ role: "system", bytesBase64: systemBytes.toString("base64") }),
        Object.freeze({ role: "user", bytesBase64: Buffer.from(promptBytes).toString("base64") }),
      ]),
    });
    const bytes = canonicalBytes(value);
    return Object.freeze({ value, bytes, digest: domainDigest(`shield:runtime:message-envelope:${arm}:v2`, bytes) });
  };
  return Object.freeze({
    sharedInstructionDigest,
    wrapperBytes,
    wrapperDigest,
    targetProfileBytes,
    targetProfileDigest,
    runtimeEnvelopeSpecBytes,
    runtimeEnvelopeSpecSha256,
    controlEnvelope: envelope("control", controlPromptBytes, "shield:control:prompt:v1"),
    compiledEnvelope: envelope("compiled", compiledPromptBytes, "shield:compiled:prompt:v1"),
  });
}

export function verifySpecBinding(specBytes, recordedSha256) {
  if (typeof recordedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(recordedSha256)) {
    return Object.freeze({ state: "invalid", reason: "RUNTIME_ENVELOPE_SPEC_DIGEST_MALFORMED" });
  }
  if (sha256(specBytes) !== recordedSha256) {
    return Object.freeze({ state: "invalid", reason: "RUNTIME_ENVELOPE_SPEC_DIGEST_MISMATCH" });
  }
  return Object.freeze({ state: "ok", digest: recordedSha256 });
}

export function verifyRuntimeEnvelope(arm, artifacts, envelopeInput) {
  if (arm !== "control" && arm !== "compiled") return Object.freeze({ state: "invalid", reason: "RUNTIME_ENVELOPE_MISMATCH" });
  const expected = arm === "control" ? artifacts.controlEnvelope : artifacts.compiledEnvelope;
  const binding = verifySpecBinding(artifacts.runtimeEnvelopeSpecBytes, envelopeInput?.runtimeEnvelopeSpecSha256);
  if (binding.state !== "ok") return binding;
  if (JSON.stringify(envelopeInput) !== JSON.stringify(expected.value)) {
    return Object.freeze({ state: "invalid", reason: "RUNTIME_ENVELOPE_MISMATCH" });
  }
  return Object.freeze({ state: "ok", digest: expected.digest });
}
