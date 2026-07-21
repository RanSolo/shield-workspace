import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IDS, sha256, verifySpecBinding } from "../src/runtime-envelope.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const freezePath = resolve(workspaceRoot, "docs/validation/deterministic-mission-compilation-stage-a-freeze-v2.json");

const bindingPaths = Object.freeze([
  "package-lock.json",
  "docs/missions/deterministic-mission-compilation-stage-a-v2.md",
  "docs/validation/deterministic-mission-compilation-protocol-v0.md",
  "docs/validation/deterministic-mission-compilation-protocol-v1.md",
  "docs/validation/deterministic-mission-compilation-protocol-v2.md",
  "docs/validation/deterministic-mission-compilation-stage-a-freeze-v0.json",
  "docs/validation/deterministic-mission-compilation-stage-a-result-v0.json",
  "docs/validation/deterministic-mission-compilation-stage-a-freeze-v1.json",
  "docs/validation/deterministic-mission-compilation-stage-a-result-v1.json",
  "benchmarks/deterministic-mission-compilation-v1/src/experiment.ts",
  "benchmarks/deterministic-mission-compilation-v1/dist/experiment.js",
  "benchmarks/deterministic-mission-compilation-v1/artifacts/control-prompt.utf8",
  "benchmarks/deterministic-mission-compilation-v1/artifacts/compiled-prompt.utf8",
  "benchmarks/deterministic-mission-compilation-v1/artifacts/compiled-provenance.json",
  "benchmarks/deterministic-mission-compilation-v1/artifacts/compiled-manifest.json",
  "benchmarks/deterministic-mission-compilation-v1/artifacts/shared-runtime-instructions.utf8",
  "benchmarks/deterministic-mission-compilation-v1/artifacts/control-assembly-spec.json",
  "benchmarks/deterministic-mission-compilation-v1/artifacts/renderer-spec.json",
  "benchmarks/deterministic-mission-compilation-v1/artifacts/target-profile.json",
  "benchmarks/deterministic-mission-compilation-v2/artifacts/construction-identity-v2.json",
  "benchmarks/deterministic-mission-compilation-v2/artifacts/common-runtime-wrapper-v2.utf8",
  "benchmarks/deterministic-mission-compilation-v2/artifacts/target-profile-v2.json",
  "benchmarks/deterministic-mission-compilation-v2/artifacts/runtime-message-envelope-spec-v2.json",
  "benchmarks/deterministic-mission-compilation-v2/artifacts/control-runtime-envelope-v2.json",
  "benchmarks/deterministic-mission-compilation-v2/artifacts/compiled-runtime-envelope-v2.json"
].sort());

async function fileBinding(path) {
  const bytes = await readFile(resolve(workspaceRoot, path));
  return Object.freeze({ path, byteLength: bytes.byteLength, sha256: sha256(bytes) });
}

async function walk(directory) {
  const output = [];
  for (const name of (await readdir(directory)).sort()) {
    if (name === "node_modules") continue;
    const path = resolve(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) output.push(...await walk(path));
    else if (info.isFile()) output.push(path);
  }
  return output;
}

async function packageTreeDigest() {
  const paths = (await walk(packageRoot))
    .filter((path) => !relative(packageRoot, path).startsWith("artifacts/.temporary"))
    .sort();
  const records = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    records.push(`${relative(packageRoot, path)}\u0000${bytes.byteLength}\u0000${sha256(bytes)}\n`);
  }
  return createHash("sha256").update(records.join(""), "utf8").digest("hex");
}

async function semanticChecks(bindings) {
  const byPath = new Map(bindings.map((entry) => [entry.path, entry]));
  if (byPath.size !== bindings.length || JSON.stringify([...byPath.keys()]) !== JSON.stringify(bindingPaths)) {
    throw new Error("FROZEN_BINDING_SET_MISMATCH");
  }
  const specPath = "benchmarks/deterministic-mission-compilation-v2/artifacts/runtime-message-envelope-spec-v2.json";
  const specBytes = await readFile(resolve(workspaceRoot, specPath));
  const control = JSON.parse(await readFile(resolve(workspaceRoot, "benchmarks/deterministic-mission-compilation-v2/artifacts/control-runtime-envelope-v2.json"), "utf8"));
  const compiled = JSON.parse(await readFile(resolve(workspaceRoot, "benchmarks/deterministic-mission-compilation-v2/artifacts/compiled-runtime-envelope-v2.json"), "utf8"));
  for (const envelope of [control, compiled]) {
    const result = verifySpecBinding(specBytes, envelope.runtimeEnvelopeSpecSha256);
    if (result.state !== "ok") throw new Error(result.reason);
    if (envelope.runtimeEnvelopeSpecSha256 !== byPath.get(specPath)?.sha256) {
      throw new Error("RUNTIME_ENVELOPE_SPEC_DIGEST_MISMATCH");
    }
  }
  return Object.freeze({
    runtimeEnvelopeSpecSha256: byPath.get(specPath).sha256,
    controlEnvelopeSpecBinding: "PASS",
    compiledEnvelopeSpecBinding: "PASS",
  });
}

async function derive(sourceCommit) {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("SOURCE_COMMIT_MALFORMED");
  const bindings = Object.freeze(await Promise.all(bindingPaths.map(fileBinding)));
  const semantic = await semanticChecks(bindings);
  return Object.freeze({
    freezeManifestVersion: IDS.freeze,
    freezeState: "FROZEN",
    experimentId: IDS.experiment,
    trialId: IDS.trial,
    candidateId: IDS.candidate,
    sourceCommit,
    sourceTreeSha256: await packageTreeDigest(),
    digestDerivation: "SHA-256 over exact artifact bytes; no expected artifact hashes accepted as generator input",
    identities: IDS,
    semantic,
    artifactBindings: bindings,
    preservedEvidence: Object.freeze({
      v0Combined: false,
      failedV1Combined: false,
      v0ResultPath: "docs/validation/deterministic-mission-compilation-stage-a-result-v0.json",
      failedV1ResultPath: "docs/validation/deterministic-mission-compilation-stage-a-result-v1.json",
    }),
    expectedValidation: Object.freeze({ v0Tests: 8, v1Tests: 15, v2Tests: 6, teamSystemTests: 218, multibandTests: 9 }),
    outcomes: Object.freeze({ governanceEquivalent: "NOT_EVALUATED_STAGE_A", implementationQuality: "NOT_EVALUATED_STAGE_A", stageB: "BLOCKED_PENDING_STAGE_A_V2_PASS_AND_FURY_CONFORMANCE" }),
    invalidationRule: "Any post-freeze artifact, identity, dependency, protocol, fixture, isolation, rubric, wrapper, prompt, specification, or envelope change invalidates this run and requires a new identity and complete Stage A restart."
  });
}

async function verify(manifest) {
  if (manifest.freezeManifestVersion !== IDS.freeze || manifest.experimentId !== IDS.experiment || manifest.candidateId !== IDS.candidate) {
    throw new Error("FREEZE_IDENTITY_MISMATCH");
  }
  const derivedBindings = Object.freeze(await Promise.all(bindingPaths.map(fileBinding)));
  if (JSON.stringify(manifest.artifactBindings) !== JSON.stringify(derivedBindings)) throw new Error("FROZEN_ARTIFACT_DIGEST_MISMATCH");
  if (manifest.sourceTreeSha256 !== await packageTreeDigest()) throw new Error("FROZEN_SOURCE_TREE_MISMATCH");
  const semantic = await semanticChecks(derivedBindings);
  if (JSON.stringify(manifest.semantic) !== JSON.stringify(semantic)) throw new Error("FROZEN_SEMANTIC_BINDING_MISMATCH");
  return Object.freeze({ state: "PASS", artifactBindings: derivedBindings.length, semanticBindings: 3 });
}

const [mode, value] = process.argv.slice(2);
if (mode === "--write-freeze") {
  const manifest = await derive(value);
  await writeFile(freezePath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ state: "WROTE", path: freezePath, artifactBindings: manifest.artifactBindings.length })}\n`);
} else if (mode === "--verify") {
  const path = value ? resolve(workspaceRoot, value) : freezePath;
  process.stdout.write(`${JSON.stringify(await verify(JSON.parse(await readFile(path, "utf8"))))}\n`);
} else if (mode === "--verify-source") {
  const bindings = Object.freeze(await Promise.all(bindingPaths.map(fileBinding)));
  process.stdout.write(`${JSON.stringify({ state: "PASS", artifactBindings: bindings.length, semantic: await semanticChecks(bindings), sourceTreeSha256: await packageTreeDigest() })}\n`);
} else {
  throw new Error("USAGE: --verify-source | --write-freeze <source-commit> | --verify [manifest-path]");
}
