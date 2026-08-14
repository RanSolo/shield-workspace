import assert from "node:assert/strict";
import { link, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1 } from "../dist/guided-review-playbooks-v1.mjs";
import { createGuidedReviewDriverReceiptV1 } from "../dist/guided-review-driver-v1.mjs";
import { compileGuidedReviewRouteV1, createFormalGuidedReviewPlaybookV1, createGuidedReviewRouteOverlayV1,
  validateGuidedReviewCompiledRouteV1 } from "../dist/guided-review-route-overlay-v1.mjs";
import { prepareGuidedReviewRouteRequestHostV1 } from "../dist/guided-review-route-preparation-host-v1.mjs";
import { resolveGuidedReviewRoutePackagePathsV1 } from "../dist/guided-review-route-request-v1.mjs";
import { resolveGuidedReviewRoutePreparationHostV1 } from "../dist/guided-review-route-resolution-host-v1.mjs";
import { revalidateCompletedGuidedReviewSessionHostV1, startOrResumeGuidedReviewSessionHostV1 } from "../dist/guided-review-session-host-v1.mjs";
import { createGuidedReviewPlanV1, createGuidedReviewRuntimeHandoffV1, decideGuidedReviewStepV1,
  startGuidedReviewSessionV1, validateGuidedReviewPlaybookV1, validateGuidedReviewSessionV1 } from "../dist/guided-review-v1.mjs";
import { createSeatDispatchLifecycleEventV1, createSeatDispatchStartedEventV1 } from "../dist/seat-dispatch-receipt-v1.mjs";

const head = "1".repeat(40);
const digest = (character) => `sha256:${character.repeat(43)}`;
const template = BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1.find(({ kind }) => kind === "backend");
assert.ok(template);
const participant = Object.freeze({ participantId: "human:coulson:active", relationship: "independent_reviewer",
  seatId: "coulson", bindingRef: "binding:coulson:active" });

async function fixture() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-guided-session-host-"));
  const missionId = "mission:issue-238";
  const subjectId = "issue:238";
  const repositoryId = "RanSolo/shield-workspace";
  const branch = "agent/guided-review-238";
  const plan = createGuidedReviewPlanV1({ schemaVersion: 1, contractVersion: "guided.review.v1",
    planId: "plan:session-host", missionId, subjectId, kind: "backend", required: true,
    rationale: "Run the exact attributed Guided Review route.", method: "code_review",
    participantRelationship: "independent_reviewer", coveredCriterionRefs: ["AC-1"],
    evidenceRequirements: ["Frozen checkpoint evidence."], exactRevision: head, gateOwnerSeatId: "coulson" });
  assert.equal(plan.state, "ready", JSON.stringify(plan));
  const driver = createGuidedReviewDriverReceiptV1({ schemaVersion: 1, contractVersion: "guided.review.driver.v1",
    driverId: "driver:session-host", driverVersion: "v1", executorRef: "executor:session-host", exactRevision: head,
    environmentRef: "environment:session-host", status: "ready", capabilities: ["code_review"],
    scenarioRefs: ["scenario:session-host"], evidenceRefs: ["evidence:session-host"], effectClass: "read_only",
    detail: "Session host fixture." });
  assert.equal(driver.state, "ready", JSON.stringify(driver));
  const runtime = createGuidedReviewRuntimeHandoffV1({ status: "ready", repositoryId,
    canonicalWorktreeRef: "worktree:session-host", branch, exactRevision: head, builderSeatId: "may",
    builderBindingRef: "binding:may:session-host", reasoningRuntimeId: "runtime:session-host",
    toolExecutorId: "executor:session-host", dependencyBuildReceiptRef: "receipt:build:session-host",
    environmentRef: "environment:session-host", fixtureRef: "fixture:session-host",
    resourceBindingsRef: "bindings:session-host:redacted", endpointOwnershipRef: "ownership:session-host",
    portPreflightRef: "preflight:port:session-host", watcherPreflightRef: "preflight:watcher:session-host",
    externalEffectPolicyRef: "policy:no-external-effects", launchCommandRef: "command:session-host",
    healthProbeRef: "probe:session-host", reviewUrl: "http://127.0.0.1:4173/",
    teardownRef: "command:stop:session-host", recoveryRef: "recovery:session-host", driverReceipt: driver.value });
  assert.equal(runtime.state, "ready", JSON.stringify(runtime));
  const preparation = { schemaVersion: 1, state: "publication_ready", missionId,
    observation: { canonicalRoot: repositoryRoot, missionRevisionId: digest("A"), repositoryId, branch, headRevision: head,
      signerHumanPrincipalId: participant.participantId, signingKeyRef: participant.bindingRef },
    protectedGraph: { graphId: "graph:session-host", graphDigest: digest("B"),
      transitionPlan: { id: "transition-plan:session-host", digest: digest("C"), subjectId,
        approvedCapabilities: ["guided_review_required"] },
      parentPlanReviewEvidence: { id: "parent-review:session-host", digest: digest("D") } } };
  const prepared = await prepareGuidedReviewRouteRequestHostV1({ preparation, repositoryRoot,
    context: { plan: plan.value, acceptanceCriteria: [{ criterionId: "AC-1", text: "Show one frozen question." }],
      runtimeHandoff: runtime.value, participantRelationship: "independent_reviewer", kind: "backend" } });
  assert.equal(prepared.state, "route_preparation_required", JSON.stringify(prepared));
  const request = prepared.request;
  const routeResult = createGuidedReviewRouteOverlayV1({ schemaVersion: 1, contractVersion: "guided.review.route-overlay.v1",
    overlayId: "overlay:session-host", missionId, subjectId, repositoryId, branch, exactRevision: head,
    protectedGraphId: request.protectedGraphId, protectedGraphDigest: request.protectedGraphDigest,
    templateId: request.templateId, templateVersion: request.templateVersion, templateDigest: request.templateDigest,
    kind: request.kind, rationale: "Fury selected the pinned route.", risks: ["Bindings must remain exact."],
    acceptanceCriterionMappings: [{ criterionId: "AC-1", stepIds: ["intent"] }], inspectionPoints: [], overrides: [],
    furySeatId: "fury", furyBindingRef: "receipt:fury:session-host", furyReasoningRuntimeId: "runtime:fury:session-host",
    furyModelId: "model:fury:session-host", furyToolExecutorId: "executor:fury:session-host", identityAuthority: "claimed_only" });
  assert.equal(routeResult.state, "ready", JSON.stringify(routeResult));
  const route = routeResult.value;
  const common = { receiptId: route.furyBindingRef, dispatchId: "dispatch:fury:session-host", parentMissionId: missionId,
    parentMissionRevision: request.missionRevisionId, parentSessionId: "session:hill", childTaskId: "task:fury:session-host",
    childSessionId: "session:fury:session-host", accountableSeatId: "fury", repositoryId,
    repositoryWorkspaceId: "workspace:session-host", repositoryRevision: head, subjectId, subjectRevision: head,
    artifactId: request.requestId, artifactRevision: request.requestDigest,
    configuredRuntime: { kind: "runtime.configured", runtimeId: route.furyReasoningRuntimeId, model: route.furyModelId },
    requestedRuntime: { kind: "runtime.requested", runtimeId: route.furyReasoningRuntimeId, model: route.furyModelId },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:fury:executor" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: route.furyReasoningRuntimeId, model: route.furyModelId,
      evidenceRefs: ["host:fury:runtime"] }, executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: { kind: "executor.host_observed", executorId: route.furyToolExecutorId, evidenceRefs: ["host:fury:executor"] } };
  const started = createSeatDispatchStartedEventV1({ ...common, inputEvidenceRefs: [request.requestId, request.requestDigest],
    timestamp: "2026-08-13T20:00:00.000Z", logSequence: 0, previousLogDigest: null, lifecycleSequence: 0, previousLifecycleDigest: null });
  const completed = createSeatDispatchLifecycleEventV1({ ...common, kind: "dispatch.completed",
    outputEvidenceRefs: [request.requestId, request.requestDigest, route.overlayId, route.overlayDigest,
      request.protectedGraphId, request.protectedGraphDigest], timestamp: "2026-08-13T20:01:00.000Z",
    logSequence: 1, previousLogDigest: started.entryDigest, lifecycleSequence: 1, previousLifecycleDigest: started.entryDigest });
  const resolution = await resolveGuidedReviewRoutePreparationHostV1({ preparation, repositoryRoot }, {
    async discoverRequests() { return { state: "ready", value: [prepared] }; },
    async readRouteOverlay() { return { state: "ready", value: route }; },
    async readDispatchLedger() { return { state: "ready", entries: [started, completed] }; },
    compileRoute: compileGuidedReviewRouteV1, createFormalPlaybook: createFormalGuidedReviewPlaybookV1 });
  assert.equal(resolution.state, "guided_review_ready", JSON.stringify(resolution));
  return { repositoryRoot, resolution };
}

function harness(storedSession, activeParticipant = participant) {
  const artifacts = new Map();
  if (storedSession !== undefined) artifacts.set("session", storedSession);
  const calls = { validateRoute: 0, validatePlaybook: 0, start: 0, validateSession: 0, read: 0, materialize: [],
    decide: 0, pin: 0, sign: 0, journal: 0, dispatch: 0, model: 0 };
  const dependencies = {
    async resolvePaths(root, request) { return resolveGuidedReviewRoutePackagePathsV1(root, request); },
    async resolveActiveParticipant() { return { state: "ready", value: activeParticipant }; },
    validateCompiledRoute(value) { calls.validateRoute += 1; return validateGuidedReviewCompiledRouteV1(value); },
    validatePlaybook(value) { calls.validatePlaybook += 1; return validateGuidedReviewPlaybookV1(value); },
    startSession(playbook, input) { calls.start += 1; return startGuidedReviewSessionV1(playbook, input); },
    validateSession(playbook, value) { calls.validateSession += 1; return validateGuidedReviewSessionV1(playbook, value); },
    async readArtifact(_root, _request, artifact) { calls.read += 1; return artifacts.has(artifact)
      ? { state: "ready", value: artifacts.get(artifact) }
      : { state: "invalid", code: "PACKAGE_ARTIFACT_MISSING", errors: ["missing"] }; },
    async materializeArtifact(_root, _request, artifact, value, mode) { calls.materialize.push([artifact, mode]);
      if (artifacts.has(artifact)) return mode === "idempotent_exact" && JSON.stringify(artifacts.get(artifact)) === JSON.stringify(value)
        ? { state: "ready", value: { paths: {}, disposition: "already_exists_exact" } }
        : { state: "invalid", code: "PACKAGE_ARTIFACT_ALREADY_EXISTS", errors: ["exists"] };
      artifacts.set(artifact, value); return { state: "ready", value: { paths: {}, disposition: "created" } }; },
    decide() { calls.decide += 1; throw new Error("decision authority widened into session host"); },
    readPasscode() { calls.pin += 1; throw new Error("PIN widened into session host"); },
    sign() { calls.sign += 1; throw new Error("signing widened into session host"); },
    appendJournal() { calls.journal += 1; throw new Error("journal widened into session host"); },
    dispatch() { calls.dispatch += 1; throw new Error("dispatch widened into session host"); },
    invokeModel() { calls.model += 1; throw new Error("model widened into session host"); },
  };
  return { artifacts, calls, dependencies };
}

function complete(playbook, session) {
  let current = session;
  while (current.state !== "completed") {
    const index = current.decisions.length + 1;
    const next = decideGuidedReviewStepV1(playbook, current, { decisionId: `decision:${index}`,
      stepId: current.currentStepId, exactRevision: current.exactRevision, disposition: "pass",
      observation: `Observed ${current.currentStepId}.`, evidenceRefs: ["evidence:session-host"], finding: null, condition: null,
      decidedAt: `2026-08-13T21:${String(index).padStart(2, "0")}:00.000Z` });
    assert.equal(next.state, "ready", JSON.stringify(next));
    current = next.value;
  }
  return current;
}

test("materializes the exact playbook and one exclusive active Coulson session, then resumes idempotently at one frozen question", async () => {
  const value = await fixture();
  const h = harness();
  const input = { repositoryRoot: value.repositoryRoot, resolution: value.resolution, startedAt: "2026-08-13T21:00:00.000Z" };
  const first = await startOrResumeGuidedReviewSessionHostV1(input, h.dependencies);
  assert.equal(first.state, "guided_review_in_progress", JSON.stringify(first));
  const expectedStage = value.resolution.playbook.stages[0];
  const expectedStep = expectedStage.steps[0];
  assert.deepEqual(first.currentStage, { stageId: expectedStage.stageId, checkpointId: expectedStage.checkpointId, title: expectedStage.title, purpose: expectedStage.purpose });
  assert.deepEqual(first.currentStep, { stepId: expectedStep.stepId, title: expectedStep.title, question: expectedStep.question,
    instructions: expectedStep.instructions, criterionRefs: expectedStep.criterionRefs, evidenceRefs: expectedStep.evidenceRefs, relevantPaths: expectedStep.relevantPaths });
  assert.deepEqual(first.routeContext, { rationale: value.resolution.overlay.rationale, risks: value.resolution.overlay.risks });
  assert.deepEqual(h.calls.materialize, [["playbook", "exclusive"], ["session", "exclusive"]]);
  assert.equal(h.artifacts.get("session").participant.bindingRef, participant.bindingRef);
  const resumed = await startOrResumeGuidedReviewSessionHostV1(input, h.dependencies);
  assert.deepEqual(resumed, first);
  assert.equal(h.calls.start, 1);
  assert.deepEqual(h.calls.materialize, [["playbook", "exclusive"], ["session", "exclusive"]]);
  assert.deepEqual({ decide: h.calls.decide, pin: h.calls.pin, sign: h.calls.sign, journal: h.calls.journal,
    dispatch: h.calls.dispatch, model: h.calls.model }, { decide: 0, pin: 0, sign: 0, journal: 0, dispatch: 0, model: 0 });
});

test("an exact completed stored session returns the complete frozen playbook/session pair without effects", async () => {
  const value = await fixture();
  const started = startGuidedReviewSessionV1(value.resolution.playbook, { sessionId: "session:completed",
    profile: "publication", participant, startedAt: "2026-08-13T21:00:00.000Z" });
  assert.equal(started.state, "ready");
  const completed = complete(value.resolution.playbook, started.value);
  const h = harness(completed);
  h.artifacts.set("playbook", value.resolution.playbook);
  const result = await startOrResumeGuidedReviewSessionHostV1({ repositoryRoot: value.repositoryRoot, resolution: value.resolution,
    startedAt: "2026-08-13T22:00:00.000Z" }, h.dependencies);
  assert.equal(result.state, "guided_review_completed", JSON.stringify(result));
  assert.deepEqual(result.playbook, value.resolution.playbook);
  assert.deepEqual(result.session, completed);
  assert.equal(h.calls.start, 0);
  assert.deepEqual({ decide: h.calls.decide, pin: h.calls.pin, sign: h.calls.sign, journal: h.calls.journal,
    dispatch: h.calls.dispatch, model: h.calls.model }, { decide: 0, pin: 0, sign: 0, journal: 0, dispatch: 0, model: 0 });
});

test("completed publication revalidation is read-only and never recreates a missing playbook or session", async (t) => {
  const value = await fixture();
  const started = startGuidedReviewSessionV1(value.resolution.playbook, { sessionId: "session:read-only-revalidation",
    profile: "publication", participant, startedAt: "2026-08-13T21:00:00.000Z" });
  assert.equal(started.state, "ready");
  for (const missing of [null, "playbook", "session"]) await t.test(missing ?? "present", async () => {
    const h = harness(complete(value.resolution.playbook, started.value));
    h.artifacts.set("playbook", value.resolution.playbook);
    if (missing !== null) h.artifacts.delete(missing);
    const result = await revalidateCompletedGuidedReviewSessionHostV1({ repositoryRoot: value.repositoryRoot, resolution: value.resolution }, h.dependencies);
    assert.equal(result.state, missing === null ? "guided_review_completed" : "invalid", JSON.stringify(result));
    assert.equal(h.calls.start, 0);
    assert.deepEqual(h.calls.materialize, []);
    if (missing !== null) assert.equal(h.artifacts.has(missing), false);
  });
});

test("substituted participant, playbook, route, HEAD, or stored session fails before authority effects", async (t) => {
  const value = await fixture();
  const cases = [
    ["participant", { resolution: { ...value.resolution, participant: { ...value.resolution.participant, participantId: "human:substituted" } } }],
    ["playbook", { resolution: { ...value.resolution, playbook: { ...value.resolution.playbook, playbookDigest: digest("P") } } }],
    ["route", { resolution: { ...value.resolution, compiledRoute: { ...value.resolution.compiledRoute, compiledRouteDigest: digest("R") } } }],
    ["HEAD", { resolution: { ...value.resolution, exactRevision: "2".repeat(40) } }],
    ["repository root", { repositoryRoot: "/tmp/substituted-guided-review-root" }],
    ["package path", { resolution: { ...value.resolution, paths: { ...value.resolution.paths,
      packageDirectory: join(value.repositoryRoot, ".shield", "tmp", "guided-review", "substituted") } } }],
  ];
  for (const [name, changes] of cases) await t.test(name, async () => {
    const h = harness();
    const result = await startOrResumeGuidedReviewSessionHostV1({ repositoryRoot: value.repositoryRoot, resolution: value.resolution,
      startedAt: "2026-08-13T21:00:00.000Z", ...changes }, h.dependencies);
    assert.equal(result.state, "invalid");
    if (name === "participant") assert.equal(result.code, "ACTIVE_COULSON_MISMATCH");
    assert.deepEqual({ decide: h.calls.decide, pin: h.calls.pin, sign: h.calls.sign, journal: h.calls.journal,
      dispatch: h.calls.dispatch, model: h.calls.model }, { decide: 0, pin: 0, sign: 0, journal: 0, dispatch: 0, model: 0 });
  });
  const started = startGuidedReviewSessionV1(value.resolution.playbook, { sessionId: "session:substituted",
    profile: "publication", participant, startedAt: "2026-08-13T21:00:00.000Z" });
  assert.equal(started.state, "ready");
  for (const [name, session] of [["session participant", { ...started.value, participant: { ...participant, participantId: "human:other" } }],
    ["session route", { ...started.value, compiledRouteDigest: digest("S") }],
    ["session HEAD", { ...started.value, exactRevision: "2".repeat(40) }]]) await t.test(name, async () => {
    const h = harness(session);
    const result = await startOrResumeGuidedReviewSessionHostV1({ repositoryRoot: value.repositoryRoot, resolution: value.resolution,
      startedAt: "2026-08-13T21:00:00.000Z" }, h.dependencies);
    assert.equal(result.state, "invalid");
  });
});

test("symlinked, hard-linked, and malformed package artifacts fail closed", async (t) => {
  for (const kind of ["playbook symlink", "playbook hardlink", "session symlink", "session hardlink", "session malformed"]) await t.test(kind, async () => {
    const value = await fixture();
    const playbookPath = value.resolution.paths.playbookPath;
    const sessionPath = value.resolution.paths.sessionPath;
    const targetPath = kind.startsWith("playbook") ? playbookPath : sessionPath;
    const outside = join(await mkdtemp(join(tmpdir(), "shield-session-host-outside-")), "artifact.json");
    const bytes = kind === "session malformed" ? "{not-json\n" : `${JSON.stringify(kind.startsWith("playbook")
      ? value.resolution.playbook : { substituted: true })}\n`;
    await writeFile(outside, bytes, { mode: 0o600 });
    if (kind.endsWith("symlink")) await symlink(outside, targetPath);
    else if (kind.endsWith("hardlink")) await link(outside, targetPath);
    else await writeFile(targetPath, bytes, { mode: 0o600 });
    const result = await startOrResumeGuidedReviewSessionHostV1({ repositoryRoot: value.repositoryRoot, resolution: value.resolution,
      startedAt: "2026-08-13T21:00:00.000Z" });
    assert.equal(result.state, "invalid", JSON.stringify(result));
  });
});
