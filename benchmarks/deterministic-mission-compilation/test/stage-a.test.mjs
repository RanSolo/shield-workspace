import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { inspectCompilerGraph } from "../scripts/static-boundary-check.mjs";

import {
  COULSON_AUTHORIZATION_TEXT, GOVERNED_SOURCE_TEXT, IDS, candidateDigests, canonicalBytes,
  compileDispatch, createHistoricalCandidate, derivePublicKeyPem, deterministicOutputIdentity,
  domainDigest, issueValidatedDispatch,
  validateProvenanceCoverage,
} from "../dist/index.js";

const execFileAsync = promisify(execFile);
const { privateKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = derivePublicKeyPem(privateKeyPem);
const expectedCandidate = createHistoricalCandidate();
const expectedCandidateDigests = candidateDigests(expectedCandidate);

function clone(value) { return structuredClone(value); }
function observation(overrides = {}) {
  return {
    observationVersion: "trusted-host-observation.v0",
    keyId: "stage-a-test-key",
    validatorId: IDS.validator,
    compilerId: IDS.compiler,
    singleDispatchId: "stage-a-dispatch-001",
    expectedIrDigest: expectedCandidateDigests.irDigest,
    expectedGovernanceDigest: expectedCandidate.governance.digest,
    expectedRegistryDigest: expectedCandidate.registry.digest,
    expectedFixtureDigest: expectedCandidateDigests.fixtureDigest,
    expectedContextDigest: expectedCandidateDigests.contextDigest,
    expectedRendererDigest: expectedCandidate.renderer.digest,
    expectedTargetProfileDigest: expectedCandidate.targetProfile.digest,
    issuanceCounter: 10,
    expiresAfterCounter: 20,
    currentAuthorization: "authorized",
    ...overrides,
  };
}
function trust(overrides = {}) {
  return {
    keyId: "stage-a-test-key", publicKeyPem, currentCounter: 11,
    revokedDispatchIds: [], ...overrides,
  };
}
function issue(candidate = createHistoricalCandidate(), overrides = {}) {
  const result = issueValidatedDispatch(candidate, observation(overrides), privateKeyPem);
  assert.equal(result.state, "ok", result.state === "invalid" ? result.reason : "");
  return result.value;
}
function expectReason(result, reason) {
  assert.deepEqual(result, { state: "invalid", reason });
}
function signedPayloadMutation(envelope, field, value) {
  const mutated = clone(envelope);
  const payload = JSON.parse(Buffer.from(mutated.receipt.payloadBase64, "base64").toString("utf8"));
  payload[field] = value;
  const payloadBytes = canonicalBytes(payload);
  mutated.receipt.payloadBase64 = Buffer.from(payloadBytes).toString("base64");
  mutated.receipt.payloadDigest = domainDigest("shield:dispatch:validation-receipt-payload:v0", payloadBytes);
  mutated.receipt.signatureBase64 = sign(null, payloadBytes, privateKey).toString("base64");
  return mutated;
}

test("fixture is governed-source-derived and never reads the accepted solution", async () => {
  const fixtureSource = await readFile(new URL("../src/fixture.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fixtureSource, /git\s+(?:show|cat-file|checkout)|readFileSync|node:fs/u);
  assert.match(fixtureSource, /HISTORICAL_ACCEPTED_REVISION_IDENTITY_ONLY/u);
  const candidate = createHistoricalCandidate();
  assert.equal(candidate.sourceArtifacts.length, 4);
  assert.ok(candidate.sourceMap.length > 40);
  assert.equal(candidate.ir.baseCommit, "afdbf71b8ece2a2506a0b6a7b213267c7896f8d1");
  assert.equal(GOVERNED_SOURCE_TEXT.coulsonAuthorization, COULSON_AUTHORIZATION_TEXT);
  assert.equal(
    domainDigest("shield:dispatch:source-artifact:v0", new TextEncoder().encode(COULSON_AUTHORIZATION_TEXT)),
    "e9858065922ab257bb8f8a59f55d73d3ec2c4553637e3bbe1a6dc3e11c0f1ffb",
  );
  for (const required of [
    "one bounded May conformance repair", "preserving the prior Unicode `/iu` equivalence behavior",
    "direct sensitive-path matching and generated ripgrep exclusions", "focused three-tool parity regression tests",
    "May retains repair ownership", "return the exact revision and evidence to Fury",
    "No merge, scope expansion, or further edits are authorized",
  ]) assert.match(COULSON_AUTHORIZATION_TEXT, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  for (const path of [
    "ir.taskFacts.unicodeEquivalences.0.from", "ir.taskFacts.unicodeEquivalences.0.to",
    "ir.taskFacts.unicodeEquivalences.1.from", "ir.taskFacts.unicodeEquivalences.1.to",
  ]) {
    const mapping = candidate.sourceMap.find((entry) => entry.fieldPath === path);
    assert.equal(mapping.artifactId, "source:coulson-authorization-41");
    assert.equal(mapping.selectedBySeat, null);
  }
});

test("validated compilation is immutable, deterministic, complete, and domain-separated", () => {
  const envelope = issue();
  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(Object.isFrozen(envelope.ir), true);
  const first = compileDispatch(envelope, trust());
  const second = compileDispatch(envelope, trust());
  assert.equal(first.state, "ok"); assert.equal(second.state, "ok");
  assert.deepEqual(Buffer.from(first.value.promptBytes), Buffer.from(second.value.promptBytes));
  assert.deepEqual(Buffer.from(first.value.provenanceBytes), Buffer.from(second.value.provenanceBytes));
  assert.deepEqual(Buffer.from(first.value.manifestBytes), Buffer.from(second.value.manifestBytes));
  const prompt = Buffer.from(first.value.promptBytes).toString("utf8");
  for (const obligation of createHistoricalCandidate().registry.entries) assert.match(prompt, new RegExp(obligation.text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(prompt, /OWNERSHIP-01|AUTHORITY-01|VALIDATION-01/u);
  assert.notEqual(
    domainDigest("shield:dispatch:prompt:v0", first.value.promptBytes),
    domainDigest("shield:dispatch:provenance:v0", first.value.promptBytes),
  );
  const serializedEnvelope = JSON.stringify(envelope);
  assert.doesNotMatch(serializedEnvelope, /Unicode case-fold compatibility regression|Coulson authorizes|Required disposition/u);
  assert.equal(Object.hasOwn(envelope, "sourceArtifacts"), false);
  assert.equal(Object.hasOwn(envelope, "sourceMap"), false);
  const provenance = JSON.parse(Buffer.from(first.value.provenanceBytes).toString("utf8"));
  for (const span of provenance.spans.filter((item) => item.sourceKind === "governed_field")) {
    assert.match(span.sourceId, /^[0-9a-f]{64}$/u);
    assert.ok(["literal_selection", "mechanical_artifact_id", "mechanical_artifact_digest"].includes(span.sourceDerivation));
  }
});

test("receipt failures are closed and exact", () => {
  const envelope = issue();
  const missing = clone(envelope); missing.receipt = null;
  expectReason(compileDispatch(missing, trust()), "MISSING_RECEIPT");
  const malformed = clone(envelope); malformed.receipt.signatureBase64 = "%%%";
  expectReason(compileDispatch(malformed, trust()), "MALFORMED_RECEIPT");
  const forged = clone(envelope); forged.receipt.signatureBase64 = Buffer.alloc(64, 7).toString("base64");
  expectReason(compileDispatch(forged, trust()), "FORGED_RECEIPT");
  expectReason(compileDispatch(envelope, trust({ currentCounter: 21 })), "RECEIPT_EXPIRED");
  expectReason(compileDispatch(envelope, trust({ currentCounter: 9 })), "RECEIPT_EXPIRED");
  expectReason(compileDispatch(envelope, trust({ revokedDispatchIds: ["stage-a-dispatch-001"] })), "RECEIPT_REVOKED");
  expectReason(compileDispatch(envelope, trust({ revokedDispatchIds: ["other", "other"] })), "MALFORMED_RECEIPT");
  expectReason(compileDispatch(envelope, trust({ keyId: "wrong-key" })), "RECEIPT_BINDING_MISMATCH");
  for (const [field, value] of [
    ["repository", "Other/repo"], ["branch", "wrong"], ["baseCommit", "0".repeat(40)],
    ["baseTree", "1".repeat(40)], ["accountableSeat", "hill"], ["artifactOwner", "hill"],
    ["gate", "different"], ["trialId", "wrong"], ["replayId", "wrong"], ["armId", "wrong"],
    ["compilerId", "wrong"], ["validatorId", "wrong"], ["targetProfileDigest", "0".repeat(64)],
  ]) expectReason(compileDispatch(signedPayloadMutation(envelope, field, value), trust()), "RECEIPT_BINDING_MISMATCH");
});

test("post-validation identity and byte substitutions fail for their exact boundary", () => {
  const envelope = issue();
  for (const [field, value] of [
    ["repository", "Other/repo"], ["branch", "wrong"], ["baseCommit", "0".repeat(40)],
    ["baseTree", "1".repeat(40)], ["experimentId", "wrong"], ["trialId", "wrong"],
    ["replayId", "wrong"], ["armId", "wrong"],
  ]) {
    const mutated = clone(envelope); mutated.ir[field] = value;
    expectReason(compileDispatch(mutated, trust()), "IR_DIGEST_MISMATCH");
  }
  const binding = clone(envelope); binding.sourceBindings[0].artifactDigest = "0".repeat(64);
  expectReason(compileDispatch(binding, trust()), "PROVENANCE_SOURCE_MISMATCH");
  const selection = clone(envelope); selection.provenanceBindings[0].selectedValueDigest = "0".repeat(64);
  expectReason(compileDispatch(selection, trust()), "PROVENANCE_SOURCE_MISMATCH");
  const registry = clone(envelope); registry.registry.entries[0].text = "changed";
  expectReason(compileDispatch(registry, trust()), "OBLIGATION_MISSING");
  const renderer = clone(envelope); renderer.renderer.digest = envelope.registry.digest;
  expectReason(compileDispatch(renderer, trust()), "RENDERER_DIGEST_MISMATCH");
  const rendererVersion = clone(envelope); rendererVersion.renderer.version = "2";
  expectReason(compileDispatch(rendererVersion, trust()), "RENDERER_DIGEST_MISMATCH");
  const target = clone(envelope); target.targetProfile.digest = envelope.registry.digest;
  expectReason(compileDispatch(target, trust()), "TARGET_DIGEST_MISMATCH");
  const targetVersion = clone(envelope); targetVersion.targetProfile.version = "1";
  expectReason(compileDispatch(targetVersion, trust()), "TARGET_DIGEST_MISMATCH");
  const context = clone(envelope); context.contextDigest = "0".repeat(64);
  expectReason(compileDispatch(context, trust()), "CONTEXT_DIGEST_MISMATCH");
  const fixture = clone(envelope); fixture.fixtureDigest = "0".repeat(64);
  expectReason(compileDispatch(fixture, trust()), "FIXTURE_DIGEST_MISMATCH");
  const governance = clone(envelope); governance.governance.digest = "0".repeat(64);
  expectReason(compileDispatch(governance, trust()), "GOVERNANCE_DIGEST_MISMATCH");
  const irBytes = clone(envelope); irBytes.irBytesBase64 = Buffer.from("{}\n").toString("base64");
  expectReason(compileDispatch(irBytes, trust()), "IR_DIGEST_MISMATCH");
});

test("candidate structure, obligations, scope, authority, Unicode, and provenance fail closed", () => {
  const unknown = clone(createHistoricalCandidate()); unknown.ir.extra = true;
  expectReason(issueValidatedDispatch(unknown, observation(), privateKeyPem), "UNKNOWN_FIELD");
  const missing = clone(createHistoricalCandidate()); delete missing.ir.outputContractRef;
  expectReason(issueValidatedDispatch(missing, observation(), privateKeyPem), "MISSING_FIELD");
  const sparse = clone(createHistoricalCandidate()); sparse.ir.validationObligations = new Array(6); sparse.ir.validationObligations[0] = "focused-real-tool-parity";
  expectReason(issueValidatedDispatch(sparse, observation(), privateKeyPem), "SPARSE_ARRAY");
  const accessor = clone(createHistoricalCandidate()); Object.defineProperty(accessor.ir, "missionId", { get() { throw new Error("must not run"); }, enumerable: true });
  expectReason(issueValidatedDispatch(accessor, observation(), privateKeyPem), "ACCESSOR_FIELD");
  const excessive = clone(createHistoricalCandidate()); excessive.ir.missionId = "x".repeat(300);
  expectReason(issueValidatedDispatch(excessive, observation(), privateKeyPem), "EXCESSIVE_VALUE");
  const surrogate = clone(createHistoricalCandidate()); surrogate.ir.missionId = "bad\ud800";
  expectReason(issueValidatedDispatch(surrogate, observation(), privateKeyPem), "UNPAIRED_SURROGATE");
  const obligation = clone(createHistoricalCandidate()); obligation.ir.validationObligations.pop();
  expectReason(issueValidatedDispatch(obligation, observation(), privateKeyPem), "OBLIGATION_MISSING");
  const stop = clone(createHistoricalCandidate()); stop.ir.stopConditions.pop();
  expectReason(issueValidatedDispatch(stop, observation(), privateKeyPem), "OBLIGATION_MISSING");
  const output = clone(createHistoricalCandidate()); output.ir.instructionRefs.pop();
  expectReason(issueValidatedDispatch(output, observation(), privateKeyPem), "OBLIGATION_MISSING");
  const scope = clone(createHistoricalCandidate()); scope.ir.approvedFileScope[0] = "outside.ts";
  expectReason(issueValidatedDispatch(scope, observation(), privateKeyPem), "OUT_OF_SCOPE_FILE");
  const authority = clone(createHistoricalCandidate()); authority.ir.accountableSeat = "hill";
  expectReason(issueValidatedDispatch(authority, observation(), privateKeyPem), "AUTHORITY_INTRODUCED");
  const owner = clone(createHistoricalCandidate()); owner.ir.artifactOwner = "hill";
  expectReason(issueValidatedDispatch(owner, observation(), privateKeyPem), "AUTHORITY_INTRODUCED");
  const gate = clone(createHistoricalCandidate()); gate.ir.gate = "different";
  expectReason(issueValidatedDispatch(gate, observation(), privateKeyPem), "INVALID_CANDIDATE");
  const duplicate = clone(createHistoricalCandidate()); duplicate.ir.instructionRefs[7] = "STOP-02";
  expectReason(issueValidatedDispatch(duplicate, observation(), privateKeyPem), "OBLIGATION_MISSING");
  const unsafe = clone(createHistoricalCandidate()); unsafe.governance.journalSequence = Number.NaN;
  expectReason(issueValidatedDispatch(unsafe, observation(), privateKeyPem), "GOVERNANCE_DIGEST_MISMATCH");
  expectReason(issueValidatedDispatch(null, observation(), privateKeyPem), "INVALID_CANDIDATE");
  expectReason(issueValidatedDispatch(createHistoricalCandidate(), observation({ compilerId: "wrong" }), privateKeyPem), "INVALID_CANDIDATE");
  expectReason(issueValidatedDispatch(createHistoricalCandidate(), observation({ validatorId: "wrong" }), privateKeyPem), "INVALID_CANDIDATE");
  expectReason(issueValidatedDispatch(
    createHistoricalCandidate(), observation({ expectedFixtureDigest: "0".repeat(64) }), privateKeyPem,
  ), "FIXTURE_DIGEST_MISMATCH");
  const wrongTarget = clone(createHistoricalCandidate()); wrongTarget.targetProfile.id = "wrong-target";
  expectReason(issueValidatedDispatch(wrongTarget, observation(), privateKeyPem), "TARGET_DIGEST_MISMATCH");
  const wrongRendererVersion = clone(createHistoricalCandidate()); wrongRendererVersion.renderer.version = "2";
  expectReason(issueValidatedDispatch(wrongRendererVersion, observation(), privateKeyPem), "RENDERER_DIGEST_MISMATCH");
  const wrongTargetVersion = clone(createHistoricalCandidate()); wrongTargetVersion.targetProfile.version = "1";
  expectReason(issueValidatedDispatch(wrongTargetVersion, observation(), privateKeyPem), "TARGET_DIGEST_MISMATCH");
  const normalized = clone(createHistoricalCandidate());
  const bytes = Buffer.from(normalized.sourceArtifacts[0].bytesBase64, "base64");
  normalized.sourceArtifacts[0].bytesBase64 = Buffer.from(bytes.toString("utf8").normalize("NFD"), "utf8").toString("base64");
  expectReason(issueValidatedDispatch(normalized, observation(), privateKeyPem), "CONTENT_DIGEST_MISMATCH");

  assert.throws(() => validateProvenanceCoverage(new Uint8Array(4), [
    { startByte: 1, endByte: 4 },
  ]), /PROVENANCE_GAP/u);
  assert.throws(() => validateProvenanceCoverage(new Uint8Array(4), [
    { startByte: 0, endByte: 3 }, { startByte: 2, endByte: 4 },
  ]), /PROVENANCE_OVERLAP/u);
  const map = clone(createHistoricalCandidate()); map.sourceMap = map.sourceMap.filter((entry) => entry.fieldPath !== "ir.missionId");
  expectReason(issueValidatedDispatch(map, observation(), privateKeyPem), "SOURCE_MAP_INVALID");
  const incorrect = clone(createHistoricalCandidate());
  const missionSource = incorrect.sourceMap.find((entry) => entry.fieldPath === "ir.missionId");
  missionSource.startByte += 1; missionSource.endByte += 1;
  expectReason(issueValidatedDispatch(incorrect, observation(), privateKeyPem), "PROVENANCE_SOURCE_MISMATCH");
});

test("operational issuance metadata does not influence deterministic artifacts", () => {
  const firstEnvelope = issue(createHistoricalCandidate(), { keyId: "stage-a-test-key", singleDispatchId: "one", issuanceCounter: 1, expiresAfterCounter: 10 });
  const secondEnvelope = issue(createHistoricalCandidate(), { keyId: "stage-a-test-key", singleDispatchId: "two", issuanceCounter: 100, expiresAfterCounter: 200 });
  const first = compileDispatch(firstEnvelope, trust({ currentCounter: 2 }));
  const second = compileDispatch(secondEnvelope, trust({ currentCounter: 101 }));
  assert.equal(first.state, "ok"); assert.equal(second.state, "ok");
  assert.deepEqual(deterministicOutputIdentity(first.value), deterministicOutputIdentity(second.value));
  assert.deepEqual(Buffer.from(first.value.manifestBytes), Buffer.from(second.value.manifestBytes));
});

test("fresh-process determinism survives cwd, TZ, locale, env order, and issuance changes", async (context) => {
  const directories = [await mkdtemp(join(tmpdir(), "shield-stage-a-cwd-a-")), await mkdtemp(join(tmpdir(), "shield-stage-a-cwd-b-"))];
  context.after(async () => Promise.all(directories.map((path) => rm(path, { recursive: true, force: true }))));
  const worker = new URL("../scripts/determinism-worker.mjs", import.meta.url);
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  const cases = [
    { cwd: directories[0], tz: "UTC", lang: "C", issuance: "1", extras: { ZETA: "z", ALPHA: "a" } },
    { cwd: directories[1], tz: "Pacific/Honolulu", lang: "C.UTF-8", issuance: "41", extras: { ALPHA: "a", ZETA: "z" } },
    { cwd: directories[0], tz: "Asia/Tokyo", lang: "en_US.UTF-8", issuance: "99", extras: { OTHER: "ignored", ALPHA: "a" } },
  ];
  const outputs = [];
  for (const item of cases) {
    const env = {};
    for (const [key, value] of Object.entries(item.extras)) env[key] = value;
    Object.assign(env, { PATH: process.env.PATH, TZ: item.tz, LANG: item.lang, LC_ALL: item.lang });
    const { stdout, stderr } = await execFileAsync(process.execPath, [worker.pathname, moduleUrl, item.issuance], { cwd: item.cwd, env });
    assert.equal(stderr, ""); outputs.push(JSON.parse(stdout));
  }
  assert.deepEqual(outputs[1], outputs[0]);
  assert.deepEqual(outputs[2], outputs[0]);
});

test("compiler graph closure has only frozen local modules and node:crypto", async () => {
  const { stdout } = await execFileAsync(process.execPath, [new URL("../scripts/static-boundary-check.mjs", import.meta.url).pathname]);
  assert.deepEqual(JSON.parse(stdout), { staticBoundary: "PASS", files: 8 });
  await assert.rejects(
    inspectCompilerGraph({
      allowedFiles: ["src/compiler.ts"],
      loadSource: async () => 'import "./ninth.js";\n',
    }),
    /PROHIBITED_LOCAL_DEPENDENCY:src\/compiler\.ts->src\/ninth\.ts/u,
  );
  await assert.rejects(
    inspectCompilerGraph({
      allowedFiles: ["src/compiler.ts", "src/unreachable.ts"],
      loadSource: async () => "export const compiler = true;\n",
    }),
    /UNREACHABLE_COMPILER_GRAPH_ENTRY:src\/unreachable\.ts/u,
  );
});
