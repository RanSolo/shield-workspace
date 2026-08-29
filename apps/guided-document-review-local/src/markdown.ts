import { markdownToSafeHtml } from "./markdown-engine.mjs";

export function renderMarkdownSections(source: string): HTMLElement {
  const staging = document.createElement("div");
  staging.innerHTML = markdownToSafeHtml(source);

  const article = document.createElement("article");
  article.className = "source-markdown";
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

  return article;
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
