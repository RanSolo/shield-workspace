import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptGovernedChildCompletionV1,
  bridgeChildIntegrationEvidenceV1,
  computeGovernedChildCompletionReceiptDigestV1,
  createChildImplementationHandoffReadyV1,
  validateGovernedChildCompletionReceiptV1,
} from "../dist/feature-integration-evidence-v1.mjs";

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

test("governed child completion receipt is closed, digest-bound, and identity-separated", () => {
  const value = receipt();
  assert.equal(validateGovernedChildCompletionReceiptV1(value).state, "accepted");
  assert.equal(validateGovernedChildCompletionReceiptV1({ ...value, sourceMissionId: "mission:substitute" }).state, "blocked");
  assert.equal(validateGovernedChildCompletionReceiptV1({ ...value, modelId: value.reasoningRuntimeId, receiptDigest: computeGovernedChildCompletionReceiptDigestV1({ ...value, modelId: value.reasoningRuntimeId }) }).state, "blocked");
  assert.equal(validateGovernedChildCompletionReceiptV1({ ...value, extra: true }).state, "blocked");
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
