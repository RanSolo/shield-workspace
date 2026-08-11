import { createHash } from "node:crypto";

import {
  createFeatureIntegrationEntryV1,
  replayFeatureOperationJournalV1,
} from "../dist/feature-integration-v1.mjs";
import { validateFeatureOperationDerivedCandidateV1 } from "../dist/feature-operation-v1.mjs";
import {
  appendFeatureOperationJournalStoreV1,
  readFeatureOperationJournalStoreV1,
} from "../dist/feature-integration-store-v1.mjs";
import {
  createFeatureIntegrationDraftPullRequestV1,
  createFeatureIntegrationRefV1,
  observeFeatureIntegrationDraftPullRequestsV1,
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
    if (!observation.exists) return { state: "not_applied", entryKind: "effect_not_applied", payload: { preparationEntryDigest: prepared.entryDigest, observationProvenance: input.challengeId } };
    if (observation.headRevision !== expectedHead || input.observedTreeDigest === undefined || !DIGEST.test(input.observedTreeDigest)) return block("branch_drift");
    entryKind = candidate.derivationKind === "feature_branch_create" ? "feature_branch_creation_accepted" : "child_initiation_accepted";
    payload = candidate.derivationKind === "feature_branch_create"
      ? { preparationEntryDigest: prepared.entryDigest, headRevision: expectedHead, treeDigest: input.observedTreeDigest, observedAt: input.observedAt, observationProvenance: input.challengeId }
      : { preparationEntryDigest: prepared.entryDigest, childId: candidate.childId, branch: candidate.childBranch, baseHeadRevision: expectedHead, baseTreeDigest: input.observedTreeDigest, observedAt: input.observedAt, observationProvenance: input.challengeId };
  } else {
    if (observation.headBranch !== (candidate.sourceBranch ?? candidate.childBranch) || observation.baseBranch !== candidate.targetBranch) return block("observation_mismatch");
    if (observation.pullRequests.length === 0) return { state: "not_applied", entryKind: "effect_not_applied", payload: { preparationEntryDigest: prepared.entryDigest, observationProvenance: input.challengeId } };
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
  if (reconciled.state === "blocked") return { state: "recovery_required", reason: reconciled.reason, invocation };
  const terminal = createFeatureIntegrationEntryV1({ operationId: prepared.entry.operationId, entrySequence: prepared.entry.entrySequence + 1, entryKind: reconciled.entryKind, previousEntryDigest: prepared.entry.entryDigest, payload: reconciled.payload });
  const terminalResult = await appendFeatureOperationJournalStoreV1({ ...input.storeScope, expectedEntrySequence: terminal.entrySequence, expectedLatestEntryDigest: prepared.entry.entryDigest, entry: terminal });
  return terminalResult.state === "accepted" ? { state: reconciled.state, journal: terminalResult.value.journal, invocation } : terminalResult;
}
