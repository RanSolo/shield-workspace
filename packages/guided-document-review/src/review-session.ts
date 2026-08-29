import type { CheckpointSet } from "./checkpoint.js";
import { sha256Json } from "./canonical-json.js";
import type { SourceDocument } from "./source-document.js";

export type ReviewPhase = "orient" | "teach" | "ask" | "explain_back" | "confidence" | "decide" | "complete";
export type ReviewDecision = "understand" | "question" | "revise" | "approve";
export type ReviewerIdentity =
  | Readonly<{ kind: "unattributed"; name: null }>
  | Readonly<{ kind: "self_asserted"; name: string }>;

export interface CheckpointAnswer {
  readonly checkpointId: string;
  readonly explanation: string | null;
  readonly confidence: 1 | 2 | 3 | 4 | 5 | null;
  readonly decision: ReviewDecision | null;
  readonly requestedChange: string | null;
  readonly decidedAt: string | null;
}

export interface ReviewDispositionInput {
  readonly decision: ReviewDecision;
  readonly requestedChange?: string;
}

export interface ReviewEvent {
  readonly eventId: string;
  readonly checkpointId: string;
  readonly phase: ReviewPhase;
  readonly revision: number;
  readonly recordedAt: string;
}

export interface ReviewSession {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly sourceId: string;
  readonly sourceDigest: string;
  readonly checkpointSetId: string;
  readonly checkpointSetDigest: string;
  readonly reviewer: ReviewerIdentity;
  readonly currentCheckpointIndex: number;
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
  readonly phase: ReviewPhase;
  readonly revision: number;
}

export type SessionResult =
  | Readonly<{ ok: true; session: ReviewSession }>
  | Readonly<{ ok: false; code: string; message: string }>;

export type Clock = () => string;

export async function startReviewSession(
  source: SourceDocument,
  checkpointSet: CheckpointSet,
  reviewer: ReviewerIdentity,
  clock: Clock,
): Promise<ReviewSession> {
  const startedAt = validTime(clock());
  const sessionDigest = await sha256Json({
    schemaVersion: 1,
    sourceDigest: source.sourceDigest,
    checkpointSetDigest: checkpointSet.checkpointSetDigest,
    reviewer,
    startedAt,
  });
  const answers = Object.fromEntries(checkpointSet.checkpoints.map((checkpoint) => [checkpoint.checkpointId, {
    checkpointId: checkpoint.checkpointId,
    explanation: null,
    confidence: null,
    decision: null,
    requestedChange: null,
    decidedAt: null,
  }]));
  return {
    schemaVersion: 1,
    sessionId: `session:${sessionDigest.slice(7, 23)}`,
    sourceId: source.sourceId,
    sourceDigest: source.sourceDigest,
    checkpointSetId: checkpointSet.checkpointSetId,
    checkpointSetDigest: checkpointSet.checkpointSetDigest,
    reviewer,
    currentCheckpointIndex: 0,
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
  expected: ExpectedTransition,
  clock: Clock,
): SessionResult {
  const check = checkTransition(session, expected);
  if (check) return check;
  const next = nextPhase(session.phase);
  if (!next) return invalid("phase_complete", "This checkpoint needs a decision before it can advance.");
  return changed(session, expected, { phase: next }, clock);
}

export function returnToPreviousPhase(
  session: ReviewSession,
  expected: ExpectedTransition,
  clock: Clock,
): SessionResult {
  const check = checkTransition(session, expected);
  if (check) return check;
  const previous = previousPhase(session.phase);
  if (!previous) return invalid("phase_at_start", "This checkpoint is already at its first step.");
  return changed(session, expected, { phase: previous }, clock);
}

export function recordExplanation(
  session: ReviewSession,
  expected: ExpectedTransition,
  explanation: string,
  clock: Clock,
  requestedChange = "",
): SessionResult {
  const check = checkTransition(session, expected);
  if (check) return check;
  if (session.phase !== "explain_back" && session.phase !== "ask") {
    return invalid("phase_mismatch", "That action is not valid at this step.");
  }
  if (explanation.trim().length < 20) return invalid("explanation_short", "Explain the idea in at least 20 characters.");
  return changed(session, expected, {
    phase: "confidence",
    answers: updateAnswer(session, expected.checkpointId, {
      explanation: explanation.trim(),
      requestedChange: requestedChange.trim() || null,
    }),
  }, clock);
}

export function recordConfidence(
  session: ReviewSession,
  expected: ExpectedTransition,
  confidence: 1 | 2 | 3 | 4 | 5,
  clock: Clock,
): SessionResult {
  const check = checkTransition(session, expected, "confidence");
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
  const check = checkTransition(session, expected, "decide");
  if (check) return check;
  const requestedChange = input.requestedChange?.trim() ||
    session.answers[expected.checkpointId]?.requestedChange?.trim() || "";
  if (input.decision === "revise" && requestedChange.length < 10) {
    return invalid("change_request_required", "Describe the requested change before choosing Needs revision.");
  }
  const decidedAt = validTime(clock());
  const finalCheckpoint = session.currentCheckpointIndex === checkpointSet.checkpoints.length - 1;
  return changed(session, expected, {
    phase: finalCheckpoint ? "complete" : "orient",
    currentCheckpointIndex: finalCheckpoint ? session.currentCheckpointIndex : session.currentCheckpointIndex + 1,
    answers: updateAnswer(session, expected.checkpointId, {
      decision: input.decision,
      requestedChange: requestedChange || null,
      decidedAt,
    }),
  }, () => decidedAt);
}

export function sessionMatches(session: ReviewSession, source: SourceDocument, set: CheckpointSet): boolean {
  return session.schemaVersion === 1 && session.sourceDigest === source.sourceDigest &&
    session.checkpointSetDigest === set.checkpointSetDigest;
}

function changed(
  session: ReviewSession,
  expected: ExpectedTransition,
  changes: Partial<ReviewSession>,
  clock: Clock,
): SessionResult {
  const recordedAt = validTime(clock());
  const event: ReviewEvent = { ...expected, recordedAt };
  return { ok: true, session: {
    ...session,
    ...changes,
    revision: session.revision + 1,
    events: [...session.events, event],
    updatedAt: recordedAt,
  }};
}

function checkTransition(session: ReviewSession, expected: ExpectedTransition, phase?: ReviewPhase): SessionResult | null {
  if (session.events.some((event) => event.eventId === expected.eventId)) return invalid("event_replayed", "That action was already applied.");
  if (expected.revision !== session.revision) return invalid("revision_stale", "The review changed. Reload before continuing.");
  if (expected.phase !== session.phase || (phase && session.phase !== phase)) return invalid("phase_mismatch", "That action is not valid at this step.");
  const answer = session.answers[expected.checkpointId];
  if (!answer || answer.checkpointId !== expected.checkpointId) return invalid("checkpoint_mismatch", "That checkpoint is not active.");
  return null;
}

function nextPhase(phase: ReviewPhase): ReviewPhase | null {
  return ({ orient: "teach", teach: "explain_back", ask: "explain_back" } as Partial<Record<ReviewPhase, ReviewPhase>>)[phase] ?? null;
}

function previousPhase(phase: ReviewPhase): ReviewPhase | null {
  return ({
    teach: "orient",
    ask: "teach",
    explain_back: "teach",
    confidence: "explain_back",
    decide: "confidence",
  } as Partial<Record<ReviewPhase, ReviewPhase>>)[phase] ?? null;
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
