import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import test from "node:test";

import {
  canonicalFeatureIntegrationJsonV1,
  computeFeatureCumulativeValidationCandidateDigestV1,
  computeFeatureCumulativeValidationReceiptDigestV1,
  computeFeatureIntegrationEntryDigestV1,
  computeFeatureIntegrationReceiptDigestV1,
  computeFeatureRollbackReceiptDigestV1,
  computeFeatureIntegrationWorkspaceEffectObservationDigestV1,
  createFeatureIntegrationEntryV1,
  createFeatureOperationGenesisEntryV1,
  createFeatureOperationJournalV1,
  replayFeatureOperationJournalV1,
  validateFeatureIntegrationReceiptV1,
  validateFeatureOperationJournalV1,
} from "../dist/feature-integration-v1.mjs";
import {
  FEATURE_OPERATION_DERIVATION_KINDS,
  FEATURE_OPERATION_FIXED_EXCLUSIONS,
  FEATURE_OPERATION_PROHIBITED_EFFECTS,
  computeFeatureOperationAuthorityDigestV1,
  computeFeatureOperationDerivedCandidateDigestV1,
  computeFeatureOperationPlanDigestV1,
} from "../dist/feature-operation-v1.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const revision = (character) => character.repeat(40);
const effect = (kind, character) => `effect:${kind}:${character.repeat(64)}`;
const privateKey = createPrivateKey({ key: Buffer.from(`302e020100300506032b657004220420${"42".repeat(32)}`, "hex"), format: "der", type: "pkcs8" });
const publicKeySpkiBase64 = createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64");
const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);

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

function appendRollbackTransition(fixture) {
  const completionReceiptDigest = digest("e");
  fixture.add("rollback_workspace_accepted", { childId: "mission:child-one", sourceMissionId: "mission:rollback-one", completionReceiptDigest, sourceAuthorityDigest: digest("f"), sourceJournalDigest: digest("1"), rollbackBranch: "agent/rollback-one", pullRequestId: "3", pullRequestHeadRevision: revision("d"), targetBranch: fixture.plan.featureBranch, restoredTreeDigest: fixture.plan.baseTreeDigest, sourceEffectKeys: ["effect:rollback-source:one"], evidenceDigests: [digest("2")] });
  const rollbackCandidate = fixture.candidate("rollback", "child_revert_on_feature", { childId: "mission:child-one", integrationReceiptDigest: fixture.integrationReceipt.receiptDigest, integrationHeadRevision: fixture.integrationReceipt.resultingHeadRevision, integrationTreeDigest: fixture.integrationReceipt.resultingTreeDigest, expectedRestoredTreeDigest: fixture.integrationReceipt.priorTreeDigest, targetBranch: fixture.plan.featureBranch, rollbackMethod: "revert_commit" });
  const prepared = fixture.add("effect_prepared", { effectClass: "feature_operation", candidate: rollbackCandidate, candidateDigest: rollbackCandidate.candidateDigest, effectKey: rollbackCandidate.effectKey, requestDigest: digest("3"), expectedHeadRevision: fixture.integrationReceipt.resultingHeadRevision, expectedTreeDigest: fixture.integrationReceipt.resultingTreeDigest });
  const receipt = { schemaVersion: 1, contractVersion: "feature.integration.v1", operationId: fixture.plan.operationId, repositoryId: fixture.plan.repositoryId, planDigest: fixture.plan.planDigest, authorityDigest: fixture.authority.authorityDigest, childId: "mission:child-one", effectKey: rollbackCandidate.effectKey, attemptNumber: 1, reconciliationState: "applied", revertedIntegrationReceiptDigest: fixture.integrationReceipt.receiptDigest, rollbackWorkspaceReceiptDigest: completionReceiptDigest, priorHeadRevision: fixture.integrationReceipt.resultingHeadRevision, priorTreeDigest: fixture.integrationReceipt.resultingTreeDigest, resultingHeadRevision: revision("d"), resultingTreeDigest: fixture.integrationReceipt.priorTreeDigest, observationProvenance: "github:rollback", observedAt: { value: "2029-05-01T00:17:00Z", provenance: "hostTrusted" }, seatId: "may", reasoningRuntimeId: "runtime:may", modelId: "model:may", toolExecutorId: "executor:github", receiptDigest: digest("0") };
  receipt.receiptDigest = computeFeatureRollbackReceiptDigestV1(receipt);
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
