import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  advanceMissionV1,
  appendMissionProvenanceRecordV1,
  buildMissionDefinitionV1,
  compileMissionCycleInputV1,
  createMissionProofreadingAcceptanceV1,
  createMissionValidationRecordV1,
  deriveMissionStepIdentityV1,
  editMissionDefinitionTextV1,
  missionBuilderBenchmarkV1,
  projectMissionStatusV1,
  replayMissionProvenanceV1,
  validateMissionDefinitionV1,
} from "../dist/mission-builder-v1.mjs";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
} from "../dist/mission-v2.mjs";
import {
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";
import { validatePermissionInvocationContext } from "../dist/permission-v1.mjs";

const REPOSITORY_REVISION = "f730cbc3c3da86d42075942d02e23ef5053ce6d6";
const OBSERVED_AT = "2026-08-10T18:00:00.000Z";

function hash(domain, value) {
  return `sha256:${createHash("sha256").update(domain).update("\0").update(canonicalJson(value)).digest("base64url")}`;
}

function candidate({ blocker = false, requireSimmons = false } = {}) {
  const seats = ["hill", "daisy", "fury", "may", "coulson", "fitz", ...(requireSimmons ? ["simmons"] : [])];
  return {
    state: "candidate",
    schemaVersion: 1,
    contractVersion: "mission.intake.v1",
    authority: "non_authoritative",
    persistence: "not_persisted",
    repositoryObservation: { repositoryId: "RanSolo/shield-workspace", headRevision: REPOSITORY_REVISION },
    issueObservation: { issueRevisionId: "issue-comment:167" },
    brief: {
      missionId: "mission:builder:test",
      subjectId: "issue:167",
      objective: "Build one bounded mission definition.",
      requireSimmons,
    },
    requirements: [
      { requiredSeatId: "fitz", requirementId: "requirement:fitz" },
      ...(requireSimmons ? [{ requiredSeatId: "simmons", requirementId: "requirement:simmons" }] : []),
      { requiredSeatId: "coulson", requirementId: "requirement:coulson" },
    ],
    participants: seats.map((seatId) => ({ seatId })),
    blockers: blocker ? [{ code: "REPOSITORY_CONFIG_NOT_OBSERVED", path: "configObservation" }] : [],
  };
}

function modeFor(pattern) {
  return {
    modeId: pattern === "debug" || pattern === "recon" ? "debugger" : "delivery",
    modeVersion: "1.0.0",
    seatId: "hill",
    activationSource: "mission-brief",
  };
}

function build(pattern = "delivery", options = {}) {
  const result = buildMissionDefinitionV1({
    candidate: candidate(options),
    pattern,
    activatedModes: [modeFor(pattern)],
    maximumRepairs: options.maximumRepairs ?? 1,
  });
  assert.equal(result.state, "built", result.reasonCodes.join(","));
  return result;
}

function accepted(buildResult) {
  const acceptance = createMissionProofreadingAcceptanceV1({
    definition: buildResult.definition,
    provenanceRecords: buildResult.provenanceRecords,
  });
  assert.ok(acceptance);
  return [...buildResult.provenanceRecords, acceptance];
}

function profileSnapshot(definition) {
  const key = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = key.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const humanBinding = {
    schemaVersion: 1,
    bindingId: "binding:coulson:test",
    humanPrincipalId: "human:coulson",
    seatId: "coulson",
    missionScope: "*",
    signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:test",
    provenanceRef: "test:binding",
  };
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId: definition.missionId,
    objective: definition.objective,
    subjectId: definition.subjectId,
    riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: true },
    participants: [{ seatId: "hill" }, { seatId: "may" }, { seatId: "daisy" }, { seatId: "fury" }, { seatId: "coulson" }, { seatId: "fitz" }],
    activatedModes: definition.activatedModes,
    requireSimmons: false,
    createdAt: { value: OBSERVED_AT, provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: "sha256:7f1f8c50a703cf43e1c477d88446473c5d1d755b99a4ad35a2b6662558ded7b9",
  });
  const entries = [createProfileAwareMissionBegunEntry(brief, [humanBinding])];
  const replay = replayProfileAwareMissionJournal(entries);
  assert.equal(replay.state, "valid");
  return {
    entries,
    projection: replay.value,
    journalDigest: `sha256:${createHash("sha256").update(canonicalJson(entries)).digest("base64url")}`,
  };
}

function permissionContext(definition, snapshot, seatId = "may") {
  const runtimeId = `runtime:${seatId}`;
  const executorId = "executor:host";
  const step = definition.steps.find((item) => item.seatId === seatId) ?? definition.steps.find((item) => item.adapter === "mission_cycle");
  const context = {
    permissionContractVersion: 1,
    journalSchemaVersion: 9,
    missionId: definition.missionId,
    subjectId: definition.subjectId,
    missionRevisionId: snapshot.projection.brief.revisionId,
    artifactRevisionId: definition.repositoryRevision,
    evaluatedThroughSequence: snapshot.projection.lastSequence,
    reasoningRuntimeId: runtimeId,
    toolExecutorId: executorId,
    repositoryId: definition.repositoryId,
    canonicalWritableRoot: "/workspace/repository",
    branch: "agent/mission-builder-test",
    requiredCapabilities: [],
    activeBindings: [{
      bindingSchemaVersion: 1,
      bindingId: `binding:${seatId}:runtime`,
      bindingVersion: 1,
      missionId: definition.missionId,
      subjectId: definition.subjectId,
      missionRevisionId: snapshot.projection.brief.revisionId,
      seatId,
      reasoningRuntimeId: runtimeId,
      toolExecutorId: executorId,
      repositoryId: definition.repositoryId,
      canonicalWritableRoot: "/workspace/repository",
      branch: "agent/mission-builder-test",
      artifactRevisionId: definition.repositoryRevision,
      recordedAtSequence: 1,
      activeThroughSequence: null,
      lifecycleState: "active",
      approvedScope: { actionIds: [step.actionId], effectClasses: [step.effectClass], effectKeys: ["effect:test"], capabilities: [] },
      coulsonAuthorizationRef: "evidence:coulson:test",
    }],
    attestations: [],
    evaluatedAt: OBSERVED_AT,
    decisionId: "decision:placeholder",
  };
  const checked = validatePermissionInvocationContext(context);
  assert.equal(checked.state, "valid", checked.errors?.join(" "));
  return context;
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

function observation(definition, provenanceRecords, overrides = {}) {
  const snapshot = profileSnapshot(definition);
  const workSeat = definition.steps.find((step) => step.adapter === "mission_cycle").seatId;
  return {
    schemaVersion: 1,
    contractVersion: "mission.advance.host-observation.v1",
    assuranceKind: "host_asserted",
    repositoryRoot: "/workspace/repository",
    repositoryId: definition.repositoryId,
    repositoryRevision: definition.repositoryRevision,
    configuredJournalPath: ".shield/journal.jsonl",
    journalSnapshot: snapshot,
    workspaceId: "workspace:test",
    sessionId: "session:parent",
    activatedModes: definition.activatedModes,
    actionAllowlist: definition.steps.map((step) => step.actionId),
    permissionContext: permissionContext(definition, snapshot, workSeat),
    runtimeBindings: [runtime(workSeat), runtime("mack")],
    completedEvidence: [],
    provenanceRecords,
    stepReceipts: [],
    dispatchReceiptEntries: [],
    ...overrides,
  };
}

function stepReceipt(definition, sequence, fromNodeId, edge, stepId, attempt, outcome, previousReceiptDigest) {
  const base = {
    schemaVersion: 1,
    contractVersion: "mission.step-receipt.v1",
    sequence,
    receiptId: deriveMissionStepIdentityV1(definition.graph.graphRevision, stepId, attempt),
    missionId: definition.missionId,
    definitionRevision: definition.definitionRevision,
    graphRevision: definition.graph.graphRevision,
    stepId,
    attempt,
    fromNodeId,
    toNodeId: edge.toNodeId,
    edgeId: edge.edgeId,
    outcome,
    evidenceRefs: [`artifact:${stepId}:${attempt}`],
    previousReceiptDigest,
  };
  return { ...base, receiptDigest: hash("shield.mission-step-receipt.v1", base) };
}

function receiptsThroughMack(definition) {
  const work = definition.steps.find((step) => step.adapter === "mission_cycle");
  const mack = definition.steps.find((step) => step.adapter === "mack_host");
  const workEdge = definition.graph.edges.find((edge) => edge.fromNodeId === work.nodeId && edge.condition === "success");
  const first = stepReceipt(definition, 0, work.nodeId, workEdge, work.stepId, 1, "success", null);
  const mackEdge = definition.graph.edges.find((edge) => edge.fromNodeId === mack.nodeId && edge.condition === "success");
  const second = stepReceipt(definition, 1, mack.nodeId, mackEdge, mack.stepId, 1, "success", first.receiptDigest);
  return [first, second];
}

function inertDependencies(stepReceipts = []) {
  let dispatchCalls = 0;
  return {
    get dispatchCalls() { return dispatchCalls; },
    value: {
      missionCycle: new Proxy({}, { get() { throw new Error("runner dependency must not be reached"); } }),
      stepReceiptStore: {
        async append({ receipt }) { stepReceipts.push(receipt); return { state: "appended" }; },
        async read() { return stepReceipts; },
      },
      mack: {
        async appendReceipt() { throw new Error("Mack dependency must not be reached"); },
        async readReceipts() { return []; },
        async dispatch() { dispatchCalls += 1; throw new Error("dispatch must not be reached"); },
        async readReport() { throw new Error("report must not be reached"); },
        now() { return OBSERVED_AT; },
      },
    },
  };
}

test("builds all five patterns deterministically with closed graph invariants", () => {
  for (const pattern of ["debug", "delivery", "recon", "planning", "review"]) {
    const first = build(pattern);
    const second = build(pattern);
    assert.deepEqual(first, second);
    assert.equal(validateMissionDefinitionV1(first.definition).state, "valid");
    assert.equal(first.definition.authority, "non_authoritative");
    assert.equal(first.definition.steps.filter((step) => step.adapter === "mission_cycle").length, 1);
    assert.equal(first.definition.steps.filter((step) => step.adapter === "mack_host").length, 1);
    assert.equal(new Set(first.definition.graph.nodes.map((node) => node.nodeId)).size, first.definition.graph.nodes.length);
    assert.equal(new Set(first.definition.graph.edges.map((edge) => edge.edgeId)).size, first.definition.graph.edges.length);
    assert.ok(first.definition.graph.nodes.every((node) => node.kind === "terminal" || first.definition.graph.edges.some((edge) => edge.fromNodeId === node.nodeId && edge.maximumTraversals > 0)));
    assert.ok(first.definition.graph.nodes.filter((node) => node.kind === "human_gate").every((node) => ["coulson", "fitz", "simmons"].includes(node.seatId) && node.stepId === null));
    assert.ok(first.definition.prompts.every((prompt) => prompt.source === "generated"));
    assert.ok(first.definition.handoffs.every((handoff) => handoff.source === "generated"));
  }
});

test("rejects blocked intake, missing activation, extra fields, and unbounded graph tampering", () => {
  assert.equal(buildMissionDefinitionV1({ candidate: candidate({ blocker: true }), pattern: "delivery", activatedModes: [modeFor("delivery")], maximumRepairs: 1 }).state, "blocked");
  assert.equal(buildMissionDefinitionV1({ candidate: candidate(), pattern: "delivery", activatedModes: [modeFor("debug")], maximumRepairs: 1 }).state, "blocked");
  assert.equal(buildMissionDefinitionV1({ candidate: candidate(), pattern: "delivery", activatedModes: [modeFor("delivery")], maximumRepairs: 1, extra: true }).state, "blocked");
  const result = build("delivery");
  const definition = structuredClone(result.definition);
  definition.graph.edges.find((edge) => edge.condition === "repair").maximumTraversals = 99;
  assert.equal(validateMissionDefinitionV1(definition).state, "invalid");
});

test("Hill edits invalidate validation and proofreading until exact revalidation", () => {
  const result = build("delivery");
  const withAcceptance = accepted(result);
  assert.ok(replayMissionProvenanceV1(withAcceptance).value.proofreadAcceptanceDigest);
  const edited = editMissionDefinitionTextV1({
    definition: result.definition,
    provenanceRecords: withAcceptance,
    edits: [{ target: "prompt", targetId: "prompt:delivery:may", replacement: "Hill-edited bounded implementation prompt." }],
  });
  assert.equal(edited.state, "edited");
  const invalidated = replayMissionProvenanceV1([...withAcceptance, edited.record]);
  assert.equal(invalidated.state, "valid");
  assert.equal(invalidated.value.validationRevision, null);
  assert.equal(invalidated.value.proofreadAcceptanceDigest, null);
  const validation = createMissionValidationRecordV1({ definition: edited.definition, provenanceRecords: [...withAcceptance, edited.record] });
  assert.ok(validation);
  const acceptance = createMissionProofreadingAcceptanceV1({ definition: edited.definition, provenanceRecords: [...withAcceptance, edited.record, validation] });
  assert.ok(acceptance);
  assert.equal(replayMissionProvenanceV1([...withAcceptance, edited.record, validation, acceptance]).value.definitionRevision, edited.definition.definitionRevision);
});

test("provenance store append locks, replays, and exact-reads the committed record", async () => {
  const result = build("delivery");
  const records = [];
  let releases = 0;
  const store = {
    async acquireLock() { return { state: "acquired", lockToken: "lock:test" }; },
    async append({ expectedPreviousRecordDigest, record }) {
      assert.equal(expectedPreviousRecordDigest, records.at(-1)?.recordDigest ?? null);
      records.push(record);
      return { state: "appended" };
    },
    async replay() { return records; },
    async readExact({ recordDigest }) { return records.find((record) => record.recordDigest === recordDigest); },
    async recover() { return { state: "blocked", code: "manual_recovery_required" }; },
    async releaseLock() { releases += 1; },
  };
  for (const record of result.provenanceRecords) {
    const appended = await appendMissionProvenanceRecordV1(store, record, "lock-owner:test");
    assert.equal(appended.state, "recorded");
  }
  assert.equal(releases, 2);
  assert.equal(replayMissionProvenanceV1(records).state, "valid");
});

test("missing proofreading and stale receipts produce zero dispatch effects", async () => {
  const result = build("delivery");
  const obs = observation(result.definition, result.provenanceRecords);
  const deps = inertDependencies();
  const missing = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: result.definition, observation: obs }, deps.value);
  assert.equal(missing.outcome, "blocked");
  assert.equal(missing.reasonCode, "proofreading_required");
  assert.equal(missing.dispatchEffects, 0);
  const acceptedRecords = accepted(result);
  const stale = structuredClone(receiptsThroughMack(result.definition));
  stale[0].definitionRevision = `sha256:${"a".repeat(43)}`;
  const staleResult = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: result.definition, observation: observation(result.definition, acceptedRecords, { stepReceipts: stale }) }, deps.value);
  assert.equal(staleResult.reasonCode, "receipt_invalid");
  assert.equal(staleResult.dispatchEffects, 0);
  assert.equal(deps.dispatchCalls, 0);
});

test("runner compilation maps every MissionCycleInputV1 field from definition and host observation", () => {
  const result = build("delivery");
  const obs = observation(result.definition, accepted(result));
  const step = result.definition.steps.find((item) => item.adapter === "mission_cycle");
  const mapped = compileMissionCycleInputV1(result.definition, obs, step);
  assert.deepEqual(mapped, {
    repositoryRoot: obs.repositoryRoot,
    configuredJournalPath: obs.configuredJournalPath,
    missionId: result.definition.missionId,
    expectedSubjectId: result.definition.subjectId,
    expectedRevisionId: obs.journalSnapshot.projection.brief.revisionId,
    expectedSequence: obs.journalSnapshot.projection.lastSequence,
    seatId: step.seatId,
    actionId: step.actionId,
    effectClass: step.effectClass,
    validationId: step.validationId,
    activatedModes: result.definition.activatedModes,
    actionAllowlist: obs.actionAllowlist,
  });
});

test("Mack uses bounded host dispatch receipts, replays without redispatch, and never requests runner authorization", async () => {
  const result = build("delivery");
  const provenanceRecords = accepted(result);
  const work = result.definition.steps.find((step) => step.adapter === "mission_cycle");
  const workEdge = result.definition.graph.edges.find((edge) => edge.fromNodeId === work.nodeId && edge.condition === "success");
  const workReceipt = stepReceipt(result.definition, 0, work.nodeId, workEdge, work.stepId, 1, "success", null);
  const dispatchEntries = [];
  const transitionReceipts = [];
  const reports = new Map();
  let dispatchCalls = 0;
  let runnerReads = 0;
  const deps = {
    missionCycle: new Proxy({}, { get() { runnerReads += 1; throw new Error("runner authorization must not be reached by Mack"); } }),
    stepReceiptStore: {
      async append({ receipt }) {
        const existing = transitionReceipts.find((item) => item.receiptId === receipt.receiptId);
        if (!existing) transitionReceipts.push(receipt);
        else assert.deepEqual(existing, receipt);
        return { state: "appended" };
      },
      async read() { return transitionReceipts; },
    },
    mack: {
      async appendReceipt(event) { dispatchEntries.push(event); return { state: "appended" }; },
      async readReceipts() { return dispatchEntries; },
      async dispatch() {
        dispatchCalls += 1;
        const report = {
          schemaVersion: 1,
          contractVersion: "mack.validation.v0",
          assuranceKind: "host_asserted_non_authoritative",
          missionId: result.definition.missionId,
          subjectId: result.definition.subjectId,
          repository: result.definition.repositoryId,
          branch: "agent/mission-builder-test",
          artifactRevisionId: result.definition.repositoryRevision,
          status: "pass",
          scenarios: [{ scenarioId: "scenario:mission-builder", required: true, covered: true }],
          lanes: [{ laneId: "lane:node-test", commandId: "command:focused", outcome: "pass" }],
          findings: [], evidenceRefs: ["evidence:test"], limitations: [], editedTestSurfaces: [], recommendedRoute: "advance",
        };
        const reportRef = `mack-report:${hash("shield.mack-report.v1", report).slice(7)}`;
        reports.set(reportRef, report);
        return { reportRef, report };
      },
      async readReport(reportRef) { return reports.get(reportRef); },
      now() { return OBSERVED_AT; },
    },
  };
  const firstObservation = observation(result.definition, provenanceRecords, { stepReceipts: [workReceipt], dispatchReceiptEntries: dispatchEntries });
  const first = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: result.definition, observation: firstObservation }, deps);
  assert.equal(first.outcome, "advanced");
  assert.equal(first.dispatchEffects, 1);
  assert.equal(first.mackEvaluation.advancementEligibility, "eligible");
  assert.equal(dispatchCalls, 1);
  assert.equal(runnerReads, 0);
  const replayObservation = observation(result.definition, provenanceRecords, { stepReceipts: [workReceipt], dispatchReceiptEntries: dispatchEntries });
  const replayed = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: result.definition, observation: replayObservation }, deps);
  assert.equal(replayed.outcome, "advanced");
  assert.equal(replayed.dispatchEffects, 0);
  assert.equal(dispatchCalls, 1);
  assert.equal(runnerReads, 0);
});

test("Mack repair routing stops exactly at the configured bound", async () => {
  const result = build("delivery", { maximumRepairs: 0 });
  const provenanceRecords = accepted(result);
  const work = result.definition.steps.find((step) => step.adapter === "mission_cycle");
  const workEdge = result.definition.graph.edges.find((edge) => edge.fromNodeId === work.nodeId && edge.condition === "success");
  const workReceipt = stepReceipt(result.definition, 0, work.nodeId, workEdge, work.stepId, 1, "success", null);
  const dispatchEntries = [];
  const transitionReceipts = [];
  let dispatchCalls = 0;
  const deps = {
    missionCycle: new Proxy({}, { get() { throw new Error("runner must not be reached"); } }),
    stepReceiptStore: {
      async append({ receipt }) { transitionReceipts.push(receipt); return { state: "appended" }; },
      async read() { return transitionReceipts; },
    },
    mack: {
      async appendReceipt(event) { dispatchEntries.push(event); return { state: "appended" }; },
      async readReceipts() { return dispatchEntries; },
      async dispatch() {
        dispatchCalls += 1;
        const report = {
          schemaVersion: 1, contractVersion: "mack.validation.v0", assuranceKind: "host_asserted_non_authoritative",
          missionId: result.definition.missionId, subjectId: result.definition.subjectId, repository: result.definition.repositoryId,
          branch: "agent/mission-builder-test", artifactRevisionId: result.definition.repositoryRevision, status: "fail",
          scenarios: [{ scenarioId: "scenario:failed", required: true, covered: true }],
          lanes: [{ laneId: "lane:failed", commandId: "command:focused", outcome: "pass" }], findings: [],
          evidenceRefs: ["evidence:failed"], limitations: [], editedTestSurfaces: [], recommendedRoute: "may",
        };
        return { reportRef: `mack-report:${hash("shield.mack-report.v1", report).slice(7)}`, report };
      },
      async readReport() { throw new Error("replay report must not be needed"); },
      now() { return OBSERVED_AT; },
    },
  };
  const resultValue = await advanceMissionV1({
    schemaVersion: 1,
    contractVersion: "mission.advance.v1",
    definition: result.definition,
    observation: observation(result.definition, provenanceRecords, { stepReceipts: [workReceipt], dispatchReceiptEntries: dispatchEntries }),
  }, deps);
  assert.equal(resultValue.outcome, "blocked");
  assert.equal(resultValue.reasonCode, "repair_exhausted");
  assert.equal(resultValue.dispatchEffects, 1);
  assert.equal(dispatchCalls, 1);
  assert.equal(transitionReceipts.length, 0);
});

test("human seats are wait-only transitions with zero dispatch effects", async () => {
  const result = build("delivery");
  const provenanceRecords = accepted(result);
  const receipts = receiptsThroughMack(result.definition);
  const status = projectMissionStatusV1(result.definition, receipts, []);
  assert.equal(status.currentState, "waiting");
  assert.equal(status.activeSeatId, "fitz");
  const transitionReceipts = [...receipts];
  const deps = inertDependencies(transitionReceipts);
  const waiting = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: result.definition, observation: observation(result.definition, provenanceRecords, { stepReceipts: receipts }) }, deps.value);
  assert.equal(waiting.outcome, "waiting");
  assert.equal(waiting.reasonCode, "human_evidence_required");
  assert.equal(waiting.dispatchEffects, 0);
  const fitzNode = result.definition.graph.nodes.find((node) => node.seatId === "fitz");
  const evidence = [{ evidenceContractId: `evidence:delivery:fitz`, nodeId: fitzNode.nodeId, artifactRevision: REPOSITORY_REVISION, source: "human_recorded" }];
  const advanced = await advanceMissionV1({ schemaVersion: 1, contractVersion: "mission.advance.v1", definition: result.definition, observation: observation(result.definition, provenanceRecords, { stepReceipts: receipts, completedEvidence: evidence }) }, deps.value);
  assert.equal(advanced.outcome, "advanced");
  assert.equal(advanced.dispatchEffects, 0);
  assert.equal(advanced.status.activeSeatId, "coulson");
  assert.equal(deps.dispatchCalls, 0);
});

test("benchmark contract reports all five before/after metrics", () => {
  const result = missionBuilderBenchmarkV1(
    { hillTokens: 12000, handoffs: 9, elapsedMilliseconds: 600000, repeatedContextReads: 7, humanInterventions: 4 },
    { hillTokens: 4500, handoffs: 6, elapsedMilliseconds: 240000, repeatedContextReads: 2, humanInterventions: 2 },
  );
  assert.deepEqual(result, { state: "valid", deltas: { hillTokens: -7500, handoffs: -3, elapsedMilliseconds: -360000, repeatedContextReads: -5, humanInterventions: -2 } });
});
