import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMissionTransitionPlanReviewV1,
  validateMissionTransitionPlanReviewV1,
  computeMissionTransitionPlanReviewDigestV1,
  computeMissionTransitionPlanReviewIdV1,
  MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION,
} from "../dist/mission-preparation-host-v1.mjs";

function transitionPlanReview(overrides = {}) {
  return {
    schemaVersion: 1,
    contractVersion: MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION,
    authority: "none",
    missionId: "mission:issue-270",
    subjectId: "github:RanSolo/shield-workspace/issue/270",
    repositoryId: "RanSolo/shield-workspace",
    planningBaseRevision: "a".repeat(40),
    parentPlanCommit: "b".repeat(40),
    parentPlanPath: "docs/missions/issue-270-turnkey-preparation-plan.md",
    parentPlanRawSha256: "c".repeat(64),
    transitionPlanId: `transition-plan:${"d".repeat(43)}`,
    transitionPlanDigest: `sha256:${"e".repeat(43)}`,
    verdict: "PASS",
    reviewerSeatId: "fury",
    reviewerRuntimeId: "runtime:issue-270",
    reviewerModelId: "model:issue-270",
    reviewerExecutorId: "executor:issue-270",
    reviewedArtifactId: `transition-plan:${"d".repeat(43)}`,
    reviewedArtifactRevision: `sha256:${"e".repeat(43)}`,
    ...overrides,
  };
}

function buildReview(overrides = {}) {
  const built = buildMissionTransitionPlanReviewV1(transitionPlanReview(overrides));
  assert.equal(built.state, "built");
  return built.review;
}

function assertMalformed(result) {
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "malformed_transition_plan_review_input");
}

test("compute helpers are deterministic for closed ordinary data ordering", () => {
  const normal = transitionPlanReview();
  const ordered = transitionPlanReview();
  const reversed = {};
  for (const key of Object.keys(ordered).reverse()) {
    // @ts-expect-error deliberate property re-ordering.
    reversed[key] = ordered[key];
  }

  const forwardDigest = computeMissionTransitionPlanReviewDigestV1(normal);
  const reversedDigest = computeMissionTransitionPlanReviewDigestV1(reversed);
  const buildDigest = computeMissionTransitionPlanReviewDigestV1(buildReview());
  const reviewIdFromDigest = computeMissionTransitionPlanReviewIdV1(buildDigest);

  assert.equal(forwardDigest, reversedDigest);
  assert.equal(forwardDigest, buildDigest);
  assert.equal(reviewIdFromDigest.startsWith("transition-plan-review:"), true);
});

test("build is deterministic, closed, and mutation-isolated", () => {
  const first = buildReview();
  const second = buildReview();
  assert.equal(first.reviewDigest, second.reviewDigest);
  assert.equal(first.reviewId, second.reviewId);

  const mutable = transitionPlanReview();
  const immutable = buildReview();
  mutable.missionId = "mission:tamper";
  assert.notEqual(immutable.missionId, mutable.missionId);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(immutable));
});

test("hostile objects are rejected as non-closed ordinary data", () => {
  assertMalformed(buildMissionTransitionPlanReviewV1({ ...transitionPlanReview(), extra: true }));
  assertMalformed(buildMissionTransitionPlanReviewV1(new Proxy(transitionPlanReview(), {})));
  assertMalformed(buildMissionTransitionPlanReviewV1(Object.assign(Object.create({ missionId: "mission:bad" }), transitionPlanReview())));

  const symbolized = transitionPlanReview();
  Object.defineProperty(symbolized, Symbol("fury"), { value: "bad", enumerable: true });
  assertMalformed(buildMissionTransitionPlanReviewV1(symbolized));

  const nonEnumerable = transitionPlanReview();
  Object.defineProperty(nonEnumerable, "subjectId", { value: "github:bad", enumerable: false });
  assertMalformed(buildMissionTransitionPlanReviewV1(nonEnumerable));

  const cyclic = transitionPlanReview();
  cyclic.self = cyclic;
  assertMalformed(buildMissionTransitionPlanReviewV1(cyclic));
});

test("accessors are never invoked during rejection", () => {
  let getterCalls = 0;
  const accessor = transitionPlanReview();
  Object.defineProperty(accessor, "missionId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "mission:accessor";
    },
  });

  const validateResult = validateMissionTransitionPlanReviewV1(accessor);
  assert.equal(validateResult.state, "invalid");
  assert.equal(getterCalls, 0);
});

test("identity tamper and deterministic helper recomputation are rejected", () => {
  const artifact = buildReview();

  const tamperedDigest = { ...artifact, reviewDigest: `sha256:${"0".repeat(43)}` };
  const digestResult = validateMissionTransitionPlanReviewV1(tamperedDigest);
  assert.equal(digestResult.state, "invalid");
  assert.equal(digestResult.errors.includes("mission.transition-plan-review-v1 reviewDigest is invalid."), true);

  const tamperedId = { ...artifact, reviewId: "transition-plan-review:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
  const idResult = validateMissionTransitionPlanReviewV1(tamperedId);
  assert.equal(idResult.state, "invalid");
  assert.equal(idResult.errors.includes("mission.transition-plan-review-v1 reviewId is invalid."), true);

  const artifactDigestByHelpers = computeMissionTransitionPlanReviewDigestV1(artifact);
  assert.equal(artifactDigestByHelpers, artifact.reviewDigest);
  assert.equal(computeMissionTransitionPlanReviewIdV1(artifactDigestByHelpers), artifact.reviewId);
});

test("binding fields and runtime/executor separation are enforced", () => {
  const runtimeExecutorSame = buildMissionTransitionPlanReviewV1(transitionPlanReview({ reviewerExecutorId: "runtime:issue-270" }));
  assert.equal(runtimeExecutorSame.state, "invalid");
  assert.equal(runtimeExecutorSame.errors.includes("reviewerRuntimeId_and_reviewerExecutorId_must_differ"), true);

  const artifact = buildReview();

  const badArtifact = validateMissionTransitionPlanReviewV1({ ...artifact, reviewedArtifactId: `transition-plan:${"f".repeat(43)}` });
  assert.equal(badArtifact.state, "invalid");
  assert.equal(badArtifact.errors.includes("reviewed_artifact_binding_id_mismatch"), true);

  const badArtifactRevision = validateMissionTransitionPlanReviewV1({ ...artifact, reviewedArtifactRevision: `sha256:${"g".repeat(43)}` });
  assert.equal(badArtifactRevision.state, "invalid");
  assert.equal(badArtifactRevision.errors.includes("reviewed_artifact_binding_revision_mismatch"), true);
});
