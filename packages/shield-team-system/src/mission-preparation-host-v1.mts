import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalJson } from "./mission-v2.mjs";

export const MISSION_TRANSITION_PLAN_REVIEW_SCHEMA_VERSION = 1 as const;
export const MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION = "mission.transition-plan-review.v1" as const;
export const MISSION_TRANSITION_PLAN_REVIEW_ID_PREFIX = "transition-plan-review:" as const;

const REVIEW_FIELDS = [
  "schemaVersion", "contractVersion", "authority", "reviewId", "reviewDigest", "missionId", "subjectId", "repositoryId", "planningBaseRevision", "parentPlanCommit",
  "parentPlanPath", "parentPlanRawSha256", "transitionPlanId", "transitionPlanDigest", "verdict", "reviewerSeatId", "reviewerRuntimeId", "reviewerModelId", "reviewerExecutorId",
  "reviewedArtifactId", "reviewedArtifactRevision",
] as const;
const BODY_FIELDS = REVIEW_FIELDS.filter((field) => field !== "reviewId" && field !== "reviewDigest");

const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const TRANSITION_PLAN_ID = /^transition-plan:[A-Za-z0-9_-]{43}$/u;

export interface MissionTransitionPlanReviewV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION;
  readonly reviewId: string;
  readonly reviewDigest: string;
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryId: string;
  readonly planningBaseRevision: string;
  readonly parentPlanCommit: string;
  readonly parentPlanPath: string;
  readonly parentPlanRawSha256: string;
  readonly transitionPlanId: string;
  readonly transitionPlanDigest: string;
  readonly verdict: "PASS";
  readonly reviewerSeatId: "fury";
  readonly reviewerRuntimeId: string;
  readonly reviewerModelId: string;
  readonly reviewerExecutorId: string;
  readonly reviewedArtifactId: string;
  readonly reviewedArtifactRevision: string;
  readonly authority: "none";
}

export type MissionTransitionPlanReviewInputV1 = Omit<MissionTransitionPlanReviewV1, "reviewId" | "reviewDigest">;

export type MissionTransitionPlanReviewBuildResultV1 =
  | { state: "built"; review: MissionTransitionPlanReviewV1 }
  | { state: "invalid"; code: "malformed_transition_plan_review_input" | "invalid_transition_plan_review"; errors: readonly string[] };

export type MissionTransitionPlanReviewValidationResultV1 =
  | { state: "valid"; value: MissionTransitionPlanReviewV1 }
  | { state: "invalid"; code: "invalid_transition_plan_review"; errors: readonly string[] };

type MissionTransitionPlanReviewInvalidCodeV1 = "malformed_transition_plan_review_input" | "invalid_transition_plan_review";

type Plain = Record<string, unknown>;

function plain(value: unknown): value is Plain {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function exact(value: unknown, fields: readonly string[]): value is Plain {
  if (!plain(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) return false;
  if (keys.some((key) => typeof key !== "string")) return false;
  const ownStringKeys = keys as string[];
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) return false;
  }
  for (const key of ownStringKeys) {
    if (!fields.includes(key)) return false;
  }
  return true;
}

function cloneClosedData(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) throw new TypeError("non_closed_data");

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("non_plain_array");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError("array_symbol_keys");
    if (keys.length !== value.length) throw new TypeError("array_sparsity");
    const output: unknown[] = [];
    seen.add(value);
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set) throw new TypeError("array_accessor");
      output.push(cloneClosedData(descriptor.value, seen));
    }
    seen.delete(value);
    return output;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("non_plain_data");
  const output: Plain = {};
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError("symbol_keys");
  seen.add(value);
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) throw new TypeError("object_accessor");
    output[key] = cloneClosedData(descriptor.value, seen);
  }
  seen.delete(value);
  return output;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    const keys = Array.isArray(value) ? value : Object.keys(value);
    for (const key of keys) {
      // @ts-expect-error value is ordinary closed data.
      deepFreeze(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function repository(value: unknown): value is string {
  return typeof value === "string" && REPOSITORY.test(value);
}

function revision(value: unknown): value is string {
  return typeof value === "string" && REVISION.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function transitionPlanPath(value: unknown): value is string {
  if (!identifier(value) || value.length > 1024 || value.includes("\\") || value.startsWith("/") || value.includes("%") || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function invalid(code: MissionTransitionPlanReviewInvalidCodeV1, ...errors: readonly string[]) {
  return Object.freeze({
    state: "invalid" as const,
    code,
    errors: Object.freeze(errors.length === 0 ? ["Mission transition-plan-review is invalid."] : errors),
  }) as { state: "invalid"; code: typeof code; errors: readonly string[] };
}

function dropIdentityFields(value: Record<string, unknown>): MissionTransitionPlanReviewInputV1 {
  const { reviewId: _id, reviewDigest: _digest, ...body } = value;
  return body as MissionTransitionPlanReviewInputV1;
}

export function computeMissionTransitionPlanReviewDigestV1(input: MissionTransitionPlanReviewInputV1 | MissionTransitionPlanReviewV1): string {
  const value = cloneClosedData(input);
  const body = dropIdentityFields(value as Record<string, unknown>);
  if (!plain(body) || !exact(body, BODY_FIELDS)) {
    throw new Error("Mission transition plan review body is invalid.");
  }
  if (body.schemaVersion !== 1 || body.contractVersion !== MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION || body.authority !== "none") {
    throw new Error("Mission transition plan review body is invalid.");
  }
  return `sha256:${createHash("sha256").update(`${MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION}\0${canonicalJson(body)}`).digest("base64url")}`;
}

export function computeMissionTransitionPlanReviewIdV1(input: string): string {
  if (!DIGEST.test(input)) throw new Error("Mission transition plan review digest is invalid.");
  return `${MISSION_TRANSITION_PLAN_REVIEW_ID_PREFIX}${input.slice("sha256:".length)}`;
}

function validateBody(value: MissionTransitionPlanReviewInputV1 | MissionTransitionPlanReviewV1): readonly string[] {
  const errors: string[] = [];

  if (value.schemaVersion !== 1) errors.push("schemaVersion is unsupported.");
  if (value.contractVersion !== MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION) errors.push("contractVersion is invalid.");
  if (value.authority !== "none") errors.push("authority is invalid.");
  if (!identifier(value.missionId)) errors.push("missionId is invalid.");
  if (!identifier(value.subjectId)) errors.push("subjectId is invalid.");
  if (!repository(value.repositoryId)) errors.push("repositoryId is invalid.");
  if (!revision(value.planningBaseRevision)) errors.push("planningBaseRevision is invalid.");
  if (!revision(value.parentPlanCommit)) errors.push("parentPlanCommit is invalid.");
  if (!transitionPlanPath(value.parentPlanPath)) errors.push("parentPlanPath is invalid.");
  if (!sha256(value.parentPlanRawSha256)) errors.push("parentPlanRawSha256 is invalid.");
  if (!TRANSITION_PLAN_ID.test(value.transitionPlanId)) errors.push("transitionPlanId is invalid.");
  if (!digest(value.transitionPlanDigest)) errors.push("transitionPlanDigest is invalid.");
  if (value.verdict !== "PASS") errors.push("verdict is invalid.");
  if (value.reviewerSeatId !== "fury") errors.push("reviewerSeatId is invalid.");
  if (!identifier(value.reviewerRuntimeId) || value.reviewerRuntimeId === "fury") errors.push("reviewerRuntimeId is invalid.");
  if (!identifier(value.reviewerModelId)) errors.push("reviewerModelId is invalid.");
  if (!identifier(value.reviewerExecutorId) || value.reviewerExecutorId === "fury") errors.push("reviewerExecutorId is invalid.");
  if (value.reviewerRuntimeId === value.reviewerExecutorId) errors.push("reviewerRuntimeId_and_reviewerExecutorId_must_differ");
  if (!identifier(value.reviewedArtifactId) || !TRANSITION_PLAN_ID.test(value.reviewedArtifactId)) errors.push("reviewedArtifactId is invalid.");
  if (value.reviewedArtifactId !== value.transitionPlanId) errors.push("reviewed_artifact_binding_id_mismatch");
  if (value.reviewedArtifactRevision !== value.transitionPlanDigest) errors.push("reviewed_artifact_binding_revision_mismatch");
  if (!digest(value.reviewedArtifactRevision)) errors.push("reviewedArtifactRevision is invalid.");
  return errors;
}

export function buildMissionTransitionPlanReviewV1(input: unknown): MissionTransitionPlanReviewBuildResultV1 {
  let copied: unknown;
  try {
    copied = cloneClosedData(input);
  } catch {
    return invalid("malformed_transition_plan_review_input", "Mission transition plan review input is not closed ordinary data.");
  }

  if (!exact(copied, BODY_FIELDS)) {
    return invalid("malformed_transition_plan_review_input", "Mission transition plan review input fields are not closed.");
  }

  const normalized = copied as unknown as MissionTransitionPlanReviewInputV1;
  const errors = validateBody(normalized);
  if (errors.length > 0) {
    return invalid("invalid_transition_plan_review", ...errors);
  }

  const reviewDigest = computeMissionTransitionPlanReviewDigestV1(normalized);
  const reviewId = computeMissionTransitionPlanReviewIdV1(reviewDigest);

  return {
    state: "built",
    review: deepFreeze({
      ...normalized,
      reviewDigest,
      reviewId,
      authority: "none",
      schemaVersion: MISSION_TRANSITION_PLAN_REVIEW_SCHEMA_VERSION,
      contractVersion: MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION,
    } as MissionTransitionPlanReviewV1),
  };
}

export function validateMissionTransitionPlanReviewV1(input: unknown): MissionTransitionPlanReviewValidationResultV1 {
  let copied: unknown;
  try {
    copied = cloneClosedData(input);
  } catch {
    return Object.freeze({
      state: "invalid" as const,
      code: "invalid_transition_plan_review" as const,
      errors: Object.freeze(["Mission transition plan review input is not closed ordinary data." ]),
    });
  }

  if (!exact(copied, REVIEW_FIELDS)) {
    return Object.freeze({
      state: "invalid" as const,
      code: "invalid_transition_plan_review" as const,
      errors: Object.freeze(["Mission transition plan review fields are not closed."]),
    });
  }

  const candidate = copied as unknown as MissionTransitionPlanReviewV1;
  const candidateErrors = validateBody(candidate);
  if (candidateErrors.length > 0) {
    return Object.freeze({
      state: "invalid" as const,
      code: "invalid_transition_plan_review" as const,
      errors: Object.freeze(candidateErrors),
    });
  }

  const recomputedDigest = computeMissionTransitionPlanReviewDigestV1(candidate);
  if (recomputedDigest !== candidate.reviewDigest) {
    return Object.freeze({
      state: "invalid" as const,
      code: "invalid_transition_plan_review" as const,
      errors: Object.freeze(["mission.transition-plan-review-v1 reviewDigest is invalid." ]),
    });
  }
  const recomputedId = computeMissionTransitionPlanReviewIdV1(recomputedDigest);
  if (recomputedId !== candidate.reviewId) {
    return Object.freeze({
      state: "invalid" as const,
      code: "invalid_transition_plan_review" as const,
      errors: Object.freeze(["mission.transition-plan-review-v1 reviewId is invalid." ]),
    });
  }

  return Object.freeze({
    state: "valid" as const,
    value: deepFreeze({
      ...candidate,
    }),
  });
}
