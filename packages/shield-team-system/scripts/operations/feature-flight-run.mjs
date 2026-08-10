#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { isProxy } from "node:util/types";

import { canonicalJson } from "../../dist/mission-v2.mjs";
import { createRunnerPermissionDecisionV1 } from "../../dist/permission-v1.mjs";
import { validateRunnerCycleInput, validateRunnerExecutorResult } from "../../dist/runner-v1.mjs";
import { loadSchema9PermissionContextV1 } from "../../dist/schema9-permission-context-v1.mjs";
import { launchExternalFixture } from "../../../../benchmarks/v0.3-fixture-host-launcher.mjs";
import { assertFlightState, assertResolvedPlan, validateImmediateTransition } from "./flight-contracts.mjs";
import {
  FEATURE_FLIGHT_REMOTE_NOTICE,
  FEATURE_FLIGHT_REMOTE_OBSERVER_POLICY,
  canonicalFeatureFlightBytes,
  featureFlightRemoteChallenge,
  normalizeFeatureFlightRemoteUrl,
  validateFeatureFlightRemoteObserverDescriptor,
} from "./feature-flight-recovery.mjs";
import {
  buildFeatureFlightMeasurementEnvelopeFromProjection,
  classifyFeatureFlightMeasurementPersistence,
  persistFeatureFlightMeasurement,
} from "./feature-flight-measurement.mjs";
import { runFeatureFlightStepV1 } from "./feature-flight-step.mjs";
import { strictParseJson } from "../model/strict-json.mjs";

export const FEATURE_FLIGHT_RUN_MANIFEST_CONTRACT = "shield.feature-flight-run-manifest";
export const FEATURE_FLIGHT_RUN_MANIFEST_VERSION = "1.0.0";
export const FEATURE_FLIGHT_FIXTURE_ID = "fixture:v0.3:external-acceptance:1";

const operationsRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(operationsRoot, "../../../..");
const fixtureRoot = join(repositoryRoot, "benchmarks/v0.3-external-acceptance-v1");
const fixtureIdentityPath = join(fixtureRoot, "fixture-identity-v1.json");
const adapterPath = join(fixtureRoot, "feature-flight-adapter.mjs");
const CONFIG_RELATIVE_PATH = ".shield/config.json";
const RAW_SHA256 = /^[a-f0-9]{64}$/u;
const GIT_REVISION = /^[a-f0-9]{40}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const MANIFEST_FIELDS = [
  "contract", "version", "plan", "state", "runnerInput", "releaseBaseline",
  "packageArtifact", "measurementIntentId", "sequence",
];
const MANIFEST_OPTIONAL_FIELDS = ["predecessor"];
const REFERENCE_FIELDS = ["path", "sha256"];
const CONFIG_FIELDS = [
  "schemaVersion", "repositoryId", "adapterId", "supportedSeatIds", "supportedModeIds",
  "trustedHumanBindingRefs", "paths",
];
const ADAPTER_DESCRIPTOR = Object.freeze({
  adapterId: "shield.daisy.readonly",
  adapterVersion: "1.0.0",
  capabilityClass: "read_only_coordination",
});
const execFile = promisify(execFileCallback);

const defaultDependencies = Object.freeze({
  lstat,
  open,
  realpath,
  filesystemConstants: fsConstants,
  loadPermissionContext: loadSchema9PermissionContextV1,
  runStep: runFeatureFlightStepV1,
  persistMeasurement: persistFeatureFlightMeasurement,
  launchExternalFixture,
  importAdapter: (sourceBytes) => import(`data:text/javascript;base64,${Buffer.from(sourceBytes).toString("base64")}`),
  now: () => new Date().toISOString(),
  execFile: async (command, args, options = {}) => {
    const result = await execFile(command, args, {
      ...options,
      encoding: options.encoding ?? "utf8",
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      timeout: options.timeout ?? 20_000,
      env: Object.freeze({ PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C" }),
    });
    return result.stdout;
  },
});

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, required, optional = [], label = "value") {
  if (!plain(value)) throw new Error(`${label} must be a strict plain object.`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : undefined;
    if (typeof key !== "string" || !allowed.has(key) || descriptor?.enumerable !== true ||
        !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
      throw new Error(`${label} contains an unknown or non-data field.`);
    }
  }
  for (const field of required) if (!Object.hasOwn(value, field)) throw new Error(`${label}.${field} is required.`);
  return value;
}

function deepFreeze(value) {
  if ((plain(value) || Array.isArray(value)) && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const identity = (snapshot) => Object.freeze({ path: snapshot.path, bytes: snapshot.bytes.length, sha256: snapshot.sha256 });
const owned = (status) => typeof process.geteuid !== "function" || status.uid === process.geteuid();
const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino &&
  left.mode === right.mode && left.uid === right.uid && left.gid === right.gid && left.size === right.size;

function canonicalAbsolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 || !isAbsolute(value) ||
      normalize(value) !== value || resolve(value) !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be a canonical absolute path.`);
  }
  return value;
}

function parseCapturedJson(snapshot, label, maxBytes = 16 * 1024 * 1024) {
  const parsed = strictParseJson(snapshot.bytes.toString("utf8"), { maxBytes, maxDepth: 128, rejectControlCharacters: false });
  if (parsed.state !== "valid") throw new Error(`${label} is malformed JSON: ${parsed.code}.`);
  return parsed.value;
}

function reference(value, label) {
  exact(value, REFERENCE_FIELDS, [], label);
  canonicalAbsolutePath(value.path, `${label}.path`);
  if (!RAW_SHA256.test(value.sha256 ?? "")) throw new Error(`${label}.sha256 must be a raw lowercase SHA-256 digest.`);
  return Object.freeze({ path: value.path, sha256: value.sha256 });
}

function manifestValue(value) {
  exact(value, MANIFEST_FIELDS, MANIFEST_OPTIONAL_FIELDS, "Feature Flight run manifest");
  if (value.contract !== FEATURE_FLIGHT_RUN_MANIFEST_CONTRACT || value.version !== FEATURE_FLIGHT_RUN_MANIFEST_VERSION) {
    throw new Error("Feature Flight run manifest contract or version is unsupported.");
  }
  if (!IDENTIFIER.test(value.measurementIntentId ?? "")) throw new Error("measurementIntentId is malformed.");
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) throw new Error("Manifest sequence is malformed.");
  return Object.freeze({
    contract: value.contract,
    version: value.version,
    plan: reference(value.plan, "manifest.plan"),
    state: reference(value.state, "manifest.state"),
    ...(Object.hasOwn(value, "predecessor") ? { predecessor: reference(value.predecessor, "manifest.predecessor") } : {}),
    runnerInput: reference(value.runnerInput, "manifest.runnerInput"),
    releaseBaseline: reference(value.releaseBaseline, "manifest.releaseBaseline"),
    packageArtifact: reference(value.packageArtifact, "manifest.packageArtifact"),
    measurementIntentId: value.measurementIntentId,
    sequence: value.sequence,
  });
}

async function captureFile(path, dependencies, seen, label) {
  canonicalAbsolutePath(path, label);
  const parent = dirname(path);
  const [canonicalParent, canonicalTarget, parentBefore, before] = await Promise.all([
    dependencies.realpath(parent).catch(() => undefined),
    dependencies.realpath(path).catch(() => undefined),
    dependencies.lstat(parent).catch(() => undefined),
    dependencies.lstat(path).catch(() => undefined),
  ]);
  if (canonicalParent !== parent || canonicalTarget !== path || !parentBefore?.isDirectory() || parentBefore.isSymbolicLink() ||
      !before?.isFile() || before.isSymbolicLink() || before.nlink !== 1 || !owned(before) ||
      (process.platform !== "win32" && (before.mode & 0o022) !== 0)) {
    throw new Error(`${label} is not a safe non-alias regular file.`);
  }
  const inode = `${before.dev}:${before.ino}`;
  if (seen.has(inode)) throw new Error(`${label} aliases another captured artifact.`);
  seen.add(inode);
  let handle;
  try {
    const constants = dependencies.filesystemConstants;
    if (!plain(constants) && constants !== fsConstants) throw new Error("Required secure-open constants are unavailable.");
    if (!Number.isInteger(constants?.O_RDONLY) || constants.O_RDONLY < 0 ||
        !Number.isInteger(constants?.O_NOFOLLOW) || constants.O_NOFOLLOW <= 0 ||
        !Number.isInteger(constants?.O_NONBLOCK) || constants.O_NONBLOCK <= 0) {
      throw new Error("Required O_NOFOLLOW and O_NONBLOCK secure-open semantics are unavailable.");
    }
    handle = await dependencies.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || !owned(opened) || !sameIdentity(before, opened)) {
      throw new Error(`${label} identity changed while opening.`);
    }
    await dependencies.beforeRead?.({ path, handle, label });
    const bytes = Buffer.from(await handle.readFile());
    await dependencies.afterRead?.({ path, handle, label, bytes });
    const [retained, after, parentAfter, canonicalParentAfter, canonicalTargetAfter] = await Promise.all([
      handle.stat(), dependencies.lstat(path).catch(() => undefined), dependencies.lstat(parent).catch(() => undefined),
      dependencies.realpath(parent).catch(() => undefined), dependencies.realpath(path).catch(() => undefined),
    ]);
    if (!retained.isFile() || !after?.isFile() || after.isSymbolicLink() || after.nlink !== 1 ||
        !sameIdentity(opened, retained) || !sameIdentity(opened, after) || retained.size !== bytes.length ||
        !parentAfter?.isDirectory() || parentAfter.isSymbolicLink() || parentAfter.dev !== parentBefore.dev || parentAfter.ino !== parentBefore.ino ||
        canonicalParentAfter !== parent || canonicalTargetAfter !== path) {
      throw new Error(`${label} identity changed during capture.`);
    }
    return Object.freeze({ path, bytes, sha256: sha256(bytes), stat: opened, parent, parentStat: parentBefore });
  } finally {
    await handle?.close();
  }
}

function snapshotDependenciesFor(snapshots) {
  const byPath = new Map(snapshots.map((snapshot) => [snapshot.path, snapshot]));
  const parents = new Map(snapshots.map((snapshot) => [snapshot.parent, snapshot.parentStat]));
  return Object.freeze({
    realpath: async (path) => byPath.has(path) || parents.has(path) ? path : Promise.reject(Object.assign(new Error("snapshot_path_unavailable"), { code: "ENOENT" })),
    lstat: async (path) => byPath.get(path)?.stat ?? parents.get(path) ?? Promise.reject(Object.assign(new Error("snapshot_path_unavailable"), { code: "ENOENT" })),
    open: async (path) => {
      const snapshot = byPath.get(path);
      if (!snapshot) throw Object.assign(new Error("snapshot_path_unavailable"), { code: "ENOENT" });
      let closed = false;
      return {
        stat: async () => { if (closed) throw new Error("snapshot_handle_closed"); return snapshot.stat; },
        readFile: async () => { if (closed) throw new Error("snapshot_handle_closed"); return Buffer.from(snapshot.bytes); },
        close: async () => { closed = true; },
      };
    },
  });
}

function configValue(value) {
  exact(value, CONFIG_FIELDS, [], "repository configuration");
  exact(value.paths, ["journals", "artifacts", "reports", "temp"], [], "repository configuration paths");
  const safeRelative = (entry) => typeof entry === "string" && entry.length > 0 && !isAbsolute(entry) && normalize(entry) === entry &&
    !entry.split(/[\\/]/u).includes("..");
  if (value.schemaVersion !== 1 || typeof value.repositoryId !== "string" || value.repositoryId.length === 0 || value.adapterId !== "github" ||
      !Object.values(value.paths).every(safeRelative)) {
    throw new Error("Repository configuration is malformed.");
  }
  return value;
}

function inside(root, path) {
  const relation = relative(root, path);
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

function assertApprovedReadBindings(approvedReadRoots, paths) {
  if (!Array.isArray(approvedReadRoots) || approvedReadRoots.length === 0 ||
      paths.some((path) => !approvedReadRoots.some((root) => typeof root === "string" && inside(root, path)))) {
    throw new Error("Captured proving artifacts are not fully bound by signed Daisy approved read roots.");
  }
}

function runnerIntent(input) {
  const plan = { ...input.plan };
  delete plan.effectKey;
  return deepFreeze({
    runnerContractVersion: input.runnerContractVersion,
    projection: structuredClone(input.projection),
    resolvedModeContext: structuredClone(input.resolvedModeContext),
    actionAllowlist: structuredClone(input.actionAllowlist),
    plan,
  });
}

export function deriveFeatureFlightProvingTupleV1(input) {
  exact(input, [
    "planDigest", "flightId", "fixtureRoot", "fixtureIdentityDigest", "adapterPath", "adapterDigest",
    "releaseBaselineDigest", "packageDigest", "repository", "branch", "headRevision", "mission",
    "subject", "missionRevision", "measurementIntentId", "runnerIntent",
  ], [], "Feature Flight proving tuple input");
  const tuple = deepFreeze({
    domain: "shield.feature-flight.proving-tuple.v1",
    plan: { sha256: input.planDigest, flightId: input.flightId },
    fixture: { id: FEATURE_FLIGHT_FIXTURE_ID, root: input.fixtureRoot, identitySha256: input.fixtureIdentityDigest },
    adapter: { path: input.adapterPath, sha256: input.adapterDigest },
    releaseBaselineSha256: input.releaseBaselineDigest,
    packageSha256: input.packageDigest,
    repository: input.repository,
    branch: input.branch,
    headRevision: input.headRevision,
    mission: input.mission,
    subject: input.subject,
    missionRevision: input.missionRevision,
    measurementIntentId: input.measurementIntentId,
    runnerIntent: structuredClone(input.runnerIntent),
  });
  return Object.freeze({ tuple, effectKey: sha256(Buffer.from(canonicalJson(tuple), "utf8")) });
}

async function gitValue(dependencies, cwd, args, encoding = "utf8") {
  const value = await dependencies.execFile("git", ["-C", cwd, ...args], { cwd, encoding });
  return Buffer.isBuffer(value) ? value : String(value);
}

async function observeRepository(dependencies, root) {
  const [canonicalRoot, branch, head, status, gitDirectory, remoteUrl] = await Promise.all([
    dependencies.realpath(root),
    gitValue(dependencies, root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    gitValue(dependencies, root, ["rev-parse", "HEAD"]),
    gitValue(dependencies, root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], "buffer"),
    gitValue(dependencies, root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    gitValue(dependencies, root, ["remote", "get-url", "origin"]),
  ]);
  const canonicalGitDirectory = await dependencies.realpath(String(gitDirectory).trim());
  const gitStatus = await dependencies.lstat(canonicalGitDirectory);
  return Object.freeze({
    root: canonicalRoot,
    branch: String(branch).trim(),
    head: String(head).trim(),
    clean: Buffer.isBuffer(status) ? status.length === 0 : String(status).length === 0,
    commonGitDirectory: canonicalGitDirectory,
    commonGitDevice: gitStatus.dev,
    commonGitInode: gitStatus.ino,
    configuredRemoteUrl: String(remoteUrl).trim(),
  });
}

async function observeRemoteBranch(dependencies, descriptor, request) {
  const output = String(await dependencies.execFile("git", ["-C", request.repositoryRoot, "ls-remote", "--refs", descriptor.remoteName, request.fullRef], {
    cwd: request.repositoryRoot,
  })).trim();
  const lines = output.length === 0 ? [] : output.split("\n");
  if (lines.length > 1) throw new Error("remote_ref_ambiguous");
  let remoteHead = null;
  if (lines.length === 1) {
    const fields = lines[0].split("\t");
    if (fields.length !== 2 || fields[1] !== request.fullRef || !GIT_REVISION.test(fields[0])) throw new Error("remote_ref_malformed");
    remoteHead = fields[0];
  }
  return Object.freeze({
    schemaVersion: 1,
    artifactType: "feature-flight-remote-observation",
    contractVersion: "2.0.0",
    authority: "none",
    notice: FEATURE_FLIGHT_REMOTE_NOTICE,
    repositoryRoot: descriptor.repositoryRoot,
    commonGitDirectory: descriptor.commonGitDirectory,
    commonGitDevice: descriptor.commonGitDevice,
    commonGitInode: descriptor.commonGitInode,
    observer: Object.freeze({
      observerId: descriptor.observerId,
      observerVersion: descriptor.observerVersion,
      runtimeId: descriptor.runtimeId,
      executorId: descriptor.executorId,
    }),
    remoteName: descriptor.remoteName,
    remoteUrlIdentity: descriptor.remoteUrlIdentity,
    fullRef: request.fullRef,
    remoteHead,
    observedAt: dependencies.now(),
    phase: request.phase,
    challenge: request.challenge,
  });
}

function assertPermissionBinding({ permission, runner, config, mission, state, provingEffectKey }) {
  if (permission?.state !== "ready" || !Object.hasOwn(permission, "daisyCoordination")) {
    throw new Error(`Daisy permission context is not ready: ${permission?.code ?? "unknown"}.`);
  }
  const context = permission.context;
  const coordination = permission.daisyCoordination;
  const bindings = context.activeBindings;
  if (!Array.isArray(bindings) || bindings.length !== 1 || bindings[0].seatId !== "daisy" ||
      context.missionId !== runner.plan.missionId || context.subjectId !== runner.plan.subjectId ||
      context.missionRevisionId !== runner.plan.revisionId || context.evaluatedThroughSequence !== runner.plan.evaluatedThroughSequence ||
      context.reasoningRuntimeId !== coordination.runtimeId || context.toolExecutorId !== coordination.executorId ||
      context.repositoryId !== config.repositoryId || context.branch !== mission.branch ||
      context.artifactRevisionId !== state.missions[mission.id].revision ||
      context.canonicalWritableRoot !== coordination.durableArtifactRoot ||
      bindings[0].bindingId !== coordination.bindingId || bindings[0].bindingVersion !== coordination.bindingVersion ||
      bindings[0].reasoningRuntimeId !== coordination.runtimeId || bindings[0].toolExecutorId !== coordination.executorId ||
      bindings[0].repositoryId !== config.repositoryId || bindings[0].branch !== mission.branch ||
      bindings[0].artifactRevisionId !== state.missions[mission.id].revision ||
      bindings[0].canonicalWritableRoot !== coordination.durableArtifactRoot ||
      bindings[0].approvedScope.effectKeys.length !== 1 || bindings[0].approvedScope.effectKeys[0] !== provingEffectKey ||
      runner.plan.effectKey !== provingEffectKey) {
    throw new Error("Daisy permission, authority, binding, Runner, or host identity does not exact-match.");
  }
  const identities = ["daisy", coordination.runtimeId, coordination.modelId, coordination.executorId];
  if (new Set(identities).size !== identities.length || runner.projection.participantSeatIds.some((seat) =>
    [coordination.runtimeId, coordination.modelId, coordination.executorId].includes(seat))) {
    throw new Error("Daisy runtime, model, executor, and participant identities are not distinct.");
  }
  return Object.freeze({ context: deepFreeze(structuredClone(context)), coordination: deepFreeze(structuredClone(coordination)) });
}

function validatorResult(plan, executorResult) {
  const checked = validateRunnerExecutorResult(executorResult);
  return {
    runnerContractVersion: 1,
    outcome: checked.state === "valid" && checked.value.outcome === "completed" ? "passed" : "failed",
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    revisionId: plan.revisionId,
    evaluatedThroughSequence: plan.evaluatedThroughSequence,
    cycleId: plan.cycleId,
    validationId: plan.validationId,
    effectKey: plan.effectKey,
    summary: checked.state === "valid" && checked.value.outcome === "completed"
      ? "External fixture executor result is valid and completed."
      : "External fixture executor result did not validate as completed.",
  };
}

function outcomeAttemptDigest(projection) {
  return projection.terminal?.attemptDigest ?? projection.recoveryReceipt?.attemptDigest ?? projection.attemptDigest ?? null;
}

function measurementSnapshot({ prepared, permission, projection, commandStartAt, commandCompletedAt }) {
  const attemptDigest = outcomeAttemptDigest(projection);
  if (!RAW_SHA256.test(attemptDigest ?? "")) throw new Error("Durable step projection does not expose an exact attempt digest.");
  return deepFreeze({
    measurementIntentId: prepared.manifest.measurementIntentId,
    durableArtifactRoot: permission.coordination.durableArtifactRoot,
    effectClaimId: projection.effectClaimId,
    attemptDigest,
    commandStartAt,
    commandCompletedAt,
    packetByteCount: prepared.runnerSnapshot.bytes.length,
    packetDigest: prepared.runnerSnapshot.sha256,
    mission: prepared.runner.plan.missionId,
    subject: prepared.runner.plan.subjectId,
    missionRevision: prepared.runner.plan.revisionId,
    repository: permission.context.repositoryId,
    branch: permission.context.branch,
    headRevision: permission.context.artifactRevisionId,
    plan: identity(prepared.planSnapshot),
    state: identity(prepared.stateSnapshot),
    predecessor: prepared.predecessorSnapshot === null ? null : identity(prepared.predecessorSnapshot),
    runnerInput: identity(prepared.runnerSnapshot),
    fixture: identity(prepared.fixtureIdentitySnapshot),
    package: identity(prepared.packageSnapshot),
    authority: {
      type: "daisy_feature_flight_coordination",
      digest: permission.coordination.authorityDigest,
      gateEligible: false,
      sequence: permission.coordination.authoritySequence,
    },
    binding: {
      bindingId: permission.coordination.bindingId,
      runtime: permission.coordination.runtimeId,
      executor: permission.coordination.executorId,
      seat: "daisy",
    },
    seat: "daisy",
    adapter: `adapter:sha256:${prepared.adapterSnapshot.sha256}`,
    runtime: permission.coordination.runtimeId,
    model: permission.coordination.modelId,
    executor: permission.coordination.executorId,
  });
}

export async function prepareFeatureFlightRunV1({ manifestPath }, injectedDependencies = {}) {
  const dependencies = Object.freeze({ ...defaultDependencies, ...injectedDependencies });
  const seen = new Set();
  const manifestSnapshot = await captureFile(manifestPath, dependencies, seen, "Feature Flight run manifest");
  const manifest = manifestValue(parseCapturedJson(manifestSnapshot, "Feature Flight run manifest"));
  const references = [manifest.plan, manifest.state, manifest.runnerInput, manifest.releaseBaseline, manifest.packageArtifact];
  if (manifest.predecessor) references.splice(2, 0, manifest.predecessor);
  const captured = new Map();
  for (const item of references) captured.set(item.path, await captureFile(item.path, dependencies, seen, `Referenced artifact ${item.path}`));
  const fixtureIdentitySnapshot = await captureFile(fixtureIdentityPath, dependencies, seen, "Fixed fixture identity");
  const adapterSnapshot = await captureFile(adapterPath, dependencies, seen, "Fixed Feature Flight adapter");
  for (const item of references) {
    if (captured.get(item.path).sha256 !== item.sha256) throw new Error(`Declared digest does not match captured bytes: ${item.path}`);
  }

  const planSnapshot = captured.get(manifest.plan.path);
  const stateSnapshot = captured.get(manifest.state.path);
  const predecessorSnapshot = manifest.predecessor ? captured.get(manifest.predecessor.path) : null;
  const runnerSnapshot = captured.get(manifest.runnerInput.path);
  const baselineSnapshot = captured.get(manifest.releaseBaseline.path);
  const packageSnapshot = captured.get(manifest.packageArtifact.path);
  const plan = assertResolvedPlan(parseCapturedJson(planSnapshot, "Feature Flight plan"));
  const state = assertFlightState(plan, identity(planSnapshot), parseCapturedJson(stateSnapshot, "Feature Flight state"));
  const predecessor = predecessorSnapshot === null ? null
    : assertFlightState(plan, identity(planSnapshot), parseCapturedJson(predecessorSnapshot, "Feature Flight predecessor"), "predecessor");
  if (state.sequence !== manifest.sequence || (state.sequence === 0) !== (predecessor === null) ||
      (predecessor !== null && (predecessor.sequence !== state.sequence - 1 || state.predecessorSha256 !== predecessorSnapshot.sha256 ||
        validateImmediateTransition(plan, predecessor, state).length !== 0))) {
    throw new Error("Manifest sequence and predecessor lineage do not exact-match.");
  }
  const runnerValue = parseCapturedJson(runnerSnapshot, "Runner input");
  const checkedRunner = validateRunnerCycleInput(runnerValue);
  if (checkedRunner.state !== "valid" || !runnerSnapshot.bytes.equals(Buffer.from(canonicalJson(runnerValue), "utf8"))) {
    throw new Error("Runner input is malformed or non-canonical.");
  }
  const runner = deepFreeze(structuredClone(checkedRunner.value));
  const mission = plan.missions.find(({ id }) => id === runner.plan.missionId);
  if (!mission || state.missions[mission.id]?.status !== "active") throw new Error("Runner mission is not the one active Feature Flight mission.");
  if (plan.evaluationContract.fixtureId !== FEATURE_FLIGHT_FIXTURE_ID || plan.evaluationContract.version !== 1) {
    throw new Error("Feature Flight plan does not bind the fixed external-acceptance fixture.");
  }

  const configPath = join(mission.worktree, CONFIG_RELATIVE_PATH);
  const configSnapshot = await captureFile(configPath, dependencies, seen, "Active repository configuration");
  const config = configValue(parseCapturedJson(configSnapshot, "Active repository configuration"));
  const baseline = parseCapturedJson(baselineSnapshot, "Release baseline");
  const fixtureIdentity = parseCapturedJson(fixtureIdentitySnapshot, "Fixture identity");
  if (!plain(baseline) || baseline.kind !== "fixture-release-baseline" ||
      baseline.schemaVersion !== "shield.fixture.release-baseline.v1" ||
      baseline.identityRecordDigest !== fixtureIdentitySnapshot.sha256 ||
      !plain(baseline.package) || baseline.package.digestAlgorithm !== "sha256" ||
      baseline.package.digest !== packageSnapshot.sha256 || !same(fixtureIdentity, parseCapturedJson(fixtureIdentitySnapshot, "Fixture identity"))) {
    throw new Error("Captured fixture, release baseline, and package identities do not exact-match.");
  }
  const proving = deriveFeatureFlightProvingTupleV1({
    planDigest: planSnapshot.sha256,
    flightId: plan.flightId,
    fixtureRoot,
    fixtureIdentityDigest: fixtureIdentitySnapshot.sha256,
    adapterPath,
    adapterDigest: adapterSnapshot.sha256,
    releaseBaselineDigest: baselineSnapshot.sha256,
    packageDigest: packageSnapshot.sha256,
    repository: config.repositoryId,
    branch: mission.branch,
    headRevision: state.missions[mission.id].revision,
    mission: runner.plan.missionId,
    subject: runner.plan.subjectId,
    missionRevision: runner.plan.revisionId,
    measurementIntentId: manifest.measurementIntentId,
    runnerIntent: runnerIntent(runner),
  });
  if (runner.plan.effectKey !== proving.effectKey) throw new Error("Runner effect key does not match the signed proving tuple.");

  const configuredJournalPath = join(mission.worktree, config.paths.journals,
    `${Buffer.from(runner.plan.missionId, "utf8").toString("base64url")}.jsonl`);
  const permissionRaw = await dependencies.loadPermissionContext({
    repositoryRoot: mission.worktree,
    configuredJournalPath,
    missionId: runner.plan.missionId,
    expectedDecisionId: `decision:${runner.plan.cycleId}`,
    plan: runner.plan,
    hostId: "host:shield-ops-feature-flight-run",
    trustedHostOps: {
      probeCapability: async (capability) => capability === "read_only_coordination",
      now: dependencies.now,
    },
  });
  const permission = assertPermissionBinding({ permission: permissionRaw, runner, config, mission, state, provingEffectKey: proving.effectKey });
  assertApprovedReadBindings(permission.coordination.approvedReadRoots, [
    manifestSnapshot.path, planSnapshot.path, stateSnapshot.path,
    ...(predecessorSnapshot === null ? [] : [predecessorSnapshot.path]),
    runnerSnapshot.path, baselineSnapshot.path, packageSnapshot.path, configSnapshot.path,
    fixtureIdentitySnapshot.path, adapterSnapshot.path,
  ]);
  const observed = await observeRepository(dependencies, mission.worktree);
  if (observed.root !== mission.worktree || observed.branch !== mission.branch || observed.head !== state.missions[mission.id].revision ||
      observed.clean !== true || normalizeFeatureFlightRemoteUrl(observed.configuredRemoteUrl).split("/").slice(-2).join("/") !== config.repositoryId) {
    throw new Error("Host-observed repository identity does not exact-match the signed proving tuple.");
  }
  const adapterDescriptor = Object.freeze({ ...ADAPTER_DESCRIPTOR, runtimeId: permission.coordination.runtimeId, executorId: permission.coordination.executorId });
  const remoteObserverDescriptor = validateFeatureFlightRemoteObserverDescriptor(Object.freeze({
    ...FEATURE_FLIGHT_REMOTE_OBSERVER_POLICY,
    runtimeId: permission.coordination.runtimeId,
    executorId: permission.coordination.executorId,
    repositoryRoot: observed.root,
    commonGitDirectory: observed.commonGitDirectory,
    commonGitDevice: observed.commonGitDevice,
    commonGitInode: observed.commonGitInode,
    configuredRemoteUrl: observed.configuredRemoteUrl,
    remoteUrlIdentity: normalizeFeatureFlightRemoteUrl(observed.configuredRemoteUrl),
  }));
  const operatorInput = deepFreeze({
    packageArtifactPath: packageSnapshot.path,
    externalRepositoryRoot: mission.worktree,
    baseRevision: plan.repository.baseRevision,
    headRevision: state.missions[mission.id].revision,
    hostConfiguration: { adapterId: "github", repository: config.repositoryId, branch: mission.branch },
    blindStatus: "partially-informed",
    priorSolutionsVisible: false,
    requireSimmons: runner.projection.participantSeatIds.includes("simmons"),
  });
  const launcherHostContext = Object.freeze({
    baselineBytes: baselineSnapshot.bytes,
    authoritativeReceiptJournalPath: null,
    attributionContext: null,
    toolingContext: null,
  });
  const adapterContext = Object.freeze({ fixtureRoot, operatorInput, releaseBaselineBytes: baselineSnapshot.bytes, launcherHostContext });
  return Object.freeze({
    dependencies, manifest, plan, state, predecessor, runner, mission, config, permission, proving,
    manifestSnapshot, planSnapshot, stateSnapshot, predecessorSnapshot, runnerSnapshot, baselineSnapshot,
    packageSnapshot, fixtureIdentitySnapshot, adapterSnapshot, adapterDescriptor, remoteObserverDescriptor,
    observedRepository: observed, operatorInput, launcherHostContext, adapterContext,
    snapshots: snapshotDependenciesFor([planSnapshot, stateSnapshot, ...(predecessorSnapshot ? [predecessorSnapshot] : [])]),
  });
}

export async function runFeatureFlightProductionV1(input, injectedDependencies = {}) {
  const commandStartAt = (injectedDependencies.now ?? defaultDependencies.now)();
  const prepared = await prepareFeatureFlightRunV1(input, injectedDependencies);
  const dependencies = prepared.dependencies;
  const stepInput = {
    planPath: prepared.planSnapshot.path,
    expectedPlanSha256: prepared.planSnapshot.sha256,
    statePath: prepared.stateSnapshot.path,
    expectedStateSha256: prepared.stateSnapshot.sha256,
    expectedStateSequence: prepared.manifest.sequence,
    ...(prepared.predecessorSnapshot === null ? {} : {
      predecessorStatePath: prepared.predecessorSnapshot.path,
      expectedPredecessorSha256: prepared.predecessorSnapshot.sha256,
    }),
    maxSteps: 1,
    routing: { flightId: prepared.plan.flightId, missionId: prepared.runner.plan.missionId },
  };
  let importCount = 0;
  let launcherCount = 0;
  const projection = await dependencies.runStep(stepInput, Object.freeze({
    loadRunnerCycleInput: async () => ({
      input: prepared.runner,
      canonicalBytes: prepared.runnerSnapshot.bytes,
      sha256: prepared.runnerSnapshot.sha256,
    }),
    authorizeRunner: async (plan) => createRunnerPermissionDecisionV1(plan, prepared.permission.context),
    invokeDaisyAdapter: async (plan, decision) => {
      importCount += 1;
      if (importCount !== 1) throw new Error("adapter_import_count_exceeded");
      const namespace = await dependencies.importAdapter(prepared.adapterSnapshot.bytes);
      if (!plain(namespace) && Object.prototype.toString.call(namespace) !== "[object Module]") throw new Error("adapter_module_malformed");
      const exports = Object.keys(namespace);
      if (exports.length !== 1 || exports[0] !== "createFeatureFlightAdapterV1" || typeof namespace.createFeatureFlightAdapterV1 !== "function") {
        throw new Error("adapter_module_surface_malformed");
      }
      const adapter = namespace.createFeatureFlightAdapterV1({
        launchExternalFixture: async (launcherInput) => {
          launcherCount += 1;
          if (launcherCount !== 1) throw new Error("launcher_count_exceeded");
          return dependencies.launchExternalFixture(launcherInput);
        },
      });
      return adapter(plan, decision, prepared.adapterContext);
    },
    validateDaisyResult: async (plan, result) => validatorResult(plan, result),
    observeRepository: async () => observeRepository(dependencies, prepared.mission.worktree),
    observeRemoteBranch: async (request) => observeRemoteBranch(dependencies, prepared.remoteObserverDescriptor, request),
    adapterDescriptor: prepared.adapterDescriptor,
    remoteObserverDescriptor: prepared.remoteObserverDescriptor,
    claimStoreRoot: prepared.permission.coordination.durableArtifactRoot,
    clock: Object.freeze({ now: async () => dependencies.now() }),
    snapshotDependencies: prepared.snapshots,
  }));

  const measurementProjection = projection && typeof projection === "object" ? Object.freeze({
    ...projection,
    reason: projection.reason ?? (projection.outcome === "completed" ? "effect_completed" : projection.outcome === "replayed" ? "terminal_replayed" : "step_outcome_unavailable"),
    durable: projection.durable === true || projection.outcome === "completed" || projection.outcome === "replayed",
  }) : projection;
  const measurementPersistence = classifyFeatureFlightMeasurementPersistence({ outcome: measurementProjection?.outcome, durable: measurementProjection?.durable });
  if (measurementPersistence === null) {
    return Object.freeze({
      state: "not_completed",
      projection,
      measurement: null,
      exitCode: 1,
      counts: Object.freeze({ import: importCount, launcher: launcherCount, measurement: 0 }),
    });
  }
  const commandCompletedAt = dependencies.now();
  const snapshot = measurementSnapshot({ prepared, permission: prepared.permission, projection, commandStartAt, commandCompletedAt });
  let measurement;
  let measurementCount = 0;
  try {
    buildFeatureFlightMeasurementEnvelopeFromProjection({ projection: measurementProjection, ...snapshot });
    measurementCount += 1;
    measurement = await dependencies.persistMeasurement({ projection: measurementProjection, snapshot });
  } catch (error) {
    measurement = Object.freeze({
      state: "recovery_required",
      reason: error instanceof Error ? error.message : String(error),
    });
  }
  const measurementDurable = measurement?.state === "created" || measurement?.state === "replayed";
  const stepSuccessful = projection.outcome === "completed" || projection.outcome === "replayed";
  return Object.freeze({
    state: stepSuccessful && measurementDurable ? "completed" : "recovery_required",
    projection,
    measurement,
    exitCode: stepSuccessful && measurementDurable ? 0 : 1,
    counts: Object.freeze({ import: importCount, launcher: launcherCount, measurement: measurementCount }),
  });
}

export function parseFeatureFlightRunArguments(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv.length !== 2 || argv[0] !== "--input" || typeof argv[1] !== "string" || argv[1].length === 0) {
    throw new Error("Usage: shield-ops flight run --input FILE");
  }
  return { help: false, manifestPath: resolve(argv[1]) };
}

export async function featureFlightRunMain(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseFeatureFlightRunArguments(argv);
  } catch (error) {
    process.stderr.write(`SHIELD flight run: ${error.message}\n`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write("Usage: shield-ops flight run --input FILE\n");
    return 0;
  }
  try {
    const result = await runFeatureFlightProductionV1({ manifestPath: parsed.manifestPath });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.exitCode;
  } catch (error) {
    process.stderr.write(`SHIELD flight run: rejected before effects: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await featureFlightRunMain();
}
