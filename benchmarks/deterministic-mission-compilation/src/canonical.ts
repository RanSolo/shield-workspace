import { createHash } from "node:crypto";

import type { ClosedReason } from "./contracts.js";
import { fail } from "./errors.js";

const encoder = new TextEncoder();
const HEX_256 = /^[0-9a-f]{64}$/u;

export function assertNoUnpairedSurrogates(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail("UNPAIRED_SURROGATE");
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) fail("UNPAIRED_SURROGATE");
  }
}

export function utf8(value: string): Uint8Array {
  assertNoUnpairedSurrogates(value);
  return encoder.encode(value);
}

export function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function fromBase64(value: string, reason: ClosedReason = "UNSAFE_VALUE"): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_000_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    fail(reason);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) fail(reason);
  return bytes;
}

function renderCanonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    assertNoUnpairedSurrogates(value);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("UNSAFE_VALUE");
    return String(value);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) fail("UNSAFE_VALUE");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || Reflect.ownKeys(value).length !== length + 1) {
      fail("SPARSE_ARRAY");
    }
    const rendered: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
        fail("ACCESSOR_FIELD");
      }
      rendered.push(renderCanonical(descriptor.value));
    }
    return `[${rendered.join(",")}]`;
  }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("UNSAFE_VALUE");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) fail("UNKNOWN_FIELD");
  const stringKeys = (keys as string[]).sort();
  return `{${stringKeys.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
      fail("ACCESSOR_FIELD");
    }
    return `${JSON.stringify(key)}:${renderCanonical(descriptor.value)}`;
  }).join(",")}}`;
}

export function canonicalBytes(value: unknown): Uint8Array {
  return utf8(`${renderCanonical(value)}\n`);
}

export function uint64be(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) fail("UNSAFE_VALUE");
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), false);
  return bytes;
}

export function domainDigest(domain: string, payload: Uint8Array): string {
  const domainBytes = utf8(domain);
  return createHash("sha256")
    .update(domainBytes)
    .update(uint64be(payload.byteLength))
    .update(payload)
    .digest("hex");
}

export function assertDigest(value: string): void {
  if (!HEX_256.test(value)) fail("UNSAFE_VALUE");
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function closedRecord(
  input: unknown,
  fields: readonly string[],
): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype) fail("INVALID_CANDIDATE");
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== "string")) fail("UNKNOWN_FIELD");
  const stringKeys = keys as string[];
  if (stringKeys.some((key) => !fields.includes(key))) fail("UNKNOWN_FIELD");
  if (fields.some((field) => !stringKeys.includes(field))) fail("MISSING_FIELD");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
      fail("ACCESSOR_FIELD");
    }
    output[field] = descriptor.value;
  }
  return Object.freeze(output);
}

export function denseArray(input: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    fail("INVALID_CANDIDATE");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const length = Object.getOwnPropertyDescriptor(input, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum) fail("EXCESSIVE_VALUE");
  if (Reflect.ownKeys(input).length !== length + 1) fail("SPARSE_ARRAY");
  const output: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
      fail("ACCESSOR_FIELD");
    }
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}

export function boundedString(input: unknown, maximum = 256): string {
  if (typeof input !== "string") fail("INVALID_CANDIDATE");
  assertNoUnpairedSurrogates(input);
  if (utf8(input).byteLength < 1 || utf8(input).byteLength > maximum) fail("EXCESSIVE_VALUE");
  return input;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
    }
    Object.freeze(value);
  }
  return value;
}
