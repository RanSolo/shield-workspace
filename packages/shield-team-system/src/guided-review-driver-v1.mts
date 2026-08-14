import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalJson } from "./mission-v2.mjs";

export const GUIDED_REVIEW_DRIVER_CONTRACT_VERSION = "guided.review.driver.v1" as const;
export const GUIDED_REVIEW_DRIVER_STATUSES = ["ready", "blocked", "interrupted", "unavailable"] as const;
export const GUIDED_REVIEW_DRIVER_EFFECT_CLASSES = ["read_only", "bounded_local_write", "external_effect"] as const;

export interface GuidedReviewDriverReceiptInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_DRIVER_CONTRACT_VERSION;
  readonly driverId: string;
  readonly driverVersion: string;
  readonly executorRef: string;
  readonly exactRevision: string;
  readonly environmentRef: string;
  readonly status: (typeof GUIDED_REVIEW_DRIVER_STATUSES)[number];
  readonly capabilities: readonly string[];
  readonly scenarioRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly effectClass: (typeof GUIDED_REVIEW_DRIVER_EFFECT_CLASSES)[number];
  readonly detail: string;
}

export interface GuidedReviewDriverReceiptV1 extends GuidedReviewDriverReceiptInputV1 {
  readonly receiptDigest: string;
}

export type GuidedReviewDriverResultV1<T> =
  | Readonly<{ state: "ready"; value: T }>
  | Readonly<{ state: "invalid"; code: string; errors: readonly string[] }>;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function revision(value: unknown): value is string { return typeof value === "string" && REVISION.test(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 4000; }
function strings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 256 && value.every(id) && new Set(value).size === value.length;
}
function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`;
}
function snapshot<T>(value: T): T {
  const output = JSON.parse(canonicalJson(value)) as T;
  const freeze = (candidate: unknown): void => {
    if (candidate !== null && typeof candidate === "object") {
      for (const child of Object.values(candidate)) freeze(child);
      Object.freeze(candidate);
    }
  };
  freeze(output);
  return output;
}

function validInput(value: unknown): value is GuidedReviewDriverReceiptInputV1 {
  return exact(value, ["schemaVersion", "contractVersion", "driverId", "driverVersion", "executorRef", "exactRevision", "environmentRef", "status", "capabilities", "scenarioRefs", "evidenceRefs", "effectClass", "detail"]) &&
    value.schemaVersion === 1 && value.contractVersion === GUIDED_REVIEW_DRIVER_CONTRACT_VERSION && id(value.driverId) && id(value.driverVersion) &&
    id(value.executorRef) && revision(value.exactRevision) && id(value.environmentRef) &&
    GUIDED_REVIEW_DRIVER_STATUSES.includes(value.status as never) && strings(value.capabilities) && strings(value.scenarioRefs) && strings(value.evidenceRefs) &&
    GUIDED_REVIEW_DRIVER_EFFECT_CLASSES.includes(value.effectClass as never) && text(value.detail);
}

export function createGuidedReviewDriverReceiptV1(input: unknown): GuidedReviewDriverResultV1<GuidedReviewDriverReceiptV1> {
  if (!validInput(input)) return { state: "invalid", code: "MALFORMED_DRIVER_RECEIPT", errors: ["Guided Review driver receipt is malformed or not closed."] };
  const body = snapshot(input);
  return { state: "ready", value: snapshot({ ...body, receiptDigest: digest(body) }) };
}

export function validateGuidedReviewDriverReceiptV1(input: unknown): GuidedReviewDriverResultV1<GuidedReviewDriverReceiptV1> {
  if (!plain(input) || !Object.hasOwn(input, "receiptDigest") || typeof input.receiptDigest !== "string" || !DIGEST.test(input.receiptDigest)) {
    return { state: "invalid", code: "MALFORMED_DRIVER_RECEIPT", errors: ["Guided Review driver receipt digest is absent or malformed."] };
  }
  const { receiptDigest, ...body } = input;
  if (!validInput(body) || digest(body) !== receiptDigest) {
    return { state: "invalid", code: "MALFORMED_DRIVER_RECEIPT", errors: ["Guided Review driver receipt shape or digest is invalid."] };
  }
  return { state: "ready", value: snapshot(input as unknown as GuidedReviewDriverReceiptV1) };
}
