import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { isDispatchableRoleId } from "./role-taxonomy-v1.mjs";

export const SEAT_DISPATCH_RECEIPT_SCHEMA_VERSION = 1 as const;
export const SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION = "shield.seat-dispatch.event.v1" as const;

const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;
const KIND_START = "dispatch.started" as const;
const KIND_INTERRUPTED = "dispatch.interrupted" as const;
const KIND_RESUMED = "dispatch.resumed" as const;
const KIND_COMPLETED = "dispatch.completed" as const;
const KIND_FAILED = "dispatch.failed" as const;
const KIND_CANCELLED = "dispatch.cancelled" as const;

export const SEAT_DISPATCH_EVENT_KINDS = [
  KIND_START,
  KIND_INTERRUPTED,
  KIND_RESUMED,
  KIND_COMPLETED,
  KIND_FAILED,
  KIND_CANCELLED,
] as const;

export type SeatDispatchLifecycleStateV1 =
  | "started"
  | "interrupted"
  | "resumed"
  | "completed"
  | "failed"
  | "cancelled";

export interface RuntimeConfiguredV1 {
  readonly kind: "runtime.configured";
  readonly runtimeId: string;
  readonly model: string;
}

export interface RuntimeRequestedV1 {
  readonly kind: "runtime.requested";
  readonly runtimeId: string;
  readonly model: string;
}

export interface RuntimeSelfReportUnavailableV1 {
  readonly kind: "runtime.self_report.unavailable";
  readonly reason: "not_reported";
}

export interface RuntimeSelfReportObservedV1 {
  readonly kind: "runtime.self_report.observed";
  readonly runtimeId: string;
  readonly model: string;
  readonly evidenceRefs: readonly string[];
}

export interface RuntimeHostUnobservedV1 {
  readonly kind: "runtime.host_observed.unavailable";
  readonly reason: "unobserved";
}

export interface RuntimeHostObservedV1 {
  readonly kind: "runtime.host_observed";
  readonly runtimeId: string;
  readonly model: string;
  readonly evidenceRefs: readonly string[];
}

export interface ExecutorSelfReportUnavailableV1 {
  readonly kind: "executor.self_report.unavailable";
  readonly reason: "not_reported";
}

export interface ExecutorSelfReportObservedV1 {
  readonly kind: "executor.self_report.observed";
  readonly executorId: string;
  readonly evidenceRefs: readonly string[];
}

export interface ExecutorHostUnobservedV1 {
  readonly kind: "executor.host_observed.unavailable";
  readonly reason: "not_observed";
}

export interface ExecutorHostObservedV1 {
  readonly kind: "executor.host_observed";
  readonly executorId: string;
  readonly evidenceRefs: readonly string[];
}

export interface ToolExecutionRequestedV1 {
  readonly kind: "tool.execution.requested";
  readonly executorBindingRef: string;
}

export interface ToolExecutionNotRequestedV1 {
  readonly kind: "tool.execution.not_requested";
  readonly reason: "not_requested";
}

export type SeatDispatchRuntimeSelfReport = RuntimeSelfReportUnavailableV1 | RuntimeSelfReportObservedV1;
export type SeatDispatchRuntimeHostObservation = RuntimeHostUnobservedV1 | RuntimeHostObservedV1;
export type SeatDispatchExecutorSelfReport = ExecutorSelfReportUnavailableV1 | ExecutorSelfReportObservedV1;
export type SeatDispatchExecutorHostObservation = ExecutorHostUnobservedV1 | ExecutorHostObservedV1;
export type SeatDispatchToolExecution = ToolExecutionRequestedV1 | ToolExecutionNotRequestedV1;

export interface SeatDispatchInterruptionDispositionV1 {
  readonly code: string;
  readonly errors: readonly string[];
}

interface EventInputCore {
  readonly receiptId: string;
  readonly dispatchId: string;
  readonly parentMissionId: string;
  readonly parentMissionRevision: string;
  readonly parentSessionId: string;
  readonly childTaskId: string;
  readonly childSessionId: string;
  readonly accountableSeatId: string;
  readonly repositoryId: string;
  readonly repositoryWorkspaceId: string;
  readonly repositoryRevision: string;
  readonly subjectId: string;
  readonly subjectRevision: string;
  readonly artifactId: string;
  readonly artifactRevision: string;
  readonly configuredRuntime: RuntimeConfiguredV1;
  readonly requestedRuntime: RuntimeRequestedV1;
  readonly toolExecution: SeatDispatchToolExecution;
  readonly runtimeSelfReport: SeatDispatchRuntimeSelfReport;
  readonly runtimeHostObserved: SeatDispatchRuntimeHostObservation;
  readonly executorSelfReport: SeatDispatchExecutorSelfReport;
  readonly executorHostObserved: SeatDispatchExecutorHostObservation;
  readonly timestamp: string;
  readonly logSequence: number;
  readonly previousLogDigest: string | null;
  readonly lifecycleSequence: number;
  readonly previousLifecycleDigest: string | null;
}

export interface SeatDispatchReceiptEventStartedV1 extends EventInputCore {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION;
  readonly kind: typeof KIND_START;
  readonly inputEvidenceRefs: readonly string[];
  readonly entryDigest: string;
}

export interface SeatDispatchReceiptEventInterruptedV1 extends EventInputCore {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION;
  readonly kind: typeof KIND_INTERRUPTED;
  readonly recoveryEvidenceRefs?: readonly string[];
  readonly originalDisposition?: SeatDispatchInterruptionDispositionV1;
  readonly entryDigest: string;
}

export interface SeatDispatchReceiptEventResumedV1 extends EventInputCore {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION;
  readonly kind: typeof KIND_RESUMED;
  readonly entryDigest: string;
}

export interface SeatDispatchReceiptEventTerminalV1 extends EventInputCore {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION;
  readonly kind: typeof KIND_COMPLETED | typeof KIND_FAILED | typeof KIND_CANCELLED;
  readonly entryDigest: string;
  readonly outputEvidenceRefs: readonly string[];
}

export type SeatDispatchReceiptEventV1 =
  | SeatDispatchReceiptEventStartedV1
  | SeatDispatchReceiptEventInterruptedV1
  | SeatDispatchReceiptEventResumedV1
  | SeatDispatchReceiptEventTerminalV1;

export interface SeatDispatchReceiptIdentityV1 {
  readonly receiptId: string;
  readonly dispatchId: string;
  readonly parentMissionId: string;
  readonly parentMissionRevision: string;
  readonly parentSessionId: string;
  readonly childTaskId: string;
  readonly childSessionId: string;
  readonly accountableSeatId: string;
  readonly repositoryId: string;
  readonly repositoryWorkspaceId: string;
  readonly repositoryRevision: string;
  readonly subjectId: string;
  readonly subjectRevision: string;
  readonly artifactId: string;
  readonly artifactRevision: string;
}

export interface SeatDispatchReceiptProjectionV1 extends SeatDispatchReceiptIdentityV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION;
  readonly configuredRuntime: RuntimeConfiguredV1;
  readonly requestedRuntime: RuntimeRequestedV1;
  readonly toolExecution: SeatDispatchToolExecution;
  readonly state: SeatDispatchLifecycleStateV1;
  readonly startedAt: string;
  readonly lastEventTimestamp: string;
  readonly logSequence: number;
  readonly lastEntryDigest: string;
  readonly previousLogDigest: string | null;
  readonly lifecycleSequence: number;
  readonly previousLifecycleDigest: string | null;
  readonly runtimeSelfReportHistory: readonly RuntimeSelfReportObservedV1[];
  readonly runtimeHostHistory: readonly RuntimeHostObservedV1[];
  readonly executorSelfReportHistory: readonly ExecutorSelfReportObservedV1[];
  readonly executorHostHistory: readonly ExecutorHostObservedV1[];
  readonly inputEvidenceRefs: readonly string[];
  readonly outputEvidenceRefs: readonly string[] | null;
  readonly recoveryEvidenceRefs: readonly string[] | null;
  readonly originalDisposition: SeatDispatchInterruptionDispositionV1 | null;
}

export type SeatDispatchAttributionReason =
  | "missing_receipt"
  | "malformed_raw_log"
  | "forged_seat_label"
  | "stale_mission_revision"
  | "stale_subject_revision"
  | "stale_artifact_revision"
  | "wrong_artifact_id"
  | "wrong_repository"
  | "wrong_workspace"
  | "wrong_parent_session"
  | "wrong_child_session"
  | "stale_repository_revision"
  | "conflicting_receipt"
  | "missing_runtime_observation"
  | "missing_executor_observation"
  | "non_terminal_lifecycle";

export interface SeatDispatchAttributionAttributableResult<T> {
  readonly state: "attributed";
  readonly artifact: T;
  readonly receipt: SeatDispatchReceiptProjectionV1;
  readonly reasonCodes: readonly [];
}

export interface SeatDispatchAttributionUnattributableResult<T> {
  readonly state: "unattributed";
  readonly artifact: T;
  readonly reasonCodes: readonly SeatDispatchAttributionReason[];
}

export type SeatDispatchAttributionResult<T> =
  | SeatDispatchAttributionAttributableResult<T>
  | SeatDispatchAttributionUnattributableResult<T>;

export interface SeatDispatchAttributionInput<T> extends SeatDispatchReceiptIdentityV1 {
  readonly artifact: T;
  readonly rawReceiptEntries?: unknown;
  readonly replayResult?: SeatDispatchReplayResult;
}

export type SeatDispatchReplayFailureCode =
  | "malformed_log"
  | "malformed_event"
  | "digest_mismatch"
  | "duplicate_event"
  | "duplicate_start"
  | "global_sequence_gap"
  | "global_previous_digest"
  | "lifecycle_sequence_gap"
  | "lifecycle_previous_digest"
  | "illegal_transition"
  | "post_terminal"
  | "timestamp_regression"
  | "identity_mismatch"
  | "receipt_dispatch_collision"
  | "child_task_reuse"
  | "child_session_reuse"
  | "output_evidence_misplacement";

export interface SeatDispatchReplayValidResult {
  readonly state: "valid";
  readonly entries: readonly SeatDispatchReceiptEventV1[];
  readonly projections: readonly SeatDispatchReceiptProjectionV1[];
}

export interface SeatDispatchReplayInvalidResult {
  readonly state: "invalid";
  readonly code: SeatDispatchReplayFailureCode;
  readonly reasonCodes: readonly string[];
}

export type SeatDispatchReplayResult = SeatDispatchReplayValidResult | SeatDispatchReplayInvalidResult;

const MAX_EVIDENCE_REFERENCE_COUNT = 16;
const MAX_DISPOSITION_ERROR_COUNT = 16;
const MAX_DISPOSITION_ERROR_LENGTH = 2_048;

interface ValidationResult<T> {
  readonly state: "valid" | "invalid";
  readonly value?: T;
  readonly code?: string;
  readonly reasonCodes?: readonly string[];
}

function safeIsProxy(value: unknown): boolean {
  try {
    return isProxy(value);
  } catch {
    return true;
  }
}

function plain(value: unknown): value is Record<string, unknown> {
  try {
    return value !== null &&
      typeof value === "object" &&
      !safeIsProxy(value) &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function exact(value: unknown, fields: readonly string[], label: string): string[] {
  try {
    if (!plain(value)) return [`${label} must be a plain object.`];
    const expected = new Set(fields);
    const errors: string[] = [];
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
        errors.push(`${label} is missing field: ${field}.`);
      }
    }
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : undefined;
      if (typeof key !== "string" || !expected.has(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
        errors.push(`${label} has invalid field: ${String(key)}.`);
      }
    }
    return errors;
  } catch {
    return ["malformed object"];
  }
}

function arrayChecks(value: unknown, label: string): string[] {
  try {
    if (value === null ||
        typeof value !== "object" ||
        safeIsProxy(value) ||
        !Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Array.prototype) {
      return [`${label} must be a plain array.`];
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : undefined;
      if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
        return [`${label} has an unsafe array field.`];
      }
    }
    if (value.length > MAX_EVIDENCE_REFERENCE_COUNT) return [`${label} exceeds max length ${MAX_EVIDENCE_REFERENCE_COUNT}.`];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index) || Object.getOwnPropertyDescriptor(value, String(index))?.value === undefined) {
        return [`${label} must not be sparse.`];
      }
      if (!identifier(Object.getOwnPropertyDescriptor(value, String(index))?.value)) return [`${label}[${index}] is not a valid identifier.`];
    }
    return [];
  } catch {
    return ["malformed array"];
  }
}

function arrayValues(value: unknown): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || safeIsProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) =>
      key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key))
    )) {
      return null;
    }
    const values: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      values.push(descriptor.value);
    }
    return values;
  } catch {
    return null;
  }
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function revision(value: unknown): value is string {
  return typeof value === "string" && REVISION.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_UTC.test(value) && Number.isFinite(Date.parse(value));
}

function nonNegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function validateEvidenceRefs(input: unknown, label: string): string[] {
  return arrayChecks(input, label);
}

function validateInterruptionDisposition(value: unknown): ValidationResult<SeatDispatchInterruptionDispositionV1> {
  const errors = exact(value, ["code", "errors"], "interruption original disposition");
  if (errors.length > 0 || !plain(value) || !identifier(value.code)) {
    return {
      state: "invalid",
      code: "malformed_event",
      reasonCodes: errors.length > 0 ? errors : ["interruption original disposition code is invalid"],
    };
  }
  const dispositionErrors = arrayValues(value.errors);
  if (dispositionErrors === null || dispositionErrors.length > MAX_DISPOSITION_ERROR_COUNT) {
    return {
      state: "invalid",
      code: "malformed_event",
      reasonCodes: [`interruption original disposition errors must contain at most ${MAX_DISPOSITION_ERROR_COUNT} entries`],
    };
  }
  if (dispositionErrors.some((entry) =>
    typeof entry !== "string" || entry.length < 1 || entry.length > MAX_DISPOSITION_ERROR_LENGTH || entry.includes("\0")
  )) {
    return {
      state: "invalid",
      code: "malformed_event",
      reasonCodes: ["interruption original disposition errors are invalid"],
    };
  }
  return {
    state: "valid",
    value: {
      code: value.code,
      errors: [...dispositionErrors] as string[],
    },
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) {
    const keys = Object.keys(value).sort();
    const copied: Record<string, unknown> = {};
    for (const key of keys) {
      copied[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return copied;
  }
  return value;
}

function canonicalDigest(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function computeEventDigest(event: Omit<SeatDispatchReceiptEventV1, "entryDigest">): string {
  const { entryDigest: _discard, ...withoutDigest } = event as Omit<SeatDispatchReceiptEventV1, "entryDigest"> & { readonly entryDigest?: string };
  return `sha256:${createHash("sha256").update(`${SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION}\n${canonicalDigest(withoutDigest)}`).digest("base64url")}`;
}

function isRuntimeSelfReportObserved(
  value: SeatDispatchRuntimeSelfReport,
): value is RuntimeSelfReportObservedV1 {
  return value.kind === "runtime.self_report.observed";
}

function isRuntimeHostObserved(
  value: SeatDispatchRuntimeHostObservation,
): value is RuntimeHostObservedV1 {
  return value.kind === "runtime.host_observed";
}

function isExecutorSelfReportObserved(
  value: SeatDispatchExecutorSelfReport,
): value is ExecutorSelfReportObservedV1 {
  return value.kind === "executor.self_report.observed";
}

function isExecutorHostObserved(
  value: SeatDispatchExecutorHostObservation,
): value is ExecutorHostObservedV1 {
  return value.kind === "executor.host_observed";
}

function validateRuntimeConfigured(value: unknown): ValidationResult<RuntimeConfiguredV1> {
  const errors = exact(value, ["kind", "runtimeId", "model"], "runtime configured identity");
  if (errors.length > 0 || !plain(value)) return { state: "invalid", code: "malformed_runtime", reasonCodes: errors };
  if (value.kind !== "runtime.configured" || !identifier(value.runtimeId) || !identifier(value.model)) {
    return { state: "invalid", code: "malformed_runtime", reasonCodes: ["runtime config claim is invalid"] };
  }
  return { state: "valid", value: { kind: "runtime.configured", runtimeId: value.runtimeId, model: value.model } };
}

function validateRuntimeRequested(value: unknown): ValidationResult<RuntimeRequestedV1> {
  const errors = exact(value, ["kind", "runtimeId", "model"], "runtime requested identity");
  if (errors.length > 0 || !plain(value)) return { state: "invalid", code: "malformed_runtime", reasonCodes: errors };
  if (value.kind !== "runtime.requested" || !identifier(value.runtimeId) || !identifier(value.model)) {
    return { state: "invalid", code: "malformed_runtime", reasonCodes: ["runtime request claim is invalid"] };
  }
  return { state: "valid", value: { kind: "runtime.requested", runtimeId: value.runtimeId, model: value.model } };
}

function validateRuntimeSelfReport(value: unknown): ValidationResult<SeatDispatchRuntimeSelfReport> {
  const exactUnavailable = exact(value, ["kind", "reason"], "runtime self report");
  const exactObserved = exact(value, ["kind", "runtimeId", "model", "evidenceRefs"], "runtime self report");
  if (!plain(value) || safeIsProxy(value)) {
    return { state: "invalid", code: "malformed_runtime", reasonCodes: ["runtime self report must be a plain object."] };
  }
  if (value.kind === "runtime.self_report.unavailable") {
    if (exactUnavailable.length > 0 || value.reason !== "not_reported") {
      return { state: "invalid", code: "malformed_runtime", reasonCodes: ["runtime self report unavailable is invalid"] };
    }
    return { state: "valid", value: { kind: value.kind, reason: value.reason } };
  }
  if (value.kind === "runtime.self_report.observed") {
    if (exactObserved.length > 0 || !identifier(value.runtimeId) || !identifier(value.model)) {
      return { state: "invalid", code: "malformed_runtime", reasonCodes: ["runtime self report observed is invalid"] };
    }
    const refs = validateEvidenceRefs((value as { evidenceRefs?: unknown }).evidenceRefs, "runtime self report evidenceRefs");
    if (refs.length > 0) return { state: "invalid", code: "malformed_runtime", reasonCodes: refs };
    return {
      state: "valid",
      value: {
        kind: value.kind,
        runtimeId: value.runtimeId,
        model: value.model,
        evidenceRefs: [...((value as { evidenceRefs: readonly string[] }).evidenceRefs)],
      },
    };
  }
  return { state: "invalid", code: "malformed_runtime", reasonCodes: ["runtime self report kind is invalid"] };
}

function validateRuntimeHostObserved(value: unknown): ValidationResult<SeatDispatchRuntimeHostObservation> {
  const exactUnavailable = exact(value, ["kind", "reason"], "runtime host observation");
  const exactObserved = exact(value, ["kind", "runtimeId", "model", "evidenceRefs"], "runtime host observation");
  if (!plain(value) || safeIsProxy(value)) {
    return { state: "invalid", code: "malformed_runtime", reasonCodes: ["runtime host observation must be a plain object."] };
  }
  if (value.kind === "runtime.host_observed.unavailable") {
    if (exactUnavailable.length > 0 || value.reason !== "unobserved") {
      return { state: "invalid", code: "malformed_runtime", reasonCodes: ["runtime host unavailable is invalid"] };
    }
    return { state: "valid", value: { kind: value.kind, reason: value.reason } };
  }
  if (value.kind === "runtime.host_observed") {
    if (exactObserved.length > 0 || !identifier(value.runtimeId) || !identifier(value.model)) {
      return { state: "invalid", code: "malformed_runtime", reasonCodes: ["runtime host observed is invalid"] };
    }
    const refs = validateEvidenceRefs((value as { evidenceRefs?: unknown }).evidenceRefs, "runtime host evidenceRefs");
    if (refs.length > 0) return { state: "invalid", code: "malformed_runtime", reasonCodes: refs };
    return {
      state: "valid",
      value: {
        kind: value.kind,
        runtimeId: value.runtimeId,
        model: value.model,
        evidenceRefs: [...((value as { evidenceRefs: readonly string[] }).evidenceRefs)],
      },
    };
  }
  return { state: "invalid", code: "malformed_runtime", reasonCodes: ["runtime host kind is invalid"] };
}

function validateExecutorSelfReport(value: unknown): ValidationResult<SeatDispatchExecutorSelfReport> {
  const exactUnavailable = exact(value, ["kind", "reason"], "executor self report");
  const exactObserved = exact(value, ["kind", "executorId", "evidenceRefs"], "executor self report");
  if (!plain(value) || safeIsProxy(value)) {
    return { state: "invalid", code: "malformed_executor", reasonCodes: ["executor self report must be a plain object."] };
  }
  if (value.kind === "executor.self_report.unavailable") {
    if (exactUnavailable.length > 0 || value.reason !== "not_reported") {
      return { state: "invalid", code: "malformed_executor", reasonCodes: ["executor self report unavailable is invalid"] };
    }
    return { state: "valid", value: { kind: value.kind, reason: value.reason } };
  }
  if (value.kind === "executor.self_report.observed") {
    if (exactObserved.length > 0 || !identifier(value.executorId)) {
      return { state: "invalid", code: "malformed_executor", reasonCodes: ["executor self report observed is invalid"] };
    }
    const refs = validateEvidenceRefs((value as { evidenceRefs?: unknown }).evidenceRefs, "executor self report evidenceRefs");
    if (refs.length > 0) return { state: "invalid", code: "malformed_executor", reasonCodes: refs };
    return {
      state: "valid",
      value: {
        kind: value.kind,
        executorId: value.executorId,
        evidenceRefs: [...((value as { evidenceRefs: readonly string[] }).evidenceRefs)],
      },
    };
  }
  return { state: "invalid", code: "malformed_executor", reasonCodes: ["executor self report kind is invalid"] };
}

function validateExecutorHostObserved(value: unknown): ValidationResult<SeatDispatchExecutorHostObservation> {
  const exactUnavailable = exact(value, ["kind", "reason"], "executor host observation");
  const exactObserved = exact(value, ["kind", "executorId", "evidenceRefs"], "executor host observation");
  if (!plain(value) || safeIsProxy(value)) {
    return { state: "invalid", code: "malformed_executor", reasonCodes: ["executor host observation must be a plain object."] };
  }
  if (value.kind === "executor.host_observed.unavailable") {
    if (exactUnavailable.length > 0 || value.reason !== "not_observed") {
      return { state: "invalid", code: "malformed_executor", reasonCodes: ["executor host unavailable is invalid"] };
    }
    return { state: "valid", value: { kind: value.kind, reason: value.reason } };
  }
  if (value.kind === "executor.host_observed") {
    if (exactObserved.length > 0 || !identifier(value.executorId)) {
      return { state: "invalid", code: "malformed_executor", reasonCodes: ["executor host observed is invalid"] };
    }
    const refs = validateEvidenceRefs((value as { evidenceRefs?: unknown }).evidenceRefs, "executor host evidenceRefs");
    if (refs.length > 0) return { state: "invalid", code: "malformed_executor", reasonCodes: refs };
    return {
      state: "valid",
      value: {
        kind: value.kind,
        executorId: value.executorId,
        evidenceRefs: [...((value as { evidenceRefs: readonly string[] }).evidenceRefs)],
      },
    };
  }
  return { state: "invalid", code: "malformed_executor", reasonCodes: ["executor host kind is invalid"] };
}

function validateToolExecution(value: unknown): ValidationResult<SeatDispatchToolExecution> {
  const exactNotRequested = exact(value, ["kind", "reason"], "tool execution request");
  const exactRequested = exact(value, ["kind", "executorBindingRef"], "tool execution request");
  if (!plain(value) || safeIsProxy(value)) {
    return { state: "invalid", code: "malformed_tool_execution", reasonCodes: ["tool execution must be a plain object."] };
  }
  if (value.kind === "tool.execution.not_requested") {
    if (exactNotRequested.length > 0 || value.reason !== "not_requested") {
      return { state: "invalid", code: "malformed_tool_execution", reasonCodes: ["tool execution not requested is invalid"] };
    }
    return { state: "valid", value: { kind: value.kind, reason: value.reason } };
  }
  if (value.kind === "tool.execution.requested") {
    if (exactRequested.length > 0 || !identifier(value.executorBindingRef)) {
      return { state: "invalid", code: "malformed_tool_execution", reasonCodes: ["tool execution request is invalid"] };
    }
    return { state: "valid", value: { kind: value.kind, executorBindingRef: value.executorBindingRef } };
  }
  return { state: "invalid", code: "malformed_tool_execution", reasonCodes: ["tool execution kind is invalid"] };
}

type SeatDispatchEventKindV1 = typeof SEAT_DISPATCH_EVENT_KINDS[number];
const EVENT_KINDS = new Set<SeatDispatchEventKindV1>(SEAT_DISPATCH_EVENT_KINDS);
type SeatDispatchEventWithoutDigestV1 = Omit<SeatDispatchReceiptEventV1, "entryDigest"> & {
  readonly entryDigest?: string;
  readonly outputEvidenceRefs?: readonly string[];
  readonly recoveryEvidenceRefs?: readonly string[];
  readonly originalDisposition?: SeatDispatchInterruptionDispositionV1;
};

type SeatDispatchLifecycleEventWithoutDigestV1 = Omit<
  SeatDispatchReceiptEventInterruptedV1 | SeatDispatchReceiptEventResumedV1 | SeatDispatchReceiptEventTerminalV1,
  "entryDigest"
>;

interface SeatDispatchEventIdentityOptions {
  readonly requireDigest?: boolean;
}

function isSeatDispatchReceiptEventKind(value: unknown): value is SeatDispatchEventKindV1 {
  return typeof value === "string" && EVENT_KINDS.has(value as SeatDispatchEventKindV1);
}

function fieldsFor(kind: SeatDispatchReceiptEventV1["kind"], hasInterruptionRecoveryBinding = false): readonly string[] {
  const baseFields: string[] = [
    "schemaVersion", "contractVersion", "kind", "receiptId", "dispatchId", "parentMissionId", "parentMissionRevision",
    "repositoryRevision", "parentSessionId", "childTaskId", "childSessionId", "accountableSeatId", "repositoryId", "repositoryWorkspaceId",
    "subjectId", "subjectRevision", "artifactId", "artifactRevision", "configuredRuntime", "requestedRuntime",
    "toolExecution", "runtimeSelfReport", "runtimeHostObserved", "executorSelfReport", "executorHostObserved",
    "timestamp", "logSequence", "previousLogDigest", "lifecycleSequence", "previousLifecycleDigest", "entryDigest",
  ];
  if (kind === KIND_START) {
    baseFields.push("inputEvidenceRefs");
  }
  if (kind === KIND_COMPLETED || kind === KIND_FAILED || kind === KIND_CANCELLED) {
    baseFields.push("outputEvidenceRefs");
  }
  if (kind === KIND_INTERRUPTED && hasInterruptionRecoveryBinding) {
    baseFields.push("recoveryEvidenceRefs", "originalDisposition");
  }
  return baseFields;
}

function eventIdentityValue(
  event: SeatDispatchEventWithoutDigestV1,
  options: SeatDispatchEventIdentityOptions = {},
): ValidationResult<SeatDispatchReceiptEventV1> {
  const requireDigest = options.requireDigest !== false;
  let checkedEvent: SeatDispatchEventWithoutDigestV1;
  try {
    if (!plain(event) || safeIsProxy(event)) {
      return { state: "invalid", code: "malformed_event", reasonCodes: ["seat dispatch receipt event must be a plain object."] };
    }
    const kindDescriptor = Object.getOwnPropertyDescriptor(event, "kind");
    if (!kindDescriptor?.enumerable || !Object.hasOwn(kindDescriptor, "value") || !isSeatDispatchReceiptEventKind(kindDescriptor.value) || kindDescriptor.value === undefined) {
      return { state: "invalid", code: "malformed_event", reasonCodes: ["kind is invalid"] };
    }
    const hasRecoveryEvidenceRefs = Object.hasOwn(event, "recoveryEvidenceRefs");
    const hasOriginalDisposition = Object.hasOwn(event, "originalDisposition");
    if (hasRecoveryEvidenceRefs !== hasOriginalDisposition) {
      return {
        state: "invalid",
        code: "malformed_event",
        reasonCodes: ["interruption recovery evidence and original disposition must be supplied together"],
      };
    }
    if (kindDescriptor.value !== KIND_INTERRUPTED && hasRecoveryEvidenceRefs) {
      return {
        state: "invalid",
        code: "malformed_event",
        reasonCodes: ["interruption recovery binding is only allowed on dispatch.interrupted"],
      };
    }
    const eventFields = fieldsFor(kindDescriptor.value, hasRecoveryEvidenceRefs);
    const validationFields = requireDigest ? eventFields : eventFields.filter((field) => field !== "entryDigest");
    const errors = exact(event, validationFields, "seat dispatch receipt event");
    if (errors.length > 0) return { state: "invalid", code: "malformed_event", reasonCodes: errors };
    const checkedSnapshot: Record<string, unknown> = {};
    for (const field of validationFields) {
      const descriptor = Object.getOwnPropertyDescriptor(event, field);
      checkedSnapshot[field] = descriptor?.value;
    }
    if (requireDigest) {
      const digestDescriptor = Object.getOwnPropertyDescriptor(event, "entryDigest");
      if (!digestDescriptor || !Object.hasOwn(digestDescriptor, "value") || !digest(digestDescriptor.value)) {
        return { state: "invalid", code: "malformed_event", reasonCodes: ["entryDigest is invalid."] };
      }
      checkedSnapshot.entryDigest = digestDescriptor.value;
    }
    checkedEvent = checkedSnapshot as SeatDispatchEventWithoutDigestV1;
  } catch {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["seat dispatch receipt event is malformed"] };
  }
  const hasInterruptionRecoveryBinding = checkedEvent.kind === KIND_INTERRUPTED &&
    Object.hasOwn(checkedEvent, "recoveryEvidenceRefs") && Object.hasOwn(checkedEvent, "originalDisposition");
  const validationFields = fieldsFor(checkedEvent.kind, hasInterruptionRecoveryBinding);
  const errors = requireDigest ? exact(checkedEvent, validationFields, "seat dispatch receipt event") : [];
  if (errors.length > 0) return { state: "invalid", code: "malformed_event", reasonCodes: errors };
  if (checkedEvent.schemaVersion !== SEAT_DISPATCH_RECEIPT_SCHEMA_VERSION || checkedEvent.contractVersion !== SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["schemaVersion or contractVersion is invalid."] };
  }
  if (!isDispatchableRoleId(checkedEvent.accountableSeatId)) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["accountableSeatId is not dispatchable"] };
  }
  if (!identifier(checkedEvent.receiptId) || !identifier(checkedEvent.dispatchId) || !identifier(checkedEvent.parentMissionId) || !identifier(checkedEvent.parentSessionId)
    || !identifier(checkedEvent.childTaskId) || !identifier(checkedEvent.childSessionId) || !identifier(checkedEvent.repositoryId) || !identifier(checkedEvent.repositoryWorkspaceId)
    || !identifier(checkedEvent.subjectId) || !identifier(checkedEvent.artifactId)) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["string identifier is invalid"] };
  }
  if (
    !revision(checkedEvent.parentMissionRevision) || !revision(checkedEvent.repositoryRevision) ||
    !revision(checkedEvent.subjectRevision) || !revision(checkedEvent.artifactRevision)
  ) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["revision is invalid"] };
  }
  if (!timestamp(checkedEvent.timestamp)) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["timestamp is invalid"] };
  }
  if (!nonNegativeInteger(checkedEvent.logSequence) || !nonNegativeInteger(checkedEvent.lifecycleSequence)) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["sequences must be non-negative integers."] };
  }
  if (checkedEvent.previousLogDigest !== null && !digest(checkedEvent.previousLogDigest)) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["previousLogDigest is invalid"] };
  }
  if (checkedEvent.previousLifecycleDigest !== null && !digest(checkedEvent.previousLifecycleDigest)) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["previousLifecycleDigest is invalid"] };
  }

  const configured = validateRuntimeConfigured(checkedEvent.configuredRuntime);
  const requested = validateRuntimeRequested(checkedEvent.requestedRuntime);
  const runtimeSelfReport = validateRuntimeSelfReport(checkedEvent.runtimeSelfReport);
  const runtimeHostObserved = validateRuntimeHostObserved(checkedEvent.runtimeHostObserved);
  const executorSelfReport = validateExecutorSelfReport(checkedEvent.executorSelfReport);
  const executorHostObserved = validateExecutorHostObserved(checkedEvent.executorHostObserved);
  const toolExecution = validateToolExecution(checkedEvent.toolExecution);

  if (configured.state === "invalid") {
    return { state: "invalid", code: configured.code ?? "malformed_runtime", reasonCodes: configured.reasonCodes ?? [] };
  }
  if (requested.state === "invalid") {
    return { state: "invalid", code: requested.code ?? "malformed_runtime", reasonCodes: requested.reasonCodes ?? [] };
  }
  if (runtimeSelfReport.state === "invalid") {
    return { state: "invalid", code: runtimeSelfReport.code ?? "malformed_runtime", reasonCodes: runtimeSelfReport.reasonCodes ?? [] };
  }
  if (runtimeHostObserved.state === "invalid") {
    return { state: "invalid", code: runtimeHostObserved.code ?? "malformed_runtime", reasonCodes: runtimeHostObserved.reasonCodes ?? [] };
  }
  if (executorSelfReport.state === "invalid") {
    return { state: "invalid", code: executorSelfReport.code ?? "malformed_runtime", reasonCodes: executorSelfReport.reasonCodes ?? [] };
  }
  if (executorHostObserved.state === "invalid") {
    return { state: "invalid", code: executorHostObserved.code ?? "malformed_runtime", reasonCodes: executorHostObserved.reasonCodes ?? [] };
  }
  if (toolExecution.state === "invalid") {
    return { state: "invalid", code: toolExecution.code ?? "malformed_tool_execution", reasonCodes: toolExecution.reasonCodes ?? [] };
  }

  const sanitized = {
    ...checkedEvent,
    configuredRuntime: configured.value,
    requestedRuntime: requested.value,
    runtimeSelfReport: runtimeSelfReport.value,
    runtimeHostObserved: runtimeHostObserved.value,
    executorSelfReport: executorSelfReport.value,
    executorHostObserved: executorHostObserved.value,
    toolExecution: toolExecution.value,
  };

  const expected = computeEventDigest(sanitized as Omit<SeatDispatchReceiptEventV1, "entryDigest">);
  if (requireDigest && checkedEvent.entryDigest !== expected) {
    return { state: "invalid", code: "digest_mismatch", reasonCodes: ["entryDigest does not match event payload"] };
  }

  if ((checkedEvent.kind === KIND_COMPLETED || checkedEvent.kind === KIND_FAILED || checkedEvent.kind === KIND_CANCELLED) && !Array.isArray(checkedEvent.outputEvidenceRefs)) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["terminal event must include outputEvidenceRefs"] };
  }
  if (checkedEvent.kind === KIND_START && arrayChecks((checkedEvent as SeatDispatchReceiptEventStartedV1).inputEvidenceRefs, "input evidence").length > 0) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["started event requires inputEvidenceRefs"] };
  }
  if (checkedEvent.kind !== KIND_START && Object.hasOwn(checkedEvent, "inputEvidenceRefs")) {
    return { state: "invalid", code: "malformed_event", reasonCodes: ["inputEvidenceRefs only allowed on dispatch.started"] };
  }
  if (checkedEvent.kind !== KIND_COMPLETED && checkedEvent.kind !== KIND_FAILED && checkedEvent.kind !== KIND_CANCELLED && Object.hasOwn(checkedEvent, "outputEvidenceRefs")) {
    return { state: "invalid", code: "output_evidence_misplacement", reasonCodes: ["outputEvidenceRefs only allowed on terminal events"] };
  }
  if ((checkedEvent.kind === KIND_COMPLETED || checkedEvent.kind === KIND_FAILED || checkedEvent.kind === KIND_CANCELLED)) {
    const refs = validateEvidenceRefs((checkedEvent as SeatDispatchReceiptEventTerminalV1).outputEvidenceRefs, "output evidence");
    if (refs.length > 0) return { state: "invalid", code: "malformed_event", reasonCodes: refs };
  }
  if (checkedEvent.kind === KIND_INTERRUPTED && hasInterruptionRecoveryBinding) {
    const refs = validateEvidenceRefs(checkedEvent.recoveryEvidenceRefs, "recovery evidence");
    if (refs.length > 0 || checkedEvent.recoveryEvidenceRefs?.length === 0) {
      return {
        state: "invalid",
        code: "malformed_event",
        reasonCodes: refs.length > 0 ? refs : ["interrupted event recoveryEvidenceRefs must not be empty"],
      };
    }
    const disposition = validateInterruptionDisposition(checkedEvent.originalDisposition);
    if (disposition.state === "invalid" || disposition.value === undefined) {
      return {
        state: "invalid",
        code: disposition.code ?? "malformed_event",
        reasonCodes: disposition.reasonCodes ?? ["interruption original disposition is invalid"],
      };
    }
    sanitized.recoveryEvidenceRefs = [...(checkedEvent.recoveryEvidenceRefs ?? [])];
    sanitized.originalDisposition = disposition.value;
  }

  return {
    state: "valid",
    value: {
      ...sanitized,
      entryDigest: requireDigest ? (checkedEvent.entryDigest ?? expected) : expected,
    } as SeatDispatchReceiptEventV1,
  };
}

const TERMINAL_STATES: ReadonlySet<SeatDispatchLifecycleStateV1> = new Set(["completed", "failed", "cancelled"]);

function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copy(item)) as T;
  if (plain(value)) {
    const copied: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable && Object.hasOwn(descriptor, "value")) {
        copied[key] = copy(descriptor.value);
      }
    }
    return Object.freeze(copied) as T;
  }
  return value;
}

function readFieldValues(value: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (!plain(value) || safeIsProxy(value)) return null;
  try {
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
        return null;
      }
      values[field] = descriptor.value;
    }
    return values;
  } catch {
    return null;
  }
}

function freezeDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
    return Object.freeze(value);
  }
  if (plain(value)) {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable && Object.hasOwn(descriptor, "value")) freezeDeep(descriptor.value);
    }
    return Object.freeze(value);
  }
  return value;
}

function toLifecycleState(kind: SeatDispatchReceiptEventV1["kind"]): SeatDispatchLifecycleStateV1 {
  if (kind === KIND_START) return "started";
  if (kind === KIND_INTERRUPTED) return "interrupted";
  if (kind === KIND_RESUMED) return "resumed";
  if (kind === KIND_COMPLETED) return "completed";
  if (kind === KIND_FAILED) return "failed";
  return "cancelled";
}

function transitionAllowed(previous: SeatDispatchLifecycleStateV1, next: SeatDispatchLifecycleStateV1): boolean {
  if (previous === "started") return next === "interrupted" || next === "completed" || next === "failed" || next === "cancelled";
  if (previous === "interrupted") return next === "resumed" || next === "failed" || next === "cancelled";
  if (previous === "resumed") return next === "interrupted" || next === "completed" || next === "failed" || next === "cancelled";
  return false;
}

function sameRuntime(left: { runtimeId: string; model: string }, right: { runtimeId: string; model: string }) {
  return left.runtimeId === right.runtimeId && left.model === right.model;
}

interface ReceiptStore {
  readonly projection: SeatDispatchReceiptProjectionV1;
}

function seedProjection(event: SeatDispatchReceiptEventStartedV1): SeatDispatchReceiptProjectionV1 {
  return {
    schemaVersion: SEAT_DISPATCH_RECEIPT_SCHEMA_VERSION,
    contractVersion: SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION,
    receiptId: event.receiptId,
    dispatchId: event.dispatchId,
    parentMissionId: event.parentMissionId,
    parentMissionRevision: event.parentMissionRevision,
    repositoryRevision: event.repositoryRevision,
    parentSessionId: event.parentSessionId,
    childTaskId: event.childTaskId,
    childSessionId: event.childSessionId,
    accountableSeatId: event.accountableSeatId,
    repositoryId: event.repositoryId,
    repositoryWorkspaceId: event.repositoryWorkspaceId,
    subjectId: event.subjectId,
    subjectRevision: event.subjectRevision,
    artifactId: event.artifactId,
    artifactRevision: event.artifactRevision,
    configuredRuntime: event.configuredRuntime,
    requestedRuntime: event.requestedRuntime,
    toolExecution: event.toolExecution,
    state: "started",
    startedAt: event.timestamp,
    lastEventTimestamp: event.timestamp,
    logSequence: event.logSequence,
    lastEntryDigest: event.entryDigest,
    previousLogDigest: event.previousLogDigest,
    lifecycleSequence: event.lifecycleSequence,
    previousLifecycleDigest: event.previousLifecycleDigest,
    runtimeSelfReportHistory: isRuntimeSelfReportObserved(event.runtimeSelfReport) ? [event.runtimeSelfReport] : [],
    runtimeHostHistory: isRuntimeHostObserved(event.runtimeHostObserved) ? [event.runtimeHostObserved] : [],
    executorSelfReportHistory: isExecutorSelfReportObserved(event.executorSelfReport) ? [event.executorSelfReport] : [],
    executorHostHistory: isExecutorHostObserved(event.executorHostObserved) ? [event.executorHostObserved] : [],
    inputEvidenceRefs: event.inputEvidenceRefs,
    outputEvidenceRefs: null,
    recoveryEvidenceRefs: null,
    originalDisposition: null,
  };
}

function sameIdentity(event: SeatDispatchReceiptEventV1, projection: SeatDispatchReceiptProjectionV1): boolean {
  if (
    event.receiptId !== projection.receiptId ||
    event.dispatchId !== projection.dispatchId ||
    event.parentMissionId !== projection.parentMissionId ||
    event.parentMissionRevision !== projection.parentMissionRevision ||
    event.parentSessionId !== projection.parentSessionId ||
    event.childTaskId !== projection.childTaskId ||
    event.childSessionId !== projection.childSessionId ||
    event.accountableSeatId !== projection.accountableSeatId ||
    event.repositoryId !== projection.repositoryId ||
    event.repositoryWorkspaceId !== projection.repositoryWorkspaceId ||
    event.repositoryRevision !== projection.repositoryRevision ||
    event.subjectId !== projection.subjectId ||
    event.subjectRevision !== projection.subjectRevision ||
    event.artifactId !== projection.artifactId ||
    event.artifactRevision !== projection.artifactRevision
  ) {
    return false;
  }
  return canonicalDigest(event.configuredRuntime) === canonicalDigest(projection.configuredRuntime)
    && canonicalDigest(event.requestedRuntime) === canonicalDigest(projection.requestedRuntime)
    && canonicalDigest(event.toolExecution) === canonicalDigest(projection.toolExecution);
}

function appendRuntimeObserved(history: readonly RuntimeSelfReportObservedV1[], next: SeatDispatchRuntimeSelfReport): [readonly RuntimeSelfReportObservedV1[] | null, SeatDispatchReplayFailureCode | null, string[]] {
  if (next.kind !== "runtime.self_report.observed") return [null, null, []];
  if (history.length > 0 && !sameRuntime(history[history.length - 1], next)) {
    return [null, "identity_mismatch", ["Runtime self-report changed in lifecycle."]];
  }
  return [[...history, next], null, []];
}

function appendRuntimeHostObserved(history: readonly RuntimeHostObservedV1[], next: SeatDispatchRuntimeHostObservation): [readonly RuntimeHostObservedV1[] | null, SeatDispatchReplayFailureCode | null, string[]] {
  if (next.kind !== "runtime.host_observed") return [null, null, []];
  if (history.length > 0 && !sameRuntime(history[history.length - 1], next)) {
    return [null, "identity_mismatch", ["Runtime host observation changed in lifecycle."]];
  }
  return [[...history, next], null, []];
}

function appendExecutorSelfObserved(
  history: readonly ExecutorSelfReportObservedV1[],
  next: SeatDispatchExecutorSelfReport,
): [readonly ExecutorSelfReportObservedV1[] | null, SeatDispatchReplayFailureCode | null, string[]] {
  if (next.kind !== "executor.self_report.observed") return [null, null, []];
  if (history.length > 0 && history[history.length - 1].executorId !== next.executorId) {
    return [null, "identity_mismatch", ["Executor self report changed in lifecycle."]];
  }
  return [[...history, next], null, []];
}

function appendExecutorHostObserved(
  history: readonly ExecutorHostObservedV1[],
  next: SeatDispatchExecutorHostObservation,
): [readonly ExecutorHostObservedV1[] | null, SeatDispatchReplayFailureCode | null, string[]] {
  if (next.kind !== "executor.host_observed") return [null, null, []];
  if (history.length > 0 && history[history.length - 1].executorId !== next.executorId) {
    return [null, "identity_mismatch", ["Executor host observation changed in lifecycle."]];
  }
  return [[...history, next], null, []];
}

function toProjection(event: SeatDispatchReceiptEventV1, current: SeatDispatchReceiptProjectionV1): ValidationResult<SeatDispatchReceiptProjectionV1> {
  const state = toLifecycleState(event.kind);
  const [runtimeSelfReportHistory, rsCode, rsErrors] = appendRuntimeObserved(current.runtimeSelfReportHistory, event.runtimeSelfReport);
  const [runtimeHostHistory, rhCode, rhErrors] = appendRuntimeHostObserved(current.runtimeHostHistory, event.runtimeHostObserved);
  const [executorSelfHistory, esCode, esErrors] = appendExecutorSelfObserved(current.executorSelfReportHistory, event.executorSelfReport);
  const [executorHostHistory, ehCode, ehErrors] = appendExecutorHostObserved(current.executorHostHistory, event.executorHostObserved);
  if (rsCode || rhCode || esCode || ehCode) {
    return {
      state: "invalid",
      code: (rsCode ?? rhCode ?? esCode ?? ehCode) as SeatDispatchReplayFailureCode,
      reasonCodes: [...rsErrors, ...rhErrors, ...esErrors, ...ehErrors],
    };
  }
  return { state: "valid", value: {
    ...current,
    state,
    lastEventTimestamp: event.timestamp,
    logSequence: event.logSequence,
    lastEntryDigest: event.entryDigest,
    previousLogDigest: event.previousLogDigest,
    lifecycleSequence: event.lifecycleSequence,
    previousLifecycleDigest: event.previousLifecycleDigest,
    runtimeSelfReportHistory: runtimeSelfReportHistory ?? current.runtimeSelfReportHistory,
    runtimeHostHistory: runtimeHostHistory ?? current.runtimeHostHistory,
    executorSelfReportHistory: executorSelfHistory ?? current.executorSelfReportHistory,
    executorHostHistory: executorHostHistory ?? current.executorHostHistory,
    outputEvidenceRefs: state === "completed" || state === "failed" || state === "cancelled"
      ? (event as SeatDispatchReceiptEventTerminalV1).outputEvidenceRefs
      : current.outputEvidenceRefs,
    recoveryEvidenceRefs: event.kind === KIND_INTERRUPTED && event.recoveryEvidenceRefs !== undefined
      ? event.recoveryEvidenceRefs
      : current.recoveryEvidenceRefs,
    originalDisposition: event.kind === KIND_INTERRUPTED && event.originalDisposition !== undefined
      ? event.originalDisposition
      : current.originalDisposition,
  } };
}

export function createSeatDispatchStartedEventV1(
  input: Omit<SeatDispatchReceiptEventStartedV1, "schemaVersion" | "contractVersion" | "kind" | "entryDigest">,
): SeatDispatchReceiptEventStartedV1 {
  const baseFields = fieldsFor(KIND_START).filter((field) =>
    field !== "schemaVersion" && field !== "contractVersion" && field !== "kind" && field !== "entryDigest"
  );
  const baseErrors = exact(input, baseFields, "seat dispatch started event");
  if (baseErrors.length > 0) {
    throw new Error("invalid seat dispatch started event");
  }
  const values = readFieldValues(input, baseFields);
  if (values === null) {
    throw new Error("invalid seat dispatch started event");
  }
  const candidate: Omit<SeatDispatchReceiptEventStartedV1, "entryDigest"> = {
    ...values,
    schemaVersion: SEAT_DISPATCH_RECEIPT_SCHEMA_VERSION,
    contractVersion: SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION,
    kind: KIND_START,
  } as Omit<SeatDispatchReceiptEventStartedV1, "entryDigest">;
  const valid = eventIdentityValue(candidate, { requireDigest: false });
  if (valid.state === "invalid") {
    throw new Error(`invalid seat dispatch started event: ${valid.code}`);
  }
  return freezeDeep(copy(valid.value)) as SeatDispatchReceiptEventStartedV1;
}

export function createSeatDispatchLifecycleEventV1(
  input: Omit<SeatDispatchReceiptEventInterruptedV1 & SeatDispatchReceiptEventResumedV1 & SeatDispatchReceiptEventTerminalV1,
  "schemaVersion" | "contractVersion" | "entryDigest">,
): SeatDispatchReceiptEventInterruptedV1 | SeatDispatchReceiptEventResumedV1 | SeatDispatchReceiptEventTerminalV1 {
  const inputKind = (readFieldValues(input, ["kind"]) as { kind: string } | null)?.kind;
  if (!isSeatDispatchReceiptEventKind(inputKind) || inputKind === KIND_START) {
    throw new Error("invalid lifecycle event kind");
  }
  const hasInterruptionRecoveryBinding = inputKind === KIND_INTERRUPTED &&
    plain(input) && Object.hasOwn(input, "recoveryEvidenceRefs") && Object.hasOwn(input, "originalDisposition");
  const baseFields = fieldsFor(inputKind, hasInterruptionRecoveryBinding).filter((field) =>
    field !== "schemaVersion" && field !== "contractVersion" && field !== "entryDigest"
  );
  const baseErrors = exact(input, baseFields, "seat dispatch lifecycle event");
  if (baseErrors.length > 0) {
    throw new Error("invalid seat dispatch lifecycle event");
  }
  const values = readFieldValues(input, baseFields);
  if (values === null) {
    throw new Error("invalid seat dispatch lifecycle event");
  }
  const candidate = {
    ...values,
    schemaVersion: SEAT_DISPATCH_RECEIPT_SCHEMA_VERSION,
    contractVersion: SEAT_DISPATCH_RECEIPT_CONTRACT_VERSION,
  } as SeatDispatchEventWithoutDigestV1;
  const valid = eventIdentityValue(candidate, { requireDigest: false });
  if (valid.state === "invalid") {
    throw new Error("invalid seat dispatch lifecycle event: " + valid.code);
  }
  return freezeDeep(copy(valid.value)) as
    | SeatDispatchReceiptEventInterruptedV1
    | SeatDispatchReceiptEventResumedV1
    | SeatDispatchReceiptEventTerminalV1;
}

export function replaySeatDispatchReceiptsV1(input: unknown): SeatDispatchReplayResult {
  const logEntries = arrayValues(input);
  if (logEntries === null) {
    return { state: "invalid", code: "malformed_log", reasonCodes: ["receipt log must be a plain array"] };
  }

  const receipts = new Map<string, SeatDispatchReceiptProjectionV1>();
  const seen = new Set<string>();
  const dispatchForReceipt = new Map<string, string>();
  const receiptForDispatch = new Map<string, string>();
  const receiptForTask = new Map<string, string>();
  const receiptForSession = new Map<string, string>();
  const replayEntries: SeatDispatchReceiptEventV1[] = [];

  for (let index = 0; index < logEntries.length; index += 1) {
    const raw = logEntries[index];
    const checked = eventIdentityValue(raw as SeatDispatchEventWithoutDigestV1);
    if (checked.state === "invalid") {
      return { state: "invalid", code: checked.code as SeatDispatchReplayFailureCode, reasonCodes: checked.reasonCodes ?? [] };
    }
    const event = checked.value as SeatDispatchReceiptEventV1;

    if (seen.has(event.entryDigest)) {
      return { state: "invalid", code: "duplicate_event", reasonCodes: ["entryDigest is duplicated"] };
    }

    if (index === 0) {
      if (event.logSequence !== 0 || event.previousLogDigest !== null) {
        return { state: "invalid", code: "global_sequence_gap", reasonCodes: ["global chain must start at sequence 0 with null previous"] };
      }
    } else {
      const previous = replayEntries[index - 1];
      if (event.logSequence !== previous.logSequence + 1) {
        return { state: "invalid", code: "global_sequence_gap", reasonCodes: ["global log sequence gap detected"] };
      }
      if (event.previousLogDigest !== previous.entryDigest) {
        return { state: "invalid", code: "global_previous_digest", reasonCodes: ["global log digest chain broken"] };
      }
    }

    const current = receipts.get(event.receiptId);
    if (!current) {
      if (event.kind !== KIND_START) {
        return { state: "invalid", code: "identity_mismatch", reasonCodes: ["receipt must start with dispatch.started"] };
      }
      if (event.previousLifecycleDigest !== null || event.lifecycleSequence !== 0) {
        return { state: "invalid", code: "lifecycle_sequence_gap", reasonCodes: ["first lifecycle entry must have null previous"] };
      }
      const mappedDispatch = dispatchForReceipt.get(event.receiptId);
      const mappedReceipt = receiptForDispatch.get(event.dispatchId);
      if (mappedDispatch !== undefined && mappedDispatch !== event.dispatchId) {
        return { state: "invalid", code: "receipt_dispatch_collision", reasonCodes: ["dispatch id changed for receipt"] };
      }
      if (mappedReceipt !== undefined && mappedReceipt !== event.receiptId) {
        return { state: "invalid", code: "receipt_dispatch_collision", reasonCodes: ["dispatch id reused by another receipt"] };
      }
      if (receiptForTask.get(event.childTaskId) !== undefined) {
        const existingByTask = receiptForTask.get(event.childTaskId);
        if (existingByTask !== undefined && existingByTask !== event.receiptId) {
          return { state: "invalid", code: "child_task_reuse", reasonCodes: ["child task reused across receipts"] };
        }
      }
      if (receiptForSession.get(event.childSessionId) !== undefined) {
        const existingBySession = receiptForSession.get(event.childSessionId);
        if (existingBySession !== undefined && existingBySession !== event.receiptId) {
          return { state: "invalid", code: "child_session_reuse", reasonCodes: ["child session reused across receipts"] };
        }
      }
      receipts.set(event.receiptId, seedProjection(event));
      dispatchForReceipt.set(event.receiptId, event.dispatchId);
      receiptForDispatch.set(event.dispatchId, event.receiptId);
      receiptForTask.set(event.childTaskId, event.receiptId);
      receiptForSession.set(event.childSessionId, event.receiptId);
      replayEntries.push(event);
      seen.add(event.entryDigest);
      continue;
    }

    if (event.kind === KIND_START) {
      return { state: "invalid", code: "duplicate_start", reasonCodes: ["receipt already started"] };
    }

    if (dispatchForReceipt.get(event.receiptId) !== event.dispatchId || receiptForDispatch.get(event.dispatchId) !== event.receiptId) {
      return { state: "invalid", code: "receipt_dispatch_collision", reasonCodes: ["dispatch id mismatch for existing receipt"] };
    }

    if (current.lifecycleSequence + 1 !== event.lifecycleSequence) {
      return { state: "invalid", code: "lifecycle_sequence_gap", reasonCodes: ["lifecycle sequence gap detected"] };
    }
    if ((current.state !== "completed" && current.state !== "failed" && current.state !== "cancelled" && !transitionAllowed(current.state, toLifecycleState(event.kind))) || TERMINAL_STATES.has(current.state)) {
      return {
        state: "invalid",
        code: TERMINAL_STATES.has(current.state) ? "post_terminal" : "illegal_transition",
        reasonCodes: ["illegal lifecycle transition"] ,
      };
    }
    if (!Object.hasOwn(event, "timestamp") || Date.parse(event.timestamp) < Date.parse(current.lastEventTimestamp)) {
      return { state: "invalid", code: "timestamp_regression", reasonCodes: ["timestamp regression detected"] };
    }
    if (!sameIdentity(event, current)) {
      return { state: "invalid", code: "identity_mismatch", reasonCodes: ["immutable identity mismatch"] };
    }
    if (event.previousLifecycleDigest !== current.lastEntryDigest) {
      return { state: "invalid", code: "lifecycle_previous_digest", reasonCodes: ["lifecycle digest chain broken"] };
    }

    const nextProjection = toProjection(event, current);
    if (nextProjection.state === "invalid") {
      return {
        state: "invalid",
        code: nextProjection.code as SeatDispatchReplayFailureCode,
        reasonCodes: nextProjection.reasonCodes ?? [],
      };
    }

    receipts.set(event.receiptId, freezeDeep(copy(nextProjection.value)) as SeatDispatchReceiptProjectionV1);
    replayEntries.push(event);
    seen.add(event.entryDigest);
  }

  const frozenProjections = [...receipts.values()].map((projection) => freezeDeep(copy(projection)) as SeatDispatchReceiptProjectionV1);
  return {
    state: "valid",
    entries: freezeDeep(copy(replayEntries)) as readonly SeatDispatchReceiptEventV1[],
    projections: freezeDeep(frozenProjections) as readonly SeatDispatchReceiptProjectionV1[],
  };
}

function hasAny<T>(items: readonly T[], value: T): boolean {
  return items.some((item) => item === value);
}

export function evaluateSeatDispatchAttributionV1<T>(input: SeatDispatchAttributionInput<T>): SeatDispatchAttributionResult<T> {
  const replay = input.replayResult !== undefined
    ? (input.replayResult.state === "valid"
      ? replaySeatDispatchReceiptsV1(input.replayResult.entries)
      : { state: "invalid", code: "malformed_log", reasonCodes: ["malformed_raw_log"] } as SeatDispatchReplayResult)
    : replaySeatDispatchReceiptsV1(input.rawReceiptEntries);
  if (replay.state === "invalid") {
    return {
      state: "unattributed",
      artifact: input.artifact,
      reasonCodes: Object.freeze(["malformed_raw_log"]),
    };
  }

  let candidates = replay.projections.filter((entry) =>
    entry.receiptId !== "" &&
    entry.dispatchId !== "" &&
    entry.parentMissionId === input.parentMissionId &&
    entry.parentMissionRevision === input.parentMissionRevision &&
    entry.repositoryRevision === input.repositoryRevision &&
    entry.parentSessionId === input.parentSessionId &&
    entry.childTaskId === input.childTaskId &&
    entry.childSessionId === input.childSessionId &&
    entry.accountableSeatId === input.accountableSeatId &&
    entry.repositoryId === input.repositoryId &&
    entry.repositoryWorkspaceId === input.repositoryWorkspaceId &&
    entry.subjectId === input.subjectId &&
    entry.subjectRevision === input.subjectRevision &&
    entry.artifactId === input.artifactId &&
    entry.artifactRevision === input.artifactRevision
  );

  if (candidates.length === 0) {
    const reasonCodes = new Set<SeatDispatchAttributionReason>();
    if (!hasAny(replay.projections.map((entry) => entry.parentMissionRevision), input.parentMissionRevision)) {
      reasonCodes.add("stale_mission_revision");
    }
    if (!hasAny(replay.projections.map((entry) => entry.repositoryRevision), input.repositoryRevision)) {
      reasonCodes.add("stale_repository_revision");
    }
    if (!hasAny(replay.projections.map((entry) => entry.subjectRevision), input.subjectRevision)) {
      reasonCodes.add("stale_subject_revision");
    }
    if (!hasAny(replay.projections.map((entry) => entry.artifactRevision), input.artifactRevision)) {
      reasonCodes.add("stale_artifact_revision");
    }
    if (!hasAny(replay.projections.map((entry) => entry.artifactId), input.artifactId)) {
      reasonCodes.add("wrong_artifact_id");
    }
    if (!hasAny(replay.projections.map((entry) => entry.repositoryId), input.repositoryId)) {
      reasonCodes.add("wrong_repository");
    }
    if (!hasAny(replay.projections.map((entry) => entry.repositoryWorkspaceId), input.repositoryWorkspaceId)) {
      reasonCodes.add("wrong_workspace");
    }
    if (!hasAny(replay.projections.map((entry) => entry.parentSessionId), input.parentSessionId)) {
      reasonCodes.add("wrong_parent_session");
    }
    if (!hasAny(replay.projections.map((entry) => `${entry.childTaskId}/${entry.childSessionId}`), `${input.childTaskId}/${input.childSessionId}`)) {
      reasonCodes.add("wrong_child_session");
    }
    if (!hasAny(replay.projections.map((entry) => entry.accountableSeatId), input.accountableSeatId)) {
      reasonCodes.add("forged_seat_label");
    }
    if (reasonCodes.size === 0) reasonCodes.add("missing_receipt");
    return {
      state: "unattributed",
      artifact: input.artifact,
      reasonCodes: Object.freeze([...reasonCodes]),
    };
  }

  candidates = candidates.filter((entry) => entry.accountableSeatId === input.accountableSeatId);
  if (candidates.length > 1) {
    return { state: "unattributed", artifact: input.artifact, reasonCodes: Object.freeze(["conflicting_receipt"]) };
  }

  const [candidate] = candidates;
  if (candidate.state !== "completed") {
    return { state: "unattributed", artifact: input.artifact, reasonCodes: Object.freeze(["non_terminal_lifecycle"]) };
  }
  if (candidate.runtimeHostHistory.length === 0) {
    return { state: "unattributed", artifact: input.artifact, reasonCodes: Object.freeze(["missing_runtime_observation"]) };
  }
  if (candidate.toolExecution.kind === "tool.execution.requested" && candidate.executorHostHistory.length === 0) {
    return { state: "unattributed", artifact: input.artifact, reasonCodes: Object.freeze(["missing_executor_observation"]) };
  }

  return {
    state: "attributed",
    artifact: input.artifact,
    receipt: candidate,
    reasonCodes: Object.freeze([]),
  };
}
