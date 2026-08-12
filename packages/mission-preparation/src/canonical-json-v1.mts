import { createHash } from "node:crypto";
import { isProxy, isUint8Array } from "node:util/types";

export type ContractSchemaIdV1 =
  | "mission.transition-plan.v1"
  | "mission.parent-plan-review-evidence.v1"
  | "mission.transition-intent.v1"
  | "mission.fresh-authorize-wheels-up-observation.v1"
  | "mission.next-transition-selection.v1"
  | "mission.fresh-authorize-wheels-up-candidate.v1"
  | "mission.preparation-receipt.v1";

export type CanonicalContractDigestV1 = `sha256:${string}`;
export type ContractContentIdV1 = string;
export type RawReceiptSetSha256V1 = `sha256:${string}`;

export type PreparationValidationResultV1<T> =
  | Readonly<{ state: "valid"; value: T }>
  | Readonly<{
      state: "invalid";
      reasonCode: "invalid_preparation_input";
      errors: readonly string[];
    }>;

const MAX_DEPTH = 16;
const MAX_OBJECT_KEYS = 128;
const MAX_ARRAY_ITEMS = 256;
const MAX_STRING_BYTES = 4096;
const MAX_CONTRACT_BYTES = 1_048_576;
const MAX_RECEIPTS = 128;
const MAX_RECEIPT_BYTES = 1_048_576;
const MAX_RECEIPT_SET_BYTES = 16_777_216;

export const CONTENT_ID_PREFIXES: Readonly<Record<ContractSchemaIdV1, string>> = Object.freeze({
  "mission.transition-plan.v1": "transition-plan:",
  "mission.parent-plan-review-evidence.v1": "parent-plan-review-evidence:",
  "mission.transition-intent.v1": "transition-intent:",
  "mission.fresh-authorize-wheels-up-observation.v1": "fresh-authorize-wheels-up-observation:",
  "mission.next-transition-selection.v1": "next-transition-selection:",
  "mission.fresh-authorize-wheels-up-candidate.v1": "fresh-authorize-wheels-up-candidate:",
  "mission.preparation-receipt.v1": "preparation-receipt:",
});

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function invalidResult<T>(...errors: string[]): PreparationValidationResultV1<T> {
  return deepFreeze({
    state: "invalid" as const,
    reasonCode: "invalid_preparation_input" as const,
    errors: errors.length === 0 ? ["Invalid preparation input."] : errors,
  });
}

export function validResult<T>(value: T): PreparationValidationResultV1<T> {
  return deepFreeze({ state: "valid" as const, value }) as PreparationValidationResultV1<T>;
}

function ownDataEntries(value: object, array: boolean): readonly [string, unknown][] | null {
  if (isProxy(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  const expectedLength = array ? (value as unknown[]).length : keys.length;
  if (array) {
    if (!Number.isSafeInteger(expectedLength) || expectedLength > MAX_ARRAY_ITEMS || keys.length !== expectedLength + 1) return null;
  } else if (keys.length > MAX_OBJECT_KEYS) {
    return null;
  }
  const entries: [string, unknown][] = [];
  for (const key of keys) {
    if (typeof key !== "string") return null;
    if (Buffer.byteLength(key, "utf8") > MAX_STRING_BYTES) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return null;
    if (array && key === "length") {
      if (descriptor.enumerable) return null;
      continue;
    }
    if (!descriptor.enumerable) return null;
    if (array) {
      const index = entries.length;
      if (key !== String(index)) return null;
    }
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function cloneCanonical(value: unknown, depth: number, ancestors: Set<object>): unknown {
  if (depth > MAX_DEPTH) throw new TypeError("Nesting depth exceeds 16.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > MAX_STRING_BYTES) throw new TypeError("String exceeds 4096 UTF-8 bytes.");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError("Number is not finite canonical JSON data.");
    return value;
  }
  if (typeof value !== "object") throw new TypeError("Value is not canonical JSON data.");
  if (ancestors.has(value)) throw new TypeError("Cyclic data is not canonical JSON data.");
  const array = Array.isArray(value);
  const entries = ownDataEntries(value, array);
  if (entries === null) throw new TypeError("Object is not closed plain data.");
  ancestors.add(value);
  try {
    if (array) return entries.map(([, child]) => cloneCanonical(child, depth + 1, ancestors));
    const output: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      Object.defineProperty(output, key, {
        value: cloneCanonical(child, depth + 1, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function serializeCanonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${serializeCanonical(record[key])}`).join(",")}}`;
}

export function canonicalCloneV1(value: unknown): PreparationValidationResultV1<unknown> {
  try {
    const clone = cloneCanonical(value, 0, new Set<object>());
    return validResult(deepFreeze(clone));
  } catch (error) {
    return invalidResult(error instanceof Error ? error.message : "Invalid canonical JSON data.");
  }
}

export function readExactArgumentV1(value: unknown, keys: readonly string[]): PreparationValidationResultV1<Record<string, unknown>> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return invalidResult("Argument must be a closed plain-data object.");
    }
  } catch {
    return invalidResult("Argument has unexpected fields.");
  }
  let entries: readonly [string, unknown][] | null;
  try {
    entries = ownDataEntries(value, false);
  } catch {
    return invalidResult("Argument has unexpected fields.");
  }
  if (entries === null || entries.length !== keys.length || keys.some((key) => !entries.some(([actual]) => actual === key))) return invalidResult("Argument has unexpected fields.");
  const output: Record<string, unknown> = {};
  for (const [key, child] of entries) {
    const clone = canonicalCloneV1(child);
    if (clone.state === "invalid") return clone;
    Object.defineProperty(output, key, { value: clone.value, enumerable: true, configurable: true, writable: true });
  }
  return validResult(output);
}

export function canonicalJsonV1(
  input: Readonly<{ value: unknown }>,
): PreparationValidationResultV1<string> {
  const argument = readExactArgumentV1(input, ["value"]);
  if (argument.state === "invalid") return argument;
  const clone = canonicalCloneV1(argument.value.value);
  if (clone.state === "invalid") return clone;
  const canonical = serializeCanonical(clone.value);
  if (Buffer.byteLength(canonical, "utf8") > MAX_CONTRACT_BYTES) return invalidResult("Canonical body exceeds 1 MiB.");
  return validResult(canonical);
}

export function isContractSchemaIdV1(value: unknown): value is ContractSchemaIdV1 {
  return typeof value === "string" && Object.hasOwn(CONTENT_ID_PREFIXES, value);
}

export function isCanonicalDigestV1(value: unknown): value is CanonicalContractDigestV1 {
  return typeof value === "string" && /^sha256:[A-Za-z0-9_-]{43}$/.test(value);
}

export function computeCanonicalContractDigestV1(
  input: Readonly<{ schemaId: ContractSchemaIdV1; body: unknown }>,
): PreparationValidationResultV1<CanonicalContractDigestV1> {
  const argument = readExactArgumentV1(input, ["schemaId", "body"]);
  if (argument.state === "invalid") return argument;
  const { schemaId, body } = argument.value;
  if (!isContractSchemaIdV1(schemaId)) return invalidResult("Unknown contract schema ID.");
  const clone = canonicalCloneV1(body);
  if (clone.state === "invalid" || clone.value === null || typeof clone.value !== "object" || Array.isArray(clone.value)) {
    return invalidResult("Contract body must be a closed object.");
  }
  const record = clone.value as Record<string, unknown>;
  if (record.schemaId !== schemaId || Object.hasOwn(record, "id") || Object.hasOwn(record, "digest")) {
    return invalidResult("Contract body schema or digest fields are invalid.");
  }
  const canonical = serializeCanonical(record);
  if (Buffer.byteLength(canonical, "utf8") > MAX_CONTRACT_BYTES) return invalidResult("Canonical body exceeds 1 MiB.");
  const bytes = Buffer.concat([Buffer.from(schemaId, "utf8"), Buffer.from([0]), Buffer.from(canonical, "utf8")]);
  return validResult(`sha256:${createHash("sha256").update(bytes).digest("base64url")}` as CanonicalContractDigestV1);
}

export function computeContentIdV1(
  input: Readonly<{ schemaId: ContractSchemaIdV1; digest: CanonicalContractDigestV1 }>,
): PreparationValidationResultV1<ContractContentIdV1> {
  const argument = readExactArgumentV1(input, ["schemaId", "digest"]);
  if (argument.state === "invalid") return argument;
  const { schemaId, digest } = argument.value;
  if (!isContractSchemaIdV1(schemaId) || !isCanonicalDigestV1(digest)) return invalidResult("Schema ID or digest is invalid.");
  return validResult(`${CONTENT_ID_PREFIXES[schemaId]}${digest.slice("sha256:".length)}`);
}

export function computeRawReceiptSetSha256V1(
  input: Readonly<{ rawReceipts: readonly Uint8Array[] }>,
): PreparationValidationResultV1<RawReceiptSetSha256V1> {
  if (isProxy(input) || input === null || typeof input !== "object") return invalidResult("Argument must be closed plain data.");
  const entries = ownDataEntries(input, false);
  if (entries === null || entries.length !== 1 || entries[0]?.[0] !== "rawReceipts") return invalidResult("Argument has unexpected fields.");
  const rawReceipts = entries[0][1];
  if (isProxy(rawReceipts as object) || !Array.isArray(rawReceipts) || Object.getPrototypeOf(rawReceipts) !== Array.prototype) {
    return invalidResult("rawReceipts must be an ordinary array.");
  }
  const receiptEntries = ownDataEntries(rawReceipts, true);
  if (receiptEntries === null || receiptEntries.length < 1 || receiptEntries.length > MAX_RECEIPTS) {
    return invalidResult("rawReceipts cardinality is invalid.");
  }
  let total = 0;
  const copies: Buffer[] = [];
  for (const [, receipt] of receiptEntries) {
    if (receipt === null || typeof receipt !== "object" || isProxy(receipt) || !isUint8Array(receipt) || Object.getPrototypeOf(receipt) !== Uint8Array.prototype) {
      return invalidResult("Each raw receipt must be an exact Uint8Array.");
    }
    let copy: Buffer;
    try {
      copy = Buffer.from(new Uint8Array(receipt));
    } catch {
      return invalidResult("Each raw receipt must be an exact Uint8Array.");
    }
    if (copy.length < 1 || copy.length > MAX_RECEIPT_BYTES) return invalidResult("Raw receipt length is invalid.");
    total += copy.length;
    if (total > MAX_RECEIPT_SET_BYTES) return invalidResult("Raw receipt set exceeds 16 MiB.");
    copies.push(copy);
  }
  const count = Buffer.alloc(8);
  count.writeBigUInt64BE(BigInt(copies.length));
  const chunks: Buffer[] = [Buffer.from("mission.raw-receipt-set.v1", "utf8"), Buffer.from([0]), count];
  for (const copy of copies) {
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(copy.length));
    chunks.push(length, copy);
  }
  return validResult(`sha256:${createHash("sha256").update(Buffer.concat(chunks)).digest("hex")}` as RawReceiptSetSha256V1);
}

export function makeContractV1<T extends Record<string, unknown>>(schemaId: ContractSchemaIdV1, body: T): Readonly<T & { id: string; digest: CanonicalContractDigestV1 }> {
  const digestResult = computeCanonicalContractDigestV1({ schemaId, body });
  if (digestResult.state === "invalid") throw new Error("Internal contract body is invalid.");
  const idResult = computeContentIdV1({ schemaId, digest: digestResult.value });
  if (idResult.state === "invalid") throw new Error("Internal contract digest is invalid.");
  return deepFreeze({ ...body, id: idResult.value, digest: digestResult.value });
}

export function utf16CompareV1(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
