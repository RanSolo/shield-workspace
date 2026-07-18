import type {
  MissionEvent,
  MissionState,
  TrustedTimestamp,
  ValidationResult,
} from "./mission.mjs";

export const JOURNAL_SCHEMA_VERSION: 1;
export const JOURNAL_ENTRY_TYPES: readonly [
  "governance.event", "execution.transition", "review.recorded", "effect.completed",
];
export type JournalEntryType = (typeof JOURNAL_ENTRY_TYPES)[number];

export const EXECUTION_STATUSES: readonly [
  "not-started", "running", "blocked", "failed", "completed",
];
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
export type ReviewVerdict = "approved" | "changes_requested" | "commented";

interface JournalEnvelope<TType extends JournalEntryType, TPayload> {
  schemaVersion: 1;
  entryId: string;
  missionId: string;
  sequence: number;
  type: TType;
  timestamp: TrustedTimestamp;
  payload: TPayload;
}

export type GovernanceJournalEntry = JournalEnvelope<
  "governance.event",
  { event: MissionEvent }
>;
export type ExecutionJournalEntry = JournalEnvelope<
  "execution.transition",
  { from: ExecutionStatus; to: ExecutionStatus; reason: string; evidenceRef: string }
>;
export type ReviewJournalEntry = JournalEnvelope<
  "review.recorded",
  { reviewerSeatId: string; verdict: ReviewVerdict; sourceRef: string; summary: string }
>;
export type EffectJournalEntry = JournalEnvelope<
  "effect.completed",
  { effectKey: string; resultSummary: string }
>;
export type JournalEntry =
  | GovernanceJournalEntry
  | ExecutionJournalEntry
  | ReviewJournalEntry
  | EffectJournalEntry;

export interface RecordedReview {
  entryId: string;
  reviewerSeatId: string;
  verdict: ReviewVerdict;
  sourceRef: string;
  summary: string;
  timestamp: TrustedTimestamp;
}

export interface CompletedEffect {
  entryId: string;
  effectKey: string;
  resultSummary: string;
  timestamp: TrustedTimestamp;
}

export interface MissionJournalProjection {
  missionState: MissionState | null;
  executionStatus: ExecutionStatus;
  reviewEvidence: RecordedReview[];
  completedEffects: CompletedEffect[];
  lastSequence: number;
  lastTimestamp: TrustedTimestamp | null;
}

export interface ParsedMissionJournal {
  entries: JournalEntry[];
  projection: MissionJournalProjection;
}

export function validateJournalEntry(entry: unknown): ValidationResult<JournalEntry>;
export function replayMissionJournal(
  missionId: string,
  entries: unknown,
): ValidationResult<MissionJournalProjection>;
export function serializeJournalEntry(entry: unknown): ValidationResult<string>;
export function parseJournalJsonl(
  missionId: string,
  text: unknown,
): ValidationResult<ParsedMissionJournal>;
