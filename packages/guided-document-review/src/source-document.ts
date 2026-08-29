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
  if (!needle) return document.text.slice(0, 800);
  const index = document.text.toLowerCase().indexOf(needle);
  if (index < 0) return document.text.slice(0, 800);
  const start = Math.max(0, index - 180);
  const end = Math.min(document.text.length, index + searchText.length + 420);
  return document.text.slice(start, end).trim();
}
