import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { runGovernedMayDispatchStepV1 } from "../dist/governed-may-dispatch-v1.mjs";
import { runMayControlLoop } from "../scripts/model/may-tool-executor.mjs";
import {
  computeMayPlannedOperationsDigestV1,
  computeMayPlannedOperationsSequenceEffectKeyV1,
  computeMayPlannedToolEffectKeyV1,
} from "../dist/may-tool-effect-v1.mjs";
import {
  computeImplementationAuthorityDigest,
  computeSchema9RuntimeBindingDigest,
} from "../dist/implementation-authority-v1.mjs";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  computeRuntimeBindingDigest,
} from "../dist/mission-v2.mjs";
import {
  appendProfileAwareMissionEntryV1,
  initializeProfileAwareMissionJournalV1,
  readMissionJournalForDisplay,
} from "../dist/mission-store.mjs";
import {
  createProfileAwareGovernanceDecisionEntryV1,
  createProfileAwareImplementationAuthorityEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  createProfileAwareRuntimeBindingRecordedEntryV1,
  MISSION_130_JOURNAL_DIGEST,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";
import { deriveMissionCycleIdentityV1 } from "../dist/mission-runtime-v1.mjs";
import { deriveFuryPlanReviewEvidenceV1 } from "../dist/fury-plan-review-evidence-v1.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
  replaySeatDispatchReceiptsV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";

const execFile = promisify(execFileCallback);

const certification = Object.freeze({
  certificationId: "deterministic-mission-compilation-stage-a-certification.v1",
  certificationCommit: "5fce3051d774c3315eeb86445f6d3724e630cf9b",
  experimentId: "deterministic-mission-compilation-v2",
  compilerId: "shield-compiler@0.1.0-experiment",
  validatorId: "shield-dispatch-validator@0.1.0-experiment",
  rendererId: "canonical-chat-v1",
  targetProfileId: "codex-text.v0",
  registryId: "shield-dispatch-registry.v0",
  frozenDigests: Object.freeze({
    compilerSourceTreeSha256: "4d5d2e21178f1f8edee61b162a8fa3e4df82cd83d04eeb51efa9906887ae5e5f",
    validatorSourceTreeSha256: "eee02a6c9dca56c781382ffe6a7d7e161e993f8a4baa8566064512f914f4abaa",
    rendererSpecSha256: "d05a8331ed11356bac5bd438c186efc53e9e51db3ef42026a02080d6a40b57d0",
    registrySha256: "57aecedb7a4f8740a6cc7328e334d5c8e1fea5b8620e692310ca3b170c52ce33",
    targetProfileSha256: "7f032f5f2db1f7b73d249252510622dd3e8acd2daf5e72c7a788f3cb2c4e8d8a",
  }),
});

const FIXTURE_MISSION_REVISION = `sha256:${"A".repeat(43)}`;
const FIXTURE_PLANNED_OPERATIONS = Object.freeze([
  Object.freeze({
    toolName: "writeFile",
    path: "packages/shield-team-system/fixture-output.txt",
    content: "fixture output\n",
    precondition: Object.freeze({ kind: "absent" }),
  }),
  Object.freeze({
    toolName: "runValidation",
    commandId: "validation:test",
    executable: process.execPath,
    args: Object.freeze(["--test"]),
    timeoutMs: 30_000,
    executableIdentity: "1:2:33261:100:2000",
  }),
]);
const FIXTURE_CYCLE_IDENTITY = deriveMissionCycleIdentityV1({
  repositoryRoot: "/tmp/shield-governed-may",
  configuredJournalPath: ".shield/missions",
  missionId: "mission:issue-170",
  expectedSubjectId: "github:issue-170",
  expectedRevisionId: FIXTURE_MISSION_REVISION,
  expectedSequence: 4,
  seatId: "may",
  actionId: "repository.write_file",
  effectClass: "behavioral_implementation",
  validationId: "validation:test",
  activatedModes: [],
  actionAllowlist: ["repository.run_validation", "repository.write_file"],
});
const FIXTURE_OPERATION_EFFECT_KEYS = FIXTURE_PLANNED_OPERATIONS.map(computeMayPlannedToolEffectKeyV1);

function threeWriteFixtureOperations({ present = false } = {}) {
  return Object.freeze([
    ...["one", "two", "three"].map((name, index) => Object.freeze({
      toolName: "writeFile",
      path: `packages/shield-team-system/${name}.txt`,
      content: `${name}\n`,
      precondition: present
        ? Object.freeze({ kind: "present", regularFileIdentity: `1:2:33261:${index + 1}:2000:3000`, sha256: "0".repeat(64) })
        : Object.freeze({ kind: "absent" }),
    })),
    FIXTURE_PLANNED_OPERATIONS[1],
  ]);
}

function projectionForPlannedOperations(operations) {
  const projection = validProjection();
  const authority = projection.implementationAuthority;
  const operationEffectKeys = operations.map(computeMayPlannedToolEffectKeyV1);
  const sequenceEffectKey = computeMayPlannedOperationsSequenceEffectKeyV1(operations);
  const approvedEffectKeys = [FIXTURE_CYCLE_IDENTITY.effectKey, ...operationEffectKeys, ...(sequenceEffectKey === null ? [] : [sequenceEffectKey])].sort();
  const approvedRelativePaths = operations.slice(0, -1).map(({ path }) => path).sort();
  const nextAuthority = { ...authority, approvedRelativePaths, approvedEffectKeys };
  const currentWrapper = projection.activeRuntimeBindings[0];
  const binding = { ...currentWrapper.binding, approvedScope: { ...currentWrapper.binding.approvedScope, effectKeys: [...approvedEffectKeys] } };
  const wrapper = {
    ...currentWrapper,
    binding,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(nextAuthority),
    approvedRelativePaths: [...approvedRelativePaths],
  };
  return {
    projection: {
      ...projection,
      implementationAuthority: nextAuthority,
      implementationAuthorityDigest: computeImplementationAuthorityDigest(nextAuthority),
      runtimeBindings: [wrapper],
      activeRuntimeBindings: [wrapper],
    },
    operationEffectKeys,
    sequenceEffectKey,
  };
}

function validAuthority() {
  return {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: "authority:issue-170:may",
    missionId: "mission:issue-170",
    subjectId: "github:issue-170",
    seatId: "may",
    missionRevisionId: FIXTURE_MISSION_REVISION,
    artifactRevisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    repositoryId: "RanSolo/shield-workspace",
    canonicalWritableRoot: "/tmp/shield-governed-may",
    branch: "agent/issue-170",
    baseRevision: "sha256:base_issue_170",
    headRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    modelId: "model:ornith",
    approvedRelativePaths: [FIXTURE_PLANNED_OPERATIONS[0].path],
    approvedActionIds: ["repository.run_validation", "repository.write_file"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: [FIXTURE_CYCLE_IDENTITY.effectKey, ...FIXTURE_OPERATION_EFFECT_KEYS].sort(),
    approvedCapabilities: ["filesystem_write", "process_execute"],
    validationCommandIds: ["validation:test"],
    journalSequence: 2,
    humanPrincipalId: "human:coulson",
    humanBindingId: "binding:coulson",
    signingKeyRef: `ed25519:sha256:${"a".repeat(43)}`,
    sourceRef: "source:wheels-up",
    evidenceRef: "evidence:wheels-up",
    timestamp: { value: "2026-08-03T20:00:00Z", provenance: "humanRecorded" },
  };
}

function validProjection(overrides = {}) {
  const authority = validAuthority();
  const bindingWrapper = {
    schemaVersion: 1,
    binding: {
      bindingSchemaVersion: 1,
      bindingId: "binding:issue-170:may",
      bindingVersion: 1,
      missionId: authority.missionId,
      subjectId: authority.subjectId,
      missionRevisionId: authority.missionRevisionId,
      seatId: "may",
      reasoningRuntimeId: "runtime:local-may",
      toolExecutorId: "executor:shield",
      repositoryId: authority.repositoryId,
      canonicalWritableRoot: authority.canonicalWritableRoot,
      branch: authority.branch,
      artifactRevisionId: authority.artifactRevisionId,
      recordedAtSequence: 3,
      activeThroughSequence: null,
      lifecycleState: "active",
      approvedScope: {
        actionIds: [...authority.approvedActionIds],
        effectClasses: [...authority.approvedEffectClasses],
        effectKeys: [...authority.approvedEffectKeys],
        capabilities: [...authority.approvedCapabilities],
      },
      coulsonAuthorizationRef: "authorization:runtime-binding:1",
    },
    implementationAuthorityRef: authority.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authority),
    implementationAuthoritySequence: authority.journalSequence,
    approvedRelativePaths: [...authority.approvedRelativePaths],
    validationCommandIds: [...authority.validationCommandIds],
    modelId: authority.modelId,
    baseRevision: authority.baseRevision,
    headRevision: authority.headRevision,
  };
  return {
    schemaVersion: 9,
    missionId: authority.missionId,
    brief: { subjectId: authority.subjectId, revisionId: authority.missionRevisionId, activatedModes: [] },
    authorization: "authorized",
    execution: "not-started",
    effects: [],
    implementationAuthority: authority,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authority),
    implementationAuthorityState: "authorized",
    runtimeBindings: [bindingWrapper],
    activeRuntimeBindings: [bindingWrapper],
    lastSequence: 4,
    ...overrides,
  };
}

async function durableProfileAwareDispatchFixture() {
  const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-governed-may-durable-")));
  const configuredJournalPath = ".shield/missions";
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const trusted = {
    schemaVersion: 1,
    bindingId: "binding:coulson",
    humanPrincipalId: "human:coulson",
    seatId: "coulson",
    missionScope: "*",
    signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:coulson",
  };
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId: "mission:issue-170",
    objective: "Prove a durable schema-9 dispatch handoff without invoking May.",
    subjectId: "github:issue-170",
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: false,
      externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: ["hill", "may", "coulson"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-04T00:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const entries = [createProfileAwareMissionBegunEntry(brief, [trusted])];
  let projection = replayProfileAwareMissionJournal(entries).value;
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const evidencePayload = {
    schemaVersion: 1,
    evidenceId: "evidence:coulson:1",
    requirementId: requirement.requirementId,
    missionId: brief.missionId,
    revisionId: brief.revisionId,
    seatId: "coulson",
    evidenceKind: "mission_authorization",
    decision: "approved",
    humanPrincipalId: trusted.humanPrincipalId,
    bindingId: trusted.bindingId,
    signingKeyRef: trusted.signingKeyRef,
    sourceRef: "fixture:authorization:1",
    timestamp: { value: "2026-08-04T00:01:00Z", provenance: "humanRecorded" },
    journalSequence: 1,
  };
  entries.push(createProfileAwareGovernanceDecisionEntryV1({
    projection,
    trustedBindings: [trusted],
    evidence: {
      payload: evidencePayload,
      signatureBase64: sign(null, Buffer.from(canonicalJson(evidencePayload)), privateKey).toString("base64"),
    },
  }));
  projection = replayProfileAwareMissionJournal(entries).value;
  const cycle = deriveMissionCycleIdentityV1({
    repositoryRoot,
    configuredJournalPath,
    missionId: brief.missionId,
    expectedSubjectId: brief.subjectId,
    expectedRevisionId: brief.revisionId,
    expectedSequence: 3,
    seatId: "may",
    actionId: "repository.write_file",
    effectClass: "behavioral_implementation",
    validationId: "validation:test",
    activatedModes: [],
    actionAllowlist: ["repository.run_validation", "repository.write_file"],
  });
  const authority = {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: "authority:issue-170:durable",
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    seatId: "may",
    missionRevisionId: brief.revisionId,
    artifactRevisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    repositoryId: "RanSolo/shield-workspace",
    canonicalWritableRoot: repositoryRoot,
    branch: "agent/issue-170",
    baseRevision: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    headRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    modelId: "model:gemma",
    approvedRelativePaths: [FIXTURE_PLANNED_OPERATIONS[0].path],
    approvedActionIds: ["repository.run_validation", "repository.write_file"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: [cycle.effectKey, ...FIXTURE_OPERATION_EFFECT_KEYS].sort(),
    approvedCapabilities: ["filesystem_write", "process_execute"],
    validationCommandIds: ["validation:test"],
    journalSequence: 2,
    humanPrincipalId: trusted.humanPrincipalId,
    humanBindingId: trusted.bindingId,
    signingKeyRef: trusted.signingKeyRef,
    sourceRef: "fixture:wheels-up:2",
    evidenceRef: "evidence:wheels-up:2",
    timestamp: { value: "2026-08-04T00:02:00Z", provenance: "humanRecorded" },
  };
  entries.push(createProfileAwareImplementationAuthorityEntryV1({
    projection,
    trustedBindings: [trusted],
    authority: {
      payload: authority,
      signatureBase64: sign(null, Buffer.from(canonicalJson(authority)), privateKey).toString("base64"),
    },
  }));
  projection = replayProfileAwareMissionJournal(entries).value;
  const authorizationId = "authorization:runtime-binding:3";
  const runtimeBinding = {
    bindingSchemaVersion: 1,
    bindingId: "binding:issue-170:may",
    bindingVersion: 1,
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    missionRevisionId: brief.revisionId,
    seatId: "may",
    reasoningRuntimeId: "runtime:local-may",
    toolExecutorId: "executor:shield",
    repositoryId: authority.repositoryId,
    canonicalWritableRoot: authority.canonicalWritableRoot,
    branch: authority.branch,
    artifactRevisionId: authority.artifactRevisionId,
    recordedAtSequence: 3,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: [...authority.approvedActionIds],
      effectClasses: [...authority.approvedEffectClasses],
      effectKeys: [...authority.approvedEffectKeys],
      capabilities: [...authority.approvedCapabilities],
    },
    coulsonAuthorizationRef: authorizationId,
  };
  const wrapper = {
    schemaVersion: 1,
    binding: runtimeBinding,
    implementationAuthorityRef: authority.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authority),
    implementationAuthoritySequence: 2,
    approvedRelativePaths: [...authority.approvedRelativePaths],
    validationCommandIds: [...authority.validationCommandIds],
    modelId: authority.modelId,
    baseRevision: authority.baseRevision,
    headRevision: authority.headRevision,
  };
  const bindingAuthorization = {
    schemaVersion: 1,
    authorizationId,
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    seatId: "may",
    bindingId: runtimeBinding.bindingId,
    bindingVersion: 1,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeRuntimeBindingDigest(runtimeBinding),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(wrapper),
    artifactRevisionId: authority.artifactRevisionId,
    decision: "approved",
    previousJournalSequence: 2,
    journalSequence: 3,
    humanPrincipalId: trusted.humanPrincipalId,
    humanBindingId: trusted.bindingId,
    signingKeyRef: trusted.signingKeyRef,
    sourceRef: "fixture:runtime-binding:3",
    timestamp: { value: "2026-08-04T00:03:00Z", provenance: "humanRecorded" },
  };
  entries.push(createProfileAwareRuntimeBindingRecordedEntryV1({
    projection,
    trustedBindings: [trusted],
    binding: wrapper,
    authorization: {
      payload: bindingAuthorization,
      signatureBase64: sign(null, Buffer.from(canonicalJson(bindingAuthorization)), privateKey).toString("base64"),
    },
  }));
  const initialized = await initializeProfileAwareMissionJournalV1({ repositoryRoot, configuredJournalPath, missionId: brief.missionId, entry: entries[0] });
  assert.equal(initialized.state, "valid", initialized.errors?.join(" "));
  for (const entry of entries.slice(1)) {
    const appended = await appendProfileAwareMissionEntryV1({ repositoryRoot, configuredJournalPath, missionId: brief.missionId, entry });
    assert.equal(appended.state, "valid", appended.errors?.join(" "));
  }
  const durable = await readMissionJournalForDisplay({ repositoryRoot, configuredJournalPath, missionId: brief.missionId });
  assert.equal(durable.state, "valid", durable.errors?.join(" "));
  return { repositoryRoot, configuredJournalPath, journalPath: initialized.value.journalPath, projection: durable.value.projection };
}

function validFuryRecord(projection = validProjection(), overrides = {}) {
  const authority = projection.implementationAuthority;
  const binding = {
    schemaVersion: 1,
    missionId: authority.missionId,
    missionRevisionId: authority.missionRevisionId,
    subjectId: authority.subjectId,
    repositoryId: authority.repositoryId,
    baseBranch: "main",
    branch: authority.branch,
    prNumber: 200,
    blueprintArtifactId: "issue-170-blueprint",
    blueprintArtifactPath: "docs/missions/issue-170-plan.md",
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    artifactRevisionId: authority.artifactRevisionId,
    repositoryRevisionId: authority.headRevision,
  };
  const identity = {
    receiptId: "receipt:fury:issue-170",
    dispatchId: "dispatch:fury:issue-170",
    parentMissionId: authority.missionId,
    parentMissionRevision: authority.missionRevisionId,
    parentSessionId: "session:hill:issue-170",
    childTaskId: "task:fury:issue-170-plan-review",
    childSessionId: "session:fury:issue-170",
    accountableSeatId: "fury",
    repositoryId: authority.repositoryId,
    repositoryWorkspaceId: "workspace:issue-170",
    repositoryRevision: authority.headRevision,
    subjectId: authority.subjectId,
    subjectRevision: authority.artifactRevisionId,
    artifactId: binding.blueprintArtifactId,
    artifactRevision: authority.artifactRevisionId,
  };
  const entries = validFuryReceiptEntries(identity);
  const created = deriveFuryPlanReviewEvidenceV1({
    planGate: {
      planGateSchemaVersion: 1,
      contractVersion: "fury.plan-gate.v1",
      review: {
        reviewSchemaVersion: 1,
        contractVersion: "fury.plan-gate.v1",
        assuranceKind: "host_asserted_non_authoritative",
        reviewId: "review:issue-170:1",
        missionId: authority.missionId,
        subjectId: authority.subjectId,
        repositoryOwner: "RanSolo",
        repositoryName: "shield-workspace",
        baseBranch: binding.baseBranch,
        missionBranch: authority.branch,
        prNumber: binding.prNumber,
        blueprintArtifactId: binding.blueprintArtifactId,
        blueprintArtifactPath: binding.blueprintArtifactPath,
        blueprintArtifactKind: "implementation_blueprint",
        blueprintOwningSeatId: "may",
        reviewedRevisionId: authority.artifactRevisionId,
        verdict: "PASS",
        findings: [],
        reasoningRuntimeId: "runtime:fury-hosted",
        toolExecutorId: "executor:codex-host",
      },
      reconciliation: null,
    },
    binding,
    dispatchIdentity: identity,
    rawReceiptEntries: entries,
  });
  assert.equal(created.state, "created");
  return { ...created.evidence, ...overrides };
}

function validWorkspaceObservation(projection, furyRecord, overrides = {}) {
  const authority = projection.implementationAuthority;
  return {
    repositoryId: authority.repositoryId,
    repositoryWorkspaceId: furyRecord.furyDispatchIdentity.repositoryWorkspaceId,
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: furyRecord.baseBranch,
    branch: authority.branch,
    prNumber: furyRecord.prNumber,
    prUrl: `https://github.com/RanSolo/shield-workspace/pull/${furyRecord.prNumber}`,
    state: "OPEN",
    isDraft: true,
    baseRevision: authority.baseRevision,
    headRevision: authority.headRevision,
    ...overrides,
  };
}

function validPermissionContext(projection, decisionId) {
  const authority = projection.implementationAuthority;
  const binding = projection.activeRuntimeBindings[0].binding;
  const observedAt = "2026-08-03T20:05:00Z";
  const attestation = (kind, capabilityId, observedValue) => ({
    attestationSchemaVersion: 1,
    attestationId: `attestation:${kind}:${capabilityId ?? "root"}`,
    kind,
    hostId: "host:test",
    toolExecutorId: binding.toolExecutorId,
    repositoryId: authority.repositoryId,
    canonicalWritableRoot: authority.canonicalWritableRoot,
    capabilityId,
    observedValue,
    observedAt,
    expiresAt: observedAt,
  });
  return {
    permissionContractVersion: 1,
    journalSchemaVersion: 9,
    missionId: authority.missionId,
    subjectId: authority.subjectId,
    missionRevisionId: authority.missionRevisionId,
    artifactRevisionId: authority.artifactRevisionId,
    evaluatedThroughSequence: projection.lastSequence,
    reasoningRuntimeId: binding.reasoningRuntimeId,
    toolExecutorId: binding.toolExecutorId,
    repositoryId: authority.repositoryId,
    canonicalWritableRoot: authority.canonicalWritableRoot,
    branch: authority.branch,
    requiredCapabilities: [...binding.approvedScope.capabilities].sort(),
    activeBindings: [binding],
    attestations: [
      attestation("repository_root", null, authority.canonicalWritableRoot),
      attestation("writability", null, true),
      ...[...binding.approvedScope.capabilities].sort().map((capability) => attestation("capability", capability, true)),
    ],
    evaluatedAt: observedAt,
    decisionId,
  };
}

const validBlueprintBytes = () => new TextEncoder().encode("# Issue 170 blueprint\n");

function protocolDigest(domain, bytes) {
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return createHash("sha256").update(domain).update(length).update(bytes).digest("hex");
}

function passingHelicarrier(capture = {}) {
  return {
    certification,
    validate: (envelope, trust) => {
      capture.envelope = envelope;
      capture.trust = trust;
      return {
        state: "ok",
        value: {
          value: envelope,
          identity: {
            compilerId: certification.compilerId,
            validatorId: certification.validatorId,
            rendererId: certification.rendererId,
            targetProfileId: certification.targetProfileId,
            registryId: certification.registryId,
            frozenDigests: certification.frozenDigests,
          },
        },
      };
    },
    compile: (_validated, trust) => {
      capture.compileTrust = trust;
      const promptBytes = new TextEncoder().encode("system prompt");
      const provenanceBytes = new TextEncoder().encode("{}\n");
      const manifest = {
        compilerId: certification.compilerId,
        contextDigest: trust.expectedManifestDigests.contextDigest,
        fixtureDigest: trust.expectedManifestDigests.fixtureDigest,
        format: "compilation-manifest.v0",
        governanceDigest: trust.expectedManifestDigests.governanceDigest,
        irDigest: trust.expectedManifestDigests.irDigest,
        promptByteLength: promptBytes.byteLength,
        promptDigest: protocolDigest("shield:dispatch:prompt:v0", promptBytes),
        provenanceByteLength: provenanceBytes.byteLength,
        provenanceDigest: protocolDigest("shield:dispatch:provenance:v0", provenanceBytes),
        registryDigest: trust.expectedManifestDigests.registryDigest,
        rendererDigest: trust.expectedManifestDigests.rendererDigest,
        rendererId: certification.rendererId,
        targetProfileDigest: trust.expectedManifestDigests.targetProfileDigest,
        targetProfileId: certification.targetProfileId,
      };
      if (typeof capture.mutateManifest === "function") capture.mutateManifest(manifest);
      return {
        state: "ok",
        value: {
          promptBytes,
          provenanceBytes,
          manifestBytes: new TextEncoder().encode(`${JSON.stringify(manifest)}\n`),
        },
      };
    },
  };
}

function claimedPacket(input, priorEntries = []) {
  const claimKey = createHash("sha256").update(new TextEncoder().encode(
    `seat-dispatch-claim-v1\0${input.parentMissionId}\0${input.parentSessionId}\0${input.packetId}`,
  )).digest("base64url").slice(0, 32);
  const packetDigest = `sha256:${createHash("sha256").update(input.packetBytes).digest("base64url")}`;
  const started = createSeatDispatchStartedEventV1({
    receiptId: `receipt:${claimKey}`,
    dispatchId: `dispatch:${claimKey}`,
    parentMissionId: input.parentMissionId,
    parentMissionRevision: input.parentMissionRevision,
    parentSessionId: input.parentSessionId,
    childTaskId: `task:${claimKey}`,
    childSessionId: `session:${claimKey}`,
    accountableSeatId: input.accountableSeatId,
    repositoryId: input.repositoryId,
    repositoryWorkspaceId: input.repositoryWorkspaceId,
    repositoryRevision: input.repositoryRevision,
    subjectId: input.subjectId,
    subjectRevision: input.subjectRevision,
    artifactId: input.artifactId,
    artifactRevision: input.artifactRevision,
    configuredRuntime: input.configuredRuntime,
    requestedRuntime: input.requestedRuntime,
    toolExecution: input.toolExecution,
    runtimeSelfReport: input.runtimeSelfReport,
    runtimeHostObserved: input.runtimeHostObserved,
    executorSelfReport: input.executorSelfReport,
    executorHostObserved: input.executorHostObserved,
    inputEvidenceRefs: [...input.inputEvidenceRefs, `evidence:packet-binding:seat-dispatch-v1:${claimKey}:${packetDigest}`],
    timestamp: input.startedAt,
    logSequence: priorEntries.length,
    previousLogDigest: priorEntries.at(-1)?.entryDigest ?? null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
  const replay = replaySeatDispatchReceiptsV1([...priorEntries, started]);
  assert.equal(replay.state, "valid");
  const receipt = replay.projections.find(({ receiptId }) => receiptId === started.receiptId);
  assert.ok(receipt);
  return {
    started,
    state: "valid",
    value: {
      logPath: "/tmp/dispatch-receipts.jsonl",
      byteLength: 1,
      packetDigest,
      receipt,
      claimStatus: "claimed",
      executionDisposition: "execute_once",
    },
  };
}

function validFuryReceiptEntries(identity) {
  const shared = {
    ...identity,
    configuredRuntime: { kind: "runtime.configured", runtimeId: "runtime:fury-hosted", model: "gpt-5.6-sol" },
    requestedRuntime: { kind: "runtime.requested", runtimeId: "runtime:fury-hosted", model: "gpt-5.6-sol" },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:fury:tools" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: {
      kind: "runtime.host_observed",
      runtimeId: "runtime:fury-hosted",
      model: "gpt-5.6-sol",
      evidenceRefs: ["host:fury:runtime"],
    },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: {
      kind: "executor.host_observed",
      executorId: "executor:codex-host",
      evidenceRefs: ["host:fury:executor"],
    },
  };
  const started = createSeatDispatchStartedEventV1({
    ...shared,
    inputEvidenceRefs: ["artifact:issue-170-blueprint"],
    timestamp: "2026-08-03T18:00:00Z",
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
  const completed = createSeatDispatchLifecycleEventV1({
    ...shared,
    kind: "dispatch.completed",
    outputEvidenceRefs: ["review:issue-170:pass"],
    timestamp: "2026-08-03T18:00:01Z",
    logSequence: 1,
    previousLogDigest: started.entryDigest,
    lifecycleSequence: 1,
    previousLifecycleDigest: started.entryDigest,
  });
  return [started, completed];
}

function validFuryLedger(records) {
  return {
    state: "valid",
    value: {
      ledgerPath: "/tmp/shield-governed-may/.shield/audit/fury-plan-reviews/issue-170.jsonl",
      records,
      bytes: "",
      missing: records.length === 0,
    },
  };
}

function validDispatchLedger(record, entries = validFuryReceiptEntries(record.furyDispatchIdentity)) {
  const replay = replaySeatDispatchReceiptsV1(entries);
  assert.equal(replay.state, "valid");
  return {
    state: "valid",
    value: {
      logPath: "/tmp/shield-governed-may/.shield/dispatch-receipts.jsonl",
      entries,
      projections: replay.projections,
    },
  };
}

function governedMayReceiptEntries({ projection, furyRecord, packetId, parentSessionId, originalSequence, terminalState = null, dispatchEnvelopeDigest = null, packetDigest = null, plannedOperations = FIXTURE_PLANNED_OPERATIONS }) {
  const authority = projection.implementationAuthority;
  const baseEntries = validFuryReceiptEntries(furyRecord.furyDispatchIdentity);
  const claimKey = createHash("sha256").update(new TextEncoder().encode(
    `seat-dispatch-claim-v1\0${authority.missionId}\0${parentSessionId}\0${packetId}`,
  )).digest("base64url").slice(0, 32);
  const shared = {
    receiptId: `receipt:${claimKey}`,
    dispatchId: `dispatch:${claimKey}`,
    parentMissionId: authority.missionId,
    parentMissionRevision: authority.missionRevisionId,
    parentSessionId,
    childTaskId: `task:${claimKey}`,
    childSessionId: `session:${claimKey}`,
    accountableSeatId: "may",
    repositoryId: authority.repositoryId,
    repositoryWorkspaceId: furyRecord.furyDispatchIdentity.repositoryWorkspaceId,
    repositoryRevision: authority.headRevision,
    subjectId: authority.subjectId,
    subjectRevision: authority.artifactRevisionId,
    artifactId: furyRecord.blueprintArtifactId,
    artifactRevision: furyRecord.artifactRevisionId,
    configuredRuntime: { kind: "runtime.configured", runtimeId: "runtime:local-may", model: authority.modelId },
    requestedRuntime: { kind: "runtime.requested", runtimeId: "runtime:local-may", model: authority.modelId },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:issue-170:may" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: {
      kind: "runtime.host_observed",
      runtimeId: "runtime:local-may",
      model: authority.modelId,
      evidenceRefs: ["host:may:runtime"],
    },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: {
      kind: "executor.host_observed",
      executorId: "executor:shield",
      evidenceRefs: ["host:may:executor"],
    },
  };
  const started = createSeatDispatchStartedEventV1({
    ...shared,
    inputEvidenceRefs: [
      `evidence:governed-may-original-sequence:${originalSequence}`,
      authority.authorityRef,
      furyRecord.evidenceId,
      `evidence:packet-binding:seat-dispatch-v1:${claimKey}:${packetDigest ?? `sha256:${"B".repeat(43)}`}`,
    ],
    timestamp: "2026-08-03T18:00:02Z",
    logSequence: 2,
    previousLogDigest: baseEntries[1].entryDigest,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
  if (terminalState === null) return [...baseEntries, started];
  const operationEffectKeys = plannedOperations.map(computeMayPlannedToolEffectKeyV1);
  const sequenceEffectKey = computeMayPlannedOperationsSequenceEffectKeyV1(plannedOperations);
  const terminal = createSeatDispatchLifecycleEventV1({
    ...shared,
    kind: `dispatch.${terminalState}`,
    outputEvidenceRefs: [
      `may-control:${shared.childSessionId}`,
      FIXTURE_CYCLE_IDENTITY.cycleId,
      FIXTURE_CYCLE_IDENTITY.effectKey,
      ...operationEffectKeys,
      ...(sequenceEffectKey === null ? [] : [sequenceEffectKey]),
      `evidence:may-planned-operations:${computeMayPlannedOperationsDigestV1(plannedOperations)}`,
      `evidence:may-dispatch-envelope:${dispatchEnvelopeDigest}`,
    ],
    timestamp: "2026-08-03T18:00:03Z",
    logSequence: 3,
    previousLogDigest: started.entryDigest,
    lifecycleSequence: 1,
    previousLifecycleDigest: started.entryDigest,
  });
  return [...baseEntries, started, terminal];
}

function validInput() {
  return {
    repositoryRoot: "/tmp/shield-governed-may",
    configuredJournalPath: ".shield/missions",
    missionId: "mission:issue-170",
    hostId: "host:test",
  };
}

function validDependencies(callCounts, overrides = {}) {
  let claimed;
  let terminalProjection;
  let missionCompletion;
  let auditEntries = [];
  let controlReadback = { orderedEvents: [], terminalState: { state: "none" } };
  const readMissionJournalOverride = overrides.readMissionJournal;
  const readDispatchReceiptsOverride = overrides.readDispatchReceipts;
  const runMissionCycleOverride = overrides.runMissionCycle;
  const appendDispatchReceiptOverride = overrides.appendDispatchReceipt;
  const remainingOverrides = { ...overrides };
  delete remainingOverrides.readMissionJournal;
  delete remainingOverrides.readDispatchReceipts;
  delete remainingOverrides.runMissionCycle;
  delete remainingOverrides.appendDispatchReceipt;
  const sentinel = (name) => (..._args) => {
    callCounts[name] = (callCounts[name] ?? 0) + 1;
    throw new Error(`unexpected dependency call: ${name}`);
  };
  return {
    observeDeliveryWorkspace: sentinel("observeDeliveryWorkspace"),
    observeMayToolPreflight: async ({ plannedToolOperations }) => structuredClone(plannedToolOperations),
    readTrackedFile: sentinel("readTrackedFile"),
    readWorkspaceStatus: async () => [],
    loadPermissionContext: async (input) => ({
      state: "ready",
      context: validPermissionContext(validProjection({ lastSequence: input.plan.evaluatedThroughSequence }), input.expectedDecisionId),
    }),
    schema9HostOps: {
      realpath: sentinel("realpath"),
      access: sentinel("access"),
      execFile: sentinel("execFile"),
      probeCapability: sentinel("probeCapability"),
      now: () => "2026-08-03T20:06:00Z",
    },
    helicarrier: {
      certification,
      validate: sentinel("helicarrier.validate"),
      compile: sentinel("helicarrier.compile"),
    },
    plannedToolOperations: structuredClone(FIXTURE_PLANNED_OPERATIONS),
    validationCommands: [{
      commandId: "validation:test",
      executable: process.execPath,
      args: ["--test"],
      timeoutMs: 30_000,
    }],
    mayControlBaseUrl: "http://127.0.0.1:1234",
    runMayControlLoop: sentinel("runMayControlLoop"),
    createPermissionAuditStore: () => ({
      ledgerId: "permission-audit:test",
      read: async () => ({ entries: structuredClone(auditEntries), bytes: "", missing: false }),
      appendIfAbsent: async (record) => {
        auditEntries.push(structuredClone(record));
        return { schemaVersion: 1, ledgerId: record.ledgerId, recordId: record.recordId, decisionId: record.decisionId, digest: record.digest, appended: true, ledgerSequence: auditEntries.length - 1 };
      },
    }),
    createMayControlEventStore: () => ({
      sessionId: "session:may-control:test",
      read: async () => structuredClone(controlReadback),
      appendControlEvent: async (event) => {
        controlReadback.orderedEvents.push(structuredClone(event));
        if (event.code === "may_control_completed") controlReadback.terminalState = { state: "terminal", code: event.code };
        return { eventId: event.eventId, appended: true };
      },
    }),
    readMissionJournal: async (input) => {
      const read = await (readMissionJournalOverride ?? sentinel("readMissionJournal"))(input);
      if (!missionCompletion || read.state !== "valid" || read.value.kind !== "profile-aware") return read;
      return {
        ...read,
        value: {
          ...read.value,
          projection: {
            ...read.value.projection,
            lastSequence: missionCompletion.sequence,
            effects: [{ cycleId: missionCompletion.cycleId, effectKey: missionCompletion.effectKey }],
          },
        },
      };
    },
    appendMissionEntry: sentinel("appendMissionEntry"),
    readFuryEvidence: sentinel("readFuryEvidence"),
    readDispatchReceipts: async (input) => {
      const read = await (readDispatchReceiptsOverride ?? sentinel("readDispatchReceipts"))(input);
      if (read.state !== "valid" || terminalProjection === undefined) return read;
      return { ...read, value: { ...read.value, projections: [...read.value.projections, terminalProjection] } };
    },
    claimDispatchPacket: async (input) => {
      const result = claimedPacket(input);
      claimed = result.started;
      return result;
    },
    appendDispatchReceipt: appendDispatchReceiptOverride ?? (async ({ event }) => {
      assert.ok(claimed);
      const replay = replaySeatDispatchReceiptsV1([
        claimed,
        event,
      ]);
      assert.equal(replay.state, "valid");
      const result = {
        state: "valid",
        value: {
          logPath: "/tmp/dispatch-receipts.jsonl",
          byteLength: 2,
          entries: replay.entries,
          projections: replay.projections,
          receipt: replay.projections[0],
        },
      };
      terminalProjection = result.value.receipt;
      return result;
    }),
    runMissionCycle: async (input, dependencies) => {
      const result = runMissionCycleOverride === undefined
        ? (() => {
      const identity = deriveMissionCycleIdentityV1(input);
      return {
        outcome: "advanced",
        missionId: input.missionId,
        subjectId: input.expectedSubjectId,
        revisionId: input.expectedRevisionId,
        sequence: input.expectedSequence + 1,
        accountableNextSeat: "hill",
        cycleId: identity.cycleId,
        effectKey: identity.effectKey,
      };
          })()
        : await runMissionCycleOverride(input, dependencies);
      if (result.outcome === "advanced") {
        missionCompletion = result;
        const binding = validProjection().activeRuntimeBindings[0].binding;
        const shared = {
          missionId: input.missionId,
          subjectId: input.expectedSubjectId,
          seatId: "may",
          reasoningRuntimeId: binding.reasoningRuntimeId,
          toolExecutorId: binding.toolExecutorId,
          bindingId: binding.bindingId,
          effectKey: result.effectKey,
          decisionId: `decision:test:${result.cycleId}`,
        };
        auditEntries.push(
          { ...shared, recordType: "permission.decision", outcome: "allow" },
          { ...shared, recordType: "tool.invocation", outcome: "allow" },
          { ...shared, recordType: "tool.result", outcome: "completed" },
        );
        const sessionId = claimed.childSessionId;
        if (controlReadback.orderedEvents.length === 0) {
          controlReadback = {
            orderedEvents: [
              { sessionId, code: "may_control_started" },
              { sessionId, code: "may_control_completed" },
            ],
            terminalState: { state: "terminal", code: "may_control_completed" },
          };
        }
      }
      return result;
    },
    ...remainingOverrides,
  };
}

async function simulateExactMayControl(request, dependencies, onContext = () => {}) {
  await dependencies.appendControlEvent({ eventId: `event:${request.sessionId}:1`, sessionId: request.sessionId, code: "may_control_started", toolCallId: null });
  const specifications = [
    { toolCallId: "call:write:1", toolName: "writeFile", code: "may_control_writeFile_completed", actionId: "repository.write_file", effectClass: "behavioral_implementation", effectKey: FIXTURE_OPERATION_EFFECT_KEYS[0] },
    { toolCallId: "call:validation:1", toolName: "runValidation", code: "may_control_runValidation_completed", actionId: "repository.run_validation", effectClass: "verification", effectKey: FIXTURE_OPERATION_EFFECT_KEYS[1] },
  ];
  for (let index = 0; index < specifications.length; index += 1) {
    const specification = specifications[index];
    const plan = await dependencies.nextCallSlot(specification);
    const context = await dependencies.getAuthorizationContext(plan);
    onContext(context, index);
    const executionContext = await dependencies.getExecutionContext({ decisionId: context.decisionId });
    const authorizationEvidenceRefs = context.attestations.map(({ attestationId }) => attestationId).sort();
    const executionEvidenceRefs = executionContext.attestations.map(({ attestationId }) => attestationId).sort();
    for (const [recordType, outcome, evidenceRefs] of [
      ["permission.decision", "allow", authorizationEvidenceRefs],
      ["tool.invocation", "allow", executionEvidenceRefs],
      ["tool.result", "completed", executionEvidenceRefs],
    ]) {
      await dependencies.appendIfAbsent({
        recordId: `record:${index}:${recordType}`,
        decisionId: context.decisionId,
        recordType,
        outcome,
        actionId: specification.actionId,
        effectClass: specification.effectClass,
        effectKey: specification.effectKey,
        evidenceRefs,
      });
    }
    await dependencies.appendControlEvent({ eventId: `event:${request.sessionId}:${index + 2}`, sessionId: request.sessionId, code: specification.code, toolCallId: specification.toolCallId });
  }
  await dependencies.appendControlEvent({ eventId: `event:${request.sessionId}:4`, sessionId: request.sessionId, code: "may_control_completed", toolCallId: null });
  return { message: "bounded May packet complete", attribution: "untrusted_model_output", completedToolCalls: 2, writeCalls: 1, validationCalls: 1, releasedBytes: 0 };
}

async function runExecutingMissionCycle(input, dependencies, onExecution = () => {}) {
  const identity = deriveMissionCycleIdentityV1(input);
  const plan = {
    runnerContractVersion: 1,
    cycleId: identity.cycleId,
    missionId: input.missionId,
    subjectId: input.expectedSubjectId,
    revisionId: input.expectedRevisionId,
    evaluatedThroughSequence: input.expectedSequence,
    seatId: input.seatId,
    activatedModes: input.activatedModes,
    actionId: input.actionId,
    effectClass: input.effectClass,
    effectKey: identity.effectKey,
    validationId: input.validationId,
    stopCondition: "after_one_cycle",
  };
  const execution = await dependencies.executeTool(plan);
  onExecution(execution);
  if (execution.outcome !== "completed") {
    return { outcome: "blocked", missionId: input.missionId, subjectId: input.expectedSubjectId, revisionId: input.expectedRevisionId, sequence: input.expectedSequence, accountableNextSeat: "hill", reasonCode: "gate_missing" };
  }
  return { outcome: "advanced", missionId: input.missionId, subjectId: input.expectedSubjectId, revisionId: input.expectedRevisionId, sequence: input.expectedSequence + 1, accountableNextSeat: "hill", cycleId: identity.cycleId, effectKey: identity.effectKey };
}

test("rejects invalid input before inspecting hostile dependencies", async () => {
  const dependencies = Object.create(null);
  Object.defineProperty(dependencies, "observeDeliveryWorkspace", {
    enumerable: true,
    get() {
      throw new Error("dependencies must not be inspected");
    },
  });

  const result = await runGovernedMayDispatchStepV1({}, dependencies);

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "input_invalid");
});

test("rejects invalid dependencies after valid input", async () => {
  const result = await runGovernedMayDispatchStepV1(validInput(), {});

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "dependencies_invalid");
});

test("returns journal_invalid when the mission journal read throws", async () => {
  const callCounts = {};
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
    readMissionJournal: async () => {
      callCounts.readMissionJournal = (callCounts.readMissionJournal ?? 0) + 1;
      throw new Error("unavailable");
    },
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.readiness, "indeterminate");
  assert.equal(result.code, "journal_invalid");
  assert.equal(callCounts.readMissionJournal, 1);
});

test("preserves a validated invalid journal result", async () => {
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "invalid", code: "schema_mixed", errors: ["mixed journal"] }),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.readiness, "indeterminate");
  assert.equal(result.code, "schema_mixed");
  assert.deepEqual(result.errors, ["mixed journal"]);
});

test("rejects a non-profile-aware journal before other dependencies", async () => {
  const callCounts = {};
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "supervised", entries: [], projection: {} } }),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.readiness, "indeterminate");
  assert.equal(result.code, "schema_unsupported");
  assert.deepEqual(callCounts, {});
});

test("completes one exact governed dispatch after a valid profile-aware journal", async () => {
  const callCounts = {};
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  let trackedRead;
  const helicarrierCapture = {};

  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async (input) => {
      trackedRead = input;
      return validBlueprintBytes();
    },
    helicarrier: passingHelicarrier(helicarrierCapture),
  }));

  assert.deepEqual(trackedRead, {
    repositoryRoot: "/tmp/shield-governed-may",
    revision: projection.implementationAuthority.headRevision,
    relativePath: "docs/missions/issue-170-plan.md",
  });
  assert.equal(helicarrierCapture.envelope.repositoryRoot, projection.implementationAuthority.canonicalWritableRoot);
  assert.equal(helicarrierCapture.envelope.stopCondition, "after_one_cycle");
  assert.deepEqual(helicarrierCapture.envelope.outputContract, ["changed_files", "tests_run", "unresolved_risks"]);
  assert.deepEqual(helicarrierCapture.envelope.plannedToolOperations, FIXTURE_PLANNED_OPERATIONS);
  assert.deepEqual(helicarrierCapture.envelope.plannedToolOperationEffectKeys, FIXTURE_OPERATION_EFFECT_KEYS);
  assert.equal(helicarrierCapture.trust.blueprintBytesBase64, Buffer.from(validBlueprintBytes()).toString("base64"));
  assert.equal(helicarrierCapture.compileTrust, helicarrierCapture.trust);

  assert.equal(result.state, "completed");
  assert.equal(result.readiness, "dispatch_ready");
  assert.equal(result.evidence.authorityRef, "authority:issue-170:may");
  assert.equal(result.evidence.bindingId, "binding:issue-170:may");
  assert.equal(result.evidence.furyEvidenceId, furyRecord.evidenceId);
  assert.equal(result.evidence.furyPlanDigest, furyRecord.planDigest);
  assert.equal(result.evidence.originalSequence, 4);
  assert.equal(result.evidence.terminalState, "completed");
  assert.equal(result.evidence.missionSequence, 5);
  assert.match(result.evidence.packetId, /^packet:governed-may:[A-Za-z0-9_-]{43}$/);
  assert.match(result.evidence.parentSessionId, /^session:governed-may:[A-Za-z0-9_-]{32}$/);
  assert.match(result.evidence.blueprintDigest, /^sha256:[A-Za-z0-9_-]{43}$/);
  assert.match(result.evidence.dispatchEnvelopeDigest, /^sha256:[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(callCounts, {});
});

test("legacy envelope and packet digests match the predecessor vector and replay its terminal receipt", async () => {
  const predecessorEnvelopeAndPacketDigest = "sha256:Gv0cRIlg5akLuKn9yBmZyI5OrkHUlmuJ4Hz0VlVszds";
  const predecessorPacketId = "packet:governed-may:kUFxwJgMBcM3rXUlww9OSoMQlQoo76TN_IalxTFD5dg";
  const projection = validProjection({ lastSequence: 4 });
  const furyRecord = validFuryRecord(projection);
  const helicarrierCapture = {};
  const fresh = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(helicarrierCapture),
  }));

  assert.equal(Object.hasOwn(helicarrierCapture.envelope, "plannedToolOperationsSequenceEffectKey"), false);
  assert.equal(fresh.evidence.dispatchEnvelopeDigest, predecessorEnvelopeAndPacketDigest);
  assert.equal(fresh.evidence.packetId, predecessorPacketId);
  const entries = governedMayReceiptEntries({
    projection,
    furyRecord,
    packetId: predecessorPacketId,
    parentSessionId: fresh.evidence.parentSessionId,
    originalSequence: 4,
    terminalState: "completed",
    dispatchEnvelopeDigest: predecessorEnvelopeAndPacketDigest,
    packetDigest: predecessorEnvelopeAndPacketDigest,
  });
  const started = entries.find(({ kind, accountableSeatId }) => kind === "dispatch.started" && accountableSeatId === "may");
  assert.ok(started.inputEvidenceRefs.some((ref) => ref.endsWith(`:${predecessorEnvelopeAndPacketDigest}`)));
  const advancedProjection = { ...projection, lastSequence: 5, implementationAuthorityState: "revoked", activeRuntimeBindings: [] };
  const replayed = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection: advancedProjection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord, entries),
    readTrackedFile: async () => validBlueprintBytes(),
    validationCommands: [],
    observeDeliveryWorkspace: async () => { throw new Error("predecessor replay must not observe live workspace"); },
    observeMayToolPreflight: async () => { throw new Error("predecessor replay must not observe live tool state"); },
    runMayControlLoop: async () => { throw new Error("predecessor replay must not invoke model or executor"); },
    helicarrier: {
      certification,
      validate: () => { throw new Error("predecessor replay must not recompile"); },
      compile: () => { throw new Error("predecessor replay must not recompile"); },
    },
  }));
  assert.equal(replayed.state, "replayed", JSON.stringify(replayed));
  assert.equal(replayed.evidence.dispatchEnvelopeDigest, predecessorEnvelopeAndPacketDigest);
});

test("derives stable dispatch identities and rejects an unscoped advanced cycle", async () => {
  async function runAtSequence(lastSequence) {
    const projection = validProjection({ lastSequence });
    const furyRecord = validFuryRecord(projection);
    return runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord),
      observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
      readTrackedFile: async () => validBlueprintBytes(),
      helicarrier: passingHelicarrier(),
    }));
  }

  const first = await runAtSequence(4);
  const replay = await runAtSequence(4);
  const next = await runAtSequence(5);
  assert.equal(first.state, "completed");
  assert.equal(first.evidence.packetId, replay.evidence.packetId);
  assert.equal(first.evidence.parentSessionId, replay.evidence.parentSessionId);
  assert.equal(next.state, "blocked");
  assert.equal(next.code, "runner_plan_invalid");
});

test("invokes exactly one Helicarrier-bound May packet through the mission cycle", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  let mayCalls = 0;
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    runMayControlLoop: async (request, dependencies) => {
      mayCalls += 1;
      assert.equal(request.systemPrompt, "system prompt");
      assert.equal(request.userPrompt, "");
      assert.equal(request.model, projection.implementationAuthority.modelId);
      assert.equal(
        dependencies.nextTemporaryName({ sessionId: request.sessionId, toolCallId: "call:write:1" }),
        `.shield-may-${createHash("sha256").update(`shield:may-temporary:v1\0${request.sessionId}\0call:write:1`).digest("base64url")}.tmp`,
      );
      return simulateExactMayControl(request, dependencies);
    },
    runMissionCycle: async (input, dependencies) => {
      const identity = deriveMissionCycleIdentityV1(input);
      const plan = {
        runnerContractVersion: 1,
        cycleId: identity.cycleId,
        missionId: input.missionId,
        subjectId: input.expectedSubjectId,
        revisionId: input.expectedRevisionId,
        evaluatedThroughSequence: input.expectedSequence,
        seatId: input.seatId,
        activatedModes: input.activatedModes,
        actionId: input.actionId,
        effectClass: input.effectClass,
        effectKey: identity.effectKey,
        validationId: input.validationId,
        stopCondition: "after_one_cycle",
      };
      const execution = await dependencies.executeTool(plan);
      assert.equal(execution.outcome, "completed");
      return {
        outcome: "advanced",
        missionId: input.missionId,
        subjectId: input.expectedSubjectId,
        revisionId: input.expectedRevisionId,
        sequence: input.expectedSequence + 1,
        accountableNextSeat: "hill",
        cycleId: identity.cycleId,
        effectKey: identity.effectKey,
      };
    },
  }));

  assert.equal(result.state, "completed");
  assert.equal(mayCalls, 1);
});

test("runs a three-file dispatch through the production control loop and real executor", async (context) => {
  const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-governed-may-production-")));
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const relativePaths = ["fixture-one.txt", "fixture-two.txt", "fixture-three.txt"].map((name) => `packages/shield-team-system/${name}`);
  const targetDirectory = join(repositoryRoot, "packages/shield-team-system");
  await mkdir(targetDirectory, { recursive: true });
  const git = async (args) => (await execFile("git", args, { cwd: repositoryRoot, encoding: "utf8" })).stdout.trim();
  await git(["init", "-b", "main"]);
  await writeFile(join(repositoryRoot, "base.txt"), "base\n", "utf8");
  await git(["add", "base.txt"]);
  await git(["-c", "user.name=shield", "-c", "user.email=shield@example.invalid", "commit", "-m", "fixture base"]);
  const baseRevision = await git(["rev-parse", "HEAD"]);
  await writeFile(join(repositoryRoot, "head.txt"), "head\n", "utf8");
  await git(["add", "head.txt"]);
  await git(["-c", "user.name=shield", "-c", "user.email=shield@example.invalid", "commit", "-m", "fixture head"]);
  const headRevision = await git(["rev-parse", "HEAD"]);
  const executable = await realpath(process.execPath);
  const executableInfo = await stat(executable);
  const contents = ["fixture one\n", "fixture two\n", "fixture three\n"];
  const validationScript = "const f=require('fs');for(const n of['one','two','three'])if(f.readFileSync('packages/shield-team-system/fixture-'+n+'.txt','utf8')!=='fixture '+n+'\\n')process.exit(2)";
  const plannedOperations = [
    ...relativePaths.map((path, index) => ({ toolName: "writeFile", path, content: contents[index], precondition: { kind: "absent" } })),
    {
      toolName: "runValidation",
      commandId: "validation:test",
      executable,
      args: ["-e", validationScript],
      timeoutMs: 30_000,
      executableIdentity: `${executableInfo.dev}:${executableInfo.ino}:${executableInfo.mode}:${executableInfo.size}:${executableInfo.mtimeMs}`,
    },
  ];
  const baseProjection = validProjection();
  const baseAuthority = baseProjection.implementationAuthority;
  const cycleIdentity = deriveMissionCycleIdentityV1({
    repositoryRoot,
    configuredJournalPath: ".shield/missions",
    missionId: baseAuthority.missionId,
    expectedSubjectId: baseAuthority.subjectId,
    expectedRevisionId: baseAuthority.missionRevisionId,
    expectedSequence: baseProjection.lastSequence,
    seatId: "may",
    actionId: "repository.write_file",
    effectClass: "behavioral_implementation",
    validationId: "validation:test",
    activatedModes: [],
    actionAllowlist: ["repository.run_validation", "repository.write_file"],
  });
  const operationEffectKeys = plannedOperations.map(computeMayPlannedToolEffectKeyV1);
  const sequenceEffectKey = computeMayPlannedOperationsSequenceEffectKeyV1(plannedOperations);
  assert.ok(sequenceEffectKey);
  const authority = {
    ...baseAuthority,
    artifactRevisionId: headRevision,
    canonicalWritableRoot: repositoryRoot,
    branch: "main",
    baseRevision,
    headRevision,
    approvedRelativePaths: [...relativePaths].sort(),
    approvedEffectKeys: [cycleIdentity.effectKey, ...operationEffectKeys, sequenceEffectKey].sort(),
  };
  const baseWrapper = baseProjection.activeRuntimeBindings[0];
  const binding = {
    ...baseWrapper.binding,
    artifactRevisionId: headRevision,
    canonicalWritableRoot: repositoryRoot,
    branch: "main",
    approvedScope: {
      ...baseWrapper.binding.approvedScope,
      effectKeys: [...authority.approvedEffectKeys],
    },
  };
  const wrapper = {
    ...baseWrapper,
    binding,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authority),
    approvedRelativePaths: [...relativePaths].sort(),
    baseRevision,
    headRevision,
  };
  const projection = {
    ...baseProjection,
    implementationAuthority: authority,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authority),
    runtimeBindings: [wrapper],
    activeRuntimeBindings: [wrapper],
  };
  const furyRecord = validFuryRecord(projection);
  const responses = [
    {
      models: [{
        key: authority.modelId,
        loaded_instances: [{ id: binding.reasoningRuntimeId }],
        capabilities: { trained_for_tool_use: true },
      }],
    },
    ...relativePaths.map((path, index) => ({
      choices: [{ message: { role: "assistant", content: null, tool_calls: [{
        id: `call:write:production:${index + 1}`,
        type: "function",
        function: { name: "writeFile", arguments: JSON.stringify({ path, content: contents[index], expectedSha256: "absent" }) },
      }] } }],
    })),
    {
      choices: [{ message: { role: "assistant", content: null, tool_calls: [{
        id: "call:validation:production",
        type: "function",
        function: { name: "runValidation", arguments: JSON.stringify({ commandId: "validation:test" }) },
      }] } }],
    },
    { choices: [{ message: { role: "assistant", content: "Production control fixture completed." } }] },
  ];
  let fetchCalls = 0;
  const helicarrierCapture = {};
  const productionDependencies = validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    readWorkspaceStatus: async () => {
      const status = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
      return status === "" ? [] : status.split("\n").map((line) => line.slice(3)).sort();
    },
    loadPermissionContext: async (input) => ({
      state: "ready",
      context: validPermissionContext({ ...projection, lastSequence: input.plan.evaluatedThroughSequence }, input.expectedDecisionId),
    }),
    schema9HostOps: {
      realpath: async (value) => value,
      access: async () => undefined,
      execFile: async (command, args, options) => (await execFile(command, args, { ...options, encoding: "utf8" })).stdout,
      probeCapability: async () => true,
      now: () => "2026-08-03T20:06:00Z",
    },
    helicarrier: passingHelicarrier(helicarrierCapture),
    plannedToolOperations: plannedOperations,
    validationCommands: [{ commandId: "validation:test", executable, args: ["-e", validationScript], timeoutMs: 30_000 }],
    runMayControlLoop,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "content-type": "application/json" } });
    },
    runMissionCycle: runExecutingMissionCycle,
  });
  const dispatchInput = { ...validInput(), repositoryRoot };
  const result = await runGovernedMayDispatchStepV1(dispatchInput, productionDependencies);

  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.deepEqual(await Promise.all(relativePaths.map((path) => readFile(join(repositoryRoot, path), "utf8"))), contents);
  assert.equal(await git(["rev-parse", "HEAD"]), headRevision);
  assert.deepEqual((await git(["status", "--porcelain=v1", "--untracked-files=all"])).split("\n"), relativePaths.map((path) => `?? ${path}`).sort());
  assert.deepEqual((await readdir(targetDirectory)).filter((name) => /^\.shield-may-[A-Za-z0-9_-]{8,64}\.tmp$/u.test(name)), []);
  assert.equal(fetchCalls, 6);
  assert.deepEqual(authority.approvedRelativePaths, [...relativePaths].sort());
  assert.ok(authority.approvedEffectKeys.includes(sequenceEffectKey));
  assert.ok(binding.approvedScope.effectKeys.includes(sequenceEffectKey));
  assert.equal(helicarrierCapture.envelope.plannedToolOperationsSequenceEffectKey, sequenceEffectKey);
  assert.ok(result.evidence.plannedToolOperationEffectKeys.every((key, index) => key === operationEffectKeys[index]));
});

test("narrows each May tool call to one capability and its exact three attestations", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  const observed = [];
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    runMayControlLoop: (request, dependencies) => simulateExactMayControl(request, dependencies, (context) => {
      observed.push(structuredClone(context));
    }),
    runMissionCycle: runExecutingMissionCycle,
  }));

  assert.equal(result.state, "completed");
  assert.deepEqual(observed.map(({ requiredCapabilities }) => requiredCapabilities), [["filesystem_write"], ["process_execute"]]);
  assert.deepEqual(observed.map(({ attestations }) => attestations.map(({ kind }) => kind).sort()), [
    ["capability", "repository_root", "writability"],
    ["capability", "repository_root", "writability"],
  ]);
  assert.deepEqual(observed.map(({ activeBindings }) => activeBindings[0].approvedScope.capabilities), [
    ["filesystem_write", "process_execute"],
    ["filesystem_write", "process_execute"],
  ]);
});

test("accepts fresh execution attestations that differ from authorization attestations", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  let contextReads = 0;
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    loadPermissionContext: async (input) => {
      contextReads += 1;
      const context = validPermissionContext(validProjection({ lastSequence: input.plan.evaluatedThroughSequence }), input.expectedDecisionId);
      return {
        state: "ready",
        context: {
          ...context,
          attestations: context.attestations.map((attestation) => ({
            ...attestation,
            attestationId: `${attestation.attestationId}:observation-${contextReads}`,
          })),
        },
      };
    },
    runMayControlLoop: simulateExactMayControl,
    runMissionCycle: runExecutingMissionCycle,
  }));

  assert.equal(result.state, "completed");
  assert.ok(contextReads >= 6);
});

test("validation-only control completion cannot advance the governed mission", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  let executionOutcome;
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    runMayControlLoop: async () => ({ message: "validation only", attribution: "untrusted_model_output", completedToolCalls: 1, writeCalls: 0, validationCalls: 1, releasedBytes: 0 }),
    runMissionCycle: (input, dependencies) => runExecutingMissionCycle(input, dependencies, (execution) => { executionOutcome = execution.outcome; }),
  }));

  assert.equal(executionOutcome, "failed");
  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "mission_cycle_unproven");
});

test("duplicate write completion cannot advance the governed mission", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  let executionOutcome;
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    runMayControlLoop: async () => ({ message: "duplicate write", attribution: "untrusted_model_output", completedToolCalls: 3, writeCalls: 2, validationCalls: 1, releasedBytes: 0 }),
    runMissionCycle: (input, dependencies) => runExecutingMissionCycle(input, dependencies, (execution) => { executionOutcome = execution.outcome; }),
  }));

  assert.equal(executionOutcome, "failed");
  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "mission_cycle_unproven");
});

test("planned-byte and live-preflight drift fail before claim or model invocation", async () => {
  for (const kind of ["authority", "live"]) {
    const projection = validProjection();
    const furyRecord = validFuryRecord(projection);
    let claims = 0;
    let modelCalls = 0;
    const changed = structuredClone(FIXTURE_PLANNED_OPERATIONS);
    changed[0].content = "changed bytes\n";
    const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord),
      observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
      readTrackedFile: async () => validBlueprintBytes(),
      helicarrier: passingHelicarrier(),
      ...(kind === "authority"
        ? { plannedToolOperations: changed }
        : { observeMayToolPreflight: async () => changed }),
      claimDispatchPacket: async () => { claims += 1; throw new Error("must not claim"); },
      runMayControlLoop: async () => { modelCalls += 1; throw new Error("must not invoke"); },
    }));
    assert.equal(result.state, "blocked");
    assert.ok(result.code === "planned_authority_invalid" || result.code === "planned_preflight_invalid");
    assert.equal(claims, 0);
    assert.equal(modelCalls, 0);
  }
});

test("multi-write authority binds order and regular-file identity in both signed layers", async () => {
  const operations = threeWriteFixtureOperations({ present: true });
  const { projection, sequenceEffectKey } = projectionForPlannedOperations(operations);
  const furyRecord = validFuryRecord(projection);
  assert.ok(sequenceEffectKey);
  assert.ok(projection.implementationAuthority.approvedEffectKeys.includes(sequenceEffectKey));
  assert.ok(projection.activeRuntimeBindings[0].binding.approvedScope.effectKeys.includes(sequenceEffectKey));

  const variants = [
    [operations[1], operations[0], operations[2], operations[3]],
    (() => {
      const changed = structuredClone(operations);
      changed[0].precondition.regularFileIdentity = "1:2:33261:1:2000:3001";
      return changed;
    })(),
  ];
  for (const plannedToolOperations of variants) {
    let claims = 0;
    const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord),
      observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
      readTrackedFile: async () => validBlueprintBytes(),
      helicarrier: passingHelicarrier(),
      plannedToolOperations,
      claimDispatchPacket: async () => { claims += 1; throw new Error("must not claim"); },
    }));
    assert.equal(result.state, "blocked");
    assert.equal(result.code, "planned_authority_invalid");
    assert.equal(claims, 0);
  }
});

test("records a safe failed terminal when workspace freshness drifts after claim", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  let observations = 0;
  let cycleCalls = 0;
  let mayCalls = 0;
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => {
      observations += 1;
      return validWorkspaceObservation(projection, furyRecord, observations === 1 ? {} : { headRevision: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
    },
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    runMayControlLoop: async () => { mayCalls += 1; throw new Error("must not run"); },
    runMissionCycle: async () => { cycleCalls += 1; throw new Error("must not run"); },
  }));

  assert.equal(result.state, "failed", JSON.stringify(result));
  assert.equal(result.evidence.terminalState, "failed");
  assert.equal(cycleCalls, 0);
  assert.equal(mayCalls, 0);
});

test("preserves a nonterminal recovery state when the mission cycle throws", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  let terminalAppends = 0;
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    runMissionCycle: async () => { throw new Error("uncertain effect"); },
    appendDispatchReceipt: async () => { terminalAppends += 1; throw new Error("must not append"); },
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "mission_cycle_invalid");
  assert.equal(terminalAppends, 0);
});

test("blocks malformed tracked blueprint bytes before Helicarrier", async () => {
  const invalidBlueprints = [new Uint8Array(), "# caller prose"];
  if (typeof SharedArrayBuffer === "function") {
    invalidBlueprints.push(new Uint8Array(new SharedArrayBuffer(8)));
  }

  for (const blueprint of invalidBlueprints) {
    const projection = validProjection();
    const furyRecord = validFuryRecord(projection);
    const callCounts = {};
    const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord),
      observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
      readTrackedFile: async () => blueprint,
    }));

    assert.equal(result.state, "blocked");
    assert.equal(result.code, "blueprint_invalid");
    assert.equal(callCounts["helicarrier.validate"], undefined);
  }
});

test("blocks when an authorized validation command is absent from the trusted registry", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  const callCounts = {};
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
    validationCommands: [],
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
  }));

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "planned_preflight_invalid");
  assert.equal(callCounts["helicarrier.validate"], undefined);
});

test("blocks an extra trusted validation command before model invocation", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  let modelCalls = 0;
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    validationCommands: [
      { commandId: "validation:test", executable: process.execPath, args: ["--test"], timeoutMs: 30_000 },
      { commandId: "validation:extra", executable: process.execPath, args: ["--version"], timeoutMs: 30_000 },
    ],
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    runMayControlLoop: async () => { modelCalls += 1; throw new Error("must not invoke"); },
  }));

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "planned_preflight_invalid");
  assert.equal(modelCalls, 0);
});

test("blocks before claim when Helicarrier rejects the derived envelope", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  const callCounts = {};
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: {
      certification,
      validate: () => ({ state: "invalid", reason: "INVALID_CANDIDATE" }),
      compile: () => { throw new Error("compile must not run"); },
    },
  }));

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "helicarrier_invalid");
  assert.equal(callCounts.claimDispatchPacket, undefined);
});

test("blocks a Helicarrier manifest whose prompt binding is stale", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  const callCounts = {};
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier({ mutateManifest: (manifest) => { manifest.promptDigest = "0".repeat(64); } }),
  }));

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "helicarrier_invalid");
  assert.equal(callCounts.claimDispatchPacket, undefined);
});

test("blocks a Helicarrier manifest whose semantic digest bindings are stale", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier({ mutateManifest: (manifest) => { manifest.irDigest = "0".repeat(64); } }),
  }));

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "helicarrier_invalid");
});

test("keeps a completed claim nonterminal when exact runtime readbacks are absent", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  let terminalAppends = 0;
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    createPermissionAuditStore: () => ({ ledgerId: "permission-audit:test", read: async () => ({ entries: [] }), appendIfAbsent: async () => ({ state: "appended" }) }),
    appendDispatchReceipt: async () => { terminalAppends += 1; throw new Error("must not append"); },
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "preterminal_readback_invalid");
  assert.equal(terminalAppends, 0);
});

test("does not convert a preexisting mission effect into a failed terminal", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  let terminalAppends = 0;
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    runMissionCycle: async (input) => ({
      outcome: "complete",
      missionId: input.missionId,
      subjectId: input.expectedSubjectId,
      revisionId: input.expectedRevisionId,
      sequence: input.expectedSequence,
      accountableNextSeat: "hill",
      reasonCode: "complete",
    }),
    appendDispatchReceipt: async () => { terminalAppends += 1; throw new Error("must not append"); },
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "mission_cycle_unproven");
  assert.equal(terminalAppends, 0);
});

test("blocks stale permission context and out-of-scope dirty paths before claim", async () => {
  for (const override of [
    {
      loadPermissionContext: async (input) => {
        const projection = validProjection({ lastSequence: input.plan.evaluatedThroughSequence });
        return { state: "ready", context: { ...validPermissionContext(projection, input.expectedDecisionId), branch: "agent/stale" } };
      },
    },
    { readWorkspaceStatus: async () => ["README.md"] },
  ]) {
    const projection = validProjection();
    const furyRecord = validFuryRecord(projection);
    const callCounts = {};
    const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord),
      observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
      readTrackedFile: async () => validBlueprintBytes(),
      helicarrier: passingHelicarrier(),
      ...override,
    }));

    assert.equal(result.state, "blocked");
    assert.ok(result.code === "permission_invalid" || result.code === "workspace_dirty");
    assert.equal(callCounts.claimDispatchPacket, undefined);
  }
});

test("returns recovery-required for uncertain or concurrently completed packet claims", async () => {
  for (const claimDispatchPacket of [
    async () => ({ state: "invalid", code: "recovery_required", errors: ["lock release uncertain"] }),
    async (input) => {
      const result = claimedPacket(input);
      return { state: "valid", value: { ...result.value, claimStatus: "already_claimed", executionDisposition: undefined } };
    },
  ]) {
    const projection = validProjection();
    const furyRecord = validFuryRecord(projection);
    const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord),
      observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
      readTrackedFile: async () => validBlueprintBytes(),
      helicarrier: passingHelicarrier(),
      claimDispatchPacket,
    }));

    assert.equal(result.state, "recovery_required");
    assert.equal(result.readiness, "dispatch_ready");
  }
});

test("durable schema-9 signing output reaches dispatch-ready before a no-effect uncertain claim", async () => {
  const fixture = await durableProfileAwareDispatchFixture();
  const before = await readFile(fixture.journalPath, "utf8");
  const furyRecord = validFuryRecord(fixture.projection);
  let claimCalls = 0;
  const callCounts = {};
  const result = await runGovernedMayDispatchStepV1(
    { ...validInput(), repositoryRoot: fixture.repositoryRoot, configuredJournalPath: fixture.configuredJournalPath },
    validDependencies(callCounts, {
      readMissionJournal: readMissionJournalForDisplay,
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord),
      observeDeliveryWorkspace: async () => validWorkspaceObservation(fixture.projection, furyRecord),
      readTrackedFile: async () => validBlueprintBytes(),
      helicarrier: passingHelicarrier(),
      loadPermissionContext: async (input) => ({
        state: "ready",
        context: validPermissionContext(fixture.projection, input.expectedDecisionId),
      }),
      claimDispatchPacket: async () => {
        claimCalls += 1;
        return { state: "invalid", code: "recovery_required", errors: ["no-effect proving claim"] };
      },
    }),
  );

  assert.equal(result.state, "recovery_required");
  assert.equal(result.readiness, "dispatch_ready");
  assert.equal(claimCalls, 1);
  assert.equal(await readFile(fixture.journalPath, "utf8"), before);
  assert.equal(callCounts.runMayControlLoop, undefined);
  assert.equal(callCounts.appendMissionEntry, undefined);
  assert.equal(callCounts.appendDispatchReceipt, undefined);
});

test("blocks when delivery workspace observation fails", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => { throw new Error("unavailable"); },
  }));

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "workspace_invalid");
});

test("blocks a live workspace whose branch or HEAD is stale", async () => {
  for (const override of [
    { branch: "agent/other" },
    { headRevision: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
  ]) {
    const projection = validProjection();
    const furyRecord = validFuryRecord(projection);
    const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord),
      observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord, override),
    }));

    assert.equal(result.state, "blocked");
    assert.equal(result.code, "workspace_invalid");
  }
});

test("rejects malformed delivery workspace shapes before later reads", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  const accessor = validWorkspaceObservation(projection, furyRecord);
  Object.defineProperty(accessor, "headRevision", {
    enumerable: true,
    get() { throw new Error("workspace accessor must not execute"); },
  });
  const symbol = validWorkspaceObservation(projection, furyRecord);
  symbol[Symbol("hidden")] = true;
  const unknown = { ...validWorkspaceObservation(projection, furyRecord), executable: "git" };
  const proxy = new Proxy(validWorkspaceObservation(projection, furyRecord), {
    getPrototypeOf() { throw new Error("workspace proxy must fail closed"); },
  });

  for (const observation of [accessor, symbol, unknown, proxy]) {
    const callCounts = {};
    const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord),
      observeDeliveryWorkspace: async () => observation,
    }));

    assert.equal(result.state, "blocked");
    assert.equal(result.code, "workspace_invalid");
    assert.equal(callCounts.readTrackedFile, undefined);
  }
});

test("requires recovery for a durable governed May start without a terminal", async () => {
  const projection = validProjection({ lastSequence: 4 });
  const furyRecord = validFuryRecord(projection);
  const fresh = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
  }));
  const entries = governedMayReceiptEntries({
    projection,
    furyRecord,
    packetId: fresh.evidence.packetId,
    parentSessionId: fresh.evidence.parentSessionId,
    originalSequence: 4,
  });
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord, entries),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.readiness, "dispatch_ready");
  assert.equal(result.code, "dispatch_receipt_recovery_required");
  assert.equal(result.evidence.state, "started");
});

test("real executor recovery repeats no write after audit-result or control-event uncertainty", async (context) => {
  for (const mode of ["audit_result_uncertain", "control_event_uncertain"]) {
    const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), `shield-governed-may-${mode}-`)));
    context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
    await mkdir(join(repositoryRoot, "src"), { recursive: true });
    const git = async (args) => (await execFile("git", args, { cwd: repositoryRoot, encoding: "utf8" })).stdout.trim();
    await git(["init", "-b", "main"]);
    await writeFile(join(repositoryRoot, "base.txt"), "base\n", "utf8");
    await git(["add", "base.txt"]);
    await git(["-c", "user.name=shield", "-c", "user.email=shield@example.invalid", "commit", "-m", "fixture base"]);
    const baseRevision = await git(["rev-parse", "HEAD"]);
    await writeFile(join(repositoryRoot, "head.txt"), "head\n", "utf8");
    await git(["add", "head.txt"]);
    await git(["-c", "user.name=shield", "-c", "user.email=shield@example.invalid", "commit", "-m", "fixture head"]);
    const headRevision = await git(["rev-parse", "HEAD"]);
    const executable = await realpath(process.execPath);
    const executableInfo = await stat(executable);
    const relativePaths = ["src/one.txt", "src/two.txt", "src/three.txt"];
    const contents = ["one\n", "two\n", "three\n"];
    const validationScript = "const f=require('fs');for(const n of['one','two','three'])if(f.readFileSync('src/'+n+'.txt','utf8')!==n+'\\n')process.exit(2)";
    const plannedOperations = [
      ...relativePaths.map((path, index) => ({ toolName: "writeFile", path, content: contents[index], precondition: { kind: "absent" } })),
      {
        toolName: "runValidation", commandId: "validation:test", executable,
        args: ["-e", validationScript], timeoutMs: 30_000,
        executableIdentity: `${executableInfo.dev}:${executableInfo.ino}:${executableInfo.mode}:${executableInfo.size}:${executableInfo.mtimeMs}`,
      },
    ];
    const baseProjection = validProjection();
    const baseAuthority = baseProjection.implementationAuthority;
    const cycleIdentity = deriveMissionCycleIdentityV1({
      repositoryRoot, configuredJournalPath: ".shield/missions", missionId: baseAuthority.missionId,
      expectedSubjectId: baseAuthority.subjectId, expectedRevisionId: baseAuthority.missionRevisionId,
      expectedSequence: baseProjection.lastSequence, seatId: "may", actionId: "repository.write_file",
      effectClass: "behavioral_implementation", validationId: "validation:test", activatedModes: [],
      actionAllowlist: ["repository.run_validation", "repository.write_file"],
    });
    const operationEffectKeys = plannedOperations.map(computeMayPlannedToolEffectKeyV1);
    const sequenceEffectKey = computeMayPlannedOperationsSequenceEffectKeyV1(plannedOperations);
    assert.ok(sequenceEffectKey);
    const authority = {
      ...baseAuthority, artifactRevisionId: headRevision, canonicalWritableRoot: repositoryRoot,
      branch: "main", baseRevision, headRevision, approvedRelativePaths: [...relativePaths].sort(),
      approvedEffectKeys: [cycleIdentity.effectKey, ...operationEffectKeys, sequenceEffectKey].sort(),
    };
    const baseWrapper = baseProjection.activeRuntimeBindings[0];
    const binding = {
      ...baseWrapper.binding, artifactRevisionId: headRevision, canonicalWritableRoot: repositoryRoot, branch: "main",
      approvedScope: { ...baseWrapper.binding.approvedScope, effectKeys: [...authority.approvedEffectKeys] },
    };
    const wrapper = {
      ...baseWrapper, binding, implementationAuthorityDigest: computeImplementationAuthorityDigest(authority),
      approvedRelativePaths: [...relativePaths].sort(), baseRevision, headRevision,
    };
    const projection = {
      ...baseProjection, implementationAuthority: authority,
      implementationAuthorityDigest: computeImplementationAuthorityDigest(authority),
      runtimeBindings: [wrapper], activeRuntimeBindings: [wrapper],
    };
    const furyRecord = validFuryRecord(projection);
    const furyEntries = validFuryReceiptEntries(furyRecord.furyDispatchIdentity);
    let started;
    let recovering = false;
    let fetchCalls = 0;
    let uncertaintyInjected = false;
    const auditEntries = [];
    const controlEvents = [];
    const responses = [
      { models: [{ key: authority.modelId, loaded_instances: [{ id: binding.reasoningRuntimeId }], capabilities: { trained_for_tool_use: true } }] },
      { choices: [{ message: { role: "assistant", content: null, tool_calls: [{
        id: `call:${mode}:write-one`, type: "function",
        function: { name: "writeFile", arguments: JSON.stringify({ path: relativePaths[0], content: contents[0], expectedSha256: "absent" }) },
      }] } }] },
    ];
    const dependencies = validDependencies({}, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord, recovering && started !== undefined ? [...furyEntries, started] : furyEntries),
      observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
      readTrackedFile: async () => validBlueprintBytes(),
      readWorkspaceStatus: async () => {
        const status = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
        return status === "" ? [] : status.split("\n").map((line) => line.slice(3)).sort();
      },
      loadPermissionContext: async (input) => ({
        state: "ready",
        context: validPermissionContext({ ...projection, lastSequence: input.plan.evaluatedThroughSequence }, input.expectedDecisionId),
      }),
      schema9HostOps: {
        realpath: async (value) => value,
        access: async () => undefined,
        execFile: async (command, args, options) => (await execFile(command, args, { ...options, encoding: "utf8" })).stdout,
        probeCapability: async () => true,
        now: () => "2026-08-03T20:06:00Z",
      },
      helicarrier: passingHelicarrier(),
      plannedToolOperations: plannedOperations,
      validationCommands: [{ commandId: "validation:test", executable, args: ["-e", validationScript], timeoutMs: 30_000 }],
      claimDispatchPacket: async (input) => {
        const claimed = claimedPacket(input, furyEntries);
        started = claimed.started;
        return claimed;
      },
      createPermissionAuditStore: ({ ledgerId }) => ({
        ledgerId,
        read: async () => ({ entries: structuredClone(auditEntries), bytes: "", missing: false }),
        appendIfAbsent: async (record) => {
          auditEntries.push(structuredClone(record));
          if (!uncertaintyInjected && mode === "audit_result_uncertain" && record.recordType === "tool.result" && record.effectKey === operationEffectKeys[0]) {
            uncertaintyInjected = true;
            throw new Error("audit_result_receipt_uncertain");
          }
          return {
            schemaVersion: 1, ledgerId: record.ledgerId, recordId: record.recordId,
            decisionId: record.decisionId, digest: record.digest, appended: true,
            ledgerSequence: auditEntries.length - 1,
          };
        },
      }),
      createMayControlEventStore: ({ sessionId }) => ({
        sessionId,
        read: async () => ({ orderedEvents: structuredClone(controlEvents), terminalState: { state: "none" } }),
        appendControlEvent: async (event) => {
          controlEvents.push(structuredClone(event));
          if (!uncertaintyInjected && mode === "control_event_uncertain" && event.code === "may_control_writeFile_completed") {
            uncertaintyInjected = true;
            throw new Error("control_event_receipt_uncertain");
          }
          return { eventId: event.eventId, appended: true };
        },
      }),
      runMayControlLoop,
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "content-type": "application/json" } });
      },
      runMissionCycle: runExecutingMissionCycle,
    });
    const input = { ...validInput(), repositoryRoot };
    const first = await runGovernedMayDispatchStepV1(input, dependencies);
    assert.equal(first.state, "recovery_required", `${mode}: ${JSON.stringify(first)}`);
    assert.equal(uncertaintyInjected, true, `${mode}: ${JSON.stringify(first)}`);
    assert.equal(await readFile(join(repositoryRoot, relativePaths[0]), "utf8"), contents[0]);
    assert.equal(await stat(join(repositoryRoot, relativePaths[1])).then(() => true, () => false), false);
    const firstIdentity = await stat(join(repositoryRoot, relativePaths[0]));
    const firstBytes = await readFile(join(repositoryRoot, relativePaths[0]));
    const callsAfterFirst = fetchCalls;
    recovering = true;
    const second = await runGovernedMayDispatchStepV1(input, dependencies);
    assert.equal(second.state, "recovery_required", mode);
    assert.equal(second.code, "dispatch_receipt_recovery_required", mode);
    assert.equal(fetchCalls, callsAfterFirst, mode);
    assert.deepEqual(await readFile(join(repositoryRoot, relativePaths[0])), firstBytes, mode);
    const secondIdentity = await stat(join(repositoryRoot, relativePaths[0]));
    assert.equal(`${secondIdentity.dev}:${secondIdentity.ino}:${secondIdentity.size}:${secondIdentity.mtimeMs}:${secondIdentity.ctimeMs}`, `${firstIdentity.dev}:${firstIdentity.ino}:${firstIdentity.size}:${firstIdentity.mtimeMs}:${firstIdentity.ctimeMs}`, mode);
    assert.equal(await stat(join(repositoryRoot, relativePaths[1])).then(() => true, () => false), false);
  }
});

test("replays a completed three-write packet using its durable original sequence without invoking effects", async () => {
  const plannedOperations = threeWriteFixtureOperations();
  const { projection: originalProjection } = projectionForPlannedOperations(plannedOperations);
  const furyRecord = validFuryRecord(originalProjection);
  let modelCalls = 0;
  const fresh = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection: originalProjection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(originalProjection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
    plannedToolOperations: plannedOperations,
    loadPermissionContext: async (input) => ({
      state: "ready",
      context: validPermissionContext({ ...originalProjection, lastSequence: input.plan.evaluatedThroughSequence }, input.expectedDecisionId),
    }),
    runMayControlLoop: async () => { modelCalls += 1; throw new Error("fresh fixture does not execute tools"); },
  }));
  const entries = governedMayReceiptEntries({
    projection: originalProjection,
    furyRecord,
    packetId: fresh.evidence.packetId,
    parentSessionId: fresh.evidence.parentSessionId,
    originalSequence: 4,
    terminalState: "completed",
    dispatchEnvelopeDigest: fresh.evidence.dispatchEnvelopeDigest,
    plannedOperations,
  });
  const advancedProjection = { ...originalProjection, lastSequence: 5, implementationAuthorityState: "revoked", activeRuntimeBindings: [] };
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection: advancedProjection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord, entries),
    readTrackedFile: async () => validBlueprintBytes(),
    plannedToolOperations: plannedOperations,
    validationCommands: [],
    runMayControlLoop: async () => { modelCalls += 1; throw new Error("terminal replay must not invoke model or effects"); },
    observeDeliveryWorkspace: async () => { throw new Error("terminal replay must not observe live workspace"); },
    observeMayToolPreflight: async () => { throw new Error("terminal replay must not observe live tool state"); },
    helicarrier: {
      certification,
      validate: () => { throw new Error("terminal replay must not recompile"); },
      compile: () => { throw new Error("terminal replay must not recompile"); },
    },
  }));

  assert.equal(result.state, "replayed");
  assert.equal(result.readiness, "dispatch_ready");
  assert.equal(result.evidence.originalSequence, 4);
  assert.equal(result.evidence.packetId, fresh.evidence.packetId);
  assert.equal(result.evidence.parentSessionId, fresh.evidence.parentSessionId);
  assert.equal(result.evidence.terminalState, "completed");
  assert.equal(result.evidence.repositoryId, "RanSolo/shield-workspace");
  assert.equal(result.evidence.repositoryRevision, originalProjection.implementationAuthority.headRevision);
  assert.equal(result.evidence.configuredRuntime.runtimeId, "runtime:local-may");
  assert.equal(result.evidence.toolExecution.executorBindingRef, "binding:issue-170:may");
  assert.equal(modelCalls, 0);
});

test("rejects replay when a non-final runtime attribution observation is mismatched", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  const fresh = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(projection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
  }));
  const entries = governedMayReceiptEntries({
    projection,
    furyRecord,
    packetId: fresh.evidence.packetId,
    parentSessionId: fresh.evidence.parentSessionId,
    originalSequence: 4,
    terminalState: "completed",
    dispatchEnvelopeDigest: fresh.evidence.dispatchEnvelopeDigest,
  });
  const ledger = validDispatchLedger(furyRecord, entries);
  const projections = ledger.value.projections.map((receipt) => receipt.accountableSeatId === "may"
    ? {
        ...receipt,
        runtimeHostHistory: receipt.runtimeHostHistory.map((observation, index) => index === 0
          ? { ...observation, model: "model:substituted" }
          : observation),
      }
    : receipt);
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => ({ ...ledger, value: { ...ledger.value, projections } }),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "dispatch_receipt_recovery_required");
});

test("fails closed when the dispatch receipt ledger read throws", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => { throw new Error("unavailable"); },
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "dispatch_receipt_invalid");
});

test("fails closed when Fury receipt attribution is unavailable", async () => {
  const projection = validProjection();
  const furyRecord = validFuryRecord(projection);
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord, []),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "fury_evidence_invalid");
  assert.ok(result.errors.includes("INVALID_REVIEW_ATTRIBUTION"));
});

test("fails closed when the Fury evidence ledger read throws", async () => {
  const projection = validProjection();
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => { throw new Error("unavailable"); },
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "fury_evidence_invalid");
});

test("fails closed when current Fury evidence is missing or ambiguous", async () => {
  for (const count of [0, 2]) {
    const projection = validProjection();
    const records = Array.from({ length: count }, (_, index) => validFuryRecord(projection, { evidenceId: `evidence:fury:${index}` }));
    const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger(records),
    }));

    assert.equal(result.state, "recovery_required");
    assert.equal(result.code, "fury_evidence_invalid");
  }
});

test("fails closed when Fury evidence is stale for the authority head", async () => {
  const projection = validProjection();
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([validFuryRecord(projection, { repositoryRevisionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" })]),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "fury_evidence_invalid");
});

test("fails closed when Wheels Up authority is inactive", async () => {
  const projection = validProjection({ implementationAuthorityState: "revoked" });
  const furyRecord = validFuryRecord(projection);
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "authority_binding_invalid");
});

test("fails closed when active May binding is missing or ambiguous", async () => {
  for (const count of [0, 2]) {
    const base = validProjection();
    const projection = { ...base, activeRuntimeBindings: Array.from({ length: count }, () => base.activeRuntimeBindings[0]) };
    const furyRecord = validFuryRecord(projection);
    const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
      readFuryEvidence: async () => validFuryLedger([furyRecord]),
      readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    }));
    assert.equal(result.state, "recovery_required");
    assert.equal(result.code, "authority_binding_invalid");
  }
});

test("fails closed when the binding authority reference is stale", async () => {
  const base = validProjection();
  const projection = {
    ...base,
    activeRuntimeBindings: [{ ...base.activeRuntimeBindings[0], implementationAuthorityRef: "authority:stale" }],
  };
  const furyRecord = validFuryRecord(projection);
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "authority_binding_invalid");
});
