import { createHash, createPublicKey, verify } from "node:crypto";
import {
  validateExecutionEffectPayloadCommon,
  validateRunnerSupervisedEffectCandidateCommon,
  type ExecutionEffectPayloadValidationMessages,
  type RunnerSupervisedEffectCandidateValidationMessages,
} from "./runner-supervision-shared-v1.mjs";
import {
  DELEGATED_INVALIDATION_REASONS,
  evaluateWheelsOffEligibility,
  resolveWheelsOffDelegationRevision,
  type DelegationLogEntry,
  type DelegatedInvalidationReason,
  type WheelsOffEligibility,
  type WheelsOffEvaluation,
} from "./delegation-v1.mjs";
import {
  validateAdapterCandidate,
  validateCommunicationRequest,
  type CommunicationFailureReason,
  type CommunicationRequestPayload,
  type CommunicationResultAdapterCandidate,
} from "./adapter-v1.mjs";
import { validateRuntimeBinding, type RuntimeBinding } from "./permission-v1.mjs";

export const SUPERVISED_JOURNAL_SCHEMA_VERSION = 2 as const;
export const DELEGATED_JOURNAL_SCHEMA_VERSION = 3 as const;
export const ADAPTER_JOURNAL_SCHEMA_VERSION = 4 as const;
export const RUNNER_JOURNAL_SCHEMA_VERSION = 5 as const;
export const PERMISSION_JOURNAL_SCHEMA_VERSION = 6 as const;
export const REVIEW_JOURNAL_SCHEMA_VERSION = 7 as const;
export const SUPERVISED_BRIEF_SCHEMA_VERSION = 1 as const;
export const HUMAN_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const TRUSTED_BINDING_SCHEMA_VERSION = 1 as const;
export const HUMAN_SEATS = ["coulson", "fitz", "simmons"] as const;
export const EVIDENCE_KINDS = [
  "mission_authorization",
  "technical_review",
  "product_domain_review",
] as const;
export const EVIDENCE_DECISIONS = [
  "approved",
  "changes_requested",
  "rejected",
  "paused",
  "resumed",
  "cancelled",
] as const;

export type HumanSeat = (typeof HUMAN_SEATS)[number];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type EvidenceDecision = (typeof EVIDENCE_DECISIONS)[number];
export type GovernanceState = "proposed" | "approved" | "paused" | "cancelled";
export type ExecutionStatus = "not-started" | "running" | "completed";
export type RequirementStatus = "pending" | "satisfied" | "blocked";
export type ReadinessState = "ready" | "waiting" | "blocked" | "invalid";
export type AuthorizationSource = "none" | "supervised" | "delegated";
export type AuthorizationState = "waiting" | "authorized" | "ineligible" | "invalidated";
export type CommunicationState = "not-configured" | "queued" | "delivered" | "failed" | "unknown";
export type ExecutionEffectOutcome = "completed" | "uncertain";
export type ExecutionEffectClass = "behavioral_implementation" | "verification" | "coordination";
export type ReviewSubjectKind = "repository_artifact";
export type FuryReviewVerdict = "changes_requested" | "approved";
export type DraftDisposition = "remain_draft" | "return_to_draft";
export type ReviewLifecycle = "current" | "stale";

export interface EvidenceTimestamp {
  value: string;
  provenance: "humanRecorded" | "hostTrusted";
}

export interface MissionParticipant {
  seatId: string;
}

export interface MissionModeActivation {
  modeId: string;
  modeVersion: string;
  seatId: string;
  activationSource: string;
}

export interface MissionRiskFlags {
  production: boolean;
  destructive: boolean;
  migration: boolean;
  credentialsOrSecurity: boolean;
  externalCommunication: boolean;
  merge: boolean;
  deploy: boolean;
  release: boolean;
  hillHighRisk: boolean;
}

export interface SupervisedMissionBriefContent {
  schemaVersion: 1;
  missionId: string;
  objective: string;
  subjectId: string;
  riskFlags: MissionRiskFlags;
  participants: MissionParticipant[];
  activatedModes: MissionModeActivation[];
  requireSimmons: boolean;
  createdAt: EvidenceTimestamp;
}

export interface SupervisedMissionBrief extends SupervisedMissionBriefContent {
  revisionId: string;
}

export interface TrustedHumanBinding {
  schemaVersion: 1;
  bindingId: string;
  humanPrincipalId: string;
  seatId: HumanSeat;
  missionScope: string;
  signingKeyRef: string;
  publicKeySpkiBase64: string;
  validFromSequence: number;
  validThroughSequence: number | null;
  attestedBy: string;
  provenanceRef: string;
}

export interface TrustedBindingRegistry {
  schemaVersion: 1;
  bindings: TrustedHumanBinding[];
}

export interface EvidenceRequirement {
  schemaVersion: 1;
  requirementId: string;
  missionId: string;
  subjectKind: "mission_plan" | ReviewSubjectKind;
  subjectId: string;
  revisionId: string;
  requiredSeatId: HumanSeat;
  evidenceKind: EvidenceKind;
  allowedDecisions: EvidenceDecision[];
  createdAtSequence: number;
  supersedesRequirementId: string | null;
}

export interface HumanEvidencePayload {
  schemaVersion: 1;
  evidenceId: string;
  requirementId: string;
  missionId: string;
  subjectKind: "mission_plan" | ReviewSubjectKind;
  subjectId: string;
  revisionId: string;
  seatId: HumanSeat;
  evidenceKind: EvidenceKind;
  decision: EvidenceDecision;
  governanceTarget: GovernanceState | null;
  humanPrincipalId: string;
  bindingId: string;
  signingKeyRef: string;
  sourceRef: string;
  timestamp: EvidenceTimestamp;
  journalSequence: number;
}

export interface SignedHumanEvidence {
  payload: HumanEvidencePayload;
  signatureBase64: string;
}

export interface RuntimeBindingAuthorizationPayload {
  schemaVersion: 1;
  authorizationId: string;
  missionId: string;
  subjectId: string;
  seatId: string;
  bindingId: string;
  bindingVersion: number;
  priorBindingId: string | null;
  priorBindingVersion: number | null;
  bindingDigest: string;
  artifactRevisionId: string;
  decision: "approved";
  previousJournalSequence: number;
  journalSequence: number;
  humanPrincipalId: string;
  humanBindingId: string;
  signingKeyRef: string;
  sourceRef: string;
  timestamp: EvidenceTimestamp;
}

export interface SignedRuntimeBindingAuthorization {
  payload: RuntimeBindingAuthorizationPayload;
  signatureBase64: string;
}

export interface ExecutionEffectPayload {
  runnerContractVersion: 1;
  cycleId: string;
  subjectId: string;
  revisionId: string;
  evaluatedThroughSequence: number;
  seatId: string;
  actionId: string;
  effectClass: ExecutionEffectClass;
  effectKey: string;
  authorizationDecisionId: string;
  outcome: ExecutionEffectOutcome;
  reasonCode: string;
  summary: string;
  evidenceRefs: string[];
}

export interface RunnerSupervisedEffectCandidate {
  runnerContractVersion: 1;
  candidateKind: "runner.supervised_effect_record";
  authority: "non_authoritative";
  journalSchemaVersion: 5 | 6 | 7;
  missionId: string;
  subjectId: string;
  revisionId: string;
  expectedPreviousSequence: number;
  intendedJournalSequence: number;
  payload: ExecutionEffectPayload;
}

export interface ExecutionEffectRecord extends ExecutionEffectPayload {
  entryId: string;
  missionId: string;
  journalSequence: number;
  timestamp: EvidenceTimestamp;
}

export interface ReviewSubjectRevision {
  schemaVersion: 1;
  subjectKind: ReviewSubjectKind;
  subjectId: string;
  revisionId: string;
  supersedesRevisionId: string | null;
  sourceRef: string;
}

export interface FuryReviewSourceLocation {
  path: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface FuryReviewFinding {
  findingId: string;
  findingClass: string;
  summary: string;
  evidenceRefs: string[];
  sourceLocation: FuryReviewSourceLocation;
}

export interface FuryReviewRecord {
  schemaVersion: 1;
  reviewId: string;
  missionId: string;
  subjectKind: ReviewSubjectKind;
  subjectId: string;
  revisionId: string;
  reviewerSeatId: "fury";
  verdict: FuryReviewVerdict;
  reasons: string[];
  findings: FuryReviewFinding[];
  decidedAt: EvidenceTimestamp;
  provenance: {
    assuranceKind: "host_asserted_non_authoritative";
    sourceRef: string;
    reasoningRuntimeId: string;
    toolExecutorId: string;
  };
  nextActionSeatId: string;
  draftDisposition: DraftDisposition;
}

export interface ReviewRevisionProjection extends ReviewSubjectRevision {
  introducedAtSequence: number;
  lifecycle: ReviewLifecycle;
}

export interface RequirementHistoryProjection extends EvidenceRequirement {
  lifecycle: "current" | "superseded";
}

export interface EvidenceHistoryProjection extends HumanEvidencePayload {
  lifecycle: ReviewLifecycle;
}

export interface FuryReviewProjection extends FuryReviewRecord {
  journalSequence: number;
  lifecycle: ReviewLifecycle;
}

export interface FitzRouteReadiness {
  state: "waiting" | "blocked" | "ready";
  revisionId: string;
  reviewId: string | null;
  reasons: string[];
  evaluatedThroughSequence: number;
}

export type SupervisedJournalEntry =
  | {
    schemaVersion: 2 | 3 | 4 | 5 | 6;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "mission.begun";
    timestamp: EvidenceTimestamp;
    payload: {
      brief: SupervisedMissionBrief;
      trustedBindings: TrustedHumanBinding[];
      requirements: EvidenceRequirement[];
    };
  }
  | {
    schemaVersion: 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "mission.begun";
    timestamp: EvidenceTimestamp;
    payload: {
      brief: SupervisedMissionBrief;
      trustedBindings: TrustedHumanBinding[];
      requirements: EvidenceRequirement[];
      reviewSubject: ReviewSubjectRevision;
    };
  }
  | {
    schemaVersion: 2 | 3 | 4 | 5 | 6 | 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "governance.decided";
    timestamp: EvidenceTimestamp;
    payload: {
      decision: "approve" | "pause" | "resume" | "cancel";
      resumeState: "proposed" | "approved" | null;
      evidence: SignedHumanEvidence;
    };
  }
  | {
    schemaVersion: 2 | 3 | 4 | 5 | 6 | 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "execution.transition";
    timestamp: EvidenceTimestamp;
    payload: { from: ExecutionStatus; to: ExecutionStatus; reason: string };
  }
  | {
    schemaVersion: 2 | 3 | 4 | 5 | 6 | 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "evidence.recorded";
    timestamp: EvidenceTimestamp;
    payload: { evidence: SignedHumanEvidence };
  }
  | {
    schemaVersion: 3;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "authorization.delegated_evaluated";
    timestamp: EvidenceTimestamp;
    payload: {
      repositoryId: string;
      delegationRevisionId: string;
      delegationLog: DelegationLogEntry[];
      eligibility: WheelsOffEligibility;
      evaluation: WheelsOffEvaluation;
    };
  }
  | {
    schemaVersion: 3;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "authorization.delegated_invalidated";
    timestamp: EvidenceTimestamp;
    payload: { reason: DelegatedInvalidationReason };
  }
  | {
    schemaVersion: 4 | 5 | 6 | 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "communication.requested";
    timestamp: EvidenceTimestamp;
    payload: { request: CommunicationRequestPayload };
  }
  | {
    schemaVersion: 4 | 5 | 6 | 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "communication.result_recorded";
    timestamp: EvidenceTimestamp;
    payload: { candidate: CommunicationResultAdapterCandidate };
  }
  | {
    schemaVersion: 5 | 6 | 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "execution.effect_recorded";
    timestamp: EvidenceTimestamp;
    payload: ExecutionEffectPayload;
  }
  | {
    schemaVersion: 6 | 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "runtime.binding_recorded";
    timestamp: EvidenceTimestamp;
    payload: { binding: RuntimeBinding; authorization: SignedRuntimeBindingAuthorization };
  }
  | {
    schemaVersion: 6 | 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "runtime.binding_superseded";
    timestamp: EvidenceTimestamp;
    payload: { priorBindingId: string; priorBindingVersion: number; binding: RuntimeBinding; authorization: SignedRuntimeBindingAuthorization };
  }
  | {
    schemaVersion: 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "subject.revision_superseded";
    timestamp: EvidenceTimestamp;
    payload: {
      reviewSubject: ReviewSubjectRevision;
      requirements: EvidenceRequirement[];
    };
  }
  | {
    schemaVersion: 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "fury.review_changes_requested";
    timestamp: EvidenceTimestamp;
    payload: { review: FuryReviewRecord };
  }
  | {
    schemaVersion: 7;
    entryId: string;
    missionId: string;
    sequence: number;
    type: "fury.review_approved";
    timestamp: EvidenceTimestamp;
    payload: { review: FuryReviewRecord };
  };

export interface RequirementProjection extends EvidenceRequirement {
  status: RequirementStatus;
  latestEvidenceId: string | null;
  reason: string;
}

export interface ReadinessProjection {
  actionId: "execute" | "accept";
  state: ReadinessState;
  requirementStatuses: RequirementProjection[];
  reasons: string[];
  evaluatedThroughSequence: number;
}

export interface CommunicationRequestProjection extends CommunicationRequestPayload {
  state: "queued" | "delivered" | "failed" | "unknown";
  candidateId: string | null;
  failureReason: CommunicationFailureReason | null;
  receiptRef: string | null;
  sourceRef: string | null;
}

export interface SupervisedMissionProjection {
  journalSchemaVersion: 2 | 3 | 4 | 5 | 6 | 7;
  missionId: string;
  brief: SupervisedMissionBrief;
  governance: { state: GovernanceState };
  authorization: {
    source: AuthorizationSource;
    state: AuthorizationState;
    missionRevisionId: string;
    delegationId: string | null;
    delegationRevisionId: string | null;
    eligibilityRevisionId: string | null;
    evaluatedThroughSequence: number;
    reasons: string[];
  };
  execution: { status: ExecutionStatus };
  readiness: {
    execute: ReadinessProjection;
    accept: ReadinessProjection;
  };
  communication: {
    state: CommunicationState;
    requests: CommunicationRequestProjection[];
  };
  effectRecords: ExecutionEffectRecord[];
  runtimeBindings: RuntimeBinding[];
  activeRuntimeBindings: RuntimeBinding[];
  trustedBindings: TrustedHumanBinding[];
  requirements: EvidenceRequirement[];
  evidence: HumanEvidencePayload[];
  reviewSubject?: ReviewSubjectRevision;
  reviewRevisions?: ReviewRevisionProjection[];
  requirementHistory?: RequirementHistoryProjection[];
  evidenceHistory?: EvidenceHistoryProjection[];
  furyReviews?: FuryReviewProjection[];
  routeToFitz?: FitzRouteReadiness;
  lastSequence: number;
  lastTimestamp: EvidenceTimestamp;
}

export type ContractResult<T> =
  | { state: "valid"; value: T }
  | { state: "invalid"; code: string; errors: string[] };

const invalid = <T = never,>(code: string, ...errors: string[]): ContractResult<T> => ({
  state: "invalid",
  code,
  errors: errors.flat(),
});
const valid = <T,>(value: T): ContractResult<T> => ({ state: "valid", value });
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const KEY_REF = /^ed25519:sha256:[A-Za-z0-9_-]{43}$/;
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;
const RISK_FIELDS = [
  "production", "destructive", "migration", "credentialsOrSecurity",
  "externalCommunication", "merge", "deploy", "release", "hillHighRisk",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactFields(value: unknown, fields: readonly string[], label: string): string[] {
  if (!isPlainObject(value)) return [`${label} must be a plain object.`];
  const allowed = new Set(fields);
  const errors: string[] = [];
  for (const field of fields) if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  for (const field of Object.keys(value)) if (!allowed.has(field)) errors.push(`${label} has unknown field: ${field}.`);
  return errors;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function timestampErrors(value: unknown, label: string): string[] {
  const errors = exactFields(value, ["value", "provenance"], label);
  if (errors.length > 0 || !isPlainObject(value)) return errors;
  if (typeof value.value !== "string" || !ISO_UTC.test(value.value) || !Number.isFinite(Date.parse(value.value))) {
    errors.push(`${label}.value must be a valid ISO 8601 UTC timestamp.`);
  }
  if (value.provenance !== "humanRecorded" && value.provenance !== "hostTrusted") {
    errors.push(`${label}.provenance is unsupported.`);
  }
  return errors;
}

function arrayShapeErrors(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return [`${label} must be a plain array.`];
  }
  const errors: string[] = [];
  for (const field of Reflect.ownKeys(value)) {
    if (field === "length") continue;
    if (typeof field !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(field)) {
      errors.push(`${label} has unknown field: ${String(field)}.`);
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      errors.push(`${label}[${field}] must be an enumerable data field.`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) errors.push(`${label} must not contain sparse positions.`);
  }
  return errors;
}

function reviewSubjectErrors(value: unknown, label: string): string[] {
  const errors = exactFields(value, [
    "schemaVersion", "subjectKind", "subjectId", "revisionId", "supersedesRevisionId", "sourceRef",
  ], label);
  if (errors.length > 0 || !isPlainObject(value)) return errors;
  if (value.schemaVersion !== 1) errors.push(`${label}.schemaVersion is unsupported.`);
  if (value.subjectKind !== "repository_artifact") errors.push(`${label}.subjectKind is unsupported.`);
  for (const field of ["subjectId", "revisionId", "sourceRef"]) {
    if (!identifier(value[field])) errors.push(`${label}.${field} is invalid.`);
  }
  if (value.supersedesRevisionId !== null && !identifier(value.supersedesRevisionId)) {
    errors.push(`${label}.supersedesRevisionId is invalid.`);
  }
  return errors;
}

function repositoryRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("%") || /[\u0000-\u001f\u007f]/.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function furyReviewErrors(value: unknown, label: string): string[] {
  const errors = exactFields(value, [
    "schemaVersion", "reviewId", "missionId", "subjectKind", "subjectId", "revisionId",
    "reviewerSeatId", "verdict", "reasons", "findings", "decidedAt", "provenance",
    "nextActionSeatId", "draftDisposition",
  ], label);
  if (errors.length > 0 || !isPlainObject(value)) return errors;
  if (value.schemaVersion !== 1) errors.push(`${label}.schemaVersion is unsupported.`);
  for (const field of ["reviewId", "missionId", "subjectId", "revisionId", "nextActionSeatId"]) {
    if (!identifier(value[field])) errors.push(`${label}.${field} is invalid.`);
  }
  if (value.subjectKind !== "repository_artifact") errors.push(`${label}.subjectKind is unsupported.`);
  if (value.reviewerSeatId !== "fury") errors.push(`${label}.reviewerSeatId must be fury.`);
  if (value.verdict !== "changes_requested" && value.verdict !== "approved") errors.push(`${label}.verdict is unsupported.`);
  errors.push(...timestampErrors(value.decidedAt, `${label}.decidedAt`));

  errors.push(...arrayShapeErrors(value.reasons, `${label}.reasons`));
  if (Array.isArray(value.reasons)) {
    if (value.reasons.length < 1 || value.reasons.length > 16) errors.push(`${label}.reasons must contain between 1 and 16 items.`);
    const reasons = new Set<string>();
    value.reasons.forEach((reason, index) => {
      if (!nonEmpty(reason)) errors.push(`${label}.reasons[${index}] is invalid.`);
      else if (reasons.has(reason)) errors.push(`${label}.reasons duplicates ${reason}.`);
      else reasons.add(reason);
    });
  }

  errors.push(...arrayShapeErrors(value.findings, `${label}.findings`));
  if (Array.isArray(value.findings)) {
    if (value.findings.length > 16) errors.push(`${label}.findings must contain at most 16 items.`);
    const findingIds = new Set<string>();
    value.findings.forEach((finding, index) => {
      const findingLabel = `${label}.findings[${index}]`;
      const nested = exactFields(finding, [
        "findingId", "findingClass", "summary", "evidenceRefs", "sourceLocation",
      ], findingLabel);
      errors.push(...nested);
      if (nested.length > 0 || !isPlainObject(finding)) return;
      for (const field of ["findingId", "findingClass"]) {
        if (!identifier(finding[field])) errors.push(`${findingLabel}.${field} is invalid.`);
      }
      if (identifier(finding.findingId)) {
        if (findingIds.has(finding.findingId)) errors.push(`${label}.findings duplicates ${finding.findingId}.`);
        findingIds.add(finding.findingId);
      }
      if (!nonEmpty(finding.summary)) errors.push(`${findingLabel}.summary is invalid.`);
      errors.push(...arrayShapeErrors(finding.evidenceRefs, `${findingLabel}.evidenceRefs`));
      if (Array.isArray(finding.evidenceRefs)) {
        if (finding.evidenceRefs.length < 1 || finding.evidenceRefs.length > 16) {
          errors.push(`${findingLabel}.evidenceRefs must contain between 1 and 16 items.`);
        }
        const refs = new Set<string>();
        finding.evidenceRefs.forEach((ref, refIndex) => {
          if (!identifier(ref)) errors.push(`${findingLabel}.evidenceRefs[${refIndex}] is invalid.`);
          else if (refs.has(ref)) errors.push(`${findingLabel}.evidenceRefs duplicates ${ref}.`);
          else refs.add(ref);
        });
      }
      const locationLabel = `${findingLabel}.sourceLocation`;
      const locationErrors = exactFields(finding.sourceLocation, [
        "path", "startLine", "startColumn", "endLine", "endColumn",
      ], locationLabel);
      errors.push(...locationErrors);
      if (locationErrors.length > 0 || !isPlainObject(finding.sourceLocation)) return;
      if (!repositoryRelativePath(finding.sourceLocation.path)) errors.push(`${locationLabel}.path is invalid.`);
      for (const field of ["startLine", "startColumn", "endLine", "endColumn"]) {
        if (!Number.isSafeInteger(finding.sourceLocation[field]) || (finding.sourceLocation[field] as number) < 1) {
          errors.push(`${locationLabel}.${field} must be a positive safe integer.`);
        }
      }
      const { startLine, startColumn, endLine, endColumn } = finding.sourceLocation;
      if (Number.isSafeInteger(startLine) && Number.isSafeInteger(startColumn) &&
          Number.isSafeInteger(endLine) && Number.isSafeInteger(endColumn) &&
          ((endLine as number) < (startLine as number) ||
           ((endLine as number) === (startLine as number) && (endColumn as number) < (startColumn as number)))) {
        errors.push(`${locationLabel} end precedes start.`);
      }
    });
  }

  const provenanceErrors = exactFields(value.provenance, [
    "assuranceKind", "sourceRef", "reasoningRuntimeId", "toolExecutorId",
  ], `${label}.provenance`);
  errors.push(...provenanceErrors);
  if (provenanceErrors.length === 0 && isPlainObject(value.provenance)) {
    if (value.provenance.assuranceKind !== "host_asserted_non_authoritative") {
      errors.push(`${label}.provenance.assuranceKind is unsupported.`);
    }
    for (const field of ["sourceRef", "reasoningRuntimeId", "toolExecutorId"]) {
      if (!identifier(value.provenance[field])) errors.push(`${label}.provenance.${field} is invalid.`);
    }
    const seatIds = new Set(["coulson", "fitz", "simmons", "hill", "fury", "daisy", "may", "mack", "oracle"]);
    if (seatIds.has(String(value.provenance.reasoningRuntimeId)) || seatIds.has(String(value.provenance.toolExecutorId))) {
      errors.push(`${label}.provenance runtime and executor identities cannot impersonate SHIELD seats.`);
    }
  }

  if (value.verdict === "approved") {
    if (value.nextActionSeatId !== "hill") errors.push(`${label}.approved nextActionSeatId must be hill.`);
    if (value.draftDisposition !== "remain_draft") errors.push(`${label}.approved draftDisposition must remain_draft.`);
  } else if (value.verdict === "changes_requested") {
    if (!["may", "daisy", "fury", "hill", "coulson"].includes(String(value.nextActionSeatId))) {
      errors.push(`${label}.changes_requested nextActionSeatId is unsupported.`);
    }
    if (value.draftDisposition !== "remain_draft" && value.draftDisposition !== "return_to_draft") {
      errors.push(`${label}.changes_requested draftDisposition is unsupported.`);
    }
  }
  return errors;
}

function executionEffectPayloadErrors(value: unknown, label: string): string[] {
  const messages: ExecutionEffectPayloadValidationMessages = {
    contractVersionUnsupported: (nestedLabel) => `${nestedLabel}.runnerContractVersion is unsupported.`,
    fieldInvalid: (nestedLabel, field) => `${nestedLabel}.${field} is invalid.`,
    effectClassUnsupported: (nestedLabel) => `${nestedLabel}.effectClass is unsupported.`,
    outcomeUnsupported: (nestedLabel) => `${nestedLabel}.outcome is unsupported.`,
    summaryInvalid: (nestedLabel) => `${nestedLabel}.summary must be non-empty and bounded.`,
    evidenceRefsMustBeArray: (nestedLabel) => `${nestedLabel} must be a plain array.`,
    evidenceRefsInvalid: (nestedLabel, index) => `${nestedLabel}[${index}] is invalid.`,
    evidenceRefsDuplicate: (nestedLabel, value) => `${nestedLabel} duplicates ${value}.`,
    evidenceRefsTooMany: (nestedLabel) => `${nestedLabel} must contain between 1 and 16 references.`,
  };
  const errors = exactFields(value, [
    "runnerContractVersion", "cycleId", "subjectId", "revisionId", "evaluatedThroughSequence",
    "seatId", "actionId", "effectClass", "effectKey", "authorizationDecisionId", "outcome",
    "reasonCode", "summary", "evidenceRefs",
  ], label);
  if (errors.length > 0 || !isPlainObject(value)) return errors;
  return validateExecutionEffectPayloadCommon(
    value,
    label,
    identifier,
    identifier,
    (sequence) => Number.isInteger(sequence) && (sequence as number) >= 0,
    (effectClass) => (["behavioral_implementation", "verification", "coordination"] as const).includes(effectClass as ExecutionEffectClass),
    nonEmpty,
    (nestedLabel) => `${nestedLabel}.evidenceRefs`,
    messages,
  );
}

export function validateRunnerSupervisedEffectCandidate(input: unknown): ContractResult<RunnerSupervisedEffectCandidate> {
  const fields = [
    "runnerContractVersion", "candidateKind", "authority", "journalSchemaVersion", "missionId",
    "subjectId", "revisionId", "expectedPreviousSequence", "intendedJournalSequence", "payload",
  ];
  const errors = exactFields(input, fields, "Runner supervised effect candidate");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed", ...errors);
  const candidateMessages: RunnerSupervisedEffectCandidateValidationMessages = {
    contractVersionUnsupported: (label) => `${label} runnerContractVersion is unsupported.`,
    kindUnsupported: (label) => `${label} kind is unsupported.`,
    authorityUnsupported: (label) => `${label} must be explicitly non-authoritative.`,
    journalSchemaUnsupported: (label) => `${label} requires journal schema v5 or v6.`,
    missionIdentityInvalid: (label) => `${label} mission identity is invalid.`,
    revisionInvalid: (label) => `${label} revisionId is invalid.`,
    expectedPreviousSequenceInvalid: (label) => `${label} expectedPreviousSequence is invalid.`,
    intendedJournalSequenceInvalid: (label) => `${label} intendedJournalSequence is invalid.`,
    payloadIdentityDrift: (label) => `${label} payload identity drifts from its envelope.`,
    sequenceBindingInvalid: (label) => `${label} sequence binding is not contiguous.`,
  };
  const payloadErrors = (payload: unknown, payloadLabel: string) => executionEffectPayloadErrors(payload, payloadLabel);
  const candidateErrors = validateRunnerSupervisedEffectCandidateCommon(
    input,
    "Runner candidate",
    identifier,
    payloadErrors,
    (candidateLabel) => `${candidateLabel} payload`,
    candidateMessages,
  );
  if (candidateErrors.length === 1 && candidateErrors[0] === candidateMessages.payloadIdentityDrift("Runner candidate")) {
    return invalid("candidate_drift", "Runner candidate payload identity drifts from its envelope.");
  }
  if (candidateErrors.length === 1 && candidateErrors[0] === candidateMessages.sequenceBindingInvalid("Runner candidate")) {
    return invalid("sequence_invalid", "Runner candidate sequence binding is not contiguous.");
  }
  return candidateErrors.length > 0 ? invalid("malformed", ...candidateErrors) : valid(input as unknown as RunnerSupervisedEffectCandidate);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function computeMissionRevisionId(content: SupervisedMissionBriefContent): string {
  return `sha256:${createHash("sha256").update(canonicalJson(content)).digest("base64url")}`;
}

export function computeEd25519SigningKeyRef(publicKeySpkiBase64: string): string {
  const bytes = Buffer.from(publicKeySpkiBase64, "base64");
  return `ed25519:sha256:${createHash("sha256").update(bytes).digest("base64url")}`;
}

export function createSupervisedMissionBrief(content: SupervisedMissionBriefContent): SupervisedMissionBrief {
  return { ...content, revisionId: computeMissionRevisionId(content) };
}

function briefContent(brief: SupervisedMissionBrief): SupervisedMissionBriefContent {
  const { revisionId: _revisionId, ...content } = brief;
  return content;
}

export function validateSupervisedMissionBrief(input: unknown): ContractResult<SupervisedMissionBrief> {
  const fields = [
    "schemaVersion", "missionId", "objective", "subjectId", "revisionId", "riskFlags",
    "participants", "activatedModes", "requireSimmons", "createdAt",
  ];
  const errors = exactFields(input, fields, "Mission brief");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed", ...errors);
  if (input.schemaVersion !== 1) errors.push("Mission brief schemaVersion is unsupported.");
  for (const field of ["missionId", "subjectId", "revisionId"]) {
    if (!identifier(input[field])) errors.push(`Mission brief ${field} is invalid.`);
  }
  if (!nonEmpty(input.objective)) errors.push("Mission brief objective must be non-empty.");
  errors.push(...timestampErrors(input.createdAt, "Mission brief createdAt"));
  const riskErrors = exactFields(input.riskFlags, RISK_FIELDS, "Mission brief riskFlags");
  errors.push(...riskErrors);
  if (riskErrors.length === 0 && isPlainObject(input.riskFlags)) {
    for (const field of RISK_FIELDS) if (typeof input.riskFlags[field] !== "boolean") errors.push(`riskFlags.${field} must be boolean.`);
  }
  if (!Array.isArray(input.participants) || input.participants.length === 0) {
    errors.push("Mission brief participants must be a non-empty array.");
  } else {
    const seats = new Set<string>();
    input.participants.forEach((participant, index) => {
      const nested = exactFields(participant, ["seatId"], `participants[${index}]`);
      errors.push(...nested);
      if (nested.length === 0 && isPlainObject(participant)) {
        if (!identifier(participant.seatId)) errors.push(`participants[${index}].seatId is invalid.`);
        else if (seats.has(participant.seatId)) errors.push(`participants duplicates ${participant.seatId}.`);
        else seats.add(participant.seatId);
      }
    });
    for (const required of ["coulson", "fitz"]) if (!seats.has(required)) errors.push(`Mission brief requires participant: ${required}.`);
    if (input.requireSimmons === true && !seats.has("simmons")) errors.push("Simmons must be a participant when required.");
  }
  if (!Array.isArray(input.activatedModes)) errors.push("Mission brief activatedModes must be an array.");
  else input.activatedModes.forEach((activation, index) => {
    const nested = exactFields(activation, ["modeId", "modeVersion", "seatId", "activationSource"], `activatedModes[${index}]`);
    errors.push(...nested);
    if (nested.length === 0 && isPlainObject(activation)) {
      for (const field of ["modeId", "modeVersion", "seatId", "activationSource"]) {
        if (!identifier(activation[field])) errors.push(`activatedModes[${index}].${field} is invalid.`);
      }
    }
  });
  if (typeof input.requireSimmons !== "boolean") errors.push("Mission brief requireSimmons must be boolean.");
  if (errors.length > 0) return invalid("malformed", ...errors);
  const brief = input as unknown as SupervisedMissionBrief;
  if (brief.revisionId !== computeMissionRevisionId(briefContent(brief))) {
    return invalid("revision_mismatch", "Mission brief revisionId does not match its canonical content.");
  }
  return valid(brief);
}

export function validateTrustedBindingRegistry(input: unknown): ContractResult<TrustedBindingRegistry> {
  const errors = exactFields(input, ["schemaVersion", "bindings"], "Trusted binding registry");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed", ...errors);
  if (input.schemaVersion !== 1) errors.push("Trusted binding registry schemaVersion is unsupported.");
  if (!Array.isArray(input.bindings) || input.bindings.length === 0) errors.push("Trusted binding registry bindings must be non-empty.");
  const identities = new Set<string>();
  const seats = new Set<string>();
  if (Array.isArray(input.bindings)) input.bindings.forEach((binding, index) => {
    const fields = [
      "schemaVersion", "bindingId", "humanPrincipalId", "seatId", "missionScope",
      "signingKeyRef", "publicKeySpkiBase64", "validFromSequence", "validThroughSequence",
      "attestedBy", "provenanceRef",
    ];
    const nested = exactFields(binding, fields, `bindings[${index}]`);
    errors.push(...nested);
    if (nested.length > 0 || !isPlainObject(binding)) return;
    if (binding.schemaVersion !== 1) errors.push(`bindings[${index}].schemaVersion is unsupported.`);
    for (const field of ["bindingId", "humanPrincipalId", "attestedBy", "provenanceRef"]) {
      if (!identifier(binding[field])) errors.push(`bindings[${index}].${field} is invalid.`);
    }
    if (binding.missionScope !== "*" && !identifier(binding.missionScope)) errors.push(`bindings[${index}].missionScope is invalid.`);
    if (!HUMAN_SEATS.includes(binding.seatId as HumanSeat)) errors.push(`bindings[${index}].seatId is unsupported.`);
    if (typeof binding.signingKeyRef !== "string" || !KEY_REF.test(binding.signingKeyRef)) errors.push(`bindings[${index}].signingKeyRef is invalid.`);
    if (typeof binding.publicKeySpkiBase64 !== "string") errors.push(`bindings[${index}].publicKeySpkiBase64 is invalid.`);
    else {
      try {
        const key = createPublicKey({ key: Buffer.from(binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
        if (key.asymmetricKeyType !== "ed25519") errors.push(`bindings[${index}] key must be Ed25519.`);
        if (computeEd25519SigningKeyRef(binding.publicKeySpkiBase64) !== binding.signingKeyRef) errors.push(`bindings[${index}] signingKeyRef does not match the public key.`);
      } catch {
        errors.push(`bindings[${index}] public key is malformed.`);
      }
    }
    if (!Number.isInteger(binding.validFromSequence) || (binding.validFromSequence as number) < 0) errors.push(`bindings[${index}].validFromSequence is invalid.`);
    if (binding.validThroughSequence !== null && (!Number.isInteger(binding.validThroughSequence) || (binding.validThroughSequence as number) < 0)) errors.push(`bindings[${index}].validThroughSequence is invalid.`);
    const identity = `${String(binding.bindingId)}\0${String(binding.signingKeyRef)}`;
    if (identities.has(identity)) errors.push(`bindings[${index}] duplicates a binding identity.`);
    identities.add(identity);
    if (seats.has(String(binding.seatId))) errors.push(`bindings duplicates seatId: ${String(binding.seatId)}.`);
    seats.add(String(binding.seatId));
  });
  return errors.length > 0 ? invalid("malformed", ...errors) : valid(input as unknown as TrustedBindingRegistry);
}

function requirementId(missionId: string, revisionId: string, kind: EvidenceKind): string {
  return `req:${missionId}:${revisionId}:${kind}`;
}

export function createEvidenceRequirements(brief: SupervisedMissionBrief): EvidenceRequirement[] {
  const base = {
    schemaVersion: 1 as const,
    missionId: brief.missionId,
    subjectKind: "mission_plan" as const,
    subjectId: brief.subjectId,
    revisionId: brief.revisionId,
    createdAtSequence: 0,
    supersedesRequirementId: null,
  };
  const requirements: EvidenceRequirement[] = [
    {
      ...base,
      requirementId: requirementId(brief.missionId, brief.revisionId, "mission_authorization"),
      requiredSeatId: "coulson",
      evidenceKind: "mission_authorization",
      allowedDecisions: ["approved", "paused", "resumed", "cancelled"],
    },
    {
      ...base,
      requirementId: requirementId(brief.missionId, brief.revisionId, "technical_review"),
      requiredSeatId: "fitz",
      evidenceKind: "technical_review",
      allowedDecisions: ["approved", "changes_requested", "rejected"],
    },
  ];
  if (brief.requireSimmons) requirements.push({
    ...base,
    requirementId: requirementId(brief.missionId, brief.revisionId, "product_domain_review"),
    requiredSeatId: "simmons",
    evidenceKind: "product_domain_review",
    allowedDecisions: ["approved", "changes_requested", "rejected"],
  });
  return requirements;
}

export function createReviewEvidenceRequirements(
  brief: SupervisedMissionBrief,
  reviewSubject: ReviewSubjectRevision,
  createdAtSequence: number,
  priorRequirements: EvidenceRequirement[] = [],
): EvidenceRequirement[] {
  const missionRequirements = createEvidenceRequirements(brief);
  const missionAuthorization = missionRequirements.filter(
    ({ evidenceKind }) => evidenceKind === "mission_authorization",
  );
  if (missionAuthorization.length !== 1) {
    throw new Error("Expected exactly one mission authorization requirement.");
  }

  const reviewRequirements = missionRequirements
    .filter(({ evidenceKind }) => evidenceKind === "technical_review" || evidenceKind === "product_domain_review")
    .map((requirement): EvidenceRequirement => {
      let supersedesRequirementId: string | null = null;
      if (reviewSubject.supersedesRevisionId !== null) {
        const prior = priorRequirements.filter((candidate) =>
          candidate.requiredSeatId === requirement.requiredSeatId &&
          candidate.evidenceKind === requirement.evidenceKind &&
          candidate.subjectKind === reviewSubject.subjectKind &&
          candidate.subjectId === reviewSubject.subjectId &&
          candidate.revisionId === reviewSubject.supersedesRevisionId);
        if (prior.length !== 1) {
          throw new Error(
            `Expected exactly one superseded ${requirement.requiredSeatId} ${requirement.evidenceKind} requirement.`,
          );
        }
        supersedesRequirementId = prior[0].requirementId;
      }
      return {
        ...requirement,
        requirementId: requirementId(brief.missionId, reviewSubject.revisionId, requirement.evidenceKind),
        subjectKind: reviewSubject.subjectKind,
        subjectId: reviewSubject.subjectId,
        revisionId: reviewSubject.revisionId,
        createdAtSequence,
        supersedesRequirementId,
      };
    });

  return [...missionAuthorization, ...reviewRequirements];
}

export function validateRepositoryBindings(
  registry: TrustedBindingRegistry,
  configured: readonly { seatId: string; bindingRef: string }[],
  missionId: string,
  requireSimmons: boolean,
): ContractResult<TrustedHumanBinding[]> {
  const requiredSeats: HumanSeat[] = requireSimmons ? ["coulson", "fitz", "simmons"] : ["coulson", "fitz"];
  const selected: TrustedHumanBinding[] = [];
  for (const seatId of requiredSeats) {
    const configMatches = configured.filter((entry) => entry.seatId === seatId);
    if (configMatches.length !== 1) return invalid("binding_ambiguous", `Configured binding for ${seatId} is missing or ambiguous.`);
    const bindings = registry.bindings.filter((entry) => entry.seatId === seatId && entry.signingKeyRef === configMatches[0].bindingRef);
    if (bindings.length !== 1) return invalid("binding_missing", `Trusted Ed25519 binding for ${seatId} is missing or ambiguous.`);
    const binding = bindings[0];
    if (binding.missionScope !== "*" && binding.missionScope !== missionId) return invalid("binding_invalid", `Binding for ${seatId} does not cover this mission.`);
    selected.push(binding);
  }
  return valid(selected);
}

function validateEvidencePayload(input: unknown): ContractResult<HumanEvidencePayload> {
  const fields = [
    "schemaVersion", "evidenceId", "requirementId", "missionId", "subjectKind",
    "subjectId", "revisionId", "seatId", "evidenceKind", "decision",
    "governanceTarget", "humanPrincipalId", "bindingId", "signingKeyRef", "sourceRef", "timestamp",
    "journalSequence",
  ];
  const errors = exactFields(input, fields, "Evidence payload");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed", ...errors);
  if (input.schemaVersion !== 1) errors.push("Evidence payload schemaVersion is unsupported.");
  for (const field of ["evidenceId", "requirementId", "missionId", "subjectId", "revisionId", "humanPrincipalId", "bindingId", "sourceRef"]) {
    if (!identifier(input[field])) errors.push(`Evidence payload ${field} is invalid.`);
  }
  if (input.subjectKind !== "mission_plan" && input.subjectKind !== "repository_artifact") {
    errors.push("Evidence payload subjectKind is unsupported.");
  }
  if (!HUMAN_SEATS.includes(input.seatId as HumanSeat)) errors.push("Evidence payload seatId is unsupported.");
  if (!EVIDENCE_KINDS.includes(input.evidenceKind as EvidenceKind)) errors.push("Evidence payload evidenceKind is unsupported.");
  if (!EVIDENCE_DECISIONS.includes(input.decision as EvidenceDecision)) errors.push("Evidence payload decision is unsupported.");
  if (input.governanceTarget !== null && !["proposed", "approved", "paused", "cancelled"].includes(String(input.governanceTarget))) {
    errors.push("Evidence payload governanceTarget is unsupported.");
  }
  if (typeof input.signingKeyRef !== "string" || !KEY_REF.test(input.signingKeyRef)) errors.push("Evidence payload signingKeyRef is invalid.");
  if (!Number.isInteger(input.journalSequence) || (input.journalSequence as number) < 1) errors.push("Evidence payload journalSequence is invalid.");
  errors.push(...timestampErrors(input.timestamp, "Evidence payload timestamp"));
  return errors.length > 0 ? invalid("malformed", ...errors) : valid(input as unknown as HumanEvidencePayload);
}

export function verifySignedHumanEvidence(
  envelope: unknown,
  projection: Pick<SupervisedMissionProjection, "missionId" | "brief" | "requirements" | "trustedBindings">,
  expectedSequence: number,
): ContractResult<HumanEvidencePayload> {
  const envelopeErrors = exactFields(envelope, ["payload", "signatureBase64"], "Signed evidence");
  if (envelopeErrors.length > 0 || !isPlainObject(envelope)) return invalid("malformed", ...envelopeErrors);
  const payloadResult = validateEvidencePayload(envelope.payload);
  if (payloadResult.state === "invalid") return payloadResult;
  const payload = payloadResult.value;
  if (payload.missionId !== projection.missionId) return invalid("mission_mismatch", "Evidence missionId does not match.");
  if (payload.journalSequence !== expectedSequence) return invalid("sequence_invalid", "Evidence journalSequence does not match the next journal sequence.");
  const requirements = projection.requirements.filter((entry) => entry.requirementId === payload.requirementId);
  if (requirements.length !== 1) return invalid("missing_requirement", "Evidence requirement is missing or ambiguous.");
  const requirement = requirements[0];
  if (payload.subjectKind !== requirement.subjectKind || payload.subjectId !== requirement.subjectId) {
    return invalid("subject_mismatch", "Evidence subject does not match its requirement.");
  }
  if (payload.revisionId !== requirement.revisionId) {
    return invalid("revision_mismatch", "Evidence revision is stale or mismatched.");
  }
  if (requirement.requiredSeatId !== payload.seatId || requirement.evidenceKind !== payload.evidenceKind) return invalid("seat_mismatch", "Evidence seat or kind does not match its requirement.");
  if (!requirement.allowedDecisions.includes(payload.decision)) return invalid("unknown_verdict", "Evidence decision is not allowed by its requirement.");
  const bindings = projection.trustedBindings.filter((entry) => entry.bindingId === payload.bindingId && entry.seatId === payload.seatId);
  if (bindings.length !== 1) return invalid("binding_missing", "Evidence binding is missing or ambiguous.");
  const binding = bindings[0];
  if (binding.humanPrincipalId !== payload.humanPrincipalId || binding.signingKeyRef !== payload.signingKeyRef) return invalid("binding_invalid", "Evidence principal or signing key does not match its binding.");
  if (binding.missionScope !== "*" && binding.missionScope !== payload.missionId) return invalid("binding_invalid", "Evidence binding does not cover this mission.");
  if (expectedSequence < binding.validFromSequence || (binding.validThroughSequence !== null && expectedSequence > binding.validThroughSequence)) return invalid("binding_invalid", "Evidence binding is not valid at this journal sequence.");
  if (typeof envelope.signatureBase64 !== "string" || envelope.signatureBase64.length === 0) return invalid("provenance_missing", "Evidence signature is missing.");
  try {
    const publicKey = createPublicKey({ key: Buffer.from(binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    const signature = Buffer.from(envelope.signatureBase64, "base64");
    if (!verify(null, Buffer.from(canonicalJson(payload)), publicKey, signature)) return invalid("binding_invalid", "Evidence signature verification failed.");
  } catch {
    return invalid("binding_invalid", "Evidence signature or public key is malformed.");
  }
  return valid(payload);
}

export function computeRuntimeBindingDigest(binding: RuntimeBinding): string {
  return `sha256:${createHash("sha256").update(canonicalJson(binding)).digest("base64url")}`;
}

function copyRuntimeBinding(binding: RuntimeBinding): RuntimeBinding {
  return {
    ...binding,
    approvedScope: {
      actionIds: [...binding.approvedScope.actionIds],
      effectClasses: [...binding.approvedScope.effectClasses],
      effectKeys: [...binding.approvedScope.effectKeys],
      capabilities: [...binding.approvedScope.capabilities],
    },
  };
}

function validateRuntimeBindingAuthorizationPayload(input: unknown): ContractResult<RuntimeBindingAuthorizationPayload> {
  const fields = [
    "schemaVersion", "authorizationId", "missionId", "subjectId", "seatId", "bindingId", "bindingVersion",
    "priorBindingId", "priorBindingVersion", "bindingDigest", "artifactRevisionId", "decision",
    "previousJournalSequence", "journalSequence", "humanPrincipalId", "humanBindingId", "signingKeyRef",
    "sourceRef", "timestamp",
  ];
  const errors = exactFields(input, fields, "Runtime binding authorization payload");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed", ...errors);
  if (input.schemaVersion !== 1 || input.decision !== "approved") errors.push("Runtime binding authorization version or decision is invalid.");
  for (const field of ["authorizationId", "missionId", "subjectId", "seatId", "bindingId", "artifactRevisionId", "humanPrincipalId", "humanBindingId", "sourceRef"] as const) {
    if (!identifier(input[field])) errors.push(`Runtime binding authorization ${field} is invalid.`);
  }
  if (typeof input.bindingDigest !== "string" || !/^sha256:[A-Za-z0-9_-]{43}$/.test(input.bindingDigest)) errors.push("Runtime binding authorization digest is invalid.");
  if (typeof input.signingKeyRef !== "string" || !KEY_REF.test(input.signingKeyRef)) errors.push("Runtime binding authorization signing key is invalid.");
  if (!Number.isSafeInteger(input.bindingVersion) || (input.bindingVersion as number) < 1) errors.push("Runtime binding authorization version is invalid.");
  if (input.priorBindingId !== null && !identifier(input.priorBindingId)) errors.push("Runtime binding authorization prior binding is invalid.");
  if (input.priorBindingVersion !== null && (!Number.isSafeInteger(input.priorBindingVersion) || (input.priorBindingVersion as number) < 1)) errors.push("Runtime binding authorization prior version is invalid.");
  if ((input.priorBindingId === null) !== (input.priorBindingVersion === null)) errors.push("Runtime binding authorization prior identity must be wholly absent or present.");
  if (!Number.isSafeInteger(input.previousJournalSequence) || (input.previousJournalSequence as number) < 0 || !Number.isSafeInteger(input.journalSequence) || input.journalSequence !== (input.previousJournalSequence as number) + 1) errors.push("Runtime binding authorization sequence is invalid.");
  errors.push(...timestampErrors(input.timestamp, "Runtime binding authorization timestamp"));
  return errors.length > 0 ? invalid("malformed", ...errors) : valid(input as unknown as RuntimeBindingAuthorizationPayload);
}

export function verifySignedRuntimeBindingAuthorization(
  envelope: unknown,
  bindingInput: unknown,
  projection: Pick<SupervisedMissionProjection, "missionId" | "brief" | "trustedBindings" | "lastSequence">,
  priorBindingId: string | null,
  priorBindingVersion: number | null,
): ContractResult<RuntimeBindingAuthorizationPayload> {
  const envelopeErrors = exactFields(envelope, ["payload", "signatureBase64"], "Signed runtime binding authorization");
  if (envelopeErrors.length > 0 || !isPlainObject(envelope)) return invalid("malformed", ...envelopeErrors);
  const bindingResult = validateRuntimeBinding(bindingInput);
  if (bindingResult.state === "invalid") return invalid(bindingResult.code, ...bindingResult.errors);
  const payloadResult = validateRuntimeBindingAuthorizationPayload(envelope.payload);
  if (payloadResult.state === "invalid") return payloadResult;
  const payload = payloadResult.value;
  const binding = bindingResult.value;
  if (payload.missionId !== projection.missionId || payload.subjectId !== projection.brief.subjectId || binding.missionId !== projection.missionId || binding.subjectId !== projection.brief.subjectId) return invalid("mission_mismatch", "Runtime binding authorization does not match the mission subject.");
  if (payload.seatId !== binding.seatId || payload.bindingId !== binding.bindingId || payload.bindingVersion !== binding.bindingVersion) return invalid("binding_invalid", "Runtime binding authorization identity does not match its binding.");
  if (binding.missionRevisionId !== projection.brief.revisionId || payload.artifactRevisionId !== binding.artifactRevisionId) return invalid("revision_mismatch", "Runtime binding authorization revisions are stale or mismatched.");
  if (payload.priorBindingId !== priorBindingId || payload.priorBindingVersion !== priorBindingVersion) return invalid("binding_invalid", "Runtime binding authorization prior identity is mismatched.");
  if (payload.previousJournalSequence !== projection.lastSequence || payload.journalSequence !== projection.lastSequence + 1 || binding.recordedAtSequence !== payload.journalSequence) return invalid("sequence_invalid", "Runtime binding authorization is not bound to the next journal sequence.");
  if (payload.bindingDigest !== computeRuntimeBindingDigest(binding) || binding.coulsonAuthorizationRef !== payload.authorizationId) return invalid("binding_invalid", "Runtime binding authorization does not cover the exact binding.");
  const humans = projection.trustedBindings.filter((candidate) => candidate.seatId === "coulson" && candidate.bindingId === payload.humanBindingId);
  if (humans.length !== 1) return invalid("binding_missing", "Runtime binding authorization requires one trusted Coulson binding.");
  const human = humans[0];
  if (human.humanPrincipalId !== payload.humanPrincipalId || human.signingKeyRef !== payload.signingKeyRef || (human.missionScope !== "*" && human.missionScope !== payload.missionId) || payload.journalSequence < human.validFromSequence || (human.validThroughSequence !== null && payload.journalSequence > human.validThroughSequence)) return invalid("binding_invalid", "Trusted Coulson identity does not authorize this binding.");
  if (typeof envelope.signatureBase64 !== "string" || envelope.signatureBase64.length === 0) return invalid("provenance_missing", "Runtime binding authorization signature is missing.");
  try {
    const publicKey = createPublicKey({ key: Buffer.from(human.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(canonicalJson(payload)), publicKey, Buffer.from(envelope.signatureBase64, "base64"))) return invalid("binding_invalid", "Runtime binding authorization signature verification failed.");
  } catch { return invalid("binding_invalid", "Runtime binding authorization signature or key is malformed."); }
  return valid(payload);
}

function requirementProjection(requirement: EvidenceRequirement, evidence: HumanEvidencePayload[]): RequirementProjection {
  const relevant = evidence.filter((record) => record.requirementId === requirement.requirementId &&
    (record.decision === "approved" || record.decision === "changes_requested" || record.decision === "rejected"));
  const latest = relevant.at(-1);
  if (latest === undefined) return { ...requirement, status: "pending", latestEvidenceId: null, reason: `Waiting for ${requirement.requiredSeatId}.` };
  if (latest.decision === "approved") return { ...requirement, status: "satisfied", latestEvidenceId: latest.evidenceId, reason: `${requirement.requiredSeatId} approved the exact revision.` };
  return { ...requirement, status: "blocked", latestEvidenceId: latest.evidenceId, reason: `${requirement.requiredSeatId} returned ${latest.decision}.` };
}

function readiness(actionId: "execute" | "accept", requirements: RequirementProjection[], sequence: number): ReadinessProjection {
  const applicable = requirements.filter((entry) => actionId === "execute"
    ? entry.evidenceKind === "mission_authorization"
    : entry.evidenceKind === "technical_review" || entry.evidenceKind === "product_domain_review");
  if (applicable.length === 0) return { actionId, state: "invalid", requirementStatuses: [], reasons: ["requirements_undefined"], evaluatedThroughSequence: sequence };
  const state: ReadinessState = applicable.some(({ status }) => status === "blocked")
    ? "blocked"
    : applicable.some(({ status }) => status === "pending") ? "waiting" : "ready";
  return {
    actionId,
    state,
    requirementStatuses: applicable,
    reasons: applicable.filter(({ status }) => status !== "satisfied").map(({ reason }) => reason),
    evaluatedThroughSequence: sequence,
  };
}

function entryTimestamp(entry: SupervisedJournalEntry): EvidenceTimestamp {
  return entry.timestamp;
}

function transitionGovernance(state: GovernanceState, decision: string, resumeState: unknown): GovernanceState | null {
  if (decision === "approve" && state === "proposed") return "approved";
  if (decision === "pause" && (state === "proposed" || state === "approved")) return "paused";
  if (decision === "resume" && state === "paused" && (resumeState === "proposed" || resumeState === "approved")) return resumeState;
  if (decision === "cancel" && state !== "cancelled") return "cancelled";
  return null;
}

function evidenceDecisionForGovernance(decision: string): EvidenceDecision {
  return decision === "approve" ? "approved" : decision === "pause" ? "paused" : decision === "resume" ? "resumed" : "cancelled";
}

function evidenceTargetForGovernance(decision: string, resumeState: unknown): GovernanceState {
  if (decision === "approve") return "approved";
  if (decision === "pause") return "paused";
  if (decision === "resume") return resumeState as "proposed" | "approved";
  return "cancelled";
}

export function createMissionBegunEntry(
  brief: SupervisedMissionBrief,
  bindings: TrustedHumanBinding[],
  journalSchemaVersion?: 2 | 3 | 4 | 5 | 6,
): SupervisedJournalEntry;
export function createMissionBegunEntry(
  brief: SupervisedMissionBrief,
  bindings: TrustedHumanBinding[],
  journalSchemaVersion: 7,
  reviewSubject: ReviewSubjectRevision,
): SupervisedJournalEntry;
export function createMissionBegunEntry(
  brief: SupervisedMissionBrief,
  bindings: TrustedHumanBinding[],
  journalSchemaVersion: 2 | 3 | 4 | 5 | 6 | 7 = 2,
  reviewSubject?: ReviewSubjectRevision,
): SupervisedJournalEntry {
  if (journalSchemaVersion === 7) {
    if (reviewSubject === undefined) throw new Error("Schema 7 requires a review subject.");
    const errors = reviewSubjectErrors(reviewSubject, "mission.begun reviewSubject");
    if (errors.length > 0) throw new Error(errors.join(" "));
    if (reviewSubject.supersedesRevisionId !== null) {
      throw new Error("Initial review subject cannot supersede another revision.");
    }
    return {
      schemaVersion: 7,
      entryId: `entry:${brief.missionId}:0`,
      missionId: brief.missionId,
      sequence: 0,
      type: "mission.begun",
      timestamp: brief.createdAt,
      payload: {
        brief,
        trustedBindings: bindings,
        requirements: createReviewEvidenceRequirements(brief, reviewSubject, 0),
        reviewSubject,
      },
    };
  }
  if (reviewSubject !== undefined) throw new Error("Review subjects require journal schema 7.");
  return {
    schemaVersion: journalSchemaVersion,
    entryId: `entry:${brief.missionId}:0`,
    missionId: brief.missionId,
    sequence: 0,
    type: "mission.begun",
    timestamp: brief.createdAt,
    payload: { brief, trustedBindings: bindings, requirements: createEvidenceRequirements(brief) },
  };
}

export function replaySupervisedMissionJournal(entries: unknown): ContractResult<SupervisedMissionProjection> {
  if (!Array.isArray(entries) || entries.length === 0) return invalid("malformed", "Supervised journal must contain entries.");
  if (!isPlainObject(entries[0]) || entries[0].type !== "mission.begun") return invalid("malformed", "First mission entry must be mission.begun.");
  const begun = entries[0];
  const journalSchemaVersion = begun.schemaVersion;
  const begunErrors = exactFields(begun, ["schemaVersion", "entryId", "missionId", "sequence", "type", "timestamp", "payload"], "Entry 0");
  if (begunErrors.length > 0 || (journalSchemaVersion !== 2 && journalSchemaVersion !== 3 && journalSchemaVersion !== 4 && journalSchemaVersion !== 5 && journalSchemaVersion !== 6 && journalSchemaVersion !== 7) || begun.sequence !== 0 || !isPlainObject(begun.payload)) return invalid("malformed", ...begunErrors, "Entry 0 is invalid.");
  const payloadErrors = exactFields(
    begun.payload,
    journalSchemaVersion === 7
      ? ["brief", "trustedBindings", "requirements", "reviewSubject"]
      : ["brief", "trustedBindings", "requirements"],
    "mission.begun payload",
  );
  if (payloadErrors.length > 0) return invalid("malformed", ...payloadErrors);
  const briefResult = validateSupervisedMissionBrief(begun.payload.brief);
  if (briefResult.state === "invalid") return briefResult;
  if (!identifier(begun.entryId) || begun.entryId !== `entry:${briefResult.value.missionId}:0`) {
    return invalid("sequence_invalid", "Entry 0 entryId is invalid or does not match the mission.");
  }
  const registryResult = validateTrustedBindingRegistry({ schemaVersion: 1, bindings: begun.payload.trustedBindings });
  if (registryResult.state === "invalid") return registryResult;
  let reviewSubject: ReviewSubjectRevision | undefined;
  if (journalSchemaVersion === 7) {
    const errors = reviewSubjectErrors(begun.payload.reviewSubject, "mission.begun reviewSubject");
    if (errors.length > 0) return invalid("malformed", ...errors);
    reviewSubject = begun.payload.reviewSubject as unknown as ReviewSubjectRevision;
    if (reviewSubject.supersedesRevisionId !== null) {
      return invalid("malformed", "Initial review subject cannot supersede another revision.");
    }
  }
  const initialRequirements = journalSchemaVersion === 7
    ? createReviewEvidenceRequirements(briefResult.value, reviewSubject as ReviewSubjectRevision, 0)
    : createEvidenceRequirements(briefResult.value);
  if (canonicalJson(begun.payload.requirements) !== canonicalJson(initialRequirements)) return invalid("malformed", "mission.begun requirements are not canonical.");
  if (begun.missionId !== briefResult.value.missionId) return invalid("mission_mismatch", "Entry 0 missionId does not match the brief.");
  const firstTimeErrors = timestampErrors(begun.timestamp, "Entry 0 timestamp");
  if (firstTimeErrors.length > 0 || canonicalJson(begun.timestamp) !== canonicalJson(briefResult.value.createdAt)) return invalid("malformed", ...firstTimeErrors, "Entry 0 timestamp must match the brief.");

  let governance: GovernanceState = "proposed";
  let execution: ExecutionStatus = "not-started";
  let authorization: SupervisedMissionProjection["authorization"] = {
    source: "none", state: "waiting", missionRevisionId: briefResult.value.revisionId,
    delegationId: null, delegationRevisionId: null, eligibilityRevisionId: null,
    evaluatedThroughSequence: 0, reasons: ["supervised_authorization_required"],
  };
  const evidence: HumanEvidencePayload[] = [];
  const evidenceIds = new Set<string>();
  const candidateIds = new Set<string>();
  const communicationRequests: CommunicationRequestProjection[] = [];
  const effectRecords: ExecutionEffectRecord[] = [];
  const runtimeBindings: RuntimeBinding[] = [];
  let currentReviewSubject = reviewSubject;
  const reviewRevisions: ReviewRevisionProjection[] = reviewSubject === undefined
    ? []
    : [{ ...reviewSubject, introducedAtSequence: 0, lifecycle: "current" }];
  let activeRequirements = initialRequirements.map((requirement) => ({ ...requirement }));
  const requirementHistory: RequirementHistoryProjection[] = initialRequirements.map((requirement) => ({
    ...requirement,
    lifecycle: "current",
  }));
  const furyReviews: FuryReviewProjection[] = [];
  const entryIds = new Set<string>([String(begun.entryId)]);
  let previousTime = Date.parse((begun.timestamp as unknown as EvidenceTimestamp).value);
  const communicationState = (): CommunicationState => {
    if ((journalSchemaVersion !== 4 && journalSchemaVersion !== 5 && journalSchemaVersion !== 6 && journalSchemaVersion !== 7) || communicationRequests.length === 0) return "not-configured";
    if (communicationRequests.some((request) => request.state === "queued")) return "queued";
    if (communicationRequests.some((request) => request.state === "failed")) return "failed";
    if (communicationRequests.some((request) => request.state === "unknown")) return "unknown";
    return "delivered";
  };
  const baseProjection = (sequence: number): SupervisedMissionProjection => {
    const projected = activeRequirements.map((requirement) => requirementProjection(requirement, evidence));
    const uncertainEffects = effectRecords.filter(({ outcome }) => outcome === "uncertain");
    const executeReadiness = authorization.state === "authorized"
      ? { ...readiness("execute", projected, sequence), state: "ready" as const, reasons: [] }
      : readiness("execute", projected, sequence);
    const currentFuryReviews = currentReviewSubject === undefined
      ? []
      : furyReviews.filter(({ revisionId, lifecycle }) =>
        lifecycle === "current" && revisionId === currentReviewSubject?.revisionId);
    const routeToFitz: FitzRouteReadiness | undefined = currentReviewSubject === undefined
      ? undefined
      : currentFuryReviews.length > 1
        ? {
          state: "blocked",
          revisionId: currentReviewSubject.revisionId,
          reviewId: null,
          reasons: ["current_head_fury_review_ambiguous"],
          evaluatedThroughSequence: sequence,
        }
      : currentFuryReviews.length === 0
        ? {
          state: "waiting",
          revisionId: currentReviewSubject.revisionId,
          reviewId: null,
          reasons: ["current_head_fury_review_required"],
          evaluatedThroughSequence: sequence,
        }
        : currentFuryReviews[0].verdict === "changes_requested"
          ? {
            state: "blocked",
            revisionId: currentReviewSubject.revisionId,
            reviewId: currentFuryReviews[0].reviewId,
            reasons: [...currentFuryReviews[0].reasons],
            evaluatedThroughSequence: sequence,
          }
          : {
            state: "ready",
            revisionId: currentReviewSubject.revisionId,
            reviewId: currentFuryReviews[0].reviewId,
            reasons: [],
            evaluatedThroughSequence: sequence,
          };
    return {
      journalSchemaVersion: journalSchemaVersion as 2 | 3 | 4 | 5 | 6 | 7,
      missionId: briefResult.value.missionId,
      brief: briefResult.value,
      governance: { state: governance },
      authorization: { ...authorization, evaluatedThroughSequence: sequence },
      execution: { status: execution },
      readiness: {
        execute: uncertainEffects.length > 0
          ? {
            ...executeReadiness,
            state: "blocked",
            reasons: uncertainEffects.map(({ effectKey }) => `uncertain_effect:${effectKey}`),
          }
          : executeReadiness,
        accept: readiness("accept", projected, sequence),
      },
      communication: { state: communicationState(), requests: communicationRequests.map((request) => ({ ...request })) },
      effectRecords: effectRecords.map((record) => ({
        ...record,
        evidenceRefs: [...record.evidenceRefs],
        timestamp: { ...record.timestamp },
      })),
      runtimeBindings: runtimeBindings.map(copyRuntimeBinding),
      activeRuntimeBindings: runtimeBindings.filter(({ lifecycleState }) => lifecycleState === "active").map(copyRuntimeBinding),
      trustedBindings: registryResult.value.bindings,
      requirements: activeRequirements.map((requirement) => ({ ...requirement })),
      evidence: [...evidence],
      ...(journalSchemaVersion === 7 && currentReviewSubject !== undefined && routeToFitz !== undefined
        ? {
          reviewSubject: { ...currentReviewSubject },
          reviewRevisions: reviewRevisions.map((revision) => ({ ...revision })),
          requirementHistory: requirementHistory.map((requirement) => ({ ...requirement })),
          evidenceHistory: evidence.map((record): EvidenceHistoryProjection => ({
            ...record,
            lifecycle: record.subjectKind === "repository_artifact" &&
              record.revisionId !== currentReviewSubject?.revisionId ? "stale" : "current",
          })),
          furyReviews: furyReviews.map((review) => ({
            ...review,
            reasons: [...review.reasons],
            findings: review.findings.map((finding) => ({
              ...finding,
              evidenceRefs: [...finding.evidenceRefs],
              sourceLocation: { ...finding.sourceLocation },
            })),
            decidedAt: { ...review.decidedAt },
            provenance: { ...review.provenance },
          })),
          routeToFitz,
        }
        : {}),
      lastSequence: sequence,
      lastTimestamp: entryTimestamp(entries[sequence] as SupervisedJournalEntry),
    };
  };

  for (let index = 1; index < entries.length; index += 1) {
    const input = entries[index];
    const structural = exactFields(input, ["schemaVersion", "entryId", "missionId", "sequence", "type", "timestamp", "payload"], `Entry ${index}`);
    if (structural.length > 0 || !isPlainObject(input)) return invalid("malformed", ...structural);
    if (input.schemaVersion !== journalSchemaVersion) return invalid("unsupported_schema", `Entry ${index} schemaVersion does not match its journal.`);
    if (input.sequence !== index) return invalid("sequence_invalid", `Entry ${index} sequence must be ${index}.`);
    if (input.missionId !== briefResult.value.missionId) return invalid("mission_mismatch", `Entry ${index} missionId does not match.`);
    if (!identifier(input.entryId) || entryIds.has(input.entryId)) return invalid("sequence_invalid", `Entry ${index} entryId is invalid or duplicated.`);
    entryIds.add(input.entryId);
    const timeErrors = timestampErrors(input.timestamp, `Entry ${index} timestamp`);
    if (timeErrors.length > 0 || !isPlainObject(input.timestamp)) return invalid("malformed", ...timeErrors);
    const time = Date.parse(input.timestamp.value as string);
    if (time < previousTime) return invalid("sequence_invalid", `Entry ${index} timestamp moves backward.`);
    previousTime = time;
    if (!isPlainObject(input.payload)) return invalid("malformed", `Entry ${index} payload must be a plain object.`);
    const current = baseProjection(index - 1);

    if (input.type === "subject.revision_superseded") {
      if (journalSchemaVersion !== 7 || currentReviewSubject === undefined) {
        return invalid("unsupported_schema", "Review-subject supersession requires journal v7.");
      }
      const nested = exactFields(input.payload, ["reviewSubject", "requirements"], `Entry ${index} review-subject payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      const subjectErrors = reviewSubjectErrors(input.payload.reviewSubject, `Entry ${index} reviewSubject`);
      if (subjectErrors.length > 0) return invalid("malformed", ...subjectErrors);
      const replacement = input.payload.reviewSubject as unknown as ReviewSubjectRevision;
      if (replacement.subjectKind !== currentReviewSubject.subjectKind ||
          replacement.subjectId !== currentReviewSubject.subjectId) {
        return invalid("subject_mismatch", `Entry ${index} review subject identity does not match.`);
      }
      if (replacement.revisionId === currentReviewSubject.revisionId ||
          replacement.supersedesRevisionId !== currentReviewSubject.revisionId) {
        return invalid("revision_mismatch", `Entry ${index} must supersede the exact current review revision.`);
      }
      if (reviewRevisions.some(({ revisionId }) => revisionId === replacement.revisionId)) {
        return invalid("revision_mismatch", `Entry ${index} cannot reuse a review revision identity.`);
      }
      let nextRequirements: EvidenceRequirement[];
      try {
        nextRequirements = createReviewEvidenceRequirements(
          briefResult.value,
          replacement,
          index,
          activeRequirements,
        );
      } catch (error) {
        return invalid("missing_requirement", error instanceof Error ? error.message : "Review requirements are ambiguous.");
      }
      if (canonicalJson(input.payload.requirements) !== canonicalJson(nextRequirements)) {
        return invalid("malformed", `Entry ${index} review requirements are not canonical.`);
      }
      const currentRevisions = reviewRevisions.filter(({ lifecycle }) => lifecycle === "current");
      if (currentRevisions.length !== 1 ||
          currentRevisions[0].revisionId !== currentReviewSubject.revisionId) {
        return invalid("revision_mismatch", `Entry ${index} current review revision is ambiguous.`);
      }
      currentRevisions[0].lifecycle = "stale";
      reviewRevisions.push({ ...replacement, introducedAtSequence: index, lifecycle: "current" });
      requirementHistory
        .filter(({ lifecycle, subjectKind }) => lifecycle === "current" && subjectKind === "repository_artifact")
        .forEach((requirement) => { requirement.lifecycle = "superseded"; });
      requirementHistory.push(...nextRequirements
        .filter(({ subjectKind }) => subjectKind === "repository_artifact")
        .map((requirement): RequirementHistoryProjection => ({ ...requirement, lifecycle: "current" })));
      furyReviews
        .filter(({ lifecycle }) => lifecycle === "current")
        .forEach((review) => { review.lifecycle = "stale"; });
      activeRequirements = nextRequirements;
      currentReviewSubject = replacement;
    } else if (input.type === "fury.review_changes_requested" || input.type === "fury.review_approved") {
      if (journalSchemaVersion !== 7 || currentReviewSubject === undefined) {
        return invalid("unsupported_schema", "Fury review records require journal v7.");
      }
      const nested = exactFields(input.payload, ["review"], `Entry ${index} Fury review payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      const reviewErrors = furyReviewErrors(input.payload.review, `Entry ${index} Fury review`);
      if (reviewErrors.length > 0) return invalid("malformed", ...reviewErrors);
      const review = input.payload.review as unknown as FuryReviewRecord;
      const expectedType = review.verdict === "approved"
        ? "fury.review_approved"
        : "fury.review_changes_requested";
      if (input.type !== expectedType) {
        return invalid("decision_mismatch", `Entry ${index} event type does not match its Fury verdict.`);
      }
      if (review.missionId !== briefResult.value.missionId) {
        return invalid("mission_mismatch", `Entry ${index} Fury review mission does not match.`);
      }
      if (review.subjectKind !== currentReviewSubject.subjectKind ||
          review.subjectId !== currentReviewSubject.subjectId) {
        return invalid("subject_mismatch", `Entry ${index} Fury review subject does not match.`);
      }
      if (review.revisionId !== currentReviewSubject.revisionId) {
        return invalid("revision_mismatch", `Entry ${index} Fury review is stale or mismatched.`);
      }
      if (canonicalJson(input.timestamp) !== canonicalJson(review.decidedAt)) {
        return invalid("malformed", `Entry ${index} timestamp does not match the Fury decision time.`);
      }
      if (furyReviews.some(({ reviewId }) => reviewId === review.reviewId)) {
        return invalid("duplicate_evidence", `Entry ${index} duplicates a Fury reviewId.`);
      }
      if (furyReviews.some(({ revisionId }) => revisionId === review.revisionId)) {
        return invalid("decision_mismatch", `Entry ${index} conflicts with the final Fury record for this revision.`);
      }
      furyReviews.push({
        ...review,
        reasons: [...review.reasons],
        findings: review.findings.map((finding) => ({
          ...finding,
          evidenceRefs: [...finding.evidenceRefs],
          sourceLocation: { ...finding.sourceLocation },
        })),
        decidedAt: { ...review.decidedAt },
        provenance: { ...review.provenance },
        journalSequence: index,
        lifecycle: "current",
      });
    } else if (input.type === "governance.decided") {
      const nested = exactFields(input.payload, ["decision", "resumeState", "evidence"], `Entry ${index} governance payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      if (!["approve", "pause", "resume", "cancel"].includes(String(input.payload.decision))) return invalid("malformed", `Entry ${index} governance decision is unsupported.`);
      const next = transitionGovernance(governance, String(input.payload.decision), input.payload.resumeState);
      if (next === null) return invalid("malformed", `Entry ${index} governance transition is impossible.`);
      const checked = verifySignedHumanEvidence(input.payload.evidence, current, index);
      if (checked.state === "invalid") return checked;
      if (checked.value.seatId !== "coulson" || checked.value.evidenceKind !== "mission_authorization" || checked.value.decision !== evidenceDecisionForGovernance(String(input.payload.decision))) return invalid("seat_mismatch", `Entry ${index} does not contain matching Coulson authority evidence.`);
      if (checked.value.governanceTarget !== evidenceTargetForGovernance(String(input.payload.decision), input.payload.resumeState)) return invalid("decision_mismatch", `Entry ${index} governance target is not authorized by its signed evidence.`);
      if (canonicalJson(input.timestamp) !== canonicalJson(checked.value.timestamp)) return invalid("malformed", `Entry ${index} timestamp does not match its evidence.`);
      if (evidenceIds.has(checked.value.evidenceId)) return invalid("duplicate_evidence", `Entry ${index} duplicates evidenceId.`);
      evidenceIds.add(checked.value.evidenceId);
      evidence.push(checked.value);
      governance = next;
      if (String(input.payload.decision) === "approve") authorization = {
        source: "supervised", state: "authorized", missionRevisionId: briefResult.value.revisionId,
        delegationId: null, delegationRevisionId: null, eligibilityRevisionId: null,
        evaluatedThroughSequence: index, reasons: [],
      };
    } else if (input.type === "execution.transition") {
      const nested = exactFields(input.payload, ["from", "to", "reason"], `Entry ${index} execution payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      if (governance !== "approved") return invalid("malformed", `Entry ${index} execution requires approved governance.`);
      if (input.payload.from !== execution || !((execution === "not-started" && input.payload.to === "running") || (execution === "running" && input.payload.to === "completed"))) return invalid("malformed", `Entry ${index} execution transition is impossible.`);
      if (!nonEmpty(input.payload.reason)) return invalid("malformed", `Entry ${index} execution reason is required.`);
      execution = input.payload.to as ExecutionStatus;
    } else if (input.type === "evidence.recorded") {
      const nested = exactFields(input.payload, ["evidence"], `Entry ${index} evidence payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      const checked = verifySignedHumanEvidence(input.payload.evidence, current, index);
      if (checked.state === "invalid") return checked;
      if (checked.value.seatId === "coulson") return invalid("seat_mismatch", "Coulson governance evidence must use a mission command.");
      if (journalSchemaVersion === 7 &&
          (checked.value.seatId === "fitz" || checked.value.seatId === "simmons") &&
          (current.routeToFitz?.state !== "ready" ||
           current.routeToFitz.revisionId !== checked.value.revisionId)) {
        return invalid("readiness_blocked", `Entry ${index} human review requires current-head Fury approval.`);
      }
      if (checked.value.governanceTarget !== null) return invalid("decision_mismatch", `Entry ${index} non-governance evidence cannot authorize a governance target.`);
      if (canonicalJson(input.timestamp) !== canonicalJson(checked.value.timestamp)) return invalid("malformed", `Entry ${index} timestamp does not match its evidence.`);
      if (evidenceIds.has(checked.value.evidenceId)) return invalid("duplicate_evidence", `Entry ${index} duplicates evidenceId.`);
      evidenceIds.add(checked.value.evidenceId);
      evidence.push(checked.value);
    } else if (input.type === "communication.requested") {
      if (journalSchemaVersion !== 4 && journalSchemaVersion !== 5 && journalSchemaVersion !== 6 && journalSchemaVersion !== 7) return invalid("unsupported_schema", "Communication requests require journal v4, v5, v6, or v7.");
      if (governance !== "approved" || authorization.state !== "authorized") {
        return invalid("governance_denied", `Entry ${index} communication request requires active mission authorization.`);
      }
      const nested = exactFields(input.payload, ["request"], `Entry ${index} communication request payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      const checked = validateCommunicationRequest(input.payload.request);
      if (checked.state === "invalid") return invalid(checked.code, ...checked.errors);
      const request = checked.value;
      if (request.missionId !== briefResult.value.missionId || request.subjectId !== briefResult.value.subjectId) {
        return invalid("mission_mismatch", `Entry ${index} communication request does not match the canonical mission subject.`);
      }
      if (request.revisionId !== briefResult.value.revisionId) {
        return invalid("stale_candidate", `Entry ${index} communication request revision is stale.`);
      }
      if (communicationRequests.some((existing) => existing.requestId === request.requestId)) {
        return invalid("duplicate_request", `Entry ${index} duplicates communication requestId.`);
      }
      communicationRequests.push({
        ...request,
        state: "queued",
        candidateId: null,
        failureReason: null,
        receiptRef: null,
        sourceRef: null,
      });
    } else if (input.type === "communication.result_recorded") {
      if (journalSchemaVersion !== 4 && journalSchemaVersion !== 5 && journalSchemaVersion !== 6 && journalSchemaVersion !== 7) return invalid("unsupported_schema", "Communication results require journal v4, v5, v6, or v7.");
      const nested = exactFields(input.payload, ["candidate"], `Entry ${index} communication result payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      const checked = validateAdapterCandidate(input.payload.candidate);
      if (checked.state === "invalid") return invalid(checked.code, ...checked.errors);
      const candidate = checked.value;
      if (candidate.candidateKind !== "communication_result") {
        return invalid("candidate_kind_mismatch", `Entry ${index} requires a communication-result candidate.`);
      }
      if (candidate.missionId !== briefResult.value.missionId || candidate.subjectId !== briefResult.value.subjectId) {
        return invalid("mission_mismatch", `Entry ${index} communication result does not match the canonical mission subject.`);
      }
      if (candidate.revisionId !== briefResult.value.revisionId) {
        return invalid("stale_candidate", `Entry ${index} communication result revision is stale.`);
      }
      if (canonicalJson(input.timestamp) !== canonicalJson(candidate.capturedAt)) {
        return invalid("malformed", `Entry ${index} timestamp does not match candidate capture time.`);
      }
      if (candidateIds.has(candidate.candidateId)) return invalid("duplicate_candidate", `Entry ${index} duplicates candidateId.`);
      const request = communicationRequests.find((item) => item.requestId === candidate.payload.requestId);
      if (!request) return invalid("request_missing", `Entry ${index} communication result has no matching request.`);
      if (request.state !== "queued") return invalid("duplicate_result", `Entry ${index} communication request already has a result.`);
      if (request.adapterId !== candidate.adapterId) return invalid("adapter_mismatch", `Entry ${index} communication result adapter does not match its request.`);
      candidateIds.add(candidate.candidateId);
      request.state = candidate.payload.outcome;
      request.candidateId = candidate.candidateId;
      request.failureReason = candidate.payload.failureReason;
      request.receiptRef = candidate.payload.receiptRef;
      request.sourceRef = candidate.sourceRef;
    } else if (input.type === "execution.effect_recorded") {
      if (journalSchemaVersion !== 5 && journalSchemaVersion !== 6 && journalSchemaVersion !== 7) return invalid("unsupported_schema", "Execution effect records require journal v5, v6, or v7.");
      if (governance !== "approved" || authorization.state !== "authorized") {
        return invalid("governance_denied", `Entry ${index} execution effect requires active mission authorization.`);
      }
      if (execution !== "running") {
        return invalid("execution_not_running", `Entry ${index} execution effect requires running execution.`);
      }
      if (current.readiness.execute.state !== "ready" || current.readiness.execute.evaluatedThroughSequence !== index - 1) {
        return invalid("readiness_blocked", `Entry ${index} execution effect requires current execute readiness at the immediately previous sequence.`);
      }
      const effectErrors = executionEffectPayloadErrors(input.payload, `Entry ${index} execution effect payload`);
      if (effectErrors.length > 0) return invalid("malformed", ...effectErrors);
      const effect = input.payload as unknown as ExecutionEffectPayload;
      if (effect.subjectId !== briefResult.value.subjectId) {
        return invalid("subject_mismatch", `Entry ${index} execution effect subject does not match the canonical mission subject.`);
      }
      if (effect.revisionId !== briefResult.value.revisionId) {
        return invalid("revision_mismatch", `Entry ${index} execution effect revision is stale or mismatched.`);
      }
      if (effect.evaluatedThroughSequence !== index - 1) {
        return invalid("sequence_invalid", `Entry ${index} execution effect was not evaluated through the immediately previous sequence.`);
      }
      if (!briefResult.value.participants.some(({ seatId }) => seatId === effect.seatId)) {
        return invalid("seat_mismatch", `Entry ${index} execution effect seat is not a mission participant.`);
      }
      if (effectRecords.some((record) => record.cycleId === effect.cycleId)) {
        return invalid("duplicate_effect", `Entry ${index} duplicates an execution cycle.`);
      }
      if (effectRecords.some((record) => record.effectKey === effect.effectKey)) {
        return invalid("duplicate_effect", `Entry ${index} duplicates a completed or uncertain effect key.`);
      }
      effectRecords.push({
        ...effect,
        evidenceRefs: [...effect.evidenceRefs],
        entryId: String(input.entryId),
        missionId: briefResult.value.missionId,
        journalSequence: index,
        timestamp: input.timestamp as unknown as EvidenceTimestamp,
      });
    } else if (input.type === "runtime.binding_recorded") {
      if (journalSchemaVersion !== 6 && journalSchemaVersion !== 7) return invalid("unsupported_schema", "Runtime bindings require journal v6 or v7.");
      const nested = exactFields(input.payload, ["binding", "authorization"], `Entry ${index} runtime binding payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      const checked = validateRuntimeBinding(input.payload.binding);
      if (checked.state === "invalid") return invalid(checked.code, ...checked.errors);
      const binding = checked.value;
      if (!briefResult.value.participants.some(({ seatId }) => seatId === binding.seatId)) return invalid("seat_mismatch", "Runtime binding seat is not a mission participant.");
      if (briefResult.value.participants.some(({ seatId }) => seatId === binding.reasoningRuntimeId || seatId === binding.toolExecutorId)) return invalid("seat_mismatch", "Runtime and executor identities cannot be mission seats.");
      if (binding.bindingVersion !== 1 || binding.lifecycleState !== "active" || binding.activeThroughSequence !== null) return invalid("binding_invalid", "Initial runtime binding must be active version 1.");
      if (runtimeBindings.some((candidate) => candidate.bindingId === binding.bindingId || (candidate.lifecycleState === "active" && candidate.seatId === binding.seatId))) return invalid("binding_ambiguous", "Initial runtime binding identity or active seat is duplicated.");
      const authorized = verifySignedRuntimeBindingAuthorization(input.payload.authorization, binding, current, null, null);
      if (authorized.state === "invalid") return authorized;
      if (canonicalJson(input.timestamp) !== canonicalJson(authorized.value.timestamp)) return invalid("malformed", "Runtime binding timestamp does not match its authorization.");
      runtimeBindings.push(copyRuntimeBinding(binding));
    } else if (input.type === "runtime.binding_superseded") {
      if (journalSchemaVersion !== 6 && journalSchemaVersion !== 7) return invalid("unsupported_schema", "Runtime binding supersession requires journal v6 or v7.");
      const nested = exactFields(input.payload, ["priorBindingId", "priorBindingVersion", "binding", "authorization"], `Entry ${index} runtime supersession payload`);
      if (nested.length > 0) return invalid("malformed", ...nested);
      const supersession = input.payload as Record<string, unknown>;
      const prior = runtimeBindings.filter((candidate) => candidate.bindingId === supersession.priorBindingId && candidate.bindingVersion === supersession.priorBindingVersion && candidate.lifecycleState === "active");
      if (prior.length !== 1) return invalid("binding_ambiguous", "Runtime binding supersession requires exactly one active prior binding.");
      const checked = validateRuntimeBinding(input.payload.binding);
      if (checked.state === "invalid") return invalid(checked.code, ...checked.errors);
      const replacement = checked.value;
      if (!briefResult.value.participants.some(({ seatId }) => seatId === replacement.seatId)) return invalid("seat_mismatch", "Runtime binding replacement seat is not a mission participant.");
      if (briefResult.value.participants.some(({ seatId }) => seatId === replacement.reasoningRuntimeId || seatId === replacement.toolExecutorId)) return invalid("seat_mismatch", "Runtime and executor identities cannot be mission seats.");
      if (replacement.bindingId !== prior[0].bindingId || replacement.bindingVersion !== prior[0].bindingVersion + 1 || replacement.seatId !== prior[0].seatId || replacement.lifecycleState !== "active" || replacement.activeThroughSequence !== null) return invalid("binding_invalid", "Runtime binding replacement must atomically increment the same active binding.");
      const authorized = verifySignedRuntimeBindingAuthorization(input.payload.authorization, replacement, current, prior[0].bindingId, prior[0].bindingVersion);
      if (authorized.state === "invalid") return authorized;
      if (canonicalJson(input.timestamp) !== canonicalJson(authorized.value.timestamp)) return invalid("malformed", "Runtime supersession timestamp does not match its authorization.");
      prior[0].lifecycleState = "superseded";
      prior[0].activeThroughSequence = index - 1;
      runtimeBindings.push(copyRuntimeBinding(replacement));
    } else if (input.type === "authorization.delegated_evaluated") {
      if (journalSchemaVersion !== 3 || index !== 1 || governance !== "proposed") return invalid("malformed", "Delegated authorization must be entry 1 of a v3 proposed mission.");
      const nested = exactFields(input.payload, ["repositoryId", "delegationRevisionId", "delegationLog", "eligibility", "evaluation"], `Entry ${index} delegated authorization payload`);
      if (nested.length > 0 || !identifier(input.payload.repositoryId) || !identifier(input.payload.delegationRevisionId) || !Array.isArray(input.payload.delegationLog)) return invalid("malformed", ...nested, "Delegated repository, revision, or log snapshot is invalid.");
      const delegatedPayload = input.payload as Record<string, unknown>;
      const coulson = registryResult.value.bindings.filter((binding) => binding.seatId === "coulson" && binding.missionScope === "*");
      if (coulson.length !== 1) return invalid("binding_missing", "Delegated authorization requires one repository-wide Coulson binding.");
      const resolved = resolveWheelsOffDelegationRevision({ entries: delegatedPayload.delegationLog, binding: coulson[0], repositoryId: String(delegatedPayload.repositoryId), delegationRevisionId: String(delegatedPayload.delegationRevisionId) });
      if (resolved.state === "invalid") return invalid(resolved.code, ...resolved.errors);
      const evaluated = evaluateWheelsOffEligibility({
        brief: briefResult.value,
        delegation: resolved.value.delegation,
        eligibility: delegatedPayload.eligibility as WheelsOffEligibility,
        repositoryId: String(delegatedPayload.repositoryId),
        delegationState: resolved.value.state,
      });
      if (evaluated.state === "invalid") return invalid(evaluated.code, ...evaluated.errors);
      if (canonicalJson(evaluated.value) !== canonicalJson(delegatedPayload.evaluation)) return invalid("eligibility_failed", "Recorded delegation evaluation is not deterministic.");
      authorization = {
        source: "delegated", state: evaluated.value.result === "eligible" ? "authorized" : "ineligible",
        missionRevisionId: briefResult.value.revisionId, delegationId: resolved.value.delegation.delegationId,
        delegationRevisionId: resolved.value.delegation.revisionId, eligibilityRevisionId: evaluated.value.eligibilityRevisionId,
        evaluatedThroughSequence: index, reasons: evaluated.value.reasons,
      };
      if (evaluated.value.result === "eligible") governance = "approved";
    } else if (input.type === "authorization.delegated_invalidated") {
      if (journalSchemaVersion !== 3 || authorization.source !== "delegated" || authorization.state !== "authorized") return invalid("authorization_invalidated", "Only active delegated authorization can be invalidated.");
      const nested = exactFields(input.payload, ["reason"], `Entry ${index} invalidation payload`);
      if (nested.length > 0 || !DELEGATED_INVALIDATION_REASONS.includes(input.payload.reason as DelegatedInvalidationReason)) return invalid("malformed", ...nested, "Invalidation reason is unsupported.");
      governance = "proposed";
      authorization = { ...authorization, state: "invalidated", evaluatedThroughSequence: index, reasons: [String(input.payload.reason)] };
    } else {
      return invalid("malformed", `Entry ${index} type is unsupported.`);
    }
  }
  return valid(baseProjection(entries.length - 1));
}

export function parseSupervisedJournalJsonl(text: unknown): ContractResult<{ entries: SupervisedJournalEntry[]; projection: SupervisedMissionProjection }> {
  if (typeof text !== "string" || text.length === 0) return invalid("malformed", "Journal text must be non-empty.");
  if (!text.endsWith("\n")) return invalid("recovery_required", "Journal has an incomplete final line.");
  const lines = text.slice(0, -1).split("\n");
  const entries: unknown[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].length === 0) return invalid("malformed", `Journal line ${index + 1} is empty.`);
    try { entries.push(JSON.parse(lines[index])); }
    catch { return invalid("recovery_required", `Journal line ${index + 1} is malformed JSON.`); }
  }
  const replay = replaySupervisedMissionJournal(entries);
  return replay.state === "invalid" ? replay : valid({ entries: entries as SupervisedJournalEntry[], projection: replay.value });
}

export function serializeSupervisedJournalEntry(entry: SupervisedJournalEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

export function createGovernanceEntry(
  projection: SupervisedMissionProjection,
  decision: "approve" | "pause" | "resume" | "cancel",
  evidence: SignedHumanEvidence,
  resumeState: "proposed" | "approved" | null = null,
): ContractResult<SupervisedJournalEntry> {
  const next = transitionGovernance(projection.governance.state, decision, resumeState);
  if (next === null) return invalid("governance_denied", `Cannot ${decision} from ${projection.governance.state}.`);
  const checked = verifySignedHumanEvidence(evidence, projection, projection.lastSequence + 1);
  if (checked.state === "invalid") return checked;
  if (checked.value.seatId !== "coulson" || checked.value.evidenceKind !== "mission_authorization" || checked.value.decision !== evidenceDecisionForGovernance(decision)) return invalid("seat_mismatch", "Governance command requires matching Coulson evidence.");
  if (checked.value.governanceTarget !== evidenceTargetForGovernance(decision, resumeState)) return invalid("decision_mismatch", "Governance command target is not authorized by its signed evidence.");
  return valid({
    schemaVersion: projection.journalSchemaVersion,
    entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
    missionId: projection.missionId,
    sequence: projection.lastSequence + 1,
    type: "governance.decided",
    timestamp: checked.value.timestamp,
    payload: { decision, resumeState: decision === "resume" ? resumeState : null, evidence },
  });
}

export function createEvidenceEntry(
  projection: SupervisedMissionProjection,
  evidence: SignedHumanEvidence,
): ContractResult<SupervisedJournalEntry> {
  const checked = verifySignedHumanEvidence(evidence, projection, projection.lastSequence + 1);
  if (checked.state === "invalid") return checked;
  if (projection.evidence.some((record) => record.evidenceId === checked.value.evidenceId)) {
    return invalid("duplicate_evidence", "Evidence has already been recorded.");
  }
  if (checked.value.seatId === "coulson") return invalid("seat_mismatch", "Coulson evidence must use a mission governance command.");
  if (projection.journalSchemaVersion === 7 &&
      (checked.value.seatId === "fitz" || checked.value.seatId === "simmons") &&
      (projection.routeToFitz?.state !== "ready" ||
       projection.routeToFitz.revisionId !== checked.value.revisionId)) {
    return invalid("readiness_blocked", "Human review requires current-head Fury approval.");
  }
  if (checked.value.governanceTarget !== null) return invalid("decision_mismatch", "Non-governance evidence cannot authorize a governance target.");
  return valid({
    schemaVersion: projection.journalSchemaVersion,
    entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
    missionId: projection.missionId,
    sequence: projection.lastSequence + 1,
    type: "evidence.recorded",
    timestamp: checked.value.timestamp,
    payload: { evidence },
  });
}

export function createReviewSubjectSupersessionEntry(
  projection: SupervisedMissionProjection,
  reviewSubjectInput: unknown,
  timestamp: EvidenceTimestamp,
): ContractResult<SupervisedJournalEntry> {
  if (projection.journalSchemaVersion !== 7 || projection.reviewSubject === undefined) {
    return invalid("unsupported_schema", "Review-subject supersession requires journal v7.");
  }
  const subjectErrors = reviewSubjectErrors(reviewSubjectInput, "Review subject");
  if (subjectErrors.length > 0) return invalid("malformed", ...subjectErrors);
  const timestampValidation = timestampErrors(timestamp, "Review-subject supersession timestamp");
  if (timestampValidation.length > 0) return invalid("malformed", ...timestampValidation);
  const reviewSubject = reviewSubjectInput as ReviewSubjectRevision;
  if (reviewSubject.subjectKind !== projection.reviewSubject.subjectKind ||
      reviewSubject.subjectId !== projection.reviewSubject.subjectId) {
    return invalid("subject_mismatch", "Review-subject supersession cannot change subject identity.");
  }
  if (reviewSubject.revisionId === projection.reviewSubject.revisionId ||
      reviewSubject.supersedesRevisionId !== projection.reviewSubject.revisionId) {
    return invalid("revision_mismatch", "Review-subject supersession must name the exact current revision.");
  }
  if (!Array.isArray(projection.reviewRevisions) ||
      projection.reviewRevisions.some(({ revisionId }) => revisionId === reviewSubject.revisionId)) {
    return invalid("revision_mismatch", "Review-subject supersession cannot reuse a revision identity.");
  }
  let requirements: EvidenceRequirement[];
  try {
    requirements = createReviewEvidenceRequirements(
      projection.brief,
      reviewSubject,
      projection.lastSequence + 1,
      projection.requirements,
    );
  } catch (error) {
    return invalid("missing_requirement", error instanceof Error ? error.message : "Review requirements are ambiguous.");
  }
  return valid({
    schemaVersion: 7,
    entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
    missionId: projection.missionId,
    sequence: projection.lastSequence + 1,
    type: "subject.revision_superseded",
    timestamp,
    payload: { reviewSubject, requirements },
  });
}

export function createFuryReviewEntry(
  projection: SupervisedMissionProjection,
  reviewInput: unknown,
): ContractResult<SupervisedJournalEntry> {
  if (projection.journalSchemaVersion !== 7 || projection.reviewSubject === undefined) {
    return invalid("unsupported_schema", "Fury review records require journal v7.");
  }
  const errors = furyReviewErrors(reviewInput, "Fury review");
  if (errors.length > 0) return invalid("malformed", ...errors);
  const review = reviewInput as FuryReviewRecord;
  if (review.missionId !== projection.missionId) {
    return invalid("mission_mismatch", "Fury review mission does not match.");
  }
  if (review.subjectKind !== projection.reviewSubject.subjectKind ||
      review.subjectId !== projection.reviewSubject.subjectId) {
    return invalid("subject_mismatch", "Fury review subject does not match.");
  }
  if (review.revisionId !== projection.reviewSubject.revisionId) {
    return invalid("revision_mismatch", "Fury review is stale or mismatched.");
  }
  if (projection.furyReviews?.some(({ reviewId }) => reviewId === review.reviewId)) {
    return invalid("duplicate_evidence", "Fury reviewId has already been recorded.");
  }
  if (projection.furyReviews?.some(({ revisionId }) => revisionId === review.revisionId)) {
    return invalid("decision_mismatch", "A final Fury record already exists for this revision.");
  }
  return valid({
    schemaVersion: 7,
    entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
    missionId: projection.missionId,
    sequence: projection.lastSequence + 1,
    type: review.verdict === "approved" ? "fury.review_approved" : "fury.review_changes_requested",
    timestamp: review.decidedAt,
    payload: { review },
  });
}

export function createHumanEvidenceEntryFromAdapterCandidate(
  projection: SupervisedMissionProjection,
  candidateInput: unknown,
): ContractResult<SupervisedJournalEntry> {
  const checked = validateAdapterCandidate(candidateInput);
  if (checked.state === "invalid") return invalid(checked.code, ...checked.errors);
  const candidate = checked.value;
  if (candidate.candidateKind !== "human_evidence") {
    return invalid("candidate_kind_mismatch", "Human evidence intake requires a human-evidence candidate.");
  }
  const evidenceSubject = projection.journalSchemaVersion === 7
    ? projection.reviewSubject
    : { subjectId: projection.brief.subjectId, revisionId: projection.brief.revisionId };
  if (evidenceSubject === undefined ||
      candidate.missionId !== projection.missionId ||
      candidate.subjectId !== evidenceSubject.subjectId) {
    return invalid("mission_mismatch", "Human evidence candidate does not match the canonical mission subject.");
  }
  if (candidate.revisionId !== evidenceSubject.revisionId) {
    return invalid("stale_candidate", "Human evidence candidate revision is stale.");
  }
  return createEvidenceEntry(projection, candidate.payload.evidence as SignedHumanEvidence);
}

export function createCommunicationRequestEntry(
  projection: SupervisedMissionProjection,
  requestInput: unknown,
  timestamp: EvidenceTimestamp,
): ContractResult<SupervisedJournalEntry> {
  if (projection.journalSchemaVersion !== 4 && projection.journalSchemaVersion !== 5 && projection.journalSchemaVersion !== 6 && projection.journalSchemaVersion !== 7) return invalid("unsupported_schema", "Communication requests require journal v4, v5, v6, or v7.");
  if (projection.governance.state !== "approved" || projection.authorization.state !== "authorized") {
    return invalid("governance_denied", "Communication request requires active mission authorization.");
  }
  const checked = validateCommunicationRequest(requestInput);
  if (checked.state === "invalid") return invalid(checked.code, ...checked.errors);
  const request = checked.value;
  const timeErrors = timestampErrors(timestamp, "Communication request timestamp");
  if (timeErrors.length > 0) return invalid("malformed", ...timeErrors);
  if (request.missionId !== projection.missionId || request.subjectId !== projection.brief.subjectId) {
    return invalid("mission_mismatch", "Communication request does not match the canonical mission subject.");
  }
  if (request.revisionId !== projection.brief.revisionId) {
    return invalid("stale_candidate", "Communication request revision is stale.");
  }
  if (projection.communication.requests.some((existing) => existing.requestId === request.requestId)) {
    return invalid("duplicate_request", "Communication requestId has already been recorded.");
  }
  return valid({
    schemaVersion: projection.journalSchemaVersion,
    entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
    missionId: projection.missionId,
    sequence: projection.lastSequence + 1,
    type: "communication.requested",
    timestamp,
    payload: { request },
  });
}

export function createCommunicationResultEntry(
  projection: SupervisedMissionProjection,
  candidateInput: unknown,
): ContractResult<SupervisedJournalEntry> {
  if (projection.journalSchemaVersion !== 4 && projection.journalSchemaVersion !== 5 && projection.journalSchemaVersion !== 6 && projection.journalSchemaVersion !== 7) return invalid("unsupported_schema", "Communication results require journal v4, v5, v6, or v7.");
  const checked = validateAdapterCandidate(candidateInput);
  if (checked.state === "invalid") return invalid(checked.code, ...checked.errors);
  const candidate = checked.value;
  if (candidate.candidateKind !== "communication_result") {
    return invalid("candidate_kind_mismatch", "Communication result intake requires a communication-result candidate.");
  }
  if (candidate.missionId !== projection.missionId || candidate.subjectId !== projection.brief.subjectId) {
    return invalid("mission_mismatch", "Communication result does not match the canonical mission subject.");
  }
  if (candidate.revisionId !== projection.brief.revisionId) {
    return invalid("stale_candidate", "Communication result revision is stale.");
  }
  if (projection.communication.requests.some((request) => request.candidateId === candidate.candidateId)) {
    return invalid("duplicate_candidate", "Communication candidateId has already been recorded.");
  }
  const request = projection.communication.requests.find((item) => item.requestId === candidate.payload.requestId);
  if (!request) return invalid("request_missing", "Communication result has no matching request.");
  if (request.state !== "queued") return invalid("duplicate_result", "Communication request already has a result.");
  if (request.adapterId !== candidate.adapterId) return invalid("adapter_mismatch", "Communication result adapter does not match its request.");
  return valid({
    schemaVersion: projection.journalSchemaVersion,
    entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
    missionId: projection.missionId,
    sequence: projection.lastSequence + 1,
    type: "communication.result_recorded",
    timestamp: candidate.capturedAt,
    payload: { candidate },
  });
}

export function createExecutionEffectEntry(
  projection: SupervisedMissionProjection,
  candidateInput: unknown,
  timestamp: EvidenceTimestamp,
): ContractResult<SupervisedJournalEntry> {
  if (projection.journalSchemaVersion !== 5 && projection.journalSchemaVersion !== 6 && projection.journalSchemaVersion !== 7) {
    return invalid("unsupported_schema", "Execution effect records require journal v5, v6, or v7.");
  }
  if (projection.governance.state !== "approved" || projection.authorization.state !== "authorized") {
    return invalid("governance_denied", "Execution effect recording requires active mission authorization.");
  }
  if (projection.execution.status !== "running") {
    return invalid("execution_not_running", "Execution effect recording requires running execution.");
  }
  if (projection.readiness.execute.state !== "ready" ||
      projection.readiness.execute.evaluatedThroughSequence !== projection.lastSequence) {
    return invalid("readiness_blocked", "Execution effect recording requires execute readiness at the current journal sequence.");
  }
  const checked = validateRunnerSupervisedEffectCandidate(candidateInput);
  if (checked.state === "invalid") return checked;
  const candidate = checked.value;
  if (candidate.journalSchemaVersion !== projection.journalSchemaVersion) return invalid("unsupported_schema", "Runner effect candidate journal version does not match the projection.");
  const timeErrors = timestampErrors(timestamp, "Execution effect timestamp");
  if (timeErrors.length > 0) return invalid("malformed", ...timeErrors);
  if (candidate.missionId !== projection.missionId || candidate.subjectId !== projection.brief.subjectId) {
    return invalid("mission_mismatch", "Runner effect candidate does not match the canonical mission subject.");
  }
  if (candidate.revisionId !== projection.brief.revisionId) {
    return invalid("revision_mismatch", "Runner effect candidate revision is stale or mismatched.");
  }
  if (candidate.expectedPreviousSequence !== projection.lastSequence ||
      candidate.intendedJournalSequence !== projection.lastSequence + 1 ||
      candidate.payload.evaluatedThroughSequence !== projection.lastSequence) {
    return invalid("sequence_invalid", "Runner effect candidate is stale or not bound to the next journal sequence.");
  }
  if (!projection.brief.participants.some(({ seatId }) => seatId === candidate.payload.seatId)) {
    return invalid("seat_mismatch", "Runner effect candidate seat is not a mission participant.");
  }
  if (projection.effectRecords.some((record) => record.cycleId === candidate.payload.cycleId || record.effectKey === candidate.payload.effectKey)) {
    return invalid("duplicate_effect", "Runner effect candidate duplicates a recorded cycle or effect key.");
  }
  return valid({
    schemaVersion: projection.journalSchemaVersion,
    entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
    missionId: projection.missionId,
    sequence: projection.lastSequence + 1,
    type: "execution.effect_recorded",
    timestamp,
    payload: { ...candidate.payload, evidenceRefs: [...candidate.payload.evidenceRefs] },
  });
}

export function createRuntimeBindingEntry(
  projection: SupervisedMissionProjection,
  bindingInput: unknown,
  authorization: SignedRuntimeBindingAuthorization,
): ContractResult<SupervisedJournalEntry> {
  if (projection.journalSchemaVersion !== 6 && projection.journalSchemaVersion !== 7) return invalid("unsupported_schema", "Runtime bindings require journal v6 or v7.");
  const checked = validateRuntimeBinding(bindingInput);
  if (checked.state === "invalid") return invalid(checked.code, ...checked.errors);
  const binding = checked.value;
  if (!projection.brief.participants.some(({ seatId }) => seatId === binding.seatId)) return invalid("seat_mismatch", "Runtime binding seat is not a mission participant.");
  if (projection.brief.participants.some(({ seatId }) => seatId === binding.reasoningRuntimeId || seatId === binding.toolExecutorId)) return invalid("seat_mismatch", "Runtime and executor identities cannot be mission seats.");
  if (binding.bindingVersion !== 1 || binding.lifecycleState !== "active" || binding.activeThroughSequence !== null) return invalid("binding_invalid", "Initial runtime binding must be active version 1.");
  if (projection.runtimeBindings.some((candidate) => candidate.bindingId === binding.bindingId) || projection.activeRuntimeBindings.some((candidate) => candidate.seatId === binding.seatId)) return invalid("binding_ambiguous", "Runtime binding identity or active seat is duplicated.");
  const authorized = verifySignedRuntimeBindingAuthorization(authorization, binding, projection, null, null);
  if (authorized.state === "invalid") return authorized;
  return valid({ schemaVersion: projection.journalSchemaVersion, entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`, missionId: projection.missionId, sequence: projection.lastSequence + 1, type: "runtime.binding_recorded", timestamp: authorized.value.timestamp, payload: { binding: copyRuntimeBinding(binding), authorization: { payload: { ...authorization.payload, timestamp: { ...authorization.payload.timestamp } }, signatureBase64: authorization.signatureBase64 } } });
}

export function createRuntimeBindingSupersessionEntry(
  projection: SupervisedMissionProjection,
  priorBindingId: string,
  priorBindingVersion: number,
  bindingInput: unknown,
  authorization: SignedRuntimeBindingAuthorization,
): ContractResult<SupervisedJournalEntry> {
  if (projection.journalSchemaVersion !== 6 && projection.journalSchemaVersion !== 7) return invalid("unsupported_schema", "Runtime binding supersession requires journal v6 or v7.");
  const prior = projection.activeRuntimeBindings.filter((candidate) => candidate.bindingId === priorBindingId && candidate.bindingVersion === priorBindingVersion);
  if (prior.length !== 1) return invalid("binding_ambiguous", "Runtime binding supersession requires exactly one active prior binding.");
  const checked = validateRuntimeBinding(bindingInput);
  if (checked.state === "invalid") return invalid(checked.code, ...checked.errors);
  const replacement = checked.value;
  if (projection.brief.participants.some(({ seatId }) => seatId === replacement.reasoningRuntimeId || seatId === replacement.toolExecutorId)) return invalid("seat_mismatch", "Runtime and executor identities cannot be mission seats.");
  if (replacement.bindingId !== priorBindingId || replacement.bindingVersion !== priorBindingVersion + 1 || replacement.seatId !== prior[0].seatId || replacement.lifecycleState !== "active" || replacement.activeThroughSequence !== null) return invalid("binding_invalid", "Runtime binding replacement must atomically increment the same active binding.");
  const authorized = verifySignedRuntimeBindingAuthorization(authorization, replacement, projection, priorBindingId, priorBindingVersion);
  if (authorized.state === "invalid") return authorized;
  return valid({ schemaVersion: projection.journalSchemaVersion, entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`, missionId: projection.missionId, sequence: projection.lastSequence + 1, type: "runtime.binding_superseded", timestamp: authorized.value.timestamp, payload: { priorBindingId, priorBindingVersion, binding: copyRuntimeBinding(replacement), authorization: { payload: { ...authorization.payload, timestamp: { ...authorization.payload.timestamp } }, signatureBase64: authorization.signatureBase64 } } });
}

export function planMissionStep(
  projection: SupervisedMissionProjection,
  timestamp: EvidenceTimestamp,
): ContractResult<{ entry: SupervisedJournalEntry | null; outcome: "advanced" | "completed-noop" }> {
  const timestampValidation = timestampErrors(timestamp, "Step timestamp");
  if (timestampValidation.length > 0) return invalid("malformed", ...timestampValidation);
  if (projection.governance.state !== "approved") return invalid("governance_denied", "Mission step requires approved governance.");
  if (projection.execution.status === "completed") return valid({ entry: null, outcome: "completed-noop" });
  const to: ExecutionStatus = projection.execution.status === "not-started" ? "running" : "completed";
  return valid({
    entry: {
      schemaVersion: projection.journalSchemaVersion,
      entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`,
      missionId: projection.missionId,
      sequence: projection.lastSequence + 1,
      type: "execution.transition",
      timestamp,
      payload: {
        from: projection.execution.status,
        to,
        reason: "bounded-supervised-fixture-transition",
      },
    },
    outcome: "advanced",
  });
}

export function createDelegatedAuthorizationEntry(input: {
  projection: SupervisedMissionProjection;
  repositoryId: string;
  delegationRevisionId: string;
  delegationLog: DelegationLogEntry[];
  eligibility: WheelsOffEligibility;
  evaluatedAt: EvidenceTimestamp;
}): ContractResult<SupervisedJournalEntry> {
  if (input.projection.journalSchemaVersion !== 3 || input.projection.lastSequence !== 0 || input.projection.governance.state !== "proposed") return invalid("governance_denied", "Delegated authorization must immediately follow a v3 mission begin.");
  const timeErrors = timestampErrors(input.evaluatedAt, "Delegated evaluation timestamp"); if (timeErrors.length) return invalid("malformed", ...timeErrors);
  const coulson = input.projection.trustedBindings.filter((binding) => binding.seatId === "coulson" && binding.missionScope === "*");
  if (coulson.length !== 1) return invalid("binding_missing", "Delegated authorization requires one repository-wide Coulson binding.");
  const resolved = resolveWheelsOffDelegationRevision({ entries: input.delegationLog, binding: coulson[0], repositoryId: input.repositoryId, delegationRevisionId: input.delegationRevisionId });
  if (resolved.state === "invalid") return invalid(resolved.code, ...resolved.errors);
  const evaluation = evaluateWheelsOffEligibility({ brief: input.projection.brief, delegation: resolved.value.delegation, eligibility: input.eligibility, repositoryId: input.repositoryId, delegationState: resolved.value.state });
  if (evaluation.state === "invalid") return invalid(evaluation.code, ...evaluation.errors);
  return valid({
    schemaVersion: 3,
    entryId: `entry:${input.projection.missionId}:1`, missionId: input.projection.missionId, sequence: 1,
    type: "authorization.delegated_evaluated", timestamp: input.evaluatedAt,
    payload: { repositoryId: input.repositoryId, delegationRevisionId: input.delegationRevisionId, delegationLog: input.delegationLog, eligibility: input.eligibility, evaluation: evaluation.value },
  });
}

export function createDelegatedInvalidationEntry(projection: SupervisedMissionProjection, reason: DelegatedInvalidationReason, timestamp: EvidenceTimestamp): ContractResult<SupervisedJournalEntry> {
  if (projection.journalSchemaVersion !== 3 || projection.authorization.source !== "delegated" || projection.authorization.state !== "authorized") return invalid("authorization_invalidated", "Mission does not have active delegated authorization.");
  if (!DELEGATED_INVALIDATION_REASONS.includes(reason)) return invalid("malformed", "Invalidation reason is unsupported.");
  const timeErrors = timestampErrors(timestamp, "Invalidation timestamp"); if (timeErrors.length) return invalid("malformed", ...timeErrors);
  return valid({ schemaVersion: 3, entryId: `entry:${projection.missionId}:${projection.lastSequence + 1}`, missionId: projection.missionId, sequence: projection.lastSequence + 1, type: "authorization.delegated_invalidated", timestamp, payload: { reason } });
}
