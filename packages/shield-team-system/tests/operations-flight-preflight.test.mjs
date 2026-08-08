import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkConstruction } from "../scripts/operations/construction-check.mjs";
import { diagnoseFlight } from "../scripts/operations/flight-doctor.mjs";
import { stableJson } from "../scripts/operations/common.mjs";

const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shield-flight-preflight-"));
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
  const plan = {
    schemaVersion: 1,
    flightId: "flight:test",
    repository: { root: repo, baseRevision: base, collisions: [] },
    integration: { branch: "main" },
    missions: [{
      id: "mission:a", title: "A", lane: "alpha", branch: "spike/a", worktree,
      activationWave: 1, dependsOn: [], writablePaths: ["a/**"], deliverables: ["A"],
    }],
  };
  const planPath = join(root, "plan.json");
  await writeFile(planPath, stableJson(plan));
  return { planPath };
}

test("construction check proves the exact clean worktree without claiming authority", async () => {
  const { planPath } = await fixture();
  const report = await checkConstruction({ planPath, requireCreated: true });
  assert.equal(report.ok, true);
  assert.equal(report.authority, "none");
  assert.equal(report.observations[0].status, "created-clean");
});

test("flight doctor composes plan and construction health without authority", async () => {
  const { planPath } = await fixture();
  const report = await diagnoseFlight({ planPath });
  assert.equal(report.ok, true);
  assert.equal(report.authority, "none");
  assert.match(report.warnings.join("\n"), /No bootstrap-receipt/u);
});
