import { sha256Json } from "./canonical-json.js";

export interface LearningStep {
  readonly stepId: string;
  readonly sourceQuote: string;
  readonly purpose: string;
  readonly question: string;
  readonly explanation: string;
  readonly whyItMatters: string;
}

export interface ReviewCheckpoint {
  readonly checkpointId: string;
  readonly title: string;
  readonly learningSteps: readonly LearningStep[];
}

export interface CheckpointSet {
  readonly schemaVersion: 2;
  readonly checkpointSetId: string;
  readonly title: string;
  readonly checkpoints: readonly ReviewCheckpoint[];
  readonly checkpointSetDigest: string;
}

export type CheckpointValidation =
  | Readonly<{ ok: true; value: readonly ReviewCheckpoint[] }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

export function validateCheckpoints(input: unknown, sourceText = ""): CheckpointValidation {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, errors: ["Checkpoints must be a non-empty array."] };
  }
  const errors: string[] = [];
  const checkpoints: ReviewCheckpoint[] = [];
  const checkpointIds = new Set<string>();
  const stepIds = new Set<string>();
  const quotes = new Set<string>();

  input.forEach((entry, index) => {
    if (!isExactCheckpoint(entry)) {
      errors.push(`Checkpoint ${index + 1} has an invalid shape.`);
      return;
    }
    if (checkpointIds.has(entry.checkpointId)) errors.push(`Checkpoint ID ${entry.checkpointId} is duplicated.`);
    checkpointIds.add(entry.checkpointId);
    entry.learningSteps.forEach((step) => {
      if (stepIds.has(step.stepId)) errors.push(`Learning step ID ${step.stepId} is duplicated.`);
      stepIds.add(step.stepId);
      if (quotes.has(step.sourceQuote)) errors.push(`Source quote is duplicated: ${step.sourceQuote}`);
      quotes.add(step.sourceQuote);
      if (sourceText && countExactOccurrences(sourceText, step.sourceQuote) !== 1) {
        errors.push(`Source quote for step ${step.stepId} must occur exactly once in the source.`);
      }
    });
    checkpoints.push(entry);
  });

  return errors.length ? { ok: false, errors } : { ok: true, value: checkpoints };
}

export async function createCheckpointSet(
  title: string,
  input: unknown,
  sourceText = "",
): Promise<CheckpointSet> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new TypeError("A checkpoint-set title is required.");
  const validation = validateCheckpoints(input, sourceText);
  if (!validation.ok) throw new TypeError(validation.errors.join(" "));
  const checkpoints = copyAndFreezeCheckpoints(validation.value);
  const material = { schemaVersion: 2 as const, title: cleanTitle, checkpoints };
  const checkpointSetDigest = await sha256Json(material);
  return Object.freeze({
    ...material,
    checkpointSetId: `checkpoints:${checkpointSetDigest.slice(7, 23)}`,
    checkpointSetDigest,
  });
}

export function checkpointsFromHeadings(text: string): readonly ReviewCheckpoint[] {
  const headings = [...text.matchAll(/^#{1,3}\s+(.+)$/gmu)].slice(0, 8);
  const sections = headings.length ? headings : [{ 1: "Document purpose", index: 0 } as unknown as RegExpMatchArray];
  return sections.map((heading, index) => {
    const title = String(heading[1]).trim();
    const sourceQuote = uniqueQuote(text, title, heading.index ?? 0);
    return {
      checkpointId: `section-${index + 1}`,
      title,
      learningSteps: [{
        stepId: `section-${index + 1}-step-1`,
        sourceQuote,
        purpose: `Orient yourself to the main idea in ${title}.`,
        question: `What is the central point of ${title}, and what evidence supports it?`,
        explanation: `This section explains ${title} and the decision or consequence that follows from it.`,
        whyItMatters: "Explaining the point yourself makes the document easier to evaluate and remember.",
      }],
    };
  });
}

function isExactCheckpoint(value: unknown): value is ReviewCheckpoint {
  if (!isRecord(value)) return false;
  const fields = ["checkpointId", "title", "learningSteps"];
  return exactKeys(value, fields) && Array.isArray(value.learningSteps) &&
    value.learningSteps.length >= 1 && value.learningSteps.length <= 3 &&
    value.learningSteps.every(isExactLearningStep);
}

function isExactLearningStep(value: unknown): value is LearningStep {
  if (!isRecord(value)) return false;
  const fields = ["stepId", "sourceQuote", "purpose", "question", "explanation", "whyItMatters"];
  return exactKeys(value, fields) && fields.every((field) => {
    const fieldValue = value[field];
    return typeof fieldValue === "string" && fieldValue.trim().length > 0;
  });
}

function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).sort().join("|") === [...fields].sort().join("|");
}

function copyAndFreezeCheckpoints(checkpoints: readonly ReviewCheckpoint[]): readonly ReviewCheckpoint[] {
  const copy = checkpoints.map((checkpoint) => Object.freeze({
    checkpointId: checkpoint.checkpointId,
    title: checkpoint.title,
    learningSteps: Object.freeze(checkpoint.learningSteps.map((step) => Object.freeze({
      stepId: step.stepId,
      sourceQuote: step.sourceQuote,
      purpose: step.purpose,
      question: step.question,
      explanation: step.explanation,
      whyItMatters: step.whyItMatters,
    }))),
  }));
  return Object.freeze(copy);
}

function uniqueQuote(text: string, candidate: string, start: number): string {
  if (countExactOccurrences(text, candidate) === 1) return candidate;
  const lineEnd = text.indexOf("\n", start);
  const line = text.slice(start, lineEnd < 0 ? text.length : lineEnd).trim();
  if (line && countExactOccurrences(text, line) === 1) return line;
  return text.slice(start, Math.min(text.length, start + 120)).trim() || candidate;
}

function countExactOccurrences(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from <= text.length - needle.length) {
    const index = text.indexOf(needle, from);
    if (index < 0) break;
    count += 1;
    from = index + 1;
  }
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
