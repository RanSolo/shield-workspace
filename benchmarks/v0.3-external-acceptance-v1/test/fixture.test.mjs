import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  const result = await composeMinimumFixture({
    packageArtifactPath: artifact,
    packageArtifactSha256: await digest(artifact),
    baseRevision: "0123456789012345678901234567890123456789",
    hostConfiguration: {
      adapterId: "github",
      repository: "fixture/external-v03",
      branch: "fixture/mission-1"
    },
    blindStatus: "partially-informed",
    priorSolutionsVisible: false,
    requireSimmons: true,
    changedPaths: ["src/greeting.mjs"]
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "package_artifact_install_failed");
});

test("exact packed artifact composes through installed public specifiers and then blocks", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-packed-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = packTeamSystem(directory);
  const result = await composeMinimumFixture({
    packageArtifactPath: artifact,
    packageArtifactSha256: await digest(artifact),
    baseRevision: "0123456789012345678901234567890123456789",
    hostConfiguration: {
      adapterId: "github",
      repository: "fixture/external-v03",
      branch: "fixture/mission-1"
    },
    blindStatus: "partially-informed",
    priorSolutionsVisible: false,
    requireSimmons: true,
    changedPaths: ["src/greeting.mjs"]
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "dependency_contract_unavailable");
  assert.deepEqual(result.blockers.map(({ issue }) => issue), ["#24", "#112", "#113"]);
  assert.equal(result.identity.installedPackage.name, "@shield/team-system");
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
  const base = {
    packageArtifactPath: artifact,
    packageArtifactSha256: "0".repeat(64),
    baseRevision: "0123456789012345678901234567890123456789",
    hostConfiguration: {
      adapterId: "github",
      repository: "fixture/external-v03",
      branch: "fixture/mission-1"
    },
    blindStatus: "blind",
    priorSolutionsVisible: false,
    requireSimmons: false,
    changedPaths: ["src/greeting.mjs"]
  };
  assert.equal((await composeMinimumFixture(base)).reason, "package_artifact_digest_mismatch");
  assert.equal((await composeMinimumFixture({
    ...base,
    changedPaths: ["README.md", "src/greeting.mjs"]
  })).reason, "scope_drift");
});

test("baseline defect fails and fixture-only injection restores the exact passing candidate", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-v03-defect-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await cp(template, directory, { recursive: true });
  assert.equal((await gradeCandidateWithFailureInjection(directory)).reason, "candidate_still_contains_frozen_defect");

  const candidatePath = join(directory, "src/greeting.mjs");
  await writeFile(candidatePath, [
    "export function greeting(name) {",
    "  return `Hello, ${name.trim()}!`;",
    "}",
    ""
  ].join("\n"));
  const result = await gradeCandidateWithFailureInjection(directory);
  assert.equal(result.state, "passed", JSON.stringify(result));
  assert.equal(result.injectedOutcome, "failed");
  assert.equal(result.rollbackOutcome, "passed");
  assert.equal(result.candidateSha256, result.restoredSha256);
  assert.equal(result.networkEffectsPerformed, false);
});

test("evidence inventory names human gates without manufacturing their evidence", () => {
  const inventory = createEvidenceInventory({ requireSimmons: true });
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
  await mkdir(join(directory, "src"));
  const outsideTarget = join(outside, "greeting.mjs");
  await writeFile(outsideTarget, "outside bytes\n");
  await symlink(outsideTarget, join(directory, "src/greeting.mjs"));
  const result = await gradeCandidateWithFailureInjection(directory);
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "fixture_target_unavailable");
  assert.equal(await readFile(outsideTarget, "utf8"), "outside bytes\n");
});
