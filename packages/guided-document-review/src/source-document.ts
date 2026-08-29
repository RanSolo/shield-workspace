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
  const headingIndex = findOwningHeading(blocks, index);
  if (headingIndex < 0) return blocks[index].trim();

  const level = headingLevel(blocks[headingIndex]);
  if (level === null) return blocks[index].trim();
  let end = headingIndex + 1;
  while (end < blocks.length) {
    const candidateLevel = headingLevel(blocks[end]);
    const startsNextSection = candidateLevel !== null && (level === 1 || candidateLevel <= level);
    if (startsNextSection) break;
    end += 1;
  }
  return blocks.slice(headingIndex, end).join("\n\n").trim();
}

function findOwningHeading(blocks: readonly string[], matchIndex: number): number {
  for (let index = matchIndex; index >= 0; index -= 1) {
    if (headingLevel(blocks[index]) !== null) return index;
  }
  return -1;
}

function headingLevel(block: string): number | null {
  const match = /^(#{1,6})\s+/u.exec(block.trim());
  return match ? match[1].length : null;
}
