export const ADAPTER_CONTRACT_VERSION = 1 as const;
export const ADAPTER_IDS = ["github", "manual"] as const;
export const ADAPTER_CANDIDATE_KINDS = ["human_evidence", "communication_result", "follow_up_snapshot"] as const;
export const FOLLOW_UP_LIFECYCLE_STATES = ["awaiting_review", "follow_up_required"] as const;
export const FOLLOW_UP_SOURCE_KINDS = ["review", "review_comment", "check_run", "status_check"] as const;
export const FOLLOW_UP_FINDING_CLASSES = [
  "implementation",
  "evidence",
  "architecture_conformance",
  "advisory",
  "false_positive",
  "human_decision",
] as const;
export const FOLLOW_UP_ROUTE_SEATS = ["hill", "daisy", "may", "fury", "coulson"] as const;
export const COMMUNICATION_OUTCOMES = ["delivered", "failed", "unknown"] as const;
export const COMMUNICATION_FAILURE_REASONS = [
  "adapter_unavailable",
  "authentication_failed",
  "authorization_failed",
  "rate_limited",
  "timeout",
  "host_rejected",
  "not_found",
  "malformed_response",
  "ambiguous_response",
  "network_failed",
  "unknown",
] as const;
export const COMMUNICATION_OPERATIONS = [
  "publish_mission_brief",
  "publish_status",
  "publish_review_artifact",
  "request_human_evidence",
] as const;

export type AdapterId = (typeof ADAPTER_IDS)[number];
export type AdapterCandidateKind = (typeof ADAPTER_CANDIDATE_KINDS)[number];
export type FollowUpLifecycleState = (typeof FOLLOW_UP_LIFECYCLE_STATES)[number];
export type FollowUpSourceKind = (typeof FOLLOW_UP_SOURCE_KINDS)[number];
export type FollowUpFindingClass = (typeof FOLLOW_UP_FINDING_CLASSES)[number];
export type FollowUpRouteSeat = (typeof FOLLOW_UP_ROUTE_SEATS)[number];
export type CommunicationOutcome = (typeof COMMUNICATION_OUTCOMES)[number];
export type CommunicationFailureReason = (typeof COMMUNICATION_FAILURE_REASONS)[number];
export type CommunicationOperation = (typeof COMMUNICATION_OPERATIONS)[number];

export interface AdapterTimestamp { value: string; provenance: "humanRecorded" | "hostTrusted"; }
export interface HumanEvidenceCandidatePayload { evidence: unknown; }
export interface CommunicationResultPayload {
  requestId: string;
  outcome: CommunicationOutcome;
  failureReason: CommunicationFailureReason | null;
  receiptRef: string | null;
}
export interface FollowUpFindingPayload {
  findingId: string;
  sourceKind: FollowUpSourceKind;
  sourceRef: string;
  headRefOid: string;
  classification: FollowUpFindingClass;
  routeToSeatId: FollowUpRouteSeat;
  blocking: boolean;
  requiresFuryFollowUp: boolean;
  summary: string;
}
export interface FollowUpSnapshotPayload {
  lifecycleState: FollowUpLifecycleState;
  repository: string;
  branch: string;
  prNumber: number;
  headRefOid: string;
  reviewSourceRefs: readonly string[];
  findings: readonly FollowUpFindingPayload[];
  replyRequirements: {
    concise: true;
    includeResolution: true;
    includeValidation: true;
    includeUnresolved: true;
  };
}
interface AdapterCandidateBase {
  adapterContractVersion: 1;
  adapterId: AdapterId;
  candidateId: string;
  missionId: string;
  subjectId: string;
  revisionId: string;
  sourceRef: string;
  capturedAt: AdapterTimestamp;
}
export interface HumanEvidenceAdapterCandidate extends AdapterCandidateBase {
  candidateKind: "human_evidence";
  humanPrincipalId: string;
  bindingId: string;
  payload: HumanEvidenceCandidatePayload;
}
export interface CommunicationResultAdapterCandidate extends AdapterCandidateBase {
  candidateKind: "communication_result";
  humanPrincipalId: null;
  bindingId: null;
  payload: CommunicationResultPayload;
}
export interface FollowUpSnapshotAdapterCandidate extends AdapterCandidateBase {
  candidateKind: "follow_up_snapshot";
  humanPrincipalId: null;
  bindingId: null;
  payload: FollowUpSnapshotPayload;
}
export type AdapterCandidateEnvelope =
  | HumanEvidenceAdapterCandidate
  | CommunicationResultAdapterCandidate
  | FollowUpSnapshotAdapterCandidate;
export interface CommunicationRequestPayload {
  requestId: string;
  adapterContractVersion: 1;
  adapterId: AdapterId;
  operation: CommunicationOperation;
  missionId: string;
  subjectId: string;
  revisionId: string;
  artifactRevisionId: string;
  targetRef: string;
}
export interface AdapterCandidateIdentity {
  evidenceId: string;
  missionId: string;
  subjectId: string;
  revisionId: string;
  humanPrincipalId: string | null;
  bindingId: string | null;
  sourceRef: string;
}
export interface AdapterValid<T> { state: "valid"; value: T; }
export interface AdapterInvalid { state: "invalid"; code: string; errors: string[]; }
export type AdapterResult<T> = AdapterValid<T> | AdapterInvalid;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/;
const IMMUTABLE_REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{40,64})$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const valid = <T,>(value: T): AdapterValid<T> => ({ state: "valid", value });
const invalid = <T = never,>(code: string, ...errors: string[]): AdapterResult<T> => ({ state: "invalid", code, errors });
function plain(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function exact(value: unknown, fields: readonly string[], label: string): string[] {
  if (!plain(value)) return [`${label} must be a plain object.`];
  const allowed = new Set(fields); const errors: string[] = [];
  for (const field of fields) if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  for (const field of Object.keys(value)) if (!allowed.has(field)) errors.push(`${label} has unknown field: ${field}.`);
  return errors;
}
function timestampErrors(value: unknown, label: string): string[] {
  const errors = exact(value, ["value", "provenance"], label); if (!plain(value)) return errors;
  if (typeof value.value !== "string" || !ISO_UTC.test(value.value) || !Number.isFinite(Date.parse(value.value))) errors.push(`${label}.value is invalid.`);
  if (value.provenance !== "humanRecorded" && value.provenance !== "hostTrusted") errors.push(`${label}.provenance is invalid.`);
  return errors;
}
function identifier(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function immutableRevision(value: unknown): value is string { return typeof value === "string" && IMMUTABLE_REVISION.test(value); }
function repositoryName(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value); }
function boundedText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 1000; }

function humanEvidenceIdentity(value: unknown): AdapterResult<AdapterCandidateIdentity> {
  if (!plain(value)) return invalid("malformed", "Human evidence candidate evidence must be a signed envelope.");
  const envelopeErrors = exact(value, ["payload", "signatureBase64"], "Human evidence candidate evidence");
  if (envelopeErrors.length > 0 || !plain(value.payload)) return invalid("malformed", ...envelopeErrors, "Human evidence candidate evidence payload must be a plain object.");
  const payload = value.payload;
  const required = ["evidenceId", "missionId", "subjectId", "revisionId", "humanPrincipalId", "bindingId", "sourceRef"];
  const errors: string[] = [];
  for (const field of required) if (!identifier(payload[field])) errors.push(`Human evidence candidate evidence ${field} is invalid.`);
  if (typeof value.signatureBase64 !== "string" || value.signatureBase64.length === 0) errors.push("Human evidence candidate signatureBase64 is invalid.");
  if (errors.length > 0) return invalid("malformed", ...errors);
  return valid(payload as unknown as AdapterCandidateIdentity);
}

export function validateCommunicationRequest(input: unknown): AdapterResult<CommunicationRequestPayload> {
  const fields = ["requestId","adapterContractVersion","adapterId","operation","missionId","subjectId","revisionId","artifactRevisionId","targetRef"];
  const errors = exact(input, fields, "Communication request"); if (!plain(input)) return invalid("malformed", ...errors);
  if (input.adapterContractVersion !== 1) errors.push("Communication request adapterContractVersion is unsupported.");
  if (!ADAPTER_IDS.includes(input.adapterId as AdapterId)) errors.push("Communication request adapterId is unsupported.");
  if (!COMMUNICATION_OPERATIONS.includes(input.operation as CommunicationOperation)) errors.push("Communication request operation is unsupported.");
  for (const field of ["requestId","missionId","subjectId","targetRef"]) if (!identifier(input[field])) errors.push(`Communication request ${field} is invalid.`);
  for (const field of ["revisionId","artifactRevisionId"]) {
    const revision = input[field];
    if (typeof revision !== "string" || !IMMUTABLE_REVISION.test(revision)) errors.push(`Communication request ${field} must be immutable.`);
  }
  return errors.length ? invalid("malformed", ...errors) : valid(input as unknown as CommunicationRequestPayload);
}

export function validateAdapterCandidate(input: unknown): AdapterResult<AdapterCandidateEnvelope> {
  const fields = ["adapterContractVersion","adapterId","candidateId","candidateKind","missionId","subjectId","revisionId","humanPrincipalId","bindingId","sourceRef","capturedAt","payload"];
  const errors = exact(input, fields, "Adapter candidate"); if (!plain(input)) return invalid("malformed", ...errors);
  if (input.adapterContractVersion !== 1) errors.push("Adapter candidate adapterContractVersion is unsupported.");
  if (!ADAPTER_IDS.includes(input.adapterId as AdapterId)) errors.push("Adapter candidate adapterId is unsupported.");
  if (!ADAPTER_CANDIDATE_KINDS.includes(input.candidateKind as AdapterCandidateKind)) errors.push("Adapter candidate candidateKind is unsupported.");
  for (const field of ["candidateId","missionId","subjectId","sourceRef"]) if (!identifier(input[field])) errors.push(`Adapter candidate ${field} is invalid.`);
  if (typeof input.revisionId !== "string" || !IMMUTABLE_REVISION.test(input.revisionId)) errors.push("Adapter candidate revisionId must be immutable.");
  errors.push(...timestampErrors(input.capturedAt, "Adapter candidate capturedAt"));
  if (input.candidateKind === "human_evidence") {
    if (!identifier(input.humanPrincipalId) || !identifier(input.bindingId)) errors.push("Human evidence candidate requires principal and binding identifiers.");
    const payloadErrors = exact(input.payload, ["evidence"], "Human evidence candidate payload"); errors.push(...payloadErrors);
    if (payloadErrors.length === 0 && plain(input.payload)) {
      const identity = humanEvidenceIdentity(input.payload.evidence);
      if (identity.state === "invalid") errors.push(...identity.errors);
      else {
        const bindings: Array<[keyof AdapterCandidateIdentity, string]> = [
          ["evidenceId", "candidateId"], ["missionId", "missionId"], ["subjectId", "subjectId"],
          ["revisionId", "revisionId"], ["humanPrincipalId", "humanPrincipalId"],
          ["bindingId", "bindingId"], ["sourceRef", "sourceRef"],
        ];
        for (const [evidenceField, candidateField] of bindings) {
          if (identity.value[evidenceField] !== input[candidateField]) {
            errors.push(`Human evidence candidate ${candidateField} does not match signed evidence ${evidenceField}.`);
          }
        }
      }
    }
  } else if (input.candidateKind === "communication_result") {
    if (input.humanPrincipalId !== null || input.bindingId !== null) errors.push("Communication result candidate cannot carry human authority identity.");
    const payloadErrors = exact(input.payload, ["requestId","outcome","failureReason","receiptRef"], "Communication result payload"); errors.push(...payloadErrors);
    if (plain(input.payload)) {
      if (!identifier(input.payload.requestId)) errors.push("Communication result requestId is invalid.");
      if (!COMMUNICATION_OUTCOMES.includes(input.payload.outcome as CommunicationOutcome)) errors.push("Communication result outcome is unsupported.");
      const failure = input.payload.failureReason;
      if (input.payload.outcome === "delivered") {
        if (failure !== null || !identifier(input.payload.receiptRef)) errors.push("Delivered communication requires a receipt and no failure reason.");
      } else {
        if (!COMMUNICATION_FAILURE_REASONS.includes(failure as CommunicationFailureReason)) errors.push("Non-delivered communication requires a stable failure reason.");
        if (input.payload.receiptRef !== null && !identifier(input.payload.receiptRef)) errors.push("Communication receiptRef is invalid.");
      }
    }
  } else if (input.candidateKind === "follow_up_snapshot") {
    if (input.humanPrincipalId !== null || input.bindingId !== null) errors.push("Follow-up snapshot candidate cannot carry human authority identity.");
    const payloadErrors = exact(input.payload, ["lifecycleState","repository","branch","prNumber","headRefOid","reviewSourceRefs","findings","replyRequirements"], "Follow-up snapshot payload"); errors.push(...payloadErrors);
    if (plain(input.payload)) {
      if (!FOLLOW_UP_LIFECYCLE_STATES.includes(input.payload.lifecycleState as FollowUpLifecycleState)) errors.push("Follow-up snapshot lifecycleState is unsupported.");
      if (!repositoryName(input.payload.repository)) errors.push("Follow-up snapshot repository is invalid.");
      if (!identifier(input.payload.branch)) errors.push("Follow-up snapshot branch is invalid.");
      const prNumber = input.payload.prNumber;
      if (typeof prNumber !== "number" || !Number.isInteger(prNumber) || prNumber < 1) errors.push("Follow-up snapshot prNumber is invalid.");
      if (!immutableRevision(input.payload.headRefOid)) errors.push("Follow-up snapshot headRefOid must be immutable.");
      if (input.payload.headRefOid !== input.revisionId) errors.push("Follow-up snapshot headRefOid must match candidate revisionId.");
      if (!Array.isArray(input.payload.reviewSourceRefs)) errors.push("Follow-up snapshot reviewSourceRefs must be an array.");
      else {
        const seenSourceRefs = new Set<string>();
        for (const sourceRef of input.payload.reviewSourceRefs) {
          if (!identifier(sourceRef)) errors.push("Follow-up snapshot reviewSourceRef is invalid.");
          if (typeof sourceRef === "string" && seenSourceRefs.has(sourceRef)) errors.push("Follow-up snapshot reviewSourceRefs must be unique.");
          if (typeof sourceRef === "string") seenSourceRefs.add(sourceRef);
        }
      }
      if (!Array.isArray(input.payload.findings)) errors.push("Follow-up snapshot findings must be an array.");
      else {
        if (input.payload.lifecycleState === "awaiting_review" && input.payload.findings.length !== 0) errors.push("Awaiting-review snapshot cannot carry findings.");
        if (input.payload.lifecycleState === "follow_up_required" && input.payload.findings.length === 0) errors.push("Follow-up-required snapshot requires findings.");
        if (input.payload.findings.length > 32) errors.push("Follow-up snapshot findings exceeds the bounded maximum.");
        const seenFindingIds = new Set<string>();
        const seenFindingSources = new Set<string>();
        for (const finding of input.payload.findings) {
          const findingErrors = exact(finding, ["findingId","sourceKind","sourceRef","headRefOid","classification","routeToSeatId","blocking","requiresFuryFollowUp","summary"], "Follow-up finding");
          errors.push(...findingErrors);
          if (!plain(finding)) continue;
          if (!identifier(finding.findingId)) errors.push("Follow-up finding findingId is invalid.");
          if (typeof finding.findingId === "string" && seenFindingIds.has(finding.findingId)) errors.push("Follow-up finding IDs must be unique.");
          if (typeof finding.findingId === "string") seenFindingIds.add(finding.findingId);
          if (!FOLLOW_UP_SOURCE_KINDS.includes(finding.sourceKind as FollowUpSourceKind)) errors.push("Follow-up finding sourceKind is unsupported.");
          if (!identifier(finding.sourceRef)) errors.push("Follow-up finding sourceRef is invalid.");
          if (typeof finding.sourceRef === "string" && seenFindingSources.has(finding.sourceRef)) errors.push("Follow-up finding sourceRefs must be unique.");
          if (typeof finding.sourceRef === "string") seenFindingSources.add(finding.sourceRef);
          if (finding.headRefOid !== input.payload.headRefOid) errors.push("Follow-up finding headRefOid must match snapshot headRefOid.");
          if (!FOLLOW_UP_FINDING_CLASSES.includes(finding.classification as FollowUpFindingClass)) errors.push("Follow-up finding classification is unsupported.");
          if (!FOLLOW_UP_ROUTE_SEATS.includes(finding.routeToSeatId as FollowUpRouteSeat)) errors.push("Follow-up finding routeToSeatId is unsupported.");
          if (typeof finding.blocking !== "boolean") errors.push("Follow-up finding blocking must be boolean.");
          if (typeof finding.requiresFuryFollowUp !== "boolean") errors.push("Follow-up finding requiresFuryFollowUp must be boolean.");
          if (finding.classification === "architecture_conformance" && finding.routeToSeatId !== "fury") errors.push("Architecture conformance findings must route to Fury.");
          if (finding.classification === "human_decision" && finding.routeToSeatId !== "coulson") errors.push("Human decision findings must route to Coulson.");
          if (!boundedText(finding.summary)) errors.push("Follow-up finding summary is invalid.");
        }
      }
      const requirements = input.payload.replyRequirements;
      const requirementErrors = exact(requirements, ["concise","includeResolution","includeValidation","includeUnresolved"], "Follow-up reply requirements");
      errors.push(...requirementErrors);
      if (plain(requirements)) {
        for (const field of ["concise","includeResolution","includeValidation","includeUnresolved"]) {
          if (requirements[field] !== true) errors.push(`Follow-up reply requirement ${field} must be true.`);
        }
      }
    }
  }
  return errors.length ? invalid("malformed", ...errors) : valid(input as unknown as AdapterCandidateEnvelope);
}
