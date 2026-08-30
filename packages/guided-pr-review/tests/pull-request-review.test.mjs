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
  number: 12,
  title: "A bounded change",
  body: "## Acceptance criteria\n\n- [ ] Builds cleanly.\n- [x] Explains the result.\n",
  url: "https://github.test/example/repo/issues/12",
  updatedAt: "2026-08-30T00:00:00Z",
};
const snapshot = {
  schemaVersion: 1,
  repository: "example/repo",
  number: 13,
  title: "Deliver the change",
  body: "Closes #12",
  url: "https://github.test/example/repo/pull/13",
  baseRevision: "a".repeat(40),
  headRevision: "b".repeat(40),
  changedFiles: [{ path: "packages/example/src/index.ts", additions: 4, deletions: 1, changeType: "MODIFIED" }],
  linkedIssues: [issue],
  validations: [{ validationId: "checks", name: "Focused Nx", status: "passed", conclusion: "success", details: null, headRevision: "b".repeat(40) }],
  observedAt: "2026-08-30T00:01:00Z",
};
const coverage = [
  {
    criterionId: "issue-12-ac-1",
    explanation: "The package exposes the bounded change.",
    anchors: [
      { kind: "file", path: "packages/example/src/index.ts" },
      { kind: "validation", validationId: "checks" },
    ],
    openGaps: [],
    reviewQuestion: "Does the implementation build cleanly?",
  },
  {
    criterionId: "issue-12-ac-2",
    explanation: "The PR body explains the result.",
    anchors: [{ kind: "pr_body", excerpt: "Closes #12" }],
    openGaps: ["Human review is still required."],
    reviewQuestion: "Is the explanation sufficient?",
  },
];

test("extracts ordered acceptance criteria from issue checkboxes", () => {
  assert.deepEqual(acceptanceCriteriaFromIssue(issue).map(({ criterionId, text }) => ({ criterionId, text })), [
    { criterionId: "issue-12-ac-1", text: "Builds cleanly." },
    { criterionId: "issue-12-ac-2", text: "Explains the result." },
  ]);
});

test("compiles an exact-revision packet and Document Trail projection", async () => {
  const packet = await compilePullRequestReview(snapshot, coverage);
  assert.match(packet.packetDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(packet.pullRequest.headRevision, "b".repeat(40));
  const markdown = renderPullRequestReviewMarkdown(packet);
  assert.match(markdown, /Acceptance criterion 1: Builds cleanly\./u);
  assert.equal(createPullRequestReviewCheckpoints(packet).length, 2);
  assert.deepEqual(createPullRequestReviewCheckpoints(packet)[0].dispositionOptions, ["pass", "question", "needs_qa", "revise"]);
  assert.equal(packet.criteria[0].anchors[1].provenance.headRevision, "b".repeat(40));
  assert.deepEqual(compareReviewRevision(packet, "b".repeat(40)), { state: "current" });
  assert.equal(compareReviewRevision(packet, "c".repeat(40)).state, "stale");
});

test("rejects missing coverage and file claims outside the observed diff", async () => {
  await assert.rejects(() => compilePullRequestReview(snapshot, coverage.slice(0, 1)), /Missing coverage/u);
  await assert.rejects(() => compilePullRequestReview(snapshot, [
    { ...coverage[0], anchors: [{ kind: "file", path: "not-changed.ts" }] },
    coverage[1],
  ]), /unchanged file/u);
});

test("packet identity excludes observation time but rejects unsupported free-form evidence", async () => {
  const later = await compilePullRequestReview({ ...snapshot, observedAt: "2026-08-30T00:09:00Z" }, coverage);
  const packet = await compilePullRequestReview(snapshot, coverage);
  assert.equal(packet.packetDigest, later.packetDigest);
  await assert.rejects(() => compilePullRequestReview(snapshot, [
    { ...coverage[0], anchors: [{ kind: "pr_body", excerpt: "#436 and #437" }] },
    coverage[1],
  ]), /PR-body text not present/u);
  await assert.rejects(() => compilePullRequestReview(snapshot, [
    { ...coverage[0], anchors: [{ kind: "issue", issueNumber: 436, field: "body" }] },
    coverage[1],
  ]), /not observed as linked/u);
});
