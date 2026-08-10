#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants, createReadStream } from "node:fs";
import { link, lstat, mkdir, open, readdir, realpath, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { canonicalJson } from "../../dist/mission-v2.mjs";
import {
  createMackLocalValidationEvidenceV1,
  normalizeMackLocalValidationRequestV1,
} from "../../dist/mack-local-validation-v1.mjs";
import { probeLocalModelMetadata } from "./local-tool-broker.mjs";
import { strictParseJson } from "./strict-json.mjs";

export const MACK_LOCAL_RUNNER_LIMITS = Object.freeze({
  packetBytes: 12_582_912,
  promptBytes: 8_388_608,
  responseBytes: 262_144,
  commandOutputBytes: 262_144,
  gitOutputBytes: 8_388_608,
  gitTimeoutMs: 30_000,
  inferenceTimeoutMs: 180_000,
  maxOutputTokens: 16_384,
});

const SAFE_ERROR = /^[a-z][a-z0-9_]{0,127}$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const REPLAY_RECORD_LIMIT = 4_194_304;
const PRODUCTION_PROVENANCE = Symbol("mack-cli-production-provenance");

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("base64url")}`;
}

function boundedError(value, fallback = "command_launch_failed") {
  const normalized = String(value ?? "").toLowerCase().replace(/[^a-z0-9_]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 128);
  return SAFE_ERROR.test(normalized) ? normalized : fallback;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactPlain(value, fields) {
  if (!plain(value)) return false;
  const keys = Reflect.ownKeys(value);
  const allowed = new Set(fields);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field)) && keys.every((key) => {
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : null;
    return typeof key === "string" && allowed.has(key) && descriptor?.enumerable === true && Object.hasOwn(descriptor, "value");
  });
}

function readData(value, field) {
  return Object.getOwnPropertyDescriptor(value, field)?.value;
}

function denseArray(value, max = 512) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) return null;
  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, "value")) return null;
    output.push(descriptor.value);
  }
  if (Reflect.ownKeys(value).some((key) => key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)))) return null;
  return output;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function errorCode(error) {
  return error && typeof error === "object" ? error.code : undefined;
}

async function lstatOrNull(path) {
  try { return await lstat(path); }
  catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
}

async function readPrivateRegularFile(path, { minBytes, maxBytes, unsafeCode }) {
  const status = await lstatOrNull(path);
  if (status === null) return null;
  if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1 || !ownedByEffectiveUser(status) || (process.platform !== "win32" && (status.mode & 0o077) !== 0) || status.size < minBytes || status.size > maxBytes) throw new Error(unsafeCode);
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || !ownedByEffectiveUser(opened) || (process.platform !== "win32" && (opened.mode & 0o077) !== 0) ||
        opened.dev !== status.dev || opened.ino !== status.ino || opened.size !== status.size || opened.mode !== status.mode || opened.uid !== status.uid) throw new Error(unsafeCode);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const current = await lstat(path);
    if (!after.isFile() || after.nlink !== 1 || !ownedByEffectiveUser(after) || (process.platform !== "win32" && (after.mode & 0o077) !== 0) ||
        after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.mode !== opened.mode || after.uid !== opened.uid ||
        !current.isFile() || current.isSymbolicLink() || current.nlink !== 1 || !ownedByEffectiveUser(current) ||
        (process.platform !== "win32" && (current.mode & 0o077) !== 0) || current.dev !== opened.dev || current.ino !== opened.ino ||
        current.size !== opened.size || current.mode !== opened.mode || current.uid !== opened.uid || bytes.byteLength !== opened.size) throw new Error(unsafeCode);
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message === unsafeCode) throw error;
    throw new Error(unsafeCode);
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function syncDirectory(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); }
  finally { await handle.close(); }
}

function pathsOverlap(left, right) {
  const contains = (parent, candidate) => {
    const relation = relative(parent, candidate);
    return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
  };
  return contains(left, right) || contains(right, left);
}

function ownedByEffectiveUser(status) {
  return typeof process.geteuid !== "function" || status.uid === process.geteuid();
}

async function prepareReplayRegistryRoot(rootInput, repositoryRoot, canonicalGitDirectory) {
  if (typeof rootInput !== "string" || !isAbsolute(rootInput) || resolve(rootInput) !== rootInput || pathsOverlap(rootInput, repositoryRoot) || pathsOverlap(rootInput, canonicalGitDirectory)) throw new Error("mack_replay_registry_root_invalid");
  const repositoryStatus = await lstatOrNull(repositoryRoot);
  const gitDirectoryStatus = await lstatOrNull(canonicalGitDirectory);
  if (repositoryStatus === null || !repositoryStatus.isDirectory() || repositoryStatus.isSymbolicLink() || await realpath(repositoryRoot) !== repositoryRoot || !ownedByEffectiveUser(repositoryStatus)) throw new Error("mack_replay_registry_root_invalid");
  if (gitDirectoryStatus === null || !gitDirectoryStatus.isDirectory() || gitDirectoryStatus.isSymbolicLink() || await realpath(canonicalGitDirectory) !== canonicalGitDirectory || !ownedByEffectiveUser(gitDirectoryStatus)) throw new Error("mack_replay_registry_root_invalid");
  let status = await lstatOrNull(rootInput);
  if (status === null) {
    const parent = dirname(rootInput);
    const parentStatus = await lstatOrNull(parent);
    if (parentStatus === null || !parentStatus.isDirectory() || parentStatus.isSymbolicLink() || await realpath(parent) !== parent || join(parent, basename(rootInput)) !== rootInput || !ownedByEffectiveUser(parentStatus)) throw new Error("mack_replay_registry_root_unsafe");
    try {
      await mkdir(rootInput, { mode: 0o700 });
      await syncDirectory(parent);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw new Error("mack_replay_registry_create_failed");
    }
    status = await lstatOrNull(rootInput);
  }
  if (status === null || !status.isDirectory() || status.isSymbolicLink() || await realpath(rootInput) !== rootInput || !ownedByEffectiveUser(status) || (process.platform !== "win32" && (status.mode & 0o077) !== 0)) throw new Error("mack_replay_registry_root_unsafe");
  return rootInput;
}

async function inspectReplayRegistryRoot(rootInput, repositoryRoot, canonicalGitDirectory) {
  if (typeof rootInput !== "string" || !isAbsolute(rootInput) || resolve(rootInput) !== rootInput || pathsOverlap(rootInput, repositoryRoot) || pathsOverlap(rootInput, canonicalGitDirectory)) throw new Error("mack_replay_registry_root_invalid");
  const [repositoryStatus, gitDirectoryStatus] = await Promise.all([lstatOrNull(repositoryRoot), lstatOrNull(canonicalGitDirectory)]);
  if (repositoryStatus === null || !repositoryStatus.isDirectory() || repositoryStatus.isSymbolicLink() || await realpath(repositoryRoot) !== repositoryRoot || !ownedByEffectiveUser(repositoryStatus)) throw new Error("mack_replay_registry_root_invalid");
  if (gitDirectoryStatus === null || !gitDirectoryStatus.isDirectory() || gitDirectoryStatus.isSymbolicLink() || await realpath(canonicalGitDirectory) !== canonicalGitDirectory || !ownedByEffectiveUser(gitDirectoryStatus)) throw new Error("mack_replay_registry_root_invalid");
  const status = await lstatOrNull(rootInput);
  if (status === null || !status.isDirectory() || status.isSymbolicLink() || await realpath(rootInput) !== rootInput || !ownedByEffectiveUser(status) || (process.platform !== "win32" && (status.mode & 0o077) !== 0)) throw new Error("mack_replay_registry_root_unsafe");
  return { path: rootInput, identity: status };
}

async function retainReplayRegistryRoot(path, expected) {
  const before = await lstatOrNull(path);
  if (before === null || !before.isDirectory() || before.isSymbolicLink() || !ownedByEffectiveUser(before) ||
      (process.platform !== "win32" && (before.mode & 0o077) !== 0) || before.dev !== expected.dev || before.ino !== expected.ino ||
      before.mode !== expected.mode || before.uid !== expected.uid) throw new Error("mack_replay_registry_root_unsafe");
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isDirectory() || !ownedByEffectiveUser(opened) || (process.platform !== "win32" && (opened.mode & 0o077) !== 0) ||
        opened.dev !== before.dev || opened.ino !== before.ino || opened.mode !== before.mode || opened.uid !== before.uid) {
      throw new Error("mack_replay_registry_root_unsafe");
    }
    return { path, handle, identity: opened };
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}

async function assertRetainedReplayRegistryRoot(retained) {
  const [opened, current, canonical] = await Promise.all([
    retained.handle.stat().catch(() => null), lstatOrNull(retained.path), realpath(retained.path).catch(() => null),
  ]);
  if (opened === null || current === null || canonical !== retained.path || !opened.isDirectory() || !current.isDirectory() || current.isSymbolicLink() ||
      !ownedByEffectiveUser(opened) || !ownedByEffectiveUser(current) ||
      (process.platform !== "win32" && ((opened.mode & 0o077) !== 0 || (current.mode & 0o077) !== 0)) ||
      opened.dev !== retained.identity.dev || opened.ino !== retained.identity.ino || opened.mode !== retained.identity.mode || opened.uid !== retained.identity.uid ||
      opened.ctimeMs !== retained.identity.ctimeMs || opened.birthtimeMs !== retained.identity.birthtimeMs ||
      current.dev !== retained.identity.dev || current.ino !== retained.identity.ino || current.mode !== retained.identity.mode || current.uid !== retained.identity.uid ||
      current.ctimeMs !== retained.identity.ctimeMs || current.birthtimeMs !== retained.identity.birthtimeMs) {
    throw new Error("mack_replay_registry_root_unsafe");
  }
}

async function retainedReplayRegistryAnchor(retained) {
  const candidates = process.platform === "darwin"
    ? [{ path: `/.vol/${retained.identity.dev}/${retained.identity.ino}`, noFollow: true }]
    : process.platform === "linux"
      ? [{ path: `/proc/self/fd/${retained.handle.fd}`, noFollow: false }]
      : [{ path: `/proc/self/fd/${retained.handle.fd}`, noFollow: false }, { path: `/dev/fd/${retained.handle.fd}`, noFollow: false }];
  for (const candidate of candidates) {
    let duplicate;
    try {
      duplicate = await open(candidate.path, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (candidate.noFollow ? (fsConstants.O_NOFOLLOW ?? 0) : 0));
      const identity = await duplicate.stat();
      if (identity.isDirectory() && identity.dev === retained.identity.dev && identity.ino === retained.identity.ino) return candidate.path;
    } catch {
      // Try the next kernel-provided descriptor namespace.
    } finally {
      await duplicate?.close().catch(() => {});
    }
  }
  throw new Error("mack_replay_registry_anchor_unavailable");
}

function replayPaths(root, validationRequestId) {
  const key = createHash("sha256").update(validationRequestId, "utf8").digest("hex");
  return Object.freeze({ record: join(root, `${key}.json`), lock: join(root, `${key}.lock`), key });
}

async function acquireReplayLock(root, lockPath, validationRequestId, requestDigest) {
  const marker = Object.freeze({
    schemaVersion: 1,
    validationRequestId,
    requestDigest,
    nonce: randomBytes(32).toString("base64url"),
  });
  const markerBytes = Buffer.from(`${canonicalJson(marker)}\n`, "utf8");
  let handle;
  try {
    handle = await open(lockPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR, 0o600);
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      const status = await lstatOrNull(lockPath);
      if (status === null || !status.isFile() || status.isSymbolicLink() || status.nlink !== 1 || (process.platform !== "win32" && (status.mode & 0o077) !== 0)) throw new Error("mack_replay_registry_lock_unsafe");
      throw new Error("mack_validation_replay_in_progress");
    }
    throw new Error("mack_replay_registry_lock_failed");
  }
  try {
    await handle.writeFile(markerBytes);
    await handle.sync();
    await syncDirectory(root);
    const identity = await handle.stat();
    let released = false;
    return async () => {
      if (released) throw new Error("mack_replay_registry_recovery_required");
      released = true;
      try {
        const pathStatus = await lstat(lockPath);
        if (!pathStatus.isFile() || pathStatus.isSymbolicLink() || pathStatus.nlink !== 1 || pathStatus.dev !== identity.dev || pathStatus.ino !== identity.ino) throw new Error("lock_identity_changed");
        const observed = Buffer.alloc(markerBytes.byteLength + 1);
        const { bytesRead } = await handle.read(observed, 0, observed.byteLength, 0);
        if (bytesRead !== markerBytes.byteLength || !observed.subarray(0, bytesRead).equals(markerBytes)) throw new Error("lock_marker_changed");
        await unlink(lockPath);
        await handle.close();
        handle = null;
        await syncDirectory(root);
        if (await lstatOrNull(lockPath) !== null) throw new Error("lock_still_present");
      } catch {
        if (handle !== null) await handle.close().catch(() => {});
        throw new Error("mack_replay_registry_recovery_required");
      }
    };
  } catch {
    await handle.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
    throw new Error("mack_replay_registry_lock_failed");
  }
}

function evidenceDigest(evidence) {
  if (!plain(evidence) || typeof evidence.evidenceDigest !== "string" || !DIGEST.test(evidence.evidenceDigest)) return null;
  const withoutDigest = {};
  for (const key of Object.keys(evidence)) if (key !== "evidenceDigest") withoutDigest[key] = evidence[key];
  return sha256(Buffer.from(canonicalJson(withoutDigest), "utf8"));
}

async function readReplayRecordSnapshot(recordPath, artifactPath = recordPath) {
  const bytes = await readPrivateRegularFile(recordPath, { minBytes: 2, maxBytes: REPLAY_RECORD_LIMIT, unsafeCode: "mack_replay_registry_record_unsafe" });
  if (bytes === null) return null;
  const raw = bytes.toString("utf8");
  const parsed = strictParseJson(raw.endsWith("\n") ? raw.slice(0, -1) : raw, { maxBytes: REPLAY_RECORD_LIMIT, maxDepth: 64, rejectControlCharacters: false });
  if (!raw.endsWith("\n") || parsed.state !== "valid" || !exactPlain(parsed.value, ["schemaVersion", "validationRequestId", "requestDigest", "evidenceDigest", "evidence"]) || parsed.value.schemaVersion !== 1 || canonicalJson(parsed.value) + "\n" !== raw) throw new Error("mack_replay_registry_record_malformed");
  if (!DIGEST.test(parsed.value.requestDigest) || !DIGEST.test(parsed.value.evidenceDigest) || parsed.value.evidenceDigest !== parsed.value.evidence?.evidenceDigest || evidenceDigest(parsed.value.evidence) !== parsed.value.evidenceDigest) throw new Error("mack_replay_registry_record_malformed");
  return Object.freeze({
    value: parsed.value,
    artifact: Object.freeze({ path: artifactPath, bytes: bytes.byteLength, sha256: sha256(bytes) }),
  });
}

async function readReplayRecord(recordPath) {
  return (await readReplayRecordSnapshot(recordPath))?.value ?? null;
}

async function persistReplayRecord(root, recordPath, record) {
  const bytes = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
  if (bytes.byteLength > REPLAY_RECORD_LIMIT) throw new Error("mack_replay_registry_record_too_large");
  const temporaryPath = join(root, `.${basename(recordPath)}.${randomBytes(24).toString("hex")}.tmp`);
  let handle;
  let linked = false;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await link(temporaryPath, recordPath);
    linked = true;
    await syncDirectory(root);
    await unlink(temporaryPath);
    await syncDirectory(root);
    const readback = await readReplayRecord(recordPath);
    if (readback === null || !same(readback, record)) throw new Error("readback_mismatch");
  } catch {
    if (handle !== null && handle !== undefined) await handle.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    if (linked) throw new Error("mack_replay_registry_recovery_required");
    throw new Error("mack_replay_registry_persist_failed");
  }
}

async function runReplayTransaction({ rootInput, repositoryRoot, canonicalGitDirectory, validationRequestId, requestDigest, validateEvidence }, operation) {
  const root = await prepareReplayRegistryRoot(rootInput, repositoryRoot, canonicalGitDirectory);
  const paths = replayPaths(root, validationRequestId);
  const release = await acquireReplayLock(root, paths.lock, validationRequestId, requestDigest);
  let result;
  let operationError;
  try {
    const names = await readdir(root);
    const temporaryPrefix = `.${basename(paths.record)}.`;
    if (names.some((name) => name.startsWith(temporaryPrefix) && name.endsWith(".tmp"))) throw new Error("mack_replay_registry_recovery_required");
    const existing = await readReplayRecord(paths.record);
    if (existing !== null) {
      if (existing.validationRequestId !== validationRequestId || existing.requestDigest !== requestDigest) throw new Error("mack_validation_replay_conflict");
      if (!validateEvidence(existing.evidence)) throw new Error("mack_replay_registry_evidence_invalid");
      result = deepFreeze(existing.evidence);
    } else {
      result = await operation();
      if (!validateEvidence(result)) throw new Error("mack_replay_registry_evidence_invalid");
      const record = Object.freeze({ schemaVersion: 1, validationRequestId, requestDigest, evidenceDigest: result.evidenceDigest, evidence: result });
      await persistReplayRecord(root, paths.record, record);
    }
  } catch (error) {
    operationError = error;
  }
  try { await release(); }
  catch (error) { throw error; }
  if (operationError !== undefined) throw operationError;
  return result;
}

function terminateChild(child, signal = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try { child.kill(signal); } catch { /* already exited */ }
  }
}

function runCapturedProcess(executable, argv, { cwd, env, timeoutMs, maxBytes, stopOnTruncation }) {
  return new Promise((resolveExecution) => {
    const startedAt = new Date().toISOString();
    let child;
    try {
      child = spawn(executable, argv, {
        cwd,
        env,
        shell: false,
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolveExecution({
        startedAt,
        endedAt: new Date().toISOString(),
        exitCode: null,
        signal: null,
        timedOut: false,
        launchError: boundedError(error?.code ?? error?.message),
        stdout: { bytes: Buffer.alloc(0), truncated: false },
        stderr: { bytes: Buffer.alloc(0), truncated: false },
      });
      return;
    }
    const streams = {
      stdout: { chunks: [], bytes: 0, truncated: false },
      stderr: { chunks: [], bytes: 0, truncated: false },
    };
    let timedOut = false;
    let launchError = null;
    let settled = false;
    let terminationRequested = false;
    let forceTimer;
    const requestTermination = () => {
      if (terminationRequested) return;
      terminationRequested = true;
      terminateChild(child);
      forceTimer = setTimeout(() => terminateChild(child, "SIGKILL"), 1_000);
    };
    const collect = (name, chunk) => {
      const state = streams[name];
      const bytes = Buffer.from(chunk);
      const remaining = Math.max(0, maxBytes - state.bytes);
      if (remaining > 0) {
        const accepted = bytes.subarray(0, remaining);
        state.chunks.push(accepted);
        state.bytes += accepted.byteLength;
      }
      if (bytes.byteLength > remaining) {
        state.truncated = true;
        if (stopOnTruncation) requestTermination();
      }
    };
    child.stdout.on("data", (chunk) => collect("stdout", chunk));
    child.stderr.on("data", (chunk) => collect("stderr", chunk));
    child.once("error", (error) => { launchError = boundedError(error?.code ?? error?.message); });
    const timer = setTimeout(() => {
      timedOut = true;
      requestTermination();
    }, timeoutMs);
    child.once("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      resolveExecution({
        startedAt,
        endedAt: new Date().toISOString(),
        exitCode: Number.isInteger(exitCode) ? exitCode : null,
        signal: typeof signal === "string" ? signal : null,
        timedOut,
        launchError,
        stdout: { bytes: Buffer.concat(streams.stdout.chunks), truncated: streams.stdout.truncated },
        stderr: { bytes: Buffer.concat(streams.stderr.chunks), truncated: streams.stderr.truncated },
      });
    });
  });
}

async function runGit(repositoryRoot, args) {
  const result = await runCapturedProcess("git", ["-C", repositoryRoot, ...args], {
    cwd: repositoryRoot,
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    timeoutMs: MACK_LOCAL_RUNNER_LIMITS.gitTimeoutMs,
    maxBytes: MACK_LOCAL_RUNNER_LIMITS.gitOutputBytes,
    stopOnTruncation: true,
  });
  if (result.launchError !== null || result.timedOut || result.signal !== null || result.exitCode !== 0 || result.stdout.truncated || result.stderr.truncated) throw new Error("mack_git_observation_failed");
  return result.stdout.bytes;
}

function oneLine(bytes) {
  return bytes.toString("utf8").replace(/\r?\n$/u, "");
}

function normalizeRepositoryRemote(value) {
  const trimmed = value.trim().replace(/\.git$/u, "");
  let match = /^git@github\.com:([^/]+\/[^/]+)$/iu.exec(trimmed);
  if (match) return match[1];
  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() !== "github.com" || url.username && url.username !== "git" || url.password || url.search || url.hash) return null;
    match = /^\/([^/]+\/[^/]+)$/u.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function observeRepositoryDefault(request) {
  const canonicalRepositoryRoot = await realpath(request.repositoryRoot);
  const topLevelRaw = oneLine(await runGit(canonicalRepositoryRoot, ["rev-parse", "--show-toplevel"]));
  const gitDirectoryRaw = oneLine(await runGit(canonicalRepositoryRoot, ["rev-parse", "--absolute-git-dir"]));
  const canonicalTopLevel = await realpath(topLevelRaw);
  const canonicalGitDirectory = await realpath(gitDirectoryRaw);
  const branch = oneLine(await runGit(canonicalRepositoryRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]));
  const headRevisionId = oneLine(await runGit(canonicalRepositoryRoot, ["rev-parse", "HEAD"]));
  const status = await runGit(canonicalRepositoryRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const remote = normalizeRepositoryRemote(oneLine(await runGit(canonicalRepositoryRoot, ["config", "--get", "remote.origin.url"])));
  if (remote === null) throw new Error("mack_repository_identity_invalid");
  await runGit(canonicalRepositoryRoot, ["cat-file", "-e", `${request.baseRevisionId}^{commit}`]);
  await runGit(canonicalRepositoryRoot, ["cat-file", "-e", `${request.artifactRevisionId}^{commit}`]);
  const changedRaw = await runGit(canonicalRepositoryRoot, ["diff", "--name-only", "-z", "--diff-filter=ACDMRTUXB", request.baseRevisionId, request.artifactRevisionId, "--"]);
  const changedPaths = changedRaw.byteLength === 0 ? [] : changedRaw.toString("utf8").split("\0").slice(0, -1);
  return Object.freeze({
    repository: remote,
    canonicalRepositoryRoot,
    canonicalTopLevel,
    canonicalGitDirectory,
    branch,
    headRevisionId,
    statusPorcelainBytes: status.byteLength,
    statusPorcelainSha256: sha256(status),
    changedPaths: Object.freeze(changedPaths),
  });
}

async function readGitBlob(repositoryRoot, revision, path) {
  try {
    return await runGit(repositoryRoot, ["show", `${revision}:${path}`]);
  } catch {
    return null;
  }
}

async function deriveRepositoryContextDefault(request) {
  const diff = await runGit(request.repositoryRoot, ["diff", "--binary", "--no-ext-diff", "--full-index", request.baseRevisionId, request.artifactRevisionId, "--"]);
  const sources = [];
  for (const path of request.repositoryContext.implementationPaths) {
    const artifactBytes = await readGitBlob(request.repositoryRoot, request.artifactRevisionId, path);
    const bytes = artifactBytes ?? await readGitBlob(request.repositoryRoot, request.baseRevisionId, path);
    if (bytes === null) throw new Error("mack_repository_source_missing");
    sources.push(Object.freeze({ path, contentBase64: bytes.toString("base64"), sha256: sha256(bytes), truncated: false }));
  }
  return Object.freeze({
    implementationPaths: Object.freeze([...request.repositoryContext.implementationPaths]),
    diff: Object.freeze({ contentBase64: diff.toString("base64"), sha256: sha256(diff), truncated: false }),
    sources: Object.freeze(sources),
  });
}

async function hashFileDefault(path) {
  return new Promise((resolveDigest, rejectDigest) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectDigest);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveDigest(`sha256:${hash.digest("base64url")}`));
  });
}

function environmentObject(entries) {
  return Object.fromEntries(entries.map(({ name, value }) => [name, value]));
}

async function executeCommandDefault(lane) {
  const result = await runCapturedProcess(lane.executable, [...lane.argv], {
    cwd: lane.workingDirectory,
    env: environmentObject(lane.environment),
    timeoutMs: lane.timeoutMs,
    maxBytes: MACK_LOCAL_RUNNER_LIMITS.commandOutputBytes,
    stopOnTruncation: true,
  });
  return Object.freeze({
    laneId: lane.laneId,
    commandId: lane.commandId,
    executable: lane.executable,
    executableSha256: lane.executableSha256,
    argv: Object.freeze([...lane.argv]),
    workingDirectory: lane.workingDirectory,
    environment: Object.freeze(lane.environment.map((entry) => Object.freeze({ ...entry }))),
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    launchError: result.launchError,
    stdout: Object.freeze({ sha256: sha256(result.stdout.bytes), bytes: result.stdout.bytes.byteLength, truncated: result.stdout.truncated }),
    stderr: Object.freeze({ sha256: sha256(result.stderr.bytes), bytes: result.stderr.bytes.byteLength, truncated: result.stderr.truncated }),
  });
}

async function readBoundedResponse(response, maxBytes) {
  if (!response?.body || typeof response.body.getReader !== "function") throw new Error("mack_model_response_body_missing");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!(value instanceof Uint8Array)) throw new Error("mack_model_response_malformed");
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("mack_model_response_too_large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function modelMessage(data, runtime, request) {
  if (!plain(data)) throw new Error("mack_model_response_malformed");
  const responseProvider = readData(data, "provider");
  const responseModel = readData(data, "model");
  if (responseProvider !== undefined && responseProvider !== "lmstudio") throw new Error("mack_model_provider_substitution");
  if (responseModel !== undefined && responseModel !== runtime.loadedInstanceId && responseModel !== request.model.modelKey) throw new Error("mack_model_provider_substitution");
  const output = denseArray(readData(data, "output"), 64);
  if (output === null) throw new Error("mack_model_response_malformed");
  const messages = output.filter((item) => plain(item) && readData(item, "type") === "message");
  if (messages.length !== 1 || typeof readData(messages[0], "content") !== "string") throw new Error("mack_model_response_malformed");
  const content = readData(messages[0], "content").trim();
  if (content.length === 0 || Buffer.byteLength(content, "utf8") > MACK_LOCAL_RUNNER_LIMITS.responseBytes) throw new Error("mack_model_response_malformed");
  const stats = plain(readData(data, "stats")) ? readData(data, "stats") : {};
  const counter = (...names) => {
    for (const name of names) {
      const value = readData(stats, name);
      if (Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000) return value;
    }
    return null;
  };
  return Object.freeze({
    content,
    providerCounters: Object.freeze({
      inputTokens: counter("input_tokens", "prompt_tokens"),
      outputTokens: counter("output_tokens", "completion_tokens"),
      totalTokens: counter("total_tokens"),
    }),
  });
}

async function inferModelDefault({ request, runtime, systemPrompt, prompt, apiToken, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MACK_LOCAL_RUNNER_LIMITS.inferenceTimeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(`${runtime.origin}/api/v1/chat`, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}) },
        body: JSON.stringify({
          model: runtime.loadedInstanceId,
          system_prompt: systemPrompt,
          input: prompt,
          store: false,
          temperature: 0,
          top_p: 1,
          max_output_tokens: MACK_LOCAL_RUNNER_LIMITS.maxOutputTokens,
        }),
      });
    } catch {
      throw new Error(controller.signal.aborted ? "mack_model_timeout" : "mack_model_request_failed");
    }
    if (!response.ok) {
      await response.body?.cancel?.().catch(() => {});
      throw new Error("mack_model_request_failed");
    }
    const responseBytes = await readBoundedResponse(response, MACK_LOCAL_RUNNER_LIMITS.responseBytes);
    const parsed = strictParseJson(responseBytes.toString("utf8"), { maxBytes: MACK_LOCAL_RUNNER_LIMITS.responseBytes, maxDepth: 32, rejectControlCharacters: false });
    if (parsed.state !== "valid") throw new Error("mack_model_response_malformed");
    const message = modelMessage(parsed.value, runtime, request);
    return Object.freeze({ responseBytes, ...message });
  } finally {
    clearTimeout(timer);
  }
}

function laneOutcome(receipt) {
  if (receipt.launchError !== null) return "unavailable";
  if (receipt.timedOut) return "environment_blocked";
  if (receipt.stdout.truncated || receipt.stderr.truncated) return "inconclusive";
  if (receipt.signal !== null || receipt.exitCode !== 0) return "fail";
  if (receipt.exitCode === null) return "inconclusive";
  return "pass";
}

const SYSTEM_PROMPT = `You are executing the Mack validation seat's narrow analysis step. Return exactly one JSON object and no prose. The host alone owns identities, command outcomes, coverage, final status, routing, and the mack.validation.v0 report. Your object must contain exactly scenarioAssessments, findings, limitations, and recommendedRoute. Assess every supplied scenario exactly once in order. Each assessment is satisfied, failed, or uncertain. Finding classifications are production_defect, test_defect, environment_limitation, coverage_gap, or advisory_gap; routes are constrained by the supplied schema. Do not claim commands ran, do not emit PASS or a report, and do not add identity or revision fields.`;

function buildPrompt(request, receipts) {
  const packet = {
    mission: {
      missionId: request.missionId,
      missionRevisionId: request.missionRevisionId,
      subjectId: request.subjectId,
      repository: request.repository,
      branch: request.branch,
      baseRevisionId: request.baseRevisionId,
      artifactRevisionId: request.artifactRevisionId,
      validationRequestId: request.validationRequestId,
    },
    acceptanceScenarios: request.scenarios,
    laneSummaries: receipts.map((receipt) => ({
      laneId: receipt.laneId,
      commandId: receipt.commandId,
      outcome: laneOutcome(receipt),
      stdout: receipt.stdout,
      stderr: receipt.stderr,
    })),
    repositoryContext: request.repositoryContext,
    missionArtifacts: request.missionArtifacts,
    responseSchema: {
      scenarioAssessments: [{ scenarioId: "frozen scenario ID", assessment: "satisfied|failed|uncertain", summary: "bounded analysis" }],
      findings: [{ findingId: "unique ID", classification: "production_defect|test_defect|environment_limitation|coverage_gap|advisory_gap", route: "may|mack|daisy|fury" }],
      limitations: ["bounded limitation"],
      recommendedRoute: "advance|may|mack|daisy|fury",
    },
  };
  const prompt = canonicalJson(packet);
  if (Buffer.byteLength(prompt, "utf8") > MACK_LOCAL_RUNNER_LIMITS.promptBytes) throw new Error("mack_model_prompt_too_large");
  return prompt;
}

function validateCommandRegistry(request, registry) {
  const entries = denseArray(registry, 128);
  if (entries === null || entries.length !== request.lanes.length) throw new Error("mack_command_registry_mismatch");
  const fields = ["commandId", "executable", "executableSha256", "argv", "workingDirectory", "timeoutMs", "environment"];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!exactPlain(entry, fields)) throw new Error("mack_command_registry_mismatch");
    const lane = request.lanes[index];
    const frozen = Object.fromEntries(fields.map((field) => [field, lane[field]]));
    if (!same(entry, frozen)) throw new Error("mack_command_registry_mismatch");
  }
  return entries;
}

function assertPreconditionObservation(request, observation) {
  if (!plain(observation) || observation.repository?.toLowerCase() !== request.repository.toLowerCase() || observation.canonicalRepositoryRoot !== request.repositoryRoot || observation.canonicalTopLevel !== request.repositoryRoot || observation.canonicalGitDirectory !== request.canonicalGitDirectory || observation.branch !== request.branch || observation.headRevisionId !== request.artifactRevisionId || observation.statusPorcelainBytes !== 0 || !same(observation.changedPaths, request.repositoryContext.implementationPaths)) throw new Error("mack_git_identity_mismatch");
}

function normalizeDependencies(injected) {
  const fetchImpl = injected?.fetchImpl ?? fetch;
  const defaults = {
    fetchImpl,
    probeModel: ({ baseUrl, model, apiToken }) => probeLocalModelMetadata({ baseUrl, model, fetchImpl, apiToken, timeoutMs: MACK_LOCAL_RUNNER_LIMITS.inferenceTimeoutMs }),
    observeRepository: observeRepositoryDefault,
    deriveRepositoryContext: deriveRepositoryContextDefault,
    executeCommand: executeCommandDefault,
    hashExecutable: hashFileDefault,
    canonicalPath: realpath,
    inferModel: (input) => inferModelDefault({ ...input, fetchImpl }),
  };
  if (injected === undefined) return defaults;
  if (!plain(injected)) throw new Error("mack_runner_dependencies_invalid");
  const allowed = new Set(Object.keys(defaults));
  if (Reflect.ownKeys(injected).some((key) => typeof key !== "string" || !allowed.has(key) || typeof readData(injected, key) !== "function")) throw new Error("mack_runner_dependencies_invalid");
  return { ...defaults, ...injected };
}

function parseAnalysis(content) {
  const parsed = strictParseJson(content, { maxBytes: MACK_LOCAL_RUNNER_LIMITS.responseBytes, maxDepth: 16, rejectControlCharacters: true });
  if (parsed.state !== "valid" || !plain(parsed.value)) throw new Error("mack_model_analysis_malformed");
  return parsed.value;
}

function promoteProductionEvidence(syntheticEvidence) {
  if (!plain(syntheticEvidence) || syntheticEvidence.evidenceSource !== "synthetic" || syntheticEvidence.productionEligibility !== "ineligible" || syntheticEvidence.advancementEligibility !== "ineligible") throw new Error("mack_production_promotion_invalid");
  const reasonCodes = syntheticEvidence.reasonCodes.filter((code) => code !== "SYNTHETIC_EVIDENCE");
  const eligible = syntheticEvidence.evaluation?.advancementEligibility === "eligible" && syntheticEvidence.report?.status === "pass" && reasonCodes.length === 0;
  const promoted = {};
  for (const key of Object.keys(syntheticEvidence)) if (key !== "evidenceDigest") promoted[key] = syntheticEvidence[key];
  promoted.evidenceSource = "production";
  promoted.productionEligibility = eligible ? "eligible" : "ineligible";
  promoted.advancementEligibility = eligible ? "eligible" : "ineligible";
  promoted.reasonCodes = [...new Set(reasonCodes)];
  promoted.evidenceDigest = sha256(Buffer.from(canonicalJson(promoted), "utf8"));
  return deepFreeze(promoted);
}

export function reconstructMackSyntheticEvidenceV1(requestInput, requestDigest, evidence) {
  const normalized = normalizeMackLocalValidationRequestV1(requestInput);
  if (normalized.state !== "valid" || normalized.requestDigest !== requestDigest) return null;
  const request = normalized.value;
  if (!plain(evidence)) return null;
  const created = createMackLocalValidationEvidenceV1({
    request,
    requestDigest,
    preInferenceGit: evidence.preInferenceGit,
    postInferenceGit: evidence.postInferenceGit,
    preInferenceRuntime: evidence.preInferenceRuntime,
    postInferenceRuntime: evidence.postInferenceRuntime,
    commandReceipts: evidence.commandReceipts,
    repositoryContextVerified: evidence.repositoryContextVerified,
    missionArtifactsVerified: evidence.missionArtifactsVerified,
    promptSha256: evidence.promptSha256,
    responseSha256: evidence.responseSha256,
    providerCounters: evidence.providerCounters,
    modelAnalysis: evidence.modelAnalysis,
  });
  return created.state === "created" ? created.evidence : null;
}

function storedEvidenceValidator(request, requestDigest, productionPath) {
  return (evidence) => {
    try {
      const synthetic = reconstructMackSyntheticEvidenceV1(request, requestDigest, evidence);
      if (synthetic === null) return false;
      const expected = productionPath ? promoteProductionEvidence(synthetic) : synthetic;
      return same(expected, evidence) && evidenceDigest(evidence) === evidence.evidenceDigest;
    } catch {
      return false;
    }
  };
}

export async function readMackProductionValidationRegistryV1(packetInput, bindingInput) {
  const normalized = normalizeMackLocalValidationRequestV1(packetInput);
  if (normalized.state !== "valid" || !exactPlain(bindingInput, ["replayRegistryRoot", "validationRequestId", "requestDigest"]) ||
      bindingInput.validationRequestId !== normalized.value.validationRequestId || bindingInput.requestDigest !== normalized.requestDigest) {
    return deepFreeze({ state: "invalid", reasonCode: "mack_request_binding_invalid" });
  }
  const request = normalized.value;
  let retainedRoot;
  try {
    const inspectedRoot = await inspectReplayRegistryRoot(bindingInput.replayRegistryRoot, request.repositoryRoot, request.canonicalGitDirectory);
    const root = inspectedRoot.path;
    retainedRoot = await retainReplayRegistryRoot(root, inspectedRoot.identity);
    await assertRetainedReplayRegistryRoot(retainedRoot);
    const paths = replayPaths(root, request.validationRequestId);
    const anchor = await retainedReplayRegistryAnchor(retainedRoot);
    const anchoredRecord = join(anchor, basename(paths.record));
    const anchoredLock = join(anchor, basename(paths.lock));
    const lockStatus = await lstatOrNull(anchoredLock);
    await assertRetainedReplayRegistryRoot(retainedRoot);
    if (lockStatus !== null) return deepFreeze({ state: "recovery", reasonCode: "mack_registry_readback_uncertain" });
    const snapshot = await readReplayRecordSnapshot(anchoredRecord, paths.record);
    await assertRetainedReplayRegistryRoot(retainedRoot);
    if (await lstatOrNull(anchoredLock) !== null) return deepFreeze({ state: "recovery", reasonCode: "mack_registry_readback_uncertain" });
    await assertRetainedReplayRegistryRoot(retainedRoot);
    if (snapshot === null) return deepFreeze({
      state: "waiting",
      validationRequestId: request.validationRequestId,
      requestDigest: normalized.requestDigest,
    });
    const record = snapshot.value;
    if (record.validationRequestId !== request.validationRequestId || record.requestDigest !== normalized.requestDigest ||
        record.evidenceDigest !== record.evidence?.evidenceDigest) {
      return deepFreeze({ state: "invalid", reasonCode: "mack_registry_binding_conflict" });
    }
    if (!storedEvidenceValidator(request, normalized.requestDigest, true)(record.evidence)) {
      return deepFreeze({ state: "invalid", reasonCode: "mack_production_evidence_invalid" });
    }
    return deepFreeze({
      state: "verified",
      validationRequestId: request.validationRequestId,
      requestDigest: normalized.requestDigest,
      record: snapshot.artifact,
      evidence: record.evidence,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "mack_registry_readback_uncertain";
    const invalidCodes = new Set(["mack_replay_registry_record_malformed"]);
    return deepFreeze({
      state: invalidCodes.has(code) ? "invalid" : "recovery",
      reasonCode: invalidCodes.has(code) ? "mack_production_evidence_invalid" : "mack_registry_readback_uncertain",
    });
  } finally {
    await retainedRoot?.handle.close().catch(() => {});
  }
}

async function runMackLocalValidationInternal(packetInput, optionsInput, injectedDependencies, provenance) {
  const normalized = normalizeMackLocalValidationRequestV1(packetInput);
  if (normalized.state !== "valid") throw new Error("mack_validation_request_invalid");
  const request = normalized.value;
  if (!plain(optionsInput) || Reflect.ownKeys(optionsInput).some((key) => !["commandRegistry", "apiToken", "replayRegistryRoot"].includes(key)) || !Object.hasOwn(optionsInput, "commandRegistry") || typeof optionsInput.replayRegistryRoot !== "string" || (Object.hasOwn(optionsInput, "apiToken") && typeof optionsInput.apiToken !== "string")) throw new Error("mack_runner_options_invalid");
  const commandRegistry = validateCommandRegistry(request, optionsInput.commandRegistry);
  const productionPath = provenance === PRODUCTION_PROVENANCE;
  return runReplayTransaction({
    rootInput: optionsInput.replayRegistryRoot,
    repositoryRoot: request.repositoryRoot,
    canonicalGitDirectory: request.canonicalGitDirectory,
    validationRequestId: request.validationRequestId,
    requestDigest: normalized.requestDigest,
    validateEvidence: storedEvidenceValidator(request, normalized.requestDigest, productionPath),
  }, async () => {
    const dependencies = normalizeDependencies(injectedDependencies);
    const canonicalRoot = await dependencies.canonicalPath(request.repositoryRoot);
    if (canonicalRoot !== request.repositoryRoot) throw new Error("mack_repository_root_mismatch");
    for (let index = 0; index < request.lanes.length; index += 1) {
      const lane = request.lanes[index];
      const entry = commandRegistry[index];
      if (!isAbsolute(lane.executable) || await dependencies.canonicalPath(lane.executable) !== lane.executable || await dependencies.hashExecutable(lane.executable) !== lane.executableSha256) throw new Error("mack_command_executable_mismatch");
      if (!isAbsolute(lane.workingDirectory) || await dependencies.canonicalPath(lane.workingDirectory) !== lane.workingDirectory || !(lane.workingDirectory === canonicalRoot || lane.workingDirectory.startsWith(`${canonicalRoot}/`))) throw new Error("mack_command_working_directory_mismatch");
      if (!same(entry, Object.fromEntries(["commandId", "executable", "executableSha256", "argv", "workingDirectory", "timeoutMs", "environment"].map((field) => [field, lane[field]])))) throw new Error("mack_command_registry_mismatch");
    }

    const preInferenceRuntime = await dependencies.probeModel({ baseUrl: request.model.baseUrl, model: request.model.modelKey, apiToken: optionsInput.apiToken });
    if (!plain(preInferenceRuntime) || preInferenceRuntime.provider !== "lmstudio" || preInferenceRuntime.observedModelKey !== request.model.modelKey || preInferenceRuntime.loadedInstanceId === request.toolExecutorId) throw new Error("mack_runtime_identity_mismatch");
    const preInferenceGit = await dependencies.observeRepository(request);
    assertPreconditionObservation(request, preInferenceGit);
    const derivedContext = await dependencies.deriveRepositoryContext(request);
    if (!same(derivedContext, request.repositoryContext)) throw new Error("mack_repository_context_mismatch");

    const commandReceipts = [];
    for (const lane of request.lanes) {
      if (await dependencies.hashExecutable(lane.executable) !== lane.executableSha256) throw new Error("mack_command_executable_changed");
      commandReceipts.push(await dependencies.executeCommand(lane));
    }
    const prompt = buildPrompt(request, commandReceipts);
    const inference = await dependencies.inferModel({ request, runtime: preInferenceRuntime, systemPrompt: SYSTEM_PROMPT, prompt, apiToken: optionsInput.apiToken });
    if (!plain(inference) || !(inference.responseBytes instanceof Uint8Array) || typeof inference.content !== "string" || !plain(inference.providerCounters)) throw new Error("mack_model_response_malformed");
    const modelAnalysis = parseAnalysis(inference.content);
    const postInferenceRuntime = await dependencies.probeModel({ baseUrl: request.model.baseUrl, model: request.model.modelKey, apiToken: optionsInput.apiToken });
    if (!same(preInferenceRuntime, postInferenceRuntime)) throw new Error("mack_runtime_identity_changed");
    const postInferenceGit = await dependencies.observeRepository(request);
    assertPreconditionObservation(request, postInferenceGit);
    if (!same(preInferenceGit, postInferenceGit)) throw new Error("mack_git_identity_changed");

    const created = createMackLocalValidationEvidenceV1({
      request,
      requestDigest: normalized.requestDigest,
      preInferenceGit,
      postInferenceGit,
      preInferenceRuntime,
      postInferenceRuntime,
      commandReceipts,
      repositoryContextVerified: true,
      missionArtifactsVerified: true,
      promptSha256: sha256(Buffer.from(`${SYSTEM_PROMPT}\0${prompt}`, "utf8")),
      responseSha256: sha256(Buffer.from(inference.responseBytes)),
      providerCounters: inference.providerCounters,
      modelAnalysis,
    });
    if (created.state !== "created") throw new Error(`mack_evidence_invalid_${created.reasonCodes[0]?.toLowerCase() ?? "unknown"}`);
    return productionPath ? promoteProductionEvidence(created.evidence) : created.evidence;
  });
}

export async function runMackLocalValidation(packetInput, optionsInput, injectedDependencies) {
  return runMackLocalValidationInternal(packetInput, optionsInput, injectedDependencies, null);
}

async function runMackProductionValidation(packetInput, optionsInput) {
  return runMackLocalValidationInternal(packetInput, optionsInput, undefined, PRODUCTION_PROVENANCE);
}

export const runMackValidationPacket = runMackLocalValidation;

async function readStdinBounded() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const value = Buffer.from(chunk);
    bytes += value.byteLength;
    if (bytes > MACK_LOCAL_RUNNER_LIMITS.packetBytes) throw new Error("mack_validation_packet_too_large");
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const packetRaw = await readStdinBounded();
  const packet = strictParseJson(packetRaw, { maxBytes: MACK_LOCAL_RUNNER_LIMITS.packetBytes, maxDepth: 32, rejectControlCharacters: false });
  if (packet.state !== "valid") throw new Error("mack_validation_packet_invalid");
  const registryRaw = process.env.SHIELD_MACK_COMMAND_REGISTRY_JSON;
  if (typeof registryRaw !== "string") throw new Error("mack_command_registry_missing");
  const registry = strictParseJson(registryRaw, { maxBytes: 262_144, maxDepth: 16, rejectControlCharacters: true });
  if (registry.state !== "valid") throw new Error("mack_command_registry_invalid");
  const replayRegistryRoot = process.env.SHIELD_MACK_REPLAY_REGISTRY_ROOT;
  if (typeof replayRegistryRoot !== "string") throw new Error("mack_replay_registry_missing");
  const evidence = await runMackProductionValidation(packet.value, {
    commandRegistry: registry.value,
    replayRegistryRoot,
    ...(process.env.LOCAL_MODEL_API_TOKEN ? { apiToken: process.env.LOCAL_MODEL_API_TOKEN } : {}),
  });
  process.stdout.write(`${canonicalJson(evidence)}\n`);
}

if (import.meta.main === true) {
  main().catch((error) => {
    process.stderr.write(`${boundedError(error instanceof Error ? error.message : "mack_validation_failed", "mack_validation_failed")}\n`);
    process.exitCode = 1;
  });
}
