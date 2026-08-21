import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import { isProxy } from "node:util/types";

import { strictParseJson } from "../model/strict-json.mjs";
import {
  FEATURE_FLIGHT_RELAY_CONTRACT_VERSION,
  FEATURE_FLIGHT_RELAY_MAX_LEDGER_ENTRIES,
  FEATURE_FLIGHT_RELAY_NOTICE,
  canonicalFeatureFlightRelayBytesV1,
  canonicalFeatureFlightRelayValueV1,
  createFeatureFlightRelayDeliveredEntryV1,
  createFeatureFlightRelayDeliveryReceiptV1,
  createFeatureFlightRelayEntryV1,
  createFeatureFlightRelayFromSeatDispatchV1,
  featureFlightRelayDigestV1,
  reconcileFeatureFlightRelayDeliveryV1,
  replayFeatureFlightRelayLedgerV1,
  validateFeatureFlightRelayDeliveryReceiptV1,
} from "./feature-flight-relay.mjs";

export const FEATURE_FLIGHT_RELAY_STORE_DIRECTORY = "relay-ledgers";
export const FEATURE_FLIGHT_RELAY_WITNESS_DIRECTORY = "relay-head-witnesses";
export const FEATURE_FLIGHT_RELAY_HILL_INBOX_DIRECTORY = "hill-relay-inbox";
export const FEATURE_FLIGHT_RELAY_STORE_MAX_BYTES = 16 * 1024 * 1024;
export const FEATURE_FLIGHT_RELAY_STORE_MAX_ENTRY_BYTES = 16 * 1024;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const RELAY_ID = /^relay:[A-Za-z0-9_-]{43}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/u;
const LOCK_OWNER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,127}$/u;
const CREATE_FIELDS = [
  "repositoryRoot", "receiptId", "dispatchId", "parentMissionId", "parentMissionRevision", "parentSessionId",
  "childTaskId", "childSessionId", "sourceAccountableSeatId", "repositoryId", "repositoryWorkspaceId",
  "repositoryRevision", "subjectId", "subjectRevision", "artifactId", "artifactRevision", "recipientSeatId",
  "recipientLaneId", "recipientControllerIdentity", "requestedObservation",
];
const APPEND_FIELDS = ["root", "excludedRoots", "lockOwnerId", ...CREATE_FIELDS];
const RECIPIENT_FIELDS = ["seatId", "laneId", "controllerIdentity"];
const DELIVERY_FIELDS = [
  "root", "excludedRoots", "lockOwnerId", "repositoryId", "repositoryWorkspaceId", "repositoryRevision",
  "relayId", "relayDigest", "recipient",
];
const WITNESS_FIELDS = [
  "schemaVersion", "artifactType", "contractVersion", "authority", "notice", "repositoryId",
  "repositoryWorkspaceId", "witnessSequence", "previousWitnessDigest", "relayEntryCount", "relayByteLength",
  "relayHeadDigest", "witnessDigest",
];
const defaultIo = Object.freeze({ lstat, mkdir, open, realpath, unlink });

const valid = (value) => Object.freeze({ state: "valid", value });
const invalid = (code, message) => Object.freeze({ state: "invalid", code, errors: Object.freeze([message]) });
const sameInode = (left, right) => Number(left?.dev) === Number(right?.dev) && Number(left?.ino) === Number(right?.ino);
const sameBytes = (left, right) => Buffer.from(left).equals(Buffer.from(right));
const lineFor = (value) => Buffer.concat([canonicalFeatureFlightRelayBytesV1(value), Buffer.from("\n", "utf8")]);
const overlaps = (left, right) => {
  const fold = (value) => value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
  const a = fold(left);
  const b = fold(right);
  return a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
};

class StoreFailure extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const storeFailure = (code, message) => { throw new StoreFailure(code, message); };
const resultFromError = (error, fallback = "feature_flight_relay_store_unavailable") => invalid(
  error instanceof StoreFailure ? error.code : fallback,
  error instanceof Error ? error.message : "Feature Flight relay store operation failed.",
);

function safeIsProxy(value) {
  try { return isProxy(value); } catch { return true; }
}

function snapshot(value, label = "value", ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new StoreFailure("malformed_input", label + " must use safe integers.");
    return value;
  }
  if (typeof value !== "object" || safeIsProxy(value)) throw new StoreFailure("malformed_input", label + " contains unsupported data.");
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) || ancestors.has(value)) {
    throw new StoreFailure("malformed_input", label + " must be acyclic closed ordinary data.");
  }
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = array ? new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]) : null;
  const clone = array ? [] : {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || (allowed !== null && !allowed.has(key))) {
      throw new StoreFailure("malformed_input", label + " contains an unsupported field.");
    }
    if (array && key === "length") continue;
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
      throw new StoreFailure("malformed_input", label + "." + key + " must be an own enumerable data field.");
    }
    clone[key] = snapshot(descriptor.value, label + "." + key, ancestors);
  }
  if (array && clone.length !== value.length) throw new StoreFailure("malformed_input", label + " must be dense.");
  ancestors.delete(value);
  return Object.freeze(clone);
}

function exact(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field)) ||
      Object.keys(value).some((field) => !fields.includes(field))) {
    throw new StoreFailure("malformed_input", label + " fields are not closed.");
  }
}

function scopeSnapshot(input, fields, label) {
  const value = snapshot(input, label);
  exact(value, fields, label);
  if (typeof value.root !== "string" || !isAbsolute(value.root) || normalize(value.root) !== value.root || resolve(value.root) !== value.root) {
    throw new StoreFailure("malformed_input", label + ".root must be a canonical absolute path.");
  }
  if (!Array.isArray(value.excludedRoots) || value.excludedRoots.length > 64 || value.excludedRoots.some((root) =>
    typeof root !== "string" || !isAbsolute(root) || normalize(root) !== root || resolve(root) !== root)) {
    throw new StoreFailure("malformed_input", label + ".excludedRoots are malformed.");
  }
  for (const field of ["repositoryId", "repositoryWorkspaceId"]) {
    if (typeof value[field] !== "string" || !IDENTIFIER.test(value[field])) {
      throw new StoreFailure("malformed_input", label + "." + field + " is malformed.");
    }
  }
  if (fields.includes("lockOwnerId") && (typeof value.lockOwnerId !== "string" || !LOCK_OWNER.test(value.lockOwnerId))) {
    throw new StoreFailure("malformed_input", label + ".lockOwnerId is malformed.");
  }
  return value;
}

function deliveryScopeSnapshot(input) {
  const value = scopeSnapshot(input, DELIVERY_FIELDS, "relay delivery input");
  if (!REVISION.test(value.repositoryRevision ?? "") || !RELAY_ID.test(value.relayId ?? "") ||
      !DIGEST.test(value.relayDigest ?? "")) {
    throw new StoreFailure("malformed_input", "Relay delivery identity is malformed.");
  }
  exact(value.recipient, RECIPIENT_FIELDS, "relay delivery input.recipient");
  for (const field of RECIPIENT_FIELDS) {
    if (!IDENTIFIER.test(value.recipient[field] ?? "")) {
      throw new StoreFailure("malformed_input", "relay delivery input.recipient." + field + " is malformed.");
    }
  }
  return value;
}

function storeFilename(repositoryId, repositoryWorkspaceId) {
  return createHash("sha256")
    .update("shield.feature-flight-relay-store.pending.v1\0")
    .update(repositoryId)
    .update("\0")
    .update(repositoryWorkspaceId)
    .digest("base64url") + ".jsonl";
}

function deliveryReceiptFilename(deliveryKey) {
  return deliveryKey.slice("relay-delivery:".length) + ".json";
}

function deliveryReceiptPath(paths, receipt) {
  return join(paths.inboxDirectory, deliveryReceiptFilename(receipt.deliveryKey));
}

export function deriveFeatureFlightRelayStorePathsV1(input) {
  const value = snapshot(input, "relay store path input");
  exact(value, ["root", "repositoryId", "repositoryWorkspaceId"], "relay store path input");
  if (typeof value.root !== "string" || !isAbsolute(value.root) || normalize(value.root) !== value.root || resolve(value.root) !== value.root ||
      !IDENTIFIER.test(value.repositoryId ?? "") || !IDENTIFIER.test(value.repositoryWorkspaceId ?? "")) {
    throw new Error("Feature Flight relay store path input is malformed.");
  }
  const filename = storeFilename(value.repositoryId, value.repositoryWorkspaceId);
  const directory = join(value.root, FEATURE_FLIGHT_RELAY_STORE_DIRECTORY);
  const witnessDirectory = join(value.root, FEATURE_FLIGHT_RELAY_WITNESS_DIRECTORY);
  const inboxDirectory = join(value.root, FEATURE_FLIGHT_RELAY_HILL_INBOX_DIRECTORY);
  const logPath = join(directory, filename);
  const witnessPath = join(witnessDirectory, filename);
  return Object.freeze({
    root: value.root,
    directory,
    logPath,
    witnessDirectory,
    witnessPath,
    lockPath: witnessPath + ".lock",
    inboxDirectory,
  });
}

async function retainDirectory(path, io) {
  const before = await io.lstat(path).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (before === null) return null;
  if (!before.isDirectory() || before.isSymbolicLink() || (before.mode & 0o777) !== 0o700) {
    storeFailure("unsafe_path", "Relay store directory is unsafe: " + path);
  }
  let handle;
  try {
    handle = await io.open(path, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    const canonical = await io.realpath(path);
    if (!opened.isDirectory() || (opened.mode & 0o777) !== 0o700 || !sameInode(before, opened) || canonical !== path) {
      storeFailure("unsafe_path", "Relay store directory identity is unsafe: " + path);
    }
    return { path, handle, identity: opened };
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => {});
    throw error;
  }
}

async function closeRetained(retained, label) {
  if (retained?.handle === undefined) return;
  try { await retained.handle.close(); }
  catch { storeFailure("recovery_required", label + " close is uncertain."); }
}

async function assertRetained(retained, io) {
  const [linked, opened, canonical] = await Promise.all([
    io.lstat(retained.path).catch(() => null),
    retained.handle.stat().catch(() => null),
    io.realpath(retained.path).catch(() => null),
  ]);
  if (!linked?.isDirectory() || linked.isSymbolicLink() || (linked.mode & 0o777) !== 0o700 || !opened?.isDirectory() ||
      (opened.mode & 0o777) !== 0o700 || !sameInode(retained.identity, linked) || !sameInode(retained.identity, opened) ||
      canonical !== retained.path) {
    storeFailure("recovery_required", "Relay store directory identity changed: " + retained.path);
  }
}

async function syncDirectory(retained, label) {
  try { await retained.handle.sync(); }
  catch { storeFailure("recovery_required", label + " sync is uncertain."); }
}

async function openHierarchy(scope, io, allowWitnessCreate) {
  const [rootBefore, rootCanonical] = await Promise.all([
    io.lstat(scope.root).catch(() => null),
    io.realpath(scope.root).catch(() => null),
  ]);
  if (!rootBefore?.isDirectory() || rootBefore.isSymbolicLink() || (rootBefore.mode & 0o777) !== 0o700 || rootCanonical !== scope.root) {
    storeFailure("unsafe_path", "Relay store root must be an existing canonical non-symlink mode-0700 directory.");
  }
  const excluded = await Promise.all(scope.excludedRoots.map((entry) => io.realpath(entry).catch(() => entry)));
  if (excluded.some((entry) => overlaps(rootCanonical, entry))) {
    storeFailure("unsafe_path", "Relay store root overlaps an excluded repository or worktree root.");
  }
  const root = await retainDirectory(scope.root, io);
  if (root === null || !sameInode(rootBefore, root.identity)) storeFailure("recovery_required", "Relay store root changed while opening.");
  const paths = deriveFeatureFlightRelayStorePathsV1({
    root: scope.root,
    repositoryId: scope.repositoryId,
    repositoryWorkspaceId: scope.repositoryWorkspaceId,
  });
  let directory;
  let witnessDirectory;
  let inboxDirectory;
  let witnessDirectoryCreated = false;
  try {
    directory = await retainDirectory(paths.directory, io);
    witnessDirectory = await retainDirectory(paths.witnessDirectory, io);
    inboxDirectory = await retainDirectory(paths.inboxDirectory, io);
    if (witnessDirectory === null && allowWitnessCreate) {
      if (directory !== null) storeFailure("recovery_required", "Relay witness directory is missing for an existing ledger scope.");
      await assertRetained(root, io);
      let created = false;
      try { await io.mkdir(paths.witnessDirectory, { mode: 0o700 }); created = true; }
      catch (error) { if (error?.code !== "EEXIST") throw error; }
      if (created) await syncDirectory(root, "Relay store root");
      witnessDirectoryCreated = created;
      witnessDirectory = await retainDirectory(paths.witnessDirectory, io);
      if (witnessDirectory === null) storeFailure("recovery_required", "Relay witness directory is unavailable after creation.");
    }
    await assertRetained(root, io);
    if (directory !== null) await assertRetained(directory, io);
    if (witnessDirectory !== null) await assertRetained(witnessDirectory, io);
    if (inboxDirectory !== null) await assertRetained(inboxDirectory, io);
    return { paths, root, directory, witnessDirectory, inboxDirectory, witnessDirectoryCreated };
  } catch (error) {
    await closeRetained(directory, "Relay ledger directory").catch(() => {});
    await closeRetained(witnessDirectory, "Relay witness directory").catch(() => {});
    await closeRetained(inboxDirectory, "Hill relay inbox directory").catch(() => {});
    await closeRetained(root, "Relay store root").catch(() => {});
    throw error;
  }
}

async function ensureLedgerDirectory(hierarchy, io) {
  if (hierarchy.directory !== null) return;
  await assertRetained(hierarchy.root, io);
  await assertRetained(hierarchy.witnessDirectory, io);
  let created = false;
  try { await io.mkdir(hierarchy.paths.directory, { mode: 0o700 }); created = true; }
  catch (error) { if (error?.code !== "EEXIST") throw error; }
  if (created) await syncDirectory(hierarchy.root, "Relay store root");
  hierarchy.directory = await retainDirectory(hierarchy.paths.directory, io);
  if (hierarchy.directory === null) storeFailure("recovery_required", "Relay ledger directory is unavailable after creation.");
}

async function closeHierarchy(hierarchy) {
  let first;
  for (const [retained, label] of [
    [hierarchy.inboxDirectory, "Hill relay inbox directory"],
    [hierarchy.directory, "Relay ledger directory"],
    [hierarchy.witnessDirectory, "Relay witness directory"],
    [hierarchy.root, "Relay store root"],
  ]) {
    try { await closeRetained(retained, label); } catch (error) { first ??= error; }
  }
  if (first !== undefined) throw first;
}

async function assertHierarchy(hierarchy, io) {
  await assertRetained(hierarchy.root, io);
  if (hierarchy.directory !== null) await assertRetained(hierarchy.directory, io);
  if (hierarchy.witnessDirectory !== null) await assertRetained(hierarchy.witnessDirectory, io);
  if (hierarchy.inboxDirectory != null) await assertRetained(hierarchy.inboxDirectory, io);
}

async function openInboxDirectory(hierarchy, io, allowCreate) {
  if (hierarchy.inboxDirectory !== null || !allowCreate) return hierarchy.inboxDirectory;
  const path = hierarchy.paths.inboxDirectory;
  let retained = hierarchy.inboxDirectory;
  if (retained === null && allowCreate) {
    await assertRetained(hierarchy.root, io);
    let created = false;
    try { await io.mkdir(path, { mode: 0o700 }); created = true; }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
    if (created) await syncDirectory(hierarchy.root, "Relay store root");
    retained = await retainDirectory(path, io);
    if (retained === null) storeFailure("recovery_required", "Hill relay inbox directory is unavailable after creation.");
  }
  hierarchy.inboxDirectory = retained;
  if (retained !== null) await assertRetained(retained, io);
  return retained;
}

function safeRegular(stats) {
  return stats?.isFile() && !stats.isSymbolicLink() && (stats.mode & 0o777) === 0o600 && Number(stats.nlink) === 1;
}

async function readFileSnapshot(path, hierarchy, io, label) {
  await assertHierarchy(hierarchy, io);
  const before = await io.lstat(path).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (before === null) return { missing: true, bytes: Buffer.alloc(0), identity: null };
  if (!safeRegular(before)) storeFailure("unsafe_path", label + " must be one mode-0600 non-aliased regular file.");
  let handle;
  let bytes;
  let opened;
  let closeError;
  try {
    handle = await io.open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    opened = await handle.stat();
    if (!safeRegular(opened) || !sameInode(before, opened)) storeFailure("recovery_required", label + " identity changed while opening.");
    bytes = await handle.readFile();
    const [retained, linked] = await Promise.all([handle.stat(), io.lstat(path).catch(() => null)]);
    if (!safeRegular(retained) || !safeRegular(linked) || !sameInode(opened, retained) || !sameInode(opened, linked) ||
        retained.size !== bytes.length || bytes.length > FEATURE_FLIGHT_RELAY_STORE_MAX_BYTES) {
      storeFailure("recovery_required", label + " identity or size changed during read.");
    }
  } catch (error) {
    if (["ELOOP", "ENOTDIR"].includes(error?.code)) storeFailure("unsafe_path", label + " path is unsafe.");
    if (error instanceof StoreFailure) throw error;
    storeFailure("recovery_required", label + " read is uncertain: " + (error?.code ?? "unknown_error") + ".");
  } finally {
    if (handle !== undefined) await handle.close().catch((error) => { closeError = error; });
  }
  if (closeError !== undefined) storeFailure("recovery_required", label + " read close is uncertain.");
  await assertHierarchy(hierarchy, io);
  return { missing: false, bytes, identity: { dev: Number(opened.dev), ino: Number(opened.ino), size: opened.size } };
}

async function readDeliveryReceiptSnapshot(hierarchy, expectedReceipt, io) {
  const inbox = await openInboxDirectory(hierarchy, io, false);
  const path = deliveryReceiptPath(hierarchy.paths, expectedReceipt);
  if (inbox === null) return { missing: true, path, bytes: Buffer.alloc(0), receipt: null, identity: null };
  const file = await readFileSnapshot(path, hierarchy, io, "Hill relay inbox receipt");
  if (file.missing) return { ...file, path, receipt: null };
  const parsed = strictParseJson(file.bytes.toString("utf8"), {
    maxBytes: FEATURE_FLIGHT_RELAY_STORE_MAX_ENTRY_BYTES,
    maxDepth: 24,
  });
  if (parsed.state !== "valid" ||
      !sameBytes(canonicalFeatureFlightRelayBytesV1(parsed.value), file.bytes)) {
    storeFailure("recovery_required", "Hill relay inbox receipt is not strict canonical JSON.");
  }
  const validation = validateFeatureFlightRelayDeliveryReceiptV1(parsed.value);
  if (validation.state !== "valid") {
    storeFailure("recovery_required", "Hill relay inbox receipt does not satisfy its closed contract.");
  }
  return { ...file, path, receipt: validation.value };
}

function requireExactDeliveryReceipt(observed, expected) {
  if (observed.receipt === null) storeFailure("delivery_missing", "Expected Hill relay inbox receipt is absent.");
  const receipt = observed.receipt;
  if (JSON.stringify(receipt.recipient) !== JSON.stringify(expected.recipient)) {
    storeFailure("recipient_mismatch", "Persisted delivery receipt recipient disagrees with the frozen recipient.");
  }
  if (receipt.repositoryRevision !== expected.repositoryRevision) {
    storeFailure("source_stale", "Persisted delivery receipt source revision disagrees with the frozen relay source.");
  }
  if (!sameBytes(canonicalFeatureFlightRelayBytesV1(receipt), canonicalFeatureFlightRelayBytesV1(expected))) {
    storeFailure("delivery_stale", "Persisted delivery receipt does not exactly match the internally derived receipt.");
  }
  return receipt;
}

async function createDeliveryReceiptExclusive(hierarchy, receipt, io) {
  const inbox = await openInboxDirectory(hierarchy, io, true);
  const path = deliveryReceiptPath(hierarchy.paths, receipt);
  const bytes = canonicalFeatureFlightRelayBytesV1(receipt);
  if (bytes.length > FEATURE_FLIGHT_RELAY_STORE_MAX_ENTRY_BYTES) {
    storeFailure("recovery_required", "Hill relay inbox receipt exceeds its compact byte limit.");
  }
  let handle;
  let opened;
  let closeError;
  try {
    await assertHierarchy(hierarchy, io);
    handle = await io.open(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    opened = await handle.stat();
    if (!safeRegular(opened) || opened.size !== 0) {
      storeFailure("recovery_required", "Hill relay inbox receipt target is unsafe.");
    }
    const written = await handle.write(bytes, 0, bytes.length, 0);
    if (written.bytesWritten !== bytes.length) storeFailure("recovery_required", "Hill relay inbox receipt write was partial.");
    await handle.sync();
    const [retained, linked] = await Promise.all([handle.stat(), io.lstat(path).catch(() => null)]);
    if (!safeRegular(retained) || !safeRegular(linked) || !sameInode(opened, retained) || !sameInode(opened, linked) ||
        retained.size !== bytes.length) {
      storeFailure("recovery_required", "Hill relay inbox receipt changed during exclusive creation.");
    }
  } catch (error) {
    if (["EEXIST", "ELOOP", "ENOTDIR"].includes(error?.code)) {
      storeFailure("recovery_required", "Hill relay inbox receipt exclusive creation could not be established.");
    }
    if (error instanceof StoreFailure) throw error;
    storeFailure("recovery_required", "Hill relay inbox receipt creation is uncertain: " + (error?.code ?? "unknown_error") + ".");
  } finally {
    if (handle !== undefined) await handle.close().catch((error) => { closeError = error; });
    if (closeError !== undefined) storeFailure("recovery_required", "Hill relay inbox receipt close is uncertain.");
  }
  await syncDirectory(inbox, "Hill relay inbox directory");
  await assertHierarchy(hierarchy, io);
  return { path, bytes, identity: { dev: Number(opened.dev), ino: Number(opened.ino), size: opened.size } };
}

function parseLines(snapshotValue, label) {
  if (snapshotValue.missing) return [];
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(snapshotValue.bytes); }
  catch { storeFailure("recovery_required", label + " contains invalid UTF-8."); }
  if (text.length === 0 || !text.endsWith("\n")) storeFailure("recovery_required", label + " is empty or has a partial final line.");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length > FEATURE_FLIGHT_RELAY_MAX_LEDGER_ENTRIES || lines.some((line) => line.length === 0)) {
    storeFailure("recovery_required", label + " line shape is invalid.");
  }
  return lines.map((line) => {
    const parsed = strictParseJson(line, { maxBytes: FEATURE_FLIGHT_RELAY_STORE_MAX_ENTRY_BYTES, maxDepth: 24 });
    if (parsed.state !== "valid") storeFailure("recovery_required", label + " line is not strict JSON: " + parsed.code + ".");
    if (!sameBytes(canonicalFeatureFlightRelayBytesV1(parsed.value), Buffer.from(line, "utf8"))) {
      storeFailure("recovery_required", label + " line is not canonical.");
    }
    return parsed.value;
  });
}

async function readRelaySnapshot(hierarchy, scope, io) {
  if (hierarchy.directory === null) {
    return { missing: true, bytes: Buffer.alloc(0), entries: [], replay: replayFeatureFlightRelayLedgerV1([]), identity: null };
  }
  const file = await readFileSnapshot(hierarchy.paths.logPath, hierarchy, io, "Relay ledger");
  if (file.missing) return { ...file, entries: [], replay: replayFeatureFlightRelayLedgerV1([]) };
  const entries = parseLines(file, "Relay ledger");
  const replay = replayFeatureFlightRelayLedgerV1(entries);
  if (replay.state !== "valid") storeFailure("recovery_required", "Relay ledger does not replay: " + replay.code + ".");
  if (replay.entries.some((entry) => entry.relay.source.repositoryId !== scope.repositoryId ||
      entry.relay.source.repositoryWorkspaceId !== scope.repositoryWorkspaceId)) {
    storeFailure("recovery_required", "Relay ledger contains foreign repository identity.");
  }
  return { ...file, entries: replay.entries, replay };
}

function witnessBody(value) {
  return Object.fromEntries(WITNESS_FIELDS.filter((field) => field !== "witnessDigest").map((field) => [field, value[field]]));
}

function validateWitness(input, scope) {
  const value = snapshot(input, "relay head witness");
  exact(value, WITNESS_FIELDS, "relay head witness");
  if (value.schemaVersion !== 1 || value.artifactType !== "feature-flight-relay-head-witness" ||
      value.contractVersion !== FEATURE_FLIGHT_RELAY_CONTRACT_VERSION || value.authority !== "none" ||
      value.notice !== FEATURE_FLIGHT_RELAY_NOTICE || value.repositoryId !== scope.repositoryId ||
      value.repositoryWorkspaceId !== scope.repositoryWorkspaceId || !Number.isSafeInteger(value.witnessSequence) ||
      value.witnessSequence < 0 || value.relayEntryCount !== value.witnessSequence + 1 ||
      !Number.isSafeInteger(value.relayByteLength) || value.relayByteLength < 1 ||
      (value.previousWitnessDigest !== null && !DIGEST.test(value.previousWitnessDigest)) ||
      !DIGEST.test(value.relayHeadDigest ?? "")) {
    storeFailure("recovery_required", "Relay head witness identity is invalid.");
  }
  const expected = featureFlightRelayDigestV1(witnessBody(value), "shield.feature-flight-relay.head-witness.v1");
  if (value.witnessDigest !== expected) storeFailure("recovery_required", "Relay head witness digest is invalid.");
  return Object.freeze(value);
}

async function readWitnessSnapshot(hierarchy, scope, io) {
  if (hierarchy.witnessDirectory === null) return { missing: true, bytes: Buffer.alloc(0), entries: [], identity: null };
  const file = await readFileSnapshot(hierarchy.paths.witnessPath, hierarchy, io, "Relay head witness");
  if (file.missing) return { ...file, entries: [] };
  const raw = parseLines(file, "Relay head witness");
  const entries = [];
  for (let index = 0; index < raw.length; index += 1) {
    const entry = validateWitness(raw[index], scope);
    if (entry.witnessSequence !== index ||
        entry.previousWitnessDigest !== (entries.at(-1)?.witnessDigest ?? null) ||
        (index > 0 && entry.relayByteLength <= entries[index - 1].relayByteLength)) {
      storeFailure("recovery_required", "Relay head witness monotonic chain is invalid.");
    }
    entries.push(entry);
  }
  return { ...file, entries: Object.freeze(entries) };
}

function expectedRelayPrefixBytes(entries, throughIndex) {
  return entries.slice(0, throughIndex + 1).reduce((total, entry) => total + lineFor(entry).length, 0);
}

async function readCombinedSnapshot(hierarchy, scope, io, allowFreshInitialization = false) {
  const [log, witness] = await Promise.all([
    readRelaySnapshot(hierarchy, scope, io),
    readWitnessSnapshot(hierarchy, scope, io),
  ]);
  if (log.missing && witness.missing) {
    if (hierarchy.witnessDirectory !== null && !allowFreshInitialization) {
      storeFailure("recovery_required", "Initialized relay scope is missing its ledger and monotonic head witness.");
    }
    return { log, witness };
  }
  if (log.missing !== witness.missing) {
    storeFailure("recovery_required", "Relay ledger and monotonic head witness presence do not agree.");
  }
  if (log.entries.length !== witness.entries.length || log.entries.length === 0) {
    storeFailure("recovery_required", "Relay ledger and monotonic head witness lengths do not agree.");
  }
  for (let index = 0; index < witness.entries.length; index += 1) {
    const observed = witness.entries[index];
    if (observed.relayEntryCount !== index + 1 || observed.relayHeadDigest !== log.entries[index].entryDigest ||
        observed.relayByteLength !== expectedRelayPrefixBytes(log.entries, index)) {
      storeFailure("recovery_required", "Relay ledger is missing, ahead of, or rolled back behind its monotonic head witness.");
    }
  }
  return { log, witness };
}

function readValue(hierarchy, current) {
  return Object.freeze({
    paths: hierarchy.paths,
    missing: current.log.missing,
    bytes: Buffer.from(current.log.bytes),
    entries: Object.freeze([...current.log.entries]),
    replay: current.log.replay,
    identity: current.log.identity === null ? null : Object.freeze({ ...current.log.identity }),
    witness: Object.freeze({
      missing: current.witness.missing,
      byteLength: current.witness.bytes.length,
      entries: Object.freeze([...current.witness.entries]),
      head: current.witness.entries.at(-1) ?? null,
    }),
  });
}

export async function readFeatureFlightRelayLogV1(input, injected = {}) {
  let scope;
  try { scope = scopeSnapshot(input, ["root", "excludedRoots", "repositoryId", "repositoryWorkspaceId"], "relay store read input"); }
  catch (error) { return resultFromError(error, "malformed_input"); }
  const io = Object.freeze({ ...defaultIo, ...injected });
  let hierarchy;
  try {
    hierarchy = await openHierarchy(scope, io, false);
    const current = await readCombinedSnapshot(hierarchy, scope, io);
    await closeHierarchy(hierarchy);
    return valid(readValue(hierarchy, current));
  } catch (error) {
    if (hierarchy !== undefined) await closeHierarchy(hierarchy).catch(() => {});
    return resultFromError(error);
  }
}

function lockMarker(scope) {
  return Buffer.from("feature-flight-relay-lock:" + scope.repositoryId + ":" + scope.repositoryWorkspaceId + ":" + scope.lockOwnerId + "\n", "utf8");
}

async function acquireLock(hierarchy, scope, io) {
  const path = hierarchy.paths.lockPath;
  const existing = await io.lstat(path).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existing !== null) {
    if (!safeRegular(existing)) storeFailure("unsafe_path", "Relay lock path is unsafe or aliased.");
    storeFailure("relay_lock_held", "Relay lock is held.");
  }
  const marker = lockMarker(scope);
  let handle;
  let opened;
  let created = false;
  let closeError;
  try {
    await assertHierarchy(hierarchy, io);
    handle = await io.open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    created = true;
    opened = await handle.stat();
    if (!safeRegular(opened) || opened.size !== 0) storeFailure("recovery_required", "Relay lock target is unsafe.");
    const written = await handle.write(marker, 0, marker.length, 0);
    if (written.bytesWritten !== marker.length) storeFailure("recovery_required", "Relay lock marker write was partial.");
    await handle.sync();
    const [retained, linked] = await Promise.all([handle.stat(), io.lstat(path).catch(() => null)]);
    if (!safeRegular(retained) || !safeRegular(linked) || retained.size !== marker.length ||
        !sameInode(opened, retained) || !sameInode(opened, linked)) {
      storeFailure("recovery_required", "Relay lock identity changed during acquisition.");
    }
    await syncDirectory(hierarchy.witnessDirectory, "Relay witness directory");
  } catch (error) {
    if (!created && error?.code === "EEXIST") storeFailure("relay_lock_held", "Relay lock is held.");
    if (!created && ["ELOOP", "ENOTDIR"].includes(error?.code)) storeFailure("unsafe_path", "Relay lock path is unsafe.");
    if (created && !(error instanceof StoreFailure)) {
      storeFailure("recovery_required", "Relay lock acquisition is uncertain: " + (error?.code ?? "unknown_error") + ".");
    }
    throw error;
  } finally {
    if (handle !== undefined) await handle.close().catch((error) => { closeError = error; });
    if (closeError !== undefined) storeFailure("recovery_required", "Relay lock close is uncertain.");
  }
  return { path, marker, dev: Number(opened.dev), ino: Number(opened.ino) };
}

async function readLock(token, io) {
  const before = await io.lstat(token.path).catch(() => null);
  if (!safeRegular(before) || Number(before.dev) !== token.dev || Number(before.ino) !== token.ino) return false;
  let handle;
  let closeFailed = false;
  try {
    handle = await io.open(token.path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (!safeRegular(opened) || !sameInode(before, opened)) return false;
    const marker = await handle.readFile();
    const linked = await io.lstat(token.path).catch(() => null);
    return safeRegular(linked) && sameInode(opened, linked) && sameBytes(marker, token.marker);
  } catch { return false; }
  finally {
    if (handle !== undefined) await handle.close().catch(() => { closeFailed = true; });
    if (closeFailed) storeFailure("recovery_required", "Relay lock read close is uncertain.");
  }
}

async function releaseLock(token, hierarchy, io) {
  if (!await readLock(token, io)) storeFailure("recovery_required", "Relay lock ownership changed before release.");
  const linked = await io.lstat(token.path).catch(() => null);
  if (!safeRegular(linked) || Number(linked.dev) !== token.dev || Number(linked.ino) !== token.ino) {
    storeFailure("recovery_required", "Relay lock target changed before unlink.");
  }
  try { await io.unlink(token.path); }
  catch { storeFailure("recovery_required", "Relay lock unlink is uncertain."); }
  await syncDirectory(hierarchy.witnessDirectory, "Relay witness directory");
  await assertHierarchy(hierarchy, io);
}

async function appendLine(path, parent, current, line, hierarchy, io, label) {
  if (line.length > FEATURE_FLIGHT_RELAY_STORE_MAX_ENTRY_BYTES || current.bytes.length + line.length > FEATURE_FLIGHT_RELAY_STORE_MAX_BYTES) {
    storeFailure("relay_store_limit", label + " compact limits would be exceeded.");
  }
  const before = await io.lstat(path).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (current.missing !== (before === null)) storeFailure("recovery_required", label + " existence changed before append.");
  if (before !== null && (!safeRegular(before) || current.identity === null || Number(before.dev) !== current.identity.dev ||
      Number(before.ino) !== current.identity.ino || before.size !== current.bytes.length)) {
    storeFailure("recovery_required", label + " identity changed before append.");
  }
  let handle;
  let opened;
  let created = false;
  let closeError;
  try {
    await assertHierarchy(hierarchy, io);
    handle = await io.open(path, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    opened = await handle.stat();
    created = before === null;
    if (!safeRegular(opened) || opened.size !== current.bytes.length || (before !== null && !sameInode(before, opened))) {
      storeFailure("recovery_required", label + " target changed while opening for append.");
    }
    const written = await handle.write(line, 0, line.length, null);
    if (written.bytesWritten !== line.length) storeFailure("recovery_required", label + " write was partial.");
    await handle.sync();
    const [retained, linked] = await Promise.all([handle.stat(), io.lstat(path).catch(() => null)]);
    if (!safeRegular(retained) || !safeRegular(linked) || !sameInode(opened, retained) || !sameInode(opened, linked) ||
        retained.size !== current.bytes.length + line.length) {
      storeFailure("recovery_required", label + " changed during append.");
    }
  } catch (error) {
    if (["ELOOP", "ENOTDIR"].includes(error?.code)) storeFailure("unsafe_path", label + " path is unsafe.");
    if (error instanceof StoreFailure) throw error;
    storeFailure("recovery_required", label + " append is uncertain: " + (error?.code ?? "unknown_error") + ".");
  } finally {
    if (handle !== undefined) await handle.close().catch((error) => { closeError = error; });
    if (closeError !== undefined) storeFailure("recovery_required", label + " append close is uncertain.");
  }
  if (created) await syncDirectory(parent, label + " directory");
  await assertHierarchy(hierarchy, io);
}

function createWitness(scope, current, logAfter) {
  const body = {
    schemaVersion: 1,
    artifactType: "feature-flight-relay-head-witness",
    contractVersion: FEATURE_FLIGHT_RELAY_CONTRACT_VERSION,
    authority: "none",
    notice: FEATURE_FLIGHT_RELAY_NOTICE,
    repositoryId: scope.repositoryId,
    repositoryWorkspaceId: scope.repositoryWorkspaceId,
    witnessSequence: current.entries.length,
    previousWitnessDigest: current.entries.at(-1)?.witnessDigest ?? null,
    relayEntryCount: logAfter.entries.length,
    relayByteLength: logAfter.bytes.length,
    relayHeadDigest: logAfter.entries.at(-1).entryDigest,
  };
  return validateWitness({
    ...body,
    witnessDigest: featureFlightRelayDigestV1(body, "shield.feature-flight-relay.head-witness.v1"),
  }, scope);
}

async function appendDeliveredLifecycle(hierarchy, scope, current, entry, io) {
  const relayLine = lineFor(entry);
  await appendLine(
    hierarchy.paths.logPath,
    hierarchy.directory,
    current.log,
    relayLine,
    hierarchy,
    io,
    "Relay ledger",
  );

  let logAfter;
  try { logAfter = await readRelaySnapshot(hierarchy, scope, io); }
  catch (error) {
    storeFailure("recovery_required", "Delivered relay post-append readback is uncertain: " +
      (error instanceof Error ? error.message : "unknown_error") + ".");
  }
  const expectedRelayBytes = Buffer.concat([current.log.bytes, relayLine]);
  if (!sameBytes(logAfter.bytes, expectedRelayBytes) || logAfter.entries.length !== current.log.entries.length + 1 ||
      logAfter.entries.at(-1)?.entryDigest !== entry.entryDigest) {
    storeFailure("recovery_required", "Delivered relay exact readback does not match the lifecycle append.");
  }

  const witness = createWitness(scope, current.witness, logAfter);
  const witnessLine = lineFor(witness);
  await appendLine(
    hierarchy.paths.witnessPath,
    hierarchy.witnessDirectory,
    current.witness,
    witnessLine,
    hierarchy,
    io,
    "Relay head witness",
  );

  let after;
  try { after = await readCombinedSnapshot(hierarchy, scope, io); }
  catch (error) {
    storeFailure("recovery_required", "Delivered relay and witness readback is uncertain: " +
      (error instanceof Error ? error.message : "unknown_error") + ".");
  }
  const expectedWitnessBytes = Buffer.concat([current.witness.bytes, witnessLine]);
  if (!sameBytes(after.log.bytes, expectedRelayBytes) || !sameBytes(after.witness.bytes, expectedWitnessBytes) ||
      after.log.entries.at(-1)?.entryDigest !== entry.entryDigest ||
      after.witness.entries.at(-1)?.witnessDigest !== witness.witnessDigest) {
    storeFailure("recovery_required", "Delivered relay and monotonic witness exact readback does not match the append.");
  }
  return after;
}

function deliveryBinding(scope) {
  return Object.freeze({
    relayId: scope.relayId,
    relayDigest: scope.relayDigest,
    repositoryId: scope.repositoryId,
    repositoryWorkspaceId: scope.repositoryWorkspaceId,
    repositoryRevision: scope.repositoryRevision,
    recipient: canonicalFeatureFlightRelayValueV1(scope.recipient),
  });
}

function reconcileDelivery(current, scope) {
  const reconciliation = reconcileFeatureFlightRelayDeliveryV1(current.log.entries, deliveryBinding(scope));
  if (reconciliation.state === "accepted" || reconciliation.state === "duplicate") return reconciliation;
  storeFailure(
    reconciliation.code ?? "recovery_required",
    reconciliation.reasonCodes?.[0] ?? "Relay delivery reconciliation failed.",
  );
}

function directDeliveredEntry(current, reconciliation) {
  const pendingEntry = current.log.entries.find((entry) => entry.kind === "relay.pending" &&
    entry.relayId === reconciliation.deliveryReceipt.relayId);
  if (pendingEntry === undefined) storeFailure("illegal_transition", "Relay delivery has no exact pending lifecycle genesis.");
  const derivedReceipt = createFeatureFlightRelayDeliveryReceiptV1({ relay: pendingEntry.relay });
  if (!sameBytes(
    canonicalFeatureFlightRelayBytesV1(derivedReceipt),
    canonicalFeatureFlightRelayBytesV1(reconciliation.deliveryReceipt),
  )) {
    storeFailure("delivery_stale", "Internally derived delivery receipt disagrees with the reconciled binding.");
  }
  let entry;
  try {
    entry = createFeatureFlightRelayDeliveredEntryV1({
      logSequence: current.log.entries.length,
      previousLogDigest: current.log.entries.at(-1)?.entryDigest ?? null,
      pendingEntry,
    });
  } catch (error) {
    storeFailure("illegal_transition", error instanceof Error ? error.message : "Relay delivery transition is invalid.");
  }
  if (entry.entryDigest !== reconciliation.entry.entryDigest ||
      !sameBytes(
        canonicalFeatureFlightRelayBytesV1(entry.deliveryReceipt),
        canonicalFeatureFlightRelayBytesV1(reconciliation.deliveryReceipt),
      )) {
    storeFailure("recovery_required", "Direct delivered lifecycle derivation disagrees with contract reconciliation.");
  }
  return entry;
}

function duplicateDeliveryValue(hierarchy, current, reconciliation, observed) {
  requireExactDeliveryReceipt(observed, reconciliation.deliveryReceipt);
  return valid(Object.freeze({
    status: "duplicate",
    code: "duplicate",
    appended: false,
    log: readValue(hierarchy, current),
    entry: reconciliation.entry,
    deliveryReceipt: reconciliation.deliveryReceipt,
    receiptPath: observed.path,
  }));
}

const DELIVERY_FAILURE_CODES = new Set([
  "relay_missing", "delivery_missing", "recipient_mismatch", "source_stale", "delivery_stale", "duplicate",
  "conflicting_reuse", "illegal_transition", "recovery_required",
]);

function deliveryResultFromError(error) {
  if (error instanceof StoreFailure && DELIVERY_FAILURE_CODES.has(error.code)) return invalid(error.code, error.message);
  return invalid(
    "recovery_required",
    error instanceof Error ? error.message : "Relay delivery store operation requires recovery.",
  );
}

async function deliverPendingUnderLock(scope, io) {
  let hierarchy;
  let token;
  let result;
  let terminalError;
  try {
    hierarchy = await openHierarchy(scope, io, false);
    token = await acquireLock(hierarchy, scope, io);
    const current = await readCombinedSnapshot(hierarchy, scope, io);
    const reconciliation = reconcileDelivery(current, scope);
    const expectedReceipt = reconciliation.deliveryReceipt;
    const before = await readDeliveryReceiptSnapshot(hierarchy, expectedReceipt, io);

    if (reconciliation.state === "duplicate") {
      result = duplicateDeliveryValue(hierarchy, current, reconciliation, before);
    } else {
      if (!before.missing) requireExactDeliveryReceipt(before, expectedReceipt);
      if (before.missing) await createDeliveryReceiptExclusive(hierarchy, expectedReceipt, io);
      const afterProvider = await readDeliveryReceiptSnapshot(hierarchy, expectedReceipt, io);
      requireExactDeliveryReceipt(afterProvider, expectedReceipt);

      const entry = directDeliveredEntry(current, reconciliation);
      const after = await appendDeliveredLifecycle(hierarchy, scope, current, entry, io);
      const finalReceipt = await readDeliveryReceiptSnapshot(hierarchy, expectedReceipt, io);
      requireExactDeliveryReceipt(finalReceipt, expectedReceipt);
      if (afterProvider.identity === null || finalReceipt.identity === null ||
          afterProvider.identity.dev !== finalReceipt.identity.dev || afterProvider.identity.ino !== finalReceipt.identity.ino ||
          !sameBytes(afterProvider.bytes, finalReceipt.bytes)) {
        storeFailure("recovery_required", "Hill relay inbox receipt identity changed during lifecycle append.");
      }
      result = valid(Object.freeze({
        status: "delivered",
        appended: true,
        log: readValue(hierarchy, after),
        entry,
        deliveryReceipt: expectedReceipt,
        receiptPath: finalReceipt.path,
      }));
    }
  } catch (error) { terminalError = error; }
  if (token !== undefined && hierarchy !== undefined) {
    try { await releaseLock(token, hierarchy, io); } catch (error) { terminalError ??= error; }
  }
  if (hierarchy !== undefined) {
    try { await closeHierarchy(hierarchy); } catch (error) { terminalError ??= error; }
  }
  return terminalError === undefined ? result : deliveryResultFromError(terminalError);
}

async function appendUnderLock(scope, io, operation) {
  let hierarchy;
  let token;
  let result;
  let terminalError;
  try {
    hierarchy = await openHierarchy(scope, io, true);
    token = await acquireLock(hierarchy, scope, io);
    const current = await readCombinedSnapshot(hierarchy, scope, io, hierarchy.witnessDirectoryCreated);
    result = await operation(hierarchy, current);
  } catch (error) { terminalError = error; }
  if (token !== undefined && hierarchy !== undefined) {
    try { await releaseLock(token, hierarchy, io); } catch (error) { terminalError ??= error; }
  }
  if (hierarchy !== undefined) {
    try { await closeHierarchy(hierarchy); } catch (error) { terminalError ??= error; }
  }
  return terminalError === undefined ? result : resultFromError(terminalError, "recovery_required");
}

export async function deliverFeatureFlightRelayToHillInboxV1(input, injected = {}) {
  let scope;
  try { scope = deliveryScopeSnapshot(input); }
  catch (error) { return resultFromError(error, "malformed_input"); }
  const io = Object.freeze({ ...defaultIo, ...injected });

  let hierarchy;
  let reconciliation;
  let preflightError;
  try {
    hierarchy = await openHierarchy(scope, io, false);
    const current = await readCombinedSnapshot(hierarchy, scope, io, true);
    reconciliation = reconcileDelivery(current, scope);
  } catch (error) { preflightError = error; }
  if (hierarchy !== undefined) {
    try { await closeHierarchy(hierarchy); } catch (error) { preflightError ??= error; }
  }
  if (preflightError !== undefined) return deliveryResultFromError(preflightError);
  if (!["accepted", "duplicate"].includes(reconciliation?.state)) {
    return invalid("recovery_required", "Relay delivery preflight did not select one deliverable relay.");
  }
  return deliverPendingUnderLock(scope, io);
}

export async function appendFeatureFlightRelayFromSeatDispatchIfAbsentV1(input, injected = {}) {
  let scope;
  try { scope = scopeSnapshot(input, APPEND_FIELDS, "terminal dispatch relay append input"); }
  catch (error) { return resultFromError(error, "malformed_input"); }

  const relayResult = await createFeatureFlightRelayFromSeatDispatchV1(
    Object.freeze(Object.fromEntries(CREATE_FIELDS.map((field) => [field, scope[field]]))),
  );
  if (relayResult.state !== "valid") {
    return invalid(relayResult.code, relayResult.reasonCodes?.[0] ?? "Terminal dispatch relay derivation failed.");
  }

  const relay = relayResult.value;
  const io = Object.freeze({ ...defaultIo, ...injected });
  return appendUnderLock(scope, io, async (hierarchy, current) => {
    const existingRelay = current.log.entries.find((entry) => entry.relayId === relay.relayId);
    if (existingRelay !== undefined) {
      if (existingRelay.relayDigest !== relay.relayDigest) {
        storeFailure("conflicting_reuse", "Relay identity is bound to conflicting content.");
      }
      return valid(Object.freeze({
        status: "duplicate",
        appended: false,
        log: readValue(hierarchy, current),
        relay,
        entry: existingRelay,
      }));
    }

    const sourceConflict = current.log.entries.find((entry) =>
      entry.relay.source.receiptId === relay.source.receiptId &&
      entry.relay.source.dispatchId === relay.source.dispatchId &&
      entry.relay.terminal.entryDigest === relay.terminal.entryDigest,
    );
    if (sourceConflict !== undefined) {
      storeFailure("source_conflict", "Terminal source identity is already bound to a different relay.");
    }

    const entry = createFeatureFlightRelayEntryV1({
      logSequence: current.log.entries.length,
      previousLogDigest: current.log.entries.at(-1)?.entryDigest ?? null,
      relay,
    });
    await ensureLedgerDirectory(hierarchy, io);
    const relayLine = lineFor(entry);
    await appendLine(
      hierarchy.paths.logPath,
      hierarchy.directory,
      current.log,
      relayLine,
      hierarchy,
      io,
      "Relay ledger",
    );

    let logAfter;
    try { logAfter = await readRelaySnapshot(hierarchy, scope, io); }
    catch (error) {
      storeFailure("recovery_required", "Relay post-append readback is uncertain: " +
        (error instanceof Error ? error.message : "unknown_error") + ".");
    }
    const expectedRelayBytes = Buffer.concat([current.log.bytes, relayLine]);
    if (!sameBytes(logAfter.bytes, expectedRelayBytes) || logAfter.entries.length !== current.log.entries.length + 1 ||
        logAfter.entries.at(-1)?.entryDigest !== entry.entryDigest) {
      storeFailure("recovery_required", "Relay exact readback does not match the append.");
    }

    const witness = createWitness(scope, current.witness, logAfter);
    const witnessLine = lineFor(witness);
    await appendLine(
      hierarchy.paths.witnessPath,
      hierarchy.witnessDirectory,
      current.witness,
      witnessLine,
      hierarchy,
      io,
      "Relay head witness",
    );

    let after;
    try { after = await readCombinedSnapshot(hierarchy, scope, io); }
    catch (error) {
      storeFailure("recovery_required", "Relay and witness readback is uncertain: " +
        (error instanceof Error ? error.message : "unknown_error") + ".");
    }
    const expectedWitnessBytes = Buffer.concat([current.witness.bytes, witnessLine]);
    if (!sameBytes(after.log.bytes, expectedRelayBytes) || !sameBytes(after.witness.bytes, expectedWitnessBytes) ||
        after.log.entries.at(-1)?.entryDigest !== entry.entryDigest ||
        after.witness.entries.at(-1)?.witnessDigest !== witness.witnessDigest) {
      storeFailure("recovery_required", "Relay and monotonic witness exact readback does not match the append.");
    }
    return valid(Object.freeze({
      status: "appended",
      appended: true,
      log: readValue(hierarchy, after),
      relay,
      entry,
    }));
  });
}
