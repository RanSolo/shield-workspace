import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  replaySupervisedMissionJournal,
} from "../dist/mission-v2.mjs";
import {
  createProfileAwareImplementationAuthorityEntryV1,
  createProfileAwareImplementationAuthorityRevocationEntryV1,
  createProfileAwareCommunicationResultEntryV1,
  createProfileAwareExecutionEffectEntryV1,
  createProfileAwareGovernanceDecisionEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  createProfileRequirementsV1,
  MISSION_130_JOURNAL_DIGEST,
  replayProfileAwareMissionJournal,
  validateProfileAwareMissionBrief,
  createProfileAwareRuntimeBindingRecordedEntryV1,
  createProfileAwareRuntimeBindingSupersessionEntryV1,
} from "../dist/profile-aware-mission-v1.mjs";
import {
  computeReviewPublicationAuthorityDigest,
  evaluateReviewPublicationV1,
} from "../dist/review-publication-v1.mjs";
import {
  computeImplementationAuthorityDigest,
  computeRuntimeBindingDigest,
  computeSchema9RuntimeBindingDigest,
} from "../dist/implementation-authority-v1.mjs";
import { publicationJournalFixture } from "./fixtures/review-publication-journal.mjs";

const predecessorDigest = "sha256:7f1f8c50a703cf43e1c477d88446473c5d1d755b99a4ad35a2b6662558ded7b9";
const riskFlags = { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: true };

function authority(seatId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    privateKey,
    binding: { schemaVersion: 1, bindingId: `binding:${seatId}`, humanPrincipalId: `human:${seatId}`, seatId, missionScope: "*", signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64), publicKeySpkiBase64, validFromSequence: 0, validThroughSequence: null, attestedBy: "repository-policy:maintainer", provenanceRef: `repository-config:${seatId}` },
  };
}

function brief(profileId) {
  const profileGates = profileId === "standard" ? ["coulson"] : profileId === "high_assurance" ? ["coulson", "fitz"] : ["coulson", "simmons"];
  return createProfileAwareMissionBrief({ schemaVersion: 2, missionId: `mission:profile:${profileId}`, objective: "Complete one bounded profile-aware fixture.", subjectId: "issue:131", riskFlags, participants: [{ seatId: "hill" }, { seatId: "may" }, ...profileGates.map((seatId) => ({ seatId }))], activatedModes: [], requireSimmons: profileId === "product_sensitive", createdAt: { value: "2026-07-29T15:00:00Z", provenance: "humanRecorded" }, profileId, profileVersion: 1, requiredExecutionGateRoleIds: profileGates, requiredFinalAcceptanceGateRoleIds: ["coulson"], predecessorMissionId: "mission:issue-130", predecessorJournalDigest: predecessorDigest });
}

function evidence(authorityRecord, projection, requirement, sequence) {
  const payload = { schemaVersion: 1, evidenceId: `evidence:${authorityRecord.binding.seatId}:${sequence}`, requirementId: requirement.requirementId, missionId: projection.missionId, revisionId: projection.brief.revisionId, seatId: authorityRecord.binding.seatId, evidenceKind: requirement.evidenceKind, decision: "approved", humanPrincipalId: authorityRecord.binding.humanPrincipalId, bindingId: authorityRecord.binding.bindingId, signingKeyRef: authorityRecord.binding.signingKeyRef, sourceRef: `manual-signature:${sequence}`, timestamp: { value: `2026-07-29T15:0${sequence}:00Z`, provenance: "humanRecorded" }, journalSequence: sequence };
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), authorityRecord.privateKey).toString("base64") };
}

function trustedAuthorityBinding(brief, trustedBinding, sequence, overrides = {}) {
  const binding = trustedBinding.binding ?? trustedBinding;
  const payload = {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: `authority:${brief.missionId}:1`,
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    seatId: "may",
    missionRevisionId: brief.revisionId,
    artifactRevisionId: "sha256:artifact_issue_181",
    repositoryId: "repository:issue-181",
    canonicalWritableRoot: "/workspace/repository",
    branch: "main",
    baseRevision: "sha256:base_issue_181",
    headRevision: "sha256:head_issue_181",
    modelId: "model:may",
    approvedRelativePaths: ["docs", "src"],
    approvedActionIds: ["edit:implementation", "read:issue"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: ["effect:implementation", "effect:validation"],
    approvedCapabilities: ["filesystem_write", "github_issues"],
    validationCommandIds: ["validation:lint", "validation:test"],
    journalSequence: sequence,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `source:implementation-authority:${sequence}`,
    evidenceRef: `evidence:implementation-authority:${sequence}`,
    timestamp: { value: `2026-07-29T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
    ...overrides,
  };
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), trustedBinding.privateKey).toString("base64") };
}

function trustedAuthorityRevocation(authority, trustedBinding, sequence, previousSequence, overrides = {}) {
  const binding = trustedBinding.binding ?? trustedBinding;
  const payload = {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityRef: authority.payload.authorityRef,
    authorityDigest: computeImplementationAuthorityDigest(authority.payload),
    authoritySequence: authority.payload.journalSequence,
    missionId: authority.payload.missionId,
    subjectId: authority.payload.subjectId,
    missionRevisionId: authority.payload.missionRevisionId,
    previousJournalSequence: previousSequence,
    journalSequence: sequence,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `source:implementation-authority-revocation:${sequence}`,
    timestamp: { value: `2026-07-29T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
    ...overrides,
  };
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), trustedBinding.privateKey).toString("base64") };
}

function schema9RuntimeBindingBase(brief, sequence, authority, overrides = {}) {
  return {
    bindingSchemaVersion: 1,
    bindingId: `binding:${brief.missionId}:may`,
    bindingVersion: 1,
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    missionRevisionId: brief.revisionId,
    seatId: "may",
    reasoningRuntimeId: "runtime:may",
    toolExecutorId: "tool:executor",
    repositoryId: authority.repositoryId,
    canonicalWritableRoot: authority.canonicalWritableRoot,
    branch: authority.branch,
    artifactRevisionId: authority.artifactRevisionId,
    recordedAtSequence: sequence,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: ["edit:implementation", "read:issue"],
      effectClasses: ["behavioral_implementation", "verification"],
      effectKeys: ["effect:implementation", "effect:validation"],
      capabilities: ["filesystem_write", "github_issues"],
    },
    coulsonAuthorizationRef: "authorization:runtime-binding:1",
    ...overrides,
  };
}

function schema9BindingEnvelope(brief, baseAuthority, binding, overrides = {}) {
  return {
    schemaVersion: 1,
    binding,
    implementationAuthorityRef: baseAuthority.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(baseAuthority),
    implementationAuthoritySequence: baseAuthority.journalSequence,
    approvedRelativePaths: [...baseAuthority.approvedRelativePaths],
    validationCommandIds: [...baseAuthority.validationCommandIds],
    modelId: baseAuthority.modelId,
    baseRevision: baseAuthority.baseRevision,
    headRevision: baseAuthority.headRevision,
    ...overrides,
  };
}

function schema9BindingAuthorization(brief, binding, wrapper, trustedBinding, sequence, previousSequence, authorizationId, priorBindingId = null, priorBindingVersion = null, overrides = {}) {
  const bindingRecord = trustedBinding.binding ?? trustedBinding;
  const payload = {
    schemaVersion: 1,
    authorizationId,
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    seatId: binding.seatId,
    bindingId: binding.bindingId,
    bindingVersion: binding.bindingVersion,
    priorBindingId,
    priorBindingVersion,
    bindingDigest: computeRuntimeBindingDigest(binding),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(wrapper),
    artifactRevisionId: binding.artifactRevisionId,
    decision: "approved",
    previousJournalSequence: previousSequence,
    journalSequence: sequence,
    humanPrincipalId: bindingRecord.humanPrincipalId,
    humanBindingId: bindingRecord.bindingId,
    signingKeyRef: bindingRecord.signingKeyRef,
    sourceRef: `source:runtime-binding:${authorizationId}`,
    timestamp: { value: `2026-07-29T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
    ...overrides,
  };
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), trustedBinding.privateKey).toString("base64") };
}

function replay(entries) {
  const result = replayProfileAwareMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

function boundRuntimeFixture() {
  const current = brief("standard");
  const coulson = authority("coulson");
  const entries = [createProfileAwareMissionBegunEntry(current, [coulson.binding])];
  let projection = replay(entries);
  const governance = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"), 1);
  entries.push({ schemaVersion: 9, entryId: `entry:${current.missionId}:1`, missionId: current.missionId, sequence: 1, type: "governance.decided", timestamp: governance.payload.timestamp, payload: { evidence: governance } });
  projection = replay(entries);
  const implementationAuthority = trustedAuthorityBinding(current, { ...coulson, ...coulson.binding }, 2);
  entries.push(createProfileAwareImplementationAuthorityEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    authority: implementationAuthority,
  }));
  projection = replay(entries);
  const binding = schema9RuntimeBindingBase(current, 3, implementationAuthority.payload);
  const wrapper = schema9BindingEnvelope(current, implementationAuthority.payload, binding);
  const authorization = schema9BindingAuthorization(current, binding, wrapper, { ...coulson, ...coulson.binding }, 3, 2, binding.coulsonAuthorizationRef);
  entries.push(createProfileAwareRuntimeBindingRecordedEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    binding: wrapper,
    authorization,
  }));
  return { current, coulson, entries, implementationAuthority, binding, projection: replay(entries) };
}

test("profile selection/version and predecessor digest are frozen into the brief", () => {
  const selected = brief("high_assurance");
  assert.equal(validateProfileAwareMissionBrief(selected).state, "valid");
  assert.deepEqual(selected.requiredExecutionGateRoleIds, ["coulson", "fitz"]);
  const tampered = { ...selected, profileId: "standard" };
  assert.equal(validateProfileAwareMissionBrief(tampered).state, "invalid");
  assert.equal(validateProfileAwareMissionBrief({ ...selected, predecessorJournalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }).state, "invalid");
  assert.equal(MISSION_130_JOURNAL_DIGEST, predecessorDigest);
});

test("profile-aware brief participants reject disabled and unknown dispatch seats", () => {
  const { revisionId, ...current } = brief("standard");
  assert.equal(validateProfileAwareMissionBrief(createProfileAwareMissionBrief(current)).state, "valid");
  assert.equal(validateProfileAwareMissionBrief(createProfileAwareMissionBrief({
    ...current,
    participants: [...current.participants, { seatId: "mack" }],
  })).state, "invalid");
  assert.equal(validateProfileAwareMissionBrief(createProfileAwareMissionBrief({
    ...current,
    participants: [...current.participants, { seatId: "oracle" }],
  })).state, "invalid");
  assert.equal(validateProfileAwareMissionBrief(createProfileAwareMissionBrief({
    ...current,
    participants: [...current.participants, { seatId: "user:bad" }],
  })).state, "invalid");
});

test("standard, high-assurance, and product-sensitive readiness use only frozen gates", () => {
  for (const [profileId, expected] of [["standard", ["coulson", "final_acceptance"]], ["high_assurance", ["coulson", "fitz", "final_acceptance"]], ["product_sensitive", ["coulson", "simmons", "final_acceptance"]]]) {
    const current = brief(profileId);
    assert.deepEqual(createProfileRequirementsV1(current).map(({ requiredRoleId, evidenceKind }) => requiredRoleId === "coulson" && evidenceKind === "final_acceptance" ? "final_acceptance" : requiredRoleId), expected);
    assert.equal(replay([createProfileAwareMissionBegunEntry(current, [authority("coulson").binding])]).readiness.execute, "waiting");
  }
});

test("profile-aware brief activations reject human gates and V0.3-disabled dispatch seats", () => {
  const { revisionId, ...baseContent } = brief("standard");
  assert.equal(validateProfileAwareMissionBrief(createProfileAwareMissionBrief({
    ...baseContent,
    activatedModes: [{
      modeId: "delivery",
      modeVersion: "1.0.0",
      seatId: "mack",
      activationSource: "mission-brief",
    }],
  })).state, "invalid");
  assert.equal(validateProfileAwareMissionBrief(createProfileAwareMissionBrief({
    ...baseContent,
    activatedModes: [{
      modeId: "delivery",
      modeVersion: "1.0.0",
      seatId: "coulson",
      activationSource: "mission-brief",
    }],
  })).state, "invalid");
  assert.equal(validateProfileAwareMissionBrief(createProfileAwareMissionBrief({
    ...baseContent,
    activatedModes: [{
      modeId: "delivery",
      modeVersion: "1.0.0",
      seatId: "may",
      activationSource: "mission-brief",
    }],
  })).state, "valid");
});

test("Coulson authorization is distinct from final acceptance and ordering is replayed", () => {
  const current = brief("standard");
  const coulson = authority("coulson");
  const entries = [createProfileAwareMissionBegunEntry(current, [coulson.binding])];
  let projection = replay(entries);
  const authorization = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"), 1);
  entries.push(createProfileAwareGovernanceDecisionEntryV1({ projection, trustedBindings: [coulson.binding], evidence: authorization }));
  projection = replay(entries);
  const implementationAuthority = trustedAuthorityBinding(current, { ...coulson, ...coulson.binding }, 2);
  entries.push(createProfileAwareImplementationAuthorityEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    authority: implementationAuthority,
  }));
  projection = replay(entries);
  assert.equal(projection.implementationAuthorityState, "authorized");
  assert.equal(projection.authorization, "authorized");
  const premature = { schemaVersion: 9, entryId: `${current.missionId}:3`, missionId: current.missionId, sequence: 3, type: "final_acceptance.recorded", timestamp: { value: "2026-07-29T15:03:00Z", provenance: "humanRecorded" }, payload: { evidence: evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "final_acceptance"), 3) } };
  assert.equal(replayProfileAwareMissionJournal([...entries, premature]).state, "invalid");
  entries.push({ schemaVersion: 9, entryId: `${current.missionId}:3`, missionId: current.missionId, sequence: 3, type: "execution.transition", timestamp: { value: "2026-07-29T15:03:00Z", provenance: "hostTrusted" }, payload: { from: "not-started", to: "running" } });
  const transitionOnlyCompletion = { schemaVersion: 9, entryId: `${current.missionId}:4`, missionId: current.missionId, sequence: 4, type: "execution.transition", timestamp: { value: "2026-07-29T15:04:00Z", provenance: "hostTrusted" }, payload: { from: "running", to: "completed" } };
  assert.equal(replayProfileAwareMissionJournal([...entries, transitionOnlyCompletion]).state, "invalid");
  projection = replay(entries);
  const completionEntry = createProfileAwareExecutionEffectEntryV1({
    projection,
    candidate: {
      runnerContractVersion: 1,
      candidateKind: "runner.supervised_effect_record",
      authority: "non_authoritative",
      journalSchemaVersion: 9,
      missionId: current.missionId,
      subjectId: current.subjectId,
      revisionId: current.revisionId,
      expectedPreviousSequence: 3,
      intendedJournalSequence: 4,
      payload: {
        runnerContractVersion: 1,
        cycleId: "cycle:acceptance-ordering",
        subjectId: current.subjectId,
        revisionId: current.revisionId,
        evaluatedThroughSequence: 3,
        seatId: "may",
        actionId: "complete-acceptance-ordering",
        effectClass: "behavioral_implementation",
        effectKey: "effect:acceptance-ordering",
        authorizationDecisionId: "decision:acceptance-ordering",
        outcome: "completed",
        reasonCode: "effect_completed",
        summary: "Authoritative execution completed.",
        evidenceRefs: ["evidence:acceptance-ordering"],
      },
    },
    timestamp: { value: "2026-07-29T15:04:00Z", provenance: "hostTrusted" },
  });
  assert.equal(replayProfileAwareMissionJournal([...entries, completionEntry]).state, "valid");
  projection = replay([...entries, completionEntry]);
  const accepted = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "final_acceptance"), 5);
  const acceptedEntry = { schemaVersion: 9, entryId: `${current.missionId}:5`, missionId: current.missionId, sequence: 5, type: "final_acceptance.recorded", timestamp: accepted.payload.timestamp, payload: { evidence: accepted } };
  const acceptedReplay = replayProfileAwareMissionJournal([...entries, completionEntry, acceptedEntry]);
  assert.equal(acceptedReplay.state, "valid", acceptedReplay.errors?.join(" "));
  assert.equal(acceptedReplay.value.finalAcceptance, "accepted");
});

test("profile-aware governance producer verifies the unique pending Coulson authorization", () => {
  const current = brief("standard");
  const coulson = authority("coulson");
  const begun = createProfileAwareMissionBegunEntry(current, [coulson.binding]);
  const projection = replay([begun]);
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const authorization = evidence(coulson, projection, requirement, 1);
  const entry = createProfileAwareGovernanceDecisionEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    evidence: authorization,
  });
  assert.equal(entry.type, "governance.decided");
  assert.equal(entry.sequence, 1);
  assert.deepEqual(entry.timestamp, authorization.payload.timestamp);
  assert.equal(replay([begun, entry]).authorization, "authorized");

  assert.throws(() => createProfileAwareGovernanceDecisionEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    evidence: { ...authorization, signatureBase64: "forged" },
  }), /signature/);
  const otherCoulson = authority("coulson");
  assert.throws(() => createProfileAwareGovernanceDecisionEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    evidence: {
      ...authorization,
      signatureBase64: sign(null, Buffer.from(canonicalJson(authorization.payload)), otherCoulson.privateKey).toString("base64"),
    },
  }), /signature/);
  const backwardPayload = {
    ...authorization.payload,
    timestamp: { value: "2026-07-29T14:59:59Z", provenance: "humanRecorded" },
  };
  assert.throws(() => createProfileAwareGovernanceDecisionEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    evidence: {
      payload: backwardPayload,
      signatureBase64: sign(null, Buffer.from(canonicalJson(backwardPayload)), coulson.privateKey).toString("base64"),
    },
  }), /timestamp moves backward/);
  assert.throws(() => createProfileAwareGovernanceDecisionEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    evidence: { ...authorization, payload: { ...authorization.payload, timestamp: { value: "not-a-time", provenance: "humanRecorded" } } },
  }), /identity or sequence/);
  assert.throws(() => createProfileAwareGovernanceDecisionEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    evidence: { ...authorization, payload: { ...authorization.payload, journalSequence: 9 } },
  }), /identity or sequence/);
  assert.throws(() => createProfileAwareGovernanceDecisionEntryV1({
    projection: { ...projection, requirements: [...projection.requirements, { ...requirement, requirementId: `${requirement.requirementId}:duplicate` }] },
    trustedBindings: [coulson.binding],
    evidence: authorization,
  }), /exactly one unsatisfied Coulson requirement/);
  assert.throws(() => createProfileAwareGovernanceDecisionEntryV1({
    projection: { ...projection, execution: "running" },
    trustedBindings: [coulson.binding],
    evidence: authorization,
  }), /waiting not-started mission/);
});

test("wrong-seat, stale, duplicate, and weakened evidence fail closed", () => {
  const current = brief("high_assurance");
  const coulson = authority("coulson");
  const fitz = authority("fitz");
  const entries = [createProfileAwareMissionBegunEntry(current, [coulson.binding, fitz.binding])];
  let projection = replay(entries);
  const auth = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"), 1);
  entries.push({ schemaVersion: 9, entryId: `${current.missionId}:1`, missionId: current.missionId, sequence: 1, type: "governance.decided", timestamp: auth.payload.timestamp, payload: { evidence: auth } });
  projection = replay(entries);
  const fitzRequirement = projection.requirements.find(({ requiredRoleId }) => requiredRoleId === "fitz");
  const wrongSeat = evidence(coulson, projection, fitzRequirement, 2);
  const wrongEntry = { schemaVersion: 9, entryId: `${current.missionId}:2`, missionId: current.missionId, sequence: 2, type: "evidence.recorded", timestamp: wrongSeat.payload.timestamp, payload: { evidence: wrongSeat } };
  assert.equal(replayProfileAwareMissionJournal([...entries, wrongEntry]).state, "invalid");
  const validFitz = evidence(fitz, projection, fitzRequirement, 2);
  entries.push({ ...wrongEntry, payload: { evidence: validFitz } });
  assert.equal(replayProfileAwareMissionJournal([...entries, entries[2]]).state, "invalid");
  projection = replay(entries);
  const duplicateRequirement = evidence(fitz, projection, fitzRequirement, 3);
  const duplicateRequirementResult = replayProfileAwareMissionJournal([...entries, {
    schemaVersion: 9,
    entryId: `${current.missionId}:3`,
    missionId: current.missionId,
    sequence: 3,
    type: "evidence.recorded",
    timestamp: duplicateRequirement.payload.timestamp,
    payload: { evidence: duplicateRequirement },
  }]);
  assert.equal(duplicateRequirementResult.state, "invalid");
  assert.equal(duplicateRequirementResult.code, "duplicate_evidence");
  assert.equal(validateProfileAwareMissionBrief({ ...current, requiredExecutionGateRoleIds: ["coulson"], revisionId: current.revisionId }).state, "invalid");
});

test("Mission #130 predecessor digest and bytes remain unchanged", async () => {
  const fs = await import("node:fs/promises");
  const testDirectory = resolve(dirname(fileURLToPath(import.meta.url)));
  const legacyPath = resolve(testDirectory, "..", "..", "..", ".shield", "journals", "bWlzc2lvbjppc3N1ZS0xMzA.jsonl");
  try {
    const bytes = await fs.readFile(legacyPath);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), predecessorDigest.slice("sha256:".length));
    assert.ok(bytes.length > 0);
    const legacyReplay = replaySupervisedMissionJournal(bytes.toString("utf8").trimEnd().split("\n").map((line) => JSON.parse(line)));
    assert.equal(legacyReplay.state, "valid", legacyReplay.errors?.join(" "));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    assert.equal(MISSION_130_JOURNAL_DIGEST, predecessorDigest);
  }
});

test("schema 9 closes trusted bindings and nested event payloads", () => {
  const current = brief("standard");
  const coulson = authority("coulson");
  const begun = createProfileAwareMissionBegunEntry(current, [coulson.binding]);
  assert.equal(replayProfileAwareMissionJournal([{ ...begun, payload: { ...begun.payload, trustedBindings: [coulson.binding, coulson.binding] } }]).state, "invalid");
  const entries = [begun];
  const projection = replay(entries);
  const authorization = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"), 1);
  entries.push({ schemaVersion: 9, entryId: `${current.missionId}:1`, missionId: current.missionId, sequence: 1, type: "governance.decided", timestamp: authorization.payload.timestamp, payload: { evidence: authorization, unexpected: true } });
  assert.equal(replayProfileAwareMissionJournal(entries).state, "invalid");
});

test("schema 9 records completed and uncertain runner effects with fail-closed replay", () => {
  const current = brief("standard");
  const coulson = authority("coulson");
  const entries = [createProfileAwareMissionBegunEntry(current, [coulson.binding])];
  let projection = replay(entries);
  const authorization = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"), 1);
  entries.push({ schemaVersion: 9, entryId: `entry:${current.missionId}:1`, missionId: current.missionId, sequence: 1, type: "governance.decided", timestamp: authorization.payload.timestamp, payload: { evidence: authorization } });
  entries.push({ schemaVersion: 9, entryId: `entry:${current.missionId}:2`, missionId: current.missionId, sequence: 2, type: "execution.transition", timestamp: { value: "2026-07-29T15:02:00Z", provenance: "hostTrusted" }, payload: { from: "not-started", to: "running" } });
  projection = replay(entries);
  const candidate = {
    runnerContractVersion: 1,
    candidateKind: "runner.supervised_effect_record",
    authority: "non_authoritative",
    journalSchemaVersion: 9,
    missionId: current.missionId,
    subjectId: current.subjectId,
    revisionId: current.revisionId,
    expectedPreviousSequence: 2,
    intendedJournalSequence: 3,
    payload: {
      runnerContractVersion: 1,
      cycleId: "cycle:profile-aware:1",
      subjectId: current.subjectId,
      revisionId: current.revisionId,
      evaluatedThroughSequence: 2,
      seatId: "may",
      actionId: "implement-profile-aware-effect",
      effectClass: "behavioral_implementation",
      effectKey: "effect:profile-aware:1",
      authorizationDecisionId: "decision:profile-aware:1",
      outcome: "completed",
      reasonCode: "effect_completed",
      summary: "Profile-aware effect completed.",
      evidenceRefs: ["evidence:profile-aware:1"],
    },
  };
  const completedEntry = createProfileAwareExecutionEffectEntryV1({
    projection,
    candidate,
    timestamp: { value: "2026-07-29T15:03:00Z", provenance: "hostTrusted" },
  });
  const completed = replay([...entries, completedEntry]);
  assert.equal(completed.execution, "completed");
  assert.equal(completed.effects.length, 1);
  assert.equal(completed.effects[0].effectKey, candidate.payload.effectKey);

  const uncertainEntry = createProfileAwareExecutionEffectEntryV1({
    projection,
    candidate: {
      ...candidate,
      payload: {
        ...candidate.payload,
        outcome: "uncertain",
        reasonCode: "executor_uncertain",
      },
    },
    timestamp: { value: "2026-07-29T15:03:00Z", provenance: "hostTrusted" },
  });
  const uncertain = replay([...entries, uncertainEntry]);
  assert.equal(uncertain.execution, "running");
  assert.equal(uncertain.readiness.execute, "blocked");
  assert.throws(() => createProfileAwareExecutionEffectEntryV1({
    projection: uncertain,
    candidate: {
      ...candidate,
      expectedPreviousSequence: 3,
      intendedJournalSequence: 4,
      payload: {
        ...candidate.payload,
        cycleId: "cycle:profile-aware:2",
        effectKey: "effect:profile-aware:2",
        evaluatedThroughSequence: 3,
      },
    },
    timestamp: { value: "2026-07-29T15:04:00Z", provenance: "hostTrusted" },
  }), /recovery/);
});

test("schema-9 implementation authority lifecycle is ordered, immutable, and atomically revokes active bindings", () => {
  const current = brief("standard");
  const coulson = authority("coulson");
  const entries = [createProfileAwareMissionBegunEntry(current, [coulson.binding])];
  let projection = replay(entries);
  const auth = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"), 1);
  entries.push({ schemaVersion: 9, entryId: `entry:${current.missionId}:1`, missionId: current.missionId, sequence: 1, type: "governance.decided", timestamp: auth.payload.timestamp, payload: { evidence: auth } });

  projection = replay(entries);
  const implementationAuthority = trustedAuthorityBinding(current, { ...coulson, ...coulson.binding }, 2);
  entries.push(createProfileAwareImplementationAuthorityEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    authority: implementationAuthority,
  }));
  projection = replay(entries);
  assert.equal(projection.implementationAuthorityState, "authorized");
  assert.equal(projection.implementationAuthorityDigest, computeImplementationAuthorityDigest(implementationAuthority.payload));
  assert.equal(projection.activeRuntimeBindings.length, 0);

  const firstBinding = schema9RuntimeBindingBase(current, 3, implementationAuthority.payload);
  const firstWrapper = schema9BindingEnvelope(current, implementationAuthority.payload, firstBinding);
  const firstAuth = schema9BindingAuthorization(current, firstBinding, firstWrapper, { ...coulson, ...coulson.binding }, 3, 2, "authorization:runtime-binding:1");
  entries.push(createProfileAwareRuntimeBindingRecordedEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    binding: firstWrapper,
    authorization: firstAuth,
  }));
  projection = replay(entries);
  assert.equal(projection.runtimeBindings.length, 1);
  assert.equal(projection.activeRuntimeBindings.length, 1);
  assert.equal(projection.activeRuntimeBindings[0].binding.bindingVersion, 1);
  projection.activeRuntimeBindings[0].binding.bindingVersion = 99;
  assert.equal(replay(entries).activeRuntimeBindings[0].binding.bindingVersion, 1);
  projection = replay(entries);

  const secondBinding = schema9RuntimeBindingBase(current, 4, implementationAuthority.payload, {
    bindingVersion: 2,
    recordedAtSequence: 4,
    coulsonAuthorizationRef: "authorization:runtime-binding:2",
  });
  const secondWrapper = schema9BindingEnvelope(current, implementationAuthority.payload, secondBinding);
  const secondAuth = schema9BindingAuthorization(current, secondBinding, secondWrapper, { ...coulson, ...coulson.binding }, 4, 3, "authorization:runtime-binding:2", firstBinding.bindingId, 1);
  entries.push(createProfileAwareRuntimeBindingSupersessionEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    priorBindingId: firstBinding.bindingId,
    priorBindingVersion: 1,
    binding: secondWrapper,
    authorization: secondAuth,
  }));
  projection = replay(entries);
  assert.equal(projection.runtimeBindings.length, 2);
  assert.equal(projection.activeRuntimeBindings.length, 1);
  assert.equal(projection.activeRuntimeBindings[0].binding.bindingVersion, 2);

  const revoke = trustedAuthorityRevocation(implementationAuthority, { ...coulson, ...coulson.binding }, 5, 4);
  entries.push(createProfileAwareImplementationAuthorityRevocationEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    revocation: revoke,
  }));
  projection = replay(entries);
  assert.equal(projection.implementationAuthorityState, "revoked");
  assert.equal(projection.activeRuntimeBindings.length, 0);
  assert.equal(projection.runtimeBindings.length, 2);
});

test("schema-9 implementation authority and runtime binding constructors reject disallowed lifecycle transitions", () => {
  const current = brief("standard");
  const coulson = authority("coulson");
  const entries = [createProfileAwareMissionBegunEntry(current, [coulson.binding])];
  const noAuthProjection = replay(entries);
  assert.throws(() => createProfileAwareImplementationAuthorityEntryV1({
    projection: noAuthProjection,
    trustedBindings: [coulson.binding],
    authority: trustedAuthorityBinding(current, { ...coulson, ...coulson.binding }, 1),
  }));

  const governance = evidence(coulson, noAuthProjection, noAuthProjection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"), 1);
  entries.push({ schemaVersion: 9, entryId: `entry:${current.missionId}:1`, missionId: current.missionId, sequence: 1, type: "governance.decided", timestamp: governance.payload.timestamp, payload: { evidence: governance } });
  const authorizedProjection = replay(entries);
  const implementationAuthority = trustedAuthorityBinding(current, { ...coulson, ...coulson.binding }, 2, { authorityRef: "authority:may-runtime", authorityKind: "wheels_up" });
  const authorityEntry = createProfileAwareImplementationAuthorityEntryV1({
    projection: authorizedProjection,
    trustedBindings: [coulson.binding],
    authority: implementationAuthority,
  });
  entries.push(authorityEntry);

  const projectionWithAuthority = replay(entries);
  const binding = schema9RuntimeBindingBase(current, 3, implementationAuthority.payload, {
    coulsonAuthorizationRef: "authorization:runtime-binding:1",
  });
  const wrapper = schema9BindingEnvelope(current, implementationAuthority.payload, binding);
  const bindingAuth = schema9BindingAuthorization(current, binding, wrapper, { ...coulson, ...coulson.binding }, 3, 2, "authorization:runtime-binding:1");
  entries.push(createProfileAwareRuntimeBindingRecordedEntryV1({
    projection: projectionWithAuthority,
    trustedBindings: [coulson.binding],
    binding: wrapper,
    authorization: bindingAuth,
  }));
  assert.equal(replay(entries).activeRuntimeBindings.length, 1);

  assert.throws(() => createProfileAwareRuntimeBindingRecordedEntryV1({
    projection: projectionWithAuthority,
    trustedBindings: [coulson.binding],
    binding: wrapper,
    authorization: { ...bindingAuth, payload: { ...bindingAuth.payload, ...{ timestamp: { value: "2026-07-29T15:99:00Z", provenance: "humanRecorded" } } } },
  }));

  const replayed = replayProfileAwareMissionJournal([
    ...entries,
    {
      schemaVersion: 9,
      entryId: `${current.missionId}:4`,
      missionId: current.missionId,
      sequence: 4,
      type: "implementation.authorized",
      timestamp: implementationAuthority.payload.timestamp,
      payload: { authority: implementationAuthority },
    },
  ]);
  assert.equal(replayed.state, "invalid");

  const firstRevocationPayload = trustedAuthorityRevocation(implementationAuthority, { ...coulson, ...coulson.binding }, 4, 3);
  const firstRevocation = createProfileAwareImplementationAuthorityRevocationEntryV1({
    projection: replay(entries),
    trustedBindings: [coulson.binding],
    revocation: firstRevocationPayload,
  });
  entries.push(firstRevocation);
  const revokedProjection = replay(entries);
  const duplicateRevocationPayload = trustedAuthorityRevocation(implementationAuthority, { ...coulson, ...coulson.binding }, 5, 4);
  assert.throws(() => createProfileAwareImplementationAuthorityRevocationEntryV1({
    projection: revokedProjection,
    trustedBindings: [coulson.binding],
    revocation: duplicateRevocationPayload,
  }));
});

test("schema-9 binding scope and sequence failures are replay-closed", () => {
  const current = brief("standard");
  const coulson = authority("coulson");
  const entries = [createProfileAwareMissionBegunEntry(current, [coulson.binding])];
  let projection = replay(entries);
  const governance = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"), 1);
  entries.push({ schemaVersion: 9, entryId: `entry:${current.missionId}:1`, missionId: current.missionId, sequence: 1, type: "governance.decided", timestamp: governance.payload.timestamp, payload: { evidence: governance } });
  projection = replay(entries);

  const implementationAuthority = trustedAuthorityBinding(current, { ...coulson, ...coulson.binding }, 2);
  entries.push(createProfileAwareImplementationAuthorityEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    authority: implementationAuthority,
  }));
  projection = replay(entries);

  const binding = schema9RuntimeBindingBase(current, 3, implementationAuthority.payload, {
    approvedScope: {
      actionIds: ["edit:implementation", "read:issue", "deploy:unauthorized"],
      effectClasses: ["behavioral_implementation", "verification"],
      effectKeys: ["effect:implementation", "effect:validation"],
      capabilities: ["filesystem_write", "github_issues"],
    },
    seatId: "fitz",
  });
  const wrapper = schema9BindingEnvelope(current, implementationAuthority.payload, binding, { approvedRelativePaths: ["docs", "src", "forbidden"] });
  const bindingAuth = schema9BindingAuthorization(current, binding, wrapper, { ...coulson, ...coulson.binding }, 3, 2, "authorization:runtime-binding:1");
  assert.throws(() => createProfileAwareRuntimeBindingRecordedEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    binding: wrapper,
    authorization: bindingAuth,
  }));

  const invalidSequenceAuth = schema9BindingAuthorization(current, binding, wrapper, { ...coulson, ...coulson.binding }, 5, 3, "authorization:runtime-binding:bad");
  assert.throws(() => createProfileAwareRuntimeBindingRecordedEntryV1({
    projection,
    trustedBindings: [coulson.binding],
    binding: wrapper,
    authorization: { ...invalidSequenceAuth, payload: { ...invalidSequenceAuth.payload, ...{ previousJournalSequence: 2 } } },
  }));

  assert.throws(() => {
    const missingPriorIdentityAuth = schema9BindingAuthorization(current, binding, wrapper, { ...coulson, ...coulson.binding }, 3, 2, "authorization:runtime-binding:1", undefined, undefined);
    createProfileAwareRuntimeBindingSupersessionEntryV1({
      projection,
      trustedBindings: [coulson.binding],
      priorBindingId: "binding:missing",
      priorBindingVersion: 1,
      binding: wrapper,
      authorization: missingPriorIdentityAuth,
    });
  });

  const legacyEntry = { schemaVersion: 8, entryId: `entry:${current.missionId}:3`, missionId: current.missionId, sequence: 3, type: "execution.transition", timestamp: { value: "2026-07-29T15:03:00Z", provenance: "hostTrusted" }, payload: { from: "not-started", to: "running" } };
  const legacyReplay = replayProfileAwareMissionJournal([entries[0], { ...entries[1], sequence: 1 }, legacyEntry].map((entry) => ({ ...entry })));
  assert.equal(legacyReplay.state, "invalid");
});

test("running supersession changes runtime identities and closes the exact historical binding", () => {
  const fixture = boundRuntimeFixture();
  fixture.entries.push({
    schemaVersion: 9,
    entryId: `entry:${fixture.current.missionId}:4`,
    missionId: fixture.current.missionId,
    sequence: 4,
    type: "execution.transition",
    timestamp: { value: "2026-07-29T15:04:00Z", provenance: "hostTrusted" },
    payload: { from: "not-started", to: "running" },
  });
  let projection = replay(fixture.entries);
  const replacement = schema9RuntimeBindingBase(fixture.current, 5, fixture.implementationAuthority.payload, {
    bindingVersion: 2,
    reasoningRuntimeId: "runtime:may:replacement",
    toolExecutorId: "tool:executor:replacement",
    coulsonAuthorizationRef: "authorization:runtime-binding:replacement",
  });
  const wrapper = schema9BindingEnvelope(fixture.current, fixture.implementationAuthority.payload, replacement, {
    modelId: fixture.implementationAuthority.payload.modelId,
  });
  const authorization = schema9BindingAuthorization(
    fixture.current,
    replacement,
    wrapper,
    { ...fixture.coulson, ...fixture.coulson.binding },
    5,
    4,
    replacement.coulsonAuthorizationRef,
    fixture.binding.bindingId,
    1,
  );
  fixture.entries.push(createProfileAwareRuntimeBindingSupersessionEntryV1({
    projection,
    trustedBindings: [fixture.coulson.binding],
    priorBindingId: fixture.binding.bindingId,
    priorBindingVersion: 1,
    binding: wrapper,
    authorization,
  }));
  projection = replay(fixture.entries);
  assert.equal(projection.execution, "running");
  assert.equal(projection.runtimeBindings.length, 2);
  assert.equal(projection.runtimeBindings[0].binding.lifecycleState, "superseded");
  assert.equal(projection.runtimeBindings[0].binding.activeThroughSequence, 4);
  assert.equal(projection.runtimeBindings[1].binding.lifecycleState, "active");
  assert.deepEqual(projection.activeRuntimeBindings, [projection.runtimeBindings[1]]);
  assert.equal(projection.activeRuntimeBindings[0].binding.reasoningRuntimeId, "runtime:may:replacement");
  assert.equal(projection.activeRuntimeBindings[0].modelId, fixture.implementationAuthority.payload.modelId);
  assert.equal(projection.activeRuntimeBindings[0].binding.toolExecutorId, "tool:executor:replacement");
});

test("runtime binding authorization ids cannot be reused across historical versions", () => {
  const fixture = boundRuntimeFixture();
  const replacement = schema9RuntimeBindingBase(fixture.current, 4, fixture.implementationAuthority.payload, {
    bindingVersion: 2,
    reasoningRuntimeId: "runtime:may:replacement",
    toolExecutorId: "tool:executor:replacement",
    coulsonAuthorizationRef: fixture.binding.coulsonAuthorizationRef,
  });
  const wrapper = schema9BindingEnvelope(fixture.current, fixture.implementationAuthority.payload, replacement, { modelId: fixture.implementationAuthority.payload.modelId });
  const authorization = schema9BindingAuthorization(
    fixture.current,
    replacement,
    wrapper,
    { ...fixture.coulson, ...fixture.coulson.binding },
    4,
    3,
    fixture.binding.coulsonAuthorizationRef,
    fixture.binding.bindingId,
    1,
  );
  assert.throws(() => createProfileAwareRuntimeBindingSupersessionEntryV1({
    projection: fixture.projection,
    trustedBindings: [fixture.coulson.binding],
    priorBindingId: fixture.binding.bindingId,
    priorBindingVersion: 1,
    binding: wrapper,
    authorization,
  }), /unique/i);
  const replayed = replayProfileAwareMissionJournal([...fixture.entries, {
    schemaVersion: 9,
    entryId: `entry:${fixture.current.missionId}:4`,
    missionId: fixture.current.missionId,
    sequence: 4,
    type: "runtime.binding_superseded",
    timestamp: authorization.payload.timestamp,
    payload: { priorBindingId: fixture.binding.bindingId, priorBindingVersion: 1, binding: wrapper, authorization },
  }]);
  assert.equal(replayed.state, "invalid");
  assert.match(replayed.errors.join(" "), /duplicated/i);
});

test("forged supersession signature precedes reused authorization id in constructor and replay", () => {
  const fixture = boundRuntimeFixture();
  const replacement = schema9RuntimeBindingBase(fixture.current, 4, fixture.implementationAuthority.payload, {
    bindingVersion: 2,
    reasoningRuntimeId: "runtime:may:replacement",
    toolExecutorId: "tool:executor:replacement",
    coulsonAuthorizationRef: fixture.binding.coulsonAuthorizationRef,
  });
  const wrapper = schema9BindingEnvelope(fixture.current, fixture.implementationAuthority.payload, replacement, {
    modelId: fixture.implementationAuthority.payload.modelId,
  });
  const authorization = schema9BindingAuthorization(
    fixture.current,
    replacement,
    wrapper,
    { ...fixture.coulson, ...fixture.coulson.binding },
    4,
    3,
    fixture.binding.coulsonAuthorizationRef,
    fixture.binding.bindingId,
    1,
  );
  const forged = { ...authorization, signatureBase64: "invalid-signature" };
  assert.throws(() => createProfileAwareRuntimeBindingSupersessionEntryV1({
    projection: fixture.projection,
    trustedBindings: [fixture.coulson.binding],
    priorBindingId: fixture.binding.bindingId,
    priorBindingVersion: 1,
    binding: wrapper,
    authorization: forged,
  }), /signature/i);
  const replayed = replayProfileAwareMissionJournal([...fixture.entries, {
    schemaVersion: 9,
    entryId: `entry:${fixture.current.missionId}:4`,
    missionId: fixture.current.missionId,
    sequence: 4,
    type: "runtime.binding_superseded",
    timestamp: authorization.payload.timestamp,
    payload: { priorBindingId: fixture.binding.bindingId, priorBindingVersion: 1, binding: wrapper, authorization: forged },
  }]);
  assert.equal(replayed.state, "invalid");
  assert.match(replayed.errors.join(" "), /signature/i);
  assert.doesNotMatch(replayed.errors.join(" "), /duplicated|unique/i);
});

test("initial runtime binding replay is rejected once execution is running", () => {
  const current = brief("standard");
  const coulson = authority("coulson");
  const entries = [createProfileAwareMissionBegunEntry(current, [coulson.binding])];
  let projection = replay(entries);
  const governance = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"), 1);
  entries.push({ schemaVersion: 9, entryId: `entry:${current.missionId}:1`, missionId: current.missionId, sequence: 1, type: "governance.decided", timestamp: governance.payload.timestamp, payload: { evidence: governance } });
  projection = replay(entries);
  const implementationAuthority = trustedAuthorityBinding(current, { ...coulson, ...coulson.binding }, 2);
  entries.push(createProfileAwareImplementationAuthorityEntryV1({ projection, trustedBindings: [coulson.binding], authority: implementationAuthority }));
  entries.push({ schemaVersion: 9, entryId: `entry:${current.missionId}:3`, missionId: current.missionId, sequence: 3, type: "execution.transition", timestamp: { value: "2026-07-29T15:03:00Z", provenance: "hostTrusted" }, payload: { from: "not-started", to: "running" } });
  const binding = schema9RuntimeBindingBase(current, 4, implementationAuthority.payload, { coulsonAuthorizationRef: "authorization:runtime-binding:late" });
  const wrapper = schema9BindingEnvelope(current, implementationAuthority.payload, binding);
  const authorization = schema9BindingAuthorization(current, binding, wrapper, { ...coulson, ...coulson.binding }, 4, 3, binding.coulsonAuthorizationRef);
  const result = replayProfileAwareMissionJournal([...entries, {
    schemaVersion: 9,
    entryId: `entry:${current.missionId}:4`,
    missionId: current.missionId,
    sequence: 4,
    type: "runtime.binding_recorded",
    timestamp: authorization.payload.timestamp,
    payload: { binding: wrapper, authorization },
  }]);
  assert.equal(result.state, "invalid");
  assert.match(result.errors.join(" "), /before execution starts/i);
});

test("runtime event malformed shape precedes revoked-authority state", () => {
  const fixture = boundRuntimeFixture();
  const revocation = trustedAuthorityRevocation(fixture.implementationAuthority, { ...fixture.coulson, ...fixture.coulson.binding }, 4, 3);
  fixture.entries.push(createProfileAwareImplementationAuthorityRevocationEntryV1({
    projection: fixture.projection,
    trustedBindings: [fixture.coulson.binding],
    revocation,
  }));
  const result = replayProfileAwareMissionJournal([...fixture.entries, {
    schemaVersion: 9,
    entryId: `entry:${fixture.current.missionId}:5`,
    missionId: fixture.current.missionId,
    sequence: 5,
    type: "runtime.binding_recorded",
    timestamp: { value: "2026-07-29T15:05:00Z", provenance: "humanRecorded" },
    payload: { binding: {} },
  }]);
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "malformed");
});

test("fully signed supersession cannot replace the authority-bound model", () => {
  const fixture = boundRuntimeFixture();
  const replacement = schema9RuntimeBindingBase(fixture.current, 4, fixture.implementationAuthority.payload, {
    bindingVersion: 2,
    reasoningRuntimeId: "runtime:may:replacement",
    toolExecutorId: "tool:executor:replacement",
    coulsonAuthorizationRef: "authorization:runtime-binding:model-mismatch",
  });
  const wrapper = schema9BindingEnvelope(fixture.current, fixture.implementationAuthority.payload, replacement, {
    modelId: "model:replacement",
  });
  const authorization = schema9BindingAuthorization(
    fixture.current,
    replacement,
    wrapper,
    { ...fixture.coulson, ...fixture.coulson.binding },
    4,
    3,
    replacement.coulsonAuthorizationRef,
    fixture.binding.bindingId,
    1,
  );
  const result = replayProfileAwareMissionJournal([...fixture.entries, {
    schemaVersion: 9,
    entryId: `entry:${fixture.current.missionId}:4`,
    missionId: fixture.current.missionId,
    sequence: 4,
    type: "runtime.binding_superseded",
    timestamp: authorization.payload.timestamp,
    payload: { priorBindingId: fixture.binding.bindingId, priorBindingVersion: 1, binding: wrapper, authorization },
  }]);
  assert.equal(result.state, "invalid");
  assert.match(result.errors.join(" "), /modelId/);
});

test("malformed binding authorization precedes absent implementation authority", () => {
  const current = brief("standard");
  const coulson = authority("coulson");
  const begun = createProfileAwareMissionBegunEntry(current, [coulson.binding]);
  const absentAuthority = trustedAuthorityBinding(current, { ...coulson, ...coulson.binding }, 1).payload;
  const binding = schema9RuntimeBindingBase(current, 1, absentAuthority);
  const wrapper = schema9BindingEnvelope(current, absentAuthority, binding);
  const result = replayProfileAwareMissionJournal([begun, {
    schemaVersion: 9,
    entryId: `entry:${current.missionId}:1`,
    missionId: current.missionId,
    sequence: 1,
    type: "runtime.binding_recorded",
    timestamp: { value: "2026-07-29T15:01:00Z", provenance: "humanRecorded" },
    payload: { binding: wrapper, authorization: { payload: {}, signatureBase64: "invalid-signature" } },
  }]);
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "malformed");
});

function publicationResultCandidate(fixture, overrides = {}) {
  const scope = evaluateReviewPublicationV1(fixture.authority, {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    missionId: fixture.authority.missionId,
    subjectId: fixture.authority.subjectId,
    missionRevisionId: fixture.authority.missionRevisionId,
    repositoryId: fixture.authority.repositoryId,
    canonicalRepositoryRoot: fixture.authority.canonicalRepositoryRoot,
    branch: fixture.authority.branch,
    baseRevisionId: fixture.authority.baseRevisionId,
    headRevisionId: fixture.authority.headRevisionId,
    proposedChangedPaths: fixture.authority.authorizedPaths,
    observedChangedPaths: fixture.authority.authorizedPaths,
    requestedEffects: fixture.request.requestedEffects,
    observedSymlinkPaths: [],
    observedGitlinkPaths: [],
    workspaceClean: true,
  });
  assert.equal(scope.state, "allowed");
  return {
    adapterContractVersion: 2,
    adapterId: "github",
    candidateKind: "communication_result",
    candidateId: "candidate:schema9:publication:4",
    missionId: fixture.request.missionId,
    subjectId: fixture.request.subjectId,
    revisionId: fixture.request.revisionId,
    humanPrincipalId: null,
    bindingId: null,
    sourceRef: "github:publication:readback",
    capturedAt: { value: "2026-07-29T10:04:00Z", provenance: "hostTrusted" },
    payload: {
      requestId: fixture.requestId,
      outcome: "delivered",
      failureReason: null,
      receiptRef: "github:publication:receipt:4",
      operation: fixture.request.operation,
      targetRef: fixture.request.targetRef,
      scopeDigest: scope.scopeDigest,
      publicationBinding: scope.binding,
    },
    ...overrides,
  };
}

test("schema-9 publication authorization, request, and trusted result replay identically after restart", () => {
  const fixture = publicationJournalFixture({ schemaVersion: 9 });
  const queued = replay(fixture.entries);
  assert.equal(queued.communication.state, "queued");
  assert.equal(queued.publicationAuthorizations.length, 1);
  assert.equal(queued.communication.requests[0].requestId, fixture.requestId);
  assert.equal(queued.implementationAuthority, null);
  assert.equal(queued.execution, "not-started");
  assert.equal(queued.readiness.execute, "ready");
  assert.equal(queued.finalAcceptance, "waiting");

  const resultEntry = createProfileAwareCommunicationResultEntryV1({
    projection: queued,
    candidate: publicationResultCandidate(fixture),
  });
  const terminalEntries = [...fixture.entries, resultEntry];
  const terminal = replay(terminalEntries);
  assert.equal(terminal.communication.state, "delivered");
  assert.equal(terminal.communication.requests[0].candidateId, "candidate:schema9:publication:4");
  assert.deepEqual(replayProfileAwareMissionJournal(structuredClone(terminalEntries)), replayProfileAwareMissionJournal(terminalEntries));
  assert.equal(terminal.implementationAuthority, null);
  assert.equal(terminal.execution, "not-started");
  assert.equal(terminal.readiness.execute, "ready");
  assert.equal(terminal.finalAcceptance, "waiting");

  terminal.publicationAuthorizations[0].authority.authorizedPaths[0] = "changed.md";
  terminal.communication.requests[0].requestedEffects[0] = "review.branch.push";
  const restarted = replay(terminalEntries);
  assert.deepEqual(restarted.publicationAuthorizations[0].authority.authorizedPaths, fixture.authority.authorizedPaths);
  assert.deepEqual(restarted.communication.requests[0].requestedEffects, fixture.request.requestedEffects);
});

test("schema-9 publication replay rejects signed-envelope, scope, sequence, duplicate, and lifecycle drift", () => {
  const fixture = publicationJournalFixture({ schemaVersion: 9 });
  const authorizationIndex = 2;
  const requestIndex = 3;
  const invalidJournals = [];

  const forged = structuredClone(fixture.entries);
  forged[authorizationIndex].payload.authorization.signatureBase64 = "forged";
  invalidJournals.push(forged);

  for (const mutation of [
    { authorityDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
    { missionId: "mission:wrong" },
    { subjectId: "issue:wrong" },
    { missionRevisionId: "sha256:wrong_revision" },
    { artifactRevisionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    { previousJournalSequence: 0, journalSequence: 1 },
  ]) {
    const changed = structuredClone(fixture.entries);
    const payload = { ...changed[authorizationIndex].payload.authorization.payload, ...mutation };
    changed[authorizationIndex].payload.authorization = fixture.signAuthorizationPayload(payload);
    invalidJournals.push(changed);
  }

  for (const mutation of [
    { artifactRevisionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    { proposedChangedPaths: ["docs/other.md"] },
    { requestedEffects: ["review.branch.push"] },
    { revisionId: "sha256:stale_revision" },
  ]) {
    const changed = structuredClone(fixture.entries);
    Object.assign(changed[requestIndex].payload.request, mutation);
    invalidJournals.push(changed);
  }

  const unknownField = structuredClone(fixture.entries);
  unknownField[requestIndex].payload.unexpected = true;
  invalidJournals.push(unknownField);
  invalidJournals.push([...structuredClone(fixture.entries), structuredClone(fixture.entries[requestIndex])]);

  for (const entries of invalidJournals) {
    assert.equal(replayProfileAwareMissionJournal(entries).state, "invalid");
  }

  const queued = replay(fixture.entries);
  const candidate = publicationResultCandidate(fixture);
  for (const mutate of [
    (value) => { value.payload.publicationBinding.canonicalRepositoryRoot = "/workspace/other"; },
    (value) => { value.payload.publicationBinding.branch = "other/branch"; },
    (value) => { value.payload.publicationBinding.headRevisionId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; },
    (value) => { value.payload.operation = "publish_status"; },
    (value) => { value.payload.targetRef = "github:issue:wrong"; },
    (value) => { value.payload.requestId = "request:missing"; },
    (value) => { value.payload.scopeDigest = "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; },
    (value) => { value.candidateId = "candidate:schema9:changed"; value.payload.publicationBinding.requestedEffects = ["review.branch.push"]; },
  ]) {
    const changed = structuredClone(candidate);
    mutate(changed);
    assert.throws(() => createProfileAwareCommunicationResultEntryV1({ projection: queued, candidate: changed }));
  }

  const resultEntry = createProfileAwareCommunicationResultEntryV1({ projection: queued, candidate });
  const terminal = replay([...fixture.entries, resultEntry]);
  assert.throws(() => createProfileAwareCommunicationResultEntryV1({ projection: terminal, candidate }));
  assert.equal(replayProfileAwareMissionJournal([...fixture.entries, resultEntry, { ...resultEntry, sequence: 5, entryId: `entry:${fixture.request.missionId}:5` }]).state, "invalid");

  const late = structuredClone(fixture.entries.slice(0, 2));
  late.push({
    schemaVersion: 9,
    entryId: `entry:${fixture.request.missionId}:2`,
    missionId: fixture.request.missionId,
    sequence: 2,
    type: "execution.transition",
    timestamp: { value: "2026-07-29T10:02:00Z", provenance: "hostTrusted" },
    payload: { from: "not-started", to: "running" },
  });
  const lateAuthorization = structuredClone(fixture.entries[authorizationIndex]);
  lateAuthorization.sequence = 3;
  lateAuthorization.entryId = `entry:${fixture.request.missionId}:3`;
  lateAuthorization.payload.authorization.payload.previousJournalSequence = 2;
  lateAuthorization.payload.authorization.payload.journalSequence = 3;
  lateAuthorization.payload.authorization = fixture.signAuthorizationPayload(lateAuthorization.payload.authorization.payload);
  lateAuthorization.timestamp = lateAuthorization.payload.authorization.payload.timestamp;
  assert.equal(replayProfileAwareMissionJournal([...late, lateAuthorization]).state, "invalid");

  assert.equal(computeReviewPublicationAuthorityDigest(fixture.authority), fixture.authorization.payload.authorityDigest);
});
