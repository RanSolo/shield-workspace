import assert from "node:assert/strict";
import test from "node:test";

import { createOrUpdatePR } from "../github/pr-workspace.mjs";

const head = "0123456789012345678901234567890123456789";
const base = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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

function publicationScope() {
  return {
    authority: {
      publicationScopeSchemaVersion: 1,
      contractVersion: "review-publication.v1",
      authorityKind: "review.publish",
      authorityRef: "authorization:issue-3",
      missionId: "mission:issue-3",
      subjectId: "issue:3",
      missionRevisionId: "sha256:mission-issue-3",
      repositoryId: "RanSolo/shield-workspace",
      canonicalRepositoryRoot: "/workspace/shield-workspace",
      branch: plan().branchSlug,
      baseRevisionId: base,
      headRevisionId: head,
      authorizedPaths: [plan().missionBriefPath],
      permittedEffects: [
        "review.branch.push",
        "review.pull_request.create_draft",
        "review.pull_request.update_draft",
      ],
    },
    proposedChangedPaths: [plan().missionBriefPath],
    canonicalRepositoryRoot: "/workspace/shield-workspace",
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
const initialChecks = () => [
  ok(plan().branchSlug), ok(), ok(plan().missionBriefPath), ok(head), ok(head),
];
const scopeChecks = () => [
  ok(plan().branchSlug), ok(head), ok(base), ok(),
  ok(`${plan().missionBriefPath}\0`), ok(), ok(),
];

test("creates a draft PR and verifies it through GitHub readback", () => {
  const run = runner([
    ...initialChecks(),
    ok("[]"),
    ...scopeChecks(),
    ok(),
    ok("https://github.com/RanSolo/shield-workspace/pull/4"),
    ok(JSON.stringify([{
      number: 4,
      title: plan().prTitle,
      url: "https://github.com/RanSolo/shield-workspace/pull/4",
      isDraft: true,
      state: "OPEN",
      headRefName: plan().branchSlug,
      headRefOid: head,
      baseRefName: "main",
    }])),
  ]);
  const result = createOrUpdatePR(plan(), {
    run,
    body: "Mission body",
    publicationScope: publicationScope(),
  });

  assert.equal(result.state, "success");
  assert.equal(result.prNumber, 4);
  assert.equal(result.receipt.artifactRevisionId, head);
  const create = run.calls.find(({ executable, args }) =>
    executable === "gh" && args[0] === "pr" && args[1] === "create");
  assert.equal(create.options.input, "Mission body");
  assert.ok(create.args.includes("--draft"));
  assert.ok(run.calls.findIndex(({ executable, args }) =>
    executable === "git" && args[0] === "diff") <
    run.calls.findIndex(({ executable, args }) =>
      executable === "git" && args[0] === "push"));
});

test("reuses exactly one open draft PR and updates its body", () => {
  const existing = [{
    number: 4,
    title: "old title",
    url: "https://github.com/RanSolo/shield-workspace/pull/4",
    isDraft: true,
    state: "OPEN",
    headRefName: plan().branchSlug,
    headRefOid: head,
    baseRefName: "main",
  }];
  const run = runner([
    ...initialChecks(), ok(JSON.stringify(existing)), ...scopeChecks(),
    ok(), ok(), ok(JSON.stringify(existing)),
  ]);
  const result = createOrUpdatePR(plan(), {
    run,
    body: "Updated body",
    publicationScope: publicationScope(),
  });
  assert.equal(result.state, "reused");
  assert.equal(result.prNumber, 4);
  assert.deepEqual(run.calls.at(-2).args.slice(0, 4), ["pr", "edit", "4", "--repo"]);
  assert.equal(run.calls.at(-2).options.input, "Updated body");
  assert.equal(result.receipt.prNumber, 4);
});

test("blocks on unsafe repository state and ambiguous or non-draft PRs", () => {
  const dirtyBrief = runner([ok(plan().branchSlug), ok(" M docs/missions/brief.md")]);
  assert.equal(createOrUpdatePR(plan(), { run: dirtyBrief, body: "body" }).reason, "mission_brief_not_clean");

  for (const prs of [
    [
      { number: 4, url: "u1", isDraft: true, state: "OPEN", headRefName: plan().branchSlug, headRefOid: head, baseRefName: "main" },
      { number: 5, url: "u2", isDraft: true, state: "OPEN", headRefName: plan().branchSlug, headRefOid: head, baseRefName: "main" },
    ],
    [{ number: 4, url: "u1", isDraft: false, state: "OPEN", headRefName: plan().branchSlug, headRefOid: head, baseRefName: "main" }],
    [{ number: 4, url: "u1", isDraft: true, state: "OPEN", headRefName: "other/branch", headRefOid: head, baseRefName: "main" }],
  ]) {
    const run = runner([
      ...initialChecks(), ok(JSON.stringify(prs)),
    ]);
    assert.equal(createOrUpdatePR(plan(), {
      run,
      body: "body",
      publicationScope: publicationScope(),
    }).state, "blocked");
  }
});

test("lookup, creation, and readback failures never fabricate a PR URL", () => {
  const cases = [
    [
      ...initialChecks(),
      { exitCode: 1, stdout: "", stderr: "offline" },
    ],
    [
      ...initialChecks(), ok("[]"), ...scopeChecks(), ok(),
      { exitCode: 1, stdout: "", stderr: "denied" },
    ],
    [
      ...initialChecks(), ok("[]"), ...scopeChecks(), ok(),
      ok("created"), ok("[]"),
    ],
  ];
  for (const responses of cases) {
    const result = createOrUpdatePR(plan(), {
      run: runner(responses),
      body: "body",
      publicationScope: publicationScope(),
    });
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
