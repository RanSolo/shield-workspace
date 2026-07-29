import assert from "node:assert/strict";
import test from "node:test";

import { createShieldConfig } from "../dist/config.mjs";
import {
  MISSION_INTAKE_CONTRACT_VERSION,
  MISSION_INTAKE_MAX_ARTIFACT_PATH_LENGTH,
  MISSION_INTAKE_MAX_OBJECTIVE_LENGTH,
  missionIntakeV1,
} from "../dist/mission-intake-v1.mjs";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const BASE = "89abcdef0123456789abcdef0123456789abcdef";
const OBSERVED_AT = "2026-07-29T14:10:00Z";
const ISSUE_ID = "github:RanSolo/shield-workspace/issue/130";

function config() {
  return createShieldConfig({
    repositoryId: "RanSolo/shield-workspace",
    coulsonBindingRef: "binding:coulson",
    fitzBindingRef: "binding:fitz",
  });
}

function request({
  configSource = "bootstrap_input",
  headRevision = HEAD,
  objective = "Implement and dogfood missionIntakeV1 at the approved scope.",
} = {}) {
  const configObservation = configSource === "repository_file"
    ? {
      source: "repository_file",
      observationState: "observed",
      assuranceKind: "host_asserted",
      observedAt: OBSERVED_AT,
      sourceRef: ".shield/config.json",
      repositoryRevision: headRevision,
      config: config(),
    }
    : {
      source: "bootstrap_input",
      observationState: "provided_not_repository_observed",
      assuranceKind: "human_recorded",
      observedAt: OBSERVED_AT,
      sourceRef: "session:issue-130-bootstrap",
      config: config(),
    };
  return {
    schemaVersion: 1,
    contractVersion: "mission.intake.v1",
    configObservation,
    repositoryObservation: {
      assuranceKind: "host_asserted",
      repositoryId: "RanSolo/shield-workspace",
      branch: "codex/issue-130-canonical-mission-runtime",
      baseRevision: BASE,
      headRevision,
      observedAt: OBSERVED_AT,
      sourceRef: "git:working-tree",
    },
    issueObservation: {
      assuranceKind: "host_asserted",
      issueId: ISSUE_ID,
      issueRevisionId: "issue-comment:5118852576",
      observedAt: OBSERVED_AT,
      sourceRef: "https://github.com/RanSolo/shield-workspace/issues/130",
    },
    proposedBrief: {
      missionId: "mission:issue-130",
      objective,
      subjectId: ISSUE_ID,
      riskFlags: {
        production: false,
        destructive: false,
        migration: false,
        credentialsOrSecurity: false,
        externalCommunication: false,
        merge: false,
        deploy: false,
        release: false,
        hillHighRisk: true,
      },
      participantSeatIds: [
        "hill",
        "daisy",
        "fury",
        "may",
        "coulson",
        "fitz",
      ],
      requireSimmons: false,
      createdAt: {
        value: "2026-07-29T13:46:50Z",
        provenance: "humanRecorded",
      },
    },
    recommendedModes: [{
      modeId: "delivery",
      seatId: "hill",
      reason: "Coordinate the bounded implementation and evidence.",
      source: "hill_recommended",
    }],
    artifacts: {
      missionBrief: {
        path: "docs/missions/issue-130-canonical-mission-runtime.md",
        repositoryRevision: headRevision,
        verification: "content_unverified",
      },
      missionCommunication: {
        path: "docs/missions/issue-130-agent-handoff.md",
        repositoryRevision: headRevision,
        verification: "content_unverified",
      },
      sharedRuntimeInstructions: {
        path: "docs/missions/issue-130-shared-runtime-instructions.md",
        repositoryRevision: headRevision,
        verification: "content_unverified",
      },
    },
    runtimeObservations: [
      {
        seatId: "may",
        status: "human_reported_unverified",
        observedAt: "2026-07-28T23:59:00Z",
        runtimeId: null,
        evidenceRefs: [],
      },
      {
        seatId: "daisy",
        status: "human_reported_unverified",
        observedAt: "2026-07-28T23:59:00Z",
        runtimeId: null,
        evidenceRefs: [],
      },
    ],
  };
}

test("constructs a deterministic non-authoritative Issue #130 intake candidate", () => {
  const first = missionIntakeV1(request());
  const second = missionIntakeV1(structuredClone(request()));

  assert.deepEqual(first, second);
  assert.equal(first.state, "candidate");
  assert.equal(first.contractVersion, MISSION_INTAKE_CONTRACT_VERSION);
  assert.equal(first.authority, "non_authoritative");
  assert.equal(first.persistence, "not_persisted");
  assert.equal(first.brief.activatedModes.length, 0);
  assert.equal(first.risk.level, "high");
  assert.equal(first.risk.requiresExplicitApproval, true);
  assert.deepEqual(first.blockers, [{
    code: "REPOSITORY_CONFIG_NOT_OBSERVED",
    path: "configObservation",
  }]);
  assert.equal(first.nextAction, "provision_repository");
  assert.deepEqual(
    first.pendingHumanGates.map(({ seatId }) => seatId),
    ["coulson", "fitz"],
  );
  assert.deepEqual(
    first.participants.filter(({ kind }) => kind === "human_gate").map(({ seatId }) => seatId),
    ["coulson", "fitz"],
  );
  assert.ok(first.participants.every(({ seatId }) => seatId !== "mack"));
  assert.ok(first.runtimeObservations.every(
    ({ status }) => status === "human_reported_unverified",
  ));
});

test("repository-observed config bound to HEAD advances only to journal initialization", () => {
  const result = missionIntakeV1(request({ configSource: "repository_file" }));
  assert.equal(result.state, "candidate");
  assert.deepEqual(result.blockers, []);
  assert.equal(result.nextAction, "initialize_journal");
  assert.equal(result.communication.journal, "journal_not_initialized");
});

test("missing repository config stops at provisioning", () => {
  const input = request();
  input.configObservation = {
    source: "repository_file",
    observationState: "missing",
    assuranceKind: "host_asserted",
    observedAt: OBSERVED_AT,
    sourceRef: ".shield/config.json",
    repositoryRevision: HEAD,
  };
  const result = missionIntakeV1(input);
  assert.deepEqual(result.reasonCodes, ["REPOSITORY_CONFIG_NOT_OBSERVED"]);
  assert.equal(result.nextAction, "provision_repository");
});

test("stale repository configuration fails its HEAD binding", () => {
  const input = request({ configSource: "repository_file" });
  input.configObservation.repositoryRevision = BASE;
  const result = missionIntakeV1(input);
  assert.deepEqual(result.reasonCodes, ["REPOSITORY_BINDING_MISMATCH"]);
  assert.deepEqual(result.fieldPaths, ["configObservation.repositoryRevision"]);
});

test("malformed risk flags fail as brief input before risk classification", () => {
  const input = request();
  delete input.proposedBrief.riskFlags.deploy;
  const result = missionIntakeV1(input);
  assert.deepEqual(result.reasonCodes, ["INVALID_BRIEF_INPUT"]);
  assert.deepEqual(result.fieldPaths, ["proposedBrief"]);
});

test("recommended modes never activate the supervised brief", () => {
  const result = missionIntakeV1(request());
  assert.equal(result.state, "candidate");
  assert.equal(result.recommendedModes[0].modeId, "delivery");
  assert.deepEqual(result.brief.activatedModes, []);
  assert.equal(result.modeActivationState, "unsupported_after_approval");
});

test("subject and artifact references must bind to observed issue and HEAD", () => {
  const wrongSubject = request();
  wrongSubject.proposedBrief.subjectId = "github:RanSolo/shield-workspace/issue/99";
  assert.deepEqual(
    missionIntakeV1(wrongSubject).reasonCodes,
    ["INVALID_BRIEF_INPUT"],
  );

  const staleArtifact = request();
  staleArtifact.artifacts.missionBrief.repositoryRevision = BASE;
  assert.deepEqual(
    missionIntakeV1(staleArtifact).reasonCodes,
    ["INVALID_ARTIFACT_REFERENCE"],
  );
});

test("fails closed for inherited, accessor-backed, proxy, and sparse input", () => {
  const inherited = Object.create({ hidden: true });
  Object.assign(inherited, request());
  assert.deepEqual(missionIntakeV1(inherited).reasonCodes, ["INVALID_REQUEST"]);

  const accessor = request();
  Object.defineProperty(accessor, "recommendedModes", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.deepEqual(missionIntakeV1(accessor).reasonCodes, ["INVALID_REQUEST"]);

  const proxy = new Proxy(request(), {});
  assert.deepEqual(missionIntakeV1(proxy).reasonCodes, ["INVALID_REQUEST"]);

  const sparse = request();
  sparse.runtimeObservations = new Array(1);
  assert.deepEqual(missionIntakeV1(sparse).reasonCodes, ["INVALID_REQUEST"]);
});

test("enforces effective objective and artifact path boundaries", () => {
  const maximumObjective = request({
    objective: "x".repeat(MISSION_INTAKE_MAX_OBJECTIVE_LENGTH),
  });
  assert.equal(missionIntakeV1(maximumObjective).state, "candidate");

  const oversizedObjective = request({
    objective: "x".repeat(MISSION_INTAKE_MAX_OBJECTIVE_LENGTH + 1),
  });
  assert.deepEqual(
    missionIntakeV1(oversizedObjective).reasonCodes,
    ["INVALID_BRIEF_INPUT"],
  );

  const maximumPath = request();
  maximumPath.artifacts.missionBrief.path =
    `a/${"b".repeat(MISSION_INTAKE_MAX_ARTIFACT_PATH_LENGTH - 2)}`;
  assert.equal(missionIntakeV1(maximumPath).state, "candidate");

  for (const path of [
    `a/${"b".repeat(MISSION_INTAKE_MAX_ARTIFACT_PATH_LENGTH - 1)}`,
    "/absolute",
    "a\\b",
    "a%2Fb",
    "a//b",
    "a/./b",
    "a/../b",
    "a/\u0000/b",
  ]) {
    const invalid = request();
    invalid.artifacts.missionBrief.path = path;
    assert.deepEqual(
      missionIntakeV1(invalid).reasonCodes,
      ["INVALID_ARTIFACT_REFERENCE"],
      path,
    );
  }
});

test("rejects unknown fields and unsupported participant or mode routing", () => {
  assert.deepEqual(
    missionIntakeV1({ ...request(), unexpected: true }).reasonCodes,
    ["INVALID_REQUEST"],
  );

  const disabledSeatParticipantMack = request();
  disabledSeatParticipantMack.proposedBrief.participantSeatIds.push("mack");
  assert.deepEqual(
    missionIntakeV1(disabledSeatParticipantMack).reasonCodes,
    ["UNSUPPORTED_PARTICIPANT"],
  );

  const disabledSeatParticipantOracle = request();
  disabledSeatParticipantOracle.proposedBrief.participantSeatIds.push("oracle");
  assert.deepEqual(
    missionIntakeV1(disabledSeatParticipantOracle).reasonCodes,
    ["UNSUPPORTED_PARTICIPANT"],
  );

  const unsupportedParticipant = request();
  unsupportedParticipant.proposedBrief.participantSeatIds.push("x");
  assert.deepEqual(
    missionIntakeV1(unsupportedParticipant).reasonCodes,
    ["UNSUPPORTED_PARTICIPANT"],
  );

  const unsupportedMode = request();
  unsupportedMode.recommendedModes[0].modeId = "qa";
  assert.deepEqual(
    missionIntakeV1(unsupportedMode).reasonCodes,
    ["INVALID_MODE_RECOMMENDATION"],
  );

  const humanGateRecommendation = request();
  humanGateRecommendation.recommendedModes[0].seatId = "coulson";
  assert.deepEqual(
    missionIntakeV1(humanGateRecommendation).reasonCodes,
    ["INVALID_MODE_RECOMMENDATION"],
  );

  const unknownRoleRecommendation = request();
  unknownRoleRecommendation.recommendedModes[0].seatId = "x";
  assert.deepEqual(
    missionIntakeV1(unknownRoleRecommendation).reasonCodes,
    ["INVALID_MODE_RECOMMENDATION"],
  );

});
