import { createHash, createPublicKey, verify } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  FEATURE_OPERATION_CONTRACT_VERSION,
  compareFeatureOperationAmendmentV1,
  validateFeatureOperationAuthorityV1,
  validateFeatureOperationDerivedCandidateV1,
  validateFeatureOperationPlanV1,
  validateFeatureOperationReplayContextV1,
  type FeatureOperationAuthorityV1,
  type FeatureOperationDerivedCandidateV1,
  type FeatureOperationReplayContextV1,
  type SignedFeatureOperationAuthorityV1,
} from "./feature-operation-v1.mjs";
import { computeEd25519SigningKeyRef, type TrustedHumanBinding } from "./mission-v2.mjs";

export const FEATURE_INTEGRATION_SCHEMA_VERSION = 1 as const;
export const FEATURE_INTEGRATION_CONTRACT_VERSION = "feature.integration.v1" as const;
export const FEATURE_INTEGRATION_JOURNAL_DOMAIN = "shield.feature-integration.journal.v1" as const;
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
  commandIds: readonly string[];
  targetIds: readonly string[];
  validationIds: readonly string[];
  requestDigest: string;
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
    if (Array.isArray(input)) return `[${input.map(visit).join(",")}]`;
    if (!plain(input)) throw new TypeError("Canonical feature integration values must be plain data.");
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError("Symbol keys are not canonical.");
    const names = (keys as string[]).sort(compareUtf16);
    return `{${names.map((name) => `${JSON.stringify(name)}:${visit(ownData(input, name))}`).join(",")}}`;
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
  if (!Array.isArray(value) || value.some((item) => !text(item)) || new Set(value).size !== value.length) return null;
  const copy = [...value] as string[];
  if (sorted && copy.some((item, index) => index > 0 && compareUtf16(copy[index - 1], item) >= 0)) return null;
  return copy;
}

function cumulativeRequest(input: unknown, ownDigest = true): FeatureCumulativeValidationRequestV1 | null {
  if (!plain(input)) return null;
  const value = input as unknown as FeatureCumulativeValidationRequestV1;
  const commands = stringArray(value.commandIds), targets = stringArray(value.targetIds, true), validations = stringArray(value.validationIds, true);
  if (value.schemaVersion !== 1 || !text(value.operationId) || !text(value.repositoryId) || !text(value.terminalHeadRevision) || !digestValue(value.terminalTreeDigest) || !commands || !targets || !validations || !digestValue(value.requestDigest)) return null;
  if (ownDigest && computeFeatureCumulativeValidationRequestDigestV1(value) !== value.requestDigest) return null;
  return structuredClone(value);
}
function cumulativeAuthority(input: unknown, ownDigest = true): FeatureCumulativeValidationAuthorityV1 | null {
  if (!plain(input)) return null;
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
    if (!plain(input) || typeof input.signatureBase64 !== "string") return invalid("signed_authority_invalid", "Signed cumulative authority is invalid.");
    const authority = cumulativeAuthority(input.payload); if (!authority) return invalid("authority_invalid", "Cumulative authority payload is invalid.");
    const bindings = trustedBindings.filter((binding) => binding.bindingId === authority.humanBindingId && binding.humanPrincipalId === authority.humanPrincipalId && binding.seatId === "coulson" && binding.signingKeyRef === authority.signingKeyRef);
    if (bindings.length !== 1 || computeEd25519SigningKeyRef(bindings[0].publicKeySpkiBase64) !== authority.signingKeyRef) return invalid("binding_invalid", "Exactly one trusted Coulson binding is required.");
    const signature = Buffer.from(input.signatureBase64, "base64");
    const key = createPublicKey({ key: Buffer.from(bindings[0].publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    return signature.length === 64 && verify(null, Buffer.from(canonicalFeatureIntegrationJsonV1(authority)), key, signature) ? valid(authority) : invalid("signature_invalid", "Cumulative authority signature is invalid.");
  } catch { return invalid("signed_authority_invalid", "Signed cumulative authority is invalid."); }
}

function candidate(input: unknown, ownDigest = true): FeatureCumulativeValidationCandidateV1 | null {
  if (!plain(input)) return null; const value = input as unknown as FeatureCumulativeValidationCandidateV1;
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
  if (Date.parse(input.observedAt) >= Date.parse(authority.expiresAt)) return { state: "blocked", reason: "AUTHORITY_EXPIRED" };
  if (replay.pendingEffect || replay.terminalHeadRevision !== authority.terminalHeadRevision || replay.terminalTreeDigest !== authority.terminalTreeDigest || replay.activeAuthorityJournalSequence !== authority.activeAuthorityJournalSequence || replay.activeAuthorityOperationSequence !== authority.activeAuthorityOperationSequence) return { state: "blocked", reason: "REPLAY_MISMATCH" };
  if (authority.requestDigest !== request.requestDigest || canonicalFeatureIntegrationJsonV1(authority.commandIds) !== canonicalFeatureIntegrationJsonV1(request.commandIds) || canonicalFeatureIntegrationJsonV1(authority.targetIds) !== canonicalFeatureIntegrationJsonV1(request.targetIds) || canonicalFeatureIntegrationJsonV1(authority.validationIds) !== canonicalFeatureIntegrationJsonV1(request.validationIds)) return { state: "blocked", reason: "REQUEST_MISMATCH" };
  if (replay.consumedCumulativeValidationEffectKeys.includes(authority.effectKey) || replay.cumulativeValidationAttempts >= authority.maxAttempts) return { state: "blocked", reason: "BOUNDS_EXHAUSTED" };
  if (checkedCandidate.authorityDigest !== authority.authorityDigest || checkedCandidate.requestDigest !== request.requestDigest || checkedCandidate.effectKey !== authority.effectKey || checkedCandidate.terminalHeadRevision !== authority.terminalHeadRevision || checkedCandidate.terminalTreeDigest !== authority.terminalTreeDigest || checkedCandidate.transitionReceiptDigest !== authority.transitionReceiptDigest) return { state: "blocked", reason: "CANDIDATE_MISMATCH" };
  return { state: "eligible", candidate: clone(checkedCandidate) };
}

function replayInvalid(reason: FeatureIntegrationReplayReasonV1, entrySequence: number | null): FeatureIntegrationReplayResultV1 { return { state: "invalid", reason, entrySequence }; }

export function replayFeatureOperationJournalV1(input: unknown): FeatureIntegrationReplayResultV1 {
  const journal = validateFeatureOperationJournalV1(input); if (journal.state !== "valid") return replayInvalid("JOURNAL_INVALID", null);
  const entries = journal.value.entries; const genesis = entries[0];
  if (genesis.entryKind !== "operation_genesis_accepted") return replayInvalid("GENESIS_INVALID", 0);
  const seed = genesis.payload.replayContext; const checkedSeed = validateFeatureOperationReplayContextV1(seed);
  if (checkedSeed.state !== "valid" || checkedSeed.value.activePlan.baseBranch !== "main" || checkedSeed.value.operationId !== journal.value.operationId) return replayInvalid("GENESIS_INVALID", 0);
  let context = structuredClone(checkedSeed.value); let activeJournal = context.currentJournalSequence; let activeOperation = context.acceptedAuthorityOperationSequence;
  let headSequence = context.transitions.at(-1)?.operationSequence ?? 0; let terminalHead = context.transitions.at(-1)?.resultingHeadRevision ?? context.activePlan.baseRevision;
  let terminalTree = context.transitions.at(-1)?.resultingTreeDigest ?? context.activePlan.baseTreeDigest; let pending: FeatureIntegrationEffectReferenceV1 | null = null;
  let uncertain = false; const cumulativeKeys: string[] = []; let cumulativeAttempts = 0; let cumulative: "pending" | "passed" | "failed" = context.acceptedIntegrations.length > 0 || context.acceptedRollbacks.length > 0 ? "pending" : "passed";
  let featureBranchExists = false, featureWorkspaceExists = false; const initiated = new Set<string>(), implemented = new Set<string>(), published = new Set<string>(), evidenced = new Set<string>();
  for (let index = 1; index < entries.length; index += 1) {
    const entry = entries[index], payload = entry.payload;
    if (entry.entryKind === "authority_successor_accepted") {
      if (pending) return replayInvalid("AUTHORITY_SUCCESSOR_INVALID", index);
      const plan = validateFeatureOperationPlanV1(payload.plan), authority = validateFeatureOperationAuthorityV1(payload.authority);
      if (plan.state !== "valid" || authority.state !== "valid" || compareFeatureOperationAmendmentV1(context.activePlan, plan.value).state !== "valid" || authority.value.planDigest !== plan.value.planDigest || authority.value.journalSequence !== activeJournal + 1 || authority.value.operationSequence !== activeOperation + 1) return replayInvalid("AUTHORITY_SUCCESSOR_INVALID", index);
      context = { ...context, activePlan: plan.value, activePlanDigest: plan.value.planDigest, verifiedAuthorityId: authority.value.authorityId, verifiedAuthorityDigest: authority.value.authorityDigest, currentJournalSequence: authority.value.journalSequence, acceptedAuthorityOperationSequence: authority.value.operationSequence };
      activeJournal = authority.value.journalSequence; activeOperation = authority.value.operationSequence;
    } else if (entry.entryKind === "effect_prepared") {
      if (pending || !digestValue(payload.candidateDigest) || !text(payload.effectKey) || !digestValue(payload.requestDigest)) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
      const isCumulative = payload.effectClass === "cumulative_validation";
      if (!isCumulative && validateFeatureOperationDerivedCandidateV1(payload.candidate).state !== "valid") return replayInvalid("EFFECT_LIFECYCLE_INVALID", index);
      pending = { preparationEntryDigest: entry.entryDigest, candidateDigest: payload.candidateDigest as string, effectKey: payload.effectKey as string, requestDigest: payload.requestDigest as string }; uncertain = false;
      if (isCumulative) { if (cumulativeKeys.includes(pending.effectKey)) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index); cumulativeKeys.push(pending.effectKey); cumulativeAttempts += 1; }
      else { context = { ...context, consumedEffectKeys: [...context.consumedEffectKeys, pending.effectKey] }; }
    } else if (entry.entryKind === "effect_uncertain") {
      if (!pending || payload.preparationEntryDigest !== pending.preparationEntryDigest) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index); uncertain = true;
    } else if (entry.entryKind === "effect_not_applied") {
      if (!pending || payload.preparationEntryDigest !== pending.preparationEntryDigest || payload.observationProvenance === undefined) return replayInvalid("EFFECT_LIFECYCLE_INVALID", index); pending = null; uncertain = false;
    } else if (entry.entryKind === "feature_branch_creation_accepted") {
      if (!pending || payload.preparationEntryDigest !== pending.preparationEntryDigest || payload.headRevision !== terminalHead || payload.treeDigest !== terminalTree) return replayInvalid("STAGE_ORDER_INVALID", index); featureBranchExists = true; pending = null; uncertain = false;
    } else if (entry.entryKind === "feature_workspace_accepted") {
      if (!pending || !featureBranchExists || payload.preparationEntryDigest !== pending.preparationEntryDigest || payload.targetBranch !== "main" || payload.sourceBranch !== context.activePlan.featureBranch || payload.draft !== true) return replayInvalid("STAGE_ORDER_INVALID", index); featureWorkspaceExists = true; pending = null; uncertain = false;
    } else if (entry.entryKind === "child_initiation_accepted") {
      if (!pending || !featureWorkspaceExists || !text(payload.childId) || payload.preparationEntryDigest !== pending.preparationEntryDigest || payload.baseHeadRevision !== terminalHead || payload.baseTreeDigest !== terminalTree || initiated.has(payload.childId as string)) return replayInvalid("STAGE_ORDER_INVALID", index); initiated.add(payload.childId as string); pending = null; uncertain = false;
    } else if (entry.entryKind === "child_implementation_accepted") {
      if (!text(payload.childId) || !initiated.has(payload.childId as string) || implemented.has(payload.childId as string) || !text(payload.sourceMissionId) || payload.sourceMissionId !== payload.childId || !text(payload.effectKey) || context.consumedEffectKeys.includes(payload.effectKey as string)) return replayInvalid("EVIDENCE_INVALID", index); implemented.add(payload.childId as string); context = { ...context, consumedEffectKeys: [...context.consumedEffectKeys, payload.effectKey as string] };
    } else if (entry.entryKind === "child_publication_accepted") {
      if (!pending || !implemented.has(payload.childId as string) || payload.preparationEntryDigest !== pending.preparationEntryDigest || payload.targetBranch !== context.activePlan.featureBranch || payload.draft !== true) return replayInvalid("STAGE_ORDER_INVALID", index); published.add(payload.childId as string); pending = null; uncertain = false;
    } else if (entry.entryKind === "child_evidence_accepted") {
      if (!published.has(payload.childId as string) || !Array.isArray(payload.evidenceDigests) || payload.evidenceDigests.length < 2) return replayInvalid("EVIDENCE_INVALID", index); evidenced.add(payload.childId as string);
    } else if (entry.entryKind === "integration_accepted" || entry.entryKind === "rollback_accepted") {
      if (!pending || payload.preparationEntryDigest !== pending.preparationEntryDigest || !plain(payload.receipt)) return replayInvalid("HEAD_TRANSITION_INVALID", index);
      const receipt = payload.receipt as unknown as FeatureIntegrationReceiptV1 | FeatureRollbackReceiptV1;
      if (receipt.priorHeadRevision !== terminalHead || receipt.priorTreeDigest !== terminalTree || !text(receipt.resultingHeadRevision) || !digestValue(receipt.resultingTreeDigest)) return replayInvalid("HEAD_TRANSITION_INVALID", index);
      if (entry.entryKind === "integration_accepted" && !evidenced.has((receipt as FeatureIntegrationReceiptV1).childId)) return replayInvalid("EVIDENCE_INVALID", index);
      headSequence += 1; terminalHead = receipt.resultingHeadRevision; terminalTree = receipt.resultingTreeDigest; cumulative = "pending"; pending = null; uncertain = false;
    } else if (entry.entryKind === "rollback_workspace_accepted") {
      if (!text(payload.sourceMissionId) || !digestValue(payload.completionReceiptDigest) || !digestValue(payload.restoredTreeDigest)) return replayInvalid("EVIDENCE_INVALID", index);
    } else if (entry.entryKind === "cumulative_validation_accepted" || entry.entryKind === "cumulative_validation_failed") {
      if (!pending || payload.preparationEntryDigest !== pending.preparationEntryDigest || !plain(payload.receipt)) return replayInvalid("CUMULATIVE_VALIDATION_INVALID", index);
      const receipt = payload.receipt as unknown as FeatureCumulativeValidationReceiptV1;
      if (receipt.terminalHeadRevision !== terminalHead || receipt.terminalTreeDigest !== terminalTree || receipt.outcome !== (entry.entryKind === "cumulative_validation_accepted" ? "passed" : "failed")) return replayInvalid("CUMULATIVE_VALIDATION_INVALID", index);
      cumulative = receipt.outcome; pending = null; uncertain = false;
    } else if (entry.entryKind === "operation_paused") { if (context.lifecycle.state !== "active" || pending) return replayInvalid("LIFECYCLE_INVALID", index); context = { ...context, lifecycle: { state: "paused", atOperationSequence: headSequence } }; }
    else if (entry.entryKind === "operation_resumed") { if (context.lifecycle.state !== "paused" || pending) return replayInvalid("LIFECYCLE_INVALID", index); context = { ...context, lifecycle: { state: "active", atOperationSequence: headSequence } }; }
    else if (["operation_cancelled", "operation_split", "operation_superseded", "operation_completed"].includes(entry.entryKind)) {
      if (pending || (entry.entryKind === "operation_completed" && cumulative !== "passed")) return replayInvalid("LIFECYCLE_INVALID", index);
      const state = entry.entryKind === "operation_cancelled" ? "cancelled" : entry.entryKind === "operation_completed" ? "integrated" : "superseded";
      context = { ...context, lifecycle: { state, atOperationSequence: headSequence } };
    }
    const observed = payload.observedAt;
    if (plain(observed) && observed.provenance === "hostTrusted" && timestamp(observed.value)) context = { ...context, observedAt: observed as unknown as { value: string; provenance: "hostTrusted" } };
  }
  const child = context.activePlan.children.find((item) => !context.acceptedIntegrations.some((accepted) => accepted.childId === item.childId && !accepted.reverted));
  let nextStage: FeatureIntegrationNextStageV1 = pending ? "blocked" : !featureBranchExists ? "feature_branch_creation" : !featureWorkspaceExists ? "feature_workspace" : !child ? (cumulative === "passed" ? "completed" : "cumulative_validation") : !initiated.has(child.childId) ? "child_initiation" : !implemented.has(child.childId) ? "implementation_handoff" : !published.has(child.childId) ? "child_publication" : !evidenced.has(child.childId) ? "child_evidence" : "integration";
  if (["paused", "cancelled", "expired", "superseded"].includes(context.lifecycle.state)) nextStage = "lifecycle_only";
  return { state: "valid", value: clone({ replayContext: context, nextEntrySequence: entries.length, activeAuthorityJournalSequence: activeJournal, activeAuthorityOperationSequence: activeOperation, headTransitionOperationSequence: headSequence, terminalHeadRevision: terminalHead, terminalTreeDigest: terminalTree, pendingEffect: pending, uncertainEffect: uncertain, consumedCumulativeValidationEffectKeys: cumulativeKeys, cumulativeValidationAttempts: cumulativeAttempts, cumulativeValidation: cumulative, nextStage, latestObservedAt: context.observedAt }) };
}

export function createFeatureOperationGenesisEntryV1(input: { operationId: string; replayContext: FeatureOperationReplayContextV1 }): FeatureOperationJournalEntryV1 {
  const replay = validateFeatureOperationReplayContextV1(input.replayContext);
  if (replay.state !== "valid" || replay.value.operationId !== input.operationId || replay.value.activePlan.baseBranch !== "main") throw new TypeError("Genesis replay context is invalid.");
  return createFeatureIntegrationEntryV1({ operationId: input.operationId, entrySequence: 0, entryKind: "operation_genesis_accepted", previousEntryDigest: null, payload: { replayContext: replay.value } });
}
