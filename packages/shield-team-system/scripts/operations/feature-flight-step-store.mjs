import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";

import {
  canonicalFeatureFlightBytes,
  featureFlightSha256,
  validateFeatureFlightTerminal,
} from "./feature-flight-recovery.mjs";

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
  const [canonical, info] = await Promise.all([
    io.realpath(root).catch(() => undefined), io.lstat(root).catch(() => undefined),
  ]);
  if (canonical !== root || !info?.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700) {
    throw new Error("Feature Flight claim-store root must be an existing canonical non-symlink mode-0700 directory.");
  }
  if (!Array.isArray(excludedRoots) || excludedRoots.some((entry) => typeof entry !== "string" || !isAbsolute(entry) || normalize(entry) !== entry)) {
    throw new Error("Feature Flight claim-store exclusions are malformed.");
  }
  if (excludedRoots.some((entry) => overlaps(root, entry))) {
    throw new Error("Feature Flight claim-store root must be outside the repository and every plan worktree.");
  }
  return info;
};

const retainDirectory = async (path, io) => {
  const before = await io.lstat(path).catch(() => undefined);
  if (!before?.isDirectory() || before.isSymbolicLink() || (before.mode & 0o777) !== 0o700) {
    throw new Error(`Feature Flight store directory is unavailable or unsafe: ${path}`);
  }
  const handle = await io.open(path, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const identity = await handle.stat();
    if (!identity.isDirectory() || (identity.mode & 0o777) !== 0o700 || !sameInode(before, identity)) {
      throw new Error(`Feature Flight store directory identity changed: ${path}`);
    }
    return { path, handle, identity };
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
};

const assertRetainedDirectory = async (retained, io) => {
  const [linked, canonical, opened] = await Promise.all([
    io.lstat(retained.path).catch(() => undefined),
    io.realpath(retained.path).catch(() => undefined),
    retained.handle.stat().catch(() => undefined),
  ]);
  if (canonical !== retained.path || !linked?.isDirectory() || linked.isSymbolicLink() ||
      (linked.mode & 0o777) !== 0o700 || !opened?.isDirectory() || (opened.mode & 0o777) !== 0o700 ||
      !sameInode(retained.identity, linked) || !sameInode(retained.identity, opened)) {
    throw new Error(`Feature Flight store directory identity changed: ${retained.path}`);
  }
};

const closeRetained = async (...retained) => {
  const errors = [];
  for (const entry of retained) {
    if (entry?.handle) await entry.handle.close().catch((error) => errors.push(error));
  }
  if (errors.length > 0) throw new AggregateError(errors, "Feature Flight store directory close is uncertain.");
};

const syncRetained = async (retained, label) => {
  try { await retained.handle.sync(); }
  catch (error) { throw new AggregateError([error], `${label} durability is uncertain.`); }
};

const pathsFor = (root, effectClaimId) => {
  if (!DIGEST.test(effectClaimId ?? "")) throw new Error("effectClaimId must be a lowercase SHA-256 digest.");
  const directory = join(root, "effects", effectClaimId);
  return {
    root, effects: dirname(directory), directory,
    claim: join(directory, "claim.json"), terminal: join(directory, "terminal.json"), successor: join(directory, "successor.json"),
    result: join(directory, "result.json"), recovery: join(directory, "recovery.json"),
  };
};

const rootContext = async (input, io) => {
  const rootIdentity = await strictRoot(input.root, input.excludedRoots, io);
  const paths = pathsFor(input.root, input.effectClaimId);
  const root = await retainDirectory(paths.root, io);
  if (!sameInode(rootIdentity, root.identity)) {
    await closeRetained(root).catch(() => {});
    throw new Error("Feature Flight claim-store root identity changed while opening.");
  }
  return { paths, root };
};

const openHierarchy = async (input, io, { allowMissing = false } = {}) => {
  const context = await rootContext(input, io);
  let effects;
  let directory;
  try {
    const effectsInfo = await io.lstat(context.paths.effects).catch((error) => error?.code === "ENOENT" ? undefined : Promise.reject(error));
    if (effectsInfo === undefined) {
      if (!allowMissing) throw new Error("Feature Flight effects directory is unavailable.");
      await assertRetainedDirectory(context.root, io);
      return { ...context, effects: null, directory: null };
    }
    effects = await retainDirectory(context.paths.effects, io);
    const directoryInfo = await io.lstat(context.paths.directory).catch((error) => error?.code === "ENOENT" ? undefined : Promise.reject(error));
    if (directoryInfo === undefined) {
      if (!allowMissing) throw new Error("Feature Flight effect directory is unavailable.");
      await Promise.all([assertRetainedDirectory(context.root, io), assertRetainedDirectory(effects, io)]);
      return { ...context, effects, directory: null };
    }
    directory = await retainDirectory(context.paths.directory, io);
    await Promise.all([
      assertRetainedDirectory(context.root, io),
      assertRetainedDirectory(effects, io),
      assertRetainedDirectory(directory, io),
    ]);
    return { ...context, effects, directory };
  } catch (error) {
    await closeRetained(directory, effects, context.root).catch(() => {});
    throw error;
  }
};

const identityToken = (retained) => Object.freeze({ path: retained.path, dev: retained.identity.dev, ino: retained.identity.ino });
const hierarchyToken = (hierarchy) => Object.freeze({
  root: identityToken(hierarchy.root),
  effects: identityToken(hierarchy.effects),
  effect: identityToken(hierarchy.directory),
});
const matchesToken = (retained, token) => token !== null && typeof token === "object" && !Array.isArray(token) &&
  Object.getPrototypeOf(token) === Object.prototype && Object.keys(token).length === 3 &&
  token.path === retained.path && token.dev === retained.identity.dev && token.ino === retained.identity.ino;

const assertExpectedHierarchy = (hierarchy, expected) => {
  if (!hierarchy.root || !hierarchy.effects || !hierarchy.directory || expected === null || typeof expected !== "object" ||
      Array.isArray(expected) || Object.getPrototypeOf(expected) !== Object.prototype ||
      Object.keys(expected).length !== 3 || !matchesToken(hierarchy.root, expected.root) ||
      !matchesToken(hierarchy.effects, expected.effects) || !matchesToken(hierarchy.directory, expected.effect)) {
    throw new Error("Feature Flight claim hierarchy does not match the successful claim identity.");
  }
};

const assertHierarchy = async (hierarchy, io) => {
  const retained = [hierarchy.root, hierarchy.effects, hierarchy.directory].filter(Boolean);
  await Promise.all(retained.map((entry) => assertRetainedDirectory(entry, io)));
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
    const [retained, after] = await Promise.all([handle.stat(), io.lstat(path).catch(() => undefined)]);
    if (!retained.isFile() || retained.size !== bytes.length || !after?.isFile() || after.isSymbolicLink() ||
        (after.mode & 0o777) !== 0o600 || !sameInode(opened, retained) || !sameInode(opened, after)) {
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

const createFile = async (path, value, hierarchy, io) => {
  assertExpectedHierarchy(hierarchy, hierarchy.expectedHierarchyIdentity);
  await assertHierarchy(hierarchy, io);
  let file;
  const bytes = canonicalBytes(value);
  try {
    file = await io.open(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    const opened = await file.stat();
    if (!opened.isFile() || (opened.mode & 0o777) !== 0o600 || opened.size !== 0) throw new Error(`Feature Flight artifact target is unsafe: ${path}`);
    const written = await file.write(bytes, 0, bytes.length, 0);
    if (written.bytesWritten !== bytes.length) throw new Error(`Feature Flight artifact write was partial: ${path}`);
    await file.sync();
    const [retained, linked] = await Promise.all([file.stat(), io.lstat(path).catch(() => undefined)]);
    if (!retained.isFile() || retained.size !== bytes.length || !linked?.isFile() || linked.isSymbolicLink() ||
        (linked.mode & 0o777) !== 0o600 || !sameInode(opened, retained) || !sameInode(opened, linked)) {
      throw new Error(`Feature Flight artifact identity changed: ${path}`);
    }
    await file.close();
    file = undefined;
    await syncRetained(hierarchy.directory, "Feature Flight effect directory");
    await assertHierarchy(hierarchy, io);
    const snapshot = await readFile(path, io);
    if (!snapshot.bytes.equals(bytes)) throw new Error(`Feature Flight artifact readback differed: ${path}`);
    await assertHierarchy(hierarchy, io);
    return snapshot;
  } catch (error) {
    if (file) await file.close().catch(() => {});
    throw error;
  }
};

export const claimStep = async (input, injected = {}) => {
  const io = dependencies(injected);
  const context = await rootContext(input, io);
  let effects;
  let directory;
  try {
    let effectsCreated = false;
    try { await io.mkdir(context.paths.effects, { mode: 0o700 }); effectsCreated = true; }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
    if (effectsCreated) await syncRetained(context.root, "Feature Flight claim-store root");
    effects = await retainDirectory(context.paths.effects, io);
    await Promise.all([assertRetainedDirectory(context.root, io), assertRetainedDirectory(effects, io)]);

    let created = false;
    try { await io.mkdir(context.paths.directory, { mode: 0o700 }); created = true; }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
    if (!created) {
      await assertHierarchy({ ...context, effects, directory: null }, io);
      await closeRetained(effects, context.root);
      return { status: "exists", step: await readStep(input, injected) };
    }
    await syncRetained(effects, "Feature Flight effects directory");
    directory = await retainDirectory(context.paths.directory, io);
    await syncRetained(directory, "Feature Flight effect directory");
    const hierarchy = { ...context, effects, directory };
    const token = hierarchyToken(hierarchy);
    hierarchy.expectedHierarchyIdentity = token;
    const claim = await createFile(context.paths.claim, input.claim, hierarchy, io);
    await assertHierarchy(hierarchy, io);
    await closeRetained(directory, effects, context.root);
    return { status: "claimed", claim, hierarchyIdentity: token };
  } catch (error) {
    await closeRetained(directory, effects, context.root).catch(() => {});
    throw error;
  }
};

export const readStep = async (input, injected = {}) => {
  const io = dependencies(injected);
  const hierarchy = await openHierarchy(input, io, { allowMissing: true });
  try {
    if (hierarchy.effects === null || hierarchy.directory === null) {
      await assertHierarchy(hierarchy, io);
      await closeRetained(hierarchy.directory, hierarchy.effects, hierarchy.root);
      return { status: "absent", paths: hierarchy.paths };
    }
    if (input.expectedHierarchyIdentity !== undefined) assertExpectedHierarchy(hierarchy, input.expectedHierarchyIdentity);
    const safeRead = async (path) => {
      try { return await readFile(path, io); }
      catch (error) {
        if (typeof error?.code === "string") throw error;
        return { path, invalid: true, error };
      }
    };
    const [claim, terminal, successor, result, recovery] = await Promise.all([
      safeRead(hierarchy.paths.claim), safeRead(hierarchy.paths.terminal), safeRead(hierarchy.paths.successor),
      safeRead(hierarchy.paths.result), safeRead(hierarchy.paths.recovery),
    ]);
    await assertHierarchy(hierarchy, io);
    const token = hierarchyToken(hierarchy);
    await closeRetained(hierarchy.directory, hierarchy.effects, hierarchy.root);
    const core = { paths: hierarchy.paths, claim, terminal, successor, result, recovery, hierarchyIdentity: token };
    const present = (artifact) => artifact !== null;
    const invalid = (artifact) => artifact?.invalid === true;
    if (claim === null || invalid(claim)) return { status: "malformed", ...core };
    if (input.expectedAttemptDigest !== undefined && claim.value.attemptDigest !== input.expectedAttemptDigest) return { status: "conflicting", ...core };

    const version = claim.value?.contract?.name === "shield-feature-flight-step" ? claim.value.contract.version : null;
    if (version === "1.0.0") {
      if (present(terminal) || present(recovery)) return { status: "legacy_malformed", ...core };
      if (invalid(successor) || invalid(result)) return { status: "legacy_malformed", ...core };
      if (successor === null && result === null) return { status: "legacy_claim_incomplete", ...core };
      if (successor !== null && result === null) return { status: "legacy_successor_incomplete", ...core };
      if (successor === null && result !== null) return { status: "legacy_malformed", ...core };
      return { status: "legacy_terminal", ...core };
    }
    if (version !== "2.0.0") return { status: "malformed", ...core };
    if (terminal === null) {
      if (present(successor) || present(result) || present(recovery)) return { status: "malformed", ...core };
      return { status: "claim_incomplete", ...core };
    }
    if (invalid(terminal) || validateFeatureFlightTerminal(terminal.value).length !== 0) return { status: "conflicting", ...core };
    const arbiter = terminal.value;
    const exactPayload = (artifact, payload) => artifact === null || (!invalid(artifact) &&
      artifact.bytes.length === payload.bytes && featureFlightSha256(artifact.bytes) === payload.sha256 &&
      artifact.bytes.equals(canonicalFeatureFlightBytes(payload.value)));
    if (arbiter.terminalKind === "success") {
      if (present(recovery) || !exactPayload(successor, arbiter.successor) || !exactPayload(result, arbiter.result)) return { status: "conflicting", ...core };
      return { status: successor !== null && result !== null ? "success_terminal" : "success_materializable", ...core };
    }
    if (present(successor) || present(result) || !exactPayload(recovery, arbiter.recovery)) return { status: "conflicting", ...core };
    return { status: recovery === null ? "recovery_materializable" : "recovery_terminal", ...core };
  } catch (error) {
    await closeRetained(hierarchy.directory, hierarchy.effects, hierarchy.root).catch(() => {});
    throw error;
  }
};

const writeArtifact = async (input, filename, value, injected) => {
  const io = dependencies(injected);
  const hierarchy = await openHierarchy(input, io);
  hierarchy.expectedHierarchyIdentity = input.expectedHierarchyIdentity;
  try {
    assertExpectedHierarchy(hierarchy, input.expectedHierarchyIdentity);
    const snapshot = await createFile(hierarchy.paths[filename], value, hierarchy, io);
    await closeRetained(hierarchy.directory, hierarchy.effects, hierarchy.root);
    return snapshot;
  } catch (error) {
    await closeRetained(hierarchy.directory, hierarchy.effects, hierarchy.root).catch(() => {});
    throw error;
  }
};

export const writeSuccessor = (input, injected = {}) => writeArtifact(input, "successor", input.successor, injected);
export const writeResult = (input, injected = {}) => writeArtifact(input, "result", input.result, injected);

export const arbitrateTerminal = async (input, injected = {}) => {
  const io = dependencies(injected);
  const hierarchy = await openHierarchy(input, io);
  hierarchy.expectedHierarchyIdentity = input.expectedHierarchyIdentity;
  try {
    assertExpectedHierarchy(hierarchy, input.expectedHierarchyIdentity);
    let created = false;
    try {
      await createFile(hierarchy.paths.terminal, input.terminal, hierarchy, io);
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        const winner = await readFile(hierarchy.paths.terminal, io).catch(() => null);
        if (winner === null) throw error;
      }
    }
    const winner = await readFile(hierarchy.paths.terminal, io);
    await assertHierarchy(hierarchy, io);
    await closeRetained(hierarchy.directory, hierarchy.effects, hierarchy.root);
    return { status: created ? "created" : "exists", terminal: winner };
  } catch (error) {
    await closeRetained(hierarchy.directory, hierarchy.effects, hierarchy.root).catch(() => {});
    throw error;
  }
};

export const materializeTerminal = async (input, injected = {}) => {
  const initial = await readStep(input, injected);
  if (!["success_materializable", "success_terminal", "recovery_materializable", "recovery_terminal"].includes(initial.status)) return initial;
  const arbiter = initial.terminal.value;
  const targets = arbiter.terminalKind === "success"
    ? [["successor", arbiter.successor], ["result", arbiter.result]]
    : [["recovery", arbiter.recovery]];
  for (const [filename, payload] of targets) {
    if (initial[filename] !== null) continue;
    try {
      await writeArtifact({ ...input, expectedHierarchyIdentity: initial.hierarchyIdentity, [filename]: payload.value }, filename, payload.value, injected);
    } catch (error) {
      if (error?.code !== "EEXIST") {
        const state = await readStep(input, injected);
        return { ...state, materializationUncertain: filename };
      }
    }
  }
  return readStep({ ...input, expectedHierarchyIdentity: initial.hierarchyIdentity }, injected);
};
