import { createHash, createPublicKey, verify } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { isProxy } from "node:util/types";

import { canonicalJson, deriveRepositoryMissionBindings, type TrustedHumanBinding } from "./mission-v2.mjs";
import {
  computeCanonicalContractDigestV1,
  computeContentIdV1,
  computeRawReceiptSetSha256V1,
  prepareMissionTransitionV1,
  validateFreshAuthorizeWheelsUpObservationV1,
  validateParentPlanReviewEvidenceV1,
  validateProfileAwareMissionIntakeTemplateV1,
  validateTransitionIntentV1,
  validateTransitionPlanV1OrV2,
  type ParentPlanReviewEvidenceV1,
  type ProfileAwareMissionIntakeTemplateV1,
  type TransitionIntentV1,
  type TransitionPlanV1OrV2,
  type FreshAuthorizeWheelsUpObservationV1,
  type FreshAuthorizeWheelsUpCandidateV1,
  type PrepareMissionTransitionResultV1,
  type PreparationReceiptV1,
} from "@shield/mission-preparation";
import {
  buildMissionReviewedTransitionGraphV1,
  materializeMissionReviewedTransitionGraphV1,
  readMissionReviewedTransitionGraphV1,
  type MissionReviewedTransitionGraphV1,
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
  type AuthorizeWheelsUpJournalSnapshotDependenciesV1,
} from "./authorize-wheels-up-executor-v1.mjs";
import {
  initializeProfileAwareMissionJournalV1,
  journalByteSha256,
  readMissionJournalForDisplay,
  resolveSupervisedMissionPaths,
} from "./mission-store.mjs";
import {
  computeImplementationAuthorityDigest,
  computeRuntimeBindingDigest,
  computeSchema9RuntimeBindingDigest,
  validateSchema9RuntimeBindingV1,
  type ImplementationAuthorityV1,
  type Schema9RuntimeBindingAuthorizationPayload,
  type Schema9RuntimeBindingV1,
} from "./implementation-authority-v1.mjs";
import {
  computeReviewPublicationAuthorityDigest,
  computeReviewPublicationAuthoritySemanticIdentityV1,
  isSensitiveReviewPublicationPath,
  type ReviewPublicationAuthorityV1,
  type ReviewPublicationEffect,
} from "./review-publication-v1.mjs";
import {
  createProfileAwareMissionBrief,
  profileAwareMissionIntakeV1,
  replayProfileAwareMissionJournal,
  validateProfileAwareMissionBrief,
  type ProfileAwareMissionBriefContentV1,
  type ProfileAwareMissionEntryV1,
} from "./profile-aware-mission-v1.mjs";
import { isStandingManualBreakGlassImplementationReadyV1 } from "./mission-intake-v1.mjs";

const execFile = promisify(execFileCallback);


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
  readonly transitionPlan: TransitionPlanV1OrV2;
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

function deriveBindingErrors(review: MissionTransitionPlanReviewV1, transitionPlan: TransitionPlanV1OrV2, binding: MissionTransitionPlanReviewExpectedBindingV1): readonly string[] {
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

function deriveTransitionIntent(plan: TransitionPlanV1OrV2, review: ParentPlanReviewEvidenceV1): DerivedTransitionIntentV1 {
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
    transitionKind: plan.transitionKind,
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
    parentMissionRevision: dispatchOwnedRevision(value.parentMissionRevision),
    parentSession: identifier(value.parentSessionId),
    childTask: identifier(value.childTaskId),
    childSession: identifier(value.childSessionId),
    repository: repository(value.repositoryId),
    repositoryWorkspace: identifier(value.repositoryWorkspaceId),
    repositoryRevision: revision(value.repositoryRevision),
    subject: identifier(value.subjectId),
    subjectRevision: dispatchOwnedRevision(value.subjectRevision),
    artifact: TRANSITION_PLAN_ID.test(typeof value.artifactId === "string" ? value.artifactId : ""),
    revision: dispatchOwnedRevision(value.artifactRevision),
  };
  if (!Object.values(matches).every((value) => value)) {
    return false;
  }
  if (!identifier(value.receiptId) || !identifier(value.dispatchId) || !identifier(value.parentMissionId) || !dispatchOwnedRevision(value.parentMissionRevision) ||
    !identifier(value.parentSessionId) || !identifier(value.childTaskId) || !identifier(value.childSessionId) ||
    !repository(value.repositoryId) || !identifier(value.repositoryWorkspaceId) || !revision(value.repositoryRevision) ||
    !identifier(value.subjectId) || !dispatchOwnedRevision(value.subjectRevision) ||
    !TRANSITION_PLAN_ID.test(typeof value.artifactId === "string" ? value.artifactId : "") ||
    !dispatchOwnedRevision(value.artifactRevision)) {
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

function dispatchOwnedRevision(value: unknown): value is string {
  return revision(value) || digest(value);
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

  const transitionPlan = validateTransitionPlanV1OrV2({ artifact: value.transitionPlan });
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
      plan: TransitionPlanV1OrV2;
      reviewEvidence: ParentPlanReviewEvidenceV1;
      intent: TransitionIntentV1;
      selection: import("@shield/mission-preparation").NextTransitionSelectionV1;
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
  | PreparedPublicationReadyResultV1
  | PreparedPublicationAlreadyAuthorizedResultV1
  | PreparedRuntimeBindingReadyResultV1
  | PreparedRuntimeBindingAlreadyAuthorizedResultV1
>;

type InitialRuntimeBindingCandidateContractV1 = Extract<
  Extract<PrepareMissionTransitionResultV1, { readonly state: "ready" }>["candidate"],
  { readonly transitionKind: "initial-runtime-binding" }
>;

export type PreparedRuntimeBindingReadyResultV1 = Readonly<{
  schemaVersion: 1;
  state: "runtime_binding_ready";
  missionId: string;
  protectedGraph: MissionReviewedTransitionGraphV1;
  selection: import("@shield/mission-preparation").NextTransitionSelectionV1;
  candidate: InitialRuntimeBindingCandidateContractV1;
  preparationReceipt: PreparationReceiptV1;
  implementationAuthority: ImplementationAuthorityV1;
  runtimeBinding: Schema9RuntimeBindingV1;
  observation: Readonly<{
    graphId: string;
    graphDigest: string;
    missionRevisionId: string;
    repositoryId: string;
    canonicalRoot: string;
    branch: string;
    baseRevision: string;
    headRevision: string;
    workspaceClean: true;
    journalSequence: number;
    journalSha256: string;
    signerBindingId: string;
    signingKeyRef: string;
    implementationAuthorityDigest: string;
    remainingHumanGates: readonly string[];
  }>;
}>;

export type PreparedRuntimeBindingAlreadyAuthorizedResultV1 = Readonly<{
  schemaVersion: 1;
  state: "runtime_binding_already_authorized";
  missionId: string;
  missionRevisionId: string;
  bindingId: string;
  bindingVersion: 1;
  authorizationId: string;
  schema9BindingDigest: string;
  journalSequence: number;
}>;

export type PreparedPublicationReadyResultV1 = Readonly<{
  schemaVersion: 1;
  state: "publication_ready";
  missionId: string;
  protectedGraph: MissionReviewedTransitionGraphV1;
  publicationIntent: Readonly<{
    baseRevision: string;
    authorizedPaths: readonly string[];
    permittedEffects: readonly ["review.branch.push", "review.pull_request.create_draft"];
  }>;
  observation: Readonly<{
    graphId: string;
    graphDigest: string;
    missionRevisionId: string;
    repositoryId: string;
    canonicalRoot: string;
    branch: string;
    baseRevision: string;
    initialHeadRevision: string;
    headRevision: string;
    initialHeadAncestor: true;
    workspaceClean: true;
    changedPaths: readonly string[];
    symlinkPaths: readonly string[];
    gitlinkPaths: readonly string[];
    journalSequence: number;
    journalSha256: string;
    signerBindingId: string;
    signerHumanPrincipalId: string;
    signingKeyRef: string;
    remainingHumanGates: readonly string[];
  }>;
}>;

export type PreparedPublicationAlreadyAuthorizedResultV1 = Readonly<{
  schemaVersion: 1;
  state: "publication_already_authorized";
  missionId: string;
  missionRevisionId: string;
  authorizationId: string;
  authorityDigest: string;
  journalSequence: number;
}>;

export type PreparedReviewPublicationSemanticTupleV1 = Readonly<{
  publicationScopeSchemaVersion: 1;
  contractVersion: "review-publication.v1";
  authorityKind: "review.publish";
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  repositoryId: string;
  canonicalRepositoryRoot: string;
  branch: string;
  baseRevisionId: string;
  headRevisionId: string;
  authorizedPaths: readonly string[];
  permittedEffects: readonly ReviewPublicationEffect[];
}>;

export function projectPreparedReviewPublicationSemanticTupleV1(
  authority: ReviewPublicationAuthorityV1,
): PreparedReviewPublicationSemanticTupleV1 | null {
  const identity = computeReviewPublicationAuthoritySemanticIdentityV1(authority);
  if (identity.state === "blocked" || identity.material.authorityKind !== "review.publish") return null;
  return identity.material as PreparedReviewPublicationSemanticTupleV1;
}

type InitialWheelsUpLineageV1 = Readonly<{
  initialHeadRevision: string;
  exactRetry: Extract<ResolvePreparedMissionTransitionResultV1, { readonly state: "already_authorized" }> | null;
}>;

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

type StableTextSnapshotV1 = Readonly<{ bytes: string; identity: string }>;
type StableConfigurationSnapshotV1 = StableTextSnapshotV1 & Readonly<{ config: ShieldConfig }>;
type PreparationRepositoryObservationV1 = Readonly<{
  configuredRepositoryId: string;
  remoteRepositoryId: string;
  canonicalRoot: string;
  gitTopLevel: string;
  branch: string;
  baseRevision: string;
  headRevision: string;
  baseAncestor: true;
  statusEntries: readonly string[];
  changedPaths: readonly string[];
  baseTreeEntries: readonly Readonly<{ mode: string; type: string }>[];
  headTreeEntries: readonly Readonly<{ mode: string; type: string }>[];
}>;
export interface MissionPreparationSessionDependenciesV1 {
  observePublicationRepository: (
    repositoryRoot: string,
    configuredRepositoryId: string,
    baseRevision: string,
    changedPaths: readonly string[],
  ) => Promise<PreparationRepositoryObservationV1>;
  beforeInitializationRevalidationForTest?: () => Promise<void>;
  beforeJournalInitializationForTest?: () => Promise<void>;
}
type JournalPresenceV1 = Readonly<{
  state: "absent" | "present" | "unsafe_or_uncertain";
  journalPath: string | null;
}>;

function fileIdentity(stats: Awaited<ReturnType<Awaited<ReturnType<typeof open>>["stat"]>>): string {
  return [stats.dev, stats.ino, stats.mode, stats.size, stats.mtimeMs, stats.ctimeMs].join(":");
}

async function stableRegularTextFile(
  repositoryRoot: string,
  relativePath: string,
  beforeReadForTest?: () => Promise<void>,
): Promise<StableTextSnapshotV1 | null> {
  const target = resolve(repositoryRoot, relativePath);
  const suffix = relative(repositoryRoot, target);
  if (suffix === "" || suffix === ".." || suffix.startsWith(`..${sep}`)) return null;
  const observations: ObservedPathIdentityV1[] = [];
  let current = repositoryRoot;
  try {
    if (await realpath(repositoryRoot) !== repositoryRoot) return null;
    const rootStats = await lstat(repositoryRoot);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return null;
    observations.push({ path: repositoryRoot, identity: fileIdentity(rootStats), kind: "directory" });
    const components = suffix.split(sep);
    for (const [index, component] of components.entries()) {
      current = resolve(current, component);
      const stats = await lstat(current);
      const kind = index === components.length - 1 ? "file" : "directory";
      if (stats.isSymbolicLink() || (kind === "directory" ? !stats.isDirectory() : !stats.isFile())) return null;
      observations.push({ path: current, identity: fileIdentity(stats), kind });
    }
  } catch {
    return null;
  }

  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let snapshot: StableTextSnapshotV1 | null = null;
  try {
    await beforeReadForTest?.();
    if (!await observationsRemainStable(observations)) return null;
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat();
    const observedFile = observations.at(-1);
    if (before.isFile() && observedFile?.kind === "file" && fileIdentity(before) === observedFile.identity) {
      const bytes = await handle.readFile("utf8");
      const after = await handle.stat();
      const identity = fileIdentity(before);
      if (identity === fileIdentity(after) && await observationsRemainStable(observations)) {
        const pathIdentity = observations.map(({ path, identity: componentIdentity, kind }) => ({
          path: relative(repositoryRoot, path),
          identity: componentIdentity,
          kind,
        }));
        snapshot = {
          bytes,
          identity: createHash("sha256").update(canonicalJson({ pathIdentity, bytes })).digest("hex"),
        };
      }
    }
  } catch { snapshot = null; }
  if (handle === undefined) return null;
  try { await handle.close(); }
  catch { return null; }
  return snapshot;
}

export async function stableRegularTextFileV1ForTest(input: {
  repositoryRoot: string;
  relativePath: string;
  beforeRead?: () => Promise<void>;
}): Promise<StableTextSnapshotV1 | null> {
  const root = await canonicalRepositoryRoot(input.repositoryRoot);
  return root === null ? null : stableRegularTextFile(root, input.relativePath, input.beforeRead);
}

async function canonicalRepositoryRoot(input: string): Promise<string | null> {
  try {
    const lexical = resolve(input);
    const stats = await lstat(lexical);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return null;
    return await realpath(lexical);
  } catch {
    return null;
  }
}

async function stableConfigurationSnapshot(
  repositoryRoot: string,
  repositoryId: string,
): Promise<StableConfigurationSnapshotV1 | null> {
  const snapshot = await stableRegularTextFile(repositoryRoot, ".shield/config.json");
  if (snapshot === null) return null;
  const parsed = parseShieldConfig(snapshot.bytes);
  if (parsed.state === "invalid" || parsed.value.repositoryId !== repositoryId) return null;
  const paths = resolveSupervisedMissionPaths(repositoryRoot, parsed.value.paths.journals, "mission:configuration-probe");
  if (paths.state === "invalid") return null;
  return { ...snapshot, config: parsed.value };
}

type ObservedPathIdentityV1 = Readonly<{ path: string; identity: string; kind: "directory" | "file" }>;

async function observationsRemainStable(observations: readonly ObservedPathIdentityV1[]): Promise<boolean> {
  try {
    for (const observation of observations) {
      const stats = await lstat(observation.path);
      if (stats.isSymbolicLink() || fileIdentity(stats) !== observation.identity ||
          (observation.kind === "directory" ? !stats.isDirectory() : !stats.isFile())) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function probeMissionJournalPresence(
  repositoryRoot: string,
  configuredJournalPath: string,
  missionId: string,
): Promise<JournalPresenceV1> {
  const paths = resolveSupervisedMissionPaths(repositoryRoot, configuredJournalPath, missionId);
  if (paths.state === "invalid") return { state: "unsafe_or_uncertain", journalPath: null };
  const suffix = relative(repositoryRoot, paths.value.journalPath);
  if (suffix === "" || suffix === ".." || suffix.startsWith(`..${sep}`)) return { state: "unsafe_or_uncertain", journalPath: null };
  const observations: ObservedPathIdentityV1[] = [];
  let current = repositoryRoot;
  try {
    const rootStats = await lstat(current);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return { state: "unsafe_or_uncertain", journalPath: paths.value.journalPath };
    observations.push({ path: current, identity: fileIdentity(rootStats), kind: "directory" });
    const components = suffix.split(sep);
    for (const [index, component] of components.entries()) {
      current = resolve(current, component);
      let stats;
      try { stats = await lstat(current); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" && await observationsRemainStable(observations)) {
          return { state: "absent", journalPath: paths.value.journalPath };
        }
        return { state: "unsafe_or_uncertain", journalPath: paths.value.journalPath };
      }
      if (stats.isSymbolicLink() || (index < components.length - 1 ? !stats.isDirectory() : !stats.isFile())) {
        return { state: "unsafe_or_uncertain", journalPath: paths.value.journalPath };
      }
      observations.push({ path: current, identity: fileIdentity(stats), kind: index < components.length - 1 ? "directory" : "file" });
    }
    return await observationsRemainStable(observations)
      ? { state: "present", journalPath: paths.value.journalPath }
      : { state: "unsafe_or_uncertain", journalPath: paths.value.journalPath };
  } catch {
    return { state: "unsafe_or_uncertain", journalPath: paths.value.journalPath };
  }
}

export async function probeMissionJournalPresenceV1ForTest(input: {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
}): Promise<JournalPresenceV1> {
  return probeMissionJournalPresence(input.repositoryRoot, input.configuredJournalPath, input.missionId);
}

function intakeBriefContent(template: ProfileAwareMissionIntakeTemplateV1): ProfileAwareMissionBriefContentV1 {
  return {
    schemaVersion: template.schemaVersion,
    missionId: template.missionId,
    objective: template.objective,
    subjectId: template.subjectId,
    riskFlags: { ...template.riskFlags },
    participants: template.participants.map((participant) => ({ ...participant })),
    activatedModes: template.activatedModes.map((activation) => ({ ...activation })),
    requireSimmons: template.requireSimmons,
    createdAt: { ...template.createdAt },
    profileId: template.profileId,
    profileVersion: template.profileVersion,
    requiredExecutionGateRoleIds: [...template.requiredExecutionGateRoleIds],
    requiredFinalAcceptanceGateRoleIds: [...template.requiredFinalAcceptanceGateRoleIds],
    predecessorMissionId: template.predecessorMissionId,
    predecessorJournalDigest: template.predecessorJournalDigest,
  };
}

function eligibleFreshIntake(
  plan: Extract<TransitionPlanV1OrV2, { schemaId: "mission.transition-plan.v2" }>,
  config: ShieldConfig,
): ProfileAwareMissionBriefContentV1 | null {
  const checkedTemplate = validateProfileAwareMissionIntakeTemplateV1({ artifact: plan.intakeTemplate });
  if (checkedTemplate.state === "invalid") return null;
  const template = checkedTemplate.value;
  if (template.missionId !== plan.missionId || template.subjectId !== plan.subjectId || template.objective !== plan.boundedOutcome ||
      template.profileId !== "standard" || template.profileVersion !== 1 || template.requireSimmons ||
      canonicalJson(template.requiredExecutionGateRoleIds) !== canonicalJson(["coulson"]) ||
      canonicalJson(template.requiredFinalAcceptanceGateRoleIds) !== canonicalJson(["coulson"]) ||
      !template.participants.some(({ seatId }) => seatId === "may") || !template.participants.some(({ seatId }) => seatId === "coulson") ||
      template.participants.some(({ seatId }) => !config.supportedSeatIds.includes(seatId as never)) ||
      template.activatedModes.some(({ modeId, seatId }) => modeId !== "delivery" || !config.supportedModeIds.includes(modeId as never) ||
        !template.participants.some((participant) => participant.seatId === seatId))) return null;
  const content = intakeBriefContent(template);
  try {
    const checkedBrief = validateProfileAwareMissionBrief(createProfileAwareMissionBrief(content));
    return checkedBrief.state === "valid" ? content : null;
  } catch {
    return null;
  }
}

async function expectedFreshIntakeEntry(
  repositoryRoot: string,
  plan: Extract<TransitionPlanV1OrV2, { schemaId: "mission.transition-plan.v2" }>,
  config: ShieldConfig,
): Promise<Readonly<{
  entry: ProfileAwareMissionEntryV1;
  bindings: readonly TrustedHumanBinding[];
  registrySnapshot: StableTextSnapshotV1;
}> | null> {
  const content = eligibleFreshIntake(plan, config);
  if (content === null) return null;
  const registrySnapshot = await stableRegularTextFile(repositoryRoot, ".shield/trusted-human-bindings.json");
  if (registrySnapshot === null) return null;
  let registry: unknown;
  try { registry = JSON.parse(registrySnapshot.bytes); }
  catch { return null; }
  const bindings = deriveRepositoryMissionBindings(config, registry, plan.missionId, {
    kind: "profile-aware",
    profileId: content.profileId,
    profileVersion: content.profileVersion,
    requireSimmons: content.requireSimmons,
  });
  if (bindings.state === "invalid") return null;
  const intake = profileAwareMissionIntakeV1({ brief: content, trustedBindings: bindings.value });
  return intake.state === "valid" ? { entry: intake.value.entry, bindings: bindings.value, registrySnapshot } : null;
}

async function reconcileFreshIntake(
  repositoryRoot: string,
  config: ShieldConfig,
  plan: Extract<TransitionPlanV1OrV2, { schemaId: "mission.transition-plan.v2" }>,
  expected: ProfileAwareMissionEntryV1,
  journalPath: string,
): Promise<boolean> {
  const journalRelativePath = relative(repositoryRoot, journalPath);
  const snapshot = await stableRegularTextFile(repositoryRoot, journalRelativePath);
  if (snapshot === null || !snapshot.bytes.endsWith("\n")) return false;
  const firstLineEnd = snapshot.bytes.indexOf("\n");
  if (firstLineEnd < 0 || snapshot.bytes.slice(0, firstLineEnd + 1) !== `${canonicalJson(expected)}\n`) return false;
  const current = await readMissionJournalForDisplay({
    repositoryRoot,
    configuredJournalPath: config.paths.journals,
    missionId: plan.missionId,
  });
  return current.state === "valid" && current.value.kind === "profile-aware" && current.value.entries.length > 0 &&
    canonicalJson(current.value.entries[0]) === canonicalJson(expected);
}

function repositoryObservationEligible(
  observation: PreparationRepositoryObservationV1,
  plan: Extract<TransitionPlanV1OrV2, { schemaId: "mission.transition-plan.v2" }>,
  repositoryRoot: string,
): boolean {
  const treeEntries = [...observation.baseTreeEntries, ...observation.headTreeEntries];
  return observation.configuredRepositoryId === plan.repositoryId && observation.remoteRepositoryId === plan.repositoryId &&
    observation.canonicalRoot === repositoryRoot && observation.gitTopLevel === repositoryRoot && observation.branch !== "HEAD" &&
    observation.baseRevision === plan.planningBaseRevision && observation.headRevision !== observation.baseRevision && observation.baseAncestor &&
    observation.statusEntries.length === 0 && canonicalJson(observation.changedPaths) === canonicalJson(plan.publicationPaths) &&
    plan.publicationPaths.every((path) => plan.approvedRelativePaths.includes(path)) &&
    treeEntries.every(({ mode, type }) => mode !== "120000" && mode !== "160000" && type !== "commit");
}

function sameStableSnapshot(left: StableTextSnapshotV1, right: StableTextSnapshotV1): boolean {
  return left.bytes === right.bytes && left.identity === right.identity;
}

async function waitForConcurrentJournal(
  repositoryRoot: string,
  configuredJournalPath: string,
  missionId: string,
): Promise<JournalPresenceV1> {
  const deadline = Date.now() + 30_000;
  do {
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 10));
    const presence = await probeMissionJournalPresence(repositoryRoot, configuredJournalPath, missionId);
    if (presence.state !== "absent") return presence;
  } while (Date.now() < deadline);
  return { state: "absent", journalPath: null };
}

type ProfileAwareInitializationResultV1 = Awaited<ReturnType<typeof initializeProfileAwareMissionJournalV1>>;
const inFlightProfileAwareInitializations = new Map<string, Promise<ProfileAwareInitializationResultV1>>();

async function initializeProfileAwareMissionJournalSharedV1(
  input: Parameters<typeof initializeProfileAwareMissionJournalV1>[0],
  beforeInitialization?: () => Promise<void>,
): Promise<ProfileAwareInitializationResultV1> {
  const value = input as { repositoryRoot: string; configuredJournalPath: string; missionId: string; entry: unknown };
  const key = canonicalJson({
    repositoryRoot: value.repositoryRoot,
    configuredJournalPath: value.configuredJournalPath,
    missionId: value.missionId,
    entry: value.entry,
  });
  const existing = inFlightProfileAwareInitializations.get(key);
  if (existing !== undefined) return existing;
  const pending = (async () => {
    await beforeInitialization?.();
    return initializeProfileAwareMissionJournalV1(input);
  })();
  inFlightProfileAwareInitializations.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inFlightProfileAwareInitializations.get(key) === pending) inFlightProfileAwareInitializations.delete(key);
  }
}

async function stableConfigurationSnapshotWithRetry(
  repositoryRoot: string,
  repositoryId: string,
): Promise<StableConfigurationSnapshotV1 | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = await stableConfigurationSnapshot(repositoryRoot, repositoryId);
    if (snapshot !== null) return snapshot;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 5));
  }
  return null;
}

async function expectedFreshIntakeEntryWithRetry(
  repositoryRoot: string,
  plan: Extract<TransitionPlanV1OrV2, { schemaId: "mission.transition-plan.v2" }>,
  config: ShieldConfig,
): Promise<Awaited<ReturnType<typeof expectedFreshIntakeEntry>>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const expected = await expectedFreshIntakeEntry(repositoryRoot, plan, config);
    if (expected !== null) return expected;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 5));
  }
  return null;
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

function buildInitialRuntimeBindingObservation(
  graph: MissionReviewedTransitionGraphV1,
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
): unknown | null {
  const current = environment.current.projection;
  const repository = environment.repository;
  const authority = current.implementationAuthority;
  const authorityPresent = authority !== null && current.implementationAuthorityState === "authorized";
  const body = {
    schemaId: "mission.initial-runtime-binding-observation.v1" as const,
    authority: "none" as const,
    missionId: graph.transitionPlan.missionId,
    subjectId: graph.transitionPlan.subjectId,
    missionRevisionId: current.brief.revisionId,
    repositoryId: graph.transitionPlan.repositoryId,
    canonicalRoot: repository.canonicalRoot,
    branch: repository.branch,
    planningBaseRevision: graph.transitionPlan.planningBaseRevision,
    headRevision: repository.headRevision,
    baseAncestor: repository.baseAncestor,
    workspaceClean: repository.statusEntries.length === 0,
    symlinkPaths: [...environment.symlinkPaths],
    gitlinkPaths: [...environment.gitlinkPaths],
    missionSchemaVersion: current.schemaVersion,
    authorizationState: current.authorization,
    implementationAuthorityState: current.implementationAuthorityState,
    finalAcceptanceState: current.finalAcceptance,
    executionState: current.execution,
    implementationAuthorityCount: authorityPresent ? 1 : 0,
    runtimeBindingCount: current.runtimeBindings.length,
    activeRuntimeBindingCount: current.activeRuntimeBindings.length,
    pendingCoulsonMissionAuthorizationCount: environment.pendingCoulsonMissionAuthorizationCount,
    journalSequence: current.lastSequence,
    journalSha256: environment.journalSha256,
    signerBindingId: environment.binding.bindingId,
    signingKeyRef: environment.binding.signingKeyRef,
    signerBindingMatchCount: environment.signerBindingMatchCount,
    implementationAuthorityRef: authorityPresent ? authority.authorityRef : null,
    implementationAuthorityDigest: authorityPresent ? current.implementationAuthorityDigest : null,
    implementationAuthoritySequence: authorityPresent ? authority.journalSequence : null,
    authorityMissionId: authorityPresent ? authority.missionId : null,
    authoritySubjectId: authorityPresent ? authority.subjectId : null,
    authorityRepositoryId: authorityPresent ? authority.repositoryId : null,
    authorityCanonicalWritableRoot: authorityPresent ? authority.canonicalWritableRoot : null,
    authorityBranch: authorityPresent ? authority.branch : null,
    authorityBaseRevision: authorityPresent ? authority.baseRevision : null,
    authorityHeadRevision: authorityPresent ? authority.headRevision : null,
    authorityArtifactRevisionId: authorityPresent ? authority.artifactRevisionId : null,
    authorityModelId: authorityPresent ? authority.modelId : null,
    authorityApprovedRelativePaths: authorityPresent ? [...authority.approvedRelativePaths] : [],
    authorityApprovedActionIds: authorityPresent ? [...authority.approvedActionIds] : [],
    authorityApprovedEffectClasses: authorityPresent ? [...authority.approvedEffectClasses] : [],
    authorityApprovedEffectKeys: authorityPresent ? [...authority.approvedEffectKeys] : [],
    authorityApprovedCapabilities: authorityPresent ? [...authority.approvedCapabilities] : [],
    authorityValidationCommandIds: authorityPresent ? [...authority.validationCommandIds] : [],
    remainingHumanGates: [...environment.remainingHumanGates],
    preparationEligibility: "preparationEligible" as const,
  };
  const serialized = canonicalJson(body);
  if (Buffer.byteLength(serialized, "utf8") > 1_048_576) return null;
  const digest = `sha256:${createHash("sha256").update(Buffer.concat([
    Buffer.from(body.schemaId, "utf8"), Buffer.from([0]), Buffer.from(serialized, "utf8"),
  ])).digest("base64url")}`;
  return { ...body, id: `initial-runtime-binding-observation:${digest.slice("sha256:".length)}`, digest };
}

function preparedInitialRuntimeBinding(
  graph: MissionReviewedTransitionGraphV1,
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
  sequence: number,
): Schema9RuntimeBindingV1 | null {
  const projection = environment.current.projection;
  const authority = projection.implementationAuthority;
  if (authority === null || projection.implementationAuthorityDigest === null) return null;
  if (authority.artifactRevisionId !== authority.headRevision || authority.artifactRevisionId !== environment.repository.headRevision) return null;
  const authorizationId = `authorization:runtime-binding:${sequence}`;
  const checked = validateSchema9RuntimeBindingV1({
    schemaVersion: 1,
    binding: {
      bindingSchemaVersion: 1,
      bindingId: `binding:${graph.transitionPlan.missionId}:may:1`,
      bindingVersion: 1,
      missionId: graph.transitionPlan.missionId,
      subjectId: graph.transitionPlan.subjectId,
      missionRevisionId: projection.brief.revisionId,
      seatId: "may",
      reasoningRuntimeId: graph.transitionPlan.reasoningRuntimeId,
      toolExecutorId: graph.transitionPlan.toolExecutorId,
      repositoryId: graph.transitionPlan.repositoryId,
      canonicalWritableRoot: environment.repository.canonicalRoot,
      branch: environment.repository.branch,
      artifactRevisionId: environment.repository.headRevision,
      recordedAtSequence: sequence,
      activeThroughSequence: null,
      lifecycleState: "active",
      approvedScope: {
        actionIds: [...graph.transitionPlan.approvedActionIds],
        effectClasses: [...graph.transitionPlan.approvedEffectClasses],
        effectKeys: [...graph.transitionPlan.approvedEffectKeys],
        capabilities: [...graph.transitionPlan.approvedCapabilities],
      },
      coulsonAuthorizationRef: authorizationId,
    },
    implementationAuthorityRef: authority.authorityRef,
    implementationAuthorityDigest: projection.implementationAuthorityDigest,
    implementationAuthoritySequence: authority.journalSequence,
    approvedRelativePaths: [...graph.transitionPlan.approvedRelativePaths],
    validationCommandIds: [...graph.transitionPlan.validationCommandIds],
    modelId: graph.transitionPlan.modelId,
    baseRevision: graph.transitionPlan.planningBaseRevision,
    headRevision: environment.repository.headRevision,
  });
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

export function projectFreshAuthorizeWheelsUpCompatibilityV1(
  plan: TransitionPlanV1OrV2,
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
  requireExactRepositoryCompatibility = false,
): InitialWheelsUpLineageV1 | null {
  if (plan.transitionKind !== "fresh_authorize_wheels_up") return null;
  const projection = environment.current.projection;
  if (projection.schemaVersion !== 9 || projection.authorization !== "authorized" || projection.implementationAuthorityState !== "authorized" ||
      projection.implementationAuthority === null || projection.runtimeBindings.length !== 1 || projection.activeRuntimeBindings.length !== 1 ||
      projection.publicationAuthorizations.length !== 1 || projection.execution !== "not-started" || projection.finalAcceptance !== "waiting" ||
      environment.pendingCoulsonMissionAuthorizationCount !== 0) return null;
  const entries = environment.current.entries.slice(-4);
  const kinds = ["governance.decided", "implementation.authorized", "runtime.binding_recorded", "review.publication_authorized"];
  const startingSequence = projection.lastSequence - 4;
  if (startingSequence < 0 || entries.length !== 4 || entries.some((entry, index) =>
    entry.type !== kinds[index] || entry.schemaVersion !== 9 || entry.missionId !== plan.missionId ||
    entry.sequence !== startingSequence + index + 1 || entry.entryId !== `entry:${plan.missionId}:${startingSequence + index + 1}`)) return null;
  const governanceEntry = entries[0] as Extract<typeof entries[number], { type: "governance.decided" }>;
  const implementationEntry = entries[1] as Extract<typeof entries[number], { type: "implementation.authorized" }>;
  const runtimeEntry = entries[2] as Extract<typeof entries[number], { type: "runtime.binding_recorded" }>;
  const publicationEntry = entries[3] as Extract<typeof entries[number], { type: "review.publication_authorized" }>;
  const authority = projection.implementationAuthority;
  const runtimeWrapper = projection.activeRuntimeBindings[0];
  const runtime = runtimeWrapper.binding;
  const publicationRecord = projection.publicationAuthorizations[0];
  const publication = publicationRecord.authority;
  const binding = environment.binding;
  const initialHeadRevision = authority.headRevision;
  const authorizationRequirements = projection.requirements.filter(({ evidenceKind, requiredRoleId, phase }) =>
    evidenceKind === "mission_authorization" && requiredRoleId === "coulson" && phase === "authorization");
  const approvedCoulsonEvidence = projection.evidence.filter(({ evidenceKind, seatId, decision }) =>
    evidenceKind === "mission_authorization" && seatId === "coulson" && decision === "approved");
  if (authorizationRequirements.length !== 1 || approvedCoulsonEvidence.length !== 1 ||
      approvedCoulsonEvidence[0].requirementId !== authorizationRequirements[0].requirementId ||
      environment.signerBindingMatchCount !== 1 || binding.seatId !== "coulson") return null;

  const timestamp = governanceEntry.payload.evidence.payload.timestamp;
  const expectedGovernancePayload = {
    schemaVersion: 1 as const,
    evidenceId: `evidence:coulson:${startingSequence + 1}`,
    requirementId: authorizationRequirements[0].requirementId,
    missionId: plan.missionId,
    revisionId: projection.brief.revisionId,
    seatId: "coulson" as const,
    evidenceKind: "mission_authorization" as const,
    decision: "approved" as const,
    humanPrincipalId: binding.humanPrincipalId,
    bindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `passcode-signer:${plan.missionId}:authorize-wheels-up`,
    timestamp,
    journalSequence: startingSequence + 1,
  };
  const expectedAuthority = {
    schemaVersion: 1 as const,
    contractVersion: "implementation-authority.v1" as const,
    authorityKind: "wheels_up" as const,
    authorityRef: `authority:${plan.missionId}:${startingSequence + 2}`,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    seatId: "may" as const,
    missionRevisionId: projection.brief.revisionId,
    artifactRevisionId: initialHeadRevision,
    repositoryId: plan.repositoryId,
    canonicalWritableRoot: environment.repository.canonicalRoot,
    branch: environment.repository.branch,
    baseRevision: plan.planningBaseRevision,
    headRevision: initialHeadRevision,
    modelId: plan.modelId,
    approvedRelativePaths: [...plan.approvedRelativePaths],
    approvedActionIds: [...plan.approvedActionIds],
    approvedEffectClasses: [...plan.approvedEffectClasses],
    approvedEffectKeys: [...plan.approvedEffectKeys],
    approvedCapabilities: [...plan.approvedCapabilities],
    validationCommandIds: [...plan.validationCommandIds],
    journalSequence: startingSequence + 2,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `cli:authorize-wheels-up:${startingSequence + 2}`,
    evidenceRef: `evidence:authorize-wheels-up:${startingSequence + 2}`,
    timestamp,
  };
  const implementationAuthorityDigest = computeImplementationAuthorityDigest(expectedAuthority);
  const authorizationId = `authorization:runtime-binding:${startingSequence + 3}`;
  const expectedRuntime = {
    bindingSchemaVersion: 1 as const,
    bindingId: `binding:${plan.missionId}:may:1`,
    bindingVersion: 1,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    missionRevisionId: projection.brief.revisionId,
    seatId: "may" as const,
    reasoningRuntimeId: plan.reasoningRuntimeId,
    toolExecutorId: plan.toolExecutorId,
    repositoryId: plan.repositoryId,
    canonicalWritableRoot: environment.repository.canonicalRoot,
    branch: environment.repository.branch,
    artifactRevisionId: initialHeadRevision,
    recordedAtSequence: startingSequence + 3,
    activeThroughSequence: null,
    lifecycleState: "active" as const,
    approvedScope: {
      actionIds: [...plan.approvedActionIds],
      effectClasses: [...plan.approvedEffectClasses],
      effectKeys: [...plan.approvedEffectKeys],
      capabilities: [...plan.approvedCapabilities],
    },
    coulsonAuthorizationRef: authorizationId,
  };
  const expectedRuntimeWrapper = {
    schemaVersion: 1 as const,
    binding: expectedRuntime,
    implementationAuthorityRef: expectedAuthority.authorityRef,
    implementationAuthorityDigest,
    implementationAuthoritySequence: expectedAuthority.journalSequence,
    approvedRelativePaths: [...plan.approvedRelativePaths],
    validationCommandIds: [...plan.validationCommandIds],
    modelId: plan.modelId,
    baseRevision: plan.planningBaseRevision,
    headRevision: initialHeadRevision,
  };
  const expectedRuntimeAuthorization = {
    schemaVersion: 1 as const,
    authorizationId,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    seatId: "may" as const,
    bindingId: expectedRuntime.bindingId,
    bindingVersion: 1,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeRuntimeBindingDigest(expectedRuntime),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(expectedRuntimeWrapper),
    artifactRevisionId: initialHeadRevision,
    decision: "approved" as const,
    previousJournalSequence: startingSequence + 2,
    journalSequence: startingSequence + 3,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `cli:authorize-wheels-up:runtime-binding:${startingSequence + 3}`,
    timestamp,
  };
  const expectedPublication: ReviewPublicationAuthorityV1 = {
    publicationScopeSchemaVersion: 1 as const,
    authorityRef: `authorization:${plan.missionId}:review-publish:${startingSequence + 4}`,
    contractVersion: "review-publication.v1" as const,
    authorityKind: "wheels_up" as const,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    missionRevisionId: projection.brief.revisionId,
    repositoryId: plan.repositoryId,
    canonicalRepositoryRoot: environment.repository.canonicalRoot,
    branch: environment.repository.branch,
    baseRevisionId: plan.planningBaseRevision,
    headRevisionId: initialHeadRevision,
    authorizedPaths: [...plan.publicationPaths],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
  };
  const expectedPublicationAuthorization = {
    schemaVersion: 1 as const,
    authorizationId: expectedPublication.authorityRef,
    authorityDigest: computeReviewPublicationAuthorityDigest(expectedPublication),
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    missionRevisionId: projection.brief.revisionId,
    artifactRevisionId: initialHeadRevision,
    authorityKind: "wheels_up" as const,
    previousJournalSequence: startingSequence + 3,
    journalSequence: startingSequence + 4,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `cli:authorize-wheels-up:publication:${startingSequence + 4}`,
    timestamp,
  };

  const semantic = canonicalJson(governanceEntry.payload.evidence.payload) === canonicalJson(expectedGovernancePayload) &&
    canonicalJson(approvedCoulsonEvidence[0]) === canonicalJson(expectedGovernancePayload) &&
    canonicalJson(implementationEntry.payload.authority.payload) === canonicalJson(expectedAuthority) &&
    canonicalJson(authority) === canonicalJson(expectedAuthority) && projection.implementationAuthorityDigest === implementationAuthorityDigest &&
    canonicalJson(runtimeEntry.payload.binding) === canonicalJson(expectedRuntimeWrapper) &&
    canonicalJson(runtimeEntry.payload.authorization.payload) === canonicalJson(expectedRuntimeAuthorization) &&
    canonicalJson(runtimeWrapper) === canonicalJson(expectedRuntimeWrapper) && canonicalJson(runtime) === canonicalJson(expectedRuntime) &&
    canonicalJson(publicationEntry.payload.authority) === canonicalJson(expectedPublication) &&
    canonicalJson(publicationEntry.payload.authorization.payload) === canonicalJson(expectedPublicationAuthorization) &&
    canonicalJson(publication) === canonicalJson(expectedPublication) &&
    canonicalJson(publicationRecord.authorization) === canonicalJson(expectedPublicationAuthorization) &&
    publicationRecord.entryId === publicationEntry.entryId && publicationRecord.journalSequence === publicationEntry.sequence &&
    canonicalJson(governanceEntry.timestamp) === canonicalJson(timestamp) && canonicalJson(implementationEntry.timestamp) === canonicalJson(timestamp) &&
    canonicalJson(runtimeEntry.timestamp) === canonicalJson(timestamp) && canonicalJson(publicationEntry.timestamp) === canonicalJson(timestamp);
  if (!semantic) return null;

  const workspaceClean = environment.repository.statusEntries.length === 0;
  const expectedRemainingHumanGates = projection.brief.requireSimmons
    ? ["coulson.final_acceptance", "fitz.technical_review", "simmons.product_domain_review"]
    : ["coulson.final_acceptance", "fitz.technical_review"];
  if (environment.repository.configuredRepositoryId !== plan.repositoryId ||
      environment.repository.remoteRepositoryId !== plan.repositoryId || environment.repository.canonicalRoot !== environment.repository.gitTopLevel ||
      environment.repository.branch === "HEAD" || environment.repository.baseRevision !== plan.planningBaseRevision ||
      canonicalJson(environment.remainingHumanGates) !== canonicalJson(expectedRemainingHumanGates) ||
      environment.journalSha256 !== journalByteSha256(environment.journalBytes)) return null;
  if (requireExactRepositoryCompatibility && (!environment.repository.baseAncestor || !workspaceClean ||
      environment.symlinkPaths.length !== 0 || environment.gitlinkPaths.length !== 0 ||
      environment.repository.changedPaths.some((path) => !plan.approvedRelativePaths.includes(path)))) return null;
  const exactInitialRetry = workspaceClean && environment.repository.baseAncestor && environment.repository.headRevision === initialHeadRevision &&
    canonicalJson(environment.repository.changedPaths) === canonicalJson(plan.publicationPaths) &&
    environment.symlinkPaths.length === 0 && environment.gitlinkPaths.length === 0;
  if (!exactInitialRetry) {
    return deepFreeze({ initialHeadRevision, exactRetry: null });
  }
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
      workspaceClean,
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
    implementationAuthority: expectedAuthority,
    runtimeBinding: expectedRuntimeWrapper,
    publicationAuthority: expectedPublication,
    constituentPayloads: [
      { eventType: governanceEntry.type, payload: expectedGovernancePayload },
      { eventType: implementationEntry.type, payload: expectedAuthority },
      { eventType: runtimeEntry.type, payload: expectedRuntimeAuthorization },
      { eventType: publicationEntry.type, payload: expectedPublicationAuthorization },
    ],
    exclusions: [...plan.exclusions],
    remainingHumanGates: [...environment.remainingHumanGates],
  };
  const authorizationManifestDigest = `sha256:${createHash("sha256").update(canonicalJson(manifestWithoutDigest)).digest("base64url")}`;
  const exactRetry = deepFreeze({
    schemaVersion: 1 as const,
    state: "already_authorized" as const,
    missionId: plan.missionId,
    missionRevisionId: projection.brief.revisionId,
    headRevision: environment.repository.headRevision,
    endingJournalSequence: projection.lastSequence,
    authorizationManifestDigest,
  });
  return deepFreeze({ initialHeadRevision, exactRetry });
}

function initialWheelsUpLineage(
  graph: import("./mission-preparation-store-v1.mjs").MissionReviewedTransitionGraphV1,
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
): InitialWheelsUpLineageV1 | null {
  return projectFreshAuthorizeWheelsUpCompatibilityV1(graph.transitionPlan, environment);
}

function publicationPathIsContained(path: string, approvedRoots: readonly string[]): boolean {
  return approvedRoots.some((root) => path === root || path.startsWith(`${root}/`));
}

function samePreparedPublicationSnapshot(
  initial: AuthorizeWheelsUpEnvironmentObservationV1,
  current: AuthorizeWheelsUpEnvironmentObservationV1,
): boolean {
  const initialRepository = initial.repository;
  const currentRepository = current.repository;
  return initial.journalBytes === current.journalBytes && initial.journalSha256 === current.journalSha256 &&
    initial.configuredJournalPath === current.configuredJournalPath &&
    canonicalJson(initial.current) === canonicalJson(current.current) &&
    canonicalJson(initial.binding) === canonicalJson(current.binding) &&
    initial.signerBindingMatchCount === current.signerBindingMatchCount &&
    initial.pendingCoulsonMissionAuthorizationCount === current.pendingCoulsonMissionAuthorizationCount &&
    canonicalJson(initial.remainingHumanGates) === canonicalJson(current.remainingHumanGates) &&
    initialRepository.configuredRepositoryId === currentRepository.configuredRepositoryId &&
    initialRepository.originUrl === currentRepository.originUrl &&
    initialRepository.remoteRepositoryId === currentRepository.remoteRepositoryId &&
    initialRepository.canonicalRoot === currentRepository.canonicalRoot &&
    initialRepository.gitTopLevel === currentRepository.gitTopLevel &&
    initialRepository.branch === currentRepository.branch &&
    initialRepository.headRevision === currentRepository.headRevision &&
    canonicalJson(initialRepository.statusEntries) === canonicalJson(currentRepository.statusEntries);
}

async function preparedPublicationResult(
  graph: MissionReviewedTransitionGraphV1,
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
  initialHeadRevision: string,
  config: ShieldConfig,
  repositoryRoot: string,
  journalDependencies: Partial<AuthorizeWheelsUpJournalSnapshotDependenciesV1>,
): Promise<ResolvePreparedMissionTransitionResultV1> {
  const missionId = graph.transitionPlan.missionId;
  const projection = environment.current.projection;
  const repository = environment.repository;
  const changedPaths = [...repository.changedPaths];
  if (repository.statusEntries.length !== 0) {
    return blocked(missionId, "repository_observation_stale", "Prepared publication requires an exactly clean workspace.");
  }
  if (!repository.baseAncestor) {
    return blocked(missionId, "repository_observation_stale", "Prepared publication HEAD is not a descendant of the reviewed planning base revision.");
  }
  if (repository.headRevision === initialHeadRevision) {
    return blocked(missionId, "authority_conflict", "Existing initial authority is not an exact retry and HEAD has not advanced.");
  }
  if (changedPaths.length === 0) {
    return blocked(missionId, "authority_conflict", "Prepared publication requires a non-empty base-to-HEAD change set.");
  }
  const authority = projection.implementationAuthority;
  if (authority === null ||
      changedPaths.some((path) => !publicationPathIsContained(path, authority.approvedRelativePaths)) ||
      changedPaths.some((path) => !publicationPathIsContained(path, graph.transitionPlan.approvedRelativePaths))) {
    return blocked(missionId, "authority_conflict", "Prepared publication changed paths escape the approved implementation scope.");
  }

  let publicationEnvironment: AuthorizeWheelsUpEnvironmentObservationV1;
  let ancestryEnvironment: AuthorizeWheelsUpEnvironmentObservationV1;
  try {
    const publicationIntent = validateAuthorizeWheelsUpInput({
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
      publicationPaths: changedPaths,
    });
    publicationEnvironment = await observeAuthorizeWheelsUpEnvironmentV1(
      { root: repositoryRoot, config, missionId, intent: publicationIntent },
      journalDependencies,
    );
    ancestryEnvironment = await observeAuthorizeWheelsUpEnvironmentV1(
      {
        root: repositoryRoot,
        config,
        missionId,
        intent: validateAuthorizeWheelsUpInput({ ...publicationIntent, baseRevision: initialHeadRevision }),
      },
      journalDependencies,
    );
  } catch (error) {
    return blocked(missionId, "repository_observation_stale", error instanceof Error ? error.message : "Prepared publication observation failed.");
  }

  if (!samePreparedPublicationSnapshot(environment, publicationEnvironment) ||
      !samePreparedPublicationSnapshot(environment, ancestryEnvironment) ||
      canonicalJson(publicationEnvironment.repository.changedPaths) !== canonicalJson(changedPaths) ||
      publicationEnvironment.repository.baseRevision !== graph.transitionPlan.planningBaseRevision ||
      ancestryEnvironment.repository.baseRevision !== initialHeadRevision ||
      ancestryEnvironment.repository.headRevision !== repository.headRevision ||
      changedPaths.some((path) => !publicationEnvironment.repository.headTreeEntries.some((entry) =>
        entry.path === path && entry.type === "blob" && (entry.mode === "100644" || entry.mode === "100755"))) ||
      publicationEnvironment.symlinkPaths.length !== 0 || publicationEnvironment.gitlinkPaths.length !== 0) {
    return blocked(missionId, "repository_observation_stale", "Prepared publication repository or mission evidence changed during selection.");
  }

  return deepFreeze({
    schemaVersion: 1 as const,
    state: "publication_ready" as const,
    missionId,
    protectedGraph: graph,
    publicationIntent: {
      baseRevision: authority.baseRevision,
      authorizedPaths: changedPaths,
      permittedEffects: ["review.branch.push", "review.pull_request.create_draft"] as const,
    },
    observation: {
      graphId: graph.graphId,
      graphDigest: graph.graphDigest,
      missionRevisionId: projection.brief.revisionId,
      repositoryId: repository.configuredRepositoryId,
      canonicalRoot: repository.canonicalRoot,
      branch: repository.branch,
      baseRevision: repository.baseRevision,
      initialHeadRevision,
      headRevision: repository.headRevision,
      initialHeadAncestor: true as const,
      workspaceClean: true as const,
      changedPaths,
      symlinkPaths: [...publicationEnvironment.symlinkPaths],
      gitlinkPaths: [...publicationEnvironment.gitlinkPaths],
      journalSequence: projection.lastSequence,
      journalSha256: environment.journalSha256,
      signerBindingId: environment.binding.bindingId,
      signerHumanPrincipalId: environment.binding.humanPrincipalId,
      signingKeyRef: environment.binding.signingKeyRef,
      remainingHumanGates: [...environment.remainingHumanGates],
    },
  });
}

function initialLineageEnvironmentBeforePreparedPublication(
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
): AuthorizeWheelsUpEnvironmentObservationV1 | null {
  const records = environment.current.projection.publicationAuthorizations;
  if (records.length !== 2 || !environment.journalBytes.endsWith("\n")) return null;
  const currentRecord = records[1];
  const currentEntry = environment.current.entries[currentRecord.journalSequence];
  if (currentEntry?.type !== "review.publication_authorized" || currentEntry.entryId !== currentRecord.entryId ||
      currentEntry.sequence !== currentRecord.journalSequence) return null;
  const lines = environment.journalBytes.slice(0, -1).split("\n");
  if (lines.length !== environment.current.entries.length || currentRecord.journalSequence < 1) return null;
  const entries = environment.current.entries.slice(0, currentRecord.journalSequence);
  const replay = replayProfileAwareMissionJournal(entries);
  if (replay.state === "invalid") return null;
  const journalBytes = `${lines.slice(0, currentRecord.journalSequence).join("\n")}\n`;
  return deepFreeze({
    ...environment,
    current: { kind: "profile-aware" as const, entries, projection: replay.value },
    journalBytes,
    journalSha256: journalByteSha256(journalBytes),
  });
}

async function preparedPublicationAlreadyAuthorizedResult(
  graph: MissionReviewedTransitionGraphV1,
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
  initialHeadRevision: string,
  config: ShieldConfig,
  repositoryRoot: string,
  journalDependencies: Partial<AuthorizeWheelsUpJournalSnapshotDependenciesV1>,
): Promise<ResolvePreparedMissionTransitionResultV1> {
  const selected = await preparedPublicationResult(
    graph,
    environment,
    initialHeadRevision,
    config,
    repositoryRoot,
    journalDependencies,
  );
  if (selected.state !== "publication_ready") return selected;

  const projection = environment.current.projection;
  const records = projection.publicationAuthorizations;
  if (records.length !== 2) {
    return blocked(graph.transitionPlan.missionId, "authority_conflict", "Duplicate legacy publication recovery is deferred to #279.");
  }
  const currentRecord = records[1];
  const sequence = currentRecord.journalSequence;
  const authorization = currentRecord.authorization;
  const entry = environment.current.entries[sequence];
  const preparedProvenance = entry?.type === "review.publication_authorized" && entry.sequence === sequence &&
    entry.entryId === currentRecord.entryId &&
    currentRecord.authority.authorityRef === `authorization:${graph.transitionPlan.missionId}:review-publish:${sequence}` &&
    authorization.authorizationId === currentRecord.authority.authorityRef &&
    authorization.authorityDigest === computeReviewPublicationAuthorityDigest(currentRecord.authority) &&
    authorization.authorityKind === "review.publish" && authorization.previousJournalSequence === sequence - 1 &&
    authorization.journalSequence === sequence &&
    new RegExp(`^cli:prepare-next:publication-authorize:${sequence}(?::(?:guided-review|guided-review-v2):sha256:[A-Za-z0-9_-]{43})?$`, "u").test(authorization.sourceRef) &&
    canonicalJson(entry.payload.authority) === canonicalJson(currentRecord.authority) &&
    canonicalJson(entry.payload.authorization.payload) === canonicalJson(authorization);
  if (!preparedProvenance) {
    return blocked(graph.transitionPlan.missionId, "authority_conflict", "Duplicate or legacy publication authority recovery is deferred to #279.");
  }

  const expectedAuthority: ReviewPublicationAuthorityV1 = {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    authorityKind: "review.publish",
    authorityRef: currentRecord.authorization.authorizationId,
    missionId: graph.transitionPlan.missionId,
    subjectId: projection.brief.subjectId,
    missionRevisionId: projection.brief.revisionId,
    repositoryId: selected.observation.repositoryId,
    canonicalRepositoryRoot: selected.observation.canonicalRoot,
    branch: selected.observation.branch,
    baseRevisionId: selected.publicationIntent.baseRevision,
    headRevisionId: selected.observation.headRevision,
    authorizedPaths: [...selected.publicationIntent.authorizedPaths],
    permittedEffects: [...selected.publicationIntent.permittedEffects],
  };
  const expectedTuple = projectPreparedReviewPublicationSemanticTupleV1(expectedAuthority);
  const matching = records.filter((record) => {
    const tuple = projectPreparedReviewPublicationSemanticTupleV1(record.authority);
    return tuple !== null && expectedTuple !== null && canonicalJson(tuple) === canonicalJson(expectedTuple);
  });
  if (matching.length !== 1 || matching[0] !== currentRecord) {
    return blocked(graph.transitionPlan.missionId, "authority_conflict", "Existing publication authorization meaning differs from the current prepared publication.");
  }

  const exactCurrentIdentity = sequence === projection.lastSequence && authorization.missionId === graph.transitionPlan.missionId &&
    authorization.subjectId === projection.brief.subjectId &&
    authorization.missionRevisionId === projection.brief.revisionId && authorization.artifactRevisionId === selected.observation.headRevision &&
    authorization.humanPrincipalId === environment.binding.humanPrincipalId &&
    authorization.humanBindingId === environment.binding.bindingId && authorization.signingKeyRef === environment.binding.signingKeyRef &&
    environment.journalSha256 === journalByteSha256(environment.journalBytes);
  if (!exactCurrentIdentity) {
    return blocked(graph.transitionPlan.missionId, "authority_conflict", "Existing prepared publication authorization identity is stale or conflicting.");
  }
  if (projection.communication.requests.some((request) =>
    "publicationAuthorizationId" in request && request.publicationAuthorizationId === authorization.authorizationId)) {
    return blocked(graph.transitionPlan.missionId, "authority_conflict", "Existing prepared publication authorization has already been consumed or conflicted by a publication request.");
  }

  return deepFreeze({
    schemaVersion: 1 as const,
    state: "publication_already_authorized" as const,
    missionId: graph.transitionPlan.missionId,
    missionRevisionId: projection.brief.revisionId,
    authorizationId: authorization.authorizationId,
    authorityDigest: authorization.authorityDigest,
    journalSequence: sequence,
  });
}

function exactPreparedInitialRuntimeBindingRetry(
  graph: MissionReviewedTransitionGraphV1,
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
): PreparedRuntimeBindingAlreadyAuthorizedResultV1 | null {
  const projection = environment.current.projection;
  if (projection.schemaVersion !== 9 || projection.authorization !== "authorized" || projection.implementationAuthorityState !== "authorized" ||
      projection.implementationAuthority === null || projection.implementationAuthorityDigest === null || projection.execution !== "not-started" ||
      projection.finalAcceptance !== "waiting" || projection.runtimeBindings.length !== 1 || projection.activeRuntimeBindings.length !== 1 ||
      environment.pendingCoulsonMissionAuthorizationCount !== 0 || environment.signerBindingMatchCount !== 1 || environment.binding.seatId !== "coulson" ||
      environment.repository.statusEntries.length !== 0 || !environment.repository.baseAncestor || environment.symlinkPaths.length !== 0 || environment.gitlinkPaths.length !== 0) return null;
  const sequence = projection.lastSequence;
  const entry = environment.current.entries[sequence];
  if (entry?.type !== "runtime.binding_recorded" || entry.sequence !== sequence || entry.entryId !== `entry:${graph.transitionPlan.missionId}:${sequence}`) return null;
  const expectedWrapper = preparedInitialRuntimeBinding(graph, environment, sequence);
  if (expectedWrapper === null || canonicalJson(entry.payload.binding) !== canonicalJson(expectedWrapper) ||
      canonicalJson(projection.runtimeBindings[0]) !== canonicalJson(expectedWrapper) || canonicalJson(projection.activeRuntimeBindings[0]) !== canonicalJson(expectedWrapper)) return null;
  const authorization = entry.payload.authorization.payload;
  const expectedAuthorization: Schema9RuntimeBindingAuthorizationPayload = {
    schemaVersion: 1,
    authorizationId: `authorization:runtime-binding:${sequence}`,
    missionId: graph.transitionPlan.missionId,
    subjectId: graph.transitionPlan.subjectId,
    seatId: "may",
    bindingId: expectedWrapper.binding.bindingId,
    bindingVersion: 1,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeRuntimeBindingDigest(expectedWrapper.binding),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(expectedWrapper),
    artifactRevisionId: environment.repository.headRevision,
    decision: "approved",
    previousJournalSequence: sequence - 1,
    journalSequence: sequence,
    humanPrincipalId: environment.binding.humanPrincipalId,
    humanBindingId: environment.binding.bindingId,
    signingKeyRef: environment.binding.signingKeyRef,
    sourceRef: `cli:prepare-next:runtime-binding:${sequence}`,
    timestamp: authorization.timestamp,
  };
  if (canonicalJson(authorization) !== canonicalJson(expectedAuthorization)) return null;
  return deepFreeze({
    schemaVersion: 1 as const,
    state: "runtime_binding_already_authorized" as const,
    missionId: graph.transitionPlan.missionId,
    missionRevisionId: projection.brief.revisionId,
    bindingId: expectedWrapper.binding.bindingId,
    bindingVersion: 1 as const,
    authorizationId: expectedAuthorization.authorizationId,
    schema9BindingDigest: expectedAuthorization.schema9BindingDigest,
    journalSequence: sequence,
  });
}

function preparedInitialRuntimeBindingResult(
  graph: MissionReviewedTransitionGraphV1,
  environment: AuthorizeWheelsUpEnvironmentObservationV1,
): ResolvePreparedMissionTransitionResultV1 {
  const missionId = graph.transitionPlan.missionId;
  const projection = environment.current.projection;
  if (environment.repository.configuredRepositoryId !== graph.transitionPlan.repositoryId ||
      environment.repository.remoteRepositoryId !== graph.transitionPlan.repositoryId) {
    return blocked(missionId, "repository_configuration_mismatch", "Configured, remote, and reviewed repository identities must match exactly.");
  }
  if (projection.runtimeBindings.length !== 0 || projection.activeRuntimeBindings.length !== 0) {
    const retry = exactPreparedInitialRuntimeBindingRetry(graph, environment);
    return retry ?? blocked(missionId, "authority_conflict", "Existing runtime binding is historical, superseded, legacy, duplicated, or not the exact prepared initial binding.");
  }
  const observation = buildInitialRuntimeBindingObservation(graph, environment);
  if (observation === null) return blocked(missionId, "freshness_evidence_incomplete", "Initial runtime-binding observation could not be built.");
  const prepared = prepareMissionTransitionV1({
    plan: graph.transitionPlan,
    reviewEvidence: graph.parentPlanReviewEvidence,
    intent: graph.transitionIntent,
    observation,
  });
  if (prepared.state === "invalid") return blocked(missionId, prepared.reasonCode, ...prepared.errors);
  if (prepared.state === "blocked") return blocked(missionId, prepared.selection.reasonCode ?? "preparation_blocked");
  if (prepared.candidate.transitionKind !== "initial-runtime-binding") {
    return blocked(missionId, "protected_evidence_mismatch", "Initial runtime-binding graph selected a different transition candidate.");
  }
  const authority = projection.implementationAuthority;
  const authorityDigest = projection.implementationAuthorityDigest;
  const runtimeBinding = preparedInitialRuntimeBinding(graph, environment, projection.lastSequence + 1);
  if (authority === null || authorityDigest === null || runtimeBinding === null) {
    return blocked(missionId, "implementation_authority_mismatch", "Active implementation authority cannot produce the reviewed initial runtime binding.");
  }
  return deepFreeze({
    schemaVersion: 1 as const,
    state: "runtime_binding_ready" as const,
    missionId,
    protectedGraph: graph,
    selection: prepared.selection,
    candidate: prepared.candidate,
    preparationReceipt: prepared.receipt,
    implementationAuthority: authority,
    runtimeBinding,
    observation: {
      graphId: graph.graphId,
      graphDigest: graph.graphDigest,
      missionRevisionId: projection.brief.revisionId,
      repositoryId: environment.repository.configuredRepositoryId,
      canonicalRoot: environment.repository.canonicalRoot,
      branch: environment.repository.branch,
      baseRevision: graph.transitionPlan.planningBaseRevision,
      headRevision: environment.repository.headRevision,
      workspaceClean: true as const,
      journalSequence: projection.lastSequence,
      journalSha256: environment.journalSha256,
      signerBindingId: environment.binding.bindingId,
      signingKeyRef: environment.binding.signingKeyRef,
      implementationAuthorityDigest: authorityDigest,
      remainingHumanGates: [...environment.remainingHumanGates],
    },
  });
}

async function resolvePreparedMissionTransitionV1WithDependencies(
  input: unknown,
  journalDependencies: Partial<AuthorizeWheelsUpJournalSnapshotDependenciesV1>,
): Promise<ResolvePreparedMissionTransitionResultV1> {
  let copied: unknown;
  try { copied = cloneClosedData(input); } catch { return blocked("unknown", "invalid_resolution_input", "Resolution input is not closed data."); }
  if (!exact(copied, ["missionId", "repositoryRoot"]) || !identifier(copied.missionId) || typeof copied.repositoryRoot !== "string" || copied.repositoryRoot.length === 0) {
    return blocked("unknown", "invalid_resolution_input", "Resolution input must contain only missionId and repositoryRoot.");
  }
  const missionId = copied.missionId;
  const graphResult = await readMissionReviewedTransitionGraphV1({ repositoryRoot: copied.repositoryRoot, missionId });
  if (graphResult.state === "invalid") return blocked(missionId, "protected_evidence_mismatch", ...graphResult.errors);
  const graph = graphResult.graph;
  if (graph.transitionPlan.transitionKind !== graph.transitionIntent.transitionKind) {
    return blocked(missionId, "protected_evidence_mismatch", "Reviewed transition plan and intent kinds differ.");
  }
  const attributionErrors = await revalidateStoredAttribution(copied.repositoryRoot, graph);
  if (attributionErrors.length > 0) return blocked(missionId, "protected_evidence_mismatch", ...attributionErrors);
  const config = await readConfig(copied.repositoryRoot);
  if (config === null || config.repositoryId !== graph.transitionPlan.repositoryId) return blocked(missionId, "repository_configuration_mismatch");
  let intent: ReturnType<typeof validateAuthorizeWheelsUpInput>;
  let environment: AuthorizeWheelsUpEnvironmentObservationV1;
  try {
    intent = validateAuthorizeWheelsUpInput({
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
    });
    environment = await observeAuthorizeWheelsUpEnvironmentV1({ root: copied.repositoryRoot, config, missionId, intent }, journalDependencies);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("authority_conflict:")) {
      return blocked(missionId, "authority_conflict", error.message.slice("authority_conflict:".length).trim());
    }
    return blocked(missionId, "repository_observation_stale", error instanceof Error ? error.message : "Live mission observation failed.");
  }
  if (graph.transitionIntent.transitionKind === "initial_runtime_binding") {
    return preparedInitialRuntimeBindingResult(graph, environment);
  }
  if (graph.transitionIntent.transitionKind !== "fresh_authorize_wheels_up") {
    return blocked(missionId, "protected_evidence_mismatch", "Reviewed transition kind is unsupported.");
  }
  const observation = buildObservation(graph, environment);
  if (observation === null) return blocked(missionId, "freshness_evidence_incomplete", "Live observation contract could not be built.");
  if (environment.current.projection.authorization === "authorized") {
    const canonicalPublicationRecords = environment.current.projection.publicationAuthorizations;
    const publicationAliasProvenance = canonicalPublicationRecords.flatMap((record) => record.aliases);
    const publicationCount = canonicalPublicationRecords.length;
    if (publicationCount < 1 || publicationCount > 2 || publicationAliasProvenance.length > 0) {
      return blocked(missionId, "authority_conflict", "Duplicate legacy publication recovery is deferred to #279.");
    }
    const lineageEnvironment = publicationCount === 1
      ? environment
      : initialLineageEnvironmentBeforePreparedPublication(environment);
    const lineage = lineageEnvironment === null ? null : initialWheelsUpLineage(graph, lineageEnvironment);
    if (lineage === null) {
      return blocked(missionId, "authority_conflict", "Existing authority is partial, duplicated, replaced, or semantically mismatched.");
    }
    if (publicationCount === 1 && lineage.exactRetry !== null) return lineage.exactRetry;
    if (publicationCount === 2) {
      if (lineage.exactRetry !== null) {
        return blocked(missionId, "authority_conflict", "Duplicate legacy publication recovery is deferred to #279.");
      }
      return preparedPublicationAlreadyAuthorizedResult(
        graph,
        environment,
        lineage.initialHeadRevision,
        config,
        copied.repositoryRoot,
        journalDependencies,
      );
    }
    return preparedPublicationResult(
      graph,
      environment,
      lineage.initialHeadRevision,
      config,
      copied.repositoryRoot,
      journalDependencies,
    );
  }
  const prepared = prepareMissionTransitionV1({
    plan: graph.transitionPlan,
    reviewEvidence: graph.parentPlanReviewEvidence,
    intent: graph.transitionIntent,
    observation,
  });
  if (prepared.state === "invalid") return blocked(missionId, prepared.reasonCode, ...prepared.errors);
  if (prepared.state === "blocked") return blocked(missionId, prepared.selection.reasonCode ?? "preparation_blocked");
  if (prepared.candidate.transitionKind !== "authorize-wheels-up") {
    return blocked(missionId, "protected_evidence_mismatch", "Fresh Wheels Up graph selected a different transition candidate.");
  }
  return deepFreeze({
    state: "ready" as const,
    missionId,
    plan: graph.transitionPlan,
    reviewEvidence: graph.parentPlanReviewEvidence,
    intent: graph.transitionIntent,
    selection: prepared.selection,
    candidate: prepared.candidate,
    observation,
    preparationReceipt: prepared.receipt,
  });
}

export async function prepareMissionTransitionSessionV1(
  input: unknown,
  dependencies: MissionPreparationSessionDependenciesV1,
): Promise<ResolvePreparedMissionTransitionResultV1> {
  let copied: unknown;
  try { copied = cloneClosedData(input); }
  catch { return blocked("unknown", "invalid_resolution_input", "Resolution input is not closed data."); }
  if (!exact(copied, ["missionId", "repositoryRoot"]) || !identifier(copied.missionId) || typeof copied.repositoryRoot !== "string" || copied.repositoryRoot.length === 0) {
    return blocked("unknown", "invalid_resolution_input", "Resolution input must contain only missionId and repositoryRoot.");
  }
  const missionId = copied.missionId;
  const repositoryRoot = await canonicalRepositoryRoot(copied.repositoryRoot);
  if (repositoryRoot === null) return blocked(missionId, "invalid_resolution_input", "Repository root is unsafe or inaccessible.");

  const graphResult = await readMissionReviewedTransitionGraphV1({ repositoryRoot, missionId });
  if (graphResult.state === "invalid") return blocked(missionId, "protected_evidence_mismatch", ...graphResult.errors);
  const graph = graphResult.graph;
  if (graph.transitionPlan.transitionKind !== graph.transitionIntent.transitionKind) {
    return blocked(missionId, "protected_evidence_mismatch", "Reviewed transition plan and intent kinds differ.");
  }
  const initialAttributionSnapshot = graph.transitionPlan.schemaId === "mission.transition-plan.v2"
    ? await dispatchSnapshotForRepository(repositoryRoot, graph.transitionPlan.repositoryId)
    : null;
  if (initialAttributionSnapshot?.state === "invalid") {
    return blocked(missionId, "protected_evidence_mismatch", ...initialAttributionSnapshot.errors);
  }
  const attributionErrors = await revalidateStoredAttribution(repositoryRoot, graph);
  if (attributionErrors.length > 0) return blocked(missionId, "protected_evidence_mismatch", ...attributionErrors);
  if (initialAttributionSnapshot !== null) {
    const confirmedAttributionSnapshot = await dispatchSnapshotForRepository(repositoryRoot, graph.transitionPlan.repositoryId);
    if (confirmedAttributionSnapshot.state === "invalid" || confirmedAttributionSnapshot.value.bytes !== initialAttributionSnapshot.value.bytes) {
      return blocked(
        missionId,
        "protected_evidence_mismatch",
        ...(confirmedAttributionSnapshot.state === "invalid" ? confirmedAttributionSnapshot.errors : ["Stored Fury attribution changed during validation."]),
      );
    }
  }

  let configuration = await stableConfigurationSnapshot(repositoryRoot, graph.transitionPlan.repositoryId);
  if (configuration === null) return blocked(missionId, "repository_configuration_mismatch");
  let presence = await probeMissionJournalPresence(repositoryRoot, configuration.config.paths.journals, missionId);
  if (presence.state === "unsafe_or_uncertain" || presence.journalPath === null) return blocked(missionId, "unsafe_journal_path");

  if (graph.transitionPlan.schemaId === "mission.transition-plan.v1") {
    if (presence.state === "absent") return blocked(missionId, "mission_intake_template_required");
    return resolvePreparedMissionTransitionV1WithDependencies({ missionId, repositoryRoot }, {});
  }

  let expected = await expectedFreshIntakeEntry(repositoryRoot, graph.transitionPlan, configuration.config);
  if (expected === null) return blocked(missionId, "mission_intake_invalid");
  if (presence.state === "present") {
    if (!await reconcileFreshIntake(repositoryRoot, configuration.config, graph.transitionPlan, expected.entry, presence.journalPath)) {
      return blocked(missionId, "mission_intake_mismatch");
    }
  } else {
    if (initialAttributionSnapshot === null) return blocked(missionId, "protected_evidence_mismatch");
    let observation: PreparationRepositoryObservationV1;
    try {
      observation = await dependencies.observePublicationRepository(
        repositoryRoot,
        configuration.config.repositoryId,
        graph.transitionPlan.planningBaseRevision,
        graph.transitionPlan.publicationPaths,
      );
    } catch (error) {
      return blocked(missionId, "repository_observation_stale", error instanceof Error ? error.message : "Repository observation failed.");
    }
    if (!repositoryObservationEligible(observation, graph.transitionPlan, repositoryRoot)) {
      return blocked(missionId, "repository_observation_stale");
    }

    await dependencies.beforeInitializationRevalidationForTest?.();

    const freshGraphResult = await readMissionReviewedTransitionGraphV1({ repositoryRoot, missionId });
    if (freshGraphResult.state === "invalid" || canonicalJson(freshGraphResult.graph) !== canonicalJson(graph)) {
      return blocked(missionId, "protected_evidence_mismatch", ...(freshGraphResult.state === "invalid" ? freshGraphResult.errors : ["Protected graph changed before initialization."]));
    }
    const freshAttributionErrors = await revalidateStoredAttribution(repositoryRoot, freshGraphResult.graph);
    const freshAttributionSnapshot = await dispatchSnapshotForRepository(repositoryRoot, graph.transitionPlan.repositoryId);
    if (freshAttributionErrors.length > 0 || freshAttributionSnapshot.state === "invalid" ||
        freshAttributionSnapshot.value.bytes !== initialAttributionSnapshot.value.bytes) {
      return blocked(
        missionId,
        "protected_evidence_mismatch",
        ...freshAttributionErrors,
        ...(freshAttributionSnapshot.state === "invalid" ? freshAttributionSnapshot.errors : []),
      );
    }
    const freshConfiguration = await stableConfigurationSnapshotWithRetry(repositoryRoot, graph.transitionPlan.repositoryId);
    if (freshConfiguration === null) return blocked(missionId, "repository_configuration_mismatch");
    const freshExpected = await expectedFreshIntakeEntryWithRetry(repositoryRoot, graph.transitionPlan, freshConfiguration.config);
    if (freshExpected === null) return blocked(missionId, "mission_intake_invalid");
    let freshObservation: PreparationRepositoryObservationV1;
    try {
      freshObservation = await dependencies.observePublicationRepository(
        repositoryRoot,
        freshConfiguration.config.repositoryId,
        graph.transitionPlan.planningBaseRevision,
        graph.transitionPlan.publicationPaths,
      );
    } catch (error) {
      return blocked(missionId, "repository_observation_stale", error instanceof Error ? error.message : "Repository observation failed.");
    }
    presence = await probeMissionJournalPresence(repositoryRoot, configuration.config.paths.journals, missionId);
    if (presence.state === "unsafe_or_uncertain" || presence.journalPath === null) return blocked(missionId, "unsafe_journal_path");
    const concurrentJournalPresent = presence.state === "present";
    const configurationMatches = concurrentJournalPresent
      ? configuration.bytes === freshConfiguration.bytes
      : sameStableSnapshot(configuration, freshConfiguration);
    if (!configurationMatches) return blocked(missionId, "repository_configuration_mismatch");
    const expectedMatches = (concurrentJournalPresent
      ? expected.registrySnapshot.bytes === freshExpected.registrySnapshot.bytes
      : sameStableSnapshot(expected.registrySnapshot, freshExpected.registrySnapshot)) &&
      canonicalJson(expected.entry) === canonicalJson(freshExpected.entry);
    if (!expectedMatches) return blocked(missionId, "mission_intake_invalid");
    if (!repositoryObservationEligible(freshObservation, graph.transitionPlan, repositoryRoot) ||
        canonicalJson(freshObservation) !== canonicalJson(observation)) {
      return blocked(missionId, "repository_observation_stale");
    }

    configuration = freshConfiguration;
    expected = freshExpected;
    if (presence.state === "absent") {
      const initialized = await initializeProfileAwareMissionJournalSharedV1(
        {
          repositoryRoot,
          configuredJournalPath: configuration.config.paths.journals,
          missionId,
          entry: expected.entry,
        },
        dependencies.beforeJournalInitializationForTest,
      );
      if (initialized.state === "invalid" && initialized.code !== "mission_exists" && initialized.code !== "journal_lock_held") {
        return blocked(missionId, initialized.code === "recovery_required" ? "recovery_required" : "initialization_conflict", ...initialized.errors);
      }
      if (initialized.state === "invalid") {
        presence = initialized.code === "journal_lock_held"
          ? await waitForConcurrentJournal(repositoryRoot, configuration.config.paths.journals, missionId)
          : await probeMissionJournalPresence(repositoryRoot, configuration.config.paths.journals, missionId);
      } else {
        presence = await probeMissionJournalPresence(repositoryRoot, configuration.config.paths.journals, missionId);
      }
    }
    if (presence.state === "present" && presence.journalPath !== null) {
      const currentConfiguration = await stableConfigurationSnapshotWithRetry(repositoryRoot, graph.transitionPlan.repositoryId);
      if (currentConfiguration === null || configuration.bytes !== currentConfiguration.bytes) {
        return blocked(missionId, "repository_configuration_mismatch");
      }
      const currentExpected = await expectedFreshIntakeEntryWithRetry(repositoryRoot, graph.transitionPlan, currentConfiguration.config);
      if (currentExpected === null || expected.registrySnapshot.bytes !== currentExpected.registrySnapshot.bytes ||
          canonicalJson(expected.entry) !== canonicalJson(currentExpected.entry)) return blocked(missionId, "mission_intake_invalid");
      if (!await reconcileFreshIntake(repositoryRoot, currentConfiguration.config, graph.transitionPlan, currentExpected.entry, presence.journalPath)) {
        return blocked(missionId, "mission_intake_mismatch");
      }
      configuration = currentConfiguration;
      expected = currentExpected;
    } else if (presence.state !== "absent" || presence.journalPath !== null) {
      return blocked(missionId, "initialization_conflict");
    } else {
      return blocked(missionId, "initialization_conflict");
    }
  }

  const resolved = await resolvePreparedMissionTransitionV1WithDependencies({ missionId, repositoryRoot }, {});
  const finalConfiguration = await stableConfigurationSnapshotWithRetry(repositoryRoot, graph.transitionPlan.repositoryId);
  if (finalConfiguration === null) return blocked(missionId, "repository_configuration_mismatch");
  const finalPresence = await probeMissionJournalPresence(repositoryRoot, finalConfiguration.config.paths.journals, missionId);
  if (finalPresence.state !== "present" || finalPresence.journalPath === null) return blocked(missionId, "unsafe_journal_path");
  const finalExpected = await expectedFreshIntakeEntryWithRetry(repositoryRoot, graph.transitionPlan, finalConfiguration.config);
  if (finalExpected === null) return blocked(missionId, "mission_intake_invalid");
  if (!await reconcileFreshIntake(repositoryRoot, finalConfiguration.config, graph.transitionPlan, finalExpected.entry, finalPresence.journalPath)) {
    return blocked(missionId, "mission_intake_mismatch");
  }
  return resolved;
}

export async function resolvePreparedMissionTransitionV1(input: unknown): Promise<ResolvePreparedMissionTransitionResultV1> {
  return resolvePreparedMissionTransitionV1WithDependencies(input, {});
}

export async function resolvePreparedMissionTransitionV1ForTest(
  input: unknown,
  journalDependencies: Partial<AuthorizeWheelsUpJournalSnapshotDependenciesV1>,
): Promise<ResolvePreparedMissionTransitionResultV1> {
  return resolvePreparedMissionTransitionV1WithDependencies(input, journalDependencies);
}

/** Authority-neutral binding used by the standing/manual break-glass adapter.
 * It only projects a verified repository-loaded authorization and never writes
 * mission, authority, receipt, lock, or preparation state. */
export interface StandingBreakGlassAuthorizationV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "shield.standing-break-glass-authorization.v1";
  readonly authorizationId: string;
  readonly authorizationDigest: string;
  readonly humanPrincipalId: string;
  readonly humanBindingId: string;
  readonly signingKeyRef: string;
  readonly decision: "approved";
  readonly sourceKind: "standing_manual_break_glass";
  readonly validity: "active";
  readonly trustedRegistryDigest: string;
  readonly dispatchAnchorDigest: string;
  readonly signatureBase64: string;
}

export interface StandingBreakGlassDispatchV1 {
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryId: string;
  readonly branch: string;
  readonly planId: string;
  readonly planDigest: string;
  readonly baseRevision: string;
  readonly headRevision: string;
  readonly approvedPaths: readonly string[];
  readonly actionIds: readonly string[];
  readonly effectKeys: readonly string[];
  readonly capabilityClasses: readonly string[];
  readonly maySeatId: "may";
  readonly mayModelId: string;
  readonly mayRuntimeId: string;
  readonly mayExecutorId: string;
  readonly dispatchId: string;
  readonly receiptId: string;
  readonly validationCommandIds: readonly string[];
  readonly authorizationEvidenceDigest: string;
  readonly exclusions: readonly string[];
}

export interface StandingBreakGlassBindingInputV1 {
  readonly authorizationLocator: { readonly authorizationId: string; readonly authorizationDigest: string };
  readonly dispatch: StandingBreakGlassDispatchV1;
}

export interface StandingBreakGlassBindingDependenciesV1 {
  readonly loadAuthorization: (locator: { readonly authorizationId: string; readonly authorizationDigest: string }) => { readonly authorization: StandingBreakGlassAuthorizationV1; readonly trustedBinding: TrustedHumanBinding; readonly authorizationEvidenceDigest: string } | null;
  readonly expectedDispatch: StandingBreakGlassDispatchV1;
}

export type StandingBreakGlassBindingResultV1 =
  | { readonly state: "valid"; readonly bindingId: string; readonly dispatch: StandingBreakGlassDispatchV1; readonly authorizationDigest: string }
  | { readonly state: "invalid"; readonly code: "malformed" | "binding_invalid" | "scope_invalid"; readonly errors: readonly string[] };

const STANDING_AUTH_FIELDS = ["schemaVersion", "contractVersion", "authorizationId", "authorizationDigest", "humanPrincipalId", "humanBindingId", "signingKeyRef", "decision", "sourceKind", "validity", "trustedRegistryDigest", "dispatchAnchorDigest", "signatureBase64"] as const;
const STANDING_LOCATOR_FIELDS = ["authorizationId", "authorizationDigest"] as const;
const STANDING_DISPATCH_FIELDS = ["missionId", "subjectId", "repositoryId", "branch", "planId", "planDigest", "baseRevision", "headRevision", "approvedPaths", "actionIds", "effectKeys", "capabilityClasses", "maySeatId", "mayModelId", "mayRuntimeId", "mayExecutorId", "dispatchId", "receiptId", "validationCommandIds", "authorizationEvidenceDigest", "exclusions"] as const;
const STANDING_EXCLUSIONS = ["publication", "merge", "deployment", "release", "final_acceptance", "credential_security_expansion", "destructive_effect", "material_scope_expansion"] as const;

function standingDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`;
}

function standingClosed(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.getOwnPropertyDescriptor(value, field)?.value !== undefined);
}

function standingText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function bindStandingBreakGlassImplementationFromLoadedV1(input: unknown, dependencies: StandingBreakGlassBindingDependenciesV1): StandingBreakGlassBindingResultV1 {
  if (!standingClosed(input, ["authorizationLocator", "dispatch"]) || !standingClosed(dependencies, ["loadAuthorization", "expectedDispatch"])) return { state: "invalid", code: "malformed", errors: ["Standing break-glass input must be closed."] };
  const candidate = input as unknown as StandingBreakGlassBindingInputV1;
  if (!standingClosed(candidate.authorizationLocator, STANDING_LOCATOR_FIELDS) || !standingClosed(candidate.dispatch, STANDING_DISPATCH_FIELDS) || !Array.isArray(candidate.dispatch.approvedPaths) || !Array.isArray(candidate.dispatch.actionIds) || !Array.isArray(candidate.dispatch.effectKeys) || !Array.isArray(candidate.dispatch.capabilityClasses) || !Array.isArray(candidate.dispatch.validationCommandIds) || !Array.isArray(candidate.dispatch.exclusions) || [candidate.dispatch.approvedPaths, candidate.dispatch.actionIds, candidate.dispatch.effectKeys, candidate.dispatch.capabilityClasses, candidate.dispatch.validationCommandIds, candidate.dispatch.exclusions].some((values) => values.some((value) => !standingText(value)))) {
    return { state: "invalid", code: "malformed", errors: ["Standing break-glass input contains an open or malformed component."] };
  }
  let loaded: ReturnType<StandingBreakGlassBindingDependenciesV1["loadAuthorization"]>;
  try { loaded = dependencies.loadAuthorization(candidate.authorizationLocator); } catch { return { state: "invalid", code: "binding_invalid", errors: ["Repository authorization loading failed."] }; }
  if (loaded === null || !standingClosed(loaded, ["authorization", "trustedBinding", "authorizationEvidenceDigest"]) || !standingClosed(loaded.trustedBinding, ["schemaVersion", "bindingId", "humanPrincipalId", "seatId", "missionScope", "signingKeyRef", "publicKeySpkiBase64", "validFromSequence", "validThroughSequence", "attestedBy", "provenanceRef"])) return { state: "invalid", code: "binding_invalid", errors: ["Repository-owned authorization was not available."] };
  const auth = loaded.authorization;
  const trustedBinding = loaded.trustedBinding;
  if (!standingClosed(auth, STANDING_AUTH_FIELDS)) return { state: "invalid", code: "binding_invalid", errors: ["Repository authorization contract is not closed."] };
  if (auth.schemaVersion !== 1 || auth.contractVersion !== "shield.standing-break-glass-authorization.v1" || auth.decision !== "approved" || auth.sourceKind !== "standing_manual_break_glass" || auth.validity !== "active" || !standingText(auth.authorizationId) || !standingText(auth.humanPrincipalId) || !standingText(auth.humanBindingId) || !standingText(auth.signingKeyRef) || !/^sha256:[A-Za-z0-9_-]{43}$/u.test(auth.authorizationDigest) || !/^sha256:[A-Za-z0-9_-]{43}$/u.test(auth.trustedRegistryDigest) || !/^[A-Za-z0-9+/]+={0,2}$/u.test(auth.signatureBase64)) {
    return { state: "invalid", code: "malformed", errors: ["Standing authorization contract is malformed."] };
  }
  if (candidate.authorizationLocator.authorizationId !== auth.authorizationId || candidate.authorizationLocator.authorizationDigest !== auth.authorizationDigest) return { state: "invalid", code: "binding_invalid", errors: ["Caller locator does not match the repository-loaded authorization."] };
  if (trustedBinding.seatId !== "coulson" || trustedBinding.humanPrincipalId !== auth.humanPrincipalId || trustedBinding.bindingId !== auth.humanBindingId || trustedBinding.signingKeyRef !== auth.signingKeyRef || loaded.authorizationEvidenceDigest !== candidate.dispatch.authorizationEvidenceDigest) return { state: "invalid", code: "binding_invalid", errors: ["Authorization is not bound to the exact trusted Coulson registry entry."] };
  const signedPayloadValue = { schemaVersion: auth.schemaVersion, contractVersion: auth.contractVersion, authorizationId: auth.authorizationId, humanPrincipalId: auth.humanPrincipalId, humanBindingId: auth.humanBindingId, signingKeyRef: auth.signingKeyRef, decision: auth.decision, sourceKind: auth.sourceKind, validity: auth.validity, trustedRegistryDigest: auth.trustedRegistryDigest, dispatchAnchorDigest: auth.dispatchAnchorDigest };
  if (standingDigest(signedPayloadValue) !== auth.authorizationDigest) return { state: "invalid", code: "binding_invalid", errors: ["Authorization digest does not cover the signed repository contract."] };
  const signedPayload = canonicalJson(signedPayloadValue);
  try {
    const key = createPublicKey({ key: Buffer.from(trustedBinding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(signedPayload), key, Buffer.from(auth.signatureBase64, "base64"))) return { state: "invalid", code: "binding_invalid", errors: ["Standing authorization signature verification failed."] };
  } catch { return { state: "invalid", code: "binding_invalid", errors: ["Standing authorization key or signature is invalid."] }; }
  const dispatch = candidate.dispatch;
  if (dispatch.maySeatId !== "may" || dispatch.approvedPaths.length === 0 || dispatch.approvedPaths.some((path) => path.startsWith("/") || path.includes("..")) || dispatch.exclusions.length !== STANDING_EXCLUSIONS.length || STANDING_EXCLUSIONS.some((value) => !dispatch.exclusions.includes(value)) || [dispatch.missionId, dispatch.subjectId, dispatch.repositoryId, dispatch.branch, dispatch.planId, dispatch.planDigest, dispatch.baseRevision, dispatch.headRevision, dispatch.mayModelId, dispatch.mayRuntimeId, dispatch.mayExecutorId, dispatch.dispatchId, dispatch.receiptId, dispatch.authorizationEvidenceDigest].some((value) => !standingText(value)) || canonicalJson(dispatch) !== canonicalJson(dependencies.expectedDispatch)) return { state: "invalid", code: "scope_invalid", errors: ["Dispatch is outside the frozen bounded implementation tuple."] };
  const projectedDispatch = structuredClone(dispatch);
  const bindingId = standingDigest({ authorization: auth.authorizationDigest, dispatch: projectedDispatch });
  return { state: "valid", bindingId, dispatch: projectedDispatch, authorizationDigest: auth.authorizationDigest };
}

export function bindStandingBreakGlassImplementationV1ForTest(input: unknown, dependencies: StandingBreakGlassBindingDependenciesV1): StandingBreakGlassBindingResultV1 {
  return bindStandingBreakGlassImplementationFromLoadedV1(input, dependencies);
}

export async function bindStandingBreakGlassImplementationV1(repositoryRoot: string, input: unknown): Promise<StandingBreakGlassBindingResultV1> {
  if (typeof repositoryRoot !== "string" || !repositoryRoot.startsWith(sep)) return { state: "invalid", code: "malformed", errors: ["Repository root is invalid."] };
  if (!standingClosed(input, ["authorizationLocator"]) || !standingClosed(input.authorizationLocator, STANDING_LOCATOR_FIELDS)) return { state: "invalid", code: "malformed", errors: ["Standing break-glass input must be locator-only."] };
  try {
    const canonicalRoot = await canonicalRepositoryRoot(repositoryRoot);
    if (canonicalRoot === null) return { state: "invalid", code: "binding_invalid", errors: ["Repository root is not canonical."] };
    const gitRoot = (await execFile("git", ["-C", canonicalRoot, "rev-parse", "--show-toplevel"], { shell: false })).stdout.trim();
    if (await realpath(gitRoot) !== canonicalRoot) return { state: "invalid", code: "binding_invalid", errors: ["Repository root is not a registered Git root."] };
    const shieldRoot = join(canonicalRoot, ".shield");
    const stable = async (path: string): Promise<{ bytes: string; value: unknown } | null> => { const snapshot = await stableRegularTextFile(canonicalRoot, relative(canonicalRoot, path)); return snapshot === null ? null : { bytes: snapshot.bytes, value: JSON.parse(snapshot.bytes) as unknown }; };
    const authorizationFile = await stable(join(shieldRoot, "standing-break-glass-authorization.json"));
    const registryFile = await stable(join(shieldRoot, "trusted-human-bindings.json"));
    const dispatchFile = await stable(join(shieldRoot, "standing-break-glass-dispatch.json"));
    const dispatchDigestFile = await stable(join(shieldRoot, "standing-break-glass-dispatch.sha256"));
    if (authorizationFile === null || registryFile === null || dispatchFile === null || dispatchDigestFile === null) return { state: "invalid", code: "binding_invalid", errors: ["Repository break-glass artifacts could not be stably read."] };
    if (!standingClosed(authorizationFile.value, ["authorization"]) || !standingClosed(registryFile.value, ["schemaVersion", "bindings"]) || !Array.isArray(registryFile.value.bindings) || !standingClosed(dispatchFile.value, STANDING_DISPATCH_FIELDS)) return { state: "invalid", code: "binding_invalid", errors: ["Repository break-glass artifacts are not closed."] };
    const authorizationEnvelope = authorizationFile.value;
    const registry = registryFile.value;
    const authorization = authorizationEnvelope.authorization as StandingBreakGlassAuthorizationV1;
    const matches = (registry.bindings as unknown[]).filter((binding: unknown) => plain(binding) && binding.bindingId === authorization.humanBindingId && binding.humanPrincipalId === authorization.humanPrincipalId && binding.seatId === "coulson");
    if (matches.length !== 1) return { state: "invalid", code: "binding_invalid", errors: ["Repository requires exactly one trusted Coulson binding."] };
    const trustedBinding = matches[0] as TrustedHumanBinding;
    const loaded = { authorization, trustedBinding, authorizationEvidenceDigest: standingDigest({ authorizationFile: authorizationFile.bytes, registryFile: registryFile.bytes }) };
    if (authorization.trustedRegistryDigest !== standingDigest(registryFile.bytes)) return { state: "invalid", code: "binding_invalid", errors: ["Authorization does not bind the exact trusted registry bytes."] };
    if (dispatchDigestFile.value !== standingDigest(dispatchFile.bytes)) return { state: "invalid", code: "binding_invalid", errors: ["Dispatch digest does not bind immutable dispatch bytes."] };
    const dispatch = dispatchFile.value as unknown as StandingBreakGlassDispatchV1;
    if (authorization.dispatchAnchorDigest !== standingDigest({ ...dispatch, authorizationEvidenceDigest: null })) return { state: "invalid", code: "binding_invalid", errors: ["Authorization does not bind the exact dispatch tuple."] };
    const internalInput = { authorizationLocator: input.authorizationLocator, dispatch: dispatchFile.value as unknown as StandingBreakGlassDispatchV1 };
    return bindStandingBreakGlassImplementationFromLoadedV1(internalInput, { loadAuthorization: (locator) => locator.authorizationId === loaded.authorization.authorizationId && locator.authorizationDigest === loaded.authorization.authorizationDigest ? loaded : null, expectedDispatch: dispatchFile.value as unknown as StandingBreakGlassDispatchV1 });
  } catch { return { state: "invalid", code: "binding_invalid", errors: ["Repository break-glass artifacts could not be loaded."] }; }
}

export type StandingBreakGlassPreparationResultV1 = Readonly<
  | {
    state: "implementation_dispatch_ready";
    authority: "none";
    profile: "standing_manual_break_glass.v1";
    missionId: string;
    dispatch: StandingBreakGlassDispatchV1;
    bindingId: string;
    artifacts: Readonly<{
      dispatchPath: string;
      dispatchDigestPath: string;
      projectionPath: string;
      projectionDigest: string;
    }>;
  }
  | { state: "waiting"; reasonCode: "standing_break_glass_artifacts_missing"; missionId: string; errors: readonly string[] }
  | { state: "blocked"; reasonCode: "standing_break_glass_invalid" | "standing_break_glass_conflict"; missionId: string; errors: readonly string[] }
>;

const STANDING_IMPLEMENTATION_PATHS = Object.freeze([
  "packages/shield-team-system/src/mission-cli.mts",
  "packages/shield-team-system/src/mission-preparation-host-v1.mts",
  "packages/shield-team-system/src/mission-intake-v1.mts",
  "packages/shield-team-system/tests/supervised-cli.test.mjs",
]);
const STANDING_PLAN_PATH = "docs/missions/issue-413-prepare-next-break-glass-plan.md";
const STANDING_PLAN_ID = "plan:413";
const STANDING_ACTION_IDS = Object.freeze(["implementation.apply", "implementation.validate"]);
const STANDING_EFFECT_KEYS = Object.freeze(["implementation.commit", "implementation.validation"]);
const STANDING_CAPABILITY_CLASSES = Object.freeze(["repository.write", "process.execute"]);
const STANDING_VALIDATION_COMMAND_IDS = Object.freeze(["validation:issue-413:focused", "validation:issue-413:nx"]);
const STANDING_MAY_PROFILE_PATH = ".codex/agents/may.toml";
const STANDING_MAY_PROFILE_BY_MODEL = Object.freeze({
  "gpt-5.6-luna": Object.freeze({
    runtimeId: "runtime:codex-hosted-may-luna",
    executorId: "executor:codex-hosted-workspace-tools",
  }),
});

export async function standingBreakGlassSourcePresentV1(repositoryRoot: string): Promise<boolean> {
  const canonicalRoot = await canonicalRepositoryRoot(repositoryRoot);
  if (canonicalRoot === null) return false;
  return (await standingFilePresent(canonicalRoot, ".shield/standing-break-glass-authorization.json")) ||
    (await standingFilePresent(canonicalRoot, "docs/missions/issue-413-prepare-next-break-glass-plan.md")) ||
    (await standingFilePresent(canonicalRoot, ".codex/agents/may.toml"));
}

async function standingFilePresent(repositoryRoot: string, relativePath: string): Promise<boolean> {
  try {
    await lstat(join(repositoryRoot, relativePath));
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

function standingPreparationResult(
  state: "waiting" | "blocked",
  reasonCode: "standing_break_glass_artifacts_missing" | "standing_break_glass_invalid" | "standing_break_glass_conflict",
  missionId: string,
  ...errors: readonly string[]
): StandingBreakGlassPreparationResultV1 {
  return Object.freeze({ state, reasonCode, missionId, errors: Object.freeze(errors.length === 0 ? ["Standing break-glass preparation is unavailable."] : errors) } as StandingBreakGlassPreparationResultV1);
}

function standingBytesDigest(bytes: string): string {
  return `sha256:${createHash("sha256").update(bytes, "utf8").digest("base64url")}`;
}

function standingMayProfile(bytes: string): Readonly<{ modelId: string; runtimeId: string; executorId: string }> | null {
  const name = /^name\s*=\s*"may"\s*$/mu.test(bytes);
  const model = /^model\s*=\s*"([^"]+)"\s*$/mu.exec(bytes)?.[1] ?? null;
  if (!name || model === null) return null;
  const frozen = STANDING_MAY_PROFILE_BY_MODEL[model as keyof typeof STANDING_MAY_PROFILE_BY_MODEL];
  return frozen === undefined ? null : Object.freeze({ modelId: model, ...frozen });
}

function standingRepositoryId(origin: string): string | null {
  const normalized = origin.trim().replace(/\.git$/u, "");
  const match = /^(?:git@github\.com:|https:\/\/github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/u.exec(normalized);
  return match?.[1] ?? null;
}

type StandingOutputSetV1 = Readonly<{
  dispatchPath: string;
  dispatchDigestPath: string;
  projectionPath: string;
}>;

async function writeStandingOutputSetOnce(
  parent: string,
  setName: string,
  files: Readonly<{ dispatch: string; dispatchDigest: string; projection: string }>,
): Promise<StandingOutputSetV1 | "conflict"> {
  const finalDirectory = join(parent, setName);
  const output = {
    dispatchPath: join(finalDirectory, "dispatch.json"),
    dispatchDigestPath: join(finalDirectory, "dispatch.json.sha256"),
    projectionPath: join(finalDirectory, "preparation.json"),
  } as const;
  const expected = [
    [output.dispatchPath, files.dispatch],
    [output.dispatchDigestPath, files.dispatchDigest],
    [output.projectionPath, files.projection],
  ] as const;
  const existingSet = async (): Promise<true | false | "conflict"> => {
    let directoryStats;
    try { directoryStats = await lstat(finalDirectory); }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? false : "conflict"; }
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) return "conflict";
    let directoryEntries;
    try { directoryEntries = await readdir(finalDirectory, { withFileTypes: true }); }
    catch { return "conflict"; }
    const expectedNames = new Set(expected.map(([path]) => relative(finalDirectory, path)));
    if (directoryEntries.length !== expectedNames.size || directoryEntries.some((entry) => !expectedNames.has(entry.name) || !entry.isFile() || entry.isSymbolicLink())) {
      return "conflict";
    }
    for (const [path, bytes] of expected) {
      const snapshot = await stableRegularTextFile(finalDirectory, relative(finalDirectory, path));
      if (snapshot === null) return "conflict";
      if (snapshot.bytes !== bytes) return "conflict";
    }
    return true;
  };
  const current = await existingSet();
  if (current === true) return output;
  if (current === "conflict") return "conflict";

  await mkdir(parent, { recursive: true, mode: 0o700 });
  let stagingDirectory: string | null = null;
  try {
    stagingDirectory = await mkdtemp(join(parent, ".standing-break-glass-set-"));
    for (const [path, bytes] of expected) {
      const stagedPath = join(stagingDirectory, relative(finalDirectory, path));
      const handle = await open(stagedPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        await handle.writeFile(bytes, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    const directoryHandle = await open(stagingDirectory, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
    try { await directoryHandle.sync(); }
    finally { await directoryHandle.close(); }
    await rename(stagingDirectory, finalDirectory);
    stagingDirectory = null;
    return output;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const raced = await existingSet();
      if (raced === true) return output;
    }
    return "conflict";
  } finally {
    if (stagingDirectory !== null) await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function prepareStandingBreakGlassImplementationV1(input: unknown): Promise<StandingBreakGlassPreparationResultV1> {
  if (!plain(input) || Reflect.ownKeys(input).length !== 2 || !Object.hasOwn(input, "repositoryRoot") || !Object.hasOwn(input, "projection") ||
      typeof input.repositoryRoot !== "string" || !isStandingManualBreakGlassImplementationReadyV1(input.projection)) {
    return standingPreparationResult("blocked", "standing_break_glass_invalid", "unknown", "Standing break-glass preparation input is not the exact implementation-ready projection.");
  }
  const repositoryRoot = await canonicalRepositoryRoot(input.repositoryRoot);
  const projection = input.projection as Record<string, unknown>;
  const missionId = typeof projection.missionId === "string" ? projection.missionId : "unknown";
  if (repositoryRoot === null) return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Repository root is not canonical.");
  const config = await readConfig(repositoryRoot);
  if (config === null) return standingPreparationResult("waiting", "standing_break_glass_artifacts_missing", missionId, "Repository configuration is unavailable.");
  let repositoryId: string;
  let branch: string;
  let headRevision: string;
  let headTree: string;
  let origin: string;
  try {
    origin = (await execFile("git", ["-C", repositoryRoot, "config", "--get", "remote.origin.url"], { shell: false })).stdout.trim();
    repositoryId = standingRepositoryId(origin) ?? "";
    branch = (await execFile("git", ["-C", repositoryRoot, "rev-parse", "--abbrev-ref", "HEAD"], { shell: false })).stdout.trim();
    headRevision = (await execFile("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], { shell: false })).stdout.trim();
    headTree = (await execFile("git", ["-C", repositoryRoot, "rev-parse", "HEAD^{tree}"], { shell: false })).stdout.trim();
    if (repositoryId.length === 0 || branch.length === 0 || branch === "HEAD" || !/^[0-9a-f]{40}$/u.test(headRevision) || !/^[0-9a-f]{40}$/u.test(headTree)) throw new Error("invalid repository snapshot");
  } catch {
    return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Repository identity could not be observed.");
  }
  const authorizationSnapshot = await stableRegularTextFile(repositoryRoot, ".shield/standing-break-glass-authorization.json");
  if (authorizationSnapshot === null) {
    return await standingFilePresent(repositoryRoot, ".shield/standing-break-glass-authorization.json")
      ? standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Standing authorization artifact is not a stable regular file.")
      : standingPreparationResult("waiting", "standing_break_glass_artifacts_missing", missionId, "Standing authorization artifact is unavailable.");
  }
  let authorizationValue: unknown;
  try { authorizationValue = JSON.parse(authorizationSnapshot.bytes) as unknown; }
  catch { return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Standing authorization artifact is malformed."); }
  if (!standingClosed(authorizationValue, ["authorization"]) || !standingClosed(authorizationValue.authorization, STANDING_AUTH_FIELDS)) {
    return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Standing authorization artifact is not closed.");
  }
  const authorization = authorizationValue.authorization as unknown as StandingBreakGlassAuthorizationV1;
  const planSnapshot = await stableRegularTextFile(repositoryRoot, STANDING_PLAN_PATH);
  const mayProfileSnapshot = await stableRegularTextFile(repositoryRoot, STANDING_MAY_PROFILE_PATH);
  const mayProfile = mayProfileSnapshot === null ? null : standingMayProfile(mayProfileSnapshot.bytes);
  if (planSnapshot === null || mayProfileSnapshot === null || mayProfile === null) {
    const malformed = (planSnapshot === null && await standingFilePresent(repositoryRoot, STANDING_PLAN_PATH)) ||
      (mayProfileSnapshot === null && await standingFilePresent(repositoryRoot, STANDING_MAY_PROFILE_PATH));
    return malformed
      ? standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Reviewed plan or repository-owned May profile is malformed or unstable.")
      : standingPreparationResult("waiting", "standing_break_glass_artifacts_missing", missionId, "Reviewed plan or repository-owned May profile is unavailable.");
  }
  const brief = projection.brief;
  if (!plain(brief) || config.repositoryId !== repositoryId || planSnapshot === null || mayProfileSnapshot === null) {
    return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Standing dispatch does not match the exact live implementation tuple.");
  }
  const dispatchBase: StandingBreakGlassDispatchV1 = {
    missionId,
    subjectId: typeof brief.subjectId === "string" ? brief.subjectId : "",
    repositoryId,
    branch,
    planId: STANDING_PLAN_ID,
    planDigest: standingBytesDigest(planSnapshot.bytes),
    baseRevision: headRevision,
    headRevision,
    approvedPaths: STANDING_IMPLEMENTATION_PATHS,
    actionIds: STANDING_ACTION_IDS,
    effectKeys: STANDING_EFFECT_KEYS,
    capabilityClasses: STANDING_CAPABILITY_CLASSES,
    maySeatId: "may",
    mayModelId: mayProfile.modelId,
    mayRuntimeId: mayProfile.runtimeId,
    mayExecutorId: mayProfile.executorId,
    dispatchId: "dispatch:413",
    receiptId: "receipt:413",
    validationCommandIds: STANDING_VALIDATION_COMMAND_IDS,
    authorizationEvidenceDigest: "pending",
    exclusions: STANDING_EXCLUSIONS,
  };
  const registrySnapshot = await stableRegularTextFile(repositoryRoot, ".shield/trusted-human-bindings.json");
  if (registrySnapshot === null) {
    return await standingFilePresent(repositoryRoot, ".shield/trusted-human-bindings.json")
      ? standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Trusted human binding registry is not a stable regular file.")
      : standingPreparationResult("waiting", "standing_break_glass_artifacts_missing", missionId, "Trusted human binding registry is unavailable.");
  }
  let registryValue: unknown;
  try { registryValue = JSON.parse(registrySnapshot.bytes) as unknown; }
  catch { return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Trusted human binding registry is malformed."); }
  if (!standingClosed(registryValue, ["schemaVersion", "bindings"]) || !Array.isArray(registryValue.bindings)) {
    return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Trusted human binding registry is not closed.");
  }
  if (authorization.trustedRegistryDigest !== standingDigest(registrySnapshot.bytes)) {
    return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Authorization does not bind the exact trusted registry bytes.");
  }
  const matches = registryValue.bindings.filter((value: unknown) => plain(value) && value.bindingId === authorization.humanBindingId && value.humanPrincipalId === authorization.humanPrincipalId && value.seatId === "coulson");
  if (matches.length !== 1) return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Repository requires exactly one trusted Coulson binding.");
  const trustedBinding = matches[0] as unknown as TrustedHumanBinding;
  const authorizationEvidenceDigest = standingDigest({ authorizationFile: authorizationSnapshot.bytes, registryFile: registrySnapshot.bytes });
  const dispatch = { ...dispatchBase, authorizationEvidenceDigest };
  if (authorization.dispatchAnchorDigest !== standingDigest({ ...dispatch, authorizationEvidenceDigest: null })) {
    return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Authorization does not bind the exact derived dispatch tuple.");
  }
  const binding = bindStandingBreakGlassImplementationFromLoadedV1(
    { authorizationLocator: { authorizationId: authorization.authorizationId, authorizationDigest: authorization.authorizationDigest }, dispatch },
    { loadAuthorization: () => ({ authorization, trustedBinding, authorizationEvidenceDigest }), expectedDispatch: dispatch },
  );
  if (binding.state !== "valid") return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, ...binding.errors);
  const finalPlanSnapshot = await stableRegularTextFile(repositoryRoot, STANDING_PLAN_PATH);
  const finalMayProfileSnapshot = await stableRegularTextFile(repositoryRoot, STANDING_MAY_PROFILE_PATH);
  const finalAuthorizationSnapshot = await stableRegularTextFile(repositoryRoot, ".shield/standing-break-glass-authorization.json");
  const finalRegistrySnapshot = await stableRegularTextFile(repositoryRoot, ".shield/trusted-human-bindings.json");
  let finalHead = "";
  let finalBranch = "";
  let finalTree = "";
  try {
    finalBranch = (await execFile("git", ["-C", repositoryRoot, "rev-parse", "--abbrev-ref", "HEAD"], { shell: false })).stdout.trim();
    finalHead = (await execFile("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], { shell: false })).stdout.trim();
    finalTree = (await execFile("git", ["-C", repositoryRoot, "rev-parse", "HEAD^{tree}"], { shell: false })).stdout.trim();
  } catch { /* closed below */ }
  if (finalPlanSnapshot === null || finalMayProfileSnapshot === null || finalAuthorizationSnapshot === null || finalRegistrySnapshot === null ||
      finalPlanSnapshot.identity !== planSnapshot.identity || finalMayProfileSnapshot.identity !== mayProfileSnapshot.identity ||
      finalAuthorizationSnapshot.identity !== authorizationSnapshot.identity || finalRegistrySnapshot.identity !== registrySnapshot.identity ||
      finalBranch !== branch || finalHead !== headRevision || finalTree !== headTree) {
    return standingPreparationResult("blocked", "standing_break_glass_invalid", missionId, "Reviewed plan or repository-owned May profile changed during preparation.");
  }
  const body = {
    schemaVersion: 1 as const,
    contractVersion: "shield.standing-break-glass-preparation.v1" as const,
    state: "implementation_dispatch_ready" as const,
    authority: "none" as const,
    profile: "standing_manual_break_glass.v1" as const,
    missionId,
    dispatch,
    bindingId: binding.bindingId,
  };
  const projectionDigest = standingDigest(body);
  const outputRoot = join(repositoryRoot, ".shield", "audit", "standing-break-glass", "sets");
  const dispatchBytes = canonicalJson(dispatch);
  const outputSet = await writeStandingOutputSetOnce(outputRoot, projectionDigest.slice("sha256:".length), {
    dispatch: dispatchBytes,
    dispatchDigest: canonicalJson(standingBytesDigest(dispatchBytes)),
    projection: canonicalJson({ ...body, projectionDigest }),
  });
  if (outputSet === "conflict") {
    return standingPreparationResult("blocked", "standing_break_glass_conflict", missionId, "A standing break-glass output set differs from its deterministic derivation.");
  }
  return Object.freeze({
    state: "implementation_dispatch_ready" as const,
    authority: "none" as const,
    profile: "standing_manual_break_glass.v1" as const,
    missionId,
    dispatch,
    bindingId: binding.bindingId,
    artifacts: Object.freeze({ ...outputSet, projectionDigest }),
  });
}

export interface BreakGlassPublicationPreparationInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "shield.break-glass-publication-preparation.v1";
  readonly authority: "none";
  readonly preparationId: string;
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryId: string;
  readonly canonicalRepositoryRoot: string;
  readonly branch: string;
  readonly constructionAuthority: Readonly<{
    authority: "coulson_human";
    authorityRef: string;
    planCommit: "52044ac5284a1b6980e422c7eeaf58ee76dc0e79";
    planPath: "docs/missions/issue-416-track-layer-mode-plan.md";
    planRawSha256: "72c194d7ed7a79e57a870e39744ba32f5573662cf6d73653c0813e8ffa331ecc";
    writerSeatId: "may";
    ownedPaths: readonly ["packages/shield-team-system/src/mission-preparation-host-v1.mts", "packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs"];
    scope: "issue-416-track-layer-publication-preparation";
    exclusions: readonly string[];
  }>;
  readonly manualDecision: Readonly<{
    text: string;
    sourceKind: "manual_non_canonical";
    provenanceRef: string;
  }>;
  readonly plan: Readonly<{
    authority: "none";
    planCommit: string;
    planPath: string;
    planRawSha256: string;
    transitionPlanId: string;
    transitionPlanDigest: string;
  }>;
  readonly implementation: Readonly<{
    headRevision: string;
    approvedPaths: readonly string[];
  }>;
  readonly publication: Readonly<{
    approvedPaths: readonly string[];
    permittedEffects: readonly ["review.branch.push", "review.pull_request.create_draft"];
  }>;
  readonly exclusions: readonly string[];
  readonly mackEvidence: Readonly<{
    sourceKind: "repository";
    artifactPath: string;
    evidenceId: string;
    evidenceDigest: string;
    reviewedRevision: string;
    verdict: "PASS";
    sequence: 1;
  }>;
  readonly furyEvidence: Readonly<{
    sourceKind: "repository";
    artifactPath: string;
    evidenceId: string;
    evidenceDigest: string;
    reviewedRevision: string;
    verdict: "APPROVE";
    mackEvidenceDigest: string;
    sequence: 2;
  }>;
  readonly regressionFixture: Readonly<{
    missionId: "mission:issue-intake:HgnxEl-ce9oshquwYlZJJS5IQKfFSciS8CfYeQmFSiY";
    subjectId: "github:RanSolo/shield-workspace/issue/406";
    implementationHead: "400a60a0eb4bf6dbf549b08e3b99a89572a57cec";
    operationId: string;
    operationDigest: string;
    outcome: "failed";
    reasonCode: string;
    headRevision: string;
  }>;
}

export interface TrackLayerConstructionInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "shield.track-layer-construction.v1";
  readonly authority: "coulson_human";
  readonly authorityRef: string;
  readonly missionId: "mission:issue-416";
  readonly subjectId: "github:RanSolo/shield-workspace/issue/416";
  readonly repositoryId: "RanSolo/shield-workspace";
  readonly plan: Readonly<{
    planCommit: "52044ac5284a1b6980e422c7eeaf58ee76dc0e79";
    planPath: "docs/missions/issue-416-track-layer-mode-plan.md";
    planRawSha256: "72c194d7ed7a79e57a870e39744ba32f5573662cf6d73653c0813e8ffa331ecc";
    transitionPlanId: string;
    transitionPlanDigest: string;
  }>;
  readonly implementationHead: string;
  readonly writerSeatId: "may";
  readonly ownedPaths: readonly ["packages/shield-team-system/src/mission-preparation-host-v1.mts", "packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs"];
  readonly exclusions: readonly string[];
}

export type TrackLayerConstructionResultV1 = Readonly<
  | { readonly state: "ready"; readonly authority: "none"; readonly contractVersion: "shield.track-layer-construction.v1"; readonly missionId: "mission:issue-416"; readonly subjectId: "github:RanSolo/shield-workspace/issue/416"; readonly implementationHead: string; readonly constructionDigest: string; readonly binding: Readonly<TrackLayerConstructionInputV1> }
  | { readonly state: "blocked"; readonly reasonCode: BreakGlassPublicationPreparationInvalidCodeV1; readonly errors: readonly string[] }
>;

export interface BreakGlassPublicationPreparationFinalizationInputV1 {
  readonly construction: Extract<TrackLayerConstructionResultV1, { readonly state: "ready" }>;
  readonly repositoryRoot: string;
  readonly mackArtifact: Readonly<{ readonly path: string; readonly rawSha256: string }>;
  readonly furyArtifact: Readonly<{ readonly path: string; readonly rawSha256: string }>;
}

export type BreakGlassPublicationPreparationFinalizationResultV1 = Readonly<
  | { readonly state: "ready"; readonly authority: "none"; readonly constructionDigest: string; readonly mackEvidence: Readonly<Record<string, unknown>>; readonly furyEvidence: Readonly<Record<string, unknown>>; readonly publicationPinInput: Readonly<{ readonly authority: Readonly<ReviewPublicationAuthorityV1>; readonly authorityDigest: string; readonly semanticIdentity: string; readonly requestedEffects: readonly ["review.branch.push", "review.pull_request.create_draft"] }> }
  | { readonly state: "blocked"; readonly reasonCode: BreakGlassPublicationPreparationInvalidCodeV1; readonly errors: readonly string[] }
>;

const TRACK_LAYER_CONSTRUCTION_FIELDS = ["schemaVersion", "contractVersion", "authority", "authorityRef", "missionId", "subjectId", "repositoryId", "plan", "implementationHead", "writerSeatId", "ownedPaths", "exclusions"] as const;
const TRACK_LAYER_PLAN_FIELDS = ["planCommit", "planPath", "planRawSha256", "transitionPlanId", "transitionPlanDigest"] as const;
const TRACK_LAYER_FINALIZATION_FIELDS = ["construction", "repositoryRoot", "mackArtifact", "furyArtifact"] as const;
const TRACK_LAYER_ARTIFACT_REF_FIELDS = ["path", "rawSha256"] as const;
const TRACK_LAYER_EXCLUSIONS = Object.freeze(["authority_fabrication", "journal_fabrication", "evidence_fabrication", "receipt_replay", "publication", "merge", "deployment", "release", "final_acceptance", "parallel_crews", "scope_expansion"] as const);
const TRACK_LAYER_OWNED_PATHS = Object.freeze(["packages/shield-team-system/src/mission-preparation-host-v1.mts", "packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs"] as const);

function trackLayerRawSha256(bytes: string): string { return `sha256:${createHash("sha256").update(bytes, "utf8").digest("base64url")}`; }

function trackLayerError(reasonCode: BreakGlassPublicationPreparationInvalidCodeV1, message: string): TrackLayerConstructionResultV1 { return Object.freeze({ state: "blocked" as const, reasonCode, errors: Object.freeze([message]) }); }

export function bindTrackLayerConstructionV1(input: unknown): TrackLayerConstructionResultV1 {
  if (!breakGlassClosed(input, TRACK_LAYER_CONSTRUCTION_FIELDS)) return trackLayerError("malformed", "Track-Layer construction input must be closed and contain no review or publication inputs.");
  const candidate = input as unknown as TrackLayerConstructionInputV1;
  if (candidate.schemaVersion !== 1 || candidate.contractVersion !== "shield.track-layer-construction.v1" || candidate.authority !== "coulson_human" || !identifier(candidate.authorityRef) || candidate.missionId !== "mission:issue-416" || candidate.subjectId !== "github:RanSolo/shield-workspace/issue/416" || candidate.repositoryId !== "RanSolo/shield-workspace" || !breakGlassRevision(candidate.implementationHead) || candidate.implementationHead === "400a60a0eb4bf6dbf549b08e3b99a89572a57cec" || candidate.writerSeatId !== "may") return trackLayerError("malformed", "Construction identity is not the exact #416 May binding.");
  if (!breakGlassClosed(candidate.plan, TRACK_LAYER_PLAN_FIELDS) || candidate.plan.planCommit !== "52044ac5284a1b6980e422c7eeaf58ee76dc0e79" || candidate.plan.planPath !== "docs/missions/issue-416-track-layer-mode-plan.md" || candidate.plan.planRawSha256 !== "72c194d7ed7a79e57a870e39744ba32f5573662cf6d73653c0813e8ffa331ecc" || !TRANSITION_PLAN_ID.test(candidate.plan.transitionPlanId) || !breakGlassDigestValue(candidate.plan.transitionPlanDigest)) return trackLayerError("plan_binding_invalid", "Construction plan binding is not frozen to #416.");
  const ownedPaths = breakGlassPathSet(candidate.ownedPaths);
  if (ownedPaths === null || canonicalJson(ownedPaths) !== canonicalJson(TRACK_LAYER_OWNED_PATHS) || canonicalJson(candidate.exclusions) !== canonicalJson(TRACK_LAYER_EXCLUSIONS)) return trackLayerError("path_scope_invalid", "Construction paths or exclusions exceed the approved scope.");
  const binding = structuredClone(candidate);
  const constructionDigest = trackLayerRawSha256(canonicalJson(binding));
  return breakGlassFreeze({ state: "ready" as const, authority: "none" as const, contractVersion: "shield.track-layer-construction.v1" as const, missionId: candidate.missionId, subjectId: candidate.subjectId, implementationHead: candidate.implementationHead, constructionDigest, binding });
}

async function readTrackLayerArtifact(root: string, reference: Readonly<{ path: string; rawSha256: string }>, kind: "mack" | "fury"): Promise<{ state: "valid"; value: Record<string, unknown>; digest: string } | { state: "blocked"; reasonCode: BreakGlassPublicationPreparationInvalidCodeV1; message: string }> {
  if (!breakGlassClosed(reference, TRACK_LAYER_ARTIFACT_REF_FIELDS) || !breakGlassEvidencePath(reference.path) || !breakGlassDigestValue(reference.rawSha256)) return { state: "blocked", reasonCode: "evidence_binding_invalid", message: "Review artifact reference is not a repository-owned stable path and digest." };
  const snapshot = await stableRegularTextFile(root, reference.path);
  if (snapshot === null) return { state: "blocked", reasonCode: "evidence_binding_invalid", message: "Review artifact is missing, unstable, or not a regular file." };
  const digest = trackLayerRawSha256(snapshot.bytes);
  if (digest !== reference.rawSha256) return { state: "blocked", reasonCode: "evidence_binding_invalid", message: "Review artifact bytes do not match the supplied digest." };
  let parsed: unknown;
  try { parsed = JSON.parse(snapshot.bytes) as unknown; } catch { return { state: "blocked", reasonCode: "evidence_binding_invalid", message: "Review artifact JSON is malformed." }; }
  const fields = kind === "mack" ? ["schemaVersion", "artifactKind", "missionId", "subjectId", "implementationHead", "constructionDigest", "evidenceId", "verdict", "sequence"] : ["schemaVersion", "artifactKind", "missionId", "subjectId", "implementationHead", "constructionDigest", "evidenceId", "verdict", "mackEvidenceDigest", "sequence"];
  if (!breakGlassClosed(parsed, fields) || (parsed as Record<string, unknown>).schemaVersion !== 1 || (parsed as Record<string, unknown>).artifactKind !== `issue-416-${kind}`) return { state: "blocked", reasonCode: "evidence_binding_invalid", message: "Review artifact is not the closed repository-owned #416 artifact." };
  return { state: "valid", value: parsed as Record<string, unknown>, digest };
}

export async function finalizeBreakGlassPublicationPreparationV1(input: unknown): Promise<BreakGlassPublicationPreparationFinalizationResultV1> {
  if (!breakGlassClosed(input, TRACK_LAYER_FINALIZATION_FIELDS)) return Object.freeze({ state: "blocked" as const, reasonCode: "malformed" as const, errors: Object.freeze(["Finalization input must be closed."]) });
  const candidate = input as unknown as BreakGlassPublicationPreparationFinalizationInputV1;
  if (!breakGlassRoot(candidate.repositoryRoot) || !candidate.construction || candidate.construction.state !== "ready" || !breakGlassClosed(candidate.mackArtifact, TRACK_LAYER_ARTIFACT_REF_FIELDS) || !breakGlassClosed(candidate.furyArtifact, TRACK_LAYER_ARTIFACT_REF_FIELDS)) return Object.freeze({ state: "blocked" as const, reasonCode: "malformed" as const, errors: Object.freeze(["Finalization requires a ready construction binding and two artifact references."]) });
  const mack = await readTrackLayerArtifact(candidate.repositoryRoot, candidate.mackArtifact, "mack");
  if (mack.state === "blocked") return Object.freeze({ state: "blocked" as const, reasonCode: mack.reasonCode, errors: Object.freeze([mack.message]) });
  const fury = await readTrackLayerArtifact(candidate.repositoryRoot, candidate.furyArtifact, "fury");
  if (fury.state === "blocked") return Object.freeze({ state: "blocked" as const, reasonCode: fury.reasonCode, errors: Object.freeze([fury.message]) });
  const mackValue = mack.value;
  const furyValue = fury.value;
  if (mackValue.missionId !== "mission:issue-416" || mackValue.subjectId !== "github:RanSolo/shield-workspace/issue/416" || mackValue.implementationHead !== candidate.construction.implementationHead || mackValue.constructionDigest !== candidate.construction.constructionDigest || mackValue.verdict !== "PASS" || mackValue.sequence !== 1 || furyValue.missionId !== mackValue.missionId || furyValue.subjectId !== mackValue.subjectId || furyValue.implementationHead !== mackValue.implementationHead || furyValue.constructionDigest !== candidate.construction.constructionDigest || furyValue.verdict !== "APPROVE" || furyValue.sequence !== 2 || furyValue.mackEvidenceDigest !== mack.digest) return Object.freeze({ state: "blocked" as const, reasonCode: "evidence_binding_invalid" as const, errors: Object.freeze(["Fresh Mack then Fury artifacts do not bind the exact #416 construction and Mack evidence digest."]) });
  const authority: ReviewPublicationAuthorityV1 = { publicationScopeSchemaVersion: 1, contractVersion: "review-publication.v1", authorityKind: "review.publish", authorityRef: `break-glass-publication:${candidate.construction.missionId}`, missionId: "mission:issue-416", subjectId: "github:RanSolo/shield-workspace/issue/416", missionRevisionId: candidate.construction.binding.plan.transitionPlanDigest, repositoryId: "RanSolo/shield-workspace", canonicalRepositoryRoot: candidate.repositoryRoot, branch: "agent/issue-416-track-layer-mode", baseRevisionId: candidate.construction.binding.plan.planCommit, headRevisionId: candidate.construction.implementationHead, authorizedPaths: [...candidate.construction.binding.ownedPaths], permittedEffects: [...BREAK_GLASS_EFFECTS] };
  const semantic = computeReviewPublicationAuthoritySemanticIdentityV1(authority);
  if (semantic.state === "blocked") return Object.freeze({ state: "blocked" as const, reasonCode: "replay_conflict" as const, errors: Object.freeze(["Derived publication identity is invalid."]) });
  return breakGlassFreeze({ state: "ready" as const, authority: "none" as const, constructionDigest: candidate.construction.constructionDigest, mackEvidence: { ...mackValue, rawSha256: mack.digest }, furyEvidence: { ...furyValue, rawSha256: fury.digest }, publicationPinInput: { authority, authorityDigest: computeReviewPublicationAuthorityDigest(authority), semanticIdentity: semantic.semanticIdentity, requestedEffects: [...BREAK_GLASS_EFFECTS] as ["review.branch.push", "review.pull_request.create_draft"] } });
}

export type BreakGlassPublicationPreparationResultV1 = Readonly<
  | {
    readonly state: "ready";
    readonly authority: "none";
    readonly contractVersion: "shield.break-glass-publication-preparation.v1";
    readonly preparationId: string;
    readonly writerSeatId: "may";
    readonly bindings: Readonly<{
      readonly missionId: string;
      readonly subjectId: string;
      readonly repositoryId: string;
      readonly constructionAuthority: BreakGlassPublicationPreparationInputV1["constructionAuthority"];
      readonly manualDecision: BreakGlassPublicationPreparationInputV1["manualDecision"];
      readonly plan: BreakGlassPublicationPreparationInputV1["plan"];
      readonly implementationHead: string;
      readonly approvedImplementationPaths: readonly string[];
      readonly approvedPublicationPaths: readonly string[];
      readonly exclusions: readonly string[];
      readonly mackEvidence: BreakGlassPublicationPreparationInputV1["mackEvidence"];
      readonly furyEvidence: BreakGlassPublicationPreparationInputV1["furyEvidence"];
    }>;
    readonly repairLedger: Readonly<{
      readonly entryId: string;
      readonly entryDigest: string;
      readonly writerSeatId: "may";
      readonly singleConsumer: true;
      readonly failedOperationId: string;
      readonly failedOperationDigest: string;
      readonly bindingDigest: string;
      readonly evidenceRefs: readonly string[];
    }>;
    readonly publicationPinInput: Readonly<{
      readonly authority: Readonly<ReviewPublicationAuthorityV1>;
      readonly authorityDigest: string;
      readonly semanticIdentity: string;
      readonly requestedEffects: readonly ["review.branch.push", "review.pull_request.create_draft"];
    }>;
  }
  | { readonly state: "blocked"; readonly reasonCode: BreakGlassPublicationPreparationInvalidCodeV1; readonly errors: readonly string[] }
>;

export type BreakGlassPublicationPreparationInvalidCodeV1 =
  | "malformed"
  | "manual_provenance_invalid"
  | "plan_binding_invalid"
  | "implementation_binding_invalid"
  | "path_scope_invalid"
  | "evidence_binding_invalid"
  | "failed_operation_invalid"
  | "effect_scope_invalid"
  | "replay_conflict";

const BREAK_GLASS_PREPARATION_FIELDS = [
  "schemaVersion", "contractVersion", "authority", "preparationId", "missionId", "subjectId", "repositoryId",
  "canonicalRepositoryRoot", "branch", "constructionAuthority", "manualDecision", "plan", "implementation", "publication", "exclusions",
  "mackEvidence", "furyEvidence", "regressionFixture",
] as const;
const BREAK_GLASS_MANUAL_FIELDS = ["text", "sourceKind", "provenanceRef"] as const;
const BREAK_GLASS_CONSTRUCTION_FIELDS = ["authority", "authorityRef", "planCommit", "planPath", "planRawSha256", "writerSeatId", "ownedPaths", "scope", "exclusions"] as const;
const BREAK_GLASS_PLAN_FIELDS = ["authority", "planCommit", "planPath", "planRawSha256", "transitionPlanId", "transitionPlanDigest"] as const;
const BREAK_GLASS_IMPLEMENTATION_FIELDS = ["headRevision", "approvedPaths"] as const;
const BREAK_GLASS_PUBLICATION_FIELDS = ["approvedPaths", "permittedEffects"] as const;
const BREAK_GLASS_EVIDENCE_FIELDS = ["sourceKind", "artifactPath", "evidenceId", "evidenceDigest", "reviewedRevision", "verdict", "sequence"] as const;
const BREAK_GLASS_FURY_EVIDENCE_FIELDS = ["sourceKind", "artifactPath", "evidenceId", "evidenceDigest", "reviewedRevision", "verdict", "mackEvidenceDigest", "sequence"] as const;
const BREAK_GLASS_REGRESSION_FIELDS = ["missionId", "subjectId", "implementationHead", "operationId", "operationDigest", "outcome", "reasonCode", "headRevision"] as const;
const BREAK_GLASS_EFFECTS = Object.freeze(["review.branch.push", "review.pull_request.create_draft"] as const);
const BREAK_GLASS_EXCLUSIONS = Object.freeze([
  "merge", "deployment", "release", "final_acceptance", "issue_closure", "expanded_scope", "evidence_rewrite", "receipt_replay",
] as const);
const BREAK_GLASS_OWNED_PATHS = Object.freeze([
  "packages/shield-team-system/src/mission-preparation-host-v1.mts",
  "packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs",
] as const);
const BREAK_GLASS_CONSTRUCTION_EXCLUSIONS = Object.freeze([
  "authority_fabrication", "journal_fabrication", "evidence_fabrication", "receipt_replay", "publication", "merge", "deployment", "release", "final_acceptance", "parallel_crews", "scope_expansion",
] as const);

function breakGlassClosed(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!plain(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string") || fields.some((field) => !keys.includes(field))) return false;
  return fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor !== undefined && "value" in descriptor && descriptor.get === undefined && descriptor.set === undefined && descriptor.enumerable === true;
  });
}

function breakGlassArray(value: unknown, allowEmpty = false): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 256 || (!allowEmpty && value.length === 0)) return null;
    if (Reflect.ownKeys(value).length !== value.length + 1) return null;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined || descriptor.enumerable !== true) return null;
    }
    return value;
  } catch {
    return null;
  }
}

function breakGlassDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(`shield.break-glass-publication-preparation.v1\0${canonicalJson(value)}`).digest("base64url")}`;
}

function breakGlassPathSet(value: unknown): readonly string[] | null {
  const paths = breakGlassArray(value);
  if (paths === null || paths.some((path) => typeof path !== "string" || path.length > 4096 || path !== path.normalize("NFC") || path.startsWith("/") || path.includes("\\") || path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..") || isSensitiveReviewPublicationPath(path))) return null;
  const strings = paths as readonly string[];
  for (let index = 1; index < strings.length; index += 1) if (strings[index - 1] >= strings[index]) return null;
  return strings;
}

function breakGlassEvidencePath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(".shield/") && value.length <= 4096 && !value.includes("\\") &&
    !value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..") && !isSensitiveReviewPublicationPath(value);
}

function breakGlassDigestValue(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[A-Za-z0-9_-]{43}$/u.test(value);
}

function breakGlassRevision(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}

function breakGlassRoot(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(sep) && value.length <= 4096 && !value.includes("\\") && !value.split(sep).some((segment, index) => index > 0 && (segment === "" || segment === "." || segment === ".."));
}

function breakGlassError(reasonCode: BreakGlassPublicationPreparationInvalidCodeV1, message: string): BreakGlassPublicationPreparationResultV1 {
  return Object.freeze({ state: "blocked" as const, reasonCode, errors: Object.freeze([message]) });
}

function breakGlassFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) breakGlassFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function bindBreakGlassPublicationPreparationV1(input: unknown): BreakGlassPublicationPreparationResultV1 {
  if (!breakGlassClosed(input, BREAK_GLASS_PREPARATION_FIELDS)) return breakGlassError("malformed", "Break-glass publication preparation input must be closed.");
  const candidate = input as unknown as BreakGlassPublicationPreparationInputV1;
  if (candidate.schemaVersion !== 1 || candidate.contractVersion !== "shield.break-glass-publication-preparation.v1" || candidate.authority !== "none" ||
      !identifier(candidate.preparationId) || !identifier(candidate.missionId) || !identifier(candidate.subjectId) || !identifier(candidate.repositoryId) ||
      !breakGlassRoot(candidate.canonicalRepositoryRoot) || !identifier(candidate.branch)) return breakGlassError("malformed", "Break-glass publication preparation identity is malformed.");
  if (!breakGlassClosed(candidate.constructionAuthority, BREAK_GLASS_CONSTRUCTION_FIELDS) ||
      candidate.constructionAuthority.authority !== "coulson_human" || !identifier(candidate.constructionAuthority.authorityRef) ||
      candidate.constructionAuthority.planCommit !== "52044ac5284a1b6980e422c7eeaf58ee76dc0e79" ||
      candidate.constructionAuthority.planPath !== "docs/missions/issue-416-track-layer-mode-plan.md" ||
      candidate.constructionAuthority.planRawSha256 !== "72c194d7ed7a79e57a870e39744ba32f5573662cf6d73653c0813e8ffa331ecc" ||
      candidate.constructionAuthority.writerSeatId !== "may" || candidate.constructionAuthority.scope !== "issue-416-track-layer-publication-preparation" ||
      canonicalJson(candidate.constructionAuthority.ownedPaths) !== canonicalJson(BREAK_GLASS_OWNED_PATHS) ||
      canonicalJson(candidate.constructionAuthority.exclusions) !== canonicalJson(BREAK_GLASS_CONSTRUCTION_EXCLUSIONS)) {
    return breakGlassError("malformed", "Issue #416 construction authority is not the exact Coulson-approved two-file scope.");
  }
  if (!breakGlassClosed(candidate.manualDecision, BREAK_GLASS_MANUAL_FIELDS) || candidate.manualDecision.sourceKind !== "manual_non_canonical" ||
      !standingText(candidate.manualDecision.text) || !identifier(candidate.manualDecision.provenanceRef)) return breakGlassError("manual_provenance_invalid", "Manual decision provenance must be explicit and non-canonical.");
  if (!breakGlassClosed(candidate.plan, BREAK_GLASS_PLAN_FIELDS) || candidate.plan.authority !== "none" || !breakGlassRevision(candidate.plan.planCommit) ||
      !transitionPlanPath(candidate.plan.planPath) || !SHA256.test(candidate.plan.planRawSha256) || !TRANSITION_PLAN_ID.test(candidate.plan.transitionPlanId) ||
      !breakGlassDigestValue(candidate.plan.transitionPlanDigest) || candidate.plan.planCommit !== candidate.constructionAuthority.planCommit ||
      candidate.plan.planPath !== candidate.constructionAuthority.planPath || candidate.plan.planRawSha256 !== candidate.constructionAuthority.planRawSha256) return breakGlassError("plan_binding_invalid", "Plan and transition identities are not exact.");
  if (!breakGlassClosed(candidate.implementation, BREAK_GLASS_IMPLEMENTATION_FIELDS) || !breakGlassRevision(candidate.implementation.headRevision)) return breakGlassError("implementation_binding_invalid", "Implementation HEAD binding is malformed.");
  const implementationPaths = breakGlassPathSet(candidate.implementation.approvedPaths);
  const publicationPaths = breakGlassPathSet(candidate.publication?.approvedPaths);
  if (implementationPaths === null || !breakGlassClosed(candidate.publication, BREAK_GLASS_PUBLICATION_FIELDS) || publicationPaths === null) return breakGlassError("path_scope_invalid", "Approved implementation and publication paths are not exact safe sets.");
  if (implementationPaths.some((path) => !(candidate.constructionAuthority.ownedPaths as readonly string[]).includes(path))) return breakGlassError("path_scope_invalid", "Implementation paths exceed the construction authority.");
  if (publicationPaths.some((path) => !implementationPaths.includes(path))) return breakGlassError("path_scope_invalid", "Publication paths must be contained by the approved implementation paths.");
  const effects = breakGlassArray(candidate.publication.permittedEffects);
  if (effects === null || canonicalJson(effects) !== canonicalJson(BREAK_GLASS_EFFECTS)) return breakGlassError("effect_scope_invalid", "Only branch push and draft pull-request effects are permitted.");
  const exclusions = breakGlassArray(candidate.exclusions);
  if (exclusions === null || exclusions.some((value) => typeof value !== "string") || canonicalJson(exclusions) !== canonicalJson(BREAK_GLASS_EXCLUSIONS)) return breakGlassError("path_scope_invalid", "Break-glass exclusions are incomplete or widened.");
  if (!breakGlassClosed(candidate.mackEvidence, BREAK_GLASS_EVIDENCE_FIELDS) || candidate.mackEvidence.sourceKind !== "repository" || !breakGlassEvidencePath(candidate.mackEvidence.artifactPath) || candidate.mackEvidence.sequence !== 1 || candidate.mackEvidence.verdict !== "PASS" || !identifier(candidate.mackEvidence.evidenceId) || !breakGlassDigestValue(candidate.mackEvidence.evidenceDigest) || candidate.mackEvidence.reviewedRevision !== candidate.implementation.headRevision ||
      !breakGlassClosed(candidate.furyEvidence, BREAK_GLASS_FURY_EVIDENCE_FIELDS) || candidate.furyEvidence.sourceKind !== "repository" || !breakGlassEvidencePath(candidate.furyEvidence.artifactPath) || candidate.furyEvidence.sequence !== 2 || candidate.furyEvidence.verdict !== "APPROVE" || !identifier(candidate.furyEvidence.evidenceId) || !breakGlassDigestValue(candidate.furyEvidence.evidenceDigest) || candidate.furyEvidence.reviewedRevision !== candidate.implementation.headRevision || candidate.furyEvidence.mackEvidenceDigest !== candidate.mackEvidence.evidenceDigest) {
    return breakGlassError("evidence_binding_invalid", "Mack and Fury evidence must be repository-owned, ordered, and bound to the exact implementation HEAD.");
  }
  if (!breakGlassClosed(candidate.regressionFixture, BREAK_GLASS_REGRESSION_FIELDS) || candidate.regressionFixture.missionId !== "mission:issue-intake:HgnxEl-ce9oshquwYlZJJS5IQKfFSciS8CfYeQmFSiY" || candidate.regressionFixture.subjectId !== "github:RanSolo/shield-workspace/issue/406" || candidate.regressionFixture.implementationHead !== "400a60a0eb4bf6dbf549b08e3b99a89572a57cec" || candidate.regressionFixture.outcome !== "failed" || !identifier(candidate.regressionFixture.operationId) || !breakGlassDigestValue(candidate.regressionFixture.operationDigest) || !identifier(candidate.regressionFixture.reasonCode) || candidate.regressionFixture.headRevision !== candidate.regressionFixture.implementationHead) {
    return breakGlassError("failed_operation_invalid", "The unchanged #406 operation must remain a separate regression fixture.");
  }
  const evidenceRefs = Object.freeze([candidate.manualDecision.provenanceRef, candidate.plan.transitionPlanDigest, candidate.mackEvidence.evidenceDigest, candidate.furyEvidence.evidenceDigest, candidate.regressionFixture.operationDigest]);
  const authority: ReviewPublicationAuthorityV1 = {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    authorityKind: "review.publish",
    authorityRef: `break-glass-publication:${candidate.preparationId}`,
    missionId: candidate.missionId,
    subjectId: candidate.subjectId,
    missionRevisionId: candidate.plan.transitionPlanDigest,
    repositoryId: candidate.repositoryId,
    canonicalRepositoryRoot: candidate.canonicalRepositoryRoot,
    branch: candidate.branch,
    baseRevisionId: candidate.plan.planCommit,
    headRevisionId: candidate.implementation.headRevision,
    authorizedPaths: [...publicationPaths],
    permittedEffects: [...BREAK_GLASS_EFFECTS],
  };
  const semantic = computeReviewPublicationAuthoritySemanticIdentityV1(authority);
  if (semantic.state === "blocked") return breakGlassError("replay_conflict", "Derived publication PIN input is not a valid review-publication identity.");
  const bindingDigest = breakGlassDigest({
    constructionAuthority: candidate.constructionAuthority,
    manualDecision: candidate.manualDecision,
    plan: candidate.plan,
    implementation: { headRevision: candidate.implementation.headRevision, approvedPaths: implementationPaths },
    publication: { approvedPaths: publicationPaths, permittedEffects: BREAK_GLASS_EFFECTS },
    exclusions,
    mackEvidence: candidate.mackEvidence,
    furyEvidence: candidate.furyEvidence,
    regressionFixture: candidate.regressionFixture,
  });
  const ledgerBody = {
    contractVersion: "shield.break-glass-publication-preparation.v1" as const,
    entryId: `repair:${candidate.preparationId}`,
    writerSeatId: "may" as const,
    singleConsumer: true as const,
    failedOperationId: candidate.regressionFixture.operationId,
    failedOperationDigest: candidate.regressionFixture.operationDigest,
    bindingDigest,
    evidenceRefs,
    implementationHead: candidate.implementation.headRevision,
    transitionPlanDigest: candidate.plan.transitionPlanDigest,
  };
  const result = {
    state: "ready" as const,
    authority: "none" as const,
    contractVersion: "shield.break-glass-publication-preparation.v1" as const,
    preparationId: candidate.preparationId,
    writerSeatId: "may" as const,
    bindings: {
      missionId: candidate.missionId,
      subjectId: candidate.subjectId,
      repositoryId: candidate.repositoryId,
      constructionAuthority: structuredClone(candidate.constructionAuthority),
      manualDecision: structuredClone(candidate.manualDecision),
      plan: structuredClone(candidate.plan),
      implementationHead: candidate.implementation.headRevision,
      approvedImplementationPaths: [...implementationPaths],
      approvedPublicationPaths: [...publicationPaths],
      exclusions: [...exclusions] as string[],
      mackEvidence: structuredClone(candidate.mackEvidence),
      furyEvidence: structuredClone(candidate.furyEvidence),
    },
    repairLedger: { ...ledgerBody, entryDigest: breakGlassDigest(ledgerBody) },
    publicationPinInput: {
      authority: structuredClone(authority),
      authorityDigest: computeReviewPublicationAuthorityDigest(authority),
      semanticIdentity: semantic.semanticIdentity,
      requestedEffects: [...BREAK_GLASS_EFFECTS] as ["review.branch.push", "review.pull_request.create_draft"],
    },
  };
  return breakGlassFreeze(result);
}
