import { execFile as execFileNode } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import type { CopilotClient, CopilotSession, PermissionRequest, SessionEvent, StdioRuntimeConnection, Tool, ToolInvocation } from "@github/copilot-sdk";
import { validateTransitionPlanV1OrV2, type TransitionPlanV1OrV2 } from "@shield/mission-preparation";

import {
  COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION,
  COPILOT_FURY_DISPATCH_CAPABILITY_NEXT_ACTIONS,
  parseShieldConfig,
  validateAndProjectCopilotFuryDispatchCapabilityReportV1,
  type CopilotFuryDispatchCapabilityReasonV1,
  type CopilotFuryDispatchCapabilityReportV1,
  type CopilotFuryResolvedCardIdentityV1,
} from "./config.mjs";
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
export const COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2 = "shield.copilot-fury-plan-dispatch.request.v2" as const;
export const COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2 = "shield.copilot-fury-plan-result.v2" as const;
export const COPILOT_FURY_PLAN_REVIEW_PHASE_V2 = "architecture_plan" as const;
export const COPILOT_FURY_PLAN_PHASE_CONTRACT_ERROR_CODE_V2 = "FURY_PHASE_CONTRACT_EXHAUSTED" as const;
export const COPILOT_FURY_PLAN_FINDING_CODES_V2 = Object.freeze([
  "PLAN_SCOPE_INVALID",
  "PLAN_AUTHORITY_INVALID",
  "PLAN_SEQUENCE_INVALID",
  "PLAN_BINDING_INVALID",
  "PLAN_API_ASSUMPTION_INVALID",
  "PLAN_TEST_STRATEGY_INSUFFICIENT",
  "PLAN_EXCLUSION_INVALID",
  "PLAN_DETERMINISM_INVALID",
  "PLAN_REPLAY_INVALID",
  "PLAN_IDENTITY_SEPARATION_INVALID",
  "PLAN_COMPATIBILITY_INVALID",
] as const);
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
export const COPILOT_FURY_EXECUTION_TOOL_BINDING_VERSION = "shield.copilot-fury.execution-tool-binding.v1" as const;
export const COPILOT_FURY_EXECUTION_OBSERVATION_VERSION = "shield.copilot-fury.execution-observation.v1" as const;
export const COPILOT_FURY_CALLBACK_OBSERVATION_VERSION = "shield.copilot-fury.callback-observation.v1" as const;
export const COPILOT_FURY_REVIEW_ARTIFACT_MAP_VERSION = "shield.copilot-fury.review-artifact-map.v1" as const;
export const COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS = Object.freeze(["PASS", "REVISE", "cancelled", "failed"] as const);
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERY_PROTOCOL = "copilot-fury-empty-mode-recovery-v1" as const;
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID = "receipt:sVgAqsU53kRLIUKg4frtNEzHy9vOqU3c" as const;
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_TERMINAL_ENTRY_DIGEST = "sha256:SN427iHPVSZwrmqUvs9bDEKu0k9LKEk69zMEf53Ujzc" as const;
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_OUTPUT_EVIDENCE_DIGEST = "sha256:ZQ2YCXxtHe-bA3F1CvdiVorSWOEblvTKL4kWSnqBKHM" as const;
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_PACKET_DIGEST = "sha256:z1jfC-m15ozX07UHP5hZaUMVNEvvAIIyyWGogi14fdM" as const;
/** @deprecated Retained only for the existing internal export surface. */
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_SUCCESSOR_RECEIPT_ID = "receipt:3joci3m8iFvPsfeyceBy8b3uH8dfv111" as const;
/** @deprecated Retained only for the existing internal export surface. */
export const COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RESULT_RECEIPT_ID = "receipt:F4ZxcVBIKQJanHcOfEdTkzOHGS6IdNZ9" as const;
export {
  COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION,
  COPILOT_FURY_DISPATCH_CAPABILITY_NEXT_ACTIONS,
  validateAndProjectCopilotFuryDispatchCapabilityReportV1,
  type CopilotFuryDispatchCapabilityReasonV1,
  type CopilotFuryDispatchCapabilityReportV1,
};

const RECOVERABLE_FAILURE_CODE = "COPILOT_EXECUTION_FAILED" as const;
const RECOVERABLE_FAILURE_MESSAGE = "Copilot session identity or policy drifted." as const;

const REQUEST_FIELDS = [
  "schemaVersion", "contractVersion", "authority", "repositoryRoot", "repositoryId", "repositoryWorkspaceId",
  "branch", "planningBaseRevision", "headRevision", "missionId", "missionRevision", "subjectId", "subjectRevision",
  "parentSessionId", "transitionPlanPath", "transitionPlanRawSha256", "cardSelection", "requestedModel",
  "requestedRuntime", "requestedExecutor", "allowedTools", "allowedEffects", "repairLimit", "stopConditions", "timestamp",
] as const;
const REQUEST_FIELDS_V2 = [...REQUEST_FIELDS, "reviewPhase"] as const;
const REPOSITORY_CARD_SELECTION_FIELDS = ["kind"] as const;
const USER_CARD_SELECTION_FIELDS = ["kind", "logicalRef", "expectedSha256"] as const;
const TIMESTAMP_FIELDS = ["value", "provenance"] as const;
const RESULT_FIELDS = [
  "schemaVersion", "contractVersion", "authority", "reviewerSeatId", "reviewedArtifactId", "reviewedArtifactRevision",
  "verdict", "findings",
] as const;
const RESULT_FIELDS_V2 = [...RESULT_FIELDS, "reviewPhase", "repositoryRevision"] as const;
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
const EXECUTION_AVAILABLE_TOOLS = Object.freeze(["custom:read", "custom:search"] as const);
const EXECUTION_AGENT_TOOLS = Object.freeze(["read", "search"] as const);
const EXECUTION_MODEL_TOOLS = Object.freeze(["read", "search"] as const);
const EXECUTION_EXCLUDED_TOOLS = Object.freeze([
  "builtin:*", "mcp:*", "write", "edit", "apply_patch", "bash", "shell", "execute", "web", "custom:write", "custom:edit", "custom:apply_patch", "custom:bash", "custom:shell", "custom:execute", "custom:web",
] as const);
const MAX_REVIEW_ARTIFACT_ENTRIES = 4096;
const MAX_REVIEW_ARTIFACT_BYTES = 8 * MAX_INPUT_BYTES;
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

export interface CopilotFuryPlanDispatchRequestV2 extends Omit<CopilotFuryPlanDispatchRequestV1, "schemaVersion" | "contractVersion"> {
  readonly schemaVersion: 2;
  readonly contractVersion: typeof COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2;
  readonly reviewPhase: typeof COPILOT_FURY_PLAN_REVIEW_PHASE_V2;
}

export type CopilotFuryPlanDispatchRequestV1OrV2 = CopilotFuryPlanDispatchRequestV1 | CopilotFuryPlanDispatchRequestV2;

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

export type CopilotFuryPlanFindingCodeV2 = typeof COPILOT_FURY_PLAN_FINDING_CODES_V2[number];

export interface CopilotFuryPlanFindingV2 extends CopilotFuryPlanFindingV1 {
  readonly code: CopilotFuryPlanFindingCodeV2;
}

export interface CopilotFuryPlanResultV2 extends Omit<CopilotFuryPlanResultV1, "schemaVersion" | "contractVersion" | "findings"> {
  readonly schemaVersion: 2;
  readonly contractVersion: typeof COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2;
  readonly reviewPhase: typeof COPILOT_FURY_PLAN_REVIEW_PHASE_V2;
  readonly repositoryRevision: string;
  readonly findings: readonly CopilotFuryPlanFindingV2[];
}

export type CopilotFuryPlanResultV1OrV2 = CopilotFuryPlanResultV1 | CopilotFuryPlanResultV2;

export type { CopilotFuryResolvedCardIdentityV1 };

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

export interface CopilotFuryReviewArtifactMapEntryV1 {
  readonly path: string;
  readonly bytes: string;
  readonly rawSha256: string;
  readonly roles: readonly ("transition_plan" | "parent_plan")[];
  readonly sourceIdentities: readonly string[];
}

export interface CopilotFuryReviewArtifactMapV1 {
  readonly version: typeof COPILOT_FURY_REVIEW_ARTIFACT_MAP_VERSION;
  readonly entries: readonly CopilotFuryReviewArtifactMapEntryV1[];
  readonly digest: string;
  readonly totalBytes: number;
}

export interface CopilotFuryToolDescriptorProjectionV1 {
  readonly name: "read" | "search";
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly overridesBuiltInTool: true;
  readonly skipPermission: true;
  readonly defer: "never";
}

export interface CopilotFuryExecutionToolBindingProjectionV1 {
  readonly version: typeof COPILOT_FURY_EXECUTION_TOOL_BINDING_VERSION;
  readonly sessionAvailableTools: readonly ["custom:read", "custom:search"];
  readonly sessionExcludedTools: readonly string[];
  readonly customAgentTools: readonly ["read", "search"];
  readonly modelFacingToolNames: readonly ["read", "search"];
  readonly registeredDescriptors: readonly [CopilotFuryToolDescriptorProjectionV1, CopilotFuryToolDescriptorProjectionV1];
  readonly artifactMapDigest: string;
}

export interface CopilotFuryExecutionObservationV1 {
  readonly version: typeof COPILOT_FURY_EXECUTION_OBSERVATION_VERSION;
  readonly sdkVersion: typeof COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION;
  readonly registeredToolNames: readonly ["read", "search"];
  readonly sessionAvailableTools: readonly ["custom:read", "custom:search"];
  readonly sessionExcludedTools: readonly string[];
  readonly customAgentTools: readonly ["read", "search"];
  readonly modelFacingToolNames: readonly ["read", "search"];
  readonly runtimeMetadataNames: readonly ["read", "search"];
  readonly runtimeMetadataDigest: string;
  readonly artifactMapDigest: string;
}

type CopilotFuryCallbackSurfaceV1 = "pre_tool" | "permission" | "handler";
type CopilotFuryCallbackToolIdentityV1 = "read" | "search" | "unknown";
type CopilotFuryCallbackPermissionKindV1 =
  | "read" | "write" | "shell" | "mcp" | "url" | "memory" | "custom-tool" | "hook"
  | "extension-management" | "factory" | "extension-permission-access" | "unknown";
type CopilotFuryCallbackArgumentKindV1 = "string" | "number" | "boolean" | "null" | "undefined" | "bigint" | "symbol" | "function" | "object" | "array" | "rejected";
type CopilotFuryCallbackArgumentKeyV1 = "path" | "query" | "unknown";
type CopilotFuryCallbackDecisionV1 = "allow" | "deny" | "reject" | "invoked" | "not_invoked";
type CopilotFuryCallbackReasonV1 =
  | "exact_tool_allowed" | "tool_or_arguments_denied" | "permission_rejected" | "mcp_denied"
  | "handler_invoked" | "pre_tool_denied" | "shape_rejected";

export type CopilotFuryCallbackArgumentShapeV1 = Readonly<{
  kind: CopilotFuryCallbackArgumentKindV1;
  keys?: readonly CopilotFuryCallbackArgumentKeyV1[];
  entries?: readonly CopilotFuryCallbackArgumentShapeV1[];
}>;

export interface CopilotFuryCallbackObservationRecordV1 {
  readonly surface: CopilotFuryCallbackSurfaceV1;
  readonly ordinal: number;
  readonly callbackIdentity: Readonly<{ sessionId: "present" | "absent"; toolCallId: "present" | "absent" }>;
  readonly tool: CopilotFuryCallbackToolIdentityV1;
  readonly permissionKind: CopilotFuryCallbackPermissionKindV1;
  readonly argumentShape: CopilotFuryCallbackArgumentShapeV1;
  readonly expectedSessionMatch: "match" | "mismatch" | "absent";
  readonly decision: CopilotFuryCallbackDecisionV1;
  readonly reason: CopilotFuryCallbackReasonV1;
}

export interface CopilotFuryCallbackObservationV1 {
  readonly version: typeof COPILOT_FURY_CALLBACK_OBSERVATION_VERSION;
  readonly totalCount: number;
  readonly truncated: boolean;
  readonly records: readonly CopilotFuryCallbackObservationRecordV1[];
}

export interface CopilotFuryExecutorPreflightInputV1 {
  readonly repositoryRoot: string;
  readonly requestedModel: string;
  readonly requestedRuntime: string;
  readonly requestedExecutor: string;
  readonly executionIdentity: CopilotFuryExecutionIdentityV1;
  readonly reviewArtifactMap: CopilotFuryReviewArtifactMapV1;
  readonly toolBinding: CopilotFuryExecutionToolBindingProjectionV1;
}

export type CopilotFuryExecutorPreflightResultV1 = Readonly<
  | { state: "ready"; packageVersion: typeof COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; runtimeId: string; executorId: string }
  | { state: "blocked"; code: "BLOCKED_ADAPTER_GAP" | "FURY_TOOL_BINDING_INVALID"; errors: readonly string[] }
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
  readonly policyDecisions: readonly Readonly<{ tool: CopilotFuryCallbackToolIdentityV1; decision: "allow" | "deny" }>[];
  readonly callbackObservation?: CopilotFuryCallbackObservationV1;
  readonly executionObservation?: CopilotFuryExecutionObservationV1;
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
  readonly repairPrompt: string;
  readonly repairLimit: number;
  readonly validateOutput: (text: string) => boolean;
  readonly reviewArtifactMap: CopilotFuryReviewArtifactMapV1;
  readonly toolBinding: CopilotFuryExecutionToolBindingProjectionV1;
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
  readonly repositoryRootOverride?: string;
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
  contractVersion: typeof COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION | typeof COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2;
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
  | Readonly<{ contractVersion: typeof COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION | typeof COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2; authority: "none"; state: "blocked" | "invalid"; code: string; errors: readonly string[]; receiptId: null; evidencePath: null; replayed: false; handoff: null }>;

type StableFile = Readonly<{ path: string; bytes: string; identity: string; rawSha256: string }>;
export type InternalLegacyDerivedTransitionPlanProvenanceV1 = Readonly<{
  repositoryId: string;
  repositoryRoot: string;
  repositoryWorkspaceId: string;
  missionId: string;
  missionRevision: string;
  journalSequence: number;
  journalDigest: string;
  implementationAuthorityRef: string;
  implementationAuthorityDigest: string;
  implementationAuthoritySequence: number;
  publicationAuthorityRef: string;
  publicationAuthorityDigest: string;
  publicationAuthoritySemanticIdentity: string;
  publicationAuthorizationId: string;
  publicationAuthoritySequence: number;
  runtimeBindingId: string;
  runtimeBindingVersion: number;
  runtimeBindingDigest: string;
  artifactCommit: string;
  legacyPlanPath: string;
  legacyPlanBlobSha256: string;
  artifactPlanMode: "100644" | "100755";
  artifactPlanObjectId: string;
  currentPlanMode: "100644" | "100755";
  currentPlanObjectId: string;
  branch: string;
  headRevision: string;
  derivedCandidateDigest: string;
}>;
export type InternalDerivedTransitionPlanSourceV1 = Readonly<{
  kind: "legacy_derived";
  virtualPath: string;
  canonicalPlanBytes: string;
  transitionPlanRawSha256: string;
  transitionPlan: TransitionPlanV1OrV2;
  provenance: InternalLegacyDerivedTransitionPlanProvenanceV1;
  provenanceDigest: string;
}>;
export type InternalResolvedTransitionPlanSourceV1 =
  | Readonly<{ kind: "committed_file"; file: StableFile }>
  | InternalDerivedTransitionPlanSourceV1;
type RepositoryObservation = Readonly<{ canonicalRoot: string; identity: string; branch: string; headRevision: string; configBytes: string; journalBytes: string; journalDigest: string; journalSequence: number }>;
type ResolvedCard = Readonly<{ card: CopilotAgentCardV1; bytes: string; identity: CopilotFuryResolvedCardIdentityV1; sourcePath: string | null }>;
type CardResolutionRequest = Pick<CopilotFuryPlanDispatchRequestV1OrV2, "repositoryRoot" | "headRevision" | "cardSelection">;
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

function invalidFor(request: CopilotFuryPlanDispatchRequestV1OrV2, code: string, ...errors: readonly string[]): CopilotFuryPlanDispatchResultV1 {
  return deepFreeze({
    contractVersion: request.contractVersion,
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

function blockedFor(request: CopilotFuryPlanDispatchRequestV1OrV2, code: string, ...errors: readonly string[]): CopilotFuryPlanDispatchResultV1 {
  return deepFreeze({
    contractVersion: request.contractVersion,
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

export function validateCopilotFuryPlanDispatchRequestV2(input: unknown): Readonly<
  | { state: "valid"; value: CopilotFuryPlanDispatchRequestV2 }
  | { state: "invalid"; code: "MALFORMED_REQUEST"; errors: readonly string[] }
> {
  let snapshot: unknown;
  try { snapshot = cloneClosed(input); } catch { return { state: "invalid", code: "MALFORMED_REQUEST", errors: ["Request is not closed ordinary data."] }; }
  if (!exact(snapshot, REQUEST_FIELDS_V2)) return { state: "invalid", code: "MALFORMED_REQUEST", errors: ["Request fields are not closed."] };
  const { reviewPhase: _reviewPhase, ...v1Projection } = snapshot;
  const checkedV1 = validateCopilotFuryPlanDispatchRequestV1({
    ...v1Projection,
    schemaVersion: 1,
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
  });
  const errors = checkedV1.state === "invalid" ? [...checkedV1.errors] : [];
  if (snapshot.schemaVersion !== 2 || snapshot.contractVersion !== COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2) errors.push("Request schema or contract is invalid.");
  if (snapshot.reviewPhase !== COPILOT_FURY_PLAN_REVIEW_PHASE_V2) errors.push("reviewPhase must be architecture_plan.");
  if (errors.length > 0) return { state: "invalid", code: "MALFORMED_REQUEST", errors: Object.freeze([...new Set(errors)]) };
  return { state: "valid", value: deepFreeze(snapshot as unknown as CopilotFuryPlanDispatchRequestV2) };
}

export function validateCopilotFuryPlanDispatchRequestV1OrV2(input: unknown): Readonly<
  | { state: "valid"; value: CopilotFuryPlanDispatchRequestV1OrV2 }
  | { state: "invalid"; code: "MALFORMED_REQUEST"; errors: readonly string[] }
> {
  if (safePlain(input) && input.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2) return validateCopilotFuryPlanDispatchRequestV2(input);
  return validateCopilotFuryPlanDispatchRequestV1(input);
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

export function validateCopilotFuryPlanResultV2(
  input: unknown,
  request: CopilotFuryPlanDispatchRequestV2,
  plan: TransitionPlanV1OrV2,
): Readonly<
  | { state: "valid"; value: CopilotFuryPlanResultV2 }
  | { state: "invalid"; code: "INVALID_FURY_RESULT"; errors: readonly string[] }
> {
  let snapshot: unknown;
  try { snapshot = cloneClosed(input); } catch { return { state: "invalid", code: "INVALID_FURY_RESULT", errors: ["Fury result is not closed ordinary data."] }; }
  if (!exact(snapshot, RESULT_FIELDS_V2)) return { state: "invalid", code: "INVALID_FURY_RESULT", errors: ["Fury result fields are not closed."] };
  const value = snapshot;
  const errors: string[] = [];
  if (value.schemaVersion !== 2 || value.contractVersion !== COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2 || value.authority !== "none" || value.reviewerSeatId !== "fury") errors.push("Fury result schema or identity is invalid.");
  if (value.reviewPhase !== request.reviewPhase) errors.push("Fury result review-phase binding is stale or mismatched.");
  if (typeof value.repositoryRevision !== "string" || !GIT_REVISION.test(value.repositoryRevision) || value.repositoryRevision !== request.headRevision) errors.push("Fury result repository-revision binding is stale or mismatched.");
  if (value.reviewedArtifactId !== plan.id || value.reviewedArtifactRevision !== plan.digest) errors.push("Fury result reviewed-artifact binding is stale or mismatched.");
  if (value.verdict !== "PASS" && value.verdict !== "REVISE") errors.push("Fury verdict is unsupported.");
  if (!Array.isArray(value.findings) || isProxy(value.findings) || Object.getPrototypeOf(value.findings) !== Array.prototype || value.findings.length > MAX_FINDINGS || Reflect.ownKeys(value.findings).length !== value.findings.length + 1) {
    errors.push("Fury findings are malformed or exceed their bound.");
  } else {
    const allowedCodes = new Set<string>(COPILOT_FURY_PLAN_FINDING_CODES_V2);
    for (const finding of value.findings) {
      if (!exact(finding, FINDING_FIELDS) || typeof finding.code !== "string" || !allowedCodes.has(finding.code) || typeof finding.message !== "string" || finding.message.trim() !== finding.message || finding.message.length < 1 || finding.message.length > MAX_FINDING_TEXT) errors.push("Fury finding is malformed or outside the architecture-plan taxonomy.");
    }
    if (value.verdict === "PASS" && value.findings.length !== 0) errors.push("PASS must have no findings.");
    if (value.verdict === "REVISE" && value.findings.length === 0) errors.push("REVISE must have at least one finding.");
  }
  if (errors.length > 0) return { state: "invalid", code: "INVALID_FURY_RESULT", errors: Object.freeze([...new Set(errors)]) };
  return { state: "valid", value: deepFreeze(value as unknown as CopilotFuryPlanResultV2) };
}

function parseClosedResultText(text: string, request: CopilotFuryPlanDispatchRequestV1OrV2, plan: TransitionPlanV1OrV2) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_RESULT_BYTES || text === "") return { state: "invalid" as const };
  const objectStart = text.indexOf("{");
  if (objectStart < 0) return { state: "invalid" as const };
  let parsed: unknown;
  try { parsed = parseJsonRejectDuplicateKeys(text.slice(objectStart).trim()); } catch { return { state: "invalid" as const }; }
  return request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2
    ? validateCopilotFuryPlanResultV2(parsed, request, plan)
    : validateCopilotFuryPlanResultV1(parsed, plan);
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

async function exactGitTreeObjectBytes(repositoryRoot: string, file: ExactGitTreeEntry): Promise<Buffer> {
  if (!regularGitTreeFile(file)) throw new Error("exact_git_tree_mode_invalid");
  const sizeText = (await git(repositoryRoot, ["cat-file", "-s", file.objectId])).trim();
  const size = Number(sizeText);
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_INPUT_BYTES) throw new Error("exact_git_tree_object_invalid");
  const bytes = await gitBytes(repositoryRoot, ["cat-file", "blob", file.objectId]);
  if (bytes.length !== size) throw new Error("exact_git_tree_bytes_invalid");
  return bytes;
}

async function exactGitTreeBytes(repositoryRoot: string, file: ExactGitTreeEntry): Promise<Buffer> {
  const bytes = await exactGitTreeObjectBytes(repositoryRoot, file);
  if (!Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) throw new Error("exact_git_tree_bytes_invalid");
  return bytes;
}

async function exactGitPinnedBlob(repositoryRoot: string, revision: string, requestedPath: string): Promise<Readonly<{ bytes: string; identity: string; rawSha256: string }>> {
  if (!GIT_REVISION.test(revision) || !normalizedRelativePath(requestedPath)) throw new Error("pinned_git_blob_binding_invalid");
  const listed = await gitBytes(repositoryRoot, ["ls-tree", "-z", revision, "--", requestedPath]);
  if (listed.length > MAX_INPUT_BYTES || !Buffer.from(listed.toString("utf8"), "utf8").equals(listed)) throw new Error("pinned_git_blob_listing_invalid");
  const records = listed.toString("utf8").split("\0").filter((record) => record !== "");
  if (records.length !== 1) throw new Error("pinned_git_blob_missing");
  const tab = records[0].indexOf("\t");
  if (tab < 0) throw new Error("pinned_git_blob_listing_malformed");
  const [mode, type, objectId, ...extra] = records[0].slice(0, tab).split(" ");
  const path = records[0].slice(tab + 1);
  if (extra.length !== 0 || path !== requestedPath || type !== "blob" || !/^(100644|100755)$/u.test(mode ?? "") || !GIT_REVISION.test(objectId ?? "")) throw new Error("pinned_git_blob_not_regular");
  const entry = Object.freeze({ mode, type, objectId, path });
  const bytes = await exactGitTreeBytes(repositoryRoot, entry);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("pinned_git_blob_not_utf8");
  return Object.freeze({
    bytes: text,
    rawSha256: digestHex(bytes),
    identity: `git:${revision}:${path}:${mode}:${objectId}:${bytes.length}:${digestHex(bytes)}`,
  });
}

type ReviewArtifactBinding = Readonly<{ path: string; bytes: string; rawSha256: string; role: "transition_plan" | "parent_plan"; identity: string }>;

function compareLogicalPaths(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function artifactMapDigest(entries: readonly CopilotFuryReviewArtifactMapEntryV1[]): string {
  return digestBase64Url(`copilot-fury-review-artifact-map-v1\0${canonicalJson({ version: COPILOT_FURY_REVIEW_ARTIFACT_MAP_VERSION, entries })}`);
}

function validateReviewArtifactMap(map: CopilotFuryReviewArtifactMapV1): void {
  if (!exact(map, ["version", "entries", "digest", "totalBytes"])) throw new Error("review_artifact_map_malformed:shape");
  if (map.version !== COPILOT_FURY_REVIEW_ARTIFACT_MAP_VERSION || !Array.isArray(map.entries) || map.entries.length > MAX_REVIEW_ARTIFACT_ENTRIES || !DIGEST.test(map.digest) || !Number.isSafeInteger(map.totalBytes) || map.totalBytes < 0 || map.totalBytes > MAX_REVIEW_ARTIFACT_BYTES) throw new Error("review_artifact_map_malformed:header");
  let totalBytes = 0;
  let previousPath: string | null = null;
  let transitionRoleCount = 0;
  let parentRoleCount = 0;
  for (const entry of map.entries) {
    if (!exact(entry, ["path", "bytes", "rawSha256", "roles", "sourceIdentities"])) throw new Error("review_artifact_map_entry_malformed:shape");
    if (!normalizedRelativePath(entry.path) || entry.path.split("/").some((component) => component.toLocaleLowerCase("en-US") === ".git") || typeof entry.bytes !== "string" || !SHA256_HEX.test(entry.rawSha256 as string) || !Array.isArray(entry.roles) || entry.roles.some((role) => role !== "transition_plan" && role !== "parent_plan") || new Set(entry.roles).size !== entry.roles.length || !Array.isArray(entry.sourceIdentities) || entry.sourceIdentities.length < 1) throw new Error(`review_artifact_map_entry_malformed:${entry.path}`);
    const sourceIdentities = entry.sourceIdentities as readonly unknown[];
    if (sourceIdentities.some((identity) => typeof identity !== "string" || !/^[\x21-\x7e]{1,1024}$/u.test(identity)) || new Set(sourceIdentities).size !== sourceIdentities.length || sourceIdentities.some((identity, index) => index > 0 && compareLogicalPaths(sourceIdentities[index - 1] as string, identity as string) >= 0)) throw new Error(`review_artifact_map_entry_malformed:${entry.path}`);
    const hasTransitionRole = entry.roles.includes("transition_plan");
    const hasParentRole = entry.roles.includes("parent_plan");
    transitionRoleCount += hasTransitionRole ? 1 : 0;
    parentRoleCount += hasParentRole ? 1 : 0;
    const transitionIdentities = entry.sourceIdentities.filter((identity) => identity.startsWith("virtual:") || identity.startsWith("head:"));
    const parentIdentities = entry.sourceIdentities.filter((identity) => identity.startsWith("git:"));
    const shadowIdentities = entry.sourceIdentities.filter((identity) => identity.startsWith("head-shadowed:"));
    if (entry.sourceIdentities.some((identity) => !identity.startsWith("virtual:") && !identity.startsWith("head:") && !identity.startsWith("git:") && !identity.startsWith("head-shadowed:")) ||
        transitionIdentities.length !== (hasTransitionRole || entry.roles.length === 0 ? 1 : 0) ||
        parentIdentities.length !== (hasParentRole ? 1 : 0) ||
        shadowIdentities.length > (entry.roles.length === 0 ? 0 : 1) ||
        (entry.roles.length === 0 && entry.sourceIdentities.length !== 1)) throw new Error("review_artifact_map_source_identity_invalid");
    if (previousPath !== null && compareLogicalPaths(previousPath, entry.path) >= 0) throw new Error("review_artifact_map_order_invalid");
    previousPath = entry.path;
    const bytes = Buffer.from(entry.bytes, "utf8");
    if (bytes.length < 1 || bytes.length > MAX_INPUT_BYTES || !Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes) || digestHex(bytes) !== entry.rawSha256) throw new Error("review_artifact_map_bytes_invalid");
    totalBytes += bytes.length;
    if (totalBytes > MAX_REVIEW_ARTIFACT_BYTES) throw new Error("review_artifact_map_too_large");
  }
  if (transitionRoleCount !== 1 || parentRoleCount !== 1) throw new Error("review_artifact_map_role_cardinality_invalid");
  if (totalBytes !== map.totalBytes || artifactMapDigest(map.entries) !== map.digest) throw new Error("review_artifact_map_digest_mismatch");
}

export function validateCopilotFuryReviewArtifactMapV1(map: CopilotFuryReviewArtifactMapV1): void {
  validateReviewArtifactMap(map);
}

async function buildReviewArtifactMap(
  request: CopilotFuryPlanDispatchRequestV1OrV2,
  source: InternalResolvedTransitionPlanSourceV1,
  plan: TransitionPlanV1OrV2,
): Promise<CopilotFuryReviewArtifactMapV1> {
  const transitionPath = request.transitionPlanPath;
  const transitionFile = source.kind === "legacy_derived"
    ? Object.freeze({ bytes: source.canonicalPlanBytes, rawSha256: source.transitionPlanRawSha256, identity: `virtual:${source.virtualPath}:${source.provenanceDigest}:${source.transitionPlanRawSha256}` })
    : Object.freeze({ bytes: source.file.bytes, rawSha256: source.file.rawSha256, identity: `head:${request.headRevision}:${transitionPath}:${source.file.identity}:${source.file.rawSha256}` });
  const parent = await exactGitPinnedBlob(request.repositoryRoot, plan.parentPlanCommit, plan.parentPlanPath);
  if (transitionFile.rawSha256 !== digestHex(transitionFile.bytes) || transitionFile.rawSha256 !== request.transitionPlanRawSha256 || parent.rawSha256 !== plan.parentPlanRawSha256) throw new Error("review_artifact_binding_digest_mismatch");
  const bindings: ReviewArtifactBinding[] = [
    { path: transitionPath, bytes: transitionFile.bytes, rawSha256: transitionFile.rawSha256, role: "transition_plan", identity: transitionFile.identity },
    { path: plan.parentPlanPath, bytes: parent.bytes, rawSha256: parent.rawSha256, role: "parent_plan", identity: parent.identity },
  ];
  const boundByPath = new Map<string, { bytes: string; rawSha256: string; roles: Set<"transition_plan" | "parent_plan">; sourceIdentities: Set<string> }>();
  for (const binding of bindings) {
    if (!normalizedRelativePath(binding.path) || binding.path.split("/").some((component) => component.toLocaleLowerCase("en-US") === ".git")) throw new Error("review_artifact_path_invalid");
    const existing = boundByPath.get(binding.path);
    if (existing === undefined) boundByPath.set(binding.path, { bytes: binding.bytes, rawSha256: binding.rawSha256, roles: new Set([binding.role]), sourceIdentities: new Set([binding.identity]) });
    else {
      if (existing.bytes !== binding.bytes || existing.rawSha256 !== binding.rawSha256) throw new Error("review_artifact_path_collision");
      existing.roles.add(binding.role);
      existing.sourceIdentities.add(binding.identity);
    }
  }
  const headEntries = await exactGitTreeInventory(request.repositoryRoot, request.headRevision);
  const entriesByPath = new Map<string, CopilotFuryReviewArtifactMapEntryV1>();
  for (const [path, bound] of boundByPath) {
    const head = headEntries.find((entry) => entry.path === path);
    if (head !== undefined) {
      if (!regularGitTreeFile(head)) throw new Error("review_artifact_bound_path_not_regular");
      bound.sourceIdentities.add(`head-shadowed:${request.headRevision}:${head.path}:${head.mode}:${head.objectId}`);
    }
    entriesByPath.set(path, Object.freeze({ path, bytes: bound.bytes, rawSha256: bound.rawSha256, roles: Object.freeze([...bound.roles].sort()) as readonly ("transition_plan" | "parent_plan")[], sourceIdentities: Object.freeze([...bound.sourceIdentities].sort(compareLogicalPaths)) }));
  }
  let totalBytes = 0;
  for (const entry of entriesByPath.values()) totalBytes += Buffer.byteLength(entry.bytes, "utf8");
  const fallbackFiles = headEntries.filter((entry) => regularGitTreeFile(entry) && !entriesByPath.has(entry.path)).sort((left, right) => compareLogicalPaths(left.path, right.path));
  for (const file of fallbackFiles) {
    const bytes = await exactGitTreeObjectBytes(request.repositoryRoot, file);
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) continue;
    if (entriesByPath.size >= MAX_REVIEW_ARTIFACT_ENTRIES) throw new Error("review_artifact_map_too_many_entries");
    totalBytes += bytes.length;
    if (totalBytes > MAX_REVIEW_ARTIFACT_BYTES) throw new Error("review_artifact_map_too_large");
    entriesByPath.set(file.path, Object.freeze({ path: file.path, bytes: text, rawSha256: digestHex(bytes), roles: Object.freeze([]), sourceIdentities: Object.freeze([`head:${request.headRevision}:${file.path}:${file.mode}:${file.objectId}:${bytes.length}:${digestHex(bytes)}`]) }));
  }
  const entries = Object.freeze([...entriesByPath.values()].sort((left, right) => compareLogicalPaths(left.path, right.path)));
  const map = deepFreeze({ version: COPILOT_FURY_REVIEW_ARTIFACT_MAP_VERSION, entries, digest: artifactMapDigest(entries), totalBytes });
  validateReviewArtifactMap(map);
  return map;
}

export async function buildCopilotFuryReviewArtifactMapV1(
  request: CopilotFuryPlanDispatchRequestV1OrV2,
  source: InternalResolvedTransitionPlanSourceV1,
  plan: TransitionPlanV1OrV2,
): Promise<CopilotFuryReviewArtifactMapV1> {
  return buildReviewArtifactMap(request, source, plan);
}

async function stableExactHeadTransitionPlan(request: CopilotFuryPlanDispatchRequestV1OrV2): Promise<StableFile> {
  const worktree = await stableTextFile(request.repositoryRoot, request.transitionPlanPath, "transition_plan");
  const path = exactGitTreePath(request.repositoryRoot, request.transitionPlanPath);
  const entry = (await exactGitTreeInventory(request.repositoryRoot, request.headRevision)).find((candidate) => candidate.path === path);
  if (entry === undefined || !regularGitTreeFile(entry)) throw new Error("transition_plan_head_blob_unavailable");
  const headBytes = await exactGitTreeBytes(request.repositoryRoot, entry);
  if (!headBytes.equals(Buffer.from(worktree.bytes, "utf8"))) throw new Error("transition_plan_worktree_head_mismatch");
  return worktree;
}

const LEGACY_PROVENANCE_FIELDS = [
  "repositoryId", "repositoryRoot", "repositoryWorkspaceId", "missionId", "missionRevision",
  "journalSequence", "journalDigest", "implementationAuthorityRef", "implementationAuthorityDigest",
  "implementationAuthoritySequence", "publicationAuthorityRef", "publicationAuthorityDigest",
  "publicationAuthoritySemanticIdentity", "publicationAuthorizationId", "publicationAuthoritySequence",
  "runtimeBindingId", "runtimeBindingVersion", "runtimeBindingDigest", "artifactCommit", "legacyPlanPath",
  "legacyPlanBlobSha256", "artifactPlanMode", "artifactPlanObjectId", "currentPlanMode", "currentPlanObjectId",
  "branch", "headRevision", "derivedCandidateDigest",
] as const;
const LEGACY_DERIVED_SOURCE_FIELDS = [
  "kind", "virtualPath", "canonicalPlanBytes", "transitionPlanRawSha256", "transitionPlan", "provenance", "provenanceDigest",
] as const;

function validateLegacyDerivedTransitionPlanSource(
  request: CopilotFuryPlanDispatchRequestV1OrV2,
  source: InternalDerivedTransitionPlanSourceV1,
): StableFile {
  if (!exact(source, LEGACY_DERIVED_SOURCE_FIELDS) || source.kind !== "legacy_derived" ||
      !exact(source.provenance, LEGACY_PROVENANCE_FIELDS) || !SHA256_HEX.test(source.transitionPlanRawSha256) ||
      !DIGEST.test(source.provenanceDigest) || !normalizedRelativePath(source.virtualPath)) {
    throw new Error("legacy_derived_source_malformed");
  }
  const provenance = source.provenance;
  if (provenance.repositoryId !== request.repositoryId || provenance.repositoryRoot !== request.repositoryRoot ||
      provenance.repositoryWorkspaceId !== request.repositoryWorkspaceId || provenance.missionId !== request.missionId ||
      provenance.missionRevision !== request.missionRevision || provenance.branch !== request.branch ||
      provenance.headRevision !== request.headRevision || provenance.derivedCandidateDigest !== request.subjectRevision ||
      provenance.derivedCandidateDigest !== source.transitionPlan.digest ||
      !Number.isSafeInteger(provenance.journalSequence) || provenance.journalSequence < 0 ||
      !Number.isSafeInteger(provenance.implementationAuthoritySequence) || provenance.implementationAuthoritySequence < 0 ||
      !Number.isSafeInteger(provenance.publicationAuthoritySequence) || provenance.publicationAuthoritySequence < 0 ||
      !Number.isSafeInteger(provenance.runtimeBindingVersion) || provenance.runtimeBindingVersion < 1 ||
      !GIT_REVISION.test(provenance.artifactCommit) || !GIT_REVISION.test(provenance.headRevision) ||
      ![provenance.artifactPlanObjectId, provenance.currentPlanObjectId].every((value) => GIT_REVISION.test(value)) ||
      ![provenance.artifactPlanMode, provenance.currentPlanMode].every((value) => value === "100644" || value === "100755") ||
      provenance.artifactPlanMode !== provenance.currentPlanMode || provenance.artifactPlanObjectId !== provenance.currentPlanObjectId ||
      !SHA256_HEX.test(provenance.legacyPlanBlobSha256) || !normalizedRelativePath(provenance.legacyPlanPath) ||
      ![provenance.journalDigest, provenance.implementationAuthorityDigest, provenance.publicationAuthorityDigest,
        provenance.publicationAuthoritySemanticIdentity, provenance.runtimeBindingDigest].every((value) => DIGEST.test(value)) ||
      ![provenance.implementationAuthorityRef, provenance.publicationAuthorityRef, provenance.publicationAuthorizationId,
        provenance.runtimeBindingId].every(id)) throw new Error("legacy_derived_provenance_malformed");
  const expectedProvenanceDigest = digestBase64Url(`shield-legacy-derived-transition-plan-provenance-v1\0${canonicalJson(provenance)}`);
  const expectedVirtualPath = `.shield/audit/legacy-reviewed-transition/${expectedProvenanceDigest}/transition-plan.json`;
  if (source.provenanceDigest !== expectedProvenanceDigest || source.virtualPath !== expectedVirtualPath ||
      request.transitionPlanPath !== source.virtualPath || request.transitionPlanRawSha256 !== source.transitionPlanRawSha256 ||
      source.canonicalPlanBytes !== `${canonicalJson(source.transitionPlan)}\n` ||
      digestHex(source.canonicalPlanBytes) !== source.transitionPlanRawSha256) throw new Error("legacy_derived_source_binding_mismatch");
  let parsed: unknown;
  try { parsed = parseJsonRejectDuplicateKeys(source.canonicalPlanBytes); } catch { throw new Error("legacy_derived_plan_malformed"); }
  const validated = validateTransitionPlanV1OrV2({ artifact: parsed });
  if (validated.state === "invalid" || canonicalJson(validated.value) !== canonicalJson(source.transitionPlan)) {
    throw new Error("legacy_derived_plan_invalid");
  }
  return Object.freeze({
    path: source.virtualPath,
    bytes: source.canonicalPlanBytes,
    rawSha256: source.transitionPlanRawSha256,
    identity: `legacy-derived:${source.provenanceDigest}:${source.transitionPlanRawSha256}`,
  });
}

async function revalidateResolvedTransitionPlanSource(
  request: CopilotFuryPlanDispatchRequestV1OrV2,
  source: InternalResolvedTransitionPlanSourceV1,
): Promise<StableFile> {
  if (source.kind === "legacy_derived") return validateLegacyDerivedTransitionPlanSource(request, source);
  if (!exact(source, ["kind", "file"]) || source.kind !== "committed_file") throw new Error("committed_source_malformed");
  const current = await stableExactHeadTransitionPlan(request);
  if (current.path !== source.file.path || current.bytes !== source.file.bytes || current.rawSha256 !== source.file.rawSha256 ||
      current.identity !== source.file.identity) throw new Error("transition_plan_resolved_source_drift");
  return current;
}

export async function resolveCommittedTransitionPlanSourceV1(
  input: unknown,
): Promise<Readonly<{ state: "valid"; request: CopilotFuryPlanDispatchRequestV1OrV2; source: InternalResolvedTransitionPlanSourceV1 }> | Readonly<{ state: "invalid"; result: CopilotFuryPlanDispatchResultV1 }>> {
  const checked = validateCopilotFuryPlanDispatchRequestV1OrV2(input);
  if (checked.state === "invalid") return Object.freeze({ state: "invalid", result: invalid(checked.code, ...checked.errors) });
  try {
    await observeRepository(checked.value);
  } catch (error) {
    return Object.freeze({ state: "invalid", result: invalidFor(checked.value, "PRECLAIM_VALIDATION_FAILED", error instanceof Error ? error.message : "Copilot Fury dispatch preclaim validation failed.") });
  }
  try {
    const file = await stableExactHeadTransitionPlan(checked.value);
    return Object.freeze({ state: "valid", request: checked.value, source: Object.freeze({ kind: "committed_file", file }) });
  } catch (error) {
    return Object.freeze({ state: "invalid", result: invalidFor(checked.value, "TRANSITION_PLAN_HEAD_MISMATCH", error instanceof Error ? error.message : "Transition plan is not the literal HEAD blob.") });
  }
}
const TOOL_READ_PARAMETERS = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: { path: { type: "string", description: "Repository-relative or canonical absolute file path." } },
});
const TOOL_SEARCH_PARAMETERS = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: { type: "string", minLength: 1, maxLength: 1024 },
    path: { type: "string", description: "Optional repository-relative subtree." },
  },
});

function executionToolDescriptors(artifactMapDigest: string): CopilotFuryExecutionToolBindingProjectionV1 {
  return deepFreeze({
    version: COPILOT_FURY_EXECUTION_TOOL_BINDING_VERSION,
    sessionAvailableTools: [...EXECUTION_AVAILABLE_TOOLS] as ["custom:read", "custom:search"],
    sessionExcludedTools: [...EXECUTION_EXCLUDED_TOOLS],
    customAgentTools: [...EXECUTION_AGENT_TOOLS] as ["read", "search"],
    modelFacingToolNames: [...EXECUTION_MODEL_TOOLS] as ["read", "search"],
    registeredDescriptors: [
      { name: "read", parameters: TOOL_READ_PARAMETERS, overridesBuiltInTool: true, skipPermission: true, defer: "never" },
      { name: "search", parameters: TOOL_SEARCH_PARAMETERS, overridesBuiltInTool: true, skipPermission: true, defer: "never" },
    ],
    artifactMapDigest,
  });
}

export function createCopilotFuryExecutionToolBindingV1(artifactMapDigest: string): CopilotFuryExecutionToolBindingProjectionV1 {
  return executionToolDescriptors(artifactMapDigest);
}

function validateExecutionToolBinding(binding: CopilotFuryExecutionToolBindingProjectionV1, artifactMap: CopilotFuryReviewArtifactMapV1): void {
  if (!exact(binding, ["version", "sessionAvailableTools", "sessionExcludedTools", "customAgentTools", "modelFacingToolNames", "registeredDescriptors", "artifactMapDigest"]) || binding.version !== COPILOT_FURY_EXECUTION_TOOL_BINDING_VERSION || binding.artifactMapDigest !== artifactMap.digest || !sameArray(binding.sessionAvailableTools, EXECUTION_AVAILABLE_TOOLS) || !sameArray(binding.customAgentTools, EXECUTION_AGENT_TOOLS) || !sameArray(binding.modelFacingToolNames, EXECUTION_MODEL_TOOLS) || !Array.isArray(binding.sessionExcludedTools) || binding.sessionExcludedTools.length !== EXECUTION_EXCLUDED_TOOLS.length || binding.sessionExcludedTools.some((value, index) => value !== EXECUTION_EXCLUDED_TOOLS[index]) || !Array.isArray(binding.registeredDescriptors) || binding.registeredDescriptors.length !== 2) throw new Error("FURY_TOOL_BINDING_INVALID");
  const expected = executionToolDescriptors(binding.artifactMapDigest);
  if (canonicalJson(binding.registeredDescriptors) !== canonicalJson(expected.registeredDescriptors)) throw new Error("FURY_TOOL_BINDING_INVALID");
}

function validateReviewArtifactToolCall(repositoryRoot: string, artifactMap: CopilotFuryReviewArtifactMapV1, toolName: string, args: unknown): Readonly<{ state: "valid"; value: Readonly<{ kind: "read"; entry: CopilotFuryReviewArtifactMapEntryV1 } | { kind: "search"; query: string; entries: readonly CopilotFuryReviewArtifactMapEntryV1[] }> } | { state: "invalid" }> {
  try {
    validateReviewArtifactMap(artifactMap);
    const entries = artifactMap.entries;
    if (toolName === "read") {
      if (!exact(args, ["path"])) return { state: "invalid" };
      const path = exactGitTreePath(repositoryRoot, args.path);
      const entry = entries.find((candidate) => candidate.path === path);
      return entry === undefined ? { state: "invalid" } : { state: "valid", value: { kind: "read", entry } };
    }
    if (toolName !== "search" || (!exact(args, ["query"]) && !exact(args, ["query", "path"])) || typeof args.query !== "string" || args.query.length < 1 || args.query.length > 1024 || (args.path !== undefined && typeof args.path !== "string")) return { state: "invalid" };
    const prefix = args.path === undefined ? null : exactGitTreePath(repositoryRoot, args.path);
    const scoped = entries.filter((entry) => prefix === null || entry.path === prefix || entry.path.startsWith(`${prefix}/`));
    if (scoped.length === 0) return { state: "invalid" };
    return { state: "valid", value: { kind: "search", query: args.query, entries: scoped } };
  } catch {
    return { state: "invalid" };
  }
}

function reviewArtifactTools(
  repositoryRoot: string,
  revision: string,
  artifactMap: CopilotFuryReviewArtifactMapV1,
  onDenied: (toolName: string) => void,
  onHandler?: (toolName: string, args: unknown, invocation: ToolInvocation) => void,
): readonly Tool[] {
  const readTool: Tool = {
    name: "read",
    description: "Read one UTF-8 file from the exact immutable repository Git tree under review.",
    parameters: TOOL_READ_PARAMETERS,
    overridesBuiltInTool: true,
    skipPermission: true,
    defer: "never",
    handler: async (args: unknown, invocation: ToolInvocation) => {
      onHandler?.("read", args, invocation);
      const validated = validateReviewArtifactToolCall(repositoryRoot, artifactMap, "read", args);
      if (validated.state === "invalid" || validated.value.kind !== "read") {
        onDenied("read");
        throw new Error("review_artifact_read_arguments_invalid");
      }
      return canonicalJson({ repositoryRevision: revision, path: validated.value.entry.path, content: validated.value.entry.bytes });
    },
  };
  const searchTool: Tool = {
    name: "search",
    description: "Search UTF-8 files from the exact immutable repository Git tree under review.",
    parameters: TOOL_SEARCH_PARAMETERS,
    overridesBuiltInTool: true,
    skipPermission: true,
    defer: "never",
    handler: async (args: unknown, invocation: ToolInvocation) => {
      onHandler?.("search", args, invocation);
      const validated = validateReviewArtifactToolCall(repositoryRoot, artifactMap, "search", args);
      if (validated.state === "invalid" || validated.value.kind !== "search") {
        onDenied("search");
        throw new Error("review_artifact_search_arguments_invalid");
      }
      const matches: { path: string; line: number; text: string }[] = [];
      let scannedBytes = 0;
      for (const entry of validated.value.entries) {
        const bytes = Buffer.from(entry.bytes, "utf8");
        scannedBytes += bytes.length;
        if (scannedBytes > 8 * MAX_INPUT_BYTES) throw new Error("exact_git_tree_search_too_large");
        for (const [index, text] of entry.bytes.split("\n").entries()) {
          if (text.includes(validated.value.query)) matches.push({ path: entry.path, line: index + 1, text });
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

async function observeRepository(request: CopilotFuryPlanDispatchRequestV1OrV2): Promise<RepositoryObservation> {
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

function deriveSessionIdentity(request: CopilotFuryPlanDispatchRequestV1OrV2, plan: TransitionPlanV1OrV2) {
  const commonOperation = {
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
  };
  const operation = request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION
    ? deepFreeze(commonOperation)
    : deepFreeze({ ...commonOperation, requestContractVersion: request.contractVersion, reviewPhase: request.reviewPhase });
  const operationDigest = digestBase64Url(`${request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION ? "copilot-fury-logical-operation-v1" : "copilot-fury-logical-operation-v2"}\0${canonicalJson(operation)}`);
  const token = operationDigest.replace(/^sha256:/u, "").slice(0, 32);
  const packetId = request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION
    ? `packet:copilot-fury:${token}`
    : `packet:copilot-fury-v2:${token}`;
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

function claimIdentity(request: CopilotFuryPlanDispatchRequestV1OrV2, packetId: string) {
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

function sdkConfiguration(request: CopilotFuryPlanDispatchRequestV1OrV2, childSessionId: string): CopilotFurySdkConfigurationV1 {
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

function outputContractDescriptionV2(request: CopilotFuryPlanDispatchRequestV2, plan: TransitionPlanV1OrV2): string {
  return canonicalJson({
    schemaVersion: 2,
    contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2,
    authority: "none",
    reviewerSeatId: "fury",
    reviewedArtifactId: plan.id,
    reviewedArtifactRevision: plan.digest,
    reviewPhase: request.reviewPhase,
    repositoryRevision: request.headRevision,
    verdict: "PASS | REVISE",
    findings: [{ code: COPILOT_FURY_PLAN_FINDING_CODES_V2.join(" | "), message: "bounded actionable architecture-plan finding (REVISE only)" }],
  });
}

function outputContractFor(request: CopilotFuryPlanDispatchRequestV1OrV2, plan: TransitionPlanV1OrV2): string {
  return request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2
    ? outputContractDescriptionV2(request, plan)
    : outputContractDescription(plan);
}

function taskPrompt(request: CopilotFuryPlanDispatchRequestV1OrV2, plan: TransitionPlanV1OrV2): string {
  if (request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2) {
    return [
      "Review the exact transition plan in the architecture_plan phase at the bound repository revision. Return only one compact JSON object; no Markdown or prose.",
      "Evaluate only planned scope, authority, sequence, repository and artifact bindings, API feasibility, exclusions, determinism, replay and identity separation, compatibility, and test strategy.",
      "Do not require completed May implementation, Mack validation, publication evidence, final acceptance, or later human evidence. This technical review grants no authority.",
      "Use only the host-backed read and search tools. Do not invoke or describe bash, shell, filesystem, or Git commands. The runtime filesystem is not the repository authority.",
      "The host tools read the exact bound Git tree. If a tool is needed, call read or search directly; do not infer repository unavailability from the runtime environment.",
      `reviewPhase=${request.reviewPhase}`,
      `repositoryRoot=${request.repositoryRoot}`,
      `repositoryId=${request.repositoryId}`,
      `branch=${request.branch}`,
      `headRevision=${request.headRevision}`,
      `repositoryRevision=${request.headRevision}`,
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
      `allowedFindingCodes=${canonicalJson(COPILOT_FURY_PLAN_FINDING_CODES_V2)}`,
      `outputContract=${outputContractDescriptionV2(request, plan)}`,
      "PASS requires findings=[]. REVISE requires one or more findings from allowedFindingCodes. Unknown or out-of-phase codes are malformed output.",
    ].join("\n");
  }
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
    `outputContract=${outputContractFor(request, plan)}`,
    "PASS requires findings=[]. REVISE requires one or more closed findings. This review has authority none.",
  ].join("\n");
}

function repairPrompt(request: CopilotFuryPlanDispatchRequestV1OrV2, plan: TransitionPlanV1OrV2): string {
  if (request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION) return "Your prior response violated the closed output contract. Return only one corrected JSON object with exactly the required fields and identity echoes.";
  return [
    "Your prior response violated the closed architecture_plan output contract. Return only one corrected compact JSON object; no Markdown or prose.",
    `reviewPhase=${request.reviewPhase}`,
    `repositoryRevision=${request.headRevision}`,
    `transitionPlanId=${plan.id}`,
    `transitionPlanDigest=${plan.digest}`,
    `transitionPlanRawSha256=${request.transitionPlanRawSha256}`,
    `allowedFindingCodes=${canonicalJson(COPILOT_FURY_PLAN_FINDING_CODES_V2)}`,
    `outputContract=${outputContractDescriptionV2(request, plan)}`,
    "PASS requires findings=[]. REVISE requires at least one allowed finding. Unknown or out-of-phase finding codes are invalid.",
  ].join("\n");
}

function packetBody(request: CopilotFuryPlanDispatchRequestV1OrV2, plan: TransitionPlanV1OrV2, card: ResolvedCard, observation: RepositoryObservation, configuration: CopilotFurySdkConfigurationV1) {
  return deepFreeze({
    schemaVersion: request.schemaVersion,
    contractVersion: request.contractVersion,
    authority: "none",
    request,
    transitionPlan: plan,
    cardIdentity: card.identity,
    cardBodyDigest: digestHex(card.card.body),
    missionJournal: { digest: observation.journalDigest, sequence: observation.journalSequence },
    outputContract: outputContractFor(request, plan),
    ...(request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2 ? {
      reviewScope: {
        reviewPhase: request.reviewPhase,
        evaluates: ["scope", "authority", "sequence", "bindings", "api_feasibility", "exclusions", "determinism", "replay", "identity_separation", "compatibility", "test_strategy"],
        excludes: ["completed_may_implementation", "mack_validation", "publication_evidence", "final_acceptance", "later_human_evidence"],
      },
    } : {}),
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
  request: CopilotFuryPlanDispatchRequestV1OrV2,
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
  request: CopilotFuryPlanDispatchRequestV1OrV2;
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
  modelResult: CopilotFuryPlanResultV1OrV2 | null;
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
    executionObservation: "executionObservation" in input.observations ? input.observations.executionObservation ?? null : null,
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

async function verifyLiveBinding(request: CopilotFuryPlanDispatchRequestV1OrV2, source: InternalResolvedTransitionPlanSourceV1, initial: RepositoryObservation, initialPlan: StableFile, initialCard: ResolvedCard, initialArtifactMap: CopilotFuryReviewArtifactMapV1, userCopilotHome?: string): Promise<RepositoryObservation> {
  const current = await observeRepository(request);
  const plan = await revalidateResolvedTransitionPlanSource(request, source);
  const card = await resolveCard(request, userCopilotHome);
  let parsedPlan: unknown;
  try { parsedPlan = parseJsonRejectDuplicateKeys(plan.bytes); } catch { throw new Error("dispatch_input_drift"); }
  const validatedPlan = validateTransitionPlanV1OrV2({ artifact: parsedPlan });
  if (validatedPlan.state === "invalid") throw new Error("dispatch_input_drift");
  const currentArtifactMap = await buildReviewArtifactMap(request, source, validatedPlan.value);
  if (current.identity !== initial.identity || current.configBytes !== initial.configBytes || current.journalBytes !== initial.journalBytes || current.journalDigest !== initial.journalDigest || current.journalSequence !== initial.journalSequence || plan.identity !== initialPlan.identity || plan.bytes !== initialPlan.bytes || plan.rawSha256 !== initialPlan.rawSha256 || card.bytes !== initialCard.bytes || canonicalJson(card.identity) !== canonicalJson(initialCard.identity) || currentArtifactMap.digest !== initialArtifactMap.digest || canonicalJson(currentArtifactMap) !== canonicalJson(initialArtifactMap)) throw new Error("dispatch_input_drift");
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
  request: CopilotFuryPlanDispatchRequestV1OrV2,
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

async function terminalEvidencePathFromReceipt(request: CopilotFuryPlanDispatchRequestV1OrV2, receipt: SeatDispatchReceiptProjectionV1, packetDigest: string): Promise<string> {
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
  request: CopilotFuryPlanDispatchRequestV1OrV2,
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
  if (!receiptMatchesClaimExpectation(receipt, expected)) return Object.freeze({ state: "invalid", code: "RECOVERABLE_PREDECESSOR_CLAIM_MISMATCH" });
  return Object.freeze({
    state: "eligible",
    successor: recoverySuccessorCore(receipt.parentMissionId, receipt.parentSessionId, receipt.receiptId, receipt.lastEntryDigest),
  });
}

function receiptMatchesClaimExpectation(receipt: SeatDispatchReceiptProjectionV1, expected: CopilotFuryRecoveryClaimExpectationV1): boolean {
  return receipt.receiptId === expected.receiptId && receipt.dispatchId === expected.dispatchId && receipt.childTaskId === expected.childTaskId && receipt.childSessionId === expected.childSessionId && receipt.parentMissionId === expected.parentMissionId && receipt.parentMissionRevision === expected.parentMissionRevision && receipt.parentSessionId === expected.parentSessionId && receipt.accountableSeatId === expected.accountableSeatId && receipt.repositoryId === expected.repositoryId && receipt.repositoryWorkspaceId === expected.repositoryWorkspaceId && receipt.repositoryRevision === expected.repositoryRevision && receipt.subjectId === expected.subjectId && receipt.subjectRevision === expected.subjectRevision && receipt.artifactId === expected.artifactId && receipt.artifactRevision === expected.artifactRevision && canonicalJson(receipt.configuredRuntime) === canonicalJson(expected.configuredRuntime) && canonicalJson(receipt.requestedRuntime) === canonicalJson(expected.requestedRuntime) && canonicalJson(receipt.toolExecution) === canonicalJson(expected.toolExecution) && receipt.startedAt === expected.startedAt && sameArray(receipt.inputEvidenceRefs, expected.inputEvidenceRefs);
}

function predecessorClaimExpectation(
  request: CopilotFuryPlanDispatchRequestV1OrV2,
  plan: TransitionPlanV1OrV2,
  identity: ReturnType<typeof claimIdentity>,
  inputEvidenceRefs: readonly string[],
  startedAt = normalizedReceiptTimestamp(request.timestamp.value),
): CopilotFuryRecoveryClaimExpectationV1 {
  return Object.freeze({
    receiptId: identity.receiptId,
    dispatchId: `dispatch:${identity.claimKey}`,
    childTaskId: identity.childTaskId,
    childSessionId: identity.childSessionId,
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
    configuredRuntime: identity.configuredRuntime,
    requestedRuntime: identity.requestedRuntime,
    toolExecution: { kind: "tool.execution.requested" as const, executorBindingRef: request.requestedExecutor },
    startedAt,
    inputEvidenceRefs,
  });
}

async function recoverablePredecessor(
  request: CopilotFuryPlanDispatchRequestV1OrV2,
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
  if (request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION) {
    validateHistoricalV1EvidenceBinding(evidence, request, receipt, packetDigest, { plan, packetId: predecessorIdentity.packetId, packetBytes }, null);
  }
  if (receipt.lastEntryDigest !== COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_TERMINAL_ENTRY_DIGEST || evidence.evidenceDigest !== COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_OUTPUT_EVIDENCE_DIGEST || packetDigest !== COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_PACKET_DIGEST) return null;
  if (evidence.dispositionCode !== RECOVERABLE_FAILURE_CODE || canonicalJson(evidence.errors) !== canonicalJson([RECOVERABLE_FAILURE_MESSAGE])) return null;
  if (receipt.outputEvidenceRefs === null || receipt.outputEvidenceRefs.length !== 1 || receipt.outputEvidenceRefs[0] !== COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_OUTPUT_EVIDENCE_DIGEST) return null;
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
  return firstRecovery;
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

type ReplayPacketExpectationV1 = Readonly<{
  plan: TransitionPlanV1OrV2;
  packetId: string;
  packetBytes: Uint8Array;
}>;

function validateHistoricalV1EvidenceBinding(
  evidence: Plain,
  request: CopilotFuryPlanDispatchRequestV1,
  receipt: SeatDispatchReceiptProjectionV1,
  packetDigest: string,
  expected: ReplayPacketExpectationV1,
  recovery: RecoveryBindingV2 | null,
): void {
  if (recovery === null && (evidence.schemaVersion !== 1 || evidence.contractVersion !== COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION)) throw new Error("replayed_evidence_contract_mismatch");
  if (evidence.authority !== "none" || evidence.packetId !== expected.packetId || evidence.packetDigest !== packetDigest || evidence.receiptId !== receipt.receiptId) throw new Error("replayed_evidence_identity_mismatch");
  if (evidence.missionId !== request.missionId || evidence.missionRevision !== request.missionRevision || evidence.subjectId !== request.subjectId || evidence.subjectRevision !== request.subjectRevision || evidence.repositoryId !== request.repositoryId || evidence.repositoryWorkspaceId !== request.repositoryWorkspaceId || evidence.repositoryRevision !== request.headRevision || evidence.transitionPlanRawSha256 !== request.transitionPlanRawSha256) throw new Error("replayed_evidence_request_binding_mismatch");
  if (!safePlain(evidence.packet)) throw new Error("replayed_evidence_packet_malformed");
  const packetBytes = new TextEncoder().encode(canonicalJson(evidence.packet));
  if (digestBase64Url(packetBytes) !== packetDigest || Buffer.compare(Buffer.from(packetBytes), Buffer.from(expected.packetBytes)) !== 0) throw new Error("replayed_evidence_packet_binding_mismatch");
  if (!safePlain(evidence.packet.request) || canonicalJson(evidence.packet.request) !== canonicalJson(request) || !safePlain(evidence.packet.transitionPlan) || canonicalJson(evidence.packet.transitionPlan) !== canonicalJson(expected.plan)) throw new Error("replayed_evidence_packet_request_mismatch");
  if (!safePlain(evidence.packet.cardIdentity) || !safePlain(evidence.packet.sdkConfiguration) || !safePlain(evidence.packet.missionJournal) || !safePlain(evidence.cardIdentity) || !safePlain(evidence.sdkConfiguration) || !safePlain(evidence.missionJournal) || canonicalJson(evidence.cardIdentity) !== canonicalJson(evidence.packet.cardIdentity) || canonicalJson(evidence.sdkConfiguration) !== canonicalJson(evidence.packet.sdkConfiguration) || canonicalJson(evidence.missionJournal) !== canonicalJson(evidence.packet.missionJournal)) throw new Error("replayed_evidence_packet_projection_mismatch");
  if (!Array.isArray(evidence.errors) || evidence.errors.some((value) => typeof value !== "string") || !safePlain(evidence.artifacts)) throw new Error("replayed_evidence_shape_invalid");
}

async function replayExisting(request: CopilotFuryPlanDispatchRequestV1OrV2, source: InternalResolvedTransitionPlanSourceV1, claim: Extract<SeatDispatchPacketClaimContractResultV1, { state: "valid" }>["value"], recovery: RecoveryBindingV2 | null = null, expectedPacket?: ReplayPacketExpectationV1): Promise<CopilotFuryPlanDispatchResultV1> {
  const receipt = claim.receipt;
  const common = {
    contractVersion: request.contractVersion,
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
    if (request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION) {
      if (expectedPacket === undefined) throw new Error("historical_v1_replay_expectation_missing");
      validateHistoricalV1EvidenceBinding(evidence, request, receipt, claim.packetDigest, expectedPacket, recovery);
    }
    if (evidence.evidenceDigest !== evidenceDigest || evidence.receiptId !== receipt.receiptId || evidence.packetDigest !== claim.packetDigest || evidence.outcome !== "interrupted" || evidence.dispositionCode !== receipt.originalDisposition.code || canonicalJson(evidence.errors) !== canonicalJson(receipt.originalDisposition.errors)) throw new Error("interrupted_recovery_binding_mismatch");
    return deepFreeze({ ...common, state: "recovery_required" as const, code: receipt.originalDisposition.code, errors: [...receipt.originalDisposition.errors], evidencePath, handoff: null });
  }
  if (receipt.state === "started" || receipt.state === "resumed" || receipt.state === "interrupted") {
    return deepFreeze({ ...common, state: "recovery_required" as const, code: "RECOVERY_REQUIRED", errors: ["Existing dispatch is nonterminal and cannot be reinvoked."], evidencePath: null, handoff: null });
  }
  const evidencePath = await terminalEvidencePathFromReceipt(request, receipt, claim.packetDigest);
  const evidence = await parseEvidenceFile(request.repositoryRoot, evidencePath);
  if (request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION) {
    if (expectedPacket === undefined) throw new Error("historical_v1_replay_expectation_missing");
    validateHistoricalV1EvidenceBinding(evidence, request, receipt, claim.packetDigest, expectedPacket, recovery);
  }
  if (recovery !== null) validateSuccessorEvidence(evidence, receipt, recovery);
  if (receipt.outputEvidenceRefs === null || !receipt.outputEvidenceRefs.includes(evidence.evidenceDigest as string)) throw new Error("dispatch_evidence_receipt_binding_mismatch");
  if (receipt.state === "failed" || receipt.state === "cancelled") {
    if (evidence.outcome !== receipt.state) throw new Error("dispatch_evidence_outcome_invalid");
    const dispositionCode = typeof evidence.dispositionCode === "string" && id(evidence.dispositionCode) ? evidence.dispositionCode : String(evidence.outcome).toUpperCase();
    return deepFreeze({ ...common, state: receipt.state, code: dispositionCode, errors: Array.isArray(evidence.errors) ? evidence.errors.filter((value): value is string => typeof value === "string") : [], evidencePath, handoff: null });
  }
  if (evidence.outcome === "REVISE") {
    const planFile = await revalidateResolvedTransitionPlanSource(request, source);
    let planInput: unknown;
    try { planInput = JSON.parse(planFile.bytes); } catch { throw new Error("replayed_input_transition_plan_malformed"); }
    const plan = validateTransitionPlanV1OrV2({ artifact: planInput });
    if (plan.state === "invalid") throw new Error("replayed_input_transition_plan_invalid");
    const modelResult = request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2
      ? validateCopilotFuryPlanResultV2(evidence.modelResult, request, plan.value)
      : validateCopilotFuryPlanResultV1(evidence.modelResult, plan.value);
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

function ownEnumerableDataValue(value: unknown, key: string): Readonly<{ state: "valid"; value: unknown }> | Readonly<{ state: "invalid" }> {
  try {
    if (value === null || (typeof value !== "object" && typeof value !== "function") || isProxy(value)) return { state: "invalid" };
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") ||
        descriptor.get !== undefined || descriptor.set !== undefined) return { state: "invalid" };
    if ((typeof descriptor.value === "object" && descriptor.value !== null || typeof descriptor.value === "function") &&
        isProxy(descriptor.value)) return { state: "invalid" };
    return { state: "valid", value: descriptor.value };
  } catch { return { state: "invalid" }; }
}

const CALLBACK_PERMISSION_KINDS = new Set<CopilotFuryCallbackPermissionKindV1>([
  "read", "write", "shell", "mcp", "url", "memory", "custom-tool", "hook",
  "extension-management", "factory", "extension-permission-access",
]);

function callbackToolIdentity(value: unknown): CopilotFuryCallbackToolIdentityV1 {
  return value === "read" || value === "search" ? value : "unknown";
}

function callbackPermissionKind(value: unknown): CopilotFuryCallbackPermissionKindV1 {
  return typeof value === "string" && CALLBACK_PERMISSION_KINDS.has(value as CopilotFuryCallbackPermissionKindV1)
    ? value as CopilotFuryCallbackPermissionKindV1
    : "unknown";
}

function callbackOwnFieldState(value: unknown, field: string): "present" | "absent" {
  try {
    if (value === null || (typeof value !== "object" && typeof value !== "function") || isProxy(value)) return "absent";
    return Object.getOwnPropertyDescriptor(value, field) === undefined ? "absent" : "present";
  } catch { return "absent"; }
}

function callbackExpectedSessionMatch(value: unknown, expectedSessionId: string): "match" | "mismatch" | "absent" {
  try {
    if (value === null || (typeof value !== "object" && typeof value !== "function") || isProxy(value)) return "absent";
    const descriptor = Object.getOwnPropertyDescriptor(value, "sessionId");
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined) return "absent";
    return descriptor.value === expectedSessionId ? "match" : "mismatch";
  } catch { return "absent"; }
}

function callbackArgumentShape(value: unknown, depth = 0, seen = new Set<object>()): CopilotFuryCallbackArgumentShapeV1 {
  if (depth > 2) throw new Error("shape_rejected");
  if (value === null) return { kind: "null" };
  if ((typeof value === "object" && value !== null || typeof value === "function") && isProxy(value)) throw new Error("shape_rejected");
  if (typeof value === "string") return { kind: "string" };
  if (typeof value === "number") return { kind: "number" };
  if (typeof value === "boolean") return { kind: "boolean" };
  if (typeof value === "undefined") return { kind: "undefined" };
  if (typeof value === "bigint") return { kind: "bigint" };
  if (typeof value === "symbol") return { kind: "symbol" };
  if (typeof value === "function") return { kind: "function" };
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) throw new Error("shape_rejected");
  seen.add(value);
  try {
    const keys = Reflect.ownKeys(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || keys.length !== value.length + 1 || value.length > 8) throw new Error("shape_rejected");
      const entries: CopilotFuryCallbackArgumentShapeV1[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined) throw new Error("shape_rejected");
        entries.push(callbackArgumentShape(descriptor.value, depth + 1, seen));
      }
      return { kind: "array", entries };
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || keys.length > 8) throw new Error("shape_rejected");
    const projectedKeys: CopilotFuryCallbackArgumentKeyV1[] = [];
    const entries: CopilotFuryCallbackArgumentShapeV1[] = [];
    for (const key of keys) {
      if (typeof key !== "string") throw new Error("shape_rejected");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined) throw new Error("shape_rejected");
      projectedKeys.push(key === "path" ? "path" : key === "query" ? "query" : "unknown");
      entries.push(callbackArgumentShape(descriptor.value, depth + 1, seen));
    }
    return { kind: "object", keys: projectedKeys, entries };
  } finally {
    seen.delete(value);
  }
}

function safeCallbackArgumentShape(value: unknown): CopilotFuryCallbackArgumentShapeV1 {
  try { return callbackArgumentShape(value); } catch { return { kind: "rejected" }; }
}

function createCallbackObservationRecorder(expectedSessionId: string) {
  const records: CopilotFuryCallbackObservationRecordV1[] = [];
  let totalCount = 0;
  let truncated = false;
  let firstDenial: CopilotFuryCallbackObservationRecordV1 | null = null;
  const retainFirstDenialAsTerminalSentinel = () => {
    if (firstDenial === null) return;
    const preceding = records.filter((candidate) => candidate !== firstDenial).slice(0, 31);
    records.length = 0;
    records.push(...preceding, firstDenial);
  };
  const record = (input: Readonly<{
    surface: CopilotFuryCallbackSurfaceV1;
    identitySource?: unknown;
    toolCallSource?: unknown;
    tool: CopilotFuryCallbackToolIdentityV1;
    permissionKind: CopilotFuryCallbackPermissionKindV1;
    arguments: unknown;
    decision: CopilotFuryCallbackDecisionV1;
    reason: CopilotFuryCallbackReasonV1;
  }>) => {
    const argumentShape = safeCallbackArgumentShape(input.arguments);
    const ordinal = totalCount === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : totalCount + 1;
    const record: CopilotFuryCallbackObservationRecordV1 = Object.freeze({
      surface: input.surface,
      ordinal,
      callbackIdentity: Object.freeze({ sessionId: callbackOwnFieldState(input.identitySource, "sessionId"), toolCallId: callbackOwnFieldState(input.toolCallSource, "toolCallId") }),
      tool: input.tool,
      permissionKind: input.permissionKind,
      argumentShape: deepFreeze(argumentShape),
      expectedSessionMatch: callbackExpectedSessionMatch(input.identitySource, expectedSessionId),
      decision: input.decision,
      reason: argumentShape.kind === "rejected" ? "shape_rejected" : input.reason,
    });
    totalCount = totalCount === Number.MAX_SAFE_INTEGER ? totalCount : totalCount + 1;
    if (firstDenial === null && (record.decision === "deny" || record.decision === "reject")) firstDenial = record;
    if (records.length < 32) records.push(record);
    else {
      truncated = true;
      retainFirstDenialAsTerminalSentinel();
    }
  };
  return Object.freeze({
    record,
    snapshot: (): CopilotFuryCallbackObservationV1 => deepFreeze({ version: COPILOT_FURY_CALLBACK_OBSERVATION_VERSION, totalCount, truncated, records: [...records] }),
  });
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
  const clientExport = ownEnumerableDataValue(sdk, "CopilotClient");
  const runtimeExport = ownEnumerableDataValue(sdk, "RuntimeConnection");
  if (clientExport.state === "invalid" || typeof clientExport.value !== "function" || runtimeExport.state === "invalid" ||
      !safePlain(runtimeExport.value)) {
    throw new CopilotSdkCapabilityError("copilot_sdk_exports_invalid", "CopilotClient or RuntimeConnection.forStdio export is unavailable.");
  }
  const forStdio = ownEnumerableDataValue(runtimeExport.value, "forStdio");
  if (forStdio.state === "invalid" || typeof forStdio.value !== "function") {
    throw new CopilotSdkCapabilityError("copilot_sdk_exports_invalid", "CopilotClient or RuntimeConnection.forStdio export is unavailable.");
  }
  let connection: unknown;
  try { connection = Reflect.apply(forStdio.value, runtimeExport.value, []); }
  catch (error) {
    throw new CopilotSdkCapabilityError("copilot_stdio_projection_unsafe", error instanceof Error ? error.message : "RuntimeConnection.forStdio threw.");
  }
  const connectionFields = ["kind", "path", "args", "env"] as const;
  const projected = new Map<string, unknown>();
  let connectionSafe = safePlain(connection);
  if (connectionSafe) {
    try {
      const keys = Reflect.ownKeys(connection as object);
      connectionSafe = keys.length === connectionFields.length && keys.every((key) => typeof key === "string" && connectionFields.includes(key as typeof connectionFields[number]));
      for (const field of connectionFields) {
        const observed = ownEnumerableDataValue(connection, field);
        if (observed.state === "invalid") connectionSafe = false;
        else projected.set(field, observed.value);
      }
    } catch { connectionSafe = false; }
  }
  if (!connectionSafe || projected.get("kind") !== "stdio" || projected.get("path") !== undefined ||
      projected.get("args") !== undefined || projected.get("env") !== undefined) {
    throw new CopilotSdkCapabilityError("copilot_stdio_projection_unsafe", "RuntimeConnection.forStdio returned an unsafe projection.");
  }
  const canonicalConnection = Object.freeze({ kind: "stdio" as const, path: undefined, args: undefined, env: undefined });
  return Object.freeze({
    packageVersion,
    clientConstructor: clientExport.value as typeof CopilotClient,
    connection: canonicalConnection as unknown as StdioRuntimeConnection,
  });
}

class DefaultCopilotFuryExecutorV1 implements CopilotFuryPlanExecutorV1 {
  private client: CopilotClient | null = null;
  private clientConstructor: typeof CopilotClient | null = null;
  private loadedPackageVersion: typeof COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION | null = null;
  private clientConnection: StdioRuntimeConnection | null = null;
  private preflightBinding: Readonly<{ repositoryRoot: string; requestedModel: string; executionIdentity: string; artifactMapDigest: string; toolBinding: string }> | null = null;

  constructor(private readonly dependencies: CopilotFuryProductionExecutorDependenciesV1 = {}) {}

  async preflight(input: CopilotFuryExecutorPreflightInputV1): Promise<CopilotFuryExecutorPreflightResultV1> {
    if (input.requestedRuntime !== COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID || input.requestedExecutor !== COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID) return { state: "blocked", code: "BLOCKED_ADAPTER_GAP", errors: ["Requested Copilot runtime or executor is unsupported."] };
    try {
      if (!validExecutionIdentity(input.executionIdentity, input.repositoryRoot)) throw new Error("Copilot client option projection is malformed.");
      validateReviewArtifactMap(input.reviewArtifactMap);
      validateExecutionToolBinding(input.toolBinding, input.reviewArtifactMap);
      const registeredDescriptors = reviewArtifactTools(input.repositoryRoot, "0".repeat(40), input.reviewArtifactMap, () => undefined).map((tool) => ({ name: tool.name, parameters: tool.parameters, overridesBuiltInTool: tool.overridesBuiltInTool, skipPermission: tool.skipPermission, defer: tool.defer }));
      if (registeredDescriptors.length !== 2 || canonicalJson(registeredDescriptors) !== canonicalJson(input.toolBinding.registeredDescriptors)) throw new Error("FURY_TOOL_BINDING_INVALID");
    } catch (error) {
      return { state: "blocked", code: "FURY_TOOL_BINDING_INVALID", errors: [error instanceof Error ? error.message : "Fury tool binding is invalid."] };
    }
    try {
      const capability = await inspectLoadedCopilotSdkCapability(this.dependencies);
      this.loadedPackageVersion = capability.packageVersion;
      this.clientConstructor = capability.clientConstructor;
      this.clientConnection = capability.connection;
      this.preflightBinding = Object.freeze({ repositoryRoot: input.repositoryRoot, requestedModel: input.requestedModel, executionIdentity: canonicalJson(input.executionIdentity), artifactMapDigest: input.reviewArtifactMap.digest, toolBinding: canonicalJson(input.toolBinding) });
      return { state: "ready", packageVersion: capability.packageVersion, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID };
    } catch (error) {
      await this.close();
      return { state: "blocked", code: "BLOCKED_ADAPTER_GAP", errors: [error instanceof Error ? error.message : "Copilot SDK capability is unavailable."] };
    }
  }

  async execute(input: CopilotFuryExecutorRunInputV1): Promise<CopilotFuryExecutorRunResultV1> {
    if (this.clientConstructor === null || this.loadedPackageVersion === null || this.clientConnection === null || this.preflightBinding === null || this.preflightBinding.repositoryRoot !== input.repositoryRoot || this.preflightBinding.requestedModel !== input.configuration.model || this.preflightBinding.executionIdentity !== canonicalJson(input.executionIdentity) || this.preflightBinding.artifactMapDigest !== input.reviewArtifactMap.digest || this.preflightBinding.toolBinding !== canonicalJson(input.toolBinding) || !validExecutionIdentity(input.executionIdentity, input.repositoryRoot) || input.configuration.sessionId !== deriveCopilotSdkSessionIdV1(input.executionIdentity.childSessionId)) return { state: "failed", code: "SDK_NOT_READY", errors: ["Copilot SDK preflight was not retained or did not match execution."], observations: {} };
    try {
      validateReviewArtifactMap(input.reviewArtifactMap);
      validateExecutionToolBinding(input.toolBinding, input.reviewArtifactMap);
    } catch (error) {
      return { state: "failed", code: "FURY_TOOL_BINDING_INVALID", errors: [error instanceof Error ? error.message : "Fury tool binding is invalid."], observations: {} };
    }
    const policyDecisions: { tool: CopilotFuryCallbackToolIdentityV1; decision: "allow" | "deny" }[] = [];
    const callbackObservation = createCallbackObservationRecorder(input.configuration.sessionId);
    const startEvents: Extract<SessionEvent, { type: "session.start" }>[] = [];
    const assistantEvents: Extract<SessionEvent, { type: "assistant.message" }>[] = [];
    let modelChangeObserved = false;
    let agentSubstitutionObserved = false;
    let unauthorizedToolOrEffectObserved = false;
    let confirmedCancellation = false;
    const allowed = new Set<string>(input.toolBinding.modelFacingToolNames);
    const recordDeniedTool = (tool: string) => {
      policyDecisions.push({ tool: callbackToolIdentity(tool), decision: "deny" });
      unauthorizedToolOrEffectObserved = true;
    };
    const immutableTools = reviewArtifactTools(
      input.repositoryRoot,
      input.configuration.repositoryRevision,
      input.reviewArtifactMap,
      recordDeniedTool,
      (tool, args, invocation) => callbackObservation.record({ surface: "handler", identitySource: invocation, toolCallSource: invocation, tool: callbackToolIdentity(tool), permissionKind: "unknown", arguments: args, decision: "invoked", reason: "handler_invoked" }),
    );
    if (immutableTools.length !== 2 || immutableTools.map((tool) => tool.name).join("\0") !== "read\0search") return { state: "failed", code: "FURY_TOOL_BINDING_INVALID", errors: ["FURY_TOOL_BINDING_INVALID"], observations: {} };
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
        availableTools: [...input.toolBinding.sessionAvailableTools],
        excludedTools: [...input.toolBinding.sessionExcludedTools],
        infiniteSessions: { enabled: false },
        customAgents: [{
          name: "fury",
          displayName: input.card.frontmatter.name,
          description: input.card.frontmatter.description,
          tools: [...input.toolBinding.customAgentTools],
          prompt: input.card.body,
          mcpServers: {},
          skills: [],
          model: input.configuration.model,
          infer: false,
        }],
        agent: "fury",
        onEvent,
        onPermissionRequest: async (request: PermissionRequest, invocation?: Readonly<{ sessionId: string }>) => {
          const tool = callbackToolIdentity("toolName" in request ? request.toolName : undefined);
          const decision = "deny" as const;
          policyDecisions.push({ tool, decision });
          unauthorizedToolOrEffectObserved = true;
          callbackObservation.record({ surface: "permission", identitySource: invocation, toolCallSource: request, tool, permissionKind: callbackPermissionKind(request.kind), arguments: request, decision: "reject", reason: "permission_rejected" });
          return { kind: "reject" as const, feedback: "Only the host-backed exact-Git-tree read and search tools are available; SDK path/effect permissions are denied." };
        },
        hooks: {
          onPreToolUse: async (hookInput, invocation?: Readonly<{ sessionId: string }>) => {
            const name = hookInput.toolName;
            const validation = allowed.has(name)
              ? validateReviewArtifactToolCall(input.repositoryRoot, input.reviewArtifactMap, name, hookInput.toolArgs)
              : { state: "invalid" as const };
            const decision = validation.state === "valid" ? "allow" as const : "deny" as const;
            const tool = callbackToolIdentity(name);
            policyDecisions.push({ tool, decision });
            callbackObservation.record({ surface: "pre_tool", identitySource: hookInput, toolCallSource: hookInput, tool, permissionKind: "unknown", arguments: hookInput.toolArgs, decision, reason: decision === "deny" ? "tool_or_arguments_denied" : "exact_tool_allowed" });
            if (decision === "deny") {
              unauthorizedToolOrEffectObserved = true;
              callbackObservation.record({ surface: "handler", tool, permissionKind: "unknown", arguments: hookInput.toolArgs, decision: "not_invoked", reason: "pre_tool_denied" });
            }
            return { permissionDecision: decision, permissionDecisionReason: decision === "deny" ? "Tool is outside the fixed read-only Fury surface." : "Tool is in the fixed read-only Fury surface." };
          },
          onPreMcpToolCall: async (hookInput) => {
            unauthorizedToolOrEffectObserved = true;
            policyDecisions.push({ tool: "unknown", decision: "deny" });
            callbackObservation.record({ surface: "pre_tool", identitySource: hookInput, toolCallSource: hookInput, tool: "unknown", permissionKind: "mcp", arguments: hookInput.arguments, decision: "deny", reason: "mcp_denied" });
            throw new Error("MCP tools are outside the fixed read-only Fury surface.");
          },
        },
      });
      const selectedBefore = await session.rpc.agent.getCurrent();
      const modelBefore = await session.rpc.model.getCurrent();
      const toolsRpc = session.rpc.tools as unknown as Readonly<{ initializeAndValidate?: () => Promise<unknown>; getCurrentMetadata?: () => Promise<unknown> }> | undefined;
      if (toolsRpc === undefined || typeof toolsRpc.initializeAndValidate !== "function" || typeof toolsRpc.getCurrentMetadata !== "function") throw new Error("FURY_TOOL_BINDING_DRIFT");
      let metadataResult: unknown;
      try {
        await toolsRpc.initializeAndValidate();
        metadataResult = await toolsRpc.getCurrentMetadata();
      } catch {
        throw new Error("FURY_TOOL_BINDING_DRIFT");
      }
      if (!safePlain(metadataResult) || !Array.isArray(metadataResult.tools) || metadataResult.tools.length !== 2 || metadataResult.tools.some((tool) => !safePlain(tool) || typeof tool.name !== "string") || new Set(metadataResult.tools.map((tool) => tool.name)).size !== 2 || !sameArray([...metadataResult.tools.map((tool) => tool.name)].sort(), ["read", "search"])) throw new Error("FURY_TOOL_BINDING_DRIFT");
      const runtimeMetadataNames = [...metadataResult.tools.map((tool) => tool.name)].sort() as ["read", "search"];
      const runtimeMetadataDigest = digestBase64Url(canonicalJson(metadataResult.tools));
      const start = startEvents.at(-1);
      if (start === undefined || start.data.sessionId !== input.configuration.sessionId || start.data.selectedModel !== input.configuration.model || start.data.producer !== COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID || typeof start.data.copilotVersion !== "string" || start.data.copilotVersion === "" || selectedBefore.agent?.name !== "fury" || modelBefore.modelId !== input.configuration.model || agentSubstitutionObserved) throw new Error("Copilot session identity observation failed.");
      let finalMessage = await session.sendAndWait({ prompt: input.prompt });
      let outputText = finalMessage?.data.content ?? "";
      for (let attempt = 0; attempt < input.repairLimit && !input.validateOutput(outputText); attempt += 1) {
        finalMessage = await session.sendAndWait({ prompt: input.repairPrompt });
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
          callbackObservation: callbackObservation.snapshot(),
          executionObservation: deepFreeze({
            version: COPILOT_FURY_EXECUTION_OBSERVATION_VERSION,
            sdkVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
            registeredToolNames: ["read", "search"],
            sessionAvailableTools: [...input.toolBinding.sessionAvailableTools],
            sessionExcludedTools: [...input.toolBinding.sessionExcludedTools],
            customAgentTools: [...input.toolBinding.customAgentTools],
            modelFacingToolNames: [...input.toolBinding.modelFacingToolNames],
            runtimeMetadataNames,
            runtimeMetadataDigest,
            artifactMapDigest: input.reviewArtifactMap.digest,
          }),
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Copilot execution failed.";
      const interrupted = /timeout|disconnect|connection|socket|closed unexpectedly/iu.test(message);
      return {
        state: confirmedCancellation ? "cancelled" : interrupted ? "interrupted" : "failed",
        code: message === "FURY_TOOL_BINDING_DRIFT" ? "FURY_TOOL_BINDING_DRIFT" : confirmedCancellation ? "COPILOT_CANCELLED" : interrupted ? "COPILOT_INTERRUPTED" : "COPILOT_EXECUTION_FAILED",
        errors: [message],
        observations: {
          modelChangeObserved,
          agentSubstitutionObserved,
          unauthorizedToolOrEffectObserved,
          policyDecisions: [...policyDecisions],
          callbackObservation: callbackObservation.snapshot(),
        },
      };
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

type DispatchReceiptLogObservation = Readonly<{ state: "absent" } | { state: "present"; identity: string }>;
type DispatchReceiptPathObservation = Readonly<
  | { shieldDirectoryExists: false; rootIdentity: string }
  | { shieldDirectoryExists: true; shieldIdentity: string; log: DispatchReceiptLogObservation }
>;

async function observeOptionalReceiptLogNoFollow(path: string): Promise<DispatchReceiptLogObservation | null> {
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? { state: "absent" } : null; }
  try {
    const opened = await handle.stat();
    const pathEntry = await lstat(path);
    if (!opened.isFile() || opened.nlink !== 1 || pathEntry.isSymbolicLink() || !pathEntry.isFile() || pathEntry.nlink !== 1 ||
        pathEntry.dev !== opened.dev || pathEntry.ino !== opened.ino || await realpath(path) !== path) return null;
    return Object.freeze({ state: "present" as const, identity: `${opened.dev}:${opened.ino}` });
  } catch { return null; }
  finally { await handle.close().catch(() => undefined); }
}

async function receiptLockIsAbsentNoFollow(path: string): Promise<boolean> {
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
  await handle.close().catch(() => undefined);
  return false;
}

async function observeDispatchReceiptPath(repositoryRoot: string): Promise<DispatchReceiptPathObservation | null> {
  const resolved = await resolveSeatDispatchStorePathsReadOnlyV1(repositoryRoot);
  if (resolved.state === "invalid" || resolved.value.repositoryRoot !== repositoryRoot) return null;
  const paths = resolved.value;
  if (!paths.shieldDirectoryExists) {
    try {
      const before = await lstat(repositoryRoot);
      await access(repositoryRoot, constants.W_OK | constants.X_OK);
      const after = await lstat(repositoryRoot);
      return before.isDirectory() && !before.isSymbolicLink() && before.dev === after.dev && before.ino === after.ino
        ? Object.freeze({ shieldDirectoryExists: false as const, rootIdentity: `${before.dev}:${before.ino}` })
        : null;
    } catch { return null; }
  }
  try {
    const parentBefore = await lstat(paths.shieldDirectory);
    if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink() || await realpath(paths.shieldDirectory) !== paths.shieldDirectory) return null;
    await access(paths.shieldDirectory, constants.W_OK | constants.X_OK);
    if (!await receiptLockIsAbsentNoFollow(paths.lockPath)) return null;
    const log = await observeOptionalReceiptLogNoFollow(paths.logPath);
    if (log === null) return null;
    const parentAfter = await lstat(paths.shieldDirectory);
    if (!parentAfter.isDirectory() || parentAfter.isSymbolicLink() || parentAfter.dev !== parentBefore.dev ||
        parentAfter.ino !== parentBefore.ino || await realpath(paths.shieldDirectory) !== paths.shieldDirectory) return null;
    return Object.freeze({
      shieldDirectoryExists: true as const,
      shieldIdentity: `${parentBefore.dev}:${parentBefore.ino}`,
      log,
    });
  } catch { return null; }
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
  let receiptBefore: DispatchReceiptPathObservation | null = null;
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
    receiptBefore = await observeDispatchReceiptPath(before.root);
    receiptSafe = receiptBefore !== null;
    try {
      const sdk = await inspectLoadedCopilotSdkCapability(dependencies);
      packageVersion = sdk.packageVersion;
    } catch (error) {
      sdkReason = error instanceof CopilotSdkCapabilityError ? error.reasonCode : "copilot_sdk_unavailable";
    }
    await dependencies.beforeFinalObservation?.();
    try { after = await captureStartupRepository(before.root); } catch { /* Closed drift result below. */ }
    if (after !== null) {
      const receiptAfter = await observeDispatchReceiptPath(after.root);
      receiptSafe = receiptBefore !== null && receiptAfter !== null && canonicalJson(receiptBefore) === canonicalJson(receiptAfter);
    }
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
  return validateAndProjectCopilotFuryDispatchCapabilityReportV1(deepFreeze({
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
  }));
}

function validCallbackArgumentShape(value: unknown, depth = 0): value is CopilotFuryCallbackArgumentShapeV1 {
  if (depth > 2) return false;
  if (!safePlain(value) || typeof value.kind !== "string") return false;
  const primitiveKinds = ["string", "number", "boolean", "null", "undefined", "bigint", "symbol", "function", "rejected"];
  if (primitiveKinds.includes(value.kind)) return exact(value, ["kind"]);
  if (value.kind !== "object" && value.kind !== "array" || !Array.isArray(value.entries) || value.entries.length > 8 || !value.entries.every((entry) => validCallbackArgumentShape(entry, depth + 1))) return false;
  if (value.kind === "array") return exact(value, ["kind", "entries"]);
  if (!Array.isArray(value.keys) || value.keys.length !== value.entries.length || value.keys.length > 8 || value.keys.some((key) => key !== "path" && key !== "query" && key !== "unknown")) return false;
  return exact(value, ["kind", "keys", "entries"]);
}

function validCallbackObservation(value: unknown): value is CopilotFuryCallbackObservationV1 {
  if (!safePlain(value) || !exact(value, ["version", "totalCount", "truncated", "records"])) return false;
  const data = value as Plain;
  const totalCount = data.totalCount;
  const records = data.records;
  if (data.version !== COPILOT_FURY_CALLBACK_OBSERVATION_VERSION || !Number.isSafeInteger(totalCount) || (totalCount as number) < 0 || typeof data.truncated !== "boolean" || !Array.isArray(records) || records.length > 32 || records.length > (totalCount as number)) return false;
  let previousOrdinal = 0;
  const seenOrdinals = new Set<number>();
  for (const [index, candidate] of records.entries()) {
    if (!safePlain(candidate) || !exact(candidate, ["surface", "ordinal", "callbackIdentity", "tool", "permissionKind", "argumentShape", "expectedSessionMatch", "decision", "reason"])) return false;
    const record = candidate as Plain;
    const callbackIdentity = record.callbackIdentity;
    const ordinal = record.ordinal as number;
    const terminalSentinel = data.truncated === true && index === records.length - 1 && (record.decision === "deny" || record.decision === "reject") && ordinal <= previousOrdinal;
    if (!Number.isSafeInteger(ordinal) || ordinal <= 0 || ordinal > (totalCount as number) || seenOrdinals.has(ordinal) || (!terminalSentinel && ordinal <= previousOrdinal) || !safePlain(callbackIdentity) || !exact(callbackIdentity, ["sessionId", "toolCallId"])) return false;
    const identity = callbackIdentity as Plain;
    if (!["pre_tool", "permission", "handler"].includes(record.surface as string) || !["present", "absent"].includes(identity.sessionId as string) || !["present", "absent"].includes(identity.toolCallId as string) || !["read", "search", "unknown"].includes(record.tool as string) || (!CALLBACK_PERMISSION_KINDS.has(record.permissionKind as CopilotFuryCallbackPermissionKindV1) && record.permissionKind !== "unknown") || !validCallbackArgumentShape(record.argumentShape) || !["match", "mismatch", "absent"].includes(record.expectedSessionMatch as string) || !["allow", "deny", "reject", "invoked", "not_invoked"].includes(record.decision as string) || !["exact_tool_allowed", "tool_or_arguments_denied", "permission_rejected", "mcp_denied", "handler_invoked", "pre_tool_denied", "shape_rejected"].includes(record.reason as string)) return false;
    seenOrdinals.add(ordinal);
    previousOrdinal = ordinal;
  }
  return true;
}

function validExecutorObservations(observations: CopilotFuryExecutorObservationsV1, request: CopilotFuryPlanDispatchRequestV1OrV2, childSessionId: string, artifactMapDigest: string): boolean {
  const executionObservation = observations.executionObservation;
  const toolBindingObserved = executionObservation !== undefined && executionObservation.version === COPILOT_FURY_EXECUTION_OBSERVATION_VERSION && executionObservation.sdkVersion === COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION && sameArray(executionObservation.registeredToolNames, EXECUTION_MODEL_TOOLS) && sameArray(executionObservation.sessionAvailableTools, EXECUTION_AVAILABLE_TOOLS) && sameArray(executionObservation.customAgentTools, EXECUTION_AGENT_TOOLS) && sameArray(executionObservation.modelFacingToolNames, EXECUTION_MODEL_TOOLS) && sameArray(executionObservation.runtimeMetadataNames, EXECUTION_MODEL_TOOLS) && Array.isArray(executionObservation.sessionExcludedTools) && executionObservation.sessionExcludedTools.length === EXECUTION_EXCLUDED_TOOLS.length && executionObservation.sessionExcludedTools.every((value, index) => value === EXECUTION_EXCLUDED_TOOLS[index]) && DIGEST.test(executionObservation.runtimeMetadataDigest) && executionObservation.artifactMapDigest === artifactMapDigest;
  return toolBindingObserved && (observations.callbackObservation === undefined || validCallbackObservation(observations.callbackObservation)) && observations.sessionStartObserved === true && observations.sessionId === childSessionId && observations.selectedAgent === "fury" && observations.model === request.requestedModel && observations.assistantModel === request.requestedModel && observations.runtimeId === request.requestedRuntime && observations.executorId === request.requestedExecutor && observations.loadedSdkPackageVersion === COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION && observations.sessionProducer === request.requestedExecutor && typeof observations.sessionProducerVersion === "string" && observations.sessionProducerVersion.length > 0 && observations.sessionProducerVersion.length <= 255 && observations.modelChangeObserved === false && observations.agentSubstitutionObserved === false && observations.unauthorizedToolOrEffectObserved === false;
}

export async function dispatchCopilotFuryPlanReviewCoreV1(input: unknown, source: InternalResolvedTransitionPlanSourceV1, suppliedDependencies: CopilotFuryPlanDispatchDependenciesV1 = {}): Promise<CopilotFuryPlanDispatchResultV1> {
  const validatedRequest = validateCopilotFuryPlanDispatchRequestV1OrV2(input);
  if (validatedRequest.state === "invalid") return invalid(validatedRequest.code, ...validatedRequest.errors);
  const packetRequest = validatedRequest.value;
  const request = suppliedDependencies.repositoryRootOverride === undefined
    ? packetRequest
    : deepFreeze({ ...packetRequest, repositoryRoot: suppliedDependencies.repositoryRootOverride });
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
  let packetBytes: Uint8Array | null = null;
  let card: ResolvedCard | null = null;
  let observation: RepositoryObservation | null = null;
  let planFile: StableFile | null = null;
  let plan: TransitionPlanV1OrV2 | null = null;
  let reviewArtifactMap: CopilotFuryReviewArtifactMapV1 | null = null;
  let toolBinding: CopilotFuryExecutionToolBindingProjectionV1 | null = null;
  let preflightIdentity: Extract<CopilotFuryExecutorPreflightResultV1, { state: "ready" }> | null = null;
  let terminalUncertain = false;
  let originalDisposition: Readonly<{ code: string; errors: readonly string[] }> = { code: "DISPATCH_FAILED", errors: [] };
  try {
    observation = await observeRepository(request);
    try {
      planFile = await revalidateResolvedTransitionPlanSource(request, source);
    } catch (error) {
      return invalidFor(request, "TRANSITION_PLAN_HEAD_MISMATCH", error instanceof Error ? error.message : "Transition plan is not the literal HEAD blob.");
    }
    if (planFile.rawSha256 !== request.transitionPlanRawSha256) return invalidFor(request, "TRANSITION_PLAN_DIGEST_MISMATCH", "Transition plan raw SHA-256 does not match the request.");
    let parsedPlan: unknown;
    try { parsedPlan = JSON.parse(planFile.bytes); } catch { return invalidFor(request, "INVALID_TRANSITION_PLAN", "Transition plan contains malformed JSON."); }
    const validatedPlan = validateTransitionPlanV1OrV2({ artifact: parsedPlan });
    if (validatedPlan.state === "invalid") return invalidFor(request, "INVALID_TRANSITION_PLAN", ...validatedPlan.errors);
    plan = validatedPlan.value;
    if (plan.missionId !== request.missionId || plan.subjectId !== request.subjectId || plan.repositoryId !== request.repositoryId || plan.planningBaseRevision !== request.planningBaseRevision || plan.digest !== request.subjectRevision) return invalidFor(request, "TRANSITION_PLAN_BINDING_MISMATCH", "Transition plan identity does not match the request.");
    try {
      card = await resolveCard(request, suppliedDependencies.userCopilotHome);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fury card resolution failed.";
      if (message === "same_name_user_card_shadowing_requires_explicit_override" || message === "explicit_user_card_override_unavailable_or_mismatched") return invalidFor(request, "FURY_CARD_SELECTION_INVALID", message);
      return blockedFor(request, "BLOCKED_ADAPTER_GAP", message);
    }
    const predecessorIdentity = deriveSessionIdentity(request, plan);
    let identity: ReturnType<typeof claimIdentity> = predecessorIdentity;
    let claimStartedAt = request.timestamp.value;
    packetId = predecessorIdentity.packetId;
    await validateEvidencePathBeforeClaim(request.repositoryRoot, request.missionId);
    const ledgerBefore = await dependencies.readDispatchLedger({ repositoryRoot: request.repositoryRoot, repositoryId: request.repositoryId, repositoryWorkspaceId: request.repositoryWorkspaceId });
    if (ledgerBefore.state === "invalid" && ledgerBefore.code !== "dispatch_receipt_missing") return invalidFor(request, ledgerBefore.code, ...ledgerBefore.errors);
    const projections = ledgerBefore.state === "valid" ? ledgerBefore.value.projections : [];
    const existing = projections.filter((candidate) => candidate.receiptId === predecessorIdentity.receiptId);
    if (existing.length > 1) return invalidFor(request, "duplicate_start", "Existing packet claim is ambiguous.");
    packetConfiguration = sdkConfiguration(request, deriveCopilotSdkSessionIdV1(predecessorIdentity.childSessionId));
    packetBytes = new TextEncoder().encode(canonicalJson(packetBody(packetRequest, plan, card, observation, packetConfiguration)));
    packetDigest = digestBase64Url(packetBytes);
    if (existing.length === 1 && request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION) {
      const legacyPacketConfiguration = sdkConfiguration(request, predecessorIdentity.childSessionId);
      const legacyPacketBytes = new TextEncoder().encode(canonicalJson(packetBody(packetRequest, plan, card, observation, legacyPacketConfiguration)));
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
      if (!existing[0].inputEvidenceRefs.includes(exactBinding)) return invalidFor(request, "packet_claim_conflict", "Existing packet claim conflicts with the exact request.");
      if (request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION && !receiptMatchesClaimExpectation(existing[0], predecessorClaimExpectation(request, plan, predecessorIdentity, expectedPredecessorInputEvidence))) {
        return invalidFor(request, "packet_claim_conflict", "Existing V1 packet claim conflicts with the complete request identity.");
      }
      const recovery = await recoverablePredecessor(request, existing[0], projections, packetBytes, packetDigest, predecessorIdentity, expectedPredecessorInputEvidence, plan);
      if (recovery === null) {
        return await replayExisting(request, source, {
          logPath: ledgerBefore.state === "valid" ? ledgerBefore.value.logPath : join(request.repositoryRoot, ".shield", "dispatch-receipts.jsonl"),
          byteLength: 0,
          packetDigest,
          receipt: existing[0],
          claimStatus: "already_claimed",
        }, null, { plan, packetId: predecessorIdentity.packetId, packetBytes });
      }
      identity = recovery.successor;
      activeExecutionIdentity = recovery.executionIdentity;
      recoveryBinding = recovery.binding;
      claimStartedAt = recovery.startedAt;
      packetBytes = recovery.packetBytes;
      packetDigest = recovery.packetDigest;
      const successor = projections.find((candidate) => candidate.receiptId === identity.receiptId);
      if (successor !== undefined && successor.state !== "started" && successor.state !== "resumed") {
        return await replayExisting(request, source, {
          logPath: ledgerBefore.state === "valid" ? ledgerBefore.value.logPath : join(request.repositoryRoot, ".shield", "dispatch-receipts.jsonl"),
          byteLength: 0,
          packetDigest,
          receipt: successor,
          claimStatus: "already_claimed",
        }, recoveryBinding, { plan, packetId: identity.packetId, packetBytes });
      }
    }
    if (existing.length === 0 && projections.some((candidate) => candidate.inputEvidenceRefs.some((ref) => ref.startsWith(bindingPrefix)))) return invalidFor(request, "packet_claim_conflict", "Existing packet binding conflicts with the exact request.");
    if (request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION && existing.length === 0) {
      return invalidFor(request, "FRESH_V1_REQUEST_PROHIBITED", "Fresh V1 Fury plan dispatch is disabled; only exact historical claim replay or governed recovery is permitted.");
    }
    try {
      reviewArtifactMap = await buildReviewArtifactMap(request, source, plan);
      toolBinding = executionToolDescriptors(reviewArtifactMap.digest);
      validateReviewArtifactMap(reviewArtifactMap);
      validateExecutionToolBinding(toolBinding, reviewArtifactMap);
    } catch (error) {
      return invalidFor(request, "FURY_TOOL_BINDING_INVALID", error instanceof Error ? error.message : "Fury review-artifact tool binding is invalid.");
    }
    packetId = identity.packetId;
    activeExecutionIdentity ??= executionIdentity(request.repositoryRoot, identity);
    configuration = sdkConfiguration(request, deriveCopilotSdkSessionIdV1(activeExecutionIdentity.childSessionId));
    if (!validExecutionIdentity(activeExecutionIdentity, request.repositoryRoot)) return invalidFor(request, "PRECLAIM_VALIDATION_FAILED", "Copilot client option projection is malformed.");
    await validatePersistencePathBeforeClaim(request.repositoryRoot, activeExecutionIdentity.claimKey);
    if (reviewArtifactMap === null || toolBinding === null) return invalidFor(request, "FURY_TOOL_BINDING_INVALID", "Fury review-artifact tool binding is unavailable.");
    const preflight = await executor.preflight({ repositoryRoot: request.repositoryRoot, requestedModel: request.requestedModel, requestedRuntime: request.requestedRuntime, requestedExecutor: request.requestedExecutor, executionIdentity: activeExecutionIdentity, reviewArtifactMap, toolBinding });
    if (preflight.state === "blocked") return preflight.code === "FURY_TOOL_BINDING_INVALID" ? invalidFor(request, preflight.code, ...preflight.errors) : blockedFor(request, preflight.code, ...preflight.errors);
    if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor) return blockedFor(request, "BLOCKED_ADAPTER_GAP", "Copilot executor preflight identity mismatched the request.");
    preflightIdentity = preflight;
    await suppliedDependencies.beforeClaim?.();
    await verifyLiveBinding(request, source, observation, planFile, card, reviewArtifactMap, suppliedDependencies.userCopilotHome);
    const callerInputEvidenceRefs = recoveryBinding === null
      ? [...expectedPredecessorInputEvidence.slice(0, -1)]
      : [plan.id, plan.digest, `sha256:${request.transitionPlanRawSha256}`, `sha256:${card.identity.contentDigest}`, observation.journalDigest, recoveryBinding.inputEvidenceBinding];
    const claimedInputEvidenceRefs = [...callerInputEvidenceRefs, `evidence:packet-binding:seat-dispatch-v1:${identity.claimKey}:${packetDigest}`];
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
      inputEvidenceRefs: callerInputEvidenceRefs,
      startedAt: claimStartedAt,
    });
    if (claim.state === "invalid") return invalidFor(request, claim.code, ...claim.errors);
    claimedReceipt = claim.value.receipt;
    if (request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION && !receiptMatchesClaimExpectation(claim.value.receipt, predecessorClaimExpectation(request, plan, identity, claimedInputEvidenceRefs, normalizedReceiptTimestamp(claimStartedAt)))) {
      return invalidFor(request, "packet_claim_conflict", "Existing V1 packet claim conflicts with the complete request identity.");
    }
    if (claim.value.claimStatus === "already_claimed") return await replayExisting(request, source, claim.value, recoveryBinding, { plan, packetId, packetBytes });
    const evidenceDirectory = await ensureEvidenceDirectory(request.repositoryRoot, request.missionId);
    await suppliedDependencies.afterClaimBeforeExecution?.();
    const persistence = await materializePersistencePath(request.repositoryRoot, activeExecutionIdentity.claimKey);
    if (persistence.baseDirectory !== activeExecutionIdentity.clientOptions.baseDirectory) throw new Error("copilot_persistence_projection_mismatch");
    await revalidatePersistenceSnapshot(persistence);
    let execution = await executor.execute({ repositoryRoot: request.repositoryRoot, card: card.card, cardIdentity: card.identity, configuration, executionIdentity: activeExecutionIdentity, revalidatePersistence: () => revalidatePersistenceSnapshot(persistence), prompt: taskPrompt(request, plan), repairPrompt: repairPrompt(request, plan), repairLimit: request.repairLimit, validateOutput: (text) => parseClosedResultText(text, request, plan as TransitionPlanV1OrV2).state === "valid", reviewArtifactMap, toolBinding });
    if (execution.state === "completed" && request.contractVersion === COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2 && parseClosedResultText(execution.outputText, request, plan).state === "invalid") {
      execution = { state: "failed", code: COPILOT_FURY_PLAN_PHASE_CONTRACT_ERROR_CODE_V2, errors: ["Fury exhausted the bounded repair lifecycle without producing a valid architecture-plan result."], observations: execution.observations };
    }
    if (execution.state !== "completed") originalDisposition = { code: execution.code, errors: [...execution.errors] };
    terminalUncertain = true;
    await suppliedDependencies.beforeTerminalRevalidation?.();
    const terminalObservation = await verifyLiveBinding(request, source, observation, planFile, card, reviewArtifactMap, suppliedDependencies.userCopilotHome);
    terminalUncertain = false;
    const timestamp = new Date(Math.max(Date.parse(request.timestamp.value) + 1, Date.now())).toISOString();
    if (execution.state !== "completed") {
      const outcome = execution.state;
      const evidence = evidenceWithDigest(evidenceBody({ request: packetRequest, plan, packetId, packetDigest: claim.value.packetDigest, receiptId: claim.value.receipt.receiptId, card, observation: terminalObservation, packetConfiguration, executionConfiguration: configuration, outcome, dispositionCode: execution.code, modelResult: null, observations: execution.observations, errors: execution.errors, artifacts: { transitionPlanPath: null, reviewArtifactPath: null }, recovery: recoveryBinding }));
      const evidenceBytes = `${canonicalJson(evidence)}\n`;
      const evidencePath = await writeContentAddressedArtifact(evidenceDirectory, "dispatch-evidence", evidence.evidenceDigest, evidenceBytes);
      if (execution.state === "interrupted") {
        terminalUncertain = true;
        await suppliedDependencies.beforeTerminalAppend?.();
        await verifyLiveBinding(request, source, observation, planFile, card, reviewArtifactMap as CopilotFuryReviewArtifactMapV1, suppliedDependencies.userCopilotHome);
        if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor) throw new Error("preterminal_executor_binding_mismatch");
        const terminal = await appendLifecycle(request, claim.value.receipt, "dispatch.interrupted", timestamp, null, [evidence.evidenceDigest], dependencies, { code: execution.code, errors: execution.errors });
        await suppliedDependencies.beforeFinalReadback?.();
        const terminalReadback = await readReceiptForFinalProof(request, terminal.receiptId, plan, "interrupted", dependencies);
        const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
        if (recoveryBinding !== null) validateSuccessorEvidence(evidenceReadback, terminalReadback, recoveryBinding);
        if (evidenceReadback.evidenceDigest !== evidence.evidenceDigest || evidenceReadback.dispositionCode !== execution.code || terminalReadback.recoveryEvidenceRefs === null || !terminalReadback.recoveryEvidenceRefs.includes(evidence.evidenceDigest) || terminalReadback.originalDisposition?.code !== execution.code || canonicalJson(terminalReadback.originalDisposition.errors) !== canonicalJson(execution.errors)) throw new Error("interrupted_readback_mismatch");
        return deepFreeze({ contractVersion: request.contractVersion, authority: "none", missionId: request.missionId, state: "recovery_required", code: execution.code, errors: [...execution.errors], receiptId: claim.value.receipt.receiptId, evidencePath, replayed: false, handoff: null });
      }
      const terminalKind = execution.state === "cancelled" ? "dispatch.cancelled" : "dispatch.failed";
      terminalUncertain = true;
      await suppliedDependencies.beforeTerminalAppend?.();
      await verifyLiveBinding(request, source, observation, planFile, card, reviewArtifactMap as CopilotFuryReviewArtifactMapV1, suppliedDependencies.userCopilotHome);
      if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor) throw new Error("preterminal_executor_binding_mismatch");
      const terminal = await appendLifecycle(request, claim.value.receipt, terminalKind, timestamp, null, [evidence.evidenceDigest], dependencies);
      await suppliedDependencies.beforeFinalReadback?.();
      const terminalReadback = await readReceiptForFinalProof(request, terminal.receiptId, plan, execution.state, dependencies);
      const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
      if (recoveryBinding !== null) validateSuccessorEvidence(evidenceReadback, terminalReadback, recoveryBinding);
      if (evidenceReadback.evidenceDigest !== evidence.evidenceDigest || evidenceReadback.receiptId !== terminal.receiptId || evidenceReadback.packetDigest !== claim.value.packetDigest || terminalReadback.outputEvidenceRefs === null || !terminalReadback.outputEvidenceRefs.includes(evidence.evidenceDigest)) throw new Error("terminal_readback_mismatch");
      return deepFreeze({ contractVersion: request.contractVersion, authority: "none", missionId: request.missionId, state: execution.state, code: execution.code, errors: [...execution.errors], receiptId: claim.value.receipt.receiptId, evidencePath, replayed: false, handoff: null });
    }
    if (!validExecutorObservations(execution.observations, request, configuration.sessionId, reviewArtifactMap.digest)) throw new Error("executor_observation_mismatch");
    const result = parseClosedResultText(execution.outputText, request, plan);
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
    const evidence = evidenceWithDigest(evidenceBody({ request: packetRequest, plan, packetId, packetDigest: claim.value.packetDigest, receiptId: claim.value.receipt.receiptId, card, observation: terminalObservation, packetConfiguration, executionConfiguration: configuration, outcome: result.value.verdict, dispositionCode: null, modelResult: result.value, observations: execution.observations, errors: [], artifacts: { transitionPlanPath, reviewArtifactPath }, recovery: recoveryBinding }));
    const evidencePath = await writeContentAddressedArtifact(evidenceDirectory, "dispatch-evidence", evidence.evidenceDigest, `${canonicalJson(evidence)}\n`);
    const refs = result.value.verdict === "PASS" && review !== null
      ? [review.reviewId, review.reviewDigest, review.reviewedArtifactId, review.reviewedArtifactRevision, evidence.evidenceDigest]
      : [plan.id, plan.digest, evidence.evidenceDigest];
    terminalUncertain = true;
    await suppliedDependencies.beforeTerminalAppend?.();
    await verifyLiveBinding(request, source, observation, planFile, card, reviewArtifactMap as CopilotFuryReviewArtifactMapV1, suppliedDependencies.userCopilotHome);
    if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor || !validExecutorObservations(execution.observations, request, configuration.sessionId, reviewArtifactMap.digest)) throw new Error("preterminal_executor_binding_mismatch");
    const terminal = await appendLifecycle(request, claim.value.receipt, "dispatch.completed", timestamp, execution.observations, refs, dependencies);
    await suppliedDependencies.beforeFinalReadback?.();
    const terminalReadback = await readReceiptForFinalProof(request, terminal.receiptId, plan, "completed", dependencies);
    const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
    if (recoveryBinding !== null) validateSuccessorEvidence(evidenceReadback, terminalReadback, recoveryBinding);
    if (evidenceReadback.evidenceDigest !== evidence.evidenceDigest || evidenceReadback.receiptId !== terminal.receiptId || evidenceReadback.packetDigest !== claim.value.packetDigest || canonicalJson(evidenceReadback.packet) !== canonicalJson(evidence.packet) || !safePlain(evidenceReadback.artifacts) || evidenceReadback.artifacts.transitionPlanPath !== transitionPlanPath || evidenceReadback.artifacts.reviewArtifactPath !== reviewArtifactPath || terminalReadback.outputEvidenceRefs === null || !refs.every((ref) => terminalReadback.outputEvidenceRefs?.includes(ref))) throw new Error("terminal_readback_mismatch");
    const common = { contractVersion: request.contractVersion, authority: "none" as const, missionId: request.missionId, state: "completed" as const, receiptId: terminal.receiptId, evidencePath, replayed: false };
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
    if (claimedReceipt === null || observation === null || card === null || configuration === null || packetConfiguration === null || activeExecutionIdentity === null || plan === null || planFile === null || preflightIdentity === null) return invalidFor(request, "PRECLAIM_VALIDATION_FAILED", message);
    if (originalDisposition.errors.length === 0 && originalDisposition.code === "DISPATCH_FAILED") originalDisposition = { code: "DISPATCH_FAILED", errors: [message] };
    const recovery = (errors: readonly string[], evidencePath: string | null = null): CopilotFuryPlanDispatchResultV1 => deepFreeze({
      contractVersion: request.contractVersion,
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
          if (packetBytes === null) throw new Error("replay_packet_expectation_unavailable");
          return await replayExisting(request, source, { logPath: ledger.value.logPath, byteLength: 0, packetDigest, receipt: claimedReceipt, claimStatus: "already_claimed" }, recoveryBinding, { plan, packetId, packetBytes });
        } catch (verificationError) {
          return recovery([message, verificationError instanceof Error ? verificationError.message : "Existing terminal receipt verification failed."]);
        }
      }
      const directory = await ensureEvidenceDirectory(request.repositoryRoot, request.missionId);
      if (!terminalUncertain) {
        try {
          await verifyLiveBinding(request, source, observation, planFile, card, reviewArtifactMap as CopilotFuryReviewArtifactMapV1, suppliedDependencies.userCopilotHome);
          if (preflightIdentity.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflightIdentity.runtimeId !== request.requestedRuntime || preflightIdentity.executorId !== request.requestedExecutor) throw new Error("preterminal_executor_binding_mismatch");
        } catch {
          terminalUncertain = true;
        }
      }
      const outcome = terminalUncertain ? "interrupted" as const : "failed" as const;
      const disposition = terminalUncertain ? originalDisposition : { code: "DISPATCH_FAILED", errors: [message] };
      const evidence = evidenceWithDigest(evidenceBody({ request: packetRequest, plan, packetId, packetDigest, receiptId: claimedReceipt.receiptId, card, observation, packetConfiguration, executionConfiguration: configuration, outcome, dispositionCode: disposition.code, modelResult: null, observations: {}, errors: disposition.errors, artifacts: { transitionPlanPath: null, reviewArtifactPath: null }, recovery: recoveryBinding }));
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
      return deepFreeze({ contractVersion: request.contractVersion, authority: "none", missionId: request.missionId, state: "failed", code: "DISPATCH_FAILED", errors: [message], receiptId: receipt.receiptId, evidencePath, replayed: false, handoff: null });
    } catch (terminalError) {
      try {
        const ledger = await dependencies.readDispatchLedger({ repositoryRoot: request.repositoryRoot, repositoryId: request.repositoryId, repositoryWorkspaceId: request.repositoryWorkspaceId });
        if (ledger.state === "valid") {
          const matches = ledger.value.projections.filter((candidate) => candidate.receiptId === claimedReceipt?.receiptId);
          if (matches.length === 1 && matches[0].state !== "started" && matches[0].state !== "resumed") {
            try {
              if (packetBytes === null) throw new Error("replay_packet_expectation_unavailable");
              return await replayExisting(request, source, { logPath: ledger.value.logPath, byteLength: 0, packetDigest, receipt: matches[0], claimStatus: "already_claimed" }, recoveryBinding, { plan, packetId, packetBytes });
            } catch { /* return the receipt-bound uncertainty below */ }
          }
        }
      } catch { /* preserve the original readback uncertainty */ }
      return recovery([message, terminalError instanceof Error ? terminalError.message : "Terminalization failed."]);
    }
  } finally { await executor.close?.().catch(() => undefined); }
}
