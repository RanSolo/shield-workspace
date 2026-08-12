import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptGovernedChildCompletionV1,
  bridgeChildIntegrationEvidenceV1,
  computeGovernedChildCompletionReceiptDigestV1,
  createChildImplementationHandoffReadyV1,
  validateGovernedChildCompletionReceiptV1,
} from "../dist/feature-integration-evidence-v1.mjs";
import { computeFeatureOperationDerivedCandidateDigestV1 } from "../dist/feature-operation-v1.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const revision = (character) => character.repeat(40);

function receipt(overrides = {}) {
  const value = {
    schemaVersion: 1,
    contractVersion: "feature.integration.evidence.v1",
    childId: "mission:child-one",
    sourceMissionId: "mission:child-one",
    repositoryId: "RanSolo/shield-workspace",
    featureBranch: "feature/226",
    childBranch: "agent/child-one",
    baseHeadRevision: revision("a"),
    baseTreeDigest: digest("a"),
    completionHeadRevision: revision("b"),
    completionTreeDigest: digest("b"),
    sourceAuthorityDigest: digest("c"),
    sourceEffectKey: "effect:child_implementation:one",
    sourceJournalDigest: digest("d"),
    reasoningRuntimeId: "runtime:child",
    modelId: "model:child",
    toolExecutorId: "executor:child",
    receiptDigest: digest("0"),
    ...overrides,
  };
  value.receiptDigest = computeGovernedChildCompletionReceiptDigestV1(value);
  return value;
}

function integrationFixture() {
  const childId = "mission:child-one";
  const repositoryId = "RanSolo/shield-workspace";
  const headRevision = revision("b");
  const refs = ["evidence:fitz", "evidence:fury", "evidence:mack"];
  const candidate = {
    schemaVersion: 1,
    contractVersion: "feature.operation.v1",
    repositoryId,
    operationId: "operation:feature-226",
    planDigest: digest("1"),
    authorityDigest: digest("2"),
    stage: "integration",
    derivationKind: "child_merge_to_feature",
    effectKey: `effect:child_merge_to_feature:${"8".repeat(64)}`,
    requestedScope: { relativePaths: [], actionIds: [], effectKeys: [], capabilityIds: [], validationIds: [], publicationOperations: [], requiredGates: { mack: false, fury: false, humanGateIds: [] }, exclusions: [], requestedAttempts: 1, requestedRetries: 0 },
    childId,
    childBranch: "agent/child-one",
    childHeadRevision: headRevision,
    childTreeDigest: digest("3"),
    targetBranch: "feature/226",
    integrationMethod: "squash",
    predecessorIntegrationReceiptDigest: null,
    reviewEvidenceRefs: refs,
    candidateDigest: digest("0"),
  };
  candidate.candidateDigest = computeFeatureOperationDerivedCandidateDigestV1(candidate);
  const replay = {
    nextStage: "child_evidence",
    nextEntrySequence: 7,
    replayContext: {
      activePlan: { featureBranch: "feature/226", children: [{ childId, branchName: "agent/child-one", requiredGates: { humanGateIds: ["fitz"] } }] },
    },
  };
  const evidence = [
    { schemaVersion: 1, evidenceId: "evidence:mack", gateType: "mack", gateId: "mack", childId, repositoryId, headRevision, sourceRecordDigest: digest("4"), accepted: true, synthetic: false },
    { schemaVersion: 1, evidenceId: "evidence:fury", gateType: "fury", gateId: "fury", childId, repositoryId, headRevision, sourceRecordDigest: digest("5"), accepted: true, synthetic: false },
    { schemaVersion: 1, evidenceId: "evidence:fitz", gateType: "human", gateId: "fitz", childId, repositoryId, headRevision, sourceRecordDigest: digest("6"), accepted: true, synthetic: false },
  ];
  return { replay, candidate, evidence, previousEntryDigest: digest("7") };
}

test("governed child completion receipt is closed, digest-bound, and identity-separated", () => {
  const value = receipt();
  assert.equal(validateGovernedChildCompletionReceiptV1(value).state, "accepted");
  assert.equal(validateGovernedChildCompletionReceiptV1({ ...value, sourceMissionId: "mission:substitute" }).state, "blocked");
  assert.equal(validateGovernedChildCompletionReceiptV1({ ...value, modelId: value.reasoningRuntimeId, receiptDigest: computeGovernedChildCompletionReceiptDigestV1({ ...value, modelId: value.reasoningRuntimeId }) }).state, "blocked");
  assert.equal(validateGovernedChildCompletionReceiptV1({ ...value, extra: true }).state, "blocked");
});

test("receipt normalization rejects accessors and proxies without invoking caller code", () => {
  let getterCalls = 0;
  const accessor = receipt();
  Object.defineProperty(accessor, "childId", { enumerable: true, get() { getterCalls += 1; return "mission:child-one"; } });
  assert.deepEqual(validateGovernedChildCompletionReceiptV1(accessor), { state: "blocked", reason: "completion_receipt_invalid" });
  assert.equal(getterCalls, 0);
  assert.deepEqual(validateGovernedChildCompletionReceiptV1(new Proxy(receipt(), {})), { state: "blocked", reason: "completion_receipt_invalid" });
});

test("handoff rejects unvalidated caller assertions without effects", () => {
  assert.deepEqual(createChildImplementationHandoffReadyV1({ replay: { nextStage: "implementation_handoff" }, candidate: { derivationKind: "child_implementation" } }), { state: "blocked", reason: "implementation_handoff_ineligible" });
  assert.equal(acceptGovernedChildCompletionV1({ replay: { replayContext: { consumedEffectKeys: [] } }, handoff: { state: "implementation_handoff_ready" }, sourceJournal: [], receipt: receipt(), previousEntryDigest: digest("e") }).state, "blocked");
});

test("evidence bridge rejects malformed, synthetic, or unvalidated integration inputs", () => {
  const result = bridgeChildIntegrationEvidenceV1({ replay: { nextStage: "child_evidence" }, candidate: { derivationKind: "child_merge_to_feature" }, evidence: [{ synthetic: true }], previousEntryDigest: digest("f") });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "integration_candidate_ineligible");
});

test("evidence bridge consumes one immutable normalized snapshot", () => {
  const input = integrationFixture();
  const result = bridgeChildIntegrationEvidenceV1(input);
  assert.equal(result.state, "accepted");
  input.evidence[0].evidenceId = "evidence:mutated";
  assert.deepEqual(result.value.entry.payload.evidenceIds, ["evidence:fitz", "evidence:fury", "evidence:mack"]);
  assert.ok(Object.isFrozen(result.value));
  assert.ok(Object.isFrozen(result.value.entry.payload));
  assert.ok(Object.isFrozen(result.value.entry.payload.evidenceRecords[0]));
  assert.throws(() => { result.value.entry.payload.evidenceRecords[0].evidenceRef = "evidence:mutated"; }, TypeError);
});

test("evidence bridge rejects accessors, proxies, duplicates, synthetic records, and substitutions", () => {
  const accessor = integrationFixture();
  let getterCalls = 0;
  Object.defineProperty(accessor.evidence[0], "accepted", { enumerable: true, get() { getterCalls += 1; return true; } });
  assert.equal(bridgeChildIntegrationEvidenceV1(accessor).state, "blocked");
  assert.equal(getterCalls, 0);

  const proxied = integrationFixture();
  proxied.evidence = new Proxy(proxied.evidence, {});
  assert.equal(bridgeChildIntegrationEvidenceV1(proxied).state, "blocked");

  const duplicate = integrationFixture();
  duplicate.evidence[1].sourceRecordDigest = duplicate.evidence[0].sourceRecordDigest;
  assert.deepEqual(bridgeChildIntegrationEvidenceV1(duplicate), { state: "blocked", reason: "duplicate_evidence" });

  const synthetic = integrationFixture();
  synthetic.evidence[0].synthetic = true;
  assert.deepEqual(bridgeChildIntegrationEvidenceV1(synthetic), { state: "blocked", reason: "evidence_binding_mismatch" });

  const substituted = integrationFixture();
  substituted.evidence[0].childId = "mission:substituted";
  assert.deepEqual(bridgeChildIntegrationEvidenceV1(substituted), { state: "blocked", reason: "evidence_binding_mismatch" });
});
