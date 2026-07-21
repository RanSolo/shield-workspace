import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IDS,
  CONTROL_SOURCE_ORDER,
  constructCandidate,
  createIR,
  digest,
  utf8,
} from "../dist/experiment.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "artifacts");
await mkdir(output, { recursive: true });
const candidate = constructCandidate();

const files = new Map([
  ["control-prompt.utf8", candidate.control.bytes],
  ["compiled-prompt.utf8", candidate.compiled.promptBytes],
  ["compiled-provenance.json", candidate.compiled.provenanceBytes],
  ["compiled-manifest.json", candidate.compiled.manifestBytes],
  ["shared-runtime-instructions.utf8", candidate.shared.sharedBytes],
  ["common-runtime-wrapper.utf8", candidate.shared.wrapperBytes],
  ["control-runtime-envelope.json", candidate.controlEnvelope.bytes],
  ["compiled-runtime-envelope.json", candidate.compiledEnvelope.bytes],
  ["control-assembly-spec.json", utf8(JSON.stringify(candidate.controlBundle.spec))],
  ["runtime-message-envelope-spec.json", utf8(JSON.stringify({
    format: IDS.messageEnvelope,
    encoding: "canonical-json-utf8",
    messageOrder: ["system", "user"],
    systemAssembly: [IDS.wrapper, IDS.sharedInstructions],
    userAssembly: "exact-arm-prompt-bytes",
    additionalMessages: "forbidden",
    normalization: "none",
    targetProfileId: IDS.target,
  }))],
  ["renderer-spec.json", utf8(JSON.stringify({ id: IDS.renderer, input: IDS.envelope, output: "compiled-prompt-exact-bytes", authority: "none", markdownParsing: false }))],
  ["target-profile.json", utf8(JSON.stringify({ id: IDS.target, transport: IDS.messageEnvelope, messages: 2, runtimeAdditions: "forbidden", encoding: "utf-8" }))],
]);

for (const [name, bytes] of files) await writeFile(resolve(output, name), bytes);
for (const source of candidate.controlBundle.sources) {
  await writeFile(resolve(output, `${source.artifactId.replaceAll(":", "-")}.utf8`), Buffer.from(source.bytesBase64, "base64"));
}

const identity = {
  format: "stage-a-v1-construction-identity",
  identities: IDS,
  irDigest: digest("shield:dispatch:ir:v1", utf8(JSON.stringify(createIR()))),
  controlSourceOrder: CONTROL_SOURCE_ORDER,
  controlSourceDigests: candidate.controlBundle.sources.map(({ artifactId, digest: sourceDigest }) => ({ artifactId, digest: sourceDigest })),
  controlAssemblySpecDigest: digest("shield:control:assembly-spec:v1", utf8(JSON.stringify(candidate.controlBundle.spec))),
  controlPromptDigest: candidate.control.digest,
  compiledPromptDigest: candidate.compiled.promptDigest,
  compiledProvenanceDigest: digest("shield:compiled:provenance:v1", candidate.compiled.provenanceBytes),
  compiledManifestDigest: digest("shield:compiled:manifest:v1", candidate.compiled.manifestBytes),
  sharedInstructionDigest: candidate.shared.sharedDigest,
  commonWrapperDigest: candidate.shared.wrapperDigest,
  controlRuntimeEnvelopeDigest: candidate.controlEnvelope.digest,
  compiledRuntimeEnvelopeDigest: candidate.compiledEnvelope.digest,
  artifactDigests: [...files].map(([name, bytes]) => ({ name, digest: digest(`shield:frozen-artifact:${name}:v1`, bytes) })),
};
await writeFile(resolve(output, "construction-identity.json"), `${JSON.stringify(identity, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(identity, null, 2)}\n`);
