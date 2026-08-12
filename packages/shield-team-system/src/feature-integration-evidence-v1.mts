import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import { canonicalFeatureIntegrationJsonV1, createFeatureIntegrationEntryV1, type FeatureIntegrationReplayProjectionV1, type FeatureOperationJournalEntryV1 } from "./feature-integration-v1.mjs";
import { replayProfileAwareMissionJournal, type ProfileAwareMissionEntryV1 } from "./profile-aware-mission-v1.mjs";
import { validateFeatureOperationDerivedCandidateV1, type ChildImplementationCandidateV1, type ChildIntegrationCandidateV1 } from "./feature-operation-v1.mjs";

export const FEATURE_INTEGRATION_EVIDENCE_CONTRACT_VERSION = "feature.integration.evidence.v1" as const;

export interface GovernedChildCompletionReceiptV1 {
  schemaVersion: 1;
  contractVersion: "feature.integration.evidence.v1";
  childId: string;
  sourceMissionId: string;
  repositoryId: string;
  featureBranch: string;
  childBranch: string;
  baseHeadRevision: string;
  baseTreeDigest: string;
  completionHeadRevision: string;
  completionTreeDigest: string;
  sourceAuthorityDigest: string;
  sourceEffectKey: string;
  sourceJournalDigest: string;
  reasoningRuntimeId: string;
  modelId: string;
  toolExecutorId: string;
  receiptDigest: string;
}

export interface FeatureChildEvidenceV1 {
  schemaVersion: 1;
  evidenceId: string;
  gateType: "mack" | "fury" | "human" | "check" | "ci";
  gateId: string;
  childId: string;
  repositoryId: string;
  headRevision: string;
  sourceRecordDigest: string;
  accepted: boolean;
  synthetic: boolean;
}

type Result<T> = { state: "accepted"; value: Readonly<T> } | { state: "blocked"; reason: string };
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REVISION = /^[0-9a-f]{40}$/u;
function plain(value: unknown): value is Record<string, unknown> { try { return !!value && typeof value === "object" && !Array.isArray(value) && !utilTypes.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype; } catch { return false; } }
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> { return plain(value) && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field)); }
function immutableSnapshot<T>(input: T): Readonly<T> {
  const seen = new WeakSet<object>();
  const visit = (value: unknown): unknown => {
    if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
    if (!value || typeof value !== "object" || utilTypes.isProxy(value)) throw new TypeError("Evidence inputs must be plain data.");
    if (seen.has(value)) throw new TypeError("Evidence inputs must not contain duplicate object references.");
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError("Evidence arrays must be dense plain data.");
      const copy: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) throw new TypeError("Evidence arrays require data properties.");
        copy.push(visit(descriptor.value));
      }
      return Object.freeze(copy);
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("Evidence records must be plain data.");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError("Evidence records must not contain symbol keys.");
    const copy: Record<string, unknown> = {};
    for (const key of (keys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor) || descriptor.value === undefined) throw new TypeError("Evidence records require enumerable data properties.");
      copy[key] = visit(descriptor.value);
    }
    return Object.freeze(copy);
  };
  return visit(input) as Readonly<T>;
}
function snapshot<T>(input: T): Readonly<T> | null { try { return immutableSnapshot(input); } catch { return null; } }
function digest(kind: string, value: unknown, ownField?: string): string {
  const normalized = immutableSnapshot(value);
  if (ownField && !plain(normalized)) throw new TypeError("Evidence digest input must be a plain record.");
  const data = ownField ? Object.fromEntries(Object.entries(normalized as Record<string, unknown>).filter(([field]) => field !== ownField)) : normalized;
  return `sha256:${createHash("sha256").update(`shield.feature-integration.evidence.v1\0${kind}\0${canonicalFeatureIntegrationJsonV1(data)}`, "utf8").digest("hex")}`;
}
function block<T>(reason: string): Result<T> { return { state: "blocked", reason }; }
function accept<T>(value: T): Result<T> { return { state: "accepted", value: immutableSnapshot(value) }; }

export function computeGovernedChildCompletionReceiptDigestV1(input: unknown): string { return digest("child_completion_receipt", input, "receiptDigest"); }
export function computeProfileAwareMissionJournalDigestV1(input: readonly ProfileAwareMissionEntryV1[]): string { return digest("source_mission_journal", input); }

function completionReceipt(input: unknown): GovernedChildCompletionReceiptV1 | null {
  const fields = ["schemaVersion", "contractVersion", "childId", "sourceMissionId", "repositoryId", "featureBranch", "childBranch", "baseHeadRevision", "baseTreeDigest", "completionHeadRevision", "completionTreeDigest", "sourceAuthorityDigest", "sourceEffectKey", "sourceJournalDigest", "reasoningRuntimeId", "modelId", "toolExecutorId", "receiptDigest"];
  const normalized = snapshot(input);
  if (!exact(normalized, fields)) return null; const value = normalized as unknown as GovernedChildCompletionReceiptV1;
  if (value.schemaVersion !== 1 || value.contractVersion !== FEATURE_INTEGRATION_EVIDENCE_CONTRACT_VERSION || value.childId !== value.sourceMissionId || !REVISION.test(value.baseHeadRevision) || !REVISION.test(value.completionHeadRevision) || !DIGEST.test(value.baseTreeDigest) || !DIGEST.test(value.completionTreeDigest) || !DIGEST.test(value.sourceAuthorityDigest) || !DIGEST.test(value.sourceJournalDigest) || !DIGEST.test(value.receiptDigest)) return null;
  if ([value.childId, value.repositoryId, value.featureBranch, value.childBranch, value.sourceEffectKey, value.reasoningRuntimeId, value.modelId, value.toolExecutorId].some((item) => typeof item !== "string" || item.length === 0) || new Set([value.childId, value.reasoningRuntimeId, value.modelId, value.toolExecutorId]).size !== 4) return null;
  return computeGovernedChildCompletionReceiptDigestV1(value) === value.receiptDigest ? value : null;
}
export function validateGovernedChildCompletionReceiptV1(input: unknown): Result<GovernedChildCompletionReceiptV1> { const receipt = completionReceipt(input); return receipt ? accept(receipt) : block("completion_receipt_invalid"); }

export function createChildImplementationHandoffReadyV1(input: { replay: FeatureIntegrationReplayProjectionV1; candidate: ChildImplementationCandidateV1 }): Result<Record<string, unknown>> {
  const normalized = snapshot(input);
  if (!normalized || !plain(normalized) || !plain(normalized.replay)) return block("implementation_handoff_ineligible");
  const checked = validateFeatureOperationDerivedCandidateV1(normalized.candidate);
  const replay = normalized.replay as unknown as FeatureIntegrationReplayProjectionV1;
  if (checked.state !== "valid" || checked.value.derivationKind !== "child_implementation" || replay.nextStage !== "implementation_handoff" || replay.pendingEffect) return block("implementation_handoff_ineligible");
  const candidate = checked.value as ChildImplementationCandidateV1; const child = replay.replayContext.activePlan.children.find((item) => item.childId === candidate.childId);
  if (!child || candidate.childId !== child.childId || candidate.childBranch !== child.branchName || candidate.childBaseRevision !== replay.terminalHeadRevision || candidate.repositoryId !== replay.replayContext.repositoryId || candidate.planDigest !== replay.replayContext.activePlanDigest || candidate.authorityDigest !== replay.replayContext.verifiedAuthorityDigest || replay.replayContext.consumedEffectKeys.includes(candidate.effectKey)) return block("implementation_handoff_mismatch");
  return accept({ state: "implementation_handoff_ready", operationId: candidate.operationId, childId: candidate.childId, requiredSourceMissionId: candidate.childId, repositoryId: candidate.repositoryId, featureBranch: replay.replayContext.activePlan.featureBranch, childBranch: candidate.childBranch, baseHeadRevision: candidate.childBaseRevision, baseTreeDigest: replay.terminalTreeDigest, candidateDigest: candidate.candidateDigest, replayDigest: digest("replay_projection", replay), sourceEffectKey: candidate.effectKey, requiredSourceAuthorityState: "authorized", performsEffect: false });
}

export function acceptGovernedChildCompletionV1(input: { replay: FeatureIntegrationReplayProjectionV1; handoff: Record<string, unknown>; sourceJournal: readonly ProfileAwareMissionEntryV1[]; receipt: GovernedChildCompletionReceiptV1; previousEntryDigest: string }): Result<{ entry: FeatureOperationJournalEntryV1; receipt: GovernedChildCompletionReceiptV1 }> {
  const normalized = snapshot(input);
  if (!normalized || !plain(normalized) || !plain(normalized.replay) || !plain(normalized.handoff) || !Array.isArray(normalized.sourceJournal)) return block("completion_input_invalid");
  const replay = normalized.replay as unknown as FeatureIntegrationReplayProjectionV1;
  const handoff = normalized.handoff as Record<string, unknown>;
  const sourceJournal = normalized.sourceJournal as readonly ProfileAwareMissionEntryV1[];
  const receipt = completionReceipt(normalized.receipt); if (!receipt || handoff.state !== "implementation_handoff_ready") return block("completion_input_invalid");
  if (receipt.childId !== handoff.childId || receipt.sourceMissionId !== handoff.requiredSourceMissionId || receipt.repositoryId !== handoff.repositoryId || receipt.featureBranch !== handoff.featureBranch || receipt.childBranch !== handoff.childBranch || receipt.baseHeadRevision !== handoff.baseHeadRevision || receipt.baseTreeDigest !== handoff.baseTreeDigest || receipt.sourceEffectKey !== handoff.sourceEffectKey || replay.replayContext.consumedEffectKeys.includes(receipt.sourceEffectKey)) return block("completion_binding_mismatch");
  const source = replayProfileAwareMissionJournal(sourceJournal);
  if (source.state !== "valid" || source.value.missionId !== receipt.sourceMissionId || source.value.brief.subjectId.length === 0 || source.value.execution !== "completed" || source.value.implementationAuthorityState !== "authorized" || source.value.implementationAuthorityDigest !== receipt.sourceAuthorityDigest || computeProfileAwareMissionJournalDigestV1(sourceJournal) !== receipt.sourceJournalDigest) return block("source_journal_invalid");
  const effects = source.value.effects.filter((effect) => effect.outcome === "completed" && effect.effectKey === receipt.sourceEffectKey);
  const authority = source.value.implementationAuthority;
  const exactEvidence = [`feature-integration:completion-head:${receipt.completionHeadRevision}`, `feature-integration:completion-tree:${receipt.completionTreeDigest}`, `feature-integration:base-tree:${receipt.baseTreeDigest}`];
  if (effects.length !== 1 || source.value.activeRuntimeBindings.length !== 1 || !authority || authority.repositoryId !== receipt.repositoryId || authority.branch !== receipt.childBranch || authority.headRevision !== receipt.baseHeadRevision || !authority.approvedEffectKeys.includes(receipt.sourceEffectKey) || exactEvidence.some((reference) => !effects[0].evidenceRefs.includes(reference))) return block("source_completion_unverified");
  const runtime = source.value.activeRuntimeBindings[0];
  if (runtime.binding.reasoningRuntimeId !== receipt.reasoningRuntimeId || runtime.modelId !== receipt.modelId || runtime.binding.toolExecutorId !== receipt.toolExecutorId) return block("source_runtime_mismatch");
  const entry = createFeatureIntegrationEntryV1({ operationId: replay.replayContext.operationId, entrySequence: replay.nextEntrySequence, entryKind: "child_implementation_accepted", previousEntryDigest: normalized.previousEntryDigest, payload: { childId: receipt.childId, sourceMissionId: receipt.sourceMissionId, effectKey: receipt.sourceEffectKey, sourceAuthorityDigest: receipt.sourceAuthorityDigest, sourceJournalDigest: receipt.sourceJournalDigest, completionReceiptDigest: receipt.receiptDigest, headRevision: receipt.completionHeadRevision, treeDigest: receipt.completionTreeDigest } });
  return accept({ entry, receipt });
}

function evidence(input: unknown): FeatureChildEvidenceV1 | null {
  const fields = ["schemaVersion", "evidenceId", "gateType", "gateId", "childId", "repositoryId", "headRevision", "sourceRecordDigest", "accepted", "synthetic"];
  const normalized = snapshot(input);
  if (!exact(normalized, fields)) return null; const value = normalized as unknown as FeatureChildEvidenceV1;
  return value.schemaVersion === 1 && ["mack", "fury", "human", "check", "ci"].includes(value.gateType) && typeof value.evidenceId === "string" && typeof value.gateId === "string" && typeof value.childId === "string" && typeof value.repositoryId === "string" && REVISION.test(value.headRevision) && DIGEST.test(value.sourceRecordDigest) && typeof value.accepted === "boolean" && typeof value.synthetic === "boolean" ? value : null;
}

export function bridgeChildIntegrationEvidenceV1(input: { replay: FeatureIntegrationReplayProjectionV1; candidate: ChildIntegrationCandidateV1; evidence: readonly FeatureChildEvidenceV1[]; previousEntryDigest: string }): Result<{ candidate: ChildIntegrationCandidateV1; entry: FeatureOperationJournalEntryV1; evidenceDigests: readonly string[] }> {
  const normalized = snapshot(input);
  if (!normalized || !plain(normalized) || !plain(normalized.replay) || !Array.isArray(normalized.evidence)) return block("integration_candidate_ineligible");
  const checked = validateFeatureOperationDerivedCandidateV1(normalized.candidate); const replay = normalized.replay as unknown as FeatureIntegrationReplayProjectionV1;
  if (checked.state !== "valid" || checked.value.derivationKind !== "child_merge_to_feature" || replay.nextStage !== "child_evidence") return block("integration_candidate_ineligible");
  const candidate = checked.value as ChildIntegrationCandidateV1; const child = replay.replayContext.activePlan.children.find((item) => item.childId === candidate.childId);
  const records = normalized.evidence.map(evidence);
  if (!child || records.some((item) => !item) || records.length !== normalized.evidence.length || records.some((item) => item!.childId !== child.childId || item!.repositoryId !== candidate.repositoryId || item!.headRevision !== candidate.childHeadRevision || !item!.accepted || item!.synthetic)) return block("evidence_binding_mismatch");
  const required = [{ type: "mack", id: "mack" }, { type: "fury", id: "fury" }, ...child.requiredGates.humanGateIds.map((id) => ({ type: "human", id }))];
  if (required.some(({ type, id }) => records.filter((item) => item!.gateType === type && item!.gateId === id).length !== 1)) return block("required_evidence_missing");
  if (new Set(records.map((item) => item!.evidenceId)).size !== records.length || new Set(records.map((item) => item!.sourceRecordDigest)).size !== records.length) return block("duplicate_evidence");
  const evidenceDigests = records.map((item) => item!.sourceRecordDigest).sort();
  if (candidate.reviewEvidenceRefs.length !== required.length || candidate.reviewEvidenceRefs.some((ref) => !records.some((item) => item!.evidenceId === ref))) return block("candidate_evidence_mismatch");
  const evidenceRecords = records.filter((item) => ["mack", "fury", "human"].includes(item!.gateType)).map((item) => ({ evidenceRef: item!.evidenceId, gateType: item!.gateType as "mack" | "fury" | "human", gateId: item!.gateId, childId: item!.childId, repositoryId: item!.repositoryId, headRevision: item!.headRevision, sourceRecordDigest: item!.sourceRecordDigest }));
  const entry = createFeatureIntegrationEntryV1({ operationId: candidate.operationId, entrySequence: replay.nextEntrySequence, entryKind: "child_evidence_accepted", previousEntryDigest: normalized.previousEntryDigest, payload: { childId: candidate.childId, headRevision: candidate.childHeadRevision, evidenceIds: records.map((item) => item!.evidenceId).sort(), evidenceDigests, evidenceRecords } });
  return accept({ candidate, entry, evidenceDigests });
}
