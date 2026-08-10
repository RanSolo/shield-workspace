import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { createShieldConfig } from "../dist/config.mjs";
import { missionIntakeV1 } from "../dist/mission-intake-v1.mjs";
import {
  advanceMissionV1,
  appendMissionProvenanceRecordV1,
  buildMissionDefinitionV1,
  compileMissionCycleInputV1,
  createMissionProofreadingAcceptanceV1,
  createMissionValidationRecordV1,
  editMissionDefinitionTextV1,
  missionBuilderBenchmarkV1,
  projectMissionStatusV1,
  replayMissionProvenanceV1,
  validateMissionDefinitionV1,
} from "../dist/mission-builder-v1.mjs";
import { deriveMissionCycleIdentityV1 } from "../dist/mission-runtime-v1.mjs";
import { canonicalJson, computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
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
  const acceptance = createMissionProofreadingAcceptanceV1({ definition: buildResult.definition, provenanceRecords: buildResult.provenanceRecords });
  assert.ok(acceptance);
  return [...buildResult.provenanceRecords, acceptance];
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
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: `runtime:${seatId}`, model: "model:test", evidenceRefs: [`host:runtime:${seatId}`] },
    executorHostObserved: { kind: "executor.host_observed", executorId: "executor:host", evidenceRefs: ["host:executor"] },
  };
}

function permissionContext(definition, journal) {
  const step = definition.steps.find((item) => item.adapter === "mission_cycle");
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
    reasoningRuntimeId: `runtime:${step.seatId}`, toolExecutorId: "executor:host", repositoryId: definition.repositoryId,
    canonicalWritableRoot: "/workspace/repository", branch: "agent/mission-builder-test", requiredCapabilities: ["filesystem_write"],
    activeBindings: [{
      bindingSchemaVersion: 1, bindingId: `runtime-binding:${step.seatId}:builder`, bindingVersion: 1, missionId: definition.missionId,
      subjectId: definition.subjectId, missionRevisionId: journal.projection.brief.revisionId, seatId: step.seatId,
      reasoningRuntimeId: `runtime:${step.seatId}`, toolExecutorId: "executor:host", repositoryId: definition.repositoryId,
      canonicalWritableRoot: "/workspace/repository", branch: "agent/mission-builder-test", artifactRevisionId: definition.repositoryRevision,
      recordedAtSequence: 1, activeThroughSequence: null, lifecycleState: "active",
      approvedScope: { actionIds: [step.actionId], effectClasses: [step.effectClass], effectKeys: [identity.effectKey], capabilities: ["filesystem_write"] },
      coulsonAuthorizationRef: "evidence:coulson:mission_authorization",
    }],
    attestations: [
      { attestationSchemaVersion: 1, attestationId: "attestation:root", kind: "repository_root", hostId: "host:test", toolExecutorId: "executor:host", repositoryId: definition.repositoryId, canonicalWritableRoot: "/workspace/repository", capabilityId: null, observedValue: "/workspace/repository", observedAt: OBSERVED_AT, expiresAt: "2026-08-10T19:00:00.000Z" },
      { attestationSchemaVersion: 1, attestationId: "attestation:write", kind: "writability", hostId: "host:test", toolExecutorId: "executor:host", repositoryId: definition.repositoryId, canonicalWritableRoot: "/workspace/repository", capabilityId: null, observedValue: true, observedAt: OBSERVED_AT, expiresAt: "2026-08-10T19:00:00.000Z" },
      { attestationSchemaVersion: 1, attestationId: "attestation:filesystem", kind: "capability", hostId: "host:test", toolExecutorId: "executor:host", repositoryId: definition.repositoryId, canonicalWritableRoot: "/workspace/repository", capabilityId: "filesystem_write", observedValue: true, observedAt: OBSERVED_AT, expiresAt: "2026-08-10T19:00:00.000Z" },
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
  const dispatchEntries = [];
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
    definition: built.definition, provenanceRecords: accepted(built), profile, stepReceipts, dispatchEntries, reports, audit, executedPlans,
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
        requiredCapabilities: () => ["filesystem_write"],
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
  }
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
  assert.equal(invalidated.state, "valid");
  assert.equal(invalidated.value.validationRevision, null);
  assert.equal(invalidated.value.proofreadAcceptanceDigest, null);
  const validation = createMissionValidationRecordV1({ definition: edited.definition, provenanceRecords: [...records, edited.record] });
  const acceptance = createMissionProofreadingAcceptanceV1({ definition: edited.definition, provenanceRecords: [...records, edited.record, validation] });
  assert.ok(validation);
  assert.ok(acceptance);

  const frozenScope = structuredClone(built.provenanceRecords);
  frozenScope[1].repositoryRevision = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const { recordDigest: _digest, ...recordContent } = frozenScope[1];
  frozenScope[1].recordDigest = hash("shield.mission-provenance.v1", recordContent);
  assert.equal(replayMissionProvenanceV1(frozenScope).state, "invalid");

  const stored = [];
  let appendCalls = 0;
  const store = {
    async acquireLock() { return { state: "acquired", lockToken: "lock:test" }; },
    async append({ record }) { appendCalls += 1; stored.push(record); return { state: "appended" }; },
    async replay() { return structuredClone(stored); },
    async readExact({ recordDigest }) { return stored.find((record) => record.recordDigest === recordDigest); },
    async recover() { return { state: "blocked", code: "manual_recovery_required" }; },
    async releaseLock() {},
  };
  assert.equal((await appendMissionProvenanceRecordV1(store, built.provenanceRecords[0], "lock-owner:test")).state, "recorded");
  const malformedBase = { ...built.provenanceRecords[1], actorSeatId: "hill" };
  const { recordDigest: _malformedDigest, ...malformedContent } = malformedBase;
  const malformed = { ...malformedBase, recordDigest: hash("shield.mission-provenance.v1", malformedContent) };
  const rejected = await appendMissionProvenanceRecordV1(store, malformed, "lock-owner:test");
  assert.equal(rejected.state, "blocked");
  assert.equal(appendCalls, 1);
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

test("runner compilation is definition-bound and canonical", () => {
  const h = harness("debug");
  const obs = observation(h);
  const step = h.definition.steps.find((item) => item.adapter === "mission_cycle");
  const compiled = compileMissionCycleInputV1(h.definition, obs, step);
  assert.deepEqual(compiled.activatedModes, h.definition.activatedModes.filter((mode) => mode.seatId === step.seatId));
  assert.throws(() => compileMissionCycleInputV1(h.definition, obs, { ...step, seatId: "may" }), /runner-backed manifest/);
});

test("benchmark contract reports all five before/after metrics", () => {
  const result = missionBuilderBenchmarkV1(
    { hillTokens: 12000, handoffs: 9, elapsedMilliseconds: 600000, repeatedContextReads: 7, humanInterventions: 4 },
    { hillTokens: 4500, handoffs: 6, elapsedMilliseconds: 240000, repeatedContextReads: 2, humanInterventions: 2 },
  );
  assert.deepEqual(result, { state: "valid", deltas: { hillTokens: -7500, handoffs: -3, elapsedMilliseconds: -360000, repeatedContextReads: -5, humanInterventions: -2 } });
});
