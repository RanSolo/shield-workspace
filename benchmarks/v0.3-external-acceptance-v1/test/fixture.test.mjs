import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
  evaluateSeatDispatchAttributionV1
} from "@shield/team-system/dispatch-receipts";

import { verifyFixtureIdentity } from "../verify-fixture-identity.mjs";
import { launchExternalFixture, loadTrustedReplayAnchor } from "../../v0.3-fixture-host-launcher.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(root, "../../packages/shield-team-system");
const repositoryRoot = resolve(root, "../..");
const template = join(root, "template");
const OID40 = "1".repeat(40);
const OID64 = "0".repeat(64);
const FIXTURE_IDENTITY_BYTES = await readFile(join(root, "fixture-identity-v1.json"));
const FIXTURE_RELEASE_BASELINE = Object.freeze({
  kind: "fixture-release-baseline",
  schemaVersion: "shield.fixture.release-baseline.v1",
  identityRecordDigest: "f66abfdda721838676a3d86064f09e43bb521b9fd7ca7b526bfc06fc0d60ab33",
  verifierDigest: "0606191ca365169a788a857ab1dace7f8df9a6869ee442a80df3eb593e95237d",
  launcherDigest: "4ad8b4c850575360323127be1a6b544e6d1601019a3ba6f93338f6d20c5bfdab",
  verifierIdentity: `node:${process.version}`,
  launcherIdentity: `node:${process.execPath}`,
  package: Object.freeze({
    name: "@shield/team-system",
    version: "0.1.0",
    digestAlgorithm: "sha256",
    digest: "05a8ee7222471925e49e794c7fb58fd1151dcfe2a8e2c8d20435118c340ec02e"
  })
});
const REPLAY_ANCHOR_FIXTURE = Object.freeze({
  kind: "trusted-journal-replay-anchor",
  producerContractVersion: "shield.v0.3.fixture",
  producerDigest: "0".repeat(64),
  anchorDigest: "1".repeat(64),
  anchorRevision: OID40,
  parentMissionId: "mission:v0.3:external-acceptance:1",
  parentMissionRevision: OID40,
  parentSessionId: "session:v0.3:mission-parent:1",
  childTaskId: "task:v0.3:external-acceptance:1",
  childSessionId: "session:v0.3:child:1",
  repositoryId: "repository:fixture:external-v03",
  repositoryWorkspaceId: "workspace:fixture:external-v03",
  repositoryRevision: OID40,
  subjectId: "fixture:v0.3:external-acceptance:1",
  subjectRevision: OID40,
  artifactId: "fixture:v0.3:external-acceptance:1",
  artifactRevision: OID40,
  accountableSeatId: "daisy",
  currentSequence: 1,
  lifecycle: "mission:lifecycle"
});
const REPLAY_SEAT_DISPATCH_FIXTURE = Object.freeze({
  receiptId: "receipt:v0.3:external-acceptance:1",
  dispatchId: "dispatch:v0.3:external-acceptance:1",
  parentMissionId: "mission:v0.3:external-acceptance:1",
  parentMissionRevision: OID40,
  parentSessionId: "session:v0.3:mission-parent:1",
  childTaskId: "task:v0.3:external-acceptance:1",
  childSessionId: "session:v0.3:child:1",
  repositoryId: "repository:fixture:external-v03",
  repositoryWorkspaceId: "workspace:fixture:external-v03",
  repositoryRevision: OID40,
  subjectId: "fixture:v0.3:external-acceptance:1",
  subjectRevision: OID40,
  artifactId: "fixture:v0.3:external-acceptance:1",
  artifactRevision: OID40,
  accountableSeatId: "daisy",
  configuredRuntime: {
    kind: "runtime.configured",
    runtimeId: "runtime:v0.3",
    model: "model:v0.3"
  },
  requestedRuntime: {
    kind: "runtime.requested",
    runtimeId: "runtime:v0.3",
    model: "model:v0.3"
  },
  toolExecution: {
    kind: "tool.execution.not_requested",
    reason: "not_requested"
  },
  runtimeSelfReport: {
    kind: "runtime.self_report.observed",
    runtimeId: "runtime:v0.3",
    model: "model:v0.3",
    evidenceRefs: ["observed:runtime.self_report"]
  },
  runtimeHostObserved: {
    kind: "runtime.host_observed",
    runtimeId: "runtime:v0.3",
    model: "model:v0.3",
    evidenceRefs: ["observed:runtime.host_observed"]
  },
  executorSelfReport: {
    kind: "executor.self_report.observed",
    executorId: "executor:v0.3",
    evidenceRefs: ["observed:executor.self_report"]
  },
  executorHostObserved: {
    kind: "executor.host_observed",
    executorId: "executor:v0.3",
    evidenceRefs: ["observed:executor.host_observed"]
  }
});
const REPLAY_ANCHOR_PROJECTION = Object.freeze({
  kind: "trusted-journal-replay-anchor",
  producerContractVersion: "shield.v0.3.fixture",
  producerDigest: "0".repeat(64),
  anchorDigest: "1".repeat(64),
  anchorRevision: OID40,
  parentMissionId: "mission:v0.3:external-acceptance:1",
  parentMissionRevision: OID40,
  parentSessionId: "session:v0.3:mission-parent:1",
  childTaskId: "task:v0.3:external-acceptance:1",
  childSessionId: "session:v0.3:child:1",
  repositoryId: "repository:fixture:external-v03",
  repositoryWorkspaceId: "workspace:fixture:external-v03",
  repositoryRevision: OID40,
  subjectId: "fixture:v0.3:external-acceptance:1",
  subjectRevision: OID40,
  artifactId: "fixture:v0.3:external-acceptance:1",
  artifactRevision: OID40,
  accountableSeatId: "daisy",
  currentSequence: 1,
  lifecycle: "mission:lifecycle"
});
const fixtureIdentity = await verifyFixtureIdentity(root, FIXTURE_RELEASE_BASELINE);
if (fixtureIdentity.state !== "valid") {
  throw new Error(`fixture identity preflight failed: ${fixtureIdentity.state}:${fixtureIdentity.reason}`);
}

const {
  FIXTURE_MANIFEST,
  validateFixtureManifest
} = await import("../fixture-manifest.mjs");
const { createEvidenceInventory, gradeEvidenceInventory: gradeEvidenceInventoryReplay } = await import("../evidence-inventory.mjs");

const gradeEvidenceInventory = (inventory, options = {}) => gradeEvidenceInventoryReplay(inventory, {
  replayAnchor: REPLAY_ANCHOR_PROJECTION,
  ...options
});
const {
  composeMinimumFixture,
  gradeCandidateWithFailureInjection
} = await import("../src/driver.mjs");

const clone = (value) => structuredClone(value);
const digest = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const evidenceIdentitySource = Object.freeze({
  sourceId: "source:fixture",
  sourceDigest: OID64
});
const HUMAN_AUTHORITY_SEAT = Object.freeze({
  "coulson.authorization": "coulson",
  "fitz.technical-review": "fitz",
  "simmons.product-review": "simmons"
});
const COVERED_ARTIFACTS = Object.freeze([
  ["manifest", "fixture-manifest.mjs"],
  ["template-package", "template/package.json"],
  ["template-source", "template/src/greeting.mjs"],
  ["template-test", "template/test/greeting.test.mjs"],
  ["grading-driver", "src/driver.mjs"],
  ["evidence-inventory", "evidence-inventory.mjs"]
]);

function dispatchReceiptLog(overrides = {}, startedAt = "2026-07-26T00:00:00Z", completedAt = "2026-07-26T00:00:01Z", outputEvidenceRefs = []) {
  const identity = Object.freeze({
    ...REPLAY_SEAT_DISPATCH_FIXTURE,
    ...overrides,
    accountableSeatId: overrides.accountableSeatId ?? "daisy"
  });
  const started = createSeatDispatchStartedEventV1({
    ...identity,
    inputEvidenceRefs: [],
    timestamp: startedAt,
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null
  });
  const completed = createSeatDispatchLifecycleEventV1({
    ...identity,
    kind: "dispatch.completed",
    outputEvidenceRefs,
    timestamp: completedAt,
    logSequence: 1,
    previousLogDigest: started.entryDigest,
    lifecycleSequence: 1,
    previousLifecycleDigest: started.entryDigest
  });
  return Object.freeze([started, completed]);
}

function attributionInputForEvidence(entry, evidenceRef, overrides = {}) {
  const identity = {
    ...REPLAY_SEAT_DISPATCH_FIXTURE,
    ...overrides,
    accountableSeatId: overrides.accountableSeatId ?? "daisy"
  };
  return Object.freeze({
    rawReceiptEntries: dispatchReceiptLog(
      identity,
      "2026-07-26T00:00:00Z",
      "2026-07-26T00:00:01Z",
      [evidenceRef]
    )
  });
}

function recordedEvidence(base, overrides = {}, forHuman = false) {
  return Object.freeze({
    ...base,
    state: "recorded",
    evidenceIdentity: overrides.evidenceIdentity ?? base.evidenceIdentity ?? "source:fixture:evidence",
    provenance: overrides.provenance ?? base.provenance ?? evidenceIdentitySource,
    measurementClass: overrides.measurementClass ?? "measured",
    accountableSeat: overrides.accountableSeat ?? (forHuman ? "coulson" : "daisy"),
    dispatchReceipt: overrides.dispatchReceipt ?? null,
    verifiedHumanEvidenceRef: overrides.verifiedHumanEvidenceRef ?? null,
    evidenceRef: overrides.evidenceRef ?? "observed:package.artifact.digest"
  });
}

function recordedHumanEvidence(base, overrides = {}) {
  const authoritativeSeat = HUMAN_AUTHORITY_SEAT[base.evidenceId] ?? "coulson";
  return recordedEvidence(base, {
    accountableSeat: authoritativeSeat,
    verifiedHumanEvidenceRef: overrides.verifiedHumanEvidenceRef ?? evidenceIdentitySource,
    ...overrides
  }, true);
}

function packTeamSystemFromHead(destination) {
  const archive = join(destination, "package-tree.tar");
  execFileSync("git", [
    "-C",
    repositoryRoot,
    "archive",
    "--format=tar",
    "--prefix=shield-team-system/",
    "HEAD:packages/shield-team-system",
    "-o",
    archive
  ]);
  execFileSync("tar", ["-x", "-f", archive, "-C", destination], { encoding: "utf8" });
  execFileSync("rm", ["-rf", join(destination, "shield-team-system", "dist")]);
  execFileSync("cp", ["-R", join(packageRoot, "dist"), join(destination, "shield-team-system", "dist")]);
  return join(destination, "shield-team-system");
}

function packTeamSystem(destination, source = packageRoot) {
  const packRoot = source === packageRoot ? packTeamSystemFromHead(destination) : source;
  const output = JSON.parse(execFileSync("npm", [
    "pack",
    packRoot,
    "--json",
    "--pack-destination",
    destination,
    "--cache",
    join(destination, ".npm-cache"),
    "--ignore-scripts"
  ], { encoding: "utf8" }));
  return join(destination, output[0].filename);
}

async function composeInstalledArtifact(artifactPath, expectedPackage) {
  const consumerRoot = await mkdtemp(join(tmpdir(), "shield-v03-installed-package-"));
  try {
    await writeFile(join(consumerRoot, "package.json"), '{"private":true,"type":"module"}\n');
    await cp(artifactPath, join(consumerRoot, "shield-team-system.tgz"));
    try {
      execFileSync("npm", [
        "install",
        "--save-dev",
        "--save-exact",
        "shield-team-system.tgz",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--offline",
        "--cache",
        join(consumerRoot, ".npm-cache")
      ], {
        cwd: consumerRoot,
        encoding: "utf8",
        stdio: "ignore"
      });
    } catch {
      return Object.freeze({ state: "blocked", reason: "package_artifact_install_failed" });
    }

    let installedManifest;
    try {
      installedManifest = JSON.parse(await readFile(
        join(consumerRoot, "node_modules/@shield/team-system/package.json"),
        "utf8"
      ));
    } catch {
      return Object.freeze({ state: "blocked", reason: "installed_package_identity_missing" });
    }
    if (!installedManifest ||
        installedManifest.name !== expectedPackage.name ||
        installedManifest.version !== expectedPackage.version) {
      return Object.freeze({ state: "blocked", reason: "installed_package_identity_mismatch" });
    }
    return Object.freeze({ state: "passed" });
  } finally {
    await rm(consumerRoot, { recursive: true, force: true });
  }
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function createExternalRepository(directory, {
  baseGreetingSource,
  baseTestSource,
  objectFormat = "sha1"
} = {}) {
  await cp(template, directory, { recursive: true });
  if (baseGreetingSource) {
    await writeFile(join(directory, "src/greeting.mjs"), baseGreetingSource);
  }
  if (baseTestSource) {
    await writeFile(join(directory, "test/greeting.test.mjs"), baseTestSource);
  }
  if (objectFormat === "sha256") {
    git(directory, ["init", "--quiet", "--object-format=sha256"]);
  } else {
    git(directory, ["init", "--quiet"]);
  }
  git(directory, ["config", "user.name", "SHIELD fixture"]);
  git(directory, ["config", "user.email", "fixture@shield.invalid"]);
  await mkdir(join(directory, ".shield"), { recursive: true });
  await writeFile(join(directory, ".shield/config.json"), `${JSON.stringify({
    schemaVersion: 1,
  repositoryId: "repository:fixture:external-v03",
    adapterId: "github",
    supportedSeatIds: ["hill", "daisy", "fury", "may", "coulson", "fitz", "simmons"],
    supportedModeIds: ["delivery", "debugger"],
    trustedHumanBindingRefs: [
      { seatId: "coulson", bindingRef: "fixture:human:coulson" },
      { seatId: "fitz", bindingRef: "fixture:human:fitz" }
    ],
    paths: {
      journals: ".shield/journals",
      artifacts: ".shield/artifacts",
      reports: ".shield/reports",
      temp: ".shield/tmp"
    }
  }, null, 2)}\n`);
  await writeFile(join(directory, ".shield/.gitignore"), "/journals/\n/reports/\n/tmp/\n");
  await writeFile(join(directory, ".gitignore"), [
    "node_modules/",
    "test/extra.test.mjs",
    ""
  ].join("\n"));
  git(directory, ["add", "."]);
  git(directory, ["commit", "--quiet", "-m", "post-adoption fixture base"]);
  const baseRevision = git(directory, ["rev-parse", "HEAD"]);
  await writeFile(join(directory, "src/greeting.mjs"), [
    "export function greeting(name) {",
    "  return `Hello, ${name.trim()}!`;",
    "}",
    ""
  ].join("\n"));
  git(directory, ["add", "src/greeting.mjs"]);
  git(directory, ["commit", "--quiet", "-m", "repair greeting"]);
  return Object.freeze({
    baseRevision,
    headRevision: git(directory, ["rev-parse", "HEAD"])
  });
}

function fixtureInput(artifact, artifactDigest, directory, revisions, overrides = {}) {
  return {
    packageArtifactPath: artifact,
    packageArtifactSha256: artifactDigest,
    externalRepositoryRoot: directory,
    baseRevision: revisions.baseRevision,
    headRevision: revisions.headRevision,
    hostConfiguration: {
      adapterId: "github",
      repository: "fixture/external-v03",
      branch: "fixture/mission-1"
    },
    blindStatus: "partially-informed",
    priorSolutionsVisible: false,
    requireSimmons: true,
    releaseBaseline: FIXTURE_RELEASE_BASELINE,
    ...overrides
  };
}

async function withFixtureCopy(mutator) {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-fixture-copy-"));
  await cp(root, directory, { recursive: true });
  try {
    await mutator(directory);
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function verifyCopyIdentity(mutator, releaseBaseline) {
  const effectiveBaseline = arguments.length === 1 ? FIXTURE_RELEASE_BASELINE : releaseBaseline;
  const copied = await withFixtureCopy(async (copyRoot) => {
    await mutator(copyRoot);
  });
  return Object.freeze({
    copied,
    outcome: await verifyFixtureIdentity(copied, effectiveBaseline)
  });
}

test("fixture manifest is closed, frozen, versioned, and separates the later campaign", () => {
  assert.equal(validateFixtureManifest(FIXTURE_MANIFEST).state, "valid");
  assert.equal(Object.isFrozen(FIXTURE_MANIFEST), true);
  assert.equal(Object.isFrozen(FIXTURE_MANIFEST.dependencyBlockers), true);
  assert.equal(FIXTURE_MANIFEST.ownerIssue, "#12");
  assert.equal(FIXTURE_MANIFEST.excludedCampaign.issue, "#14");
  assert.equal(FIXTURE_MANIFEST.template.testLane, "node --test test/greeting.test.mjs");

  const extra = clone(FIXTURE_MANIFEST);
  extra.unexpected = true;
  assert.equal(validateFixtureManifest(extra).reason, "fixture_manifest_not_closed");
  const drifted = clone(FIXTURE_MANIFEST);
  drifted.ownerIssue = "#14";
  assert.equal(validateFixtureManifest(drifted).reason, "fixture_manifest_drift");
});

test("fixture identity preflight rejects covered drift before composition", async (context) => {
  for (const [artifactType, artifactPath] of COVERED_ARTIFACTS) {
    const { copied, outcome } = await verifyCopyIdentity(async (directory) => {
      const target = join(directory, artifactPath);
      const bytes = await readFile(target);
      const mutated = Buffer.from(bytes);
      mutated[0] = mutated[0] === 0 ? 1 : 0;
      await writeFile(target, mutated);
    });
    context.after(async () => {
      await rm(copied, { recursive: true, force: true });
    });
    assert.equal(outcome.state, "blocked");
    assert.equal(outcome.reason, `fixture_identity_drift:${artifactType}`);
  }

  const { copied: missingCopy, outcome: missingOutcome } = await verifyCopyIdentity(async (directory) => {
    await rm(join(directory, "template/package.json"));
  });
  context.after(async () => {
    await rm(missingCopy, { recursive: true, force: true });
  });
  assert.equal(missingOutcome.state, "blocked");
  assert.equal(missingOutcome.reason, "fixture_identity_missing_artifact");

  const { copied: substitutionCopy, outcome: substitutionOutcome } = await verifyCopyIdentity(async (directory) => {
    const identity = join(directory, "fixture-identity-v1.json");
    const bytes = await readFile(identity);
    const mutated = Buffer.from(bytes);
    mutated[0] = mutated[0] === 0 ? 1 : 0;
    await writeFile(identity, mutated);
  });
  context.after(async () => {
    await rm(substitutionCopy, { recursive: true, force: true });
  });
  assert.equal(substitutionOutcome.state, "blocked");
  assert.equal(substitutionOutcome.reason, "fixture_identity_record_digest_mismatch");
});

test("fixture identity verifier rejects missing/malformed baselines, modified verifier identity, and identity symlinks", async (context) => {
  const { copied: missingCopy, outcome: missingBaseline } = await verifyCopyIdentity(async () => {}, undefined);
  context.after(async () => {
    await rm(missingCopy, { recursive: true, force: true });
  });
  assert.equal(missingBaseline.state, "invalid");
  assert.equal(missingBaseline.reason, "fixture_identity_baseline_missing");

  const { copied: malformedCopy, outcome: malformedBaseline } = await verifyCopyIdentity(async () => {}, "bad-baseline");
  context.after(async () => {
    await rm(malformedCopy, { recursive: true, force: true });
  });
  assert.equal(malformedBaseline.state, "invalid");
  assert.equal(malformedBaseline.reason, "fixture_identity_baseline_malformed");

  const outside = await mkdtemp(join(tmpdir(), "shield-v03-outside-baseline-"));
  const outsideIdentity = join(outside, "identity.json");
  await writeFile(outsideIdentity, FIXTURE_IDENTITY_BYTES);
  context.after(async () => {
    await rm(outside, { recursive: true, force: true });
  });
  const { copied: symlinkCopy, outcome: symlinkOutcome } = await verifyCopyIdentity(async (directory) => {
    const identityPath = join(directory, "fixture-identity-v1.json");
    await rm(identityPath);
    await symlink(outsideIdentity, identityPath);
  });
  context.after(async () => {
    await rm(symlinkCopy, { recursive: true, force: true });
  });
  assert.equal(symlinkOutcome.state, "blocked");
  assert.equal(symlinkOutcome.reason, "fixture_identity_record_not_file");

  const { copied: verifierCopy, outcome: verifierOutcome } = await verifyCopyIdentity(async () => {}, {
    ...FIXTURE_RELEASE_BASELINE,
    verifierIdentity: "launcher:tampered"
  });
  context.after(async () => {
    await rm(verifierCopy, { recursive: true, force: true });
  });
  assert.equal(verifierOutcome.state, "blocked");
  assert.equal(verifierOutcome.reason, "fixture_identity_verifier_identity_mismatch");
});

test("host launcher rejects a candidate-modified verifier before import", async (context) => {
  const copied = await withFixtureCopy(async (directory) => {
    const verifierPath = join(directory, "verify-fixture-identity.mjs");
    await writeFile(verifierPath, `${await readFile(verifierPath, "utf8")}\n// candidate mutation\n`);
  });
  context.after(() => rm(copied, { recursive: true, force: true }));
  const outside = await mkdtemp(join(tmpdir(), "shield-v03-host-baseline-"));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const baselinePath = join(outside, "release-baseline.json");
  await writeFile(baselinePath, JSON.stringify(FIXTURE_RELEASE_BASELINE));
  await assert.rejects(
    launchExternalFixture({ fixtureRoot: copied, baselinePath, input: {} }),
    /verifier_digest_mismatch/
  );
});

test("host launcher accepts only an externally digested replay-anchor envelope", async (context) => {
  const outside = await mkdtemp(join(tmpdir(), "shield-v03-host-anchor-"));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const anchorPath = join(outside, "replay-anchor.json");
  const projectionBytes = Buffer.from(JSON.stringify(REPLAY_ANCHOR_PROJECTION));
  const envelope = {
    kind: "trusted-journal-replay-anchor-envelope",
    digest: createHash("sha256").update(projectionBytes).digest("hex"),
    projection: REPLAY_ANCHOR_PROJECTION
  };
  await writeFile(anchorPath, JSON.stringify(envelope));
  assert.deepEqual(
    await loadTrustedReplayAnchor({ anchorPath, fixtureRoot: root }),
    REPLAY_ANCHOR_PROJECTION
  );
  await writeFile(anchorPath, JSON.stringify({ ...envelope, projection: { ...REPLAY_ANCHOR_PROJECTION, currentSequence: 2 } }));
  await assert.rejects(
    loadTrustedReplayAnchor({ anchorPath, fixtureRoot: root }),
    /trusted_replay_anchor_digest_mismatch/
  );
});

test("fake text artifacts cannot claim public-surface composition", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-composition-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = join(directory, "shield-team-system.tgz");
  await writeFile(artifact, "not a package artifact\n");
  const external = join(directory, "external");
  const revisions = await createExternalRepository(external);
  const result = await composeMinimumFixture(
    fixtureInput(artifact, await digest(artifact), external, revisions)
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "package_artifact_digest_mismatch");
});

test("exact packed artifact preflights package identity and then blocks on dependency contract", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-packed-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = packTeamSystem(directory);
  const external = join(directory, "external");
  const revisions = await createExternalRepository(external);
  const result = await composeMinimumFixture(
    fixtureInput(artifact, await digest(artifact), external, revisions)
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "dependency_contract_unavailable");
  assert.deepEqual(result.blockers.map(({ issue }) => issue), ["#24", "#112", "#113"]);
  assert.equal(result.identity.installedPackage.name, "@shield/team-system");
  assert.equal(result.identity.externalRevision.baseRevision, revisions.baseRevision);
  assert.equal(result.identity.externalRevision.headRevision, revisions.headRevision);
  assert.deepEqual(result.identity.externalRevision.changedPaths, ["src/greeting.mjs"]);
  assert.equal(result.foundation.hostFailureCandidateState, "valid");
  assert.equal(result.foundation.hostEffectsPerformed, false);
  assert.equal(result.foundation.expectedFitzState, "waiting");
  assert.equal(result.foundation.expectedSimmonsState, "waiting");
  assert.equal(result.evidenceInventory.find(({ evidenceId }) => evidenceId === "fitz.technical-review").state, "waiting");

  const source = await readFile(join(root, "src/driver.mjs"), "utf8");
  assert.doesNotMatch(source, /packages\/shield-team-system\/dist/u);
});

test("composition rejects package substitution and changed-path scope drift", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-identity-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = join(directory, "artifact.tgz");
  await writeFile(artifact, "artifact\n");
  const external = join(directory, "external");
  const revisions = await createExternalRepository(external);
  const base = fixtureInput(artifact, "0".repeat(64), external, revisions, {
    blindStatus: "blind",
    requireSimmons: false
  });
  assert.equal((await composeMinimumFixture(base)).reason, "package_artifact_digest_mismatch");
  await writeFile(join(external, "README.md"), "scope drift\n");
  git(external, ["add", "README.md"]);
  git(external, ["commit", "--quiet", "-m", "scope drift"]);
  assert.equal((await composeMinimumFixture({
    ...base,
    packageArtifactSha256: await digest(artifact),
    headRevision: git(external, ["rev-parse", "HEAD"])
  })).reason, "scope_drift");
});

test("composition rejects malformed revisions and unsupported object formats", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-revisions-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = join(directory, "artifact.tgz");
  await writeFile(artifact, "artifact\n");
  const external = join(directory, "external");
  const revisions = await createExternalRepository(external);
  const input = fixtureInput(artifact, await digest(artifact), external, revisions);

  assert.equal((await composeMinimumFixture({
    ...input,
    baseRevision: revisions.baseRevision.slice(0, 4)
  })).reason, "external_revision_identity_malformed");

  assert.equal((await composeMinimumFixture({
    ...input,
    baseRevision: `ZZ${revisions.baseRevision.slice(2)}`
  })).reason, "external_revision_identity_malformed");

  assert.equal((await composeMinimumFixture({
    ...input,
    baseRevision: `${revisions.baseRevision}dead`
  })).reason, "external_revision_identity_malformed");

  const unsupportedObjectFormatRepository = join(directory, "unsupported-format");
  const unsupportedRevisions = await createExternalRepository(unsupportedObjectFormatRepository);
  const badFormatArtifact = packTeamSystem(directory);
  const fakeGitDirectory = join(directory, "fake-git-bin");
  await mkdir(fakeGitDirectory);
  const realGitPath = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const fakeGitPath = join(fakeGitDirectory, "git");
  await writeFile(fakeGitPath, [
    "#!/usr/bin/env sh",
    `REAL_GIT=${JSON.stringify(realGitPath)}`,
    'if [ "$1" = "rev-parse" ] && [ "$2" = "--show-object-format" ]; then',
    '  echo "sha512"',
    "  exit 0",
    "fi",
    'exec "$REAL_GIT" "$@"'
  ].join("\n"), "utf8");
  execFileSync("chmod", ["+x", fakeGitPath]);
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = `${fakeGitDirectory}:${previousPath}`;
  const badFormat = await composeMinimumFixture(
      fixtureInput(
        badFormatArtifact,
        await digest(badFormatArtifact),
        unsupportedObjectFormatRepository,
        unsupportedRevisions
      )
    );
    assert.equal(badFormat.reason, "external_repository_object_format_unsupported");
  } finally {
    process.env.PATH = previousPath;
  }

  const sha256External = join(directory, "sha256-external");
  const sha256Revisions = await createExternalRepository(sha256External, { objectFormat: "sha256" });
  const sha256Artifact = packTeamSystem(directory);
  const sha256Result = await composeMinimumFixture(fixtureInput(
    sha256Artifact,
    await digest(sha256Artifact),
    sha256External,
    sha256Revisions
  ));
  assert.equal(sha256Result.reason, "dependency_contract_unavailable");

  assert.equal((await composeMinimumFixture({
    ...fixtureInput(
      sha256Artifact,
      await digest(sha256Artifact),
      sha256External,
      sha256Revisions
    ),
    headRevision: `${sha256Revisions.headRevision.slice(0, 40)}`
  })).reason, "external_revision_identity_malformed");
});

test("composition rejects wrong package version and exact-package hash mismatches", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-package-version-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const baseArtifact = packTeamSystem(directory);
  assert.equal((await composeInstalledArtifact(baseArtifact, {
    name: "@shield/team-system",
    version: "0.1.0"
  })).state, "passed");

  const wrongNamePackage = join(directory, "wrong-name");
  await cp(packageRoot, wrongNamePackage, { recursive: true });
  const wrongNamePackageJson = JSON.parse(await readFile(join(wrongNamePackage, "package.json"), "utf8"));
  wrongNamePackageJson.name = "@shield/team-system-alt";
  await writeFile(
    join(wrongNamePackage, "package.json"),
    `${JSON.stringify(wrongNamePackageJson, null, 2)}\n`
  );
  const wrongNameArtifact = packTeamSystem(directory, wrongNamePackage, true);
  assert.equal((await composeInstalledArtifact(wrongNameArtifact, {
    name: "@shield/team-system",
    version: "0.1.0"
  })).reason, "installed_package_identity_missing");

  const wrongVersionPackage = join(directory, "wrong-version");
  await cp(packageRoot, wrongVersionPackage, { recursive: true });
  const wrongVersionPackageJson = JSON.parse(await readFile(join(wrongVersionPackage, "package.json"), "utf8"));
  wrongVersionPackageJson.version = "0.1.1";
  await writeFile(
    join(wrongVersionPackage, "package.json"),
    `${JSON.stringify(wrongVersionPackageJson, null, 2)}\n`
  );
  const wrongArtifact = packTeamSystem(directory, wrongVersionPackage, true);
  assert.equal((await composeInstalledArtifact(wrongArtifact, {
    name: "@shield/team-system",
    version: "0.1.0"
  })).reason, "installed_package_identity_mismatch");

  const external = join(directory, "external");
  const revisions = await createExternalRepository(external);
  const wrongVersionInput = fixtureInput(
    wrongArtifact,
    await digest(wrongArtifact),
    external,
    revisions
  );
  assert.equal((await composeMinimumFixture(wrongVersionInput)).reason, "package_artifact_digest_mismatch");

  const hashMismatchArtifact = packTeamSystem(directory);
  assert.equal((
    await composeMinimumFixture({
    ...fixtureInput(hashMismatchArtifact, await digest(hashMismatchArtifact), external, revisions),
    packageArtifactSha256: "0".repeat(64)
  })
  ).reason, "package_artifact_digest_mismatch");
});
test("baseline defect fails and fixture-only injection restores the exact passing candidate", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-defect-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const revisions = await createExternalRepository(directory);
  const result = await gradeCandidateWithFailureInjection({
    fixtureRoot: directory,
    ...revisions
  });
  assert.equal(result.state, "passed", JSON.stringify(result));
  assert.equal(result.injectedOutcome, "failed");
  assert.equal(result.rollbackOutcome, "passed");
  assert.equal(result.candidateSha256, result.restoredSha256);
  assert.deepEqual(result.externalRevision.changedPaths, ["src/greeting.mjs"]);
  assert.deepEqual(result.networkObservability, {
    state: "not-observable",
    reason: "no_network_sandbox"
  });
  assert.equal(Object.hasOwn(result, "networkEffectsPerformed"), false);
  assert.equal(
    JSON.parse(git(directory, ["show", `${revisions.baseRevision}:.shield/config.json`])).repositoryId,
    "repository:fixture:external-v03"
  );
});

test("frozen adoption base rejects arbitrary source and exact-test substitution", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-frozen-base-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const substitutedSource = join(directory, "source");
  const sourceRevisions = await createExternalRepository(substitutedSource, {
    baseGreetingSource: "export const greeting = () => 'substituted';\n"
  });
  assert.equal((await gradeCandidateWithFailureInjection({
    fixtureRoot: substitutedSource,
    ...sourceRevisions
  })).reason, "frozen_base_content_mismatch:src/greeting.mjs");

  const substitutedTest = join(directory, "test");
  const testRevisions = await createExternalRepository(substitutedTest, {
    baseTestSource: [
      'import test from "node:test";',
      'test("substituted", () => {});',
      ""
    ].join("\n")
  });
  assert.equal((await gradeCandidateWithFailureInjection({
    fixtureRoot: substitutedTest,
    ...testRevisions
  })).reason, "frozen_base_content_mismatch:test/greeting.test.mjs");
});

test("unexpected untracked files block while ignored files do not expand exact test selection", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-untracked-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const revisions = await createExternalRepository(directory);
  await writeFile(join(directory, "test/untracked.test.mjs"), "throw new Error('untracked');\n");
  assert.equal((await gradeCandidateWithFailureInjection({
    fixtureRoot: directory,
    ...revisions
  })).reason, "external_revision_not_clean");
  await rm(join(directory, "test/untracked.test.mjs"));
  await writeFile(join(directory, "notes.txt"), "unexpected untracked file\n");
  assert.equal((await gradeCandidateWithFailureInjection({
    fixtureRoot: directory,
    ...revisions
  })).reason, "external_revision_not_clean");
  await rm(join(directory, "notes.txt"));

  await writeFile(join(directory, "test/extra.test.mjs"), "throw new Error('must not execute');\n");
  const result = await gradeCandidateWithFailureInjection({
    fixtureRoot: directory,
    ...revisions
  });
  assert.equal(result.state, "passed", JSON.stringify(result));
});

test("blind classification rejects visible prior solutions", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-blind-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = join(directory, "artifact.tgz");
  await writeFile(artifact, "artifact\n");
  const external = join(directory, "external");
  const revisions = await createExternalRepository(external);
  const result = await composeMinimumFixture(fixtureInput(
    artifact,
    await digest(artifact),
    external,
    revisions,
    { blindStatus: "blind", priorSolutionsVisible: true }
  ));
  assert.equal(result.state, "invalid");
  assert.equal(result.reason, "blind_status_contradiction");
});

test("evidence inventory records exact class defaults for operator-recorded and human-only" , () => {
  const inventory = createEvidenceInventory({ requireSimmons: true });
  assert.deepEqual(
    inventory.filter(({ evidenceId }) => [
      "external.head.revision",
      "model.runtime.executor.identity",
      "clocks.timing",
      "usage.observability",
      "host.manual-fallback"
    ].includes(evidenceId)).map(({ evidenceId, authority, measurementClass }) => [
      evidenceId,
      authority,
      measurementClass
    ]),
    [
      ["external.head.revision", "measured", null],
      ["model.runtime.executor.identity", "operator-recorded", null],
      ["clocks.timing", "measured", null],
      ["usage.observability", "operator-recorded", null],
      ["host.manual-fallback", "operator-recorded", null]
    ]
  );
  assert.deepEqual(
    inventory.filter(({ authority }) => authority === "human-only").map(({ evidenceId, state }) => [evidenceId, state]),
    [
      ["coulson.authorization", "missing"],
      ["fitz.technical-review", "waiting"],
      ["simmons.product-review", "waiting"]
    ]
  );
  const grade = gradeEvidenceInventory(inventory, { requireSimmons: true });
  assert.equal(grade.state, "blocked");
  assert.ok(grade.reasons.includes("evidence_missing:fitz.technical-review"));
});

test("evidence inventory rejects missing or malformed replay anchors before attribution", () => {
  const inventory = createEvidenceInventory({ requireSimmons: true });
  const missing = gradeEvidenceInventoryReplay(inventory);
  assert.ok(missing.reasons.includes("evidence_replay_anchor_missing"));
  const malformed = gradeEvidenceInventoryReplay(inventory, {
    replayAnchor: { ...REPLAY_ANCHOR_PROJECTION, producerDigest: "invalid" }
  });
  assert.ok(malformed.reasons.includes("evidence_replay_anchor_missing"));
});

test("evidence inventory rejects omissions, extras, malformed states, and malformed classes", () => {
  const inventory = createEvidenceInventory({ requireSimmons: false });
  assert.ok(gradeEvidenceInventory(inventory.slice(1)).reasons.includes("evidence_inventory_not_closed"));
  assert.ok(gradeEvidenceInventory(
    inventory.filter(({ evidenceId }) => evidenceId !== "external.head.revision")
  ).reasons.includes("evidence_inventory_not_closed"));
  const malformed = { ...inventory[0], state: "approved", evidenceRef: null };
  assert.ok(gradeEvidenceInventory([
    malformed,
    ...inventory.slice(1)
  ]).reasons.includes("evidence_entry_malformed:package.artifact.digest"));
  assert.ok(gradeEvidenceInventory(inventory, {
    requireSimmons: true
  }).reasons.includes("evidence_inventory_not_closed"));
  const measurementInvalid = {
    ...inventory[0],
    state: "recorded",
    evidenceIdentity: "invalid-id",
    provenance: {
      sourceId: "source",
      sourceDigest: "0".repeat(64)
    },
    measurementClass: "invalid",
    accountableSeat: "may",
    evidenceRef: "observed:package.artifact.digest",
    dispatchReceipt: Object.freeze({})
  };
  const recorded = [
    measurementInvalid,
    ...inventory.slice(1)
  ];
  assert.ok(gradeEvidenceInventory(recorded).reasons.includes("evidence_measurement_class_malformed:package.artifact.digest"));
  const missingIdentity = {
    ...inventory[0],
    state: "recorded",
    evidenceIdentity: "package.artifact.digest",
    provenance: {
      sourceId: "source",
      sourceDigest: "0".repeat(63)
    },
    measurementClass: "measured",
    accountableSeat: "may",
    evidenceRef: "observed:package.artifact.digest",
    dispatchReceipt: null
  };
  assert.ok(gradeEvidenceInventory([
    missingIdentity,
    ...inventory.slice(1)
  ]).reasons.includes("evidence_identity_malformed:package.artifact.digest"));
});

test("evidence inventory validates all configured measurement classes for recorded entries", () => {
  const inventory = createEvidenceInventory({ requireSimmons: false });
  const base = inventory.find(({ evidenceId }) => evidenceId === "host.configuration");
  assert.ok(base !== undefined);
  for (const measurementClass of ["measured", "derived", "estimated"]) {
    const recorded = recordedEvidence(base, { measurementClass, evidenceRef: "observed:host.configuration" });
    const graded = gradeEvidenceInventory(inventory.map((entry) => entry.evidenceId === "host.configuration" ? recorded : entry));
    assert.ok(graded.reasons.includes("evidence_measurement_class_malformed:host.configuration"));
  }

  const invalid = recordedEvidence(base, {
    measurementClass: "unknown",
    evidenceRef: "observed:host.configuration"
  });
  const gradedInvalid = gradeEvidenceInventory(inventory.map((entry) => entry.evidenceId === "host.configuration" ? invalid : entry));
  assert.ok(gradedInvalid.reasons.includes("evidence_measurement_class_malformed:host.configuration"));
});

test("evidence inventory rejects malformed human evidence and fabricated runtime/executor replay payloads", () => {
  const inventory = createEvidenceInventory({ requireSimmons: true });
  const fitz = inventory.find(({ evidenceId }) => evidenceId === "fitz.technical-review");
  assert.ok(fitz !== undefined);
  const recordedValid = recordedHumanEvidence(fitz);
  const withVerified = gradeEvidenceInventory(inventory.map((entry) => entry.evidenceId === "fitz.technical-review" ? recordedValid : entry), {
    requireSimmons: true
  });
  assert.ok(!withVerified.reasons.includes("evidence_entry_malformed:fitz.technical-review"));

  const badSeat = recordedHumanEvidence(fitz, { accountableSeat: "daisy" });
  const seatFail = gradeEvidenceInventory(inventory.map((entry) => entry.evidenceId === "fitz.technical-review" ? badSeat : entry), {
    requireSimmons: true
  });
  assert.ok(seatFail.reasons.includes("evidence_entry_malformed:fitz.technical-review"));

  const badReceipt = recordedHumanEvidence(fitz, { dispatchReceipt: Object.freeze({}) });
  const receiptFail = gradeEvidenceInventory(inventory.map((entry) => entry.evidenceId === "fitz.technical-review" ? badReceipt : entry), {
    requireSimmons: true
  });
  assert.ok(receiptFail.reasons.includes("evidence_entry_malformed:fitz.technical-review"));

  const missingVerified = recordedHumanEvidence(fitz, { verifiedHumanEvidenceRef: null });
  const verifiedFail = gradeEvidenceInventory(inventory.map((entry) => entry.evidenceId === "fitz.technical-review" ? missingVerified : entry), {
    requireSimmons: true
  });
  assert.ok(verifiedFail.reasons.includes("evidence_entry_malformed:fitz.technical-review"));
});

test("evidence inventory attribution requires exact replay matching", () => {
  const inventory = createEvidenceInventory({ requireSimmons: false });
  const base = inventory.find(({ evidenceId }) => evidenceId === "package.artifact.digest");
  assert.ok(base !== undefined);
  const evidence = recordedEvidence(base, {
    evidenceIdentity: "source:fixture:package.artifact.digest",
    evidenceRef: "observed:package.artifact.digest",
    dispatchReceipt: null
  });

  const attribution = attributionInputForEvidence(
    evidence,
    evidence.evidenceRef
  );
  const outcome = evaluateSeatDispatchAttributionV1({
    ...attribution,
    ...REPLAY_SEAT_DISPATCH_FIXTURE,
    accountableSeatId: evidence.accountableSeat,
    artifact: Object.freeze({
      evidenceId: evidence.evidenceId,
      evidenceIdentity: evidence.evidenceIdentity
    })
  });
  assert.equal(outcome.state, "attributed");
  const attributedEvidence = recordedEvidence(evidence, { dispatchReceipt: outcome.receipt });
  const gradedAttributed = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest" ? attributedEvidence : entry),
    {
      attributionInputs: {
        "package.artifact.digest": attribution
      }
    }
  );
  assert.ok(!gradedAttributed.reasons.includes("evidence_entry_malformed:package.artifact.digest"));
  assert.ok(!gradedAttributed.reasons.includes("evidence_missing:package.artifact.digest"));

  const staleAttribution = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest" ? attributedEvidence : entry),
    {
      attributionInputs: {
        "package.artifact.digest": attributionInputForEvidence(
          evidence,
          evidence.evidenceRef,
          { parentMissionRevision: "e".repeat(40) }
        )
      }
    }
  );
  assert.ok(staleAttribution.reasons.includes("evidence_attribution_failed:package.artifact.digest:stale_mission_revision"));

  const staleRepositoryAttribution = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest" ? attributedEvidence : entry),
    {
      attributionInputs: {
        "package.artifact.digest": attributionInputForEvidence(
          evidence,
          evidence.evidenceRef,
          { repositoryRevision: "f".repeat(40) }
        )
      }
    }
  );
  assert.ok(staleRepositoryAttribution.reasons.includes("evidence_attribution_failed:package.artifact.digest:stale_repository_revision"));

  const malformedReceiptChain = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest" ? attributedEvidence : entry),
    {
      attributionInputs: {
      "package.artifact.digest": {
          ...attribution,
          rawReceiptEntries: [{}]
        }
      }
    }
  );
  assert.ok(malformedReceiptChain.reasons.includes("evidence_attribution_failed:package.artifact.digest:malformed_raw_log"));

  const forgedSeat = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest" ? attributedEvidence : entry),
    {
      attributionInputs: {
        "package.artifact.digest": attributionInputForEvidence(
          evidence,
          evidence.evidenceRef,
          { accountableSeatId: "may" }
        )
      }
    }
  );
  assert.ok(forgedSeat.reasons.includes("evidence_attribution_failed:package.artifact.digest:forged_seat_label"));

  const wrongWorkspace = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest" ? attributedEvidence : entry),
    {
      attributionInputs: {
        "package.artifact.digest": {
          ...attributionInputForEvidence(
            evidence,
            evidence.evidenceRef,
            { repositoryWorkspaceId: "workspace:fixture:wrong" }
          )
        }
      }
    }
  );
  assert.ok(wrongWorkspace.reasons.includes("evidence_attribution_failed:package.artifact.digest:wrong_workspace"));

  const wrongSession = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest" ? attributedEvidence : entry),
    {
      attributionInputs: {
        "package.artifact.digest": {
          ...attributionInputForEvidence(
            evidence,
            evidence.evidenceRef,
            { parentSessionId: "session:wrong" }
          )
        }
      }
    }
  );
  assert.ok(wrongSession.reasons.includes("evidence_attribution_failed:package.artifact.digest:wrong_parent_session"));

  const nonTerminal = createSeatDispatchStartedEventV1({
    ...REPLAY_SEAT_DISPATCH_FIXTURE,
    accountableSeatId: "daisy",
    inputEvidenceRefs: [],
    timestamp: "2026-07-26T00:00:00Z",
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null
  });
  const nonTerminalGrade = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest" ? attributedEvidence : entry),
    {
      attributionInputs: {
        "package.artifact.digest": {
          rawReceiptEntries: [nonTerminal]
        }
      }
    }
  );
  assert.ok(nonTerminalGrade.reasons.includes("evidence_attribution_failed:package.artifact.digest:non_terminal_lifecycle"));

  const missingRuntime = attributionInputForEvidence(evidence, evidence.evidenceRef, {
    runtimeHostObserved: {
      kind: "runtime.host_observed.unavailable",
      reason: "unobserved"
    }
  });
  const missingRuntimeGrade = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest" ? attributedEvidence : entry),
    {
      attributionInputs: {
        "package.artifact.digest": missingRuntime
      }
    }
  );
  assert.ok(missingRuntimeGrade.reasons.includes("evidence_attribution_failed:package.artifact.digest:missing_runtime_observation"));

    const missingExecutor = attributionInputForEvidence(evidence, evidence.evidenceRef, {
      toolExecution: {
        kind: "tool.execution.requested",
        executorBindingRef: "binding:v0.3:executor"
      },
      executorHostObserved: {
        kind: "executor.host_observed.unavailable",
        reason: "not_observed"
      }
    });
  const missingExecutorGrade = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest" ? attributedEvidence : entry),
    {
      attributionInputs: {
        "package.artifact.digest": missingExecutor
      }
    }
  );
  assert.ok(missingExecutorGrade.reasons.includes("evidence_attribution_failed:package.artifact.digest:missing_executor_observation"));

  const timing = inventory.find(({ evidenceId }) => evidenceId === "clocks.timing");
  assert.ok(timing !== undefined);
  const timingAttribution = attributionInputForEvidence(
    timing,
    "observed:clocks.timing"
  );
  const timingOutcome = evaluateSeatDispatchAttributionV1({
    ...timingAttribution,
    ...REPLAY_SEAT_DISPATCH_FIXTURE,
    artifact: Object.freeze({
      evidenceId: timing.evidenceId,
      evidenceIdentity: timing.evidenceIdentity ?? "source:fixture:clocks.timing"
    }),
    accountableSeatId: "daisy"
  });
  const timingReceipt = timingOutcome.state === "attributed" ? timingOutcome.receipt : null;
  const reusedReceiptId = attribution.rawReceiptEntries[0].receiptId;
  const reusedReceiptInputs = {
    ...timingAttribution,
    rawReceiptEntries: timingAttribution.rawReceiptEntries.map((entry) => {
      const next = { ...entry };
      next.receiptId = reusedReceiptId;
      return next;
    })
  };
  const timingEvidence = recordedEvidence(timing, {
    evidenceIdentity: "source:fixture:clocks.timing",
    evidenceRef: "observed:clocks.timing",
    measurementClass: "measured",
    dispatchReceipt: timingReceipt,
    accountableSeat: "daisy"
  });
  const reusedReceipt = gradeEvidenceInventory(
    inventory.map((entry) => entry.evidenceId === "package.artifact.digest"
      ? attributedEvidence
      : entry.evidenceId === "clocks.timing"
        ? timingEvidence
        : entry),
    {
      attributionInputs: {
        "package.artifact.digest": attribution,
        "clocks.timing": reusedReceiptInputs
      }
    }
  );
  assert.ok(reusedReceipt.reasons.includes("evidence_entry_malformed:clocks.timing"));
});

test("fixture-only grader rejects a target that escapes through a symlink", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-v03-outside-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const revisions = await createExternalRepository(directory);
  const outsideTarget = join(outside, "greeting.mjs");
  await writeFile(outsideTarget, "outside bytes\n");
  await rm(join(directory, "src/greeting.mjs"));
  await symlink(outsideTarget, join(directory, "src/greeting.mjs"));
  git(directory, ["add", "src/greeting.mjs"]);
  git(directory, ["commit", "--quiet", "-m", "replace candidate with symlink"]);
  const symlinkRevisions = {
    ...revisions,
    headRevision: git(directory, ["rev-parse", "HEAD"])
  };
  const result = await gradeCandidateWithFailureInjection({
    fixtureRoot: directory,
    ...symlinkRevisions
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "fixture_target_unavailable");
  assert.equal(await readFile(outsideTarget, "utf8"), "outside bytes\n");
});

test("fixture-only grader never follows a symlink substituted during failure injection", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-race-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-v03-race-outside-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const outsideTarget = join(outside, "greeting.mjs");
  await writeFile(outsideTarget, "outside bytes\n");
  const revisions = await createExternalRepository(directory);
  const defectBytes = await readFile(join(template, "src/greeting.mjs"));
  let watching = true;
  const watcher = (async () => {
    while (watching) {
      try {
        const candidatePath = join(directory, "src/greeting.mjs");
        if ((await readFile(candidatePath)).equals(defectBytes)) {
          await rm(candidatePath);
          await symlink(outsideTarget, candidatePath);
          return;
        }
      } catch {
        return;
      }
      await new Promise((done) => setImmediate(done));
    }
  })();
  const result = await gradeCandidateWithFailureInjection({
    fixtureRoot: directory,
    ...revisions
  });
  watching = false;
  await watcher;
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "fixture_target_changed_before_rollback");
  assert.equal(await readFile(outsideTarget, "utf8"), "outside bytes\n");
});
