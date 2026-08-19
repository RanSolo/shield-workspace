import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  observeFinalPublicationWorktreeV1ForTest,
  runFinalPublicationTransitionV1,
} from "../dist/final-publication-transition-v1.mjs";

const repositoryId = "RanSolo/shield-workspace";
const branch = "agent/final-publication-transition";

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function repository() {
  const root = await mkdtemp(join(tmpdir(), "shield-final-transition-"));
  git(root, "init", "--quiet", "--initial-branch", branch);
  git(root, "config", "user.name", "SHIELD Test");
  git(root, "config", "user.email", "shield@example.invalid");
  git(root, "remote", "add", "origin", "git@github.com:RanSolo/shield-workspace.git");
  await writeFile(join(root, "plan.md"), "plan\n");
  git(root, "add", "plan.md");
  git(root, "commit", "--quiet", "-m", "plan");
  const initial = git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "implementation.mjs"), "export const implemented = true;\n");
  git(root, "add", "implementation.mjs");
  git(root, "commit", "--quiet", "-m", "implementation");
  return { root: await realpath(root), initial, head: git(root, "rev-parse", "HEAD") };
}

test("attached and exact detached worktrees converge on the unique expected branch without HEAD drift", async () => {
  const fixture = await repository();
  const attached = await observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: fixture.root,
    repositoryId,
    expectedBranch: branch,
    expectedInitialHead: fixture.initial,
  });
  assert.deepEqual(attached, { head: fixture.head, branch });

  git(fixture.root, "switch", "--detach", fixture.head);
  assert.equal(git(fixture.root, "branch", "--show-current"), "");
  const repaired = await observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: fixture.root,
    repositoryId,
    expectedBranch: branch,
    expectedInitialHead: fixture.initial,
  });
  assert.deepEqual(repaired, { head: fixture.head, branch });
  assert.equal(git(fixture.root, "branch", "--show-current"), branch);
});

test("detached repair rejects dirt, ref drift, repository drift, and another worktree owner", async () => {
  const dirty = await repository();
  await writeFile(join(dirty.root, "dirty.txt"), "dirty\n");
  await assert.rejects(observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: dirty.root, repositoryId, expectedBranch: branch, expectedInitialHead: dirty.initial,
  }), /cleanliness/u);

  const refDrift = await repository();
  git(refDrift.root, "switch", "--detach", refDrift.head);
  git(refDrift.root, "branch", "-f", branch, refDrift.initial);
  await assert.rejects(observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: refDrift.root, repositoryId, expectedBranch: branch, expectedInitialHead: refDrift.initial,
  }), /HEAD|ref/u);

  const repositoryDrift = await repository();
  await assert.rejects(observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: repositoryDrift.root, repositoryId: "RanSolo/other", expectedBranch: branch, expectedInitialHead: repositoryDrift.initial,
  }), /identity/u);

  const owned = await repository();
  git(owned.root, "switch", "--detach", owned.head);
  const ownerRoot = await mkdtemp(join(tmpdir(), "shield-final-transition-owner-"));
  execFileSync("git", ["worktree", "add", ownerRoot, branch], { cwd: owned.root, stdio: "pipe" });
  await assert.rejects(observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: owned.root, repositoryId, expectedBranch: branch, expectedInitialHead: owned.initial,
  }), /owned by another worktree/u);
});

test("closed transition input fails incompatible before repository or publication effects", async () => {
  const result = await runFinalPublicationTransitionV1({ repositoryRoot: "", missionId: "", baseBranch: "" });
  assert.equal(result.state, "recovery_required");
  assert.equal(result.classification, "incompatible");
  assert.match(result.reason, /input is malformed/u);
});
