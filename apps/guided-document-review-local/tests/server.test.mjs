import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPreparedTrail, resolvePublicPath } from "../scripts/server.mjs";
import {
  compilePullRequestReview,
  createPullRequestReviewCheckpoints,
  renderPullRequestReviewMarkdown,
  sha256Text,
} from "@shield/guided-pr-review";

test("local server rejects traversal paths", () => {
  const root = "/tmp/document-trail/dist";
  assert.equal(resolvePublicPath(root, "/../package.json"), null);
  assert.equal(resolvePublicPath(root, "/%2e%2e/package.json"), null);
  assert.equal(resolvePublicPath(root, "/index.html"), `${root}/index.html`);
  assert.equal(resolvePublicPath(root, "/trails/mission-rail-v1"), `${root}/index.html`);
  assert.equal(resolvePublicPath(root, "/package.json"), null);
});

test("prepared trail manifest loads one closed local packet", async () => {
  const root = await mkdtemp(join(tmpdir(), "document-trail-packet-"));
  try {
    await writeFile(join(root, "document.md"), "# Prepared\n");
    await writeFile(join(root, "checkpoints.json"), "[]\n");
    await writeFile(join(root, "prepared.trail.json"), JSON.stringify({
      schemaVersion: 1,
      slug: "prepared",
      title: "Prepared trail",
      reviewerName: "Randy Russell",
      documentPath: "document.md",
      checkpointPath: "checkpoints.json",
    }));
    const packet = await loadPreparedTrail(root, "prepared");
    assert.equal(packet.documentText, "# Prepared\n");
    assert.deepEqual(packet.checkpoints, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepared PR trail binds projections to the packet and blocks a stale live head", async () => {
  const root = await mkdtemp(join(tmpdir(), "document-trail-bound-"));
  try {
    const head = "b".repeat(40);
    const packet = await compilePullRequestReview({
      schemaVersion: 1,
      repository: "example/repo",
      number: 13,
      title: "Deliver",
      body: "Evidence in the PR body.",
      url: "https://github.com/example/repo/pull/13",
      baseRevision: "a".repeat(40),
      headRevision: head,
      changedFiles: [{ path: "index.ts", additions: 1, deletions: 0, changeType: "ADDED" }],
      linkedIssues: [{ number: 12, title: "Issue", body: "- [ ] Works", url: "https://github.com/example/repo/issues/12", updatedAt: "2026-08-30T00:00:00Z" }],
      validations: [],
      observedAt: "2026-08-30T00:00:00Z",
    }, [{
      criterionId: "issue-12-ac-1",
      explanation: "The observed file is the bounded implementation.",
      anchors: [{ kind: "file", path: "index.ts" }],
      openGaps: [],
      reviewQuestion: "Does the file satisfy the criterion?",
    }]);
    const documentText = renderPullRequestReviewMarkdown(packet);
    const checkpointText = `${JSON.stringify(createPullRequestReviewCheckpoints(packet), null, 2)}\n`;
    const binding = { packetId: packet.packetId, packetDigest: packet.packetDigest, repository: "example/repo", pullRequestNumber: 13, headRevision: head };
    await writeFile(join(root, "prepared.md"), documentText);
    await writeFile(join(root, "prepared-checkpoints.json"), checkpointText);
    await writeFile(join(root, "prepared.packet.json"), `${JSON.stringify(packet)}\n`);
    await writeFile(join(root, "prepared.trail.json"), JSON.stringify({
      schemaVersion: 2,
      slug: "prepared",
      title: "Prepared trail",
      reviewerName: "Randy",
      documentPath: "prepared.md",
      checkpointPath: "prepared-checkpoints.json",
      packetPath: "prepared.packet.json",
      reviewBinding: binding,
      documentDigest: await sha256Text(documentText),
      checkpointDigest: await sha256Text(checkpointText),
    }));
    const loaded = await loadPreparedTrail(root, "prepared", { readLiveHead: async () => head });
    assert.deepEqual(loaded.reviewBinding, binding);
    await assert.rejects(
      () => loadPreparedTrail(root, "prepared", { readLiveHead: async () => "c".repeat(40) }),
      (error) => error.code === "STALE_PREPARED_REVIEW" && /stale/u.test(error.message),
    );
    await writeFile(join(root, "prepared.md"), `${documentText}tampered\n`);
    await assert.rejects(() => loadPreparedTrail(root, "prepared", { readLiveHead: async () => head }), /projection does not match/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Mission Rail learning steps use focused passages instead of heading-only anchors", async () => {
  const packetPath = new URL("../review-kits/mission-rail-v2-checkpoints.json", import.meta.url);
  const checkpoints = JSON.parse(await readFile(packetPath, "utf8"));
  const headingAnchors = checkpoints.flatMap((checkpoint) => checkpoint.learningSteps)
    .filter((step) => /^#{1,6}\s/u.test(step.sourceQuote));

  assert.deepEqual(headingAnchors, []);
});

test("trail header carries the complete learning promise inside the progress scene", async () => {
  const indexPath = new URL("../src/index.html", import.meta.url);
  const index = await readFile(indexPath, "utf8");
  const readAt = index.indexOf(">Read it<");
  const explainAt = index.indexOf(">Explain it<");
  const ownAt = index.indexOf(">Own it<");

  assert.ok(readAt >= 0);
  assert.ok(readAt < explainAt);
  assert.ok(explainAt < ownAt);
  assert.match(index, /trail-progress__stages/u);
});
