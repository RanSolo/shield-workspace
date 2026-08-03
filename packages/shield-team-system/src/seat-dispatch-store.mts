import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isProxy, isSharedArrayBuffer } from "node:util/types";

import {
  createSeatDispatchStartedEventV1,
  replaySeatDispatchReceiptsV1,
  type RuntimeConfiguredV1,
  type RuntimeRequestedV1,
  type SeatDispatchExecutorHostObservation,
  type SeatDispatchExecutorSelfReport,
  type SeatDispatchReceiptEventV1,
  type SeatDispatchReceiptEventStartedV1,
  type SeatDispatchReceiptProjectionV1,
  type SeatDispatchRuntimeHostObservation,
  type SeatDispatchRuntimeSelfReport,
  type SeatDispatchToolExecution,
} from "./seat-dispatch-receipt-v1.mjs";
import { isDispatchableRoleId } from "./role-taxonomy-v1.mjs";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const PACKET_BINDING_PREFIX = "evidence:packet-binding:seat-dispatch-v1:";
const CLAIM_INPUT_FIELDS = [
  "repositoryRoot", "repositoryId", "repositoryWorkspaceId", "lockOwnerId",
  "parentMissionId", "parentMissionRevision", "parentSessionId", "accountableSeatId",
  "subjectId", "subjectRevision", "artifactId", "artifactRevision", "repositoryRevision",
  "startedAt", "configuredRuntime", "requestedRuntime", "toolExecution", "runtimeSelfReport",
  "runtimeHostObserved", "executorSelfReport", "executorHostObserved", "packetId", "packetBytes",
] as const;
const CLAIM_OPTIONAL_FIELDS = ["inputEvidenceRefs"] as const;
const PACKET_MAX_BYTES = 1_048_576;
const PACKET_MAX_DEPTH = 64;
const PACKET_MAX_CONTAINER_SIZE = 10_000;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get;

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
  readonly nonce: string;
  readonly marker: string;
  readonly path: string;
  readonly ino: number;
  readonly dev: number;
}

export interface SeatDispatchPacketClaimInputV1 extends SeatDispatchReceiptStoreScopeInput {
  readonly lockOwnerId: string;
  readonly parentMissionId: string;
  readonly parentMissionRevision: string;
  readonly parentSessionId: string;
  readonly accountableSeatId: string;
  readonly subjectId: string;
  readonly subjectRevision: string;
  readonly artifactId: string;
  readonly artifactRevision: string;
  readonly repositoryRevision: string;
  readonly startedAt: string;
  readonly configuredRuntime: RuntimeConfiguredV1;
  readonly requestedRuntime: RuntimeRequestedV1;
  readonly toolExecution: SeatDispatchToolExecution;
  readonly runtimeSelfReport: SeatDispatchRuntimeSelfReport;
  readonly runtimeHostObserved: SeatDispatchRuntimeHostObservation;
  readonly executorSelfReport: SeatDispatchExecutorSelfReport;
  readonly executorHostObserved: SeatDispatchExecutorHostObservation;
  readonly packetId: string;
  readonly packetBytes: Uint8Array;
  readonly inputEvidenceRefs?: readonly string[];
}

interface SeatDispatchPacketClaimResultCoreV1 {
  readonly logPath: string;
  readonly byteLength: number;
  readonly packetDigest: string;
  readonly receipt: SeatDispatchReceiptProjectionV1;
}

export type SeatDispatchPacketClaimResultV1 =
  | (SeatDispatchPacketClaimResultCoreV1 & {
      readonly claimStatus: "claimed";
      readonly executionDisposition: "execute_once";
    })
  | (SeatDispatchPacketClaimResultCoreV1 & {
      readonly claimStatus: "already_claimed";
      readonly executionDisposition?: never;
    });

export type SeatDispatchPacketClaimFailureCodeV1 =
  | "malformed_input"
  | "malformed_packet"
  | "malformed_runtime"
  | "malformed_executor"
  | "malformed_tool_execution"
  | "unsafe_path"
  | "repository_unavailable"
  | "receipt_unavailable"
  | "dispatch_receipt_lock_held"
  | "mixed_scope"
  | "malformed_log"
  | "malformed_event"
  | "digest_mismatch"
  | "duplicate_event"
  | "duplicate_start"
  | "global_sequence_gap"
  | "global_previous_digest"
  | "lifecycle_sequence_gap"
  | "lifecycle_previous_digest"
  | "illegal_transition"
  | "post_terminal"
  | "timestamp_regression"
  | "identity_mismatch"
  | "receipt_dispatch_collision"
  | "child_task_reuse"
  | "child_session_reuse"
  | "output_evidence_misplacement"
  | "packet_claim_conflict"
  | "recovery_required";

export type SeatDispatchPacketClaimContractResultV1 =
  | {
      readonly state: "valid";
      readonly value: SeatDispatchPacketClaimResultV1;
      readonly code?: undefined;
      readonly errors?: undefined;
    }
  | {
      readonly state: "invalid";
      readonly code: SeatDispatchPacketClaimFailureCodeV1;
      readonly errors: string[];
      readonly value?: undefined;
    };

interface PreparedPacketClaim {
  readonly scope: SeatDispatchReceiptStoreScopeInput;
  readonly lockOwnerId: string;
  readonly packetDigest: string;
  readonly template: SeatDispatchReceiptEventStartedV1;
}

type PendingPacketClaimResult =
  | { readonly state: "valid"; readonly claimed: true; readonly value: SeatDispatchPacketClaimResultCoreV1 }
  | { readonly state: "valid"; readonly claimed: false; readonly value: SeatDispatchPacketClaimResultCoreV1 }
  | { readonly state: "invalid"; readonly code: SeatDispatchPacketClaimFailureCodeV1; readonly errors: string[] };

type LockReleaseResult =
  | { readonly state: "released" }
  | { readonly state: "uncertain"; readonly code: "recovery_required"; readonly errors: string[] };

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

function reservedEvidenceError(event: Record<string, unknown>): string | null {
  const kind = Object.getOwnPropertyDescriptor(event, "kind");
  if (!kind?.enumerable || !Object.hasOwn(kind, "value") || kind.value !== "dispatch.started") return null;
  const refs = Object.getOwnPropertyDescriptor(event, "inputEvidenceRefs");
  if (!refs?.enumerable || !Object.hasOwn(refs, "value") || !Array.isArray(refs.value) || safeIsProxy(refs.value)) return null;
  for (let index = 0; index < refs.value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(refs.value, String(index));
    if (descriptor?.enumerable && Object.hasOwn(descriptor, "value") &&
        typeof descriptor.value === "string" && descriptor.value.startsWith(PACKET_BINDING_PREFIX)) {
      return "Caller-supplied packet-binding evidence is reserved.";
    }
  }
  return null;
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
  const reservedError = reservedEvidenceError(value.event);
  if (reservedError !== null) return invalid("malformed_input", reservedError);
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

function claimInvalid(
  code: SeatDispatchPacketClaimFailureCodeV1,
  ...errors: readonly string[]
): SeatDispatchPacketClaimContractResultV1 {
  return { state: "invalid", code, errors: [...(errors.length > 0 ? errors : ["invalid input."])] };
}

function pendingInvalid(
  code: SeatDispatchPacketClaimFailureCodeV1,
  ...errors: readonly string[]
): PendingPacketClaimResult {
  return { state: "invalid", code, errors: [...(errors.length > 0 ? errors : ["invalid input."])] };
}

function asClaimFailureCode(code: string): SeatDispatchPacketClaimFailureCodeV1 {
  const allowed: ReadonlySet<string> = new Set<SeatDispatchPacketClaimFailureCodeV1>([
    "malformed_input", "malformed_packet", "malformed_runtime", "malformed_executor", "malformed_tool_execution",
    "unsafe_path", "repository_unavailable", "receipt_unavailable", "dispatch_receipt_lock_held", "mixed_scope",
    "malformed_log", "malformed_event", "digest_mismatch", "duplicate_event", "duplicate_start", "global_sequence_gap",
    "global_previous_digest", "lifecycle_sequence_gap", "lifecycle_previous_digest", "illegal_transition", "post_terminal",
    "timestamp_regression", "identity_mismatch", "receipt_dispatch_collision", "child_task_reuse", "child_session_reuse",
    "output_evidence_misplacement", "packet_claim_conflict", "recovery_required",
  ]);
  return allowed.has(code) ? code as SeatDispatchPacketClaimFailureCodeV1 : "recovery_required";
}

class PacketNumber {
  constructor(readonly token: string) {}
}

type PacketJson = null | boolean | string | PacketNumber | PacketJson[] | { readonly [key: string]: PacketJson };

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function decimalRational(token: string): { numerator: bigint; denominator: bigint } {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(token);
  if (match === null) throw new Error("invalid numeric token");
  const negative = match[1] === "-";
  const integer = match[2];
  const fraction = match[3] ?? "";
  const digits = `${integer}${fraction}`;
  if (/^0+$/u.test(digits)) return { numerator: 0n, denominator: 1n };
  const exponentText = (match[4] ?? "0").replace(/^\+/u, "");
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent)) throw new Error("numeric exponent is out of bounds");
  const scale = exponent - fraction.length;
  if (Math.abs(scale) > 1_000) throw new Error("numeric exponent is out of bounds");
  let numerator = BigInt(digits);
  let denominator = 1n;
  if (scale >= 0) numerator *= 10n ** BigInt(scale);
  else denominator = 10n ** BigInt(-scale);
  if (negative) numerator = -numerator;
  return { numerator, denominator };
}

function binary64Rational(value: number): { numerator: bigint; denominator: bigint } {
  if (Object.is(value, -0) || value === 0) return { numerator: 0n, denominator: 1n };
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false);
  const negative = (bits >> 63n) === 1n;
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  let numerator = exponentBits === 0 ? fraction : (1n << 52n) | fraction;
  const exponent = exponentBits === 0 ? -1074 : exponentBits - 1023 - 52;
  let denominator = 1n;
  if (exponent >= 0) numerator <<= BigInt(exponent);
  else denominator <<= BigInt(-exponent);
  if (negative) numerator = -numerator;
  return { numerator, denominator };
}

function rationalEqual(
  left: { numerator: bigint; denominator: bigint },
  right: { numerator: bigint; denominator: bigint },
): boolean {
  return left.numerator * right.denominator === right.numerator * left.denominator;
}

function canonicalPacketNumber(token: string): string {
  const parsed = Number(token);
  if (!Number.isFinite(parsed)) throw new Error("number is not finite binary64");
  const inputRational = decimalRational(token);
  const binaryRational = binary64Rational(parsed);
  if (!rationalEqual(inputRational, binaryRational)) throw new Error("number loses decimal precision");
  const emitted = Object.is(parsed, -0) ? "0" : parsed.toString();
  if (!rationalEqual(decimalRational(emitted), binaryRational)) {
    throw new Error("shortest binary64 decimal is not mathematically exact");
  }
  const reparsed = Number(emitted);
  const reemitted = Object.is(reparsed, -0) ? "0" : reparsed.toString();
  if (reemitted !== emitted) throw new Error("number canonicalization is not idempotent");
  return emitted;
}

function parseCanonicalPacket(bytes: Uint8Array): { canonicalBytes: Uint8Array; packetDigest: string } {
  if (bytes.byteLength > PACKET_MAX_BYTES) throw new Error("packet exceeds 1048576 bytes");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  let index = 0;

  function skipWhitespace(): void {
    while (index < text.length && (text[index] === " " || text[index] === "\t" || text[index] === "\n" || text[index] === "\r")) index += 1;
  }

  function parseString(): string {
    if (text[index] !== "\"") throw new Error("expected string");
    const start = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (!escaped && code < 0x20) throw new Error("unescaped control in string");
      if (escaped) {
        escaped = false;
        index += 1;
        continue;
      }
      if (text[index] === "\\") {
        escaped = true;
        index += 1;
        continue;
      }
      if (text[index] === "\"") {
        index += 1;
        let value: string;
        try {
          value = JSON.parse(text.slice(start, index)) as string;
        } catch {
          throw new Error("malformed JSON string");
        }
        if (hasLoneSurrogate(value)) throw new Error("lone surrogate in string");
        return value;
      }
      index += 1;
    }
    throw new Error("unterminated string");
  }

  function parseNumber(): PacketNumber {
    const start = index;
    if (text[index] === "-") index += 1;
    if (text[index] === "0") {
      index += 1;
      if (/[0-9]/u.test(text[index] ?? "")) throw new Error("leading zero");
    } else {
      if (!/[1-9]/u.test(text[index] ?? "")) throw new Error("invalid number");
      while (/[0-9]/u.test(text[index] ?? "")) index += 1;
    }
    if (text[index] === ".") {
      index += 1;
      if (!/[0-9]/u.test(text[index] ?? "")) throw new Error("invalid fraction");
      while (/[0-9]/u.test(text[index] ?? "")) index += 1;
    }
    if (text[index] === "e" || text[index] === "E") {
      index += 1;
      if (text[index] === "+" || text[index] === "-") index += 1;
      if (!/[0-9]/u.test(text[index] ?? "")) throw new Error("invalid exponent");
      while (/[0-9]/u.test(text[index] ?? "")) index += 1;
    }
    const token = text.slice(start, index);
    canonicalPacketNumber(token);
    return new PacketNumber(token);
  }

  function parseValue(containerDepth: number): PacketJson {
    skipWhitespace();
    const ch = text[index];
    if (ch === "\"") return parseString();
    if (ch === "t" && text.slice(index, index + 4) === "true") { index += 4; return true; }
    if (ch === "f" && text.slice(index, index + 5) === "false") { index += 5; return false; }
    if (ch === "n" && text.slice(index, index + 4) === "null") { index += 4; return null; }
    if (ch === "-" || /[0-9]/u.test(ch ?? "")) return parseNumber();
    if (ch === "[") {
      if (containerDepth + 1 > PACKET_MAX_DEPTH) throw new Error("packet nesting exceeds 64");
      index += 1;
      skipWhitespace();
      const values: PacketJson[] = [];
      if (text[index] === "]") { index += 1; return values; }
      while (true) {
        if (values.length >= PACKET_MAX_CONTAINER_SIZE) throw new Error("array exceeds 10000 elements");
        values.push(parseValue(containerDepth + 1));
        skipWhitespace();
        if (text[index] === "]") { index += 1; return values; }
        if (text[index] !== ",") throw new Error("array delimiter missing");
        index += 1;
      }
    }
    if (ch === "{") {
      if (containerDepth + 1 > PACKET_MAX_DEPTH) throw new Error("packet nesting exceeds 64");
      index += 1;
      skipWhitespace();
      const value: { [key: string]: PacketJson } = Object.create(null) as { [key: string]: PacketJson };
      const seen = new Set<string>();
      if (text[index] === "}") { index += 1; return value; }
      while (true) {
        if (seen.size >= PACKET_MAX_CONTAINER_SIZE) throw new Error("object exceeds 10000 members");
        skipWhitespace();
        const key = parseString();
        if (seen.has(key)) throw new Error("duplicate object key");
        seen.add(key);
        skipWhitespace();
        if (text[index] !== ":") throw new Error("object colon missing");
        index += 1;
        Object.defineProperty(value, key, { value: parseValue(containerDepth + 1), enumerable: true, configurable: false });
        skipWhitespace();
        if (text[index] === "}") { index += 1; return value; }
        if (text[index] !== ",") throw new Error("object delimiter missing");
        index += 1;
      }
    }
    throw new Error("malformed JSON token");
  }

  function canonicalize(value: PacketJson): string {
    if (value === null) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "string") return JSON.stringify(value);
    if (value instanceof PacketNumber) return canonicalPacketNumber(value.token);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }

  const value = parseValue(0);
  skipWhitespace();
  if (index !== text.length) throw new Error("trailing packet content");
  const canonicalText = canonicalize(value);
  const canonicalBytes = new TextEncoder().encode(canonicalText);
  return {
    canonicalBytes,
    packetDigest: `sha256:${createHash("sha256").update(canonicalBytes).digest("base64url")}`,
  };
}

function canonicalComparable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalComparable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalComparable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeClaimEvidence(value: unknown): { state: "valid"; value: string[] } | { state: "invalid"; error: string } {
  if (value === undefined) return { state: "valid", value: [] };
  if (!Array.isArray(value) || safeIsProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return { state: "invalid", error: "inputEvidenceRefs must be a plain array." };
  }
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : undefined;
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      return { state: "invalid", error: "inputEvidenceRefs contains an unsafe field." };
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || !identifier(descriptor.value)) {
      return { state: "invalid", error: `inputEvidenceRefs[${index}] is invalid.` };
    }
    const ref = descriptor.value;
    if (ref.startsWith(PACKET_BINDING_PREFIX)) return { state: "invalid", error: "Caller-supplied packet-binding evidence is reserved." };
    if (!seen.has(ref)) { seen.add(ref); refs.push(ref); }
  }
  if (refs.length > 15) return { state: "invalid", error: "inputEvidenceRefs exceeds 15 deduplicated caller references." };
  return { state: "valid", value: refs };
}

function normalizeStartedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/u.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > daysInMonth) return null;
  const milliseconds = (match[7] ?? "").slice(0, 3).padEnd(3, "0");
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${milliseconds}Z`;
}

function preparePacketClaim(input: unknown): SeatDispatchPacketClaimContractResultV1 | PreparedPacketClaim {
  if (safeIsProxy(input) || typeof input !== "object" || input === null || Object.getPrototypeOf(input) !== Object.prototype) {
    return claimInvalid("malformed_input", "claim input must be a strict plain object.");
  }
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    return claimInvalid("malformed_input", "claim input descriptors are unavailable.");
  }
  const expected = new Set<string>([...CLAIM_INPUT_FIELDS, ...CLAIM_OPTIONAL_FIELDS]);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !expected.has(key)) return claimInvalid("malformed_input", `claim input has invalid field: ${String(key)}.`);
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
      return claimInvalid("malformed_input", `claim input field ${key} must be an enumerable own data property.`);
    }
  }
  for (const field of CLAIM_INPUT_FIELDS) {
    const descriptor = descriptors[field];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
      return claimInvalid("malformed_input", `claim input is missing field: ${field}.`);
    }
  }

  const packetValue = descriptors.packetBytes.value;
  if (safeIsProxy(packetValue) || typedArrayBufferGetter === undefined || typedArrayTagGetter === undefined) {
    return claimInvalid("malformed_input", "packetBytes must be a genuine Uint8Array.");
  }
  let packetSnapshot: Uint8Array;
  try {
    if (typedArrayTagGetter.call(packetValue) !== "Uint8Array") {
      return claimInvalid("malformed_input", "packetBytes must be a genuine Uint8Array.");
    }
    const backing = typedArrayBufferGetter.call(packetValue) as ArrayBufferLike;
    if (isSharedArrayBuffer(backing)) return claimInvalid("malformed_input", "packetBytes must not use SharedArrayBuffer.");
    packetSnapshot = new Uint8Array(packetValue as Uint8Array);
  } catch {
    return claimInvalid("malformed_input", "packetBytes must be a genuine Uint8Array.");
  }

  const value = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])) as Record<string, unknown>;
  if (typeof value.repositoryRoot !== "string" || value.repositoryRoot.length === 0 ||
      !identifier(value.repositoryId) || !identifier(value.repositoryWorkspaceId) || !lockOwner(value.lockOwnerId) ||
      !identifier(value.parentMissionId) || !identifier(value.parentSessionId) || !identifier(value.accountableSeatId) ||
      !isDispatchableRoleId(value.accountableSeatId) ||
      !identifier(value.subjectId) || !identifier(value.artifactId) || !identifier(value.packetId)) {
    return claimInvalid("malformed_input", "claim input contains malformed identity fields.");
  }
  const revisions = [value.parentMissionRevision, value.repositoryRevision, value.subjectRevision, value.artifactRevision];
  if (revisions.some((revisionValue) => typeof revisionValue !== "string" || !/^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/u.test(revisionValue))) {
    return claimInvalid("malformed_input", "claim input contains malformed revision fields.");
  }
  const startedAt = normalizeStartedAt(value.startedAt);
  if (startedAt === null) {
    return claimInvalid("malformed_input", "claim input has malformed startedAt.");
  }
  const evidence = normalizeClaimEvidence(value.inputEvidenceRefs);
  if (evidence.state === "invalid") return claimInvalid("malformed_input", evidence.error);

  let packetDigest: string;
  try {
    packetDigest = parseCanonicalPacket(packetSnapshot).packetDigest;
  } catch (error) {
    return claimInvalid("malformed_packet", `Packet is malformed: ${error instanceof Error ? error.message : String(error)}.`);
  }

  const claimSeedInput = new TextEncoder().encode(`seat-dispatch-claim-v1\0${value.parentMissionId}\0${value.parentSessionId}\0${value.packetId}`);
  const claimKey = createHash("sha256").update(claimSeedInput).digest("base64url").slice(0, 32);
  const packetBinding = `${PACKET_BINDING_PREFIX}${claimKey}:${packetDigest}`;
  let template: SeatDispatchReceiptEventStartedV1;
  try {
    template = createSeatDispatchStartedEventV1({
      receiptId: `receipt:${claimKey}`,
      dispatchId: `dispatch:${claimKey}`,
      parentMissionId: value.parentMissionId,
      parentMissionRevision: value.parentMissionRevision as string,
      parentSessionId: value.parentSessionId,
      childTaskId: `task:${claimKey}`,
      childSessionId: `session:${claimKey}`,
      accountableSeatId: value.accountableSeatId,
      repositoryId: value.repositoryId,
      repositoryWorkspaceId: value.repositoryWorkspaceId,
      repositoryRevision: value.repositoryRevision as string,
      subjectId: value.subjectId,
      subjectRevision: value.subjectRevision as string,
      artifactId: value.artifactId,
      artifactRevision: value.artifactRevision as string,
      configuredRuntime: value.configuredRuntime as RuntimeConfiguredV1,
      requestedRuntime: value.requestedRuntime as RuntimeRequestedV1,
      toolExecution: value.toolExecution as SeatDispatchToolExecution,
      runtimeSelfReport: value.runtimeSelfReport as SeatDispatchRuntimeSelfReport,
      runtimeHostObserved: value.runtimeHostObserved as SeatDispatchRuntimeHostObservation,
      executorSelfReport: value.executorSelfReport as SeatDispatchExecutorSelfReport,
      executorHostObserved: value.executorHostObserved as SeatDispatchExecutorHostObservation,
      inputEvidenceRefs: [...evidence.value, packetBinding],
      timestamp: startedAt,
      logSequence: 0,
      previousLogDigest: null,
      lifecycleSequence: 0,
      previousLifecycleDigest: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("malformed_runtime")) return claimInvalid("malformed_runtime", message);
    if (message.includes("malformed_executor")) return claimInvalid("malformed_executor", message);
    if (message.includes("malformed_tool_execution")) return claimInvalid("malformed_tool_execution", message);
    return claimInvalid("malformed_input", message);
  }

  return {
    scope: { repositoryRoot: value.repositoryRoot, repositoryId: value.repositoryId, repositoryWorkspaceId: value.repositoryWorkspaceId },
    lockOwnerId: value.lockOwnerId,
    packetDigest,
    template,
  };
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
      await mkdir(shieldDirectory);
      if (!await syncDirectory(repositoryRoot)) {
        return invalid("recovery_required", "Repository root sync failed after creating .shield.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        shieldDirectoryExists = true;
      } else {
      return invalid("receipt_unavailable", `Dispatch receipt shield directory could not be created: ${
        (error as NodeJS.ErrnoException).code ?? "unknown_error"
      }.`);
      }
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
  let nonce: string;
  try {
    nonce = randomBytes(32).toString("base64url");
  } catch {
    return invalid("recovery_required", "Dispatch receipt lock entropy source failed.");
  }
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

    const marker = `${JSON.stringify({ lockOwnerId, nonce, version: 1 })}\n`;
    const markerBytes = Buffer.byteLength(marker, "utf8");
    const written = await handle.write(marker, null, "utf8");
    if (written.bytesWritten !== markerBytes) {
      return invalid("recovery_required", "Dispatch receipt lock write was incomplete.");
    }
    await handle.sync();
    const token: SeatDispatchReceiptStoreValidationToken = {
      lockOwnerId,
      nonce,
      marker,
      path: paths.lockPath,
      ino: Number(stats.ino),
      dev: Number(stats.dev),
    };
    if (!await syncDirectory(dirname(paths.lockPath))) {
      return invalid("recovery_required", "Dispatch receipt lock parent directory sync failed.");
    }
    if (!await verifyLockEntry(token)) {
      return invalid("recovery_required", "Dispatch receipt lock changed after durable creation.");
    }
    return valid(token);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return invalid("dispatch_receipt_lock_held", "Dispatch receipt lock is held.");
    if (code === "ELOOP") return invalid("unsafe_path", "Dispatch receipt lock must not be symbolic.");
    if (handle !== undefined) return invalid("recovery_required", `Dispatch receipt lock durability failed: ${code ?? "unknown_error"}.`);
    return invalid("receipt_unavailable", `Dispatch receipt lock acquisition failed: ${code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function verifyLockEntry(token: SeatDispatchReceiptStoreValidationToken): Promise<boolean> {
  let handle;
  try {
    handle = await open(token.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    if (!stats.isFile() || Number(stats.ino) !== token.ino || Number(stats.dev) !== token.dev) return false;
    const marker = await handle.readFile("utf8");
    return marker === token.marker;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function releaseLock(token: SeatDispatchReceiptStoreValidationToken): Promise<LockReleaseResult> {
  if (!await verifyLockEntry(token) || !await releaseLockHandle(token.path, token)) {
    return { state: "uncertain", code: "recovery_required", errors: ["Dispatch receipt lock identity or marker changed before release."] };
  }
  try {
    await unlink(token.path);
  } catch (error) {
    return { state: "uncertain", code: "recovery_required", errors: [`Dispatch receipt lock unlink failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`] };
  }
  try {
    await lstat(token.path);
    return { state: "uncertain", code: "recovery_required", errors: ["Dispatch receipt lock path was replaced during release."] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return { state: "uncertain", code: "recovery_required", errors: ["Dispatch receipt lock unlink could not be verified."] };
    }
  }
  if (!await syncDirectory(dirname(token.path))) {
    return { state: "uncertain", code: "recovery_required", errors: ["Dispatch receipt lock parent directory sync failed after unlink."] };
  }
  return { state: "released" };
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

function startCandidateFromTemplate(
  template: SeatDispatchReceiptEventStartedV1,
  logSequence: number,
  previousLogDigest: string | null,
): SeatDispatchReceiptEventStartedV1 {
  return createSeatDispatchStartedEventV1({
    receiptId: template.receiptId,
    dispatchId: template.dispatchId,
    parentMissionId: template.parentMissionId,
    parentMissionRevision: template.parentMissionRevision,
    parentSessionId: template.parentSessionId,
    childTaskId: template.childTaskId,
    childSessionId: template.childSessionId,
    accountableSeatId: template.accountableSeatId,
    repositoryId: template.repositoryId,
    repositoryWorkspaceId: template.repositoryWorkspaceId,
    repositoryRevision: template.repositoryRevision,
    subjectId: template.subjectId,
    subjectRevision: template.subjectRevision,
    artifactId: template.artifactId,
    artifactRevision: template.artifactRevision,
    configuredRuntime: template.configuredRuntime,
    requestedRuntime: template.requestedRuntime,
    toolExecution: template.toolExecution,
    runtimeSelfReport: template.runtimeSelfReport,
    runtimeHostObserved: template.runtimeHostObserved,
    executorSelfReport: template.executorSelfReport,
    executorHostObserved: template.executorHostObserved,
    inputEvidenceRefs: template.inputEvidenceRefs,
    timestamp: template.timestamp,
    logSequence,
    previousLogDigest,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
}

function sameClaimStart(left: SeatDispatchReceiptEventStartedV1, right: SeatDispatchReceiptEventStartedV1): boolean {
  const fields: readonly (keyof SeatDispatchReceiptEventStartedV1)[] = [
    "schemaVersion", "contractVersion", "kind", "receiptId", "dispatchId", "parentMissionId", "parentMissionRevision",
    "parentSessionId", "childTaskId", "childSessionId", "accountableSeatId", "repositoryId", "repositoryWorkspaceId",
    "repositoryRevision", "subjectId", "subjectRevision", "artifactId", "artifactRevision", "configuredRuntime",
    "requestedRuntime", "toolExecution", "runtimeSelfReport", "runtimeHostObserved", "executorSelfReport", "executorHostObserved",
    "inputEvidenceRefs",
  ];
  return fields.every((field) => canonicalComparable(left[field]) === canonicalComparable(right[field]));
}

async function performPacketClaim(
  prepared: PreparedPacketClaim,
  paths: SeatDispatchStorePaths,
): Promise<PendingPacketClaimResult> {
  const current = await readStoreLog(prepared.scope, { allowMissing: true });
  if (current.state === "invalid") {
    return pendingInvalid(asClaimFailureCode(current.code), ...current.errors);
  }
  const previousLogDigest = current.value.entries.length === 0
    ? null
    : current.value.entries[current.value.entries.length - 1].entryDigest;
  let candidate: SeatDispatchReceiptEventStartedV1;
  try {
    candidate = startCandidateFromTemplate(prepared.template, current.value.entries.length, previousLogDigest);
  } catch (error) {
    return pendingInvalid("malformed_event", error instanceof Error ? error.message : String(error));
  }

  const stableStarts = current.value.entries.filter((entry): entry is SeatDispatchReceiptEventStartedV1 =>
    entry.kind === "dispatch.started" && (
      entry.receiptId === candidate.receiptId || entry.dispatchId === candidate.dispatchId ||
      entry.childTaskId === candidate.childTaskId || entry.childSessionId === candidate.childSessionId
    ),
  );
  if (stableStarts.length > 0) {
    const existing = stableStarts.find((entry) =>
      entry.receiptId === candidate.receiptId && entry.dispatchId === candidate.dispatchId &&
      entry.childTaskId === candidate.childTaskId && entry.childSessionId === candidate.childSessionId,
    );
    if (existing === undefined || stableStarts.length !== 1 || !sameClaimStart(existing, candidate)) {
      return pendingInvalid("packet_claim_conflict", "Stable packet claim identity is bound to a different normalized start.");
    }
    const receipt = current.value.projections.find((projection) =>
      projection.receiptId === existing.receiptId && projection.dispatchId === existing.dispatchId,
    );
    if (receipt === undefined) return pendingInvalid("recovery_required", "Existing packet claim has no replay projection.");
    return {
      state: "valid",
      claimed: false,
      value: {
        logPath: current.value.logPath,
        byteLength: Buffer.byteLength(current.value.bytes, "utf8"),
        packetDigest: prepared.packetDigest,
        receipt: Object.freeze({ ...receipt }),
      },
    };
  }

  const candidateEntries: SeatDispatchReceiptEventV1[] = [...current.value.entries, candidate];
  const candidateReplay = replaySeatDispatchReceiptsV1(candidateEntries);
  if (candidateReplay.state === "invalid") {
    return pendingInvalid(candidateReplay.code, ...candidateReplay.reasonCodes);
  }
  if (candidateReplay.projections.some((projection) =>
    projection.repositoryId !== prepared.scope.repositoryId ||
    projection.repositoryWorkspaceId !== prepared.scope.repositoryWorkspaceId
  )) {
    return pendingInvalid("mixed_scope", "Dispatch receipt candidate scope is mixed.");
  }

  const canonicalCandidate = candidateReplay.entries[candidateReplay.entries.length - 1];
  const line = `${JSON.stringify(canonicalCandidate)}\n`;
  const lineBytes = lineByteLength(line);
  let logHandle;
  try {
    logHandle = await open(paths.logPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o644);
    const stats = await logHandle.stat();
    if (!stats.isFile()) return pendingInvalid("unsafe_path", "Dispatch receipt log must be a regular file.");
    const written = await logHandle.write(line, null, "utf8");
    if (written.bytesWritten !== lineBytes) return pendingInvalid("recovery_required", "Dispatch receipt append write was incomplete.");
    await logHandle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ELOOP" || code === "ENOTDIR") return pendingInvalid("unsafe_path", "Dispatch receipt log path is unsafe.");
    return pendingInvalid("recovery_required", `Dispatch receipt append failed: ${code ?? "unknown_error"}.`);
  } finally {
    await logHandle?.close().catch(() => undefined);
  }
  if (current.value.missing && !await syncDirectory(dirname(paths.logPath))) {
    return pendingInvalid("recovery_required", "Dispatch receipt parent directory sync failed.");
  }

  const after = await readStoreLog(prepared.scope, { allowMissing: false });
  if (after.state === "invalid") return pendingInvalid("recovery_required", ...after.errors);
  if (after.value.bytes !== `${current.value.bytes}${line}`) {
    return pendingInvalid("recovery_required", "Dispatch receipt append readback is not exact.");
  }
  const receipt = after.value.projections.find((projection) =>
    projection.receiptId === candidate.receiptId && projection.dispatchId === candidate.dispatchId,
  );
  if (receipt === undefined) return pendingInvalid("recovery_required", "Dispatch receipt append replay omitted the packet claim.");
  return {
    state: "valid",
    claimed: true,
    value: {
      logPath: paths.logPath,
      byteLength: Buffer.byteLength(after.value.bytes, "utf8"),
      packetDigest: prepared.packetDigest,
      receipt: Object.freeze({ ...receipt }),
    },
  };
}

export async function claimSeatDispatchPacketV1(input: unknown): Promise<SeatDispatchPacketClaimContractResultV1> {
  const prepared = preparePacketClaim(input);
  if ("state" in prepared) return prepared;

  const paths = await resolveStorePaths(prepared.scope, true);
  if (paths.state === "invalid") return claimInvalid(asClaimFailureCode(paths.code), ...paths.errors);
  const token = await acquireLock(paths.value, prepared.lockOwnerId);
  if (token.state === "invalid") return claimInvalid(asClaimFailureCode(token.code), ...token.errors);

  let pending: PendingPacketClaimResult;
  try {
    pending = await performPacketClaim(prepared, paths.value);
  } catch (error) {
    pending = pendingInvalid("recovery_required", `Packet claim failed unexpectedly: ${error instanceof Error ? error.message : String(error)}.`);
  }
  const released = await releaseLock(token.value);
  if (released.state === "uncertain") return claimInvalid("recovery_required", ...released.errors);
  if (pending.state === "invalid") return claimInvalid(pending.code, ...pending.errors);
  if (pending.claimed) {
    return { state: "valid", value: { ...pending.value, claimStatus: "claimed", executionDisposition: "execute_once" } };
  }
  return { state: "valid", value: { ...pending.value, claimStatus: "already_claimed" } };
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
