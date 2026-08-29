import assert from "node:assert/strict";
import test from "node:test";

import { checkpointsFromHeadings, validateCheckpoints } from "../dist/index.js";

test("headings become ordered learning checkpoints", () => {
  const checkpoints = checkpointsFromHeadings("# First\nBody\n## Second\nBody");
  assert.deepEqual(checkpoints.map(({ checkpointId, title }) => ({ checkpointId, title })), [
    { checkpointId: "section-1", title: "First" },
    { checkpointId: "section-2", title: "Second" },
  ]);
});

test("agent checkpoint JSON is closed and rejects duplicate IDs", () => {
  const checkpoint = {
    checkpointId: "one",
    title: "One",
    sourceSearch: "one",
    teaching: "Teach one.",
    question: "Explain one.",
    whyItMatters: "It matters.",
  };
  assert.equal(validateCheckpoints([{ ...checkpoint, surprise: true }]).ok, false);
  assert.equal(validateCheckpoints([checkpoint, checkpoint]).ok, false);
});
