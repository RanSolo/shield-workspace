import type { CheckpointSet } from "./checkpoint.js";
import { sha256Json } from "./canonical-json.js";
import type { SourceDocument } from "./source-document.js";

export type ReviewPhase = "orient" | "learn" | "explain_back" | "confidence" | "decide" | "complete";
export type ReviewDecision = "understand" | "question" | "needs_qa" | "revise" | "approve";
export type ReviewerIdentity =
  | Readonly<{ kind: "unattributed"; name: null }>
  | Readonly<{ kind: "self_asserted"; name: string }>;

export interface ReplacementRequest {
  readonly stepId: string;
  readonly original: string;
  readonly replacement: string;
  readonly rationale: string | null;
}

export interface ReplacementRequestInput {
  readonly stepId: string;
  readonly replacement: string;
  readonly rationale?: string;
}

export type StepDisposition = "pass" | "revise" | "question" | "needs_qa";

export interface StepDispositionRecord {
  readonly stepId: string;
  readonly disposition: StepDisposition | null;
  readonly replacement: ReplacementRequest | null;
  readonly decidedAt: string | null;
}

export interface CheckpointAnswer {
  readonly checkpointId: string;
  readonly revealedStepIds: readonly string[];
  readonly explanation: string | null;
  readonly confidence: 1 | 2 | 3 | 4 | 5 | null;
  readonly decision: ReviewDecision | null;
  /** The legacy checkpoint-level replacement. New sessions use replacements. */
  readonly replacement: ReplacementRequest | null;
  readonly replacements: readonly ReplacementRequest[];
  readonly stepDispositions: readonly StepDispositionRecord[];
  readonly decidedAt: string | null;
}

export interface StepDispositionInput {
  readonly disposition: StepDisposition;
  readonly replacement?: ReplacementRequestInput;
}

export interface ReviewDispositionInput {
  readonly decision: ReviewDecision;
  readonly replacement?: ReplacementRequestInput;
}

export interface ReviewEvent {
  readonly eventId: string;
  readonly checkpointId: string;
  readonly stepId: string | null;
  readonly phase: ReviewPhase;
  readonly revision: number;
  readonly recordedAt: string;
}

export interface ReviewSession {
  readonly schemaVersion: 2;
  readonly sessionId: string;
  readonly sourceId: string;
  readonly sourceDigest: string;
  readonly checkpointSetId: string;
  readonly checkpointSetDigest: string;
  readonly reviewer: ReviewerIdentity;
  readonly currentCheckpointIndex: number;
  readonly currentStepIndex: number;
  readonly phase: ReviewPhase;
  readonly revision: number;
  readonly answers: Readonly<Record<string, CheckpointAnswer>>;
  readonly events: readonly ReviewEvent[];
  readonly startedAt: string;
  readonly updatedAt: string;
}

export interface ExpectedTransition {
  readonly eventId: string;
  readonly checkpointId: string;
  readonly stepId?: string;
  readonly phase: ReviewPhase;
  readonly revision: number;
}

export type SessionResult =
  | Readonly<{ ok: true; session: ReviewSession }>
  | Readonly<{ ok: false; code: string; message: string }>;

export type Clock = () => string;

export async function deriveReviewSessionId(
  sourceDigest: string,
  checkpointSetDigest: string,
  reviewer: ReviewerIdentity,
  startedAt: string,
): Promise<string> {
  const sessionDigest = await sha256Json({
    schemaVersion: 2,
    sourceDigest,
    checkpointSetDigest,
    reviewer,
    startedAt,
  });
  return `session:${sessionDigest.slice(7, 23)}`;
}

export async function startReviewSession(
  source: SourceDocument,
  checkpointSet: CheckpointSet,
  reviewer: ReviewerIdentity,
  clock: Clock,
): Promise<ReviewSession> {
  const startedAt = validTime(clock());
  const sessionId = await deriveReviewSessionId(
    source.sourceDigest,
    checkpointSet.checkpointSetDigest,
    reviewer,
    startedAt,
  );
  const answers = Object.fromEntries(checkpointSet.checkpoints.map((checkpoint) => [checkpoint.checkpointId, {
    checkpointId: checkpoint.checkpointId,
    revealedStepIds: [],
    explanation: null,
    confidence: null,
    decision: null,
    replacement: null,
    replacements: [],
    stepDispositions: checkpoint.learningSteps.map(({ stepId }) => ({
      stepId,
      disposition: null,
      replacement: null,
      decidedAt: null,
    })),
    decidedAt: null,
  }]));
  return {
    schemaVersion: 2,
    sessionId,
    sourceId: source.sourceId,
    sourceDigest: source.sourceDigest,
    checkpointSetId: checkpointSet.checkpointSetId,
    checkpointSetDigest: checkpointSet.checkpointSetDigest,
    reviewer,
    currentCheckpointIndex: 0,
    currentStepIndex: 0,
    phase: "orient",
    revision: 0,
    answers,
    events: [],
    startedAt,
    updatedAt: startedAt,
  };
}

export function advancePhase(
  session: ReviewSession,
  checkpointSet: CheckpointSet,
  expected: ExpectedTransition,
  clock: Clock,
): SessionResult {
  const check = checkTransition(session, checkpointSet, expected, undefined, session.phase === "learn");
  if (check) return check;
  if (session.phase === "orient") return changed(session, expected, { phase: "learn" }, clock);
  return invalid("step_disposition_required", "Choose Looks right or Revise for the active learning passage.");
}

export function recordStepDisposition(
  session: ReviewSession,
  checkpointSet: CheckpointSet,
  expected: ExpectedTransition,
  input: StepDispositionInput,
  clock: Clock,
): SessionResult {
  const check = checkTransition(session, checkpointSet, expected, "learn", true);
  if (check) return check;
  const checkpoint = checkpointSet.checkpoints[session.currentCheckpointIndex];
  const step = activeStep(checkpointSet, session);
  const answer = session.answers[expected.checkpointId];
  if (!checkpoint || !step || !answer || expected.stepId !== step.stepId) {
    return invalid("step_mismatch", "That learning step is not active.");
  }
  if (answer.revealedStepIds.length !== session.currentStepIndex ||
      answer.stepDispositions.some((entry, index) => index < session.currentStepIndex && entry.disposition === null) ||
      answer.stepDispositions[session.currentStepIndex]?.disposition !== null) {
    return invalid("step_order", "Learning passages must be disposed in their original order.");
  }
  const allowedDispositions = checkpoint.dispositionOptions ?? ["pass", "revise"];
  if (!allowedDispositions.includes(input.disposition)) {
    return invalid("disposition_invalid", `Choose one of: ${allowedDispositions.join(", ")}.`);
  }
  const replacement = input.replacement ? createReplacement(checkpointSet, session, input.replacement) : null;
  if (replacement && !replacement.ok) return replacement;
  if (input.disposition !== "revise" && input.replacement) {
    return invalid("replacement_forbidden", "Only Revise can include a replacement request.");
  }
  if (input.disposition === "revise" && !replacement) {
    return invalid("replacement_required", "Provide a desired replacement before choosing Revise.");
  }
  const decidedAt = validTime(clock());
  const disposition: StepDispositionRecord = {
    stepId: step.stepId,
    disposition: input.disposition,
    replacement: replacement?.ok ? replacement.value : null,
    decidedAt,
  };
  const stepDispositions = answer.stepDispositions.map((entry, index) =>
    index === session.currentStepIndex ? disposition : entry,
  );
  const revealedStepIds = [...answer.revealedStepIds, step.stepId];
  const finalStep = session.currentStepIndex === checkpoint.learningSteps.length - 1;
  const revised = stepDispositions.filter((entry) => entry.disposition === "revise")
    .map((entry) => entry.replacement)
    .filter((entry): entry is ReplacementRequest => entry !== null);
  const final = finalStep && checkpoint.reviewMode === "disposition";
  return changedAt(session, expected, {
    phase: final ? nextPhase(session, checkpointSet) : finalStep ? "explain_back" : "learn",
    currentCheckpointIndex: final ? nextCheckpointIndex(session, checkpointSet) : session.currentCheckpointIndex,
    currentStepIndex: final ? 0 : finalStep ? session.currentStepIndex : session.currentStepIndex + 1,
    answers: updateAnswer(session, expected.checkpointId, {
      revealedStepIds,
      stepDispositions,
      replacements: revised,
      replacement: revised[0] ?? null,
      ...(final ? {
        decision: aggregateDecision(stepDispositions),
        decidedAt,
      } : {}),
    }),
  }, decidedAt);
}

export function recordStepReveal(
  session: ReviewSession,
  checkpointSet: CheckpointSet,
  expected: ExpectedTransition,
  clock: Clock,
): SessionResult {
  const check = checkTransition(session, checkpointSet, expected, "learn", true);
  if (check) return check;
  void clock;
  return invalid("step_disposition_required", "A learning passage is revealed and disposed in one atomic transition.");
}

export function returnToPreviousPhase(
  session: ReviewSession,
  checkpointSet: CheckpointSet,
  expected: ExpectedTransition,
  clock: Clock,
): SessionResult {
  const check = checkTransition(session, checkpointSet, expected, undefined, session.phase === "learn");
  if (check) return check;
  if (session.phase === "learn" && session.currentStepIndex > 0) {
    return changed(session, expected, { currentStepIndex: session.currentStepIndex - 1 }, clock);
  }
  if (session.phase === "orient") return invalid("phase_at_start", "This checkpoint is already at its first step.");
  if (session.phase === "learn") return changed(session, expected, { phase: "orient" }, clock);
  if (session.phase === "explain_back") {
    return changed(session, expected, { phase: "learn", currentStepIndex: checkpointSet.checkpoints[session.currentCheckpointIndex].learningSteps.length - 1 }, clock);
  }
  if (session.phase === "confidence") return changed(session, expected, { phase: "explain_back" }, clock);
  if (session.phase === "decide") {
    const checkpoint = checkpointSet.checkpoints[session.currentCheckpointIndex];
    return changed(session, expected, {
      phase: checkpoint.reviewMode === "disposition" ? "learn" : "explain_back",
    }, clock);
  }
  return invalid("phase_at_start", "This checkpoint is already at its first step.");
}

export function reopenCheckpoint(
  session: ReviewSession,
  checkpointSet: CheckpointSet,
  expected: ExpectedTransition,
  checkpointId: string,
  clock: Clock,
): SessionResult {
  if (session.checkpointSetId !== checkpointSet.checkpointSetId ||
      session.checkpointSetDigest !== checkpointSet.checkpointSetDigest) {
    return invalid("checkpoint_set_mismatch", "That checkpoint set does not belong to this review session.");
  }
  if (session.phase !== "complete" || expected.phase !== "complete") {
    return invalid("review_incomplete", "Completed checkpoints can be reopened from the final review.");
  }
  if (session.events.some((event) => event.eventId === expected.eventId)) {
    return invalid("event_replayed", "That action was already applied.");
  }
  if (expected.revision !== session.revision) {
    return invalid("revision_stale", "The review changed. Reload before continuing.");
  }
  const checkpointIndex = checkpointSet.checkpoints.findIndex((checkpoint) => checkpoint.checkpointId === checkpointId);
  const checkpoint = checkpointSet.checkpoints[checkpointIndex];
  const answer = session.answers[checkpointId];
  if (!checkpoint || !answer || expected.checkpointId !== checkpointId) {
    return invalid("checkpoint_mismatch", "That checkpoint does not belong to this review.");
  }
  return changed(session, expected, {
    phase: "orient",
    currentCheckpointIndex: checkpointIndex,
    currentStepIndex: 0,
    answers: updateAnswer(session, checkpointId, {
      revealedStepIds: [],
      decision: null,
      replacement: null,
      replacements: [],
      stepDispositions: checkpoint.learningSteps.map(({ stepId }) => ({
        stepId,
        disposition: null,
        replacement: null,
        decidedAt: null,
      })),
      decidedAt: null,
    }),
  }, clock);
}

export function recordExplanation(
  session: ReviewSession,
  checkpointSet: CheckpointSet,
  expected: ExpectedTransition,
  explanation: string,
  clock: Clock,
): SessionResult {
  const check = checkTransition(session, checkpointSet, expected, "explain_back");
  if (check) return check;
  if (explanation.trim().length < 20) return invalid("explanation_short", "Explain the idea in at least 20 characters.");
  const checkpoint = checkpointSet.checkpoints[session.currentCheckpointIndex];
  const answer = session.answers[expected.checkpointId];
  if (!checkpoint || !answer || answer.stepDispositions.some((entry) => entry.disposition === null)) {
    return invalid("step_disposition_required", "Dispose every learning passage before reflecting.");
  }
  const replacements = revisedReplacements(answer.stepDispositions);
  const recordedAt = validTime(clock());
  const nextIndex = nextCheckpointIndex(session, checkpointSet);
  const final = nextIndex === session.currentCheckpointIndex;
  return changedAt(session, expected, {
    phase: final ? "complete" : "orient",
    currentCheckpointIndex: nextIndex,
    currentStepIndex: 0,
    answers: updateAnswer(session, expected.checkpointId, {
      explanation: explanation.trim(),
      decision: replacements.length ? "revise" : "approve",
      replacement: replacements[0] ?? null,
      replacements,
      decidedAt: recordedAt,
    }),
  }, recordedAt);
}

export function recordConfidence(
  session: ReviewSession,
  checkpointSet: CheckpointSet,
  expected: ExpectedTransition,
  confidence: 1 | 2 | 3 | 4 | 5,
  clock: Clock,
): SessionResult {
  const check = checkTransition(session, checkpointSet, expected, "confidence");
  if (check) return check;
  return changed(session, expected, {
    phase: "decide",
    answers: updateAnswer(session, expected.checkpointId, { confidence }),
  }, clock);
}

export function recordDecision(
  session: ReviewSession,
  checkpointSet: CheckpointSet,
  expected: ExpectedTransition,
  input: ReviewDispositionInput,
  clock: Clock,
): SessionResult {
  const check = checkTransition(session, checkpointSet, expected, "decide");
  if (check) return check;
  const replacement = input.replacement ? createReplacement(checkpointSet, session, input.replacement) : null;
  if (replacement && !replacement.ok) return replacement;
  if (input.decision === "revise" && !replacement) {
    return invalid("replacement_required", "Provide a desired replacement before choosing Needs revision.");
  }
  if (input.decision !== "revise" && input.replacement) {
    return invalid("replacement_decision_mismatch", "A replacement request belongs with Needs revision.");
  }
  const decidedAt = validTime(clock());
  const nextIndex = nextCheckpointIndex(session, checkpointSet);
  const finalCheckpoint = nextIndex === session.currentCheckpointIndex;
  return changed(session, expected, {
    phase: finalCheckpoint ? "complete" : "orient",
    currentCheckpointIndex: nextIndex,
    currentStepIndex: 0,
    answers: updateAnswer(session, expected.checkpointId, {
      decision: input.decision,
      replacement: replacement && replacement.ok ? replacement.value : null,
      decidedAt,
    }),
  }, () => decidedAt);
}

export function sessionMatches(session: ReviewSession, source: SourceDocument, set: CheckpointSet): boolean {
  return session.schemaVersion === 2 && session.sourceDigest === source.sourceDigest &&
    session.checkpointSetDigest === set.checkpointSetDigest;
}

function createReplacement(
  checkpointSet: CheckpointSet,
  session: ReviewSession,
  input: ReplacementRequestInput,
): ReplacementResult {
  const checkpoint = checkpointSet.checkpoints[session.currentCheckpointIndex];
  const step = checkpoint.learningSteps.find((candidate) => candidate.stepId === input.stepId);
  if (!step) return { ok: false, code: "step_mismatch", message: "Choose a learning step from this checkpoint." };
  if (!input.replacement.trim()) return { ok: false, code: "replacement_required", message: "Describe the desired replacement text." };
  if (input.replacement.trim() === step.sourceQuote) {
    return { ok: false, code: "replacement_unchanged", message: "The desired replacement must differ from the immutable original." };
  }
  return {
    ok: true,
    value: {
      stepId: step.stepId,
      original: step.sourceQuote,
      replacement: input.replacement.trim(),
      rationale: input.rationale?.trim() || null,
    },
  };
}

type ReplacementResult =
  | Readonly<{ ok: true; value: ReplacementRequest }>
  | Readonly<{ ok: false; code: string; message: string }>;

function activeStep(checkpointSet: CheckpointSet, session: ReviewSession) {
  return checkpointSet.checkpoints[session.currentCheckpointIndex]?.learningSteps[session.currentStepIndex];
}

function revisedReplacements(dispositions: readonly StepDispositionRecord[]): ReplacementRequest[] {
  return dispositions.filter((entry) => entry.disposition === "revise")
    .map((entry) => entry.replacement)
    .filter((entry): entry is ReplacementRequest => entry !== null);
}

function aggregateDecision(dispositions: readonly StepDispositionRecord[]): ReviewDecision {
  if (dispositions.some(({ disposition }) => disposition === "revise")) return "revise";
  if (dispositions.some(({ disposition }) => disposition === "needs_qa")) return "needs_qa";
  if (dispositions.some(({ disposition }) => disposition === "question")) return "question";
  return "approve";
}

function nextPhase(session: ReviewSession, checkpointSet: CheckpointSet): ReviewPhase {
  return nextCheckpointIndex(session, checkpointSet) === session.currentCheckpointIndex ? "complete" : "orient";
}

function nextCheckpointIndex(session: ReviewSession, checkpointSet: CheckpointSet): number {
  const next = checkpointSet.checkpoints.findIndex((checkpoint, index) =>
    index > session.currentCheckpointIndex && session.answers[checkpoint.checkpointId]?.decision === null,
  );
  return next < 0 ? session.currentCheckpointIndex : next;
}

function changed(
  session: ReviewSession,
  expected: ExpectedTransition,
  changes: Partial<ReviewSession>,
  clock: Clock,
): SessionResult {
  return changedAt(session, expected, changes, validTime(clock()));
}

function changedAt(
  session: ReviewSession,
  expected: ExpectedTransition,
  changes: Partial<ReviewSession>,
  recordedAt: string,
): SessionResult {
  const event: ReviewEvent = { ...expected, stepId: expected.stepId ?? null, recordedAt };
  return { ok: true, session: {
    ...session,
    ...changes,
    revision: session.revision + 1,
    events: [...session.events, event],
    updatedAt: recordedAt,
  }};
}

function checkTransition(
  session: ReviewSession,
  checkpointSet: CheckpointSet,
  expected: ExpectedTransition,
  phase?: ReviewPhase,
  requireStep = false,
): SessionResult | null {
  if (session.checkpointSetId !== checkpointSet.checkpointSetId ||
      session.checkpointSetDigest !== checkpointSet.checkpointSetDigest) {
    return invalid("checkpoint_set_mismatch", "That checkpoint set does not belong to this review session.");
  }
  const checkpoint = checkpointSet.checkpoints[session.currentCheckpointIndex];
  if (!checkpoint || expected.checkpointId !== checkpoint.checkpointId) {
    return invalid("checkpoint_mismatch", "That checkpoint is not active.");
  }
  const step = checkpoint.learningSteps[session.currentStepIndex];
  if ((requireStep || expected.stepId !== undefined) && (!step || expected.stepId !== step.stepId)) {
    return invalid("step_mismatch", "That learning step is not active.");
  }
  if (session.events.some((event) => event.eventId === expected.eventId)) return invalid("event_replayed", "That action was already applied.");
  if (expected.revision !== session.revision) return invalid("revision_stale", "The review changed. Reload before continuing.");
  if (expected.phase !== session.phase || (phase && session.phase !== phase)) return invalid("phase_mismatch", "That action is not valid at this step.");
  const answer = session.answers[checkpoint.checkpointId];
  if (!answer || answer.checkpointId !== checkpoint.checkpointId) return invalid("checkpoint_mismatch", "That checkpoint is not active.");
  return null;
}

function updateAnswer(session: ReviewSession, id: string, change: Partial<CheckpointAnswer>): Readonly<Record<string, CheckpointAnswer>> {
  return { ...session.answers, [id]: { ...session.answers[id], ...change } };
}

function invalid(code: string, message: string): SessionResult {
  return { ok: false, code, message };
}

function validTime(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new TypeError("The injected clock must return an RFC 3339 timestamp.");
  return value;
}
