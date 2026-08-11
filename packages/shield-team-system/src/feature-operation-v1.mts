import { createHash, createPublicKey, verify } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  computeEd25519SigningKeyRef,
  type TrustedHumanBinding,
} from "./mission-v2.mjs";

export const FEATURE_OPERATION_SCHEMA_VERSION = 1 as const;
export const FEATURE_OPERATION_CONTRACT_VERSION = "feature.operation.v1" as const;
export const FEATURE_OPERATION_AUTHORITY_KIND = "epic_wheels_up" as const;
export const FEATURE_OPERATION_DERIVATION_KINDS = Object.freeze([
  "child_draft_pr_create",
  "child_implementation",
  "child_initiation",
  "child_merge_to_feature",
  "child_revert_on_feature",
  "feature_branch_create",
  "feature_workspace_draft_pr_create",
] as const);
export const FEATURE_OPERATION_FIXED_EXCLUSIONS = Object.freeze([
  "deploy",
  "destructive_cleanup",
  "dynamic_command_selection",
  "main",
  "merge_to_main",
  "release",
  "wildcard_children",
  "wildcard_revisions",
] as const);
export const FEATURE_OPERATION_PROHIBITED_EFFECTS = Object.freeze([
  "authority_delegation_beyond_plan",
  "deployment",
  "feature_workspace_pr_merge",
  "feature_workspace_pr_ready",
  "merge_to_main",
  "release",
  "scope_expansion",
  "stage_target_substitution",
  "undisclosed_children",
] as const);
export const FEATURE_OPERATION_BLOCKED_REASONS = Object.freeze([
  "PLAN_INVALID",
  "SIGNED_AUTHORITY_INVALID",
  "TRUSTED_COULSON_BINDING_INVALID",
  "AUTHORITY_SIGNATURE_INVALID",
  "REPLAY_CONTEXT_INVALID",
  "IDENTITY_OR_DIGEST_MISMATCH",
  "AUTHORITY_OR_LINEAGE_INACTIVE",
  "LIFECYCLE_BLOCKED",
  "SEQUENCE_MISMATCH",
  "AUTHORITY_EXPIRED",
  "CANDIDATE_INVALID",
  "STAGE_OR_EVIDENCE_INAPPLICABLE",
  "CHILD_OR_DEPENDENCY_INELIGIBLE",
  "FEATURE_OR_CHILD_REVISION_STALE",
  "SCOPE_NOT_STRICT_SUBSET",
  "BRANCH_TARGET_OR_METHOD_INVALID",
  "INTEGRATION_EVIDENCE_INVALID",
  "BOUNDS_EXHAUSTED",
  "EFFECT_KEY_REUSED",
] as const);

export type FeatureOperationDerivationKindV1 = (typeof FEATURE_OPERATION_DERIVATION_KINDS)[number];
export type FeatureOperationBlockedReasonV1 = (typeof FEATURE_OPERATION_BLOCKED_REASONS)[number];
export type FeatureOperationLifecycleStateV1 =
  | "active" | "paused" | "cancelled" | "expired" | "integrated" | "rollback_pending" | "superseded";
export type FeatureOperationRiskV1 = "low" | "moderate" | "high";

export interface FeatureOperationSourceProvenanceV1 {
  authority: "none";
  sourceRef: string;
}

export interface FeatureOperationAcceptanceCriterionV1 {
  criterionId: string;
  statement: string;
}

export interface FeatureOperationRequiredGatesV1 {
  mack: true;
  fury: true;
  humanGateIds: readonly string[];
}

export interface FeatureOperationRequestedGatesV1 {
  mack: boolean;
  fury: boolean;
  humanGateIds: readonly string[];
}

export interface FeatureOperationChildV1 {
  childId: string;
  order: number;
  objective: string;
  dependsOn: readonly string[];
  branchName: string;
  repositoryId: string;
  riskClassification: FeatureOperationRiskV1;
  acceptanceCriterionIds: readonly string[];
  permittedDerivations: readonly FeatureOperationDerivationKindV1[];
  allowedRelativePaths: readonly string[];
  allowedActionIds: readonly string[];
  allowedEffectKeys: readonly string[];
  allowedCapabilityIds: readonly string[];
  allowedValidationIds: readonly string[];
  allowedPublicationOperations: readonly string[];
  requiredGates: FeatureOperationRequiredGatesV1;
  exclusions: readonly string[];
  maxImplementationAttempts: number;
  maxPublicationAttempts: number;
  maxIntegrationAttempts: number;
  maxRollbackAttempts: number;
  maxRetries: number;
}

export interface FeatureOperationLimitsV1 {
  maxDurationSeconds: number;
  maxChildren: number;
  maxConcurrency: number;
  maxFeatureBranchCreateAttempts: number;
  maxFeatureWorkspaceDraftPrAttempts: number;
  maxTotalChildAttempts: number;
  maxTotalIntegrationAttempts: number;
  maxTotalRollbackAttempts: number;
  maxCapturedEvidence: number;
}

export interface FeatureOperationPlanV1 {
  schemaVersion: 1;
  contractVersion: "feature.operation.v1";
  operationId: string;
  objective: string;
  sourceProvenance: FeatureOperationSourceProvenanceV1 | null;
  repositoryId: string;
  baseBranch: string;
  baseRevision: string;
  baseTreeDigest: string;
  featureBranch: string;
  acceptanceCriteria: readonly FeatureOperationAcceptanceCriterionV1[];
  children: readonly FeatureOperationChildV1[];
  eligibilityOrder: readonly string[];
  integrationPolicy: {
    targetBranch: string;
    allowedMethods: readonly string[];
  };
  lifecyclePolicy: {
    amendmentsRequireFreshAuthority: true;
    pauseSupported: true;
    cancellationSupported: true;
    rollbackMethod: "revert_commit";
    expiryEnforced: true;
    escalationOnAmbiguity: true;
  };
  limits: FeatureOperationLimitsV1;
  finalGates: {
    fitzRequired: true;
    simmons: "conditional";
    coulsonRequired: true;
  };
  exclusions: readonly string[];
  expiresAt: string;
  planSequence: number;
  predecessorPlanDigest: string | null;
  planDigest: string;
}

export interface FeatureOperationAuthorityV1 {
  schemaVersion: 1;
  contractVersion: "feature.operation.v1";
  authorityKind: "epic_wheels_up";
  authorityId: string;
  missionId: string;
  operationId: string;
  plan: FeatureOperationPlanV1;
  planDigest: string;
  repositoryId: string;
  baseBranch: string;
  baseRevision: string;
  featureBranch: string;
  operationSequence: number;
  journalSequence: number;
  issuedAt: string;
  expiresAt: string;
  limits: FeatureOperationLimitsV1;
  permittedDerivations: readonly FeatureOperationDerivationKindV1[];
  prohibitedEffects: readonly string[];
  humanPrincipalId: string;
  humanBindingId: string;
  signingKeyRef: string;
  authorityDigest: string;
}

export interface SignedFeatureOperationAuthorityV1 {
  payload: FeatureOperationAuthorityV1;
  signatureBase64: string;
}

export interface FeatureOperationAuthorityVerificationInputV1 {
  expectedMissionId: string;
  expectedOperationId: string;
  expectedOperationSequence: number;
  expectedJournalSequence: number;
  trustedBindings: readonly TrustedHumanBinding[];
}

export interface FeatureOperationPlanLineageEntryV1 {
  planSequence: number;
  planDigest: string;
  predecessorPlanDigest: string | null;
  authorityDigest: string;
  active: boolean;
}

interface FeatureTransitionCommonV1 {
  operationSequence: number;
  effectKey: string;
  priorHeadRevision: string;
  priorTreeDigest: string;
  resultingHeadRevision: string;
  resultingTreeDigest: string;
  receiptDigest: string;
}

export interface FeatureOperationGenesisTransitionV1 extends FeatureTransitionCommonV1 {
  kind: "genesis";
}

export interface FeatureOperationIntegrationTransitionV1 extends FeatureTransitionCommonV1 {
  kind: "integration";
  childId: string;
  childHeadRevision: string;
  childTreeDigest: string;
}

export interface FeatureOperationRollbackTransitionV1 extends FeatureTransitionCommonV1 {
  kind: "rollback";
  childId: string;
  revertedIntegrationReceiptDigest: string;
}

export type FeatureOperationTransitionV1 =
  | FeatureOperationGenesisTransitionV1
  | FeatureOperationIntegrationTransitionV1
  | FeatureOperationRollbackTransitionV1;

export interface FeatureOperationAcceptedIntegrationV1 {
  childId: string;
  operationSequence: number;
  effectKey: string;
  priorHeadRevision: string;
  priorTreeDigest: string;
  resultingHeadRevision: string;
  resultingTreeDigest: string;
  receiptDigest: string;
  reverted: boolean;
}

export interface FeatureOperationAcceptedRollbackV1 {
  childId: string;
  operationSequence: number;
  effectKey: string;
  revertedIntegrationReceiptDigest: string;
  priorHeadRevision: string;
  priorTreeDigest: string;
  resultingHeadRevision: string;
  resultingTreeDigest: string;
  receiptDigest: string;
}

export interface FeatureOperationChildCountersV1 {
  childId: string;
  initiationAttempts: number;
  implementationAttempts: number;
  publicationAttempts: number;
  integrationAttempts: number;
  rollbackAttempts: number;
  retryAttempts: number;
}

export interface FeatureOperationActiveLeaseV1 {
  leaseId: string;
  childId: string;
  derivationKind: Exclude<FeatureOperationDerivationKindV1, "feature_branch_create" | "feature_workspace_draft_pr_create">;
  effectKey: string;
  attemptNumber: number;
  retryNumber: number;
  acquiredAtOperationSequence: number;
}

export interface FeatureOperationReviewEvidenceV1 {
  evidenceRef: string;
  gateType: "mack" | "fury" | "human";
  gateId: string;
  childId: string;
  repositoryId: string;
  headRevision: string;
  sourceRecordDigest: string;
}

export interface FeatureOperationReplayContextV1 {
  schemaVersion: 1;
  contractVersion: "feature.operation.v1";
  repositoryId: string;
  operationId: string;
  activePlan: FeatureOperationPlanV1;
  activePlanDigest: string;
  verifiedAuthorityId: string;
  verifiedAuthorityDigest: string;
  acceptedAuthorityOperationSequence: number;
  currentJournalSequence: number;
  acceptedPlanLineage: readonly FeatureOperationPlanLineageEntryV1[];
  acceptedAmendmentDigests: readonly string[];
  lifecycle: {
    state: FeatureOperationLifecycleStateV1;
    atOperationSequence: number;
  };
  transitions: readonly FeatureOperationTransitionV1[];
  acceptedIntegrations: readonly FeatureOperationAcceptedIntegrationV1[];
  acceptedRollbacks: readonly FeatureOperationAcceptedRollbackV1[];
  consumedEffectKeys: readonly string[];
  childCounters: readonly FeatureOperationChildCountersV1[];
  activeLeases: readonly FeatureOperationActiveLeaseV1[];
  operationCounters: {
    featureBranchCreateAttempts: number;
    featureWorkspaceDraftPrAttempts: number;
    totalChildAttempts: number;
    totalIntegrationAttempts: number;
    totalRollbackAttempts: number;
    capturedEvidenceCount: number;
  };
  observedAt: { value: string; provenance: "hostTrusted" };
  acceptedReviewEvidence: readonly FeatureOperationReviewEvidenceV1[];
}

export interface FeatureOperationRequestedScopeV1 {
  relativePaths: readonly string[];
  actionIds: readonly string[];
  effectKeys: readonly string[];
  capabilityIds: readonly string[];
  validationIds: readonly string[];
  publicationOperations: readonly string[];
  requiredGates: FeatureOperationRequestedGatesV1;
  exclusions: readonly string[];
  requestedAttempts: number;
  requestedRetries: number;
}

interface FeatureOperationCandidateCommonV1 {
  schemaVersion: 1;
  contractVersion: "feature.operation.v1";
  repositoryId: string;
  operationId: string;
  planDigest: string;
  authorityDigest: string;
  effectKey: string;
  requestedScope: FeatureOperationRequestedScopeV1;
  candidateDigest: string;
}

export interface FeatureBranchCreateCandidateV1 extends FeatureOperationCandidateCommonV1 {
  stage: "initiation";
  derivationKind: "feature_branch_create";
  sourceRevision: string;
  targetBranch: string;
}

export interface FeatureWorkspaceDraftPrCandidateV1 extends FeatureOperationCandidateCommonV1 {
  stage: "initiation";
  derivationKind: "feature_workspace_draft_pr_create";
  sourceBranch: string;
  targetBranch: string;
  draftOnly: true;
}

export interface ChildInitiationCandidateV1 extends FeatureOperationCandidateCommonV1 {
  stage: "initiation";
  derivationKind: "child_initiation";
  childId: string;
  sourceFeatureHead: string;
  childBranch: string;
}

export interface ChildImplementationCandidateV1 extends FeatureOperationCandidateCommonV1 {
  stage: "implementation";
  derivationKind: "child_implementation";
  childId: string;
  childBaseRevision: string;
  childBranch: string;
}

export interface ChildPublicationCandidateV1 extends FeatureOperationCandidateCommonV1 {
  stage: "child_publication";
  derivationKind: "child_draft_pr_create";
  childId: string;
  childBranch: string;
  childHeadRevision: string;
  targetBranch: string;
  draftOnly: true;
}

export interface ChildIntegrationCandidateV1 extends FeatureOperationCandidateCommonV1 {
  stage: "integration";
  derivationKind: "child_merge_to_feature";
  childId: string;
  childBranch: string;
  childHeadRevision: string;
  childTreeDigest: string;
  targetBranch: string;
  integrationMethod: string;
  predecessorIntegrationReceiptDigest: string | null;
  reviewEvidenceRefs: readonly string[];
}

export interface ChildRollbackCandidateV1 extends FeatureOperationCandidateCommonV1 {
  stage: "rollback";
  derivationKind: "child_revert_on_feature";
  childId: string;
  integrationReceiptDigest: string;
  integrationHeadRevision: string;
  integrationTreeDigest: string;
  expectedRestoredTreeDigest: string;
  targetBranch: string;
  rollbackMethod: "revert_commit";
}

export type FeatureOperationDerivedCandidateV1 =
  | FeatureBranchCreateCandidateV1
  | FeatureWorkspaceDraftPrCandidateV1
  | ChildInitiationCandidateV1
  | ChildImplementationCandidateV1
  | ChildPublicationCandidateV1
  | ChildIntegrationCandidateV1
  | ChildRollbackCandidateV1;

type Valid<T> = { state: "valid"; value: Readonly<T> };
type Invalid = { state: "invalid"; code: string; errors: string[] };
export type FeatureOperationContractResult<T> = Valid<T> | Invalid;
export type FeatureOperationAuthorityVerificationResultV1 =
  | { state: "verified"; value: Readonly<FeatureOperationAuthorityV1>; authorityDigest: string; bindingId: string }
  | Invalid;
export type FeatureOperationAmendmentComparisonV1 =
  | { state: "valid"; classification: "identical" | "pure_narrowing" | "material" }
  | Invalid;
export type FeatureOperationEvaluationV1 =
  | { state: "eligible"; candidate: Readonly<FeatureOperationDerivedCandidateV1>; currentFeatureHead: string; currentFeatureTreeDigest: string }
  | { state: "blocked"; reasonCode: FeatureOperationBlockedReasonV1 };

const PLAN_FIELDS = [
  "schemaVersion", "contractVersion", "operationId", "objective", "sourceProvenance",
  "repositoryId", "baseBranch", "baseRevision", "baseTreeDigest", "featureBranch",
  "acceptanceCriteria", "children", "eligibilityOrder", "integrationPolicy", "lifecyclePolicy",
  "limits", "finalGates", "exclusions", "expiresAt", "planSequence",
  "predecessorPlanDigest", "planDigest",
] as const;
const CHILD_FIELDS = [
  "childId", "order", "objective", "dependsOn", "branchName", "repositoryId",
  "riskClassification", "acceptanceCriterionIds", "permittedDerivations", "allowedRelativePaths",
  "allowedActionIds", "allowedEffectKeys", "allowedCapabilityIds", "allowedValidationIds",
  "allowedPublicationOperations", "requiredGates", "exclusions", "maxImplementationAttempts",
  "maxPublicationAttempts", "maxIntegrationAttempts", "maxRollbackAttempts", "maxRetries",
] as const;
const LIMIT_FIELDS = [
  "maxDurationSeconds", "maxChildren", "maxConcurrency", "maxFeatureBranchCreateAttempts",
  "maxFeatureWorkspaceDraftPrAttempts", "maxTotalChildAttempts", "maxTotalIntegrationAttempts",
  "maxTotalRollbackAttempts", "maxCapturedEvidence",
] as const;
const SCOPE_FIELDS = [
  "relativePaths", "actionIds", "effectKeys", "capabilityIds", "validationIds",
  "publicationOperations", "requiredGates", "exclusions", "requestedAttempts",
  "requestedRetries",
] as const;
const AUTHORITY_FIELDS = [
  "schemaVersion", "contractVersion", "authorityKind", "authorityId", "missionId", "operationId",
  "plan", "planDigest", "repositoryId", "baseBranch", "baseRevision", "featureBranch",
  "operationSequence", "journalSequence", "issuedAt", "expiresAt", "limits",
  "permittedDerivations", "prohibitedEffects", "humanPrincipalId", "humanBindingId",
  "signingKeyRef", "authorityDigest",
] as const;
const REPLAY_FIELDS = [
  "schemaVersion", "contractVersion", "repositoryId", "operationId", "activePlan", "activePlanDigest",
  "verifiedAuthorityId", "verifiedAuthorityDigest", "acceptedAuthorityOperationSequence",
  "currentJournalSequence", "acceptedPlanLineage", "acceptedAmendmentDigests", "lifecycle",
  "transitions", "acceptedIntegrations", "acceptedRollbacks", "consumedEffectKeys", "childCounters",
  "activeLeases", "operationCounters", "observedAt", "acceptedReviewEvidence",
] as const;
const COMMON_CANDIDATE_FIELDS = [
  "schemaVersion", "contractVersion", "repositoryId", "operationId", "planDigest", "authorityDigest", "stage",
  "derivationKind", "effectKey", "requestedScope", "candidateDigest",
] as const;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const BRANCH = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\.\.)(?!.*[~^:?*\[\\\s])(?!.*\/$)[A-Za-z0-9._/-]{1,255}$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const KEY_REF = /^ed25519:sha256:[A-Za-z0-9_-]{43}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const DERIVATIONS = new Set<string>(FEATURE_OPERATION_DERIVATION_KINDS);
const LIFECYCLES = new Set<string>(["active", "paused", "cancelled", "expired", "integrated", "rollback_pending", "superseded"]);
const CHILD_DERIVATIONS = new Set<string>(FEATURE_OPERATION_DERIVATION_KINDS.filter((item) => item.startsWith("child_")));
const INTEGRATION_METHODS = Object.freeze(["merge_commit", "rebase_merge", "squash"] as const);
const STAGE_SCOPE_POLICY = Object.freeze({
  feature_branch_create: Object.freeze({ actions: Object.freeze(["branch_create"]), capabilities: Object.freeze(["feature_branch_write"]), publications: Object.freeze([]), validations: Object.freeze([]) }),
  feature_workspace_draft_pr_create: Object.freeze({ actions: Object.freeze(["draft_pr_create"]), capabilities: Object.freeze(["feature_workspace_pr_write"]), publications: Object.freeze(["draft_pr_create"]), validations: Object.freeze([]) }),
  child_initiation: Object.freeze({ actions: Object.freeze(["branch_create"]), capabilities: Object.freeze(["child_branch_write"]), publications: Object.freeze([]), validations: Object.freeze([]) }),
  child_implementation: Object.freeze({ actions: Object.freeze(["repository_edit"]), capabilities: Object.freeze(["repository_write"]), publications: Object.freeze([]), validations: Object.freeze(["build", "test"]) }),
  child_draft_pr_create: Object.freeze({ actions: Object.freeze(["draft_pr_create"]), capabilities: Object.freeze(["child_pr_write"]), publications: Object.freeze(["draft_pr_create"]), validations: Object.freeze([]) }),
  child_merge_to_feature: Object.freeze({ actions: Object.freeze(["integrate"]), capabilities: Object.freeze(["feature_branch_write"]), publications: Object.freeze([]), validations: Object.freeze(["test"]) }),
  child_revert_on_feature: Object.freeze({ actions: Object.freeze(["revert"]), capabilities: Object.freeze(["feature_branch_write"]), publications: Object.freeze([]), validations: Object.freeze(["test"]) }),
} satisfies Record<FeatureOperationDerivationKindV1, {
  actions: readonly string[];
  capabilities: readonly string[];
  publications: readonly string[];
  validations: readonly string[];
}>);
const ALL_STAGE_ACTIONS = new Set<string>(Object.values(STAGE_SCOPE_POLICY).flatMap((policy) => policy.actions as readonly string[]));
const ALL_STAGE_CAPABILITIES = new Set<string>(Object.values(STAGE_SCOPE_POLICY).flatMap((policy) => policy.capabilities as readonly string[]));
const ALL_STAGE_PUBLICATIONS = new Set<string>(Object.values(STAGE_SCOPE_POLICY).flatMap((policy) => policy.publications as readonly string[]));
const ALL_STAGE_VALIDATIONS = new Set<string>(Object.values(STAGE_SCOPE_POLICY).flatMap((policy) => policy.validations as readonly string[]));
const PROHIBITED_SCOPE_TOKENS = new Set<string>([
  ...FEATURE_OPERATION_FIXED_EXCLUSIONS,
  ...FEATURE_OPERATION_PROHIBITED_EFFECTS,
  "deployment",
  "destructive_rollback",
  "feature_pr_merge",
  "feature_pr_ready",
  "merge_main",
  "publish_to_main",
  "ready_feature_pr",
]);

const valid = <T,>(value: T): Valid<T> => ({ state: "valid", value: deepFreeze(value) });
const invalid = (code: string, ...errors: string[]): Invalid => ({ state: "invalid", code, errors });

function compareFeatureOperationCanonicalStringsV1(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value as object)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    !utilTypes.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function closed(value: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (!plain(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return null;
  const copy: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) return null;
    copy[field] = descriptor.value;
  }
  return copy;
}

function dense(value: unknown, allowEmpty: boolean, maximum = 512): unknown[] | null {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < (allowEmpty ? 0 : 1) || length > maximum || Reflect.ownKeys(value).length !== length + 1) return null;
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) return null;
    result.push(descriptor.value);
  }
  return result;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (plain(value)) {
    return Object.fromEntries(Object.keys(value).sort(compareFeatureOperationCanonicalStringsV1).map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

function digest(kind: "plan" | "authority" | "candidate", value: Record<string, unknown>): string {
  const bytes = Buffer.concat([
    Buffer.from("shield.feature-operation.v1\0", "ascii"),
    Buffer.from(`${kind}\0`, "ascii"),
    Buffer.from(canonicalJson(value), "utf8"),
  ]);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function identifier(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function branch(value: unknown): value is string { return typeof value === "string" && BRANCH.test(value); }
function revision(value: unknown): value is string { return typeof value === "string" && REVISION.test(value); }
function digestString(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function canonicalBase64(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && BASE64.test(value) && Buffer.from(value, "base64").toString("base64") === value;
}
function sequence(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function positive(value: unknown): value is number { return sequence(value) && value > 0; }
function timestampNanoseconds(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = ISO.exec(value);
  if (!match) return null;
  const [datePart, timePart] = value.slice(0, -1).split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hourText, minuteText, secondAndFraction] = timePart.split(":");
  const [secondText, fraction = ""] = secondAndFraction.split(".");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ||
      date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return null;
  return BigInt(date.getTime()) * 1_000_000n + BigInt(fraction.padEnd(9, "0") || "0");
}
function timestamp(value: unknown): value is string { return timestampNanoseconds(value) !== null; }
function timestampBefore(left: string, right: string): boolean {
  return (timestampNanoseconds(left) as bigint) < (timestampNanoseconds(right) as bigint);
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f\u007f]/u.test(value); }

function relativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048 || value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  return !value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function sortedStrings(value: unknown, allowEmpty = false, predicate: (item: unknown) => item is string = identifier): string[] | null {
  const items = dense(value, allowEmpty);
  if (items === null || items.some((item) => !predicate(item))) return null;
  const strings = items as string[];
  for (let index = 1; index < strings.length; index += 1) {
    if (compareFeatureOperationCanonicalStringsV1(strings[index - 1], strings[index]) >= 0) return null;
  }
  return [...strings];
}

function containsProhibitedScopeToken(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
  return PROHIBITED_SCOPE_TOKENS.has(normalized);
}

function effectKeyDerivation(value: string): FeatureOperationDerivationKindV1 | null {
  const match = /^effect:([a-z_]+):[a-f0-9]{64}$/u.exec(value);
  return match && DERIVATIONS.has(match[1]) ? match[1] as FeatureOperationDerivationKindV1 : null;
}

function effectKeyMatchesDerivation(value: string, derivation: FeatureOperationDerivationKindV1): boolean {
  return effectKeyDerivation(value) === derivation;
}

function exactStrings(value: unknown, expected: readonly string[]): boolean {
  const checked = sortedStrings(value, expected.length === 0);
  return checked !== null && checked.length === expected.length && checked.every((item, index) => item === expected[index]);
}

function checkedLimits(value: unknown): FeatureOperationLimitsV1 | null {
  const record = closed(value, LIMIT_FIELDS);
  if (record === null || LIMIT_FIELDS.some((field) => !positive(record[field]))) return null;
  if ((record.maxConcurrency as number) > (record.maxChildren as number)) return null;
  return record as unknown as FeatureOperationLimitsV1;
}

function checkedGates(value: unknown, required: boolean): FeatureOperationRequiredGatesV1 | FeatureOperationRequestedGatesV1 | null {
  const record = closed(value, ["mack", "fury", "humanGateIds"]);
  const humans = record && sortedStrings(record.humanGateIds, true);
  if (!record || !humans || typeof record.mack !== "boolean" || typeof record.fury !== "boolean") return null;
  if (required && (record.mack !== true || record.fury !== true)) return null;
  return { mack: record.mack, fury: record.fury, humanGateIds: humans } as FeatureOperationRequiredGatesV1 | FeatureOperationRequestedGatesV1;
}

function checkedScope(value: unknown): FeatureOperationRequestedScopeV1 | null {
  const record = closed(value, SCOPE_FIELDS);
  if (!record) return null;
  const relativePaths = sortedStrings(record.relativePaths, true, relativePath);
  const actionIds = sortedStrings(record.actionIds, true);
  const effectKeys = sortedStrings(record.effectKeys, true);
  const capabilityIds = sortedStrings(record.capabilityIds, true);
  const validationIds = sortedStrings(record.validationIds, true);
  const publicationOperations = sortedStrings(record.publicationOperations, true);
  const requiredGates = checkedGates(record.requiredGates, false);
  const exclusions = sortedStrings(record.exclusions, true);
  if (!relativePaths || !actionIds || !effectKeys || !capabilityIds || !validationIds || !publicationOperations || !requiredGates || !exclusions ||
      !positive(record.requestedAttempts) || !sequence(record.requestedRetries) ||
      (record.requestedRetries as number) > (record.requestedAttempts as number) ||
      [...actionIds, ...effectKeys, ...capabilityIds, ...publicationOperations].some(containsProhibitedScopeToken)) return null;
  return { relativePaths, actionIds, effectKeys, capabilityIds, validationIds, publicationOperations, requiredGates, exclusions,
    requestedAttempts: record.requestedAttempts as number, requestedRetries: record.requestedRetries as number };
}

function checkedChild(value: unknown, criteria: Set<string>): FeatureOperationChildV1 | null {
  const record = closed(value, CHILD_FIELDS);
  if (!record || !identifier(record.childId) || !sequence(record.order) || !text(record.objective) ||
      !branch(record.branchName) || !identifier(record.repositoryId) || !["low", "moderate", "high"].includes(record.riskClassification as string)) return null;
  const dependsOn = sortedStrings(record.dependsOn, true);
  const acceptanceCriterionIds = sortedStrings(record.acceptanceCriterionIds);
  const permittedDerivations = sortedStrings(record.permittedDerivations);
  const allowedRelativePaths = sortedStrings(record.allowedRelativePaths, false, relativePath);
  const allowedActionIds = sortedStrings(record.allowedActionIds);
  const allowedEffectKeys = sortedStrings(record.allowedEffectKeys);
  const allowedCapabilityIds = sortedStrings(record.allowedCapabilityIds);
  const allowedValidationIds = sortedStrings(record.allowedValidationIds);
  const allowedPublicationOperations = sortedStrings(record.allowedPublicationOperations, true);
  const requiredGates = checkedGates(record.requiredGates, true);
  const exclusions = sortedStrings(record.exclusions);
  if (!dependsOn || !acceptanceCriterionIds || acceptanceCriterionIds.some((id) => !criteria.has(id)) ||
      !permittedDerivations || permittedDerivations.some((item) => !DERIVATIONS.has(item)) ||
      permittedDerivations.some((item) => item.startsWith("feature_")) ||
      !allowedRelativePaths || !allowedActionIds || !allowedEffectKeys || !allowedCapabilityIds ||
      !allowedValidationIds || !allowedPublicationOperations || !requiredGates || !exclusions ||
      [...allowedActionIds, ...allowedEffectKeys, ...allowedCapabilityIds, ...allowedPublicationOperations].some(containsProhibitedScopeToken) ||
      allowedActionIds.some((item) => !ALL_STAGE_ACTIONS.has(item)) || allowedEffectKeys.some((item) => effectKeyDerivation(item) === null) ||
      allowedCapabilityIds.some((item) => !ALL_STAGE_CAPABILITIES.has(item)) ||
      allowedValidationIds.some((item) => !ALL_STAGE_VALIDATIONS.has(item)) ||
      allowedPublicationOperations.some((item) => !ALL_STAGE_PUBLICATIONS.has(item)) ||
      !positive(record.maxImplementationAttempts) || !positive(record.maxPublicationAttempts) ||
      !positive(record.maxIntegrationAttempts) || !positive(record.maxRollbackAttempts) || !sequence(record.maxRetries)) return null;
  return {
    childId: record.childId, order: record.order, objective: record.objective, dependsOn,
    branchName: record.branchName, repositoryId: record.repositoryId,
    riskClassification: record.riskClassification, acceptanceCriterionIds,
    permittedDerivations: permittedDerivations as FeatureOperationDerivationKindV1[], allowedRelativePaths,
    allowedActionIds, allowedEffectKeys, allowedCapabilityIds, allowedValidationIds,
    allowedPublicationOperations, requiredGates: requiredGates as FeatureOperationRequiredGatesV1,
    exclusions, maxImplementationAttempts: record.maxImplementationAttempts,
    maxPublicationAttempts: record.maxPublicationAttempts, maxIntegrationAttempts: record.maxIntegrationAttempts,
    maxRollbackAttempts: record.maxRollbackAttempts, maxRetries: record.maxRetries,
  } as FeatureOperationChildV1;
}

function checkPlanShape(input: unknown, verifyOwnDigest: boolean): FeatureOperationPlanV1 | null {
  const record = closed(input, PLAN_FIELDS);
  if (!record || record.schemaVersion !== 1 || record.contractVersion !== FEATURE_OPERATION_CONTRACT_VERSION ||
      !identifier(record.operationId) || !text(record.objective) || !identifier(record.repositoryId) ||
      !branch(record.baseBranch) || !revision(record.baseRevision) || !digestString(record.baseTreeDigest) ||
      !branch(record.featureBranch) || record.featureBranch === record.baseBranch || record.featureBranch === "main" ||
      !timestamp(record.expiresAt) || !sequence(record.planSequence) || !digestString(record.planDigest)) return null;
  if (record.sourceProvenance !== null) {
    const source = closed(record.sourceProvenance, ["authority", "sourceRef"]);
    if (!source || source.authority !== "none" || !identifier(source.sourceRef)) return null;
  }
  const criteriaItems = dense(record.acceptanceCriteria, false);
  if (!criteriaItems) return null;
  const acceptanceCriteria: FeatureOperationAcceptanceCriterionV1[] = [];
  const criterionIds = new Set<string>();
  for (const item of criteriaItems) {
    const criterion = closed(item, ["criterionId", "statement"]);
    if (!criterion || !identifier(criterion.criterionId) || !text(criterion.statement) || criterionIds.has(criterion.criterionId)) return null;
    criterionIds.add(criterion.criterionId);
    acceptanceCriteria.push(criterion as unknown as FeatureOperationAcceptanceCriterionV1);
  }
  const childItems = dense(record.children, false);
  if (!childItems) return null;
  const children: FeatureOperationChildV1[] = [];
  const childIds = new Set<string>();
  const branches = new Set<string>();
  for (let index = 0; index < childItems.length; index += 1) {
    const child = checkedChild(childItems[index], criterionIds);
    if (!child || child.order !== index || child.repositoryId !== record.repositoryId || childIds.has(child.childId) ||
        branches.has(child.branchName) || child.branchName === record.baseBranch || child.branchName === record.featureBranch || child.branchName === "main") return null;
    if (!subset(FEATURE_OPERATION_FIXED_EXCLUSIONS, child.exclusions)) return null;
    if (child.dependsOn.some((dependency) => !childIds.has(dependency))) return null;
    childIds.add(child.childId);
    branches.add(child.branchName);
    children.push(child);
  }
  const eligibilityOrder = dense(record.eligibilityOrder, false);
  if (!eligibilityOrder || eligibilityOrder.length !== children.length || eligibilityOrder.some((item) => !identifier(item)) ||
      new Set(eligibilityOrder).size !== children.length || eligibilityOrder.some((item) => !childIds.has(item as string))) return null;
  const eligibilityPositions = new Map(eligibilityOrder.map((childId, index) => [childId as string, index]));
  if (children.some((child) => child.dependsOn.some((dependency) =>
    (eligibilityPositions.get(dependency) as number) >= (eligibilityPositions.get(child.childId) as number)))) return null;
  const integrationPolicy = closed(record.integrationPolicy, ["targetBranch", "allowedMethods"]);
  const methods = integrationPolicy && sortedStrings(integrationPolicy.allowedMethods);
  if (!integrationPolicy || integrationPolicy.targetBranch !== record.featureBranch || !methods ||
      methods.some((method) => !INTEGRATION_METHODS.includes(method as (typeof INTEGRATION_METHODS)[number]))) return null;
  const lifecycle = closed(record.lifecyclePolicy, ["amendmentsRequireFreshAuthority", "pauseSupported", "cancellationSupported", "rollbackMethod", "expiryEnforced", "escalationOnAmbiguity"]);
  if (!lifecycle || lifecycle.amendmentsRequireFreshAuthority !== true || lifecycle.pauseSupported !== true ||
      lifecycle.cancellationSupported !== true || lifecycle.rollbackMethod !== "revert_commit" ||
      lifecycle.expiryEnforced !== true || lifecycle.escalationOnAmbiguity !== true) return null;
  const limits = checkedLimits(record.limits);
  if (!limits || limits.maxChildren !== children.length) return null;
  const finalGates = closed(record.finalGates, ["fitzRequired", "simmons", "coulsonRequired"]);
  if (!finalGates || finalGates.fitzRequired !== true || finalGates.simmons !== "conditional" || finalGates.coulsonRequired !== true) return null;
  const exclusions = sortedStrings(record.exclusions);
  if (!exclusions || !subset(FEATURE_OPERATION_FIXED_EXCLUSIONS, exclusions) ||
      children.some((child) => !subset(exclusions, child.exclusions))) return null;
  if ((record.planSequence === 0 && record.predecessorPlanDigest !== null) ||
      (record.planSequence > 0 && !digestString(record.predecessorPlanDigest))) return null;
  const plan = clone({ ...record, acceptanceCriteria, children, eligibilityOrder: [...eligibilityOrder], exclusions } as unknown as FeatureOperationPlanV1);
  if (verifyOwnDigest && computePlanDigestUnchecked(plan) !== plan.planDigest) return null;
  return plan;
}

function computePlanDigestUnchecked(plan: FeatureOperationPlanV1): string {
  const copy = clone(plan) as unknown as Record<string, unknown>;
  delete copy.planDigest;
  return digest("plan", copy);
}

export function computeFeatureOperationPlanDigestV1(input: unknown): string {
  const plan = checkPlanShape(input, false);
  if (!plan) throw new TypeError("Feature operation plan is invalid.");
  return computePlanDigestUnchecked(plan);
}

export function validateFeatureOperationPlanV1(input: unknown): FeatureOperationContractResult<FeatureOperationPlanV1> {
  try {
    const plan = checkPlanShape(input, true);
    return plan ? valid(plan) : invalid("plan_invalid", "Feature operation plan is invalid.");
  } catch {
    return invalid("plan_invalid", "Feature operation plan is invalid.");
  }
}

function checkAuthorityShape(input: unknown, verifyOwnDigest: boolean): FeatureOperationAuthorityV1 | null {
  const record = closed(input, AUTHORITY_FIELDS);
  if (!record || record.schemaVersion !== 1 || record.contractVersion !== FEATURE_OPERATION_CONTRACT_VERSION ||
      record.authorityKind !== FEATURE_OPERATION_AUTHORITY_KIND || !identifier(record.authorityId) ||
      !identifier(record.missionId) || !identifier(record.operationId) || !digestString(record.planDigest) ||
      !identifier(record.repositoryId) || !branch(record.baseBranch) || !revision(record.baseRevision) ||
      !branch(record.featureBranch) || !sequence(record.operationSequence) || !sequence(record.journalSequence) ||
      !timestamp(record.issuedAt) || !timestamp(record.expiresAt) || !timestampBefore(record.issuedAt, record.expiresAt) ||
      !identifier(record.humanPrincipalId) || !identifier(record.humanBindingId) ||
      typeof record.signingKeyRef !== "string" || !KEY_REF.test(record.signingKeyRef) || !digestString(record.authorityDigest)) return null;
  const plan = checkPlanShape(record.plan, true);
  const limits = checkedLimits(record.limits);
  if (!plan || !limits || record.operationId !== plan.operationId || record.planDigest !== plan.planDigest ||
      record.repositoryId !== plan.repositoryId || record.baseBranch !== plan.baseBranch ||
      record.baseRevision !== plan.baseRevision || record.featureBranch !== plan.featureBranch ||
      timestampBefore(plan.expiresAt, record.expiresAt as string) ||
      (timestampNanoseconds(record.expiresAt) as bigint) - (timestampNanoseconds(record.issuedAt) as bigint) > BigInt(limits.maxDurationSeconds) * 1_000_000_000n ||
      canonicalJson(limits) !== canonicalJson(plan.limits) ||
      !exactStrings(record.permittedDerivations, FEATURE_OPERATION_DERIVATION_KINDS) ||
      !exactStrings(record.prohibitedEffects, FEATURE_OPERATION_PROHIBITED_EFFECTS)) return null;
  const authority = clone({ ...record, plan, limits } as unknown as FeatureOperationAuthorityV1);
  if (verifyOwnDigest && computeAuthorityDigestUnchecked(authority) !== authority.authorityDigest) return null;
  return authority;
}

function computeAuthorityDigestUnchecked(authority: FeatureOperationAuthorityV1): string {
  const copy = clone(authority) as unknown as Record<string, unknown>;
  delete copy.authorityDigest;
  return digest("authority", copy);
}

export function computeFeatureOperationAuthorityDigestV1(input: unknown): string {
  const authority = checkAuthorityShape(input, false);
  if (!authority) throw new TypeError("Feature operation authority is invalid.");
  return computeAuthorityDigestUnchecked(authority);
}

export function validateFeatureOperationAuthorityV1(input: unknown): FeatureOperationContractResult<FeatureOperationAuthorityV1> {
  try {
    const authority = checkAuthorityShape(input, true);
    return authority ? valid(authority) : invalid("authority_invalid", "Feature operation authority is invalid.");
  } catch {
    return invalid("authority_invalid", "Feature operation authority is invalid.");
  }
}

export function validateSignedFeatureOperationAuthorityV1(input: unknown): FeatureOperationContractResult<SignedFeatureOperationAuthorityV1> {
  try {
    const envelope = closed(input, ["payload", "signatureBase64"]);
    if (!envelope || !canonicalBase64(envelope.signatureBase64) || envelope.signatureBase64.length > 512) {
      return invalid("signed_authority_invalid", "Signed feature operation authority is invalid.");
    }
    const authority = checkAuthorityShape(envelope.payload, true);
    if (!authority) return invalid("signed_authority_invalid", "Signed feature operation authority is invalid.");
    return valid({ payload: authority, signatureBase64: envelope.signatureBase64 });
  } catch {
    return invalid("signed_authority_invalid", "Signed feature operation authority is invalid.");
  }
}

function checkVerificationInput(input: unknown): FeatureOperationAuthorityVerificationInputV1 | null {
  const record = closed(input, ["expectedMissionId", "expectedOperationId", "expectedOperationSequence", "expectedJournalSequence", "trustedBindings"]);
  if (!record || !identifier(record.expectedMissionId) || !identifier(record.expectedOperationId) ||
      !sequence(record.expectedOperationSequence) || !sequence(record.expectedJournalSequence)) return null;
  const bindings = dense(record.trustedBindings, true, 128);
  if (!bindings) return null;
  return { ...record, trustedBindings: bindings } as unknown as FeatureOperationAuthorityVerificationInputV1;
}

function trustedBindingForAuthority(
  authority: FeatureOperationAuthorityV1,
  context: FeatureOperationAuthorityVerificationInputV1,
): { state: "valid"; binding: TrustedHumanBinding } | Invalid {
  const matches: TrustedHumanBinding[] = [];
  for (const raw of context.trustedBindings) {
    const binding = closed(raw, ["schemaVersion", "bindingId", "humanPrincipalId", "seatId", "missionScope", "signingKeyRef", "publicKeySpkiBase64", "validFromSequence", "validThroughSequence", "attestedBy", "provenanceRef"]);
    if (!binding || binding.schemaVersion !== 1 || !identifier(binding.bindingId) || !identifier(binding.humanPrincipalId) ||
        !identifier(binding.seatId) || !(binding.missionScope === "*" || identifier(binding.missionScope)) ||
        typeof binding.signingKeyRef !== "string" || !KEY_REF.test(binding.signingKeyRef) ||
        !canonicalBase64(binding.publicKeySpkiBase64) ||
        !sequence(binding.validFromSequence) || !(binding.validThroughSequence === null || sequence(binding.validThroughSequence)) ||
        (typeof binding.validThroughSequence === "number" && binding.validThroughSequence < binding.validFromSequence) ||
        !identifier(binding.attestedBy) || !identifier(binding.provenanceRef)) {
      return invalid("trusted_binding_invalid", "Trusted binding registry contains malformed data.");
    }
    if (binding.seatId === "coulson" && binding.bindingId === authority.humanBindingId) {
      if (binding.validFromSequence <= authority.journalSequence &&
          (binding.validThroughSequence === null || authority.journalSequence <= binding.validThroughSequence)) {
        matches.push(binding as unknown as TrustedHumanBinding);
      } else {
        return invalid("trusted_binding_invalid", "Trusted Coulson binding is stale or revoked.");
      }
    }
  }
  if (matches.length !== 1) return invalid("trusted_binding_invalid", "Exactly one active Coulson binding is required.");
  const trusted = matches[0];
  if (trusted.humanPrincipalId !== authority.humanPrincipalId || trusted.signingKeyRef !== authority.signingKeyRef ||
      trusted.missionScope !== authority.missionId) {
    return invalid("trusted_binding_invalid", "Trusted Coulson binding does not match the authority.");
  }
  try {
    if (computeEd25519SigningKeyRef(trusted.publicKeySpkiBase64) !== authority.signingKeyRef) {
      return invalid("trusted_binding_invalid", "Trusted Coulson signing key reference is inconsistent.");
    }
  } catch {
    return invalid("trusted_binding_invalid", "Trusted Coulson signing key is malformed.");
  }
  return { state: "valid", binding: trusted };
}

function signatureBytes(authority: FeatureOperationAuthorityV1): Buffer {
  return Buffer.concat([
    Buffer.from("shield.feature-operation.authority.signature.v1\0", "ascii"),
    Buffer.from(canonicalJson(authority), "utf8"),
  ]);
}

function verifyEnvelopeWithBinding(envelope: SignedFeatureOperationAuthorityV1, binding: TrustedHumanBinding): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    const signature = Buffer.from(envelope.signatureBase64, "base64");
    return signature.length === 64 && verify(null, signatureBytes(envelope.payload), key, signature);
  } catch {
    return false;
  }
}

export function verifySignedFeatureOperationAuthorityV1(
  envelopeInput: unknown,
  verificationInput: unknown,
): FeatureOperationAuthorityVerificationResultV1 {
  const envelopeResult = validateSignedFeatureOperationAuthorityV1(envelopeInput);
  if (envelopeResult.state === "invalid") return envelopeResult;
  const context = checkVerificationInput(verificationInput);
  if (!context) return invalid("trusted_binding_invalid", "Authority verification input is invalid.");
  const authority = envelopeResult.value.payload;
  if (authority.missionId !== context.expectedMissionId || authority.operationId !== context.expectedOperationId) {
    return invalid("identity_mismatch", "Expected mission or operation identity does not match.");
  }
  if (authority.operationSequence !== context.expectedOperationSequence || authority.journalSequence !== context.expectedJournalSequence) {
    return invalid("sequence_mismatch", "Expected operation or journal sequence does not match.");
  }
  const trusted = trustedBindingForAuthority(authority, context);
  if (trusted.state === "invalid") return trusted;
  if (!verifyEnvelopeWithBinding(envelopeResult.value, trusted.binding)) {
    return invalid("authority_signature_invalid", "Feature operation authority signature is invalid.");
  }
  return {
    state: "verified",
    value: deepFreeze(clone(authority)),
    authorityDigest: authority.authorityDigest,
    bindingId: trusted.binding.bindingId,
  };
}

function checkedTransition(value: unknown): FeatureOperationTransitionV1 | null {
  if (!plain(value)) return null;
  const kind = Object.getOwnPropertyDescriptor(value, "kind")?.value;
  const extra = kind === "integration" ? ["childId", "childHeadRevision", "childTreeDigest"] :
    kind === "rollback" ? ["childId", "revertedIntegrationReceiptDigest"] : [];
  if (kind !== "genesis" && kind !== "integration" && kind !== "rollback") return null;
  const record = closed(value, ["kind", "operationSequence", "effectKey", "priorHeadRevision", "priorTreeDigest", "resultingHeadRevision", "resultingTreeDigest", "receiptDigest", ...extra]);
  if (!record || !sequence(record.operationSequence) || !identifier(record.effectKey) || !revision(record.priorHeadRevision) ||
      !digestString(record.priorTreeDigest) || !revision(record.resultingHeadRevision) || !digestString(record.resultingTreeDigest) ||
      !digestString(record.receiptDigest)) return null;
  if (kind === "integration" && (!identifier(record.childId) || !revision(record.childHeadRevision) || !digestString(record.childTreeDigest))) return null;
  if (kind === "rollback" && (!identifier(record.childId) || !digestString(record.revertedIntegrationReceiptDigest))) return null;
  return record as unknown as FeatureOperationTransitionV1;
}

function checkedLineage(value: unknown): FeatureOperationPlanLineageEntryV1[] | null {
  const items = dense(value, false);
  if (!items) return null;
  const result: FeatureOperationPlanLineageEntryV1[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = closed(items[index], ["planSequence", "planDigest", "predecessorPlanDigest", "authorityDigest", "active"]);
    if (!item || item.planSequence !== index || !digestString(item.planDigest) || !digestString(item.authorityDigest) || typeof item.active !== "boolean" ||
        (index === 0 ? item.predecessorPlanDigest !== null : item.predecessorPlanDigest !== result[index - 1].planDigest)) return null;
    result.push(item as unknown as FeatureOperationPlanLineageEntryV1);
  }
  if (result.filter((entry) => entry.active).length !== 1 || result.at(-1)?.active !== true || new Set(result.map((entry) => entry.planDigest)).size !== result.length) return null;
  return result;
}

function checkedIntegrations(value: unknown): FeatureOperationAcceptedIntegrationV1[] | null {
  const items = dense(value, true);
  if (!items) return null;
  const fields = ["childId", "operationSequence", "effectKey", "priorHeadRevision", "priorTreeDigest", "resultingHeadRevision", "resultingTreeDigest", "receiptDigest", "reverted"];
  const result: FeatureOperationAcceptedIntegrationV1[] = [];
  for (const raw of items) {
    const item = closed(raw, fields);
    if (!item || !identifier(item.childId) || !sequence(item.operationSequence) || !identifier(item.effectKey) ||
        !revision(item.priorHeadRevision) || !digestString(item.priorTreeDigest) || !revision(item.resultingHeadRevision) ||
        !digestString(item.resultingTreeDigest) || !digestString(item.receiptDigest) || typeof item.reverted !== "boolean") return null;
    result.push(item as unknown as FeatureOperationAcceptedIntegrationV1);
  }
  return result;
}

function checkedRollbacks(value: unknown): FeatureOperationAcceptedRollbackV1[] | null {
  const items = dense(value, true);
  if (!items) return null;
  const fields = ["childId", "operationSequence", "effectKey", "revertedIntegrationReceiptDigest", "priorHeadRevision", "priorTreeDigest", "resultingHeadRevision", "resultingTreeDigest", "receiptDigest"];
  const result: FeatureOperationAcceptedRollbackV1[] = [];
  for (const raw of items) {
    const item = closed(raw, fields);
    if (!item || !identifier(item.childId) || !sequence(item.operationSequence) || !identifier(item.effectKey) ||
        !digestString(item.revertedIntegrationReceiptDigest) || !revision(item.priorHeadRevision) ||
        !digestString(item.priorTreeDigest) || !revision(item.resultingHeadRevision) ||
        !digestString(item.resultingTreeDigest) || !digestString(item.receiptDigest)) return null;
    result.push(item as unknown as FeatureOperationAcceptedRollbackV1);
  }
  return result;
}

function checkReplayShape(input: unknown): FeatureOperationReplayContextV1 | null {
  const record = closed(input, REPLAY_FIELDS);
  if (!record || record.schemaVersion !== 1 || record.contractVersion !== FEATURE_OPERATION_CONTRACT_VERSION ||
      !identifier(record.repositoryId) || !identifier(record.operationId) || !digestString(record.activePlanDigest) ||
      !identifier(record.verifiedAuthorityId) || !digestString(record.verifiedAuthorityDigest) ||
      !sequence(record.acceptedAuthorityOperationSequence) || !sequence(record.currentJournalSequence)) return null;
  const activePlan = checkPlanShape(record.activePlan, true);
  if (!activePlan || activePlan.repositoryId !== record.repositoryId || activePlan.operationId !== record.operationId || activePlan.planDigest !== record.activePlanDigest) return null;
  const lineage = checkedLineage(record.acceptedPlanLineage);
  if (!lineage || lineage.at(-1)?.planDigest !== record.activePlanDigest || lineage.at(-1)?.authorityDigest !== record.verifiedAuthorityDigest ||
      lineage.at(-1)?.planSequence !== activePlan.planSequence) return null;
  const amendmentItems = dense(record.acceptedAmendmentDigests, true);
  const amendments = amendmentItems && amendmentItems.every(digestString) && new Set(amendmentItems).size === amendmentItems.length
    ? amendmentItems as string[] : null;
  if (!amendments || amendments.length !== Math.max(0, lineage.length - 1) ||
      amendments.some((item, index) => item !== lineage[index + 1].planDigest)) return null;
  const lifecycle = closed(record.lifecycle, ["state", "atOperationSequence"]);
  if (!lifecycle || !LIFECYCLES.has(lifecycle.state as string) || !sequence(lifecycle.atOperationSequence)) return null;
  const transitionItems = dense(record.transitions, false);
  if (!transitionItems) return null;
  const transitions: FeatureOperationTransitionV1[] = [];
  const effects = new Set<string>();
  const receipts = new Set<string>();
  const integrationsByReceipt = new Map<string, FeatureOperationIntegrationTransitionV1>();
  const revertedReceipts = new Set<string>();
  for (let index = 0; index < transitionItems.length; index += 1) {
    const transition = checkedTransition(transitionItems[index]);
    if (!transition || transition.operationSequence !== index || effects.has(transition.effectKey) || receipts.has(transition.receiptDigest)) return null;
    if (index === 0) {
      if (transition.kind !== "genesis" || transition.priorHeadRevision !== activePlan.baseRevision || transition.resultingHeadRevision !== activePlan.baseRevision ||
          transition.priorTreeDigest !== activePlan.baseTreeDigest || transition.resultingTreeDigest !== activePlan.baseTreeDigest ||
          transition.effectKey !== "effect:genesis") return null;
    } else {
      const prior = transitions[index - 1];
      if (transition.kind === "genesis" || transition.priorHeadRevision !== prior.resultingHeadRevision || transition.priorTreeDigest !== prior.resultingTreeDigest) return null;
      if (transition.kind === "integration") {
        const child = activePlan.children.find((item) => item.childId === transition.childId);
        if (!child || !effectKeyMatchesDerivation(transition.effectKey, "child_merge_to_feature") ||
            !child.allowedEffectKeys.includes(transition.effectKey)) return null;
        integrationsByReceipt.set(transition.receiptDigest, transition);
      } else {
        const latest = [...integrationsByReceipt.values()].filter((item) => !revertedReceipts.has(item.receiptDigest)).at(-1);
        if (!latest || latest.receiptDigest !== transition.revertedIntegrationReceiptDigest || latest.childId !== transition.childId ||
            !effectKeyMatchesDerivation(transition.effectKey, "child_revert_on_feature") ||
            !activePlan.children.find((child) => child.childId === transition.childId)?.allowedEffectKeys.includes(transition.effectKey) ||
            transition.priorHeadRevision !== latest.resultingHeadRevision || transition.priorTreeDigest !== latest.resultingTreeDigest ||
            transition.resultingHeadRevision === transition.priorHeadRevision || transition.resultingTreeDigest !== latest.priorTreeDigest) return null;
        revertedReceipts.add(latest.receiptDigest);
      }
    }
    effects.add(transition.effectKey);
    receipts.add(transition.receiptDigest);
    transitions.push(transition);
  }
  if ((lifecycle.atOperationSequence as number) > transitions[transitions.length - 1].operationSequence) return null;
  const acceptedIntegrations = checkedIntegrations(record.acceptedIntegrations);
  const acceptedRollbacks = checkedRollbacks(record.acceptedRollbacks);
  if (!acceptedIntegrations || !acceptedRollbacks) return null;
  const derivedIntegrations = transitions.filter((item): item is FeatureOperationIntegrationTransitionV1 => item.kind === "integration").map((item) => ({
    childId: item.childId, operationSequence: item.operationSequence, effectKey: item.effectKey,
    priorHeadRevision: item.priorHeadRevision, priorTreeDigest: item.priorTreeDigest,
    resultingHeadRevision: item.resultingHeadRevision, resultingTreeDigest: item.resultingTreeDigest,
    receiptDigest: item.receiptDigest, reverted: revertedReceipts.has(item.receiptDigest),
  }));
  const derivedRollbacks = transitions.filter((item): item is FeatureOperationRollbackTransitionV1 => item.kind === "rollback").map((item) => ({
    childId: item.childId, operationSequence: item.operationSequence, effectKey: item.effectKey,
    revertedIntegrationReceiptDigest: item.revertedIntegrationReceiptDigest,
    priorHeadRevision: item.priorHeadRevision, priorTreeDigest: item.priorTreeDigest,
    resultingHeadRevision: item.resultingHeadRevision, resultingTreeDigest: item.resultingTreeDigest,
    receiptDigest: item.receiptDigest,
  }));
  if (canonicalJson(acceptedIntegrations) !== canonicalJson(derivedIntegrations) || canonicalJson(acceptedRollbacks) !== canonicalJson(derivedRollbacks)) return null;
  const consumedEffectKeys = sortedStrings(record.consumedEffectKeys, true);
  const plannedEffectKeys = new Set(activePlan.children.flatMap((child) => child.allowedEffectKeys));
  if (!consumedEffectKeys || [...effects].some((item) => !consumedEffectKeys.includes(item)) ||
      consumedEffectKeys.some((item) => !effects.has(item) && !plannedEffectKeys.has(item))) return null;
  const counterItems = dense(record.childCounters, false);
  if (!counterItems || counterItems.length !== activePlan.children.length) return null;
  const childCounters: FeatureOperationChildCountersV1[] = [];
  for (let index = 0; index < counterItems.length; index += 1) {
    const counter = closed(counterItems[index], ["childId", "initiationAttempts", "implementationAttempts", "publicationAttempts", "integrationAttempts", "rollbackAttempts", "retryAttempts"]);
    if (!counter || counter.childId !== activePlan.children[index].childId || ["initiationAttempts", "implementationAttempts", "publicationAttempts", "integrationAttempts", "rollbackAttempts", "retryAttempts"].some((field) => !sequence(counter[field]))) return null;
    childCounters.push(counter as unknown as FeatureOperationChildCountersV1);
  }
  if (childCounters.some((counter) =>
    acceptedIntegrations.filter((item) => item.childId === counter.childId).length > counter.integrationAttempts ||
    acceptedRollbacks.filter((item) => item.childId === counter.childId).length > counter.rollbackAttempts)) return null;
  for (let index = 0; index < activePlan.children.length; index += 1) {
    const child = activePlan.children[index];
    const counter = childCounters[index];
    if (counter.initiationAttempts > 1 || counter.implementationAttempts > child.maxImplementationAttempts ||
        counter.publicationAttempts > child.maxPublicationAttempts || counter.integrationAttempts > child.maxIntegrationAttempts ||
        counter.rollbackAttempts > child.maxRollbackAttempts || counter.retryAttempts > child.maxRetries ||
        counter.retryAttempts > counter.initiationAttempts + counter.implementationAttempts + counter.publicationAttempts +
          counter.integrationAttempts + counter.rollbackAttempts) return null;
  }
  const operationCounters = closed(record.operationCounters, ["featureBranchCreateAttempts", "featureWorkspaceDraftPrAttempts", "totalChildAttempts", "totalIntegrationAttempts", "totalRollbackAttempts", "capturedEvidenceCount"]);
  if (!operationCounters || Object.values(operationCounters).some((value) => !sequence(value)) ||
      operationCounters.totalIntegrationAttempts !== childCounters.reduce((total, item) => total + item.integrationAttempts, 0) ||
      operationCounters.totalRollbackAttempts !== childCounters.reduce((total, item) => total + item.rollbackAttempts, 0) ||
      operationCounters.totalChildAttempts !== childCounters.reduce((total, item) => total + item.initiationAttempts + item.implementationAttempts + item.publicationAttempts, 0) ||
      (operationCounters.featureBranchCreateAttempts as number) > activePlan.limits.maxFeatureBranchCreateAttempts ||
      (operationCounters.featureWorkspaceDraftPrAttempts as number) > activePlan.limits.maxFeatureWorkspaceDraftPrAttempts ||
      (operationCounters.totalChildAttempts as number) > activePlan.limits.maxTotalChildAttempts ||
      (operationCounters.totalIntegrationAttempts as number) > activePlan.limits.maxTotalIntegrationAttempts ||
      (operationCounters.totalRollbackAttempts as number) > activePlan.limits.maxTotalRollbackAttempts) return null;
  const activeLeaseItems = dense(record.activeLeases, true);
  if (!activeLeaseItems || activeLeaseItems.length > activePlan.limits.maxConcurrency) return null;
  const activeLeases: FeatureOperationActiveLeaseV1[] = [];
  const activeLeaseIds = new Set<string>();
  const activeLeaseChildren = new Set<string>();
  const activeLeaseEffects = new Set<string>();
  const counterField = (derivation: string): keyof Omit<FeatureOperationChildCountersV1, "childId"> | null => ({
    child_initiation: "initiationAttempts",
    child_implementation: "implementationAttempts",
    child_draft_pr_create: "publicationAttempts",
    child_merge_to_feature: "integrationAttempts",
    child_revert_on_feature: "rollbackAttempts",
  } as Record<string, keyof Omit<FeatureOperationChildCountersV1, "childId"> | undefined>)[derivation] ?? null;
  for (const raw of activeLeaseItems) {
    const lease = closed(raw, ["leaseId", "childId", "derivationKind", "effectKey", "attemptNumber", "retryNumber", "acquiredAtOperationSequence"]);
    const child = lease && activePlan.children.find((item) => item.childId === lease.childId);
    const field = lease && counterField(lease.derivationKind as string);
    const counter = child && childCounters.find((item) => item.childId === child.childId);
    if (!lease || !child || !field || !counter || !identifier(lease.leaseId) || !CHILD_DERIVATIONS.has(lease.derivationKind as string) ||
        !child.permittedDerivations.includes(lease.derivationKind as FeatureOperationDerivationKindV1) ||
        !identifier(lease.effectKey) || !effectKeyMatchesDerivation(lease.effectKey as string, lease.derivationKind as FeatureOperationDerivationKindV1) ||
        !child.allowedEffectKeys.includes(lease.effectKey as string) || !positive(lease.attemptNumber) || !sequence(lease.retryNumber) ||
        !sequence(lease.acquiredAtOperationSequence) || (lease.acquiredAtOperationSequence as number) > transitions.at(-1)!.operationSequence ||
        lease.attemptNumber !== counter[field] || (lease.retryNumber as number) > counter.retryAttempts ||
        activeLeaseIds.has(lease.leaseId as string) || activeLeaseChildren.has(child.childId) || activeLeaseEffects.has(lease.effectKey as string) ||
        consumedEffectKeys.includes(lease.effectKey as string)) return null;
    activeLeaseIds.add(lease.leaseId as string);
    activeLeaseChildren.add(child.childId);
    activeLeaseEffects.add(lease.effectKey as string);
    activeLeases.push(lease as unknown as FeatureOperationActiveLeaseV1);
  }
  const integratedChildren = new Set(acceptedIntegrations.filter((item) => !item.reverted).map((item) => item.childId));
  const firstIncomplete = activePlan.eligibilityOrder.findIndex((childId) => !integratedChildren.has(childId));
  if (firstIncomplete >= 0 && activePlan.eligibilityOrder.slice(firstIncomplete + 1).some((childId) => integratedChildren.has(childId))) return null;
  const availableChildren = activePlan.eligibilityOrder.filter((childId) => {
    const child = activePlan.children.find((item) => item.childId === childId)!;
    return !integratedChildren.has(childId) && child.dependsOn.every((dependency) => integratedChildren.has(dependency));
  });
  if (activeLeases.some((lease, index) => lease.childId !== availableChildren[index])) return null;
  const observedAt = closed(record.observedAt, ["value", "provenance"]);
  if (!observedAt || !timestamp(observedAt.value) || observedAt.provenance !== "hostTrusted") return null;
  const evidenceItems = dense(record.acceptedReviewEvidence, true);
  if (!evidenceItems) return null;
  const acceptedReviewEvidence: FeatureOperationReviewEvidenceV1[] = [];
  const evidenceRefs = new Set<string>();
  for (const raw of evidenceItems) {
    const item = closed(raw, ["evidenceRef", "gateType", "gateId", "childId", "repositoryId", "headRevision", "sourceRecordDigest"]);
    if (!item || !identifier(item.evidenceRef) || evidenceRefs.has(item.evidenceRef) || !["mack", "fury", "human"].includes(item.gateType as string) ||
        !identifier(item.gateId) || !identifier(item.childId) || !activePlan.children.some((child) => child.childId === item.childId) ||
        item.repositoryId !== activePlan.repositoryId || !revision(item.headRevision) || !digestString(item.sourceRecordDigest) ||
        (item.gateType === "mack" && item.gateId !== "mack") || (item.gateType === "fury" && item.gateId !== "fury") ||
        (item.gateType === "human" && !activePlan.children.find((child) => child.childId === item.childId)?.requiredGates.humanGateIds.includes(item.gateId as string))) return null;
    evidenceRefs.add(item.evidenceRef);
    acceptedReviewEvidence.push(item as unknown as FeatureOperationReviewEvidenceV1);
  }
  if (operationCounters.capturedEvidenceCount !== acceptedReviewEvidence.length ||
      (operationCounters.capturedEvidenceCount as number) > activePlan.limits.maxCapturedEvidence) return null;
  return clone({ ...record, activePlan, acceptedPlanLineage: lineage, acceptedAmendmentDigests: amendments, transitions,
    acceptedIntegrations, acceptedRollbacks, consumedEffectKeys, childCounters, activeLeases, acceptedReviewEvidence } as unknown as FeatureOperationReplayContextV1);
}

export function validateFeatureOperationReplayContextV1(input: unknown): FeatureOperationContractResult<FeatureOperationReplayContextV1> {
  try {
    const replay = checkReplayShape(input);
    return replay ? valid(replay) : invalid("replay_context_invalid", "Feature operation replay context is invalid.");
  } catch {
    return invalid("replay_context_invalid", "Feature operation replay context is invalid.");
  }
}

function candidateFields(stage: unknown, derivation: unknown): string[] | null {
  if (stage === "initiation" && derivation === "feature_branch_create") return [...COMMON_CANDIDATE_FIELDS, "sourceRevision", "targetBranch"];
  if (stage === "initiation" && derivation === "feature_workspace_draft_pr_create") return [...COMMON_CANDIDATE_FIELDS, "sourceBranch", "targetBranch", "draftOnly"];
  if (stage === "initiation" && derivation === "child_initiation") return [...COMMON_CANDIDATE_FIELDS, "childId", "sourceFeatureHead", "childBranch"];
  if (stage === "implementation" && derivation === "child_implementation") return [...COMMON_CANDIDATE_FIELDS, "childId", "childBaseRevision", "childBranch"];
  if (stage === "child_publication" && derivation === "child_draft_pr_create") return [...COMMON_CANDIDATE_FIELDS, "childId", "childBranch", "childHeadRevision", "targetBranch", "draftOnly"];
  if (stage === "integration" && derivation === "child_merge_to_feature") return [...COMMON_CANDIDATE_FIELDS, "childId", "childBranch", "childHeadRevision", "childTreeDigest", "targetBranch", "integrationMethod", "predecessorIntegrationReceiptDigest", "reviewEvidenceRefs"];
  if (stage === "rollback" && derivation === "child_revert_on_feature") return [...COMMON_CANDIDATE_FIELDS, "childId", "integrationReceiptDigest", "integrationHeadRevision", "integrationTreeDigest", "expectedRestoredTreeDigest", "targetBranch", "rollbackMethod"];
  return null;
}

function checkCandidateShape(input: unknown, verifyOwnDigest: boolean): FeatureOperationDerivedCandidateV1 | null {
  if (!plain(input)) return null;
  const stage = Object.getOwnPropertyDescriptor(input, "stage")?.value;
  const derivation = Object.getOwnPropertyDescriptor(input, "derivationKind")?.value;
  const fields = candidateFields(stage, derivation);
  const record = fields && closed(input, fields);
  if (!record || record.schemaVersion !== 1 || record.contractVersion !== FEATURE_OPERATION_CONTRACT_VERSION ||
      !identifier(record.repositoryId) || !identifier(record.operationId) || !digestString(record.planDigest) || !digestString(record.authorityDigest) ||
      !identifier(record.effectKey) || !digestString(record.candidateDigest)) return null;
  const requestedScope = checkedScope(record.requestedScope);
  if (!requestedScope) return null;
  if (derivation === "feature_branch_create" && (!revision(record.sourceRevision) || !branch(record.targetBranch))) return null;
  if (derivation === "feature_workspace_draft_pr_create" && (!branch(record.sourceBranch) || !branch(record.targetBranch) || record.draftOnly !== true)) return null;
  if (derivation === "child_initiation" && (!identifier(record.childId) || !revision(record.sourceFeatureHead) || !branch(record.childBranch))) return null;
  if (derivation === "child_implementation" && (!identifier(record.childId) || !revision(record.childBaseRevision) || !branch(record.childBranch))) return null;
  if (derivation === "child_draft_pr_create" && (!identifier(record.childId) || !branch(record.childBranch) || !revision(record.childHeadRevision) || !branch(record.targetBranch) || record.draftOnly !== true)) return null;
  if (derivation === "child_merge_to_feature") {
    const evidenceRefs = sortedStrings(record.reviewEvidenceRefs, true);
    if (!identifier(record.childId) || !branch(record.childBranch) || !revision(record.childHeadRevision) || !digestString(record.childTreeDigest) ||
        !branch(record.targetBranch) || !identifier(record.integrationMethod) ||
        !(record.predecessorIntegrationReceiptDigest === null || digestString(record.predecessorIntegrationReceiptDigest)) || !evidenceRefs) return null;
    record.reviewEvidenceRefs = evidenceRefs;
  }
  if (derivation === "child_revert_on_feature" && (!identifier(record.childId) || !digestString(record.integrationReceiptDigest) ||
      !revision(record.integrationHeadRevision) || !digestString(record.integrationTreeDigest) || !digestString(record.expectedRestoredTreeDigest) ||
      !branch(record.targetBranch) || record.rollbackMethod !== "revert_commit")) return null;
  const policy = STAGE_SCOPE_POLICY[derivation as FeatureOperationDerivationKindV1];
  if (!policy || !effectKeyMatchesDerivation(record.effectKey as string, derivation as FeatureOperationDerivationKindV1) ||
      requestedScope.effectKeys.some((item) => !effectKeyMatchesDerivation(item, derivation as FeatureOperationDerivationKindV1)) ||
      requestedScope.actionIds.some((item) => !(policy.actions as readonly string[]).includes(item)) ||
      requestedScope.capabilityIds.some((item) => !(policy.capabilities as readonly string[]).includes(item)) ||
      requestedScope.publicationOperations.some((item) => !(policy.publications as readonly string[]).includes(item)) ||
      requestedScope.validationIds.some((item) => !(policy.validations as readonly string[]).includes(item)) ||
      (!CHILD_DERIVATIONS.has(derivation) && requestedScope.requestedRetries !== 0) ||
      (derivation === "child_merge_to_feature" && !INTEGRATION_METHODS.includes(record.integrationMethod as (typeof INTEGRATION_METHODS)[number]))) return null;
  const candidate = clone({ ...record, requestedScope } as unknown as FeatureOperationDerivedCandidateV1);
  if (verifyOwnDigest && computeCandidateDigestUnchecked(candidate) !== candidate.candidateDigest) return null;
  return candidate;
}

function computeCandidateDigestUnchecked(candidate: FeatureOperationDerivedCandidateV1): string {
  const copy = clone(candidate) as unknown as Record<string, unknown>;
  delete copy.candidateDigest;
  return digest("candidate", copy);
}

export function computeFeatureOperationDerivedCandidateDigestV1(input: unknown): string {
  const candidate = checkCandidateShape(input, false);
  if (!candidate) throw new TypeError("Feature operation candidate is invalid.");
  return computeCandidateDigestUnchecked(candidate);
}

export function validateFeatureOperationDerivedCandidateV1(input: unknown): FeatureOperationContractResult<FeatureOperationDerivedCandidateV1> {
  try {
    const candidate = checkCandidateShape(input, true);
    return candidate ? valid(candidate) : invalid("candidate_invalid", "Feature operation candidate is invalid.");
  } catch {
    return invalid("candidate_invalid", "Feature operation candidate is invalid.");
  }
}

function equal(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }
function subset(left: readonly string[], right: readonly string[]): boolean { return left.every((item) => right.includes(item)); }
function pathContained(candidate: string, allowed: string): boolean { return candidate === allowed || candidate.startsWith(`${allowed}/`); }
function pathsSubset(left: readonly string[], right: readonly string[]): boolean { return left.every((item) => right.some((allowed) => pathContained(item, allowed))); }

function noWeakerGates(next: FeatureOperationRequiredGatesV1 | FeatureOperationRequestedGatesV1, prior: FeatureOperationRequiredGatesV1 | FeatureOperationRequestedGatesV1): boolean {
  return (!prior.mack || next.mack) && (!prior.fury || next.fury) && subset(prior.humanGateIds, next.humanGateIds);
}

function compareChildScope(prior: FeatureOperationChildV1, successor: FeatureOperationChildV1): { narrow: boolean; widen: boolean } {
  let narrow = false;
  let widen = false;
  const sets: Array<[readonly string[], readonly string[]]> = [
    [prior.allowedRelativePaths, successor.allowedRelativePaths], [prior.allowedActionIds, successor.allowedActionIds],
    [prior.allowedEffectKeys, successor.allowedEffectKeys], [prior.allowedCapabilityIds, successor.allowedCapabilityIds],
    [prior.allowedValidationIds, successor.allowedValidationIds], [prior.allowedPublicationOperations, successor.allowedPublicationOperations],
  ];
  sets.forEach(([oldSet, newSet], index) => {
    const contained = index === 0 ? pathsSubset(newSet, oldSet) : subset(newSet, oldSet);
    if (!contained) widen = true;
    if (!equal(oldSet, newSet)) narrow = true;
  });
  if (!noWeakerGates(successor.requiredGates, prior.requiredGates) || !subset(prior.exclusions, successor.exclusions)) widen = true;
  if (!equal(successor.requiredGates, prior.requiredGates) || !equal(successor.exclusions, prior.exclusions)) narrow = true;
  for (const field of ["maxImplementationAttempts", "maxPublicationAttempts", "maxIntegrationAttempts", "maxRollbackAttempts", "maxRetries"] as const) {
    if (successor[field] > prior[field]) widen = true;
    if (successor[field] < prior[field]) narrow = true;
  }
  return { narrow, widen };
}

export function compareFeatureOperationAmendmentV1(priorInput: unknown, successorInput: unknown): FeatureOperationAmendmentComparisonV1 {
  const priorResult = validateFeatureOperationPlanV1(priorInput);
  const successorResult = validateFeatureOperationPlanV1(successorInput);
  if (priorResult.state === "invalid" || successorResult.state === "invalid") return invalid("plan_invalid", "Both amendment plans must be valid.");
  const prior = priorResult.value;
  const successor = successorResult.value;
  if (equal(prior, successor)) return { state: "valid", classification: "identical" };
  if (successor.planSequence !== prior.planSequence + 1 || successor.predecessorPlanDigest !== prior.planDigest || successor.planDigest === prior.planDigest ||
      successor.planDigest === prior.predecessorPlanDigest) return invalid("lineage_invalid", "Amendment is not the exact contiguous successor.");
  const immutablePlan = (plan: Readonly<FeatureOperationPlanV1>) => ({
    schemaVersion: plan.schemaVersion, contractVersion: plan.contractVersion, operationId: plan.operationId,
    objective: plan.objective, sourceProvenance: plan.sourceProvenance, repositoryId: plan.repositoryId,
    baseBranch: plan.baseBranch, baseRevision: plan.baseRevision, baseTreeDigest: plan.baseTreeDigest,
    featureBranch: plan.featureBranch, acceptanceCriteria: plan.acceptanceCriteria, eligibilityOrder: plan.eligibilityOrder,
    integrationMethods: plan.integrationPolicy.allowedMethods, integrationTarget: plan.integrationPolicy.targetBranch,
    lifecyclePolicy: plan.lifecyclePolicy, finalGates: plan.finalGates,
    children: plan.children.map((child) => ({
      childId: child.childId, order: child.order, objective: child.objective, dependsOn: child.dependsOn,
      branchName: child.branchName, repositoryId: child.repositoryId, riskClassification: child.riskClassification,
      acceptanceCriterionIds: child.acceptanceCriterionIds, permittedDerivations: child.permittedDerivations,
    })),
  });
  if (!equal(immutablePlan(prior), immutablePlan(successor))) return { state: "valid", classification: "material" };
  let narrow = false;
  let widen = false;
  prior.children.forEach((child, index) => {
    const comparison = compareChildScope(child, successor.children[index]);
    narrow ||= comparison.narrow;
    widen ||= comparison.widen;
  });
  for (const field of LIMIT_FIELDS) {
    if (successor.limits[field] > prior.limits[field]) widen = true;
    if (successor.limits[field] < prior.limits[field]) narrow = true;
  }
  if (timestampBefore(prior.expiresAt, successor.expiresAt)) widen = true;
  if (timestampBefore(successor.expiresAt, prior.expiresAt)) narrow = true;
  if (!subset(prior.exclusions, successor.exclusions)) widen = true;
  if (!equal(prior.exclusions, successor.exclusions)) narrow = true;
  return { state: "valid", classification: !widen && narrow ? "pure_narrowing" : "material" };
}

function candidateChild(candidate: FeatureOperationDerivedCandidateV1, plan: Readonly<FeatureOperationPlanV1>): Readonly<FeatureOperationChildV1> | null {
  return "childId" in candidate ? plan.children.find((child) => child.childId === candidate.childId) ?? null : null;
}

function requestedScopeIsSubset(candidate: FeatureOperationDerivedCandidateV1, child: Readonly<FeatureOperationChildV1> | null, plan: Readonly<FeatureOperationPlanV1>): boolean {
  const scope = candidate.requestedScope;
  const union = (items: readonly (readonly string[])[]) => [...new Set(items.flat())].sort(compareFeatureOperationCanonicalStringsV1);
  const operationPaths = union(plan.children.map((item) => item.allowedRelativePaths));
  const operationActions = union(plan.children.map((item) => item.allowedActionIds));
  const operationEffects = union(plan.children.map((item) => item.allowedEffectKeys));
  const operationCapabilities = union(plan.children.map((item) => item.allowedCapabilityIds));
  const operationValidations = union(plan.children.map((item) => item.allowedValidationIds));
  const operationPublication = union(plan.children.map((item) => item.allowedPublicationOperations));
  const parent = child ?? {
    allowedRelativePaths: operationPaths, allowedActionIds: operationActions, allowedEffectKeys: operationEffects,
    allowedCapabilityIds: operationCapabilities, allowedValidationIds: operationValidations,
    allowedPublicationOperations: operationPublication,
    requiredGates: { mack: true as const, fury: true as const, humanGateIds: [] }, exclusions: plan.exclusions,
  };
  if (!pathsSubset(scope.relativePaths, parent.allowedRelativePaths) || !subset(scope.actionIds, parent.allowedActionIds) ||
      !subset(scope.effectKeys, parent.allowedEffectKeys) || !subset(scope.capabilityIds, parent.allowedCapabilityIds) ||
      !subset(scope.validationIds, parent.allowedValidationIds) || !subset(scope.publicationOperations, parent.allowedPublicationOperations) ||
      !noWeakerGates(scope.requiredGates, parent.requiredGates) || !subset(parent.exclusions, scope.exclusions) ||
      !scope.effectKeys.includes(candidate.effectKey) || !operationEffects.includes(candidate.effectKey) ||
      (child !== null && (!child.permittedDerivations.includes(candidate.derivationKind) || !child.allowedEffectKeys.includes(candidate.effectKey)))) return false;
  const strict = !equal(scope.relativePaths, operationPaths) || !equal(scope.actionIds, operationActions) ||
    !equal(scope.effectKeys, operationEffects) || !equal(scope.capabilityIds, operationCapabilities) ||
    !equal(scope.validationIds, operationValidations) || !equal(scope.publicationOperations, operationPublication) ||
    !equal(scope.exclusions, plan.exclusions) || plan.children.length > 1 ||
    FEATURE_OPERATION_DERIVATION_KINDS.length > 1;
  return strict;
}

function terminalFeatureState(replay: Readonly<FeatureOperationReplayContextV1>): { head: string; tree: string } {
  const terminal = replay.transitions[replay.transitions.length - 1];
  return { head: terminal.resultingHeadRevision, tree: terminal.resultingTreeDigest };
}

function branchAndRevisionValid(candidate: FeatureOperationDerivedCandidateV1, child: Readonly<FeatureOperationChildV1> | null, plan: Readonly<FeatureOperationPlanV1>, replay: Readonly<FeatureOperationReplayContextV1>): boolean {
  const current = terminalFeatureState(replay);
  switch (candidate.derivationKind) {
    case "feature_branch_create": return candidate.sourceRevision === plan.baseRevision && candidate.targetBranch === plan.featureBranch;
    case "feature_workspace_draft_pr_create": return candidate.sourceBranch === plan.featureBranch && candidate.targetBranch === plan.baseBranch && candidate.draftOnly;
    case "child_initiation": return child !== null && candidate.sourceFeatureHead === current.head && candidate.childBranch === child.branchName;
    case "child_implementation": return child !== null && candidate.childBaseRevision === current.head && candidate.childBranch === child.branchName;
    case "child_draft_pr_create": return child !== null && candidate.childBranch === child.branchName && candidate.targetBranch === plan.featureBranch && candidate.draftOnly;
    case "child_merge_to_feature": return child !== null && candidate.childBranch === child.branchName && candidate.targetBranch === plan.featureBranch && plan.integrationPolicy.allowedMethods.includes(candidate.integrationMethod);
    case "child_revert_on_feature": return child !== null && candidate.targetBranch === plan.featureBranch && candidate.rollbackMethod === "revert_commit";
  }
}

function stageEvidenceApplicable(candidate: FeatureOperationDerivedCandidateV1): boolean {
  if (candidate.stage === "integration") return candidate.reviewEvidenceRefs.length > 0;
  return true;
}

function dependenciesEligible(candidate: FeatureOperationDerivedCandidateV1, child: Readonly<FeatureOperationChildV1> | null, replay: Readonly<FeatureOperationReplayContextV1>): boolean {
  if (!child) return true;
  const integratedChildren = new Set(replay.acceptedIntegrations.filter((item) => !item.reverted).map((item) => item.childId));
  if (!child.dependsOn.every((dependency) => integratedChildren.has(dependency))) return false;
  if (candidate.derivationKind === "child_revert_on_feature") return true;
  const activeChildren = new Set(replay.activeLeases.map((lease) => lease.childId));
  const next = replay.activePlan.eligibilityOrder.find((childId) => {
    const planned = replay.activePlan.children.find((item) => item.childId === childId)!;
    return !integratedChildren.has(childId) && !activeChildren.has(childId) &&
      planned.dependsOn.every((dependency) => integratedChildren.has(dependency));
  });
  return next === child.childId;
}

function integrationEvidenceValid(candidate: FeatureOperationDerivedCandidateV1, child: Readonly<FeatureOperationChildV1> | null, replay: Readonly<FeatureOperationReplayContextV1>): boolean {
  if (candidate.stage !== "integration" || !child) return true;
  const evidence = candidate.reviewEvidenceRefs.map((reference) => replay.acceptedReviewEvidence.find((item) => item.evidenceRef === reference));
  if (evidence.some((item) => !item)) return false;
  const checked = evidence as FeatureOperationReviewEvidenceV1[];
  if (checked.some((item) => item.childId !== child.childId || item.repositoryId !== replay.repositoryId || item.headRevision !== candidate.childHeadRevision)) return false;
  const applicable = replay.acceptedReviewEvidence.filter((item) =>
    item.childId === child.childId && item.repositoryId === replay.repositoryId && item.headRevision === candidate.childHeadRevision);
  const exactGate = (gateType: "mack" | "fury" | "human", gateId: string) => {
    const inventory = applicable.filter((item) => item.gateType === gateType && item.gateId === gateId);
    return inventory.length === 1 && checked.filter((item) => item.evidenceRef === inventory[0].evidenceRef).length === 1;
  };
  return exactGate("mack", "mack") && exactGate("fury", "fury") &&
    child.requiredGates.humanGateIds.every((gate) => exactGate("human", gate)) &&
    checked.length === 2 + child.requiredGates.humanGateIds.length;
}

function revisionFresh(candidate: FeatureOperationDerivedCandidateV1, replay: Readonly<FeatureOperationReplayContextV1>): boolean {
  const current = terminalFeatureState(replay);
  if (candidate.derivationKind === "child_initiation") return candidate.sourceFeatureHead === current.head;
  if (candidate.derivationKind === "child_implementation") return candidate.childBaseRevision === current.head;
  if (candidate.derivationKind === "child_merge_to_feature") {
    const prior = replay.acceptedIntegrations.at(-1)?.receiptDigest ?? null;
    return candidate.predecessorIntegrationReceiptDigest === prior;
  }
  if (candidate.derivationKind === "child_revert_on_feature") {
    const latest = replay.acceptedIntegrations.filter((item) => !item.reverted).at(-1);
    return !!latest && latest.childId === candidate.childId && latest.receiptDigest === candidate.integrationReceiptDigest &&
      latest.resultingHeadRevision === candidate.integrationHeadRevision && latest.resultingTreeDigest === candidate.integrationTreeDigest &&
      latest.priorTreeDigest === candidate.expectedRestoredTreeDigest && current.head === latest.resultingHeadRevision && current.tree === latest.resultingTreeDigest;
  }
  return true;
}

function boundsAvailable(candidate: FeatureOperationDerivedCandidateV1, child: Readonly<FeatureOperationChildV1> | null, replay: Readonly<FeatureOperationReplayContextV1>, plan: Readonly<FeatureOperationPlanV1>): boolean {
  const counters = child && replay.childCounters.find((item) => item.childId === child.childId);
  let remaining = 0;
  switch (candidate.derivationKind) {
    case "feature_branch_create": remaining = plan.limits.maxFeatureBranchCreateAttempts - replay.operationCounters.featureBranchCreateAttempts; break;
    case "feature_workspace_draft_pr_create": remaining = plan.limits.maxFeatureWorkspaceDraftPrAttempts - replay.operationCounters.featureWorkspaceDraftPrAttempts; break;
    case "child_initiation": remaining = child && counters ? Math.min(1 - counters.initiationAttempts, plan.limits.maxTotalChildAttempts - replay.operationCounters.totalChildAttempts) : 0; break;
    case "child_implementation": remaining = child && counters ? Math.min(child.maxImplementationAttempts - counters.implementationAttempts, plan.limits.maxTotalChildAttempts - replay.operationCounters.totalChildAttempts) : 0; break;
    case "child_draft_pr_create": remaining = child && counters ? Math.min(child.maxPublicationAttempts - counters.publicationAttempts, plan.limits.maxTotalChildAttempts - replay.operationCounters.totalChildAttempts) : 0; break;
    case "child_merge_to_feature": remaining = child && counters ? Math.min(child.maxIntegrationAttempts - counters.integrationAttempts, plan.limits.maxTotalIntegrationAttempts - replay.operationCounters.totalIntegrationAttempts) : 0; break;
    case "child_revert_on_feature": remaining = child && counters ? Math.min(child.maxRollbackAttempts - counters.rollbackAttempts, plan.limits.maxTotalRollbackAttempts - replay.operationCounters.totalRollbackAttempts) : 0; break;
  }
  const retriesRemaining = child && counters ? child.maxRetries - counters.retryAttempts : 0;
  return candidate.requestedScope.requestedAttempts <= remaining &&
    (child === null || (candidate.requestedScope.requestedRetries <= retriesRemaining && replay.activeLeases.length < plan.limits.maxConcurrency));
}

export function evaluateFeatureOperationDerivedCandidateV1(
  planInput: unknown,
  signedAuthorityInput: unknown,
  verificationInput: unknown,
  replayInput: unknown,
  candidateInput: unknown,
): FeatureOperationEvaluationV1 {
  const blocked = (reasonCode: FeatureOperationBlockedReasonV1): FeatureOperationEvaluationV1 => ({ state: "blocked", reasonCode });
  const planResult = validateFeatureOperationPlanV1(planInput);
  if (planResult.state === "invalid") return blocked("PLAN_INVALID");
  const envelopeResult = validateSignedFeatureOperationAuthorityV1(signedAuthorityInput);
  if (envelopeResult.state === "invalid") return blocked("SIGNED_AUTHORITY_INVALID");
  const verification = checkVerificationInput(verificationInput);
  if (!verification) return blocked("TRUSTED_COULSON_BINDING_INVALID");
  const trusted = trustedBindingForAuthority(envelopeResult.value.payload, verification);
  if (trusted.state === "invalid") return blocked("TRUSTED_COULSON_BINDING_INVALID");
  if (!verifyEnvelopeWithBinding(envelopeResult.value, trusted.binding)) return blocked("AUTHORITY_SIGNATURE_INVALID");
  const replayResult = validateFeatureOperationReplayContextV1(replayInput);
  if (replayResult.state === "invalid") return blocked("REPLAY_CONTEXT_INVALID");
  const plan = planResult.value;
  const authority = envelopeResult.value.payload;
  const replay = replayResult.value;
  const candidateResult = validateFeatureOperationDerivedCandidateV1(candidateInput);
  if (authority.missionId !== verification.expectedMissionId || authority.operationId !== verification.expectedOperationId ||
      authority.operationSequence !== verification.expectedOperationSequence || authority.journalSequence !== verification.expectedJournalSequence ||
      authority.planDigest !== plan.planDigest || authority.authorityDigest !== replay.verifiedAuthorityDigest || replay.activePlanDigest !== plan.planDigest ||
      replay.operationId !== plan.operationId || replay.repositoryId !== plan.repositoryId || replay.verifiedAuthorityId !== authority.authorityId ||
      (candidateResult.state === "valid" && (candidateResult.value.repositoryId !== plan.repositoryId || candidateResult.value.operationId !== plan.operationId ||
        candidateResult.value.planDigest !== plan.planDigest || candidateResult.value.authorityDigest !== authority.authorityDigest))) return blocked("IDENTITY_OR_DIGEST_MISMATCH");
  const activeLineage = replay.acceptedPlanLineage.at(-1);
  if (!activeLineage?.active || activeLineage.planDigest !== plan.planDigest || activeLineage.authorityDigest !== authority.authorityDigest) return blocked("AUTHORITY_OR_LINEAGE_INACTIVE");
  if (replay.lifecycle.state !== "active") return blocked("LIFECYCLE_BLOCKED");
  if (authority.operationSequence !== replay.acceptedAuthorityOperationSequence || authority.journalSequence !== replay.currentJournalSequence) return blocked("SEQUENCE_MISMATCH");
  if (timestampBefore(replay.observedAt.value, authority.issuedAt)) return blocked("REPLAY_CONTEXT_INVALID");
  if (!timestampBefore(replay.observedAt.value, authority.expiresAt)) return blocked("AUTHORITY_EXPIRED");
  if (candidateResult.state === "invalid") return blocked("CANDIDATE_INVALID");
  const candidate = candidateResult.value;
  if (!stageEvidenceApplicable(candidate)) return blocked("STAGE_OR_EVIDENCE_INAPPLICABLE");
  const child = candidateChild(candidate, plan);
  if (("childId" in candidate && !child) || !dependenciesEligible(candidate, child, replay)) return blocked("CHILD_OR_DEPENDENCY_INELIGIBLE");
  if (!revisionFresh(candidate, replay)) return blocked("FEATURE_OR_CHILD_REVISION_STALE");
  if (!requestedScopeIsSubset(candidate, child, plan) || !authority.permittedDerivations.includes(candidate.derivationKind) ||
      (child !== null && !child.allowedEffectKeys.includes(candidate.effectKey))) return blocked("SCOPE_NOT_STRICT_SUBSET");
  if (!branchAndRevisionValid(candidate, child, plan, replay)) return blocked("BRANCH_TARGET_OR_METHOD_INVALID");
  if (!integrationEvidenceValid(candidate, child, replay)) return blocked("INTEGRATION_EVIDENCE_INVALID");
  if (!boundsAvailable(candidate, child, replay, plan)) return blocked("BOUNDS_EXHAUSTED");
  if (replay.consumedEffectKeys.includes(candidate.effectKey)) return blocked("EFFECT_KEY_REUSED");
  const current = terminalFeatureState(replay);
  return { state: "eligible", candidate, currentFeatureHead: current.head, currentFeatureTreeDigest: current.tree };
}
