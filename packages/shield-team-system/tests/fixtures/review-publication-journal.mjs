import { generateKeyPairSync, sign } from "node:crypto";

import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  createCommunicationRequestEntry,
  createGovernanceEntry,
  createMissionBegunEntry,
  createReviewPublicationAuthorizationEntry,
  createSupervisedMissionBrief,
  replaySupervisedMissionJournal,
} from "../../dist/mission-v2.mjs";
import {
  computeReviewPublicationAuthorityDigest,
} from "../../dist/review-publication-v1.mjs";

function replay(entries) {
  const result = replaySupervisedMissionJournal(entries);
  if (result.state !== "valid") {
    throw new Error(result.errors.join(" "));
  }
  return result.value;
}

function signed(privateKey, payload) {
  return {
    payload,
    signatureBase64: sign(
      null,
      Buffer.from(canonicalJson(payload)),
      privateKey,
    ).toString("base64"),
  };
}

export function publicationJournalFixture(options = {}) {
  const missionId = options.missionId ?? "mission:publication-fixture";
  const subjectId = options.subjectId ?? "issue:113";
  const headRevisionId = options.headRevisionId ??
    "0123456789012345678901234567890123456789";
  const baseRevisionId = options.baseRevisionId ??
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const repositoryId = options.repositoryId ?? "RanSolo/shield-workspace";
  const canonicalRepositoryRoot = options.canonicalRepositoryRoot ??
    "/workspace/shield-workspace";
  const branch = options.branch ?? "codex/issue-113-review-publish-scope";
  const authorizedPaths = [...(options.authorizedPaths ??
    ["docs/missions/issue-113-review.md"])].sort();
  const permittedEffects = [...(options.permittedEffects ??
    ["review.comment.publish"])].sort();
  const requestedEffects = [...(options.requestedEffects ??
    permittedEffects)].sort();
  const operation = options.operation ?? "publish_review_artifact";
  const requestId = options.requestId ?? `request:${missionId}:publication`;
  const authorizationId = options.authorizationId ??
    `authorization:${missionId}:publication`;

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({
    format: "der",
    type: "spki",
  }).toString("base64");
  const coulson = {
    schemaVersion: 1,
    bindingId: `binding:${missionId}:coulson`,
    humanPrincipalId: "human:coulson",
    seatId: "coulson",
    missionScope: missionId,
    signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:coulson",
  };
  const fitzKeys = generateKeyPairSync("ed25519");
  const fitzPublicKeySpkiBase64 = fitzKeys.publicKey.export({
    format: "der",
    type: "spki",
  }).toString("base64");
  const fitz = {
    schemaVersion: 1,
    bindingId: `binding:${missionId}:fitz`,
    humanPrincipalId: "human:fitz",
    seatId: "fitz",
    missionScope: missionId,
    signingKeyRef: computeEd25519SigningKeyRef(fitzPublicKeySpkiBase64),
    publicKeySpkiBase64: fitzPublicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:fitz",
  };
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId,
    objective: "Publish exact review artifacts under signed authority.",
    subjectId,
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
    activatedModes: [],
    requireSimmons: false,
    createdAt: {
      value: "2026-07-29T10:00:00Z",
      provenance: "humanRecorded",
    },
  });
  const reviewSubject = {
    schemaVersion: 1,
    subjectKind: "repository_artifact",
    subjectId: `github:${subjectId}`,
    revisionId: headRevisionId,
    supersedesRevisionId: null,
    sourceRef: `github:${subjectId}`,
  };
  const entries = [
    createMissionBegunEntry(brief, [coulson, fitz], 8, reviewSubject),
  ];
  let projection = replay(entries);
  const requirement = projection.requirements.find(
    ({ evidenceKind }) => evidenceKind === "mission_authorization",
  );
  if (!requirement) throw new Error("Mission authorization requirement missing.");
  const evidencePayload = {
    schemaVersion: 1,
    evidenceId: `evidence:${missionId}:coulson`,
    requirementId: requirement.requirementId,
    missionId,
    subjectKind: requirement.subjectKind,
    subjectId: requirement.subjectId,
    revisionId: requirement.revisionId,
    seatId: "coulson",
    evidenceKind: requirement.evidenceKind,
    decision: "approved",
    governanceTarget: "approved",
    humanPrincipalId: coulson.humanPrincipalId,
    bindingId: coulson.bindingId,
    signingKeyRef: coulson.signingKeyRef,
    sourceRef: `authorization:${missionId}`,
    timestamp: {
      value: "2026-07-29T10:01:00Z",
      provenance: "humanRecorded",
    },
    journalSequence: projection.lastSequence + 1,
  };
  const approved = createGovernanceEntry(
    projection,
    "approve",
    signed(privateKey, evidencePayload),
  );
  if (approved.state !== "valid") throw new Error(approved.errors.join(" "));
  entries.push(approved.value);
  projection = replay(entries);

  const authority = {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    authorityKind: options.authorityKind ?? "review.publish",
    authorityRef: authorizationId,
    missionId,
    subjectId,
    missionRevisionId: brief.revisionId,
    repositoryId,
    canonicalRepositoryRoot,
    branch,
    baseRevisionId,
    headRevisionId,
    authorizedPaths,
    permittedEffects,
  };
  const authorizationPayload = {
    schemaVersion: 1,
    authorizationId,
    authorityDigest: computeReviewPublicationAuthorityDigest(authority),
    missionId,
    subjectId,
    missionRevisionId: brief.revisionId,
    artifactRevisionId: headRevisionId,
    authorityKind: authority.authorityKind,
    previousJournalSequence: projection.lastSequence,
    journalSequence: projection.lastSequence + 1,
    humanPrincipalId: coulson.humanPrincipalId,
    humanBindingId: coulson.bindingId,
    signingKeyRef: coulson.signingKeyRef,
    sourceRef: `authorization:${missionId}:publication`,
    timestamp: {
      value: "2026-07-29T10:02:00Z",
      provenance: "humanRecorded",
    },
  };
  const authorized = createReviewPublicationAuthorizationEntry(
    projection,
    authority,
    signed(privateKey, authorizationPayload),
  );
  if (authorized.state !== "valid") {
    throw new Error(authorized.errors.join(" "));
  }
  entries.push(authorized.value);
  projection = replay(entries);

  const request = {
    requestId,
    adapterContractVersion: 2,
    adapterId: "github",
    operation,
    missionId,
    subjectId,
    revisionId: brief.revisionId,
    artifactRevisionId: headRevisionId,
    targetRef: options.targetRef ?? `github:${subjectId}`,
    publicationAuthorizationId: authorizationId,
    proposedChangedPaths: authorizedPaths,
    requestedEffects,
  };
  const requested = createCommunicationRequestEntry(
    projection,
    request,
    {
      value: "2026-07-29T10:03:00Z",
      provenance: "hostTrusted",
    },
  );
  if (requested.state !== "valid") throw new Error(requested.errors.join(" "));
  entries.push(requested.value);

  return {
    authority,
    authorization: signed(privateKey, authorizationPayload),
    entries,
    request,
    requestId,
    loadJournal: () => structuredClone(entries),
  };
}
