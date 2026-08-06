import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access as fsAccess, realpath as fsRealpath } from "node:fs/promises";
import { execFile as execFileNode } from "node:child_process";
import { types as utilTypes } from "node:util";

import { canonicalJson } from "./mission-v2.mjs";
import {
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
import {
  loadSchema9SeatDispatchProjectionV1,
  type Schema9SeatDispatchProjectionBlockedCodeV1,
  type Schema9SeatDispatchProjectionV1,
} from "./schema9-seat-dispatch-projection-v1.mjs";

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

interface ProjectionPermissionState {
  authority: ImplementationAuthorityV1;
  bindingWrapper: Schema9RuntimeBindingV1;
  binding: RuntimeBinding;
  requiredCapabilities: string[];
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !utilTypes.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
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
  snapshot: ProjectionPermissionState,
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

function permissionStateFromProjection(projection: Schema9SeatDispatchProjectionV1): ProjectionPermissionState {
  const authority = jsonCopy(projection.implementationAuthority.authority);
  const bindingWrapper = jsonCopy(projection.mayRuntimeBinding.binding);
  return {
    authority,
    bindingWrapper,
    binding: jsonCopy(bindingWrapper.binding),
    requiredCapabilities: [...bindingWrapper.binding.approvedScope.capabilities].sort(),
  };
}

function projectionBlocked(
  code: Schema9SeatDispatchProjectionBlockedCodeV1,
  errors: string[],
): ResultBlocked {
  if (code === "authorization_inactive" || code === "profile_not_ready" || code === "lifecycle_inactive") {
    return blocked("authority_inactive", errors);
  }
  if (code === "journal_drift") return blocked("observation_failed", errors);
  return blocked(code, errors);
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

  const projectionInput = {
    purpose: "runner_permission" as const,
    repositoryRoot: validated.repositoryRoot,
    configuredJournalPath: validated.configuredJournalPath,
    missionId: validated.missionId,
    expectedSubjectId: validated.plan.subjectId,
    expectedMissionRevisionId: validated.plan.revisionId,
    expectedEvaluatedThroughSequence: validated.plan.evaluatedThroughSequence,
    trustedHostOps: { realpath: ops.realpath, execFile: ops.execFile },
  };
  const firstProjection = await loadSchema9SeatDispatchProjectionV1(projectionInput);
  if (firstProjection.state === "blocked") return projectionBlocked(firstProjection.code, firstProjection.errors);
  const firstState = permissionStateFromProjection(firstProjection.projection);

  try {
    await observeWritability(ops, firstState.binding.canonicalWritableRoot);
  } catch {
    return blocked("writability_unavailable", ["Writable root is not writable by host operations."]);
  }
  let capabilityStates: boolean[];
  try {
    capabilityStates = await observeCapabilities(ops, firstState.requiredCapabilities);
  } catch {
    return blocked("capability_unavailable", ["Capability probe failed."]);
  }
  if (capabilityStates.length === 0 && firstState.requiredCapabilities.length > 0) {
    return blocked("capability_unavailable", ["Capability probe could not be executed."]);
  }
  for (let index = 0; index < firstState.requiredCapabilities.length; index += 1) {
    if (capabilityStates[index] !== true) {
      return blocked("capability_unavailable", [`Capability ${firstState.requiredCapabilities[index]} was not available in the host probe result.`]);
    }
  }
  const secondProjection = await loadSchema9SeatDispatchProjectionV1(projectionInput);
  if (secondProjection.state === "blocked") return projectionBlocked(secondProjection.code, secondProjection.errors);
  if (firstProjection.projection.projectionDigest !== secondProjection.projection.projectionDigest || !same(firstProjection.projection, secondProjection.projection)) {
    return blocked("observation_failed", ["Seat-dispatch projection drifted during permission probes."]);
  }

  let evaluatedAt: string;
  try {
    evaluatedAt = ops.now();
  } catch {
    return blocked("context_invalid", ["Trusted host clock failed."]);
  }
  if (!ISO.test(evaluatedAt) || !Number.isFinite(Date.parse(evaluatedAt))) return blocked("context_invalid", ["Trusted host clock is malformed."]);
  const context = buildContext(firstState, validated.hostId, validated.plan, validated.expectedDecisionId, evaluatedAt, capabilityStates);
  const checkedContext = validatePermissionInvocationContext(context);
  if (checkedContext.state === "invalid") return blocked("context_invalid", checkedContext.errors);
  return { state: "ready", context: checkedContext.value };
}
