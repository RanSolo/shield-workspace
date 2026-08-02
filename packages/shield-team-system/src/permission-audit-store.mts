import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { validatePermissionAuditRecord, validatePermissionAuditReceipt, type PermissionAuditRecord, type PermissionAuditReceipt } from "./permission-audit-v1.mjs";
import { canonicalJson } from "./mission-v2.mjs";
import { replayPermissionAuditLedger } from "./permission-audit-v1.mjs";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const LOCK_OWNER = /^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._:/@#-]*$/;
const LOCK_PREFIX = "permission-audit:";
const PERMISSION_AUDIT_DIRECTORY = "permission-audit";
const LOCK_SUFFIX = ".jsonl.lock";

interface PermissionAuditStoreValidContractResult<T> {
  readonly state: "valid";
  readonly value: T;
  readonly code?: undefined;
  readonly errors?: undefined;
}

interface PermissionAuditStoreInvalidContractResult {
  readonly state: "invalid";
  readonly code: string;
  readonly errors: readonly string[];
  readonly value?: undefined;
}

export type PermissionAuditStoreContractResult<T> = PermissionAuditStoreValidContractResult<T> | PermissionAuditStoreInvalidContractResult;

export interface PermissionAuditFilesystemStoreScopeInput {
  readonly repositoryRoot: string;
  readonly ledgerId: string;
  readonly lockOwnerId: string;
}

export interface PermissionAuditFilesystemLedgerPaths {
  readonly repositoryRoot: string;
  readonly shieldDirectory: string;
  readonly auditDirectory: string;
  readonly ledgerPath: string;
  readonly lockPath: string;
  readonly repositoryRootExists: boolean;
  readonly shieldDirectoryExists: boolean;
  readonly auditDirectoryExists: boolean;
}

export interface PermissionAuditFilesystemLedgerReadResult {
  readonly ledgerPath: string;
  readonly entries: readonly PermissionAuditRecord[];
  readonly bytes: string;
  readonly missing: boolean;
}

export interface PermissionAuditFilesystemLedgerAppendResult {
  readonly ledgerPath: string;
  readonly byteLength: number;
  readonly bytes: string;
  readonly records: readonly PermissionAuditRecord[];
  readonly receipt: PermissionAuditReceipt;
}

export interface PermissionAuditStoreReadInput extends PermissionAuditFilesystemStoreScopeInput {
}

export interface PermissionAuditStoreAppendInput extends PermissionAuditFilesystemStoreScopeInput {
  readonly record: PermissionAuditRecord;
}

export interface PermissionAuditFilesystemStore {
  readonly ledgerId: string;
  read(): Promise<unknown>;
  appendIfAbsent(record: PermissionAuditRecord): Promise<unknown>;
}

const valid = <T,>(value: T): PermissionAuditStoreContractResult<T> => ({ state: "valid", value });
const invalid = <T = never,>(code: string, ...errors: string[]): PermissionAuditStoreContractResult<T> =>
  ({ state: "invalid", code, errors: errors.length > 0 ? errors : ["invalid input."] });

function safePlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function exactFields(value: unknown, fields: readonly string[], label: string): string[] {
  if (!safePlainObject(value)) return [`${label} must be a strict plain object.`];

  const expected = new Set(fields);
  const errors: string[] = [];

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      errors.push(`invalid field: ${String(key)}.`);
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!expected.has(key)) {
      errors.push(`invalid field: ${key}.`);
      continue;
    }
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
      errors.push(`invalid field: ${key}.`);
    }
  }

  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
      errors.push(`missing field: ${field}.`);
    }
  }
  return errors;
}

function validateScopeInput(input: unknown, context: string): PermissionAuditStoreContractResult<PermissionAuditFilesystemStoreScopeInput> {
  const fieldErrors = exactFields(input, ["repositoryRoot", "ledgerId", "lockOwnerId"], context);
  if (fieldErrors.length > 0) return invalid("malformed_input", `${context} has invalid fields.`);

  const value = input as Record<string, unknown>;
  if (typeof value.repositoryRoot !== "string" || value.repositoryRoot.length === 0) {
    return invalid("malformed_input", `${context} repositoryRoot is malformed.`);
  }
  if (!value.ledgerId || typeof value.ledgerId !== "string" || !IDENTIFIER.test(value.ledgerId)) {
    return invalid("malformed_input", `${context} ledgerId is malformed.`);
  }
  if (typeof value.lockOwnerId !== "string" || !LOCK_OWNER.test(value.lockOwnerId)) {
    return invalid("malformed_input", `${context} lockOwnerId is malformed.`);
  }

  return valid({ repositoryRoot: value.repositoryRoot, ledgerId: value.ledgerId, lockOwnerId: value.lockOwnerId });
}

function validateReadInput(input: unknown): PermissionAuditStoreContractResult<PermissionAuditStoreReadInput> {
  return validateScopeInput(input, "read input");
}

function validateAppendInput(input: unknown): PermissionAuditStoreContractResult<PermissionAuditStoreAppendInput> {
  const fieldErrors = exactFields(input, ["repositoryRoot", "ledgerId", "lockOwnerId", "record"], "append input");
  if (fieldErrors.length > 0) return invalid("malformed_input", "append input has invalid fields.");

  const inputRecord = input as Record<string, unknown>;
  const scopeInput = validateScopeInput(
    { repositoryRoot: inputRecord.repositoryRoot, ledgerId: inputRecord.ledgerId, lockOwnerId: inputRecord.lockOwnerId },
    "append input",
  );
  if (scopeInput.state === "invalid") return scopeInput;

  if (!safePlainObject((input as Record<string, unknown>).record)) {
    return invalid("malformed_input", "append input record must be a strict plain object.");
  }

  const checked = validatePermissionAuditRecord((input as Record<string, unknown>).record);
  if (checked.state === "invalid") return invalid("malformed_input", ...checked.errors);
  if (checked.value.ledgerId !== scopeInput.value.ledgerId) return invalid("malformed_input", "append input record ledgerId must match configured ledgerId.");

  return valid({ ...scopeInput.value, record: checked.value });
}

function permissionAuditFilename(ledgerId: string): string {
  return `${createHash("sha256").update(ledgerId, "utf8").digest("base64url")}.jsonl`;
}

async function resolveStorePaths(
  scope: PermissionAuditFilesystemStoreScopeInput,
  allowCreate: boolean,
): Promise<PermissionAuditStoreContractResult<PermissionAuditFilesystemLedgerPaths>> {
  const resolvedInputRoot = resolve(scope.repositoryRoot);
  let repositoryRootInputStats;
  try {
    repositoryRootInputStats = await lstat(resolvedInputRoot);
  } catch (error) {
    return invalid("permission_audit_unavailable", `Permission audit repository root is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
  if (repositoryRootInputStats.isSymbolicLink() || !repositoryRootInputStats.isDirectory()) {
    return invalid("unsafe_path", "Permission audit repository root is unsafe.");
  }

  let repositoryRoot: string;

  try {
    repositoryRoot = await realpath(resolvedInputRoot);
  } catch (error) {
    return invalid("permission_audit_unavailable", `Permission audit repository root is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }

  const shieldDirectory = resolve(repositoryRoot, ".shield");
  const shieldFromRoot = relative(repositoryRoot, shieldDirectory);
  if (shieldFromRoot === "" || shieldFromRoot === `..${sep}` || shieldFromRoot.startsWith(`..${sep}`)) {
    return invalid("unsafe_path", "Permission audit shield directory escapes repository root.");
  }

  let shieldDirectoryExists = true;
  let shieldDirectoryCreated = false;

  try {
    const shieldStats = await lstat(shieldDirectory);
    if (shieldStats.isSymbolicLink() || !shieldStats.isDirectory()) {
      return invalid("unsafe_path", "Permission audit shield path is not a directory.");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      if (code === "ELOOP") return invalid("unsafe_path", "Permission audit shield path is unsafe.");
      return invalid("permission_audit_unavailable", `Permission audit shield check failed: ${code ?? "unknown_error"}.`);
    }
    if (!allowCreate) {
      return valid({
        repositoryRoot,
        shieldDirectory,
        auditDirectory: resolve(shieldDirectory, PERMISSION_AUDIT_DIRECTORY),
        ledgerPath: join(shieldDirectory, PERMISSION_AUDIT_DIRECTORY, permissionAuditFilename(scope.ledgerId)),
        lockPath: join(shieldDirectory, PERMISSION_AUDIT_DIRECTORY, `${permissionAuditFilename(scope.ledgerId)}${LOCK_SUFFIX}`),
        repositoryRootExists: true,
        shieldDirectoryExists: false,
        auditDirectoryExists: false,
      });
    }
  try {
    await mkdir(shieldDirectory, { recursive: true });
    shieldDirectoryCreated = true;
    try {
      const shieldCreatedStats = await lstat(shieldDirectory);
      if (shieldCreatedStats.isSymbolicLink() || !shieldCreatedStats.isDirectory()) {
        return invalid("recovery_required", "Permission audit shield path is not a directory.");
      }
    } catch (error) {
      return invalid("recovery_required", `Permission audit shield path could not be validated after creation: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
    }
  } catch (error) {
    return invalid(
      "permission_audit_unavailable",
      `Permission audit shield directory could not be created: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`,
    );
    }
    if (!await syncDirectory(repositoryRoot)) return invalid("recovery_required", "Permission audit shield directory sync failed.");
    shieldDirectoryExists = true;
  }

  let shieldPath: string;
  try {
    shieldPath = await realpath(shieldDirectory);
  } catch (error) {
    return invalid(shieldDirectoryCreated ? "recovery_required" : "unsafe_path", `Permission audit shield path is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }

  if (relative(repositoryRoot, shieldPath) === "" ||
      relative(repositoryRoot, shieldPath) === `..${sep}` ||
      relative(repositoryRoot, shieldPath).startsWith(`..${sep}`)) {
    return invalid("unsafe_path", "Permission audit shield path escapes repository root.");
  }

  const auditDirectory = resolve(shieldPath, PERMISSION_AUDIT_DIRECTORY);
  let auditDirectoryExists = true;
  let auditDirectoryCreated = false;

  try {
    const auditStats = await lstat(auditDirectory);
    if (auditStats.isSymbolicLink() || !auditStats.isDirectory()) {
      return invalid("unsafe_path", "Permission audit directory is not a directory.");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      if (code === "ELOOP") return invalid("unsafe_path", "Permission audit directory is unsafe.");
      return invalid(shieldDirectoryCreated ? "recovery_required" : "permission_audit_unavailable", `Permission audit directory check failed: ${code ?? "unknown_error"}.`);
    }
    if (!allowCreate) {
      auditDirectoryExists = false;
    } else {
      try {
        await mkdir(auditDirectory, { recursive: true });
        auditDirectoryCreated = true;
        try {
          const auditCreatedStats = await lstat(auditDirectory);
          if (auditCreatedStats.isSymbolicLink() || !auditCreatedStats.isDirectory()) {
            return invalid("recovery_required", "Permission audit directory is not a directory.");
          }
        } catch (error) {
          return invalid("recovery_required", `Permission audit directory could not be validated after creation: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
        }
      } catch (error) {
        return invalid(
          shieldDirectoryCreated ? "recovery_required" : "permission_audit_unavailable",
          `Permission audit directory could not be created: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`,
        );
      }
      auditDirectoryExists = true;
    }
  }

  let auditPath: string;
  try {
    auditPath = await realpath(auditDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return invalid(shieldDirectoryCreated ? "recovery_required" : "unsafe_path", `Permission audit directory is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
    }
    if (!allowCreate) {
      auditPath = auditDirectory;
    } else {
      return invalid(auditDirectoryCreated ? "recovery_required" : "permission_audit_unavailable", "Permission audit directory is unavailable after creation.");
    }
  }

  const auditFromRoot = relative(repositoryRoot, auditPath);
  if (auditFromRoot === "" || auditFromRoot === `..${sep}` || auditFromRoot.startsWith(`..${sep}`)) {
    return invalid("unsafe_path", "Permission audit directory escapes repository root.");
  }

  if (auditDirectoryCreated && !await syncDirectory(shieldPath)) {
    return invalid("recovery_required", "Permission audit directory sync failed.");
  }

  const filename = permissionAuditFilename(scope.ledgerId);
  const ledgerPath = join(auditPath, filename);
  const lockPath = `${ledgerPath}.lock`;

  return valid({
    repositoryRoot,
    shieldDirectory: shieldPath,
    auditDirectory: auditPath,
    ledgerPath,
    lockPath,
    repositoryRootExists: true,
    shieldDirectoryExists,
    auditDirectoryExists,
  });
}

function lineMustMatchCanonical(line: string, record: PermissionAuditRecord): PermissionAuditStoreContractResult<void> {
  const canonical = canonicalJson(record);
  if (canonical !== line) {
    return invalid("permission_audit_replay_invalid", `Permission audit log line is non-canonical: ${line}.`);
  }
  return valid(undefined);
}

function parsePermissionAuditLines(
  text: string,
  ledgerId: string,
): PermissionAuditStoreContractResult<ReadonlyArray<PermissionAuditRecord>> {
  if (text === "") return valid([]);
  if (!text.endsWith("\n")) return invalid("permission_audit_replay_invalid", "Permission audit ledger has an incomplete final line.");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 0) return valid([]);

  const raw: PermissionAuditRecord[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length === 0) return invalid("permission_audit_replay_invalid", `Permission audit log line ${index + 1} is empty.`);

    const strict = validateStrictJsonLine(line);
    if (strict.state === "invalid") return strict;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      return invalid(
        "permission_audit_replay_invalid",
        `Permission audit log line ${index + 1} is malformed JSON.`,
      );
    }

    const checked = validatePermissionAuditRecord(parsed);
    if (checked.state === "invalid") {
      return invalid("permission_audit_replay_invalid", ...checked.errors);
    }
    const canonicalCheck = lineMustMatchCanonical(line, checked.value);
    if (canonicalCheck.state === "invalid") return canonicalCheck;
    if (checked.value.ledgerId !== ledgerId) return invalid("permission_audit_replay_invalid", `Permission audit log line ${index + 1} has a foreign ledgerId.`);
    raw.push(checked.value);
  }

  const replayed = replayPermissionAuditLedger(raw);
  if (replayed.state === "invalid") return invalid("permission_audit_replay_invalid", ...replayed.errors);
  if (replayed.value.length !== lines.length) {
    return invalid("permission_audit_replay_invalid", "Permission audit replay changed record count.");
  }
  for (let index = 0; index < replayed.value.length; index += 1) {
    if (canonicalJson(replayed.value[index]) !== lines[index]) return invalid(
      "permission_audit_replay_invalid",
      `Permission audit log line ${index + 1} is non-canonical.`,
    );
  }
  return valid(replayed.value);
}

export async function readPermissionAuditLedgerV1(
  input: unknown,
): Promise<PermissionAuditStoreContractResult<PermissionAuditFilesystemLedgerReadResult>> {
  const checked = validateReadInput(input);
  if (checked.state === "invalid") return checked;

  const paths = await resolveStorePaths(checked.value, false);
  if (paths.state === "invalid") return paths;

  if (!paths.value.shieldDirectoryExists || !paths.value.auditDirectoryExists) {
    return valid({
      ledgerPath: paths.value.ledgerPath,
      entries: [],
      bytes: "",
      missing: true,
    });
  }

  let handle;
  let bytes = "";
  try {
    handle = await open(paths.value.ledgerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    if (!stats.isFile()) return invalid("unsafe_path", "Permission audit ledger must be a regular file.");
    bytes = await handle.readFile("utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return valid({
        ledgerPath: paths.value.ledgerPath,
        entries: [],
        bytes: "",
        missing: true,
      });
    }
    return invalid(
      code === "ELOOP" ? "unsafe_path" : "permission_audit_unavailable",
      `Permission audit ledger read failed: ${code ?? "unknown_error"}.`,
    );
  } finally {
    await handle?.close().catch(() => undefined);
  }

  const parsed = parsePermissionAuditLines(bytes, checked.value.ledgerId);
  if (parsed.state === "invalid") return parsed;

  return valid({
    ledgerPath: paths.value.ledgerPath,
    entries: parsed.value,
    bytes,
    missing: false,
  });
}

function reconstructReceipt(record: PermissionAuditRecord, sequence: number): PermissionAuditStoreContractResult<PermissionAuditReceipt> {
  const candidate: PermissionAuditReceipt = {
    schemaVersion: 1 as const,
    ledgerId: record.ledgerId,
    recordId: record.recordId,
    decisionId: record.decisionId,
    digest: record.digest,
    appended: true,
    ledgerSequence: sequence,
  };
  const checked = validatePermissionAuditReceipt(candidate, record);
  if (checked.state === "invalid") return invalid("permission_audit_replay_invalid", "Permission audit receipt reconstruction failed.");
  return valid(candidate);
}

export async function appendPermissionAuditRecordIfAbsentV1(
  input: unknown,
): Promise<PermissionAuditStoreContractResult<PermissionAuditFilesystemLedgerAppendResult>> {
  const checked = validateAppendInput(input);
  if (checked.state === "invalid") return checked;

  const paths = await resolveStorePaths(checked.value, true);
  if (paths.state === "invalid") return paths;

  const token = await acquireLock(paths.value, checked.value.lockOwnerId);
  if (token.state === "invalid") return token;

  const runAppendOperation = async (): Promise<PermissionAuditStoreContractResult<PermissionAuditFilesystemLedgerAppendResult>> => {
    const current = await readPermissionAuditLedgerV1({
      repositoryRoot: checked.value.repositoryRoot,
      ledgerId: checked.value.ledgerId,
      lockOwnerId: checked.value.lockOwnerId,
    });
    if (current.state === "invalid") {
      return invalid("permission_audit_replay_invalid", ...current.errors);
    }

    const existingIndex = current.value.entries.findIndex((entry) => entry.recordId === checked.value.record.recordId);
    if (existingIndex >= 0) {
      const existing = current.value.entries[existingIndex];
      if (canonicalJson(existing) === canonicalJson(checked.value.record)) {
        const idempotentReceipt = reconstructReceipt(existing, existingIndex);
        if (idempotentReceipt.state === "invalid") {
          return invalid("recovery_required", ...idempotentReceipt.errors);
        }
        return valid({
          ledgerPath: paths.value.ledgerPath,
          byteLength: Buffer.byteLength(current.value.bytes, "utf8"),
          bytes: current.value.bytes,
          records: current.value.entries,
          receipt: idempotentReceipt.value,
        });
      }
      return invalid("permission_audit_id_conflict", `Permission audit record ${checked.value.record.recordId} is already present with different payload.`);
    }

    const candidate = [...current.value.entries, checked.value.record];
    const replayed = replayPermissionAuditLedger(candidate);
    if (replayed.state === "invalid") {
      return invalid("permission_audit_replay_invalid", ...replayed.errors);
    }
    const line = `${canonicalJson(replayed.value[replayed.value.length - 1])}\n`;
    const lineBytes = Buffer.byteLength(line, "utf8");

    let logHandle;
    try {
      logHandle = await open(paths.value.ledgerPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o644);
      const logStats = await logHandle.stat();
      if (!logStats.isFile()) {
        return invalid("unsafe_path", "Permission audit ledger must be a regular file.");
      }
      const written = (await logHandle.write(line, null, "utf8")).bytesWritten;
      if (written !== lineBytes) {
        return invalid("recovery_required", "Permission audit append write was incomplete.");
      }
      await logHandle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return invalid(
        code === "ELOOP" || code === "ENOTDIR" ? "unsafe_path" : "recovery_required",
        code === "ELOOP" || code === "ENOTDIR" ? "Permission audit ledger path is unsafe." : `Permission audit append failed: ${code ?? "unknown_error"}.`,
      );
    } finally {
      await logHandle?.close().catch(() => undefined);
    }

    if (current.value.missing) {
      const directorySynced = await syncDirectory(dirname(paths.value.ledgerPath));
      if (!directorySynced) return invalid("recovery_required", "Permission audit ledger parent directory sync failed.");
    }

    const after = await readPermissionAuditLedgerV1({
      repositoryRoot: checked.value.repositoryRoot,
      ledgerId: checked.value.ledgerId,
      lockOwnerId: checked.value.lockOwnerId,
    });
    if (after.state === "invalid") {
      return invalid("recovery_required", ...after.errors);
    }
    const expected = `${current.value.bytes}${line}`;
    const afterBytes = after.value.bytes;
    if (afterBytes !== expected) {
      return invalid("recovery_required", "Permission audit readback bytes do not match append expectation.");
    }

    const receipt = reconstructReceipt(checked.value.record, replayed.value.length - 1);
    if (receipt.state === "invalid") return invalid("recovery_required", ...receipt.errors);

    return valid({
      ledgerPath: paths.value.ledgerPath,
      byteLength: Buffer.byteLength(after.value.bytes, "utf8"),
      bytes: after.value.bytes,
      records: after.value.entries,
      receipt: receipt.value,
    });
  };

  let operationResult: PermissionAuditStoreContractResult<PermissionAuditFilesystemLedgerAppendResult> = invalid(
    "permission_audit_unavailable",
    "Permission audit append produced no result.",
  );
  let releaseResult: PermissionAuditStoreInvalidContractResult | undefined;
  try {
    operationResult = await runAppendOperation();
  } finally {
    const released = await releaseLock(token.value);
    if (released.state === "invalid") {
      releaseResult = released;
    }
  }
  if (releaseResult !== undefined) return invalid("recovery_required", ...releaseResult.errors);
  return operationResult;
}

function validateStrictJsonLine(line: string): PermissionAuditStoreContractResult<undefined> {
  try {
    validateStrictJson(line);
  } catch (error) {
    return invalid("permission_audit_replay_invalid", `Permission audit log line must be strict JSON. ${(error instanceof Error ? error.message : String(error))}`);
  }
  return valid(undefined);
}

function validateStrictJson(input: string): void {
  let index = 0;
  const length = input.length;

  function skipWhitespace(): void {
    while (index < length) {
      const code = input.charCodeAt(index);
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) break;
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
      while (isDecimalDigit(input[index])) index += 1;
    }
    if (input[index] === ".") {
      index += 1;
      if (!isDecimalDigit(input[index])) throw new Error("invalid fraction");
      while (isDecimalDigit(input[index])) index += 1;
    }
    if (input[index] === "e" || input[index] === "E") {
      index += 1;
      if (input[index] === "+" || input[index] === "-") index += 1;
      if (!isDecimalDigit(input[index])) throw new Error("invalid exponent");
      while (isDecimalDigit(input[index])) index += 1;
    }
  }

  function isDecimalDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= "0" && ch <= "9";
  }

  parseValue();
  skipWhitespace();
  if (index !== length) throw new Error("trailing content");
}

interface PermissionAuditLockToken {
  readonly lockOwnerId: string;
  readonly marker: string;
  readonly path: string;
  readonly ino: number;
  readonly dev: number;
}

function markerFromOwner(owner: string): string {
  return `${LOCK_PREFIX}${owner}`;
}

async function acquireLock(
  paths: PermissionAuditFilesystemLedgerPaths,
  lockOwnerId: string,
): Promise<PermissionAuditStoreContractResult<PermissionAuditLockToken>> {
  try {
    const existing = await lstat(paths.lockPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      return invalid("unsafe_path", "Permission audit lock must be a regular file.");
    }
    return invalid("permission_audit_lock_held", "Permission audit lock is held.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      if ((error as NodeJS.ErrnoException).code === "ELOOP") return invalid("unsafe_path", "Permission audit lock path is unsafe.");
      return invalid("permission_audit_unavailable", `Permission audit lock check failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
    }
  }

  const marker = markerFromOwner(lockOwnerId);
  let handle;
  try {
    handle = await open(paths.lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const stats = await handle.stat();
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return invalid("unsafe_path", "Permission audit lock must be a regular file.");
    }
    const markerBytes = Buffer.byteLength(marker, "utf8");
    const written = await handle.write(marker, null, "utf8");
    if (written.bytesWritten !== markerBytes) return invalid("recovery_required", "Permission audit lock marker write was incomplete.");
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
    if (code === "EEXIST") return invalid("permission_audit_lock_held", "Permission audit lock is held.");
    if (code === "ELOOP") return invalid("unsafe_path", "Permission audit lock must not be a symbolic link.");
    return invalid("permission_audit_unavailable", `Permission audit lock acquisition failed: ${code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function releaseLock(token: PermissionAuditLockToken): Promise<PermissionAuditStoreContractResult<void>> {
  let handle;
  try {
    handle = await open(token.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    if (Number(stats.ino) !== token.ino || Number(stats.dev) !== token.dev) {
      return invalid("recovery_required", "Permission audit lock owner identity changed.");
    }
    const marker = await handle.readFile("utf8");
    if (marker !== token.marker) return invalid("recovery_required", "Permission audit lock owner marker changed.");
    const sameTarget = await isSameLockTarget(token.path, token);
    if (!sameTarget) return invalid("recovery_required", "Permission audit lock ownership changed before release.");
    await unlink(token.path);
    return valid(undefined);
  } catch {
    return invalid("recovery_required", "Permission audit lock release is uncertain.");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function isSameLockTarget(path: string, token: PermissionAuditLockToken): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) return false;
    return Number(stats.ino) === token.ino && Number(stats.dev) === token.dev;
  } catch {
    return false;
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

function throwClosedStoreError(result: PermissionAuditStoreInvalidContractResult): never {
  const error = new Error(result.errors[0] ?? result.code) as Error & { code: string };
  error.code = result.code;
  throw error;
}

export function createPermissionAuditFilesystemStore(input: PermissionAuditFilesystemStoreScopeInput): PermissionAuditFilesystemStore {
  return {
    ledgerId: input.ledgerId,
    async read() {
      const result = await readPermissionAuditLedgerV1(input);
      if (result.state === "invalid") throwClosedStoreError(result);
      return result.value.entries;
    },
    async appendIfAbsent(record) {
      const result = await appendPermissionAuditRecordIfAbsentV1({ ...input, record });
      if (result.state === "invalid") throwClosedStoreError(result);
      return result.value.receipt;
    },
  };
}
