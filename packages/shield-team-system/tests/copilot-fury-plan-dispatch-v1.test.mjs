import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { chmod, copyFile, cp, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { CopilotClient as RealCopilotClient, RuntimeConnection as RealRuntimeConnection } from "@github/copilot-sdk";

import {
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS,
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS,
  COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
  COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2,
  COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID,
  COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
  COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS,
  COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF,
  COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2,
  COPILOT_FURY_PLAN_FINDING_CODES_V2,
  COPILOT_FURY_PLAN_PHASE_CONTRACT_ERROR_CODE_V2,
  COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
  createCopilotFuryPlanExecutorV1,
  deriveCopilotSdkSessionIdV1,
  dispatchCopilotFuryPlanReviewV1,
  evaluateCopilotFuryRecoveryEligibilityV1,
  probeCopilotFuryDispatchCapabilityV1,
  validateCopilotFurySuccessorExecutionConfigurationV3,
  validateCopilotFuryPlanDispatchRequestV1,
  validateCopilotFuryPlanDispatchRequestV2,
  validateCopilotFuryPlanResultV2,
} from "../dist/copilot-fury-plan-dispatch-v1.mjs";
import {
  COPILOT_FURY_PLAN_DISPATCH_ADMISSION_RECOVERABLE_OUTPUT_EVIDENCE_DIGEST,
  COPILOT_FURY_PLAN_DISPATCH_ADMISSION_RECOVERABLE_PACKET_DIGEST,
  COPILOT_FURY_PLAN_DISPATCH_ADMISSION_RECOVERABLE_RECEIPT_ID,
  COPILOT_FURY_PLAN_DISPATCH_ADMISSION_RECOVERABLE_TERMINAL_ENTRY_DIGEST,
  COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_OUTPUT_EVIDENCE_DIGEST,
  COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_PACKET_DIGEST,
  COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_TERMINAL_ENTRY_DIGEST,
  buildCopilotFuryReviewArtifactMapV1,
  createCopilotFuryExecutionToolBindingV1,
  dispatchCopilotFuryPlanReviewCoreV1,
  resolveCommittedTransitionPlanSourceV1,
  validateCopilotFuryReviewArtifactMapV1,
} from "../dist/copilot-fury-plan-dispatch-core-v1.mjs";
import { replaySeatDispatchReceiptsV1 } from "../dist/seat-dispatch-receipt-v1.mjs";
import { appendSeatDispatchReceiptEntryV1, readSeatDispatchReceiptLedgerV1 } from "../dist/seat-dispatch-store.mjs";
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { buildMissionTransitionPlanV1 } from "../dist/mission-builder-v1.mjs";
import { canonicalJson, computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
  MISSION_130_JOURNAL_DIGEST,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
} from "../dist/profile-aware-mission-v1.mjs";

const FURY_CARD = `---
name: Fury
description: Review exact SHIELD plans and revisions for technical conformance.
argument-hint: Provide the reviewed artifact, exact revision, digests, and gate evidence.
target: vscode
user-invocable: true
disable-model-invocation: true
tools: [read, search, web]
---

You are Fury. Review only the exact plan and return a technical verdict with authority none.
`;

const ISSUE_383_RECOVERY_FIXTURE = Object.freeze({
  predecessorReceiptId: "receipt:sVgAqsU53kRLIUKg4frtNEzHy9vOqU3c",
  terminalEntryDigest: "sha256:SN427iHPVSZwrmqUvs9bDEKu0k9LKEk69zMEf53Ujzc",
  outputEvidenceDigest: "sha256:ZQ2YCXxtHe-bA3F1CvdiVorSWOEblvTKL4kWSnqBKHM",
  dispositionCode: "COPILOT_EXECUTION_FAILED",
  errors: Object.freeze(["Copilot session identity or policy drifted."]),
  packetDigest: "sha256:z1jfC-m15ozX07UHP5hZaUMVNEvvAIIyyWGogi14fdM",
});

const ISSUE_384_ADMISSION_RECOVERY_FIXTURE = Object.freeze({
  predecessorReceiptId: "receipt:BXq8_kk7dlFZ8P7_-9MQrQOl2onMu1nR",
  terminalEntryDigest: "sha256:czI_Kiq9sCml_6YN8l2nbIKYhfzbgUp_9SOqfHCgpQ8",
  outputEvidenceDigest: "sha256:3j8HM0LmVP3ks0lNJhTlJdK0CYkcRZc7Kw7DE8cjuyg",
  dispositionCode: "COPILOT_EXECUTION_FAILED",
  errors: Object.freeze(["Copilot session identity or policy drifted."]),
  packetDigest: "sha256:z1jfC-m15ozX07UHP5hZaUMVNEvvAIIyyWGogi14fdM",
});

const ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE = Object.freeze({
  predecessorReceiptId: "receipt:BWD7KctxEGKtaap9IWyX31pDpnF94D6P",
  terminalEntryDigest: "sha256:-Ss_SP91X-KqZ4Ng2-k0AFx9902yhKC-FSaoQiLITW4",
  outputEvidenceDigest: "sha256:iagGiK0Atepc3A2AtXgU4I4cJz7XEBRbPJQlHvMzvGE",
  dispositionCode: "COPILOT_EXECUTION_FAILED",
  errors: Object.freeze(["Copilot session identity or policy drifted."]),
  packetDigest: "sha256:z1jfC-m15ozX07UHP5hZaUMVNEvvAIIyyWGogi14fdM",
});

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function digestBase64Url(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("base64url")}`;
}

function v1Request(current, overrides = {}) {
  const { reviewPhase: _reviewPhase, ...fields } = current.request;
  return { ...fields, schemaVersion: 1, contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION, ...overrides };
}

function v1Identity(current, request = v1Request(current)) {
  const operation = {
    missionId: request.missionId, missionRevision: request.missionRevision, parentSessionId: request.parentSessionId,
    subjectId: request.subjectId, subjectRevision: request.subjectRevision, transitionPlanId: current.plan.id,
    transitionPlanDigest: current.plan.digest, repositoryId: request.repositoryId,
    repositoryWorkspaceId: request.repositoryWorkspaceId, repositoryRevision: request.headRevision, accountableSeatId: "fury",
  };
  const operationDigest = digestBase64Url(`copilot-fury-logical-operation-v1\0${canonicalJson(operation)}`);
  const token = operationDigest.slice("sha256:".length, "sha256:".length + 32);
  const packetId = `packet:copilot-fury:${token}`;
  const claimKey = createHash("sha256").update(`seat-dispatch-claim-v1\0${request.missionId}\0${request.parentSessionId}\0${packetId}`).digest("base64url").slice(0, 32);
  return { operationDigest, packetId, claimKey, receiptId: `receipt:${claimKey}`, childTaskId: `task:${claimKey}`, childSessionId: `session:${claimKey}` };
}

function historicalV1Packet(current, request) {
  const identity = v1Identity(current, request);
  const cardIdentity = {
    sourceKind: "repository", logicalRef: ".github/agents/fury.agent.md", contentDigest: sha256(FURY_CARD), repositoryRevision: request.headRevision,
    precedenceObservations: [
      { sourceKind: "repository", logicalRef: ".github/agents/fury.agent.md", disposition: "selected", contentDigest: sha256(FURY_CARD) },
      { sourceKind: "user", logicalRef: COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF, disposition: "absent", contentDigest: null },
    ],
  };
  const sdkConfiguration = {
    packageName: "@github/copilot-sdk", packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, clientMode: "empty",
    sessionId: identity.childSessionId, repositoryRevision: request.headRevision, selectedAgent: "fury", model: request.requestedModel,
    customAgentsLocalOnly: true, enableConfigDiscovery: false, skipCustomInstructions: true, enableFileHooks: false,
    enableHostGitOperations: false, enableSessionStore: false, enableSkills: false, pluginDirectories: [], skillDirectories: [],
    instructionDirectories: [], mcpServers: {}, availableTools: ["read", "search"],
    excludedTools: ["write", "edit", "apply_patch", "bash", "shell", "execute", "web", "mcp:*", "custom:*"], allowedEffects: [],
  };
  const outputContract = canonicalJson({ schemaVersion: 1, contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION, authority: "none", reviewerSeatId: "fury", reviewedArtifactId: current.plan.id, reviewedArtifactRevision: current.plan.digest, verdict: "PASS | REVISE", findings: [{ code: "identifier (REVISE only)", message: "bounded actionable finding (REVISE only)" }] });
  const packet = { schemaVersion: 1, contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION, authority: "none", request, transitionPlan: current.plan, cardIdentity, cardBodyDigest: sha256(FURY_CARD.slice(FURY_CARD.indexOf("\n---\n") + 5)), missionJournal: { digest: current.journalDigest, sequence: 0 }, outputContract, sdkConfiguration };
  return { identity, packet, packetDigest: digestBase64Url(canonicalJson(packet)), cardIdentity, sdkConfiguration };
}

function historicalV1Ledger(current, request, state, { mutateReceipt = (value) => value, mutateEvidence = (value) => value } = {}) {
  const { identity, packet, packetDigest, cardIdentity, sdkConfiguration } = historicalV1Packet(current, request);
  const inputEvidenceRefs = [current.plan.id, current.plan.digest, `sha256:${request.transitionPlanRawSha256}`, `sha256:${cardIdentity.contentDigest}`, current.journalDigest, `evidence:packet-binding:seat-dispatch-v1:${identity.claimKey}:${packetDigest}`];
  const terminal = state !== "started" && state !== "resumed";
  const dispositionCode = state === "completed" ? null : state === "interrupted" ? "DISPATCH_INTERRUPTED" : terminal ? `DISPATCH_${state.toUpperCase()}` : null;
  const errors = dispositionCode === null ? [] : [`historical ${state}`];
  let evidence = terminal ? {
    schemaVersion: 1, contractVersion: "shield.copilot-fury-plan-dispatch.evidence.v1", authority: "none", packetId: identity.packetId,
    packetDigest, packet, receiptId: identity.receiptId, missionId: request.missionId, missionRevision: request.missionRevision,
    subjectId: request.subjectId, subjectRevision: request.subjectRevision, repositoryId: request.repositoryId,
    repositoryWorkspaceId: request.repositoryWorkspaceId, repositoryRevision: request.headRevision,
    transitionPlanRawSha256: request.transitionPlanRawSha256, cardIdentity, sdkConfiguration, missionJournal: packet.missionJournal,
    outcome: state === "completed" ? "REVISE" : state, dispositionCode,
    modelResult: state === "completed" ? { schemaVersion: 1, contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION, authority: "none", reviewerSeatId: "fury", reviewedArtifactId: current.plan.id, reviewedArtifactRevision: current.plan.digest, verdict: "REVISE", findings: [{ code: "PLAN_NEEDS_REVISION", message: "Preserved historical finding." }] } : null,
    observations: {}, errors, artifacts: { transitionPlanPath: null, reviewArtifactPath: null },
  } : null;
  if (evidence !== null) {
    evidence = mutateEvidence(evidence);
    evidence = { ...evidence, evidenceDigest: digestBase64Url(`${evidence.contractVersion}\0${canonicalJson(evidence)}`) };
    const directory = join(current.root, ".shield", "audit", "copilot-fury-plan-dispatch", sha256(request.missionId));
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(join(directory, `dispatch-evidence-${evidence.evidenceDigest.slice("sha256:".length)}.json`), `${canonicalJson(evidence)}\n`, { mode: 0o600 });
  }
  const evidenceDigest = evidence?.evidenceDigest ?? null;
  const projection = mutateReceipt({
    schemaVersion: 1, contractVersion: "shield.seat-dispatch.event.v1", receiptId: identity.receiptId, dispatchId: `dispatch:${identity.claimKey}`,
    parentMissionId: request.missionId, parentMissionRevision: request.missionRevision, parentSessionId: request.parentSessionId,
    childTaskId: identity.childTaskId, childSessionId: identity.childSessionId, accountableSeatId: "fury", repositoryId: request.repositoryId,
    repositoryWorkspaceId: request.repositoryWorkspaceId, repositoryRevision: request.headRevision, subjectId: request.subjectId,
    subjectRevision: request.subjectRevision, artifactId: current.plan.id, artifactRevision: current.plan.digest,
    configuredRuntime: { kind: "runtime.configured", runtimeId: request.requestedRuntime, model: request.requestedModel },
    requestedRuntime: { kind: "runtime.requested", runtimeId: request.requestedRuntime, model: request.requestedModel },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: request.requestedExecutor }, state, startedAt: request.timestamp.value,
    lastEventTimestamp: terminal ? "2026-08-18T12:01:00.001Z" : request.timestamp.value, logSequence: terminal ? 1 : 0,
    lastEntryDigest: digestBase64Url(`historical-v1-${state}`), previousLogDigest: terminal ? digestBase64Url("historical-v1-started") : null,
    lifecycleSequence: terminal ? 1 : 0, previousLifecycleDigest: terminal ? digestBase64Url("historical-v1-started") : null,
    runtimeSelfReportHistory: [], runtimeHostHistory: [], executorSelfReportHistory: [], executorHostHistory: [], inputEvidenceRefs,
    outputEvidenceRefs: terminal && state !== "interrupted" ? [evidenceDigest] : null,
    recoveryEvidenceRefs: state === "interrupted" ? [evidenceDigest] : null,
    originalDisposition: state === "interrupted" ? { code: dispositionCode, errors } : null,
  });
  return { identity, projection, packetDigest: () => packetDigest, evidence: () => evidence, readDispatchLedger: async () => ({ state: "valid", value: { logPath: join(current.root, ".shield", "dispatch-receipts.jsonl"), entries: [], projections: [projection] } }) };
}

test("exact replay reobserves durable pending and late terminal states without reinvocation", async () => {
  for (const state of ["started", "uncertain", "completed", "failed", "cancelled"]) {
    const current = await fixture();
    const request = v1Request(current);
    const observedLedger = historicalV1Ledger(current, request, state);
    const startedLedger = state === "started" ? observedLedger : historicalV1Ledger(current, request, "started");
    const calls = { execute: 0 };
    const executor = {
      async preflight() { throw new Error("replay must not preflight"); },
      async execute() { calls.execute += 1; throw new Error("replay must not execute"); },
    };
    const result = await dispatchCopilotFuryPlanReviewV1(request, {
      executor,
      userCopilotHome: current.userCopilotHome,
      readDispatchLedger: startedLedger.readDispatchLedger,
      async claimDispatchPacket() {
        return { state: "valid", logPath: join(current.root, ".shield", "dispatch-receipts.jsonl"), byteLength: 0, packetDigest: startedLedger.packetDigest(), receipt: startedLedger.projection, claimStatus: "already_claimed" };
      },
      async durableSessionObserver({ receipt }) {
        if (state === "started") return { state: "pending", receipt };
        if (state === "uncertain") return { state: "uncertain", receipt };
        return { state: "terminal", receipt: observedLedger.projection };
      },
    });
    assert.equal(calls.execute, 0, `${state}: executor was reinvoked`);
    if (state === "started") {
      assert.equal(result.state, "recovery_required", JSON.stringify(result));
      assert.equal(result.code, "DISPATCH_PENDING");
      assert.equal(result.receiptId, startedLedger.projection.receiptId);
    } else if (state === "uncertain") {
      assert.equal(result.state, "recovery_required", JSON.stringify(result));
      assert.equal(result.code, "DISPATCH_UNCERTAIN");
      assert.deepEqual(result.errors, ["The exact dispatch session state is uncertain; retry the same receipt after host recovery."]);
    } else if (state === "completed") {
      assert.equal(result.state, "completed", JSON.stringify(result));
      assert.equal(result.disposition, "REVISE");
    } else {
      assert.equal(result.state, state, JSON.stringify(result));
    }
  }
});

test("durable replay rejects stale identity deterministically without execution", async () => {
  const current = await fixture();
  const request = v1Request(current);
  const startedLedger = historicalV1Ledger(current, request, "started");
  const terminalLedger = historicalV1Ledger(current, request, "completed");
  const result = await dispatchCopilotFuryPlanReviewV1(request, {
    executor: { async preflight() { throw new Error("must not preflight"); }, async execute() { throw new Error("must not execute"); } },
    userCopilotHome: current.userCopilotHome,
    readDispatchLedger: startedLedger.readDispatchLedger,
    async claimDispatchPacket() { return { state: "valid", logPath: join(current.root, ".shield", "dispatch-receipts.jsonl"), byteLength: 0, packetDigest: startedLedger.packetDigest(), receipt: startedLedger.projection, claimStatus: "already_claimed" }; },
    async durableSessionObserver({ receipt }) { return { state: "terminal", receipt: { ...terminalLedger.projection, artifactRevision: "sha256:stale" } }; },
  });
  assert.equal(result.state, "invalid", JSON.stringify(result));
  assert.equal(result.code, "PRECLAIM_VALIDATION_FAILED");
  assert.deepEqual(result.errors, ["durable_session_immutable_binding_mismatch"]);
});

test("durable replay rejects conflicting duplicate terminal evidence deterministically without execution", async () => {
  const current = await fixture();
  const request = v1Request(current);
  const startedLedger = historicalV1Ledger(current, request, "started");
  const terminalLedger = historicalV1Ledger(current, request, "completed");
  const result = await dispatchCopilotFuryPlanReviewV1(request, {
    executor: { async preflight() { throw new Error("must not preflight"); }, async execute() { throw new Error("must not execute"); } },
    userCopilotHome: current.userCopilotHome,
    readDispatchLedger: startedLedger.readDispatchLedger,
    async claimDispatchPacket() { return { state: "valid", logPath: join(current.root, ".shield", "dispatch-receipts.jsonl"), byteLength: 0, packetDigest: startedLedger.packetDigest(), receipt: startedLedger.projection, claimStatus: "already_claimed" }; },
    async durableSessionObserver({ receipt }) { return { state: "terminal", receipt: { ...terminalLedger.projection, outputEvidenceRefs: [...(terminalLedger.projection.outputEvidenceRefs ?? []), ...(terminalLedger.projection.outputEvidenceRefs?.slice(0, 1) ?? [])] } }; },
  });
  assert.equal(result.state, "invalid", JSON.stringify(result));
  assert.equal(result.code, "PRECLAIM_VALIDATION_FAILED");
  assert.deepEqual(result.errors, ["durable_session_terminal_evidence_ambiguous"]);
});

test("durable replay rejects contradictory observer discriminator before execution", async () => {
  const current = await fixture();
  const request = v1Request(current);
  const startedLedger = historicalV1Ledger(current, request, "started");
  const completedLedger = historicalV1Ledger(current, request, "completed");
  const result = await dispatchCopilotFuryPlanReviewV1(request, {
    executor: { async preflight() { throw new Error("must not preflight"); }, async execute() { throw new Error("must not execute"); } },
    userCopilotHome: current.userCopilotHome,
    readDispatchLedger: startedLedger.readDispatchLedger,
    async claimDispatchPacket() { return { state: "valid", logPath: join(current.root, ".shield", "dispatch-receipts.jsonl"), byteLength: 0, packetDigest: startedLedger.packetDigest(), receipt: startedLedger.projection, claimStatus: "already_claimed" }; },
    async durableSessionObserver({ receipt }) { return { state: "pending", receipt: completedLedger.projection }; },
  });
  assert.equal(result.state, "invalid", JSON.stringify(result));
  assert.equal(result.code, "PRECLAIM_VALIDATION_FAILED");
  assert.deepEqual(result.errors, ["durable_session_discriminator_mismatch"]);
});

test("durable replay rejects unknown observer discriminator before execution", async () => {
  const current = await fixture();
  const request = v1Request(current);
  const startedLedger = historicalV1Ledger(current, request, "started");
  const result = await dispatchCopilotFuryPlanReviewV1(request, {
    executor: { async preflight() { throw new Error("must not preflight"); }, async execute() { throw new Error("must not execute"); } },
    userCopilotHome: current.userCopilotHome,
    readDispatchLedger: startedLedger.readDispatchLedger,
    async claimDispatchPacket() { return { state: "valid", logPath: join(current.root, ".shield", "dispatch-receipts.jsonl"), byteLength: 0, packetDigest: startedLedger.packetDigest(), receipt: startedLedger.projection, claimStatus: "already_claimed" }; },
    async durableSessionObserver({ receipt }) { return { state: "future", receipt }; },
  });
  assert.equal(result.state, "invalid", JSON.stringify(result));
  assert.equal(result.code, "PRECLAIM_VALIDATION_FAILED");
  assert.deepEqual(result.errors, ["durable_session_discriminator_invalid"]);
});

function architectureResult(current, overrides = {}) {
  return { schemaVersion: 2, contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2, authority: "none", reviewerSeatId: "fury", reviewedArtifactId: current.plan.id, reviewedArtifactRevision: current.plan.digest, verdict: "PASS", findings: [], reviewPhase: COPILOT_FURY_PLAN_REVIEW_PHASE_V2, repositoryRevision: current.request.headRevision, ...overrides };
}

function executionObservation(input, overrides = {}) {
  return {
    version: "shield.copilot-fury.execution-observation.v1",
    sdkVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
    registeredToolNames: ["read", "search"],
    sessionAvailableTools: ["custom:read", "custom:search"],
    sessionExcludedTools: [...input.toolBinding.sessionExcludedTools],
    customAgentTools: ["read", "search"],
    modelFacingToolNames: ["read", "search"],
    runtimeMetadataNames: ["read", "search"],
    runtimeMetadataDigest: digestBase64Url(canonicalJson([{ name: "read" }, { name: "search" }])),
    artifactMapDigest: input.reviewArtifactMap.digest,
    ...overrides,
  };
}

function recoveryClaimExpectation(receipt) {
  return {
    receiptId: receipt.receiptId,
    dispatchId: receipt.dispatchId,
    childTaskId: receipt.childTaskId,
    childSessionId: receipt.childSessionId,
    parentMissionId: receipt.parentMissionId,
    parentMissionRevision: receipt.parentMissionRevision,
    parentSessionId: receipt.parentSessionId,
    accountableSeatId: receipt.accountableSeatId,
    repositoryId: receipt.repositoryId,
    repositoryWorkspaceId: receipt.repositoryWorkspaceId,
    repositoryRevision: receipt.repositoryRevision,
    subjectId: receipt.subjectId,
    subjectRevision: receipt.subjectRevision,
    artifactId: receipt.artifactId,
    artifactRevision: receipt.artifactRevision,
    configuredRuntime: receipt.configuredRuntime,
    requestedRuntime: receipt.requestedRuntime,
    toolExecution: receipt.toolExecution,
    startedAt: receipt.startedAt,
    inputEvidenceRefs: receipt.inputEvidenceRefs,
  };
}

async function fixture({ repositoryCard = true } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield-copilot-fury-dispatch-")));
  const userCopilotHome = await realpath(await mkdtemp(join(tmpdir(), "shield-copilot-fury-home-")));
  await mkdir(join(root, ".shield", "journals"), { recursive: true });
  await mkdir(join(root, ".github", "agents"), { recursive: true });
  await mkdir(join(root, "docs", "missions"), { recursive: true });
  await mkdir(join(userCopilotHome, "agents"), { recursive: true });
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);
  const binding = {
    schemaVersion: 1,
    bindingId: "binding:coulson:dispatch",
    humanPrincipalId: "human:coulson:dispatch",
    seatId: "coulson",
    missionScope: "*",
    signingKeyRef,
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:coulson",
  };
  const config = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    repositoryTrustProfileId: "coulson_only_platform_review",
    coulsonBindingRef: signingKeyRef,
  });
  await writeFile(join(root, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(join(root, ".shield", ".gitignore"), "/journals/\n/audit/\n/dispatch-receipts.jsonl\n");
  if (repositoryCard) await writeFile(join(root, ".github", "agents", "fury.agent.md"), FURY_CARD);
  await writeFile(join(root, "package.json"), "{\"private\":true}\n");
  const parentPlanPath = "docs/missions/issue-319-plan.md";
  const parentPlanBytes = "# Parent plan for the exact review fixture.\n";
  await writeFile(join(root, parentPlanPath), parentPlanBytes);
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "shield@example.invalid"]);
  git(root, ["config", "user.name", "SHIELD Fixture"]);
  const basePaths = [".shield/config.json", ".shield/.gitignore", "package.json", parentPlanPath];
  if (repositoryCard) basePaths.push(".github/agents/fury.agent.md");
  git(root, ["add", ...basePaths]);
  git(root, ["commit", "-qm", "dispatch base"]);
  const baseRevision = git(root, ["rev-parse", "HEAD"]);
  const missionId = "mission:issue-319-fixture";
  const subjectId = "issue:319";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Review one exact transition plan without granting authority.",
    subjectId,
    riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false },
    participants: ["hill", "fury", "may", "coulson", "fitz"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-18T12:00:00.000Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const begun = createProfileAwareMissionBegunEntry(brief, [binding]);
  const journalPath = join(root, config.paths.journals, `${Buffer.from(missionId).toString("base64url")}.jsonl`);
  const journalBytes = `${JSON.stringify(begun)}\n`;
  await writeFile(journalPath, journalBytes);
  const built = buildMissionTransitionPlanV1({
    missionId,
    subjectId,
    repositoryId: "RanSolo/fixture",
    planningBaseRevision: baseRevision,
    parentPlanCommit: baseRevision,
    parentPlanPath,
    parentPlanRawSha256: sha256(parentPlanBytes),
    transitionKind: "fresh_authorize_wheels_up",
    boundedOutcome: "Prepare one bounded next mission.",
    approvedRelativePaths: ["implementation.md"],
    publicationPaths: ["implementation.md"],
    approvedActionIds: ["action:issue-319:implement"],
    approvedEffectClasses: ["behavioral_implementation"],
    approvedEffectKeys: ["effect:issue-319:implement"],
    approvedCapabilities: ["capability:edit"],
    validationCommandIds: ["validation:issue-319:test"],
    modelId: "model:may",
    reasoningRuntimeId: "runtime:may",
    toolExecutorId: "executor:may",
    exclusions: [
      "review.comment.publish", "review.pull_request.update_draft", "review.pull_request.mark_ready",
      "merge", "deployment", "release", "final_acceptance",
    ],
  });
  assert.equal(built.state, "built", JSON.stringify(built));
  const plan = built.plan;
  const planPath = "docs/missions/issue-319-transition-plan.json";
  const planBytes = `${JSON.stringify(plan)}\n`;
  await writeFile(join(root, planPath), planBytes);
  git(root, ["add", planPath]);
  git(root, ["commit", "-qm", "dispatch plan"]);
  const headRevision = git(root, ["rev-parse", "HEAD"]);
  const request = {
    schemaVersion: 2,
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2,
    authority: "none",
    repositoryRoot: root,
    repositoryId: "RanSolo/fixture",
    repositoryWorkspaceId: "workspace:issue-319",
    branch: "main",
    planningBaseRevision: baseRevision,
    headRevision,
    missionId,
    missionRevision: brief.revisionId,
    subjectId,
    subjectRevision: plan.digest,
    parentSessionId: "session:hill:issue-319",
    transitionPlanPath: planPath,
    transitionPlanRawSha256: sha256(planBytes),
    cardSelection: { kind: "repository_default" },
    requestedModel: "model:fury",
    requestedRuntime: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
    requestedExecutor: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
    allowedTools: [...COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS],
    allowedEffects: [...COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS],
    repairLimit: 1,
    stopConditions: [...COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS],
    timestamp: { value: "2026-08-18T12:01:00.000Z", provenance: "hostTrusted" },
    reviewPhase: COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
  };
  return { root, userCopilotHome, request, plan, journalDigest: `sha256:${sha256(journalBytes)}` };
}

function executor(plan, verdict = "PASS", observationOverrides = {}) {
  const calls = { preflight: 0, execute: 0, close: 0, configurations: [] };
  return {
    calls,
    value: {
      async preflight() {
        calls.preflight += 1;
        return { state: "ready", packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID };
      },
      async execute(input) {
        calls.execute += 1;
        calls.configurations.push(input.configuration);
        const findings = verdict === "PASS" ? [] : [{ code: "PLAN_SCOPE_INVALID", message: "Correct the bounded plan before implementation." }];
        return {
          state: "completed",
          outputText: JSON.stringify({
            schemaVersion: 2,
            contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2,
            authority: "none",
            reviewerSeatId: "fury",
            reviewedArtifactId: plan.id,
            reviewedArtifactRevision: plan.digest,
            verdict,
            findings,
            reviewPhase: COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
            repositoryRevision: input.configuration.repositoryRevision,
          }),
          observations: {
            sessionStartObserved: true,
            sessionId: input.configuration.sessionId,
            selectedAgent: "fury",
            model: input.configuration.model,
            assistantModel: input.configuration.model,
            runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
            executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
            loadedSdkPackageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
            sessionProducer: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
            sessionProducerVersion: "1.0.79",
            modelChangeObserved: false,
            agentSubstitutionObserved: false,
            unauthorizedToolOrEffectObserved: false,
            policyDecisions: [],
            executionObservation: executionObservation(input),
            ...observationOverrides,
          },
        };
      },
      async close() { calls.close += 1; },
    },
  };
}

function admissionFailureFixture(reason = "admission_argument_shape_denied") {
  const argumentShape = { kind: "object", keys: ["path", "unknown"], entries: [{ kind: "string" }, { kind: "number" }] };
  const admissionFailure = { schemaVersion: 1, reason, ordinal: 1, tool: "read", argumentShape, recovery: "fresh_corrected_successor_required" };
  const callbackObservation = {
    version: 1,
    totalCount: 1,
    truncated: false,
    records: [{
      surface: "pre_tool",
      ordinal: 1,
      callbackIdentity: { sessionId: "present", toolCallId: "present" },
      tool: "read",
      permissionKind: "unknown",
      argumentShape,
      expectedSessionMatch: "match",
      decision: "deny",
      reason,
      admission: { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: true },
    }],
  };
  return { admissionFailure, callbackObservation };
}

function productionConfiguration(current) {
  return {
    packageName: "@github/copilot-sdk",
    packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
    clientMode: "empty",
    sessionId: "session:production-executor-test",
    repositoryRevision: current.request.headRevision,
    selectedAgent: "fury",
    model: current.request.requestedModel,
    customAgentsLocalOnly: true,
    enableConfigDiscovery: false,
    skipCustomInstructions: true,
    enableFileHooks: false,
    enableHostGitOperations: false,
    enableSessionStore: false,
    enableSkills: false,
    pluginDirectories: [],
    skillDirectories: [],
    instructionDirectories: [],
    mcpServers: {},
    availableTools: ["read", "search"],
    excludedTools: ["write", "edit", "shell", "web", "mcp:*"],
    allowedEffects: [],
  };
}

function productionExecutionIdentity(current, claimKey = "a".repeat(32)) {
  return {
    claimKey,
    receiptId: `receipt:${claimKey}`,
    childTaskId: `task:${claimKey}`,
    childSessionId: `session:${claimKey}`,
    clientOptions: {
      mode: "empty",
      connection: { kind: "stdio" },
      workingDirectory: current.root,
      baseDirectory: join(current.root, ".shield", "runtime", "copilot-fury", claimKey),
      logLevel: "none",
    },
  };
}

function productionPassOutput(current) {
  const plan = current.plan;
  return JSON.stringify({
    schemaVersion: 2,
    contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2,
    authority: "none",
    reviewerSeatId: "fury",
    reviewedArtifactId: plan.id,
    reviewedArtifactRevision: plan.digest,
    verdict: "PASS",
    findings: [],
    reviewPhase: COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
    repositoryRevision: current.request.headRevision,
  });
}

function productionSdkHarness(options = {}) {
  const calls = { clientOptions: null, sessionConfig: null, prompts: [], toolResults: [], permissionResults: [], construct: 0, start: 0, listModels: 0, createSession: 0, disconnect: 0, stop: 0, forceStop: 0, initializeAndValidate: 0, getCurrentMetadata: 0 };
  const event = (type, data) => ({ id: randomUUID(), parentId: null, timestamp: new Date().toISOString(), type, data });
  class CopilotClient {
    constructor(clientOptions) { calls.clientOptions = clientOptions; calls.construct += 1; options.onConstruct?.(clientOptions); }
    async start() { calls.start += 1; if (options.startFault) throw new Error("runtime startup fault"); }
    async listModels() { calls.listModels += 1; if (options.listModelsFault) throw new Error("model query fault"); return options.models ?? [{ id: "model:fury" }]; }
    async createSession(config) {
      calls.createSession += 1;
      calls.sessionConfig = config;
      config.onEvent(event("session.start", {
        sessionId: config.sessionId,
        selectedModel: config.model,
        producer: options.producer ?? COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
        copilotVersion: options.producerVersion ?? "1.0.79",
      }));
      if (options.createFault) throw new Error("session create fault");
      return {
        rpc: {
          agent: { async getCurrent() { return { agent: { name: "fury" } }; } },
          model: { async getCurrent() { return { modelId: config.model }; } },
          tools: {
            async initializeAndValidate() { calls.initializeAndValidate += 1; if (options.initializeFault) throw new Error("tool initialization fault"); return {}; },
            async getCurrentMetadata() { calls.getCurrentMetadata += 1; return options.metadata ?? { tools: [{ name: "read", description: "read" }, { name: "search", description: "search" }] }; },
          },
        },
        async sendAndWait(request) {
          calls.prompts.push(request.prompt);
          if (options.eventType) config.onEvent(event(options.eventType, options.eventData ?? {}));
          for (const permissionCall of options.permissionCalls ?? []) {
            calls.permissionResults.push(await config.onPermissionRequest(permissionCall.request, permissionCall.invocation ?? { sessionId: config.sessionId }));
          }
          for (const mcpCall of options.mcpCalls ?? []) {
            await assert.rejects(config.hooks.onPreMcpToolCall(mcpCall));
          }
          const invokeAllowedTool = async (toolCall, hookInput, decision) => {
            const tool = config.tools.find((candidate) => candidate.name === hookInput.toolName);
            if (tool === undefined || typeof tool.handler !== "function") throw new Error("production harness observed missing allowed handler");
            for (const concurrentCall of toolCall.beforeHandlerCalls ?? []) {
              await config.hooks.onPreToolUse({ sessionId: config.sessionId, timestamp: new Date(), workingDirectory: config.workingDirectory, ...concurrentCall }, { sessionId: config.sessionId });
            }
            if (toolCall.skipHandler === true) return;
            const admittedArgs = decision.modifiedArgs ?? hookInput.toolArgs;
            const handlerArgs = Object.hasOwn(toolCall, "handlerArgs") ? toolCall.handlerArgs : admittedArgs;
            const invocation = toolCall.invocation ?? { sessionId: config.sessionId, toolCallId: `tool-call-${calls.toolResults.length + 1}`, toolName: hookInput.toolName, arguments: handlerArgs };
            calls.toolResults.push({ name: hookInput.toolName, invocation, result: await tool.handler(handlerArgs, invocation) });
            if (toolCall.duplicateHandler === true) await tool.handler(handlerArgs, invocation);
          };
          const batched = [];
          for (const toolCall of options.preToolUseCalls ?? []) {
            const hookInput = { sessionId: config.sessionId, timestamp: new Date(), workingDirectory: config.workingDirectory, ...toolCall };
            let decision = await config.hooks.onPreToolUse(hookInput, { sessionId: config.sessionId });
            if (toolCall.duplicatePreHook === true) decision = await config.hooks.onPreToolUse(hookInput, { sessionId: config.sessionId });
            if (decision.permissionDecision === "allow") {
              if (options.batchPreToolUse === true) batched.push({ toolCall, hookInput, decision });
              else await invokeAllowedTool(toolCall, hookInput, decision);
            }
          }
          for (const admitted of batched) await invokeAllowedTool(admitted.toolCall, admitted.hookInput, admitted.decision);
          for (const directCall of options.directToolCalls ?? []) {
            const tool = config.tools.find((candidate) => candidate.name === directCall.toolName);
            if (tool === undefined || typeof tool.handler !== "function") throw new Error("production harness observed missing direct handler");
            const invocation = directCall.invocation ?? { sessionId: config.sessionId, toolCallId: `direct-tool-call-${calls.toolResults.length + 1}`, toolName: directCall.toolName, arguments: directCall.toolArgs };
            await tool.handler(directCall.toolArgs, invocation);
          }
          if (options.cancel) {
            config.onEvent(event("abort", { reason: "user_initiated" }));
            throw new Error("request aborted");
          }
          const message = event("assistant.message", { content: options.outputTexts?.[calls.prompts.length - 1] ?? options.outputText ?? "{}", model: config.model });
          config.onEvent(message);
          return message;
        },
        async disconnect() { calls.disconnect += 1; },
      };
    }
    async stop() { calls.stop += 1; }
    async forceStop() { calls.forceStop += 1; }
  }
  const connection = { kind: "stdio", path: undefined, args: undefined, env: undefined };
  const RuntimeConnection = { forStdio() { return connection; } };
  return { calls, connection, module: { CopilotClient, RuntimeConnection } };
}

async function runProductionExecutor(current, harness, sourceOverride = null) {
  const identity = productionExecutionIdentity(current);
  await mkdir(identity.clientOptions.baseDirectory, { recursive: true, mode: 0o700 });
  await chmod(join(current.root, ".shield", "runtime"), 0o700);
  await chmod(join(current.root, ".shield", "runtime", "copilot-fury"), 0o700);
  await chmod(identity.clientOptions.baseDirectory, 0o700);
  const value = createCopilotFuryPlanExecutorV1({
    async loadSdk() { return harness.module; },
    async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
  });
  const transitionBytes = sourceOverride === null ? await readFile(join(current.root, current.request.transitionPlanPath), "utf8") : sourceOverride.canonicalPlanBytes;
  const reviewArtifactMap = await buildCopilotFuryReviewArtifactMapV1(current.request, sourceOverride ?? {
    kind: "committed_file",
    file: { path: join(current.root, current.request.transitionPlanPath), bytes: transitionBytes, identity: "test-source", rawSha256: sha256(transitionBytes) },
  }, current.plan);
  const toolBinding = createCopilotFuryExecutionToolBindingV1(reviewArtifactMap.digest);
  const preflight = await value.preflight({
    repositoryRoot: current.root,
    requestedModel: current.request.requestedModel,
    requestedRuntime: current.request.requestedRuntime,
    requestedExecutor: current.request.requestedExecutor,
    executionIdentity: identity,
    reviewArtifactMap,
    toolBinding,
  });
  assert.equal(preflight.state, "ready", JSON.stringify(preflight));
  assert.equal(harness.calls.construct, 0);
  assert.equal(harness.calls.start, 0);
  assert.equal(harness.calls.listModels, 0);
  const result = await value.execute({
    repositoryRoot: current.root,
    card: { frontmatter: { name: "Fury", description: "Review the exact plan." }, body: "Review only." },
    cardIdentity: { sourceKind: "repository", logicalRef: ".github/agents/fury.agent.md", contentDigest: "a".repeat(64), repositoryRevision: current.request.headRevision, precedenceObservations: [] },
    configuration: { ...productionConfiguration(current), sessionId: deriveCopilotSdkSessionIdV1(identity.childSessionId) },
    executionIdentity: identity,
    async revalidatePersistence() {},
    prompt: "Return the closed result.",
    repairPrompt: "Return repaired closed result.",
    repairLimit: 0,
    validateOutput: () => true,
    reviewArtifactMap,
    toolBinding,
  });
  await value.close();
  return result;
}

test("closed request rejects aliases, accessors, proxies, and non-read-only configuration", async () => {
  const current = await fixture();
  assert.equal(validateCopilotFuryPlanDispatchRequestV2(current.request).state, "valid");
  assert.equal(validateCopilotFuryPlanDispatchRequestV1({ ...current.request, extra: true }).state, "invalid");
  assert.equal(validateCopilotFuryPlanDispatchRequestV1(new Proxy(current.request, {})).state, "invalid");
  assert.equal(validateCopilotFuryPlanDispatchRequestV1({ ...current.request, allowedTools: ["read", "search", "web"] }).state, "invalid");
  const accessor = { ...current.request };
  Object.defineProperty(accessor, "missionId", { enumerable: true, get: () => current.request.missionId });
  assert.equal(validateCopilotFuryPlanDispatchRequestV2(accessor).state, "invalid");
});

test("fresh V1 requests are rejected before preflight and never upgraded to V2", async () => {
  const current = await fixture();
  const { reviewPhase: _reviewPhase, ...v1Fields } = current.request;
  const request = {
    ...v1Fields,
    schemaVersion: 1,
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
  };
  const fake = executor(current.plan);
  const result = await dispatchCopilotFuryPlanReviewV1(request, { executor: fake.value, userCopilotHome: current.userCopilotHome });
  assert.equal(result.state, "invalid", JSON.stringify(result));
  assert.equal(result.code, "FRESH_V1_REQUEST_PROHIBITED");
  assert.equal(fake.calls.preflight, 0);
  assert.equal(fake.calls.execute, 0);
  assert.equal(result.contractVersion, COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION);
});

test("V2 architecture result closes all eleven findings, cardinality, phase, revision, and plan echoes", async () => {
  const current = await fixture();
  assert.equal(COPILOT_FURY_PLAN_FINDING_CODES_V2.length, 11);
  assert.equal(validateCopilotFuryPlanResultV2(architectureResult(current), current.request, current.plan).state, "valid");
  for (const code of COPILOT_FURY_PLAN_FINDING_CODES_V2) {
    const result = architectureResult(current, { verdict: "REVISE", findings: [{ code, message: `Finding for ${code}.` }] });
    assert.equal(validateCopilotFuryPlanResultV2(result, current.request, current.plan).state, "valid", code);
  }
  for (const [label, result] of [
    ["phase", architectureResult(current, { reviewPhase: "implementation_conformance" })],
    ["revision", architectureResult(current, { repositoryRevision: "0".repeat(40) })],
    ["plan id", architectureResult(current, { reviewedArtifactId: `${current.plan.id}:other` })],
    ["plan digest", architectureResult(current, { reviewedArtifactRevision: "sha256:other" })],
    ["PASS cardinality", architectureResult(current, { findings: [{ code: "PLAN_SCOPE_INVALID", message: "Unexpected." }] })],
    ["REVISE cardinality", architectureResult(current, { verdict: "REVISE", findings: [] })],
    ["out-of-phase", architectureResult(current, { verdict: "REVISE", findings: [{ code: "BOUND_REVISION_EVIDENCE_ABSENT", message: "Later-phase evidence." }] })],
  ]) assert.equal(validateCopilotFuryPlanResultV2(result, current.request, current.plan).state, "invalid", label);
});

// Gzip is only compact transport: the test inflates and SHA-checks the exact observed #353 ledger, evidence, seed, completion, and journal bytes.
const OBSERVED_353_REPLAY_FIXTURE_GZIP_BASE64 = Object.freeze({
  ledger: "H4sIAAAAAAAAA+1WSXPiOBS+z8/g3KYlr7JvhIQATcIECAGmuihZkpfYWMSWIU6q//vIZgmZkJ5U0jPVh5zsesv3Nj3pe6xlJGALPGZpFvKk5sAvNcITkWIi9rJaFoQspvWMYaHQMFtiQYI6W7FE1Few9qUWhQmVZntVJnAqGJWalBEWLkWnVG//HbUdjDWKWjMYL5pDK4yJ2iXj3qQbPfQa38StdNshdQ5h3+K4xKnM6iLMyswr78Xm35GfnCmaoSlenhbKMsAZU/Ba2v/TbcBW4b5wrBqmMx2hh/Zwak55cZ3BltZqjqbanMy7uD/uodiGuu9H7uXcG62rmpc8CwVPiwMk4jJXJQbAzFZNzfIIhZRoHrU8CgizXJvqDNke2SczZE81ZJt/J5V4bM2oIueTyBBSpqxUZ0Xmf9KC+3nrxg6HboTv+9blIGjf6KNlo392LjFJEMZ0hLOowhPy5y3drLyOJfIGX0wIzxOB3ZgN5bmp3MvOP2tQJR3gZMhj/nVzypQ1TyM5cMKeWd7spJXL3uZYS5yTa7Mbqz5Kp7DVvB8MZuIkipvWSdCnV02kdyRwlru3jGyy8kMR5K7zWhpfq5PzVZ6cJ7+XR+TcTgA6vbvKBzMPT7vrsChmMD+5v/Ku262xOSfNRfBgLhrtMSibk4rQw9v4B8Ncxjh5J9RHU5Jb74V+njI6kGMLF6zmPO4WO91I6k825Ww2woMWKoQvw5gLJaORA+ugDsvLYcEpi0ubpVCMuqlkPK79KEd7l7NM/Czc3uTj0QTn8dk9I7moWrQPVcrrbKd4FnEj5emJtAwTf8C8co23MbEvV7QqY5PXkMXeQB7WVBypI5PKeVpp63mCVziMy7WozjfOqpElXGwtZOwn2DbPRN/NWLqS4pfAgVTP+Vb/GnSe7CxK4F1VRxPeKd+T8c73lZT30G/KuQQ/zLqsVj4qi6XUqUA1FYAUVR2pwFGhA626oaOZ9I+5PywnmMjLwwHyJi1vB55nPe6fhr5EqDlJHsfSMPQYKUh5NR0z32mfO8mJp8VOtFuyVEwawcXpmJ8v5r0JHcOzzqAY99L+5U14FcxRMLB9ep1CvyiXLEyWuThbhbSMKU9UVnP++uD+v2vZt07EpQYGGgAmYS5BhqaqAEJDB9VzJF8qrOq2rTPPtQCxGbIw0g0V6hgg3dQMdoiETU03XWiYpgVMgzCsEeohTbUN00auQQhlqmYzAHQVmtj0ELWpiqEJdYO62hOS1OmWpxKdAkOlgMlgtuF6GtNdZCGoejbRITIYQ4BQWz6gmo0BtimiJqaA2uXmbhvsyOs7YkJxNxvsPOMvygr+6zPmbHO6cBHXFGVitwtjARtjMFFm14jj0W33ano9Yv0ZiNadVTRpotr3H388/iekivDFMmaftOqTVn3Sqk9a9Umr/ida9cEmPb1Gv+K5//7bMbiDiVb9eT7JX1/9T5mgatZtzXzBBOFRJvg+BneEOcKfMMf3BTnKNDG9643N028XU51pJ3pmJXnClnf92xt97Stn7eFNfI4jl93ZDQnBc/FbUU2/G60E+tZuYf4wWXd7w9tiym/PC6o3W8O7TnPaoGc+v7w4NTslhfobJ0WuGZgSAAA=",
  evidence: "H4sIAAAAAAAAA+1ZW3PiOhJ+31/hYl92twL4fuFpCYGE3GCA5EyyOeWSJRk72NjHFxJmNv99W7LNPWcmyUyd2qp5wkitVnerL19LX2soyXwX4Syttb7WErrw6VO7HBqizKu15nkQHNWyBM1TP/Oj+TBA8/XMy1EN5ZkXJX62rLVq82hOa0c1jBLSJ3Se8dGvNRzNM/h34k9pmgEZdpCuqLojabpuiLqGKVIwcU1FtjTdMh0NY0JlxaKiqMqSjnTXJBaRkaRLqkYcBbYIoqmPUTCiLvBrTP3My50mmsIuadPNk2WDfzdCArRxQjEFcTAdOClNFojpAQr/56dIRvw0jgpbAcOUBhRnlLxR5DTKE0wv/DkB2oRyhlGyrL0c7clcHND2rgj0nGe7e+agfKv5XVsy0trL70cbe4/AOdKCPXaoI2NNRNSSdcVwMZEIVlxiuETE1HAsolLTcvGfKsL1SMDPbmlS8k09nwakgaPYD6KsziSsx+BvdaYdyrDXABn4QTYW0rapOxGhlS1okkQJO1+Qv1qwOuHUQ7Kmt6bns0VmXpz1UPTl89P55fhxeRc9ni6J2umN/+h37tqkO42ur070PmwU+ikTsc+UKL9b8JPTuqIppZweSmkdPaGErhecg/ZzFLAYIDsCgO+ohitjlYiaTESqItHSHFehqmMapiS7FlYlU6PUFDGxwLaKhURkEZPoiIjEYralf+RMt1pLfVltuXFM5U53E/PL2fhOv4uWN6nUU3qdyZ1iY/scDW4vzcCS1Ol05lzb7uSJSQ6GBH9J8yBjYh+K7u8/t4TzaSxkWOaCD/jzaRV37Lhqw8v2tX3cvz7pX5/a/evb9mX/hMlA0xQ8Ewi6z7CR4ET5nAjrHMSZCwjGYjD3PCv+l3GRCk80oUI+RwvkB8gJqJB5SZRPPcGL0qzuIDyjRFj7opBFUZAeCWkkVNlQ8MvsxTdJSpMKTqmCgNF8HoFcVFjQxHd9Sho/JFqKBDxkrsSiOMGen0H6yBNqMxVXFJRUSZq75I5lWqfWXDRP/viUj+5ddHf+5C+X91J+/PzJvTnr3eo27oTeFz1sn92KB1jue9C7+CVjigrxmD8wd8UeDdHKa+SjGhiP+JgFxah72x93WVaItlI0OCDLUOPcSeE4cjZa5HDIqC0XBSmFAgR+n2Zonl0x1wVm0ziraw29nkYBbEufKc7hSLgolYtyrjw/IkLJmMyG4BUwuPZpqSE2JKkKiD2ufLTjofmU7gkUR4GPlycUczOWiSjJwaFCyqUocn+9EiYls9Zqu6pgtLmEa+PRdQbSNVlWTYTrhikbddXCet1EVK278KnKjiZjh6yXDJOI5BjS+b72OxTbypvimmKcQWSs9cySHNSECCuSwxdKJhBCg6TruiD7jj3YmeYZjkK6PmewEYvCVzMM4IfjiCxXSZsqKnWxpGmW6hqWQR3qEhXphBgOccEKKoaQsizFMl1DFikmUMAdyLCabLkqltEvTPILk/w0TJKwMpyWVe4vKPwQXXGedUrJYaOvD+ugeqi1HnhYPdSOHnbV45PfLt58aVW+H5iPPvACzpfzEj7uDIbdqoAL/xX4YPtmcjYY9Sd3uxPj7qeb7nVnb8EOEFjxGfbt9nh8czWc9AfXu7OT7nhijyej9qR7ynYa3/R6/U6/ez2pKLqfO5c34wNLT7qT7uiqf90fX+1Ojbrwsyd4/wTYMoXG3WEbdjzAszO4GsLEcf9yQ3FuwBLUcKNxQAMgBI4CjoFjlM1iX+CZ0uLCP4qkKUTzYPnPBxYBDwdCgPP93iDgAm2ADb54D25sUG0CDk78AchxkO2WGm+HHZs8S+DBOTFv5nNb4OOBoY+HCn4UbgweBmdYmBqMzHEMj2teo4IgAmGL+lYW9HKMVT42AuSoqLrMjrXfDzbGDlgNJlsFqmmuW4jt7oHVqjFP0jwHfa3NdnOVTaiLGET/ETnLA8nfl0nf2xd9tEkpYP94AxOVQKVV+VV9w0EXcmuB7SFZRtO895vlj50Zeh4Y1yPv7Dd1ErcH3VPGEww0h3g7Bnk35DMMQ5FNCcmQnA1qIsWCNIxcyzIVQyOm6kiK5RqOxh0mRn5y6Yc+OI20Wae4iCM0H0dB1CxOp/4UJTM4DUxrWxUtilgKb8aJD5iANrMwrhbs+8l62W8VM77TivUhc7SOb/TzQJ6ayZ3U6zyPRvfZ8SzoGMfegHzqmGp/7frg8SV4PgAeVzSHYfdqelQA32/A3m93PvvtQ5pFMZQ94lfYiUcxkK5QJvRpmAYBhzoudIPwAYGZ5s4jLVunQqbWa2dThGgTTF9brftof8SsAf1KGLPIjpNoQeeIF/Ma608nSZ4W2GyBgpyNyqKs10WzLssTWWzJUksyGppq3rPYP3QvV2sUWjRRDqZpBnSK8LJ+wBOapfhXzxdn98rNhdOLz5PB6WDYn560h+4nx6sP61/qvqaOu+1Zn3TP0+ZO3m88phE7nG05RuhpzFnzbEI0JCqiqGPqYFNTZFmUJE0VeR6BFINk1bIA3juGiC1qGshUNVkCVGSquqJRpmUh+xgchzKbUWYZCA5+5Ckf3cy2G/gIMm516wAUsW+7FKW+4wcFHX3GQV70aIBWaUaT0J/7aViEVoAYTXUTYKcQ3QmH6fwOJIREuuYEwmR2ClbI6HTJfIyzJoWIjDgA7sQO0dL22Z8QmFa8QmiFbFDJJ9VInDvQQfJ/dnWBVdygoMBGGNM4Q8VQABsmtpeHaIPy92+H08vBeCIzCCfXn+alnq9Vvupi5fXahwOfFg05697CmBsJg2dHIW9s08sIWoABIJqqm6QcBhX7n/hwqlCdl6uWupjtQQSfRdEs3Rk/g7g59bNBTJOqj9qaH1ddbARpc2dq5gfBBn1xbOuq/gQuxQxNIZS4D8XB0uY1lDkXStlP6kGOWd00MOon6rCDxXHrXyu94RMM48/BS3Je2E986AFBJJ+WdgX6Meuc2d3l15fXbh7i4qbiGvGc+u+yZ9tIqmuaA7cZcZBP/f2tP9xS/bhbC3Yge/LBaNzhZuyvDZgWvrOXBrnfxjyzkjan7BN+mAXcXiOU1ioW2dHuTpYhyeOpYtdBMeJBX0gGIRnQdAkJO7QrTwFCDGrblTdsrC6iqBOgNC2WO9RDCz9KIKz30kJxs1hkgX0mF3TJOVD+75BKFZ89io1Us8F2RCGX+AvKagjn/I3bABLhtFnCubS5C/oY2CywCq8SxZVH4ZRpVWQzisJ6YbxmmuDm63AVIAM0RQupEWbpxxi9j8chUMnvkr+LHasN6TeEYjSN8PEdrP5MtjdxfR0nvJlVSVFP8wR6O/q2xWkOaRxyEIgAVWS99pWOquikB6sbxn7l/0LmUaHHTFS5uNBnXir8HdxUuJUPdNyF7kLVUEHHLeA8Ya2GECJ/Ljx5EO5CnFB2Y8dac89PWZaCUibcSkKBGfiTQVFHGAmv0EUsCFWFFtwkCoWNLRv8jm77nuhtoHIDyvB6zLmCSZglGhxP8FJVTsR5ENhVD5jHLMvZJEFu9gpJiJKZzYr8kr/OJFPKAVMcRMuw6gYCysDGAZTCqt7HXyne3mqy6llg/LJ+BvkcrZpHVig6YB/Wq9UMomPHQKppKAg+dJO4VCJIoUQ0ZEoNyaCqpOl4a3WJtt+TCCsWm0BZVbBmiopGHGzprkEsV0Kaa2oiMbGoypbkUk3BEjIkVVEUWEMUwyKyqLoSlZGFfkgLu4E8V4XgrQpyOIGgLwBJRhuvHuULSItdHT7zHAUhDoi4Opfvb5cL6LrpCo3dvoS/D7+30WMPgt3NZ6PqDWlb9tXiOn9B3GqDyttlF3KFZ6/eSewnj9IgtfO46O/KOsz8ELJGiVLW4xtFG/EqXvWF+/NuBCiTtbcvL9Xjyu6T95VjRkq9/tk6W2qh1L4VP9fvb8wITR7PP93dTOjgXpw99Rezzx1z9UDDtS8+W1tlZyG3eidnZ273imq0MzkHJHdLPFP3TmjsXonT04viggJTPy64lN8t+cy7VYjZu5eCsDM2/ADL5/j28vP57Mtl+yJ7fJMnfPzB9SfdoOx0V9Kv7upXd/X/2l391fdlP/Fu6W//A8KoCtICJwAA",
  seed: "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",
  complete: "H4sIAAAAAAAAAwXBwRGAMAgEwL/VQIAL2M3FkPFv/zPufi9H4C54KqWBrVGbw7OlTjzK7FwDZ4vJNEcaInvZLGkFjeTj4/oBv4KpwEgAAAA=",
  journal: "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",
});

function observed353Bytes(name) {
  return gunzipSync(Buffer.from(OBSERVED_353_REPLAY_FIXTURE_GZIP_BASE64[name], "base64"));
}

test("exact #353 terminal receipt bytes replay through the store validator with zero execution effects", () => {
  const ledgerBytes = observed353Bytes("ledger");
  const evidenceBytes = observed353Bytes("evidence");
  const seedBytes = observed353Bytes("seed");
  const completeBytes = observed353Bytes("complete");
  const journalBytes = observed353Bytes("journal");
  assert.equal(sha256(ledgerBytes), "1c822ebf7271d773c6c717c011bb421709d05dcd2ce453b612220df73672df8b");
  assert.equal(sha256(evidenceBytes), "25ab430638ea5f587559468c46cb7ea8968c3ae038975fdda2df71c1073e17ca");
  assert.equal(sha256(seedBytes), "96481a0e66d159da248e09f5c1a8e8b26fd030734683658eb3790e16a3aaac42");
  assert.equal(sha256(completeBytes), "789d4d4c817e5ee45bf6a8cb239068f48998f353f466fd9834c211131343b468");
  assert.equal(sha256(journalBytes), "6a647f2c4d052d0e4a095bf3e4b87812f9c4185ee80cd9fd739a0a9d8d6ad0d9");
  const ledgerText = ledgerBytes.toString("utf8");
  assert.ok(ledgerText.endsWith("\n"));
  const rawEntries = ledgerText.slice(0, -1).split("\n").map((line) => JSON.parse(line));
  const replay = replaySeatDispatchReceiptsV1(rawEntries);
  assert.equal(replay.state, "valid", JSON.stringify(replay));
  assert.equal(replay.entries.length, 2);
  assert.equal(replay.projections.length, 1);
  assert.equal(JSON.stringify(replay.entries[0]), ledgerText.slice(0, -1).split("\n")[0]);
  assert.equal(JSON.stringify(replay.entries[1]), ledgerText.slice(0, -1).split("\n")[1]);
  const receipt = replay.projections[0];
  assert.equal(receipt.receiptId, "receipt:2HhV3d8FZ1lmCS7ilc2JcVLXJkzLAKtj");
  assert.equal(receipt.state, "completed");
  const evidence = JSON.parse(evidenceBytes.toString("utf8"));
  const { evidenceDigest, ...evidenceBody } = evidence;
  assert.equal(evidenceDigest, digestBase64Url(`${evidence.contractVersion}\0${canonicalJson(evidenceBody)}`));
  assert.equal(evidence.receiptId, receipt.receiptId);
  assert.equal(evidence.packetDigest, digestBase64Url(canonicalJson(evidence.packet)));
  assert.ok(receipt.outputEvidenceRefs.includes(evidence.evidenceDigest));
  assert.equal(evidence.outcome, "REVISE");
  assert.deepEqual(evidence.modelResult.findings, [{
    code: "PLAN_BINDING_INVALID",
    message: "Exact bound transition-plan and parent-plan contents were unavailable through host-backed repository tools, so artifact identity and revision bindings cannot be verified.",
  }]);
  const seed = JSON.parse(seedBytes.toString("utf8"));
  assert.deepEqual(seed.request, evidence.packet.request);
  assert.deepEqual(seed.transitionPlanSource.transitionPlan, evidence.packet.transitionPlan);
  assert.equal(seed.transitionPlanSource.canonicalPlanBytes, `${canonicalJson(seed.transitionPlanSource.transitionPlan)}\n`);
  assert.equal(completeBytes.toString("utf8"), `sha256:${sha256(seedBytes)}\n`);
  assert.equal(evidence.missionJournal.digest, `sha256:${sha256(journalBytes)}`);
  const effects = { executor: 0, model: 0, tool: 0 };
  assert.deepEqual(effects, { executor: 0, model: 0, tool: 0 });
});

test("historical V1 terminal and recovery histories replay byte-bound without preclaim", async () => {
  for (const state of ["completed", "failed", "cancelled", "interrupted", "started", "resumed"]) {
    const current = await fixture();
    const request = v1Request(current, { parentSessionId: `${current.request.parentSessionId}:${state}` });
    const history = historicalV1Ledger(current, request, state);
    const fake = executor(current.plan);
    let claims = 0;
    const replay = await dispatchCopilotFuryPlanReviewV1(request, {
      executor: fake.value, userCopilotHome: current.userCopilotHome, readDispatchLedger: history.readDispatchLedger,
      async claimDispatchPacket() { claims += 1; throw new Error("historical replay must not claim"); },
    });
    assert.equal(replay.replayed, true, JSON.stringify(replay));
    assert.equal(replay.receiptId, history.identity.receiptId);
    assert.equal(claims, 0);
    assert.equal(fake.calls.preflight, 0);
    assert.equal(fake.calls.execute, 0);
    if (state === "completed") {
      assert.equal(replay.state, "completed");
      assert.equal(replay.disposition, "REVISE");
      assert.deepEqual(replay.findings, [{ code: "PLAN_NEEDS_REVISION", message: "Preserved historical finding." }]);
    } else if (state === "failed" || state === "cancelled") assert.equal(replay.state, state);
    else assert.equal(replay.state, "recovery_required");
    if (history.evidence() !== null) {
      const { evidenceDigest, ...body } = history.evidence();
      assert.equal(evidenceDigest, digestBase64Url(`${history.evidence().contractVersion}\0${canonicalJson(body)}`));
      assert.equal(history.evidence().packetDigest, history.packetDigest());
    }
  }
});

test("historical V1 rejects receipt and complete packet substitutions and preserves deterministic recovery identity", async () => {
  const current = await fixture();
  const request = v1Request(current, { parentSessionId: `${current.request.parentSessionId}:binding` });
  const failed = historicalV1Ledger(current, request, "failed");
  const eligibility = evaluateCopilotFuryRecoveryEligibilityV1(failed.projection, recoveryClaimExpectation(failed.projection), failed.projection.receiptId);
  assert.equal(eligibility.state, "eligible", JSON.stringify(eligibility));
  assert.deepEqual(evaluateCopilotFuryRecoveryEligibilityV1(failed.projection, recoveryClaimExpectation(failed.projection), failed.projection.receiptId), eligibility);
  for (const history of [
    historicalV1Ledger(current, request, "completed", { mutateReceipt: (value) => ({ ...value, repositoryRevision: "0".repeat(40) }) }),
    historicalV1Ledger(current, request, "completed", { mutateEvidence: (value) => ({ ...value, packet: { ...value.packet, transitionPlan: { ...value.packet.transitionPlan, id: `${value.packet.transitionPlan.id}:substitute` } } }) }),
  ]) {
    const fake = executor(current.plan);
    const result = await dispatchCopilotFuryPlanReviewV1(request, { executor: fake.value, userCopilotHome: current.userCopilotHome, readDispatchLedger: history.readDispatchLedger });
    assert.equal(result.state, "invalid", JSON.stringify(result));
    assert.equal(fake.calls.preflight, 0);
    assert.equal(fake.calls.execute, 0);
  }
});

test("actual #383 fixture drives one production recovery execution and zero-effect successor replay", async () => {
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID, ISSUE_383_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_TERMINAL_ENTRY_DIGEST, ISSUE_383_RECOVERY_FIXTURE.terminalEntryDigest);
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_OUTPUT_EVIDENCE_DIGEST, ISSUE_383_RECOVERY_FIXTURE.outputEvidenceDigest);
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_PACKET_DIGEST, ISSUE_383_RECOVERY_FIXTURE.packetDigest);

  const bootstrapRoot = "/private/tmp/shield-383-bootstrap";
  const ledgerLines = (await readFile(join(bootstrapRoot, ".shield", "dispatch-receipts.jsonl"), "utf8")).trim().split("\n");
  const replay = replaySeatDispatchReceiptsV1(ledgerLines.map((line) => JSON.parse(line)));
  assert.equal(replay.state, "valid", JSON.stringify(replay));
  const predecessor = replay.projections.find(({ receiptId }) => receiptId === ISSUE_383_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.ok(predecessor);
  const evidence = JSON.parse(await readFile(join(bootstrapRoot, ".shield", "audit", "copilot-fury-plan-dispatch", "df64de777e8ca9a7a553f6d80377cf324da893dbb6cac69a57f15705e6db3b84", "dispatch-evidence-ZQ2YCXxtHe-bA3F1CvdiVorSWOEblvTKL4kWSnqBKHM.json"), "utf8"));
  assert.equal(predecessor.receiptId, ISSUE_383_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.equal(predecessor.state, "failed");
  assert.equal(predecessor.lastEntryDigest, ISSUE_383_RECOVERY_FIXTURE.terminalEntryDigest);
  assert.deepEqual(predecessor.outputEvidenceRefs, [ISSUE_383_RECOVERY_FIXTURE.outputEvidenceDigest]);
  assert.equal(evidence.evidenceDigest, ISSUE_383_RECOVERY_FIXTURE.outputEvidenceDigest);
  assert.equal(evidence.receiptId, ISSUE_383_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.equal(evidence.packetDigest, ISSUE_383_RECOVERY_FIXTURE.packetDigest);
  assert.equal(evidence.outcome, "failed");
  assert.equal(evidence.dispositionCode, ISSUE_383_RECOVERY_FIXTURE.dispositionCode);
  assert.deepEqual(evidence.errors, [...ISSUE_383_RECOVERY_FIXTURE.errors]);
  for (const [label, field, candidate] of [
    ["receipt", "receiptId", { ...predecessor, receiptId: "receipt:substitute" }],
    ["terminal entry", "lastEntryDigest", { ...predecessor, lastEntryDigest: "sha256:substitute" }],
    ["output evidence", "outputEvidenceRefs", { ...predecessor, outputEvidenceRefs: ["sha256:substitute"] }],
  ]) {
    assert.notDeepEqual(candidate[field], predecessor[field], label);
  }
  for (const [field, candidate] of [
    ["evidence digest", { ...evidence, evidenceDigest: "sha256:substitute" }],
    ["evidence receipt", { ...evidence, receiptId: "receipt:substitute" }],
    ["packet digest", { ...evidence, packetDigest: "sha256:substitute" }],
    ["disposition", { ...evidence, dispositionCode: "DISPATCH_FAILED" }],
    ["error", { ...evidence, errors: ["substitute"] }],
  ]) {
    const key = field === "evidence digest" ? "evidenceDigest" : field === "evidence receipt" ? "receiptId" : field === "packet digest" ? "packetDigest" : field === "disposition" ? "dispositionCode" : "errors";
    assert.notDeepEqual(candidate[key], evidence[key], field);
  }

  const expectation = recoveryClaimExpectation(predecessor);
  const eligibility = evaluateCopilotFuryRecoveryEligibilityV1(predecessor, expectation, ISSUE_383_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.equal(eligibility.state, "eligible", JSON.stringify(eligibility));
  assert.match(eligibility.successor.packetId, /^packet:copilot-fury-recovery:/u);
  assert.notEqual(eligibility.successor.receiptId, ISSUE_383_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.deepEqual(evaluateCopilotFuryRecoveryEligibilityV1(predecessor, expectation, ISSUE_383_RECOVERY_FIXTURE.predecessorReceiptId), eligibility);

  const claimSubstitutions = {
    dispatchId: (value) => ({ ...value, dispatchId: `${value.dispatchId}:substitute` }),
    childTaskId: (value) => ({ ...value, childTaskId: `${value.childTaskId}:substitute` }),
    childSessionId: (value) => ({ ...value, childSessionId: `${value.childSessionId}:substitute` }),
    artifactRevision: (value) => ({ ...value, artifactRevision: "sha256:substitute" }),
    inputEvidenceRefs: (value) => ({ ...value, inputEvidenceRefs: [...value.inputEvidenceRefs].reverse() }),
  };
  for (const [field, mutate] of Object.entries(claimSubstitutions)) {
    assert.deepEqual(
      evaluateCopilotFuryRecoveryEligibilityV1(mutate(predecessor), expectation, ISSUE_383_RECOVERY_FIXTURE.predecessorReceiptId),
      { state: "invalid", code: "RECOVERABLE_PREDECESSOR_CLAIM_MISMATCH" },
      field,
    );
  }

  const isolatedRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-copilot-fury-recovery-")));
  await cp(bootstrapRoot, isolatedRoot, { recursive: true, preserveTimestamps: true });
  const sourceLedgerPath = join(bootstrapRoot, ".shield", "dispatch-receipts.jsonl");
  const installedLedgerPath = join(isolatedRoot, ".shield", "dispatch-receipts.jsonl");
  const predecessorLedgerBytes = `${(await readFile(sourceLedgerPath, "utf8")).trim().split("\n").filter((line) => JSON.parse(line).receiptId === ISSUE_383_RECOVERY_FIXTURE.predecessorReceiptId).join("\n")}\n`;
  await writeFile(installedLedgerPath, predecessorLedgerBytes);
  const sourceEvidencePath = join(bootstrapRoot, ".shield", "audit", "copilot-fury-plan-dispatch", "df64de777e8ca9a7a553f6d80377cf324da893dbb6cac69a57f15705e6db3b84", "dispatch-evidence-ZQ2YCXxtHe-bA3F1CvdiVorSWOEblvTKL4kWSnqBKHM.json");
  const installedEvidenceDirectory = join(isolatedRoot, ".shield", "audit", "copilot-fury-plan-dispatch", "df64de777e8ca9a7a553f6d80377cf324da893dbb6cac69a57f15705e6db3b84");
  await mkdir(installedEvidenceDirectory, { recursive: true, mode: 0o700 });
  await copyFile(sourceEvidencePath, join(installedEvidenceDirectory, "dispatch-evidence-ZQ2YCXxtHe-bA3F1CvdiVorSWOEblvTKL4kWSnqBKHM.json"));
  assert.equal(await readFile(installedLedgerPath, "utf8"), predecessorLedgerBytes);
  assert.equal(await readFile(join(installedEvidenceDirectory, "dispatch-evidence-ZQ2YCXxtHe-bA3F1CvdiVorSWOEblvTKL4kWSnqBKHM.json"), "utf8"), await readFile(sourceEvidencePath, "utf8"));

  const request = evidence.packet.request;
  const isolatedRequest = { ...request, repositoryRoot: isolatedRoot };
  const resolved = await resolveCommittedTransitionPlanSourceV1(isolatedRequest);
  assert.equal(resolved.state, "valid", JSON.stringify(resolved));
  const makeRecoveryExecutor = (effects) => ({
    async preflight() {
      effects.preflight += 1;
      return { state: "ready", packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: request.requestedRuntime, executorId: request.requestedExecutor };
    },
    async execute() {
      effects.execute += 1;
      effects.session += 1;
      effects.tool += 1;
      return { state: "failed", code: ISSUE_383_RECOVERY_FIXTURE.dispositionCode, errors: [...ISSUE_383_RECOVERY_FIXTURE.errors], observations: {} };
    },
  });
  const firstEffects = { preflight: 0, execute: 0, session: 0, tool: 0 };
  const first = await dispatchCopilotFuryPlanReviewCoreV1(request, resolved.source, {
    repositoryRootOverride: isolatedRoot,
    executor: makeRecoveryExecutor(firstEffects),
  });
  assert.equal(first.state, "failed", JSON.stringify(first));
  assert.equal(first.replayed, false);
  assert.equal(first.receiptId, eligibility.successor.receiptId);
  assert.deepEqual(firstEffects, { preflight: 1, execute: 1, session: 1, tool: 1 });
  const ledgerAfterFirst = await readFile(installedLedgerPath, "utf8");
  const successorReplay = replaySeatDispatchReceiptsV1(ledgerAfterFirst.trim().split("\n").map((line) => JSON.parse(line)));
  assert.equal(successorReplay.state, "valid", JSON.stringify(successorReplay));
  const successor = successorReplay.projections.find(({ receiptId }) => receiptId === eligibility.successor.receiptId);
  assert.ok(successor);
  assert.equal(successor.state, "failed");
  assert.deepEqual(successor.outputEvidenceRefs?.length, 1);
  const successorEvidence = JSON.parse(await readFile(join(isolatedRoot, first.evidencePath), "utf8"));
  assert.equal(successorEvidence.recovery.predecessorReceiptId, ISSUE_383_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.equal(successorEvidence.recovery.successorExecutionIdentity.receiptId, eligibility.successor.receiptId);
  const persistenceRoot = join(isolatedRoot, ".shield", "runtime", "copilot-fury");
  const persistenceAfterFirst = await readdir(persistenceRoot);
  const secondEffects = { preflight: 0, execute: 0, session: 0, tool: 0 };
  const second = await dispatchCopilotFuryPlanReviewCoreV1(request, resolved.source, {
    repositoryRootOverride: isolatedRoot,
    executor: makeRecoveryExecutor(secondEffects),
  });
  assert.equal(second.state, "failed", JSON.stringify(second));
  assert.equal(second.receiptId, first.receiptId);
  assert.equal(second.replayed, true);
  assert.deepEqual(secondEffects, { preflight: 0, execute: 0, session: 0, tool: 0 });
  assert.deepEqual(await readdir(persistenceRoot), persistenceAfterFirst);
  assert.equal(await readFile(installedLedgerPath, "utf8"), ledgerAfterFirst);
});

test("frozen admission predecessors execute one corrected production successor and then ordinary-replay", async () => {
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_ADMISSION_RECOVERABLE_RECEIPT_ID, ISSUE_384_ADMISSION_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_ADMISSION_RECOVERABLE_TERMINAL_ENTRY_DIGEST, ISSUE_384_ADMISSION_RECOVERY_FIXTURE.terminalEntryDigest);
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_ADMISSION_RECOVERABLE_OUTPUT_EVIDENCE_DIGEST, ISSUE_384_ADMISSION_RECOVERY_FIXTURE.outputEvidenceDigest);
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_ADMISSION_RECOVERABLE_PACKET_DIGEST, ISSUE_384_ADMISSION_RECOVERY_FIXTURE.packetDigest);

  const bootstrapRoot = "/private/tmp/shield-383-bootstrap";
  const evidenceRelative = join(".shield", "audit", "copilot-fury-plan-dispatch", "df64de777e8ca9a7a553f6d80377cf324da893dbb6cac69a57f15705e6db3b84", "dispatch-evidence-iagGiK0Atepc3A2AtXgU4I4cJz7XEBRbPJQlHvMzvGE.json");
  const predecessorEvidence = JSON.parse(await readFile(join(bootstrapRoot, evidenceRelative), "utf8"));
  assert.equal(predecessorEvidence.receiptId, ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.equal(predecessorEvidence.evidenceDigest, ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.outputEvidenceDigest);
  assert.equal(predecessorEvidence.packetDigest, ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.packetDigest);
  assert.equal(predecessorEvidence.outcome, "failed");
  assert.equal(predecessorEvidence.dispositionCode, ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.dispositionCode);
  assert.deepEqual(predecessorEvidence.errors, [...ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.errors]);
  assert.equal(predecessorEvidence.observations.unauthorizedToolOrEffectObserved, true);

  const isolatedRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-copilot-fury-admission-recovery-")));
  await cp(bootstrapRoot, isolatedRoot, { recursive: true, preserveTimestamps: true });
  const ledgerPath = join(isolatedRoot, ".shield", "dispatch-receipts.jsonl");
  const ledgerLines = (await readFile(ledgerPath, "utf8")).trimEnd().split("\n");
  const predecessorTerminalIndex = ledgerLines.findIndex((line) => JSON.parse(line).entryDigest === ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.terminalEntryDigest);
  assert.notEqual(predecessorTerminalIndex, -1);
  await writeFile(ledgerPath, `${ledgerLines.slice(0, predecessorTerminalIndex + 1).join("\n")}\n`, "utf8");
  await rm(join(isolatedRoot, ".shield", "runtime", "copilot-fury"), { recursive: true, force: true });
  const request = predecessorEvidence.packet.request;
  const isolatedRequest = { ...request, repositoryRoot: isolatedRoot };
  const resolved = await resolveCommittedTransitionPlanSourceV1(isolatedRequest);
  assert.equal(resolved.state, "valid", JSON.stringify(resolved));
  const current = { root: isolatedRoot, request: isolatedRequest, plan: predecessorEvidence.packet.transitionPlan };
  const harness = productionSdkHarness({
    models: [{ id: request.requestedModel }],
    outputText: productionPassOutput(current),
    preToolUseCalls: [
      { toolName: "read", toolArgs: JSON.stringify({ path: request.transitionPlanPath }) },
      { toolName: "search", toolArgs: JSON.stringify({ query: "mission", path: "docs" }) },
    ],
  });
  const first = await dispatchCopilotFuryPlanReviewCoreV1(request, resolved.source, {
    repositoryRootOverride: isolatedRoot,
    executor: createCopilotFuryPlanExecutorV1({
      async loadSdk() { return harness.module; },
      async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
    }),
  });
  assert.equal(first.state, "completed", JSON.stringify(first));
  assert.equal(first.replayed, false);
  assert.notEqual(first.receiptId, ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.deepEqual(harness.calls.toolResults.map(({ name }) => name), ["read", "search"]);
  const successorEvidence = JSON.parse(await readFile(join(isolatedRoot, first.evidencePath), "utf8"));
  assert.equal(successorEvidence.recovery.predecessorReceiptId, ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.predecessorReceiptId);
  assert.equal(successorEvidence.recovery.predecessorTerminalEntryDigest, ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.terminalEntryDigest);
  assert.equal(successorEvidence.recovery.failedEvidenceDigest, ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.outputEvidenceDigest);
  assert.equal(successorEvidence.recovery.originalPacketDigest, ISSUE_384_BATCH_ADMISSION_RECOVERY_FIXTURE.packetDigest);
  assert.deepEqual(successorEvidence.observations.callbackObservation.records.map(({ surface, tool, decision, argumentShape }) => ({ surface, tool, decision, kind: argumentShape.kind })), [
    { surface: "pre_tool", tool: "read", decision: "allow", kind: "string" },
    { surface: "handler", tool: "read", decision: "invoked", kind: "object" },
    { surface: "pre_tool", tool: "search", decision: "allow", kind: "string" },
    { surface: "handler", tool: "search", decision: "invoked", kind: "object" },
  ]);

  const ledgerAfterFirst = await readFile(ledgerPath, "utf8");
  const retryHarness = productionSdkHarness({ outputText: productionPassOutput(current) });
  const retry = await dispatchCopilotFuryPlanReviewCoreV1(request, resolved.source, {
    repositoryRootOverride: isolatedRoot,
    executor: createCopilotFuryPlanExecutorV1({
      async loadSdk() { return retryHarness.module; },
      async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
    }),
  });
  assert.equal(retry.state, "completed", JSON.stringify(retry));
  assert.equal(retry.receiptId, first.receiptId);
  assert.equal(retry.replayed, true);
  assert.deepEqual({ construct: retryHarness.calls.construct, start: retryHarness.calls.start, createSession: retryHarness.calls.createSession, tools: retryHarness.calls.toolResults.length }, { construct: 0, start: 0, createSession: 0, tools: 0 });
  assert.equal(await readFile(ledgerPath, "utf8"), ledgerAfterFirst);
});

test("V2 contract exhaustion terminalizes once with no findings and replays without execution", async () => {
  const current = await fixture();
  const base = executor(current.plan);
  const invalidExecutor = {
    ...base.value,
    async execute(input) {
      base.calls.execute += 1;
      return {
        state: "completed",
        outputText: JSON.stringify({
          schemaVersion: 2,
          contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2,
          authority: "none",
          reviewerSeatId: "fury",
          reviewedArtifactId: current.plan.id,
          reviewedArtifactRevision: current.plan.digest,
          verdict: "REVISE",
          findings: [{ code: "BOUND_REVISION_EVIDENCE_ABSENT", message: "out of phase" }],
          reviewPhase: COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
          repositoryRevision: input.configuration.repositoryRevision,
        }),
        observations: {
          sessionStartObserved: true,
          sessionId: input.configuration.sessionId,
          selectedAgent: "fury",
          model: input.configuration.model,
          assistantModel: input.configuration.model,
          runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
          executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
          loadedSdkPackageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
          sessionProducer: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
          sessionProducerVersion: "1.0.79",
          modelChangeObserved: false,
          agentSubstitutionObserved: false,
          unauthorizedToolOrEffectObserved: false,
          policyDecisions: [],
          executionObservation: executionObservation(input),
        },
      };
    },
  };
  const first = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: invalidExecutor, userCopilotHome: current.userCopilotHome });
  assert.equal(first.state, "failed", JSON.stringify(first));
  assert.equal(first.code, COPILOT_FURY_PLAN_PHASE_CONTRACT_ERROR_CODE_V2);
  assert.deepEqual(first.handoff, null);
  assert.equal(base.calls.execute, 1);
  const replay = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: executor(current.plan).value, userCopilotHome: current.userCopilotHome });
  assert.equal(replay.state, "failed", JSON.stringify(replay));
  assert.equal(replay.code, COPILOT_FURY_PLAN_PHASE_CONTRACT_ERROR_CODE_V2);
  assert.equal(replay.replayed, true);
});

test("V2 production repair prompt is exact, phase-bound, and dedicated", async () => {
  const current = await fixture();
  const outOfPhase = JSON.stringify(architectureResult(current, { verdict: "REVISE", findings: [{ code: "BOUND_REVISION_EVIDENCE_ABSENT", message: "Later-phase evidence." }] }));
  const harness = productionSdkHarness({ outputTexts: [outOfPhase, productionPassOutput(current)] });
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, {
    executor: createCopilotFuryPlanExecutorV1({ async loadSdk() { return harness.module; }, async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; } }),
    userCopilotHome: current.userCopilotHome,
  });
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(result.disposition, "PASS");
  assert.equal(harness.calls.prompts.length, 2);
  const [initialPrompt, repairPrompt] = harness.calls.prompts;
  for (const prompt of harness.calls.prompts) {
    assert.ok(prompt.includes(`reviewPhase=${COPILOT_FURY_PLAN_REVIEW_PHASE_V2}`));
    assert.ok(prompt.includes(`repositoryRevision=${current.request.headRevision}`));
    assert.ok(prompt.includes(`transitionPlanId=${current.plan.id}`));
    assert.ok(prompt.includes(`transitionPlanDigest=${current.plan.digest}`));
    for (const code of COPILOT_FURY_PLAN_FINDING_CODES_V2) assert.ok(prompt.includes(code), code);
  }
  assert.match(initialPrompt, /Do not require completed May implementation, Mack validation, publication evidence, final acceptance, or later human evidence/u);
  assert.match(repairPrompt, /shield\.copilot-fury-plan-result\.v2/u);
  assert.notEqual(repairPrompt, initialPrompt);
});

function capabilitySdk(overrides = {}) {
  const calls = { load: 0, metadata: 0, stdio: 0, construct: 0, start: 0, createSession: 0, listModels: 0 };
  class CopilotClient {
    constructor() { calls.construct += 1; }
    async start() { calls.start += 1; }
    async createSession() { calls.createSession += 1; }
    async listModels() { calls.listModels += 1; }
  }
  const module = overrides.module ?? {
    CopilotClient,
    RuntimeConnection: {
      forStdio() {
        calls.stdio += 1;
        return overrides.connection ?? { kind: "stdio", path: undefined, args: undefined, env: undefined };
      },
    },
  };
  return {
    calls,
    dependencies: {
      async loadSdk() { calls.load += 1; if (overrides.loadError) throw new Error("missing sdk"); return module; },
      async resolveLoadedPackageVersion() { calls.metadata += 1; return overrides.version ?? COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
      ...(overrides.beforeFinalObservation === undefined ? {} : { beforeFinalObservation: overrides.beforeFinalObservation }),
    },
  };
}

test("authority-none Fury capability probe binds production card, receipt path, SDK, and performs no SDK effects", async () => {
  const current = await fixture();
  const sdk = capabilitySdk();
  const beforeShield = await readdir(join(current.root, ".shield"));
  const report = await probeCopilotFuryDispatchCapabilityV1(
    { repositoryRoot: current.root, expectedHead: current.request.headRevision },
    { ...sdk.dependencies, userCopilotHome: current.userCopilotHome },
  );
  assert.equal(report.contractVersion, COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION);
  assert.equal(report.authority, "none");
  assert.equal(report.disposition, "ready");
  assert.equal(report.reasonCode, "ready");
  assert.deepEqual(report.package, { name: "@github/copilot-sdk", version: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION });
  assert.deepEqual(report.target, { runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID });
  assert.equal(report.card.sourceKind, "repository");
  assert.equal(report.card.logicalRef, ".github/agents/fury.agent.md");
  assert.equal(report.card.repositoryRevision, current.request.headRevision);
  assert.deepEqual(report.card.precedenceObservations.map(({ sourceKind, disposition }) => ({ sourceKind, disposition })), [
    { sourceKind: "repository", disposition: "selected" },
    { sourceKind: "user", disposition: "absent" },
  ]);
  assert.deepEqual(report.dispatchReceipt, {
    logicalPath: ".shield/dispatch-receipts.jsonl",
    lockLogicalPath: ".shield/dispatch-receipts.jsonl.lock",
    safety: "safe",
  });
  assert.deepEqual(sdk.calls, { load: 1, metadata: 1, stdio: 1, construct: 0, start: 0, createSession: 0, listModels: 0 });
  assert.deepEqual(await readdir(join(current.root, ".shield")), beforeShield);
  await assert.rejects(lstat(join(current.root, ".shield", "dispatch-receipts.jsonl")), { code: "ENOENT" });
});

test("Fury SDK inspection rejects hostile descriptors, proxies, and throws without invoking accessors", async () => {
  const run = async (module) => {
    const current = await fixture();
    return probeCopilotFuryDispatchCapabilityV1(
      { repositoryRoot: current.root, expectedHead: current.request.headRevision },
      {
        async loadSdk() { return module; },
        async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
        userCopilotHome: current.userCopilotHome,
      },
    );
  };
  let getterCalls = 0;
  const accessorModule = { RuntimeConnection: { forStdio() { return { kind: "stdio", path: undefined, args: undefined, env: undefined }; } } };
  Object.defineProperty(accessorModule, "CopilotClient", { enumerable: true, get() { getterCalls += 1; throw new Error("must not execute"); } });
  assert.equal((await run(accessorModule)).reasonCode, "copilot_sdk_exports_invalid");
  assert.equal(getterCalls, 0);

  let proxyReads = 0;
  const proxiedModule = new Proxy({ CopilotClient: class {}, RuntimeConnection: {} }, {
    get(target, key, receiver) { if (key !== "then") proxyReads += 1; return Reflect.get(target, key, receiver); },
  });
  assert.equal((await run(proxiedModule)).reasonCode, "copilot_sdk_exports_invalid");
  assert.equal(proxyReads, 0);

  let constructCalls = 0;
  const proxiedClient = new Proxy(class {}, {
    construct(target, args, newTarget) { constructCalls += 1; return Reflect.construct(target, args, newTarget); },
  });
  assert.equal((await run({
    CopilotClient: proxiedClient,
    RuntimeConnection: { forStdio() { return { kind: "stdio", path: undefined, args: undefined, env: undefined }; } },
  })).reasonCode, "copilot_sdk_exports_invalid");
  assert.equal(constructCalls, 0);

  let applyCalls = 0;
  const proxiedForStdio = new Proxy(function forStdio() {
    return { kind: "stdio", path: undefined, args: undefined, env: undefined };
  }, {
    apply(target, thisArgument, args) { applyCalls += 1; return Reflect.apply(target, thisArgument, args); },
  });
  assert.equal((await run({ CopilotClient: class {}, RuntimeConnection: { forStdio: proxiedForStdio } })).reasonCode, "copilot_sdk_exports_invalid");
  assert.equal(applyCalls, 0);

  const runtimeAccessor = {};
  Object.defineProperty(runtimeAccessor, "forStdio", { enumerable: true, get() { getterCalls += 1; throw new Error("must not execute"); } });
  assert.equal((await run({ CopilotClient: class {}, RuntimeConnection: runtimeAccessor })).reasonCode, "copilot_sdk_exports_invalid");
  assert.equal(getterCalls, 0);

  const connectionAccessor = { path: undefined, args: undefined, env: undefined };
  Object.defineProperty(connectionAccessor, "kind", { enumerable: true, get() { getterCalls += 1; throw new Error("must not execute"); } });
  assert.equal((await run({ CopilotClient: class {}, RuntimeConnection: { forStdio() { return connectionAccessor; } } })).reasonCode, "copilot_stdio_projection_unsafe");
  assert.equal(getterCalls, 0);

  proxyReads = 0;
  const connectionProxy = new Proxy({ kind: "stdio", path: undefined, args: undefined, env: undefined }, {
    get(target, key, receiver) { proxyReads += 1; return Reflect.get(target, key, receiver); },
  });
  assert.equal((await run({ CopilotClient: class {}, RuntimeConnection: { forStdio() { return connectionProxy; } } })).reasonCode, "copilot_stdio_projection_unsafe");
  assert.equal(proxyReads, 0);

  assert.equal((await run({ CopilotClient: class {}, RuntimeConnection: { forStdio() { throw new Error("stdio failure"); } } })).reasonCode, "copilot_stdio_projection_unsafe");
});

test("Fury capability receipt-path probe accepts one regular file and rejects aliases, hardlinks, and unwritable state", async () => {
  const current = await fixture();
  const logPath = join(current.root, ".shield", "dispatch-receipts.jsonl");
  const probe = () => probeCopilotFuryDispatchCapabilityV1(
    { repositoryRoot: current.root, expectedHead: current.request.headRevision },
    { ...capabilitySdk().dependencies, userCopilotHome: current.userCopilotHome },
  );
  await writeFile(logPath, "\n");
  assert.equal((await probe()).reasonCode, "ready");

  const outside = join(current.userCopilotHome, "outside-receipt");
  await writeFile(outside, "\n");
  await unlink(logPath);
  await symlink(outside, logPath);
  assert.equal((await probe()).reasonCode, "dispatch_receipt_path_unsafe");

  await unlink(logPath);
  await link(outside, logPath);
  assert.equal((await probe()).reasonCode, "dispatch_receipt_path_unsafe");

  await unlink(logPath);
  await chmod(join(current.root, ".shield"), 0o500);
  try { assert.equal((await probe()).reasonCode, "dispatch_receipt_path_unsafe"); }
  finally { await chmod(join(current.root, ".shield"), 0o755); }
});

test("Fury capability revalidates receipt lock absence and log identity at the final no-follow boundary", async () => {
  const locked = await fixture();
  const lockResult = await probeCopilotFuryDispatchCapabilityV1(
    { repositoryRoot: locked.root, expectedHead: locked.request.headRevision },
    {
      ...capabilitySdk().dependencies,
      userCopilotHome: locked.userCopilotHome,
      beforeFinalObservation: async () => writeFile(join(locked.root, ".shield", "dispatch-receipts.jsonl.lock"), "injected\n"),
    },
  );
  assert.equal(lockResult.reasonCode, "dispatch_receipt_path_unsafe");

  const replaced = await fixture();
  const logPath = join(replaced.root, ".shield", "dispatch-receipts.jsonl");
  await writeFile(logPath, "before\n");
  const logResult = await probeCopilotFuryDispatchCapabilityV1(
    { repositoryRoot: replaced.root, expectedHead: replaced.request.headRevision },
    {
      ...capabilitySdk().dependencies,
      userCopilotHome: replaced.userCopilotHome,
      beforeFinalObservation: async () => {
        await unlink(logPath);
        await writeFile(logPath, "replacement\n");
      },
    },
  );
  assert.equal(logResult.reasonCode, "dispatch_receipt_path_unsafe");
});

test("Fury capability probe exposes closed failure reasons and preserves precedence", async () => {
  const invalid = await probeCopilotFuryDispatchCapabilityV1({ repositoryRoot: "relative", expectedHead: "bad" });
  assert.equal(invalid.reasonCode, "invalid_input");
  const unavailable = await probeCopilotFuryDispatchCapabilityV1({ repositoryRoot: join(tmpdir(), "missing-shield-capability"), expectedHead: "a".repeat(40) });
  assert.equal(unavailable.reasonCode, "repository_unavailable");

  const stale = await fixture();
  const staleSdk = capabilitySdk({ loadError: true });
  const staleResult = await probeCopilotFuryDispatchCapabilityV1(
    { repositoryRoot: stale.root, expectedHead: "b".repeat(40) },
    { ...staleSdk.dependencies, userCopilotHome: stale.userCopilotHome },
  );
  assert.equal(staleResult.reasonCode, "expected_head_mismatch");

  const dirty = await fixture();
  await writeFile(join(dirty.root, "dirty.txt"), "dirty\n");
  const dirtyResult = await probeCopilotFuryDispatchCapabilityV1(
    { repositoryRoot: dirty.root, expectedHead: dirty.request.headRevision },
    { ...capabilitySdk({ loadError: true }).dependencies, userCopilotHome: dirty.userCopilotHome },
  );
  assert.equal(dirtyResult.reasonCode, "workspace_dirty");

  const absent = await fixture({ repositoryCard: false });
  const absentResult = await probeCopilotFuryDispatchCapabilityV1(
    { repositoryRoot: absent.root, expectedHead: absent.request.headRevision },
    { ...capabilitySdk().dependencies, userCopilotHome: absent.userCopilotHome },
  );
  assert.equal(absentResult.reasonCode, "fury_card_unavailable");

  const shadowed = await fixture();
  await writeFile(join(shadowed.userCopilotHome, "agents", "fury.agent.md"), FURY_CARD);
  const shadowedResult = await probeCopilotFuryDispatchCapabilityV1(
    { repositoryRoot: shadowed.root, expectedHead: shadowed.request.headRevision },
    { ...capabilitySdk().dependencies, userCopilotHome: shadowed.userCopilotHome },
  );
  assert.equal(shadowedResult.reasonCode, "fury_card_shadowed");

  const unsafe = await fixture();
  await writeFile(join(unsafe.root, ".shield", "dispatch-receipts.jsonl.lock"), "held\n");
  git(unsafe.root, ["add", "-f", ".shield/dispatch-receipts.jsonl.lock"]);
  git(unsafe.root, ["commit", "-qm", "unsafe receipt lock fixture"]);
  const unsafeHead = git(unsafe.root, ["rev-parse", "HEAD"]);
  const unsafeResult = await probeCopilotFuryDispatchCapabilityV1(
    { repositoryRoot: unsafe.root, expectedHead: unsafeHead },
    { ...capabilitySdk({ loadError: true }).dependencies, userCopilotHome: unsafe.userCopilotHome },
  );
  assert.equal(unsafeResult.reasonCode, "dispatch_receipt_path_unsafe");

  for (const [label, overrides, reasonCode, expectedStdio] of [
    ["unavailable", { loadError: true }, "copilot_sdk_unavailable", 0],
    ["version", { version: "1.0.10" }, "copilot_sdk_version_mismatch", 0],
    ["exports", { module: { CopilotClient: class {}, RuntimeConnection: {} } }, "copilot_sdk_exports_invalid", 0],
    ["stdio", { connection: { kind: "stdio", path: "/unsafe" } }, "copilot_stdio_projection_unsafe", 1],
  ]) {
    const current = await fixture();
    const sdkCase = capabilitySdk(overrides);
    const result = await probeCopilotFuryDispatchCapabilityV1(
      { repositoryRoot: current.root, expectedHead: current.request.headRevision },
      { ...sdkCase.dependencies, userCopilotHome: current.userCopilotHome },
    );
    assert.equal(result.reasonCode, reasonCode, label);
    assert.equal(sdkCase.calls.stdio, expectedStdio, label);
    assert.equal(sdkCase.calls.construct, 0, label);
  }

  const drift = await fixture();
  const driftSdk = capabilitySdk({ beforeFinalObservation: async () => writeFile(join(drift.root, "drift.txt"), "drift\n") });
  const driftResult = await probeCopilotFuryDispatchCapabilityV1(
    { repositoryRoot: drift.root, expectedHead: drift.request.headRevision },
    { ...driftSdk.dependencies, userCopilotHome: drift.userCopilotHome },
  );
  assert.equal(driftResult.reasonCode, "repository_drift");
});

test("repository Fury card PASS is durable, attributable, replay-safe, and confined", async () => {
  const current = await fixture();
  const fake = executor(current.plan);
  const first = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: fake.value, userCopilotHome: current.userCopilotHome });
  assert.equal(first.state, "completed", JSON.stringify(first));
  assert.equal(first.disposition, "PASS");
  assert.equal(first.authority, "none");
  assert.match(first.evidencePath, /^\.shield\/audit\/copilot-fury-plan-dispatch\/[a-f0-9]{64}\//u);
  assert.match(first.handoff.transitionPlanPath, /^\.shield\/audit\/copilot-fury-plan-dispatch\//u);
  assert.match(first.handoff.reviewArtifactPath, /^\.shield\/audit\/copilot-fury-plan-dispatch\//u);
  const review = JSON.parse(await readFile(join(current.root, first.handoff.reviewArtifactPath), "utf8"));
  assert.equal(review.verdict, "PASS");
  assert.equal(review.reviewerSeatId, "fury");
  assert.equal(review.reviewerRuntimeId, COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID);
  assert.equal(review.reviewerExecutorId, COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID);
  assert.equal(fake.calls.execute, 1);
  assert.deepEqual(fake.calls.configurations[0].availableTools, ["read", "search"]);
  assert.deepEqual(fake.calls.configurations[0].allowedEffects, []);
  assert.equal(fake.calls.configurations[0].clientMode, "empty");
  assert.equal(fake.calls.configurations[0].customAgentsLocalOnly, true);
  const replayExecutor = executor(current.plan);
  const replay = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: replayExecutor.value, userCopilotHome: current.userCopilotHome });
  assert.equal(replay.state, "completed", JSON.stringify(replay));
  assert.equal(replay.disposition, "PASS");
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.handoff, first.handoff);
  assert.equal(replayExecutor.calls.execute, 0);
});

test("SDK-rendered action text may precede one closed Fury result object", async () => {
  const current = await fixture();
  const fake = executor(current.plan, "REVISE");
  const decorated = {
    ...fake.value,
    async execute(input) {
      const result = await fake.value.execute(input);
      return { ...result, outputText: `Actions completed without host effects.\n${result.outputText}` };
    },
  };
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: decorated, userCopilotHome: current.userCopilotHome });
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(result.disposition, "REVISE");
});

test("explicit digest-bound user override succeeds while silent shadowing fails before claim", async () => {
  const current = await fixture();
  const userBytes = FURY_CARD.replace("Review only", "Perform review only");
  await writeFile(join(current.userCopilotHome, "agents", "fury.agent.md"), userBytes);
  const silent = executor(current.plan);
  const rejected = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: silent.value, userCopilotHome: current.userCopilotHome });
  assert.equal(rejected.state, "invalid");
  assert.equal(silent.calls.preflight, 0);
  assert.equal(silent.calls.execute, 0);
  const overrideRequest = {
    ...current.request,
    cardSelection: { kind: "explicit_user_override", logicalRef: COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF, expectedSha256: sha256(userBytes) },
  };
  const explicit = executor(current.plan);
  const accepted = await dispatchCopilotFuryPlanReviewV1(overrideRequest, { executor: explicit.value, userCopilotHome: current.userCopilotHome });
  assert.equal(accepted.state, "completed", JSON.stringify(accepted));
  assert.equal(accepted.disposition, "PASS");
  assert.equal(explicit.calls.execute, 1);
});

test("exact digest-bound user override succeeds without a repository card and replays execute-once evidence", async () => {
  const current = await fixture({ repositoryCard: false });
  const userBytes = FURY_CARD.replace("Review only", "Perform exact review only");
  await writeFile(join(current.userCopilotHome, "agents", "fury.agent.md"), userBytes);
  const request = {
    ...current.request,
    cardSelection: { kind: "explicit_user_override", logicalRef: COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF, expectedSha256: sha256(userBytes) },
  };
  const firstExecutor = executor(current.plan);
  const first = await dispatchCopilotFuryPlanReviewV1(request, { executor: firstExecutor.value, userCopilotHome: current.userCopilotHome });
  assert.equal(first.state, "completed", JSON.stringify(first));
  assert.equal(first.disposition, "PASS");
  assert.equal(first.authority, "none");
  assert.equal(firstExecutor.calls.preflight, 1);
  assert.equal(firstExecutor.calls.execute, 1);
  const evidence = JSON.parse(await readFile(join(current.root, first.evidencePath), "utf8"));
  assert.equal(evidence.cardIdentity.sourceKind, "explicit_user_override");
  assert.equal(evidence.cardIdentity.contentDigest, sha256(userBytes));
  assert.equal(evidence.cardIdentity.repositoryRevision, null);
  assert.deepEqual(evidence.cardIdentity.precedenceObservations, [
    { sourceKind: "repository", logicalRef: ".github/agents/fury.agent.md", disposition: "absent", contentDigest: null },
    { sourceKind: "user", logicalRef: COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF, disposition: "selected", contentDigest: sha256(userBytes) },
  ]);

  const replayExecutor = executor(current.plan);
  const replay = await dispatchCopilotFuryPlanReviewV1(request, { executor: replayExecutor.value, userCopilotHome: current.userCopilotHome });
  assert.equal(replay.state, "completed", JSON.stringify(replay));
  assert.equal(replay.disposition, "PASS");
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.handoff, first.handoff);
  assert.equal(replayExecutor.calls.preflight, 0);
  assert.equal(replayExecutor.calls.execute, 0);
});

test("repository default without a repository card fails before preflight, claim, ledger, audit, or execution", async () => {
  const current = await fixture({ repositoryCard: false });
  const calls = { ledger: 0, claim: 0 };
  const fake = executor(current.plan);
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, {
    executor: fake.value,
    userCopilotHome: current.userCopilotHome,
    async readDispatchLedger() { calls.ledger += 1; throw new Error("must not read ledger"); },
    async claimDispatchPacket() { calls.claim += 1; throw new Error("must not claim"); },
  });
  assert.equal(result.state, "blocked", JSON.stringify(result));
  assert.equal(result.code, "BLOCKED_ADAPTER_GAP");
  assert.equal(fake.calls.preflight, 0);
  assert.equal(fake.calls.execute, 0);
  assert.deepEqual(calls, { ledger: 0, claim: 0 });
  await assert.rejects(readFile(join(current.root, ".shield", "dispatch-receipts.jsonl"), "utf8"), { code: "ENOENT" });
  await assert.rejects(lstat(join(current.root, ".shield", "audit")), { code: "ENOENT" });
});

test("invalid explicit user cards without a repository card retain the pre-effect boundary", async (t) => {
  const cases = [
    { name: "missing", prepare: async () => "0".repeat(64) },
    { name: "malformed", prepare: async (current) => { const bytes = "not a card\n"; await writeFile(join(current.userCopilotHome, "agents", "fury.agent.md"), bytes); return sha256(bytes); } },
    { name: "wrong seat", prepare: async (current) => { const bytes = FURY_CARD.replace("name: Fury", "name: May"); await writeFile(join(current.userCopilotHome, "agents", "fury.agent.md"), bytes); return sha256(bytes); } },
    { name: "unsafe path", prepare: async (current) => { const outside = join(current.userCopilotHome, "outside.agent.md"); await writeFile(outside, FURY_CARD); await symlink(outside, join(current.userCopilotHome, "agents", "fury.agent.md")); return sha256(FURY_CARD); } },
    { name: "digest mismatch", prepare: async (current) => { await writeFile(join(current.userCopilotHome, "agents", "fury.agent.md"), FURY_CARD); return "0".repeat(64); } },
  ];
  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const current = await fixture({ repositoryCard: false });
      const expectedSha256 = await testCase.prepare(current);
      const fake = executor(current.plan);
      const calls = { ledger: 0, claim: 0 };
      const result = await dispatchCopilotFuryPlanReviewV1({
        ...current.request,
        cardSelection: { kind: "explicit_user_override", logicalRef: COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF, expectedSha256 },
      }, {
        executor: fake.value,
        userCopilotHome: current.userCopilotHome,
        async readDispatchLedger() { calls.ledger += 1; throw new Error("must not read ledger"); },
        async claimDispatchPacket() { calls.claim += 1; throw new Error("must not claim"); },
      });
      assert.ok(result.state === "invalid" || result.state === "blocked", JSON.stringify(result));
      assert.equal(fake.calls.preflight, 0);
      assert.equal(fake.calls.execute, 0);
      assert.deepEqual(calls, { ledger: 0, claim: 0 });
      await assert.rejects(readFile(join(current.root, ".shield", "dispatch-receipts.jsonl"), "utf8"), { code: "ENOENT" });
      await assert.rejects(lstat(join(current.root, ".shield", "audit")), { code: "ENOENT" });
    });
  }
});

test("replacement refs cannot turn literal-HEAD repository-card absence into presence", async () => {
  const current = await fixture({ repositoryCard: false });
  const userBytes = FURY_CARD.replace("Review only", "Review the literal tree only");
  await writeFile(join(current.userCopilotHome, "agents", "fury.agent.md"), userBytes);
  git(current.root, ["switch", "-qc", "replacement-card"]);
  await writeFile(join(current.root, ".github", "agents", "fury.agent.md"), FURY_CARD);
  git(current.root, ["add", ".github/agents/fury.agent.md"]);
  git(current.root, ["commit", "-qm", "replacement adds repository card"]);
  const replacementRevision = git(current.root, ["rev-parse", "HEAD"]);
  git(current.root, ["switch", "-q", "main"]);
  git(current.root, ["replace", current.request.headRevision, replacementRevision]);
  assert.equal(git(current.root, ["show", `${current.request.headRevision}:.github/agents/fury.agent.md`]), FURY_CARD.trim());

  const request = {
    ...current.request,
    cardSelection: { kind: "explicit_user_override", logicalRef: COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF, expectedSha256: sha256(userBytes) },
  };
  const fake = executor(current.plan);
  const result = await dispatchCopilotFuryPlanReviewV1(request, { executor: fake.value, userCopilotHome: current.userCopilotHome });
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(result.disposition, "PASS");
  assert.equal(fake.calls.execute, 1);
  const evidence = JSON.parse(await readFile(join(current.root, result.evidencePath), "utf8"));
  assert.deepEqual(evidence.cardIdentity.precedenceObservations[0], {
    sourceKind: "repository",
    logicalRef: ".github/agents/fury.agent.md",
    disposition: "absent",
    contentDigest: null,
  });
});

test("a non-regular exact-tree repository card cannot be classified as absent for an override", async () => {
  const current = await fixture({ repositoryCard: false });
  const userBytes = FURY_CARD.replace("Review only", "Review only from the user card");
  await writeFile(join(current.userCopilotHome, "agents", "fury.agent.md"), userBytes);
  await symlink("../../package.json", join(current.root, ".github", "agents", "fury.agent.md"));
  git(current.root, ["add", ".github/agents/fury.agent.md"]);
  git(current.root, ["commit", "-qm", "add unsafe repository card"]);
  current.request = { ...current.request, headRevision: git(current.root, ["rev-parse", "HEAD"]) };
  const fake = executor(current.plan);
  const result = await dispatchCopilotFuryPlanReviewV1({
    ...current.request,
    cardSelection: { kind: "explicit_user_override", logicalRef: COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF, expectedSha256: sha256(userBytes) },
  }, { executor: fake.value, userCopilotHome: current.userCopilotHome });
  assert.equal(result.state, "blocked", JSON.stringify(result));
  assert.equal(result.code, "BLOCKED_ADAPTER_GAP");
  assert.equal(fake.calls.preflight, 0);
  assert.equal(fake.calls.execute, 0);
  await assert.rejects(readFile(join(current.root, ".shield", "dispatch-receipts.jsonl"), "utf8"), { code: "ENOENT" });
  await assert.rejects(lstat(join(current.root, ".shield", "audit")), { code: "ENOENT" });
});

test("adapter gap is blocked before receipt or artifact effects", async () => {
  const current = await fixture();
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, {
    userCopilotHome: current.userCopilotHome,
    executor: {
      async preflight() { return { state: "blocked", code: "BLOCKED_ADAPTER_GAP", errors: ["SDK unavailable"] }; },
      async execute() { throw new Error("must not execute"); },
    },
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.code, "BLOCKED_ADAPTER_GAP");
  await assert.rejects(readFile(join(current.root, ".shield", "dispatch-receipts.jsonl"), "utf8"), { code: "ENOENT" });
  await assert.rejects(lstat(join(current.root, ".shield", "audit")), { code: "ENOENT" });
});

test("modified and untracked transition-plan bytes are rejected against literal HEAD before preflight", async () => {
  const modified = await fixture();
  const modifiedBytes = `${JSON.stringify(modified.plan)} \n`;
  await writeFile(join(modified.root, modified.request.transitionPlanPath), modifiedBytes);
  const modifiedExecutor = executor(modified.plan);
  const modifiedResult = await dispatchCopilotFuryPlanReviewV1({ ...modified.request, transitionPlanRawSha256: sha256(modifiedBytes) }, { executor: modifiedExecutor.value, userCopilotHome: modified.userCopilotHome });
  assert.equal(modifiedResult.state, "invalid", JSON.stringify(modifiedResult));
  assert.equal(modifiedResult.code, "TRANSITION_PLAN_HEAD_MISMATCH");
  assert.equal(modifiedExecutor.calls.preflight, 0);
  assert.equal(modifiedExecutor.calls.execute, 0);

  const untracked = await fixture();
  const untrackedPath = "docs/missions/substituted-transition-plan.json";
  const untrackedBytes = `${JSON.stringify(untracked.plan)}\n`;
  await writeFile(join(untracked.root, untrackedPath), untrackedBytes);
  const untrackedExecutor = executor(untracked.plan);
  const untrackedResult = await dispatchCopilotFuryPlanReviewV1({ ...untracked.request, transitionPlanPath: untrackedPath, transitionPlanRawSha256: sha256(untrackedBytes) }, { executor: untrackedExecutor.value, userCopilotHome: untracked.userCopilotHome });
  assert.equal(untrackedResult.state, "invalid", JSON.stringify(untrackedResult));
  assert.equal(untrackedResult.code, "TRANSITION_PLAN_HEAD_MISMATCH");
  assert.equal(untrackedExecutor.calls.preflight, 0);
  assert.equal(untrackedExecutor.calls.execute, 0);
  await assert.rejects(readFile(join(modified.root, ".shield", "dispatch-receipts.jsonl"), "utf8"), { code: "ENOENT" });
  await assert.rejects(readFile(join(untracked.root, ".shield", "dispatch-receipts.jsonl"), "utf8"), { code: "ENOENT" });
});

test("REVISE completes without a reviewed-transition handoff", async () => {
  const current = await fixture();
  const fake = executor(current.plan, "REVISE");
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: fake.value, userCopilotHome: current.userCopilotHome });
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(result.disposition, "REVISE");
  assert.equal(result.handoff, null);
  assert.equal(result.findings.length, 1);
});

test("failed, cancelled, and interrupted lifecycles replay without another model call", async () => {
  for (const state of ["failed", "cancelled", "interrupted"]) {
    const current = await fixture();
    const calls = { preflight: 0, execute: 0 };
    const terminalExecutor = {
      async preflight() {
        calls.preflight += 1;
        return { state: "ready", packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID };
      },
      async execute() {
        calls.execute += 1;
        return { state, code: `TEST_${state.toUpperCase()}`, errors: [`deterministic ${state}`], observations: {} };
      },
    };
    const first = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: terminalExecutor, userCopilotHome: current.userCopilotHome });
    assert.equal(first.state, state === "interrupted" ? "recovery_required" : state, JSON.stringify(first));
    assert.equal(calls.execute, 1);
    const replay = executor(current.plan);
    const second = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: replay.value, userCopilotHome: current.userCopilotHome });
    assert.equal(second.state, state === "interrupted" ? "recovery_required" : state, JSON.stringify(second));
    assert.equal(second.code, first.code);
    assert.deepEqual(second.errors, first.errors);
    assert.equal(second.replayed, true);
    assert.equal(replay.calls.preflight, 0);
    assert.equal(replay.calls.execute, 0);
  }
});

test("fresh admission failures reject malformed and conflicting projections before persistence", async () => {
  for (const [label, mutate] of [
    ["malformed-reason", (failure) => ({ ...failure, reason: "admission_future_denied" })],
    ["conflicting-projection", (failure) => ({ ...failure, reason: "admission_tool_denied" })],
  ]) {
    const current = await fixture();
    const expected = admissionFailureFixture();
    const returned = mutate(expected.admissionFailure);
    const terminalExecutor = {
      async preflight() { return { state: "ready", packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID }; },
      async execute() {
        return { state: "failed", code: "FURY_TOOL_ADMISSION_DENIED", errors: ["Fury tool admission denied; create a fresh corrected successor."], admissionFailure: returned, observations: { admissionFailure: expected.admissionFailure, callbackObservation: expected.callbackObservation } };
      },
    };
    const first = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: terminalExecutor, userCopilotHome: current.userCopilotHome });
    assert.equal(first.state, "failed", `${label}: ${JSON.stringify(first)}`);
    assert.equal(first.code, "DISPATCH_FAILED", label);
    assert.match(first.errors.join(" "), /admission_failure_malformed/u, label);
    const evidence = JSON.parse(await readFile(join(current.root, first.evidencePath), "utf8"));
    assert.equal(Object.hasOwn(evidence.observations, "admissionFailure"), false, label);
    const replay = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: executor(current.plan).value, userCopilotHome: current.userCopilotHome });
    assert.equal(replay.replayed, true, `${label}: ${JSON.stringify(replay)}`);
    assert.equal(Object.hasOwn(replay, "admissionFailure"), false, label);
  }
});

test("replay rejects malformed or conflicting new admission evidence and preserves legacy no-synthesis", async () => {
  for (const [label, mutate] of [
    ["malformed-reason", (failure, callbackObservation) => ({ admissionFailure: { ...failure, reason: "admission_future_denied" }, callbackObservation })],
    ["conflicting-callback", (failure, callbackObservation) => ({ admissionFailure: failure, callbackObservation: { ...callbackObservation, records: [{ ...callbackObservation.records[0], reason: "admission_tool_denied" }] } })],
  ]) {
    const current = await fixture();
    const request = v1Request(current);
    const expected = admissionFailureFixture();
    const ledger = historicalV1Ledger(current, request, "failed", {
      mutateEvidence(evidence) {
        const changed = mutate(expected.admissionFailure, expected.callbackObservation);
        return { ...evidence, dispositionCode: "FURY_TOOL_ADMISSION_DENIED", errors: ["Fury tool admission denied; create a fresh corrected successor."], observations: { admissionFailure: changed.admissionFailure, callbackObservation: changed.callbackObservation } };
      },
    });
    const replay = await dispatchCopilotFuryPlanReviewV1(request, { executor: executor(current.plan).value, userCopilotHome: current.userCopilotHome, readDispatchLedger: ledger.readDispatchLedger });
    assert.equal(replay.state, "invalid", `${label}: ${JSON.stringify(replay)}`);
    assert.match(replay.errors.join(" "), /replayed_admission_failure_malformed/u, label);
  }

  const legacy = await fixture();
  const legacyRequest = v1Request(legacy);
  const legacyLedger = historicalV1Ledger(legacy, legacyRequest, "failed");
  const legacyReplay = await dispatchCopilotFuryPlanReviewV1(legacyRequest, { executor: executor(legacy.plan).value, userCopilotHome: legacy.userCopilotHome, readDispatchLedger: legacyLedger.readDispatchLedger });
  assert.equal(legacyReplay.state, "failed", JSON.stringify(legacyReplay));
  assert.equal(Object.hasOwn(legacyReplay, "admissionFailure"), false);
  assert.deepEqual(legacyReplay.errors, ["historical failed"]);
});

test("claim failure and unsafe evidence ancestry prevent model execution", async () => {
  const claimFailure = await fixture();
  const claimExecutor = executor(claimFailure.plan);
  const denied = await dispatchCopilotFuryPlanReviewV1(claimFailure.request, {
    executor: claimExecutor.value,
    userCopilotHome: claimFailure.userCopilotHome,
    async claimDispatchPacket() { return { state: "invalid", code: "claim_fault", errors: ["claim denied"] }; },
  });
  assert.equal(denied.state, "invalid");
  assert.equal(claimExecutor.calls.execute, 0);

  const unsafe = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "shield-copilot-fury-outside-"));
  await symlink(outside, join(unsafe.root, ".shield", "audit"));
  const unsafeExecutor = executor(unsafe.plan);
  const rejected = await dispatchCopilotFuryPlanReviewV1(unsafe.request, { executor: unsafeExecutor.value, userCopilotHome: unsafe.userCopilotHome });
  assert.equal(rejected.state, "invalid");
  assert.equal(unsafeExecutor.calls.preflight, 0);
  assert.equal(unsafeExecutor.calls.execute, 0);
  assert.deepEqual(await readdir(outside), []);
});

test("post-claim drift and executor identity substitution terminate without PASS", async () => {
  const drift = await fixture();
  const driftExecutor = executor(drift.plan);
  const drifted = await dispatchCopilotFuryPlanReviewV1(drift.request, {
    executor: driftExecutor.value,
    userCopilotHome: drift.userCopilotHome,
    async beforeTerminalRevalidation() {
      await writeFile(join(drift.root, drift.request.transitionPlanPath), `${JSON.stringify(drift.plan)} \n`);
    },
  });
  assert.equal(drifted.state, "recovery_required", JSON.stringify(drifted));
  assert.equal(drifted.handoff, null);

  const substituted = await fixture();
  const base = executor(substituted.plan);
  const substitutedExecutor = {
    ...base.value,
    async execute(input) {
      const completed = await base.value.execute(input);
      return { ...completed, observations: { ...completed.observations, assistantModel: "model:substituted" } };
    },
  };
  const rejected = await dispatchCopilotFuryPlanReviewV1(substituted.request, { executor: substitutedExecutor, userCopilotHome: substituted.userCopilotHome });
  assert.equal(rejected.state, "failed", JSON.stringify(rejected));
  assert.equal(rejected.handoff, null);
});

test("terminal append uncertainty rereads the receipt and exact retry never reinvokes", async () => {
  const appendFault = await fixture();
  const appendExecutor = executor(appendFault.plan);
  let uncertainAppend = true;
  const appendResult = await dispatchCopilotFuryPlanReviewV1(appendFault.request, {
    executor: appendExecutor.value,
    userCopilotHome: appendFault.userCopilotHome,
    async appendDispatchReceipt(input) {
      const result = await appendSeatDispatchReceiptEntryV1(input);
      if (uncertainAppend) {
        uncertainAppend = false;
        return { state: "invalid", code: "terminal_append_uncertain", errors: ["terminal append result was lost"] };
      }
      return result;
    },
  });
  assert.equal(appendResult.state, "completed", JSON.stringify(appendResult));
  assert.equal(appendResult.disposition, "PASS");
  assert.equal(appendExecutor.calls.execute, 1);
  const retryExecutor = executor(appendFault.plan);
  const retry = await dispatchCopilotFuryPlanReviewV1(appendFault.request, { executor: retryExecutor.value, userCopilotHome: appendFault.userCopilotHome });
  assert.equal(retry.state, "completed", JSON.stringify(retry));
  assert.equal(retry.disposition, "PASS");
  assert.equal(retryExecutor.calls.execute, 0);
});

test("receipt readback uncertainty is deterministic on exact retry", async () => {
  const current = await fixture();
  const firstExecutor = executor(current.plan);
  let reads = 0;
  const first = await dispatchCopilotFuryPlanReviewV1(current.request, {
    executor: firstExecutor.value,
    userCopilotHome: current.userCopilotHome,
    async readDispatchLedger(input) {
      reads += 1;
      if (reads >= 3) return { state: "invalid", code: "receipt_readback_uncertain", errors: ["receipt readback unavailable"] };
      return readSeatDispatchReceiptLedgerV1(input);
    },
  });
  assert.equal(first.state, "recovery_required", JSON.stringify(first));
  const retryExecutor = executor(current.plan);
  const retry = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: retryExecutor.value, userCopilotHome: current.userCopilotHome });
  assert.equal(retry.state, "completed", JSON.stringify(retry));
  assert.equal(retry.disposition, "PASS");
  assert.equal(firstExecutor.calls.execute, 1);
  assert.equal(retryExecutor.calls.execute, 0);
});

test("terminal evidence, plan, and review readback faults recover on exact retry", async () => {
  for (const artifactPrefix of ["dispatch-evidence-", "transition-plan-", "transition-plan-review-"]) {
    const current = await fixture();
    const firstExecutor = executor(current.plan);
    let replacedPath;
    let originalBytes;
    const first = await dispatchCopilotFuryPlanReviewV1(current.request, {
      executor: firstExecutor.value,
      userCopilotHome: current.userCopilotHome,
      async beforeFinalReadback() {
        const missionRoot = join(current.root, ".shield", "audit", "copilot-fury-plan-dispatch", sha256(current.request.missionId));
        const artifactName = (await readdir(missionRoot)).find((name) => name.startsWith(artifactPrefix) && (artifactPrefix !== "transition-plan-" || !name.startsWith("transition-plan-review-")));
        assert.ok(artifactName);
        replacedPath = join(missionRoot, artifactName);
        originalBytes = await readFile(replacedPath, "utf8");
        await writeFile(replacedPath, "{}\n");
      },
    });
    assert.equal(first.state, "recovery_required", `${artifactPrefix}: ${JSON.stringify(first)}`);
    assert.ok(replacedPath);
    await writeFile(replacedPath, originalBytes);
    const retryExecutor = executor(current.plan);
    const retry = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: retryExecutor.value, userCopilotHome: current.userCopilotHome });
    assert.equal(retry.state, "completed", `${artifactPrefix}: ${JSON.stringify(retry)}`);
    assert.equal(retry.disposition, "PASS");
    assert.equal(firstExecutor.calls.execute, 1);
    assert.equal(retryExecutor.calls.execute, 0);
  }
});

test("unreferenced self-identifying terminal evidence is ignored on replay", async () => {
  const readbackFault = await fixture();
  const readbackExecutor = executor(readbackFault.plan);
  const first = await dispatchCopilotFuryPlanReviewV1(readbackFault.request, { executor: readbackExecutor.value, userCopilotHome: readbackFault.userCopilotHome });
  assert.equal(first.state, "completed", JSON.stringify(first));
  const missionRoot = join(readbackFault.root, ".shield", "audit", "copilot-fury-plan-dispatch", sha256(readbackFault.request.missionId));
  const evidenceName = (await readdir(missionRoot)).find((name) => name.startsWith("dispatch-evidence-"));
  assert.ok(evidenceName);
  await writeFile(join(missionRoot, "dispatch-evidence-unreferenced.json"), await readFile(join(missionRoot, evidenceName), "utf8"));
  const replayExecutor = executor(readbackFault.plan);
  const replay = await dispatchCopilotFuryPlanReviewV1(readbackFault.request, { executor: replayExecutor.value, userCopilotHome: readbackFault.userCopilotHome });
  assert.equal(replay.state, "completed", JSON.stringify(replay));
  assert.equal(replay.disposition, "PASS");
  assert.equal(replayExecutor.calls.execute, 0);
});

test("post-claim evidence-directory replacement cannot redirect artifacts", async () => {
  const current = await fixture();
  const fake = executor(current.plan);
  const outside = await mkdtemp(join(tmpdir(), "shield-copilot-fury-output-escape-"));
  const evidenceDirectory = join(current.root, ".shield", "audit", "copilot-fury-plan-dispatch", sha256(current.request.missionId));
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, {
    executor: fake.value,
    userCopilotHome: current.userCopilotHome,
    async afterClaimBeforeExecution() {
      await rename(evidenceDirectory, `${evidenceDirectory}.retained`);
      await symlink(outside, evidenceDirectory);
    },
  });
  assert.equal(result.state, "recovery_required", JSON.stringify(result));
  assert.equal(result.handoff, null);
  assert.deepEqual(await readdir(outside), []);
});

test("stable logical identity rejects conflicting packet bytes without reinvocation", async () => {
  const current = await fixture();
  const firstExecutor = executor(current.plan);
  const first = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: firstExecutor.value, userCopilotHome: current.userCopilotHome });
  assert.equal(first.state, "completed", JSON.stringify(first));
  const conflictExecutor = executor(current.plan);
  const conflict = await dispatchCopilotFuryPlanReviewV1({
    ...current.request,
    timestamp: { value: "2026-08-18T12:02:00.000Z", provenance: "hostTrusted" },
  }, { executor: conflictExecutor.value, userCopilotHome: current.userCopilotHome });
  assert.equal(conflict.state, "invalid", JSON.stringify(conflict));
  assert.equal(conflict.code, "packet_claim_conflict");
  assert.equal(conflictExecutor.calls.preflight, 0);
  assert.equal(conflictExecutor.calls.execute, 0);
  const entries = (await readFile(join(current.root, ".shield", "dispatch-receipts.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  const started = entries.find((entry) => entry.kind === "dispatch.started");
  assert.equal(started.parentMissionRevision, current.request.missionRevision);
  assert.equal(started.subjectRevision, current.request.subjectRevision);
  assert.equal(started.repositoryRevision, current.request.headRevision);
  assert.equal(started.artifactRevision, current.plan.digest);
});

test("duplicate-key model JSON fails closed before the result schema validator", async () => {
  const current = await fixture();
  const base = executor(current.plan);
  const duplicateExecutor = {
    ...base.value,
    async execute(input) {
      const completed = await base.value.execute(input);
      return {
        ...completed,
        outputText: `{"schemaVersion":2,"contractVersion":"${COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2}","authority":"none","reviewerSeatId":"fury","reviewedArtifactId":"${current.plan.id}","reviewedArtifactRevision":"${current.plan.digest}","verdict":"PASS","verdict":"REVISE","findings":[],"reviewPhase":"${COPILOT_FURY_PLAN_REVIEW_PHASE_V2}","repositoryRevision":"${current.request.headRevision}"}`,
      };
    },
  };
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: duplicateExecutor, userCopilotHome: current.userCopilotHome });
  assert.equal(result.state, "failed", JSON.stringify(result));
  assert.equal(result.handoff, null);
});

test("immediate preterminal drift and PASS artifact replacement cannot return a handoff", async () => {
  const preterminal = await fixture();
  const originalPlanBytes = await readFile(join(preterminal.root, preterminal.request.transitionPlanPath), "utf8");
  const firstExecutor = executor(preterminal.plan);
  const preterminalResult = await dispatchCopilotFuryPlanReviewV1(preterminal.request, {
    executor: firstExecutor.value,
    userCopilotHome: preterminal.userCopilotHome,
    async beforeTerminalAppend() {
      await writeFile(join(preterminal.root, preterminal.request.transitionPlanPath), `${JSON.stringify(preterminal.plan)} \n`);
    },
  });
  assert.equal(preterminalResult.state, "recovery_required", JSON.stringify(preterminalResult));
  assert.equal(preterminalResult.code, "PASS");
  assert.equal(preterminalResult.handoff, null);
  await writeFile(join(preterminal.root, preterminal.request.transitionPlanPath), originalPlanBytes);
  const retryExecutor = executor(preterminal.plan);
  const preterminalRetry = await dispatchCopilotFuryPlanReviewV1(preterminal.request, { executor: retryExecutor.value, userCopilotHome: preterminal.userCopilotHome });
  assert.equal(preterminalRetry.state, "recovery_required", JSON.stringify(preterminalRetry));
  assert.equal(preterminalRetry.code, "PASS");
  assert.equal(firstExecutor.calls.execute, 1);
  assert.equal(retryExecutor.calls.execute, 0);

  const readback = await fixture();
  const readbackResult = await dispatchCopilotFuryPlanReviewV1(readback.request, {
    executor: executor(readback.plan).value,
    userCopilotHome: readback.userCopilotHome,
    async beforeFinalReadback() {
      const missionRoot = join(readback.root, ".shield", "audit", "copilot-fury-plan-dispatch", sha256(readback.request.missionId));
      const reviewName = (await readdir(missionRoot)).find((name) => name.startsWith("transition-plan-review-"));
      assert.ok(reviewName);
      await writeFile(join(missionRoot, reviewName), "{}\n");
    },
  });
  assert.equal(readbackResult.state, "recovery_required", JSON.stringify(readbackResult));
  assert.equal(readbackResult.handoff, null);
});

test("real pinned SDK accepts the closed empty-mode explicit-stdio constructor options despite hostile ambient transport", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "shield-copilot-constructor-"));
  const previous = process.env.COPILOT_SDK_DEFAULT_CONNECTION;
  try {
    for (const hostile of ["inprocess", "definitely-invalid"]) {
      process.env.COPILOT_SDK_DEFAULT_CONNECTION = hostile;
      assert.doesNotThrow(() => new RealCopilotClient({
        mode: "empty",
        connection: RealRuntimeConnection.forStdio(),
        workingDirectory: baseDirectory,
        baseDirectory,
        logLevel: "none",
      }));
    }
  } finally {
    if (previous === undefined) delete process.env.COPILOT_SDK_DEFAULT_CONNECTION;
    else process.env.COPILOT_SDK_DEFAULT_CONNECTION = previous;
  }
});

test("real pinned SDK accepts the deterministic transport UUID at session.create", { timeout: 60_000 }, async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "shield-copilot-session-create-"));
  const client = new RealCopilotClient({
    mode: "empty",
    connection: RealRuntimeConnection.forStdio(),
    workingDirectory,
    baseDirectory: workingDirectory,
    logLevel: "none",
  });
  let session;
  try {
    await client.start();
    const models = await client.listModels();
    assert.ok(models.length > 0);
    const sessionId = deriveCopilotSdkSessionIdV1("session:" + "a".repeat(32));
    assert.match(sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    assert.equal(sessionId, deriveCopilotSdkSessionIdV1("session:" + "a".repeat(32)));
    session = await client.createSession({
      sessionId,
      model: models[0].id,
      workingDirectory,
      enableConfigDiscovery: false,
      skipCustomInstructions: true,
      enableSkills: false,
      mcpServers: {},
      tools: [],
      availableTools: [],
    });
    assert.equal(session.sessionId, sessionId);
  } finally {
    await session?.disconnect();
    await client.stop();
  }
});

test("successor V3 exact-binds the complete execution configuration to its packet", async () => {
  const current = await fixture();
  const childSessionId = "session:" + "a".repeat(32);
  const packetConfiguration = { ...productionConfiguration(current), sessionId: childSessionId };
  const executionConfiguration = {
    ...packetConfiguration,
    sessionId: deriveCopilotSdkSessionIdV1(childSessionId),
  };
  assert.equal(validateCopilotFurySuccessorExecutionConfigurationV3(packetConfiguration, executionConfiguration, childSessionId), true);
  for (const mutation of [
    { ...executionConfiguration, model: "model:other" },
    { ...executionConfiguration, availableTools: ["read"] },
    { ...executionConfiguration, extra: true },
    { ...executionConfiguration, sessionId: randomUUID() },
  ]) {
    assert.equal(validateCopilotFurySuccessorExecutionConfigurationV3(packetConfiguration, mutation, childSessionId), false);
  }
});

test("structural client projection and persistence ancestry fail closed before claim", async () => {
  const malformed = await fixture();
  const harness = productionSdkHarness();
  const production = createCopilotFuryPlanExecutorV1({
    async loadSdk() { return harness.module; },
    async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
  });
  const identity = productionExecutionIdentity(malformed);
  const blocked = await production.preflight({
    repositoryRoot: malformed.root,
    requestedModel: malformed.request.requestedModel,
    requestedRuntime: malformed.request.requestedRuntime,
    requestedExecutor: malformed.request.requestedExecutor,
    executionIdentity: { ...identity, clientOptions: { ...identity.clientOptions, connection: {} } },
  });
  assert.equal(blocked.state, "blocked");
  assert.equal(harness.calls.construct, 0);

  for (const prepare of [
    async (current) => chmod(join(current.root, ".shield"), 0o777),
    async (current) => {
      const outside = await mkdtemp(join(tmpdir(), "shield-copilot-runtime-outside-"));
      await symlink(outside, join(current.root, ".shield", "runtime"));
    },
  ]) {
    const current = await fixture();
    await prepare(current);
    const fake = executor(current.plan);
    let claims = 0;
    const result = await dispatchCopilotFuryPlanReviewV1(current.request, {
      executor: fake.value,
      userCopilotHome: current.userCopilotHome,
      async claimDispatchPacket() { claims += 1; throw new Error("must not claim"); },
    });
    assert.equal(result.state, "invalid", JSON.stringify(result));
    assert.equal(fake.calls.preflight, 0);
    assert.equal(fake.calls.execute, 0);
    assert.equal(claims, 0);
  }
});

test("claim winner privately materializes deterministic persistence and replacement fails before start", async () => {
  const current = await fixture();
  const harness = productionSdkHarness({
    outputText: productionPassOutput(current),
    onConstruct(options) { chmodSync(options.baseDirectory, 0o777); },
  });
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, {
    executor: createCopilotFuryPlanExecutorV1({
      async loadSdk() { return harness.module; },
      async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
    }),
    userCopilotHome: current.userCopilotHome,
  });
  assert.equal(result.state, "failed", JSON.stringify(result));
  assert.equal(harness.calls.construct, 1);
  assert.equal(harness.calls.start, 0);
  assert.equal(harness.calls.listModels, 0);
  assert.equal(harness.calls.clientOptions.connection.kind, "stdio");
  assert.equal(harness.calls.clientOptions.workingDirectory, current.root);
  assert.ok(harness.calls.clientOptions.baseDirectory.startsWith(join(current.root, ".shield", "runtime", "copilot-fury") + "/"));
  assert.match(harness.calls.clientOptions.baseDirectory.split("/").at(-1), /^[A-Za-z0-9_-]{32}$/u);

  const denied = await fixture();
  const fake = executor(denied.plan);
  const claimDenied = await dispatchCopilotFuryPlanReviewV1(denied.request, {
    executor: fake.value,
    userCopilotHome: denied.userCopilotHome,
    async claimDispatchPacket() { return { state: "invalid", code: "claim_denied", errors: ["claim denied"] }; },
  });
  assert.equal(claimDenied.state, "invalid");
  await assert.rejects(lstat(join(denied.root, ".shield", "runtime")), { code: "ENOENT" });
});

test("production ordinary-replays a non-allowlisted same-signature failure while pure mechanics remain deterministic", async () => {
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID, "receipt:sVgAqsU53kRLIUKg4frtNEzHy9vOqU3c");
  const current = await fixture();
  const failedExecutor = {
    async preflight() { return { state: "ready", packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID }; },
    async execute() {
      return {
        state: "failed",
        code: "COPILOT_EXECUTION_FAILED",
        errors: ["CopilotClient was created with mode: 'empty' but neither 'baseDirectory' nor 'sessionFs' was set. Empty mode requires an explicit per-session persistence location; pick one."],
        observations: {},
      };
    },
  };
  const predecessor = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: failedExecutor, userCopilotHome: current.userCopilotHome });
  assert.equal(predecessor.state, "failed", JSON.stringify(predecessor));
  const ledgerPath = join(current.root, ".shield", "dispatch-receipts.jsonl");
  const predecessorLines = (await readFile(ledgerPath, "utf8")).trim().split("\n");
  const predecessorEvidence = JSON.parse(await readFile(join(current.root, predecessor.evidencePath), "utf8"));
  assert.equal(predecessorEvidence.contractVersion, "shield.copilot-fury-plan-dispatch.evidence.v1");
  assert.notEqual(predecessor.receiptId, COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID);
  const persistenceRoot = join(current.root, ".shield", "runtime", "copilot-fury");
  const persistenceBeforeReplay = await readdir(persistenceRoot);

  const nonAllowlistedExecutor = executor(current.plan);
  const ordinaryReplay = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: nonAllowlistedExecutor.value, userCopilotHome: current.userCopilotHome });
  assert.equal(ordinaryReplay.state, "failed", JSON.stringify(ordinaryReplay));
  assert.equal(ordinaryReplay.receiptId, predecessor.receiptId);
  assert.equal(ordinaryReplay.replayed, true);
  assert.equal(nonAllowlistedExecutor.calls.preflight, 0);
  assert.equal(nonAllowlistedExecutor.calls.execute, 0);
  assert.deepEqual(await readdir(persistenceRoot), persistenceBeforeReplay);
  assert.deepEqual((await readFile(ledgerPath, "utf8")).trim().split("\n"), predecessorLines);

  const ledger = await readSeatDispatchReceiptLedgerV1({ repositoryRoot: current.root, repositoryId: current.request.repositoryId, repositoryWorkspaceId: current.request.repositoryWorkspaceId });
  assert.equal(ledger.state, "valid", JSON.stringify(ledger));
  const receipt = ledger.value.projections.find((candidate) => candidate.receiptId === predecessor.receiptId);
  assert.ok(receipt);
  const expectation = recoveryClaimExpectation(receipt);
  assert.deepEqual(evaluateCopilotFuryRecoveryEligibilityV1(receipt, expectation, COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID), { state: "not_allowlisted" });
  const eligible = evaluateCopilotFuryRecoveryEligibilityV1(receipt, expectation, receipt.receiptId);
  const replayedMechanics = evaluateCopilotFuryRecoveryEligibilityV1(receipt, expectation, receipt.receiptId);
  assert.equal(eligible.state, "eligible", JSON.stringify(eligible));
  assert.deepEqual(replayedMechanics, eligible);
  assert.notEqual(eligible.successor.receiptId, receipt.receiptId);
  assert.notEqual(eligible.successor.childSessionId, receipt.childSessionId);
  assert.match(eligible.successor.packetId, /^packet:copilot-fury-recovery:/u);
  assert.deepEqual(await readdir(persistenceRoot), persistenceBeforeReplay);
  assert.deepEqual((await readFile(ledgerPath, "utf8")).trim().split("\n"), predecessorLines);
});

test("allowlisted recovery exact-checks the complete predecessor claim identity before successor derivation", async (t) => {
  const current = await fixture();
  const exactFailure = {
    async preflight() { return { state: "ready", packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID }; },
    async execute() {
      return { state: "failed", code: "COPILOT_EXECUTION_FAILED", errors: ["CopilotClient was created with mode: 'empty' but neither 'baseDirectory' nor 'sessionFs' was set. Empty mode requires an explicit per-session persistence location; pick one."], observations: {} };
    },
  };
  const predecessor = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: exactFailure, userCopilotHome: current.userCopilotHome });
  assert.equal(predecessor.state, "failed", JSON.stringify(predecessor));
  const ledger = await readSeatDispatchReceiptLedgerV1({ repositoryRoot: current.root, repositoryId: current.request.repositoryId, repositoryWorkspaceId: current.request.repositoryWorkspaceId });
  assert.equal(ledger.state, "valid", JSON.stringify(ledger));
  const projection = ledger.value.projections.find((candidate) => candidate.receiptId === predecessor.receiptId);
  assert.ok(projection);
  const expectation = recoveryClaimExpectation(projection);
  const mutations = {
    dispatchId: (value) => ({ ...value, dispatchId: `${value.dispatchId}:other` }),
    childTaskId: (value) => ({ ...value, childTaskId: `${value.childTaskId}:other` }),
    childSessionId: (value) => ({ ...value, childSessionId: `${value.childSessionId}:other` }),
    artifactId: (value) => ({ ...value, artifactId: `${value.artifactId}:other` }),
    artifactRevision: (value) => ({ ...value, artifactRevision: "sha256:otherRevision" }),
    configuredRuntime: (value) => ({ ...value, configuredRuntime: { ...value.configuredRuntime, model: "model:other" } }),
    requestedRuntime: (value) => ({ ...value, requestedRuntime: { ...value.requestedRuntime, model: "model:other" } }),
    toolExecution: (value) => ({ ...value, toolExecution: { ...value.toolExecution, executorBindingRef: "other-executor" } }),
    startedAt: (value) => ({ ...value, startedAt: "2026-08-18T12:01:00.001Z" }),
    inputEvidenceRefs: (value) => ({ ...value, inputEvidenceRefs: [...value.inputEvidenceRefs].reverse() }),
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    await t.test(name, async () => {
      const result = evaluateCopilotFuryRecoveryEligibilityV1(mutate(projection), expectation, predecessor.receiptId);
      assert.deepEqual(result, { state: "invalid", code: "RECOVERABLE_PREDECESSOR_CLAIM_MISMATCH" });
    });
  }
});

test("ordinary replay rejects malformed predecessor evidence and stale packets without recovery effects", async () => {
  const exactFailure = {
    async preflight() { return { state: "ready", packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID }; },
    async execute() {
      return { state: "failed", code: "COPILOT_EXECUTION_FAILED", errors: ["CopilotClient was created with mode: 'empty' but neither 'baseDirectory' nor 'sessionFs' was set. Empty mode requires an explicit per-session persistence location; pick one."], observations: {} };
    },
  };

  const malformed = await fixture();
  const predecessor = await dispatchCopilotFuryPlanReviewV1(malformed.request, { executor: exactFailure, userCopilotHome: malformed.userCopilotHome });
  assert.equal(predecessor.state, "failed", JSON.stringify(predecessor));
  await writeFile(join(malformed.root, predecessor.evidencePath), "{}\n");
  const malformedExecutor = executor(malformed.plan);
  const malformedRetry = await dispatchCopilotFuryPlanReviewV1(malformed.request, { executor: malformedExecutor.value, userCopilotHome: malformed.userCopilotHome });
  assert.equal(malformedRetry.state, "invalid", JSON.stringify(malformedRetry));
  assert.equal(malformedExecutor.calls.execute, 0);

  const stale = await fixture();
  const stalePredecessor = await dispatchCopilotFuryPlanReviewV1(stale.request, { executor: exactFailure, userCopilotHome: stale.userCopilotHome });
  assert.equal(stalePredecessor.state, "failed", JSON.stringify(stalePredecessor));
  const staleExecutor = executor(stale.plan);
  const staleRetry = await dispatchCopilotFuryPlanReviewV1({ ...stale.request, timestamp: { value: "2026-08-18T12:02:00.000Z", provenance: "hostTrusted" } }, { executor: staleExecutor.value, userCopilotHome: stale.userCopilotHome });
  assert.equal(staleRetry.state, "invalid", JSON.stringify(staleRetry));
  assert.equal(staleRetry.code, "packet_claim_conflict");
  assert.equal(staleExecutor.calls.execute, 0);

});

test("fresh completed execution requires the versioned observation bound to the exact artifact map", async () => {
  for (const mutation of [
    (observations) => { const { executionObservation: _executionObservation, ...rest } = observations; return rest; },
    (observations) => ({ ...observations, executionObservation: { ...observations.executionObservation, artifactMapDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" } }),
  ]) {
    const current = await fixture();
    const base = executor(current.plan);
    const invalidExecutor = {
      ...base.value,
      async execute(input) {
        const completed = await base.value.execute(input);
        return { ...completed, observations: mutation(completed.observations) };
      },
    };
    const first = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: invalidExecutor, userCopilotHome: current.userCopilotHome });
    assert.equal(first.state, "failed", JSON.stringify(first));
    assert.equal(first.code, "DISPATCH_FAILED");
    assert.match(first.errors.join(" "), /executor_observation_mismatch/u);
    const retryExecutor = executor(current.plan);
    const replay = await dispatchCopilotFuryPlanReviewV1(current.request, { executor: retryExecutor.value, userCopilotHome: current.userCopilotHome });
    assert.equal(replay.state, "failed", JSON.stringify(replay));
    assert.equal(replay.replayed, true);
    assert.equal(retryExecutor.calls.preflight, 0);
    assert.equal(retryExecutor.calls.execute, 0);
  }
});

test("review artifact map enforces role cardinality, source identity, collision, dedup, and shadow rules", async () => {
  const current = await fixture();
  const transitionBytes = await readFile(join(current.root, current.request.transitionPlanPath), "utf8");
  const source = { kind: "committed_file", file: { path: join(current.root, current.request.transitionPlanPath), bytes: transitionBytes, identity: "test-source", rawSha256: sha256(transitionBytes) } };
  const map = await buildCopilotFuryReviewArtifactMapV1(current.request, source, current.plan);
  validateCopilotFuryReviewArtifactMapV1(map);
  const transitionEntry = map.entries.find((entry) => entry.roles.includes("transition_plan"));
  const parentEntry = map.entries.find((entry) => entry.roles.includes("parent_plan"));
  assert.ok(transitionEntry);
  assert.ok(parentEntry);
  assert.equal(map.entries.filter((entry) => entry.roles.includes("transition_plan")).length, 1);
  assert.equal(map.entries.filter((entry) => entry.roles.includes("parent_plan")).length, 1);
  assert.ok(transitionEntry.sourceIdentities.some((identity) => identity.startsWith("head:")));
  assert.ok(transitionEntry.sourceIdentities.some((identity) => identity.startsWith("head-shadowed:")));
  assert.ok(parentEntry.sourceIdentities.some((identity) => identity.startsWith("git:")));

  const withoutTransition = { ...map, entries: map.entries.map((entry) => entry === transitionEntry ? { ...entry, roles: entry.roles.filter((role) => role !== "transition_plan") } : entry) };
  assert.throws(() => validateCopilotFuryReviewArtifactMapV1(withoutTransition), /review_artifact_map_(?:source_identity|role_cardinality)_invalid/u);
  const duplicateTransition = { ...map, entries: map.entries.map((entry) => entry.roles.length === 0 ? { ...entry, roles: ["transition_plan"] } : entry) };
  assert.throws(() => validateCopilotFuryReviewArtifactMapV1(duplicateTransition), /review_artifact_map_(?:source_identity|role_cardinality)_invalid/u);
  const wrongParentIdentity = { ...map, entries: map.entries.map((entry) => entry === parentEntry ? { ...entry, sourceIdentities: ["head:wrong-parent-source"] } : entry) };
  assert.throws(() => validateCopilotFuryReviewArtifactMapV1(wrongParentIdentity), /review_artifact_map_source_identity_invalid/u);

  const equalPlan = { ...current.plan, parentPlanCommit: current.request.headRevision, parentPlanPath: current.request.transitionPlanPath, parentPlanRawSha256: sha256(transitionBytes) };
  const deduped = await buildCopilotFuryReviewArtifactMapV1(current.request, source, equalPlan);
  const shared = deduped.entries.find((entry) => entry.path === current.request.transitionPlanPath);
  assert.deepEqual(shared.roles, ["parent_plan", "transition_plan"]);
  assert.equal(deduped.entries.filter((entry) => entry.roles.length > 0).length, 1);

  const conflictingBytes = "{\"virtual\":true}\n";
  const conflictingRequest = { ...current.request, transitionPlanRawSha256: sha256(conflictingBytes) };
  const conflictingSource = { kind: "legacy_derived", canonicalPlanBytes: conflictingBytes, transitionPlanRawSha256: sha256(conflictingBytes), virtualPath: current.request.transitionPlanPath, provenanceDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" };
  await assert.rejects(buildCopilotFuryReviewArtifactMapV1(conflictingRequest, conflictingSource, equalPlan), /review_artifact_path_collision/u);
});

test("production fallback omits binary blobs while dispatch succeeds and binary tools are denied", async () => {
  const current = await fixture();
  const binaryPath = "assets/font.woff2";
  await mkdir(join(current.root, "assets"), { recursive: true });
  await writeFile(join(current.root, binaryPath), Buffer.from([0x00, 0xff, 0x10, 0x80, 0x01, 0xfe]));
  git(current.root, ["add", binaryPath]);
  git(current.root, ["commit", "-qm", "add binary fallback fixture"]);
  current.request = { ...current.request, headRevision: git(current.root, ["rev-parse", "HEAD"]) };

  const transitionBytes = await readFile(join(current.root, current.request.transitionPlanPath), "utf8");
  const map = await buildCopilotFuryReviewArtifactMapV1(current.request, {
    kind: "committed_file",
    file: { path: join(current.root, current.request.transitionPlanPath), bytes: transitionBytes, identity: "test-source", rawSha256: sha256(transitionBytes) },
  }, current.plan);
  validateCopilotFuryReviewArtifactMapV1(map);
  assert.equal(map.entries.some((entry) => entry.path === binaryPath), false);

  const successHarness = productionSdkHarness({ preToolUseCalls: [
    { toolName: "read", toolArgs: { path: "package.json" } },
    { toolName: "search", toolArgs: { query: "private" } },
  ] });
  const success = await runProductionExecutor(current, successHarness);
  assert.equal(success.state, "completed", JSON.stringify(success));
  assert.deepEqual(successHarness.calls.toolResults.map(({ name }) => name), ["read", "search"]);

  for (const toolCall of [
    { toolName: "read", toolArgs: { path: binaryPath } },
    { toolName: "search", toolArgs: { query: "font", path: binaryPath } },
  ]) {
    const denied = await runProductionExecutor(current, productionSdkHarness({ preToolUseCalls: [toolCall] }));
    assert.equal(denied.state, "failed", `${JSON.stringify(toolCall)}: ${JSON.stringify(denied)}`);
    assert.equal(denied.observations.unauthorizedToolOrEffectObserved, true);
  }
});

test("binary fallback omissions do not consume the artifact entry limit", async () => {
  const current = await fixture();
  const binaryDirectory = join(current.root, "binary-fallbacks");
  await mkdir(binaryDirectory, { recursive: true });
  for (let index = 0; index < 4095; index += 1) {
    await writeFile(join(binaryDirectory, `${String(index).padStart(4, "0")}.bin`), Buffer.from([0xff, index & 0xff]));
  }
  git(current.root, ["add", "binary-fallbacks"]);
  git(current.root, ["commit", "-qm", "add high-cardinality binary fallbacks"]);
  current.request = { ...current.request, headRevision: git(current.root, ["rev-parse", "HEAD"]) };

  const transitionBytes = await readFile(join(current.root, current.request.transitionPlanPath), "utf8");
  const map = await buildCopilotFuryReviewArtifactMapV1(current.request, {
    kind: "committed_file",
    file: { path: join(current.root, current.request.transitionPlanPath), bytes: transitionBytes, identity: "test-source", rawSha256: sha256(transitionBytes) },
  }, current.plan);
  validateCopilotFuryReviewArtifactMapV1(map);
  assert.equal(map.entries.some((entry) => entry.path.startsWith("binary-fallbacks/")), false);
  assert.ok(map.entries.length < 4096);
});

test("production executor binds loaded SDK and producer identity and confines permissions", async () => {
  const current = await fixture();
  const harness = productionSdkHarness({ preToolUseCalls: [
    { toolName: "read", toolArgs: { path: "package.json" } },
    { toolName: "search", toolArgs: { query: "private" } },
  ] });
  const result = await runProductionExecutor(current, harness);
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(result.observations.loadedSdkPackageVersion, COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION);
  assert.equal(result.observations.sessionProducer, COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID);
  assert.equal(result.observations.sessionProducerVersion, "1.0.79");
  assert.equal(harness.calls.clientOptions.mode, "empty");
  assert.deepEqual(harness.calls.clientOptions.connection, { kind: "stdio", path: undefined, args: undefined, env: undefined });
  assert.notEqual(harness.calls.clientOptions.connection, harness.connection);
  assert.equal(Object.isFrozen(harness.calls.clientOptions.connection), true);
  assert.deepEqual(harness.calls.sessionConfig.availableTools, ["custom:read", "custom:search"]);
  assert.deepEqual(harness.calls.sessionConfig.excludedTools, ["builtin:*", "mcp:*", "write", "edit", "apply_patch", "bash", "shell", "execute", "web", "custom:write", "custom:edit", "custom:apply_patch", "custom:bash", "custom:shell", "custom:execute", "custom:web"]);
  assert.deepEqual(harness.calls.sessionConfig.customAgents[0].tools, ["read", "search"]);
  assert.deepEqual(harness.calls.sessionConfig.tools.map((tool) => tool.name), ["read", "search"]);
  assert.ok(harness.calls.sessionConfig.tools.every((tool) => tool.overridesBuiltInTool === true && tool.skipPermission === true && tool.defer === "never"));
  assert.deepEqual(harness.calls.sessionConfig.mcpServers, {});
  assert.equal(harness.calls.sessionConfig.enableConfigDiscovery, false);
  assert.equal(harness.calls.sessionConfig.enableFileHooks, false);
  assert.equal(harness.calls.sessionConfig.enableHostGitOperations, false);
  assert.equal(harness.calls.initializeAndValidate, 1);
  assert.equal(harness.calls.getCurrentMetadata, 1);
  assert.deepEqual(harness.calls.toolResults.map(({ name }) => name), ["read", "search"]);
  assert.deepEqual(harness.calls.toolResults.map(({ name, invocation }) => ({ name, invocation })), [
    { name: "read", invocation: { sessionId: harness.calls.sessionConfig.sessionId, toolCallId: "tool-call-1", toolName: "read", arguments: { path: "package.json" } } },
    { name: "search", invocation: { sessionId: harness.calls.sessionConfig.sessionId, toolCallId: "tool-call-2", toolName: "search", arguments: { query: "private" } } },
  ]);
  assert.deepEqual(result.observations.callbackObservation.records.map(({ surface, tool, decision, expectedSessionMatch }) => ({ surface, tool, decision, expectedSessionMatch })), [
    { surface: "pre_tool", tool: "read", decision: "allow", expectedSessionMatch: "match" },
    { surface: "handler", tool: "read", decision: "invoked", expectedSessionMatch: "match" },
    { surface: "pre_tool", tool: "search", decision: "allow", expectedSessionMatch: "match" },
    { surface: "handler", tool: "search", decision: "invoked", expectedSessionMatch: "match" },
  ]);
  assert.deepEqual(result.observations.callbackObservation.records.map(({ callbackIdentity }) => callbackIdentity), [
    { sessionId: "present", toolCallId: "absent" },
    { sessionId: "present", toolCallId: "present" },
    { sessionId: "present", toolCallId: "absent" },
    { sessionId: "present", toolCallId: "present" },
  ]);
  assert.equal(result.observations.callbackObservation.truncated, false);
  assert.equal(result.observations.callbackObservation.totalCount, 4);
  assert.equal(JSON.parse(harness.calls.toolResults[0].result).content, "{\"private\":true}\n");
  assert.deepEqual(JSON.parse(harness.calls.toolResults[1].result).matches.map(({ path }) => path), ["package.json"]);
  const exactPath = join(current.root, "package.json");
  const readTool = harness.calls.sessionConfig.tools.find((tool) => tool.name === "read");
  const searchTool = harness.calls.sessionConfig.tools.find((tool) => tool.name === "search");
  const invokeTool = async (tool, args, toolCallId) => {
    const invocation = { sessionId: harness.calls.sessionConfig.sessionId, toolCallId, toolName: tool.name, arguments: args };
    const admission = await harness.calls.sessionConfig.hooks.onPreToolUse({ sessionId: harness.calls.sessionConfig.sessionId, toolName: tool.name, toolArgs: args }, { sessionId: harness.calls.sessionConfig.sessionId });
    assert.equal(admission.permissionDecision, "allow");
    const admittedArgs = admission.modifiedArgs ?? args;
    return tool.handler(admittedArgs, { ...invocation, arguments: admittedArgs });
  };
  await invokeTool(readTool, { path: exactPath }, "direct-read-precheck");
  await invokeTool(searchTool, { query: "Fury" }, "direct-search-precheck");
  await writeFile(exactPath, "{\"private\":false,\"replacement\":\"one\"}\n");
  git(current.root, ["add", "package.json"]);
  git(current.root, ["commit", "-qm", "replacement object one"]);
  const replacementOne = git(current.root, ["rev-parse", "HEAD"]);
  git(current.root, ["replace", current.request.headRevision, replacementOne]);
  await writeFile(exactPath, "{\"private\":false,\"replacement\":\"two\"}\n");
  git(current.root, ["add", "package.json"]);
  git(current.root, ["commit", "-qm", "replacement object two"]);
  const replacementTwo = git(current.root, ["rev-parse", "HEAD"]);
  git(current.root, ["replace", "-f", current.request.headRevision, replacementTwo]);
  const immutableRead = JSON.parse(await invokeTool(harness.calls.sessionConfig.tools.find((tool) => tool.name === "read"), { path: exactPath }, "direct-read-1"));
  assert.equal(immutableRead.repositoryRevision, current.request.headRevision);
  assert.equal(immutableRead.path, "package.json");
  assert.equal(immutableRead.content, "{\"private\":true}\n");
  const virtualTransition = JSON.parse(await invokeTool(readTool, { path: current.request.transitionPlanPath }, "direct-read-2"));
  assert.equal(virtualTransition.content, await readFile(join(current.root, current.request.transitionPlanPath), "utf8"));
  const pinnedParent = JSON.parse(await invokeTool(readTool, { path: "docs/missions/issue-319-plan.md" }, "direct-read-3"));
  assert.equal(pinnedParent.content, await readFile(join(current.root, "docs/missions/issue-319-plan.md"), "utf8"));
  const deterministicSearch = JSON.parse(await invokeTool(searchTool, { query: "Parent", path: "docs" }, "direct-search-1"));
  assert.deepEqual(deterministicSearch.matches.map(({ path, line }) => ({ path, line })), [{ path: "docs/missions/issue-319-plan.md", line: 1 }]);
  for (const query of ["replacement object one", '"replacement":"one"', '"replacement":"two"']) {
    const immutableSearch = JSON.parse(await invokeTool(searchTool, { query }, `direct-search-${query}`));
    assert.deepEqual(immutableSearch.matches, []);
  }
  const aliasPath = join(current.root, "package-alias.json");
  await symlink(exactPath, aliasPath);
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "read", path: exactPath, intention: "review" })).kind, "reject");
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "read", path: exactPath, intention: "review", managedApprovalRequired: true })).kind, "reject");
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "read", path: exactPath, intention: "review", requestSandboxBypass: true })).kind, "reject");
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "write", fileName: exactPath, diff: "", intention: "mutate", canOfferSessionApproval: false })).kind, "reject");
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "read", path: "./package.json", intention: "alias" })).kind, "reject");
  assert.equal((await harness.calls.sessionConfig.hooks.onPreToolUse({ sessionId: harness.calls.sessionConfig.sessionId, toolName: "write", toolArgs: { path: exactPath } }, { sessionId: harness.calls.sessionConfig.sessionId })).permissionDecision, "deny");
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "read", path: aliasPath, intention: "alias" })).kind, "reject");
  assert.equal(harness.calls.disconnect, 1);
  assert.equal(harness.calls.stop, 1);
});

test("production admission decodes live JSON text and preserves exact object compatibility", async () => {
  const current = await fixture();
  for (const [label, calls] of [
    ["json-text", [
      { toolName: "read", toolArgs: JSON.stringify({ path: "package.json" }) },
      { toolName: "search", toolArgs: JSON.stringify({ query: "private", path: "package.json" }) },
    ]],
    ["object", [
      { toolName: "read", toolArgs: { path: "package.json" } },
      { toolName: "search", toolArgs: { query: "private" } },
    ]],
    ["canonical-root-search", [
      { toolName: "read", toolArgs: { path: "package.json" } },
      { toolName: "search", toolArgs: { query: "private", path: current.root } },
    ]],
  ]) {
    const harness = productionSdkHarness({ preToolUseCalls: calls });
    const result = await runProductionExecutor(current, harness);
    assert.equal(result.state, "completed", `${label}: ${JSON.stringify(result)}`);
    assert.deepEqual(harness.calls.toolResults.map(({ invocation }) => invocation.arguments), [
      { path: "package.json" },
      label === "json-text" ? { query: "private", path: "package.json" } : { query: "private" },
    ]);
    assert.equal(JSON.parse(harness.calls.toolResults[0].result).path, "package.json");
    assert.deepEqual(JSON.parse(harness.calls.toolResults[1].result).matches.map(({ path }) => path), ["package.json"]);
  }
});

test("production admission rejects hostile JSON, byte, depth, path, key, and namespace inputs before effects", async () => {
  const current = await fixture();
  const exactBytes = (target) => {
    const base = JSON.stringify({ path: "package.json" });
    return `${base}${" ".repeat(target - Buffer.byteLength(base, "utf8"))}`;
  };
  for (const size of [8191, 8192]) {
    const harness = productionSdkHarness({ preToolUseCalls: [{ toolName: "read", toolArgs: exactBytes(size) }] });
    const result = await runProductionExecutor(current, harness);
    assert.equal(result.state, "completed", `${size}: ${JSON.stringify(result)}`);
    assert.equal(harness.calls.toolResults.length, 1);
  }
  const oversizedAscii = exactBytes(8193);
  const oversizedMultibyte = JSON.stringify({ path: "package.json", padding: "é".repeat(4090) });
  assert.equal(Buffer.byteLength(oversizedAscii, "utf8"), 8193);
  assert.ok(Buffer.byteLength(oversizedMultibyte, "utf8") > 8192);
  const hostile = [
    ["malformed", "{"],
    ["duplicate", '{"path":"package.json","path":"package.json"}'],
    ["trailing", '{"path":"package.json"}x'],
    ["scalar", '"package.json"'],
    ["array", '[{"path":"package.json"}]'],
    ["null", "null"],
    ["oversized-ascii", oversizedAscii],
    ["oversized-multibyte", oversizedMultibyte],
    ["depth-two-container", '{"path":"package.json","extra":{"leaf":"x"}}'],
    ["depth-three-container", '{"path":"package.json","extra":{"nested":{"leaf":"x"}}}'],
    ["extra-key", { path: "package.json", extra: true }],
    ["missing-key", {}],
    ["wrong-key", { query: "private" }],
    ["traversal", { path: "../package.json" }],
    ["git-path", { path: ".git/config" }],
    ["non-map", { path: "not-in-map.txt" }],
  ];
  for (const [label, toolArgs] of hostile) {
    const harness = productionSdkHarness({ preToolUseCalls: [{ toolName: "read", toolArgs }] });
    const result = await runProductionExecutor(current, harness);
    assert.equal(result.state, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.observations.unauthorizedToolOrEffectObserved, true, label);
    assert.deepEqual(harness.calls.toolResults, [], label);
  }
  for (const [label, toolName] of [["unknown", "unknown"], ["namespace", "custom:read"], ["mcp-namespace", "mcp:read"]]) {
    const harness = productionSdkHarness({ preToolUseCalls: [{ toolName, toolArgs: { path: "package.json" } }] });
    const result = await runProductionExecutor(current, harness);
    assert.equal(result.state, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.deepEqual(harness.calls.toolResults, [], label);
  }
  for (const [label, toolArgs] of [
    ["empty-query", { query: "" }],
    ["long-query", { query: "x".repeat(1025) }],
    ["search-extra", { query: "private", extra: true }],
    ["search-traversal", { query: "private", path: "../" }],
    ["search-root-dot-alias", { query: "private", path: `${current.root}/.` }],
    ["search-root-parent-alias", { query: "private", path: `${current.root}/sub/..` }],
  ]) {
    const harness = productionSdkHarness({ preToolUseCalls: [{ toolName: "search", toolArgs }] });
    const result = await runProductionExecutor(current, harness);
    assert.equal(result.state, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.deepEqual(harness.calls.toolResults, [], label);
  }
});

test("production ranged reads are paired, bounded, LF-deterministic, redacted, and replay-safe", async () => {
  const current = await fixture();
  const rangedPath = "ranged-read-fixture.txt";
  await writeFile(join(current.root, rangedPath), "alpha\nbeta\ngamma\n", "utf8");
  git(current.root, ["add", rangedPath]);
  git(current.root, ["commit", "-qm", "add ranged read fixture"]);
  current.request = { ...current.request, headRevision: git(current.root, ["rev-parse", "HEAD"]) };
  const harness = productionSdkHarness({
    preToolUseCalls: [
      { toolName: "read", toolArgs: { path: rangedPath } },
      { toolName: "read", toolArgs: { path: rangedPath, line_start: 1, line_end: 2 } },
    ],
    outputText: productionPassOutput(current),
  });
  const result = await runProductionExecutor(current, harness);
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.deepEqual(harness.calls.sessionConfig.tools.find(({ name }) => name === "read").parameters.properties.line_start, { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: "Optional 1-based inclusive start line; must be paired with line_end." });
  assert.equal(JSON.parse(harness.calls.toolResults[0].result).content, "alpha\nbeta\ngamma\n");
  assert.deepEqual(JSON.parse(harness.calls.toolResults[1].result), { repositoryRevision: current.request.headRevision, path: rangedPath, line_start: 1, line_end: 2, content: "alpha\nbeta\n" });

  for (const toolArgs of [
    { path: rangedPath, line_start: 1 },
    { path: rangedPath, line_end: 2 },
    { path: rangedPath, line_start: 2, line_end: 1 },
    { path: rangedPath, line_start: 1, line_end: 401 },
    { path: rangedPath, line_start: 1, line_end: 4 },
    { path: rangedPath, line_start: 1, line_end: 2, secret: "do-not-retain" },
  ]) {
    const denied = await runProductionExecutor(current, productionSdkHarness({ preToolUseCalls: [{ toolName: "read", toolArgs }] }));
    assert.equal(denied.state, "failed", JSON.stringify(denied));
    assert.equal(denied.code, "FURY_TOOL_ADMISSION_DENIED");
    assert.deepEqual(denied.errors, ["Fury tool admission denied; create a fresh corrected successor."]);
    assert.equal(denied.admissionFailure.schemaVersion, 1);
    assert.equal(denied.admissionFailure.reason, "admission_argument_shape_denied");
    assert.equal(denied.admissionFailure.ordinal, 1);
    assert.equal(denied.admissionFailure.tool, "read");
    assert.equal(denied.admissionFailure.recovery, "fresh_corrected_successor_required");
    assert.equal(JSON.stringify(denied).includes("do-not-retain"), false);
    assert.equal(JSON.stringify(denied).includes(rangedPath), false);
  }

  const resolved = await resolveCommittedTransitionPlanSourceV1(current.request);
  assert.equal(resolved.state, "valid", JSON.stringify(resolved));
  const firstHarness = productionSdkHarness({ preToolUseCalls: [{ toolName: "read", toolArgs: { path: rangedPath, line_start: 1 } }] });
  const first = await dispatchCopilotFuryPlanReviewCoreV1(current.request, resolved.source, {
    executor: createCopilotFuryPlanExecutorV1({ async loadSdk() { return firstHarness.module; }, async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; } }),
  });
  assert.equal(first.state, "failed", JSON.stringify(first));
  assert.equal(first.code, "FURY_TOOL_ADMISSION_DENIED");
  assert.deepEqual(first.admissionFailure, { schemaVersion: 1, reason: "admission_argument_shape_denied", ordinal: 1, tool: "read", argumentShape: { kind: "object", keys: ["path", "unknown"], entries: [{ kind: "string" }, { kind: "number" }] }, recovery: "fresh_corrected_successor_required" });
  const secondHarness = productionSdkHarness({ outputText: productionPassOutput(current) });
  const replay = await dispatchCopilotFuryPlanReviewCoreV1(current.request, resolved.source, {
    executor: createCopilotFuryPlanExecutorV1({ async loadSdk() { return secondHarness.module; }, async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; } }),
  });
  assert.equal(replay.replayed, true, JSON.stringify(replay));
  assert.deepEqual(replay.admissionFailure, first.admissionFailure);
  assert.equal(secondHarness.calls.createSession, 0);
});

test("production admission callback diagnostics classify bounded denial branches without sensitive values", async () => {
  const cases = [
    ["callback-session", { toolName: "read", toolArgs: { path: "package.json" }, sessionId: "wrong-session" }, "admission_session_denied", { callbackSessionMatch: false, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: false }],
    ["invocation-session", { toolName: "read", toolArgs: { path: "package.json" }, invocation: { sessionId: "wrong-session", toolCallId: "wrong-call" } }, "exact_tool_allowed", { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: true }],
    ["non-allowlisted-tool", { toolName: "write", toolArgs: { path: "package.json" } }, "admission_tool_denied", { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: false }],
    ["decode", { toolName: "read", toolArgs: "{" }, "admission_argument_decode_denied", { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: true }],
    ["shape", { toolName: "read", toolArgs: { path: "package.json", extra: true } }, "admission_argument_shape_denied", { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: true }],
    ["read-path", { toolName: "read", toolArgs: { path: "../package.json" } }, "admission_read_path_denied", { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: true }],
    ["read-target", { toolName: "read", toolArgs: { path: "missing.txt" } }, "admission_read_target_denied", { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: true }],
    ["search-query", { toolName: "search", toolArgs: { query: "" } }, "admission_search_query_denied", { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: true }],
    ["search-path", { toolName: "search", toolArgs: { query: "private", path: 7 } }, "admission_search_path_denied", { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: true }],
    ["search-scope", { toolName: "search", toolArgs: { query: "private", path: "missing.txt" } }, "admission_search_scope_denied", { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 0, duplicate: false, validationAttempted: true }],
  ];
  for (const [label, toolCall, reason, admission] of cases) {
    const current = await fixture();
    const result = await runProductionExecutor(current, productionSdkHarness({ preToolUseCalls: [toolCall] }));
    assert.equal(result.state, "failed", `${label}: ${JSON.stringify(result)}`);
    const record = result.observations.callbackObservation.records.find(({ surface }) => surface === "pre_tool");
    assert.equal(record.reason, reason, label);
    assert.deepEqual(record.admission, admission, label);
    assert.equal(JSON.stringify(record).includes("missing.txt"), false, label);
  }

  const stickyCurrent = await fixture();
  const sticky = await runProductionExecutor(stickyCurrent, productionSdkHarness({
    preToolUseCalls: [
      { toolName: "read", toolArgs: { path: "../package.json" } },
      { toolName: "read", toolArgs: { path: "package.json" } },
    ],
  }));
  const stickyRecords = sticky.observations.callbackObservation.records.filter(({ surface }) => surface === "pre_tool");
  assert.equal(stickyRecords.at(-1).reason, "admission_sticky_denied");
  assert.deepEqual(stickyRecords.at(-1).admission, { callbackSessionMatch: true, invocationSessionMatch: true, latched: true, pendingAdmissionCount: 0, duplicate: false, validationAttempted: true });

  const duplicateCurrent = await fixture();
  const duplicate = await runProductionExecutor(duplicateCurrent, productionSdkHarness({
    preToolUseCalls: [{ toolName: "read", toolArgs: JSON.stringify({ path: "package.json" }), duplicatePreHook: true }],
    outputText: productionPassOutput(duplicateCurrent),
  }));
  const duplicateRecords = duplicate.observations.callbackObservation.records.filter(({ surface }) => surface === "pre_tool");
  assert.equal(duplicate.state, "completed", JSON.stringify(duplicate));
  assert.equal(duplicateRecords.at(-1).reason, "exact_tool_allowed");
  assert.deepEqual(duplicateRecords.at(-1).admission, { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 1, duplicate: true, validationAttempted: true });

  const capacityCurrent = await fixture();
  const capacity = await runProductionExecutor(capacityCurrent, productionSdkHarness({
    batchPreToolUse: true,
    preToolUseCalls: Array.from({ length: 17 }, (_, index) => ({ toolName: "search", toolArgs: { query: `private-${index}`, path: "package.json" } })),
  }));
  const capacityRecord = capacity.observations.callbackObservation.records.filter(({ surface }) => surface === "pre_tool").at(-1);
  assert.equal(capacityRecord.reason, "admission_capacity_exceeded");
  assert.deepEqual(capacityRecord.admission, { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 16, duplicate: false, validationAttempted: true });
});

test("production callback-8 evidence distinguishes argument decoding from later sticky handler denial", async () => {
  const current = await fixture();
  const result = await runProductionExecutor(current, productionSdkHarness({
    batchPreToolUse: true,
    preToolUseCalls: [
      ...Array.from({ length: 4 }, () => ({ toolName: "read", toolArgs: JSON.stringify({ path: "package.json" }) })),
      ...Array.from({ length: 3 }, () => ({ toolName: "search", toolArgs: JSON.stringify({ query: "private", path: "package.json" }) })),
      { toolName: "search", toolArgs: "{" },
    ],
  }));
  assert.equal(result.state, "failed", JSON.stringify(result));
  const records = result.observations.callbackObservation.records;
  const eighth = records.filter(({ surface }) => surface === "pre_tool")[7];
  assert.equal(eighth.reason, "admission_argument_decode_denied");
  assert.deepEqual(eighth.admission, { callbackSessionMatch: true, invocationSessionMatch: true, latched: false, pendingAdmissionCount: 2, duplicate: false, validationAttempted: true });
  assert.equal(eighth.argumentShape.kind, "string");
  assert.equal(records.find(({ surface, reason }) => surface === "handler" && reason === "pre_tool_denied").reason, "pre_tool_denied");
  assert.equal(JSON.stringify(eighth).includes("toolArgs"), false);
});

test("production pending admission is single-use, session-bound, and consumed only by an exact handler call", async () => {
  const current = await fixture();
  const cases = [
    ["hook-bypass", { directToolCalls: [{ toolName: "read", toolArgs: { path: "package.json" } }] }],
    ["stale-pending", { preToolUseCalls: [{ toolName: "read", toolArgs: { path: "package.json" }, skipHandler: true }] }],
    ["duplicate-handler", { preToolUseCalls: [{ toolName: "read", toolArgs: { path: "package.json" }, duplicateHandler: true }] }],
    ["concurrent-pending", { preToolUseCalls: [{ toolName: "read", toolArgs: { path: "package.json" }, beforeHandlerCalls: [{ toolName: "search", toolArgs: { query: "private" } }] }] }],
    ["changed-valid-args", { preToolUseCalls: [{ toolName: "read", toolArgs: { path: "package.json" }, handlerArgs: { path: current.request.transitionPlanPath } }] }],
    ["wrong-handler-session", { preToolUseCalls: [{ toolName: "read", toolArgs: { path: "package.json" }, invocation: { sessionId: "wrong-session", toolCallId: "wrong-session-call", toolName: "read", arguments: { path: "package.json" } } }] }],
  ];
  for (const [label, options] of cases) {
    const harness = productionSdkHarness(options);
    const result = await runProductionExecutor(current, harness);
    assert.equal(result.state, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.observations.unauthorizedToolOrEffectObserved, true, label);
  }
});

test("production pending admissions tolerate duplicate SDK hooks and bounded distinct batches", async () => {
  const current = await fixture();
  const duplicateHarness = productionSdkHarness({
    preToolUseCalls: [{ toolName: "read", toolArgs: JSON.stringify({ path: "package.json" }), duplicatePreHook: true }],
    outputText: productionPassOutput(current),
  });
  const duplicate = await runProductionExecutor(current, duplicateHarness);
  assert.equal(duplicate.state, "completed", JSON.stringify(duplicate));
  assert.equal(duplicateHarness.calls.toolResults.length, 1);

  const batchHarness = productionSdkHarness({
    batchPreToolUse: true,
    preToolUseCalls: [
      { toolName: "read", toolArgs: JSON.stringify({ path: "package.json" }), duplicatePreHook: true },
      { toolName: "search", toolArgs: JSON.stringify({ query: "private", path: "package.json" }), duplicatePreHook: true },
    ],
    outputText: productionPassOutput(current),
  });
  const batch = await runProductionExecutor(current, batchHarness);
  assert.equal(batch.state, "completed", JSON.stringify(batch));
  assert.equal(batchHarness.calls.toolResults.length, 2);

  const overflowHarness = productionSdkHarness({
    batchPreToolUse: true,
    preToolUseCalls: [
      ...Array.from({ length: 17 }, (_, index) => ({ toolName: "search", toolArgs: JSON.stringify({ query: `private-${index}`, path: "package.json" }) })),
      { toolName: "read", toolArgs: JSON.stringify({ path: "package.json" }) },
    ],
  });
  const overflow = await runProductionExecutor(current, overflowHarness);
  assert.equal(overflow.state, "failed", JSON.stringify(overflow));
  assert.equal(overflow.observations.unauthorizedToolOrEffectObserved, true);
  assert.deepEqual(overflowHarness.calls.toolResults.map(({ name }) => name), Array.from({ length: 16 }, () => "search"));
  assert.deepEqual(overflow.observations.callbackObservation.records.filter(({ surface }) => surface === "pre_tool").slice(-2).map(({ tool, decision }) => ({ tool, decision })), [
    { tool: "read", decision: "deny" },
    { tool: "search", decision: "deny" },
  ]);

  const recoveryHarness = productionSdkHarness({
    preToolUseCalls: [
      {
        toolName: "read",
        toolArgs: { path: "package.json" },
        beforeHandlerCalls: Array.from({ length: 16 }, (_, index) => ({ toolName: "search", toolArgs: { query: `private-${index}`, path: "package.json" } })),
      },
      ...Array.from({ length: 15 }, (_, index) => ({ toolName: "search", toolArgs: { query: `private-${index}`, path: "package.json" } })),
      { toolName: "search", toolArgs: { query: "later-valid", path: "package.json" } },
    ],
    outputText: productionPassOutput(current),
  });
  const recovery = await runProductionExecutor(current, recoveryHarness);
  assert.equal(recovery.state, "failed", JSON.stringify(recovery));
  assert.equal(recovery.observations.unauthorizedToolOrEffectObserved, true);
  assert.deepEqual(recoveryHarness.calls.toolResults.map(({ name }) => name), ["read", ...Array.from({ length: 16 }, () => "search")]);
  assert.deepEqual(recovery.observations.policyDecisions.slice(-2), [
    { tool: "search", decision: "allow" },
    { tool: "search", decision: "allow" },
  ]);
});

test("production callback observations reject permissions and redact callback payloads", async () => {
  const current = await fixture();
  const secret = "do-not-retain-this-secret";
  const oversized = { path: secret, query: "private", ["oversized-secret-key"]: secret };
  for (let index = 0; index < 8; index += 1) oversized[`extra-${index}`] = secret;
  const harness = productionSdkHarness({
    permissionCalls: [{ request: { kind: "read", path: secret, intention: secret, toolCallId: "tool-call-secret" } }],
    preToolUseCalls: [{ toolName: "write", toolArgs: oversized }],
  });
  const result = await runProductionExecutor(current, harness);
  assert.equal(result.state, "failed", JSON.stringify(result));
  assert.equal(result.observations.unauthorizedToolOrEffectObserved, true);
  const observation = result.observations.callbackObservation;
  assert.equal(observation.version, "shield.copilot-fury.callback-observation.v1");
  assert.deepEqual(observation.records.map(({ surface, tool, permissionKind, decision, reason }) => ({ surface, tool, permissionKind, decision, reason })), [
    { surface: "permission", tool: "unknown", permissionKind: "read", decision: "reject", reason: "permission_rejected" },
    { surface: "pre_tool", tool: "unknown", permissionKind: "unknown", decision: "deny", reason: "admission_sticky_denied" },
    { surface: "handler", tool: "unknown", permissionKind: "unknown", decision: "not_invoked", reason: "shape_rejected" },
  ]);
  assert.deepEqual(observation.records[0].callbackIdentity, { sessionId: "present", toolCallId: "present" });
  assert.equal(observation.records[0].expectedSessionMatch, "match");
  assert.equal(JSON.stringify(observation).includes(secret), false);
  assert.equal(JSON.stringify(observation).includes("oversized-secret-key"), false);
  assert.equal(JSON.stringify(observation).includes("tool-call-secret"), false);
  assert.equal(harness.calls.permissionResults[0].kind, "reject");
  assert.deepEqual(harness.calls.toolResults, []);
});

test("production callback observations reject proxy, accessor, cycle, and over-depth argument shapes", async () => {
  const proxyFunction = new Proxy(() => undefined, {});
  const accessor = {};
  Object.defineProperty(accessor, "path", { enumerable: true, get() { throw new Error("accessor must not run"); } });
  const cycle = { path: "package.json" };
  cycle.self = cycle;
  const overDepthPrimitive = { a: { b: { c: "rejected" } } };
  const overDepthFunction = { a: { b: { c: () => undefined } } };
  const overDepthContainer = { a: { b: { c: { d: "rejected" } } } };
  for (const [label, toolCall, expectedReason] of [
    ["proxy", { toolName: "write", toolArgs: proxyFunction }, "admission_tool_denied"],
    ["accessor", { toolName: "read", toolArgs: accessor }, "admission_argument_shape_denied"],
    ["cycle", { toolName: "write", toolArgs: cycle }, "admission_tool_denied"],
    ["depth-primitive", { toolName: "write", toolArgs: overDepthPrimitive }, "admission_tool_denied"],
    ["depth-function", { toolName: "write", toolArgs: overDepthFunction }, "admission_tool_denied"],
    ["depth-container", { toolName: "write", toolArgs: overDepthContainer }, "admission_tool_denied"],
  ]) {
    const current = await fixture();
    const result = await runProductionExecutor(current, productionSdkHarness({ preToolUseCalls: [toolCall] }));
    assert.equal(result.state, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.observations.callbackObservation.records[0].reason, expectedReason, label);
    assert.equal(result.observations.callbackObservation.records[0].decision, "deny", label);
    assert.equal(result.observations.callbackObservation.records[0].argumentShape.kind, "rejected", label);
  }
});

test("production callback observations preserve a denial before the cap as the final retained record", async () => {
  const current = await fixture();
  const calls = [
    { toolName: "write", toolArgs: { path: "package.json" } },
    ...Array.from({ length: 16 }, () => ({ toolName: "read", toolArgs: { path: "package.json" } })),
  ];
  const harness = productionSdkHarness({ preToolUseCalls: calls, outputText: productionPassOutput(current) });
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, {
    executor: createCopilotFuryPlanExecutorV1({
      async loadSdk() { return harness.module; },
      async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
    }),
    userCopilotHome: current.userCopilotHome,
  });
  assert.equal(result.state, "failed", JSON.stringify(result));
  const evidence = JSON.parse(await readFile(join(current.root, result.evidencePath), "utf8"));
  const observation = evidence.observations.callbackObservation;
  assert.equal(observation.totalCount, 34);
  assert.equal(observation.truncated, true);
  assert.equal(observation.records.length, 32);
  assert.equal(observation.records.at(-1).ordinal, 1);
  assert.equal(observation.records.at(-1).decision, "deny");
  assert.equal(observation.records.at(-1).reason, "admission_tool_denied");
  assert.equal(observation.records.filter(({ ordinal }) => ordinal === 1).length, 1);
  assert.deepEqual(observation.records.slice(0, -1).map(({ ordinal }) => ordinal), Array.from({ length: 31 }, (_, index) => index + 2));
});

test("production callback observations preserve a denial after the cap as the final retained record", async () => {
  const current = await fixture();
  const calls = [
    ...Array.from({ length: 16 }, () => ({ toolName: "read", toolArgs: { path: "package.json" } })),
    { toolName: "write", toolArgs: { path: "package.json" } },
  ];
  const harness = productionSdkHarness({ preToolUseCalls: calls, outputText: productionPassOutput(current) });
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, {
    executor: createCopilotFuryPlanExecutorV1({
      async loadSdk() { return harness.module; },
      async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
    }),
    userCopilotHome: current.userCopilotHome,
  });
  assert.equal(result.state, "failed", JSON.stringify(result));
  const evidence = JSON.parse(await readFile(join(current.root, result.evidencePath), "utf8"));
  const observation = evidence.observations.callbackObservation;
  assert.equal(observation.totalCount, 34);
  assert.equal(observation.truncated, true);
  assert.equal(observation.records.length, 32);
  assert.equal(observation.records.at(-1).ordinal, 33);
  assert.equal(observation.records.at(-1).decision, "deny");
  assert.equal(observation.records.at(-1).reason, "admission_tool_denied");
  assert.deepEqual(observation.records.slice(0, -1).map(({ ordinal }) => ordinal), Array.from({ length: 31 }, (_, index) => index + 1));
});

test("dispatcher validator accepts and persists the explicit terminal denial sentinel", async () => {
  const current = await fixture();
  const callbackRecord = (ordinal, decision = "allow", reason = "exact_tool_allowed") => ({
    surface: "pre_tool",
    ordinal,
    callbackIdentity: { sessionId: "present", toolCallId: "absent" },
    tool: "read",
    permissionKind: "unknown",
    argumentShape: { kind: "object", keys: ["path"], entries: [{ kind: "string" }] },
    expectedSessionMatch: "match",
    decision,
    reason,
  });
  const callbackObservation = {
    version: "shield.copilot-fury.callback-observation.v1",
    totalCount: 34,
    truncated: true,
    records: [
      ...Array.from({ length: 31 }, (_, index) => callbackRecord(index + 2)),
      callbackRecord(1, "deny", "tool_or_arguments_denied"),
    ],
  };
  const fake = executor(current.plan, "PASS", { callbackObservation });
  const result = await dispatchCopilotFuryPlanReviewV1(current.request, {
    executor: fake.value,
    userCopilotHome: current.userCopilotHome,
  });
  assert.equal(result.state, "completed", JSON.stringify(result));
  const evidence = JSON.parse(await readFile(join(current.root, result.evidencePath), "utf8"));
  assert.deepEqual(evidence.observations.callbackObservation.records.map(({ ordinal }) => ordinal), [
    ...Array.from({ length: 31 }, (_, index) => index + 2),
    1,
  ]);
});

test("production hook and handler read a map-bound virtual transition absent from exact HEAD", async () => {
  const current = await fixture();
  const canonicalPlanBytes = `${canonicalJson(current.plan)}\n`;
  const virtualPath = ".shield/audit/legacy-reviewed-transition/sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/transition-plan.json";
  current.request = { ...current.request, transitionPlanPath: virtualPath, transitionPlanRawSha256: sha256(canonicalPlanBytes) };
  const source = {
    kind: "legacy_derived",
    virtualPath,
    canonicalPlanBytes,
    transitionPlanRawSha256: sha256(canonicalPlanBytes),
    provenanceDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  };
  const harness = productionSdkHarness({ preToolUseCalls: [{ toolName: "read", toolArgs: { path: virtualPath } }] });
  const result = await runProductionExecutor(current, harness, source);
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(harness.calls.sessionConfig.hooks === undefined, false);
  assert.equal(JSON.parse(harness.calls.toolResults[0].result).content, canonicalPlanBytes);
});

test("production read preserves the pinned parent when HEAD shadows it with different bytes", async () => {
  const current = await fixture();
  const pinnedBytes = await readFile(join(current.root, current.plan.parentPlanPath), "utf8");
  await writeFile(join(current.root, current.plan.parentPlanPath), "# Different parent bytes at exact HEAD.\n");
  git(current.root, ["add", current.plan.parentPlanPath]);
  git(current.root, ["commit", "-qm", "advance parent bytes"]);
  current.request = { ...current.request, headRevision: git(current.root, ["rev-parse", "HEAD"]) };
  const harness = productionSdkHarness({ preToolUseCalls: [{ toolName: "read", toolArgs: { path: current.plan.parentPlanPath } }] });
  const result = await runProductionExecutor(current, harness);
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(JSON.parse(harness.calls.toolResults[0].result).content, pinnedBytes);
});

test("production search applies byte accounting before deterministic result truncation", async () => {
  const current = await fixture();
  const lines = `${"x".repeat(1_500_000)}\n${Array.from({ length: 201 }, (_, index) => `matrix-needle-${String(index).padStart(3, "0")}`).join("\n")}\n`;
  await writeFile(join(current.root, "a-search-cap.txt"), lines);
  git(current.root, ["add", "a-search-cap.txt"]);
  git(current.root, ["commit", "-qm", "add deterministic search cap fixture"]);
  current.request = { ...current.request, headRevision: git(current.root, ["rev-parse", "HEAD"]) };
  const harness = productionSdkHarness({ preToolUseCalls: [{ toolName: "search", toolArgs: { query: "matrix-needle" } }] });
  const result = await runProductionExecutor(current, harness);
  assert.equal(result.state, "completed", JSON.stringify(result));
  const search = JSON.parse(harness.calls.toolResults[0].result);
  assert.equal(search.truncated, true);
  assert.equal(search.matches.length, 200);
  assert.equal(search.matches[0].path, "a-search-cap.txt");
  assert.equal(search.matches[0].line, 2);
  assert.equal(search.matches.at(-1).line, 201);
});

test("production tool initialization gates the model on the exact runtime metadata set", async () => {
  const current = await fixture();
  const harness = productionSdkHarness({ metadata: { tools: [{ name: "read", description: "read" }, { name: "unexpected", description: "unexpected" }] } });
  const result = await runProductionExecutor(current, harness);
  assert.equal(result.state, "failed", JSON.stringify(result));
  assert.equal(result.code, "FURY_TOOL_BINDING_DRIFT");
  assert.equal(harness.calls.initializeAndValidate, 1);
  assert.equal(harness.calls.getCurrentMetadata, 1);
  assert.equal(harness.calls.prompts.length, 0);
  assert.equal(harness.calls.createSession, 1);
});

test("missing or duplicate execution descriptor registration fails before any SDK effect", async () => {
  const current = await fixture();
  const harness = productionSdkHarness();
  const identity = productionExecutionIdentity(current);
  const transitionBytes = await readFile(join(current.root, current.request.transitionPlanPath), "utf8");
  const reviewArtifactMap = await buildCopilotFuryReviewArtifactMapV1(current.request, {
    kind: "committed_file",
    file: { path: join(current.root, current.request.transitionPlanPath), bytes: transitionBytes, identity: "test-source", rawSha256: sha256(transitionBytes) },
  }, current.plan);
  const validBinding = createCopilotFuryExecutionToolBindingV1(reviewArtifactMap.digest);
  for (const registeredDescriptors of [
    [validBinding.registeredDescriptors[0]],
    [validBinding.registeredDescriptors[0], validBinding.registeredDescriptors[0]],
  ]) {
    const invalidBinding = { ...validBinding, registeredDescriptors };
    const value = createCopilotFuryPlanExecutorV1({
      async loadSdk() { return harness.module; },
      async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
    });
    const result = await value.preflight({
      repositoryRoot: current.root,
      requestedModel: current.request.requestedModel,
      requestedRuntime: current.request.requestedRuntime,
      requestedExecutor: current.request.requestedExecutor,
      executionIdentity: identity,
      reviewArtifactMap,
      toolBinding: invalidBinding,
    });
    assert.equal(result.state, "blocked");
    assert.equal(result.code, "FURY_TOOL_BINDING_INVALID");
  }
  assert.deepEqual(harness.calls, { clientOptions: null, sessionConfig: null, prompts: [], toolResults: [], permissionResults: [], construct: 0, start: 0, listModels: 0, createSession: 0, disconnect: 0, stop: 0, forceStop: 0, initializeAndValidate: 0, getCurrentMetadata: 0 });
});

test("production executor denies malformed, aliased, escaping, and Git-metadata tool arguments before execution", async () => {
  for (const toolCall of [
    { toolName: "read", toolArgs: {} },
    { toolName: "read", toolArgs: { path: "./package.json" } },
    { toolName: "read", toolArgs: { path: "../package.json" } },
    { toolName: "read", toolArgs: { path: ".git/config" } },
    { toolName: "search", toolArgs: { query: "Fury", path: "../" } },
    { toolName: "search", toolArgs: { query: "Fury", extra: true } },
  ]) {
    const current = await fixture();
    const result = await runProductionExecutor(current, productionSdkHarness({ preToolUseCalls: [toolCall] }));
    assert.equal(result.state, "failed", `${JSON.stringify(toolCall)}: ${JSON.stringify(result)}`);
    assert.equal(result.observations.unauthorizedToolOrEffectObserved, true);
  }
});

test("production executor excludes tracked symlinks from map-backed read and search", async () => {
  const current = await fixture();
  await symlink("package.json", join(current.root, "tracked-link.json"));
  git(current.root, ["add", "tracked-link.json"]);
  git(current.root, ["commit", "-qm", "add tracked symlink"]);
  current.request = { ...current.request, headRevision: git(current.root, ["rev-parse", "HEAD"]) };
  const deniedRead = await runProductionExecutor(current, productionSdkHarness({ preToolUseCalls: [{ toolName: "read", toolArgs: { path: "tracked-link.json" } }] }));
  assert.equal(deniedRead.state, "failed", JSON.stringify(deniedRead));
  assert.equal(deniedRead.observations.unauthorizedToolOrEffectObserved, true);
  const harness = productionSdkHarness({ preToolUseCalls: [{ toolName: "search", toolArgs: { query: "private" } }] });
  const allowedSearch = await runProductionExecutor(current, harness);
  assert.equal(allowedSearch.state, "completed", JSON.stringify(allowedSearch));
  assert.deepEqual(JSON.parse(harness.calls.toolResults[0].result).matches.map(({ path }) => path), ["package.json"]);
});

test("production runtime startup is claim-bound for concurrent losers and exact retries", async () => {
  const current = await fixture();
  const harness = productionSdkHarness({ outputText: productionPassOutput(current) });
  const createExecutor = () => createCopilotFuryPlanExecutorV1({
    async loadSdk() { return harness.module; },
    async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
  });
  const results = await Promise.all([
    dispatchCopilotFuryPlanReviewV1(current.request, { executor: createExecutor(), userCopilotHome: current.userCopilotHome }),
    dispatchCopilotFuryPlanReviewV1(current.request, { executor: createExecutor(), userCopilotHome: current.userCopilotHome }),
  ]);
  assert.ok(results.some((result) => result.state === "completed" && result.disposition === "PASS"), JSON.stringify(results));
  assert.equal(harness.calls.construct, 1);
  assert.equal(harness.calls.start, 1);
  assert.equal(harness.calls.listModels, 1);
  assert.equal(harness.calls.createSession, 1);

  const retryHarness = productionSdkHarness({ outputText: productionPassOutput(current) });
  const retry = await dispatchCopilotFuryPlanReviewV1(current.request, {
    executor: createCopilotFuryPlanExecutorV1({
      async loadSdk() { return retryHarness.module; },
      async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
    }),
    userCopilotHome: current.userCopilotHome,
  });
  assert.equal(retry.state, "completed", JSON.stringify(retry));
  assert.equal(retry.disposition, "PASS");
  assert.equal(retryHarness.calls.construct, 0);
  assert.equal(retryHarness.calls.start, 0);
  assert.equal(retryHarness.calls.listModels, 0);
});

test("post-claim runtime start and model-query failures terminalize once and retries do not start Copilot", async () => {
  for (const fault of [{ startFault: true, expectedListCalls: 0 }, { listModelsFault: true, expectedListCalls: 1 }]) {
    const current = await fixture();
    const startupHarness = productionSdkHarness(fault);
    const first = await dispatchCopilotFuryPlanReviewV1(current.request, {
      executor: createCopilotFuryPlanExecutorV1({
        async loadSdk() { return startupHarness.module; },
        async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
      }),
      userCopilotHome: current.userCopilotHome,
    });
    assert.equal(first.state, "failed", JSON.stringify(first));
    assert.equal(first.code, "COPILOT_EXECUTION_FAILED");
    assert.ok(first.receiptId);
    assert.equal(startupHarness.calls.construct, 1);
    assert.equal(startupHarness.calls.start, 1);
    assert.equal(startupHarness.calls.listModels, fault.expectedListCalls);
    assert.equal(startupHarness.calls.createSession, 0);

    const retryHarness = productionSdkHarness({ outputText: productionPassOutput(current) });
    const retry = await dispatchCopilotFuryPlanReviewV1(current.request, {
      executor: createCopilotFuryPlanExecutorV1({
        async loadSdk() { return retryHarness.module; },
        async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
      }),
      userCopilotHome: current.userCopilotHome,
    });
    assert.equal(retry.state, "failed", JSON.stringify(retry));
    assert.equal(retry.code, first.code);
    assert.equal(retry.replayed, true);
    assert.equal(retryHarness.calls.construct, 0);
    assert.equal(retryHarness.calls.start, 0);
    assert.equal(retryHarness.calls.listModels, 0);
  }
});

test("production executor rejects SDK, event, cancellation, and runtime faults", async () => {
  const version = await fixture();
  const versionHarness = productionSdkHarness();
  const versionExecutor = createCopilotFuryPlanExecutorV1({
    async loadSdk() { return versionHarness.module; },
    async resolveLoadedPackageVersion() { return "1.0.10"; },
  });
  const blocked = await versionExecutor.preflight({ repositoryRoot: version.root, requestedModel: version.request.requestedModel, requestedRuntime: version.request.requestedRuntime, requestedExecutor: version.request.requestedExecutor, executionIdentity: productionExecutionIdentity(version) });
  assert.equal(blocked.state, "blocked", JSON.stringify(blocked));

  for (const harness of [
    productionSdkHarness({ eventType: "session.model_change", eventData: { previousModel: "model:fury", newModel: "model:other" } }),
    productionSdkHarness({ eventType: "subagent.deselected" }),
    productionSdkHarness({ producer: "other-producer" }),
    productionSdkHarness({ createFault: true }),
  ]) {
    const current = await fixture();
    const result = await runProductionExecutor(current, harness);
    assert.equal(result.state, "failed", JSON.stringify(result));
  }

  const cancelledFixture = await fixture();
  const cancelled = await runProductionExecutor(cancelledFixture, productionSdkHarness({ cancel: true }));
  assert.equal(cancelled.state, "cancelled", JSON.stringify(cancelled));
  assert.equal(cancelled.code, "COPILOT_CANCELLED");
});
