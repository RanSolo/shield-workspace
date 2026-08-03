import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import {
  evaluateFuryPlanGateV1,
  normalizeFuryPlanGateInputV1,
  type FuryPlanGateEnvelopeV1,
  type FuryPlanGateEvaluationV1,
  type FuryPlanGateExpectedBindingV1,
} from "../contracts/fury-plan-gate-v1.mjs";
import { canonicalJson } from "./mission-v2.mjs";
import {
  evaluateSeatDispatchAttributionV1,
  type SeatDispatchReceiptIdentityV1,
  type SeatDispatchReceiptProjectionV1,
} from "./seat-dispatch-receipt-v1.mjs";

export const FURY_PLAN_REVIEW_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION = "fury.plan-review-evidence.v1" as const;
export const FURY_PLAN_REVIEW_EVIDENCE_REASON_CODES = [
  "INVALID_EXPECTED_BINDING",
  "INVALID_EVIDENCE_CANDIDATE",
  "INVALID_REVIEW_EVIDENCE",
  "DUPLICATE_REVIEW_EVIDENCE",
  "CONFLICTING_REVIEW_EVIDENCE",
  "REVIEW_EVIDENCE_REQUIRED",
  "REVIEW_EVIDENCE_DIGEST_MISMATCH",
  "REVIEW_EVIDENCE_PLAN_DIGEST_MISMATCH",
  "REVIEW_EVIDENCE_BINDING_MISMATCH",
  "REVIEW_EVIDENCE_STALE",
  "WRONG_REVIEWER_SEAT",
  "INVALID_REVIEW_ATTRIBUTION",
] as const;

export type FuryPlanReviewEvidenceReasonCodeV1 =
  (typeof FURY_PLAN_REVIEW_EVIDENCE_REASON_CODES)[number];

export interface FuryPlanReviewEvidenceExpectedBindingV1 {
  readonly schemaVersion: 1;
  readonly missionId: string;
  readonly missionRevisionId: string;
  readonly subjectId: string;
  readonly repositoryId: string;
  readonly baseBranch: string;
  readonly branch: string;
  readonly prNumber: number;
  readonly blueprintArtifactId: string;
  readonly blueprintArtifactPath: string;
  readonly blueprintArtifactKind: "implementation_blueprint";
  readonly blueprintOwningSeatId: "may";
  readonly artifactRevisionId: string;
  readonly repositoryRevisionId: string;
}

export interface FuryPlanReviewEvidenceCandidateV1 {
  readonly candidateSchemaVersion: 1;
  readonly contractVersion: "fury.plan-review-evidence.v1";
  readonly evidenceId: string;
  readonly evidenceDigest: string;
  readonly missionId: string;
  readonly missionRevisionId: string;
  readonly planDigest: string;
  readonly artifactRevisionId: string;
  readonly repositoryRevisionId: string;
}

export interface FuryPlanReviewEvidenceV1 {
  readonly evidenceSchemaVersion: 1;
  readonly contractVersion: "fury.plan-review-evidence.v1";
  readonly authority: "non_authoritative";
  readonly evidenceId: string;
  readonly missionId: string;
  readonly missionRevisionId: string;
  readonly subjectId: string;
  readonly repositoryId: string;
  readonly baseBranch: string;
  readonly branch: string;
  readonly prNumber: number;
  readonly planDigest: string;
  readonly blueprintArtifactId: string;
  readonly blueprintArtifactPath: string;
  readonly artifactRevisionId: string;
  readonly repositoryRevisionId: string;
  readonly furyDispatchIdentity: Readonly<SeatDispatchReceiptIdentityV1>;
  readonly reviewerSeatId: "fury";
  readonly reasoningRuntimeId: string;
  readonly reasoningModel: string;
  readonly toolExecutorId: string;
  readonly planGate: Readonly<FuryPlanGateEnvelopeV1>;
  readonly evidenceDigest: string;
}

export type FuryPlanReviewEvidenceReplayResultV1 =
  | { readonly state: "valid"; readonly records: readonly FuryPlanReviewEvidenceV1[] }
  | {
      readonly state: "invalid";
      readonly code: "invalid" | "duplicate" | "conflict";
      readonly reasonCode: FuryPlanReviewEvidenceReasonCodeV1;
    };

export type FuryPlanReviewEvidenceEvaluationV1 =
  | {
      readonly state: "evaluated";
      readonly evidenceSchemaVersion: 1;
      readonly contractVersion: "fury.plan-review-evidence.v1";
      readonly authority: "non_authoritative";
      readonly dispatchEligibility: "eligible" | "ineligible";
      readonly reasonCodes: readonly string[];
      readonly binding: Readonly<FuryPlanReviewEvidenceExpectedBindingV1>;
      readonly evidence: Readonly<FuryPlanReviewEvidenceV1> | null;
      readonly planGateEvaluation: Readonly<FuryPlanGateEvaluationV1> | null;
    }
  | {
      readonly state: "invalid";
      readonly evidenceSchemaVersion: 1;
      readonly authority: "non_authoritative";
      readonly dispatchEligibility: "ineligible";
      readonly reasonCodes: readonly FuryPlanReviewEvidenceReasonCodeV1[];
    };

export type FuryPlanReviewEvidenceCreationResultV1 =
  | { readonly state: "created"; readonly evidence: Readonly<FuryPlanReviewEvidenceV1> }
  | {
      readonly state: "invalid";
      readonly authority: "non_authoritative";
      readonly reasonCodes: readonly FuryPlanReviewEvidenceReasonCodeV1[];
    };

const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{40,64})$/u;

const EXPECTED_FIELDS = [
  "schemaVersion", "missionId", "missionRevisionId", "subjectId", "repositoryId",
  "baseBranch", "branch", "prNumber", "blueprintArtifactId", "blueprintArtifactPath",
  "blueprintArtifactKind", "blueprintOwningSeatId", "artifactRevisionId",
  "repositoryRevisionId",
] as const;
const CANDIDATE_FIELDS = [
  "candidateSchemaVersion", "contractVersion", "evidenceId", "evidenceDigest", "missionId",
  "missionRevisionId", "planDigest", "artifactRevisionId", "repositoryRevisionId",
] as const;
const EVIDENCE_FIELDS = [
  "evidenceSchemaVersion", "contractVersion", "authority", "evidenceId", "missionId",
  "missionRevisionId", "subjectId", "repositoryId", "baseBranch", "branch", "prNumber",
  "planDigest", "blueprintArtifactId", "blueprintArtifactPath", "artifactRevisionId",
  "repositoryRevisionId", "furyDispatchIdentity", "reviewerSeatId", "reasoningRuntimeId",
  "reasoningModel", "toolExecutorId", "planGate", "evidenceDigest",
] as const;
const DISPATCH_IDENTITY_FIELDS = [
  "receiptId", "dispatchId", "parentMissionId", "parentMissionRevision", "parentSessionId",
  "childTaskId", "childSessionId", "accountableSeatId", "repositoryId",
  "repositoryWorkspaceId", "repositoryRevision", "subjectId", "subjectRevision", "artifactId",
  "artifactRevision",
] as const;
const CREATION_FIELDS = ["planGate", "binding", "dispatchIdentity", "rawReceiptEntries"] as const;

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("base64url")}`;
}

function plain(value: unknown): value is Record<string, unknown> {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
      !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function record(value: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (!plain(value)) return null;
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string") ||
        fields.some((field) => !keys.includes(field)) ||
        keys.some((key) => typeof key === "string" && !fields.includes(key))) return null;
    const output: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set ||
          !descriptor.enumerable) return null;
      output[field] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= 512 && IDENTIFIER.test(value);
}

function artifactPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 ||
      value.startsWith("/") || value.includes("\\") || value.includes("%") ||
      /[\u0000-\u001f\u007f]/u.test(value)) return false;
  return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function normalizeExpected(input: unknown): FuryPlanReviewEvidenceExpectedBindingV1 | null {
  const value = record(input, EXPECTED_FIELDS);
  if (value === null || value.schemaVersion !== 1 || !identifier(value.missionId) ||
      typeof value.missionRevisionId !== "string" || !DIGEST.test(value.missionRevisionId) ||
      !identifier(value.subjectId) || typeof value.repositoryId !== "string" ||
      !REPOSITORY.test(value.repositoryId) || !identifier(value.baseBranch) ||
      !identifier(value.branch) || !Number.isSafeInteger(value.prNumber) ||
      (value.prNumber as number) < 1 || !identifier(value.blueprintArtifactId) ||
      !artifactPath(value.blueprintArtifactPath) ||
      value.blueprintArtifactKind !== "implementation_blueprint" ||
      value.blueprintOwningSeatId !== "may" || typeof value.artifactRevisionId !== "string" ||
      !REVISION.test(value.artifactRevisionId) || typeof value.repositoryRevisionId !== "string" ||
      !/^[0-9a-f]{40,64}$/u.test(value.repositoryRevisionId)) return null;
  return Object.freeze(value as unknown as FuryPlanReviewEvidenceExpectedBindingV1);
}

function normalizeCandidate(input: unknown): FuryPlanReviewEvidenceCandidateV1 | null {
  const value = record(input, CANDIDATE_FIELDS);
  if (value === null || value.candidateSchemaVersion !== 1 ||
      value.contractVersion !== FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION ||
      !identifier(value.evidenceId) || typeof value.evidenceDigest !== "string" ||
      !DIGEST.test(value.evidenceDigest) || !identifier(value.missionId) ||
      typeof value.missionRevisionId !== "string" || !DIGEST.test(value.missionRevisionId) ||
      typeof value.planDigest !== "string" || !DIGEST.test(value.planDigest) ||
      typeof value.artifactRevisionId !== "string" || !REVISION.test(value.artifactRevisionId) ||
      typeof value.repositoryRevisionId !== "string" ||
      !/^[0-9a-f]{40,64}$/u.test(value.repositoryRevisionId)) return null;
  return Object.freeze(value as unknown as FuryPlanReviewEvidenceCandidateV1);
}

export function normalizeFuryPlanReviewEvidenceCandidateV1(input: unknown):
  | { readonly state: "valid"; readonly candidate: Readonly<FuryPlanReviewEvidenceCandidateV1> | null }
  | { readonly state: "invalid" } {
  try {
    if (input === null) return Object.freeze({ state: "valid" as const, candidate: null });
    const candidate = normalizeCandidate(input);
    return candidate === null
      ? Object.freeze({ state: "invalid" as const })
      : Object.freeze({ state: "valid" as const, candidate });
  } catch {
    return Object.freeze({ state: "invalid" as const });
  }
}

function normalizeDispatchIdentity(input: unknown): SeatDispatchReceiptIdentityV1 | null {
  const value = record(input, DISPATCH_IDENTITY_FIELDS);
  if (value === null || DISPATCH_IDENTITY_FIELDS.some((field) => !identifier(value[field]))) return null;
  return Object.freeze(value as unknown as SeatDispatchReceiptIdentityV1);
}

function repositoryParts(repositoryId: string): [string, string] | null {
  const parts = repositoryId.split("/");
  return parts.length === 2 && parts.every((part) => part.length > 0)
    ? [parts[0] as string, parts[1] as string]
    : null;
}

function gateExpected(binding: FuryPlanReviewEvidenceExpectedBindingV1): FuryPlanGateExpectedBindingV1 | null {
  const parts = repositoryParts(binding.repositoryId);
  if (parts === null) return null;
  return Object.freeze({
    schemaVersion: 1,
    assuranceKind: "host_asserted_non_authoritative",
    missionId: binding.missionId,
    subjectId: binding.subjectId,
    repositoryOwner: parts[0],
    repositoryName: parts[1],
    baseBranch: binding.baseBranch,
    missionBranch: binding.branch,
    prNumber: binding.prNumber,
    blueprintArtifactId: binding.blueprintArtifactId,
    blueprintArtifactPath: binding.blueprintArtifactPath,
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    currentBlueprintRevisionId: binding.artifactRevisionId,
  });
}

function gateMatchesBinding(
  gate: FuryPlanGateEnvelopeV1,
  binding: FuryPlanReviewEvidenceExpectedBindingV1,
): boolean {
  const expected = gateExpected(binding);
  if (expected === null) return false;
  const review = gate.review;
  for (const field of [
    "missionId", "subjectId", "repositoryOwner", "repositoryName", "baseBranch",
    "missionBranch", "prNumber", "blueprintArtifactId", "blueprintArtifactPath",
    "blueprintArtifactKind", "blueprintOwningSeatId",
  ] as const) if (review[field] !== expected[field]) return false;
  const current = gate.reconciliation?.correctedRevisionId ?? review.reviewedRevisionId;
  return current === binding.artifactRevisionId && current === binding.repositoryRevisionId;
}

function dispatchMatchesBinding(
  identity: SeatDispatchReceiptIdentityV1,
  binding: FuryPlanReviewEvidenceExpectedBindingV1,
): boolean {
  return identity.parentMissionId === binding.missionId &&
    identity.parentMissionRevision === binding.missionRevisionId &&
    identity.accountableSeatId === "fury" && identity.repositoryId === binding.repositoryId &&
    identity.repositoryRevision === binding.repositoryRevisionId &&
    identity.subjectId === binding.subjectId && identity.artifactId === binding.blueprintArtifactId &&
    identity.artifactRevision === binding.artifactRevisionId;
}

function identityFromProjection(projection: SeatDispatchReceiptProjectionV1): Readonly<SeatDispatchReceiptIdentityV1> {
  return Object.freeze(Object.fromEntries(DISPATCH_IDENTITY_FIELDS.map((field) => [field, projection[field]])) as
    unknown as SeatDispatchReceiptIdentityV1);
}

function finalAttribution(projection: SeatDispatchReceiptProjectionV1):
  { runtimeId: string; model: string; executorId: string } | null {
  const runtime = projection.runtimeHostHistory.at(-1);
  const executor = projection.executorHostHistory.at(-1);
  if (!runtime || !executor || !identifier(runtime.runtimeId) || !identifier(runtime.model) ||
      !identifier(executor.executorId) || runtime.runtimeId === executor.executorId ||
      [runtime.runtimeId, executor.executorId].includes("fury")) return null;
  return { runtimeId: runtime.runtimeId, model: runtime.model, executorId: executor.executorId };
}

function semanticEvidence(input: Omit<FuryPlanReviewEvidenceV1, "evidenceId" | "evidenceDigest">): unknown {
  return input;
}

function deterministicEvidenceId(semantic: unknown): string {
  return `fury-plan-review:${digest(semantic).slice("sha256:".length)}`;
}

function reviewKey(recordValue: FuryPlanReviewEvidenceV1): string {
  return canonicalJson({
    missionId: recordValue.missionId,
    missionRevisionId: recordValue.missionRevisionId,
    subjectId: recordValue.subjectId,
    repositoryId: recordValue.repositoryId,
    branch: recordValue.branch,
    prNumber: recordValue.prNumber,
    blueprintArtifactId: recordValue.blueprintArtifactId,
    artifactRevisionId: recordValue.artifactRevisionId,
    repositoryRevisionId: recordValue.repositoryRevisionId,
  });
}

function normalizeEvidence(input: unknown): FuryPlanReviewEvidenceV1 | null {
  try {
    const value = record(input, EVIDENCE_FIELDS);
    if (value === null || value.evidenceSchemaVersion !== 1 ||
        value.contractVersion !== FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION ||
        value.authority !== "non_authoritative" || !identifier(value.evidenceId) ||
        !identifier(value.missionId) || typeof value.missionRevisionId !== "string" ||
        !DIGEST.test(value.missionRevisionId) || !identifier(value.subjectId) ||
        typeof value.repositoryId !== "string" || !REPOSITORY.test(value.repositoryId) ||
        !identifier(value.baseBranch) || !identifier(value.branch) ||
        !Number.isSafeInteger(value.prNumber) || (value.prNumber as number) < 1 ||
        typeof value.planDigest !== "string" || !DIGEST.test(value.planDigest) ||
        !identifier(value.blueprintArtifactId) || !artifactPath(value.blueprintArtifactPath) ||
        typeof value.artifactRevisionId !== "string" || !REVISION.test(value.artifactRevisionId) ||
        typeof value.repositoryRevisionId !== "string" ||
        !/^[0-9a-f]{40,64}$/u.test(value.repositoryRevisionId) ||
        value.reviewerSeatId !== "fury" || !identifier(value.reasoningRuntimeId) ||
        !identifier(value.reasoningModel) || !identifier(value.toolExecutorId) ||
        value.reasoningRuntimeId === value.toolExecutorId ||
        typeof value.evidenceDigest !== "string" || !DIGEST.test(value.evidenceDigest)) return null;
    const identity = normalizeDispatchIdentity(value.furyDispatchIdentity);
    const normalizedGate = normalizeFuryPlanGateInputV1(value.planGate);
    if (identity === null || normalizedGate.state !== "valid" || normalizedGate.planGate === null) return null;
    const binding = normalizeExpected({
      schemaVersion: 1,
      missionId: value.missionId,
      missionRevisionId: value.missionRevisionId,
      subjectId: value.subjectId,
      repositoryId: value.repositoryId,
      baseBranch: value.baseBranch,
      branch: value.branch,
      prNumber: value.prNumber,
      blueprintArtifactId: value.blueprintArtifactId,
      blueprintArtifactPath: value.blueprintArtifactPath,
      blueprintArtifactKind: "implementation_blueprint",
      blueprintOwningSeatId: "may",
      artifactRevisionId: value.artifactRevisionId,
      repositoryRevisionId: value.repositoryRevisionId,
    });
    if (binding === null || !gateMatchesBinding(normalizedGate.planGate, binding) ||
        !dispatchMatchesBinding(identity, binding) ||
        normalizedGate.planGate.review.reasoningRuntimeId !== value.reasoningRuntimeId ||
        normalizedGate.planGate.review.toolExecutorId !== value.toolExecutorId) return null;
    const planDigest = digest(normalizedGate.planGate);
    if (value.planDigest !== planDigest) return null;
    const semantic = {
      evidenceSchemaVersion: 1 as const,
      contractVersion: FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION,
      authority: "non_authoritative" as const,
      missionId: value.missionId as string,
      missionRevisionId: value.missionRevisionId as string,
      subjectId: value.subjectId as string,
      repositoryId: value.repositoryId as string,
      baseBranch: value.baseBranch as string,
      branch: value.branch as string,
      prNumber: value.prNumber as number,
      planDigest,
      blueprintArtifactId: value.blueprintArtifactId as string,
      blueprintArtifactPath: value.blueprintArtifactPath as string,
      artifactRevisionId: value.artifactRevisionId as string,
      repositoryRevisionId: value.repositoryRevisionId as string,
      furyDispatchIdentity: identity,
      reviewerSeatId: "fury" as const,
      reasoningRuntimeId: value.reasoningRuntimeId as string,
      reasoningModel: value.reasoningModel as string,
      toolExecutorId: value.toolExecutorId as string,
      planGate: normalizedGate.planGate,
    };
    const evidenceId = deterministicEvidenceId(semantic);
    if (value.evidenceId !== evidenceId) return null;
    const withoutDigest = { ...semantic, evidenceId };
    const evidenceDigest = digest(withoutDigest);
    if (value.evidenceDigest !== evidenceDigest) return null;
    return Object.freeze({ ...withoutDigest, evidenceDigest });
  } catch {
    return null;
  }
}

export function deriveFuryPlanReviewEvidenceV1(input: unknown): FuryPlanReviewEvidenceCreationResultV1 {
  try {
    const value = record(input, CREATION_FIELDS);
    if (value === null) return creationInvalid("INVALID_REVIEW_EVIDENCE");
    const binding = normalizeExpected(value.binding);
    const dispatchIdentity = normalizeDispatchIdentity(value.dispatchIdentity);
    const normalizedGate = normalizeFuryPlanGateInputV1(value.planGate);
    if (binding === null || dispatchIdentity === null || normalizedGate.state !== "valid" ||
        normalizedGate.planGate === null || !gateMatchesBinding(normalizedGate.planGate, binding)) {
      return creationInvalid("INVALID_REVIEW_EVIDENCE");
    }
    if (!dispatchMatchesBinding(dispatchIdentity, binding)) {
      return creationInvalid("INVALID_REVIEW_ATTRIBUTION");
    }
    const attribution = evaluateSeatDispatchAttributionV1({
      ...dispatchIdentity,
      artifact: normalizedGate.planGate,
      rawReceiptEntries: value.rawReceiptEntries,
    });
    if (attribution.state !== "attributed") return creationInvalid("INVALID_REVIEW_ATTRIBUTION");
    const observed = finalAttribution(attribution.receipt);
    if (observed === null || normalizedGate.planGate.review.reasoningRuntimeId !== observed.runtimeId ||
        normalizedGate.planGate.review.toolExecutorId !== observed.executorId) {
      return creationInvalid("INVALID_REVIEW_ATTRIBUTION");
    }
    const semantic = {
      evidenceSchemaVersion: 1 as const,
      contractVersion: FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION,
      authority: "non_authoritative" as const,
      missionId: binding.missionId,
      missionRevisionId: binding.missionRevisionId,
      subjectId: binding.subjectId,
      repositoryId: binding.repositoryId,
      baseBranch: binding.baseBranch,
      branch: binding.branch,
      prNumber: binding.prNumber,
      planDigest: digest(normalizedGate.planGate),
      blueprintArtifactId: binding.blueprintArtifactId,
      blueprintArtifactPath: binding.blueprintArtifactPath,
      artifactRevisionId: binding.artifactRevisionId,
      repositoryRevisionId: binding.repositoryRevisionId,
      furyDispatchIdentity: identityFromProjection(attribution.receipt),
      reviewerSeatId: "fury" as const,
      reasoningRuntimeId: observed.runtimeId,
      reasoningModel: observed.model,
      toolExecutorId: observed.executorId,
      planGate: normalizedGate.planGate,
    };
    const evidenceId = deterministicEvidenceId(semanticEvidence(semantic));
    const withoutDigest = { ...semantic, evidenceId };
    return { state: "created", evidence: Object.freeze({ ...withoutDigest, evidenceDigest: digest(withoutDigest) }) };
  } catch {
    return creationInvalid("INVALID_REVIEW_EVIDENCE");
  }
}

function creationInvalid(reason: FuryPlanReviewEvidenceReasonCodeV1): FuryPlanReviewEvidenceCreationResultV1 {
  return Object.freeze({
    state: "invalid" as const,
    authority: "non_authoritative" as const,
    reasonCodes: Object.freeze([reason]),
  });
}

export function replayFuryPlanReviewEvidenceLedgerV1(input: unknown): FuryPlanReviewEvidenceReplayResultV1 {
  try {
    if (!Array.isArray(input) || isProxy(input) || Object.getPrototypeOf(input) !== Array.prototype) {
      return { state: "invalid", code: "invalid", reasonCode: "INVALID_REVIEW_EVIDENCE" };
    }
    const descriptors = Object.getOwnPropertyDescriptors(input) as Record<string, PropertyDescriptor>;
    const lengthValue = Object.getOwnPropertyDescriptor(input, "length")?.value as unknown;
    if (!Number.isSafeInteger(lengthValue) || (lengthValue as number) < 0 ||
        (lengthValue as number) > 1024 || Reflect.ownKeys(input).length !== (lengthValue as number) + 1) {
      return { state: "invalid", code: "invalid", reasonCode: "INVALID_REVIEW_EVIDENCE" };
    }
    const length = lengthValue as number;
    const records: FuryPlanReviewEvidenceV1[] = [];
    const byId = new Map<string, FuryPlanReviewEvidenceV1>();
    const byKey = new Map<string, FuryPlanReviewEvidenceV1>();
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set ||
          !descriptor.enumerable) {
        return { state: "invalid", code: "invalid", reasonCode: "INVALID_REVIEW_EVIDENCE" };
      }
      const normalized = normalizeEvidence(descriptor.value);
      if (normalized === null) {
        return { state: "invalid", code: "invalid", reasonCode: "INVALID_REVIEW_EVIDENCE" };
      }
      const existingId = byId.get(normalized.evidenceId);
      if (existingId !== undefined) {
        const same = canonicalJson(existingId) === canonicalJson(normalized);
        return {
          state: "invalid",
          code: same ? "duplicate" : "conflict",
          reasonCode: same ? "DUPLICATE_REVIEW_EVIDENCE" : "CONFLICTING_REVIEW_EVIDENCE",
        };
      }
      const key = reviewKey(normalized);
      if (byKey.has(key)) {
        return { state: "invalid", code: "conflict", reasonCode: "CONFLICTING_REVIEW_EVIDENCE" };
      }
      byId.set(normalized.evidenceId, normalized);
      byKey.set(key, normalized);
      records.push(normalized);
    }
    return Object.freeze({ state: "valid" as const, records: Object.freeze(records) });
  } catch {
    return { state: "invalid", code: "invalid", reasonCode: "INVALID_REVIEW_EVIDENCE" };
  }
}

function invalidEvaluation(reason: FuryPlanReviewEvidenceReasonCodeV1): FuryPlanReviewEvidenceEvaluationV1 {
  return Object.freeze({
    state: "invalid" as const,
    evidenceSchemaVersion: 1 as const,
    authority: "non_authoritative" as const,
    dispatchEligibility: "ineligible" as const,
    reasonCodes: Object.freeze([reason]),
  });
}

function evaluated(
  binding: FuryPlanReviewEvidenceExpectedBindingV1,
  evidence: FuryPlanReviewEvidenceV1 | null,
  reasonCodes: readonly string[],
  gate: FuryPlanGateEvaluationV1 | null,
): FuryPlanReviewEvidenceEvaluationV1 {
  return Object.freeze({
    state: "evaluated" as const,
    evidenceSchemaVersion: 1 as const,
    contractVersion: FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION,
    authority: "non_authoritative" as const,
    dispatchEligibility: reasonCodes.length === 0 && gate?.dispatchEligibility === "eligible"
      ? "eligible" as const
      : "ineligible" as const,
    reasonCodes: Object.freeze([...reasonCodes]),
    binding,
    evidence,
    planGateEvaluation: gate,
  });
}

export function evaluateFuryPlanReviewEvidenceV1(
  candidateInput: unknown,
  recordsInput: unknown,
  rawReceiptEntries: unknown,
  expectedInput: unknown,
): FuryPlanReviewEvidenceEvaluationV1 {
  try {
    const expected = normalizeExpected(expectedInput);
    if (expected === null) return invalidEvaluation("INVALID_EXPECTED_BINDING");
    const candidate = normalizeCandidate(candidateInput);
    if (candidate === null) return invalidEvaluation("INVALID_EVIDENCE_CANDIDATE");
    const replay = replayFuryPlanReviewEvidenceLedgerV1(recordsInput);
    if (replay.state === "invalid") return invalidEvaluation(replay.reasonCode);
    const evidence = replay.records.find((item) => item.evidenceId === candidate.evidenceId) ?? null;
    if (evidence === null) return evaluated(expected, null, ["REVIEW_EVIDENCE_REQUIRED"], null);
    if (candidate.evidenceDigest !== evidence.evidenceDigest) {
      return evaluated(expected, evidence, ["REVIEW_EVIDENCE_DIGEST_MISMATCH"], null);
    }
    const recomputedPlanDigest = digest(evidence.planGate);
    if (candidate.planDigest !== evidence.planDigest || evidence.planDigest !== recomputedPlanDigest) {
      return evaluated(expected, evidence, ["REVIEW_EVIDENCE_PLAN_DIGEST_MISMATCH"], null);
    }
    if (candidate.missionId !== evidence.missionId ||
        candidate.missionRevisionId !== evidence.missionRevisionId) {
      return evaluated(expected, evidence, ["REVIEW_EVIDENCE_BINDING_MISMATCH"], null);
    }
    if (candidate.artifactRevisionId !== evidence.artifactRevisionId ||
        candidate.repositoryRevisionId !== evidence.repositoryRevisionId ||
        candidate.artifactRevisionId !== expected.artifactRevisionId ||
        candidate.repositoryRevisionId !== expected.repositoryRevisionId) {
      return evaluated(expected, evidence, ["REVIEW_EVIDENCE_STALE"], null);
    }
    if (evidence.missionId !== expected.missionId ||
        evidence.missionRevisionId !== expected.missionRevisionId ||
        evidence.subjectId !== expected.subjectId || evidence.repositoryId !== expected.repositoryId ||
        evidence.baseBranch !== expected.baseBranch || evidence.branch !== expected.branch ||
        evidence.prNumber !== expected.prNumber ||
        evidence.blueprintArtifactId !== expected.blueprintArtifactId ||
        evidence.blueprintArtifactPath !== expected.blueprintArtifactPath) {
      return evaluated(expected, evidence, ["REVIEW_EVIDENCE_BINDING_MISMATCH"], null);
    }
    if (evidence.reviewerSeatId !== "fury" || evidence.furyDispatchIdentity.accountableSeatId !== "fury") {
      return evaluated(expected, evidence, ["WRONG_REVIEWER_SEAT"], null);
    }
    const attribution = evaluateSeatDispatchAttributionV1({
      ...evidence.furyDispatchIdentity,
      artifact: evidence.planGate,
      rawReceiptEntries,
    });
    if (attribution.state !== "attributed") {
      return evaluated(expected, evidence, ["INVALID_REVIEW_ATTRIBUTION"], null);
    }
    const observed = finalAttribution(attribution.receipt);
    if (observed === null || observed.runtimeId !== evidence.reasoningRuntimeId ||
        observed.model !== evidence.reasoningModel || observed.executorId !== evidence.toolExecutorId ||
        evidence.planGate.review.reasoningRuntimeId !== observed.runtimeId ||
        evidence.planGate.review.toolExecutorId !== observed.executorId) {
      return evaluated(expected, evidence, ["INVALID_REVIEW_ATTRIBUTION"], null);
    }
    const gateBinding = gateExpected(expected);
    if (gateBinding === null) return invalidEvaluation("INVALID_EXPECTED_BINDING");
    const gateEvaluation = evaluateFuryPlanGateV1(evidence.planGate, gateBinding);
    return evaluated(expected, evidence, gateEvaluation.reasonCodes, gateEvaluation);
  } catch {
    return invalidEvaluation("INVALID_REVIEW_EVIDENCE");
  }
}
