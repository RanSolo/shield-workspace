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
    ...overrides,
  };
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

test("approval, committed brief, and verified draft receipt open specialist dispatch", () => {
  const run = runner([
    ...initialChecks(), ok("[]"), ok(pr().url), ok(JSON.stringify([pr()])),
  ]);
  const result = prepareDeliveryWorkspaceForDispatch(input(), { run });

  assert.equal(result.state, "dispatch_ready");
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

  assert.equal(result.state, "dispatch_ready");
  assert.equal(result.publicationAction, "updated_existing_draft_pr");
  assert.equal(result.receipt.prNumber, 45);
  assert.equal(run.calls.filter(({ args }) => args[0] === "pr" && args[1] === "create").length, 0);
  assert.equal(run.calls.filter(({ args }) => args[0] === "pr" && args[1] === "edit").length, 1);
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
  });
  assert.equal(handoff.state, "valid");
  assert.match(handoff.body, /Melinda May — implementation-start/);
  assert.match(handoff.body, /\*\*Seat:\*\* `may`/);

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
