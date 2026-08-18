import { execFile as execFileNode } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import type { CopilotClient, CopilotSession, PermissionRequest, SessionEvent, StdioRuntimeConnection, Tool } from "@github/copilot-sdk";
import { validateTransitionPlanV1OrV2, type TransitionPlanV1OrV2 } from "@shield/mission-preparation";

import { parseShieldConfig } from "./config.mjs";
import {
  buildMissionTransitionPlanReviewV1,
  validateMissionTransitionPlanReviewV1,
  type MissionTransitionPlanReviewV1,
} from "./mission-preparation-host-v1.mjs";
import { journalByteSha256, readMissionJournalForDisplay, resolveSupervisedMissionPaths } from "./mission-store.mjs";
import { canonicalJson } from "./mission-v2.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  type SeatDispatchReceiptProjectionV1,
  type SeatDispatchRuntimeHostObservation,
  type SeatDispatchExecutorHostObservation,
} from "./seat-dispatch-receipt-v1.mjs";
import {
  appendSeatDispatchReceiptEntryV1,
  claimSeatDispatchPacketV1,
  readSeatDispatchReceiptLedgerV1,
  resolveSeatDispatchStorePathsReadOnlyV1,
  SEAT_DISPATCH_RECEIPTS_LOG_RELATIVE_PATH,
  type SeatDispatchPacketClaimContractResultV1,
} from "./seat-dispatch-store.mjs";

export const COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION = "shield.copilot-fury-plan-dispatch.request.v1" as const;
export const COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION = "shield.copilot-fury-plan-result.v1" as const;
export const COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION = "shield.copilot-fury-plan-dispatch.evidence.v1" as const;
export const COPILOT_FURY_PLAN_DISPATCH_SUCCESSOR_EVIDENCE_CONTRACT_VERSION = "shield.copilot-fury-plan-dispatch.evidence.v2" as const;
export const COPILOT_FURY_PLAN_DISPATCH_SUCCESSOR_EVIDENCE_CONTRACT_VERSION_V3 = "shield.copilot-fury-plan-dispatch.evidence.v3" as const;
export const COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION = "1.0.11" as const;
export const COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID = "github-copilot-sdk:1.0.11" as const;
export const COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID = "copilot-agent" as const;
export const COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_ROOT = ".shield/audit/copilot-fury-plan-dispatch" as const;
export const COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF = ".github/agents/fury.agent.md" as const;
export const COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF = "user://agents/fury.agent.md" as const;
export const COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS = Object.freeze(["read", "search"] as const);
export const COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS = Object.freeze([] as const);
export const COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS = Object.freeze(["PASS", "REVISE", "cancelled", "failed"] as const);
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERY_PROTOCOL = "copilot-fury-empty-mode-recovery-v1" as const;
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID = "receipt:Y40rTRNdpEsqc9t24wRZ470R0zzYyk5G" as const;
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_SUCCESSOR_RECEIPT_ID = "receipt:3joci3m8iFvPsfeyceBy8b3uH8dfv111" as const;
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RESULT_RECEIPT_ID = "receipt:F4ZxcVBIKQJanHcOfEdTkzOHGS6IdNZ9" as const;
export const COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION = "shield.copilot-fury-dispatch-capability.v1" as const;

export type CopilotFuryDispatchCapabilityReasonV1 =
  | "invalid_input"
  | "repository_unavailable"
  | "expected_head_mismatch"
  | "workspace_dirty"
  | "fury_card_unavailable"
  | "fury_card_shadowed"
  | "dispatch_receipt_path_unsafe"
  | "copilot_sdk_unavailable"
  | "copilot_sdk_version_mismatch"
  | "copilot_sdk_exports_invalid"
  | "copilot_stdio_projection_unsafe"
  | "repository_drift"
  | "ready";

export const COPILOT_FURY_DISPATCH_CAPABILITY_NEXT_ACTIONS = Object.freeze({
  invalid_input: "Supply one canonical absolute repository root and the exact expected 40-character lowercase Git HEAD.",
  repository_unavailable: "Restore an accessible canonical Git worktree and rerun the capability probe.",
  expected_head_mismatch: "Check out the exact expected revision and rerun the capability probe.",
  workspace_dirty: "Restore a clean worktree at the expected revision and rerun the capability probe.",
  fury_card_unavailable: "Restore the exact-HEAD repository Fury agent card and rerun the capability probe.",
  fury_card_shadowed: "Remove the ambient same-name user Fury card and rerun with repository-default card precedence.",
  dispatch_receipt_path_unsafe: "Repair the canonical .shield dispatch-receipt path and permissions, then rerun the capability probe.",
  copilot_sdk_unavailable: "Install the pinned @github/copilot-sdk dependency and rerun the capability probe.",
  copilot_sdk_version_mismatch: `Install @github/copilot-sdk ${COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION} and rerun the capability probe.`,
  copilot_sdk_exports_invalid: "Restore the required CopilotClient and RuntimeConnection.forStdio exports and rerun the capability probe.",
  copilot_stdio_projection_unsafe: "Restore the closed stdio runtime projection and rerun the capability probe.",
  repository_drift: "Restore one stable clean repository/card state and rerun the capability probe.",
  ready: "No machine action is required for this capability.",
} satisfies Record<CopilotFuryDispatchCapabilityReasonV1, string>);

const RECOVERABLE_FAILURE_CODE = "COPILOT_EXECUTION_FAILED" as const;
const RECOVERABLE_FAILURE_MESSAGE = "CopilotClient was created with mode: 'empty' but neither 'baseDirectory' nor 'sessionFs' was set. Empty mode requires an explicit per-session persistence location; pick one." as const;
const RECOVERABLE_SUCCESSOR_FAILURE_MESSAGE = "Request session.create failed with message: Rejected session.create request with invalid sessionId: session:3joci3m8iFvPsfeyceBy8b3uH8dfv111" as const;

const REQUEST_FIELDS = [
  "schemaVersion", "contractVersion", "authority", "repositoryRoot", "repositoryId", "repositoryWorkspaceId",
  "branch", "planningBaseRevision", "headRevision", "missionId", "missionRevision", "subjectId", "subjectRevision",
  "parentSessionId", "transitionPlanPath", "transitionPlanRawSha256", "cardSelection", "requestedModel",
  "requestedRuntime", "requestedExecutor", "allowedTools", "allowedEffects", "repairLimit", "stopConditions", "timestamp",
] as const;
const REPOSITORY_CARD_SELECTION_FIELDS = ["kind"] as const;
const USER_CARD_SELECTION_FIELDS = ["kind", "logicalRef", "expectedSha256"] as const;
const TIMESTAMP_FIELDS = ["value", "provenance"] as const;
const RESULT_FIELDS = [
  "schemaVersion", "contractVersion", "authority", "reviewerSeatId", "reviewedArtifactId", "reviewedArtifactRevision",
  "verdict", "findings",
] as const;
const FINDING_FIELDS = ["code", "message"] as const;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
const GIT_REVISION = /^[0-9a-f]{40}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{6,}$/u;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
const MAX_RESULT_BYTES = 256 * 1024;
const MAX_FINDINGS = 32;
const MAX_FINDING_TEXT = 4096;
const MUTATING_TOOL_EXCLUSIONS = Object.freeze([
  "write", "edit", "apply_patch", "bash", "shell", "execute", "web", "mcp:*", "custom:*",
] as const);
const GIT_CONTEXT_VARIABLES = Object.freeze([
  "GIT_COMMON_DIR", "GIT_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_WORK_TREE",
] as const);

type Plain = Record<string, unknown>;

export interface CopilotAgentHandoffV1 {
  readonly label: string;
  readonly agent: string;
  readonly prompt: string;
  readonly send: false;
}

export interface CopilotAgentCardV1 {
  readonly frontmatter: {
    readonly name: string;
    readonly description: string;
    readonly "argument-hint": string;
    readonly target: "vscode";
    readonly "user-invocable": true;
    readonly "disable-model-invocation": boolean;
    readonly tools: readonly string[];
    readonly agents?: readonly string[];
    readonly handoffs?: readonly CopilotAgentHandoffV1[];
  };
  readonly body: string;
}

export type CopilotFuryCardSelectionV1 =
  | Readonly<{ kind: "repository_default" }>
  | Readonly<{ kind: "explicit_user_override"; logicalRef: typeof COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF; expectedSha256: string }>;

export interface CopilotFuryPlanDispatchRequestV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION;
  readonly authority: "none";
  readonly repositoryRoot: string;
  readonly repositoryId: string;
  readonly repositoryWorkspaceId: string;
  readonly branch: string;
  readonly planningBaseRevision: string;
  readonly headRevision: string;
  readonly missionId: string;
  readonly missionRevision: string;
  readonly subjectId: string;
  readonly subjectRevision: string;
  readonly parentSessionId: string;
  readonly transitionPlanPath: string;
  readonly transitionPlanRawSha256: string;
  readonly cardSelection: CopilotFuryCardSelectionV1;
  readonly requestedModel: string;
  readonly requestedRuntime: typeof COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID;
  readonly requestedExecutor: typeof COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID;
  readonly allowedTools: readonly ["read", "search"];
  readonly allowedEffects: readonly [];
  readonly repairLimit: 0 | 1 | 2;
  readonly stopConditions: readonly ["PASS", "REVISE", "cancelled", "failed"];
  readonly timestamp: Readonly<{ value: string; provenance: "hostTrusted" }>;
}

export interface CopilotFuryPlanFindingV1 {
  readonly code: string;
  readonly message: string;
}

export interface CopilotFuryPlanResultV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION;
  readonly authority: "none";
  readonly reviewerSeatId: "fury";
  readonly reviewedArtifactId: string;
  readonly reviewedArtifactRevision: string;
  readonly verdict: "PASS" | "REVISE";
  readonly findings: readonly CopilotFuryPlanFindingV1[];
}

export interface CopilotFuryResolvedCardIdentityV1 {
  readonly sourceKind: "repository" | "explicit_user_override";
  readonly logicalRef: string;
  readonly contentDigest: string;
  readonly repositoryRevision: string | null;
  readonly precedenceObservations: readonly Readonly<{
    sourceKind: "repository" | "user";
    logicalRef: string;
    disposition: "selected" | "absent" | "shadowing_rejected" | "not_selected_explicit_override";
    contentDigest: string | null;
  }>[];
}

export interface CopilotFuryDispatchCapabilityReportV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION;
  readonly authority: "none";
  readonly disposition: "ready" | "unavailable";
  readonly reasonCode: CopilotFuryDispatchCapabilityReasonV1;
  readonly nextAction: string;
  readonly repository: {
    readonly before: { readonly root: string; readonly branch: string | null; readonly head: string | null; readonly clean: boolean | null };
    readonly after: { readonly root: string; readonly branch: string | null; readonly head: string | null; readonly clean: boolean | null };
  };
  readonly package: { readonly name: "@github/copilot-sdk"; readonly version: string | null };
  readonly target: { readonly runtimeId: typeof COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID; readonly executorId: typeof COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID };
  readonly card: CopilotFuryResolvedCardIdentityV1 | null;
  readonly dispatchReceipt: {
    readonly logicalPath: typeof SEAT_DISPATCH_RECEIPTS_LOG_RELATIVE_PATH;
    readonly lockLogicalPath: string;
    readonly safety: "safe" | "unsafe";
  };
}

export interface CopilotFuryDispatchCapabilityDependenciesV1 extends CopilotFuryProductionExecutorDependenciesV1 {
  readonly userCopilotHome?: string;
  readonly beforeFinalObservation?: () => Promise<void>;
}

export interface CopilotFurySdkConfigurationV1 {
  readonly packageName: "@github/copilot-sdk";
  readonly packageVersion: typeof COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION;
  readonly clientMode: "empty";
  readonly sessionId: string;
  readonly repositoryRevision: string;
  readonly selectedAgent: "fury";
  readonly model: string;
  readonly customAgentsLocalOnly: true;
  readonly enableConfigDiscovery: false;
  readonly skipCustomInstructions: true;
  readonly enableFileHooks: false;
  readonly enableHostGitOperations: false;
  readonly enableSessionStore: false;
  readonly enableSkills: false;
  readonly pluginDirectories: readonly [];
  readonly skillDirectories: readonly [];
  readonly instructionDirectories: readonly [];
  readonly mcpServers: Readonly<Record<string, never>>;
  readonly availableTools: readonly ["read", "search"];
  readonly excludedTools: readonly string[];
  readonly allowedEffects: readonly [];
}

export interface CopilotFuryExecutorPreflightInputV1 {
  readonly repositoryRoot: string;
  readonly requestedModel: string;
  readonly requestedRuntime: string;
  readonly requestedExecutor: string;
  readonly executionIdentity: CopilotFuryExecutionIdentityV1;
}

export type CopilotFuryExecutorPreflightResultV1 = Readonly<
  | { state: "ready"; packageVersion: typeof COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; runtimeId: string; executorId: string }
  | { state: "blocked"; code: "BLOCKED_ADAPTER_GAP"; errors: readonly string[] }
>;

export interface CopilotFuryExecutorObservationsV1 {
  readonly sessionStartObserved: true;
  readonly sessionId: string;
  readonly selectedAgent: "fury";
  readonly model: string;
  readonly assistantModel: string;
  readonly runtimeId: string;
  readonly executorId: string;
  readonly loadedSdkPackageVersion: typeof COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION;
  readonly sessionProducer: string;
  readonly sessionProducerVersion: string;
  readonly modelChangeObserved: false;
  readonly agentSubstitutionObserved: false;
  readonly unauthorizedToolOrEffectObserved: false;
  readonly policyDecisions: readonly Readonly<{ tool: string; decision: "allow" | "deny" }>[];
}

export type CopilotFuryExecutorRunResultV1 = Readonly<
  | { state: "completed"; outputText: string; observations: CopilotFuryExecutorObservationsV1 }
  | { state: "failed" | "cancelled" | "interrupted"; code: string; errors: readonly string[]; observations: Partial<CopilotFuryExecutorObservationsV1> }
>;

export interface CopilotFuryExecutorRunInputV1 {
  readonly repositoryRoot: string;
  readonly card: CopilotAgentCardV1;
  readonly cardIdentity: CopilotFuryResolvedCardIdentityV1;
  readonly configuration: CopilotFurySdkConfigurationV1;
  readonly executionIdentity: CopilotFuryExecutionIdentityV1;
  readonly revalidatePersistence: () => Promise<void>;
  readonly prompt: string;
  readonly repairLimit: number;
  readonly validateOutput: (text: string) => boolean;
}

export interface CopilotFuryClientOptionsProjectionV1 {
  readonly mode: "empty";
  readonly connection: Readonly<{ kind: "stdio" }>;
  readonly workingDirectory: string;
  readonly baseDirectory: string;
  readonly logLevel: "none";
}

export interface CopilotFuryExecutionIdentityV1 {
  readonly claimKey: string;
  readonly receiptId: string;
  readonly childTaskId: string;
  readonly childSessionId: string;
  readonly clientOptions: CopilotFuryClientOptionsProjectionV1;
}

export interface CopilotFuryRecoveryClaimExpectationV1 {
  readonly receiptId: string;
  readonly dispatchId: string;
  readonly childTaskId: string;
  readonly childSessionId: string;
  readonly parentMissionId: string;
  readonly parentMissionRevision: string;
  readonly parentSessionId: string;
  readonly accountableSeatId: "fury";
  readonly repositoryId: string;
  readonly repositoryWorkspaceId: string;
  readonly repositoryRevision: string;
  readonly subjectId: string;
  readonly subjectRevision: string;
  readonly artifactId: string;
  readonly artifactRevision: string;
  readonly configuredRuntime: SeatDispatchReceiptProjectionV1["configuredRuntime"];
  readonly requestedRuntime: SeatDispatchReceiptProjectionV1["requestedRuntime"];
  readonly toolExecution: SeatDispatchReceiptProjectionV1["toolExecution"];
  readonly startedAt: string;
  readonly inputEvidenceRefs: readonly string[];
}

export type CopilotFuryRecoveryEligibilityV1 = Readonly<
  | { state: "not_allowlisted" }
  | { state: "invalid"; code: "RECOVERABLE_PREDECESSOR_CLAIM_MISMATCH" }
  | { state: "eligible"; successor: Readonly<{ packetId: string; claimKey: string; receiptId: string; childTaskId: string; childSessionId: string }> }
>;

export interface CopilotFuryPlanExecutorV1 {
  readonly preflight: (input: CopilotFuryExecutorPreflightInputV1) => Promise<CopilotFuryExecutorPreflightResultV1>;
  readonly execute: (input: CopilotFuryExecutorRunInputV1) => Promise<CopilotFuryExecutorRunResultV1>;
  readonly close?: () => Promise<void>;
}

export interface CopilotFuryPlanDispatchDependenciesV1 {
  readonly executor?: CopilotFuryPlanExecutorV1;
  readonly userCopilotHome?: string;
  readonly beforeClaim?: () => void | Promise<void>;
  readonly afterClaimBeforeExecution?: () => void | Promise<void>;
  readonly beforeTerminalRevalidation?: () => void | Promise<void>;
  readonly beforeTerminalAppend?: () => void | Promise<void>;
  readonly beforeFinalReadback?: () => void | Promise<void>;
  readonly claimDispatchPacket?: typeof claimSeatDispatchPacketV1;
  readonly appendDispatchReceipt?: typeof appendSeatDispatchReceiptEntryV1;
  readonly readDispatchLedger?: typeof readSeatDispatchReceiptLedgerV1;
}

export type CopilotFuryPlanDispatchHandoffV1 = Readonly<{
  transitionPlanPath: string;
  reviewArtifactPath: string;
  dispatchReceiptId: string;
}>;

type CommonDispatchResultV1 = Readonly<{
  contractVersion: typeof COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION;
  authority: "none";
  missionId: string;
  receiptId: string | null;
  evidencePath: string | null;
  replayed: boolean;
}>;

export type CopilotFuryPlanDispatchResultV1 =
  | (CommonDispatchResultV1 & Readonly<{ state: "completed"; disposition: "PASS"; handoff: CopilotFuryPlanDispatchHandoffV1 }>)
  | (CommonDispatchResultV1 & Readonly<{ state: "completed"; disposition: "REVISE"; findings: readonly CopilotFuryPlanFindingV1[]; handoff: null }>)
  | (CommonDispatchResultV1 & Readonly<{ state: "failed" | "cancelled"; code: string; errors: readonly string[]; handoff: null }>)
  | (CommonDispatchResultV1 & Readonly<{ state: "recovery_required"; code: string; errors: readonly string[]; handoff: null }>)
  | Readonly<{ contractVersion: typeof COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION; authority: "none"; state: "blocked" | "invalid"; code: string; errors: readonly string[]; receiptId: null; evidencePath: null; replayed: false; handoff: null }>;

type StableFile = Readonly<{ path: string; bytes: string; identity: string; rawSha256: string }>;
type RepositoryObservation = Readonly<{ canonicalRoot: string; identity: string; branch: string; headRevision: string; configBytes: string; journalBytes: string; journalDigest: string; journalSequence: number }>;
type ResolvedCard = Readonly<{ card: CopilotAgentCardV1; bytes: string; identity: CopilotFuryResolvedCardIdentityV1; sourcePath: string | null }>;
type CardResolutionRequest = Pick<CopilotFuryPlanDispatchRequestV1, "repositoryRoot" | "headRevision" | "cardSelection">;
type RepositoryCardObservation = Readonly<
  | { state: "present"; card: CopilotAgentCardV1; bytes: string; contentDigest: string }
  | { state: "absent" }
>;

function safePlain(value: unknown): value is Plain {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function exact(value: unknown, fields: readonly string[]): value is Plain {
  if (!safePlain(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return false;
  return fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor !== undefined && descriptor.enumerable && Object.hasOwn(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
  });
}

const COPILOT_CARD_ROOT_KEYS = Object.freeze([
  "name", "description", "argument-hint", "target", "user-invocable",
  "disable-model-invocation", "tools", "agents", "handoffs",
]);
const COPILOT_CARD_REQUIRED_KEYS = Object.freeze([
  "name", "description", "argument-hint", "target", "user-invocable",
  "disable-model-invocation", "tools",
]);
const COPILOT_CARD_HANDOFF_KEYS = Object.freeze(["label", "agent", "prompt", "send"]);

function copilotCardScalar(value: string): string {
  const normalized = value.trim();
  if (normalized === "" || normalized !== value || /[\[\]{}]/u.test(value)) throw new Error("frontmatter_scalar_invalid");
  return value;
}

function copilotCardBoolean(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("frontmatter_boolean_invalid");
}

function copilotCardFlowList(value: string): readonly string[] {
  if (!value.startsWith("[") || !value.endsWith("]")) throw new Error("frontmatter_list_invalid");
  const inner = value.slice(1, -1).trim();
  if (inner === "") return Object.freeze([]);
  const entries = inner.split(",").map((entry) => entry.trim());
  if (entries.some((entry) => !/^[A-Za-z][A-Za-z0-9-]*$/u.test(entry)) || new Set(entries).size !== entries.length) throw new Error("frontmatter_list_invalid");
  return Object.freeze(entries);
}

export function parseCopilotAgentCardV1(text: string): CopilotAgentCardV1 {
  if (typeof text !== "string" || text.includes("\r") || !text.startsWith("---\n")) throw new Error("frontmatter_missing");
  const closing = text.indexOf("\n---\n", 4);
  if (closing < 0) throw new Error("frontmatter_unclosed");
  const lines = text.slice(4, closing).split("\n");
  const root = new Map<string, unknown>();
  const handoffs: Record<string, unknown>[] = [];
  let currentHandoff: Record<string, unknown> | null = null;
  for (const line of lines) {
    if (line === "" || /\s$/u.test(line)) throw new Error("frontmatter_line_invalid");
    const handoffStart = /^  - ([a-z-]+): (.+)$/u.exec(line);
    const handoffField = /^    ([a-z-]+): (.+)$/u.exec(line);
    const rootField = /^([a-z-]+):(?: (.*))?$/u.exec(line);
    if (handoffStart !== null) {
      if (!root.has("handoffs") || handoffStart[1] !== "label") throw new Error("frontmatter_handoff_invalid");
      currentHandoff = { label: copilotCardScalar(handoffStart[2] as string) };
      handoffs.push(currentHandoff);
      continue;
    }
    if (handoffField !== null) {
      if (currentHandoff === null || Object.hasOwn(currentHandoff, handoffField[1] as string)) throw new Error("frontmatter_handoff_invalid");
      const key = handoffField[1] as string;
      if (!COPILOT_CARD_HANDOFF_KEYS.includes(key) || key === "label") throw new Error("frontmatter_handoff_invalid");
      currentHandoff[key] = key === "send" ? copilotCardBoolean(handoffField[2] as string) : copilotCardScalar(handoffField[2] as string);
      continue;
    }
    if (rootField === null || line.startsWith(" ")) throw new Error("frontmatter_line_invalid");
    currentHandoff = null;
    const key = rootField[1] as string;
    const value = rootField[2] ?? "";
    if (!COPILOT_CARD_ROOT_KEYS.includes(key) || root.has(key)) throw new Error("frontmatter_key_invalid");
    if (key === "handoffs") {
      if (value !== "") throw new Error("frontmatter_handoff_invalid");
      root.set(key, handoffs);
    } else if (key === "tools" || key === "agents") root.set(key, copilotCardFlowList(value));
    else if (key === "user-invocable" || key === "disable-model-invocation") root.set(key, copilotCardBoolean(value));
    else root.set(key, copilotCardScalar(value));
  }
  if (COPILOT_CARD_REQUIRED_KEYS.some((key) => !root.has(key))) throw new Error("frontmatter_required_key_missing");
  for (const handoff of handoffs) {
    if (!exact(handoff, COPILOT_CARD_HANDOFF_KEYS) || handoff.send !== false) throw new Error("frontmatter_handoff_invalid");
  }
  const body = text.slice(closing + 5);
  if (body.trim() === "") throw new Error("agent_body_missing");
  return Object.freeze({
    frontmatter: Object.freeze({ ...(Object.fromEntries(root) as unknown as CopilotAgentCardV1["frontmatter"]) }),
    body,
  });
}

function cloneClosed(value: unknown, seen = new Set<object>(), depth = 0): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || isProxy(value) || depth > 64 || seen.has(value)) throw new Error("not_closed_data");
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) throw new Error("unsafe_array");
    const copy: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set) throw new Error("unsafe_array");
      copy.push(cloneClosed(descriptor.value, seen, depth + 1));
    }
    return copy;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("non_plain_object");
  const copy: Plain = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error("symbol_key");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set) throw new Error("unsafe_field");
    copy[key] = cloneClosed(descriptor.value, seen, depth + 1);
  }
  return copy;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sameArray(value: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== expected.length || Reflect.ownKeys(value).length !== value.length + 1) return false;
  return value.every((entry, index) => entry === expected[index]);
}

function id(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function normalizedRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value === "" || value.includes("\0") || value.includes("\\") || isAbsolute(value)) return false;
  const normalized = value.split("/");
  return normalized.every((part) => part !== "" && part !== "." && part !== "..");
}

function digestHex(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function digestBase64Url(bytes: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("base64url")}`;
}

function parseJsonRejectDuplicateKeys(text: string): unknown {
  let offset = 0;
  const whitespace = () => { while (text[offset] === " " || text[offset] === "\t" || text[offset] === "\r" || text[offset] === "\n") offset += 1; };
  const parseString = (): string => {
    const start = offset;
    if (text[offset] !== '"') throw new Error("json_string_expected");
    offset += 1;
    while (offset < text.length) {
      const character = text[offset];
      if (character === '"') {
        offset += 1;
        return JSON.parse(text.slice(start, offset)) as string;
      }
      if (character === "\\") {
        offset += 1;
        if (text[offset] === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(offset + 1, offset + 5))) throw new Error("json_escape_invalid");
          offset += 5;
          continue;
        }
        if (!/["\\/bfnrt]/u.test(text[offset] ?? "")) throw new Error("json_escape_invalid");
      } else if (character === undefined || character.charCodeAt(0) < 0x20) throw new Error("json_string_invalid");
      offset += 1;
    }
    throw new Error("json_string_unterminated");
  };
  const parseValue = (depth: number): unknown => {
    if (depth > 64) throw new Error("json_depth_exceeded");
    whitespace();
    if (text[offset] === '"') return parseString();
    if (text[offset] === "{") {
      offset += 1;
      whitespace();
      const value: Plain = {};
      const keys = new Set<string>();
      if (text[offset] === "}") { offset += 1; return value; }
      while (true) {
        whitespace();
        const key = parseString();
        if (keys.has(key)) throw new Error("json_duplicate_key");
        keys.add(key);
        whitespace();
        if (text[offset] !== ":") throw new Error("json_colon_expected");
        offset += 1;
        Object.defineProperty(value, key, { value: parseValue(depth + 1), enumerable: true, configurable: true, writable: true });
        whitespace();
        if (text[offset] === "}") { offset += 1; return value; }
        if (text[offset] !== ",") throw new Error("json_object_separator_expected");
        offset += 1;
      }
    }
    if (text[offset] === "[") {
      offset += 1;
      whitespace();
      const value: unknown[] = [];
      if (text[offset] === "]") { offset += 1; return value; }
      while (true) {
        value.push(parseValue(depth + 1));
        whitespace();
        if (text[offset] === "]") { offset += 1; return value; }
        if (text[offset] !== ",") throw new Error("json_array_separator_expected");
        offset += 1;
      }
    }
    const remainder = text.slice(offset);
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(remainder)?.[0];
    if (token === undefined) throw new Error("json_value_expected");
    offset += token.length;
    return JSON.parse(token) as unknown;
  };
  const value = parseValue(0);
  whitespace();
  if (offset !== text.length) throw new Error("json_trailing_content");
  return value;
}

function invalid(code: string, ...errors: readonly string[]): CopilotFuryPlanDispatchResultV1 {
  return deepFreeze({
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
    authority: "none" as const,
    state: "invalid" as const,
    code,
    errors: errors.length > 0 ? [...errors] : [code],
    receiptId: null,
    evidencePath: null,
    replayed: false,
    handoff: null,
  });
}

function blocked(code: string, ...errors: readonly string[]): CopilotFuryPlanDispatchResultV1 {
  return deepFreeze({
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
    authority: "none" as const,
    state: "blocked" as const,
    code,
    errors: errors.length > 0 ? [...errors] : [code],
    receiptId: null,
    evidencePath: null,
    replayed: false,
    handoff: null,
  });
}

export function validateCopilotFuryPlanDispatchRequestV1(input: unknown): Readonly<
  | { state: "valid"; value: CopilotFuryPlanDispatchRequestV1 }
  | { state: "invalid"; code: "MALFORMED_REQUEST"; errors: readonly string[] }
> {
  let snapshot: unknown;
  try { snapshot = cloneClosed(input); } catch { return { state: "invalid", code: "MALFORMED_REQUEST", errors: ["Request is not closed ordinary data."] }; }
  if (!exact(snapshot, REQUEST_FIELDS)) return { state: "invalid", code: "MALFORMED_REQUEST", errors: ["Request fields are not closed."] };
  const value = snapshot;
  const errors: string[] = [];
  if (value.schemaVersion !== 1 || value.contractVersion !== COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION || value.authority !== "none") errors.push("Request schema, contract, or authority is invalid.");
  if (typeof value.repositoryRoot !== "string" || !isAbsolute(value.repositoryRoot) || resolve(value.repositoryRoot) !== value.repositoryRoot) errors.push("repositoryRoot must be an absolute normalized path.");
  if (typeof value.repositoryId !== "string" || !REPOSITORY.test(value.repositoryId)) errors.push("repositoryId is invalid.");
  for (const field of ["repositoryWorkspaceId", "missionId", "missionRevision", "subjectId", "subjectRevision", "parentSessionId", "requestedModel"] as const) {
    if (!id(value[field])) errors.push(`${field} is invalid.`);
  }
  if (typeof value.branch !== "string" || value.branch.length < 1 || value.branch.length > 255 || /[\0\r\n]/u.test(value.branch)) errors.push("branch is invalid.");
  if (typeof value.planningBaseRevision !== "string" || !GIT_REVISION.test(value.planningBaseRevision) || typeof value.headRevision !== "string" || !GIT_REVISION.test(value.headRevision)) errors.push("Git revisions are invalid.");
  if (!normalizedRelativePath(value.transitionPlanPath)) errors.push("transitionPlanPath is invalid.");
  if (typeof value.transitionPlanRawSha256 !== "string" || !SHA256_HEX.test(value.transitionPlanRawSha256)) errors.push("transitionPlanRawSha256 is invalid.");
  if (!exact(value.timestamp, TIMESTAMP_FIELDS) || value.timestamp.provenance !== "hostTrusted" || typeof value.timestamp.value !== "string" || !ISO_UTC.test(value.timestamp.value) || Number.isNaN(Date.parse(value.timestamp.value))) errors.push("timestamp is invalid.");
  if (!sameArray(value.allowedTools, COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS)) errors.push("allowedTools must be the fixed read-only tool list.");
  if (!sameArray(value.allowedEffects, COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS)) errors.push("allowedEffects must be empty.");
  if (!sameArray(value.stopConditions, COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS)) errors.push("stopConditions are invalid.");
  if (value.repairLimit !== 0 && value.repairLimit !== 1 && value.repairLimit !== 2) errors.push("repairLimit is invalid.");
  if (value.requestedRuntime !== COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID || value.requestedExecutor !== COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID) errors.push("Requested runtime or executor is unsupported.");
  if (exact(value.cardSelection, REPOSITORY_CARD_SELECTION_FIELDS)) {
    if (value.cardSelection.kind !== "repository_default") errors.push("Repository card selection is invalid.");
  } else if (exact(value.cardSelection, USER_CARD_SELECTION_FIELDS)) {
    if (value.cardSelection.kind !== "explicit_user_override" || value.cardSelection.logicalRef !== COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF || typeof value.cardSelection.expectedSha256 !== "string" || !SHA256_HEX.test(value.cardSelection.expectedSha256)) errors.push("Explicit user card selection is invalid.");
  } else errors.push("cardSelection is invalid.");
  if (errors.length > 0) return { state: "invalid", code: "MALFORMED_REQUEST", errors: Object.freeze(errors) };
  return { state: "valid", value: deepFreeze(value as unknown as CopilotFuryPlanDispatchRequestV1) };
}

export function validateCopilotFuryPlanResultV1(input: unknown, plan: TransitionPlanV1OrV2): Readonly<
  | { state: "valid"; value: CopilotFuryPlanResultV1 }
  | { state: "invalid"; code: "INVALID_FURY_RESULT"; errors: readonly string[] }
> {
  let snapshot: unknown;
  try { snapshot = cloneClosed(input); } catch { return { state: "invalid", code: "INVALID_FURY_RESULT", errors: ["Fury result is not closed ordinary data."] }; }
  if (!exact(snapshot, RESULT_FIELDS)) return { state: "invalid", code: "INVALID_FURY_RESULT", errors: ["Fury result fields are not closed."] };
  const value = snapshot;
  const errors: string[] = [];
  if (value.schemaVersion !== 1 || value.contractVersion !== COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION || value.authority !== "none" || value.reviewerSeatId !== "fury") errors.push("Fury result schema or identity is invalid.");
  if (value.reviewedArtifactId !== plan.id || value.reviewedArtifactRevision !== plan.digest) errors.push("Fury result reviewed-artifact binding is stale or mismatched.");
  if (value.verdict !== "PASS" && value.verdict !== "REVISE") errors.push("Fury verdict is unsupported.");
  if (!Array.isArray(value.findings) || isProxy(value.findings) || Object.getPrototypeOf(value.findings) !== Array.prototype || value.findings.length > MAX_FINDINGS || Reflect.ownKeys(value.findings).length !== value.findings.length + 1) {
    errors.push("Fury findings are malformed or exceed their bound.");
  } else {
    for (const finding of value.findings) {
      if (!exact(finding, FINDING_FIELDS) || !id(finding.code) || typeof finding.message !== "string" || finding.message.trim() !== finding.message || finding.message.length < 1 || finding.message.length > MAX_FINDING_TEXT) errors.push("Fury finding is malformed.");
    }
    if (value.verdict === "PASS" && value.findings.length !== 0) errors.push("PASS must have no findings.");
    if (value.verdict === "REVISE" && value.findings.length === 0) errors.push("REVISE must have at least one finding.");
  }
  if (errors.length > 0) return { state: "invalid", code: "INVALID_FURY_RESULT", errors: Object.freeze([...new Set(errors)]) };
  return { state: "valid", value: deepFreeze(value as unknown as CopilotFuryPlanResultV1) };
}

function parseClosedResultText(text: string, plan: TransitionPlanV1OrV2) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_RESULT_BYTES || text === "") return { state: "invalid" as const };
  const objectStart = text.indexOf("{");
  if (objectStart < 0) return { state: "invalid" as const };
  let parsed: unknown;
  try { parsed = parseJsonRejectDuplicateKeys(text.slice(objectStart).trim()); } catch { return { state: "invalid" as const }; }
  return validateCopilotFuryPlanResultV1(parsed, plan);
}

function cleanGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, GIT_NO_REPLACE_OBJECTS: "1", GIT_OPTIONAL_LOCKS: "0", LANG: "C", LC_ALL: "C" };
  for (const name of GIT_CONTEXT_VARIABLES) delete environment[name];
  return environment;
}

function git(root: string, args: readonly string[]): Promise<string> {
  return new Promise((resolveValue, reject) => {
    execFileNode("git", ["--no-replace-objects", "-C", root, ...args], { encoding: "utf8", timeout: 15_000, maxBuffer: 4 * 1024 * 1024, shell: false, env: cleanGitEnvironment() }, (error, stdout) => {
      if (error) reject(error); else resolveValue(stdout);
    });
  });
}

function gitBytes(root: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolveValue, reject) => {
    execFileNode("git", ["--no-replace-objects", "-C", root, ...args], { encoding: "buffer", timeout: 15_000, maxBuffer: 4 * 1024 * 1024, shell: false, env: cleanGitEnvironment() }, (error, stdout) => {
      if (error) reject(error); else resolveValue(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
    });
  });
}

function exactGitTreePath(repositoryRoot: string, requestedPath: unknown): string {
  if (typeof requestedPath !== "string" || requestedPath === "" || requestedPath.includes("\0")) throw new Error("exact_git_tree_path_invalid");
  let path: string;
  if (!isAbsolute(requestedPath)) {
    if (!normalizedRelativePath(requestedPath)) throw new Error("exact_git_tree_path_invalid");
    path = requestedPath;
  } else {
    if (resolve(requestedPath) !== requestedPath) throw new Error("exact_git_tree_path_alias");
    path = relative(repositoryRoot, requestedPath).split(sep).join("/");
    if (!normalizedRelativePath(path)) throw new Error("exact_git_tree_path_escape");
  }
  if (path.split("/").some((component) => component.toLocaleLowerCase("en-US") === ".git")) throw new Error("exact_git_tree_path_git_metadata");
  return path;
}

type ExactGitTreeEntry = Readonly<{ mode: string; type: string; objectId: string; path: string }>;
type ValidatedExactGitTreeToolCall = Readonly<
  | { kind: "read"; file: ExactGitTreeEntry }
  | { kind: "search"; query: string; files: readonly ExactGitTreeEntry[] }
>;

async function exactGitTreeInventory(repositoryRoot: string, revision: string): Promise<readonly ExactGitTreeEntry[]> {
  if (await realpath(repositoryRoot) !== repositoryRoot) throw new Error("exact_git_tree_root_alias");
  const listed = await gitBytes(repositoryRoot, ["ls-tree", "-r", "-t", "-z", "--full-tree", revision]);
  if (listed.length > MAX_INPUT_BYTES || !Buffer.from(listed.toString("utf8"), "utf8").equals(listed)) throw new Error("exact_git_tree_inventory_too_large");
  const entries: ExactGitTreeEntry[] = [];
  for (const record of listed.toString("utf8").split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    if (tab < 0) throw new Error("exact_git_tree_inventory_malformed");
    const [mode, type, objectId, ...extra] = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    if (extra.length !== 0 || !/^[0-7]{6}$/u.test(mode ?? "") || (type !== "blob" && type !== "tree" && type !== "commit") || !/^[0-9a-f]{40,64}$/u.test(objectId ?? "") || !normalizedRelativePath(path) || path.split("/").some((component) => component.toLocaleLowerCase("en-US") === ".git")) throw new Error("exact_git_tree_inventory_malformed");
    entries.push(Object.freeze({ mode, type, objectId, path }));
    if (entries.length > 8192) throw new Error("exact_git_tree_inventory_too_large");
  }
  return Object.freeze(entries);
}

function regularGitTreeFile(entry: ExactGitTreeEntry): boolean {
  return entry.type === "blob" && (entry.mode === "100644" || entry.mode === "100755");
}

async function validateExactGitTreeToolCall(repositoryRoot: string, revision: string, toolName: string, args: unknown): Promise<Readonly<{ state: "valid"; value: ValidatedExactGitTreeToolCall } | { state: "invalid" }>> {
  try {
    const entries = await exactGitTreeInventory(repositoryRoot, revision);
    if (toolName === "read") {
      if (!exact(args, ["path"])) return { state: "invalid" };
      const path = exactGitTreePath(repositoryRoot, args.path);
      const entry = entries.find((candidate) => candidate.path === path);
      if (entry === undefined || !regularGitTreeFile(entry)) return { state: "invalid" };
      return { state: "valid", value: Object.freeze({ kind: "read", file: entry }) };
    }
    if (toolName !== "search" || (!exact(args, ["query"]) && !exact(args, ["query", "path"])) || typeof args.query !== "string" || args.query.length < 1 || args.query.length > 1024 || (args.path !== undefined && typeof args.path !== "string")) return { state: "invalid" };
    const prefix = args.path === undefined ? null : exactGitTreePath(repositoryRoot, args.path);
    if (prefix !== null) {
      const target = entries.find((candidate) => candidate.path === prefix);
      if (target === undefined || (target.type === "tree" ? target.mode !== "040000" : !regularGitTreeFile(target))) return { state: "invalid" };
    }
    const scoped = entries.filter((entry) => entry.type !== "tree" && (prefix === null || entry.path === prefix || entry.path.startsWith(`${prefix}/`)));
    if (scoped.length > 4096 || scoped.some((entry) => !regularGitTreeFile(entry))) return { state: "invalid" };
    return { state: "valid", value: Object.freeze({ kind: "search", query: args.query, files: Object.freeze(scoped) }) };
  } catch {
    return { state: "invalid" };
  }
}

async function exactGitTreeBytes(repositoryRoot: string, file: ExactGitTreeEntry): Promise<Buffer> {
  if (!regularGitTreeFile(file)) throw new Error("exact_git_tree_mode_invalid");
  const sizeText = (await git(repositoryRoot, ["cat-file", "-s", file.objectId])).trim();
  const size = Number(sizeText);
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_INPUT_BYTES) throw new Error("exact_git_tree_object_invalid");
  const bytes = await gitBytes(repositoryRoot, ["cat-file", "blob", file.objectId]);
  if (bytes.length !== size || !Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) throw new Error("exact_git_tree_bytes_invalid");
  return bytes;
}

async function stableExactHeadTransitionPlan(request: CopilotFuryPlanDispatchRequestV1): Promise<StableFile> {
  const worktree = await stableTextFile(request.repositoryRoot, request.transitionPlanPath, "transition_plan");
  const path = exactGitTreePath(request.repositoryRoot, request.transitionPlanPath);
  const entry = (await exactGitTreeInventory(request.repositoryRoot, request.headRevision)).find((candidate) => candidate.path === path);
  if (entry === undefined || !regularGitTreeFile(entry)) throw new Error("transition_plan_head_blob_unavailable");
  const headBytes = await exactGitTreeBytes(request.repositoryRoot, entry);
  if (!headBytes.equals(Buffer.from(worktree.bytes, "utf8"))) throw new Error("transition_plan_worktree_head_mismatch");
  return worktree;
}

function exactGitTreeTools(repositoryRoot: string, revision: string, onDenied: (toolName: string) => void): readonly Tool[] {
  const readTool: Tool = {
    name: "read",
    description: "Read one UTF-8 file from the exact immutable repository Git tree under review.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: { path: { type: "string", description: "Repository-relative or canonical absolute file path." } },
    },
    overridesBuiltInTool: true,
    skipPermission: true,
    defer: "never",
    handler: async (args: unknown) => {
      const validated = await validateExactGitTreeToolCall(repositoryRoot, revision, "read", args);
      if (validated.state === "invalid" || validated.value.kind !== "read") {
        onDenied("read");
        throw new Error("exact_git_tree_read_arguments_invalid");
      }
      const bytes = await exactGitTreeBytes(repositoryRoot, validated.value.file);
      return canonicalJson({ repositoryRevision: revision, path: validated.value.file.path, content: bytes.toString("utf8") });
    },
  };
  const searchTool: Tool = {
    name: "search",
    description: "Search UTF-8 files from the exact immutable repository Git tree under review.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1, maxLength: 1024 },
        path: { type: "string", description: "Optional repository-relative subtree." },
      },
    },
    overridesBuiltInTool: true,
    skipPermission: true,
    defer: "never",
    handler: async (args: unknown) => {
      const validated = await validateExactGitTreeToolCall(repositoryRoot, revision, "search", args);
      if (validated.state === "invalid" || validated.value.kind !== "search") {
        onDenied("search");
        throw new Error("exact_git_tree_search_arguments_invalid");
      }
      const matches: { path: string; line: number; text: string }[] = [];
      let scannedBytes = 0;
      for (const file of validated.value.files) {
        const bytes = await exactGitTreeBytes(repositoryRoot, file);
        scannedBytes += bytes.length;
        if (scannedBytes > 8 * MAX_INPUT_BYTES) throw new Error("exact_git_tree_search_too_large");
        for (const [index, text] of bytes.toString("utf8").split("\n").entries()) {
          if (text.includes(validated.value.query)) matches.push({ path: file.path, line: index + 1, text });
          if (matches.length === 200) return canonicalJson({ repositoryRevision: revision, query: validated.value.query, matches, truncated: true });
        }
      }
      return canonicalJson({ repositoryRevision: revision, query: validated.value.query, matches, truncated: false });
    },
  };
  return Object.freeze([readTool, searchTool]);
}

async function stableTextFile(root: string, relativePath: string, label: string, maxBytes = MAX_INPUT_BYTES): Promise<StableFile> {
  if (!normalizedRelativePath(relativePath)) throw new Error(`${label}_path_invalid`);
  const path = resolve(root, relativePath);
  const relation = relative(root, path);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error(`${label}_path_escape`);
  const canonical = await realpath(path);
  const canonicalRelation = relative(root, canonical);
  if (canonicalRelation === "" || canonicalRelation === ".." || canonicalRelation.startsWith(`..${sep}`) || isAbsolute(canonicalRelation)) throw new Error(`${label}_path_escape`);
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > maxBytes) throw new Error(`${label}_unsafe_file`);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error(`${label}_identity_changed`);
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathAfter = await lstat(path);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.nlink !== 1 || pathAfter.isSymbolicLink() || !pathAfter.isFile() || pathAfter.nlink !== 1 || pathAfter.dev !== opened.dev || pathAfter.ino !== opened.ino || pathAfter.size !== opened.size) throw new Error(`${label}_identity_changed`);
    return { path, bytes, identity: `${opened.dev}:${opened.ino}:${opened.size}:${opened.mtimeMs}:${opened.ctimeMs}`, rawSha256: digestHex(bytes) };
  } finally { await handle.close(); }
}

async function optionalStableAbsoluteFile(path: string, label: string): Promise<StableFile | null> {
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > MAX_INPUT_BYTES) throw new Error(`${label}_unsafe_file`);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      const bytes = await handle.readFile("utf8");
      const after = await handle.stat();
      if (!opened.isFile() || opened.nlink !== 1 || after.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.dev !== after.dev || opened.ino !== after.ino || opened.size !== after.size) throw new Error(`${label}_identity_changed`);
      return { path, bytes, identity: `${opened.dev}:${opened.ino}:${opened.size}:${opened.mtimeMs}:${opened.ctimeMs}`, rawSha256: digestHex(bytes) };
    } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function observeRepository(request: CopilotFuryPlanDispatchRequestV1): Promise<RepositoryObservation> {
  const canonicalRoot = await realpath(request.repositoryRoot);
  if (canonicalRoot !== request.repositoryRoot) throw new Error("repository_root_not_canonical");
  const rootStats = await lstat(canonicalRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error("repository_root_unsafe");
  if (resolve((await git(canonicalRoot, ["rev-parse", "--show-toplevel"])).trim()) !== canonicalRoot) throw new Error("repository_root_mismatch");
  const headRevision = (await git(canonicalRoot, ["rev-parse", "--verify", "HEAD"])).trim();
  const branch = (await git(canonicalRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  if (headRevision !== request.headRevision || branch !== request.branch) throw new Error("repository_revision_or_branch_drift");
  await git(canonicalRoot, ["merge-base", "--is-ancestor", request.planningBaseRevision, headRevision]);
  const configFile = await stableTextFile(canonicalRoot, ".shield/config.json", "shield_config");
  const config = parseShieldConfig(configFile.bytes);
  if (config.state === "invalid" || config.value.repositoryId !== request.repositoryId) throw new Error("repository_configuration_mismatch");
  const journalPaths = resolveSupervisedMissionPaths(canonicalRoot, config.value.paths.journals, request.missionId);
  if (journalPaths.state === "invalid") throw new Error("mission_journal_path_invalid");
  const journalRelative = relative(canonicalRoot, journalPaths.value.journalPath).split(sep).join("/");
  const journalFile = await stableTextFile(canonicalRoot, journalRelative, "mission_journal");
  const displayed = await readMissionJournalForDisplay({ repositoryRoot: canonicalRoot, configuredJournalPath: config.value.paths.journals, missionId: request.missionId });
  if (displayed.state === "invalid") throw new Error("mission_journal_invalid");
  const projection = displayed.value.projection;
  if (projection.missionId !== request.missionId || projection.brief.revisionId !== request.missionRevision || projection.brief.subjectId !== request.subjectId) throw new Error("mission_projection_mismatch");
  return Object.freeze({
    canonicalRoot,
    identity: `${rootStats.dev}:${rootStats.ino}`,
    branch,
    headRevision,
    configBytes: configFile.bytes,
    journalBytes: journalFile.bytes,
    journalDigest: journalByteSha256(journalFile.bytes),
    journalSequence: projection.lastSequence,
  });
}

async function observeRepositoryCard(request: CardResolutionRequest): Promise<RepositoryCardObservation> {
  const entries = (await exactGitTreeInventory(request.repositoryRoot, request.headRevision))
    .filter((entry) => entry.path === COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF);
  if (entries.length === 0) return Object.freeze({ state: "absent" });
  if (entries.length !== 1 || !regularGitTreeFile(entries[0] as ExactGitTreeEntry)) throw new Error("repository_fury_card_head_blob_invalid");
  const bytes = (await exactGitTreeBytes(request.repositoryRoot, entries[0] as ExactGitTreeEntry)).toString("utf8");
  const card = parseCopilotAgentCardV1(bytes);
  if (card.frontmatter.name.toLocaleLowerCase("en-US") !== "fury") throw new Error("repository_fury_card_seat_mismatch");
  return deepFreeze({ state: "present", card, bytes, contentDigest: digestHex(bytes) });
}

async function resolveCard(request: CardResolutionRequest, userCopilotHome?: string): Promise<ResolvedCard> {
  const repository = await observeRepositoryCard(request);
  if (request.cardSelection.kind === "repository_default" && repository.state === "absent") throw new Error("repository_fury_card_absent");
  const base = userCopilotHome ?? process.env.COPILOT_HOME ?? join(homedir(), ".copilot");
  const userPath = join(resolve(base), "agents", "fury.agent.md");
  const userFile = await optionalStableAbsoluteFile(userPath, "user_fury_card");
  let userCard: CopilotAgentCardV1 | null = null;
  if (userFile !== null) {
    const canonicalBase = await realpath(resolve(base));
    const canonicalUserPath = await realpath(userPath);
    if (canonicalBase !== resolve(base) || canonicalUserPath !== userPath || relative(canonicalBase, canonicalUserPath).startsWith(`..${sep}`)) throw new Error("user_fury_card_unsafe_ancestry");
    try { userCard = parseCopilotAgentCardV1(userFile.bytes); }
    catch { throw new Error("user_fury_card_malformed"); }
    if (userCard.frontmatter.name.toLocaleLowerCase("en-US") !== "fury") userCard = null;
  }
  if (request.cardSelection.kind === "repository_default") {
    if (repository.state !== "present") throw new Error("repository_fury_card_absent");
    if (userCard !== null && userFile !== null) throw new Error("same_name_user_card_shadowing_requires_explicit_override");
    return deepFreeze({
      card: repository.card,
      bytes: repository.bytes,
      sourcePath: null,
      identity: {
        sourceKind: "repository",
        logicalRef: COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF,
        contentDigest: repository.contentDigest,
        repositoryRevision: request.headRevision,
        precedenceObservations: [
          { sourceKind: "repository", logicalRef: COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF, disposition: "selected", contentDigest: repository.contentDigest },
          { sourceKind: "user", logicalRef: COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF, disposition: "absent", contentDigest: null },
        ],
      },
    });
  }
  if (userFile === null || userCard === null || userFile.rawSha256 !== request.cardSelection.expectedSha256) throw new Error("explicit_user_card_override_unavailable_or_mismatched");
  return deepFreeze({
    card: userCard,
    bytes: userFile.bytes,
    sourcePath: userPath,
    identity: {
      sourceKind: "explicit_user_override",
      logicalRef: COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF,
      contentDigest: userFile.rawSha256,
      repositoryRevision: null,
      precedenceObservations: [
        repository.state === "present"
          ? { sourceKind: "repository", logicalRef: COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF, disposition: "not_selected_explicit_override", contentDigest: repository.contentDigest }
          : { sourceKind: "repository", logicalRef: COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF, disposition: "absent", contentDigest: null },
        { sourceKind: "user", logicalRef: COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF, disposition: "selected", contentDigest: userFile.rawSha256 },
      ],
    },
  });
}

function deriveSessionIdentity(request: CopilotFuryPlanDispatchRequestV1, plan: TransitionPlanV1OrV2) {
  const operation = deepFreeze({
    missionId: request.missionId,
    missionRevision: request.missionRevision,
    parentSessionId: request.parentSessionId,
    subjectId: request.subjectId,
    subjectRevision: request.subjectRevision,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    repositoryId: request.repositoryId,
    repositoryWorkspaceId: request.repositoryWorkspaceId,
    repositoryRevision: request.headRevision,
    accountableSeatId: "fury",
  });
  const operationDigest = digestBase64Url(`copilot-fury-logical-operation-v1\0${canonicalJson(operation)}`);
  const token = operationDigest.replace(/^sha256:/u, "").slice(0, 32);
  const packetId = `packet:copilot-fury:${token}`;
  const claimKey = createHash("sha256").update(new TextEncoder().encode(
    `seat-dispatch-claim-v1\0${request.missionId}\0${request.parentSessionId}\0${packetId}`,
  )).digest("base64url").slice(0, 32);
  return Object.freeze({
    packetId,
    claimKey,
    receiptId: `receipt:${claimKey}`,
    lockOwnerId: `copilot-fury:${token}`,
    childTaskId: `task:${claimKey}`,
    childSessionId: `session:${claimKey}`,
    operationDigest,
    configuredRuntime: Object.freeze({ kind: "runtime.configured" as const, runtimeId: request.requestedRuntime, model: request.requestedModel }),
    requestedRuntime: Object.freeze({ kind: "runtime.requested" as const, runtimeId: request.requestedRuntime, model: request.requestedModel }),
  });
}

type PersistenceComponentSnapshot = Readonly<{
  path: string;
  canonicalPath: string;
  uid: number;
  mode: number;
  dev: number;
  ino: number;
}>;

type PersistenceSnapshot = Readonly<{
  baseDirectory: string;
  components: readonly PersistenceComponentSnapshot[];
}>;

type RecoveryBindingV2 = Readonly<{
  protocol: typeof COPILOT_FURY_PLAN_DISPATCH_RECOVERY_PROTOCOL;
  predecessorReceiptId: string;
  predecessorTerminalEntryDigest: string;
  failedEvidenceDigest: string;
  originalPacketDigest: string;
  inputEvidenceBinding: string;
  successorExecutionIdentity: CopilotFuryExecutionIdentityV1;
}>;

function claimIdentity(request: CopilotFuryPlanDispatchRequestV1, packetId: string) {
  const claimKey = createHash("sha256").update(new TextEncoder().encode(
    `seat-dispatch-claim-v1\0${request.missionId}\0${request.parentSessionId}\0${packetId}`,
  )).digest("base64url").slice(0, 32);
  return Object.freeze({
    packetId,
    claimKey,
    receiptId: `receipt:${claimKey}`,
    lockOwnerId: `copilot-fury:${claimKey}`,
    childTaskId: `task:${claimKey}`,
    childSessionId: `session:${claimKey}`,
    configuredRuntime: Object.freeze({ kind: "runtime.configured" as const, runtimeId: request.requestedRuntime, model: request.requestedModel }),
    requestedRuntime: Object.freeze({ kind: "runtime.requested" as const, runtimeId: request.requestedRuntime, model: request.requestedModel }),
  });
}

function recoverySuccessorCore(parentMissionId: string, parentSessionId: string, predecessorReceiptId: string, predecessorTerminalEntryDigest: string) {
  const token = digestBase64Url(`${COPILOT_FURY_PLAN_DISPATCH_RECOVERY_PROTOCOL}\0${predecessorReceiptId}\0${predecessorTerminalEntryDigest}`)
    .replace(/^sha256:/u, "").slice(0, 32);
  const packetId = `packet:copilot-fury-recovery:${token}`;
  const claimKey = createHash("sha256").update(new TextEncoder().encode(
    `seat-dispatch-claim-v1\0${parentMissionId}\0${parentSessionId}\0${packetId}`,
  )).digest("base64url").slice(0, 32);
  return Object.freeze({ packetId, claimKey, receiptId: `receipt:${claimKey}`, childTaskId: `task:${claimKey}`, childSessionId: `session:${claimKey}` });
}

function executionIdentity(repositoryRoot: string, identity: Readonly<{ claimKey: string; receiptId: string; childTaskId: string; childSessionId: string }>): CopilotFuryExecutionIdentityV1 {
  return deepFreeze({
    claimKey: identity.claimKey,
    receiptId: identity.receiptId,
    childTaskId: identity.childTaskId,
    childSessionId: identity.childSessionId,
    clientOptions: {
      mode: "empty",
      connection: { kind: "stdio" },
      workingDirectory: repositoryRoot,
      baseDirectory: join(repositoryRoot, ".shield", "runtime", "copilot-fury", identity.claimKey),
      logLevel: "none",
    },
  });
}

export function deriveCopilotSdkSessionIdV1(childSessionId: string): string {
  const bytes = createHash("sha256").update(new TextEncoder().encode(`copilot-sdk-session-v1\0${childSessionId}`)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validateCopilotFurySuccessorExecutionConfigurationV3(
  packetConfiguration: unknown,
  executionConfiguration: unknown,
  childSessionId: string,
): boolean {
  if (!safePlain(packetConfiguration) || !safePlain(executionConfiguration)) return false;
  return canonicalJson(executionConfiguration) === canonicalJson({
    ...packetConfiguration,
    sessionId: deriveCopilotSdkSessionIdV1(childSessionId),
  });
}

function validExecutionIdentity(value: unknown, repositoryRoot: string): value is CopilotFuryExecutionIdentityV1 {
  if (!exact(value, ["claimKey", "receiptId", "childTaskId", "childSessionId", "clientOptions"])) return false;
  if (typeof value.claimKey !== "string" || !/^[A-Za-z0-9_-]{32}$/u.test(value.claimKey) || value.receiptId !== `receipt:${value.claimKey}` || value.childTaskId !== `task:${value.claimKey}` || value.childSessionId !== `session:${value.claimKey}`) return false;
  const options = value.clientOptions;
  if (!exact(options, ["mode", "connection", "workingDirectory", "baseDirectory", "logLevel"]) || options.mode !== "empty" || options.workingDirectory !== repositoryRoot || options.baseDirectory !== join(repositoryRoot, ".shield", "runtime", "copilot-fury", value.claimKey) || options.logLevel !== "none") return false;
  return exact(options.connection, ["kind"]) && options.connection.kind === "stdio";
}

function effectiveUid(): number {
  const uid = process.geteuid?.();
  if (uid === undefined || !Number.isSafeInteger(uid) || uid < 0) throw new Error("effective_uid_unavailable");
  return uid;
}

async function inspectPersistenceComponent(path: string, requirePrivateMode: boolean): Promise<PersistenceComponentSnapshot> {
  const stats = await lstat(path);
  const canonicalPath = await realpath(path);
  const mode = stats.mode & 0o777;
  if (!stats.isDirectory() || stats.isSymbolicLink() || canonicalPath !== path) throw new Error("copilot_persistence_component_unsafe");
  if (stats.uid !== effectiveUid()) throw new Error("copilot_persistence_component_not_owned");
  if ((mode & 0o022) !== 0 || (requirePrivateMode && mode !== 0o700)) throw new Error("copilot_persistence_component_mode_unsafe");
  return Object.freeze({ path, canonicalPath, uid: stats.uid, mode, dev: stats.dev, ino: stats.ino });
}

async function validatePersistencePathBeforeClaim(repositoryRoot: string, claimKey: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{32}$/u.test(claimKey)) throw new Error("copilot_persistence_claim_key_invalid");
  const components = [".shield", "runtime", "copilot-fury", claimKey];
  const baseDirectory = join(repositoryRoot, ...components);
  if (resolve(baseDirectory) !== baseDirectory || relative(repositoryRoot, baseDirectory).startsWith(`..${sep}`)) throw new Error("copilot_persistence_path_escape");
  let current = repositoryRoot;
  let missing = false;
  for (let index = 0; index < components.length; index += 1) {
    current = join(current, components[index]);
    if (missing) continue;
    try {
      await inspectPersistenceComponent(current, index > 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        missing = true;
        continue;
      }
      throw error;
    }
  }
  return baseDirectory;
}

async function materializePersistencePath(repositoryRoot: string, claimKey: string): Promise<PersistenceSnapshot> {
  const baseDirectory = await validatePersistencePathBeforeClaim(repositoryRoot, claimKey);
  const components = [".shield", "runtime", "copilot-fury", claimKey];
  const snapshots: PersistenceComponentSnapshot[] = [];
  let current = repositoryRoot;
  for (let index = 0; index < components.length; index += 1) {
    current = join(current, components[index]);
    if (index > 0) {
      try { await mkdir(current, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    snapshots.push(await inspectPersistenceComponent(current, index > 0));
  }
  return deepFreeze({ baseDirectory, components: snapshots });
}

async function revalidatePersistenceSnapshot(snapshot: PersistenceSnapshot): Promise<void> {
  if (snapshot.components.length !== 4 || snapshot.components.at(-1)?.path !== snapshot.baseDirectory) throw new Error("copilot_persistence_snapshot_malformed");
  for (const expected of snapshot.components) {
    const actual = await inspectPersistenceComponent(expected.path, expected.path !== snapshot.components[0].path);
    if (actual.canonicalPath !== expected.canonicalPath || actual.uid !== expected.uid || actual.mode !== expected.mode || actual.dev !== expected.dev || actual.ino !== expected.ino) throw new Error("copilot_persistence_component_replaced");
  }
}

function sdkConfiguration(request: CopilotFuryPlanDispatchRequestV1, childSessionId: string): CopilotFurySdkConfigurationV1 {
  return deepFreeze({
    packageName: "@github/copilot-sdk" as const,
    packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
    clientMode: "empty" as const,
    sessionId: childSessionId,
    repositoryRevision: request.headRevision,
    selectedAgent: "fury" as const,
    model: request.requestedModel,
    customAgentsLocalOnly: true as const,
    enableConfigDiscovery: false as const,
    skipCustomInstructions: true as const,
    enableFileHooks: false as const,
    enableHostGitOperations: false as const,
    enableSessionStore: false as const,
    enableSkills: false as const,
    pluginDirectories: [] as readonly [],
    skillDirectories: [] as readonly [],
    instructionDirectories: [] as readonly [],
    mcpServers: {} as Readonly<Record<string, never>>,
    availableTools: [...COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS] as ["read", "search"],
    excludedTools: [...MUTATING_TOOL_EXCLUSIONS],
    allowedEffects: [] as readonly [],
  });
}

function outputContractDescription(plan: TransitionPlanV1OrV2): string {
  return canonicalJson({
    schemaVersion: 1,
    contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
    authority: "none",
    reviewerSeatId: "fury",
    reviewedArtifactId: plan.id,
    reviewedArtifactRevision: plan.digest,
    verdict: "PASS | REVISE",
    findings: [{ code: "identifier (REVISE only)", message: "bounded actionable finding (REVISE only)" }],
  });
}

function taskPrompt(request: CopilotFuryPlanDispatchRequestV1, plan: TransitionPlanV1OrV2): string {
  return [
    "Review the exact transition plan at the bound repository revision. Return only one compact JSON object; no Markdown or prose.",
    "Use only the host-backed read and search tools. Do not invoke or describe bash, shell, filesystem, or Git commands. The runtime filesystem is not the repository authority.",
    "The host tools read the exact bound Git tree. If a tool is needed, call read or search directly; do not infer repository unavailability from the runtime environment.",
    `repositoryRoot=${request.repositoryRoot}`,
    `repositoryId=${request.repositoryId}`,
    `branch=${request.branch}`,
    `headRevision=${request.headRevision}`,
    `planningBaseRevision=${request.planningBaseRevision}`,
    `missionId=${request.missionId}`,
    `missionRevision=${request.missionRevision}`,
    `subjectId=${request.subjectId}`,
    `subjectRevision=${request.subjectRevision}`,
    `transitionPlanPath=${request.transitionPlanPath}`,
    `transitionPlanRawSha256=${request.transitionPlanRawSha256}`,
    `transitionPlanId=${plan.id}`,
    `transitionPlanDigest=${plan.digest}`,
    `transitionPlan=${canonicalJson(plan)}`,
    `outputContract=${outputContractDescription(plan)}`,
    "PASS requires findings=[]. REVISE requires one or more closed findings. This review has authority none.",
  ].join("\n");
}

function packetBody(request: CopilotFuryPlanDispatchRequestV1, plan: TransitionPlanV1OrV2, card: ResolvedCard, observation: RepositoryObservation, configuration: CopilotFurySdkConfigurationV1) {
  return deepFreeze({
    schemaVersion: 1,
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
    authority: "none",
    request,
    transitionPlan: plan,
    cardIdentity: card.identity,
    cardBodyDigest: digestHex(card.card.body),
    missionJournal: { digest: observation.journalDigest, sequence: observation.journalSequence },
    outputContract: outputContractDescription(plan),
    sdkConfiguration: configuration,
  });
}

async function ensureEvidenceDirectory(repositoryRoot: string, missionId: string): Promise<{ absolute: string; relative: string }> {
  const missionKey = digestHex(missionId);
  const components = [".shield", "audit", "copilot-fury-plan-dispatch", missionKey];
  let current = repositoryRoot;
  for (const component of components) {
    current = join(current, component);
    try { await mkdir(current, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const stats = await lstat(current);
    if (!stats.isDirectory() || stats.isSymbolicLink() || await realpath(current) !== current) throw new Error("evidence_directory_unsafe");
  }
  return { absolute: current, relative: components.join("/") };
}

function derivedEvidenceDirectory(repositoryRoot: string, missionId: string): { absolute: string; relative: string } {
  const relativePath = `${COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_ROOT}/${digestHex(missionId)}`;
  return { absolute: join(repositoryRoot, ...relativePath.split("/")), relative: relativePath };
}

async function validateEvidencePathBeforeClaim(repositoryRoot: string, missionId: string): Promise<void> {
  const directory = derivedEvidenceDirectory(repositoryRoot, missionId);
  let current = repositoryRoot;
  for (const component of directory.relative.split("/")) {
    current = join(current, component);
    try {
      const stats = await lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("evidence_directory_unsafe");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

async function existingEvidenceDirectory(repositoryRoot: string, missionId: string): Promise<{ absolute: string; relative: string } | null> {
  const directory = derivedEvidenceDirectory(repositoryRoot, missionId);
  let current = repositoryRoot;
  for (const component of directory.relative.split("/")) {
    current = join(current, component);
    const stats = await lstat(current).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (stats === null) return null;
    if (!stats.isDirectory() || stats.isSymbolicLink() || await realpath(current) !== current) throw new Error("evidence_directory_unsafe");
  }
  return directory;
}

async function assertEvidenceDirectory(directory: { absolute: string; relative: string }): Promise<void> {
  const components = directory.relative.split("/");
  const repositoryRoot = resolve(directory.absolute, ...components.map(() => ".."));
  if (join(repositoryRoot, ...components) !== directory.absolute || await realpath(repositoryRoot) !== repositoryRoot) throw new Error("evidence_directory_identity_mismatch");
  let current = repositoryRoot;
  for (const component of components) {
    current = join(current, component);
    const stats = await lstat(current);
    if (!stats.isDirectory() || stats.isSymbolicLink() || await realpath(current) !== current) throw new Error("evidence_directory_unsafe");
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function readExactArtifact(path: string, expectedBytes: string): Promise<void> {
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1 || stats.size !== Buffer.byteLength(expectedBytes, "utf8")) throw new Error("artifact_readback_unsafe");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    if (bytes !== expectedBytes || opened.dev !== stats.dev || opened.ino !== stats.ino || opened.nlink !== 1 || after.dev !== opened.dev || after.ino !== opened.ino || after.nlink !== 1 || after.size !== opened.size) throw new Error("artifact_readback_mismatch");
  } finally { await handle.close(); }
}

async function writeContentAddressedArtifact(directory: { absolute: string; relative: string }, prefix: string, digest: string, bytes: string): Promise<string> {
  await assertEvidenceDirectory(directory);
  const token = digest.replace(/^sha256:/u, "");
  if (!/^[A-Za-z0-9_-]{6,}$/u.test(token) || !/^[a-z][a-z0-9-]*$/u.test(prefix)) throw new Error("artifact_identity_invalid");
  const filename = `${prefix}-${token}.json`;
  const finalPath = join(directory.absolute, filename);
  try {
    await readExactArtifact(finalPath, bytes);
    return `${directory.relative}/${filename}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const tempPath = join(directory.absolute, `.${filename}.${randomBytes(12).toString("hex")}.tmp`);
  let handle;
  try {
    handle = await open(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const written = await handle.write(bytes, null, "utf8");
    if (written.bytesWritten !== Buffer.byteLength(bytes, "utf8")) throw new Error("artifact_partial_write");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertEvidenceDirectory(directory);
    await link(tempPath, finalPath);
    await unlink(tempPath);
    await syncDirectory(directory.absolute);
    await assertEvidenceDirectory(directory);
    await readExactArtifact(finalPath, bytes);
    return `${directory.relative}/${filename}`;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(tempPath).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      await readExactArtifact(finalPath, bytes);
      return `${directory.relative}/${filename}`;
    }
    throw error;
  }
}

function receiptRuntimeObservation(observations: CopilotFuryExecutorObservationsV1, evidenceRef: string): SeatDispatchRuntimeHostObservation {
  return { kind: "runtime.host_observed", runtimeId: observations.runtimeId, model: observations.assistantModel, evidenceRefs: [evidenceRef] };
}

function receiptExecutorObservation(observations: CopilotFuryExecutorObservationsV1, evidenceRef: string): SeatDispatchExecutorHostObservation {
  return { kind: "executor.host_observed", executorId: observations.executorId, evidenceRefs: [evidenceRef] };
}

async function appendLifecycle(
  request: CopilotFuryPlanDispatchRequestV1,
  receipt: SeatDispatchReceiptProjectionV1,
  kind: "dispatch.completed" | "dispatch.failed" | "dispatch.cancelled" | "dispatch.interrupted",
  timestamp: string,
  observations: CopilotFuryExecutorObservationsV1 | null,
  evidenceRefs: readonly string[],
  dependencies: Required<Pick<CopilotFuryPlanDispatchDependenciesV1, "appendDispatchReceipt" | "readDispatchLedger">>,
  interruptionDisposition?: Readonly<{ code: string; errors: readonly string[] }>,
): Promise<SeatDispatchReceiptProjectionV1> {
  const ledger = await dependencies.readDispatchLedger({ repositoryRoot: request.repositoryRoot, repositoryId: request.repositoryId, repositoryWorkspaceId: request.repositoryWorkspaceId });
  if (ledger.state === "invalid") throw new Error(`dispatch_ledger_read_failed:${ledger.code}`);
  const latest = ledger.value.projections.find((candidate) => candidate.receiptId === receipt.receiptId);
  if (latest === undefined || latest.state !== "started") throw new Error("dispatch_receipt_not_started");
  const lastEntry = ledger.value.entries.at(-1);
  const base = {
    kind,
    receiptId: latest.receiptId,
    dispatchId: latest.dispatchId,
    parentMissionId: latest.parentMissionId,
    parentMissionRevision: latest.parentMissionRevision,
    parentSessionId: latest.parentSessionId,
    childTaskId: latest.childTaskId,
    childSessionId: latest.childSessionId,
    accountableSeatId: latest.accountableSeatId,
    repositoryId: latest.repositoryId,
    repositoryWorkspaceId: latest.repositoryWorkspaceId,
    repositoryRevision: latest.repositoryRevision,
    subjectId: latest.subjectId,
    subjectRevision: latest.subjectRevision,
    artifactId: latest.artifactId,
    artifactRevision: latest.artifactRevision,
    configuredRuntime: latest.configuredRuntime,
    requestedRuntime: latest.requestedRuntime,
    toolExecution: latest.toolExecution,
    runtimeSelfReport: { kind: "runtime.self_report.unavailable" as const, reason: "not_reported" as const },
    runtimeHostObserved: observations === null ? { kind: "runtime.host_observed.unavailable" as const, reason: "unobserved" as const } : receiptRuntimeObservation(observations, evidenceRefs[0] ?? latest.artifactRevision),
    executorSelfReport: { kind: "executor.self_report.unavailable" as const, reason: "not_reported" as const },
    executorHostObserved: observations === null ? { kind: "executor.host_observed.unavailable" as const, reason: "not_observed" as const } : receiptExecutorObservation(observations, evidenceRefs[0] ?? latest.artifactRevision),
    timestamp,
    logSequence: (lastEntry?.logSequence ?? -1) + 1,
    previousLogDigest: lastEntry?.entryDigest ?? null,
    lifecycleSequence: latest.lifecycleSequence + 1,
    previousLifecycleDigest: latest.lastEntryDigest,
  };
  if (kind === "dispatch.interrupted" && interruptionDisposition === undefined) throw new Error("interruption_disposition_missing");
  const event = kind === "dispatch.interrupted"
    ? createSeatDispatchLifecycleEventV1({
      ...base,
      recoveryEvidenceRefs: [...evidenceRefs],
      originalDisposition: { code: interruptionDisposition?.code, errors: [...(interruptionDisposition?.errors ?? [])] },
    } as unknown as Parameters<typeof createSeatDispatchLifecycleEventV1>[0])
    : createSeatDispatchLifecycleEventV1({ ...base, outputEvidenceRefs: [...evidenceRefs] } as unknown as Parameters<typeof createSeatDispatchLifecycleEventV1>[0]);
  const appended = await dependencies.appendDispatchReceipt({ repositoryRoot: request.repositoryRoot, repositoryId: request.repositoryId, repositoryWorkspaceId: request.repositoryWorkspaceId, lockOwnerId: `terminal:${receipt.receiptId}`, event });
  if (appended.state === "invalid") throw new Error(`dispatch_terminal_append_failed:${appended.code}`);
  return appended.value.receipt;
}

function evidenceBody(input: {
  request: CopilotFuryPlanDispatchRequestV1;
  plan: TransitionPlanV1OrV2;
  packetId: string;
  packetDigest: string;
  receiptId: string;
  card: ResolvedCard;
  observation: RepositoryObservation;
  packetConfiguration: CopilotFurySdkConfigurationV1;
  executionConfiguration: CopilotFurySdkConfigurationV1;
  outcome: "PASS" | "REVISE" | "failed" | "cancelled" | "interrupted";
  dispositionCode: string | null;
  modelResult: CopilotFuryPlanResultV1 | null;
  observations: CopilotFuryExecutorObservationsV1 | Partial<CopilotFuryExecutorObservationsV1>;
  errors: readonly string[];
  artifacts: Readonly<{ transitionPlanPath: string | null; reviewArtifactPath: string | null }>;
  recovery?: RecoveryBindingV2 | null;
}) {
  const common = {
    authority: "none",
    packetId: input.packetId,
    packetDigest: input.packetDigest,
    packet: packetBody(input.request, input.plan, input.card, input.observation, input.packetConfiguration),
    receiptId: input.receiptId,
    missionId: input.request.missionId,
    missionRevision: input.request.missionRevision,
    subjectId: input.request.subjectId,
    subjectRevision: input.request.subjectRevision,
    repositoryId: input.request.repositoryId,
    repositoryWorkspaceId: input.request.repositoryWorkspaceId,
    repositoryRevision: input.request.headRevision,
    transitionPlanRawSha256: input.request.transitionPlanRawSha256,
    cardIdentity: input.card.identity,
    sdkConfiguration: input.packetConfiguration,
    missionJournal: { digest: input.observation.journalDigest, sequence: input.observation.journalSequence },
    outcome: input.outcome,
    dispositionCode: input.dispositionCode,
    modelResult: input.modelResult,
    observations: input.observations,
    errors: [...input.errors],
    artifacts: input.artifacts,
  };
  return input.recovery === undefined || input.recovery === null
    ? deepFreeze({ schemaVersion: 1, contractVersion: COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION, ...common })
    : deepFreeze({ schemaVersion: 3, contractVersion: COPILOT_FURY_PLAN_DISPATCH_SUCCESSOR_EVIDENCE_CONTRACT_VERSION_V3, ...common, executionSdkConfiguration: input.executionConfiguration, recovery: input.recovery });
}

function evidenceWithDigest(body: ReturnType<typeof evidenceBody>) {
  const evidenceDigest = digestBase64Url(`${body.contractVersion}\0${canonicalJson(body)}`);
  return deepFreeze({ ...body, evidenceDigest });
}

async function verifyLiveBinding(request: CopilotFuryPlanDispatchRequestV1, initial: RepositoryObservation, initialPlan: StableFile, initialCard: ResolvedCard, userCopilotHome?: string): Promise<RepositoryObservation> {
  const current = await observeRepository(request);
  const plan = await stableExactHeadTransitionPlan(request);
  const card = await resolveCard(request, userCopilotHome);
  if (current.identity !== initial.identity || current.configBytes !== initial.configBytes || current.journalBytes !== initial.journalBytes || current.journalDigest !== initial.journalDigest || current.journalSequence !== initial.journalSequence || plan.identity !== initialPlan.identity || plan.bytes !== initialPlan.bytes || plan.rawSha256 !== initialPlan.rawSha256 || card.bytes !== initialCard.bytes || canonicalJson(card.identity) !== canonicalJson(initialCard.identity)) throw new Error("dispatch_input_drift");
  return current;
}

async function parseEvidenceFile(repositoryRoot: string, relativePath: string): Promise<Plain> {
  const file = await stableTextFile(repositoryRoot, relativePath, "dispatch_evidence", MAX_EVIDENCE_BYTES);
  let parsed: unknown;
  try { parsed = parseJsonRejectDuplicateKeys(file.bytes); } catch { throw new Error("dispatch_evidence_malformed"); }
  if (!safePlain(parsed) || (parsed.contractVersion !== COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION && parsed.contractVersion !== COPILOT_FURY_PLAN_DISPATCH_SUCCESSOR_EVIDENCE_CONTRACT_VERSION && parsed.contractVersion !== COPILOT_FURY_PLAN_DISPATCH_SUCCESSOR_EVIDENCE_CONTRACT_VERSION_V3) || typeof parsed.evidenceDigest !== "string") throw new Error("dispatch_evidence_malformed");
  const { evidenceDigest, ...body } = parsed;
  if (evidenceDigest !== digestBase64Url(`${parsed.contractVersion}\0${canonicalJson(body)}`)) throw new Error("dispatch_evidence_digest_mismatch");
  if (relativePath.split("/").at(-1) !== `dispatch-evidence-${evidenceDigest.slice("sha256:".length)}.json`) throw new Error("dispatch_evidence_path_digest_mismatch");
  return parsed;
}

async function readReceiptForFinalProof(
  request: CopilotFuryPlanDispatchRequestV1,
  receiptId: string,
  plan: TransitionPlanV1OrV2,
  expectedState: "completed" | "failed" | "cancelled" | "interrupted",
  dependencies: Required<Pick<CopilotFuryPlanDispatchDependenciesV1, "readDispatchLedger">>,
): Promise<SeatDispatchReceiptProjectionV1> {
  const ledger = await dependencies.readDispatchLedger({ repositoryRoot: request.repositoryRoot, repositoryId: request.repositoryId, repositoryWorkspaceId: request.repositoryWorkspaceId });
  if (ledger.state === "invalid") throw new Error(`terminal_receipt_readback_failed:${ledger.code}`);
  const matches = ledger.value.projections.filter((candidate) => candidate.receiptId === receiptId);
  if (matches.length !== 1) throw new Error("terminal_receipt_readback_ambiguous");
  const receipt = matches[0];
  if (receipt.state !== expectedState || receipt.parentMissionId !== request.missionId || receipt.parentMissionRevision !== request.missionRevision || receipt.parentSessionId !== request.parentSessionId || receipt.accountableSeatId !== "fury" || receipt.repositoryId !== request.repositoryId || receipt.repositoryWorkspaceId !== request.repositoryWorkspaceId || receipt.repositoryRevision !== request.headRevision || receipt.subjectId !== request.subjectId || receipt.subjectRevision !== request.subjectRevision || receipt.artifactId !== plan.id || receipt.artifactRevision !== plan.digest) throw new Error("terminal_receipt_binding_mismatch");
  return receipt;
}

async function terminalEvidencePathFromReceipt(request: CopilotFuryPlanDispatchRequestV1, receipt: SeatDispatchReceiptProjectionV1, packetDigest: string): Promise<string> {
  if (receipt.outputEvidenceRefs === null) throw new Error("terminal_evidence_refs_unavailable");
  const directory = await existingEvidenceDirectory(request.repositoryRoot, request.missionId);
  if (directory === null) throw new Error("terminal_evidence_directory_unavailable");
  const matches: string[] = [];
  for (const evidenceDigest of receipt.outputEvidenceRefs.filter((ref) => DIGEST.test(ref))) {
    const relativePath = `${directory.relative}/dispatch-evidence-${evidenceDigest.slice("sha256:".length)}.json`;
    let evidence: Plain;
    try {
      evidence = await parseEvidenceFile(request.repositoryRoot, relativePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (evidence.evidenceDigest !== evidenceDigest) throw new Error("terminal_evidence_digest_binding_mismatch");
    if (evidence.receiptId === receipt.receiptId && evidence.packetDigest === packetDigest) matches.push(relativePath);
  }
  if (matches.length !== 1) throw new Error(matches.length === 0 ? "terminal_evidence_unavailable" : "terminal_evidence_ambiguous");
  return matches[0];
}

function recoveryInputEvidenceBinding(input: Omit<RecoveryBindingV2, "inputEvidenceBinding" | "successorExecutionIdentity">): string {
  const token = digestBase64Url(`${COPILOT_FURY_PLAN_DISPATCH_RECOVERY_PROTOCOL}\0${canonicalJson(input)}`).slice("sha256:".length);
  return `evidence:copilot-fury-recovery-v1:${token}`;
}

function normalizedReceiptTimestamp(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error("predecessor_started_at_invalid");
  return new Date(milliseconds).toISOString();
}

function predecessorClaimEvidence(
  request: CopilotFuryPlanDispatchRequestV1,
  plan: TransitionPlanV1OrV2,
  card: ResolvedCard,
  observation: RepositoryObservation,
  identity: Readonly<{ claimKey: string }>,
  packetDigest: string,
): readonly string[] {
  const callerEvidence = [plan.id, plan.digest, `sha256:${request.transitionPlanRawSha256}`, `sha256:${card.identity.contentDigest}`, observation.journalDigest];
  return Object.freeze([
    ...new Set(callerEvidence),
    `evidence:packet-binding:seat-dispatch-v1:${identity.claimKey}:${packetDigest}`,
  ]);
}

export function evaluateCopilotFuryRecoveryEligibilityV1(
  receipt: SeatDispatchReceiptProjectionV1,
  expected: CopilotFuryRecoveryClaimExpectationV1,
  allowlistedReceiptId: string,
): CopilotFuryRecoveryEligibilityV1 {
  if (receipt.state !== "failed" || receipt.receiptId !== allowlistedReceiptId) return Object.freeze({ state: "not_allowlisted" });
  const matches = receipt.receiptId === expected.receiptId && receipt.dispatchId === expected.dispatchId && receipt.childTaskId === expected.childTaskId && receipt.childSessionId === expected.childSessionId && receipt.parentMissionId === expected.parentMissionId && receipt.parentMissionRevision === expected.parentMissionRevision && receipt.parentSessionId === expected.parentSessionId && receipt.accountableSeatId === expected.accountableSeatId && receipt.repositoryId === expected.repositoryId && receipt.repositoryWorkspaceId === expected.repositoryWorkspaceId && receipt.repositoryRevision === expected.repositoryRevision && receipt.subjectId === expected.subjectId && receipt.subjectRevision === expected.subjectRevision && receipt.artifactId === expected.artifactId && receipt.artifactRevision === expected.artifactRevision && canonicalJson(receipt.configuredRuntime) === canonicalJson(expected.configuredRuntime) && canonicalJson(receipt.requestedRuntime) === canonicalJson(expected.requestedRuntime) && canonicalJson(receipt.toolExecution) === canonicalJson(expected.toolExecution) && receipt.startedAt === expected.startedAt && sameArray(receipt.inputEvidenceRefs, expected.inputEvidenceRefs);
  if (!matches) return Object.freeze({ state: "invalid", code: "RECOVERABLE_PREDECESSOR_CLAIM_MISMATCH" });
  return Object.freeze({
    state: "eligible",
    successor: recoverySuccessorCore(receipt.parentMissionId, receipt.parentSessionId, receipt.receiptId, receipt.lastEntryDigest),
  });
}

async function recoverablePredecessor(
  request: CopilotFuryPlanDispatchRequestV1,
  receipt: SeatDispatchReceiptProjectionV1,
  projections: readonly SeatDispatchReceiptProjectionV1[],
  packetBytes: Uint8Array,
  packetDigest: string,
  predecessorIdentity: ReturnType<typeof deriveSessionIdentity>,
  expectedInputEvidenceRefs: readonly string[],
  plan: TransitionPlanV1OrV2,
): Promise<Readonly<{ packetBytes: Uint8Array; packetDigest: string; successor: ReturnType<typeof claimIdentity>; executionIdentity: CopilotFuryExecutionIdentityV1; startedAt: string; binding: RecoveryBindingV2 }> | null> {
  const eligibility = evaluateCopilotFuryRecoveryEligibilityV1(receipt, {
    receiptId: predecessorIdentity.receiptId,
    dispatchId: `dispatch:${predecessorIdentity.claimKey}`,
    childTaskId: predecessorIdentity.childTaskId,
    childSessionId: predecessorIdentity.childSessionId,
    parentMissionId: request.missionId,
    parentMissionRevision: request.missionRevision,
    parentSessionId: request.parentSessionId,
    accountableSeatId: "fury",
    repositoryId: request.repositoryId,
    repositoryWorkspaceId: request.repositoryWorkspaceId,
    repositoryRevision: request.headRevision,
    subjectId: request.subjectId,
    subjectRevision: request.subjectRevision,
    artifactId: plan.id,
    artifactRevision: plan.digest,
    configuredRuntime: predecessorIdentity.configuredRuntime,
    requestedRuntime: predecessorIdentity.requestedRuntime,
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: request.requestedExecutor },
    startedAt: normalizedReceiptTimestamp(request.timestamp.value),
    inputEvidenceRefs: expectedInputEvidenceRefs,
  }, COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID);
  if (eligibility.state === "not_allowlisted") return null;
  if (eligibility.state === "invalid") throw new Error("recoverable_predecessor_receipt_binding_mismatch");
  const evidencePath = await terminalEvidencePathFromReceipt(request, receipt, packetDigest);
  const evidence = await parseEvidenceFile(request.repositoryRoot, evidencePath);
  if (evidence.dispositionCode !== RECOVERABLE_FAILURE_CODE || canonicalJson(evidence.errors) !== canonicalJson([RECOVERABLE_FAILURE_MESSAGE])) return null;
  if (receipt.outputEvidenceRefs === null || receipt.outputEvidenceRefs.length !== 1 || !DIGEST.test(receipt.outputEvidenceRefs[0])) throw new Error("recoverable_predecessor_evidence_ambiguous");
  if (evidence.schemaVersion !== 1 || evidence.contractVersion !== COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION || evidence.evidenceDigest !== receipt.outputEvidenceRefs[0] || evidence.receiptId !== receipt.receiptId || evidence.packetDigest !== packetDigest || evidence.outcome !== "failed") throw new Error("recoverable_predecessor_signature_mismatch");
  if (evidence.missionId !== request.missionId || evidence.missionRevision !== request.missionRevision || evidence.subjectId !== request.subjectId || evidence.subjectRevision !== request.subjectRevision || evidence.repositoryId !== request.repositoryId || evidence.repositoryWorkspaceId !== request.repositoryWorkspaceId || evidence.repositoryRevision !== request.headRevision || evidence.transitionPlanRawSha256 !== request.transitionPlanRawSha256) throw new Error("recoverable_predecessor_binding_mismatch");
  if (!safePlain(evidence.packet)) throw new Error("recoverable_predecessor_packet_malformed");
  const reconstructed = new TextEncoder().encode(canonicalJson(evidence.packet));
  if (digestBase64Url(reconstructed) !== packetDigest || Buffer.compare(Buffer.from(reconstructed), Buffer.from(packetBytes)) !== 0) throw new Error("recoverable_predecessor_packet_mismatch");
  const successor = claimIdentity(request, eligibility.successor.packetId);
  if (successor.claimKey !== eligibility.successor.claimKey || successor.receiptId !== eligibility.successor.receiptId || successor.childTaskId !== eligibility.successor.childTaskId || successor.childSessionId !== eligibility.successor.childSessionId) throw new Error("recovery_successor_mechanics_mismatch");
  const successorExecutionIdentity = executionIdentity(request.repositoryRoot, successor);
  const predecessorBinding = deepFreeze({
    protocol: COPILOT_FURY_PLAN_DISPATCH_RECOVERY_PROTOCOL,
    predecessorReceiptId: receipt.receiptId,
    predecessorTerminalEntryDigest: receipt.lastEntryDigest,
    failedEvidenceDigest: evidence.evidenceDigest as string,
    originalPacketDigest: packetDigest,
  });
  const inputEvidenceBinding = recoveryInputEvidenceBinding(predecessorBinding);
  const terminalTime = Date.parse(receipt.lastEventTimestamp);
  if (!Number.isFinite(terminalTime)) throw new Error("recoverable_predecessor_timestamp_invalid");
  const firstRecovery = Object.freeze({
    packetBytes: new Uint8Array(reconstructed),
    packetDigest,
    successor,
    executionIdentity: successorExecutionIdentity,
    startedAt: new Date(terminalTime + 1).toISOString(),
    binding: { ...predecessorBinding, inputEvidenceBinding, successorExecutionIdentity },
  });
  let activeRecovery: Readonly<{
    packetBytes: Uint8Array;
    packetDigest: string;
    successor: ReturnType<typeof claimIdentity>;
    executionIdentity: CopilotFuryExecutionIdentityV1;
    startedAt: string;
    binding: RecoveryBindingV2;
  }> = firstRecovery;
  const recoverySignatures = [
    {
      receiptId: COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_SUCCESSOR_RECEIPT_ID,
      dispositionCode: RECOVERABLE_FAILURE_CODE,
      errors: [RECOVERABLE_SUCCESSOR_FAILURE_MESSAGE],
    },
    {
      receiptId: COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RESULT_RECEIPT_ID,
      dispositionCode: "DISPATCH_FAILED",
      errors: ["invalid_fury_model_result"],
    },
  ] as const;
  for (const signature of recoverySignatures) {
    const failedSuccessors = projections.filter((candidate) => candidate.receiptId === activeRecovery.successor.receiptId);
    if (failedSuccessors.length === 0) return activeRecovery;
    if (failedSuccessors.length !== 1) throw new Error("recoverable_successor_receipt_ambiguous");
    const failedSuccessor = failedSuccessors[0];
    const successorExpectedInputEvidence = Object.freeze([
      ...expectedInputEvidenceRefs.slice(0, -1),
      activeRecovery.binding.inputEvidenceBinding,
      `evidence:packet-binding:seat-dispatch-v1:${activeRecovery.successor.claimKey}:${packetDigest}`,
    ]);
    const successorEligibility = evaluateCopilotFuryRecoveryEligibilityV1(failedSuccessor, {
      receiptId: activeRecovery.successor.receiptId,
      dispatchId: `dispatch:${activeRecovery.successor.claimKey}`,
      childTaskId: activeRecovery.successor.childTaskId,
      childSessionId: activeRecovery.successor.childSessionId,
      parentMissionId: request.missionId,
      parentMissionRevision: request.missionRevision,
      parentSessionId: request.parentSessionId,
      accountableSeatId: "fury",
      repositoryId: request.repositoryId,
      repositoryWorkspaceId: request.repositoryWorkspaceId,
      repositoryRevision: request.headRevision,
      subjectId: request.subjectId,
      subjectRevision: request.subjectRevision,
      artifactId: plan.id,
      artifactRevision: plan.digest,
      configuredRuntime: activeRecovery.successor.configuredRuntime,
      requestedRuntime: activeRecovery.successor.requestedRuntime,
      toolExecution: { kind: "tool.execution.requested", executorBindingRef: request.requestedExecutor },
      startedAt: activeRecovery.startedAt,
      inputEvidenceRefs: successorExpectedInputEvidence,
    }, signature.receiptId);
    if (successorEligibility.state === "not_allowlisted") return activeRecovery;
    if (successorEligibility.state === "invalid") throw new Error("recoverable_successor_receipt_binding_mismatch");
    const failedSuccessorEvidencePath = await terminalEvidencePathFromReceipt(request, failedSuccessor, packetDigest);
    const failedSuccessorEvidence = await parseEvidenceFile(request.repositoryRoot, failedSuccessorEvidencePath);
    if (failedSuccessorEvidence.dispositionCode !== signature.dispositionCode || canonicalJson(failedSuccessorEvidence.errors) !== canonicalJson(signature.errors)) return activeRecovery;
    if (failedSuccessor.outputEvidenceRefs === null || failedSuccessor.outputEvidenceRefs.length !== 1 || !DIGEST.test(failedSuccessor.outputEvidenceRefs[0])) throw new Error("recoverable_successor_evidence_ambiguous");
    if (failedSuccessorEvidence.evidenceDigest !== failedSuccessor.outputEvidenceRefs[0] || failedSuccessorEvidence.receiptId !== failedSuccessor.receiptId || failedSuccessorEvidence.packetDigest !== packetDigest || failedSuccessorEvidence.outcome !== "failed") throw new Error("recoverable_successor_signature_mismatch");
    if (failedSuccessorEvidence.missionId !== request.missionId || failedSuccessorEvidence.missionRevision !== request.missionRevision || failedSuccessorEvidence.subjectId !== request.subjectId || failedSuccessorEvidence.subjectRevision !== request.subjectRevision || failedSuccessorEvidence.repositoryId !== request.repositoryId || failedSuccessorEvidence.repositoryWorkspaceId !== request.repositoryWorkspaceId || failedSuccessorEvidence.repositoryRevision !== request.headRevision || failedSuccessorEvidence.transitionPlanRawSha256 !== request.transitionPlanRawSha256) throw new Error("recoverable_successor_binding_mismatch");
    validateSuccessorEvidence(failedSuccessorEvidence, failedSuccessor, activeRecovery.binding);
    const nextSuccessor = claimIdentity(request, successorEligibility.successor.packetId);
    if (nextSuccessor.claimKey !== successorEligibility.successor.claimKey || nextSuccessor.receiptId !== successorEligibility.successor.receiptId || nextSuccessor.childTaskId !== successorEligibility.successor.childTaskId || nextSuccessor.childSessionId !== successorEligibility.successor.childSessionId) throw new Error("recovery_next_successor_mechanics_mismatch");
    const nextExecutionIdentity = executionIdentity(request.repositoryRoot, nextSuccessor);
    const nextPredecessorBinding = deepFreeze({
      protocol: COPILOT_FURY_PLAN_DISPATCH_RECOVERY_PROTOCOL,
      predecessorReceiptId: failedSuccessor.receiptId,
      predecessorTerminalEntryDigest: failedSuccessor.lastEntryDigest,
      failedEvidenceDigest: failedSuccessorEvidence.evidenceDigest as string,
      originalPacketDigest: packetDigest,
    });
    const nextInputEvidenceBinding = recoveryInputEvidenceBinding(nextPredecessorBinding);
    const successorTerminalTime = Date.parse(failedSuccessor.lastEventTimestamp);
    if (!Number.isFinite(successorTerminalTime)) throw new Error("recoverable_successor_timestamp_invalid");
    activeRecovery = Object.freeze({
      packetBytes: new Uint8Array(reconstructed),
      packetDigest,
      successor: nextSuccessor,
      executionIdentity: nextExecutionIdentity,
      startedAt: new Date(successorTerminalTime + 1).toISOString(),
      binding: { ...nextPredecessorBinding, inputEvidenceBinding: nextInputEvidenceBinding, successorExecutionIdentity: nextExecutionIdentity },
    });
  }
  return activeRecovery;
}

function validateSuccessorEvidence(evidence: Plain, receipt: SeatDispatchReceiptProjectionV1, recovery: RecoveryBindingV2): void {
  const legacyV2 = evidence.schemaVersion === 2 && evidence.contractVersion === COPILOT_FURY_PLAN_DISPATCH_SUCCESSOR_EVIDENCE_CONTRACT_VERSION;
  const boundV3 = evidence.schemaVersion === 3 && evidence.contractVersion === COPILOT_FURY_PLAN_DISPATCH_SUCCESSOR_EVIDENCE_CONTRACT_VERSION_V3;
  if ((!legacyV2 && !boundV3) || !safePlain(evidence.recovery) || canonicalJson(evidence.recovery) !== canonicalJson(recovery)) throw new Error("successor_evidence_binding_mismatch");
  if (!receipt.inputEvidenceRefs.includes(recovery.inputEvidenceBinding) || receipt.receiptId !== recovery.successorExecutionIdentity.receiptId || receipt.childSessionId !== recovery.successorExecutionIdentity.childSessionId || receipt.childTaskId !== recovery.successorExecutionIdentity.childTaskId) throw new Error("successor_receipt_binding_mismatch");
  if (boundV3) {
    if (!safePlain(evidence.packet) || digestBase64Url(new TextEncoder().encode(canonicalJson(evidence.packet))) !== recovery.originalPacketDigest || evidence.packetDigest !== recovery.originalPacketDigest) throw new Error("successor_packet_binding_mismatch");
    if (!safePlain(evidence.packet.sdkConfiguration) || canonicalJson(evidence.sdkConfiguration) !== canonicalJson(evidence.packet.sdkConfiguration) || !validateCopilotFurySuccessorExecutionConfigurationV3(evidence.packet.sdkConfiguration, evidence.executionSdkConfiguration, recovery.successorExecutionIdentity.childSessionId)) throw new Error("successor_execution_configuration_mismatch");
  }
}

async function replayExisting(request: CopilotFuryPlanDispatchRequestV1, claim: Extract<SeatDispatchPacketClaimContractResultV1, { state: "valid" }>["value"], recovery: RecoveryBindingV2 | null = null): Promise<CopilotFuryPlanDispatchResultV1> {
  const receipt = claim.receipt;
  const common = {
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
    authority: "none" as const,
    missionId: request.missionId,
    receiptId: receipt.receiptId,
    replayed: true,
  };
  if (receipt.state === "interrupted" && receipt.recoveryEvidenceRefs !== null && receipt.originalDisposition !== null) {
    if (receipt.recoveryEvidenceRefs.length !== 1) throw new Error("interrupted_recovery_binding_ambiguous");
    const directory = await existingEvidenceDirectory(request.repositoryRoot, request.missionId);
    const evidenceDigest = receipt.recoveryEvidenceRefs[0];
    if (directory === null || !DIGEST.test(evidenceDigest)) throw new Error("interrupted_recovery_evidence_unavailable");
    const evidencePath = `${directory.relative}/dispatch-evidence-${evidenceDigest.slice("sha256:".length)}.json`;
    const evidence = await parseEvidenceFile(request.repositoryRoot, evidencePath);
    if (evidence.evidenceDigest !== evidenceDigest || evidence.receiptId !== receipt.receiptId || evidence.packetDigest !== claim.packetDigest || evidence.outcome !== "interrupted" || evidence.dispositionCode !== receipt.originalDisposition.code || canonicalJson(evidence.errors) !== canonicalJson(receipt.originalDisposition.errors)) throw new Error("interrupted_recovery_binding_mismatch");
    return deepFreeze({ ...common, state: "recovery_required" as const, code: receipt.originalDisposition.code, errors: [...receipt.originalDisposition.errors], evidencePath, handoff: null });
  }
  if (receipt.state === "started" || receipt.state === "resumed" || receipt.state === "interrupted") {
    return deepFreeze({ ...common, state: "recovery_required" as const, code: "RECOVERY_REQUIRED", errors: ["Existing dispatch is nonterminal and cannot be reinvoked."], evidencePath: null, handoff: null });
  }
  const evidencePath = await terminalEvidencePathFromReceipt(request, receipt, claim.packetDigest);
  const evidence = await parseEvidenceFile(request.repositoryRoot, evidencePath);
  if (recovery !== null) validateSuccessorEvidence(evidence, receipt, recovery);
  if (receipt.outputEvidenceRefs === null || !receipt.outputEvidenceRefs.includes(evidence.evidenceDigest as string)) throw new Error("dispatch_evidence_receipt_binding_mismatch");
  if (receipt.state === "failed" || receipt.state === "cancelled") {
    const dispositionCode = typeof evidence.dispositionCode === "string" && id(evidence.dispositionCode) ? evidence.dispositionCode : String(evidence.outcome).toUpperCase();
    return deepFreeze({ ...common, state: receipt.state, code: dispositionCode, errors: Array.isArray(evidence.errors) ? evidence.errors.filter((value): value is string => typeof value === "string") : [], evidencePath, handoff: null });
  }
  if (evidence.outcome === "REVISE") {
    const planFile = await stableTextFile(request.repositoryRoot, request.transitionPlanPath, "replayed_input_transition_plan");
    let planInput: unknown;
    try { planInput = JSON.parse(planFile.bytes); } catch { throw new Error("replayed_input_transition_plan_malformed"); }
    const plan = validateTransitionPlanV1OrV2({ artifact: planInput });
    if (plan.state === "invalid") throw new Error("replayed_input_transition_plan_invalid");
    const modelResult = validateCopilotFuryPlanResultV1(evidence.modelResult, plan.value);
    if (modelResult.state === "invalid" || modelResult.value.verdict !== "REVISE") throw new Error("replayed_model_result_invalid");
    return deepFreeze({ ...common, state: "completed" as const, disposition: "REVISE" as const, findings: [...modelResult.value.findings], evidencePath, handoff: null });
  }
  if (evidence.outcome !== "PASS" || !safePlain(evidence.artifacts) || typeof evidence.artifacts.transitionPlanPath !== "string" || typeof evidence.artifacts.reviewArtifactPath !== "string") throw new Error("dispatch_evidence_outcome_invalid");
  const planFile = await stableTextFile(request.repositoryRoot, evidence.artifacts.transitionPlanPath, "replayed_transition_plan");
  const reviewFile = await stableTextFile(request.repositoryRoot, evidence.artifacts.reviewArtifactPath, "replayed_review_artifact");
  let planInput: unknown;
  let reviewInput: unknown;
  try {
    planInput = JSON.parse(planFile.bytes);
    reviewInput = JSON.parse(reviewFile.bytes);
  } catch { throw new Error("replayed_handoff_artifact_malformed"); }
  const plan = validateTransitionPlanV1OrV2({ artifact: planInput });
  const review = validateMissionTransitionPlanReviewV1(reviewInput);
  if (plan.state === "invalid" || review.state === "invalid") throw new Error("replayed_handoff_artifact_invalid");
  if (plan.value.missionId !== request.missionId || plan.value.subjectId !== request.subjectId || plan.value.repositoryId !== request.repositoryId || plan.value.planningBaseRevision !== request.planningBaseRevision || plan.value.digest !== request.subjectRevision) throw new Error("replayed_transition_plan_binding_mismatch");
  if (evidence.artifacts.transitionPlanPath.split("/").at(-1) !== `transition-plan-${plan.value.digest.slice("sha256:".length)}.json` || evidence.artifacts.reviewArtifactPath.split("/").at(-1) !== `transition-plan-review-${review.value.reviewDigest.slice("sha256:".length)}.json`) throw new Error("replayed_handoff_path_digest_mismatch");
  if (review.value.missionId !== plan.value.missionId || review.value.subjectId !== plan.value.subjectId || review.value.repositoryId !== plan.value.repositoryId || review.value.transitionPlanId !== plan.value.id || review.value.transitionPlanDigest !== plan.value.digest || review.value.reviewedArtifactId !== plan.value.id || review.value.reviewedArtifactRevision !== plan.value.digest || review.value.verdict !== "PASS") throw new Error("replayed_review_binding_mismatch");
  const requiredRefs = [review.value.reviewId, review.value.reviewDigest, review.value.reviewedArtifactId, review.value.reviewedArtifactRevision, evidence.evidenceDigest as string];
  if (receipt.outputEvidenceRefs === null || !requiredRefs.every((ref) => receipt.outputEvidenceRefs?.includes(ref))) throw new Error("replayed_receipt_output_binding_mismatch");
  return deepFreeze({ ...common, state: "completed" as const, disposition: "PASS" as const, evidencePath, handoff: { transitionPlanPath: evidence.artifacts.transitionPlanPath, reviewArtifactPath: evidence.artifacts.reviewArtifactPath, dispatchReceiptId: receipt.receiptId } });
}

type CopilotSdkModuleV1 = Readonly<{ CopilotClient: unknown; RuntimeConnection: unknown }>;

export interface CopilotFuryProductionExecutorDependenciesV1 {
  readonly loadSdk?: () => Promise<CopilotSdkModuleV1>;
  readonly resolveLoadedPackageVersion?: () => Promise<string>;
}

async function resolveLoadedCopilotSdkPackageVersion(): Promise<string> {
  const sdkEntry = fileURLToPath(import.meta.resolve("@github/copilot-sdk"));
  const packageFile = await optionalStableAbsoluteFile(resolve(dirname(sdkEntry), "..", "package.json"), "copilot_sdk_package");
  if (packageFile === null) throw new Error("Loaded Copilot SDK package metadata is unavailable.");
  const metadata = parseJsonRejectDuplicateKeys(packageFile.bytes);
  if (!safePlain(metadata) || metadata.name !== "@github/copilot-sdk" || typeof metadata.version !== "string") throw new Error("Loaded Copilot SDK package metadata is malformed.");
  return metadata.version;
}

class CopilotSdkCapabilityError extends Error {
  constructor(readonly reasonCode: Extract<CopilotFuryDispatchCapabilityReasonV1,
    "copilot_sdk_unavailable" | "copilot_sdk_version_mismatch" | "copilot_sdk_exports_invalid" | "copilot_stdio_projection_unsafe">, message: string) {
    super(message);
  }
}

async function inspectLoadedCopilotSdkCapability(
  dependencies: CopilotFuryProductionExecutorDependenciesV1,
): Promise<Readonly<{
  packageVersion: typeof COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION;
  clientConstructor: typeof CopilotClient;
  connection: StdioRuntimeConnection;
}>> {
  let sdk: CopilotSdkModuleV1;
  let packageVersion: string;
  try {
    sdk = await (dependencies.loadSdk?.() ?? import("@github/copilot-sdk"));
    packageVersion = await (dependencies.resolveLoadedPackageVersion?.() ?? resolveLoadedCopilotSdkPackageVersion());
  } catch (error) {
    throw new CopilotSdkCapabilityError("copilot_sdk_unavailable", error instanceof Error ? error.message : "Copilot SDK capability is unavailable.");
  }
  if (packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION) {
    throw new CopilotSdkCapabilityError("copilot_sdk_version_mismatch", `Loaded Copilot SDK version ${packageVersion} does not match ${COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION}.`);
  }
  if (typeof sdk.CopilotClient !== "function" || !safePlain(sdk.RuntimeConnection) || typeof sdk.RuntimeConnection.forStdio !== "function") {
    throw new CopilotSdkCapabilityError("copilot_sdk_exports_invalid", "CopilotClient or RuntimeConnection.forStdio export is unavailable.");
  }
  const connection = sdk.RuntimeConnection.forStdio() as unknown;
  if (!safePlain(connection) || connection.kind !== "stdio" || connection.path !== undefined || connection.args !== undefined || connection.env !== undefined || Reflect.ownKeys(connection).some((key) => typeof key !== "string" || !["kind", "path", "args", "env"].includes(key))) {
    throw new CopilotSdkCapabilityError("copilot_stdio_projection_unsafe", "RuntimeConnection.forStdio returned an unsafe projection.");
  }
  return Object.freeze({
    packageVersion,
    clientConstructor: sdk.CopilotClient as typeof CopilotClient,
    connection: connection as unknown as StdioRuntimeConnection,
  });
}

class DefaultCopilotFuryExecutorV1 implements CopilotFuryPlanExecutorV1 {
  private client: CopilotClient | null = null;
  private clientConstructor: typeof CopilotClient | null = null;
  private loadedPackageVersion: typeof COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION | null = null;
  private clientConnection: StdioRuntimeConnection | null = null;
  private preflightBinding: Readonly<{ repositoryRoot: string; requestedModel: string; executionIdentity: string }> | null = null;

  constructor(private readonly dependencies: CopilotFuryProductionExecutorDependenciesV1 = {}) {}

  async preflight(input: CopilotFuryExecutorPreflightInputV1): Promise<CopilotFuryExecutorPreflightResultV1> {
    if (input.requestedRuntime !== COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID || input.requestedExecutor !== COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID) return { state: "blocked", code: "BLOCKED_ADAPTER_GAP", errors: ["Requested Copilot runtime or executor is unsupported."] };
    try {
      if (!validExecutionIdentity(input.executionIdentity, input.repositoryRoot)) throw new Error("Copilot client option projection is malformed.");
      const capability = await inspectLoadedCopilotSdkCapability(this.dependencies);
      this.loadedPackageVersion = capability.packageVersion;
      this.clientConstructor = capability.clientConstructor;
      this.clientConnection = capability.connection;
      this.preflightBinding = Object.freeze({ repositoryRoot: input.repositoryRoot, requestedModel: input.requestedModel, executionIdentity: canonicalJson(input.executionIdentity) });
      return { state: "ready", packageVersion: capability.packageVersion, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID };
    } catch (error) {
      await this.close();
      return { state: "blocked", code: "BLOCKED_ADAPTER_GAP", errors: [error instanceof Error ? error.message : "Copilot SDK capability is unavailable."] };
    }
  }

  async execute(input: CopilotFuryExecutorRunInputV1): Promise<CopilotFuryExecutorRunResultV1> {
    if (this.clientConstructor === null || this.loadedPackageVersion === null || this.clientConnection === null || this.preflightBinding === null || this.preflightBinding.repositoryRoot !== input.repositoryRoot || this.preflightBinding.requestedModel !== input.configuration.model || this.preflightBinding.executionIdentity !== canonicalJson(input.executionIdentity) || !validExecutionIdentity(input.executionIdentity, input.repositoryRoot) || input.configuration.sessionId !== deriveCopilotSdkSessionIdV1(input.executionIdentity.childSessionId)) return { state: "failed", code: "SDK_NOT_READY", errors: ["Copilot SDK preflight was not retained or did not match execution."], observations: {} };
    const policyDecisions: { tool: string; decision: "allow" | "deny" }[] = [];
    const startEvents: Extract<SessionEvent, { type: "session.start" }>[] = [];
    const assistantEvents: Extract<SessionEvent, { type: "assistant.message" }>[] = [];
    let modelChangeObserved = false;
    let agentSubstitutionObserved = false;
    let unauthorizedToolOrEffectObserved = false;
    let confirmedCancellation = false;
    const allowed = new Set<string>(input.configuration.availableTools);
    const recordDeniedTool = (tool: string) => {
      policyDecisions.push({ tool, decision: "deny" });
      unauthorizedToolOrEffectObserved = true;
    };
    const immutableTools = exactGitTreeTools(input.repositoryRoot, input.configuration.repositoryRevision, recordDeniedTool);
    const onEvent = (event: SessionEvent) => {
      if (event.type === "session.start") startEvents.push(event);
      if (event.type === "session.model_change") modelChangeObserved = true;
      if (event.type === "subagent.selected" && event.data.agentName !== "fury") agentSubstitutionObserved = true;
      if (event.type === "subagent.deselected") agentSubstitutionObserved = true;
      if (event.type === "abort") confirmedCancellation = true;
      if (event.type === "assistant.message") assistantEvents.push(event);
    };
    let session: CopilotSession | null = null;
    try {
      await input.revalidatePersistence();
      this.client = new this.clientConstructor({ mode: "empty", connection: this.clientConnection, workingDirectory: input.repositoryRoot, baseDirectory: input.executionIdentity.clientOptions.baseDirectory, logLevel: "none" });
      await input.revalidatePersistence();
      await this.client.start();
      const models = await this.client.listModels();
      if (!models.some((model) => model.id === input.configuration.model)) throw new Error("Requested Copilot model is unavailable.");
      session = await this.client.createSession({
        sessionId: input.configuration.sessionId,
        model: input.configuration.model,
        workingDirectory: input.repositoryRoot,
        enableExperimentalMode: false,
        enableConfigDiscovery: false,
        skipCustomInstructions: true,
        customAgentsLocalOnly: true,
        coauthorEnabled: false,
        manageScheduleEnabled: false,
        enableSessionTelemetry: false,
        enableFileChangeTracking: false,
        enableSessionStore: false,
        enableFileHooks: false,
        enableHostGitOperations: false,
        enableSkills: false,
        remoteSession: "off",
        requestCanvasRenderer: false,
        requestExtensions: false,
        enableMcpApps: false,
        tools: [...immutableTools],
        mcpServers: {},
        pluginDirectories: [],
        skillDirectories: [],
        instructionDirectories: [],
        disabledSkills: [],
        availableTools: [...input.configuration.availableTools],
        excludedTools: [...input.configuration.excludedTools],
        infiniteSessions: { enabled: false },
        customAgents: [{
          name: "fury",
          displayName: input.card.frontmatter.name,
          description: input.card.frontmatter.description,
          tools: [...input.configuration.availableTools],
          prompt: input.card.body,
          mcpServers: {},
          skills: [],
          model: input.configuration.model,
          infer: false,
        }],
        agent: "fury",
        onEvent,
        onPermissionRequest: async (request: PermissionRequest) => {
          const tool = "toolName" in request && typeof request.toolName === "string" ? request.toolName : request.kind;
          const decision = "deny" as const;
          policyDecisions.push({ tool, decision });
          unauthorizedToolOrEffectObserved = true;
          return { kind: "reject" as const, feedback: "Only the host-backed exact-Git-tree read and search tools are available; SDK path/effect permissions are denied." };
        },
        hooks: {
          onPreToolUse: async (hookInput) => {
            const name = hookInput.toolName;
            const validation = allowed.has(name)
              ? await validateExactGitTreeToolCall(input.repositoryRoot, input.configuration.repositoryRevision, name, hookInput.toolArgs)
              : { state: "invalid" as const };
            const decision = validation.state === "valid" ? "allow" as const : "deny" as const;
            policyDecisions.push({ tool: name, decision });
            if (decision === "deny") unauthorizedToolOrEffectObserved = true;
            return { permissionDecision: decision, permissionDecisionReason: decision === "deny" ? "Tool is outside the fixed read-only Fury surface." : "Tool is in the fixed read-only Fury surface." };
          },
          onPreMcpToolCall: async () => {
            unauthorizedToolOrEffectObserved = true;
            policyDecisions.push({ tool: "mcp:*", decision: "deny" });
            throw new Error("MCP tools are outside the fixed read-only Fury surface.");
          },
        },
      });
      const selectedBefore = await session.rpc.agent.getCurrent();
      const modelBefore = await session.rpc.model.getCurrent();
      const start = startEvents.at(-1);
      if (start === undefined || start.data.sessionId !== input.configuration.sessionId || start.data.selectedModel !== input.configuration.model || start.data.producer !== COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID || typeof start.data.copilotVersion !== "string" || start.data.copilotVersion === "" || selectedBefore.agent?.name !== "fury" || modelBefore.modelId !== input.configuration.model || agentSubstitutionObserved) throw new Error("Copilot session identity observation failed.");
      let finalMessage = await session.sendAndWait({ prompt: input.prompt });
      let outputText = finalMessage?.data.content ?? "";
      for (let attempt = 0; attempt < input.repairLimit && !input.validateOutput(outputText); attempt += 1) {
        finalMessage = await session.sendAndWait({ prompt: "Your prior response violated the closed output contract. Return only one corrected JSON object with exactly the required fields and identity echoes." });
        outputText = finalMessage?.data.content ?? "";
      }
      const selectedAfter = await session.rpc.agent.getCurrent();
      const modelAfter = await session.rpc.model.getCurrent();
      const finalAssistant = finalMessage ?? assistantEvents.at(-1);
      const assistantModel = finalAssistant?.data.model;
      if (selectedAfter.agent?.name !== "fury" || modelAfter.modelId !== input.configuration.model || assistantModel !== input.configuration.model || modelChangeObserved || agentSubstitutionObserved || unauthorizedToolOrEffectObserved) throw new Error("Copilot session identity or policy drifted.");
      return {
        state: "completed",
        outputText,
        observations: deepFreeze({
          sessionStartObserved: true,
          sessionId: input.configuration.sessionId,
          selectedAgent: "fury",
          model: input.configuration.model,
          assistantModel,
          runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
          executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
          loadedSdkPackageVersion: this.loadedPackageVersion,
          sessionProducer: start.data.producer,
          sessionProducerVersion: start.data.copilotVersion,
          modelChangeObserved: false,
          agentSubstitutionObserved: false,
          unauthorizedToolOrEffectObserved: false,
          policyDecisions: [...policyDecisions],
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Copilot execution failed.";
      const interrupted = /timeout|disconnect|connection|socket|closed unexpectedly/iu.test(message);
      return { state: confirmedCancellation ? "cancelled" : interrupted ? "interrupted" : "failed", code: confirmedCancellation ? "COPILOT_CANCELLED" : interrupted ? "COPILOT_INTERRUPTED" : "COPILOT_EXECUTION_FAILED", errors: [message], observations: { modelChangeObserved, agentSubstitutionObserved, unauthorizedToolOrEffectObserved } };
    } finally { await session?.disconnect().catch(() => undefined); }
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.clientConstructor = null;
    this.loadedPackageVersion = null;
    this.clientConnection = null;
    this.preflightBinding = null;
    if (client !== null) await client.stop().catch(async () => client.forceStop());
  }
}

export function createCopilotFuryPlanExecutorV1(dependencies: CopilotFuryProductionExecutorDependenciesV1 = {}): CopilotFuryPlanExecutorV1 {
  return new DefaultCopilotFuryExecutorV1(dependencies);
}

type StartupRepositorySnapshot = Readonly<{
  root: string;
  identity: string;
  branch: string | null;
  head: string;
  status: string;
  inventory: string;
}>;

async function captureStartupRepository(repositoryRoot: string): Promise<StartupRepositorySnapshot> {
  const root = await realpath(repositoryRoot);
  if (root !== repositoryRoot) throw new Error("repository_root_not_canonical");
  const stats = await lstat(root);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("repository_root_unsafe");
  if (resolve((await git(root, ["rev-parse", "--show-toplevel"])).trim()) !== root) throw new Error("repository_root_mismatch");
  const head = (await git(root, ["rev-parse", "--verify", "HEAD"])).trim();
  if (!GIT_REVISION.test(head)) throw new Error("repository_head_invalid");
  let branch: string | null = null;
  try { branch = (await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim(); }
  catch { /* Detached HEAD is a stable closed observation. */ }
  return Object.freeze({
    root,
    identity: `${stats.dev}:${stats.ino}`,
    branch,
    head,
    status: await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    inventory: await git(root, ["ls-files", "-z"]),
  });
}

function sameStartupRepository(left: StartupRepositorySnapshot, right: StartupRepositorySnapshot): boolean {
  return left.root === right.root && left.identity === right.identity && left.branch === right.branch && left.head === right.head &&
    left.status === right.status && left.inventory === right.inventory;
}

async function dispatchReceiptPathIsSafe(repositoryRoot: string): Promise<boolean> {
  const resolved = await resolveSeatDispatchStorePathsReadOnlyV1(repositoryRoot);
  if (resolved.state === "invalid" || resolved.value.repositoryRoot !== repositoryRoot) return false;
  const paths = resolved.value;
  if (!paths.shieldDirectoryExists) {
    try {
      const before = await lstat(repositoryRoot);
      await access(repositoryRoot, constants.W_OK | constants.X_OK);
      const after = await lstat(repositoryRoot);
      return before.isDirectory() && !before.isSymbolicLink() && before.dev === after.dev && before.ino === after.ino;
    } catch { return false; }
  }
  try {
    const parentBefore = await lstat(paths.shieldDirectory);
    if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink() || await realpath(paths.shieldDirectory) !== paths.shieldDirectory) return false;
    await access(paths.shieldDirectory, constants.W_OK | constants.X_OK);
    try {
      await lstat(paths.lockPath);
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
    }
    try {
      const before = await lstat(paths.logPath);
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || await realpath(paths.logPath) !== paths.logPath) return false;
      const handle = await open(paths.logPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const opened = await handle.stat();
        const after = await lstat(paths.logPath);
        if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino ||
            after.isSymbolicLink() || !after.isFile() || after.nlink !== 1 || after.dev !== opened.dev || after.ino !== opened.ino) return false;
      } finally { await handle.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
    }
    const parentAfter = await lstat(paths.shieldDirectory);
    return parentAfter.isDirectory() && !parentAfter.isSymbolicLink() && parentAfter.dev === parentBefore.dev &&
      parentAfter.ino === parentBefore.ino && await realpath(paths.shieldDirectory) === paths.shieldDirectory;
  } catch { return false; }
}

function startupRepositoryProjection(snapshot: StartupRepositorySnapshot | null, fallbackRoot: string) {
  return Object.freeze({
    root: snapshot?.root ?? fallbackRoot,
    branch: snapshot?.branch ?? null,
    head: snapshot?.head ?? null,
    clean: snapshot === null ? null : snapshot.status === "",
  });
}

export async function probeCopilotFuryDispatchCapabilityV1(
  input: { readonly repositoryRoot: string; readonly expectedHead: string },
  dependencies: CopilotFuryDispatchCapabilityDependenciesV1 = {},
): Promise<CopilotFuryDispatchCapabilityReportV1> {
  const validInput = exact(input, ["repositoryRoot", "expectedHead"]) && typeof input.repositoryRoot === "string" &&
    isAbsolute(input.repositoryRoot) && resolve(input.repositoryRoot) === input.repositoryRoot &&
    typeof input.expectedHead === "string" && GIT_REVISION.test(input.expectedHead);
  let before: StartupRepositorySnapshot | null = null;
  let after: StartupRepositorySnapshot | null = null;
  let card: ResolvedCard | null = null;
  let cardReason: "fury_card_unavailable" | "fury_card_shadowed" | null = null;
  let receiptSafe = false;
  let sdkReason: Extract<CopilotFuryDispatchCapabilityReasonV1,
    "copilot_sdk_unavailable" | "copilot_sdk_version_mismatch" | "copilot_sdk_exports_invalid" | "copilot_stdio_projection_unsafe"> | null = null;
  let packageVersion: string | null = null;
  if (validInput) {
    try { before = await captureStartupRepository(input.repositoryRoot); } catch { /* Closed repository failure below. */ }
  }
  if (before !== null) {
    try {
      card = await resolveCard({
        repositoryRoot: before.root,
        headRevision: input.expectedHead,
        cardSelection: { kind: "repository_default" },
      }, dependencies.userCopilotHome);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      cardReason = message === "same_name_user_card_shadowing_requires_explicit_override" || message.startsWith("user_fury_card_")
        ? "fury_card_shadowed"
        : "fury_card_unavailable";
    }
    receiptSafe = await dispatchReceiptPathIsSafe(before.root);
    try {
      const sdk = await inspectLoadedCopilotSdkCapability(dependencies);
      packageVersion = sdk.packageVersion;
    } catch (error) {
      sdkReason = error instanceof CopilotSdkCapabilityError ? error.reasonCode : "copilot_sdk_unavailable";
    }
    await dependencies.beforeFinalObservation?.();
    try { after = await captureStartupRepository(before.root); } catch { /* Closed drift result below. */ }
    if (after !== null) receiptSafe = receiptSafe && await dispatchReceiptPathIsSafe(after.root);
    if (after !== null && card !== null) {
      try {
        const finalCard = await resolveCard({
          repositoryRoot: after.root,
          headRevision: input.expectedHead,
          cardSelection: { kind: "repository_default" },
        }, dependencies.userCopilotHome);
        if (finalCard.bytes !== card.bytes || canonicalJson(finalCard.identity) !== canonicalJson(card.identity)) after = null;
      } catch { after = null; }
    }
  }
  const reasonCode: CopilotFuryDispatchCapabilityReasonV1 = !validInput
    ? "invalid_input"
    : before === null
      ? "repository_unavailable"
      : before.head !== input.expectedHead
        ? "expected_head_mismatch"
        : before.status !== ""
          ? "workspace_dirty"
          : cardReason ?? (card === null ? "fury_card_unavailable" : !receiptSafe
            ? "dispatch_receipt_path_unsafe"
            : sdkReason ?? (after === null || !sameStartupRepository(before, after) ? "repository_drift" : "ready"));
  return deepFreeze({
    schemaVersion: 1,
    contractVersion: COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION,
    authority: "none",
    disposition: reasonCode === "ready" ? "ready" : "unavailable",
    reasonCode,
    nextAction: COPILOT_FURY_DISPATCH_CAPABILITY_NEXT_ACTIONS[reasonCode],
    repository: {
      before: startupRepositoryProjection(before, typeof input.repositoryRoot === "string" ? input.repositoryRoot : ""),
      after: startupRepositoryProjection(after, typeof input.repositoryRoot === "string" ? input.repositoryRoot : ""),
    },
    package: { name: "@github/copilot-sdk", version: packageVersion },
    target: { runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID },
    card: card?.identity ?? null,
    dispatchReceipt: {
      logicalPath: SEAT_DISPATCH_RECEIPTS_LOG_RELATIVE_PATH,
      lockLogicalPath: `${SEAT_DISPATCH_RECEIPTS_LOG_RELATIVE_PATH}.lock`,
      safety: receiptSafe ? "safe" : "unsafe",
    },
  });
}

function validExecutorObservations(observations: CopilotFuryExecutorObservationsV1, request: CopilotFuryPlanDispatchRequestV1, childSessionId: string): boolean {
  return observations.sessionStartObserved === true && observations.sessionId === childSessionId && observations.selectedAgent === "fury" && observations.model === request.requestedModel && observations.assistantModel === request.requestedModel && observations.runtimeId === request.requestedRuntime && observations.executorId === request.requestedExecutor && observations.loadedSdkPackageVersion === COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION && observations.sessionProducer === request.requestedExecutor && typeof observations.sessionProducerVersion === "string" && observations.sessionProducerVersion.length > 0 && observations.sessionProducerVersion.length <= 255 && observations.modelChangeObserved === false && observations.agentSubstitutionObserved === false && observations.unauthorizedToolOrEffectObserved === false;
}

export async function dispatchCopilotFuryPlanReviewV1(input: unknown, suppliedDependencies: CopilotFuryPlanDispatchDependenciesV1 = {}): Promise<CopilotFuryPlanDispatchResultV1> {
  const validatedRequest = validateCopilotFuryPlanDispatchRequestV1(input);
  if (validatedRequest.state === "invalid") return invalid(validatedRequest.code, ...validatedRequest.errors);
  const request = validatedRequest.value;
  const dependencies = {
    claimDispatchPacket: suppliedDependencies.claimDispatchPacket ?? claimSeatDispatchPacketV1,
    appendDispatchReceipt: suppliedDependencies.appendDispatchReceipt ?? appendSeatDispatchReceiptEntryV1,
    readDispatchLedger: suppliedDependencies.readDispatchLedger ?? readSeatDispatchReceiptLedgerV1,
  };
  const executor = suppliedDependencies.executor ?? createCopilotFuryPlanExecutorV1();
  let claimedReceipt: SeatDispatchReceiptProjectionV1 | null = null;
  let configuration: CopilotFurySdkConfigurationV1 | null = null;
  let packetConfiguration: CopilotFurySdkConfigurationV1 | null = null;
  let activeExecutionIdentity: CopilotFuryExecutionIdentityV1 | null = null;
  let recoveryBinding: RecoveryBindingV2 | null = null;
  let packetId = "";
  let packetDigest = "";
  let card: ResolvedCard | null = null;
  let observation: RepositoryObservation | null = null;
  let planFile: StableFile | null = null;
  let plan: TransitionPlanV1OrV2 | null = null;
  let preflightIdentity: Extract<CopilotFuryExecutorPreflightResultV1, { state: "ready" }> | null = null;
  let terminalUncertain = false;
  let originalDisposition: Readonly<{ code: string; errors: readonly string[] }> = { code: "DISPATCH_FAILED", errors: [] };
  try {
    observation = await observeRepository(request);
    try {
      planFile = await stableExactHeadTransitionPlan(request);
    } catch (error) {
      return invalid("TRANSITION_PLAN_HEAD_MISMATCH", error instanceof Error ? error.message : "Transition plan is not the literal HEAD blob.");
    }
    if (planFile.rawSha256 !== request.transitionPlanRawSha256) return invalid("TRANSITION_PLAN_DIGEST_MISMATCH", "Transition plan raw SHA-256 does not match the request.");
    let parsedPlan: unknown;
    try { parsedPlan = JSON.parse(planFile.bytes); } catch { return invalid("INVALID_TRANSITION_PLAN", "Transition plan contains malformed JSON."); }
    const validatedPlan = validateTransitionPlanV1OrV2({ artifact: parsedPlan });
    if (validatedPlan.state === "invalid") return invalid("INVALID_TRANSITION_PLAN", ...validatedPlan.errors);
    plan = validatedPlan.value;
    if (plan.missionId !== request.missionId || plan.subjectId !== request.subjectId || plan.repositoryId !== request.repositoryId || plan.planningBaseRevision !== request.planningBaseRevision || plan.digest !== request.subjectRevision) return invalid("TRANSITION_PLAN_BINDING_MISMATCH", "Transition plan identity does not match the request.");
    try {
      card = await resolveCard(request, suppliedDependencies.userCopilotHome);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fury card resolution failed.";
      if (message === "same_name_user_card_shadowing_requires_explicit_override" || message === "explicit_user_card_override_unavailable_or_mismatched") return invalid("FURY_CARD_SELECTION_INVALID", message);
      return blocked("BLOCKED_ADAPTER_GAP", message);
    }
    const predecessorIdentity = deriveSessionIdentity(request, plan);
    let identity: ReturnType<typeof claimIdentity> = predecessorIdentity;
    let claimStartedAt = request.timestamp.value;
    packetId = predecessorIdentity.packetId;
    await validateEvidencePathBeforeClaim(request.repositoryRoot, request.missionId);
    const ledgerBefore = await dependencies.readDispatchLedger({ repositoryRoot: request.repositoryRoot, repositoryId: request.repositoryId, repositoryWorkspaceId: request.repositoryWorkspaceId });
    if (ledgerBefore.state === "invalid" && ledgerBefore.code !== "dispatch_receipt_missing") return invalid(ledgerBefore.code, ...ledgerBefore.errors);
    const projections = ledgerBefore.state === "valid" ? ledgerBefore.value.projections : [];
    const existing = projections.filter((candidate) => candidate.receiptId === predecessorIdentity.receiptId);
    if (existing.length > 1) return invalid("duplicate_start", "Existing packet claim is ambiguous.");
    packetConfiguration = sdkConfiguration(request, deriveCopilotSdkSessionIdV1(predecessorIdentity.childSessionId));
    let packetBytes = new TextEncoder().encode(canonicalJson(packetBody(request, plan, card, observation, packetConfiguration)));
    packetDigest = digestBase64Url(packetBytes);
    if (existing.length === 1) {
      const legacyPacketConfiguration = sdkConfiguration(request, predecessorIdentity.childSessionId);
      const legacyPacketBytes = new TextEncoder().encode(canonicalJson(packetBody(request, plan, card, observation, legacyPacketConfiguration)));
      const legacyPacketDigest = digestBase64Url(legacyPacketBytes);
      const legacyBinding = `evidence:packet-binding:seat-dispatch-v1:${predecessorIdentity.claimKey}:${legacyPacketDigest}`;
      if (existing[0].inputEvidenceRefs.includes(legacyBinding)) {
        packetConfiguration = legacyPacketConfiguration;
        packetBytes = legacyPacketBytes;
        packetDigest = legacyPacketDigest;
      }
    }
    const expectedPredecessorInputEvidence = predecessorClaimEvidence(request, plan, card, observation, predecessorIdentity, packetDigest);
    const bindingPrefix = `evidence:packet-binding:seat-dispatch-v1:${predecessorIdentity.claimKey}:`;
    const exactBinding = `${bindingPrefix}${packetDigest}`;
    if (existing.length === 1) {
      if (!existing[0].inputEvidenceRefs.includes(exactBinding)) return invalid("packet_claim_conflict", "Existing packet claim conflicts with the exact request.");
      const recovery = await recoverablePredecessor(request, existing[0], projections, packetBytes, packetDigest, predecessorIdentity, expectedPredecessorInputEvidence, plan);
      if (recovery === null) {
        return await replayExisting(request, {
          logPath: ledgerBefore.state === "valid" ? ledgerBefore.value.logPath : join(request.repositoryRoot, ".shield", "dispatch-receipts.jsonl"),
          byteLength: 0,
          packetDigest,
          receipt: existing[0],
          claimStatus: "already_claimed",
        });
      }
      identity = recovery.successor;
      activeExecutionIdentity = recovery.executionIdentity;
      recoveryBinding = recovery.binding;
      claimStartedAt = recovery.startedAt;
      packetBytes = recovery.packetBytes;
      packetDigest = recovery.packetDigest;
    }
    if (existing.length === 0 && projections.some((candidate) => candidate.inputEvidenceRefs.some((ref) => ref.startsWith(bindingPrefix)))) return invalid("packet_claim_conflict", "Existing packet binding conflicts with the exact request.");
    packetId = identity.packetId;
    activeExecutionIdentity ??= executionIdentity(request.repositoryRoot, identity);
    configuration = sdkConfiguration(request, deriveCopilotSdkSessionIdV1(activeExecutionIdentity.childSessionId));
    if (!validExecutionIdentity(activeExecutionIdentity, request.repositoryRoot)) return invalid("PRECLAIM_VALIDATION_FAILED", "Copilot client option projection is malformed.");
    await validatePersistencePathBeforeClaim(request.repositoryRoot, activeExecutionIdentity.claimKey);
    const preflight = await executor.preflight({ repositoryRoot: request.repositoryRoot, requestedModel: request.requestedModel, requestedRuntime: request.requestedRuntime, requestedExecutor: request.requestedExecutor, executionIdentity: activeExecutionIdentity });
    if (preflight.state === "blocked") return blocked(preflight.code, ...preflight.errors);
    if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor) return blocked("BLOCKED_ADAPTER_GAP", "Copilot executor preflight identity mismatched the request.");
    preflightIdentity = preflight;
    await suppliedDependencies.beforeClaim?.();
    await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
    const claim = await dependencies.claimDispatchPacket({
      repositoryRoot: request.repositoryRoot,
      repositoryId: request.repositoryId,
      repositoryWorkspaceId: request.repositoryWorkspaceId,
      lockOwnerId: identity.lockOwnerId,
      parentMissionId: request.missionId,
      parentMissionRevision: request.missionRevision,
      parentSessionId: request.parentSessionId,
      accountableSeatId: "fury",
      subjectId: request.subjectId,
      subjectRevision: request.subjectRevision,
      artifactId: plan.id,
      artifactRevision: plan.digest,
      repositoryRevision: request.headRevision,
      configuredRuntime: identity.configuredRuntime,
      requestedRuntime: identity.requestedRuntime,
      toolExecution: { kind: "tool.execution.requested", executorBindingRef: request.requestedExecutor },
      runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
      runtimeHostObserved: { kind: "runtime.host_observed.unavailable", reason: "unobserved" },
      executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
      executorHostObserved: { kind: "executor.host_observed.unavailable", reason: "not_observed" },
      packetId: packetId,
      packetBytes,
      inputEvidenceRefs: recoveryBinding === null
        ? [...expectedPredecessorInputEvidence.slice(0, -1)]
        : [plan.id, plan.digest, `sha256:${request.transitionPlanRawSha256}`, `sha256:${card.identity.contentDigest}`, observation.journalDigest, recoveryBinding.inputEvidenceBinding],
      startedAt: claimStartedAt,
    });
    if (claim.state === "invalid") return invalid(claim.code, ...claim.errors);
    claimedReceipt = claim.value.receipt;
    if (claim.value.claimStatus === "already_claimed") return await replayExisting(request, claim.value, recoveryBinding);
    const evidenceDirectory = await ensureEvidenceDirectory(request.repositoryRoot, request.missionId);
    await suppliedDependencies.afterClaimBeforeExecution?.();
    const persistence = await materializePersistencePath(request.repositoryRoot, activeExecutionIdentity.claimKey);
    if (persistence.baseDirectory !== activeExecutionIdentity.clientOptions.baseDirectory) throw new Error("copilot_persistence_projection_mismatch");
    await revalidatePersistenceSnapshot(persistence);
    const execution = await executor.execute({ repositoryRoot: request.repositoryRoot, card: card.card, cardIdentity: card.identity, configuration, executionIdentity: activeExecutionIdentity, revalidatePersistence: () => revalidatePersistenceSnapshot(persistence), prompt: taskPrompt(request, plan), repairLimit: request.repairLimit, validateOutput: (text) => parseClosedResultText(text, plan as TransitionPlanV1OrV2).state === "valid" });
    if (execution.state !== "completed") originalDisposition = { code: execution.code, errors: [...execution.errors] };
    terminalUncertain = true;
    await suppliedDependencies.beforeTerminalRevalidation?.();
    const terminalObservation = await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
    terminalUncertain = false;
    const timestamp = new Date(Math.max(Date.parse(request.timestamp.value) + 1, Date.now())).toISOString();
    if (execution.state !== "completed") {
      const outcome = execution.state;
      const evidence = evidenceWithDigest(evidenceBody({ request, plan, packetId, packetDigest: claim.value.packetDigest, receiptId: claim.value.receipt.receiptId, card, observation: terminalObservation, packetConfiguration, executionConfiguration: configuration, outcome, dispositionCode: execution.code, modelResult: null, observations: execution.observations, errors: execution.errors, artifacts: { transitionPlanPath: null, reviewArtifactPath: null }, recovery: recoveryBinding }));
      const evidenceBytes = `${canonicalJson(evidence)}\n`;
      const evidencePath = await writeContentAddressedArtifact(evidenceDirectory, "dispatch-evidence", evidence.evidenceDigest, evidenceBytes);
      if (execution.state === "interrupted") {
        terminalUncertain = true;
        await suppliedDependencies.beforeTerminalAppend?.();
        await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
        if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor) throw new Error("preterminal_executor_binding_mismatch");
        const terminal = await appendLifecycle(request, claim.value.receipt, "dispatch.interrupted", timestamp, null, [evidence.evidenceDigest], dependencies, { code: execution.code, errors: execution.errors });
        await suppliedDependencies.beforeFinalReadback?.();
        const terminalReadback = await readReceiptForFinalProof(request, terminal.receiptId, plan, "interrupted", dependencies);
        const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
        if (recoveryBinding !== null) validateSuccessorEvidence(evidenceReadback, terminalReadback, recoveryBinding);
        if (evidenceReadback.evidenceDigest !== evidence.evidenceDigest || evidenceReadback.dispositionCode !== execution.code || terminalReadback.recoveryEvidenceRefs === null || !terminalReadback.recoveryEvidenceRefs.includes(evidence.evidenceDigest) || terminalReadback.originalDisposition?.code !== execution.code || canonicalJson(terminalReadback.originalDisposition.errors) !== canonicalJson(execution.errors)) throw new Error("interrupted_readback_mismatch");
        return deepFreeze({ contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION, authority: "none", missionId: request.missionId, state: "recovery_required", code: execution.code, errors: [...execution.errors], receiptId: claim.value.receipt.receiptId, evidencePath, replayed: false, handoff: null });
      }
      const terminalKind = execution.state === "cancelled" ? "dispatch.cancelled" : "dispatch.failed";
      terminalUncertain = true;
      await suppliedDependencies.beforeTerminalAppend?.();
      await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
      if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor) throw new Error("preterminal_executor_binding_mismatch");
      const terminal = await appendLifecycle(request, claim.value.receipt, terminalKind, timestamp, null, [evidence.evidenceDigest], dependencies);
      await suppliedDependencies.beforeFinalReadback?.();
      const terminalReadback = await readReceiptForFinalProof(request, terminal.receiptId, plan, execution.state, dependencies);
      const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
      if (recoveryBinding !== null) validateSuccessorEvidence(evidenceReadback, terminalReadback, recoveryBinding);
      if (evidenceReadback.evidenceDigest !== evidence.evidenceDigest || evidenceReadback.receiptId !== terminal.receiptId || evidenceReadback.packetDigest !== claim.value.packetDigest || terminalReadback.outputEvidenceRefs === null || !terminalReadback.outputEvidenceRefs.includes(evidence.evidenceDigest)) throw new Error("terminal_readback_mismatch");
      return deepFreeze({ contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION, authority: "none", missionId: request.missionId, state: execution.state, code: execution.code, errors: [...execution.errors], receiptId: claim.value.receipt.receiptId, evidencePath, replayed: false, handoff: null });
    }
    if (!validExecutorObservations(execution.observations, request, configuration.sessionId)) throw new Error("executor_observation_mismatch");
    const result = parseClosedResultText(execution.outputText, plan);
    if (result.state === "invalid") throw new Error("invalid_fury_model_result");
    originalDisposition = { code: result.value.verdict, errors: [] };
    let transitionPlanPath: string | null = null;
    let reviewArtifactPath: string | null = null;
    let review: MissionTransitionPlanReviewV1 | null = null;
    let transitionPlanBytes: string | null = null;
    let reviewArtifactBytes: string | null = null;
    if (result.value.verdict === "PASS") {
      const built = buildMissionTransitionPlanReviewV1({
        schemaVersion: 1,
        contractVersion: "mission.transition-plan-review.v1",
        authority: "none",
        missionId: plan.missionId,
        subjectId: plan.subjectId,
        repositoryId: plan.repositoryId,
        planningBaseRevision: plan.planningBaseRevision,
        parentPlanCommit: plan.parentPlanCommit,
        parentPlanPath: plan.parentPlanPath,
        parentPlanRawSha256: plan.parentPlanRawSha256,
        transitionPlanId: plan.id,
        transitionPlanDigest: plan.digest,
        verdict: "PASS",
        reviewerSeatId: "fury",
        reviewerRuntimeId: execution.observations.runtimeId,
        reviewerModelId: execution.observations.assistantModel,
        reviewerExecutorId: execution.observations.executorId,
        reviewedArtifactId: plan.id,
        reviewedArtifactRevision: plan.digest,
      });
      if (built.state === "invalid") throw new Error(`review_artifact_build_failed:${built.errors.join(" ")}`);
      review = built.review;
      transitionPlanBytes = `${canonicalJson(plan)}\n`;
      transitionPlanPath = await writeContentAddressedArtifact(evidenceDirectory, "transition-plan", plan.digest, transitionPlanBytes);
      reviewArtifactBytes = `${canonicalJson(review)}\n`;
      reviewArtifactPath = await writeContentAddressedArtifact(evidenceDirectory, "transition-plan-review", review.reviewDigest, reviewArtifactBytes);
    }
    const evidence = evidenceWithDigest(evidenceBody({ request, plan, packetId, packetDigest: claim.value.packetDigest, receiptId: claim.value.receipt.receiptId, card, observation: terminalObservation, packetConfiguration, executionConfiguration: configuration, outcome: result.value.verdict, dispositionCode: null, modelResult: result.value, observations: execution.observations, errors: [], artifacts: { transitionPlanPath, reviewArtifactPath }, recovery: recoveryBinding }));
    const evidencePath = await writeContentAddressedArtifact(evidenceDirectory, "dispatch-evidence", evidence.evidenceDigest, `${canonicalJson(evidence)}\n`);
    const refs = result.value.verdict === "PASS" && review !== null
      ? [review.reviewId, review.reviewDigest, review.reviewedArtifactId, review.reviewedArtifactRevision, evidence.evidenceDigest]
      : [plan.id, plan.digest, evidence.evidenceDigest];
    terminalUncertain = true;
    await suppliedDependencies.beforeTerminalAppend?.();
    await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
    if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor || !validExecutorObservations(execution.observations, request, configuration.sessionId)) throw new Error("preterminal_executor_binding_mismatch");
    const terminal = await appendLifecycle(request, claim.value.receipt, "dispatch.completed", timestamp, execution.observations, refs, dependencies);
    await suppliedDependencies.beforeFinalReadback?.();
    const terminalReadback = await readReceiptForFinalProof(request, terminal.receiptId, plan, "completed", dependencies);
    const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
    if (recoveryBinding !== null) validateSuccessorEvidence(evidenceReadback, terminalReadback, recoveryBinding);
    if (evidenceReadback.evidenceDigest !== evidence.evidenceDigest || evidenceReadback.receiptId !== terminal.receiptId || evidenceReadback.packetDigest !== claim.value.packetDigest || canonicalJson(evidenceReadback.packet) !== canonicalJson(evidence.packet) || !safePlain(evidenceReadback.artifacts) || evidenceReadback.artifacts.transitionPlanPath !== transitionPlanPath || evidenceReadback.artifacts.reviewArtifactPath !== reviewArtifactPath || terminalReadback.outputEvidenceRefs === null || !refs.every((ref) => terminalReadback.outputEvidenceRefs?.includes(ref))) throw new Error("terminal_readback_mismatch");
    const common = { contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION, authority: "none" as const, missionId: request.missionId, state: "completed" as const, receiptId: terminal.receiptId, evidencePath, replayed: false };
    if (result.value.verdict === "REVISE") return deepFreeze({ ...common, disposition: "REVISE" as const, findings: [...result.value.findings], handoff: null });
    if (transitionPlanPath === null || reviewArtifactPath === null || transitionPlanBytes === null || reviewArtifactBytes === null || review === null) throw new Error("pass_artifacts_unavailable");
    await readExactArtifact(join(request.repositoryRoot, ...transitionPlanPath.split("/")), transitionPlanBytes);
    await readExactArtifact(join(request.repositoryRoot, ...reviewArtifactPath.split("/")), reviewArtifactBytes);
    const transitionPlanReadback = validateTransitionPlanV1OrV2({ artifact: parseJsonRejectDuplicateKeys(transitionPlanBytes) });
    const reviewReadback = validateMissionTransitionPlanReviewV1(parseJsonRejectDuplicateKeys(reviewArtifactBytes));
    if (transitionPlanReadback.state === "invalid" || reviewReadback.state === "invalid" || transitionPlanPath.split("/").at(-1) !== `transition-plan-${plan.digest.slice("sha256:".length)}.json` || reviewArtifactPath.split("/").at(-1) !== `transition-plan-review-${review.reviewDigest.slice("sha256:".length)}.json` || transitionPlanReadback.value.digest !== plan.digest || reviewReadback.value.reviewDigest !== review.reviewDigest || reviewReadback.value.reviewedArtifactId !== plan.id || reviewReadback.value.reviewedArtifactRevision !== plan.digest || reviewReadback.value.reviewerRuntimeId !== execution.observations.runtimeId || reviewReadback.value.reviewerModelId !== execution.observations.assistantModel || reviewReadback.value.reviewerExecutorId !== execution.observations.executorId) throw new Error("pass_artifact_final_binding_mismatch");
    return deepFreeze({ ...common, disposition: "PASS" as const, handoff: { transitionPlanPath, reviewArtifactPath, dispatchReceiptId: terminal.receiptId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Copilot Fury dispatch failed.";
    if (claimedReceipt === null || observation === null || card === null || configuration === null || packetConfiguration === null || activeExecutionIdentity === null || plan === null || planFile === null || preflightIdentity === null) return invalid("PRECLAIM_VALIDATION_FAILED", message);
    if (originalDisposition.errors.length === 0 && originalDisposition.code === "DISPATCH_FAILED") originalDisposition = { code: "DISPATCH_FAILED", errors: [message] };
    const recovery = (errors: readonly string[], evidencePath: string | null = null): CopilotFuryPlanDispatchResultV1 => deepFreeze({
      contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
      authority: "none" as const,
      missionId: request.missionId,
      state: "recovery_required" as const,
      code: terminalUncertain ? originalDisposition.code : "RECOVERY_REQUIRED",
      errors: [...errors],
      receiptId: claimedReceipt?.receiptId ?? null,
      evidencePath,
      replayed: false,
      handoff: null,
    });
    try {
      const ledger = await dependencies.readDispatchLedger({ repositoryRoot: request.repositoryRoot, repositoryId: request.repositoryId, repositoryWorkspaceId: request.repositoryWorkspaceId });
      if (ledger.state === "invalid") throw new Error(`uncertain_terminal_ledger_read_failed:${ledger.code}`);
      const matches = ledger.value.projections.filter((candidate) => candidate.receiptId === claimedReceipt?.receiptId);
      if (matches.length !== 1) throw new Error("uncertain_terminal_receipt_ambiguous");
      claimedReceipt = matches[0];
      if (claimedReceipt.state !== "started" && claimedReceipt.state !== "resumed") {
        try {
          return await replayExisting(request, { logPath: ledger.value.logPath, byteLength: 0, packetDigest, receipt: claimedReceipt, claimStatus: "already_claimed" }, recoveryBinding);
        } catch (verificationError) {
          return recovery([message, verificationError instanceof Error ? verificationError.message : "Existing terminal receipt verification failed."]);
        }
      }
      const directory = await ensureEvidenceDirectory(request.repositoryRoot, request.missionId);
      if (!terminalUncertain) {
        try {
          await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
          if (preflightIdentity.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflightIdentity.runtimeId !== request.requestedRuntime || preflightIdentity.executorId !== request.requestedExecutor) throw new Error("preterminal_executor_binding_mismatch");
        } catch {
          terminalUncertain = true;
        }
      }
      const outcome = terminalUncertain ? "interrupted" as const : "failed" as const;
      const disposition = terminalUncertain ? originalDisposition : { code: "DISPATCH_FAILED", errors: [message] };
      const evidence = evidenceWithDigest(evidenceBody({ request, plan, packetId, packetDigest, receiptId: claimedReceipt.receiptId, card, observation, packetConfiguration, executionConfiguration: configuration, outcome, dispositionCode: disposition.code, modelResult: null, observations: {}, errors: disposition.errors, artifacts: { transitionPlanPath: null, reviewArtifactPath: null }, recovery: recoveryBinding }));
      const evidencePath = await writeContentAddressedArtifact(directory, "dispatch-evidence", evidence.evidenceDigest, `${canonicalJson(evidence)}\n`);
      const timestamp = new Date(Math.max(Date.parse(request.timestamp.value) + 1, Date.now())).toISOString();
      const receipt = terminalUncertain
        ? await appendLifecycle(request, claimedReceipt, "dispatch.interrupted", timestamp, null, [evidence.evidenceDigest], dependencies, disposition)
        : await appendLifecycle(request, claimedReceipt, "dispatch.failed", timestamp, null, [evidence.evidenceDigest], dependencies);
      const receiptReadback = await readReceiptForFinalProof(request, receipt.receiptId, plan, outcome, dependencies);
      const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
      if (recoveryBinding !== null) validateSuccessorEvidence(evidenceReadback, receiptReadback, recoveryBinding);
      if (evidenceReadback.evidenceDigest !== evidence.evidenceDigest) throw new Error("recovery_evidence_readback_mismatch");
      if (terminalUncertain) {
        if (receiptReadback.recoveryEvidenceRefs === null || !receiptReadback.recoveryEvidenceRefs.includes(evidence.evidenceDigest) || receiptReadback.originalDisposition?.code !== disposition.code || canonicalJson(receiptReadback.originalDisposition.errors) !== canonicalJson(disposition.errors)) throw new Error("interrupted_terminal_readback_mismatch");
        return recovery(disposition.errors, evidencePath);
      }
      if (receiptReadback.outputEvidenceRefs === null || !receiptReadback.outputEvidenceRefs.includes(evidence.evidenceDigest)) throw new Error("failed_terminal_readback_mismatch");
      return deepFreeze({ contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION, authority: "none", missionId: request.missionId, state: "failed", code: "DISPATCH_FAILED", errors: [message], receiptId: receipt.receiptId, evidencePath, replayed: false, handoff: null });
    } catch (terminalError) {
      try {
        const ledger = await dependencies.readDispatchLedger({ repositoryRoot: request.repositoryRoot, repositoryId: request.repositoryId, repositoryWorkspaceId: request.repositoryWorkspaceId });
        if (ledger.state === "valid") {
          const matches = ledger.value.projections.filter((candidate) => candidate.receiptId === claimedReceipt?.receiptId);
          if (matches.length === 1 && matches[0].state !== "started" && matches[0].state !== "resumed") {
            try {
              return await replayExisting(request, { logPath: ledger.value.logPath, byteLength: 0, packetDigest, receipt: matches[0], claimStatus: "already_claimed" }, recoveryBinding);
            } catch { /* return the receipt-bound uncertainty below */ }
          }
        }
      } catch { /* preserve the original readback uncertainty */ }
      return recovery([message, terminalError instanceof Error ? terminalError.message : "Terminalization failed."]);
    }
  } finally { await executor.close?.().catch(() => undefined); }
}
