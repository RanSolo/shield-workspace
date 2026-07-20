import { createHash } from "node:crypto";

export const PERMISSION_AUDIT_SCHEMA_VERSION = 1 as const;

export type PermissionAuditOutcome = "allow" | "deny" | "completed" | "failed" | "uncertain";

export interface PermissionAuditRecord {
  schemaVersion: 1;
  recordId: string;
  recordType: "permission.decision" | "tool.result";
  authority: "non_authoritative";
  recordedAt: string;
  decisionId: string;
  outcome: PermissionAuditOutcome;
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
  revisionId: string;
  journalSequence: number;
  actionId: string;
  effectClass: string;
  effectKey: string;
  approvedScope: string[];
  summary: string | null;
  evidenceRefs: string[];
  digest: string;
}

export interface PermissionAuditReceipt {
  schemaVersion: 1;
  recordId: string;
  digest: string;
  appended: true;
  ledgerSequence: number;
}

export interface PermissionAuditAppender {
  appendIfAbsent(record: PermissionAuditRecord): Promise<unknown>;
}

export type PermissionAuditResult<T> =
  | { state: "valid"; value: T }
  | { state: "invalid"; code: string; errors: string[] };

const invalid = <T = never,>(code: string, ...errors: string[]): PermissionAuditResult<T> => ({
  state: "invalid", code, errors: errors.flat(),
});
const valid = <T,>(value: T): PermissionAuditResult<T> => ({ state: "valid", value });
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/;
const RECORD_FIELDS = [
  "schemaVersion", "recordId", "recordType", "authority", "recordedAt", "decisionId", "outcome",
  "missionId", "subjectId", "seatId", "reasoningRuntimeId", "toolExecutorId", "bindingId",
  "bindingVersion", "repositoryId", "canonicalWritableRoot", "branch", "revisionId", "journalSequence",
  "actionId", "effectClass", "effectKey", "approvedScope", "summary", "evidenceRefs", "digest",
] as const;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value: unknown, fields: readonly string[], label: string): string[] {
  if (!plain(value)) return [`${label} must be a plain object.`];
  const allowed = new Set(fields);
  return [
    ...fields.filter((field) => !Object.hasOwn(value, field)).map((field) => `${label} is missing field: ${field}.`),
    ...Object.keys(value).filter((field) => !allowed.has(field)).map((field) => `${label} has unknown field: ${field}.`),
  ];
}

function stringSet(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return [`${label} must be a plain array.`];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) { errors.push(`${label} must not be sparse.`); continue; }
    const item = Object.getOwnPropertyDescriptor(value, String(index))?.value;
    if (typeof item !== "string" || !IDENTIFIER.test(item)) errors.push(`${label}[${index}] is invalid.`);
    else if (seen.has(item)) errors.push(`${label} duplicates ${item}.`);
    else seen.add(item);
  }
  return errors;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function digestInput(record: Omit<PermissionAuditRecord, "digest">): string {
  return JSON.stringify(canonical(record));
}

export function computePermissionAuditDigest(record: Omit<PermissionAuditRecord, "digest">): string {
  return `sha256:${createHash("sha256").update(digestInput(record)).digest("base64url")}`;
}

export function createPermissionAuditRecord(
  record: Omit<PermissionAuditRecord, "schemaVersion" | "authority" | "digest">,
): PermissionAuditRecord {
  const content = { ...record, approvedScope: [...record.approvedScope], evidenceRefs: [...record.evidenceRefs], schemaVersion: 1 as const, authority: "non_authoritative" as const };
  return { ...content, digest: computePermissionAuditDigest(content) };
}

export function validatePermissionAuditRecord(input: unknown): PermissionAuditResult<PermissionAuditRecord> {
  const errors = exact(input, RECORD_FIELDS, "Permission audit record");
  if (errors.length > 0 || !plain(input)) return invalid("malformed_audit_record", ...errors);
  if (input.schemaVersion !== 1 || input.authority !== "non_authoritative") errors.push("Permission audit record authority or version is invalid.");
  if (input.recordType !== "permission.decision" && input.recordType !== "tool.result") errors.push("Permission audit record type is invalid.");
  for (const field of ["recordId", "decisionId", "missionId", "subjectId", "seatId", "reasoningRuntimeId", "toolExecutorId", "bindingId", "repositoryId", "branch", "revisionId", "actionId", "effectClass", "effectKey"] as const) {
    if (typeof input[field] !== "string" || !IDENTIFIER.test(input[field] as string)) errors.push(`Permission audit record ${field} is invalid.`);
  }
  if (typeof input.canonicalWritableRoot !== "string" || !input.canonicalWritableRoot.startsWith("/")) errors.push("Permission audit record canonicalWritableRoot is invalid.");
  if (!Number.isSafeInteger(input.bindingVersion) || (input.bindingVersion as number) < 1 || !Number.isSafeInteger(input.journalSequence) || (input.journalSequence as number) < 0) errors.push("Permission audit record binding version or journal sequence is invalid.");
  if (typeof input.recordedAt !== "string" || !Number.isFinite(Date.parse(input.recordedAt))) errors.push("Permission audit record timestamp is invalid.");
  if (!["allow", "deny", "completed", "failed", "uncertain"].includes(String(input.outcome))) errors.push("Permission audit record outcome is invalid.");
  if (input.summary !== null && (typeof input.summary !== "string" || input.summary.length === 0 || input.summary.length > 512)) errors.push("Permission audit summary is invalid.");
  errors.push(...stringSet(input.approvedScope, "Permission audit approvedScope"), ...stringSet(input.evidenceRefs, "Permission audit evidenceRefs"));
  if (typeof input.digest !== "string" || !DIGEST.test(input.digest)) errors.push("Permission audit digest is malformed.");
  if (errors.length > 0) return invalid("malformed_audit_record", ...errors);
  const { digest, ...content } = input as unknown as PermissionAuditRecord;
  if (digest !== computePermissionAuditDigest(content)) return invalid("digest_mismatch", "Permission audit digest does not match its canonical content.");
  return valid(input as unknown as PermissionAuditRecord);
}

export function validatePermissionAuditReceipt(
  input: unknown,
  record: PermissionAuditRecord,
): PermissionAuditResult<PermissionAuditReceipt> {
  const errors = exact(input, ["schemaVersion", "recordId", "digest", "appended", "ledgerSequence"], "Permission audit receipt");
  if (errors.length > 0 || !plain(input)) return invalid("malformed_audit_receipt", ...errors);
  if (input.schemaVersion !== 1 || input.appended !== true || input.recordId !== record.recordId || input.digest !== record.digest ||
      !Number.isSafeInteger(input.ledgerSequence) || (input.ledgerSequence as number) < 0) {
    return invalid("audit_receipt_mismatch", "Permission audit receipt does not prove the exact atomic append.");
  }
  return valid(input as unknown as PermissionAuditReceipt);
}

export function replayPermissionAuditLedger(input: unknown): PermissionAuditResult<PermissionAuditRecord[]> {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid("malformed_audit_ledger", "Permission audit ledger must be a plain array.");
  const records: PermissionAuditRecord[] = [];
  const ids = new Set<string>();
  const decisions = new Map<string, PermissionAuditRecord>();
  for (let index = 0; index < input.length; index += 1) {
    if (!Object.hasOwn(input, index)) return invalid("malformed_audit_ledger", "Permission audit ledger must not be sparse.");
    const checked = validatePermissionAuditRecord(Object.getOwnPropertyDescriptor(input, String(index))?.value);
    if (checked.state === "invalid") return checked;
    const record = checked.value;
    if (ids.has(record.recordId)) return invalid("duplicate_audit_record", `Permission audit record ${record.recordId} is duplicated.`);
    if (record.recordType === "permission.decision") decisions.set(record.decisionId, record);
    else {
      const decision = decisions.get(record.decisionId);
      if (!decision || decision.outcome !== "allow") return invalid("audit_order_invalid", "Tool result must follow its exact allow decision.");
      for (const field of ["missionId", "subjectId", "seatId", "reasoningRuntimeId", "toolExecutorId", "bindingId", "bindingVersion", "repositoryId", "canonicalWritableRoot", "branch", "revisionId", "journalSequence", "actionId", "effectClass", "effectKey"] as const) {
        if (record[field] !== decision[field]) return invalid("audit_identity_mismatch", `Tool result ${field} does not match its allow decision.`);
      }
    }
    ids.add(record.recordId);
    records.push(record);
  }
  return valid(records.map((record) => ({ ...record, approvedScope: [...record.approvedScope], evidenceRefs: [...record.evidenceRefs] })));
}
