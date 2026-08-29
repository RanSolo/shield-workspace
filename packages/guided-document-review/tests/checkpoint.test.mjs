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
  assert.equal(validateCheckpoints([{ ...checkpoint, learningSteps: [] }], source).ok, false);
  assert.equal(validateCheckpoints([checkpoint, { ...checkpoint, checkpointId: "two" }], source).ok, false);
  assert.equal(validateCheckpoints([{ ...checkpoint, learningSteps: [step("two-step", "missing")] }], source).ok, false);
  const set = await createCheckpointSet("Review", [checkpoint], source);
  assert.equal(set.schemaVersion, 2);
});
