import { execFile as execFileNode } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath as fsRealpath } from "node:fs/promises";
import { createHash, createPublicKey, verify } from "node:crypto";
import { join, resolve } from "node:path";
import { types } from "node:util";
import { parseShieldConfig, type ShieldConfig } from "./config.mjs";
import {
  canonicalJson,
  type ContractResult,
} from "./mission-v2.mjs";
import {
  createProfileAwareGovernanceDecisionEntryV1,
  createProfileAwareImplementationAuthorityEntryV1,
  createProfileAwareRuntimeBindingRecordedEntryV1,
  createProfileAwareReviewPublicationAuthorizationEntryV1,
  type ProfileAwareMissionEntryV1,
  type SignedProfileEvidenceV1,
  replayProfileAwareMissionJournal,
} from "./profile-aware-mission-v1.mjs";
import {
  computeImplementationAuthorityDigest,
  computeSchema9RuntimeBindingDigest,
  computeRuntimeBindingDigest,
  Schema9RuntimeBindingAuthorizationPayload,
  Schema9RuntimeBindingV1,
  validateImplementationAuthorityV1,
  validateSchema9RuntimeBindingAuthorizationPayload,
  validateSchema9RuntimeBindingV1,
  type ImplementationAuthorityV1,
} from "./implementation-authority-v1.mjs";
import {
  computeReviewPublicationAuthorityDigest,
  evaluateReviewPublicationV1,
  type ReviewPublicationAuthorityV1,
} from "./review-publication-v1.mjs";
import { type RuntimeBinding } from "./permission-v1.mjs";
import { type TrustedHumanBinding } from "./mission-v2.mjs";
import {
  appendProfileAwareMissionEntriesAtomicV1,
  journalByteSha256,
  readMissionJournalForDisplay,
  type MissionJournalDisplay,
  type ProfileAwareBatchReceipt,
  resolveSupervisedMissionPaths,
} from "./mission-store.mjs";
import {
  renderAuthorizeWheelsUpHumanV1,
  renderAuthorizeWheelsUpReceiptHumanV1,
} from "./mission-human-output-v1.mjs";

interface RepositoryObservation {
  canonicalRoot: string;
  branch: string;
  head: string;
}
interface PublicationRepositoryObservation {
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
  baseTreeEntries: { mode: string; type: string; path: string }[];
  headTreeEntries: { mode: string; type: string; path: string }[];
}

type WheelsUpIntent = {
  baseRevision: string;
  modelId: string;
  approvedRelativePaths: string[];
  approvedActionIds: string[];
  approvedEffectClasses: ("behavioral_implementation" | "verification" | "coordination")[];
  approvedEffectKeys: string[];
  approvedCapabilities: string[];
  validationCommandIds: string[];
  reasoningRuntimeId: string;
  toolExecutorId: string;
  publicationPaths: string[];
};

const CONFIG_PATH = join(".shield", "config.json");
const INITIAL_DRAFT_EFFECTS = Object.freeze([
  "review.branch.push",
  "review.pull_request.create_draft",
] as const);
const ONE_PASSCODE_EXCLUSIONS = Object.freeze([
  "review.comment.publish",
  "review.pull_request.update_draft",
  "review.pull_request.mark_ready",
  "merge",
  "deployment",
  "release",
  "final_acceptance",
] as const);

type StringComparator = (left: string, right: string) => number;
type PublicationTreeEntry = { mode: string; type: string; path: string };

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function canonicalPublicationPathCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function strictClosedDataObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} is not a plain closed data object.`);
  }
  const keys = Reflect.ownKeys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== "string" || !fields.includes(key)) ||
    fields.some((field) => {
      const descriptor = descriptors[field];
      return !descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable;
    })
  ) {
    throw new Error(`${label} must contain only enumerable data fields: ${fields.join(", ")}.`);
  }
  return Object.fromEntries(fields.map((field) => [field, descriptors[field].value]));
}

export function validateAuthorizeWheelsUpInput(value: unknown): Readonly<WheelsUpIntent> {
  const fields = [
    "baseRevision", "modelId", "approvedRelativePaths", "approvedActionIds",
    "approvedEffectClasses", "approvedEffectKeys", "approvedCapabilities", "validationCommandIds",
    "reasoningRuntimeId", "toolExecutorId", "publicationPaths",
  ] as const;
  const input = strictClosedDataObject(value, fields, "Authorize Wheels Up input");
  for (const field of ["baseRevision", "modelId", "reasoningRuntimeId", "toolExecutorId"] as const) {
    const fieldValue = input[field];
    if (typeof fieldValue !== "string" || fieldValue.trim() !== fieldValue || fieldValue.length === 0) {
      throw new Error(`Authorize Wheels Up ${field} is malformed.`);
    }
  }
  const strictSortedStrings = (value: unknown, label: string, compare: StringComparator = (left, right) => left.localeCompare(right)) => {
    if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length < 1 || value.length > 256 || Reflect.ownKeys(value).length !== value.length + 1) {
      throw new Error(`${label} must be a non-empty dense sorted array.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        !descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable ||
        typeof descriptor.value !== "string" || descriptor.value.length === 0
      ) {
        throw new Error(`${label} contains an unsafe or malformed item.`);
      }
      result.push(descriptor.value);
    }
    const sorted = [...result].sort(compare);
    if (result.some((item, index) => item !== sorted[index]) || new Set(result).size !== result.length) {
      throw new Error(`${label} must be sorted and contain no duplicates.`);
    }
    return result;
  };
  const result: WheelsUpIntent = {
    baseRevision: input.baseRevision as string,
    modelId: input.modelId as string,
    approvedRelativePaths: strictSortedStrings(input.approvedRelativePaths, "approvedRelativePaths"),
    approvedActionIds: strictSortedStrings(input.approvedActionIds, "approvedActionIds"),
    approvedEffectClasses: strictSortedStrings(input.approvedEffectClasses, "approvedEffectClasses") as
      WheelsUpIntent["approvedEffectClasses"],
    approvedEffectKeys: strictSortedStrings(input.approvedEffectKeys, "approvedEffectKeys"),
    approvedCapabilities: strictSortedStrings(input.approvedCapabilities, "approvedCapabilities"),
    validationCommandIds: strictSortedStrings(input.validationCommandIds, "validationCommandIds"),
    reasoningRuntimeId: input.reasoningRuntimeId as string,
    toolExecutorId: input.toolExecutorId as string,
    publicationPaths: strictSortedStrings(input.publicationPaths, "publicationPaths", canonicalPublicationPathCompare),
  };
  return Object.freeze(result);
}

type PreparedAuthorizeWheelsUp = {
  configurationIdentity: string;
  current: ProfileAwareJournal;
  observation: PublicationRepositoryObservation;
  journalBytes: string;
  startingJournalSha256: string;
  binding: TrustedHumanBinding;
  implementationAuthority: ImplementationAuthorityV1;
  runtimeBinding: Schema9RuntimeBindingV1;
  publicationAuthority: ReviewPublicationAuthorityV1;
  payloads: readonly unknown[];
  manifest: Readonly<Record<string, unknown>>;
};

type ProfileAwareJournal = Extract<MissionJournalDisplay, { kind: "profile-aware" }>;
type GovernanceDecisionEntry = Extract<ProfileAwareMissionEntryV1, { type: "governance.decided" }>;
type ImplementationAuthorityEntry = Extract<ProfileAwareMissionEntryV1, { type: "implementation.authorized" }>;
type RuntimeBindingRecordedEntry = Extract<ProfileAwareMissionEntryV1, { type: "runtime.binding_recorded" }>;
type ReviewPublicationAuthorizationEntry = Extract<ProfileAwareMissionEntryV1, { type: "review.publication_authorized" }>;

async function exactRoot(path: string): Promise<string> {
  const root = resolve(path);
  if (!root) throw new Error(`Repository root is inaccessible: ${path}.`);
  return root;
}

function unwrap<T>(result: ContractResult<T>): T {
  if (result.state === "invalid") {
    throw new Error(`${result.code}: ${result.errors.join(" ")}`);
  }
  return result.value;
}

function produce<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Mission contract producer failed.");
  }
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

function missionPaths(root: string, config: ShieldConfig, missionId: string) {
  return { repositoryRoot: root, configuredJournalPath: config.paths.journals, missionId };
}

function regularTextFile(path: string, label: string): Promise<string> {
  return (async () => {
    let stats = await lstat(path).catch(() => null);
    if (!stats || !stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`${label} is missing or unreadable: ${path}.`);
    }
    return readFile(path, "utf8");
  })();
}

async function repositoryConfig(root: string): Promise<ShieldConfig> {
  const content = await regularTextFile(join(root, CONFIG_PATH), "SHIELD configuration");
  const parsed = parseShieldConfig(content);
  if (parsed.state === "invalid") throw new Error(parsed.issues.map(({ message }) => message).join(" "));
  return canonicalSnapshot(parsed.value);
}

function canonicalDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`;
}

function sameObservation(left: RepositoryObservation, right: RepositoryObservation): boolean {
  return left.canonicalRoot === right.canonicalRoot && left.branch === right.branch && left.head === right.head;
}

function assert(a: unknown, message: string): void {
  if (!a) throw new Error(message);
}

function validateBaseRevision(observation: RepositoryObservation, baseRevision: string): Promise<void> {
  if (typeof baseRevision !== "string" || baseRevision.trim() !== baseRevision || baseRevision.length === 0) {
    throw new Error("Wheels Up baseRevision is malformed.");
  }
  return execGitValue(observation.canonicalRoot, ["cat-file", "-e", `${baseRevision}^{commit}`])
    .then(() => execGitValue(observation.canonicalRoot, ["merge-base", "--is-ancestor", baseRevision, observation.head]))
    .then(() => undefined);
}

function profileAwareBindings(current: ProfileAwareJournal): TrustedHumanBinding[] {
  const missionBegun = current.entries[0];
  if (!missionBegun || missionBegun.type !== "mission.begun") throw new Error("Profile-aware journal has no trusted begin entry.");
  return missionBegun.payload.trustedBindings.map((binding: TrustedHumanBinding) => ({ ...binding }));
}

function coulsonBinding(current: ProfileAwareJournal): TrustedHumanBinding {
  const matches = profileAwareBindings(current).filter(({ seatId }) => seatId === "coulson");
  if (matches.length !== 1) throw new Error("Profile-aware journal requires exactly one frozen Coulson binding.");
  return matches[0];
}

async function currentProfileAwareMission(root: string, config: ShieldConfig, missionId: string): Promise<ProfileAwareJournal> {
  const current = unwrap(await readMissionJournalForDisplay(missionPaths(root, config, missionId)));
  if (current.kind !== "profile-aware") throw new Error("Command requires a schema-9 profile-aware mission journal.");
  return current;
}

function literalPath(path: string): string {
  return `:(top,literal)${path}`;
}

function nulRecords(value: string, label: string): string[] {
  if (value.length === 0) return [];
  if (!value.endsWith("\0")) throw new Error(`${label} was not NUL-terminated.`);
  return value.slice(0, -1).split("\0");
}

function treeEntries(value: string, label: string): PublicationTreeEntry[] {
  return nulRecords(value, label).map((record) => {
    const match = /^(?<mode>[0-9]{6}) (?<type>[a-z]+) [0-9a-f]+\t(?<path>[\s\S]+)$/u.exec(record);
    if (!match?.groups) throw new Error(`${label} contains malformed tree evidence.`);
    return { mode: match.groups.mode, type: match.groups.type, path: match.groups.path };
  });
}

function exactTreeEntries(value: string, label: string, authorizedPaths: readonly string[]): PublicationTreeEntry[] {
  const entries = treeEntries(value, label);
  const authorized = new Set(authorizedPaths);
  const observed = new Set<string>();
  for (const entry of entries) {
    if (!authorized.has(entry.path) || observed.has(entry.path)) {
      throw new Error(`${label} contains an unexpected or duplicate path.`);
    }
    observed.add(entry.path);
  }
  return entries;
}

function execGitValue(root: string, args: readonly string[]): Promise<string> {
  return new Promise((resolveValue, reject) => {
    execFileNode("git", ["-C", root, ...args], {
      encoding: "utf8",
      windowsHide: true,
      env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    }, (error, stdout) => {
      if (error) return reject(error);
      resolveValue(stdout.trim());
    });
  });
}

async function observeRepository(root: string): Promise<RepositoryObservation> {
  try {
    const canonicalRoot = await fsRealpath(root);
    const top = await execGitValue(canonicalRoot, ["rev-parse", "--show-toplevel"]);
    const canonicalTop = await fsRealpath(top);
    const branch = await execGitValue(canonicalRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const head = await execGitValue(canonicalRoot, ["rev-parse", "HEAD"]);
    if (canonicalTop !== canonicalRoot || branch.length === 0 || branch === "HEAD" || head.length === 0) {
      throw new Error("repository identity is not a real attached checkout");
    }
    return { canonicalRoot, branch, head };
  } catch (error) {
    throw new Error(`Repository observation failed: ${error instanceof Error ? error.message : String(error)}.`);
  }
}

function publicationPathKinds(observation: PublicationRepositoryObservation, pathComparator?: StringComparator) {
  const all = [...observation.baseTreeEntries, ...observation.headTreeEntries];
  return {
    symlinks: [...new Set(all.filter(({ mode }) => mode === "120000").map(({ path }) => path))].sort(pathComparator),
    gitlinks: [...new Set(all.filter(({ mode, type }) => mode === "160000" || type === "commit").map(({ path }) => path))].sort(pathComparator),
  };
}

async function observePublicationRepository(
  root: string,
  configuredRepositoryId: string,
  baseRevisionInput: string,
  authorizedPaths: readonly string[],
  pathComparator?: StringComparator,
): Promise<PublicationRepositoryObservation> {
  if (baseRevisionInput.trim() !== baseRevisionInput || baseRevisionInput.length === 0) {
    throw new Error("Publication baseRevision is malformed.");
  }
  try {
    const canonicalRoot = await fsRealpath(root);
    const top = await execGitValue(canonicalRoot, ["rev-parse", "--show-toplevel"]);
    const gitTopLevel = await fsRealpath(top);
    const originUrl = await execGitValue(canonicalRoot, ["remote", "get-url", "origin"]);
    const remoteRepositoryId = repositoryIdFromOrigin(originUrl);
    const branch = await execGitValue(canonicalRoot, ["branch", "--show-current"]);
    await execGitValue(canonicalRoot, ["cat-file", "-e", `${baseRevisionInput}^{commit}`]);
    const baseRevision = baseRevisionInput;
    const headRevision = await execGitValue(canonicalRoot, ["rev-parse", "HEAD"]);
    await execGitValue(canonicalRoot, ["merge-base", "--is-ancestor", baseRevision, headRevision]);
    const [status, changed, baseTree, headTree] = await Promise.all([
      execGitValue(canonicalRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
      execGitValue(canonicalRoot, ["diff", "--name-only", "--no-renames", "-z", baseRevision, headRevision, "--"]),
      execGitValue(canonicalRoot, ["ls-tree", "-rz", baseRevision, "--", ...authorizedPaths.map(literalPath)]),
      execGitValue(canonicalRoot, ["ls-tree", "-rz", headRevision, "--", ...authorizedPaths.map(literalPath)]),
    ]);
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
    if (error instanceof Error) throw error;
    throw new Error(`Publication repository observation failed: ${String(error)}`);
  }
}

function repositoryIdFromOrigin(value: string): string {
  const exact = value.trim().replace(/\.git$/u, "");
  const match = /^(?:git@github\.com:|https:\/\/github\.com\/)(?<repository>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/u.exec(exact);
  if (!match?.groups?.repository) throw new Error("Repository origin URL is unsupported or malformed.");
  return match.groups.repository;
}

function remainingOnePasscodeHumanGates(current: ProfileAwareJournal): string[] {
  const gates = new Set<string>(["coulson.final_acceptance", "fitz.technical_review"]);
  if (current.projection.brief.requireSimmons) gates.add("simmons.product_domain_review");
  return [...gates].sort((left, right) => left.localeCompare(right));
}

function assertPreparedAuthorizeWheelsUpFresh(initial: PreparedAuthorizeWheelsUp, fresh: PreparedAuthorizeWheelsUp): void {
  if (fresh.configurationIdentity !== initial.configurationIdentity ||
      canonicalJson(fresh.observation) !== canonicalJson(initial.observation) ||
      fresh.journalBytes !== initial.journalBytes || fresh.startingJournalSha256 !== initial.startingJournalSha256 ||
      canonicalJson(fresh.current.entries) !== canonicalJson(initial.current.entries) ||
      canonicalJson(fresh.current.projection) !== canonicalJson(initial.current.projection) ||
      canonicalJson(fresh.payloads) !== canonicalJson(initial.payloads) ||
      canonicalJson(fresh.manifest) !== canonicalJson(initial.manifest)) {
    throw new Error("Authorize Wheels Up inputs, manifest, repository, or mission journal changed after display.");
  }
}

async function prepareAuthorizeWheelsUp(
  root: string,
  config: ShieldConfig,
  missionId: string,
  intent: Readonly<WheelsUpIntent>,
  timestamp: { value: string; provenance: "hostTrusted" },
): Promise<PreparedAuthorizeWheelsUp> {
  const current = await currentProfileAwareMission(root, config, missionId);
  if (current.projection.authorization !== "waiting" || current.projection.execution !== "not-started" ||
      current.projection.implementationAuthorityState !== "waiting" || current.projection.implementationAuthority !== null ||
      current.projection.runtimeBindings.length !== 0 || current.projection.activeRuntimeBindings.length !== 0 ||
      current.projection.publicationAuthorizations.length !== 0 || current.projection.finalAcceptance !== "waiting") {
    throw new Error("Authorize Wheels Up requires a fresh pending schema-9 mission with no implementation, runtime-binding, or publication authority.");
  }
  const satisfied = new Set(current.projection.evidence.map(({ requirementId }) => requirementId));
  const requirements = current.projection.requirements.filter(({ evidenceKind, requiredRoleId, phase, requirementId }) =>
    evidenceKind === "mission_authorization" && requiredRoleId === "coulson" && phase === "authorization" && !satisfied.has(requirementId));
  if (requirements.length !== 1) throw new Error("Authorize Wheels Up requires exactly one pending Coulson mission authorization.");

  const identities = ["may", intent.reasoningRuntimeId, intent.modelId, intent.toolExecutorId];
  if (new Set(identities).size !== identities.length ||
      current.projection.brief.participants.some(({ seatId }) => identities.slice(1).includes(seatId))) {
    throw new Error("May seat, reasoning runtime, model, and tool executor must be mutually distinct and cannot be mission participants.");
  }

  const observation = await observePublicationRepository(root, config.repositoryId, intent.baseRevision, intent.publicationPaths, canonicalPublicationPathCompare);
  const pathKinds = publicationPathKinds(observation, canonicalPublicationPathCompare);
  if (observation.remoteRepositoryId !== config.repositoryId) throw new Error("Repository origin does not match configured repository identity.");
  if (observation.statusEntries.length !== 0) throw new Error("Authorize Wheels Up requires an exactly clean workspace.");
  if (canonicalJson(observation.changedPaths) !== canonicalJson(intent.publicationPaths)) {
    throw new Error("Initial draft publication paths must exactly equal the observed base-to-HEAD change set.");
  }

  const binding = coulsonBinding(current);
  const start = current.projection.lastSequence;
  const governancePayload = {
    schemaVersion: 1 as const,
    evidenceId: `evidence:coulson:${start + 1}`,
    requirementId: requirements[0].requirementId,
    missionId,
    revisionId: current.projection.brief.revisionId,
    seatId: "coulson" as const,
    evidenceKind: "mission_authorization" as const,
    decision: "approved" as const,
    humanPrincipalId: binding.humanPrincipalId,
    bindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `passcode-signer:${missionId}:authorize-wheels-up`,
    timestamp,
    journalSequence: start + 1,
  };
  const implementationAuthority = unwrap(validateImplementationAuthorityV1({
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: `authority:${missionId}:${start + 2}`,
    missionId,
    subjectId: current.projection.brief.subjectId,
    seatId: "may",
    missionRevisionId: current.projection.brief.revisionId,
    artifactRevisionId: observation.headRevision,
    repositoryId: config.repositoryId,
    canonicalWritableRoot: observation.canonicalRoot,
    branch: observation.branch,
    baseRevision: observation.baseRevision,
    headRevision: observation.headRevision,
    modelId: intent.modelId,
    approvedRelativePaths: intent.approvedRelativePaths,
    approvedActionIds: intent.approvedActionIds,
    approvedEffectClasses: intent.approvedEffectClasses,
    approvedEffectKeys: intent.approvedEffectKeys,
    approvedCapabilities: intent.approvedCapabilities,
    validationCommandIds: intent.validationCommandIds,
    journalSequence: start + 2,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `cli:authorize-wheels-up:${start + 2}`,
    evidenceRef: `evidence:authorize-wheels-up:${start + 2}`,
    timestamp,
  }));
  const authorizationId = `authorization:runtime-binding:${start + 3}`;
  const runtime: RuntimeBinding = {
    bindingSchemaVersion: 1,
    bindingId: `binding:${missionId}:may:1`,
    bindingVersion: 1,
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    seatId: "may",
    reasoningRuntimeId: intent.reasoningRuntimeId,
    toolExecutorId: intent.toolExecutorId,
    repositoryId: implementationAuthority.repositoryId,
    canonicalWritableRoot: implementationAuthority.canonicalWritableRoot,
    branch: implementationAuthority.branch,
    artifactRevisionId: implementationAuthority.artifactRevisionId,
    recordedAtSequence: start + 3,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: [...implementationAuthority.approvedActionIds],
      effectClasses: [...implementationAuthority.approvedEffectClasses],
      effectKeys: [...implementationAuthority.approvedEffectKeys],
      capabilities: [...implementationAuthority.approvedCapabilities],
    },
    coulsonAuthorizationRef: authorizationId,
  };
  const runtimeBinding = unwrap(validateSchema9RuntimeBindingV1({
    schemaVersion: 1,
    binding: runtime,
    implementationAuthorityRef: implementationAuthority.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(implementationAuthority),
    implementationAuthoritySequence: implementationAuthority.journalSequence,
    approvedRelativePaths: [...implementationAuthority.approvedRelativePaths],
    validationCommandIds: [...implementationAuthority.validationCommandIds],
    modelId: implementationAuthority.modelId,
    baseRevision: implementationAuthority.baseRevision,
    headRevision: implementationAuthority.headRevision,
  }));
  const runtimeAuthorizationPayload: Schema9RuntimeBindingAuthorizationPayload = unwrap(validateSchema9RuntimeBindingAuthorizationPayload({
    schemaVersion: 1,
    authorizationId,
    missionId,
    subjectId: current.projection.brief.subjectId,
    seatId: "may",
    bindingId: runtime.bindingId,
    bindingVersion: 1,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeRuntimeBindingDigest(runtime),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(runtimeBinding),
    artifactRevisionId: implementationAuthority.artifactRevisionId,
    decision: "approved",
    previousJournalSequence: start + 2,
    journalSequence: start + 3,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `cli:authorize-wheels-up:runtime-binding:${start + 3}`,
    timestamp,
  }));
  const publicationAuthority = {
    publicationScopeSchemaVersion: 1 as const,
    authorityRef: `authorization:${missionId}:review-publish:${start + 4}`,
    contractVersion: "review-publication.v1" as const,
    authorityKind: "wheels_up" as const,
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    repositoryId: config.repositoryId,
    canonicalRepositoryRoot: observation.canonicalRoot,
    branch: observation.branch,
    baseRevisionId: observation.baseRevision,
    headRevisionId: observation.headRevision,
    authorizedPaths: [...intent.publicationPaths],
    permittedEffects: [...INITIAL_DRAFT_EFFECTS],
  };
  const evaluation = evaluateReviewPublicationV1(publicationAuthority, {
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
    proposedChangedPaths: intent.publicationPaths,
    observedChangedPaths: observation.changedPaths,
    requestedEffects: [...INITIAL_DRAFT_EFFECTS],
    observedSymlinkPaths: pathKinds.symlinks,
    observedGitlinkPaths: pathKinds.gitlinks,
    workspaceClean: true,
  });
  if (evaluation.state === "blocked") throw new Error(`Initial draft publication authorization blocked: ${evaluation.reasonCode}.`);
  const publicationPayload = {
    schemaVersion: 1 as const,
    authorizationId: publicationAuthority.authorityRef,
    authorityDigest: computeReviewPublicationAuthorityDigest(publicationAuthority),
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    artifactRevisionId: observation.headRevision,
    authorityKind: "wheels_up" as const,
    previousJournalSequence: start + 3,
    journalSequence: start + 4,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `cli:authorize-wheels-up:publication:${start + 4}`,
    timestamp,
  };
  const payloads = canonicalSnapshot([governancePayload, implementationAuthority, runtimeAuthorizationPayload, publicationPayload]);
  const journalPaths = resolveSupervisedMissionPaths(root, config.paths.journals, missionId);
  if (journalPaths.state !== "valid") throw new Error(journalPaths.errors.join(" "));
  const journalText = await readFile(journalPaths.value.journalPath, "utf8");
  const journalBytes = journalText;
  const startingJournalSha256 = journalByteSha256(journalBytes);
  const manifestWithoutDigest = {
    schemaVersion: 1,
    schemaId: "shield.wheels-up-authorization-manifest.v1",
    missionId,
    subjectId: current.projection.brief.subjectId,
    missionRevisionId: current.projection.brief.revisionId,
    repository: {
      repositoryId: config.repositoryId,
      configuredJournalPath: config.paths.journals,
      canonicalRoot: observation.canonicalRoot,
      gitTopLevel: observation.gitTopLevel,
      originUrl: observation.originUrl,
      remoteRepositoryId: observation.remoteRepositoryId,
      branch: observation.branch,
      baseRevision: observation.baseRevision,
      headRevision: observation.headRevision,
      baseAncestor: observation.baseAncestor,
      workspaceClean: true,
      changedPaths: observation.changedPaths,
      symlinkPaths: pathKinds.symlinks,
      gitlinkPaths: pathKinds.gitlinks,
    },
    journal: { startingSequence: start, endingSequence: start + 4, startingJournalSha256 },
    humanBinding: {
      seatId: binding.seatId,
      bindingId: binding.bindingId,
      humanPrincipalId: binding.humanPrincipalId,
      signingKeyRef: binding.signingKeyRef,
      missionScope: binding.missionScope,
      validFromSequence: binding.validFromSequence,
      validThroughSequence: binding.validThroughSequence,
    },
    implementationAuthority,
    runtimeBinding,
    publicationAuthority,
    constituentPayloads: [
      { eventType: "governance.decided", payload: payloads[0] },
      { eventType: "implementation.authorized", payload: payloads[1] },
      { eventType: "runtime.binding_recorded", payload: payloads[2] },
      { eventType: "review.publication_authorized", payload: payloads[3] },
    ],
    exclusions: [...ONE_PASSCODE_EXCLUSIONS],
    remainingHumanGates: remainingOnePasscodeHumanGates(current),
  };
  const manifest = canonicalSnapshot({ ...manifestWithoutDigest, manifestDigest: canonicalDigest(manifestWithoutDigest) });
  return {
    configurationIdentity: canonicalJson(config),
    current,
    observation,
    journalBytes,
    startingJournalSha256,
    binding,
    implementationAuthority,
    runtimeBinding,
    publicationAuthority,
    payloads,
    manifest,
  };
}

export interface AuthorizeWheelsUpV1RenderInput {
  kind: "manifest" | "receipt";
  manifest?: Readonly<Record<string, unknown>>;
  receipt?: Readonly<Record<string, unknown>>;
  humanMode: boolean;
}

export interface AuthorizeWheelsUpV1Dependencies {
  renderDecision: (input: AuthorizeWheelsUpV1RenderInput) => string;
  readPasscode: (promptOutput: { write: (output: string) => void }) => Promise<string>;
  signBatch: (
    binding: TrustedHumanBinding,
    passcode: string,
    payloads: readonly unknown[],
  ) => Promise<readonly string[]>;
  appendBatchAtomic: (input: {
    repositoryRoot: string;
    configuredJournalPath: string;
    missionId: string;
    entries: readonly ProfileAwareMissionEntryV1[];
    expectedStartingJournalSha256: string;
  }) => Promise<ContractResult<ProfileAwareBatchReceipt>>;
}

export interface ExecuteAuthorizeWheelsUpV1Input {
  root: string;
  config: ShieldConfig;
  missionId: string;
  intent: Readonly<WheelsUpIntent>;
  timestamp: { value: string; provenance: "hostTrusted" };
  humanMode: boolean;
  promptOutput: { write: (output: string) => void };
  dependencies?: Partial<AuthorizeWheelsUpV1Dependencies>;
}

function defaultRenderDecision(input: AuthorizeWheelsUpV1RenderInput): string {
  if (input.kind === "manifest") {
    if (input.humanMode) return renderAuthorizeWheelsUpHumanV1(input.manifest as Parameters<typeof renderAuthorizeWheelsUpHumanV1>[0]);
    return `SHIELD_WHEELS_UP_MANIFEST_BEGIN\n${canonicalJson(input.manifest)}\nSHIELD_WHEELS_UP_MANIFEST_END`;
  }
  if (input.humanMode) {
    return renderAuthorizeWheelsUpReceiptHumanV1(input.receipt as Parameters<typeof renderAuthorizeWheelsUpReceiptHumanV1>[0]);
  }
  return `Authorize Wheels Up completed.\n${JSON.stringify(input.receipt, null, 2)}`;
}

export async function executeAuthorizeWheelsUpV1(input: ExecuteAuthorizeWheelsUpV1Input): Promise<number> {
  const {
    root,
    config,
    missionId,
    intent,
    timestamp,
    humanMode,
    promptOutput,
    dependencies,
  } = input;
  const dependencyOverrides = dependencies ?? {};
  const renderDecision = dependencyOverrides.renderDecision ?? defaultRenderDecision;
  const readPasscode = dependencyOverrides.readPasscode;
  if (readPasscode === undefined) {
    throw new Error("Missing passcode reader dependency.");
  }
  const signBatch = dependencyOverrides.signBatch;
  if (signBatch === undefined) {
    throw new Error("Missing batch signer dependency.");
  }
  const appendBatchAtomic = dependencyOverrides.appendBatchAtomic;
  if (appendBatchAtomic === undefined) {
    throw new Error("Missing atomic append dependency.");
  }

  const prepared = await prepareAuthorizeWheelsUp(root, config, missionId, intent, timestamp);
  const manifestText = renderDecision({ kind: "manifest", manifest: prepared.manifest, humanMode });
  (humanMode ? process.stdout : process.stderr).write(`${manifestText}\n`);

  const passcode = await readPasscode(promptOutput);
  let signatures: readonly string[];
  try {
    signatures = await signBatch(prepared.binding, passcode, prepared.payloads);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Coulson batch signing failed.");
  }
  if (signatures.length !== 4) {
    throw new Error("Coulson batch signer did not return exactly four signatures.");
  }
  const publicKey = createPublicKey({
    key: Buffer.from(prepared.binding.publicKeySpkiBase64, "base64"),
    format: "der",
    type: "spki",
  });
  for (let index = 0; index < prepared.payloads.length; index += 1) {
    if (!verify(null, Buffer.from(canonicalJson(prepared.payloads[index])), publicKey, Buffer.from(signatures[index], "base64"))) {
      throw new Error(`Independent signature verification failed for constituent ${index + 1}.`);
    }
  }

  const afterSigningConfig = await repositoryConfig(root);
  const afterSigning = await prepareAuthorizeWheelsUp(root, afterSigningConfig, missionId, intent, timestamp);
  assertPreparedAuthorizeWheelsUpFresh(prepared, afterSigning);

  const trustedBindings = profileAwareBindings(prepared.current);
  const stagedEntries: ProfileAwareMissionEntryV1[] = [...prepared.current.entries];
  let stagedProjection = prepared.current.projection;

  const governanceEvidence: SignedProfileEvidenceV1 = {
    payload: prepared.payloads[0] as SignedProfileEvidenceV1["payload"],
    signatureBase64: signatures[0],
  };
  const governanceEntry = produce(() => createProfileAwareGovernanceDecisionEntryV1({
    projection: stagedProjection,
    trustedBindings,
    evidence: governanceEvidence,
  })) as GovernanceDecisionEntry;
  stagedEntries.push(governanceEntry);
  stagedProjection = unwrap(replayProfileAwareMissionJournal(stagedEntries));
  if (canonicalJson(governanceEntry.payload.evidence.payload) !== canonicalJson(prepared.payloads[0])) {
    throw new Error("Governance constructor expanded the frozen payload.");
  }

  const implementationEntry = produce(() => createProfileAwareImplementationAuthorityEntryV1({
    projection: stagedProjection,
    trustedBindings,
    authority: { payload: prepared.payloads[1] as ImplementationAuthorityV1, signatureBase64: signatures[1] },
  })) as ImplementationAuthorityEntry;
  stagedEntries.push(implementationEntry);
  stagedProjection = unwrap(replayProfileAwareMissionJournal(stagedEntries));
  if (canonicalJson(implementationEntry.payload.authority.payload) !== canonicalJson(prepared.payloads[1])) {
    throw new Error("Implementation constructor expanded the frozen payload.");
  }

  const runtimeEntry = produce(() => createProfileAwareRuntimeBindingRecordedEntryV1({
    projection: stagedProjection,
    trustedBindings,
    binding: prepared.runtimeBinding,
    authorization: { payload: prepared.payloads[2] as Schema9RuntimeBindingAuthorizationPayload, signatureBase64: signatures[2] },
  })) as RuntimeBindingRecordedEntry;
  stagedEntries.push(runtimeEntry);
  stagedProjection = unwrap(replayProfileAwareMissionJournal(stagedEntries));
  if (canonicalJson(runtimeEntry.payload.authorization.payload) !== canonicalJson(prepared.payloads[2])) {
    throw new Error("Runtime-binding constructor expanded the frozen payload.");
  }

  const publicationEntry = produce(() => createProfileAwareReviewPublicationAuthorizationEntryV1({
    projection: stagedProjection,
    trustedBindings,
    authority: prepared.publicationAuthority as Parameters<typeof createProfileAwareReviewPublicationAuthorizationEntryV1>[0]["authority"],
    authorization: { payload: prepared.payloads[3] as Parameters<typeof createProfileAwareReviewPublicationAuthorizationEntryV1>[0]["authorization"]["payload"], signatureBase64: signatures[3] },
  })) as ReviewPublicationAuthorizationEntry;
  stagedEntries.push(publicationEntry);
  stagedProjection = unwrap(replayProfileAwareMissionJournal(stagedEntries));
  if (canonicalJson(publicationEntry.payload.authorization.payload) !== canonicalJson(prepared.payloads[3])) {
    throw new Error("Publication constructor expanded the frozen payload.");
  }

  const batchEntries = [governanceEntry, implementationEntry, runtimeEntry, publicationEntry];
  if (canonicalJson(batchEntries.map(({ type, sequence }) => ({ type, sequence }))) !== canonicalJson([
    { type: "governance.decided", sequence: prepared.current.projection.lastSequence + 1 },
    { type: "implementation.authorized", sequence: prepared.current.projection.lastSequence + 2 },
    { type: "runtime.binding_recorded", sequence: prepared.current.projection.lastSequence + 3 },
    { type: "review.publication_authorized", sequence: prepared.current.projection.lastSequence + 4 },
  ])) {
    throw new Error("Constructed batch is not the frozen four-entry transition.");
  }

  const beforeStoreConfig = await repositoryConfig(root);
  const beforeStore = await prepareAuthorizeWheelsUp(root, beforeStoreConfig, missionId, intent, timestamp);
  assertPreparedAuthorizeWheelsUpFresh(prepared, beforeStore);

  const stored = unwrap(await appendBatchAtomic({
    ...missionPaths(root, beforeStoreConfig, missionId),
    entries: batchEntries,
    expectedStartingJournalSha256: prepared.startingJournalSha256,
  }));

  if (canonicalJson(stored.projection) !== canonicalJson(stagedProjection)) {
    throw new Error("Durable batch projection differs from staged replay.");
  }

  const receipt = {
    schemaVersion: 1,
    schemaId: "shield.wheels-up-authorization-receipt.v1",
    missionId,
    subjectId: prepared.current.projection.brief.subjectId,
    missionRevisionId: prepared.current.projection.brief.revisionId,
    repositoryId: config.repositoryId,
    canonicalRoot: prepared.observation.canonicalRoot,
    branch: prepared.observation.branch,
    baseRevision: prepared.observation.baseRevision,
    headRevision: prepared.observation.headRevision,
    startingJournalSequence: stored.startingSequence,
    endingJournalSequence: stored.endingSequence,
    manifestDigest: prepared.manifest.manifestDigest as string,
    finalJournalSha256: stored.finalJournalSha256,
    constituents: [
      {
        eventType: governanceEntry.type,
        entryId: governanceEntry.entryId,
        sequence: governanceEntry.sequence,
        constituentId: governanceEntry.payload.evidence.payload.evidenceId,
        signedEnvelopeSha256: canonicalDigest(governanceEntry.payload.evidence),
      },
      {
        eventType: implementationEntry.type,
        entryId: implementationEntry.entryId,
        sequence: implementationEntry.sequence,
        constituentId: implementationEntry.payload.authority.payload.authorityRef,
        signedEnvelopeSha256: canonicalDigest(implementationEntry.payload.authority),
      },
      {
        eventType: runtimeEntry.type,
        entryId: runtimeEntry.entryId,
        sequence: runtimeEntry.sequence,
        constituentId: runtimeEntry.payload.authorization.payload.authorizationId,
        signedEnvelopeSha256: canonicalDigest(runtimeEntry.payload.authorization),
      },
      {
        eventType: publicationEntry.type,
        entryId: publicationEntry.entryId,
        sequence: publicationEntry.sequence,
        constituentId: publicationEntry.payload.authorization.payload.authorizationId,
        signedEnvelopeSha256: canonicalDigest(publicationEntry.payload.authorization),
      },
    ],
    may: {
      modelId: intent.modelId,
      reasoningRuntimeId: intent.reasoningRuntimeId,
      toolExecutorId: intent.toolExecutorId,
    },
    implementationScope: {
      approvedRelativePaths: intent.approvedRelativePaths,
      approvedActionIds: intent.approvedActionIds,
      approvedEffectClasses: intent.approvedEffectClasses,
      approvedEffectKeys: intent.approvedEffectKeys,
      approvedCapabilities: intent.approvedCapabilities,
      validationCommandIds: intent.validationCommandIds,
    },
    publicationScope: { authorizedPaths: intent.publicationPaths, permittedEffects: [...INITIAL_DRAFT_EFFECTS] },
    exclusions: [...ONE_PASSCODE_EXCLUSIONS],
    remainingHumanGates: remainingOnePasscodeHumanGates(prepared.current),
  };
  const finalReceipt = canonicalSnapshot({ ...receipt, receiptDigest: canonicalDigest(receipt) });
  const receiptText = renderDecision({ kind: "receipt", receipt: finalReceipt, humanMode });
  process.stdout.write(`${receiptText}\n`);

  return 0;
}
