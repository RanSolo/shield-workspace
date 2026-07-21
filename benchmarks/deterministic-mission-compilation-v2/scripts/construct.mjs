import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IDS, createRuntimeArtifacts, sha256 } from "../src/runtime-envelope.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const v1Artifacts = resolve(workspaceRoot, "benchmarks/deterministic-mission-compilation-v1/artifacts");
const output = resolve(packageRoot, "artifacts");
await mkdir(output, { recursive: true });

const inputs = {
  sharedInstructionBytes: await readFile(resolve(v1Artifacts, "shared-runtime-instructions.utf8")),
  controlPromptBytes: await readFile(resolve(v1Artifacts, "control-prompt.utf8")),
  compiledPromptBytes: await readFile(resolve(v1Artifacts, "compiled-prompt.utf8")),
};
const artifacts = createRuntimeArtifacts(inputs);
const files = new Map([
  ["common-runtime-wrapper-v2.utf8", artifacts.wrapperBytes],
  ["target-profile-v2.json", artifacts.targetProfileBytes],
  ["runtime-message-envelope-spec-v2.json", artifacts.runtimeEnvelopeSpecBytes],
  ["control-runtime-envelope-v2.json", artifacts.controlEnvelope.bytes],
  ["compiled-runtime-envelope-v2.json", artifacts.compiledEnvelope.bytes],
]);
for (const [name, bytes] of files) await writeFile(resolve(output, name), bytes);

const identity = Object.freeze({
  format: "stage-a-v2-construction-identity",
  identities: IDS,
  reusedImmutableInputs: Object.freeze({
    sharedRuntimeInstructionsSha256: sha256(inputs.sharedInstructionBytes),
    controlPromptSha256: sha256(inputs.controlPromptBytes),
    compiledPromptSha256: sha256(inputs.compiledPromptBytes),
  }),
  runtimeEnvelopeSpecSha256: artifacts.runtimeEnvelopeSpecSha256,
  wrapperDigest: artifacts.wrapperDigest,
  targetProfileDigest: artifacts.targetProfileDigest,
  controlRuntimeEnvelopeDigest: artifacts.controlEnvelope.digest,
  compiledRuntimeEnvelopeDigest: artifacts.compiledEnvelope.digest,
  artifactSha256: Object.freeze([...files].map(([name, bytes]) => Object.freeze({ name, sha256: sha256(bytes) }))),
});
await writeFile(resolve(output, "construction-identity-v2.json"), `${JSON.stringify(identity, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(identity, null, 2)}\n`);
