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
function digest(kind: string, value: unknown, ownField?: string): string {
  const data = structuredClone(value) as Record<string, unknown>; if (ownField) delete data[ownField];
  return `sha256:${createHash("sha256").update(`shield.feature-integration.evidence.v1\0${kind}\0${canonicalFeatureIntegrationJsonV1(data)}`, "utf8").digest("hex")}`;
}
function block<T>(reason: string): Result<T> { return { state: "blocked", reason }; }
function accept<T>(value: T): Result<T> { return { state: "accepted", value: Object.freeze(structuredClone(value)) }; }

export function computeGovernedChildCompletionReceiptDigestV1(input: unknown): string { return digest("child_completion_receipt", input, "receiptDigest"); }
export function computeProfileAwareMissionJournalDigestV1(input: readonly ProfileAwareMissionEntryV1[]): string { return digest("source_mission_journal", input); }

function completionReceipt(input: unknown): GovernedChildCompletionReceiptV1 | null {
  const fields = ["schemaVersion", "contractVersion", "childId", "sourceMissionId", "repositoryId", "featureBranch", "childBranch", "baseHeadRevision", "baseTreeDigest", "completionHeadRevision", "completionTreeDigest", "sourceAuthorityDigest", "sourceEffectKey", "sourceJournalDigest", "reasoningRuntimeId", "modelId", "toolExecutorId", "receiptDigest"];
  if (!exact(input, fields)) return null; const value = input as unknown as GovernedChildCompletionReceiptV1;
  if (value.schemaVersion !== 1 || value.contractVersion !== FEATURE_INTEGRATION_EVIDENCE_CONTRACT_VERSION || value.childId !== value.sourceMissionId || !REVISION.test(value.baseHeadRevision) || !REVISION.test(value.completionHeadRevision) || !DIGEST.test(value.baseTreeDigest) || !DIGEST.test(value.completionTreeDigest) || !DIGEST.test(value.sourceAuthorityDigest) || !DIGEST.test(value.sourceJournalDigest) || !DIGEST.test(value.receiptDigest)) return null;
  if ([value.childId, value.repositoryId, value.featureBranch, value.childBranch, value.sourceEffectKey, value.reasoningRuntimeId, value.modelId, value.toolExecutorId].some((item) => typeof item !== "string" || item.length === 0) || new Set([value.childId, value.reasoningRuntimeId, value.modelId, value.toolExecutorId]).size !== 4) return null;
  return computeGovernedChildCompletionReceiptDigestV1(value) === value.receiptDigest ? structuredClone(value) : null;
}
export function validateGovernedChildCompletionReceiptV1(input: unknown): Result<GovernedChildCompletionReceiptV1> { const receipt = completionReceipt(input); return receipt ? accept(receipt) : block("completion_receipt_invalid"); }

export function createChildImplementationHandoffReadyV1(input: { replay: FeatureIntegrationReplayProjectionV1; candidate: ChildImplementationCandidateV1 }): Result<Record<string, unknown>> {
  const checked = validateFeatureOperationDerivedCandidateV1(input?.candidate);
  if (!input?.replay || checked.state !== "valid" || checked.value.derivationKind !== "child_implementation" || input.replay.nextStage !== "implementation_handoff" || input.replay.pendingEffect) return block("implementation_handoff_ineligible");
  const candidate = checked.value as ChildImplementationCandidateV1; const child = input.replay.replayContext.activePlan.children.find((item) => item.childId === candidate.childId);
  if (!child || candidate.childId !== child.childId || candidate.childBranch !== child.branchName || candidate.childBaseRevision !== input.replay.terminalHeadRevision || candidate.repositoryId !== input.replay.replayContext.repositoryId || candidate.planDigest !== input.replay.replayContext.activePlanDigest || candidate.authorityDigest !== input.replay.replayContext.verifiedAuthorityDigest || input.replay.replayContext.consumedEffectKeys.includes(candidate.effectKey)) return block("implementation_handoff_mismatch");
  return accept({ state: "implementation_handoff_ready", operationId: candidate.operationId, childId: candidate.childId, requiredSourceMissionId: candidate.childId, repositoryId: candidate.repositoryId, featureBranch: input.replay.replayContext.activePlan.featureBranch, childBranch: candidate.childBranch, baseHeadRevision: candidate.childBaseRevision, baseTreeDigest: input.replay.terminalTreeDigest, candidateDigest: candidate.candidateDigest, replayDigest: digest("replay_projection", input.replay), sourceEffectKey: candidate.effectKey, requiredSourceAuthorityState: "authorized", performsEffect: false });
}

export function acceptGovernedChildCompletionV1(input: { replay: FeatureIntegrationReplayProjectionV1; handoff: Record<string, unknown>; sourceJournal: readonly ProfileAwareMissionEntryV1[]; receipt: GovernedChildCompletionReceiptV1; previousEntryDigest: string }): Result<{ entry: FeatureOperationJournalEntryV1; receipt: GovernedChildCompletionReceiptV1 }> {
  const receipt = completionReceipt(input?.receipt); if (!receipt || !plain(input?.handoff) || input.handoff.state !== "implementation_handoff_ready") return block("completion_input_invalid");
  if (receipt.childId !== input.handoff.childId || receipt.sourceMissionId !== input.handoff.requiredSourceMissionId || receipt.repositoryId !== input.handoff.repositoryId || receipt.featureBranch !== input.handoff.featureBranch || receipt.childBranch !== input.handoff.childBranch || receipt.baseHeadRevision !== input.handoff.baseHeadRevision || receipt.baseTreeDigest !== input.handoff.baseTreeDigest || receipt.sourceEffectKey !== input.handoff.sourceEffectKey || input.replay.replayContext.consumedEffectKeys.includes(receipt.sourceEffectKey)) return block("completion_binding_mismatch");
  const source = replayProfileAwareMissionJournal(input.sourceJournal);
  if (source.state !== "valid" || source.value.missionId !== receipt.sourceMissionId || source.value.brief.subjectId.length === 0 || source.value.execution !== "completed" || source.value.implementationAuthorityState !== "authorized" || source.value.implementationAuthorityDigest !== receipt.sourceAuthorityDigest || computeProfileAwareMissionJournalDigestV1(input.sourceJournal) !== receipt.sourceJournalDigest) return block("source_journal_invalid");
  const effects = source.value.effects.filter((effect) => effect.outcome === "completed" && effect.effectKey === receipt.sourceEffectKey);
  if (effects.length !== 1 || source.value.activeRuntimeBindings.length !== 1) return block("source_completion_unverified");
  const runtime = source.value.activeRuntimeBindings[0];
  if (runtime.binding.reasoningRuntimeId !== receipt.reasoningRuntimeId || runtime.modelId !== receipt.modelId || runtime.binding.toolExecutorId !== receipt.toolExecutorId) return block("source_runtime_mismatch");
  const entry = createFeatureIntegrationEntryV1({ operationId: input.replay.replayContext.operationId, entrySequence: input.replay.nextEntrySequence, entryKind: "child_implementation_accepted", previousEntryDigest: input.previousEntryDigest, payload: { childId: receipt.childId, sourceMissionId: receipt.sourceMissionId, effectKey: receipt.sourceEffectKey, sourceAuthorityDigest: receipt.sourceAuthorityDigest, sourceJournalDigest: receipt.sourceJournalDigest, completionReceiptDigest: receipt.receiptDigest, headRevision: receipt.completionHeadRevision, treeDigest: receipt.completionTreeDigest } });
  return accept({ entry, receipt });
}

function evidence(input: unknown): FeatureChildEvidenceV1 | null {
  const fields = ["schemaVersion", "evidenceId", "gateType", "gateId", "childId", "repositoryId", "headRevision", "sourceRecordDigest", "accepted", "synthetic"];
  if (!exact(input, fields)) return null; const value = input as unknown as FeatureChildEvidenceV1;
  return value.schemaVersion === 1 && ["mack", "fury", "human", "check", "ci"].includes(value.gateType) && typeof value.evidenceId === "string" && typeof value.gateId === "string" && typeof value.childId === "string" && typeof value.repositoryId === "string" && REVISION.test(value.headRevision) && DIGEST.test(value.sourceRecordDigest) && typeof value.accepted === "boolean" && typeof value.synthetic === "boolean" ? structuredClone(value) : null;
}

export function bridgeChildIntegrationEvidenceV1(input: { replay: FeatureIntegrationReplayProjectionV1; candidate: ChildIntegrationCandidateV1; evidence: readonly FeatureChildEvidenceV1[]; previousEntryDigest: string }): Result<{ candidate: ChildIntegrationCandidateV1; entry: FeatureOperationJournalEntryV1; evidenceDigests: readonly string[] }> {
  const checked = validateFeatureOperationDerivedCandidateV1(input?.candidate); if (checked.state !== "valid" || checked.value.derivationKind !== "child_merge_to_feature" || input?.replay.nextStage !== "child_evidence") return block("integration_candidate_ineligible");
  const candidate = checked.value as ChildIntegrationCandidateV1; const child = input.replay.replayContext.activePlan.children.find((item) => item.childId === candidate.childId);
  const records = Array.isArray(input.evidence) ? input.evidence.map(evidence) : [];
  if (!child || records.some((item) => !item) || records.length !== input.evidence.length || records.some((item) => item!.childId !== child.childId || item!.repositoryId !== candidate.repositoryId || item!.headRevision !== candidate.childHeadRevision || !item!.accepted || item!.synthetic)) return block("evidence_binding_mismatch");
  const required = [{ type: "mack", id: "mack" }, { type: "fury", id: "fury" }, ...child.requiredGates.humanGateIds.map((id) => ({ type: "human", id }))];
  if (required.some(({ type, id }) => records.filter((item) => item!.gateType === type && item!.gateId === id).length !== 1)) return block("required_evidence_missing");
  if (new Set(records.map((item) => item!.evidenceId)).size !== records.length || new Set(records.map((item) => item!.sourceRecordDigest)).size !== records.length) return block("duplicate_evidence");
  const evidenceDigests = records.map((item) => item!.sourceRecordDigest).sort();
  if (candidate.reviewEvidenceRefs.length !== required.length || candidate.reviewEvidenceRefs.some((ref) => !records.some((item) => item!.evidenceId === ref))) return block("candidate_evidence_mismatch");
  const entry = createFeatureIntegrationEntryV1({ operationId: candidate.operationId, entrySequence: input.replay.nextEntrySequence, entryKind: "child_evidence_accepted", previousEntryDigest: input.previousEntryDigest, payload: { childId: candidate.childId, headRevision: candidate.childHeadRevision, evidenceIds: records.map((item) => item!.evidenceId).sort(), evidenceDigests } });
  return accept({ candidate, entry, evidenceDigests });
}
