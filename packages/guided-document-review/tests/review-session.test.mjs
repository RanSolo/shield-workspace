import assert from "node:assert/strict";
import test from "node:test";

import {
  advancePhase,
  applyConfirmedReplacements,
  createCheckpointSet,
  createReviewArtifact,
  createSourceDocument,
  decodeReviewSession,
  recordExplanation,
  recordStepDisposition,
  reopenCheckpoint,
  startReviewSession,
} from "../dist/index.js";

const sourceText = "# Purpose\nThe rail gives one clear next action.\nThe lane stays ready.";
const checkpoints = [{
  checkpointId: "purpose",
  title: "Purpose",
  learningSteps: [
    step("purpose-why", "one clear next action"),
    step("purpose-finish", "The lane stays ready."),
  ],
}];
const fixedClock = () => "2026-08-28T20:00:00.000Z";

test("each passage records an ordered PASS or revision before checkpoint reflection", async () => {
  const { source, set, session: initial } = await fixture();
  let session = begin(initial, set);
  session = passStep(session, set, "purpose-why");
  assert.equal(session.currentStepIndex, 1);
  assert.deepEqual(session.answers.purpose.revealedStepIds, ["purpose-why"]);
  assert.equal(session.answers.purpose.stepDispositions[0].disposition, "pass");

  session = reviseStep(session, set, "purpose-finish", "The lane stays ready for reuse.", "Make reuse explicit.");
  assert.equal(session.phase, "explain_back");
  session = success(recordExplanation(
    session,
    set,
    expected(session, "purpose"),
    "The rail chooses the next action and leaves the stable lane ready for reuse.",
    fixedClock,
  ));
  assert.equal(session.phase, "complete");
  assert.equal(session.answers.purpose.decision, "revise");
  assert.equal(session.answers.purpose.replacements.length, 1);
  assert.equal(
    applyConfirmedReplacements(source.text, session.answers.purpose.replacements),
    "# Purpose\nThe rail gives one clear next action.\nThe lane stays ready for reuse.",
  );
});

test("a disposition checkpoint finalizes after its last passage", async () => {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Principle review", [{
    checkpointId: "principle-one",
    title: "Principle 1",
    reviewMode: "disposition",
    learningSteps: [step("principle-one-step", "one clear next action")],
  }], source.text);
  let session = await startReviewSession(source, set, { kind: "self_asserted", name: "Randy" }, fixedClock);
  session = begin(session, set, "principle-one");
  session = passStep(session, set, "principle-one-step", "principle-one");
  assert.equal(session.phase, "complete");
  assert.equal(session.answers["principle-one"].decision, "approve");
  assert.equal(session.answers["principle-one"].explanation, null);
});

test("a configured code-review checkpoint records Question and Needs QA as human dispositions", async () => {
  const source = await createSourceDocument("Review", sourceText);
  const set = await createCheckpointSet("Code review", [{
    checkpointId: "ac-one",
    title: "Acceptance criterion 1",
    reviewMode: "disposition",
    dispositionOptions: ["pass", "question", "needs_qa", "revise"],
    learningSteps: [step("ac-one-step", "one clear next action")],
  }], source.text);
  let questionSession = await startReviewSession(source, set, { kind: "self_asserted", name: "Randy" }, fixedClock);
  questionSession = begin(questionSession, set, "ac-one");
  questionSession = success(recordStepDisposition(questionSession, set, expected(questionSession, "ac-one", "ac-one-step"), { disposition: "question" }, fixedClock));
  assert.equal(questionSession.answers["ac-one"].decision, "question");
  assert.equal((await decodeReviewSession(structuredClone(questionSession), source, set)).ok, true);

  let qaSession = await startReviewSession(source, set, { kind: "self_asserted", name: "Randy" }, fixedClock);
  qaSession = begin(qaSession, set, "ac-one");
  qaSession = success(recordStepDisposition(qaSession, set, expected(qaSession, "ac-one", "ac-one-step"), { disposition: "needs_qa" }, fixedClock));
  assert.equal(qaSession.answers["ac-one"].decision, "needs_qa");
  assert.equal((await decodeReviewSession(structuredClone(qaSession), source, set)).ok, true);
  const questionArtifact = await createReviewArtifact(source, set, questionSession);
  const qaArtifact = await createReviewArtifact(source, set, qaSession);
  assert.equal(questionArtifact.dispositions[0].disposition, "QUESTION");
  assert.equal(qaArtifact.dispositions[0].disposition, "NEEDS_QA");
  assert.equal(questionArtifact.dispositions[0].reviewer.name, "Randy");
  assert.equal(typeof questionArtifact.dispositions[0].decidedAt, "string");
});

test("step revisions require changed text and PASS forbids replacement material", async () => {
  const { set, session: initial } = await fixture();
  const session = begin(initial, set);
  const blank = recordStepDisposition(session, set, expected(session, "purpose", "purpose-why"), {
    disposition: "revise",
    replacement: { stepId: "purpose-why", replacement: "" },
  }, fixedClock);
  assert.equal(blank.ok, false);
  assert.equal(blank.code, "replacement_required");
  const unchanged = recordStepDisposition(session, set, expected(session, "purpose", "purpose-why"), {
    disposition: "revise",
    replacement: { stepId: "purpose-why", replacement: "one clear next action" },
  }, fixedClock);
  assert.equal(unchanged.ok, false);
  assert.equal(unchanged.code, "replacement_unchanged");
  const forbidden = recordStepDisposition(session, set, expected(session, "purpose", "purpose-why"), {
    disposition: "pass",
    replacement: { stepId: "purpose-why", replacement: "different" },
  }, fixedClock);
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.code, "replacement_forbidden");
});

test("step transitions fail closed on replay, stale revision, wrong step, and foreign set", async () => {
  const { source, set, session: initial } = await fixture();
  const session = begin(initial, set);
  const foreignSet = await createCheckpointSet("Foreign", checkpoints, source.text);
  const action = expected(session, "purpose", "purpose-why");
  const applied = success(recordStepDisposition(session, set, action, { disposition: "pass" }, fixedClock));
  const replay = recordStepDisposition(applied, set, { ...expected(applied, "purpose", "purpose-finish"), eventId: action.eventId }, { disposition: "pass" }, fixedClock);
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "event_replayed");
  const stale = recordStepDisposition(applied, set, { ...expected(applied, "purpose", "purpose-finish"), revision: 0 }, { disposition: "pass" }, fixedClock);
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "revision_stale");
  const wrong = recordStepDisposition(session, set, expected(session, "purpose", "purpose-finish"), { disposition: "pass" }, fixedClock);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, "step_mismatch");
  const foreign = recordStepDisposition(session, foreignSet, action, { disposition: "pass" }, fixedClock);
  assert.equal(foreign.ok, false);
  assert.equal(foreign.code, "checkpoint_set_mismatch");
});

test("a completed session decodes closed and rejects identity or disposition tampering", async () => {
  const { source, set, session: initial } = await fixture();
  const complete = completeApproved(begin(initial, set), set);
  assert.equal((await decodeReviewSession(JSON.parse(JSON.stringify(complete)), source, set)).ok, true);
  assert.equal((await decodeReviewSession({ ...structuredClone(complete), sessionId: "session:tampered" }, source, set)).ok, false);
  const wrongDisposition = structuredClone(complete);
  wrongDisposition.answers.purpose.stepDispositions[0].stepId = "purpose-finish";
  assert.equal((await decodeReviewSession(wrongDisposition, source, set)).ok, false);
  const wrongAggregate = structuredClone(complete);
  wrongAggregate.answers.purpose.decision = "revise";
  assert.equal((await decodeReviewSession(wrongAggregate, source, set)).ok, false);
});

test("legacy V2 answers migrate without inventing events", async () => {
  const { source, set, session: initial } = await fixture();
  let complete = begin(initial, set);
  complete = passStep(complete, set, "purpose-why");
  complete = reviseStep(complete, set, "purpose-finish", "The lane stays ready for reuse.");
  complete = success(recordExplanation(complete, set, expected(complete, "purpose"), "The rail stays deterministic and the lane remains reusable after delivery.", fixedClock));
  const legacy = structuredClone(complete);
  delete legacy.answers.purpose.replacements;
  delete legacy.answers.purpose.stepDispositions;
  legacy.events.push({ eventId: "legacy-final-decision", checkpointId: "purpose", stepId: null, phase: "decide", revision: legacy.revision, recordedAt: legacy.updatedAt });
  legacy.revision += 1;
  const decoded = await decodeReviewSession(legacy, source, set);
  assert.equal(decoded.ok, true, decoded.ok ? "" : decoded.errors.join(" "));
  assert.equal(decoded.migrated, true);
  assert.deepEqual(decoded.session.answers.purpose.stepDispositions.map(({ disposition }) => disposition), ["pass", "revise"]);
  assert.deepEqual(decoded.session.events, legacy.events);
});

test("artifacts preserve multiple replacements in checkpoint and step order", async () => {
  const { source, set, session: initial } = await fixture();
  let session = begin(initial, set);
  session = reviseStep(session, set, "purpose-why", "one deterministic next action");
  session = reviseStep(session, set, "purpose-finish", "The stable lane stays ready for reuse.");
  session = success(recordExplanation(session, set, expected(session, "purpose"), "Both passages now state deterministic progress and reusable lane completion clearly.", fixedClock));
  const artifact = await createReviewArtifact(source, set, session, {
    packetId: "pr-review:example/repo#13:0123456789abcdef",
    packetDigest: `sha256:${"a".repeat(64)}`,
    repository: "example/repo",
    pullRequestNumber: 13,
    headRevision: "b".repeat(40),
  });
  assert.equal(artifact.schemaVersion, 3);
  assert.deepEqual(artifact.replacements.map(({ stepId }) => stepId), ["purpose-why", "purpose-finish"]);
  assert.deepEqual(artifact.dispositions.map(({ disposition }) => disposition), ["REVISE", "REVISE"]);
  assert.equal(artifact.reviewBinding?.headRevision, "b".repeat(40));
  assert.equal(artifact.guidance[0].provenance.kind, "checkpoint_projection");
  assert.notEqual(artifact.revisedSourceDigest, source.sourceDigest);
  assert.equal(artifact.authority, "none");
});

test("replacement application rejects duplicate and overlapping originals", () => {
  const first = { stepId: "one", original: "abc", replacement: "ABC", rationale: null };
  assert.throws(() => applyConfirmedReplacements("abc def", [first, first]), /repeat an original/u);
  assert.throws(() => applyConfirmedReplacements("abc def", [first, { stepId: "two", original: "abc def", replacement: "changed", rationale: null }]), /must not overlap/u);
});

test("a completed breadcrumb can reopen one checkpoint without losing later answers", async () => {
  const source = await createSourceDocument("Rail", "First passage.\n\nSecond passage.");
  const set = await createCheckpointSet("Trail", [
    { checkpointId: "first", title: "First", learningSteps: [step("first-step", "First passage.")] },
    { checkpointId: "second", title: "Second", learningSteps: [step("second-step", "Second passage.")] },
  ], source.text);
  let session = await startReviewSession(source, set, { kind: "self_asserted", name: "Randy" }, fixedClock);
  session = begin(session, set, "first");
  session = passStep(session, set, "first-step", "first");
  session = success(recordExplanation(session, set, expected(session, "first"), "First explanation remains available when this checkpoint is reopened.", fixedClock));
  session = begin(session, set, "second");
  session = passStep(session, set, "second-step", "second");
  session = success(recordExplanation(session, set, expected(session, "second"), "Second explanation and decision must remain durable and complete.", fixedClock));
  assert.equal(session.phase, "complete");

  session = success(reopenCheckpoint(session, set, expected(session, "first"), "first", fixedClock));
  assert.equal(session.currentCheckpointIndex, 0);
  assert.equal(session.answers.first.decision, null);
  assert.match(session.answers.first.explanation, /remains available/u);
  assert.equal(session.answers.second.decision, "approve");

  session = begin(session, set, "first");
  session = passStep(session, set, "first-step", "first");
  session = success(recordExplanation(session, set, expected(session, "first"), session.answers.first.explanation, fixedClock));
  assert.equal(session.phase, "complete");
  assert.equal(session.answers.second.decision, "approve");
});

async function fixture() {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Rail review", checkpoints, source.text);
  const session = await startReviewSession(source, set, { kind: "self_asserted", name: "Randy" }, fixedClock);
  return { source, set, session };
}

function begin(session, set, checkpointId = "purpose") {
  return success(advancePhase(session, set, expected(session, checkpointId), fixedClock));
}

function passStep(session, set, stepId, checkpointId = "purpose") {
  return success(recordStepDisposition(session, set, expected(session, checkpointId, stepId), { disposition: "pass" }, fixedClock));
}

function reviseStep(session, set, stepId, replacement, rationale, checkpointId = "purpose") {
  return success(recordStepDisposition(session, set, expected(session, checkpointId, stepId), {
    disposition: "revise",
    replacement: { stepId, replacement, ...(rationale ? { rationale } : {}) },
  }, fixedClock));
}

function completeApproved(session, set) {
  session = passStep(session, set, "purpose-why");
  session = passStep(session, set, "purpose-finish");
  return success(recordExplanation(session, set, expected(session, "purpose"), "The rail chooses one action and leaves the delivery lane ready for reuse.", fixedClock));
}

function step(stepId, sourceQuote) {
  return { stepId, sourceQuote, purpose: "Notice the main idea.", question: "What does this idea change for the reader?", explanation: "It gives the reader a simple way to understand the decision.", whyItMatters: "A clear explanation helps the reader evaluate the document." };
}

function expected(session, checkpointId, stepId) {
  return { eventId: crypto.randomUUID(), checkpointId, ...(stepId ? { stepId } : {}), phase: session.phase, revision: session.revision };
}

function success(result) {
  assert.equal(result.ok, true, result.ok ? "" : `${result.code}: ${result.message}`);
  return result.session;
}
