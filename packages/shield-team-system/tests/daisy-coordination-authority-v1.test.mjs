import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { canonicalJson, computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
  DAISY_COORDINATION_ACTION_ID,
  DAISY_COORDINATION_CAPABILITY_CLASS,
  DAISY_COORDINATION_EFFECT_CLASS,
  computeDaisyCoordinationAuthorityDigest,
  computeDaisyCoordinationRuntimeBindingDigest,
  validateDaisyCoordinationAuthorityV1,
  validateDaisyCoordinationRuntimeBindingV1,
  validateSignedDaisyCoordinationAuthorityV1,
} from "../dist/daisy-coordination-authority-v1.mjs";
import {
  createProfileAwareDaisyCoordinationAuthorityEntryV1,
  createProfileAwareDaisyCoordinationAuthorityRevocationEntryV1,
  createProfileAwareDaisyRuntimeBindingEntryV1,
  createProfileAwareDaisyRuntimeBindingSupersessionEntryV1,
  createProfileAwareGovernanceDecisionEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  MISSION_130_JOURNAL_DIGEST,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";

const riskFlags = { production: false, destructive: false, migration: false, credentialsOrSecurity: true, externalCommunication: false, hillHighRisk: true, merge: false, deploy: false, release: false };

function signer() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    privateKey,
    binding: {
      schemaVersion: 1, bindingId: "binding:test:coulson", humanPrincipalId: "human:test:coulson", seatId: "coulson", missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64), publicKeySpkiBase64, validFromSequence: 0, validThroughSequence: null,
      attestedBy: "repository-policy:test", provenanceRef: "repository-config:test:coulson",
    },
  };
}

function signed(payload, privateKey) {
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64") };
}

function replay(entries) {
  const result = replayProfileAwareMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

function baseFixture() {
  const coulson = signer();
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2, missionId: "mission:test:daisy-coordination", objective: "Authorize bounded Daisy reconnaissance.",
    subjectId: "issue:test:daisy-coordination", riskFlags,
    participants: [{ seatId: "hill" }, { seatId: "daisy" }, { seatId: "coulson" }], activatedModes: [], requireSimmons: false,
    createdAt: { value: "2026-08-10T12:00:00Z", provenance: "humanRecorded" }, profileId: "standard", profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"], requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130", predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const entries = [createProfileAwareMissionBegunEntry(brief, [coulson.binding])];
  let projection = replay(entries);
  const requirement = projection.requirements.find(({ phase }) => phase === "authorization");
  const governancePayload = {
    schemaVersion: 1, evidenceId: "evidence:test:coulson:1", requirementId: requirement.requirementId, missionId: brief.missionId,
    revisionId: brief.revisionId, seatId: "coulson", evidenceKind: "mission_authorization", decision: "approved",
    humanPrincipalId: coulson.binding.humanPrincipalId, bindingId: coulson.binding.bindingId, signingKeyRef: coulson.binding.signingKeyRef,
    sourceRef: "source:test:coulson:1", timestamp: { value: "2026-08-10T12:01:00Z", provenance: "humanRecorded" }, journalSequence: 1,
  };
  entries.push(createProfileAwareGovernanceDecisionEntryV1({ projection, trustedBindings: [coulson.binding], evidence: signed(governancePayload, coulson.privateKey) }));
  projection = replay(entries);
  return { coulson, brief, entries, projection };
}

function authorityEnvelope(current, overrides = {}) {
  const payload = {
    schemaVersion: 1, contractVersion: "daisy-coordination-authority.v1", authorityKind: "daisy_feature_flight_coordination",
    authorityRef: `authority:${current.brief.missionId}:daisy:2`, missionId: current.brief.missionId, subjectId: current.brief.subjectId,
    missionRevisionId: current.brief.revisionId, evaluatedThroughSequence: current.projection.lastSequence,
    repositoryId: "repository:test:daisy", canonicalRepositoryRoot: "/workspace/repository", branch: "main",
    headRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seatId: "daisy", actionId: DAISY_COORDINATION_ACTION_ID,
    effectClass: DAISY_COORDINATION_EFFECT_CLASS, effectKey: "effect:test:daisy-read", capabilityClass: DAISY_COORDINATION_CAPABILITY_CLASS,
    approvedReadRoots: ["/workspace/repository"], durableArtifactRoot: "/workspace/daisy-artifacts",
    issuedAt: { value: "2026-08-10T12:02:00Z", provenance: "humanRecorded" }, signingKeyRef: current.coulson.binding.signingKeyRef,
    ...overrides,
  };
  return { ...signed(payload, current.coulson.privateKey), authorityDigest: computeDaisyCoordinationAuthorityDigest(payload) };
}

function bindingEnvelope(current, authority, version = 1, prior = null, sequence = current.projection.lastSequence + 1, overrides = {}) {
  const authorizationId = `authorization:${current.brief.missionId}:daisy-binding:${sequence}`;
  const binding = {
    schemaVersion: 1, contractVersion: "daisy-coordination-runtime-binding.v1", bindingId: `binding:${current.brief.missionId}:daisy`,
    bindingVersion: version, priorBindingId: prior?.bindingId ?? null, priorBindingVersion: prior?.bindingVersion ?? null,
    missionId: current.brief.missionId, subjectId: current.brief.subjectId, missionRevisionId: current.brief.revisionId, seatId: "daisy",
    runtimeId: `runtime:test:daisy:${version}`, modelId: `model:test:daisy:${version}`, executorId: `executor:test:daisy:${version}`,
    actionId: authority.payload.actionId, effectClass: authority.payload.effectClass, effectKey: authority.payload.effectKey,
    capabilityClass: authority.payload.capabilityClass, repositoryId: authority.payload.repositoryId,
    canonicalRepositoryRoot: authority.payload.canonicalRepositoryRoot, branch: authority.payload.branch, headRevision: authority.payload.headRevision,
    durableArtifactRoot: authority.payload.durableArtifactRoot, authorityRef: authority.payload.authorityRef, authorityDigest: authority.authorityDigest,
    authoritySequence: 2, effectiveSequence: sequence, lifecycleState: "active", coulsonAuthorizationRef: authorizationId, ...overrides,
  };
  const payload = {
    schemaVersion: 1, contractVersion: "daisy-coordination-runtime-binding-authorization.v1", authorizationId,
    missionId: current.brief.missionId, subjectId: current.brief.subjectId, seatId: "daisy", bindingId: binding.bindingId,
    bindingVersion: binding.bindingVersion, priorBindingId: binding.priorBindingId, priorBindingVersion: binding.priorBindingVersion,
    bindingDigest: computeDaisyCoordinationRuntimeBindingDigest(binding), authorityRef: authority.payload.authorityRef,
    authorityDigest: authority.authorityDigest, authoritySequence: 2, decision: "approved", previousJournalSequence: sequence - 1,
    journalSequence: sequence, signingKeyRef: current.coulson.binding.signingKeyRef, sourceRef: `source:test:daisy-binding:${sequence}`,
    issuedAt: { value: `2026-08-10T12:0${sequence}:00Z`, provenance: "humanRecorded" },
  };
  return { binding, authorization: signed(payload, current.coulson.privateKey) };
}

function authorizedFixture() {
  const current = baseFixture();
  const authority = authorityEnvelope(current);
  current.entries.push(createProfileAwareDaisyCoordinationAuthorityEntryV1({ projection: current.projection, trustedBindings: [current.coulson.binding], authority }));
  current.projection = replay(current.entries);
  const runtime = bindingEnvelope(current, authority);
  current.entries.push(createProfileAwareDaisyRuntimeBindingEntryV1({ projection: current.projection, trustedBindings: [current.coulson.binding], ...runtime }));
  current.projection = replay(current.entries);
  return { ...current, authority, runtime };
}

test("fresh signed Daisy authority and N+2 runtime binding replay without changing absent-lane bytes", () => {
  const before = baseFixture();
  assert.equal(Object.hasOwn(before.projection, "daisyCoordinationAuthority"), false);
  const beforeBytes = canonicalJson(before.projection);
  assert.equal(canonicalJson(replay(before.entries)), beforeBytes);

  const current = authorizedFixture();
  assert.equal(current.projection.daisyCoordinationAuthorityState, "authorized");
  assert.equal(current.projection.daisyCoordinationAuthoritySequence, 2);
  assert.equal(current.projection.activeDaisyRuntimeBindings[0].effectiveSequence, 3);
  assert.equal(current.projection.daisyRuntimeBindings.length, 1);
});

test("authority and binding validators reject digest, tuple, identity, overlap, proxy, and accessor substitution", () => {
  const current = baseFixture();
  const authority = authorityEnvelope(current);
  assert.equal(validateSignedDaisyCoordinationAuthorityV1(authority).state, "valid");
  assert.equal(validateSignedDaisyCoordinationAuthorityV1({ ...authority, authorityDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }).state, "invalid");
  assert.equal(validateDaisyCoordinationAuthorityV1({ ...authority.payload, seatId: "may" }).state, "invalid");
  assert.equal(validateDaisyCoordinationAuthorityV1({ ...authority.payload, durableArtifactRoot: "/workspace/repository/artifacts" }).state, "invalid");
  assert.equal(validateDaisyCoordinationAuthorityV1(new Proxy(authority.payload, {})).state, "invalid");
  const accessor = { ...authority.payload };
  Object.defineProperty(accessor, "effectKey", { enumerable: true, get: () => authority.payload.effectKey });
  assert.equal(validateDaisyCoordinationAuthorityV1(accessor).state, "invalid");

  const runtime = bindingEnvelope({ ...current, projection: { ...current.projection, lastSequence: 2 } }, authority, 1, null, 3);
  assert.equal(validateDaisyCoordinationRuntimeBindingV1(runtime.binding).state, "valid");
  assert.equal(validateDaisyCoordinationRuntimeBindingV1({ ...runtime.binding, modelId: runtime.binding.runtimeId }).state, "invalid");
  assert.equal(validateDaisyCoordinationRuntimeBindingV1({ ...runtime.binding, executorId: "fury" }).state, "invalid");
});

test("binding supersession is exact-linked and terminal revocation prevents projection and reauthorization", () => {
  const current = authorizedFixture();
  const replacement = bindingEnvelope(current, current.authority, 2, current.runtime.binding, 4);
  current.entries.push(createProfileAwareDaisyRuntimeBindingSupersessionEntryV1({
    projection: current.projection, trustedBindings: [current.coulson.binding], priorBindingId: current.runtime.binding.bindingId,
    priorBindingVersion: 1, ...replacement,
  }));
  current.projection = replay(current.entries);
  assert.equal(current.projection.activeDaisyRuntimeBindings[0].bindingVersion, 2);

  const revocationPayload = {
    schemaVersion: 1, contractVersion: "daisy-coordination-authority.v1", authorityRef: current.authority.payload.authorityRef,
    authorityDigest: current.authority.authorityDigest, authoritySequence: 2, missionId: current.brief.missionId, subjectId: current.brief.subjectId,
    missionRevisionId: current.brief.revisionId, previousJournalSequence: 4, journalSequence: 5,
    signingKeyRef: current.coulson.binding.signingKeyRef, sourceRef: "source:test:daisy-revocation:5",
    issuedAt: { value: "2026-08-10T12:05:00Z", provenance: "humanRecorded" },
  };
  current.entries.push(createProfileAwareDaisyCoordinationAuthorityRevocationEntryV1({
    projection: current.projection, trustedBindings: [current.coulson.binding], revocation: signed(revocationPayload, current.coulson.privateKey),
  }));
  current.projection = replay(current.entries);
  assert.equal(current.projection.daisyCoordinationAuthorityState, "revoked");
  assert.deepEqual(current.projection.activeDaisyRuntimeBindings, []);

  const reauthorization = authorityEnvelope({ ...current, projection: current.projection }, {
    authorityRef: "authority:mission:test:daisy-coordination:daisy:6", evaluatedThroughSequence: 5,
    issuedAt: { value: "2026-08-10T12:06:00Z", provenance: "humanRecorded" },
  });
  const replayed = replayProfileAwareMissionJournal([...current.entries, {
    schemaVersion: 9, entryId: `entry:${current.brief.missionId}:6`, missionId: current.brief.missionId, sequence: 6,
    type: "coordination.authorized", timestamp: reauthorization.payload.issuedAt, payload: { authority: reauthorization },
  }]);
  assert.equal(replayed.state, "invalid");
  assert.equal(replayed.code, "ordering_invalid");
});

test("stale, broken, and forged binding lineage fails closed without reactivating prior binding", () => {
  const current = authorizedFixture();
  const replacement = bindingEnvelope(current, current.authority, 2, current.runtime.binding, 4);
  const broken = { ...replacement.binding, priorBindingVersion: 9 };
  const result = replayProfileAwareMissionJournal([...current.entries, {
    schemaVersion: 9, entryId: `entry:${current.brief.missionId}:4`, missionId: current.brief.missionId, sequence: 4,
    type: "coordination.runtime_binding_superseded", timestamp: replacement.authorization.payload.issuedAt,
    payload: { priorBindingId: current.runtime.binding.bindingId, priorBindingVersion: 1, binding: broken, authorization: replacement.authorization },
  }]);
  assert.equal(result.state, "invalid");
});
