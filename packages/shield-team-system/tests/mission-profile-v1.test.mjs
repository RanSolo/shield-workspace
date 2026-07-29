import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_MISSION_ROLE_REGISTRY_V1,
  MISSION_PROFILES_V1,
  freezeMissionRequirementsV1,
  getMissionProfileV1,
  isProfileAtLeastAsStrictV1,
  validateMissionProfileV1,
} from "../dist/mission-profile-v1.mjs";

const predecessorJournalDigest = "sha256:7f1f8c50a703cf43e1c477d88446473c5d1d755b99a4ad35a2b6662558ded7b9";

test("v1 exposes three closed profiles and a canonical role registry", () => {
  assert.deepEqual(MISSION_PROFILES_V1.map(({ profileId }) => profileId), ["standard", "high_assurance", "product_sensitive"]);
  assert.deepEqual(CANONICAL_MISSION_ROLE_REGISTRY_V1.map(({ roleId, seatId }) => [roleId, seatId]), [["coulson", "coulson"], ["fitz", "fitz"], ["simmons", "simmons"]]);
  assert.deepEqual(getMissionProfileV1("standard").requiredExecutionGateRoleIds, ["coulson"]);
  assert.deepEqual(getMissionProfileV1("high_assurance").requiredExecutionGateRoleIds, ["coulson", "fitz"]);
  assert.deepEqual(getMissionProfileV1("product_sensitive").requiredExecutionGateRoleIds, ["coulson", "simmons"]);
});

test("Coulson authorization and final acceptance are distinct required acts", () => {
  const frozen = freezeMissionRequirementsV1({ missionId: "mission:profile-v1", missionRevisionId: "sha256:revision", profileId: "standard", authorizationRoleId: "coulson", predecessorMissionId: "mission:issue-130", predecessorJournalSchemaVersion: 2, predecessorJournalDigest });
  assert.deepEqual(frozen.executionGates, [{ requiredRoleId: "coulson", status: "required" }]);
  assert.deepEqual(frozen.authorization, { requiredRoleId: "coulson", status: "required" });
  assert.deepEqual(frozen.finalAcceptance, { requiredRoleId: "coulson", status: "required" });
  assert.equal(frozen.frozenBeforeAuthorization, true);
  assert.equal(frozen.predecessorEvidence[0].journalDigest, predecessorJournalDigest);
  assert.notEqual(frozen.authorization, frozen.finalAcceptance);
});

test("profiles are closed and cannot weaken a frozen requirement", () => {
  assert.equal(validateMissionProfileV1({ ...getMissionProfileV1("standard"), requiredExecutionGateRoleIds: [] }).state, "invalid");
  assert.equal(isProfileAtLeastAsStrictV1("high_assurance", "standard"), true);
  assert.equal(isProfileAtLeastAsStrictV1("standard", "high_assurance"), false);
  assert.throws(() => freezeMissionRequirementsV1({ missionId: "mission:profile-v1", missionRevisionId: "sha256:revision", profileId: "standard", authorizationRoleId: "fitz", predecessorMissionId: "mission:issue-130", predecessorJournalSchemaVersion: 2, predecessorJournalDigest }), /Only Coulson/);
});
