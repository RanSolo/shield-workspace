export const ADAPTER_CONTRACT_VERSION = 1 as const;
export const ADAPTER_IDS = ["github", "manual"] as const;
export const ADAPTER_CANDIDATE_KINDS = ["human_evidence", "communication_result"] as const;
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
export type AdapterCandidateEnvelope =
  | HumanEvidenceAdapterCandidate
  | CommunicationResultAdapterCandidate;
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
  }
  return errors.length ? invalid("malformed", ...errors) : valid(input as unknown as AdapterCandidateEnvelope);
}
