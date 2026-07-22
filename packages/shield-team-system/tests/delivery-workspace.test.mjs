import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareDeliveryWorkspaceForDispatch,
  renderMissionHandoff,
  validatePRWorkspaceReceipt,
} from "../public/github.mjs";

const head = "0123456789012345678901234567890123456789";

function plan() {
  return {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug: "codex/issue-44-draft-pr-workspace",
    missionBriefPath: "docs/missions/issue-44-draft-pr-workspace-regression.md",
    prTitle: "Regression: enforce the draft PR Mission Workspace",
  };
}

function pr(overrides = {}) {
  return {
    number: 45,
    title: plan().prTitle,
    url: "https://github.com/RanSolo/shield-workspace/pull/45",
    isDraft: true,
    state: "OPEN",
    headRefName: plan().branchSlug,
    headRefOid: head,
    baseRefName: "main",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    missionState: "approved",
    approvalSource: "coulson",
    artifactRevisionId: head,
    workspacePlan: plan(),
    body: "Issue 44 Mission Workspace",
    missionId: "mission-44",
    subjectId: "issue-44",
    blueprintArtifact: {
      artifactId: "issue-44-blueprint",
      artifactPath: plan().missionBriefPath,
      artifactKind: "implementation_blueprint",
      owningSeatId: "may",
    },
    planGate: null,
    ...overrides,
  };
}

function passingGate(overrides = {}) {
  return {
    planGateSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    review: {
      reviewSchemaVersion: 1,
      contractVersion: "fury.plan-gate.v1",
      assuranceKind: "host_asserted_non_authoritative",
      reviewId: "review-44-1",
      missionId: "mission-44",
      subjectId: "issue-44",
      repositoryOwner: "RanSolo",
      repositoryName: "shield-workspace",
      baseBranch: "main",
      missionBranch: plan().branchSlug,
      prNumber: 45,
      blueprintArtifactId: "issue-44-blueprint",
      blueprintArtifactPath: plan().missionBriefPath,
      blueprintArtifactKind: "implementation_blueprint",
      blueprintOwningSeatId: "may",
      reviewedRevisionId: head,
      verdict: "PASS",
      findings: [],
      reasoningRuntimeId: "runtime:ornith",
      toolExecutorId: "executor:codex-host",
      ...overrides,
    },
    reconciliation: null,
  };
}

function reconciledGate() {
  const reviewedRevisionId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const value = passingGate({
    reviewedRevisionId,
    verdict: "PASS_WITH_REQUIRED_CHANGES",
    findings: [{
      findingId: "finding-1",
      findingClass: "fail_closedness",
      evidenceRefs: ["pr:45#fury-review"],
    }],
  });
  value.reconciliation = {
    reconciliationSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    assuranceKind: "host_asserted_non_authoritative",
    reconciliationId: "reconciliation-44-1",
    reviewId: "review-44-1",
    missionId: "mission-44",
    subjectId: "issue-44",
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    missionBranch: plan().branchSlug,
    prNumber: 45,
    blueprintArtifactId: "issue-44-blueprint",
    blueprintArtifactPath: plan().missionBriefPath,
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    reviewedRevisionId,
    correctedRevisionId: head,
    additionalArchitectureChange: false,
    dispositions: [{
      findingId: "finding-1",
      disposition: "incorporated",
      evidenceRefs: [`commit:${head}`],
    }],
    reasoningRuntimeId: "runtime:ornith",
    toolExecutorId: "executor:codex-host",
  };
  return value;
}

function runner(responses) {
  const calls = [];
  const run = (executable, args, options = {}) => {
    calls.push({ executable, args, options });
    const response = responses.shift();
    assert.ok(response, `Unexpected command: ${executable} ${args.join(" ")}`);
    return response;
  };
  run.calls = calls;
  return run;
}

const ok = (stdout = "") => ({ exitCode: 0, stdout, stderr: "" });
const initialChecks = () => [
  ok(plan().branchSlug), ok(), ok(plan().missionBriefPath), ok(head), ok(head), ok(),
];

test("approval and verified draft receipt produce workspace_ready while Fury is pending", () => {
  const run = runner([
    ...initialChecks(), ok("[]"), ok(pr().url), ok(JSON.stringify([pr()])),
  ]);
  const result = prepareDeliveryWorkspaceForDispatch(input(), { run });

  assert.equal(result.state, "workspace_ready");
  assert.deepEqual(result.planGateEvaluation.reasonCodes, ["PLAN_REVIEW_REQUIRED"]);
  assert.equal(result.publicationAction, "created_draft_pr");
  assert.deepEqual(result.receipt, {
    schemaVersion: 1,
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug: plan().branchSlug,
    artifactRevisionId: head,
    prNumber: 45,
    prUrl: pr().url,
    state: "OPEN",
    isDraft: true,
  });

  const neverCalled = runner([]);
  const denied = prepareDeliveryWorkspaceForDispatch(input({ missionState: "proposed" }), {
    run: neverCalled,
  });
  assert.equal(denied.state, "blocked");
  assert.equal(denied.reason, "specialist_dispatch_not_approved");
  assert.equal(neverCalled.calls.length, 0);
});

test("creation, update, and verification failures deny specialist dispatch", () => {
  const creation = prepareDeliveryWorkspaceForDispatch(input(), {
    run: runner([
      ...initialChecks(), ok("[]"), { exitCode: 1, stdout: "", stderr: "denied" },
    ]),
  });
  assert.equal(creation.state, "blocked");
  assert.equal(creation.reason, "pr_create_failed");

  const update = prepareDeliveryWorkspaceForDispatch(input(), {
    run: runner([
      ...initialChecks(), ok(JSON.stringify([pr()])),
      { exitCode: 1, stdout: "", stderr: "denied" },
    ]),
  });
  assert.equal(update.state, "blocked");
  assert.equal(update.reason, "pr_update_failed");

  const verification = prepareDeliveryWorkspaceForDispatch(input(), {
    run: runner([
      ...initialChecks(), ok("[]"), ok(pr().url),
      ok(JSON.stringify([pr({ headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })])),
    ]),
  });
  assert.equal(verification.state, "blocked");
  assert.equal(verification.reason, "created_pr_failed_readback");

  const updateVerification = prepareDeliveryWorkspaceForDispatch(input(), {
    run: runner([
      ...initialChecks(), ok(JSON.stringify([pr()])), ok(),
      ok(JSON.stringify([pr({ headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })])),
    ]),
  });
  assert.equal(updateVerification.state, "blocked");
  assert.equal(updateVerification.reason, "updated_pr_failed_readback");
});

test("repeated publication reuses and verifies the existing draft PR", () => {
  const run = runner([
    ...initialChecks(), ok(JSON.stringify([pr()])), ok(), ok(JSON.stringify([pr()])),
  ]);
  const result = prepareDeliveryWorkspaceForDispatch(input(), { run });

  assert.equal(result.state, "workspace_ready");
  assert.equal(result.publicationAction, "updated_existing_draft_pr");
  assert.equal(result.receipt.prNumber, 45);
  assert.equal(run.calls.filter(({ args }) => args[0] === "pr" && args[1] === "create").length, 0);
  assert.equal(run.calls.filter(({ args }) => args[0] === "pr" && args[1] === "edit").length, 1);
});

test("an exact Fury PASS opens dispatch after verified readback", () => {
  const run = runner([
    ...initialChecks(), ok(JSON.stringify([pr()])), ok(), ok(JSON.stringify([pr()])),
  ]);
  const result = prepareDeliveryWorkspaceForDispatch(input({ planGate: passingGate() }), { run });
  assert.equal(result.state, "dispatch_ready");
  assert.equal(result.planGateEvaluation.dispatchEligibility, "eligible");
  assert.equal(result.planGateEvaluation.reviewerSeatId, "fury");
});

test("bounded reconciliation opens dispatch while Fury FAIL remains workspace_ready", () => {
  const reconciled = prepareDeliveryWorkspaceForDispatch(
    input({ planGate: reconciledGate() }),
    { run: runner([...initialChecks(), ok(JSON.stringify([pr()])), ok(), ok(JSON.stringify([pr()]))]) },
  );
  assert.equal(reconciled.state, "dispatch_ready");
  assert.equal(reconciled.planGateEvaluation.verifierSeatId, "hill");

  const failed = prepareDeliveryWorkspaceForDispatch(
    input({
      planGate: passingGate({
        verdict: "FAIL",
        findings: [{
          findingId: "finding-1",
          findingClass: "architecture",
          evidenceRefs: ["pr:45#fury-fail"],
        }],
      }),
    }),
    { run: runner([...initialChecks(), ok(JSON.stringify([pr()])), ok(), ok(JSON.stringify([pr()]))]) },
  );
  assert.equal(failed.state, "workspace_ready");
  assert.deepEqual(failed.planGateEvaluation.reasonCodes, ["REVIEW_FAILED"]);
});

test("malformed blueprint and non-null gate block before any command", () => {
  for (const [value, reason] of [
    [input({ blueprintArtifact: { ...input().blueprintArtifact, artifactPath: "docs/other.md" } }), "blueprint_path_mismatch"],
    [input({ planGate: { planGateSchemaVersion: 1 } }), "invalid_fury_plan_gate_input"],
    [input({ planGate: undefined }), "invalid_fury_plan_gate_input"],
  ]) {
    const run = runner([]);
    const result = prepareDeliveryWorkspaceForDispatch(value, { run });
    assert.equal(result.state, "blocked");
    assert.equal(result.reason, reason);
    assert.deepEqual(result.commands, []);
    assert.equal(run.calls.length, 0);
  }
  const getter = input();
  Object.defineProperty(getter.blueprintArtifact, "artifactId", { get() { throw new Error("no"); } });
  const result = prepareDeliveryWorkspaceForDispatch(getter, { run: runner([]) });
  assert.equal(result.state, "blocked");
  assert.deepEqual(result.commands, []);
});

test("receipt identity and expected revision mismatches fail closed", () => {
  const receipt = {
    schemaVersion: 1,
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug: plan().branchSlug,
    artifactRevisionId: head,
    prNumber: 45,
    prUrl: pr().url,
    state: "OPEN",
    isDraft: true,
  };
  const expected = {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug: plan().branchSlug,
    artifactRevisionId: head,
    prNumber: 45,
  };
  for (const [field, value, reason] of [
    ["repositoryOwner", "Other", "receipt_repositoryOwner_mismatch"],
    ["repositoryName", "other", "receipt_repositoryName_mismatch"],
    ["baseBranch", "release", "receipt_baseBranch_mismatch"],
    ["branchSlug", "other/branch", "receipt_branchSlug_mismatch"],
    ["artifactRevisionId", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "receipt_artifactRevisionId_mismatch"],
    ["prNumber", 46, "receipt_prNumber_mismatch"],
  ]) {
    const result = validatePRWorkspaceReceipt(receipt, { ...expected, [field]: value });
    assert.equal(result.state, "invalid");
    assert.equal(result.reason, reason);
  }
  const wrongUrl = validatePRWorkspaceReceipt(
    { ...receipt, prUrl: "https://github.com/RanSolo/other/pull/45" },
    expected,
  );
  assert.equal(wrongUrl.state, "invalid");
  assert.equal(wrongUrl.reason, "receipt_prUrl_mismatch");

  const staleExpectedRevision = prepareDeliveryWorkspaceForDispatch(
    input({ artifactRevisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    { run: runner([...initialChecks(), ok("[]"), ok(pr().url), ok(JSON.stringify([pr()]))]) },
  );
  assert.equal(staleExpectedRevision.state, "blocked");
  assert.equal(staleExpectedRevision.reason, "receipt_artifactRevisionId_mismatch");
});

test("handoff rendering derives truthful names from closed seat identity", () => {
  const handoff = renderMissionHandoff({
    seatId: "may",
    kind: "implementation-start",
    summary: "May accepted the approved Issue 44 implementation scope.",
    artifactRevisionId: head,
    mission: "Issue 44 — Minimum safe executor contract",
    status: "Implementation Start",
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-44-minimum-safe-executor",
    prNumber: 66,
    prState: "Draft",
    currentOwnerSeatId: "may",
    workspaceVerification: "Verified",
    blockedState: "No",
    architectureState: "Approved",
    humanInterventions: 1,
    localSeatInvocations: 2,
    premiumAgentInvocations: 0,
    deliveryMode: "Standard S.H.I.E.L.D.",
    missionConfidence: "High",
    nextCheckpoint: "First vertical slice",
    missionContext: "May accepted the approved Issue 44 implementation scope.",
    changesSinceLastCheckpoint: "Initial implementation slice is complete.",
    completed: "Bounded executor contract implemented.",
    evidence: "Validated workspace scope and audit evidence.",
    next: "Fury conformance review.",
    risks: "No new architectural or delivery risks identified.",
    coulsonAction: "Review the draft PR.",
  });
  assert.equal(handoff.state, "valid");
  assert.match(handoff.body, /Melinda May — Implementation Start/);
  assert.match(handoff.body, /## Mission Status/);
  assert.match(handoff.body, /Mission: Issue 44 — Minimum safe executor contract/);
  assert.match(handoff.body, /Current Owner: Melinda May/);
  assert.match(handoff.body, /## Mission Context/);
  assert.match(handoff.body, /## Completed \/ Evidence \/ Next/);
  assert.match(handoff.body, /## Coulson Action/);

  assert.equal(renderMissionHandoff({
    seatId: "runtime:codex",
    kind: "implementation-start",
    summary: "A runtime cannot claim a seat.",
    artifactRevisionId: head,
  }).reason, "unknown_seat");
  assert.equal(renderMissionHandoff({
    seatId: "may",
    seatName: "Leo Fitz",
    kind: "implementation-start",
    summary: "Caller supplied attribution is rejected.",
    artifactRevisionId: head,
  }).reason, "handoff_shape_mismatch");
});
