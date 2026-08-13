import { createHash, createPublicKey, verify } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  FEATURE_OPERATION_CONTRACT_VERSION,
  compareFeatureOperationAmendmentV1,
  validateFeatureOperationDerivedCandidateV1,
  validateFeatureOperationPlanV1,
  validateFeatureOperationReplayContextV1,
  verifySignedFeatureOperationAuthorityV1,
  validateFeatureOperationReplayContextV2,
  validateFeatureOperationAuthorityV2,
  validateFeatureOperationPlanV2,
  validateFeatureOperationDerivedCandidateV2,
  type FeatureOperationAuthorityV1,
  type FeatureOperationAuthorityV2,
  type FeatureOperationDerivedCandidateV1,
  type FeatureOperationDerivedCandidateV2,
  type FeatureOperationReplayContextV1,
  type FeatureOperationReplayContextV2,
  type FeatureOperationPlanV2,
  type SignedFeatureOperationAuthorityV1,
  type SignedFeatureOperationAuthorityV2,
} from "./feature-operation-v1.mjs";
import { computeEd25519SigningKeyRef, validateTrustedBindingRegistry, type TrustedHumanBinding } from "./mission-v2.mjs";
import {
  computeImplementationAuthorityDigest,
  validateImplementationAuthorityV1,
  validateSchema9RuntimeBindingV1,
  type ImplementationAuthorityV1,
  type Schema9RuntimeBindingV1,
} from "./implementation-authority-v1.mjs";

export const FEATURE_INTEGRATION_SCHEMA_VERSION = 1 as const;
export const FEATURE_INTEGRATION_CONTRACT_VERSION = "feature.integration.v1" as const;
export const FEATURE_INTEGRATION_JOURNAL_DOMAIN = "shield.feature-integration.journal.v1" as const;
export const FEATURE_INTEGRATION_SCHEMA_VERSION_V2 = 2 as const;
export const FEATURE_INTEGRATION_CONTRACT_VERSION_V2 = "feature.integration.v2" as const;
export const FEATURE_INTEGRATION_JOURNAL_DOMAIN_V2 = "shield.feature-integration.journal.v2" as const;
export const FEATURE_INTEGRATION_ENTRY_DOMAIN_V2 = "shield.feature-integration.entry.v2" as const;
export const FEATURE_OBSERVATION_BINDINGS_DOMAIN_V2 = "shield.feature-integration.observation-bindings.v2" as const;
export const FEATURE_HUMAN_BINDINGS_DOMAIN_V2 = "shield.feature-integration.human-bindings.v2" as const;
export const FEATURE_INTEGRATION_REQUEST_CORE_DOMAIN_V2 = "shield.feature-integration.request-core.v2" as const;
export const FEATURE_INTEGRATION_REQUEST_DOMAIN_V2 = "shield.feature-integration.request.v2" as const;
export const FEATURE_TRANSITION_CHALLENGE_DOMAIN_V2 = "shield.feature-integration.challenge.v2:transition" as const;
export const FEATURE_TRANSITION_OBSERVATION_DOMAIN_V2 = "shield.feature-integration.observation.v2:transition" as const;
export const FEATURE_CUMULATIVE_AUTHORITY_DOMAIN_V2 = "shield.feature-integration.cumulative-authority.v2" as const;
export const FEATURE_CUMULATIVE_AUTHORITY_SIGNATURE_DOMAIN_V2 = "shield.feature-integration.cumulative-authority-signature.v2" as const;
export const FEATURE_CUMULATIVE_CANDIDATE_DOMAIN_V2 = "shield.feature-integration.cumulative-candidate.v2" as const;
export const FEATURE_CUMULATIVE_RECEIPT_OBSERVATION_DOMAIN_V2 = "shield.feature-integration.observation.v2:cumulative_receipt" as const;
export const FEATURE_CUMULATIVE_VALIDATION_SIGNATURE_DOMAIN = "shield.feature-integration.cumulative-authority.signature.v1" as const;
export const FEATURE_INTEGRATION_ENTRY_KINDS = Object.freeze([
  "operation_genesis_accepted", "authority_successor_accepted", "effect_prepared",
  "effect_not_applied", "effect_uncertain", "feature_branch_creation_accepted",
  "feature_workspace_accepted", "child_initiation_accepted", "child_implementation_accepted",
  "child_publication_accepted", "child_evidence_accepted", "integration_accepted",
  "rollback_workspace_accepted", "rollback_accepted", "cumulative_validation_accepted",
  "cumulative_validation_failed", "operation_paused", "operation_resumed",
  "operation_cancelled", "operation_split", "operation_completed", "operation_superseded",
  "final_gate_evidence_accepted",
] as const);
export const FEATURE_INTEGRATION_REPLAY_REASONS = Object.freeze([
  "JOURNAL_INVALID", "ENTRY_INVALID", "DIGEST_LINEAGE_INVALID", "SEQUENCE_INVALID",
  "GENESIS_INVALID", "AUTHORITY_SUCCESSOR_INVALID", "EFFECT_LIFECYCLE_INVALID",
  "STAGE_ORDER_INVALID", "HEAD_TRANSITION_INVALID", "EVIDENCE_INVALID",
  "CUMULATIVE_VALIDATION_INVALID", "LIFECYCLE_INVALID",
] as const);
export const FEATURE_INTEGRATION_ENTRY_KINDS_V2 = Object.freeze([
  ...FEATURE_INTEGRATION_ENTRY_KINDS,
  "effect_challenge_refreshed",
  "operation_expired",
] as const);
export const FEATURE_INTEGRATION_REPLAY_REASONS_V2 = Object.freeze([
  "JOURNAL_INVALID", "ENTRY_INVALID", "DIGEST_LINEAGE_INVALID", "SEQUENCE_INVALID",
  "GENESIS_INVALID", "AUTHORITY_SUCCESSOR_INVALID", "EFFECT_LIFECYCLE_INVALID",
  "STAGE_ORDER_INVALID", "HEAD_TRANSITION_INVALID", "EVIDENCE_INVALID",
  "CUMULATIVE_VALIDATION_INVALID", "LIFECYCLE_INVALID", "OBSERVATION_AUTHORITY_INVALID",
  "OBSERVATION_CHALLENGE_INVALID", "FINAL_GATE_EVIDENCE_INVALID", "FINAL_GATE_NOT_READY",
  "FINAL_GATE_DUPLICATE", "FINAL_GATE_INAPPLICABLE", "FINAL_GATE_EXPIRED",
  "POST_GATE_ENTRY_INVALID", "RECOVERY_ENTRY_INVALID",
] as const);

export type FeatureIntegrationEntryKindV1 = (typeof FEATURE_INTEGRATION_ENTRY_KINDS)[number];
export type FeatureIntegrationReplayReasonV1 = (typeof FEATURE_INTEGRATION_REPLAY_REASONS)[number];
export type FeatureIntegrationNextStageV1 =
  | "feature_branch_creation" | "feature_workspace" | "child_initiation"
  | "implementation_handoff" | "child_publication" | "child_evidence" | "integration"
  | "rollback_mission_handoff" | "rollback" | "cumulative_validation"
  | "lifecycle_only" | "completed" | "blocked";

export interface FeatureIntegrationIdentityV1 {
  seatId: string;
  reasoningRuntimeId: string;
  modelId: string;
  toolExecutorId: string;
}

export interface FeatureIntegrationEffectReferenceV1 {
  preparationEntryDigest: string;
  candidateDigest: string;
  effectKey: string;
  requestDigest: string;
}

interface FeatureIntegrationWorkspacePullRequestObservationV1 {
  pullRequestId: string;
  url: string;
  draft: boolean;
  headBranch: string;
  headRevision: string;
  baseBranch: string;
}

interface FeatureIntegrationWorkspaceEffectObservationV1 {
  schemaVersion: 1;
  contractVersion: "feature.integration.v1";
  observationKind: "workspace_effect";
  preparationEntryDigest: string;
  candidateDigest: string;
  effectKey: string;
  requestDigest: string;
  repositoryId: string;
  derivationKind: "feature_branch_create" | "feature_workspace_draft_pr_create" | "child_initiation" | "child_draft_pr_create";
  challengeId: string;
  targetRef: string;
  targetBaseBranch: string | null;
  expectedHeadRevision: string;
  expectedTreeDigest: string | null;
  status: "applied" | "not_applied" | "uncertain";
  observedHeadRevision: string | null;
  observedTreeDigest: string | null;
  pullRequests: readonly FeatureIntegrationWorkspacePullRequestObservationV1[];
  observationProvenance: string;
  observedAt: { value: string; provenance: "hostTrusted" };
  observationDigest: string;
}

export interface FeatureIntegrationReceiptV1 extends FeatureIntegrationIdentityV1 {
  schemaVersion: 1;
  contractVersion: "feature.integration.v1";
  operationId: string;
  repositoryId: string;
  planDigest: string;
  authorityDigest: string;
  childId: string;
  childMissionId: string;
  effectKey: string;
  requestDigest: string;
  attemptNumber: number;
  integrationMethod: string;
  reconciliationState: "applied" | "reconciled_applied";
  priorHeadRevision: string;
  priorTreeDigest: string;
  childBranch: string;
  childHeadRevision: string;
  childTreeDigest: string;
  childPullRequestId: string;
  targetFeatureBranch: string;
  evidenceDigests: readonly string[];
  resultingHeadRevision: string;
  resultingTreeDigest: string;
  observationProvenance: string;
  observedAt: { value: string; provenance: "hostTrusted" };
  receiptDigest: string;
}

export interface FeatureRollbackReceiptV1 extends FeatureIntegrationIdentityV1 {
  schemaVersion: 1;
  contractVersion: "feature.integration.v1";
  operationId: string;
  repositoryId: string;
  planDigest: string;
  authorityDigest: string;
  childId: string;
  effectKey: string;
  attemptNumber: number;
  reconciliationState: "applied" | "reconciled_applied";
  revertedIntegrationReceiptDigest: string;
  rollbackWorkspaceReceiptDigest: string;
  priorHeadRevision: string;
  priorTreeDigest: string;
  resultingHeadRevision: string;
  resultingTreeDigest: string;
  observationProvenance: string;
  observedAt: { value: string; provenance: "hostTrusted" };
  receiptDigest: string;
}

export interface FeatureCumulativeValidationAuthorityV1 {
  schemaVersion: 1;
  authorityKind: "feature_cumulative_validation";
  missionId: string;
  operationId: string;
  repositoryId: string;
  planDigest: string;
  featureAuthorityDigest: string;
  terminalHeadRevision: string;
  terminalTreeDigest: string;
  transitionReceiptDigest: string;
  requestDigest: string;
  commandIds: readonly string[];
  targetIds: readonly string[];
  validationIds: readonly string[];
  effectKey: string;
  maxAttempts: 1;
  maxRetries: 0;
  activeAuthorityJournalSequence: number;
  activeAuthorityOperationSequence: number;
  issuedAt: string;
  expiresAt: string;
  humanPrincipalId: string;
  humanBindingId: string;
  signingKeyRef: string;
  authorityDigest: string;
}

export interface SignedFeatureCumulativeValidationAuthorityV1 {
  payload: FeatureCumulativeValidationAuthorityV1;
  signatureBase64: string;
}

export interface FeatureCumulativeValidationRequestV1 {
  schemaVersion: 1;
  operationId: string;
  repositoryId: string;
  terminalHeadRevision: string;
  terminalTreeDigest: string;
  transitionReceiptDigest: string;
  commands: readonly FeatureCumulativeValidationCommandV1[];
  commandIds: readonly string[];
  targetIds: readonly string[];
  validationIds: readonly string[];
  requestDigest: string;
}

export interface FeatureCumulativeValidationCommandV1 {
  commandId: string;
  executable: string;
  args: readonly string[];
  targetIds: readonly string[];
}

export interface FeatureCumulativeValidationCandidateV1 {
  schemaVersion: 1;
  operationId: string;
  authorityDigest: string;
  requestDigest: string;
  effectKey: string;
  terminalHeadRevision: string;
  terminalTreeDigest: string;
  transitionReceiptDigest: string;
  candidateDigest: string;
}

export interface FeatureCumulativeValidationReceiptV1 extends FeatureIntegrationIdentityV1 {
  schemaVersion: 1;
  contractVersion: "feature.integration.v1";
  operationId: string;
  repositoryId: string;
  planDigest: string;
  featureAuthorityDigest: string;
  cumulativeAuthorityDigest: string;
  effectKey: string;
  requestDigest: string;
  transitionReceiptDigest: string;
  terminalHeadRevision: string;
  terminalTreeDigest: string;
  commandIds: readonly string[];
  targetIds: readonly string[];
  validationIds: readonly string[];
  mackEvidenceDigest: string;
  checkObservationDigests: readonly string[];
  outcome: "passed" | "failed";
  reconciliationState: "applied" | "reconciled_applied";
  observationProvenance: string;
  observedAt: { value: string; provenance: "hostTrusted" };
  receiptDigest: string;
}

export interface FeatureOperationJournalEntryV1 {
  schemaVersion: 1;
  contractVersion: "feature.integration.v1";
  operationId: string;
  entrySequence: number;
  entryKind: FeatureIntegrationEntryKindV1;
  previousEntryDigest: string | null;
  payload: Readonly<Record<string, unknown>>;
  entryDigest: string;
}

export interface FeatureOperationJournalV1 {
  schemaVersion: 1;
  contractVersion: "feature.integration.v1";
  operationId: string;
  genesisDigest: string;
  latestAcceptedEntryDigest: string;
  entries: readonly FeatureOperationJournalEntryV1[];
  journalDigest: string;
}

export interface FeatureIntegrationReplayProjectionV1 {
  replayContext: FeatureOperationReplayContextV1;
  nextEntrySequence: number;
  activeAuthorityJournalSequence: number;
  activeAuthorityOperationSequence: number;
  headTransitionOperationSequence: number;
  terminalHeadRevision: string;
  terminalTreeDigest: string;
  pendingEffect: FeatureIntegrationEffectReferenceV1 | null;
  uncertainEffect: boolean;
  consumedCumulativeValidationEffectKeys: readonly string[];
  cumulativeValidationAttempts: number;
  cumulativeValidation: "pending" | "passed" | "failed";
  nextStage: FeatureIntegrationNextStageV1;
  latestObservedAt: { value: string; provenance: "hostTrusted" };
}

export type FeatureIntegrationReplayResultV1 =
  | { state: "valid"; value: Readonly<FeatureIntegrationReplayProjectionV1> }
  | { state: "invalid"; reason: FeatureIntegrationReplayReasonV1; entrySequence: number | null };

type ContractResult<T> = { state: "valid"; value: Readonly<T> } | { state: "invalid"; code: string; errors: string[] };

function plain(value: unknown): value is Record<string, unknown> {
  try { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && !utilTypes.isProxy(value); }
  catch { return false; }
}
function ownData(record: Record<string, unknown>, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, name);
  return descriptor && "value" in descriptor && !descriptor.get && !descriptor.set ? descriptor.value : undefined;
}
function safeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.trim() === value; }
function digestValue(value: unknown): value is string { return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value); }
function timestamp(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function clone<T>(value: T): T { return Object.freeze(structuredClone(value)); }
function invalid<T>(code: string, message: string): ContractResult<T> { return { state: "invalid", code, errors: [message] }; }
function valid<T>(value: T): ContractResult<T> { return { state: "valid", value: clone(value) }; }

function compareUtf16(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function canonicalFeatureIntegrationJsonV1(value: unknown): string {
  const visit = (input: unknown): string => {
    if (input === null || typeof input === "boolean" || typeof input === "string") return JSON.stringify(input);
    if (typeof input === "number" && Number.isSafeInteger(input)) return JSON.stringify(input);
    if (Array.isArray(input)) {
      if (utilTypes.isProxy(input) || Object.getPrototypeOf(input) !== Array.prototype || Reflect.ownKeys(input).length !== input.length + 1) throw new TypeError("Canonical feature integration arrays must be dense plain data.");
      return `[${input.map(visit).join(",")}]`;
    }
    if (!plain(input)) throw new TypeError("Canonical feature integration values must be plain data.");
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError("Symbol keys are not canonical.");
    const names = (keys as string[]).sort(compareUtf16);
    return `{${names.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || descriptor.value === undefined) throw new TypeError("Canonical feature integration records require enumerable data properties.");
      return `${JSON.stringify(name)}:${visit(descriptor.value)}`;
    }).join(",")}}`;
  };
  return visit(value);
}

function digest(kind: string, value: unknown): string {
  const hash = createHash("sha256");
  hash.update(FEATURE_INTEGRATION_JOURNAL_DOMAIN, "utf8"); hash.update(Buffer.from([0]));
  hash.update(kind, "utf8"); hash.update(Buffer.from([0]));
  hash.update(canonicalFeatureIntegrationJsonV1(value), "utf8");
  return `sha256:${hash.digest("hex")}`;
}

function withoutOwnDigest(value: unknown, name: string): Record<string, unknown> {
  if (!plain(value)) throw new TypeError("Expected a plain record.");
  const copy = structuredClone(value); delete copy[name]; return copy;
}

export function computeFeatureIntegrationEntryDigestV1(input: unknown): string {
  if (!plain(input) || !FEATURE_INTEGRATION_ENTRY_KINDS.includes(ownData(input, "entryKind") as FeatureIntegrationEntryKindV1)) throw new TypeError("Feature integration entry is invalid.");
  return digest(String(ownData(input, "entryKind")), withoutOwnDigest(input, "entryDigest"));
}
export function computeFeatureIntegrationJournalDigestV1(input: unknown): string { return digest("journal", withoutOwnDigest(input, "journalDigest")); }
export function computeFeatureIntegrationReceiptDigestV1(input: unknown): string { return digest("integration_receipt", withoutOwnDigest(input, "receiptDigest")); }
export function computeFeatureRollbackReceiptDigestV1(input: unknown): string { return digest("rollback_receipt", withoutOwnDigest(input, "receiptDigest")); }
export function computeFeatureIntegrationWorkspaceEffectObservationDigestV1(input: unknown): string { return digest("workspace_effect_observation", withoutOwnDigest(input, "observationDigest")); }
export function computeFeatureCumulativeValidationRequestDigestV1(input: unknown): string { return digest("cumulative_validation_request", withoutOwnDigest(input, "requestDigest")); }
export function computeFeatureCumulativeValidationAuthorityDigestV1(input: unknown): string { return digest("cumulative_validation_authority", withoutOwnDigest(input, "authorityDigest")); }
export function computeFeatureCumulativeValidationCandidateDigestV1(input: unknown): string { return digest("cumulative_validation_candidate", withoutOwnDigest(input, "candidateDigest")); }
export function computeFeatureCumulativeValidationReceiptDigestV1(input: unknown): string { return digest("cumulative_validation_receipt", withoutOwnDigest(input, "receiptDigest")); }

function entryShape(input: unknown, ownDigest = true): FeatureOperationJournalEntryV1 | null {
  if (!plain(input)) return null;
  const fields = ["schemaVersion", "contractVersion", "operationId", "entrySequence", "entryKind", "previousEntryDigest", "payload", "entryDigest"];
  if (Reflect.ownKeys(input).length !== fields.length || fields.some((field) => !Object.hasOwn(input, field))) return null;
  const entry = input as unknown as FeatureOperationJournalEntryV1;
  if (entry.schemaVersion !== 1 || entry.contractVersion !== FEATURE_INTEGRATION_CONTRACT_VERSION || !text(entry.operationId) || !safeInteger(entry.entrySequence) ||
      !FEATURE_INTEGRATION_ENTRY_KINDS.includes(entry.entryKind) || !(entry.previousEntryDigest === null || digestValue(entry.previousEntryDigest)) || !plain(entry.payload) || !digestValue(entry.entryDigest)) return null;
  if (ownDigest && computeFeatureIntegrationEntryDigestV1(entry) !== entry.entryDigest) return null;
  return structuredClone(entry);
}

export function createFeatureIntegrationEntryV1(input: Omit<FeatureOperationJournalEntryV1, "schemaVersion" | "contractVersion" | "entryDigest">): FeatureOperationJournalEntryV1 {
  const entry = { schemaVersion: 1 as const, contractVersion: FEATURE_INTEGRATION_CONTRACT_VERSION, ...structuredClone(input), entryDigest: `sha256:${"0".repeat(64)}` };
  entry.entryDigest = computeFeatureIntegrationEntryDigestV1(entry);
  const checked = entryShape(entry);
  if (!checked) throw new TypeError("Feature integration entry input is invalid.");
  return clone(checked);
}

export function createFeatureOperationJournalV1(entriesInput: readonly FeatureOperationJournalEntryV1[]): FeatureOperationJournalV1 {
  if (!Array.isArray(entriesInput) || entriesInput.length === 0) throw new TypeError("Feature integration journal requires genesis.");
  const entries = entriesInput.map((entry) => entryShape(entry));
  if (entries.some((entry) => entry === null)) throw new TypeError("Feature integration journal entry is invalid.");
  const checked = entries as FeatureOperationJournalEntryV1[];
  for (let index = 0; index < checked.length; index += 1) {
    if (checked[index].entrySequence !== index || checked[index].operationId !== checked[0].operationId || checked[index].previousEntryDigest !== (index === 0 ? null : checked[index - 1].entryDigest)) throw new TypeError("Feature integration journal lineage is invalid.");
  }
  const journal = { schemaVersion: 1 as const, contractVersion: FEATURE_INTEGRATION_CONTRACT_VERSION, operationId: checked[0].operationId,
    genesisDigest: checked[0].entryDigest, latestAcceptedEntryDigest: checked.at(-1)!.entryDigest, entries: checked, journalDigest: `sha256:${"0".repeat(64)}` };
  journal.journalDigest = computeFeatureIntegrationJournalDigestV1(journal);
  return clone(journal);
}

export function validateFeatureOperationJournalV1(input: unknown): ContractResult<FeatureOperationJournalV1> {
  try {
    if (!plain(input)) return invalid("journal_invalid", "Feature integration journal is invalid.");
    const journal = createFeatureOperationJournalV1(ownData(input, "entries") as FeatureOperationJournalEntryV1[]);
    return canonicalFeatureIntegrationJsonV1(journal) === canonicalFeatureIntegrationJsonV1(input) ? valid(journal) : invalid("journal_invalid", "Feature integration journal is not canonical.");
  } catch { return invalid("journal_invalid", "Feature integration journal is invalid."); }
}

function stringArray(value: unknown, sorted = false): string[] | null {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1 || value.some((item) => !text(item)) || new Set(value).size !== value.length) return null;
  const copy = [...value] as string[];
  if (sorted && copy.some((item, index) => index > 0 && compareUtf16(copy[index - 1], item) >= 0)) return null;
  return copy;
}

function exactRecord(input: unknown, fields: readonly string[]): input is Record<string, unknown> {
  return plain(input) && Reflect.ownKeys(input).length === fields.length && fields.every((field) => Object.hasOwn(input, field));
}

const WORKSPACE_DERIVATIONS = ["feature_branch_create", "feature_workspace_draft_pr_create", "child_initiation", "child_draft_pr_create"] as const;
const WORKSPACE_OBSERVATION_FIELDS = ["schemaVersion", "contractVersion", "observationKind", "preparationEntryDigest", "candidateDigest", "effectKey", "requestDigest", "repositoryId", "derivationKind", "challengeId", "targetRef", "targetBaseBranch", "expectedHeadRevision", "expectedTreeDigest", "status", "observedHeadRevision", "observedTreeDigest", "pullRequests", "observationProvenance", "observedAt", "observationDigest"] as const;

function workspaceEffectObservation(input: unknown): FeatureIntegrationWorkspaceEffectObservationV1 | null {
  try {
    if (!exactRecord(input, WORKSPACE_OBSERVATION_FIELDS)) return null;
    const value = input as unknown as FeatureIntegrationWorkspaceEffectObservationV1;
    if (value.schemaVersion !== 1 || value.contractVersion !== FEATURE_INTEGRATION_CONTRACT_VERSION || value.observationKind !== "workspace_effect" ||
        ![value.preparationEntryDigest, value.candidateDigest, value.requestDigest, value.observationDigest].every(digestValue) ||
        ![value.effectKey, value.repositoryId, value.challengeId, value.targetRef, value.expectedHeadRevision, value.observationProvenance].every(text) ||
        !WORKSPACE_DERIVATIONS.includes(value.derivationKind) || !(value.targetBaseBranch === null || text(value.targetBaseBranch)) ||
        !(value.expectedTreeDigest === null || digestValue(value.expectedTreeDigest)) || !["applied", "not_applied", "uncertain"].includes(value.status) ||
        !(value.observedHeadRevision === null || /^[0-9a-f]{40}$/.test(value.observedHeadRevision)) ||
        !(value.observedTreeDigest === null || digestValue(value.observedTreeDigest)) ||
        (value.status !== "uncertain" && (value.observedHeadRevision === null) !== (value.observedTreeDigest === null)) ||
        !plain(value.observedAt) || value.observedAt.provenance !== "hostTrusted" || !timestamp(value.observedAt.value) ||
        value.observationProvenance !== `github:workspace:${value.challengeId}` || !Array.isArray(value.pullRequests) || utilTypes.isProxy(value.pullRequests) || Object.getPrototypeOf(value.pullRequests) !== Array.prototype || Reflect.ownKeys(value.pullRequests).length !== value.pullRequests.length + 1) return null;
    let previousPullRequestId: string | null = null;
    const pullRequests: FeatureIntegrationWorkspacePullRequestObservationV1[] = [];
    for (const item of value.pullRequests) {
      const fields = ["pullRequestId", "url", "draft", "headBranch", "headRevision", "baseBranch"];
      if (!exactRecord(item, fields)) return null;
      const pull = item as Record<string, unknown>;
      if (![pull.pullRequestId, pull.url, pull.headBranch, pull.baseBranch].every(text) || typeof pull.draft !== "boolean" || typeof pull.headRevision !== "string" || !/^[0-9a-f]{40}$/.test(pull.headRevision) || (previousPullRequestId !== null && compareUtf16(previousPullRequestId, pull.pullRequestId as string) >= 0)) return null;
      previousPullRequestId = pull.pullRequestId as string; pullRequests.push(structuredClone(pull) as unknown as FeatureIntegrationWorkspacePullRequestObservationV1);
    }
    if (computeFeatureIntegrationWorkspaceEffectObservationDigestV1(value) !== value.observationDigest) return null;
    return { ...structuredClone(value), pullRequests };
  } catch { return null; }
}
function receiptIdentity(value: FeatureIntegrationIdentityV1): boolean {
  return [value.seatId, value.reasoningRuntimeId, value.modelId, value.toolExecutorId].every(text) && new Set([value.seatId, value.reasoningRuntimeId, value.modelId, value.toolExecutorId]).size === 4;
}

export function validateFeatureIntegrationReceiptV1(input: unknown): ContractResult<FeatureIntegrationReceiptV1> {
  try {
    const fields = ["schemaVersion", "contractVersion", "operationId", "repositoryId", "planDigest", "authorityDigest", "childId", "childMissionId", "effectKey", "requestDigest", "attemptNumber", "integrationMethod", "reconciliationState", "priorHeadRevision", "priorTreeDigest", "childBranch", "childHeadRevision", "childTreeDigest", "childPullRequestId", "targetFeatureBranch", "evidenceDigests", "resultingHeadRevision", "resultingTreeDigest", "observationProvenance", "observedAt", "seatId", "reasoningRuntimeId", "modelId", "toolExecutorId", "receiptDigest"];
    if (!exactRecord(input, fields)) return invalid("integration_receipt_invalid", "Integration receipt is not closed.");
    const value = input as unknown as FeatureIntegrationReceiptV1;
    const evidence = stringArray(value.evidenceDigests, true);
    if (value.schemaVersion !== 1 || value.contractVersion !== FEATURE_INTEGRATION_CONTRACT_VERSION || ![value.operationId, value.repositoryId, value.childId, value.childMissionId, value.effectKey, value.childBranch, value.childPullRequestId, value.targetFeatureBranch, value.observationProvenance].every(text) || value.childId !== value.childMissionId || !safeInteger(value.attemptNumber) || value.attemptNumber < 1 || !["merge_commit", "rebase_merge", "squash"].includes(value.integrationMethod) || !["applied", "reconciled_applied"].includes(value.reconciliationState) || ![value.planDigest, value.authorityDigest, value.requestDigest, value.priorTreeDigest, value.childTreeDigest, value.resultingTreeDigest, value.receiptDigest].every(digestValue) || ![value.priorHeadRevision, value.childHeadRevision, value.resultingHeadRevision].every((item) => typeof item === "string" && /^[0-9a-f]{40}$/.test(item)) || !evidence || evidence.length < 2 || !plain(value.observedAt) || value.observedAt.provenance !== "hostTrusted" || !timestamp(value.observedAt.value) || !receiptIdentity(value) || computeFeatureIntegrationReceiptDigestV1(value) !== value.receiptDigest) return invalid("integration_receipt_invalid", "Integration receipt validation failed.");
    return valid(value);
  } catch { return invalid("integration_receipt_invalid", "Integration receipt validation failed."); }
}

export function validateFeatureRollbackReceiptV1(input: unknown): ContractResult<FeatureRollbackReceiptV1> {
  try {
    const fields = ["schemaVersion", "contractVersion", "operationId", "repositoryId", "planDigest", "authorityDigest", "childId", "effectKey", "attemptNumber", "reconciliationState", "revertedIntegrationReceiptDigest", "rollbackWorkspaceReceiptDigest", "priorHeadRevision", "priorTreeDigest", "resultingHeadRevision", "resultingTreeDigest", "observationProvenance", "observedAt", "seatId", "reasoningRuntimeId", "modelId", "toolExecutorId", "receiptDigest"];
    if (!exactRecord(input, fields)) return invalid("rollback_receipt_invalid", "Rollback receipt is not closed.");
    const value = input as unknown as FeatureRollbackReceiptV1;
    if (value.schemaVersion !== 1 || value.contractVersion !== FEATURE_INTEGRATION_CONTRACT_VERSION || ![value.operationId, value.repositoryId, value.childId, value.effectKey, value.observationProvenance].every(text) || !safeInteger(value.attemptNumber) || value.attemptNumber < 1 || !["applied", "reconciled_applied"].includes(value.reconciliationState) || ![value.planDigest, value.authorityDigest, value.revertedIntegrationReceiptDigest, value.rollbackWorkspaceReceiptDigest, value.priorTreeDigest, value.resultingTreeDigest, value.receiptDigest].every(digestValue) || ![value.priorHeadRevision, value.resultingHeadRevision].every((item) => typeof item === "string" && /^[0-9a-f]{40}$/.test(item)) || !plain(value.observedAt) || value.observedAt.provenance !== "hostTrusted" || !timestamp(value.observedAt.value) || !receiptIdentity(value) || computeFeatureRollbackReceiptDigestV1(value) !== value.receiptDigest) return invalid("rollback_receipt_invalid", "Rollback receipt validation failed.");
    return valid(value);
  } catch { return invalid("rollback_receipt_invalid", "Rollback receipt validation failed."); }
}

export function validateFeatureCumulativeValidationReceiptV1(input: unknown): ContractResult<FeatureCumulativeValidationReceiptV1> {
  try {
    const fields = ["schemaVersion", "contractVersion", "operationId", "repositoryId", "planDigest", "featureAuthorityDigest", "cumulativeAuthorityDigest", "effectKey", "requestDigest", "transitionReceiptDigest", "terminalHeadRevision", "terminalTreeDigest", "commandIds", "targetIds", "validationIds", "mackEvidenceDigest", "checkObservationDigests", "outcome", "reconciliationState", "observationProvenance", "observedAt", "seatId", "reasoningRuntimeId", "modelId", "toolExecutorId", "receiptDigest"];
    if (!exactRecord(input, fields)) return invalid("cumulative_receipt_invalid", "Cumulative validation receipt is not closed.");
    const value = input as unknown as FeatureCumulativeValidationReceiptV1;
    const commands = stringArray(value.commandIds), targets = stringArray(value.targetIds, true), validations = stringArray(value.validationIds, true), checks = stringArray(value.checkObservationDigests, true);
    if (value.schemaVersion !== 1 || value.contractVersion !== FEATURE_INTEGRATION_CONTRACT_VERSION || ![value.operationId, value.repositoryId, value.effectKey, value.observationProvenance].every(text) || ![value.planDigest, value.featureAuthorityDigest, value.cumulativeAuthorityDigest, value.requestDigest, value.transitionReceiptDigest, value.terminalTreeDigest, value.mackEvidenceDigest, value.receiptDigest].every(digestValue) || !/^[0-9a-f]{40}$/.test(value.terminalHeadRevision) || !commands || !targets || !validations || !checks || checks.some((item) => !digestValue(item)) || !["passed", "failed"].includes(value.outcome) || !["applied", "reconciled_applied"].includes(value.reconciliationState) || !plain(value.observedAt) || value.observedAt.provenance !== "hostTrusted" || !timestamp(value.observedAt.value) || !receiptIdentity(value) || computeFeatureCumulativeValidationReceiptDigestV1(value) !== value.receiptDigest) return invalid("cumulative_receipt_invalid", "Cumulative validation receipt validation failed.");
    return valid(value);
  } catch { return invalid("cumulative_receipt_invalid", "Cumulative validation receipt validation failed."); }
}

function cumulativeRequest(input: unknown, ownDigest = true): FeatureCumulativeValidationRequestV1 | null {
  if (!plain(input)) return null;
  const fields = ["schemaVersion", "operationId", "repositoryId", "terminalHeadRevision", "terminalTreeDigest", "transitionReceiptDigest", "commands", "commandIds", "targetIds", "validationIds", "requestDigest"];
  if (Reflect.ownKeys(input).length !== fields.length || fields.some((field) => !Object.hasOwn(input, field))) return null;
  const value = input as unknown as FeatureCumulativeValidationRequestV1;
  const commandIds = stringArray(value.commandIds), targets = stringArray(value.targetIds, true), validations = stringArray(value.validationIds, true);
  if (value.schemaVersion !== 1 || !text(value.operationId) || !text(value.repositoryId) || !text(value.terminalHeadRevision) || !digestValue(value.terminalTreeDigest) || !digestValue(value.transitionReceiptDigest) || !commandIds || !targets || !validations || !Array.isArray(value.commands) || value.commands.length !== commandIds.length || !digestValue(value.requestDigest)) return null;
  const commands: FeatureCumulativeValidationCommandV1[] = [];
  for (let index = 0; index < value.commands.length; index += 1) {
    const command = value.commands[index];
    if (!exactRecord(command, ["commandId", "executable", "args", "targetIds"]) || command.commandId !== commandIds[index] || !text(command.executable)) return null;
    const args = stringArray(command.args), commandTargets = stringArray(command.targetIds, true);
    if (!args || !commandTargets || commandTargets.some((target) => !targets.includes(target))) return null;
    commands.push({ commandId: command.commandId as string, executable: command.executable as string, args, targetIds: commandTargets });
  }
  if (ownDigest && computeFeatureCumulativeValidationRequestDigestV1(value) !== value.requestDigest) return null;
  return structuredClone({ ...value, commands });
}
function cumulativeAuthority(input: unknown, ownDigest = true): FeatureCumulativeValidationAuthorityV1 | null {
  if (!plain(input)) return null;
  const fields = ["schemaVersion", "authorityKind", "missionId", "operationId", "repositoryId", "planDigest", "featureAuthorityDigest", "terminalHeadRevision", "terminalTreeDigest", "transitionReceiptDigest", "requestDigest", "commandIds", "targetIds", "validationIds", "effectKey", "maxAttempts", "maxRetries", "activeAuthorityJournalSequence", "activeAuthorityOperationSequence", "issuedAt", "expiresAt", "humanPrincipalId", "humanBindingId", "signingKeyRef", "authorityDigest"];
  if (Reflect.ownKeys(input).length !== fields.length || fields.some((field) => !Object.hasOwn(input, field))) return null;
  const value = input as unknown as FeatureCumulativeValidationAuthorityV1;
  if (value.schemaVersion !== 1 || value.authorityKind !== "feature_cumulative_validation" || !text(value.missionId) || !text(value.operationId) || !text(value.repositoryId) ||
      !digestValue(value.planDigest) || !digestValue(value.featureAuthorityDigest) || !text(value.terminalHeadRevision) || !digestValue(value.terminalTreeDigest) || !digestValue(value.transitionReceiptDigest) ||
      !digestValue(value.requestDigest) || !stringArray(value.commandIds) || !stringArray(value.targetIds, true) || !stringArray(value.validationIds, true) || !text(value.effectKey) || value.maxAttempts !== 1 || value.maxRetries !== 0 ||
      !safeInteger(value.activeAuthorityJournalSequence) || !safeInteger(value.activeAuthorityOperationSequence) || !timestamp(value.issuedAt) || !timestamp(value.expiresAt) || Date.parse(value.issuedAt) >= Date.parse(value.expiresAt) ||
      !text(value.humanPrincipalId) || !text(value.humanBindingId) || !text(value.signingKeyRef) || !digestValue(value.authorityDigest)) return null;
  if (ownDigest && computeFeatureCumulativeValidationAuthorityDigestV1(value) !== value.authorityDigest) return null;
  return structuredClone(value);
}
export function validateFeatureCumulativeValidationRequestV1(input: unknown): ContractResult<FeatureCumulativeValidationRequestV1> { const value = cumulativeRequest(input); return value ? valid(value) : invalid("request_invalid", "Cumulative validation request is invalid."); }
export function validateFeatureCumulativeValidationAuthorityV1(input: unknown): ContractResult<FeatureCumulativeValidationAuthorityV1> { const value = cumulativeAuthority(input); return value ? valid(value) : invalid("authority_invalid", "Cumulative validation authority is invalid."); }
export function verifySignedFeatureCumulativeValidationAuthorityV1(input: unknown, trustedBindings: readonly TrustedHumanBinding[]): ContractResult<FeatureCumulativeValidationAuthorityV1> {
  try {
    if (!exactRecord(input, ["payload", "signatureBase64"]) || typeof input.signatureBase64 !== "string" || Buffer.from(input.signatureBase64, "base64").toString("base64") !== input.signatureBase64 || !Array.isArray(trustedBindings)) return invalid("signed_authority_invalid", "Signed cumulative authority is invalid.");
    const authority = cumulativeAuthority(input.payload); if (!authority) return invalid("authority_invalid", "Cumulative authority payload is invalid.");
    const bindings = trustedBindings.filter((binding) => binding.bindingId === authority.humanBindingId && binding.humanPrincipalId === authority.humanPrincipalId && binding.seatId === "coulson" && binding.signingKeyRef === authority.signingKeyRef);
    if (bindings.length !== 1 || computeEd25519SigningKeyRef(bindings[0].publicKeySpkiBase64) !== authority.signingKeyRef) return invalid("binding_invalid", "Exactly one trusted Coulson binding is required.");
    const signature = Buffer.from(input.signatureBase64, "base64");
    const key = createPublicKey({ key: Buffer.from(bindings[0].publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    const bytes = Buffer.concat([Buffer.from(FEATURE_CUMULATIVE_VALIDATION_SIGNATURE_DOMAIN, "ascii"), Buffer.from([0]), Buffer.from(canonicalFeatureIntegrationJsonV1(authority), "utf8")]);
    return signature.length === 64 && verify(null, bytes, key, signature) ? valid(authority) : invalid("signature_invalid", "Cumulative authority signature is invalid.");
  } catch { return invalid("signed_authority_invalid", "Signed cumulative authority is invalid."); }
}

function candidate(input: unknown, ownDigest = true): FeatureCumulativeValidationCandidateV1 | null {
  if (!plain(input)) return null;
  const fields = ["schemaVersion", "operationId", "authorityDigest", "requestDigest", "effectKey", "terminalHeadRevision", "terminalTreeDigest", "transitionReceiptDigest", "candidateDigest"];
  if (Reflect.ownKeys(input).length !== fields.length || fields.some((field) => !Object.hasOwn(input, field))) return null;
  const value = input as unknown as FeatureCumulativeValidationCandidateV1;
  if (value.schemaVersion !== 1 || !text(value.operationId) || !digestValue(value.authorityDigest) || !digestValue(value.requestDigest) || !text(value.effectKey) || !text(value.terminalHeadRevision) || !digestValue(value.terminalTreeDigest) || !digestValue(value.transitionReceiptDigest) || !digestValue(value.candidateDigest)) return null;
  if (ownDigest && computeFeatureCumulativeValidationCandidateDigestV1(value) !== value.candidateDigest) return null;
  return structuredClone(value);
}
export function validateFeatureCumulativeValidationCandidateV1(input: unknown): ContractResult<FeatureCumulativeValidationCandidateV1> { const value = candidate(input); return value ? valid(value) : invalid("candidate_invalid", "Cumulative validation candidate is invalid."); }
export type FeatureCumulativeValidationEvaluationV1 = { state: "eligible"; candidate: Readonly<FeatureCumulativeValidationCandidateV1> } | { state: "blocked"; reason: string };
export function evaluateFeatureCumulativeValidationCandidateV1(input: { replay: FeatureIntegrationReplayProjectionV1; signedAuthority: SignedFeatureCumulativeValidationAuthorityV1; request: FeatureCumulativeValidationRequestV1; candidate: FeatureCumulativeValidationCandidateV1; trustedBindings: readonly TrustedHumanBinding[]; observedAt: string }): FeatureCumulativeValidationEvaluationV1 {
  const replay = input.replay, verified = verifySignedFeatureCumulativeValidationAuthorityV1(input.signedAuthority, input.trustedBindings), request = cumulativeRequest(input.request), checkedCandidate = candidate(input.candidate);
  if (verified.state !== "valid" || !request || !checkedCandidate) return { state: "blocked", reason: "INVALID_INPUT" };
  const authority = verified.value;
  const transition = replay?.replayContext?.transitions?.at(-1);
  if (!timestamp(input.observedAt) || input.observedAt !== replay.latestObservedAt.value) return { state: "blocked", reason: "REPLAY_MISMATCH" };
  if (Date.parse(input.observedAt) >= Date.parse(authority.expiresAt)) return { state: "blocked", reason: "AUTHORITY_EXPIRED" };
  if (replay.nextStage !== "cumulative_validation" || replay.pendingEffect || !transition || transition.kind === "genesis" ||
      replay.replayContext.operationId !== authority.operationId || replay.replayContext.repositoryId !== authority.repositoryId || replay.replayContext.activePlanDigest !== authority.planDigest || replay.replayContext.verifiedAuthorityDigest !== authority.featureAuthorityDigest ||
      replay.terminalHeadRevision !== authority.terminalHeadRevision || replay.terminalTreeDigest !== authority.terminalTreeDigest || transition.receiptDigest !== authority.transitionReceiptDigest || replay.activeAuthorityJournalSequence !== authority.activeAuthorityJournalSequence || replay.activeAuthorityOperationSequence !== authority.activeAuthorityOperationSequence) return { state: "blocked", reason: "REPLAY_MISMATCH" };
  if (authority.requestDigest !== request.requestDigest || request.operationId !== authority.operationId || request.repositoryId !== authority.repositoryId || request.terminalHeadRevision !== authority.terminalHeadRevision || request.terminalTreeDigest !== authority.terminalTreeDigest || request.transitionReceiptDigest !== authority.transitionReceiptDigest || canonicalFeatureIntegrationJsonV1(authority.commandIds) !== canonicalFeatureIntegrationJsonV1(request.commandIds) || canonicalFeatureIntegrationJsonV1(authority.targetIds) !== canonicalFeatureIntegrationJsonV1(request.targetIds) || canonicalFeatureIntegrationJsonV1(authority.validationIds) !== canonicalFeatureIntegrationJsonV1(request.validationIds)) return { state: "blocked", reason: "REQUEST_MISMATCH" };
  if (replay.consumedCumulativeValidationEffectKeys.includes(authority.effectKey) || replay.cumulativeValidationAttempts >= authority.maxAttempts) return { state: "blocked", reason: "BOUNDS_EXHAUSTED" };
  if (checkedCandidate.operationId !== authority.operationId || checkedCandidate.authorityDigest !== authority.authorityDigest || checkedCandidate.requestDigest !== request.requestDigest || checkedCandidate.effectKey !== authority.effectKey || checkedCandidate.terminalHeadRevision !== authority.terminalHeadRevision || checkedCandidate.terminalTreeDigest !== authority.terminalTreeDigest || checkedCandidate.transitionReceiptDigest !== authority.transitionReceiptDigest) return { state: "blocked", reason: "CANDIDATE_MISMATCH" };
  return { state: "eligible", candidate: clone(checkedCandidate) };
}

function replayInvalid(reason: FeatureIntegrationReplayReasonV1, entrySequence: number | null): FeatureIntegrationReplayResultV1 { return { state: "invalid", reason, entrySequence }; }

const ENTRY_PAYLOAD_FIELDS: Readonly<Record<FeatureIntegrationEntryKindV1, readonly string[]>> = Object.freeze({
  operation_genesis_accepted: ["replayContext", "signedAuthority", "trustedBindings"],
  authority_successor_accepted: ["plan", "signedAuthority"],
  effect_prepared: ["effectClass", "candidate", "candidateDigest", "effectKey", "requestDigest", "expectedHeadRevision", "expectedTreeDigest"],
  effect_not_applied: ["preparationEntryDigest", "observationProvenance", "observedAt", "effectObservation"],
  effect_uncertain: ["preparationEntryDigest", "observationProvenance", "observedAt", "effectObservation"],
  feature_branch_creation_accepted: ["preparationEntryDigest", "headRevision", "treeDigest", "observedAt", "observationProvenance", "effectObservation"],
  feature_workspace_accepted: ["preparationEntryDigest", "pullRequestId", "sourceBranch", "targetBranch", "headRevision", "draft", "observedAt", "observationProvenance", "effectObservation"],
  child_initiation_accepted: ["preparationEntryDigest", "childId", "branch", "baseHeadRevision", "baseTreeDigest", "observedAt", "observationProvenance", "effectObservation"],
  child_implementation_accepted: ["childId", "sourceMissionId", "effectKey", "sourceAuthorityDigest", "sourceJournalDigest", "completionReceiptDigest", "headRevision", "treeDigest"],
  child_publication_accepted: ["preparationEntryDigest", "childId", "pullRequestId", "sourceBranch", "targetBranch", "headRevision", "draft", "observedAt", "observationProvenance", "effectObservation"],
  child_evidence_accepted: ["childId", "headRevision", "evidenceIds", "evidenceDigests", "evidenceRecords"],
  integration_accepted: ["preparationEntryDigest", "receipt"],
  rollback_workspace_accepted: ["childId", "sourceMissionId", "completionReceiptDigest", "sourceAuthorityDigest", "sourceJournalDigest", "rollbackBranch", "pullRequestId", "pullRequestHeadRevision", "targetBranch", "restoredTreeDigest", "sourceEffectKeys", "evidenceDigests"],
  rollback_accepted: ["preparationEntryDigest", "receipt"],
  cumulative_validation_accepted: ["preparationEntryDigest", "receipt"],
  cumulative_validation_failed: ["preparationEntryDigest", "receipt"],
  operation_paused: ["observedAt", "reason"], operation_resumed: ["observedAt", "reason"], operation_cancelled: ["observedAt", "reason"], operation_split: ["observedAt", "successorOperationId", "successorPlanDigest", "successorAuthorityDigest"], operation_completed: ["observedAt"], operation_superseded: ["observedAt", "successorOperationId", "successorPlanDigest", "successorAuthorityDigest"],
  final_gate_evidence_accepted: ["gateId", "sourceRecordDigest", "terminalHeadRevision", "terminalTreeDigest", "observedAt"],
});

function workspaceObservationMatchesPending(
  observation: FeatureIntegrationWorkspaceEffectObservationV1 | null,
  pending: FeatureIntegrationEffectReferenceV1 | null,
  candidateValue: FeatureOperationDerivedCandidateV1 | FeatureCumulativeValidationCandidateV1 | null,
  expectedFeatureHead: string | null,
  expectedFeatureTree: string | null,
): observation is FeatureIntegrationWorkspaceEffectObservationV1 {
  if (!observation || !pending || !candidateValue || !("derivationKind" in candidateValue) || !WORKSPACE_DERIVATIONS.includes(candidateValue.derivationKind as typeof WORKSPACE_DERIVATIONS[number]) || expectedFeatureHead === null || expectedFeatureTree === null) return false;
  const candidate = candidateValue as FeatureOperationDerivedCandidateV1;
  let targetRef: string, targetBaseBranch: string | null, expectedHead: string, expectedTree: string | null, branchEffect: boolean;
  switch (candidate.derivationKind) {
    case "feature_branch_create": targetRef = `refs/heads/${candidate.targetBranch}`; targetBaseBranch = null; expectedHead = candidate.sourceRevision; expectedTree = expectedFeatureTree; branchEffect = true; break;
    case "feature_workspace_draft_pr_create": targetRef = `refs/heads/${candidate.sourceBranch}`; targetBaseBranch = candidate.targetBranch; expectedHead = expectedFeatureHead; expectedTree = expectedFeatureTree; branchEffect = false; break;
    case "child_initiation": targetRef = `refs/heads/${candidate.childBranch}`; targetBaseBranch = null; expectedHead = candidate.sourceFeatureHead; expectedTree = expectedFeatureTree; branchEffect = true; break;
    case "child_draft_pr_create": targetRef = `refs/heads/${candidate.childBranch}`; targetBaseBranch = candidate.targetBranch; expectedHead = candidate.childHeadRevision; expectedTree = null; branchEffect = false; break;
    default: return false;
  }
  if (observation.preparationEntryDigest !== pending.preparationEntryDigest || observation.candidateDigest !== pending.candidateDigest || observation.effectKey !== pending.effectKey || observation.requestDigest !== pending.requestDigest ||
      observation.repositoryId !== candidate.repositoryId || observation.derivationKind !== candidate.derivationKind || observation.targetRef !== targetRef || observation.targetBaseBranch !== targetBaseBranch ||
      observation.expectedHeadRevision !== expectedHead || observation.expectedTreeDigest !== expectedTree) return false;
  if (branchEffect) {
    if (observation.pullRequests.length !== 0) return false;
    if (observation.status === "applied" && (observation.observedHeadRevision !== expectedHead || observation.observedTreeDigest !== expectedTree)) return false;
    if (observation.status === "not_applied" && (observation.observedHeadRevision !== null || observation.observedTreeDigest !== null)) return false;
    return true;
  }
  if (observation.observedHeadRevision !== null && observation.observedHeadRevision !== expectedHead) return observation.status === "uncertain";
  if (observation.status !== "uncertain" && (observation.observedHeadRevision !== expectedHead || observation.observedTreeDigest === null || (expectedTree !== null && observation.observedTreeDigest !== expectedTree))) return false;
  if (observation.pullRequests.some((pull) => pull.headBranch !== targetRef.slice("refs/heads/".length) || pull.baseBranch !== targetBaseBranch)) return false;
  if (observation.status === "not_applied") return observation.pullRequests.length === 0;
  if (observation.status === "applied") {
    const pull = observation.pullRequests[0];
    return observation.pullRequests.length === 1 && pull.draft === true && pull.headRevision === expectedHead;
  }
  return true;
}

function verifyJournalFeatureAuthority(
  input: unknown,
  trustedBindings: readonly TrustedHumanBinding[],
  expectedOperationId: string,
  expectedOperationSequence: number,
  expectedJournalSequence: number,
  expectedMissionId?: string,
): FeatureOperationAuthorityV1 | null {
  const payload = plain(input) ? ownData(input, "payload") : null;
  const missionId = expectedMissionId ?? (plain(payload) && text(ownData(payload, "missionId")) ? ownData(payload, "missionId") as string : "");
  const verified = verifySignedFeatureOperationAuthorityV1(input, {
    expectedMissionId: missionId,
    expectedOperationId,
    expectedOperationSequence,
    expectedJournalSequence,
    trustedBindings,
  });
  return verified.state === "verified" ? structuredClone(verified.value) : null;
}

function authorityExactlyActivatesReplay(
  authority: FeatureOperationAuthorityV1,
  replay: FeatureOperationReplayContextV1,
): boolean {
  const lineage = replay.acceptedPlanLineage;
  return authority.repositoryId === replay.repositoryId &&
    authority.operationId === replay.operationId &&
    authority.planDigest === replay.activePlanDigest &&
    canonicalFeatureIntegrationJsonV1(authority.plan) === canonicalFeatureIntegrationJsonV1(replay.activePlan) &&
    authority.authorityId === replay.verifiedAuthorityId &&
    authority.authorityDigest === replay.verifiedAuthorityDigest &&
    authority.operationSequence === replay.acceptedAuthorityOperationSequence &&
    authority.journalSequence === replay.currentJournalSequence &&
    replay.activePlan.planSequence === 0 && replay.acceptedAmendmentDigests.length === 0 &&
    lineage.length === 1 && lineage[0].planSequence === 0 && lineage[0].planDigest === authority.planDigest &&
    lineage[0].predecessorPlanDigest === null && lineage[0].authorityDigest === authority.authorityDigest && lineage[0].active === true &&
    Date.parse(replay.observedAt.value) >= Date.parse(authority.issuedAt) && Date.parse(replay.observedAt.value) < Date.parse(authority.expiresAt);
}

export function replayFeatureOperationJournalV1(input: unknown): FeatureIntegrationReplayResultV1 {
  const journal = validateFeatureOperationJournalV1(input); if (journal.state !== "valid") return replayInvalid("JOURNAL_INVALID", null);
  const entries = journal.value.entries; const genesis = entries[0];
  if (genesis.entryKind !== "operation_genesis_accepted") return replayInvalid("GENESIS_INVALID", 0);
  if (!exactRecord(genesis.payload, ENTRY_PAYLOAD_FIELDS.operation_genesis_accepted) || !Array.isArray(genesis.payload.trustedBindings)) return replayInvalid("GENESIS_INVALID", 0);
  const seed = genesis.payload.replayContext; const checkedSeed = validateFeatureOperationReplayContextV1(seed);
  if (checkedSeed.state !== "valid" || checkedSeed.value.activePlan.baseBranch !== "main" || checkedSeed.value.operationId !== journal.value.operationId) return replayInvalid("GENESIS_INVALID", 0);
  const trustedBindings = structuredClone(genesis.payload.trustedBindings) as TrustedHumanBinding[];
  const genesisAuthority = verifyJournalFeatureAuthority(genesis.payload.signedAuthority, trustedBindings, journal.value.operationId, 0, 0);
  if (!genesisAuthority || !authorityExactlyActivatesReplay(genesisAuthority, checkedSeed.value)) return replayInvalid("GENESIS_INVALID", 0);
  let context = structuredClone(checkedSeed.value); let activeJournal = context.currentJournalSequence; let activeOperation = context.acceptedAuthorityOperationSequence;
  const activeMissionId = genesisAuthority.missionId;
  let activeAuthorityIssuedAt = genesisAuthority.issuedAt;
  let headSequence = context.transitions.at(-1)?.operationSequence ?? 0; let terminalHead = context.transitions.at(-1)?.resultingHeadRevision ?? context.activePlan.baseRevision;
  let terminalTree = context.transitions.at(-1)?.resultingTreeDigest ?? context.activePlan.baseTreeDigest; let pending: FeatureIntegrationEffectReferenceV1 | null = null;
  let pendingCandidate: FeatureOperationDerivedCandidateV1 | FeatureCumulativeValidationCandidateV1 | null = null;
  let pendingExpectedHead: string | null = null; let pendingExpectedTree: string | null = null;
  let uncertain = false; const cumulativeKeys: string[] = []; let cumulativeAttempts = 0; let cumulative: "pending" | "passed" | "failed" = context.acceptedIntegrations.length > 0 || context.acceptedRollbacks.length > 0 ? "pending" : "passed";
  let featureBranchExists = false, featureWorkspaceExists = false; const initiated = new Set<string>(), implemented = new Set<string>(), published = new Set<string>(), evidenced = new Set<string>();
  const rollbackWorkspaces = new Map<string, string>();
  const finalGates = new Map<string, string>();
  for (let index = 1; index < entries.length; index += 1) {
    const entry = entries[index], payload = entry.payload;
    if (Reflect.ownKeys(payload).some((key) => typeof key !== "string" || !ENTRY_PAYLOAD_FIELDS[entry.entryKind].includes(key))) return replayInvalid("ENTRY_INVALID", index);
    if (entry.entryKind === "authority_successor_accepted") {
      if (pending || !exactRecord(payload, ENTRY_PAYLOAD_FIELDS.authority_successor_accepted)) return replayInvalid("AUTHORITY_SUCCESSOR_INVALID", index);
      const plan = validateFeatureOperationPlanV1(payload.plan);
      const authority = verifyJournalFeatureAuthority(payload.signedAuthority, trustedBindings, context.operationId, activeOperation + 1, activeJournal + 1, activeMissionId);
      const amendment = plan.state === "valid" ? compareFeatureOperationAmendmentV1(context.activePlan, plan.value) : null;
      if (plan.state !== "valid" || !authority || amendment?.state !== "valid" || amendment.classification === "identical" ||
          authority.repositoryId !== context.repositoryId || authority.planDigest !== plan.value.planDigest ||
          canonicalFeatureIntegrationJsonV1(authority.plan) !== canonicalFeatureIntegrationJsonV1(plan.value) ||
          Date.parse(authority.issuedAt) < Date.parse(activeAuthorityIssuedAt) || Date.parse(context.observedAt.value) < Date.parse(authority.issuedAt) ||
          Date.parse(context.observedAt.value) >= Date.parse(authority.expiresAt)) return replayInvalid("AUTHORITY_SUCCESSOR_INVALID", index);
      context = { ...context, activePlan: plan.value, activePlanDigest: plan.value.planDigest, verifiedAuthorityId: authority.authorityId, verifiedAuthorityDigest: authority.authorityDigest, currentJournalSequence: authority.journalSequence, acceptedAuthorityOperationSequence: authority.operationSequence, acceptedPlanLineage: [...context.acceptedPlanLineage.map((item) => ({ ...item, active: false })), { planSequence: plan.value.planSequence, planDigest: plan.value.planDigest, predecessorPlanDigest: plan.value.predecessorPlanDigest, authorityDigest: authority.authorityDigest, active: true }], acceptedAmendmentDigests: [...context.acceptedAmendmentDigests, plan.value.planDigest] };
      activeJournal = authority.journalSequence; activeOperation = authority.operationSequence; activeAuthorityIssuedAt = authority.issuedAt;
    } else if (entry.entryKind === "effect_prepared") {
      if (pending || !digestValue(payload.candidateDigest) || !text(payload.effectKey) || !digestValue(payload.requestDigest)) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
      const isCumulative = payload.effectClass === "cumulative_validation";
      const latestTransition = context.transitions.at(-1);
      const terminalRollbackRequiresValidation = ["cancelled", "expired", "superseded"].includes(context.lifecycle.state) && latestTransition?.kind === "rollback" && latestTransition.operationSequence > context.lifecycle.atOperationSequence && cumulative === "pending";
      if (["cancelled", "expired", "superseded"].includes(context.lifecycle.state) && (!isCumulative || !terminalRollbackRequiresValidation)) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
      const checkedDerived = isCumulative ? null : validateFeatureOperationDerivedCandidateV1(payload.candidate);
      const checkedCumulative = isCumulative ? candidate(payload.candidate) : null;
      if ((!isCumulative && checkedDerived?.state !== "valid") || (isCumulative && !checkedCumulative)) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
      pending = { preparationEntryDigest: entry.entryDigest, candidateDigest: payload.candidateDigest as string, effectKey: payload.effectKey as string, requestDigest: payload.requestDigest as string }; uncertain = false;
      pendingCandidate = (checkedCumulative ?? (checkedDerived?.state === "valid" ? checkedDerived.value : null)) as FeatureOperationDerivedCandidateV1 | FeatureCumulativeValidationCandidateV1 | null;
      if (pendingCandidate?.candidateDigest !== pending.candidateDigest || pendingCandidate?.effectKey !== pending.effectKey) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
      if (payload.expectedHeadRevision !== terminalHead || payload.expectedTreeDigest !== terminalTree || pendingCandidate.operationId !== context.operationId) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
      pendingExpectedHead = payload.expectedHeadRevision as string; pendingExpectedTree = payload.expectedTreeDigest as string;
      if (isCumulative) {
        const cumulativeCandidate = pendingCandidate as FeatureCumulativeValidationCandidateV1;
        const transitionReceiptDigest = context.transitions.at(-1)?.receiptDigest;
        if (pending.requestDigest !== cumulativeCandidate.requestDigest || cumulativeCandidate.terminalHeadRevision !== terminalHead || cumulativeCandidate.terminalTreeDigest !== terminalTree || cumulativeCandidate.transitionReceiptDigest !== transitionReceiptDigest) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
      } else {
        const derivedCandidate = pendingCandidate as FeatureOperationDerivedCandidateV1;
        if (payload.effectClass !== "feature_operation" || derivedCandidate.repositoryId !== context.repositoryId || derivedCandidate.planDigest !== context.activePlanDigest || derivedCandidate.authorityDigest !== context.verifiedAuthorityDigest) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
      }
      if (isCumulative) { if (cumulativeKeys.includes(pending.effectKey)) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index); cumulativeKeys.push(pending.effectKey); cumulativeKeys.sort(compareUtf16); cumulativeAttempts += 1; }
      else {
        if (context.consumedEffectKeys.includes(pending.effectKey)) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
        const derived = pendingCandidate as FeatureOperationDerivedCandidateV1;
        const childCounters = context.childCounters.map((counter) => ({ ...counter }));
        const operationCounters = { ...context.operationCounters };
        const childId = "childId" in derived ? derived.childId : null;
        const counter = childCounters.find((item) => item.childId === childId);
        if (derived.derivationKind === "feature_branch_create") operationCounters.featureBranchCreateAttempts += 1;
        else if (derived.derivationKind === "feature_workspace_draft_pr_create") operationCounters.featureWorkspaceDraftPrAttempts += 1;
        else if (!counter) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
        else {
          const field = ({ child_initiation: "initiationAttempts", child_implementation: "implementationAttempts", child_draft_pr_create: "publicationAttempts", child_merge_to_feature: "integrationAttempts", child_revert_on_feature: "rollbackAttempts" } as const)[derived.derivationKind];
          counter[field] += 1;
          if (["child_initiation", "child_implementation", "child_draft_pr_create"].includes(derived.derivationKind)) operationCounters.totalChildAttempts += 1;
          if (derived.derivationKind === "child_merge_to_feature") operationCounters.totalIntegrationAttempts += 1;
          if (derived.derivationKind === "child_revert_on_feature") { operationCounters.totalRollbackAttempts += 1; context = { ...context, lifecycle: { state: "rollback_pending", atOperationSequence: headSequence } }; }
        }
        context = { ...context, consumedEffectKeys: [...context.consumedEffectKeys, pending.effectKey].sort(compareUtf16), childCounters, operationCounters, activeLeases: context.activeLeases.filter((lease) => lease.effectKey !== pending!.effectKey) };
      }
    } else if (entry.entryKind === "effect_uncertain") {
      const isWorkspace = pendingCandidate && "derivationKind" in pendingCandidate && WORKSPACE_DERIVATIONS.includes(pendingCandidate.derivationKind as typeof WORKSPACE_DERIVATIONS[number]);
      const observation = isWorkspace ? workspaceEffectObservation(payload.effectObservation) : null;
      if (!pending || payload.preparationEntryDigest !== pending.preparationEntryDigest || (isWorkspace && (!workspaceObservationMatchesPending(observation, pending, pendingCandidate, pendingExpectedHead, pendingExpectedTree) || observation.status !== "uncertain" || payload.observationProvenance !== observation.observationProvenance || canonicalFeatureIntegrationJsonV1(payload.observedAt) !== canonicalFeatureIntegrationJsonV1(observation.observedAt)))) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index); uncertain = true;
    } else if (entry.entryKind === "effect_not_applied") {
      const isWorkspace = pendingCandidate && "derivationKind" in pendingCandidate && WORKSPACE_DERIVATIONS.includes(pendingCandidate.derivationKind as typeof WORKSPACE_DERIVATIONS[number]);
      const observation = isWorkspace ? workspaceEffectObservation(payload.effectObservation) : null;
      if (!pending || payload.preparationEntryDigest !== pending.preparationEntryDigest || !text(payload.observationProvenance) || (isWorkspace && (!workspaceObservationMatchesPending(observation, pending, pendingCandidate, pendingExpectedHead, pendingExpectedTree) || observation.status !== "not_applied" || payload.observationProvenance !== observation.observationProvenance || canonicalFeatureIntegrationJsonV1(payload.observedAt) !== canonicalFeatureIntegrationJsonV1(observation.observedAt)))) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
      if ((pendingCandidate as FeatureOperationDerivedCandidateV1 | null)?.derivationKind === "child_revert_on_feature" && context.lifecycle.state === "rollback_pending") context = { ...context, lifecycle: { state: "active", atOperationSequence: headSequence } };
      pending = null; pendingCandidate = null; pendingExpectedHead = null; pendingExpectedTree = null; uncertain = false;
    } else if (entry.entryKind === "feature_branch_creation_accepted") {
      const observation = workspaceEffectObservation(payload.effectObservation);
      if (!pending || (pendingCandidate as FeatureOperationDerivedCandidateV1 | null)?.derivationKind !== "feature_branch_create" || !workspaceObservationMatchesPending(observation, pending, pendingCandidate, pendingExpectedHead, pendingExpectedTree) || observation.status !== "applied" || payload.preparationEntryDigest !== pending.preparationEntryDigest || payload.headRevision !== observation.observedHeadRevision || payload.treeDigest !== observation.observedTreeDigest || payload.observationProvenance !== observation.observationProvenance || canonicalFeatureIntegrationJsonV1(payload.observedAt) !== canonicalFeatureIntegrationJsonV1(observation.observedAt) || payload.headRevision !== terminalHead || payload.treeDigest !== terminalTree) return replayInvalid("STAGE_ORDER_INVALID", index); featureBranchExists = true; pending = null; pendingCandidate = null; pendingExpectedHead = null; pendingExpectedTree = null; uncertain = false;
    } else if (entry.entryKind === "feature_workspace_accepted") {
      const observation = workspaceEffectObservation(payload.effectObservation), pull = observation?.pullRequests[0];
      if (!pending || (pendingCandidate as FeatureOperationDerivedCandidateV1 | null)?.derivationKind !== "feature_workspace_draft_pr_create" || !workspaceObservationMatchesPending(observation, pending, pendingCandidate, pendingExpectedHead, pendingExpectedTree) || observation.status !== "applied" || !pull || !featureBranchExists || payload.preparationEntryDigest !== pending.preparationEntryDigest || payload.pullRequestId !== pull.pullRequestId || payload.headRevision !== pull.headRevision || payload.observationProvenance !== observation.observationProvenance || canonicalFeatureIntegrationJsonV1(payload.observedAt) !== canonicalFeatureIntegrationJsonV1(observation.observedAt) || payload.targetBranch !== "main" || payload.sourceBranch !== context.activePlan.featureBranch || payload.draft !== true) return replayInvalid("STAGE_ORDER_INVALID", index); featureWorkspaceExists = true; pending = null; pendingCandidate = null; pendingExpectedHead = null; pendingExpectedTree = null; uncertain = false;
    } else if (entry.entryKind === "child_initiation_accepted") {
      const observation = workspaceEffectObservation(payload.effectObservation);
      if (!pending || (pendingCandidate as FeatureOperationDerivedCandidateV1 | null)?.derivationKind !== "child_initiation" || !workspaceObservationMatchesPending(observation, pending, pendingCandidate, pendingExpectedHead, pendingExpectedTree) || observation.status !== "applied" || payload.baseHeadRevision !== observation.observedHeadRevision || payload.baseTreeDigest !== observation.observedTreeDigest || payload.observationProvenance !== observation.observationProvenance || canonicalFeatureIntegrationJsonV1(payload.observedAt) !== canonicalFeatureIntegrationJsonV1(observation.observedAt) || !featureWorkspaceExists || !text(payload.childId) || payload.preparationEntryDigest !== pending.preparationEntryDigest || payload.baseHeadRevision !== terminalHead || payload.baseTreeDigest !== terminalTree || initiated.has(payload.childId as string)) return replayInvalid("STAGE_ORDER_INVALID", index); initiated.add(payload.childId as string); pending = null; pendingCandidate = null; pendingExpectedHead = null; pendingExpectedTree = null; uncertain = false;
    } else if (entry.entryKind === "child_implementation_accepted") {
      const childId = payload.childId as string, effectKey = payload.effectKey as string;
      const child = context.activePlan.children.find((item) => item.childId === childId), counter = context.childCounters.find((item) => item.childId === childId);
      if (!text(childId) || !initiated.has(childId) || implemented.has(childId) || !text(payload.sourceMissionId) || payload.sourceMissionId !== childId || !text(effectKey) || !child?.allowedEffectKeys.includes(effectKey) || !effectKey.startsWith("effect:child_implementation:") || context.consumedEffectKeys.includes(effectKey) || !counter) return replayInvalid("EVIDENCE_INVALID", index);
      implemented.add(childId);
      const childCounters = context.childCounters.map((item) => item.childId === childId ? { ...item, implementationAttempts: item.implementationAttempts + 1 } : { ...item });
      context = { ...context, consumedEffectKeys: [...context.consumedEffectKeys, effectKey].sort(compareUtf16), childCounters, operationCounters: { ...context.operationCounters, totalChildAttempts: context.operationCounters.totalChildAttempts + 1 } };
    } else if (entry.entryKind === "child_publication_accepted") {
      const observation = workspaceEffectObservation(payload.effectObservation), pull = observation?.pullRequests[0];
      if (!pending || (pendingCandidate as FeatureOperationDerivedCandidateV1 | null)?.derivationKind !== "child_draft_pr_create" || !workspaceObservationMatchesPending(observation, pending, pendingCandidate, pendingExpectedHead, pendingExpectedTree) || observation.status !== "applied" || !pull || payload.pullRequestId !== pull.pullRequestId || payload.headRevision !== pull.headRevision || payload.observationProvenance !== observation.observationProvenance || canonicalFeatureIntegrationJsonV1(payload.observedAt) !== canonicalFeatureIntegrationJsonV1(observation.observedAt) || !implemented.has(payload.childId as string) || payload.preparationEntryDigest !== pending.preparationEntryDigest || payload.targetBranch !== context.activePlan.featureBranch || payload.draft !== true) return replayInvalid("STAGE_ORDER_INVALID", index); published.add(payload.childId as string); pending = null; pendingCandidate = null; pendingExpectedHead = null; pendingExpectedTree = null; uncertain = false;
    } else if (entry.entryKind === "child_evidence_accepted") {
      if (!published.has(payload.childId as string) || !Array.isArray(payload.evidenceDigests) || payload.evidenceDigests.length < 2 || !Array.isArray(payload.evidenceRecords)) return replayInvalid("EVIDENCE_INVALID", index);
      const records = payload.evidenceRecords as FeatureOperationReplayContextV1["acceptedReviewEvidence"];
      const evidenceDigests = payload.evidenceDigests as unknown[];
      if (records.some((record) => record.childId !== payload.childId || record.repositoryId !== context.repositoryId || !evidenceDigests.includes(record.sourceRecordDigest))) return replayInvalid("EVIDENCE_INVALID", index);
      const refs = new Set(context.acceptedReviewEvidence.map((record) => record.evidenceRef));
      if (records.some((record) => refs.has(record.evidenceRef))) return replayInvalid("EVIDENCE_INVALID", index);
      evidenced.add(payload.childId as string); context = { ...context, acceptedReviewEvidence: [...context.acceptedReviewEvidence, ...records], operationCounters: { ...context.operationCounters, capturedEvidenceCount: context.operationCounters.capturedEvidenceCount + records.length } };
    } else if (entry.entryKind === "integration_accepted" || entry.entryKind === "rollback_accepted") {
      if (!pending || payload.preparationEntryDigest !== pending.preparationEntryDigest || !plain(payload.receipt)) return replayInvalid("HEAD_TRANSITION_INVALID", index);
      const receiptCheck = entry.entryKind === "integration_accepted" ? validateFeatureIntegrationReceiptV1(payload.receipt) : validateFeatureRollbackReceiptV1(payload.receipt);
      if (receiptCheck.state !== "valid") return replayInvalid("HEAD_TRANSITION_INVALID", index);
      const receipt = receiptCheck.value as FeatureIntegrationReceiptV1 | FeatureRollbackReceiptV1;
      if (receipt.priorHeadRevision !== terminalHead || receipt.priorTreeDigest !== terminalTree || !text(receipt.resultingHeadRevision) || !digestValue(receipt.resultingTreeDigest)) return replayInvalid("HEAD_TRANSITION_INVALID", index);
      if (Date.parse(receipt.observedAt.value) < Date.parse(context.observedAt.value)) return replayInvalid("HEAD_TRANSITION_INVALID", index);
      context = { ...context, observedAt: receipt.observedAt };
      if (entry.entryKind === "integration_accepted") {
        const integrationCandidate = pendingCandidate as FeatureOperationDerivedCandidateV1 | null;
        const integrationReceipt = receipt as FeatureIntegrationReceiptV1;
        if (integrationCandidate?.derivationKind !== "child_merge_to_feature" || !evidenced.has(integrationReceipt.childId) ||
            integrationReceipt.operationId !== integrationCandidate.operationId || integrationReceipt.repositoryId !== integrationCandidate.repositoryId || integrationReceipt.planDigest !== integrationCandidate.planDigest || integrationReceipt.authorityDigest !== integrationCandidate.authorityDigest ||
            integrationReceipt.requestDigest !== pending.requestDigest || integrationReceipt.effectKey !== integrationCandidate.effectKey || integrationReceipt.childId !== integrationCandidate.childId || integrationReceipt.childMissionId !== integrationCandidate.childId ||
            integrationReceipt.childBranch !== integrationCandidate.childBranch || integrationReceipt.childHeadRevision !== integrationCandidate.childHeadRevision || integrationReceipt.childTreeDigest !== integrationCandidate.childTreeDigest ||
            integrationReceipt.targetFeatureBranch !== integrationCandidate.targetBranch || integrationReceipt.integrationMethod !== integrationCandidate.integrationMethod) return replayInvalid("EVIDENCE_INVALID", index);
        headSequence += 1;
        const integration = integrationReceipt;
        const transition = { kind: "integration" as const, operationSequence: headSequence, effectKey: integration.effectKey, priorHeadRevision: integration.priorHeadRevision, priorTreeDigest: integration.priorTreeDigest, resultingHeadRevision: integration.resultingHeadRevision, resultingTreeDigest: integration.resultingTreeDigest, receiptDigest: integration.receiptDigest, childId: integration.childId, childHeadRevision: integration.childHeadRevision, childTreeDigest: integration.childTreeDigest };
        context = { ...context, transitions: [...context.transitions, transition], acceptedIntegrations: [...context.acceptedIntegrations, { childId: transition.childId, operationSequence: transition.operationSequence, effectKey: transition.effectKey, priorHeadRevision: transition.priorHeadRevision, priorTreeDigest: transition.priorTreeDigest, resultingHeadRevision: transition.resultingHeadRevision, resultingTreeDigest: transition.resultingTreeDigest, receiptDigest: transition.receiptDigest, reverted: false }] };
      } else {
        if ((pendingCandidate as FeatureOperationDerivedCandidateV1 | null)?.derivationKind !== "child_revert_on_feature") return replayInvalid("HEAD_TRANSITION_INVALID", index);
        const rollback = receipt as FeatureRollbackReceiptV1;
        const latest = [...context.acceptedIntegrations].reverse().find((item) => !item.reverted);
        if (!latest || latest.receiptDigest !== rollback.revertedIntegrationReceiptDigest || latest.priorTreeDigest !== rollback.resultingTreeDigest || rollbackWorkspaces.get(rollback.childId) !== rollback.rollbackWorkspaceReceiptDigest) return replayInvalid("HEAD_TRANSITION_INVALID", index);
        headSequence += 1;
        const transition = { kind: "rollback" as const, operationSequence: headSequence, effectKey: rollback.effectKey, priorHeadRevision: rollback.priorHeadRevision, priorTreeDigest: rollback.priorTreeDigest, resultingHeadRevision: rollback.resultingHeadRevision, resultingTreeDigest: rollback.resultingTreeDigest, receiptDigest: rollback.receiptDigest, childId: rollback.childId, revertedIntegrationReceiptDigest: rollback.revertedIntegrationReceiptDigest };
        const lifecycle = ["cancelled", "expired", "superseded"].includes(context.lifecycle.state) ? context.lifecycle : { state: "active" as const, atOperationSequence: headSequence };
        context = { ...context, transitions: [...context.transitions, transition], acceptedIntegrations: context.acceptedIntegrations.map((item) => item.receiptDigest === latest.receiptDigest ? { ...item, reverted: true } : item), acceptedRollbacks: [...context.acceptedRollbacks, { childId: transition.childId, operationSequence: transition.operationSequence, effectKey: transition.effectKey, revertedIntegrationReceiptDigest: transition.revertedIntegrationReceiptDigest, priorHeadRevision: transition.priorHeadRevision, priorTreeDigest: transition.priorTreeDigest, resultingHeadRevision: transition.resultingHeadRevision, resultingTreeDigest: transition.resultingTreeDigest, receiptDigest: transition.receiptDigest }], lifecycle };
      }
      terminalHead = receipt.resultingHeadRevision; terminalTree = receipt.resultingTreeDigest; cumulative = "pending"; cumulativeAttempts = 0; pending = null; pendingCandidate = null; pendingExpectedHead = null; pendingExpectedTree = null; uncertain = false;
    } else if (entry.entryKind === "rollback_workspace_accepted") {
      if (!text(payload.childId) || !text(payload.sourceMissionId) || !digestValue(payload.completionReceiptDigest) || !digestValue(payload.restoredTreeDigest) || payload.targetBranch !== context.activePlan.featureBranch || rollbackWorkspaces.has(payload.childId as string)) return replayInvalid("EVIDENCE_INVALID", index);
      rollbackWorkspaces.set(payload.childId as string, payload.completionReceiptDigest as string);
    } else if (entry.entryKind === "cumulative_validation_accepted" || entry.entryKind === "cumulative_validation_failed") {
      if (!pending || !(pendingCandidate && "authorityDigest" in pendingCandidate && !("derivationKind" in pendingCandidate)) || payload.preparationEntryDigest !== pending.preparationEntryDigest || !plain(payload.receipt)) return replayInvalid("CUMULATIVE_VALIDATION_INVALID", index);
      const checkedReceipt = validateFeatureCumulativeValidationReceiptV1(payload.receipt); if (checkedReceipt.state !== "valid") return replayInvalid("CUMULATIVE_VALIDATION_INVALID", index);
      const receipt = checkedReceipt.value, cumulativeCandidate = pendingCandidate as FeatureCumulativeValidationCandidateV1;
      if (receipt.operationId !== cumulativeCandidate.operationId || receipt.repositoryId !== context.repositoryId || receipt.planDigest !== context.activePlanDigest || receipt.featureAuthorityDigest !== context.verifiedAuthorityDigest ||
          receipt.cumulativeAuthorityDigest !== cumulativeCandidate.authorityDigest || receipt.effectKey !== cumulativeCandidate.effectKey || receipt.requestDigest !== cumulativeCandidate.requestDigest || receipt.transitionReceiptDigest !== cumulativeCandidate.transitionReceiptDigest ||
          receipt.terminalHeadRevision !== cumulativeCandidate.terminalHeadRevision || receipt.terminalTreeDigest !== cumulativeCandidate.terminalTreeDigest || receipt.terminalHeadRevision !== terminalHead || receipt.terminalTreeDigest !== terminalTree || receipt.outcome !== (entry.entryKind === "cumulative_validation_accepted" ? "passed" : "failed")) return replayInvalid("CUMULATIVE_VALIDATION_INVALID", index);
      if (Date.parse(receipt.observedAt.value) < Date.parse(context.observedAt.value)) return replayInvalid("CUMULATIVE_VALIDATION_INVALID", index);
      context = { ...context, observedAt: receipt.observedAt }; cumulative = receipt.outcome; pending = null; pendingCandidate = null; pendingExpectedHead = null; pendingExpectedTree = null; uncertain = false;
    } else if (entry.entryKind === "final_gate_evidence_accepted") {
      if (!text(payload.gateId) || !["fitz", "simmons", "coulson"].includes(payload.gateId as string) || !digestValue(payload.sourceRecordDigest) || payload.terminalHeadRevision !== terminalHead || payload.terminalTreeDigest !== terminalTree || finalGates.has(payload.gateId as string)) return replayInvalid("EVIDENCE_INVALID", index);
      finalGates.set(payload.gateId as string, payload.sourceRecordDigest as string);
    } else if (entry.entryKind === "operation_paused") { if (context.lifecycle.state !== "active" || pending) return replayInvalid("LIFECYCLE_INVALID", index); context = { ...context, lifecycle: { state: "paused", atOperationSequence: headSequence } }; }
    else if (entry.entryKind === "operation_resumed") { if (context.lifecycle.state !== "paused" || pending) return replayInvalid("LIFECYCLE_INVALID", index); context = { ...context, lifecycle: { state: "active", atOperationSequence: headSequence } }; }
    else if (["operation_cancelled", "operation_split", "operation_superseded", "operation_completed"].includes(entry.entryKind)) {
      const allIntegrated = context.activePlan.children.every((child) => context.acceptedIntegrations.some((item) => item.childId === child.childId && !item.reverted));
      const finalSatisfied = finalGates.has("fitz") && finalGates.has("coulson");
      const terminalRollbackDisposition = entry.entryKind !== "operation_completed" && context.lifecycle.state === "rollback_pending" && (pendingCandidate as FeatureOperationDerivedCandidateV1 | null)?.derivationKind === "child_revert_on_feature";
      if ((pending && !terminalRollbackDisposition) || (entry.entryKind === "operation_completed" && (!allIntegrated || cumulative !== "passed" || !finalSatisfied))) return replayInvalid("LIFECYCLE_INVALID", index);
      const state = entry.entryKind === "operation_cancelled" ? "cancelled" : entry.entryKind === "operation_completed" ? "integrated" : "superseded";
      context = { ...context, lifecycle: { state, atOperationSequence: headSequence } };
    }
    const observed = payload.observedAt;
    if (plain(observed) && observed.provenance === "hostTrusted" && timestamp(observed.value)) {
      if (Date.parse(observed.value as string) < Date.parse(context.observedAt.value)) return replayInvalid("LIFECYCLE_INVALID", index);
      context = { ...context, observedAt: observed as unknown as { value: string; provenance: "hostTrusted" } };
      if (["active", "paused", "rollback_pending"].includes(context.lifecycle.state) && Date.parse(context.observedAt.value) >= Date.parse(context.activePlan.expiresAt)) context = { ...context, lifecycle: { state: "expired", atOperationSequence: headSequence } };
    }
  }
  if (["active", "paused", "rollback_pending"].includes(context.lifecycle.state) && Date.parse(context.observedAt.value) >= Date.parse(context.activePlan.expiresAt)) context = { ...context, lifecycle: { state: "expired", atOperationSequence: headSequence } };
  const child = context.activePlan.children.find((item) => !context.acceptedIntegrations.some((accepted) => accepted.childId === item.childId && !accepted.reverted));
  let nextStage: FeatureIntegrationNextStageV1 = pending ? "blocked" : !featureBranchExists ? "feature_branch_creation" : !featureWorkspaceExists ? "feature_workspace" : headSequence > 0 && cumulative === "failed" ? "rollback_mission_handoff" : headSequence > 0 && cumulative === "pending" ? "cumulative_validation" : !child ? (cumulative === "passed" ? "completed" : "cumulative_validation") : !initiated.has(child.childId) ? "child_initiation" : !implemented.has(child.childId) ? "implementation_handoff" : !published.has(child.childId) ? "child_publication" : !evidenced.has(child.childId) ? "child_evidence" : "integration";
  const latestTransition = context.transitions.at(-1);
  const terminalRollbackRequiresValidation = ["cancelled", "expired", "superseded"].includes(context.lifecycle.state) && latestTransition?.kind === "rollback" && latestTransition.operationSequence > context.lifecycle.atOperationSequence && cumulative === "pending";
  if (["paused", "cancelled", "expired", "superseded"].includes(context.lifecycle.state)) nextStage = pending ? "blocked" : terminalRollbackRequiresValidation ? "cumulative_validation" : "lifecycle_only";
  if (validateFeatureOperationReplayContextV1(context).state !== "valid") return replayInvalid("JOURNAL_INVALID", entries.length - 1);
  return { state: "valid", value: clone({ replayContext: context, nextEntrySequence: entries.length, activeAuthorityJournalSequence: activeJournal, activeAuthorityOperationSequence: activeOperation, headTransitionOperationSequence: headSequence, terminalHeadRevision: terminalHead, terminalTreeDigest: terminalTree, pendingEffect: pending, uncertainEffect: uncertain, consumedCumulativeValidationEffectKeys: cumulativeKeys, cumulativeValidationAttempts: cumulativeAttempts, cumulativeValidation: cumulative, nextStage, latestObservedAt: context.observedAt }) };
}

export function createFeatureOperationGenesisEntryV1(input: { operationId: string; replayContext: FeatureOperationReplayContextV1; signedAuthority: SignedFeatureOperationAuthorityV1; trustedBindings: readonly TrustedHumanBinding[] }): FeatureOperationJournalEntryV1 {
  const replay = validateFeatureOperationReplayContextV1(input.replayContext);
  const authority = replay.state === "valid" ? verifyJournalFeatureAuthority(input.signedAuthority, input.trustedBindings, input.operationId, 0, 0) : null;
  if (replay.state !== "valid" || replay.value.operationId !== input.operationId || replay.value.activePlan.baseBranch !== "main" || !authority || !authorityExactlyActivatesReplay(authority, replay.value)) throw new TypeError("Genesis replay context or signed authority is invalid.");
  return createFeatureIntegrationEntryV1({ operationId: input.operationId, entrySequence: 0, entryKind: "operation_genesis_accepted", previousEntryDigest: null, payload: { replayContext: replay.value, signedAuthority: structuredClone(input.signedAuthority), trustedBindings: structuredClone(input.trustedBindings) } });
}

export type FeatureIntegrationEntryKindV2 = (typeof FEATURE_INTEGRATION_ENTRY_KINDS_V2)[number];
export type FeatureIntegrationReplayReasonV2 = (typeof FEATURE_INTEGRATION_REPLAY_REASONS_V2)[number];
export type FeatureIntegrationNextStageV2 =
  | "feature_branch_creation" | "feature_workspace" | "child_initiation" | "implementation_handoff"
  | "child_publication" | "child_evidence" | "integration" | "rollback_mission_handoff"
  | "rollback" | "cumulative_validation" | "lifecycle_only" | "completed" | "blocked";
export type FeatureEffectClassV2 = "workspace" | "transition" | "cumulative";

export interface FeatureObservationProducerBindingV2 {
  schemaVersion: 2;
  producerId: string;
  producerKind: "github_repository" | "cumulative_execution";
  publicKeySpkiBase64: string;
  signingKeyRef: string;
}

export interface FeatureIntegrationTrustAnchorV2 {
  missionId: string;
  repositoryId: string;
  humanBindingsDigest: string;
  trustedHumanBindings: readonly TrustedHumanBinding[];
  sourceBindingSequence: number;
  sourceImplementationAuthority: ImplementationAuthorityV1;
  sourceImplementationAuthorityDigest: string;
  sourceRuntimeBinding: Schema9RuntimeBindingV1;
  sourceJournalDigest: string;
}

export interface FeatureOperationGenesisPayloadV2 {
  replayContext: FeatureOperationReplayContextV2;
  signedAuthority: SignedFeatureOperationAuthorityV2;
  trustedObservationProducerBindings: readonly FeatureObservationProducerBindingV2[];
  trustedHumanBindings: readonly TrustedHumanBinding[];
}

export interface FeatureObservationChallengeV2 {
  schemaVersion: 2; contractVersion: "feature.integration.challenge.v2";
  challengeKind: "workspace" | "transition" | "cumulative" | "admission" | "expiry";
  operationId: string; repositoryId: string; requestId: string; requestCoreDigest: string;
  preparationEntryDigest: string | null; candidateDigest: string | null; effectKey: string | null;
  producerId: string; producerKind: "github_repository" | "cumulative_execution"; generation: number;
  challengeId: string; previousJournalDigest: string; intendedEntrySequence: number;
  expectedHeadRevision: string | null; expectedTreeDigest: string | null;
  priorChallengeDigest: string | null; priorObservationDigest: string | null;
  issuedAt: string; expiresAt: string; challengeDigest: string;
}
export interface SignedFeatureObservationChallengeV2 { payload: FeatureObservationChallengeV2; signatureBase64: string }
export interface FeatureWorkspaceRequestV2 {
  schemaVersion: 2; contractVersion: "feature.integration.workspace-request.v2"; requestId: string;
  operationId: string; repositoryId: string; derivationKind: "feature_branch_create" | "feature_workspace_draft_pr_create" | "child_initiation" | "child_draft_pr_create";
  candidateDigest: string; effectKey: string; targetRef: string; targetBaseBranch: string | null;
  expectedHeadRevision: string; expectedTreeDigest: string | null; childId: string | null; pullRequestId: string | null;
  sourceBranch: string | null; draftOnly: true | null; requestCoreDigest: string;
  signedChallenge: SignedFeatureObservationChallengeV2; requestDigest: string;
}
export interface FeatureTransitionRequestV2 {
  schemaVersion: 2; contractVersion: "feature.integration.transition-request.v2"; requestId: string;
  operationId: string; repositoryId: string; derivationKind: "child_merge_to_feature" | "child_revert_on_feature";
  candidateDigest: string; effectKey: string; pullRequestId: string; expectedPullRequestHead: string;
  targetFeatureBranch: string; targetFeatureRef: string; integrationMethod: "merge_commit" | "rebase_merge" | "squash";
  priorHeadRevision: string; priorTreeDigest: string; rollbackWorkspaceReceiptDigest: string | null;
  requestCoreDigest: string; signedChallenge: SignedFeatureObservationChallengeV2; requestDigest: string;
}
export interface FeatureCumulativeValidationCommandV2 { commandId: string; executable: string; args: readonly string[]; targetIds: readonly string[]; executableArgsDigest: string; idempotencyKey: string }
export interface FeatureCumulativeRequestV2 {
  schemaVersion: 2; contractVersion: "feature.integration.cumulative-request.v2"; requestId: string;
  operationId: string; repositoryId: string; planDigest: string; featureAuthorityDigest: string;
  terminalHeadRevision: string; terminalTreeDigest: string; transitionReceiptDigest: string; effectKey: string;
  attemptId: string; commands: readonly FeatureCumulativeValidationCommandV2[]; targetIds: readonly string[]; validationIds: readonly string[];
  requestCoreDigest: string; cumulativeAuthorityDigest: string; signedChallenge: SignedFeatureObservationChallengeV2; requestDigest: string;
}
export type FeatureEffectRequestV2 = FeatureWorkspaceRequestV2 | FeatureTransitionRequestV2 | FeatureCumulativeRequestV2;
export interface FeatureCumulativeValidationAuthorityV2 {
  schemaVersion: 2; authorityKind: "feature_cumulative_validation.v2"; authorityId: string; missionId: string;
  operationId: string; repositoryId: string; planDigest: string; featureAuthorityDigest: string;
  terminalHeadRevision: string; terminalTreeDigest: string; transitionReceiptDigest: string; requestCoreDigest: string;
  commandIds: readonly string[]; targetIds: readonly string[]; validationIds: readonly string[]; effectKey: string;
  maxAttempts: 1; maxRetries: 0; activeAuthorityJournalSequence: number; activeAuthorityOperationSequence: number;
  issuedAt: string; expiresAt: string; humanPrincipalId: string; humanBindingId: string; signingKeyRef: string; authorityDigest: string;
}
export interface SignedFeatureCumulativeValidationAuthorityV2 { payload: FeatureCumulativeValidationAuthorityV2; signatureBase64: string }
export interface FeatureCumulativeValidationCandidateV2 {
  schemaVersion: 2; contractVersion: "feature.integration.v2"; operationId: string; repositoryId: string;
  planDigest: string; featureAuthorityDigest: string; cumulativeAuthorityDigest: string; requestCoreDigest: string;
  effectKey: string; attemptId: string; terminalHeadRevision: string; terminalTreeDigest: string; transitionReceiptDigest: string;
  activeAuthorityJournalSequence: number; activeAuthorityOperationSequence: number; candidateDigest: string;
}
export interface FeatureWorkspaceObservationV2 {
  schemaVersion: 2; contractVersion: "feature.integration.observation.v2"; observationKind: "workspace";
  operationId: string; repositoryId: string; requestId: string; requestCoreDigest: string; requestDigest: string;
  preparationEntryDigest: string; candidateDigest: string; effectKey: string;
  derivationKind: "feature_branch_create" | "feature_workspace_draft_pr_create" | "child_initiation" | "child_draft_pr_create";
  targetRef: string; targetBaseBranch: string | null; expectedHeadRevision: string; expectedTreeDigest: string | null;
  status: "applied" | "not_applied" | "uncertain"; observedHeadRevision: string | null; observedTreeDigest: string | null;
  pullRequests: readonly { pullRequestId: string; url: string; draft: boolean; headBranch: string; headRevision: string; baseBranch: string }[];
  signedChallenge: SignedFeatureObservationChallengeV2; producerId: string; observedAt: string; observationDigest: string;
}
export interface FeatureTransitionObservationV2 {
  schemaVersion: 2; contractVersion: "feature.integration.observation.v2"; observationKind: "transition";
  operationId: string; repositoryId: string; requestId: string; requestCoreDigest: string; requestDigest: string;
  preparationEntryDigest: string; candidateDigest: string; effectKey: string; pullRequestId: string; expectedPullRequestHead: string;
  targetFeatureRef: string; integrationMethod: "merge_commit" | "rebase_merge" | "squash"; priorHeadRevision: string; priorTreeDigest: string;
  observedPullRequestHead: string; observedPullRequestBaseBranch: string; observedIntegrationMethod: string | null;
  pullRequestMerged: boolean; pullRequestMergeRevision: string | null; pullRequestCommitHeads: readonly string[]; conflictingPullRequestCount: number;
  resultingCommitParents: readonly string[]; rebasedCommits: readonly { sourceCommit: string; resultCommit: string; parentCommit: string; treeDigest: string }[];
  checkState: "successful" | "not_successful" | "unknown"; observedTargetHeadRevision: string; observedTargetTreeDigest: string;
  status: "applied" | "not_applied" | "uncertain"; signedChallenge: SignedFeatureObservationChallengeV2; producerId: string; observedAt: string; observationDigest: string;
}
export interface FeatureCumulativeRegistrationObservationV2 {
  schemaVersion: 2; contractVersion: "feature.integration.observation.v2"; observationKind: "cumulative_registration";
  operationId: string; preparationEntryDigest: string; attemptId: string; requestDigest: string; commandCount: number;
  sourceRuntimeBindingDigest: string; runtimeIdentity: { seatId: "may"; reasoningRuntimeId: string; modelId: string; toolExecutorId: string };
  signedChallenge: SignedFeatureObservationChallengeV2; producerId: string; registeredAt: string; observationDigest: string;
}
export interface FeatureCumulativeStartObservationV2 {
  schemaVersion: 2; contractVersion: "feature.integration.observation.v2"; observationKind: "cumulative_start";
  operationId: string; preparationEntryDigest: string; attemptId: string; requestDigest: string; commandIndex: number; commandId: string;
  executableArgsDigest: string; idempotencyKey: string; registrationDigest: string; priorRecordDigest: string; producerId: string; startedAt: string; observationDigest: string;
}
export interface FeatureCumulativeResultObservationV2 {
  schemaVersion: 2; contractVersion: "feature.integration.observation.v2"; observationKind: "cumulative_result";
  operationId: string; preparationEntryDigest: string; attemptId: string; requestDigest: string; commandIndex: number; commandId: string;
  idempotencyKey: string; startDigest: string; status: "completed" | "threw" | "malformed"; exitCode: number | null;
  stdoutDigest: string | null; stderrDigest: string | null; cacheDisposition: "executed" | "cache_hit" | "unknown"; producerId: string; finishedAt: string; observationDigest: string;
}
export interface FeatureCumulativeReceiptObservationV2 {
  schemaVersion: 2; contractVersion: "feature.integration.observation.v2"; observationKind: "cumulative_receipt";
  operationId: string; preparationEntryDigest: string; attemptId: string; requestDigest: string; registrationDigest: string;
  startDigests: readonly string[]; resultDigests: readonly string[]; idempotencyKeys: readonly string[]; completedPrefixLength: number;
  invocationBounds: { minimum: number; maximum: number }; terminalStatus: "passed" | "failed" | "not_applied" | "uncertain";
  notAppliedReason: "implementation_authority_inactive" | "implementation_authority_mismatch" | "execution_request_mismatch" | null;
  commands: readonly { commandIndex: number; commandId: string; executableArgsDigest: string; idempotencyKey: string }[];
  results: readonly { commandIndex: number; commandId: string; startDigest: string; resultDigest: string; status: "completed" | "threw" | "malformed"; exitCode: number | null; stdoutDigest: string | null; stderrDigest: string | null; cacheDisposition: "executed" | "cache_hit" | "unknown" }[];
  signedChallenge: SignedFeatureObservationChallengeV2; producerId: string; observedAt: string; observationDigest: string;
}
export interface FeatureAdmissionObservationV2 {
  schemaVersion: 2; contractVersion: "feature.integration.observation.v2"; observationKind: "admission";
  admissionKind: "controller_snapshot" | "final_gate" | "completion" | "pause" | "resume" | "cancel" | "split" | "supersede";
  operationId: string; repositoryId: string; targetRef: string; activePlanDigest: string; activeAuthorityDigest: string;
  terminalHeadRevision: string; terminalTreeDigest: string; sourceLifecycle: string; priorJournalDigest: string; intendedEntrySequence: number;
  effectiveExpiry: string; observedAt: string; signedChallenge: SignedFeatureObservationChallengeV2; producerId: string; observationDigest: string;
}
export interface FeatureExpiryObservationV2 {
  schemaVersion: 2; contractVersion: "feature.integration.observation.v2"; observationKind: "expiry";
  operationId: string; repositoryId: string; activePlanDigest: string; activeAuthorityDigest: string; sourceLifecycle: string;
  priorJournalDigest: string; intendedEntrySequence: number; effectiveExpiry: string; observedAt: string;
  signedChallenge: SignedFeatureObservationChallengeV2; producerId: string; observationDigest: string;
}
export interface FeatureFinalGateEvidenceV2 {
  schemaVersion: 2; contractVersion: "feature.integration.final-gate.v2"; evidenceId: string; operationId: string; repositoryId: string;
  activePlanDigest: string; activeAuthorityDigest: string; terminalHeadRevision: string; terminalTreeDigest: string; gateId: string;
  seatId: "fitz" | "simmons" | "coulson"; decision: "approved"; humanPrincipalId: string; humanBindingId: string; signingKeyRef: string;
  featureJournalEntrySequence: number; evidenceTime: string; evidenceDigest: string;
}
export interface FeatureChildEvidenceV2 {
  schemaVersion: 2; evidenceId: string; gateType: "mack" | "fury" | "human" | "check" | "ci"; gateId: string;
  childId: string; repositoryId: string; headRevision: string; sourceRecordDigest: string; accepted: boolean; synthetic: boolean;
}
export interface SignedFeatureWorkspaceObservationV2 { payload: FeatureWorkspaceObservationV2; signatureBase64: string }
export interface SignedFeatureTransitionObservationV2 { payload: FeatureTransitionObservationV2; signatureBase64: string }
export interface SignedFeatureCumulativeReceiptObservationV2 { payload: FeatureCumulativeReceiptObservationV2; signatureBase64: string }
export interface SignedFeatureAdmissionObservationV2 { payload: FeatureAdmissionObservationV2; signatureBase64: string }
export interface SignedFeatureExpiryObservationV2 { payload: FeatureExpiryObservationV2; signatureBase64: string }
export interface SignedFeatureFinalGateEvidenceV2 { payload: FeatureFinalGateEvidenceV2; signatureBase64: string }
export interface FeatureIntegrationEntryPayloadMapV2 {
  operation_genesis_accepted: FeatureOperationGenesisPayloadV2;
  authority_successor_accepted: { plan: FeatureOperationPlanV2; signedAuthority: SignedFeatureOperationAuthorityV2 };
  effect_prepared: { effectClass: FeatureEffectClassV2; candidate: Readonly<FeatureOperationDerivedCandidateV2 | FeatureCumulativeValidationCandidateV2>; candidateDigest: string; effectKey: string; request: Readonly<FeatureEffectRequestV2>; requestDigest: string; expectedHeadRevision: string; expectedTreeDigest: string; signedCumulativeAuthority: SignedFeatureCumulativeValidationAuthorityV2 | null };
  effect_challenge_refreshed: { preparationEntryDigest: string; signedChallenge: SignedFeatureObservationChallengeV2 };
  effect_not_applied: { preparationEntryDigest: string; signedObservation: SignedFeatureWorkspaceObservationV2 | SignedFeatureTransitionObservationV2 | SignedFeatureCumulativeReceiptObservationV2 };
  effect_uncertain: { preparationEntryDigest: string; signedObservation: SignedFeatureWorkspaceObservationV2 | SignedFeatureTransitionObservationV2 | SignedFeatureCumulativeReceiptObservationV2 };
  feature_branch_creation_accepted: { preparationEntryDigest: string; headRevision: string; treeDigest: string; signedWorkspaceObservation: SignedFeatureWorkspaceObservationV2 };
  feature_workspace_accepted: { preparationEntryDigest: string; pullRequestId: string; sourceBranch: string; targetBranch: string; headRevision: string; draft: boolean; signedWorkspaceObservation: SignedFeatureWorkspaceObservationV2 };
  child_initiation_accepted: { preparationEntryDigest: string; childId: string; branch: string; baseHeadRevision: string; baseTreeDigest: string; signedWorkspaceObservation: SignedFeatureWorkspaceObservationV2 };
  child_implementation_accepted: { childId: string; sourceMissionId: string; effectKey: string; sourceAuthorityDigest: string; sourceJournalDigest: string; completionReceiptDigest: string; headRevision: string; treeDigest: string };
  child_publication_accepted: { preparationEntryDigest: string; childId: string; pullRequestId: string; sourceBranch: string; targetBranch: string; headRevision: string; draft: boolean; signedWorkspaceObservation: SignedFeatureWorkspaceObservationV2 };
  child_evidence_accepted: { childId: string; headRevision: string; evidenceIds: readonly string[]; evidenceDigests: readonly string[]; evidenceRecords: readonly Readonly<FeatureChildEvidenceV2>[] };
  integration_accepted: { preparationEntryDigest: string; signedTransitionObservation: SignedFeatureTransitionObservationV2 };
  rollback_workspace_accepted: { childId: string; sourceMissionId: string; completionReceiptDigest: string; sourceAuthorityDigest: string; sourceJournalDigest: string; rollbackBranch: string; pullRequestId: string; pullRequestHeadRevision: string; targetBranch: string; restoredTreeDigest: string; sourceEffectKeys: readonly string[]; evidenceDigests: readonly string[] };
  rollback_accepted: { preparationEntryDigest: string; signedTransitionObservation: SignedFeatureTransitionObservationV2 };
  cumulative_validation_accepted: { preparationEntryDigest: string; signedCumulativeReceipt: SignedFeatureCumulativeReceiptObservationV2 };
  cumulative_validation_failed: { preparationEntryDigest: string; signedCumulativeReceipt: SignedFeatureCumulativeReceiptObservationV2 };
  operation_paused: { signedAdmissionObservation: SignedFeatureAdmissionObservationV2; reason: "operator_requested" | "dependency_blocked" | "scope_superseded" };
  operation_resumed: { signedAdmissionObservation: SignedFeatureAdmissionObservationV2; reason: "operator_requested" | "dependency_blocked" | "scope_superseded" };
  operation_cancelled: { signedAdmissionObservation: SignedFeatureAdmissionObservationV2; reason: "operator_requested" | "dependency_blocked" | "scope_superseded" };
  operation_split: { signedAdmissionObservation: SignedFeatureAdmissionObservationV2; successorOperationId: string; successorPlanDigest: string; successorAuthorityDigest: string };
  operation_completed: { signedAdmissionObservation: SignedFeatureAdmissionObservationV2 };
  operation_superseded: { signedAdmissionObservation: SignedFeatureAdmissionObservationV2; successorOperationId: string; successorPlanDigest: string; successorAuthorityDigest: string };
  final_gate_evidence_accepted: { signedEvidence: SignedFeatureFinalGateEvidenceV2; signedAdmissionObservation: SignedFeatureAdmissionObservationV2 };
  operation_expired: { signedExpiryObservation: SignedFeatureExpiryObservationV2 };
}
export type FeatureIntegrationEntryPayloadV2 = FeatureIntegrationEntryPayloadMapV2[FeatureIntegrationEntryKindV2];
type FeatureOperationJournalEntryCommonV2 = {
  schemaVersion: 2;
  contractVersion: "feature.integration.v2";
  operationId: string;
  entrySequence: number;
  previousEntryDigest: string | null;
  entryDigest: string;
};
export type FeatureOperationJournalEntryV2 = {
  [K in FeatureIntegrationEntryKindV2]: FeatureOperationJournalEntryCommonV2 & { entryKind: K; payload: FeatureIntegrationEntryPayloadMapV2[K] }
}[FeatureIntegrationEntryKindV2];
export interface FeatureOperationJournalV2 {
  schemaVersion: 2;
  contractVersion: "feature.integration.v2";
  operationId: string;
  genesisDigest: string;
  latestAcceptedEntryDigest: string;
  entries: readonly FeatureOperationJournalEntryV2[];
  journalDigest: string;
}

export interface FeatureIntegrationPendingEffectV2 {
  effectClass: FeatureEffectClassV2;
  candidateDigest: string;
  effectKey: string;
  request: Readonly<Record<string, unknown>>;
  requestDigest: string;
  preparationEntryDigest: string;
  signedCumulativeAuthority: Readonly<Record<string, unknown>> | null;
  signedChallenges: readonly SignedFeatureObservationChallengeV2[];
  latestObservationDigest: string | null;
}

export interface FeatureIntegrationReplayProjectionV2 {
  replayContext: FeatureOperationReplayContextV2;
  nextEntrySequence: number;
  activeAuthorityJournalSequence: number;
  activeAuthorityOperationSequence: number;
  headTransitionOperationSequence: number;
  terminalHeadRevision: string;
  terminalTreeDigest: string;
  lifecycle: "active" | "paused" | "rollback_pending" | "rollback_validation_pending" | "cancelled" | "expired" | "superseded" | "integrated";
  pendingEffect: FeatureIntegrationPendingEffectV2 | null;
  uncertainEffect: boolean;
  consumedCumulativeValidationEffectKeys: readonly string[];
  cumulativeValidationAttempts: number;
  cumulativeValidation: "pending" | "passed" | "failed";
  cumulativeExecutionProjection: null | {
    preparationEntryDigest: string;
    attemptId: string;
    ledgerDigest: string;
    completedPrefixLength: number;
    invocationBounds: { minimum: number; maximum: number };
    terminalStatus: "running" | "passed" | "failed" | "not_applied" | "uncertain";
    terminalReceiptDigest: string | null;
  };
  acceptedFinalGates: readonly { seatId: "fitz" | "simmons" | "coulson"; gateId: string; evidenceId: string; evidenceDigest: string; entrySequence: number }[];
  terminalDisposition: null | { state: "cancelled" | "expired" | "superseded"; entrySequence: number; entryDigest: string };
  activeRecoveryAuthorityDigest: string | null;
  nextStage: FeatureIntegrationNextStageV2;
  latestObservedAt: { value: string; provenance: "hostTrusted" };
}
export type FeatureIntegrationReplayResultV2 =
  | { state: "valid"; value: Readonly<FeatureIntegrationReplayProjectionV2> }
  | { state: "invalid"; reason: FeatureIntegrationReplayReasonV2; entrySequence: number | null };
export type SecureReplayResultV2 = FeatureIntegrationReplayResultV2 |
  { state: "blocked"; reason: "LEGACY_JOURNAL_UNTRUSTED"; entrySequence: null };

const V2_ENTRY_PAYLOAD_FIELDS: Readonly<Record<FeatureIntegrationEntryKindV2, readonly string[]>> = Object.freeze({
  operation_genesis_accepted: ["replayContext", "signedAuthority", "trustedObservationProducerBindings", "trustedHumanBindings"],
  authority_successor_accepted: ["plan", "signedAuthority"],
  effect_prepared: ["effectClass", "candidate", "candidateDigest", "effectKey", "request", "requestDigest", "expectedHeadRevision", "expectedTreeDigest", "signedCumulativeAuthority"],
  effect_challenge_refreshed: ["preparationEntryDigest", "signedChallenge"],
  effect_not_applied: ["preparationEntryDigest", "signedObservation"],
  effect_uncertain: ["preparationEntryDigest", "signedObservation"],
  feature_branch_creation_accepted: ["preparationEntryDigest", "headRevision", "treeDigest", "signedWorkspaceObservation"],
  feature_workspace_accepted: ["preparationEntryDigest", "pullRequestId", "sourceBranch", "targetBranch", "headRevision", "draft", "signedWorkspaceObservation"],
  child_initiation_accepted: ["preparationEntryDigest", "childId", "branch", "baseHeadRevision", "baseTreeDigest", "signedWorkspaceObservation"],
  child_implementation_accepted: ["childId", "sourceMissionId", "effectKey", "sourceAuthorityDigest", "sourceJournalDigest", "completionReceiptDigest", "headRevision", "treeDigest"],
  child_publication_accepted: ["preparationEntryDigest", "childId", "pullRequestId", "sourceBranch", "targetBranch", "headRevision", "draft", "signedWorkspaceObservation"],
  child_evidence_accepted: ["childId", "headRevision", "evidenceIds", "evidenceDigests", "evidenceRecords"],
  integration_accepted: ["preparationEntryDigest", "signedTransitionObservation"],
  rollback_workspace_accepted: ["childId", "sourceMissionId", "completionReceiptDigest", "sourceAuthorityDigest", "sourceJournalDigest", "rollbackBranch", "pullRequestId", "pullRequestHeadRevision", "targetBranch", "restoredTreeDigest", "sourceEffectKeys", "evidenceDigests"],
  rollback_accepted: ["preparationEntryDigest", "signedTransitionObservation"],
  cumulative_validation_accepted: ["preparationEntryDigest", "signedCumulativeReceipt"],
  cumulative_validation_failed: ["preparationEntryDigest", "signedCumulativeReceipt"],
  operation_paused: ["signedAdmissionObservation", "reason"],
  operation_resumed: ["signedAdmissionObservation", "reason"],
  operation_cancelled: ["signedAdmissionObservation", "reason"],
  operation_split: ["signedAdmissionObservation", "successorOperationId", "successorPlanDigest", "successorAuthorityDigest"],
  operation_completed: ["signedAdmissionObservation"],
  operation_superseded: ["signedAdmissionObservation", "successorOperationId", "successorPlanDigest", "successorAuthorityDigest"],
  final_gate_evidence_accepted: ["signedEvidence", "signedAdmissionObservation"],
  operation_expired: ["signedExpiryObservation"],
});

const IDENTIFIER_V2 = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const KEY_REF_V2 = /^ed25519:sha256:[A-Za-z0-9_-]{43}$/u;
const REVISION_V2 = /^[0-9a-f]{40}$/u;
const BRANCH_V2 = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\.\.)(?!.*[~^:?*\[\\\s])(?!.*\/$)[A-Za-z0-9._/-]{1,255}$/u;
const UTC_V2 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;

function identifierV2(value: unknown): value is string { return typeof value === "string" && IDENTIFIER_V2.test(value); }
function keyRefV2(value: unknown): value is string { return typeof value === "string" && KEY_REF_V2.test(value); }
function revisionV2(value: unknown): value is string { return typeof value === "string" && REVISION_V2.test(value); }
function branchV2(value: unknown): value is string { return typeof value === "string" && BRANCH_V2.test(value); }
function utcV2(value: unknown): value is string { return typeof value === "string" && UTC_V2.test(value) && Number.isFinite(Date.parse(value)); }
function nullable<T>(value: unknown, check: (candidate: unknown) => candidate is T): value is T | null { return value === null || check(value); }
function stringArrayV2(value: unknown, check: (candidate: unknown) => boolean = identifierV2, allowEmpty = true): value is string[] {
  const items = densePlainArrayV2(value, allowEmpty);
  return !!items && items.every(check);
}
function signedEnvelopeV2(input: unknown, payloadCheck: (payload: unknown) => boolean): boolean {
  return exactDataRecordV2(input, ["payload", "signatureBase64"]) && payloadCheck(input.payload) &&
    canonicalBase64V2(input.signatureBase64) && Buffer.from(input.signatureBase64, "base64").length === 64;
}
function challengeV2(input: unknown, expectedKind?: FeatureObservationChallengeV2["challengeKind"]): input is FeatureObservationChallengeV2 {
  const fields = ["schemaVersion", "contractVersion", "challengeKind", "operationId", "repositoryId", "requestId", "requestCoreDigest",
    "preparationEntryDigest", "candidateDigest", "effectKey", "producerId", "producerKind", "generation", "challengeId", "previousJournalDigest",
    "intendedEntrySequence", "expectedHeadRevision", "expectedTreeDigest", "priorChallengeDigest", "priorObservationDigest", "issuedAt", "expiresAt", "challengeDigest"];
  if (!exactDataRecordV2(input, fields) || input.schemaVersion !== 2 || input.contractVersion !== "feature.integration.challenge.v2" ||
      !["workspace", "transition", "cumulative", "admission", "expiry"].includes(input.challengeKind as string) ||
      (expectedKind !== undefined && input.challengeKind !== expectedKind) || ![input.operationId, input.repositoryId, input.requestId, input.producerId, input.challengeId].every(identifierV2) ||
      ![input.requestCoreDigest, input.previousJournalDigest, input.challengeDigest].every(digestValue) || !nullable(input.preparationEntryDigest, digestValue) ||
      !nullable(input.candidateDigest, digestValue) || !nullable(input.effectKey, identifierV2) || !safeInteger(input.generation) || !safeInteger(input.intendedEntrySequence) ||
      !nullable(input.expectedHeadRevision, revisionV2) || !nullable(input.expectedTreeDigest, digestValue) || !nullable(input.priorChallengeDigest, digestValue) ||
      !nullable(input.priorObservationDigest, digestValue) || !utcV2(input.issuedAt) || !utcV2(input.expiresAt) || Date.parse(input.issuedAt) >= Date.parse(input.expiresAt)) return false;
  const producerKind = input.challengeKind === "cumulative" ? "cumulative_execution" : "github_repository";
  if (input.producerKind !== producerKind) return false;
  const effectKind = ["workspace", "transition", "cumulative"].includes(input.challengeKind as string);
  if (effectKind !== (input.candidateDigest !== null && input.effectKey !== null) ||
      effectKind !== (input.expectedHeadRevision !== null && input.expectedTreeDigest !== null)) return false;
  if (input.challengeKind === "admission" && (input.expectedHeadRevision === null || input.expectedTreeDigest === null)) return false;
  if (input.challengeKind === "expiry" && (input.expectedHeadRevision !== null || input.expectedTreeDigest !== null)) return false;
  if (input.generation === 0) return input.preparationEntryDigest === null && input.priorChallengeDigest === null && input.priorObservationDigest === null;
  return effectKind && input.preparationEntryDigest !== null && input.priorChallengeDigest !== null;
}
function signedChallengeV2(input: unknown, kind?: FeatureObservationChallengeV2["challengeKind"]): boolean {
  return signedEnvelopeV2(input, (payload) => challengeV2(payload, kind));
}

const WORKSPACE_REQUEST_FIELDS = ["schemaVersion", "contractVersion", "requestId", "operationId", "repositoryId", "derivationKind", "candidateDigest", "effectKey",
  "targetRef", "targetBaseBranch", "expectedHeadRevision", "expectedTreeDigest", "childId", "pullRequestId", "sourceBranch", "draftOnly", "requestCoreDigest", "signedChallenge", "requestDigest"];
const TRANSITION_REQUEST_FIELDS = ["schemaVersion", "contractVersion", "requestId", "operationId", "repositoryId", "derivationKind", "candidateDigest", "effectKey", "pullRequestId",
  "expectedPullRequestHead", "targetFeatureBranch", "targetFeatureRef", "integrationMethod", "priorHeadRevision", "priorTreeDigest", "rollbackWorkspaceReceiptDigest", "requestCoreDigest", "signedChallenge", "requestDigest"];
const CUMULATIVE_REQUEST_FIELDS = ["schemaVersion", "contractVersion", "requestId", "operationId", "repositoryId", "planDigest", "featureAuthorityDigest", "terminalHeadRevision", "terminalTreeDigest",
  "transitionReceiptDigest", "effectKey", "attemptId", "commands", "targetIds", "validationIds", "requestCoreDigest", "cumulativeAuthorityDigest", "signedChallenge", "requestDigest"];

function workspaceRequestV2(input: unknown): input is FeatureWorkspaceRequestV2 {
  return exactDataRecordV2(input, WORKSPACE_REQUEST_FIELDS) && input.schemaVersion === 2 && input.contractVersion === "feature.integration.workspace-request.v2" &&
    [input.requestId, input.operationId, input.repositoryId, input.effectKey].every(identifierV2) &&
    ["feature_branch_create", "feature_workspace_draft_pr_create", "child_initiation", "child_draft_pr_create"].includes(input.derivationKind as string) &&
    [input.candidateDigest, input.requestCoreDigest, input.requestDigest].every(digestValue) && identifierV2(input.targetRef) && nullable(input.targetBaseBranch, branchV2) &&
    revisionV2(input.expectedHeadRevision) && nullable(input.expectedTreeDigest, digestValue) && nullable(input.childId, identifierV2) && nullable(input.pullRequestId, identifierV2) &&
    nullable(input.sourceBranch, branchV2) && (input.draftOnly === true || input.draftOnly === null) && signedChallengeV2(input.signedChallenge, "workspace");
}
function transitionRequestV2(input: unknown): input is FeatureTransitionRequestV2 {
  return exactDataRecordV2(input, TRANSITION_REQUEST_FIELDS) && input.schemaVersion === 2 && input.contractVersion === "feature.integration.transition-request.v2" &&
    [input.requestId, input.operationId, input.repositoryId, input.effectKey, input.pullRequestId, input.targetFeatureRef].every(identifierV2) &&
    ["child_merge_to_feature", "child_revert_on_feature"].includes(input.derivationKind as string) && [input.candidateDigest, input.priorTreeDigest, input.requestCoreDigest, input.requestDigest].every(digestValue) &&
    [input.expectedPullRequestHead, input.priorHeadRevision].every(revisionV2) && branchV2(input.targetFeatureBranch) && ["merge_commit", "rebase_merge", "squash"].includes(input.integrationMethod as string) &&
    nullable(input.rollbackWorkspaceReceiptDigest, digestValue) && signedChallengeV2(input.signedChallenge, "transition");
}

function transitionRequestCoreV2(input: unknown): Record<string, unknown> | null {
  if (!plain(input)) return null;
  const value = structuredClone(input) as Record<string, unknown>;
  delete value.requestCoreDigest;
  delete value.signedChallenge;
  delete value.requestDigest;
  return exactDataRecordV2(value, TRANSITION_REQUEST_FIELDS.slice(0, -3)) ? value : null;
}

export function computeFeatureTransitionRequestCoreDigestV2(input: unknown): string {
  const core = transitionRequestCoreV2(input);
  if (!core) throw new TypeError("Feature transition V2 request core is invalid.");
  return framedDigestV2(FEATURE_INTEGRATION_REQUEST_CORE_DOMAIN_V2, core);
}

export function computeFeatureTransitionRequestDigestV2(input: unknown): string {
  if (!transitionRequestV2(input)) throw new TypeError("Feature transition V2 request is invalid.");
  return framedDigestV2(FEATURE_INTEGRATION_REQUEST_DOMAIN_V2, input, "requestDigest");
}

export function computeFeatureObservationChallengeDigestV2(input: unknown): string {
  if (!challengeV2(input)) throw new TypeError("Feature observation V2 challenge is invalid.");
  return framedDigestV2(`shield.feature-integration.challenge.v2:${input.challengeKind}`, input, "challengeDigest");
}

export function computeFeatureTransitionObservationDigestV2(input: unknown): string {
  if (!observationPayloadV2(input, ["transition"])) throw new TypeError("Feature transition V2 observation is invalid.");
  return framedDigestV2(FEATURE_TRANSITION_OBSERVATION_DOMAIN_V2, input, "observationDigest");
}

export function computeFeatureCumulativeAuthorityDigestV2(input: unknown): string {
  if (!cumulativeAuthorityV2(input)) throw new TypeError("Feature cumulative V2 authority is invalid.");
  return framedDigestV2(FEATURE_CUMULATIVE_AUTHORITY_DOMAIN_V2, input, "authorityDigest");
}

export function computeFeatureCumulativeCandidateDigestV2(input: unknown): string {
  if (!cumulativeCandidateV2(input)) throw new TypeError("Feature cumulative V2 candidate is invalid.");
  return framedDigestV2(FEATURE_CUMULATIVE_CANDIDATE_DOMAIN_V2, input, "candidateDigest");
}

export function computeFeatureCumulativeRequestCoreDigestV2(input: unknown): string {
  if (!plain(input)) throw new TypeError("Feature cumulative V2 request core is invalid.");
  const value = structuredClone(input) as Record<string, unknown>;
  delete value.requestCoreDigest; delete value.cumulativeAuthorityDigest; delete value.signedChallenge; delete value.requestDigest;
  if (!exactDataRecordV2(value, CUMULATIVE_REQUEST_FIELDS.slice(0, -4))) throw new TypeError("Feature cumulative V2 request core is invalid.");
  return framedDigestV2(FEATURE_INTEGRATION_REQUEST_CORE_DOMAIN_V2, value);
}

export function computeFeatureCumulativeRequestDigestV2(input: unknown): string {
  if (!cumulativeRequestV2(input)) throw new TypeError("Feature cumulative V2 request is invalid.");
  return framedDigestV2(FEATURE_INTEGRATION_REQUEST_DOMAIN_V2, input, "requestDigest");
}

export function computeFeatureCumulativeReceiptObservationDigestV2(input: unknown): string {
  if (!observationPayloadV2(input, ["cumulative_receipt"])) throw new TypeError("Feature cumulative V2 receipt observation is invalid.");
  return framedDigestV2(FEATURE_CUMULATIVE_RECEIPT_OBSERVATION_DOMAIN_V2, input, "observationDigest");
}
function cumulativeCommandV2(input: unknown): boolean {
  return exactDataRecordV2(input, ["commandId", "executable", "args", "targetIds", "executableArgsDigest", "idempotencyKey"]) &&
    identifierV2(input.commandId) && identifierV2(input.executable) && stringArrayV2(input.args, text) && stringArrayV2(input.targetIds, identifierV2, false) &&
    digestValue(input.executableArgsDigest) && digestValue(input.idempotencyKey);
}
function cumulativeRequestV2(input: unknown): input is FeatureCumulativeRequestV2 {
  const commands = exactDataRecordV2(input, CUMULATIVE_REQUEST_FIELDS) && densePlainArrayV2(input.commands, false);
  return !!commands && input.schemaVersion === 2 && input.contractVersion === "feature.integration.cumulative-request.v2" &&
    [input.requestId, input.operationId, input.repositoryId, input.effectKey, input.attemptId].every(identifierV2) && revisionV2(input.terminalHeadRevision) &&
    [input.planDigest, input.featureAuthorityDigest, input.terminalTreeDigest, input.transitionReceiptDigest, input.requestCoreDigest, input.cumulativeAuthorityDigest, input.requestDigest].every(digestValue) &&
    commands.every(cumulativeCommandV2) && stringArrayV2(input.targetIds, identifierV2, false) && stringArrayV2(input.validationIds, identifierV2, false) && signedChallengeV2(input.signedChallenge, "cumulative");
}
function effectRequestV2(input: unknown): input is FeatureEffectRequestV2 { return workspaceRequestV2(input) || transitionRequestV2(input) || cumulativeRequestV2(input); }

const CUMULATIVE_AUTHORITY_FIELDS = ["schemaVersion", "authorityKind", "authorityId", "missionId", "operationId", "repositoryId", "planDigest", "featureAuthorityDigest", "terminalHeadRevision", "terminalTreeDigest",
  "transitionReceiptDigest", "requestCoreDigest", "commandIds", "targetIds", "validationIds", "effectKey", "maxAttempts", "maxRetries", "activeAuthorityJournalSequence", "activeAuthorityOperationSequence",
  "issuedAt", "expiresAt", "humanPrincipalId", "humanBindingId", "signingKeyRef", "authorityDigest"];
function cumulativeAuthorityV2(input: unknown): input is FeatureCumulativeValidationAuthorityV2 {
  return exactDataRecordV2(input, CUMULATIVE_AUTHORITY_FIELDS) && input.schemaVersion === 2 && input.authorityKind === "feature_cumulative_validation.v2" &&
    [input.authorityId, input.missionId, input.operationId, input.repositoryId, input.effectKey, input.humanPrincipalId, input.humanBindingId].every(identifierV2) &&
    [input.planDigest, input.featureAuthorityDigest, input.terminalTreeDigest, input.transitionReceiptDigest, input.requestCoreDigest, input.authorityDigest].every(digestValue) && revisionV2(input.terminalHeadRevision) &&
    stringArrayV2(input.commandIds, identifierV2, false) && stringArrayV2(input.targetIds, identifierV2, false) && stringArrayV2(input.validationIds, identifierV2, false) && input.maxAttempts === 1 && input.maxRetries === 0 &&
    safeInteger(input.activeAuthorityJournalSequence) && safeInteger(input.activeAuthorityOperationSequence) && utcV2(input.issuedAt) && utcV2(input.expiresAt) && Date.parse(input.issuedAt) < Date.parse(input.expiresAt) && keyRefV2(input.signingKeyRef);
}
function cumulativeCandidateV2(input: unknown): input is FeatureCumulativeValidationCandidateV2 {
  const fields = ["schemaVersion", "contractVersion", "operationId", "repositoryId", "planDigest", "featureAuthorityDigest", "cumulativeAuthorityDigest", "requestCoreDigest", "effectKey", "attemptId", "terminalHeadRevision", "terminalTreeDigest", "transitionReceiptDigest", "activeAuthorityJournalSequence", "activeAuthorityOperationSequence", "candidateDigest"];
  return exactDataRecordV2(input, fields) && input.schemaVersion === 2 && input.contractVersion === FEATURE_INTEGRATION_CONTRACT_VERSION_V2 &&
    [input.operationId, input.repositoryId, input.effectKey, input.attemptId].every(identifierV2) && revisionV2(input.terminalHeadRevision) &&
    [input.planDigest, input.featureAuthorityDigest, input.cumulativeAuthorityDigest, input.requestCoreDigest, input.terminalTreeDigest, input.transitionReceiptDigest, input.candidateDigest].every(digestValue) &&
    safeInteger(input.activeAuthorityJournalSequence) && safeInteger(input.activeAuthorityOperationSequence);
}

function signedObservationV2(input: unknown, kinds: readonly string[]): boolean {
  return signedEnvelopeV2(input, (payload) => observationPayloadV2(payload, kinds));
}
function observationPayloadV2(input: unknown, kinds: readonly string[]): boolean {
  if (!plain(input)) return false;
  const kind = ownData(input, "observationKind");
  if (typeof kind !== "string" || !kinds.includes(kind)) return false;
  const common = (fields: readonly string[], digestField = "observationDigest") => exactDataRecordV2(input, fields) && input.schemaVersion === 2 && input.contractVersion === "feature.integration.observation.v2" && digestValue(input[digestField]);
  if (kind === "workspace") {
    const fields = ["schemaVersion", "contractVersion", "observationKind", "operationId", "repositoryId", "requestId", "requestCoreDigest", "requestDigest", "preparationEntryDigest", "candidateDigest", "effectKey", "derivationKind", "targetRef", "targetBaseBranch", "expectedHeadRevision", "expectedTreeDigest", "status", "observedHeadRevision", "observedTreeDigest", "pullRequests", "signedChallenge", "producerId", "observedAt", "observationDigest"];
    const pulls = common(fields) && densePlainArrayV2(input.pullRequests, true);
    return !!pulls && [input.operationId, input.repositoryId, input.requestId, input.effectKey, input.targetRef, input.producerId].every(identifierV2) && [input.requestCoreDigest, input.requestDigest, input.preparationEntryDigest, input.candidateDigest].every(digestValue) &&
      ["feature_branch_create", "feature_workspace_draft_pr_create", "child_initiation", "child_draft_pr_create"].includes(input.derivationKind as string) && nullable(input.targetBaseBranch, branchV2) && revisionV2(input.expectedHeadRevision) && nullable(input.expectedTreeDigest, digestValue) &&
      ["applied", "not_applied", "uncertain"].includes(input.status as string) && nullable(input.observedHeadRevision, revisionV2) && nullable(input.observedTreeDigest, digestValue) &&
      pulls.every((pull) => exactDataRecordV2(pull, ["pullRequestId", "url", "draft", "headBranch", "headRevision", "baseBranch"]) && identifierV2(pull.pullRequestId) && text(pull.url) && typeof pull.draft === "boolean" && branchV2(pull.headBranch) && revisionV2(pull.headRevision) && branchV2(pull.baseBranch)) &&
      signedChallengeV2(input.signedChallenge, "workspace") && utcV2(input.observedAt);
  }
  if (kind === "transition") {
    const fields = ["schemaVersion", "contractVersion", "observationKind", "operationId", "repositoryId", "requestId", "requestCoreDigest", "requestDigest", "preparationEntryDigest", "candidateDigest", "effectKey", "pullRequestId", "expectedPullRequestHead", "targetFeatureRef", "integrationMethod", "priorHeadRevision", "priorTreeDigest", "observedPullRequestHead", "observedPullRequestBaseBranch", "observedIntegrationMethod", "pullRequestMerged", "pullRequestMergeRevision", "pullRequestCommitHeads", "conflictingPullRequestCount", "resultingCommitParents", "rebasedCommits", "checkState", "observedTargetHeadRevision", "observedTargetTreeDigest", "status", "signedChallenge", "producerId", "observedAt", "observationDigest"];
    const commits = common(fields) && densePlainArrayV2(input.rebasedCommits, true);
    return !!commits && [input.operationId, input.repositoryId, input.requestId, input.effectKey, input.pullRequestId, input.targetFeatureRef, input.producerId].every(identifierV2) &&
      [input.requestCoreDigest, input.requestDigest, input.preparationEntryDigest, input.candidateDigest, input.priorTreeDigest, input.observedTargetTreeDigest].every(digestValue) &&
      [input.expectedPullRequestHead, input.priorHeadRevision, input.observedPullRequestHead, input.observedTargetHeadRevision].every(revisionV2) && branchV2(input.observedPullRequestBaseBranch) &&
      ["merge_commit", "rebase_merge", "squash"].includes(input.integrationMethod as string) && nullable(input.observedIntegrationMethod, text) && typeof input.pullRequestMerged === "boolean" && nullable(input.pullRequestMergeRevision, revisionV2) &&
      stringArrayV2(input.pullRequestCommitHeads, revisionV2) && safeInteger(input.conflictingPullRequestCount) && stringArrayV2(input.resultingCommitParents, revisionV2) &&
      commits.every((item) => exactDataRecordV2(item, ["sourceCommit", "resultCommit", "parentCommit", "treeDigest"]) && [item.sourceCommit, item.resultCommit, item.parentCommit].every(revisionV2) && digestValue(item.treeDigest)) &&
      ["successful", "not_successful", "unknown"].includes(input.checkState as string) && ["applied", "not_applied", "uncertain"].includes(input.status as string) && signedChallengeV2(input.signedChallenge, "transition") && utcV2(input.observedAt);
  }
  if (kind === "admission") {
    const fields = ["schemaVersion", "contractVersion", "observationKind", "admissionKind", "operationId", "repositoryId", "targetRef", "activePlanDigest", "activeAuthorityDigest", "terminalHeadRevision", "terminalTreeDigest", "sourceLifecycle", "priorJournalDigest", "intendedEntrySequence", "effectiveExpiry", "observedAt", "signedChallenge", "producerId", "observationDigest"];
    return common(fields) && ["controller_snapshot", "final_gate", "completion", "pause", "resume", "cancel", "split", "supersede"].includes(input.admissionKind as string) &&
      [input.operationId, input.repositoryId, input.targetRef, input.sourceLifecycle, input.producerId].every(identifierV2) && [input.activePlanDigest, input.activeAuthorityDigest, input.terminalTreeDigest, input.priorJournalDigest].every(digestValue) &&
      revisionV2(input.terminalHeadRevision) && safeInteger(input.intendedEntrySequence) && utcV2(input.effectiveExpiry) && utcV2(input.observedAt) && signedChallengeV2(input.signedChallenge, "admission");
  }
  if (kind === "expiry") {
    const fields = ["schemaVersion", "contractVersion", "observationKind", "operationId", "repositoryId", "activePlanDigest", "activeAuthorityDigest", "sourceLifecycle", "priorJournalDigest", "intendedEntrySequence", "effectiveExpiry", "observedAt", "signedChallenge", "producerId", "observationDigest"];
    return common(fields) && [input.operationId, input.repositoryId, input.sourceLifecycle, input.producerId].every(identifierV2) && [input.activePlanDigest, input.activeAuthorityDigest, input.priorJournalDigest].every(digestValue) &&
      safeInteger(input.intendedEntrySequence) && utcV2(input.effectiveExpiry) && utcV2(input.observedAt) && signedChallengeV2(input.signedChallenge, "expiry");
  }
  const cumulativeFields: Record<string, readonly string[]> = {
    cumulative_registration: ["schemaVersion", "contractVersion", "observationKind", "operationId", "preparationEntryDigest", "attemptId", "requestDigest", "commandCount", "sourceRuntimeBindingDigest", "runtimeIdentity", "signedChallenge", "producerId", "registeredAt", "observationDigest"],
    cumulative_start: ["schemaVersion", "contractVersion", "observationKind", "operationId", "preparationEntryDigest", "attemptId", "requestDigest", "commandIndex", "commandId", "executableArgsDigest", "idempotencyKey", "registrationDigest", "priorRecordDigest", "producerId", "startedAt", "observationDigest"],
    cumulative_result: ["schemaVersion", "contractVersion", "observationKind", "operationId", "preparationEntryDigest", "attemptId", "requestDigest", "commandIndex", "commandId", "idempotencyKey", "startDigest", "status", "exitCode", "stdoutDigest", "stderrDigest", "cacheDisposition", "producerId", "finishedAt", "observationDigest"],
    cumulative_receipt: ["schemaVersion", "contractVersion", "observationKind", "operationId", "preparationEntryDigest", "attemptId", "requestDigest", "registrationDigest", "startDigests", "resultDigests", "idempotencyKeys", "completedPrefixLength", "invocationBounds", "terminalStatus", "notAppliedReason", "commands", "results", "signedChallenge", "producerId", "observedAt", "observationDigest"],
  };
  const fields = cumulativeFields[kind];
  if (!fields || !common(fields) || ![input.operationId, input.attemptId, input.producerId].every(identifierV2) || ![input.preparationEntryDigest, input.requestDigest].every(digestValue)) return false;
  if (kind === "cumulative_registration") return safeInteger(input.commandCount) && digestValue(input.sourceRuntimeBindingDigest) && exactDataRecordV2(input.runtimeIdentity, ["seatId", "reasoningRuntimeId", "modelId", "toolExecutorId"]) && input.runtimeIdentity.seatId === "may" && [input.runtimeIdentity.reasoningRuntimeId, input.runtimeIdentity.modelId, input.runtimeIdentity.toolExecutorId].every(identifierV2) && signedChallengeV2(input.signedChallenge, "cumulative") && utcV2(input.registeredAt);
  if (kind === "cumulative_start") return safeInteger(input.commandIndex) && identifierV2(input.commandId) && [input.executableArgsDigest, input.idempotencyKey, input.registrationDigest, input.priorRecordDigest].every(digestValue) && utcV2(input.startedAt);
  if (kind === "cumulative_result") return safeInteger(input.commandIndex) && identifierV2(input.commandId) && [input.idempotencyKey, input.startDigest].every(digestValue) && ["completed", "threw", "malformed"].includes(input.status as string) && (input.exitCode === null || Number.isSafeInteger(input.exitCode)) && nullable(input.stdoutDigest, digestValue) && nullable(input.stderrDigest, digestValue) && ["executed", "cache_hit", "unknown"].includes(input.cacheDisposition as string) && utcV2(input.finishedAt);
  const commands = densePlainArrayV2(input.commands, true), results = densePlainArrayV2(input.results, true);
  return !!commands && !!results && digestValue(input.registrationDigest) && stringArrayV2(input.startDigests, digestValue) && stringArrayV2(input.resultDigests, digestValue) && stringArrayV2(input.idempotencyKeys, digestValue) && safeInteger(input.completedPrefixLength) &&
    exactDataRecordV2(input.invocationBounds, ["minimum", "maximum"]) && safeInteger(input.invocationBounds.minimum) && safeInteger(input.invocationBounds.maximum) &&
    ["passed", "failed", "not_applied", "uncertain"].includes(input.terminalStatus as string) && (input.notAppliedReason === null || ["implementation_authority_inactive", "implementation_authority_mismatch", "execution_request_mismatch"].includes(input.notAppliedReason as string)) &&
    commands.every((item) => exactDataRecordV2(item, ["commandIndex", "commandId", "executableArgsDigest", "idempotencyKey"]) && safeInteger(item.commandIndex) && identifierV2(item.commandId) && digestValue(item.executableArgsDigest) && digestValue(item.idempotencyKey)) &&
    results.every((item) => exactDataRecordV2(item, ["commandIndex", "commandId", "startDigest", "resultDigest", "status", "exitCode", "stdoutDigest", "stderrDigest", "cacheDisposition"]) && safeInteger(item.commandIndex) && identifierV2(item.commandId) && [item.startDigest, item.resultDigest].every(digestValue) && ["completed", "threw", "malformed"].includes(item.status as string) && (item.exitCode === null || Number.isSafeInteger(item.exitCode)) && nullable(item.stdoutDigest, digestValue) && nullable(item.stderrDigest, digestValue) && ["executed", "cache_hit", "unknown"].includes(item.cacheDisposition as string)) &&
    signedChallengeV2(input.signedChallenge, "cumulative") && utcV2(input.observedAt);
}

function finalGatePayloadV2(input: unknown): boolean {
  const fields = ["schemaVersion", "contractVersion", "evidenceId", "operationId", "repositoryId", "activePlanDigest", "activeAuthorityDigest", "terminalHeadRevision", "terminalTreeDigest", "gateId", "seatId", "decision", "humanPrincipalId", "humanBindingId", "signingKeyRef", "featureJournalEntrySequence", "evidenceTime", "evidenceDigest"];
  return exactDataRecordV2(input, fields) && input.schemaVersion === 2 && input.contractVersion === "feature.integration.final-gate.v2" &&
    [input.evidenceId, input.operationId, input.repositoryId, input.gateId, input.humanPrincipalId, input.humanBindingId].every(identifierV2) && [input.activePlanDigest, input.activeAuthorityDigest, input.terminalTreeDigest, input.evidenceDigest].every(digestValue) &&
    revisionV2(input.terminalHeadRevision) && ["fitz", "simmons", "coulson"].includes(input.seatId as string) && input.decision === "approved" && keyRefV2(input.signingKeyRef) && safeInteger(input.featureJournalEntrySequence) && utcV2(input.evidenceTime);
}

function childEvidenceV2(input: unknown): input is FeatureChildEvidenceV2 {
  return exactDataRecordV2(input, ["schemaVersion", "evidenceId", "gateType", "gateId", "childId", "repositoryId", "headRevision", "sourceRecordDigest", "accepted", "synthetic"]) &&
    input.schemaVersion === 2 && identifierV2(input.evidenceId) && ["mack", "fury", "human", "check", "ci"].includes(input.gateType as string) &&
    [input.gateId, input.childId, input.repositoryId].every(identifierV2) && revisionV2(input.headRevision) && digestValue(input.sourceRecordDigest) &&
    typeof input.accepted === "boolean" && typeof input.synthetic === "boolean";
}

function entryPayloadShapeV2(kind: FeatureIntegrationEntryKindV2, input: unknown): boolean {
  if (!exactDataRecordV2(input, V2_ENTRY_PAYLOAD_FIELDS[kind])) return false;
  const p = input;
  const id = identifierV2, dig = digestValue, rev = revisionV2, br = branchV2;
  if (kind === "operation_genesis_accepted") return validateFeatureOperationReplayContextV2(p.replayContext).state === "valid" && validateFeatureOperationAuthorityV2(exactDataRecordV2(p.signedAuthority, ["payload", "signatureBase64"]) ? p.signedAuthority.payload : null).state === "valid" && signedEnvelopeV2(p.signedAuthority, (value) => validateFeatureOperationAuthorityV2(value).state === "valid") && !!normalizedProducerBindingsV2(p.trustedObservationProducerBindings) && !!normalizedHumanBindingsV2(p.trustedHumanBindings);
  if (kind === "authority_successor_accepted") return validateFeatureOperationPlanV2(p.plan).state === "valid" && signedEnvelopeV2(p.signedAuthority, (value) => validateFeatureOperationAuthorityV2(value).state === "valid");
  if (kind === "effect_prepared") {
    if (!plain(p.candidate) || !plain(p.request)) return false;
    const candidate = validateFeatureOperationDerivedCandidateV2(p.candidate).state === "valid" || cumulativeCandidateV2(p.candidate);
    const request = effectRequestV2(p.request) && (p.effectClass !== "transition" || exactTransitionRequestV2(p.request as FeatureTransitionRequestV2));
    return ["workspace", "transition", "cumulative"].includes(p.effectClass as string) && candidate && request && dig(p.candidateDigest) && p.candidateDigest === p.candidate.candidateDigest && id(p.effectKey) && p.effectKey === p.candidate.effectKey && dig(p.requestDigest) && p.requestDigest === p.request.requestDigest && rev(p.expectedHeadRevision) && dig(p.expectedTreeDigest) && (p.effectClass === "cumulative" ? signedEnvelopeV2(p.signedCumulativeAuthority, cumulativeAuthorityV2) : p.signedCumulativeAuthority === null);
  }
  if (kind === "effect_challenge_refreshed") return dig(p.preparationEntryDigest) && signedChallengeV2(p.signedChallenge);
  if (kind === "effect_not_applied" || kind === "effect_uncertain") return dig(p.preparationEntryDigest) && signedObservationV2(p.signedObservation, ["workspace", "transition", "cumulative_receipt"]);
  if (kind === "feature_branch_creation_accepted") return dig(p.preparationEntryDigest) && rev(p.headRevision) && dig(p.treeDigest) && signedObservationV2(p.signedWorkspaceObservation, ["workspace"]);
  if (kind === "feature_workspace_accepted" || kind === "child_publication_accepted") return dig(p.preparationEntryDigest) && (kind !== "child_publication_accepted" || id(p.childId)) && id(p.pullRequestId) && br(p.sourceBranch) && br(p.targetBranch) && rev(p.headRevision) && p.draft === true && signedObservationV2(p.signedWorkspaceObservation, ["workspace"]);
  if (kind === "child_initiation_accepted") return dig(p.preparationEntryDigest) && id(p.childId) && br(p.branch) && rev(p.baseHeadRevision) && dig(p.baseTreeDigest) && signedObservationV2(p.signedWorkspaceObservation, ["workspace"]);
  if (kind === "child_implementation_accepted") return [p.childId, p.sourceMissionId, p.effectKey].every(id) && [p.sourceAuthorityDigest, p.sourceJournalDigest, p.completionReceiptDigest, p.treeDigest].every(dig) && rev(p.headRevision);
  if (kind === "child_evidence_accepted") { const ids = densePlainArrayV2(p.evidenceIds, false), digs = densePlainArrayV2(p.evidenceDigests, false), records = densePlainArrayV2(p.evidenceRecords, false); return id(p.childId) && rev(p.headRevision) && !!ids && ids.every(id) && !!digs && digs.every(dig) && !!records && records.every(childEvidenceV2); }
  if (kind === "integration_accepted" || kind === "rollback_accepted") return dig(p.preparationEntryDigest) && signedObservationV2(p.signedTransitionObservation, ["transition"]);
  if (kind === "rollback_workspace_accepted") return [p.childId, p.sourceMissionId, p.pullRequestId].every(id) && [p.completionReceiptDigest, p.sourceAuthorityDigest, p.sourceJournalDigest, p.restoredTreeDigest].every(dig) && br(p.rollbackBranch) && rev(p.pullRequestHeadRevision) && br(p.targetBranch) && stringArrayV2(p.sourceEffectKeys, id, false) && stringArrayV2(p.evidenceDigests, dig, false);
  if (kind === "cumulative_validation_accepted" || kind === "cumulative_validation_failed") return dig(p.preparationEntryDigest) && signedObservationV2(p.signedCumulativeReceipt, ["cumulative_receipt"]);
  if (kind === "operation_paused" || kind === "operation_resumed" || kind === "operation_cancelled") return ["operator_requested", "dependency_blocked", "scope_superseded"].includes(p.reason as string) && signedObservationV2(p.signedAdmissionObservation, ["admission"]);
  if (kind === "operation_split" || kind === "operation_superseded") return signedObservationV2(p.signedAdmissionObservation, ["admission"]) && id(p.successorOperationId) && dig(p.successorPlanDigest) && dig(p.successorAuthorityDigest);
  if (kind === "operation_completed") return signedObservationV2(p.signedAdmissionObservation, ["admission"]);
  if (kind === "final_gate_evidence_accepted") return signedEnvelopeV2(p.signedEvidence, finalGatePayloadV2) && signedObservationV2(p.signedAdmissionObservation, ["admission"]);
  return kind === "operation_expired" && signedObservationV2(p.signedExpiryObservation, ["expiry"]);
}

function densePlainArrayV2(value: unknown, allowEmpty: boolean, maximum = 512): unknown[] | null {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      !Number.isSafeInteger(value.length) || value.length < (allowEmpty ? 0 : 1) || value.length > maximum ||
      Reflect.ownKeys(value).length !== value.length + 1) return null;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
  }
  return [...value];
}

function canonicalBase64V2(value: unknown): value is string {
  return typeof value === "string" && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value) &&
    Buffer.from(value, "base64").toString("base64") === value;
}

function exactDataRecordV2(input: unknown, fields: readonly string[]): input is Record<string, unknown> {
  if (!plain(input) || Reflect.ownKeys(input).length !== fields.length) return false;
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
  }
  return true;
}

function immutableCloneV2<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item !== null && typeof item === "object" && !Object.isFrozen(item)) {
      for (const key of Reflect.ownKeys(item)) freeze((item as Record<PropertyKey, unknown>)[key]);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy;
}

function framedDigestV2(domain: string, value: unknown, ownDigest?: string): string {
  if (ownDigest && !plain(value)) throw new TypeError("V2 own-digest input must be a plain record.");
  const copy = structuredClone(value) as unknown;
  if (ownDigest) delete (copy as Record<string, unknown>)[ownDigest];
  const hash = createHash("sha256");
  hash.update(domain, "ascii"); hash.update(Buffer.from([0])); hash.update(canonicalFeatureIntegrationJsonV1(copy), "utf8");
  return `sha256:${hash.digest("hex")}`;
}

function normalizedProducerBindingsV2(input: unknown): FeatureObservationProducerBindingV2[] | null {
  const items = densePlainArrayV2(input, false, 2);
  if (!items || items.length !== 2) return null;
  const result: FeatureObservationProducerBindingV2[] = [];
  for (const raw of items) {
    if (!exactDataRecordV2(raw, ["schemaVersion", "producerId", "producerKind", "publicKeySpkiBase64", "signingKeyRef"])) return null;
    const binding = raw as unknown as FeatureObservationProducerBindingV2;
    if (binding.schemaVersion !== 2 || !identifierV2(binding.producerId) || !["github_repository", "cumulative_execution"].includes(binding.producerKind) ||
        !canonicalBase64V2(binding.publicKeySpkiBase64) || !keyRefV2(binding.signingKeyRef)) return null;
    try { if (computeEd25519SigningKeyRef(binding.publicKeySpkiBase64) !== binding.signingKeyRef) return null; }
    catch { return null; }
    result.push(structuredClone(binding));
  }
  if (new Set(result.map((item) => item.producerId)).size !== 2 || new Set(result.map((item) => item.producerKind)).size !== 2) return null;
  return result.sort((left, right) => compareUtf16(left.producerKind, right.producerKind) || compareUtf16(left.producerId, right.producerId));
}

function normalizedHumanBindingsV2(input: unknown, sourceSequence?: number, missionId?: string, simmonsRequired?: boolean): TrustedHumanBinding[] | null {
  const items = densePlainArrayV2(input, false, 3);
  if (!items || items.length < 2 || items.length > 3) return null;
  const registry = validateTrustedBindingRegistry({ schemaVersion: 1, bindings: items });
  if (registry.state !== "valid") return null;
  const result: TrustedHumanBinding[] = [];
  for (const raw of items) {
    if (!exactDataRecordV2(raw, ["schemaVersion", "bindingId", "humanPrincipalId", "seatId", "missionScope", "signingKeyRef", "publicKeySpkiBase64", "validFromSequence", "validThroughSequence", "attestedBy", "provenanceRef"])) return null;
    const binding = raw as unknown as TrustedHumanBinding;
    if (binding.schemaVersion !== 1 || ![binding.bindingId, binding.humanPrincipalId, binding.attestedBy, binding.provenanceRef].every(identifierV2) ||
        !keyRefV2(binding.signingKeyRef) || !["coulson", "fitz", "simmons"].includes(binding.seatId) || !(binding.missionScope === "*" || identifierV2(binding.missionScope)) ||
        !canonicalBase64V2(binding.publicKeySpkiBase64) || !safeInteger(binding.validFromSequence) ||
        !(binding.validThroughSequence === null || safeInteger(binding.validThroughSequence)) ||
        (typeof binding.validThroughSequence === "number" && binding.validThroughSequence < binding.validFromSequence)) return null;
    if (sourceSequence !== undefined && (binding.validFromSequence > sourceSequence ||
        (binding.validThroughSequence !== null && sourceSequence > binding.validThroughSequence))) return null;
    if (missionId !== undefined && binding.missionScope !== "*" && binding.missionScope !== missionId) return null;
    try { if (computeEd25519SigningKeyRef(binding.publicKeySpkiBase64) !== binding.signingKeyRef) return null; }
    catch { return null; }
    result.push(structuredClone(binding));
  }
  const seats = result.map((item) => item.seatId);
  if (new Set(seats).size !== result.length || new Set(result.map((item) => item.bindingId)).size !== result.length ||
      !seats.includes("coulson") || !seats.includes("fitz") ||
      (simmonsRequired === true) !== seats.includes("simmons") && simmonsRequired !== undefined) return null;
  return result.sort((left, right) => compareUtf16(left.seatId, right.seatId) || compareUtf16(left.humanPrincipalId, right.humanPrincipalId) || compareUtf16(left.bindingId, right.bindingId));
}

export function computeFeatureObservationProducerBindingsDigestV2(input: unknown): string {
  const bindings = normalizedProducerBindingsV2(input);
  if (!bindings) throw new TypeError("Feature observation producer bindings are invalid.");
  return framedDigestV2(FEATURE_OBSERVATION_BINDINGS_DOMAIN_V2, bindings);
}
export const computeFeatureIntegrationObservationProducerBindingsDigestV2 = computeFeatureObservationProducerBindingsDigestV2;

export function computeFeatureHumanBindingsDigestV2(input: unknown): string {
  const bindings = normalizedHumanBindingsV2(input);
  if (!bindings) throw new TypeError("Feature human bindings are invalid.");
  return framedDigestV2(FEATURE_HUMAN_BINDINGS_DOMAIN_V2, bindings);
}
export const computeFeatureIntegrationHumanBindingsDigestV2 = computeFeatureHumanBindingsDigestV2;

export function computeFeatureIntegrationEntryDigestV2(input: unknown): string {
  const entry = entryShapeV2(input, false);
  if (!entry) throw new TypeError("Feature integration V2 entry is invalid.");
  return framedDigestV2(FEATURE_INTEGRATION_ENTRY_DOMAIN_V2, entry, "entryDigest");
}
export function computeFeatureIntegrationJournalDigestV2(input: unknown): string {
  if (!plain(input)) throw new TypeError("Feature integration V2 journal is invalid.");
  return framedDigestV2(FEATURE_INTEGRATION_JOURNAL_DOMAIN_V2, input, "journalDigest");
}

function entryShapeV2(input: unknown, ownDigest = true): FeatureOperationJournalEntryV2 | null {
  if (!exactDataRecordV2(input, ["schemaVersion", "contractVersion", "operationId", "entrySequence", "entryKind", "previousEntryDigest", "payload", "entryDigest"])) return null;
  const entry = input as unknown as FeatureOperationJournalEntryV2;
  if (entry.schemaVersion !== 2 || entry.contractVersion !== FEATURE_INTEGRATION_CONTRACT_VERSION_V2 || !text(entry.operationId) || !safeInteger(entry.entrySequence) ||
      !FEATURE_INTEGRATION_ENTRY_KINDS_V2.includes(entry.entryKind) || !(entry.previousEntryDigest === null || digestValue(entry.previousEntryDigest)) ||
      !entryPayloadShapeV2(entry.entryKind, entry.payload) || !digestValue(entry.entryDigest)) return null;
  if (ownDigest && framedDigestV2(FEATURE_INTEGRATION_ENTRY_DOMAIN_V2, entry, "entryDigest") !== entry.entryDigest) return null;
  return structuredClone(entry);
}

export function createFeatureIntegrationEntryV2(input: Omit<FeatureOperationJournalEntryV2, "schemaVersion" | "contractVersion" | "entryDigest">): FeatureOperationJournalEntryV2 {
  const entry = { schemaVersion: 2 as const, contractVersion: FEATURE_INTEGRATION_CONTRACT_VERSION_V2, ...structuredClone(input), entryDigest: `sha256:${"0".repeat(64)}` };
  entry.entryDigest = framedDigestV2(FEATURE_INTEGRATION_ENTRY_DOMAIN_V2, entry, "entryDigest");
  const checked = entryShapeV2(entry);
  if (!checked) throw new TypeError("Feature integration V2 entry input is invalid.");
  return immutableCloneV2(checked);
}

export function createFeatureOperationJournalV2(entriesInput: readonly FeatureOperationJournalEntryV2[]): FeatureOperationJournalV2 {
  const raw = densePlainArrayV2(entriesInput, false);
  if (!raw) throw new TypeError("Feature integration V2 journal requires genesis.");
  const entries = raw.map((entry) => entryShapeV2(entry));
  if (entries.some((entry) => !entry)) throw new TypeError("Feature integration V2 journal entry is invalid.");
  const checked = entries as FeatureOperationJournalEntryV2[];
  for (let index = 0; index < checked.length; index += 1) {
    if (checked[index].entrySequence !== index || checked[index].operationId !== checked[0].operationId ||
        checked[index].previousEntryDigest !== (index === 0 ? null : checked[index - 1].entryDigest)) throw new TypeError("Feature integration V2 journal lineage is invalid.");
  }
  const journal = { schemaVersion: 2 as const, contractVersion: FEATURE_INTEGRATION_CONTRACT_VERSION_V2,
    operationId: checked[0].operationId, genesisDigest: checked[0].entryDigest,
    latestAcceptedEntryDigest: checked.at(-1)!.entryDigest, entries: checked,
    journalDigest: `sha256:${"0".repeat(64)}` };
  journal.journalDigest = framedDigestV2(FEATURE_INTEGRATION_JOURNAL_DOMAIN_V2, journal, "journalDigest");
  return immutableCloneV2(journal);
}

export function validateFeatureOperationJournalV2(input: unknown): ContractResult<FeatureOperationJournalV2> {
  try {
    if (!exactDataRecordV2(input, ["schemaVersion", "contractVersion", "operationId", "genesisDigest", "latestAcceptedEntryDigest", "entries", "journalDigest"]) ||
        input.schemaVersion !== 2 || input.contractVersion !== FEATURE_INTEGRATION_CONTRACT_VERSION_V2 || !text(input.operationId) ||
        ![input.genesisDigest, input.latestAcceptedEntryDigest, input.journalDigest].every(digestValue)) return invalid("journal_invalid", "Feature integration V2 journal is invalid.");
    const journal = createFeatureOperationJournalV2(input.entries as FeatureOperationJournalEntryV2[]);
    return canonicalFeatureIntegrationJsonV1(journal) === canonicalFeatureIntegrationJsonV1(input) ? valid(journal) : invalid("journal_invalid", "Feature integration V2 journal is not canonical.");
  } catch { return invalid("journal_invalid", "Feature integration V2 journal is invalid."); }
}

function checkedTrustAnchorV2(input: unknown): FeatureIntegrationTrustAnchorV2 | null {
  if (!exactDataRecordV2(input, ["missionId", "repositoryId", "humanBindingsDigest", "trustedHumanBindings", "sourceBindingSequence", "sourceImplementationAuthority", "sourceImplementationAuthorityDigest", "sourceRuntimeBinding", "sourceJournalDigest"])) return null;
  const value = input as unknown as FeatureIntegrationTrustAnchorV2;
  if (!identifierV2(value.missionId) || !identifierV2(value.repositoryId) || !digestValue(value.humanBindingsDigest) || !digestValue(value.sourceJournalDigest) ||
      typeof value.sourceImplementationAuthorityDigest !== "string" || !/^sha256:(?:[A-Za-z0-9_-]{43}|[a-f0-9]{64})$/u.test(value.sourceImplementationAuthorityDigest) ||
      !safeInteger(value.sourceBindingSequence)) return null;
  const humans = normalizedHumanBindingsV2(value.trustedHumanBindings, value.sourceBindingSequence, value.missionId);
  const authority = validateImplementationAuthorityV1(value.sourceImplementationAuthority);
  const runtime = validateSchema9RuntimeBindingV1(value.sourceRuntimeBinding);
  if (!humans || computeFeatureHumanBindingsDigestV2(humans) !== value.humanBindingsDigest || authority.state !== "valid" || runtime.state !== "valid" ||
      computeImplementationAuthorityDigest(authority.value) !== value.sourceImplementationAuthorityDigest || authority.value.missionId !== value.missionId ||
      authority.value.repositoryId !== value.repositoryId || runtime.value.implementationAuthorityRef !== authority.value.authorityRef ||
      runtime.value.implementationAuthorityDigest !== value.sourceImplementationAuthorityDigest || runtime.value.implementationAuthoritySequence !== authority.value.journalSequence) return null;
  const binding = runtime.value.binding;
  const exact = (left: unknown, right: unknown) => canonicalFeatureIntegrationJsonV1(left) === canonicalFeatureIntegrationJsonV1(right);
  if (binding.lifecycleState !== "active" || binding.recordedAtSequence > value.sourceBindingSequence ||
      (binding.activeThroughSequence !== null && value.sourceBindingSequence > binding.activeThroughSequence) ||
      binding.missionId !== authority.value.missionId || binding.subjectId !== authority.value.subjectId ||
      binding.missionRevisionId !== authority.value.missionRevisionId || binding.seatId !== authority.value.seatId ||
      binding.repositoryId !== authority.value.repositoryId || binding.canonicalWritableRoot !== authority.value.canonicalWritableRoot ||
      binding.branch !== authority.value.branch || binding.artifactRevisionId !== authority.value.artifactRevisionId ||
      runtime.value.modelId !== authority.value.modelId || runtime.value.baseRevision !== authority.value.baseRevision ||
      runtime.value.headRevision !== authority.value.headRevision || !exact(runtime.value.approvedRelativePaths, authority.value.approvedRelativePaths) ||
      !exact(runtime.value.validationCommandIds, authority.value.validationCommandIds) ||
      !exact(binding.approvedScope.actionIds, authority.value.approvedActionIds) ||
      !exact(binding.approvedScope.effectClasses, authority.value.approvedEffectClasses) ||
      !exact(binding.approvedScope.effectKeys, authority.value.approvedEffectKeys) ||
      !exact(binding.approvedScope.capabilities, authority.value.approvedCapabilities) ||
      new Set([binding.seatId, binding.reasoningRuntimeId, runtime.value.modelId, binding.toolExecutorId]).size !== 4) return null;
  return immutableCloneV2({ ...value, sourceImplementationAuthority: authority.value, sourceRuntimeBinding: runtime.value, trustedHumanBindings: humans });
}

function replayInvalidV2(reason: FeatureIntegrationReplayReasonV2, entrySequence: number | null): FeatureIntegrationReplayResultV2 {
  return { state: "invalid", reason, entrySequence };
}

function journalEnvelopeV2(input: unknown): { journal: Record<string, unknown>; entries: unknown[] } | null {
  if (!exactDataRecordV2(input, ["schemaVersion", "contractVersion", "operationId", "genesisDigest", "latestAcceptedEntryDigest", "entries", "journalDigest"]) ||
      input.schemaVersion !== 2 || input.contractVersion !== FEATURE_INTEGRATION_CONTRACT_VERSION_V2 || !text(input.operationId) ||
      ![input.genesisDigest, input.latestAcceptedEntryDigest, input.journalDigest].every(digestValue)) return null;
  const entries = densePlainArrayV2(input.entries, false);
  return entries ? { journal: input, entries } : null;
}

function verifyGenesisFeatureAuthorityV2(
  envelopeInput: unknown,
  anchor: FeatureIntegrationTrustAnchorV2,
  operationId: string,
): FeatureOperationAuthorityV2 | null {
  if (!exactDataRecordV2(envelopeInput, ["payload", "signatureBase64"]) || !canonicalBase64V2(envelopeInput.signatureBase64) ||
      Buffer.from(envelopeInput.signatureBase64, "base64").length !== 64) return null;
  const authorityResult = validateFeatureOperationAuthorityV2(envelopeInput.payload);
  if (authorityResult.state !== "valid") return null;
  const authority = authorityResult.value;
  if (authority.missionId !== anchor.missionId || authority.operationId !== operationId || authority.operationSequence !== 0 || authority.journalSequence !== 0) return null;
  const matches = anchor.trustedHumanBindings.filter((binding) => binding.seatId === "coulson" && binding.bindingId === authority.humanBindingId &&
    binding.humanPrincipalId === authority.humanPrincipalId && binding.signingKeyRef === authority.signingKeyRef &&
    (binding.missionScope === "*" || binding.missionScope === anchor.missionId));
  if (matches.length !== 1) return null;
  try {
    const key = createPublicKey({ key: Buffer.from(matches[0].publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    const bytes = Buffer.concat([Buffer.from("shield.feature-operation.authority-signature.v2", "ascii"), Buffer.from([0]), Buffer.from(canonicalFeatureIntegrationJsonV1(authority), "utf8")]);
    return verify(null, bytes, key, Buffer.from(envelopeInput.signatureBase64, "base64")) ? structuredClone(authority) : null;
  } catch { return null; }
}

function authorityExactlyActivatesReplayV2(authority: FeatureOperationAuthorityV2, replay: FeatureOperationReplayContextV2): boolean {
  const lineage = replay.acceptedPlanLineage;
  const genesisTransition = replay.transitions[0];
  const observed = Date.parse(replay.observedAt.value);
  return authority.repositoryId === replay.repositoryId && authority.operationId === replay.operationId &&
    authority.planDigest === replay.activePlanDigest && canonicalFeatureIntegrationJsonV1(authority.plan) === canonicalFeatureIntegrationJsonV1(replay.activePlan) &&
    authority.authorityId === replay.verifiedAuthorityId && authority.authorityDigest === replay.verifiedAuthorityDigest &&
    authority.operationSequence === 0 && authority.journalSequence === 0 && replay.acceptedAuthorityOperationSequence === 0 && replay.currentJournalSequence === 0 &&
    replay.activePlan.baseBranch === "main" && replay.activePlan.planSequence === 0 && replay.activePlan.predecessorPlanDigest === null &&
    replay.acceptedAmendmentDigests.length === 0 && lineage.length === 1 && lineage[0].planSequence === 0 &&
    lineage[0].planDigest === authority.planDigest && lineage[0].predecessorPlanDigest === null && lineage[0].authorityDigest === authority.authorityDigest && lineage[0].active === true &&
    replay.lifecycle.state === "active" && replay.lifecycle.atOperationSequence === 0 && replay.transitions.length === 1 && genesisTransition?.kind === "genesis" && genesisTransition.operationSequence === 0 &&
    replay.acceptedIntegrations.length === 0 && replay.acceptedRollbacks.length === 0 &&
    observed >= Date.parse(authority.issuedAt) && observed < Date.parse(authority.expiresAt) && observed < Date.parse(authority.plan.expiresAt);
}

function verifyProducerEnvelopeV2(
  envelope: unknown,
  binding: FeatureObservationProducerBindingV2,
  domain: string,
  digest: (payload: unknown) => string,
): Record<string, unknown> | null {
  if (!exactDataRecordV2(envelope, ["payload", "signatureBase64"]) || !canonicalBase64V2(envelope.signatureBase64) ||
      Buffer.from(envelope.signatureBase64, "base64").length !== 64 || !plain(envelope.payload)) return null;
  try {
    if (digest(envelope.payload) !== envelope.payload.observationDigest && digest(envelope.payload) !== envelope.payload.challengeDigest) return null;
    const key = createPublicKey({ key: Buffer.from(binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    const bytes = Buffer.concat([Buffer.from(domain, "ascii"), Buffer.from([0]), Buffer.from(canonicalFeatureIntegrationJsonV1(envelope.payload), "utf8")]);
    return verify(null, bytes, key, Buffer.from(envelope.signatureBase64, "base64")) ? structuredClone(envelope.payload) : null;
  } catch { return null; }
}

function verifyChallengeEnvelopeV2(envelope: unknown, binding: FeatureObservationProducerBindingV2): FeatureObservationChallengeV2 | null {
  if (!signedChallengeV2(envelope)) return null;
  const kind = (envelope as SignedFeatureObservationChallengeV2).payload.challengeKind;
  const payload = verifyProducerEnvelopeV2(envelope, binding, `shield.feature-integration.challenge.v2:${kind}`, computeFeatureObservationChallengeDigestV2);
  return payload ? payload as unknown as FeatureObservationChallengeV2 : null;
}

function verifyTransitionEnvelopeV2(envelope: unknown, binding: FeatureObservationProducerBindingV2): FeatureTransitionObservationV2 | null {
  if (!signedObservationV2(envelope, ["transition"])) return null;
  const payload = verifyProducerEnvelopeV2(envelope, binding, FEATURE_TRANSITION_OBSERVATION_DOMAIN_V2, computeFeatureTransitionObservationDigestV2);
  return payload ? payload as unknown as FeatureTransitionObservationV2 : null;
}

function verifyCumulativeReceiptEnvelopeV2(envelope: unknown, binding: FeatureObservationProducerBindingV2): FeatureCumulativeReceiptObservationV2 | null {
  if (!signedObservationV2(envelope, ["cumulative_receipt"])) return null;
  const payload = verifyProducerEnvelopeV2(envelope, binding, FEATURE_CUMULATIVE_RECEIPT_OBSERVATION_DOMAIN_V2, computeFeatureCumulativeReceiptObservationDigestV2);
  return payload ? payload as unknown as FeatureCumulativeReceiptObservationV2 : null;
}

function verifyCumulativeAuthorityEnvelopeV2(envelope: unknown, bindings: readonly TrustedHumanBinding[]): FeatureCumulativeValidationAuthorityV2 | null {
  if (!exactDataRecordV2(envelope, ["payload", "signatureBase64"]) || !cumulativeAuthorityV2(envelope.payload) ||
      !canonicalBase64V2(envelope.signatureBase64) || Buffer.from(envelope.signatureBase64, "base64").length !== 64) return null;
  const authority = envelope.payload as unknown as FeatureCumulativeValidationAuthorityV2;
  if (computeFeatureCumulativeAuthorityDigestV2(authority) !== authority.authorityDigest) return null;
  const binding = bindings.find((item) => item.bindingId === authority.humanBindingId && item.humanPrincipalId === authority.humanPrincipalId &&
    item.signingKeyRef === authority.signingKeyRef && item.seatId === "coulson");
  if (!binding) return null;
  try {
    const key = createPublicKey({ key: Buffer.from(binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    const bytes = Buffer.concat([Buffer.from(FEATURE_CUMULATIVE_AUTHORITY_SIGNATURE_DOMAIN_V2, "ascii"), Buffer.from([0]),
      Buffer.from(canonicalFeatureIntegrationJsonV1(authority), "utf8")]);
    return verify(null, bytes, key, Buffer.from(envelope.signatureBase64, "base64")) ? structuredClone(authority) : null;
  } catch { return null; }
}

function exactTransitionRequestV2(request: FeatureTransitionRequestV2): boolean {
  try {
    return computeFeatureTransitionRequestCoreDigestV2(request) === request.requestCoreDigest &&
      computeFeatureTransitionRequestDigestV2(request) === request.requestDigest;
  } catch { return false; }
}

function exactCumulativeRequestV2(request: FeatureCumulativeRequestV2): boolean {
  try {
    return computeFeatureCumulativeRequestCoreDigestV2(request) === request.requestCoreDigest &&
      computeFeatureCumulativeRequestDigestV2(request) === request.requestDigest;
  } catch { return false; }
}

function exactCumulativeCandidateV2(candidate: FeatureCumulativeValidationCandidateV2): boolean {
  try { return computeFeatureCumulativeCandidateDigestV2(candidate) === candidate.candidateDigest; }
  catch { return false; }
}

function challengeMatchesPreparationV2(
  challenge: FeatureObservationChallengeV2,
  request: FeatureTransitionRequestV2,
  candidate: FeatureOperationDerivedCandidateV2,
  entry: FeatureOperationJournalEntryV2,
  previousJournalDigest: string,
): boolean {
  return challenge.challengeKind === "transition" && challenge.operationId === request.operationId && challenge.repositoryId === request.repositoryId &&
    challenge.requestId === request.requestId && challenge.requestCoreDigest === request.requestCoreDigest && challenge.candidateDigest === candidate.candidateDigest &&
    challenge.effectKey === candidate.effectKey && challenge.producerKind === "github_repository" && challenge.generation === 0 &&
    challenge.previousJournalDigest === previousJournalDigest && challenge.intendedEntrySequence === entry.entrySequence &&
    challenge.preparationEntryDigest === null && challenge.priorChallengeDigest === null && challenge.priorObservationDigest === null &&
    challenge.expectedHeadRevision === (entry.payload as unknown as Record<string, unknown>).expectedHeadRevision &&
    challenge.expectedTreeDigest === (entry.payload as unknown as Record<string, unknown>).expectedTreeDigest;
}

function challengeMatchesObservationV2(
  challenge: FeatureObservationChallengeV2,
  pending: FeatureIntegrationPendingEffectV2,
  observation: FeatureTransitionObservationV2,
  latestObservedAt: string,
): boolean {
  const challenges = pending.signedChallenges;
  const latest = challenges.at(-1)?.payload;
  const previous = challenges.at(-2)?.payload;
  if (!latest || challenge.challengeDigest !== latest.challengeDigest || challenge.challengeKind !== "transition" ||
      challenge.operationId !== observation.operationId || challenge.repositoryId !== observation.repositoryId ||
      challenge.requestId !== observation.requestId || challenge.requestCoreDigest !== observation.requestCoreDigest || challenge.candidateDigest !== pending.candidateDigest ||
      challenge.effectKey !== pending.effectKey || challenge.producerKind !== "github_repository" || challenge.producerId !== observation.producerId ||
      challenge.expectedHeadRevision !== pending.request.priorHeadRevision || challenge.expectedTreeDigest !== pending.request.priorTreeDigest ||
      Date.parse(observation.observedAt) < Date.parse(challenge.issuedAt) || Date.parse(observation.observedAt) >= Date.parse(challenge.expiresAt) ||
      Date.parse(observation.observedAt) < Date.parse(latestObservedAt)) return false;
  if (challenge.generation === 0) return pending.latestObservationDigest === null && challenges.length === 1 &&
    challenge.preparationEntryDigest === null && challenge.priorChallengeDigest === null && challenge.priorObservationDigest === null;
  return challenges.length > 1 && previous !== undefined && challenge.generation === previous.generation + 1 &&
    challenge.preparationEntryDigest === pending.preparationEntryDigest && challenge.priorChallengeDigest === previous.challengeDigest &&
    challenge.priorObservationDigest === pending.latestObservationDigest;
}

function cumulativeChallengeMatchesPreparationV2(
  challenge: FeatureObservationChallengeV2,
  request: FeatureCumulativeRequestV2,
  candidate: FeatureCumulativeValidationCandidateV2,
  entry: FeatureOperationJournalEntryV2,
  previousJournalDigest: string,
): boolean {
  return challenge.challengeKind === "cumulative" && challenge.operationId === request.operationId && challenge.repositoryId === request.repositoryId &&
    challenge.requestId === request.requestId && challenge.requestCoreDigest === request.requestCoreDigest && challenge.candidateDigest === candidate.candidateDigest &&
    challenge.effectKey === candidate.effectKey && challenge.producerKind === "cumulative_execution" && challenge.generation === 0 &&
    challenge.previousJournalDigest === previousJournalDigest && challenge.intendedEntrySequence === entry.entrySequence &&
    challenge.preparationEntryDigest === null && challenge.priorChallengeDigest === null && challenge.priorObservationDigest === null &&
    challenge.expectedHeadRevision === (entry.payload as FeatureIntegrationEntryPayloadMapV2["effect_prepared"]).expectedHeadRevision &&
    challenge.expectedTreeDigest === (entry.payload as FeatureIntegrationEntryPayloadMapV2["effect_prepared"]).expectedTreeDigest;
}

function cumulativeReceiptIdentityV2(
  observation: FeatureCumulativeReceiptObservationV2,
  pending: FeatureIntegrationPendingEffectV2,
  latestObservedAt: string,
): boolean {
  const request = pending.request as unknown as FeatureCumulativeRequestV2;
  const challenge = observation.signedChallenge.payload;
  if (observation.operationId !== request.operationId || observation.preparationEntryDigest !== pending.preparationEntryDigest ||
      observation.attemptId !== request.attemptId || observation.requestDigest !== request.requestDigest || observation.producerId !== challenge.producerId ||
      challenge.challengeKind !== "cumulative" || challenge.challengeDigest !== pending.signedChallenges.at(-1)?.payload.challengeDigest ||
      challenge.requestId !== request.requestId || challenge.requestCoreDigest !== request.requestCoreDigest || challenge.candidateDigest !== pending.candidateDigest ||
      challenge.effectKey !== pending.effectKey || challenge.expectedHeadRevision !== request.terminalHeadRevision || challenge.expectedTreeDigest !== request.terminalTreeDigest ||
      Date.parse(observation.observedAt) < Date.parse(challenge.issuedAt) || Date.parse(observation.observedAt) >= Date.parse(challenge.expiresAt) ||
      Date.parse(observation.observedAt) < Date.parse(latestObservedAt) || observation.commands.length !== request.commands.length ||
      observation.results.length !== request.commands.length || observation.completedPrefixLength !== request.commands.length ||
      observation.startDigests.length !== request.commands.length || observation.resultDigests.length !== request.commands.length ||
      observation.idempotencyKeys.length !== request.commands.length || observation.invocationBounds.minimum !== request.commands.length ||
      observation.invocationBounds.maximum !== request.commands.length) return false;
  for (let index = 0; index < request.commands.length; index += 1) {
    const command = request.commands[index], observedCommand = observation.commands[index], result = observation.results[index];
    if (observedCommand.commandIndex !== index || observedCommand.commandId !== command.commandId ||
        observedCommand.executableArgsDigest !== command.executableArgsDigest || observedCommand.idempotencyKey !== command.idempotencyKey ||
        result.commandIndex !== index || result.commandId !== command.commandId || result.startDigest !== observation.startDigests[index] ||
        result.resultDigest !== observation.resultDigests[index] || observedCommand.idempotencyKey !== observation.idempotencyKeys[index]) return false;
  }
  const completed = observation.results.every((result) => result.status === "completed" && result.exitCode !== null);
  return completed && (observation.terminalStatus !== "passed" || observation.results.every((result) => result.exitCode === 0)) &&
    (observation.terminalStatus !== "failed" || observation.results.some((result) => result.exitCode !== 0));
}

function transitionObservationIdentityV2(observation: FeatureTransitionObservationV2, pending: FeatureIntegrationPendingEffectV2): boolean {
  const request = pending.request as unknown as FeatureTransitionRequestV2;
  return observation.operationId === request.operationId && observation.repositoryId === request.repositoryId && observation.requestId === request.requestId &&
    observation.requestCoreDigest === request.requestCoreDigest && observation.requestDigest === request.requestDigest &&
    observation.preparationEntryDigest === pending.preparationEntryDigest && observation.candidateDigest === pending.candidateDigest && observation.effectKey === pending.effectKey &&
    observation.pullRequestId === request.pullRequestId && observation.expectedPullRequestHead === request.expectedPullRequestHead &&
    observation.targetFeatureRef === request.targetFeatureRef && observation.integrationMethod === request.integrationMethod &&
    observation.priorHeadRevision === request.priorHeadRevision && observation.priorTreeDigest === request.priorTreeDigest;
}

function transitionAppliedV2(observation: FeatureTransitionObservationV2, request: FeatureTransitionRequestV2): boolean {
  const common = observation.pullRequestMerged === true && observation.observedPullRequestHead === request.expectedPullRequestHead &&
    observation.observedPullRequestBaseBranch === request.targetFeatureBranch && observation.observedIntegrationMethod === request.integrationMethod &&
    observation.pullRequestMergeRevision !== null && observation.pullRequestMergeRevision === observation.observedTargetHeadRevision &&
    observation.checkState === "successful" && observation.conflictingPullRequestCount === 0 && observation.pullRequestCommitHeads.length > 0 &&
    observation.pullRequestCommitHeads.at(-1) === request.expectedPullRequestHead;
  if (!common) return false;
  if (request.integrationMethod === "merge_commit") return observation.resultingCommitParents.length === 2 &&
    observation.resultingCommitParents[0] === request.priorHeadRevision && observation.resultingCommitParents[1] === request.expectedPullRequestHead && observation.rebasedCommits.length === 0;
  if (request.integrationMethod === "squash") return observation.resultingCommitParents.length === 1 && observation.resultingCommitParents[0] === request.priorHeadRevision &&
    observation.rebasedCommits.length === 0 && observation.observedTargetHeadRevision !== request.priorHeadRevision && observation.observedTargetHeadRevision !== request.expectedPullRequestHead;
  const records = observation.rebasedCommits;
  if (records.length === 0 || records.length !== observation.pullRequestCommitHeads.length || observation.resultingCommitParents.length !== 1 ||
      records.map((record) => record.sourceCommit).some((source, index) => source !== observation.pullRequestCommitHeads[index]) ||
      new Set(records.map((record) => record.sourceCommit)).size !== records.length || new Set(records.map((record) => record.resultCommit)).size !== records.length ||
      new Set(records.flatMap((record) => [record.sourceCommit, record.resultCommit])).size !== records.length * 2 ||
      records[0].parentCommit !== request.priorHeadRevision) return false;
  for (let index = 1; index < records.length; index += 1) if (records[index].parentCommit !== records[index - 1].resultCommit) return false;
  return records.at(-1)!.resultCommit === observation.observedTargetHeadRevision && observation.resultingCommitParents[0] === records.at(-1)!.parentCommit;
}

function transitionNotAppliedV2(observation: FeatureTransitionObservationV2, request: FeatureTransitionRequestV2): boolean {
  return observation.pullRequestMerged === false && observation.pullRequestMergeRevision === null &&
    observation.observedPullRequestHead === request.expectedPullRequestHead && observation.observedPullRequestBaseBranch === request.targetFeatureBranch &&
    observation.observedIntegrationMethod === null && observation.resultingCommitParents.length === 0 && observation.rebasedCommits.length === 0 &&
    observation.observedTargetHeadRevision === request.priorHeadRevision && observation.observedTargetTreeDigest === request.priorTreeDigest;
}

function nextStageFromContextV2(context: FeatureOperationReplayContextV2, cumulative: "pending" | "passed" | "failed"): FeatureIntegrationNextStageV2 {
  if ((context.lifecycle.state as string) === "rollback_validation_pending") return "cumulative_validation";
  if (context.lifecycle.state === "rollback_pending") {
    return context.transitions.at(-1)?.kind === "integration" ? "rollback_mission_handoff" : "cumulative_validation";
  }
  if (context.lifecycle.state !== "active") return "lifecycle_only";
  if (cumulative === "pending") return "cumulative_validation";
  if (context.operationCounters.featureBranchCreateAttempts === 0) return "feature_branch_creation";
  if (context.operationCounters.featureWorkspaceDraftPrAttempts === 0) return "feature_workspace";
  const child = context.activePlan.children.find((item) => !context.acceptedIntegrations.some((accepted) => accepted.childId === item.childId && !accepted.reverted));
  if (!child) return "lifecycle_only";
  const counter = context.childCounters.find((item) => item.childId === child.childId);
  if (!counter || counter.initiationAttempts === 0) return "child_initiation";
  if (counter.implementationAttempts === 0) return "implementation_handoff";
  if (counter.publicationAttempts === 0) return "child_publication";
  if (!context.acceptedReviewEvidence.some((item) => item.childId === child.childId)) return "child_evidence";
  return "integration";
}

export function replayFeatureOperationJournalV2(input: unknown, trustAnchorInput: unknown): FeatureIntegrationReplayResultV2 {
  try {
    const envelope = journalEnvelopeV2(input);
    if (!envelope || framedDigestV2(FEATURE_INTEGRATION_JOURNAL_DOMAIN_V2, envelope.journal, "journalDigest") !== envelope.journal.journalDigest) return replayInvalidV2("JOURNAL_INVALID", null);
    const entries: FeatureOperationJournalEntryV2[] = [];
    for (let index = 0; index < envelope.entries.length; index += 1) {
      const entry = entryShapeV2(envelope.entries[index], false);
      if (!entry || framedDigestV2(FEATURE_INTEGRATION_ENTRY_DOMAIN_V2, entry, "entryDigest") !== entry.entryDigest) return replayInvalidV2("ENTRY_INVALID", index);
      entries.push(entry);
    }
    const badLineageIndex = entries.findIndex((entry, index) => entry.previousEntryDigest !== (index === 0 ? null : entries[index - 1].entryDigest));
    if (envelope.journal.genesisDigest !== entries[0].entryDigest || envelope.journal.latestAcceptedEntryDigest !== entries.at(-1)!.entryDigest || badLineageIndex >= 0) {
      return replayInvalidV2("DIGEST_LINEAGE_INVALID", badLineageIndex >= 0 ? badLineageIndex : null);
    }
    if (entries.some((entry, index) => entry.entrySequence !== index || entry.operationId !== envelope.journal.operationId)) return replayInvalidV2("SEQUENCE_INVALID", entries.findIndex((entry, index) => entry.entrySequence !== index || entry.operationId !== envelope.journal.operationId));
    const anchor = checkedTrustAnchorV2(trustAnchorInput);
    const genesis = entries[0];
    if (!anchor || genesis.entryKind !== "operation_genesis_accepted") return replayInvalidV2("GENESIS_INVALID", 0);
    const payload = genesis.payload as unknown as FeatureOperationGenesisPayloadV2;
    const authority = verifyGenesisFeatureAuthorityV2(payload.signedAuthority, anchor, envelope.journal.operationId as string);
    if (!authority || authority.repositoryId !== anchor.repositoryId) return replayInvalidV2("GENESIS_INVALID", 0);
    const replay = validateFeatureOperationReplayContextV2(payload.replayContext);
    if (replay.state !== "valid" || replay.value.operationId !== envelope.journal.operationId || replay.value.repositoryId !== anchor.repositoryId ||
        !authorityExactlyActivatesReplayV2(authority, replay.value)) return replayInvalidV2("GENESIS_INVALID", 0);
    const producerBindings = normalizedProducerBindingsV2(payload.trustedObservationProducerBindings);
    const requiredSimmons = authority.plan.finalGates.simmonsRequired;
    const genesisHumans = normalizedHumanBindingsV2(payload.trustedHumanBindings, anchor.sourceBindingSequence, anchor.missionId, requiredSimmons);
    const anchorHumans = normalizedHumanBindingsV2(anchor.trustedHumanBindings, anchor.sourceBindingSequence, anchor.missionId, requiredSimmons);
    if (!producerBindings || !genesisHumans || !anchorHumans ||
        computeFeatureObservationProducerBindingsDigestV2(producerBindings) !== authority.plan.protocol.observationProducerBindingsDigest ||
        computeFeatureHumanBindingsDigestV2(genesisHumans) !== authority.plan.protocol.humanBindingsDigest ||
        authority.plan.protocol.humanBindingsDigest !== anchor.humanBindingsDigest ||
        canonicalFeatureIntegrationJsonV1(genesisHumans) !== canonicalFeatureIntegrationJsonV1(anchorHumans)) return replayInvalidV2("GENESIS_INVALID", 0);
    let context = replay.value as FeatureOperationReplayContextV2;
    let terminal = context.transitions.at(-1)!;
    let terminalHeadRevision = terminal.resultingHeadRevision;
    let terminalTreeDigest = terminal.resultingTreeDigest;
    let headTransitionOperationSequence = terminal.operationSequence;
    let lifecycle = context.lifecycle.state as FeatureIntegrationReplayProjectionV2["lifecycle"];
    let pendingEffect: FeatureIntegrationPendingEffectV2 | null = null;
    let pendingCandidate: FeatureOperationDerivedCandidateV2 | FeatureCumulativeValidationCandidateV2 | null = null;
    let uncertainEffect = false;
    let cumulativeValidation: "pending" | "passed" | "failed" = context.acceptedIntegrations.length > 0 || context.acceptedRollbacks.length > 0 ? "pending" : "passed";
    let consumedCumulativeValidationEffectKeys: string[] = [];
    let cumulativeValidationAttempts = 0;
    let cumulativeExecutionProjection: FeatureIntegrationReplayProjectionV2["cumulativeExecutionProjection"] = null;
    let latestObservedAt = context.observedAt;
    const githubBinding = producerBindings.find((binding) => binding.producerKind === "github_repository")!;
    const cumulativeBinding = producerBindings.find((binding) => binding.producerKind === "cumulative_execution")!;
    const rollbackWorkspaces = new Map<string, {
      completionReceiptDigest: string;
      pullRequestId: string;
      pullRequestHeadRevision: string;
      restoredTreeDigest: string;
    }>();

    for (let index = 1; index < entries.length; index += 1) {
      const entry = entries[index];
      const p = entry.payload as unknown as Record<string, unknown>;
      if (entry.entryKind === "authority_successor_accepted") return replayInvalidV2("AUTHORITY_SUCCESSOR_INVALID", index);
      if (entry.entryKind === "rollback_workspace_accepted") {
        if (pendingEffect) return replayInvalidV2("EFFECT_LIFECYCLE_INVALID", index);
        const latest = [...context.acceptedIntegrations].reverse().find((item) => !item.reverted);
        if (lifecycle !== "rollback_pending" || cumulativeValidation !== "failed" || context.transitions.at(-1)?.kind !== "integration" || !latest ||
            p.childId !== latest.childId || rollbackWorkspaces.has(p.childId as string)) {
          return replayInvalidV2("STAGE_ORDER_INVALID", index);
        }
        if (p.targetBranch !== context.activePlan.featureBranch || p.restoredTreeDigest !== latest.priorTreeDigest) return replayInvalidV2("EVIDENCE_INVALID", index);
        rollbackWorkspaces.set(p.childId as string, {
          completionReceiptDigest: p.completionReceiptDigest as string,
          pullRequestId: p.pullRequestId as string,
          pullRequestHeadRevision: p.pullRequestHeadRevision as string,
          restoredTreeDigest: p.restoredTreeDigest as string,
        });
        continue;
      }
      if (entry.entryKind === "effect_prepared") {
        if (pendingEffect) return replayInvalidV2("EFFECT_LIFECYCLE_INVALID", index);
        if (p.effectClass === "cumulative") {
          if (!cumulativeRequestV2(p.request) || !exactCumulativeRequestV2(p.request) || !cumulativeCandidateV2(p.candidate) ||
              !exactCumulativeCandidateV2(p.candidate) || !plain(p.signedCumulativeAuthority)) return replayInvalidV2("CUMULATIVE_VALIDATION_INVALID", index);
          const request = p.request as unknown as FeatureCumulativeRequestV2;
          const candidate = p.candidate as unknown as FeatureCumulativeValidationCandidateV2;
          const cumulativeAuthority = verifyCumulativeAuthorityEnvelopeV2(p.signedCumulativeAuthority, genesisHumans);
          const challenge = verifyChallengeEnvelopeV2(request.signedChallenge, cumulativeBinding);
          const previousJournalDigest = createFeatureOperationJournalV2(entries.slice(0, index)).journalDigest;
          const latestTransition = context.transitions.at(-1)!;
          if (!cumulativeAuthority || !challenge || challenge.producerId !== cumulativeBinding.producerId) return replayInvalidV2("OBSERVATION_AUTHORITY_INVALID", index);
          if (!cumulativeChallengeMatchesPreparationV2(challenge, request, candidate, entry, previousJournalDigest)) return replayInvalidV2("OBSERVATION_CHALLENGE_INVALID", index);
          if (Date.parse(challenge.issuedAt) < Date.parse(latestObservedAt.value) ||
              Date.parse(challenge.expiresAt) > Math.min(Date.parse(cumulativeAuthority.expiresAt), Date.parse(authority.expiresAt), Date.parse(authority.plan.expiresAt))) {
            return replayInvalidV2("OBSERVATION_CHALLENGE_INVALID", index);
          }
          const commandIds = request.commands.map((command) => command.commandId);
          if (nextStageFromContextV2(context, cumulativeValidation) !== "cumulative_validation" || latestTransition.kind === "genesis" ||
              candidate.operationId !== context.operationId || candidate.repositoryId !== context.repositoryId || candidate.planDigest !== context.activePlanDigest ||
              candidate.featureAuthorityDigest !== context.verifiedAuthorityDigest || candidate.cumulativeAuthorityDigest !== cumulativeAuthority.authorityDigest ||
              candidate.requestCoreDigest !== request.requestCoreDigest || candidate.effectKey !== request.effectKey || candidate.attemptId !== request.attemptId ||
              candidate.terminalHeadRevision !== terminalHeadRevision || candidate.terminalTreeDigest !== terminalTreeDigest ||
              candidate.transitionReceiptDigest !== latestTransition.receiptDigest || candidate.activeAuthorityJournalSequence !== context.currentJournalSequence ||
              candidate.activeAuthorityOperationSequence !== context.acceptedAuthorityOperationSequence || request.operationId !== context.operationId ||
              request.repositoryId !== context.repositoryId || request.planDigest !== context.activePlanDigest || request.featureAuthorityDigest !== context.verifiedAuthorityDigest ||
              request.terminalHeadRevision !== terminalHeadRevision || request.terminalTreeDigest !== terminalTreeDigest ||
              request.transitionReceiptDigest !== latestTransition.receiptDigest || request.cumulativeAuthorityDigest !== cumulativeAuthority.authorityDigest ||
              cumulativeAuthority.missionId !== anchor.missionId || cumulativeAuthority.operationId !== context.operationId ||
              cumulativeAuthority.repositoryId !== context.repositoryId || cumulativeAuthority.planDigest !== context.activePlanDigest ||
              cumulativeAuthority.featureAuthorityDigest !== context.verifiedAuthorityDigest || cumulativeAuthority.terminalHeadRevision !== terminalHeadRevision ||
              cumulativeAuthority.terminalTreeDigest !== terminalTreeDigest || cumulativeAuthority.transitionReceiptDigest !== latestTransition.receiptDigest ||
              cumulativeAuthority.requestCoreDigest !== request.requestCoreDigest || cumulativeAuthority.effectKey !== request.effectKey ||
              cumulativeAuthority.activeAuthorityJournalSequence !== context.currentJournalSequence ||
              cumulativeAuthority.activeAuthorityOperationSequence !== context.acceptedAuthorityOperationSequence ||
              canonicalFeatureIntegrationJsonV1(cumulativeAuthority.commandIds) !== canonicalFeatureIntegrationJsonV1(commandIds) ||
              canonicalFeatureIntegrationJsonV1(cumulativeAuthority.targetIds) !== canonicalFeatureIntegrationJsonV1(request.targetIds) ||
              canonicalFeatureIntegrationJsonV1(cumulativeAuthority.validationIds) !== canonicalFeatureIntegrationJsonV1(request.validationIds) ||
              p.candidateDigest !== candidate.candidateDigest || p.effectKey !== candidate.effectKey || p.requestDigest !== request.requestDigest ||
              p.expectedHeadRevision !== terminalHeadRevision || p.expectedTreeDigest !== terminalTreeDigest ||
              context.consumedEffectKeys.includes(candidate.effectKey) || consumedCumulativeValidationEffectKeys.includes(candidate.effectKey)) {
            return replayInvalidV2("CUMULATIVE_VALIDATION_INVALID", index);
          }
          consumedCumulativeValidationEffectKeys = [...consumedCumulativeValidationEffectKeys, candidate.effectKey].sort(compareUtf16);
          cumulativeValidationAttempts += 1;
          pendingCandidate = structuredClone(candidate);
          pendingEffect = { effectClass: "cumulative", candidateDigest: candidate.candidateDigest, effectKey: candidate.effectKey,
            request: structuredClone(request) as unknown as Readonly<Record<string, unknown>>, requestDigest: request.requestDigest,
            preparationEntryDigest: entry.entryDigest, signedCumulativeAuthority: structuredClone(p.signedCumulativeAuthority) as Readonly<Record<string, unknown>>,
            signedChallenges: [structuredClone(request.signedChallenge)], latestObservationDigest: null };
          uncertainEffect = false;
          continue;
        }
        if (p.effectClass !== "transition" || !transitionRequestV2(p.request) || !exactTransitionRequestV2(p.request) ||
            validateFeatureOperationDerivedCandidateV2(p.candidate).state !== "valid") return replayInvalidV2("STAGE_ORDER_INVALID", index);
        const request = p.request as FeatureTransitionRequestV2;
        const candidate = p.candidate as FeatureOperationDerivedCandidateV2;
        const challenge = verifyChallengeEnvelopeV2(request.signedChallenge, githubBinding);
        if (!challenge || challenge.producerId !== githubBinding.producerId) return replayInvalidV2("OBSERVATION_AUTHORITY_INVALID", index);
        const previousJournalDigest = createFeatureOperationJournalV2(entries.slice(0, index)).journalDigest;
        if (!challengeMatchesPreparationV2(challenge, request, candidate, entry, previousJournalDigest)) return replayInvalidV2("OBSERVATION_CHALLENGE_INVALID", index);
        if (Date.parse(challenge.issuedAt) < Date.parse(latestObservedAt.value) ||
            Date.parse(challenge.expiresAt) > Math.min(Date.parse(authority.expiresAt), Date.parse(authority.plan.expiresAt))) return replayInvalidV2("OBSERVATION_CHALLENGE_INVALID", index);
        if (candidate.repositoryId !== context.repositoryId || candidate.operationId !== context.operationId || candidate.planDigest !== context.activePlanDigest ||
            candidate.authorityDigest !== context.verifiedAuthorityDigest || request.operationId !== candidate.operationId || request.repositoryId !== candidate.repositoryId ||
            request.candidateDigest !== candidate.candidateDigest || request.effectKey !== candidate.effectKey || request.derivationKind !== candidate.derivationKind ||
            request.targetFeatureBranch !== candidate.targetBranch || request.targetFeatureRef !== `refs/heads/${candidate.targetBranch}` ||
            request.priorHeadRevision !== terminalHeadRevision || request.priorTreeDigest !== terminalTreeDigest ||
            p.candidateDigest !== candidate.candidateDigest || p.effectKey !== candidate.effectKey || p.requestDigest !== request.requestDigest ||
            p.expectedHeadRevision !== terminalHeadRevision || p.expectedTreeDigest !== terminalTreeDigest || p.signedCumulativeAuthority !== null ||
            context.consumedEffectKeys.includes(candidate.effectKey)) return replayInvalidV2("EFFECT_LIFECYCLE_INVALID", index);
        if (candidate.derivationKind === "child_merge_to_feature") {
          if (lifecycle !== "active" || nextStageFromContextV2(context, cumulativeValidation) !== "integration" || request.integrationMethod !== candidate.integrationMethod ||
              request.expectedPullRequestHead !== candidate.childHeadRevision || request.rollbackWorkspaceReceiptDigest !== null) return replayInvalidV2("STAGE_ORDER_INVALID", index);
        } else if (candidate.derivationKind === "child_revert_on_feature") {
          const latest = [...context.acceptedIntegrations].reverse().find((item) => !item.reverted);
          const workspace = rollbackWorkspaces.get(candidate.childId);
          if (lifecycle !== "rollback_pending" || !latest || !workspace) return replayInvalidV2("STAGE_ORDER_INVALID", index);
          if (candidate.integrationReceiptDigest !== latest.receiptDigest || candidate.integrationHeadRevision !== latest.resultingHeadRevision ||
              candidate.integrationTreeDigest !== latest.resultingTreeDigest || candidate.expectedRestoredTreeDigest !== workspace.restoredTreeDigest ||
              request.pullRequestId !== workspace.pullRequestId || request.expectedPullRequestHead !== workspace.pullRequestHeadRevision ||
              request.rollbackWorkspaceReceiptDigest !== workspace.completionReceiptDigest) return replayInvalidV2("EFFECT_LIFECYCLE_INVALID", index);
        }
        const childCounters = context.childCounters.map((counter) => counter.childId !== candidate.childId ? { ...counter } : candidate.derivationKind === "child_merge_to_feature"
          ? { ...counter, integrationAttempts: counter.integrationAttempts + 1 } : { ...counter, rollbackAttempts: counter.rollbackAttempts + 1 });
        context = { ...context, consumedEffectKeys: [...context.consumedEffectKeys, candidate.effectKey].sort(compareUtf16), childCounters,
          operationCounters: candidate.derivationKind === "child_merge_to_feature"
            ? { ...context.operationCounters, totalIntegrationAttempts: context.operationCounters.totalIntegrationAttempts + 1 }
            : { ...context.operationCounters, totalRollbackAttempts: context.operationCounters.totalRollbackAttempts + 1 } };
        pendingCandidate = structuredClone(candidate);
        pendingEffect = { effectClass: "transition", candidateDigest: candidate.candidateDigest, effectKey: candidate.effectKey,
          request: structuredClone(request) as unknown as Readonly<Record<string, unknown>>, requestDigest: request.requestDigest,
          preparationEntryDigest: entry.entryDigest, signedCumulativeAuthority: null, signedChallenges: [structuredClone(request.signedChallenge)], latestObservationDigest: null };
        uncertainEffect = false;
        continue;
      }
      if (entry.entryKind === "effect_challenge_refreshed") {
        const challenge = verifyChallengeEnvelopeV2(p.signedChallenge, githubBinding);
        if (!challenge || challenge.producerId !== githubBinding.producerId) return replayInvalidV2("OBSERVATION_AUTHORITY_INVALID", index);
        if (!pendingEffect || p.preparationEntryDigest !== pendingEffect.preparationEntryDigest) return replayInvalidV2("OBSERVATION_CHALLENGE_INVALID", index);
        const prior = pendingEffect.signedChallenges.at(-1)!.payload;
        const request = pendingEffect.request as unknown as FeatureTransitionRequestV2;
        const previousJournalDigest = createFeatureOperationJournalV2(entries.slice(0, index)).journalDigest;
        if (challenge.challengeKind !== "transition" || challenge.operationId !== context.operationId || challenge.repositoryId !== context.repositoryId ||
            challenge.requestId !== request.requestId || challenge.requestCoreDigest !== request.requestCoreDigest ||
            challenge.candidateDigest !== pendingEffect.candidateDigest || challenge.effectKey !== pendingEffect.effectKey || challenge.generation !== prior.generation + 1 ||
            challenge.preparationEntryDigest !== pendingEffect.preparationEntryDigest || challenge.priorChallengeDigest !== prior.challengeDigest ||
            challenge.priorObservationDigest !== pendingEffect.latestObservationDigest || challenge.previousJournalDigest !== previousJournalDigest ||
            challenge.intendedEntrySequence !== entry.entrySequence || challenge.expectedHeadRevision !== request.priorHeadRevision ||
            challenge.expectedTreeDigest !== request.priorTreeDigest || (pendingEffect.latestObservationDigest === null && Date.parse(challenge.issuedAt) < Date.parse(prior.expiresAt)) ||
            Date.parse(challenge.issuedAt) < Date.parse(latestObservedAt.value) || Date.parse(challenge.expiresAt) >= Math.min(Date.parse(authority.expiresAt), Date.parse(authority.plan.expiresAt))) {
          return replayInvalidV2("OBSERVATION_CHALLENGE_INVALID", index);
        }
        pendingEffect = { ...pendingEffect, signedChallenges: [...pendingEffect.signedChallenges, structuredClone(p.signedChallenge) as SignedFeatureObservationChallengeV2] };
        continue;
      }
      if (["cumulative_validation_accepted", "cumulative_validation_failed"].includes(entry.entryKind) ||
          (["effect_not_applied", "effect_uncertain"].includes(entry.entryKind) && pendingEffect?.effectClass === "cumulative")) {
        if (!pendingEffect || pendingEffect.effectClass !== "cumulative" || !pendingCandidate || !cumulativeCandidateV2(pendingCandidate)) {
          return replayInvalidV2("EFFECT_LIFECYCLE_INVALID", index);
        }
        const signed = entry.entryKind === "cumulative_validation_accepted" || entry.entryKind === "cumulative_validation_failed"
          ? p.signedCumulativeReceipt : p.signedObservation;
        const observation = verifyCumulativeReceiptEnvelopeV2(signed, cumulativeBinding);
        if (!observation || observation.producerId !== cumulativeBinding.producerId) return replayInvalidV2("OBSERVATION_AUTHORITY_INVALID", index);
        const challenge = verifyChallengeEnvelopeV2(observation.signedChallenge, cumulativeBinding);
        if (!challenge || challenge.producerId !== cumulativeBinding.producerId) return replayInvalidV2("OBSERVATION_AUTHORITY_INVALID", index);
        if (p.preparationEntryDigest !== pendingEffect.preparationEntryDigest ||
            canonicalFeatureIntegrationJsonV1(observation.signedChallenge) !== canonicalFeatureIntegrationJsonV1(pendingEffect.signedChallenges.at(-1)) ||
            !cumulativeReceiptIdentityV2(observation, pendingEffect, latestObservedAt.value)) return replayInvalidV2("CUMULATIVE_VALIDATION_INVALID", index);
        const expectedKind = observation.terminalStatus === "passed" ? "cumulative_validation_accepted"
          : observation.terminalStatus === "failed" ? "cumulative_validation_failed"
          : observation.terminalStatus === "not_applied" ? "effect_not_applied" : "effect_uncertain";
        if (entry.entryKind !== expectedKind) return replayInvalidV2("EFFECT_LIFECYCLE_INVALID", index);
        latestObservedAt = { value: observation.observedAt, provenance: "hostTrusted" };
        context = { ...context, observedAt: latestObservedAt };
        cumulativeExecutionProjection = { preparationEntryDigest: pendingEffect.preparationEntryDigest, attemptId: observation.attemptId,
          ledgerDigest: observation.observationDigest, completedPrefixLength: observation.completedPrefixLength,
          invocationBounds: structuredClone(observation.invocationBounds), terminalStatus: observation.terminalStatus,
          terminalReceiptDigest: observation.observationDigest };
        if (observation.terminalStatus === "uncertain") {
          pendingEffect = { ...pendingEffect, latestObservationDigest: observation.observationDigest };
          uncertainEffect = true;
          continue;
        }
        if (observation.terminalStatus === "not_applied") {
          pendingEffect = null; pendingCandidate = null; uncertainEffect = false;
          continue;
        }
        cumulativeValidation = observation.terminalStatus;
        const latestTransition = context.transitions.at(-1)!;
        if (observation.terminalStatus === "failed" && latestTransition.kind === "integration") {
          lifecycle = "rollback_pending";
          context = { ...context, lifecycle: { state: "rollback_pending", atOperationSequence: headTransitionOperationSequence } };
        } else if (observation.terminalStatus === "passed" && latestTransition.kind === "rollback") {
          lifecycle = "active";
          context = { ...context, lifecycle: { state: "active", atOperationSequence: headTransitionOperationSequence } };
        }
        pendingEffect = null; pendingCandidate = null; uncertainEffect = false;
        continue;
      }
      if (["effect_not_applied", "effect_uncertain", "integration_accepted", "rollback_accepted"].includes(entry.entryKind)) {
        const signed = (entry.entryKind === "integration_accepted" || entry.entryKind === "rollback_accepted") ? p.signedTransitionObservation : p.signedObservation;
        const observation = verifyTransitionEnvelopeV2(signed, githubBinding);
        if (!observation || observation.producerId !== githubBinding.producerId) return replayInvalidV2("OBSERVATION_AUTHORITY_INVALID", index);
        const challenge = verifyChallengeEnvelopeV2(observation.signedChallenge, githubBinding);
        if (!challenge || challenge.producerId !== githubBinding.producerId) return replayInvalidV2("OBSERVATION_AUTHORITY_INVALID", index);
        if (!pendingEffect || pendingEffect.effectClass !== "transition" || !pendingCandidate ||
            validateFeatureOperationDerivedCandidateV2(pendingCandidate).state !== "valid") return replayInvalidV2("EFFECT_LIFECYCLE_INVALID", index);
        const transitionCandidate = pendingCandidate as FeatureOperationDerivedCandidateV2;
        const latestChallenge = pendingEffect.signedChallenges.at(-1);
        if (canonicalFeatureIntegrationJsonV1(observation.signedChallenge) !== canonicalFeatureIntegrationJsonV1(latestChallenge) ||
            !challengeMatchesObservationV2(challenge, pendingEffect, observation, latestObservedAt.value)) return replayInvalidV2("OBSERVATION_CHALLENGE_INVALID", index);
        if (p.preparationEntryDigest !== pendingEffect.preparationEntryDigest || !transitionObservationIdentityV2(observation, pendingEffect)) return replayInvalidV2("EFFECT_LIFECYCLE_INVALID", index);
        const request = pendingEffect.request as unknown as FeatureTransitionRequestV2;
        const applied = transitionAppliedV2(observation, request);
        const notApplied = transitionNotAppliedV2(observation, request);
        if (observation.status === "applied" && !applied) return replayInvalidV2("HEAD_TRANSITION_INVALID", index);
        if (observation.status === "not_applied" && !notApplied) return replayInvalidV2("HEAD_TRANSITION_INVALID", index);
        if (observation.status === "uncertain" && (applied || notApplied)) return replayInvalidV2("HEAD_TRANSITION_INVALID", index);
        const expectedKind = observation.status === "applied" ? (transitionCandidate.derivationKind === "child_merge_to_feature" ? "integration_accepted" : "rollback_accepted")
          : observation.status === "not_applied" ? "effect_not_applied" : "effect_uncertain";
        if (entry.entryKind !== expectedKind) return replayInvalidV2("EFFECT_LIFECYCLE_INVALID", index);
        latestObservedAt = { value: observation.observedAt, provenance: "hostTrusted" };
        context = { ...context, observedAt: latestObservedAt };
        if (observation.status === "uncertain") {
          pendingEffect = { ...pendingEffect, latestObservationDigest: observation.observationDigest };
          uncertainEffect = true;
          continue;
        }
        if (observation.status === "not_applied") {
          if (transitionCandidate.derivationKind === "child_revert_on_feature" && lifecycle === "rollback_pending") {
            lifecycle = "active";
            context = { ...context, lifecycle: { state: "active", atOperationSequence: headTransitionOperationSequence } };
          }
          pendingEffect = null; pendingCandidate = null; uncertainEffect = false;
          continue;
        }
        headTransitionOperationSequence += 1;
        if (transitionCandidate.derivationKind === "child_merge_to_feature") {
          const candidate = transitionCandidate;
          const transition = { kind: "integration" as const, operationSequence: headTransitionOperationSequence, effectKey: candidate.effectKey,
            priorHeadRevision: terminalHeadRevision, priorTreeDigest: terminalTreeDigest, resultingHeadRevision: observation.observedTargetHeadRevision,
            resultingTreeDigest: observation.observedTargetTreeDigest, receiptDigest: observation.observationDigest, childId: candidate.childId,
            childHeadRevision: candidate.childHeadRevision, childTreeDigest: candidate.childTreeDigest };
          context = { ...context, transitions: [...context.transitions, transition], acceptedIntegrations: [...context.acceptedIntegrations,
            { childId: transition.childId, operationSequence: transition.operationSequence, effectKey: transition.effectKey,
              priorHeadRevision: transition.priorHeadRevision, priorTreeDigest: transition.priorTreeDigest, resultingHeadRevision: transition.resultingHeadRevision,
              resultingTreeDigest: transition.resultingTreeDigest, receiptDigest: transition.receiptDigest, reverted: false }] };
        } else if (transitionCandidate.derivationKind === "child_revert_on_feature") {
          const candidate = transitionCandidate;
          const latest = [...context.acceptedIntegrations].reverse().find((item) => !item.reverted)!;
          const workspace = rollbackWorkspaces.get(candidate.childId);
          if (!workspace || request.rollbackWorkspaceReceiptDigest !== workspace.completionReceiptDigest ||
              observation.observedTargetTreeDigest !== workspace.restoredTreeDigest || observation.observedTargetTreeDigest !== candidate.expectedRestoredTreeDigest) {
            return replayInvalidV2("HEAD_TRANSITION_INVALID", index);
          }
          const transition = { kind: "rollback" as const, operationSequence: headTransitionOperationSequence, effectKey: candidate.effectKey,
            priorHeadRevision: terminalHeadRevision, priorTreeDigest: terminalTreeDigest, resultingHeadRevision: observation.observedTargetHeadRevision,
            resultingTreeDigest: observation.observedTargetTreeDigest, receiptDigest: observation.observationDigest, childId: candidate.childId,
            revertedIntegrationReceiptDigest: candidate.integrationReceiptDigest };
          lifecycle = "rollback_validation_pending";
          context = { ...context, lifecycle: { state: lifecycle, atOperationSequence: headTransitionOperationSequence }, transitions: [...context.transitions, transition],
            acceptedIntegrations: context.acceptedIntegrations.map((item) => item.receiptDigest === latest.receiptDigest ? { ...item, reverted: true } : item),
            acceptedRollbacks: [...context.acceptedRollbacks, { childId: transition.childId, operationSequence: transition.operationSequence, effectKey: transition.effectKey,
              revertedIntegrationReceiptDigest: transition.revertedIntegrationReceiptDigest, priorHeadRevision: transition.priorHeadRevision,
              priorTreeDigest: transition.priorTreeDigest, resultingHeadRevision: transition.resultingHeadRevision,
              resultingTreeDigest: transition.resultingTreeDigest, receiptDigest: transition.receiptDigest }] };
        } else return replayInvalidV2("STAGE_ORDER_INVALID", index);
        terminalHeadRevision = observation.observedTargetHeadRevision;
        terminalTreeDigest = observation.observedTargetTreeDigest;
        cumulativeValidation = "pending";
        pendingEffect = null; pendingCandidate = null; uncertainEffect = false;
        continue;
      }
      return replayInvalidV2("STAGE_ORDER_INVALID", index);
    }
    terminal = context.transitions.at(-1)!;
    const projection: FeatureIntegrationReplayProjectionV2 = {
      replayContext: context,
      nextEntrySequence: entries.length,
      activeAuthorityJournalSequence: context.currentJournalSequence,
      activeAuthorityOperationSequence: context.acceptedAuthorityOperationSequence,
      headTransitionOperationSequence,
      terminalHeadRevision,
      terminalTreeDigest,
      lifecycle,
      pendingEffect,
      uncertainEffect,
      consumedCumulativeValidationEffectKeys,
      cumulativeValidationAttempts,
      cumulativeValidation,
      cumulativeExecutionProjection,
      acceptedFinalGates: [],
      terminalDisposition: null,
      activeRecoveryAuthorityDigest: null,
      nextStage: pendingEffect ? (pendingEffect.effectClass === "cumulative" ? "cumulative_validation"
        : (pendingCandidate as FeatureOperationDerivedCandidateV2 | null)?.derivationKind === "child_revert_on_feature" ? "rollback" : "integration")
        : lifecycle === "rollback_pending" && context.transitions.at(-1)?.kind === "integration" &&
          rollbackWorkspaces.has([...context.acceptedIntegrations].reverse().find((item) => !item.reverted)?.childId ?? "")
          ? "rollback" : nextStageFromContextV2(context, cumulativeValidation),
      latestObservedAt,
    };
    return { state: "valid", value: immutableCloneV2(projection) };
  } catch { return replayInvalidV2("JOURNAL_INVALID", null); }
}

export function secureReplayFeatureOperationJournalV2(input: unknown, trustAnchor: FeatureIntegrationTrustAnchorV2): SecureReplayResultV2 {
  try {
    if (!plain(input)) return replayInvalidV2("JOURNAL_INVALID", null);
    const schema = ownData(input, "schemaVersion"), contract = ownData(input, "contractVersion");
    if (schema === 1 && contract === FEATURE_INTEGRATION_CONTRACT_VERSION) return { state: "blocked", reason: "LEGACY_JOURNAL_UNTRUSTED", entrySequence: null };
    if (schema !== 2 || contract !== FEATURE_INTEGRATION_CONTRACT_VERSION_V2) return replayInvalidV2("JOURNAL_INVALID", null);
    return replayFeatureOperationJournalV2(input, trustAnchor);
  } catch { return replayInvalidV2("JOURNAL_INVALID", null); }
}

export function createFeatureOperationGenesisEntryV2(input: {
  operationId: string;
  replayContext: FeatureOperationReplayContextV2;
  signedAuthority: SignedFeatureOperationAuthorityV2;
  trustedObservationProducerBindings: readonly FeatureObservationProducerBindingV2[];
  trustedHumanBindings: readonly TrustedHumanBinding[];
}, trustAnchor: FeatureIntegrationTrustAnchorV2): FeatureOperationJournalEntryV2 {
  const entry = createFeatureIntegrationEntryV2({ operationId: input.operationId, entrySequence: 0,
    entryKind: "operation_genesis_accepted", previousEntryDigest: null,
    payload: { replayContext: structuredClone(input.replayContext), signedAuthority: structuredClone(input.signedAuthority),
      trustedObservationProducerBindings: structuredClone(input.trustedObservationProducerBindings), trustedHumanBindings: structuredClone(input.trustedHumanBindings) } });
  const journal = createFeatureOperationJournalV2([entry]);
  if (replayFeatureOperationJournalV2(journal, trustAnchor).state !== "valid") throw new TypeError("Feature operation V2 genesis input is invalid.");
  return entry;
}
