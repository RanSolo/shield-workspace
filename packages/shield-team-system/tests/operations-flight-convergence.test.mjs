import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkIntegration } from "../scripts/operations/integration-check.mjs";
import { planTeardown } from "../scripts/operations/teardown-plan.mjs";
import { stableJson } from "../scripts/operations/common.mjs";
import { PLAN_NOTICE } from "../scripts/operations/flight-common.mjs";

const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shield-flight-convergence-"));
  const repo = join(root, "repo");
  const worktree = join(root, "worktree-a");
  await mkdir(repo);
  git(repo, ["init", "--initial-branch=main"]);
  git(repo, ["config", "user.email", "operations@example.invalid"]);
  git(repo, ["config", "user.name", "SHIELD Operations"]);
  await writeFile(join(repo, "README.md"), "base\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "base"]);
  const base = git(repo, ["rev-parse", "HEAD"]);
  git(repo, ["worktree", "add", "-b", "spike/a", worktree, base]);
  const mission = ({ id, title, lane, branch, missionWorktree, activationWave, dependsOn, writablePaths, deliverables }) => ({
    id,
    slug: id.replace(":", "-"),
    title,
    library: `library-${lane}`,
    lane,
    branch,
    worktree: missionWorktree,
    activationWave,
    dependsOn,
    writablePaths,
    scope: `Implement ${title}.`,
    deliverables,
    dependencyLevel: dependsOn.length === 0 ? 0 : 1,
    initialEligibility: dependsOn.length > 0 ? "blocked-by-dependencies" : "eligible-after-independent-authorization",
    constructionStatus: "planned-not-created",
    authorityStatus: "not-initialized",
  });
  const missions = [
    mission({ id: "mission:a", title: "A", lane: "alpha", branch: "spike/a", missionWorktree: worktree, activationWave: 1, dependsOn: [], writablePaths: ["a/**"], deliverables: ["A"] }),
    mission({ id: "mission:b", title: "B", lane: "bravo", branch: "spike/b", missionWorktree: join(root, "worktree-b"), activationWave: 1, dependsOn: [], writablePaths: ["b/**"], deliverables: ["B"] }),
    mission({ id: "mission:integration", title: "Integrate", lane: "alpha", branch: "feature/test", missionWorktree: join(root, "integration"), activationWave: 2, dependsOn: ["mission:a", "mission:b"], writablePaths: ["integration/**"], deliverables: ["ADR"] }),
  ];
  const plan = {
    schemaVersion: 1,
    planType: "feature-flight-resolved-plan",
    prototype: { name: "flight-prep", version: "1.0.0", authority: "none", notice: PLAN_NOTICE },
    flightId: "flight:test",
    objective: "Test convergence tooling.",
    repository: {
      root: repo,
      remoteUrl: null,
      baseRef: "refs/heads/main",
      baseRevision: base,
      inspectedHead: base,
      inspectedBranch: "main",
      inspectedWorktreeClean: true,
      collisions: [],
    },
    integration: { branch: "integration/test", status: "declared-not-created" },
    lanes: [
      { id: "alpha", chatLabel: "Alpha chat", teamLabel: "Alpha team" },
      { id: "bravo", chatLabel: "Bravo chat", teamLabel: "Bravo team" },
    ],
    missions,
    evaluationContract: { fixtureId: "fixture:convergence", version: 1, scorecard: ["correctness"] },
  };
  const planPath = join(root, "plan.json");
  await writeFile(planPath, stableJson(plan));
  return { root, repo, worktree, base, missions, planPath };
}

const packet = (mission, head) => ({
  schemaVersion: 1,
  packetType: "exact-mission-handoff",
  mode: "checkout",
  mission: { id: mission.id },
  repository: { branch: mission.branch, head, clean: true, changedPaths: [`${mission.id.slice(-1)}/result.txt`] },
  acceptance: { phase: "green", ok: true, expectedRevision: head },
});

test("integration check requires every exact dependency packet", async () => {
  const f = await fixture();
  const a = join(f.root, "a.json");
  const b = join(f.root, "b.json");
  await writeFile(a, stableJson(packet(f.missions[0], "a".repeat(40))));
  await writeFile(b, stableJson(packet(f.missions[1], "b".repeat(40))));
  const pass = await checkIntegration({ planPath: f.planPath, targetMissionId: "mission:integration", packetPaths: [a, b] });
  assert.equal(pass.ok, true);
  assert.equal(pass.authority, "none");
  const blocked = await checkIntegration({ planPath: f.planPath, targetMissionId: "mission:integration", packetPaths: [a] });
  assert.equal(blocked.ok, false);
  assert.match(blocked.errors.join("\n"), /Missing exact packet for dependency mission:b/u);
});

test("teardown planning never deletes and preserves clean unintegrated work", async () => {
  const f = await fixture();
  const report = await planTeardown({ planPath: f.planPath, integrationRef: "main" });
  assert.equal(report.authority, "none");
  assert.equal(report.worktrees[0].disposition, "eligible-for-human-confirmed-removal");
  assert.match(report.notice, /No worktree.*removed/u);
});

test("teardown planning preserves dirty worktrees", async () => {
  const f = await fixture();
  await writeFile(join(f.worktree, "README.md"), "dirty\n");
  const report = await planTeardown({ planPath: f.planPath, integrationRef: "main" });
  assert.equal(report.worktrees[0].disposition, "preserve-dirty");
  assert.equal(report.worktrees[0].observed.clean, false);
});
