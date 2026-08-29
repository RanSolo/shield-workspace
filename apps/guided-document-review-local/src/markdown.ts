import { markdownToSafeHtml } from "./markdown-engine.mjs";

export function renderMarkdownSections(source: string, highlight = ""): HTMLElement {
  const staging = document.createElement("div");
  staging.innerHTML = markdownToSafeHtml(source);
  if (highlight) highlightFirstExactText(staging, highlight);

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

function highlightFirstExactText(root: HTMLElement, phrase: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue ?? "";
    const index = text.indexOf(phrase);
    if (index < 0 || !node.parentNode) continue;
    const mark = document.createElement("mark");
    mark.className = "source-highlight";
    mark.textContent = phrase;
    const remainder = (node as Text).splitText(index);
    remainder.parentNode?.insertBefore(mark, remainder);
    remainder.nodeValue = remainder.nodeValue?.slice(phrase.length) ?? "";
    return;
  }
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
