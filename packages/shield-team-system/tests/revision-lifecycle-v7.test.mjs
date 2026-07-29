import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  createEvidenceEntry,
  createFuryReviewEntry,
  createEvidenceRequirements,
  createMissionBegunEntry,
  createReviewEvidenceRequirements,
  createReviewSubjectSupersessionEntry,
  createSupervisedMissionBrief,
  replaySupervisedMissionJournal,
} from "../dist/mission-v2.mjs";

function binding(seatId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    privateKey,
    binding: {
      schemaVersion: 1,
      bindingId: `binding:${seatId}`,
      humanPrincipalId: `human:${seatId}`,
      seatId,
      missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:maintainer",
      provenanceRef: `repository-config:${seatId}`,
    },
  };
}

function fixture(schemaVersion = 7) {
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId: "mission:revision-lifecycle-v7",
    objective: "Preserve revision-bound architecture review history.",
    subjectId: "issue:112",
    riskFlags: {
      production: false,
      destructive: false,
      migration: false,
      credentialsOrSecurity: false,
      externalCommunication: false,
      merge: false,
      deploy: false,
      release: false,
      hillHighRisk: false,
    },
    participants: ["hill", "fury", "may", "coulson", "fitz"].map((seatId) => ({ seatId })),
    activatedModes: [{ modeId: "delivery", modeVersion: "1.0.0", seatId: "hill", activationSource: "mission-brief" }],
    requireSimmons: false,
    createdAt: { value: "2026-07-28T10:00:00Z", provenance: "humanRecorded" },
  });
  const coulson = binding("coulson");
  const fitz = binding("fitz");
  const bindings = [coulson.binding, fitz.binding];
  const reviewSubject = {
    schemaVersion: 1,
    subjectKind: "repository_artifact",
    subjectId: "github:pr:112",
    revisionId: "git:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    supersedesRevisionId: null,
    sourceRef: "github:pr:112",
  };
  const begun = schemaVersion === 7
    ? createMissionBegunEntry(brief, bindings, 7, reviewSubject)
    : createMissionBegunEntry(brief, bindings, schemaVersion);
  return { brief, reviewSubject, entries: [begun], coulson, fitz };
}

function replay(entries) {
  const result = replaySupervisedMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

function furyReview(
  projection,
  verdict,
  sequence,
  revisionId = projection.reviewSubject.revisionId,
  useConstructor = true,
) {
  const review = {
    schemaVersion: 1,
    reviewId: `review:${revisionId}:${verdict}`,
    missionId: projection.missionId,
    subjectKind: "repository_artifact",
    subjectId: projection.reviewSubject.subjectId,
    revisionId,
    reviewerSeatId: "fury",
    verdict,
    reasons: verdict === "approved" ? ["architecture_conforms"] : ["revision_changes_required"],
    findings: [],
    decidedAt: { value: `2026-07-28T10:0${sequence}:00Z`, provenance: "hostTrusted" },
    provenance: {
      assuranceKind: "host_asserted_non_authoritative",
      sourceRef: `review-source:${sequence}`,
      reasoningRuntimeId: "openai:gpt-5.6-sol",
      toolExecutorId: "codex:subagent",
    },
    nextActionSeatId: verdict === "approved" ? "hill" : "may",
    draftDisposition: verdict === "approved" ? "remain_draft" : "return_to_draft",
  };
  const entry = {
    schemaVersion: 7,
    entryId: `entry:${projection.missionId}:${sequence}`,
    missionId: projection.missionId,
    sequence,
    type: verdict === "approved" ? "fury.review_approved" : "fury.review_changes_requested",
    timestamp: review.decidedAt,
    payload: { review },
  };
  if (!useConstructor) return entry;
  const created = createFuryReviewEntry(projection, review);
  assert.equal(created.state, "valid", created.errors?.join(" "));
  assert.equal(created.value.sequence, sequence);
  return created.value;
}

function signedReviewEvidence(authority, projection, requirement, sequence) {
  const payload = {
    schemaVersion: 1,
    evidenceId: `evidence:${authority.binding.seatId}:${sequence}`,
    requirementId: requirement.requirementId,
    missionId: projection.missionId,
    subjectKind: requirement.subjectKind,
    subjectId: requirement.subjectId,
    revisionId: requirement.revisionId,
    seatId: authority.binding.seatId,
    evidenceKind: requirement.evidenceKind,
    decision: "approved",
    governanceTarget: null,
    humanPrincipalId: authority.binding.humanPrincipalId,
    bindingId: authority.binding.bindingId,
    signingKeyRef: authority.binding.signingKeyRef,
    sourceRef: `github:review:${sequence}`,
    timestamp: { value: `2026-07-28T11:0${sequence}:00Z`, provenance: "humanRecorded" },
    journalSequence: sequence,
  };
  return {
    payload,
    signatureBase64: sign(
      null,
      Buffer.from(canonicalJson(payload)),
      authority.privateKey,
    ).toString("base64"),
  };
}

test("v7 begins with review-bound human requirements and waits for current-head Fury", () => {
  const { entries, reviewSubject } = fixture();
  const projection = replay(entries);

  assert.deepEqual(projection.reviewSubject, reviewSubject);
  assert.equal(projection.routeToFitz.state, "waiting");
  assert.equal(projection.routeToFitz.reviewId, null);
  assert.deepEqual(
    projection.requirements.map(({ requiredSeatId, subjectKind, revisionId }) => ({
      requiredSeatId,
      subjectKind,
      revisionId,
    })),
    [
      { requiredSeatId: "coulson", subjectKind: "mission_plan", revisionId: projection.brief.revisionId },
      { requiredSeatId: "fitz", subjectKind: "repository_artifact", revisionId: reviewSubject.revisionId },
    ],
  );
});

test("v7 preserves A history, makes A evidence stale, and requires a fresh B Fury review", () => {
  const data = fixture();
  let projection = replay(data.entries);

  data.entries.push(furyReview(projection, "changes_requested", 1));
  projection = replay(data.entries);
  assert.equal(projection.routeToFitz.state, "blocked");

  const reviewSubjectB = {
    ...data.reviewSubject,
    revisionId: "git:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    supersedesRevisionId: data.reviewSubject.revisionId,
    sourceRef: "github:pr:112:head-b",
  };
  const requirementsB = createReviewEvidenceRequirements(
    data.brief,
    reviewSubjectB,
    2,
    projection.requirements,
  );
  const supersession = createReviewSubjectSupersessionEntry(
    projection,
    reviewSubjectB,
    { value: "2026-07-28T10:02:00Z", provenance: "hostTrusted" },
  );
  assert.equal(supersession.state, "valid", supersession.errors?.join(" "));
  assert.deepEqual(supersession.value.payload.requirements, requirementsB);
  data.entries.push(supersession.value);
  projection = replay(data.entries);

  assert.equal(projection.reviewSubject.revisionId, reviewSubjectB.revisionId);
  assert.equal(projection.routeToFitz.state, "waiting");
  assert.deepEqual(projection.reviewRevisions.map(({ revisionId, lifecycle }) => [revisionId, lifecycle]), [
    [data.reviewSubject.revisionId, "stale"],
    [reviewSubjectB.revisionId, "current"],
  ]);
  assert.deepEqual(projection.furyReviews.map(({ revisionId, lifecycle }) => [revisionId, lifecycle]), [
    [data.reviewSubject.revisionId, "stale"],
  ]);
  const fitzHistory = projection.requirementHistory.filter(({ requiredSeatId }) => requiredSeatId === "fitz");
  assert.deepEqual(fitzHistory.map(({ revisionId, lifecycle }) => [revisionId, lifecycle]), [
    [data.reviewSubject.revisionId, "superseded"],
    [reviewSubjectB.revisionId, "current"],
  ]);
  assert.equal(fitzHistory[1].supersedesRequirementId, fitzHistory[0].requirementId);

  data.entries.push(furyReview(projection, "approved", 3));
  projection = replay(data.entries);
  assert.equal(projection.routeToFitz.state, "ready");
  assert.equal(projection.routeToFitz.revisionId, reviewSubjectB.revisionId);
});

test("v7 blocks Fitz before Fury and marks accepted A evidence stale after B supersedes it", () => {
  const data = fixture();
  let projection = replay(data.entries);
  let fitzRequirement = projection.requirements.find(({ requiredSeatId }) => requiredSeatId === "fitz");
  const premature = signedReviewEvidence(data.fitz, projection, fitzRequirement, 1);
  assert.equal(createEvidenceEntry(projection, premature).state, "invalid");

  data.entries.push(furyReview(projection, "approved", 1));
  projection = replay(data.entries);
  fitzRequirement = projection.requirements.find(({ requiredSeatId }) => requiredSeatId === "fitz");
  const accepted = createEvidenceEntry(
    projection,
    signedReviewEvidence(data.fitz, projection, fitzRequirement, 2),
  );
  assert.equal(accepted.state, "valid", accepted.errors?.join(" "));
  data.entries.push(accepted.value);
  projection = replay(data.entries);
  assert.equal(projection.readiness.accept.state, "ready");

  const reviewSubjectB = {
    ...data.reviewSubject,
    revisionId: "git:cccccccccccccccccccccccccccccccccccccccc",
    supersedesRevisionId: data.reviewSubject.revisionId,
    sourceRef: "github:pr:112:head-c",
  };
  const requirementsB = createReviewEvidenceRequirements(
    data.brief,
    reviewSubjectB,
    3,
    projection.requirements,
  );
  const supersession = createReviewSubjectSupersessionEntry(
    projection,
    reviewSubjectB,
    { value: "2026-07-28T11:03:00Z", provenance: "hostTrusted" },
  );
  assert.equal(supersession.state, "valid", supersession.errors?.join(" "));
  assert.deepEqual(supersession.value.payload.requirements, requirementsB);
  data.entries.push(supersession.value);
  projection = replay(data.entries);

  assert.equal(projection.readiness.accept.state, "waiting");
  assert.equal(projection.routeToFitz.state, "waiting");
  assert.deepEqual(projection.evidenceHistory.map(({ revisionId, lifecycle }) => [revisionId, lifecycle]), [
    [data.reviewSubject.revisionId, "stale"],
  ]);
});

test("v7 rejects A to B to A revision reuse before stale authority can reactivate", () => {
  const data = fixture();
  let projection = replay(data.entries);

  data.entries.push(furyReview(projection, "approved", 1));
  projection = replay(data.entries);
  const fitzRequirementA = projection.requirements.find(({ requiredSeatId }) => requiredSeatId === "fitz");
  const fitzEvidenceA = createEvidenceEntry(
    projection,
    signedReviewEvidence(data.fitz, projection, fitzRequirementA, 2),
  );
  assert.equal(fitzEvidenceA.state, "valid", fitzEvidenceA.errors?.join(" "));
  data.entries.push(fitzEvidenceA.value);
  projection = replay(data.entries);

  const reviewSubjectB = {
    ...data.reviewSubject,
    revisionId: "git:dddddddddddddddddddddddddddddddddddddddd",
    supersedesRevisionId: data.reviewSubject.revisionId,
    sourceRef: "github:pr:112:head-d",
  };
  const toB = createReviewSubjectSupersessionEntry(
    projection,
    reviewSubjectB,
    { value: "2026-07-28T11:03:00Z", provenance: "hostTrusted" },
  );
  assert.equal(toB.state, "valid", toB.errors?.join(" "));
  data.entries.push(toB.value);
  projection = replay(data.entries);
  assert.equal(projection.routeToFitz.state, "waiting");
  assert.deepEqual(projection.evidenceHistory.map(({ lifecycle }) => lifecycle), ["stale"]);
  assert.deepEqual(projection.furyReviews.map(({ lifecycle }) => lifecycle), ["stale"]);

  const reusedA = {
    ...data.reviewSubject,
    supersedesRevisionId: reviewSubjectB.revisionId,
    sourceRef: "github:pr:112:head-a-reused",
  };
  const rejected = createReviewSubjectSupersessionEntry(
    projection,
    reusedA,
    { value: "2026-07-28T11:04:00Z", provenance: "hostTrusted" },
  );
  assert.equal(rejected.state, "invalid");
  assert.equal(rejected.code, "revision_mismatch");

  const rawRequirements = createReviewEvidenceRequirements(
    data.brief,
    reusedA,
    4,
    projection.requirements,
  );
  const rawReuse = {
    schemaVersion: 7,
    entryId: `entry:${projection.missionId}:4`,
    missionId: projection.missionId,
    sequence: 4,
    type: "subject.revision_superseded",
    timestamp: { value: "2026-07-28T11:04:00Z", provenance: "hostTrusted" },
    payload: { reviewSubject: reusedA, requirements: rawRequirements },
  };
  assert.equal(replaySupervisedMissionJournal([...data.entries, rawReuse]).state, "invalid");
});

test("v7 fails closed on stale, contradictory, or malformed review lifecycle records", () => {
  const data = fixture();
  let projection = replay(data.entries);
  const stale = furyReview(
    projection,
    "approved",
    1,
    "git:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    false,
  );
  assert.equal(replaySupervisedMissionJournal([...data.entries, stale]).state, "invalid");

  data.entries.push(furyReview(projection, "approved", 1));
  projection = replay(data.entries);
  const conflicting = furyReview(
    projection,
    "changes_requested",
    2,
    projection.reviewSubject.revisionId,
    false,
  );
  assert.equal(replaySupervisedMissionJournal([...data.entries, conflicting]).state, "invalid");

  const malformed = structuredClone(fixture().entries);
  malformed[0].payload.reviewSubject.supersedesRevisionId = "git:prior";
  assert.equal(replaySupervisedMissionJournal(malformed).state, "invalid");
});

test("legacy v6 projection remains free of v7-only fields", () => {
  const { brief, entries } = fixture(6);
  const projection = replay(entries);
  assert.deepEqual(projection.requirements, createEvidenceRequirements(brief));
  for (const field of [
    "reviewSubject",
    "reviewRevisions",
    "requirementHistory",
    "evidenceHistory",
    "furyReviews",
    "routeToFitz",
  ]) {
    assert.equal(Object.hasOwn(projection, field), false);
  }
});
