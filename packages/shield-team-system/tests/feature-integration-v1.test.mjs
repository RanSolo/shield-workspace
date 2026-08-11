import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalFeatureIntegrationJsonV1,
  computeFeatureIntegrationEntryDigestV1,
  computeFeatureIntegrationReceiptDigestV1,
  createFeatureIntegrationEntryV1,
  createFeatureOperationJournalV1,
  replayFeatureOperationJournalV1,
  validateFeatureIntegrationReceiptV1,
  validateFeatureOperationJournalV1,
} from "../dist/feature-integration-v1.mjs";

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
    childId: "mission:child", childMissionId: "mission:child", effectKey: "effect:child_merge_to_feature:one", attemptNumber: 1, integrationMethod: "squash", reconciliationState: "applied",
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
