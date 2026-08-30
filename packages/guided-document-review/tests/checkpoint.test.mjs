import assert from "node:assert/strict";
import test from "node:test";

import { checkpointsFromHeadings, createCheckpointSet, validateCheckpoints } from "../dist/index.js";

const source = "# First\nFirst body.\n## Second\nSecond body.";
const step = (stepId, sourceQuote) => ({
  stepId,
  sourceQuote,
  purpose: "Notice the main idea.",
  question: "What does this idea change?",
  explanation: "It changes how the reader understands the decision.",
  whyItMatters: "This keeps the decision grounded in the source.",
});

test("headings become ordered V2 learning checkpoints", () => {
  const checkpoints = checkpointsFromHeadings(source);
  assert.deepEqual(checkpoints.map(({ checkpointId, title, learningSteps }) => ({
    checkpointId, title, steps: learningSteps.length,
  })), [
    { checkpointId: "section-1", title: "First", steps: 1 },
    { checkpointId: "section-2", title: "Second", steps: 1 },
  ]);
});

test("V2 validation enforces closed shapes, 1–3 steps, unique IDs, and exact unique source quotes", async () => {
  const checkpoint = { checkpointId: "one", title: "One", learningSteps: [step("one-step", "First body.")] };
  assert.equal(validateCheckpoints([{ ...checkpoint, surprise: true }], source).ok, false);
  assert.equal(validateCheckpoints([{ ...checkpoint, reviewMode: "unknown" }], source).ok, false);
  assert.equal(validateCheckpoints([{ ...checkpoint, reviewMode: "disposition" }], source).ok, true);
  assert.equal(validateCheckpoints([{ ...checkpoint, learningSteps: [{
    ...checkpoint.learningSteps[0],
    priorReview: { disposition: "pass", note: "Previously accepted as non-negotiable." },
  }] }], source).ok, true);
  assert.equal(validateCheckpoints([{ ...checkpoint, learningSteps: [{
    ...checkpoint.learningSteps[0],
    priorReview: { disposition: "maybe", note: "Ambiguous prior answer." },
  }] }], source).ok, false);
  assert.equal(validateCheckpoints([{ ...checkpoint, learningSteps: [] }], source).ok, false);
  assert.equal(validateCheckpoints([checkpoint, { ...checkpoint, checkpointId: "two" }], source).ok, false);
  assert.equal(validateCheckpoints([{ ...checkpoint, learningSteps: [step("two-step", "missing")] }], source).ok, false);
  const set = await createCheckpointSet("Review", [checkpoint], source);
  assert.equal(set.schemaVersion, 2);
  assert.equal(set.checkpoints[0].reviewMode, "teach");
});

test("checkpoint sets own and recursively freeze their digest-bound checkpoint data", async () => {
  const input = [{ checkpointId: "one", title: "One", learningSteps: [step("one-step", "First body.")] }];
  const set = await createCheckpointSet("Review", input, source);
  const digest = set.checkpointSetDigest;

  input[0].title = "Caller mutation";
  input[0].learningSteps[0].question = "Caller changed the question.";
  input[0].learningSteps.push(step("late-step", "Second body."));

  assert.equal(set.checkpoints[0].title, "One");
  assert.equal(set.checkpoints[0].learningSteps[0].question, "What does this idea change?");
  assert.equal(set.checkpoints[0].learningSteps.length, 1);
  assert.equal(set.checkpointSetDigest, digest);
  assert.equal(Object.isFrozen(set), true);
  assert.equal(Object.isFrozen(set.checkpoints), true);
  assert.equal(Object.isFrozen(set.checkpoints[0]), true);
  assert.equal(Object.isFrozen(set.checkpoints[0].learningSteps), true);
  assert.equal(Object.isFrozen(set.checkpoints[0].learningSteps[0]), true);
  assert.throws(() => { set.checkpoints[0].learningSteps[0].question = "Returned mutation"; }, TypeError);
  assert.throws(() => { set.checkpoints[0].learningSteps.push(step("other", "Second body.")); }, TypeError);
});
