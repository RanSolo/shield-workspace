import assert from "node:assert/strict";
import { chmod, link, mkdtemp, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1,
} from "../dist/guided-review-playbooks-v1.mjs";
import { createGuidedReviewDriverReceiptV1 } from "../dist/guided-review-driver-v1.mjs";
import {
  compileGuidedReviewRouteV1,
  createFormalGuidedReviewPlaybookV1,
  createGuidedReviewRouteOverlayV1,
} from "../dist/guided-review-route-overlay-v1.mjs";
import { prepareGuidedReviewRouteRequestHostV1 } from "../dist/guided-review-route-preparation-host-v1.mjs";
import { resolveGuidedReviewRoutePreparationHostV1 } from "../dist/guided-review-route-resolution-host-v1.mjs";
import {
  createGuidedReviewPlanV1,
  createGuidedReviewRuntimeHandoffV1,
} from "../dist/guided-review-v1.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";

const head = "1".repeat(40);
const digest = (character) => `sha256:${character.repeat(43)}`;
const template = BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1.find(({ kind }) => kind === "backend");
assert.ok(template);

async function fixture({ exactRevision = head, graphSuffix = "one", optional = false } = {}) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-guided-route-resolution-"));
  const missionId = "mission:issue-238";
  const subjectId = "issue:238";
  const repositoryId = "RanSolo/shield-workspace";
  const branch = "agent/guided-review-238";
  const plan = createGuidedReviewPlanV1({
    schemaVersion: 1, contractVersion: "guided.review.v1", planId: `plan:route-resolution:${graphSuffix}`,
    missionId, subjectId, kind: "backend", required: !optional,
    rationale: "Resolve an authentic Fury route for the exact candidate.", method: "code_review",
    participantRelationship: "independent_reviewer", coveredCriterionRefs: ["AC-1"],
    evidenceRequirements: ["Named exact-head review evidence."], exactRevision, gateOwnerSeatId: "coulson",
  });
  assert.equal(plan.state, "ready", JSON.stringify(plan));
  const driver = createGuidedReviewDriverReceiptV1({
    schemaVersion: 1, contractVersion: "guided.review.driver.v1", driverId: "driver:route-resolution", driverVersion: "v1",
    executorRef: "executor:route-resolution", exactRevision, environmentRef: "environment:route-resolution", status: "ready",
    capabilities: ["code_review"], scenarioRefs: ["scenario:route-resolution"], evidenceRefs: ["evidence:route-resolution"],
    effectClass: "read_only", detail: "Route resolution fixture.",
  });
  assert.equal(driver.state, "ready", JSON.stringify(driver));
  const runtime = createGuidedReviewRuntimeHandoffV1({
    status: "ready", repositoryId, canonicalWorktreeRef: "worktree:route-resolution", branch, exactRevision,
    builderSeatId: "may", builderBindingRef: "binding:may:route-resolution", reasoningRuntimeId: "runtime:route-resolution",
    toolExecutorId: "executor:route-resolution", dependencyBuildReceiptRef: "receipt:build:route-resolution",
    environmentRef: "environment:route-resolution", fixtureRef: "fixture:route-resolution",
    resourceBindingsRef: "bindings:route-resolution:redacted", endpointOwnershipRef: "ownership:route-resolution",
    portPreflightRef: "preflight:port:route-resolution", watcherPreflightRef: "preflight:watcher:route-resolution",
    externalEffectPolicyRef: "policy:no-external-effects", launchCommandRef: "command:route-resolution",
    healthProbeRef: "probe:route-resolution", reviewUrl: "http://127.0.0.1:4173/",
    teardownRef: "command:stop:route-resolution", recoveryRef: "recovery:route-resolution", driverReceipt: driver.value,
  });
  assert.equal(runtime.state, "ready", JSON.stringify(runtime));
  const preparation = {
    schemaVersion: 1, state: "publication_ready", missionId,
    observation: { canonicalRoot: repositoryRoot, missionRevisionId: digest("A"), repositoryId, branch, headRevision: exactRevision },
    protectedGraph: {
      graphId: `graph:route-resolution:${graphSuffix}`, graphDigest: graphSuffix === "one" ? digest("B") : digest("E"),
      transitionPlan: { id: `transition-plan:route-resolution:${graphSuffix}`, digest: graphSuffix === "one" ? digest("C") : digest("F"),
        subjectId, approvedCapabilities: optional ? [] : ["guided_review_required"] },
      parentPlanReviewEvidence: { id: `parent-review:route-resolution:${graphSuffix}`, digest: graphSuffix === "one" ? digest("D") : digest("G") },
    },
  };
  const context = { plan: plan.value, acceptanceCriteria: [{ criterionId: "AC-1", text: "The exact route has authentic Fury attribution." }],
    runtimeHandoff: runtime.value, participantRelationship: "independent_reviewer", kind: "backend" };
  const prepared = await prepareGuidedReviewRouteRequestHostV1({ preparation, repositoryRoot, context });
  assert.equal(prepared.state, "route_preparation_required", JSON.stringify(prepared));
  return { repositoryRoot, preparation, context, prepared };
}

function overlay(value, overrides = {}) {
  const request = value.prepared.request;
  const result = createGuidedReviewRouteOverlayV1({
    schemaVersion: 1, contractVersion: "guided.review.route-overlay.v1", overlayId: "overlay:route-resolution",
    missionId: request.missionId, subjectId: request.subjectId, repositoryId: request.repositoryId, branch: request.branch,
    exactRevision: request.exactRevision, protectedGraphId: request.protectedGraphId, protectedGraphDigest: request.protectedGraphDigest,
    templateId: request.templateId, templateVersion: request.templateVersion, templateDigest: request.templateDigest, kind: request.kind,
    rationale: "Fury selected the pinned backend route.", risks: ["Exact attribution must survive resolution."],
    acceptanceCriterionMappings: [{ criterionId: "AC-1", stepIds: ["intent"] }], inspectionPoints: [], overrides: [],
    furySeatId: "fury", furyBindingRef: "receipt:fury:route-resolution", furyReasoningRuntimeId: "runtime:fury:route-resolution",
    furyModelId: "model:fury:route-resolution", furyToolExecutorId: "executor:fury:route-resolution", identityAuthority: "claimed_only",
    ...overrides,
  });
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}

function dispatch(value, route, overrides = {}) {
  const request = value.prepared.request;
  const identity = {
    receiptId: overrides.receiptId ?? "receipt:fury:route-resolution",
    dispatchId: overrides.dispatchId ?? "dispatch:fury:route-resolution",
    parentMissionId: overrides.parentMissionId ?? request.missionId,
    parentMissionRevision: overrides.parentMissionRevision ?? request.missionRevisionId,
    parentSessionId: "session:hill:route-resolution", childTaskId: overrides.childTaskId ?? "task:fury:route-resolution",
    childSessionId: overrides.childSessionId ?? "session:fury:route-resolution", accountableSeatId: overrides.accountableSeatId ?? "fury",
    repositoryId: overrides.repositoryId ?? request.repositoryId, repositoryWorkspaceId: "workspace:route-resolution",
    repositoryRevision: overrides.repositoryRevision ?? request.exactRevision, subjectId: overrides.subjectId ?? request.subjectId,
    subjectRevision: overrides.subjectRevision ?? request.exactRevision, artifactId: overrides.artifactId ?? request.requestId,
    artifactRevision: overrides.artifactRevision ?? request.requestDigest,
  };
  const runtimeId = overrides.runtimeId ?? route.furyReasoningRuntimeId;
  const model = overrides.model ?? route.furyModelId;
  const executorId = overrides.executorId ?? route.furyToolExecutorId;
  const shared = {
    ...identity,
    configuredRuntime: { kind: "runtime.configured", runtimeId, model }, requestedRuntime: { kind: "runtime.requested", runtimeId, model },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:fury:route-resolution" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId, model, evidenceRefs: ["host:fury:runtime"] },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: { kind: "executor.host_observed", executorId, evidenceRefs: ["host:fury:executor"] },
  };
  const firstLogSequence = overrides.logSequence ?? 0;
  const started = createSeatDispatchStartedEventV1({ ...shared, inputEvidenceRefs: [request.requestId, request.requestDigest],
    timestamp: overrides.startedAt ?? "2026-08-13T20:00:00.000Z", logSequence: firstLogSequence,
    previousLogDigest: overrides.previousLogDigest ?? null, lifecycleSequence: 0, previousLifecycleDigest: null });
  if (overrides.lifecycle === "started") return [started];
  const requiredRefs = [request.requestId, request.requestDigest, route.overlayId, route.overlayDigest, request.protectedGraphId, request.protectedGraphDigest];
  const completed = createSeatDispatchLifecycleEventV1({ ...shared, ...(overrides.completedIdentity ?? {}), kind: overrides.lifecycle ?? "dispatch.completed",
    outputEvidenceRefs: overrides.outputEvidenceRefs ?? requiredRefs, timestamp: overrides.completedAt ?? "2026-08-13T20:01:00.000Z",
    logSequence: firstLogSequence + 1, previousLogDigest: started.entryDigest, lifecycleSequence: 1, previousLifecycleDigest: started.entryDigest });
  return [started, completed];
}

function dependencies(value, route, entries = dispatch(value, route), overrides = {}) {
  const calls = { discover: 0, overlay: 0, ledger: 0, compile: 0, playbook: 0, session: 0, pin: 0 };
  const deps = {
    async discoverRequests() { calls.discover += 1; return { state: "ready", value: [value.prepared] }; },
    async readRouteOverlay() { calls.overlay += 1; return { state: "ready", value: route }; },
    async readDispatchLedger() { calls.ledger += 1; return { state: "ready", entries }; },
    compileRoute(candidate) { calls.compile += 1; return compileGuidedReviewRouteV1(candidate); },
    createFormalPlaybook(compiled, input) { calls.playbook += 1; return createFormalGuidedReviewPlaybookV1(compiled, input); },
    startSession() { calls.session += 1; throw new Error("session widened into route resolution"); },
    readPasscode() { calls.pin += 1; throw new Error("PIN widened into route resolution"); },
    ...overrides,
  };
  return { calls, deps };
}

test("auto-discovery requires exactly one current request and missing overlay remains preparation-required", async () => {
  const value = await fixture();
  const route = overlay(value);
  for (const discovered of [[], [value.prepared, value.prepared]]) {
    const harness = dependencies(value, route, [] , { async discoverRequests() { harness.calls.discover += 1; return { state: "ready", value: discovered }; } });
    const result = await resolveGuidedReviewRoutePreparationHostV1({ preparation: value.preparation, repositoryRoot: value.repositoryRoot }, harness.deps);
    assert.equal(result.state, "invalid");
    assert.equal(result.code, discovered.length === 0 ? "CURRENT_ROUTE_REQUEST_NOT_FOUND" : "AMBIGUOUS_CURRENT_ROUTE_REQUEST");
    assert.equal(harness.calls.overlay, 0);
  }
  const harness = dependencies(value, route, [], { async readRouteOverlay() { harness.calls.overlay += 1;
    return { state: "invalid", code: "PACKAGE_ARTIFACT_MISSING", errors: ["Overlay has not been authored."] }; } });
  const pending = await resolveGuidedReviewRoutePreparationHostV1({ preparation: value.preparation, repositoryRoot: value.repositoryRoot }, harness.deps);
  assert.equal(pending.state, "route_preparation_required");
  assert.equal(pending.requestId, value.prepared.requestId);
  assert.deepEqual(harness.calls, { discover: 1, overlay: 1, ledger: 0, compile: 0, playbook: 0, session: 0, pin: 0 });
});

test("authentic Fury completion resolves a frozen formal route without starting a session or reading a PIN", async () => {
  for (const optional of [false, true]) {
    const value = await fixture({ optional });
    const route = overlay(value);
    const harness = dependencies(value, route);
    const result = await resolveGuidedReviewRoutePreparationHostV1({ preparation: value.preparation, repositoryRoot: value.repositoryRoot }, harness.deps);
    assert.equal(result.state, "guided_review_ready", JSON.stringify(result));
    assert.equal(result.furyReceiptId, route.furyBindingRef);
    assert.equal(result.request.policyMode, optional ? "operator_optional" : "required");
    assert.equal(result.playbook.overlayDigest, route.overlayDigest);
    assert.equal(result.playbook.compiledRouteDigest, result.compiledRoute.compiledRouteDigest);
    assert.deepEqual(harness.calls, { discover: 1, overlay: 1, ledger: 1, compile: 1, playbook: 1, session: 0, pin: 0 });
  }
});

test("wrong or ambiguous Fury dispatch evidence never reaches formal compilation", async (t) => {
  const cases = [
    ["wrong seat", { accountableSeatId: "may" }, "invalid"],
    ["incomplete lifecycle", { lifecycle: "started" }, "route_preparation_required"],
    ["wrong request id", { artifactId: "request:substituted" }, "route_preparation_required"],
    ["wrong request digest", { artifactRevision: digest("Z") }, "route_preparation_required"],
    ["wrong HEAD", { repositoryRevision: "2".repeat(40) }, "invalid"],
    ["wrong runtime", { runtimeId: "runtime:fury:substituted" }, "invalid"],
    ["wrong model", { model: "model:fury:substituted" }, "invalid"],
    ["wrong executor", { executorId: "executor:fury:substituted" }, "invalid"],
    ["missing output refs", { outputEvidenceRefs: ["evidence:incomplete"] }, "invalid"],
    ["wrong workspace in lifecycle", { completedIdentity: { repositoryWorkspaceId: "workspace:substituted" } }, "invalid"],
    ["wrong parent session in lifecycle", { completedIdentity: { parentSessionId: "session:hill:substituted" } }, "invalid"],
    ["wrong child session in lifecycle", { completedIdentity: { childSessionId: "session:fury:substituted" } }, "invalid"],
  ];
  for (const [name, mutation, expectedState] of cases) await t.test(name, async () => {
    const value = await fixture();
    const route = overlay(value);
    const harness = dependencies(value, route, dispatch(value, route, mutation));
    const result = await resolveGuidedReviewRoutePreparationHostV1({ preparation: value.preparation, repositoryRoot: value.repositoryRoot }, harness.deps);
    assert.equal(result.state, expectedState, JSON.stringify(result));
    assert.equal(harness.calls.compile, 0);
    assert.equal(harness.calls.playbook, 0);
  });
  await t.test("duplicate dispatch", async () => {
    const value = await fixture();
    const route = overlay(value);
    const first = dispatch(value, route);
    const second = dispatch(value, route, { receiptId: "receipt:fury:duplicate", dispatchId: "dispatch:fury:duplicate",
      childTaskId: "task:fury:duplicate", childSessionId: "session:fury:duplicate",
      logSequence: 2, previousLogDigest: first.at(-1).entryDigest, startedAt: "2026-08-13T20:02:00.000Z", completedAt: "2026-08-13T20:03:00.000Z" });
    const harness = dependencies(value, route, [...first, ...second]);
    const result = await resolveGuidedReviewRoutePreparationHostV1({ preparation: value.preparation, repositoryRoot: value.repositoryRoot }, harness.deps);
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "AMBIGUOUS_FURY_ROUTE_DISPATCH");
    assert.equal(harness.calls.compile, 0);
  });
});

test("caller-only, substituted, stale graph, template, or HEAD evidence fails before compilation", async () => {
  const value = await fixture();
  const route = overlay(value);
  const stale = await fixture({ exactRevision: "2".repeat(40), graphSuffix: "two" });
  const cases = [
    { name: "caller-only malformed overlay", overlayValue: { ...route, overlayDigest: digest("X") }, preparation: value.preparation,
      expected: "MALFORMED_ROUTE_OVERLAY" },
    { name: "stale template overlay", overlayValue: { ...route, templateDigest: digest("T") }, preparation: value.preparation,
      expected: "MALFORMED_ROUTE_OVERLAY" },
    { name: "substituted graph overlay", overlayValue: overlay(value, { protectedGraphId: "graph:substituted" }), preparation: value.preparation,
      expected: "ROUTE_OVERLAY_REQUEST_BINDING_MISMATCH" },
    { name: "substituted HEAD overlay", overlayValue: overlay(value, { exactRevision: "2".repeat(40) }), preparation: value.preparation,
      expected: "ROUTE_OVERLAY_REQUEST_BINDING_MISMATCH" },
  ];
  for (const candidate of cases) {
    const harness = dependencies(value, candidate.overlayValue, []);
    const result = await resolveGuidedReviewRoutePreparationHostV1({ preparation: candidate.preparation, repositoryRoot: value.repositoryRoot }, harness.deps);
    assert.equal(result.state, "invalid", candidate.name);
    assert.equal(result.code, candidate.expected, candidate.name);
    assert.equal(harness.calls.compile, 0, candidate.name);
  }
  const harness = dependencies(value, route, [], { async discoverRequests() { harness.calls.discover += 1; return { state: "ready", value: [stale.prepared] }; } });
  const staleRequest = await resolveGuidedReviewRoutePreparationHostV1({ preparation: value.preparation, repositoryRoot: value.repositoryRoot }, harness.deps);
  assert.equal(staleRequest.state, "invalid");
  assert.equal(staleRequest.code, "CURRENT_ROUTE_REQUEST_NOT_FOUND");
});

test("the overlay-named Fury receipt is mandatory before route compilation", async () => {
  const value = await fixture();
  const attributedRoute = overlay(value);
  const substitutedRoute = overlay(value, { furyBindingRef: "receipt:fury:substituted" });
  const harness = dependencies(value, substitutedRoute, dispatch(value, attributedRoute));
  const result = await resolveGuidedReviewRoutePreparationHostV1({ preparation: value.preparation,
    repositoryRoot: value.repositoryRoot }, harness.deps);
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "INVALID_FURY_ROUTE_ATTRIBUTION");
  assert.equal(harness.calls.compile, 0);
  assert.equal(harness.calls.playbook, 0);
});

test("symlinked, hard-linked, and malformed overlay bytes fail closed before dispatch or compilation", async (t) => {
  for (const kind of ["symlink", "hardlink", "malformed"]) await t.test(kind, async () => {
    const value = await fixture();
    const route = overlay(value);
    const path = value.prepared.paths.routeOverlayPath;
    if (kind === "symlink") {
      const outside = join(await mkdtemp(join(tmpdir(), "shield-route-overlay-outside-")), "route-overlay.json");
      await writeFile(outside, JSON.stringify(route), { mode: 0o600 });
      await symlink(outside, path);
    } else if (kind === "hardlink") {
      await writeFile(path, JSON.stringify(route), { mode: 0o600 });
      const outside = join(await mkdtemp(join(tmpdir(), "shield-route-overlay-hardlink-")), "route-overlay.json");
      await link(path, outside);
    } else {
      await writeFile(path, "{}", { mode: 0o600 });
      await chmod(path, 0o600);
    }
    const result = await resolveGuidedReviewRoutePreparationHostV1({ preparation: value.preparation, repositoryRoot: value.repositoryRoot });
    assert.equal(result.state, "invalid");
    assert.notEqual(result.code, "PACKAGE_ARTIFACT_MISSING");
  });
});
