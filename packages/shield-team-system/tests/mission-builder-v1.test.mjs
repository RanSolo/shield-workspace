import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { createShieldConfig } from "../dist/config.mjs";
import { missionIntakeV1 } from "../dist/mission-intake-v1.mjs";
import {
  advanceMissionV1,
  appendMissionProvenanceRecordV1,
  buildMissionDefinitionV1,
  buildMissionTransitionPlanV1,
  compileMissionCycleInputV1,
  createMissionProofreadingAcceptanceV1,
  createMissionValidationRecordV1,
  editMissionDefinitionTextV1,
  finalizeMissionProvenanceRecordV1,
  missionBuilderBenchmarkV1,
  compareMissionCanonicalTextV1,
  projectMissionStatusV1,
  replayMissionProvenanceV1,
  validateMissionDefinitionV1,
} from "../dist/mission-builder-v1.mjs";
import { deriveMissionCycleIdentityV1 } from "../dist/mission-runtime-v1.mjs";
import { canonicalJson, computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import { createSeatDispatchLifecycleEventV1, createSeatDispatchStartedEventV1, replaySeatDispatchReceiptsV1 } from "../dist/seat-dispatch-receipt-v1.mjs";
import {
  createProfileAwareImplementationAuthorityEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";

const REPOSITORY_REVISION = "f730cbc3c3da86d42075942d02e23ef5053ce6d6";
const OBSERVED_AT = "2026-08-10T18:00:00.000Z";
const PATTERNS = ["debug", "delivery", "recon", "planning", "review"];
const OWNERS = { debug: "daisy", delivery: "may", recon: "daisy", planning: "fury", review: "fury" };

function hash(domain, value) {
  return `sha256:${createHash("sha256").update(domain).update("\0").update(canonicalJson(value)).digest("base64url")}`;
}

function intakeRequest({ requireSimmons = false } = {}) {
  const participants = ["hill", "daisy", "fury", "may", "coulson", "fitz", ...(requireSimmons ? ["simmons"] : [])];
  return {
    schemaVersion: 1,
    contractVersion: "mission.intake.v1",
    configObservation: {
      source: "repository_file", observationState: "observed", assuranceKind: "host_asserted", observedAt: OBSERVED_AT,
      sourceRef: ".shield/config.json", repositoryRevision: REPOSITORY_REVISION,
      config: createShieldConfig({ repositoryId: "RanSolo/shield-workspace", coulsonBindingRef: "binding:coulson", fitzBindingRef: "binding:fitz" }),
    },
    repositoryObservation: {
      assuranceKind: "host_asserted", repositoryId: "RanSolo/shield-workspace", branch: "agent/issue-167-mission-builder",
      baseRevision: REPOSITORY_REVISION, headRevision: REPOSITORY_REVISION, observedAt: OBSERVED_AT, sourceRef: "git:working-tree",
    },
    issueObservation: {
      assuranceKind: "host_asserted", issueId: "issue:167", issueRevisionId: "issue-comment:167-fury-revise",
      observedAt: OBSERVED_AT, sourceRef: "github:issue:167",
    },
    proposedBrief: {
      missionId: "mission:builder:test", objective: "Build one bounded mission definition.", subjectId: "issue:167",
      riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: true },
      participantSeatIds: participants, requireSimmons, createdAt: { value: OBSERVED_AT, provenance: "humanRecorded" },
    },
    recommendedModes: [{ modeId: "delivery", seatId: "hill", reason: "Coordinate the bounded mission.", source: "hill_recommended" }],
    artifacts: {
      missionBrief: { path: "docs/missions/issue-167.md", repositoryRevision: REPOSITORY_REVISION, verification: "content_unverified" },
      missionCommunication: { path: "docs/missions/issue-167-handoff.md", repositoryRevision: REPOSITORY_REVISION, verification: "content_unverified" },
      sharedRuntimeInstructions: { path: "docs/missions/issue-167-runtime.md", repositoryRevision: REPOSITORY_REVISION, verification: "content_unverified" },
    },
    runtimeObservations: [
      { seatId: "may", status: "host_probed", observedAt: OBSERVED_AT, runtimeId: "runtime:may", evidenceRefs: ["host:may"] },
      { seatId: "daisy", status: "host_probed", observedAt: OBSERVED_AT, runtimeId: "runtime:daisy", evidenceRefs: ["host:daisy"] },
    ],
  };
}

function candidate(options = {}) {
  const result = missionIntakeV1(intakeRequest(options));
  assert.equal(result.state, "candidate", result.reasonCodes?.join(","));
  assert.deepEqual(result.blockers, []);
  return result;
}

function modeFor(pattern, seatId = OWNERS[pattern]) {
  return { modeId: pattern === "debug" || pattern === "recon" ? "debugger" : "delivery", modeVersion: "1.0.0", seatId, activationSource: "mission-brief" };
}

function build(pattern = "delivery", options = {}) {
  const modes = options.modes ?? [modeFor(pattern), { modeId: "delivery", modeVersion: "1.0.0", seatId: "hill", activationSource: "mission-brief" }];
  const result = buildMissionDefinitionV1({ candidate: candidate(options), pattern, activatedModes: modes, maximumRepairs: options.maximumRepairs ?? 1 });
  assert.equal(result.state, "built", result.reasonCodes.join(","));
  return result;
}

function accepted(buildResult) {
  let entries = [];
  const finalize = (proposal, priorReplay, seatId, receiptId, offset) => {
    entries.push(...provenanceLifecycle(buildResult.definition, seatId, receiptId, proposal.actorArtifactId, offset, entries.at(-1)?.entryDigest ?? null));
    const result = finalizeMissionProvenanceRecordV1({ proposal, priorReplay, actorReceiptEntries: entries, actorReceiptId: receiptId });
    assert.ok(result);
    return result;
  };
  const generated = finalize(buildResult.provenanceRecords[0], [], "hill", "receipt:provenance:generated", 0);
  const validationProposal = createMissionValidationRecordV1({ definition: buildResult.definition, provenanceRecords: [generated] });
  assert.ok(validationProposal);
  const validation = finalize(validationProposal, [generated], "may", "receipt:provenance:validation", 2);
  const proofreadingProposal = createMissionProofreadingAcceptanceV1({ definition: buildResult.definition, provenanceRecords: [generated, validation] });
  assert.ok(proofreadingProposal);
  const proofreading = finalize(proofreadingProposal, [generated, validation], "hill", "receipt:provenance:proofreading", 4);
  return [generated, validation, proofreading];
}

function provenanceLifecycle(definition, seatId, receiptId, artifactId = definition.definitionRevision, logOffset = 0, previousLogDigest = null) {
  const runtimeId = `runtime:provenance:${seatId}`;
  const executorId = `executor:provenance:${seatId}`;
  const common = {
    receiptId, dispatchId: `dispatch:${receiptId}`, parentMissionId: definition.missionId, parentMissionRevision: definition.definitionRevision,
    parentSessionId: "session:parent", childTaskId: `task:${receiptId}`, childSessionId: `session:${receiptId}`, accountableSeatId: seatId,
    repositoryId: definition.repositoryId, repositoryWorkspaceId: "workspace:test", repositoryRevision: definition.repositoryRevision,
    subjectId: definition.subjectId, subjectRevision: definition.definitionRevision, artifactId, artifactRevision: definition.definitionRevision,
    configuredRuntime: { kind: "runtime.configured", runtimeId, model: "model:provenance" }, requestedRuntime: { kind: "runtime.requested", runtimeId, model: "model:provenance" },
    toolExecution: { kind: "tool.execution.not_requested", reason: "not_requested" },
    runtimeSelfReport: { kind: "runtime.self_report.observed", runtimeId, model: "model:provenance", evidenceRefs: [`evidence:${receiptId}:runtime-self`] },
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId, model: "model:provenance", evidenceRefs: [`evidence:${receiptId}:runtime-host`] },
    executorSelfReport: { kind: "executor.self_report.observed", executorId, evidenceRefs: [`evidence:${receiptId}:executor-self`] },
    executorHostObserved: { kind: "executor.host_observed", executorId, evidenceRefs: [`evidence:${receiptId}:executor-host`] },
  };
  const started = createSeatDispatchStartedEventV1({ ...common, timestamp: OBSERVED_AT, logSequence: logOffset, previousLogDigest, lifecycleSequence: 0, previousLifecycleDigest: null, inputEvidenceRefs: [] });
  const completed = createSeatDispatchLifecycleEventV1({ ...common, kind: "dispatch.completed", timestamp: OBSERVED_AT, logSequence: logOffset + 1, previousLogDigest: started.entryDigest, lifecycleSequence: 1, previousLifecycleDigest: started.entryDigest, outputEvidenceRefs: [`evidence:${receiptId}:output`] });
  return [started, completed];
}

function authenticatedProvenance(records, generatedReceiptId, validationReceiptId, proofreadingReceiptId) {
  let previousRecordDigest = null;
  return records.map((record) => {
    const withActor = { ...record, previousRecordDigest, actorReceiptId: record.kind === "definition.generated" ? generatedReceiptId : record.kind === "definition.validated" ? validationReceiptId : record.kind === "proofreading.accepted" ? proofreadingReceiptId : null };
    const { recordDigest: _ignored, ...content } = withActor;
    const authenticated = { ...withActor, recordDigest: hash("shield.mission-provenance.v1", content) };
    previousRecordDigest = authenticated.recordDigest;
    return authenticated;
  });
}

function signingBinding(seatId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    privateKey,
    binding: {
      schemaVersion: 1, bindingId: `binding:${seatId}:builder`, humanPrincipalId: `human:${seatId}`, seatId, missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64), publicKeySpkiBase64, validFromSequence: 0,
      validThroughSequence: null, attestedBy: "repository-policy:test", provenanceRef: `test:binding:${seatId}`,
    },
  };
}

function appendSignedEvidence(state, seatId, evidenceKind, type) {
  const requirement = state.projection.requirements.find((item) => item.requiredRoleId === seatId && item.evidenceKind === evidenceKind);
  const signer = state.signers[seatId];
  assert.ok(requirement);
  assert.ok(signer);
  const sequence = state.entries.length;
  const payload = {
    schemaVersion: 1, evidenceId: `evidence:${seatId}:${evidenceKind}`, requirementId: requirement.requirementId,
    missionId: state.brief.missionId, revisionId: state.brief.revisionId, seatId, evidenceKind, decision: "approved",
    humanPrincipalId: signer.binding.humanPrincipalId, bindingId: signer.binding.bindingId, signingKeyRef: signer.binding.signingKeyRef,
    sourceRef: `manual-signature:${seatId}:${evidenceKind}`, timestamp: { value: OBSERVED_AT, provenance: "humanRecorded" }, journalSequence: sequence,
  };
  state.entries.push({
    schemaVersion: 9, entryId: `entry:${state.brief.missionId}:${sequence}`, missionId: state.brief.missionId, sequence, type,
    timestamp: payload.timestamp, payload: { evidence: { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), signer.privateKey).toString("base64") } },
  });
  state.replay();
  return payload;
}

function appendImplementationAuthority(state, definition) {
  const signer = state.signers.coulson;
  const step = definition.steps.find((item) => item.adapter === "mission_cycle");
  assert.ok(signer);
  assert.ok(step);
  const sequence = state.entries.length;
  const cycleIdentity = deriveMissionCycleIdentityV1({
    repositoryRoot: "/workspace/repository",
    configuredJournalPath: ".shield/journal.jsonl",
    missionId: definition.missionId,
    expectedSubjectId: definition.subjectId,
    expectedRevisionId: state.brief.revisionId,
    expectedSequence: sequence + 1,
    seatId: step.seatId,
    actionId: step.actionId,
    effectClass: step.effectClass,
    validationId: step.validationId,
    activatedModes: definition.activatedModes.filter((mode) => mode.seatId === step.seatId),
    actionAllowlist: definition.steps.map((item) => item.actionId),
  });
  const payload = {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: `authority:${state.brief.missionId}:builder`,
    missionId: state.brief.missionId,
    subjectId: state.brief.subjectId,
    seatId: "may",
    missionRevisionId: state.brief.revisionId,
    artifactRevisionId: definition.repositoryRevision,
    repositoryId: definition.repositoryId,
    canonicalWritableRoot: "/workspace/repository",
    branch: "agent/mission-builder-test",
    baseRevision: "0000000000000000000000000000000000000000",
    headRevision: definition.repositoryRevision,
    modelId: "model:test",
    approvedRelativePaths: ["packages/shield-team-system/src/mission-builder-v1.mts"],
    approvedActionIds: [step.actionId],
    approvedEffectClasses: [step.effectClass],
    approvedEffectKeys: [cycleIdentity.effectKey],
    approvedCapabilities: [...step.requiredCapabilities].sort(),
    validationCommandIds: [step.validationId],
    journalSequence: sequence,
    humanPrincipalId: signer.binding.humanPrincipalId,
    humanBindingId: signer.binding.bindingId,
    signingKeyRef: signer.binding.signingKeyRef,
    sourceRef: "test:mission-builder:wheels-up",
    evidenceRef: "evidence:coulson:mission_authorization",
    timestamp: { value: OBSERVED_AT, provenance: "humanRecorded" },
  };
  const authority = {
    payload,
    signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), signer.privateKey).toString("base64"),
  };
  state.entries.push(createProfileAwareImplementationAuthorityEntryV1({
    projection: state.projection,
    trustedBindings: [signer.binding],
    authority,
  }));
  state.replay();
}

function profileState(definition) {
  const signers = { coulson: signingBinding("coulson"), fitz: signingBinding("fitz") };
  const participants = [...new Set(["hill", ...definition.participants.map(({ seatId }) => seatId).filter((seatId) => seatId !== "mack")])].map((seatId) => ({ seatId }));
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2, missionId: definition.missionId, objective: definition.objective, subjectId: definition.subjectId,
    riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: true },
    participants, activatedModes: definition.activatedModes, requireSimmons: false, createdAt: { value: OBSERVED_AT, provenance: "humanRecorded" },
    profileId: "high_assurance", profileVersion: 1, requiredExecutionGateRoleIds: ["coulson", "fitz"], requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130", predecessorJournalDigest: "sha256:7f1f8c50a703cf43e1c477d88446473c5d1d755b99a4ad35a2b6662558ded7b9",
  });
  const state = {
    brief, signers, entries: [createProfileAwareMissionBegunEntry(brief, Object.values(signers).map(({ binding }) => binding))], projection: null,
    replay() {
      const replayed = replayProfileAwareMissionJournal(this.entries);
      assert.equal(replayed.state, "valid", replayed.errors?.join(" "));
      this.projection = replayed.value;
    },
  };
  state.replay();
  appendSignedEvidence(state, "coulson", "mission_authorization", "governance.decided");
  appendSignedEvidence(state, "fitz", "technical_review", "evidence.recorded");
  appendImplementationAuthority(state, definition);
  return state;
}

function snapshot(state) {
  return {
    entries: structuredClone(state.entries), projection: structuredClone(state.projection),
    journalDigest: `sha256:${createHash("sha256").update(canonicalJson(state.entries)).digest("base64url")}`,
  };
}

function runtime(seatId) {
  return {
    seatId,
    configuredRuntime: { kind: "runtime.configured", runtimeId: `runtime:${seatId}`, model: "model:test" },
    requestedRuntime: { kind: "runtime.requested", runtimeId: `runtime:${seatId}`, model: "model:test" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: `runtime:${seatId}`, model: "model:test", evidenceRefs: [`host:runtime:${seatId}`] },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: { kind: "executor.host_observed", executorId: `executor:${seatId}`, evidenceRefs: ["host:executor"] },
  };
}

function permissionContext(definition, journal) {
  const step = definition.steps.find((item) => item.adapter === "mission_cycle");
  const requiredCapabilities = [...step.requiredCapabilities];
  const cycleInput = {
    repositoryRoot: "/workspace/repository", configuredJournalPath: ".shield/journal.jsonl", missionId: definition.missionId,
    expectedSubjectId: definition.subjectId, expectedRevisionId: journal.projection.brief.revisionId, expectedSequence: journal.projection.lastSequence,
    seatId: step.seatId, actionId: step.actionId, effectClass: step.effectClass, validationId: step.validationId,
    activatedModes: definition.activatedModes.filter((mode) => mode.seatId === step.seatId), actionAllowlist: definition.steps.map((item) => item.actionId),
  };
  const identity = deriveMissionCycleIdentityV1(cycleInput);
  const evaluatedThroughSequence = journal.projection.execution === "not-started" ? journal.projection.lastSequence + 1 : journal.projection.lastSequence;
  return {
    permissionContractVersion: 1, journalSchemaVersion: 9, missionId: definition.missionId, subjectId: definition.subjectId,
    missionRevisionId: journal.projection.brief.revisionId, artifactRevisionId: definition.repositoryRevision, evaluatedThroughSequence,
    reasoningRuntimeId: `runtime:${step.seatId}`, toolExecutorId: `executor:${step.seatId}`, repositoryId: definition.repositoryId,
    canonicalWritableRoot: "/workspace/repository", branch: "agent/mission-builder-test", requiredCapabilities,
    activeBindings: [{
      bindingSchemaVersion: 1, bindingId: `runtime-binding:${step.seatId}:builder`, bindingVersion: 1, missionId: definition.missionId,
      subjectId: definition.subjectId, missionRevisionId: journal.projection.brief.revisionId, seatId: step.seatId,
      reasoningRuntimeId: `runtime:${step.seatId}`, toolExecutorId: `executor:${step.seatId}`, repositoryId: definition.repositoryId,
      canonicalWritableRoot: "/workspace/repository", branch: "agent/mission-builder-test", artifactRevisionId: definition.repositoryRevision,
      recordedAtSequence: 1, activeThroughSequence: null, lifecycleState: "active",
      approvedScope: { actionIds: [step.actionId], effectClasses: [step.effectClass], effectKeys: [identity.effectKey], capabilities: requiredCapabilities },
      coulsonAuthorizationRef: "evidence:coulson:mission_authorization",
    }],
    attestations: [
      { attestationSchemaVersion: 1, attestationId: "attestation:root", kind: "repository_root", hostId: "host:test", toolExecutorId: `executor:${step.seatId}`, repositoryId: definition.repositoryId, canonicalWritableRoot: "/workspace/repository", capabilityId: null, observedValue: "/workspace/repository", observedAt: OBSERVED_AT, expiresAt: "2026-08-10T19:00:00.000Z" },
      { attestationSchemaVersion: 1, attestationId: "attestation:write", kind: "writability", hostId: "host:test", toolExecutorId: `executor:${step.seatId}`, repositoryId: definition.repositoryId, canonicalWritableRoot: "/workspace/repository", capabilityId: null, observedValue: true, observedAt: OBSERVED_AT, expiresAt: "2026-08-10T19:00:00.000Z" },
      ...requiredCapabilities.map((capability) => ({ attestationSchemaVersion: 1, attestationId: `attestation:${capability}`, kind: "capability", hostId: "host:test", toolExecutorId: `executor:${step.seatId}`, repositoryId: definition.repositoryId, canonicalWritableRoot: "/workspace/repository", capabilityId: capability, observedValue: true, observedAt: OBSERVED_AT, expiresAt: "2026-08-10T19:00:00.000Z" })),
    ],
    evaluatedAt: OBSERVED_AT, decisionId: identity.decisionId,
  };
}

function observation(harness, overrides = {}) {
  const journalSnapshot = snapshot(harness.profile);
  const workSeat = harness.definition.steps.find((step) => step.adapter === "mission_cycle").seatId;
  return {
    schemaVersion: 1, contractVersion: "mission.advance.host-observation.v1", assuranceKind: "host_asserted",
    repositoryRoot: "/workspace/repository", repositoryId: harness.definition.repositoryId, repositoryRevision: harness.definition.repositoryRevision,
    configuredJournalPath: ".shield/journal.jsonl", journalSnapshot, workspaceId: "workspace:test", sessionId: "session:parent",
    activatedModes: harness.definition.activatedModes, actionAllowlist: harness.definition.steps.map((step) => step.actionId),
    permissionContext: permissionContext(harness.definition, journalSnapshot), runtimeBindings: [runtime(workSeat), runtime("mack")],
    provenanceRecords: harness.provenanceRecords, stepReceipts: structuredClone(harness.stepReceipts), dispatchReceiptEntries: structuredClone(harness.dispatchEntries),
    ...overrides,
  };
}

function harness(pattern = "delivery", options = {}) {
  const built = build(pattern, options);
  const profile = profileState(built.definition);
  const stepReceipts = [];
  const generatedEntries = provenanceLifecycle(built.definition, "hill", "receipt:provenance:generated", built.definition.templateId);
  const validationEntries = provenanceLifecycle(built.definition, "may", "receipt:provenance:validation", built.definition.definitionRevision, 2, generatedEntries.at(-1).entryDigest);
  const proofreadingEntries = provenanceLifecycle(built.definition, "hill", "receipt:provenance:proofreading", built.definition.definitionRevision, 4, validationEntries.at(-1).entryDigest);
  const dispatchEntries = [...generatedEntries, ...validationEntries, ...proofreadingEntries];
  const provenanceRecords = accepted(built);
  const reports = new Map();
  const audit = [];
  const executedPlans = [];
  let dispatches = 0;
  const appendIfAbsent = async (record) => {
    if (audit.some(({ recordId }) => recordId === record.recordId)) return { appended: false };
    audit.push(structuredClone(record));
    return { schemaVersion: 1, ledgerId: record.ledgerId, recordId: record.recordId, decisionId: record.decisionId, digest: record.digest, appended: true, ledgerSequence: audit.length - 1 };
  };
  const value = {
    definition: built.definition, provenanceRecords, profile, stepReceipts, dispatchEntries, reports, audit, executedPlans,
    get dispatches() { return dispatches; },
    dependencies: {
      missionCycle: {
        readJournal: async () => snapshot(profile),
        appendJournal: async ({ entry }) => {
          if (entry.sequence !== profile.entries.length) return { state: "blocked", code: "stale_sequence", errors: ["stale"] };
          profile.entries.push(structuredClone(entry)); profile.replay();
          return { state: "appended", journalPath: ".shield/journal.jsonl" };
        },
        permissionAudit: { ledgerId: "ledger:builder:test", read: async () => structuredClone(audit), appendIfAbsent },
        executeTool: async (plan) => {
          executedPlans.push(structuredClone(plan));
          return { runnerContractVersion: 1, outcome: "completed", missionId: plan.missionId, subjectId: plan.subjectId, revisionId: plan.revisionId,
            evaluatedThroughSequence: plan.evaluatedThroughSequence, cycleId: plan.cycleId, seatId: plan.seatId, actionId: plan.actionId,
            effectClass: plan.effectClass, effectKey: plan.effectKey, summary: "Bounded pattern execution completed.", evidenceRefs: ["evidence:runner:success"] };
        },
        requiredCapabilities: (plan) => [...built.definition.steps.find((item) => item.stepId === `step:${pattern}:work`).requiredCapabilities],
        validate: async (plan) => ({ runnerContractVersion: 1, outcome: "passed", missionId: plan.missionId, subjectId: plan.subjectId,
          revisionId: plan.revisionId, evaluatedThroughSequence: plan.evaluatedThroughSequence, cycleId: plan.cycleId,
          validationId: plan.validationId, effectKey: plan.effectKey, summary: "Focused validation passed." }),
        now: () => ({ value: OBSERVED_AT, provenance: "hostTrusted" }),
      },
      stepReceiptStore: {
        async append({ receipt, expectedPreviousReceiptDigest }) {
          const existing = stepReceipts.find((item) => item.receiptId === receipt.receiptId);
          if (existing) return canonicalJson(existing) === canonicalJson(receipt) ? { state: "appended" } : { state: "blocked", code: "conflict" };
          if (expectedPreviousReceiptDigest !== stepReceipts.at(-1)?.receiptDigest && !(expectedPreviousReceiptDigest === null && stepReceipts.length === 0)) return { state: "blocked", code: "conflict" };
          stepReceipts.push(structuredClone(receipt)); return { state: "appended" };
        },
        async read() { return structuredClone(stepReceipts); },
      },
      mack: {
        async appendReceipt(event) { dispatchEntries.push(structuredClone(event)); return { state: "appended" }; },
        async readReceipts() { return structuredClone(dispatchEntries); },
        async dispatch() {
          dispatches += 1;
          const report = { schemaVersion: 1, contractVersion: "mack.validation.v0", assuranceKind: "host_asserted_non_authoritative",
            missionId: built.definition.missionId, subjectId: built.definition.subjectId, repository: built.definition.repositoryId,
            branch: "agent/mission-builder-test", artifactRevisionId: built.definition.repositoryRevision, status: "pass",
            scenarios: [{ scenarioId: "scenario:builder", required: true, covered: true }], lanes: [{ laneId: "lane:focused", commandId: "command:test", outcome: "pass" }],
            findings: [], evidenceRefs: ["evidence:mack:success"], limitations: [], editedTestSurfaces: [], recommendedRoute: "advance" };
          const reportRef = `mack-report:${hash("shield.mack-report.v1", report).slice(7)}`; reports.set(reportRef, report); return { reportRef, report };
        },
        async readReport(reportRef) { return structuredClone(reports.get(reportRef)); },
        now() { return OBSERVED_AT; },
      },
    },
  };
  return value;
}

async function advance(h, overrides = {}) {
  return advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: h.definition, observation: observation(h, overrides) }, h.dependencies);
}

function rehashDefinition(definition) {
  const graph = { startNodeId: definition.graph.startNodeId, nodes: definition.graph.nodes, edges: definition.graph.edges };
  definition.graph.graphRevision = hash("shield.mission-graph.v1", graph);
  const { definitionRevision: _ignored, ...content } = definition;
  definition.definitionRevision = hash("shield.mission-definition.v1", content);
  return definition;
}

test("all five patterns execute the actual runner with only the owner's canonical mode subset", async () => {
  for (const pattern of PATTERNS) {
    const h = harness(pattern);
    const result = await advance(h);
    assert.equal(result.outcome, "advanced", `${pattern}:${result.reasonCode}`);
    assert.equal(result.dispatchEffects, 1);
    assert.equal(h.executedPlans.length, 1);
    assert.equal(h.executedPlans[0].seatId, OWNERS[pattern]);
    assert.deepEqual(h.executedPlans[0].activatedModes, h.definition.activatedModes.filter((mode) => mode.seatId === OWNERS[pattern]));
    assert.ok(h.executedPlans[0].activatedModes.every((mode) => mode.seatId === OWNERS[pattern]));
    assert.deepEqual(h.definition.escalation, ["ambiguous", "failed", "uncertain", "scope_change"].map((reason) => ({ reason, route: "hill" })));
    assert.deepEqual(h.definition.stopConditionRoutes, h.definition.stopConditions.map((condition) => ({ condition, route: "hill" })));
  }
});

test("approved escalation and stop-condition contracts reject removal, duplication, and route weakening", () => {
  const h = harness("delivery");
  const escalationRemoved = structuredClone(h.definition); escalationRemoved.escalation.pop();
  assert.equal(validateMissionDefinitionV1(escalationRemoved).state, "invalid");
  const stopDuplicated = structuredClone(h.definition); stopDuplicated.stopConditions[0] = stopDuplicated.stopConditions[1];
  assert.equal(validateMissionDefinitionV1(stopDuplicated).state, "invalid");
  const routeWeakened = structuredClone(h.definition); routeWeakened.stopConditionRoutes[0].route = "hill"; routeWeakened.stopConditionRoutes.pop();
  assert.equal(validateMissionDefinitionV1(routeWeakened).state, "invalid");
});

test("wrong-seat pattern activation and wrong-seat host runtime fail before runner execution", async () => {
  const wrongMode = buildMissionDefinitionV1({ candidate: candidate(), pattern: "delivery", activatedModes: [modeFor("delivery", "hill")], maximumRepairs: 1 });
  assert.equal(wrongMode.state, "blocked");
  const h = harness("delivery");
  const obs = observation(h);
  obs.runtimeBindings = [runtime("daisy"), runtime("mack")];
  const result = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: h.definition, observation: obs }, h.dependencies);
  assert.equal(result.outcome, "blocked");
  assert.equal(result.reasonCode, "observation_mismatch");
  assert.equal(result.dispatchEffects, 0);
  assert.equal(h.executedPlans.length, 0);
});

test("non-mutating Daisy and Fury patterns reject write-capable manifests before effects", async () => {
  for (const pattern of ["debug", "recon", "planning", "review"]) {
    const h = harness(pattern);
    const mutated = structuredClone(h.definition);
    mutated.steps[0].requiredCapabilities = ["filesystem_write"];
    rehashDefinition(mutated);
    assert.equal(validateMissionDefinitionV1(mutated).state, "invalid", pattern);
    const result = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: mutated, observation: observation(h), }, h.dependencies);
    assert.equal(result.outcome, "blocked"); assert.equal(result.dispatchEffects, 0); assert.equal(h.executedPlans.length, 0);
  }
});

test("runtime identity bindings are exact, disjoint, and nested failures stop before dependencies", async () => {
  const h = harness("delivery");
  const workSeat = h.definition.steps.find((step) => step.adapter === "mission_cycle").seatId;
  const duplicate = observation(h, { runtimeBindings: [runtime(workSeat), runtime(workSeat), runtime("mack")] });
  const duplicateResult = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: h.definition, observation: duplicate }, h.dependencies);
  assert.equal(duplicateResult.outcome, "blocked");
  assert.equal(duplicateResult.dispatchEffects, 0);
  let accessed = 0;
  const nested = observation(h);
  nested.runtimeBindings[0].requestedRuntime = new Proxy(nested.runtimeBindings[0].requestedRuntime, { get() { accessed += 1; throw new Error("must not dereference"); } });
  const nestedResult = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: h.definition, observation: nested }, h.dependencies);
  assert.equal(nestedResult.outcome, "blocked");
  assert.equal(nestedResult.dispatchEffects, 0);
  assert.equal(accessed, 0);
});

test("throwing runner stores and Mack read paths classify pre- and post-start effects accurately", async () => {
  const runnerThrow = harness("delivery");
  runnerThrow.dependencies.missionCycle.executeTool = async () => { throw new Error("executor unavailable"); };
  const runnerResult = await advance(runnerThrow);
  assert.equal(runnerResult.outcome, "uncertain");
  assert.equal(runnerResult.dispatchEffects, 1);

  const storeAppendThrow = harness("delivery");
  storeAppendThrow.dependencies.stepReceiptStore.append = async () => { throw new Error("receipt store unavailable"); };
  const appendResult = await advance(storeAppendThrow);
  assert.equal(appendResult.outcome, "uncertain");
  assert.equal(appendResult.dispatchEffects, 1);

  const storeReadThrow = harness("delivery");
  storeReadThrow.dependencies.stepReceiptStore.read = async () => { throw new Error("receipt readback unavailable"); };
  const readResult = await advance(storeReadThrow);
  assert.equal(readResult.outcome, "uncertain");
  assert.equal(readResult.dispatchEffects, 1);

  const reportThrow = harness("delivery");
  await advance(reportThrow);
  await advance(reportThrow);
  reportThrow.dependencies.mack.readReport = async () => { throw new Error("report unavailable"); };
  const reportResult = await advance(reportThrow, { stepReceipts: [reportThrow.stepReceipts[0]] });
  assert.equal(reportResult.outcome, "uncertain");
  assert.equal(reportResult.dispatchEffects, 0);

  const receiptThrow = harness("delivery");
  await advance(receiptThrow);
  receiptThrow.dependencies.mack.readReceipts = async () => { throw new Error("dispatch receipt unavailable"); };
  const receiptResult = await advance(receiptThrow);
  assert.equal(receiptResult.outcome, "uncertain");
  assert.equal(receiptResult.dispatchEffects, 0);

  const mackCommitThenThrow = harness("delivery");
  await advance(mackCommitThenThrow);
  mackCommitThenThrow.dependencies.mack.appendReceipt = async (event) => { mackCommitThenThrow.dispatchEntries.push(structuredClone(event)); throw new Error("committed start unavailable"); };
  const mackCommitResult = await advance(mackCommitThenThrow);
  assert.equal(mackCommitResult.outcome, "uncertain");
  assert.equal(mackCommitResult.dispatchEffects, 0);
  const mackRetry = await advance(mackCommitThenThrow);
  assert.equal(mackRetry.outcome, "uncertain");
  assert.equal(mackRetry.dispatchEffects, 0);
});

test("candidate validation is closed and malformed nested values have zero effects", async () => {
  const valid = candidate();
  let accesses = 0;
  const accessor = structuredClone(valid);
  Object.defineProperty(accessor.repositoryObservation, "repositoryId", { enumerable: true, get() { accesses += 1; return "RanSolo/shield-workspace"; } });
  const blocked = buildMissionDefinitionV1({ candidate: accessor, pattern: "delivery", activatedModes: [modeFor("delivery")], maximumRepairs: 1 });
  assert.equal(blocked.state, "blocked");
  assert.equal(accesses, 0);
  const proxy = structuredClone(valid);
  proxy.brief = new Proxy(proxy.brief, { get() { accesses += 1; throw new Error("must not dereference"); } });
  assert.equal(buildMissionDefinitionV1({ candidate: proxy, pattern: "delivery", activatedModes: [modeFor("delivery")], maximumRepairs: 1 }).state, "blocked");
  assert.equal(accesses, 0);
  const h = harness("delivery");
  const observationValue = observation(h);
  observationValue.journalSnapshot.projection = new Proxy(observationValue.journalSnapshot.projection, { get() { accesses += 1; throw new Error("must not execute"); } });
  const advanced = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: h.definition, observation: observationValue }, h.dependencies);
  assert.equal(advanced.outcome, "blocked");
  assert.equal(advanced.dispatchEffects, 0);
  assert.equal(h.executedPlans.length, 0);
});

test("graph validation binds edge evidence, node-step-seat, prompt, and handoff relations", () => {
  const built = build("delivery");
  const edgeMismatch = structuredClone(built.definition);
  edgeMismatch.graph.edges.find((edge) => edge.fromNodeId === "node:delivery:work").evidenceContractId = "evidence:delivery:mack";
  rehashDefinition(edgeMismatch);
  assert.ok(validateMissionDefinitionV1(edgeMismatch).reasonCodes.includes("edge_evidence_relation_invalid"));
  const stepMismatch = structuredClone(built.definition);
  stepMismatch.steps.find((step) => step.adapter === "mission_cycle").promptId = "prompt:delivery:mack";
  rehashDefinition(stepMismatch);
  assert.ok(validateMissionDefinitionV1(stepMismatch).reasonCodes.includes("step_handoff_relation_invalid"));
});

test("provenance freezes scope, invalidates proofreading on edits, and validates proposed appends under lock", async () => {
  const built = build("delivery");
  const records = accepted(built);
  const edited = editMissionDefinitionTextV1({ definition: built.definition, provenanceRecords: records,
    edits: [{ target: "prompt", targetId: "prompt:delivery:may", replacement: "Hill-edited bounded implementation prompt." }] });
  assert.equal(edited.state, "edited");
  const invalidated = replayMissionProvenanceV1([...records, edited.record]);
  assert.equal(invalidated.state, "invalid");
  const validation = createMissionValidationRecordV1({ definition: edited.definition, provenanceRecords: [...records, edited.record] });
  assert.equal(validation, null);

  const frozenScope = structuredClone(built.provenanceRecords);
  frozenScope[1].repositoryRevision = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const { recordDigest: _digest, ...recordContent } = frozenScope[1];
  frozenScope[1].recordDigest = hash("shield.mission-provenance.v1", recordContent);
  assert.equal(replayMissionProvenanceV1(frozenScope).state, "invalid");

  const stored = [];
  const actorEntries = provenanceLifecycle(built.definition, "hill", "receipt:provenance:generated", built.definition.templateId);
  actorEntries.push(...provenanceLifecycle(built.definition, "may", "receipt:provenance:validation", built.definition.definitionRevision, 2, actorEntries.at(-1).entryDigest));
  actorEntries.push(...provenanceLifecycle(built.definition, "hill", "receipt:provenance:proofreading", built.definition.definitionRevision, 4, actorEntries.at(-1).entryDigest));
  let appendCalls = 0;
  const store = {
    async acquireLock() { return { state: "acquired", lockToken: "lock:test" }; },
    async append({ record }) { appendCalls += 1; stored.push(record); return { state: "appended" }; },
    async replay() { return structuredClone(stored); },
    async readExact({ recordDigest }) { return stored.find((record) => record.recordDigest === recordDigest); },
    async readActorReceipts() { return structuredClone(actorEntries); },
    async recover() { return { state: "blocked", code: "manual_recovery_required" }; },
    async releaseLock() { return { state: "released" }; },
  };
  assert.equal((await appendMissionProvenanceRecordV1(store, built.provenanceRecords[0], "lock-owner:test")).state, "blocked");
  assert.equal((await appendMissionProvenanceRecordV1(store, records[0], "lock-owner:test")).state, "recorded");
  assert.equal((await appendMissionProvenanceRecordV1(store, records[1], "lock-owner:test")).state, "recorded");
  assert.equal((await appendMissionProvenanceRecordV1(store, records[2], "lock-owner:test")).state, "recorded");
  const malformedBase = { ...records[1], actorSeatId: "hill" };
  const { recordDigest: _malformedDigest, ...malformedContent } = malformedBase;
  const malformed = { ...malformedBase, recordDigest: hash("shield.mission-provenance.v1", malformedContent) };
  const rejected = await appendMissionProvenanceRecordV1(store, malformed, "lock-owner:test");
  assert.equal(rejected.state, "blocked");
  assert.equal(appendCalls, 3);

  const commitStoreRecords = [];
  const commitThenThrowStore = { ...store,
    async append({ record }) { commitStoreRecords.push(record); throw new Error("committed provenance append unavailable"); },
    async replay() { return structuredClone(commitStoreRecords); },
  };
  const commitResult = await appendMissionProvenanceRecordV1(commitThenThrowStore, records[0], "lock-owner:test");
  assert.deepEqual(commitResult, { state: "uncertain", code: "manual_recovery_required" });
  const readbackRecords = [];
  const readbackThrowStore = { ...store,
    async append({ record }) { readbackRecords.push(record); return { state: "appended" }; },
    async replay() { return structuredClone(readbackRecords); },
    async readExact() { throw new Error("provenance readback unavailable"); },
  };
  const readbackResult = await appendMissionProvenanceRecordV1(readbackThrowStore, records[0], "lock-owner:test");
  assert.deepEqual(readbackResult, { state: "uncertain", code: "recovery_required" });
  const uncertainAppendStore = { ...store,
    async replay() { return []; },
    async append() { return { state: "uncertain", code: "recovery_required" }; },
    async recover() { throw new Error("recovery unavailable"); },
  };
  const recoveryFailure = await appendMissionProvenanceRecordV1(uncertainAppendStore, records[0], "lock-owner:test");
  assert.deepEqual(recoveryFailure, { state: "uncertain", code: "manual_recovery_required" });
  const unavailableRecoveryStore = { ...uncertainAppendStore,
    async recover() { return { state: "blocked", code: "store_unavailable" }; },
  };
  const unavailableRecovery = await appendMissionProvenanceRecordV1(unavailableRecoveryStore, records[0], "lock-owner:test");
  assert.deepEqual(unavailableRecovery, { state: "uncertain", code: "recovery_required" });
});

test("provenance append finalizes only after proven release and retries only through recovery", async () => {
  const built = build("delivery");
  const record = accepted(built)[0];
  const actorEntries = provenanceLifecycle(built.definition, "hill", "receipt:provenance:generated", built.definition.templateId);
  const makeStore = (overrides = {}) => {
    const stored = [];
    let appendCalls = 0;
    let releaseCalls = 0;
    let appendMode = "success";
    const store = {
      async acquireLock() { return { state: "acquired", lockToken: "lock:test" }; },
      async append({ record: next }) {
        appendCalls += 1;
        if (appendMode === "blocked") return { state: "blocked", code: "store_unavailable" };
        if (appendMode === "throw") throw new Error("append outcome unknown");
        stored.push(next);
        return { state: "appended" };
      },
      async replay() { return structuredClone(stored); },
      async readExact({ recordDigest }) { return stored.find((item) => item.recordDigest === recordDigest); },
      async readActorReceipts() { return structuredClone(actorEntries); },
      async recover() { return { state: "recovered" }; },
      async releaseLock() { releaseCalls += 1; return { state: "released" }; },
      ...overrides,
    };
    return { store, stored, get appendCalls() { return appendCalls; }, get releaseCalls() { return releaseCalls; }, set appendMode(value) { appendMode = value; } };
  };

  const released = makeStore();
  assert.deepEqual(await appendMissionProvenanceRecordV1(released.store, record, "lock-owner:test"), { state: "recorded", record });
  assert.equal(released.appendCalls, 1);
  assert.equal(released.releaseCalls, 1);

  const throwingRelease = makeStore({ async releaseLock() { throw new Error("release uncertain"); } });
  assert.deepEqual(await appendMissionProvenanceRecordV1(throwingRelease.store, record, "lock-owner:test"), { state: "uncertain", code: "manual_recovery_required" });
  assert.equal(throwingRelease.appendCalls, 1);
  assert.deepEqual(await appendMissionProvenanceRecordV1(throwingRelease.store, record, "lock-owner:test"), { state: "uncertain", code: "manual_recovery_required" });
  assert.equal(throwingRelease.appendCalls, 1);

  const blockedRelease = makeStore({
    async append() { return { state: "blocked", code: "conflict" }; },
    async releaseLock() { return { state: "uncertain", code: "recovery_required" }; },
  });
  assert.deepEqual(await appendMissionProvenanceRecordV1(blockedRelease.store, record, "lock-owner:test"), { state: "uncertain", code: "recovery_required" });

  const readbackRelease = makeStore({
    async readExact() { throw new Error("readback unavailable"); },
    async releaseLock() { return { state: "uncertain", code: "manual_recovery_required" }; },
  });
  assert.deepEqual(await appendMissionProvenanceRecordV1(readbackRelease.store, record, "lock-owner:test"), { state: "uncertain", code: "manual_recovery_required" });

  let replayCalls = 0;
  const replayRelease = makeStore({
    async replay() { replayCalls += 1; return replayCalls === 1 ? [] : [{ malformed: true }]; },
    async releaseLock() { return { state: "uncertain", code: "recovery_required" }; },
  });
  assert.deepEqual(await appendMissionProvenanceRecordV1(replayRelease.store, record, "lock-owner:test"), { state: "uncertain", code: "recovery_required" });

  const recoveryRetry = makeStore();
  recoveryRetry.appendMode = "throw";
  assert.deepEqual(await appendMissionProvenanceRecordV1(recoveryRetry.store, record, "lock-owner:test"), { state: "uncertain", code: "recovery_required" });
  assert.equal(recoveryRetry.appendCalls, 1);
  recoveryRetry.appendMode = "success";
  assert.deepEqual(await appendMissionProvenanceRecordV1(recoveryRetry.store, record, "lock-owner:test"), { state: "recorded", record });
  assert.equal(recoveryRetry.appendCalls, 2);
});

test("exact definition provenance is required for proofreading and advance", async () => {
  const built = build("delivery");
  const staleDefinition = structuredClone(built.definition);
  staleDefinition.provenance.generatedDigest = `sha256:${"A".repeat(43)}`;
  rehashDefinition(staleDefinition);
  assert.equal(createMissionProofreadingAcceptanceV1({ definition: staleDefinition, provenanceRecords: built.provenanceRecords }), null);
  const h = harness("delivery");
  const staleRecords = structuredClone(h.provenanceRecords);
  staleRecords[0].templateId = "mission-builder:review";
  const result = await advance(h, { provenanceRecords: staleRecords });
  assert.equal(result.reasonCode, "provenance_stale");
  assert.equal(result.dispatchEffects, 0);
  assert.equal(h.executedPlans.length, 0);
});

test("edited definitions revalidate, proofread, and advance only through the exact provenance chain", async () => {
  const h = harness("delivery");
  const edited = editMissionDefinitionTextV1({ definition: h.definition, provenanceRecords: h.provenanceRecords,
    edits: [{ target: "prompt", targetId: h.definition.prompts[0].promptId, replacement: "Edited bounded implementation prompt." }] });
  assert.equal(edited.state, "edited");
  let previousLogDigest = h.dispatchEntries.at(-1).entryDigest;
  const finalize = (proposal, priorReplay, seatId, receiptId) => {
    const entries = provenanceLifecycle(edited.definition, seatId, receiptId, edited.definition.definitionRevision, h.dispatchEntries.length, previousLogDigest);
    h.dispatchEntries.push(...entries); previousLogDigest = entries.at(-1).entryDigest;
    return finalizeMissionProvenanceRecordV1({ proposal, priorReplay, actorReceiptEntries: h.dispatchEntries, actorReceiptId: receiptId });
  };
  const finalizedEdit = finalize(edited.record, h.provenanceRecords, "hill", "receipt:provenance:edited");
  assert.ok(finalizedEdit);
  const afterEdit = [...h.provenanceRecords, finalizedEdit];
  const validation = createMissionValidationRecordV1({ definition: edited.definition, provenanceRecords: afterEdit });
  assert.ok(validation);
  const finalizedValidation = finalize(validation, [...h.provenanceRecords, finalizedEdit], "may", "receipt:provenance:revalidated");
  assert.ok(finalizedValidation);
  const afterValidation = [...afterEdit, finalizedValidation];
  const proofreading = createMissionProofreadingAcceptanceV1({ definition: edited.definition, provenanceRecords: afterValidation });
  assert.ok(proofreading);
  const finalizedProofreading = finalize(proofreading, [...h.provenanceRecords, finalizedEdit, finalizedValidation], "hill", "receipt:provenance:reproofreading");
  assert.ok(finalizedProofreading);
  const records = [...h.provenanceRecords, finalizedEdit, finalizedValidation, finalizedProofreading];
  h.definition = edited.definition; h.provenanceRecords = records; h.stepReceipts.length = 0; h.audit.length = 0;
  assert.equal(replayMissionProvenanceV1(records).state, "valid", JSON.stringify(replayMissionProvenanceV1(records)));
  assert.equal(replaySeatDispatchReceiptsV1(h.dispatchEntries).state, "valid");
  const result = await advance(h);
  assert.equal(result.outcome, "advanced", result.reasonCode);
  assert.equal(h.executedPlans.length, 1);
});

test("permission preflight and receipt replay reject malformed, nonsequential, exhausted, duplicate, and polluted state with zero effects", async () => {
  const denied = harness("delivery");
  const deniedObservation = observation(denied);
  deniedObservation.permissionContext.requiredCapabilities = ["unexpected_capability"];
  const deniedResult = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: denied.definition, observation: deniedObservation }, denied.dependencies);
  assert.equal(deniedResult.outcome, "blocked"); assert.equal(deniedResult.dispatchEffects, 0);
  assert.equal(denied.executedPlans.length, 0); assert.equal(denied.stepReceipts.length, 0); assert.equal(denied.audit.length, 0); assert.equal(denied.dispatchEntries.length, 6);

  const h = harness("delivery");
  await advance(h);
  const nonsequential = structuredClone(h.stepReceipts); nonsequential[0].attempt = 2;
  const invalid = await advance(h, { stepReceipts: nonsequential });
  assert.equal(invalid.reasonCode, "receipt_invalid"); assert.equal(invalid.dispatchEffects, 0); assert.equal(h.dispatches, 0);
  const duplicate = await advance(h, { stepReceipts: [...h.stepReceipts, structuredClone(h.stepReceipts[0])] });
  assert.equal(duplicate.reasonCode, "receipt_invalid"); assert.equal(duplicate.dispatchEffects, 0);
  h.dependencies.stepReceiptStore.read = async () => [...structuredClone(h.stepReceipts), { polluted: true }];
  const polluted = await advance(h);
  assert.equal(polluted.reasonCode, "uncertain_execution"); assert.equal(polluted.dispatchEffects, 1);
});

test("Mack uses bounded host dispatch, replay does not redispatch, and human gates consume only replayed signed evidence", async () => {
  const h = harness("delivery");
  const work = await advance(h);
  assert.equal(work.outcome, "advanced");
  const mack = await advance(h);
  assert.equal(mack.outcome, "advanced");
  assert.equal(mack.dispatchEffects, 1);
  assert.equal(h.dispatches, 1);
  const workOnly = [h.stepReceipts[0]];
  const replayedMack = await advance(h, { stepReceipts: workOnly });
  assert.equal(replayedMack.outcome, "advanced");
  assert.equal(replayedMack.dispatchEffects, 0);
  assert.equal(h.dispatches, 1);

  const waitingStatus = projectMissionStatusV1(h.definition, h.stepReceipts);
  assert.equal(waitingStatus.currentState, "waiting");
  assert.equal(waitingStatus.activeSeatId, "fitz");
  const fitz = await advance(h);
  assert.equal(fitz.outcome, "advanced");
  assert.equal(fitz.dispatchEffects, 0);
  assert.deepEqual(fitz.receipt.evidenceRefs, ["evidence:fitz:technical_review"]);
  assert.equal(fitz.status.activeSeatId, "coulson");

  const callerArtifact = observation(h);
  callerArtifact.completedEvidence = [{ evidenceContractId: "evidence:delivery:coulson", nodeId: "node:delivery:coulson", artifactRevision: REPOSITORY_REVISION, source: "human_recorded" }];
  const rejected = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: h.definition, observation: callerArtifact }, h.dependencies);
  assert.equal(rejected.outcome, "blocked");
  assert.equal(rejected.dispatchEffects, 0);

  appendSignedEvidence(h.profile, "coulson", "final_acceptance", "final_acceptance.recorded");
  const coulson = await advance(h);
  assert.equal(coulson.outcome, "advanced");
  assert.deepEqual(coulson.receipt.evidenceRefs, ["evidence:coulson:final_acceptance"]);
  assert.equal(coulson.status.currentState, "complete");
  assert.equal(h.dispatches, 1);
});

test("Mack self-reports are preserved and repair exhaustion is deterministic", async () => {
  const h = harness("delivery", { maximumRepairs: 0 });
  await advance(h);
  const mackRuntime = runtime("mack");
  mackRuntime.runtimeSelfReport = { kind: "runtime.self_report.observed", runtimeId: "runtime:self:mack", model: "model:self", evidenceRefs: ["evidence:self:runtime"] };
  mackRuntime.executorSelfReport = { kind: "executor.self_report.observed", executorId: "executor:self:mack", evidenceRefs: ["evidence:self:executor"] };
  const workSeat = h.definition.steps.find((step) => step.adapter === "mission_cycle").seatId;
  const observed = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: h.definition,
    observation: observation(h, { runtimeBindings: [runtime(workSeat), mackRuntime] }) }, h.dependencies);
  assert.equal(observed.outcome, "advanced");
  const started = h.dispatchEntries.find((entry) => entry.kind === "dispatch.started" && entry.accountableSeatId === "mack");
  assert.equal(started.runtimeSelfReport.runtimeId, "runtime:self:mack");
  assert.equal(started.executorSelfReport.executorId, "executor:self:mack");

  const exhausted = harness("delivery", { maximumRepairs: 0 });
  await advance(exhausted);
  const originalDispatch = exhausted.dependencies.mack.dispatch;
  exhausted.dependencies.mack.dispatch = async (handoff) => {
    const result = await originalDispatch(handoff);
    const report = { ...result.report, status: "fail", recommendedRoute: "may" };
    const reportRef = `mack-report:${hash("shield.mack-report.v1", report).slice(7)}`;
    exhausted.reports.set(reportRef, report);
    return { reportRef, report };
  };
  const exhaustedResult = await advance(exhausted);
  assert.equal(exhaustedResult.outcome, "blocked");
  assert.equal(exhaustedResult.reasonCode, "repair_exhausted");
  assert.equal(exhaustedResult.dispatchEffects, 1);
  assert.equal(exhaustedResult.status.currentState, "blocked");
  assert.equal(exhaustedResult.status.nextTransition, null);
  assert.equal(exhaustedResult.status.stopReason, "repair_exhausted");
  const exhaustedRetry = await advance(exhausted);
  assert.equal(exhaustedRetry.outcome, "blocked");
  assert.equal(exhaustedRetry.reasonCode, "repair_exhausted");
  assert.equal(exhaustedRetry.dispatchEffects, 0);
  assert.equal(exhausted.dispatches, 1);

  const nonzero = harness("delivery", { maximumRepairs: 1 });
  await advance(nonzero);
  const nonzeroOriginal = nonzero.dependencies.mack.dispatch;
  nonzero.dependencies.mack.dispatch = async (handoff) => {
    const result = await nonzeroOriginal(handoff);
    const report = { ...result.report, status: "fail", recommendedRoute: "may" };
    const reportRef = `mack-report:${hash("shield.mack-report.v1", report).slice(7)}`;
    nonzero.reports.set(reportRef, report);
    return { reportRef, report };
  };
  assert.equal((await advance(nonzero)).outcome, "advanced");
  const finalRepair = await advance(nonzero);
  assert.equal(finalRepair.outcome, "blocked");
  assert.equal(finalRepair.reasonCode, "repair_exhausted");
  assert.equal(finalRepair.status.currentState, "blocked");
  assert.equal(finalRepair.status.nextTransition, null);
  assert.equal(finalRepair.status.stopReason, "repair_exhausted");
  assert.equal((await advance(nonzero)).dispatchEffects, 0);
});

test("altered Mack dispatch identity is receipt-invalid with zero effects", async () => {
  const h = harness("delivery");
  await advance(h);
  await advance(h);
  const startedIndex = h.dispatchEntries.findIndex((entry) => entry.kind === "dispatch.started" && entry.accountableSeatId === "mack");
  const completedIndex = h.dispatchEntries.findIndex((entry) => entry.kind === "dispatch.completed" && entry.accountableSeatId === "mack");
  const started = h.dispatchEntries[startedIndex];
  const completed = h.dispatchEntries[completedIndex];
  const { entryDigest: _startedDigest, kind: _startedKind, schemaVersion: _startedSchema, contractVersion: _startedContract, ...startedInput } = started;
  const alteredStarted = createSeatDispatchStartedEventV1({ ...startedInput, artifactId: "handoff:altered" });
  const { entryDigest: _completedDigest, schemaVersion: _completedSchema, contractVersion: _completedContract, ...completedInput } = completed;
  const alteredCompleted = createSeatDispatchLifecycleEventV1({ ...completedInput, artifactId: "handoff:altered", previousLifecycleDigest: alteredStarted.entryDigest, previousLogDigest: alteredStarted.entryDigest });
  h.dispatchEntries[startedIndex] = alteredStarted;
  h.dispatchEntries[completedIndex] = alteredCompleted;
  const result = await advance(h);
  assert.equal(result.outcome, "blocked");
  assert.equal(result.reasonCode, "receipt_invalid");
  assert.equal(result.dispatchEffects, 0);
  assert.equal(h.dispatches, 1);
});

test("stale completed Mack identity without a step receipt cannot be adopted", async () => {
  const h = harness("delivery");
  await advance(h);
  await advance(h);
  h.stepReceipts.pop();
  const staleRuntime = runtime("mack");
  staleRuntime.runtimeSelfReport = { kind: "runtime.self_report.observed", runtimeId: "runtime:stale", model: "model:stale", evidenceRefs: ["evidence:stale:runtime"] };
  staleRuntime.executorSelfReport = { kind: "executor.self_report.observed", executorId: "executor:stale", evidenceRefs: ["evidence:stale:executor"] };
  const workSeat = h.definition.steps.find((step) => step.adapter === "mission_cycle").seatId;
  const result = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: h.definition,
    observation: observation(h, { runtimeBindings: [runtime(workSeat), staleRuntime] }) }, h.dependencies);
  assert.equal(result.outcome, "blocked");
  assert.equal(result.reasonCode, "receipt_invalid");
  assert.equal(result.dispatchEffects, 0);
  assert.equal(h.stepReceipts.length, 1);
  assert.equal(h.dispatches, 1);
});

test("runner compilation is definition-bound and canonical", () => {
  const h = harness("debug");
  const obs = observation(h);
  const step = h.definition.steps.find((item) => item.adapter === "mission_cycle");
  const compiledBinding = { definitionRevision: h.definition.definitionRevision, validationRevision: h.provenanceRecords[1].validationRevision, proofreadAcceptanceDigest: h.provenanceRecords[2].proofreadAcceptanceDigest };
  const compiled = compileMissionCycleInputV1(h.definition, obs, step, compiledBinding);
  assert.deepEqual(compiled, compileMissionCycleInputV1(h.definition, obs, structuredClone(step), compiledBinding));
  assert.deepEqual(compiled.activatedModes, h.definition.activatedModes.filter((mode) => mode.seatId === step.seatId));
  const rejectReceiptMutation = (changes) => {
    const entries = structuredClone(obs.dispatchReceiptEntries);
    const started = entries[0]; const completed = entries[1];
    const { entryDigest: _digest, schemaVersion: _schema, contractVersion: _contract, ...input } = completed;
    entries[1] = createSeatDispatchLifecycleEventV1({ ...input, ...changes, previousLifecycleDigest: started.entryDigest, previousLogDigest: started.entryDigest });
    return entries;
  };
  for (const dispatchReceiptEntries of [
    [],
    rejectReceiptMutation({ accountableSeatId: "may" }),
    rejectReceiptMutation({ artifactId: "artifact:wrong" }),
    rejectReceiptMutation({ parentMissionId: "mission:mixed-scope" }),
  ]) {
    assert.throws(() => compileMissionCycleInputV1(h.definition, { ...obs, dispatchReceiptEntries }, step, compiledBinding), /compilation observation/);
  }
  assert.throws(() => compileMissionCycleInputV1(h.definition, obs, { ...step, seatId: "may" }), /runner-backed manifest|stale/);
  for (const [field, replacement] of [["actionId", "mission.delivery.mutated"], ["effectClass", "verification"], ["seatId", "may"]]) {
    const mutated = structuredClone(h.definition);
    mutated.steps[0][field] = replacement;
    rehashDefinition(mutated);
    assert.equal(validateMissionDefinitionV1(mutated).state, "invalid", field);
  }
  const edited = editMissionDefinitionTextV1({ definition: h.definition, provenanceRecords: h.provenanceRecords, edits: [{ target: "prompt", targetId: h.definition.prompts[0].promptId, replacement: "post-edit" }] });
  assert.equal(edited.state, "edited");
  assert.throws(() => compileMissionCycleInputV1(edited.definition, obs, edited.definition.steps.find((item) => item.adapter === "mission_cycle"), compiledBinding), /stale/);
});

test("canonical mission ordering is explicit UTF-8 byte order for mixed case and punctuation", () => {
  const values = ["a", "A", "a-", "a:", "a_", "ä"];
  assert.deepEqual([...values].sort(compareMissionCanonicalTextV1), ["A", "a", "a-", "a:", "a_", "ä"]);
});

test("public definition validation and status projection are total for hostile nested values", () => {
  const h = harness("delivery");
  const cyclic = structuredClone(h.definition); cyclic.prompts[0].content = cyclic;
  const sparse = structuredClone(h.definition); sparse.prompts = []; sparse.prompts.length = 1;
  const throwing = new Proxy(structuredClone(h.definition), { get() { throw new Error("accessor"); } });
  for (const value of [null, 1, "definition", cyclic, sparse, throwing]) {
    assert.doesNotThrow(() => validateMissionDefinitionV1(value));
    assert.equal(validateMissionDefinitionV1(value).state, "invalid");
    assert.doesNotThrow(() => projectMissionStatusV1(value, []));
    assert.equal(projectMissionStatusV1(value, []), null);
  }
});

test("provenance identity rejects canonical-seat self-reports and runtime/executor collisions", async () => {
  for (const mutate of [
    (event) => ({ ...event, runtimeSelfReport: { kind: "runtime.self_report.observed", runtimeId: "may", model: "model:provenance", evidenceRefs: ["evidence:canonical"] } }),
    (event) => ({ ...event, executorSelfReport: { kind: "executor.self_report.observed", executorId: event.runtimeHostObserved.runtimeId, evidenceRefs: ["evidence:collision"] } }),
  ]) {
    const h = harness("delivery");
    const started = h.dispatchEntries[0]; const completed = h.dispatchEntries[1];
    const { entryDigest: _digest, schemaVersion: _schema, contractVersion: _contract, ...input } = completed;
    h.dispatchEntries[1] = createSeatDispatchLifecycleEventV1(mutate({ ...input, previousLifecycleDigest: started.entryDigest, previousLogDigest: started.entryDigest }));
    const result = await advance(h);
    assert.equal(result.outcome, "blocked"); assert.ok(["provenance_stale", "observation_mismatch"].includes(result.reasonCode)); assert.equal(result.dispatchEffects, 0);
  }
});

test("altered step receipts fail replay before any dispatch effect", async () => {
  const h = harness("delivery");
  await advance(h);
  const altered = observation(h);
  altered.stepReceipts[0].edgeId = "edge:delivery:invalid";
  const result = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: h.definition, observation: altered }, h.dependencies);
  assert.equal(result.outcome, "blocked");
  assert.equal(result.reasonCode, "receipt_invalid");
  assert.equal(result.dispatchEffects, 0);
  assert.equal(h.dispatches, 0);
});

test("benchmark contract reports all five before/after metrics", () => {
  const result = missionBuilderBenchmarkV1(
    { hillTokens: 12000, handoffs: 9, elapsedMilliseconds: 600000, repeatedContextReads: 7, humanInterventions: 4 },
    { hillTokens: 4500, handoffs: 6, elapsedMilliseconds: 240000, repeatedContextReads: 2, humanInterventions: 2 },
  );
  assert.deepEqual(result, { state: "valid", deltas: { hillTokens: -7500, handoffs: -3, elapsedMilliseconds: -360000, repeatedContextReads: -5, humanInterventions: -2 } });
});

function transitionPlanInput() {
  return {
    missionId: "mission:issue-270",
    subjectId: "github:RanSolo/shield-workspace/issue/270",
    repositoryId: "RanSolo/shield-workspace",
    planningBaseRevision: "d3f29002fe6c249152763815a633132589b5a9b1",
    parentPlanCommit: "2a95be9fe241a7b8b0c22b3c37439938bf2e8e25",
    parentPlanPath: "docs/missions/issue-270-turnkey-preparation-plan.md",
    parentPlanRawSha256: "764fd6b9496c70d192302378995067df9358965358e4b8215291a758d3050264",
    transitionKind: "fresh_authorize_wheels_up",
    boundedOutcome: "Implement one turnkey reviewed mission transition.",
    approvedRelativePaths: ["packages/shield-team-system/src/mission-builder-v1.mts"],
    publicationPaths: ["packages/shield-team-system/src/mission-builder-v1.mts"],
    approvedActionIds: ["action:issue-270.implement"],
    approvedEffectClasses: ["behavioral_implementation"],
    approvedEffectKeys: ["effect:issue-270.implementation"],
    approvedCapabilities: ["filesystem.write"],
    validationCommandIds: ["validation:nx.team-system"],
    modelId: "model:gpt-5.3-codex-spark",
    reasoningRuntimeId: "runtime:openai-codex",
    toolExecutorId: "executor:codex-hosted",
    exclusions: [
      "review.comment.publish",
      "review.pull_request.update_draft",
      "review.pull_request.mark_ready",
      "merge",
      "deployment",
      "release",
      "final_acceptance",
    ],
  };
}

test("typed transition-plan producer returns one deterministic validated plan without mutating its input", () => {
  const input = transitionPlanInput();
  const before = structuredClone(input);
  const first = buildMissionTransitionPlanV1(input);
  const second = buildMissionTransitionPlanV1(structuredClone(input));
  assert.equal(first.state, "built");
  assert.equal(second.state, "built");
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(first.plan.schemaId, "mission.transition-plan.v1");
  assert.equal(first.plan.authority, "none");
  assert.match(first.plan.id, /^transition-plan:[A-Za-z0-9_-]{43}$/u);
  assert.match(first.plan.digest, /^sha256:[A-Za-z0-9_-]{43}$/u);
  assert.ok(Object.isFrozen(first.plan));
});

test("typed transition-plan producer distinguishes malformed shape from invalid semantics", () => {
  const missing = transitionPlanInput();
  delete missing.missionId;
  assert.deepEqual(buildMissionTransitionPlanV1(missing), {
    state: "invalid",
    code: "malformed_transition_plan_input",
    errors: ["Transition-plan input fields are not closed."],
  });
  assert.equal(buildMissionTransitionPlanV1({ ...transitionPlanInput(), extra: true }).code, "malformed_transition_plan_input");
  assert.equal(buildMissionTransitionPlanV1({ ...transitionPlanInput(), missionId: "" }).code, "invalid_transition_plan");
});

test("typed transition-plan producer rejects proxy, accessor, symbolic, and inherited input", () => {
  assert.equal(buildMissionTransitionPlanV1(new Proxy(transitionPlanInput(), {})).code, "malformed_transition_plan_input");
  const accessor = transitionPlanInput();
  Object.defineProperty(accessor, "missionId", { enumerable: true, get: () => "mission:forged" });
  assert.equal(buildMissionTransitionPlanV1(accessor).code, "malformed_transition_plan_input");
  const symbolic = { ...transitionPlanInput(), [Symbol("authority")]: "forged" };
  assert.equal(buildMissionTransitionPlanV1(symbolic).code, "malformed_transition_plan_input");
  const inherited = Object.assign(Object.create({ authority: "forged" }), transitionPlanInput());
  assert.equal(buildMissionTransitionPlanV1(inherited).code, "malformed_transition_plan_input");
});
