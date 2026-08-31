import type { CheckpointSet, ReviewCheckpoint } from "./checkpoint.js";
import {
  deriveReviewSessionId,
  type CheckpointAnswer,
  type ReplacementRequest,
  type ReviewerIdentity,
  type ReviewEvent,
  type ReviewPhase,
  type ReviewSession,
  type StepDisposition,
  type StepDispositionRecord,
} from "./review-session.js";
import type { SourceDocument } from "./source-document.js";

export type ReviewSessionDecodeResult =
  | Readonly<{ ok: true; session: ReviewSession; migrated?: boolean }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

const sessionFields = [
  "schemaVersion", "sessionId", "sourceId", "sourceDigest", "checkpointSetId",
  "checkpointSetDigest", "reviewer", "currentCheckpointIndex", "currentStepIndex",
  "phase", "revision", "answers", "events", "startedAt", "updatedAt",
] as const;
const legacyAnswerFields = [
  "checkpointId", "revealedStepIds", "explanation", "confidence", "decision",
  "replacement", "decidedAt",
] as const;
const answerFields = [...legacyAnswerFields, "replacements", "stepDispositions"] as const;
const stepDispositionFields = ["stepId", "disposition", "replacement", "decidedAt"] as const;
const replacementFields = ["stepId", "original", "replacement", "rationale"] as const;
const eventFields = ["eventId", "checkpointId", "stepId", "phase", "revision", "recordedAt"] as const;
const phases = new Set<ReviewPhase>(["orient", "learn", "explain_back", "confidence", "decide", "complete"]);
const decisions = new Set(["understand", "question", "needs_qa", "revise", "approve"]);
const dispositions = new Set<StepDisposition>(["pass", "revise", "question", "needs_qa"]);

export async function decodeReviewSession(input: unknown, source: SourceDocument, checkpointSet: CheckpointSet): Promise<ReviewSessionDecodeResult> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["Review session must be a plain object."] };
  checkExactKeys(input, sessionFields, "Review session", errors);
  if (input.schemaVersion !== 2) errors.push("Review session schemaVersion must be 2.");
  checkNonEmptyString(input.sessionId, "Review session ID", errors);
  checkIdentity(input.sourceId, source.sourceId, "source ID", errors);
  checkIdentity(input.sourceDigest, source.sourceDigest, "source digest", errors);
  checkIdentity(input.checkpointSetId, checkpointSet.checkpointSetId, "checkpoint-set ID", errors);
  checkIdentity(input.checkpointSetDigest, checkpointSet.checkpointSetDigest, "checkpoint-set digest", errors);
  const reviewer = decodeReviewer(input.reviewer, errors);
  if (reviewer && validTimestamp(input.startedAt)) {
    const expectedSessionId = await deriveReviewSessionId(source.sourceDigest, checkpointSet.checkpointSetDigest, reviewer, input.startedAt);
    if (input.sessionId !== expectedSessionId) errors.push("Review session ID does not match its identity material.");
  }
  const phase = phases.has(input.phase as ReviewPhase) ? input.phase as ReviewPhase : null;
  if (!phase) errors.push("Review session phase is invalid.");
  const checkpointIndex = integerAtLeast(input.currentCheckpointIndex, 0) ? input.currentCheckpointIndex : null;
  const stepIndex = integerAtLeast(input.currentStepIndex, 0) ? input.currentStepIndex : null;
  const revision = integerAtLeast(input.revision, 0) ? input.revision : null;
  if (checkpointIndex === null) errors.push("Current checkpoint index is invalid.");
  if (stepIndex === null) errors.push("Current step index is invalid.");
  if (revision === null) errors.push("Review session revision is invalid.");
  checkTimestamp(input.startedAt, "Review start time", errors);
  checkTimestamp(input.updatedAt, "Review update time", errors);
  const answerResult = decodeAnswers(input.answers, checkpointSet, errors);
  const events = decodeEvents(input.events, checkpointSet, errors);
  if (answerResult && checkpointIndex !== null && stepIndex !== null && phase) checkSessionPosition(checkpointSet, answerResult.answers, checkpointIndex, stepIndex, phase, errors);
  if (events && revision !== null) {
    if (revision !== events.length) errors.push("Review revision must equal the number of recorded events.");
    const expectedUpdatedAt = events.length ? events[events.length - 1].recordedAt : input.startedAt;
    if (input.updatedAt !== expectedUpdatedAt) errors.push("Review update time must match the latest recorded event.");
  }
  if (answerResult && events && checkpointIndex !== null && typeof input.startedAt === "string") checkEventConsistency(checkpointSet, answerResult.answers, events, checkpointIndex, input.startedAt, errors);
  if (errors.length || !reviewer || !phase || checkpointIndex === null || stepIndex === null || revision === null || !answerResult || !events || typeof input.sessionId !== "string" || typeof input.startedAt !== "string" || typeof input.updatedAt !== "string") return { ok: false, errors };
  const session: ReviewSession = {
    schemaVersion: 2,
    sessionId: input.sessionId,
    sourceId: source.sourceId,
    sourceDigest: source.sourceDigest,
    checkpointSetId: checkpointSet.checkpointSetId,
    checkpointSetDigest: checkpointSet.checkpointSetDigest,
    reviewer,
    currentCheckpointIndex: checkpointIndex,
    currentStepIndex: stepIndex,
    phase,
    revision,
    answers: answerResult.answers,
    events,
    startedAt: input.startedAt,
    updatedAt: input.updatedAt,
  };
  return answerResult.migrated ? { ok: true, session, migrated: true } : { ok: true, session };
}

function decodeReviewer(input: unknown, errors: string[]): ReviewerIdentity | null {
  if (!isRecord(input)) { errors.push("Reviewer must be a plain object."); return null; }
  checkExactKeys(input, ["kind", "name"], "Reviewer", errors);
  if (input.kind === "unattributed" && input.name === null) return { kind: "unattributed", name: null };
  if (input.kind === "self_asserted" && validTrimmedString(input.name, 1)) return { kind: "self_asserted", name: input.name };
  errors.push("Reviewer identity is invalid.");
  return null;
}

function decodeAnswers(input: unknown, checkpointSet: CheckpointSet, errors: string[]): { answers: Readonly<Record<string, CheckpointAnswer>>; migrated: boolean } | null {
  if (!isRecord(input)) { errors.push("Review answers must be a plain object."); return null; }
  const expectedKeys = checkpointSet.checkpoints.map(({ checkpointId }) => checkpointId).sort();
  if (Object.keys(input).sort().join("|") !== expectedKeys.join("|")) errors.push("Review answer keys must exactly match the checkpoint set.");
  const decoded: Record<string, CheckpointAnswer> = {};
  let migrated = false;
  checkpointSet.checkpoints.forEach((checkpoint) => {
    const result = decodeAnswer(input[checkpoint.checkpointId], checkpoint, errors);
    if (result) { decoded[checkpoint.checkpointId] = result.answer; migrated ||= result.migrated; }
  });
  return Object.keys(decoded).length === checkpointSet.checkpoints.length ? { answers: decoded, migrated } : null;
}

function decodeAnswer(input: unknown, checkpoint: ReviewCheckpoint, errors: string[]): { answer: CheckpointAnswer; migrated: boolean } | null {
  const label = `Answer ${checkpoint.checkpointId}`;
  if (!isRecord(input)) { errors.push(`${label} must be a plain object.`); return null; }
  const migrated = !("stepDispositions" in input || "replacements" in input);
  checkExactKeys(input, migrated ? legacyAnswerFields : answerFields, label, errors);
  const startErrors = errors.length;
  if (input.checkpointId !== checkpoint.checkpointId) errors.push(`${label} checkpoint ID is invalid.`);
  const stepIds = checkpoint.learningSteps.map(({ stepId }) => stepId);
  const revealed = Array.isArray(input.revealedStepIds) && input.revealedStepIds.every((value) => typeof value === "string") ? [...input.revealedStepIds] as string[] : null;
  if (!revealed) errors.push(`${label} revealed steps must be a string array.`);
  else if (revealed.some((stepId, index) => stepId !== stepIds[index])) errors.push(`${label} revealed steps must be an ordered prefix of its learning steps.`);
  const explanation = input.explanation === null ? null : validTrimmedString(input.explanation, 20) ? input.explanation : undefined;
  if (explanation === undefined) errors.push(`${label} explanation is invalid.`);
  const confidence = input.confidence === null ? null : integerBetween(input.confidence, 1, 5) ? input.confidence as 1 | 2 | 3 | 4 | 5 : undefined;
  if (confidence === undefined) errors.push(`${label} confidence is invalid.`);
  const decision = input.decision === null ? null : decisions.has(input.decision as string) ? input.decision as CheckpointAnswer["decision"] : undefined;
  if (decision === undefined) errors.push(`${label} decision is invalid.`);
  const replacement = decodeReplacement(input.replacement, checkpoint, label, errors);
  const decidedAt = input.decidedAt === null ? null : validTimestamp(input.decidedAt) ? input.decidedAt : undefined;
  if (decidedAt === undefined) errors.push(`${label} decision time is invalid.`);
  if (decision === null && decidedAt !== null) errors.push(`${label} cannot have a decision time without a decision.`);
  if (decision !== null && decidedAt === null) errors.push(`${label} decision time is required.`);
  if (migrated && decision === "revise" && !replacement) errors.push(`${label} Needs revision requires a replacement.`);
  if (migrated && decision !== "revise" && replacement) errors.push(`${label} replacement requires Needs revision.`);
  let replacements: readonly ReplacementRequest[];
  let stepDispositions: readonly StepDispositionRecord[];
  if (migrated) {
    replacements = replacement ? [replacement] : [];
    stepDispositions = stepIds.map((stepId) => {
      const isRevealed = revealed?.includes(stepId) ?? false;
      const isRevision = decision === "revise" && replacement?.stepId === stepId;
      return { stepId, disposition: isRevealed && decision ? isRevision ? "revise" : "pass" : null, replacement: isRevision ? replacement : null, decidedAt: null };
    });
  } else {
    replacements = decodeReplacements(input.replacements, checkpoint, label, errors);
    stepDispositions = decodeStepDispositions(input.stepDispositions, checkpoint, label, errors);
    const derived = revisedReplacements(stepDispositions);
    if (!sameReplacements(replacements, derived)) errors.push(`${label} replacements must match its revised step dispositions.`);
    if (!sameReplacement(replacement, replacements[0] ?? null)) errors.push(`${label} legacy replacement must match the first replacement.`);
    if (checkpoint.reviewMode === "disposition") {
      const aggregate = aggregateDecision(stepDispositions);
      if (decision !== null && decision !== aggregate) errors.push(`${label} aggregate decision does not match its step dispositions.`);
    } else {
      if (decision === "approve" && derived.length) errors.push(`${label} PASS aggregate cannot contain revisions.`);
      if (decision === "revise" && !derived.length) errors.push(`${label} REVISE aggregate requires a revised step.`);
    }
  }
  const completeSteps = stepDispositions.every((entry) => entry.disposition !== null);
  if (decision && (revealed?.length !== stepIds.length || !completeSteps || (checkpoint.reviewMode !== "disposition" && explanation === null))) errors.push(`${label} is decided before its learning and reflection are complete.`);
  if (errors.length !== startErrors || !revealed || explanation === undefined || confidence === undefined || decision === undefined || decidedAt === undefined) return null;
  return { migrated, answer: { checkpointId: checkpoint.checkpointId, revealedStepIds: revealed, explanation, confidence, decision, replacement: replacement ?? replacements[0] ?? null, replacements, stepDispositions, decidedAt } };
}

function decodeStepDispositions(input: unknown, checkpoint: ReviewCheckpoint, label: string, errors: string[]): readonly StepDispositionRecord[] {
  if (!Array.isArray(input) || input.length !== checkpoint.learningSteps.length) { errors.push(`${label} step dispositions must contain every learning step in order.`); return checkpoint.learningSteps.map(({ stepId }) => emptyStepDisposition(stepId)); }
  return input.map((entry, index) => {
    const stepLabel = `${label} step disposition ${index + 1}`;
    const step = checkpoint.learningSteps[index];
    if (!isRecord(entry)) { errors.push(`${stepLabel} must be a plain object.`); return emptyStepDisposition(step.stepId); }
    const startErrors = errors.length;
    checkExactKeys(entry, stepDispositionFields, stepLabel, errors);
    if (entry.stepId !== step.stepId) errors.push(`${stepLabel} must match the ordered learning step.`);
    const disposition = entry.disposition === null ? null : dispositions.has(entry.disposition as StepDisposition) ? entry.disposition as StepDisposition : undefined;
    if (disposition === undefined) errors.push(`${stepLabel} disposition is invalid.`);
    const replacement = decodeReplacement(entry.replacement, checkpoint, stepLabel, errors);
    const decidedAt = entry.decidedAt === null ? null : validTimestamp(entry.decidedAt) ? entry.decidedAt : undefined;
    if (decidedAt === undefined) errors.push(`${stepLabel} decision time is invalid.`);
    if (disposition === null && (replacement || decidedAt !== null)) errors.push(`${stepLabel} cannot carry a partial disposition.`);
    if (disposition !== "revise" && replacement) errors.push(`${stepLabel} only REVISE can include a replacement.`);
    if (disposition === "revise" && !replacement) errors.push(`${stepLabel} REVISE requires a replacement.`);
    const allowed = checkpoint.dispositionOptions ?? ["pass", "revise"];
    if (disposition && !allowed.includes(disposition)) errors.push(`${stepLabel} disposition is not allowed by its checkpoint.`);
    if (errors.length !== startErrors || disposition === undefined || decidedAt === undefined) return emptyStepDisposition(step.stepId);
    return { stepId: step.stepId, disposition, replacement, decidedAt };
  });
}

function decodeReplacements(input: unknown, checkpoint: ReviewCheckpoint, label: string, errors: string[]): readonly ReplacementRequest[] {
  if (!Array.isArray(input)) { errors.push(`${label} replacements must be an array.`); return []; }
  return input.map((entry, index) => decodeReplacement(entry, checkpoint, `${label} replacement ${index + 1}`, errors)).filter((entry): entry is ReplacementRequest => entry !== null);
}

function decodeReplacement(input: unknown, checkpoint: ReviewCheckpoint, label: string, errors: string[]): ReplacementRequest | null {
  if (input === null) return null;
  if (!isRecord(input)) { errors.push(`${label} replacement must be a plain object or null.`); return null; }
  const startErrors = errors.length;
  checkExactKeys(input, replacementFields, `${label} replacement`, errors);
  const step = typeof input.stepId === "string" ? checkpoint.learningSteps.find(({ stepId }) => stepId === input.stepId) : undefined;
  if (!step) errors.push(`${label} replacement step is not in the checkpoint.`);
  if (step && input.original !== step.sourceQuote) errors.push(`${label} replacement original does not match its learning step.`);
  if (!validTrimmedString(input.replacement, 1)) errors.push(`${label} replacement text is invalid.`);
  if (step && input.replacement === step.sourceQuote) errors.push(`${label} replacement must differ from its original.`);
  if (!(input.rationale === null || validTrimmedString(input.rationale, 1))) errors.push(`${label} replacement rationale is invalid.`);
  if (errors.length !== startErrors || !step || typeof input.original !== "string" || typeof input.replacement !== "string" || !(input.rationale === null || typeof input.rationale === "string")) return null;
  return { stepId: step.stepId, original: step.sourceQuote, replacement: input.replacement, rationale: input.rationale };
}

function decodeEvents(input: unknown, checkpointSet: CheckpointSet, errors: string[]): readonly ReviewEvent[] | null {
  if (!Array.isArray(input)) { errors.push("Review events must be an array."); return null; }
  const decoded: ReviewEvent[] = [];
  const eventIds = new Set<string>();
  input.forEach((entry, index) => {
    const label = `Review event ${index + 1}`;
    if (!isRecord(entry)) { errors.push(`${label} must be a plain object.`); return; }
    const startErrors = errors.length;
    checkExactKeys(entry, eventFields, label, errors);
    if (!validTrimmedString(entry.eventId, 1)) errors.push(`${label} event ID is invalid.`);
    if (typeof entry.eventId === "string" && eventIds.has(entry.eventId)) errors.push(`${label} event ID is duplicated.`);
    if (typeof entry.eventId === "string") eventIds.add(entry.eventId);
    const checkpoint = typeof entry.checkpointId === "string" ? checkpointSet.checkpoints.find(({ checkpointId }) => checkpointId === entry.checkpointId) : undefined;
    if (!checkpoint) errors.push(`${label} checkpoint ID is invalid.`);
    if (!(entry.stepId === null || (typeof entry.stepId === "string" && checkpoint?.learningSteps.some(({ stepId }) => stepId === entry.stepId)))) errors.push(`${label} step ID is invalid.`);
    if (!phases.has(entry.phase as ReviewPhase) || entry.phase === "complete") errors.push(`${label} phase is invalid.`);
    if (entry.revision !== index) errors.push(`${label} revision must equal ${index}.`);
    checkTimestamp(entry.recordedAt, `${label} recorded time`, errors);
    if (errors.length !== startErrors || typeof entry.eventId !== "string" || !checkpoint || !(entry.stepId === null || typeof entry.stepId === "string") || !phases.has(entry.phase as ReviewPhase) || typeof entry.revision !== "number" || typeof entry.recordedAt !== "string") return;
    decoded.push({ eventId: entry.eventId, checkpointId: checkpoint.checkpointId, stepId: entry.stepId, phase: entry.phase as ReviewPhase, revision: entry.revision, recordedAt: entry.recordedAt });
  });
  return decoded.length === input.length ? decoded : null;
}

function checkSessionPosition(checkpointSet: CheckpointSet, answers: Readonly<Record<string, CheckpointAnswer>>, checkpointIndex: number, stepIndex: number, phase: ReviewPhase, errors: string[]): void {
  const checkpoint = checkpointSet.checkpoints[checkpointIndex];
  if (!checkpoint) { errors.push("Current checkpoint index is outside the checkpoint set."); return; }
  if (phase !== "complete" && !checkpoint.learningSteps[stepIndex]) errors.push("Current step index is outside the active checkpoint.");
  checkpointSet.checkpoints.forEach((candidate, index) => {
    const answer = answers[candidate.checkpointId];
    if (index < checkpointIndex && !answer.decision) errors.push(`Checkpoint ${candidate.checkpointId} must be decided before the active checkpoint.`);
    if (index === checkpointIndex && phase !== "complete" && answer.decision && !isLegacyAnswer(answer)) errors.push("The active checkpoint cannot already be decided.");
    if (index > checkpointIndex && !isPristine(answer)) errors.push(`Future checkpoint ${candidate.checkpointId} must be pristine.`);
  });
  if (phase === "complete") {
    if (checkpointIndex !== checkpointSet.checkpoints.length - 1 || stepIndex !== 0 || checkpointSet.checkpoints.some(({ checkpointId }) => !answers[checkpointId].decision)) errors.push("A complete review must finish every checkpoint and reset the step index.");
    return;
  }
  const answer = answers[checkpoint.checkpointId];
  if (phase === "orient" && stepIndex !== 0) errors.push("Orient phase must use the first learning-step index.");
  if (phase === "learn") {
    const resolved = answer.stepDispositions.filter((entry) => entry.disposition !== null).length;
    if (answer.revealedStepIds.length !== resolved || resolved !== stepIndex) errors.push("Learn phase must use the next undecided learning step.");
  }
  if (phase === "explain_back" && (stepIndex !== checkpoint.learningSteps.length - 1 || answer.revealedStepIds.length !== checkpoint.learningSteps.length || answer.stepDispositions.some((entry) => entry.disposition === null) || answer.explanation !== null)) errors.push("Reflection phase requires every step disposition and no saved reflection.");
  if (["confidence", "decide"].includes(phase) && checkpoint.reviewMode !== "disposition" && answer.explanation === null) errors.push(`${phase} phase requires an explanation.`);
}

function checkEventConsistency(checkpointSet: CheckpointSet, answers: Readonly<Record<string, CheckpointAnswer>>, events: readonly ReviewEvent[], checkpointIndex: number, startedAt: string, errors: string[]): void {
  const checkpointIndexes = new Map(checkpointSet.checkpoints.map((checkpoint, index) => [checkpoint.checkpointId, index]));
  let previousCheckpointIndex = 0;
  let previousTime = Date.parse(startedAt);
  events.forEach((event, index) => {
    const eventCheckpointIndex = checkpointIndexes.get(event.checkpointId);
    if (eventCheckpointIndex === undefined) return;
    if (eventCheckpointIndex < previousCheckpointIndex || eventCheckpointIndex > checkpointIndex) errors.push(`Review event ${index + 1} is outside the checkpoint progression.`);
    const eventTime = Date.parse(event.recordedAt);
    if (eventTime < previousTime) errors.push(`Review event ${index + 1} is out of timestamp order.`);
    previousCheckpointIndex = eventCheckpointIndex;
    previousTime = eventTime;
  });
  if (events.length && (events[0].checkpointId !== checkpointSet.checkpoints[0].checkpointId || events[0].phase !== "orient")) errors.push("The first review event must orient the first checkpoint.");
  checkpointSet.checkpoints.forEach((checkpoint) => {
    const answer = answers[checkpoint.checkpointId];
    const checkpointEvents = events.filter((event) => event.checkpointId === checkpoint.checkpointId);
    answer.stepDispositions.filter((entry) => entry.disposition !== null).forEach((entry) => {
      if (!checkpointEvents.some((event) => event.phase === "learn" && event.stepId === entry.stepId)) errors.push(`Disposed step ${entry.stepId} has no matching learning event.`);
    });
    if (answer.explanation !== null && !checkpointEvents.some((event) => event.phase === "explain_back")) errors.push(`Checkpoint ${checkpoint.checkpointId} explanation has no matching event.`);
    if (answer.confidence !== null && !checkpointEvents.some((event) => event.phase === "confidence")) errors.push(`Checkpoint ${checkpoint.checkpointId} confidence has no matching event.`);
    const finalEvent = checkpointEvents.at(-1);
    if (answer.decision !== null) {
      const expectedPhase = checkpoint.reviewMode === "disposition" ? "learn" : "explain_back";
      if (isLegacyAnswer(answer) ? finalEvent?.phase !== "decide" : finalEvent?.phase !== expectedPhase) errors.push(`Checkpoint ${checkpoint.checkpointId} must end with its finalization event.`);
    }
  });
}

function revisedReplacements(dispositionsForCheckpoint: readonly StepDispositionRecord[]): ReplacementRequest[] {
  return dispositionsForCheckpoint.filter((entry) => entry.disposition === "revise").map((entry) => entry.replacement).filter((entry): entry is ReplacementRequest => entry !== null);
}
function aggregateDecision(dispositionsForCheckpoint: readonly StepDispositionRecord[]): CheckpointAnswer["decision"] {
  if (dispositionsForCheckpoint.some(({ disposition }) => disposition === "revise")) return "revise";
  if (dispositionsForCheckpoint.some(({ disposition }) => disposition === "needs_qa")) return "needs_qa";
  if (dispositionsForCheckpoint.some(({ disposition }) => disposition === "question")) return "question";
  return "approve";
}
function isLegacyAnswer(answer: CheckpointAnswer): boolean { return answer.stepDispositions.every((entry) => entry.disposition === null || entry.decidedAt === null); }
function isPristine(answer: CheckpointAnswer): boolean { return answer.revealedStepIds.length === 0 && answer.explanation === null && answer.confidence === null && answer.decision === null && answer.replacement === null && answer.replacements.length === 0 && answer.stepDispositions.every((entry) => entry.disposition === null) && answer.decidedAt === null; }
function emptyStepDisposition(stepId: string): StepDispositionRecord { return { stepId, disposition: null, replacement: null, decidedAt: null }; }
function sameReplacement(left: ReplacementRequest | null, right: ReplacementRequest | null): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function sameReplacements(left: readonly ReplacementRequest[], right: readonly ReplacementRequest[]): boolean { return left.length === right.length && left.every((entry, index) => sameReplacement(entry, right[index])); }
function checkIdentity(actual: unknown, expected: string, label: string, errors: string[]): void { if (actual !== expected) errors.push(`Review session ${label} does not match.`); }
function checkNonEmptyString(value: unknown, label: string, errors: string[]): void { if (!validTrimmedString(value, 1)) errors.push(`${label} is invalid.`); }
function checkTimestamp(value: unknown, label: string, errors: string[]): void { if (!validTimestamp(value)) errors.push(`${label} is invalid.`); }
function checkExactKeys(value: Record<string, unknown>, fields: readonly string[], label: string, errors: string[]): void { if (Object.keys(value).sort().join("|") !== [...fields].sort().join("|")) errors.push(`${label} has an invalid shape.`); }
function validTrimmedString(value: unknown, minimum: number): value is string { return typeof value === "string" && value === value.trim() && value.length >= minimum; }
function validTimestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function integerAtLeast(value: unknown, minimum: number): value is number { return Number.isInteger(value) && (value as number) >= minimum; }
function integerBetween(value: unknown, minimum: number, maximum: number): boolean { return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
