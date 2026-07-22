import assert from "node:assert/strict";
import test from "node:test";

import {
  PIPELINE_MODE_IDS,
  PIPELINE_PROFILE_CONTRACT_VERSION,
  PIPELINE_PROFILE_SCHEMA_VERSION,
  selectPipelineModesV1,
} from "../dist/pipeline-profile-v1.mjs";

const head = "0123456789012345678901234567890123456789";

function command(commandId, executable, args) {
  return { commandId, executable, args };
}

function binding(modeId, overrides = {}) {
  return {
    modeId,
    evidenceKind: "package-script",
    evidenceRef: `package:script:${modeId}`,
    command: command(`command:${modeId}`, "npm", ["run", modeId]),
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    schemaVersion: 1,
    contractVersion: "pipeline.profile.v1",
    profileId: "pipeline:profile:fixture",
    repository: "RanSolo/shield-workspace",
    artifactRevisionId: head,
    discoveredAt: "2026-07-22T03:00:00Z",
    supported: [
      binding("lint"),
      binding("typecheck"),
      binding("unit-test", { evidenceKind: "nx-target", evidenceRef: "nx:target:test", command: command("command:test", "nx", ["test", "@shield/team-system"]) }),
      binding("build"),
      binding("sonarqube", { evidenceKind: "sonarqube-config", evidenceRef: "sonarqube:project", command: null }),
      binding("e2e"),
      binding("migration-validation"),
    ],
    defaultModes: ["lint", "typecheck", "unit-test"],
    conditional: [
      { trigger: "database-change", modes: ["migration-validation"], evidenceRef: "pipeline:conditional:database" },
      { trigger: "user-flow-change", modes: ["e2e"], evidenceRef: "pipeline:conditional:user-flow" },
      { trigger: "security-sensitive-change", modes: ["sonarqube"], evidenceRef: "pipeline:conditional:security" },
    ],
    unavailable: [
      { modeId: "package-audit", reason: "missing-command", evidenceRef: "package:scripts:no-audit" },
      { modeId: "security-scan", reason: "not-discovered", evidenceRef: "pipeline:security:not-discovered" },
    ],
    staleWhenChanged: [
      "package.json",
      "nx.json",
      ".github/workflows",
      "sonar-project.properties",
      "AGENTS.md",
    ],
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    schemaVersion: 1,
    missionId: "mission:fixture",
    subjectId: "issue:75",
    repository: "RanSolo/shield-workspace",
    artifactRevisionId: head,
    changedFiles: ["packages/shield-team-system/src/mission.mts"],
    riskTriggers: [],
    requestedModes: [],
    additionalModeRequests: [],
    ...overrides,
  };
}

test("pipeline modes are a closed validation taxonomy separate from mission modes", () => {
  assert.equal(PIPELINE_PROFILE_SCHEMA_VERSION, 1);
  assert.equal(PIPELINE_PROFILE_CONTRACT_VERSION, "pipeline.profile.v1");
  assert.deepEqual(PIPELINE_MODE_IDS, [
    "lint",
    "typecheck",
    "unit-test",
    "integration-test",
    "e2e",
    "build",
    "sonarqube",
    "package-audit",
    "migration-validation",
    "security-scan",
    "full-pipeline",
  ]);
  const result = selectPipelineModesV1(profile(), request());
  assert.equal(result.state, "selected");
  assert.equal(result.missionModeBoundary, "mission_modes_govern_workflow_pipeline_modes_govern_validation_lanes");
  assert.equal(result.interimOwnership, "hill_selects_may_runs_implementation_coupled_checks_hill_verifies");
  assert.equal(result.futureMackOwnership, "mack_executes_and_interprets_validation_without_implementation_or_authority");
});

test("Hill selects default and conditional pipeline modes from repository evidence and risk", () => {
  const result = selectPipelineModesV1(profile(), request({
    riskTriggers: ["database-change", "security-sensitive-change"],
  }));
  assert.equal(result.state, "selected");
  assert.equal(result.selectionEligibility, "eligible");
  assert.deepEqual(result.selectedModes.map((mode) => mode.modeId), [
    "lint",
    "typecheck",
    "unit-test",
    "migration-validation",
    "sonarqube",
  ]);
  assert.equal(result.selectedModes.find((mode) => mode.modeId === "sonarqube").command, null);
  assert.deepEqual(result.unavailableModes, []);
});

test("unsupported requested modes are reported unavailable rather than fabricated", () => {
  const result = selectPipelineModesV1(profile(), request({ requestedModes: ["package-audit"] }));
  assert.equal(result.state, "selected");
  assert.equal(result.selectionEligibility, "ineligible");
  assert.deepEqual(result.reasonCodes, ["UNSUPPORTED_REQUIRED_MODE"]);
  assert.deepEqual(result.unavailableModes, [
    { modeId: "package-audit", reason: "missing-command", evidenceRef: "package:scripts:no-audit" },
  ]);
  assert.equal(result.selectedModes.some((mode) => mode.modeId === "package-audit"), false);
});

test("profile revision mismatches and pipeline-relevant changes fail closed as stale", () => {
  assert.deepEqual(selectPipelineModesV1(profile(), request({
    artifactRevisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  })), {
    state: "invalid",
    schemaVersion: 1,
    authority: "non_authoritative",
    selectionEligibility: "ineligible",
    reasonCodes: ["PROFILE_BINDING_MISMATCH"],
  });

  const stale = selectPipelineModesV1(profile(), request({
    changedFiles: [".github/workflows/ci.yml"],
  }));
  assert.equal(stale.state, "selected");
  assert.equal(stale.selectionEligibility, "ineligible");
  assert.deepEqual(stale.reasonCodes, ["PROFILE_STALE"]);
});

test("Mack or Hill can request an extra mode only when it stays in mission scope", () => {
  const inScope = selectPipelineModesV1(profile(), request({
    additionalModeRequests: [{
      requestedBySeatId: "mack",
      modeId: "build",
      rationale: "Changed packaging path requires build validation.",
      withinMissionScope: true,
    }],
  }));
  assert.equal(inScope.selectionEligibility, "eligible");
  assert.ok(inScope.selectedModes.some((mode) => mode.modeId === "build"));

  const outOfScope = selectPipelineModesV1(profile(), request({
    additionalModeRequests: [{
      requestedBySeatId: "mack",
      modeId: "build",
      rationale: "New risk appears outside the approved Mission Brief.",
      withinMissionScope: false,
    }],
  }));
  assert.equal(outOfScope.selectionEligibility, "ineligible");
  assert.deepEqual(outOfScope.reasonCodes, ["SCOPE_REVIEW_REQUIRED"]);
});

test("malformed profiles fail closed without invoking inherited data", () => {
  const inherited = Object.create(profile());
  assert.deepEqual(selectPipelineModesV1(inherited, request()), {
    state: "invalid",
    schemaVersion: 1,
    authority: "non_authoritative",
    selectionEligibility: "ineligible",
    reasonCodes: ["INVALID_PROFILE"],
  });
  assert.equal(selectPipelineModesV1(profile({
    supported: [binding("package-audit", { command: null })],
  }), request()).state, "invalid");
});

