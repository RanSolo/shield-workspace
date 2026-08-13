import { constants } from "node:fs";
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFile as execFileNode } from "node:child_process";
import { access, chmod, lstat, mkdir, open, readFile, realpath as fsRealpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { stdin as input, stdout as outputStream } from "node:process";
import { types } from "node:util";
import { configuredAdapterIds, parseShieldConfig, type ShieldConfig } from "./config.mjs";
import {
  canonicalJson,
  createDelegatedAuthorizationEntry,
  computeRuntimeBindingDigest,
  createDelegatedInvalidationEntry,
  createEvidenceEntry,
  createGovernanceEntry,
  createMissionBegunEntry,
  deriveRepositoryMissionBindings,
  planMissionStep,
  replaySupervisedMissionJournal,
  selectCoulsonOperationBinding,
  validateSupervisedMissionBrief,
  validateTrustedBindingRegistry,
  type ContractResult,
  type SignedHumanEvidence,
  type SupervisedMissionProjection,
  type TrustedHumanBinding,
  type TrustedBindingRegistry,
} from "./mission-v2.mjs";
import {
  appendProfileAwareMissionEntryV1,
  appendProfileAwareMissionEntriesAtomicV1,
  appendSupervisedMissionEntry,
  initializeProfileAwareMissionJournalV1,
  initializeSupervisedMissionJournal,
  readMissionJournalForDisplay,
  readSupervisedMissionJournal,
  journalByteSha256,
  resolveSupervisedMissionPaths,
  type MissionJournalDisplay,
} from "./mission-store.mjs";
import {
  createProfileAwareCommunicationRequestEntryV1,
  createProfileAwareCommunicationResultEntryV1,
  createProfileAwareMissionBrief,
  createProfileAwareGovernanceDecisionEntryV1,
  createProfileAwareDaisyCoordinationAuthorityEntryV1,
  createProfileAwareDaisyRuntimeBindingEntryV1,
  createProfileAwareImplementationAuthorityEntryV1,
  createProfileAwareReviewPublicationAuthorizationEntryV1,
  createProfileAwareRuntimeBindingRecordedEntryV1,
  profileAwareMissionIntakeV1,
  replayProfileAwareMissionJournal,
  validateProfileAwareMissionBrief,
  type ProfileAwareMissionBriefContentV1,
  type ProfileAwareMissionEntryV1,
  type ProfileAwareProjectionV1,
  type SignedProfileEvidenceV1,
} from "./profile-aware-mission-v1.mjs";
import {
  validateAdapterCandidate,
  type CommunicationOperation,
  type ReviewPublicationCommunicationResultAdapterCandidate,
} from "./adapter-v1.mjs";
import {
  computeReviewPublicationAuthorityDigest,
  evaluateReviewPublicationV1,
  type ReviewPublicationEffect,
  type ReviewPublicationAuthorityV1,
} from "./review-publication-v1.mjs";
import {
  executeAuthorizeWheelsUpV1,
} from "./authorize-wheels-up-executor-v1.mjs";
import {
  materializeReviewedMissionTransitionV1,
  resolvePreparedMissionTransitionV1,
  resolveSeatDispatchIdentityByReceiptIdV1,
  validateMissionTransitionPlanReviewV1,
} from "./mission-preparation-host-v1.mjs";
import { validateTransitionPlanV1 } from "@shield/mission-preparation";
import { createDelegationLogEntry, DELEGATED_INVALIDATION_REASONS, type SignedWheelsOffDelegation, type SignedWheelsOffRevocation, type WheelsOffEligibility } from "./delegation-v1.mjs";
import { appendDelegationEntry, readDelegationLog } from "./delegation-store.mjs";
import {
  assertMissionSignerSnapshotUnchanged,
  captureMissionSignerSnapshot,
  createSigner,
  signPayloadBatchWithSigner,
  signWithSigner,
  validateSignerCreationInput,
  type SignerCreationInput,
  type SignerCreationResult,
} from "./mission-signer.mjs";
import {
  computeImplementationAuthorityDigest,
  computeSchema9RuntimeBindingDigest,
  validateImplementationAuthorityV1,
  validateSchema9RuntimeBindingAuthorizationPayload,
  validateSchema9RuntimeBindingV1,
  type ImplementationAuthorityV1,
  type Schema9RuntimeBindingAuthorizationPayload,
  type Schema9RuntimeBindingV1,
} from "./implementation-authority-v1.mjs";
import {
  DAISY_COORDINATION_ACTION_ID,
  DAISY_COORDINATION_AUTHORITY_CONTRACT_VERSION,
  DAISY_COORDINATION_AUTHORITY_KIND,
  DAISY_COORDINATION_CAPABILITY_CLASS,
  DAISY_COORDINATION_EFFECT_CLASS,
  DAISY_COORDINATION_VALIDATION_ID,
  compareDaisyCanonicalStringsV1,
  computeDaisyCoordinationAuthorityDigest,
  computeDaisyCoordinationRuntimeBindingDigest,
  rootsOverlapV1,
  validateDaisyCoordinationAuthorityV1,
  validateDaisyCoordinationRuntimeBindingAuthorizationV1,
  validateDaisyCoordinationRuntimeBindingV1,
  type DaisyCoordinationAuthorityV1,
  type DaisyCoordinationRuntimeBindingAuthorizationV1,
  type DaisyCoordinationRuntimeBindingV1,
} from "./daisy-coordination-authority-v1.mjs";
import type { RuntimeBinding } from "./permission-v1.mjs";
import {
  renderAuthorizeWheelsUpHumanV1,
  renderAuthorizeWheelsUpReceiptHumanV1,
} from "./mission-human-output-v1.mjs";

const CONFIG_PATH = join(".shield", "config.json");
const BINDINGS_PATH = join(".shield", "trusted-human-bindings.json");

export class MissionCliError extends Error {
  constructor(message: string, readonly exitCode: 1 | 2 = 2) {
    super(message);
  }
}

interface ParsedOptions {
  values: Map<string, string>;
  flags: Set<string>;
}

function parseOptions(args: string[], valueNames: readonly string[], flagNames: readonly string[] = []): ParsedOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const allowedValues = new Set(valueNames);
  const allowedFlags = new Set(flagNames);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (allowedFlags.has(name)) {
      if (flags.has(name)) throw new MissionCliError(`Duplicate option: ${name}.`);
      flags.add(name);
      continue;
    }
    if (!allowedValues.has(name)) throw new MissionCliError(`Unknown option: ${name}.`);
    if (values.has(name)) throw new MissionCliError(`Duplicate option: ${name}.`);
    const value = args[++index];
    if (value === undefined || value.startsWith("--")) throw new MissionCliError(`${name} requires a value.`);
    values.set(name, value);
  }
  return { values, flags };
}

function required(options: ParsedOptions, name: string): string {
  const value = options.values.get(name);
  if (value === undefined || value.trim() === "") throw new MissionCliError(`Missing required option: ${name}.`);
  return value;
}

async function exactRoot(rootArgument: string | undefined, writable: boolean): Promise<string> {
  const root = resolve(rootArgument ?? process.cwd());
  try {
    const stats = await lstat(root);
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new MissionCliError(`Repository root must be a real directory: ${root}.`);
    await access(root, writable ? constants.R_OK | constants.W_OK : constants.R_OK);
  } catch (error) {
    if (error instanceof MissionCliError) throw error;
    throw new MissionCliError(`Repository root is inaccessible: ${root}.`);
  }
  return root;
}

async function regularTextFile(path: string, label: string): Promise<string> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new MissionCliError(`${label} must be a regular file: ${path}.`);
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof MissionCliError) throw error;
    throw new MissionCliError(`${label} is missing or unreadable: ${path}.`);
  }
}

async function jsonFile(path: string, label: string): Promise<unknown> {
  try { return JSON.parse(await regularTextFile(path, label)); }
  catch (error) {
    if (error instanceof MissionCliError) throw error;
    throw new MissionCliError(`${label} contains malformed JSON: ${path}.`);
  }
}

async function repositoryConfig(root: string): Promise<ShieldConfig> {
  const parsed = parseShieldConfig(await regularTextFile(join(root, CONFIG_PATH), "SHIELD configuration"));
  if (parsed.state === "invalid") throw new MissionCliError(parsed.issues.map(({ message }) => message).join(" "), 1);
  return parsed.value;
}

interface RepositoryConfigSnapshot {
  config: ShieldConfig;
  bytes: string;
  identity: string;
}

async function repositoryConfigSnapshot(root: string): Promise<RepositoryConfigSnapshot> {
  const path = join(root, CONFIG_PATH);
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat();
    if (!before.isFile()) throw new MissionCliError(`SHIELD configuration must be a regular file: ${path}.`);
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathStats = await lstat(path);
    if (pathStats.isSymbolicLink() || !pathStats.isFile() ||
        before.dev !== after.dev || before.ino !== after.ino ||
        before.dev !== pathStats.dev || before.ino !== pathStats.ino) {
      throw new MissionCliError("SHIELD configuration path identity changed during snapshot.", 1);
    }
    const parsed = parseShieldConfig(bytes);
    if (parsed.state === "invalid") throw new MissionCliError(parsed.issues.map(({ message }) => message).join(" "), 1);
    return {
      config: canonicalSnapshot(parsed.value),
      bytes,
      identity: `${String(before.dev)}:${String(before.ino)}:${String(before.mode & 0o7777)}`,
    };
  } catch (error) {
    if (error instanceof MissionCliError) throw error;
    throw new MissionCliError(`SHIELD configuration is missing, unsafe, or unreadable: ${path}.`, 1);
  } finally {
    if (handle !== undefined) await handle.close();
  }
}

function requireGitHubConfiguration(snapshot: RepositoryConfigSnapshot): void {
  if (!configuredAdapterIds(snapshot.config).includes("github")) {
    throw new MissionCliError("GitHub review publication requires github in the frozen repository configuration.", 1);
  }
}

export function assertRepositoryConfigFresh(
  initial: RepositoryConfigSnapshot,
  fresh: RepositoryConfigSnapshot,
): void {
  requireGitHubConfiguration(fresh);
  if (initial.bytes !== fresh.bytes || initial.identity !== fresh.identity ||
      canonicalJson(initial.config) !== canonicalJson(fresh.config)) {
    throw new MissionCliError("SHIELD configuration drifted before GitHub request append.", 1);
  }
}

function unwrap<T>(result: ContractResult<T>): T {
  if (result.state === "invalid") throw new MissionCliError(`${result.code}: ${result.errors.join(" ")}`, 1);
  return result.value;
}

function produce<T>(action: () => T): T {
  try { return action(); }
  catch (error) {
    throw new MissionCliError(error instanceof Error ? error.message : "Mission contract producer failed.", 1);
  }
}

function output(value: unknown, json: boolean, human: string): void {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${human}\n`);
}

function missionPaths(root: string, config: ShieldConfig, missionId: string) {
  return { repositoryRoot: root, configuredJournalPath: config.paths.journals, missionId };
}

type ProfileAwareJournal = Extract<MissionJournalDisplay, { kind: "profile-aware" }>;
type ApprovedEffectClass = "behavioral_implementation" | "verification" | "coordination";
type WheelsUpIntent = {
  baseRevision: string;
  modelId: string;
  approvedRelativePaths: string[];
  approvedActionIds: string[];
  approvedEffectClasses: ApprovedEffectClass[];
  approvedEffectKeys: string[];
  approvedCapabilities: string[];
  validationCommandIds: string[];
};
type BindIntent = { reasoningRuntimeId: string; toolExecutorId: string };
type AuthorizeWheelsUpIntent = WheelsUpIntent & BindIntent & { publicationPaths: string[] };
type AuthorizeDaisyCoordinationIntent = {
  effectKey: string;
  approvedReadRoots: string[];
  durableArtifactRoot: string;
  runtimeId: string;
  modelId: string;
  executorId: string;
};
type RepositoryObservation = { canonicalRoot: string; branch: string; head: string };
type PublicationAuthorizationIntent = {
  baseRevision: string;
  authorizedPaths: string[];
  permittedEffects: ReviewPublicationEffect[];
};
type PublicationRequestIntent = {
  authorizationId: string;
  operation: CommunicationOperation;
  targetRef: string;
  requestedEffects: ReviewPublicationEffect[];
};
export type PublicationTreeEntry = { mode: string; type: string; path: string };
export type PublicationRepositoryObservation = {
  configuredRepositoryId: string;
  originUrl: string;
  remoteRepositoryId: string;
  canonicalRoot: string;
  gitTopLevel: string;
  branch: string;
  baseRevision: string;
  headRevision: string;
  baseAncestor: true;
  statusEntries: string[];
  changedPaths: string[];
  baseTreeEntries: PublicationTreeEntry[];
  headTreeEntries: PublicationTreeEntry[];
};

const INITIAL_DRAFT_EFFECTS = Object.freeze([
  "review.branch.push",
  "review.pull_request.create_draft",
] as const satisfies readonly ReviewPublicationEffect[]);
const ONE_PASSCODE_EXCLUSIONS = Object.freeze([
  "review.comment.publish",
  "review.pull_request.update_draft",
  "review.pull_request.mark_ready",
  "merge",
  "deployment",
  "release",
  "final_acceptance",
] as const);

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function closedObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!plainObject(value) || Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
    throw new MissionCliError(`${label} must contain exactly: ${fields.join(", ")}.`, 1);
  }
  return value;
}

function wheelsUpIntent(value: unknown): WheelsUpIntent {
  const fields = [
    "baseRevision", "modelId", "approvedRelativePaths", "approvedActionIds",
    "approvedEffectClasses", "approvedEffectKeys", "approvedCapabilities", "validationCommandIds",
  ] as const;
  return closedObject(value, fields, "Wheels Up input") as unknown as WheelsUpIntent;
}

function strictClosedDataObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new MissionCliError(`${label} is not a plain closed data object.`, 1);
  }
  const keys = Reflect.ownKeys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key)) ||
      fields.some((field) => {
        const descriptor = descriptors[field];
        return !descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable;
      })) {
    throw new MissionCliError(`${label} must contain only enumerable data fields: ${fields.join(", ")}.`, 1);
  }
  return Object.fromEntries(fields.map((field) => [field, descriptors[field].value]));
}

type StringComparator = (left: string, right: string) => number;

function canonicalPublicationPathCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function strictSortedStrings(
  value: unknown,
  label: string,
  compare: StringComparator = (left, right) => left.localeCompare(right),
): string[] {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length < 1 || value.length > 256 || Reflect.ownKeys(value).length !== value.length + 1) {
    throw new MissionCliError(`${label} must be a non-empty dense sorted array.`, 1);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable ||
        typeof descriptor.value !== "string" || descriptor.value.length === 0) {
      throw new MissionCliError(`${label} contains an unsafe or malformed item.`, 1);
    }
    result.push(descriptor.value);
  }
  const sorted = [...result].sort(compare);
  if (result.some((item, index) => item !== sorted[index]) || new Set(result).size !== result.length) {
    throw new MissionCliError(`${label} must be sorted and contain no duplicates.`, 1);
  }
  return result;
}

export function validateAuthorizeWheelsUpInput(value: unknown): Readonly<AuthorizeWheelsUpIntent> {
  const fields = [
    "baseRevision", "modelId", "approvedRelativePaths", "approvedActionIds",
    "approvedEffectClasses", "approvedEffectKeys", "approvedCapabilities", "validationCommandIds",
    "reasoningRuntimeId", "toolExecutorId", "publicationPaths",
  ] as const;
  const input = strictClosedDataObject(value, fields, "Authorize Wheels Up input");
  for (const field of ["baseRevision", "modelId", "reasoningRuntimeId", "toolExecutorId"] as const) {
    const fieldValue = input[field];
    if (typeof fieldValue !== "string" || fieldValue.trim() !== fieldValue || fieldValue.length === 0) {
      throw new MissionCliError(`Authorize Wheels Up ${field} is malformed.`, 1);
    }
  }
  const result: AuthorizeWheelsUpIntent = {
    baseRevision: input.baseRevision as string,
    modelId: input.modelId as string,
    approvedRelativePaths: strictSortedStrings(input.approvedRelativePaths, "approvedRelativePaths"),
    approvedActionIds: strictSortedStrings(input.approvedActionIds, "approvedActionIds"),
    approvedEffectClasses: strictSortedStrings(input.approvedEffectClasses, "approvedEffectClasses") as ApprovedEffectClass[],
    approvedEffectKeys: strictSortedStrings(input.approvedEffectKeys, "approvedEffectKeys"),
    approvedCapabilities: strictSortedStrings(input.approvedCapabilities, "approvedCapabilities"),
    validationCommandIds: strictSortedStrings(input.validationCommandIds, "validationCommandIds"),
    reasoningRuntimeId: input.reasoningRuntimeId as string,
    toolExecutorId: input.toolExecutorId as string,
    publicationPaths: strictSortedStrings(input.publicationPaths, "publicationPaths", canonicalPublicationPathCompare),
  };
  return Object.freeze(result);
}

export function validateAuthorizeDaisyCoordinationInput(value: unknown): Readonly<AuthorizeDaisyCoordinationIntent> {
  const fields = ["effectKey", "approvedReadRoots", "durableArtifactRoot", "runtimeId", "modelId", "executorId"] as const;
  const input = strictClosedDataObject(value, fields, "Authorize Daisy coordination input");
  for (const field of ["effectKey", "durableArtifactRoot", "runtimeId", "modelId", "executorId"] as const) {
    const candidate = input[field];
    if (typeof candidate !== "string" || candidate.trim() !== candidate || candidate.length === 0) {
      throw new MissionCliError(`Authorize Daisy coordination ${field} is malformed.`, 1);
    }
  }
  const intent: AuthorizeDaisyCoordinationIntent = {
    effectKey: input.effectKey as string,
    approvedReadRoots: strictSortedStrings(input.approvedReadRoots, "approvedReadRoots", compareDaisyCanonicalStringsV1),
    durableArtifactRoot: input.durableArtifactRoot as string,
    runtimeId: input.runtimeId as string,
    modelId: input.modelId as string,
    executorId: input.executorId as string,
  };
  return Object.freeze({ ...intent, approvedReadRoots: Object.freeze([...intent.approvedReadRoots]) }) as Readonly<AuthorizeDaisyCoordinationIntent>;
}

function bindIntent(value: unknown): BindIntent {
  return closedObject(value, ["reasoningRuntimeId", "toolExecutorId"], "May binding input") as unknown as BindIntent;
}

function publicationAuthorizationIntent(value: unknown): PublicationAuthorizationIntent {
  const intent = closedObject(value, ["baseRevision", "authorizedPaths", "permittedEffects"], "Publication authorization input");
  if (typeof intent.baseRevision !== "string" ||
      !Array.isArray(intent.authorizedPaths) || intent.authorizedPaths.some((path) => typeof path !== "string") ||
      !Array.isArray(intent.permittedEffects) || intent.permittedEffects.some((effect) => typeof effect !== "string")) {
    throw new MissionCliError("Publication authorization input fields are malformed.", 1);
  }
  return intent as unknown as PublicationAuthorizationIntent;
}

function publicationRequestIntent(value: unknown): PublicationRequestIntent {
  const intent = closedObject(value, ["authorizationId", "operation", "targetRef", "requestedEffects"], "Publication request input");
  if (typeof intent.authorizationId !== "string" || typeof intent.operation !== "string" ||
      typeof intent.targetRef !== "string" || !Array.isArray(intent.requestedEffects) ||
      intent.requestedEffects.some((effect) => typeof effect !== "string")) {
    throw new MissionCliError("Publication request input fields are malformed.", 1);
  }
  return intent as unknown as PublicationRequestIntent;
}

function profileAwareBindings(current: ProfileAwareJournal): TrustedHumanBinding[] {
  const begun = current.entries[0];
  if (!begun || begun.type !== "mission.begun") throw new MissionCliError("Profile-aware journal has no trusted begin entry.", 1);
  return begun.payload.trustedBindings.map((binding) => ({ ...binding }));
}

function coulsonBinding(current: ProfileAwareJournal): TrustedHumanBinding {
  const matches = profileAwareBindings(current).filter(({ seatId }) => seatId === "coulson");
  if (matches.length !== 1) throw new MissionCliError("Profile-aware journal requires exactly one frozen Coulson binding.", 1);
  return matches[0];
}

async function currentProfileAwareMission(root: string, config: ShieldConfig, missionId: string): Promise<ProfileAwareJournal> {
  const current = unwrap(await readMissionJournalForDisplay(missionPaths(root, config, missionId)));
  if (current.kind !== "profile-aware") throw new MissionCliError("Command requires a schema-9 profile-aware mission journal.", 1);
  return current;
}

function gitOutput(root: string, args: readonly string[]): Promise<string> {
  return new Promise((resolveValue, reject) => {
    execFileNode("git", ["-C", root, ...args], {
      encoding: "utf8",
      windowsHide: true,
      env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    }, (error, stdout) => {
      if (error) return reject(error);
      resolveValue(stdout);
    });
  });
}

async function gitValue(root: string, args: readonly string[]): Promise<string> {
  return (await gitOutput(root, args)).trim().split("\n")[0] ?? "";
}

function nulRecords(value: string, label: string): string[] {
  if (value.length === 0) return [];
  if (!value.endsWith("\0")) throw new MissionCliError(`${label} was not NUL-terminated.`, 1);
  return value.slice(0, -1).split("\0");
}

function treeEntries(value: string, label: string): PublicationTreeEntry[] {
  return nulRecords(value, label).map((record) => {
    const match = /^(?<mode>[0-9]{6}) (?<type>[a-z]+) [0-9a-f]+\t(?<path>[\s\S]+)$/u.exec(record);
    if (!match?.groups) throw new MissionCliError(`${label} contains malformed tree evidence.`, 1);
    return { mode: match.groups.mode, type: match.groups.type, path: match.groups.path };
  });
}

function exactTreeEntries(value: string, label: string, authorizedPaths: readonly string[]): PublicationTreeEntry[] {
  const entries = treeEntries(value, label);
  const authorized = new Set(authorizedPaths);
  const observed = new Set<string>();
  for (const entry of entries) {
    if (!authorized.has(entry.path) || observed.has(entry.path)) {
      throw new MissionCliError(`${label} contains an unexpected or duplicate path.`, 1);
    }
    observed.add(entry.path);
  }
  return entries;
}

function literalPathspec(path: string): string {
  return `:(top,literal)${path}`;
}

function repositoryIdFromOrigin(value: string): string {
  const exact = value.trim().replace(/\.git$/u, "");
  const match = /^(?:git@github\.com:|https:\/\/github\.com\/)(?<repository>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/u.exec(exact);
  if (!match?.groups?.repository) throw new MissionCliError("Repository origin URL is unsupported or malformed.", 1);
  return match.groups.repository;
}

async function observeRepository(root: string): Promise<RepositoryObservation> {
  try {
    const canonicalRoot = await fsRealpath(root);
    const top = await gitValue(canonicalRoot, ["rev-parse", "--show-toplevel"]);
    const canonicalTop = await fsRealpath(top);
    const branch = await gitValue(canonicalRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const head = await gitValue(canonicalRoot, ["rev-parse", "HEAD"]);
    if (canonicalTop !== canonicalRoot || branch.length === 0 || branch === "HEAD" || head.length === 0) {
      throw new Error("repository identity is not a real attached checkout");
    }
    return { canonicalRoot, branch, head };
  } catch (error) {
    throw new MissionCliError(`Repository observation failed: ${error instanceof Error ? error.message : String(error)}.`, 1);
  }
}

async function observePublicationRepository(
  root: string,
  configuredRepositoryId: string,
  baseRevisionInput: string,
  authorizedPaths: readonly string[],
  pathComparator?: StringComparator,
): Promise<PublicationRepositoryObservation> {
  if (baseRevisionInput.trim() !== baseRevisionInput || baseRevisionInput.length === 0) {
    throw new MissionCliError("Publication baseRevision is malformed.", 1);
  }
  try {
    const canonicalRoot = await fsRealpath(root);
    const top = await gitValue(canonicalRoot, ["rev-parse", "--show-toplevel"]);
    const gitTopLevel = await fsRealpath(top);
    const originUrl = await gitValue(canonicalRoot, ["remote", "get-url", "origin"]);
    const remoteRepositoryId = repositoryIdFromOrigin(originUrl);
    const branch = await gitValue(canonicalRoot, ["branch", "--show-current"]);
    const baseRevision = await gitValue(canonicalRoot, ["rev-parse", `${baseRevisionInput}^{commit}`]);
    const headRevision = await gitValue(canonicalRoot, ["rev-parse", "HEAD"]);
    await gitOutput(canonicalRoot, ["merge-base", "--is-ancestor", baseRevision, headRevision]);
    const [status, changed, baseTree, headTree] = await Promise.all([
      gitOutput(canonicalRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
      gitOutput(canonicalRoot, ["diff", "--name-only", "--no-renames", "-z", baseRevision, headRevision, "--"]),
      gitOutput(canonicalRoot, ["ls-tree", "-rz", baseRevision, "--", ...authorizedPaths.map(literalPathspec)]),
      gitOutput(canonicalRoot, ["ls-tree", "-rz", headRevision, "--", ...authorizedPaths.map(literalPathspec)]),
    ]);
    if (canonicalRoot !== gitTopLevel || branch.length === 0 || branch === "HEAD" ||
        baseRevision.length === 0 || headRevision.length === 0) {
      throw new Error("repository identity is not a real attached top-level checkout");
    }
    return {
      configuredRepositoryId,
      originUrl,
      remoteRepositoryId,
      canonicalRoot,
      gitTopLevel,
      branch,
      baseRevision,
      headRevision,
      baseAncestor: true,
      statusEntries: nulRecords(status, "Repository status"),
      changedPaths: nulRecords(changed, "Repository change set").sort(pathComparator),
      baseTreeEntries: exactTreeEntries(baseTree, "Base tree", authorizedPaths),
      headTreeEntries: exactTreeEntries(headTree, "HEAD tree", authorizedPaths),
    };
  } catch (error) {
    if (error instanceof MissionCliError) throw error;
    throw new MissionCliError(`Publication repository observation failed: ${error instanceof Error ? error.message : String(error)}.`, 1);
  }
}

export function assertPublicationAuthorizationFreshness(input: {
  initialConfigurationIdentity: string;
  freshConfigurationIdentity: string;
  initialObservation: PublicationRepositoryObservation;
  freshObservation: PublicationRepositoryObservation;
  initialJournalSequence: number;
  freshJournalSequence: number;
}): void {
  if (input.freshConfigurationIdentity !== input.initialConfigurationIdentity ||
      canonicalJson(input.freshObservation) !== canonicalJson(input.initialObservation) ||
      input.freshJournalSequence !== input.initialJournalSequence) {
    throw new MissionCliError("Mission journal, repository configuration, or publication observation changed while authorization was being signed.", 1);
  }
}

function publicationPathKinds(observation: PublicationRepositoryObservation, pathComparator?: StringComparator) {
  const all = [...observation.baseTreeEntries, ...observation.headTreeEntries];
  return {
    symlinks: [...new Set(all.filter(({ mode }) => mode === "120000").map(({ path }) => path))].sort(pathComparator),
    gitlinks: [...new Set(all.filter(({ mode, type }) => mode === "160000" || type === "commit").map(({ path }) => path))].sort(pathComparator),
  };
}

async function validateBaseRevision(observation: RepositoryObservation, baseRevision: string): Promise<void> {
  if (typeof baseRevision !== "string" || baseRevision.trim() !== baseRevision || baseRevision.length === 0) {
    throw new MissionCliError("Wheels Up baseRevision is malformed.", 1);
  }
  try {
    await gitValue(observation.canonicalRoot, ["cat-file", "-e", `${baseRevision}^{commit}`]);
    await gitValue(observation.canonicalRoot, ["merge-base", "--is-ancestor", baseRevision, observation.head]);
  } catch {
    throw new MissionCliError("Wheels Up baseRevision must exist and be an ancestor of HEAD.", 1);
  }
}

function sameObservation(left: RepositoryObservation, right: RepositoryObservation): boolean {
  return left.canonicalRoot === right.canonicalRoot && left.branch === right.branch && left.head === right.head;
}

async function signMissionPayload(binding: TrustedHumanBinding, passcode: string, payload: unknown, missionId: string): Promise<string> {
  try {
    return await signWithSigner(binding.signingKeyRef, passcode, payload);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new MissionCliError("No local Coulson signer was found for this mission binding. Run `shield mission signer setup --seat coulson` before beginning new missions, or use detached signed evidence for missions bound to another key.", 1);
    }
    if (error instanceof Error) throw new MissionCliError(error.message, 1);
    throw error;
  }
}

async function currentMission(root: string, config: ShieldConfig, missionId: string) {
  return unwrap(await readSupervisedMissionJournal(missionPaths(root, config, missionId)));
}

function statusText(projection: SupervisedMissionProjection): string {
  const pending = projection.readiness.accept.requirementStatuses
    .filter(({ status }) => status !== "satisfied")
    .map(({ requirementId, requiredSeatId, status }) => `${requiredSeatId}:${status}:${requirementId}`);
  return [
    `Mission: ${projection.missionId}`,
    `Revision: ${projection.brief.revisionId}`,
    `Governance: ${projection.governance.state}`,
    `Authorization: ${projection.authorization.source}/${projection.authorization.state}`,
    `Authorization revisions: mission=${projection.authorization.missionRevisionId}, delegation=${projection.authorization.delegationRevisionId ?? "none"}, eligibility=${projection.authorization.eligibilityRevisionId ?? "none"}`,
    `Execution: ${projection.execution.status}`,
    `Readiness (execute): ${projection.readiness.execute.state}`,
    `Readiness (accept): ${projection.readiness.accept.state}`,
    `Communication: ${projection.communication.state}`,
    `Pending human evidence: ${pending.length > 0 ? pending.join(", ") : "none"}`,
    `Next journal sequence: ${projection.lastSequence + 1}`,
  ].join("\n");
}

function profileAwareStatusText(projection: ProfileAwareProjectionV1): string {
  const satisfied = new Set(projection.evidence.map(({ requirementId }) => requirementId));
  const pending = projection.requirements
    .filter(({ requirementId }) => !satisfied.has(requirementId))
    .map(({ requirementId, requiredRoleId }) => `${requiredRoleId}:pending:${requirementId}`);
  return [
    `Mission: ${projection.missionId}`,
    `Revision: ${projection.brief.revisionId}`,
    `Profile: ${projection.brief.profileId}@${projection.brief.profileVersion}`,
    `Authorization: ${projection.authorization}`,
    `Execution: ${projection.execution}`,
    `Readiness (execute): ${projection.readiness.execute}`,
    `Readiness (accept): ${projection.readiness.accept}`,
    `Communication: ${projection.communication.state}`,
    `Final acceptance: ${projection.finalAcceptance}`,
    `Pending human evidence: ${pending.length > 0 ? pending.join(", ") : "none"}`,
    `Next journal sequence: ${projection.lastSequence + 1}`,
  ].join("\n");
}

async function begin(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--brief", "--authorization", "--delegation", "--eligibility"], ["--json", "--profile-aware"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const briefInput = await jsonFile(resolve(root, required(options, "--brief")), "Mission brief");
  if (options.flags.has("--profile-aware")) {
    if (options.values.has("--authorization") || options.values.has("--delegation") || options.values.has("--eligibility")) {
      throw new MissionCliError("Profile-aware begin cannot include supervised or delegated authorization inputs.");
    }
    if (!plainObject(briefInput) || typeof briefInput.missionId !== "string" || typeof briefInput.requireSimmons !== "boolean") {
      throw new MissionCliError("Profile-aware mission brief identity is malformed.", 1);
    }
    let canonicalBrief;
    try {
      canonicalBrief = createProfileAwareMissionBrief(briefInput as unknown as ProfileAwareMissionBriefContentV1);
    } catch (error) {
      throw new MissionCliError(`profile_invalid: ${error instanceof Error ? error.message : "Profile-aware brief is invalid."}`, 1);
    }
    const checkedBrief = validateProfileAwareMissionBrief(canonicalBrief);
    if (checkedBrief.state === "invalid") {
      throw new MissionCliError(`${checkedBrief.code}: ${checkedBrief.errors.join(" ")}`, 1);
    }
    const registry = await jsonFile(join(root, BINDINGS_PATH), "Trusted binding registry");
    const bindings = unwrap(deriveRepositoryMissionBindings(
      config,
      registry,
      checkedBrief.value.missionId,
      {
        kind: "profile-aware",
        profileId: checkedBrief.value.profileId,
        profileVersion: checkedBrief.value.profileVersion,
        requireSimmons: checkedBrief.value.requireSimmons,
      },
    ));
    const intake = unwrap(profileAwareMissionIntakeV1({
      brief: briefInput as unknown as ProfileAwareMissionBriefContentV1,
      trustedBindings: bindings,
    }));
    const initialized = unwrap(await initializeProfileAwareMissionJournalV1({
      ...missionPaths(root, config, intake.brief.missionId),
      entry: intake.entry,
    }));
    output(
      { journalPath: initialized.journalPath, projection: initialized.projection },
      options.flags.has("--json"),
      `Mission ${intake.brief.missionId} proposed at ${intake.brief.revisionId}.\n${profileAwareStatusText(initialized.projection)}`,
    );
    return 0;
  }
  const brief = unwrap(validateSupervisedMissionBrief(briefInput));
  const registry = await jsonFile(join(root, BINDINGS_PATH), "Trusted binding registry");
  const bindings = unwrap(deriveRepositoryMissionBindings(
    config,
    registry,
    brief.missionId,
    { kind: "legacy-supervised", requireSimmons: brief.requireSimmons },
  ));
  const authorization = options.values.get("--authorization") ?? "supervised";
  if (authorization !== "supervised" && authorization !== "delegated") throw new MissionCliError("--authorization must be supervised or delegated.");
  if (authorization === "supervised" && (options.values.has("--delegation") || options.values.has("--eligibility"))) throw new MissionCliError("Supervised begin cannot include delegation inputs.");
  let appended;
  if (authorization === "supervised") {
    appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, brief.missionId), entry: createMissionBegunEntry(brief, bindings) }));
  } else {
    const delegationRef = required(options, "--delegation");
    const eligibility = await jsonFile(resolve(root, required(options, "--eligibility")), "Wheels Off eligibility") as WheelsOffEligibility;
    const coulson = bindings.find(({ seatId }) => seatId === "coulson"); if (!coulson) throw new MissionCliError("Configured Coulson binding is missing.", 1);
    const log = unwrap(await readDelegationLog({ repositoryRoot: root, repositoryId: config.repositoryId, binding: coulson }));
    const begun = createMissionBegunEntry(brief, bindings, 3);
    const begunProjection = unwrap(replaySupervisedMissionJournal([begun]));
    const delegated = unwrap(createDelegatedAuthorizationEntry({
      projection: begunProjection,
      repositoryId: config.repositoryId,
      delegationRevisionId: delegationRef,
      delegationLog: log.entries,
      eligibility,
      evaluatedAt: { value: new Date().toISOString(), provenance: "hostTrusted" },
    }));
    appended = unwrap(await initializeSupervisedMissionJournal({ ...missionPaths(root, config, brief.missionId), entries: [begun, delegated] }));
  }
  output(
    { journalPath: appended.journalPath, projection: appended.projection },
    options.flags.has("--json"),
    `Mission ${brief.missionId} proposed at ${brief.revisionId}.\n${statusText(appended.projection)}`,
  );
  return appended.projection.authorization.state === "ineligible" ? 1 : 0;
}

async function delegation(command: "grant" | "revoke", args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--evidence"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true); const config = await repositoryConfig(root);
  const registry = unwrap(validateTrustedBindingRegistry(await jsonFile(join(root, BINDINGS_PATH), "Trusted binding registry"))) as TrustedBindingRegistry;
  const coulson = unwrap(selectCoulsonOperationBinding(config, registry));
  const envelope = await jsonFile(resolve(root, required(options, "--evidence")), "Signed delegation evidence") as SignedWheelsOffDelegation | SignedWheelsOffRevocation;
  const entry = createDelegationLogEntry(envelope, command === "grant" ? "delegation.granted" : "delegation.revoked");
  const projection = unwrap(await appendDelegationEntry({ repositoryRoot: root, repositoryId: config.repositoryId, binding: coulson, entry }));
  output(projection, options.flags.has("--json"), `Delegation ${command} recorded at sequence ${entry.sequence}.`); return 0;
}

async function invalidate(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--reason"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true); const config = await repositoryConfig(root); const missionId = required(options, "--mission-id");
  const reason = required(options, "--reason"); if (!DELEGATED_INVALIDATION_REASONS.includes(reason as never)) throw new MissionCliError("Unsupported delegated invalidation reason.");
  const current = await currentMission(root, config, missionId);
  const entry = unwrap(createDelegatedInvalidationEntry(current.projection, reason as never, { value: new Date().toISOString(), provenance: "hostTrusted" }));
  const appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), statusText(appended.projection)); return 0;
}

async function governance(command: "approve" | "pause" | "resume" | "cancel", args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--evidence", "--resume-state"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = await currentMission(root, config, missionId);
  const evidence = await jsonFile(resolve(root, required(options, "--evidence")), "Signed evidence") as SignedHumanEvidence;
  const resumeStateValue = options.values.get("--resume-state");
  if (command === "resume" && resumeStateValue !== "proposed" && resumeStateValue !== "approved") {
    throw new MissionCliError("resume requires --resume-state proposed|approved.");
  }
  if (command !== "resume" && resumeStateValue !== undefined) throw new MissionCliError("--resume-state is allowed only for resume.");
  const entry = unwrap(createGovernanceEntry(
    current.projection,
    command,
    evidence,
    command === "resume" ? resumeStateValue as "proposed" | "approved" : null,
  ));
  const appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), statusText(appended.projection));
  return 0;
}

async function passcodeFromOptions(
  options: ParsedOptions,
  promptOutput: { write: (output: string) => void } = outputStream,
): Promise<string> {
  if (options.flags.has("--passcode-stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const passcode = Buffer.concat(chunks).toString("utf8").trim();
    if (!passcode) throw new MissionCliError("Passcode input was empty.");
    return passcode;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new MissionCliError("Passcode prompt requires a TTY; use --passcode-stdin for automation.");
  return await readInteractivePasscode(input, promptOutput);
}

export async function readInteractivePasscode(
  inputStream: {
    setRawMode: (mode: boolean) => void;
    on: (event: string, listener: (chunk: Buffer) => void) => void;
    off: (event: string, listener: (chunk: Buffer) => void) => void;
    resume: () => void;
    pause: () => void;
  },
  outputStream: { write: (output: string) => void },
): Promise<string> {
  const setupFailureMessage = "Passcode prompt setup failed.";
  const cleanupFailureMessage = "Passcode prompt cleanup failed.";
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let finished = false;
    let setupFailure = false;
    let outcome: "success" | "cancelled" | "empty" = "empty";
    let passcode = "";
    let isResuming = false;
    let cleanupDone = false;
    let cleanupFailure: MissionCliError | null = null;
    let rawModeAttempted = false;
    let listenerRegistrationAttempted = false;
    let resumeAttempted = false;

    const registerCleanupFailure = () => {
      if (!cleanupFailure) cleanupFailure = new MissionCliError(cleanupFailureMessage);
    };

    const attemptCleanupAction = (action: () => void): void => {
      try {
        action();
      } catch (error) {
        registerCleanupFailure();
      }
    };

    const runCleanup = (): void => {
      if (cleanupDone) return;
      cleanupDone = true;
      if (listenerRegistrationAttempted) {
        attemptCleanupAction(() => {
          inputStream.off("data", onData);
        });
      }
      if (rawModeAttempted) {
        attemptCleanupAction(() => {
          inputStream.setRawMode(false);
        });
      }
      if (resumeAttempted) {
        attemptCleanupAction(() => {
          inputStream.pause();
        });
      }
      attemptCleanupAction(() => {
        outputStream.write("\n");
      });
    };

    const finish = (): void => {
      if (finished) return;
      finished = true;
      runCleanup();
      if (cleanupFailure) {
        reject(cleanupFailure);
        return;
      }
      if (setupFailure) {
        reject(new MissionCliError(setupFailureMessage));
        return;
      }
      if (outcome === "empty") {
        reject(new MissionCliError("Passcode input was empty."));
        return;
      }
      if (outcome === "cancelled") {
        reject(new MissionCliError("Passcode prompt cancelled."));
        return;
      }
      resolve(passcode);
    };

    const settle = (nextOutcome: "success" | "cancelled" | "empty", nextPasscode = passcode): void => {
      if (settled) return;
      settled = true;
      outcome = nextOutcome;
      passcode = nextPasscode;
      if (!isResuming) finish();
    };

    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (settled) return;
        if (byte === 3) {
          settle("cancelled");
          return;
        }
        if (byte === 10 || byte === 13) {
          settle(passcode ? "success" : "empty", passcode);
          return;
        }
        if (byte === 127 || byte === 8) {
          passcode = passcode.slice(0, -1);
        } else if (byte >= 32) {
          passcode += String.fromCharCode(byte);
        }
      }
    };

    try {
      outputStream.write("Passcode: ");
      rawModeAttempted = true;
      inputStream.setRawMode(true);
      listenerRegistrationAttempted = true;
      inputStream.on("data", onData);
      isResuming = true;
      resumeAttempted = true;
      inputStream.resume();
      isResuming = false;
      if (settled) finish();
    } catch (error) {
      setupFailure = true;
      settled = true;
      isResuming = false;
      finish();
    }
  });
}

async function signerSetup(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--seat"], ["--json", "--passcode-stdin"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const seat = options.values.get("--seat") ?? "coulson";
  if (seat !== "coulson") throw new MissionCliError("Only the Coulson signer can be provisioned by this command.");
  const registryPath = join(root, BINDINGS_PATH);
  const registry = unwrap(validateTrustedBindingRegistry(await jsonFile(registryPath, "Trusted binding registry"))) as TrustedBindingRegistry;
  const current = unwrap(selectCoulsonOperationBinding(config, registry));
  const signerInput = validateSignerInput({
    seatId: "coulson",
    bindingId: current.bindingId,
    humanPrincipalId: current.humanPrincipalId,
  });
  const passcode = await passcodeFromOptions(options);
  const created = await createHostSigner(signerInput, passcode);
  const nextRegistry = { ...registry, bindings: registry.bindings.map((binding) => binding.seatId === seat ? { ...binding, signingKeyRef: created.signingKeyRef, publicKeySpkiBase64: created.publicKeySpkiBase64 } : binding) };
  const nextConfig = { ...config, trustedHumanBindingRefs: config.trustedHumanBindingRefs.map((ref) => ref.seatId === seat ? { ...ref, bindingRef: created.signingKeyRef } : ref) };
  await writeFile(registryPath, `${JSON.stringify(nextRegistry, null, 2)}\n`);
  await chmod(registryPath, 0o600);
  await writeFile(join(root, CONFIG_PATH), `${JSON.stringify(nextConfig, null, 2)}\n`);
  output(
    { signerPath: created.signerPath, signingKeyRef: created.signingKeyRef },
    options.flags.has("--json"),
    `Coulson signer created at ${created.signerPath}.\nThis is a one-time host setup for future missions.\nExisting mission journals retain the binding captured at begin and must continue using their original signer.`,
  );
  return 0;
}

function validateSignerInput(input: unknown): Readonly<SignerCreationInput> {
  try {
    return validateSignerCreationInput(input);
  } catch (error) {
    throw new MissionCliError(error instanceof Error ? error.message : "Signer creation input is invalid.", 1);
  }
}

async function createHostSigner(input: Readonly<SignerCreationInput>, passcode: string): Promise<SignerCreationResult> {
  try {
    return await createSigner(input, passcode);
  } catch (error) {
    throw new MissionCliError(error instanceof Error ? error.message : "creation_failed: Signer creation failed.", 1);
  }
}

async function signerBootstrap(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--seat", "--binding-id", "--human-principal-id"], ["--json", "--passcode-stdin"]);
  const seat = required(options, "--seat");
  if (seat !== "coulson") throw new MissionCliError("Only the Coulson signer can be provisioned by this command.", 1);
  const signerInput = validateSignerInput({
    seatId: "coulson",
    bindingId: required(options, "--binding-id"),
    humanPrincipalId: required(options, "--human-principal-id"),
  });
  const passcode = await passcodeFromOptions(options);
  const created = await createHostSigner(signerInput, passcode);
  const packet = {
    schemaVersion: 1,
    seatId: created.seatId,
    bindingId: created.bindingId,
    humanPrincipalId: created.humanPrincipalId,
    signingKeyRef: created.signingKeyRef,
    publicKeySpkiBase64: created.publicKeySpkiBase64,
  };
  output(
    packet,
    options.flags.has("--json"),
    `Coulson signer candidate created in protected host storage.\n${JSON.stringify(packet, null, 2)}`,
  );
  return 0;
}

async function authorize(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id"], ["--json", "--passcode-stdin"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const displayed = unwrap(await readMissionJournalForDisplay(missionPaths(root, config, missionId)));
  if (displayed.kind === "profile-aware") {
    const current = displayed;
    const satisfied = new Set(current.projection.evidence.map(({ requirementId }) => requirementId));
    const matching = current.projection.requirements.filter(({ evidenceKind, requiredRoleId, phase, requirementId }) =>
      evidenceKind === "mission_authorization" && requiredRoleId === "coulson" && phase === "authorization" && !satisfied.has(requirementId));
    if (matching.length !== 1) throw new MissionCliError("Current profile-aware mission requires exactly one pending Coulson authorization requirement.", 1);
    const binding = coulsonBinding(current);
    const sequence = current.projection.lastSequence + 1;
    const timestamp = { value: new Date().toISOString(), provenance: "hostTrusted" as const };
    const payload = {
      schemaVersion: 1 as const,
      evidenceId: `evidence:coulson:${sequence}`,
      requirementId: matching[0].requirementId,
      missionId,
      revisionId: current.projection.brief.revisionId,
      seatId: "coulson" as const,
      evidenceKind: "mission_authorization" as const,
      decision: "approved" as const,
      humanPrincipalId: binding.humanPrincipalId,
      bindingId: binding.bindingId,
      signingKeyRef: binding.signingKeyRef,
      sourceRef: `passcode-signer:${missionId}`,
      timestamp,
      journalSequence: sequence,
    };
    const passcode = await passcodeFromOptions(options);
    const evidence: SignedProfileEvidenceV1 = {
      payload,
      signatureBase64: await signMissionPayload(binding, passcode, payload, missionId),
    };
    const fresh = await currentProfileAwareMission(root, config, missionId);
    if (fresh.projection.lastSequence !== current.projection.lastSequence) {
      throw new MissionCliError("Mission journal changed while authorization was being signed.", 1);
    }
    const entry = produce(() => createProfileAwareGovernanceDecisionEntryV1({
      projection: fresh.projection,
      trustedBindings: profileAwareBindings(fresh),
      evidence,
    }));
    const appended = unwrap(await appendProfileAwareMissionEntryV1({ ...missionPaths(root, config, missionId), entry }));
    output(appended.projection, options.flags.has("--json"), profileAwareStatusText(appended.projection));
    return 0;
  }
  const current = displayed;
  const requirement = current.projection.requirements.find(({ evidenceKind, requiredSeatId, supersedesRequirementId }) => evidenceKind === "mission_authorization" && requiredSeatId === "coulson" && supersedesRequirementId === null);
  if (!requirement) throw new MissionCliError("Current mission has no pending Coulson authorization requirement.", 1);
  const binding = current.projection.trustedBindings.find(({ seatId }) => seatId === "coulson");
  if (!binding) throw new MissionCliError("Mission has no Coulson trusted binding.", 1);
  const passcode = await passcodeFromOptions(options);
  const payload = {
    schemaVersion: 1 as const,
    evidenceId: `evidence:coulson:${current.projection.lastSequence + 1}`,
    requirementId: requirement.requirementId,
    missionId,
    subjectKind: "mission_plan" as const,
    subjectId: current.projection.brief.subjectId,
    revisionId: current.projection.brief.revisionId,
    seatId: "coulson" as const,
    evidenceKind: "mission_authorization" as const,
    decision: "approved" as const,
    governanceTarget: "approved" as const,
    humanPrincipalId: binding.humanPrincipalId,
    bindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `passcode-signer:${missionId}`,
    timestamp: { value: new Date().toISOString(), provenance: "hostTrusted" as const },
    journalSequence: current.projection.lastSequence + 1,
  };
  let signatureBase64: string;
  try {
    signatureBase64 = await signWithSigner(binding.signingKeyRef, passcode, payload);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new MissionCliError("No local Coulson signer was found for this mission binding. Run `shield mission signer setup --seat coulson` before beginning new missions, or use detached signed evidence for missions bound to another key.", 1);
    }
    if (error instanceof Error) throw new MissionCliError(error.message, 1);
    throw error;
  }
  const entry = unwrap(createGovernanceEntry(current.projection, "approve", { payload, signatureBase64 }, null));
  const appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), statusText(appended.projection));
  return 0;
}

async function publicationAuthorize(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--input"], ["--json", "--passcode-stdin"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const configurationIdentity = canonicalJson(config);
  const missionId = required(options, "--mission-id");
  const current = await currentProfileAwareMission(root, config, missionId);
  const intent = publicationAuthorizationIntent(await jsonFile(resolve(root, required(options, "--input")), "Publication authorization input"));
  const observation = await observePublicationRepository(root, config.repositoryId, intent.baseRevision, intent.authorizedPaths);
  const sequence = current.projection.lastSequence + 1;
  const authorizationId = `authorization:${missionId}:review-publish:${sequence}`;
  const authority = {
    publicationScopeSchemaVersion: 1 as const,
    contractVersion: "review-publication.v1" as const,
    authorityKind: "review.publish" as const,
    authorityRef: authorizationId,
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    repositoryId: config.repositoryId,
    canonicalRepositoryRoot: observation.canonicalRoot,
    branch: observation.branch,
    baseRevisionId: observation.baseRevision,
    headRevisionId: observation.headRevision,
    authorizedPaths: [...intent.authorizedPaths],
    permittedEffects: [...intent.permittedEffects],
  };
  const pathKinds = publicationPathKinds(observation);
  const evaluation = evaluateReviewPublicationV1(authority, {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    repositoryId: observation.remoteRepositoryId,
    canonicalRepositoryRoot: observation.gitTopLevel,
    branch: observation.branch,
    baseRevisionId: observation.baseRevision,
    headRevisionId: observation.headRevision,
    proposedChangedPaths: intent.authorizedPaths,
    observedChangedPaths: observation.changedPaths,
    requestedEffects: intent.permittedEffects,
    observedSymlinkPaths: pathKinds.symlinks,
    observedGitlinkPaths: pathKinds.gitlinks,
    workspaceClean: observation.statusEntries.length === 0,
  });
  if (evaluation.state === "blocked") throw new MissionCliError(`Publication authorization blocked: ${evaluation.reasonCode}.`, 1);
  const binding = coulsonBinding(current);
  const timestamp = { value: new Date().toISOString(), provenance: "hostTrusted" as const };
  const payload = {
    schemaVersion: 1 as const,
    authorizationId,
    authorityDigest: computeReviewPublicationAuthorityDigest(authority),
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    artifactRevisionId: observation.headRevision,
    authorityKind: "review.publish" as const,
    previousJournalSequence: current.projection.lastSequence,
    journalSequence: sequence,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `cli:publication-authorize:${sequence}`,
    timestamp,
  };
  const passcode = await passcodeFromOptions(options);
  const signatureBase64 = await signMissionPayload(binding, passcode, payload, missionId);
  const freshConfig = await repositoryConfig(root);
  const freshObservation = await observePublicationRepository(root, freshConfig.repositoryId, intent.baseRevision, intent.authorizedPaths);
  const fresh = await currentProfileAwareMission(root, freshConfig, missionId);
  assertPublicationAuthorizationFreshness({
    initialConfigurationIdentity: configurationIdentity,
    freshConfigurationIdentity: canonicalJson(freshConfig),
    initialObservation: observation,
    freshObservation,
    initialJournalSequence: current.projection.lastSequence,
    freshJournalSequence: fresh.projection.lastSequence,
  });
  const entry = produce(() => createProfileAwareReviewPublicationAuthorizationEntryV1({
    projection: fresh.projection,
    trustedBindings: profileAwareBindings(fresh),
    authority,
    authorization: { payload, signatureBase64 },
  }));
  const appended = unwrap(await appendProfileAwareMissionEntryV1({ ...missionPaths(root, freshConfig, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), profileAwareStatusText(appended.projection));
  return 0;
}

async function publicationRequest(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--input"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const configSnapshot = await repositoryConfigSnapshot(root);
  requireGitHubConfiguration(configSnapshot);
  const config = configSnapshot.config;
  const missionId = required(options, "--mission-id");
  const current = await currentProfileAwareMission(root, config, missionId);
  const intent = publicationRequestIntent(await jsonFile(resolve(root, required(options, "--input")), "Publication request input"));
  const matches = current.projection.publicationAuthorizations.filter(
    ({ authorization }) => authorization.authorizationId === intent.authorizationId,
  );
  if (matches.length !== 1) throw new MissionCliError("Publication request authorization is absent or ambiguous.", 1);
  const authority = matches[0].authority;
  const sequence = current.projection.lastSequence + 1;
  const request = {
    requestId: `request:${missionId}:review-publish:${sequence}`,
    adapterContractVersion: 2 as const,
    adapterId: "github" as const,
    operation: intent.operation,
    missionId,
    subjectId: current.projection.brief.subjectId,
    revisionId: current.projection.brief.revisionId,
    artifactRevisionId: authority.headRevisionId,
    targetRef: intent.targetRef,
    publicationAuthorizationId: matches[0].authorization.authorizationId,
    proposedChangedPaths: [...authority.authorizedPaths],
    requestedEffects: [...intent.requestedEffects],
  };
  const entry = produce(() => createProfileAwareCommunicationRequestEntryV1({
    projection: current.projection,
    request,
    timestamp: { value: new Date().toISOString(), provenance: "hostTrusted" },
  }));
  const freshConfigSnapshot = await repositoryConfigSnapshot(root);
  assertRepositoryConfigFresh(configSnapshot, freshConfigSnapshot);
  const appended = unwrap(await appendProfileAwareMissionEntryV1({
    ...missionPaths(root, freshConfigSnapshot.config, missionId),
    entry,
  }));
  output(appended.projection, options.flags.has("--json"), profileAwareStatusText(appended.projection));
  return 0;
}

async function publicationResult(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--input"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const candidateInput = await jsonFile(resolve(root, required(options, "--input")), "Publication result input");
  const checked = validateAdapterCandidate(candidateInput);
  if (checked.state === "invalid") throw new MissionCliError(`${checked.code}: ${checked.errors.join(" ")}`, 1);
  if (checked.value.candidateKind !== "communication_result" || checked.value.adapterContractVersion !== 2) {
    throw new MissionCliError("Publication result input requires an adapter-v2 communication result.", 1);
  }
  const candidate = checked.value as ReviewPublicationCommunicationResultAdapterCandidate;
  if (candidate.payload.outcome === "delivered") {
    throw new MissionCliError("File-supplied delivered publication results are forbidden; successful delivery must be recorded directly from the trusted in-process host result.", 1);
  }
  const current = await currentProfileAwareMission(root, config, missionId);
  const entry = produce(() => createProfileAwareCommunicationResultEntryV1({ projection: current.projection, candidate }));
  const appended = unwrap(await appendProfileAwareMissionEntryV1({ ...missionPaths(root, config, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), profileAwareStatusText(appended.projection));
  return 0;
}

async function authorizeWheelsUp(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--input"], ["--json", "--human", "--passcode-stdin"]);
  if (options.flags.has("--json") && options.flags.has("--human")) {
    throw new MissionCliError("--human and --json are mutually exclusive.");
  }
  const humanMode = options.flags.has("--human") || (!options.flags.has("--json") && !options.flags.has("--passcode-stdin"));
  const promptOutput = options.flags.has("--json") ? process.stderr : outputStream;
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const input = await jsonFile(resolve(root, required(options, "--input")), "Authorize Wheels Up input");
  const intent = validateAuthorizeWheelsUpInput(input);
  const timestamp = { value: new Date().toISOString(), provenance: "hostTrusted" as const };
  const renderDecision = (entry: { kind: "manifest" | "receipt"; manifest?: Readonly<Record<string, unknown>>; receipt?: Readonly<Record<string, unknown>>; humanMode: boolean; }) => {
    if (entry.kind === "manifest") {
      if (entry.humanMode) return renderAuthorizeWheelsUpHumanV1(entry.manifest as Parameters<typeof renderAuthorizeWheelsUpHumanV1>[0]);
      return `SHIELD_WHEELS_UP_MANIFEST_BEGIN\n${canonicalJson(entry.manifest)}\nSHIELD_WHEELS_UP_MANIFEST_END`;
    }
    if (entry.humanMode) return renderAuthorizeWheelsUpReceiptHumanV1(entry.receipt as Parameters<typeof renderAuthorizeWheelsUpReceiptHumanV1>[0]);
    return JSON.stringify(entry.receipt, null, 2);
  };
  try {
    return await executeAuthorizeWheelsUpV1({
      root,
      config,
      missionId,
      intent,
      timestamp,
      humanMode,
      promptOutput: { write: (value) => promptOutput.write(value) },
      dependencies: {
        renderDecision,
        readPasscode: () => passcodeFromOptions(options, promptOutput),
        signBatch: async (binding, passcode, payloads) => {
          try {
            return await signPayloadBatchWithSigner(binding.signingKeyRef, binding.publicKeySpkiBase64, passcode, payloads);
          } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
              throw new MissionCliError("No local Coulson signer was found for this mission binding.", 1);
            }
            throw error instanceof Error ? new MissionCliError(error.message, 1) : new MissionCliError("Coulson batch signing failed.", 1);
          }
        },
        appendBatchAtomic: appendProfileAwareMissionEntriesAtomicV1,
      },
    });
  } catch (error) {
    throw error instanceof MissionCliError ? error : new MissionCliError(error instanceof Error ? error.message : String(error), 1);
  }
}

async function recordReviewedTransition(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--transition-plan", "--review-artifact", "--dispatch-receipt-id"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const missionId = required(options, "--mission-id");
  const planInput = await jsonFile(resolve(root, required(options, "--transition-plan")), "Mission transition plan");
  const reviewInput = await jsonFile(resolve(root, required(options, "--review-artifact")), "Mission transition plan review");
  const plan = validateTransitionPlanV1({ artifact: planInput });
  if (plan.state === "invalid") throw new MissionCliError(`invalid_transition_plan: ${plan.errors.join(" ")}`, 1);
  const review = validateMissionTransitionPlanReviewV1(reviewInput);
  if (review.state === "invalid") throw new MissionCliError(`${review.code}: ${review.errors.join(" ")}`, 1);
  if (missionId !== plan.value.missionId || missionId !== review.value.missionId) {
    throw new MissionCliError("Mission transition record identity does not match --mission-id.", 1);
  }
  const identity = await resolveSeatDispatchIdentityByReceiptIdV1({
    repositoryRoot: root,
    repositoryId: plan.value.repositoryId,
    receiptId: required(options, "--dispatch-receipt-id"),
  });
  if (identity.state === "invalid") throw new MissionCliError(`invalid_dispatch_identity: ${identity.errors.join(" ")}`, 1);
  const expectedBinding = {
    schemaVersion: 1 as const,
    missionId: plan.value.missionId,
    subjectId: plan.value.subjectId,
    repositoryId: plan.value.repositoryId,
    planningBaseRevision: plan.value.planningBaseRevision,
    parentPlanCommit: plan.value.parentPlanCommit,
    parentPlanPath: plan.value.parentPlanPath,
    parentPlanRawSha256: plan.value.parentPlanRawSha256,
    transitionPlanId: plan.value.id,
    transitionPlanDigest: plan.value.digest,
    reviewedArtifactId: plan.value.id,
    reviewedArtifactRevision: plan.value.digest,
  };
  const result = await materializeReviewedMissionTransitionV1({
    missionId,
    repositoryRoot: root,
    transitionPlan: plan.value,
    reviewArtifact: review.value,
    expectedBinding,
    dispatchIdentity: identity.identity,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.state === "materialized" || result.state === "already_materialized" ? 0 : 1;
}

function renderAlreadyAuthorized(result: Extract<Awaited<ReturnType<typeof resolvePreparedMissionTransitionV1>>, { state: "already_authorized" }>): string {
  return [
    `state: ${result.state}`,
    `missionId: ${result.missionId}`,
    `missionRevisionId: ${result.missionRevisionId}`,
    `headRevision: ${result.headRevision}`,
    `endingJournalSequence: ${result.endingJournalSequence}`,
    `authorizationManifestDigest: ${result.authorizationManifestDigest}`,
  ].join("\n");
}

async function prepareNext(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id"], ["--json", "--human", "--passcode-stdin"]);
  if (options.flags.has("--json") && options.flags.has("--human")) throw new MissionCliError("--human and --json are mutually exclusive.");
  const root = await exactRoot(options.values.get("--root"), true);
  const missionId = required(options, "--mission-id");
  const result = await resolvePreparedMissionTransitionV1({ missionId, repositoryRoot: root });
  if (result.state === "blocked") {
    if (options.flags.has("--json")) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else process.stderr.write(`Preparation blocked — ${result.reasonCode}: ${result.errors.join(" ")}\n`);
    return 1;
  }
  if (result.state === "already_authorized") {
    output(result, options.flags.has("--json"), renderAlreadyAuthorized(result));
    return 0;
  }
  const intent = validateAuthorizeWheelsUpInput(result.candidate.actionInput);
  const config = await repositoryConfig(root);
  const humanMode = options.flags.has("--human") || (!options.flags.has("--json") && !options.flags.has("--passcode-stdin"));
  const promptOutput = options.flags.has("--json") ? process.stderr : outputStream;
  try {
    return await executeAuthorizeWheelsUpV1({
      root,
      config,
      missionId,
      intent,
      timestamp: { value: new Date().toISOString(), provenance: "hostTrusted" },
      humanMode,
      promptOutput: { write: (value) => promptOutput.write(value) },
      expectedPreparation: { candidate: result.candidate, observation: result.observation },
      dependencies: {
        renderDecision: (entry) => {
          if (entry.kind === "manifest") {
            if (entry.humanMode) return renderAuthorizeWheelsUpHumanV1(entry.manifest as Parameters<typeof renderAuthorizeWheelsUpHumanV1>[0]);
            return `SHIELD_WHEELS_UP_MANIFEST_BEGIN\n${canonicalJson(entry.manifest)}\nSHIELD_WHEELS_UP_MANIFEST_END`;
          }
          if (entry.humanMode) return renderAuthorizeWheelsUpReceiptHumanV1(entry.receipt as Parameters<typeof renderAuthorizeWheelsUpReceiptHumanV1>[0]);
          return JSON.stringify(entry.receipt, null, 2);
        },
        readPasscode: () => passcodeFromOptions(options, promptOutput),
        signBatch: async (binding, passcode, payloads) => signPayloadBatchWithSigner(binding.signingKeyRef, binding.publicKeySpkiBase64, passcode, payloads),
        appendBatchAtomic: appendProfileAwareMissionEntriesAtomicV1,
      },
    });
  } catch (error) {
    throw error instanceof MissionCliError ? error : new MissionCliError(error instanceof Error ? error.message : String(error), 1);
  }
}

function canonicalDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`;
}

function canonicalSnapshot<T>(value: T): T {
  const snapshot = JSON.parse(canonicalJson(value)) as T;
  const freeze = (candidate: unknown): void => {
    if (candidate !== null && typeof candidate === "object") {
      for (const child of Object.values(candidate)) freeze(child);
      Object.freeze(candidate);
    }
  };
  freeze(snapshot);
  return snapshot;
}

function remainingOnePasscodeHumanGates(current: ProfileAwareJournal): string[] {
  const gates = new Set<string>(["coulson.final_acceptance", "fitz.technical_review"]);
  if (current.projection.brief.requireSimmons) gates.add("simmons.product_domain_review");
  return [...gates].sort((left, right) => left.localeCompare(right));
}

type DaisyRepositoryObservation = RepositoryObservation & {
  baseRevision: string;
  originUrl: string;
  remoteRepositoryId: string;
  worktreeRoots: string[];
};

type PreparedAuthorizeDaisyCoordination = {
  configurationIdentity: string;
  configurationBytes: string;
  configurationPathIdentity: string;
  inputBytes: string;
  intent: Readonly<AuthorizeDaisyCoordinationIntent>;
  current: ProfileAwareJournal;
  observation: DaisyRepositoryObservation;
  journalBytes: string;
  startingJournalSha256: string;
  humanBinding: TrustedHumanBinding;
  authority: DaisyCoordinationAuthorityV1;
  authorityDigest: string;
  runtimeBinding: DaisyCoordinationRuntimeBindingV1;
  payloads: readonly [DaisyCoordinationAuthorityV1, DaisyCoordinationRuntimeBindingAuthorizationV1];
  manifest: Readonly<Record<string, unknown>>;
};

async function observeDaisyCoordinationRepository(root: string, repositoryId: string): Promise<DaisyRepositoryObservation> {
  const observation = await observeRepository(root);
  try {
    const originUrl = await gitValue(observation.canonicalRoot, ["remote", "get-url", "origin"]);
    const remoteRepositoryId = repositoryIdFromOrigin(originUrl);
    if (remoteRepositoryId !== repositoryId) throw new Error("repository origin does not match configured identity");
    let baseRevision: string;
    try {
      baseRevision = await gitValue(observation.canonicalRoot, ["merge-base", "HEAD", "origin/main"]);
    } catch {
      baseRevision = await gitValue(observation.canonicalRoot, ["rev-list", "--max-parents=0", "HEAD"]);
    }
    const worktreeOutput = await gitOutput(observation.canonicalRoot, ["worktree", "list", "--porcelain"]);
    const worktreePaths = worktreeOutput.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.slice("worktree ".length));
    if (baseRevision.length === 0 || worktreePaths.length === 0) throw new Error("base revision or worktree inventory is missing");
    const worktreeRoots = (await Promise.all(worktreePaths.map((path) => fsRealpath(path)))).sort(canonicalPublicationPathCompare);
    return { ...observation, baseRevision, originUrl, remoteRepositoryId, worktreeRoots };
  } catch (error) {
    throw new MissionCliError(`Daisy coordination repository observation failed: ${error instanceof Error ? error.message : String(error)}.`, 1);
  }
}

async function canonicalDaisyIntentRoots(
  intent: Readonly<AuthorizeDaisyCoordinationIntent>,
  observation: DaisyRepositoryObservation,
): Promise<Readonly<AuthorizeDaisyCoordinationIntent>> {
  const approvedReadRoots: string[] = [];
  for (const root of intent.approvedReadRoots) {
    const canonical = await fsRealpath(root);
    if (canonical !== root) throw new MissionCliError("Daisy approved read roots must be supplied as canonical paths.", 1);
    approvedReadRoots.push(canonical);
  }
  const durableArtifactRoot = await fsRealpath(intent.durableArtifactRoot);
  if (durableArtifactRoot !== intent.durableArtifactRoot) throw new MissionCliError("Daisy durable artifact root must be supplied as a canonical path.", 1);
  if (observation.worktreeRoots.some((worktreeRoot) => rootsOverlapV1(durableArtifactRoot, worktreeRoot)) ||
      approvedReadRoots.some((readRoot) => rootsOverlapV1(durableArtifactRoot, readRoot))) {
    throw new MissionCliError("Daisy durable artifact root must not overlap any worktree or approved read root.", 1);
  }
  return Object.freeze({ ...intent, approvedReadRoots: Object.freeze(approvedReadRoots) as unknown as string[], durableArtifactRoot });
}

async function prepareAuthorizeDaisyCoordination(
  root: string,
  config: ShieldConfig,
  missionId: string,
  inputPath: string,
  issuedAt: { value: string; provenance: "hostTrusted" },
): Promise<PreparedAuthorizeDaisyCoordination> {
  const configurationSnapshot = await repositoryConfigSnapshot(root);
  if (canonicalJson(configurationSnapshot.config) !== canonicalJson(config)) {
    throw new MissionCliError("SHIELD configuration changed during Daisy coordination preparation.", 1);
  }
  const inputBytes = await regularTextFile(inputPath, "Authorize Daisy coordination input");
  let parsed: unknown;
  try { parsed = JSON.parse(inputBytes); }
  catch { throw new MissionCliError(`Authorize Daisy coordination input contains malformed JSON: ${inputPath}.`, 1); }
  const uncheckedIntent = validateAuthorizeDaisyCoordinationInput(parsed);
  const current = await currentProfileAwareMission(root, config, missionId);
  if (current.projection.authorization !== "authorized" || current.projection.execution !== "not-started" ||
      current.projection.finalAcceptance !== "waiting" || Object.hasOwn(current.projection, "daisyCoordinationAuthority")) {
    throw new MissionCliError("Authorize Daisy coordination requires an authorized not-started mission with no prior Daisy authority or binding.", 1);
  }
  if (!current.projection.brief.participants.some(({ seatId }) => seatId === "daisy")) {
    throw new MissionCliError("Authorize Daisy coordination requires Daisy to be a mission participant.", 1);
  }
  if (DAISY_COORDINATION_ACTION_ID !== "action:feature-flight.daisy.reconnaissance" ||
      DAISY_COORDINATION_EFFECT_CLASS !== "coordination" ||
      DAISY_COORDINATION_CAPABILITY_CLASS !== "read_only_coordination") {
    throw new MissionCliError("Authorize Daisy coordination fixed tuple is unavailable.", 1);
  }
  const observation = await observeDaisyCoordinationRepository(root, config.repositoryId);
  const intent = await canonicalDaisyIntentRoots(uncheckedIntent, observation);
  const identities = ["daisy", intent.runtimeId, intent.modelId, intent.executorId];
  if (new Set(identities).size !== identities.length || current.projection.brief.participants.some(({ seatId }) => identities.slice(1).includes(seatId))) {
    throw new MissionCliError("Daisy seat, runtime, model, and executor must be pairwise distinct, and executor identities cannot be mission participants.", 1);
  }
  const humanBinding = coulsonBinding(current);
  const start = current.projection.lastSequence;
  const authority = unwrap(validateDaisyCoordinationAuthorityV1({
    schemaVersion: 1,
    contractVersion: DAISY_COORDINATION_AUTHORITY_CONTRACT_VERSION,
    authorityKind: DAISY_COORDINATION_AUTHORITY_KIND,
    authorityRef: `authority:${missionId}:daisy-coordination:${start + 1}`,
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    evaluatedThroughSequence: start,
    repositoryId: config.repositoryId,
    canonicalRepositoryRoot: observation.canonicalRoot,
    branch: observation.branch,
    headRevision: observation.head,
    seatId: "daisy",
    actionId: DAISY_COORDINATION_ACTION_ID,
    effectClass: DAISY_COORDINATION_EFFECT_CLASS,
    effectKey: intent.effectKey,
    capabilityClass: DAISY_COORDINATION_CAPABILITY_CLASS,
    approvedReadRoots: intent.approvedReadRoots,
    durableArtifactRoot: intent.durableArtifactRoot,
    issuedAt,
    signingKeyRef: humanBinding.signingKeyRef,
  }));
  const authorityDigest = computeDaisyCoordinationAuthorityDigest(authority);
  const authorizationId = `authorization:${missionId}:daisy-coordination-binding:${start + 2}`;
  const runtimeBinding = unwrap(validateDaisyCoordinationRuntimeBindingV1({
    schemaVersion: 1,
    contractVersion: "daisy-coordination-runtime-binding.v1",
    bindingId: `binding:${missionId}:daisy:1`,
    bindingVersion: 1,
    priorBindingId: null,
    priorBindingVersion: null,
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    seatId: "daisy",
    runtimeId: intent.runtimeId,
    modelId: intent.modelId,
    executorId: intent.executorId,
    actionId: DAISY_COORDINATION_ACTION_ID,
    effectClass: DAISY_COORDINATION_EFFECT_CLASS,
    effectKey: intent.effectKey,
    capabilityClass: DAISY_COORDINATION_CAPABILITY_CLASS,
    repositoryId: config.repositoryId,
    canonicalRepositoryRoot: observation.canonicalRoot,
    branch: observation.branch,
    headRevision: observation.head,
    durableArtifactRoot: intent.durableArtifactRoot,
    authorityRef: authority.authorityRef,
    authorityDigest,
    authoritySequence: start + 1,
    effectiveSequence: start + 2,
    lifecycleState: "active",
    coulsonAuthorizationRef: authorizationId,
  }));
  const runtimeAuthorization = unwrap(validateDaisyCoordinationRuntimeBindingAuthorizationV1({
    schemaVersion: 1,
    contractVersion: "daisy-coordination-runtime-binding-authorization.v1",
    authorizationId,
    missionId,
    subjectId: current.projection.brief.subjectId,
    seatId: "daisy",
    bindingId: runtimeBinding.bindingId,
    bindingVersion: runtimeBinding.bindingVersion,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeDaisyCoordinationRuntimeBindingDigest(runtimeBinding),
    authorityRef: authority.authorityRef,
    authorityDigest,
    authoritySequence: start + 1,
    decision: "approved",
    previousJournalSequence: start + 1,
    journalSequence: start + 2,
    signingKeyRef: humanBinding.signingKeyRef,
    sourceRef: `cli:authorize-daisy-coordination:${start + 2}`,
    issuedAt,
  }));
  const payloads = canonicalSnapshot([authority, runtimeAuthorization]) as unknown as readonly [DaisyCoordinationAuthorityV1, DaisyCoordinationRuntimeBindingAuthorizationV1];
  const journalPaths = unwrap(resolveSupervisedMissionPaths(root, config.paths.journals, missionId));
  const journalBytes = await regularTextFile(journalPaths.journalPath, "Mission journal");
  const startingJournalSha256 = journalByteSha256(journalBytes);
  const manifestWithoutDigest = {
    schemaVersion: 1,
    schemaId: "shield.daisy-coordination-authorization-manifest.v1",
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    repository: {
      repositoryId: config.repositoryId,
      canonicalRoot: observation.canonicalRoot,
      branch: observation.branch,
      baseRevision: observation.baseRevision,
      headRevision: observation.head,
      worktreeRoots: observation.worktreeRoots,
    },
    journal: { startingSequence: start, authoritySequence: start + 1, bindingSequence: start + 2, startingJournalSha256 },
    humanBinding: { seatId: "coulson", bindingId: humanBinding.bindingId, humanPrincipalId: humanBinding.humanPrincipalId, signingKeyRef: humanBinding.signingKeyRef },
    daisyCoordinationAuthority: authority,
    daisyRuntimeBinding: runtimeBinding,
    validationId: DAISY_COORDINATION_VALIDATION_ID,
    constituentPayloads: [
      { eventType: "coordination.authorized", payload: payloads[0], authorityDigest },
      { eventType: "coordination.runtime_bound", payload: payloads[1] },
    ],
    exclusions: ["fixture_invocation", "model_invocation", "network_write", "publication", "merge", "deployment", "release", "human_review"],
    remainingHumanGates: remainingOnePasscodeHumanGates(current),
  };
  const manifest = canonicalSnapshot({ ...manifestWithoutDigest, manifestDigest: canonicalDigest(manifestWithoutDigest) });
  return {
    configurationIdentity: canonicalJson(config),
    configurationBytes: configurationSnapshot.bytes,
    configurationPathIdentity: configurationSnapshot.identity,
    inputBytes, intent, current, observation, journalBytes,
    startingJournalSha256, humanBinding, authority, authorityDigest, runtimeBinding, payloads, manifest,
  };
}

function assertPreparedAuthorizeDaisyFresh(initial: PreparedAuthorizeDaisyCoordination, fresh: PreparedAuthorizeDaisyCoordination): void {
  if (initial.configurationIdentity !== fresh.configurationIdentity || initial.configurationBytes !== fresh.configurationBytes ||
      initial.configurationPathIdentity !== fresh.configurationPathIdentity || initial.inputBytes !== fresh.inputBytes ||
      initial.journalBytes !== fresh.journalBytes || initial.startingJournalSha256 !== fresh.startingJournalSha256 ||
      canonicalJson(initial.observation) !== canonicalJson(fresh.observation) || canonicalJson(initial.current.entries) !== canonicalJson(fresh.current.entries) ||
      canonicalJson(initial.current.projection) !== canonicalJson(fresh.current.projection) ||
      canonicalJson(initial.humanBinding) !== canonicalJson(fresh.humanBinding) ||
      canonicalJson(initial.payloads) !== canonicalJson(fresh.payloads) || canonicalJson(initial.manifest) !== canonicalJson(fresh.manifest)) {
    throw new MissionCliError("Authorize Daisy coordination input, signer binding, repository, or journal changed after display.", 1);
  }
}

async function authorizeDaisyCoordination(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--input"], ["--json", "--passcode-stdin"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const missionId = required(options, "--mission-id");
  const inputPath = resolve(root, required(options, "--input"));
  const config = await repositoryConfig(root);
  const issuedAt = { value: new Date().toISOString(), provenance: "hostTrusted" as const };
  const prepared = await prepareAuthorizeDaisyCoordination(root, config, missionId, inputPath, issuedAt);
  let signerSnapshot1;
  try {
    signerSnapshot1 = await captureMissionSignerSnapshot(prepared.humanBinding.signingKeyRef);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new MissionCliError("No local Coulson signer was found for this mission binding.", 1);
    }
    throw new MissionCliError(error instanceof Error ? error.message : "Coulson signer snapshot failed.", 1);
  }
  process.stderr.write(`SHIELD_DAISY_COORDINATION_MANIFEST_BEGIN\n${canonicalJson(prepared.manifest)}\nSHIELD_DAISY_COORDINATION_MANIFEST_END\n`);
  const passcode = await passcodeFromOptions(options, options.flags.has("--json") ? process.stderr : outputStream);
  let signatures: readonly string[];
  try {
    signatures = await signPayloadBatchWithSigner(prepared.humanBinding.signingKeyRef, prepared.humanBinding.publicKeySpkiBase64, passcode, prepared.payloads);
  } catch (error) {
    throw new MissionCliError(error instanceof Error ? error.message : "Coulson Daisy coordination batch signing failed.", 1);
  }
  if (signatures.length !== 2) throw new MissionCliError("Coulson Daisy coordination signer did not return exactly two signatures.", 1);
  const publicKey = createPublicKey({ key: Buffer.from(prepared.humanBinding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
  for (let index = 0; index < signatures.length; index += 1) {
    if (!verify(null, Buffer.from(canonicalJson(prepared.payloads[index])), publicKey, Buffer.from(signatures[index], "base64"))) {
      throw new MissionCliError(`Independent Daisy coordination signature verification failed for constituent ${index + 1}.`, 1);
    }
  }
  const afterSigningConfig = await repositoryConfig(root);
  const afterSigning = await prepareAuthorizeDaisyCoordination(root, afterSigningConfig, missionId, inputPath, issuedAt);
  assertPreparedAuthorizeDaisyFresh(prepared, afterSigning);
  const trustedBindings = profileAwareBindings(afterSigning.current);
  const stagedEntries = [...afterSigning.current.entries];
  let stagedProjection = afterSigning.current.projection;
  const authorityEntry = produce(() => createProfileAwareDaisyCoordinationAuthorityEntryV1({
    projection: stagedProjection,
    trustedBindings,
    authority: { payload: prepared.authority, authorityDigest: prepared.authorityDigest, signatureBase64: signatures[0] },
  }));
  stagedEntries.push(authorityEntry);
  stagedProjection = unwrap(replayProfileAwareMissionJournal(stagedEntries));
  const runtimeEntry = produce(() => createProfileAwareDaisyRuntimeBindingEntryV1({
    projection: stagedProjection,
    trustedBindings,
    binding: prepared.runtimeBinding,
    authorization: { payload: prepared.payloads[1], signatureBase64: signatures[1] },
  }));
  stagedEntries.push(runtimeEntry);
  stagedProjection = unwrap(replayProfileAwareMissionJournal(stagedEntries));
  const batchEntries = [authorityEntry, runtimeEntry];
  if (canonicalJson(batchEntries.map(({ type, sequence }) => ({ type, sequence }))) !== canonicalJson([
    { type: "coordination.authorized", sequence: afterSigning.current.projection.lastSequence + 1 },
    { type: "coordination.runtime_bound", sequence: afterSigning.current.projection.lastSequence + 2 },
  ])) throw new MissionCliError("Constructed Daisy coordination batch is not the frozen consecutive two-entry transition.", 1);
  const signerSnapshot2 = await captureMissionSignerSnapshot(prepared.humanBinding.signingKeyRef);
  try {
    assertMissionSignerSnapshotUnchanged(signerSnapshot1, signerSnapshot2);
  } catch (error) {
    throw new MissionCliError(error instanceof Error ? error.message : "Mission signer snapshot changed after display.", 1);
  }
  const stored = unwrap(await appendProfileAwareMissionEntriesAtomicV1({
    ...missionPaths(root, afterSigningConfig, missionId), entries: batchEntries,
    expectedStartingJournalSha256: prepared.startingJournalSha256,
  }));
  if (canonicalJson(stored.projection) !== canonicalJson(stagedProjection)) throw new MissionCliError("Durable Daisy coordination projection differs from staged replay.", 1);
  const receiptWithoutDigest = {
    schemaVersion: 1,
    schemaId: "shield.daisy-coordination-authorization-receipt.v1",
    missionId,
    subjectId: prepared.current.projection.brief.subjectId,
    missionRevisionId: prepared.current.projection.brief.revisionId,
    repositoryId: config.repositoryId,
    canonicalRoot: prepared.observation.canonicalRoot,
    branch: prepared.observation.branch,
    baseRevision: prepared.observation.baseRevision,
    headRevision: prepared.observation.head,
    startingJournalSequence: stored.startingSequence,
    endingJournalSequence: stored.endingSequence,
    finalJournalSha256: stored.finalJournalSha256,
    manifestDigest: prepared.manifest.manifestDigest,
    authorityRef: prepared.authority.authorityRef,
    authorityDigest: prepared.authorityDigest,
    bindingId: prepared.runtimeBinding.bindingId,
    bindingVersion: prepared.runtimeBinding.bindingVersion,
    validationId: DAISY_COORDINATION_VALIDATION_ID,
    constituents: [authorityEntry, runtimeEntry].map((entry) => ({ eventType: entry.type, entryId: entry.entryId, sequence: entry.sequence })),
  };
  const receipt = canonicalSnapshot({ ...receiptWithoutDigest, receiptDigest: canonicalDigest(receiptWithoutDigest) });
  output(receipt, options.flags.has("--json"), `Authorize Daisy coordination completed.\n${JSON.stringify(receipt, null, 2)}`);
  return 0;
}

async function wheelsUp(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--input"], ["--json", "--passcode-stdin"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = await currentProfileAwareMission(root, config, missionId);
  const intent = wheelsUpIntent(await jsonFile(resolve(root, required(options, "--input")), "Wheels Up input"));
  if (intent.modelId === "may" || current.projection.brief.participants.some(({ seatId }) => seatId === intent.modelId)) {
    throw new MissionCliError("Wheels Up model identity must be distinct from May and every mission participant.", 1);
  }
  const observation = await observeRepository(root);
  await validateBaseRevision(observation, intent.baseRevision);
  const binding = coulsonBinding(current);
  const sequence = current.projection.lastSequence + 1;
  const timestamp = { value: new Date().toISOString(), provenance: "hostTrusted" as const };
  const authority = unwrap(validateImplementationAuthorityV1({
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: `authority:${missionId}:${sequence}`,
    missionId,
    subjectId: current.projection.brief.subjectId,
    seatId: "may",
    missionRevisionId: current.projection.brief.revisionId,
    artifactRevisionId: observation.head,
    repositoryId: config.repositoryId,
    canonicalWritableRoot: observation.canonicalRoot,
    branch: observation.branch,
    baseRevision: intent.baseRevision,
    headRevision: observation.head,
    modelId: intent.modelId,
    approvedRelativePaths: intent.approvedRelativePaths,
    approvedActionIds: intent.approvedActionIds,
    approvedEffectClasses: intent.approvedEffectClasses,
    approvedEffectKeys: intent.approvedEffectKeys,
    approvedCapabilities: intent.approvedCapabilities,
    validationCommandIds: intent.validationCommandIds,
    journalSequence: sequence,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `cli:wheels-up:${sequence}`,
    evidenceRef: `evidence:wheels-up:${sequence}`,
    timestamp,
  }));
  const passcode = await passcodeFromOptions(options);
  const signatureBase64 = await signMissionPayload(binding, passcode, authority, missionId);
  const [freshConfig, freshObservation] = await Promise.all([
    repositoryConfig(root),
    observeRepository(root),
  ]);
  if (freshConfig.repositoryId !== config.repositoryId || freshConfig.paths.journals !== config.paths.journals) {
    throw new MissionCliError("Repository configuration changed while Wheels Up was being signed.", 1);
  }
  const fresh = await currentProfileAwareMission(root, freshConfig, missionId);
  if (fresh.projection.lastSequence !== current.projection.lastSequence || !sameObservation(observation, freshObservation)) {
    throw new MissionCliError("Mission journal or repository identity changed while Wheels Up was being signed.", 1);
  }
  const entry = produce(() => createProfileAwareImplementationAuthorityEntryV1({
    projection: fresh.projection,
    trustedBindings: profileAwareBindings(fresh),
    authority: { payload: authority, signatureBase64 },
  }));
  const appended = unwrap(await appendProfileAwareMissionEntryV1({ ...missionPaths(root, config, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), profileAwareStatusText(appended.projection));
  return 0;
}

async function bindMay(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--input"], ["--json", "--passcode-stdin"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = await currentProfileAwareMission(root, config, missionId);
  const authority = current.projection.implementationAuthority;
  if (current.projection.implementationAuthorityState !== "authorized" || authority === null) {
    throw new MissionCliError("May binding requires an active Wheels Up implementation authority.", 1);
  }
  if (config.repositoryId !== authority.repositoryId) {
    throw new MissionCliError("Repository ID no longer matches Wheels Up authority.", 1);
  }
  const intent = bindIntent(await jsonFile(resolve(root, required(options, "--input")), "May binding input"));
  const identities = ["may", intent.reasoningRuntimeId, authority.modelId, intent.toolExecutorId];
  if (new Set(identities).size !== identities.length ||
      current.projection.brief.participants.some(({ seatId }) => identities.slice(1).includes(seatId))) {
    throw new MissionCliError("May seat, reasoning runtime, model, and tool executor must be mutually distinct and cannot be mission participants.", 1);
  }
  const observation = await observeRepository(root);
  if (observation.canonicalRoot !== authority.canonicalWritableRoot || observation.branch !== authority.branch || observation.head !== authority.headRevision) {
    throw new MissionCliError("Repository root, branch, or HEAD no longer matches Wheels Up authority.", 1);
  }
  const sequence = current.projection.lastSequence + 1;
  const authorizationId = `authorization:runtime-binding:${sequence}`;
  const runtimeBinding: RuntimeBinding = {
    bindingSchemaVersion: 1,
    bindingId: `binding:${missionId}:may:1`,
    bindingVersion: 1,
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    seatId: "may",
    reasoningRuntimeId: intent.reasoningRuntimeId,
    toolExecutorId: intent.toolExecutorId,
    repositoryId: authority.repositoryId,
    canonicalWritableRoot: authority.canonicalWritableRoot,
    branch: authority.branch,
    artifactRevisionId: authority.artifactRevisionId,
    recordedAtSequence: sequence,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: [...authority.approvedActionIds],
      effectClasses: [...authority.approvedEffectClasses],
      effectKeys: [...authority.approvedEffectKeys],
      capabilities: [...authority.approvedCapabilities],
    },
    coulsonAuthorizationRef: authorizationId,
  };
  const wrapper = unwrap(validateSchema9RuntimeBindingV1({
    schemaVersion: 1,
    binding: runtimeBinding,
    implementationAuthorityRef: authority.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authority),
    implementationAuthoritySequence: authority.journalSequence,
    approvedRelativePaths: [...authority.approvedRelativePaths],
    validationCommandIds: [...authority.validationCommandIds],
    modelId: authority.modelId,
    baseRevision: authority.baseRevision,
    headRevision: authority.headRevision,
  }));
  const signer = coulsonBinding(current);
  const timestamp = { value: new Date().toISOString(), provenance: "hostTrusted" as const };
  const payload: Schema9RuntimeBindingAuthorizationPayload = unwrap(validateSchema9RuntimeBindingAuthorizationPayload({
    schemaVersion: 1,
    authorizationId,
    missionId,
    subjectId: current.projection.brief.subjectId,
    seatId: "may",
    bindingId: runtimeBinding.bindingId,
    bindingVersion: 1,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeRuntimeBindingDigest(runtimeBinding),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(wrapper),
    artifactRevisionId: authority.artifactRevisionId,
    decision: "approved",
    previousJournalSequence: current.projection.lastSequence,
    journalSequence: sequence,
    humanPrincipalId: signer.humanPrincipalId,
    humanBindingId: signer.bindingId,
    signingKeyRef: signer.signingKeyRef,
    sourceRef: `cli:runtime-binding:${sequence}`,
    timestamp,
  }));
  const passcode = await passcodeFromOptions(options);
  const signatureBase64 = await signMissionPayload(signer, passcode, payload, missionId);
  const [freshConfig, freshObservation] = await Promise.all([
    repositoryConfig(root),
    observeRepository(root),
  ]);
  if (freshConfig.repositoryId !== config.repositoryId || freshConfig.paths.journals !== config.paths.journals || freshConfig.repositoryId !== authority.repositoryId) {
    throw new MissionCliError("Repository configuration changed while May binding was being signed.", 1);
  }
  const fresh = await currentProfileAwareMission(root, freshConfig, missionId);
  if (fresh.projection.lastSequence !== current.projection.lastSequence || !sameObservation(observation, freshObservation)) {
    throw new MissionCliError("Mission journal or repository identity changed while May binding was being signed.", 1);
  }
  const entry = produce(() => createProfileAwareRuntimeBindingRecordedEntryV1({
    projection: fresh.projection,
    trustedBindings: profileAwareBindings(fresh),
    binding: wrapper,
    authorization: { payload, signatureBase64 },
  }));
  const appended = unwrap(await appendProfileAwareMissionEntryV1({ ...missionPaths(root, config, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), profileAwareStatusText(appended.projection));
  return 0;
}

async function step(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = await currentMission(root, config, missionId);
  const planned = unwrap(planMissionStep(current.projection, {
    value: new Date().toISOString(),
    provenance: "hostTrusted",
  }));
  if (planned.entry === null) {
    output({ outcome: planned.outcome, projection: current.projection }, options.flags.has("--json"), `Mission ${missionId} is already execution-complete; no journal entry was appended.`);
    return 0;
  }
  const appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, missionId), entry: planned.entry }));
  output({ outcome: planned.outcome, projection: appended.projection }, options.flags.has("--json"), statusText(appended.projection));
  return 0;
}

async function recordEvidence(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--evidence"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = await currentMission(root, config, missionId);
  const evidence = await jsonFile(resolve(root, required(options, "--evidence")), "Signed evidence") as SignedHumanEvidence;
  const entry = unwrap(createEvidenceEntry(current.projection, evidence));
  const appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), statusText(appended.projection));
  return 0;
}

async function show(command: "status" | "report", args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), false);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = unwrap(await readMissionJournalForDisplay(missionPaths(root, config, missionId)));
  const human = current.kind === "profile-aware"
    ? profileAwareStatusText(current.projection)
    : statusText(current.projection);
  if (command === "status") {
    output(current.projection, options.flags.has("--json"), human);
  } else {
    const report = { projection: current.projection, entries: current.entries };
    output(report, options.flags.has("--json"), `${human}\nJournal entries: ${current.entries.length}`);
  }
  return 0;
}

export function missionUsage(): string {
  return [
    "  shield mission begin --brief <file> [--root <path>] [--json]",
    "  shield mission begin --profile-aware --brief <file> [--root <path>] [--json]",
    "  shield mission begin --authorization delegated --brief <file> --delegation <revision> --eligibility <file> [--root <path>] [--json]",
    "  shield mission signer bootstrap --seat coulson --binding-id <id> --human-principal-id <id> [--passcode-stdin] [--json]",
    "  shield mission signer setup [--seat coulson] [--root <path>] [--passcode-stdin] [--json]",
    "  shield mission authorize --mission-id <id> [--root <path>] [--passcode-stdin] [--json]",
    "  shield mission authorize-wheels-up --mission-id <id> --input <file> [--root <path>] [--passcode-stdin] [--human|--json]",
    "  shield mission record-reviewed-transition --transition-plan <file> --review-artifact <file> --dispatch-receipt-id <id> --mission-id <id> [--root <path>]",
    "  shield mission prepare-next --mission-id <id> [--root <path>] [--passcode-stdin] [--human|--json]",
    "  shield mission authorize-daisy-coordination --mission-id <id> --input <file> [--root <path>] [--passcode-stdin] [--json]",
    "  shield mission publication-authorize --mission-id <id> --input <file> [--root <path>] [--passcode-stdin] [--json]",
    "  shield mission publication-request --mission-id <id> --input <file> [--root <path>] [--json]",
    "  shield mission publication-result --mission-id <id> --input <file> [--root <path>] [--json]",
    "  shield mission wheels-up --mission-id <id> --input <file> [--root <path>] [--passcode-stdin] [--json]",
    "  shield mission bind --mission-id <id> --input <file> [--root <path>] [--passcode-stdin] [--json]",
    "  shield mission approve|pause|cancel --mission-id <id> --evidence <file> [--root <path>] [--json]",
    "  shield mission resume --mission-id <id> --evidence <file> --resume-state <proposed|approved> [--root <path>] [--json]",
    "  shield mission status|step|report --mission-id <id> [--root <path>] [--json]",
    "  shield evidence record --mission-id <id> --evidence <file> [--root <path>] [--json]",
    "  shield mission invalidate --mission-id <id> --reason <reason> [--root <path>] [--json]",
    "  shield delegation grant|revoke --evidence <file> [--root <path>] [--json]",
  ].join("\n");
}

export async function runMissionCli(args: string[]): Promise<number> {
  const [group, action, ...rest] = args;
  if (group === "mission") {
    if (action === "begin") return begin(rest);
    if (action === "authorize") return authorize(rest);
    if (action === "authorize-wheels-up") return authorizeWheelsUp(rest);
    if (action === "record-reviewed-transition") return recordReviewedTransition(rest);
    if (action === "prepare-next") return prepareNext(rest);
    if (action === "authorize-daisy-coordination") return authorizeDaisyCoordination(rest);
    if (action === "publication-authorize") return publicationAuthorize(rest);
    if (action === "publication-request") return publicationRequest(rest);
    if (action === "publication-result") return publicationResult(rest);
    if (action === "wheels-up") return wheelsUp(rest);
    if (action === "bind") return bindMay(rest);
    if (action === "signer" && rest[0] === "bootstrap") return signerBootstrap(rest.slice(1));
    if (action === "signer" && rest[0] === "setup") return signerSetup(rest.slice(1));
    if (action === "approve" || action === "pause" || action === "resume" || action === "cancel") return governance(action, rest);
    if (action === "step") return step(rest);
    if (action === "invalidate") return invalidate(rest);
    if (action === "status" || action === "report") return show(action, rest);
  }
  if (group === "evidence" && action === "record") return recordEvidence(rest);
  if (group === "delegation" && (action === "grant" || action === "revoke")) return delegation(action, rest);
  throw new MissionCliError(`Unsupported supervised mission command.\n${missionUsage()}`);
}
