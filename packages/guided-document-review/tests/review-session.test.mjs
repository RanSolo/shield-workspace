import assert from "node:assert/strict";
import test from "node:test";

import {
  advancePhase,
  createCheckpointSet,
  createReviewArtifact,
  createSourceDocument,
  recordConfidence,
  recordDecision,
  recordExplanation,
  returnToPreviousPhase,
  startReviewSession,
} from "../dist/index.js";

const checkpoints = [{
  checkpointId: "purpose",
  title: "Purpose",
  sourceSearch: "purpose",
  teaching: "Find the problem the document solves.",
  question: "What problem does it solve?",
  whyItMatters: "A plan without a problem is activity, not direction.",
}];

const fixedClock = () => "2026-08-28T20:00:00.000Z";

test("a complete explain-back journey produces educational evidence", async () => {
  const source = await createSourceDocument("Rail", "# Purpose\nBuild a clear path.");
  const set = await createCheckpointSet("Rail review", checkpoints);
  let session = await startReviewSession(source, set, { kind: "self_asserted", name: "Randy" }, fixedClock);

  session = success(advancePhase(session, expected(session, "purpose", "one"), fixedClock));
  session = success(advancePhase(session, expected(session, "purpose", "two"), fixedClock));
  session = success(recordExplanation(
    session,
    expected(session, "purpose", "three"),
    "The rail gives agents one clear next action while keeping humans informed.",
    fixedClock,
  ));
  session = success(recordConfidence(session, expected(session, "purpose", "four"), 5, fixedClock));
  session = success(recordDecision(session, set, expected(session, "purpose", "five"), { decision: "understand" }, fixedClock));

  const artifact = await createReviewArtifact(source, set, session);
  assert.equal(session.phase, "complete");
  assert.equal(artifact.authority, "none");
  assert.equal(artifact.effect, "educational_review_only");
  assert.deepEqual(artifact.summary, { understand: 1, question: 0, revise: 0, approve: 0 });
});

test("a reviewer can revisit earlier checkpoint steps without losing an answer", async () => {
  const source = await createSourceDocument("Rail", "# Purpose\nBuild a clear path.");
  const set = await createCheckpointSet("Rail review", checkpoints);
  let session = await startReviewSession(source, set, { kind: "unattributed", name: null }, fixedClock);

  session = success(advancePhase(session, expected(session, "purpose", "back-one"), fixedClock));
  session = success(advancePhase(session, expected(session, "purpose", "back-two"), fixedClock));
  session = success(recordExplanation(
    session,
    expected(session, "purpose", "back-three"),
    "The rail gives every participant one clear next action.",
    fixedClock,
  ));
  session = success(returnToPreviousPhase(session, expected(session, "purpose", "back-four"), fixedClock));

  assert.equal(session.phase, "explain_back");
  assert.equal(session.answers.purpose.explanation, "The rail gives every participant one clear next action.");
});

test("Needs revision requires an actionable change request", async () => {
  const source = await createSourceDocument("Rail", "# Purpose\nBuild a clear path.");
  const set = await createCheckpointSet("Rail review", checkpoints);
  let session = await startReviewSession(source, set, { kind: "unattributed", name: null }, fixedClock);

  session = success(advancePhase(session, expected(session, "purpose", "one"), fixedClock));
  session = success(advancePhase(session, expected(session, "purpose", "two"), fixedClock));
  session = success(recordExplanation(session, expected(session, "purpose", "three"), "This explanation is long enough to continue.", fixedClock));
  session = success(recordConfidence(session, expected(session, "purpose", "four"), 3, fixedClock));

  const missing = recordDecision(session, set, expected(session, "purpose", "five"), { decision: "revise" }, fixedClock);
  assert.deepEqual(missing, {
    ok: false,
    code: "change_request_required",
    message: "Describe the requested change before choosing Needs revision.",
  });
  assert.equal(session.revision, 4);

  session = success(recordDecision(session, set, expected(session, "purpose", "six"), {
    decision: "revise",
    requestedChange: "Define what a clear path means and add one concrete example.",
  }, fixedClock));
  assert.equal(session.answers.purpose.requestedChange, "Define what a clear path means and add one concrete example.");
});

test("stale, replayed, and out-of-order actions do not mutate a session", async () => {
  const source = await createSourceDocument("Rail", "# Purpose\nBuild a clear path.");
  const set = await createCheckpointSet("Rail review", checkpoints);
  const session = await startReviewSession(source, set, { kind: "unattributed", name: null }, fixedClock);

  const stale = advancePhase(session, { ...expected(session, "purpose", "stale"), revision: 4 }, fixedClock);
  assert.deepEqual(stale, { ok: false, code: "revision_stale", message: "The review changed. Reload before continuing." });
  assert.equal(session.revision, 0);

  const first = success(advancePhase(session, expected(session, "purpose", "same-event"), fixedClock));
  const replay = advancePhase(first, expected(first, "purpose", "same-event"), fixedClock);
  assert.equal(replay.ok, false);
  assert.equal(first.revision, 1);

  const earlyAnswer = recordExplanation(session, expected(session, "purpose", "early"), "This answer is long enough to save.", fixedClock);
  assert.equal(earlyAnswer.ok, false);
  assert.equal(session.answers.purpose.explanation, null);
});

test("source and checkpoint identities are deterministic", async () => {
  const firstSource = await createSourceDocument("Rail", "same bytes");
  const secondSource = await createSourceDocument("Rail", "same bytes");
  const firstSet = await createCheckpointSet("Review", checkpoints);
  const secondSet = await createCheckpointSet("Review", checkpoints);
  assert.equal(firstSource.sourceDigest, secondSource.sourceDigest);
  assert.equal(firstSet.checkpointSetDigest, secondSet.checkpointSetDigest);
});

function expected(session, checkpointId, eventId) {
  return { eventId, checkpointId, phase: session.phase, revision: session.revision };
}

function success(result) {
  assert.equal(result.ok, true);
  return result.session;
}
