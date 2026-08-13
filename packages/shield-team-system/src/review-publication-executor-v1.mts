import { constants } from "node:fs";
import { execFile as execFileNode } from "node:child_process";
import { lstat, open, realpath as fsRealpath } from "node:fs/promises";
import { join } from "node:path";
import { types } from "node:util";

import { parseShieldConfig, type ShieldConfig } from "./config.mjs";
import { canonicalJson, type ContractResult, type TrustedHumanBinding } from "./mission-v2.mjs";
import {
  appendProfileAwareMissionEntriesAtomicV1,
  journalByteSha256,
  resolveSupervisedMissionPaths,
} from "./mission-store.mjs";
import {
  createProfileAwareReviewPublicationAuthorizationEntryV1,
  replayProfileAwareMissionJournal,
  type ProfileAwareMissionEntryV1,
  type ProfileAwareProjectionV1,
} from "./profile-aware-mission-v1.mjs";
import {
  computeReviewPublicationAuthorityDigest,
  evaluateReviewPublicationV1,
  type ReviewPublicationAuthorityV1,
  type ReviewPublicationEffect,
} from "./review-publication-v1.mjs";
import {
  resolvePreparedMissionTransitionV1,
  type PreparedPublicationReadyResultV1,
} from "./mission-preparation-host-v1.mjs";
import {
  assertMissionSignerSnapshotUnchanged,
  captureMissionSignerSnapshot,
} from "./mission-signer.mjs";

export type ReviewPublicationAuthorizationIntentV1 = Readonly<{
  baseRevision: string;
  authorizedPaths: readonly string[];
  permittedEffects: readonly ReviewPublicationEffect[];
}>;

export type PublicationTreeEntryV1 = Readonly<{ mode: string; type: string; path: string }>;

export type PublicationRepositoryObservationV1 = Readonly<{
  configuredRepositoryId: string;
  originUrl: string;
  remoteRepositoryId: string;
  canonicalRoot: string;
  gitTopLevel: string;
  branch: string;
  baseRevision: string;
  headRevision: string;
  baseAncestor: true;
  statusEntries: readonly string[];
  changedPaths: readonly string[];
  baseTreeEntries: readonly PublicationTreeEntryV1[];
  headTreeEntries: readonly PublicationTreeEntryV1[];
}>;

export type PreparedReviewPublicationDecisionV1 = Readonly<{
  schemaVersion: 1;
  schemaId: "shield.prepared-review-publication-decision.v1";
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  repository: Readonly<{
    repositoryId: string;
    canonicalRoot: string;
    branch: string;
    baseRevision: string;
    headRevision: string;
  }>;
  authorizedPaths: readonly string[];
  permittedEffects: readonly ReviewPublicationEffect[];
  exclusions: readonly string[];
  remainingHumanGates: readonly string[];
}>;

export type ReviewPublicationAuthorizationExecutorInputV1 = Readonly<{
  mode: "legacy" | "prepared";
  root: string;
  missionId: string;
  intent: ReviewPublicationAuthorizationIntentV1;
  expectedPreparation?: PreparedPublicationReadyResultV1;
  timestamp: Readonly<{ value: string; provenance: "hostTrusted" }>;
  humanMode: boolean;
  decisionOutput: { write: (value: string) => void };
}>;

export type ReviewPublicationAuthorizationExecutorResultV1 = Readonly<{
  projection: ProfileAwareProjectionV1;
  authorizationId: string;
  authorityDigest: string;
  journalSequence: number;
  finalJournalSha256: string;
}>;

export type ReviewPublicationAuthorizationExecutorDependenciesV1 = Readonly<{
  renderDecision: (decision: PreparedReviewPublicationDecisionV1, humanMode: boolean) => string;
  readPasscode: () => Promise<string>;
  signPayload: (binding: TrustedHumanBinding, passcode: string, payload: unknown) => Promise<string>;
  appendEntryAtomic: typeof appendProfileAwareMissionEntriesAtomicV1;
}>;

type ProfileAwareJournal = Readonly<{
  kind: "profile-aware";
  entries: readonly ProfileAwareMissionEntryV1[];
  projection: ProfileAwareProjectionV1;
}>;
type ConfigurationSnapshot = Readonly<{ config: ShieldConfig; bytes: string; identity: string }>;
type JournalSnapshot = Readonly<{ current: ProfileAwareJournal; bytes: string; sha256: string }>;
type StringComparator = (left: string, right: string) => number;

const CONFIG_PATH = join(".shield", "config.json");
const PREPARED_EXCLUSIONS = Object.freeze([
  "review.comment.publish",
  "review.pull_request.update_draft",
  "review.pull_request.mark_ready",
  "merge",
  "deployment",
  "release",
  "final_acceptance",
] as const);

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
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

function unwrap<T>(result: ContractResult<T>): T {
  if (result.state === "invalid") throw new Error(`${result.code}: ${result.errors.join(" ")}`);
  return result.value;
}

export function validateReviewPublicationAuthorizationIntentV1(value: unknown): ReviewPublicationAuthorizationIntentV1 {
  if (!plain(value)) throw new Error("Publication authorization input is not a closed object.");
  const fields = ["baseRevision", "authorizedPaths", "permittedEffects"] as const;
  const keys = Reflect.ownKeys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key as typeof fields[number])) ||
      fields.some((field) => {
        const descriptor = descriptors[field];
        return !descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable;
      })) {
    throw new Error(`Publication authorization input must contain exactly: ${fields.join(", ")}.`);
  }
  const baseRevision = descriptors.baseRevision.value;
  const authorizedPaths = descriptors.authorizedPaths.value;
  const permittedEffects = descriptors.permittedEffects.value;
  if (typeof baseRevision !== "string" || baseRevision.length === 0 || baseRevision.trim() !== baseRevision ||
      !Array.isArray(authorizedPaths) || authorizedPaths.some((path) => typeof path !== "string") ||
      !Array.isArray(permittedEffects) || permittedEffects.some((effect) => typeof effect !== "string")) {
    throw new Error("Publication authorization input fields are malformed.");
  }
  return canonicalSnapshot({ baseRevision, authorizedPaths, permittedEffects }) as ReviewPublicationAuthorizationIntentV1;
}

function canonicalPublicationPathCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
  if (!value.endsWith("\0")) throw new Error(`${label} was not NUL-terminated.`);
  return value.slice(0, -1).split("\0");
}

function treeEntries(value: string, label: string): PublicationTreeEntryV1[] {
  return nulRecords(value, label).map((record) => {
    const match = /^(?<mode>[0-9]{6}) (?<type>[a-z]+) [0-9a-f]+\t(?<path>[\s\S]+)$/u.exec(record);
    if (!match?.groups) throw new Error(`${label} contains malformed tree evidence.`);
    return { mode: match.groups.mode, type: match.groups.type, path: match.groups.path };
  });
}

function exactTreeEntries(value: string, label: string, authorizedPaths: readonly string[]): PublicationTreeEntryV1[] {
  const entries = treeEntries(value, label);
  const authorized = new Set(authorizedPaths);
  const observed = new Set<string>();
  for (const entry of entries) {
    if (!authorized.has(entry.path) || observed.has(entry.path)) throw new Error(`${label} contains an unexpected or duplicate path.`);
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
  if (!match?.groups?.repository) throw new Error("Repository origin URL is unsupported or malformed.");
  return match.groups.repository;
}

export async function observePublicationRepositoryV1(
  root: string,
  configuredRepositoryId: string,
  baseRevisionInput: string,
  authorizedPaths: readonly string[],
  pathComparator: StringComparator = canonicalPublicationPathCompare,
): Promise<PublicationRepositoryObservationV1> {
  if (baseRevisionInput.trim() !== baseRevisionInput || baseRevisionInput.length === 0) throw new Error("Publication baseRevision is malformed.");
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
  if (canonicalRoot !== gitTopLevel || branch.length === 0 || branch === "HEAD" || baseRevision.length === 0 || headRevision.length === 0) {
    throw new Error("Repository identity is not a real attached top-level checkout.");
  }
  return canonicalSnapshot({
    configuredRepositoryId,
    originUrl,
    remoteRepositoryId,
    canonicalRoot,
    gitTopLevel,
    branch,
    baseRevision,
    headRevision,
    baseAncestor: true as const,
    statusEntries: nulRecords(status, "Repository status"),
    changedPaths: nulRecords(changed, "Repository change set").sort(pathComparator),
    baseTreeEntries: exactTreeEntries(baseTree, "Base tree", authorizedPaths),
    headTreeEntries: exactTreeEntries(headTree, "HEAD tree", authorizedPaths),
  });
}

function publicationPathKinds(observation: PublicationRepositoryObservationV1) {
  const all = [...observation.baseTreeEntries, ...observation.headTreeEntries];
  return {
    symlinks: [...new Set(all.filter(({ mode }) => mode === "120000").map(({ path }) => path))].sort(canonicalPublicationPathCompare),
    gitlinks: [...new Set(all.filter(({ mode, type }) => mode === "160000" || type === "commit").map(({ path }) => path))]
      .sort(canonicalPublicationPathCompare),
  };
}

export function assertPublicationAuthorizationFreshnessV1(input: {
  initialConfigurationIdentity: string;
  freshConfigurationIdentity: string;
  initialObservation: PublicationRepositoryObservationV1;
  freshObservation: PublicationRepositoryObservationV1;
  initialJournalSequence: number;
  freshJournalSequence: number;
}): void {
  if (input.freshConfigurationIdentity !== input.initialConfigurationIdentity ||
      canonicalJson(input.freshObservation) !== canonicalJson(input.initialObservation) ||
      input.freshJournalSequence !== input.initialJournalSequence) {
    throw new Error("Mission journal, repository configuration, or publication observation changed while authorization was being signed.");
  }
}

async function configurationSnapshot(root: string): Promise<ConfigurationSnapshot> {
  const path = join(root, CONFIG_PATH);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    const pathBefore = await lstat(path);
    if (!before.isFile() || pathBefore.isSymbolicLink() || !pathBefore.isFile() ||
        before.dev !== pathBefore.dev || before.ino !== pathBefore.ino) throw new Error("SHIELD configuration identity is invalid.");
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathAfter = await lstat(path);
    if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode ||
        before.dev !== pathAfter.dev || before.ino !== pathAfter.ino || pathAfter.isSymbolicLink() || !pathAfter.isFile()) {
      throw new Error("SHIELD configuration identity changed during snapshot.");
    }
    const parsed = parseShieldConfig(bytes);
    if (parsed.state === "invalid") throw new Error(parsed.issues.map(({ message }) => message).join(" "));
    return canonicalSnapshot({ config: parsed.value, bytes, identity: `${String(before.dev)}:${String(before.ino)}:${String(before.mode)}` });
  } finally {
    await handle.close();
  }
}

async function journalSnapshot(root: string, config: ShieldConfig, missionId: string): Promise<JournalSnapshot> {
  const paths = unwrap(resolveSupervisedMissionPaths(root, config.paths.journals, missionId));
  const handle = await open(paths.journalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    const pathBefore = await lstat(paths.journalPath);
    if (!before.isFile() || pathBefore.isSymbolicLink() || !pathBefore.isFile() ||
        before.dev !== pathBefore.dev || before.ino !== pathBefore.ino) throw new Error("Mission journal identity is invalid.");
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathAfter = await lstat(paths.journalPath);
    if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode ||
        before.dev !== pathAfter.dev || before.ino !== pathAfter.ino || pathAfter.isSymbolicLink() || !pathAfter.isFile()) {
      throw new Error("Mission journal identity changed during snapshot.");
    }
    if (bytes.length === 0 || !bytes.endsWith("\n")) throw new Error("Profile-aware mission journal is empty or lacks a final newline.");
    let entries: unknown[];
    try {
      entries = bytes.slice(0, -1).split("\n").map((line) => JSON.parse(line) as unknown);
    } catch {
      throw new Error("Profile-aware mission journal contains malformed JSON lines.");
    }
    if (entries.some((entry) => !plain(entry) || entry.schemaVersion !== 9)) {
      throw new Error("Command requires a schema-9 profile-aware mission journal.");
    }
    const replay = replayProfileAwareMissionJournal(entries);
    if (replay.state === "invalid") throw new Error(`${replay.code}: ${replay.errors.join(" ")}`);
    if (replay.value.missionId !== missionId) throw new Error("Journal missionId does not match the requested mission.");
    const current: ProfileAwareJournal = {
      kind: "profile-aware",
      entries: entries as ProfileAwareMissionEntryV1[],
      projection: replay.value,
    };
    return canonicalSnapshot({ current, bytes, sha256: journalByteSha256(bytes) });
  } finally {
    await handle.close();
  }
}

function profileAwareBindings(current: ProfileAwareJournal): TrustedHumanBinding[] {
  const begun = current.entries[0];
  if (!begun || begun.type !== "mission.begun") throw new Error("Profile-aware journal has no trusted begin entry.");
  return begun.payload.trustedBindings.map((binding) => ({ ...binding }));
}

function coulsonBinding(current: ProfileAwareJournal): TrustedHumanBinding {
  const matches = profileAwareBindings(current).filter(({ seatId }) => seatId === "coulson");
  if (matches.length !== 1) throw new Error("Profile-aware journal requires exactly one frozen Coulson binding.");
  return matches[0];
}

function assertPreparedResult(value: unknown, expected: PreparedPublicationReadyResultV1): PreparedPublicationReadyResultV1 {
  if (!plain(value) || value.state !== "publication_ready" || canonicalJson(value) !== canonicalJson(expected)) {
    throw new Error("Prepared publication graph or live observation no longer matches the selected transition.");
  }
  return value as unknown as PreparedPublicationReadyResultV1;
}

async function revalidatePrepared(expected: PreparedPublicationReadyResultV1): Promise<PreparedPublicationReadyResultV1> {
  const result = await resolvePreparedMissionTransitionV1({
    missionId: expected.missionId,
    repositoryRoot: expected.observation.canonicalRoot,
  });
  return assertPreparedResult(result, expected);
}

function exactConfigurationUnchanged(initial: ConfigurationSnapshot, fresh: ConfigurationSnapshot): boolean {
  return initial.bytes === fresh.bytes && initial.identity === fresh.identity && canonicalJson(initial.config) === canonicalJson(fresh.config);
}

function exactJournalUnchanged(initial: JournalSnapshot, fresh: JournalSnapshot): boolean {
  return initial.bytes === fresh.bytes && initial.sha256 === fresh.sha256 && canonicalJson(initial.current) === canonicalJson(fresh.current);
}

function preparedDecision(
  preparation: PreparedPublicationReadyResultV1,
  projection: ProfileAwareProjectionV1,
  observation: PublicationRepositoryObservationV1,
): PreparedReviewPublicationDecisionV1 {
  return canonicalSnapshot({
    schemaVersion: 1 as const,
    schemaId: "shield.prepared-review-publication-decision.v1" as const,
    missionId: preparation.missionId,
    subjectId: projection.brief.subjectId,
    missionRevisionId: projection.brief.revisionId,
    repository: {
      repositoryId: observation.configuredRepositoryId,
      canonicalRoot: observation.canonicalRoot,
      branch: observation.branch,
      baseRevision: observation.baseRevision,
      headRevision: observation.headRevision,
    },
    authorizedPaths: [...preparation.publicationIntent.authorizedPaths],
    permittedEffects: [...preparation.publicationIntent.permittedEffects],
    exclusions: [...PREPARED_EXCLUSIONS],
    remainingHumanGates: [...preparation.observation.remainingHumanGates],
  });
}

export async function executeReviewPublicationAuthorizationV1(
  input: ReviewPublicationAuthorizationExecutorInputV1,
  dependencies: ReviewPublicationAuthorizationExecutorDependenciesV1,
): Promise<ReviewPublicationAuthorizationExecutorResultV1> {
  const intent = validateReviewPublicationAuthorizationIntentV1(input.intent);
  if (input.mode === "legacy" && input.expectedPreparation !== undefined) throw new Error("Legacy publication cannot include prepared evidence.");
  if (input.mode === "prepared" && input.expectedPreparation === undefined) throw new Error("Prepared publication requires exact selected evidence.");
  if (input.mode === "prepared" && (input.expectedPreparation?.missionId !== input.missionId ||
      canonicalJson(input.expectedPreparation.publicationIntent) !== canonicalJson(intent))) {
    throw new Error("Prepared publication intent does not match the selected transition.");
  }

  const initialConfig = await configurationSnapshot(input.root);
  const initialJournal = await journalSnapshot(input.root, initialConfig.config, input.missionId);
  if (input.mode === "prepared" && input.expectedPreparation?.observation.canonicalRoot !== await fsRealpath(input.root)) {
    throw new Error("Prepared publication repository root does not match the selected transition.");
  }
  const preparation = input.mode === "prepared" ? await revalidatePrepared(input.expectedPreparation as PreparedPublicationReadyResultV1) : null;
  const observation = await observePublicationRepositoryV1(
    input.root,
    initialConfig.config.repositoryId,
    intent.baseRevision,
    intent.authorizedPaths,
  );
  const pathKinds = publicationPathKinds(observation);
  const projection = initialJournal.current.projection;
  const sequence = projection.lastSequence + 1;
  const authorizationId = `authorization:${input.missionId}:review-publish:${sequence}`;
  const authority: ReviewPublicationAuthorityV1 = {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    authorityKind: "review.publish",
    authorityRef: authorizationId,
    missionId: input.missionId,
    subjectId: projection.brief.subjectId,
    missionRevisionId: projection.brief.revisionId,
    repositoryId: initialConfig.config.repositoryId,
    canonicalRepositoryRoot: observation.canonicalRoot,
    branch: observation.branch,
    baseRevisionId: observation.baseRevision,
    headRevisionId: observation.headRevision,
    authorizedPaths: [...intent.authorizedPaths],
    permittedEffects: [...intent.permittedEffects],
  };
  const evaluation = evaluateReviewPublicationV1(authority, {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    missionId: input.missionId,
    subjectId: projection.brief.subjectId,
    missionRevisionId: projection.brief.revisionId,
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
  if (evaluation.state === "blocked") throw new Error(`Publication authorization blocked: ${evaluation.reasonCode}.`);

  const binding = coulsonBinding(initialJournal.current);
  const signerSnapshot = await captureMissionSignerSnapshot(binding.signingKeyRef);
  const authorityDigest = computeReviewPublicationAuthorityDigest(authority);
  const payload = {
    schemaVersion: 1 as const,
    authorizationId,
    authorityDigest,
    missionId: input.missionId,
    subjectId: projection.brief.subjectId,
    missionRevisionId: projection.brief.revisionId,
    artifactRevisionId: observation.headRevision,
    authorityKind: "review.publish" as const,
    previousJournalSequence: projection.lastSequence,
    journalSequence: sequence,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: input.mode === "legacy"
      ? `cli:publication-authorize:${sequence}`
      : `cli:prepare-next:publication-authorize:${sequence}`,
    timestamp: input.timestamp,
  };

  if (preparation !== null) {
    const rendered = dependencies.renderDecision(preparedDecision(preparation, projection, observation), input.humanMode);
    input.decisionOutput.write(`${rendered}\n`);
  }
  const passcode = await dependencies.readPasscode();
  const signatureBase64 = await dependencies.signPayload(binding, passcode, payload);

  const freshConfig = await configurationSnapshot(input.root);
  const freshJournal = await journalSnapshot(input.root, freshConfig.config, input.missionId);
  const freshObservation = await observePublicationRepositoryV1(
    input.root,
    freshConfig.config.repositoryId,
    intent.baseRevision,
    intent.authorizedPaths,
  );
  const freshSignerSnapshot = await captureMissionSignerSnapshot(binding.signingKeyRef);
  if (input.mode === "prepared") await revalidatePrepared(input.expectedPreparation as PreparedPublicationReadyResultV1);

  const configurationFresh = input.mode === "prepared"
    ? exactConfigurationUnchanged(initialConfig, freshConfig)
    : canonicalJson(initialConfig.config) === canonicalJson(freshConfig.config);
  if (!configurationFresh || !exactJournalUnchanged(initialJournal, freshJournal) ||
      canonicalJson(observation) !== canonicalJson(freshObservation)) {
    throw new Error("Mission journal, repository configuration, or publication observation changed while authorization was being signed.");
  }
  assertMissionSignerSnapshotUnchanged(signerSnapshot, freshSignerSnapshot);
  const freshBinding = coulsonBinding(freshJournal.current);
  if (canonicalJson(binding) !== canonicalJson(freshBinding)) throw new Error("Coulson signer binding changed while authorization was being signed.");

  const entry = createProfileAwareReviewPublicationAuthorizationEntryV1({
    projection: freshJournal.current.projection,
    trustedBindings: profileAwareBindings(freshJournal.current),
    authority,
    authorization: { payload, signatureBase64 },
  });
  const appended = unwrap(await dependencies.appendEntryAtomic({
    repositoryRoot: input.root,
    configuredJournalPath: freshConfig.config.paths.journals,
    missionId: input.missionId,
    entries: [entry],
    expectedStartingJournalSha256: initialJournal.sha256,
  }));
  return canonicalSnapshot({
    projection: appended.projection,
    authorizationId,
    authorityDigest,
    journalSequence: sequence,
    finalJournalSha256: appended.finalJournalSha256,
  });
}
