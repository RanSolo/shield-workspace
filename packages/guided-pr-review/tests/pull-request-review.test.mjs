import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptanceCriteriaFromIssue,
  compareReviewRevision,
  compilePullRequestReview,
  createPullRequestReviewCheckpoints,
  renderPullRequestReviewMarkdown,
} from "../dist/index.js";

const issue = {
  number: 12, title: "A bounded change",
  body: "## Acceptance criteria\n\n- [ ] Builds cleanly.\n- [x] Explains the result.\n",
  url: "https://github.test/example/repo/issues/12", updatedAt: "2026-08-30T00:00:00Z",
};
const snapshot = {
  schemaVersion: 1, repository: "example/repo", number: 13, title: "Deliver the change",
  body: "Closes #12", url: "https://github.test/example/repo/pull/13",
  baseRevision: "a".repeat(40), headRevision: "b".repeat(40),
  changedFiles: [{ path: "packages/example/src/index.ts", additions: 4, deletions: 1, changeType: "MODIFIED" }],
  linkedIssues: [issue],
  validations: [{
    validationId: "checks", name: "Focused Nx", status: "passed", conclusion: "success", details: null,
    verification: "github_check", revisionBinding: "observed_pr_head", headRevision: "b".repeat(40),
  }],
  observedAt: "2026-08-30T00:01:00Z",
};
const unavailable = (reason) => ({ state: "unavailable", reason });
const available = (anchors) => ({ state: "available", anchors });
const coverage = [
  {
    criterionId: "issue-12-ac-1", explanation: "The package exposes the bounded change.",
    evidence: {
      commitment: available([{ kind: "pull_request", field: "head_revision" }]),
      changedFileOrDiff: available([{ kind: "file", path: "packages/example/src/index.ts" }]),
      reportedValidation: available([{ kind: "validation", validationId: "checks" }]),
      openGap: { state: "available", items: [] },
    },
    reviewQuestion: "Does the implementation build cleanly?",
  },
  {
    criterionId: "issue-12-ac-2", explanation: "The PR body explains the result.",
    evidence: {
      commitment: available([{ kind: "pr_body", excerpt: "Closes #12" }]),
      changedFileOrDiff: unavailable("No changed file directly proves prose quality."),
      reportedValidation: unavailable("No revision-bound validation reports prose quality."),
      openGap: { state: "available", items: ["Human review is still required."] },
    },
    reviewQuestion: "Is the explanation sufficient?",
  },
];

test("extracts ordered acceptance criteria from issue checkboxes", () => {
  assert.deepEqual(acceptanceCriteriaFromIssue(issue).map(({ criterionId, text }) => ({ criterionId, text })), [
    { criterionId: "issue-12-ac-1", text: "Builds cleanly." },
    { criterionId: "issue-12-ac-2", text: "Explains the result." },
  ]);
});

test("compiles exact-revision canonical slots and Document Trail projection", async () => {
  const packet = await compilePullRequestReview(snapshot, coverage);
  assert.match(packet.packetDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(packet.criteria[0].evidence.reportedValidation.anchors[0].provenance.headRevision, "b".repeat(40));
  const markdown = renderPullRequestReviewMarkdown(packet);
  for (const heading of ["Commitment", "Changed-file / diff evidence", "Reported validation", "Open gaps"]) assert.match(markdown, new RegExp(heading, "u"));
  assert.equal(createPullRequestReviewCheckpoints(packet).length, 2);
  assert.deepEqual(createPullRequestReviewCheckpoints(packet)[0].dispositionOptions, ["pass", "question", "needs_qa", "revise"]);
  assert.deepEqual(compareReviewRevision(packet, "b".repeat(40)), { state: "current" });
  assert.equal(compareReviewRevision(packet, "c".repeat(40)).state, "stale");
});

test("rejects missing canonical slots, unchanged files, and revision-unbound validation", async () => {
  await assert.rejects(() => compilePullRequestReview(snapshot, coverage.slice(0, 1)), /Missing coverage/u);
  await assert.rejects(() => compilePullRequestReview(snapshot, [
    { ...coverage[0], evidence: { ...coverage[0].evidence, commitment: undefined } }, coverage[1],
  ]), /unavailable reason/u);
  await assert.rejects(() => compilePullRequestReview(snapshot, [
    { ...coverage[0], evidence: { ...coverage[0].evidence, changedFileOrDiff: available([{ kind: "file", path: "not-changed.ts" }]) } }, coverage[1],
  ]), /unchanged file/u);
  const unbound = { ...snapshot, validations: [{ ...snapshot.validations[0], verification: "unverified", revisionBinding: "none", headRevision: null }] };
  await assert.rejects(() => compilePullRequestReview(unbound, coverage), /revision-unbound/u);
});

test("packet identity excludes observation time and typed unavailable slots carry reasons", async () => {
  const later = await compilePullRequestReview({ ...snapshot, observedAt: "2026-08-30T00:09:00Z" }, coverage);
  const packet = await compilePullRequestReview(snapshot, coverage);
  assert.equal(packet.packetDigest, later.packetDigest);
  assert.deepEqual(packet.criteria[1].evidence.changedFileOrDiff, {
    state: "unavailable", reason: "No changed file directly proves prose quality.",
  });
});
