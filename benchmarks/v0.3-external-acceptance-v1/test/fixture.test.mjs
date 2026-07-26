import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createEvidenceInventory, gradeEvidenceInventory } from "../evidence-inventory.mjs";
import { FIXTURE_MANIFEST, validateFixtureManifest } from "../fixture-manifest.mjs";
import {
  composeMinimumFixture,
  gradeCandidateWithFailureInjection
} from "../src/driver.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(root, "../../packages/shield-team-system");
const template = join(root, "template");
const clone = (value) => structuredClone(value);
const digest = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

function packTeamSystem(destination) {
  const output = JSON.parse(execFileSync("npm", [
    "pack",
    packageRoot,
    "--json",
    "--pack-destination",
    destination,
    "--cache",
    join(destination, ".npm-cache")
  ], { encoding: "utf8" }));
  return join(destination, output[0].filename);
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function createExternalRepository(directory, { testSource } = {}) {
  await cp(template, directory, { recursive: true });
  if (testSource) await writeFile(join(directory, "test/greeting.test.mjs"), testSource);
  git(directory, ["init", "--quiet"]);
  git(directory, ["config", "user.name", "SHIELD fixture"]);
  git(directory, ["config", "user.email", "fixture@shield.invalid"]);
  git(directory, ["add", "."]);
  git(directory, ["commit", "--quiet", "-m", "fixture base"]);
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

const fixtureInput = (artifact, artifactDigest, directory, revisions, overrides = {}) => ({
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
  ...overrides
});

test("fixture manifest is closed, frozen, versioned, and separates the later campaign", () => {
  assert.equal(validateFixtureManifest(FIXTURE_MANIFEST).state, "valid");
  assert.equal(Object.isFrozen(FIXTURE_MANIFEST), true);
  assert.equal(Object.isFrozen(FIXTURE_MANIFEST.dependencyBlockers), true);
  assert.equal(FIXTURE_MANIFEST.ownerIssue, "#12");
  assert.equal(FIXTURE_MANIFEST.excludedCampaign.issue, "#14");

  const extra = clone(FIXTURE_MANIFEST);
  extra.unexpected = true;
  assert.equal(validateFixtureManifest(extra).reason, "fixture_manifest_not_closed");
  const drifted = clone(FIXTURE_MANIFEST);
  drifted.ownerIssue = "#14";
  assert.equal(validateFixtureManifest(drifted).reason, "fixture_manifest_drift");
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
  assert.equal(result.reason, "package_artifact_install_failed");
});

test("exact packed artifact composes through installed public specifiers and then blocks", async (context) => {
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
  assert.deepEqual(result.identity.installedPackage.publicSpecifiers, [
    "@shield/team-system/config",
    "@shield/team-system/supervision",
    "@shield/team-system/adapter"
  ]);
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

test("composition rejects caller paths, unavailable revisions, and a non-current head", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-revisions-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = join(directory, "artifact.tgz");
  await writeFile(artifact, "artifact\n");
  const external = join(directory, "external");
  const revisions = await createExternalRepository(external);
  const input = fixtureInput(artifact, await digest(artifact), external, revisions);

  assert.equal((await composeMinimumFixture({
    ...input,
    changedPaths: ["src/greeting.mjs"]
  })).reason, "fixture_input_not_closed");
  assert.equal((await composeMinimumFixture({
    ...input,
    baseRevision: "0".repeat(40)
  })).reason, "base_revision_unavailable");
  assert.equal((await composeMinimumFixture({
    ...input,
    headRevision: revisions.baseRevision
  })).reason, "head_revision_not_current");
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
  assert.equal(result.networkEffectsPerformed, false);
});

test("evidence inventory names human gates without manufacturing their evidence", () => {
  const inventory = createEvidenceInventory({ requireSimmons: true });
  assert.deepEqual(
    inventory.filter(({ evidenceId }) => [
      "external.head.revision",
      "model.runtime.executor.identity",
      "clocks.timing",
      "usage.observability",
      "host.manual-fallback"
    ].includes(evidenceId)).map(({ evidenceId, authority }) => [evidenceId, authority]),
    [
      ["external.head.revision", "measured"],
      ["model.runtime.executor.identity", "operator-recorded"],
      ["clocks.timing", "measured"],
      ["usage.observability", "operator-recorded"],
      ["host.manual-fallback", "operator-recorded"]
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

  const fabricated = inventory.map((entry) => ({
    ...entry,
    state: "recorded",
    evidenceRef: `unverified:${entry.evidenceId}`
  }));
  const fabricatedGrade = gradeEvidenceInventory(fabricated, { requireSimmons: true });
  assert.equal(fabricatedGrade.state, "blocked");
  assert.ok(fabricatedGrade.reasons.includes(
    "human_evidence_requires_kernel_validation:fitz.technical-review"
  ));
});

test("evidence inventory rejects omissions, extras, malformed states, and wrong Simmons cardinality", () => {
  const inventory = createEvidenceInventory({ requireSimmons: false });
  assert.ok(gradeEvidenceInventory(inventory.slice(1)).reasons.includes("evidence_inventory_not_closed"));
  assert.ok(gradeEvidenceInventory(
    inventory.filter(({ evidenceId }) => evidenceId !== "external.head.revision")
  ).reasons.includes("evidence_inventory_not_closed"));
  assert.ok(gradeEvidenceInventory([
    { ...inventory[0], unexpected: true },
    ...inventory.slice(1)
  ]).reasons.includes("evidence_inventory_malformed:package.artifact.digest"));
  assert.ok(gradeEvidenceInventory([
    { ...inventory[0], state: "approved" },
    ...inventory.slice(1)
  ]).reasons.includes("evidence_inventory_malformed:package.artifact.digest"));
  assert.ok(gradeEvidenceInventory(
    createEvidenceInventory({ requireSimmons: true }),
    { requireSimmons: false }
  ).reasons.includes("evidence_inventory_not_closed"));
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
  const result = await gradeCandidateWithFailureInjection({
    fixtureRoot: directory,
    baseRevision: revisions.baseRevision,
    headRevision: git(directory, ["rev-parse", "HEAD"])
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
  const testSource = [
    'import assert from "node:assert/strict";',
    'import { rm, symlink } from "node:fs/promises";',
    'import test from "node:test";',
    'import { greeting } from "../src/greeting.mjs";',
    `const outside = ${JSON.stringify(outsideTarget)};`,
    'const candidate = new URL("../src/greeting.mjs", import.meta.url);',
    'test("normalizes whitespace", async () => {',
    '  const actual = greeting("  Agent  ");',
    '  if (actual !== "Hello, Agent!") {',
    "    await rm(candidate);",
    "    await symlink(outside, candidate);",
    "  }",
    '  assert.equal(actual, "Hello, Agent!");',
    "});",
    ""
  ].join("\n");
  const revisions = await createExternalRepository(directory, { testSource });
  const result = await gradeCandidateWithFailureInjection({
    fixtureRoot: directory,
    ...revisions
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "fixture_target_changed_before_rollback");
  assert.equal(await readFile(outsideTarget, "utf8"), "outside bytes\n");
});
