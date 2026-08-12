import assert from "node:assert/strict";
import test from "node:test";

import {
  createGitHubFollowUpCandidate,
  createGitHubHumanEvidenceCandidate,
  deliverGitHubCommunication,
  observeFeatureIntegrationCommitMethodProofV2,
  observeFeatureIntegrationPullRequestProofV2,
  observeFeatureIntegrationTargetProofV2,
} from "../public/github.mjs";
import { publicationJournalFixture } from "./fixtures/review-publication-journal.mjs";
import { resolveJournaledPublicationRequest } from "../github/publication-gate.mjs";
import {
  createProfileAwareCommunicationResultEntryV1,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";

const head = "0123456789012345678901234567890123456789";
const base = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const branchSlug = "codex/issue-28-github-host-adapter";
const missionBriefPath = "docs/missions/issue-28-v0.3-5-github-adapter.md";

function publicationFixture(operation = "publish_status", action = "comment", schemaVersion = 8) {
  const permittedEffects = action === "comment"
    ? ["review.comment.publish"]
    : ["review.branch.push", "review.pull_request.create_draft"];
  const targetRef = action === "comment"
    ? "github:pr:28"
    : `github:repository:RanSolo/shield-workspace` +
      `:branch:${branchSlug}:base:main`;
  return publicationJournalFixture({
    schemaVersion,
    missionId: "mission:fixture",
    subjectId: "issue:28",
    headRevisionId: head,
    baseRevisionId: base,
    branch: branchSlug,
    authorizedPaths: [missionBriefPath],
    permittedEffects,
    operation,
    targetRef,
  });
}

function publication(overrides = {}) {
  return {
    candidateId: "candidate:publication:1",
    sourceRef: "github:pr:28",
    capturedAt: { value: "2026-07-19T06:01:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    prNumber: 28,
    body: "Human-readable mission status for the exact revision.",
    proposedChangedPaths: [missionBriefPath],
    ...overrides,
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
const scopeChecks = () => [
  ok("/workspace/shield-workspace"), ok("git@github.com:RanSolo/shield-workspace.git"),
  ok(branchSlug), ok(head), ok(base), ok(), ok(`${missionBriefPath}\0`), ok(), ok(),
];
const prScopeChecks = () => [...scopeChecks(), ok(base)];

function v2Runner(responses) {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    return responses.shift() ?? { status: 1, stdout: "", stderr: "unexpected", errorCode: null };
  };
  run.calls = calls;
  return run;
}
const v2ok = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "", errorCode: null });

test("V2 GitHub proof adapters return closed PR, target, and squash ancestry observations", async () => {
  const source = "b".repeat(40), merged = "c".repeat(40), tree = "d".repeat(40);
  const run = v2Runner([
    v2ok({ number: 7, url: "https://github.com/x/y/pull/7", state: "MERGED", isDraft: true, headRefName: "agent/child", headRefOid: source,
      baseRefName: "feature/226", mergedAt: "2029-01-01T00:00:00Z", mergeCommit: { oid: merged }, statusCheckRollup: [{ name: "test", conclusion: "SUCCESS" }], commits: [{ oid: source }], mergeMethod: "squash" }),
    v2ok([{ number: 7 }]),
    v2ok({ ref: "refs/heads/feature/226", object: { type: "commit", sha: merged } }),
    v2ok({ sha: merged, tree: { sha: tree } }),
    v2ok({ sha: merged, tree: { sha: tree }, parents: [{ sha: head }] }),
  ]);
  const options = { run, cwd: "/workspace" };
  const pull = await observeFeatureIntegrationPullRequestProofV2({ repositoryId: "RanSolo/shield-workspace", pullRequestId: 7, challengeId: "challenge:proof" }, options);
  assert.equal(pull.state, "observed"); assert.equal(pull.observation.mergeMethod, "squash"); assert.equal(pull.observation.checkState, "successful");
  const target = await observeFeatureIntegrationTargetProofV2({ repositoryId: "RanSolo/shield-workspace", targetRef: "refs/heads/feature/226", challengeId: "challenge:proof" }, options);
  assert.equal(target.state, "observed"); assert.equal(target.observation.headRevision, merged); assert.match(target.observation.treeDigest, /^sha256:[0-9a-f]{64}$/u);
  const method = await observeFeatureIntegrationCommitMethodProofV2({ repositoryId: "RanSolo/shield-workspace", headRevision: merged, integrationMethod: "squash", pullRequestCommitHeads: [source], challengeId: "challenge:proof" }, options);
  assert.deepEqual(method.observation.resultingCommitParents, [head]); assert.deepEqual(method.observation.rebasedCommits, []);
  assert.equal(run.calls.every((call) => call.command === "gh" && call.options.cwd === "/workspace" && call.options.input === null), true);
});

test("V2 adapter failure precedence is stable and malformed I/O fails closed", async () => {
  const input = { repositoryId: "RanSolo/shield-workspace", pullRequestId: 7, challengeId: "challenge:proof" };
  const auth = await observeFeatureIntegrationPullRequestProofV2(input, { cwd: "/workspace", run: () => ({ status: 1, stdout: "rate limit", stderr: "authentication required", errorCode: null }) });
  assert.deepEqual(auth, { state: "blocked", reason: "authentication_failed" });
  const malformed = await observeFeatureIntegrationPullRequestProofV2(input, { cwd: "/workspace", run: () => ({ exitCode: 0, stdout: "{}", stderr: "" }) });
  assert.deepEqual(malformed, { state: "blocked", reason: "malformed_response" });
  let calls = 0;
  const extra = await observeFeatureIntegrationPullRequestProofV2({ ...input, extra: true }, { cwd: "/workspace", run: () => { calls += 1; return v2ok({}); } });
  assert.deepEqual(extra, { state: "blocked", reason: "adapter_unavailable" }); assert.equal(calls, 0);
});

test("GitHub performs no effect without an exact journaled request", () => {
  const run = runner([]);
  const result = deliverGitHubCommunication("request:missing", publication(), { run });
  assert.deepEqual(result, { state: "blocked", reason: "journal_loader_required", commands: [] });
  assert.equal(run.calls.length, 0);

  assert.deepEqual(
    deliverGitHubCommunication("request:missing", publication(), {
      run,
      loadJournal: () => [],
    }),
    { state: "blocked", reason: "journal_replay_failed", commands: [] },
  );
});

test("publication gate replays schema 8 and schema 9 while mixed journals fail closed in both directions", () => {
  const legacy = publicationFixture();
  const profileAware = publicationFixture("publish_status", "comment", 9);
  for (const fixture of [legacy, profileAware]) {
    const resolved = resolveJournaledPublicationRequest(fixture.requestId, { loadJournal: fixture.loadJournal });
    assert.equal(resolved.state, "allowed");
    assert.equal(resolved.request.requestId, fixture.request.requestId);
    assert.equal(resolved.request.state, "queued");
    assert.equal(resolved.request.publicationAuthorizationId, fixture.request.publicationAuthorizationId);
    assert.deepEqual(resolved.authority, fixture.authority);
    assert.deepEqual(resolved.usedCandidateIds, []);
    assert.equal(resolved.evaluatedThroughSequence, 3);
  }
  const mixedEightToNine = structuredClone(legacy.entries);
  mixedEightToNine.push({ ...profileAware.entries.at(-1), sequence: mixedEightToNine.length });
  const mixedNineToEight = structuredClone(profileAware.entries);
  mixedNineToEight.push({ ...legacy.entries.at(-1), sequence: mixedNineToEight.length });
  assert.equal(resolveJournaledPublicationRequest(legacy.requestId, { loadJournal: () => mixedEightToNine }).state, "blocked");
  assert.equal(resolveJournaledPublicationRequest(profileAware.requestId, { loadJournal: () => mixedNineToEight }).state, "blocked");
});

test("GitHub adapter consumes a real schema-9 queued publication request", () => {
  const fixture = publicationFixture("publish_status", "comment", 9);
  const run = runner([...scopeChecks(), ok("github:pr:28:comment:schema9")]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication({
      candidateId: "candidate:publication:schema9",
      capturedAt: { value: "2026-07-29T10:04:00Z", provenance: "hostTrusted" },
    }),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.outcome, "delivered");
  assert.equal(result.candidate.payload.requestId, fixture.requestId);
  const queued = replayProfileAwareMissionJournal(fixture.entries);
  assert.equal(queued.state, "valid");
  const entry = createProfileAwareCommunicationResultEntryV1({
    projection: queued.value,
    candidate: result.candidate,
  });
  const terminal = replayProfileAwareMissionJournal([...fixture.entries, entry]);
  assert.equal(terminal.state, "valid");
  assert.equal(terminal.value.communication.state, "delivered");
});

test("GitHub publishes human-readable status only at the requested exact head", () => {
  const fixture = publicationFixture();
  const run = runner([...scopeChecks(), ok("github:pr:28:comment:44")]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication(),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.outcome, "delivered");
  assert.equal(result.candidate.payload.receiptRef, "github:pr:28:comment:44");
  assert.equal(run.calls.at(-1).executable, "gh");
  assert.deepEqual(run.calls.at(-1).args.slice(0, 2), ["pr", "comment"]);
  assert.equal(run.calls.at(-1).options.input, publication().body);
});

test("GitHub comment publication exact-matches the journaled PR target", () => {
  const fixture = publicationFixture();
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication({ prNumber: 29 }),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_target_mismatch");
  assert.equal(run.calls.length, 0);
});

test("GitHub preflights exact result identity before any effect", () => {
  const fixture = publicationFixture();
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication({
      capturedAt: {
        value: "2026-07-19T06:01Z",
        provenance: "hostTrusted",
      },
    }),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_identity_required");
  assert.equal(run.calls.length, 0);
});

test("GitHub rejects stateful publication identity before any effect", () => {
  const fixture = publicationFixture();
  const stateful = publication();
  let reads = 0;
  Object.defineProperty(stateful, "candidateId", {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? "candidate:publication:1" : "candidate:publication:changed";
    },
  });
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    stateful,
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_identity_required");
  assert.equal(reads, 0);
  assert.equal(run.calls.length, 0);
});

test("GitHub rejects stateful effect inputs before any effect", () => {
  const fixture = publicationFixture();
  const stateful = publication();
  let reads = 0;
  Object.defineProperty(stateful, "prNumber", {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? 28 : 29;
    },
  });
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    stateful,
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_input_required");
  assert.equal(reads, 0);
  assert.equal(run.calls.length, 0);
});

test("GitHub rejects a stateful mission workspace plan before any effect", () => {
  const fixture = publicationFixture("publish_mission_brief", "create");
  const workspacePlan = {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug,
    missionBriefPath,
    prTitle: "feat: add GitHub host adapter",
  };
  let reads = 0;
  Object.defineProperty(workspacePlan, "branchSlug", {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? branchSlug : "codex/changed";
    },
  });
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication({ workspacePlan }),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_input_required");
  assert.equal(reads, 0);
  assert.equal(run.calls.length, 0);
});

test("GitHub rejects coercible mission workspace values before any effect", () => {
  const fixture = publicationFixture("publish_mission_brief", "create");
  let coercions = 0;
  const repositoryOwner = {
    [Symbol.toPrimitive]() {
      coercions += 1;
      return coercions === 1 ? "RanSolo" : "Other";
    },
  };
  const workspacePlan = {
    repositoryOwner,
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug,
    missionBriefPath,
    prTitle: "feat: add GitHub host adapter",
  };
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication({ workspacePlan }),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_input_required");
  assert.equal(coercions, 0);
  assert.equal(run.calls.length, 0);
});

test("mission brief publication delegates to the existing draft PR workspace", () => {
  const fixture = publicationFixture("publish_mission_brief", "create");
  const workspacePlan = {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug,
    missionBriefPath,
    prTitle: "feat: add GitHub host adapter",
  };
  const pr = {
    number: 28,
    title: workspacePlan.prTitle,
    url: "https://github.com/RanSolo/shield-workspace/pull/28",
    isDraft: true,
    state: "OPEN",
    headRefName: branchSlug,
    headRefOid: head,
    baseRefName: "main",
  };
  const run = runner([
    ok(branchSlug),
    ok(),
    ok(workspacePlan.missionBriefPath),
    ok(head),
    ok(head),
    ok("[]"),
    ...prScopeChecks(),
    ok(),
    ok(pr.url),
    ok(JSON.stringify([pr])),
  ]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    { ...publication(), workspacePlan },
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.outcome, "delivered");
  assert.equal(result.candidate.payload.receiptRef, pr.url);
  assert.ok(run.calls.some(({ executable, args }) => executable === "gh" && args[0] === "pr" && args[1] === "create"));
});

test("post-effect PR readback failure produces journal-ready failure evidence", () => {
  const fixture = publicationFixture("publish_mission_brief", "create");
  const workspacePlan = {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug,
    missionBriefPath,
    prTitle: "feat: add GitHub host adapter",
  };
  const run = runner([
    ok(branchSlug),
    ok(),
    ok(workspacePlan.missionBriefPath),
    ok(head),
    ok(head),
    ok("[]"),
    ...prScopeChecks(),
    ok(),
    ok("https://github.com/RanSolo/shield-workspace/pull/28"),
    { exitCode: 1, stdout: "", stderr: "readback unavailable" },
  ]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    { ...publication(), workspacePlan },
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.outcome, "failed");
  assert.equal(result.candidate.payload.failureReason, "host_rejected");
  assert.equal(result.candidate.payload.scopeDigest.startsWith("sha256:"), true);
});

test("GitHub reports stale and unavailable delivery without fabricating evidence", () => {
  const fixture = publicationFixture();
  const staleRun = runner([
    ok("/workspace/shield-workspace"),
    ok("git@github.com:RanSolo/shield-workspace.git"),
    ok(branchSlug),
    ok("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    ok(base),
    ok(),
    ok(`${missionBriefPath}\0`),
    ok(),
    ok(),
  ]);
  const stale = deliverGitHubCommunication(
    fixture.requestId,
    publication(),
    { run: staleRun, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(stale.state, "blocked");
  assert.equal(stale.reason, "binding_mismatch");

  const unavailableRun = runner([
    ...scopeChecks(),
    { exitCode: 1, stdout: "", stderr: "not logged into GitHub" },
  ]);
  const unavailable = deliverGitHubCommunication(
    fixture.requestId,
    publication(),
    { run: unavailableRun, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(unavailable.state, "candidate");
  assert.equal(unavailable.candidate.payload.outcome, "failed");
  assert.equal(unavailable.candidate.payload.failureReason, "authentication_failed");
});

test("GitHub review input remains a candidate and cannot assign authority", () => {
  const evidence = {
    payload: {
      evidenceId: "evidence:fitz:3",
      missionId: "mission:fixture",
      subjectId: "issue:28",
      revisionId: "sha256:mission-revision",
      humanPrincipalId: "human:fitz",
      bindingId: "binding:fitz",
      sourceRef: "github:pr:28:review:3",
    },
    signatureBase64: "signed",
  };
  const result = createGitHubHumanEvidenceCandidate({
    candidateId: "evidence:fitz:3",
    missionId: "mission:fixture",
    subjectId: "issue:28",
    revisionId: "sha256:mission-revision",
    humanPrincipalId: "human:fitz",
    bindingId: "binding:fitz",
    sourceRef: "github:pr:28:review:3",
    capturedAt: { value: "2026-07-19T06:02:00Z", provenance: "hostTrusted" },
    evidence,
  });
  assert.equal(result.state, "candidate");
  assert.equal(Object.hasOwn(result.candidate, "decision"), false);
  assert.equal(Object.hasOwn(result.candidate, "readiness"), false);
});

test("GitHub Follow-up Mode records awaiting-review state at the exact PR head", () => {
  const result = createGitHubFollowUpCandidate({
    candidateId: "candidate:follow-up:awaiting",
    missionId: "mission:fixture",
    subjectId: "issue:71",
    revisionId: head,
    sourceRef: "github:pr:71",
    capturedAt: { value: "2026-07-19T06:02:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-71-follow-up-mode",
    prNumber: 71,
    headRefOid: head,
    reviewSourceRefs: [],
    findings: [],
  });
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.candidateKind, "follow_up_snapshot");
  assert.equal(result.candidate.payload.lifecycleState, "awaiting_review");
  assert.equal(result.candidate.payload.headRefOid, head);
  assert.equal(result.candidate.humanPrincipalId, null);
  assert.equal(result.candidate.bindingId, null);
});

test("GitHub Follow-up Mode classifies unresolved findings for the owning seat", () => {
  const result = createGitHubFollowUpCandidate({
    candidateId: "candidate:follow-up:required",
    missionId: "mission:fixture",
    subjectId: "issue:71",
    revisionId: head,
    sourceRef: "github:pr:71",
    capturedAt: { value: "2026-07-19T06:03:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-71-follow-up-mode",
    prNumber: 71,
    headRefOid: head,
    reviewSourceRefs: ["github:pr:71:review:9", "github:pr:71:check:lint"],
    findings: [
      {
        findingId: "finding:implementation:1",
        sourceKind: "review_comment",
        sourceRef: "github:pr:71:comment:100",
        headRefOid: head,
        classification: "implementation",
        blocking: true,
        summary: "May must repair the implementation without broadening scope.",
      },
      {
        findingId: "finding:architecture:1",
        sourceKind: "review",
        sourceRef: "github:pr:71:review:9",
        headRefOid: head,
        classification: "architecture_conformance",
        blocking: true,
        summary: "Fury must re-check conformance because the authority boundary changed.",
      },
      {
        findingId: "finding:evidence:1",
        sourceKind: "check_run",
        sourceRef: "github:pr:71:check:lint",
        headRefOid: head,
        classification: "evidence",
        blocking: false,
        summary: "Daisy should collect missing validation evidence.",
      },
    ],
  });
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.lifecycleState, "follow_up_required");
  assert.deepEqual(
    result.candidate.payload.findings.map((finding) => [
      finding.findingId,
      finding.routeToSeatId,
      finding.requiresFuryFollowUp,
    ]),
    [
      ["finding:implementation:1", "may", false],
      ["finding:architecture:1", "fury", true],
      ["finding:evidence:1", "daisy", false],
    ],
  );
  assert.deepEqual(result.candidate.payload.replyRequirements, {
    concise: true,
    includeResolution: true,
    includeValidation: true,
    includeUnresolved: true,
  });
});

test("GitHub Follow-up Mode fails closed on stale or malformed review snapshots", () => {
  const stale = createGitHubFollowUpCandidate({
    candidateId: "candidate:follow-up:stale",
    missionId: "mission:fixture",
    subjectId: "issue:71",
    revisionId: head,
    sourceRef: "github:pr:71",
    capturedAt: { value: "2026-07-19T06:04:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-71-follow-up-mode",
    prNumber: 71,
    headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    reviewSourceRefs: [],
    findings: [],
  });
  assert.deepEqual(stale, { state: "blocked", reason: "follow_up_head_mismatch", commands: [] });

  const malformed = createGitHubFollowUpCandidate({
    candidateId: "candidate:follow-up:bad",
    missionId: "mission:fixture",
    subjectId: "issue:71",
    revisionId: head,
    sourceRef: "github:pr:71",
    capturedAt: { value: "2026-07-19T06:04:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-71-follow-up-mode",
    prNumber: 71,
    headRefOid: head,
    reviewSourceRefs: [],
    findings: [{
      findingId: "finding:bad",
      sourceKind: "review_comment",
      sourceRef: "github:pr:71:comment:bad",
      headRefOid: head,
      classification: "implementation",
      blocking: true,
      summary: "Missing no fields except this object has an unexpected owner.",
      routeToSeatId: "fury",
    }],
  });
  assert.equal(malformed.state, "blocked");
  assert.equal(malformed.reason, "follow_up_finding_malformed");
});
