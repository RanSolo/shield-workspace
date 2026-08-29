import assert from "node:assert/strict";
import test from "node:test";

import {
  collectReplacementRequests,
  createCheckpointPrompt,
  createRevisionPrompt,
} from "../dist/index.js";

const source = "# Rail\nThe rail keeps one clear next action.\nThe lane returns ready.";
const replacement = {
  stepId: "rail-step",
  original: "one clear next action",
  replacement: "one clearly explained next action",
  rationale: "Readers need a visible handoff.",
};

test("the V2 checkpoint prompt closes its contract", () => {
  const prompt = createCheckpointPrompt("Rail", source);

  assert.match(prompt, /1–3 ordered learningSteps/u);
  assert.match(prompt, /exact, unique passage from the document in sourceQuote/u);
  assert.match(prompt, /Return only a JSON array/u);
  assert.match(prompt, /BEGIN UNTRUSTED DOCUMENT\n# Rail\nThe rail keeps one clear next action\./u);
});

test("the revision prompt includes exact source and ordered replacements without authority claims", () => {
  const changes = [
    { checkpointId: "first", checkpointTitle: "First", replacement },
    {
      checkpointId: "second",
      checkpointTitle: "Second",
      replacement: { ...replacement, stepId: "ready-step", original: "The lane returns ready.", replacement: "The lane returns ready for reuse.", rationale: null },
    },
  ];
  const prompt = createRevisionPrompt("Rail", source, changes);

  assert.match(prompt, /BEGIN ORIGINAL DOCUMENT\n# Rail\nThe rail keeps one clear next action\.\nThe lane returns ready\.\nEND ORIGINAL DOCUMENT/u);
  assert.ok(prompt.indexOf("one clearly explained next action") < prompt.indexOf("The lane returns ready for reuse."));
  assert.match(prompt, /Preserve every unchanged character and passage exactly/u);
  assert.match(prompt, /Return revised Markdown only/u);
  assert.match(prompt, /educational\/document approval only/u);
  assert.match(prompt, /no implementation, publication, merge, or release authority/u);
});

test("replacement collection is checkpoint ordered and has a clear no-change path", () => {
  const checkpointSet = { checkpoints: [
    { checkpointId: "first", title: "First" },
    { checkpointId: "second", title: "Second" },
  ] };
  const session = { answers: {
    first: { replacement: { ...replacement, stepId: "first-step" } },
    second: { replacement: null },
  } };
  assert.deepEqual(collectReplacementRequests(checkpointSet, session), [{
    checkpointId: "first", checkpointTitle: "First", replacement: { ...replacement, stepId: "first-step" },
  }]);
  assert.deepEqual(collectReplacementRequests(checkpointSet, { answers: { first: { replacement: null }, second: { replacement: null } } }), []);
  assert.throws(() => createRevisionPrompt("Rail", source, []), /No replacement requests were confirmed/u);
});

test("the checkpoint prompt rejects missing source material", () => {
  assert.throws(() => createCheckpointPrompt("", "text"), /title is required/u);
  assert.throws(() => createCheckpointPrompt("Rail", "  "), /text is required/u);
});
