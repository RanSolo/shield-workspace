import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalFeatureIntegrationJsonV1,
  computeFeatureCumulativeValidationCandidateDigestV1,
  computeFeatureCumulativeValidationReceiptDigestV1,
  computeFeatureIntegrationEntryDigestV1,
  computeFeatureIntegrationReceiptDigestV1,
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

const digest = (character) => `sha256:${character.repeat(64)}`;
const revision = (character) => character.repeat(40);
const effect = (kind, character) => `effect:${kind}:${character.repeat(64)}`;

function replayFixture() {
  const effects = Object.fromEntries(FEATURE_OPERATION_DERIVATION_KINDS.map((kind, index) => [kind, effect(kind, String(index + 1))]));
  let plan = {
    schemaVersion: 1, contractVersion: "feature.operation.v1", operationId: "operation:replay", objective: "Replay exact terminal receipts", sourceProvenance: { authority: "none", sourceRef: "issue:226" }, repositoryId: "repo:shield", baseBranch: "main",
    baseRevision: revision("a"), baseTreeDigest: digest("a"), featureBranch: "feature/replay", acceptanceCriteria: [{ criterionId: "criterion:one", statement: "Complete one child" }],
    children: [{ childId: "mission:child-one", order: 0, objective: "Implement child", dependsOn: [], branchName: "agent/child-one", repositoryId: "repo:shield", riskClassification: "moderate", acceptanceCriterionIds: ["criterion:one"], permittedDerivations: FEATURE_OPERATION_DERIVATION_KINDS.filter((item) => item.startsWith("child_")), allowedRelativePaths: ["packages/child"], allowedActionIds: ["branch_create", "draft_pr_create", "integrate", "repository_edit", "revert"], allowedEffectKeys: Object.values(effects).sort(), allowedCapabilityIds: ["child_branch_write", "child_pr_write", "feature_branch_write", "feature_workspace_pr_write", "repository_write"], allowedValidationIds: ["build", "test"], allowedPublicationOperations: ["draft_pr_create"], requiredGates: { mack: true, fury: true, humanGateIds: ["fitz"] }, exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS, maxImplementationAttempts: 1, maxPublicationAttempts: 1, maxIntegrationAttempts: 1, maxRollbackAttempts: 1, maxRetries: 0 }],
    eligibilityOrder: ["mission:child-one"], integrationPolicy: { targetBranch: "feature/replay", allowedMethods: ["squash"] }, lifecyclePolicy: { amendmentsRequireFreshAuthority: true, pauseSupported: true, cancellationSupported: true, rollbackMethod: "revert_commit", expiryEnforced: true, escalationOnAmbiguity: true }, limits: { maxDurationSeconds: 3600, maxChildren: 1, maxConcurrency: 1, maxFeatureBranchCreateAttempts: 1, maxFeatureWorkspaceDraftPrAttempts: 1, maxTotalChildAttempts: 4, maxTotalIntegrationAttempts: 1, maxTotalRollbackAttempts: 1, maxCapturedEvidence: 10 }, finalGates: { fitzRequired: true, simmons: "conditional", coulsonRequired: true }, exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS, expiresAt: "2029-05-01T01:00:00Z", planSequence: 0, predecessorPlanDigest: null, planDigest: digest("0"),
  };
  plan.planDigest = computeFeatureOperationPlanDigestV1(plan);
  let authority = { schemaVersion: 1, contractVersion: "feature.operation.v1", authorityKind: "epic_wheels_up", authorityId: "authority:replay", missionId: "mission:replay", operationId: plan.operationId, plan, planDigest: plan.planDigest, repositoryId: plan.repositoryId, baseBranch: plan.baseBranch, baseRevision: plan.baseRevision, featureBranch: plan.featureBranch, operationSequence: 0, journalSequence: 0, issuedAt: "2029-05-01T00:00:00Z", expiresAt: plan.expiresAt, limits: plan.limits, permittedDerivations: FEATURE_OPERATION_DERIVATION_KINDS, prohibitedEffects: FEATURE_OPERATION_PROHIBITED_EFFECTS, humanPrincipalId: "human:coulson", humanBindingId: "binding:coulson", signingKeyRef: `ed25519:sha256:${"A".repeat(43)}`, authorityDigest: digest("0") };
  authority.authorityDigest = computeFeatureOperationAuthorityDigestV1(authority);
  const replayContext = { schemaVersion: 1, contractVersion: "feature.operation.v1", repositoryId: plan.repositoryId, operationId: plan.operationId, activePlan: plan, activePlanDigest: plan.planDigest, verifiedAuthorityId: authority.authorityId, verifiedAuthorityDigest: authority.authorityDigest, acceptedAuthorityOperationSequence: 0, currentJournalSequence: 0, acceptedPlanLineage: [{ planSequence: 0, planDigest: plan.planDigest, predecessorPlanDigest: null, authorityDigest: authority.authorityDigest, active: true }], acceptedAmendmentDigests: [], lifecycle: { state: "active", atOperationSequence: 0 }, transitions: [{ kind: "genesis", operationSequence: 0, effectKey: "effect:genesis", priorHeadRevision: plan.baseRevision, priorTreeDigest: plan.baseTreeDigest, resultingHeadRevision: plan.baseRevision, resultingTreeDigest: plan.baseTreeDigest, receiptDigest: digest("b") }], acceptedIntegrations: [], acceptedRollbacks: [], consumedEffectKeys: ["effect:genesis"], childCounters: [{ childId: "mission:child-one", initiationAttempts: 0, implementationAttempts: 0, publicationAttempts: 0, integrationAttempts: 0, rollbackAttempts: 0, retryAttempts: 0 }], activeLeases: [], operationCounters: { featureBranchCreateAttempts: 0, featureWorkspaceDraftPrAttempts: 0, totalChildAttempts: 0, totalIntegrationAttempts: 0, totalRollbackAttempts: 0, capturedEvidenceCount: 0 }, observedAt: { value: "2029-05-01T00:10:00Z", provenance: "hostTrusted" }, acceptedReviewEvidence: [] };
  const entries = [createFeatureOperationGenesisEntryV1({ operationId: plan.operationId, replayContext })];
  const scope = { relativePaths: [], actionIds: [], effectKeys: [], capabilityIds: [], validationIds: [], publicationOperations: [], requiredGates: { mack: false, fury: false, humanGateIds: [] }, exclusions: [], requestedAttempts: 1, requestedRetries: 0 };
  const add = (entryKind, payload) => { const previous = entries.at(-1); entries.push(createFeatureIntegrationEntryV1({ operationId: plan.operationId, entrySequence: entries.length, entryKind, previousEntryDigest: previous.entryDigest, payload })); return entries.at(-1); };
  const candidate = (stage, derivationKind, extra) => { const value = { schemaVersion: 1, contractVersion: "feature.operation.v1", stage, derivationKind, repositoryId: plan.repositoryId, operationId: plan.operationId, planDigest: plan.planDigest, authorityDigest: authority.authorityDigest, effectKey: effects[derivationKind], requestedScope: scope, ...extra, candidateDigest: digest("0") }; value.candidateDigest = computeFeatureOperationDerivedCandidateDigestV1(value); return value; };
  const prepare = (value, requestDigest, head = plan.baseRevision, tree = plan.baseTreeDigest) => add("effect_prepared", { effectClass: "feature_operation", candidate: value, candidateDigest: value.candidateDigest, effectKey: value.effectKey, requestDigest, expectedHeadRevision: head, expectedTreeDigest: tree });
  let prepared = prepare(candidate("initiation", "feature_branch_create", { sourceRevision: plan.baseRevision, targetBranch: plan.featureBranch }), digest("c"));
  add("feature_branch_creation_accepted", { preparationEntryDigest: prepared.entryDigest, headRevision: plan.baseRevision, treeDigest: plan.baseTreeDigest, observedAt: { value: "2029-05-01T00:11:00Z", provenance: "hostTrusted" }, observationProvenance: "github:branch" });
  prepared = prepare(candidate("initiation", "feature_workspace_draft_pr_create", { sourceBranch: plan.featureBranch, targetBranch: "main", draftOnly: true }), digest("d"));
  add("feature_workspace_accepted", { preparationEntryDigest: prepared.entryDigest, pullRequestId: "1", sourceBranch: plan.featureBranch, targetBranch: "main", headRevision: plan.baseRevision, draft: true, observedAt: { value: "2029-05-01T00:12:00Z", provenance: "hostTrusted" }, observationProvenance: "github:workspace" });
  prepared = prepare(candidate("initiation", "child_initiation", { childId: "mission:child-one", sourceFeatureHead: plan.baseRevision, childBranch: "agent/child-one" }), digest("e"));
  add("child_initiation_accepted", { preparationEntryDigest: prepared.entryDigest, childId: "mission:child-one", branch: "agent/child-one", baseHeadRevision: plan.baseRevision, baseTreeDigest: plan.baseTreeDigest, observedAt: { value: "2029-05-01T00:13:00Z", provenance: "hostTrusted" }, observationProvenance: "github:init" });
  add("child_implementation_accepted", { childId: "mission:child-one", sourceMissionId: "mission:child-one", effectKey: effects.child_implementation, sourceAuthorityDigest: digest("f"), sourceJournalDigest: digest("1"), completionReceiptDigest: digest("2"), headRevision: revision("b"), treeDigest: digest("3") });
  prepared = prepare(candidate("child_publication", "child_draft_pr_create", { childId: "mission:child-one", childBranch: "agent/child-one", childHeadRevision: revision("b"), targetBranch: plan.featureBranch, draftOnly: true }), digest("4"));
  add("child_publication_accepted", { preparationEntryDigest: prepared.entryDigest, childId: "mission:child-one", pullRequestId: "2", sourceBranch: "agent/child-one", targetBranch: plan.featureBranch, headRevision: revision("b"), draft: true, observedAt: { value: "2029-05-01T00:14:00Z", provenance: "hostTrusted" }, observationProvenance: "github:publication" });
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
  return { entries, integrationEntry, integrationReceipt, cumulativeEntry, cumulativeReceipt };
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
