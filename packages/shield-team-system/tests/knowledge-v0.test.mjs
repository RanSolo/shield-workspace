import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeKnowledgeSliceOpaqueV0,
  KNOWLEDGE_ENTRY_CONTRACT_VERSION,
  KNOWLEDGE_SLICE_CONTRACT_VERSION,
  validateKnowledgeEntryV0,
  verifyKnowledgeSliceV0,
} from "../dist/knowledge-v0.mjs";

const now = "2026-07-23T23:00:00Z";
const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const entry = {
  schemaVersion: 1,
  contractVersion: KNOWLEDGE_ENTRY_CONTRACT_VERSION,
  entryId: "entry:fixture",
  revisionId: "revision:fixture:1",
  kind: "observation",
  contentRef: "content:fixture:1",
  contentDigest: digest,
  provenance: {
    sourceKind: "human",
    sourceRef: "github:issue:102",
    authorSeatId: "coulson",
    reasoningRuntimeId: null,
    toolExecutorId: null,
    capturedAt: "2026-07-23T22:00:00Z",
    trustState: "reviewed",
  },
  createdAt: "2026-07-23T22:00:00Z",
  freshness: { state: "current", expiresAt: "2026-07-24T22:00:00Z" },
  supersession: { state: "current", supersededByRevisionId: null, reason: null },
  conflict: { state: "none", conflictSetId: null, disposition: "none" },
  nonAuthoritative: true,
};
const manifest = {
  manifestId: "manifest:fixture",
  missionId: "mission:102",
  seatId: "may",
  curatorProposal: { proposalId: "proposal:fixture", curatorSeatId: "hill", proposedAt: "2026-07-23T22:30:00Z" },
  members: [{ entryId: entry.entryId, revisionId: entry.revisionId, contentDigest: entry.contentDigest, ordinal: 0 }],
  sliceDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};
const envelope = {
  schemaVersion: 1,
  contractVersion: KNOWLEDGE_SLICE_CONTRACT_VERSION,
  envelopeId: "envelope:fixture",
  manifest,
  entries: [entry],
  nonAuthoritative: true,
};

test("valid reviewed entry is current and non-authoritative", () => {
  const result = validateKnowledgeEntryV0(entry, now);
  assert.equal(result.state, "valid");
  assert.equal(result.authority, "non_authoritative");
});

test("stale, superseded, untrusted, and conflicting entries fail closed", () => {
  for (const mutation of [
    { freshness: { state: "current", expiresAt: "2026-07-23T22:59:00Z" } },
    { supersession: { state: "superseded", supersededByRevisionId: "revision:fixture:2", reason: "replaced" } },
    { provenance: { ...entry.provenance, trustState: "untrusted" } },
    { conflict: { state: "conflicted", conflictSetId: "conflict:1", disposition: "unresolved" } },
  ]) {
    assert.equal(validateKnowledgeEntryV0({ ...entry, ...mutation }, now).state, "invalid");
  }
});

test("verified slice binds approved membership, revisions, and digests", () => {
  const result = verifyKnowledgeSliceV0(envelope, manifest, now);
  assert.equal(result.state, "verified");
  assert.equal(result.authority, "non_authoritative");
});

test("substituted revision or manifest fails closed", () => {
  const substituted = verifyKnowledgeSliceV0({ ...envelope, entries: [{ ...entry, revisionId: "revision:fixture:2" }] }, manifest, now);
  assert.equal(substituted.state, "invalid");
  assert.ok(substituted.reasonCodes.includes("SLICE_MEMBER_MISMATCH"));
  const changedManifest = { ...manifest, sliceDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" };
  const changed = verifyKnowledgeSliceV0({ ...envelope, manifest: changedManifest }, manifest, now);
  assert.ok(changed.reasonCodes.includes("SLICE_BINDING_MISMATCH"));
});

test("Helicarrier opaque consumption rejects interpretation attempts", () => {
  const result = consumeKnowledgeSliceOpaqueV0(envelope, manifest, now, true);
  assert.equal(result.state, "invalid");
  assert.ok(result.reasonCodes.includes("SLICE_INTERPRETATION_ATTEMPT"));
});
