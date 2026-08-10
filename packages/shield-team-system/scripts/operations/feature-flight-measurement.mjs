import { constants as fsConstants } from "node:fs";
import { isProxy } from "node:util/types";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";

import { canonicalFeatureFlightBytes, validateFeatureFlightTimestamp } from "./feature-flight-recovery.mjs";
import { strictParseJson } from "../model/strict-json.mjs";

export const FEATURE_FLIGHT_MEASUREMENT_SCHEMA_VERSION = 1;
export const FEATURE_FLIGHT_MEASUREMENT_CONTRACT_VERSION = "1.0.0";
export const FEATURE_FLIGHT_MEASUREMENT_ARTIFACT_TYPE = "feature-flight-measurement";
export const FEATURE_FLIGHT_MEASUREMENT_NAMESPACE = ".shield/feature-flight-measurements";
export const FEATURE_FLIGHT_MEASUREMENT_NOTICE = "Read-only feature-flight measurement projection only. This record cannot authorize, review, complete, route, publish, or accept a mission and grants no merge, deploy, or release rights.";

const HASH = /^[a-f0-9]{64}$/u;
const GIT_REVISION = /^[a-f0-9]{40}$/u;
const PATH_LIMIT = 4096;
const OUTCOME = new Set(["completed", "replayed", "recovery_required", "legacy_replayed", "stopped", "malformed", "uncertain"]);
const PERSISTENCE = new Set(["fresh", "replay", "recovery"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const IDENTITY_FIELDS = ["path", "bytes", "sha256"];
const AUTHORITY_FIELDS = ["type", "digest", "gateEligible", "sequence"];
const BINDING_FIELDS = ["bindingId", "runtime", "executor", "seat"];

const defaultDependencies = {
  lstat,
  mkdir,
  open,
  realpath,
  noFollowFlag: fsConstants.O_NOFOLLOW,
  sync: (handle) => handle.sync(),
  close: (handle) => handle.close(),
  write: async (handle, bytes) => {
    const { bytesWritten } = await handle.write(bytes, 0, bytes.length, 0);
    if (bytesWritten !== bytes.length) {
      throw new Error("measurement_write_incomplete");
    }
  },
  read: (handle) => handle.readFile(),
  beforeRead: undefined,
  afterRead: undefined,
  beforeWrite: undefined,
  afterWrite: undefined,
};

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isPlainObject = (value) =>
  value !== null && typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype &&
  !isProxy(value);

const freezeDeep = (value) => {
  if (isPlainObject(value) || Array.isArray(value)) {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
};

const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};

const exactObject = (value, required, optional = [], label) => {
  ensure(isPlainObject(value), `${label} must be strict plain object.`);
  ensure(Object.getOwnPropertySymbols(value).length === 0, `${label} must not include symbols.`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    ensure(allowed.has(key), `${label} has unknown field ${key}.`);
    ensure(descriptor?.enumerable === true, `${label}.${key} must be enumerable.`);
    ensure(Object.hasOwn(descriptor ?? {}, "value"), `${label}.${key} must be a data field.`);
    ensure(descriptor.value !== undefined, `${label}.${key} may not be undefined.`);
  }
  for (const key of required) ensure(Object.hasOwn(value, key), `${label}.${key} is required.`);
  return value;
};

const canonicalPath = (value, label) => {
  ensure(typeof value === "string", `${label} must be a string.`);
  ensure(value.length > 0 && value.length <= PATH_LIMIT, `${label} length is invalid.`);
  ensure(!/[\u0000-\u001f\u007f]/u.test(value), `${label} contains control characters.`);
  ensure(isAbsolute(value), `${label} must be absolute.`);
  ensure(normalize(value) === value, `${label} must be canonical.`);
  ensure(resolve(value) === value, `${label} must be canonical.`);
  return value;
};

const identity = (value, label) => {
  exactObject(value, IDENTITY_FIELDS, [], `${label}.identity`);
  canonicalPath(value.path, `${label}.identity.path`);
  ensure(Number.isSafeInteger(value.bytes) && value.bytes >= 0, `${label}.identity.bytes is malformed.`);
  ensure(HASH.test(value.sha256 ?? ""), `${label}.identity.sha256 is malformed.`);
  return value;
};

const validateEnvelopeShape = (value) => {
  exactObject(value, [
    "measurementIntentId", "durableArtifactRoot", "effectClaimId", "attemptDigest", "mission", "subject", "missionRevision",
    "repository", "branch", "headRevision", "plan", "state", "predecessor", "runnerInput", "fixture", "package",
    "authority", "binding", "seat", "adapter", "runtime", "model", "executor",
    "stepOutcome", "stepReason", "stepDurable", "measurementPersistence",
    "commandStartAt", "commandCompletedAt", "packetByteCount", "packetDigest",
    "processedInput", "generatedOutput", "reasoningToken", "uniqueInjectedContext", "contextChainPosition",
    "hillAction", "retryCount", "correctionCount", "interventionCount", "cancellation", "providerCounter",
  ], [], "measurement envelope");
  ensure(IDENTIFIER.test(value.measurementIntentId ?? ""), "measurementIntentId is malformed.");
  canonicalPath(value.durableArtifactRoot, "durableArtifactRoot");
  ensure(HASH.test(value.effectClaimId ?? ""), "effectClaimId is malformed.");
  ensure(HASH.test(value.attemptDigest ?? ""), "attemptDigest is malformed.");
  ensure(typeof value.mission === "string" && value.mission.length > 0, "mission must be a non-empty string.");
  ensure(typeof value.subject === "string" && value.subject.length > 0, "subject must be a non-empty string.");
  ensure(HASH.test(value.missionRevision ?? ""), "missionRevision is malformed.");
  ensure(typeof value.repository === "string" && value.repository.length > 0, "repository must be a non-empty string.");
  ensure(typeof value.branch === "string" && value.branch.length > 0, "branch must be a non-empty string.");
  ensure(GIT_REVISION.test(value.headRevision ?? ""), "headRevision is malformed.");
  identity(value.plan, "plan");
  identity(value.state, "state");
  if (value.predecessor !== null) identity(value.predecessor, "predecessor");
  identity(value.runnerInput, "runnerInput");
  identity(value.fixture, "fixture");
  identity(value.package, "package");
  exactObject(value.authority, AUTHORITY_FIELDS, ["identity"], "authority");
  ensure(typeof value.authority.gateEligible === "boolean", "authority.gateEligible must be boolean.");
  exactObject(value.binding, BINDING_FIELDS, ["identity"], "binding");
  ensure(IDENTIFIER.test(value.seat ?? ""), "seat is malformed.");
  ensure(IDENTIFIER.test(value.adapter ?? ""), "adapter is malformed.");
  ensure(IDENTIFIER.test(value.runtime ?? ""), "runtime is malformed.");
  ensure(IDENTIFIER.test(value.model ?? ""), "model is malformed.");
  ensure(IDENTIFIER.test(value.executor ?? ""), "executor is malformed.");
  ensure(value.runtime !== value.executor, "runtime and executor must be distinct.");
  ensure(OUTCOME.has(value.stepOutcome), "stepOutcome is malformed.");
  ensure(typeof value.stepReason === "string" && value.stepReason.length > 0, "stepReason is malformed.");
  ensure(typeof value.stepDurable === "boolean", "stepDurable must be boolean.");
  ensure(PERSISTENCE.has(value.measurementPersistence), "measurementPersistence is malformed.");
  validateFeatureFlightTimestamp(value.commandStartAt, "commandStartAt");
  validateFeatureFlightTimestamp(value.commandCompletedAt, "commandCompletedAt");
  ensure(Date.parse(value.commandCompletedAt) >= Date.parse(value.commandStartAt), "command timestamps are not ordered.");
  ensure(Number.isSafeInteger(value.packetByteCount) && value.packetByteCount >= 0, "packetByteCount is malformed.");
  ensure(HASH.test(value.packetDigest ?? ""), "packetDigest is malformed.");
  ensure(value.processedInput === null || typeof value.processedInput === "string", "processedInput must be string or null.");
  ensure(value.generatedOutput === null || typeof value.generatedOutput === "string", "generatedOutput must be string or null.");
  ensure(value.reasoningToken === null || typeof value.reasoningToken === "string", "reasoningToken must be string or null.");
  ensure(value.uniqueInjectedContext === null || typeof value.uniqueInjectedContext === "string", "uniqueInjectedContext must be string or null.");
  ensure(value.contextChainPosition === null || Number.isSafeInteger(value.contextChainPosition), "contextChainPosition must be integer or null.");
  ensure(value.hillAction === null || typeof value.hillAction === "string", "hillAction must be string or null.");
  ensure(value.retryCount === null || (Number.isSafeInteger(value.retryCount) && value.retryCount >= 0), "retryCount must be non-negative integer or null.");
  ensure(value.correctionCount === null || (Number.isSafeInteger(value.correctionCount) && value.correctionCount >= 0), "correctionCount must be non-negative integer or null.");
  ensure(value.interventionCount === null || (Number.isSafeInteger(value.interventionCount) && value.interventionCount >= 0), "interventionCount must be non-negative integer or null.");
  ensure(value.cancellation === null || isPlainObject(value.cancellation), "cancellation must be object or null.");
  ensure(value.providerCounter === null || typeof value.providerCounter === "string", "providerCounter must be string or null.");
  return value;
};

const measurementTuple = (snapshot) => ({
  mission: snapshot.mission,
  subject: snapshot.subject,
  missionRevision: snapshot.missionRevision,
  repository: snapshot.repository,
  branch: snapshot.branch,
  headRevision: snapshot.headRevision,
  plan: snapshot.plan,
  state: snapshot.state,
  predecessor: snapshot.predecessor,
  runnerInput: snapshot.runnerInput,
  fixture: snapshot.fixture,
  package: snapshot.package,
  authority: snapshot.authority,
  binding: snapshot.binding,
  seat: snapshot.seat,
  adapter: snapshot.adapter,
  runtime: snapshot.runtime,
  model: snapshot.model,
  executor: snapshot.executor,
  stepOutcome: snapshot.stepOutcome,
  stepReason: snapshot.stepReason,
  stepDurable: snapshot.stepDurable,
  measurementPersistence: snapshot.measurementPersistence,
  command: {
    startedAt: snapshot.commandStartAt,
    completedAt: snapshot.commandCompletedAt,
    latencyMs: Date.parse(snapshot.commandCompletedAt) - Date.parse(snapshot.commandStartAt),
  },
  packet: {
    bytes: snapshot.packetByteCount,
    sha256: snapshot.packetDigest,
  },
  processedInput: snapshot.processedInput,
  generatedOutput: snapshot.generatedOutput,
  reasoningToken: snapshot.reasoningToken,
  uniqueInjectedContext: snapshot.uniqueInjectedContext,
  contextChainPosition: snapshot.contextChainPosition,
  hillAction: snapshot.hillAction,
  retryCount: snapshot.retryCount,
  correctionCount: snapshot.correctionCount,
  interventionCount: snapshot.interventionCount,
  cancellation: snapshot.cancellation,
  providerCounter: snapshot.providerCounter,
});

const durableMeasurementIdentity = (record) => {
  const {
    stepOutcome: _stepOutcome,
    stepReason: _stepReason,
    measurementPersistence: _measurementPersistence,
    command: _command,
    ...stableTuple
  } = record.measurementTuple;
  return {
    measurementIntentId: record.measurementIntentId,
    effectClaimId: record.effectClaimId,
    attemptDigest: record.attemptDigest,
    measurementTuple: stableTuple,
  };
};

export const validateFeatureFlightMeasurementEnvelope = (input) => freezeDeep(validateEnvelopeShape(input));

export const buildFeatureFlightMeasurementRecord = (input) => {
  const envelope = validateFeatureFlightMeasurementEnvelope(input);
  const tuple = freezeDeep(measurementTuple(envelope));
  const path = deriveFeatureFlightMeasurementPath({
    durableArtifactRoot: envelope.durableArtifactRoot,
    effectClaimId: envelope.effectClaimId,
    measurementIntentId: envelope.measurementIntentId,
  });
  const base = freezeDeep({
    schemaVersion: FEATURE_FLIGHT_MEASUREMENT_SCHEMA_VERSION,
    artifactType: FEATURE_FLIGHT_MEASUREMENT_ARTIFACT_TYPE,
    contractVersion: FEATURE_FLIGHT_MEASUREMENT_CONTRACT_VERSION,
    authority: "none",
    gateEligible: false,
    notice: FEATURE_FLIGHT_MEASUREMENT_NOTICE,
    measurementIntentId: envelope.measurementIntentId,
    effectClaimId: envelope.effectClaimId,
    attemptDigest: envelope.attemptDigest,
    measurementTuple: tuple,
  });
  const bytes = canonicalFeatureFlightBytes(base);
  const identityValue = Object.freeze({
    path,
    bytes: bytes.length,
    sha256: digest(bytes),
  });
  return freezeDeep({ ...base, identity: identityValue });
};

const validateMeasurementTuple = (value, label = "measurementTuple") => {
  exactObject(value, [
    "mission", "subject", "missionRevision", "repository", "branch", "headRevision",
    "plan", "state", "predecessor", "runnerInput", "fixture", "package",
    "authority", "binding", "seat", "adapter", "runtime", "model", "executor",
    "stepOutcome", "stepReason", "stepDurable", "measurementPersistence",
    "command", "packet", "processedInput", "generatedOutput", "reasoningToken", "uniqueInjectedContext",
    "contextChainPosition", "hillAction", "retryCount", "correctionCount", "interventionCount", "cancellation", "providerCounter",
  ], [], label);
  ensure(GIT_REVISION.test(value.headRevision ?? ""), `${label}.headRevision is malformed.`);
  exactObject(value.command, ["startedAt", "completedAt", "latencyMs"], [], `${label}.command`);
  ensure(typeof value.command.startedAt === "string" && value.command.startedAt.length > 0, `${label}.command.startedAt is malformed.`);
  ensure(typeof value.command.completedAt === "string" && value.command.completedAt.length > 0, `${label}.command.completedAt is malformed.`);
  ensure(Number.isSafeInteger(value.command.latencyMs) && value.command.latencyMs >= 0, `${label}.command.latencyMs is malformed.`);
  validateFeatureFlightTimestamp(value.command.startedAt, `${label}.command.startedAt`);
  validateFeatureFlightTimestamp(value.command.completedAt, `${label}.command.completedAt`);
  ensure(value.command.latencyMs === (Date.parse(value.command.completedAt) - Date.parse(value.command.startedAt)), `${label}.command.latencyMs is inconsistent.`);
  exactObject(value.packet, ["bytes", "sha256"], [], `${label}.packet`);
  ensure(Number.isSafeInteger(value.packet.bytes) && value.packet.bytes >= 0, `${label}.packet.bytes is malformed.`);
  ensure(HASH.test(value.packet.sha256 ?? ""), `${label}.packet.sha256 is malformed.`);
};

export const validateFeatureFlightMeasurementRecord = (value) => {
  const errors = [];
  try {
    exactObject(value, [
      "schemaVersion", "artifactType", "contractVersion",
      "authority", "gateEligible", "notice",
      "measurementIntentId", "effectClaimId", "attemptDigest", "measurementTuple", "identity",
    ], [], "feature-flight-measurement record");
    ensure(value.schemaVersion === FEATURE_FLIGHT_MEASUREMENT_SCHEMA_VERSION, "schemaVersion mismatch.");
    ensure(value.artifactType === FEATURE_FLIGHT_MEASUREMENT_ARTIFACT_TYPE, "artifactType mismatch.");
    ensure(value.contractVersion === FEATURE_FLIGHT_MEASUREMENT_CONTRACT_VERSION, "contractVersion mismatch.");
    ensure(value.authority === "none", "authority must be none.");
    ensure(value.gateEligible === false, "gateEligible must be false.");
    ensure(value.notice === FEATURE_FLIGHT_MEASUREMENT_NOTICE, "notice mismatch.");
    ensure(IDENTIFIER.test(value.measurementIntentId ?? ""), "measurementIntentId malformed.");
    ensure(HASH.test(value.effectClaimId ?? ""), "effectClaimId malformed.");
    ensure(HASH.test(value.attemptDigest ?? ""), "attemptDigest malformed.");
    validateMeasurementTuple(value.measurementTuple);
    identity(value.identity, "measurement identity");
  const identityless = { ...value };
  delete identityless.identity;
  const identityBytes = canonicalFeatureFlightBytes(identityless);
  ensure(identityBytes.length === value.identity.bytes, "measurement identity bytes mismatch.");
  ensure(digest(identityBytes) === value.identity.sha256, "measurement identity digest mismatch.");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
};

export const deriveFeatureFlightMeasurementPath = ({ durableArtifactRoot, effectClaimId, measurementIntentId }) => {
  canonicalPath(durableArtifactRoot, "durableArtifactRoot");
  ensure(HASH.test(effectClaimId ?? ""), "effectClaimId malformed.");
  ensure(IDENTIFIER.test(measurementIntentId ?? ""), "measurementIntentId malformed.");
  return join(durableArtifactRoot, FEATURE_FLIGHT_MEASUREMENT_NAMESPACE, effectClaimId, `${measurementIntentId}.json`);
};

export const classifyFeatureFlightMeasurementPersistence = ({ outcome, durable }) => {
  if (outcome === "completed") return "fresh";
  if (outcome === "replayed") return "replay";
  if (outcome === "recovery_required" && durable === true) return "recovery";
  return null;
};

const shouldPersistMeasurement = (snapshot) => {
  const persistence = classifyFeatureFlightMeasurementPersistence({
    outcome: snapshot.stepOutcome,
    durable: snapshot.stepDurable,
  });
  return persistence !== null && PERSISTENCE.has(persistence);
};

const withClosedHandle = async (handle, close) => {
  if (!handle) return undefined;
  await close(handle);
};

const requiredNoFollowFlag = (dependencies) => {
  ensure(Number.isInteger(dependencies.noFollowFlag) && dependencies.noFollowFlag > 0,
    "O_NOFOLLOW is required for Feature Flight measurement persistence.");
  return dependencies.noFollowFlag;
};

const validateRetainedDirectory = async (retained, dependencies) => {
  const pathIdentity = await dependencies.lstat(retained.path);
  const handleIdentity = await retained.handle.stat();
  ensure(pathIdentity.isDirectory() && !pathIdentity.isSymbolicLink(), `Retained measurement directory is invalid: ${retained.path}`);
  ensure(handleIdentity.isDirectory(), `Retained measurement directory handle is invalid: ${retained.path}`);
  ensure((pathIdentity.mode & 0o777) === 0o700 && (handleIdentity.mode & 0o777) === 0o700,
    `Retained measurement directory must be 0700: ${retained.path}`);
  ensure(pathIdentity.dev === retained.dev && pathIdentity.ino === retained.ino &&
    handleIdentity.dev === retained.dev && handleIdentity.ino === retained.ino,
  `Retained measurement directory identity changed: ${retained.path}`);
  await dependencies.realpath(retained.path).then((value) =>
    ensure(value === retained.path, `Retained measurement directory is aliased: ${retained.path}`));
};

const validateRetainedDirectories = async (retainedDirectories, dependencies) => {
  for (const retained of retainedDirectories) await validateRetainedDirectory(retained, dependencies);
};

const retainDirectory = async (path, dependencies) => {
  const before = await dependencies.lstat(path);
  ensure(before.isDirectory() && !before.isSymbolicLink(), `Measurement directory is invalid or non-follow: ${path}`);
  ensure((before.mode & 0o777) === 0o700, `Measurement directory must be 0700: ${path}`);
  await dependencies.realpath(path).then((value) => ensure(value === path, `Measurement directory is aliased: ${path}`));
  const handle = await dependencies.open(path,
    fsConstants.O_RDONLY | requiredNoFollowFlag(dependencies) | (fsConstants.O_DIRECTORY ?? 0));
  try {
    const observed = await handle.stat();
    ensure(observed.isDirectory() && observed.dev === before.dev && observed.ino === before.ino,
      `Measurement directory identity changed while opening: ${path}`);
    ensure((observed.mode & 0o777) === 0o700, `Measurement directory must be 0700: ${path}`);
    return { path, handle, dev: observed.dev, ino: observed.ino };
  } catch (error) {
    await withClosedHandle(handle, dependencies.close);
    throw error;
  }
};

const provisionMeasurementDirectories = async ({ path, durableArtifactRoot, effectClaimId }, dependencies, retainedDirectories) => {
  const measurementShieldRoot = join(durableArtifactRoot, ".shield");
  const measurementNamespace = join(durableArtifactRoot, FEATURE_FLIGHT_MEASUREMENT_NAMESPACE);
  const effectDirectory = join(measurementNamespace, effectClaimId);
  ensure(dirname(path) === effectDirectory, "Measurement target must remain within its fixed effect directory.");
  const paths = [durableArtifactRoot, measurementShieldRoot, measurementNamespace, effectDirectory];

  retainedDirectories.push(await retainDirectory(paths[0], dependencies));
  for (let index = 1; index < paths.length; index += 1) {
    await validateRetainedDirectories(retainedDirectories, dependencies);
    let created = false;
    try {
      await dependencies.mkdir(paths[index], { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    if (created) {
      await dependencies.sync(retainedDirectories[index - 1].handle);
      await validateRetainedDirectory(retainedDirectories[index - 1], dependencies);
    }
    retainedDirectories.push(await retainDirectory(paths[index], dependencies));
  }
  await validateRetainedDirectories(retainedDirectories, dependencies);
};

const closeRetainedDirectories = async (retainedDirectories, dependencies) => {
  const errors = [];
  for (const retained of [...retainedDirectories].reverse()) {
    try {
      await withClosedHandle(retained.handle, dependencies.close);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
};

const parseExistingBytes = async (path, dependencies) => {
  const parent = dirname(path);
  const parentIdentity = await dependencies.lstat(parent);
  const targetHandle = await dependencies.open(path, fsConstants.O_RDONLY | requiredNoFollowFlag(dependencies));
  const before = await dependencies.lstat(path);
  try {
    ensure(parentIdentity.isDirectory() && !parentIdentity.isSymbolicLink(), `Invalid measurement directory: ${parent}`);
    await dependencies.realpath(parent).then((value) => ensure(value === parent, `Invalid measurement directory alias: ${parent}`));
    const targetIdentity = await targetHandle.stat();
    ensure(targetIdentity.isFile() && !targetIdentity.isSymbolicLink(), `Measurement artifact must be regular file: ${path}`);
    ensure(targetIdentity.nlink === 1, `Measurement artifact must have no hard links: ${path}`);
    ensure((before.mode & 0o777) === 0o600, `Measurement artifact must be 0600: ${path}`);
    ensure(before.dev === targetIdentity.dev && before.ino === targetIdentity.ino, "Measurement file identity changed.");
    await dependencies.beforeRead?.({ path, handle: targetHandle });
    const bytes = await dependencies.read(targetHandle);
    await dependencies.afterRead?.({ path, handle: targetHandle, bytes });
    const after = await dependencies.lstat(path);
    ensure(after.dev === before.dev && after.ino === before.ino, `Measurement file identity changed: ${path}`);
    return bytes;
  } finally {
    await withClosedHandle(targetHandle, dependencies.close);
  }
};

const ensureMeasurementPathSafe = async (path, dependencies) => {
  const measurementNamespace = dirname(dirname(path));
  const measurementShieldRoot = dirname(measurementNamespace);
  const shieldIdentity = await dependencies.lstat(measurementShieldRoot);
  ensure(shieldIdentity.isDirectory() && !shieldIdentity.isSymbolicLink(), `Measurement path is not a non-follow path: ${measurementShieldRoot}`);
  await dependencies.realpath(measurementShieldRoot).then((value) => ensure(value === measurementShieldRoot, `Measurement path is not a strict non-follow path: ${measurementShieldRoot}`));

  const namespaceIdentity = await dependencies.lstat(measurementNamespace);
  ensure(namespaceIdentity.isDirectory() && !namespaceIdentity.isSymbolicLink(), `Invalid measurement namespace directory: ${measurementNamespace}`);
  await dependencies.realpath(measurementNamespace).then((value) => ensure(value === measurementNamespace, `Invalid measurement namespace directory: ${measurementNamespace}`));
};

const readMeasurement = async (path, dependencies) => {
  try {
    requiredNoFollowFlag(dependencies);
    await ensureMeasurementPathSafe(path, dependencies);
    await dependencies.realpath(path).then((value) => ensure(value === path, `Measurement path is not a strict non-follow path: ${path}`));
    const bytes = await parseExistingBytes(path, dependencies);
    const parsed = strictParseJson(bytes.toString("utf8"), { maxBytes: 8_192_000, maxDepth: 64, rejectControlCharacters: false });
    if (parsed.state !== "valid") {
      return { state: "recovery_required", reason: parsed.code ?? "measurement_record_malformed", path };
    }
    const errors = validateFeatureFlightMeasurementRecord(parsed.value);
    if (errors.length !== 0) return { state: "recovery_required", reason: errors.join(" "), path };
    const canonical = canonicalFeatureFlightBytes(parsed.value);
    if (!canonical.equals(bytes)) return { state: "recovery_required", reason: "measurement_record_non_canonical", path };
    return { state: "replayed", record: parsed.value, bytes: canonical };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { state: "absent", path };
    }
    return { state: "recovery_required", reason: error instanceof Error ? error.message : String(error), path };
  }
};

export const readFeatureFlightMeasurement = async ({ path, snapshotDependencies = {} } = {}) => {
  const dependencies = { ...defaultDependencies, ...snapshotDependencies };
  return readMeasurement(path, dependencies);
};

const ensureWriteTargetParent = async (path, dependencies) => {
  const parent = dirname(path);
  const parentIdentity = await dependencies.lstat(parent);
  ensure(parentIdentity.isDirectory() && !parentIdentity.isSymbolicLink(), `Invalid measurement namespace directory: ${parent}`);
  await dependencies.realpath(parent).then((value) => ensure(value === parent, `Invalid measurement namespace directory alias: ${parent}`));
  const before = await dependencies.lstat(parent);
  ensure(before.isDirectory() && !before.isSymbolicLink(), `Invalid measurement namespace directory: ${parent}`);
};

const ensureTargetMissing = async (path, dependencies) => {
  await dependencies.lstat(path).then(
    (existing) => {
      ensure(existing.isFile() && !existing.isSymbolicLink(), `Measurement path preexists as non-file: ${path}`);
      ensure(existing.nlink === 1, `Measurement path has unexpected links: ${path}`);
      ensure((existing.mode & 0o777) === 0o600, `Measurement path mode is invalid: ${path}`);
    },
    (error) => {
      if (error?.code !== "ENOENT") throw error;
    },
  );
};

const writeMeasurement = async (path, bytes, dependencies, retainedParent) => {
  let handle;
  let result;
  try {
    await ensureMeasurementPathSafe(path, dependencies);
    await ensureWriteTargetParent(path, dependencies);
    await ensureTargetMissing(path, dependencies);
    const parent = dirname(path);
    handle = await dependencies.open(path,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR | requiredNoFollowFlag(dependencies), 0o600);
    const pathIdentity = await dependencies.lstat(path);
    const handleIdentity = await handle.stat();
    ensure(pathIdentity.isFile() && !pathIdentity.isSymbolicLink() && handleIdentity.isFile(), `Measurement artifact must be regular file: ${path}`);
    ensure(pathIdentity.nlink === 1 && handleIdentity.nlink === 1, `Measurement artifact must have no hard links: ${path}`);
    ensure((pathIdentity.mode & 0o777) === 0o600 && (handleIdentity.mode & 0o777) === 0o600, `Measurement artifact must be 0600: ${path}`);
    ensure(pathIdentity.dev === handleIdentity.dev && pathIdentity.ino === handleIdentity.ino, `Measurement file identity changed: ${path}`);
    await dependencies.beforeWrite?.({ path, parent });
    await dependencies.write(handle, bytes);
    await dependencies.sync(handle);
    await dependencies.afterWrite?.({ path, parent, bytes });
    await dependencies.sync(handle);
    const readback = await dependencies.read(handle);
    ensure(readback.equals(bytes), `Measurement write readback mismatch: ${path}`);
    const parsed = strictParseJson(readback.toString("utf8"), { maxBytes: 8_192_000, maxDepth: 64, rejectControlCharacters: false });
    if (parsed.state !== "valid" || validateFeatureFlightMeasurementRecord(parsed.value).length !== 0) {
      throw new Error("measurement_record_invalid_after_write");
    }
    const afterPath = await dependencies.lstat(path);
    const afterHandle = await handle.stat();
    ensure(afterPath.dev === pathIdentity.dev && afterPath.ino === pathIdentity.ino && afterPath.nlink === 1 &&
      afterHandle.dev === pathIdentity.dev && afterHandle.ino === pathIdentity.ino && afterHandle.nlink === 1,
    `Measurement file identity changed: ${path}`);
    result = { state: "created", record: parsed.value, bytes, path };
  } catch (error) {
    if (error?.code === "ENOENT") {
      result = { state: "recovery_required", reason: `Measurement path is not a strict non-follow path: ${path}`, path };
    } else {
      result = { state: "recovery_required", reason: error instanceof Error ? error.message : String(error), path };
    }
  }
  let closeError;
  if (handle) {
    try {
      await withClosedHandle(handle, dependencies.close);
    } catch (error) {
      closeError = error instanceof Error ? error.message : String(error);
    }
  }
  let parentSyncError;
  if (handle) {
    try {
      await dependencies.sync(retainedParent.handle);
    } catch (error) {
      parentSyncError = error instanceof Error ? error.message : String(error);
    }
  }
  if (closeError) return { state: "recovery_required", reason: `Measurement close failed: ${path}: ${closeError}`, path };
  if (parentSyncError) return { state: "recovery_required", reason: `Measurement parent sync failed: ${path}: ${parentSyncError}`, path };
  return result;
};

export const writeFeatureFlightMeasurement = async (input, injectedDependencies = {}) => {
  const dependencies = { ...defaultDependencies, ...injectedDependencies };
  const snapshot = validateFeatureFlightMeasurementEnvelope(input);
  const path = deriveFeatureFlightMeasurementPath({
    durableArtifactRoot: snapshot.durableArtifactRoot,
    effectClaimId: snapshot.effectClaimId,
    measurementIntentId: snapshot.measurementIntentId,
  });
  const record = buildFeatureFlightMeasurementRecord(snapshot);
  const bytes = canonicalFeatureFlightBytes(record);

  if (!shouldPersistMeasurement(snapshot)) {
    return { state: "skipped", path, reason: `No durable measurement for ${snapshot.stepOutcome}.` };
  }

  const retainedDirectories = [];
  let result;
  try {
    requiredNoFollowFlag(dependencies);
    await provisionMeasurementDirectories({
      path,
      durableArtifactRoot: snapshot.durableArtifactRoot,
      effectClaimId: snapshot.effectClaimId,
    }, dependencies, retainedDirectories);
    await validateRetainedDirectories(retainedDirectories, dependencies);
    const existing = await readMeasurement(path, dependencies);
    await validateRetainedDirectories(retainedDirectories, dependencies);
    if (existing.state === "replayed") {
      const existingDigest = digest(existing.bytes);
      const existingDurableIdentity = canonicalFeatureFlightBytes(durableMeasurementIdentity(existing.record));
      const currentDurableIdentity = canonicalFeatureFlightBytes(durableMeasurementIdentity(record));
      result = existingDurableIdentity.equals(currentDurableIdentity)
        ? { state: "replayed", path, record: existing.record, digest: existingDigest }
        : { state: "recovery_required", path, reason: "Measurement tuple does not match existing file." };
    } else if (existing.state === "recovery_required") {
      result = existing;
    } else {
      const created = await writeMeasurement(path, bytes, dependencies, retainedDirectories.at(-1));
      await validateRetainedDirectories(retainedDirectories, dependencies);
      result = created.state === "created"
        ? { ...created, digest: digest(bytes), measurementIntentId: snapshot.measurementIntentId }
        : created;
    }
  } catch (error) {
    result = { state: "recovery_required", path, reason: error instanceof Error ? error.message : String(error) };
  }

  const closeErrors = await closeRetainedDirectories(retainedDirectories, dependencies);
  if (closeErrors.length !== 0) {
    return { state: "recovery_required", path, reason: `Measurement directory close failed: ${closeErrors.join(" ")}` };
  }
  return result;
};

export const buildFeatureFlightMeasurementEnvelopeFromProjection = ({
  projection,
  measurementIntentId,
  durableArtifactRoot,
  effectClaimId,
  attemptDigest,
  commandStartAt,
  commandCompletedAt,
  packetByteCount,
  packetDigest,
  processedInput = null,
  generatedOutput = null,
  reasoningToken = null,
  uniqueInjectedContext = null,
  contextChainPosition = null,
  hillAction = null,
  retryCount = null,
  correctionCount = null,
  interventionCount = null,
  cancellation = null,
  providerCounter = null,
  mission,
  subject,
  missionRevision,
  repository,
  branch,
  headRevision,
  plan,
  state,
  predecessor,
  runnerInput,
  fixture,
  package: packageReference,
  authority,
  binding,
  seat,
  adapter,
  runtime,
  model,
  executor,
  ..._ignore
}) => {
  const measurementPersistence = classifyFeatureFlightMeasurementPersistence(projection);
  ensure(measurementPersistence !== null, "Step projection is not durable-measurement eligible.");
  const core = {
    measurementIntentId, durableArtifactRoot, effectClaimId, attemptDigest,
    mission, subject, missionRevision,
    repository, branch, headRevision,
    plan, state, predecessor, runnerInput, fixture, package: packageReference,
    authority, binding, seat, adapter, runtime, model, executor,
    stepOutcome: projection.outcome, stepReason: projection.reason,
    stepDurable: projection.durable === true,
    measurementPersistence,
    commandStartAt, commandCompletedAt,
    packetByteCount, packetDigest,
    processedInput, generatedOutput, reasoningToken, uniqueInjectedContext, contextChainPosition,
    hillAction, retryCount, correctionCount, interventionCount, cancellation, providerCounter,
  };
  return validateFeatureFlightMeasurementEnvelope(core);
};

export const persistFeatureFlightMeasurement = async ({ projection, snapshot, dependencies = {} }) => {
  const envelope = buildFeatureFlightMeasurementEnvelopeFromProjection({
    projection,
    ...snapshot,
  });
  return writeFeatureFlightMeasurement(envelope, dependencies);
};
