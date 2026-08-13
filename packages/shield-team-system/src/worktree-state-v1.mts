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
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";
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
export const WORKTREE_STATE_RELATIVE_PATH = ".shield/worktree-state.json" as const;
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
const IGNORE_BYTES = Buffer.from("/journals/\n/reports/\n/tmp/\n", "utf8");
const SHIELD_DIRECTORY = ".shield" as const;
const LOCK_NAME = ".worktree-prepare.lock" as const;
const TEMP_PREFIX = ".worktree-prepare-" as const;
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

class Blocked extends Error {
  constructor(readonly reasonCode: WorktreePreparationBlockedReasonV1, message: string) {
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
  return { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C" };
}

async function git(root: string, args: readonly string[], allowFailure = false): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", [...args], {
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
): WorktreeStateReceiptBodyV1 {
  return {
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
      [IGNORE_PATH]: sha256(IGNORE_BYTES),
      [CONFIG_PATH]: snapshot.configFile.digest,
      [REGISTRY_PATH]: snapshot.registryFile.digest,
    },
    exclusions: WORKTREE_STATE_EXCLUSIONS,
  };
}

function buildReceipt(body: WorktreeStateReceiptBodyV1): WorktreeStateReceiptV1 {
  return deepFreeze({ ...body, receiptDigest: sha256(canonicalJson(body)) });
}

function receiptBytes(receipt: WorktreeStateReceiptV1): Buffer {
  return Buffer.from(`${canonicalJson(receipt)}\n`, "utf8");
}

function exactArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}

export function validateWorktreeStateReceiptV1(input: unknown): input is WorktreeStateReceiptV1 {
  const fields = [
    "schemaVersion", "contractVersion", "authority", "state", "reasonCode", "summary", "repositoryId",
    "commonGitDirectory", "source", "destination", "policy", "publicBindings", "installedPaths",
    "installedByteDigests", "exclusions", "receiptDigest",
  ] as const;
  if (!exact(input, fields)) return false;
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
  const { receiptDigest, ...body } = input;
  return receiptDigest === sha256(canonicalJson(body));
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

async function validateInstalledReceipt(
  destinationRoot: string,
  receipt: WorktreeStateReceiptV1,
  expectedSnapshot?: SourceSnapshot,
  expectedDestination?: WorktreeGitObservationV1,
): Promise<boolean> {
  if (receipt.destination.root !== destinationRoot || receipt.commonGitDirectory !== receipt.destination.commonGitDirectory ||
    receipt.repositoryId !== receipt.destination.originRepositoryId) return false;
  if (expectedSnapshot !== undefined && (receipt.policy.configByteSha256 !== expectedSnapshot.configFile.digest ||
    receipt.policy.registryByteSha256 !== expectedSnapshot.registryFile.digest ||
    receipt.policy.configSemanticSha256 !== expectedSnapshot.policy.configSemanticSha256 ||
    receipt.policy.registrySemanticSha256 !== expectedSnapshot.policy.registrySemanticSha256)) return false;
  if (expectedDestination !== undefined && (receipt.commonGitDirectory !== expectedDestination.commonGitDirectory ||
    receipt.repositoryId !== expectedDestination.originRepositoryId || receipt.destination.branch !== expectedDestination.branch)) return false;
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
    return config.value.repositoryId === receipt.repositoryId &&
      canonicalJson(registryProjection(registry.value)) === canonicalJson(receipt.publicBindings) &&
      sha256(canonicalJson(config.value)) === receipt.policy.configSemanticSha256 &&
      sha256(canonicalJson(registry.value)) === receipt.policy.registrySemanticSha256 &&
      ignoreBytes.equals(IGNORE_BYTES) &&
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
  await syncDirectory(shieldPath);
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
    await unlink(artifact.path);
    try {
      await lstat(artifact.path);
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
    }
    if ((await artifact.handle.stat()).nlink !== 0) return false;
    await filesystemEvent(dependencies, "before_cleanup_directory_sync", parent);
    await syncDirectory(parent);
    return true;
  } catch {
    return false;
  }
}

async function preflightDestination(
  destinationRoot: string,
  retain: (held: HeldDirectory) => void,
): Promise<WorktreeStateReceiptV1 | null> {
  const held = await holdShieldDirectoryIfPresent(destinationRoot);
  if (held === null) return null;
  retain(held);
  const entries = await readdir(held.path);
  if (!await directoryStillHeld(held.path, held)) {
    throw new Blocked("destination_conflict", "Destination .shield identity changed during preflight.");
  }
  if (entries.includes(LOCK_NAME)) {
    throw new Blocked("preparation_in_progress", "Destination preparation lock is already held.");
  }
  const receiptPresent = entries.includes("worktree-state.json");
  if (receiptPresent) {
    const receipt = await readStoredReceipt(destinationRoot);
    if (receipt === null) throw new Blocked("prepared_state_stale", "Destination worktree receipt is malformed or unsafe.");
    const allowed = new Set([".gitignore", "config.json", "trusted-human-bindings.json", "worktree-state.json"]);
    if (entries.some((entry) => !allowed.has(entry)) || !await validateInstalledReceipt(destinationRoot, receipt)) {
      throw new Blocked("prepared_state_stale", "Destination prepared policy is partial, drifted, or contains conflicting state.");
    }
    return receipt;
  }
  if (entries.length > 0) {
    throw new Blocked("destination_conflict", "Destination .shield contains existing policy, mission, secret, cache, or staging state.");
  }
  return null;
}

async function reobserveStable(
  snapshot: SourceSnapshot,
  source: WorktreeGitObservationV1,
  destination: WorktreeGitObservationV1,
  sourceHeld: HeldRoot,
  destinationHeld: HeldRoot,
  shieldHeld: HeldDirectory | null,
): Promise<boolean> {
  if (!await directoryChainStillHeld(sourceHeld.directories) || !await directoryChainStillHeld(destinationHeld.directories) ||
    !await directoryStillHeld(snapshot.policyDirectory.path, snapshot.policyDirectory) ||
    (shieldHeld !== null && !await directoryStillHeld(shieldHeld.path, shieldHeld)) ||
    !await revalidateCapturedFile(snapshot.configFile) || !await revalidateCapturedFile(snapshot.registryFile)) return false;
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
    const existing = await preflightDestination(destinationRoot, (held) => { shieldHeld = held; });
    if (existing !== null) {
      if (!await validateInstalledReceipt(destinationRoot, existing, snapshot, observed.destination)) {
        throw new Blocked("prepared_state_stale", "Existing receipt does not match current source policy or repository identity.");
      }
      await dependencies.phase?.("before_replay_ready");
      if (!await reobserveStable(snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld) ||
        !await validateInstalledReceipt(destinationRoot, existing, snapshot, observed.destination)) {
        throw new Blocked("source_policy_drift", "Source policy, repository, or prepared destination changed before replay success.");
      }
      outcome = success("already_prepared", existing);
    } else {
      await dependencies.phase?.("before_destination_mutation");
      if (!await reobserveStable(snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld)) {
        throw new Blocked("source_policy_drift", "Source policy or repository state changed before destination mutation.");
      }
      const rootHeld = destinationHeld.directories.at(-1);
      if (rootHeld === undefined) throw new Error("Destination root descriptor was not retained.");
      const shield = await ensureShieldDirectory(destinationRoot, rootHeld, shieldHeld, () => { shieldCreated = true; });
      shieldHeld = shield.held;
      if (!await directoryChainStillHeld(destinationHeld.directories) || !await directoryStillHeld(join(destinationRoot, SHIELD_DIRECTORY), shieldHeld)) {
        throw new Blocked("destination_conflict", "Destination directory identity changed during preparation.");
      }
      const shieldPath = join(destinationRoot, SHIELD_DIRECTORY);
      const token = Buffer.from(`${process.pid}:${randomBytes(24).toString("hex")}\n`, "utf8");
      heldLock = await acquireLock(shieldPath, token, dependencies, (lock) => { heldLock = lock; });
      await dependencies.phase?.("lock_acquired");
      if ((await readdir(shieldPath)).some((entry) => entry !== LOCK_NAME)) {
        throw new Blocked("destination_conflict", "Destination state changed before materialization.");
      }
      if (!await reobserveStable(snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld)) {
        throw new Blocked("source_policy_drift", "Source policy or Git observations changed before staging.");
      }
      expectedReceipt = buildReceipt(receiptBody(snapshot, observed.source, observed.destination));
      const nonce = dependencies.nonce?.() ?? randomBytes(16).toString("hex");
      if (!/^[A-Za-z0-9_-]{8,128}$/u.test(nonce)) throw new Error("Invalid preparation nonce.");
      const installs: readonly { relative: string; bytes: Buffer }[] = [
        { relative: IGNORE_PATH, bytes: IGNORE_BYTES },
        { relative: CONFIG_PATH, bytes: snapshot.configFile.bytes },
        { relative: REGISTRY_PATH, bytes: snapshot.registryFile.bytes },
        { relative: WORKTREE_STATE_RELATIVE_PATH, bytes: receiptBytes(expectedReceipt) },
      ];
      for (let index = 0; index < installs.length; index += 1) {
        const temporaryPath = join(shieldPath, `${TEMP_PREFIX}${nonce}-${index}.tmp`);
        await createTemporary(temporaryPath, installs[index]!.bytes, dependencies, (temporary) => { temporaryFiles.push(temporary); });
      }
      await syncDirectory(shieldPath);
      await dependencies.phase?.("temporaries_synced");
      if (!await lockOwned(heldLock) || !await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld,
      )) {
        throw new Blocked("source_policy_drift", "Retained source, repository, destination, or lock identity changed before installation.");
      }
      await dependencies.phase?.("before_install");
      if (!await lockOwned(heldLock) || !await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld,
      )) {
        throw new Blocked("source_policy_drift", "Retained state changed at the installation boundary.");
      }
      for (let index = 0; index < installs.length; index += 1) {
        const finalPath = join(destinationRoot, installs[index]!.relative);
        const temporary = temporaryFiles[index]!;
        if (!await temporaryStillExact(temporary)) throw new Error("Temporary file changed before installation.");
        installationUncertain = true;
        try { await link(temporary.path, finalPath); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST" && installedCount === 0) {
            installationUncertain = false;
            throw new Blocked("destination_conflict", "A destination policy path appeared during installation.");
          }
          throw error;
        }
        installedCount += 1;
        await syncDirectory(shieldPath);
        await unlink(temporary.path);
        temporary.installed = true;
        await syncDirectory(shieldPath);
        const installed = await readNoFollowRegular(finalPath);
        if (!installed.equals(installs[index]!.bytes)) throw new Error("Installed file readback mismatch.");
      }
      installationUncertain = false;
      await dependencies.phase?.("after_install");
      if (!await lockOwned(heldLock) || !await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld,
      ) || !await validateInstalledReceipt(destinationRoot, expectedReceipt, snapshot, observed.destination)) {
        throw new Error("Post-installation revalidation failed.");
      }
      await dependencies.phase?.("before_ready");
      if (!await lockOwned(heldLock) || !await reobserveStable(
        snapshot, observed.source, observed.destination, sourceHeld, destinationHeld, shieldHeld,
      ) || !await validateInstalledReceipt(destinationRoot, expectedReceipt, snapshot, observed.destination)) {
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
    if (shieldHeld !== null) await shieldHeld.handle.close().catch(() => { cleanupUncertain = true; });
    await closeSnapshot(snapshot);
    if (destinationHeld !== null && !await closeDirectories(destinationHeld.directories)) cleanupUncertain = true;
    if (sourceHeld !== null && !await closeDirectories(sourceHeld.directories)) cleanupUncertain = true;
  }
  if (cleanupUncertain) return recovery(sourceRoot, destinationRoot, installedCount === 4 ? expectedReceipt : null);
  return outcome ?? blocked("operation_failed", "Preparation did not produce a closed result.", sourceRoot, destinationRoot);
}

async function doctorPreparedReceipt(root: string, receipt: WorktreeStateReceiptV1): Promise<boolean> {
  if (!await validateInstalledReceipt(root, receipt)) return false;
  try {
    const observation = await observeGitRoot(root);
    const listing = await git(root, ["worktree", "list", "--porcelain"]);
    const registered = listing?.split("\n").filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length)).includes(root) ?? false;
    return registered && observation.commonGitDirectory === receipt.commonGitDirectory &&
      observation.originRepositoryId === receipt.repositoryId;
  } catch {
    return false;
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
    const receipt = await readStoredReceipt(input.root);
    if (receipt !== null && input.configPresent && input.configValid && await doctorPreparedReceipt(input.root, receipt) &&
      await directoryChainStillHeld(rootHeld.directories) && await directoryStillHeld(shieldHeld.path, shieldHeld)) {
      return deepFreeze({
        classification: "prepared_worktree",
        ok: true,
        message: "Prepared worktree policy and immutable provenance receipt are exact.",
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

export function worktreePreparationAuthorityV1(_result: WorktreePreparationResultV1): "none" {
  return "none";
}
