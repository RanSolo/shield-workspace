import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
  evaluateSeatDispatchAttributionV1
} from "@shield/team-system/dispatch-receipts";

import {
  composeExternalArtifact,
  gradeExternalFixture,
  launchExternalFixture,
  loadTrustedIsolationEnvelope,
  loadTrustedReplayAnchor,
  validateIsolationReceipt
} from "../../v0.3-fixture-host-launcher.mjs";

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
  identityRecordDigest: "fda6adf3344b499d9adfc5067fe2f4408f2a8b2c0f713b7bb75c68cba4c3d25b",
  verifierDigest: "0606191ca365169a788a857ab1dace7f8df9a6869ee442a80df3eb593e95237d",
  launcherDigest: "9232ae5b9681b58547f6cb2a7cd8db8700d78f7dee8086e6ecb28b9a89eed633",
  verifierIdentity: `node:${process.version}`,
  launcherIdentity: `node:${process.execPath}`,
  package: Object.freeze({
    name: "@shield/team-system",
    version: "0.1.0",
    digestAlgorithm: "sha256",
    digest: "05a8ee7222471925e49e794c7fb58fd1151dcfe2a8e2c8d20435118c340ec02e"
  })
});
const ISOLATION_ENVELOPE = Object.freeze({
  schemaVersion: "shield.fixture.isolation-envelope.v1",
  adapter: Object.freeze({
    adapterId: "macos-sandbox-exec",
    contractVersion: "v1",
    executableSha256: "8290e4be7387a0df83cd1559e86afd880464f269450573d012795761fe298f16",
    cdHashSha256: "2f619ca893522eb88a87dc31ddc1e8cad98f237d4672f6f9d0c9f05395572463"
  }),
  denialPolicy: Object.freeze({
    policyId: "deny-network-host-write-v1",
    policySha256: "407e468cf29c448c0eee70a1637c0aa792c7cbd2f4e5e8d5020d5b2652b528af"
  }),
  worker: Object.freeze({
    entryPoint: "v0.3-fixture-isolation-worker.mjs",
    sha256: "f161b6dfcd45c4cdd80f4a11ba202ebe02b9e2545f6dc93c93298e530a942a18"
  })
});
const EXPECTED_DEPENDENCY_BLOCKERS = Object.freeze([
  Object.freeze({
    issue: "#24",
    code: "accepted_product_contract_required",
    requiredState: "coulson-accepted",
    currentFixtureState: "reviewed-and-merged-awaiting-coulson-acceptance"
  }),
  Object.freeze({
    issue: "#138",
    code: "content_address_fixture_identity_required",
    requiredState: "implemented-and-validated",
    currentFixtureState: "open"
  }),
  Object.freeze({
    issue: "#140",
    code: "fixture_isolation_and_rollback_safety_required",
    requiredState: "implemented-and-validated",
    currentFixtureState: "open"
  })
]);
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
const preflightDirectory = await mkdtemp(join(tmpdir(), "shield-v03-entry-preflight-"));
try {
  const baselinePath = join(preflightDirectory, "release-baseline.json");
  await writeFile(baselinePath, JSON.stringify(FIXTURE_RELEASE_BASELINE));
  const preflight = await launchExternalFixture({
    fixtureRoot: root,
    operatorInput: {},
    hostContext: {
      baselinePath,
      authoritativeReceiptJournalPath: null,
      attributionContext: null,
      toolingContext: null
    }
  });
  if (preflight.state !== "invalid" || preflight.reason !== "fixture_input_not_closed") {
    throw new Error(`fixture launcher preflight failed: ${preflight.state}:${preflight.reason}`);
  }
} finally {
  await rm(preflightDirectory, { recursive: true, force: true });
}

const { verifyFixtureIdentity } = await import("../verify-fixture-identity.mjs");
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

function fixtureInput(artifact, directory, revisions, overrides = {}) {
  return {
    packageArtifactPath: artifact,
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
    ...overrides
  };
}

function fixtureTrustedHostContext(overrides = {}) {
  return {
    releaseBaseline: FIXTURE_RELEASE_BASELINE,
    validatedToolingContext: null,
    authoritativeReceiptEntries: null,
    attributionContext: null,
    ...overrides
  };
}

async function gradingTrust(interruptAfterPhase = null, failAfterCheckpoint = null) {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-grading-trust-"));
  const baselinePath = join(directory, "release-baseline.json");
  const isolationEnvelopePath = join(directory, "isolation-envelope.json");
  await writeFile(baselinePath, JSON.stringify(FIXTURE_RELEASE_BASELINE));
  await writeFile(isolationEnvelopePath, JSON.stringify(ISOLATION_ENVELOPE));
  return Object.freeze({
    directory,
    hostContext: Object.freeze({ baselinePath, isolationEnvelopePath, interruptAfterPhase, failAfterCheckpoint })
  });
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
    launchExternalFixture({
      fixtureRoot: copied,
      operatorInput: {},
      hostContext: {
        baselinePath,
        authoritativeReceiptJournalPath: null,
        attributionContext: null,
        toolingContext: null
      }
    }),
    /verifier_digest_mismatch/
  );
});

test("host launcher requires a closed host context", async () => {
  await assert.rejects(
    launchExternalFixture({
      fixtureRoot: root,
      operatorInput: {},
      hostContext: {
        baselinePath: "outside.json",
        authoritativeReceiptJournalPath: null,
        attributionContext: null
      }
    }),
    /host_context_not_closed/
  );
});

test("host launcher reaches composition only with an external baseline and keeps host fields out of operator input", async (context) => {
  const outside = await mkdtemp(join(tmpdir(), "shield-v03-valid-host-baseline-"));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const baselinePath = join(outside, "release-baseline.json");
  await writeFile(baselinePath, JSON.stringify(FIXTURE_RELEASE_BASELINE));
  const result = await launchExternalFixture({
    fixtureRoot: root,
    operatorInput: { releaseBaseline: FIXTURE_RELEASE_BASELINE },
    hostContext: {
      baselinePath,
      authoritativeReceiptJournalPath: null,
      attributionContext: null,
      toolingContext: null
    }
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.reason, "fixture_input_not_closed");
});

test("host launcher rejects fixture-local baselines through canonical root and parent symlinks", async (context) => {
  const copied = await withFixtureCopy(async () => {});
  const outside = await mkdtemp(join(tmpdir(), "shield-v03-symlinked-host-baseline-"));
  context.after(() => rm(copied, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const localBaseline = join(copied, "release-baseline.json");
  await writeFile(localBaseline, JSON.stringify(FIXTURE_RELEASE_BASELINE));
  const linkedRoot = join(outside, "fixture-root");
  const linkedParent = join(outside, "fixture-parent");
  await symlink(copied, linkedRoot);
  await symlink(copied, linkedParent);

  for (const candidate of [
    { fixtureRoot: linkedRoot, baselinePath: localBaseline },
    { fixtureRoot: copied, baselinePath: join(linkedParent, "release-baseline.json") }
  ]) {
    await assert.rejects(
      launchExternalFixture({
        fixtureRoot: candidate.fixtureRoot,
        operatorInput: {},
        hostContext: {
          baselinePath: candidate.baselinePath,
          authoritativeReceiptJournalPath: null,
          attributionContext: null,
          toolingContext: null
        }
      }),
      /baseline_path_not_regular/
    );
  }
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
    fixtureInput(artifact, external, revisions),
    fixtureTrustedHostContext()
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "dependency_contract_unavailable");
  assert.deepEqual(result.blockers, EXPECTED_DEPENDENCY_BLOCKERS);
});

test("exact packed artifact preflights fixture identity and then blocks on dependency contract", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-packed-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = packTeamSystem(directory);
  const external = join(directory, "external");
  const revisions = await createExternalRepository(external);
  const result = await composeMinimumFixture(
    fixtureInput(artifact, external, revisions),
    fixtureTrustedHostContext()
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "dependency_contract_unavailable");
  assert.deepEqual(result.blockers, EXPECTED_DEPENDENCY_BLOCKERS);
  assert.deepEqual(result.preflight, {
    fixtureId: "fixture:v0.3:external-acceptance:1",
    fixtureIdentityState: "valid",
    hostConfiguration: {
      adapterId: "github",
      repository: "fixture/external-v03",
      branch: "fixture/mission-1"
    },
    blindStatus: "partially-informed",
    priorSolutionsVisible: false
  });
  assert.equal(result.evidenceInventory.find(({ evidenceId }) => evidenceId === "fitz.technical-review").state, "waiting");

  const source = await readFile(join(root, "src/driver.mjs"), "utf8");
  assert.doesNotMatch(source, /packages\/shield-team-system\/dist/u);
});

test("dependency blockers preflight before package substitution and changed-path scope drift inspection", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-identity-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = join(directory, "artifact.tgz");
  await writeFile(artifact, "artifact\n");
  const external = join(directory, "external");
  const revisions = await createExternalRepository(external);
  const base = fixtureInput(artifact, external, revisions, {
    blindStatus: "blind",
    requireSimmons: false
  });
  const baseResult = await composeMinimumFixture(base, fixtureTrustedHostContext());
  assert.equal(baseResult.reason, "dependency_contract_unavailable");
  assert.deepEqual(baseResult.blockers, EXPECTED_DEPENDENCY_BLOCKERS);
  await writeFile(join(external, "README.md"), "scope drift\n");
  git(external, ["add", "README.md"]);
  git(external, ["commit", "--quiet", "-m", "scope drift"]);
  const driftResult = await composeMinimumFixture({
    ...base,
    headRevision: git(external, ["rev-parse", "HEAD"])
  }, fixtureTrustedHostContext());
  assert.equal(driftResult.reason, "dependency_contract_unavailable");
  assert.deepEqual(driftResult.blockers, EXPECTED_DEPENDENCY_BLOCKERS);
});

test("composition rejects malformed revisions and unsupported object formats", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-revisions-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = join(directory, "artifact.tgz");
  await writeFile(artifact, "artifact\n");
  const external = join(directory, "external");
  const revisions = await createExternalRepository(external);
  const input = fixtureInput(artifact, external, revisions);

  assert.equal((await composeMinimumFixture({
    ...input,
    baseRevision: revisions.baseRevision.slice(0, 4)
  }, fixtureTrustedHostContext())).reason, "external_revision_identity_malformed");

  assert.equal((await composeMinimumFixture({
    ...input,
    baseRevision: `ZZ${revisions.baseRevision.slice(2)}`
  }, fixtureTrustedHostContext())).reason, "external_revision_identity_malformed");

  assert.equal((await composeMinimumFixture({
    ...input,
    baseRevision: `${revisions.baseRevision}dead`
  }, fixtureTrustedHostContext())).reason, "external_revision_identity_malformed");

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
        unsupportedObjectFormatRepository,
        unsupportedRevisions
      ),
      fixtureTrustedHostContext()
    );
    assert.equal(badFormat.reason, "dependency_contract_unavailable");
  } finally {
    process.env.PATH = previousPath;
  }

  const sha256External = join(directory, "sha256-external");
  const sha256Revisions = await createExternalRepository(sha256External, { objectFormat: "sha256" });
  const sha256Artifact = packTeamSystem(directory);
  const sha256Result = await composeMinimumFixture(fixtureInput(
    sha256Artifact,
    sha256External,
    sha256Revisions
  ), fixtureTrustedHostContext());
  assert.equal(sha256Result.reason, "dependency_contract_unavailable");

  assert.equal((await composeMinimumFixture({
    ...fixtureInput(
      sha256Artifact,
      sha256External,
      sha256Revisions
    ),
    headRevision: `${sha256Revisions.headRevision.slice(0, 40)}`
  }, fixtureTrustedHostContext())).reason, "external_revision_identity_malformed");
});

test("dependency blocker preflight wins even when external repository and package paths are unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-preflight-first-"));
  const missingArtifact = join(directory, "missing-package.tgz");
  const missingExternal = join(directory, "missing-external");
  const result = await composeMinimumFixture({
    ...fixtureInput(
      missingArtifact,
      missingExternal,
      { baseRevision: OID40, headRevision: OID40 }
    )
  }, fixtureTrustedHostContext());
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "dependency_contract_unavailable");
  assert.deepEqual(result.blockers, EXPECTED_DEPENDENCY_BLOCKERS);
});

test("composition rejects malformed external repository identity before blocker projection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-malformed-root-"));
  const artifact = join(directory, "artifact.tgz");
  await writeFile(artifact, "artifact\n");
  const result = await composeMinimumFixture({
    ...fixtureInput(
      artifact,
      directory,
      { baseRevision: OID40, headRevision: OID40 }
    ),
    externalRepositoryRoot: null
  }, fixtureTrustedHostContext());
  assert.equal(result.state, "invalid");
  assert.equal(result.reason, "fixture_identity_malformed");
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
    external,
    revisions
  );
  assert.equal((await composeMinimumFixture(wrongVersionInput, fixtureTrustedHostContext())).reason, "dependency_contract_unavailable");

  const hashMismatchArtifact = packTeamSystem(directory);
  assert.equal((
    await composeMinimumFixture({
      ...fixtureInput(hashMismatchArtifact, external, revisions),
      packageArtifactSha256: "0".repeat(64)
    }, fixtureTrustedHostContext())
  ).reason, "fixture_input_not_closed");
});

test("trusted composition isolates offline install and public import as separate phases", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-isolated-composition-"));
  const trust = await gradingTrust();
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.after(() => rm(trust.directory, { recursive: true, force: true }));
  const artifact = packTeamSystem(directory);
  const result = await composeExternalArtifact({
    fixtureRoot: root,
    packageArtifactPath: artifact,
    baseRevision: OID40,
    headRevision: OID40,
    hostContext: {
      baselinePath: trust.hostContext.baselinePath,
      isolationEnvelopePath: trust.hostContext.isolationEnvelopePath
    }
  });
  assert.equal(result.state, "composed", JSON.stringify(result));
  assert.deepEqual(result.installedPackage, { name: "@shield/team-system", version: "0.1.0" });
  assert.deepEqual(result.phases, ["composition.install", "composition.import"]);
});

test("malicious package import cannot reach network, host writes, or child execution", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-malicious-composition-"));
  const packageDirectory = join(directory, "package");
  const marker = join(directory, "operator-marker");
  const trust = await gradingTrust();
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.after(() => rm(trust.directory, { recursive: true, force: true }));
  await mkdir(packageDirectory);
  await writeFile(join(packageDirectory, "package.json"), `${JSON.stringify({
    name: "@shield/team-system",
    version: "0.1.0",
    type: "module",
    exports: {
      "./config": "./probe.mjs",
      "./supervision": "./probe.mjs",
      "./adapter": "./probe.mjs"
    }
  })}\n`);
  await writeFile(join(packageDirectory, "probe.mjs"), [
    'import { spawnSync } from "node:child_process";',
    'import { writeFileSync } from "node:fs";',
    'import { createConnection } from "node:net";',
    "let writeDenied = false;",
    `try { writeFileSync(${JSON.stringify(marker)}, "forbidden"); } catch (error) { writeDenied = ["EPERM", "EACCES"].includes(error?.code); }`,
    'const child = spawnSync("/usr/bin/true");',
    'const childDenied = ["EPERM", "EACCES", "ENOENT"].includes(child.error?.code);',
    "const networkDenied = await new Promise((done) => {",
    '  const socket = createConnection({ host: "127.0.0.1", port: 9 });',
    "  const timer = setTimeout(() => { socket.destroy(); done(false); }, 1000);",
    '  socket.once("connect", () => { clearTimeout(timer); socket.destroy(); done(false); });',
    '  socket.once("error", (error) => { clearTimeout(timer); done(["EPERM", "EACCES"].includes(error?.code)); });',
    "});",
    'if (!writeDenied || !childDenied || !networkDenied) throw new Error("CAPABILITY_DENIAL_MISSING");',
    "export const isolated = true;",
    ""
  ].join("\n"));
  const artifact = packTeamSystem(directory, packageDirectory);
  const result = await composeExternalArtifact({
    fixtureRoot: root,
    packageArtifactPath: artifact,
    baseRevision: OID40,
    headRevision: OID40,
    hostContext: {
      baselinePath: trust.hostContext.baselinePath,
      isolationEnvelopePath: trust.hostContext.isolationEnvelopePath
    }
  });
  assert.equal(result.state, "composed", JSON.stringify(result));
  assert.equal(await lstat(marker).then(() => true, () => false), false);
});
test("baseline defect fails and fixture-only injection restores the exact passing candidate", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-defect-"));
  const trust = await gradingTrust();
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.after(() => rm(trust.directory, { recursive: true, force: true }));
  const revisions = await createExternalRepository(directory);
  const result = await gradeExternalFixture({
    fixtureRoot: root,
    operatorRepositoryRoot: directory,
    ...revisions,
    hostContext: trust.hostContext
  });
  assert.equal(result.state, "passed", JSON.stringify(result));
  assert.equal(result.injectedOutcome, "failed");
  assert.equal(result.rollbackOutcome, "passed");
  assert.equal(result.candidateSha256, result.restoredSha256);
  assert.deepEqual(result.externalRevision.changedPaths, ["src/greeting.mjs"]);
  assert.deepEqual(result.capabilityIsolation, {
    state: "verified-denied",
    adapterId: "macos-sandbox-exec",
    policyId: "deny-network-host-write-v1",
    network: "denied",
    hostWrites: "workspace-only"
  });
  assert.equal(Object.hasOwn(result, "networkEffectsPerformed"), false);
  assert.equal(
    JSON.parse(git(directory, ["show", `${revisions.baseRevision}:.shield/config.json`])).repositoryId,
    "repository:fixture:external-v03"
  );
});

test("isolation receipts reject malformed, substituted, replayed, and cross-boundary evidence", () => {
  const request = {
    schemaVersion: "shield.fixture.isolation-request.v1",
    invocationId: "1".repeat(64),
    workspaceRoot: "/private/tmp/shield-v03-supervisor-proof/workspace",
    baseRevision: OID40,
    headRevision: "2".repeat(40),
    phase: "grade.candidate",
    targetSha256: "3".repeat(64),
    targetMode: 0o644,
    testSha256: "4".repeat(64),
    testMode: 0o644,
    executableSha256: "5".repeat(64),
    workerSha256: "6".repeat(64),
    probeSha256: null,
    argv: ["--test", "test/greeting.test.mjs"],
    adapterId: "macos-sandbox-exec",
    adapterPath: "/usr/bin/sandbox-exec",
    adapterSha256: "7".repeat(64),
    adapterCdHashSha256: "8".repeat(64),
    adapterArgv: ["-p", "profile", "/private/node", "/private/worker", "/private/request"],
    policyId: "deny-network-host-write-v1",
    policyContractSha256: "9".repeat(64),
    concretePolicySha256: "a".repeat(64),
    hostEvidenceDigest: "b".repeat(64),
    executionPermitPath: "/private/tmp/shield-v03-supervisor-proof/workspace/execution.permit",
    timeoutMs: 30_000,
    maxOutputBytes: 262_144
  };
  const receipt = {
    ...request,
    schemaVersion: "shield.fixture.isolation-receipt.v1",
    outcome: "passed",
    outputSha256: "c".repeat(64)
  };
  const terminal = { receipt };
  assert.equal(validateIsolationReceipt(terminal, request), true);

  const substitutions = [
    { ...receipt, invocationId: "d".repeat(64) },
    { ...receipt, phase: "grade.injected" },
    { ...receipt, workspaceRoot: `${request.workspaceRoot}-other` },
    { ...receipt, headRevision: "e".repeat(40) },
    { ...receipt, executableSha256: "f".repeat(64) },
    { ...receipt, adapterArgv: [...receipt.adapterArgv, "extra"] }
  ];
  for (const substituted of substitutions) {
    assert.equal(validateIsolationReceipt({ receipt: substituted }, request), false);
  }

  const missing = { ...receipt };
  delete missing.hostEvidenceDigest;
  assert.equal(validateIsolationReceipt({ receipt: missing }, request), false);
  assert.equal(validateIsolationReceipt({ receipt: { ...receipt, unknown: true } }, request), false);
  assert.equal(validateIsolationReceipt({ receipt, unknown: true }, request), false);
  assert.equal(validateIsolationReceipt({ receipt: { ...receipt, outcome: "uncertain" } }, request), false);
  assert.equal(validateIsolationReceipt({ receipt: { ...receipt, outputSha256: "invalid" } }, request), false);
});

test("malicious candidate network, operator-write, and child-process probes are denied", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-malicious-candidate-"));
  const trust = await gradingTrust();
  const marker = join(directory, "operator-marker");
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.after(() => rm(trust.directory, { recursive: true, force: true }));
  const revisions = await createExternalRepository(directory);
  await writeFile(join(directory, "src/greeting.mjs"), [
    'import { spawnSync } from "node:child_process";',
    'import { writeFileSync } from "node:fs";',
    'import { createConnection } from "node:net";',
    "",
    "let writeDenied = false;",
    `try { writeFileSync(${JSON.stringify(marker)}, "forbidden"); } catch (error) { writeDenied = error?.code === "EPERM" || error?.code === "EACCES"; }`,
    'const child = spawnSync("/usr/bin/true");',
    'const childDenied = ["EPERM", "EACCES", "ENOENT"].includes(child.error?.code);',
    "const networkDenied = await new Promise((done) => {",
    '  const socket = createConnection({ host: "127.0.0.1", port: 9 });',
    "  const timer = setTimeout(() => { socket.destroy(); done(false); }, 1000);",
    "  socket.once(\"connect\", () => { clearTimeout(timer); socket.destroy(); done(false); });",
    '  socket.once("error", (error) => { clearTimeout(timer); done(error?.code === "EPERM" || error?.code === "EACCES"); });',
    "});",
    'if (!writeDenied || !childDenied || !networkDenied) throw new Error("CAPABILITY_DENIAL_MISSING");',
    "",
    "export function greeting(name) {",
    "  return `Hello, ${name.trim()}!`;",
    "}",
    ""
  ].join("\n"));
  git(directory, ["add", "src/greeting.mjs"]);
  git(directory, ["commit", "--quiet", "-m", "add malicious capability probes"]);
  const result = await gradeExternalFixture({
    fixtureRoot: root,
    operatorRepositoryRoot: directory,
    baseRevision: revisions.baseRevision,
    headRevision: git(directory, ["rev-parse", "HEAD"]),
    hostContext: trust.hostContext
  });
  assert.equal(result.state, "passed", JSON.stringify(result));
  assert.equal(await lstat(marker).then(() => true, () => false), false);
  assert.equal(result.capabilityIsolation.network, "denied");
  assert.equal(result.capabilityIsolation.hostWrites, "workspace-only");
});

test("real worker interruption at every grading phase preserves the exact operator checkout", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-interruption-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const revisions = await createExternalRepository(directory);
  const snapshot = async () => {
    const target = join(directory, "src/greeting.mjs");
    const fixtureTest = join(directory, "test/greeting.test.mjs");
    const targetInfo = await lstat(target);
    const testInfo = await lstat(fixtureTest);
    return {
      head: git(directory, ["rev-parse", "HEAD"]),
      status: execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: directory }),
      target: await readFile(target),
      targetMode: targetInfo.mode & 0o777,
      fixtureTest: await readFile(fixtureTest),
      testMode: testInfo.mode & 0o777
    };
  };
  const before = await snapshot();
  const temporaryRootsBefore = (await readdir(tmpdir())).filter((name) => name.startsWith("shield-v03-supervisor-")).sort();
  for (const phase of ["grade.candidate", "grade.injected", "grade.restored"]) {
    const trust = await gradingTrust(phase);
    try {
      const result = await gradeExternalFixture({
        fixtureRoot: root,
        operatorRepositoryRoot: directory,
        ...revisions,
        hostContext: trust.hostContext
      });
      assert.equal(result.state, "blocked");
      assert.equal(result.reason, "worker_interrupted");
      assert.equal(result.phase, phase);
      assert.equal(result.reaped, true);
      const after = await snapshot();
      assert.equal(after.head, before.head);
      assert.ok(after.status.equals(before.status));
      assert.ok(after.target.equals(before.target));
      assert.equal(after.targetMode, before.targetMode);
      assert.ok(after.fixtureTest.equals(before.fixtureTest));
      assert.equal(after.testMode, before.testMode);
      assert.deepEqual(
        (await readdir(tmpdir())).filter((name) => name.startsWith("shield-v03-supervisor-")).sort(),
        temporaryRootsBefore
      );
    } finally {
      await rm(trust.directory, { recursive: true, force: true });
    }
  }
  for (const checkpoint of [
    "workspace.prepared", "candidate.passed", "defect.injected", "injected.failed",
    "candidate.restored", "restored.passed", "workspace.removed", "operator.reverified"
  ]) {
    const trust = await gradingTrust(null, checkpoint);
    try {
      const result = await gradeExternalFixture({
        fixtureRoot: root,
        operatorRepositoryRoot: directory,
        ...revisions,
        hostContext: trust.hostContext
      });
      assert.deepEqual(result, { state: "blocked", reason: "host_checkpoint_interrupted", checkpoint });
      const after = await snapshot();
      assert.equal(after.head, before.head);
      assert.ok(after.status.equals(before.status));
      assert.ok(after.target.equals(before.target));
      assert.equal(after.targetMode, before.targetMode);
      assert.ok(after.fixtureTest.equals(before.fixtureTest));
      assert.equal(after.testMode, before.testMode);
      assert.deepEqual(
        (await readdir(tmpdir())).filter((name) => name.startsWith("shield-v03-supervisor-")).sort(),
        temporaryRootsBefore
      );
    } finally {
      await rm(trust.directory, { recursive: true, force: true });
    }
  }
});

test("direct grading refuses execution without the trusted supervisor", async () => {
  assert.deepEqual(await gradeCandidateWithFailureInjection({}), {
    state: "blocked",
    reason: "trusted_isolation_supervisor_required"
  });
});

test("isolation envelope is external, content-addressed, and substitution fails closed", async (context) => {
  const trust = await gradingTrust();
  context.after(() => rm(trust.directory, { recursive: true, force: true }));
  assert.deepEqual(await loadTrustedIsolationEnvelope({
    envelopePath: trust.hostContext.isolationEnvelopePath,
    fixtureRoot: root
  }), ISOLATION_ENVELOPE);
  await writeFile(trust.hostContext.isolationEnvelopePath, JSON.stringify({
    ...ISOLATION_ENVELOPE,
    worker: { ...ISOLATION_ENVELOPE.worker, sha256: "0".repeat(64) }
  }));
  await assert.rejects(loadTrustedIsolationEnvelope({
    envelopePath: trust.hostContext.isolationEnvelopePath,
    fixtureRoot: root
  }), /isolation_envelope_digest_mismatch/);
});

test("frozen adoption base rejects arbitrary source and exact-test substitution", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-frozen-base-"));
  const trust = await gradingTrust();
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.after(() => rm(trust.directory, { recursive: true, force: true }));
  const substitutedSource = join(directory, "source");
  const sourceRevisions = await createExternalRepository(substitutedSource, {
    baseGreetingSource: "export const greeting = () => 'substituted';\n"
  });
  assert.equal((await gradeExternalFixture({
    fixtureRoot: root,
    operatorRepositoryRoot: substitutedSource,
    ...sourceRevisions,
    hostContext: trust.hostContext
  })).reason, "frozen_base_content_mismatch:src/greeting.mjs");

  const substitutedTest = join(directory, "test");
  const testRevisions = await createExternalRepository(substitutedTest, {
    baseTestSource: [
      'import test from "node:test";',
      'test("substituted", () => {});',
      ""
    ].join("\n")
  });
  assert.equal((await gradeExternalFixture({
    fixtureRoot: root,
    operatorRepositoryRoot: substitutedTest,
    ...testRevisions,
    hostContext: trust.hostContext
  })).reason, "frozen_base_content_mismatch:test/greeting.test.mjs");
});

test("unexpected untracked files block while ignored files do not expand exact test selection", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-untracked-"));
  const trust = await gradingTrust();
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.after(() => rm(trust.directory, { recursive: true, force: true }));
  const revisions = await createExternalRepository(directory);
  await writeFile(join(directory, "test/untracked.test.mjs"), "throw new Error('untracked');\n");
  assert.equal((await gradeExternalFixture({
    fixtureRoot: root,
    operatorRepositoryRoot: directory,
    ...revisions,
    hostContext: trust.hostContext
  })).reason, "operator_revision_not_exact");
  await rm(join(directory, "test/untracked.test.mjs"));
  await writeFile(join(directory, "notes.txt"), "unexpected untracked file\n");
  assert.equal((await gradeExternalFixture({
    fixtureRoot: root,
    operatorRepositoryRoot: directory,
    ...revisions,
    hostContext: trust.hostContext
  })).reason, "operator_revision_not_exact");
  await rm(join(directory, "notes.txt"));

  await writeFile(join(directory, "test/extra.test.mjs"), "throw new Error('must not execute');\n");
  const result = await gradeExternalFixture({
    fixtureRoot: root,
    operatorRepositoryRoot: directory,
    ...revisions,
    hostContext: trust.hostContext
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
    external,
    revisions,
    { blindStatus: "blind", priorSolutionsVisible: true }
  ), fixtureTrustedHostContext());
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
  const trust = await gradingTrust();
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  context.after(() => rm(trust.directory, { recursive: true, force: true }));
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
  const result = await gradeExternalFixture({
    fixtureRoot: root,
    operatorRepositoryRoot: directory,
    ...symlinkRevisions,
    hostContext: trust.hostContext
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "operator_snapshot_unavailable");
  assert.equal(await readFile(outsideTarget, "utf8"), "outside bytes\n");
});

test("disposable failure injection never exposes defect bytes in the operator checkout", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-race-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-v03-race-outside-"));
  const trust = await gradingTrust();
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  context.after(() => rm(trust.directory, { recursive: true, force: true }));
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
  const result = await gradeExternalFixture({
    fixtureRoot: root,
    operatorRepositoryRoot: directory,
    ...revisions,
    hostContext: trust.hostContext
  });
  watching = false;
  await watcher;
  assert.equal(result.state, "passed", JSON.stringify(result));
  assert.equal(await readFile(join(directory, "src/greeting.mjs"), "utf8"), [
    "export function greeting(name) {",
    "  return `Hello, ${name.trim()}!`;",
    "}",
    ""
  ].join("\n"));
  assert.equal(await readFile(outsideTarget, "utf8"), "outside bytes\n");
});
