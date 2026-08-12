import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCanonicalContractDigestV1,
  computeContentIdV1,
} from "@shield/mission-preparation";
import {
  MISSION_REVIEWED_TRANSITION_GRAPH_ID_PREFIX,
  MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID,
  MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_VERSION,
  buildMissionReviewedTransitionGraphV1,
  computeMissionReviewedTransitionGraphDigestV1,
  computeMissionReviewedTransitionGraphIdV1,
  validateMissionReviewedTransitionGraphV1,
} from "../dist/mission-preparation-store-v1.mjs";

const EXCLUSIONS = ["review.comment.publish", "review.pull_request.update_draft", "review.pull_request.mark_ready", "merge", "deployment", "release", "final_acceptance"];

function contract(value, schemaId) {
  const artifact = {
    schemaId,
    authority: "none",
    ...value,
  };
  const digestResult = computeCanonicalContractDigestV1({ schemaId, body: artifact });
  assert.equal(digestResult.state, "valid");
  const idResult = computeContentIdV1({ schemaId, digest: digestResult.value });
  assert.equal(idResult.state, "valid");
  return {
    schemaId,
    authority: "none",
    ...value,
    id: idResult.value,
    digest: digestResult.value,
  };
}

function transitionPlan(overrides = {}) {
  return contract({
    missionId: "mission:issue-270",
    subjectId: "issue:270",
    repositoryId: "RanSolo/shield-workspace",
    planningBaseRevision: "1111111111111111111111111111111111111111",
    parentPlanCommit: "2222222222222222222222222222222222222222",
    parentPlanPath: "missions/issue-270/plan.json",
    parentPlanRawSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    transitionKind: "fresh_authorize_wheels_up",
    boundedOutcome: "Authorize wheels up transition for issue 270.",
    approvedRelativePaths: ["src/mission.ts"],
    publicationPaths: ["docs/issue-270.md"],
    approvedActionIds: ["action:issue-270"],
    approvedEffectClasses: ["behavioral_implementation"],
    approvedEffectKeys: ["effect:issue-270"],
    approvedCapabilities: ["capability:issue-270"],
    validationCommandIds: ["validation:issue-270"],
    modelId: "model:issue-270",
    reasoningRuntimeId: "runtime:issue-270",
    toolExecutorId: "executor:issue-270",
    exclusions: EXCLUSIONS,
    ...overrides,
  }, "mission.transition-plan.v1");
}

function parentPlanReviewEvidence(plan, overrides = {}) {
  return contract({
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    parentPlanCommit: plan.parentPlanCommit,
    parentPlanPath: plan.parentPlanPath,
    parentPlanRawSha256: plan.parentPlanRawSha256,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    verdict: "PASS",
    reviewerSeatId: "fury",
    reviewerRuntimeId: "runtime:reviewer-270-a",
    reviewerModelId: "model:reviewer-270",
    reviewerExecutorId: "executor:reviewer-270",
    rawReceiptSetSha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    attributionClass: "team_system_projection",
    preparationEligibility: "preparationEligible",
    ...overrides,
  }, "mission.parent-plan-review-evidence.v1");
}

function transitionIntent(plan, review, overrides = {}) {
  return contract({
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    parentReviewEvidenceId: review.id,
    parentReviewEvidenceDigest: review.digest,
    transitionKind: "fresh_authorize_wheels_up",
    preparationEligibility: "preparationEligible",
    ...overrides,
  }, "mission.transition-intent.v1");
}

function graphInput() {
  const transition = transitionPlan();
  const review = parentPlanReviewEvidence(transition);
  return {
    transitionPlan: transition,
    parentPlanReviewEvidence: review,
    transitionIntent: transitionIntent(transition, review),
  };
}

test("build and validate mission reviewed transition graph snapshots are frozen and deterministic", () => {
  const input = graphInput();
  const built = buildMissionReviewedTransitionGraphV1(input);
  assert.equal(built.state, "built");

  const expectedDigest = computeMissionReviewedTransitionGraphDigestV1({
    schemaVersion: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_VERSION,
    schemaId: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID,
    authority: "none",
    transitionPlan: input.transitionPlan,
    parentPlanReviewEvidence: input.parentPlanReviewEvidence,
    transitionIntent: input.transitionIntent,
  });
  assert.equal(built.graph.graphDigest, expectedDigest);
  assert.equal(built.graph.graphId, computeMissionReviewedTransitionGraphIdV1(expectedDigest));
  assert.equal(built.graph.graphId.startsWith(MISSION_REVIEWED_TRANSITION_GRAPH_ID_PREFIX), true);

  assert.ok(Object.isFrozen(built.graph));
  assert.ok(Object.isFrozen(built.graph.transitionPlan));
  assert.ok(Object.isFrozen(built.graph.parentPlanReviewEvidence));
  assert.ok(Object.isFrozen(built.graph.transitionIntent));

  input.transitionPlan.subjectId = "issue:mutated";
  assert.equal(built.graph.transitionPlan.subjectId, "issue:270");

  const validated = validateMissionReviewedTransitionGraphV1(built.graph);
  assert.equal(validated.state, "valid");
  assert.deepEqual(validated.value, built.graph);
  assert.ok(Object.isFrozen(validated.value));
});

test("build rejects hostile graph input and never evaluates malicious accessors", () => {
  const accessorInput = graphInput();
  let getterCalls = 0;
  Object.defineProperty(accessorInput, "transitionPlan", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return graphInput().transitionPlan;
    },
  });
  assert.equal(buildMissionReviewedTransitionGraphV1(accessorInput).code, "malformed_reviewed_transition_graph_input");
  assert.equal(getterCalls, 0);

  assert.equal(buildMissionReviewedTransitionGraphV1({ ...graphInput(), extra: true }).code, "malformed_reviewed_transition_graph_input");
  assert.equal(buildMissionReviewedTransitionGraphV1(new Proxy(graphInput(), {})).code, "malformed_reviewed_transition_graph_input");

  const valid = buildMissionReviewedTransitionGraphV1(graphInput());
  assert.equal(valid.state, "built");
  const candidate = {
    ...valid.graph,
    transitionPlan: transitionPlan({ missionId: "issue:tamper" }),
  };
  assert.equal(validateMissionReviewedTransitionGraphV1(candidate).state, "invalid");
  assert.equal(candidate.transitionPlan.missionId, "issue:tamper");
  assert.equal(validateMissionReviewedTransitionGraphV1(candidate).errors.includes("transition_plan_and_intent_identity_mismatch"), true);

  let validateGetterCalls = 0;
  const validateInput = {
    ...valid.graph,
    transitionIntent: {
      ...valid.graph.transitionIntent,
    },
  };
  Object.defineProperty(validateInput.transitionIntent, "parentReviewEvidenceId", {
    enumerable: true,
    get() {
      validateGetterCalls += 1;
      return valid.graph.transitionIntent.parentReviewEvidenceId;
    },
  });
  assert.equal(validateMissionReviewedTransitionGraphV1(validateInput).state, "invalid");
  assert.equal(validateGetterCalls, 0);
});

test("cross-binding mismatch is rejected before any identity trust is recomputed", () => {
  const wrongIntent = graphInput();
  const alternatePlan = transitionPlan({ missionId: "mission:other-270" });
  const alternateReview = parentPlanReviewEvidence(alternatePlan);
  wrongIntent.transitionIntent = transitionIntent(alternatePlan, alternateReview);
  const badIntent = buildMissionReviewedTransitionGraphV1(wrongIntent);
  assert.equal(badIntent.state, "invalid");
  assert.equal(badIntent.errors.includes("transition_plan_and_intent_identity_mismatch"), true);

  const wrongReview = graphInput();
  wrongReview.parentPlanReviewEvidence = parentPlanReviewEvidence(wrongReview.transitionPlan, {
    transitionPlanDigest: `sha256:${"c".repeat(43)}`,
  });
  const badReview = buildMissionReviewedTransitionGraphV1(wrongReview);
  assert.equal(badReview.state, "invalid");
  assert.equal(badReview.errors.includes("parent_review_transition_plan_reference_mismatch"), true);

  const wrongOutcome = graphInput();
  wrongOutcome.parentPlanReviewEvidence = parentPlanReviewEvidence(wrongOutcome.transitionPlan, {
    verdict: "PASS_WITH_REQUIRED_CHANGES",
  });
  wrongOutcome.transitionIntent = transitionIntent(wrongOutcome.transitionPlan, wrongOutcome.parentPlanReviewEvidence);
  const badOutcome = buildMissionReviewedTransitionGraphV1(wrongOutcome);
  assert.equal(badOutcome.state, "invalid");
  assert.equal(badOutcome.errors.includes("parent_review_projection_mismatch"), true);
});

test("validation rejects stale or corrupted graph identity and identity tamper", () => {
  const built = buildMissionReviewedTransitionGraphV1(graphInput());
  assert.equal(built.state, "built");
  const graph = built.graph;

  const badDigest = validateMissionReviewedTransitionGraphV1({
    ...graph,
    graphDigest: `${graph.graphDigest.slice(0, -1)}a`,
  });
  assert.equal(badDigest.state, "invalid");
  assert.equal(badDigest.errors.includes("Mission reviewed transition graph digest is invalid."), true);

  const badId = validateMissionReviewedTransitionGraphV1({
    ...graph,
    graphId: `${graph.graphId.slice(0, -1)}a`,
  });
  assert.equal(badId.state, "invalid");
  assert.equal(badId.errors.includes("Mission reviewed transition graph identity is invalid."), true);

  const staleBinding = validateMissionReviewedTransitionGraphV1({
    ...graph,
    transitionIntent: transitionIntent(graph.transitionPlan, graph.parentPlanReviewEvidence, {
      parentReviewEvidenceId: `${graph.transitionIntent.parentReviewEvidenceId.slice(0, -1)}a`,
    }),
  });
  assert.equal(staleBinding.state, "invalid");
  assert.equal(staleBinding.errors.includes("parent_review_projection_mismatch"), true);
});

test("validated results are immutable snapshots and do not share mutable input", () => {
  const input = graphInput();
  const built = buildMissionReviewedTransitionGraphV1(input);
  assert.equal(built.state, "built");
  assert.throws(() => {
    built.graph.transitionIntent.transitionKind = "authorize-wheels-up";
  }, TypeError);

  const result = validateMissionReviewedTransitionGraphV1(built.graph);
  assert.equal(result.state, "valid");
  input.parentPlanReviewEvidence.verdict = "FAIL";
  assert.equal(result.state, "valid");
  assert.equal(result.value.parentPlanReviewEvidence.verdict, "PASS");
});
