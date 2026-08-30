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

function render(source, sourceQuote, completedMarkers = [], revisionPreview) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.NodeFilter = dom.window.NodeFilter;
  return renderMarkdownSections(source, "checkpoint-1", "step-1", sourceQuote, completedMarkers, revisionPreview);
}

test("highlights a rendered heading block and keeps its stable source identity", () => {
  const article = render("## Heading\n\nBody", "## Heading");

  assert.equal(article.dataset.sourceMarkerState, "resolved");
  assert.equal(article.querySelector("section")?.dataset.sourceAnchor, "heading");
  const marker = article.querySelector("h2.source-highlight");
  assert.ok(marker);
  assert.equal(marker.textContent, "Heading");
  assert.equal(marker.dataset.checkpointId, "checkpoint-1");
  assert.equal(marker.dataset.stepId, "step-1");
});

test("renders an active numbered revision as a red removal and green addition", () => {
  const article = render(
    "1. **Stable lanes are first-class.** The path remains stable.",
    "**Stable lanes are first-class.**",
    [],
    { replacement: "**Stable lanes are operationally ready.** The environment remains ready." },
  );

  const item = article.querySelector("li.source-highlight.source-diff");
  assert.ok(item);
  assert.match(item.querySelector(".source-diff__removed")?.textContent ?? "", /Stable lanes are first-class/u);
  assert.match(item.querySelector(".source-diff__added")?.textContent ?? "", /operationally ready/u);
});

test("shows passed, revised, and active numbered principles as distinct block highlights", () => {
  const source = "1. **First principle.** Detail one.\n2. **Second principle.** Detail two.\n3. **Third principle.** Detail three.";
  const article = render(source, "**Third principle.**", [
    { checkpointId: "principle-1", stepId: "step-1", sourceQuote: "**First principle.**", status: "passed" },
    { checkpointId: "principle-2", stepId: "step-2", sourceQuote: "**Second principle.**", status: "revised" },
  ]);

  assert.match(article.querySelector("li.source-passed")?.textContent ?? "", /First principle/u);
  assert.match(article.querySelector("li.source-revised")?.textContent ?? "", /Second principle/u);
  assert.match(article.querySelector("li.source-highlight")?.textContent ?? "", /Third principle/u);
});

test("highlights one paragraph across inline text nodes without flattening semantics", () => {
  const article = render(
    "This has **bold** and *italic* plus `code`.",
    "**bold** and *italic* plus `code`",
  );

  assert.equal(article.dataset.sourceMarkerState, "resolved");
  const marker = article.querySelector("p.source-highlight");
  assert.ok(marker);
  assert.equal(article.querySelectorAll(".source-highlight").length, 1);
  assert.equal(marker.textContent, "This has bold and italic plus code.");
  assert.ok(marker.querySelector("strong"));
  assert.ok(marker.querySelector("em"));
  assert.ok(marker.querySelector("code"));
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
