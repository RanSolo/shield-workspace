import type { PermissionAuditRecord, PermissionAuditReceipt } from "../dist/permission-audit-v1.mjs";
import type { PermissionInvocationContext } from "../dist/permission-v1.mjs";
import type { RunnerCyclePlan, RunnerPermissionDecision } from "../dist/runner-v1.mjs";

export interface LocalToolSessionRequest {
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  sessionId: string;
  repositoryRoot: string;
}

export interface LocalToolCallRequest {
  sessionId: string;
  toolCallId: string;
  toolName: "readFile" | "listFiles" | "searchRepo";
  actionId: "repository.read_file" | "repository.list_files" | "repository.search";
  effectClass: "verification";
  capability: "filesystem_read" | "filesystem_list" | "filesystem_search";
}

export interface BrokerEvent {
  brokerEventSchemaVersion: 1;
  authority: "non_authoritative";
  eventId: string;
  sessionId: string;
  code: string;
  counter: number;
  toolCallId: string | null;
  cycleId: string | null;
  decisionId: string | null;
  evidenceRefs: readonly string[];
}

export interface LocalToolSessionDependencies {
  ledgerId: string;
  repositoryId: string;
  toolExecutorId: string;
  apiToken?: string;
  fetchImpl?: typeof fetch;
  getRgExecutable(): string | Promise<string>;
  monotonicNow(): number;
  nextCallSlot(request: Readonly<LocalToolCallRequest>): RunnerCyclePlan | Promise<RunnerCyclePlan>;
  getAuthorizationContext(plan: RunnerCyclePlan): PermissionInvocationContext | Promise<PermissionInvocationContext>;
  getExecutionContext(decision: RunnerPermissionDecision): PermissionInvocationContext | Promise<PermissionInvocationContext>;
  appendIfAbsent(record: PermissionAuditRecord): PermissionAuditReceipt | Promise<PermissionAuditReceipt>;
  nextResultRecordId(decision: RunnerPermissionDecision): string;
  appendBrokerEvent(event: BrokerEvent): { eventId: string; appended: true } | Promise<{ eventId: string; appended: true }>;
  now(): string;
}

export interface LocalToolSessionResult {
  message: string;
  attribution: "untrusted_model_output";
  completedToolCalls: number;
  releasedBytes: number;
}

export interface LocalToolModelProbe {
  origin: string;
  loadedInstanceId: string;
}

export const LOCAL_TOOL_LIMITS: Readonly<Record<string, number>>;
export const DAISY_TOOL_MAPPINGS: Readonly<Record<string, Readonly<{ actionId: string; effectClass: "verification"; capability: string }>>>;
export const DAISY_TOOL_DEFINITIONS: readonly Readonly<Record<string, unknown>>[];

export function probeLocalToolModel(input: {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
  apiToken?: string;
  timeoutMs?: number;
}): Promise<LocalToolModelProbe>;

export function runLocalToolSession(
  request: LocalToolSessionRequest,
  dependencies: LocalToolSessionDependencies,
): Promise<LocalToolSessionResult>;

export interface MayToolCallRequest {
  sessionId: string;
  toolCallId: string;
  toolName: "writeFile" | "runValidation";
  arguments: string;
  repositoryRoot: string;
  baseRevision: string;
}

export interface MayToolSlotRequest {
  sessionId: string;
  toolCallId: string;
  toolName: "writeFile" | "runValidation";
  actionId: "repository.write_file" | "repository.run_validation";
  effectClass: "behavioral_implementation" | "verification";
  capability: "filesystem_write" | "process_execute";
  effectKey: string;
}

export interface MayValidationCommand {
  commandId: string;
  executable: string;
  args: string[];
  timeoutMs: number;
}

export interface MayToolExecutorDependencies {
  ledgerId: string;
  repositoryId: string;
  reasoningRuntimeId: string;
  toolExecutorId: string;
  approvedFiles: string[];
  validationCommands: MayValidationCommand[];
  monotonicNow?(): number;
  nextCallSlot(request: Readonly<MayToolSlotRequest>): RunnerCyclePlan | Promise<RunnerCyclePlan>;
  getAuthorizationContext(plan: RunnerCyclePlan): PermissionInvocationContext | Promise<PermissionInvocationContext>;
  getExecutionContext(decision: RunnerPermissionDecision): PermissionInvocationContext | Promise<PermissionInvocationContext>;
  appendIfAbsent(record: PermissionAuditRecord): PermissionAuditReceipt | Promise<PermissionAuditReceipt>;
  nextResultRecordId(decision: RunnerPermissionDecision): string;
  now(): string;
  readWorkspaceRevision(canonicalRoot: string): string | Promise<string>;
  readWorkspaceStatus(canonicalRoot: string): string[] | Promise<string[]>;
  nextTemporaryName(request: Readonly<Pick<MayToolCallRequest, "sessionId" | "toolCallId">>): string;
}

export interface MayControlLoopRequest {
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  sessionId: string;
  repositoryRoot: string;
  baseRevision: string;
}

export interface MayControlEvent {
  mayControlEventSchemaVersion: 1;
  authority: "non_authoritative";
  eventId: string;
  sessionId: string;
  code: string;
  counter: number;
  toolCallId: string | null;
  evidenceRefs: readonly string[];
}

export interface MayControlLoopDependencies extends MayToolExecutorDependencies {
  apiToken?: string;
  fetchImpl?: typeof fetch;
  appendControlEvent(event: MayControlEvent): { eventId: string; appended: true } | Promise<{ eventId: string; appended: true }>;
}

export interface MayFileWriteResult {
  state: "completed";
  code: "file_written";
  path: string;
  bytes: number;
  sha256: string;
  attribution: "host_observed_tool_result";
}

export interface MayValidationResult {
  state: "completed";
  code: "validation_completed";
  commandId: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  attribution: "host_observed_tool_result";
}

export interface MayControlLoopResult {
  message: string;
  attribution: "untrusted_model_output";
  completedToolCalls: number;
  writeCalls: number;
  validationCalls: number;
  releasedBytes: number;
}

export const MAY_CONTROL_LOOP_LIMITS: Readonly<Record<string, number>>;
export const MAY_EXECUTOR_LIMITS: Readonly<Record<string, number>>;
export const MAY_TOOL_MAPPINGS: Readonly<Record<string, Readonly<{ actionId: string; effectClass: "behavioral_implementation" | "verification"; capability: string }>>>;
export const MAY_TOOL_DEFINITIONS: readonly Readonly<Record<string, unknown>>[];

export function runMayToolCall(
  request: MayToolCallRequest,
  dependencies: MayToolExecutorDependencies,
): Promise<MayFileWriteResult | MayValidationResult>;

export function runMayControlLoop(
  request: MayControlLoopRequest,
  dependencies: MayControlLoopDependencies,
): Promise<MayControlLoopResult>;
