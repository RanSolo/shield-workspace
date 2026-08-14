import assert from "node:assert/strict";
import test from "node:test";

import {
  GUIDED_REVIEW_CONTRACT_VERSION,
  decideGuidedReviewStepV1,
  evaluateGuidedReviewPublicationForkV1,
  renderGuidedReviewChecklistV1,
  reviseGuidedReviewSessionV1,
  startGuidedReviewSessionV1,
  summarizeGuidedReviewSessionV1,
} from "../dist/guided-review-v1.mjs";
import {
  BUILT_IN_GUIDED_REVIEW_PLAYBOOK_IDS,
  createBuiltInGuidedReviewPlaybookV1,
} from "../dist/guided-review-playbooks-v1.mjs";

const head = "1234567890abcdef1234567890abcdef12345678";
const nextHead = "abcdef1234567890abcdef1234567890abcdef12";
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
  runtimeHandoff: {
    status: "ready",
    receiptDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    exactRevision: head,
    environmentRef: "environment:test",
    launchCommandRef: "command:start",
    healthProbeRef: "probe:ready",
    reviewUrl: "http://127.0.0.1:5173/",
    teardownRef: "command:stop",
    externalEffectPolicyRef: "policy:no-external-effects",
  },
  relevantPaths: ["packages/shield-team-system/src/guided-review-v1.mts"],
  evidenceRefs: ["evidence:test:guided-review"],
};

function playbook(kind = "product_qa", overrides = {}) {
  const result = createBuiltInGuidedReviewPlaybookV1(kind, { ...base, ...overrides });
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}

function start(book = playbook(), profile = "publication") {
  const result = startGuidedReviewSessionV1(book, {
    sessionId: "session:issue-238",
    profile,
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
    "guided-review:product-qa:v1",
    "guided-review:code:v1",
    "guided-review:document-spike:v1",
  ]);
  for (const kind of ["product_qa", "code", "document"]) {
    const book = playbook(kind);
    assert.equal(book.contractVersion, GUIDED_REVIEW_CONTRACT_VERSION);
    assert.ok(book.stages.length >= 4);
    assert.ok(book.stages.every((stage) => stage.steps.length >= 2));
    assert.ok(book.stages.every((stage) => stage.checkpointId === `checkpoint:${stage.stageId}`));
    assert.ok(book.stages.flatMap((stage) => stage.steps).every((step) => !step.question.includes("\n")));
  }
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
  const book = playbook("document");
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
});

test("a corrected revision stales only selected steps and their downstream dependencies", () => {
  const book = playbook("code");
  const completed = complete(book);
  const revised = reviseGuidedReviewSessionV1(book, completed, {
    exactRevision: nextHead,
    runtimeHandoff: { ...base.runtimeHandoff, exactRevision: nextHead, receiptDigest: "sha256:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" },
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
});

test("formal correction replay rejects a stale or blocked runtime handoff", () => {
  const book = playbook("code");
  const completed = complete(book);
  const stale = reviseGuidedReviewSessionV1(book, completed, {
    exactRevision: nextHead,
    runtimeHandoff: base.runtimeHandoff,
    affectedStepIds: ["tests"],
    rationale: "Coverage changed.",
    revisedAt: "2026-08-13T22:00:00.000Z",
  });
  assert.equal(stale.state, "invalid");
  assert.equal(stale.code, "MALFORMED_REVISION");
  const blocked = reviseGuidedReviewSessionV1(book, completed, {
    exactRevision: nextHead,
    runtimeHandoff: { ...base.runtimeHandoff, exactRevision: nextHead, status: "blocked" },
    affectedStepIds: ["tests"],
    rationale: "Coverage changed.",
    revisedAt: "2026-08-13T22:00:00.000Z",
  });
  assert.equal(blocked.state, "invalid");
  assert.equal(blocked.code, "RUNTIME_NOT_READY");
});

test("acceptance and publication profiles require a ready exact-revision runtime handoff", () => {
  const blockedBook = playbook("product_qa", {
    runtimeHandoff: { ...base.runtimeHandoff, status: "blocked" },
  });
  const formal = startGuidedReviewSessionV1(blockedBook, {
    sessionId: "session:blocked",
    profile: "acceptance",
    startedAt: "2026-08-13T20:00:00.000Z",
  });
  assert.equal(formal.state, "invalid");
  assert.equal(formal.code, "RUNTIME_NOT_READY");
  assert.equal(startGuidedReviewSessionV1(blockedBook, {
    sessionId: "session:explore",
    profile: "exploration",
    startedAt: "2026-08-13T20:00:00.000Z",
  }).state, "ready");
});

test("publication fork has Yes, No, and Cancel routes with exactly one remaining PIN", () => {
  const book = playbook();
  const completed = complete(book);
  const yes = evaluateGuidedReviewPublicationForkV1({ choice: "yes", exactRevision: head, playbook: book, session: completed });
  assert.equal(yes.state, "ready");
  assert.equal(yes.value.state, "pin_required");
  assert.equal(yes.value.pinPurpose, "guided_review_and_publication");
  const no = evaluateGuidedReviewPublicationForkV1({ choice: "no", exactRevision: head, playbook: null, session: null });
  assert.equal(no.state, "ready");
  assert.equal(no.value.guidedReviewDisposition, "skipped_by_operator");
  assert.equal(no.value.pinPurpose, "publication");
  const cancel = evaluateGuidedReviewPublicationForkV1({ choice: "cancel", exactRevision: head, playbook: null, session: null });
  assert.equal(cancel.state, "ready");
  assert.equal(cancel.value.state, "cancelled");
  assert.equal(cancel.value.pinPurpose, null);
  const stale = evaluateGuidedReviewPublicationForkV1({ choice: "yes", exactRevision: nextHead, playbook: book, session: completed });
  assert.equal(stale.state, "ready");
  assert.equal(stale.value.state, "blocked");
  assert.equal(stale.value.reasonCode, "GUIDED_REVIEW_INCOMPLETE_OR_STALE");
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
  assert.equal(createBuiltInGuidedReviewPlaybookV1("product_qa", {
    ...base,
    exactRevision: nextHead,
  }).state, "invalid");
});
