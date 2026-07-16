import assert from "node:assert/strict";
import test from "node:test";

import {
  generatePRBody,
  isSafeGitHubContent,
  validateMissionWorkspaceInput,
} from "../contracts/workspace-contract.mjs";

function validInput() {
  return {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug: "agent/issue-3-pr-mission-workspace-mvp",
    missionBriefPath: "docs/missions/issue-3-pr-mission-workspace-mvp.md",
    prTitle: "feat: open a mission PR workspace",
    missionObjective: "Create the draft PR before specialist implementation.",
    coulsonApprovalSource: "Phil Coulson — Wheels up!",
    coulsonApprovedAt: "2026-07-15T01:00:00Z",
    riskFlags: {
      production: false,
      destructive: false,
      migration: false,
      credentialsOrSecurity: false,
      externalCommunication: true,
      merge: false,
      deploy: false,
      release: false,
      hillHighRisk: true,
    },
    participants: ["Maria Hill", "Daisy Johnson", "Nick Fury", "Melinda May"],
    activatedModes: ["Delivery Mode"],
    pendingDecisions: ["Coulson merge decision"],
    validationStatus: "Focused tests pending.",
  };
}

test("valid input produces a normalized immutable workspace plan", () => {
  const result = validateMissionWorkspaceInput(validInput());
  assert.equal(result.state, "valid");
  assert.equal(result.plan.repositoryOwner, "RanSolo");
  assert.equal(result.plan.risk.level, "high");
  assert.equal(Object.isFrozen(result.plan), true);
  assert.equal(Object.isFrozen(result.plan.riskFlags), true);
});

test("workspace input fails closed on unknown, inherited, and malformed data", () => {
  const missingFlag = validInput();
  delete missingFlag.riskFlags.merge;

  const inherited = Object.create(validInput());
  const candidates = [
    null,
    [],
    inherited,
    { ...validInput(), surprise: true },
    { ...validInput(), repositoryOwner: "bad owner" },
    { ...validInput(), branchSlug: "../main" },
    { ...validInput(), missionBriefPath: "../private.txt" },
    { ...validInput(), participants: ["May", 42] },
    missingFlag,
  ];

  for (const candidate of candidates) {
    const result = validateMissionWorkspaceInput(candidate);
    assert.equal(result.state, "invalid");
    assert.ok(result.errors.length > 0);
  }
});

test("GitHub content guard covers all caller-provided communication", () => {
  assert.deepEqual(isSafeGitHubContent(["Normal mission update."]), { safe: true });
  assert.equal(isSafeGitHubContent(["api_key=abcdefghijk"]).safe, false);
  assert.equal(isSafeGitHubContent(["raw private context follows"]).safe, false);

  for (const [field, value] of [
    ["prTitle", "token: abcdefghijk"],
    ["missionObjective", "model reasoning"],
    ["prBody", "password=abcdefgh"],
    ["participants", ["raw private context"]],
    ["activatedModes", ["secret: abcdefgh"]],
    ["pendingDecisions", ["[REDACTED thought]"]],
  ]) {
    const input = validInput();
    input[field] = value;
    assert.equal(validateMissionWorkspaceInput(input).state, "invalid");
  }
});

test("PR body generation is deterministic and uses only the supplied timestamp", () => {
  const result = validateMissionWorkspaceInput(validInput());
  assert.equal(result.state, "valid");
  const body = generatePRBody(result.plan, "2026-07-15T02:03:04Z");
  assert.match(body, /## Mission Workspace/);
  assert.match(body, /Maria Hill/);
  assert.match(body, /Delivery Mode/);
  assert.match(body, /2026-07-15T02:03:04Z/);
  assert.equal(body, generatePRBody(result.plan, "2026-07-15T02:03:04Z"));
  assert.throws(() => generatePRBody(result.plan, "yesterday"));
});
