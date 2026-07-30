import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isProxy } from "node:util/types";

import {
  replaySeatDispatchReceiptsV1,
  type SeatDispatchReceiptEventV1,
  type SeatDispatchReceiptProjectionV1,
} from "./seat-dispatch-receipt-v1.mjs";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const LOCK_PREFIX = "dispatch-receipts.lock:";

export const SEAT_DISPATCH_RECEIPTS_LOG_RELATIVE_PATH = join(".shield", "dispatch-receipts.jsonl");

export interface SeatDispatchReceiptStoreScopeInput {
  readonly repositoryRoot: string;
  readonly repositoryId: string;
  readonly repositoryWorkspaceId: string;
}

export interface SeatDispatchReceiptStoreAppendInput extends SeatDispatchReceiptStoreScopeInput {
  readonly event: SeatDispatchReceiptEventV1;
  readonly lockOwnerId: string;
}

export interface SeatDispatchReceiptStoreByReceiptInput extends SeatDispatchReceiptStoreScopeInput {
  readonly receiptId: string;
}

export interface SeatDispatchReceiptStoreByParentInput extends SeatDispatchReceiptStoreScopeInput {
  readonly parentMissionId: string;
  readonly parentSessionId: string;
}

export interface SeatDispatchReceiptStoreByChildInput extends SeatDispatchReceiptStoreScopeInput {
  readonly childTaskId: string;
  readonly childSessionId: string;
}

export interface SeatDispatchStorePaths {
  readonly repositoryRoot: string;
  readonly shieldDirectory: string;
  readonly logPath: string;
  readonly lockPath: string;
  readonly shieldDirectoryExists: boolean;
}

interface SeatDispatchStoreValidContractResult<T> {
  readonly state: "valid";
  readonly value: T;
  readonly code?: undefined;
  readonly errors?: undefined;
}

interface SeatDispatchStoreInvalidContractResult {
  readonly state: "invalid";
  readonly code: string;
  readonly errors: readonly string[];
  readonly value?: undefined;
}

export type SeatDispatchStoreContractResult<T> = SeatDispatchStoreValidContractResult<T> | SeatDispatchStoreInvalidContractResult;

interface SeatDispatchStoreLogResult {
  readonly entries: readonly SeatDispatchReceiptEventV1[];
  readonly projections: readonly SeatDispatchReceiptProjectionV1[];
  readonly bytes: string;
  readonly missing: boolean;
}

export interface SeatDispatchReceiptStoreAppendResult {
  readonly logPath: string;
  readonly byteLength: number;
  readonly receipt: SeatDispatchReceiptProjectionV1;
  readonly entries: readonly SeatDispatchReceiptEventV1[];
  readonly projections: readonly SeatDispatchReceiptProjectionV1[];
}

export interface SeatDispatchReceiptStoreByReceiptResult {
  readonly logPath: string;
  readonly receipt: SeatDispatchReceiptProjectionV1;
}

export interface SeatDispatchReceiptStoreBySessionResult {
  readonly logPath: string;
  readonly receipts: readonly SeatDispatchReceiptProjectionV1[];
}

interface SeatDispatchReceiptStoreValidationToken {
  readonly lockOwnerId: string;
  readonly marker: string;
  readonly path: string;
  readonly ino: number;
  readonly dev: number;
}

const valid = <T,>(value: T): SeatDispatchStoreContractResult<T> => ({ state: "valid", value });
const invalid = <T = never,>(code: string, ...message: readonly string[]): SeatDispatchStoreContractResult<T> =>
  ({ state: "invalid", code, errors: message.length > 0 ? message : ["invalid input."] }) as SeatDispatchStoreContractResult<T>;

function safeIsProxy(value: unknown): boolean {
  try {
    return isProxy(value);
  } catch {
    return true;
  }
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (safeIsProxy(value)) return false;
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function exactFields(value: unknown, expected: readonly string[]): string[] {
  if (!plainObject(value)) return ["input must be a strict plain object."];

  const errors: string[] = [];
  const expectedSet = new Set(expected);

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      errors.push(`invalid field: ${String(key)}.`);
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable || descriptor.value === undefined) {
      errors.push(`invalid field: ${key}.`);
      continue;
    }
    if (!expectedSet.has(key)) {
      errors.push(`invalid field: ${key}.`);
    }
  }

  for (const field of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable || descriptor.value === undefined) {
      errors.push(`missing field: ${field}.`);
    }
  }

  return errors;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function lockOwner(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && IDENTIFIER.test(value);
}

function validateScopeInput(input: unknown, context: string): SeatDispatchStoreContractResult<SeatDispatchReceiptStoreScopeInput> {
  const fieldErrors = exactFields(input, ["repositoryRoot", "repositoryId", "repositoryWorkspaceId"]);
  if (fieldErrors.length > 0) return invalid("malformed_input", `${context} input must include only repositoryRoot/repositoryId/repositoryWorkspaceId.`);

  const value = input as Record<string, unknown>;
  const repositoryRoot = value.repositoryRoot;
  const repositoryId = value.repositoryId;
  const repositoryWorkspaceId = value.repositoryWorkspaceId;

  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0 || !identifier(repositoryId) || !identifier(repositoryWorkspaceId)) {
    return invalid("malformed_input", `${context} input contains malformed repository identity.`);
  }

  return valid({
    repositoryRoot,
    repositoryId,
    repositoryWorkspaceId,
  });
}

function validateAppendInput(input: unknown): SeatDispatchStoreContractResult<SeatDispatchReceiptStoreAppendInput> {
  const fieldErrors = exactFields(input, ["repositoryRoot", "repositoryId", "repositoryWorkspaceId", "event", "lockOwnerId"]);
  if (fieldErrors.length > 0) {
    return invalid("malformed_input", "append input has invalid fields.");
  }
  const scope = validateScopeInput(
    {
      repositoryRoot: (input as Record<string, unknown>).repositoryRoot,
      repositoryId: (input as Record<string, unknown>).repositoryId,
      repositoryWorkspaceId: (input as Record<string, unknown>).repositoryWorkspaceId,
    },
    "append",
  );
  if (scope.state === "invalid") return scope;

  const value = input as Record<string, unknown>;
  if (!plainObject(value.event)) return invalid("malformed_input", "append input event must be a strict plain object.");
  if (!lockOwner(value.lockOwnerId)) return invalid("malformed_input", "append input has malformed lockOwnerId.");
  const event = value.event as unknown as SeatDispatchReceiptEventV1;

  return valid({
    ...scope.value,
    event,
    lockOwnerId: value.lockOwnerId,
  });
}

function validateByReceiptInput(input: unknown): SeatDispatchStoreContractResult<SeatDispatchReceiptStoreByReceiptInput> {
  const fieldErrors = exactFields(input, ["repositoryRoot", "repositoryId", "repositoryWorkspaceId", "receiptId"]);
  if (fieldErrors.length > 0) return invalid("malformed_input", "receipt query input has invalid fields.");

  const value = input as Record<string, unknown>;
  const scope = validateScopeInput({
    repositoryRoot: value.repositoryRoot,
    repositoryId: value.repositoryId,
    repositoryWorkspaceId: value.repositoryWorkspaceId,
  }, "receipt query");
  if (scope.state === "invalid") return scope;

  if (!identifier(value.receiptId)) return invalid("malformed_input", "receipt query input has malformed receiptId.");

  return valid({ ...scope.value, receiptId: value.receiptId });
}

function validateParentInput(input: unknown): SeatDispatchStoreContractResult<SeatDispatchReceiptStoreByParentInput> {
  const fieldErrors = exactFields(input, ["repositoryRoot", "repositoryId", "repositoryWorkspaceId", "parentMissionId", "parentSessionId"]);
  if (fieldErrors.length > 0) return invalid("malformed_input", "parent query input has invalid fields.");

  const value = input as Record<string, unknown>;
  const scope = validateScopeInput({
    repositoryRoot: value.repositoryRoot,
    repositoryId: value.repositoryId,
    repositoryWorkspaceId: value.repositoryWorkspaceId,
  }, "parent query");
  if (scope.state === "invalid") return scope;

  if (!identifier(value.parentMissionId) || !identifier(value.parentSessionId)) {
    return invalid("malformed_input", "parent query input has malformed identity fields.");
  }

  return valid({
    ...scope.value,
    parentMissionId: value.parentMissionId,
    parentSessionId: value.parentSessionId,
  });
}

function validateChildInput(input: unknown): SeatDispatchStoreContractResult<SeatDispatchReceiptStoreByChildInput> {
  const fieldErrors = exactFields(input, ["repositoryRoot", "repositoryId", "repositoryWorkspaceId", "childTaskId", "childSessionId"]);
  if (fieldErrors.length > 0) return invalid("malformed_input", "child query input has invalid fields.");

  const value = input as Record<string, unknown>;
  const scope = validateScopeInput({
    repositoryRoot: value.repositoryRoot,
    repositoryId: value.repositoryId,
    repositoryWorkspaceId: value.repositoryWorkspaceId,
  }, "child query");
  if (scope.state === "invalid") return scope;

  if (!identifier(value.childTaskId) || !identifier(value.childSessionId)) {
    return invalid("malformed_input", "child query input has malformed identity fields.");
  }

  return valid({
    ...scope.value,
    childTaskId: value.childTaskId,
    childSessionId: value.childSessionId,
  });
}

async function resolveStorePaths(
  scope: SeatDispatchReceiptStoreScopeInput,
  allowCreateShield: boolean,
): Promise<SeatDispatchStoreContractResult<SeatDispatchStorePaths>> {
  const resolvedInputRoot = resolve(scope.repositoryRoot);
  let repositoryRoot: string;
  try {
    repositoryRoot = await realpath(resolvedInputRoot);
  } catch (error) {
    return invalid("repository_unavailable", `Repository root is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }

  let repositoryRootStats;
  try {
    repositoryRootStats = await lstat(repositoryRoot);
  } catch (error) {
    return invalid("repository_unavailable", `Repository root is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
  if (!repositoryRootStats.isDirectory()) {
    return invalid("unsafe_path", "Repository root must be a directory.");
  }

  const shieldDirectory = resolve(repositoryRoot, ".shield");
  const shieldFromRoot = relative(repositoryRoot, shieldDirectory);
  if (shieldFromRoot === "" || shieldFromRoot === `..${sep}` || shieldFromRoot.startsWith(`..${sep}`)) {
    return invalid("unsafe_path", "Dispatch receipt shield directory escapes repository root.");
  }

  let shieldDirectoryExists = true;
  try {
    const shieldStats = await lstat(shieldDirectory);
    if (shieldStats.isSymbolicLink()) return invalid("unsafe_path", "Dispatch receipt shield directory must not be a symbolic link.");
    if (!shieldStats.isDirectory()) return invalid("unsafe_path", "Dispatch receipt shield path must be a directory.");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      if (code === "ELOOP") return invalid("unsafe_path", "Dispatch receipt shield path is unsafe.");
      return invalid("receipt_unavailable", `Dispatch receipt shield check failed: ${code ?? "unknown_error"}.`);
    }
    if (!allowCreateShield) {
      return valid({
        repositoryRoot,
        shieldDirectory,
        logPath: join(shieldDirectory, "dispatch-receipts.jsonl"),
        lockPath: join(shieldDirectory, "dispatch-receipts.jsonl.lock"),
        shieldDirectoryExists: false,
      });
    }
    try {
      await mkdir(shieldDirectory, { recursive: true });
    } catch (error) {
      return invalid("receipt_unavailable", `Dispatch receipt shield directory could not be created: ${
        (error as NodeJS.ErrnoException).code ?? "unknown_error"
      }.`);
    }
    shieldDirectoryExists = true;
  }

  let shieldPath;
  try {
    shieldPath = await realpath(shieldDirectory);
  } catch (error) {
    return invalid("unsafe_path", `Dispatch receipt shield directory is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }

  const shieldFromCanonicalRoot = relative(repositoryRoot, shieldPath);
  if (shieldFromCanonicalRoot === "" || shieldFromCanonicalRoot === `..${sep}` || shieldFromCanonicalRoot.startsWith(`..${sep}`)) {
    return invalid("unsafe_path", "Dispatch receipt shield directory escapes canonical repository root.");
  }

  return valid({
    repositoryRoot,
    shieldDirectory: shieldPath,
    logPath: join(shieldPath, "dispatch-receipts.jsonl"),
    lockPath: join(shieldPath, "dispatch-receipts.jsonl.lock"),
    shieldDirectoryExists,
  });
}

function parseReceiptLog(
  text: string,
  repositoryId: string,
  workspaceId: string,
): SeatDispatchStoreContractResult<SeatDispatchStoreLogResult> {
  if (text === "") {
    return valid({
      entries: Object.freeze([]),
      projections: Object.freeze([]),
      bytes: "",
      missing: true,
    });
  }

  if (!text.endsWith("\n")) {
    return invalid("recovery_required", "Dispatch receipt log has an incomplete final line.");
  }

  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 0) {
    return valid({
      entries: Object.freeze([]),
      projections: Object.freeze([]),
      bytes: text,
      missing: true,
    });
  }

  const raw: unknown[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length === 0) {
      return invalid("recovery_required", `Dispatch receipt log line ${index + 1} is empty.`);
    }
    const strictParse = validateStrictJsonLine(line);
    if (strictParse.state === "invalid") {
      return invalid(strictParse.code, ...strictParse.errors);
    }
    try {
      raw.push(JSON.parse(line));
    } catch {
      return invalid("recovery_required", `Dispatch receipt log line ${index + 1} is malformed JSON.`);
    }
  }

  const replay = replaySeatDispatchReceiptsV1(raw);
  if (replay.state === "invalid") {
    return invalid(replay.code, ...replay.reasonCodes);
  }
  if (replay.entries.length !== lines.length) {
    return invalid("recovery_required", "Dispatch receipt log candidate length changed after replay.");
  }
  for (let index = 0; index < replay.entries.length; index += 1) {
    if (JSON.stringify(replay.entries[index]) !== lines[index]) {
      return invalid("recovery_required", `Dispatch receipt log line ${index + 1} is non-canonical.`);
    }
  }

  const mismatched = replay.projections.some((projection) =>
    projection.repositoryId !== repositoryId || projection.repositoryWorkspaceId !== workspaceId,
  );
  if (mismatched) {
    return invalid("mixed_scope", "Dispatch receipt log contains mixed repository/workspace scope.");
  }

  return valid({
    entries: replay.entries,
    projections: replay.projections,
    bytes: text,
    missing: false,
  });
}

async function readStoreLog(
  scope: SeatDispatchReceiptStoreScopeInput,
  options: { readonly allowMissing: boolean },
): Promise<SeatDispatchStoreContractResult<SeatDispatchStoreLogResult & { logPath: string }>> {
  const paths = await resolveStorePaths(scope, false);
  if (paths.state === "invalid") return paths;

  if (!paths.value.shieldDirectoryExists) {
    if (options.allowMissing) {
      return valid({
        logPath: paths.value.logPath,
        entries: Object.freeze([]),
        projections: Object.freeze([]),
        bytes: "",
        missing: true,
      });
    }
    return invalid("dispatch_receipt_missing", "Dispatch receipt store does not exist.");
  }

  let handle;
  let bytes = "";
  try {
    handle = await open(paths.value.logPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    if (!stats.isFile()) {
      return invalid("unsafe_path", "Dispatch receipt log must be a regular file.");
    }
    bytes = await handle.readFile("utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      if (options.allowMissing) {
        return valid({
          logPath: paths.value.logPath,
          entries: Object.freeze([]),
          projections: Object.freeze([]),
          bytes: "",
          missing: true,
        });
      }
      return invalid("dispatch_receipt_missing", `Dispatch receipt log is missing: ${paths.value.logPath}.`);
    }
    return invalid(code === "ELOOP" ? "unsafe_path" : "receipt_unavailable", `Dispatch receipt read failed: ${code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }

  const parsed = parseReceiptLog(bytes, scope.repositoryId, scope.repositoryWorkspaceId);
  if (parsed.state === "invalid") return parsed;

  return valid({
    logPath: paths.value.logPath,
    entries: parsed.value.entries,
    projections: parsed.value.projections,
    bytes: parsed.value.bytes,
    missing: bytes.length === 0,
  });
}

function validateStrictJsonLine(line: string): SeatDispatchStoreContractResult<undefined> {
  try {
    validateStrictJson(line);
  } catch (error) {
    return invalid("recovery_required", `Dispatch receipt log line must be strict JSON. ${String(error instanceof Error ? error.message : error)}`);
  }
  return valid(undefined);
}

function validateStrictJson(input: string): void {
  let index = 0;
  const length = input.length;

  function skipWhitespace(): void {
    while (index < length) {
      const ch = input.charCodeAt(index);
      if (ch !== 0x20 && ch !== 0x09 && ch !== 0x0a && ch !== 0x0d) break;
      index += 1;
    }
  }

  function parseValue(): void {
    skipWhitespace();
    if (index >= length) throw new Error("empty JSON value");
    const ch = input[index];
    if (ch === "{") {
      parseObject();
      return;
    }
    if (ch === "[") {
      parseArray();
      return;
    }
    if (ch === "\"") {
      parseString();
      return;
    }
    if (ch === "t" && input.slice(index, index + 4) === "true") {
      index += 4;
      return;
    }
    if (ch === "f" && input.slice(index, index + 5) === "false") {
      index += 5;
      return;
    }
    if (ch === "n" && input.slice(index, index + 4) === "null") {
      index += 4;
      return;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      parseNumber();
      return;
    }
    throw new Error("malformed JSON token");
  }

  function parseObject(): void {
    index += 1;
    skipWhitespace();
    if (index < length && input[index] === "}") {
      index += 1;
      return;
    }
    const seen = new Set<string>();
    while (index < length) {
      skipWhitespace();
      if (input[index] !== "\"") throw new Error("object key must be quoted");
      const key = parseStringValue();
      if (seen.has(key)) throw new Error("json duplicate key");
      seen.add(key);
      skipWhitespace();
      if (input[index] !== ":") throw new Error("object missing colon");
      index += 1;
      parseValue();
      skipWhitespace();
      if (input[index] === ",") {
        index += 1;
        continue;
      }
      if (input[index] === "}") {
        index += 1;
        return;
      }
      throw new Error("object delimiter missing");
    }
    throw new Error("unterminated object");
  }

  function parseArray(): void {
    index += 1;
    skipWhitespace();
    if (index < length && input[index] === "]") {
      index += 1;
      return;
    }
    while (index < length) {
      parseValue();
      skipWhitespace();
      if (input[index] === ",") {
        index += 1;
        continue;
      }
      if (input[index] === "]") {
        index += 1;
        return;
      }
      throw new Error("array delimiter missing");
    }
    throw new Error("unterminated array");
  }

  function parseStringValue(): string {
    return parseString();
  }

  function parseString(): string {
    if (input[index] !== "\"") throw new Error("JSON string must start with quote.");
    const start = index;
    index += 1;
    let escape = false;
    while (index < length) {
      const ch = input[index];
      if (escape) {
        escape = false;
        index += 1;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        index += 1;
        continue;
      }
      if (ch === "\"") {
        index += 1;
        try {
          return JSON.parse(input.slice(start, index));
        } catch {
          throw new Error("malformed JSON string");
        }
      }
      if (ch === "\n" || ch === "\r") throw new Error("JSON string contains newline");
      index += 1;
    }
    throw new Error("unterminated JSON string");
  }

  function parseNumber(): void {
    if (input[index] === "-") index += 1;
    if (index >= length || !isDecimalDigit(input[index])) throw new Error("invalid number");
    if (input[index] === "0") {
      index += 1;
      if (isDecimalDigit(input[index])) throw new Error("leading zero in number");
    } else {
      while (isDecimalDigit(input[index])) {
        index += 1;
      }
    }
    if (input[index] === ".") {
      index += 1;
      if (!isDecimalDigit(input[index])) throw new Error("invalid fraction");
      while (isDecimalDigit(input[index])) {
        index += 1;
      }
    }
    if (input[index] === "e" || input[index] === "E") {
      index += 1;
      if (input[index] === "+" || input[index] === "-") index += 1;
      if (!isDecimalDigit(input[index])) throw new Error("invalid exponent");
      while (isDecimalDigit(input[index])) {
        index += 1;
      }
    }
  }

  function isDecimalDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= "0" && ch <= "9";
  }

  parseValue();
  skipWhitespace();
  if (index !== length) throw new Error("trailing content");
}

function releaseLockHandle(path: string, token: { ino: number; dev: number }): Promise<boolean> {
  return lstat(path).then((stats) => {
    if (stats.isSymbolicLink() || !stats.isFile()) return false;
    return Number(stats.ino) === token.ino && Number(stats.dev) === token.dev;
  }).catch(() => false);
}

function lineByteLength(line: string): number {
  return Buffer.byteLength(line, "utf8");
}

async function acquireLock(
  paths: SeatDispatchStorePaths,
  lockOwnerId: string,
): Promise<SeatDispatchStoreContractResult<SeatDispatchReceiptStoreValidationToken>> {
  try {
  const existing = await lstat(paths.lockPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      return invalid("unsafe_path", "Dispatch receipt lock must be a regular file.");
    }
    return invalid("dispatch_receipt_lock_held", "Dispatch receipt lock is held.");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      if (code === "ELOOP") return invalid("unsafe_path", "Dispatch receipt lock path is unsafe.");
      return invalid("receipt_unavailable", `Dispatch receipt lock check failed: ${code ?? "unknown_error"}.`);
    }
  }

  let handle;
  try {
    handle = await open(paths.lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const stats = await handle.stat();
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return invalid("unsafe_path", "Dispatch receipt lock must be a regular file.");
    }

    const marker = `${LOCK_PREFIX}${lockOwnerId}`;
    const markerBytes = Buffer.byteLength(marker, "utf8");
    const written = await handle.write(marker, null, "utf8");
    if (written.bytesWritten !== markerBytes) {
      return invalid("recovery_required", "Dispatch receipt lock write was incomplete.");
    }
    await handle.sync();

    return valid({
      lockOwnerId,
      marker,
      path: paths.lockPath,
      ino: Number(stats.ino),
      dev: Number(stats.dev),
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return invalid("dispatch_receipt_lock_held", "Dispatch receipt lock is held.");
    if (code === "ELOOP") return invalid("unsafe_path", "Dispatch receipt lock must not be symbolic.");
    return invalid("receipt_unavailable", `Dispatch receipt lock acquisition failed: ${code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function releaseLock(token: SeatDispatchReceiptStoreValidationToken): Promise<void> {
  let handle;
  try {
    handle = await open(token.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    if (Number(stats.ino) !== token.ino || Number(stats.dev) !== token.dev) {
      return;
    }
    const marker = await handle.readFile("utf8");
    if (marker !== token.marker) {
      return;
    }
    const sameTarget = await releaseLockHandle(token.path, token);
    if (!sameTarget) {
      return;
    }
    await unlink(token.path);
  } catch {
    return;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function syncDirectory(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
    await handle.sync();
    return true;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function appendSeatDispatchReceiptEntryV1(
  input: unknown,
): Promise<SeatDispatchStoreContractResult<SeatDispatchReceiptStoreAppendResult>> {
  const checked = validateAppendInput(input);
  if (checked.state === "invalid") return checked;

  const paths = await resolveStorePaths(checked.value, true);
  if (paths.state === "invalid") return paths;

  const token = await acquireLock(paths.value, checked.value.lockOwnerId);
  if (token.state === "invalid") return token;

  try {
    const current = await readStoreLog(checked.value, { allowMissing: true });
    if (current.state === "invalid") return current;
    if (checked.value.event.repositoryId !== checked.value.repositoryId || checked.value.event.repositoryWorkspaceId !== checked.value.repositoryWorkspaceId) {
      return invalid("mixed_scope", "Dispatch receipt candidate scope does not match repository binding.");
    }

    const candidateEntries: SeatDispatchReceiptEventV1[] = [...current.value.entries, checked.value.event];
    const candidateReplay = replaySeatDispatchReceiptsV1(candidateEntries);
    if (candidateReplay.state === "invalid") {
      return invalid(candidateReplay.code, ...candidateReplay.reasonCodes);
    }

    for (const projection of candidateReplay.projections) {
      if (projection.repositoryId !== checked.value.repositoryId || projection.repositoryWorkspaceId !== checked.value.repositoryWorkspaceId) {
        return invalid("mixed_scope", "Dispatch receipt candidate scope is mixed.");
      }
    }

    const candidateEntry = candidateReplay.entries[candidateReplay.entries.length - 1];
    const line = `${JSON.stringify(candidateEntry)}\n`;
    const lineBytes = lineByteLength(line);

    let logHandle;
    try {
      logHandle = await open(paths.value.logPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o644);
      const logStats = await logHandle.stat();
      if (!logStats.isFile()) {
        return invalid("unsafe_path", "Dispatch receipt log must be a regular file.");
      }
      const written = await logHandle.write(line, null, "utf8");
      if (written.bytesWritten !== lineBytes) {
        return invalid("recovery_required", "Dispatch receipt append write was incomplete.");
      }
      await logHandle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ELOOP") return invalid("unsafe_path", "Dispatch receipt log must not be symbolic.");
      return invalid(code === "ENOTDIR" ? "unsafe_path" : "recovery_required", `Dispatch receipt append failed: ${code ?? "unknown_error"}.`);
    } finally {
      await logHandle?.close().catch(() => undefined);
    }

    if (current.value.missing) {
      const directorySynced = await syncDirectory(dirname(paths.value.logPath));
      if (!directorySynced) {
        return invalid("recovery_required", "Dispatch receipt parent directory sync failed.");
      }
    }

    const after = await readStoreLog(checked.value, { allowMissing: false });
    if (after.state === "invalid") {
      return invalid("recovery_required", ...(after.errors.length > 0 ? after.errors : ["dispatch receipt replay failed."]));
    }
    const expected = `${current.value.bytes}${line}`;
    if (after.value.bytes !== expected) {
      return invalid("recovery_required", "Dispatch receipt append readback is not exact.");
    }

    const appendedReceipt = after.value.projections.find((projection) =>
      projection.receiptId === checked.value.event.receiptId && projection.dispatchId === checked.value.event.dispatchId,
    );
    if (appendedReceipt === undefined) {
      return invalid("recovery_required", "Dispatch receipt append replay did not include appended projection.");
    }

    return valid({
      logPath: paths.value.logPath,
      byteLength: Buffer.byteLength(after.value.bytes, "utf8"),
      receipt: Object.freeze({ ...appendedReceipt }),
      entries: after.value.entries,
      projections: after.value.projections,
    });
  } finally {
    await releaseLock(token.value);
  }
}

export async function readSeatDispatchReceiptByReceiptIdV1(
  input: unknown,
): Promise<SeatDispatchStoreContractResult<SeatDispatchReceiptStoreByReceiptResult>> {
  const checked = validateByReceiptInput(input);
  if (checked.state === "invalid") return checked;

  const data = await readStoreLog(checked.value, { allowMissing: false });
  if (data.state === "invalid") return data;

  const receipts = data.value.projections.filter((projection) => projection.receiptId === checked.value.receiptId);
  if (receipts.length === 0) {
    return invalid("receipt_not_found", "No receipt found for the specified id.");
  }
  if (receipts.length > 1) {
    return invalid("conflicting_receipt", "Duplicate receipt IDs are present in store.");
  }

  return valid({
    logPath: data.value.logPath,
    receipt: Object.freeze({ ...receipts[0] }),
  });
}

export async function readSeatDispatchReceiptsByParentMissionSessionV1(
  input: unknown,
): Promise<SeatDispatchStoreContractResult<SeatDispatchReceiptStoreBySessionResult>> {
  const checked = validateParentInput(input);
  if (checked.state === "invalid") return checked;

  const data = await readStoreLog(checked.value, { allowMissing: false });
  if (data.state === "invalid") return data;

  return valid({
    logPath: data.value.logPath,
    receipts: data.value.projections.filter((projection) =>
      projection.parentMissionId === checked.value.parentMissionId
      && projection.parentSessionId === checked.value.parentSessionId,
    ),
  });
}

export async function readSeatDispatchReceiptsByChildTaskSessionV1(
  input: unknown,
): Promise<SeatDispatchStoreContractResult<SeatDispatchReceiptStoreBySessionResult>> {
  const checked = validateChildInput(input);
  if (checked.state === "invalid") return checked;

  const data = await readStoreLog(checked.value, { allowMissing: false });
  if (data.state === "invalid") return data;

  return valid({
    logPath: data.value.logPath,
    receipts: data.value.projections.filter((projection) =>
      projection.childTaskId === checked.value.childTaskId
      && projection.childSessionId === checked.value.childSessionId,
    ),
  });
}
