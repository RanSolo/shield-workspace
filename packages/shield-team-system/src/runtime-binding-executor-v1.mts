import { constants } from "node:fs";
import { execFile as execFileNode } from "node:child_process";
import { lstat, open, realpath as fsRealpath } from "node:fs/promises";
import { join } from "node:path";

import { parseShieldConfig, type ShieldConfig } from "./config.mjs";
import { canonicalJson, type ContractResult, type TrustedHumanBinding } from "./mission-v2.mjs";
import {
  appendProfileAwareMissionEntriesAtomicV1,
  appendProfileAwareMissionEntryV1,
  journalByteSha256,
  resolveSupervisedMissionPaths,
} from "./mission-store.mjs";
import {
  createProfileAwareRuntimeBindingRecordedEntryV1,
  replayProfileAwareMissionJournal,
  type ProfileAwareMissionEntryV1,
  type ProfileAwareProjectionV1,
} from "./profile-aware-mission-v1.mjs";
import {
  computeImplementationAuthorityDigest,
  computeRuntimeBindingDigest,
  computeSchema9RuntimeBindingDigest,
  validateSchema9RuntimeBindingAuthorizationPayload,
  validateSchema9RuntimeBindingV1,
  type Schema9RuntimeBindingAuthorizationPayload,
  type Schema9RuntimeBindingV1,
} from "./implementation-authority-v1.mjs";
import {
  resolvePreparedMissionTransitionV1,
  type PreparedRuntimeBindingReadyResultV1,
} from "./mission-preparation-host-v1.mjs";
import {
  assertMissionSignerSnapshotUnchanged,
  captureMissionSignerSnapshot,
} from "./mission-signer.mjs";
import type { RuntimeBinding } from "./permission-v1.mjs";

export type RuntimeBindingIntentV1 = Readonly<{ reasoningRuntimeId: string; toolExecutorId: string }>;

export type PreparedRuntimeBindingDecisionV1 = Readonly<{
  schemaVersion: 1;
  schemaId: "shield.prepared-runtime-binding-decision.v1";
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  seatId: "may";
  implementationAuthorityRef: string;
  repository: Readonly<{ repositoryId: string; canonicalRoot: string; branch: string; baseRevision: string; headRevision: string }>;
  modelId: string;
  reasoningRuntimeId: string;
  toolExecutorId: string;
  approvedRelativePaths: readonly string[];
  approvedActionIds: readonly string[];
  approvedEffectClasses: readonly string[];
  approvedEffectKeys: readonly string[];
  approvedCapabilities: readonly string[];
  validationCommandIds: readonly string[];
  exclusions: readonly string[];
  remainingHumanGates: readonly string[];
}>;

export type RuntimeBindingExecutorInputV1 = Readonly<{
  mode: "legacy" | "prepared";
  root: string;
  missionId: string;
  intent: RuntimeBindingIntentV1;
  expectedPreparation?: PreparedRuntimeBindingReadyResultV1;
  timestamp: Readonly<{ value: string; provenance: "hostTrusted" }>;
  humanMode: boolean;
  decisionOutput: { write: (value: string) => void };
}>;

export type RuntimeBindingExecutorDependenciesV1 = Readonly<{
  renderDecision: (decision: PreparedRuntimeBindingDecisionV1, humanMode: boolean) => string;
  readPasscode: () => Promise<string>;
  signPayload: (binding: TrustedHumanBinding, passcode: string, payload: unknown) => Promise<string>;
  appendEntryLegacy: typeof appendProfileAwareMissionEntryV1;
  appendEntryAtomic: typeof appendProfileAwareMissionEntriesAtomicV1;
}>;

export type RuntimeBindingExecutorResultV1 = Readonly<{
  projection: ProfileAwareProjectionV1;
  bindingId: string;
  authorizationId: string;
  schema9BindingDigest: string;
  journalSequence: number;
  finalJournalSha256: string;
}>;

type ProfileAwareJournal = Readonly<{ kind: "profile-aware"; entries: readonly ProfileAwareMissionEntryV1[]; projection: ProfileAwareProjectionV1 }>;
type ConfigurationSnapshot = Readonly<{ config: ShieldConfig; bytes: string; identity: string }>;
type JournalSnapshot = Readonly<{ current: ProfileAwareJournal; bytes: string; sha256: string }>;
type RepositorySnapshot = Readonly<{
  canonicalRoot: string;
  gitTopLevel: string;
  originUrl: string | null;
  remoteRepositoryId: string | null;
  branch: string;
  headRevision: string;
  statusEntries: readonly string[];
}>;

const CONFIG_PATH = join(".shield", "config.json");
const PREPARED_EXCLUSIONS = Object.freeze([
  "review.comment.publish", "review.pull_request.update_draft", "review.pull_request.mark_ready", "merge", "deployment", "release", "final_acceptance",
] as const);
const MISSION_PARTICIPANTS = new Set(["hill", "daisy", "fury", "may", "mack", "coulson", "fitz", "simmons"]);

function snapshot<T>(value: T): T {
  const copied = JSON.parse(canonicalJson(value)) as T;
  const freeze = (candidate: unknown): void => {
    if (candidate !== null && typeof candidate === "object") {
      for (const child of Object.values(candidate)) freeze(child);
      Object.freeze(candidate);
    }
  };
  freeze(copied);
  return copied;
}

function unwrap<T>(result: ContractResult<T>): T {
  if (result.state === "invalid") throw new Error(`${result.code}: ${result.errors.join(" ")}`);
  return result.value;
}

function gitOutput(root: string, args: readonly string[]): Promise<string> {
  return new Promise((resolveValue, reject) => {
    execFileNode("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" } }, (error, stdout) => {
      if (error) reject(error); else resolveValue(stdout);
    });
  });
}

function nulRecords(value: string): string[] {
  if (value.length === 0) return [];
  if (!value.endsWith("\0")) throw new Error("Repository status was not NUL-terminated.");
  return value.slice(0, -1).split("\0");
}

function repositoryIdFromOrigin(value: string): string {
  const exact = value.trim().replace(/\.git$/u, "");
  const match = /^(?:git@github\.com:|https:\/\/github\.com\/)(?<repository>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/u.exec(exact);
  if (!match?.groups?.repository) throw new Error("Repository origin URL is unsupported or malformed.");
  return match.groups.repository;
}

async function repositorySnapshot(root: string, bindRemoteIdentity: boolean): Promise<RepositorySnapshot> {
  const canonicalRoot = await fsRealpath(root);
  const gitTopLevel = await fsRealpath((await gitOutput(canonicalRoot, ["rev-parse", "--show-toplevel"])).trim());
  const originUrl = bindRemoteIdentity ? (await gitOutput(canonicalRoot, ["remote", "get-url", "origin"])).trim() : null;
  const remoteRepositoryId = originUrl === null ? null : repositoryIdFromOrigin(originUrl);
  const branch = (await gitOutput(canonicalRoot, ["branch", "--show-current"])).trim();
  const headRevision = (await gitOutput(canonicalRoot, ["rev-parse", "HEAD"])).trim();
  const statusEntries = nulRecords(await gitOutput(canonicalRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  if (canonicalRoot !== gitTopLevel || branch.length === 0 || branch === "HEAD" || headRevision.length === 0) throw new Error("Repository identity is not a real attached top-level checkout.");
  return snapshot({ canonicalRoot, gitTopLevel, originUrl, remoteRepositoryId, branch, headRevision, statusEntries });
}

async function configurationSnapshot(root: string): Promise<ConfigurationSnapshot> {
  const path = join(root, CONFIG_PATH);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    const pathBefore = await lstat(path);
    if (!before.isFile() || pathBefore.isSymbolicLink() || !pathBefore.isFile() || before.dev !== pathBefore.dev || before.ino !== pathBefore.ino) throw new Error("SHIELD configuration identity is invalid.");
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathAfter = await lstat(path);
    if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode || before.dev !== pathAfter.dev || before.ino !== pathAfter.ino || pathAfter.isSymbolicLink() || !pathAfter.isFile()) {
      throw new Error("SHIELD configuration identity changed during snapshot.");
    }
    const parsed = parseShieldConfig(bytes);
    if (parsed.state === "invalid") throw new Error(parsed.issues.map(({ message }) => message).join(" "));
    return snapshot({ config: parsed.value, bytes, identity: `${String(before.dev)}:${String(before.ino)}:${String(before.mode)}` });
  } finally { await handle.close(); }
}

async function journalSnapshot(root: string, config: ShieldConfig, missionId: string): Promise<JournalSnapshot> {
  const paths = unwrap(resolveSupervisedMissionPaths(root, config.paths.journals, missionId));
  const handle = await open(paths.journalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    const pathBefore = await lstat(paths.journalPath);
    if (!before.isFile() || pathBefore.isSymbolicLink() || !pathBefore.isFile() || before.dev !== pathBefore.dev || before.ino !== pathBefore.ino) throw new Error("Mission journal identity is invalid.");
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathAfter = await lstat(paths.journalPath);
    if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode || before.dev !== pathAfter.dev || before.ino !== pathAfter.ino || pathAfter.isSymbolicLink() || !pathAfter.isFile()) {
      throw new Error("Mission journal identity changed during snapshot.");
    }
    if (bytes.length === 0 || !bytes.endsWith("\n")) throw new Error("Profile-aware mission journal is empty or incomplete.");
    const entries = bytes.slice(0, -1).split("\n").map((line) => JSON.parse(line) as unknown);
    const replay = replayProfileAwareMissionJournal(entries);
    if (replay.state === "invalid") throw new Error(`${replay.code}: ${replay.errors.join(" ")}`);
    if (replay.value.missionId !== missionId) throw new Error("Journal missionId does not match the requested mission.");
    return snapshot({ current: { kind: "profile-aware" as const, entries: entries as ProfileAwareMissionEntryV1[], projection: replay.value }, bytes, sha256: journalByteSha256(bytes) });
  } finally { await handle.close(); }
}

function bindings(current: ProfileAwareJournal): TrustedHumanBinding[] {
  const begun = current.entries[0];
  if (begun?.type !== "mission.begun") throw new Error("Profile-aware journal has no trusted begin entry.");
  return begun.payload.trustedBindings.map((binding) => ({ ...binding }));
}

function coulsonBinding(current: ProfileAwareJournal): TrustedHumanBinding {
  const matches = bindings(current).filter(({ seatId }) => seatId === "coulson");
  if (matches.length !== 1) throw new Error("Profile-aware journal requires exactly one frozen Coulson binding.");
  return matches[0];
}

function exactPrepared(value: unknown, expected: PreparedRuntimeBindingReadyResultV1): PreparedRuntimeBindingReadyResultV1 {
  if (value === null || typeof value !== "object" || (value as { state?: string }).state !== "runtime_binding_ready" || canonicalJson(value) !== canonicalJson(expected)) {
    throw new Error("Prepared runtime-binding graph or live observation no longer matches the selected transition.");
  }
  return value as PreparedRuntimeBindingReadyResultV1;
}

async function revalidatePrepared(expected: PreparedRuntimeBindingReadyResultV1): Promise<PreparedRuntimeBindingReadyResultV1> {
  return exactPrepared(await resolvePreparedMissionTransitionV1({ missionId: expected.missionId, repositoryRoot: expected.observation.canonicalRoot }), expected);
}

function samePreparedConfiguration(left: ConfigurationSnapshot, right: ConfigurationSnapshot): boolean {
  return canonicalJson(left.config) === canonicalJson(right.config) && left.bytes === right.bytes && left.identity === right.identity;
}

function samePreparedJournal(left: JournalSnapshot, right: JournalSnapshot): boolean {
  return left.bytes === right.bytes && left.sha256 === right.sha256 && canonicalJson(left.current) === canonicalJson(right.current);
}

function sameLegacyRepository(left: RepositorySnapshot, right: RepositorySnapshot): boolean {
  return left.canonicalRoot === right.canonicalRoot && left.branch === right.branch && left.headRevision === right.headRevision;
}

function validateIntent(value: RuntimeBindingIntentV1): RuntimeBindingIntentV1 {
  const keys = value !== null && typeof value === "object" ? Object.keys(value) : [];
  if (keys.length !== 2 || !keys.includes("reasoningRuntimeId") || !keys.includes("toolExecutorId") ||
      typeof value.reasoningRuntimeId !== "string" || value.reasoningRuntimeId.length === 0 || typeof value.toolExecutorId !== "string" || value.toolExecutorId.length === 0) {
    throw new Error("May binding input must contain exactly reasoningRuntimeId and toolExecutorId strings.");
  }
  return snapshot(value);
}

function validateExecutorInput(value: unknown): asserts value is RuntimeBindingExecutorInputV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Runtime-binding executor input must be a closed object.");
  const candidate = value as Record<string, unknown>;
  const allowed = candidate.mode === "prepared"
    ? ["mode", "root", "missionId", "intent", "expectedPreparation", "timestamp", "humanMode", "decisionOutput"]
    : ["mode", "root", "missionId", "intent", "timestamp", "humanMode", "decisionOutput"];
  if ((candidate.mode !== "legacy" && candidate.mode !== "prepared") || Object.keys(candidate).length !== allowed.length ||
      !allowed.every((field) => Object.hasOwn(candidate, field)) || typeof candidate.root !== "string" || candidate.root.length === 0 ||
      typeof candidate.missionId !== "string" || candidate.missionId.length === 0 || typeof candidate.humanMode !== "boolean" ||
      candidate.timestamp === null || typeof candidate.timestamp !== "object" || Array.isArray(candidate.timestamp) ||
      Object.keys(candidate.timestamp).length !== 2 || (candidate.timestamp as Record<string, unknown>).provenance !== "hostTrusted" ||
      typeof (candidate.timestamp as Record<string, unknown>).value !== "string" ||
      candidate.decisionOutput === null || typeof candidate.decisionOutput !== "object" || typeof (candidate.decisionOutput as { write?: unknown }).write !== "function") {
    throw new Error("Runtime-binding executor input is invalid for its explicit mode.");
  }
}

function candidateWrapper(
  current: ProfileAwareJournal,
  repository: RepositorySnapshot,
  missionId: string,
  intent: RuntimeBindingIntentV1,
  mode: "legacy" | "prepared",
): Schema9RuntimeBindingV1 {
  const authority = current.projection.implementationAuthority;
  if (current.projection.implementationAuthorityState !== "authorized" || authority === null) throw new Error("May binding requires an active Wheels Up implementation authority.");
  const identities = ["may", intent.reasoningRuntimeId, authority.modelId, intent.toolExecutorId];
  if (new Set(identities).size !== identities.length || (mode === "prepared" && identities.slice(1).some((identity) => MISSION_PARTICIPANTS.has(identity))) ||
      current.projection.brief.participants.some(({ seatId }) => identities.slice(1).includes(seatId))) {
    throw new Error("May seat, reasoning runtime, model, and tool executor must be mutually distinct and cannot be mission participants.");
  }
  if (mode === "prepared" && (repository.remoteRepositoryId !== authority.repositoryId || authority.artifactRevisionId !== authority.headRevision)) {
    throw new Error("Repository identity or artifact revision no longer matches Wheels Up authority.");
  }
  if (repository.canonicalRoot !== authority.canonicalWritableRoot || repository.branch !== authority.branch || repository.headRevision !== authority.headRevision) {
    throw new Error("Repository root, branch, or HEAD no longer matches Wheels Up authority.");
  }
  const sequence = current.projection.lastSequence + 1;
  const authorizationId = `authorization:runtime-binding:${sequence}`;
  const binding: RuntimeBinding = {
    bindingSchemaVersion: 1, bindingId: `binding:${missionId}:may:1`, bindingVersion: 1, missionId,
    subjectId: current.projection.brief.subjectId, missionRevisionId: current.projection.brief.revisionId, seatId: "may",
    reasoningRuntimeId: intent.reasoningRuntimeId, toolExecutorId: intent.toolExecutorId, repositoryId: authority.repositoryId,
    canonicalWritableRoot: authority.canonicalWritableRoot, branch: authority.branch, artifactRevisionId: authority.artifactRevisionId,
    recordedAtSequence: sequence, activeThroughSequence: null, lifecycleState: "active",
    approvedScope: { actionIds: [...authority.approvedActionIds], effectClasses: [...authority.approvedEffectClasses], effectKeys: [...authority.approvedEffectKeys], capabilities: [...authority.approvedCapabilities] },
    coulsonAuthorizationRef: authorizationId,
  };
  return unwrap(validateSchema9RuntimeBindingV1({
    schemaVersion: 1, binding, implementationAuthorityRef: authority.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authority), implementationAuthoritySequence: authority.journalSequence,
    approvedRelativePaths: [...authority.approvedRelativePaths], validationCommandIds: [...authority.validationCommandIds], modelId: authority.modelId,
    baseRevision: authority.baseRevision, headRevision: authority.headRevision,
  }));
}

function decision(expected: PreparedRuntimeBindingReadyResultV1): PreparedRuntimeBindingDecisionV1 {
  const authority = expected.implementationAuthority;
  return snapshot({
    schemaVersion: 1 as const, schemaId: "shield.prepared-runtime-binding-decision.v1" as const, missionId: expected.missionId,
    subjectId: authority.subjectId, missionRevisionId: authority.missionRevisionId, seatId: "may" as const, implementationAuthorityRef: authority.authorityRef,
    repository: { repositoryId: authority.repositoryId, canonicalRoot: authority.canonicalWritableRoot, branch: authority.branch, baseRevision: authority.baseRevision, headRevision: authority.headRevision },
    modelId: authority.modelId, reasoningRuntimeId: expected.runtimeBinding.binding.reasoningRuntimeId, toolExecutorId: expected.runtimeBinding.binding.toolExecutorId,
    approvedRelativePaths: [...authority.approvedRelativePaths], approvedActionIds: [...authority.approvedActionIds], approvedEffectClasses: [...authority.approvedEffectClasses],
    approvedEffectKeys: [...authority.approvedEffectKeys], approvedCapabilities: [...authority.approvedCapabilities], validationCommandIds: [...authority.validationCommandIds],
    exclusions: [...PREPARED_EXCLUSIONS], remainingHumanGates: [...expected.observation.remainingHumanGates],
  });
}

export async function executeRuntimeBindingV1(
  input: RuntimeBindingExecutorInputV1,
  dependencies: RuntimeBindingExecutorDependenciesV1,
): Promise<RuntimeBindingExecutorResultV1> {
  validateExecutorInput(input);
  const intent = validateIntent(input.intent);
  if (input.mode === "prepared" && (input.expectedPreparation?.missionId !== input.missionId ||
      input.expectedPreparation.runtimeBinding.binding.reasoningRuntimeId !== intent.reasoningRuntimeId ||
      input.expectedPreparation.runtimeBinding.binding.toolExecutorId !== intent.toolExecutorId)) throw new Error("Prepared runtime-binding intent differs from the selected transition.");

  const initialConfig = await configurationSnapshot(input.root);
  const initialJournal = await journalSnapshot(input.root, initialConfig.config, input.missionId);
  const initialRepository = await repositorySnapshot(input.root, input.mode === "prepared");
  const authority = initialJournal.current.projection.implementationAuthority;
  if (initialJournal.current.projection.implementationAuthorityState !== "authorized" || authority === null) throw new Error("May binding requires an active Wheels Up implementation authority.");
  if (input.mode === "prepared") {
    const reviewedRepositoryId = input.expectedPreparation?.protectedGraph.transitionPlan.repositoryId;
    if (initialRepository.remoteRepositoryId !== initialConfig.config.repositoryId || initialConfig.config.repositoryId !== reviewedRepositoryId || reviewedRepositoryId !== authority.repositoryId) {
      throw new Error("Remote, configured, reviewed, and Wheels Up repository identities must match exactly.");
    }
  } else if (initialConfig.config.repositoryId !== authority.repositoryId) throw new Error("Repository ID no longer matches Wheels Up authority.");
  const wrapper = candidateWrapper(initialJournal.current, initialRepository, input.missionId, intent, input.mode);
  const expected = input.mode === "prepared" ? await revalidatePrepared(input.expectedPreparation as PreparedRuntimeBindingReadyResultV1) : null;
  if (expected !== null && canonicalJson(wrapper) !== canonicalJson(expected.runtimeBinding)) throw new Error("Generated runtime binding differs from the exact reviewed candidate.");

  const signer = coulsonBinding(initialJournal.current);
  const signerSnapshot = input.mode === "prepared" ? await captureMissionSignerSnapshot(signer.signingKeyRef) : null;
  const sequence = initialJournal.current.projection.lastSequence + 1;
  const sourceRef = input.mode === "legacy" ? `cli:runtime-binding:${sequence}` : `cli:prepare-next:runtime-binding:${sequence}`;
  const payload = unwrap(validateSchema9RuntimeBindingAuthorizationPayload({
    schemaVersion: 1, authorizationId: `authorization:runtime-binding:${sequence}`, missionId: input.missionId,
    subjectId: initialJournal.current.projection.brief.subjectId, seatId: "may", bindingId: wrapper.binding.bindingId, bindingVersion: 1,
    priorBindingId: null, priorBindingVersion: null, bindingDigest: computeRuntimeBindingDigest(wrapper.binding), schema9BindingDigest: computeSchema9RuntimeBindingDigest(wrapper),
    artifactRevisionId: authority.artifactRevisionId, decision: "approved", previousJournalSequence: initialJournal.current.projection.lastSequence, journalSequence: sequence,
    humanPrincipalId: signer.humanPrincipalId, humanBindingId: signer.bindingId, signingKeyRef: signer.signingKeyRef, sourceRef, timestamp: input.timestamp,
  })) as Schema9RuntimeBindingAuthorizationPayload;

  if (expected !== null) input.decisionOutput.write(`${dependencies.renderDecision(decision(expected), input.humanMode)}\n`);
  const passcode = await dependencies.readPasscode();
  const signatureBase64 = await dependencies.signPayload(signer, passcode, payload);

  const capturePreparedFresh = async () => {
    const config = await configurationSnapshot(input.root);
    const [journal, repository, signerState] = await Promise.all([
      journalSnapshot(input.root, config.config, input.missionId), repositorySnapshot(input.root, true),
      captureMissionSignerSnapshot(signer.signingKeyRef),
    ]);
    await revalidatePrepared(input.expectedPreparation as PreparedRuntimeBindingReadyResultV1);
    return { config, journal, repository, signerState };
  };
  let beforeAppend: Readonly<{ config: ConfigurationSnapshot; journal: JournalSnapshot; repository: RepositorySnapshot; signerState: Awaited<ReturnType<typeof captureMissionSignerSnapshot>> | null }>;
  if (input.mode === "prepared") {
    const afterSigning = await capturePreparedFresh();
    const beforePreparedAppend = await capturePreparedFresh();
    for (const fresh of [afterSigning, beforePreparedAppend]) {
      if (!samePreparedConfiguration(initialConfig, fresh.config) || !samePreparedJournal(initialJournal, fresh.journal) ||
          canonicalJson(initialRepository) !== canonicalJson(fresh.repository)) throw new Error("Mission journal, repository configuration, or repository identity changed while May binding was being signed.");
      if (signerSnapshot !== null) assertMissionSignerSnapshotUnchanged(signerSnapshot, fresh.signerState);
      if (canonicalJson(signer) !== canonicalJson(coulsonBinding(fresh.journal.current))) throw new Error("Coulson signer binding changed while May binding was being signed.");
    }
    beforeAppend = beforePreparedAppend;
  } else {
    const [config, repository] = await Promise.all([
      configurationSnapshot(input.root),
      repositorySnapshot(input.root, false),
    ]);
    if (config.config.repositoryId !== initialConfig.config.repositoryId || config.config.paths.journals !== initialConfig.config.paths.journals ||
        config.config.repositoryId !== authority.repositoryId) throw new Error("Repository configuration changed while May binding was being signed.");
    const journal = await journalSnapshot(input.root, config.config, input.missionId);
    if (journal.current.projection.lastSequence !== initialJournal.current.projection.lastSequence || !sameLegacyRepository(initialRepository, repository)) {
      throw new Error("Mission journal or repository identity changed while May binding was being signed.");
    }
    beforeAppend = { config, journal, repository, signerState: null };
  }

  const entry = createProfileAwareRuntimeBindingRecordedEntryV1({
    projection: beforeAppend.journal.current.projection, trustedBindings: bindings(beforeAppend.journal.current), binding: wrapper,
    authorization: { payload, signatureBase64 },
  });
  const appended = input.mode === "legacy"
    ? unwrap(await dependencies.appendEntryLegacy({ repositoryRoot: input.root, configuredJournalPath: initialConfig.config.paths.journals, missionId: input.missionId, entry }))
    : unwrap(await dependencies.appendEntryAtomic({ repositoryRoot: input.root, configuredJournalPath: beforeAppend.config.config.paths.journals, missionId: input.missionId, entries: [entry], expectedStartingJournalSha256: initialJournal.sha256 }));
  const finalJournalSha256 = "finalJournalSha256" in appended && typeof appended.finalJournalSha256 === "string"
    ? appended.finalJournalSha256
    : journalByteSha256(`${initialJournal.bytes}${canonicalJson(entry)}\n`);
  return snapshot({
    projection: appended.projection, bindingId: wrapper.binding.bindingId, authorizationId: payload.authorizationId,
    schema9BindingDigest: payload.schema9BindingDigest, journalSequence: sequence,
    finalJournalSha256,
  });
}
