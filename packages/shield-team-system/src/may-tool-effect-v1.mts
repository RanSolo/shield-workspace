import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { isProxy } from "node:util/types";

export const MAY_TOOL_MAPPINGS_V1 = Object.freeze({
  writeFile: Object.freeze({
    actionId: "repository.write_file",
    effectClass: "behavioral_implementation",
    capability: "filesystem_write",
  }),
  runValidation: Object.freeze({
    actionId: "repository.run_validation",
    effectClass: "verification",
    capability: "process_execute",
  }),
} as const);

export interface MayFileStatIdentityInputV1 {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
  readonly mode: number | bigint;
  readonly size: number | bigint;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
}

export interface MayWritePresentPreconditionV1 {
  readonly kind: "present";
  readonly regularFileIdentity: string;
  readonly sha256: string;
}

export interface MayWriteAbsentPreconditionV1 {
  readonly kind: "absent";
}

export interface MayPlannedWriteOperationV1 {
  readonly toolName: "writeFile";
  readonly path: string;
  readonly content: string;
  readonly precondition: MayWritePresentPreconditionV1 | MayWriteAbsentPreconditionV1;
}

export interface MayPlannedValidationOperationV1 {
  readonly toolName: "runValidation";
  readonly commandId: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly executableIdentity: string;
}

export type MayPlannedToolOperationV1 = MayPlannedWriteOperationV1 | MayPlannedValidationOperationV1;
export type MayPlannedToolOperationsV1 = readonly [
  MayPlannedWriteOperationV1,
  MayPlannedValidationOperationV1,
] | readonly [
  MayPlannedWriteOperationV1,
  MayPlannedWriteOperationV1,
  MayPlannedValidationOperationV1,
] | readonly [
  MayPlannedWriteOperationV1,
  MayPlannedWriteOperationV1,
  MayPlannedWriteOperationV1,
  MayPlannedValidationOperationV1,
];

export interface MayWriteEffectInputV1 {
  readonly path: string;
  readonly content: string;
  readonly expectedSha256: string;
}

export interface MayValidationEffectInputV1 {
  readonly commandId: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly executableIdentity: string;
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_ARGUMENTS = 32;
const MAX_ARGUMENT_BYTES = 4_096;
const MAX_CONTENT_BYTES = 262_144;
const MAX_TIMEOUT_MS = 120_000;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && !isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactPlain(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!plain(value)) return false;
  const expected = new Set(fields);
  if (Reflect.ownKeys(value).length !== expected.size) return false;
  for (const field of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return false;
  }
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && expected.has(key));
}

function data(value: Record<string, unknown>, field: string): unknown {
  return Object.getOwnPropertyDescriptor(value, field)?.value;
}

function denseArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const output: unknown[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : undefined;
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
    output.push(descriptor.value);
  }
  return output;
}

function validUtf8String(value: unknown): value is string {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function validRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || value.includes("\\") || value.includes("\0")) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function safeArgument(value: unknown): value is string {
  return typeof value === "string"
    && Buffer.byteLength(value, "utf8") <= MAX_ARGUMENT_BYTES
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function finiteStatNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function computeMayExecutableIdentityV1(info: MayFileStatIdentityInputV1): string {
  if (!finiteStatNumber(info.mtimeMs)) throw new Error("may_executable_identity_malformed");
  return `${info.dev}:${info.ino}:${info.mode}:${info.size}:${info.mtimeMs}`;
}

export function computeMayRegularFileIdentityV1(info: MayFileStatIdentityInputV1): string {
  if (!finiteStatNumber(info.mtimeMs) || !finiteStatNumber(info.ctimeMs)) throw new Error("may_file_identity_malformed");
  return `${info.dev}:${info.ino}:${info.mode}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
}

function normalizeWrite(value: unknown): MayPlannedWriteOperationV1 {
  if (!exactPlain(value, ["toolName", "path", "content", "precondition"])) throw new Error("may_planned_operations_malformed");
  const toolName = data(value, "toolName");
  const path = data(value, "path");
  const content = data(value, "content");
  const rawPrecondition = data(value, "precondition");
  if (toolName !== "writeFile" || !validRelativePath(path) || !validUtf8String(content) || Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
    throw new Error("may_planned_operations_malformed");
  }
  let precondition: MayWritePresentPreconditionV1 | MayWriteAbsentPreconditionV1;
  if (exactPlain(rawPrecondition, ["kind"]) && data(rawPrecondition, "kind") === "absent") {
    precondition = Object.freeze({ kind: "absent" });
  } else if (exactPlain(rawPrecondition, ["kind", "regularFileIdentity", "sha256"])) {
    const regularFileIdentity = data(rawPrecondition, "regularFileIdentity");
    const sha256 = data(rawPrecondition, "sha256");
    if (data(rawPrecondition, "kind") !== "present" || typeof regularFileIdentity !== "string" || !IDENTIFIER.test(regularFileIdentity) || typeof sha256 !== "string" || !SHA256.test(sha256)) {
      throw new Error("may_planned_operations_malformed");
    }
    precondition = Object.freeze({ kind: "present", regularFileIdentity, sha256 });
  } else {
    throw new Error("may_planned_operations_malformed");
  }
  return Object.freeze({ toolName: "writeFile", path, content, precondition });
}

function normalizeValidation(value: unknown): MayPlannedValidationOperationV1 {
  if (!exactPlain(value, ["toolName", "commandId", "executable", "args", "timeoutMs", "executableIdentity"])) throw new Error("may_planned_operations_malformed");
  const commandId = data(value, "commandId");
  const executable = data(value, "executable");
  const rawArgs = denseArray(data(value, "args"));
  const timeoutMs = data(value, "timeoutMs");
  const executableIdentity = data(value, "executableIdentity");
  if (data(value, "toolName") !== "runValidation" || typeof commandId !== "string" || !IDENTIFIER.test(commandId)
    || typeof executable !== "string" || !isAbsolute(executable) || executable.includes("\0")
    || rawArgs === null || rawArgs.length > MAX_ARGUMENTS || !rawArgs.every(safeArgument)
    || !Number.isSafeInteger(timeoutMs) || (timeoutMs as number) < 1 || (timeoutMs as number) > MAX_TIMEOUT_MS
    || typeof executableIdentity !== "string" || !IDENTIFIER.test(executableIdentity)) {
    throw new Error("may_planned_operations_malformed");
  }
  return Object.freeze({
    toolName: "runValidation",
    commandId,
    executable,
    args: Object.freeze(rawArgs as string[]),
    timeoutMs: timeoutMs as number,
    executableIdentity,
  });
}

export function normalizeMayPlannedToolOperationsV1(value: unknown): MayPlannedToolOperationsV1 {
  const operations = denseArray(value);
  if (operations === null || operations.length < 2 || operations.length > 4) throw new Error("may_planned_operations_malformed");
  const writes = operations.slice(0, -1).map(normalizeWrite);
  const validation = normalizeValidation(operations.at(-1));
  const paths = writes.map(({ path }) => path);
  if (new Set(paths).size !== paths.length) throw new Error("may_planned_operations_malformed");
  const normalized = Object.freeze([...writes, validation]) as MayPlannedToolOperationsV1;
  const effectKeys = normalized.map(computeMayPlannedToolEffectKeyV1);
  if (new Set(effectKeys).size !== effectKeys.length) throw new Error("may_planned_operations_malformed");
  return normalized;
}

export function computeMayWriteEffectKeyV1(input: MayWriteEffectInputV1): string {
  if (!exactPlain(input, ["path", "content", "expectedSha256"])) throw new Error("may_write_effect_malformed");
  const path = data(input, "path");
  const content = data(input, "content");
  const expectedSha256 = data(input, "expectedSha256");
  if (!validRelativePath(path) || !validUtf8String(content) || Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES
    || (expectedSha256 !== "absent" && (typeof expectedSha256 !== "string" || !SHA256.test(expectedSha256)))) {
    throw new Error("may_write_effect_malformed");
  }
  const descriptor = {
    contentSha256: createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex"),
    expectedSha256,
    path,
    toolName: "writeFile",
  };
  return `effect:may:sha256:${createHash("sha256").update(JSON.stringify(descriptor)).digest("hex")}`;
}

export function computeMayValidationEffectKeyV1(input: MayValidationEffectInputV1): string {
  if (!exactPlain(input, ["commandId", "executable", "args", "timeoutMs", "executableIdentity"])) throw new Error("may_validation_effect_malformed");
  const commandId = data(input, "commandId");
  const executable = data(input, "executable");
  const rawArgs = denseArray(data(input, "args"));
  const timeoutMs = data(input, "timeoutMs");
  const executableIdentity = data(input, "executableIdentity");
  if (typeof commandId !== "string" || !IDENTIFIER.test(commandId) || typeof executable !== "string" || !isAbsolute(executable) || executable.includes("\0")
    || rawArgs === null || rawArgs.length > MAX_ARGUMENTS || !rawArgs.every(safeArgument)
    || !Number.isSafeInteger(timeoutMs) || (timeoutMs as number) < 1 || (timeoutMs as number) > MAX_TIMEOUT_MS
    || typeof executableIdentity !== "string" || !IDENTIFIER.test(executableIdentity)) {
    throw new Error("may_validation_effect_malformed");
  }
  const descriptor = { args: rawArgs, commandId, executable, executableIdentity, timeoutMs, toolName: "runValidation" };
  return `effect:may:sha256:${createHash("sha256").update(JSON.stringify(descriptor)).digest("hex")}`;
}

export function computeMayPlannedToolEffectKeyV1(operation: MayPlannedToolOperationV1): string {
  const normalized = exactPlain(operation, ["toolName", "path", "content", "precondition"])
    ? normalizeWrite(operation)
    : normalizeValidation(operation);
  return normalized.toolName === "writeFile"
    ? computeMayWriteEffectKeyV1({
        path: normalized.path,
        content: normalized.content,
        expectedSha256: normalized.precondition.kind === "absent" ? "absent" : normalized.precondition.sha256,
      })
    : computeMayValidationEffectKeyV1({
        commandId: normalized.commandId,
        executable: normalized.executable,
        args: normalized.args,
        timeoutMs: normalized.timeoutMs,
        executableIdentity: normalized.executableIdentity,
      });
}

export function computeMayPlannedOperationsDigestV1(operations: MayPlannedToolOperationsV1): string {
  const normalized = normalizeMayPlannedToolOperationsV1(operations);
  return `sha256:${createHash("sha256").update(JSON.stringify(normalized)).digest("base64url")}`;
}

export function computeMayPlannedOperationsSequenceEffectKeyV1(operations: MayPlannedToolOperationsV1): string | null {
  const normalized = normalizeMayPlannedToolOperationsV1(operations);
  if (normalized.length === 2) return null;
  const digest = computeMayPlannedOperationsDigestV1(normalized);
  return `effect:may-sequence:sha256:${createHash("sha256")
    .update("shield:may-planned-tool-sequence:v1\0", "utf8")
    .update(digest, "utf8")
    .digest("hex")}`;
}
