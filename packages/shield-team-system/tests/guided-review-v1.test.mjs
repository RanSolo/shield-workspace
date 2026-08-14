import assert from "node:assert/strict";
import test from "node:test";

import {
  GUIDED_REVIEW_CONTRACT_VERSION,
  createGuidedReviewPublicationBundleV1,
  createGuidedReviewPlanV1,
  createGuidedReviewRuntimeHandoffV1,
  decideGuidedReviewStepV1,
  evaluateGuidedReviewPublicationForkV1,
  renderGuidedReviewChecklistV1,
  reviseGuidedReviewSessionV1,
  startGuidedReviewSessionV1,
  summarizeGuidedReviewSessionV1,
  validateGuidedReviewPlanV1,
  validateGuidedReviewPlaybookV1,
  validateGuidedReviewPublicationBundleV1,
  validateGuidedReviewPublicationForkV1,
  validateGuidedReviewRuntimeHandoffV1,
  validateGuidedReviewSessionV1,
} from "../dist/guided-review-v1.mjs";
import {
  BUILT_IN_GUIDED_REVIEW_PLAYBOOK_IDS,
  createBuiltInGuidedReviewPlaybookV1,
} from "../dist/guided-review-playbooks-v1.mjs";
import { createGuidedReviewDriverReceiptV1, validateGuidedReviewDriverReceiptV1 } from "../dist/guided-review-driver-v1.mjs";

const head = "1234567890abcdef1234567890abcdef12345678";
const nextHead = "abcdef1234567890abcdef1234567890abcdef12";
function reviewPlan(kind = "frontend", exactRevision = head, required = true, participantRelationship = kind === "frontend" ? "product_reviewer" : kind === "backend" ? "independent_reviewer" : "document_reviewer") {
  const result = createGuidedReviewPlanV1({
    schemaVersion: 1,
    contractVersion: "guided.review.v1",
    planId: `plan:${kind}:${required ? "required" : "optional"}`,
    missionId: "mission:issue-238",
    subjectId: "issue:238",
    kind,
    required,
    rationale: required ? "Human observation is material to publication." : "Automated evidence is sufficient for this candidate.",
    method: kind === "frontend" ? "local_browser" : kind === "backend" ? "cli" : "document_review",
    participantRelationship,
    coveredCriterionRefs: required ? ["AC-1", "AC-2"] : [],
    evidenceRequirements: required ? ["Named observations and exact-revision checklist."] : [],
    exactRevision,
    gateOwnerSeatId: "coulson",
  });
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}
function driverReceipt(exactRevision = head, status = "ready") {
  const result = createGuidedReviewDriverReceiptV1({
    schemaVersion: 1,
    contractVersion: "guided.review.driver.v1",
    driverId: "driver:code-guided",
    driverVersion: "v1",
    executorRef: "executor:test",
    exactRevision,
    environmentRef: "environment:test",
    status,
    capabilities: ["artifact_focus", "technical_evidence"],
    scenarioRefs: ["scenario:issue-238"],
    evidenceRefs: ["evidence:test:guided-review"],
    effectClass: "read_only",
    detail: "Deterministic test driver receipt.",
  });
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}

function runtimeHandoff(exactRevision = head, status = "ready", overrides = {}) {
  const result = createGuidedReviewRuntimeHandoffV1({
    status,
    repositoryId: "RanSolo/shield-workspace",
    canonicalWorktreeRef: "worktree:guided-review-238",
    branch: "agent/guided-review-238",
    exactRevision,
    builderSeatId: "may",
    builderBindingRef: "binding:may:guided-review-238",
    reasoningRuntimeId: "runtime:may:test",
    toolExecutorId: "executor:test",
    dependencyBuildReceiptRef: "receipt:build:test",
    environmentRef: "environment:test",
    fixtureRef: "fixture:test",
    resourceBindingsRef: "bindings:test:redacted",
    endpointOwnershipRef: "ownership:test",
    portPreflightRef: "preflight:port:test",
    watcherPreflightRef: "preflight:watcher:test",
    externalEffectPolicyRef: "policy:no-external-effects",
    launchCommandRef: "command:start",
    healthProbeRef: "probe:ready",
    reviewUrl: "http://127.0.0.1:5173/",
    teardownRef: "command:stop",
    recoveryRef: "recovery:test",
    driverReceipt: driverReceipt(exactRevision, status === "ready" ? "ready" : "blocked"),
    ...overrides,
  });
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}

const base = {
  missionId: "mission:issue-238",
  subjectId: "issue:238",
  repositoryId: "RanSolo/shield-workspace",
  branch: "agent/guided-review-238",
  exactRevision: head,
  title: "Guided Review",
  acceptanceCriteria: [
    { criterionId: "AC-1", text: "Review proceeds in small durable questions grouped into stages." },
    { criterionId: "AC-2", text: "Publication offers one-PIN Yes, No, or Cancel routes." },
  ],
  runtimeHandoff: runtimeHandoff(),
  relevantPaths: ["packages/shield-team-system/src/guided-review-v1.mts"],
  evidenceRefs: ["evidence:test:guided-review"],
};

function publicationBundleInput(candidatePlan, fork, playbookValue, sessionValue, overrides = {}) {
  return {
    missionId: base.missionId,
    subjectId: base.subjectId,
    repositoryId: base.repositoryId,
    branch: base.branch,
    exactRevision: candidatePlan.exactRevision,
    protectedGraphId: "graph:guided-review:test",
    protectedGraphDigest: "sha256:GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    transitionPlanId: "transition-plan:guided-review:test",
    transitionPlanDigest: "sha256:TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
    parentPlanReviewEvidenceId: "review:fury:guided-review:test",
    parentPlanReviewEvidenceDigest: "sha256:FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    policyMode: candidatePlan.required ? "required" : "operator_optional",
    candidatePlan,
    fork,
    playbook: playbookValue,
    session: sessionValue,
    ...overrides,
  };
}

function playbook(kind = "frontend", overrides = {}) {
  const values = { ...base, ...overrides };
  const participantRelationship = overrides.participantRelationship ?? (kind === "frontend" ? "product_reviewer" : kind === "backend" ? "independent_reviewer" : "document_reviewer");
  const result = createBuiltInGuidedReviewPlaybookV1(kind, { ...values, participantRelationship, plan: overrides.plan ?? reviewPlan(kind, values.exactRevision) });
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}

function start(book = playbook(), profile = "publication") {
  const result = startGuidedReviewSessionV1(book, {
    sessionId: "session:issue-238",
    profile,
    participant: { participantId: "human:test-reviewer", relationship: book.participantRelationship, seatId: "coulson", bindingRef: "binding:test-reviewer" },
    startedAt: "2026-08-13T20:00:00.000Z",
  });
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}

function decide(book, session, disposition = "pass", overrides = {}) {
  const index = session.decisions.length + 1;
  const result = decideGuidedReviewStepV1(book, session, {
    decisionId: `decision:${index}`,
    stepId: session.currentStepId,
    exactRevision: session.exactRevision,
    disposition,
    observation: `Observed step ${session.currentStepId}.`,
    evidenceRefs: ["evidence:test:guided-review"],
    finding: disposition === "fail" || disposition === "not_observed" ? `Finding at ${session.currentStepId}.` : null,
    condition: disposition === "conditional_pass" ? `Condition from ${session.currentStepId}.` : null,
    decidedAt: `2026-08-13T20:${String(index).padStart(2, "0")}:00.000Z`,
    ...overrides,
  });
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}

function complete(book, session = start(book)) {
  let current = session;
  while (current.state !== "completed") current = decide(book, current);
  return current;
}

test("exports three standard playbooks whose stages contain several one-question steps", () => {
  assert.deepEqual(BUILT_IN_GUIDED_REVIEW_PLAYBOOK_IDS, [
    "guided-review:backend:v1",
    "guided-review:frontend:v1",
    "guided-review:spike:v1",
  ]);
  for (const kind of ["backend", "frontend", "spike"]) {
    const book = playbook(kind);
    assert.equal(book.contractVersion, GUIDED_REVIEW_CONTRACT_VERSION);
    assert.ok(book.stages.length >= 4);
    assert.ok(book.stages.every((stage) => stage.steps.length >= 2));
    assert.ok(book.stages.every((stage) => stage.checkpointId === `checkpoint:${stage.stageId}`));
    assert.ok(book.stages.flatMap((stage) => stage.steps).every((step) => !step.question.includes("\n")));
    assert.ok(book.stages.flatMap((stage) => stage.steps).some((step) => step.stepId === "responsible-code"));
  }
});

test("versioned driver receipts bind executor, environment, revision, effects, and evidence", () => {
  const receipt = driverReceipt();
  assert.equal(receipt.contractVersion, "guided.review.driver.v1");
  assert.equal(receipt.effectClass, "read_only");
  assert.equal(validateGuidedReviewDriverReceiptV1(receipt).state, "ready");
  assert.equal(validateGuidedReviewDriverReceiptV1({ ...receipt, executorRef: "executor:substituted" }).state, "invalid");
});

test("runtime handoffs content-address the closed builder, runtime, launch, and driver chain", () => {
  const handoff = runtimeHandoff();
  const { handoffDigest: _handoffDigest, ...handoffBody } = handoff;
  assert.equal(handoff.builderSeatId, "may");
  assert.equal(validateGuidedReviewRuntimeHandoffV1(handoff).state, "ready");
  assert.equal(validateGuidedReviewRuntimeHandoffV1({ ...handoff, reasoningRuntimeId: "runtime:substituted" }).state, "invalid");
  assert.equal(validateGuidedReviewRuntimeHandoffV1({ ...handoff, recoveryRef: "recovery:substituted" }).state, "invalid");
  assert.equal(validateGuidedReviewRuntimeHandoffV1({
    ...handoff,
    driverReceipt: { ...handoff.driverReceipt, detail: "Mutated after the wrapper digest was issued." },
  }).state, "invalid");
  assert.equal(createGuidedReviewRuntimeHandoffV1({
    ...handoffBody,
    reviewUrl: "http://user:secret@127.0.0.1:5173/",
  }).state, "invalid");
  assert.equal(createBuiltInGuidedReviewPlaybookV1("frontend", {
    ...base,
    runtimeHandoff: runtimeHandoff(head, "ready", { repositoryId: "Other/repository" }),
    participantRelationship: "product_reviewer",
    plan: reviewPlan(),
  }).state, "invalid");
});

test("plan records required or safely omitted QA against exact AC and gate ownership", () => {
  const required = reviewPlan();
  assert.equal(required.required, true);
  assert.deepEqual(required.coveredCriterionRefs, ["AC-1", "AC-2"]);
  assert.equal(required.gateOwnerSeatId, "coulson");
  const omitted = reviewPlan("backend", head, false);
  assert.equal(omitted.required, false);
  assert.match(omitted.rationale, /Automated evidence/u);
});

test("exported plan, playbook, and session validators reject open or tampered records", () => {
  const plan = reviewPlan();
  const book = playbook();
  const session = start(book);
  assert.equal(validateGuidedReviewPlanV1(plan).state, "ready");
  assert.equal(validateGuidedReviewPlaybookV1(book).state, "ready");
  assert.equal(validateGuidedReviewSessionV1(book, session).state, "ready");
  assert.equal(validateGuidedReviewPlanV1({ ...plan, unexpected: true }).state, "invalid");
  assert.equal(validateGuidedReviewPlaybookV1({ ...book, title: "Substituted" }).state, "invalid");
  assert.equal(validateGuidedReviewSessionV1(book, { ...session, participant: { ...session.participant, participantId: "human:other" } }).state, "invalid");
});

test("participant policy admits the builder only when the reviewed plan selects that relationship", () => {
  const builderPlan = reviewPlan("frontend", head, true, "builder");
  const book = playbook("frontend", { participantRelationship: "builder", plan: builderPlan });
  const builder = startGuidedReviewSessionV1(book, {
    sessionId: "session:builder",
    profile: "exploration",
    participant: { participantId: "human:builder", relationship: "builder", seatId: null, bindingRef: null },
    startedAt: "2026-08-13T20:00:00.000Z",
  });
  assert.equal(builder.state, "ready");
  const substituted = startGuidedReviewSessionV1(book, {
    sessionId: "session:substituted",
    profile: "exploration",
    participant: { participantId: "human:product", relationship: "product_reviewer", seatId: null, bindingRef: null },
    startedAt: "2026-08-13T20:00:00.000Z",
  });
  assert.equal(substituted.state, "invalid");
});

test("a stage remains active until all of its ordered questions pass", () => {
  const book = playbook();
  const initial = start(book);
  assert.equal(initial.currentStageId, "mission-briefing");
  assert.equal(initial.currentStepId, "intent");
  const afterOne = decide(book, initial);
  assert.equal(afterOne.currentStageId, "mission-briefing");
  assert.equal(afterOne.currentStepId, "route");
  assert.equal(afterOne.stageStates["mission-briefing"], "active");
  const afterTwo = decide(book, afterOne);
  assert.equal(afterTwo.stageStates["mission-briefing"], "passed");
  assert.equal(afterTwo.currentStageId, "field-test");
});

test("the engine rejects out-of-order answers and records FAIL as a durable stop", () => {
  const book = playbook();
  const initial = start(book);
  const outOfOrder = decideGuidedReviewStepV1(book, initial, {
    decisionId: "decision:wrong",
    stepId: "success",
    exactRevision: head,
    disposition: "pass",
    observation: "Tried to skip ahead.",
    evidenceRefs: [],
    finding: null,
    condition: null,
    decidedAt: "2026-08-13T20:01:00.000Z",
  });
  assert.equal(outOfOrder.state, "invalid");
  assert.equal(outOfOrder.code, "OUT_OF_ORDER_DECISION");
  const failed = decide(book, initial, "fail");
  assert.equal(failed.state, "blocked");
  assert.equal(failed.stepStates.intent, "failed");
  assert.equal(failed.stageStates["mission-briefing"], "blocked");
  assert.match(failed.decisions[0].finding, /Finding/u);
});

test("conditional PASS carries its condition through the final recap and checklist", () => {
  const book = playbook("spike");
  let session = start(book);
  session = decide(book, session, "conditional_pass");
  session = complete(book, session);
  const summary = summarizeGuidedReviewSessionV1(book, session);
  assert.equal(summary.state, "ready");
  assert.deepEqual(summary.value.conditions, ["Condition from placement."]);
  const checklist = renderGuidedReviewChecklistV1(book, session);
  assert.equal(checklist.state, "ready");
  assert.match(checklist.value, /Carried condition: Condition from placement\./u);
  assert.match(checklist.value, /## Placement and Purpose/u);
  assert.match(checklist.value, /human:test-reviewer/u);
});

test("frontend dogfood routes a finding through focused correction and preserves named participant evidence", () => {
  const book = playbook("frontend");
  let session = start(book);
  session = decide(book, session);
  session = decide(book, session);
  session = decide(book, session);
  session = decide(book, session, "fail", { observation: "The error modal opened, but recovery was broken.", finding: "Recovery action left the workflow blocked." });
  assert.equal(session.state, "blocked");
  const revised = reviseGuidedReviewSessionV1(book, session, {
    exactRevision: nextHead,
    plan: reviewPlan("frontend", nextHead),
    runtimeHandoff: runtimeHandoff(nextHead),
    affectedStepIds: ["failure"],
    rationale: "Same-scope recovery behavior was corrected and independently revalidated.",
    revisedAt: "2026-08-13T22:00:00.000Z",
  });
  assert.equal(revised.state, "ready", JSON.stringify(revised));
  assert.equal(revised.value.stepStates.success, "passed");
  assert.equal(revised.value.stepStates.failure, "stale");
  let completed = revised.value;
  let replayMinute = 1;
  while (completed.state !== "completed") {
    completed = decide(book, completed, "pass", { decidedAt: `2026-08-13T23:${String(replayMinute).padStart(2, "0")}:00.000Z` });
    replayMinute += 1;
  }
  assert.equal(completed.participant.participantId, "human:test-reviewer");
  assert.equal(completed.revisions.length, 1);
  const fork = evaluateGuidedReviewPublicationForkV1({ choice: "yes", exactRevision: nextHead, plan: completed.plan, playbook: book, session: completed });
  assert.equal(fork.state, "ready");
  assert.equal(fork.value.state, "pin_required");
});

test("a corrected revision stales only selected steps and their downstream dependencies", () => {
  const book = playbook("backend");
  const completed = complete(book);
  const revised = reviseGuidedReviewSessionV1(book, completed, {
    exactRevision: nextHead,
    plan: reviewPlan("backend", nextHead),
    runtimeHandoff: runtimeHandoff(nextHead),
    affectedStepIds: ["tests"],
    rationale: "Focused test coverage changed.",
    revisedAt: "2026-08-13T22:00:00.000Z",
  });
  assert.equal(revised.state, "ready");
  assert.equal(revised.value.exactRevision, nextHead);
  assert.equal(revised.value.stepStates.intent, "passed");
  assert.equal(revised.value.stepStates.tests, "stale");
  assert.equal(revised.value.stepStates.green, "stale");
  assert.equal(revised.value.stepStates["exact-candidate"], "stale");
  assert.equal(revised.value.currentStepId, "tests");
  assert.deepEqual(revised.value.revisions[0].staleStepIds, ["tests", "green", "limitations", "exact-candidate"]);
  assert.equal(revised.value.runtimeHandoff.exactRevision, nextHead);
  assert.equal(revised.value.plan.exactRevision, nextHead);
  let replayed = revised.value;
  let replayMinute = 1;
  while (replayed.state !== "completed") {
    replayed = decide(book, replayed, "pass", { decidedAt: `2026-08-13T23:${String(replayMinute).padStart(2, "0")}:00.000Z` });
    replayMinute += 1;
  }
  const fork = evaluateGuidedReviewPublicationForkV1({ choice: "yes", exactRevision: nextHead, plan: replayed.plan, playbook: book, session: replayed });
  assert.equal(fork.state, "ready");
  assert.equal(fork.value.state, "pin_required");
});

test("formal correction replay rejects a stale or blocked runtime handoff", () => {
  const book = playbook("backend");
  const completed = complete(book);
  const stale = reviseGuidedReviewSessionV1(book, completed, {
    exactRevision: nextHead,
    plan: reviewPlan("backend", nextHead),
    runtimeHandoff: base.runtimeHandoff,
    affectedStepIds: ["tests"],
    rationale: "Coverage changed.",
    revisedAt: "2026-08-13T22:00:00.000Z",
  });
  assert.equal(stale.state, "invalid");
  assert.equal(stale.code, "MALFORMED_REVISION");
  const blocked = reviseGuidedReviewSessionV1(book, completed, {
    exactRevision: nextHead,
    plan: reviewPlan("backend", nextHead),
    runtimeHandoff: runtimeHandoff(nextHead, "blocked"),
    affectedStepIds: ["tests"],
    rationale: "Coverage changed.",
    revisedAt: "2026-08-13T22:00:00.000Z",
  });
  assert.equal(blocked.state, "invalid");
  assert.equal(blocked.code, "RUNTIME_NOT_READY");
});

test("acceptance and publication profiles require a ready exact-revision runtime handoff", () => {
  const blockedBook = playbook("frontend", {
    runtimeHandoff: runtimeHandoff(head, "blocked"),
  });
  const formal = startGuidedReviewSessionV1(blockedBook, {
    sessionId: "session:blocked",
    profile: "acceptance",
    participant: { participantId: "human:test-reviewer", relationship: blockedBook.participantRelationship, seatId: "coulson", bindingRef: "binding:test-reviewer" },
    startedAt: "2026-08-13T20:00:00.000Z",
  });
  assert.equal(formal.state, "invalid");
  assert.equal(formal.code, "RUNTIME_NOT_READY");
  assert.equal(startGuidedReviewSessionV1(blockedBook, {
    sessionId: "session:explore",
    profile: "exploration",
    participant: { participantId: "human:test-reviewer", relationship: blockedBook.participantRelationship, seatId: "coulson", bindingRef: "binding:test-reviewer" },
    startedAt: "2026-08-13T20:00:00.000Z",
  }).state, "ready");
});

test("publication fork has Yes, No, and Cancel routes with exactly one remaining PIN", () => {
  const book = playbook();
  const completed = complete(book);
  const yes = evaluateGuidedReviewPublicationForkV1({ choice: "yes", exactRevision: head, plan: book.plan, playbook: book, session: completed });
  assert.equal(yes.state, "ready");
  assert.equal(yes.value.state, "pin_required");
  assert.equal(yes.value.pinPurpose, "guided_review_and_publication");
  const requiredNo = evaluateGuidedReviewPublicationForkV1({ choice: "no", exactRevision: head, plan: book.plan, playbook: null, session: null });
  assert.equal(requiredNo.state, "ready");
  assert.equal(requiredNo.value.state, "blocked");
  assert.equal(requiredNo.value.reasonCode, "GUIDED_REVIEW_REQUIRED");
  const optionalPlan = reviewPlan("frontend", head, false);
  const no = evaluateGuidedReviewPublicationForkV1({ choice: "no", exactRevision: head, plan: optionalPlan, playbook: null, session: null });
  assert.equal(no.state, "ready");
  assert.equal(no.value.guidedReviewDisposition, "skipped_by_operator");
  assert.equal(no.value.pinPurpose, "publication");
  assert.equal(validateGuidedReviewPublicationForkV1(no.value).state, "ready");
  assert.equal(validateGuidedReviewPublicationForkV1({ ...no.value, plan: book.plan }).state, "invalid");
  const cancel = evaluateGuidedReviewPublicationForkV1({ choice: "cancel", exactRevision: head, plan: book.plan, playbook: null, session: null });
  assert.equal(cancel.state, "ready");
  assert.equal(cancel.value.state, "cancelled");
  assert.equal(cancel.value.pinPurpose, null);
  const stale = evaluateGuidedReviewPublicationForkV1({ choice: "yes", exactRevision: nextHead, plan: reviewPlan("frontend", nextHead), playbook: book, session: completed });
  assert.equal(stale.state, "ready");
  assert.equal(stale.value.state, "blocked");
  assert.equal(stale.value.reasonCode, "GUIDED_REVIEW_INCOMPLETE_OR_STALE");
});

test("publication bundles carry and revalidate the complete YES chain and null evidence on No or Cancel", () => {
  const book = playbook();
  const completed = complete(book);
  const yesFork = evaluateGuidedReviewPublicationForkV1({ choice: "yes", exactRevision: head, plan: book.plan, playbook: book, session: completed });
  assert.equal(yesFork.state, "ready");
  const yes = createGuidedReviewPublicationBundleV1(publicationBundleInput(book.plan, yesFork.value, book, completed));
  assert.equal(yes.state, "ready", JSON.stringify(yes));
  assert.equal(validateGuidedReviewPublicationBundleV1(yes.value).state, "ready");
  assert.equal(yes.value.playbook.playbookDigest, book.playbookDigest);
  assert.equal(yes.value.session.sessionDigest, completed.sessionDigest);

  assert.equal(createGuidedReviewPublicationBundleV1(publicationBundleInput(book.plan, yesFork.value, null, completed)).state, "invalid");
  assert.equal(createGuidedReviewPublicationBundleV1(publicationBundleInput(book.plan, yesFork.value, book, null)).state, "invalid");
  assert.equal(createGuidedReviewPublicationBundleV1(publicationBundleInput(book.plan, yesFork.value,
    { ...book, title: "Tampered playbook bytes" }, completed)).state, "invalid");
  assert.equal(createGuidedReviewPublicationBundleV1(publicationBundleInput(book.plan, yesFork.value, book,
    { ...completed, sessionDigest: "sha256:IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII" })).state, "invalid");

  const otherPlan = reviewPlan("frontend", head, true);
  const otherBook = playbook("frontend", { plan: otherPlan, title: "Other Guided Review" });
  const otherSession = complete(otherBook);
  assert.equal(createGuidedReviewPublicationBundleV1(publicationBundleInput(book.plan, yesFork.value, otherBook, otherSession)).state, "invalid");
  assert.equal(validateGuidedReviewPublicationBundleV1({ ...yes.value, session: otherSession }).state, "invalid");

  const optional = reviewPlan("frontend", head, false);
  const noFork = evaluateGuidedReviewPublicationForkV1({ choice: "no", exactRevision: head, plan: optional, playbook: null, session: null });
  const no = createGuidedReviewPublicationBundleV1(publicationBundleInput(optional, noFork.value, null, null));
  assert.equal(no.state, "ready", JSON.stringify(no));
  assert.equal(validateGuidedReviewPublicationBundleV1(no.value).state, "ready");
  assert.equal(createGuidedReviewPublicationBundleV1(publicationBundleInput(optional, noFork.value, book, null)).state, "invalid");

  const cancelFork = evaluateGuidedReviewPublicationForkV1({ choice: "cancel", exactRevision: head, plan: book.plan, playbook: null, session: null });
  const cancel = createGuidedReviewPublicationBundleV1(publicationBundleInput(book.plan, cancelFork.value, null, null));
  assert.equal(cancel.state, "ready", JSON.stringify(cancel));
  assert.equal(validateGuidedReviewPublicationBundleV1(cancel.value).state, "ready");

  assert.equal(validateGuidedReviewPublicationBundleV1({ ...yes.value, protectedGraphDigest: "sha256:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }).state, "invalid");
  assert.equal(createGuidedReviewPublicationBundleV1(publicationBundleInput(book.plan, yesFork.value, book, completed, { policyMode: "operator_optional" })).state, "invalid");
});

test("tampered content-addressed sessions and malformed playbooks fail closed", () => {
  const book = playbook();
  const session = start(book);
  const tampered = { ...session, exactRevision: nextHead };
  const result = decideGuidedReviewStepV1(book, tampered, {
    decisionId: "decision:tampered",
    stepId: "intent",
    exactRevision: nextHead,
    disposition: "pass",
    observation: "No.",
    evidenceRefs: [],
    finding: null,
    condition: null,
    decidedAt: "2026-08-13T20:01:00.000Z",
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "INVALID_SESSION");
  assert.equal(createBuiltInGuidedReviewPlaybookV1("frontend", {
    ...base,
    exactRevision: nextHead,
  }).state, "invalid");
});
