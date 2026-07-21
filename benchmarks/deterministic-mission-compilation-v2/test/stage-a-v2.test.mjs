import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IDS,
  createRuntimeArtifacts,
  sha256,
  verifyRuntimeEnvelope,
  verifySpecBinding,
} from "../src/runtime-envelope.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const artifact = (name) => readFileSync(resolve(root, "deterministic-mission-compilation-v1/artifacts", name));
const inputs = () => ({
  sharedInstructionBytes: artifact("shared-runtime-instructions.utf8"),
  controlPromptBytes: artifact("control-prompt.utf8"),
  compiledPromptBytes: artifact("compiled-prompt.utf8"),
});
const clone = (value) => JSON.parse(JSON.stringify(value));

test("v2 identities are distinct from the failed v1 envelope candidate", () => {
  assert.equal(IDS.experiment, "deterministic-mission-compilation-v2");
  assert.equal(IDS.freeze, "deterministic-mission-compilation-stage-a-freeze.v2");
  assert.equal(IDS.runtimeEnvelope, "runtime-message-envelope.v2");
  assert.equal(IDS.targetProfile, "codex-text.v2");
});

test("runtime artifacts are deterministic and bind the exact specification bytes", () => {
  const first = createRuntimeArtifacts(inputs());
  const second = createRuntimeArtifacts(inputs());
  assert.deepEqual(first, second);
  assert.equal(first.runtimeEnvelopeSpecSha256, sha256(first.runtimeEnvelopeSpecBytes));
  assert.equal(first.controlEnvelope.value.runtimeEnvelopeSpecSha256, first.runtimeEnvelopeSpecSha256);
  assert.equal(first.compiledEnvelope.value.runtimeEnvelopeSpecSha256, first.runtimeEnvelopeSpecSha256);
});

test("mistyped runtime-envelope specification digest fails closed", () => {
  const value = createRuntimeArtifacts(inputs());
  const replacement = value.runtimeEnvelopeSpecSha256[0] === "0" ? "1" : "0";
  const mistyped = `${replacement}${value.runtimeEnvelopeSpecSha256.slice(1)}`;
  assert.deepEqual(verifySpecBinding(value.runtimeEnvelopeSpecBytes, mistyped), {
    state: "invalid",
    reason: "RUNTIME_ENVELOPE_SPEC_DIGEST_MISMATCH",
  });
});

test("substituted runtime-envelope specification bytes fail closed", () => {
  const value = createRuntimeArtifacts(inputs());
  const changed = Buffer.concat([Buffer.from(value.runtimeEnvelopeSpecBytes), Buffer.from("\n")]);
  assert.deepEqual(verifySpecBinding(changed, value.runtimeEnvelopeSpecSha256), {
    state: "invalid",
    reason: "RUNTIME_ENVELOPE_SPEC_DIGEST_MISMATCH",
  });
});

test("malformed runtime-envelope specification digest fails closed", () => {
  const value = createRuntimeArtifacts(inputs());
  assert.deepEqual(verifySpecBinding(value.runtimeEnvelopeSpecBytes, "not-a-digest"), {
    state: "invalid",
    reason: "RUNTIME_ENVELOPE_SPEC_DIGEST_MALFORMED",
  });
});

test("both exact envelopes verify and cross-arm or appended messages fail", () => {
  const value = createRuntimeArtifacts(inputs());
  assert.equal(verifyRuntimeEnvelope("control", value, value.controlEnvelope.value).state, "ok");
  assert.equal(verifyRuntimeEnvelope("compiled", value, value.compiledEnvelope.value).state, "ok");
  assert.equal(verifyRuntimeEnvelope("control", value, value.compiledEnvelope.value).state, "invalid");
  const appended = clone(value.controlEnvelope.value);
  appended.messages.push({ role: "system", bytesBase64: "" });
  assert.equal(verifyRuntimeEnvelope("control", value, appended).state, "invalid");
});
