import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const testDirectory = await mkdtemp(join(tmpdir(), "document-trail-renderer-"));
const rendererPath = join(testDirectory, "markdown.mjs");
await build({
  entryPoints: [resolve(dirname(new URL(import.meta.url).pathname), "../src/markdown.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: rendererPath,
});
const { renderMarkdownSections } = await import(pathToFileURL(rendererPath).href);

test.after(async () => {
  await rm(testDirectory, { recursive: true, force: true });
});

function render(source, sourceQuote) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.NodeFilter = dom.window.NodeFilter;
  return renderMarkdownSections(source, "checkpoint-1", "step-1", sourceQuote);
}

test("marks a rendered heading and keeps its stable source identity", () => {
  const article = render("## Heading\n\nBody", "## Heading");

  assert.equal(article.dataset.sourceMarkerState, "resolved");
  assert.equal(article.querySelector("section")?.dataset.sourceAnchor, "heading");
  const marker = article.querySelector("h2 .source-highlight");
  assert.ok(marker);
  assert.equal(marker.textContent, "Heading");
  assert.equal(marker.dataset.checkpointId, "checkpoint-1");
  assert.equal(marker.dataset.stepId, "step-1");
});

test("marks a passage across inline text nodes without flattening semantics", () => {
  const article = render(
    "This has **bold** and *italic* plus `code`.",
    "**bold** and *italic* plus `code`",
  );

  assert.equal(article.dataset.sourceMarkerState, "resolved");
  assert.deepEqual(
    [...article.querySelectorAll(".source-highlight")].map((mark) => mark.textContent),
    ["bold", " and ", "italic", " plus ", "code"],
  );
  assert.ok(article.querySelector("strong > .source-highlight"));
  assert.ok(article.querySelector("em > .source-highlight"));
  assert.ok(article.querySelector("code > .source-highlight"));
});

test("does not mark an ambiguous duplicate and reports the state", () => {
  const article = render("same\n\nsame", "same");

  assert.equal(article.dataset.sourceMarkerState, "ambiguous");
  assert.equal(article.querySelectorAll(".source-highlight").length, 0);
  assert.match(article.querySelector(".source-marker-status")?.textContent ?? "", /ambiguous/u);
});

test("does not mark Markdown that renders to an empty human passage", () => {
  const article = render("## Heading\n\nBody", "---");

  assert.equal(article.dataset.sourceMarkerState, "unresolved");
  assert.equal(article.querySelectorAll(".source-highlight").length, 0);
  assert.match(article.querySelector(".source-marker-status")?.textContent ?? "", /renders to no text/u);
});

test("keeps raw HTML escaped while resolving its human text", () => {
  const article = render("# Safe\n\n<script>alert(1)</script>", "<script>alert(1)</script>");

  assert.equal(article.querySelector("script"), null);
  assert.equal(article.dataset.sourceMarkerState, "resolved");
  assert.equal(article.querySelector(".source-highlight")?.textContent, "<script>alert(1)</script>");
  assert.match(article.innerHTML, /&lt;script&gt;/u);
});
