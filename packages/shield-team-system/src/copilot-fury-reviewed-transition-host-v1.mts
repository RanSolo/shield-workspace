import { execFile as execFileNode } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isProxy } from "node:util/types";

import { validateTransitionPlanV1OrV2, type TransitionPlanV1OrV2 } from "@shield/mission-preparation";

import {
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS,
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS,
  COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
  COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2,
  COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
  COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF,
  COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
  COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS,
  dispatchCopilotFuryPlanReviewV1,
  parseCopilotAgentCardV1,
  validateCopilotFuryPlanDispatchRequestV1,
  validateCopilotFuryPlanDispatchRequestV2,
  type CopilotFuryPlanDispatchDependenciesV1,
  type CopilotFuryPlanDispatchRequestV1,
  type CopilotFuryPlanDispatchRequestV2,
  type CopilotFuryPlanDispatchRequestV1OrV2,
  type CopilotFuryPlanDispatchResultV1,
} from "./copilot-fury-plan-dispatch-v1.mjs";
import {
  dispatchCopilotFuryPlanReviewCoreV1,
  type InternalDerivedTransitionPlanSourceV1,
} from "./copilot-fury-plan-dispatch-core-v1.mjs";
import { parseShieldConfig } from "./config.mjs";
import {
  materializeReviewedMissionTransitionV1,
  resolveSeatDispatchIdentityByReceiptIdV1,
  validateMissionTransitionPlanReviewV1,
  type MaterializeReviewedMissionTransitionResultV1,
  type MissionTransitionPlanReviewV1,
} from "./mission-preparation-host-v1.mjs";
import { journalByteSha256, readMissionJournalForDisplay, resolveSupervisedMissionPaths } from "./mission-store.mjs";
import { canonicalJson } from "./mission-v2.mjs";
import { readSeatDispatchReceiptLedgerSnapshotV1 } from "./seat-dispatch-store.mjs";
import type { SeatDispatchReceiptIdentityV1, SeatDispatchReceiptProjectionV1 } from "./seat-dispatch-receipt-v1.mjs";
import {
  validateWorktreeStateReceiptFileChainV1OrV2,
  validateWorktreeStateReceiptV1OrV2,
  type WorktreeStateReceiptV1OrV2,
} from "./worktree-state-v1.mjs";

export const COPILOT_FURY_REVIEWED_TRANSITION_HOST_CONTRACT_VERSION = "shield.copilot-fury-reviewed-transition-host.v1" as const;
export const COPILOT_FURY_REVIEWED_TRANSITION_SEED_CONTRACT_VERSION = "shield.copilot-fury-reviewed-transition-seed.v1" as const;
export const COPILOT_FURY_REVIEWED_TRANSITION_DERIVED_SEED_CONTRACT_VERSION = "shield.copilot-fury-reviewed-transition-seed.v2" as const;
export const COPILOT_FURY_REVIEWED_TRANSITION_ARCHITECTURE_PLAN_SEED_CONTRACT_VERSION_V2 = "shield.copilot-fury-reviewed-transition-seed.v3" as const;
export const COPILOT_FURY_REVIEWED_TRANSITION_DERIVED_ARCHITECTURE_PLAN_SEED_CONTRACT_VERSION_V2 = "shield.copilot-fury-reviewed-transition-seed.v4" as const;
export const COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT = ".shield/audit/copilot-fury-reviewed-transition" as const;
export const COPILOT_FURY_REVIEWED_TRANSITION_REPAIR_LIMIT = 1 as const;

const INPUT_FIELDS = ["missionId", "repositoryRoot", "transitionPlanPath", "furyModel"] as const;
const SEED_V1_FIELDS = [
  "schemaVersion", "contractVersion", "authority", "logicalOperation", "preparedWorktree", "furyCard", "missionJournal", "request",
] as const;
const SEED_V2_FIELDS = [
  "schemaVersion", "contractVersion", "authority", "logicalOperation", "preparedWorktree", "furyCard", "missionJournal", "transitionPlanSource", "request",
] as const;
const SEED_V3_FIELDS = SEED_V1_FIELDS;
const SEED_V4_FIELDS = SEED_V2_FIELDS;
const LOGICAL_OPERATION_FIELDS = [
  "repositoryId", "repositoryWorkspaceId", "missionId", "missionRevision", "parentSessionId", "transitionPlanId", "transitionPlanDigest",
] as const;
const LOGICAL_OPERATION_FIELDS_V2 = [...LOGICAL_OPERATION_FIELDS, "repositoryRevision", "requestContractVersion", "reviewPhase"] as const;
const PREPARED_WORKTREE_FIELDS = ["receiptDigest", "receiptRawSha256", "laneBranch"] as const;
const FURY_CARD_FIELDS = ["logicalRef", "rawSha256", "repositoryRevision"] as const;
const MISSION_JOURNAL_FIELDS = ["sequence", "digest"] as const;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const SEED_INSTALL_WAIT_ATTEMPTS = 100;
const SEED_INSTALL_WAIT_INTERVAL_MS = 5;
const DISPATCH_LOCK_WAIT_MS = 5_000;
const SEED_COMPLETION_FILE = "request-seed.complete";
const SEED_COMPLETING_FILE = "request-seed.completing";
const GIT_CONTEXT_VARIABLES = Object.freeze([
  "GIT_COMMON_DIR", "GIT_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_WORK_TREE",
] as const);

type Plain = Record<string, unknown>;
type StableFile = Readonly<{
  path: string;
  bytes: string;
  rawSha256: string;
  identity: string;
}>;

type DirectoryIdentity = Readonly<{
  path: string;
  dev: number;
  ino: number;
}>;

type DirectoryChain = readonly DirectoryIdentity[];

export interface CopilotFuryReviewedTransitionSeedPersistenceV1 {
  readonly mkdirPath: (path: string, mode: number) => Promise<void>;
  readonly lstatPath: typeof lstat;
  readonly realpathPath: typeof realpath;
  readonly openPath: typeof open;
  readonly linkPath: typeof link;
  readonly unlinkPath: typeof unlink;
  readonly writeFileHandle: (handle: FileHandle, bytes: Uint8Array) => Promise<number>;
  readonly syncFileHandle: (handle: FileHandle) => Promise<void>;
  readonly syncDirectoryHandle: (handle: FileHandle) => Promise<void>;
}

export interface PrepareReviewedMissionTransitionInputV1 {
  readonly missionId: string;
  readonly repositoryRoot: string;
  readonly transitionPlanPath: string;
  readonly furyModel: string;
}

export interface CopilotFuryReviewedTransitionSeedV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof COPILOT_FURY_REVIEWED_TRANSITION_SEED_CONTRACT_VERSION;
  readonly authority: "none";
  readonly logicalOperation: Readonly<{
    repositoryId: string;
    repositoryWorkspaceId: string;
    missionId: string;
    missionRevision: string;
    parentSessionId: string;
    transitionPlanId: string;
    transitionPlanDigest: string;
  }>;
  readonly preparedWorktree: Readonly<{
    receiptDigest: string;
    receiptRawSha256: string;
    laneBranch: string;
  }>;
  readonly furyCard: Readonly<{
    logicalRef: typeof COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF;
    rawSha256: string;
    repositoryRevision: string;
  }>;
  readonly missionJournal: Readonly<{ sequence: number; digest: string }>;
  readonly request: CopilotFuryPlanDispatchRequestV1;
}

export interface CopilotFuryReviewedTransitionSeedV2 extends Omit<CopilotFuryReviewedTransitionSeedV1, "schemaVersion" | "contractVersion"> {
  readonly schemaVersion: 2;
  readonly contractVersion: typeof COPILOT_FURY_REVIEWED_TRANSITION_DERIVED_SEED_CONTRACT_VERSION;
  readonly transitionPlanSource: InternalDerivedTransitionPlanSourceV1;
}

type CopilotFuryReviewedTransitionLogicalOperationV2 = Readonly<{
  repositoryId: string;
  repositoryWorkspaceId: string;
  missionId: string;
  missionRevision: string;
  parentSessionId: string;
  transitionPlanId: string;
  transitionPlanDigest: string;
  repositoryRevision: string;
  requestContractVersion: typeof COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2;
  reviewPhase: typeof COPILOT_FURY_PLAN_REVIEW_PHASE_V2;
}>;

export interface CopilotFuryReviewedTransitionSeedV3 extends Omit<CopilotFuryReviewedTransitionSeedV1, "schemaVersion" | "contractVersion" | "logicalOperation" | "request"> {
  readonly schemaVersion: 3;
  readonly contractVersion: typeof COPILOT_FURY_REVIEWED_TRANSITION_ARCHITECTURE_PLAN_SEED_CONTRACT_VERSION_V2;
  readonly logicalOperation: CopilotFuryReviewedTransitionLogicalOperationV2;
  readonly request: CopilotFuryPlanDispatchRequestV2;
}

export interface CopilotFuryReviewedTransitionSeedV4 extends Omit<CopilotFuryReviewedTransitionSeedV3, "schemaVersion" | "contractVersion"> {
  readonly schemaVersion: 4;
  readonly contractVersion: typeof COPILOT_FURY_REVIEWED_TRANSITION_DERIVED_ARCHITECTURE_PLAN_SEED_CONTRACT_VERSION_V2;
  readonly transitionPlanSource: InternalDerivedTransitionPlanSourceV1;
}

export type CopilotFuryReviewedTransitionSeedV1OrV2 = CopilotFuryReviewedTransitionSeedV1 | CopilotFuryReviewedTransitionSeedV2;
export type CopilotFuryReviewedTransitionSeedV1ToV4 = CopilotFuryReviewedTransitionSeedV1OrV2 | CopilotFuryReviewedTransitionSeedV3 | CopilotFuryReviewedTransitionSeedV4;

export type PrepareReviewedMissionTransitionClosedResultV1 = Readonly<{
  contractVersion: typeof COPILOT_FURY_REVIEWED_TRANSITION_HOST_CONTRACT_VERSION;
  authority: "none";
  state: "invalid" | "conflict" | "recovery_required";
  code: string;
  errors: readonly string[];
}>;

export type PrepareReviewedMissionTransitionResultV1 =
  | MaterializeReviewedMissionTransitionResultV1
  | CopilotFuryPlanDispatchResultV1
  | PrepareReviewedMissionTransitionClosedResultV1;

export interface CopilotFuryReviewedTransitionHostDependenciesV1 {
  readonly dispatchPlanReview?: typeof dispatchCopilotFuryPlanReviewV1;
  readonly dispatchDerivedPlanReview?: typeof dispatchCopilotFuryPlanReviewCoreV1;
  readonly dispatchDependencies?: CopilotFuryPlanDispatchDependenciesV1;
  readonly resolveDispatchIdentity?: typeof resolveSeatDispatchIdentityByReceiptIdV1;
  readonly readDispatchLedgerSnapshot?: typeof readSeatDispatchReceiptLedgerSnapshotV1;
  readonly materializeReviewedTransition?: typeof materializeReviewedMissionTransitionV1;
  readonly seedPersistence?: Partial<CopilotFuryReviewedTransitionSeedPersistenceV1>;
  readonly now?: () => Date;
  readonly beforeDispatch?: () => void | Promise<void>;
  readonly afterDispatch?: (result: CopilotFuryPlanDispatchResultV1) => void | Promise<void>;
  readonly beforeMaterialization?: () => void | Promise<void>;
}

export type InternalDerivedTransitionPlanRederiverV1 = () => Promise<InternalDerivedTransitionPlanSourceV1>;

type HostObservation = Readonly<{
  transitionPlanSource: Readonly<{ kind: "committed_file"; transitionPlanPath: string; transitionPlanRawSha256: string }> | InternalDerivedTransitionPlanSourceV1;
  repositoryRoot: string;
  rootIdentity: string;
  repositoryId: string;
  repositoryWorkspaceId: string;
  branch: string;
  headRevision: string;
  planningBaseRevision: string;
  policyIdentity: string;
  preparedWorktreeReceipt: WorktreeStateReceiptV1OrV2;
  preparedWorktreeFile: StableFile;
  missionRevision: string;
  subjectId: string;
  journalSequence: number;
  journalDigest: string;
  journalFile: StableFile;
  transitionPlan: TransitionPlanV1OrV2;
  transitionPlanFile: StableFile;
  parentPlanRawSha256: string;
  furyCardFile: StableFile;
}>;

type SeedResolution = Readonly<{
  seed: CopilotFuryReviewedTransitionSeedV1ToV4;
  file: StableFile;
  completionFile: StableFile;
  relativePath: string;
  directoryChain: DirectoryChain;
}>;

type SecureHandoffFile = Readonly<{
  file: StableFile;
  directoryChain: DirectoryChain;
}>;

function plain(value: unknown): value is Plain {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function exact(value: unknown, fields: readonly string[]): value is Plain {
  if (!plain(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length && keys.every((key) => typeof key === "string" && fields.includes(key)) && fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
  });
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function digestId(domain: string, value: unknown): string {
  return createHash("sha256").update(`${domain}\0${canonicalJson(value)}`).digest("base64url");
}

function assertDerivedSourceProvenanceDigest(source: InternalDerivedTransitionPlanSourceV1): void {
  const expectedDigest = `sha256:${digestId("shield-legacy-derived-transition-plan-provenance-v1", source.provenance)}`;
  const expectedPath = `.shield/audit/legacy-reviewed-transition/${expectedDigest}/transition-plan.json`;
  if (source.provenanceDigest !== expectedDigest || source.virtualPath !== expectedPath ||
      source.canonicalPlanBytes !== `${canonicalJson(source.transitionPlan)}\n` ||
      source.transitionPlanRawSha256 !== sha256(source.canonicalPlanBytes)) {
    throw new Error("legacy_derived_provenance_digest_mismatch");
  }
}

function closed(state: PrepareReviewedMissionTransitionClosedResultV1["state"], code: string, ...errors: readonly string[]): PrepareReviewedMissionTransitionClosedResultV1 {
  return Object.freeze({
    contractVersion: COPILOT_FURY_REVIEWED_TRANSITION_HOST_CONTRACT_VERSION,
    authority: "none" as const,
    state,
    code,
    errors: Object.freeze(errors.length > 0 ? [...errors] : [code]),
  });
}

function normalizedRelativePath(value: unknown): value is string {
  return typeof value === "string" && value !== "" && !value.includes("\0") && !value.includes("\\") && !isAbsolute(value) &&
    value.split("/").every((component) => component !== "" && component !== "." && component !== "..");
}

function cleanGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, GIT_NO_REPLACE_OBJECTS: "1", GIT_OPTIONAL_LOCKS: "0", LANG: "C", LC_ALL: "C" };
  for (const name of GIT_CONTEXT_VARIABLES) delete environment[name];
  return environment;
}

function git(root: string, args: readonly string[]): Promise<string> {
  return new Promise((resolveValue, reject) => {
    execFileNode("git", ["--no-replace-objects", "-C", root, ...args], {
      encoding: "utf8", timeout: 15_000, maxBuffer: MAX_FILE_BYTES, shell: false, env: cleanGitEnvironment(),
    }, (error, stdout) => error ? reject(error) : resolveValue(stdout));
  });
}

function gitBytes(root: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolveValue, reject) => {
    execFileNode("git", ["--no-replace-objects", "-C", root, ...args], {
      encoding: "buffer", timeout: 15_000, maxBuffer: MAX_FILE_BYTES, shell: false, env: cleanGitEnvironment(),
    }, (error, stdout) => error ? reject(error) : resolveValue(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)));
  });
}

async function stableFile(path: string, label: string, allowEmpty = false): Promise<StableFile> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (!allowEmpty && before.size < 1) || before.size > MAX_FILE_BYTES) {
    throw new Error(`${label}_unsafe_file`);
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error(`${label}_identity_changed`);
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathAfter = await lstat(path);
    if (opened.dev !== after.dev || opened.ino !== after.ino || opened.size !== after.size || after.nlink !== 1 ||
        pathAfter.isSymbolicLink() || !pathAfter.isFile() || pathAfter.nlink !== 1 || pathAfter.dev !== opened.dev || pathAfter.ino !== opened.ino || pathAfter.size !== opened.size) {
      throw new Error(`${label}_identity_changed`);
    }
    return Object.freeze({
      path,
      bytes,
      rawSha256: sha256(bytes),
      identity: `${opened.dev}:${opened.ino}:${opened.size}:${opened.mtimeMs}:${opened.ctimeMs}`,
    });
  } finally {
    await handle.close();
  }
}

const DEFAULT_SEED_PERSISTENCE: CopilotFuryReviewedTransitionSeedPersistenceV1 = Object.freeze({
  mkdirPath: async (path: string, mode: number) => mkdir(path, { mode }),
  lstatPath: lstat,
  realpathPath: realpath,
  openPath: open,
  linkPath: link,
  unlinkPath: unlink,
  writeFileHandle: async (handle: FileHandle, bytes: Uint8Array) => {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = await handle.write(bytes, offset, bytes.byteLength - offset, null);
      if (written.bytesWritten < 1) break;
      offset += written.bytesWritten;
    }
    return offset;
  },
  syncFileHandle: async (handle: FileHandle) => handle.sync(),
  syncDirectoryHandle: async (handle: FileHandle) => handle.sync(),
});

function seedPersistence(
  overrides: Partial<CopilotFuryReviewedTransitionSeedPersistenceV1> | undefined,
): CopilotFuryReviewedTransitionSeedPersistenceV1 {
  return Object.freeze({ ...DEFAULT_SEED_PERSISTENCE, ...overrides });
}

async function openVerifiedDirectory(
  path: string,
  label: string,
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1 = DEFAULT_SEED_PERSISTENCE,
): Promise<{ handle: FileHandle; identity: DirectoryIdentity }> {
  const before = await operations.lstatPath(path);
  if (!before.isDirectory() || before.isSymbolicLink() || (before.mode & 0o22) !== 0) throw new Error(`${label}_unsafe_directory`);
  const handle = await operations.openPath(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    const after = await operations.lstatPath(path);
    if (!opened.isDirectory() || after.isSymbolicLink() || !after.isDirectory() || opened.dev !== before.dev || opened.ino !== before.ino ||
        after.dev !== opened.dev || after.ino !== opened.ino || await operations.realpathPath(path) !== path) {
      throw new Error(`${label}_directory_identity_changed`);
    }
    return { handle, identity: Object.freeze({ path, dev: opened.dev, ino: opened.ino }) };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function directoryChain(
  root: string,
  directory: string,
  label: string,
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1 = DEFAULT_SEED_PERSISTENCE,
): Promise<DirectoryChain> {
  const relation = relative(root, directory);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error(`${label}_directory_escape`);
  const paths = [root];
  let current = root;
  if (relation !== "") {
    for (const component of relation.split(sep)) {
      if (component === "" || component === "." || component === "..") throw new Error(`${label}_directory_path_invalid`);
      current = join(current, component);
      paths.push(current);
    }
  }
  const identities: DirectoryIdentity[] = [];
  for (const path of paths) {
    const verified = await openVerifiedDirectory(path, label, operations);
    identities.push(verified.identity);
    await verified.handle.close();
  }
  for (let index = 0; index < paths.length; index += 1) {
    const verified = await openVerifiedDirectory(paths[index] as string, label, operations);
    try {
      const expected = identities[index] as DirectoryIdentity;
      if (verified.identity.dev !== expected.dev || verified.identity.ino !== expected.ino) throw new Error(`${label}_directory_identity_changed`);
    } finally {
      await verified.handle.close();
    }
  }
  return Object.freeze(identities);
}

function sameDirectoryChain(left: DirectoryChain, right: DirectoryChain): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

async function committedFile(root: string, revision: string, relativePath: string, label: string): Promise<{ file: StableFile; objectId: string }> {
  if (!normalizedRelativePath(relativePath)) throw new Error(`${label}_path_invalid`);
  const file = await stableFile(join(root, ...relativePath.split("/")), label);
  const listing = await gitBytes(root, ["ls-tree", "-z", "--full-tree", revision, "--", relativePath]);
  const records = listing.toString("utf8").split("\0").filter(Boolean);
  if (records.length !== 1) throw new Error(`${label}_head_entry_missing_or_ambiguous`);
  const match = /^(100644|100755) blob ([0-9a-f]{40,64})\t(.+)$/u.exec(records[0] as string);
  if (match === null || match[3] !== relativePath) throw new Error(`${label}_head_entry_not_regular`);
  const headBytes = await gitBytes(root, ["cat-file", "blob", match[2] as string]);
  if (!headBytes.equals(Buffer.from(file.bytes, "utf8"))) throw new Error(`${label}_worktree_head_mismatch`);
  return { file, objectId: match[2] as string };
}

async function exactGitBlobIdentity(root: string, revision: string, relativePath: string, label: string): Promise<Readonly<{
  mode: "100644" | "100755";
  objectId: string;
}>> {
  const listing = await gitBytes(root, ["ls-tree", "-z", "--full-tree", revision, "--", relativePath]);
  const records = listing.toString("utf8").split("\0").filter(Boolean);
  if (records.length !== 1) throw new Error(`${label}_entry_missing_or_ambiguous`);
  const match = /^(100644|100755) blob ([0-9a-f]{40,64})\t(.+)$/u.exec(records[0] as string);
  if (match === null || match[3] !== relativePath) throw new Error(`${label}_entry_not_regular`);
  return Object.freeze({ mode: match[1] as "100644" | "100755", objectId: match[2] as string });
}

function repositoryIdFromRemote(remote: string): string | null {
  const value = remote.trim().replace(/\.git$/u, "");
  const match = /^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/\s]+\/[^/\s]+)$/iu.exec(value);
  return match?.[1] ?? null;
}

async function observeHost(input: PrepareReviewedMissionTransitionInputV1, derivedSource?: InternalDerivedTransitionPlanSourceV1): Promise<HostObservation> {
  const canonicalRoot = await realpath(input.repositoryRoot);
  if (canonicalRoot !== input.repositoryRoot) throw new Error("repository_root_not_canonical");
  const rootStats = await lstat(canonicalRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error("repository_root_unsafe");
  if (resolve((await git(canonicalRoot, ["rev-parse", "--show-toplevel"])).trim()) !== canonicalRoot) throw new Error("repository_root_mismatch");
  const branch = (await git(canonicalRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  const headRevision = (await git(canonicalRoot, ["rev-parse", "--verify", "HEAD"])).trim();
  if (!REVISION.test(headRevision) || branch === "") throw new Error("repository_head_or_branch_invalid");
  if ((await git(canonicalRoot, ["status", "--porcelain=v1", "--untracked-files=all"])).trim() !== "") throw new Error("workspace_dirty");

  const configFile = await stableFile(join(canonicalRoot, ".shield", "config.json"), "shield_config");
  const parsedConfig = parseShieldConfig(configFile.bytes);
  if (parsedConfig.state === "invalid") throw new Error("shield_config_invalid");
  const remoteRepositoryId = repositoryIdFromRemote(await git(canonicalRoot, ["config", "--get", "remote.origin.url"]));
  if (remoteRepositoryId === null || remoteRepositoryId !== parsedConfig.value.repositoryId) throw new Error("repository_identity_mismatch");

  const preparedWorktreeFile = await stableFile(join(canonicalRoot, ".shield", "worktree-state.json"), "prepared_worktree_receipt");
  let preparedWorktreeReceipt: unknown;
  try { preparedWorktreeReceipt = JSON.parse(preparedWorktreeFile.bytes); } catch { throw new Error("prepared_worktree_receipt_malformed"); }
  if (!validateWorktreeStateReceiptV1OrV2(preparedWorktreeReceipt) ||
      !await validateWorktreeStateReceiptFileChainV1OrV2(canonicalRoot, preparedWorktreeReceipt) ||
      preparedWorktreeReceipt.repositoryId !== parsedConfig.value.repositoryId ||
      preparedWorktreeReceipt.destination.root !== canonicalRoot || preparedWorktreeReceipt.destination.branch !== branch ||
      preparedWorktreeReceipt.destination.head !== headRevision ||
      preparedWorktreeReceipt.installedByteDigests[".shield/config.json"] !== configFile.rawSha256 ||
      preparedWorktreeReceipt.policy.configByteSha256 !== configFile.rawSha256) throw new Error("prepared_worktree_receipt_mismatch");
  const ignoreFile = await stableFile(join(canonicalRoot, ".shield", ".gitignore"), "prepared_worktree_ignore");
  const registryFile = await stableFile(join(canonicalRoot, ".shield", "trusted-human-bindings.json"), "prepared_worktree_registry");
  if (preparedWorktreeReceipt.installedByteDigests[".shield/.gitignore"] !== ignoreFile.rawSha256 ||
      preparedWorktreeReceipt.installedByteDigests[".shield/trusted-human-bindings.json"] !== registryFile.rawSha256 ||
      preparedWorktreeReceipt.policy.registryByteSha256 !== registryFile.rawSha256) throw new Error("prepared_worktree_policy_mismatch");
  const rawCommonDirectory = (await git(canonicalRoot, ["rev-parse", "--git-common-dir"])).trim();
  const commonDirectory = await realpath(isAbsolute(rawCommonDirectory) ? rawCommonDirectory : resolve(canonicalRoot, rawCommonDirectory));
  if (preparedWorktreeReceipt.commonGitDirectory !== commonDirectory || preparedWorktreeReceipt.destination.commonGitDirectory !== commonDirectory ||
      preparedWorktreeReceipt.destination.originRepositoryId !== parsedConfig.value.repositoryId) throw new Error("prepared_worktree_lane_mismatch");
  const registeredRoots = (await git(canonicalRoot, ["worktree", "list", "--porcelain"])).split("\n")
    .filter((line) => line.startsWith("worktree ")).map((line) => resolve(line.slice("worktree ".length)));
  if (!registeredRoots.includes(canonicalRoot)) throw new Error("prepared_worktree_unregistered");

  let transitionPlanFile: StableFile;
  let transitionPlanSource: HostObservation["transitionPlanSource"];
  let rawPlan: unknown;
  if (derivedSource === undefined) {
    const planEntry = await committedFile(canonicalRoot, headRevision, input.transitionPlanPath, "transition_plan");
    transitionPlanFile = planEntry.file;
    transitionPlanSource = Object.freeze({
      kind: "committed_file",
      transitionPlanPath: input.transitionPlanPath,
      transitionPlanRawSha256: planEntry.file.rawSha256,
    });
    try { rawPlan = JSON.parse(planEntry.file.bytes); } catch { throw new Error("transition_plan_malformed_json"); }
  } else {
    if (input.transitionPlanPath !== derivedSource.virtualPath || derivedSource.kind !== "legacy_derived" ||
        derivedSource.canonicalPlanBytes !== `${canonicalJson(derivedSource.transitionPlan)}\n` ||
        sha256(derivedSource.canonicalPlanBytes) !== derivedSource.transitionPlanRawSha256) throw new Error("legacy_derived_source_binding_mismatch");
    transitionPlanSource = derivedSource;
    transitionPlanFile = Object.freeze({
      path: derivedSource.virtualPath,
      bytes: derivedSource.canonicalPlanBytes,
      rawSha256: derivedSource.transitionPlanRawSha256,
      identity: `legacy-derived:${derivedSource.provenanceDigest}:${derivedSource.transitionPlanRawSha256}`,
    });
    try { rawPlan = JSON.parse(derivedSource.canonicalPlanBytes); } catch { throw new Error("transition_plan_malformed_json"); }
  }
  const validatedPlan = validateTransitionPlanV1OrV2({ artifact: rawPlan });
  if (validatedPlan.state === "invalid") throw new Error(`transition_plan_invalid:${validatedPlan.errors.join(" ")}`);
  const transitionPlan = validatedPlan.value;
  if (transitionPlan.missionId !== input.missionId || transitionPlan.repositoryId !== parsedConfig.value.repositoryId ||
      (derivedSource !== undefined && canonicalJson(transitionPlan) !== canonicalJson(derivedSource.transitionPlan))) throw new Error("transition_plan_binding_mismatch");
  await git(canonicalRoot, ["merge-base", "--is-ancestor", transitionPlan.planningBaseRevision, headRevision]);
  await git(canonicalRoot, ["merge-base", "--is-ancestor", transitionPlan.parentPlanCommit, headRevision]);
  const parentPlanBytes = await gitBytes(canonicalRoot, ["show", `${transitionPlan.parentPlanCommit}:${transitionPlan.parentPlanPath}`]);
  if (sha256(parentPlanBytes) !== transitionPlan.parentPlanRawSha256) throw new Error("parent_plan_binding_mismatch");

  const journalPaths = resolveSupervisedMissionPaths(canonicalRoot, parsedConfig.value.paths.journals, input.missionId);
  if (journalPaths.state === "invalid") throw new Error("mission_journal_path_invalid");
  const journalFile = await stableFile(journalPaths.value.journalPath, "mission_journal");
  const displayed = await readMissionJournalForDisplay({
    repositoryRoot: canonicalRoot,
    configuredJournalPath: parsedConfig.value.paths.journals,
    missionId: input.missionId,
  });
  if (displayed.state === "invalid" || displayed.value.kind !== "profile-aware") throw new Error("mission_journal_invalid");
  const projection = displayed.value.projection;
  if (projection.missionId !== input.missionId || projection.brief.subjectId !== transitionPlan.subjectId ||
      projection.execution === "completed" || projection.finalAcceptance === "accepted") throw new Error("mission_projection_mismatch_or_terminal");

  const cardEntry = await committedFile(canonicalRoot, headRevision, COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF, "repository_fury_card");
  const card = parseCopilotAgentCardV1(cardEntry.file.bytes);
  if (card.frontmatter.name.toLocaleLowerCase("en-US") !== "fury") throw new Error("repository_fury_card_seat_mismatch");

  const repositoryWorkspaceId = `workspace:reviewed-transition:${digestId("shield-reviewed-transition-workspace-v1", {
    repositoryId: parsedConfig.value.repositoryId,
    laneBranch: preparedWorktreeReceipt.destination.branch,
  }).slice(0, 32)}`;
  if (derivedSource !== undefined) {
    const provenance = derivedSource.provenance;
    const artifactPlan = await exactGitBlobIdentity(canonicalRoot, provenance.artifactCommit, provenance.legacyPlanPath, "legacy_artifact_plan");
    const currentPlan = await exactGitBlobIdentity(canonicalRoot, headRevision, provenance.legacyPlanPath, "legacy_current_plan");
    if (provenance.repositoryId !== parsedConfig.value.repositoryId || provenance.repositoryRoot !== canonicalRoot ||
        provenance.repositoryWorkspaceId !== repositoryWorkspaceId || provenance.missionId !== input.missionId ||
        provenance.missionRevision !== projection.brief.revisionId || provenance.journalSequence !== projection.lastSequence ||
        provenance.journalDigest !== journalByteSha256(journalFile.bytes) || provenance.branch !== branch || provenance.headRevision !== headRevision ||
        provenance.derivedCandidateDigest !== transitionPlan.digest || provenance.artifactCommit !== transitionPlan.parentPlanCommit ||
        provenance.legacyPlanPath !== transitionPlan.parentPlanPath || provenance.legacyPlanBlobSha256 !== transitionPlan.parentPlanRawSha256 ||
        provenance.artifactPlanMode !== artifactPlan.mode || provenance.artifactPlanObjectId !== artifactPlan.objectId ||
        provenance.currentPlanMode !== currentPlan.mode || provenance.currentPlanObjectId !== currentPlan.objectId ||
        artifactPlan.mode !== currentPlan.mode || artifactPlan.objectId !== currentPlan.objectId) {
      throw new Error("legacy_derived_provenance_host_mismatch");
    }
  }

  return Object.freeze({
    transitionPlanSource,
    repositoryRoot: canonicalRoot,
    rootIdentity: `${rootStats.dev}:${rootStats.ino}`,
    repositoryId: parsedConfig.value.repositoryId,
    repositoryWorkspaceId,
    branch,
    headRevision,
    planningBaseRevision: transitionPlan.planningBaseRevision,
    policyIdentity: `${configFile.identity}|${ignoreFile.identity}|${registryFile.identity}`,
    preparedWorktreeReceipt,
    preparedWorktreeFile,
    missionRevision: projection.brief.revisionId,
    subjectId: projection.brief.subjectId,
    journalSequence: projection.lastSequence,
    journalDigest: journalByteSha256(journalFile.bytes),
    journalFile,
    transitionPlan,
    transitionPlanFile,
    parentPlanRawSha256: sha256(parentPlanBytes),
    furyCardFile: cardEntry.file,
  });
}

function immutableObservation(observation: HostObservation): unknown {
  return {
    transitionPlanSource: observation.transitionPlanSource,
    repositoryRoot: observation.repositoryRoot,
    rootIdentity: observation.rootIdentity,
    repositoryId: observation.repositoryId,
    repositoryWorkspaceId: observation.repositoryWorkspaceId,
    branch: observation.branch,
    headRevision: observation.headRevision,
    planningBaseRevision: observation.planningBaseRevision,
    policyIdentity: observation.policyIdentity,
    preparedWorktreeReceiptDigest: observation.preparedWorktreeReceipt.receiptDigest,
    preparedWorktreeReceiptRawSha256: observation.preparedWorktreeFile.rawSha256,
    preparedWorktreeReceiptIdentity: observation.preparedWorktreeFile.identity,
    missionRevision: observation.missionRevision,
    subjectId: observation.subjectId,
    journalSequence: observation.journalSequence,
    journalDigest: observation.journalDigest,
    journalIdentity: observation.journalFile.identity,
    transitionPlanId: observation.transitionPlan.id,
    transitionPlanDigest: observation.transitionPlan.digest,
    transitionPlanRawSha256: observation.transitionPlanFile.rawSha256,
    transitionPlanIdentity: observation.transitionPlanFile.identity,
    parentPlanRawSha256: observation.parentPlanRawSha256,
    furyCardRawSha256: observation.furyCardFile.rawSha256,
    furyCardIdentity: observation.furyCardFile.identity,
  };
}

function logicalOperationV1(observation: HostObservation) {
  const parentSessionId = `session:reviewed-transition:${digestId("shield-reviewed-transition-parent-session-v1", {
    missionRevision: observation.missionRevision,
    transitionPlanDigest: observation.transitionPlan.digest,
  }).slice(0, 32)}`;
  return Object.freeze({
    repositoryId: observation.repositoryId,
    repositoryWorkspaceId: observation.repositoryWorkspaceId,
    missionId: observation.transitionPlan.missionId,
    missionRevision: observation.missionRevision,
    parentSessionId,
    transitionPlanId: observation.transitionPlan.id,
    transitionPlanDigest: observation.transitionPlan.digest,
  });
}

function seedRelativePathV1(operation: ReturnType<typeof logicalOperationV1>): string {
  const token = sha256(`shield-reviewed-transition-request-seed-path-v1\0${canonicalJson(operation)}`);
  return `${COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT}/${token}/request-seed.json`;
}

function logicalOperationV2(observation: HostObservation): CopilotFuryReviewedTransitionLogicalOperationV2 {
  const parentSessionId = `session:reviewed-transition-v2:${digestId("shield-reviewed-transition-parent-session-v2", {
    missionRevision: observation.missionRevision,
    transitionPlanDigest: observation.transitionPlan.digest,
    repositoryRevision: observation.headRevision,
    requestContractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2,
    reviewPhase: COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
  }).slice(0, 32)}`;
  return Object.freeze({
    repositoryId: observation.repositoryId,
    repositoryWorkspaceId: observation.repositoryWorkspaceId,
    missionId: observation.transitionPlan.missionId,
    missionRevision: observation.missionRevision,
    parentSessionId,
    transitionPlanId: observation.transitionPlan.id,
    transitionPlanDigest: observation.transitionPlan.digest,
    repositoryRevision: observation.headRevision,
    requestContractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2,
    reviewPhase: COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
  });
}

function seedRelativePathV2(operation: CopilotFuryReviewedTransitionLogicalOperationV2): string {
  const token = sha256(`shield-reviewed-transition-request-seed-path-v2\0${canonicalJson(operation)}`);
  return `${COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT}/${token}/request-seed.json`;
}

function requestFor(observation: HostObservation, input: PrepareReviewedMissionTransitionInputV1, timestamp: string): CopilotFuryPlanDispatchRequestV2 {
  const operation = logicalOperationV2(observation);
  const request = {
    schemaVersion: 2 as const,
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2,
    authority: "none" as const,
    reviewPhase: COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
    repositoryRoot: observation.repositoryRoot,
    repositoryId: observation.repositoryId,
    repositoryWorkspaceId: observation.repositoryWorkspaceId,
    branch: observation.branch,
    planningBaseRevision: observation.planningBaseRevision,
    headRevision: observation.headRevision,
    missionId: operation.missionId,
    missionRevision: operation.missionRevision,
    subjectId: observation.subjectId,
    subjectRevision: observation.transitionPlan.digest,
    parentSessionId: operation.parentSessionId,
    transitionPlanPath: input.transitionPlanPath,
    transitionPlanRawSha256: observation.transitionPlanFile.rawSha256,
    cardSelection: { kind: "repository_default" as const },
    requestedModel: input.furyModel,
    requestedRuntime: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
    requestedExecutor: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
    allowedTools: [...COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS] as ["read", "search"],
    allowedEffects: [...COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS] as [],
    repairLimit: COPILOT_FURY_REVIEWED_TRANSITION_REPAIR_LIMIT,
    stopConditions: [...COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS] as ["PASS", "REVISE", "cancelled", "failed"],
    timestamp: { value: timestamp, provenance: "hostTrusted" as const },
  };
  const checked = validateCopilotFuryPlanDispatchRequestV2(request);
  if (checked.state === "invalid") throw new Error(`derived_dispatch_request_invalid:${checked.errors.join(" ")}`);
  return checked.value;
}

function seedFor(observation: HostObservation, request: CopilotFuryPlanDispatchRequestV2): CopilotFuryReviewedTransitionSeedV3 | CopilotFuryReviewedTransitionSeedV4 {
  const bindings = {
    authority: "none" as const,
    logicalOperation: logicalOperationV2(observation),
    preparedWorktree: Object.freeze({
      receiptDigest: observation.preparedWorktreeReceipt.receiptDigest,
      receiptRawSha256: observation.preparedWorktreeFile.rawSha256,
      laneBranch: observation.branch,
    }),
    furyCard: Object.freeze({
      logicalRef: COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF,
      rawSha256: observation.furyCardFile.rawSha256,
      repositoryRevision: observation.headRevision,
    }),
    missionJournal: Object.freeze({ sequence: observation.journalSequence, digest: observation.journalDigest }),
  };
  if (observation.transitionPlanSource.kind === "committed_file") {
    return Object.freeze({
      schemaVersion: 3,
      contractVersion: COPILOT_FURY_REVIEWED_TRANSITION_ARCHITECTURE_PLAN_SEED_CONTRACT_VERSION_V2,
      ...bindings,
      request,
    });
  }
  return Object.freeze({
    schemaVersion: 4,
    contractVersion: COPILOT_FURY_REVIEWED_TRANSITION_DERIVED_ARCHITECTURE_PLAN_SEED_CONTRACT_VERSION_V2,
    ...bindings,
    transitionPlanSource: observation.transitionPlanSource,
    request,
  });
}

function validSeedBindings(value: Plain, logicalFields: readonly string[]): boolean {
  return value.authority === "none" &&
    exact(value.logicalOperation, logicalFields) && exact(value.preparedWorktree, PREPARED_WORKTREE_FIELDS) &&
    exact(value.furyCard, FURY_CARD_FIELDS) && exact(value.missionJournal, MISSION_JOURNAL_FIELDS);
}

function validSeedShape(value: unknown): value is CopilotFuryReviewedTransitionSeedV1ToV4 {
  if (!plain(value)) return false;
  if (value.schemaVersion === 1 && value.contractVersion === COPILOT_FURY_REVIEWED_TRANSITION_SEED_CONTRACT_VERSION) {
    return validSeedBindings(value, LOGICAL_OPERATION_FIELDS) && validateCopilotFuryPlanDispatchRequestV1(value.request).state === "valid" && exact(value, SEED_V1_FIELDS);
  }
  if (value.schemaVersion === 2 && value.contractVersion === COPILOT_FURY_REVIEWED_TRANSITION_DERIVED_SEED_CONTRACT_VERSION) {
    return validSeedBindings(value, LOGICAL_OPERATION_FIELDS) && validateCopilotFuryPlanDispatchRequestV1(value.request).state === "valid" &&
      exact(value, SEED_V2_FIELDS) && plain(value.transitionPlanSource) && value.transitionPlanSource.kind === "legacy_derived";
  }
  if (value.schemaVersion === 3 && value.contractVersion === COPILOT_FURY_REVIEWED_TRANSITION_ARCHITECTURE_PLAN_SEED_CONTRACT_VERSION_V2) {
    return validSeedBindings(value, LOGICAL_OPERATION_FIELDS_V2) && validateCopilotFuryPlanDispatchRequestV2(value.request).state === "valid" && exact(value, SEED_V3_FIELDS);
  }
  return value.schemaVersion === 4 && value.contractVersion === COPILOT_FURY_REVIEWED_TRANSITION_DERIVED_ARCHITECTURE_PLAN_SEED_CONTRACT_VERSION_V2 &&
    validSeedBindings(value, LOGICAL_OPERATION_FIELDS_V2) && validateCopilotFuryPlanDispatchRequestV2(value.request).state === "valid" &&
    exact(value, SEED_V4_FIELDS) && plain(value.transitionPlanSource) && value.transitionPlanSource.kind === "legacy_derived";
}

async function ensureSeedDirectory(
  root: string,
  relativePath: string,
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
): Promise<{ path: string; chain: DirectoryChain }> {
  const components = relativePath.split("/").slice(0, -1);
  let current = root;
  for (const component of components) {
    const parent = await openVerifiedDirectory(current, "seed_ancestor", operations);
    const child = join(current, component);
    let created = false;
    try {
      try {
        await operations.mkdirPath(child, 0o700);
        created = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const verifiedChild = await openVerifiedDirectory(child, "seed_directory", operations);
      try {
        const parentAfter = await parent.handle.stat();
        const parentPathAfter = await operations.lstatPath(current);
        if (parentPathAfter.isSymbolicLink() || !parentPathAfter.isDirectory() || parentAfter.dev !== parent.identity.dev || parentAfter.ino !== parent.identity.ino ||
            parentPathAfter.dev !== parent.identity.dev || parentPathAfter.ino !== parent.identity.ino) throw new Error("seed_ancestor_identity_changed");
        if (created && ((await verifiedChild.handle.stat()).mode & 0o777) !== 0o700) throw new Error("seed_directory_mode_invalid");
        if (created) {
          await operations.syncDirectoryHandle(verifiedChild.handle);
          await operations.syncDirectoryHandle(parent.handle);
        }
      } finally {
        await verifiedChild.handle.close();
      }
    } finally {
      await parent.handle.close();
    }
    current = child;
  }
  return { path: current, chain: await directoryChain(root, current, "seed_ancestor", operations) };
}

async function secureSeedFile(
  path: string,
  label: string,
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
): Promise<StableFile> {
  const file = await stableFile(path, label);
  const stats = await operations.lstatPath(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1 || (stats.mode & 0o777) !== 0o600 ||
      !file.identity.startsWith(`${stats.dev}:${stats.ino}:${stats.size}:`)) throw new Error(`${label}_identity_unsafe`);
  const readback = await stableFile(path, label);
  if (readback.bytes !== file.bytes || readback.identity !== file.identity) throw new Error(`${label}_replaced_or_changed`);
  return readback;
}

async function readSeed(
  path: string,
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
): Promise<{ state: "missing" } | { state: "present"; file: StableFile; value: unknown }> {
  try {
    const file = await secureSeedFile(path, "request_seed", operations);
    let value: unknown;
    try { value = JSON.parse(file.bytes); } catch { return { state: "present", file, value: null }; }
    return { state: "present", file, value };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" };
    throw error;
  }
}

function completionWitnessBytes(seedBytes: string): string {
  return `sha256:${sha256(seedBytes)}\n`;
}

async function waitForSeedCompletion(
  path: string,
  expectedBytes: string,
  markerPaths: readonly string[],
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
): Promise<StableFile> {
  let lastError = "request_seed_completion_missing";
  for (let attempt = 0; attempt < SEED_INSTALL_WAIT_ATTEMPTS; attempt += 1) {
    try {
      if (await seedMarkersAbsent(markerPaths, operations)) {
        const file = await secureSeedFile(path, "request_seed_completion", operations);
        if (file.bytes === expectedBytes && await seedMarkersAbsent(markerPaths, operations)) return file;
        lastError = "request_seed_completion_mismatch";
      } else {
        lastError = "request_seed_completion_marker_present";
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, SEED_INSTALL_WAIT_INTERVAL_MS));
  }
  throw new Error(`request_seed_completion_incomplete:${lastError}`);
}

async function seedInstallMarkerPresent(path: string, operations: CopilotFuryReviewedTransitionSeedPersistenceV1): Promise<boolean> {
  try {
    const stats = await operations.lstatPath(path);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("seed_install_marker_unsafe");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function seedMarkersAbsent(
  paths: readonly string[],
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
): Promise<boolean> {
  for (const path of paths) {
    if (await seedInstallMarkerPresent(path, operations)) return false;
  }
  return true;
}

async function waitForSeedMarkersRemoval(
  paths: readonly string[],
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
): Promise<boolean> {
  for (let attempt = 0; attempt < SEED_INSTALL_WAIT_ATTEMPTS; attempt += 1) {
    if (await seedMarkersAbsent(paths, operations)) return true;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, SEED_INSTALL_WAIT_INTERVAL_MS));
  }
  return await seedMarkersAbsent(paths, operations);
}

async function waitForSeedInstallMarkerRemoval(
  path: string,
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
): Promise<boolean> {
  for (let attempt = 0; attempt < SEED_INSTALL_WAIT_ATTEMPTS; attempt += 1) {
    if (!await seedInstallMarkerPresent(path, operations)) return true;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, SEED_INSTALL_WAIT_INTERVAL_MS));
  }
  return !await seedInstallMarkerPresent(path, operations);
}

async function acceptExistingSeed(
  observation: HostObservation,
  input: PrepareReviewedMissionTransitionInputV1,
  relativePath: string,
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
): Promise<SeedResolution | PrepareReviewedMissionTransitionClosedResultV1> {
  const absolutePath = join(observation.repositoryRoot, ...relativePath.split("/"));
  const seedDirectory = dirname(absolutePath);
  const installingPath = join(seedDirectory, "request-seed.installing");
  const completingPath = join(seedDirectory, SEED_COMPLETING_FILE);
  const completionPath = join(seedDirectory, SEED_COMPLETION_FILE);
  const markerPaths = [installingPath, completingPath] as const;
  try {
    if (!await waitForSeedMarkersRemoval(markerPaths, operations)) {
      return closed("recovery_required", "REQUEST_SEED_INSTALL_INCOMPLETE", "Concurrent seed creation did not reach a durably verified terminal state.");
    }
    const candidate = await readSeed(absolutePath, operations);
    if (candidate.state === "missing") {
      return closed("recovery_required", "REQUEST_SEED_INSTALL_INCOMPLETE", "Concurrent seed creation removed its marker without installing a durable request seed.");
    }
    if (!validSeedShape(candidate.value)) return closed("recovery_required", "REQUEST_SEED_MALFORMED", "The durable request seed is malformed or unsafe.");
    const expected = seedFor(observation, requestFor(observation, input, candidate.value.request.timestamp.value));
    if (canonicalJson(candidate.value) !== canonicalJson(expected)) {
      return closed("conflict", "REQUEST_SEED_CONFLICT", "Concurrent creation installed a different immutable request seed.");
    }
    if (candidate.file.bytes !== `${canonicalJson(candidate.value)}\n`) {
      return closed("recovery_required", "REQUEST_SEED_NONCANONICAL", "Concurrent creation installed noncanonical seed bytes.");
    }
    const completionFile = await waitForSeedCompletion(completionPath, completionWitnessBytes(candidate.file.bytes), markerPaths, operations);
    const chain = await directoryChain(observation.repositoryRoot, seedDirectory, "seed_ancestor", operations);
    if (!await seedMarkersAbsent(markerPaths, operations)) throw new Error("seed_install_marker_reappeared");
    const readback = await readSeed(absolutePath, operations);
    if (readback.state === "missing" || readback.file.bytes !== candidate.file.bytes || readback.file.identity !== candidate.file.identity) {
      throw new Error("request_seed_replaced_or_changed");
    }
    const completionReadback = await secureSeedFile(completionPath, "request_seed_completion", operations);
    if (completionReadback.bytes !== completionFile.bytes || completionReadback.identity !== completionFile.identity) {
      throw new Error("request_seed_completion_replaced_or_changed");
    }
    const readbackChain = await directoryChain(observation.repositoryRoot, seedDirectory, "seed_ancestor", operations);
    if (!sameDirectoryChain(readbackChain, chain)) throw new Error("seed_ancestor_identity_changed");
    if (!await seedMarkersAbsent(markerPaths, operations)) throw new Error("seed_install_marker_reappeared");
    return Object.freeze({ seed: candidate.value, file: readback.file, completionFile: completionReadback, relativePath, directoryChain: readbackChain });
  } catch (error) {
    return closed("recovery_required", "REQUEST_SEED_UNAVAILABLE", error instanceof Error ? error.message : String(error));
  }
}

function matchingLogicalClaim(projection: SeatDispatchReceiptProjectionV1, operation: CopilotFuryReviewedTransitionLogicalOperationV2): boolean {
  return projection.parentMissionId === operation.missionId && projection.parentMissionRevision === operation.missionRevision &&
    projection.parentSessionId === operation.parentSessionId && projection.repositoryId === operation.repositoryId &&
    projection.repositoryWorkspaceId === operation.repositoryWorkspaceId && projection.artifactId === operation.transitionPlanId &&
    projection.artifactRevision === operation.transitionPlanDigest;
}

async function missingSeedHasClaim(
  observation: HostObservation,
  readLedger: typeof readSeatDispatchReceiptLedgerSnapshotV1,
): Promise<boolean> {
  const operation = logicalOperationV2(observation);
  const ledger = await readLedger({
    repositoryRoot: observation.repositoryRoot,
    repositoryId: observation.repositoryId,
    repositoryWorkspaceId: observation.repositoryWorkspaceId,
  });
  if (ledger.state === "invalid") {
    if (ledger.code === "dispatch_receipt_missing") return false;
    throw new Error(`dispatch_receipt_scan_failed:${ledger.code}:${ledger.errors.join(" ")}`);
  }
  return ledger.value.projections.some((projection) => matchingLogicalClaim(projection, operation));
}

async function installSeed(
  root: string,
  relativePath: string,
  bytes: string,
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
): Promise<void> {
  const ensured = await ensureSeedDirectory(root, relativePath, operations);
  const directory = ensured.path;
  const finalPath = join(root, ...relativePath.split("/"));
  const installingPath = join(directory, "request-seed.installing");
  const completingPath = join(directory, SEED_COMPLETING_FILE);
  const completionPath = join(directory, SEED_COMPLETION_FILE);
  let handle: FileHandle | undefined;
  try {
    try {
      handle = await operations.openPath(installingPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("seed_install_in_progress");
      throw error;
    }
    const encoded = Buffer.from(bytes, "utf8");
    if (await operations.writeFileHandle(handle, encoded) !== encoded.byteLength) throw new Error("seed_partial_write");
    await operations.syncFileHandle(handle);
    await handle.close();
    handle = undefined;
    const verifiedDirectory = await openVerifiedDirectory(directory, "seed_directory", operations);
    try { await operations.syncDirectoryHandle(verifiedDirectory.handle); } finally { await verifiedDirectory.handle.close(); }

    const raced = await readSeed(finalPath, operations);
    if (raced.state === "present") {
      if (raced.file.bytes !== bytes) throw new Error("seed_create_conflict");
    } else {
      await operations.linkPath(installingPath, finalPath);
      const installedDirectory = await openVerifiedDirectory(directory, "seed_directory", operations);
      try { await operations.syncDirectoryHandle(installedDirectory.handle); } finally { await installedDirectory.handle.close(); }
    }

    const installedChain = await directoryChain(root, directory, "seed_ancestor", operations);
    if (!sameDirectoryChain(installedChain, ensured.chain)) throw new Error("seed_ancestor_identity_changed");

    await operations.unlinkPath(installingPath);
    const cleanedDirectory = await openVerifiedDirectory(directory, "seed_directory", operations);
    try { await operations.syncDirectoryHandle(cleanedDirectory.handle); } finally { await cleanedDirectory.handle.close(); }

    handle = await operations.openPath(completingPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const completionBytes = Buffer.from(completionWitnessBytes(bytes), "utf8");
    if (await operations.writeFileHandle(handle, completionBytes) !== completionBytes.byteLength) throw new Error("seed_completion_partial_write");
    await operations.syncFileHandle(handle);
    await handle.close();
    handle = undefined;

    await operations.linkPath(completingPath, completionPath);
    const completedDirectory = await openVerifiedDirectory(directory, "seed_directory", operations);
    try { await operations.syncDirectoryHandle(completedDirectory.handle); } finally { await completedDirectory.handle.close(); }

    await operations.unlinkPath(completingPath);
    const completionCleanedDirectory = await openVerifiedDirectory(directory, "seed_directory", operations);
    try { await operations.syncDirectoryHandle(completionCleanedDirectory.handle); } finally { await completionCleanedDirectory.handle.close(); }
  } catch (error) {
    await handle?.close().catch(() => undefined);
    throw error;
  }
  const finalChain = await directoryChain(root, directory, "seed_ancestor", operations);
  if (!sameDirectoryChain(finalChain, ensured.chain)) throw new Error("seed_ancestor_identity_changed");
}

async function resolveSeed(
  observation: HostObservation,
  input: PrepareReviewedMissionTransitionInputV1,
  now: () => Date,
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
  readLedger: typeof readSeatDispatchReceiptLedgerSnapshotV1,
): Promise<SeedResolution | PrepareReviewedMissionTransitionClosedResultV1> {
  const operation = logicalOperationV2(observation);
  const relativePath = seedRelativePathV2(operation);
  const legacyRelativePath = seedRelativePathV1(logicalOperationV1(observation));
  if (relativePath === legacyRelativePath) return closed("conflict", "REQUEST_SEED_NAMESPACE_COLLISION", "The architecture-plan seed namespace collides with the historical V1 seed namespace.");
  const absolutePath = join(observation.repositoryRoot, ...relativePath.split("/"));
  const seedDirectory = dirname(absolutePath);
  const installingPath = join(seedDirectory, "request-seed.installing");
  const completingPath = join(seedDirectory, SEED_COMPLETING_FILE);
  const markerPaths = [installingPath, completingPath] as const;
  try {
    if (!await seedMarkersAbsent(markerPaths, operations)) {
      if (!await waitForSeedMarkersRemoval(markerPaths, operations)) {
        return closed("recovery_required", "REQUEST_SEED_INSTALL_INCOMPLETE", "A seed install marker remained active beyond the bounded convergence window.");
      }
      return await acceptExistingSeed(observation, input, relativePath, operations);
    }
  } catch (error) {
    return closed("recovery_required", "REQUEST_SEED_UNAVAILABLE", error instanceof Error ? error.message : String(error));
  }
  let existing: Awaited<ReturnType<typeof readSeed>>;
  try { existing = await readSeed(absolutePath, operations); } catch (error) {
    return closed("recovery_required", "REQUEST_SEED_UNAVAILABLE", error instanceof Error ? error.message : String(error));
  }
  if (existing.state === "present") {
    return await acceptExistingSeed(observation, input, relativePath, operations);
  }
  try {
    if (await missingSeedHasClaim(observation, readLedger)) return closed("recovery_required", "REQUEST_SEED_MISSING_AFTER_CLAIM", "A dispatch claim exists for this repository workspace, mission, and mission revision without the exact request seed.");
    const date = now();
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return closed("invalid", "HOST_TIMESTAMP_INVALID", "The host-trusted clock did not return a valid Date.");
    const seed = seedFor(observation, requestFor(observation, input, date.toISOString()));
    const bytes = `${canonicalJson(seed)}\n`;
    await installSeed(observation.repositoryRoot, relativePath, bytes, operations);
    return await acceptExistingSeed(observation, input, relativePath, operations);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "seed_install_in_progress") {
      try {
        if (!await waitForSeedInstallMarkerRemoval(installingPath, operations)) {
          return closed("recovery_required", "REQUEST_SEED_INSTALL_INCOMPLETE", "Concurrent seed creation did not reach a durably verified terminal state.");
        }
      } catch (waitError) {
        return closed("recovery_required", "REQUEST_SEED_UNAVAILABLE", waitError instanceof Error ? waitError.message : String(waitError));
      }
      return await acceptExistingSeed(observation, input, relativePath, operations);
    }
    if (message === "seed_create_conflict") {
      return await acceptExistingSeed(observation, input, relativePath, operations);
    }
    return closed("recovery_required", "REQUEST_SEED_PERSISTENCE_UNCERTAIN", message);
  }
}

async function reobserveExact(
  input: PrepareReviewedMissionTransitionInputV1,
  expected: HostObservation,
  seed: SeedResolution,
  operations: CopilotFuryReviewedTransitionSeedPersistenceV1,
  derivedSource?: InternalDerivedTransitionPlanSourceV1,
): Promise<HostObservation> {
  const observed = await observeHost(input, derivedSource);
  if (canonicalJson(immutableObservation(observed)) !== canonicalJson(immutableObservation(expected))) throw new Error("host_binding_drift");
  const currentChain = await directoryChain(expected.repositoryRoot, dirname(join(expected.repositoryRoot, ...seed.relativePath.split("/"))), "seed_ancestor", operations);
  if (!sameDirectoryChain(currentChain, seed.directoryChain)) throw new Error("request_seed_ancestor_replaced_or_changed");
  const seedDirectory = dirname(join(expected.repositoryRoot, ...seed.relativePath.split("/")));
  const markerPaths = [join(seedDirectory, "request-seed.installing"), join(seedDirectory, SEED_COMPLETING_FILE)] as const;
  if (!await seedMarkersAbsent(markerPaths, operations)) {
    throw new Error("request_seed_install_incomplete");
  }
  const readback = await secureSeedFile(join(expected.repositoryRoot, ...seed.relativePath.split("/")), "request_seed", operations);
  if (readback.bytes !== seed.file.bytes || readback.identity !== seed.file.identity) throw new Error("request_seed_replaced_or_changed");
  const completionReadback = await secureSeedFile(join(seedDirectory, SEED_COMPLETION_FILE), "request_seed_completion", operations);
  if (completionReadback.bytes !== seed.completionFile.bytes || completionReadback.identity !== seed.completionFile.identity ||
      completionReadback.bytes !== completionWitnessBytes(readback.bytes)) throw new Error("request_seed_completion_replaced_or_changed");
  if (!await seedMarkersAbsent(markerPaths, operations)) throw new Error("request_seed_install_incomplete");
  return observed;
}

async function secureHandoffFile(root: string, relativePath: string, label: string, expectedChain?: DirectoryChain): Promise<SecureHandoffFile> {
  if (!normalizedRelativePath(relativePath) || !relativePath.startsWith(".shield/audit/copilot-fury-plan-dispatch/")) throw new Error(`${label}_path_invalid`);
  const absolute = join(root, ...relativePath.split("/"));
  const relation = relative(root, absolute);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error(`${label}_path_escape`);
  const before = await directoryChain(root, dirname(absolute), `${label}_ancestor`);
  if (expectedChain !== undefined && !sameDirectoryChain(before, expectedChain)) throw new Error(`${label}_ancestor_replaced_or_changed`);
  const file = await stableFile(absolute, label);
  const after = await directoryChain(root, dirname(absolute), `${label}_ancestor`);
  if (!sameDirectoryChain(before, after)) throw new Error(`${label}_ancestor_replaced_or_changed`);
  return Object.freeze({ file, directoryChain: before });
}

function expectedBinding(plan: TransitionPlanV1OrV2) {
  return Object.freeze({
    schemaVersion: 1 as const,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    parentPlanCommit: plan.parentPlanCommit,
    parentPlanPath: plan.parentPlanPath,
    parentPlanRawSha256: plan.parentPlanRawSha256,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    reviewedArtifactId: plan.id,
    reviewedArtifactRevision: plan.digest,
  });
}

function identityEquals(left: SeatDispatchReceiptIdentityV1, right: SeatDispatchReceiptIdentityV1): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function receiptMatchesRequest(projection: SeatDispatchReceiptProjectionV1, request: CopilotFuryPlanDispatchRequestV1OrV2, receiptId: string, plan: TransitionPlanV1OrV2): boolean {
  return projection.receiptId === receiptId && projection.parentMissionId === request.missionId &&
    projection.parentMissionRevision === request.missionRevision && projection.parentSessionId === request.parentSessionId &&
    projection.repositoryId === request.repositoryId && projection.repositoryWorkspaceId === request.repositoryWorkspaceId &&
    projection.repositoryRevision === request.headRevision && projection.subjectId === request.subjectId &&
    projection.subjectRevision === request.subjectRevision && projection.artifactId === plan.id && projection.artifactRevision === plan.digest &&
    projection.accountableSeatId === "fury" && projection.configuredRuntime.kind === "runtime.configured" &&
    projection.configuredRuntime.runtimeId === request.requestedRuntime && projection.configuredRuntime.model === request.requestedModel &&
    projection.requestedRuntime.kind === "runtime.requested" && projection.requestedRuntime.runtimeId === request.requestedRuntime &&
    projection.requestedRuntime.model === request.requestedModel && projection.toolExecution.kind === "tool.execution.requested" &&
    projection.toolExecution.executorBindingRef === request.requestedExecutor;
}

async function receiptSnapshot(
  observation: HostObservation,
  request: CopilotFuryPlanDispatchRequestV1OrV2,
  receiptId: string,
  plan: TransitionPlanV1OrV2,
  readLedger: typeof readSeatDispatchReceiptLedgerSnapshotV1 = readSeatDispatchReceiptLedgerSnapshotV1,
): Promise<{
  identity: SeatDispatchReceiptIdentityV1;
  projection: SeatDispatchReceiptProjectionV1;
  ledgerFile: StableFile;
  rawReceiptDigest: string;
}> {
  const ledger = await readLedger({
    repositoryRoot: observation.repositoryRoot,
    repositoryId: observation.repositoryId,
    repositoryWorkspaceId: observation.repositoryWorkspaceId,
  });
  if (ledger.state === "invalid") throw new Error(`dispatch_receipt_snapshot_invalid:${ledger.code}:${ledger.errors.join(" ")}`);
  const projections = ledger.value.projections.filter((projection) => projection.receiptId === receiptId);
  if (projections.length !== 1 || !receiptMatchesRequest(projections[0] as SeatDispatchReceiptProjectionV1, request, receiptId, plan)) throw new Error("dispatch_receipt_request_binding_mismatch");
  const starts = ledger.value.entries.filter((entry) => entry.kind === "dispatch.started" && entry.receiptId === receiptId);
  if (starts.length !== 1) throw new Error("dispatch_receipt_start_ambiguous");
  const identityFields = [
    "receiptId", "dispatchId", "parentMissionId", "parentMissionRevision", "parentSessionId", "repositoryRevision",
    "childTaskId", "childSessionId", "accountableSeatId", "repositoryId", "repositoryWorkspaceId", "subjectId",
    "subjectRevision", "artifactId", "artifactRevision", "configuredRuntime", "requestedRuntime", "toolExecution",
    "runtimeSelfReport", "runtimeHostObserved", "executorSelfReport", "executorHostObserved", "timestamp", "logSequence",
    "previousLogDigest", "lifecycleSequence", "previousLifecycleDigest",
  ] as const;
  const identity = Object.fromEntries(identityFields.map((field) => [field, starts[0]?.[field]])) as unknown as SeatDispatchReceiptIdentityV1;
  const raw = ledger.value.rawEntryBytes.filter((_, index) => ledger.value.entries[index]?.receiptId === receiptId);
  if (raw.length < 2) throw new Error("dispatch_receipt_raw_set_incomplete");
  const ledgerFile = await stableFile(ledger.value.logPath, "dispatch_receipt_ledger");
  return Object.freeze({
    identity: Object.freeze(identity),
    projection: projections[0] as SeatDispatchReceiptProjectionV1,
    ledgerFile,
    rawReceiptDigest: sha256(Buffer.concat(raw.map((entry) => Buffer.from(entry)))),
  });
}

function validateInput(input: unknown): PrepareReviewedMissionTransitionInputV1 | null {
  if (!exact(input, INPUT_FIELDS) || typeof input.repositoryRoot !== "string" || !isAbsolute(input.repositoryRoot) || resolve(input.repositoryRoot) !== input.repositoryRoot ||
      !IDENTIFIER.test(String(input.missionId)) || !normalizedRelativePath(input.transitionPlanPath) || !IDENTIFIER.test(String(input.furyModel))) return null;
  return Object.freeze({
    missionId: input.missionId as string,
    repositoryRoot: input.repositoryRoot,
    transitionPlanPath: input.transitionPlanPath,
    furyModel: input.furyModel as string,
  });
}

const inFlightReviewedTransitions = new Map<string, Promise<PrepareReviewedMissionTransitionResultV1>>();

function concurrentDispatchPending(result: CopilotFuryPlanDispatchResultV1): boolean {
  return (result.state === "invalid" && result.code === "dispatch_receipt_lock_held") ||
    (result.state === "recovery_required" && result.code === "RECOVERY_REQUIRED" && result.errors.length === 1 &&
      result.errors[0] === "Existing dispatch is nonterminal and cannot be reinvoked.");
}

function boundedDispatchPending(): CopilotFuryPlanDispatchResultV1 {
  return Object.freeze({
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
    authority: "none" as const,
    state: "blocked" as const,
    code: "DISPATCH_PENDING",
    errors: Object.freeze(["The exact dispatch receipt remains nonterminal after the bounded host wait."]),
    receiptId: null,
    evidencePath: null,
    replayed: false,
    handoff: null,
  });
}

async function prepareReviewedMissionTransitionInternal(
  input: unknown,
  dependencies: CopilotFuryReviewedTransitionHostDependenciesV1 = {},
  derivedSource?: InternalDerivedTransitionPlanSourceV1,
  rederiveDerivedSource?: InternalDerivedTransitionPlanRederiverV1,
): Promise<PrepareReviewedMissionTransitionResultV1> {
  const checkedInput = validateInput(input);
  if (checkedInput === null) return closed("invalid", "MALFORMED_HOST_REQUEST", "Reviewed-transition host input fields are not closed or valid.");
  if (derivedSource !== undefined && rederiveDerivedSource === undefined) {
    return closed("invalid", "MALFORMED_DERIVED_SOURCE_CAPABILITY", "Derived transition sources require a fresh repository-backed rederivation capability.");
  }
  try { if (derivedSource !== undefined) assertDerivedSourceProvenanceDigest(derivedSource); } catch (error) {
    return closed("invalid", "HOST_PRECONDITION_FAILED", error instanceof Error ? error.message : String(error));
  }
  let initial: HostObservation;
  try { initial = await observeHost(checkedInput, derivedSource); } catch (error) {
    return closed("invalid", "HOST_PRECONDITION_FAILED", error instanceof Error ? error.message : String(error));
  }
  const persistence = seedPersistence(dependencies.seedPersistence);
  const readLedger = dependencies.readDispatchLedgerSnapshot ?? readSeatDispatchReceiptLedgerSnapshotV1;
  const seed = await resolveSeed(initial, checkedInput, dependencies.now ?? (() => new Date()), persistence, readLedger);
  if ("state" in seed) return seed;
  const inFlightKey = `${initial.repositoryRoot}\0${seed.relativePath}`;
  const existing = inFlightReviewedTransitions.get(inFlightKey);
  if (existing !== undefined) return existing;
  const pending = (async (): Promise<PrepareReviewedMissionTransitionResultV1> => {
    try {
      await dependencies.beforeDispatch?.();
      await reobserveExact(checkedInput, initial, seed, persistence, derivedSource);
    } catch (error) {
      return closed("recovery_required", "PRE_DISPATCH_REOBSERVATION_FAILED", error instanceof Error ? error.message : String(error));
    }

    const dispatch = derivedSource === undefined
      ? dependencies.dispatchPlanReview ?? dispatchCopilotFuryPlanReviewV1
      : (request: CopilotFuryPlanDispatchRequestV1OrV2, dispatchDependencies?: CopilotFuryPlanDispatchDependenciesV1) =>
          (dependencies.dispatchDerivedPlanReview ?? dispatchCopilotFuryPlanReviewCoreV1)(request, derivedSource, dispatchDependencies);
    let dispatchResult = await dispatch(seed.seed.request, dependencies.dispatchDependencies);
    let pendingReceiptId: string | null = null;
    const dispatchWaitDeadline = Date.now() + DISPATCH_LOCK_WAIT_MS;
    while (concurrentDispatchPending(dispatchResult) && Date.now() < dispatchWaitDeadline) {
      if (dispatchResult.receiptId !== null) {
        if (pendingReceiptId !== null && dispatchResult.receiptId !== pendingReceiptId) {
          return closed("recovery_required", "DISPATCH_RECEIPT_IDENTITY_DRIFT", "Concurrent dispatch replay changed receipt identity.");
        }
        pendingReceiptId = dispatchResult.receiptId;
      }
      await new Promise<void>((resolveWait) => setTimeout(resolveWait, Math.min(SEED_INSTALL_WAIT_INTERVAL_MS, dispatchWaitDeadline - Date.now())));
      dispatchResult = await dispatch(seed.seed.request, dependencies.dispatchDependencies);
    }
    if (concurrentDispatchPending(dispatchResult)) return boundedDispatchPending();
    if (pendingReceiptId !== null && dispatchResult.receiptId !== pendingReceiptId) {
      return closed("recovery_required", "DISPATCH_RECEIPT_IDENTITY_DRIFT", "Concurrent dispatch terminal replay changed receipt identity.");
    }
    if (dispatchResult.state !== "completed" || dispatchResult.disposition !== "PASS") return dispatchResult;

    try {
      if (dispatchResult.receiptId !== dispatchResult.handoff.dispatchReceiptId) throw new Error("dispatch_handoff_receipt_mismatch");
      const returnedTransitionArtifact = await secureHandoffFile(initial.repositoryRoot, dispatchResult.handoff.transitionPlanPath, "dispatch_transition_plan");
      const returnedReviewArtifact = await secureHandoffFile(initial.repositoryRoot, dispatchResult.handoff.reviewArtifactPath, "dispatch_review_artifact");
      let transitionValue: unknown;
      let reviewValue: unknown;
      try { transitionValue = JSON.parse(returnedTransitionArtifact.file.bytes); reviewValue = JSON.parse(returnedReviewArtifact.file.bytes); } catch { throw new Error("dispatch_handoff_artifact_malformed"); }
      const transition = validateTransitionPlanV1OrV2({ artifact: transitionValue });
      const review = validateMissionTransitionPlanReviewV1(reviewValue);
      if (transition.state === "invalid" || review.state === "invalid" || canonicalJson(transition.value) !== canonicalJson(initial.transitionPlan)) throw new Error("dispatch_handoff_artifact_binding_mismatch");
      const returnedReceipt = await receiptSnapshot(initial, seed.seed.request, dispatchResult.handoff.dispatchReceiptId, transition.value, readLedger);

      await dependencies.afterDispatch?.(dispatchResult);
      const afterDispatchObservation = await reobserveExact(checkedInput, initial, seed, persistence, derivedSource);
      const transitionArtifact = await secureHandoffFile(initial.repositoryRoot, dispatchResult.handoff.transitionPlanPath, "dispatch_transition_plan", returnedTransitionArtifact.directoryChain);
      const reviewArtifact = await secureHandoffFile(initial.repositoryRoot, dispatchResult.handoff.reviewArtifactPath, "dispatch_review_artifact", returnedReviewArtifact.directoryChain);
      if (transitionArtifact.file.bytes !== returnedTransitionArtifact.file.bytes || transitionArtifact.file.identity !== returnedTransitionArtifact.file.identity ||
          reviewArtifact.file.bytes !== returnedReviewArtifact.file.bytes || reviewArtifact.file.identity !== returnedReviewArtifact.file.identity) {
        throw new Error("dispatch_handoff_artifact_replaced_or_changed");
      }
      const receipt = await receiptSnapshot(afterDispatchObservation, seed.seed.request, dispatchResult.handoff.dispatchReceiptId, transition.value, readLedger);
      if (!identityEquals(returnedReceipt.identity, receipt.identity) || returnedReceipt.rawReceiptDigest !== receipt.rawReceiptDigest ||
          returnedReceipt.ledgerFile.identity !== receipt.ledgerFile.identity) throw new Error("dispatch_receipt_replaced_or_changed");

      const resolver = dependencies.resolveDispatchIdentity ?? resolveSeatDispatchIdentityByReceiptIdV1;
      const resolved = await resolver({ repositoryRoot: initial.repositoryRoot, repositoryId: initial.repositoryId, receiptId: dispatchResult.handoff.dispatchReceiptId });
      if (resolved.state === "invalid") throw new Error(`dispatch_identity_resolution_failed:${resolved.errors.join(" ")}`);
      if (!identityEquals(resolved.identity, receipt.identity)) throw new Error("dispatch_resolver_identity_mismatch");

      await dependencies.beforeMaterialization?.();
      let exactMaterializationSource = derivedSource;
      if (derivedSource !== undefined) {
        const freshlyDerivedSource = await (rederiveDerivedSource as InternalDerivedTransitionPlanRederiverV1)();
        assertDerivedSourceProvenanceDigest(freshlyDerivedSource);
        if (seed.seed.schemaVersion !== 4 ||
            canonicalJson(freshlyDerivedSource) !== canonicalJson(derivedSource) ||
            canonicalJson(freshlyDerivedSource) !== canonicalJson(seed.seed.transitionPlanSource)) {
          throw new Error("legacy_derived_source_pre_materialization_drift");
        }
        exactMaterializationSource = freshlyDerivedSource;
      }
      const exactMaterializationObservation = await reobserveExact(
        checkedInput,
        initial,
        seed,
        persistence,
        exactMaterializationSource,
      );
      if (exactMaterializationSource !== undefined) {
        const freshlyDerivedRequest = requestFor(exactMaterializationObservation, checkedInput, seed.seed.request.timestamp.value);
        if (canonicalJson(freshlyDerivedRequest) !== canonicalJson(seed.seed.request) ||
            canonicalJson(transition.value) !== canonicalJson(exactMaterializationSource.transitionPlan)) {
          throw new Error("legacy_derived_request_pre_materialization_drift");
        }
      }
      const transitionReadback = await secureHandoffFile(initial.repositoryRoot, dispatchResult.handoff.transitionPlanPath, "dispatch_transition_plan", transitionArtifact.directoryChain);
      const reviewReadback = await secureHandoffFile(initial.repositoryRoot, dispatchResult.handoff.reviewArtifactPath, "dispatch_review_artifact", reviewArtifact.directoryChain);
      if (transitionReadback.file.bytes !== transitionArtifact.file.bytes || transitionReadback.file.identity !== transitionArtifact.file.identity ||
          reviewReadback.file.bytes !== reviewArtifact.file.bytes || reviewReadback.file.identity !== reviewArtifact.file.identity) throw new Error("dispatch_handoff_artifact_replaced_or_changed");
      const receiptReadback = await receiptSnapshot(exactMaterializationObservation, seed.seed.request, dispatchResult.handoff.dispatchReceiptId, transition.value, readLedger);
      if (!identityEquals(receipt.identity, receiptReadback.identity) || receipt.rawReceiptDigest !== receiptReadback.rawReceiptDigest ||
          receipt.ledgerFile.identity !== receiptReadback.ledgerFile.identity) throw new Error("dispatch_receipt_replaced_or_changed");
      if (exactMaterializationSource !== undefined &&
          (dispatchResult.handoff.dispatchReceiptId !== receiptReadback.projection.receiptId ||
           receiptReadback.projection.artifactId !== exactMaterializationSource.transitionPlan.id ||
           receiptReadback.projection.artifactRevision !== exactMaterializationSource.transitionPlan.digest ||
           receiptReadback.projection.subjectRevision !== exactMaterializationSource.transitionPlan.digest)) {
        throw new Error("legacy_derived_pass_handoff_pre_materialization_drift");
      }

      const finalResolved = await resolver({ repositoryRoot: initial.repositoryRoot, repositoryId: initial.repositoryId, receiptId: dispatchResult.handoff.dispatchReceiptId });
      if (finalResolved.state === "invalid" || !identityEquals(finalResolved.identity, receiptReadback.identity) ||
          !identityEquals(finalResolved.identity, resolved.identity)) throw new Error("dispatch_resolver_identity_mismatch");

      const materialize = dependencies.materializeReviewedTransition ?? materializeReviewedMissionTransitionV1;
      return await materialize({
        missionId: checkedInput.missionId,
        repositoryRoot: initial.repositoryRoot,
        transitionPlan: transition.value,
        reviewArtifact: review.value as MissionTransitionPlanReviewV1,
        expectedBinding: expectedBinding(transition.value),
        dispatchIdentity: finalResolved.identity,
      });
    } catch (error) {
      return closed("recovery_required", "POST_PASS_REOBSERVATION_FAILED", error instanceof Error ? error.message : String(error));
    }
  })();
  inFlightReviewedTransitions.set(inFlightKey, pending);
  try {
    return await pending;
  } finally {
    if (inFlightReviewedTransitions.get(inFlightKey) === pending) inFlightReviewedTransitions.delete(inFlightKey);
  }
}

export async function prepareReviewedMissionTransitionV1(
  input: unknown,
  dependencies: CopilotFuryReviewedTransitionHostDependenciesV1 = {},
): Promise<PrepareReviewedMissionTransitionResultV1> {
  return prepareReviewedMissionTransitionInternal(input, dependencies);
}

export async function prepareReviewedMissionTransitionFromDerivedSourceV1(
  input: Readonly<{ missionId: string; repositoryRoot: string; furyModel: string }>,
  source: InternalDerivedTransitionPlanSourceV1,
  dependencies: CopilotFuryReviewedTransitionHostDependenciesV1 = {},
  rederiveSource?: InternalDerivedTransitionPlanRederiverV1,
): Promise<PrepareReviewedMissionTransitionResultV1> {
  return prepareReviewedMissionTransitionInternal({
    missionId: input.missionId,
    repositoryRoot: input.repositoryRoot,
    transitionPlanPath: source.virtualPath,
    furyModel: input.furyModel,
  }, dependencies, source, rederiveSource);
}
