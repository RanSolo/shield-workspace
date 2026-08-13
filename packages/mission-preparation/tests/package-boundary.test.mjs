import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = join(packageRoot, "..", "..");
const forbiddenPackage = `@shield/${"team"}-system`;
const forbiddenPath = `packages/${"shield"}-team-system`;

function filesBelow(root) {
  const output = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...filesBelow(path));
    else output.push(path);
  }
  return output;
}

function assertBoundaryBytes(paths) {
  for (const path of paths) {
    const bytes = readFileSync(path);
    assert.equal(bytes.includes(Buffer.from(forbiddenPackage)), false, path);
    assert.equal(bytes.includes(Buffer.from(forbiddenPath)), false, path);
  }
}

function installedGraph(api) {
  const unwrap = (result) => {
    assert.equal(result.state, "valid");
    return result.value;
  };
  const artifact = (body) => {
    const digest = unwrap(api.computeCanonicalContractDigestV1({ schemaId: body.schemaId, body }));
    return { ...body, id: unwrap(api.computeContentIdV1({ schemaId: body.schemaId, digest })), digest };
  };
  const exclusions = ["review.comment.publish", "review.pull_request.update_draft", "review.pull_request.mark_ready", "merge", "deployment", "release", "final_acceptance"];
  const plan = artifact({
    schemaId: "mission.transition-plan.v1", authority: "none", missionId: "mission:package-boundary", subjectId: "package-boundary", repositoryId: "Example/repository",
    planningBaseRevision: "1".repeat(40), parentPlanCommit: "2".repeat(40), parentPlanPath: "docs/plan.md", parentPlanRawSha256: "3".repeat(64),
    transitionKind: "fresh_authorize_wheels_up", boundedOutcome: "Prove the installed authority-none compiler.", approvedRelativePaths: ["package-lock.json"],
    publicationPaths: ["docs/plan.md"], approvedActionIds: ["repository.write_file"], approvedEffectClasses: ["behavioral_implementation"],
    approvedEffectKeys: ["effect:package-boundary"], approvedCapabilities: ["filesystem_write"], validationCommandIds: ["validation:package-boundary"],
    modelId: "model:may", reasoningRuntimeId: "runtime:may", toolExecutorId: "executor:may", exclusions,
  });
  const reviewEvidence = artifact({
    schemaId: "mission.parent-plan-review-evidence.v1", authority: "none", repositoryId: plan.repositoryId, planningBaseRevision: plan.planningBaseRevision,
    parentPlanCommit: plan.parentPlanCommit, parentPlanPath: plan.parentPlanPath, parentPlanRawSha256: plan.parentPlanRawSha256, transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest, verdict: "PASS", reviewerSeatId: "fury", reviewerRuntimeId: "runtime:fury", reviewerModelId: "model:fury",
    reviewerExecutorId: "executor:fury", rawReceiptSetSha256: `sha256:${"4".repeat(64)}`, attributionClass: "team_system_projection", preparationEligibility: "preparationEligible",
  });
  const intent = artifact({
    schemaId: "mission.transition-intent.v1", authority: "none", missionId: plan.missionId, subjectId: plan.subjectId, repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision, transitionPlanId: plan.id, transitionPlanDigest: plan.digest, parentReviewEvidenceId: reviewEvidence.id,
    parentReviewEvidenceDigest: reviewEvidence.digest, transitionKind: "fresh_authorize_wheels_up", preparationEligibility: "preparationEligible",
  });
  const observation = artifact({
    schemaId: "mission.fresh-authorize-wheels-up-observation.v1", authority: "none", missionId: plan.missionId, subjectId: plan.subjectId, repositoryId: plan.repositoryId,
    canonicalRoot: "/private/tmp/package-boundary", branch: "agent/package-boundary", planningBaseRevision: plan.planningBaseRevision, baseRevision: plan.planningBaseRevision,
    headRevision: "5".repeat(40), baseAncestor: true, workspaceClean: true, changedPaths: [...plan.publicationPaths], symlinkPaths: [], gitlinkPaths: [],
    missionSchemaVersion: 9, authorizationState: "waiting", implementationAuthorityState: "waiting", finalAcceptanceState: "waiting", executionState: "not-started",
    implementationAuthorityCount: 0, runtimeBindingCount: 0, activeRuntimeBindingCount: 0, publicationAuthorizationCount: 0, pendingCoulsonMissionAuthorizationCount: 1,
    journalSequence: 1, journalSha256: `sha256:${"6".repeat(64)}`, signerBindingId: "binding:coulson", signingKeyRef: `ed25519:sha256:${"B".repeat(43)}`,
    signerBindingMatchCount: 1, remainingHumanGates: ["coulson.final_acceptance", "fitz.technical_review"], preparationEligibility: "preparationEligible",
  });
  return { plan, reviewEvidence, intent, observation };
}

test("metadata, lockfile, source, and declarations preserve the package boundary", () => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.equal(manifest.name, "@shield/mission-preparation");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.type, "module");
  assert.deepEqual(Object.keys(manifest.exports), ["."]);
  assert.deepEqual(manifest.files, ["dist"]);
  assert.equal(manifest.sideEffects, false);
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.bin, undefined);
  assert.equal(manifest.scripts.install, undefined);
  assert.equal(manifest.scripts.postinstall, undefined);

  const lock = JSON.parse(readFileSync(join(repositoryRoot, "package-lock.json"), "utf8"));
  assert.deepEqual(lock.packages["packages/mission-preparation"].devDependencies, { "@types/node": "20.12.12", typescript: "5.4.5" });
  assert.equal(lock.packages["packages/mission-preparation"].dependencies, undefined);
  assertBoundaryBytes([
    ...filesBelow(join(packageRoot, "src")),
    ...filesBelow(join(packageRoot, "dist")),
    join(packageRoot, "package.json"),
  ]);
});

test("the tarball installs offline and compiles a fixed candidate independently", async () => {
  const root = mkdtempSync(join(tmpdir(), "shield-269-boundary-"));
  try {
    const packOutput = execFileSync("npm", ["pack", "--workspace", "@shield/mission-preparation", "--pack-destination", root, "--ignore-scripts", "--json"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    const packed = JSON.parse(packOutput);
    assert.equal(packed.length, 1);
    const tarball = join(root, packed[0].filename);
    const members = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(members.sort(), [
      "package/dist/canonical-json-v1.d.mts", "package/dist/canonical-json-v1.mjs", "package/dist/contracts-v1.d.mts", "package/dist/contracts-v1.mjs",
      "package/dist/index.d.mts", "package/dist/index.mjs", "package/dist/preparation-compiler-v1.d.mts", "package/dist/preparation-compiler-v1.mjs", "package/package.json",
    ].sort());
    const extracted = join(root, "extracted");
    execFileSync("mkdir", [extracted]);
    execFileSync("tar", ["-xzf", tarball, "-C", extracted]);
    assertBoundaryBytes(filesBelow(extracted));

    const install = join(root, "install");
    execFileSync("mkdir", [install]);
    execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball], { cwd: install, stdio: "pipe" });
    const installedFiles = filesBelow(join(install, "node_modules", "@shield", "mission-preparation"));
    assertBoundaryBytes(installedFiles);
    assert.equal(installedFiles.some((path) => path.includes(`${join("node_modules", "@shield", "team-system")}`)), false);

    const installed = await import(pathToFileURL(join(install, "node_modules", "@shield", "mission-preparation", "dist", "index.mjs")).href);
    const prepared = installed.prepareMissionTransitionV1(installedGraph(installed));
    assert.equal(prepared.state, "ready");
    assert.equal(prepared.candidate.transitionKind, "authorize-wheels-up");
    assert.equal(prepared.receipt.result, "candidate_compiled");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
