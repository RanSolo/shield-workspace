import assert from "node:assert/strict";
import test from "node:test";

import { createOrUpdatePR, installFinalPublicationEffectGuard, reconcilePRPublication } from "../github/pr-workspace.mjs";
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

function publicationFixture(action, schemaVersion = 8) {
  return publicationJournalFixture({
    schemaVersion,
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
  ok(`${plan().missionBriefPath}\0`), ok(), ok(),
];
const defaultBranch = () => ok(JSON.stringify({
  nameWithOwner: "RanSolo/shield-workspace",
  defaultBranchRef: { name: "main" },
}));
const mutationBaseChecks = () => [defaultBranch(), ok(`${base}\trefs/heads/main`)];
const genericBaseCheck = () => ok(base);

function existingDraft(overrides = {}) {
  return {
    number: 4,
    title: plan().prTitle,
    body: "Mission body",
    url: "https://github.com/RanSolo/shield-workspace/pull/4",
    isDraft: true,
    state: "OPEN",
    headRefName: plan().branchSlug,
    headRefOid: head,
    headRepository: { nameWithOwner: "RanSolo/shield-workspace" },
    isCrossRepository: false,
    baseRefName: "main",
    ...overrides,
  };
}

test("creates a draft PR and verifies it through GitHub readback", () => {
  const publication = publicationFixture("create");
  const run = runner([
    ...initialChecks(),
    ok("[]"),
    ...scopeChecks(), genericBaseCheck(),
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
      headRepository: { nameWithOwner: "RanSolo/shield-workspace" },
      isCrossRepository: false,
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

test("draft PR workspace consumes a real schema-9 queued publication request", () => {
  const publication = publicationFixture("create", 9);
  const run = runner([
    ...initialChecks(),
    ok("[]"),
    ...scopeChecks(), genericBaseCheck(),
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
      headRepository: { nameWithOwner: "RanSolo/shield-workspace" },
      isCrossRepository: false,
      baseRefName: "main",
    }])),
  ]);
  const result = createOrUpdatePR(plan(), {
    run,
    body: "Schema-9 mission body",
    publicationRequestId: publication.requestId,
    loadJournal: publication.loadJournal,
    realpath: (value) => value,
  });
  assert.equal(result.state, "success");
  assert.equal(result.receipt.artifactRevisionId, head);
});

test("replayed schema-9 create request verifies an exact existing draft without mutation", () => {
  const publication = publicationFixture("create", 9);
  const run = runner([
    ...initialChecks(), ok(JSON.stringify([existingDraft()])), ...scopeChecks(), genericBaseCheck(),
  ]);
  const result = createOrUpdatePR(plan(), {
    run,
    body: "Mission body",
    publicationRequestId: publication.requestId,
    loadJournal: publication.loadJournal,
    realpath: (value) => value,
  });

  assert.equal(result.state, "reused");
  assert.equal(result.action, "verified_existing_draft_pr");
  assert.equal(result.prNumber, 4);
  assert.equal(result.receipt.artifactRevisionId, head);
  assert.equal(run.calls.length, 16);
  assert.equal(run.calls[5].args.at(-1).includes("body"), true);
  assert.equal(run.calls.some(({ executable, args }) =>
    executable === "git" && args[0] === "push"), false);
  assert.equal(run.calls.some(({ executable, args }) =>
    executable === "gh" && args[0] === "pr" && ["create", "edit"].includes(args[1])), false);
});

test("exact-create resume blocks presentation and identity drift before mutation", () => {
  const publication = publicationFixture("create", 9);
  const cases = [
    [existingDraft({ title: "drifted title" }), "matching_pr_title_mismatch", true],
    [existingDraft({ body: "drifted body" }), "matching_pr_body_mismatch", true],
    [existingDraft({ headRefOid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }), "existing_pr_failed_verification", true],
    [existingDraft({ baseRefName: "release" }), "pr_lookup_mismatch", false],
    [existingDraft({ url: "https://github.com/RanSolo/other/pull/4" }), "existing_pr_failed_verification", true],
    [existingDraft({ number: 0 }), "existing_pr_failed_verification", true],
  ];
  for (const [observed, reason, reachesScope] of cases) {
    const run = runner([
      ...initialChecks(), ok(JSON.stringify([observed])), ...(reachesScope ? [...scopeChecks(), genericBaseCheck()] : []),
    ]);
    const result = createOrUpdatePR(plan(), {
      run,
      body: "Mission body",
      publicationRequestId: publication.requestId,
      loadJournal: publication.loadJournal,
      realpath: (value) => value,
    });
    assert.equal(result.state, "blocked");
    assert.equal(result.reason, reason);
    assert.equal(run.calls.some(({ executable, args }) =>
      executable === "git" && args[0] === "push"), false);
    assert.equal(run.calls.some(({ executable, args }) =>
      executable === "gh" && args[0] === "pr" && ["create", "edit"].includes(args[1])), false);
  }
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
    headRepository: { nameWithOwner: "RanSolo/shield-workspace" },
    isCrossRepository: false,
    baseRefName: "main",
  }];
  const run = runner([
    ...initialChecks(), ok(JSON.stringify(existing)), ...scopeChecks(), genericBaseCheck(),
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

test("an update request with no existing draft remains blocked before mutation", () => {
  const publication = publicationFixture("update");
  const run = runner([...initialChecks(), ok("[]")]);
  const result = createOrUpdatePR(plan(), {
    run,
    body: "Updated body",
    publicationRequestId: publication.requestId,
    loadJournal: publication.loadJournal,
    realpath: (value) => value,
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_effect_mismatch");
  assert.equal(run.calls.some(({ executable, args }) =>
    executable === "git" && args[0] === "push"), false);
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
    ...scopeChecks(),
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
    [existingDraft({ state: "CLOSED" })],
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
      ...initialChecks(), ok("[]"), ...scopeChecks(), genericBaseCheck(), ok(),
      { exitCode: 1, stdout: "", stderr: "denied" },
    ],
    [
      ...initialChecks(), ok("[]"), ...scopeChecks(), genericBaseCheck(), ok(),
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

test("final publication reconciliation proves exact delivery or joint absence without mutation", () => {
  const fixture = publicationFixture("create", 9);
  const absent = runner([
    ...scopeChecks(),
    defaultBranch(),
    ok(`${base}\trefs/heads/main`),
    ok(),
    ok("[]"),
  ]);
  const absentResult = reconcilePRPublication(
    plan(), fixture.authority, fixture.request.proposedChangedPaths,
    fixture.request.requestedEffects, { run: absent, body: "Mission body", realpath: (value) => value },
  );
  assert.equal(absentResult.state, "not_applied");
  assert.equal(absent.calls.some(({ executable, args }) => executable === "git" && args[0] === "push"), false);

  const delivered = runner([
    ...scopeChecks(),
    defaultBranch(),
    ok(`${base}\trefs/heads/main`),
    ok(`${head}\trefs/heads/${plan().branchSlug}`),
    ok(JSON.stringify([existingDraft()])),
  ]);
  const deliveredResult = reconcilePRPublication(
    plan(), fixture.authority, fixture.request.proposedChangedPaths,
    fixture.request.requestedEffects, { run: delivered, body: "Mission body", realpath: (value) => value },
  );
  assert.equal(deliveredResult.state, "delivered");
  assert.equal(deliveredResult.receipt.prUrl, "https://github.com/RanSolo/shield-workspace/pull/4");
  assert.equal(delivered.calls.some(({ executable, args }) => executable === "gh" && args[0] === "pr" && ["create", "edit"].includes(args[1])), false);
  assert.match(delivered.calls.at(-1).args.at(-1), /headRepository,isCrossRepository/u);
});

test("fork PRs with the origin branch name and exact OID cannot satisfy reconciliation or creation readback", () => {
  const fixture = publicationFixture("create", 9);
  const finalFixture = publicationJournalFixture({
    schemaVersion: 9,
    missionId: "mission:final-publication-fork-readback",
    subjectId: "issue:311",
    headRevisionId: head,
    baseRevisionId: base,
    branch: plan().branchSlug,
    authorizedPaths: [plan().missionBriefPath],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
    operation: "publish_mission_brief",
    targetRef: `github:repository:RanSolo/shield-workspace:branch:${plan().branchSlug}:base:main`,
    requestId: "request:final-publication:fork-readback",
  });
  const fork = existingDraft({ headRepository: { nameWithOwner: "ForkOwner/shield-workspace" }, isCrossRepository: true });
  for (const mismatched of [
    fork,
    existingDraft({ isCrossRepository: true }),
    existingDraft({ headRepository: { nameWithOwner: "ForkOwner/shield-workspace" } }),
  ]) {
    const reconciliation = runner([
      ...scopeChecks(), defaultBranch(), ok(`${base}\trefs/heads/main`),
      ok(`${head}\trefs/heads/${plan().branchSlug}`), ok(JSON.stringify([mismatched])),
    ]);
    const reconciled = reconcilePRPublication(
      plan(), fixture.authority, fixture.request.proposedChangedPaths,
      fixture.request.requestedEffects, { run: reconciliation, body: "Mission body", realpath: (value) => value },
    );
    assert.equal(reconciled.state, "recovery_required");
    assert.equal(reconciled.reason, "pr_head_repository_mismatch");
  }

  const creation = runner([
    ...initialChecks(), ok("[]"), ...scopeChecks(), ok(), ...mutationBaseChecks(), ok(), ok("created"), ok(JSON.stringify([fork])),
  ]);
  const guard = installFinalPublicationEffectGuard(finalFixture.requestId, () => true);
  assert.equal(guard.state, "installed");
  const created = createOrUpdatePR(plan(), {
    run: creation,
    body: "Mission body",
    publicationRequestId: finalFixture.requestId,
    loadJournal: finalFixture.loadJournal,
    realpath: (value) => value,
  });
  assert.equal(guard.uninstall(), true);
  assert.equal(created.state, "blocked");
  assert.equal(created.reason, "pr_head_repository_mismatch");
  assert.equal(Object.hasOwn(created, "prUrl"), false);
});

test("final-publication request skips an exact remote HEAD and blocks remote drift before effects", () => {
  const publication = publicationJournalFixture({
    schemaVersion: 9,
    missionId: "mission:final-publication",
    subjectId: "issue:311",
    headRevisionId: head,
    baseRevisionId: base,
    branch: plan().branchSlug,
    authorizedPaths: [plan().missionBriefPath],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
    operation: "publish_mission_brief",
    targetRef: `github:repository:RanSolo/shield-workspace:branch:${plan().branchSlug}:base:main`,
    requestId: "request:final-publication:execute-once",
  });
  const run = runner([
    ...initialChecks(), ok("[]"), ...scopeChecks(),
    ok(`${head}\trefs/heads/${plan().branchSlug}`),
    ...mutationBaseChecks(),
    ok("created"),
    ok(JSON.stringify([existingDraft()])),
  ]);
  const guardedEffects = [];
  const guard = installFinalPublicationEffectGuard(publication.requestId, (effect) => {
    guardedEffects.push(effect);
    return true;
  });
  assert.equal(guard.state, "installed");
  const result = createOrUpdatePR(plan(), {
    run,
    body: "Mission body",
    publicationRequestId: publication.requestId,
    loadJournal: publication.loadJournal,
    realpath: (value) => value,
  });
  assert.equal(guard.uninstall(), true);
  assert.equal(result.state, "success");
  assert.deepEqual(guardedEffects, ["review.pull_request.create_draft"]);
  assert.equal(run.calls.some(({ executable, args }) => executable === "git" && args[0] === "push"), false);

  const drift = runner([
    ...initialChecks(), ok("[]"), ...scopeChecks(),
    ok(`${"b".repeat(40)}\trefs/heads/${plan().branchSlug}`),
  ]);
  const blocked = createOrUpdatePR(plan(), {
    run: drift,
    body: "Mission body",
    publicationRequestId: publication.requestId,
    loadJournal: publication.loadJournal,
    realpath: (value) => value,
  });
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.reason, "remote_branch_head_mismatch");
  assert.equal(drift.calls.some(({ executable, args }) => executable === "gh" && args[0] === "pr" && args[1] === "create"), false);
});

test("execution re-observes the unique canonical default and live base immediately before mutation", () => {
  const publication = publicationJournalFixture({
    schemaVersion: 9,
    missionId: "mission:final-publication-drift",
    subjectId: "issue:311",
    headRevisionId: head,
    baseRevisionId: base,
    branch: plan().branchSlug,
    authorizedPaths: [plan().missionBriefPath],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
    operation: "publish_mission_brief",
    targetRef: `github:repository:RanSolo/shield-workspace:branch:${plan().branchSlug}:base:main`,
    requestId: "request:final-publication:default-drift",
  });
  const observations = [
    [ok(JSON.stringify({ nameWithOwner: "RanSolo/shield-workspace", defaultBranchRef: { name: "release" } })), "default_branch_mismatch"],
    [defaultBranch(), "publication_target_mismatch", ok(`${"c".repeat(40)}\trefs/heads/main`)],
    [ok(JSON.stringify({ nameWithOwner: "RanSolo/other", defaultBranchRef: { name: "main" } })), "default_branch_lookup_mismatch"],
  ];
  for (const [canonical, reason, baseObservation] of observations) {
    const run = runner([
      ...initialChecks(), ok("[]"), ...scopeChecks(), ok(), canonical,
      ...(baseObservation ? [baseObservation] : []),
    ]);
    const guard = installFinalPublicationEffectGuard(publication.requestId, () => true);
    assert.equal(guard.state, "installed");
    const result = createOrUpdatePR(plan(), {
      run, body: "Mission body", publicationRequestId: publication.requestId,
      loadJournal: publication.loadJournal, realpath: (value) => value,
    });
    assert.equal(guard.uninstall(), true);
    assert.equal(result.state, "blocked");
    assert.equal(result.reason, reason);
    assert.equal(run.calls.some(({ executable, args }) => executable === "git" && args[0] === "push"), false);
  }
});

test("final publication claimant possession is checked separately before push and PR creation", () => {
  const publication = publicationJournalFixture({
    schemaVersion: 9,
    missionId: "mission:final-publication-guard",
    subjectId: "issue:311",
    headRevisionId: head,
    baseRevisionId: base,
    branch: plan().branchSlug,
    authorizedPaths: [plan().missionBriefPath],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
    operation: "publish_mission_brief",
    targetRef: `github:repository:RanSolo/shield-workspace:branch:${plan().branchSlug}:base:main`,
    requestId: "request:final-publication:guard-window",
  });

  const missing = runner([...initialChecks(), ok("[]"), ...scopeChecks(), ok(), ...mutationBaseChecks()]);
  const missingResult = createOrUpdatePR(plan(), {
    run: missing, body: "Mission body", publicationRequestId: publication.requestId,
    loadJournal: publication.loadJournal, realpath: (value) => value,
  });
  assert.equal(missingResult.reason, "final_publication_claimant_required");
  assert.equal(missing.calls.some(({ executable, args }) => executable === "git" && args[0] === "push"), false);

  const effects = [];
  const interrupted = runner([...initialChecks(), ok("[]"), ...scopeChecks(), ok(), ...mutationBaseChecks(), ok()]);
  const guard = installFinalPublicationEffectGuard(publication.requestId, (effect) => {
    effects.push(effect);
    return effects.length === 1;
  });
  assert.equal(guard.state, "installed");
  const result = createOrUpdatePR(plan(), {
    run: interrupted, body: "Mission body", publicationRequestId: publication.requestId,
    loadJournal: publication.loadJournal, realpath: (value) => value,
  });
  assert.equal(guard.uninstall(), true);
  assert.equal(result.reason, "final_publication_claimant_required");
  assert.deepEqual(effects, ["review.branch.push", "review.pull_request.create_draft"]);
  assert.equal(interrupted.calls.filter(({ executable, args }) => executable === "git" && args[0] === "push").length, 1);
  assert.equal(interrupted.calls.some(({ executable, args }) => executable === "gh" && args[0] === "pr" && args[1] === "create"), false);
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
