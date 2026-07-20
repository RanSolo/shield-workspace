import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  computeRuntimeBindingDigest,
  createMissionBegunEntry,
  createRuntimeBindingEntry,
  createRuntimeBindingSupersessionEntry,
  createSupervisedMissionBrief,
  replaySupervisedMissionJournal,
} from "../dist/mission-v2.mjs";

const artifactRevisionId = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);
  const coulson = {
    schemaVersion: 1,
    bindingId: "human-binding:coulson",
    humanPrincipalId: "human:coulson",
    seatId: "coulson",
    missionScope: "*",
    signingKeyRef,
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:coulson",
  };
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId: "mission:issue-10",
    objective: "Exercise the runtime binding permission boundary.",
    subjectId: "issue:10",
    riskFlags: {
      production: false,
      destructive: false,
      migration: false,
      credentialsOrSecurity: true,
      externalCommunication: false,
      merge: false,
      deploy: false,
      release: false,
      hillHighRisk: true,
    },
    participants: ["hill", "may", "coulson", "fitz"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-07-19T20:00:00Z", provenance: "humanRecorded" },
  });
  return { privateKey, coulson, brief };
}

function runtimeBinding(brief, version, recordedAtSequence, overrides = {}) {
  return {
    bindingSchemaVersion: 1,
    bindingId: "runtime-binding:may",
    bindingVersion: version,
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    missionRevisionId: brief.revisionId,
    seatId: "may",
    reasoningRuntimeId: version === 1 ? "runtime:may-local" : "runtime:may-substitute",
    toolExecutorId: "executor:codex-host",
    repositoryId: "github:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    branch: "codex/issue-10-permission-boundary",
    artifactRevisionId,
    recordedAtSequence,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: ["implement-permission-boundary"],
      effectClasses: ["behavioral_implementation"],
      effectKeys: ["effect:issue-10:permission"],
      capabilities: ["filesystem.write"],
    },
    coulsonAuthorizationRef: `runtime-authorization:may:${version}`,
    ...overrides,
  };
}

function authorization(data, binding, previousJournalSequence, prior = null, overrides = {}) {
  const payload = {
    schemaVersion: 1,
    authorizationId: binding.coulsonAuthorizationRef,
    missionId: data.brief.missionId,
    subjectId: data.brief.subjectId,
    seatId: binding.seatId,
    bindingId: binding.bindingId,
    bindingVersion: binding.bindingVersion,
    priorBindingId: prior?.bindingId ?? null,
    priorBindingVersion: prior?.bindingVersion ?? null,
    bindingDigest: computeRuntimeBindingDigest(binding),
    artifactRevisionId: binding.artifactRevisionId,
    decision: "approved",
    previousJournalSequence,
    journalSequence: previousJournalSequence + 1,
    humanPrincipalId: data.coulson.humanPrincipalId,
    humanBindingId: data.coulson.bindingId,
    signingKeyRef: data.coulson.signingKeyRef,
    sourceRef: `coulson:runtime-binding:${binding.bindingVersion}`,
    timestamp: {
      value: `2026-07-19T20:00:0${previousJournalSequence + 1}Z`,
      provenance: "humanRecorded",
    },
    ...overrides,
  };
  return {
    payload,
    signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), data.privateKey).toString("base64"),
  };
}

function replay(entries) {
  const result = replaySupervisedMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

test("journal v6 begins without inventing a runtime binding, then records and atomically supersedes one", () => {
  const data = fixture();
  const entries = [createMissionBegunEntry(data.brief, [data.coulson], 6)];
  let projection = replay(entries);
  assert.deepEqual(projection.runtimeBindings, []);
  assert.deepEqual(projection.activeRuntimeBindings, []);

  const first = runtimeBinding(data.brief, 1, 1);
  const recorded = createRuntimeBindingEntry(projection, first, authorization(data, first, 0));
  assert.equal(recorded.state, "valid", recorded.errors?.join(" "));
  entries.push(recorded.value);
  projection = replay(entries);
  assert.deepEqual(projection.activeRuntimeBindings.map(({ bindingId, bindingVersion }) => ({ bindingId, bindingVersion })), [
    { bindingId: "runtime-binding:may", bindingVersion: 1 },
  ]);

  const replacement = runtimeBinding(data.brief, 2, 2);
  const superseded = createRuntimeBindingSupersessionEntry(
    projection,
    first.bindingId,
    first.bindingVersion,
    replacement,
    authorization(data, replacement, 1, first),
  );
  assert.equal(superseded.state, "valid", superseded.errors?.join(" "));
  entries.push(superseded.value);
  const immutableEntries = structuredClone(entries);

  projection = replay(entries);
  assert.deepEqual(entries, immutableEntries, "replay must not mutate caller-owned journal entries");
  assert.equal(projection.runtimeBindings.length, 2);
  assert.deepEqual(
    projection.runtimeBindings.map(({ bindingVersion, lifecycleState, activeThroughSequence }) => ({ bindingVersion, lifecycleState, activeThroughSequence })),
    [
      { bindingVersion: 1, lifecycleState: "superseded", activeThroughSequence: 1 },
      { bindingVersion: 2, lifecycleState: "active", activeThroughSequence: null },
    ],
  );
  assert.deepEqual(projection.activeRuntimeBindings.map(({ bindingVersion, reasoningRuntimeId }) => ({ bindingVersion, reasoningRuntimeId })), [
    { bindingVersion: 2, reasoningRuntimeId: "runtime:may-substitute" },
  ]);
});

test("runtime binding intake rejects tampering and exact prior, sequence, seat, and revision drift", () => {
  const data = fixture();
  const entries = [createMissionBegunEntry(data.brief, [data.coulson], 6)];
  let projection = replay(entries);
  const first = runtimeBinding(data.brief, 1, 1);

  const tampered = authorization(data, first, 0);
  tampered.payload.sourceRef = "coulson:tampered-after-signing";
  assert.equal(createRuntimeBindingEntry(projection, first, tampered).code, "binding_invalid");

  const wrongSequence = authorization(data, first, 0, null, { previousJournalSequence: 1, journalSequence: 2 });
  assert.equal(createRuntimeBindingEntry(projection, first, wrongSequence).code, "sequence_invalid");

  const wrongSeat = authorization(data, first, 0, null, { seatId: "hill" });
  assert.equal(createRuntimeBindingEntry(projection, first, wrongSeat).code, "binding_invalid");

  const staleRevision = runtimeBinding(data.brief, 1, 1, {
    missionRevisionId: "9999999999999999999999999999999999999999",
  });
  assert.equal(createRuntimeBindingEntry(projection, staleRevision, authorization(data, staleRevision, 0)).code, "revision_mismatch");

  const recorded = createRuntimeBindingEntry(projection, first, authorization(data, first, 0));
  entries.push(recorded.value);
  projection = replay(entries);
  const replacement = runtimeBinding(data.brief, 2, 2);
  const wrongPrior = authorization(data, replacement, 1, first, {
    priorBindingId: "runtime-binding:other",
  });
  assert.equal(
    createRuntimeBindingSupersessionEntry(projection, first.bindingId, first.bindingVersion, replacement, wrongPrior).code,
    "binding_invalid",
  );
});

test("journal versions v2 through v5 retain their original zero-runtime-binding replay behavior", () => {
  for (const version of [2, 3, 4, 5]) {
    const data = fixture();
    const projection = replay([createMissionBegunEntry(data.brief, [data.coulson], version)]);
    assert.equal(projection.journalSchemaVersion, version);
    assert.deepEqual(projection.runtimeBindings, []);
    assert.deepEqual(projection.activeRuntimeBindings, []);
  }
});
