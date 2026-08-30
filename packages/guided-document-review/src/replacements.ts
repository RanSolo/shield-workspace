import type { ReplacementRequest } from "./review-session.js";

export function applyConfirmedReplacements(
  sourceText: string,
  replacements: readonly ReplacementRequest[],
): string {
  const originals = new Set<string>();
  const located = replacements.map((replacement) => {
    if (!replacement.original.trim() || !replacement.replacement.trim() || replacement.replacement === replacement.original) {
      throw new TypeError("Confirmed replacements must contain changed, non-empty text.");
    }
    if (originals.has(replacement.original)) {
      throw new TypeError("Confirmed replacements must not repeat an original passage.");
    }
    originals.add(replacement.original);
    const start = sourceText.indexOf(replacement.original);
    if (start < 0 || sourceText.indexOf(replacement.original, start + 1) >= 0) {
      throw new TypeError(`Replacement original must occur exactly once: ${replacement.original}`);
    }
    return { replacement, start, end: start + replacement.original.length };
  }).sort((left, right) => left.start - right.start);

  located.forEach((entry, index) => {
    const previous = located[index - 1];
    if (previous && previous.end > entry.start) {
      throw new TypeError("Confirmed replacements must not overlap.");
    }
  });

  let result = "";
  let cursor = 0;
  located.forEach(({ replacement, start, end }) => {
    result += sourceText.slice(cursor, start) + replacement.replacement;
    cursor = end;
  });
  return result + sourceText.slice(cursor);
}
