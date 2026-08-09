import { createHash } from "node:crypto";
import { isAbsolute, normalize, resolve } from "node:path";
import { isProxy } from "node:util/types";

export const FEATURE_FLIGHT_RECOVERY_CONTRACT_VERSION = "2.0.0";
export const FEATURE_FLIGHT_REMOTE_OBSERVER_POLICY = Object.freeze({
  observerId: "shield.feature-flight.remote-observer",
  observerVersion: "1.0.0",
  capabilityClass: "remote_branch_read_only",
  remoteName: "origin",
  urlNormalization: "shield-git-remote-url-v1",
});
export const FEATURE_FLIGHT_REMOTE_NOTICE = "Read-only remote observation only. This value grants no authority.";
export const FEATURE_FLIGHT_RECOVERY_NOTICE = "Recovery coordination evidence only. This artifact grants no authority or reconciliation permission.";
export const FEATURE_FLIGHT_TERMINAL_NOTICE = "Create-only terminal coordination arbiter. This artifact grants no authority.";
export const FEATURE_FLIGHT_NEXT_ACTION = "inspect_claim_and_remote_non_destructively";

const SHA256 = /^[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REF = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._\/-]{0,240}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const CONTRACT = Object.freeze({ name: "shield-feature-flight-step", version: FEATURE_FLIGHT_RECOVERY_CONTRACT_VERSION });

export const canonicalFeatureFlightValue = (value) => Array.isArray(value) ? value.map(canonicalFeatureFlightValue)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalFeatureFlightValue(value[key])]))
    : value;
export const canonicalFeatureFlightBytes = (value) => Buffer.from(`${JSON.stringify(canonicalFeatureFlightValue(value), null, 2)}\n`, "utf8");
export const featureFlightSha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const featureFlightDigest = (value) => featureFlightSha256(Buffer.from(JSON.stringify(canonicalFeatureFlightValue(value)), "utf8"));
export const featureFlightArtifactIdentity = (path, bytes) => Object.freeze({ path, bytes: bytes.length, sha256: featureFlightSha256(bytes) });

export const exactFeatureFlightObject = (value, required, optional = [], label = "object") => {
  let proxy = true;
  try { proxy = isProxy(value); } catch {}
  if (proxy || value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a strict plain object.`);
  }
  const allowed = new Set([...required, ...optional]);
  if (Object.getOwnPropertySymbols(value).length !== 0) throw new Error(`${label} must not contain symbol fields.`);
  for (const name of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!allowed.has(name) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
      throw new Error(`${label}.${name} is unknown or is not an own enumerable data field.`);
    }
  }
  for (const field of required) if (!Object.hasOwn(value, field)) throw new Error(`${label}.${field} is required.`);
  return value;
};

export const validateFeatureFlightTimestamp = (value, label = "timestamp") => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
      Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`${label} must be canonical UTC with milliseconds.`);
  return value;
};

const boundedString = (value, label, pattern = IDENTITY) => {
  if (typeof value !== "string" || CONTROL.test(value) || !pattern.test(value)) throw new Error(`${label} is malformed.`);
  return value;
};
const canonicalPath = (value, label) => {
  if (typeof value !== "string" || value.length > 4096 || CONTROL.test(value) || !isAbsolute(value) || normalize(value) !== value || resolve(value) !== value) {
    throw new Error(`${label} must be a canonical absolute path.`);
  }
  return value;
};
const positiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is malformed.`);
  return value;
};

export const normalizeFeatureFlightRemoteUrl = (value) => {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || CONTROL.test(value) || /[?#]/u.test(value)) {
    throw new Error("Configured origin URL is malformed.");
  }
  let host;
  let repositoryPath;
  const scp = /^(?:git@)?([A-Za-z0-9.-]+):([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?)(?:\.git)?$/u.exec(value);
  if (scp) {
    [, host, repositoryPath] = scp;
  } else {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error("Configured origin URL is malformed."); }
    if (parsed.protocol !== "ssh:" || parsed.password !== "" || !["", "git"].includes(parsed.username) || parsed.port !== "" ||
        parsed.search !== "" || parsed.hash !== "") throw new Error("Configured origin URL is not an accepted credential-free SSH remote.");
    host = parsed.hostname;
    repositoryPath = parsed.pathname.replace(/^\//u, "").replace(/\.git$/u, "");
  }
  if (!/^[A-Za-z0-9.-]{1,253}$/u.test(host ?? "") || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(repositoryPath ?? "") ||
      host.includes("..") || repositoryPath.includes("..")) throw new Error("Configured origin URL repository identity is ambiguous.");
  return `ssh://git@${host.toLowerCase()}/${repositoryPath}`;
};

const DESCRIPTOR_FIELDS = [
  "observerId", "observerVersion", "capabilityClass", "runtimeId", "executorId", "remoteName", "urlNormalization",
  "repositoryRoot", "commonGitDirectory", "commonGitDevice", "commonGitInode", "configuredRemoteUrl", "remoteUrlIdentity",
];

export const validateFeatureFlightRemoteObserverDescriptor = (value) => {
  exactFeatureFlightObject(value, DESCRIPTOR_FIELDS, [], "remote observer descriptor");
  if (!Object.isFrozen(value)) throw new Error("Remote observer descriptor must be independently frozen.");
  for (const [field, expected] of Object.entries(FEATURE_FLIGHT_REMOTE_OBSERVER_POLICY)) {
    if (value[field] !== expected) throw new Error(`Remote observer descriptor ${field} does not match policy.`);
  }
  boundedString(value.runtimeId, "remote observer runtimeId");
  boundedString(value.executorId, "remote observer executorId");
  if (value.runtimeId === value.executorId) throw new Error("Remote observer runtime and executor identities must be distinct.");
  canonicalPath(value.repositoryRoot, "remote observer repositoryRoot");
  canonicalPath(value.commonGitDirectory, "remote observer commonGitDirectory");
  positiveInteger(value.commonGitDevice, "remote observer commonGitDevice");
  positiveInteger(value.commonGitInode, "remote observer commonGitInode");
  if (normalizeFeatureFlightRemoteUrl(value.configuredRemoteUrl) !== value.remoteUrlIdentity) {
    throw new Error("Remote observer normalized origin identity does not match its configured URL.");
  }
  return Object.freeze(structuredClone(value));
};

const OBSERVATION_FIELDS = [
  "schemaVersion", "artifactType", "contractVersion", "authority", "notice", "repositoryRoot", "commonGitDirectory",
  "commonGitDevice", "commonGitInode", "observer", "remoteName", "remoteUrlIdentity", "fullRef", "remoteHead",
  "observedAt", "phase", "challenge",
];

export const validateFeatureFlightRemoteObservation = (value, expected) => {
  exactFeatureFlightObject(value, OBSERVATION_FIELDS, [], "remote observation");
  exactFeatureFlightObject(value.observer, ["observerId", "observerVersion", "runtimeId", "executorId"], [], "remote observation observer");
  if (value.schemaVersion !== 1 || value.artifactType !== "feature-flight-remote-observation" ||
      value.contractVersion !== FEATURE_FLIGHT_RECOVERY_CONTRACT_VERSION || value.authority !== "none" || value.notice !== FEATURE_FLIGHT_REMOTE_NOTICE) {
    throw new Error("Remote observation contract identity is invalid.");
  }
  canonicalPath(value.repositoryRoot, "remote observation repositoryRoot");
  canonicalPath(value.commonGitDirectory, "remote observation commonGitDirectory");
  positiveInteger(value.commonGitDevice, "remote observation commonGitDevice");
  positiveInteger(value.commonGitInode, "remote observation commonGitInode");
  boundedString(value.remoteName, "remote observation remoteName");
  boundedString(value.remoteUrlIdentity, "remote observation remoteUrlIdentity", /^ssh:\/\/git@[A-Za-z0-9.-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u);
  boundedString(value.fullRef, "remote observation fullRef", REF);
  if (value.remoteHead !== null && (typeof value.remoteHead !== "string" || !REVISION.test(value.remoteHead))) throw new Error("Remote observation remoteHead is malformed.");
  validateFeatureFlightTimestamp(value.observedAt, "remote observation observedAt");
  if (!["pre_claim", "post_adapter"].includes(value.phase) || !SHA256.test(value.challenge ?? "")) throw new Error("Remote observation phase or challenge is malformed.");
  const descriptor = expected.descriptor;
  const expectedObserver = {
    observerId: descriptor.observerId, observerVersion: descriptor.observerVersion,
    runtimeId: descriptor.runtimeId, executorId: descriptor.executorId,
  };
  const matches = value.repositoryRoot === descriptor.repositoryRoot && value.commonGitDirectory === descriptor.commonGitDirectory &&
    value.commonGitDevice === descriptor.commonGitDevice && value.commonGitInode === descriptor.commonGitInode &&
    Object.keys(expectedObserver).every((field) => value.observer[field] === expectedObserver[field]) && value.remoteName === descriptor.remoteName &&
    value.remoteUrlIdentity === descriptor.remoteUrlIdentity && value.fullRef === expected.fullRef;
  if (!matches) throw new Error("Remote observation identity does not match the trusted observer descriptor.");
  if (value.phase !== expected.phase || value.challenge !== expected.challenge) throw new Error("Remote observation phase or challenge is stale.");
  return Object.freeze(structuredClone(value));
};

export const featureFlightRemoteChallenge = (effectClaimId, descriptor, fullRef, phase) => featureFlightDigest({
  domain: "shield-feature-flight-remote-challenge.v1", effectClaimId, descriptor, fullRef, phase,
});

const identityFields = ["path", "bytes", "sha256"];
const hierarchyFields = ["root", "effects", "effect"];
const hierarchyEntryFields = ["path", "dev", "ino"];
const payloadFields = ["value", "bytes", "sha256"];

const validateIdentity = (value, label, nullable = false) => {
  if (nullable && value === null) return;
  exactFeatureFlightObject(value, identityFields, [], label);
  canonicalPath(value.path, `${label}.path`);
  positiveInteger(value.bytes, `${label}.bytes`);
  if (!SHA256.test(value.sha256 ?? "")) throw new Error(`${label}.sha256 is malformed.`);
};
const validateHierarchy = (value, label) => {
  exactFeatureFlightObject(value, hierarchyFields, [], label);
  for (const field of hierarchyFields) {
    exactFeatureFlightObject(value[field], hierarchyEntryFields, [], `${label}.${field}`);
    canonicalPath(value[field].path, `${label}.${field}.path`);
    positiveInteger(value[field].dev, `${label}.${field}.dev`);
    positiveInteger(value[field].ino, `${label}.${field}.ino`);
  }
};
const validatePayload = (value, label, nullable = false) => {
  if (nullable && value === null) return;
  exactFeatureFlightObject(value, payloadFields, [], label);
  positiveInteger(value.bytes, `${label}.bytes`);
  if (!SHA256.test(value.sha256 ?? "")) throw new Error(`${label}.sha256 is malformed.`);
  const bytes = canonicalFeatureFlightBytes(value.value);
  if (bytes.length !== value.bytes || featureFlightSha256(bytes) !== value.sha256) throw new Error(`${label} canonical byte identity is invalid.`);
};

const RECOVERY_FIELDS = [
  "schemaVersion", "artifactType", "authority", "notice", "contract", "effectClaimId", "attemptDigest", "claim", "successor",
  "reason", "phase", "baselineRemoteObservation", "latestRemoteObservation", "invocationClassification", "effectState",
  "gateEligible", "recordedAt", "nextAction",
];
export const FEATURE_FLIGHT_RECOVERY_REASONS = Object.freeze({
  interrupted_after_claim: ["store_replay", "zero_or_unknown"],
  adapter_uncertain: ["adapter", "zero_or_unknown"],
  validation_failed: ["validation", "one_completed"],
  local_readback_unavailable: ["local_readback", "one_completed"],
  local_repository_changed: ["local_readback", "one_completed"],
  postcheck_remote_observation_unavailable: ["remote_postcheck", "one_completed"],
  remote_identity_changed: ["remote_postcheck", "one_completed"],
  remote_drift: ["remote_postcheck", "one_completed"],
});

export const validateFeatureFlightRecovery = (value) => {
  const errors = [];
  try {
    exactFeatureFlightObject(value, RECOVERY_FIELDS, [], "feature-flight-step-recovery");
    exactFeatureFlightObject(value.contract, ["name", "version"], [], "recovery.contract");
    if (value.schemaVersion !== 1 || value.artifactType !== "feature-flight-step-recovery" || value.authority !== "none" ||
        value.notice !== FEATURE_FLIGHT_RECOVERY_NOTICE || value.contract.name !== CONTRACT.name || value.contract.version !== CONTRACT.version) throw new Error("Recovery contract identity is invalid.");
    if (!SHA256.test(value.effectClaimId ?? "") || !SHA256.test(value.attemptDigest ?? "")) throw new Error("Recovery digests are malformed.");
    validateIdentity(value.claim, "recovery.claim");
    if (value.successor !== null) throw new Error("Recovery successor identity must be null.");
    const rule = FEATURE_FLIGHT_RECOVERY_REASONS[value.reason];
    if (rule === undefined || value.phase !== rule[0] || value.invocationClassification !== rule[1]) throw new Error("Recovery reason mapping is invalid.");
    if (value.baselineRemoteObservation !== null) exactFeatureFlightObject(value.baselineRemoteObservation, OBSERVATION_FIELDS, [], "recovery.baselineRemoteObservation");
    if (value.latestRemoteObservation !== null) exactFeatureFlightObject(value.latestRemoteObservation, OBSERVATION_FIELDS, [], "recovery.latestRemoteObservation");
    if (value.effectState !== "uncertain_do_not_reinvoke" || value.gateEligible !== false || value.nextAction !== FEATURE_FLIGHT_NEXT_ACTION) throw new Error("Recovery disposition is invalid.");
    validateFeatureFlightTimestamp(value.recordedAt, "recovery.recordedAt");
  } catch (error) { errors.push(error.message); }
  return errors;
};

const TERMINAL_FIELDS = [
  "schemaVersion", "artifactType", "authority", "notice", "contract", "effectClaimId", "attemptDigest", "claim",
  "terminalKind", "successor", "result", "recovery", "hierarchyIdentity", "recordedAt",
];
export const validateFeatureFlightTerminal = (value) => {
  const errors = [];
  try {
    exactFeatureFlightObject(value, TERMINAL_FIELDS, [], "feature-flight-step-terminal");
    exactFeatureFlightObject(value.contract, ["name", "version"], [], "terminal.contract");
    if (value.schemaVersion !== 1 || value.artifactType !== "feature-flight-step-terminal" || value.authority !== "none" ||
        value.notice !== FEATURE_FLIGHT_TERMINAL_NOTICE || value.contract.name !== CONTRACT.name || value.contract.version !== CONTRACT.version) throw new Error("Terminal arbiter contract identity is invalid.");
    if (!SHA256.test(value.effectClaimId ?? "") || !SHA256.test(value.attemptDigest ?? "")) throw new Error("Terminal arbiter digests are malformed.");
    validateIdentity(value.claim, "terminal.claim");
    validateHierarchy(value.hierarchyIdentity, "terminal.hierarchyIdentity");
    validateFeatureFlightTimestamp(value.recordedAt, "terminal.recordedAt");
    if (value.terminalKind === "success") {
      validatePayload(value.successor, "terminal.successor");
      validatePayload(value.result, "terminal.result");
      if (value.recovery !== null) throw new Error("Success arbiter recovery payload must be null.");
    } else if (value.terminalKind === "recovery") {
      if (value.successor !== null || value.result !== null) throw new Error("Recovery arbiter success payloads must be null.");
      validatePayload(value.recovery, "terminal.recovery");
    } else throw new Error("Terminal arbiter kind is invalid.");
  } catch (error) { errors.push(error.message); }
  return errors;
};

export const featureFlightPayload = (value) => {
  const bytes = canonicalFeatureFlightBytes(value);
  return Object.freeze({ value: structuredClone(value), bytes: bytes.length, sha256: featureFlightSha256(bytes) });
};

export const featureFlightContract = () => ({ ...CONTRACT });
