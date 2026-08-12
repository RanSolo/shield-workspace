import { createHash, createPublicKey, verify } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  FEATURE_OPERATION_CONTRACT_VERSION,
  compareFeatureOperationAmendmentV1,
  validateFeatureOperationDerivedCandidateV1,
  validateFeatureOperationPlanV1,
  validateFeatureOperationReplayContextV1,
  verifySignedFeatureOperationAuthorityV1,
  type FeatureOperationAuthorityV1,
  type FeatureOperationDerivedCandidateV1,
  type FeatureOperationReplayContextV1,
  type SignedFeatureOperationAuthorityV1,
} from "./feature-operation-v1.mjs";
import { computeEd25519SigningKeyRef, type TrustedHumanBinding } from "./mission-v2.mjs";

export const FEATURE_INTEGRATION_SCHEMA_VERSION = 1 as const;
export const FEATURE_INTEGRATION_CONTRACT_VERSION = "feature.integration.v1" as const;
export const FEATURE_INTEGRATION_JOURNAL_DOMAIN = "shield.feature-integration.journal.v1" as const;
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
