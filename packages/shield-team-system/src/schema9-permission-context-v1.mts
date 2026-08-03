import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access as fsAccess, realpath as fsRealpath } from "node:fs/promises";
import { execFile as execFileNode } from "node:child_process";
import { resolve } from "node:path";

import { canonicalJson } from "./mission-v2.mjs";
import { readMissionJournalForDisplay } from "./mission-store.mjs";
import {
  assertAuthoritySubsetOfScope,
  computeImplementationAuthorityDigest,
  computeSchema9RuntimeBindingDigest,
  validateImplementationAuthorityV1,
  validateSchema9RuntimeBindingV1,
  type ImplementationAuthorityV1,
  type Schema9RuntimeBindingV1,
} from "./implementation-authority-v1.mjs";
import {
  validatePermissionInvocationContext,
  type HostPermissionAttestation,
  type PermissionInvocationContext,
  type RuntimeBinding,
} from "./permission-v1.mjs";
import { validateRunnerCyclePlan, type RunnerCyclePlan } from "./runner-v1.mjs";
import { type ProfileAwareMissionEntryV1, type ProfileAwareProjectionV1 } from "./profile-aware-mission-v1.mjs";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

type ResultOk<T> = { state: "ready"; context: T };
type ResultBlocked = { state: "blocked"; code: Schema9PermissionContextBlockedCode; errors: string[] };
export type Schema9PermissionContextResult = ResultOk<PermissionInvocationContext> | ResultBlocked;

export type Schema9PermissionContextBlockedCode =
  | "input_invalid"
  | "schema_unsupported"
  | "journal_invalid"
  | "mission_mismatch"
  | "revision_mismatch"
  | "sequence_mismatch"
  | "authority_missing"
  | "authority_inactive"
  | "binding_missing"
  | "binding_ambiguous"
  | "binding_invalid"
  | "observation_failed"
  | "root_mismatch"
  | "branch_mismatch"
  | "head_mismatch"
  | "writability_unavailable"
  | "capability_unavailable"
  | "context_invalid";

type HostAccess = (path: string, mode: number) => Promise<void>;
type HostRealpath = (path: string) => Promise<string>;
type HostExecFile = (command: string, args: readonly string[], options: { cwd: string }) => Promise<string>;
type HostProbeCapability = (capability: string) => Promise<boolean>;

export interface Schema9PermissionContextTrustedHostOps {
  realpath(path: string): Promise<string>;
  access(path: string, mode: number): Promise<void>;
  execFile(command: string, args: readonly string[], options: { cwd: string }): Promise<string>;
  probeCapability(capability: string): Promise<boolean>;
  now(): string;
}

const defaultHostOps = {
  realpath: (path: string): Promise<string> => fsRealpath(path),
  access: (path: string): Promise<void> => fsAccess(path, constants.R_OK | constants.W_OK),
  execFile: (command: string, args: readonly string[], options: { cwd: string }): Promise<string> => new Promise((resolve, reject) => {
    execFileNode(command, [...args], {
      ...options,
      encoding: "utf8",
      windowsHide: true,
      env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    }, (error, stdout) => {
      if (error) return reject(error);
      resolve(stdout.toString());
    });
  }),
  now: (): string => new Date().toISOString(),
};

export interface Schema9PermissionContextInput {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  expectedDecisionId: string;
  plan: RunnerCyclePlan;
  hostId: string;
  trustedHostOps: Pick<Schema9PermissionContextTrustedHostOps, "probeCapability"> & Partial<Omit<Schema9PermissionContextTrustedHostOps, "probeCapability">>;
}

interface LoaderSnapshot {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  expectedDecisionId: string;
  plan: RunnerCyclePlan;
  hostId: string;
  ops: Schema9PermissionContextTrustedHostOps;
}

interface RepoObservation {
  lexicalRequestedRoot: string;
  requestedRoot: string;
  lexicalTopLevelRoot: string;
  topLevelRoot: string;
  branch: string;
  head: string;
}

interface DerivedState {
  authority: ImplementationAuthorityV1;
  authorityDigest: string;
  bindingWrapper: Schema9RuntimeBindingV1;
  binding: RuntimeBinding;
  requiredCapabilities: string[];
  projectedAt: ProfileAwareProjectionV1;
  journalDigest: string;
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function dataField(record: Record<string, unknown>, key: string): { state: "valid"; value: unknown } | { state: "invalid" } {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value")
    ? { state: "valid", value: descriptor.value }
    : { state: "invalid" };
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function blocked(code: Schema9PermissionContextBlockedCode, errors: string[]): ResultBlocked {
  return { state: "blocked", code, errors: [...errors] };
}

function jsonCopy<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

function journalDigest(entries: readonly ProfileAwareMissionEntryV1[]): string {
  return `sha256:${createHash("sha256").update(canonicalJson(entries)).digest("base64url")}`;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function deterministicId(seed: unknown): string {
  return `permission-context:${createHash("sha256").update(canonicalJson(seed)).digest("base64url")}`;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function snapshotInput(input: unknown): ResultOk<LoaderSnapshot> | ResultBlocked {
  if (!plain(input)) return blocked("input_invalid", ["Schema9 permission loader input must be a plain object."]);
  const provided = input as unknown as Record<string, unknown>;
  const expected = ["repositoryRoot", "configuredJournalPath", "missionId", "expectedDecisionId", "plan", "hostId", "trustedHostOps"];
  const ownKeys = Reflect.ownKeys(provided);
  if (ownKeys.length !== expected.length || ownKeys.some((key) => typeof key !== "string" || !expected.includes(key))) return blocked("input_invalid", ["Schema9 permission loader input is not closed."]);
  for (const key of expected) {
    if (dataField(provided, key).state === "invalid") return blocked("input_invalid", [`Schema9 permission loader input field ${key} must be enumerable data.`]);
  }
  const field = (key: string): unknown => (dataField(provided, key) as { state: "valid"; value: unknown }).value;
  const repositoryRoot = normalizeString(field("repositoryRoot"));
  const configuredJournalPath = normalizeString(field("configuredJournalPath"));
  const missionId = normalizeString(field("missionId"));
  const expectedDecisionId = normalizeString(field("expectedDecisionId"));
  const hostId = normalizeString(field("hostId"));
  if (repositoryRoot.length === 0 || configuredJournalPath.length === 0 || missionId.length === 0 || expectedDecisionId.length === 0 || hostId.length === 0) {
    return blocked("input_invalid", ["Schema9 permission loader requires non-empty repositoryRoot, configuredJournalPath, missionId, expectedDecisionId, and hostId."]);
  }
  if (!identifier(missionId) || !identifier(expectedDecisionId) || !identifier(hostId)) {
    return blocked("input_invalid", ["Schema9 permission loader identity fields must match schema identifier format."]);
  }
  const planValue = validateRunnerCyclePlan(field("plan"));
  if (planValue.state === "invalid") return blocked("input_invalid", [`Schema9 permission plan is invalid: ${planValue.code}.`, ...planValue.errors]);
  const plan = jsonCopy(planValue.value);
  if (plan.missionId !== missionId) return blocked("input_invalid", ["Schema9 permission plan missionId must match the missionId input."]);
  if (plan.seatId !== "may") return blocked("input_invalid", ["Schema9 permission loader requires the May seat."]);
  const opsInput = field("trustedHostOps");
  const resolvedOps: Schema9PermissionContextTrustedHostOps = {
    realpath: defaultHostOps.realpath,
    access: defaultHostOps.access,
    execFile: defaultHostOps.execFile,
    probeCapability: async () => false,
    now: defaultHostOps.now,
  };
  if (!plain(opsInput)) return blocked("input_invalid", ["Schema9 permission trusted host operations must be a plain object."]);
  {
    const opsInputRecord = opsInput as Record<string, unknown>;
    const opsFields = ["realpath", "access", "execFile", "probeCapability", "now"];
    const opsKeys = Reflect.ownKeys(opsInputRecord);
    if (opsKeys.some((key) => typeof key !== "string")) return blocked("input_invalid", ["Schema9 permission trusted host operations has invalid keys."]);
    for (const field of opsFields) {
      const descriptor = dataField(opsInputRecord, field);
      const candidate = descriptor.state === "valid" ? descriptor.value : undefined;
      if (candidate !== undefined && typeof candidate !== "function") return blocked("input_invalid", [`Schema9 permission trusted host operation ${field} must be a function.`]);
    }
    const op = (key: string): unknown => {
      const descriptor = dataField(opsInputRecord, key);
      return descriptor.state === "valid" ? descriptor.value : undefined;
    };
    if (typeof op("realpath") === "function") resolvedOps.realpath = op("realpath") as HostRealpath;
    if (typeof op("access") === "function") resolvedOps.access = op("access") as HostAccess;
    if (typeof op("execFile") === "function") resolvedOps.execFile = op("execFile") as HostExecFile;
    if (typeof op("probeCapability") !== "function") return blocked("input_invalid", ["Schema9 permission trusted host capability probe is required."]);
    resolvedOps.probeCapability = op("probeCapability") as HostProbeCapability;
    if (typeof op("now") === "function") resolvedOps.now = op("now") as () => string;
    if (opsKeys.length > 0) {
      const allowedOps = new Set(opsFields);
      if (opsKeys.some((key) => !allowedOps.has(String(key)))) return blocked("input_invalid", ["Schema9 permission trusted host operations must be closed."]);
    }
  }
  return { state: "ready", context: { repositoryRoot, configuredJournalPath, missionId, expectedDecisionId, plan, hostId, ops: resolvedOps } };
}

async function runGitValue(
  ops: Schema9PermissionContextTrustedHostOps,
  command: string,
  cwd: string,
): Promise<string> {
  const value = await ops.execFile("git", ["-C", cwd, ...command.split(" ")], { cwd });
  return normalizeString(value).split("\n")[0] ?? "";
}

async function observeRepository(ops: Schema9PermissionContextTrustedHostOps, repositoryRoot: string): Promise<RepoObservation> {
  const lexicalRequestedRoot = resolve(repositoryRoot);
  const requestedRoot = await ops.realpath(lexicalRequestedRoot);
  const top = await runGitValue(ops, "rev-parse --show-toplevel", requestedRoot);
  if (top.length === 0) throw new Error("missing_top_level");
  const branch = await runGitValue(ops, "rev-parse --abbrev-ref HEAD", requestedRoot);
  const head = await runGitValue(ops, "rev-parse HEAD", requestedRoot);
  if (head.length === 0) throw new Error("missing_head");
  if (branch.length === 0 || branch === "HEAD") throw new Error("detached_head");
  const lexicalTopLevelRoot = resolve(top);
  const topLevel = await ops.realpath(lexicalTopLevelRoot);
  return { lexicalRequestedRoot, requestedRoot, lexicalTopLevelRoot, topLevelRoot: topLevel, branch, head };
}

function deriveSnapshotState(
  input: LoaderSnapshot,
  read: { projection: ProfileAwareProjectionV1; entries: ProfileAwareMissionEntryV1[] },
): ResultOk<DerivedState> | ResultBlocked {
  const projection = read.projection;
  const plan = input.plan;
  if (projection.missionId !== input.missionId || plan.missionId !== projection.missionId) return blocked("mission_mismatch", ["Mission identity is not exact-matched."]);
  if (plan.subjectId !== projection.brief.subjectId) return blocked("mission_mismatch", ["Mission subject is not exact-matched."]);
  if (plan.revisionId !== projection.brief.revisionId) return blocked("revision_mismatch", ["Mission revision is not exact-matched."]);
  if (plan.evaluatedThroughSequence !== projection.lastSequence) return blocked("sequence_mismatch", ["Runner plan sequence is not exact-matched."]);

  if (projection.authorization !== "authorized") return blocked("authority_inactive", ["Implementation authority is not in authorized state."]);
  if (projection.execution === "completed") return blocked("authority_inactive", ["Execution is complete; no new permission context may be produced."]);
  if (projection.execution !== "not-started" && projection.execution !== "running") return blocked("authority_inactive", ["Execution state is unsupported for schema-9 permission loading."]);
  if (projection.implementationAuthority === null) return blocked("authority_missing", ["Implementation authority is missing."]);
  if (projection.implementationAuthorityState !== "authorized") return blocked("authority_inactive", ["Implementation authority is not active."]);

  const checkedAuthority = validateImplementationAuthorityV1(projection.implementationAuthority);
  if (checkedAuthority.state === "invalid") {
    return blocked("authority_inactive", ["Implementation authority is malformed.", ...checkedAuthority.errors]);
  }
  const authority = jsonCopy(checkedAuthority.value);
  const authorityDigest = computeImplementationAuthorityDigest(authority);

  const seatBindings = projection.activeRuntimeBindings.filter((entry) => entry.binding.seatId === plan.seatId);
  if (seatBindings.length === 0) return blocked("binding_missing", ["No active binding for the target seat exists."]);
  if (seatBindings.length > 1) return blocked("binding_ambiguous", ["More than one active binding for the target seat exists."]);
  const checkedBinding = validateSchema9RuntimeBindingV1(seatBindings[0]);
  if (checkedBinding.state === "invalid") return blocked("binding_invalid", ["Runtime binding is malformed.", ...checkedBinding.errors]);
  const bindingWrapper = jsonCopy(checkedBinding.value);
  const binding = jsonCopy(bindingWrapper.binding);
  if (bindingWrapper.implementationAuthorityRef !== authority.authorityRef
    || bindingWrapper.implementationAuthoritySequence !== authority.journalSequence
    || bindingWrapper.implementationAuthorityDigest !== authorityDigest) {
    return blocked("binding_invalid", ["Runtime binding does not reference the active authority exactly."]);
  }
  const scopeSubset = assertAuthoritySubsetOfScope(bindingWrapper, authority);
  if (scopeSubset.state === "invalid") return blocked("binding_invalid", [...scopeSubset.errors]);
  if (binding.missionId !== projection.missionId || binding.subjectId !== projection.brief.subjectId || binding.seatId !== plan.seatId) {
    return blocked("binding_invalid", ["Runtime binding identity does not match the projection identity."]);
  }
  if (binding.repositoryId !== authority.repositoryId || binding.canonicalWritableRoot !== authority.canonicalWritableRoot
    || binding.branch !== authority.branch) {
    return blocked("binding_invalid", ["Runtime binding repository metadata is not mirrored by authority."]);
  }
  if (binding.missionRevisionId !== plan.revisionId || binding.artifactRevisionId !== authority.artifactRevisionId) {
    return blocked("revision_mismatch", ["Runtime binding revision is not exact-matched to the active authority."]);
  }
  if (bindingWrapper.baseRevision !== authority.baseRevision || bindingWrapper.headRevision !== authority.headRevision) {
    return blocked("authority_inactive", ["Runtime wrapper revisions are not exact-matched to authority revisions."]);
  }

  const invariantRevisions = new Set([authority.artifactRevisionId, binding.artifactRevisionId, bindingWrapper.headRevision, authority.headRevision]);
  if (invariantRevisions.size !== 1) return blocked("authority_inactive", ["Strict authority/binding/head revision invariants are not equal."]);

  const requiredCapabilities = [...binding.approvedScope.capabilities].sort();
  if (!requiredCapabilities.every((value) => identifier(value))) {
    return blocked("binding_invalid", ["Binding capability list is malformed."]);
  }

  return {
    state: "ready",
    context: {
      authority,
      authorityDigest,
      bindingWrapper,
      binding,
      requiredCapabilities,
      projectedAt: projection,
      journalDigest: journalDigest(read.entries),
    },
  };
}

async function observeWritability(ops: Schema9PermissionContextTrustedHostOps, path: string): Promise<void> {
  await ops.access(path, constants.W_OK | constants.R_OK);
}

async function observeCapabilities(
  ops: Schema9PermissionContextTrustedHostOps,
  capabilities: readonly string[],
): Promise<boolean[]> {
  const states: boolean[] = [];
  for (const capability of capabilities) {
    const result = await ops.probeCapability(capability);
    states.push(result === true);
  }
  return states;
}

function makeAttestation(input: {
  kind: "repository_root" | "writability" | "capability";
  hostId: string;
  toolExecutorId: string;
  repositoryId: string;
  canonicalWritableRoot: string;
  capabilityId: string | null;
  observedValue: string | boolean;
  evaluatedAt: string;
}): HostPermissionAttestation {
  return {
    attestationSchemaVersion: 1,
    attestationId: `permission-${deterministicId({
      kind: input.kind,
      hostId: input.hostId,
      toolExecutorId: input.toolExecutorId,
      repositoryId: input.repositoryId,
      canonicalWritableRoot: input.canonicalWritableRoot,
      capabilityId: input.capabilityId,
      observedAt: input.evaluatedAt,
      observedValue: input.observedValue,
      observedKey: `${input.capabilityId ?? "root-or-write"}`,
    })}`,
    kind: input.kind,
    hostId: input.hostId,
    toolExecutorId: input.toolExecutorId,
    repositoryId: input.repositoryId,
    canonicalWritableRoot: input.canonicalWritableRoot,
    capabilityId: input.capabilityId,
    observedValue: input.observedValue,
    observedAt: input.evaluatedAt,
    expiresAt: input.evaluatedAt,
  };
}

function buildContext(
  snapshot: DerivedState,
  hostId: string,
  plan: RunnerCyclePlan,
  decisionId: string,
  evaluatedAt: string,
  capabilityStates: boolean[],
): PermissionInvocationContext {
  const rootAttestation = makeAttestation({
    kind: "repository_root",
    hostId,
    toolExecutorId: snapshot.binding.toolExecutorId,
    repositoryId: snapshot.binding.repositoryId,
    canonicalWritableRoot: snapshot.binding.canonicalWritableRoot,
    capabilityId: null,
    observedValue: snapshot.binding.canonicalWritableRoot,
    evaluatedAt,
  });
  const writableAttestation = makeAttestation({
    kind: "writability",
    hostId,
    toolExecutorId: snapshot.binding.toolExecutorId,
    repositoryId: snapshot.binding.repositoryId,
    canonicalWritableRoot: snapshot.binding.canonicalWritableRoot,
    capabilityId: null,
    observedValue: true,
    evaluatedAt,
  });
  const capabilityAttestations: HostPermissionAttestation[] = snapshot.requiredCapabilities.map((capability, index) => makeAttestation({
    kind: "capability",
    hostId,
    toolExecutorId: snapshot.binding.toolExecutorId,
    repositoryId: snapshot.binding.repositoryId,
    canonicalWritableRoot: snapshot.binding.canonicalWritableRoot,
    capabilityId: capability,
    observedValue: capabilityStates[index] === true,
    evaluatedAt,
  }));
  return {
    permissionContractVersion: 1,
    journalSchemaVersion: 9,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    missionRevisionId: plan.revisionId,
    artifactRevisionId: snapshot.authority.artifactRevisionId,
    evaluatedThroughSequence: plan.evaluatedThroughSequence,
    reasoningRuntimeId: snapshot.binding.reasoningRuntimeId,
    toolExecutorId: snapshot.binding.toolExecutorId,
    repositoryId: snapshot.binding.repositoryId,
    canonicalWritableRoot: snapshot.binding.canonicalWritableRoot,
    branch: snapshot.binding.branch,
    requiredCapabilities: [...snapshot.requiredCapabilities],
    activeBindings: [{
      ...snapshot.binding,
      approvedScope: {
        actionIds: [...snapshot.binding.approvedScope.actionIds],
        effectClasses: [...snapshot.binding.approvedScope.effectClasses],
        effectKeys: [...snapshot.binding.approvedScope.effectKeys],
        capabilities: [...snapshot.binding.approvedScope.capabilities],
      },
    }],
    attestations: [rootAttestation, writableAttestation, ...capabilityAttestations],
    evaluatedAt,
    decisionId,
  };
}

export async function loadSchema9PermissionContextV1(input: Schema9PermissionContextInput): Promise<Schema9PermissionContextResult> {
  let snapshot: ResultOk<LoaderSnapshot> | ResultBlocked;
  try {
    snapshot = snapshotInput(input);
  } catch {
    return blocked("input_invalid", ["Schema9 permission loader input inspection failed."]);
  }
  if (snapshot.state === "blocked") return snapshot;
  const validated = snapshot.context;
  const ops = validated.ops;

  let firstJournal;
  try {
    firstJournal = await readMissionJournalForDisplay({
      repositoryRoot: validated.repositoryRoot,
      configuredJournalPath: validated.configuredJournalPath,
      missionId: validated.missionId,
    });
  } catch {
    return blocked("journal_invalid", ["First mission journal read failed."]);
  }
  if (firstJournal.state === "invalid") {
    if (firstJournal.code === "unsupported_schema" || firstJournal.code === "schema_mixed") return blocked("schema_unsupported", [firstJournal.code, ...firstJournal.errors]);
    return blocked("journal_invalid", [firstJournal.code, ...firstJournal.errors]);
  }
  if (firstJournal.value.kind !== "profile-aware") return blocked("schema_unsupported", ["Schema-9 loader requires profile-aware journal replay."]);
  const firstState = deriveSnapshotState(validated, firstJournal.value);
  if (firstState.state === "blocked") return firstState;

  const firstAuthority = firstState.context.authority;
  const firstBinding = firstState.context.binding;
  const firstBindingWrapper = firstState.context.bindingWrapper;

  let firstObservation: RepoObservation;
  try {
    firstObservation = await observeRepository(ops, validated.repositoryRoot);
  } catch (error) {
    return blocked("observation_failed", [`Git observation failed before capability probes: ${String((error as Error).message ?? "unknown error")}.`]);
  }
  if (firstObservation.lexicalRequestedRoot !== firstObservation.requestedRoot || firstObservation.lexicalTopLevelRoot !== firstObservation.topLevelRoot) return blocked("root_mismatch", ["Repository root aliases are not permitted."]);
  if (firstObservation.topLevelRoot !== firstObservation.requestedRoot) return blocked("root_mismatch", ["Requested root is not the git top-level repository root."]);
  if (firstObservation.topLevelRoot !== firstBinding.canonicalWritableRoot) return blocked("root_mismatch", ["Writable root is not the active git root."]);
  if (firstObservation.branch !== firstBinding.branch) return blocked("branch_mismatch", ["Observed branch does not match binding branch."]);
  if (firstObservation.head !== firstAuthority.headRevision || firstObservation.head !== firstBindingWrapper.headRevision || firstObservation.head !== firstBinding.artifactRevisionId) {
    return blocked("head_mismatch", ["Observed head is not an exact revision match for the active authority and binding."]);
  }

  try {
    await observeWritability(ops, firstBinding.canonicalWritableRoot);
  } catch {
    return blocked("writability_unavailable", ["Writable root is not writable by host operations."]);
  }
  let capabilityStates: boolean[];
  try {
    capabilityStates = await observeCapabilities(ops, firstState.context.requiredCapabilities);
  } catch {
    return blocked("capability_unavailable", ["Capability probe failed."]);
  }
  if (capabilityStates.length === 0 && firstState.context.requiredCapabilities.length > 0) {
    return blocked("capability_unavailable", ["Capability probe could not be executed."]);
  }
  for (let index = 0; index < firstState.context.requiredCapabilities.length; index += 1) {
    if (capabilityStates[index] !== true) {
      return blocked("capability_unavailable", [`Capability ${firstState.context.requiredCapabilities[index]} was not available in the host probe result.`]);
    }
  }

  let secondObservation: RepoObservation;
  try {
    secondObservation = await observeRepository(ops, validated.repositoryRoot);
  } catch (error) {
    return blocked("observation_failed", [`Git observation failed after probing: ${String((error as Error).message ?? "unknown error")}.`]);
  }
  let secondJournal;
  try {
    secondJournal = await readMissionJournalForDisplay({
      repositoryRoot: validated.repositoryRoot,
      configuredJournalPath: validated.configuredJournalPath,
      missionId: validated.missionId,
    });
  } catch {
    return blocked("journal_invalid", ["Second mission journal read failed after probing."]);
  }

  if (secondJournal.state === "invalid") {
    if (secondJournal.code === "unsupported_schema" || secondJournal.code === "schema_mixed") return blocked("schema_unsupported", [secondJournal.code, ...secondJournal.errors]);
    return blocked("journal_invalid", [secondJournal.code, ...secondJournal.errors]);
  }
  if (secondJournal.value.kind !== "profile-aware") return blocked("schema_unsupported", ["Schema-9 loader requires profile-aware journal replay on second read."]);
  const secondState = deriveSnapshotState(validated, secondJournal.value);
  if (secondState.state === "blocked") return secondState;
  if (!same(firstState.context.journalDigest, secondState.context.journalDigest)) return blocked("observation_failed", ["Journal digest drifted between observations."]);
  if (!same(firstState.context.projectedAt, secondState.context.projectedAt)) return blocked("observation_failed", ["Projected journal state drifted between observations."]);
  if (!same(firstState.context.authority, secondState.context.authority)) return blocked("observation_failed", ["Authority drifted between observations."]);
  if (!same(firstState.context.bindingWrapper, secondState.context.bindingWrapper)) return blocked("observation_failed", ["Active binding drifted between observations."]);
  if (firstObservation.lexicalRequestedRoot !== secondObservation.lexicalRequestedRoot || firstObservation.requestedRoot !== secondObservation.requestedRoot || firstObservation.lexicalTopLevelRoot !== secondObservation.lexicalTopLevelRoot || firstObservation.topLevelRoot !== secondObservation.topLevelRoot) return blocked("root_mismatch", ["Repository root changed between observations."]);
  if (firstObservation.branch !== secondObservation.branch) return blocked("branch_mismatch", ["Observed branch changed between observations."]);
  if (firstObservation.head !== secondObservation.head) return blocked("head_mismatch", ["Observed head changed between observations."]);
  if (computeImplementationAuthorityDigest(firstAuthority) !== firstState.context.authorityDigest) return blocked("observation_failed", ["Authority digest changed between reads."]);
  if (computeSchema9RuntimeBindingDigest(firstState.context.bindingWrapper) !== computeSchema9RuntimeBindingDigest(secondState.context.bindingWrapper)) {
    return blocked("observation_failed", ["Binding digest changed between reads."]);
  }

  let evaluatedAt: string;
  try {
    evaluatedAt = ops.now();
  } catch {
    return blocked("context_invalid", ["Trusted host clock failed."]);
  }
  if (!ISO.test(evaluatedAt) || !Number.isFinite(Date.parse(evaluatedAt))) return blocked("context_invalid", ["Trusted host clock is malformed."]);
  const context = buildContext(firstState.context, validated.hostId, validated.plan, validated.expectedDecisionId, evaluatedAt, capabilityStates);
  const checkedContext = validatePermissionInvocationContext(context);
  if (checkedContext.state === "invalid") return blocked("context_invalid", checkedContext.errors);
  return { state: "ready", context: checkedContext.value };
}
