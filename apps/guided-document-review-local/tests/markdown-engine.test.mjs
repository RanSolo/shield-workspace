import assert from "node:assert/strict";
import test from "node:test";

import { markdownToSafeHtml } from "../src/markdown-engine.mjs";

test("source Markdown renders semantic headings, emphasis, and lists", () => {
  const html = markdownToSafeHtml("## Principles\n\n1. **Deterministic.** One action.\n2. **Readable.** One explanation.");

  assert.match(html, /<h2>Principles<\/h2>/u);
  assert.match(html, /<ol>/u);
  assert.match(html, /<strong>Deterministic\.<\/strong>/u);
});

test("raw source HTML is escaped instead of executed", () => {
  const html = markdownToSafeHtml("<script>alert('no')</script>\n\n<img src=x onerror=alert(1)>");

  assert.doesNotMatch(html, /<script>|<img/u);
  assert.match(html, /&lt;script&gt;/u);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/u);
});
