import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION,
  claimFinalPublicationV1,
  computeFinalPublicationClaimDigestV1,
  computeFinalPublicationContentDigestV1,
  deriveFinalPublicationIdentityV1,
  readFinalPublicationReceiptLedgerV1,
  replayFinalPublicationReceiptLedgerV1,
  recordFinalPublicationDeliveredV1,
  recordFinalPublicationOwnerTerminalV1,
  verifyFinalPublicationClaimantForEffectV1,
  verifyFinalPublicationClaimantV1,
} from "../dist/final-publication-receipt-store-v1.mjs";
import { computeReviewPublicationAuthoritySemanticIdentityV1, evaluateReviewPublicationV1 } from "../dist/review-publication-v1.mjs";

const base = "1".repeat(40);
const head = "2".repeat(40);
const missionId = "mission:final-publication-store";
const paths = ["docs/missions/final.md", "packages/shield-team-system/src/final.mts"];
const effects = ["review.branch.push", "review.pull_request.create_draft"];
const capturedAt = { value: "2026-08-19T20:00:00Z", provenance: "hostTrusted" };

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "shield-final-publication-store-"));
  await mkdir(join(root, ".shield"));
  return realpath(root);
}

function authority(root) {
  return {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    authorityKind: "review.publish",
    authorityRef: "authorization:final-publication:5",
    missionId,
    subjectId: "github:RanSolo/shield-workspace/issue/311",
    missionRevisionId: "sha256:mission-final-publication",
    repositoryId: "RanSolo/shield-workspace",
    canonicalRepositoryRoot: root,
    branch: "agent/final-publication",
    baseRevisionId: base,
    headRevisionId: head,
    authorizedPaths: paths,
    permittedEffects: effects,
  };
}

function preimage(root) {
  const value = authority(root);
  const semantic = computeReviewPublicationAuthoritySemanticIdentityV1(value);
  assert.equal(semantic.state, "valid");
  return {
    schemaVersion: 1,
    contractVersion: FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION,
    missionId,
    missionRevisionId: value.missionRevisionId,
    semanticAuthorityIdentity: semantic.semanticIdentity,
    authority: value,
    repositoryId: value.repositoryId,
    branch: value.branch,
    baseRevisionId: base,
    headRevisionId: head,
    operation: "publish_mission_brief",
    targetRef: "github:repository:RanSolo/shield-workspace:branch:agent/final-publication:base:main",
    publicationAuthorizationId: value.authorityRef,
    proposedChangedPaths: paths,
    requestedEffects: effects,
    titleDigest: computeFinalPublicationContentDigestV1("Draft review"),
    bodyDigest: computeFinalPublicationContentDigestV1("Draft body"),
  };
}

function deliveredCandidate(root, identity) {
  const value = authority(root);
  const scope = evaluateReviewPublicationV1(value, {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    missionId,
    subjectId: value.subjectId,
    missionRevisionId: value.missionRevisionId,
    repositoryId: value.repositoryId,
    canonicalRepositoryRoot: root,
    branch: value.branch,
    baseRevisionId: base,
    headRevisionId: head,
    proposedChangedPaths: paths,
    observedChangedPaths: paths,
    requestedEffects: effects,
    observedSymlinkPaths: [],
    observedGitlinkPaths: [],
    workspaceClean: true,
  });
  assert.equal(scope.state, "allowed");
  const url = "https://github.com/RanSolo/shield-workspace/pull/311";
  return {
    schemaVersion: 1,
    receipt: {
      schemaVersion: 1,
      repositoryOwner: "RanSolo",
      repositoryName: "shield-workspace",
      baseBranch: "main",
      branchSlug: value.branch,
      artifactRevisionId: head,
      prNumber: 311,
      prUrl: url,
      state: "OPEN",
      isDraft: true,
    },
    candidate: {
      adapterContractVersion: 2,
      adapterId: "github",
      candidateId: identity.candidateId,
      candidateKind: "communication_result",
      missionId,
      subjectId: value.subjectId,
      revisionId: value.missionRevisionId,
      humanPrincipalId: null,
      bindingId: null,
      sourceRef: identity.sourceRef,
      capturedAt,
      payload: {
        requestId: identity.requestId,
        outcome: "delivered",
        failureReason: null,
        receiptRef: url,
        operation: "publish_mission_brief",
        targetRef: preimage(root).targetRef,
        scopeDigest: scope.scopeDigest,
        publicationBinding: scope.binding,
      },
    },
  };
}

test("claim identity is deterministic while capturedAt is stored once and claimant capability is not persisted", async () => {
  const root = await fixtureRoot();
  const claim = preimage(root);
  const claimDigest = computeFinalPublicationClaimDigestV1(claim);
  assert.deepEqual(deriveFinalPublicationIdentityV1(claimDigest, capturedAt), deriveFinalPublicationIdentityV1(claimDigest, capturedAt));

  const first = await claimFinalPublicationV1({ repositoryRoot: root, preimage: claim, capturedAt });
  assert.equal(first.state, "valid", JSON.stringify(first));
  assert.equal(first.value.state, "claimed");
  const bytes = await readFile(join(root, ".shield", "final-publication-receipts.jsonl"), "utf8");
  assert.equal(bytes.includes(first.value.capability), false);
  assert.equal(bytes.split("\n").filter(Boolean).length, 1);

  const retry = await claimFinalPublicationV1({
    repositoryRoot: root,
    preimage: claim,
    capturedAt: { value: "2026-08-19T20:01:00Z", provenance: "hostTrusted" },
  });
  assert.equal(retry.state, "valid");
  assert.equal(retry.value.state, "existing");
  assert.deepEqual(retry.value.identity, first.value.identity);

  assert.equal((await verifyFinalPublicationClaimantV1({ repositoryRoot: root, claimDigest, capability: "wrong" })).state, "invalid");
  assert.equal((await verifyFinalPublicationClaimantV1({ repositoryRoot: root, claimDigest, capability: first.value.capability })).state, "valid");
  assert.equal(verifyFinalPublicationClaimantForEffectV1({ repositoryRoot: root, claimDigest, capability: "wrong" }).state, "invalid");
  assert.equal(verifyFinalPublicationClaimantForEffectV1({ repositoryRoot: root, claimDigest, capability: first.value.capability }).state, "valid");
  const lockPath = join(root, ".shield", "final-publication-receipts.jsonl.lock");
  await writeFile(lockPath, "held");
  const contended = verifyFinalPublicationClaimantForEffectV1({ repositoryRoot: root, claimDigest, capability: first.value.capability });
  assert.equal(contended.state, "invalid");
  assert.equal(contended.code, "ledger_busy");
  await unlink(lockPath);
  const terminal = await recordFinalPublicationOwnerTerminalV1({
    repositoryRoot: root,
    claimDigest,
    capability: first.value.capability,
    state: "not_applied",
    reason: "pre_effect_failure",
  });
  assert.equal(terminal.state, "valid");
  assert.equal(terminal.value.terminal.state, "not_applied");
  assert.equal((await verifyFinalPublicationClaimantV1({ repositoryRoot: root, claimDigest, capability: first.value.capability })).state, "invalid");
  assert.equal(verifyFinalPublicationClaimantForEffectV1({ repositoryRoot: root, claimDigest, capability: first.value.capability }).state, "invalid");
});

test("positive readback may durably terminalize delivery and exact retry cannot conflict", async () => {
  const root = await fixtureRoot();
  const started = await claimFinalPublicationV1({ repositoryRoot: root, preimage: preimage(root), capturedAt });
  assert.equal(started.state, "valid", JSON.stringify(started));
  const delivery = deliveredCandidate(root, started.value.identity);
  const first = await recordFinalPublicationDeliveredV1({
    repositoryRoot: root,
    claimDigest: started.value.identity.claimDigest,
    receipt: delivery.receipt,
    candidate: delivery.candidate,
  });
  assert.equal(first.state, "valid", JSON.stringify(first));
  assert.equal(first.value.terminal.state, "delivered");
  const retry = await recordFinalPublicationDeliveredV1({
    repositoryRoot: root,
    claimDigest: started.value.identity.claimDigest,
    receipt: delivery.receipt,
    candidate: delivery.candidate,
  });
  assert.equal(retry.state, "valid");
  const conflict = await recordFinalPublicationOwnerTerminalV1({
    repositoryRoot: root,
    claimDigest: started.value.identity.claimDigest,
    capability: started.value.capability,
    state: "recovery_required",
    reason: "conflict",
  });
  assert.equal(conflict.state, "valid");
  assert.equal(conflict.value.terminal.state, "delivered");
});

test("malformed, conflicting, and unsafe ledger state fails closed", async () => {
  const root = await fixtureRoot();
  const first = await claimFinalPublicationV1({ repositoryRoot: root, preimage: preimage(root), capturedAt });
  assert.equal(first.state, "valid");
  const conflict = preimage(root);
  conflict.bodyDigest = computeFinalPublicationContentDigestV1("different");
  const second = await claimFinalPublicationV1({ repositoryRoot: root, preimage: conflict, capturedAt });
  assert.equal(second.state, "invalid");
  assert.equal(second.code, "claim_conflict");

  const unsafe = await fixtureRoot();
  await symlink(join(root, ".shield", "final-publication-receipts.jsonl"), join(unsafe, ".shield", "final-publication-receipts.jsonl"));
  const replay = await readFinalPublicationReceiptLedgerV1(unsafe);
  assert.equal(replay.state, "invalid");
  assert.equal(replay.code, "ledger_unavailable");
});

test("delivered append and replay reject every stale or foreign receipt and result envelope", async () => {
  const mutations = [
    (delivery) => delivery.receipt.repositoryOwner = "Foreign",
    (delivery) => delivery.receipt.baseBranch = "release",
    (delivery) => delivery.receipt.branchSlug = "agent/foreign",
    (delivery) => delivery.receipt.artifactRevisionId = "3".repeat(40),
    (delivery) => delivery.candidate.candidateId = "candidate:foreign",
    (delivery) => delivery.candidate.sourceRef = "source:foreign",
    (delivery) => delivery.candidate.capturedAt = { value: "2026-08-19T21:00:00Z", provenance: "hostTrusted" },
    (delivery) => delivery.candidate.missionId = "mission:foreign",
    (delivery) => delivery.candidate.subjectId = "github:RanSolo/shield-workspace/issue/999",
    (delivery) => delivery.candidate.revisionId = "sha256:foreign-revision",
    (delivery) => delivery.candidate.payload.requestId = "request:foreign",
    (delivery) => delivery.candidate.payload.targetRef = "github:repository:RanSolo/shield-workspace:branch:agent/foreign:base:main",
    (delivery) => delivery.candidate.payload.publicationBinding.headRevisionId = "4".repeat(40),
  ];
  for (const mutate of mutations) {
    const root = await fixtureRoot();
    const started = await claimFinalPublicationV1({ repositoryRoot: root, preimage: preimage(root), capturedAt });
    assert.equal(started.state, "valid");
    const delivery = structuredClone(deliveredCandidate(root, started.value.identity));
    mutate(delivery);
    const terminal = {
      schemaVersion: 1,
      contractVersion: FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION,
      sequence: 1,
      state: "delivered",
      claimDigest: started.value.identity.claimDigest,
      receipt: delivery.receipt,
      candidate: delivery.candidate,
    };
    assert.equal(replayFinalPublicationReceiptLedgerV1([started.value.projection.started, terminal]).state, "invalid");
    const appended = await recordFinalPublicationDeliveredV1({
      repositoryRoot: root,
      claimDigest: started.value.identity.claimDigest,
      receipt: delivery.receipt,
      candidate: delivery.candidate,
    });
    assert.equal(appended.state, "invalid");
  }
});
