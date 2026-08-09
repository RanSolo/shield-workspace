import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";

const DIGEST = /^[a-f0-9]{64}$/u;
const defaultIo = Object.freeze({ lstat, mkdir, open, realpath });

const sameInode = (left, right) => left?.dev === right?.dev && left?.ino === right?.ino;
const folded = (value) => value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
const overlaps = (left, right) => {
  const a = folded(left);
  const b = folded(right);
  return a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`);
};

const canonicalValue = (value) => Array.isArray(value) ? value.map(canonicalValue)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
    : value;

const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(canonicalValue(value), null, 2)}\n`, "utf8");

const dependencies = (injected = {}) => Object.freeze({ ...defaultIo, ...injected });

const strictRoot = async (root, excludedRoots, io) => {
  if (typeof root !== "string" || !isAbsolute(root) || normalize(root) !== root || resolve(root) !== root) {
    throw new Error("Feature Flight claim-store root must be a canonical absolute path.");
  }
  const canonical = await io.realpath(root).catch(() => undefined);
  const info = await io.lstat(root).catch(() => undefined);
  if (canonical !== root || !info?.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700) {
    throw new Error("Feature Flight claim-store root must be an existing canonical non-symlink mode-0700 directory.");
  }
  if (!Array.isArray(excludedRoots) || excludedRoots.some((entry) => typeof entry !== "string" || !isAbsolute(entry) || normalize(entry) !== entry)) {
    throw new Error("Feature Flight claim-store exclusions are malformed.");
  }
  if (excludedRoots.some((entry) => overlaps(root, entry))) {
    throw new Error("Feature Flight claim-store root must be outside the repository and every plan worktree.");
  }
  return { root, identity: info };
};

const retainDirectory = async (path, io) => {
  const before = await io.lstat(path).catch(() => undefined);
  if (!before?.isDirectory() || before.isSymbolicLink() || (before.mode & 0o777) !== 0o700) {
    throw new Error(`Feature Flight store directory is unavailable or unsafe: ${path}`);
  }
  const handle = await io.open(path, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0));
  const retained = await handle.stat();
  if (!retained.isDirectory() || !sameInode(before, retained)) {
    await handle.close().catch(() => {});
    throw new Error(`Feature Flight store directory identity changed: ${path}`);
  }
  return { handle, identity: retained };
};

const syncAndClose = async (retained, label) => {
  let syncError;
  try { await retained.handle.sync(); } catch (error) { syncError = error; }
  let closeError;
  try { await retained.handle.close(); } catch (error) { closeError = error; }
  if (syncError || closeError) throw new AggregateError([syncError, closeError].filter(Boolean), `${label} durability is uncertain.`);
};

const ensureEffects = async (root, rootIdentity, io) => {
  const path = join(root, "effects");
  try {
    await io.mkdir(path, { mode: 0o700 });
    const retainedRoot = await retainDirectory(root, io);
    if (!sameInode(rootIdentity, retainedRoot.identity)) {
      await retainedRoot.handle.close().catch(() => {});
      throw new Error("Feature Flight claim-store root identity changed.");
    }
    await syncAndClose(retainedRoot, "Feature Flight claim-store root");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const canonical = await io.realpath(path).catch(() => undefined);
  if (canonical !== path) throw new Error("Feature Flight effects directory must be canonical and non-symlink.");
  return { path, ...(await retainDirectory(path, io)) };
};

const pathsFor = (root, effectClaimId) => {
  if (!DIGEST.test(effectClaimId ?? "")) throw new Error("effectClaimId must be a lowercase SHA-256 digest.");
  const directory = join(root, "effects", effectClaimId);
  return {
    directory,
    claim: join(directory, "claim.json"),
    successor: join(directory, "successor.json"),
    result: join(directory, "result.json"),
  };
};

const createFile = async (path, value, directoryIdentity, io) => {
  const parent = dirname(path);
  const retainedParent = await retainDirectory(parent, io);
  if (!sameInode(directoryIdentity, retainedParent.identity)) {
    await retainedParent.handle.close().catch(() => {});
    throw new Error(`Feature Flight artifact parent identity changed: ${parent}`);
  }
  let file;
  const bytes = canonicalBytes(value);
  try {
    file = await io.open(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    const identity = await file.stat();
    if (!identity.isFile() || (identity.mode & 0o777) !== 0o600 || identity.size !== 0) throw new Error(`Feature Flight artifact target is unsafe: ${path}`);
    const written = await file.write(bytes, 0, bytes.length, 0);
    if (written.bytesWritten !== bytes.length) throw new Error(`Feature Flight artifact write was partial: ${path}`);
    await file.sync();
    const retained = await file.stat();
    const linked = await io.lstat(path).catch(() => undefined);
    if (!retained.isFile() || retained.size !== bytes.length || !linked?.isFile() || linked.isSymbolicLink() || !sameInode(identity, retained) || !sameInode(identity, linked)) {
      throw new Error(`Feature Flight artifact identity changed: ${path}`);
    }
    await file.close();
    file = undefined;
    await retainedParent.handle.sync();
    await retainedParent.handle.close();
    const snapshot = await readFile(path, io);
    if (!snapshot.bytes.equals(bytes)) throw new Error(`Feature Flight artifact readback differed: ${path}`);
    return snapshot;
  } catch (error) {
    if (file) await file.close().catch(() => {});
    await retainedParent.handle.close().catch(() => {});
    throw error;
  }
};

const readFile = async (path, io) => {
  const before = await io.lstat(path).catch((error) => error?.code === "ENOENT" ? undefined : Promise.reject(error));
  if (before === undefined) return null;
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o777) !== 0o600) throw new Error(`Feature Flight artifact is unsafe: ${path}`);
  const handle = await io.open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !sameInode(before, opened)) throw new Error(`Feature Flight artifact identity changed while opening: ${path}`);
    const bytes = await handle.readFile();
    const retained = await handle.stat();
    const after = await io.lstat(path).catch(() => undefined);
    if (!retained.isFile() || retained.size !== bytes.length || !after?.isFile() || after.isSymbolicLink() || !sameInode(opened, retained) || !sameInode(opened, after)) {
      throw new Error(`Feature Flight artifact identity changed during read: ${path}`);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(text);
    if (!bytes.equals(canonicalBytes(value))) throw new Error(`Feature Flight artifact bytes are not canonical: ${path}`);
    return { path, bytes, value };
  } finally {
    await handle.close();
  }
};

const context = async (input, injected) => {
  const io = dependencies(injected);
  const root = await strictRoot(input.root, input.excludedRoots, io);
  const paths = pathsFor(root.root, input.effectClaimId);
  const effectsPath = dirname(paths.directory);
  const effects = await io.lstat(effectsPath).catch((error) => error?.code === "ENOENT" ? undefined : Promise.reject(error));
  if (effects !== undefined) {
    const canonicalEffects = await io.realpath(effectsPath).catch(() => undefined);
    if (canonicalEffects !== effectsPath || !effects.isDirectory() || effects.isSymbolicLink() || (effects.mode & 0o777) !== 0o700) {
      throw new Error("Feature Flight effects directory is unsafe.");
    }
  }
  return { io, root, paths };
};

export const claimStep = async (input, injected = {}) => {
  const { io, root, paths } = await context(input, injected);
  const effects = await ensureEffects(root.root, root.identity, io);
  let created = false;
  try {
    await io.mkdir(paths.directory, { mode: 0o700 });
    created = true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  if (!created) {
    await effects.handle.close();
    return { status: "exists", step: await readStep(input, injected) };
  }
  await syncAndClose(effects, "Feature Flight effects directory");
  const canonical = await io.realpath(paths.directory).catch(() => undefined);
  if (canonical !== paths.directory) throw new Error("Feature Flight effect directory is not canonical.");
  const retained = await retainDirectory(paths.directory, io);
  await syncAndClose(retained, "Feature Flight effect directory");
  const directoryIdentity = await io.lstat(paths.directory);
  const claim = await createFile(paths.claim, input.claim, directoryIdentity, io);
  return { status: "claimed", claim };
};

export const readStep = async (input, injected = {}) => {
  const { io, paths } = await context(input, injected);
  const directory = await io.lstat(paths.directory).catch((error) => error?.code === "ENOENT" ? undefined : Promise.reject(error));
  if (directory === undefined) return { status: "absent", paths };
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o777) !== 0o700) throw new Error("Feature Flight effect directory is unsafe.");
  const [claim, successor, result] = await Promise.all([
    readFile(paths.claim, io), readFile(paths.successor, io), readFile(paths.result, io),
  ]);
  if (claim === null) return { status: "malformed", paths, claim, successor, result };
  if (input.expectedAttemptDigest !== undefined && claim.value.attemptDigest !== input.expectedAttemptDigest) {
    return { status: "conflicting", paths, claim, successor, result };
  }
  if (successor === null && result === null) return { status: "claimed", paths, claim, successor, result };
  if (successor !== null && result === null) return { status: "successor_only", paths, claim, successor, result };
  if (successor === null && result !== null) return { status: "malformed", paths, claim, successor, result };
  return { status: "terminal", paths, claim, successor, result };
};

export const writeSuccessor = async (input, injected = {}) => {
  const { io, paths } = await context(input, injected);
  const directoryIdentity = await io.lstat(paths.directory);
  return createFile(paths.successor, input.successor, directoryIdentity, io);
};

export const writeResult = async (input, injected = {}) => {
  const { io, paths } = await context(input, injected);
  const directoryIdentity = await io.lstat(paths.directory);
  return createFile(paths.result, input.result, directoryIdentity, io);
};
