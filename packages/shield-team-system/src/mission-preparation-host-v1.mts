import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isProxy } from "node:util/types";

import { canonicalJson } from "./mission-v2.mjs";
import {
  computeCanonicalContractDigestV1,
  computeContentIdV1,
  computeRawReceiptSetSha256V1,
  prepareMissionTransitionV1,
  validateFreshAuthorizeWheelsUpObservationV1,
  validateParentPlanReviewEvidenceV1,
  validateTransitionIntentV1,
  validateTransitionPlanV1,
  type ParentPlanReviewEvidenceV1,
  type TransitionIntentV1,
  type TransitionPlanV1,
  type FreshAuthorizeWheelsUpObservationV1,
  type FreshAuthorizeWheelsUpCandidateV1,
  type PreparationReceiptV1,
} from "@shield/mission-preparation";
import {
  buildMissionReviewedTransitionGraphV1,
  materializeMissionReviewedTransitionGraphV1,
  readMissionReviewedTransitionGraphV1,
  type MissionReviewedTransitionGraphMaterializationResultV1,
} from "./mission-preparation-store-v1.mjs";
import { readSeatDispatchReceiptLedgerSnapshotV1 } from "./seat-dispatch-store.mjs";
import {
  evaluateSeatDispatchAttributionV1,
  replaySeatDispatchReceiptsV1,
  type SeatDispatchReceiptIdentityV1,
  type SeatDispatchReceiptProjectionV1,
} from "./seat-dispatch-receipt-v1.mjs";
import { parseShieldConfig, type ShieldConfig } from "./config.mjs";
import {
  observeAuthorizeWheelsUpEnvironmentV1,
  validateAuthorizeWheelsUpInput,
  type AuthorizeWheelsUpEnvironmentObservationV1,
} from "./authorize-wheels-up-executor-v1.mjs";
import { journalByteSha256 } from "./mission-store.mjs";

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
const REVIEW_BINDING_FIELDS = [
  "schemaVersion",
  "missionId",
  "subjectId",
  "repositoryId",
  "planningBaseRevision",
  "parentPlanCommit",
  "parentPlanPath",
  "parentPlanRawSha256",
  "transitionPlanId",
  "transitionPlanDigest",
  "reviewedArtifactId",
  "reviewedArtifactRevision",
] as const;
const MATERIALIZATION_FIELDS = [
  "missionId",
  "repositoryRoot",
  "transitionPlan",
  "reviewArtifact",
  "expectedBinding",
  "dispatchIdentity",
] as const;

export interface MissionTransitionPlanReviewExpectedBindingV1 {
  readonly schemaVersion: 1;
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryId: string;
  readonly planningBaseRevision: string;
  readonly parentPlanCommit: string;
  readonly parentPlanPath: string;
  readonly parentPlanRawSha256: string;
  readonly transitionPlanId: string;
  readonly transitionPlanDigest: string;
  readonly reviewedArtifactId: string;
  readonly reviewedArtifactRevision: string;
}

export interface MaterializeReviewedMissionTransitionInputV1 {
  readonly missionId: string;
  readonly repositoryRoot: string;
  readonly transitionPlan: TransitionPlanV1;
  readonly reviewArtifact: MissionTransitionPlanReviewV1;
  readonly expectedBinding: MissionTransitionPlanReviewExpectedBindingV1;
  readonly dispatchIdentity: SeatDispatchReceiptIdentityV1;
}

type MaterializeReviewedMissionTransitionInvalidCodeV1 =
  | "invalid_materialization_input"
  | "invalid_transition_plan"
  | "invalid_review_artifact"
  | "invalid_expected_binding"
  | "invalid_dispatch_identity"
  | "invalid_receipt_snapshot"
  | "invalid_receipt_replay"
  | "invalid_attribution"
  | "invalid_output_evidence_refs"
  | "reviewer_projection_mismatch"
  | "reviewer_declaration_mismatch"
  | "parent_review_derivation_failed"
  | "transition_intent_derivation_failed"
  | "raw_receipt_set_digest_failed";

export type MaterializeReviewedMissionTransitionResultV1 =
  | MissionReviewedTransitionGraphMaterializationResultV1
  | {
      readonly state: "invalid";
      readonly code: MaterializeReviewedMissionTransitionInvalidCodeV1;
      readonly errors: readonly string[];
    };

type MaterializeReviewedMissionTransitionInvalidV1 = Extract<MaterializeReviewedMissionTransitionResultV1, { readonly state: "invalid" }>;

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

function materializeInvalid(code: MaterializeReviewedMissionTransitionInvalidCodeV1, ...errors: readonly string[]): MaterializeReviewedMissionTransitionResultV1 {
  return Object.freeze({
    state: "invalid" as const,
    code,
    errors: Object.freeze(errors.length === 0 ? ["Mission transition review materialization is invalid."] : errors),
  });
}

function normalizeExpectedBinding(input: unknown): MissionTransitionPlanReviewExpectedBindingV1 | null {
  if (!plain(input) || !exact(input, REVIEW_BINDING_FIELDS)) return null;
  const candidate = input as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || !identifier(candidate.missionId) || !identifier(candidate.subjectId) ||
    !repository(candidate.repositoryId) || !revision(candidate.planningBaseRevision) || !revision(candidate.parentPlanCommit) ||
    !transitionPlanPath(candidate.parentPlanPath) || !SHA256.test(candidate.parentPlanRawSha256 as string) ||
    !TRANSITION_PLAN_ID.test(candidate.transitionPlanId as string) || !digest(candidate.transitionPlanDigest) ||
    !TRANSITION_PLAN_ID.test(candidate.reviewedArtifactId as string) || !digest(candidate.reviewedArtifactRevision)) {
    return null;
  }
  return candidate as unknown as MissionTransitionPlanReviewExpectedBindingV1;
}

function finalObservedProjection(projection: SeatDispatchReceiptProjectionV1): { runtimeId: string; model: string; executorId: string } | null {
  const runtime = projection.runtimeHostHistory.at(-1);
  const executor = projection.executorHostHistory.at(-1);
  if (!runtime || !executor) return null;
  if (!identifier(runtime.runtimeId) || !identifier(runtime.model) || !identifier(executor.executorId)) return null;
  if (runtime.runtimeId === executor.executorId || runtime.runtimeId === "fury" || executor.executorId === "fury") return null;
  return {
    runtimeId: runtime.runtimeId,
    model: runtime.model,
    executorId: executor.executorId,
  };
}

function outputEvidenceRefsBound(review: MissionTransitionPlanReviewV1, outputEvidenceRefs: readonly string[]): boolean {
  return [review.reviewId, review.reviewDigest, review.reviewedArtifactId, review.reviewedArtifactRevision]
    .every((expected) => outputEvidenceRefs.includes(expected));
}

function deriveBindingErrors(review: MissionTransitionPlanReviewV1, transitionPlan: TransitionPlanV1, binding: MissionTransitionPlanReviewExpectedBindingV1): readonly string[] {
  const errors: string[] = [];
  if (review.missionId !== transitionPlan.missionId || transitionPlan.missionId !== binding.missionId) {
    errors.push("mission_binding_mismatch");
  }
  if (review.subjectId !== transitionPlan.subjectId || transitionPlan.subjectId !== binding.subjectId) {
    errors.push("subject_binding_mismatch");
  }
  if (review.repositoryId !== transitionPlan.repositoryId || transitionPlan.repositoryId !== binding.repositoryId) {
    errors.push("repository_binding_mismatch");
  }
  if (review.planningBaseRevision !== transitionPlan.planningBaseRevision || transitionPlan.planningBaseRevision !== binding.planningBaseRevision) {
    errors.push("planning_base_revision_binding_mismatch");
  }
  if (review.parentPlanCommit !== transitionPlan.parentPlanCommit || review.parentPlanCommit !== binding.parentPlanCommit) {
    errors.push("parent_plan_commit_binding_mismatch");
  }
  if (review.parentPlanPath !== transitionPlan.parentPlanPath || review.parentPlanPath !== binding.parentPlanPath) {
    errors.push("parent_plan_path_binding_mismatch");
  }
  if (review.parentPlanRawSha256 !== transitionPlan.parentPlanRawSha256 || review.parentPlanRawSha256 !== binding.parentPlanRawSha256) {
    errors.push("parent_plan_sha_binding_mismatch");
  }
  if (review.transitionPlanId !== transitionPlan.id || review.transitionPlanId !== binding.transitionPlanId) {
    errors.push("transition_plan_id_binding_mismatch");
  }
  if (review.transitionPlanDigest !== transitionPlan.digest || review.transitionPlanDigest !== binding.transitionPlanDigest) {
    errors.push("transition_plan_digest_binding_mismatch");
  }
  if (review.reviewedArtifactId !== transitionPlan.id || review.reviewedArtifactId !== binding.reviewedArtifactId) {
    errors.push("reviewed_artifact_id_binding_mismatch");
  }
  if (review.reviewedArtifactRevision !== transitionPlan.digest || review.reviewedArtifactRevision !== binding.reviewedArtifactRevision) {
    errors.push("reviewed_artifact_revision_binding_mismatch");
  }
  return errors;
}

type DerivedParentPlanReviewV1 = { state: "valid"; value: ParentPlanReviewEvidenceV1 } | MaterializeReviewedMissionTransitionInvalidV1;

function deriveParentPlanReview(input: {
  review: MissionTransitionPlanReviewV1;
  projection: SeatDispatchReceiptProjectionV1;
  rawReceiptSetSha256: string;
}): DerivedParentPlanReviewV1 {
  const observed = finalObservedProjection(input.projection);
  if (observed === null) {
    return materializeInvalid("reviewer_projection_mismatch", "Projection runtime or executor host evidence is missing.") as MaterializeReviewedMissionTransitionInvalidV1;
  }
  if (input.review.reviewerRuntimeId !== observed.runtimeId || input.review.reviewerModelId !== observed.model || input.review.reviewerExecutorId !== observed.executorId) {
    return materializeInvalid("reviewer_declaration_mismatch", "Reviewed declaration runtime/model/executor does not match attributed host observation.") as MaterializeReviewedMissionTransitionInvalidV1;
  }
  const body = {
    schemaId: "mission.parent-plan-review-evidence.v1",
    authority: "none" as const,
    repositoryId: input.review.repositoryId,
    planningBaseRevision: input.review.planningBaseRevision,
    parentPlanCommit: input.review.parentPlanCommit,
    parentPlanPath: input.review.parentPlanPath,
    parentPlanRawSha256: input.review.parentPlanRawSha256,
    transitionPlanId: input.review.transitionPlanId,
    transitionPlanDigest: input.review.transitionPlanDigest,
    verdict: input.review.verdict,
    reviewerSeatId: input.review.reviewerSeatId,
    reviewerRuntimeId: input.review.reviewerRuntimeId,
    reviewerModelId: input.review.reviewerModelId,
    reviewerExecutorId: input.review.reviewerExecutorId,
    rawReceiptSetSha256: input.rawReceiptSetSha256,
    attributionClass: "team_system_projection" as const,
    preparationEligibility: "preparationEligible" as const,
  };
  const digest = computeCanonicalContractDigestV1({
    schemaId: "mission.parent-plan-review-evidence.v1",
    body,
  });
  if (digest.state === "invalid") {
    return materializeInvalid("parent_review_derivation_failed", ...digest.errors) as MaterializeReviewedMissionTransitionInvalidV1;
  }
  const id = computeContentIdV1({
    schemaId: "mission.parent-plan-review-evidence.v1",
    digest: digest.value,
  });
  if (id.state === "invalid") {
    return materializeInvalid("parent_review_derivation_failed", ...id.errors) as MaterializeReviewedMissionTransitionInvalidV1;
  }
  const candidate = {
    ...body,
    id: id.value,
    digest: digest.value,
  };
  const validated = validateParentPlanReviewEvidenceV1({ artifact: candidate });
  if (validated.state === "invalid") {
    return materializeInvalid("parent_review_derivation_failed", ...validated.errors) as MaterializeReviewedMissionTransitionInvalidV1;
  }
  return {
    state: "valid" as const,
    value: validated.value,
  };
}

type DerivedTransitionIntentV1 = { state: "valid"; value: TransitionIntentV1 } | MaterializeReviewedMissionTransitionInvalidV1;

function deriveTransitionIntent(plan: TransitionPlanV1, review: ParentPlanReviewEvidenceV1): DerivedTransitionIntentV1 {
  const body = {
    schemaId: "mission.transition-intent.v1" as const,
    authority: "none" as const,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    parentReviewEvidenceId: review.id,
    parentReviewEvidenceDigest: review.digest,
    transitionKind: "fresh_authorize_wheels_up" as const,
    preparationEligibility: "preparationEligible" as const,
  };
  const digest = computeCanonicalContractDigestV1({
    schemaId: "mission.transition-intent.v1",
    body,
  });
  if (digest.state === "invalid") {
    return materializeInvalid("transition_intent_derivation_failed", ...digest.errors) as MaterializeReviewedMissionTransitionInvalidV1;
  }
  const id = computeContentIdV1({
    schemaId: "mission.transition-intent.v1",
    digest: digest.value,
  });
  if (id.state === "invalid") {
    return materializeInvalid("transition_intent_derivation_failed", ...id.errors) as MaterializeReviewedMissionTransitionInvalidV1;
  }
  const validated = validateTransitionIntentV1({
    artifact: {
      ...body,
      id: id.value,
      digest: digest.value,
    },
  });
  if (validated.state === "invalid") {
    return materializeInvalid("transition_intent_derivation_failed", ...validated.errors) as MaterializeReviewedMissionTransitionInvalidV1;
  }
  return {
    state: "valid" as const,
    value: validated.value,
  };
}

function validDispatchIdentity(candidate: unknown): candidate is SeatDispatchReceiptIdentityV1 {
  const fields = [
    "receiptId",
    "dispatchId",
    "parentMissionId",
    "parentMissionRevision",
    "parentSessionId",
    "repositoryRevision",
    "childTaskId",
    "childSessionId",
    "accountableSeatId",
    "repositoryId",
    "repositoryWorkspaceId",
    "subjectId",
    "subjectRevision",
    "artifactId",
    "artifactRevision",
    "configuredRuntime",
    "requestedRuntime",
    "toolExecution",
    "runtimeSelfReport",
    "runtimeHostObserved",
    "executorSelfReport",
    "executorHostObserved",
    "timestamp",
    "logSequence",
    "previousLogDigest",
    "lifecycleSequence",
    "previousLifecycleDigest",
  ] as const;
  if (!plain(candidate) || !exact(candidate, fields)) {
    return false;
  }

  const value = candidate as Record<string, unknown>;
  const matches = {
    accountable: value.accountableSeatId === "fury",
    receipt: identifier(value.receiptId),
    dispatch: identifier(value.dispatchId),
    parentMission: identifier(value.parentMissionId),
    parentMissionRevision: revision(value.parentMissionRevision),
    parentSession: identifier(value.parentSessionId),
    childTask: identifier(value.childTaskId),
    childSession: identifier(value.childSessionId),
    repository: repository(value.repositoryId),
    repositoryWorkspace: identifier(value.repositoryWorkspaceId),
    repositoryRevision: revision(value.repositoryRevision),
    subject: identifier(value.subjectId),
    subjectRevision: revision(value.subjectRevision),
    artifact: TRANSITION_PLAN_ID.test(typeof value.artifactId === "string" ? value.artifactId : ""),
    revision: digest(typeof value.artifactRevision === "string" ? value.artifactRevision : ""),
  };
  if (!Object.values(matches).every((value) => value)) {
    return false;
  }
  if (!identifier(value.receiptId) || !identifier(value.dispatchId) || !identifier(value.parentMissionId) || !revision(value.parentMissionRevision) ||
    !identifier(value.parentSessionId) || !identifier(value.childTaskId) || !identifier(value.childSessionId) ||
    !repository(value.repositoryId) || !identifier(value.repositoryWorkspaceId) || !revision(value.repositoryRevision) ||
    !identifier(value.subjectId) || !revision(value.subjectRevision) ||
    !TRANSITION_PLAN_ID.test(typeof value.artifactId === "string" ? value.artifactId : "") ||
    !digest(typeof value.artifactRevision === "string" ? value.artifactRevision : "")) {
    return false;
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
    const allowed = new Set(["length", ...Array.from({ length: value.length }, (_unused, index) => String(index))]);
    if (keys.some((key) => !allowed.has(key as string))) throw new TypeError("array_sparsity");
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

export async function materializeReviewedMissionTransitionV1(
  input: unknown,
): Promise<MaterializeReviewedMissionTransitionResultV1> {
  let copied: unknown;
  try {
    copied = cloneClosedData(input);
  } catch {
    return materializeInvalid("invalid_materialization_input", "Materialization input is not closed ordinary data.");
  }

  if (!exact(copied, MATERIALIZATION_FIELDS)) {
    return materializeInvalid("invalid_materialization_input", "Materialization input fields are not closed.");
  }

  const value = copied as unknown as MaterializeReviewedMissionTransitionInputV1;
  if (!identifier(value.missionId)
    || value.missionId !== value.transitionPlan.missionId
    || value.missionId !== value.dispatchIdentity.parentMissionId
    || !validDispatchIdentity(value.dispatchIdentity)) {
    return materializeInvalid("invalid_materialization_input", "Materialization mission id or dispatch identity is invalid.");
  }
  if (typeof value.repositoryRoot !== "string" || value.repositoryRoot.length === 0) {
    return materializeInvalid("invalid_materialization_input", "Materialization repositoryRoot is invalid.");
  }

  const transitionPlan = validateTransitionPlanV1({ artifact: value.transitionPlan });
  if (transitionPlan.state === "invalid") {
    return materializeInvalid("invalid_transition_plan", ...transitionPlan.errors);
  }

  const review = validateMissionTransitionPlanReviewV1(value.reviewArtifact);
  if (review.state === "invalid") {
    return materializeInvalid("invalid_review_artifact", ...review.errors);
  }

  const expectedBinding = normalizeExpectedBinding(value.expectedBinding);
  if (expectedBinding === null) {
    return materializeInvalid("invalid_expected_binding", "Expected binding is invalid.");
  }
  const bindingErrors = deriveBindingErrors(review.value, transitionPlan.value, expectedBinding);
  if (bindingErrors.length > 0) {
    return materializeInvalid("invalid_expected_binding", ...bindingErrors);
  }

  const snapshot = await readSeatDispatchReceiptLedgerSnapshotV1({
    repositoryRoot: value.repositoryRoot,
    repositoryId: value.dispatchIdentity.repositoryId,
    repositoryWorkspaceId: value.dispatchIdentity.repositoryWorkspaceId,
  });

  if (snapshot.state === "invalid") {
    return materializeInvalid("invalid_receipt_snapshot", ...snapshot.errors);
  }

  const replay = replaySeatDispatchReceiptsV1(snapshot.value.entries);
  if (replay.state === "invalid") {
    return materializeInvalid("invalid_receipt_replay", replay.code);
  }

  const attribution = evaluateSeatDispatchAttributionV1({
    ...value.dispatchIdentity,
    artifact: review.value,
    replayResult: replay,
  });
  if (attribution.state === "unattributed") {
    return materializeInvalid("invalid_attribution", ...attribution.reasonCodes);
  }

  if (attribution.receipt.state !== "completed") {
    return materializeInvalid("invalid_attribution", `Receipt lifecycle was ${attribution.receipt.state}, expected completed.`);
  }
  if (!outputEvidenceRefsBound(review.value, attribution.receipt.outputEvidenceRefs ?? [])) {
    return materializeInvalid("invalid_output_evidence_refs", "Terminal receipt output evidence does not bind review artifact references.");
  }

  const selectedRawReceipts = snapshot.value.rawEntryBytes.filter((_, index) => snapshot.value.entries[index]?.receiptId === attribution.receipt.receiptId);
  if (selectedRawReceipts.length === 0) {
    return materializeInvalid("invalid_attribution", "Attributed receipt did not include raw ledger entries.");
  }
  const rawReceiptSet = computeRawReceiptSetSha256V1({ rawReceipts: selectedRawReceipts });
  if (rawReceiptSet.state === "invalid") {
    return materializeInvalid("raw_receipt_set_digest_failed", ...rawReceiptSet.errors);
  }

  const parentPlanReview = deriveParentPlanReview({
    review: review.value,
    projection: attribution.receipt,
    rawReceiptSetSha256: rawReceiptSet.value,
  });
  if (parentPlanReview.state === "invalid") {
    return parentPlanReview;
  }
  const parentPlanReviewValue = parentPlanReview.value;

  const transitionIntent = deriveTransitionIntent(transitionPlan.value, parentPlanReviewValue);
  if (transitionIntent.state === "invalid") {
    return transitionIntent;
  }
  const transitionIntentValue = transitionIntent.value;

  const graph = buildMissionReviewedTransitionGraphV1({
    transitionPlan: transitionPlan.value,
    parentPlanReviewEvidence: parentPlanReviewValue,
    transitionIntent: transitionIntentValue,
  });
  if (graph.state === "invalid") {
    return materializeInvalid("invalid_transition_plan", ...graph.errors);
  }

  const materialization = await materializeMissionReviewedTransitionGraphV1({
    repositoryRoot: value.repositoryRoot,
    graph: graph.graph,
  });
  if (materialization.state === "invalid") {
    return materializeInvalid("invalid_materialization_input", ...materialization.errors);
  }

  return materialization as MaterializeReviewedMissionTransitionResultV1;
}

export type ResolvePreparedMissionTransitionResultV1 = Readonly<
  | {
      state: "ready";
      missionId: string;
      candidate: FreshAuthorizeWheelsUpCandidateV1;
      observation: FreshAuthorizeWheelsUpObservationV1;
      preparationReceipt: PreparationReceiptV1;
    }
  | {
      state: "blocked";
      missionId: string;
      reasonCode: string;
      errors: readonly string[];
    }
  | {
      schemaVersion: 1;
      state: "already_authorized";
      missionId: string;
      missionRevisionId: string;
      headRevision: string;
      endingJournalSequence: number;
      authorizationManifestDigest: string;
    }
>;

function blocked(missionId: string, reasonCode: string, ...errors: readonly string[]): ResolvePreparedMissionTransitionResultV1 {
  return deepFreeze({
    state: "blocked" as const,
    missionId,
    reasonCode,
    errors: errors.length === 0 ? [reasonCode] : [...errors],
  });
}

function dispatchIdentityFromEvent(event: Record<string, unknown>): SeatDispatchReceiptIdentityV1 | null {
  const fields = [
    "receiptId", "dispatchId", "parentMissionId", "parentMissionRevision", "parentSessionId", "repositoryRevision",
    "childTaskId", "childSessionId", "accountableSeatId", "repositoryId", "repositoryWorkspaceId", "subjectId",
    "subjectRevision", "artifactId", "artifactRevision", "configuredRuntime", "requestedRuntime", "toolExecution",
    "runtimeSelfReport", "runtimeHostObserved", "executorSelfReport", "executorHostObserved", "timestamp", "logSequence",
    "previousLogDigest", "lifecycleSequence", "previousLifecycleDigest",
  ] as const;
  const candidate = Object.fromEntries(fields.map((field) => [field, event[field]]));
  return validDispatchIdentity(candidate) ? candidate : null;
}

async function dispatchSnapshotForRepository(repositoryRoot: string, repositoryId: string) {
  const path = join(resolve(repositoryRoot), ".shield", "dispatch-receipts.jsonl");
  let bytes: string;
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("Dispatch ledger is not a regular file.");
    bytes = await readFile(path, "utf8");
  } catch (error) {
    return { state: "invalid" as const, errors: [error instanceof Error ? error.message : "Dispatch ledger is unavailable."] };
  }
  const firstLine = bytes.endsWith("\n") ? bytes.slice(0, -1).split("\n")[0] : "";
  let first: unknown;
  try { first = JSON.parse(firstLine); } catch { return { state: "invalid" as const, errors: ["Dispatch ledger has no canonical first entry."] }; }
  if (!plain(first) || first.repositoryId !== repositoryId || !identifier(first.repositoryWorkspaceId)) {
    return { state: "invalid" as const, errors: ["Dispatch ledger repository scope is invalid."] };
  }
  return readSeatDispatchReceiptLedgerSnapshotV1({ repositoryRoot, repositoryId, repositoryWorkspaceId: first.repositoryWorkspaceId });
}

export async function resolveSeatDispatchIdentityByReceiptIdV1(input: {
  readonly repositoryRoot: string;
  readonly repositoryId: string;
  readonly receiptId: string;
}): Promise<Readonly<{ state: "resolved"; identity: SeatDispatchReceiptIdentityV1 } | { state: "invalid"; errors: readonly string[] }>> {
  const snapshot = await dispatchSnapshotForRepository(input.repositoryRoot, input.repositoryId);
  if (snapshot.state === "invalid") return Object.freeze({ state: "invalid", errors: Object.freeze([...snapshot.errors]) });
  const starts = snapshot.value.entries.filter((entry) => entry.kind === "dispatch.started" && entry.receiptId === input.receiptId);
  if (starts.length !== 1) return Object.freeze({ state: "invalid", errors: Object.freeze(["Named dispatch receipt does not have exactly one start entry."]) });
  const identity = dispatchIdentityFromEvent(starts[0] as unknown as Record<string, unknown>);
  if (identity === null) return Object.freeze({ state: "invalid", errors: Object.freeze(["Named dispatch receipt identity is invalid."]) });
  return Object.freeze({ state: "resolved", identity });
}

async function readConfig(repositoryRoot: string): Promise<ShieldConfig | null> {
  try {
    const path = join(resolve(repositoryRoot), ".shield", "config.json");
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) return null;
    const parsed = parseShieldConfig(await readFile(path, "utf8"));
    return parsed.state === "valid" ? parsed.value : null;
  } catch {
    return null;
  }
}

function buildObservation(
  graph: import("./mission-preparation-store-v1.mjs").MissionReviewedTransitionGraphV1,
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
): FreshAuthorizeWheelsUpObservationV1 | null {
  const current = environment.current.projection;
  const repository = environment.repository;
  const body = {
    schemaId: "mission.fresh-authorize-wheels-up-observation.v1" as const,
    authority: "none" as const,
    missionId: graph.transitionPlan.missionId,
    subjectId: graph.transitionPlan.subjectId,
    repositoryId: graph.transitionPlan.repositoryId,
    canonicalRoot: repository.canonicalRoot,
    branch: repository.branch,
    planningBaseRevision: graph.transitionPlan.planningBaseRevision,
    baseRevision: repository.baseRevision,
    headRevision: repository.headRevision,
    baseAncestor: repository.baseAncestor,
    workspaceClean: repository.statusEntries.length === 0,
    changedPaths: [...repository.changedPaths],
    symlinkPaths: [...environment.symlinkPaths],
    gitlinkPaths: [...environment.gitlinkPaths],
    missionSchemaVersion: current.schemaVersion,
    authorizationState: current.authorization,
    implementationAuthorityState: current.implementationAuthorityState,
    finalAcceptanceState: current.finalAcceptance,
    executionState: current.execution,
    implementationAuthorityCount: current.implementationAuthority === null ? 0 : 1,
    runtimeBindingCount: current.runtimeBindings.length,
    activeRuntimeBindingCount: current.activeRuntimeBindings.length,
    publicationAuthorizationCount: current.publicationAuthorizations.length,
    pendingCoulsonMissionAuthorizationCount: environment.pendingCoulsonMissionAuthorizationCount,
    journalSequence: current.lastSequence,
    journalSha256: environment.journalSha256,
    signerBindingId: environment.binding.bindingId,
    signingKeyRef: environment.binding.signingKeyRef,
    signerBindingMatchCount: environment.signerBindingMatchCount,
    remainingHumanGates: [...environment.remainingHumanGates],
    preparationEligibility: "preparationEligible" as const,
  };
  const computed = computeCanonicalContractDigestV1({ schemaId: body.schemaId, body });
  if (computed.state === "invalid") return null;
  const contentId = computeContentIdV1({ schemaId: body.schemaId, digest: computed.value });
  if (contentId.state === "invalid") return null;
  const checked = validateFreshAuthorizeWheelsUpObservationV1({ artifact: { ...body, id: contentId.value, digest: computed.value } });
  return checked.state === "valid" ? checked.value : null;
}

function reconstructedReview(graph: import("./mission-preparation-store-v1.mjs").MissionReviewedTransitionGraphV1): MissionTransitionPlanReviewV1 | null {
  const plan = graph.transitionPlan;
  const review = graph.parentPlanReviewEvidence;
  const built = buildMissionTransitionPlanReviewV1({
    schemaVersion: 1,
    contractVersion: MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION,
    authority: "none",
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    parentPlanCommit: plan.parentPlanCommit,
    parentPlanPath: plan.parentPlanPath,
    parentPlanRawSha256: plan.parentPlanRawSha256,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    verdict: "PASS",
    reviewerSeatId: "fury",
    reviewerRuntimeId: review.reviewerRuntimeId,
    reviewerModelId: review.reviewerModelId,
    reviewerExecutorId: review.reviewerExecutorId,
    reviewedArtifactId: plan.id,
    reviewedArtifactRevision: plan.digest,
  });
  return built.state === "built" ? built.review : null;
}

async function revalidateStoredAttribution(
  repositoryRoot: string,
  graph: import("./mission-preparation-store-v1.mjs").MissionReviewedTransitionGraphV1,
): Promise<readonly string[]> {
  const review = reconstructedReview(graph);
  if (review === null) return ["Stored Fury review could not be reconstructed."];
  const snapshot = await dispatchSnapshotForRepository(repositoryRoot, graph.transitionPlan.repositoryId);
  if (snapshot.state === "invalid") return snapshot.errors;
  const replay = replaySeatDispatchReceiptsV1(snapshot.value.entries);
  if (replay.state === "invalid") return [`Dispatch replay failed: ${replay.code}.`];
  const matching = replay.projections.filter((projection) =>
    projection.parentMissionId === graph.transitionPlan.missionId &&
    projection.artifactId === graph.transitionPlan.id &&
    projection.artifactRevision === graph.transitionPlan.digest &&
    projection.accountableSeatId === "fury" &&
    projection.state === "completed" &&
    outputEvidenceRefsBound(review, projection.outputEvidenceRefs ?? []));
  const bound = matching.filter((projection) => {
    const raws = snapshot.value.rawEntryBytes.filter((_, index) => snapshot.value.entries[index]?.receiptId === projection.receiptId);
    const digestResult = computeRawReceiptSetSha256V1({ rawReceipts: raws });
    return digestResult.state === "valid" && digestResult.value === graph.parentPlanReviewEvidence.rawReceiptSetSha256;
  });
  if (bound.length !== 1) return ["Stored Fury attribution no longer resolves to exactly one raw receipt set."];
  const start = snapshot.value.entries.find((entry) => entry.kind === "dispatch.started" && entry.receiptId === bound[0].receiptId);
  const identity = start === undefined ? null : dispatchIdentityFromEvent(start as unknown as Record<string, unknown>);
  if (identity === null) return ["Stored Fury dispatch identity is unavailable."];
  const attribution = evaluateSeatDispatchAttributionV1({ ...identity, artifact: review, replayResult: replay });
  if (attribution.state === "unattributed") return [...attribution.reasonCodes];
  const observed = finalObservedProjection(attribution.receipt);
  if (observed === null || observed.runtimeId !== graph.parentPlanReviewEvidence.reviewerRuntimeId ||
      observed.model !== graph.parentPlanReviewEvidence.reviewerModelId || observed.executorId !== graph.parentPlanReviewEvidence.reviewerExecutorId) {
    return ["Stored Fury reviewer attribution changed."];
  }
  return [];
}

function alreadyAuthorizedResult(
  graph: import("./mission-preparation-store-v1.mjs").MissionReviewedTransitionGraphV1,
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
): ResolvePreparedMissionTransitionResultV1 | null {
  const projection = environment.current.projection;
  if (projection.authorization !== "authorized" || projection.implementationAuthorityState !== "authorized" ||
      projection.implementationAuthority === null || projection.runtimeBindings.length !== 1 || projection.activeRuntimeBindings.length !== 1 ||
      projection.publicationAuthorizations.length !== 1 || projection.execution !== "not-started" || projection.finalAcceptance !== "waiting") return null;
  const entries = environment.current.entries.slice(-4);
  const kinds = ["governance.decided", "implementation.authorized", "runtime.binding_recorded", "review.publication_authorized"];
  if (entries.length !== 4 || entries.some((entry, index) => entry.type !== kinds[index] || entry.sequence !== projection.lastSequence - 3 + index)) return null;
  const authority = projection.implementationAuthority;
  const runtimeWrapper = projection.activeRuntimeBindings[0];
  const runtime = runtimeWrapper.binding;
  const publicationRecord = projection.publicationAuthorizations[0];
  const publication = publicationRecord.authority;
  const plan = graph.transitionPlan;
  const approvedCoulsonEvidence = projection.evidence.filter(({ evidenceKind, seatId, decision }) =>
    evidenceKind === "mission_authorization" && seatId === "coulson" && decision === "approved");
  const semantic = authority.missionId === plan.missionId && authority.subjectId === plan.subjectId && authority.repositoryId === plan.repositoryId &&
    authority.baseRevision === plan.planningBaseRevision && authority.headRevision === environment.repository.headRevision && authority.branch === environment.repository.branch &&
    canonicalJson(authority.approvedRelativePaths) === canonicalJson(plan.approvedRelativePaths) && canonicalJson(authority.approvedActionIds) === canonicalJson(plan.approvedActionIds) &&
    canonicalJson(authority.approvedEffectClasses) === canonicalJson(plan.approvedEffectClasses) && canonicalJson(authority.approvedEffectKeys) === canonicalJson(plan.approvedEffectKeys) &&
    canonicalJson(authority.approvedCapabilities) === canonicalJson(plan.approvedCapabilities) && canonicalJson(authority.validationCommandIds) === canonicalJson(plan.validationCommandIds) &&
    authority.modelId === plan.modelId && runtime.reasoningRuntimeId === plan.reasoningRuntimeId && runtime.toolExecutorId === plan.toolExecutorId &&
    publication.repositoryId === plan.repositoryId && publication.baseRevisionId === plan.planningBaseRevision && publication.headRevisionId === environment.repository.headRevision &&
    canonicalJson(publication.authorizedPaths) === canonicalJson(plan.publicationPaths) && approvedCoulsonEvidence.length === 1;
  if (!semantic) return null;
  const journalLines = environment.journalBytes.endsWith("\n") ? environment.journalBytes.slice(0, -1).split("\n") : [];
  if (journalLines.length !== projection.lastSequence + 1 || journalLines.length < 5) return null;
  const startingJournalBytes = `${journalLines.slice(0, -4).join("\n")}\n`;
  const pathKinds = { symlinks: [...environment.symlinkPaths], gitlinks: [...environment.gitlinkPaths] };
  const manifestWithoutDigest = {
    schemaVersion: 1,
    schemaId: "shield.wheels-up-authorization-manifest.v1",
    missionId: plan.missionId,
    subjectId: projection.brief.subjectId,
    missionRevisionId: projection.brief.revisionId,
    repository: {
      repositoryId: environment.repository.configuredRepositoryId,
      configuredJournalPath: environment.configuredJournalPath,
      canonicalRoot: environment.repository.canonicalRoot,
      gitTopLevel: environment.repository.gitTopLevel,
      originUrl: environment.repository.originUrl,
      remoteRepositoryId: environment.repository.remoteRepositoryId,
      branch: environment.repository.branch,
      baseRevision: environment.repository.baseRevision,
      headRevision: environment.repository.headRevision,
      baseAncestor: environment.repository.baseAncestor,
      workspaceClean: true,
      changedPaths: environment.repository.changedPaths,
      symlinkPaths: pathKinds.symlinks,
      gitlinkPaths: pathKinds.gitlinks,
    },
    journal: {
      startingSequence: projection.lastSequence - 4,
      endingSequence: projection.lastSequence,
      startingJournalSha256: journalByteSha256(startingJournalBytes),
    },
    humanBinding: {
      seatId: environment.binding.seatId,
      bindingId: environment.binding.bindingId,
      humanPrincipalId: environment.binding.humanPrincipalId,
      signingKeyRef: environment.binding.signingKeyRef,
      missionScope: environment.binding.missionScope,
      validFromSequence: environment.binding.validFromSequence,
      validThroughSequence: environment.binding.validThroughSequence,
    },
    implementationAuthority: authority,
    runtimeBinding: runtimeWrapper,
    publicationAuthority: publication,
    constituentPayloads: [
      { eventType: entries[0].type, payload: (entries[0] as Extract<typeof entries[number], { type: "governance.decided" }>).payload.evidence.payload },
      { eventType: entries[1].type, payload: (entries[1] as Extract<typeof entries[number], { type: "implementation.authorized" }>).payload.authority.payload },
      { eventType: entries[2].type, payload: (entries[2] as Extract<typeof entries[number], { type: "runtime.binding_recorded" }>).payload.authorization.payload },
      { eventType: entries[3].type, payload: (entries[3] as Extract<typeof entries[number], { type: "review.publication_authorized" }>).payload.authorization.payload },
    ],
    exclusions: [...plan.exclusions],
    remainingHumanGates: [...environment.remainingHumanGates],
  };
  const authorizationManifestDigest = `sha256:${createHash("sha256").update(canonicalJson(manifestWithoutDigest)).digest("base64url")}`;
  return deepFreeze({
    schemaVersion: 1 as const,
    state: "already_authorized" as const,
    missionId: plan.missionId,
    missionRevisionId: projection.brief.revisionId,
    headRevision: environment.repository.headRevision,
    endingJournalSequence: projection.lastSequence,
    authorizationManifestDigest,
  });
}

export async function resolvePreparedMissionTransitionV1(input: unknown): Promise<ResolvePreparedMissionTransitionResultV1> {
  let copied: unknown;
  try { copied = cloneClosedData(input); } catch { return blocked("unknown", "invalid_resolution_input", "Resolution input is not closed data."); }
  if (!exact(copied, ["missionId", "repositoryRoot"]) || !identifier(copied.missionId) || typeof copied.repositoryRoot !== "string" || copied.repositoryRoot.length === 0) {
    return blocked("unknown", "invalid_resolution_input", "Resolution input must contain only missionId and repositoryRoot.");
  }
  const missionId = copied.missionId;
  const graphResult = await readMissionReviewedTransitionGraphV1({ repositoryRoot: copied.repositoryRoot, missionId });
  if (graphResult.state === "invalid") return blocked(missionId, "protected_evidence_mismatch", ...graphResult.errors);
  const graph = graphResult.graph;
  const attributionErrors = await revalidateStoredAttribution(copied.repositoryRoot, graph);
  if (attributionErrors.length > 0) return blocked(missionId, "protected_evidence_mismatch", ...attributionErrors);
  const config = await readConfig(copied.repositoryRoot);
  if (config === null || config.repositoryId !== graph.transitionPlan.repositoryId) return blocked(missionId, "repository_configuration_mismatch");
  let intent: ReturnType<typeof validateAuthorizeWheelsUpInput>;
  let environment: AuthorizeWheelsUpEnvironmentObservationV1;
  try {
    intent = validateAuthorizeWheelsUpInput(graph.transitionPlan.schemaId === "mission.transition-plan.v1" ? {
      baseRevision: graph.transitionPlan.planningBaseRevision,
      modelId: graph.transitionPlan.modelId,
      approvedRelativePaths: [...graph.transitionPlan.approvedRelativePaths],
      approvedActionIds: [...graph.transitionPlan.approvedActionIds],
      approvedEffectClasses: [...graph.transitionPlan.approvedEffectClasses],
      approvedEffectKeys: [...graph.transitionPlan.approvedEffectKeys],
      approvedCapabilities: [...graph.transitionPlan.approvedCapabilities],
      validationCommandIds: [...graph.transitionPlan.validationCommandIds],
      reasoningRuntimeId: graph.transitionPlan.reasoningRuntimeId,
      toolExecutorId: graph.transitionPlan.toolExecutorId,
      publicationPaths: [...graph.transitionPlan.publicationPaths],
    } : null);
    environment = await observeAuthorizeWheelsUpEnvironmentV1({ root: copied.repositoryRoot, config, missionId, intent });
  } catch (error) {
    return blocked(missionId, "repository_observation_stale", error instanceof Error ? error.message : "Live mission observation failed.");
  }
  const observation = buildObservation(graph, environment);
  if (observation === null) return blocked(missionId, "freshness_evidence_incomplete", "Live observation contract could not be built.");
  if (environment.current.projection.authorization === "authorized") {
    const retry = alreadyAuthorizedResult(graph, environment);
    return retry ?? blocked(missionId, "authority_conflict", "Existing authority is partial, duplicated, replaced, or semantically mismatched.");
  }
  const prepared = prepareMissionTransitionV1({
    plan: graph.transitionPlan,
    reviewEvidence: graph.parentPlanReviewEvidence,
    intent: graph.transitionIntent,
    observation,
  });
  if (prepared.state === "invalid") return blocked(missionId, prepared.reasonCode, ...prepared.errors);
  if (prepared.state === "blocked") return blocked(missionId, prepared.selection.reasonCode ?? "preparation_blocked");
  return deepFreeze({
    state: "ready" as const,
    missionId,
    candidate: prepared.candidate,
    observation,
    preparationReceipt: prepared.receipt,
  });
}
