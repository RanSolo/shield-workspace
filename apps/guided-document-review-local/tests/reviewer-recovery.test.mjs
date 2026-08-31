import assert from "node:assert/strict";
import test from "node:test";
import {
  advancePhase,
  createCheckpointSet,
  createReviewArtifact,
  createSourceDocument,
  decodeReviewSession,
  recordStepDisposition,
  startReviewSession,
} from "@shield/guided-document-review";
import {
  carryForwardAnswersForReviewer,
  exactDraftForReviewer,
} from "../src/prepared-trail.mjs";

const reviewerA = { kind: "self_asserted", name: "Reviewer A" };
const reviewerB = { kind: "self_asserted", name: "Reviewer B" };
const clock = () => "2026-08-30T20:00:00.000Z";

test("A→B exact draft recovery rejects reviewer mismatch while same-reviewer restore stays codec-valid and exportable", async () => {
  const { source, set, session } = await completedFixture();
  const decoded = await decodeReviewSession(structuredClone(session), source, set);
  assert.equal(decoded.ok, true);
  assert.equal(exactDraftForReviewer(decoded.session, reviewerB), null);

  const restored = exactDraftForReviewer(decoded.session, reviewerA);
  assert.equal(restored, decoded.session);
  assert.equal((await decodeReviewSession(structuredClone(restored), source, set)).ok, true);
  const artifact = await createReviewArtifact(source, set, restored);
  assert.deepEqual(artifact.reviewer, reviewerA);
  assert.deepEqual(artifact.dispositions[0].reviewer, reviewerA);
});

test("A→B carry-forward rejects mismatched and legacy seeded drafts but accepts the same reviewer", async () => {
  const { source, session } = await completedFixture();
  const candidate = { sourceDigest: source.sourceDigest, reviewer: reviewerA, answers: session.answers };
  assert.equal(carryForwardAnswersForReviewer(candidate, source.sourceDigest, reviewerB), null);
  assert.equal(carryForwardAnswersForReviewer({ sourceDigest: source.sourceDigest, answers: session.answers }, source.sourceDigest, reviewerA), null);
  assert.equal(carryForwardAnswersForReviewer(candidate, source.sourceDigest, reviewerA), session.answers);
});

async function completedFixture() {
  const text = "# Review\nThe exact reviewer owns this disposition.";
  const source = await createSourceDocument("Reviewer recovery", text);
  const set = await createCheckpointSet("Reviewer recovery", [{
    checkpointId: "identity",
    title: "Reviewer identity",
    reviewMode: "disposition",
    learningSteps: [{
      stepId: "identity-step",
      sourceQuote: "The exact reviewer owns this disposition.",
      purpose: "Bind the human disposition to its reviewer.",
      question: "Is this disposition owned by the active reviewer?",
      explanation: "Reviewer identity must not move with recovered answers.",
      whyItMatters: "Exports must preserve the human who actually made the disposition.",
    }],
  }], text);
  let session = await startReviewSession(source, set, reviewerA, clock);
  session = success(advancePhase(session, set, expected(session), clock));
  session = success(recordStepDisposition(session, set, expected(session, "identity-step"), { disposition: "pass" }, clock));
  assert.equal(session.phase, "complete");
  return { source, set, session };
}

function expected(session, stepId) {
  return {
    eventId: crypto.randomUUID(),
    checkpointId: "identity",
    ...(stepId ? { stepId } : {}),
    phase: session.phase,
    revision: session.revision,
  };
}

function success(result) {
  assert.equal(result.ok, true, result.ok ? "" : result.message);
  return result.session;
}
