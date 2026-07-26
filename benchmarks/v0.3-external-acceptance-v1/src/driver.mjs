import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createEvidenceInventory } from "../evidence-inventory.mjs";
import { FIXTURE_MANIFEST, validateFixtureManifest } from "../fixture-manifest.mjs";

const execFileAsync = promisify(execFile);
const benchmarkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = resolve(benchmarkRoot, "template");
const templateDefectPath = resolve(templateRoot, "src/greeting.mjs");
const REVISION = /^[0-9a-f]{40,64}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
const PUBLIC_SPECIFIERS = Object.freeze([
  "@shield/team-system/config",
  "@shield/team-system/supervision",
  "@shield/team-system/adapter"
]);
const INPUT_FIELDS = [
  "packageArtifactPath",
  "packageArtifactSha256",
  "externalRepositoryRoot",
  "baseRevision",
  "headRevision",
  "hostConfiguration",
  "blindStatus",
  "priorSolutionsVisible",
  "requireSimmons"
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const plain = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, fields) => plain(value) &&
  Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
const CONSUMER_SOURCE = [
  'import { readFile } from "node:fs/promises";',
  'import { createShieldConfig, validateShieldConfig } from "@shield/team-system/config";',
  'import { createSupervisedMissionBrief, validateSupervisedMissionBrief } from "@shield/team-system/supervision";',
  'import { validateAdapterCandidate } from "@shield/team-system/adapter";',
  "",
  'const input = JSON.parse(await readFile(process.argv[2], "utf8"));',
  "const config = createShieldConfig({",
  "  repositoryId: input.repository,",
  '  coulsonBindingRef: "fixture:human:coulson",',
  '  fitzBindingRef: "fixture:human:fitz",',
  '  ...(input.requireSimmons ? { simmonsBindingRef: "fixture:human:simmons" } : {})',
  "});",
  "const brief = createSupervisedMissionBrief({",
  "  schemaVersion: 1,",
  '  missionId: "mission:v0.3:external-acceptance:1",',
  '  objective: "Repair the one bounded greeting normalization defect.",',
  '  subjectId: "fixture:v0.3:external-acceptance:1",',
  "  riskFlags: {",
  "    production: false, destructive: false, migration: false,",
  "    credentialsOrSecurity: false, externalCommunication: false,",
  "    merge: false, deploy: false, release: false, hillHighRisk: false",
  "  },",
  "  participants: [",
  '    { seatId: "coulson" }, { seatId: "hill" }, { seatId: "fury" },',
  '    { seatId: "may" }, { seatId: "fitz" },',
  '    ...(input.requireSimmons ? [{ seatId: "simmons" }] : [])',
  "  ],",
  "  activatedModes: [{",
  '    modeId: "delivery", modeVersion: "1.0.0", seatId: "may",',
  '    activationSource: "fixture-manifest"',
  "  }],",
  "  requireSimmons: input.requireSimmons,",
  '  createdAt: { value: "2026-07-26T00:00:00Z", provenance: "hostTrusted" }',
  "});",
  "const hostFailureCandidate = validateAdapterCandidate({",
  "  adapterContractVersion: 1,",
  '  adapterId: "github",',
  '  candidateId: "candidate:v0.3:host-failure:1",',
  '  candidateKind: "communication_result",',
  "  missionId: brief.missionId,",
  "  subjectId: brief.subjectId,",
  "  revisionId: input.baseRevision,",
  "  humanPrincipalId: null,",
  "  bindingId: null,",
  '  sourceRef: "fixture:host-failure:non-authoritative-candidate",',
  '  capturedAt: { value: "2026-07-26T00:00:01Z", provenance: "hostTrusted" },',
  "  payload: {",
  '    requestId: "request:v0.3:host-failure:1", outcome: "failed",',
  '    failureReason: "adapter_unavailable", receiptRef: null',
  "  }",
  "});",
  "const configCheck = validateShieldConfig(config);",
  "const briefCheck = validateSupervisedMissionBrief(brief);",
  'if (configCheck.state !== "valid" || briefCheck.state !== "valid" || hostFailureCandidate.state !== "valid") {',
  '  throw new Error("PUBLIC_SURFACE_COMPOSITION_FAILED");',
  "}",
  "process.stdout.write(JSON.stringify({",
  "  configSchemaVersion: config.schemaVersion,",
  "  missionRevisionId: brief.revisionId,",
  '  hostFailureCandidateState: "valid",',
  "  hostEffectsPerformed: false,",
  '  expectedFitzState: "waiting",',
  '  expectedSimmonsState: input.requireSimmons ? "waiting" : "not-required"',
  "}));",
  ""
].join("\n");

async function regularFile(path) {
  try {
    const info = await lstat(path);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

async function gitOutcome(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 256 * 1024
    });
    return Object.freeze({ state: "passed", stdout });
  } catch {
    return Object.freeze({ state: "failed", stdout: "" });
  }
}

async function inspectExternalRevision({ externalRepositoryRoot, baseRevision, headRevision }) {
  if (typeof externalRepositoryRoot !== "string" ||
      !REVISION.test(baseRevision) || !REVISION.test(headRevision)) {
    return Object.freeze({ state: "invalid", reason: "external_revision_identity_malformed" });
  }
  const requestedRoot = resolve(externalRepositoryRoot);
  let repositoryRoot;
  try {
    const rootInfo = await lstat(requestedRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("unsafe_root");
    repositoryRoot = await realpath(requestedRoot);
  } catch {
    return Object.freeze({ state: "blocked", reason: "external_repository_unavailable" });
  }
  const topLevel = await gitOutcome(repositoryRoot, ["rev-parse", "--show-toplevel"]);
  if (topLevel.state !== "passed" || resolve(topLevel.stdout.trim()) !== repositoryRoot) {
    return Object.freeze({ state: "blocked", reason: "external_repository_identity_mismatch" });
  }
  if ((await gitOutcome(repositoryRoot, ["cat-file", "-e", `${baseRevision}^{commit}`])).state !== "passed") {
    return Object.freeze({ state: "blocked", reason: "base_revision_unavailable" });
  }
  if ((await gitOutcome(repositoryRoot, ["cat-file", "-e", `${headRevision}^{commit}`])).state !== "passed") {
    return Object.freeze({ state: "blocked", reason: "head_revision_unavailable" });
  }
  const currentHead = await gitOutcome(repositoryRoot, ["rev-parse", "HEAD"]);
  if (currentHead.state !== "passed" || currentHead.stdout.trim() !== headRevision) {
    return Object.freeze({ state: "blocked", reason: "head_revision_not_current" });
  }
  if ((await gitOutcome(repositoryRoot, [
    "merge-base", "--is-ancestor", baseRevision, headRevision
  ])).state !== "passed") {
    return Object.freeze({ state: "blocked", reason: "base_revision_not_ancestor" });
  }
  const trackedStatus = await gitOutcome(repositoryRoot, [
    "status", "--porcelain", "--untracked-files=no"
  ]);
  if (trackedStatus.state !== "passed" || trackedStatus.stdout.length !== 0) {
    return Object.freeze({ state: "blocked", reason: "external_revision_not_clean" });
  }
  const changed = await gitOutcome(repositoryRoot, [
    "diff", "--name-only", "-z", "--diff-filter=ACDMRTUXB", baseRevision, headRevision, "--"
  ]);
  if (changed.state !== "passed") {
    return Object.freeze({ state: "blocked", reason: "external_revision_diff_unavailable" });
  }
  const changedPaths = changed.stdout.length === 0
    ? []
    : changed.stdout.split("\0").filter((path) => path.length > 0).sort();
  if (JSON.stringify(changedPaths) !==
      JSON.stringify(FIXTURE_MANIFEST.template.allowedMissionChangePaths)) {
    return Object.freeze({ state: "blocked", reason: "scope_drift" });
  }
  return Object.freeze({
    state: "measured",
    repositoryRoot,
    baseRevision,
    headRevision,
    changedPaths: Object.freeze(changedPaths)
  });
}

async function openConfinedRegularFile(root, targetPath, flags) {
  const expectedTarget = resolve(root, "src/greeting.mjs");
  if (targetPath !== expectedTarget || !Number.isInteger(constants.O_NOFOLLOW)) {
    throw new Error("unsafe_target");
  }
  const before = await lstat(targetPath);
  if (!before.isFile() || before.isSymbolicLink() ||
      await realpath(targetPath) !== expectedTarget) {
    throw new Error("unsafe_target");
  }
  const handle = await open(targetPath, flags | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    const after = await lstat(targetPath);
    if (!opened.isFile() || !after.isFile() || after.isSymbolicLink() ||
        opened.dev !== before.dev || opened.ino !== before.ino ||
        after.dev !== opened.dev || after.ino !== opened.ino ||
        await realpath(targetPath) !== expectedTarget) {
      throw new Error("target_changed");
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function readConfinedRegularFile(root, targetPath) {
  const handle = await openConfinedRegularFile(root, targetPath, constants.O_RDONLY);
  try {
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function replaceConfinedRegularFile(root, targetPath, bytes) {
  const handle = await openConfinedRegularFile(root, targetPath, constants.O_WRONLY);
  try {
    await handle.truncate(0);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function composeInstalledArtifact(artifactBytes, input) {
  const consumerRoot = await mkdtemp(join(tmpdir(), "shield-v03-public-consumer-"));
  const installedArtifact = join(consumerRoot, "shield-team-system.tgz");
  try {
    await writeFile(join(consumerRoot, "package.json"), '{"private":true,"type":"module"}\n');
    await writeFile(installedArtifact, artifactBytes);
    await execFileAsync("git", ["init", "--quiet"], {
      cwd: consumerRoot,
      timeout: 10_000,
      maxBuffer: 64 * 1024
    });
    try {
      await execFileAsync("npm", [
        "install",
        "--save-dev",
        "--save-exact",
        installedArtifact,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--offline",
        "--cache",
        join(consumerRoot, ".npm-cache")
      ], {
        cwd: consumerRoot,
        timeout: 60_000,
        maxBuffer: 256 * 1024
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
    if (!plain(installedManifest) || installedManifest.name !== "@shield/team-system" ||
        typeof installedManifest.version !== "string" || installedManifest.version.length === 0) {
      return Object.freeze({ state: "blocked", reason: "installed_package_identity_mismatch" });
    }
    const consumerInputPath = join(consumerRoot, "composition-input.json");
    const consumerPath = join(consumerRoot, "consumer.mjs");
    await writeFile(consumerInputPath, `${JSON.stringify({
      repository: input.hostConfiguration.repository,
      baseRevision: input.headRevision,
      requireSimmons: input.requireSimmons
    })}\n`);
    await writeFile(consumerPath, CONSUMER_SOURCE);
    let stdout;
    try {
      ({ stdout } = await execFileAsync(process.execPath, [consumerPath, consumerInputPath], {
        cwd: consumerRoot,
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 64 * 1024
      }));
    } catch {
      return Object.freeze({ state: "blocked", reason: "public_surface_composition_failed" });
    }
    let foundation;
    try {
      foundation = JSON.parse(stdout);
    } catch {
      return Object.freeze({ state: "blocked", reason: "public_surface_composition_failed" });
    }
    if (!exact(foundation, [
      "configSchemaVersion",
      "missionRevisionId",
      "hostFailureCandidateState",
      "hostEffectsPerformed",
      "expectedFitzState",
      "expectedSimmonsState"
    ]) ||
        foundation.configSchemaVersion !== 1 ||
        typeof foundation.missionRevisionId !== "string" ||
        foundation.hostFailureCandidateState !== "valid" ||
        foundation.hostEffectsPerformed !== false ||
        foundation.expectedFitzState !== "waiting" ||
        foundation.expectedSimmonsState !== (input.requireSimmons ? "waiting" : "not-required")) {
      return Object.freeze({ state: "blocked", reason: "public_surface_composition_failed" });
    }
    return Object.freeze({
      state: "composed",
      installedPackage: Object.freeze({
        name: installedManifest.name,
        version: installedManifest.version,
        publicSpecifiers: PUBLIC_SPECIFIERS
      }),
      foundation: Object.freeze(foundation)
    });
  } finally {
    await rm(consumerRoot, { recursive: true, force: true });
  }
}

async function commandOutcome(cwd) {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  try {
    await execFileAsync(process.execPath, ["--test"], {
      cwd,
      encoding: "utf8",
      env: environment,
      timeout: 30_000,
      maxBuffer: 256 * 1024
    });
    return "passed";
  } catch (error) {
    if (error?.killed || error?.signal) return "unavailable";
    return Number.isInteger(error?.code) ? "failed" : "unavailable";
  }
}

function blockers() {
  return Object.freeze(FIXTURE_MANIFEST.dependencyBlockers.map((entry) => Object.freeze({
    issue: entry.issue,
    code: entry.code,
    requiredState: entry.requiredState
  })));
}

export async function composeMinimumFixture(input) {
  const manifest = validateFixtureManifest(FIXTURE_MANIFEST);
  if (manifest.state !== "valid") return manifest;
  if (!exact(input, INPUT_FIELDS)) {
    return Object.freeze({ state: "invalid", reason: "fixture_input_not_closed" });
  }
  if (typeof input.packageArtifactPath !== "string" || !SHA256.test(input.packageArtifactSha256) ||
      !REVISION.test(input.baseRevision) || !REVISION.test(input.headRevision) ||
      typeof input.priorSolutionsVisible !== "boolean" ||
      typeof input.requireSimmons !== "boolean" ||
      !FIXTURE_MANIFEST.blindStatus.allowedValues.includes(input.blindStatus)) {
    return Object.freeze({ state: "invalid", reason: "fixture_identity_malformed" });
  }
  if (!exact(input.hostConfiguration, ["adapterId", "repository", "branch"]) ||
      input.hostConfiguration.adapterId !== "github" ||
      !REPOSITORY.test(input.hostConfiguration.repository) ||
      typeof input.hostConfiguration.branch !== "string" ||
      input.hostConfiguration.branch.length === 0) {
    return Object.freeze({ state: "invalid", reason: "host_configuration_malformed" });
  }
  const externalRevision = await inspectExternalRevision(input);
  if (externalRevision.state !== "measured") return externalRevision;
  if (!await regularFile(input.packageArtifactPath)) {
    return Object.freeze({ state: "blocked", reason: "package_artifact_unavailable" });
  }
  const artifactInfo = await lstat(input.packageArtifactPath);
  if (artifactInfo.size <= 0 || artifactInfo.size > MAX_PACKAGE_BYTES) {
    return Object.freeze({ state: "blocked", reason: "package_artifact_size_invalid" });
  }
  const artifactBytes = await readFile(input.packageArtifactPath);
  const packageDigest = sha256(artifactBytes);
  if (packageDigest !== input.packageArtifactSha256) {
    return Object.freeze({ state: "blocked", reason: "package_artifact_digest_mismatch" });
  }
  const composition = await composeInstalledArtifact(artifactBytes, input);
  if (composition.state !== "composed") return composition;

  return Object.freeze({
    state: "blocked",
    reason: "dependency_contract_unavailable",
    blockers: blockers(),
    identity: Object.freeze({
      fixtureId: FIXTURE_MANIFEST.fixtureId,
      packageArtifactSha256: packageDigest,
      installedPackage: composition.installedPackage,
      externalRevision: Object.freeze({
        baseRevision: externalRevision.baseRevision,
        headRevision: externalRevision.headRevision,
        changedPaths: externalRevision.changedPaths
      }),
      hostConfiguration: Object.freeze({ ...input.hostConfiguration }),
      blindStatus: input.blindStatus,
      priorSolutionsVisible: input.priorSolutionsVisible
    }),
    foundation: composition.foundation,
    evidenceInventory: createEvidenceInventory({ requireSimmons: input.requireSimmons })
  });
}

export async function gradeCandidateWithFailureInjection(input) {
  if (!exact(input, ["fixtureRoot", "baseRevision", "headRevision"]) ||
      typeof input.fixtureRoot !== "string") {
    return Object.freeze({ state: "invalid", reason: "fixture_grading_input_not_closed" });
  }
  const externalRevision = await inspectExternalRevision({
    externalRepositoryRoot: input.fixtureRoot,
    baseRevision: input.baseRevision,
    headRevision: input.headRevision
  });
  if (externalRevision.state !== "measured") return externalRevision;
  const requestedRoot = resolve(input.fixtureRoot);
  let root;
  let target;
  try {
    const rootInfo = await lstat(requestedRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("unsafe_root");
    root = await realpath(requestedRoot);
    target = await realpath(resolve(root, "src/greeting.mjs"));
  } catch {
    return Object.freeze({ state: "blocked", reason: "fixture_target_unavailable" });
  }
  if (target !== resolve(root, "src/greeting.mjs") || !await regularFile(target)) {
    return Object.freeze({ state: "blocked", reason: "fixture_target_unavailable" });
  }
  const defectBytes = await readFile(templateDefectPath);
  let candidateBytes;
  try {
    candidateBytes = await readConfinedRegularFile(root, target);
  } catch {
    return Object.freeze({ state: "blocked", reason: "fixture_target_unavailable" });
  }
  const candidateSha256 = sha256(candidateBytes);
  if (candidateBytes.equals(defectBytes)) {
    return Object.freeze({ state: "blocked", reason: "candidate_still_contains_frozen_defect" });
  }
  if (await commandOutcome(root) !== "passed") {
    return Object.freeze({ state: "blocked", reason: "candidate_test_not_passed" });
  }

  let injectedOutcome = "unavailable";
  let rollbackOutcome = "unavailable";
  let injectionError = false;
  let rollbackError = false;
  try {
    await replaceConfinedRegularFile(root, target, defectBytes);
    injectedOutcome = await commandOutcome(root);
  } catch {
    injectionError = true;
  } finally {
    try {
      await replaceConfinedRegularFile(root, target, candidateBytes);
      rollbackOutcome = await commandOutcome(root);
    } catch {
      rollbackError = true;
    }
  }
  if (rollbackError) {
    return Object.freeze({ state: "blocked", reason: "fixture_target_changed_before_rollback" });
  }
  if (injectionError) {
    return Object.freeze({ state: "blocked", reason: "fixture_target_changed_before_injection" });
  }
  let restoredBytes;
  try {
    restoredBytes = await readConfinedRegularFile(root, target);
  } catch {
    return Object.freeze({ state: "blocked", reason: "fixture_target_unavailable" });
  }
  const restoredSha256 = sha256(restoredBytes);
  if (injectedOutcome !== "failed") {
    return Object.freeze({ state: "blocked", reason: "failure_injection_not_observed" });
  }
  if (rollbackOutcome !== "passed" || restoredSha256 !== candidateSha256) {
    return Object.freeze({ state: "blocked", reason: "rollback_mismatch" });
  }
  return Object.freeze({
    state: "passed",
    authority: "fixture-only-non-authoritative",
    externalRevision: Object.freeze({
      baseRevision: externalRevision.baseRevision,
      headRevision: externalRevision.headRevision,
      changedPaths: externalRevision.changedPaths
    }),
    candidateSha256,
    injectedDefectSha256: sha256(defectBytes),
    injectedOutcome,
    rollbackOutcome,
    restoredSha256,
    networkEffectsPerformed: false
  });
}
