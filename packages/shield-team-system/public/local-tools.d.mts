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
  rgExecutable: string;
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
}): Promise<LocalToolModelProbe>;

export function runLocalToolSession(
  request: LocalToolSessionRequest,
  dependencies: LocalToolSessionDependencies,
): Promise<LocalToolSessionResult>;
