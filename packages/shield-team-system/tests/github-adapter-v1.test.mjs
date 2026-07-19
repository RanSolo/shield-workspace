import assert from "node:assert/strict";
import test from "node:test";

import {
  createGitHubHumanEvidenceCandidate,
  deliverGitHubCommunication,
} from "../public/github.mjs";

const head = "0123456789012345678901234567890123456789";

function journaledRequest(operation = "publish_status") {
  return {
    schemaVersion: 4,
    entryId: "entry:mission:fixture:2",
    missionId: "mission:fixture",
    sequence: 2,
    type: "communication.requested",
    timestamp: { value: "2026-07-19T06:00:00Z", provenance: "hostTrusted" },
    payload: {
      request: {
        requestId: `request:${operation}`,
        adapterContractVersion: 1,
        adapterId: "github",
        operation,
        missionId: "mission:fixture",
        subjectId: "issue:28",
        revisionId: "sha256:mission-revision",
        artifactRevisionId: head,
        targetRef: "github:pr:28",
      },
    },
  };
}

function publication() {
  return {
    candidateId: "candidate:publication:1",
    sourceRef: "github:pr:28",
    capturedAt: { value: "2026-07-19T06:01:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    prNumber: 28,
    body: "Human-readable mission status for the exact revision.",
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

test("GitHub performs no effect without an exact journaled request", () => {
  const run = runner([]);
  const result = deliverGitHubCommunication(journaledRequest().payload.request, publication(), { run });
  assert.deepEqual(result, { state: "blocked", reason: "journaled_request_required", commands: [] });
  assert.equal(run.calls.length, 0);
});

test("GitHub publishes human-readable status only at the requested exact head", () => {
  const run = runner([ok(head), ok("github:pr:28:comment:44")]);
  const result = deliverGitHubCommunication(journaledRequest(), publication(), { run });
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.outcome, "delivered");
  assert.equal(result.candidate.payload.receiptRef, "github:pr:28:comment:44");
  assert.deepEqual(run.calls.map(({ executable, args }) => [executable, ...args.slice(0, 2)]), [
    ["git", "rev-parse", "HEAD"],
    ["gh", "pr", "comment"],
  ]);
  assert.equal(run.calls[1].options.input, publication().body);
});

test("mission brief publication delegates to the existing draft PR workspace", () => {
  const branchSlug = "codex/issue-28-github-host-adapter";
  const workspacePlan = {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug,
    missionBriefPath: "docs/missions/issue-28-v0.3-5-github-adapter.md",
    prTitle: "feat: add GitHub host adapter",
  };
  const pr = {
    number: 28,
    title: workspacePlan.prTitle,
    url: "https://github.com/RanSolo/shield-workspace/pull/28",
    isDraft: true,
    state: "OPEN",
    headRefName: branchSlug,
    headRefOid: head,
    baseRefName: "main",
  };
  const run = runner([
    ok(head),
    ok(branchSlug),
    ok(),
    ok(workspacePlan.missionBriefPath),
    ok(head),
    ok(head),
    ok(),
    ok("[]"),
    ok(pr.url),
    ok(JSON.stringify([pr])),
  ]);
  const result = deliverGitHubCommunication(
    journaledRequest("publish_mission_brief"),
    { ...publication(), workspacePlan },
    { run },
  );
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.outcome, "delivered");
  assert.equal(result.candidate.payload.receiptRef, pr.url);
  assert.ok(run.calls.some(({ executable, args }) => executable === "gh" && args[0] === "pr" && args[1] === "create"));
});

test("GitHub reports stale and unavailable delivery without fabricating evidence", () => {
  const staleRun = runner([ok("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]);
  const stale = deliverGitHubCommunication(journaledRequest(), publication(), { run: staleRun });
  assert.equal(stale.state, "candidate");
  assert.deepEqual(stale.candidate.payload, {
    requestId: "request:publish_status",
    outcome: "failed",
    failureReason: "ambiguous_response",
    receiptRef: null,
  });

  const unavailableRun = runner([{ exitCode: 1, stdout: "", stderr: "not logged into GitHub" }]);
  const unavailable = deliverGitHubCommunication(journaledRequest(), publication(), { run: unavailableRun });
  assert.equal(unavailable.state, "candidate");
  assert.equal(unavailable.candidate.payload.outcome, "failed");
  assert.equal(unavailable.candidate.payload.failureReason, "authentication_failed");
  assert.equal(Object.hasOwn(unavailable.candidate, "humanPrincipalId"), true);
  assert.equal(unavailable.candidate.humanPrincipalId, null);
});

test("GitHub review input remains a candidate and cannot assign authority", () => {
  const evidence = {
    payload: {
      evidenceId: "evidence:fitz:3",
      missionId: "mission:fixture",
      subjectId: "issue:28",
      revisionId: "sha256:mission-revision",
      humanPrincipalId: "human:fitz",
      bindingId: "binding:fitz",
      sourceRef: "github:pr:28:review:3",
    },
    signatureBase64: "signed",
  };
  const result = createGitHubHumanEvidenceCandidate({
    candidateId: "evidence:fitz:3",
    missionId: "mission:fixture",
    subjectId: "issue:28",
    revisionId: "sha256:mission-revision",
    humanPrincipalId: "human:fitz",
    bindingId: "binding:fitz",
    sourceRef: "github:pr:28:review:3",
    capturedAt: { value: "2026-07-19T06:02:00Z", provenance: "hostTrusted" },
    evidence,
  });
  assert.equal(result.state, "candidate");
  assert.equal(Object.hasOwn(result.candidate, "decision"), false);
  assert.equal(Object.hasOwn(result.candidate, "readiness"), false);
});
