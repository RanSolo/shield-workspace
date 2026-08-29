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
