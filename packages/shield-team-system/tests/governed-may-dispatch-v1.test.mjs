import assert from "node:assert/strict";
import test from "node:test";

import { runGovernedMayDispatchStepV1 } from "../dist/governed-may-dispatch-v1.mjs";
import { computeImplementationAuthorityDigest } from "../dist/implementation-authority-v1.mjs";
import { deriveFuryPlanReviewEvidenceV1 } from "../dist/fury-plan-review-evidence-v1.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
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
    brief: { subjectId: authority.subjectId, revisionId: authority.missionRevisionId },
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
  return {
    state: "valid",
    value: {
      logPath: "/tmp/shield-governed-may/.shield/dispatch-receipts.jsonl",
      entries,
      projections: [],
    },
  };
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
    readWorkspaceStatus: sentinel("readWorkspaceStatus"),
    schema9HostOps: {
      realpath: sentinel("realpath"),
      access: sentinel("access"),
      execFile: sentinel("execFile"),
      probeCapability: sentinel("probeCapability"),
      now: sentinel("now"),
    },
    helicarrier: {
      certification,
      validate: sentinel("helicarrier.validate"),
      compile: sentinel("helicarrier.compile"),
    },
    validationCommands: [],
    mayControlBaseUrl: "http://127.0.0.1:1234",
    runMayControlLoop: sentinel("runMayControlLoop"),
    createPermissionAuditStore: sentinel("createPermissionAuditStore"),
    createMayControlEventStore: sentinel("createMayControlEventStore"),
    readMissionJournal: sentinel("readMissionJournal"),
    appendMissionEntry: sentinel("appendMissionEntry"),
    readFuryEvidence: sentinel("readFuryEvidence"),
    readDispatchReceipts: sentinel("readDispatchReceipts"),
    claimDispatchPacket: sentinel("claimDispatchPacket"),
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

  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection } }),
    readFuryEvidence: async () => validFuryLedger([furyRecord]),
    readDispatchReceipts: async () => validDispatchLedger(furyRecord),
  }));

  assert.deepEqual(result, {
    state: "recovery_required",
    readiness: "indeterminate",
    code: "implementation_incomplete",
    errors: ["Governed May dispatch execution is not implemented."],
    evidence: {
      authorityRef: "authority:issue-170:may",
      bindingId: "binding:issue-170:may",
      furyEvidenceId: furyRecord.evidenceId,
      furyPlanDigest: furyRecord.planDigest,
      originalSequence: 4,
    },
  });
  assert.deepEqual(callCounts, {});
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
