import assert from "node:assert/strict";
import test from "node:test";

import {
  advancePhase,
  applyConfirmedReplacements,
  createCheckpointSet,
  createReviewArtifact,
  createSourceDocument,
  decodeReviewSession,
  recordConfidence,
  recordDecision,
  recordExplanation,
  recordStepReveal,
  returnToPreviousPhase,
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

test("V2 persists one-step-at-a-time reveals and records an immutable replacement", async () => {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Rail review", checkpoints, source.text);
  let session = await startReviewSession(source, set, { kind: "self_asserted", name: "Randy" }, fixedClock);

  session = success(advancePhase(session, set, expected(session, "purpose"), fixedClock));
  session = success(recordStepReveal(session, set, expected(session, "purpose", "purpose-why"), fixedClock));
  assert.deepEqual(session.answers.purpose.revealedStepIds, ["purpose-why"]);
  session = success(advancePhase(session, set, expected(session, "purpose", "purpose-why"), fixedClock));
  session = success(recordStepReveal(session, set, expected(session, "purpose", "purpose-finish"), fixedClock));
  session = success(advancePhase(session, set, expected(session, "purpose", "purpose-finish"), fixedClock));
  session = success(recordExplanation(session, set, expected(session, "purpose"), "The rail makes the next move clear and keeps the lane reusable.", fixedClock));
  session = success(recordConfidence(session, set, expected(session, "purpose"), 5, fixedClock));
  session = success(recordDecision(session, set, expected(session, "purpose"), {
    decision: "revise",
    replacement: { stepId: "purpose-finish", replacement: "The lane stays ready for reuse.", rationale: "Make the finish condition explicit." },
  }, fixedClock));

  assert.equal(session.phase, "complete");
  assert.deepEqual(session.answers.purpose.replacement, {
    stepId: "purpose-finish",
    original: "The lane stays ready.",
    replacement: "The lane stays ready for reuse.",
    rationale: "Make the finish condition explicit.",
  });
  assert.equal(applyConfirmedReplacements(source.text, [session.answers.purpose.replacement]), "# Purpose\nThe rail gives one clear next action.\nThe lane stays ready for reuse.");
});

test("a replacement cannot be recorded without a desired replacement", async () => {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Rail review", checkpoints, source.text);
  let session = await completeToDecision(source, set);
  const missing = recordDecision(session, set, expected(session, "purpose"), {
    decision: "revise",
    replacement: { stepId: "purpose-why", replacement: "", rationale: "No text." },
  }, fixedClock);
  assert.deepEqual(missing, { ok: false, code: "replacement_required", message: "Describe the desired replacement text." });
  assert.equal(session.revision, 7);
});

test("a replacement cannot repeat the immutable original", async () => {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Rail review", checkpoints, source.text);
  const session = await completeToDecision(source, set);
  const unchanged = recordDecision(session, set, expected(session, "purpose"), {
    decision: "revise",
    replacement: { stepId: "purpose-why", replacement: "one clear next action" },
  }, fixedClock);
  assert.deepEqual(unchanged, {
    ok: false,
    code: "replacement_unchanged",
    message: "The desired replacement must differ from the immutable original.",
  });
  assert.equal(session.revision, 7);
});

test("stale and replayed actions do not mutate a V2 session", async () => {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Rail review", checkpoints, source.text);
  const session = await startReviewSession(source, set, { kind: "unattributed", name: null }, fixedClock);
  const stale = advancePhase(session, set, { ...expected(session, "purpose"), revision: 4 }, fixedClock);
  assert.deepEqual(stale, { ok: false, code: "revision_stale", message: "The review changed. Reload before continuing." });
  const firstExpected = expected(session, "purpose");
  const first = success(advancePhase(session, set, firstExpected, fixedClock));
  const replay = recordStepReveal(first, set, { ...expected(first, "purpose", "purpose-why"), eventId: firstExpected.eventId }, fixedClock);
  assert.deepEqual(replay, { ok: false, code: "event_replayed", message: "That action was already applied." });
});

test("every transition rejects a checkpoint set from another session without changing state", async () => {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Rail review", checkpoints, source.text);
  const foreignSet = await createCheckpointSet("Different review", checkpoints, source.text);
  const session = await startReviewSession(source, set, { kind: "unattributed", name: null }, fixedClock);
  const snapshot = structuredClone(session);
  const checkpointExpected = expected(session, "purpose");
  const stepExpected = expected(session, "purpose", "purpose-why");
  const attempts = [
    advancePhase(session, foreignSet, checkpointExpected, fixedClock),
    recordStepReveal(session, foreignSet, stepExpected, fixedClock),
    returnToPreviousPhase(session, foreignSet, checkpointExpected, fixedClock),
    recordExplanation(session, foreignSet, checkpointExpected, "A sufficiently long forged explanation.", fixedClock),
    recordConfidence(session, foreignSet, checkpointExpected, 3, fixedClock),
    recordDecision(session, foreignSet, checkpointExpected, { decision: "approve" }, fixedClock),
  ];

  for (const attempt of attempts) {
    assert.equal(attempt.ok, false);
    assert.equal(attempt.code, "checkpoint_set_mismatch");
  }
  assert.deepEqual(session, snapshot);
});

test("transitions require the active checkpoint and active learning step without changing state", async () => {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Rail review", checkpoints, source.text);
  const session = await startReviewSession(source, set, { kind: "unattributed", name: null }, fixedClock);
  const snapshot = structuredClone(session);

  const wrongCheckpoint = advancePhase(session, set, expected(session, "not-active"), fixedClock);
  const wrongStep = advancePhase(session, set, expected(session, "purpose", "purpose-finish"), fixedClock);

  assert.equal(wrongCheckpoint.ok, false);
  assert.equal(wrongCheckpoint.code, "checkpoint_mismatch");
  assert.equal(wrongStep.ok, false);
  assert.equal(wrongStep.code, "step_mismatch");
  assert.deepEqual(session, snapshot);
});

test("the closed decoder rejects forged and cross-bound persisted sessions", async () => {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Rail review", checkpoints, source.text);
  const session = await completeToDecision(source, set);
  const persisted = JSON.parse(JSON.stringify(session));
  assert.equal(decodeReviewSession(persisted, source, set).ok, true);

  const crossSource = await createSourceDocument("Other rail", `${sourceText}\n`);
  const crossSet = await createCheckpointSet("Other review", checkpoints, crossSource.text);
  assert.equal(decodeReviewSession(persisted, crossSource, set).ok, false);
  assert.equal(decodeReviewSession(persisted, source, crossSet).ok, false);

  const forgedShape = { ...persisted, injected: true };
  assert.equal(decodeReviewSession(forgedShape, source, set).ok, false);
  const forgedAnswers = structuredClone(persisted);
  forgedAnswers.answers.purpose.revealedStepIds.reverse();
  assert.equal(decodeReviewSession(forgedAnswers, source, set).ok, false);
  const forgedEvents = structuredClone(persisted);
  forgedEvents.events[1].eventId = forgedEvents.events[0].eventId;
  assert.equal(decodeReviewSession(forgedEvents, source, set).ok, false);
  const forgedRevision = { ...persisted, revision: persisted.revision + 1 };
  assert.equal(decodeReviewSession(forgedRevision, source, set).ok, false);
  const forgedPhase = { ...persisted, phase: "complete" };
  assert.equal(decodeReviewSession(forgedPhase, source, set).ok, false);
});

test("artifact records source and revised digests plus ordered replacements", async () => {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Rail review", checkpoints, source.text);
  const session = await completeToDecision(source, set);
  const complete = success(recordDecision(session, set, expected(session, "purpose"), {
    decision: "revise",
    replacement: { stepId: "purpose-why", replacement: "one clearly explained next action" },
  }, fixedClock));
  const artifact = await createReviewArtifact(source, set, complete);
  assert.equal(artifact.schemaVersion, 2);
  assert.equal(artifact.sourceDigest, source.sourceDigest);
  assert.notEqual(artifact.revisedSourceDigest, source.sourceDigest);
  assert.equal(artifact.replacements[0].original, "one clear next action");
  assert.equal(artifact.authority, "none");
  assert.equal(artifact.effect, "educational_review_only");
});

test("artifact creation rejects cross-bound and malformed completed sessions", async () => {
  const source = await createSourceDocument("Rail", sourceText);
  const set = await createCheckpointSet("Rail review", checkpoints, source.text);
  const atDecision = await completeToDecision(source, set);
  const complete = success(recordDecision(atDecision, set, expected(atDecision, "purpose"), {
    decision: "approve",
  }, fixedClock));
  const crossSource = await createSourceDocument("Other rail", `${sourceText}\n`);
  const crossSet = await createCheckpointSet("Other review", checkpoints, source.text);

  await assert.rejects(createReviewArtifact(crossSource, set, complete), /source (ID|digest) does not match/u);
  await assert.rejects(createReviewArtifact(source, crossSet, complete), /checkpoint-set (ID|digest) does not match/u);

  const malformed = structuredClone(complete);
  malformed.answers.purpose.decision = null;
  malformed.answers.purpose.decidedAt = null;
  await assert.rejects(createReviewArtifact(source, set, malformed), /Invalid review session/u);
});

async function completeToDecision(source, set) {
  let session = await startReviewSession(source, set, { kind: "unattributed", name: null }, fixedClock);
  session = success(advancePhase(session, set, expected(session, "purpose"), fixedClock));
  session = success(recordStepReveal(session, set, expected(session, "purpose", "purpose-why"), fixedClock));
  session = success(advancePhase(session, set, expected(session, "purpose", "purpose-why"), fixedClock));
  session = success(recordStepReveal(session, set, expected(session, "purpose", "purpose-finish"), fixedClock));
  session = success(advancePhase(session, set, expected(session, "purpose", "purpose-finish"), fixedClock));
  session = success(recordExplanation(session, set, expected(session, "purpose"), "The rail makes the next move clear and keeps the lane reusable.", fixedClock));
  return success(recordConfidence(session, set, expected(session, "purpose"), 4, fixedClock));
}

function step(stepId, sourceQuote) {
  return {
    stepId,
    sourceQuote,
    purpose: "Notice the main idea.",
    question: "What does this idea change for the reader?",
    explanation: "It gives the reader a simple way to understand the decision.",
    whyItMatters: "A clear explanation helps the reader evaluate the document.",
  };
}

function expected(session, checkpointId, stepId) {
  return { eventId: crypto.randomUUID(), checkpointId, ...(stepId ? { stepId } : {}), phase: session.phase, revision: session.revision };
}

function success(result) {
  assert.equal(result.ok, true);
  return result.session;
}
