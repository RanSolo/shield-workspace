import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1 } from "../dist/guided-review-playbooks-v1.mjs";
import { createGuidedReviewDriverReceiptV1 } from "../dist/guided-review-driver-v1.mjs";
import {
  prepareGuidedReviewRouteRequestHostV1,
} from "../dist/guided-review-route-preparation-host-v1.mjs";
import {
  createGuidedReviewRouteRequestV1,
  materializeGuidedReviewRouteRequestV1,
} from "../dist/guided-review-route-request-v1.mjs";
import {
  createGuidedReviewPlanV1,
  createGuidedReviewRuntimeHandoffV1,
} from "../dist/guided-review-v1.mjs";
import { canonicalJson } from "../dist/mission-v2.mjs";

const head = "1".repeat(40);
const digest = (character) => `sha256:${character.repeat(43)}`;
const template = BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1.find(({ kind }) => kind === "backend");
assert.ok(template);

async function fixture({ exactRevision = head, graphSuffix = "one", capabilities = ["guided_review_required"] } = {}) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-guided-route-host-"));
  const missionId = "mission:issue-238";
  const subjectId = "issue:238";
  const repositoryId = "RanSolo/shield-workspace";
  const branch = "agent/guided-review-238";
  const plan = createGuidedReviewPlanV1({
    schemaVersion: 1,
    contractVersion: "guided.review.v1",
    planId: `plan:route-host:${graphSuffix}`,
    missionId,
    subjectId,
    kind: "backend",
    required: capabilities.includes("guided_review_required"),
    rationale: "Prepare a lazy exact-head Fury route.",
    method: "code_review",
    participantRelationship: "independent_reviewer",
    coveredCriterionRefs: ["AC-1"],
    evidenceRequirements: ["Named exact-head observation."],
    exactRevision,
    gateOwnerSeatId: "coulson",
  });
  assert.equal(plan.state, "ready", JSON.stringify(plan));
  const driver = createGuidedReviewDriverReceiptV1({
    schemaVersion: 1,
    contractVersion: "guided.review.driver.v1",
    driverId: "driver:route-host",
    driverVersion: "v1",
    executorRef: "executor:route-host",
    exactRevision,
    environmentRef: "environment:route-host",
    status: "ready",
    capabilities: ["code_review"],
    scenarioRefs: ["scenario:route-host"],
    evidenceRefs: ["evidence:route-host"],
    effectClass: "read_only",
    detail: "Lazy route host fixture.",
  });
  assert.equal(driver.state, "ready", JSON.stringify(driver));
  const runtime = createGuidedReviewRuntimeHandoffV1({
    status: "ready",
    repositoryId,
    canonicalWorktreeRef: "worktree:route-host",
    branch,
    exactRevision,
    builderSeatId: "may",
    builderBindingRef: "binding:may:route-host",
    reasoningRuntimeId: "runtime:route-host",
    toolExecutorId: "executor:route-host",
    dependencyBuildReceiptRef: "receipt:build:route-host",
    environmentRef: "environment:route-host",
    fixtureRef: "fixture:route-host",
    resourceBindingsRef: "bindings:route-host:redacted",
    endpointOwnershipRef: "ownership:route-host",
    portPreflightRef: "preflight:port:route-host",
    watcherPreflightRef: "preflight:watcher:route-host",
    externalEffectPolicyRef: "policy:no-external-effects",
    launchCommandRef: "command:route-host",
    healthProbeRef: "probe:route-host",
    reviewUrl: "http://127.0.0.1:4173/",
    teardownRef: "command:stop:route-host",
    recoveryRef: "recovery:route-host",
    driverReceipt: driver.value,
  });
  assert.equal(runtime.state, "ready", JSON.stringify(runtime));
  const preparation = {
    schemaVersion: 1,
    state: "publication_ready",
    missionId,
    observation: {
      canonicalRoot: repositoryRoot,
      missionRevisionId: digest("A"),
      repositoryId,
      branch,
      headRevision: exactRevision,
    },
    protectedGraph: {
      graphId: `graph:route-host:${graphSuffix}`,
      graphDigest: graphSuffix === "one" ? digest("B") : digest("E"),
      transitionPlan: {
        id: `transition-plan:route-host:${graphSuffix}`,
        digest: graphSuffix === "one" ? digest("C") : digest("F"),
        subjectId,
        approvedCapabilities: capabilities,
      },
      parentPlanReviewEvidence: {
        id: `parent-review:route-host:${graphSuffix}`,
        digest: graphSuffix === "one" ? digest("D") : digest("G"),
      },
    },
  };
  return {
    repositoryRoot,
    preparation,
    context: {
      plan: plan.value,
      acceptanceCriteria: [{ criterionId: "AC-1", text: "Fury prepares the route only after YES." }],
      runtimeHandoff: runtime.value,
      participantRelationship: "independent_reviewer",
      kind: "backend",
    },
  };
}

function dependencyHarness() {
  const calls = { create: 0, materialize: 0, dispatch: 0, overlay: 0, pin: 0, sign: 0, journal: 0, model: 0 };
  let createdInput;
  const dependencies = {
    createRequest(value) {
      calls.create += 1;
      createdInput = value;
      return createGuidedReviewRouteRequestV1(value);
    },
    async materializeRequest(repositoryRoot, value) {
      calls.materialize += 1;
      return materializeGuidedReviewRouteRequestV1(repositoryRoot, value);
    },
    dispatchFury() { calls.dispatch += 1; throw new Error("dispatch widened into lazy preparation"); },
    readOverlay() { calls.overlay += 1; throw new Error("overlay lookup widened into lazy preparation"); },
    readPasscode() { calls.pin += 1; throw new Error("PIN widened into lazy preparation"); },
    signPayload() { calls.sign += 1; throw new Error("signing widened into lazy preparation"); },
    appendJournal() { calls.journal += 1; throw new Error("journal mutation widened into lazy preparation"); },
    invokeModel() { calls.model += 1; throw new Error("model reasoning widened into lazy preparation"); },
  };
  return { calls, dependencies, get createdInput() { return createdInput; } };
}

test("lazy YES derives every host identity from exact preparation and invokes no widened effects", async () => {
  const value = await fixture();
  const harness = dependencyHarness();
  const result = await prepareGuidedReviewRouteRequestHostV1(value, harness.dependencies);
  assert.equal(result.state, "route_preparation_required", JSON.stringify(result));
  assert.deepEqual(harness.calls, { create: 1, materialize: 1, dispatch: 0, overlay: 0, pin: 0, sign: 0, journal: 0, model: 0 });
  assert.equal(result.accountableSeatId, "fury");
  assert.equal(result.exactRevision, value.preparation.observation.headRevision);
  assert.equal(result.requestPath, result.paths.routeRequestPath);
  assert.deepEqual({
    missionId: harness.createdInput.missionId,
    missionRevisionId: harness.createdInput.missionRevisionId,
    subjectId: harness.createdInput.subjectId,
    repositoryId: harness.createdInput.repositoryId,
    branch: harness.createdInput.branch,
    exactRevision: harness.createdInput.exactRevision,
    protectedGraphId: harness.createdInput.protectedGraphId,
    protectedGraphDigest: harness.createdInput.protectedGraphDigest,
    transitionPlanId: harness.createdInput.transitionPlanId,
    transitionPlanDigest: harness.createdInput.transitionPlanDigest,
    parentPlanReviewEvidenceId: harness.createdInput.parentPlanReviewEvidenceId,
    parentPlanReviewEvidenceDigest: harness.createdInput.parentPlanReviewEvidenceDigest,
    policyMode: harness.createdInput.policyMode,
  }, {
    missionId: value.preparation.missionId,
    missionRevisionId: value.preparation.observation.missionRevisionId,
    subjectId: value.preparation.protectedGraph.transitionPlan.subjectId,
    repositoryId: value.preparation.observation.repositoryId,
    branch: value.preparation.observation.branch,
    exactRevision: value.preparation.observation.headRevision,
    protectedGraphId: value.preparation.protectedGraph.graphId,
    protectedGraphDigest: value.preparation.protectedGraph.graphDigest,
    transitionPlanId: value.preparation.protectedGraph.transitionPlan.id,
    transitionPlanDigest: value.preparation.protectedGraph.transitionPlan.digest,
    parentPlanReviewEvidenceId: value.preparation.protectedGraph.parentPlanReviewEvidence.id,
    parentPlanReviewEvidenceDigest: value.preparation.protectedGraph.parentPlanReviewEvidence.digest,
    policyMode: "required",
  });
  assert.equal(harness.createdInput.templateId, template.templateId);
  assert.equal(harness.createdInput.templateVersion, template.templateVersion);
  assert.equal(harness.createdInput.templateDigest, template.templateDigest);
  assert.equal(harness.createdInput.templateRouteGraphDigest, template.routeGraphDigest);
});

test("caller-supplied host identity and template fields are rejected before derivation", async () => {
  for (const location of ["input", "context"]) {
    const value = await fixture();
    const harness = dependencyHarness();
    const hostile = location === "input"
      ? { ...value, exactRevision: "9".repeat(40), furySeatId: "fury", templateId: "caller:template" }
      : { ...value, context: { ...value.context, exactRevision: "9".repeat(40), furySeatId: "fury", templateId: "caller:template" } };
    const result = await prepareGuidedReviewRouteRequestHostV1(hostile, harness.dependencies);
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "INVALID_ROUTE_PREPARATION_INPUT");
    assert.deepEqual(harness.calls, { create: 0, materialize: 0, dispatch: 0, overlay: 0, pin: 0, sign: 0, journal: 0, model: 0 });
  }
});

test("exact retry reuses one canonical materialization and conflicting context fails before write", async () => {
  const value = await fixture();
  const first = await prepareGuidedReviewRouteRequestHostV1(value);
  assert.equal(first.state, "route_preparation_required", JSON.stringify(first));
  const firstStats = await lstat(first.requestPath);
  const firstBytes = await readFile(first.requestPath, "utf8");
  const retry = await prepareGuidedReviewRouteRequestHostV1(value);
  assert.equal(retry.state, "route_preparation_required", JSON.stringify(retry));
  const retryStats = await lstat(retry.requestPath);
  assert.equal(retry.requestId, first.requestId);
  assert.equal(retry.requestDigest, first.requestDigest);
  assert.equal(retry.requestPath, first.requestPath);
  assert.equal(retryStats.ino, firstStats.ino);
  assert.equal(await readFile(retry.requestPath, "utf8"), firstBytes);

  const mismatched = { ...value, context: { ...value.context, participantRelationship: "builder" } };
  const rejected = await prepareGuidedReviewRouteRequestHostV1(mismatched);
  assert.equal(rejected.state, "invalid");
  assert.equal(await readFile(first.requestPath, "utf8"), firstBytes);
});

test("omitted or conflicting protected policy rejects before request creation", async () => {
  for (const capabilities of [["guided_review_omitted"], ["guided_review_required", "guided_review_omitted"]]) {
    const value = await fixture({ capabilities });
    const harness = dependencyHarness();
    const result = await prepareGuidedReviewRouteRequestHostV1(value, harness.dependencies);
    assert.equal(result.state, "invalid");
    assert.equal(result.code, capabilities.length === 1 ? "GUIDED_REVIEW_OMITTED" : "GUIDED_REVIEW_POLICY_CONFLICT");
    assert.deepEqual(harness.calls, { create: 0, materialize: 0, dispatch: 0, overlay: 0, pin: 0, sign: 0, journal: 0, model: 0 });
  }
});

test("changed HEAD or protected graph derives a distinct request and leaves the prior request stale", async () => {
  const original = await fixture();
  const first = await prepareGuidedReviewRouteRequestHostV1(original);
  assert.equal(first.state, "route_preparation_required", JSON.stringify(first));

  const changedHead = await fixture({ exactRevision: "2".repeat(40) });
  const second = await prepareGuidedReviewRouteRequestHostV1(changedHead);
  assert.equal(second.state, "route_preparation_required", JSON.stringify(second));
  assert.notEqual(second.requestId, first.requestId);
  assert.notEqual(second.requestDigest, first.requestDigest);
  assert.notEqual(second.requestPath, first.requestPath);
  assert.equal(first.request.exactRevision, head);
  assert.equal(second.request.exactRevision, "2".repeat(40));

  const changedGraph = await fixture({ graphSuffix: "two" });
  const third = await prepareGuidedReviewRouteRequestHostV1(changedGraph);
  assert.equal(third.state, "route_preparation_required", JSON.stringify(third));
  assert.notEqual(third.requestId, first.requestId);
  assert.notEqual(third.requestDigest, first.requestDigest);
  assert.equal(third.request.protectedGraphId, "graph:route-host:two");
});

test("stale context cannot be rebound to a changed prepared HEAD", async () => {
  const stale = await fixture();
  const current = await fixture({ exactRevision: "2".repeat(40) });
  const harness = dependencyHarness();
  const result = await prepareGuidedReviewRouteRequestHostV1({
    repositoryRoot: current.repositoryRoot,
    preparation: current.preparation,
    context: stale.context,
  }, harness.dependencies);
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "MALFORMED_ROUTE_REQUEST");
  assert.deepEqual(harness.calls, { create: 1, materialize: 0, dispatch: 0, overlay: 0, pin: 0, sign: 0, journal: 0, model: 0 });
});
