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
  createProfileAwareCommunicationRequestEntryV1,
  createProfileAwareGovernanceDecisionEntryV1,
  createProfileAwareImplementationAuthorityEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  createProfileAwareReviewPublicationAuthorizationEntryV1,
  createProfileAwareRuntimeBindingRecordedEntryV1,
  MISSION_130_JOURNAL_DIGEST,
  replayProfileAwareMissionJournal,
} from "../../dist/profile-aware-mission-v1.mjs";
import {
  computeReviewPublicationAuthorityDigest,
} from "../../dist/review-publication-v1.mjs";
import {
  computeImplementationAuthorityDigest,
  computeRuntimeBindingDigest,
  computeSchema9RuntimeBindingDigest,
} from "../../dist/implementation-authority-v1.mjs";

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
  const schemaVersion = options.schemaVersion ?? 8;
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
  const requestId = options.requestId ?? (schemaVersion === 9
    ? `request:${missionId}:review-publish:${options.prePublicationRuntime === true ? 5 : 3}`
    : `request:${missionId}:publication`);
  const authorizationId = options.authorizationId ??
    (schemaVersion === 9
      ? `authorization:${missionId}:review-publish:${options.prePublicationRuntime === true ? 4 : 2}`
      : `authorization:${missionId}:publication`);

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
  if (schemaVersion === 9) {
    const brief = createProfileAwareMissionBrief({
      schemaVersion: 2,
      missionId,
      objective: "Publish exact review artifacts under signed schema-9 authority.",
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
      participants: ["hill", "may", "coulson"].map((seatId) => ({ seatId })),
      activatedModes: [],
      requireSimmons: false,
      createdAt: { value: "2026-07-29T10:00:00Z", provenance: "humanRecorded" },
      profileId: "standard",
      profileVersion: 1,
      requiredExecutionGateRoleIds: ["coulson"],
      requiredFinalAcceptanceGateRoleIds: ["coulson"],
      predecessorMissionId: "mission:issue-130",
      predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
    });
    const entries = [createProfileAwareMissionBegunEntry(brief, [coulson])];
    let replayed = replayProfileAwareMissionJournal(entries);
    if (replayed.state !== "valid") throw new Error(replayed.errors.join(" "));
    let projection = replayed.value;
    const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
    if (!requirement) throw new Error("Mission authorization requirement missing.");
    const evidencePayload = {
      schemaVersion: 1,
      evidenceId: `evidence:${missionId}:coulson`,
      requirementId: requirement.requirementId,
      missionId,
      revisionId: brief.revisionId,
      seatId: "coulson",
      evidenceKind: "mission_authorization",
      decision: "approved",
      humanPrincipalId: coulson.humanPrincipalId,
      bindingId: coulson.bindingId,
      signingKeyRef: coulson.signingKeyRef,
      sourceRef: `authorization:${missionId}`,
      timestamp: { value: "2026-07-29T10:01:00Z", provenance: "humanRecorded" },
      journalSequence: 1,
    };
    entries.push(createProfileAwareGovernanceDecisionEntryV1({
      projection,
      trustedBindings: [coulson],
      evidence: signed(privateKey, evidencePayload),
    }));
    replayed = replayProfileAwareMissionJournal(entries);
    if (replayed.state !== "valid") throw new Error(replayed.errors.join(" "));
    projection = replayed.value;
    if (options.prePublicationRuntime === true) {
      const authorityPayload = {
        schemaVersion: 1,
        contractVersion: "implementation-authority.v1",
        authorityKind: "wheels_up",
        authorityRef: `authority:${missionId}:2`,
        missionId,
        subjectId,
        seatId: "may",
        missionRevisionId: brief.revisionId,
        artifactRevisionId: headRevisionId,
        repositoryId,
        canonicalWritableRoot: canonicalRepositoryRoot,
        branch,
        baseRevision: baseRevisionId,
        headRevision: headRevisionId,
        modelId: "model:publication-fixture",
        approvedRelativePaths: [...authorizedPaths],
        approvedActionIds: ["action:implement"],
        approvedEffectClasses: ["behavioral_implementation", "verification"],
        approvedEffectKeys: ["effect:implementation", "effect:validation"],
        approvedCapabilities: ["filesystem_write"],
        validationCommandIds: ["validation:test"],
        journalSequence: 2,
        humanPrincipalId: coulson.humanPrincipalId,
        humanBindingId: coulson.bindingId,
        signingKeyRef: coulson.signingKeyRef,
        sourceRef: `fixture:${missionId}:implementation-authority:2`,
        evidenceRef: `evidence:${missionId}:implementation-authority:2`,
        timestamp: { value: "2026-07-29T10:02:00Z", provenance: "humanRecorded" },
      };
      entries.push(createProfileAwareImplementationAuthorityEntryV1({
        projection,
        trustedBindings: [coulson],
        authority: signed(privateKey, authorityPayload),
      }));
      replayed = replayProfileAwareMissionJournal(entries);
      if (replayed.state !== "valid") throw new Error(replayed.errors.join(" "));
      projection = replayed.value;
      const runtime = {
        bindingSchemaVersion: 1,
        bindingId: `binding:${missionId}:may:1`,
        bindingVersion: 1,
        missionId,
        subjectId,
        missionRevisionId: brief.revisionId,
        seatId: "may",
        reasoningRuntimeId: "runtime:publication-fixture",
        toolExecutorId: "executor:publication-fixture",
        repositoryId,
        canonicalWritableRoot: canonicalRepositoryRoot,
        branch,
        artifactRevisionId: headRevisionId,
        recordedAtSequence: 3,
        activeThroughSequence: null,
        lifecycleState: "active",
        approvedScope: {
          actionIds: [...authorityPayload.approvedActionIds],
          effectClasses: [...authorityPayload.approvedEffectClasses],
          effectKeys: [...authorityPayload.approvedEffectKeys],
          capabilities: [...authorityPayload.approvedCapabilities],
        },
        coulsonAuthorizationRef: `authorization:${missionId}:runtime-binding:3`,
      };
      const wrapper = {
        schemaVersion: 1,
        binding: runtime,
        implementationAuthorityRef: authorityPayload.authorityRef,
        implementationAuthorityDigest: computeImplementationAuthorityDigest(authorityPayload),
        implementationAuthoritySequence: 2,
        approvedRelativePaths: [...authorityPayload.approvedRelativePaths],
        validationCommandIds: [...authorityPayload.validationCommandIds],
        modelId: authorityPayload.modelId,
        baseRevision: baseRevisionId,
        headRevision: headRevisionId,
      };
      const runtimeAuthorization = {
        schemaVersion: 1,
        authorizationId: runtime.coulsonAuthorizationRef,
        missionId,
        subjectId,
        seatId: "may",
        bindingId: runtime.bindingId,
        bindingVersion: 1,
        priorBindingId: null,
        priorBindingVersion: null,
        bindingDigest: computeRuntimeBindingDigest(runtime),
        schema9BindingDigest: computeSchema9RuntimeBindingDigest(wrapper),
        artifactRevisionId: headRevisionId,
        decision: "approved",
        previousJournalSequence: 2,
        journalSequence: 3,
        humanPrincipalId: coulson.humanPrincipalId,
        humanBindingId: coulson.bindingId,
        signingKeyRef: coulson.signingKeyRef,
        sourceRef: `fixture:${missionId}:runtime-binding:3`,
        timestamp: { value: "2026-07-29T10:03:00Z", provenance: "humanRecorded" },
      };
      entries.push(createProfileAwareRuntimeBindingRecordedEntryV1({
        projection,
        trustedBindings: [coulson],
        binding: wrapper,
        authorization: signed(privateKey, runtimeAuthorization),
      }));
      replayed = replayProfileAwareMissionJournal(entries);
      if (replayed.state !== "valid") throw new Error(replayed.errors.join(" "));
      projection = replayed.value;
    }
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
      timestamp: { value: `2026-07-29T10:0${projection.lastSequence + 1}:00Z`, provenance: "humanRecorded" },
    };
    const authorization = signed(privateKey, authorizationPayload);
    entries.push(createProfileAwareReviewPublicationAuthorizationEntryV1({
      projection,
      trustedBindings: [coulson],
      authority,
      authorization,
    }));
    replayed = replayProfileAwareMissionJournal(entries);
    if (replayed.state !== "valid") throw new Error(replayed.errors.join(" "));
    projection = replayed.value;
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
    entries.push(createProfileAwareCommunicationRequestEntryV1({
      projection,
      request,
      timestamp: { value: `2026-07-29T10:0${projection.lastSequence + 1}:00Z`, provenance: "hostTrusted" },
    }));
    return {
      authority,
      authorization,
      entries,
      request,
      requestId,
      signAuthorizationPayload: (payload) => signed(privateKey, payload),
      loadJournal: () => structuredClone(entries),
    };
  }
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
    signAuthorizationPayload: (payload) => signed(privateKey, payload),
    loadJournal: () => structuredClone(entries),
  };
}

export function appendPublicationAuthorizationFixtureEntry(fixture, entries, overrides = {}) {
  const schemaVersion = entries[0]?.schemaVersion;
  const replayed = schemaVersion === 9
    ? replayProfileAwareMissionJournal(entries)
    : replaySupervisedMissionJournal(entries);
  if (replayed.state !== "valid") throw new Error(replayed.errors.join(" "));
  const projection = replayed.value;
  const sequence = projection.lastSequence + 1;
  const authority = {
    ...fixture.authority,
    authorityRef: `authorization:${projection.missionId}:review-publish:${sequence}`,
    ...overrides,
  };
  const payload = {
    ...fixture.authorization.payload,
    authorizationId: authority.authorityRef,
    authorityDigest: computeReviewPublicationAuthorityDigest(authority),
    artifactRevisionId: authority.headRevisionId,
    authorityKind: authority.authorityKind,
    previousJournalSequence: projection.lastSequence,
    journalSequence: sequence,
    sourceRef: `fixture:publication-authorization:${sequence}`,
    timestamp: {
      value: `2026-07-29T10:${String(sequence).padStart(2, "0")}:00Z`,
      provenance: "humanRecorded",
    },
  };
  const authorization = fixture.signAuthorizationPayload(payload);
  const entry = schemaVersion === 9
    ? createProfileAwareReviewPublicationAuthorizationEntryV1({
      projection,
      trustedBindings: entries[0].payload.trustedBindings,
      authority,
      authorization,
    })
    : createReviewPublicationAuthorizationEntry(projection, authority, authorization).value;
  if (!entry) throw new Error("Publication authorization fixture entry was rejected.");
  entries.push(entry);
  return { authority, authorization, entry };
}
