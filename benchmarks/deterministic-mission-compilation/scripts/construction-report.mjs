import { generateKeyPairSync } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  IDS, candidateDigests, canonicalBytes, createHistoricalCandidate, derivePublicKeyPem, deterministicOutputIdentity,
  domainDigest, issueValidatedDispatch, compileDispatch,
} from "../dist/index.js";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);
const repositoryRoot = resolve(packageRoot, "../..");
const EXPECTED_NODE_VERSION = "v24.18.0";
const EXPECTED_TYPESCRIPT_VERSION = "5.4.5";

async function filesUnder(root, excluded = new Set()) {
  const results = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      const name = relative(root, child).replaceAll("\\", "/");
      if (excluded.has(name) || [...excluded].some((item) => name.startsWith(`${item}/`))) continue;
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) results.push(child);
    }
  }
  await visit(root);
  return results.sort();
}

async function treeDigest(domain, root, excluded) {
  const entries = [];
  for (const path of await filesUnder(root, excluded)) {
    const name = relative(root, path).replaceAll("\\", "/");
    const bytes = await readFile(path);
    entries.push({ name, digest: domainDigest("shield:file:v0", bytes), byteLength: bytes.length });
  }
  return domainDigest(domain, canonicalBytes({ entries }));
}

const candidate = createHistoricalCandidate();
const expected = candidateDigests(candidate);
const { privateKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const issued = issueValidatedDispatch(candidate, {
  observationVersion: "trusted-host-observation.v0", keyId: "construction-report-key",
  validatorId: IDS.validator, compilerId: IDS.compiler,
  singleDispatchId: "construction-report-dispatch", issuanceCounter: 1,
  expectedIrDigest: expected.irDigest,
  expectedGovernanceDigest: candidate.governance.digest,
  expectedRegistryDigest: candidate.registry.digest,
  expectedFixtureDigest: expected.fixtureDigest,
  expectedContextDigest: expected.contextDigest,
  expectedRendererDigest: candidate.renderer.digest,
  expectedTargetProfileDigest: candidate.targetProfile.digest,
  expiresAfterCounter: 2, currentAuthorization: "authorized",
}, privateKeyPem);
if (issued.state !== "ok") throw new Error(`construction_issue_failed:${issued.reason}`);
const compiled = compileDispatch(issued.value, {
  keyId: "construction-report-key", publicKeyPem: derivePublicKeyPem(privateKeyPem),
  currentCounter: 2, revokedDispatchIds: [],
});
if (compiled.state !== "ok") throw new Error(`construction_compile_failed:${compiled.reason}`);
const serializedEnvelope = JSON.stringify(issued.value);
if (/Unicode case-fold compatibility regression|Coulson authorizes|Required disposition/u.test(serializedEnvelope)) {
  throw new Error("raw_governance_prose_crossed_compiler_boundary");
}

const protocolBytes = await readFile(resolve(repositoryRoot, "docs/validation/deterministic-mission-compilation-protocol-v0.md"));
const missionBytes = await readFile(resolve(repositoryRoot, "docs/missions/deterministic-mission-compilation-stage-a.md"));
const lockBytes = await readFile(resolve(repositoryRoot, "package-lock.json"));
const typescriptPackage = JSON.parse(await readFile(
  resolve(repositoryRoot, "node_modules/typescript/package.json"), "utf8",
));
if (process.version !== EXPECTED_NODE_VERSION) {
  throw new Error(`runtime_node_identity_mismatch:${process.version}`);
}
if (typescriptPackage.version !== EXPECTED_TYPESCRIPT_VERSION) {
  throw new Error(`runtime_typescript_identity_mismatch:${typescriptPackage.version}`);
}
const validatorBytes = await readFile(resolve(packageRoot, "src/validator.ts"));
const rendererBytes = await readFile(resolve(packageRoot, "src/renderer.ts"));
const report = {
  reportFormat: "stage-a-construction-identity.v0",
  outcome: "STATIC_BOUNDARY_PASS",
  governanceEquivalent: "NOT_EVALUATED_STAGE_A",
  compilerId: IDS.compiler,
  sourceTreeDigest: await treeDigest("shield:compiler-source-tree:v0", packageRoot, new Set(["dist"])),
  compiledArtifactDigest: await treeDigest("shield:compiled-artifact:v0", resolve(packageRoot, "dist"), new Set()),
  dependencyLockDigest: domainDigest("shield:dependency-lock:v0", lockBytes),
  rendererDigest: candidate.renderer.digest,
  registryDigest: candidate.registry.digest,
  fixtureDigest: issued.value.fixtureDigest,
  targetProfileDigest: candidate.targetProfile.digest,
  rubricProtocolDigest: domainDigest("shield:grading-rubric:v0", protocolBytes),
  governanceContractDigest: domainDigest("shield:governance-contract:v0", missionBytes),
  isolationContractDigest: domainDigest("shield:isolation-contract:v0", protocolBytes),
  validatorImplementationDigest: domainDigest("shield:validator-implementation:v0", validatorBytes),
  rendererImplementationDigest: domainDigest("shield:renderer-implementation:v0", rendererBytes),
  compilerImplementationDigest: await treeDigest(
    "shield:compiler-implementation:v0", resolve(packageRoot, "src"), new Set(),
  ),
  runtimeRequirement: "Node.js v24.18.0 with Ed25519/Web UTF-8 APIs; TypeScript 5.4.5",
  runtimeIdentity: {
    node: process.version,
    typescript: typescriptPackage.version,
    capabilities: ["Ed25519", "TextEncoder", "UTF-8 without normalization"],
  },
  deterministicOutputIdentity: deterministicOutputIdentity(compiled.value),
  historicalAcceptedRevisionIdentityOnly: "200251bb8730cad3f1e0e70d8830ce2d52c532ba",
  acceptedRevisionContentsRead: false,
  compilerEnvelopeContainsRawGovernanceProse: false,
  mutationProtocolFamilies: [
    "01-receipt-missing-malformed-forged-expired-revoked",
    "02-ir-governance-registry-fixture-context-renderer-target-digests",
    "03-post-validation-binding-and-byte-substitution",
    "04-repository-revision-seat-owner-gate-trial-replay-arm-version-substitution",
    "05-closed-structured-value-hostility",
    "06-validation-stop-output-registry-obligations",
    "07-scope-and-authority",
    "08-provenance-gap-overlap-source-binding",
    "09-static-prohibited-dependencies",
    "10-fresh-process-operational-input-independence",
    "11-cross-domain-digests",
    "12-post-validation-registry-context-provenance-replacement",
  ],
  commands: ["npm run build", "npm test", "npm run check", "npm run report"],
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
