import assert from "node:assert/strict";
import test from "node:test";

import { createOrUpdatePR } from "../github/pr-workspace.mjs";

function plan() {
  return {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug: "agent/issue-3-pr-mission-workspace-mvp",
    missionBriefPath: "docs/missions/issue-3-pr-mission-workspace-mvp.md",
    prTitle: "feat: mission workspace",
  };
}

function runner(responses) {
  const calls = [];
  const run = (executable, args, options = {}) => {
    calls.push({ executable, args, options });
    const response = responses.shift();
    assert.ok(response, `Unexpected command: ${executable} ${args.join(" ")}`);
    return response;
  };
  run.calls = calls;
  return run;
}

const ok = (stdout = "") => ({ exitCode: 0, stdout, stderr: "" });

test("creates a draft PR and verifies it through GitHub readback", () => {
  const run = runner([
    ok(plan().branchSlug),
    ok(),
    ok(plan().missionBriefPath),
    ok("abc123"),
    ok(),
    ok("[]"),
    ok("https://github.com/RanSolo/shield-workspace/pull/4"),
    ok(JSON.stringify([{
      number: 4,
      title: plan().prTitle,
      url: "https://github.com/RanSolo/shield-workspace/pull/4",
      isDraft: true,
      state: "OPEN",
      headRefName: plan().branchSlug,
      baseRefName: "main",
    }])),
  ]);
  const result = createOrUpdatePR(plan(), { run, body: "Mission body" });

  assert.equal(result.state, "success");
  assert.equal(result.prNumber, 4);
  assert.deepEqual(run.calls.map(({ executable, args }) => [executable, args[0], args[1]]), [
    ["git", "branch", "--show-current"],
    ["git", "status", "--porcelain"],
    ["git", "ls-files", "--error-unmatch"],
    ["git", "log", "-1"],
    ["git", "push", "-u"],
    ["gh", "pr", "list"],
    ["gh", "pr", "create"],
    ["gh", "pr", "list"],
  ]);
  assert.equal(run.calls[6].options.input, "Mission body");
  assert.ok(run.calls[6].args.includes("--draft"));
});

test("reuses exactly one open draft PR and updates its body", () => {
  const existing = [{
    number: 4,
    title: "old title",
    url: "https://github.com/RanSolo/shield-workspace/pull/4",
    isDraft: true,
    state: "OPEN",
    headRefName: plan().branchSlug,
    baseRefName: "main",
  }];
  const run = runner([
    ok(plan().branchSlug), ok(), ok(plan().missionBriefPath), ok("abc123"), ok(),
    ok(JSON.stringify(existing)), ok(),
  ]);
  const result = createOrUpdatePR(plan(), { run, body: "Updated body" });
  assert.equal(result.state, "reused");
  assert.equal(result.prNumber, 4);
  assert.deepEqual(run.calls.at(-1).args.slice(0, 4), ["pr", "edit", "4", "--repo"]);
  assert.equal(run.calls.at(-1).options.input, "Updated body");
});

test("blocks on unsafe repository state and ambiguous or non-draft PRs", () => {
  const dirtyBrief = runner([ok(plan().branchSlug), ok(" M docs/missions/brief.md")]);
  assert.equal(createOrUpdatePR(plan(), { run: dirtyBrief, body: "body" }).reason, "mission_brief_not_clean");

  for (const prs of [
    [
      { number: 4, url: "u1", isDraft: true, state: "OPEN", headRefName: plan().branchSlug, baseRefName: "main" },
      { number: 5, url: "u2", isDraft: true, state: "OPEN", headRefName: plan().branchSlug, baseRefName: "main" },
    ],
    [{ number: 4, url: "u1", isDraft: false, state: "OPEN", headRefName: plan().branchSlug, baseRefName: "main" }],
  ]) {
    const run = runner([
      ok(plan().branchSlug), ok(), ok(plan().missionBriefPath), ok("abc123"), ok(), ok(JSON.stringify(prs)),
    ]);
    assert.equal(createOrUpdatePR(plan(), { run, body: "body" }).state, "blocked");
  }
});

test("lookup, creation, and readback failures never fabricate a PR URL", () => {
  const cases = [
    [
      ok(plan().branchSlug), ok(), ok(plan().missionBriefPath), ok("abc123"), ok(),
      { exitCode: 1, stdout: "", stderr: "offline" },
    ],
    [
      ok(plan().branchSlug), ok(), ok(plan().missionBriefPath), ok("abc123"), ok(),
      ok("[]"), { exitCode: 1, stdout: "", stderr: "denied" },
    ],
    [
      ok(plan().branchSlug), ok(), ok(plan().missionBriefPath), ok("abc123"), ok(),
      ok("[]"), ok("created"), ok("[]"),
    ],
  ];
  for (const responses of cases) {
    const result = createOrUpdatePR(plan(), { run: runner(responses), body: "body" });
    assert.equal(result.state, "blocked");
    assert.equal(Object.hasOwn(result, "prUrl"), false);
  }
});

test("unsafe bodies and thrown runner errors fail closed before GitHub publication", () => {
  const neverCalled = runner([]);
  assert.deepEqual(
    createOrUpdatePR(plan(), { run: neverCalled, body: "token=abcdefghijk" }),
    { state: "blocked", reason: "unsafe_pr_body", commands: [] },
  );
  assert.equal(neverCalled.calls.length, 0);

  const throwing = () => {
    throw new Error("host unavailable");
  };
  const result = createOrUpdatePR(plan(), { run: throwing, body: "Safe body" });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "expected_branch_not_checked_out");
  assert.equal(Object.hasOwn(result, "prUrl"), false);
});
