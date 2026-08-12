import assert from "node:assert/strict";
import test from "node:test";

import {
  computeFeatureIntegrationWorkspaceEffectObservationDigestV1,
} from "../dist/feature-integration-v1.mjs";
import {
  createFeatureIntegrationDraftPullRequestV1,
  createFeatureIntegrationRefV1,
  integrateFeatureIntegrationPullRequestV1,
  observeFeatureIntegrationDraftPullRequestsV1,
  observeFeatureIntegrationPullRequestV1,
  observeFeatureIntegrationRefV1,
} from "../github/adapter-v1.mjs";
import { createRollbackMissionHandoffReadyV1, observeFeatureIntegrationWorkspaceEffectV1, reconcileFeatureIntegrationWorkspaceEffectV1 } from "../github/feature-integration-workspace-v1.mjs";

const revision = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;

function runner(result, calls = []) {
  return (executable, args, options) => { calls.push({ executable, args, options }); return result; };
}
function queuedRunner(results) {
  return () => results.shift() ?? { exitCode: 1, stdout: "", stderr: "unexpected call" };
}

test("branch adapter observes and creates only exact non-main refs", () => {
  const calls = [];
  const observed = observeFeatureIntegrationRefV1(
    { repositoryId: "RanSolo/shield-workspace", fullRef: "refs/heads/feature/226", challengeId: "challenge:1" },
    { run: runner({ exitCode: 0, stdout: JSON.stringify({ ref: "refs/heads/feature/226", object: { type: "commit", sha: revision } }), stderr: "" }, calls) },
  );
  assert.deepEqual(observed.observation, { repositoryId: "RanSolo/shield-workspace", fullRef: "refs/heads/feature/226", exists: true, headRevision: revision, challengeId: "challenge:1" });
  const created = createFeatureIntegrationRefV1(
    { repositoryId: "RanSolo/shield-workspace", fullRef: "refs/heads/agent/child", sourceRevision: revision, challengeId: "challenge:2" },
    { run: runner({ exitCode: 0, stdout: JSON.stringify({ ref: "refs/heads/agent/child", object: { sha: revision } }), stderr: "" }, calls) },
  );
  assert.equal(created.outcome, "applied");
  assert.equal(calls[1].args.includes("--method"), true);
  let invoked = false;
  assert.equal(createFeatureIntegrationRefV1({ repositoryId: "RanSolo/shield-workspace", fullRef: "refs/heads/main", sourceRevision: revision, challengeId: "challenge:3" }, { run: () => { invoked = true; } }).state, "blocked");
  assert.equal(invoked, false);
});

test("draft PR adapter binds exact head/base and always requests draft", () => {
  const calls = [];
  const created = createFeatureIntegrationDraftPullRequestV1(
    { repositoryId: "RanSolo/shield-workspace", headBranch: "feature/226", baseBranch: "main", title: "Feature 226", body: "Draft workspace", challengeId: "challenge:4" },
    { run: runner({ exitCode: 0, stdout: "https://github.com/RanSolo/shield-workspace/pull/999\n", stderr: "" }, calls) },
  );
  assert.equal(created.outcome, "applied");
  assert.equal(calls[0].args.includes("--draft"), true);
  const observed = observeFeatureIntegrationDraftPullRequestsV1(
    { repositoryId: "RanSolo/shield-workspace", headBranch: "agent/child", baseBranch: "feature/226", challengeId: "challenge:5" },
    { run: runner({ exitCode: 0, stdout: JSON.stringify([{ number: 2, url: "https://github.com/x/y/pull/2", isDraft: true, headRefName: "agent/child", headRefOid: revision, baseRefName: "feature/226" }]), stderr: "" }) },
  );
  assert.equal(observed.state, "observed"); assert.equal(observed.observation.pullRequests[0].draft, true);
});

test("workspace reconciliation fails closed on ambiguous PRs and accepts one exact draft", () => {
  const prepared = { state: "prepared", entry: { entryDigest: digest, payload: { candidateDigest: `sha256:${"c".repeat(64)}`, effectKey: "effect:child_draft_pr_create:one", requestDigest: `sha256:${"d".repeat(64)}`, expectedHeadRevision: "e".repeat(40), expectedTreeDigest: `sha256:${"f".repeat(64)}` } }, candidate: { derivationKind: "child_draft_pr_create", repositoryId: "RanSolo/shield-workspace", childId: "mission:child", childBranch: "agent/child", childHeadRevision: revision, targetBranch: "feature/226" } };
  const refResult = { exitCode: 0, stdout: JSON.stringify({ ref: "refs/heads/agent/child", object: { type: "commit", sha: revision } }), stderr: "" };
  const commitResult = { exitCode: 0, stdout: JSON.stringify({ sha: revision, tree: { sha: "f".repeat(40) } }), stderr: "" };
  const pull = { number: 7, url: "https://github.com/x/y/pull/7", isDraft: true, headRefName: "agent/child", headRefOid: revision, baseRefName: "feature/226" };
  const observe = (pulls) => observeFeatureIntegrationWorkspaceEffectV1(
    { prepared, challengeId: "challenge:6" },
    { run: queuedRunner([refResult, { exitCode: 0, stdout: JSON.stringify(pulls), stderr: "" }, commitResult]), now: () => "2029-01-01T00:00:00Z" },
  );
  const ambiguous = observe([pull, { ...pull, number: 8, url: "https://github.com/x/y/pull/8" }]);
  assert.equal(reconcileFeatureIntegrationWorkspaceEffectV1({ prepared, observation: ambiguous }).reason, "ambiguous_pull_requests");
  const observation = observe([pull]);
  const accepted = reconcileFeatureIntegrationWorkspaceEffectV1({ prepared, observation, challengeId: "challenge:substituted", observedTreeDigest: `sha256:${"0".repeat(64)}`, observedAt: { value: "2040-01-01T00:00:00Z", provenance: "hostTrusted" } });
  assert.equal(accepted.state, "accepted"); assert.equal(accepted.entryKind, "child_publication_accepted");
  assert.deepEqual(accepted.payload.observedAt, { value: "2029-01-01T00:00:00Z", provenance: "hostTrusted" });
  assert.equal(accepted.payload.observationProvenance, "github:workspace:challenge:6");
  assert.notEqual(accepted.payload.effectObservation.observedTreeDigest, `sha256:${"0".repeat(64)}`);
  const substitutedPrepared = { ...prepared, entry: { ...prepared.entry, entryDigest: `sha256:${"9".repeat(64)}` } };
  assert.equal(reconcileFeatureIntegrationWorkspaceEffectV1({ prepared: substitutedPrepared, observation }).reason, "observation_untrusted");

  const resign = (value) => {
    value.observationDigest = computeFeatureIntegrationWorkspaceEffectObservationDigestV1(value);
    return { state: "observed", observation: value };
  };
  const rejects = (value) => assert.equal(reconcileFeatureIntegrationWorkspaceEffectV1({ prepared, observation: value }).reason, "observation_untrusted");

  const wrongSchema = structuredClone(observation.observation);
  wrongSchema.schemaVersion = 2;
  rejects(resign(wrongSchema));

  const extraField = structuredClone(observation.observation);
  extraField.unexpected = true;
  rejects(resign(extraField));

  const malformedPullRequest = structuredClone(observation.observation);
  malformedPullRequest.pullRequests[0].draft = "true";
  rejects(resign(malformedPullRequest));

  const accessor = structuredClone(observation.observation);
  Object.defineProperty(accessor, "status", { enumerable: true, get: () => "applied" });
  rejects({ state: "observed", observation: accessor });

  rejects({ state: "observed", observation: new Proxy(observation.observation, {}) });
});

test("integration adapter binds the exact PR head and cannot target main", () => {
  const calls = [];
  const integrated = integrateFeatureIntegrationPullRequestV1(
    { repositoryId: "RanSolo/shield-workspace", pullRequestId: 7, expectedHeadRevision: revision, targetFeatureBranch: "feature/226", integrationMethod: "squash", challengeId: "challenge:7" },
    { run: runner({ exitCode: 0, stdout: JSON.stringify({ merged: true, sha: "c".repeat(40) }), stderr: "" }, calls) },
  );
  assert.equal(integrated.outcome, "applied");
  assert.equal(calls[0].args.includes(`sha=${revision}`), true);
  let invoked = false;
  assert.equal(integrateFeatureIntegrationPullRequestV1({ repositoryId: "RanSolo/shield-workspace", pullRequestId: 7, expectedHeadRevision: revision, targetFeatureBranch: "main", integrationMethod: "squash", challengeId: "challenge:7" }, { run: () => { invoked = true; } }).state, "blocked");
  assert.equal(invoked, false);
});

test("integration observation retains exact target, checks, and merge identity", () => {
  const observation = observeFeatureIntegrationPullRequestV1(
    { repositoryId: "RanSolo/shield-workspace", pullRequestId: 7, challengeId: "challenge:8" },
    { run: runner({ exitCode: 0, stdout: JSON.stringify({ number: 7, url: "https://github.com/x/y/pull/7", state: "MERGED", isDraft: true, headRefName: "agent/child", headRefOid: revision, baseRefName: "feature/226", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", statusCheckRollup: [{ name: "test", conclusion: "SUCCESS" }], mergedAt: "2029-01-01T00:00:00Z", mergeCommit: { oid: "c".repeat(40) } }), stderr: "" }) },
  );
  assert.equal(observation.state, "observed");
  assert.deepEqual(observation.observation.checks, [{ id: "test", status: "SUCCESS" }]);
  assert.equal(observation.observation.baseBranch, "feature/226");
});

test("rollback handoff is observation-only and restricted to latest unreverted integration", () => {
  const replay = {
    pendingEffect: null,
    cumulativeValidation: "failed",
    terminalHeadRevision: "c".repeat(40),
    terminalTreeDigest: digest,
    replayContext: {
      operationId: "operation:226", repositoryId: "RanSolo/shield-workspace", consumedEffectKeys: [],
      activePlan: { featureBranch: "feature/226", children: [{ childId: "mission:child", allowedEffectKeys: ["effect:child_revert_on_feature:one"] }] },
      acceptedIntegrations: [{ childId: "mission:child", reverted: false, priorTreeDigest: `sha256:${"d".repeat(64)}`, resultingHeadRevision: "c".repeat(40), resultingTreeDigest: digest, receiptDigest: `sha256:${"e".repeat(64)}` }],
    },
  };
  const handoff = createRollbackMissionHandoffReadyV1({ replay });
  assert.equal(handoff.state, "rollback_mission_handoff_ready"); assert.equal(handoff.performsEffect, false);
  assert.equal(handoff.expectedRestoredTreeDigest, `sha256:${"d".repeat(64)}`);
});
