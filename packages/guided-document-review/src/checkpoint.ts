import { sha256Json } from "./canonical-json.js";

export interface ReviewCheckpoint {
  readonly checkpointId: string;
  readonly title: string;
  readonly sourceSearch: string;
  readonly teaching: string;
  readonly question: string;
  readonly whyItMatters: string;
}

export interface CheckpointSet {
  readonly schemaVersion: 1;
  readonly checkpointSetId: string;
  readonly title: string;
  readonly checkpoints: readonly ReviewCheckpoint[];
  readonly checkpointSetDigest: string;
}

export type CheckpointValidation =
  | Readonly<{ ok: true; value: readonly ReviewCheckpoint[] }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

export function validateCheckpoints(input: unknown): CheckpointValidation {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, errors: ["Checkpoints must be a non-empty array."] };
  }
  const errors: string[] = [];
  const checkpoints: ReviewCheckpoint[] = [];
  const ids = new Set<string>();

  input.forEach((entry, index) => {
    if (!isExactCheckpoint(entry)) {
      errors.push(`Checkpoint ${index + 1} has an invalid shape.`);
      return;
    }
    if (ids.has(entry.checkpointId)) errors.push(`Checkpoint ID ${entry.checkpointId} is duplicated.`);
    ids.add(entry.checkpointId);
    checkpoints.push(entry);
  });

  return errors.length ? { ok: false, errors } : { ok: true, value: checkpoints };
}

export async function createCheckpointSet(
  title: string,
  input: unknown,
): Promise<CheckpointSet> {
  const validation = validateCheckpoints(input);
  if (!validation.ok) throw new TypeError(validation.errors.join(" "));
  const material = { schemaVersion: 1, title: title.trim(), checkpoints: validation.value };
  const checkpointSetDigest = await sha256Json(material);
  return {
    ...material,
    schemaVersion: 1,
    checkpointSetId: `checkpoints:${checkpointSetDigest.slice(7, 23)}`,
    checkpointSetDigest,
  };
}

export function checkpointsFromHeadings(text: string): readonly ReviewCheckpoint[] {
  const headings = [...text.matchAll(/^#{1,3}\s+(.+)$/gmu)].slice(0, 8);
  const titles = headings.length ? headings.map((match) => match[1].trim()) : ["Document purpose"];
  return titles.map((title, index) => ({
    checkpointId: `section-${index + 1}`,
    title,
    sourceSearch: title,
    teaching: `Read the ${title} section for its claim, evidence, and consequence.`,
    question: `In your own words, what decision or understanding should a reader take from ${title}?`,
    whyItMatters: "Explaining the point yourself proves understanding better than checking a box.",
  }));
}

function isExactCheckpoint(value: unknown): value is ReviewCheckpoint {
  if (!isRecord(value)) return false;
  const fields = ["checkpointId", "title", "sourceSearch", "teaching", "question", "whyItMatters"];
  return Object.keys(value).sort().join("|") === [...fields].sort().join("|") &&
    fields.every((field) => {
      const fieldValue = value[field];
      return typeof fieldValue === "string" && fieldValue.trim().length > 0;
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
