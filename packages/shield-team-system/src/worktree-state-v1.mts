import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { isProxy } from "node:util/types";

import { parseShieldConfig, type ShieldConfig } from "./config.mjs";
import {
  validateTrustedBindingRegistry,
  type TrustedBindingRegistry,
  type TrustedHumanBinding,
} from "./mission-v2.mjs";

export const WORKTREE_STATE_SCHEMA_VERSION = 1 as const;
export const WORKTREE_STATE_CONTRACT_VERSION = "worktree.state.v1" as const;
export const WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION = "worktree.state.v2" as const;
export const WORKTREE_STATE_RELATIVE_PATH = ".shield/worktree-state.json" as const;
export const WORKTREE_STATE_RECEIPT_ARCHIVE_RELATIVE_PATH = ".shield/worktree-state-receipts" as const;
export const WORKTREE_STATE_INSTALLED_PATHS = Object.freeze([
  ".shield/.gitignore",
  ".shield/config.json",
  ".shield/trusted-human-bindings.json",
  WORKTREE_STATE_RELATIVE_PATH,
] as const);
export const WORKTREE_STATE_EXCLUSIONS = Object.freeze([
  "journals",
  "evidence",
  "signers",
  "passcodes",
  "caches",
  "authority",
  "mission_begin",
  "mission_authorization",
  "model_invocation",
  "git_publication",
  "merge",
  "deployment",
  "release",
  "cleanup",
] as const);

const CONFIG_PATH = ".shield/config.json" as const;
const REGISTRY_PATH = ".shield/trusted-human-bindings.json" as const;
const IGNORE_PATH = ".shield/.gitignore" as const;
const SHIELD_DIRECTORY = ".shield" as const;
const POLICY_SHIELD_FILES = Object.freeze([".gitignore", "config.json", "trusted-human-bindings.json", "worktree-state.json"] as const);
const LOCK_NAME = ".worktree-prepare.lock" as const;
const TEMP_PREFIX = ".worktree-prepare-" as const;
const REFRESH_TEMP_PREFIX = ".worktree-refresh-" as const;
const RECEIPT_ARCHIVE_NAME = "worktree-state-receipts" as const;
const REFRESH_PRESERVED_MISSION_DIRECTORIES = Object.freeze([".shield/audit", ".shield/runtime"] as const);
const REFRESH_PRESERVED_MISSION_FILES = Object.freeze([".shield/dispatch-receipts.jsonl"] as const);
const MAX_RECEIPT_PREDECESSORS = 256;
const MAX_POLICY_BYTES = 1024 * 1024;
const FILE_MODE = 0o644;
const DIRECTORY_FLAGS = constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0);
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const WRITE_EXCLUSIVE_FLAGS = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
const execFileAsync = promisify(execFile);

type PreparationState = "ready" | "already_prepared" | "blocked" | "recovery_required";

export type WorktreePreparationBlockedReasonV1 =
  | "invalid_request"
  | "root_invalid"
  | "roots_not_distinct"
  | "source_policy_unsafe"
  | "source_policy_malformed"
  | "source_policy_mismatch"
  | "source_policy_drift"
  | "repository_mismatch"
  | "destination_detached"
  | "destination_dirty"
  | "destination_conflict"
  | "preparation_in_progress"
  | "prepared_state_stale"
  | "operation_failed";

export type WorktreePreparationReasonV1 =
  | "prepared"
  | "already_prepared"
  | WorktreePreparationBlockedReasonV1
  | "filesystem_outcome_uncertain";

export interface WorktreePreparationRequestV1 {
  readonly sourceRoot: string;
  readonly destinationRoot: string;
}

export interface WorktreeGitObservationV1 {
  readonly root: string;
  readonly commonGitDirectory: string;
  readonly originRepositoryId: string;
  readonly branch: string | null;
  readonly head: string;
  readonly porcelainStatus: string;
}

export interface WorktreePublicBindingV1 {
  readonly bindingId: string;
  readonly seatId: string;
  readonly signingKeyRef: string;
}

export interface WorktreePolicySnapshotV1 {
  readonly configByteSha256: string;
  readonly registryByteSha256: string;
  readonly configSemanticSha256: string;
  readonly registrySemanticSha256: string;
}

export interface WorktreeInstalledByteDigestsV1 {
  readonly ".shield/.gitignore": string;
  readonly ".shield/config.json": string;
  readonly ".shield/trusted-human-bindings.json": string;
}

export interface WorktreeTrackedBaselineExclusionV1 {
  readonly path: string;
  readonly gitMode: "100644" | "100755";
  readonly headBlobOid: string;
  readonly indexBlobOid: string;
  readonly byteSha256: string;
}

export interface WorktreeStateReceiptBodyV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof WORKTREE_STATE_CONTRACT_VERSION;
  readonly authority: "none";
  readonly state: "ready";
  readonly reasonCode: "prepared";
  readonly summary: string;
  readonly repositoryId: string;
  readonly commonGitDirectory: string;
  readonly source: WorktreeGitObservationV1;
  readonly destination: WorktreeGitObservationV1;
  readonly policy: WorktreePolicySnapshotV1;
  readonly publicBindings: readonly WorktreePublicBindingV1[];
  readonly installedPaths: typeof WORKTREE_STATE_INSTALLED_PATHS;
  readonly installedByteDigests: WorktreeInstalledByteDigestsV1;
  readonly exclusions: typeof WORKTREE_STATE_EXCLUSIONS;
  readonly trackedBaselineExclusions?: readonly WorktreeTrackedBaselineExclusionV1[];
}

export interface WorktreeStateReceiptV1 extends WorktreeStateReceiptBodyV1 {
  readonly receiptDigest: string;
}

interface WorktreePreparationOutcomeBaseV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof WORKTREE_STATE_CONTRACT_VERSION;
  readonly authority: "none";
  readonly state: PreparationState;
  readonly reasonCode: WorktreePreparationReasonV1;
  readonly summary: string;
  readonly nextAction: string;
  readonly sourceRoot: string | null;
  readonly destinationRoot: string | null;
  readonly exclusions: typeof WORKTREE_STATE_EXCLUSIONS;
  readonly receiptDigest: string;
}

export interface WorktreePreparationReadyV1 extends WorktreePreparationOutcomeBaseV1 {
  readonly state: "ready";
  readonly reasonCode: "prepared";
  readonly receipt: WorktreeStateReceiptV1;
}

export interface WorktreePreparationAlreadyPreparedV1 extends WorktreePreparationOutcomeBaseV1 {
  readonly state: "already_prepared";
  readonly reasonCode: "already_prepared";
  readonly receipt: WorktreeStateReceiptV1;
}

export interface WorktreePreparationBlockedV1 extends WorktreePreparationOutcomeBaseV1 {
  readonly state: "blocked";
  readonly reasonCode: WorktreePreparationBlockedReasonV1;
  readonly receipt: null;
}

export interface WorktreePreparationRecoveryRequiredV1 extends WorktreePreparationOutcomeBaseV1 {
  readonly state: "recovery_required";
  readonly reasonCode: "filesystem_outcome_uncertain";
  readonly receipt: WorktreeStateReceiptV1 | null;
}

export type WorktreePreparationResultV1 =
  | WorktreePreparationReadyV1
  | WorktreePreparationAlreadyPreparedV1
  | WorktreePreparationBlockedV1
  | WorktreePreparationRecoveryRequiredV1;

export interface WorktreeStateSupersedesV2 {
  readonly contractVersion: typeof WORKTREE_STATE_CONTRACT_VERSION | typeof WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION;
  readonly receiptDigest: string;
  readonly destinationBranch: string;
  readonly destinationHead: string;
}

export interface WorktreeStateReceiptBodyV2 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION;
  readonly authority: "none";
  readonly state: "refreshed";
  readonly reasonCode: "prepared_state_refreshed";
  readonly summary: string;
  readonly repositoryId: string;
  readonly commonGitDirectory: string;
  readonly destination: WorktreeGitObservationV1;
  readonly policy: WorktreePolicySnapshotV1;
  readonly publicBindings: readonly WorktreePublicBindingV1[];
  readonly trackedBaselineExclusions: readonly WorktreeTrackedBaselineExclusionV1[];
  readonly installedPaths: typeof WORKTREE_STATE_INSTALLED_PATHS;
  readonly installedByteDigests: WorktreeInstalledByteDigestsV1;
  readonly exclusions: typeof WORKTREE_STATE_EXCLUSIONS;
  readonly supersedes: WorktreeStateSupersedesV2;
}

export interface WorktreeStateReceiptV2 extends WorktreeStateReceiptBodyV2 {
  readonly receiptDigest: string;
}

export type WorktreeStateReceiptV1OrV2 = WorktreeStateReceiptV1 | WorktreeStateReceiptV2;

export type WorktreePreparationBlockedReasonV2 =
  | WorktreePreparationBlockedReasonV1
  | "predecessor_not_ancestor"
  | "predecessor_branch_mismatch"
  | "receipt_chain_invalid"
  | "refresh_conflict";

export type WorktreePreparationReasonV2 =
  | "prepared_state_refreshed"
  | "already_refreshed"
  | WorktreePreparationBlockedReasonV2
  | "filesystem_outcome_uncertain";

interface WorktreePreparationOutcomeBaseV2 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION;
  readonly authority: "none";
  readonly state: "refreshed" | "already_refreshed" | "blocked" | "recovery_required";
  readonly reasonCode: WorktreePreparationReasonV2;
  readonly summary: string;
  readonly nextAction: string;
  readonly sourceRoot: string | null;
  readonly destinationRoot: string | null;
  readonly exclusions: typeof WORKTREE_STATE_EXCLUSIONS;
  readonly receipt: WorktreeStateReceiptV2 | null;
  readonly receiptDigest: string;
}

export interface WorktreePreparationRefreshedV2 extends WorktreePreparationOutcomeBaseV2 {
  readonly state: "refreshed";
  readonly reasonCode: "prepared_state_refreshed";
  readonly receipt: WorktreeStateReceiptV2;
}

export interface WorktreePreparationAlreadyRefreshedV2 extends WorktreePreparationOutcomeBaseV2 {
  readonly state: "already_refreshed";
  readonly reasonCode: "already_refreshed";
  readonly receipt: WorktreeStateReceiptV2;
}

export interface WorktreePreparationBlockedV2 extends WorktreePreparationOutcomeBaseV2 {
  readonly state: "blocked";
  readonly reasonCode: WorktreePreparationBlockedReasonV2;
  readonly receipt: null;
}

export interface WorktreePreparationRecoveryRequiredV2 extends WorktreePreparationOutcomeBaseV2 {
  readonly state: "recovery_required";
  readonly reasonCode: "filesystem_outcome_uncertain";
  readonly receipt: WorktreeStateReceiptV2 | null;
}

export type WorktreePreparationResultV2 =
  | WorktreePreparationRefreshedV2
  | WorktreePreparationAlreadyRefreshedV2
  | WorktreePreparationBlockedV2
  | WorktreePreparationRecoveryRequiredV2;

export type WorktreePreparationResultV1OrV2 = WorktreePreparationResultV1 | WorktreePreparationResultV2;

export type WorktreeStateDoctorClassificationV1 =
  | "uninitialized_worktree"
  | "manual_policy_present"
  | "prepared_worktree"
  | "stale_or_malformed_worktree_state";

export interface WorktreeStateDoctorResultV1 {
  readonly classification: WorktreeStateDoctorClassificationV1;
  readonly ok: boolean;
  readonly message: string;
  readonly receiptDigest: string | null;
}

export type WorktreePreparationTestPhaseV1 =
  | "source_captured"
  | "repositories_observed"
  | "before_destination_mutation"
  | "lock_acquired"
  | "temporaries_synced"
  | "before_install"
  | "after_install"
  | "before_replay_ready"
  | "before_ready";

export type WorktreePreparationFilesystemOperationV1 =
  | "after_lock_create"
  | "after_lock_file_sync"
  | "after_temporary_create"
  | "after_temporary_file_sync"
  | "before_cleanup_unlink"
  | "before_cleanup_directory_sync";

export interface WorktreePreparationFilesystemEventV1 {
  readonly operation: WorktreePreparationFilesystemOperationV1;
  readonly path: string;
}

export interface WorktreePreparationTestDependenciesV1 {
  readonly phase?: (phase: WorktreePreparationTestPhaseV1) => void | Promise<void>;
  readonly nonce?: () => string;
  readonly filesystem?: (event: WorktreePreparationFilesystemEventV1) => void | Promise<void>;
  readonly linkPath?: (source: string, destination: string) => Promise<void>;
  readonly unlinkPath?: (path: string) => Promise<void>;
  readonly syncDirectoryPath?: (path: string) => Promise<void>;
  readonly readInstalledPath?: (path: string) => Promise<Uint8Array>;
}

export type WorktreeRefreshFilesystemOperationV2 =
  | "archive_directory_create"
  | "archive_file_create"
  | "archive_file_sync"
  | "archive_readback"
  | "successor_file_create"
  | "successor_file_sync"
  | "active_receipt_replace"
  | "active_receipt_readback"
  | "directory_sync"
  | "lock_release";

export interface WorktreeRefreshFilesystemEventV2 {
  readonly operation: WorktreeRefreshFilesystemOperationV2;
  readonly path: string;
}

export interface WorktreeRefreshTestDependenciesV2 {
  readonly phase?: (phase: "before_refresh" | "lock_acquired" | "before_replace" | "before_success") => void | Promise<void>;
  readonly nonce?: () => string;
  readonly filesystem?: (event: WorktreeRefreshFilesystemEventV2) => void | Promise<void>;
  readonly renamePath?: (source: string, destination: string) => Promise<void>;
  readonly syncDirectoryPath?: (path: string) => Promise<void>;
  readonly readPath?: (path: string) => Promise<Uint8Array>;
  readonly unlinkPath?: (path: string) => Promise<void>;
}

interface CapturedFile {
  readonly path: string;
  readonly bytes: Buffer;
  readonly digest: string;
  readonly handle: FileHandle;
  readonly identity: FileIdentity;
}

interface SourceSnapshot {
  readonly configFile: CapturedFile;
  readonly registryFile: CapturedFile;
  readonly config: ShieldConfig;
  readonly registry: TrustedBindingRegistry;
  readonly policy: WorktreePolicySnapshotV1;
  readonly publicBindings: readonly WorktreePublicBindingV1[];
  readonly policyDirectory: HeldDirectory;
  readonly missionStatePolicy: MissionStatePolicy;
}

interface MissionStatePolicy {
  readonly journalRoot: string;
  readonly roots: readonly string[];
  readonly additionalRefreshRoots: readonly string[];
  readonly files: readonly string[];
  readonly ignoreBytes: Buffer;
}

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
}

interface HeldDirectory {
  readonly path: string;
  readonly handle: FileHandle;
  readonly identity: FileIdentity;
}

interface HeldRoot {
  readonly root: string;
  readonly directories: readonly HeldDirectory[];
}

interface TemporaryFile {
  readonly path: string;
  readonly bytes: Buffer;
  readonly handle: FileHandle;
  identity: FileIdentity | null;
  installed: boolean;
}

interface HeldLock {
  readonly path: string;
  readonly token: Buffer;
  readonly handle: FileHandle;
  identity: FileIdentity | null;
}

interface GitTrackedBaselineEntry {
  readonly path: string;
  readonly gitMode: "100644" | "100755";
  readonly headBlobOid: string;
  readonly indexBlobOid: string;
}

interface HeldTrackedBaselineFile {
  readonly record: WorktreeTrackedBaselineExclusionV1;
  readonly absolutePath: string;
  readonly bytes: Buffer;
  readonly handle: FileHandle;
  readonly identity: FileIdentity;
}

interface TrackedBaselineSnapshot {
  readonly journalRoot: string;
  readonly exclusions: readonly WorktreeTrackedBaselineExclusionV1[];
  readonly files: readonly HeldTrackedBaselineFile[];
  readonly directories: readonly HeldDirectory[];
}

interface HeldMissionState {
  readonly roots: readonly string[];
  readonly directories: readonly HeldDirectory[];
  readonly files: readonly CapturedFile[];
}

interface HeldActiveReceipt {
  readonly captured: CapturedFile;
  readonly receipt: WorktreeStateReceiptV1OrV2;
}

class Blocked extends Error {
  constructor(readonly reasonCode: WorktreePreparationBlockedReasonV1, message: string) {
    super(message);
  }
}

class RefreshBlocked extends Error {
  constructor(readonly reasonCode: WorktreePreparationBlockedReasonV2, message: string) {
    super(message);
  }
}

function plain(value: unknown): value is Record<string, unknown> {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
      !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!plain(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string")) return false;
  return fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor !== undefined && Object.hasOwn(descriptor, "value") && descriptor.enumerable &&
      descriptor.get === undefined && descriptor.set === undefined;
  }) && (keys as string[]).every((key) => fields.includes(key));
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Reflect.ownKeys(value).map((key) => (value as Record<PropertyKey, unknown>)[key])) {
    deepFreeze(nested, seen);
  }
  return Object.freeze(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON rejects non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!plain(value)) throw new Error("Canonical JSON requires plain data.");
  const keys = Object.keys(value).sort(compareBytes);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function digestOutcome(body: Omit<WorktreePreparationOutcomeBaseV1, "receiptDigest"> & { readonly receipt: WorktreeStateReceiptV1 | null }): string {
  return sha256(canonicalJson(body));
}

function blocked(
  reasonCode: WorktreePreparationBlockedReasonV1,
  summary: string,
  sourceRoot: string | null,
  destinationRoot: string | null,
): WorktreePreparationBlockedV1 {
  const body = {
    schemaVersion: WORKTREE_STATE_SCHEMA_VERSION,
    contractVersion: WORKTREE_STATE_CONTRACT_VERSION,
    authority: "none" as const,
    state: "blocked" as const,
    reasonCode,
    summary,
    nextAction: reasonCode === "preparation_in_progress"
      ? "Wait for the active preparation to finish, then retry the same closed request."
      : "Correct the reported state without copying mission or secret data, then retry.",
    sourceRoot,
    destinationRoot,
    exclusions: WORKTREE_STATE_EXCLUSIONS,
    receipt: null,
  };
  return deepFreeze({ ...body, receiptDigest: digestOutcome(body) });
}

function recovery(
  sourceRoot: string | null,
  destinationRoot: string | null,
  receipt: WorktreeStateReceiptV1 | null,
): WorktreePreparationRecoveryRequiredV1 {
  const body = {
    schemaVersion: WORKTREE_STATE_SCHEMA_VERSION,
    contractVersion: WORKTREE_STATE_CONTRACT_VERSION,
    authority: "none" as const,
    state: "recovery_required" as const,
    reasonCode: "filesystem_outcome_uncertain" as const,
    summary: "Worktree preparation reached an uncertain filesystem or durability outcome.",
    nextAction: "Stop automated retries and perform identity-safe operator recovery of the destination .shield directory.",
    sourceRoot,
    destinationRoot,
    exclusions: WORKTREE_STATE_EXCLUSIONS,
    receipt,
  };
  return deepFreeze({ ...body, receiptDigest: digestOutcome(body) });
}

function success(
  state: "ready" | "already_prepared",
  receipt: WorktreeStateReceiptV1,
): WorktreePreparationReadyV1 | WorktreePreparationAlreadyPreparedV1 {
  const reasonCode = state === "ready" ? "prepared" as const : "already_prepared" as const;
  const body = {
    schemaVersion: WORKTREE_STATE_SCHEMA_VERSION,
    contractVersion: WORKTREE_STATE_CONTRACT_VERSION,
    authority: "none" as const,
    state,
    reasonCode,
    summary: state === "ready"
      ? "Destination worktree policy was prepared without granting mission authority."
      : "Destination worktree already contains the exact prepared policy receipt.",
    nextAction: "Independently reobserve live mission and repository state before any mission transition.",
    sourceRoot: receipt.source.root,
    destinationRoot: receipt.destination.root,
    exclusions: WORKTREE_STATE_EXCLUSIONS,
    receipt,
  };
  return deepFreeze({ ...body, receiptDigest: digestOutcome(body) }) as WorktreePreparationReadyV1 | WorktreePreparationAlreadyPreparedV1;
}

function digestOutcomeV2(body: Omit<WorktreePreparationOutcomeBaseV2, "receiptDigest">): string {
  return sha256(canonicalJson(body));
}

function blockedV2(
  reasonCode: WorktreePreparationBlockedReasonV2,
  summary: string,
  sourceRoot: string | null,
  destinationRoot: string | null,
): WorktreePreparationBlockedV2 {
  const body = {
    schemaVersion: WORKTREE_STATE_SCHEMA_VERSION,
    contractVersion: WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION,
    authority: "none" as const,
    state: "blocked" as const,
    reasonCode,
    summary,
    nextAction: reasonCode === "preparation_in_progress"
      ? "Wait for the active preparation to finish, then retry the same closed request."
      : "Correct the reported state without copying or modifying mission data, then retry.",
    sourceRoot,
    destinationRoot,
    exclusions: WORKTREE_STATE_EXCLUSIONS,
    receipt: null,
  };
  return deepFreeze({ ...body, receiptDigest: digestOutcomeV2(body) });
}

function recoveryV2(
  sourceRoot: string | null,
  destinationRoot: string | null,
  receipt: WorktreeStateReceiptV2 | null,
): WorktreePreparationRecoveryRequiredV2 {
  const body = {
    schemaVersion: WORKTREE_STATE_SCHEMA_VERSION,
    contractVersion: WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION,
    authority: "none" as const,
    state: "recovery_required" as const,
    reasonCode: "filesystem_outcome_uncertain" as const,
    summary: "Worktree receipt refresh reached an uncertain filesystem or durability outcome.",
    nextAction: "Stop automated mutation and inspect the active receipt, archive, lock, and staging paths without deleting mission state.",
    sourceRoot,
    destinationRoot,
    exclusions: WORKTREE_STATE_EXCLUSIONS,
    receipt,
  };
  return deepFreeze({ ...body, receiptDigest: digestOutcomeV2(body) });
}

function refreshSuccess(
  state: "refreshed" | "already_refreshed",
  sourceRoot: string,
  receipt: WorktreeStateReceiptV2,
): WorktreePreparationRefreshedV2 | WorktreePreparationAlreadyRefreshedV2 {
  const body = {
    schemaVersion: WORKTREE_STATE_SCHEMA_VERSION,
    contractVersion: WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION,
    authority: "none" as const,
    state,
    reasonCode: state === "refreshed" ? "prepared_state_refreshed" as const : "already_refreshed" as const,
    summary: state === "refreshed"
      ? "Prepared-worktree receipt was refreshed after an exact same-branch fast-forward without granting authority."
      : "Destination already contains the exact refreshed prepared-worktree receipt chain.",
    nextAction: "Independently reobserve live mission and repository state before any mission transition.",
    sourceRoot,
    destinationRoot: receipt.destination.root,
    exclusions: WORKTREE_STATE_EXCLUSIONS,
    receipt,
  };
  return deepFreeze({ ...body, receiptDigest: digestOutcomeV2(body) }) as WorktreePreparationRefreshedV2 | WorktreePreparationAlreadyRefreshedV2;
}

function identity(stats: Awaited<ReturnType<FileHandle["stat"]>>): FileIdentity {
  return {
    dev: Number(stats.dev),
    ino: Number(stats.ino),
    mode: Number(stats.mode) & 0o7777,
    size: Number(stats.size),
    mtimeMs: Number(stats.mtimeMs),
    ctimeMs: Number(stats.ctimeMs),
  };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode &&
    left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

async function exactHandleBytes(handle: FileHandle, size: number): Promise<Buffer> {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const result = await handle.read(bytes, offset, size - offset, offset);
    if (result.bytesRead === 0) throw new Error("File read was incomplete.");
    offset += result.bytesRead;
  }
  return bytes;
}

async function captureRegularFile(path: string): Promise<CapturedFile> {
  let handle: FileHandle;
  try {
    handle = await open(path, READ_FLAGS);
  } catch {
    throw new Blocked("source_policy_unsafe", "Source policy files must be readable no-follow regular files.");
  }
  try {
    const beforeStats = await handle.stat();
    if (!beforeStats.isFile() || beforeStats.nlink !== 1 || beforeStats.size <= 0 || beforeStats.size > MAX_POLICY_BYTES) {
      throw new Blocked("source_policy_unsafe", "Source policy files must be bounded regular files.");
    }
    const before = identity(beforeStats);
    const bytes = await exactHandleBytes(handle, before.size);
    const after = identity(await handle.stat());
    const pathStats = await lstat(path);
    if (pathStats.isSymbolicLink() || !pathStats.isFile() || !sameIdentity(before, after) ||
      Number(pathStats.dev) !== before.dev || Number(pathStats.ino) !== before.ino) {
      throw new Blocked("source_policy_drift", "Source policy changed while it was being captured.");
    }
    return { path, bytes, digest: sha256(bytes), handle, identity: before };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function revalidateCapturedFile(captured: CapturedFile): Promise<boolean> {
  const current = identity(await captured.handle.stat());
  const pathStats = await lstat(captured.path);
  if (pathStats.isSymbolicLink() || !pathStats.isFile() || !sameIdentity(current, captured.identity) ||
    Number(pathStats.dev) !== captured.identity.dev || Number(pathStats.ino) !== captured.identity.ino) return false;
  return (await exactHandleBytes(captured.handle, captured.identity.size)).equals(captured.bytes);
}

function registryProjection(registry: TrustedBindingRegistry): readonly WorktreePublicBindingV1[] {
  return Object.freeze(registry.bindings
    .map(({ bindingId, seatId, signingKeyRef }) => Object.freeze({ bindingId, seatId, signingKeyRef }))
    .sort((left, right) => compareBytes(left.seatId, right.seatId) || compareBytes(left.bindingId, right.bindingId)));
}

function missionStatePolicy(config: ShieldConfig): MissionStatePolicy {
  const roots = Object.freeze([config.paths.journals, config.paths.reports, config.paths.temp]);
  const ignoreBytes = Buffer.from(roots.map((path) => `/${path.slice(`${SHIELD_DIRECTORY}/`.length)}/\n`).join(""), "utf8");
  return Object.freeze({
    journalRoot: config.paths.journals,
    roots,
    additionalRefreshRoots: Object.freeze([config.paths.artifacts]),
    files: Object.freeze([]),
    ignoreBytes,
  });
}

function refreshMissionStatePolicy(policy: MissionStatePolicy): MissionStatePolicy {
  return Object.freeze({
    journalRoot: policy.journalRoot,
    roots: Object.freeze([...new Set([
      ...policy.roots,
      ...policy.additionalRefreshRoots,
      ...REFRESH_PRESERVED_MISSION_DIRECTORIES,
    ])].sort(compareBytes)),
    additionalRefreshRoots: policy.additionalRefreshRoots,
    files: REFRESH_PRESERVED_MISSION_FILES,
    ignoreBytes: policy.ignoreBytes,
  });
}

function validatePolicyAgreement(config: ShieldConfig, registry: TrustedBindingRegistry): boolean {
  const bindingIds = new Set<string>();
  const keyRefs = new Set<string>();
  for (const binding of registry.bindings) {
    if (bindingIds.has(binding.bindingId) || keyRefs.has(binding.signingKeyRef)) return false;
    bindingIds.add(binding.bindingId);
    keyRefs.add(binding.signingKeyRef);
  }
  for (const reference of config.trustedHumanBindingRefs) {
    const matches = registry.bindings.filter((binding) =>
      binding.seatId === reference.seatId && binding.signingKeyRef === reference.bindingRef
    );
    if (matches.length !== 1) return false;
  }
  return registry.bindings.every((binding) => config.trustedHumanBindingRefs.some((reference) =>
    reference.seatId === binding.seatId && reference.bindingRef === binding.signingKeyRef
  ));
}

async function captureSourcePolicy(sourceRoot: string): Promise<SourceSnapshot> {
  let policyDirectory: HeldDirectory;
  try {
    policyDirectory = await holdDirectory(join(sourceRoot, SHIELD_DIRECTORY));
  } catch {
    throw new Blocked("source_policy_unsafe", "Source policy ancestors must be retained no-follow directories.");
  }
  let configFile: CapturedFile;
  try {
    configFile = await captureRegularFile(join(sourceRoot, CONFIG_PATH));
  } catch (error) {
    await policyDirectory.handle.close().catch(() => undefined);
    throw error;
  }
  let registryFile: CapturedFile | null = null;
  try {
    registryFile = await captureRegularFile(join(sourceRoot, REGISTRY_PATH));
    const parsedConfig = parseShieldConfig(configFile.bytes.toString("utf8"));
    let rawRegistry: unknown;
    try { rawRegistry = JSON.parse(registryFile.bytes.toString("utf8")) as unknown; }
    catch { throw new Blocked("source_policy_malformed", "Source trusted bindings contain malformed JSON."); }
    const parsedRegistry = validateTrustedBindingRegistry(rawRegistry);
    if (parsedConfig.state !== "valid" || parsedRegistry.state !== "valid") {
      throw new Blocked("source_policy_malformed", "Source configuration or trusted bindings are malformed or unsupported.");
    }
    if (!validatePolicyAgreement(parsedConfig.value, parsedRegistry.value)) {
      throw new Blocked("source_policy_mismatch", "Source configuration and trusted bindings do not agree exactly.");
    }
    const policy = Object.freeze({
      configByteSha256: configFile.digest,
      registryByteSha256: registryFile.digest,
      configSemanticSha256: sha256(canonicalJson(parsedConfig.value)),
      registrySemanticSha256: sha256(canonicalJson(parsedRegistry.value)),
    });
    return {
      configFile,
      registryFile,
      config: parsedConfig.value,
      registry: parsedRegistry.value,
      policy,
      publicBindings: registryProjection(parsedRegistry.value),
      policyDirectory,
      missionStatePolicy: missionStatePolicy(parsedConfig.value),
    };
  } catch (error) {
    await configFile.handle.close().catch(() => undefined);
    if (registryFile !== null) await registryFile.handle.close().catch(() => undefined);
    await policyDirectory.handle.close().catch(() => undefined);
    throw error;
  }
}

async function closeSnapshot(snapshot: SourceSnapshot | null): Promise<void> {
  if (snapshot === null) return;
  await Promise.all([
    snapshot.configFile.handle.close().catch(() => undefined),
    snapshot.registryFile.handle.close().catch(() => undefined),
    snapshot.policyDirectory.handle.close().catch(() => undefined),
  ]);
}

function gitEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    LANG: "C",
    LC_ALL: "C",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
  };
}

async function git(root: string, args: readonly string[], allowFailure = false): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["--no-replace-objects", ...args], {
      cwd: root,
      encoding: "utf8",
      env: gitEnvironment(),
      maxBuffer: 1024 * 1024,
    });
    return stdout.replace(/\r\n/gu, "\n").replace(/\n$/u, "");
  } catch {
    if (allowFailure) return null;
    throw new Blocked("root_invalid", "Both roots must be accessible registered Git worktrees.");
  }
}

async function gitBytes(root: string, args: readonly string[], maxBuffer = 1024 * 1024): Promise<Buffer> {
  try {
    const { stdout } = await execFileAsync("git", ["--no-replace-objects", ...args], {
      cwd: root,
      encoding: "buffer",
      env: gitEnvironment(),
      maxBuffer,
    });
    return Buffer.from(stdout);
  } catch {
    throw new Blocked("destination_conflict", "Destination tracked baseline could not be observed exactly.");
  }
}

function exactUtf8(bytes: Buffer): string | null {
  const value = bytes.toString("utf8");
  return Buffer.from(value, "utf8").equals(bytes) ? value : null;
}

function validBaselinePathSyntax(path: string): boolean {
  const components = path.split("/");
  return !path.includes("\\") && !path.includes("\0") && components.length >= 3 &&
    components[0] === SHIELD_DIRECTORY &&
    components.slice(1).every((component) => component.length > 0 && component !== "." && component !== "..");
}

function baselinePathWithinJournalRoot(path: string, journalRoot: string): boolean {
  return validBaselinePathSyntax(path) && path.startsWith(`${journalRoot}/`);
}

function validGitObjectId(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}

function parseHeadBaselineEntries(bytes: Buffer): readonly { path: string; gitMode: string; blobOid: string }[] {
  const entries: { path: string; gitMode: string; blobOid: string }[] = [];
  for (const raw of bytes.subarray(0, bytes.length - (bytes.at(-1) === 0 ? 1 : 0)).toString("binary").split("\0")) {
    if (raw.length === 0) continue;
    const record = Buffer.from(raw, "binary");
    const separator = record.indexOf(0x09);
    if (separator < 0) throw new Blocked("destination_conflict", "Destination HEAD baseline metadata is malformed.");
    const header = record.subarray(0, separator).toString("ascii");
    const match = /^(\d{6}) ([a-z]+) ((?:[0-9a-f]{40}|[0-9a-f]{64}))$/u.exec(header);
    const path = exactUtf8(record.subarray(separator + 1));
    if (match === null || path === null || match[2] !== "blob") {
      throw new Blocked("destination_conflict", "Destination HEAD baseline must contain only exact regular files.");
    }
    entries.push({ path, gitMode: match[1]!, blobOid: match[3]! });
  }
  return entries;
}

function parseIndexBaselineEntries(bytes: Buffer): readonly { path: string; gitMode: string; blobOid: string; stage: string }[] {
  const entries: { path: string; gitMode: string; blobOid: string; stage: string }[] = [];
  for (const raw of bytes.subarray(0, bytes.length - (bytes.at(-1) === 0 ? 1 : 0)).toString("binary").split("\0")) {
    if (raw.length === 0) continue;
    const record = Buffer.from(raw, "binary");
    const separator = record.indexOf(0x09);
    if (separator < 0) throw new Blocked("destination_conflict", "Destination index baseline metadata is malformed.");
    const header = record.subarray(0, separator).toString("ascii");
    const match = /^(\d{6}) ((?:[0-9a-f]{40}|[0-9a-f]{64})) ([0-3])$/u.exec(header);
    const path = exactUtf8(record.subarray(separator + 1));
    if (match === null || path === null) {
      throw new Blocked("destination_conflict", "Destination index baseline metadata is malformed.");
    }
    entries.push({ path, gitMode: match[1]!, blobOid: match[2]!, stage: match[3]! });
  }
  return entries;
}

async function observeTrackedBaselineEntries(
  destinationRoot: string,
  destinationHead: string,
  journalRoot: string,
): Promise<readonly GitTrackedBaselineEntry[]> {
  const [headBytes, indexBytes] = await Promise.all([
    gitBytes(destinationRoot, ["ls-tree", "-rz", "--full-tree", destinationHead, "--", SHIELD_DIRECTORY]),
    gitBytes(destinationRoot, ["ls-files", "--stage", "-z", "--", SHIELD_DIRECTORY]),
  ]);
  const head = [...parseHeadBaselineEntries(headBytes)].sort((left, right) => compareBytes(left.path, right.path));
  const index = [...parseIndexBaselineEntries(indexBytes)].sort((left, right) => compareBytes(left.path, right.path));
  if (head.length !== index.length || index.some((entry) => entry.stage !== "0")) {
    throw new Blocked("destination_conflict", "Destination HEAD and live index baseline sets do not agree exactly at stage zero.");
  }
  const result: GitTrackedBaselineEntry[] = [];
  for (let indexPosition = 0; indexPosition < head.length; indexPosition += 1) {
    const headEntry = head[indexPosition]!;
    const indexEntry = index[indexPosition]!;
    if (!baselinePathWithinJournalRoot(headEntry.path, journalRoot) || headEntry.path !== indexEntry.path ||
      (headEntry.gitMode !== "100644" && headEntry.gitMode !== "100755") ||
      headEntry.gitMode !== indexEntry.gitMode || headEntry.blobOid !== indexEntry.blobOid ||
      (indexPosition > 0 && head[indexPosition - 1]!.path === headEntry.path)) {
      throw new Blocked(
        "destination_conflict",
        `Only identical destination HEAD/index regular files beneath configured journal root ${journalRoot} may be tolerated; unconfigured default .shield/journals is rejected.`,
      );
    }
    result.push({
      path: headEntry.path,
      gitMode: headEntry.gitMode,
      headBlobOid: headEntry.blobOid,
      indexBlobOid: indexEntry.blobOid,
    });
  }
  return Object.freeze(result.map((entry) => Object.freeze(entry)));
}

function normalizedOriginRepositoryId(origin: string): string | null {
  const trimmed = origin.trim().replace(/[\\/]+$/u, "").replace(/\.git$/u, "");
  let path = trimmed;
  const scp = /^[^@\s]+@[^:\s]+:(.+)$/u.exec(trimmed);
  if (scp !== null) path = scp[1];
  else {
    try {
      const parsed = new URL(trimmed);
      path = parsed.pathname.replace(/^\/+|\/+$/gu, "");
    } catch {
      return null;
    }
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 2 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(segments[0] ?? "") ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(segments[1] ?? "")) return null;
  return `${segments[0]}/${segments[1]}`;
}

async function captureCanonicalRoot(root: string): Promise<HeldRoot> {
  if (!isAbsolute(root) || resolve(root) !== root) {
    throw new Blocked("root_invalid", "Worktree roots must be canonical absolute paths supplied explicitly by the host.");
  }
  const directories: HeldDirectory[] = [];
  try {
    const rootPrefix = parse(root).root;
    const segments = root.slice(rootPrefix.length).split(sep).filter(Boolean);
    let current = rootPrefix;
    directories.push(await holdDirectory(current));
    for (const segment of segments) {
      current = join(current, segment);
      directories.push(await holdDirectory(current));
    }
    const canonical = await realpath(root);
    if (canonical !== root || !await directoryChainStillHeld(directories)) {
      throw new Error("Root path contains an alias or changed directory component.");
    }
    return { root: canonical, directories };
  } catch {
    await closeDirectories(directories);
    throw new Blocked("root_invalid", "Worktree roots and every ancestor must be accessible canonical no-follow directories.");
  }
}

async function observeGitRoot(root: string): Promise<WorktreeGitObservationV1> {
  const top = await git(root, ["rev-parse", "--show-toplevel"]);
  if (top === null || await realpath(top).catch(() => "") !== root) {
    throw new Blocked("root_invalid", "Selected roots must be exact Git worktree top-level directories.");
  }
  const commonOutput = await git(root, ["rev-parse", "--git-common-dir"]);
  if (commonOutput === null) throw new Blocked("root_invalid", "Git common-directory observation failed.");
  const commonGitDirectory = await realpath(resolve(root, commonOutput)).catch(() => "");
  if (commonGitDirectory.length === 0) throw new Blocked("root_invalid", "Git common directory is inaccessible.");
  const origin = await git(root, ["remote", "get-url", "origin"]);
  const originRepositoryId = origin === null ? null : normalizedOriginRepositoryId(origin);
  if (originRepositoryId === null) throw new Blocked("repository_mismatch", "Origin repository identity is missing or unsupported.");
  const head = await git(root, ["rev-parse", "--verify", "HEAD"]);
  if (head === null || !/^[0-9a-f]{40,64}$/u.test(head)) throw new Blocked("root_invalid", "Git HEAD observation failed.");
  const branch = await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], true);
  const porcelainStatus = await git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (porcelainStatus === null) throw new Blocked("root_invalid", "Git status observation failed.");
  return Object.freeze({ root, commonGitDirectory, originRepositoryId, branch, head, porcelainStatus });
}

async function assertRegisteredWorktrees(source: WorktreeGitObservationV1, destination: WorktreeGitObservationV1): Promise<void> {
  const listing = await git(source.root, ["worktree", "list", "--porcelain"]);
  if (listing === null) throw new Blocked("repository_mismatch", "Registered worktree observation failed.");
  const registered = new Set<string>();
  for (const line of listing.split("\n")) {
    if (!line.startsWith("worktree ")) continue;
    const candidate = line.slice("worktree ".length);
    const canonical = await realpath(candidate).catch(() => null);
    if (canonical !== null) registered.add(canonical);
  }
  if (!registered.has(source.root) || !registered.has(destination.root)) {
    throw new Blocked("repository_mismatch", "Both roots must be distinct registered worktrees.");
  }
}

async function observeRepositories(sourceRoot: string, destinationRoot: string, repositoryId: string): Promise<{
  source: WorktreeGitObservationV1;
  destination: WorktreeGitObservationV1;
}> {
  const [source, destination] = await Promise.all([observeGitRoot(sourceRoot), observeGitRoot(destinationRoot)]);
  if (source.commonGitDirectory !== destination.commonGitDirectory ||
    source.originRepositoryId !== destination.originRepositoryId || source.originRepositoryId !== repositoryId) {
    throw new Blocked("repository_mismatch", "Roots, origin, and source policy must identify the same repository.");
  }
  await assertRegisteredWorktrees(source, destination);
  if (destination.branch === null) throw new Blocked("destination_detached", "Destination worktree must be attached to a branch.");
  if (destination.porcelainStatus !== "") throw new Blocked("destination_dirty", "Destination worktree must be clean before preparation.");
  return { source, destination };
}

async function holdDirectory(path: string): Promise<HeldDirectory> {
  const handle = await open(path, DIRECTORY_FLAGS);
  try {
    const stats = await handle.stat();
    const pathStats = await lstat(path);
    if (!stats.isDirectory() || pathStats.isSymbolicLink() || !pathStats.isDirectory() ||
      Number(pathStats.dev) !== Number(stats.dev) || Number(pathStats.ino) !== Number(stats.ino)) {
      throw new Error("Expected one retained no-follow directory identity.");
    }
    return { path, handle, identity: identity(stats) };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function directoryStillHeld(path: string, held: HeldDirectory): Promise<boolean> {
  try {
    if (path !== held.path) return false;
    const handleIdentity = identity(await held.handle.stat());
    const pathStats = await lstat(path);
    return !pathStats.isSymbolicLink() && pathStats.isDirectory() &&
      handleIdentity.dev === held.identity.dev && handleIdentity.ino === held.identity.ino &&
      Number(pathStats.dev) === held.identity.dev && Number(pathStats.ino) === held.identity.ino;
  } catch {
    return false;
  }
}

async function directoryChainStillHeld(directories: readonly HeldDirectory[]): Promise<boolean> {
  for (const directory of directories) {
    if (!await directoryStillHeld(directory.path, directory)) return false;
  }
  return true;
}

async function closeDirectories(directories: readonly HeldDirectory[]): Promise<boolean> {
  let closed = true;
  for (const directory of [...directories].reverse()) {
    try { await directory.handle.close(); } catch { closed = false; }
  }
  return closed;
}

async function captureTrackedBaselineFile(
  destinationRoot: string,
  entry: GitTrackedBaselineEntry,
): Promise<HeldTrackedBaselineFile> {
  const absolutePath = join(destinationRoot, entry.path);
  let handle: FileHandle;
  try { handle = await open(absolutePath, READ_FLAGS); }
  catch { throw new Blocked("destination_conflict", "Tracked baseline files must be readable no-follow regular files."); }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.nlink !== 1) {
      throw new Blocked("destination_conflict", "Tracked baseline files must be independent regular files.");
    }
    const capturedIdentity = identity(stats);
    const expectedMode = entry.gitMode === "100755" ? 0o755 : FILE_MODE;
    if (capturedIdentity.mode !== expectedMode) {
      throw new Blocked("destination_conflict", "Tracked baseline worktree mode does not equal the destination Git mode.");
    }
    const bytes = await exactHandleBytes(handle, capturedIdentity.size);
    const afterStats = await handle.stat();
    const after = identity(afterStats);
    const pathStats = await lstat(absolutePath);
    if (afterStats.nlink !== 1 || pathStats.nlink !== 1 || pathStats.isSymbolicLink() || !pathStats.isFile() ||
      !sameIdentity(capturedIdentity, after) ||
      Number(pathStats.dev) !== capturedIdentity.dev || Number(pathStats.ino) !== capturedIdentity.ino) {
      throw new Blocked("destination_conflict", "Tracked baseline file identity changed during capture.");
    }
    const blobBytes = await gitBytes(
      destinationRoot,
      ["cat-file", "blob", entry.headBlobOid],
      Math.max(1024, bytes.length + 1),
    );
    if (!blobBytes.equals(bytes)) {
      throw new Blocked("destination_conflict", "Tracked baseline worktree bytes do not equal the destination Git blob.");
    }
    const record = Object.freeze({ ...entry, byteSha256: sha256(bytes) });
    return { record, absolutePath, bytes, handle, identity: capturedIdentity };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

function trackedBaselineDirectoryPaths(entries: readonly GitTrackedBaselineEntry[]): readonly string[] {
  const paths = new Set<string>();
  for (const entry of entries) {
    let current = dirname(entry.path);
    while (current !== SHIELD_DIRECTORY) {
      paths.add(current);
      current = dirname(current);
    }
  }
  return [...paths].sort((left, right) => {
    const depth = left.split("/").length - right.split("/").length;
    return depth || compareBytes(left, right);
  });
}

async function closeTrackedBaseline(snapshot: TrackedBaselineSnapshot | null): Promise<void> {
  if (snapshot === null) return;
  await Promise.all(snapshot.files.map((file) => file.handle.close().catch(() => undefined)));
  await closeDirectories(snapshot.directories);
}

async function captureTrackedBaseline(
  destinationRoot: string,
  destinationHead: string,
  shieldHeld: HeldDirectory | null,
  journalRoot: string,
): Promise<TrackedBaselineSnapshot> {
  const entries = await observeTrackedBaselineEntries(destinationRoot, destinationHead, journalRoot);
  if (entries.length === 0) {
    return { journalRoot, exclusions: Object.freeze([]), files: Object.freeze([]), directories: Object.freeze([]) };
  }
  if (shieldHeld === null) {
    throw new Blocked("destination_conflict", "Destination tracked baseline paths are absent from the worktree.");
  }
  const directories: HeldDirectory[] = [];
  const files: HeldTrackedBaselineFile[] = [];
  try {
    for (const relative of trackedBaselineDirectoryPaths(entries)) {
      const held = await holdDirectory(join(destinationRoot, relative));
      if (!await missionStateDirectoryStillHeld(held)) {
        await held.handle.close().catch(() => undefined);
        throw new Blocked("destination_conflict", "Tracked mission-state ancestors must have a safe owner, mode, and identity.");
      }
      directories.push(held);
    }
    for (const entry of entries) files.push(await captureTrackedBaselineFile(destinationRoot, entry));
    const snapshot = {
      journalRoot,
      exclusions: Object.freeze(files.map((file) => file.record)),
      files: Object.freeze(files),
      directories: Object.freeze(directories),
    };
    if (!await trackedBaselineStillExact(snapshot, destinationRoot, destinationHead)) {
      throw new Blocked("destination_conflict", "Destination tracked baseline changed during preflight.");
    }
    return snapshot;
  } catch (error) {
    await Promise.all(files.map((file) => file.handle.close().catch(() => undefined)));
    await closeDirectories(directories);
    throw error instanceof Blocked
      ? error
      : new Blocked("destination_conflict", "Tracked baseline ancestors must be necessary real directories.");
  }
}

async function trackedBaselineStillExact(
  snapshot: TrackedBaselineSnapshot,
  destinationRoot: string,
  destinationHead: string,
): Promise<boolean> {
  try {
    for (const directory of snapshot.directories) {
      if (!await missionStateDirectoryStillHeld(directory)) return false;
    }
    for (const file of snapshot.files) {
      const handleStats = await file.handle.stat();
      const current = identity(handleStats);
      const pathStats = await lstat(file.absolutePath);
      if (handleStats.nlink === 1 && pathStats.nlink === 1 && !pathStats.isSymbolicLink() && pathStats.isFile() &&
        sameIdentity(current, file.identity) &&
        Number(pathStats.dev) === file.identity.dev && Number(pathStats.ino) === file.identity.ino &&
        (await exactHandleBytes(file.handle, file.identity.size)).equals(file.bytes)) continue;
      return false;
    }
    const currentEntries = await observeTrackedBaselineEntries(destinationRoot, destinationHead, snapshot.journalRoot);
    return canonicalJson(currentEntries) === canonicalJson(snapshot.exclusions.map((record) => ({
      path: record.path,
      gitMode: record.gitMode,
      headBlobOid: record.headBlobOid,
      indexBlobOid: record.indexBlobOid,
    })));
  } catch {
    return false;
  }
}

async function destinationLayoutExact(
  shieldHeld: HeldDirectory,
  baseline: TrackedBaselineSnapshot,
  allowedShieldFiles: readonly string[],
  missionState: HeldMissionState | null = null,
): Promise<boolean> {
  try {
    if (!await directoryStillHeld(shieldHeld.path, shieldHeld) || !await directoryChainStillHeld(baseline.directories) ||
      (missionState !== null && !await missionStateStillHeld(missionState))) return false;
    const expected = new Map<string, Set<string>>();
    const shieldRelative = SHIELD_DIRECTORY;
    expected.set(shieldRelative, new Set(allowedShieldFiles));
    const missionRoots = new Set(missionState?.roots ?? []);
    for (const root of missionRoots) {
      const components = root.split("/");
      for (let index = 1; index < components.length; index += 1) {
        const parent = components.slice(0, index).join("/");
        const child = components[index]!;
        expected.get(parent)?.add(child);
        if (index < components.length - 1 && !expected.has(`${parent}/${child}`)) {
          expected.set(`${parent}/${child}`, new Set());
        }
      }
    }
    for (const file of missionState?.files ?? []) {
      const relative = file.path.slice(dirname(shieldHeld.path).length + 1);
      const siblings = expected.get(dirname(relative));
      if (siblings === undefined) return false;
      siblings.add(basename(relative));
    }
    for (const directory of baseline.directories) {
      const relative = directory.path.slice(dirname(shieldHeld.path).length + 1);
      if (pathWithinMissionState(relative, missionRoots)) continue;
      if (!expected.has(relative)) expected.set(relative, new Set());
      const parent = dirname(relative);
      const siblings = expected.get(parent);
      if (siblings === undefined) return false;
      siblings.add(basename(relative));
    }
    for (const file of baseline.files) {
      if (pathWithinMissionState(file.record.path, missionRoots)) continue;
      const siblings = expected.get(dirname(file.record.path));
      if (siblings === undefined) return false;
      siblings.add(basename(file.record.path));
    }
    for (const [relative, names] of expected) {
      const actual = (await readdir(join(dirname(shieldHeld.path), relative))).sort(compareBytes);
      const wanted = [...names].sort(compareBytes);
      if (!exactArray(actual, wanted)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function pathWithinMissionState(path: string, roots: ReadonlySet<string>): boolean {
  return [...roots].some((root) => path === root || path.startsWith(`${root}/`));
}

function missionStateDirectorySafe(stats: Awaited<ReturnType<FileHandle["stat"]>>): boolean {
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  return stats.isDirectory() && (currentUid === null || Number(stats.uid) === currentUid) &&
    (Number(stats.mode) & 0o22) === 0;
}

async function missionStateDirectoryStillHeld(held: HeldDirectory): Promise<boolean> {
  try {
    const handleStats = await held.handle.stat();
    const pathStats = await lstat(held.path);
    return missionStateDirectorySafe(handleStats) && missionStateDirectorySafe(pathStats) && !pathStats.isSymbolicLink() &&
      (Number(handleStats.mode) & 0o7777) === held.identity.mode &&
      Number(handleStats.dev) === held.identity.dev && Number(handleStats.ino) === held.identity.ino &&
      Number(pathStats.dev) === held.identity.dev && Number(pathStats.ino) === held.identity.ino;
  } catch {
    return false;
  }
}

async function missionStateStillHeld(snapshot: HeldMissionState): Promise<boolean> {
  for (const directory of snapshot.directories) {
    if (!await missionStateDirectoryStillHeld(directory)) return false;
  }
  for (const file of snapshot.files) {
    if (!await revalidateCapturedFile(file)) return false;
  }
  return true;
}

async function closeMissionState(snapshot: HeldMissionState | null): Promise<void> {
  if (snapshot !== null) {
    await Promise.all(snapshot.files.map((file) => file.handle.close().catch(() => undefined)));
    await closeDirectories(snapshot.directories);
  }
}

async function captureMissionState(shieldHeld: HeldDirectory, policy: MissionStatePolicy): Promise<HeldMissionState> {
  const directories = new Map<string, HeldDirectory>();
  const files: CapturedFile[] = [];
  const roots: string[] = [];
  try {
    for (const root of policy.roots) {
      const absoluteRoot = join(dirname(shieldHeld.path), root);
      try {
        await lstat(absoluteRoot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      const components = root.split("/");
      for (let index = 2; index <= components.length; index += 1) {
        const relative = components.slice(0, index).join("/");
        if (directories.has(relative)) continue;
        const held = await holdDirectory(join(dirname(shieldHeld.path), relative));
        if (!await missionStateDirectoryStillHeld(held)) {
          await held.handle.close().catch(() => undefined);
          throw new Error("Mission-state directory owner, mode, or identity is unsafe.");
        }
        directories.set(relative, held);
      }
      roots.push(root);
    }
    for (const relative of policy.files) {
      const path = join(dirname(shieldHeld.path), relative);
      try {
        await lstat(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      files.push(await captureRegularFile(path));
    }
    const snapshot = {
      roots: Object.freeze(roots.sort(compareBytes)),
      directories: Object.freeze([...directories.entries()].sort(([left], [right]) => compareBytes(left, right)).map(([, held]) => held)),
      files: Object.freeze(files),
    };
    if (!await missionStateStillHeld(snapshot)) throw new Error("Mission-state directory identity changed during capture.");
    return snapshot;
  } catch (error) {
    await Promise.all(files.map((file) => file.handle.close().catch(() => undefined)));
    await closeDirectories([...directories.values()]);
    throw error;
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, DIRECTORY_FLAGS);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function pathExists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ENOENT" ? Promise.reject(error) : false; }
}

async function ensureShieldDirectory(
  destinationRoot: string,
  root: HeldDirectory,
  existing: HeldDirectory | null,
  onCreated: () => void,
): Promise<{ held: HeldDirectory; created: boolean }> {
  const shieldPath = join(destinationRoot, SHIELD_DIRECTORY);
  if (existing !== null) {
    if (!await directoryStillHeld(shieldPath, existing)) {
      throw new Blocked("destination_conflict", "Destination .shield identity changed before preparation.");
    }
    return { held: existing, created: false };
  }
  let created = false;
  try {
    const stats = await lstat(shieldPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Blocked("destination_conflict", "Destination .shield must be absent or a real directory.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(shieldPath, { mode: 0o700 });
    onCreated();
    await root.handle.sync();
    created = true;
  }
  return { held: await holdDirectory(shieldPath), created };
}

async function holdShieldDirectoryIfPresent(destinationRoot: string): Promise<HeldDirectory | null> {
  const shieldPath = join(destinationRoot, SHIELD_DIRECTORY);
  try {
    const stats = await lstat(shieldPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Blocked("destination_conflict", "Destination .shield must be absent or a real directory.");
    }
    return await holdDirectory(shieldPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function receiptBody(
  snapshot: SourceSnapshot,
  source: WorktreeGitObservationV1,
  destination: WorktreeGitObservationV1,
  trackedBaseline: TrackedBaselineSnapshot,
): WorktreeStateReceiptBodyV1 {
  const body: WorktreeStateReceiptBodyV1 = {
    schemaVersion: WORKTREE_STATE_SCHEMA_VERSION,
    contractVersion: WORKTREE_STATE_CONTRACT_VERSION,
    authority: "none",
    state: "ready",
    reasonCode: "prepared",
    summary: "Repository policy was materialized for this worktree; no mission or effect authority was granted.",
    repositoryId: snapshot.config.repositoryId,
    commonGitDirectory: source.commonGitDirectory,
    source,
    destination,
    policy: snapshot.policy,
    publicBindings: snapshot.publicBindings,
    installedPaths: WORKTREE_STATE_INSTALLED_PATHS,
    installedByteDigests: {
      [IGNORE_PATH]: sha256(snapshot.missionStatePolicy.ignoreBytes),
      [CONFIG_PATH]: snapshot.configFile.digest,
      [REGISTRY_PATH]: snapshot.registryFile.digest,
    },
    exclusions: WORKTREE_STATE_EXCLUSIONS,
  };
  return trackedBaseline.exclusions.length === 0
    ? body
    : { ...body, trackedBaselineExclusions: trackedBaseline.exclusions };
}

function buildReceipt(body: WorktreeStateReceiptBodyV1): WorktreeStateReceiptV1 {
  return deepFreeze({ ...body, receiptDigest: sha256(canonicalJson(body)) });
}

function buildSuccessorReceipt(
  snapshot: SourceSnapshot,
  destination: WorktreeGitObservationV1,
  trackedBaseline: TrackedBaselineSnapshot,
  predecessor: WorktreeStateReceiptV1OrV2,
): WorktreeStateReceiptV2 {
  if (destination.branch === null) throw new RefreshBlocked("destination_detached", "Destination worktree must be attached to a branch.");
  const body: WorktreeStateReceiptBodyV2 = {
    schemaVersion: WORKTREE_STATE_SCHEMA_VERSION,
    contractVersion: WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION,
    authority: "none",
    state: "refreshed",
    reasonCode: "prepared_state_refreshed",
    summary: "Prepared-worktree provenance was refreshed after an exact same-branch fast-forward; no authority was granted.",
    repositoryId: snapshot.config.repositoryId,
    commonGitDirectory: destination.commonGitDirectory,
    destination,
    policy: snapshot.policy,
    publicBindings: snapshot.publicBindings,
    trackedBaselineExclusions: trackedBaseline.exclusions,
    installedPaths: WORKTREE_STATE_INSTALLED_PATHS,
    installedByteDigests: {
      [IGNORE_PATH]: sha256(snapshot.missionStatePolicy.ignoreBytes),
      [CONFIG_PATH]: snapshot.configFile.digest,
      [REGISTRY_PATH]: snapshot.registryFile.digest,
    },
    exclusions: WORKTREE_STATE_EXCLUSIONS,
    supersedes: {
      contractVersion: predecessor.contractVersion,
      receiptDigest: predecessor.receiptDigest,
      destinationBranch: predecessor.destination.branch as string,
      destinationHead: predecessor.destination.head,
    },
  };
  return deepFreeze({ ...body, receiptDigest: sha256(canonicalJson(body)) });
}

function receiptBytes(receipt: WorktreeStateReceiptV1OrV2): Buffer {
  return Buffer.from(`${canonicalJson(receipt)}\n`, "utf8");
}

function exactArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}

export function validateWorktreeStateReceiptV1(input: unknown): input is WorktreeStateReceiptV1 {
  const fields: readonly string[] = [
    "schemaVersion", "contractVersion", "authority", "state", "reasonCode", "summary", "repositoryId",
    "commonGitDirectory", "source", "destination", "policy", "publicBindings", "installedPaths",
    "installedByteDigests", "exclusions", "receiptDigest",
  ];
  const hasTrackedBaseline = plain(input) && Object.hasOwn(input, "trackedBaselineExclusions");
  const exactFields = hasTrackedBaseline ? [...fields, "trackedBaselineExclusions"] : fields;
  if (!exact(input, exactFields)) return false;
  if (input.schemaVersion !== 1 || input.contractVersion !== WORKTREE_STATE_CONTRACT_VERSION || input.authority !== "none" ||
    input.state !== "ready" || input.reasonCode !== "prepared" || typeof input.summary !== "string" ||
    typeof input.repositoryId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(input.repositoryId) ||
    typeof input.commonGitDirectory !== "string" || !isAbsolute(input.commonGitDirectory) ||
    typeof input.receiptDigest !== "string" || !/^[0-9a-f]{64}$/u.test(input.receiptDigest)) return false;
  const observationFields = ["root", "commonGitDirectory", "originRepositoryId", "branch", "head", "porcelainStatus"] as const;
  for (const observation of [input.source, input.destination]) {
    if (!exact(observation, observationFields) || typeof observation.root !== "string" || !isAbsolute(observation.root) ||
      typeof observation.commonGitDirectory !== "string" || !isAbsolute(observation.commonGitDirectory) || typeof observation.originRepositoryId !== "string" ||
      (observation.branch !== null && typeof observation.branch !== "string") ||
      typeof observation.head !== "string" || !/^[0-9a-f]{40,64}$/u.test(observation.head) ||
      typeof observation.porcelainStatus !== "string") return false;
  }
  const source = input.source as unknown as WorktreeGitObservationV1;
  const destination = input.destination as unknown as WorktreeGitObservationV1;
  if (source.root === destination.root || source.commonGitDirectory !== input.commonGitDirectory ||
    destination.commonGitDirectory !== input.commonGitDirectory || source.originRepositoryId !== input.repositoryId ||
    destination.originRepositoryId !== input.repositoryId || destination.branch === null || destination.porcelainStatus !== "") return false;
  const policyFields = ["configByteSha256", "registryByteSha256", "configSemanticSha256", "registrySemanticSha256"] as const;
  if (!exact(input.policy, policyFields) || Object.values(input.policy).some((value) => typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value))) return false;
  if (!Array.isArray(input.publicBindings) || input.publicBindings.length === 0 || input.publicBindings.some((binding) =>
    !exact(binding, ["bindingId", "seatId", "signingKeyRef"]) || Object.values(binding).some((value) => typeof value !== "string")
  )) return false;
  if (!exactArray(input.installedPaths, WORKTREE_STATE_INSTALLED_PATHS) || !exactArray(input.exclusions, WORKTREE_STATE_EXCLUSIONS)) return false;
  if (!exact(input.installedByteDigests, [IGNORE_PATH, CONFIG_PATH, REGISTRY_PATH]) ||
    Object.values(input.installedByteDigests).some((value) => typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value))) return false;
  if (hasTrackedBaseline) {
    if (!Array.isArray(input.trackedBaselineExclusions) || input.trackedBaselineExclusions.length === 0) return false;
    let previousPath: string | null = null;
    for (const record of input.trackedBaselineExclusions) {
      if (!exact(record, ["path", "gitMode", "headBlobOid", "indexBlobOid", "byteSha256"]) ||
        typeof record.path !== "string" || !validBaselinePathSyntax(record.path) ||
        (record.gitMode !== "100644" && record.gitMode !== "100755") ||
        typeof record.headBlobOid !== "string" || !validGitObjectId(record.headBlobOid) ||
        typeof record.indexBlobOid !== "string" || record.indexBlobOid !== record.headBlobOid ||
        typeof record.byteSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(record.byteSha256) ||
        (previousPath !== null && compareBytes(previousPath, record.path) >= 0)) return false;
      previousPath = record.path;
    }
  }
  const { receiptDigest, ...body } = input;
  return receiptDigest === sha256(canonicalJson(body));
}

function validTrackedBaselineRecords(value: unknown, allowEmpty: boolean): value is readonly WorktreeTrackedBaselineExclusionV1[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return false;
  let previousPath: string | null = null;
  for (const record of value) {
    if (!exact(record, ["path", "gitMode", "headBlobOid", "indexBlobOid", "byteSha256"]) ||
      typeof record.path !== "string" || !validBaselinePathSyntax(record.path) ||
      (record.gitMode !== "100644" && record.gitMode !== "100755") ||
      typeof record.headBlobOid !== "string" || !validGitObjectId(record.headBlobOid) ||
      typeof record.indexBlobOid !== "string" || record.indexBlobOid !== record.headBlobOid ||
      typeof record.byteSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(record.byteSha256) ||
      (previousPath !== null && compareBytes(previousPath, record.path) >= 0)) return false;
    previousPath = record.path;
  }
  return true;
}

export function validateWorktreeStateReceiptV2(input: unknown): input is WorktreeStateReceiptV2 {
  const fields = [
    "schemaVersion", "contractVersion", "authority", "state", "reasonCode", "summary", "repositoryId",
    "commonGitDirectory", "destination", "policy", "publicBindings", "trackedBaselineExclusions", "installedPaths",
    "installedByteDigests", "exclusions", "supersedes", "receiptDigest",
  ] as const;
  if (!exact(input, fields) || input.schemaVersion !== WORKTREE_STATE_SCHEMA_VERSION ||
    input.contractVersion !== WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION || input.authority !== "none" ||
    input.state !== "refreshed" || input.reasonCode !== "prepared_state_refreshed" || typeof input.summary !== "string" ||
    typeof input.repositoryId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(input.repositoryId) ||
    typeof input.commonGitDirectory !== "string" || !isAbsolute(input.commonGitDirectory) ||
    typeof input.receiptDigest !== "string" || !/^[0-9a-f]{64}$/u.test(input.receiptDigest)) return false;
  const observationFields = ["root", "commonGitDirectory", "originRepositoryId", "branch", "head", "porcelainStatus"] as const;
  if (!exact(input.destination, observationFields) || typeof input.destination.root !== "string" || !isAbsolute(input.destination.root) ||
    typeof input.destination.commonGitDirectory !== "string" || !isAbsolute(input.destination.commonGitDirectory) ||
    typeof input.destination.originRepositoryId !== "string" || typeof input.destination.branch !== "string" || input.destination.branch.length === 0 ||
    typeof input.destination.head !== "string" || !/^[0-9a-f]{40,64}$/u.test(input.destination.head) ||
    input.destination.porcelainStatus !== "" || input.destination.commonGitDirectory !== input.commonGitDirectory ||
    input.destination.originRepositoryId !== input.repositoryId) return false;
  const policyFields = ["configByteSha256", "registryByteSha256", "configSemanticSha256", "registrySemanticSha256"] as const;
  if (!exact(input.policy, policyFields) || Object.values(input.policy).some((value) => typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value))) return false;
  if (!Array.isArray(input.publicBindings) || input.publicBindings.length === 0 || input.publicBindings.some((binding) =>
    !exact(binding, ["bindingId", "seatId", "signingKeyRef"]) || Object.values(binding).some((value) => typeof value !== "string")
  )) return false;
  if (!validTrackedBaselineRecords(input.trackedBaselineExclusions, true) ||
    !exactArray(input.installedPaths, WORKTREE_STATE_INSTALLED_PATHS) || !exactArray(input.exclusions, WORKTREE_STATE_EXCLUSIONS)) return false;
  if (!exact(input.installedByteDigests, [IGNORE_PATH, CONFIG_PATH, REGISTRY_PATH]) ||
    Object.values(input.installedByteDigests).some((value) => typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value))) return false;
  if (!exact(input.supersedes, ["contractVersion", "receiptDigest", "destinationBranch", "destinationHead"]) ||
    (input.supersedes.contractVersion !== WORKTREE_STATE_CONTRACT_VERSION && input.supersedes.contractVersion !== WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION) ||
    typeof input.supersedes.receiptDigest !== "string" || !/^[0-9a-f]{64}$/u.test(input.supersedes.receiptDigest) ||
    typeof input.supersedes.destinationBranch !== "string" || input.supersedes.destinationBranch.length === 0 ||
    typeof input.supersedes.destinationHead !== "string" || !/^[0-9a-f]{40,64}$/u.test(input.supersedes.destinationHead) ||
    input.supersedes.receiptDigest === input.receiptDigest || input.supersedes.destinationBranch !== input.destination.branch ||
    input.supersedes.destinationHead === input.destination.head) return false;
  const { receiptDigest, ...body } = input;
  return receiptDigest === sha256(canonicalJson(body));
}

export function validateWorktreeStateReceiptV1OrV2(input: unknown): input is WorktreeStateReceiptV1OrV2 {
  return validateWorktreeStateReceiptV1(input) || validateWorktreeStateReceiptV2(input);
}

async function readNoFollowRegular(path: string, expectedMode = FILE_MODE): Promise<Buffer> {
  const handle = await open(path, READ_FLAGS);
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.nlink !== 1 || (Number(stats.mode) & 0o7777) !== expectedMode || stats.size > MAX_POLICY_BYTES * 2) {
      throw new Error("Unsafe installed file.");
    }
    const before = identity(stats);
    const bytes = await exactHandleBytes(handle, before.size);
    const after = identity(await handle.stat());
    const pathStats = await lstat(path);
    if (pathStats.isSymbolicLink() || !pathStats.isFile() || !sameIdentity(before, after) ||
      Number(pathStats.dev) !== before.dev || Number(pathStats.ino) !== before.ino) throw new Error("Installed file drifted.");
    return bytes;
  } finally {
    await handle.close();
  }
}

async function readStoredReceipt(destinationRoot: string): Promise<WorktreeStateReceiptV1 | null> {
  const path = join(destinationRoot, WORKTREE_STATE_RELATIVE_PATH);
  if (!await pathExists(path)) return null;
  const bytes = await readNoFollowRegular(path);
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")) as unknown; }
  catch { return null; }
  return validateWorktreeStateReceiptV1(parsed) && bytes.equals(receiptBytes(parsed)) ? deepFreeze(parsed) : null;
}

async function readStoredReceiptV1OrV2(destinationRoot: string): Promise<WorktreeStateReceiptV1OrV2 | null> {
  const path = join(destinationRoot, WORKTREE_STATE_RELATIVE_PATH);
  if (!await pathExists(path)) return null;
  const bytes = await readNoFollowRegular(path);
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")) as unknown; }
  catch { return null; }
  return validateWorktreeStateReceiptV1OrV2(parsed) && bytes.equals(receiptBytes(parsed)) ? deepFreeze(parsed) : null;
}

async function holdActiveReceipt(destinationRoot: string): Promise<HeldActiveReceipt | null> {
  const path = join(destinationRoot, WORKTREE_STATE_RELATIVE_PATH);
  if (!await pathExists(path)) return null;
  let captured: CapturedFile;
  try { captured = await captureRegularFile(path); }
  catch { return null; }
  let parsed: unknown;
  try { parsed = JSON.parse(captured.bytes.toString("utf8")) as unknown; }
  catch {
    await captured.handle.close().catch(() => undefined);
    return null;
  }
  if (captured.identity.mode !== FILE_MODE || !validateWorktreeStateReceiptV1OrV2(parsed) ||
    !captured.bytes.equals(receiptBytes(parsed))) {
    await captured.handle.close().catch(() => undefined);
    return null;
  }
  return { captured, receipt: deepFreeze(parsed) };
}

type ReceiptChainInspection = Readonly<{
  status: "valid" | "missing_archive" | "invalid";
  stagedActiveArchive: boolean;
  archivedDigests: readonly string[];
  predecessorCount: number;
}>;

function chainInspection(
  status: ReceiptChainInspection["status"],
  stagedActiveArchive: boolean,
  archivedDigests: readonly string[],
  predecessorCount = 0,
): ReceiptChainInspection {
  return { status, stagedActiveArchive, archivedDigests, predecessorCount };
}

function sameReceiptPolicy(left: WorktreeStateReceiptV1OrV2, right: WorktreeStateReceiptV1OrV2): boolean {
  return left.repositoryId === right.repositoryId && left.commonGitDirectory === right.commonGitDirectory &&
    left.destination.root === right.destination.root && left.destination.branch === right.destination.branch &&
    canonicalJson(left.policy) === canonicalJson(right.policy) && canonicalJson(left.publicBindings) === canonicalJson(right.publicBindings) &&
    canonicalJson(left.installedPaths) === canonicalJson(right.installedPaths) &&
    canonicalJson(left.installedByteDigests) === canonicalJson(right.installedByteDigests) &&
    canonicalJson(left.exclusions) === canonicalJson(right.exclusions);
}

async function readArchivedReceipt(path: string): Promise<WorktreeStateReceiptV1OrV2 | null> {
  try {
    const bytes = await readNoFollowRegular(path);
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString("utf8")) as unknown; } catch { return null; }
    return validateWorktreeStateReceiptV1OrV2(parsed) && bytes.equals(receiptBytes(parsed)) ? deepFreeze(parsed) : null;
  } catch {
    return null;
  }
}

async function receiptBaselineMatchesRecordedHead(
  destinationRoot: string,
  receipt: WorktreeStateReceiptV1OrV2,
  journalRoot: string,
): Promise<boolean> {
  try {
    const bytes = await gitBytes(destinationRoot, ["ls-tree", "-rz", "--full-tree", receipt.destination.head, "--", SHIELD_DIRECTORY]);
    const head = [...parseHeadBaselineEntries(bytes)].sort((left, right) => compareBytes(left.path, right.path));
    const records = receipt.trackedBaselineExclusions ?? [];
    if (head.length !== records.length) return false;
    for (let index = 0; index < head.length; index += 1) {
      const entry = head[index]!;
      const record = records[index]!;
      if (!baselinePathWithinJournalRoot(entry.path, journalRoot) || entry.path !== record.path ||
        entry.gitMode !== record.gitMode || entry.blobOid !== record.headBlobOid ||
        record.indexBlobOid !== record.headBlobOid ||
        sha256(await gitBytes(destinationRoot, ["cat-file", "blob", entry.blobOid])) !== record.byteSha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function inspectReceiptChain(
  destinationRoot: string,
  active: WorktreeStateReceiptV1OrV2,
  allowStagedActiveArchive: boolean,
): Promise<ReceiptChainInspection> {
  const archivePath = join(destinationRoot, WORKTREE_STATE_RECEIPT_ARCHIVE_RELATIVE_PATH);
  let archiveNames: string[] = [];
  let archivePresent = false;
  try {
    const stats = await lstat(archivePath);
    if (stats.isSymbolicLink() || !missionStateDirectorySafe(stats)) {
      return chainInspection("invalid", false, []);
    }
    archivePresent = true;
    archiveNames = (await readdir(archivePath)).sort(compareBytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return chainInspection("invalid", false, []);
  }
  if (archiveNames.some((name) => !/^[0-9a-f]{64}\.json$/u.test(name)) || archiveNames.length > MAX_RECEIPT_PREDECESSORS + 1) {
    return chainInspection("invalid", false, []);
  }
  if (!allowStagedActiveArchive && archivePresent && archiveNames.length === 0 && validateWorktreeStateReceiptV1(active)) {
    return chainInspection("invalid", false, []);
  }
  const installedPolicy = await readInstalledMissionStatePolicy(destinationRoot, active);
  if (installedPolicy === null || !await receiptBaselineMatchesRecordedHead(destinationRoot, active, installedPolicy.journalRoot)) {
    return chainInspection("invalid", false, []);
  }
  const expected = new Set<string>();
  const seen = new Set<string>([active.receiptDigest]);
  let current = active;
  let predecessors = 0;
  while (validateWorktreeStateReceiptV2(current)) {
    predecessors += 1;
    if (predecessors > MAX_RECEIPT_PREDECESSORS) return chainInspection("invalid", false, [], predecessors);
    const digest = current.supersedes.receiptDigest;
    if (seen.has(digest)) return chainInspection("invalid", false, [], predecessors);
    seen.add(digest);
    expected.add(`${digest}.json`);
    if (!archivePresent || !archiveNames.includes(`${digest}.json`)) {
      return chainInspection("missing_archive", false, [...expected].sort(compareBytes), predecessors);
    }
    const predecessor = await readArchivedReceipt(join(archivePath, `${digest}.json`));
    if (predecessor === null || predecessor.receiptDigest !== digest || predecessor.contractVersion !== current.supersedes.contractVersion ||
      predecessor.destination.branch !== current.supersedes.destinationBranch || predecessor.destination.head !== current.supersedes.destinationHead ||
      predecessor.destination.head === current.destination.head || !sameReceiptPolicy(current, predecessor) ||
      !await predecessorIsAncestor(destinationRoot, predecessor.destination.head, current.destination.head).catch(() => false) ||
      !await receiptBaselineMatchesRecordedHead(destinationRoot, predecessor, installedPolicy.journalRoot)) {
      return chainInspection("invalid", false, [...expected].sort(compareBytes), predecessors);
    }
    current = predecessor;
  }
  if (!validateWorktreeStateReceiptV1(current)) return chainInspection("invalid", false, [], predecessors);
  const activeArchiveName = `${active.receiptDigest}.json`;
  let stagedActiveArchive = false;
  if (allowStagedActiveArchive && archiveNames.includes(activeArchiveName) && !expected.has(activeArchiveName)) {
    const archivedActive = await readArchivedReceipt(join(archivePath, activeArchiveName));
    if (archivedActive === null || canonicalJson(archivedActive) !== canonicalJson(active)) {
      return chainInspection("invalid", false, [...expected].sort(compareBytes), predecessors);
    }
    stagedActiveArchive = true;
    expected.add(activeArchiveName);
  }
  const actual = new Set(archiveNames);
  if (actual.size !== expected.size || [...actual].some((name) => !expected.has(name))) {
    return chainInspection("invalid", false, [...expected].sort(compareBytes), predecessors);
  }
  return chainInspection("valid", stagedActiveArchive, [...expected].sort(compareBytes), predecessors);
}

export async function validateWorktreeStateReceiptFileChainV1OrV2(
  destinationRoot: string,
  receipt: unknown,
): Promise<boolean> {
  if (!validateWorktreeStateReceiptV1OrV2(receipt) || receipt.destination.root !== destinationRoot) return false;
  try {
    const activeBytes = await readNoFollowRegular(join(destinationRoot, WORKTREE_STATE_RELATIVE_PATH));
    if (!activeBytes.equals(receiptBytes(receipt))) return false;
    return (await inspectReceiptChain(destinationRoot, receipt, false)).status === "valid";
  } catch {
    return false;
  }
}

export const validateWorktreeStateReceiptChainV1OrV2 = validateWorktreeStateReceiptFileChainV1OrV2;

async function readInstalledMissionStatePolicy(
  destinationRoot: string,
  receipt: WorktreeStateReceiptV1OrV2,
): Promise<MissionStatePolicy | null> {
  try {
    const [configBytes, ignoreBytes] = await Promise.all([
      readNoFollowRegular(join(destinationRoot, CONFIG_PATH)),
      readNoFollowRegular(join(destinationRoot, IGNORE_PATH)),
    ]);
    const config = parseShieldConfig(configBytes.toString("utf8"));
    if (config.state !== "valid" || sha256(configBytes) !== receipt.installedByteDigests[CONFIG_PATH] ||
      receipt.policy.configByteSha256 !== sha256(configBytes)) return null;
    const policy = missionStatePolicy(config.value);
    return ignoreBytes.equals(policy.ignoreBytes) && sha256(ignoreBytes) === receipt.installedByteDigests[IGNORE_PATH]
      ? policy
      : null;
  } catch {
    return null;
  }
}

async function validateInstalledReceipt(
  destinationRoot: string,
  receipt: WorktreeStateReceiptV1OrV2,
  expectedSnapshot?: SourceSnapshot,
  expectedDestination?: WorktreeGitObservationV1,
  trackedBaseline?: TrackedBaselineSnapshot,
): Promise<boolean> {
  if (receipt.destination.root !== destinationRoot || receipt.commonGitDirectory !== receipt.destination.commonGitDirectory ||
    receipt.repositoryId !== receipt.destination.originRepositoryId) return false;
  if (expectedSnapshot !== undefined && (receipt.policy.configByteSha256 !== expectedSnapshot.configFile.digest ||
    receipt.policy.registryByteSha256 !== expectedSnapshot.registryFile.digest ||
    receipt.policy.configSemanticSha256 !== expectedSnapshot.policy.configSemanticSha256 ||
    receipt.policy.registrySemanticSha256 !== expectedSnapshot.policy.registrySemanticSha256)) return false;
  if (expectedDestination !== undefined && (receipt.commonGitDirectory !== expectedDestination.commonGitDirectory ||
    receipt.repositoryId !== expectedDestination.originRepositoryId || receipt.destination.root !== expectedDestination.root ||
    receipt.destination.branch !== expectedDestination.branch || receipt.destination.head !== expectedDestination.head)) return false;
  if (trackedBaseline !== undefined && canonicalJson(receipt.trackedBaselineExclusions ?? []) !== canonicalJson(trackedBaseline.exclusions)) return false;
  try {
    const [ignoreBytes, configBytes, registryBytes] = await Promise.all([
      readNoFollowRegular(join(destinationRoot, IGNORE_PATH)),
      readNoFollowRegular(join(destinationRoot, CONFIG_PATH)),
      readNoFollowRegular(join(destinationRoot, REGISTRY_PATH)),
    ]);
    const config = parseShieldConfig(configBytes.toString("utf8"));
    let registryJson: unknown;
    try { registryJson = JSON.parse(registryBytes.toString("utf8")) as unknown; }
    catch { return false; }
    const registry = validateTrustedBindingRegistry(registryJson);
    if (config.state !== "valid" || registry.state !== "valid" || !validatePolicyAgreement(config.value, registry.value)) return false;
    const installedMissionStatePolicy = missionStatePolicy(config.value);
    if ((receipt.trackedBaselineExclusions ?? []).some(({ path }) =>
      !baselinePathWithinJournalRoot(path, installedMissionStatePolicy.journalRoot)) ||
      (trackedBaseline !== undefined && trackedBaseline.journalRoot !== installedMissionStatePolicy.journalRoot)) return false;
    return config.value.repositoryId === receipt.repositoryId &&
      canonicalJson(registryProjection(registry.value)) === canonicalJson(receipt.publicBindings) &&
      sha256(canonicalJson(config.value)) === receipt.policy.configSemanticSha256 &&
      sha256(canonicalJson(registry.value)) === receipt.policy.registrySemanticSha256 &&
      ignoreBytes.equals(installedMissionStatePolicy.ignoreBytes) &&
      sha256(ignoreBytes) === receipt.installedByteDigests[IGNORE_PATH] &&
      sha256(configBytes) === receipt.installedByteDigests[CONFIG_PATH] &&
      sha256(registryBytes) === receipt.installedByteDigests[REGISTRY_PATH] &&
      receipt.policy.configByteSha256 === sha256(configBytes) && receipt.policy.registryByteSha256 === sha256(registryBytes);
  } catch {
    return false;
  }
}

async function filesystemEvent(
  dependencies: WorktreePreparationTestDependenciesV1,
  operation: WorktreePreparationFilesystemOperationV1,
  path: string,
): Promise<void> {
  await dependencies.filesystem?.(Object.freeze({ operation, path }));
}

async function linkPath(
  dependencies: WorktreePreparationTestDependenciesV1,
  source: string,
  destination: string,
): Promise<void> {
  await (dependencies.linkPath ?? link)(source, destination);
}

async function unlinkPath(dependencies: WorktreePreparationTestDependenciesV1, path: string): Promise<void> {
  await (dependencies.unlinkPath ?? unlink)(path);
}

async function syncDirectoryPath(dependencies: WorktreePreparationTestDependenciesV1, path: string): Promise<void> {
  await (dependencies.syncDirectoryPath ?? syncDirectory)(path);
}

async function readInstalledPath(dependencies: WorktreePreparationTestDependenciesV1, path: string): Promise<Buffer> {
  const bytes = await (dependencies.readInstalledPath ?? readNoFollowRegular)(path);
  return Buffer.from(bytes);
}

async function acquireLock(
  shieldPath: string,
  token: Buffer,
  dependencies: WorktreePreparationTestDependenciesV1,
  retain: (lock: HeldLock) => void,
): Promise<HeldLock> {
  const path = join(shieldPath, LOCK_NAME);
  let handle: FileHandle;
  try { handle = await open(path, WRITE_EXCLUSIVE_FLAGS, 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Blocked("preparation_in_progress", "Destination preparation lock is already held.");
    }
    throw error;
  }
  const lock: HeldLock = { path, token, handle, identity: null };
  retain(lock);
  await filesystemEvent(dependencies, "after_lock_create", path);
  await handle.chmod(0o600);
  await handle.writeFile(token);
  await handle.sync();
  await filesystemEvent(dependencies, "after_lock_file_sync", path);
  const stats = await handle.stat();
  const capturedIdentity = identity(stats);
  const pathStats = await lstat(path);
  if (!stats.isFile() || stats.nlink !== 1 || capturedIdentity.mode !== 0o600 || capturedIdentity.size !== token.length ||
    pathStats.isSymbolicLink() || !pathStats.isFile() || Number(pathStats.dev) !== capturedIdentity.dev ||
    Number(pathStats.ino) !== capturedIdentity.ino || !(await exactHandleBytes(handle, token.length)).equals(token)) {
    throw new Error("Preparation lock could not be verified.");
  }
  lock.identity = capturedIdentity;
  await syncDirectoryPath(dependencies, shieldPath);
  return lock;
}

async function lockOwned(lock: HeldLock): Promise<boolean> {
  try {
    if (lock.identity === null) return false;
    const stats = await lock.handle.stat();
    const current = identity(stats);
    const pathStats = await lstat(lock.path);
    return stats.isFile() && stats.nlink === 1 && sameIdentity(current, lock.identity) &&
      !pathStats.isSymbolicLink() && pathStats.isFile() && Number(pathStats.dev) === current.dev &&
      Number(pathStats.ino) === current.ino && (await exactHandleBytes(lock.handle, current.size)).equals(lock.token);
  } catch {
    return false;
  }
}

async function createTemporary(
  path: string,
  bytes: Buffer,
  dependencies: WorktreePreparationTestDependenciesV1,
  retain: (temporary: TemporaryFile) => void,
): Promise<TemporaryFile> {
  const handle = await open(path, WRITE_EXCLUSIVE_FLAGS, FILE_MODE);
  const temporary: TemporaryFile = { path, bytes, handle, identity: null, installed: false };
  retain(temporary);
  await filesystemEvent(dependencies, "after_temporary_create", path);
  await handle.chmod(FILE_MODE);
  await handle.writeFile(bytes);
  await handle.sync();
  await filesystemEvent(dependencies, "after_temporary_file_sync", path);
  const stats = await handle.stat();
  if (!stats.isFile() || stats.nlink !== 1 || stats.size !== bytes.length || (Number(stats.mode) & 0o7777) !== FILE_MODE) {
    throw new Error("Temporary file write could not be verified.");
  }
  const capturedIdentity = identity(stats);
  const pathStats = await lstat(path);
  if (pathStats.isSymbolicLink() || !pathStats.isFile() || Number(pathStats.dev) !== capturedIdentity.dev ||
    Number(pathStats.ino) !== capturedIdentity.ino || !(await exactHandleBytes(handle, bytes.length)).equals(bytes)) {
    throw new Error("Temporary file identity or bytes could not be verified.");
  }
  temporary.identity = capturedIdentity;
  return temporary;
}

async function temporaryStillExact(temporary: TemporaryFile): Promise<boolean> {
  if (temporary.identity === null) return false;
  const stats = await temporary.handle.stat();
  const current = identity(stats);
  const pathStats = await lstat(temporary.path);
  return stats.isFile() && stats.nlink === 1 && sameIdentity(current, temporary.identity) &&
    !pathStats.isSymbolicLink() && pathStats.isFile() && Number(pathStats.dev) === current.dev &&
    Number(pathStats.ino) === current.ino && (await exactHandleBytes(temporary.handle, current.size)).equals(temporary.bytes);
}

async function cleanupTrackedArtifact(
  artifact: HeldLock | TemporaryFile,
  dependencies: WorktreePreparationTestDependenciesV1,
): Promise<boolean> {
  const parent = dirname(artifact.path);
  try {
    const handleStats = await artifact.handle.stat();
    if (!handleStats.isFile() || handleStats.nlink !== 1) return false;
    const pathStats = await lstat(artifact.path);
    if (pathStats.isSymbolicLink() || !pathStats.isFile() || Number(pathStats.dev) !== Number(handleStats.dev) ||
      Number(pathStats.ino) !== Number(handleStats.ino) ||
      (artifact.identity !== null && (artifact.identity.dev !== Number(handleStats.dev) || artifact.identity.ino !== Number(handleStats.ino)))) {
      return false;
    }
    await filesystemEvent(dependencies, "before_cleanup_unlink", artifact.path);
    await unlinkPath(dependencies, artifact.path);
    try {
      await lstat(artifact.path);
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
    }
    if ((await artifact.handle.stat()).nlink !== 0) return false;
    await filesystemEvent(dependencies, "before_cleanup_directory_sync", parent);
    await syncDirectoryPath(dependencies, parent);
    return true;
  } catch {
    return false;
  }
}

async function preflightDestination(
  destinationRoot: string,
  destinationHead: string,
  sourceMissionStatePolicy: MissionStatePolicy,
  retain: (held: HeldDirectory) => void,
): Promise<{
  readonly receipt: WorktreeStateReceiptV1 | null;
  readonly baseline: TrackedBaselineSnapshot;
  readonly missionState: HeldMissionState | null;
  readonly missionStatePolicy: MissionStatePolicy | null;
}> {
  const held = await holdShieldDirectoryIfPresent(destinationRoot);
  if (held === null) {
    const baseline = await captureTrackedBaseline(
      destinationRoot, destinationHead, null, sourceMissionStatePolicy.journalRoot,
    );
    return { receipt: null, baseline, missionState: null, missionStatePolicy: null };
  }
  retain(held);
  const entries = await readdir(held.path);
  if (!await directoryStillHeld(held.path, held)) {
    throw new Blocked("destination_conflict", "Destination .shield identity changed during preflight.");
  }
  if (entries.includes(LOCK_NAME)) {
    throw new Blocked("preparation_in_progress", "Destination preparation lock is already held.");
  }
  let missionState: HeldMissionState | null = null;
  let receipt: WorktreeStateReceiptV1 | null = null;
  let installedMissionStatePolicy: MissionStatePolicy | null = null;
  if (entries.includes("worktree-state.json")) {
    receipt = await readStoredReceipt(destinationRoot);
    if (receipt === null) throw new Blocked("prepared_state_stale", "Destination worktree receipt is malformed or unsafe.");
    installedMissionStatePolicy = await readInstalledMissionStatePolicy(destinationRoot, receipt);
    if (installedMissionStatePolicy === null) {
      throw new Blocked("prepared_state_stale", "Destination installed configuration or generated ignore policy is malformed or stale.");
    }
  }
  const baseline = await captureTrackedBaseline(
    destinationRoot,
    destinationHead,
    held,
    (installedMissionStatePolicy ?? sourceMissionStatePolicy).journalRoot,
  );
  try {
    if (receipt !== null && installedMissionStatePolicy !== null) {
      try {
        missionState = await captureMissionState(held, installedMissionStatePolicy);
      } catch {
        throw new Blocked("prepared_state_stale", "Configured mission-state roots have an unsafe owner, mode, or path identity.");
      }
      if (!await destinationLayoutExact(held, baseline, POLICY_SHIELD_FILES, missionState) ||
        !await validateInstalledReceipt(destinationRoot, receipt, undefined, undefined, baseline)) {
        throw new Blocked("prepared_state_stale", "Destination prepared policy is partial, drifted, or contains conflicting state.");
      }
      return { receipt, baseline, missionState, missionStatePolicy: installedMissionStatePolicy };
    }
    if (!await destinationLayoutExact(held, baseline, [])) {
      throw new Blocked("destination_conflict", "Destination .shield contains existing policy, mission, secret, cache, or staging state.");
    }
    return { receipt: null, baseline, missionState: null, missionStatePolicy: null };
  } catch (error) {
    await closeMissionState(missionState);
    await closeTrackedBaseline(baseline);
    throw error;
  }
}

async function reobserveStable(
  snapshot: SourceSnapshot,
  source: WorktreeGitObservationV1,
  destination: WorktreeGitObservationV1,
  sourceHeld: HeldRoot,
  destinationHeld: HeldRoot,
  shieldHeld: HeldDirectory | null,
  trackedBaseline: TrackedBaselineSnapshot,
): Promise<boolean> {
  if (!await directoryChainStillHeld(sourceHeld.directories) || !await directoryChainStillHeld(destinationHeld.directories) ||
    !await directoryStillHeld(snapshot.policyDirectory.path, snapshot.policyDirectory) ||
    (shieldHeld !== null && !await directoryStillHeld(shieldHeld.path, shieldHeld)) ||
    !await revalidateCapturedFile(snapshot.configFile) || !await revalidateCapturedFile(snapshot.registryFile) ||
    !await trackedBaselineStillExact(trackedBaseline, destination.root, destination.head)) return false;
  const current = await observeRepositories(source.root, destination.root, snapshot.config.repositoryId);
  return canonicalJson(current.source) === canonicalJson(source) && canonicalJson(current.destination) === canonicalJson(destination);
}

export async function prepareWorktreeStateV1(input: WorktreePreparationRequestV1): Promise<WorktreePreparationResultV1> {
  return prepareWorktreeStateV1ForTest(input, {});
}

export async function prepareWorktreeStateV1ForTest(
  input: WorktreePreparationRequestV1,
  dependencies: WorktreePreparationTestDependenciesV1,
): Promise<WorktreePreparationResultV1> {
  let sourceRoot: string | null = null;
  let destinationRoot: string | null = null;
  let sourceHeld: HeldRoot | null = null;
  let destinationHeld: HeldRoot | null = null;
  let snapshot: SourceSnapshot | null = null;
  let trackedBaseline: TrackedBaselineSnapshot | null = null;
  let missionState: HeldMissionState | null = null;
  let shieldHeld: HeldDirectory | null = null;
  let heldLock: HeldLock | null = null;
  let installedCount = 0;
  let expectedReceipt: WorktreeStateReceiptV1 | null = null;
  const temporaryFiles: TemporaryFile[] = [];
  let outcome: WorktreePreparationResultV1 | null = null;
  let cleanupUncertain = false;
  let installationUncertain = false;
  let shieldCreated = false;
  try {
    if (!exact(input, ["sourceRoot", "destinationRoot"]) || typeof input.sourceRoot !== "string" || typeof input.destinationRoot !== "string") {
      return blocked("invalid_request", "Preparation request must contain only sourceRoot and destinationRoot strings.", null, null);
    }
    sourceHeld = await captureCanonicalRoot(input.sourceRoot);
    sourceRoot = sourceHeld.root;
    destinationHeld = await captureCanonicalRoot(input.destinationRoot);
    destinationRoot = destinationHeld.root;
    if (sourceRoot === destinationRoot) throw new Blocked("roots_not_distinct", "Source and destination must be distinct worktrees.");
    snapshot = await captureSourcePolicy(sourceRoot);
    await dependencies.phase?.("source_captured");
    const observed = await observeRepositories(sourceRoot, destinationRoot, snapshot.config.repositoryId);
    await dependencies.phase?.("repositories_observed");
    const preflight = await preflightDestination(
      destinationRoot,
      observed.destination.head,
      snapshot.missionStatePolicy,
      (held) => { shieldHeld = held; },
    );
    trackedBaseline = preflight.baseline;
    missionState = preflight.missionState;
    const existing = preflight.receipt;
    if (existing !== null) {
      if (preflight.missionStatePolicy === null ||
        canonicalJson(preflight.missionStatePolicy.roots) !== canonicalJson(snapshot.missionStatePolicy.roots)) {
        throw new Blocked("prepared_state_stale", "Existing installed mission-state paths do not match current source policy.");
      }
      if (!await validateInstalledReceipt(destinationRoot, existing, snapshot, observed.destination, trackedBaseline)) {
        throw new Blocked("prepared_state_stale", "Existing receipt does not match current source policy or repository identity.");
      }
      await dependencies.phase?.("before_replay_ready");
      if (shieldHeld === null || !await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld, trackedBaseline,
      ) || !await destinationLayoutExact(
        shieldHeld, trackedBaseline, POLICY_SHIELD_FILES, missionState,
      ) || !await validateInstalledReceipt(destinationRoot, existing, snapshot, observed.destination, trackedBaseline)) {
        throw new Blocked("source_policy_drift", "Source policy, repository, or prepared destination changed before replay success.");
      }
      outcome = success("already_prepared", existing);
    } else {
      await dependencies.phase?.("before_destination_mutation");
      if (!await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld, trackedBaseline,
      )) {
        throw new Blocked("source_policy_drift", "Source policy or repository state changed before destination mutation.");
      }
      const rootHeld = destinationHeld.directories.at(-1);
      if (rootHeld === undefined) throw new Error("Destination root descriptor was not retained.");
      const shield = await ensureShieldDirectory(destinationRoot, rootHeld, shieldHeld, () => { shieldCreated = true; });
      shieldHeld = shield.held;
      if (!await directoryChainStillHeld(destinationHeld.directories) ||
        !await directoryStillHeld(join(destinationRoot, SHIELD_DIRECTORY), shieldHeld) ||
        !await reobserveStable(
          snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld, trackedBaseline,
        ) || !await destinationLayoutExact(shieldHeld, trackedBaseline, [])) {
        throw new Blocked("destination_conflict", "Destination directory identity changed during preparation.");
      }
      const shieldPath = join(destinationRoot, SHIELD_DIRECTORY);
      const token = Buffer.from(`${process.pid}:${randomBytes(24).toString("hex")}\n`, "utf8");
      heldLock = await acquireLock(shieldPath, token, dependencies, (lock) => { heldLock = lock; });
      await dependencies.phase?.("lock_acquired");
      if (!await destinationLayoutExact(shieldHeld, trackedBaseline, [LOCK_NAME])) {
        throw new Blocked("destination_conflict", "Destination state changed before materialization.");
      }
      if (!await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld, trackedBaseline,
      )) {
        throw new Blocked("source_policy_drift", "Source policy or Git observations changed before staging.");
      }
      expectedReceipt = buildReceipt(receiptBody(snapshot, observed.source, observed.destination, trackedBaseline));
      const nonce = dependencies.nonce?.() ?? randomBytes(16).toString("hex");
      if (!/^[A-Za-z0-9_-]{8,128}$/u.test(nonce)) throw new Error("Invalid preparation nonce.");
      const installs: readonly { relative: string; bytes: Buffer }[] = [
        { relative: IGNORE_PATH, bytes: snapshot.missionStatePolicy.ignoreBytes },
        { relative: CONFIG_PATH, bytes: snapshot.configFile.bytes },
        { relative: REGISTRY_PATH, bytes: snapshot.registryFile.bytes },
        { relative: WORKTREE_STATE_RELATIVE_PATH, bytes: receiptBytes(expectedReceipt) },
      ];
      for (let index = 0; index < installs.length; index += 1) {
        const temporaryPath = join(shieldPath, `${TEMP_PREFIX}${nonce}-${index}.tmp`);
        await createTemporary(temporaryPath, installs[index]!.bytes, dependencies, (temporary) => { temporaryFiles.push(temporary); });
      }
      await syncDirectoryPath(dependencies, shieldPath);
      await dependencies.phase?.("temporaries_synced");
      if (!await lockOwned(heldLock) || !await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld, trackedBaseline,
      ) || !await destinationLayoutExact(
        shieldHeld, trackedBaseline, [LOCK_NAME, ...temporaryFiles.map((temporary) => basename(temporary.path))],
      )) {
        throw new Blocked("source_policy_drift", "Retained source, repository, destination, or lock identity changed before installation.");
      }
      await dependencies.phase?.("before_install");
      if (!await destinationLayoutExact(
        shieldHeld, trackedBaseline, [LOCK_NAME, ...temporaryFiles.map((temporary) => basename(temporary.path))],
      )) {
        throw new Blocked("destination_conflict", "Destination state changed at the installation boundary.");
      }
      if (!await lockOwned(heldLock) || !await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld, trackedBaseline,
      )) {
        throw new Blocked("source_policy_drift", "Retained state changed at the installation boundary.");
      }
      for (let index = 0; index < installs.length; index += 1) {
        const finalPath = join(destinationRoot, installs[index]!.relative);
        const temporary = temporaryFiles[index]!;
        if (!await temporaryStillExact(temporary)) throw new Error("Temporary file changed before installation.");
        installationUncertain = true;
        try {
          await linkPath(dependencies, temporary.path, finalPath);
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST" && installedCount === 0) {
            installationUncertain = false;
            throw new Blocked("destination_conflict", "A destination policy path appeared during installation.");
          }
          throw error;
        }
        installedCount += 1;
        await syncDirectoryPath(dependencies, shieldPath);
        await unlinkPath(dependencies, temporary.path);
        temporary.installed = true;
        await syncDirectoryPath(dependencies, shieldPath);
        const installed = await readInstalledPath(dependencies, finalPath);
        if (!installed.equals(installs[index]!.bytes)) throw new Error("Installed file readback mismatch.");
      }
      installationUncertain = false;
      await dependencies.phase?.("after_install");
      if (!await lockOwned(heldLock) || !await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld, trackedBaseline,
      ) || !await destinationLayoutExact(
        shieldHeld, trackedBaseline, [LOCK_NAME, ...POLICY_SHIELD_FILES],
      ) || !await validateInstalledReceipt(destinationRoot, expectedReceipt, snapshot, observed.destination, trackedBaseline)) {
        throw new Error("Post-installation revalidation failed.");
      }
      await dependencies.phase?.("before_ready");
      if (!await lockOwned(heldLock) || !await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld, trackedBaseline,
      ) || !await destinationLayoutExact(
        shieldHeld, trackedBaseline, [LOCK_NAME, ...POLICY_SHIELD_FILES],
      ) || !await validateInstalledReceipt(destinationRoot, expectedReceipt, snapshot, observed.destination, trackedBaseline)) {
        throw new Error("Final ready-boundary revalidation failed.");
      }
      outcome = success("ready", expectedReceipt);
    }
  } catch (error) {
    if (installedCount > 0 || installationUncertain || (shieldCreated && shieldHeld === null)) {
      outcome = recovery(sourceRoot, destinationRoot, expectedReceipt);
    } else if (error instanceof Blocked) {
      outcome = blocked(error.reasonCode, error.message, sourceRoot, destinationRoot);
    } else {
      outcome = blocked("operation_failed", "Preparation failed before installation; no final policy file was created.", sourceRoot, destinationRoot);
    }
  } finally {
    for (const temporary of temporaryFiles) {
      if (!temporary.installed) {
        if (!await cleanupTrackedArtifact(temporary, dependencies)) cleanupUncertain = true;
      }
      try { await temporary.handle.close(); } catch { cleanupUncertain = true; }
    }
    if (heldLock !== null) {
      if (!await cleanupTrackedArtifact(heldLock, dependencies)) cleanupUncertain = true;
      try { await heldLock.handle.close(); } catch { cleanupUncertain = true; }
    }
    await closeMissionState(missionState);
    if (shieldHeld !== null) await shieldHeld.handle.close().catch(() => { cleanupUncertain = true; });
    await closeTrackedBaseline(trackedBaseline);
    await closeSnapshot(snapshot);
    if (destinationHeld !== null && !await closeDirectories(destinationHeld.directories)) cleanupUncertain = true;
    if (sourceHeld !== null && !await closeDirectories(sourceHeld.directories)) cleanupUncertain = true;
  }
  if (cleanupUncertain) return recovery(sourceRoot, destinationRoot, installedCount === 4 ? expectedReceipt : null);
  return outcome ?? blocked("operation_failed", "Preparation did not produce a closed result.", sourceRoot, destinationRoot);
}

async function refreshFilesystemEvent(
  dependencies: WorktreeRefreshTestDependenciesV2,
  operation: WorktreeRefreshFilesystemOperationV2,
  path: string,
): Promise<void> {
  await dependencies.filesystem?.(Object.freeze({ operation, path }));
}

async function refreshReadPath(dependencies: WorktreeRefreshTestDependenciesV2, path: string): Promise<Buffer> {
  return Buffer.from(await (dependencies.readPath ?? readNoFollowRegular)(path));
}

async function refreshSyncDirectoryPath(dependencies: WorktreeRefreshTestDependenciesV2, path: string): Promise<void> {
  await (dependencies.syncDirectoryPath ?? syncDirectory)(path);
  await refreshFilesystemEvent(dependencies, "directory_sync", path);
}

async function predecessorIsAncestor(root: string, predecessorHead: string, destinationHead: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["--no-replace-objects", "merge-base", "--is-ancestor", predecessorHead, destinationHead], {
      cwd: root,
      encoding: "utf8",
      env: { ...gitEnvironment(), GIT_NO_REPLACE_OBJECTS: "1" },
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException & { code?: number }).code === 1) return false;
    throw new RefreshBlocked("operation_failed", "Git ancestry could not be proven exactly.");
  }
}

async function refreshStateStillExact(input: {
  readonly snapshot: SourceSnapshot;
  readonly sourceRoot: string;
  readonly sourceHeld: HeldRoot;
  readonly destinationHeld: HeldRoot;
  readonly destination: WorktreeGitObservationV1;
  readonly shieldHeld: HeldDirectory;
  readonly archiveHeld: HeldDirectory | null;
  readonly trackedBaseline: TrackedBaselineSnapshot;
  readonly missionState: HeldMissionState;
  readonly receipt: WorktreeStateReceiptV1OrV2;
  readonly retainedActive: CapturedFile | null;
  readonly allowStagedActiveArchive: boolean;
  readonly allowedShieldFiles: readonly string[];
  readonly bindReceiptToCurrentHead: boolean;
}): Promise<boolean> {
  try {
    if (!await directoryChainStillHeld(input.sourceHeld.directories) ||
      !await directoryChainStillHeld(input.destinationHeld.directories) ||
      !await directoryStillHeld(input.snapshot.policyDirectory.path, input.snapshot.policyDirectory) ||
      !await directoryStillHeld(input.shieldHeld.path, input.shieldHeld) ||
      (input.archiveHeld !== null && !await missionStateDirectoryStillHeld(input.archiveHeld)) ||
      !await revalidateCapturedFile(input.snapshot.configFile) ||
      !await revalidateCapturedFile(input.snapshot.registryFile) ||
      !await trackedBaselineStillExact(input.trackedBaseline, input.destination.root, input.destination.head) ||
      !await missionStateStillHeld(input.missionState) ||
      !await destinationLayoutExact(input.shieldHeld, input.trackedBaseline, input.allowedShieldFiles, input.missionState)) return false;
    if (input.retainedActive !== null && !await revalidateCapturedFile(input.retainedActive)) return false;
    const activeBytes = await readNoFollowRegular(join(input.destination.root, WORKTREE_STATE_RELATIVE_PATH));
    if (!activeBytes.equals(receiptBytes(input.receipt))) return false;
    const current = await observeRepositories(
      input.sourceRoot,
      input.destination.root,
      input.snapshot.config.repositoryId,
    );
    if (canonicalJson(current.destination) !== canonicalJson(input.destination)) return false;
    if (!await validateInstalledReceipt(
      input.destination.root,
      input.receipt,
      input.snapshot,
      input.bindReceiptToCurrentHead ? input.destination : undefined,
      input.bindReceiptToCurrentHead ? input.trackedBaseline : undefined,
    )) return false;
    return (await inspectReceiptChain(
      input.destination.root,
      input.receipt,
      input.allowStagedActiveArchive,
    )).status === "valid";
  } catch {
    return false;
  }
}

async function createArchivedPredecessor(
  archivePath: string,
  predecessor: WorktreeStateReceiptV1OrV2,
  dependencies: WorktreeRefreshTestDependenciesV2,
): Promise<void> {
  const path = join(archivePath, `${predecessor.receiptDigest}.json`);
  const bytes = receiptBytes(predecessor);
  const handle = await open(path, WRITE_EXCLUSIVE_FLAGS, FILE_MODE);
  try {
    await refreshFilesystemEvent(dependencies, "archive_file_create", path);
    await handle.chmod(FILE_MODE);
    await handle.writeFile(bytes);
    await handle.sync();
    await refreshFilesystemEvent(dependencies, "archive_file_sync", path);
    const stats = await handle.stat();
    const pathStats = await lstat(path);
    if (!stats.isFile() || stats.nlink !== 1 || stats.size !== bytes.length ||
      (Number(stats.mode) & 0o7777) !== FILE_MODE || pathStats.isSymbolicLink() || !pathStats.isFile() ||
      Number(pathStats.dev) !== Number(stats.dev) || Number(pathStats.ino) !== Number(stats.ino) ||
      !(await exactHandleBytes(handle, bytes.length)).equals(bytes)) throw new Error("Archived predecessor write was not exact.");
    if (!(await refreshReadPath(dependencies, path)).equals(bytes)) throw new Error("Archived predecessor readback mismatch.");
    await refreshFilesystemEvent(dependencies, "archive_readback", path);
  } finally {
    await handle.close();
  }
}

async function createSuccessorTemporary(
  path: string,
  successor: WorktreeStateReceiptV2,
  dependencies: WorktreeRefreshTestDependenciesV2,
): Promise<TemporaryFile> {
  const bytes = receiptBytes(successor);
  const handle = await open(path, WRITE_EXCLUSIVE_FLAGS, FILE_MODE);
  const temporary: TemporaryFile = { path, bytes, handle, identity: null, installed: false };
  try {
    await refreshFilesystemEvent(dependencies, "successor_file_create", path);
    await handle.chmod(FILE_MODE);
    await handle.writeFile(bytes);
    await handle.sync();
    await refreshFilesystemEvent(dependencies, "successor_file_sync", path);
    const stats = await handle.stat();
    const capturedIdentity = identity(stats);
    const pathStats = await lstat(path);
    if (!stats.isFile() || stats.nlink !== 1 || stats.size !== bytes.length || capturedIdentity.mode !== FILE_MODE ||
      pathStats.isSymbolicLink() || !pathStats.isFile() || Number(pathStats.dev) !== capturedIdentity.dev ||
      Number(pathStats.ino) !== capturedIdentity.ino || !(await exactHandleBytes(handle, bytes.length)).equals(bytes) ||
      !(await refreshReadPath(dependencies, path)).equals(bytes)) throw new Error("Successor staging write was not exact.");
    temporary.identity = capturedIdentity;
    return temporary;
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function releaseRefreshLock(
  lock: HeldLock,
  shieldPath: string,
  dependencies: WorktreeRefreshTestDependenciesV2,
): Promise<boolean> {
  try {
    if (!await lockOwned(lock)) return false;
    await (dependencies.unlinkPath ?? unlink)(lock.path);
    await refreshFilesystemEvent(dependencies, "lock_release", lock.path);
    await refreshSyncDirectoryPath(dependencies, shieldPath);
    return (await lock.handle.stat()).nlink === 0;
  } catch {
    return false;
  }
}

export async function prepareOrRefreshWorktreeStateV2(
  input: WorktreePreparationRequestV1,
): Promise<WorktreePreparationResultV1OrV2> {
  return prepareOrRefreshWorktreeStateV2ForTest(input, {});
}

export async function prepareOrRefreshWorktreeStateV2ForTest(
  input: WorktreePreparationRequestV1,
  dependencies: WorktreeRefreshTestDependenciesV2,
): Promise<WorktreePreparationResultV1OrV2> {
  if (!exact(input, ["sourceRoot", "destinationRoot"]) || typeof input.sourceRoot !== "string" ||
    typeof input.destinationRoot !== "string") return prepareWorktreeStateV1(input);
  try {
    if (!await pathExists(join(input.destinationRoot, WORKTREE_STATE_RELATIVE_PATH))) {
      return prepareWorktreeStateV1(input);
    }
  } catch {
    return prepareWorktreeStateV1(input);
  }

  let sourceRoot: string | null = null;
  let destinationRoot: string | null = null;
  let sourceHeld: HeldRoot | null = null;
  let destinationHeld: HeldRoot | null = null;
  let snapshot: SourceSnapshot | null = null;
  let trackedBaseline: TrackedBaselineSnapshot | null = null;
  let missionState: HeldMissionState | null = null;
  let shieldHeld: HeldDirectory | null = null;
  let archiveHeld: HeldDirectory | null = null;
  let activeHeld: HeldActiveReceipt | null = null;
  let heldLock: HeldLock | null = null;
  let successorTemporary: TemporaryFile | null = null;
  let successor: WorktreeStateReceiptV2 | null = null;
  let durableMutationStarted = false;
  let activeReplaced = false;
  let activeReadbackExact = false;
  let lockReleased = false;
  let cleanupUncertain = false;
  let outcome: WorktreePreparationResultV1OrV2 | null = null;
  try {
    sourceHeld = await captureCanonicalRoot(input.sourceRoot);
    sourceRoot = sourceHeld.root;
    destinationHeld = await captureCanonicalRoot(input.destinationRoot);
    destinationRoot = destinationHeld.root;
    if (sourceRoot === destinationRoot) throw new RefreshBlocked("roots_not_distinct", "Source and destination must be distinct worktrees.");
    snapshot = await captureSourcePolicy(sourceRoot);
    const observed = await observeRepositories(sourceRoot, destinationRoot, snapshot.config.repositoryId);
    shieldHeld = await holdShieldDirectoryIfPresent(destinationRoot);
    if (shieldHeld === null) throw new RefreshBlocked("prepared_state_stale", "An active receipt exists without a safe destination .shield directory.");
    const entries = await readdir(shieldHeld.path);
    if (!await directoryStillHeld(shieldHeld.path, shieldHeld)) {
      throw new RefreshBlocked("prepared_state_stale", "Destination .shield identity changed during refresh preflight.");
    }
    if (entries.includes(LOCK_NAME)) {
      throw new RefreshBlocked("preparation_in_progress", "Destination preparation lock is already held.");
    }
    if (entries.some((name) => name.startsWith(TEMP_PREFIX) || name.startsWith(REFRESH_TEMP_PREFIX) || name.endsWith(".tmp"))) {
      outcome = recoveryV2(sourceRoot, destinationRoot, null);
      throw new Error("Refresh staging state requires operator recovery.");
    }
    activeHeld = await holdActiveReceipt(destinationRoot);
    if (activeHeld === null) {
      throw new RefreshBlocked("prepared_state_stale", "Destination worktree receipt is malformed, substituted, or unsafe.");
    }
    const predecessor = activeHeld.receipt;
    const installedMissionStatePolicy = await readInstalledMissionStatePolicy(destinationRoot, predecessor);
    if (installedMissionStatePolicy === null ||
      canonicalJson(installedMissionStatePolicy.roots) !== canonicalJson(snapshot.missionStatePolicy.roots)) {
      throw new RefreshBlocked("prepared_state_stale", "Installed policy or configured mission-state roots do not match the governed source policy.");
    }
    trackedBaseline = await captureTrackedBaseline(
      destinationRoot,
      observed.destination.head,
      shieldHeld,
      installedMissionStatePolicy.journalRoot,
    );
    try { missionState = await captureMissionState(shieldHeld, refreshMissionStatePolicy(installedMissionStatePolicy)); }
    catch { throw new RefreshBlocked("prepared_state_stale", "Configured mission-state roots have an unsafe owner, mode, or path identity."); }

    const archivePath = join(destinationRoot, WORKTREE_STATE_RECEIPT_ARCHIVE_RELATIVE_PATH);
    const archivePresent = entries.includes(RECEIPT_ARCHIVE_NAME);
    if (archivePresent) {
      try {
        archiveHeld = await holdDirectory(archivePath);
        if (!await missionStateDirectoryStillHeld(archiveHeld)) throw new Error("Archive directory is unsafe.");
      } catch {
        throw new RefreshBlocked("prepared_state_stale", "Prepared-worktree receipt archive is malformed or unsafe.");
      }
    }
    const allowedWithoutOperation = archivePresent
      ? [...POLICY_SHIELD_FILES, RECEIPT_ARCHIVE_NAME]
      : POLICY_SHIELD_FILES;
    if (!await destinationLayoutExact(shieldHeld, trackedBaseline, allowedWithoutOperation, missionState) ||
      !await validateInstalledReceipt(destinationRoot, predecessor, snapshot)) {
      throw new RefreshBlocked("prepared_state_stale", "Destination policy, tracked baseline, or receipt provenance is stale.");
    }
    if (predecessor.destination.root !== destinationRoot || predecessor.repositoryId !== observed.destination.originRepositoryId ||
      predecessor.commonGitDirectory !== observed.destination.commonGitDirectory) {
      throw new RefreshBlocked("repository_mismatch", "Predecessor receipt does not identify this exact repository worktree.");
    }
    if (predecessor.destination.branch !== observed.destination.branch) {
      throw new RefreshBlocked("predecessor_branch_mismatch", "Destination branch no longer matches the predecessor receipt.");
    }
    const chain = await inspectReceiptChain(destinationRoot, predecessor, true);
    if (chain.status === "missing_archive" && validateWorktreeStateReceiptV2(predecessor)) {
      outcome = recoveryV2(sourceRoot, destinationRoot, predecessor);
      throw new Error("An active successor is missing its exact predecessor archive.");
    }
    if (chain.status !== "valid") {
      throw new RefreshBlocked("prepared_state_stale", "Prepared-worktree receipt archive is malformed, substituted, or incomplete.");
    }

    if (predecessor.destination.head === observed.destination.head) {
      if (chain.stagedActiveArchive) {
        outcome = recoveryV2(sourceRoot, destinationRoot, validateWorktreeStateReceiptV2(predecessor) ? predecessor : null);
        throw new Error("A staged predecessor archive has no strict descendant successor state.");
      }
      await dependencies.phase?.("before_success");
      const exactReplay = await refreshStateStillExact({
        snapshot, sourceRoot, sourceHeld, destinationHeld, destination: observed.destination, shieldHeld, archiveHeld,
        trackedBaseline, missionState, receipt: predecessor, retainedActive: activeHeld.captured,
        allowStagedActiveArchive: false, allowedShieldFiles: allowedWithoutOperation, bindReceiptToCurrentHead: true,
      });
      if (!exactReplay) throw new RefreshBlocked("prepared_state_stale", "Prepared-worktree replay changed during final validation.");
      outcome = validateWorktreeStateReceiptV2(predecessor)
        ? refreshSuccess("already_refreshed", sourceRoot, predecessor)
        : success("already_prepared", predecessor);
    } else {
      if (chain.predecessorCount >= MAX_RECEIPT_PREDECESSORS) {
        throw new RefreshBlocked("receipt_chain_invalid", "Prepared-worktree receipt chain cannot exceed 256 predecessors.");
      }
      if (!await predecessorIsAncestor(destinationRoot, predecessor.destination.head, observed.destination.head)) {
        throw new RefreshBlocked("predecessor_not_ancestor", "Current destination HEAD is not a strict descendant of the predecessor HEAD.");
      }
      await dependencies.phase?.("before_refresh");
      if (!await refreshStateStillExact({
        snapshot, sourceRoot, sourceHeld, destinationHeld, destination: observed.destination, shieldHeld, archiveHeld,
        trackedBaseline, missionState, receipt: predecessor, retainedActive: activeHeld.captured,
        allowStagedActiveArchive: true, allowedShieldFiles: allowedWithoutOperation, bindReceiptToCurrentHead: false,
      })) throw new RefreshBlocked("refresh_conflict", "Refresh inputs changed before lock acquisition.");

      const shieldPath = shieldHeld.path;
      const token = Buffer.from(`${process.pid}:${randomBytes(24).toString("hex")}\n`, "utf8");
      heldLock = await acquireLock(shieldPath, token, {}, (lock) => { heldLock = lock; });
      await dependencies.phase?.("lock_acquired");
      let allowedDuringOperation: string[] = [...allowedWithoutOperation, LOCK_NAME];
      if (!await refreshStateStillExact({
        snapshot, sourceRoot, sourceHeld, destinationHeld, destination: observed.destination, shieldHeld, archiveHeld,
        trackedBaseline, missionState, receipt: predecessor, retainedActive: activeHeld.captured,
        allowStagedActiveArchive: true, allowedShieldFiles: allowedDuringOperation, bindReceiptToCurrentHead: false,
      })) throw new RefreshBlocked("refresh_conflict", "Refresh inputs changed after lock acquisition.");

      if (archiveHeld === null) {
        durableMutationStarted = true;
        await mkdir(archivePath, { mode: 0o700 });
        await refreshFilesystemEvent(dependencies, "archive_directory_create", archivePath);
        await refreshSyncDirectoryPath(dependencies, shieldPath);
        archiveHeld = await holdDirectory(archivePath);
        if (!await missionStateDirectoryStillHeld(archiveHeld)) throw new Error("Created receipt archive directory is unsafe.");
        allowedDuringOperation = [...POLICY_SHIELD_FILES, RECEIPT_ARCHIVE_NAME, LOCK_NAME];
      }
      const predecessorArchivePath = join(archivePath, `${predecessor.receiptDigest}.json`);
      if (chain.stagedActiveArchive) {
        const archived = await readArchivedReceipt(predecessorArchivePath);
        if (archived === null || canonicalJson(archived) !== canonicalJson(predecessor)) {
          throw new RefreshBlocked("prepared_state_stale", "Existing predecessor archive does not contain the exact active receipt.");
        }
      } else {
        durableMutationStarted = true;
        await createArchivedPredecessor(archivePath, predecessor, dependencies);
        await refreshSyncDirectoryPath(dependencies, archivePath);
      }
      const archivedChain = await inspectReceiptChain(destinationRoot, predecessor, true);
      if (archivedChain.status !== "valid" || !archivedChain.stagedActiveArchive) {
        throw new Error("Predecessor archive readback did not form one exact chain.");
      }

      successor = buildSuccessorReceipt(snapshot, observed.destination, trackedBaseline, predecessor);
      const nonce = dependencies.nonce?.() ?? randomBytes(16).toString("hex");
      if (!/^[A-Za-z0-9_-]{8,128}$/u.test(nonce)) throw new RefreshBlocked("operation_failed", "Invalid refresh nonce.");
      const successorPath = join(shieldPath, `${REFRESH_TEMP_PREFIX}${nonce}.tmp`);
      durableMutationStarted = true;
      successorTemporary = await createSuccessorTemporary(successorPath, successor, dependencies);
      allowedDuringOperation = [...POLICY_SHIELD_FILES, RECEIPT_ARCHIVE_NAME, LOCK_NAME, basename(successorPath)];
      await refreshSyncDirectoryPath(dependencies, shieldPath);
      await dependencies.phase?.("before_replace");
      if (heldLock === null || !await lockOwned(heldLock) || !await temporaryStillExact(successorTemporary) ||
        !await refreshStateStillExact({
          snapshot, sourceRoot, sourceHeld, destinationHeld, destination: observed.destination, shieldHeld, archiveHeld,
          trackedBaseline, missionState, receipt: predecessor, retainedActive: activeHeld.captured,
          allowStagedActiveArchive: true, allowedShieldFiles: allowedDuringOperation, bindReceiptToCurrentHead: false,
        })) throw new RefreshBlocked("refresh_conflict", "Live refresh facts changed before active receipt replacement.");

      await (dependencies.renamePath ?? rename)(successorPath, join(destinationRoot, WORKTREE_STATE_RELATIVE_PATH));
      successorTemporary.installed = true;
      activeReplaced = true;
      await refreshFilesystemEvent(dependencies, "active_receipt_replace", join(destinationRoot, WORKTREE_STATE_RELATIVE_PATH));
      const installedBytes = await refreshReadPath(dependencies, join(destinationRoot, WORKTREE_STATE_RELATIVE_PATH));
      activeReadbackExact = installedBytes.equals(receiptBytes(successor));
      if (!activeReadbackExact) throw new Error("Active successor receipt readback mismatch.");
      await refreshFilesystemEvent(dependencies, "active_receipt_readback", join(destinationRoot, WORKTREE_STATE_RELATIVE_PATH));
      await refreshSyncDirectoryPath(dependencies, shieldPath);
      await dependencies.phase?.("before_success");
      if (heldLock === null || !await lockOwned(heldLock) || !await refreshStateStillExact({
        snapshot, sourceRoot, sourceHeld, destinationHeld, destination: observed.destination, shieldHeld, archiveHeld,
        trackedBaseline, missionState, receipt: successor, retainedActive: null,
        allowStagedActiveArchive: false,
        allowedShieldFiles: [...POLICY_SHIELD_FILES, RECEIPT_ARCHIVE_NAME, LOCK_NAME],
        bindReceiptToCurrentHead: true,
      })) throw new Error("Final refreshed-state revalidation failed.");
      lockReleased = await releaseRefreshLock(heldLock, shieldPath, dependencies);
      if (!lockReleased) throw new Error("Refresh lock release or directory synchronization was uncertain.");
      outcome = refreshSuccess("refreshed", sourceRoot, successor);
    }
  } catch (error) {
    if (outcome === null) {
      if (durableMutationStarted || activeReplaced) {
        outcome = recoveryV2(sourceRoot, destinationRoot, activeReplaced && activeReadbackExact ? successor : null);
      } else if (error instanceof RefreshBlocked) {
        outcome = blockedV2(error.reasonCode, error.message, sourceRoot, destinationRoot);
      } else if (error instanceof Blocked) {
        outcome = blockedV2(error.reasonCode, error.message, sourceRoot, destinationRoot);
      } else {
        outcome = blockedV2("operation_failed", "Receipt refresh failed before any durable receipt or archive mutation.", sourceRoot, destinationRoot);
      }
    }
  } finally {
    if (heldLock !== null && !lockReleased) {
      if (await lockOwned(heldLock)) {
        lockReleased = await releaseRefreshLock(heldLock, shieldHeld?.path ?? dirname(heldLock.path), dependencies);
        if (!lockReleased) cleanupUncertain = true;
      } else if (await pathExists(heldLock.path).catch(() => true)) {
        cleanupUncertain = true;
      }
      try { await heldLock.handle.close(); } catch { cleanupUncertain = true; }
    } else if (heldLock !== null) {
      try { await heldLock.handle.close(); } catch { cleanupUncertain = true; }
    }
    if (successorTemporary !== null) {
      try { await successorTemporary.handle.close(); } catch { cleanupUncertain = true; }
    }
    if (activeHeld !== null) await activeHeld.captured.handle.close().catch(() => { cleanupUncertain = true; });
    if (archiveHeld !== null) await archiveHeld.handle.close().catch(() => { cleanupUncertain = true; });
    await closeMissionState(missionState);
    await closeTrackedBaseline(trackedBaseline);
    if (shieldHeld !== null) await shieldHeld.handle.close().catch(() => { cleanupUncertain = true; });
    await closeSnapshot(snapshot);
    if (destinationHeld !== null && !await closeDirectories(destinationHeld.directories)) cleanupUncertain = true;
    if (sourceHeld !== null && !await closeDirectories(sourceHeld.directories)) cleanupUncertain = true;
  }
  if (cleanupUncertain) return recoveryV2(sourceRoot, destinationRoot, activeReplaced && activeReadbackExact ? successor : null);
  return outcome ?? blockedV2("operation_failed", "Receipt refresh did not produce a closed result.", sourceRoot, destinationRoot);
}

async function doctorPreparedReceipt(
  root: string,
  receipt: WorktreeStateReceiptV1OrV2,
  shieldHeld: HeldDirectory,
  rootHeld: HeldRoot,
): Promise<{ readonly valid: boolean; readonly missionStatePresent: boolean }> {
  let baseline: TrackedBaselineSnapshot | null = null;
  let missionState: HeldMissionState | null = null;
  let archiveHeld: HeldDirectory | null = null;
  try {
    const installedMissionStatePolicy = await readInstalledMissionStatePolicy(root, receipt);
    if (installedMissionStatePolicy === null) return { valid: false, missionStatePresent: false };
    const observation = await observeGitRoot(root);
    baseline = await captureTrackedBaseline(
      root, observation.head, shieldHeld, installedMissionStatePolicy.journalRoot,
    );
    missionState = await captureMissionState(
      shieldHeld,
      validateWorktreeStateReceiptV2(receipt) ? refreshMissionStatePolicy(installedMissionStatePolicy) : installedMissionStatePolicy,
    );
    const allowedShieldFiles = validateWorktreeStateReceiptV2(receipt)
      ? [...POLICY_SHIELD_FILES, RECEIPT_ARCHIVE_NAME]
      : POLICY_SHIELD_FILES;
    if (validateWorktreeStateReceiptV2(receipt)) {
      archiveHeld = await holdDirectory(join(root, WORKTREE_STATE_RECEIPT_ARCHIVE_RELATIVE_PATH));
      if (!await missionStateDirectoryStillHeld(archiveHeld)) return { valid: false, missionStatePresent: false };
    }
    if (!await destinationLayoutExact(
      shieldHeld, baseline, allowedShieldFiles, missionState,
    ) || observation.branch === null || observation.porcelainStatus !== "" ||
      !await validateInstalledReceipt(root, receipt, undefined, observation, baseline) ||
      !await validateWorktreeStateReceiptFileChainV1OrV2(root, receipt)) return { valid: false, missionStatePresent: false };
    const listing = await git(root, ["worktree", "list", "--porcelain"]);
    const registered = listing?.split("\n").filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length)).includes(root) ?? false;
    const missionStatePresent = missionState.roots.length > 0;
    return {
      valid: registered && observation.commonGitDirectory === receipt.commonGitDirectory &&
        observation.originRepositoryId === receipt.repositoryId &&
        await directoryChainStillHeld(rootHeld.directories) && await directoryStillHeld(shieldHeld.path, shieldHeld) &&
        (archiveHeld === null || await missionStateDirectoryStillHeld(archiveHeld)) &&
        await missionStateStillHeld(missionState) &&
        await destinationLayoutExact(shieldHeld, baseline, allowedShieldFiles, missionState) &&
        await validateInstalledReceipt(root, receipt, undefined, observation, baseline) &&
        await validateWorktreeStateReceiptFileChainV1OrV2(root, receipt),
      missionStatePresent,
    };
  } catch {
    return { valid: false, missionStatePresent: false };
  } finally {
    if (archiveHeld !== null) await archiveHeld.handle.close().catch(() => undefined);
    await closeMissionState(missionState);
    await closeTrackedBaseline(baseline);
  }
}

export async function inspectWorktreeStateV1(input: {
  readonly root: string;
  readonly configPresent: boolean;
  readonly configValid: boolean;
}): Promise<WorktreeStateDoctorResultV1> {
  const stale = (message: string): WorktreeStateDoctorResultV1 => deepFreeze({
    classification: "stale_or_malformed_worktree_state" as const,
    ok: false,
    message,
    receiptDigest: null,
  });
  if (!exact(input, ["root", "configPresent", "configValid"]) || typeof input.root !== "string" ||
    typeof input.configPresent !== "boolean" || typeof input.configValid !== "boolean") {
    return stale("Worktree-state inspection input is malformed.");
  }
  let rootHeld: HeldRoot | null = null;
  let shieldHeld: HeldDirectory | null = null;
  try {
    rootHeld = await captureCanonicalRoot(input.root);
    shieldHeld = await holdShieldDirectoryIfPresent(input.root);
    if (shieldHeld === null) {
      return input.configPresent
        ? stale("Existing worktree policy has an unsafe or impossible directory state.")
        : deepFreeze({
          classification: "uninitialized_worktree" as const,
          ok: false,
          message: "No worktree policy is present; run shield worktree prepare with an explicit source, or run shield init for the supported manual fallback.",
          receiptDigest: null,
        });
    }
    const receiptPath = join(input.root, WORKTREE_STATE_RELATIVE_PATH);
    if (!await pathExists(receiptPath)) {
      if (!await directoryChainStillHeld(rootHeld.directories) || !await directoryStillHeld(shieldHeld.path, shieldHeld)) {
        return stale("Worktree policy ancestors changed during inspection.");
      }
      if (!input.configPresent) {
        return deepFreeze({
          classification: "uninitialized_worktree" as const,
          ok: false,
          message: "No worktree policy is present; run shield worktree prepare with an explicit source, or run shield init for the supported manual fallback.",
          receiptDigest: null,
        });
      }
      return input.configValid
        ? deepFreeze({
          classification: "manual_policy_present" as const,
          ok: true,
          message: "Valid manually initialized policy is present; no worktree preparation receipt exists.",
          receiptDigest: null,
        })
        : stale("Existing worktree policy is malformed and no valid preparation receipt is available.");
    }
    const receipt = await readStoredReceiptV1OrV2(input.root);
    const prepared = receipt !== null && input.configPresent && input.configValid
      ? await doctorPreparedReceipt(input.root, receipt, shieldHeld, rootHeld)
      : { valid: false, missionStatePresent: false };
    if (receipt !== null && prepared.valid) {
      return deepFreeze({
        classification: "prepared_worktree",
        ok: true,
        message: prepared.missionStatePresent
          ? "Prepared worktree policy and immutable provenance receipt are exact; mission-local state directories are present."
          : "Prepared worktree policy and immutable provenance receipt are exact.",
        receiptDigest: receipt.receiptDigest,
      });
    }
  } catch {
    return stale("Worktree preparation receipt or an ancestor path is stale, malformed, unsafe, or inaccessible.");
  } finally {
    if (shieldHeld !== null) await shieldHeld.handle.close().catch(() => undefined);
    if (rootHeld !== null) await closeDirectories(rootHeld.directories);
  }
  return stale("Worktree preparation receipt or installed policy is stale, malformed, unsafe, or belongs to another repository.");
}

export function worktreePreparationIsReadyV1(
  result: WorktreePreparationResultV1,
): result is WorktreePreparationReadyV1 | WorktreePreparationAlreadyPreparedV1 {
  return result.state === "ready" || result.state === "already_prepared";
}

export function worktreePreparationIsReadyV2(
  result: WorktreePreparationResultV2,
): result is WorktreePreparationRefreshedV2 | WorktreePreparationAlreadyRefreshedV2 {
  return result.state === "refreshed" || result.state === "already_refreshed";
}

export function worktreePreparationAuthorityV1(_result: WorktreePreparationResultV1): "none" {
  return "none";
}
