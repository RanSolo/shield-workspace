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
  observedAt: "2026-08-30T00:01:00Z",
};
const coverage = [
  {
    criterionId: "issue-12-ac-1",
    summary: "The package exposes the bounded change.",
    filePaths: ["packages/example/src/index.ts"],
    evidence: ["Focused Nx build passed."],
    reportedValidation: "Focused Nx build passed.",
    openGaps: [],
    reviewQuestion: "Does the implementation build cleanly?",
  },
  {
    criterionId: "issue-12-ac-2",
    summary: "The PR body explains the result.",
    filePaths: [],
    evidence: ["PR body contains the delivery explanation."],
    reportedValidation: "No executable validation applies to PR prose.",
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
  assert.deepEqual(compareReviewRevision(packet, "b".repeat(40)), { state: "current" });
  assert.equal(compareReviewRevision(packet, "c".repeat(40)).state, "stale");
});

test("rejects missing coverage and file claims outside the observed diff", async () => {
  await assert.rejects(() => compilePullRequestReview(snapshot, coverage.slice(0, 1)), /Missing coverage/u);
  await assert.rejects(() => compilePullRequestReview(snapshot, [
    { ...coverage[0], filePaths: ["not-changed.ts"] },
    coverage[1],
  ]), /unchanged file/u);
});
