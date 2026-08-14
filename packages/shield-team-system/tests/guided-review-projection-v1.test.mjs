import assert from "node:assert/strict";
import test from "node:test";

import {
  createGuidedReviewProjectionV1,
  validateGuidedReviewProjectionV1,
} from "../dist/guided-review-projection-v1.mjs";
import { projectCurrentGuidedReviewStepHostV1 } from "../dist/guided-review-projection-host-v1.mjs";

const digest = (character) => `sha256:${character.repeat(43)}`;

function input() {
  return {
    schemaVersion: 1,
    contractVersion: "guided.review.projection.v1",
    authority: "none",
    durability: "ephemeral",
    missionId: "mission:issue-304",
    repositoryId: "RanSolo/shield-workspace",
    canonicalRoot: "/workspace/shield-workspace",
    branch: "agent/guided-review-238",
    planningBaseRevision: "1".repeat(40),
    reviewBaseRevision: "2".repeat(40),
    exactRevision: "3".repeat(40),
    requestId: "guided-review-route-request:request",
    requestDigest: digest("a"),
    compiledRouteDigest: digest("b"),
    overlayId: "overlay:issue-304",
    overlayDigest: digest("c"),
    playbookDigest: digest("d"),
    sessionId: "guided-review-session:issue-304",
    sessionDigest: digest("e"),
    stageId: "stage:behavior",
    checkpointId: "checkpoint:behavior",
    stepId: "step:behavior",
    behaviorGroups: [{
      behaviorGroupId: "inspection:behavior",
      title: "Behavior change",
      instructions: ["Inspect the exact local diff."],
      rationale: "Review the behavior selected by Fury.",
      targets: [{
        targetType: "local_diff",
        relativePath: "src/behavior.mts",
        oldRange: { start: 10, lines: 2 },
        newRange: { start: 10, lines: 3 },
        excerpts: { before: ["old behavior"], focus: ["new behavior"], after: ["return value;"] },
        navigation: { executor: "git", argv: ["diff", "--no-ext-diff", "--no-renames", "--unified=3", "2".repeat(40), "3".repeat(40), "--", ":(top,literal)src/behavior.mts"] },
      }],
    }],
  };
}

test("projection creation is deterministic, normalized, closed, and non-authoritative", () => {
  const first = createGuidedReviewProjectionV1(input());
  const second = createGuidedReviewProjectionV1(input());
  assert.equal(first.state, "ready");
  assert.deepEqual(second, first);
  assert.equal(first.value.authority, "none");
  assert.equal(first.value.durability, "ephemeral");
  assert.match(first.value.projectionDigest, /^sha256:[A-Za-z0-9_-]{43}$/u);
  assert.equal(validateGuidedReviewProjectionV1(first.value).state, "ready");
  assert.ok(Object.isFrozen(first.value));
});

test("projection rejects open, hostile, shell-shaped, and cross-bound targets", () => {
  for (const hostile of [
    { ...input(), extra: true },
    { ...input(), authority: "review" },
    { ...input(), behaviorGroups: [{ ...input().behaviorGroups[0], targets: [{ ...input().behaviorGroups[0].targets[0], relativePath: "../escape" }] }] },
    { ...input(), behaviorGroups: [{ ...input().behaviorGroups[0], targets: [{ ...input().behaviorGroups[0].targets[0], navigation: { executor: "sh", argv: ["git diff"] } }] }] },
  ]) assert.equal(createGuidedReviewProjectionV1(hostile).state, "invalid");
});

test("projection host surface is explicit and asynchronous", () => {
  assert.equal(typeof projectCurrentGuidedReviewStepHostV1, "function");
  assert.equal(projectCurrentGuidedReviewStepHostV1.constructor.name, "AsyncFunction");
});
