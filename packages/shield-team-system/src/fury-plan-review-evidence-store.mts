import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  replayFuryPlanReviewEvidenceLedgerV1,
  type FuryPlanReviewEvidenceV1,
} from "./fury-plan-review-evidence-v1.mjs";
import { canonicalJson } from "./mission-v2.mjs";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const LOCK_OWNER = /^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._:/@#-]*$/u;
const STORE_DIRECTORY = "fury-plan-reviews";

interface Valid<T> {
  readonly state: "valid";
  readonly value: T;
}

interface Invalid {
  readonly state: "invalid";
  readonly code: string;
  readonly errors: readonly string[];
}

export type FuryPlanReviewEvidenceStoreResult<T> = Valid<T> | Invalid;

export interface FuryPlanReviewEvidenceStoreScopeInput {
  readonly repositoryRoot: string;
  readonly missionId: string;
  readonly lockOwnerId: string;
}

export interface FuryPlanReviewEvidenceStoreAppendInput
  extends FuryPlanReviewEvidenceStoreScopeInput {
  readonly evidence: FuryPlanReviewEvidenceV1;
}

export interface FuryPlanReviewEvidenceStorePaths {
  readonly repositoryRoot: string;
  readonly shieldDirectory: string;
  readonly auditDirectory: string;
  readonly reviewDirectory: string;
  readonly ledgerPath: string;
  readonly lockPath: string;
  readonly reviewDirectoryExists: boolean;
  readonly ledgerExists: boolean;
}

export interface FuryPlanReviewEvidenceLedgerReadResult {
  readonly ledgerPath: string;
  readonly records: readonly FuryPlanReviewEvidenceV1[];
  readonly bytes: string;
  readonly missing: boolean;
}

export interface FuryPlanReviewEvidenceAppendReceipt {
  readonly evidenceId: string;
  readonly evidenceDigest: string;
  readonly appended: true;
  readonly ledgerSequence: number;
}

export interface FuryPlanReviewEvidenceLedgerAppendResult {
  readonly ledgerPath: string;
  readonly records: readonly FuryPlanReviewEvidenceV1[];
  readonly bytes: string;
  readonly byteLength: number;
  readonly receipt: FuryPlanReviewEvidenceAppendReceipt;
}

export interface FuryPlanReviewEvidenceFilesystemStore {
  readonly missionId: string;
  read(): Promise<FuryPlanReviewEvidenceLedgerReadResult>;
  appendIfAbsent(evidence: FuryPlanReviewEvidenceV1): Promise<FuryPlanReviewEvidenceAppendReceipt>;
}

interface LockToken {
  readonly lockPath: string;
  readonly directoryPath: string;
  readonly markerBytes: string;
}

const valid = <T,>(value: T): FuryPlanReviewEvidenceStoreResult<T> => ({ state: "valid", value });
const invalid = <T = never,>(code: string, ...errors: string[]): FuryPlanReviewEvidenceStoreResult<T> => ({
  state: "invalid",
  code,
  errors: errors.length > 0 ? errors : ["Fury plan-review evidence store operation failed."],
});

function plain(value: unknown): value is Record<string, unknown> {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function snapshot<T>(value: T, ancestors = new WeakSet<object>()): FuryPlanReviewEvidenceStoreResult<T> {
  try {
    if (value === null || typeof value !== "object") return valid(value);
    const source = value as object;
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) ||
        ancestors.has(source)) return invalid("malformed_input", "Input has an unsafe object shape.");
    ancestors.add(source);
    const descriptors = Object.getOwnPropertyDescriptors(value as Record<PropertyKey, unknown>);
    const clone: object = array ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key as keyof typeof descriptors];
      if (!descriptor || descriptor.get || descriptor.set || !Object.hasOwn(descriptor, "value")) {
        return invalid("malformed_input", "Input contains an accessor or invalid descriptor.");
      }
      const child = snapshot(descriptor.value, ancestors);
      if (child.state === "invalid") return child;
      Object.defineProperty(clone, key, { ...descriptor, value: child.value });
    }
    ancestors.delete(source);
    return valid(Object.freeze(clone) as T);
  } catch {
    return invalid("malformed_input", "Input reflective validation failed.");
  }
}

function exact(value: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (!plain(value)) return null;
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string") ||
        fields.some((field) => !keys.includes(field)) ||
        keys.some((key) => typeof key === "string" && !fields.includes(key))) return null;
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set ||
          !descriptor.enumerable) return null;
    }
    return value;
  } catch {
    return null;
  }
}

function validateScope(input: unknown): FuryPlanReviewEvidenceStoreResult<FuryPlanReviewEvidenceStoreScopeInput> {
  const copied = snapshot(input);
  if (copied.state === "invalid") return copied;
  const value = exact(copied.value, ["repositoryRoot", "missionId", "lockOwnerId"]);
  if (value === null || typeof value.repositoryRoot !== "string" || value.repositoryRoot.length === 0 ||
      typeof value.missionId !== "string" || !IDENTIFIER.test(value.missionId) ||
      typeof value.lockOwnerId !== "string" || !LOCK_OWNER.test(value.lockOwnerId)) {
    return invalid("malformed_input", "Fury plan-review evidence store scope is malformed.");
  }
  return valid(Object.freeze({
    repositoryRoot: value.repositoryRoot,
    missionId: value.missionId,
    lockOwnerId: value.lockOwnerId,
  }));
}

function validateAppend(input: unknown): FuryPlanReviewEvidenceStoreResult<FuryPlanReviewEvidenceStoreAppendInput> {
  const copied = snapshot(input);
  if (copied.state === "invalid") return copied;
  const value = exact(copied.value, ["repositoryRoot", "missionId", "lockOwnerId", "evidence"]);
  if (value === null) return invalid("malformed_input", "Fury plan-review evidence append input is malformed.");
  const scope = validateScope({
    repositoryRoot: value.repositoryRoot,
    missionId: value.missionId,
    lockOwnerId: value.lockOwnerId,
  });
  if (scope.state === "invalid") return scope;
  const replay = replayFuryPlanReviewEvidenceLedgerV1([value.evidence]);
  if (replay.state === "invalid" || replay.records[0]?.missionId !== scope.value.missionId) {
    return invalid("malformed_input", "Fury plan-review evidence record is malformed or out of mission scope.");
  }
  return valid(Object.freeze({ ...scope.value, evidence: replay.records[0] as FuryPlanReviewEvidenceV1 }));
}

function ledgerFilename(missionId: string): string {
  return `${createHash("sha256").update(missionId, "utf8").digest("base64url")}.jsonl`;
}

function inside(root: string, child: string): boolean {
  const path = relative(root, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function directoryState(path: string): Promise<"missing" | "directory" | "unsafe"> {
  try {
    const stats = await lstat(path);
    return !stats.isSymbolicLink() && stats.isDirectory() ? "directory" : "unsafe";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unsafe";
  }
}

async function ensureDirectory(path: string): Promise<boolean> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") return false;
  }
  if (await directoryState(path) !== "directory") return false;
  try {
    return await realpath(path) === path;
  } catch {
    return false;
  }
}

async function resolvePaths(
  scope: FuryPlanReviewEvidenceStoreScopeInput,
  create: boolean,
): Promise<FuryPlanReviewEvidenceStoreResult<FuryPlanReviewEvidenceStorePaths>> {
  const inputRoot = resolve(scope.repositoryRoot);
  try {
    const stats = await lstat(inputRoot);
    if (stats.isSymbolicLink() || !stats.isDirectory()) return invalid("unsafe_path", "Repository root is unsafe.");
  } catch (error) {
    return invalid("store_unavailable", `Repository root is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
  let repositoryRoot: string;
  try {
    repositoryRoot = await realpath(inputRoot);
  } catch {
    return invalid("store_unavailable", "Repository root realpath is unavailable.");
  }
  const shieldDirectory = join(repositoryRoot, ".shield");
  const auditDirectory = join(shieldDirectory, "audit");
  const reviewDirectory = join(auditDirectory, STORE_DIRECTORY);
  if (![shieldDirectory, auditDirectory, reviewDirectory].every((path) => inside(repositoryRoot, path))) {
    return invalid("unsafe_path", "Fury plan-review evidence path escapes the repository root.");
  }

  let reviewDirectoryExists = true;
  for (const path of [shieldDirectory, auditDirectory, reviewDirectory]) {
    const state = await directoryState(path);
    if (state === "unsafe") return invalid("unsafe_path", "Fury plan-review evidence directory is unsafe.");
    if (state === "missing") {
      reviewDirectoryExists = false;
      if (!create) break;
      if (!await ensureDirectory(path)) return invalid("unsafe_path", "Fury plan-review evidence directory could not be created safely.");
      reviewDirectoryExists = path === reviewDirectory ? true : reviewDirectoryExists;
    } else {
      try {
        if (await realpath(path) !== path) return invalid("unsafe_path", "Fury plan-review evidence directory is aliased.");
      } catch {
        return invalid("unsafe_path", "Fury plan-review evidence directory realpath failed.");
      }
    }
  }
  if (create) reviewDirectoryExists = true;
  const ledgerPath = join(reviewDirectory, ledgerFilename(scope.missionId));
  const lockPath = `${ledgerPath}.lock`;
  let ledgerExists = false;
  if (reviewDirectoryExists) {
    try {
      const stats = await lstat(ledgerPath);
      if (stats.isSymbolicLink() || !stats.isFile()) return invalid("unsafe_path", "Fury plan-review evidence ledger is unsafe.");
      if (await realpath(ledgerPath) !== ledgerPath) return invalid("unsafe_path", "Fury plan-review evidence ledger is aliased.");
      ledgerExists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return invalid("store_unavailable", "Fury plan-review evidence ledger is unavailable.");
      }
    }
  }
  return valid(Object.freeze({
    repositoryRoot, shieldDirectory, auditDirectory, reviewDirectory, ledgerPath, lockPath,
    reviewDirectoryExists, ledgerExists,
  }));
}

function parseLedger(bytes: string, missionId: string): FuryPlanReviewEvidenceStoreResult<readonly FuryPlanReviewEvidenceV1[]> {
  if (bytes.length === 0) return valid(Object.freeze([]));
  if (!bytes.endsWith("\n")) return invalid("evidence_replay_invalid", "Evidence ledger has an incomplete final line.");
  const records: unknown[] = [];
  for (const line of bytes.slice(0, -1).split("\n")) {
    if (line.length === 0) return invalid("evidence_replay_invalid", "Evidence ledger contains an empty line.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return invalid("evidence_replay_invalid", "Evidence ledger contains malformed JSON.");
    }
    try {
      if (canonicalJson(parsed) !== line) {
        return invalid("evidence_replay_invalid", "Evidence ledger line is not canonical JSON.");
      }
    } catch {
      return invalid("evidence_replay_invalid", "Evidence ledger line cannot be canonicalized.");
    }
    records.push(parsed);
  }
  const replay = replayFuryPlanReviewEvidenceLedgerV1(records);
  if (replay.state === "invalid") return invalid("evidence_replay_invalid", replay.reasonCode);
  if (replay.records.some((recordValue) => recordValue.missionId !== missionId)) {
    return invalid("evidence_replay_invalid", "Evidence ledger contains a foreign mission record.");
  }
  return valid(replay.records);
}

export async function readFuryPlanReviewEvidenceLedgerV1(
  input: unknown,
): Promise<FuryPlanReviewEvidenceStoreResult<FuryPlanReviewEvidenceLedgerReadResult>> {
  const checked = validateScope(input);
  if (checked.state === "invalid") return checked;
  const scope = snapshot(checked.value);
  if (scope.state === "invalid") return scope;
  const paths = await resolvePaths(scope.value, false);
  if (paths.state === "invalid") return paths;
  if (!paths.value.reviewDirectoryExists || !paths.value.ledgerExists) {
    return valid(Object.freeze({ ledgerPath: paths.value.ledgerPath, records: Object.freeze([]), bytes: "", missing: true }));
  }
  let handle;
  let bytes: string;
  try {
    handle = await open(paths.value.ledgerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!(await handle.stat()).isFile()) return invalid("unsafe_path", "Evidence ledger is not a regular file.");
    bytes = await handle.readFile("utf8");
  } catch (error) {
    return invalid("store_unavailable", `Evidence ledger read failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
  const parsed = parseLedger(bytes, scope.value.missionId);
  if (parsed.state === "invalid") return parsed;
  return valid(Object.freeze({ ledgerPath: paths.value.ledgerPath, records: parsed.value, bytes, missing: false }));
}

async function syncDirectory(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY);
    await handle.sync();
    return true;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function acquireLock(
  paths: FuryPlanReviewEvidenceStorePaths,
  scope: FuryPlanReviewEvidenceStoreScopeInput,
): Promise<FuryPlanReviewEvidenceStoreResult<LockToken>> {
  const markerBytes = `${canonicalJson({
    lockId: randomUUID(), lockOwnerId: scope.lockOwnerId, missionId: scope.missionId,
  })}\n`;
  let handle;
  try {
    handle = await open(
      paths.lockPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    const written = (await handle.write(markerBytes, null, "utf8")).bytesWritten;
    if (written !== Buffer.byteLength(markerBytes, "utf8")) {
      return invalid("recovery_required", "Evidence lock marker write was incomplete.");
    }
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      try {
        const stats = await lstat(paths.lockPath);
        if (stats.isSymbolicLink() || !stats.isFile()) {
          return invalid("unsafe_path", "Evidence ledger lock path is unsafe.");
        }
      } catch {
        return invalid("recovery_required", "Evidence ledger lock target could not be classified safely.");
      }
    }
    return invalid(code === "EEXIST" ? "evidence_lock_held" : "recovery_required",
      code === "EEXIST" ? "Evidence ledger lock is already held." : `Evidence lock acquisition failed: ${code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
  if (!await syncDirectory(paths.reviewDirectory)) {
    return invalid("recovery_required", "Evidence lock directory sync failed.");
  }
  return valid(Object.freeze({ lockPath: paths.lockPath, directoryPath: paths.reviewDirectory, markerBytes }));
}

async function releaseLock(token: LockToken): Promise<FuryPlanReviewEvidenceStoreResult<void>> {
  let handle;
  try {
    handle = await open(token.lockPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!(await handle.stat()).isFile()) return invalid("recovery_required", "Evidence lock target is unsafe.");
    const current = await handle.readFile("utf8");
    if (current !== token.markerBytes) return invalid("recovery_required", "Evidence lock marker drifted.");
  } catch (error) {
    return invalid("recovery_required", `Evidence lock verification failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
  try {
    await unlink(token.lockPath);
  } catch (error) {
    return invalid("recovery_required", `Evidence lock unlink failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
  if (!await syncDirectory(token.directoryPath)) {
    return invalid("recovery_required", "Evidence lock release directory sync failed.");
  }
  return valid(undefined);
}

function receiptFor(recordValue: FuryPlanReviewEvidenceV1, sequence: number): FuryPlanReviewEvidenceAppendReceipt {
  return Object.freeze({
    evidenceId: recordValue.evidenceId,
    evidenceDigest: recordValue.evidenceDigest,
    appended: true,
    ledgerSequence: sequence,
  });
}

export async function appendFuryPlanReviewEvidenceIfAbsentV1(
  input: unknown,
): Promise<FuryPlanReviewEvidenceStoreResult<FuryPlanReviewEvidenceLedgerAppendResult>> {
  const checked = validateAppend(input);
  if (checked.state === "invalid") return checked;
  const scope = snapshot({
    repositoryRoot: checked.value.repositoryRoot,
    missionId: checked.value.missionId,
    lockOwnerId: checked.value.lockOwnerId,
  });
  const evidence = snapshot(checked.value.evidence);
  if (scope.state === "invalid" || evidence.state === "invalid") {
    return invalid("malformed_input", "Evidence append snapshot failed.");
  }
  const paths = await resolvePaths(scope.value, true);
  if (paths.state === "invalid") return paths;
  const lock = await acquireLock(paths.value, scope.value);
  if (lock.state === "invalid") return lock;

  let operation: FuryPlanReviewEvidenceStoreResult<FuryPlanReviewEvidenceLedgerAppendResult> =
    invalid("store_unavailable", "Evidence append produced no result.");
  let release: Invalid | undefined;
  try {
    const current = await readFuryPlanReviewEvidenceLedgerV1(scope.value);
    if (current.state === "invalid") {
      operation = current;
    } else {
      const existingIndex = current.value.records.findIndex((item) => item.evidenceId === evidence.value.evidenceId);
      if (existingIndex >= 0) {
        const existing = current.value.records[existingIndex] as FuryPlanReviewEvidenceV1;
        operation = canonicalJson(existing) === canonicalJson(evidence.value)
          ? valid(Object.freeze({
              ledgerPath: paths.value.ledgerPath,
              records: current.value.records,
              bytes: current.value.bytes,
              byteLength: Buffer.byteLength(current.value.bytes, "utf8"),
              receipt: receiptFor(existing, existingIndex),
            }))
          : invalid("review_evidence_conflict", "Evidence ID is already present with different content.");
      } else {
        const replay = replayFuryPlanReviewEvidenceLedgerV1([...current.value.records, evidence.value]);
        if (replay.state === "invalid") {
          operation = invalid("review_evidence_conflict", replay.reasonCode);
        } else {
          const line = `${canonicalJson(evidence.value)}\n`;
          let handle;
          try {
            handle = await open(
              paths.value.ledgerPath,
              constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
              0o600,
            );
            if (!(await handle.stat()).isFile()) throw Object.assign(new Error("unsafe"), { code: "ELOOP" });
            const written = (await handle.write(line, null, "utf8")).bytesWritten;
            if (written !== Buffer.byteLength(line, "utf8")) {
              operation = invalid("recovery_required", "Evidence append write was incomplete.");
            } else {
              await handle.sync();
              operation = valid(undefined as never);
            }
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            operation = invalid(code === "ELOOP" || code === "ENOTDIR" ? "unsafe_path" : "recovery_required",
              `Evidence append failed: ${code ?? "unknown_error"}.`);
          } finally {
            await handle?.close().catch(() => undefined);
          }
          if (operation.state === "valid") {
            if (current.value.missing && !await syncDirectory(paths.value.reviewDirectory)) {
              operation = invalid("recovery_required", "Evidence ledger directory sync failed.");
            } else {
              const after = await readFuryPlanReviewEvidenceLedgerV1(scope.value);
              const expectedBytes = `${current.value.bytes}${line}`;
              if (after.state === "invalid" || after.value.bytes !== expectedBytes) {
                operation = invalid("recovery_required", "Evidence append readback did not match exact expected bytes.");
              } else {
                operation = valid(Object.freeze({
                  ledgerPath: paths.value.ledgerPath,
                  records: after.value.records,
                  bytes: after.value.bytes,
                  byteLength: Buffer.byteLength(after.value.bytes, "utf8"),
                  receipt: receiptFor(evidence.value, after.value.records.length - 1),
                }));
              }
            }
          }
        }
      }
    }
  } finally {
    const released = await releaseLock(lock.value);
    if (released.state === "invalid") release = released;
  }
  if (release !== undefined) return invalid("recovery_required", ...release.errors);
  return operation;
}

function throwClosed(result: Invalid): never {
  throw Object.assign(new Error(result.errors.join(" ")), { code: result.code });
}

export function createFuryPlanReviewEvidenceFilesystemStore(
  input: FuryPlanReviewEvidenceStoreScopeInput,
): FuryPlanReviewEvidenceFilesystemStore {
  const checked = validateScope(input);
  return Object.freeze({
    missionId: checked.state === "valid" ? checked.value.missionId : "invalid",
    async read() {
      if (checked.state === "invalid") return throwClosed(checked);
      const result = await readFuryPlanReviewEvidenceLedgerV1(checked.value);
      return result.state === "valid" ? result.value : throwClosed(result);
    },
    async appendIfAbsent(evidence: FuryPlanReviewEvidenceV1) {
      if (checked.state === "invalid") return throwClosed(checked);
      const result = await appendFuryPlanReviewEvidenceIfAbsentV1({ ...checked.value, evidence });
      return result.state === "valid" ? result.value.receipt : throwClosed(result);
    },
  });
}
