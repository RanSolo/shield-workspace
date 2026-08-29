import { sha256Text } from "./canonical-json.js";

export interface SourceDocument {
  readonly sourceId: string;
  readonly title: string;
  readonly text: string;
  readonly sourceDigest: string;
}

export async function createSourceDocument(title: string, text: string): Promise<SourceDocument> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new TypeError("A document title is required.");
  if (!text.trim()) throw new TypeError("Document text is required.");
  const sourceDigest = await sha256Text(text);
  return {
    sourceId: `source:${sourceDigest.slice(7, 23)}`,
    title: cleanTitle,
    text,
    sourceDigest,
  };
}

export function findSourceExcerpt(document: SourceDocument, searchText: string): string {
  const needle = searchText.trim().toLowerCase();
  const blocks = document.text.split(/\r?\n\s*\r?\n/u).filter((block) => block.trim());
  const matchIndex = needle
    ? blocks.findIndex((block) => block.toLowerCase().includes(needle))
    : 0;
  const index = matchIndex < 0 ? 0 : matchIndex;
  const matchedHeading = isHeading(blocks[index]);
  const previousHeading = index > 0 && isHeading(blocks[index - 1]);
  const start = previousHeading ? index - 1 : index;
  const end = matchedHeading ? Math.min(blocks.length, index + 2) : index + 1;
  return completeThought(blocks.slice(start, end).join("\n\n"));
}

function isHeading(block: string): boolean {
  return /^#{1,6}\s+/u.test(block.trim());
}

function completeThought(text: string): string {
  const clean = text.trim();
  if (clean.length <= 1600) return clean;
  const candidate = clean.slice(0, 1600);
  const sentenceEnd = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("! "), candidate.lastIndexOf("? "));
  return sentenceEnd >= 600 ? candidate.slice(0, sentenceEnd + 1) : `${candidate.trimEnd()}…`;
}
