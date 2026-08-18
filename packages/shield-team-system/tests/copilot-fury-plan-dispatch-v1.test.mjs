import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS,
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS,
  COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
  COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
  COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS,
  COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF,
  COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
  dispatchCopilotFuryPlanReviewV1,
  validateCopilotFuryPlanDispatchRequestV1,
} from "../dist/copilot-fury-plan-dispatch-v1.mjs";
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

async function fixture() {
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
  await writeFile(join(root, ".github", "agents", "fury.agent.md"), FURY_CARD);
  await writeFile(join(root, "package.json"), "{\"private\":true}\n");
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "shield@example.invalid"]);
  git(root, ["config", "user.name", "SHIELD Fixture"]);
  git(root, ["add", ".shield/config.json", ".shield/.gitignore", ".github/agents/fury.agent.md", "package.json"]);
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
  assert.equal(drifted.state, "failed", JSON.stringify(drifted));
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

test("terminal append and final evidence readback faults require recovery", async () => {
  const appendFault = await fixture();
  const appendExecutor = executor(appendFault.plan);
  const appendResult = await dispatchCopilotFuryPlanReviewV1(appendFault.request, {
    executor: appendExecutor.value,
    userCopilotHome: appendFault.userCopilotHome,
    async appendDispatchReceipt() { return { state: "invalid", code: "terminal_append_fault", errors: ["terminal append failed"] }; },
  });
  assert.equal(appendResult.state, "recovery_required", JSON.stringify(appendResult));
  assert.equal(appendResult.handoff, null);

  const readbackFault = await fixture();
  const readbackExecutor = executor(readbackFault.plan);
  const readbackResult = await dispatchCopilotFuryPlanReviewV1(readbackFault.request, {
    executor: readbackExecutor.value,
    userCopilotHome: readbackFault.userCopilotHome,
    async beforeFinalReadback() {
      const missionRoot = join(readbackFault.root, ".shield", "audit", "copilot-fury-plan-dispatch", sha256(readbackFault.request.missionId));
      const evidenceName = (await readdir(missionRoot)).find((name) => name.startsWith("dispatch-evidence-"));
      assert.ok(evidenceName);
      await writeFile(join(missionRoot, evidenceName), "{}\n");
    },
  });
  assert.equal(readbackResult.state, "recovery_required", JSON.stringify(readbackResult));
  assert.equal(readbackResult.handoff, null);
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
