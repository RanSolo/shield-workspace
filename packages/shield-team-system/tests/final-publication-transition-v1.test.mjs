import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  classifyFinalPublicationCanonicalStateV1ForTest,
  observeFinalPublicationWorktreeV1ForTest,
  runFinalPublicationTransitionV1,
} from "../dist/final-publication-transition-v1.mjs";
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
