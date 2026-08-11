import { createHash } from "node:crypto";

import {
  computeFeatureIntegrationReceiptDigestV1,
  computeFeatureRollbackReceiptDigestV1,
  createFeatureIntegrationEntryV1,
  replayFeatureOperationJournalV1,
} from "../dist/feature-integration-v1.mjs";
import { validateFeatureOperationDerivedCandidateV1 } from "../dist/feature-operation-v1.mjs";
import { computeProfileAwareMissionJournalDigestV1 } from "../dist/feature-integration-evidence-v1.mjs";
import { replayProfileAwareMissionJournal } from "../dist/profile-aware-mission-v1.mjs";
import {
  appendFeatureOperationJournalStoreV1,
  readFeatureOperationJournalStoreV1,
} from "../dist/feature-integration-store-v1.mjs";
import {
  createFeatureIntegrationDraftPullRequestV1,
  createFeatureIntegrationRefV1,
  integrateFeatureIntegrationPullRequestV1,
  observeFeatureIntegrationCommitV1,
  observeFeatureIntegrationDraftPullRequestsV1,
  observeFeatureIntegrationPullRequestV1,
  observeFeatureIntegrationRefV1,
} from "./adapter-v1.mjs";

const STAGES = Object.freeze({
  feature_branch_creation: "feature_branch_create",
  feature_workspace: "feature_workspace_draft_pr_create",
  child_initiation: "child_initiation",
  child_publication: "child_draft_pr_create",
});
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

function block(reason) { return { state: "blocked", reason }; }
function challenge(value) { return typeof value === "string" && value.length > 0; }
function requestDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

export function prepareFeatureIntegrationWorkspaceEffectV1(input) {
  if (!input || typeof input !== "object" || !input.replay || !input.candidate || !DIGEST.test(input.requestDigest)) return block("invalid_input");
  const candidate = validateFeatureOperationDerivedCandidateV1(input.candidate);
  if (candidate.state !== "valid") return block("candidate_invalid");
  const expected = STAGES[input.replay.nextStage];
  if (!expected || candidate.value.derivationKind !== expected || input.replay.pendingEffect) return block("stage_ineligible");
  if (candidate.value.repositoryId !== input.replay.replayContext.repositoryId || candidate.value.operationId !== input.replay.replayContext.operationId || candidate.value.planDigest !== input.replay.replayContext.activePlanDigest || candidate.value.authorityDigest !== input.replay.replayContext.verifiedAuthorityDigest) return block("identity_mismatch");
  const entry = createFeatureIntegrationEntryV1({
    operationId: candidate.value.operationId,
    entrySequence: input.replay.nextEntrySequence,
    entryKind: "effect_prepared",
    previousEntryDigest: input.previousEntryDigest,
    payload: {
      effectClass: "feature_operation",
      candidate: candidate.value,
      candidateDigest: candidate.value.candidateDigest,
      effectKey: candidate.value.effectKey,
      requestDigest: input.requestDigest,
      expectedHeadRevision: input.replay.terminalHeadRevision,
      expectedTreeDigest: input.replay.terminalTreeDigest,
    },
  });
  return { state: "prepared", entry, candidate: candidate.value };
}

function refInvocation(candidate, challengeId, adapterOptions) {
  if (candidate.derivationKind === "feature_branch_create") return createFeatureIntegrationRefV1({ repositoryId: candidate.repositoryId, fullRef: `refs/heads/${candidate.targetBranch}`, sourceRevision: candidate.sourceRevision, challengeId }, adapterOptions);
  if (candidate.derivationKind === "child_initiation") return createFeatureIntegrationRefV1({ repositoryId: candidate.repositoryId, fullRef: `refs/heads/${candidate.childBranch}`, sourceRevision: candidate.sourceFeatureHead, challengeId }, adapterOptions);
  return null;
}
function prInvocation(candidate, challengeId, publication, adapterOptions) {
  if (!publication || typeof publication.title !== "string" || typeof publication.body !== "string") return block("publication_input_required");
  if (candidate.derivationKind === "feature_workspace_draft_pr_create") return createFeatureIntegrationDraftPullRequestV1({ repositoryId: candidate.repositoryId, headBranch: candidate.sourceBranch, baseBranch: candidate.targetBranch, title: publication.title, body: publication.body, challengeId }, adapterOptions);
  if (candidate.derivationKind === "child_draft_pr_create") return createFeatureIntegrationDraftPullRequestV1({ repositoryId: candidate.repositoryId, headBranch: candidate.childBranch, baseBranch: candidate.targetBranch, title: publication.title, body: publication.body, challengeId }, adapterOptions);
  return null;
}

export function invokeFeatureIntegrationWorkspaceEffectV1(input, adapterOptions = {}) {
  if (!input || input.prepared?.state !== "prepared" || !challenge(input.challengeId)) return block("prepared_effect_required");
  const candidate = input.prepared.candidate;
  return refInvocation(candidate, input.challengeId, adapterOptions) ?? prInvocation(candidate, input.challengeId, input.publication, adapterOptions) ?? block("unsupported_workspace_effect");
}

export function observeFeatureIntegrationWorkspaceEffectV1(input, adapterOptions = {}) {
  if (!input || input.prepared?.state !== "prepared" || !challenge(input.challengeId)) return block("prepared_effect_required");
  const candidate = input.prepared.candidate;
  if (candidate.derivationKind === "feature_branch_create") return observeFeatureIntegrationRefV1({ repositoryId: candidate.repositoryId, fullRef: `refs/heads/${candidate.targetBranch}`, challengeId: input.challengeId }, adapterOptions);
  if (candidate.derivationKind === "child_initiation") return observeFeatureIntegrationRefV1({ repositoryId: candidate.repositoryId, fullRef: `refs/heads/${candidate.childBranch}`, challengeId: input.challengeId }, adapterOptions);
  if (candidate.derivationKind === "feature_workspace_draft_pr_create") return observeFeatureIntegrationDraftPullRequestsV1({ repositoryId: candidate.repositoryId, headBranch: candidate.sourceBranch, baseBranch: candidate.targetBranch, challengeId: input.challengeId }, adapterOptions);
  if (candidate.derivationKind === "child_draft_pr_create") return observeFeatureIntegrationDraftPullRequestsV1({ repositoryId: candidate.repositoryId, headBranch: candidate.childBranch, baseBranch: candidate.targetBranch, challengeId: input.challengeId }, adapterOptions);
  return block("unsupported_workspace_effect");
}

export function reconcileFeatureIntegrationWorkspaceEffectV1(input) {
  if (!input || input.prepared?.state !== "prepared" || !input.observation || !challenge(input.challengeId)) return block("reconciliation_input_required");
  const { candidate, entry: prepared } = input.prepared;
  const observation = input.observation.observation;
  if (input.observation.state !== "observed" || !observation || observation.challengeId !== input.challengeId || observation.repositoryId !== candidate.repositoryId) return block("observation_untrusted");
  let entryKind; let payload;
  if (candidate.derivationKind === "feature_branch_create" || candidate.derivationKind === "child_initiation") {
    const fullRef = `refs/heads/${candidate.derivationKind === "feature_branch_create" ? candidate.targetBranch : candidate.childBranch}`;
    const expectedHead = candidate.derivationKind === "feature_branch_create" ? candidate.sourceRevision : candidate.sourceFeatureHead;
    if (observation.fullRef !== fullRef) return block("observation_mismatch");
    if (!observation.exists) return { state: "not_applied", entryKind: "effect_not_applied", payload: { preparationEntryDigest: prepared.entryDigest, observationProvenance: input.challengeId, observedAt: input.observedAt } };
    if (observation.headRevision !== expectedHead || input.observedTreeDigest === undefined || !DIGEST.test(input.observedTreeDigest)) return block("branch_drift");
    entryKind = candidate.derivationKind === "feature_branch_create" ? "feature_branch_creation_accepted" : "child_initiation_accepted";
    payload = candidate.derivationKind === "feature_branch_create"
      ? { preparationEntryDigest: prepared.entryDigest, headRevision: expectedHead, treeDigest: input.observedTreeDigest, observedAt: input.observedAt, observationProvenance: input.challengeId }
      : { preparationEntryDigest: prepared.entryDigest, childId: candidate.childId, branch: candidate.childBranch, baseHeadRevision: expectedHead, baseTreeDigest: input.observedTreeDigest, observedAt: input.observedAt, observationProvenance: input.challengeId };
  } else {
    if (observation.headBranch !== (candidate.sourceBranch ?? candidate.childBranch) || observation.baseBranch !== candidate.targetBranch) return block("observation_mismatch");
    if (observation.pullRequests.length === 0) return { state: "not_applied", entryKind: "effect_not_applied", payload: { preparationEntryDigest: prepared.entryDigest, observationProvenance: input.challengeId, observedAt: input.observedAt } };
    if (observation.pullRequests.length !== 1) return block("ambiguous_pull_requests");
    const pull = observation.pullRequests[0];
    if (!pull.draft || (candidate.childHeadRevision && pull.headRevision !== candidate.childHeadRevision)) return block("pull_request_mismatch");
    entryKind = candidate.derivationKind === "feature_workspace_draft_pr_create" ? "feature_workspace_accepted" : "child_publication_accepted";
    payload = { preparationEntryDigest: prepared.entryDigest, ...(candidate.childId ? { childId: candidate.childId } : {}), pullRequestId: pull.pullRequestId, sourceBranch: observation.headBranch, targetBranch: observation.baseBranch, headRevision: pull.headRevision, draft: true, observedAt: input.observedAt, observationProvenance: input.challengeId };
  }
  return { state: "accepted", entryKind, payload };
}

/** Executes at most one already-derived workspace stage and journals every boundary. */
export async function executeFeatureIntegrationWorkspaceStageV1(input, adapterOptions = {}) {
  const current = await readFeatureOperationJournalStoreV1(input.storeScope);
  if (current.state !== "accepted" || !current.value.journal) return current;
  const replay = replayFeatureOperationJournalV1(current.value.journal); if (replay.state !== "valid") return block("replay_invalid");
  const prepared = prepareFeatureIntegrationWorkspaceEffectV1({ replay: replay.value, candidate: input.candidate, requestDigest: input.requestDigest ?? requestDigest(input.candidate), previousEntryDigest: current.value.journal.latestAcceptedEntryDigest });
  if (prepared.state !== "prepared") return prepared;
  const appended = await appendFeatureOperationJournalStoreV1({ ...input.storeScope, expectedEntrySequence: replay.value.nextEntrySequence, expectedLatestEntryDigest: current.value.journal.latestAcceptedEntryDigest, entry: prepared.entry });
  if (appended.state !== "accepted") return appended;
  const invocation = invokeFeatureIntegrationWorkspaceEffectV1({ prepared, challengeId: input.challengeId, publication: input.publication }, adapterOptions);
  const observation = observeFeatureIntegrationWorkspaceEffectV1({ prepared, challengeId: input.challengeId }, adapterOptions);
  const reconciled = reconcileFeatureIntegrationWorkspaceEffectV1({ prepared, observation, challengeId: input.challengeId, observedTreeDigest: input.observedTreeDigest, observedAt: input.observedAt });
  if (reconciled.state === "blocked") {
    const uncertain = createFeatureIntegrationEntryV1({ operationId: prepared.entry.operationId, entrySequence: prepared.entry.entrySequence + 1, entryKind: "effect_uncertain", previousEntryDigest: prepared.entry.entryDigest, payload: { preparationEntryDigest: prepared.entry.entryDigest, observationProvenance: input.challengeId, observedAt: input.observedAt } });
    const marked = await appendFeatureOperationJournalStoreV1({ ...input.storeScope, expectedEntrySequence: uncertain.entrySequence, expectedLatestEntryDigest: prepared.entry.entryDigest, entry: uncertain });
    return marked.state === "accepted" ? { state: "recovery_required", reason: reconciled.reason, invocation, journal: marked.value.journal } : marked;
  }
  const terminal = createFeatureIntegrationEntryV1({ operationId: prepared.entry.operationId, entrySequence: prepared.entry.entrySequence + 1, entryKind: reconciled.entryKind, previousEntryDigest: prepared.entry.entryDigest, payload: reconciled.payload });
  const terminalResult = await appendFeatureOperationJournalStoreV1({ ...input.storeScope, expectedEntrySequence: terminal.entrySequence, expectedLatestEntryDigest: prepared.entry.entryDigest, entry: terminal });
  return terminalResult.state === "accepted" ? { state: reconciled.state, journal: terminalResult.value.journal, invocation } : terminalResult;
}

export function createRollbackMissionHandoffReadyV1(input) {
  const replay = input?.replay;
  if (!replay || replay.pendingEffect || replay.cumulativeValidation !== "failed" || replay.replayContext.acceptedIntegrations.length === 0) return block("rollback_handoff_ineligible");
  const latest = [...replay.replayContext.acceptedIntegrations].reverse().find((item) => !item.reverted);
  if (!latest || latest.resultingHeadRevision !== replay.terminalHeadRevision || latest.resultingTreeDigest !== replay.terminalTreeDigest) return block("latest_integration_mismatch");
  const child = replay.replayContext.activePlan.children.find((item) => item.childId === latest.childId);
  const effectKey = child?.allowedEffectKeys.find((key) => key.startsWith("effect:child_revert_on_feature:"));
  if (!child || !effectKey || replay.replayContext.consumedEffectKeys.includes(effectKey)) return block("rollback_key_unavailable");
  return { state: "rollback_mission_handoff_ready", performsEffect: false, operationId: replay.replayContext.operationId, childId: child.childId, requiredSourceMissionId: `rollback:${child.childId}`, repositoryId: replay.replayContext.repositoryId, featureBranch: replay.replayContext.activePlan.featureBranch, currentHeadRevision: replay.terminalHeadRevision, currentTreeDigest: replay.terminalTreeDigest, expectedRestoredTreeDigest: latest.priorTreeDigest, revertedIntegrationReceiptDigest: latest.receiptDigest, reservedFinalEffectKey: effectKey, rollbackBranchRequirement: `rollback/${child.childId.replaceAll(":", "-")}`, draftTargetRequirement: replay.replayContext.activePlan.featureBranch };
}

export function acceptGovernedRollbackWorkspaceV1(input) {
  const handoff = input?.handoff, receipt = input?.receipt;
  if (!handoff || handoff.state !== "rollback_mission_handoff_ready" || !receipt || typeof receipt !== "object") return block("rollback_workspace_input_invalid");
  const required = ["sourceMissionId", "repositoryId", "baseHeadRevision", "rollbackBranch", "restoredTreeDigest", "pullRequestId", "pullRequestHeadRevision", "pullRequestTargetBranch", "draft", "sourceAuthorityDigest", "sourceJournalDigest", "completionReceiptDigest", "sourceEffectKeys", "evidenceDigests"];
  if (Reflect.ownKeys(receipt).length !== required.length || required.some((field) => !Object.hasOwn(receipt, field))) return block("rollback_workspace_receipt_invalid");
  if (receipt.sourceMissionId !== handoff.requiredSourceMissionId || receipt.repositoryId !== handoff.repositoryId || receipt.baseHeadRevision !== handoff.currentHeadRevision || receipt.rollbackBranch !== handoff.rollbackBranchRequirement || receipt.restoredTreeDigest !== handoff.expectedRestoredTreeDigest || receipt.pullRequestTargetBranch !== handoff.draftTargetRequirement || receipt.draft !== true || !Array.isArray(receipt.sourceEffectKeys) || !Array.isArray(receipt.evidenceDigests) || receipt.sourceEffectKeys.length === 0 || receipt.evidenceDigests.length < 2 || receipt.sourceEffectKeys.includes(handoff.reservedFinalEffectKey)) return block("rollback_workspace_binding_mismatch");
  if ([receipt.sourceAuthorityDigest, receipt.sourceJournalDigest, receipt.completionReceiptDigest, receipt.restoredTreeDigest, ...receipt.evidenceDigests].some((item) => !DIGEST.test(item))) return block("rollback_workspace_receipt_invalid");
  const source = replayProfileAwareMissionJournal(input.sourceJournal);
  const authority = source.state === "valid" ? source.value.implementationAuthority : null;
  const effects = source.state === "valid" ? source.value.effects.filter((effect) => effect.outcome === "completed" && receipt.sourceEffectKeys.includes(effect.effectKey)) : [];
  const exactEvidence = [`feature-integration:restored-tree:${receipt.restoredTreeDigest}`, `feature-integration:rollback-head:${receipt.pullRequestHeadRevision}`, `feature-integration:rollback-pr:${receipt.pullRequestId}`];
  if (source.state !== "valid" || source.value.missionId !== receipt.sourceMissionId || source.value.execution !== "completed" || source.value.implementationAuthorityState !== "authorized" || source.value.implementationAuthorityDigest !== receipt.sourceAuthorityDigest || computeProfileAwareMissionJournalDigestV1(input.sourceJournal) !== receipt.sourceJournalDigest || !authority || authority.repositoryId !== receipt.repositoryId || authority.branch !== receipt.rollbackBranch || authority.headRevision !== receipt.baseHeadRevision || effects.length !== receipt.sourceEffectKeys.length || exactEvidence.some((reference) => !effects.some((effect) => effect.evidenceRefs.includes(reference)))) return block("rollback_source_journal_invalid");
  const entry = createFeatureIntegrationEntryV1({ operationId: handoff.operationId, entrySequence: input.replay.nextEntrySequence, entryKind: "rollback_workspace_accepted", previousEntryDigest: input.previousEntryDigest, payload: { childId: handoff.childId, sourceMissionId: receipt.sourceMissionId, completionReceiptDigest: receipt.completionReceiptDigest, sourceAuthorityDigest: receipt.sourceAuthorityDigest, sourceJournalDigest: receipt.sourceJournalDigest, rollbackBranch: receipt.rollbackBranch, pullRequestId: receipt.pullRequestId, pullRequestHeadRevision: receipt.pullRequestHeadRevision, targetBranch: receipt.pullRequestTargetBranch, restoredTreeDigest: receipt.restoredTreeDigest, sourceEffectKeys: [...receipt.sourceEffectKeys].sort(), evidenceDigests: [...receipt.evidenceDigests].sort() } });
  return { state: "accepted", entry };
}

export function prepareFeatureIntegrationTransitionEffectV1(input) {
  const replay = input?.replay;
  const checked = validateFeatureOperationDerivedCandidateV1(input?.candidate);
  if (!replay || checked.state !== "valid" || !["child_merge_to_feature", "child_revert_on_feature"].includes(checked.value.derivationKind) || replay.pendingEffect || !DIGEST.test(input.requestDigest)) return block("transition_candidate_invalid");
  const candidate = checked.value;
  if (candidate.repositoryId !== replay.replayContext.repositoryId || candidate.operationId !== replay.replayContext.operationId || candidate.targetBranch !== replay.replayContext.activePlan.featureBranch || candidate.targetBranch === "main" || candidate.planDigest !== replay.replayContext.activePlanDigest || candidate.authorityDigest !== replay.replayContext.verifiedAuthorityDigest || replay.replayContext.consumedEffectKeys.includes(candidate.effectKey)) return block("transition_binding_mismatch");
  if (candidate.derivationKind === "child_merge_to_feature" && replay.nextStage !== "integration") return block("transition_stage_ineligible");
  if (candidate.derivationKind === "child_revert_on_feature" && replay.replayContext.lifecycle.state !== "rollback_pending") return block("transition_stage_ineligible");
  const entry = createFeatureIntegrationEntryV1({ operationId: candidate.operationId, entrySequence: replay.nextEntrySequence, entryKind: "effect_prepared", previousEntryDigest: input.previousEntryDigest, payload: { effectClass: "feature_operation", candidate, candidateDigest: candidate.candidateDigest, effectKey: candidate.effectKey, requestDigest: input.requestDigest, expectedHeadRevision: replay.terminalHeadRevision, expectedTreeDigest: replay.terminalTreeDigest } });
  return { state: "prepared", entry, candidate };
}

export function invokeFeatureIntegrationTransitionEffectV1(input, adapterOptions = {}) {
  const prepared = input?.prepared;
  if (!prepared || prepared.state !== "prepared" || !challenge(input.challengeId) || !Number.isInteger(input.pullRequestId)) return block("prepared_transition_required");
  const candidate = prepared.candidate;
  const expectedHeadRevision = candidate.derivationKind === "child_merge_to_feature" ? candidate.childHeadRevision : input.rollbackHeadRevision;
  if (!expectedHeadRevision) return block("transition_head_required");
  return integrateFeatureIntegrationPullRequestV1({ repositoryId: candidate.repositoryId, pullRequestId: input.pullRequestId, expectedHeadRevision, targetFeatureBranch: candidate.targetBranch, integrationMethod: candidate.integrationMethod ?? "merge_commit", challengeId: input.challengeId }, adapterOptions);
}

export function observeFeatureIntegrationTransitionV1(input, adapterOptions = {}) {
  const prepared = input?.prepared;
  if (!prepared || prepared.state !== "prepared" || !challenge(input.challengeId) || !Number.isInteger(input.pullRequestId)) return block("prepared_transition_required");
  const candidate = prepared.candidate;
  const pullRequest = observeFeatureIntegrationPullRequestV1({ repositoryId: candidate.repositoryId, pullRequestId: input.pullRequestId, challengeId: input.challengeId }, adapterOptions);
  const featureRef = observeFeatureIntegrationRefV1({ repositoryId: candidate.repositoryId, fullRef: `refs/heads/${candidate.targetBranch}`, challengeId: input.challengeId }, adapterOptions);
  if (pullRequest.state !== "observed" || featureRef.state !== "observed" || !featureRef.observation.exists) return block("transition_observation_unavailable");
  const commit = observeFeatureIntegrationCommitV1({ repositoryId: candidate.repositoryId, headRevision: featureRef.observation.headRevision, challengeId: input.challengeId }, adapterOptions);
  if (commit.state !== "observed") return block("transition_observation_unavailable");
  return { state: "observed", pullRequest: pullRequest.observation, featureRef: featureRef.observation, commit: commit.observation };
}

export function reconcileFeatureIntegrationTransitionV1(input) {
  const prepared = input?.prepared, observed = input?.observation, identity = input?.identity;
  if (!prepared || prepared.state !== "prepared" || observed?.state !== "observed" || !identity || new Set([identity.seatId, identity.reasoningRuntimeId, identity.modelId, identity.toolExecutorId]).size !== 4) return block("transition_reconciliation_invalid");
  const candidate = prepared.candidate, pull = observed.pullRequest, ref = observed.featureRef, commit = observed.commit;
  if (pull.challengeId !== input.challengeId || ref.challengeId !== input.challengeId || commit.challengeId !== input.challengeId || pull.baseBranch !== candidate.targetBranch || !pull.mergedAt || pull.mergeCommitRevision !== ref.headRevision || commit.headRevision !== ref.headRevision || ref.headRevision === input.priorHeadRevision) return block("transition_observation_mismatch");
  if (pull.checks.some((check) => !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(String(check.status).toUpperCase()))) return block("checks_not_passing");
  const common = { schemaVersion: 1, contractVersion: "feature.integration.v1", operationId: candidate.operationId, repositoryId: candidate.repositoryId, planDigest: candidate.planDigest, authorityDigest: candidate.authorityDigest, childId: candidate.childId, effectKey: candidate.effectKey, attemptNumber: input.attemptNumber, priorHeadRevision: input.priorHeadRevision, priorTreeDigest: input.priorTreeDigest, resultingHeadRevision: ref.headRevision, resultingTreeDigest: commit.treeDigest, observationProvenance: input.challengeId, observedAt: input.observedAt, ...identity };
  let receipt, entryKind;
  if (candidate.derivationKind === "child_merge_to_feature") {
    receipt = { ...common, childMissionId: candidate.childId, integrationMethod: candidate.integrationMethod, reconciliationState: "reconciled_applied", childBranch: candidate.childBranch, childHeadRevision: candidate.childHeadRevision, childTreeDigest: candidate.childTreeDigest, childPullRequestId: String(input.pullRequestId), targetFeatureBranch: candidate.targetBranch, evidenceDigests: [...input.evidenceDigests].sort(), receiptDigest: `sha256:${"0".repeat(64)}` };
    receipt.receiptDigest = computeFeatureIntegrationReceiptDigestV1(receipt); entryKind = "integration_accepted";
  } else {
    receipt = { ...common, reconciliationState: "reconciled_applied", revertedIntegrationReceiptDigest: candidate.integrationReceiptDigest, rollbackWorkspaceReceiptDigest: input.rollbackWorkspaceReceiptDigest, receiptDigest: `sha256:${"0".repeat(64)}` };
    receipt.receiptDigest = computeFeatureRollbackReceiptDigestV1(receipt); entryKind = "rollback_accepted";
  }
  const entry = createFeatureIntegrationEntryV1({ operationId: candidate.operationId, entrySequence: prepared.entry.entrySequence + 1, entryKind, previousEntryDigest: prepared.entry.entryDigest, payload: { preparationEntryDigest: prepared.entry.entryDigest, receipt } });
  return { state: "accepted", receipt, entry };
}
