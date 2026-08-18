import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { chmodSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { CopilotClient as RealCopilotClient, RuntimeConnection as RealRuntimeConnection } from "@github/copilot-sdk";

import {
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS,
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS,
  COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
  COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID,
  COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_SUCCESSOR_RECEIPT_ID,
  COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
  COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS,
  COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF,
  COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
  createCopilotFuryPlanExecutorV1,
  deriveCopilotSdkSessionIdV1,
  dispatchCopilotFuryPlanReviewV1,
  evaluateCopilotFuryRecoveryEligibilityV1,
  validateCopilotFurySuccessorExecutionConfigurationV3,
  validateCopilotFuryPlanDispatchRequestV1,
} from "../dist/copilot-fury-plan-dispatch-v1.mjs";
import { appendSeatDispatchReceiptEntryV1, readSeatDispatchReceiptLedgerV1 } from "../dist/seat-dispatch-store.mjs";
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { buildMissionTransitionPlanV1 } from "../dist/mission-builder-v1.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
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

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "shield@example.invalid"]);
  git(root, ["config", "user.name", "SHIELD Fixture"]);
  const basePaths = [".shield/config.json", ".shield/.gitignore", "package.json"];
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
  await writeFile(journalPath, `${JSON.stringify(begun)}\n`);
  const built = buildMissionTransitionPlanV1({
    missionId,
    subjectId,
    repositoryId: "RanSolo/fixture",
    planningBaseRevision: baseRevision,
    parentPlanCommit: baseRevision,
    parentPlanPath: "docs/missions/issue-319-plan.md",
    parentPlanRawSha256: "a".repeat(64),
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
    schemaVersion: 1,
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
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
  };
  return { root, userCopilotHome, request, plan };
}

function executor(plan, verdict = "PASS") {
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
        const findings = verdict === "PASS" ? [] : [{ code: "PLAN_NEEDS_REVISION", message: "Correct the bounded plan before implementation." }];
        return {
          state: "completed",
          outputText: JSON.stringify({
            schemaVersion: 1,
            contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
            authority: "none",
            reviewerSeatId: "fury",
            reviewedArtifactId: plan.id,
            reviewedArtifactRevision: plan.digest,
            verdict,
            findings,
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
          },
        };
      },
      async close() { calls.close += 1; },
    },
  };
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

function productionPassOutput(plan) {
  return JSON.stringify({
    schemaVersion: 1,
    contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
    authority: "none",
    reviewerSeatId: "fury",
    reviewedArtifactId: plan.id,
    reviewedArtifactRevision: plan.digest,
    verdict: "PASS",
    findings: [],
  });
}

function productionSdkHarness(options = {}) {
  const calls = { clientOptions: null, sessionConfig: null, construct: 0, start: 0, listModels: 0, createSession: 0, disconnect: 0, stop: 0, forceStop: 0 };
  const event = (type, data) => ({ id: randomUUID(), parentId: null, timestamp: new Date().toISOString(), type, data });
  class CopilotClient {
    constructor(clientOptions) { calls.clientOptions = clientOptions; calls.construct += 1; options.onConstruct?.(clientOptions); }
    async start() { calls.start += 1; if (options.startFault) throw new Error("runtime startup fault"); }
    async listModels() { calls.listModels += 1; if (options.listModelsFault) throw new Error("model query fault"); return [{ id: "model:fury" }]; }
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
        },
        async sendAndWait() {
          if (options.eventType) config.onEvent(event(options.eventType, options.eventData ?? {}));
          for (const toolCall of options.preToolUseCalls ?? []) await config.hooks.onPreToolUse(toolCall);
          if (options.cancel) {
            config.onEvent(event("abort", { reason: "user_initiated" }));
            throw new Error("request aborted");
          }
          const message = event("assistant.message", { content: options.outputText ?? "{}", model: config.model });
          config.onEvent(message);
          return message;
        },
        async disconnect() { calls.disconnect += 1; },
      };
    }
    async stop() { calls.stop += 1; }
    async forceStop() { calls.forceStop += 1; }
  }
  const RuntimeConnection = { forStdio() { return { kind: "stdio", path: undefined, args: undefined, env: undefined }; } };
  return { calls, module: { CopilotClient, RuntimeConnection } };
}

async function runProductionExecutor(current, harness) {
  const identity = productionExecutionIdentity(current);
  await mkdir(identity.clientOptions.baseDirectory, { recursive: true, mode: 0o700 });
  await chmod(join(current.root, ".shield", "runtime"), 0o700);
  await chmod(join(current.root, ".shield", "runtime", "copilot-fury"), 0o700);
  await chmod(identity.clientOptions.baseDirectory, 0o700);
  const value = createCopilotFuryPlanExecutorV1({
    async loadSdk() { return harness.module; },
    async resolveLoadedPackageVersion() { return COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION; },
  });
  const preflight = await value.preflight({
    repositoryRoot: current.root,
    requestedModel: current.request.requestedModel,
    requestedRuntime: current.request.requestedRuntime,
    requestedExecutor: current.request.requestedExecutor,
    executionIdentity: identity,
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
    repairLimit: 0,
    validateOutput: () => true,
  });
  await value.close();
  return result;
}

test("closed request rejects aliases, accessors, proxies, and non-read-only configuration", async () => {
  const current = await fixture();
  assert.equal(validateCopilotFuryPlanDispatchRequestV1(current.request).state, "valid");
  assert.equal(validateCopilotFuryPlanDispatchRequestV1({ ...current.request, extra: true }).state, "invalid");
  assert.equal(validateCopilotFuryPlanDispatchRequestV1(new Proxy(current.request, {})).state, "invalid");
  assert.equal(validateCopilotFuryPlanDispatchRequestV1({ ...current.request, allowedTools: ["read", "search", "web"] }).state, "invalid");
  const accessor = { ...current.request };
  Object.defineProperty(accessor, "missionId", { enumerable: true, get: () => current.request.missionId });
  assert.equal(validateCopilotFuryPlanDispatchRequestV1(accessor).state, "invalid");
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
        outputText: `{"schemaVersion":1,"contractVersion":"${COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION}","authority":"none","reviewerSeatId":"fury","reviewedArtifactId":"${current.plan.id}","reviewedArtifactRevision":"${current.plan.digest}","verdict":"PASS","verdict":"REVISE","findings":[]}`,
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
    outputText: productionPassOutput(current.plan),
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
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID, "receipt:Y40rTRNdpEsqc9t24wRZ470R0zzYyk5G");
  assert.equal(COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_SUCCESSOR_RECEIPT_ID, "receipt:3joci3m8iFvPsfeyceBy8b3uH8dfv111");
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

test("production executor binds loaded SDK and producer identity and confines permissions", async () => {
  const current = await fixture();
  const harness = productionSdkHarness();
  const result = await runProductionExecutor(current, harness);
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(result.observations.loadedSdkPackageVersion, COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION);
  assert.equal(result.observations.sessionProducer, COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID);
  assert.equal(result.observations.sessionProducerVersion, "1.0.79");
  assert.equal(harness.calls.clientOptions.mode, "empty");
  assert.deepEqual(harness.calls.sessionConfig.availableTools, ["read", "search"]);
  assert.deepEqual(harness.calls.sessionConfig.tools.map((tool) => tool.name), ["read", "search"]);
  assert.ok(harness.calls.sessionConfig.tools.every((tool) => tool.overridesBuiltInTool === true && tool.skipPermission === true && tool.defer === "never"));
  assert.deepEqual(harness.calls.sessionConfig.mcpServers, {});
  assert.equal(harness.calls.sessionConfig.enableConfigDiscovery, false);
  assert.equal(harness.calls.sessionConfig.enableFileHooks, false);
  assert.equal(harness.calls.sessionConfig.enableHostGitOperations, false);
  const exactPath = join(current.root, "package.json");
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "read", path: exactPath, intention: "review" })).kind, "reject");
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "read", path: exactPath, intention: "review", managedApprovalRequired: true })).kind, "reject");
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "read", path: exactPath, intention: "review", requestSandboxBypass: true })).kind, "reject");
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "write", fileName: exactPath, diff: "", intention: "mutate", canOfferSessionApproval: false })).kind, "reject");
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "read", path: "./package.json", intention: "alias" })).kind, "reject");
  assert.equal((await harness.calls.sessionConfig.hooks.onPreToolUse({ toolName: "read", toolArgs: { path: exactPath } })).permissionDecision, "allow");
  assert.equal((await harness.calls.sessionConfig.hooks.onPreToolUse({ toolName: "search", toolArgs: { query: "Fury" } })).permissionDecision, "allow");
  assert.equal((await harness.calls.sessionConfig.hooks.onPreToolUse({ toolName: "write", toolArgs: { path: exactPath } })).permissionDecision, "deny");
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
  const immutableRead = JSON.parse(await harness.calls.sessionConfig.tools.find((tool) => tool.name === "read").handler({ path: exactPath }));
  assert.equal(immutableRead.repositoryRevision, current.request.headRevision);
  assert.equal(immutableRead.path, "package.json");
  assert.equal(immutableRead.content, "{\"private\":true}\n");
  for (const query of ["replacement object one", '"replacement":"one"', '"replacement":"two"']) {
    const immutableSearch = JSON.parse(await harness.calls.sessionConfig.tools.find((tool) => tool.name === "search").handler({ query }));
    assert.deepEqual(immutableSearch.matches, []);
  }
  const aliasPath = join(current.root, "package-alias.json");
  await symlink(exactPath, aliasPath);
  assert.equal((await harness.calls.sessionConfig.onPermissionRequest({ kind: "read", path: aliasPath, intention: "alias" })).kind, "reject");
  assert.equal(harness.calls.disconnect, 1);
  assert.equal(harness.calls.stop, 1);
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

test("production executor denies tracked symlink modes for read and search before execution", async () => {
  const current = await fixture();
  await symlink("package.json", join(current.root, "tracked-link.json"));
  git(current.root, ["add", "tracked-link.json"]);
  git(current.root, ["commit", "-qm", "add tracked symlink"]);
  current.request = { ...current.request, headRevision: git(current.root, ["rev-parse", "HEAD"]) };
  for (const toolCall of [
    { toolName: "read", toolArgs: { path: "tracked-link.json" } },
    { toolName: "search", toolArgs: { query: "private" } },
  ]) {
    const result = await runProductionExecutor(current, productionSdkHarness({ preToolUseCalls: [toolCall] }));
    assert.equal(result.state, "failed", `${JSON.stringify(toolCall)}: ${JSON.stringify(result)}`);
    assert.equal(result.observations.unauthorizedToolOrEffectObserved, true);
  }
});

test("production runtime startup is claim-bound for concurrent losers and exact retries", async () => {
  const current = await fixture();
  const harness = productionSdkHarness({ outputText: productionPassOutput(current.plan) });
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

  const retryHarness = productionSdkHarness({ outputText: productionPassOutput(current.plan) });
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

    const retryHarness = productionSdkHarness({ outputText: productionPassOutput(current.plan) });
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
