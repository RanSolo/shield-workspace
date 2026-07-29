import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  computeRuntimeBindingDigest,
  createEvidenceEntry,
  createGovernanceEntry,
  createMissionBegunEntry,
  createRuntimeBindingEntry,
  createRuntimeBindingSupersessionEntry,
  createSupervisedMissionBrief,
  replaySupervisedMissionJournal,
} from "../dist/mission-v2.mjs";

const missionRevisionFallback = "0123456789012345678901234567890123456789";
const artifactRevisionId = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

function plainBinding(value) {
  return JSON.parse(JSON.stringify(value));
}

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
  const entries = [createMissionBegunEntry(brief, [plainBinding(coulson), plainBinding(fitz)], 6)];
  return { privateKey, coulson, fitz, brief, entries };
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

function authorizationWithAuthority(authority, missionId, subjectId, runtimeBinding, sequence, priorId, priorVersion) {
  const payload = {
    schemaVersion: 1,
    authorizationId: runtimeBinding.coulsonAuthorizationRef,
    missionId,
    subjectId,
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
    humanPrincipalId: authority.humanPrincipalId,
    humanBindingId: authority.bindingId,
    signingKeyRef: authority.signingKeyRef,
    sourceRef: `runtime-binding:authority:${sequence}`,
    timestamp: { value: `2026-07-20T02:0${sequence}:00Z`, provenance: "humanRecorded" },
  };
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), authority.privateKey).toString("base64") };
}

function replay(entries) {
  const result = replaySupervisedMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

function governanceTarget(decision, resumeState = "approved") {
  if (decision === "approve") return "approved";
  if (decision === "pause") return "paused";
  if (decision === "resume") return resumeState;
  if (decision === "cancel") return "cancelled";
  return null;
}

function evidence(authority, projection, requirement, decision, sequence, suffix = String(sequence)) {
  const binding = authority.binding ?? authority;
  const payload = {
    schemaVersion: 1,
    evidenceId: `evidence:${binding.seatId}:${suffix}`,
    requirementId: requirement.requirementId,
    missionId: projection.missionId,
    subjectKind: "mission_plan",
    subjectId: projection.brief.subjectId,
    revisionId: projection.brief.revisionId,
    seatId: binding.seatId,
    evidenceKind: requirement.evidenceKind,
    decision,
    governanceTarget: binding.seatId === "coulson" ? governanceTarget("approve") : null,
    humanPrincipalId: binding.humanPrincipalId,
    bindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `manual-signature:${suffix}`,
    timestamp: { value: `2026-07-20T02:0${Math.min(sequence, 9)}:00Z`, provenance: "humanRecorded" },
    journalSequence: sequence,
  };
  return {
    payload,
    signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), authority.privateKey).toString("base64"),
  };
}

function signedBindingReplayCase(data, badSeat) {
  const projection = replay(data.entries);
  const base = createRuntimeBindingEntry(
    projection,
    binding(data.brief, 1, 1),
    authorization(data, binding(data.brief, 1, 1), 1, null, null),
  );
  assert.equal(base.state, "valid", base.errors?.join(" "));
  const badRuntimeBinding = { ...base.value.payload.binding, seatId: badSeat };
  const badAuthorization = authorizationWithAuthority(
    { ...data.coulson, privateKey: data.privateKey },
    data.brief.missionId,
    data.brief.subjectId,
    badRuntimeBinding,
    1,
    null,
    null,
  );
  return {
    ...base.value,
    payload: {
      ...base.value.payload,
      binding: badRuntimeBinding,
      authorization: badAuthorization,
    },
  };
}

function signedSupersessionReplayCase(data, badSeat) {
  const projection = replay(data.entries);
  const initial = binding(data.brief, 1, 1);
  const initialEntry = createRuntimeBindingEntry(
    projection,
    initial,
    authorization(data, initial, 1, null, null),
  );
  assert.equal(initialEntry.state, "valid", initialEntry.errors?.join(" "));
  const active = replay([data.entries[0], initialEntry.value]);
  const replacement = binding(data.brief, 2, 2);
  const validSupersession = createRuntimeBindingSupersessionEntry(
    active,
    initial.bindingId,
    initial.bindingVersion,
    replacement,
    authorization(data, replacement, 2, initial.bindingId, 1),
  );
  assert.equal(validSupersession.state, "valid");
  const badRuntimeBinding = { ...validSupersession.value.payload.binding, seatId: badSeat };
  const badAuthorization = authorizationWithAuthority(
    { ...data.coulson, privateKey: data.privateKey },
    data.brief.missionId,
    data.brief.subjectId,
    badRuntimeBinding,
    2,
    initial.bindingId,
    1,
  );
  return {
    baseEntries: [data.entries[0], initialEntry.value],
    candidate: {
      ...validSupersession.value,
      payload: {
        ...validSupersession.value.payload,
        binding: badRuntimeBinding,
        authorization: badAuthorization,
      },
    },
  };
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

test("runtime binding recording rejects human, disabled, and unknown owner seat IDs", () => {
  const data = fixture();
  const projection = replay(data.entries);
  for (const seat of ["coulson", "fitz", "simmons", "mack", "oracle", "runtime:bad", "x"]) {
    const checked = createRuntimeBindingEntry(
      projection,
      binding(data.brief, 1, 1, { seatId: seat }),
      authorization(data, binding(data.brief, 1, 1, { seatId: seat }), 1, null, null),
    );
    assert.equal(checked.state, "invalid");
    assert.ok(checked.errors?.some((error) => error.includes("Runtime binding seatId is not a canonical dispatchable V0.3 role")));
  }
});

test("raw replay rejects correctly signed runtime binding records with invalid owner seats", () => {
  for (const seat of ["coulson", "mack", "x"]) {
    const data = fixture();
    const candidate = signedBindingReplayCase(data, seat);
    const replayResult = replaySupervisedMissionJournal([data.entries[0], candidate]);
    assert.equal(replayResult.state, "invalid");
    assert.ok(replayResult.errors?.some((error) => error.includes("Runtime binding seatId is not a canonical dispatchable V0.3 role")));
  }
});

test("correctly signed invalid runtime replacements do not supersede active bindings by boundary", () => {
  for (const seat of ["coulson", "mack", "runtime:bad"]) {
    const data = fixture();
    const { baseEntries, candidate } = signedSupersessionReplayCase(data, seat);
    const replayResult = replaySupervisedMissionJournal([...baseEntries, candidate]);
    assert.equal(replayResult.state, "invalid");
    const unchanged = replay(baseEntries);
    assert.equal(unchanged.runtimeBindings.length, 1);
    assert.equal(unchanged.activeRuntimeBindings.length, 1);
    assert.ok(replayResult.errors?.some((error) => error.includes("Runtime binding seatId is not a canonical dispatchable V0.3 role")));
  }
});

test("expired signed governance and technical evidence is rejected and leaves readiness unchanged", () => {
  const data = fixture();
  const expiredCoulson = {
    ...data.coulson,
    validThroughSequence: 0,
    bindingId: "binding:coulson-expired",
  };
  const freshCoulson = generateKeyPairSync("ed25519");
  const freshCoulsonPublic = freshCoulson.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const expiredCoulsonBinding = {
    ...expiredCoulson,
    signingKeyRef: computeEd25519SigningKeyRef(freshCoulsonPublic),
    publicKeySpkiBase64: freshCoulsonPublic,
  };
  const expiredCoulsonAuthority = {
    ...expiredCoulsonBinding,
    privateKey: freshCoulson.privateKey,
  };

  const expiredFitz = {
    ...data.fitz,
    validThroughSequence: 0,
    bindingId: "binding:fitz-expired",
  };
  const freshFitz = generateKeyPairSync("ed25519");
  const freshFitzPublic = freshFitz.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const expiredFitzBinding = {
    ...expiredFitz,
    signingKeyRef: computeEd25519SigningKeyRef(freshFitzPublic),
    publicKeySpkiBase64: freshFitzPublic,
  };
  const expiredFitzAuthority = {
    ...expiredFitzBinding,
    privateKey: freshFitz.privateKey,
  };

  const projection = replay([
    createMissionBegunEntry(data.brief, [expiredCoulsonBinding, expiredFitzBinding], 6),
  ]);

  assert.equal(projection.governance.state, "proposed");
  assert.equal(projection.readiness.execute.state, "waiting");
  assert.equal(projection.readiness.accept.state, "waiting");

  const missionAuthorization = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  assert.equal(missionAuthorization !== undefined, true);
  const governancePayload = evidence(expiredCoulsonAuthority, projection, missionAuthorization, "approved", 1, "expired-coulson");
  const governanceCommand = createGovernanceEntry(projection, "approve", governancePayload);
  assert.equal(governanceCommand.state, "invalid", governanceCommand.errors?.join(" "));
  assert.equal(governanceCommand.code, "binding_invalid");

  const fitzEvidenceRequirement = projection.requirements.find(({ requiredSeatId }) => requiredSeatId === "fitz");
  assert.equal(fitzEvidenceRequirement !== undefined, true);
  const fitzEvidence = evidence(expiredFitzAuthority, projection, fitzEvidenceRequirement, "approved", 1, "expired-fitz");
  const fitzEvidenceEntry = createEvidenceEntry(projection, fitzEvidence);
  assert.equal(fitzEvidenceEntry.state, "invalid", fitzEvidenceEntry.errors?.join(" "));
  assert.equal(fitzEvidenceEntry.code, "binding_invalid");

  const after = replay([
    createMissionBegunEntry(data.brief, [expiredCoulsonBinding, expiredFitzBinding], 6),
  ]);
  assert.deepEqual(after.governance, projection.governance);
  assert.deepEqual(after.evidence, projection.evidence);
  assert.deepEqual(after.readiness, projection.readiness);
});

test("expired trusted Coulson binding rejects runtime-binding authorization", () => {
  const data = fixture();
  const expiredCoulson = {
    ...data.coulson,
    validThroughSequence: 0,
    bindingId: "binding:coulson-expired",
  };
  const freshCoulson = generateKeyPairSync("ed25519");
  const freshPublic = freshCoulson.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const expiredAuthority = {
    ...expiredCoulson,
    signingKeyRef: computeEd25519SigningKeyRef(freshPublic),
    publicKeySpkiBase64: freshPublic,
  };
  const expiredSigner = {
    ...expiredAuthority,
    privateKey: freshCoulson.privateKey,
  };
  const begun = replay([
    createMissionBegunEntry(data.brief, [plainBinding(expiredAuthority), plainBinding(data.fitz)], 6),
  ]);
  const replacement = binding(data.brief, 1, 1);
  const entry = createRuntimeBindingEntry(
    begun,
    replacement,
    authorizationWithAuthority(
      expiredSigner,
      data.brief.missionId,
      data.brief.subjectId,
      replacement,
      1,
      null,
      null,
    ),
  );
  assert.equal(entry.state, "invalid");
  assert.deepEqual(
    begun.runtimeBindings,
    [],
  );
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
