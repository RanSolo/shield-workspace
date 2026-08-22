import { execFile as execFileNode } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { isProxy } from "node:util/types";

import {
  buildMissionTransitionPlanV1,
  type BuildMissionTransitionPlanInputV1,
} from "./mission-builder-v1.mjs";
import { parseShieldConfig } from "./config.mjs";
import {
  computeImplementationAuthorityDigest,
  computeSchema9RuntimeBindingDigest,
  type ImplementationAuthorityV1,
  type Schema9RuntimeBindingV1,
} from "./implementation-authority-v1.mjs";
import {
  prepareReviewedMissionTransitionFromDerivedSourceV1,
  type CopilotFuryReviewedTransitionHostDependenciesV1,
  type PrepareReviewedMissionTransitionResultV1,
} from "./copilot-fury-reviewed-transition-host-v1.mjs";
import {
  projectFreshAuthorizeWheelsUpCompatibilityV1,
} from "./mission-preparation-host-v1.mjs";
import { deriveMissionReviewedTransitionGraphMaterializationPathV1 } from "./mission-preparation-store-v1.mjs";
import {
  validateAuthorizeWheelsUpInput,
  type AuthorizeWheelsUpEnvironmentObservationV1,
} from "./authorize-wheels-up-executor-v1.mjs";
import type {
  InternalDerivedTransitionPlanSourceV1,
  InternalLegacyDerivedTransitionPlanProvenanceV1,
} from "./copilot-fury-plan-dispatch-core-v1.mjs";
import { journalByteSha256, readMissionJournalForDisplay, resolveSupervisedMissionPaths } from "./mission-store.mjs";
import { canonicalJson, computeRuntimeBindingDigest } from "./mission-v2.mjs";
import { readSeatDispatchReceiptLedgerSnapshotV1 } from "./seat-dispatch-store.mjs";
import {
  computeReviewPublicationAuthorityDigest,
  computeReviewPublicationAuthoritySemanticIdentityV1,
} from "./review-publication-v1.mjs";
import {
  validateWorktreeStateReceiptFileChainV1OrV2,
  validateWorktreeStateReceiptV1OrV2,
} from "./worktree-state-v1.mjs";

export const LEGACY_REVIEWED_TRANSITION_CONTRACT_VERSION = "shield.legacy-reviewed-transition.v1" as const;
export const LEGACY_REVIEWED_TRANSITION_SEED_ROOT = ".shield/audit/legacy-reviewed-transition" as const;

const execFile = promisify(execFileNode);
const INPUT_FIELDS = ["missionId", "repositoryRoot", "furyModel"] as const;
const GRAPH_PREFLIGHT_INPUT_FIELDS = ["missionId", "repositoryRoot"] as const;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const PLAN_PATH = /^docs\/missions\/[^/]+\.md$/u;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const GIT_CONTEXT_VARIABLES = Object.freeze([
  "GIT_COMMON_DIR", "GIT_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_WORK_TREE",
] as const);
const LEGACY_EXCLUSIONS = Object.freeze([
  "review.comment.publish", "review.pull_request.update_draft", "review.pull_request.mark_ready",
  "merge", "deployment", "release", "final_acceptance",
] as const);

type Plain = Record<string, unknown>;
type StableFile = Readonly<{ path: string; bytes: string; rawSha256: string; identity: string; mode: number }>;
type DirectoryIdentity = Readonly<{ path: string; dev: number; ino: number }>;
type DirectoryChain = readonly DirectoryIdentity[];
type ProtectedDirectoryIdentity = Readonly<{
  path: string;
  handle: FileHandle;
  dev: number;
  ino: number;
  mode: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}>;

export interface ContinueLegacyReviewedTransitionInputV1 {
  readonly missionId: string;
  readonly repositoryRoot: string;
  readonly furyModel: string;
}

export type PreflightLegacyProtectedGraphAbsenceResultV1 = Readonly<
  | { readonly authority: "none"; readonly state: "absent" }
  | { readonly authority: "none"; readonly state: "blocked"; readonly code: string; readonly errors: readonly string[] }
>;

export interface LegacyReviewedTransitionDependenciesV1 {
  readonly reviewedTransitionHost?: typeof prepareReviewedMissionTransitionFromDerivedSourceV1;
  readonly reviewedTransitionDependencies?: CopilotFuryReviewedTransitionHostDependenciesV1;
  readonly seedPersistence?: Partial<LegacyReviewedTransitionSeedPersistenceV1>;
  readonly beforeReviewedTransition?: () => void | Promise<void>;
  readonly afterReviewedTransition?: (result: PrepareReviewedMissionTransitionResultV1) => void | Promise<void>;
}

export interface LegacyReviewedTransitionSeedPersistenceV1 {
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

export interface LegacyProtectedGraphPreflightDependenciesV1 {
  readonly lstatPath?: typeof lstat;
  readonly realpathPath?: typeof realpath;
  readonly openPath?: typeof open;
  readonly beforeFinalRevalidation?: () => void | Promise<void>;
}

export type ContinueLegacyReviewedTransitionClosedResultV1 = Readonly<{
  contractVersion: typeof LEGACY_REVIEWED_TRANSITION_CONTRACT_VERSION;
  authority: "none";
  state: "invalid" | "conflict" | "recovery_required";
  code: string;
  errors: readonly string[];
}>;

export type ContinueLegacyReviewedTransitionResultV1 =
  | PrepareReviewedMissionTransitionResultV1
  | ContinueLegacyReviewedTransitionClosedResultV1
  | PreflightLegacyProtectedGraphAbsenceResultV1;

type LegacyObservation = Readonly<{
  repositoryRoot: string;
  repositoryId: string;
  repositoryWorkspaceId: string;
  branch: string;
  headRevision: string;
  rootIdentity: string;
  policyIdentity: string;
  preparedWorktreeIdentity: string;
  missionRevision: string;
  journalIdentity: string;
  journalSequence: number;
  journalDigest: string;
  implementationAuthority: ImplementationAuthorityV1;
  implementationAuthorityDigest: string;
  runtimeBinding: Schema9RuntimeBindingV1;
  publicationAuthorityDigest: string;
  publicationAuthoritySemanticIdentity: string;
  publicationAuthorizationId: string;
  publicationAuthorityRef: string;
  publicationAuthoritySequence: number;
  legacyPlanObjectId: string;
  legacyPlanMode: "100644" | "100755";
  currentPlanObjectId: string;
  currentPlanMode: "100644" | "100755";
  carrier: InternalDerivedTransitionPlanSourceV1;
}>;

type LegacySeedV1 = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof LEGACY_REVIEWED_TRANSITION_CONTRACT_VERSION;
  authority: "none";
  repositoryId: string;
  repositoryWorkspaceId: string;
  missionId: string;
  missionRevision: string;
  furyModel: string;
  observation: ReturnType<typeof immutableObservation>;
  carrier: InternalDerivedTransitionPlanSourceV1;
}>;

function plain(value: unknown): value is Plain {
  try { return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype; }
  catch { return false; }
}

function exact(value: unknown, fields: readonly string[]): value is Plain {
  if (!plain(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length && keys.every((key) => typeof key === "string" && fields.includes(key)) &&
    fields.every((field) => descriptors[field]?.enumerable === true && Object.hasOwn(descriptors[field] as object, "value"));
}

function closed(state: ContinueLegacyReviewedTransitionClosedResultV1["state"], code: string, ...errors: readonly string[]): ContinueLegacyReviewedTransitionClosedResultV1 {
  return Object.freeze({ contractVersion: LEGACY_REVIEWED_TRANSITION_CONTRACT_VERSION, authority: "none", state, code, errors: Object.freeze([...errors]) });
}

function sha256(bytes: string | Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function digest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256").update(`${domain}\0${canonicalJson(value)}`).digest("base64url")}`;
}
function workspaceId(repositoryId: string, branch: string): string {
  return `workspace:reviewed-transition:${createHash("sha256").update(`shield-reviewed-transition-workspace-v1\0${canonicalJson({ repositoryId, laneBranch: branch })}`).digest("base64url").slice(0, 32)}`;
}
function normalizedRelativePath(value: string): boolean {
  return value.length > 0 && value.length <= 2048 && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0") &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
function cleanGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, GIT_NO_REPLACE_OBJECTS: "1", GIT_OPTIONAL_LOCKS: "0", LANG: "C", LC_ALL: "C" };
  for (const variable of GIT_CONTEXT_VARIABLES) delete environment[variable];
  return environment;
}
async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await execFile("git", ["--no-replace-objects", "-C", root, ...args], {
    encoding: "utf8", timeout: 15_000, maxBuffer: MAX_FILE_BYTES, shell: false, env: cleanGitEnvironment(),
  });
  return result.stdout;
}
async function gitBytes(root: string, args: readonly string[]): Promise<Buffer> {
  const result = await execFile("git", ["--no-replace-objects", "-C", root, ...args], {
    encoding: "buffer", timeout: 15_000, maxBuffer: MAX_FILE_BYTES, shell: false, env: cleanGitEnvironment(),
  });
  return result.stdout as Buffer;
}

async function stableFile(path: string, label: string, requireSingleLink = false): Promise<StableFile> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || (requireSingleLink && before.nlink !== 1) || before.size < 1 || before.size > MAX_FILE_BYTES) throw new Error(`${label}_unsafe`);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || (requireSingleLink && opened.nlink !== 1)) throw new Error(`${label}_replaced`);
    const bytes = await handle.readFile();
    if (!Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) throw new Error(`${label}_not_utf8`);
    const after = await lstat(path);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || (requireSingleLink && after.nlink !== 1)) throw new Error(`${label}_changed`);
    return Object.freeze({ path, bytes: bytes.toString("utf8"), rawSha256: sha256(bytes), identity: `${before.dev}:${before.ino}:${before.size}:${before.mtimeMs}`, mode: before.mode & 0o777 });
  } finally { await handle.close(); }
}

function repositoryIdFromRemote(remote: string): string | null {
  const value = remote.trim().replace(/\.git$/u, "");
  return /^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/\s]+\/[^/\s]+)$/iu.exec(value)?.[1] ?? null;
}

function parseNameStatus(bytes: Buffer): readonly Readonly<{ status: "A" | "M"; path: string }>[] {
  if (!Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) throw new Error("legacy_candidate_diff_not_utf8");
  const fields = bytes.toString("utf8").split("\0");
  if (fields.at(-1) !== "") throw new Error("legacy_candidate_diff_malformed");
  fields.pop();
  if (fields.length % 2 !== 0) throw new Error("legacy_candidate_diff_malformed");
  const result: { status: "A" | "M"; path: string }[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1] as string;
    if ((status !== "A" && status !== "M") || !normalizedRelativePath(path)) throw new Error("legacy_candidate_diff_malformed");
    result.push({ status, path });
  }
  return Object.freeze(result);
}

function parseNullPaths(bytes: Buffer): readonly string[] {
  if (!Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) throw new Error("changed_path_set_not_utf8");
  const fields = bytes.toString("utf8").split("\0");
  if (fields.at(-1) !== "") throw new Error("changed_path_set_malformed");
  fields.pop();
  if (fields.some((path) => !normalizedRelativePath(path))) throw new Error("changed_path_set_malformed");
  return Object.freeze(fields);
}

function parseExactTreeEntries(bytes: Buffer, approvedPaths: readonly string[]): readonly Readonly<{ mode: string; type: string; path: string }>[] {
  if (!Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) throw new Error("compatibility_tree_not_utf8");
  const records = bytes.toString("utf8").split("\0");
  if (records.at(-1) !== "") throw new Error("compatibility_tree_malformed");
  records.pop();
  const approved = new Set(approvedPaths);
  const seen = new Set<string>();
  return Object.freeze(records.map((record) => {
    const match = /^(?<mode>[0-9]{6}) (?<type>[a-z]+) [0-9a-f]{40,64}\t(?<path>[\s\S]+)$/u.exec(record);
    const groups = match?.groups;
    if (groups === undefined) throw new Error("compatibility_tree_malformed");
    const path = groups.path;
    if (path === undefined || !approved.has(path) || seen.has(path)) throw new Error("compatibility_tree_malformed");
    seen.add(path);
    return Object.freeze({ mode: groups.mode as string, type: groups.type as string, path });
  }));
}

async function exactBlob(root: string, revision: string, path: string): Promise<Readonly<{ mode: "100644" | "100755"; objectId: string; bytes: Buffer }>> {
  const listing = await gitBytes(root, ["ls-tree", "-z", "--full-tree", revision, "--", path]);
  const records = listing.toString("utf8").split("\0").filter(Boolean);
  if (records.length !== 1) throw new Error("legacy_plan_blob_missing_or_ambiguous");
  const match = /^(100644|100755) blob ([0-9a-f]{40,64})\t(.+)$/u.exec(records[0] as string);
  if (match === null || match[3] !== path) throw new Error("legacy_plan_blob_not_regular");
  const bytes = await gitBytes(root, ["cat-file", "blob", match[2] as string]);
  return Object.freeze({ mode: match[1] as "100644" | "100755", objectId: match[2] as string, bytes });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

async function observe(input: ContinueLegacyReviewedTransitionInputV1): Promise<LegacyObservation> {
  const canonicalRoot = await realpath(input.repositoryRoot);
  if (canonicalRoot !== input.repositoryRoot || resolve((await git(canonicalRoot, ["rev-parse", "--show-toplevel"])).trim()) !== canonicalRoot) throw new Error("repository_root_not_canonical");
  const rootStats = await lstat(canonicalRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error("repository_root_unsafe");
  const branch = (await git(canonicalRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  const headRevision = (await git(canonicalRoot, ["rev-parse", "--verify", "HEAD"])).trim();
  if (!IDENTIFIER.test(branch) || !REVISION.test(headRevision)) throw new Error("repository_head_or_branch_invalid");
  if ((await git(canonicalRoot, ["status", "--porcelain=v1", "--untracked-files=all"])).trim() !== "") throw new Error("workspace_dirty");

  const configFile = await stableFile(join(canonicalRoot, ".shield", "config.json"), "shield_config");
  const config = parseShieldConfig(configFile.bytes);
  if (config.state === "invalid" || repositoryIdFromRemote(await git(canonicalRoot, ["config", "--get", "remote.origin.url"])) !== config.value.repositoryId) throw new Error("repository_identity_mismatch");
  const receiptFile = await stableFile(join(canonicalRoot, ".shield", "worktree-state.json"), "prepared_worktree_receipt");
  let receipt: unknown;
  try { receipt = JSON.parse(receiptFile.bytes); } catch { throw new Error("prepared_worktree_receipt_malformed"); }
  if (!validateWorktreeStateReceiptV1OrV2(receipt) || !await validateWorktreeStateReceiptFileChainV1OrV2(canonicalRoot, receipt) ||
      receipt.repositoryId !== config.value.repositoryId || receipt.destination.root !== canonicalRoot ||
      receipt.destination.branch !== branch || receipt.destination.head !== headRevision ||
      receipt.destination.originRepositoryId !== config.value.repositoryId ||
      receipt.installedByteDigests[".shield/config.json"] !== configFile.rawSha256 ||
      receipt.policy.configByteSha256 !== configFile.rawSha256) throw new Error("prepared_worktree_receipt_mismatch");
  const ignoreFile = await stableFile(join(canonicalRoot, ".shield", ".gitignore"), "prepared_worktree_ignore");
  const registryFile = await stableFile(join(canonicalRoot, ".shield", "trusted-human-bindings.json"), "prepared_worktree_registry");
  if (receipt.installedByteDigests[".shield/.gitignore"] !== ignoreFile.rawSha256 ||
      receipt.installedByteDigests[".shield/trusted-human-bindings.json"] !== registryFile.rawSha256 ||
      receipt.policy.registryByteSha256 !== registryFile.rawSha256) throw new Error("prepared_worktree_policy_mismatch");
  const commonRaw = (await git(canonicalRoot, ["rev-parse", "--git-common-dir"])).trim();
  const common = await realpath(isAbsolute(commonRaw) ? commonRaw : resolve(canonicalRoot, commonRaw));
  if (receipt.commonGitDirectory !== common || receipt.destination.commonGitDirectory !== common) throw new Error("prepared_worktree_lane_mismatch");
  const registeredRoots = (await git(canonicalRoot, ["worktree", "list", "--porcelain"])).split("\n").filter((line) => line.startsWith("worktree ")).map((line) => resolve(line.slice(9)));
  if (!registeredRoots.includes(canonicalRoot)) throw new Error("prepared_worktree_unregistered");

  const paths = resolveSupervisedMissionPaths(canonicalRoot, config.value.paths.journals, input.missionId);
  if (paths.state === "invalid") throw new Error("mission_journal_path_invalid");
  const journalFile = await stableFile(paths.value.journalPath, "mission_journal");
  const displayed = await readMissionJournalForDisplay({ repositoryRoot: canonicalRoot, configuredJournalPath: config.value.paths.journals, missionId: input.missionId });
  if (displayed.state === "invalid" || displayed.value.kind !== "profile-aware") throw new Error("unsupported_legacy_journal");
  const { entries, projection } = displayed.value;
  const kinds = ["mission.begun", "governance.decided", "implementation.authorized", "runtime.binding_recorded", "review.publication_authorized"];
  if (entries.length !== 5 || entries.some((entry, index) => entry.schemaVersion !== 9 || entry.sequence !== index || entry.entryId !== `entry:${input.missionId}:${index}` || entry.type !== kinds[index])) throw new Error("unsupported_legacy_lineage");
  if (projection.schemaVersion !== 9 || projection.missionId !== input.missionId || projection.authorization !== "authorized" || projection.execution !== "not-started" ||
      projection.finalAcceptance !== "waiting" || projection.implementationAuthorityState !== "authorized" || projection.implementationAuthority === null ||
      projection.implementationAuthorityDigest === null) throw new Error("unsupported_legacy_state");
  if (entries.filter((entry) => entry.type === "implementation.authorized").length !== 1 || entries.some((entry) => entry.type === "implementation.authority_revoked") ||
      projection.runtimeBindings.length !== 1 || projection.activeRuntimeBindings.length !== 1 || projection.publicationAuthorizations.length !== 1) throw new Error("legacy_authority_or_binding_ambiguous");

  const authority = projection.implementationAuthority;
  const authorityDigest = computeImplementationAuthorityDigest(authority);
  const authorityEntry = entries[2];
  const runtimeEntry = entries[3];
  const publicationEntry = entries[4];
  if (authorityEntry?.type !== "implementation.authorized" || runtimeEntry?.type !== "runtime.binding_recorded" || publicationEntry?.type !== "review.publication_authorized" ||
      canonicalJson(authorityEntry.payload.authority.payload) !== canonicalJson(authority) || projection.implementationAuthorityDigest !== authorityDigest ||
      authority.missionId !== input.missionId || authority.subjectId !== projection.brief.subjectId || authority.missionRevisionId !== projection.brief.revisionId ||
      authority.repositoryId !== config.value.repositoryId || authority.canonicalWritableRoot !== canonicalRoot || authority.branch !== branch ||
      authority.seatId !== "may" || authority.authorityKind !== "wheels_up" || authority.artifactRevisionId !== authority.headRevision ||
      authority.journalSequence !== 2 || !REVISION.test(authority.baseRevision) || !REVISION.test(authority.artifactRevisionId)) throw new Error("implementation_authority_binding_mismatch");

  const runtimeBinding = projection.activeRuntimeBindings[0] as Schema9RuntimeBindingV1;
  const runtime = runtimeBinding.binding;
  if (canonicalJson(runtimeEntry.payload.binding) !== canonicalJson(runtimeBinding) || runtimeBinding.implementationAuthorityRef !== authority.authorityRef ||
      runtimeBinding.implementationAuthorityDigest !== authorityDigest || runtimeBinding.implementationAuthoritySequence !== 2 ||
      !sameStrings(runtimeBinding.approvedRelativePaths, authority.approvedRelativePaths) || !sameStrings(runtimeBinding.validationCommandIds, authority.validationCommandIds) ||
      runtimeBinding.modelId !== authority.modelId || runtimeBinding.baseRevision !== authority.baseRevision || runtimeBinding.headRevision !== authority.headRevision ||
      runtime.missionId !== input.missionId || runtime.subjectId !== projection.brief.subjectId || runtime.missionRevisionId !== projection.brief.revisionId ||
      runtime.seatId !== "may" || runtime.repositoryId !== config.value.repositoryId || runtime.canonicalWritableRoot !== canonicalRoot || runtime.branch !== branch ||
      runtime.artifactRevisionId !== authority.artifactRevisionId || runtime.recordedAtSequence !== 3 || runtime.lifecycleState !== "active" || runtime.activeThroughSequence !== null ||
      runtime.coulsonAuthorizationRef !== runtimeEntry.payload.authorization.payload.authorizationId || !sameStrings(runtime.approvedScope.actionIds, authority.approvedActionIds) ||
      !sameStrings(runtime.approvedScope.effectClasses, authority.approvedEffectClasses) || !sameStrings(runtime.approvedScope.effectKeys, authority.approvedEffectKeys) ||
      !sameStrings(runtime.approvedScope.capabilities, authority.approvedCapabilities)) throw new Error("runtime_binding_mismatch");

  const publicationRecord = projection.publicationAuthorizations[0];
  const publication = publicationRecord.authority;
  const publicationDigest = computeReviewPublicationAuthorityDigest(publication);
  const semantic = computeReviewPublicationAuthoritySemanticIdentityV1(publication);
  if (semantic.state === "blocked" || publicationRecord.aliases.length !== 0 || publicationRecord.semanticIdentity !== semantic.semanticIdentity ||
      canonicalJson(publicationEntry.payload.authority) !== canonicalJson(publication) || publication.authorityKind !== "wheels_up" ||
      publication.missionId !== input.missionId || publication.subjectId !== projection.brief.subjectId || publication.missionRevisionId !== projection.brief.revisionId ||
      publication.repositoryId !== config.value.repositoryId || publication.canonicalRepositoryRoot !== canonicalRoot || publication.branch !== branch ||
      publication.baseRevisionId !== authority.baseRevision || publication.headRevisionId !== authority.headRevision ||
      publicationRecord.authorization.authorizationId !== publication.authorityRef || publicationRecord.authorization.authorityDigest !== publicationDigest ||
      publicationRecord.authorization.artifactRevisionId !== authority.artifactRevisionId || publicationRecord.authorization.authorityKind !== "wheels_up" ||
      publicationRecord.authorization.previousJournalSequence !== 3 || publicationRecord.authorization.journalSequence !== 4 || publicationRecord.journalSequence !== 4 ||
      !sameStrings(publication.authorizedPaths, publicationEntry.payload.authority.authorizedPaths)) throw new Error("publication_authority_binding_mismatch");
  if (!publication.authorizedPaths.every((path) => authority.approvedRelativePaths.includes(path))) throw new Error("publication_scope_widens_implementation_authority");

  await git(canonicalRoot, ["merge-base", "--is-ancestor", authority.baseRevision, authority.artifactRevisionId]);
  await git(canonicalRoot, ["merge-base", "--is-ancestor", authority.artifactRevisionId, headRevision]);
  const candidateChanges = parseNameStatus(await gitBytes(canonicalRoot, ["diff", "--no-renames", "--name-status", "-z", "--diff-filter=AM", authority.baseRevision, authority.artifactRevisionId, "--"]));
  const candidates = candidateChanges.filter(({ path }) => PLAN_PATH.test(path) && authority.approvedRelativePaths.includes(path));
  if (candidates.length !== 1) throw new Error("legacy_plan_candidate_missing_or_ambiguous");
  const legacyPlanPath = candidates[0]?.path as string;
  const artifactBlob = await exactBlob(canonicalRoot, authority.artifactRevisionId, legacyPlanPath);
  const currentBlob = await exactBlob(canonicalRoot, headRevision, legacyPlanPath);
  const currentFile = await stableFile(join(canonicalRoot, ...legacyPlanPath.split("/")), "legacy_plan_current", true);
  if (artifactBlob.objectId !== currentBlob.objectId || artifactBlob.mode !== currentBlob.mode) throw new Error("legacy_plan_artifact_head_mismatch");
  const expectedCurrentMode = currentBlob.mode === "100755" ? 0o755 : 0o644;
  if (!currentBlob.bytes.equals(Buffer.from(currentFile.bytes, "utf8")) || currentFile.mode !== expectedCurrentMode) throw new Error("legacy_plan_current_head_mismatch");
  const changedPaths = parseNullPaths(await gitBytes(canonicalRoot, ["diff", "--no-renames", "--name-only", "-z", authority.baseRevision, headRevision, "--"]));
  if (changedPaths.some((path) => !authority.approvedRelativePaths.includes(path))) throw new Error("advanced_head_scope_mismatch");

  const planInput: BuildMissionTransitionPlanInputV1 = {
    missionId: input.missionId,
    subjectId: projection.brief.subjectId,
    repositoryId: config.value.repositoryId,
    planningBaseRevision: authority.baseRevision,
    parentPlanCommit: authority.artifactRevisionId,
    parentPlanPath: legacyPlanPath,
    parentPlanRawSha256: sha256(artifactBlob.bytes),
    transitionKind: "fresh_authorize_wheels_up",
    boundedOutcome: projection.brief.objective,
    approvedRelativePaths: [...authority.approvedRelativePaths],
    publicationPaths: [...publication.authorizedPaths],
    approvedActionIds: [...authority.approvedActionIds],
    approvedEffectClasses: [...authority.approvedEffectClasses],
    approvedEffectKeys: [...authority.approvedEffectKeys],
    approvedCapabilities: [...authority.approvedCapabilities],
    validationCommandIds: [...authority.validationCommandIds],
    modelId: authority.modelId,
    reasoningRuntimeId: runtime.reasoningRuntimeId,
    toolExecutorId: runtime.toolExecutorId,
    exclusions: [...LEGACY_EXCLUSIONS],
  };
  const built = buildMissionTransitionPlanV1(planInput);
  if (built.state === "invalid") throw new Error(`unsupported_legacy_state:${built.errors.join(" ")}`);
  validateAuthorizeWheelsUpInput({
    baseRevision: built.plan.planningBaseRevision,
    modelId: built.plan.modelId,
    approvedRelativePaths: [...built.plan.approvedRelativePaths],
    approvedActionIds: [...built.plan.approvedActionIds],
    approvedEffectClasses: [...built.plan.approvedEffectClasses],
    approvedEffectKeys: [...built.plan.approvedEffectKeys],
    approvedCapabilities: [...built.plan.approvedCapabilities],
    validationCommandIds: [...built.plan.validationCommandIds],
    reasoningRuntimeId: built.plan.reasoningRuntimeId,
    toolExecutorId: built.plan.toolExecutorId,
    publicationPaths: [...built.plan.publicationPaths],
  });
  const begun = entries[0];
  if (begun?.type !== "mission.begun") throw new Error("unsupported_legacy_lineage");
  const coulsonBindings = begun.payload.trustedBindings.filter(({ seatId }) => seatId === "coulson");
  if (coulsonBindings.length !== 1) throw new Error("legacy_signer_binding_mismatch");
  const binding = coulsonBindings[0] as (typeof coulsonBindings)[number];
  const configuredCoulsonRefs = config.value.trustedHumanBindingRefs.filter(({ seatId }) => seatId === "coulson");
  const satisfiedRequirements = new Set(projection.evidence.map(({ requirementId }) => requirementId));
  const approvedTreePaths = [...built.plan.approvedRelativePaths];
  const literalTreePaths = approvedTreePaths.map((path) => `:(top,literal)${path}`);
  const [baseTreeBytes, headTreeBytes] = await Promise.all([
    gitBytes(canonicalRoot, ["ls-tree", "-rz", authority.baseRevision, "--", ...literalTreePaths]),
    gitBytes(canonicalRoot, ["ls-tree", "-rz", headRevision, "--", ...literalTreePaths]),
  ]);
  const baseTreeEntries = parseExactTreeEntries(baseTreeBytes, approvedTreePaths);
  const headTreeEntries = parseExactTreeEntries(headTreeBytes, approvedTreePaths);
  const pathEntries = [...baseTreeEntries, ...headTreeEntries];
  const compatibilityEnvironment: AuthorizeWheelsUpEnvironmentObservationV1 = {
    current: { kind: "profile-aware", entries, projection },
    configuredJournalPath: config.value.paths.journals,
    repository: {
      configuredRepositoryId: config.value.repositoryId,
      originUrl: (await git(canonicalRoot, ["remote", "get-url", "origin"])).trim(),
      remoteRepositoryId: config.value.repositoryId,
      canonicalRoot,
      gitTopLevel: canonicalRoot,
      branch,
      baseRevision: authority.baseRevision,
      headRevision,
      baseAncestor: true,
      statusEntries: [],
      changedPaths: [...changedPaths],
      baseTreeEntries: [...baseTreeEntries],
      headTreeEntries: [...headTreeEntries],
    },
    journalBytes: journalFile.bytes,
    journalSha256: journalByteSha256(journalFile.bytes),
    binding,
    signerBindingMatchCount: configuredCoulsonRefs.filter(({ bindingRef }) => bindingRef === binding.signingKeyRef).length,
    pendingCoulsonMissionAuthorizationCount: projection.requirements.filter(({ evidenceKind, requiredRoleId, phase, requirementId }) =>
      evidenceKind === "mission_authorization" && requiredRoleId === "coulson" && phase === "authorization" && !satisfiedRequirements.has(requirementId)).length,
    symlinkPaths: [...new Set(pathEntries.filter(({ mode }) => mode === "120000").map(({ path }) => path))].sort(),
    gitlinkPaths: [...new Set(pathEntries.filter(({ mode, type }) => mode === "160000" || type === "commit").map(({ path }) => path))].sort(),
    remainingHumanGates: projection.brief.requireSimmons
      ? ["coulson.final_acceptance", "fitz.technical_review", "simmons.product_domain_review"]
      : ["coulson.final_acceptance", "fitz.technical_review"],
  };
  if (projectFreshAuthorizeWheelsUpCompatibilityV1(built.plan, compatibilityEnvironment, true) === null) {
    throw new Error("fresh_authorize_wheels_up_compatibility_mismatch");
  }
  const canonicalPlanBytes = `${canonicalJson(built.plan)}\n`;
  const repositoryWorkspaceId = workspaceId(config.value.repositoryId, branch);
  const provenance: InternalLegacyDerivedTransitionPlanProvenanceV1 = Object.freeze({
    repositoryId: config.value.repositoryId,
    repositoryRoot: canonicalRoot,
    repositoryWorkspaceId,
    missionId: input.missionId,
    missionRevision: projection.brief.revisionId,
    journalSequence: projection.lastSequence,
    journalDigest: journalByteSha256(journalFile.bytes),
    implementationAuthorityRef: authority.authorityRef,
    implementationAuthorityDigest: authorityDigest,
    implementationAuthoritySequence: authority.journalSequence,
    publicationAuthorityRef: publication.authorityRef,
    publicationAuthorityDigest: publicationDigest,
    publicationAuthoritySemanticIdentity: semantic.semanticIdentity,
    publicationAuthorizationId: publicationRecord.authorization.authorizationId,
    publicationAuthoritySequence: publicationRecord.journalSequence,
    runtimeBindingId: runtime.bindingId,
    runtimeBindingVersion: runtime.bindingVersion,
    runtimeBindingDigest: computeSchema9RuntimeBindingDigest(runtimeBinding),
    artifactCommit: authority.artifactRevisionId,
    legacyPlanPath,
    legacyPlanBlobSha256: sha256(artifactBlob.bytes),
    artifactPlanMode: artifactBlob.mode,
    artifactPlanObjectId: artifactBlob.objectId,
    currentPlanMode: currentBlob.mode,
    currentPlanObjectId: currentBlob.objectId,
    branch,
    headRevision,
    derivedCandidateDigest: built.plan.digest,
  });
  if (runtimeEntry.payload.authorization.payload.bindingDigest !== computeRuntimeBindingDigest(runtime) ||
      runtimeEntry.payload.authorization.payload.schema9BindingDigest !== computeSchema9RuntimeBindingDigest(runtimeBinding)) throw new Error("runtime_binding_digest_mismatch");
  const provenanceDigest = digest("shield-legacy-derived-transition-plan-provenance-v1", provenance);
  const carrier: InternalDerivedTransitionPlanSourceV1 = Object.freeze({
    kind: "legacy_derived",
    virtualPath: `${LEGACY_REVIEWED_TRANSITION_SEED_ROOT}/${provenanceDigest}/transition-plan.json`,
    canonicalPlanBytes,
    transitionPlanRawSha256: sha256(canonicalPlanBytes),
    transitionPlan: built.plan,
    provenance,
    provenanceDigest,
  });
  return Object.freeze({
    repositoryRoot: canonicalRoot,
    repositoryId: config.value.repositoryId,
    repositoryWorkspaceId,
    branch,
    headRevision,
    rootIdentity: `${rootStats.dev}:${rootStats.ino}`,
    policyIdentity: `${configFile.identity}|${ignoreFile.identity}|${registryFile.identity}`,
    preparedWorktreeIdentity: receiptFile.identity,
    missionRevision: projection.brief.revisionId,
    journalIdentity: journalFile.identity,
    journalSequence: projection.lastSequence,
    journalDigest: journalByteSha256(journalFile.bytes),
    implementationAuthority: authority,
    implementationAuthorityDigest: authorityDigest,
    runtimeBinding,
    publicationAuthorityDigest: publicationDigest,
    publicationAuthoritySemanticIdentity: semantic.semanticIdentity,
    publicationAuthorizationId: publicationRecord.authorization.authorizationId,
    publicationAuthorityRef: publication.authorityRef,
    publicationAuthoritySequence: publicationRecord.journalSequence,
    legacyPlanObjectId: artifactBlob.objectId,
    legacyPlanMode: artifactBlob.mode,
    currentPlanObjectId: currentBlob.objectId,
    currentPlanMode: currentBlob.mode,
    carrier,
  });
}

function immutableObservation(observation: LegacyObservation) {
  return Object.freeze({
    repositoryRoot: observation.repositoryRoot,
    repositoryId: observation.repositoryId,
    repositoryWorkspaceId: observation.repositoryWorkspaceId,
    branch: observation.branch,
    headRevision: observation.headRevision,
    rootIdentity: observation.rootIdentity,
    policyIdentity: observation.policyIdentity,
    preparedWorktreeIdentity: observation.preparedWorktreeIdentity,
    missionRevision: observation.missionRevision,
    journalIdentity: observation.journalIdentity,
    journalSequence: observation.journalSequence,
    journalDigest: observation.journalDigest,
    implementationAuthorityRef: observation.implementationAuthority.authorityRef,
    implementationAuthorityDigest: observation.implementationAuthorityDigest,
    runtimeBindingId: observation.runtimeBinding.binding.bindingId,
    runtimeBindingVersion: observation.runtimeBinding.binding.bindingVersion,
    publicationAuthorityDigest: observation.publicationAuthorityDigest,
    publicationAuthoritySemanticIdentity: observation.publicationAuthoritySemanticIdentity,
    publicationAuthorizationId: observation.publicationAuthorizationId,
    publicationAuthorityRef: observation.publicationAuthorityRef,
    publicationAuthoritySequence: observation.publicationAuthoritySequence,
    legacyPlanObjectId: observation.legacyPlanObjectId,
    legacyPlanMode: observation.legacyPlanMode,
    currentPlanObjectId: observation.currentPlanObjectId,
    currentPlanMode: observation.currentPlanMode,
    carrier: observation.carrier,
  });
}

function seedRelativePath(observation: LegacyObservation): string {
  const key = digest("shield-legacy-reviewed-transition-seed-path-v1", {
    repositoryId: observation.repositoryId,
    repositoryWorkspaceId: observation.repositoryWorkspaceId,
    missionId: observation.carrier.provenance.missionId,
    missionRevision: observation.missionRevision,
  });
  return `${LEGACY_REVIEWED_TRANSITION_SEED_ROOT}/${key}/derivation-seed.json`;
}

const DEFAULT_SEED_PERSISTENCE: LegacyReviewedTransitionSeedPersistenceV1 = Object.freeze({
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

function seedPersistence(overrides: Partial<LegacyReviewedTransitionSeedPersistenceV1> | undefined): LegacyReviewedTransitionSeedPersistenceV1 {
  return Object.freeze({ ...DEFAULT_SEED_PERSISTENCE, ...overrides });
}

async function openVerifiedDirectory(
  path: string,
  label: string,
  operations: LegacyReviewedTransitionSeedPersistenceV1,
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
  operations: LegacyReviewedTransitionSeedPersistenceV1,
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
    } finally { await verified.handle.close(); }
  }
  return Object.freeze(identities);
}

function sameDirectoryChain(left: DirectoryChain, right: DirectoryChain): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

async function ensureSeedDirectory(
  root: string,
  relativePath: string,
  operations: LegacyReviewedTransitionSeedPersistenceV1,
): Promise<{ path: string; chain: DirectoryChain }> {
  const components = relativePath.split("/").slice(0, -1);
  let current = root;
  for (const component of components) {
    const parent = await openVerifiedDirectory(current, "legacy_seed_ancestor", operations);
    const child = join(current, component);
    let created = false;
    try {
      try {
        await operations.mkdirPath(child, 0o700);
        created = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const verifiedChild = await openVerifiedDirectory(child, "legacy_seed_directory", operations);
      try {
        const parentAfter = await parent.handle.stat();
        const parentPathAfter = await operations.lstatPath(current);
        if (parentPathAfter.isSymbolicLink() || !parentPathAfter.isDirectory() || parentAfter.dev !== parent.identity.dev || parentAfter.ino !== parent.identity.ino ||
            parentPathAfter.dev !== parent.identity.dev || parentPathAfter.ino !== parent.identity.ino) throw new Error("legacy_seed_ancestor_identity_changed");
        if (created && ((await verifiedChild.handle.stat()).mode & 0o777) !== 0o700) throw new Error("legacy_seed_directory_mode_invalid");
        if (created) {
          await operations.syncDirectoryHandle(verifiedChild.handle);
          await operations.syncDirectoryHandle(parent.handle);
        }
      } finally { await verifiedChild.handle.close(); }
    } finally { await parent.handle.close(); }
    current = child;
  }
  return { path: current, chain: await directoryChain(root, current, "legacy_seed_ancestor", operations) };
}

async function revalidateSeedDirectory(
  root: string,
  directory: string,
  retained: DirectoryChain,
  operations: LegacyReviewedTransitionSeedPersistenceV1,
): Promise<void> {
  const current = await directoryChain(root, directory, "legacy_seed_ancestor", operations);
  if (!sameDirectoryChain(current, retained)) throw new Error("legacy_seed_ancestor_identity_changed");
}

async function syncRetainedSeedDirectory(
  root: string,
  directory: string,
  retained: DirectoryChain,
  operations: LegacyReviewedTransitionSeedPersistenceV1,
): Promise<void> {
  await revalidateSeedDirectory(root, directory, retained, operations);
  const verified = await openVerifiedDirectory(directory, "legacy_seed_directory", operations);
  try {
    const expected = retained.at(-1) as DirectoryIdentity;
    if (verified.identity.dev !== expected.dev || verified.identity.ino !== expected.ino) throw new Error("legacy_seed_ancestor_identity_changed");
    await operations.syncDirectoryHandle(verified.handle);
  } finally { await verified.handle.close(); }
  await revalidateSeedDirectory(root, directory, retained, operations);
}

async function readSeed(path: string, operations: LegacyReviewedTransitionSeedPersistenceV1): Promise<Readonly<{ file: StableFile; value: unknown }> | null> {
  try {
    const file = await stableFile(path, "legacy_derivation_seed", true);
    const stats = await operations.lstatPath(path);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1 || (stats.mode & 0o777) !== 0o600 ||
        !file.identity.startsWith(`${stats.dev}:${stats.ino}:${stats.size}:`)) throw new Error("legacy_seed_identity_unsafe");
    let value: unknown;
    try { value = JSON.parse(file.bytes); } catch { value = null; }
    return Object.freeze({ file, value });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

type LegacySeedResolution = Readonly<{ seed: LegacySeedV1; file: StableFile; relativePath: string; directoryChain: DirectoryChain }>;

async function broadMissionClaimExists(observation: LegacyObservation): Promise<boolean> {
  const ledger = await readSeatDispatchReceiptLedgerSnapshotV1({
    repositoryRoot: observation.repositoryRoot,
    repositoryId: observation.repositoryId,
    repositoryWorkspaceId: observation.repositoryWorkspaceId,
  });
  if (ledger.state === "invalid") {
    if (ledger.code === "dispatch_receipt_missing") return false;
    throw new Error(`dispatch_receipt_scan_failed:${ledger.code}:${ledger.errors.join(" ")}`);
  }
  return ledger.value.projections.some((projection) =>
    projection.repositoryWorkspaceId === observation.repositoryWorkspaceId &&
    projection.parentMissionId === observation.carrier.provenance.missionId &&
    projection.parentMissionRevision === observation.missionRevision);
}

async function resolveSeed(
  observation: LegacyObservation,
  furyModel: string,
  operations: LegacyReviewedTransitionSeedPersistenceV1,
): Promise<LegacySeedResolution | ContinueLegacyReviewedTransitionClosedResultV1> {
  const relativePath = seedRelativePath(observation);
  const finalPath = join(observation.repositoryRoot, ...relativePath.split("/"));
  const directory = dirname(finalPath);
  const marker = join(directory, "derivation-seed.installing");
  const expected: LegacySeedV1 = Object.freeze({
    schemaVersion: 1,
    contractVersion: LEGACY_REVIEWED_TRANSITION_CONTRACT_VERSION,
    authority: "none",
    repositoryId: observation.repositoryId,
    repositoryWorkspaceId: observation.repositoryWorkspaceId,
    missionId: observation.carrier.provenance.missionId,
    missionRevision: observation.missionRevision,
    furyModel,
    observation: immutableObservation(observation),
    carrier: observation.carrier,
  });
  const expectedBytes = `${canonicalJson(expected)}\n`;
  try {
    const beforeDirectoryEffect = await readSeed(finalPath, operations);
    if (beforeDirectoryEffect === null && await broadMissionClaimExists(observation)) {
      return closed("recovery_required", "LEGACY_SEED_MISSING_AFTER_CLAIM", "A dispatch claim exists for this repository workspace, mission, and mission revision without the exact derivation seed.");
    }
    const ensured = await ensureSeedDirectory(observation.repositoryRoot, relativePath, operations);
    try {
      const markerStats = await operations.lstatPath(marker);
      if (markerStats.isFile()) return closed("recovery_required", "LEGACY_SEED_INSTALL_INCOMPLETE", "A legacy derivation seed install marker requires recovery.");
      return closed("recovery_required", "LEGACY_SEED_PATH_UNSAFE", "Legacy derivation seed marker is unsafe.");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const existing = await readSeed(finalPath, operations);
    if (existing !== null) {
      if (!plain(existing.value) || existing.file.bytes !== expectedBytes || canonicalJson(existing.value) !== canonicalJson(expected)) return closed("conflict", "LEGACY_SEED_CONFLICT", "The immutable legacy derivation seed conflicts with current evidence or Fury model.");
      await revalidateSeedDirectory(observation.repositoryRoot, directory, ensured.chain, operations);
      const readback = await readSeed(finalPath, operations);
      if (readback === null || readback.file.bytes !== existing.file.bytes || readback.file.identity !== existing.file.identity) throw new Error("legacy_seed_replaced_or_changed");
      return Object.freeze({ seed: expected, file: readback.file, relativePath, directoryChain: ensured.chain });
    }
    await revalidateSeedDirectory(observation.repositoryRoot, directory, ensured.chain, operations);
    if (await broadMissionClaimExists(observation)) {
      return closed("recovery_required", "LEGACY_SEED_MISSING_AFTER_CLAIM", "A dispatch claim exists for this repository workspace, mission, and mission revision without the exact derivation seed.");
    }
    const handle = await operations.openPath(marker, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      const encoded = Buffer.from(expectedBytes, "utf8");
      if (await operations.writeFileHandle(handle, encoded) !== encoded.byteLength) throw new Error("legacy_seed_partial_write");
      await operations.syncFileHandle(handle);
    } finally { await handle.close(); }
    try {
      await syncRetainedSeedDirectory(observation.repositoryRoot, directory, ensured.chain, operations);
      await revalidateSeedDirectory(observation.repositoryRoot, directory, ensured.chain, operations);
      await operations.linkPath(marker, finalPath);
      await syncRetainedSeedDirectory(observation.repositoryRoot, directory, ensured.chain, operations);
      await revalidateSeedDirectory(observation.repositoryRoot, directory, ensured.chain, operations);
      await operations.unlinkPath(marker);
      await syncRetainedSeedDirectory(observation.repositoryRoot, directory, ensured.chain, operations);
    } catch (error) {
      return closed("recovery_required", "LEGACY_SEED_PERSISTENCE_UNCERTAIN", error instanceof Error ? error.message : String(error));
    }
    await revalidateSeedDirectory(observation.repositoryRoot, directory, ensured.chain, operations);
    const installed = await readSeed(finalPath, operations);
    if (installed === null || installed.file.bytes !== expectedBytes || canonicalJson(installed.value) !== canonicalJson(expected)) return closed("recovery_required", "LEGACY_SEED_READBACK_MISMATCH", "Legacy derivation seed readback mismatched its canonical bytes.");
    await revalidateSeedDirectory(observation.repositoryRoot, directory, ensured.chain, operations);
    return Object.freeze({ seed: expected, file: installed.file, relativePath, directoryChain: ensured.chain });
  } catch (error) {
    return closed("recovery_required", "LEGACY_SEED_UNAVAILABLE", error instanceof Error ? error.message : String(error));
  }
}

async function reobserveExact(
  input: ContinueLegacyReviewedTransitionInputV1,
  expected: LegacyObservation,
  seed: LegacySeedResolution,
  operations: LegacyReviewedTransitionSeedPersistenceV1,
): Promise<void> {
  const observed = await observe(input);
  if (canonicalJson(immutableObservation(observed)) !== canonicalJson(immutableObservation(expected))) throw new Error("legacy_derivation_drift");
  const directory = dirname(join(expected.repositoryRoot, ...seed.relativePath.split("/")));
  await revalidateSeedDirectory(expected.repositoryRoot, directory, seed.directoryChain, operations);
  const readback = await readSeed(join(expected.repositoryRoot, ...seed.relativePath.split("/")), operations);
  if (readback === null || readback.file.bytes !== seed.file.bytes || readback.file.identity !== seed.file.identity || canonicalJson(readback.value) !== canonicalJson(seed.seed)) throw new Error("legacy_seed_replaced_or_changed");
  await revalidateSeedDirectory(expected.repositoryRoot, directory, seed.directoryChain, operations);
}

function validateInput(input: unknown): ContinueLegacyReviewedTransitionInputV1 | null {
  if (!exact(input, INPUT_FIELDS) || typeof input.repositoryRoot !== "string" || !isAbsolute(input.repositoryRoot) || resolve(input.repositoryRoot) !== input.repositoryRoot ||
      typeof input.missionId !== "string" || !IDENTIFIER.test(input.missionId) || typeof input.furyModel !== "string" || !IDENTIFIER.test(input.furyModel)) return null;
  return Object.freeze({ missionId: input.missionId, repositoryRoot: input.repositoryRoot, furyModel: input.furyModel });
}

function validateGraphPreflightInput(input: unknown): Readonly<{ missionId: string; repositoryRoot: string }> | null {
  if (!exact(input, GRAPH_PREFLIGHT_INPUT_FIELDS) || typeof input.repositoryRoot !== "string" || !isAbsolute(input.repositoryRoot) ||
      resolve(input.repositoryRoot) !== input.repositoryRoot || typeof input.missionId !== "string" || !IDENTIFIER.test(input.missionId)) return null;
  return Object.freeze({ missionId: input.missionId, repositoryRoot: input.repositoryRoot });
}

function protectedGraphNotAbsent(...errors: readonly string[]): PreflightLegacyProtectedGraphAbsenceResultV1 {
  return Object.freeze({
    authority: "none" as const,
    state: "blocked" as const,
    code: "PROTECTED_GRAPH_NOT_ABSENT",
    errors: Object.freeze(errors.length === 0 ? ["The protected mission-preparation graph root is not absent."] : [...errors]),
  });
}

export async function preflightLegacyProtectedGraphAbsenceV1(
  input: unknown,
  dependencies: LegacyProtectedGraphPreflightDependenciesV1 = {},
): Promise<PreflightLegacyProtectedGraphAbsenceResultV1> {
  const checked = validateGraphPreflightInput(input);
  if (checked === null) return protectedGraphNotAbsent("Malformed protected graph absence preflight request.");
  const lstatPath = dependencies.lstatPath ?? lstat;
  const realpathPath = dependencies.realpathPath ?? realpath;
  const openPath = dependencies.openPath ?? open;
  let graphRoot: string;
  let protectedDirectories: readonly string[];
  try {
    const canonicalRoot = await realpathPath(checked.repositoryRoot);
    if (canonicalRoot !== checked.repositoryRoot) return protectedGraphNotAbsent("Repository root is not canonical.");
    const rootStats = await lstatPath(canonicalRoot);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return protectedGraphNotAbsent("Repository root is not a safe directory.");
    const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(canonicalRoot, checked.missionId);
    graphRoot = paths.missionDirectory;
    protectedDirectories = [canonicalRoot, paths.shieldDirectory, paths.auditDirectory, paths.missionPreparationDirectory];
  } catch (error) {
    return protectedGraphNotAbsent(error instanceof Error ? error.message : String(error));
  }

  const retained: ProtectedDirectoryIdentity[] = [];
  let missingDirectory: string | null = null;
  let result: PreflightLegacyProtectedGraphAbsenceResultV1 | null = null;
  const sameIdentity = (left: Awaited<ReturnType<typeof lstat>>, right: ProtectedDirectoryIdentity): boolean =>
    left.dev === right.dev && left.ino === right.ino && left.mode === right.mode && left.size === right.size &&
    left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
  const revalidateRetained = async (): Promise<string | null> => {
    for (const identity of retained) {
      try {
        const held = await identity.handle.stat();
        const current = await lstatPath(identity.path);
        if (!held.isDirectory() || current.isSymbolicLink() || !current.isDirectory() || !sameIdentity(current, identity) ||
            held.dev !== identity.dev || held.ino !== identity.ino || held.mode !== identity.mode || held.size !== identity.size ||
            held.mtimeMs !== identity.mtimeMs || held.ctimeMs !== identity.ctimeMs || await realpathPath(identity.path) !== identity.path) {
          return "Protected mission-preparation graph ancestor changed during absence verification.";
        }
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
    return null;
  };
  const requireAbsent = async (path: string): Promise<string | null> => {
    try {
      await lstatPath(path);
      return "Protected mission-preparation graph state appeared during absence verification.";
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? null : error instanceof Error ? error.message : String(error);
    }
  };

  try {
    for (const directory of protectedDirectories) {
      let firstDirectory: Awaited<ReturnType<typeof lstat>>;
      try {
        firstDirectory = await lstatPath(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          missingDirectory = directory;
          break;
        }
        result = protectedGraphNotAbsent(error instanceof Error ? error.message : String(error));
        break;
      }
      if (firstDirectory.isSymbolicLink() || !firstDirectory.isDirectory()) {
        result = protectedGraphNotAbsent("Protected mission-preparation graph parent is unsafe.");
        break;
      }
      let handle: FileHandle | null = null;
      try {
        handle = await openPath(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        const held = await handle.stat();
        if (!held.isDirectory() || held.dev !== firstDirectory.dev || held.ino !== firstDirectory.ino || held.mode !== firstDirectory.mode ||
            held.size !== firstDirectory.size || held.mtimeMs !== firstDirectory.mtimeMs || held.ctimeMs !== firstDirectory.ctimeMs ||
            await realpathPath(directory) !== directory) {
          result = protectedGraphNotAbsent("Protected mission-preparation graph parent changed during absence verification.");
          await handle.close();
          break;
        }
        retained.push({
          path: directory,
          handle,
          dev: held.dev,
          ino: held.ino,
          mode: held.mode,
          size: held.size,
          mtimeMs: held.mtimeMs,
          ctimeMs: held.ctimeMs,
        });
        handle = null;
      } catch (error) {
        if (handle !== null) await handle.close().catch(() => undefined);
        result = protectedGraphNotAbsent(error instanceof Error ? error.message : String(error));
        break;
      }
    }

    if (result === null) {
      const absentPath = missingDirectory ?? graphRoot;
      const initialAbsenceError = await requireAbsent(absentPath);
      if (initialAbsenceError !== null) result = protectedGraphNotAbsent(initialAbsenceError);
    }
    if (result === null) {
      try {
        await dependencies.beforeFinalRevalidation?.();
      } catch (error) {
        result = protectedGraphNotAbsent(error instanceof Error ? error.message : String(error));
      }
    }
    if (result === null) {
      const retainedError = await revalidateRetained();
      if (retainedError !== null) result = protectedGraphNotAbsent(retainedError);
    }
    if (result === null) {
      const finalAbsenceError = await requireAbsent(missingDirectory ?? graphRoot);
      if (finalAbsenceError !== null) result = protectedGraphNotAbsent(finalAbsenceError);
    }
    if (result === null) {
      const retainedError = await revalidateRetained();
      result = retainedError === null
        ? Object.freeze({ authority: "none" as const, state: "absent" as const })
        : protectedGraphNotAbsent(retainedError);
    }
  } finally {
    let closeError: unknown = null;
    for (const identity of retained.reverse()) {
      try { await identity.handle.close(); } catch (error) { closeError ??= error; }
    }
    if (closeError !== null) result = protectedGraphNotAbsent(closeError instanceof Error ? closeError.message : String(closeError));
  }
  return result ?? protectedGraphNotAbsent("Protected graph absence verification did not complete.");
}

export async function continueLegacyReviewedTransitionV1(
  input: unknown,
  dependencies: LegacyReviewedTransitionDependenciesV1 = {},
): Promise<ContinueLegacyReviewedTransitionResultV1> {
  const checked = validateInput(input);
  if (checked === null) return closed("invalid", "MALFORMED_LEGACY_CONTINUATION_REQUEST", "Legacy continuation accepts only missionId, repositoryRoot, and furyModel.");
  const preflight = await preflightLegacyProtectedGraphAbsenceV1({ missionId: checked.missionId, repositoryRoot: checked.repositoryRoot });
  if (preflight.state !== "absent") return preflight;
  let initial: LegacyObservation;
  try { initial = await observe(checked); } catch (error) {
    return closed("invalid", "LEGACY_STATE_INELIGIBLE", error instanceof Error ? error.message : String(error));
  }
  const persistence = seedPersistence(dependencies.seedPersistence);
  const seed = await resolveSeed(initial, checked.furyModel, persistence);
  if ("state" in seed) return seed;
  try {
    await dependencies.beforeReviewedTransition?.();
    await reobserveExact(checked, initial, seed, persistence);
  } catch (error) {
    return closed("recovery_required", "LEGACY_PRE_DISPATCH_REOBSERVATION_FAILED", error instanceof Error ? error.message : String(error));
  }
  const host = dependencies.reviewedTransitionHost ?? prepareReviewedMissionTransitionFromDerivedSourceV1;
  const result = await host(
    { missionId: checked.missionId, repositoryRoot: checked.repositoryRoot, furyModel: checked.furyModel },
    initial.carrier,
    dependencies.reviewedTransitionDependencies,
    async () => (await observe(checked)).carrier,
  );
  try {
    await dependencies.afterReviewedTransition?.(result);
    await reobserveExact(checked, initial, seed, persistence);
  } catch (error) {
    return closed("recovery_required", "LEGACY_POST_DISPATCH_REOBSERVATION_FAILED", error instanceof Error ? error.message : String(error));
  }
  return result;
}
