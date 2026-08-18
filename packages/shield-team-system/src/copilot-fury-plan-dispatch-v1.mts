import { execFile as execFileNode } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir, realpath, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import type { CopilotClient, CopilotSession, PermissionRequest, SessionEvent } from "@github/copilot-sdk";
import { validateTransitionPlanV1OrV2, type TransitionPlanV1OrV2 } from "@shield/mission-preparation";

import { parseShieldConfig } from "./config.mjs";
import { parseCopilotAgentCardV1, type CopilotAgentCardV1 } from "./copilot-teammate-readiness-v1.mjs";
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
  type SeatDispatchPacketClaimContractResultV1,
} from "./seat-dispatch-store.mjs";

export const COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION = "shield.copilot-fury-plan-dispatch.request.v1" as const;
export const COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION = "shield.copilot-fury-plan-result.v1" as const;
export const COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION = "shield.copilot-fury-plan-dispatch.evidence.v1" as const;
export const COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION = "1.0.11" as const;
export const COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID = "github-copilot-sdk:1.0.11" as const;
export const COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID = "copilot-agent" as const;
export const COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_ROOT = ".shield/audit/copilot-fury-plan-dispatch" as const;
export const COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF = ".github/agents/fury.agent.md" as const;
export const COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF = "user://agents/fury.agent.md" as const;
export const COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS = Object.freeze(["read", "search"] as const);
export const COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS = Object.freeze([] as const);
export const COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS = Object.freeze(["PASS", "REVISE", "cancelled", "failed"] as const);

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
  readonly prompt: string;
  readonly repairLimit: number;
  readonly validateOutput: (text: string) => boolean;
}

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
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_RESULT_BYTES || text.trim() !== text || text === "") return { state: "invalid" as const };
  let parsed: unknown;
  try { parsed = parseJsonRejectDuplicateKeys(text); } catch { return { state: "invalid" as const }; }
  return validateCopilotFuryPlanResultV1(parsed, plan);
}

function cleanGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: "0", LANG: "C", LC_ALL: "C" };
  for (const name of GIT_CONTEXT_VARIABLES) delete environment[name];
  return environment;
}

function git(root: string, args: readonly string[]): Promise<string> {
  return new Promise((resolveValue, reject) => {
    execFileNode("git", ["-C", root, ...args], { encoding: "utf8", timeout: 15_000, maxBuffer: 4 * 1024 * 1024, shell: false, env: cleanGitEnvironment() }, (error, stdout) => {
      if (error) reject(error); else resolveValue(stdout);
    });
  });
}

function gitBytes(root: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolveValue, reject) => {
    execFileNode("git", ["-C", root, ...args], { encoding: "buffer", timeout: 15_000, maxBuffer: 4 * 1024 * 1024, shell: false, env: cleanGitEnvironment() }, (error, stdout) => {
      if (error) reject(error); else resolveValue(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
    });
  });
}

async function confinedExactHeadRead(repositoryRoot: string, headRevision: string, requestedPath: string): Promise<boolean> {
  try {
    const canonicalRoot = await realpath(repositoryRoot);
    if (canonicalRoot !== repositoryRoot || typeof requestedPath !== "string" || requestedPath === "" || requestedPath.includes("\0")) return false;
    let path: string;
    if (isAbsolute(requestedPath)) {
      if (resolve(requestedPath) !== requestedPath) return false;
      path = requestedPath;
    } else {
      if (!normalizedRelativePath(requestedPath)) return false;
      path = join(repositoryRoot, ...requestedPath.split("/"));
    }
    const relation = relative(repositoryRoot, path);
    if (!normalizedRelativePath(relation.split(sep).join("/"))) return false;
    let current = repositoryRoot;
    for (const component of relation.split(sep)) {
      current = join(current, component);
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) return false;
    }
    if (await realpath(path) !== path) return false;
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_INPUT_BYTES) return false;
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer;
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) return false;
      bytes = await handle.readFile();
      const after = await handle.stat();
      if (after.dev !== opened.dev || after.ino !== opened.ino || after.nlink !== 1 || after.size !== opened.size) return false;
    } finally { await handle.close(); }
    const currentHead = (await git(repositoryRoot, ["rev-parse", "--verify", "HEAD"])).trim();
    if (currentHead !== headRevision) return false;
    const expected = await gitBytes(repositoryRoot, ["show", `${headRevision}:${relation.split(sep).join("/")}`]);
    return expected.equals(bytes);
  } catch {
    return false;
  }
}

function toolReadPath(toolArgs: unknown): string | null {
  if (!safePlain(toolArgs)) return null;
  for (const field of ["path", "filePath", "file", "directory"] as const) {
    const value = toolArgs[field];
    if (typeof value === "string") return value;
  }
  return null;
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

async function resolveCard(request: CopilotFuryPlanDispatchRequestV1, userCopilotHome?: string): Promise<ResolvedCard> {
  const repositoryBytes = await git(request.repositoryRoot, ["show", `${request.headRevision}:${COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF}`]);
  const repositoryDigest = digestHex(repositoryBytes);
  const repositoryCard = parseCopilotAgentCardV1(repositoryBytes);
  if (repositoryCard.frontmatter.name.toLocaleLowerCase("en-US") !== "fury") throw new Error("repository_fury_card_seat_mismatch");
  const base = userCopilotHome ?? process.env.COPILOT_HOME ?? join(homedir(), ".copilot");
  const userPath = join(resolve(base), "agents", "fury.agent.md");
  const userFile = await optionalStableAbsoluteFile(userPath, "user_fury_card");
  let userCard: CopilotAgentCardV1 | null = null;
  if (userFile !== null) {
    const canonicalBase = await realpath(resolve(base));
    const canonicalUserPath = await realpath(userPath);
    if (canonicalBase !== resolve(base) || canonicalUserPath !== userPath || relative(canonicalBase, canonicalUserPath).startsWith(`..${sep}`)) throw new Error("user_fury_card_unsafe_ancestry");
    userCard = parseCopilotAgentCardV1(userFile.bytes);
    if (userCard.frontmatter.name.toLocaleLowerCase("en-US") !== "fury") userCard = null;
  }
  if (request.cardSelection.kind === "repository_default") {
    if (userCard !== null && userFile !== null) throw new Error("same_name_user_card_shadowing_requires_explicit_override");
    return deepFreeze({
      card: repositoryCard,
      bytes: repositoryBytes,
      sourcePath: null,
      identity: {
        sourceKind: "repository",
        logicalRef: COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF,
        contentDigest: repositoryDigest,
        repositoryRevision: request.headRevision,
        precedenceObservations: [
          { sourceKind: "repository", logicalRef: COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF, disposition: "selected", contentDigest: repositoryDigest },
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
        { sourceKind: "repository", logicalRef: COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF, disposition: "not_selected_explicit_override", contentDigest: repositoryDigest },
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
  configuration: CopilotFurySdkConfigurationV1;
  outcome: "PASS" | "REVISE" | "failed" | "cancelled" | "interrupted";
  dispositionCode: string | null;
  modelResult: CopilotFuryPlanResultV1 | null;
  observations: CopilotFuryExecutorObservationsV1 | Partial<CopilotFuryExecutorObservationsV1>;
  errors: readonly string[];
  artifacts: Readonly<{ transitionPlanPath: string | null; reviewArtifactPath: string | null }>;
}) {
  return deepFreeze({
    schemaVersion: 1,
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION,
    authority: "none",
    packetId: input.packetId,
    packetDigest: input.packetDigest,
    packet: packetBody(input.request, input.plan, input.card, input.observation, input.configuration),
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
    sdkConfiguration: input.configuration,
    missionJournal: { digest: input.observation.journalDigest, sequence: input.observation.journalSequence },
    outcome: input.outcome,
    dispositionCode: input.dispositionCode,
    modelResult: input.modelResult,
    observations: input.observations,
    errors: [...input.errors],
    artifacts: input.artifacts,
  });
}

function evidenceWithDigest(body: ReturnType<typeof evidenceBody>) {
  const evidenceDigest = digestBase64Url(`${COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION}\0${canonicalJson(body)}`);
  return deepFreeze({ ...body, evidenceDigest });
}

async function verifyLiveBinding(request: CopilotFuryPlanDispatchRequestV1, initial: RepositoryObservation, initialPlan: StableFile, initialCard: ResolvedCard, userCopilotHome?: string): Promise<RepositoryObservation> {
  const current = await observeRepository(request);
  const plan = await stableTextFile(request.repositoryRoot, request.transitionPlanPath, "transition_plan");
  const card = await resolveCard(request, userCopilotHome);
  if (current.identity !== initial.identity || current.configBytes !== initial.configBytes || current.journalBytes !== initial.journalBytes || current.journalDigest !== initial.journalDigest || current.journalSequence !== initial.journalSequence || plan.identity !== initialPlan.identity || plan.bytes !== initialPlan.bytes || plan.rawSha256 !== initialPlan.rawSha256 || card.bytes !== initialCard.bytes || canonicalJson(card.identity) !== canonicalJson(initialCard.identity)) throw new Error("dispatch_input_drift");
  return current;
}

async function parseEvidenceFile(repositoryRoot: string, relativePath: string): Promise<Plain> {
  const file = await stableTextFile(repositoryRoot, relativePath, "dispatch_evidence", MAX_EVIDENCE_BYTES);
  let parsed: unknown;
  try { parsed = parseJsonRejectDuplicateKeys(file.bytes); } catch { throw new Error("dispatch_evidence_malformed"); }
  if (!safePlain(parsed) || parsed.contractVersion !== COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION || typeof parsed.evidenceDigest !== "string") throw new Error("dispatch_evidence_malformed");
  const { evidenceDigest, ...body } = parsed;
  if (evidenceDigest !== digestBase64Url(`${COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION}\0${canonicalJson(body)}`)) throw new Error("dispatch_evidence_digest_mismatch");
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

async function evidencePathForReplay(request: CopilotFuryPlanDispatchRequestV1, receipt: SeatDispatchReceiptProjectionV1, packetDigest: string): Promise<string | null> {
  const directory = await existingEvidenceDirectory(request.repositoryRoot, request.missionId);
  if (directory === null) return null;
  const entries = (await readdir(directory.absolute)).filter((name) => /^dispatch-evidence-[A-Za-z0-9_-]+\.json$/u.test(name)).sort();
  if (entries.length > 128) throw new Error("dispatch_evidence_inventory_unbounded");
  const matches: string[] = [];
  for (const entry of entries) {
    const relativePath = `${directory.relative}/${entry}`;
    const evidence = await parseEvidenceFile(request.repositoryRoot, relativePath);
    if (evidence.receiptId === receipt.receiptId && evidence.packetDigest === packetDigest) matches.push(relativePath);
  }
  if (matches.length > 1) throw new Error("dispatch_evidence_ambiguous");
  return matches[0] ?? null;
}

async function replayExisting(request: CopilotFuryPlanDispatchRequestV1, claim: Extract<SeatDispatchPacketClaimContractResultV1, { state: "valid" }>["value"]): Promise<CopilotFuryPlanDispatchResultV1> {
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
    const evidencePath = await evidencePathForReplay(request, receipt, claim.packetDigest);
    const evidence = evidencePath === null ? null : await parseEvidenceFile(request.repositoryRoot, evidencePath);
    const errors = evidence !== null && Array.isArray(evidence.errors)
      ? evidence.errors.filter((value): value is string => typeof value === "string")
      : ["Existing dispatch is nonterminal and cannot be reinvoked."];
    return deepFreeze({ ...common, state: "recovery_required" as const, code: "RECOVERY_REQUIRED", errors, evidencePath, handoff: null });
  }
  const evidencePath = await evidencePathForReplay(request, receipt, claim.packetDigest);
  if (evidencePath === null) return deepFreeze({ ...common, state: "recovery_required" as const, code: "RECOVERY_REQUIRED", errors: ["Existing terminal dispatch evidence is unavailable."], evidencePath: null, handoff: null });
  const evidence = await parseEvidenceFile(request.repositoryRoot, evidencePath);
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

type CopilotSdkModuleV1 = Readonly<{ CopilotClient: typeof CopilotClient }>;

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

class DefaultCopilotFuryExecutorV1 implements CopilotFuryPlanExecutorV1 {
  private client: CopilotClient | null = null;
  private loadedPackageVersion: typeof COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION | null = null;

  constructor(private readonly dependencies: CopilotFuryProductionExecutorDependenciesV1 = {}) {}

  async preflight(input: CopilotFuryExecutorPreflightInputV1): Promise<CopilotFuryExecutorPreflightResultV1> {
    if (input.requestedRuntime !== COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID || input.requestedExecutor !== COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID) return { state: "blocked", code: "BLOCKED_ADAPTER_GAP", errors: ["Requested Copilot runtime or executor is unsupported."] };
    try {
      const sdk = await (this.dependencies.loadSdk?.() ?? import("@github/copilot-sdk"));
      if (typeof sdk.CopilotClient !== "function") throw new Error("CopilotClient export is unavailable.");
      const packageVersion = await (this.dependencies.resolveLoadedPackageVersion?.() ?? resolveLoadedCopilotSdkPackageVersion());
      if (packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION) throw new Error(`Loaded Copilot SDK version ${packageVersion} does not match ${COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION}.`);
      this.loadedPackageVersion = packageVersion;
      this.client = new sdk.CopilotClient({ mode: "empty", workingDirectory: input.repositoryRoot, logLevel: "none" });
      await this.client.start();
      const models = await this.client.listModels();
      if (!models.some((model) => model.id === input.requestedModel)) throw new Error("Requested Copilot model is unavailable.");
      return { state: "ready", packageVersion, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID };
    } catch (error) {
      await this.close();
      return { state: "blocked", code: "BLOCKED_ADAPTER_GAP", errors: [error instanceof Error ? error.message : "Copilot SDK capability is unavailable."] };
    }
  }

  async execute(input: CopilotFuryExecutorRunInputV1): Promise<CopilotFuryExecutorRunResultV1> {
    if (this.client === null || this.loadedPackageVersion === null) return { state: "failed", code: "SDK_NOT_READY", errors: ["Copilot SDK preflight was not retained."], observations: {} };
    const policyDecisions: { tool: string; decision: "allow" | "deny" }[] = [];
    const startEvents: Extract<SessionEvent, { type: "session.start" }>[] = [];
    const assistantEvents: Extract<SessionEvent, { type: "assistant.message" }>[] = [];
    let modelChangeObserved = false;
    let agentSubstitutionObserved = false;
    let unauthorizedToolOrEffectObserved = false;
    let confirmedCancellation = false;
    const allowed = new Set<string>(input.configuration.availableTools);
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
        tools: [],
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
          const elevated = request.managedApprovalRequired === true || ("requestSandboxBypass" in request && request.requestSandboxBypass === true);
          const confined = !elevated && request.kind === "read" && allowed.has("read")
            ? await confinedExactHeadRead(input.repositoryRoot, input.configuration.repositoryRevision, request.path)
            : false;
          const decision = confined ? "allow" : "deny";
          policyDecisions.push({ tool, decision });
          if (decision === "deny") unauthorizedToolOrEffectObserved = true;
          return decision === "allow" ? { kind: "approve-once" as const } : { kind: "reject" as const, feedback: "This Fury operation is read-only and the requested effect is not allowed." };
        },
        hooks: {
          onPreToolUse: async (hookInput) => {
            const name = hookInput.toolName;
            const requestedPath = toolReadPath(hookInput.toolArgs);
            const confined = allowed.has(name) && requestedPath !== null
              ? await confinedExactHeadRead(input.repositoryRoot, input.configuration.repositoryRevision, requestedPath)
              : false;
            const decision = confined ? "allow" as const : "deny" as const;
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
    this.loadedPackageVersion = null;
    if (client !== null) await client.stop().catch(async () => client.forceStop());
  }
}

export function createCopilotFuryPlanExecutorV1(dependencies: CopilotFuryProductionExecutorDependenciesV1 = {}): CopilotFuryPlanExecutorV1 {
  return new DefaultCopilotFuryExecutorV1(dependencies);
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
  let packetId = "";
  let packetDigest = "";
  let card: ResolvedCard | null = null;
  let observation: RepositoryObservation | null = null;
  let planFile: StableFile | null = null;
  let plan: TransitionPlanV1OrV2 | null = null;
  let preflightIdentity: Extract<CopilotFuryExecutorPreflightResultV1, { state: "ready" }> | null = null;
  try {
    observation = await observeRepository(request);
    planFile = await stableTextFile(request.repositoryRoot, request.transitionPlanPath, "transition_plan");
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
    const identity = deriveSessionIdentity(request, plan);
    packetId = identity.packetId;
    configuration = sdkConfiguration(request, identity.childSessionId);
    const packetBytes = new TextEncoder().encode(canonicalJson(packetBody(request, plan, card, observation, configuration)));
    packetDigest = digestBase64Url(packetBytes);
    await validateEvidencePathBeforeClaim(request.repositoryRoot, request.missionId);
    const ledgerBefore = await dependencies.readDispatchLedger({ repositoryRoot: request.repositoryRoot, repositoryId: request.repositoryId, repositoryWorkspaceId: request.repositoryWorkspaceId });
    if (ledgerBefore.state === "invalid" && ledgerBefore.code !== "dispatch_receipt_missing") return invalid(ledgerBefore.code, ...ledgerBefore.errors);
    const projections = ledgerBefore.state === "valid" ? ledgerBefore.value.projections : [];
    const existing = projections.filter((candidate) => candidate.receiptId === identity.receiptId);
    const bindingPrefix = `evidence:packet-binding:seat-dispatch-v1:${identity.claimKey}:`;
    const exactBinding = `${bindingPrefix}${packetDigest}`;
    if (existing.length > 1) return invalid("duplicate_start", "Existing packet claim is ambiguous.");
    if (existing.length === 1) {
      if (!existing[0].inputEvidenceRefs.includes(exactBinding)) return invalid("packet_claim_conflict", "Existing packet claim conflicts with the exact request.");
      return await replayExisting(request, {
        logPath: ledgerBefore.state === "valid" ? ledgerBefore.value.logPath : join(request.repositoryRoot, ".shield", "dispatch-receipts.jsonl"),
        byteLength: 0,
        packetDigest,
        receipt: existing[0],
        claimStatus: "already_claimed",
      });
    }
    if (projections.some((candidate) => candidate.inputEvidenceRefs.some((ref) => ref.startsWith(bindingPrefix)))) return invalid("packet_claim_conflict", "Existing packet binding conflicts with the exact request.");
    const preflight = await executor.preflight({ repositoryRoot: request.repositoryRoot, requestedModel: request.requestedModel, requestedRuntime: request.requestedRuntime, requestedExecutor: request.requestedExecutor });
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
      startedAt: request.timestamp.value,
      configuredRuntime: identity.configuredRuntime,
      requestedRuntime: identity.requestedRuntime,
      toolExecution: { kind: "tool.execution.requested", executorBindingRef: request.requestedExecutor },
      runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
      runtimeHostObserved: { kind: "runtime.host_observed.unavailable", reason: "unobserved" },
      executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
      executorHostObserved: { kind: "executor.host_observed.unavailable", reason: "not_observed" },
      packetId: packetId,
      packetBytes,
      inputEvidenceRefs: [plan.id, plan.digest, `sha256:${request.transitionPlanRawSha256}`, `sha256:${card.identity.contentDigest}`, observation.journalDigest],
    });
    if (claim.state === "invalid") return invalid(claim.code, ...claim.errors);
    claimedReceipt = claim.value.receipt;
    if (claim.value.claimStatus === "already_claimed") return await replayExisting(request, claim.value);
    const evidenceDirectory = await ensureEvidenceDirectory(request.repositoryRoot, request.missionId);
    await suppliedDependencies.afterClaimBeforeExecution?.();
    const execution = await executor.execute({ repositoryRoot: request.repositoryRoot, card: card.card, cardIdentity: card.identity, configuration, prompt: taskPrompt(request, plan), repairLimit: request.repairLimit, validateOutput: (text) => parseClosedResultText(text, plan as TransitionPlanV1OrV2).state === "valid" });
    await suppliedDependencies.beforeTerminalRevalidation?.();
    const terminalObservation = await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
    const timestamp = new Date(Math.max(Date.parse(request.timestamp.value) + 1, Date.now())).toISOString();
    if (execution.state !== "completed") {
      const outcome = execution.state;
      const evidence = evidenceWithDigest(evidenceBody({ request, plan, packetId, packetDigest: claim.value.packetDigest, receiptId: claim.value.receipt.receiptId, card, observation: terminalObservation, configuration, outcome, dispositionCode: execution.code, modelResult: null, observations: execution.observations, errors: execution.errors, artifacts: { transitionPlanPath: null, reviewArtifactPath: null } }));
      const evidenceBytes = `${canonicalJson(evidence)}\n`;
      const evidencePath = await writeContentAddressedArtifact(evidenceDirectory, "dispatch-evidence", evidence.evidenceDigest, evidenceBytes);
      if (execution.state === "interrupted") {
        await suppliedDependencies.beforeTerminalAppend?.();
        await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
        if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor) throw new Error("preterminal_executor_binding_mismatch");
        const terminal = await appendLifecycle(request, claim.value.receipt, "dispatch.interrupted", timestamp, null, [evidence.evidenceDigest], dependencies, { code: execution.code, errors: execution.errors });
        await suppliedDependencies.beforeFinalReadback?.();
        const terminalReadback = await readReceiptForFinalProof(request, terminal.receiptId, plan, "interrupted", dependencies);
        const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
        if (evidenceReadback.evidenceDigest !== evidence.evidenceDigest || evidenceReadback.dispositionCode !== execution.code || terminalReadback.recoveryEvidenceRefs === null || !terminalReadback.recoveryEvidenceRefs.includes(evidence.evidenceDigest) || terminalReadback.originalDisposition?.code !== execution.code || canonicalJson(terminalReadback.originalDisposition.errors) !== canonicalJson(execution.errors)) throw new Error("interrupted_readback_mismatch");
        return deepFreeze({ contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION, authority: "none", missionId: request.missionId, state: "recovery_required", code: execution.code, errors: [...execution.errors], receiptId: claim.value.receipt.receiptId, evidencePath, replayed: false, handoff: null });
      }
      const terminalKind = execution.state === "cancelled" ? "dispatch.cancelled" : "dispatch.failed";
      await suppliedDependencies.beforeTerminalAppend?.();
      await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
      if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor) throw new Error("preterminal_executor_binding_mismatch");
      const terminal = await appendLifecycle(request, claim.value.receipt, terminalKind, timestamp, null, [evidence.evidenceDigest], dependencies);
      await suppliedDependencies.beforeFinalReadback?.();
      const terminalReadback = await readReceiptForFinalProof(request, terminal.receiptId, plan, execution.state, dependencies);
      const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
      if (evidenceReadback.evidenceDigest !== evidence.evidenceDigest || evidenceReadback.receiptId !== terminal.receiptId || evidenceReadback.packetDigest !== claim.value.packetDigest || terminalReadback.outputEvidenceRefs === null || !terminalReadback.outputEvidenceRefs.includes(evidence.evidenceDigest)) throw new Error("terminal_readback_mismatch");
      return deepFreeze({ contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION, authority: "none", missionId: request.missionId, state: execution.state, code: execution.code, errors: [...execution.errors], receiptId: claim.value.receipt.receiptId, evidencePath, replayed: false, handoff: null });
    }
    if (!validExecutorObservations(execution.observations, request, configuration.sessionId)) throw new Error("executor_observation_mismatch");
    const result = parseClosedResultText(execution.outputText, plan);
    if (result.state === "invalid") throw new Error("invalid_fury_model_result");
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
    const evidence = evidenceWithDigest(evidenceBody({ request, plan, packetId, packetDigest: claim.value.packetDigest, receiptId: claim.value.receipt.receiptId, card, observation: terminalObservation, configuration, outcome: result.value.verdict, dispositionCode: null, modelResult: result.value, observations: execution.observations, errors: [], artifacts: { transitionPlanPath, reviewArtifactPath } }));
    const evidencePath = await writeContentAddressedArtifact(evidenceDirectory, "dispatch-evidence", evidence.evidenceDigest, `${canonicalJson(evidence)}\n`);
    const refs = result.value.verdict === "PASS" && review !== null
      ? [review.reviewId, review.reviewDigest, review.reviewedArtifactId, review.reviewedArtifactRevision, evidence.evidenceDigest]
      : [plan.id, plan.digest, evidence.evidenceDigest];
    await suppliedDependencies.beforeTerminalAppend?.();
    await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
    if (preflight.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflight.runtimeId !== request.requestedRuntime || preflight.executorId !== request.requestedExecutor || !validExecutorObservations(execution.observations, request, configuration.sessionId)) throw new Error("preterminal_executor_binding_mismatch");
    const terminal = await appendLifecycle(request, claim.value.receipt, "dispatch.completed", timestamp, execution.observations, refs, dependencies);
    await suppliedDependencies.beforeFinalReadback?.();
    const terminalReadback = await readReceiptForFinalProof(request, terminal.receiptId, plan, "completed", dependencies);
    const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
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
    if (claimedReceipt === null || observation === null || card === null || configuration === null || plan === null || planFile === null || preflightIdentity === null) return invalid("PRECLAIM_VALIDATION_FAILED", message);
    try {
      const directory = await ensureEvidenceDirectory(request.repositoryRoot, request.missionId);
      const evidence = evidenceWithDigest(evidenceBody({ request, plan, packetId, packetDigest, receiptId: claimedReceipt.receiptId, card, observation, configuration, outcome: "failed", dispositionCode: "DISPATCH_FAILED", modelResult: null, observations: {}, errors: [message], artifacts: { transitionPlanPath: null, reviewArtifactPath: null } }));
      const evidencePath = await writeContentAddressedArtifact(directory, "dispatch-evidence", evidence.evidenceDigest, `${canonicalJson(evidence)}\n`);
      const timestamp = new Date(Math.max(Date.parse(request.timestamp.value) + 1, Date.now())).toISOString();
      await verifyLiveBinding(request, observation, planFile, card, suppliedDependencies.userCopilotHome);
      if (preflightIdentity.packageVersion !== COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION || preflightIdentity.runtimeId !== request.requestedRuntime || preflightIdentity.executorId !== request.requestedExecutor) throw new Error("preterminal_executor_binding_mismatch");
      const receipt = await appendLifecycle(request, claimedReceipt, "dispatch.failed", timestamp, null, [evidence.evidenceDigest], dependencies);
      const receiptReadback = await readReceiptForFinalProof(request, receipt.receiptId, plan, "failed", dependencies);
      const evidenceReadback = await parseEvidenceFile(request.repositoryRoot, evidencePath);
      if (evidenceReadback.evidenceDigest !== evidence.evidenceDigest || receiptReadback.outputEvidenceRefs === null || !receiptReadback.outputEvidenceRefs.includes(evidence.evidenceDigest)) throw new Error("failed_terminal_readback_mismatch");
      return deepFreeze({ contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION, authority: "none", missionId: request.missionId, state: "failed", code: "DISPATCH_FAILED", errors: [message], receiptId: receipt.receiptId, evidencePath, replayed: false, handoff: null });
    } catch (terminalError) {
      return deepFreeze({ contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION, authority: "none", missionId: request.missionId, state: "recovery_required", code: "RECOVERY_REQUIRED", errors: [message, terminalError instanceof Error ? terminalError.message : "Terminalization failed."], receiptId: claimedReceipt.receiptId, evidencePath: null, replayed: false, handoff: null });
    }
  } finally { await executor.close?.().catch(() => undefined); }
}
