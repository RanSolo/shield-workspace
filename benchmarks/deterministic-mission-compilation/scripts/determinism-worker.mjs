import { generateKeyPairSync } from "node:crypto";

const modulePath = process.argv[2];
const issuanceCounter = Number(process.argv[3] ?? "1");
if (!modulePath || !Number.isSafeInteger(issuanceCounter)) throw new Error("worker_arguments_invalid");
const api = await import(modulePath);
const { privateKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const candidate = api.createHistoricalCandidate();
const expected = api.candidateDigests(candidate);
const issued = api.issueValidatedDispatch(candidate, {
  observationVersion: "trusted-host-observation.v0",
  keyId: `operational-key-${issuanceCounter}`,
  validatorId: api.IDS.validator,
  compilerId: api.IDS.compiler,
  singleDispatchId: `operational-dispatch-${issuanceCounter}`,
  expectedIrDigest: expected.irDigest,
  expectedGovernanceDigest: candidate.governance.digest,
  expectedRegistryDigest: candidate.registry.digest,
  expectedFixtureDigest: expected.fixtureDigest,
  expectedContextDigest: expected.contextDigest,
  expectedRendererDigest: candidate.renderer.digest,
  expectedTargetProfileDigest: candidate.targetProfile.digest,
  issuanceCounter,
  expiresAfterCounter: issuanceCounter + 100,
  currentAuthorization: "authorized",
}, privateKeyPem);
if (issued.state !== "ok") throw new Error(`issue_failed:${issued.reason}`);
const compiled = api.compileDispatch(issued.value, {
  keyId: `operational-key-${issuanceCounter}`,
  publicKeyPem: api.derivePublicKeyPem(privateKeyPem),
  currentCounter: issuanceCounter + 1,
  revokedDispatchIds: [],
});
if (compiled.state !== "ok") throw new Error(`compile_failed:${compiled.reason}`);
process.stdout.write(JSON.stringify({
  prompt: Buffer.from(compiled.value.promptBytes).toString("base64"),
  provenance: Buffer.from(compiled.value.provenanceBytes).toString("base64"),
  manifest: Buffer.from(compiled.value.manifestBytes).toString("base64"),
  identity: api.deterministicOutputIdentity(compiled.value),
}));
