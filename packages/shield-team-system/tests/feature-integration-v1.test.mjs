import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalFeatureIntegrationJsonV1,
  computeFeatureIntegrationEntryDigestV1,
  createFeatureIntegrationEntryV1,
  createFeatureOperationJournalV1,
  replayFeatureOperationJournalV1,
  validateFeatureOperationJournalV1,
} from "../dist/feature-integration-v1.mjs";

test("canonical JSON orders by UTF-16 and rejects non-data", () => {
  assert.equal(canonicalFeatureIntegrationJsonV1({ z: 1, a: [true, null] }), '{"a":[true,null],"z":1}');
  assert.throws(() => canonicalFeatureIntegrationJsonV1(new Date()), /plain data/);
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
