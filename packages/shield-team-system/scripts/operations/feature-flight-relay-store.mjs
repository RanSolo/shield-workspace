import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import { isProxy } from "node:util/types";

import { strictParseJson } from "../model/strict-json.mjs";
import {
  FEATURE_FLIGHT_RELAY_MAX_LEDGER_ENTRIES,
  canonicalFeatureFlightRelayBytesV1,
  createFeatureFlightRelayEntryV1,
  reconcileFeatureFlightRelayEntryV1,
  replayFeatureFlightRelayLedgerV1,
  validateFeatureFlightRelayEntryV1,
  validateFeatureFlightRelayV1,
} from "./feature-flight-relay.mjs";

export const FEATURE_FLIGHT_RELAY_STORE_DIRECTORY = "relay-ledgers";
export const FEATURE_FLIGHT_RELAY_STORE_MAX_BYTES = 16 * 1024 * 1024;
export const FEATURE_FLIGHT_RELAY_STORE_MAX_ENTRY_BYTES = 16 * 1024;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const LOCK_OWNER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,127}$/u;
const defaultIo = Object.freeze({ lstat, mkdir, open, realpath, unlink });

const valid = (value) => Object.freeze({ state: "valid", value });
const invalid = (code, message) => Object.freeze({ state: "invalid", code, errors: Object.freeze([message]) });
const sameInode = (left, right) => Number(left?.dev) === Number(right?.dev) && Number(left?.ino) === Number(right?.ino);
const sameBytes = (left, right) => Buffer.from(left).equals(Buffer.from(right));
const overlaps = (left, right) => {
  const folded = (value) => value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
  const a = folded(left);
  const b = folded(right);
  return a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`);
};
const entryLine = (entry) => Buffer.concat([canonicalFeatureFlightRelayBytesV1(entry), Buffer.from("\n", "utf8")]);

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
    if (!Number.isSafeInteger(value)) throw new StoreFailure("malformed_input", `${label} must use safe integers.`);
    return value;
  }
  if (typeof value !== "object" || safeIsProxy(value)) throw new StoreFailure("malformed_input", `${label} contains unsupported data.`);
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) || ancestors.has(value)) {
    throw new StoreFailure("malformed_input", `${label} must be acyclic closed ordinary data.`);
  }
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = array ? new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]) : null;
  const clone = array ? [] : {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || (allowed !== null && !allowed.has(key))) throw new StoreFailure("malformed_input", `${label} contains an unsupported field.`);
    if (array && key === "length") continue;
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
      throw new StoreFailure("malformed_input", `${label}.${key} must be an own enumerable data field.`);
    }
    clone[key] = snapshot(descriptor.value, `${label}.${key}`, ancestors);
  }
  if (array && clone.length !== value.length) throw new StoreFailure("malformed_input", `${label} must be dense.`);
  ancestors.delete(value);
  return Object.freeze(clone);
}

function exact(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field)) ||
      Object.keys(value).some((field) => !fields.includes(field))) {
    throw new StoreFailure("malformed_input", `${label} fields are not closed.`);
  }
}

function scopeSnapshot(input, fields, label) {
  const value = snapshot(input, label);
  exact(value, fields, label);
  if (typeof value.root !== "string" || !isAbsolute(value.root) || normalize(value.root) !== value.root || resolve(value.root) !== value.root) {
    throw new StoreFailure("malformed_input", `${label}.root must be a canonical absolute path.`);
  }
  if (!Array.isArray(value.excludedRoots) || value.excludedRoots.length > 64 || value.excludedRoots.some((root) =>
    typeof root !== "string" || !isAbsolute(root) || normalize(root) !== root || resolve(root) !== root)) {
    throw new StoreFailure("malformed_input", `${label}.excludedRoots are malformed.`);
  }
  for (const field of ["repositoryId", "repositoryWorkspaceId"]) {
    if (typeof value[field] !== "string" || !IDENTIFIER.test(value[field])) throw new StoreFailure("malformed_input", `${label}.${field} is malformed.`);
  }
  if (fields.includes("lockOwnerId") && (typeof value.lockOwnerId !== "string" || !LOCK_OWNER.test(value.lockOwnerId))) {
    throw new StoreFailure("malformed_input", `${label}.lockOwnerId is malformed.`);
  }
  return value;
}

function storeFilename(repositoryId, repositoryWorkspaceId) {
  return `${createHash("sha256").update("shield.feature-flight-relay-store.pending.v1\0").update(repositoryId).update("\0").update(repositoryWorkspaceId).digest("base64url")}.jsonl`;
}

export function deriveFeatureFlightRelayStorePathsV1(input) {
  const value = snapshot(input, "relay store path input");
  exact(value, ["root", "repositoryId", "repositoryWorkspaceId"], "relay store path input");
  if (typeof value.root !== "string" || !isAbsolute(value.root) || normalize(value.root) !== value.root || resolve(value.root) !== value.root ||
      !IDENTIFIER.test(value.repositoryId ?? "") || !IDENTIFIER.test(value.repositoryWorkspaceId ?? "")) {
    throw new Error("Feature Flight relay store path input is malformed.");
  }
  const directory = join(value.root, FEATURE_FLIGHT_RELAY_STORE_DIRECTORY);
  const logPath = join(directory, storeFilename(value.repositoryId, value.repositoryWorkspaceId));
  return Object.freeze({ root: value.root, directory, logPath, lockPath: `${logPath}.lock` });
}

async function retainDirectory(path, io) {
  const before = await io.lstat(path).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (before === null) return null;
  if (!before.isDirectory() || before.isSymbolicLink() || (before.mode & 0o777) !== 0o700) storeFailure("unsafe_path", `Relay store directory is unsafe: ${path}`);
  let handle;
  try {
    handle = await io.open(path, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    const canonical = await io.realpath(path);
    if (!opened.isDirectory() || (opened.mode & 0o777) !== 0o700 || !sameInode(before, opened) || canonical !== path) {
      storeFailure("unsafe_path", `Relay store directory identity is unsafe: ${path}`);
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
  catch { storeFailure("recovery_required", `${label} close is uncertain.`); }
}

async function assertRetained(retained, io) {
  const [linked, opened, canonical] = await Promise.all([
    io.lstat(retained.path).catch(() => null), retained.handle.stat().catch(() => null), io.realpath(retained.path).catch(() => null),
  ]);
  if (!linked?.isDirectory() || linked.isSymbolicLink() || (linked.mode & 0o777) !== 0o700 || !opened?.isDirectory() ||
      (opened.mode & 0o777) !== 0o700 || !sameInode(retained.identity, linked) || !sameInode(retained.identity, opened) || canonical !== retained.path) {
    storeFailure("recovery_required", `Relay store directory identity changed: ${retained.path}`);
  }
}

async function syncDirectory(retained, label) {
  try { await retained.handle.sync(); }
  catch { storeFailure("recovery_required", `${label} sync is uncertain.`); }
}

async function openHierarchy(scope, io, allowCreate) {
  const [rootBefore, rootCanonical] = await Promise.all([io.lstat(scope.root).catch(() => null), io.realpath(scope.root).catch(() => null)]);
  if (!rootBefore?.isDirectory() || rootBefore.isSymbolicLink() || (rootBefore.mode & 0o777) !== 0o700 || rootCanonical !== scope.root) {
    storeFailure("unsafe_path", "Relay store root must be an existing canonical non-symlink mode-0700 directory.");
  }
  const excluded = await Promise.all(scope.excludedRoots.map((entry) => io.realpath(entry).catch(() => entry)));
  if (excluded.some((entry) => overlaps(rootCanonical, entry))) storeFailure("unsafe_path", "Relay store root overlaps an excluded repository or worktree root.");
  const root = await retainDirectory(scope.root, io);
  if (root === null || !sameInode(rootBefore, root.identity)) storeFailure("recovery_required", "Relay store root changed while opening.");
  const paths = deriveFeatureFlightRelayStorePathsV1({
    root: scope.root,
    repositoryId: scope.repositoryId,
    repositoryWorkspaceId: scope.repositoryWorkspaceId,
  });
  let directory;
  try {
    directory = await retainDirectory(paths.directory, io);
    if (directory === null && allowCreate) {
      await assertRetained(root, io);
      let created = false;
      try { await io.mkdir(paths.directory, { mode: 0o700 }); created = true; }
      catch (error) { if (error?.code !== "EEXIST") throw error; }
      if (created) await syncDirectory(root, "Relay store root");
      directory = await retainDirectory(paths.directory, io);
      if (directory === null) storeFailure("recovery_required", "Relay ledger directory is unavailable after creation.");
    }
    await assertRetained(root, io);
    if (directory !== null) await assertRetained(directory, io);
    return { paths, root, directory };
  } catch (error) {
    await closeRetained(directory, "Relay ledger directory").catch(() => {});
    await closeRetained(root, "Relay store root").catch(() => {});
    throw error;
  }
}

async function closeHierarchy(hierarchy) {
  let first;
  for (const [retained, label] of [[hierarchy.directory, "Relay ledger directory"], [hierarchy.root, "Relay store root"]]) {
    try { await closeRetained(retained, label); } catch (error) { first ??= error; }
  }
  if (first !== undefined) throw first;
}

async function assertHierarchy(hierarchy, io) {
  await assertRetained(hierarchy.root, io);
  if (hierarchy.directory !== null) await assertRetained(hierarchy.directory, io);
}

function safeRegular(stats) {
  return stats?.isFile() && !stats.isSymbolicLink() && (stats.mode & 0o777) === 0o600 && Number(stats.nlink) === 1;
}

async function readLogSnapshot(hierarchy, scope, io) {
  const empty = () => ({ missing: true, bytes: Buffer.alloc(0), entries: [], replay: replayFeatureFlightRelayLedgerV1([]), identity: null });
  if (hierarchy.directory === null) return empty();
  await assertHierarchy(hierarchy, io);
  const before = await io.lstat(hierarchy.paths.logPath).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (before === null) return empty();
  if (!safeRegular(before)) storeFailure("unsafe_path", "Relay ledger must be one mode-0600 non-aliased regular file.");
  let handle;
  let bytes;
  let opened;
  let closeError;
  try {
    handle = await io.open(hierarchy.paths.logPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    opened = await handle.stat();
    if (!safeRegular(opened) || !sameInode(before, opened)) storeFailure("recovery_required", "Relay ledger identity changed while opening.");
    bytes = await handle.readFile();
    const [retained, linked] = await Promise.all([handle.stat(), io.lstat(hierarchy.paths.logPath).catch(() => null)]);
    if (!safeRegular(retained) || !safeRegular(linked) || !sameInode(opened, retained) || !sameInode(opened, linked) ||
        retained.size !== bytes.length || bytes.length > FEATURE_FLIGHT_RELAY_STORE_MAX_BYTES) {
      storeFailure("recovery_required", "Relay ledger identity or size changed during read.");
    }
  } catch (error) {
    if (["ELOOP", "ENOTDIR"].includes(error?.code)) storeFailure("unsafe_path", "Relay ledger path is unsafe.");
    if (error instanceof StoreFailure) throw error;
    storeFailure("recovery_required", `Relay ledger read is uncertain: ${error?.code ?? "unknown_error"}.`);
  } finally {
    if (handle !== undefined) await handle.close().catch((error) => { closeError = error; });
  }
  if (closeError !== undefined) storeFailure("recovery_required", "Relay ledger read close is uncertain.");
  await assertHierarchy(hierarchy, io);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { storeFailure("relay_replay_invalid", "Relay ledger contains invalid UTF-8."); }
  if (text.length === 0 || !text.endsWith("\n")) storeFailure("relay_replay_invalid", "Relay ledger is empty or has a partial final line.");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length > FEATURE_FLIGHT_RELAY_MAX_LEDGER_ENTRIES || lines.some((line) => line.length === 0)) storeFailure("relay_replay_invalid", "Relay ledger line shape is invalid.");
  const entries = [];
  for (const line of lines) {
    const parsed = strictParseJson(line, { maxBytes: FEATURE_FLIGHT_RELAY_STORE_MAX_ENTRY_BYTES, maxDepth: 24 });
    if (parsed.state !== "valid") storeFailure("relay_replay_invalid", `Relay ledger line is not strict JSON: ${parsed.code}.`);
    if (!sameBytes(canonicalFeatureFlightRelayBytesV1(parsed.value), Buffer.from(line, "utf8"))) storeFailure("relay_replay_invalid", "Relay ledger line is not canonical.");
    entries.push(parsed.value);
  }
  const replay = replayFeatureFlightRelayLedgerV1(entries);
  if (replay.state !== "valid") storeFailure("relay_replay_invalid", `Relay ledger does not replay: ${replay.code}.`);
  if (replay.entries.some((entry) => entry.relay.source.repositoryId !== scope.repositoryId ||
      entry.relay.source.repositoryWorkspaceId !== scope.repositoryWorkspaceId)) storeFailure("relay_replay_invalid", "Relay ledger contains foreign repository identity.");
  return { missing: false, bytes, entries: replay.entries, replay, identity: { dev: Number(opened.dev), ino: Number(opened.ino), size: opened.size } };
}

function readValue(hierarchy, current) {
  return Object.freeze({
    paths: hierarchy.paths,
    missing: current.missing,
    bytes: Buffer.from(current.bytes),
    entries: Object.freeze([...current.entries]),
    replay: current.replay,
    identity: current.identity === null ? null : Object.freeze({ ...current.identity }),
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
    const current = await readLogSnapshot(hierarchy, scope, io);
    await closeHierarchy(hierarchy);
    return valid(readValue(hierarchy, current));
  } catch (error) {
    if (hierarchy !== undefined) await closeHierarchy(hierarchy).catch(() => {});
    return resultFromError(error);
  }
}

function lockMarker(scope) {
  return Buffer.from(`feature-flight-relay-lock:${scope.repositoryId}:${scope.repositoryWorkspaceId}:${scope.lockOwnerId}\n`, "utf8");
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
    if (!safeRegular(retained) || !safeRegular(linked) || retained.size !== marker.length || !sameInode(opened, retained) || !sameInode(opened, linked)) {
      storeFailure("recovery_required", "Relay lock identity changed during acquisition.");
    }
    await syncDirectory(hierarchy.directory, "Relay lock directory");
  } catch (error) {
    if (!created && error?.code === "EEXIST") storeFailure("relay_lock_held", "Relay lock is held.");
    if (!created && ["ELOOP", "ENOTDIR"].includes(error?.code)) storeFailure("unsafe_path", "Relay lock path is unsafe.");
    if (created && !(error instanceof StoreFailure)) storeFailure("recovery_required", `Relay lock acquisition is uncertain: ${error?.code ?? "unknown_error"}.`);
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
  if (!safeRegular(linked) || Number(linked.dev) !== token.dev || Number(linked.ino) !== token.ino) storeFailure("recovery_required", "Relay lock target changed before unlink.");
  try { await io.unlink(token.path); }
  catch { storeFailure("recovery_required", "Relay lock unlink is uncertain."); }
  await syncDirectory(hierarchy.directory, "Relay lock directory");
  await assertHierarchy(hierarchy, io);
}

async function writeEntry(hierarchy, scope, current, entry, io) {
  const line = entryLine(entry);
  if (line.length > FEATURE_FLIGHT_RELAY_STORE_MAX_ENTRY_BYTES || current.bytes.length + line.length > FEATURE_FLIGHT_RELAY_STORE_MAX_BYTES) {
    storeFailure("relay_store_limit", "Relay ledger compact limits would be exceeded.");
  }
  const before = await io.lstat(hierarchy.paths.logPath).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (current.missing !== (before === null)) storeFailure("recovery_required", "Relay ledger existence changed before append.");
  if (before !== null && (!safeRegular(before) || current.identity === null || Number(before.dev) !== current.identity.dev ||
      Number(before.ino) !== current.identity.ino || before.size !== current.bytes.length)) storeFailure("recovery_required", "Relay ledger identity changed before append.");
  let handle;
  let opened;
  let created = false;
  let closeError;
  try {
    await assertHierarchy(hierarchy, io);
    handle = await io.open(hierarchy.paths.logPath, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    opened = await handle.stat();
    created = before === null;
    if (!safeRegular(opened) || opened.size !== current.bytes.length || (before !== null && !sameInode(before, opened))) storeFailure("recovery_required", "Relay ledger target changed while opening for append.");
    const written = await handle.write(line, 0, line.length, null);
    if (written.bytesWritten !== line.length) storeFailure("recovery_required", "Relay append write was partial.");
    await handle.sync();
    const [retained, linked] = await Promise.all([handle.stat(), io.lstat(hierarchy.paths.logPath).catch(() => null)]);
    if (!safeRegular(retained) || !safeRegular(linked) || !sameInode(opened, retained) || !sameInode(opened, linked) ||
        retained.size !== current.bytes.length + line.length) storeFailure("recovery_required", "Relay ledger changed during append.");
  } catch (error) {
    if (["ELOOP", "ENOTDIR"].includes(error?.code)) storeFailure("unsafe_path", "Relay ledger path is unsafe.");
    if (error instanceof StoreFailure) throw error;
    storeFailure("recovery_required", `Relay append is uncertain: ${error?.code ?? "unknown_error"}.`);
  } finally {
    if (handle !== undefined) await handle.close().catch((error) => { closeError = error; });
    if (closeError !== undefined) storeFailure("recovery_required", "Relay append close is uncertain.");
  }
  if (created) await syncDirectory(hierarchy.directory, "Relay ledger directory");
  await assertHierarchy(hierarchy, io);
  let after;
  try { after = await readLogSnapshot(hierarchy, scope, io); }
  catch (error) { storeFailure("recovery_required", `Relay post-append readback is uncertain: ${error instanceof Error ? error.message : "unknown_error"}.`); }
  const expected = Buffer.concat([current.bytes, line]);
  if (!sameBytes(after.bytes, expected) || after.entries.at(-1)?.entryDigest !== entry.entryDigest || after.entries.length !== current.entries.length + 1) {
    storeFailure("recovery_required", "Relay exact readback does not match the append.");
  }
  return after;
}

async function appendUnderLock(scope, io, operation) {
  let hierarchy;
  let token;
  let result;
  let terminalError;
  try {
    hierarchy = await openHierarchy(scope, io, true);
    token = await acquireLock(hierarchy, scope, io);
    const current = await readLogSnapshot(hierarchy, scope, io);
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

export async function appendFeatureFlightRelayEntryIfAbsentV1(input, injected = {}) {
  let value;
  try {
    value = scopeSnapshot(input, ["root", "excludedRoots", "repositoryId", "repositoryWorkspaceId", "lockOwnerId", "entry"], "relay store append input");
    const checked = validateFeatureFlightRelayEntryV1(value.entry);
    if (checked.state !== "valid") throw new StoreFailure("malformed_input", `Relay store entry is malformed: ${checked.code}.`);
    if (checked.value.relay.source.repositoryId !== value.repositoryId || checked.value.relay.source.repositoryWorkspaceId !== value.repositoryWorkspaceId) {
      throw new StoreFailure("source_identity_mismatch", "Relay source repository does not match the store scope.");
    }
    value = Object.freeze({ ...value, entry: checked.value });
  } catch (error) { return resultFromError(error, "malformed_input"); }
  const io = Object.freeze({ ...defaultIo, ...injected });
  return appendUnderLock(value, io, async (hierarchy, current) => {
    const reconciled = reconcileFeatureFlightRelayEntryV1(current.entries, value.entry);
    if (reconciled.state === "duplicate") return valid(Object.freeze({ status: "duplicate", appended: false, log: readValue(hierarchy, current), entry: value.entry }));
    if (reconciled.state !== "accepted") storeFailure(reconciled.code === "conflicting_reuse" ? "conflicting_reuse" : "relay_replay_invalid", `Relay entry append was rejected: ${reconciled.code}.`);
    const after = await writeEntry(hierarchy, value, current, value.entry, io);
    return valid(Object.freeze({ status: "appended", appended: true, log: readValue(hierarchy, after), entry: value.entry }));
  });
}

export async function appendFeatureFlightRelaySourceIfAbsentV1(input, injected = {}) {
  let value;
  try {
    value = scopeSnapshot(input, ["root", "excludedRoots", "repositoryId", "repositoryWorkspaceId", "lockOwnerId", "relay"], "relay source append input");
    const checked = validateFeatureFlightRelayV1(value.relay);
    if (checked.state !== "valid") throw new StoreFailure("malformed_input", `Relay source is malformed: ${checked.code}.`);
    if (checked.value.source.repositoryId !== value.repositoryId || checked.value.source.repositoryWorkspaceId !== value.repositoryWorkspaceId) {
      throw new StoreFailure("source_identity_mismatch", "Relay source repository does not match the store scope.");
    }
    value = Object.freeze({ ...value, relay: checked.value });
  } catch (error) { return resultFromError(error, "malformed_input"); }
  const io = Object.freeze({ ...defaultIo, ...injected });
  return appendUnderLock(value, io, async (hierarchy, current) => {
    const existingRelay = current.entries.find((entry) => entry.relayId === value.relay.relayId);
    if (existingRelay !== undefined) {
      if (existingRelay.relayDigest !== value.relay.relayDigest) storeFailure("conflicting_reuse", "Relay identity is bound to conflicting content.");
      return valid(Object.freeze({ status: "duplicate", appended: false, log: readValue(hierarchy, current), relay: value.relay, entry: existingRelay }));
    }
    const sourceConflict = current.entries.find((entry) => entry.relay.source.receiptId === value.relay.source.receiptId &&
      entry.relay.source.dispatchId === value.relay.source.dispatchId && entry.relay.terminal.entryDigest === value.relay.terminal.entryDigest);
    if (sourceConflict !== undefined) storeFailure("source_conflict", "Terminal source identity is already bound to a different relay.");
    const entry = createFeatureFlightRelayEntryV1({
      logSequence: current.entries.length,
      previousLogDigest: current.entries.at(-1)?.entryDigest ?? null,
      relay: value.relay,
    });
    const after = await writeEntry(hierarchy, value, current, entry, io);
    return valid(Object.freeze({ status: "appended", appended: true, log: readValue(hierarchy, after), relay: value.relay, entry }));
  });
}

export class FeatureFlightRelayStoreError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}

export function createFeatureFlightRelayFilesystemStore(input, injected = {}) {
  const scope = scopeSnapshot(input, ["root", "excludedRoots", "repositoryId", "repositoryWorkspaceId", "lockOwnerId"], "relay filesystem store input");
  const unwrap = async (promise) => {
    const result = await promise;
    if (result.state !== "valid") throw new FeatureFlightRelayStoreError(result.code, result.errors[0]);
    return result.value;
  };
  return Object.freeze({
    repositoryId: scope.repositoryId,
    repositoryWorkspaceId: scope.repositoryWorkspaceId,
    read: () => unwrap(readFeatureFlightRelayLogV1({
      root: scope.root,
      excludedRoots: scope.excludedRoots,
      repositoryId: scope.repositoryId,
      repositoryWorkspaceId: scope.repositoryWorkspaceId,
    }, injected)),
    appendEntry: (entry) => unwrap(appendFeatureFlightRelayEntryIfAbsentV1({ ...scope, entry }, injected)),
    appendSource: (relay) => unwrap(appendFeatureFlightRelaySourceIfAbsentV1({ ...scope, relay }, injected)),
  });
}
