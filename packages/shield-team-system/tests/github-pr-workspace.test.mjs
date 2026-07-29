import assert from "node:assert/strict";
import test from "node:test";

import { createOrUpdatePR } from "../github/pr-workspace.mjs";
import { publicationJournalFixture } from "./fixtures/review-publication-journal.mjs";

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

function publicationFixture(action) {
  return publicationJournalFixture({
    missionId: "mission:issue-3",
    subjectId: "issue:3",
    headRevisionId: head,
    baseRevisionId: base,
    branch: plan().branchSlug,
    authorizedPaths: [plan().missionBriefPath],
    permittedEffects: [
      "review.branch.push",
      `review.pull_request.${action}_draft`,
    ],
    operation: "publish_mission_brief",
    targetRef: `github:repository:RanSolo/shield-workspace` +
      `:branch:${plan().branchSlug}:base:main`,
  });
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
  ok("/workspace/shield-workspace"), ok("git@github.com:RanSolo/shield-workspace.git"),
  ok(plan().branchSlug), ok(head), ok(base), ok(),
  ok(`${plan().missionBriefPath}\0`), ok(), ok(), ok(base),
];

test("creates a draft PR and verifies it through GitHub readback", () => {
  const publication = publicationFixture("create");
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
    publicationRequestId: publication.requestId,
    loadJournal: publication.loadJournal,
    realpath: (value) => value,
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
  const publication = publicationFixture("update");
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
    publicationRequestId: publication.requestId,
    loadJournal: publication.loadJournal,
    realpath: (value) => value,
  });
  assert.equal(result.state, "reused");
  assert.equal(result.prNumber, 4);
  assert.deepEqual(run.calls.at(-2).args.slice(0, 4), ["pr", "edit", "4", "--repo"]);
  assert.equal(run.calls.at(-2).options.input, "Updated body");
  assert.equal(result.receipt.prNumber, 4);
});

test("host-observed repository root and origin must match signed authority", () => {
  const publication = publicationFixture("create");
  for (const scopeResponses of [
    [
      ok("/other/root"),
      ok("git@github.com:RanSolo/shield-workspace.git"),
      ...scopeChecks().slice(2),
    ],
    [
      ok("/workspace/shield-workspace"),
      ok("git@github.com:RanSolo/other.git"),
      ...scopeChecks().slice(2),
    ],
  ]) {
    const run = runner([
      ...initialChecks(),
      ok("[]"),
      ...scopeResponses,
    ]);
    const result = createOrUpdatePR(plan(), {
      run,
      body: "Mission body",
      publicationRequestId: publication.requestId,
      loadJournal: publication.loadJournal,
      realpath: (value) => value,
    });
    assert.equal(result.state, "blocked");
    assert.equal(result.reason, "binding_mismatch");
    assert.equal(
      run.calls.some(({ executable, args }) =>
        executable === "git" && args[0] === "push"),
      false,
    );
  }
});

test("live remote base branch must resolve to the signed base revision", () => {
  const publication = publicationFixture("create");
  const run = runner([
    ...initialChecks(),
    ok("[]"),
    ...scopeChecks().slice(0, -1),
    ok("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
  ]);
  const result = createOrUpdatePR(plan(), {
    run,
    body: "Mission body",
    publicationRequestId: publication.requestId,
    loadJournal: publication.loadJournal,
    realpath: (value) => value,
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_target_mismatch");
  assert.equal(
    run.calls.some(({ executable, args }) =>
      executable === "git" && args[0] === "push"),
    false,
  );
  assert.equal(
    run.calls.some(({ executable, args }) =>
      executable === "git" && args[0] === "ls-remote"),
    true,
  );
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
      realpath: (value) => value,
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
    const publication = publicationFixture("create");
    const result = createOrUpdatePR(plan(), {
      run: runner(responses),
      body: "body",
      publicationRequestId: publication.requestId,
      loadJournal: publication.loadJournal,
      realpath: (value) => value,
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
