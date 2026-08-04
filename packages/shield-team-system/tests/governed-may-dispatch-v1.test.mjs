import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { runGovernedMayDispatchStepV1 } from "../dist/governed-may-dispatch-v1.mjs";
import { computeImplementationAuthorityDigest } from "../dist/implementation-authority-v1.mjs";
import { deriveFuryPlanReviewEvidenceV1 } from "../dist/fury-plan-review-evidence-v1.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
  replaySeatDispatchReceiptsV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";

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

function validAuthority() {
  return {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: "authority:issue-170:may",
    missionId: "mission:issue-170",
    subjectId: "github:issue-170",
    seatId: "may",
    missionRevisionId: `sha256:${"A".repeat(43)}`,
    artifactRevisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    repositoryId: "RanSolo/shield-workspace",
    canonicalWritableRoot: "/tmp/shield-governed-may",
    branch: "agent/issue-170",
    baseRevision: "sha256:base_issue_170",
    headRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    modelId: "model:ornith",
    approvedRelativePaths: ["packages/shield-team-system"],
    approvedActionIds: ["edit:implementation", "read:issue"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: ["effect:implementation", "effect:validation"],
    approvedCapabilities: ["filesystem_write", "github_issues"],
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
    implementationAuthority: authority,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authority),
    implementationAuthorityState: "authorized",
    activeRuntimeBindings: [bindingWrapper],
    lastSequence: 4,
    ...overrides,
  };
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
        contextDigest: "1".repeat(64),
        fixtureDigest: "2".repeat(64),
        format: "compilation-manifest.v0",
        governanceDigest: "3".repeat(64),
        irDigest: "4".repeat(64),
        promptByteLength: promptBytes.byteLength,
        promptDigest: protocolDigest("shield:dispatch:prompt:v0", promptBytes),
        provenanceByteLength: provenanceBytes.byteLength,
        provenanceDigest: protocolDigest("shield:dispatch:provenance:v0", provenanceBytes),
        registryDigest: "5".repeat(64),
        rendererDigest: "6".repeat(64),
        rendererId: certification.rendererId,
        targetProfileDigest: "7".repeat(64),
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

function claimedPacket(input) {
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
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
  const replay = replaySeatDispatchReceiptsV1([started]);
  assert.equal(replay.state, "valid");
  return {
    state: "valid",
    value: {
      logPath: "/tmp/dispatch-receipts.jsonl",
      byteLength: 1,
      packetDigest,
      receipt: replay.projections[0],
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

function governedMayReceiptEntries({ projection, furyRecord, packetId, parentSessionId, originalSequence, terminalState = null }) {
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
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:may:tools" },
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
      `evidence:packet-binding:seat-dispatch-v1:${claimKey}:sha256:${"B".repeat(43)}`,
    ],
    timestamp: "2026-08-03T18:00:02Z",
    logSequence: 2,
    previousLogDigest: baseEntries[1].entryDigest,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
  if (terminalState === null) return [...baseEntries, started];
  const terminal = createSeatDispatchLifecycleEventV1({
    ...shared,
    kind: `dispatch.${terminalState}`,
    outputEvidenceRefs: ["evidence:may:terminal"],
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
  const sentinel = (name) => (..._args) => {
    callCounts[name] = (callCounts[name] ?? 0) + 1;
    throw new Error(`unexpected dependency call: ${name}`);
  };
  return {
    observeDeliveryWorkspace: sentinel("observeDeliveryWorkspace"),
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
    validationCommands: [{
      commandId: "validation:test",
      executable: process.execPath,
      args: ["--test"],
      timeoutMs: 30_000,
    }],
    mayControlBaseUrl: "http://127.0.0.1:1234",
    runMayControlLoop: sentinel("runMayControlLoop"),
    createPermissionAuditStore: sentinel("createPermissionAuditStore"),
    createMayControlEventStore: sentinel("createMayControlEventStore"),
    readMissionJournal: sentinel("readMissionJournal"),
    appendMissionEntry: sentinel("appendMissionEntry"),
    readFuryEvidence: sentinel("readFuryEvidence"),
    readDispatchReceipts: sentinel("readDispatchReceipts"),
    claimDispatchPacket: async (input) => claimedPacket(input),
    appendDispatchReceipt: sentinel("appendDispatchReceipt"),
    runMissionCycle: sentinel("runMissionCycle"),
    ...overrides,
  };
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

test("stops without effects after a valid profile-aware journal", async () => {
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
  assert.equal(Object.hasOwn(helicarrierCapture.envelope, "executable"), false);
  assert.doesNotMatch(JSON.stringify(helicarrierCapture.envelope), /"(?:executable|args)"/);
  assert.equal(helicarrierCapture.trust.blueprintBytesBase64, Buffer.from(validBlueprintBytes()).toString("base64"));
  assert.equal(helicarrierCapture.compileTrust, helicarrierCapture.trust);

  assert.deepEqual(result, {
    state: "recovery_required",
    readiness: "dispatch_ready",
    code: "implementation_incomplete",
    errors: ["Governed May dispatch execution is not implemented."],
    evidence: {
      authorityRef: "authority:issue-170:may",
      bindingId: "binding:issue-170:may",
      furyEvidenceId: furyRecord.evidenceId,
      furyPlanDigest: furyRecord.planDigest,
      originalSequence: 4,
      packetId: result.evidence.packetId,
      parentSessionId: result.evidence.parentSessionId,
      blueprintArtifactId: "issue-170-blueprint",
      blueprintArtifactPath: "docs/missions/issue-170-plan.md",
      blueprintByteLength: 22,
      blueprintDigest: result.evidence.blueprintDigest,
      blueprintRevision: projection.implementationAuthority.headRevision,
      dispatchEnvelopeByteLength: result.evidence.dispatchEnvelopeByteLength,
      dispatchEnvelopeDigest: result.evidence.dispatchEnvelopeDigest,
      helicarrierManifestDigest: result.evidence.helicarrierManifestDigest,
      helicarrierPromptDigest: result.evidence.helicarrierPromptDigest,
      helicarrierProvenanceDigest: result.evidence.helicarrierProvenanceDigest,
      helicarrierIrDigest: "4".repeat(64),
      helicarrierGovernanceDigest: "3".repeat(64),
      helicarrierRegistryDigest: "5".repeat(64),
      cycleId: result.evidence.cycleId,
      permissionDecisionId: result.evidence.permissionDecisionId,
      permissionEvaluatedAt: "2026-08-03T20:05:00Z",
      dirtyPaths: [],
      receiptId: result.evidence.receiptId,
      dispatchId: result.evidence.dispatchId,
      childTaskId: result.evidence.childTaskId,
      childSessionId: result.evidence.childSessionId,
      prNumber: 200,
      repositoryWorkspaceId: "workspace:issue-170",
    },
  });
  assert.match(result.evidence.packetId, /^packet:governed-may:[A-Za-z0-9_-]{43}$/);
  assert.match(result.evidence.parentSessionId, /^session:governed-may:[A-Za-z0-9_-]{32}$/);
  assert.match(result.evidence.blueprintDigest, /^sha256:[A-Za-z0-9_-]{43}$/);
  assert.match(result.evidence.dispatchEnvelopeDigest, /^sha256:[A-Za-z0-9_-]{43}$/);
  assert.ok(result.evidence.dispatchEnvelopeByteLength > 0);
  assert.deepEqual(callCounts, {});
});

test("derives stable dispatch identities that change with the pinned original sequence", async () => {
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
  assert.equal(first.state, "recovery_required");
  assert.equal(first.code, "implementation_incomplete");
  assert.equal(first.evidence.packetId, replay.evidence.packetId);
  assert.equal(first.evidence.parentSessionId, replay.evidence.parentSessionId);
  assert.notEqual(first.evidence.packetId, next.evidence.packetId);
  assert.notEqual(first.evidence.parentSessionId, next.evidence.parentSessionId);
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
  assert.equal(result.code, "dispatch_envelope_invalid");
  assert.equal(callCounts["helicarrier.validate"], undefined);
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

test("replays a terminal governed May receipt using its durable original sequence", async () => {
  const originalProjection = validProjection({ lastSequence: 4 });
  const furyRecord = validFuryRecord(originalProjection);
  const fresh = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection: originalProjection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
    observeDeliveryWorkspace: async () => validWorkspaceObservation(originalProjection, furyRecord),
    readTrackedFile: async () => validBlueprintBytes(),
    helicarrier: passingHelicarrier(),
  }));
  const entries = governedMayReceiptEntries({
    projection: originalProjection,
    furyRecord,
    packetId: fresh.evidence.packetId,
    parentSessionId: fresh.evidence.parentSessionId,
    originalSequence: 4,
    terminalState: "completed",
  });
  const advancedProjection = validProjection({ lastSequence: 5 });
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection: advancedProjection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord, entries),
  }));

  assert.equal(result.state, "replayed");
  assert.equal(result.readiness, "dispatch_ready");
  assert.equal(result.evidence.originalSequence, 4);
  assert.equal(result.evidence.packetId, fresh.evidence.packetId);
  assert.equal(result.evidence.parentSessionId, fresh.evidence.parentSessionId);
  assert.equal(result.evidence.terminalState, "completed");
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
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "authority_binding_invalid");
});

test("fails closed when active May binding is missing or ambiguous", async () => {
  for (const count of [0, 2]) {
    const base = validProjection();
    const projection = { ...base, activeRuntimeBindings: Array.from({ length: count }, () => base.activeRuntimeBindings[0]) };
    const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
      readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
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
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.code, "authority_binding_invalid");
});
