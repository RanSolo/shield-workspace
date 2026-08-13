import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalJson } from "./mission-v2.mjs";
import {
  computeCanonicalContractDigestV1,
  computeContentIdV1,
  computeRawReceiptSetSha256V1,
  validateParentPlanReviewEvidenceV1,
  validateTransitionIntentV1,
  validateTransitionPlanV1,
  type ParentPlanReviewEvidenceV1,
  type TransitionIntentV1,
  type TransitionPlanV1,
} from "@shield/mission-preparation";
import {
  buildMissionReviewedTransitionGraphV1,
  materializeMissionReviewedTransitionGraphV1,
  type MissionReviewedTransitionGraphMaterializationResultV1,
} from "./mission-preparation-store-v1.mjs";
import { readSeatDispatchReceiptLedgerSnapshotV1 } from "./seat-dispatch-store.mjs";
import {
  evaluateSeatDispatchAttributionV1,
  replaySeatDispatchReceiptsV1,
  type SeatDispatchReceiptIdentityV1,
  type SeatDispatchReceiptProjectionV1,
} from "./seat-dispatch-receipt-v1.mjs";

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
