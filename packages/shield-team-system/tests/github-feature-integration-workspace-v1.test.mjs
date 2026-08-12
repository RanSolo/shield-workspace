import assert from "node:assert/strict";
import { createHash, createPrivateKey, sign } from "node:crypto";
import test from "node:test";

import {
  computeFeatureIntegrationWorkspaceEffectObservationDigestV1,
  canonicalFeatureIntegrationJsonV1,
  computeFeatureTransitionRequestCoreDigestV2,
  computeFeatureTransitionRequestDigestV2,
} from "../dist/feature-integration-v1.mjs";
import {
  createFeatureIntegrationDraftPullRequestV1,
  createFeatureIntegrationRefV1,
  integrateFeatureIntegrationPullRequestV1,
  observeFeatureIntegrationDraftPullRequestsV1,
  observeFeatureIntegrationPullRequestV1,
  observeFeatureIntegrationRefV1,
} from "../github/adapter-v1.mjs";
import { createGitHubFeatureObservationProducerV2, createRollbackMissionHandoffReadyV1, executeFeatureIntegrationWorkspaceStageV2, observeFeatureIntegrationWorkspaceEffectV1, reconcileFeatureIntegrationWorkspaceEffectV1 } from "../github/feature-integration-workspace-v1.mjs";

const revision = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;

function runner(result, calls = []) {
  return (executable, args, options) => { calls.push({ executable, args, options }); return result; };
}
function queuedRunner(results) {
  return () => results.shift() ?? { exitCode: 1, stdout: "", stderr: "unexpected call" };
}

test("V2 GitHub producer signs challenge-bound applied and exact not-applied transition proofs", async () => {
  const key = createPrivateKey({ key: Buffer.from(`302e020100300506032b657004220420${"42".repeat(32)}`, "hex"), format: "der", type: "pkcs8" });
  const signEnvelope = async (domain, payload) => ({ payload: structuredClone(payload), signatureBase64: sign(null, Buffer.concat([
    Buffer.from(domain, "ascii"), Buffer.from([0]), Buffer.from(canonicalFeatureIntegrationJsonV1(payload), "utf8"),
  ]), key).toString("base64") });
  const prior = "a".repeat(40), child = "b".repeat(40), merged = "c".repeat(40), gitTree = "d".repeat(40), firstChildCommit = "e".repeat(40);
  const responses = [
    { number: 7, url: "https://github.com/x/y/pull/7", state: "MERGED", isDraft: true, headRefName: "agent/child", headRefOid: child, baseRefName: "feature/226", mergedAt: "2029-01-01T00:00:00Z", mergeCommit: { oid: merged }, statusCheckRollup: [{ name: "test", conclusion: "SUCCESS" }], commits: [{ oid: firstChildCommit }, { oid: child }] },
    [{ number: 7 }], { ref: "refs/heads/feature/226", object: { type: "commit", sha: merged } }, { sha: merged, tree: { sha: gitTree } },
    { sha: merged, tree: { sha: gitTree }, parents: [{ sha: prior }] },
    { sha: child, tree: { sha: gitTree }, parents: [{ sha: firstChildCommit }] },
  ].map((value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "", errorCode: null }));
  const run = () => responses.shift() ?? { status: 1, stdout: "", stderr: "unexpected", errorCode: null };
  const created = createGitHubFeatureObservationProducerV2({ adapterOptions: { run, cwd: "/workspace" }, producerId: "producer:github", signEnvelope, clock: () => "2029-01-01T00:01:00Z" });
  assert.equal(created.state, "ready"); assert.deepEqual(Object.keys(created.producer), ["signChallenge", "executeTransition", "observeAndSignWorkspace", "observeAndSignTransition", "observeAndSignAdmission", "observeAndSignExpiry"]);
  const core = { schemaVersion: 2, contractVersion: "feature.integration.transition-request.v2", requestId: "request:one", operationId: "operation:226", repositoryId: "RanSolo/shield-workspace", derivationKind: "child_merge_to_feature", candidateDigest: `sha256:${"1".repeat(64)}`, effectKey: "effect:child_merge_to_feature:one", pullRequestId: "7", expectedPullRequestHead: child, targetFeatureBranch: "feature/226", targetFeatureRef: "refs/heads/feature/226", integrationMethod: "squash", priorHeadRevision: prior, priorTreeDigest: `sha256:${"2".repeat(64)}`, rollbackWorkspaceReceiptDigest: null };
  const requestCoreDigest = computeFeatureTransitionRequestCoreDigestV2(core);
  const signedChallenge = await created.producer.signChallenge({ schemaVersion: 2, contractVersion: "feature.integration.challenge.v2", challengeKind: "transition", operationId: core.operationId, repositoryId: core.repositoryId, requestId: core.requestId, requestCoreDigest, preparationEntryDigest: null, candidateDigest: core.candidateDigest, effectKey: core.effectKey, producerId: "producer:github", producerKind: "github_repository", generation: 0, challengeId: "challenge:one", previousJournalDigest: `sha256:${"3".repeat(64)}`, intendedEntrySequence: 1, expectedHeadRevision: prior, expectedTreeDigest: core.priorTreeDigest, priorChallengeDigest: null, priorObservationDigest: null, issuedAt: "2029-01-01T00:00:00Z", expiresAt: "2029-01-01T00:05:00Z", challengeDigest: `sha256:${"0".repeat(64)}` });
  const request = { ...core, requestCoreDigest, signedChallenge, requestDigest: `sha256:${"0".repeat(64)}` };
  request.requestDigest = computeFeatureTransitionRequestDigestV2(request);
  const observed = await created.producer.observeAndSignTransition({ request, preparationEntryDigest: `sha256:${"4".repeat(64)}` });
  assert.equal(observed.payload.status, "applied"); assert.equal(observed.payload.pullRequestMergeRevision, merged); assert.deepEqual(observed.payload.resultingCommitParents, [prior]);
  const unavailable = createGitHubFeatureObservationProducerV2({ adapterOptions: { run, cwd: "/workspace" }, producerId: "producer:github", signEnvelope, clock: () => "2029-01-01T00:01:00Z", extra: true });
  assert.deepEqual(unavailable, { state: "unavailable", reason: "producer_unavailable" });
});

test("V2 GitHub producer closes rollback applied, not-applied, and restored-tree uncertainty outcomes", async () => {
  const key = createPrivateKey({ key: Buffer.from(`302e020100300506032b657004220420${"42".repeat(32)}`, "hex"), format: "der", type: "pkcs8" });
  const signEnvelope = async (domain, payload) => ({ payload: structuredClone(payload), signatureBase64: sign(null, Buffer.concat([
    Buffer.from(domain, "ascii"), Buffer.from([0]), Buffer.from(canonicalFeatureIntegrationJsonV1(payload), "utf8"),
  ]), key).toString("base64") });
  const prior = "a".repeat(40), rollbackHead = "b".repeat(40), merged = "c".repeat(40), restoredGitTree = "d".repeat(40), currentGitTree = "e".repeat(40);
  const restoredTreeDigest = `sha256:${createHash("sha256").update(restoredGitTree, "ascii").digest("hex")}`;
  const currentTreeDigest = `sha256:${createHash("sha256").update(currentGitTree, "ascii").digest("hex")}`;
  const core = { schemaVersion: 2, contractVersion: "feature.integration.transition-request.v2", requestId: "request:rollback", operationId: "operation:226",
    repositoryId: "RanSolo/shield-workspace", derivationKind: "child_revert_on_feature", candidateDigest: `sha256:${"1".repeat(64)}`,
    effectKey: "effect:child_revert_on_feature:one", pullRequestId: "8", expectedPullRequestHead: rollbackHead, targetFeatureBranch: "feature/226",
    targetFeatureRef: "refs/heads/feature/226", integrationMethod: "merge_commit", priorHeadRevision: prior,
    priorTreeDigest: currentTreeDigest, rollbackWorkspaceReceiptDigest: `sha256:${"2".repeat(64)}` };
  const requestCoreDigest = computeFeatureTransitionRequestCoreDigestV2(core);
  const challengePayload = { schemaVersion: 2, contractVersion: "feature.integration.challenge.v2", challengeKind: "transition", operationId: core.operationId,
    repositoryId: core.repositoryId, requestId: core.requestId, requestCoreDigest, preparationEntryDigest: null, candidateDigest: core.candidateDigest,
    effectKey: core.effectKey, producerId: "producer:github", producerKind: "github_repository", generation: 0, challengeId: "challenge:rollback",
    previousJournalDigest: `sha256:${"3".repeat(64)}`, intendedEntrySequence: 1, expectedHeadRevision: prior, expectedTreeDigest: currentTreeDigest,
    priorChallengeDigest: null, priorObservationDigest: null, issuedAt: "2029-01-01T00:00:00Z", expiresAt: "2029-01-01T00:05:00Z",
    challengeDigest: `sha256:${"0".repeat(64)}` };
  const produce = async (responses, expectedRestoredTreeDigest = restoredTreeDigest) => {
    const run = () => responses.shift() ?? { status: 1, stdout: "", stderr: "unexpected", errorCode: null };
    const created = createGitHubFeatureObservationProducerV2({ adapterOptions: { run, cwd: "/workspace" }, producerId: "producer:github", signEnvelope,
      clock: () => "2029-01-01T00:01:00Z" });
    const signedChallenge = await created.producer.signChallenge(challengePayload);
    const request = { ...core, requestCoreDigest, signedChallenge, requestDigest: `sha256:${"0".repeat(64)}` };
    request.requestDigest = computeFeatureTransitionRequestDigestV2(request);
    return created.producer.observeAndSignTransition({ request, preparationEntryDigest: `sha256:${"4".repeat(64)}`, signedChallenge, expectedRestoredTreeDigest });
  };
  const mergedResponses = (finalPullCommit = rollbackHead) => [
    { number: 8, url: "https://github.com/x/y/pull/8", state: "MERGED", isDraft: true, headRefName: "rollback/child", headRefOid: rollbackHead,
      baseRefName: "feature/226", mergedAt: "2029-01-01T00:00:00Z", mergeCommit: { oid: merged },
      statusCheckRollup: [{ name: "test", conclusion: "SUCCESS" }], commits: [{ oid: finalPullCommit }] },
    [{ number: 8 }], { ref: "refs/heads/feature/226", object: { type: "commit", sha: merged } },
    { sha: merged, tree: { sha: restoredGitTree } }, { sha: merged, tree: { sha: restoredGitTree }, parents: [{ sha: prior }, { sha: rollbackHead }] },
  ].map((value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "", errorCode: null }));
  assert.equal((await produce(mergedResponses())).payload.status, "applied");
  assert.equal((await produce(mergedResponses(), `sha256:${"f".repeat(64)}`)).payload.status, "uncertain");
  assert.equal((await produce(mergedResponses("e".repeat(40)))).payload.status, "uncertain");

  const unmerged = [
    { number: 8, url: "https://github.com/x/y/pull/8", state: "OPEN", isDraft: true, headRefName: "rollback/child", headRefOid: rollbackHead,
      baseRefName: "feature/226", mergedAt: null, mergeCommit: null, statusCheckRollup: [], commits: [{ oid: rollbackHead }] },
    [{ number: 8 }], { ref: "refs/heads/feature/226", object: { type: "commit", sha: prior } }, { sha: prior, tree: { sha: currentGitTree } },
  ].map((value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "", errorCode: null }));
  assert.equal((await produce(unmerged)).payload.status, "not_applied");
});

test("P1 exports a fail-closed hardened stage owner boundary", async () => {
  let producerCalls = 0;
  const repositoryProducer = { observeAndSignTransition() { producerCalls += 1; } };
  assert.deepEqual(await executeFeatureIntegrationWorkspaceStageV2(null), { state: "blocked", reason: "invalid_input", appendedEntryDigest: null });
  const input = { stage: "feature_branch_creation", replay: { nextStage: "feature_branch_creation" }, journal: {}, stageInput: { stage: "feature_branch_creation" }, storeScope: {},
    trustAnchor: {}, repositoryProducer, cumulativeProducer: null };
  assert.deepEqual(await executeFeatureIntegrationWorkspaceStageV2(input), { state: "blocked", reason: "stage_blocked", appendedEntryDigest: null });
  assert.equal(producerCalls, 0);
  const transitionProducer = { executeTransition() {}, observeAndSignTransition() {} };
  const request = { signedChallenge: {} }, candidate = {};
  const integration = (storeScope) => ({ stage: "integration", replay: { nextStage: "integration" }, journal: {},
    stageInput: { stage: "integration", candidate, request }, storeScope, trustAnchor: {}, repositoryProducer: transitionProducer, cumulativeProducer: null });
  assert.deepEqual(await executeFeatureIntegrationWorkspaceStageV2(integration({ readJournal: async () => { throw new Error("read uncertain"); }, appendEntry: async () => null })),
    { state: "recovery_required", reason: "durability_uncertain", appendedEntryDigest: null });
  assert.deepEqual(await executeFeatureIntegrationWorkspaceStageV2(integration({ readJournal: async () => ({ state: "accepted", value: { journal: { changed: true } } }), appendEntry: async () => null })),
    { state: "blocked", reason: "compare_conflict", appendedEntryDigest: null });
});

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
