export const MISSION_DECISIONS: readonly [
  "approve", "edit", "reject", "pause", "resume", "cancel",
];
export type MissionDecision = (typeof MISSION_DECISIONS)[number];

export const MISSION_STATES: readonly [
  "proposed", "approved", "paused", "rejected", "cancelled",
];
export type MissionState = (typeof MISSION_STATES)[number];

export const TERMINAL_MISSION_STATES: readonly ["rejected", "cancelled"];

export const RISK_FLAGS: readonly [
  "production", "destructive", "migration", "credentialsOrSecurity",
  "externalCommunication", "merge", "deploy", "release", "hillHighRisk",
];
export type RiskFlag = (typeof RISK_FLAGS)[number];
export type RiskFlags = Readonly<Record<RiskFlag, boolean>>;

export const TIMING_EVIDENCE_SOURCES: readonly ["hostTrusted", "humanRecorded"];
export type TimingEvidenceSource = (typeof TIMING_EVIDENCE_SOURCES)[number];

export interface RiskAssessment {
  level: "low" | "high";
  requiresExplicitApproval: boolean;
  reasons: string[];
}

export interface TimeoutEvaluation {
  allowed: boolean;
  reason: string;
}

export interface RepairAuthorization {
  allowed: boolean;
  requiresCoulson: boolean;
  reason: string;
  hardCap: number;
}

export interface ValidResult<T> {
  state: "valid";
  value: T;
}

export interface InvalidResult {
  state: "invalid";
  errors: string[];
  code?: string;
}

export type ValidationResult<T> = ValidResult<T> | InvalidResult;

export interface TrustedTimestamp {
  value: string;
  provenance: TimingEvidenceSource;
}

export interface MissionCreatedEvent {
  schemaVersion: 2;
  eventId: string;
  missionId: string;
  sequence: number;
  type: "mission.created";
  actor: string;
  previousState: null;
  resultingState: "proposed";
  timestamp: TrustedTimestamp;
}

export interface MissionDecisionEvent {
  schemaVersion: 2;
  eventId: string;
  missionId: string;
  sequence: number;
  type: "mission.decision";
  actor: string;
  previousState: MissionState;
  resultingState: MissionState;
  timestamp: TrustedTimestamp;
  decision: MissionDecision;
  resumeState?: "proposed" | "approved";
}

export type MissionEvent = MissionCreatedEvent | MissionDecisionEvent;

export interface MissionParticipant {
  seatId: string;
}

export interface ActivatedMode {
  modeId: string;
  modeVersion: string;
  seatId: string;
  activationSource: string;
}

export interface MissionRecord {
  schemaVersion: 2;
  missionId: string;
  objective: string;
  state: MissionState;
  riskFlags: RiskFlags;
  participants: MissionParticipant[];
  activatedModes: ActivatedMode[];
  createdAt: TrustedTimestamp;
  updatedAt: TrustedTimestamp;
  events: MissionEvent[];
}

export interface MissionReplayProjection {
  missionState: MissionState;
  lastSequence: number;
  lastTimestamp: TrustedTimestamp;
}

export const MISSION_SCHEMA_VERSION: 2;
export const MISSION_EVENT_TYPES: readonly ["mission.created", "mission.decision"];

export function getMissionTransition(
  fromState: unknown,
  decision: unknown,
  context?: unknown,
): MissionState | null;
export function classifyMissionRisk(flags: unknown): RiskAssessment;
export function evaluateLightweightTimeout(input: unknown): TimeoutEvaluation;
export function canDispatchSpecialists(input: unknown): boolean;
export function authorizeRepair(input: unknown): RepairAuthorization;
export function validateMissionEvent(event: unknown): ValidationResult<MissionEvent>;
export function replayMissionEvents(
  missionId: string,
  events: unknown,
): ValidationResult<MissionReplayProjection>;
export function validateMissionRecord(record: unknown): ValidationResult<MissionRecord>;
