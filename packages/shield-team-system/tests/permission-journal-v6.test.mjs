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

const missionRevisionFallback = "0123456789012345678901234567890123456789";
const artifactRevisionId = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);
  const coulson = {
    schemaVersion: 1,
    bindingId: "binding:coulson",
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
  const fitzKey = generateKeyPairSync("ed25519");
  const fitzPublic = fitzKey.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const fitz = { ...coulson, bindingId: "binding:fitz", humanPrincipalId: "human:fitz", seatId: "fitz", signingKeyRef: computeEd25519SigningKeyRef(fitzPublic), publicKeySpkiBase64: fitzPublic, provenanceRef: "repository-config:fitz" };
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId: "mission:issue-10",
    objective: "Enforce runtime binding and per-call permission.",
    subjectId: "issue:10",
    riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false },
    participants: ["hill", "daisy", "fury", "may", "coulson", "fitz"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-07-20T02:00:00Z", provenance: "humanRecorded" },
  });
  const entries = [createMissionBegunEntry(brief, [coulson, fitz], 6)];
  return { privateKey, coulson, brief, entries };
}

function binding(brief, version, sequence, overrides = {}) {
  return {
    bindingSchemaVersion: 1,
    bindingId: "runtime-binding:may",
    bindingVersion: version,
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    missionRevisionId: brief.revisionId || missionRevisionFallback,
    seatId: "may",
    reasoningRuntimeId: version === 1 ? "runtime:ornith:may" : "runtime:ornith:may:replacement",
    toolExecutorId: "executor:codex-host",
    repositoryId: "repo:RanSolo/shield-workspace",
    canonicalWritableRoot: "/workspace/shield-workspace",
    branch: "codex/issue-10-shield-benchmark",
    artifactRevisionId,
    recordedAtSequence: sequence,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: { actionIds: ["edit-permission-boundary"], effectClasses: ["behavioral_implementation"], effectKeys: ["effect:issue-10:permission"], capabilities: ["filesystem_write"] },
    coulsonAuthorizationRef: `authorization:runtime-binding:may:${version}`,
    ...overrides,
  };
}

function authorization(data, runtimeBinding, sequence, priorId, priorVersion) {
  const payload = {
    schemaVersion: 1,
    authorizationId: runtimeBinding.coulsonAuthorizationRef,
    missionId: data.brief.missionId,
    subjectId: data.brief.subjectId,
    seatId: runtimeBinding.seatId,
    bindingId: runtimeBinding.bindingId,
    bindingVersion: runtimeBinding.bindingVersion,
    priorBindingId: priorId,
    priorBindingVersion: priorVersion,
    bindingDigest: computeRuntimeBindingDigest(runtimeBinding),
    artifactRevisionId: runtimeBinding.artifactRevisionId,
    decision: "approved",
    previousJournalSequence: sequence - 1,
    journalSequence: sequence,
    humanPrincipalId: data.coulson.humanPrincipalId,
    humanBindingId: data.coulson.bindingId,
    signingKeyRef: data.coulson.signingKeyRef,
    sourceRef: `coulson:runtime-binding:${sequence}`,
    timestamp: { value: `2026-07-20T02:0${sequence}:00Z`, provenance: "humanRecorded" },
  };
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), data.privateKey).toString("base64") };
}

function replay(entries) {
  const result = replaySupervisedMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

test("journal v6 records one Coulson-authorized active runtime binding", () => {
  const data = fixture();
  const projection = replay(data.entries);
  const runtime = binding(data.brief, 1, 1);
  const entry = createRuntimeBindingEntry(projection, runtime, authorization(data, runtime, 1, null, null));
  assert.equal(entry.state, "valid", entry.errors?.join(" "));
  data.entries.push(entry.value);
  const bound = replay(data.entries);
  assert.equal(bound.journalSchemaVersion, 6);
  assert.equal(bound.runtimeBindings.length, 1);
  assert.equal(bound.activeRuntimeBindings[0].reasoningRuntimeId, "runtime:ornith:may");
});

test("runtime substitution is an atomic versioned supersession with separate authorization", () => {
  const data = fixture();
  let projection = replay(data.entries);
  const initial = binding(data.brief, 1, 1);
  data.entries.push(createRuntimeBindingEntry(projection, initial, authorization(data, initial, 1, null, null)).value);
  projection = replay(data.entries);
  const replacement = binding(data.brief, 2, 2);
  const supersession = createRuntimeBindingSupersessionEntry(projection, initial.bindingId, 1, replacement, authorization(data, replacement, 2, initial.bindingId, 1));
  assert.equal(supersession.state, "valid", supersession.errors?.join(" "));
  data.entries.push(supersession.value);
  projection = replay(data.entries);
  assert.equal(projection.runtimeBindings.length, 2);
  assert.equal(projection.runtimeBindings[0].lifecycleState, "superseded");
  assert.equal(projection.runtimeBindings[0].activeThroughSequence, 1);
  assert.equal(projection.activeRuntimeBindings.length, 1);
  assert.equal(projection.activeRuntimeBindings[0].bindingVersion, 2);
});

test("binding replay fails closed on tampering, stale sequence, or ambiguous active identity", () => {
  const data = fixture();
  const projection = replay(data.entries);
  const runtime = binding(data.brief, 1, 1);
  const signed = authorization(data, runtime, 1, null, null);
  assert.equal(createRuntimeBindingEntry(projection, { ...runtime, branch: "main" }, signed).state, "invalid");
  assert.equal(createRuntimeBindingEntry(projection, { ...runtime, recordedAtSequence: 2 }, authorization(data, { ...runtime, recordedAtSequence: 2 }, 2, null, null)).state, "invalid");
  const entry = createRuntimeBindingEntry(projection, runtime, signed).value;
  const tampered = structuredClone(entry);
  tampered.payload.binding.reasoningRuntimeId = "runtime:substituted-without-authorization";
  assert.equal(replaySupervisedMissionJournal([...data.entries, tampered]).state, "invalid");
});

test("v5 replay remains compatible and exposes no authoritative runtime bindings", () => {
  const data = fixture();
  const v5 = createMissionBegunEntry(data.brief, data.entries[0].payload.trustedBindings, 5);
  const projection = replay([v5]);
  assert.equal(projection.journalSchemaVersion, 5);
  assert.deepEqual(projection.runtimeBindings, []);
  assert.deepEqual(projection.activeRuntimeBindings, []);
});
