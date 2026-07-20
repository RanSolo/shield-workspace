import { createHash } from "node:crypto";

export const PERMISSION_AUDIT_SCHEMA_VERSION = 1 as const;

export type PermissionAuditDecision = "allow" | "wait" | "deny";
export type PermissionAuditToolOutcome = "completed" | "failed" | "uncertain";

export interface PermissionAuditIdentity {
  missionId: string;
  subjectId: string;
  seatId: string;
  reasoningRuntimeId: string;
  toolExecutorId: string;
  bindingId: string;
  bindingVersion: number;
  repositoryId: string;
  canonicalWritableRoot: string;
  branch: string;
  missionRevisionId: string;
  artifactRevisionId: string;
  journalSequence: number;
  cycleId: string;
  actionId: string;
  effectClass: string;
  effectKey: string;
}

export type PermissionAuditRecord =
  | (PermissionAuditIdentity & {
    schemaVersion: 1;
    authority: "non_authoritative";
    recordType: "permission.decision";
    recordId: string;
    decisionId: string;
    decision: PermissionAuditDecision;
    reasonCode: string;
    observedAt: string;
  })
  | (PermissionAuditIdentity & {
    schemaVersion: 1;
    authority: "non_authoritative";
    recordType: "tool.result";
    recordId: string;
    decisionId: string;
    outcome: PermissionAuditToolOutcome;
    reasonCode: string;
    observedAt: string;
  });

export interface PermissionAuditAppendReceipt {
  schemaVersion: 1;
  authority: "non_authoritative";
  ledgerId: string;
  recordId: string;
  decisionId: string;
  recordDigest: string;
  ledgerSequence: number;
  status: "appended";
}

export type PermissionAuditResult<T> =
  | { state: "valid"; value: T }
  | { state: "invalid"; code: string; errors: string[] };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/;
const EFFECT_CLASSES = new Set(["behavioral_implementation", "verification", "coordination"]);
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/;
const IDENTITY_FIELDS = [
  "missionId", "subjectId", "seatId", "reasoningRuntimeId", "toolExecutorId",
  "bindingId", "bindingVersion", "repositoryId", "canonicalWritableRoot", "branch",
  "missionRevisionId", "artifactRevisionId", "journalSequence", "cycleId", "actionId", "effectClass", "effectKey",
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
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) errors.push(`${label} has unknown field: ${String(key)}.`);
    else {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) errors.push(`${label}.${key} must be an enumerable data field.`);
    }
  }
  return errors;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_UTC.test(value) && Number.isFinite(Date.parse(value));
}

export function validatePermissionAuditRecord(input: unknown): PermissionAuditResult<PermissionAuditRecord> {
  if (!isPlainObject(input)) return { state: "invalid", code: "audit_record_malformed", errors: ["Audit record must be a plain object."] };
  const recordTypeDescriptor = Object.getOwnPropertyDescriptor(input, "recordType");
  if (!recordTypeDescriptor?.enumerable || !Object.hasOwn(recordTypeDescriptor, "value") ||
      (recordTypeDescriptor.value !== "permission.decision" && recordTypeDescriptor.value !== "tool.result")) {
    return { state: "invalid", code: "audit_record_malformed", errors: ["Audit record type is missing, unsafe, or unsupported."] };
  }
  const recordFields = recordTypeDescriptor.value === "permission.decision"
    ? ["schemaVersion", "authority", "recordType", "recordId", ...IDENTITY_FIELDS, "decisionId", "decision", "reasonCode", "observedAt"]
    : ["schemaVersion", "authority", "recordType", "recordId", ...IDENTITY_FIELDS, "decisionId", "outcome", "reasonCode", "observedAt"];
  const errors = exactFields(input, recordFields, "Audit record");
  if (errors.length > 0) return { state: "invalid", code: "audit_record_malformed", errors };
  if (input.schemaVersion !== 1) errors.push("Audit schema version is unsupported.");
  if (input.authority !== "non_authoritative") errors.push("Audit record must be explicitly non-authoritative.");
  if (input.recordType !== "permission.decision" && input.recordType !== "tool.result") errors.push("Audit record type is unsupported.");
  for (const field of ["recordId", "missionId", "subjectId", "seatId", "reasoningRuntimeId", "toolExecutorId", "bindingId", "repositoryId", "branch", "cycleId", "actionId", "effectClass", "effectKey", "decisionId", "reasonCode"] as const) {
    if (!IDENTIFIER.test(String(input[field] ?? ""))) errors.push(`Audit record ${field} is invalid.`);
  }
  for (const field of ["missionRevisionId", "artifactRevisionId"] as const) if (!REVISION.test(String(input[field] ?? ""))) errors.push(`Audit record ${field} is invalid.`);
  if (!EFFECT_CLASSES.has(String(input.effectClass))) errors.push("Audit effectClass is unsupported.");
  if (typeof input.canonicalWritableRoot !== "string" || !input.canonicalWritableRoot.startsWith("/") || input.canonicalWritableRoot.length > 4096 || input.canonicalWritableRoot.includes("\0") || input.canonicalWritableRoot.includes("/../")) errors.push("Audit canonicalWritableRoot must be canonical and absolute.");
  if (!Number.isSafeInteger(input.bindingVersion) || (input.bindingVersion as number) < 1) errors.push("Audit bindingVersion is invalid.");
  if (!Number.isSafeInteger(input.journalSequence) || (input.journalSequence as number) < 0) errors.push("Audit journalSequence is invalid.");
  if (!validTimestamp(input.observedAt)) errors.push("Audit observedAt is invalid.");
  if (input.recordType === "permission.decision" && !["allow", "wait", "deny"].includes(String(input.decision))) errors.push("Audit decision is unsupported.");
  if (input.recordType === "tool.result" && !["completed", "failed", "uncertain"].includes(String(input.outcome))) errors.push("Audit tool outcome is unsupported.");
  return errors.length > 0
    ? { state: "invalid", code: "audit_record_malformed", errors }
    : { state: "valid", value: input as unknown as PermissionAuditRecord };
}

export function replayPermissionAuditLedger(input: unknown): PermissionAuditResult<{ records: PermissionAuditRecord[]; usedDecisionIds: string[] }> {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    return { state: "invalid", code: "audit_ledger_malformed", errors: ["Audit ledger must be a plain array."] };
  }
  for (const key of Reflect.ownKeys(input)) {
    if (key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key) ||
        !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      return { state: "invalid", code: "audit_ledger_malformed", errors: ["Audit ledger has an unsafe array field."] };
    }
  }
  if (Object.keys(input).length !== input.length) {
    return { state: "invalid", code: "audit_ledger_malformed", errors: ["Audit ledger must not be sparse."] };
  }
  const records: PermissionAuditRecord[] = [];
  const recordIds = new Set<string>();
  const decisions = new Map<string, Extract<PermissionAuditRecord, { recordType: "permission.decision" }>>();
  const resultDecisionIds = new Set<string>();
  const errors: string[] = [];
  input.forEach((candidate, index) => {
    const checked = validatePermissionAuditRecord(candidate);
    if (checked.state === "invalid") { errors.push(...checked.errors.map((error) => `Record ${index}: ${error}`)); return; }
    if (recordIds.has(checked.value.recordId)) errors.push(`Record ${index}: duplicate recordId.`);
    recordIds.add(checked.value.recordId);
    if (checked.value.recordType === "permission.decision") {
      if (decisions.has(checked.value.decisionId)) errors.push(`Record ${index}: decisionId is not single-use.`);
      decisions.set(checked.value.decisionId, checked.value);
    } else {
      const decision = decisions.get(checked.value.decisionId);
      if (decision === undefined) errors.push(`Record ${index}: tool result has no preceding permission decision.`);
      else {
        for (const field of IDENTITY_FIELDS) {
          if (checked.value[field] !== decision[field]) errors.push(`Record ${index}: tool result ${field} does not match its permission decision.`);
        }
      }
      if (resultDecisionIds.has(checked.value.decisionId)) errors.push(`Record ${index}: decisionId has more than one tool result.`);
      resultDecisionIds.add(checked.value.decisionId);
    }
    records.push(checked.value);
  });
  return errors.length > 0
    ? { state: "invalid", code: "audit_ledger_invalid", errors }
    : { state: "valid", value: { records: [...records], usedDecisionIds: [...decisions.keys()] } };
}

export function validatePermissionAuditAppendReceipt(input: unknown, record: PermissionAuditRecord): PermissionAuditResult<PermissionAuditAppendReceipt> {
  const errors = exactFields(input, ["schemaVersion", "authority", "ledgerId", "recordId", "decisionId", "recordDigest", "ledgerSequence", "status"], "Audit append receipt");
  if (errors.length > 0 || !isPlainObject(input)) return { state: "invalid", code: "audit_receipt_malformed", errors };
  if (input.schemaVersion !== 1 || input.authority !== "non_authoritative" || input.status !== "appended") errors.push("Audit append receipt contract is unsupported.");
  if (typeof input.ledgerId !== "string" || !IDENTIFIER.test(input.ledgerId)) errors.push("Audit append receipt ledgerId is invalid.");
  if (input.recordId !== record.recordId || input.decisionId !== record.decisionId) errors.push("Audit append receipt does not match the exact record.");
  if (input.recordDigest !== computePermissionAuditRecordDigest(record)) errors.push("Audit append receipt digest does not match the exact record.");
  if (!Number.isSafeInteger(input.ledgerSequence) || (input.ledgerSequence as number) < 0) errors.push("Audit append receipt ledgerSequence is invalid.");
  return errors.length > 0
    ? { state: "invalid", code: "audit_receipt_mismatch", errors }
    : { state: "valid", value: input as unknown as PermissionAuditAppendReceipt };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isPlainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  return value;
}

export function computePermissionAuditRecordDigest(record: PermissionAuditRecord): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalValue(record))).digest("base64url")}`;
}
