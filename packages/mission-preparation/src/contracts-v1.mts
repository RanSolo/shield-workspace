import { isAbsolute, normalize } from "node:path";
import {
  canonicalCloneV1,
  computeCanonicalContractDigestV1,
  computeContentIdV1,
  deepFreeze,
  invalidResult,
  isCanonicalDigestV1,
  makeContractV1,
  readExactArgumentV1,
  utf16CompareV1,
  validResult,
  type CanonicalContractDigestV1,
  type PreparationValidationResultV1,
  type RawReceiptSetSha256V1,
} from "./canonical-json-v1.mjs";

export const EVENT_KINDS_V1 = deepFreeze([
  "governance.decided",
  "implementation.authorized",
  "runtime.binding_recorded",
  "review.publication_authorized",
] as const);

export const PUBLICATION_EFFECTS_V1 = deepFreeze([
  "review.branch.push",
  "review.pull_request.create_draft",
] as const);

export const EXCLUSIONS_V1 = deepFreeze([
  "review.comment.publish",
  "review.pull_request.update_draft",
  "review.pull_request.mark_ready",
  "merge",
  "deployment",
  "release",
  "final_acceptance",
] as const);

type CommonContractV1 = Readonly<{
  schemaId: string;
  authority: "none";
  id: string;
  digest: CanonicalContractDigestV1;
}>;

export type TransitionPlanV1 = CommonContractV1 & Readonly<{
  schemaId: "mission.transition-plan.v1";
  missionId: string;
  subjectId: string;
  repositoryId: string;
  planningBaseRevision: string;
  parentPlanCommit: string;
  parentPlanPath: string;
  parentPlanRawSha256: string;
  transitionKind: "fresh_authorize_wheels_up";
  boundedOutcome: string;
  approvedRelativePaths: readonly string[];
  publicationPaths: readonly string[];
  approvedActionIds: readonly string[];
  approvedEffectClasses: readonly ("behavioral_implementation" | "verification" | "coordination")[];
  approvedEffectKeys: readonly string[];
  approvedCapabilities: readonly string[];
  validationCommandIds: readonly string[];
  modelId: string;
  reasoningRuntimeId: string;
  toolExecutorId: string;
  exclusions: typeof EXCLUSIONS_V1;
}>;

export type ParentPlanReviewEvidenceV1 = CommonContractV1 & Readonly<{
  schemaId: "mission.parent-plan-review-evidence.v1";
  repositoryId: string;
  planningBaseRevision: string;
  parentPlanCommit: string;
  parentPlanPath: string;
  parentPlanRawSha256: string;
  transitionPlanId: string;
  transitionPlanDigest: CanonicalContractDigestV1;
  verdict: "PASS" | "PASS_WITH_REQUIRED_CHANGES" | "FAIL";
  reviewerSeatId: "fury";
  reviewerRuntimeId: string;
  reviewerModelId: string;
  reviewerExecutorId: string;
  rawReceiptSetSha256: RawReceiptSetSha256V1;
  attributionClass: "team_system_projection" | "synthetic_test";
  preparationEligibility: "preparationEligible";
}>;

export type TransitionIntentV1 = CommonContractV1 & Readonly<{
  schemaId: "mission.transition-intent.v1";
  missionId: string;
  subjectId: string;
  repositoryId: string;
  planningBaseRevision: string;
  transitionPlanId: string;
  transitionPlanDigest: CanonicalContractDigestV1;
  parentReviewEvidenceId: string;
  parentReviewEvidenceDigest: CanonicalContractDigestV1;
  transitionKind: "fresh_authorize_wheels_up";
  preparationEligibility: "preparationEligible";
}>;

export type FreshAuthorizeWheelsUpObservationV1 = CommonContractV1 & Readonly<{
  schemaId: "mission.fresh-authorize-wheels-up-observation.v1";
  missionId: string;
  subjectId: string;
  repositoryId: string;
  canonicalRoot: string;
  branch: string;
  planningBaseRevision: string;
  baseRevision: string;
  headRevision: string;
  baseAncestor: boolean;
  workspaceClean: boolean;
  changedPaths: readonly string[];
  symlinkPaths: readonly string[];
  gitlinkPaths: readonly string[];
  missionSchemaVersion: number;
  authorizationState: "waiting" | "authorized";
  implementationAuthorityState: "waiting" | "authorized" | "revoked";
  finalAcceptanceState: "waiting" | "accepted";
  executionState: "not-started" | "running" | "completed";
  implementationAuthorityCount: number;
  runtimeBindingCount: number;
  activeRuntimeBindingCount: number;
  publicationAuthorizationCount: number;
  pendingCoulsonMissionAuthorizationCount: number;
  journalSequence: number;
  journalSha256: RawReceiptSetSha256V1;
  signerBindingId: string | null;
  signingKeyRef: string | null;
  signerBindingMatchCount: number;
  remainingHumanGates: readonly string[];
  preparationEligibility: "preparationEligible";
}>;

export type NextTransitionSelectionV1 = CommonContractV1 & Readonly<{
  schemaId: "mission.next-transition-selection.v1";
  missionId: string;
  transitionIntentId: string;
  transitionIntentDigest: CanonicalContractDigestV1;
  observationId: string;
  observationDigest: CanonicalContractDigestV1;
  state: "ready" | "blocked";
  transitionKind: "authorize-wheels-up" | null;
  reasonCode: Exclude<PreparationReasonCodeV1, "invalid_preparation_input"> | null;
}>;

export type FreshAuthorizeWheelsUpCandidateV1 = CommonContractV1 & Readonly<{
  schemaId: "mission.fresh-authorize-wheels-up-candidate.v1";
  missionId: string;
  subjectId: string;
  repositoryId: string;
  transitionPlanId: string;
  transitionPlanDigest: CanonicalContractDigestV1;
  parentReviewEvidenceId: string;
  parentReviewEvidenceDigest: CanonicalContractDigestV1;
  transitionIntentId: string;
  transitionIntentDigest: CanonicalContractDigestV1;
  observationId: string;
  observationDigest: CanonicalContractDigestV1;
  selectionId: string;
  selectionDigest: CanonicalContractDigestV1;
  preparationEligibility: "preparationEligible";
  transitionKind: "authorize-wheels-up";
  seatId: "may";
  eventKinds: typeof EVENT_KINDS_V1;
  publicationEffects: typeof PUBLICATION_EFFECTS_V1;
  exclusions: typeof EXCLUSIONS_V1;
  actionInput: Readonly<{
    baseRevision: string;
    modelId: string;
    approvedRelativePaths: readonly string[];
    approvedActionIds: readonly string[];
    approvedEffectClasses: readonly string[];
    approvedEffectKeys: readonly string[];
    approvedCapabilities: readonly string[];
    validationCommandIds: readonly string[];
    reasoningRuntimeId: string;
    toolExecutorId: string;
    publicationPaths: readonly string[];
  }>;
  decisionProjection: Readonly<{
    missionId: string;
    subjectId: string;
    repositoryId: string;
    branch: string;
    baseRevision: string;
    headRevision: string;
    approvedRelativePaths: readonly string[];
    publicationPaths: readonly string[];
    approvedActionIds: readonly string[];
    approvedEffectClasses: readonly string[];
    approvedEffectKeys: readonly string[];
    approvedCapabilities: readonly string[];
    validationCommandIds: readonly string[];
    seatId: "may";
    modelId: string;
    reasoningRuntimeId: string;
    toolExecutorId: string;
    eventKinds: typeof EVENT_KINDS_V1;
    publicationEffects: typeof PUBLICATION_EFFECTS_V1;
    exclusions: typeof EXCLUSIONS_V1;
    remainingHumanGates: readonly string[];
  }>;
}>;

export type PreparationReceiptV1 = CommonContractV1 & Readonly<{
  schemaId: "mission.preparation-receipt.v1";
  missionId: string;
  repositoryId: string;
  transitionPlanId: string;
  transitionPlanDigest: CanonicalContractDigestV1;
  parentReviewEvidenceId: string;
  parentReviewEvidenceDigest: CanonicalContractDigestV1;
  transitionIntentId: string;
  transitionIntentDigest: CanonicalContractDigestV1;
  observationId: string;
  observationDigest: CanonicalContractDigestV1;
  selectionId: string;
  selectionDigest: CanonicalContractDigestV1;
  candidateId: string;
  candidateDigest: CanonicalContractDigestV1;
  rawReceiptSetSha256: RawReceiptSetSha256V1;
  preparationEligibility: "preparationEligible";
  result: "candidate_compiled";
}>;

export type PreparationReasonCodeV1 =
  | "invalid_preparation_input"
  | "reviewed_plan_mismatch"
  | "parent_plan_review_ineligible"
  | "repository_observation_stale"
  | "fresh_wheels_up_state_ineligible"
  | "freshness_evidence_incomplete";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const REVISION = /^[0-9a-f]{40}$/;
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const RAW_SHA256 = /^sha256:[0-9a-f]{64}$/;
const SIGNING_KEY = /^ed25519:sha256:[A-Za-z0-9_-]{43}$/;
const EFFECT_CLASSES = new Set(["behavioral_implementation", "verification", "coordination"]);
const VERDICTS = new Set(["PASS", "PASS_WITH_REQUIRED_CHANGES", "FAIL"]);
const REASONS = new Set(["reviewed_plan_mismatch", "parent_plan_review_ineligible", "repository_observation_stale", "fresh_wheels_up_state_ineligible", "freshness_evidence_incomplete"]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function bytesAtMost(value: unknown, maximum: number): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= maximum;
}

function identifier(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function repository(value: unknown): value is string { return typeof value === "string" && REPOSITORY.test(value); }
function revision(value: unknown): value is string { return typeof value === "string" && REVISION.test(value); }
function digest(value: unknown): value is CanonicalContractDigestV1 { return isCanonicalDigestV1(value); }
function rawHash(value: unknown): value is RawReceiptSetSha256V1 { return typeof value === "string" && RAW_SHA256.test(value); }
function integer(value: unknown, min: number, max: number): value is number { return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max; }

function relativePath(value: unknown): value is string {
  if (!bytesAtMost(value, 1024) || value.length === 0 || value.startsWith("/") || value.endsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function approvedPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 256 && ID.test(value) && relativePath(value);
}

function sortedUniqueStrings(
  value: unknown,
  item: (candidate: unknown) => candidate is string,
  compare: (left: string, right: string) => number,
  minimum = 1,
  maximum = 256,
): value is string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!item(value[index])) return false;
    if (index > 0 && compare(value[index - 1] as string, value[index] as string) >= 0) return false;
  }
  return true;
}

function orderedUniqueStrings(value: unknown, item: (candidate: unknown) => candidate is string, maximum: number): value is string[] {
  return Array.isArray(value) && value.length <= maximum && value.every(item) && new Set(value).size === value.length;
}

function locale(left: string, right: string): number { return left.localeCompare(right); }
function literalArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function absoluteNormalizedPath(value: unknown): value is string {
  return bytesAtMost(value, 4096) && value.length > 0 && !value.includes("\0") && isAbsolute(value) && normalize(value) === value;
}

function common(value: Record<string, unknown>, schemaId: string): boolean {
  return value.schemaId === schemaId && value.authority === "none" && typeof value.id === "string" && digest(value.digest);
}

function validateComplete<T>(artifact: unknown, schemaId: Parameters<typeof computeCanonicalContractDigestV1>[0]["schemaId"], fields: readonly string[], shape: (value: Record<string, unknown>) => boolean): PreparationValidationResultV1<T> {
  const cloned = canonicalCloneV1(artifact);
  if (cloned.state === "invalid" || !record(cloned.value)) return invalidResult("Artifact must be closed plain data.");
  const value = cloned.value;
  if (!exactKeys(value, ["schemaId", "authority", "id", "digest", ...fields]) || !common(value, schemaId) || !shape(value)) return invalidResult("Artifact shape is invalid.");
  const { id, digest: suppliedDigest, ...body } = value;
  const recomputedDigest = computeCanonicalContractDigestV1({ schemaId, body });
  if (recomputedDigest.state === "invalid" || suppliedDigest !== recomputedDigest.value) return invalidResult("Artifact digest does not match its body.");
  const recomputedId = computeContentIdV1({ schemaId, digest: recomputedDigest.value });
  if (recomputedId.state === "invalid" || id !== recomputedId.value) return invalidResult("Artifact ID does not match its digest.");
  return validResult(value as T);
}

const PLAN_FIELDS = ["missionId", "subjectId", "repositoryId", "planningBaseRevision", "parentPlanCommit", "parentPlanPath", "parentPlanRawSha256", "transitionKind", "boundedOutcome", "approvedRelativePaths", "publicationPaths", "approvedActionIds", "approvedEffectClasses", "approvedEffectKeys", "approvedCapabilities", "validationCommandIds", "modelId", "reasoningRuntimeId", "toolExecutorId", "exclusions"] as const;

export function validateTransitionPlanV1(input: Readonly<{ artifact: unknown }>): PreparationValidationResultV1<TransitionPlanV1> {
  const argument = canonicalArgument(input);
  if (argument.state === "invalid") return argument;
  return validateComplete(argument.value, "mission.transition-plan.v1", PLAN_FIELDS, (value) =>
    identifier(value.missionId) && identifier(value.subjectId) && repository(value.repositoryId) && revision(value.planningBaseRevision) && revision(value.parentPlanCommit) &&
    relativePath(value.parentPlanPath) && typeof value.parentPlanRawSha256 === "string" && HEX_SHA256.test(value.parentPlanRawSha256) && value.transitionKind === "fresh_authorize_wheels_up" &&
    bytesAtMost(value.boundedOutcome, 1024) && value.boundedOutcome.length > 0 &&
    sortedUniqueStrings(value.approvedRelativePaths, approvedPath, locale) && sortedUniqueStrings(value.publicationPaths, relativePath, utf16CompareV1) &&
    sortedUniqueStrings(value.approvedActionIds, identifier, locale) && sortedUniqueStrings(value.approvedEffectClasses, (item): item is string => typeof item === "string" && EFFECT_CLASSES.has(item), locale, 1, 3) &&
    sortedUniqueStrings(value.approvedEffectKeys, identifier, locale) && sortedUniqueStrings(value.approvedCapabilities, identifier, locale) && sortedUniqueStrings(value.validationCommandIds, identifier, locale) &&
    identifier(value.modelId) && identifier(value.reasoningRuntimeId) && identifier(value.toolExecutorId) && literalArray(value.exclusions, EXCLUSIONS_V1));
}

const REVIEW_FIELDS = ["repositoryId", "planningBaseRevision", "parentPlanCommit", "parentPlanPath", "parentPlanRawSha256", "transitionPlanId", "transitionPlanDigest", "verdict", "reviewerSeatId", "reviewerRuntimeId", "reviewerModelId", "reviewerExecutorId", "rawReceiptSetSha256", "attributionClass", "preparationEligibility"] as const;

export function validateParentPlanReviewEvidenceV1(input: Readonly<{ artifact: unknown }>): PreparationValidationResultV1<ParentPlanReviewEvidenceV1> {
  const argument = canonicalArgument(input);
  if (argument.state === "invalid") return argument;
  return validateComplete(argument.value, "mission.parent-plan-review-evidence.v1", REVIEW_FIELDS, (value) =>
    repository(value.repositoryId) && revision(value.planningBaseRevision) && revision(value.parentPlanCommit) && relativePath(value.parentPlanPath) &&
    typeof value.parentPlanRawSha256 === "string" && HEX_SHA256.test(value.parentPlanRawSha256) &&
    typeof value.transitionPlanId === "string" && /^transition-plan:[A-Za-z0-9_-]{43}$/.test(value.transitionPlanId) && digest(value.transitionPlanDigest) &&
    typeof value.verdict === "string" && VERDICTS.has(value.verdict) && value.reviewerSeatId === "fury" && identifier(value.reviewerRuntimeId) && identifier(value.reviewerModelId) && identifier(value.reviewerExecutorId) &&
    value.reviewerRuntimeId !== value.reviewerExecutorId && value.reviewerRuntimeId !== "fury" && value.reviewerExecutorId !== "fury" && rawHash(value.rawReceiptSetSha256) &&
    (value.attributionClass === "team_system_projection" || value.attributionClass === "synthetic_test") && value.preparationEligibility === "preparationEligible");
}

const INTENT_FIELDS = ["missionId", "subjectId", "repositoryId", "planningBaseRevision", "transitionPlanId", "transitionPlanDigest", "parentReviewEvidenceId", "parentReviewEvidenceDigest", "transitionKind", "preparationEligibility"] as const;

export function validateTransitionIntentV1(input: Readonly<{ artifact: unknown }>): PreparationValidationResultV1<TransitionIntentV1> {
  const argument = canonicalArgument(input);
  if (argument.state === "invalid") return argument;
  return validateComplete(argument.value, "mission.transition-intent.v1", INTENT_FIELDS, (value) =>
    identifier(value.missionId) && identifier(value.subjectId) && repository(value.repositoryId) && revision(value.planningBaseRevision) &&
    typeof value.transitionPlanId === "string" && /^transition-plan:[A-Za-z0-9_-]{43}$/.test(value.transitionPlanId) && digest(value.transitionPlanDigest) &&
    typeof value.parentReviewEvidenceId === "string" && /^parent-plan-review-evidence:[A-Za-z0-9_-]{43}$/.test(value.parentReviewEvidenceId) && digest(value.parentReviewEvidenceDigest) &&
    value.transitionKind === "fresh_authorize_wheels_up" && value.preparationEligibility === "preparationEligible");
}

const OBSERVATION_FIELDS = ["missionId", "subjectId", "repositoryId", "canonicalRoot", "branch", "planningBaseRevision", "baseRevision", "headRevision", "baseAncestor", "workspaceClean", "changedPaths", "symlinkPaths", "gitlinkPaths", "missionSchemaVersion", "authorizationState", "implementationAuthorityState", "finalAcceptanceState", "executionState", "implementationAuthorityCount", "runtimeBindingCount", "activeRuntimeBindingCount", "publicationAuthorizationCount", "pendingCoulsonMissionAuthorizationCount", "journalSequence", "journalSha256", "signerBindingId", "signingKeyRef", "signerBindingMatchCount", "remainingHumanGates", "preparationEligibility"] as const;

export function validateFreshAuthorizeWheelsUpObservationV1(input: Readonly<{ artifact: unknown }>): PreparationValidationResultV1<FreshAuthorizeWheelsUpObservationV1> {
  const argument = canonicalArgument(input);
  if (argument.state === "invalid") return argument;
  return validateComplete(argument.value, "mission.fresh-authorize-wheels-up-observation.v1", OBSERVATION_FIELDS, (value) => {
    if (!identifier(value.missionId) || !identifier(value.subjectId) || !repository(value.repositoryId) || !absoluteNormalizedPath(value.canonicalRoot) || !identifier(value.branch) ||
        !revision(value.planningBaseRevision) || !revision(value.baseRevision) || !revision(value.headRevision) || typeof value.baseAncestor !== "boolean" || typeof value.workspaceClean !== "boolean" ||
        !sortedUniqueStrings(value.changedPaths, relativePath, utf16CompareV1, 0) || !sortedUniqueStrings(value.symlinkPaths, relativePath, utf16CompareV1, 0) || !sortedUniqueStrings(value.gitlinkPaths, relativePath, utf16CompareV1, 0) ||
        !integer(value.missionSchemaVersion, 1, 9) || !["waiting", "authorized"].includes(value.authorizationState as string) || !["waiting", "authorized", "revoked"].includes(value.implementationAuthorityState as string) ||
        !["waiting", "accepted"].includes(value.finalAcceptanceState as string) || !["not-started", "running", "completed"].includes(value.executionState as string) ||
        !integer(value.implementationAuthorityCount, 0, 256) || !integer(value.runtimeBindingCount, 0, 256) || !integer(value.activeRuntimeBindingCount, 0, 256) ||
        !integer(value.publicationAuthorizationCount, 0, 256) || !integer(value.pendingCoulsonMissionAuthorizationCount, 0, 256) || !integer(value.journalSequence, 0, Number.MAX_SAFE_INTEGER) ||
        !rawHash(value.journalSha256) || !integer(value.signerBindingMatchCount, 0, 256) || !orderedUniqueStrings(value.remainingHumanGates, identifier, 16) || value.preparationEligibility !== "preparationEligible") return false;
    if (value.signerBindingMatchCount === 1) return identifier(value.signerBindingId) && typeof value.signingKeyRef === "string" && SIGNING_KEY.test(value.signingKeyRef);
    return value.signerBindingId === null && value.signingKeyRef === null;
  });
}

const SELECTION_FIELDS = ["missionId", "transitionIntentId", "transitionIntentDigest", "observationId", "observationDigest", "state", "transitionKind", "reasonCode"] as const;

export function validateNextTransitionSelectionV1(input: Readonly<{ artifact: unknown }>): PreparationValidationResultV1<NextTransitionSelectionV1> {
  const argument = canonicalArgument(input);
  if (argument.state === "invalid") return argument;
  return validateComplete(argument.value, "mission.next-transition-selection.v1", SELECTION_FIELDS, (value) => {
    const references = identifier(value.missionId) && typeof value.transitionIntentId === "string" && /^transition-intent:[A-Za-z0-9_-]{43}$/.test(value.transitionIntentId) && digest(value.transitionIntentDigest) &&
      typeof value.observationId === "string" && /^fresh-authorize-wheels-up-observation:[A-Za-z0-9_-]{43}$/.test(value.observationId) && digest(value.observationDigest);
    if (!references) return false;
    if (value.state === "ready") return value.transitionKind === "authorize-wheels-up" && value.reasonCode === null;
    return value.state === "blocked" && value.transitionKind === null && typeof value.reasonCode === "string" && REASONS.has(value.reasonCode);
  });
}

const CANDIDATE_FIELDS = ["missionId", "subjectId", "repositoryId", "transitionPlanId", "transitionPlanDigest", "parentReviewEvidenceId", "parentReviewEvidenceDigest", "transitionIntentId", "transitionIntentDigest", "observationId", "observationDigest", "selectionId", "selectionDigest", "preparationEligibility", "transitionKind", "seatId", "eventKinds", "publicationEffects", "exclusions", "actionInput", "decisionProjection"] as const;
const ACTION_FIELDS = ["baseRevision", "modelId", "approvedRelativePaths", "approvedActionIds", "approvedEffectClasses", "approvedEffectKeys", "approvedCapabilities", "validationCommandIds", "reasoningRuntimeId", "toolExecutorId", "publicationPaths"] as const;
const DECISION_FIELDS = ["missionId", "subjectId", "repositoryId", "branch", "baseRevision", "headRevision", "approvedRelativePaths", "publicationPaths", "approvedActionIds", "approvedEffectClasses", "approvedEffectKeys", "approvedCapabilities", "validationCommandIds", "seatId", "modelId", "reasoningRuntimeId", "toolExecutorId", "eventKinds", "publicationEffects", "exclusions", "remainingHumanGates"] as const;

function candidateProjectionShape(value: Record<string, unknown>): boolean {
  if (!record(value.actionInput) || !exactKeys(value.actionInput, ACTION_FIELDS) || !record(value.decisionProjection) || !exactKeys(value.decisionProjection, DECISION_FIELDS)) return false;
  const action = value.actionInput;
  const decision = value.decisionProjection;
  const actionShape = revision(action.baseRevision) && identifier(action.modelId) && sortedUniqueStrings(action.approvedRelativePaths, approvedPath, locale) && sortedUniqueStrings(action.approvedActionIds, identifier, locale) &&
    sortedUniqueStrings(action.approvedEffectClasses, (item): item is string => typeof item === "string" && EFFECT_CLASSES.has(item), locale, 1, 3) && sortedUniqueStrings(action.approvedEffectKeys, identifier, locale) &&
    sortedUniqueStrings(action.approvedCapabilities, identifier, locale) && sortedUniqueStrings(action.validationCommandIds, identifier, locale) && identifier(action.reasoningRuntimeId) && identifier(action.toolExecutorId) &&
    sortedUniqueStrings(action.publicationPaths, relativePath, utf16CompareV1) && identifier(decision.missionId) && identifier(decision.subjectId) && repository(decision.repositoryId) && identifier(decision.branch) &&
    revision(decision.baseRevision) && revision(decision.headRevision) && sortedUniqueStrings(decision.approvedRelativePaths, approvedPath, locale) && sortedUniqueStrings(decision.publicationPaths, relativePath, utf16CompareV1) &&
    sortedUniqueStrings(decision.approvedActionIds, identifier, locale) && sortedUniqueStrings(decision.approvedEffectClasses, (item): item is string => typeof item === "string" && EFFECT_CLASSES.has(item), locale, 1, 3) &&
    sortedUniqueStrings(decision.approvedEffectKeys, identifier, locale) && sortedUniqueStrings(decision.approvedCapabilities, identifier, locale) && sortedUniqueStrings(decision.validationCommandIds, identifier, locale) &&
    decision.seatId === "may" && identifier(decision.modelId) && identifier(decision.reasoningRuntimeId) && identifier(decision.toolExecutorId) && literalArray(decision.eventKinds, EVENT_KINDS_V1) &&
    literalArray(decision.publicationEffects, PUBLICATION_EFFECTS_V1) && literalArray(decision.exclusions, EXCLUSIONS_V1) && orderedUniqueStrings(decision.remainingHumanGates, identifier, 16);
  if (!actionShape) return false;
  return value.missionId === decision.missionId && value.subjectId === decision.subjectId && value.repositoryId === decision.repositoryId &&
    action.baseRevision === decision.baseRevision && action.modelId === decision.modelId && action.reasoningRuntimeId === decision.reasoningRuntimeId && action.toolExecutorId === decision.toolExecutorId &&
    JSON.stringify(action.approvedRelativePaths) === JSON.stringify(decision.approvedRelativePaths) && JSON.stringify(action.publicationPaths) === JSON.stringify(decision.publicationPaths) &&
    JSON.stringify(action.approvedActionIds) === JSON.stringify(decision.approvedActionIds) && JSON.stringify(action.approvedEffectClasses) === JSON.stringify(decision.approvedEffectClasses) &&
    JSON.stringify(action.approvedEffectKeys) === JSON.stringify(decision.approvedEffectKeys) && JSON.stringify(action.approvedCapabilities) === JSON.stringify(decision.approvedCapabilities) &&
    JSON.stringify(action.validationCommandIds) === JSON.stringify(decision.validationCommandIds) && JSON.stringify(value.eventKinds) === JSON.stringify(decision.eventKinds) &&
    JSON.stringify(value.publicationEffects) === JSON.stringify(decision.publicationEffects) && JSON.stringify(value.exclusions) === JSON.stringify(decision.exclusions);
}

export function validateFreshAuthorizeWheelsUpCandidateV1(input: Readonly<{ artifact: unknown }>): PreparationValidationResultV1<FreshAuthorizeWheelsUpCandidateV1> {
  const argument = canonicalArgument(input);
  if (argument.state === "invalid") return argument;
  return validateComplete(argument.value, "mission.fresh-authorize-wheels-up-candidate.v1", CANDIDATE_FIELDS, (value) =>
    identifier(value.missionId) && identifier(value.subjectId) && repository(value.repositoryId) && referenceFields(value) &&
    typeof value.selectionId === "string" && /^next-transition-selection:[A-Za-z0-9_-]{43}$/.test(value.selectionId) && digest(value.selectionDigest) &&
    value.preparationEligibility === "preparationEligible" && value.transitionKind === "authorize-wheels-up" && value.seatId === "may" &&
    literalArray(value.eventKinds, EVENT_KINDS_V1) && literalArray(value.publicationEffects, PUBLICATION_EFFECTS_V1) && literalArray(value.exclusions, EXCLUSIONS_V1) && candidateProjectionShape(value));
}

function referenceFields(value: Record<string, unknown>): boolean {
  return typeof value.transitionPlanId === "string" && /^transition-plan:[A-Za-z0-9_-]{43}$/.test(value.transitionPlanId) && digest(value.transitionPlanDigest) &&
    typeof value.parentReviewEvidenceId === "string" && /^parent-plan-review-evidence:[A-Za-z0-9_-]{43}$/.test(value.parentReviewEvidenceId) && digest(value.parentReviewEvidenceDigest) &&
    typeof value.transitionIntentId === "string" && /^transition-intent:[A-Za-z0-9_-]{43}$/.test(value.transitionIntentId) && digest(value.transitionIntentDigest) &&
    typeof value.observationId === "string" && /^fresh-authorize-wheels-up-observation:[A-Za-z0-9_-]{43}$/.test(value.observationId) && digest(value.observationDigest);
}

const RECEIPT_FIELDS = ["missionId", "repositoryId", "transitionPlanId", "transitionPlanDigest", "parentReviewEvidenceId", "parentReviewEvidenceDigest", "transitionIntentId", "transitionIntentDigest", "observationId", "observationDigest", "selectionId", "selectionDigest", "candidateId", "candidateDigest", "rawReceiptSetSha256", "preparationEligibility", "result"] as const;

export function validatePreparationReceiptV1(input: Readonly<{ artifact: unknown }>): PreparationValidationResultV1<PreparationReceiptV1> {
  const argument = canonicalArgument(input);
  if (argument.state === "invalid") return argument;
  return validateComplete(argument.value, "mission.preparation-receipt.v1", RECEIPT_FIELDS, (value) =>
    identifier(value.missionId) && repository(value.repositoryId) && referenceFields(value) && typeof value.selectionId === "string" && /^next-transition-selection:[A-Za-z0-9_-]{43}$/.test(value.selectionId) &&
    digest(value.selectionDigest) && typeof value.candidateId === "string" && /^fresh-authorize-wheels-up-candidate:[A-Za-z0-9_-]{43}$/.test(value.candidateId) && digest(value.candidateDigest) &&
    rawHash(value.rawReceiptSetSha256) && value.preparationEligibility === "preparationEligible" && value.result === "candidate_compiled");
}

function canonicalArgument(input: unknown): PreparationValidationResultV1<unknown> {
  const argument = readExactArgumentV1(input, ["artifact"]);
  if (argument.state === "invalid") return invalidResult("Validator argument is invalid.");
  return validResult(argument.value.artifact);
}

export function createSelectionV1(intent: TransitionIntentV1, observation: FreshAuthorizeWheelsUpObservationV1, reasonCode: Exclude<PreparationReasonCodeV1, "invalid_preparation_input"> | null): NextTransitionSelectionV1 {
  return makeContractV1("mission.next-transition-selection.v1", {
    schemaId: "mission.next-transition-selection.v1" as const,
    authority: "none" as const,
    missionId: intent.missionId,
    transitionIntentId: intent.id,
    transitionIntentDigest: intent.digest,
    observationId: observation.id,
    observationDigest: observation.digest,
    state: reasonCode === null ? "ready" as const : "blocked" as const,
    transitionKind: reasonCode === null ? "authorize-wheels-up" as const : null,
    reasonCode,
  }) as NextTransitionSelectionV1;
}

export function createCandidateV1(plan: TransitionPlanV1, review: ParentPlanReviewEvidenceV1, intent: TransitionIntentV1, observation: FreshAuthorizeWheelsUpObservationV1, selection: NextTransitionSelectionV1): FreshAuthorizeWheelsUpCandidateV1 {
  const actionInput = {
    baseRevision: plan.planningBaseRevision,
    modelId: plan.modelId,
    approvedRelativePaths: [...plan.approvedRelativePaths],
    approvedActionIds: [...plan.approvedActionIds],
    approvedEffectClasses: [...plan.approvedEffectClasses],
    approvedEffectKeys: [...plan.approvedEffectKeys],
    approvedCapabilities: [...plan.approvedCapabilities],
    validationCommandIds: [...plan.validationCommandIds],
    reasoningRuntimeId: plan.reasoningRuntimeId,
    toolExecutorId: plan.toolExecutorId,
    publicationPaths: [...plan.publicationPaths],
  };
  const decisionProjection = {
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    repositoryId: plan.repositoryId,
    branch: observation.branch,
    baseRevision: observation.baseRevision,
    headRevision: observation.headRevision,
    approvedRelativePaths: [...plan.approvedRelativePaths],
    publicationPaths: [...plan.publicationPaths],
    approvedActionIds: [...plan.approvedActionIds],
    approvedEffectClasses: [...plan.approvedEffectClasses],
    approvedEffectKeys: [...plan.approvedEffectKeys],
    approvedCapabilities: [...plan.approvedCapabilities],
    validationCommandIds: [...plan.validationCommandIds],
    seatId: "may" as const,
    modelId: plan.modelId,
    reasoningRuntimeId: plan.reasoningRuntimeId,
    toolExecutorId: plan.toolExecutorId,
    eventKinds: [...EVENT_KINDS_V1],
    publicationEffects: [...PUBLICATION_EFFECTS_V1],
    exclusions: [...EXCLUSIONS_V1],
    remainingHumanGates: [...observation.remainingHumanGates],
  };
  return makeContractV1("mission.fresh-authorize-wheels-up-candidate.v1", {
    schemaId: "mission.fresh-authorize-wheels-up-candidate.v1" as const,
    authority: "none" as const,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    repositoryId: plan.repositoryId,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    parentReviewEvidenceId: review.id,
    parentReviewEvidenceDigest: review.digest,
    transitionIntentId: intent.id,
    transitionIntentDigest: intent.digest,
    observationId: observation.id,
    observationDigest: observation.digest,
    selectionId: selection.id,
    selectionDigest: selection.digest,
    preparationEligibility: "preparationEligible" as const,
    transitionKind: "authorize-wheels-up" as const,
    seatId: "may" as const,
    eventKinds: [...EVENT_KINDS_V1],
    publicationEffects: [...PUBLICATION_EFFECTS_V1],
    exclusions: [...EXCLUSIONS_V1],
    actionInput,
    decisionProjection,
  }) as unknown as FreshAuthorizeWheelsUpCandidateV1;
}

export function createReceiptV1(plan: TransitionPlanV1, review: ParentPlanReviewEvidenceV1, intent: TransitionIntentV1, observation: FreshAuthorizeWheelsUpObservationV1, selection: NextTransitionSelectionV1, candidate: FreshAuthorizeWheelsUpCandidateV1): PreparationReceiptV1 {
  return makeContractV1("mission.preparation-receipt.v1", {
    schemaId: "mission.preparation-receipt.v1" as const,
    authority: "none" as const,
    missionId: plan.missionId,
    repositoryId: plan.repositoryId,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    parentReviewEvidenceId: review.id,
    parentReviewEvidenceDigest: review.digest,
    transitionIntentId: intent.id,
    transitionIntentDigest: intent.digest,
    observationId: observation.id,
    observationDigest: observation.digest,
    selectionId: selection.id,
    selectionDigest: selection.digest,
    candidateId: candidate.id,
    candidateDigest: candidate.digest,
    rawReceiptSetSha256: review.rawReceiptSetSha256,
    preparationEligibility: "preparationEligible" as const,
    result: "candidate_compiled" as const,
  }) as PreparationReceiptV1;
}
