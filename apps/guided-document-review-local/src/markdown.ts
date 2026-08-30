import { markdownToSafeHtml } from "./markdown-engine.mjs";

type SourceMarkerState = "resolved" | "unresolved" | "ambiguous";

export interface CompletedSourceMarker {
  readonly checkpointId: string;
  readonly stepId: string;
  readonly sourceQuote: string;
  readonly status: "passed" | "revised";
}

export interface SourceRevisionPreview {
  readonly replacement: string;
}

export function renderMarkdownSections(
  source: string,
  checkpointId: string,
  stepId: string,
  sourceQuote: string,
  completedMarkers: readonly CompletedSourceMarker[] = [],
  revisionPreview?: SourceRevisionPreview,
): HTMLElement {
  const staging = document.createElement("div");
  staging.innerHTML = markdownToSafeHtml(source);

  completedMarkers.forEach((completed) => {
    const completedPassage = renderedMarkdownText(completed.sourceQuote);
    const completedMarker = locateRenderedPassage(staging, completedPassage);
    if (completedMarker.state === "resolved") {
      highlightRenderedBlocks(
        staging,
        completedMarker.start,
        completedMarker.end,
        completed.checkpointId,
        completed.stepId,
        completed.status === "passed" ? "source-passed" : "source-revised",
      );
    }
  });

  const renderedPassage = renderedMarkdownText(sourceQuote);
  const marker = locateRenderedPassage(staging, renderedPassage);
  if (marker.state === "resolved") {
    const activeBlocks = highlightRenderedBlocks(
      staging,
      marker.start,
      marker.end,
      checkpointId,
      stepId,
      "source-highlight",
    );
    if (revisionPreview?.replacement.trim()) renderRevisionDiff(activeBlocks, revisionPreview.replacement.trim());
  }

  const article = document.createElement("article");
  article.className = "source-markdown";
  article.dataset.sourceMarkerState = marker.state;
  const anchorCounts = new Map<string, number>();
  let section: HTMLElement | null = null;

  Array.from(staging.childNodes).forEach((node) => {
    if (isHeading(node)) {
      section = sourceSection(uniqueAnchor(node.textContent ?? "section", anchorCounts));
      article.append(section);
    }
    if (!section) {
      section = sourceSection("introduction");
      article.append(section);
    }
    section.append(node);
  });

  if (marker.state !== "resolved") article.prepend(markerStatus(marker.message));
  return article;
}

export function renderedMarkdownText(markdown: string): string {
  const staging = document.createElement("div");
  staging.innerHTML = markdownToSafeHtml(markdown);
  return staging.textContent?.trim() ?? "";
}

interface TextNodeProjection {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
}

interface MarkerLocation {
  readonly state: SourceMarkerState;
  readonly message: string;
  readonly start: number;
  readonly end: number;
}

function locateRenderedPassage(root: HTMLElement, renderedPassage: string): MarkerLocation {
  if (!renderedPassage) {
    return {
      state: "unresolved",
      message: "Source passage unresolved: the Markdown quote renders to no text.",
      start: 0,
      end: 0,
    };
  }

  const projection = projectTextNodes(root);
  const occurrences = findOccurrences(projection.text, renderedPassage);
  if (occurrences.length === 0) {
    return {
      state: "unresolved",
      message: "Source passage unresolved: the rendered passage was not found in this excerpt.",
      start: 0,
      end: 0,
    };
  }
  if (occurrences.length > 1) {
    return {
      state: "ambiguous",
      message: "Source passage ambiguous: the rendered passage appears multiple times in this excerpt.",
      start: 0,
      end: 0,
    };
  }

  return { state: "resolved", message: "", start: occurrences[0], end: occurrences[0] + renderedPassage.length };
}

function projectTextNodes(root: HTMLElement): { text: string; nodes: readonly TextNodeProjection[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: TextNodeProjection[] = [];
  let text = "";
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const start = text.length;
    text += textNode.nodeValue ?? "";
    nodes.push({ node: textNode, start, end: text.length });
  }
  return { text, nodes };
}

function findOccurrences(text: string, phrase: string): number[] {
  const occurrences: number[] = [];
  let from = 0;
  while (from <= text.length - phrase.length) {
    const index = text.indexOf(phrase, from);
    if (index < 0) break;
    occurrences.push(index);
    from = index + 1;
  }
  return occurrences;
}

function highlightRenderedBlocks(
  root: HTMLElement,
  start: number,
  end: number,
  checkpointId: string,
  stepId: string,
  className: "source-highlight" | "source-passed" | "source-revised",
): readonly HTMLElement[] {
  const projection = projectTextNodes(root);
  const blocks = new Set<HTMLElement>();

  projection.nodes.forEach(({ node, start: nodeStart, end: nodeEnd }) => {
    const fragmentStart = Math.max(start, nodeStart);
    const fragmentEnd = Math.min(end, nodeEnd);
    if (fragmentStart >= fragmentEnd) return;

    const block = node.parentElement?.closest<HTMLElement>("p, li, h1, h2, h3, h4, h5, h6, pre, blockquote");
    if (block && root.contains(block)) blocks.add(block);
  });

  blocks.forEach((block) => {
    block.classList.add(className);
    block.dataset.checkpointId = checkpointId;
    block.dataset.stepId = stepId;
  });
  return [...blocks];
}

function renderRevisionDiff(blocks: readonly HTMLElement[], replacement: string): void {
  blocks.forEach((block) => {
    const removed = document.createElement("div");
    removed.className = "source-diff__removed";
    while (block.firstChild) removed.append(block.firstChild);

    const added = document.createElement("div");
    added.className = "source-diff__added";
    added.textContent = replacement;
    block.classList.add("source-diff");
    block.append(removed, added);
  });
}

function markerStatus(message: string): HTMLElement {
  const status = document.createElement("p");
  status.className = "source-marker-status message message--warning";
  status.setAttribute("role", "status");
  status.textContent = message;
  return status;
}

function sourceSection(anchor: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "source-section";
  section.dataset.sourceAnchor = anchor;
  return section;
}

function isHeading(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/u.test((node as Element).tagName);
}

function uniqueAnchor(value: string, counts: Map<string, number>): string {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "section";
  const count = (counts.get(base) ?? 0) + 1;
  counts.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}
