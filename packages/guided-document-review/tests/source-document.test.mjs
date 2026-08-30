import assert from "node:assert/strict";
import test from "node:test";

import { createSourceDocument, findSourceExcerpt } from "../dist/index.js";

test("source excerpts preserve a complete Markdown section", async () => {
  const source = await createSourceDocument(
    "Rail",
    "# Mission Rail\n\n## Why it exists\n\nThe rail removes repeated judgment. It stops only for a real human decision.\n\n## Next section\n\nThis does not belong in the excerpt.",
  );

  assert.equal(
    findSourceExcerpt(source, "repeated judgment"),
    "## Why it exists\n\nThe rail removes repeated judgment. It stops only for a real human decision.",
  );
});

test("a heading search includes the paragraph that follows it", async () => {
  const source = await createSourceDocument(
    "Rail",
    "# Mission Rail\n\nThe complete opening thought.\n\n## Another section\n\nAnother thought.",
  );

  assert.equal(findSourceExcerpt(source, "Mission Rail"), "# Mission Rail\n\nThe complete opening thought.");
});

test("a heading search includes its complete section", async () => {
  const source = await createSourceDocument(
    "Rail",
    "## Problem\n\nThree failures:\n\n1. First failure.\n2. Second failure.\n3. Third failure.\n\nThe failures share one cause.\n\n## Next\n\nLater.",
  );

  assert.equal(
    findSourceExcerpt(source, "## Problem"),
    "## Problem\n\nThree failures:\n\n1. First failure.\n2. Second failure.\n3. Third failure.\n\nThe failures share one cause.",
  );
});

test("a section includes nested headings but stops at its next peer", async () => {
  const source = await createSourceDocument(
    "Rail",
    "## Packages\n\nOverview.\n\n### Store\n\nStorage detail.\n\n### Host\n\nHost detail.\n\n## Delivery\n\nLater.",
  );

  assert.equal(
    findSourceExcerpt(source, "## Packages"),
    "## Packages\n\nOverview.\n\n### Store\n\nStorage detail.\n\n### Host\n\nHost detail.",
  );
  assert.equal(findSourceExcerpt(source, "### Store"), "### Store\n\nStorage detail.");
});

test("a long source paragraph is never truncated", async () => {
  const paragraph = `The whole paragraph stays available. ${"More source context. ".repeat(150)}`;
  const source = await createSourceDocument("Rail", `## Evidence\n\n${paragraph}\n\n## Next\n\nLater.`);

  assert.equal(findSourceExcerpt(source, "whole paragraph"), `## Evidence\n\n${paragraph.trim()}`);
});

test("a passage spanning a paragraph and list resolves to its owning section", async () => {
  const source = await createSourceDocument("Seats", [
    "## Seat model",
    "",
    "The seat contracts remain useful independently of the runtime:",
    "",
    "- Hill sequences work.",
    "- Daisy gathers evidence.",
    "- Fury reviews.",
    "",
    "## Next section",
    "",
    "Other material.",
  ].join("\n"));
  const passage = [
    "The seat contracts remain useful independently of the runtime:",
    "",
    "- Hill sequences work.",
    "- Daisy gathers evidence.",
    "- Fury reviews.",
  ].join("\n");

  assert.equal(findSourceExcerpt(source, passage), `## Seat model\n\n${passage}`);
});
