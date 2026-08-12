import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import test from "node:test";

import {
  canonicalFeatureIntegrationJsonV1,
  computeFeatureCumulativeValidationCandidateDigestV1,
  computeFeatureCumulativeValidationReceiptDigestV1,
  computeFeatureIntegrationEntryDigestV1,
  computeFeatureIntegrationEntryDigestV2,
  computeFeatureIntegrationJournalDigestV2,
  computeFeatureObservationProducerBindingsDigestV2,
  computeFeatureHumanBindingsDigestV2,
  computeFeatureIntegrationReceiptDigestV1,
  computeFeatureRollbackReceiptDigestV1,
  computeFeatureIntegrationWorkspaceEffectObservationDigestV1,
  createFeatureIntegrationEntryV1,
  createFeatureIntegrationEntryV2,
  createFeatureOperationGenesisEntryV1,
  createFeatureOperationJournalV1,
  createFeatureOperationJournalV2,
  replayFeatureOperationJournalV1,
  replayFeatureOperationJournalV2,
  secureReplayFeatureOperationJournalV2,
  validateFeatureIntegrationReceiptV1,
  validateFeatureOperationJournalV1,
  validateFeatureOperationJournalV2,
} from "../dist/feature-integration-v1.mjs";
import {
  FEATURE_OPERATION_DERIVATION_KINDS,
  FEATURE_OPERATION_FIXED_EXCLUSIONS,
  FEATURE_OPERATION_PROHIBITED_EFFECTS,
  computeFeatureOperationAuthorityDigestV1,
  computeFeatureOperationDerivedCandidateDigestV1,
  computeFeatureOperationPlanDigestV1,
  computeFeatureOperationAuthorityDigestV2,
  computeFeatureOperationPlanDigestV2,
} from "../dist/feature-operation-v1.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
  computeImplementationAuthorityDigest,
  computeSchema9RuntimeBindingDigest,
} from "../dist/implementation-authority-v1.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const revision = (character) => character.repeat(40);
const effect = (kind, character) => `effect:${kind}:${character.repeat(64)}`;
const privateKey = createPrivateKey({ key: Buffer.from(`302e020100300506032b657004220420${"42".repeat(32)}`, "hex"), format: "der", type: "pkcs8" });
const publicKeySpkiBase64 = createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64");
const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);

function framedV2(domain, value, omitted) {
  const content = structuredClone(value);
  if (omitted) delete content[omitted];
  return `sha256:${createHash("sha256").update(Buffer.concat([
    Buffer.from(domain, "ascii"), Buffer.from([0]), Buffer.from(canonicalFeatureIntegrationJsonV1(content), "utf8"),
  ])).digest("hex")}`;
}

function rawJournalWithEntry(fixture, entryKind, payload) {
  const journal = structuredClone(fixture.journal);
  journal.entries[0].entryKind = entryKind;
  journal.entries[0].payload = payload;
  journal.entries[0].entryDigest = framedV2("shield.feature-integration.entry.v2", journal.entries[0], "entryDigest");
  journal.genesisDigest = journal.entries[0].entryDigest;
  journal.latestAcceptedEntryDigest = journal.entries[0].entryDigest;
  journal.journalDigest = framedV2("shield.feature-integration.journal.v2", journal, "journalDigest");
  return journal;
}

function signAuthorityV2(authority) {
  return { payload: structuredClone(authority), signatureBase64: sign(null, Buffer.concat([
    Buffer.from("shield.feature-operation.authority-signature.v2", "ascii"), Buffer.from([0]),
    Buffer.from(canonicalFeatureIntegrationJsonV1(authority), "utf8"),
  ]), privateKey).toString("base64") };
}

function signAuthority(authority) {
  const bytes = Buffer.concat([
    Buffer.from("shield.feature-operation.authority.signature.v1\0", "ascii"),
    Buffer.from(canonicalFeatureIntegrationJsonV1(authority), "utf8"),
  ]);
  return { payload: structuredClone(authority), signatureBase64: sign(null, bytes, privateKey).toString("base64") };
}

function workspaceObservation(prepared, candidate, { challengeId, observedAt, status = "applied", observedHeadRevision, observedTreeDigest, pullRequests = [] }) {
  const branchEffect = candidate.derivationKind === "feature_branch_create" || candidate.derivationKind === "child_initiation";
  const targetRef = `refs/heads/${candidate.derivationKind === "feature_branch_create" ? candidate.targetBranch : candidate.derivationKind === "feature_workspace_draft_pr_create" ? candidate.sourceBranch : candidate.childBranch}`;
  const observation = {
    schemaVersion: 1,
    contractVersion: "feature.integration.v1",
    observationKind: "workspace_effect",
    preparationEntryDigest: prepared.entryDigest,
    candidateDigest: prepared.payload.candidateDigest,
    effectKey: prepared.payload.effectKey,
    requestDigest: prepared.payload.requestDigest,
    repositoryId: candidate.repositoryId,
    derivationKind: candidate.derivationKind,
    challengeId,
    targetRef,
    targetBaseBranch: branchEffect ? null : candidate.targetBranch,
    expectedHeadRevision: candidate.derivationKind === "feature_branch_create" ? candidate.sourceRevision : candidate.derivationKind === "feature_workspace_draft_pr_create" ? prepared.payload.expectedHeadRevision : candidate.derivationKind === "child_initiation" ? candidate.sourceFeatureHead : candidate.childHeadRevision,
    expectedTreeDigest: candidate.derivationKind === "child_draft_pr_create" ? null : prepared.payload.expectedTreeDigest,
    status,
    observedHeadRevision,
    observedTreeDigest,
    pullRequests,
    observationProvenance: `github:workspace:${challengeId}`,
    observedAt,
    observationDigest: digest("0"),
  };
  observation.observationDigest = computeFeatureIntegrationWorkspaceEffectObservationDigestV1(observation);
  return observation;
}

function replayFixture() {
  const effects = Object.fromEntries(FEATURE_OPERATION_DERIVATION_KINDS.map((kind, index) => [kind, effect(kind, String(index + 1))]));
  let plan = {
    schemaVersion: 1, contractVersion: "feature.operation.v1", operationId: "operation:replay", objective: "Replay exact terminal receipts", sourceProvenance: { authority: "none", sourceRef: "issue:226" }, repositoryId: "repo:shield", baseBranch: "main",
    baseRevision: revision("a"), baseTreeDigest: digest("a"), featureBranch: "feature/replay", acceptanceCriteria: [{ criterionId: "criterion:one", statement: "Complete one child" }],
    children: [{ childId: "mission:child-one", order: 0, objective: "Implement child", dependsOn: [], branchName: "agent/child-one", repositoryId: "repo:shield", riskClassification: "moderate", acceptanceCriterionIds: ["criterion:one"], permittedDerivations: FEATURE_OPERATION_DERIVATION_KINDS.filter((item) => item.startsWith("child_")), allowedRelativePaths: ["packages/child"], allowedActionIds: ["branch_create", "draft_pr_create", "integrate", "repository_edit", "revert"], allowedEffectKeys: Object.values(effects).sort(), allowedCapabilityIds: ["child_branch_write", "child_pr_write", "feature_branch_write", "feature_workspace_pr_write", "repository_write"], allowedValidationIds: ["build", "test"], allowedPublicationOperations: ["draft_pr_create"], requiredGates: { mack: true, fury: true, humanGateIds: ["fitz"] }, exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS, maxImplementationAttempts: 1, maxPublicationAttempts: 1, maxIntegrationAttempts: 1, maxRollbackAttempts: 1, maxRetries: 0 }],
    eligibilityOrder: ["mission:child-one"], integrationPolicy: { targetBranch: "feature/replay", allowedMethods: ["squash"] }, lifecyclePolicy: { amendmentsRequireFreshAuthority: true, pauseSupported: true, cancellationSupported: true, rollbackMethod: "revert_commit", expiryEnforced: true, escalationOnAmbiguity: true }, limits: { maxDurationSeconds: 3600, maxChildren: 1, maxConcurrency: 1, maxFeatureBranchCreateAttempts: 1, maxFeatureWorkspaceDraftPrAttempts: 1, maxTotalChildAttempts: 4, maxTotalIntegrationAttempts: 1, maxTotalRollbackAttempts: 1, maxCapturedEvidence: 10 }, finalGates: { fitzRequired: true, simmons: "conditional", coulsonRequired: true }, exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS, expiresAt: "2029-05-01T01:00:00Z", planSequence: 0, predecessorPlanDigest: null, planDigest: digest("0"),
  };
  plan.planDigest = computeFeatureOperationPlanDigestV1(plan);
  let authority = { schemaVersion: 1, contractVersion: "feature.operation.v1", authorityKind: "epic_wheels_up", authorityId: "authority:replay", missionId: "mission:replay", operationId: plan.operationId, plan, planDigest: plan.planDigest, repositoryId: plan.repositoryId, baseBranch: plan.baseBranch, baseRevision: plan.baseRevision, featureBranch: plan.featureBranch, operationSequence: 0, journalSequence: 0, issuedAt: "2029-05-01T00:00:00Z", expiresAt: plan.expiresAt, limits: plan.limits, permittedDerivations: FEATURE_OPERATION_DERIVATION_KINDS, prohibitedEffects: FEATURE_OPERATION_PROHIBITED_EFFECTS, humanPrincipalId: "human:coulson", humanBindingId: "binding:coulson", signingKeyRef, authorityDigest: digest("0") };
  authority.authorityDigest = computeFeatureOperationAuthorityDigestV1(authority);
  const signedAuthority = signAuthority(authority);
  const trustedBindings = [{ schemaVersion: 1, bindingId: authority.humanBindingId, humanPrincipalId: authority.humanPrincipalId, seatId: "coulson", missionScope: authority.missionId, signingKeyRef, publicKeySpkiBase64, validFromSequence: 0, validThroughSequence: null, attestedBy: "human:hill", provenanceRef: "registry:fixture" }];
  const replayContext = { schemaVersion: 1, contractVersion: "feature.operation.v1", repositoryId: plan.repositoryId, operationId: plan.operationId, activePlan: plan, activePlanDigest: plan.planDigest, verifiedAuthorityId: authority.authorityId, verifiedAuthorityDigest: authority.authorityDigest, acceptedAuthorityOperationSequence: 0, currentJournalSequence: 0, acceptedPlanLineage: [{ planSequence: 0, planDigest: plan.planDigest, predecessorPlanDigest: null, authorityDigest: authority.authorityDigest, active: true }], acceptedAmendmentDigests: [], lifecycle: { state: "active", atOperationSequence: 0 }, transitions: [{ kind: "genesis", operationSequence: 0, effectKey: "effect:genesis", priorHeadRevision: plan.baseRevision, priorTreeDigest: plan.baseTreeDigest, resultingHeadRevision: plan.baseRevision, resultingTreeDigest: plan.baseTreeDigest, receiptDigest: digest("b") }], acceptedIntegrations: [], acceptedRollbacks: [], consumedEffectKeys: ["effect:genesis"], childCounters: [{ childId: "mission:child-one", initiationAttempts: 0, implementationAttempts: 0, publicationAttempts: 0, integrationAttempts: 0, rollbackAttempts: 0, retryAttempts: 0 }], activeLeases: [], operationCounters: { featureBranchCreateAttempts: 0, featureWorkspaceDraftPrAttempts: 0, totalChildAttempts: 0, totalIntegrationAttempts: 0, totalRollbackAttempts: 0, capturedEvidenceCount: 0 }, observedAt: { value: "2029-05-01T00:10:00Z", provenance: "hostTrusted" }, acceptedReviewEvidence: [] };
  const entries = [createFeatureOperationGenesisEntryV1({ operationId: plan.operationId, replayContext, signedAuthority, trustedBindings })];
  const scope = { relativePaths: [], actionIds: [], effectKeys: [], capabilityIds: [], validationIds: [], publicationOperations: [], requiredGates: { mack: false, fury: false, humanGateIds: [] }, exclusions: [], requestedAttempts: 1, requestedRetries: 0 };
  const add = (entryKind, payload) => { const previous = entries.at(-1); entries.push(createFeatureIntegrationEntryV1({ operationId: plan.operationId, entrySequence: entries.length, entryKind, previousEntryDigest: previous.entryDigest, payload })); return entries.at(-1); };
  const candidate = (stage, derivationKind, extra) => { const value = { schemaVersion: 1, contractVersion: "feature.operation.v1", stage, derivationKind, repositoryId: plan.repositoryId, operationId: plan.operationId, planDigest: plan.planDigest, authorityDigest: authority.authorityDigest, effectKey: effects[derivationKind], requestedScope: scope, ...extra, candidateDigest: digest("0") }; value.candidateDigest = computeFeatureOperationDerivedCandidateDigestV1(value); return value; };
  const prepare = (value, requestDigest, head = plan.baseRevision, tree = plan.baseTreeDigest) => add("effect_prepared", { effectClass: "feature_operation", candidate: value, candidateDigest: value.candidateDigest, effectKey: value.effectKey, requestDigest, expectedHeadRevision: head, expectedTreeDigest: tree });
  let workspaceCandidate = candidate("initiation", "feature_branch_create", { sourceRevision: plan.baseRevision, targetBranch: plan.featureBranch });
  let prepared = prepare(workspaceCandidate, digest("c"));
  let observedAt = { value: "2029-05-01T00:11:00Z", provenance: "hostTrusted" };
  let effectObservation = workspaceObservation(prepared, workspaceCandidate, { challengeId: "challenge:branch", observedAt, observedHeadRevision: plan.baseRevision, observedTreeDigest: plan.baseTreeDigest });
  add("feature_branch_creation_accepted", { preparationEntryDigest: prepared.entryDigest, headRevision: plan.baseRevision, treeDigest: plan.baseTreeDigest, observedAt, observationProvenance: effectObservation.observationProvenance, effectObservation });
  workspaceCandidate = candidate("initiation", "feature_workspace_draft_pr_create", { sourceBranch: plan.featureBranch, targetBranch: "main", draftOnly: true });
  prepared = prepare(workspaceCandidate, digest("d"));
  observedAt = { value: "2029-05-01T00:12:00Z", provenance: "hostTrusted" };
  effectObservation = workspaceObservation(prepared, workspaceCandidate, { challengeId: "challenge:workspace", observedAt, observedHeadRevision: plan.baseRevision, observedTreeDigest: plan.baseTreeDigest, pullRequests: [{ pullRequestId: "1", url: "https://github.com/repo/shield/pull/1", draft: true, headBranch: plan.featureBranch, headRevision: plan.baseRevision, baseBranch: "main" }] });
  add("feature_workspace_accepted", { preparationEntryDigest: prepared.entryDigest, pullRequestId: "1", sourceBranch: plan.featureBranch, targetBranch: "main", headRevision: plan.baseRevision, draft: true, observedAt, observationProvenance: effectObservation.observationProvenance, effectObservation });
  workspaceCandidate = candidate("initiation", "child_initiation", { childId: "mission:child-one", sourceFeatureHead: plan.baseRevision, childBranch: "agent/child-one" });
  prepared = prepare(workspaceCandidate, digest("e"));
  observedAt = { value: "2029-05-01T00:13:00Z", provenance: "hostTrusted" };
  effectObservation = workspaceObservation(prepared, workspaceCandidate, { challengeId: "challenge:init", observedAt, observedHeadRevision: plan.baseRevision, observedTreeDigest: plan.baseTreeDigest });
  add("child_initiation_accepted", { preparationEntryDigest: prepared.entryDigest, childId: "mission:child-one", branch: "agent/child-one", baseHeadRevision: plan.baseRevision, baseTreeDigest: plan.baseTreeDigest, observedAt, observationProvenance: effectObservation.observationProvenance, effectObservation });
  add("child_implementation_accepted", { childId: "mission:child-one", sourceMissionId: "mission:child-one", effectKey: effects.child_implementation, sourceAuthorityDigest: digest("f"), sourceJournalDigest: digest("1"), completionReceiptDigest: digest("2"), headRevision: revision("b"), treeDigest: digest("3") });
  workspaceCandidate = candidate("child_publication", "child_draft_pr_create", { childId: "mission:child-one", childBranch: "agent/child-one", childHeadRevision: revision("b"), targetBranch: plan.featureBranch, draftOnly: true });
  prepared = prepare(workspaceCandidate, digest("4"));
  observedAt = { value: "2029-05-01T00:14:00Z", provenance: "hostTrusted" };
  effectObservation = workspaceObservation(prepared, workspaceCandidate, { challengeId: "challenge:publication", observedAt, observedHeadRevision: revision("b"), observedTreeDigest: digest("3"), pullRequests: [{ pullRequestId: "2", url: "https://github.com/repo/shield/pull/2", draft: true, headBranch: "agent/child-one", headRevision: revision("b"), baseBranch: plan.featureBranch }] });
  add("child_publication_accepted", { preparationEntryDigest: prepared.entryDigest, childId: "mission:child-one", pullRequestId: "2", sourceBranch: "agent/child-one", targetBranch: plan.featureBranch, headRevision: revision("b"), draft: true, observedAt, observationProvenance: effectObservation.observationProvenance, effectObservation });
  const evidenceRecords = [{ evidenceRef: "evidence:fitz", gateType: "human", gateId: "fitz", childId: "mission:child-one", repositoryId: plan.repositoryId, headRevision: revision("b"), sourceRecordDigest: digest("5") }, { evidenceRef: "evidence:fury", gateType: "fury", gateId: "fury", childId: "mission:child-one", repositoryId: plan.repositoryId, headRevision: revision("b"), sourceRecordDigest: digest("6") }, { evidenceRef: "evidence:mack", gateType: "mack", gateId: "mack", childId: "mission:child-one", repositoryId: plan.repositoryId, headRevision: revision("b"), sourceRecordDigest: digest("7") }];
  add("child_evidence_accepted", { childId: "mission:child-one", headRevision: revision("b"), evidenceIds: evidenceRecords.map(({ evidenceRef }) => evidenceRef), evidenceDigests: evidenceRecords.map(({ sourceRecordDigest }) => sourceRecordDigest), evidenceRecords });
  const integrationCandidate = candidate("integration", "child_merge_to_feature", { childId: "mission:child-one", childBranch: "agent/child-one", childHeadRevision: revision("b"), childTreeDigest: digest("3"), targetBranch: plan.featureBranch, integrationMethod: "squash", predecessorIntegrationReceiptDigest: null, reviewEvidenceRefs: evidenceRecords.map(({ evidenceRef }) => evidenceRef) });
  const integrationRequestDigest = digest("8"); prepared = prepare(integrationCandidate, integrationRequestDigest);
  const integrationReceipt = { schemaVersion: 1, contractVersion: "feature.integration.v1", operationId: plan.operationId, repositoryId: plan.repositoryId, planDigest: plan.planDigest, authorityDigest: authority.authorityDigest, childId: "mission:child-one", childMissionId: "mission:child-one", effectKey: integrationCandidate.effectKey, requestDigest: integrationRequestDigest, attemptNumber: 1, integrationMethod: "squash", reconciliationState: "applied", priorHeadRevision: plan.baseRevision, priorTreeDigest: plan.baseTreeDigest, childBranch: "agent/child-one", childHeadRevision: revision("b"), childTreeDigest: digest("3"), childPullRequestId: "2", targetFeatureBranch: plan.featureBranch, evidenceDigests: [digest("5"), digest("6"), digest("7")], resultingHeadRevision: revision("c"), resultingTreeDigest: digest("9"), observationProvenance: "github:integration", observedAt: { value: "2029-05-01T00:15:00Z", provenance: "hostTrusted" }, seatId: "may", reasoningRuntimeId: "runtime:may", modelId: "model:may", toolExecutorId: "executor:github", receiptDigest: digest("0") };
  integrationReceipt.receiptDigest = computeFeatureIntegrationReceiptDigestV1(integrationReceipt);
  const integrationEntry = add("integration_accepted", { preparationEntryDigest: prepared.entryDigest, receipt: integrationReceipt });
  const cumulativeCandidate = { schemaVersion: 1, operationId: plan.operationId, authorityDigest: digest("a"), requestDigest: digest("b"), effectKey: "effect:cumulative:one", terminalHeadRevision: integrationReceipt.resultingHeadRevision, terminalTreeDigest: integrationReceipt.resultingTreeDigest, transitionReceiptDigest: integrationReceipt.receiptDigest, candidateDigest: digest("0") };
  cumulativeCandidate.candidateDigest = computeFeatureCumulativeValidationCandidateDigestV1(cumulativeCandidate);
  prepared = add("effect_prepared", { effectClass: "cumulative_validation", candidate: cumulativeCandidate, candidateDigest: cumulativeCandidate.candidateDigest, effectKey: cumulativeCandidate.effectKey, requestDigest: cumulativeCandidate.requestDigest, expectedHeadRevision: integrationReceipt.resultingHeadRevision, expectedTreeDigest: integrationReceipt.resultingTreeDigest });
  const cumulativeReceipt = { schemaVersion: 1, contractVersion: "feature.integration.v1", operationId: plan.operationId, repositoryId: plan.repositoryId, planDigest: plan.planDigest, featureAuthorityDigest: authority.authorityDigest, cumulativeAuthorityDigest: cumulativeCandidate.authorityDigest, effectKey: cumulativeCandidate.effectKey, requestDigest: cumulativeCandidate.requestDigest, transitionReceiptDigest: cumulativeCandidate.transitionReceiptDigest, terminalHeadRevision: cumulativeCandidate.terminalHeadRevision, terminalTreeDigest: cumulativeCandidate.terminalTreeDigest, commandIds: ["test"], targetIds: ["team"], validationIds: ["test"], mackEvidenceDigest: digest("c"), checkObservationDigests: [digest("d")], outcome: "passed", reconciliationState: "applied", observationProvenance: "runner:test", observedAt: { value: "2029-05-01T00:16:00Z", provenance: "hostTrusted" }, seatId: "mack", reasoningRuntimeId: "runtime:mack", modelId: "model:mack", toolExecutorId: "executor:runner", receiptDigest: digest("0") };
  cumulativeReceipt.receiptDigest = computeFeatureCumulativeValidationReceiptDigestV1(cumulativeReceipt);
  const cumulativeEntry = add("cumulative_validation_accepted", { preparationEntryDigest: prepared.entryDigest, receipt: cumulativeReceipt });
  return { entries, integrationEntry, integrationReceipt, cumulativeEntry, cumulativeReceipt, plan, authority, signedAuthority, trustedBindings, replayContext, add, candidate };
}

function prepareRollbackTransition(fixture, observedAt = { value: "2029-05-01T00:17:00Z", provenance: "hostTrusted" }) {
  const completionReceiptDigest = digest("e");
  fixture.add("rollback_workspace_accepted", { childId: "mission:child-one", sourceMissionId: "mission:rollback-one", completionReceiptDigest, sourceAuthorityDigest: digest("f"), sourceJournalDigest: digest("1"), rollbackBranch: "agent/rollback-one", pullRequestId: "3", pullRequestHeadRevision: revision("d"), targetBranch: fixture.plan.featureBranch, restoredTreeDigest: fixture.plan.baseTreeDigest, sourceEffectKeys: ["effect:rollback-source:one"], evidenceDigests: [digest("2")] });
  const rollbackCandidate = fixture.candidate("rollback", "child_revert_on_feature", { childId: "mission:child-one", integrationReceiptDigest: fixture.integrationReceipt.receiptDigest, integrationHeadRevision: fixture.integrationReceipt.resultingHeadRevision, integrationTreeDigest: fixture.integrationReceipt.resultingTreeDigest, expectedRestoredTreeDigest: fixture.integrationReceipt.priorTreeDigest, targetBranch: fixture.plan.featureBranch, rollbackMethod: "revert_commit" });
  const prepared = fixture.add("effect_prepared", { effectClass: "feature_operation", candidate: rollbackCandidate, candidateDigest: rollbackCandidate.candidateDigest, effectKey: rollbackCandidate.effectKey, requestDigest: digest("3"), expectedHeadRevision: fixture.integrationReceipt.resultingHeadRevision, expectedTreeDigest: fixture.integrationReceipt.resultingTreeDigest });
  const receipt = { schemaVersion: 1, contractVersion: "feature.integration.v1", operationId: fixture.plan.operationId, repositoryId: fixture.plan.repositoryId, planDigest: fixture.plan.planDigest, authorityDigest: fixture.authority.authorityDigest, childId: "mission:child-one", effectKey: rollbackCandidate.effectKey, attemptNumber: 1, reconciliationState: "applied", revertedIntegrationReceiptDigest: fixture.integrationReceipt.receiptDigest, rollbackWorkspaceReceiptDigest: completionReceiptDigest, priorHeadRevision: fixture.integrationReceipt.resultingHeadRevision, priorTreeDigest: fixture.integrationReceipt.resultingTreeDigest, resultingHeadRevision: revision("d"), resultingTreeDigest: fixture.integrationReceipt.priorTreeDigest, observationProvenance: "github:rollback", observedAt, seatId: "may", reasoningRuntimeId: "runtime:may", modelId: "model:may", toolExecutorId: "executor:github", receiptDigest: digest("0") };
  receipt.receiptDigest = computeFeatureRollbackReceiptDigestV1(receipt);
  return { prepared, receipt };
}

function appendRollbackTransition(fixture) {
  const { prepared, receipt } = prepareRollbackTransition(fixture);
  fixture.add("rollback_accepted", { preparationEntryDigest: prepared.entryDigest, receipt });
  return receipt;
}

function withPlanDigest(plan, changes) {
  const value = { ...structuredClone(plan), ...structuredClone(changes), planDigest: digest("0") };
  value.planDigest = computeFeatureOperationPlanDigestV1(value);
  return value;
}

function authorityForPlan(fixture, plan, changes = {}) {
  const value = {
    ...structuredClone(fixture.authority),
    authorityId: "authority:replay:successor",
    plan,
    planDigest: plan.planDigest,
    repositoryId: plan.repositoryId,
    baseBranch: plan.baseBranch,
    baseRevision: plan.baseRevision,
    featureBranch: plan.featureBranch,
    operationSequence: 1,
    journalSequence: 1,
    issuedAt: "2029-05-01T00:05:00Z",
    expiresAt: plan.expiresAt,
    limits: plan.limits,
    ...structuredClone(changes),
    authorityDigest: digest("0"),
  };
  value.authorityDigest = computeFeatureOperationAuthorityDigestV1(value);
  return value;
}

function successorFor(fixture, authorityChanges = {}, planChanges = {}) {
  const plan = withPlanDigest(fixture.plan, { planSequence: 1, predecessorPlanDigest: fixture.plan.planDigest, ...planChanges });
  const authority = authorityForPlan(fixture, plan, authorityChanges);
  const signedAuthority = signAuthority(authority);
  const entry = createFeatureIntegrationEntryV1({
    operationId: fixture.plan.operationId,
    entrySequence: 1,
    entryKind: "authority_successor_accepted",
    previousEntryDigest: fixture.entries[0].entryDigest,
    payload: { plan, signedAuthority },
  });
  return { plan, authority, signedAuthority, entry };
}

test("canonical JSON orders by UTF-16 and rejects non-data", () => {
  assert.equal(canonicalFeatureIntegrationJsonV1({ z: 1, a: [true, null] }), '{"a":[true,null],"z":1}');
  assert.throws(() => canonicalFeatureIntegrationJsonV1(new Date()), /plain data/);
  assert.throws(() => canonicalFeatureIntegrationJsonV1(new Array(1)), /dense plain data/);
  assert.throws(() => canonicalFeatureIntegrationJsonV1({ get value() { return "unsafe"; } }), /data properties/);
});

test("entry kind is part of digest framing", () => {
  const common = { operationId: "operation:test", entrySequence: 1, previousEntryDigest: `sha256:${"1".repeat(64)}`, payload: { value: "same" } };
  const prepared = createFeatureIntegrationEntryV1({ ...common, entryKind: "effect_prepared" });
  const uncertain = createFeatureIntegrationEntryV1({ ...common, entryKind: "effect_uncertain" });
  assert.notEqual(prepared.entryDigest, uncertain.entryDigest);
  assert.equal(prepared.entryDigest, computeFeatureIntegrationEntryDigestV1(prepared));
});

test("journal validation rejects broken contiguous lineage", () => {
  const genesis = createFeatureIntegrationEntryV1({ operationId: "operation:test", entrySequence: 0, entryKind: "operation_genesis_accepted", previousEntryDigest: null, payload: {} });
  const journal = createFeatureOperationJournalV1([genesis]);
  assert.equal(validateFeatureOperationJournalV1(journal).state, "valid");
  assert.throws(() => createFeatureOperationJournalV1([{ ...genesis, entrySequence: 1 }]), /invalid|lineage/);
});

test("replay rejects genesis without a verified #225 replay projection", () => {
  const genesis = createFeatureIntegrationEntryV1({ operationId: "operation:test", entrySequence: 0, entryKind: "operation_genesis_accepted", previousEntryDigest: null, payload: {} });
  assert.deepEqual(replayFeatureOperationJournalV1(createFeatureOperationJournalV1([genesis])), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });
});

test("workspace not-applied and uncertain outcomes remain bound to one exact prepared observation", () => {
  const fixture = replayFixture();
  const prepared = fixture.entries[1];
  const candidate = prepared.payload.candidate;
  const observedAt = { value: "2029-05-01T00:11:00Z", provenance: "hostTrusted" };
  const terminal = (entryKind, effectObservation, changes = {}) => createFeatureIntegrationEntryV1({
    operationId: prepared.operationId,
    entrySequence: 2,
    entryKind,
    previousEntryDigest: prepared.entryDigest,
    payload: { preparationEntryDigest: prepared.entryDigest, observationProvenance: effectObservation.observationProvenance, observedAt, effectObservation, ...changes },
  });
  const replay = (entry) => replayFeatureOperationJournalV1(createFeatureOperationJournalV1([fixture.entries[0], prepared, entry]));

  const notAppliedObservation = workspaceObservation(prepared, candidate, { challengeId: "challenge:not-applied", observedAt, status: "not_applied", observedHeadRevision: null, observedTreeDigest: null });
  const notApplied = replay(terminal("effect_not_applied", notAppliedObservation));
  assert.equal(notApplied.state, "valid");
  assert.equal(notApplied.value.pendingEffect, null);

  const uncertainObservation = workspaceObservation(prepared, candidate, { challengeId: "challenge:uncertain", observedAt, status: "uncertain", observedHeadRevision: revision("f"), observedTreeDigest: digest("f") });
  const uncertain = replay(terminal("effect_uncertain", uncertainObservation));
  assert.equal(uncertain.state, "valid");
  assert.equal(uncertain.value.uncertainEffect, true);
  assert.equal(uncertain.value.pendingEffect.preparationEntryDigest, prepared.entryDigest);

  const substituted = { ...notAppliedObservation, requestDigest: digest("9"), observationDigest: digest("0") };
  substituted.observationDigest = computeFeatureIntegrationWorkspaceEffectObservationDigestV1(substituted);
  assert.deepEqual(replay(terminal("effect_not_applied", substituted)), { state: "invalid", reason: "EFFECT_LIFECYCLE_INVALID", entrySequence: 2 });
  assert.deepEqual(replay(terminal("effect_not_applied", notAppliedObservation, { observedAt: { value: "2040-01-01T00:00:00Z", provenance: "hostTrusted" } })), { state: "invalid", reason: "EFFECT_LIFECYCLE_INVALID", entrySequence: 2 });
});

test("genesis activation requires one exact, current signed Coulson authority", () => {
  const fixture = replayFixture();
  assert.equal(replayFeatureOperationJournalV1(createFeatureOperationJournalV1(fixture.entries)).state, "valid");

  const genesis = (signedAuthority, trustedBindings = fixture.trustedBindings) => createFeatureIntegrationEntryV1({
    operationId: fixture.plan.operationId,
    entrySequence: 0,
    entryKind: "operation_genesis_accepted",
    previousEntryDigest: null,
    payload: { replayContext: fixture.replayContext, signedAuthority, trustedBindings },
  });
  const replay = (entry) => replayFeatureOperationJournalV1(createFeatureOperationJournalV1([entry]));

  const staleAuthority = authorityForPlan(fixture, fixture.plan, { authorityId: fixture.authority.authorityId, operationSequence: 0, journalSequence: 0, issuedAt: fixture.authority.issuedAt, expiresAt: "2029-05-01T00:05:00Z" });
  assert.deepEqual(replay(genesis(signAuthority(staleAuthority))), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });

  const substitutedPlan = withPlanDigest(fixture.plan, { objective: "Substituted signed plan" });
  const substitutedAuthority = authorityForPlan(fixture, substitutedPlan, { authorityId: fixture.authority.authorityId, operationSequence: 0, journalSequence: 0, issuedAt: fixture.authority.issuedAt });
  assert.deepEqual(replay(genesis(signAuthority(substitutedAuthority))), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });

  const repositoryPlan = withPlanDigest(fixture.plan, { repositoryId: "repo:substituted", children: fixture.plan.children.map((child) => ({ ...child, repositoryId: "repo:substituted" })) });
  const repositoryAuthority = authorityForPlan(fixture, repositoryPlan, { authorityId: fixture.authority.authorityId, operationSequence: 0, journalSequence: 0, issuedAt: fixture.authority.issuedAt });
  assert.deepEqual(replay(genesis(signAuthority(repositoryAuthority))), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });

  assert.deepEqual(replay(genesis(fixture.signedAuthority, [])), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });
  assert.deepEqual(replay(genesis(fixture.signedAuthority, [...fixture.trustedBindings, structuredClone(fixture.trustedBindings[0])])), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });
  const badSignature = { ...fixture.signedAuthority, signatureBase64: `${fixture.signedAuthority.signatureBase64[0] === "A" ? "B" : "A"}${fixture.signedAuthority.signatureBase64.slice(1)}` };
  assert.deepEqual(replay(genesis(badSignature)), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });
});

test("successor activation requires an exact signed amendment and contiguous authority sequences", () => {
  const fixture = replayFixture();
  const successor = successorFor(fixture);
  const replay = (entries) => replayFeatureOperationJournalV1(createFeatureOperationJournalV1(entries));
  const accepted = replay([fixture.entries[0], successor.entry]);
  assert.equal(accepted.state, "valid");
  assert.equal(accepted.value.activeAuthorityJournalSequence, 1);
  assert.equal(accepted.value.activeAuthorityOperationSequence, 1);
  assert.equal(accepted.value.replayContext.activePlanDigest, successor.plan.planDigest);

  const substitutedPlanEntry = createFeatureIntegrationEntryV1({ ...successor.entry, payload: { plan: fixture.plan, signedAuthority: successor.signedAuthority } });
  assert.deepEqual(replay([fixture.entries[0], substitutedPlanEntry]), { state: "invalid", reason: "AUTHORITY_SUCCESSOR_INVALID", entrySequence: 1 });

  const stale = successorFor(fixture, { expiresAt: "2029-05-01T00:09:00Z" });
  assert.deepEqual(replay([fixture.entries[0], stale.entry]), { state: "invalid", reason: "AUTHORITY_SUCCESSOR_INVALID", entrySequence: 1 });

  const noncontiguous = successorFor(fixture, { operationSequence: 2, journalSequence: 2 });
  assert.deepEqual(replay([fixture.entries[0], noncontiguous.entry]), { state: "invalid", reason: "AUTHORITY_SUCCESSOR_INVALID", entrySequence: 1 });

  const unsigned = createFeatureIntegrationEntryV1({ ...successor.entry, payload: { plan: successor.plan, signedAuthority: successor.authority } });
  assert.deepEqual(replay([fixture.entries[0], unsigned]), { state: "invalid", reason: "AUTHORITY_SUCCESSOR_INVALID", entrySequence: 1 });

  const replayed = createFeatureIntegrationEntryV1({ operationId: fixture.plan.operationId, entrySequence: 2, entryKind: "authority_successor_accepted", previousEntryDigest: successor.entry.entryDigest, payload: successor.entry.payload });
  assert.deepEqual(replay([fixture.entries[0], successor.entry, replayed]), { state: "invalid", reason: "AUTHORITY_SUCCESSOR_INVALID", entrySequence: 2 });
});

test("integration receipts are closed, exact-head bound, and keep seat/runtime/model/executor distinct", () => {
  const receipt = {
    schemaVersion: 1, contractVersion: "feature.integration.v1", operationId: "operation:test", repositoryId: "repo:test", planDigest: `sha256:${"1".repeat(64)}`, authorityDigest: `sha256:${"2".repeat(64)}`,
    childId: "mission:child", childMissionId: "mission:child", effectKey: "effect:child_merge_to_feature:one", requestDigest: `sha256:${"8".repeat(64)}`, attemptNumber: 1, integrationMethod: "squash", reconciliationState: "applied",
    priorHeadRevision: "a".repeat(40), priorTreeDigest: `sha256:${"3".repeat(64)}`, childBranch: "agent/child", childHeadRevision: "b".repeat(40), childTreeDigest: `sha256:${"4".repeat(64)}`,
    childPullRequestId: "7", targetFeatureBranch: "feature/test", evidenceDigests: [`sha256:${"5".repeat(64)}`, `sha256:${"6".repeat(64)}`], resultingHeadRevision: "c".repeat(40), resultingTreeDigest: `sha256:${"7".repeat(64)}`,
    observationProvenance: "github:challenge:one", observedAt: { value: "2029-01-01T00:00:00Z", provenance: "hostTrusted" }, seatId: "may", reasoningRuntimeId: "runtime:may", modelId: "model:may", toolExecutorId: "executor:github", receiptDigest: `sha256:${"0".repeat(64)}`,
  };
  receipt.receiptDigest = computeFeatureIntegrationReceiptDigestV1(receipt);
  assert.equal(validateFeatureIntegrationReceiptV1(receipt).state, "valid");
  assert.equal(validateFeatureIntegrationReceiptV1({ ...receipt, extra: true }).state, "invalid");
  const conflated = { ...receipt, modelId: receipt.reasoningRuntimeId, receiptDigest: `sha256:${"0".repeat(64)}` }; conflated.receiptDigest = computeFeatureIntegrationReceiptDigestV1(conflated);
  assert.equal(validateFeatureIntegrationReceiptV1(conflated).state, "invalid");
});

test("replay rejects self-digested integration receipt substitutions against the exact preparation", () => {
  const fixture = replayFixture();
  assert.equal(replayFeatureOperationJournalV1(createFeatureOperationJournalV1(fixture.entries)).state, "valid");
  const terminalIndex = fixture.integrationEntry.entrySequence;
  const substitutions = [
    { operationId: "operation:substituted" },
    { authorityDigest: digest("e") },
    { requestDigest: digest("f") },
    { effectKey: "effect:child_merge_to_feature:substituted" },
    { childHeadRevision: revision("d") },
  ];
  for (const substitution of substitutions) {
    const receipt = { ...structuredClone(fixture.integrationReceipt), ...substitution, receiptDigest: digest("0") };
    receipt.receiptDigest = computeFeatureIntegrationReceiptDigestV1(receipt);
    assert.equal(validateFeatureIntegrationReceiptV1(receipt).state, "valid");
    const prefix = fixture.entries.slice(0, terminalIndex);
    const prepared = prefix.at(-1);
    const terminal = createFeatureIntegrationEntryV1({ operationId: prepared.operationId, entrySequence: terminalIndex, entryKind: "integration_accepted", previousEntryDigest: prepared.entryDigest, payload: { preparationEntryDigest: prepared.entryDigest, receipt } });
    const replayed = replayFeatureOperationJournalV1(createFeatureOperationJournalV1([...prefix, terminal]));
    assert.equal(replayed.state, "invalid", JSON.stringify(substitution));
  }
});

test("replay rejects self-digested cumulative receipt substitutions against the exact preparation", () => {
  const fixture = replayFixture();
  const terminalIndex = fixture.cumulativeEntry.entrySequence;
  const substitutions = [
    { operationId: "operation:substituted" },
    { cumulativeAuthorityDigest: digest("e") },
    { requestDigest: digest("f") },
    { effectKey: "effect:cumulative:substituted" },
    { transitionReceiptDigest: digest("1") },
  ];
  for (const substitution of substitutions) {
    const receipt = { ...structuredClone(fixture.cumulativeReceipt), ...substitution, receiptDigest: digest("0") };
    receipt.receiptDigest = computeFeatureCumulativeValidationReceiptDigestV1(receipt);
    const prefix = fixture.entries.slice(0, terminalIndex);
    const prepared = prefix.at(-1);
    const terminal = createFeatureIntegrationEntryV1({ operationId: prepared.operationId, entrySequence: terminalIndex, entryKind: "cumulative_validation_accepted", previousEntryDigest: prepared.entryDigest, payload: { preparationEntryDigest: prepared.entryDigest, receipt } });
    const replayed = replayFeatureOperationJournalV1(createFeatureOperationJournalV1([...prefix, terminal]));
    assert.equal(replayed.state, "invalid", JSON.stringify(substitution));
  }
});

test("a new head transition resets only cumulative attempt accounting and retains historical keys", () => {
  const fixture = replayFixture();
  const rollbackReceipt = appendRollbackTransition(fixture);
  const afterTransition = replayFeatureOperationJournalV1(createFeatureOperationJournalV1(fixture.entries));
  assert.equal(afterTransition.state, "valid");
  assert.equal(afterTransition.value.cumulativeValidationAttempts, 0);
  assert.deepEqual(afterTransition.value.consumedCumulativeValidationEffectKeys, ["effect:cumulative:one"]);
  assert.equal(afterTransition.value.cumulativeValidation, "pending");

  const freshCandidate = { schemaVersion: 1, operationId: fixture.plan.operationId, authorityDigest: digest("4"), requestDigest: digest("5"), effectKey: "effect:cumulative:two", terminalHeadRevision: rollbackReceipt.resultingHeadRevision, terminalTreeDigest: rollbackReceipt.resultingTreeDigest, transitionReceiptDigest: rollbackReceipt.receiptDigest, candidateDigest: digest("0") };
  freshCandidate.candidateDigest = computeFeatureCumulativeValidationCandidateDigestV1(freshCandidate);
  fixture.add("effect_prepared", { effectClass: "cumulative_validation", candidate: freshCandidate, candidateDigest: freshCandidate.candidateDigest, effectKey: freshCandidate.effectKey, requestDigest: freshCandidate.requestDigest, expectedHeadRevision: freshCandidate.terminalHeadRevision, expectedTreeDigest: freshCandidate.terminalTreeDigest });
  const prepared = replayFeatureOperationJournalV1(createFeatureOperationJournalV1(fixture.entries));
  assert.equal(prepared.state, "valid");
  assert.equal(prepared.value.cumulativeValidationAttempts, 1);
  assert.deepEqual(prepared.value.consumedCumulativeValidationEffectKeys, ["effect:cumulative:one", "effect:cumulative:two"]);
});

test("replay rejects historical keys and cross-transition cumulative receipts after a new transition", () => {
  for (const substitution of [
    { effectKey: "effect:cumulative:one" },
    { transitionReceiptDigest: replayFixture().integrationReceipt.receiptDigest },
  ]) {
    const fixture = replayFixture();
    const rollbackReceipt = appendRollbackTransition(fixture);
    const candidate = { schemaVersion: 1, operationId: fixture.plan.operationId, authorityDigest: digest("4"), requestDigest: digest("5"), effectKey: "effect:cumulative:two", terminalHeadRevision: rollbackReceipt.resultingHeadRevision, terminalTreeDigest: rollbackReceipt.resultingTreeDigest, transitionReceiptDigest: rollbackReceipt.receiptDigest, ...substitution, candidateDigest: digest("0") };
    candidate.candidateDigest = computeFeatureCumulativeValidationCandidateDigestV1(candidate);
    fixture.add("effect_prepared", { effectClass: "cumulative_validation", candidate, candidateDigest: candidate.candidateDigest, effectKey: candidate.effectKey, requestDigest: candidate.requestDigest, expectedHeadRevision: candidate.terminalHeadRevision, expectedTreeDigest: candidate.terminalTreeDigest });
    assert.deepEqual(replayFeatureOperationJournalV1(createFeatureOperationJournalV1(fixture.entries)), { state: "invalid", reason: "EFFECT_LIFECYCLE_INVALID", entrySequence: fixture.entries.length - 1 });
  }
});

test("terminal rollback reconciliation preserves disposition and exposes only fresh cumulative validation after application", () => {
  const dispositions = [
    { name: "cancellation", lifecycle: "cancelled", entryKind: "operation_cancelled", dispositionAt: "2029-05-01T00:17:00Z", outcomeAt: "2029-05-01T00:18:00Z", payload: { reason: "operator_cancelled" } },
    { name: "expiry", lifecycle: "expired", entryKind: null, dispositionAt: "2029-05-01T01:00:00Z", outcomeAt: "2029-05-01T01:01:00Z", payload: {} },
    { name: "supersession", lifecycle: "superseded", entryKind: "operation_superseded", dispositionAt: "2029-05-01T00:17:00Z", outcomeAt: "2029-05-01T00:18:00Z", payload: { successorOperationId: "operation:successor", successorPlanDigest: digest("6"), successorAuthorityDigest: digest("7") } },
  ];
  const outcomes = ["applied", "not_applied", "uncertain"];

  for (const disposition of dispositions) {
    for (const outcome of outcomes) {
      const fixture = replayFixture();
      const outcomeObservedAt = { value: disposition.outcomeAt, provenance: "hostTrusted" };
      const { prepared, receipt } = prepareRollbackTransition(fixture, outcomeObservedAt);
      const dispositionObservedAt = { value: disposition.dispositionAt, provenance: "hostTrusted" };
      if (disposition.entryKind) fixture.add(disposition.entryKind, { observedAt: dispositionObservedAt, ...disposition.payload });
      else fixture.add("effect_uncertain", { preparationEntryDigest: prepared.entryDigest, observationProvenance: "github:rollback:expiry", observedAt: dispositionObservedAt });

      if (outcome === "applied") fixture.add("rollback_accepted", { preparationEntryDigest: prepared.entryDigest, receipt });
      else if (outcome === "not_applied") fixture.add("effect_not_applied", { preparationEntryDigest: prepared.entryDigest, observationProvenance: `github:rollback:${disposition.name}:not-applied`, observedAt: outcomeObservedAt });
      else if (disposition.entryKind) fixture.add("effect_uncertain", { preparationEntryDigest: prepared.entryDigest, observationProvenance: `github:rollback:${disposition.name}:uncertain`, observedAt: outcomeObservedAt });

      const replayed = replayFeatureOperationJournalV1(createFeatureOperationJournalV1(fixture.entries));
      assert.equal(replayed.state, "valid", `${disposition.name}:${outcome}`);
      assert.equal(replayed.value.replayContext.lifecycle.state, disposition.lifecycle, `${disposition.name}:${outcome}:lifecycle`);
      assert.equal(replayed.value.replayContext.lifecycle.atOperationSequence, 1, `${disposition.name}:${outcome}:terminal-sequence`);
      assert.equal(replayed.value.replayContext.operationCounters.totalRollbackAttempts, 1, `${disposition.name}:${outcome}:attempts`);
      assert.equal(replayed.value.replayContext.consumedEffectKeys.includes(prepared.payload.effectKey), true, `${disposition.name}:${outcome}:effect-key`);

      if (outcome === "applied") {
        assert.equal(replayed.value.terminalHeadRevision, receipt.resultingHeadRevision, `${disposition.name}:applied:head`);
        assert.equal(replayed.value.terminalTreeDigest, receipt.resultingTreeDigest, `${disposition.name}:applied:tree`);
        assert.equal(replayed.value.headTransitionOperationSequence, 2, `${disposition.name}:applied:transition-sequence`);
        assert.equal(replayed.value.cumulativeValidation, "pending", `${disposition.name}:applied:cumulative`);
        assert.equal(replayed.value.nextStage, "cumulative_validation", `${disposition.name}:applied:stage`);

        const cumulativeCandidate = { schemaVersion: 1, operationId: fixture.plan.operationId, authorityDigest: digest("4"), requestDigest: digest("5"), effectKey: `effect:cumulative:terminal-${disposition.name}`, terminalHeadRevision: receipt.resultingHeadRevision, terminalTreeDigest: receipt.resultingTreeDigest, transitionReceiptDigest: receipt.receiptDigest, candidateDigest: digest("0") };
        cumulativeCandidate.candidateDigest = computeFeatureCumulativeValidationCandidateDigestV1(cumulativeCandidate);
        fixture.add("effect_prepared", { effectClass: "cumulative_validation", candidate: cumulativeCandidate, candidateDigest: cumulativeCandidate.candidateDigest, effectKey: cumulativeCandidate.effectKey, requestDigest: cumulativeCandidate.requestDigest, expectedHeadRevision: cumulativeCandidate.terminalHeadRevision, expectedTreeDigest: cumulativeCandidate.terminalTreeDigest });
        const validationPrepared = replayFeatureOperationJournalV1(createFeatureOperationJournalV1(fixture.entries));
        assert.equal(validationPrepared.state, "valid", `${disposition.name}:cumulative-prepared`);
        assert.equal(validationPrepared.value.replayContext.lifecycle.state, disposition.lifecycle, `${disposition.name}:cumulative-preserves-lifecycle`);
        assert.equal(validationPrepared.value.nextStage, "blocked", `${disposition.name}:cumulative-prepared-stage`);
      } else {
        assert.equal(replayed.value.terminalHeadRevision, fixture.integrationReceipt.resultingHeadRevision, `${disposition.name}:${outcome}:head`);
        assert.equal(replayed.value.terminalTreeDigest, fixture.integrationReceipt.resultingTreeDigest, `${disposition.name}:${outcome}:tree`);
        assert.equal(replayed.value.headTransitionOperationSequence, 1, `${disposition.name}:${outcome}:transition-sequence`);
        assert.equal(replayed.value.nextStage, outcome === "uncertain" ? "blocked" : "lifecycle_only", `${disposition.name}:${outcome}:stage`);
        assert.equal(replayed.value.uncertainEffect, outcome === "uncertain", `${disposition.name}:${outcome}:uncertain`);
        assert.equal(replayed.value.pendingEffect === null, outcome === "not_applied", `${disposition.name}:${outcome}:pending`);
      }
    }
  }
});

function hardenedGenesisFixture() {
  const legacy = replayFixture();
  const fitzBinding = {
    ...structuredClone(legacy.trustedBindings[0]),
    bindingId: "binding:fitz",
    humanPrincipalId: "human:fitz",
    seatId: "fitz",
    validFromSequence: 3,
  };
  const humanBindings = [{ ...structuredClone(legacy.trustedBindings[0]), validFromSequence: 3 }, fitzBinding];
  const producerBindings = [
    { schemaVersion: 2, producerId: "producer:github", producerKind: "github_repository", publicKeySpkiBase64, signingKeyRef },
    { schemaVersion: 2, producerId: "producer:cumulative", producerKind: "cumulative_execution", publicKeySpkiBase64, signingKeyRef },
  ];
  const hardenedPlan = {
    ...structuredClone(legacy.plan),
    schemaVersion: 2,
    contractVersion: "feature.operation.v2",
    protocol: {
      version: 2,
      observationProducerBindingsDigest: computeFeatureObservationProducerBindingsDigestV2(producerBindings),
      humanBindingsDigest: computeFeatureHumanBindingsDigestV2(humanBindings),
    },
    finalGates: { policyVersion: 2, fitzRequired: true, simmonsRequired: false, coulsonRequired: true },
    planDigest: digest("0"),
  };
  hardenedPlan.planDigest = computeFeatureOperationPlanDigestV2(hardenedPlan);
  const hardenedAuthority = {
    ...structuredClone(legacy.authority),
    schemaVersion: 2,
    contractVersion: "feature.operation.v2",
    plan: hardenedPlan,
    planDigest: hardenedPlan.planDigest,
    authorityDigest: digest("0"),
  };
  hardenedAuthority.authorityDigest = computeFeatureOperationAuthorityDigestV2(hardenedAuthority);
  const signedAuthority = {
    payload: structuredClone(hardenedAuthority),
    signatureBase64: sign(null, Buffer.concat([
      Buffer.from("shield.feature-operation.authority-signature.v2", "ascii"), Buffer.from([0]),
      Buffer.from(canonicalFeatureIntegrationJsonV1(hardenedAuthority), "utf8"),
    ]), privateKey).toString("base64"),
  };
  const replayContext = {
    ...structuredClone(legacy.replayContext),
    schemaVersion: 2,
    contractVersion: "feature.operation.v2",
    activePlan: hardenedPlan,
    activePlanDigest: hardenedPlan.planDigest,
    verifiedAuthorityDigest: hardenedAuthority.authorityDigest,
    acceptedPlanLineage: [{ planSequence: 0, planDigest: hardenedPlan.planDigest, predecessorPlanDigest: null, authorityDigest: hardenedAuthority.authorityDigest, active: true }],
  };
  const sourceImplementationAuthority = {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: "authority:implementation:226",
    missionId: hardenedAuthority.missionId,
    subjectId: "issue:226",
    seatId: "may",
    missionRevisionId: "sha256:mission_revision",
    artifactRevisionId: "sha256:artifact_revision",
    repositoryId: hardenedAuthority.repositoryId,
    canonicalWritableRoot: "/workspace/shield",
    branch: "main",
    baseRevision: "sha256:base_revision",
    headRevision: "sha256:head_revision",
    modelId: "model:gpt-5.6-sol",
    approvedRelativePaths: ["packages/shield-team-system"],
    approvedActionIds: ["edit:implementation"],
    approvedEffectClasses: ["verification"],
    approvedEffectKeys: ["effect:verify"],
    approvedCapabilities: ["filesystem_write"],
    validationCommandIds: ["validation:test"],
    journalSequence: 1,
    humanPrincipalId: "human:coulson",
    humanBindingId: "binding:coulson",
    signingKeyRef,
    sourceRef: "source:authority:226",
    evidenceRef: "evidence:authority:226",
    timestamp: { value: "2026-08-12T00:00:00Z", provenance: "humanRecorded" },
  };
  const runtimeBinding = {
    bindingSchemaVersion: 1,
    bindingId: "binding:may:runtime",
    bindingVersion: 1,
    missionId: hardenedAuthority.missionId,
    subjectId: sourceImplementationAuthority.subjectId,
    missionRevisionId: sourceImplementationAuthority.missionRevisionId,
    seatId: "may",
    reasoningRuntimeId: "runtime:codex-hosted-may-sol-high",
    toolExecutorId: "executor:codex-hosted-workspace-tools",
    repositoryId: hardenedAuthority.repositoryId,
    canonicalWritableRoot: sourceImplementationAuthority.canonicalWritableRoot,
    branch: "main",
    artifactRevisionId: sourceImplementationAuthority.artifactRevisionId,
    recordedAtSequence: 3,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: { actionIds: ["edit:implementation"], effectClasses: ["verification"], effectKeys: ["effect:verify"], capabilities: ["filesystem_write"] },
    coulsonAuthorizationRef: "authorization:runtime-binding:recorded",
  };
  const sourceRuntimeBinding = {
    schemaVersion: 1,
    binding: runtimeBinding,
    implementationAuthorityRef: sourceImplementationAuthority.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(sourceImplementationAuthority),
    implementationAuthoritySequence: sourceImplementationAuthority.journalSequence,
    approvedRelativePaths: sourceImplementationAuthority.approvedRelativePaths,
    validationCommandIds: sourceImplementationAuthority.validationCommandIds,
    modelId: sourceImplementationAuthority.modelId,
    baseRevision: sourceImplementationAuthority.baseRevision,
    headRevision: sourceImplementationAuthority.headRevision,
  };
  assert.match(computeSchema9RuntimeBindingDigest(sourceRuntimeBinding), /^sha256:/);
  const trustAnchor = {
    missionId: hardenedAuthority.missionId,
    repositoryId: hardenedAuthority.repositoryId,
    humanBindingsDigest: hardenedPlan.protocol.humanBindingsDigest,
    trustedHumanBindings: humanBindings,
    sourceBindingSequence: 3,
    sourceImplementationAuthority,
    sourceImplementationAuthorityDigest: computeImplementationAuthorityDigest(sourceImplementationAuthority),
    sourceRuntimeBinding,
    sourceJournalDigest: digest("d"),
  };
  const genesis = createFeatureIntegrationEntryV2({
    operationId: hardenedPlan.operationId,
    entrySequence: 0,
    entryKind: "operation_genesis_accepted",
    previousEntryDigest: null,
    payload: { replayContext, signedAuthority, trustedObservationProducerBindings: producerBindings, trustedHumanBindings: humanBindings },
  });
  const journal = createFeatureOperationJournalV2([genesis]);
  return { ...legacy, producerBindings, humanBindings, hardenedPlan, hardenedAuthority, signedAuthority, replayContext, trustAnchor, genesis, journal };
}

test("normalizes immutable V2 producer and human trust roots with exact digest framing", () => {
  const fixture = hardenedGenesisFixture();
  const producerDigest = computeFeatureObservationProducerBindingsDigestV2(fixture.producerBindings);
  const humanDigest = computeFeatureHumanBindingsDigestV2(fixture.humanBindings);
  assert.equal(producerDigest, "sha256:138b43b00ad7d2da3bc6653347f8d92c9f49f83d9e188d921166d9e294747885");
  assert.equal(humanDigest, "sha256:11a63feaa628c2522048d0b0118c8ac3c04a980d089eed68707a3bddeb93a0c3");
  assert.equal(producerDigest, computeFeatureObservationProducerBindingsDigestV2([...fixture.producerBindings].reverse()));
  assert.equal(humanDigest, computeFeatureHumanBindingsDigestV2([...fixture.humanBindings].reverse()));
  const independent = (domain, value) => `sha256:${createHash("sha256").update(Buffer.concat([
    Buffer.from(domain, "ascii"), Buffer.from([0]), Buffer.from(canonicalFeatureIntegrationJsonV1(value), "utf8"),
  ])).digest("hex")}`;
  const sortedProducers = [...fixture.producerBindings].sort((left, right) => left.producerKind < right.producerKind ? -1 : left.producerKind > right.producerKind ? 1 : left.producerId < right.producerId ? -1 : 1);
  const sortedHumans = [...fixture.humanBindings].sort((left, right) => left.seatId < right.seatId ? -1 : left.seatId > right.seatId ? 1 : left.humanPrincipalId < right.humanPrincipalId ? -1 : 1);
  assert.equal(producerDigest, independent("shield.feature-integration.observation-bindings.v2", sortedProducers));
  assert.equal(humanDigest, independent("shield.feature-integration.human-bindings.v2", sortedHumans));
  assert.throws(() => computeFeatureObservationProducerBindingsDigestV2([fixture.producerBindings[0], fixture.producerBindings[0]]));
  assert.throws(() => computeFeatureObservationProducerBindingsDigestV2([fixture.producerBindings[0], { ...fixture.producerBindings[1], producerKind: "github_repository" }]));
  assert.throws(() => computeFeatureObservationProducerBindingsDigestV2([{ ...fixture.producerBindings[0], signingKeyRef: "ed25519:sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }, fixture.producerBindings[1]]));
  assert.throws(() => computeFeatureHumanBindingsDigestV2([...fixture.humanBindings, { ...fixture.humanBindings[0], bindingId: "binding:coulson:duplicate" }]));
});

test("admits only exact hardened genesis and blocks legacy journals without V1 replay", () => {
  const fixture = hardenedGenesisFixture();
  assert.equal(validateFeatureOperationJournalV2(fixture.journal).state, "valid");
  assert.equal(Object.isFrozen(fixture.journal.entries[0].payload.trustedObservationProducerBindings[0]), true);
  assert.equal(fixture.genesis.entryDigest, computeFeatureIntegrationEntryDigestV2(fixture.genesis));
  assert.equal(fixture.journal.journalDigest, computeFeatureIntegrationJournalDigestV2(fixture.journal));
  const replay = replayFeatureOperationJournalV2(fixture.journal, fixture.trustAnchor);
  assert.equal(replay.state, "valid", JSON.stringify(replay));
  assert.equal(replay.value.lifecycle, "active");
  assert.deepEqual(secureReplayFeatureOperationJournalV2(fixture.journal, fixture.trustAnchor), replay);
  assert.deepEqual(secureReplayFeatureOperationJournalV2(createFeatureOperationJournalV1([fixture.entries[0]]), fixture.trustAnchor), {
    state: "blocked", reason: "LEGACY_JOURNAL_UNTRUSTED", entrySequence: null,
  });
  assert.deepEqual(secureReplayFeatureOperationJournalV2({ ...fixture.journal, schemaVersion: 1 }, fixture.trustAnchor), {
    state: "invalid", reason: "JOURNAL_INVALID", entrySequence: null,
  });
  const extraPayload = structuredClone(fixture.journal);
  extraPayload.entries[0].payload.extra = true;
  extraPayload.journalDigest = computeFeatureIntegrationJournalDigestV2(extraPayload);
  assert.deepEqual(replayFeatureOperationJournalV2(extraPayload, fixture.trustAnchor), { state: "invalid", reason: "ENTRY_INVALID", entrySequence: 0 });
  const accessor = structuredClone(fixture.journal);
  Object.defineProperty(accessor, "entries", { enumerable: true, get: () => fixture.journal.entries });
  assert.deepEqual(secureReplayFeatureOperationJournalV2(accessor, fixture.trustAnchor), { state: "invalid", reason: "JOURNAL_INVALID", entrySequence: null });
  assert.deepEqual(secureReplayFeatureOperationJournalV2(new Proxy(fixture.journal, {}), fixture.trustAnchor), { state: "invalid", reason: "JOURNAL_INVALID", entrySequence: null });
  const substituted = structuredClone(fixture.journal);
  substituted.entries[0].payload.trustedObservationProducerBindings[0].producerId = "producer:substituted";
  substituted.entries[0].entryDigest = computeFeatureIntegrationEntryDigestV2(substituted.entries[0]);
  substituted.genesisDigest = substituted.entries[0].entryDigest;
  substituted.latestAcceptedEntryDigest = substituted.entries[0].entryDigest;
  substituted.journalDigest = computeFeatureIntegrationJournalDigestV2(substituted);
  assert.deepEqual(replayFeatureOperationJournalV2(substituted, fixture.trustAnchor), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });
});

test("rejects malformed nested payloads for every V2 entry kind before lineage or replay", () => {
  const fixture = hardenedGenesisFixture();
  const malformed = {
    operation_genesis_accepted: { replayContext: 3, signedAuthority: 3, trustedObservationProducerBindings: 3, trustedHumanBindings: 3 },
    authority_successor_accepted: { plan: 3, signedAuthority: 3 },
    effect_prepared: { effectClass: "workspace", candidate: 3, candidateDigest: digest("1"), effectKey: "effect:x", request: 3, requestDigest: digest("2"), expectedHeadRevision: revision("a"), expectedTreeDigest: digest("3"), signedCumulativeAuthority: null },
    effect_challenge_refreshed: { preparationEntryDigest: digest("1"), signedChallenge: 3 },
    effect_not_applied: { preparationEntryDigest: digest("1"), signedObservation: 3 },
    effect_uncertain: { preparationEntryDigest: digest("1"), signedObservation: 3 },
    feature_branch_creation_accepted: { preparationEntryDigest: digest("1"), headRevision: revision("a"), treeDigest: digest("2"), signedWorkspaceObservation: 3 },
    feature_workspace_accepted: { preparationEntryDigest: digest("1"), pullRequestId: "pr:1", sourceBranch: "feature/a", targetBranch: "main", headRevision: revision("a"), draft: true, signedWorkspaceObservation: 3 },
    child_initiation_accepted: { preparationEntryDigest: digest("1"), childId: "child:1", branch: "child/a", baseHeadRevision: revision("a"), baseTreeDigest: digest("2"), signedWorkspaceObservation: 3 },
    child_implementation_accepted: { childId: "child:1", sourceMissionId: "mission:1", effectKey: "effect:x", sourceAuthorityDigest: { malformed: true }, sourceJournalDigest: digest("2"), completionReceiptDigest: digest("3"), headRevision: revision("a"), treeDigest: digest("4") },
    child_publication_accepted: { preparationEntryDigest: digest("1"), childId: "child:1", pullRequestId: "pr:1", sourceBranch: "child/a", targetBranch: "feature/a", headRevision: revision("a"), draft: true, signedWorkspaceObservation: 3 },
    child_evidence_accepted: { childId: "child:1", headRevision: revision("a"), evidenceIds: ["evidence:1"], evidenceDigests: [digest("1")], evidenceRecords: [3] },
    integration_accepted: { preparationEntryDigest: digest("1"), signedTransitionObservation: 3 },
    rollback_workspace_accepted: { childId: "child:1", sourceMissionId: "mission:1", completionReceiptDigest: digest("1"), sourceAuthorityDigest: digest("2"), sourceJournalDigest: digest("3"), rollbackBranch: "rollback/a", pullRequestId: "pr:1", pullRequestHeadRevision: revision("a"), targetBranch: "feature/a", restoredTreeDigest: digest("4"), sourceEffectKeys: [3], evidenceDigests: [digest("5")] },
    rollback_accepted: { preparationEntryDigest: digest("1"), signedTransitionObservation: 3 },
    cumulative_validation_accepted: { preparationEntryDigest: digest("1"), signedCumulativeReceipt: 3 },
    cumulative_validation_failed: { preparationEntryDigest: digest("1"), signedCumulativeReceipt: 3 },
    operation_paused: { signedAdmissionObservation: 3, reason: "operator_requested" },
    operation_resumed: { signedAdmissionObservation: 3, reason: "operator_requested" },
    operation_cancelled: { signedAdmissionObservation: 3, reason: "operator_requested" },
    operation_split: { signedAdmissionObservation: 3, successorOperationId: "operation:2", successorPlanDigest: digest("1"), successorAuthorityDigest: digest("2") },
    operation_completed: { signedAdmissionObservation: 3 },
    operation_superseded: { signedAdmissionObservation: 3, successorOperationId: "operation:2", successorPlanDigest: digest("1"), successorAuthorityDigest: digest("2") },
    final_gate_evidence_accepted: { signedEvidence: 3, signedAdmissionObservation: 3 },
    operation_expired: { signedExpiryObservation: 3 },
  };
  for (const [entryKind, payload] of Object.entries(malformed)) {
    const journal = rawJournalWithEntry(fixture, entryKind, payload);
    assert.deepEqual(replayFeatureOperationJournalV2(journal, fixture.trustAnchor), { state: "invalid", reason: "ENTRY_INVALID", entrySequence: 0 }, entryKind);
  }
});

test("cross-binds immutable trust roots and rejects every independent producer or runtime substitution", () => {
  const fixture = hardenedGenesisFixture();
  const producerMutations = [
    (journal) => { delete journal.entries[0].payload.trustedObservationProducerBindings[0].producerKind; },
    (journal) => { journal.entries[0].payload.trustedObservationProducerBindings[0].producerId = "producer with spaces"; },
    (journal) => { journal.entries[0].payload.trustedObservationProducerBindings[0].publicKeySpkiBase64 = "AAAA"; },
    (journal) => { journal.entries[0].payload.trustedObservationProducerBindings[0].signingKeyRef = "key with spaces"; },
  ];
  for (const mutate of producerMutations) {
    const journal = structuredClone(fixture.journal);
    mutate(journal);
    journal.entries[0].entryDigest = framedV2("shield.feature-integration.entry.v2", journal.entries[0], "entryDigest");
    journal.genesisDigest = journal.latestAcceptedEntryDigest = journal.entries[0].entryDigest;
    journal.journalDigest = framedV2("shield.feature-integration.journal.v2", journal, "journalDigest");
    assert.deepEqual(replayFeatureOperationJournalV2(journal, fixture.trustAnchor), { state: "invalid", reason: "ENTRY_INVALID", entrySequence: 0 });
  }
  const alternatePublicKey = "MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=";
  const producerKeySubstitution = structuredClone(fixture.journal);
  producerKeySubstitution.entries[0].payload.trustedObservationProducerBindings[0].publicKeySpkiBase64 = alternatePublicKey;
  producerKeySubstitution.entries[0].payload.trustedObservationProducerBindings[0].signingKeyRef = computeEd25519SigningKeyRef(alternatePublicKey);
  producerKeySubstitution.entries[0].entryDigest = framedV2("shield.feature-integration.entry.v2", producerKeySubstitution.entries[0], "entryDigest");
  producerKeySubstitution.genesisDigest = producerKeySubstitution.latestAcceptedEntryDigest = producerKeySubstitution.entries[0].entryDigest;
  producerKeySubstitution.journalDigest = framedV2("shield.feature-integration.journal.v2", producerKeySubstitution, "journalDigest");
  assert.deepEqual(replayFeatureOperationJournalV2(producerKeySubstitution, fixture.trustAnchor), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });
  const anchorMutations = [
    (anchor) => { anchor.missionId = "mission:other"; },
    (anchor) => { anchor.repositoryId = "repo:other"; },
    (anchor) => { anchor.humanBindingsDigest = digest("f"); },
    (anchor) => { anchor.trustedHumanBindings[0].publicKeySpkiBase64 = alternatePublicKey; anchor.trustedHumanBindings[0].signingKeyRef = computeEd25519SigningKeyRef(alternatePublicKey); },
    (anchor) => { anchor.trustedHumanBindings[0].bindingId = "binding with spaces"; },
    (anchor) => { anchor.sourceBindingSequence = 2; },
    (anchor) => { anchor.sourceImplementationAuthorityDigest = digest("f"); },
    (anchor) => { anchor.sourceImplementationAuthority.subjectId = "issue:other"; },
    (anchor) => { anchor.sourceRuntimeBinding.binding.subjectId = "issue:other"; },
    (anchor) => { anchor.sourceRuntimeBinding.binding.missionRevisionId = "sha256:other_revision"; },
    (anchor) => { anchor.sourceRuntimeBinding.binding.repositoryId = "other-repository"; },
    (anchor) => { anchor.sourceRuntimeBinding.binding.canonicalWritableRoot = "/workspace/other"; },
    (anchor) => { anchor.sourceRuntimeBinding.binding.branch = "other"; },
    (anchor) => { anchor.sourceRuntimeBinding.binding.artifactRevisionId = "sha256:other_artifact"; },
    (anchor) => { anchor.sourceRuntimeBinding.modelId = "model:other"; },
    (anchor) => { anchor.sourceRuntimeBinding.baseRevision = "sha256:other_base"; },
    (anchor) => { anchor.sourceRuntimeBinding.headRevision = "sha256:other_head"; },
    (anchor) => { anchor.sourceRuntimeBinding.approvedRelativePaths = ["other/path"]; },
    (anchor) => { anchor.sourceRuntimeBinding.validationCommandIds = ["validation:other"]; },
    (anchor) => { anchor.sourceRuntimeBinding.binding.approvedScope.actionIds = ["edit:other"]; },
    (anchor) => { anchor.sourceRuntimeBinding.binding.reasoningRuntimeId = anchor.sourceRuntimeBinding.modelId; },
    (anchor) => { anchor.sourceRuntimeBinding.binding.lifecycleState = "revoked"; },
    (anchor) => { anchor.sourceRuntimeBinding.binding.activeThroughSequence = 2; },
  ];
  for (const mutate of anchorMutations) {
    const anchor = structuredClone(fixture.trustAnchor);
    mutate(anchor);
    assert.deepEqual(replayFeatureOperationJournalV2(fixture.journal, anchor), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });
  }
  assert.equal(Object.isFrozen(replayFeatureOperationJournalV2(fixture.journal, fixture.trustAnchor).value.replayContext.activePlan), true);
});

test("requires exact V2 genesis activation across issuance, expiry, lifecycle, sequence, and amendment boundaries", () => {
  const fixture = hardenedGenesisFixture();
  const replayWithPayload = (payload) => replayFeatureOperationJournalV2(rawJournalWithEntry(fixture, "operation_genesis_accepted", payload), fixture.trustAnchor);
  const payloadAt = (value) => {
    const payload = structuredClone(fixture.genesis.payload);
    payload.replayContext.observedAt.value = value;
    return payload;
  };
  assert.deepEqual(replayWithPayload(payloadAt("2029-04-30T23:59:59.999Z")), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });
  assert.equal(replayWithPayload(payloadAt(fixture.hardenedAuthority.issuedAt)).state, "valid");

  const authorityExpiry = structuredClone(fixture.genesis.payload);
  authorityExpiry.signedAuthority.payload.expiresAt = "2029-05-01T00:30:00Z";
  authorityExpiry.signedAuthority.payload.authorityDigest = digest("0");
  authorityExpiry.signedAuthority.payload.authorityDigest = computeFeatureOperationAuthorityDigestV2(authorityExpiry.signedAuthority.payload);
  authorityExpiry.signedAuthority = signAuthorityV2(authorityExpiry.signedAuthority.payload);
  authorityExpiry.replayContext.verifiedAuthorityDigest = authorityExpiry.signedAuthority.payload.authorityDigest;
  authorityExpiry.replayContext.acceptedPlanLineage[0].authorityDigest = authorityExpiry.signedAuthority.payload.authorityDigest;
  authorityExpiry.replayContext.observedAt.value = authorityExpiry.signedAuthority.payload.expiresAt;
  assert.deepEqual(replayWithPayload(authorityExpiry), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });
  assert.deepEqual(replayWithPayload(payloadAt(fixture.hardenedPlan.expiresAt)), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });

  const paused = structuredClone(fixture.genesis.payload);
  paused.replayContext.lifecycle.state = "paused";
  assert.deepEqual(replayWithPayload(paused), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });

  const nonzeroAuthority = structuredClone(fixture.genesis.payload);
  nonzeroAuthority.signedAuthority.payload.operationSequence = 1;
  nonzeroAuthority.signedAuthority.payload.journalSequence = 1;
  nonzeroAuthority.signedAuthority.payload.authorityDigest = digest("0");
  nonzeroAuthority.signedAuthority.payload.authorityDigest = computeFeatureOperationAuthorityDigestV2(nonzeroAuthority.signedAuthority.payload);
  nonzeroAuthority.signedAuthority = signAuthorityV2(nonzeroAuthority.signedAuthority.payload);
  nonzeroAuthority.replayContext.acceptedAuthorityOperationSequence = 1;
  nonzeroAuthority.replayContext.currentJournalSequence = 1;
  nonzeroAuthority.replayContext.verifiedAuthorityDigest = nonzeroAuthority.signedAuthority.payload.authorityDigest;
  nonzeroAuthority.replayContext.acceptedPlanLineage[0].authorityDigest = nonzeroAuthority.signedAuthority.payload.authorityDigest;
  assert.deepEqual(replayWithPayload(nonzeroAuthority), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });

  const amended = structuredClone(fixture.genesis.payload);
  const predecessor = amended.replayContext.activePlan.planDigest;
  amended.signedAuthority.payload.plan.planSequence = 1;
  amended.signedAuthority.payload.plan.predecessorPlanDigest = predecessor;
  amended.signedAuthority.payload.plan.planDigest = digest("0");
  amended.signedAuthority.payload.plan.planDigest = computeFeatureOperationPlanDigestV2(amended.signedAuthority.payload.plan);
  amended.signedAuthority.payload.planDigest = amended.signedAuthority.payload.plan.planDigest;
  amended.signedAuthority.payload.authorityDigest = digest("0");
  amended.signedAuthority.payload.authorityDigest = computeFeatureOperationAuthorityDigestV2(amended.signedAuthority.payload);
  amended.signedAuthority = signAuthorityV2(amended.signedAuthority.payload);
  amended.replayContext.activePlan = structuredClone(amended.signedAuthority.payload.plan);
  amended.replayContext.activePlanDigest = amended.signedAuthority.payload.planDigest;
  amended.replayContext.verifiedAuthorityDigest = amended.signedAuthority.payload.authorityDigest;
  amended.replayContext.acceptedPlanLineage = [
    { planSequence: 0, planDigest: predecessor, predecessorPlanDigest: null, authorityDigest: digest("e"), active: false },
    { planSequence: 1, planDigest: amended.signedAuthority.payload.planDigest, predecessorPlanDigest: predecessor, authorityDigest: amended.signedAuthority.payload.authorityDigest, active: true },
  ];
  amended.replayContext.acceptedAmendmentDigests = [amended.signedAuthority.payload.planDigest];
  assert.deepEqual(replayWithPayload(amended), { state: "invalid", reason: "GENESIS_INVALID", entrySequence: 0 });
});

test("freezes all thirty empty-object framing vectors and the RFC-8032 authority signature", () => {
  const vectors = {
    "shield.feature-integration.journal.v2": "22b30838c497d3d5137dabf277896c7c245e77fd93de5a1cf86f2947aa4f3d29",
    "shield.feature-integration.entry.v2": "55a50894916f6106ad49aeb56768d288df91069183b68ceca6a2d9d08333fc1f",
    "shield.feature-integration.cumulative-ledger.v2": "ff0f0d52c6b84c71ce53af449a3456dad78956beda9714b5cd74031d93605618",
    "shield.feature-integration.idempotency-key.v2": "2df875dce0b016880f1a5a0496e5d7b611af58aaf4d5b684a867933a9168d415",
    "shield.feature-integration.observation-bindings.v2": "898f7ebf6de7ad820a11d589d4797580c4a502ffeda3a880aad9d7ca44841d4d",
    "shield.feature-integration.human-bindings.v2": "d599b454c48868e8f16e68dc9116a9ce39b6fd5cd25ddc7e42874a2ae2875d63",
    "shield.feature-operation.plan.v2": "9c9abdacb941f737f61ae58b530db3ba88632150e287b5be8d76bf87dc94ef3f",
    "shield.feature-operation.authority.v2": "aeca2de8133417cc276911b0dd5eac3a71000008ecddf10c9ba11b4ce6c7fb29",
    "shield.feature-operation.candidate.v2": "29ccfeb1ed4edefb5c15a8ce1a520c53185b286fa0307adc845a1fc461fb5c00",
    "shield.feature-integration.cumulative-authority.v2": "89844534a1c79530630ffa35887e6d016b905f5ad7d00b0a010e550e78713652",
    "shield.feature-integration.cumulative-candidate.v2": "0513ee85aac1025ce21258f7ce1d8f847eb71cee3a0f6404da959305a13e8fd2",
    "shield.feature-integration.executable-args.v2": "e9d2727b3975a2c08f865823a5152c05586910a942c38a5235b350ed2c6ab5cf",
    "shield.feature-integration.request-core.v2": "5e09992af6280ddd29b34c24f0daa1a42ef38c1e87e665d75a95959f41ae868c",
    "shield.feature-integration.request.v2": "f257ebe98c73ae5530e193c2f2fb114a00f15d92827aee6da764f8f7a134e9e9",
    "shield.feature-integration.challenge.v2:workspace": "501973d9665f9bbb5acb9239c8073c3bc9c302a3d8d2bad37d8a5485e423b2cb",
    "shield.feature-integration.challenge.v2:transition": "cf746a389fb5e4a8e1b57458882ad4b856a0dc316bd1b990b929cf745d74ca40",
    "shield.feature-integration.challenge.v2:cumulative": "9fcb67e9a78d89ad485d64a34734e09a16bcf3e6c4b8ce9cc2e2169334ab0a90",
    "shield.feature-integration.challenge.v2:admission": "64e9a6adfa0f343153bc31467a4c5c7f53f781fdc4d0278e94e21a71deff197f",
    "shield.feature-integration.challenge.v2:expiry": "b69ef53893e66222db1941923322b8da017a12308c5131eade4be77b52b586ac",
    "shield.feature-integration.observation.v2:workspace": "100b05306577a478742b2ed3fece4e74a464b1590230ed224a3d54b9eb088ebc",
    "shield.feature-integration.observation.v2:transition": "898b1068bb5e2e7c5b10fe25326f6c858e026364110cf025032211964111dde3",
    "shield.feature-integration.observation.v2:cumulative_registration": "98538d04f7814e10476990d96b8337b8d8a33c5c38789137ba2dab68d173c720",
    "shield.feature-integration.observation.v2:cumulative_start": "a9f343fda0fcb3bbdf4950f85be26e3f057c0a596e2c2de861ef5a54fed19410",
    "shield.feature-integration.observation.v2:cumulative_result": "06ea4f6c6afc38a88eae4f789dd0299ad5347b31aeeddddae240ac535d9d53f6",
    "shield.feature-integration.observation.v2:cumulative_receipt": "897bb160c3d032ac175bdb351bd67d429333c042218b6feaa438bf0718682d00",
    "shield.feature-integration.observation.v2:admission": "0c6a6d80747110c48413751710781c26d1ea4068488658578da990f70a84a6fd",
    "shield.feature-integration.observation.v2:expiry": "ac48d6390f6663c2c3f85b2a1ffde09eeeca4b44daf0d04d4abc70a40bcae617",
    "shield.feature-integration.final-gate.v2": "67e647b409b1cb19fd1bcddbb39b35adf315e337bbfa7d1bf25791374017cbe1",
    "shield.feature-operation.authority-signature.v2": "1366c4af82430a495ad396225568b0e34a262ecd3ce366da97ef36ae7d4e571f",
    "shield.feature-integration.cumulative-authority-signature.v2": "d0cddcfe2d36925f26716bd9d233729b5bed77553349d394b0412efbf4538fe2",
  };
  assert.equal(Object.keys(vectors).length, 30);
  for (const [domain, expected] of Object.entries(vectors)) assert.equal(framedV2(domain, {}), `sha256:${expected}`, domain);
  const rfcKey = createPublicKey({ key: Buffer.from("MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=", "base64"), format: "der", type: "spki" });
  const message = Buffer.concat([Buffer.from("shield.feature-operation.authority-signature.v2", "ascii"), Buffer.from([0]), Buffer.from("{}")]);
  const signature = Buffer.from("eg5wfuv6k6wn8AY5XC6mv9xZtpNN/nBJEuMfS3rqq7bgojdbvxYrSa7KGsq2fuFw5Cx+cerr/UdejjmQtxC1DQ==", "base64");
  assert.equal(verify(null, message, rfcKey, signature), true);
  signature[0] ^= 1;
  assert.equal(verify(null, message, rfcKey, signature), false);
});
