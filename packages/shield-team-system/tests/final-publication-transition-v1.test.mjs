import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  classifyFinalPublicationCanonicalStateV1ForTest,
  FinalPublicationProcessStopV1ForTest,
  observeFinalPublicationWorktreeV1ForTest,
  runFinalPublicationTransitionV1,
} from "../dist/final-publication-transition-v1.mjs";
import { canonicalJson } from "../dist/mission-v2.mjs";
import { computeReviewPublicationAuthorityDigest } from "../dist/review-publication-v1.mjs";

const repositoryId = "RanSolo/shield-workspace";
const branch = "agent/final-publication-transition";

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function repository() {
  const root = await mkdtemp(join(tmpdir(), "shield-final-transition-"));
  git(root, "init", "--quiet", "--initial-branch", branch);
  git(root, "config", "user.name", "SHIELD Test");
  git(root, "config", "user.email", "shield@example.invalid");
  git(root, "remote", "add", "origin", "git@github.com:RanSolo/shield-workspace.git");
  await writeFile(join(root, "plan.md"), "plan\n");
  git(root, "add", "plan.md");
  git(root, "commit", "--quiet", "-m", "plan");
  const initial = git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "implementation.mjs"), "export const implemented = true;\n");
  git(root, "add", "implementation.mjs");
  git(root, "commit", "--quiet", "-m", "implementation");
  return { root: await realpath(root), initial, head: git(root, "rev-parse", "HEAD") };
}

test("attached and exact detached worktrees converge on the unique expected branch without HEAD drift", async () => {
  const fixture = await repository();
  const attached = await observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: fixture.root,
    repositoryId,
    expectedBranch: branch,
    expectedInitialHead: fixture.initial,
  });
  assert.deepEqual(attached, { head: fixture.head, branch });

  git(fixture.root, "switch", "--detach", fixture.head);
  assert.equal(git(fixture.root, "branch", "--show-current"), "");
  const repaired = await observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: fixture.root,
    repositoryId,
    expectedBranch: branch,
    expectedInitialHead: fixture.initial,
  });
  assert.deepEqual(repaired, { head: fixture.head, branch });
  assert.equal(git(fixture.root, "branch", "--show-current"), branch);
});

test("detached repair rejects dirt, ref drift, repository drift, and another worktree owner", async () => {
  const dirty = await repository();
  await writeFile(join(dirty.root, "dirty.txt"), "dirty\n");
  await assert.rejects(observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: dirty.root, repositoryId, expectedBranch: branch, expectedInitialHead: dirty.initial,
  }), /cleanliness/u);

  const refDrift = await repository();
  git(refDrift.root, "switch", "--detach", refDrift.head);
  git(refDrift.root, "branch", "-f", branch, refDrift.initial);
  await assert.rejects(observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: refDrift.root, repositoryId, expectedBranch: branch, expectedInitialHead: refDrift.initial,
  }), /HEAD|ref/u);

  const repositoryDrift = await repository();
  await assert.rejects(observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: repositoryDrift.root, repositoryId: "RanSolo/other", expectedBranch: branch, expectedInitialHead: repositoryDrift.initial,
  }), /identity/u);

  const owned = await repository();
  git(owned.root, "switch", "--detach", owned.head);
  const ownerRoot = await mkdtemp(join(tmpdir(), "shield-final-transition-owner-"));
  execFileSync("git", ["worktree", "add", ownerRoot, branch], { cwd: owned.root, stdio: "pipe" });
  await assert.rejects(observeFinalPublicationWorktreeV1ForTest({
    repositoryRoot: owned.root, repositoryId, expectedBranch: branch, expectedInitialHead: owned.initial,
  }), /owned by another worktree/u);
});

test("closed transition input fails incompatible before repository or publication effects", async () => {
  const result = await runFinalPublicationTransitionV1({ repositoryRoot: "", missionId: "", baseBranch: "" });
  assert.equal(result.state, "recovery_required");
  assert.equal(result.classification, "incompatible");
  assert.match(result.reason, /input is malformed/u);
});

function canonicalClassificationFixture() {
  const missionId = "mission:classification";
  const authority = {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    authorityKind: "review.publish",
    authorityRef: `authorization:${missionId}:review-publish:1`,
    missionId,
    subjectId: "github:RanSolo/shield-workspace/issue/311",
    missionRevisionId: "sha256:mission-classification",
    repositoryId,
    canonicalRepositoryRoot: "/workspace/shield-workspace",
    branch,
    baseRevisionId: "a".repeat(40),
    headRevisionId: "b".repeat(40),
    authorizedPaths: ["docs/missions/issue-311.md"],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
  };
  const authorization = {
    authorizationId: authority.authorityRef,
    authorityDigest: computeReviewPublicationAuthorityDigest(authority),
    authorityKind: "review.publish",
    missionId,
    subjectId: authority.subjectId,
    missionRevisionId: authority.missionRevisionId,
    artifactRevisionId: authority.headRevisionId,
    humanPrincipalId: "human:coulson",
    humanBindingId: "binding:coulson",
    signingKeyRef: "key:coulson",
    previousJournalSequence: 0,
    journalSequence: 1,
    sourceRef: "cli:prepare-next:publication-authorize:1",
  };
  const record = {
    entryId: `entry:${missionId}:1`,
    journalSequence: 1,
    authority,
    authorization,
    aliases: [],
  };
  const request = {
    requestId: "request:final-publication:classification",
    adapterContractVersion: 2,
    adapterId: "github",
    operation: "publish_mission_brief",
    missionId,
    subjectId: authority.subjectId,
    revisionId: authority.missionRevisionId,
    artifactRevisionId: authority.headRevisionId,
    targetRef: `github:repository:${repositoryId}:branch:${branch}:base:main`,
    publicationAuthorizationId: authorization.authorizationId,
    proposedChangedPaths: [...authority.authorizedPaths],
    requestedEffects: [...authority.permittedEffects],
  };
  const journal = {
    kind: "profile-aware",
    entries: [
      { type: "mission.intake", payload: {} },
      { type: "review.publication_authorized", sequence: 1, entryId: record.entryId,
        payload: { authority, authorization: { payload: authorization } } },
    ],
    projection: {
      missionId,
      brief: { subjectId: authority.subjectId, revisionId: authority.missionRevisionId },
      publicationAuthorizations: [{ authority: { authorityKind: "wheels_up" }, aliases: [] }, record],
      communication: { requests: [] },
    },
  };
  const reusable = {
    schemaVersion: 1,
    state: "publication_already_authorized",
    missionId,
    missionRevisionId: authority.missionRevisionId,
    authorizationId: authorization.authorizationId,
    authorityDigest: authorization.authorityDigest,
    journalSequence: 1,
  };
  return { authority, authorization, journal, record, request, reusable };
}

test("canonical preparation outcomes alone classify supersedable, reusable, consumed, and incompatible", () => {
  const fixture = canonicalClassificationFixture();
  assert.equal(classifyFinalPublicationCanonicalStateV1ForTest({ state: "publication_ready" }, fixture.journal).classification, "supersedable");
  assert.equal(classifyFinalPublicationCanonicalStateV1ForTest(fixture.reusable, fixture.journal).classification, "reusable");

  fixture.journal.entries.push({ type: "communication.requested", payload: { request: fixture.request } });
  fixture.journal.projection.communication.requests.push({ ...fixture.request, state: "queued" });
  const consumed = classifyFinalPublicationCanonicalStateV1ForTest({
    state: "blocked",
    reasonCode: "authority_conflict",
    errors: ["Existing prepared publication authorization has already been consumed or conflicted by a publication request."],
  }, fixture.journal);
  assert.equal(consumed.classification, "consumed");
  assert.equal(consumed.resumable, true);

  const incompatible = classifyFinalPublicationCanonicalStateV1ForTest({
    state: "blocked", reasonCode: "repository_observation_stale", errors: ["drift"],
  }, fixture.journal);
  assert.equal(incompatible.classification, "incompatible");
  assert.equal(incompatible.resumable, false);
});

test("canonical consumed classification rejects foreign, multiple, terminal, and provenance-broken request chains", () => {
  const blocked = {
    state: "blocked",
    reasonCode: "authority_conflict",
    errors: ["Existing prepared publication authorization has already been consumed or conflicted by a publication request."],
  };
  for (const mutate of [
    (fixture) => fixture.journal.projection.publicationAuthorizations[1].authorization.sourceRef = "foreign",
    (fixture) => fixture.journal.projection.communication.requests.push({ ...fixture.request, requestId: "request:foreign", state: "queued" }),
    (fixture) => fixture.journal.projection.communication.requests[0].state = "failed",
    (fixture) => fixture.journal.entries.splice(2, 1),
  ]) {
    const fixture = canonicalClassificationFixture();
    fixture.journal.entries.push({ type: "communication.requested", payload: { request: fixture.request } });
    fixture.journal.projection.communication.requests.push({ ...fixture.request, state: "queued" });
    mutate(fixture);
    const result = classifyFinalPublicationCanonicalStateV1ForTest(blocked, fixture.journal);
    assert.equal(result.resumable, false);
    assert.equal(result.authority, null);
  }
});

function transitionHarness(options = {}) {
  const root = "/workspace/shield-final-publication";
  const missionId = "mission:final-publication-transition";
  const missionRevisionId = "c".repeat(40);
  const subjectId = "github:RanSolo/shield-workspace/issue/311";
  const initialHead = "a".repeat(40);
  const head = "b".repeat(40);
  const authority = {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    authorityKind: "review.publish",
    authorityRef: `authorization:${missionId}:review-publish:1`,
    missionId,
    subjectId,
    missionRevisionId,
    repositoryId,
    canonicalRepositoryRoot: root,
    branch,
    baseRevisionId: initialHead,
    headRevisionId: head,
    authorizedPaths: ["docs/missions/issue-311.md"],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
  };
  const authorization = {
    authorizationId: authority.authorityRef,
    authorityDigest: computeReviewPublicationAuthorityDigest(authority),
    authorityKind: "review.publish",
    missionId,
    subjectId,
    missionRevisionId,
    artifactRevisionId: head,
    humanPrincipalId: "human:coulson",
    humanBindingId: "binding:coulson",
    signingKeyRef: "key:coulson",
    previousJournalSequence: 0,
    journalSequence: 1,
    sourceRef: "cli:prepare-next:publication-authorize:1",
  };
  const record = {
    entryId: `entry:${missionId}:1`,
    journalSequence: 1,
    authority,
    authorization,
    aliases: [],
  };
  const journal = {
    kind: "profile-aware",
    entries: [
      { type: "mission.intake", payload: {} },
      { type: "review.publication_authorized", sequence: 1, entryId: record.entryId,
        payload: { authority, authorization: { payload: authorization } } },
    ],
    projection: {
      missionId,
      brief: { subjectId, revisionId: missionRevisionId },
      publicationAuthorizations: [{
        authority: {
          authorityKind: "wheels_up", missionId, missionRevisionId, subjectId, repositoryId,
          canonicalRepositoryRoot: root, branch, baseRevisionId: "0".repeat(40), headRevisionId: initialHead,
        },
        aliases: [],
      }, record],
      communication: { requests: [] },
    },
  };
  const reusable = {
    schemaVersion: 1,
    state: "publication_already_authorized",
    missionId,
    missionRevisionId,
    authorizationId: authorization.authorizationId,
    authorityDigest: authorization.authorityDigest,
    journalSequence: 1,
  };
  const consumed = {
    state: "blocked",
    reasonCode: "authority_conflict",
    errors: ["Existing prepared publication authorization has already been consumed or conflicted by a publication request."],
  };
  const receipt = {
    receiptVersion: 1,
    repositoryId,
    baseBranch: "main",
    headBranch: branch,
    headRevision: head,
    prNumber: 311,
    prUrl: "https://github.com/RanSolo/shield-workspace/pull/311",
    draft: true,
  };
  const state = {
    authorized: options.classification !== "supersedable",
    remote: "absent",
    ledger: null,
    candidate: null,
    stopUsed: false,
    configReads: 0,
    classifications: [],
    calls: { claim: 0, deliver: 0, appendRequest: 0, appendResult: 0, appendResultWrites: 0, delivered: 0, ownerTerminal: 0 },
  };
  const identity = {
    claimDigest: `sha256:${"d".repeat(64)}`,
    requestId: "request:final-publication:issue-311",
    candidateId: "candidate:final-publication:issue-311",
    sourceRef: "final-publication:issue-311",
    capturedAt: { value: "2026-08-19T20:00:00Z", provenance: "hostTrusted" },
    envelopeDigest: `sha256:${"e".repeat(64)}`,
  };
  const projection = () => ({ started: {}, terminal: state.ledger?.terminal ?? null, entries: [] });
  const createCandidate = (request) => ({
    adapterContractVersion: 2,
    adapterId: "github",
    candidateId: identity.candidateId,
    candidateKind: "communication_result",
    missionId,
    subjectId,
    revisionId: missionRevisionId,
    humanPrincipalId: null,
    bindingId: null,
    sourceRef: identity.sourceRef,
    capturedAt: identity.capturedAt,
    payload: {
      requestId: request.requestId,
      outcome: "delivered",
      failureReason: null,
      receiptRef: receipt.prUrl,
      operation: request.operation,
      targetRef: request.targetRef,
      scopeDigest: `sha256:${"f".repeat(64)}`,
      publicationBinding: {},
    },
  });
  const reconcile = () => state.remote === "delivered"
    ? { state: "delivered", receipt, publicationScope: {} }
    : state.remote === "partial"
      ? { state: "recovery_required", reason: "remote_branch_without_exact_draft" }
      : { state: "not_applied" };
  const host = {
    stableConfig: async () => {
      state.configReads += 1;
      const drifted = options.configDrift === true && state.configReads > 1;
      return { config: { repositoryId, paths: { journals: ".shield/journals" } }, bytes: drifted ? "changed" : "config", identity: "1:2:3" };
    },
    journalSnapshot: async () => ({ current: journal, bytes: "journal", sha256: `sha256:${"1".repeat(64)}` }),
    observeAndAttach: async () => {
      if (options.headDrift === true) throw new Error("Repository observation changed during exact branch attachment.");
      return { head, branch };
    },
    readGraph: async () => ({ state: "read", graph: { transitionPlan: { parentPlanPath: authority.authorizedPaths[0], exclusions: ["merge", "deploy", "release"] } } }),
    resolvePrepared: async () => state.authorized
      ? (journal.projection.communication.requests.length === 0 ? reusable : consumed)
      : { state: "publication_ready", missionId },
    git: async () => ({ stdout: "", stderr: "" }),
    claim: async () => {
      state.calls.claim += 1;
      if (state.ledger !== null) return { state: "valid", value: { state: "existing", identity, projection: projection() } };
      state.ledger = { terminal: null };
      return { state: "valid", value: { state: "claimed", capability: "claimant-capability", identity, projection: projection() } };
    },
    appendRequest: async (_root, _config, _missionId, request) => {
      state.calls.appendRequest += 1;
      if (options.journalDrift === true) throw new Error("journal compare conflict");
      journal.entries.push({ type: "communication.requested", payload: { request } });
      journal.projection.communication.requests.push({ ...request, state: "queued" });
      return journal;
    },
    appendResult: async (_root, _config, _missionId, candidate) => {
      state.calls.appendResult += 1;
      if (state.candidate !== null) {
        assert.equal(canonicalJson(candidate), canonicalJson(state.candidate));
        return;
      }
      state.calls.appendResultWrites += 1;
      state.candidate = candidate;
      const request = journal.projection.communication.requests[0];
      request.state = "delivered";
      request.candidateId = candidate.candidateId;
      request.sourceRef = candidate.sourceRef;
      request.receiptRef = candidate.payload.receiptRef;
      journal.entries.push({ type: "communication.result_recorded", payload: { candidate } });
    },
    verifyClaimant: async () => ({ state: "valid", value: projection() }),
    verifyClaimantForEffect: () => ({ state: "valid", value: projection() }),
    installEffectGuard: (_requestId, verify) => {
      assert.equal(verify(), true);
      return { state: "installed", uninstall: () => true };
    },
    createResultCandidate: (request) => ({ state: "candidate", candidate: createCandidate(request) }),
    recordDelivered: async ({ candidate }) => {
      state.calls.delivered += 1;
      if (state.ledger.terminal === null) state.ledger.terminal = { state: "delivered", receipt, candidate };
      else assert.equal(canonicalJson(candidate), canonicalJson(state.ledger.terminal.candidate));
      return { state: "valid", value: projection() };
    },
    recordOwnerTerminal: async ({ state: terminalState, reason }) => {
      state.calls.ownerTerminal += 1;
      state.ledger.terminal = { state: terminalState, reason };
      return { state: "valid", value: projection() };
    },
  };
  const dependencies = {
    host,
    reconcile,
    now: () => identity.capturedAt.value,
    onClassification: (classification) => state.classifications.push(classification),
    onCheckpoint: (checkpoint) => {
      if (options.stopAt === checkpoint && !state.stopUsed) {
        state.stopUsed = true;
        throw new FinalPublicationProcessStopV1ForTest(checkpoint);
      }
    },
    deliver: () => {
      state.calls.deliver += 1;
      state.remote = options.stopAt === "push" && !state.stopUsed ? "partial" : "delivered";
      if ((options.stopAt === "push" || options.stopAt === "pr") && !state.stopUsed) {
        state.stopUsed = true;
        throw new FinalPublicationProcessStopV1ForTest(options.stopAt);
      }
      return { state: "candidate", commands: [
        { executable: "git", args: ["push"] },
        { executable: "gh", args: ["pr", "create"] },
      ] };
    },
  };
  return { root, missionId, state, dependencies, authority };
}

function runHarness(harness, overrides = {}) {
  return runFinalPublicationTransitionV1({ repositoryRoot: harness.root, missionId: harness.missionId, baseBranch: "main" }, {
    ...harness.dependencies,
    ...overrides,
  });
}

test("complete reusable execution becomes consumed and exact retry is a no-effect byte-identical reuse", async () => {
  const harness = transitionHarness();
  const first = await runHarness(harness);
  assert.equal(first.state, "published");
  assert.equal(first.classification, "consumed");
  assert.equal(first.prUrl, "https://github.com/RanSolo/shield-workspace/pull/311");
  assert.deepEqual(harness.state.classifications, ["reusable"]);
  assert.deepEqual(harness.state.calls, {
    claim: 1, deliver: 1, appendRequest: 1, appendResult: 1, appendResultWrites: 1, delivered: 1, ownerTerminal: 0,
  });

  const resultBytes = canonicalJson(harness.state.candidate);
  const retry = await runHarness(harness);
  assert.equal(retry.state, "reused");
  assert.equal(retry.classification, "consumed");
  assert.equal(canonicalJson(harness.state.candidate), resultBytes);
  assert.equal(harness.state.calls.deliver, 1);
  assert.equal(harness.state.calls.appendRequest, 1);
  assert.equal(harness.state.calls.appendResultWrites, 1);
  assert.deepEqual(harness.state.classifications, ["reusable", "consumed"]);
});

test("supersedable execution authorizes once while Guided Review pause, cancel, and failure stop before claim", async () => {
  const successful = transitionHarness({ classification: "supersedable" });
  const published = await runHarness(successful, { authorizePreparedPublication: async () => {
    successful.state.authorized = true;
    return "authorized";
  } });
  assert.equal(published.state, "published");
  assert.deepEqual(successful.state.classifications, ["supersedable", "reusable"]);

  for (const disposition of ["pause", "cancel"]) {
    const harness = transitionHarness({ classification: "supersedable" });
    const result = await runHarness(harness, { authorizePreparedPublication: async () => "paused" });
    assert.equal(result.state, "paused", disposition);
    assert.equal(result.classification, "supersedable", disposition);
    assert.equal(harness.state.calls.claim, 0, disposition);
    assert.equal(harness.state.calls.deliver, 0, disposition);
  }

  const failed = transitionHarness({ classification: "supersedable" });
  const failure = await runHarness(failed, { authorizePreparedPublication: async () => { throw new Error("guided review failed"); } });
  assert.equal(failure.state, "recovery_required");
  assert.equal(failure.classification, "incompatible");
  assert.match(failure.reason, /guided review failed/u);
  assert.equal(failed.state.calls.claim, 0);
});

test("restart boundaries after claim, push, PR, terminal receipt, and result stay execute-once", async () => {
  for (const checkpoint of ["claim", "push", "pr", "terminal", "result"]) {
    const harness = transitionHarness({ stopAt: checkpoint });
    await assert.rejects(runHarness(harness), (error) => error instanceof FinalPublicationProcessStopV1ForTest && error.checkpoint === checkpoint, checkpoint);
    const retry = await runHarness(harness);
    if (checkpoint === "claim" || checkpoint === "push") {
      assert.equal(retry.state, "recovery_required", checkpoint);
      assert.equal(harness.state.calls.ownerTerminal, 0, checkpoint);
    } else {
      assert.ok(retry.state === "published" || retry.state === "reused", checkpoint);
      assert.equal(retry.prUrl, "https://github.com/RanSolo/shield-workspace/pull/311", checkpoint);
    }
    assert.ok(harness.state.calls.deliver <= 1, checkpoint);
    assert.ok(harness.state.calls.appendResultWrites <= 1, checkpoint);
    if (checkpoint === "terminal" || checkpoint === "result") {
      assert.ok(harness.state.calls.appendResult >= 1, checkpoint);
      assert.equal(harness.state.calls.appendResultWrites, 1, checkpoint);
    }
  }
});

test("restarted nonclaimants are readback-only until exact positive delivery is proven", async () => {
  const claimed = transitionHarness({ stopAt: "claim" });
  await assert.rejects(runHarness(claimed), FinalPublicationProcessStopV1ForTest);
  const absent = await runHarness(claimed);
  assert.equal(absent.state, "recovery_required");
  assert.equal(claimed.state.calls.deliver, 0);
  assert.equal(claimed.state.calls.ownerTerminal, 0);

  const pushed = transitionHarness({ stopAt: "push" });
  await assert.rejects(runHarness(pushed), FinalPublicationProcessStopV1ForTest);
  const partial = await runHarness(pushed);
  assert.equal(partial.state, "recovery_required");
  assert.equal(pushed.state.calls.deliver, 1);
  assert.equal(pushed.state.calls.ownerTerminal, 0);
});

test("transition-level config, journal CAS, and HEAD drift fail closed without publication", async () => {
  const config = transitionHarness({ configDrift: true });
  const configResult = await runHarness(config);
  assert.equal(configResult.state, "recovery_required");
  assert.match(configResult.reason, /configuration changed/u);
  assert.equal(config.state.calls.deliver, 0);

  const journal = transitionHarness({ journalDrift: true });
  const journalResult = await runHarness(journal);
  assert.equal(journalResult.state, "recovery_required");
  assert.match(journalResult.reason, /journal compare conflict/u);
  assert.equal(journal.state.calls.deliver, 0);

  const head = transitionHarness({ headDrift: true });
  const headResult = await runHarness(head);
  assert.equal(headResult.state, "recovery_required");
  assert.equal(headResult.classification, "incompatible");
  assert.match(headResult.reason, /observation changed/u);
  assert.equal(head.state.calls.claim, 0);
  assert.equal(head.state.calls.deliver, 0);
});
