import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  replaySupervisedMissionJournal,
} from "../dist/mission-v2.mjs";
import {
  createProfileAwareExecutionEffectEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  createProfileRequirementsV1,
  MISSION_130_JOURNAL_DIGEST,
  replayProfileAwareMissionJournal,
  validateProfileAwareMissionBrief,
} from "../dist/profile-aware-mission-v1.mjs";

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

function replay(entries) {
  const result = replayProfileAwareMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
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

test("standard, high-assurance, and product-sensitive readiness use only frozen gates", () => {
  for (const [profileId, expected] of [["standard", ["coulson", "final_acceptance"]], ["high_assurance", ["coulson", "fitz", "final_acceptance"]], ["product_sensitive", ["coulson", "simmons", "final_acceptance"]]]) {
    const current = brief(profileId);
    assert.deepEqual(createProfileRequirementsV1(current).map(({ requiredRoleId, evidenceKind }) => requiredRoleId === "coulson" && evidenceKind === "final_acceptance" ? "final_acceptance" : requiredRoleId), expected);
    assert.equal(replay([createProfileAwareMissionBegunEntry(current, [authority("coulson").binding])]).readiness.execute, "waiting");
  }
});

test("Coulson authorization is distinct from final acceptance and ordering is replayed", () => {
  const current = brief("standard");
  const coulson = authority("coulson");
  const entries = [createProfileAwareMissionBegunEntry(current, [coulson.binding])];
  let projection = replay(entries);
  const authorization = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"), 1);
  entries.push({ schemaVersion: 9, entryId: `${current.missionId}:1`, missionId: current.missionId, sequence: 1, type: "governance.decided", timestamp: authorization.payload.timestamp, payload: { evidence: authorization } });
  projection = replay(entries);
  assert.equal(projection.authorization, "authorized");
  const premature = { schemaVersion: 9, entryId: `${current.missionId}:2`, missionId: current.missionId, sequence: 2, type: "final_acceptance.recorded", timestamp: { value: "2026-07-29T15:02:00Z", provenance: "humanRecorded" }, payload: { evidence: evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "final_acceptance"), 2) } };
  assert.equal(replayProfileAwareMissionJournal([...entries, premature]).state, "invalid");
  entries.push({ schemaVersion: 9, entryId: `${current.missionId}:2`, missionId: current.missionId, sequence: 2, type: "execution.transition", timestamp: { value: "2026-07-29T15:02:00Z", provenance: "hostTrusted" }, payload: { from: "not-started", to: "running" } });
  entries.push({ schemaVersion: 9, entryId: `${current.missionId}:3`, missionId: current.missionId, sequence: 3, type: "execution.transition", timestamp: { value: "2026-07-29T15:03:00Z", provenance: "hostTrusted" }, payload: { from: "running", to: "completed" } });
  projection = replay(entries);
  const accepted = evidence(coulson, projection, projection.requirements.find(({ evidenceKind }) => evidenceKind === "final_acceptance"), 4);
  entries.push({ schemaVersion: 9, entryId: `${current.missionId}:4`, missionId: current.missionId, sequence: 4, type: "final_acceptance.recorded", timestamp: accepted.payload.timestamp, payload: { evidence: accepted } });
  assert.equal(replay(entries).finalAcceptance, "accepted");
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
  assert.equal(replayProfileAwareMissionJournal(entries).state, "valid");
  assert.equal(validateProfileAwareMissionBrief({ ...current, requiredExecutionGateRoleIds: ["coulson"], revisionId: current.revisionId }).state, "invalid");
});

test("Mission #130 predecessor digest and bytes remain unchanged", async () => {
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile(resolve(process.cwd(), "../../.shield/journals/bWlzc2lvbjppc3N1ZS0xMzA.jsonl"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), predecessorDigest.slice("sha256:".length));
  assert.ok(bytes.length > 0);
  const legacyReplay = replaySupervisedMissionJournal(bytes.toString("utf8").trimEnd().split("\n").map((line) => JSON.parse(line)));
  assert.equal(legacyReplay.state, "valid", legacyReplay.errors?.join(" "));
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
