import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleControlPrompt,
  compileDispatch,
  constructCandidate,
  createControlBundle,
  createExperimentKeypair,
  createIR,
  createRuntimeEnvelope,
  validateCandidate,
  verifyRuntimeEnvelope,
} from "../dist/experiment.js";

const jsonClone = (value) => JSON.parse(JSON.stringify(value));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("constructs byte-identical arm and shared artifacts", () => {
  const first = constructCandidate();
  const second = constructCandidate();
  for (const field of ["control", "compiled", "shared", "controlEnvelope", "compiledEnvelope"]) {
    assert.deepEqual(first[field], second[field]);
  }
});

test("control assembler preserves the exact frozen grammar", () => {
  const result = assembleControlPrompt(createControlBundle());
  assert.equal(result.state, "ok");
  assert.match(Buffer.from(result.value.bytes).toString("utf8"), /^# Human-authored May handoff v1\n\n### FURY/);
  assert.match(Buffer.from(result.value.bytes).toString("utf8"), /--- END HUMAN-AUTHORED HANDOFF ---\n$/);
});

test("control source reordering fails closed", () => {
  const bundle = jsonClone(createControlBundle());
  bundle.sources.reverse();
  assert.deepEqual(assembleControlPrompt(bundle), { state: "invalid", reason: "CONTROL_ORDER_MISMATCH" });
});

test("control source mutation fails closed", () => {
  const bundle = jsonClone(createControlBundle());
  bundle.sources[0].bytesBase64 = Buffer.from("changed\n").toString("base64");
  assert.deepEqual(assembleControlPrompt(bundle), { state: "invalid", reason: "CONTROL_SOURCE_MISMATCH" });
});

test("control delimiter mutation fails closed", () => {
  const bundle = jsonClone(createControlBundle());
  bundle.spec.betweenBase64 = Buffer.from("\nchanged\n").toString("base64");
  assert.deepEqual(assembleControlPrompt(bundle), { state: "invalid", reason: "CONTROL_DELIMITER_MISMATCH" });
});

test("compiler accepts a host-issued receipt and rejects IR mutation", () => {
  const keys = createExperimentKeypair();
  const envelope = validateCandidate(createIR(), keys.privateKey);
  assert.equal(compileDispatch(envelope, keys.publicKey).state, "ok");
  const changed = jsonClone(envelope);
  changed.ir.accountableSeat = "hill";
  assert.equal(compileDispatch(changed, keys.publicKey).state, "invalid");
});

test("compiler rejects a forged receipt", () => {
  const keys = createExperimentKeypair();
  const envelope = jsonClone(validateCandidate(createIR(), keys.privateKey));
  envelope.signatureBase64 = Buffer.alloc(64).toString("base64");
  assert.deepEqual(compileDispatch(envelope, keys.publicKey), { state: "invalid", reason: "INVALID_RECEIPT" });
});

test("runtime envelopes bind ordered exact shared and arm bytes", () => {
  const candidate = constructCandidate();
  assert.equal(verifyRuntimeEnvelope("control", candidate.control.bytes, candidate.controlEnvelope.value).state, "ok");
  assert.equal(verifyRuntimeEnvelope("compiled", candidate.compiled.promptBytes, candidate.compiledEnvelope.value).state, "ok");
  const changed = jsonClone(candidate.controlEnvelope.value);
  changed.messages.reverse();
  assert.deepEqual(verifyRuntimeEnvelope("control", candidate.control.bytes, changed), { state: "invalid", reason: "MESSAGE_ENVELOPE_MISMATCH" });
});

test("arm-specific or runtime-appended instructions fail closed", () => {
  const candidate = constructCandidate();
  const changed = jsonClone(createRuntimeEnvelope("control", candidate.control.bytes).value);
  changed.messages[0].bytesBase64 = Buffer.from("arm-specific wrapper").toString("base64");
  assert.equal(verifyRuntimeEnvelope("control", candidate.control.bytes, changed).state, "invalid");
  const appended = jsonClone(candidate.controlEnvelope.value);
  appended.messages.push({ role: "system", bytesBase64: Buffer.from("provider addition").toString("base64") });
  assert.equal(verifyRuntimeEnvelope("control", candidate.control.bytes, appended).state, "invalid");
});

test("missing, duplicate, and extra control artifacts fail closed", () => {
  const missing = jsonClone(createControlBundle());
  missing.sources.pop();
  assert.equal(assembleControlPrompt(missing).state, "invalid");
  const duplicate = jsonClone(createControlBundle());
  duplicate.sources[1] = duplicate.sources[0];
  assert.equal(assembleControlPrompt(duplicate).state, "invalid");
  const extra = jsonClone(createControlBundle());
  extra.sources.push(extra.sources[0]);
  assert.equal(assembleControlPrompt(extra).state, "invalid");
});

test("line-ending, normalization, and terminal-newline changes fail closed", () => {
  for (const replacement of ["line\r\n", "K\n", "no-terminal-newline"]) {
    const bundle = jsonClone(createControlBundle());
    bundle.sources[0].bytesBase64 = Buffer.from(replacement).toString("base64");
    assert.equal(assembleControlPrompt(bundle).state, "invalid");
  }
});

test("receipt and closed envelope fields are bound", () => {
  const keys = createExperimentKeypair();
  const original = validateCandidate(createIR(), keys.privateKey);
  for (const mutate of [
    (value) => { value.governanceDigest = "0".repeat(64); },
    (value) => { value.receiptPayload.registryDigest = "0".repeat(64); },
    (value) => { value.receiptPayload.compilerId = "shield-compiler@0.1.0-experiment"; },
    (value) => { value.extra = true; },
  ]) {
    const changed = jsonClone(original);
    mutate(changed);
    assert.equal(compileDispatch(changed, keys.publicKey).state, "invalid");
  }
  const otherKeys = createExperimentKeypair();
  assert.equal(compileDispatch(original, otherKeys.publicKey).state, "invalid");
});

test("scope, seat, revision, registry, and identity mutations fail closed", () => {
  const keys = createExperimentKeypair();
  for (const mutate of [
    (value) => { value.accountableSeat = "hill"; },
    (value) => { value.baseCommit = "0".repeat(40); },
    (value) => { value.approvedFiles.push("README.md"); },
    (value) => { value.registry.pop(); },
    (value) => { value.protocolVersion = "mission-dispatch-ir.v0"; },
  ]) {
    const changed = jsonClone(createIR());
    mutate(changed);
    assert.throws(() => validateCandidate(changed, keys.privateKey));
  }
});

test("runtime envelope mutations fail closed for both arms", () => {
  const candidate = constructCandidate();
  for (const [arm, prompt, source] of [
    ["control", candidate.control.bytes, candidate.controlEnvelope.value],
    ["compiled", candidate.compiled.promptBytes, candidate.compiledEnvelope.value],
  ]) {
    for (const mutate of [
      (value) => { value.targetProfileId = "codex-text.v0"; },
      (value) => { value.wrapperDigest = "0".repeat(64); },
      (value) => { value.messages[1].bytesBase64 += "AA=="; },
      (value) => { value.messages[0].role = "user"; },
      (value) => { value.extra = true; },
    ]) {
      const changed = jsonClone(source);
      mutate(changed);
      assert.equal(verifyRuntimeEnvelope(arm, prompt, changed).state, "invalid");
    }
  }
});

test("fresh processes ignore cwd, timezone, locale, and unrelated environment", () => {
  const worker = resolve(root, "scripts/determinism-worker.mjs");
  const run = (cwd, env) => execFileSync(process.execPath, [worker], { cwd, env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });
  const first = run(root, { TZ: "UTC", LANG: "C", DMC_NOISE_A: "alpha" });
  const second = run("/private/tmp", { TZ: "Pacific/Honolulu", LANG: "en_US.UTF-8", DMC_NOISE_B: "beta" });
  assert.equal(first, second);
});
