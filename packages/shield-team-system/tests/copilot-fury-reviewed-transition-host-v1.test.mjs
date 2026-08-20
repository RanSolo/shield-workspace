import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  COPILOT_FURY_REVIEWED_TRANSITION_REPAIR_LIMIT,
  COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT,
  prepareReviewedMissionTransitionV1,
} from "../dist/copilot-fury-reviewed-transition-host-v1.mjs";
import {
  COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
  COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
  COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
  COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
} from "../dist/copilot-fury-plan-dispatch-v1.mjs";
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { buildMissionTransitionPlanV1 } from "../dist/mission-builder-v1.mjs";
import { resolveSeatDispatchIdentityByReceiptIdV1 } from "../dist/mission-preparation-host-v1.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import { readSeatDispatchReceiptLedgerSnapshotV1 } from "../dist/seat-dispatch-store.mjs";
import {
  MISSION_130_JOURNAL_DIGEST,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
} from "../dist/profile-aware-mission-v1.mjs";
import { prepareWorktreeStateV1 } from "../dist/worktree-state-v1.mjs";

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
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function binding(seatId) {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    schemaVersion: 1,
    bindingId: `binding:reviewed-transition:${seatId}`,
    humanPrincipalId: `human:reviewed-transition:${seatId}`,
    seatId,
    missionScope: "*",
    signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:reviewed-transition-test",
    provenanceRef: `repository-policy:reviewed-transition-test:${seatId}`,
  };
}

async function fixture() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-reviewed-transition-host-")));
  const sourceRoot = join(parent, "source");
  const root = join(parent, "lane");
  await mkdir(sourceRoot);
  git(sourceRoot, ["init", "--quiet", "-b", "main"]);
  git(sourceRoot, ["config", "user.email", "shield@example.invalid"]);
  git(sourceRoot, ["config", "user.name", "SHIELD Fixture"]);
  git(sourceRoot, ["remote", "add", "origin", "git@github.com:RanSolo/reviewed-transition-fixture.git"]);
  await mkdir(join(sourceRoot, ".github", "agents"), { recursive: true });
  await mkdir(join(sourceRoot, "docs", "missions"), { recursive: true });
  await writeFile(join(sourceRoot, ".gitignore"), ".shield/\n");
  await writeFile(join(sourceRoot, ".github", "agents", "fury.agent.md"), FURY_CARD);
  await writeFile(join(sourceRoot, "docs", "missions", "parent-plan.md"), "# Approved parent plan\n");
  await writeFile(join(sourceRoot, "package.json"), "{\"private\":true}\n");
  git(sourceRoot, ["add", ".gitignore", ".github/agents/fury.agent.md", "docs/missions/parent-plan.md", "package.json"]);
  git(sourceRoot, ["commit", "--quiet", "-m", "reviewed transition base"]);
  const baseRevision = git(sourceRoot, ["rev-parse", "HEAD"]);
  git(sourceRoot, ["worktree", "add", "--quiet", "-b", "issue-346-lane", root, "HEAD"]);

  const coulson = binding("coulson");
  const fitz = binding("fitz");
  const config = createShieldConfig({
    repositoryId: "RanSolo/reviewed-transition-fixture",
    coulsonBindingRef: coulson.signingKeyRef,
    fitzBindingRef: fitz.signingKeyRef,
  });
  await mkdir(join(sourceRoot, ".shield"));
  await writeFile(join(sourceRoot, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(join(sourceRoot, ".shield", "trusted-human-bindings.json"), `${JSON.stringify({ schemaVersion: 1, bindings: [coulson, fitz] }, null, 2)}\n`);
  const prepared = await prepareWorktreeStateV1({ sourceRoot: await realpath(sourceRoot), destinationRoot: await realpath(root) });
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));

  const missionId = "mission:issue-346-host-fixture";
  const subjectId = "github:RanSolo/reviewed-transition-fixture/issue/346";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Compose one exact Fury review into one reviewed transition graph.",
    subjectId,
    riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false },
    participants: ["coulson", "fitz", "fury", "hill", "may"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-19T12:00:00.000Z", provenance: "hostTrusted" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const begun = createProfileAwareMissionBegunEntry(brief, [coulson, fitz]);
  const journalPath = join(root, config.paths.journals, `${Buffer.from(missionId).toString("base64url")}.jsonl`);
  await mkdir(dirname(journalPath), { recursive: true });
  await writeFile(journalPath, `${JSON.stringify(begun)}\n`);

  const built = buildMissionTransitionPlanV1({
    missionId,
    subjectId,
    repositoryId: "RanSolo/reviewed-transition-fixture",
    planningBaseRevision: baseRevision,
    parentPlanCommit: baseRevision,
    parentPlanPath: "docs/missions/parent-plan.md",
    parentPlanRawSha256: sha256("# Approved parent plan\n"),
    transitionKind: "fresh_authorize_wheels_up",
    boundedOutcome: "Prepare one bounded implementation transition.",
    approvedRelativePaths: ["implementation.mts"],
    publicationPaths: ["implementation.mts"],
    approvedActionIds: ["action:issue-346:implement"],
    approvedEffectClasses: ["behavioral_implementation"],
    approvedEffectKeys: ["effect:issue-346:implement"],
    approvedCapabilities: ["capability:edit"],
    validationCommandIds: ["validation:issue-346:test"],
    modelId: "model:may",
    reasoningRuntimeId: "runtime:may",
    toolExecutorId: "executor:may",
    exclusions: [
      "review.comment.publish", "review.pull_request.update_draft", "review.pull_request.mark_ready",
      "merge", "deployment", "release", "final_acceptance",
    ],
  });
  assert.equal(built.state, "built", JSON.stringify(built));
  const planPath = "docs/missions/issue-346-transition-plan.json";
  await writeFile(join(root, planPath), `${JSON.stringify(built.plan)}\n`);
  git(root, ["add", planPath]);
  git(root, ["commit", "--quiet", "-m", "reviewed transition plan"]);
  const headRevision = git(root, ["rev-parse", "HEAD"]);
  return {
    root: await realpath(root),
    missionId,
    missionRevision: brief.revisionId,
    subjectId,
    baseRevision,
    headRevision,
    branch: "issue-346-lane",
    journalPath,
    plan: built.plan,
    planPath,
    input: { missionId, repositoryRoot: await realpath(root), transitionPlanPath: planPath, furyModel: "model:fury" },
  };
}

function graphExists(current) {
  const digest = createHash("sha256").update(current.missionId).digest("hex");
  return existsSync(join(current.root, ".shield", "audit", "mission-preparation", digest, "reviewed-transition.json"));
}

async function replaceFileWithSameBytes(path) {
  const bytes = await readFile(path);
  const mode = (await lstat(path)).mode & 0o777;
  await rename(path, `${path}.replaced`);
  await writeFile(path, bytes, { mode });
}

function findInstallMarker(root) {
  const seedRoot = join(root, COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT);
  if (!existsSync(seedRoot)) return "";
  try {
    return execFileSync("find", [seedRoot, "-name", "request-seed.installing"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function runNodeModule(source, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function waitForPath(path, label) {
  const deadline = Date.now() + 5_000;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  }
}

function executor(plan, verdict = "PASS") {
  const calls = { preflight: 0, execute: 0, requests: [] };
  return {
    calls,
    value: {
      async preflight(input) {
        calls.preflight += 1;
        calls.requests.push(input);
        return { state: "ready", packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID };
      },
      async execute(input) {
        calls.execute += 1;
        const findings = verdict === "PASS" ? [] : [{ code: "PLAN_NEEDS_REVISION", message: "Revise the bounded plan." }];
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
      async close() {},
    },
  };
}

function seedPath(root) {
  const token = execFileSync("find", [join(root, COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT), "-name", "request-seed.json"], { encoding: "utf8" }).trim();
  return token;
}

function seedCompletionPath(root) {
  return join(dirname(seedPath(root)), "request-seed.complete");
}

function seedCompletingPath(root) {
  return join(dirname(seedPath(root)), "request-seed.completing");
}

test("derives repairLimit=1 and stable identities, then directly materializes and replays one PASS", async () => {
  const current = await fixture();
  const firstExecutor = executor(current.plan);
  const first = await prepareReviewedMissionTransitionV1(current.input, {
    dispatchDependencies: { executor: firstExecutor.value },
    now: () => new Date("2026-08-19T12:01:00.000Z"),
  });
  assert.equal(first.state, "materialized", JSON.stringify(first));
  assert.equal(firstExecutor.calls.execute, 1);
  const seed = JSON.parse(await readFile(seedPath(current.root), "utf8"));
  assert.equal(seed.authority, "none");
  assert.equal(seed.request.repairLimit, COPILOT_FURY_REVIEWED_TRANSITION_REPAIR_LIMIT);
  assert.deepEqual(seed.request.allowedTools, ["read", "search"]);
  assert.deepEqual(seed.request.allowedEffects, []);
  assert.equal(seed.request.timestamp.value, "2026-08-19T12:01:00.000Z");
  assert.match(seed.request.repositoryWorkspaceId, /^workspace:reviewed-transition:/u);
  assert.match(seed.request.parentSessionId, /^session:reviewed-transition:/u);
  assert.deepEqual(seed.request, {
    schemaVersion: 1,
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
    authority: "none",
    repositoryRoot: current.root,
    repositoryId: "RanSolo/reviewed-transition-fixture",
    repositoryWorkspaceId: seed.logicalOperation.repositoryWorkspaceId,
    branch: current.branch,
    planningBaseRevision: current.baseRevision,
    headRevision: current.headRevision,
    missionId: current.missionId,
    missionRevision: current.missionRevision,
    subjectId: current.subjectId,
    subjectRevision: current.plan.digest,
    parentSessionId: seed.logicalOperation.parentSessionId,
    transitionPlanPath: current.planPath,
    transitionPlanRawSha256: sha256(`${JSON.stringify(current.plan)}\n`),
    cardSelection: { kind: "repository_default" },
    requestedModel: "model:fury",
    requestedRuntime: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
    requestedExecutor: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
    allowedTools: ["read", "search"],
    allowedEffects: [],
    repairLimit: 1,
    stopConditions: ["PASS", "REVISE", "cancelled", "failed"],
    timestamp: { value: "2026-08-19T12:01:00.000Z", provenance: "hostTrusted" },
  });

  const replayExecutor = executor(current.plan);
  const replay = await prepareReviewedMissionTransitionV1(current.input, {
    dispatchDependencies: { executor: replayExecutor.value },
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  });
  assert.equal(replay.state, "already_materialized", JSON.stringify(replay));
  assert.equal(replayExecutor.calls.execute, 0);
  assert.equal(JSON.parse(await readFile(seedPath(current.root), "utf8")).request.timestamp.value, "2026-08-19T12:01:00.000Z");
});

test("preserves REVISE exactly, creates no graph, and conflicts a different model in the same plan scope", async () => {
  const current = await fixture();
  const reviseExecutor = executor(current.plan, "REVISE");
  const revised = await prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: reviseExecutor.value } });
  assert.equal(revised.state, "completed", JSON.stringify(revised));
  assert.equal(revised.disposition, "REVISE");
  assert.equal(revised.handoff, null);
  assert.equal(reviseExecutor.calls.execute, 1);
  assert.equal(graphExists(current), false);

  const conflictingExecutor = executor(current.plan);
  const conflict = await prepareReviewedMissionTransitionV1({ ...current.input, furyModel: "model:other-fury" }, { dispatchDependencies: { executor: conflictingExecutor.value } });
  assert.equal(conflict.state, "conflict", JSON.stringify(conflict));
  assert.equal(conflict.code, "REQUEST_SEED_CONFLICT");
  assert.equal(conflictingExecutor.calls.preflight, 0);
  assert.equal(conflictingExecutor.calls.execute, 0);
  assert.equal(graphExists(current), false);
});

test("preserves every non-PASS dispatcher outcome exactly and never creates a graph", async () => {
  const cases = [
    { state: "completed", disposition: "REVISE", findings: [{ code: "PLAN_NEEDS_REVISION", message: "revise" }], handoff: null },
    { state: "blocked", code: "BLOCKED_ADAPTER_GAP", errors: ["blocked"], receiptId: null, evidencePath: null, replayed: false, handoff: null },
    { state: "failed", code: "DISPATCH_FAILED", errors: ["failed"], receiptId: "receipt:failed", evidencePath: null, replayed: false, handoff: null },
    { state: "cancelled", code: "DISPATCH_CANCELLED", errors: ["cancelled"], receiptId: "receipt:cancelled", evidencePath: null, replayed: false, handoff: null },
    { state: "recovery_required", code: "DISPATCH_INTERRUPTED", errors: ["interrupted"], receiptId: "receipt:interrupted", evidencePath: null, replayed: false, handoff: null },
    { state: "invalid", code: "MALFORMED_DISPATCH_RESULT", errors: ["malformed"], receiptId: null, evidencePath: null, replayed: false, handoff: null },
  ];
  for (const specific of cases) {
    const current = await fixture();
    const outcome = Object.freeze({
      contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
      authority: "none",
      ...(specific.state === "completed" || specific.state === "failed" || specific.state === "cancelled" || specific.state === "recovery_required"
        ? { missionId: current.missionId, receiptId: null, evidencePath: null, replayed: false }
        : {}),
      ...specific,
    });
    let materializations = 0;
    const result = await prepareReviewedMissionTransitionV1(current.input, {
      dispatchPlanReview: async () => outcome,
      materializeReviewedTransition: async () => {
        materializations += 1;
        throw new Error("must_not_materialize");
      },
    });
    assert.deepEqual(result, outcome, specific.state);
    assert.equal(materializations, 0, specific.state);
    assert.equal(graphExists(current), false, specific.state);
  }
});

test("a missing seed after a durable claim is recovery-required and never invokes a second model", async () => {
  const current = await fixture();
  const firstExecutor = executor(current.plan, "REVISE");
  assert.equal((await prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: firstExecutor.value } })).state, "completed");
  await unlink(seedPath(current.root));
  const retryExecutor = executor(current.plan);
  const retry = await prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: retryExecutor.value } });
  assert.equal(retry.state, "recovery_required", JSON.stringify(retry));
  assert.equal(retry.code, "REQUEST_SEED_MISSING_AFTER_CLAIM");
  assert.equal(retryExecutor.calls.execute, 0);
});

test("directory creation and seed install are durably synced", async () => {
  const current = await fixture();
  const fake = executor(current.plan, "REVISE");
  const created = [];
  const synced = [];
  const handles = new WeakMap();
  const result = await prepareReviewedMissionTransitionV1(current.input, {
    dispatchDependencies: { executor: fake.value },
    seedPersistence: {
      mkdirPath: async (path, mode) => { await mkdir(path, { mode }); created.push(path); },
      openPath: async (path, flags, mode) => {
        const handle = await open(path, flags, mode);
        handles.set(handle, path);
        return handle;
      },
      syncDirectoryHandle: async (handle) => { synced.push(handles.get(handle)); await handle.sync(); },
    },
  });
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(result.disposition, "REVISE");
  for (const directory of created) assert.ok(synced.includes(directory), `created directory was not fsynced: ${directory}`);
  assert.ok(synced.filter((path) => path === dirname(seedPath(current.root))).length >= 5, "seed install directory was not synced for claim, install, cleanup, completion, and completion-marker cleanup");
  assert.equal((await lstat(seedCompletionPath(current.root))).mode & 0o777, 0o600);
  assert.equal(existsSync(seedCompletingPath(current.root)), false);
});

test("observers cannot dispatch while cleanup fsync is blocked or after it fails", async () => {
  {
    const current = await fixture();
    const installingExecutor = executor(current.plan, "REVISE");
    let cleanupPending = false;
    let releaseCleanup;
    let observeBlockedCleanup;
    const blockedCleanup = new Promise((resolveBlocked) => { observeBlockedCleanup = resolveBlocked; });
    const cleanupRelease = new Promise((resolveRelease) => { releaseCleanup = resolveRelease; });
    const installing = prepareReviewedMissionTransitionV1(current.input, {
      dispatchDependencies: { executor: installingExecutor.value },
      seedPersistence: {
        unlinkPath: async (path) => { await unlink(path); cleanupPending = path.endsWith("request-seed.installing"); },
        syncDirectoryHandle: async (handle) => {
          if (cleanupPending) {
            observeBlockedCleanup();
            await cleanupRelease;
            cleanupPending = false;
          }
          await handle.sync();
        },
      },
    });
    await blockedCleanup;
    assert.equal(existsSync(seedCompletionPath(current.root)), false);
    const observerUrl = new URL("../dist/copilot-fury-reviewed-transition-host-v1.mjs?cleanup-observer=blocked", import.meta.url);
    const observerHost = await import(observerUrl.href);
    const observerExecutor = executor(current.plan);
    const observed = await observerHost.prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: observerExecutor.value } });
    try {
      assert.equal(observed.state, "recovery_required", JSON.stringify(observed));
      assert.match(observed.errors.join(" "), /request(?:-|_)seed(?:\.|_)complete|request_seed_completion/u);
      assert.equal(observerExecutor.calls.preflight, 0);
      assert.equal(observerExecutor.calls.execute, 0);
      assert.equal(installingExecutor.calls.execute, 0);
    } finally {
      releaseCleanup();
    }
    const installed = await installing;
    assert.equal(installed.state, "completed", JSON.stringify(installed));
    assert.equal(installingExecutor.calls.execute, 1);
  }

  {
    const current = await fixture();
    const installingExecutor = executor(current.plan);
    let cleanupPending = false;
    const failed = await prepareReviewedMissionTransitionV1(current.input, {
      dispatchDependencies: { executor: installingExecutor.value },
      seedPersistence: {
        unlinkPath: async (path) => { await unlink(path); cleanupPending = path.endsWith("request-seed.installing"); },
        syncDirectoryHandle: async (handle) => {
          if (cleanupPending) throw new Error("injected_cleanup_fsync_failure");
          await handle.sync();
        },
      },
    });
    assert.equal(failed.state, "recovery_required", JSON.stringify(failed));
    assert.equal(failed.code, "REQUEST_SEED_PERSISTENCE_UNCERTAIN");
    assert.equal(installingExecutor.calls.preflight, 0);
    assert.equal(installingExecutor.calls.execute, 0);
    assert.equal(existsSync(seedCompletionPath(current.root)), false);
    const observerUrl = new URL("../dist/copilot-fury-reviewed-transition-host-v1.mjs?cleanup-observer=failed", import.meta.url);
    const observerHost = await import(observerUrl.href);
    const observerExecutor = executor(current.plan);
    const observed = await observerHost.prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: observerExecutor.value } });
    assert.equal(observed.state, "recovery_required", JSON.stringify(observed));
    assert.match(observed.errors.join(" "), /request(?:-|_)seed(?:\.|_)complete|request_seed_completion/u);
    assert.equal(observerExecutor.calls.preflight, 0);
    assert.equal(observerExecutor.calls.execute, 0);
  }
});

test("observers cannot dispatch while completion-file fsync is blocked or after it fails", async () => {
  {
    const current = await fixture();
    const installingExecutor = executor(current.plan, "REVISE");
    const handles = new WeakMap();
    let releaseCompletion;
    let observeBlockedCompletion;
    const blockedCompletion = new Promise((resolveBlocked) => { observeBlockedCompletion = resolveBlocked; });
    const completionRelease = new Promise((resolveRelease) => { releaseCompletion = resolveRelease; });
    const installing = prepareReviewedMissionTransitionV1(current.input, {
      dispatchDependencies: { executor: installingExecutor.value },
      seedPersistence: {
        openPath: async (path, flags, mode) => {
          const handle = await open(path, flags, mode);
          handles.set(handle, path);
          return handle;
        },
        syncFileHandle: async (handle) => {
          if (handles.get(handle)?.endsWith("request-seed.completing")) {
            observeBlockedCompletion();
            await completionRelease;
          }
          await handle.sync();
        },
      },
    });
    await blockedCompletion;
    assert.equal(existsSync(seedCompletingPath(current.root)), true);
    assert.equal(existsSync(seedCompletionPath(current.root)), false);
    const observerUrl = new URL("../dist/copilot-fury-reviewed-transition-host-v1.mjs?completion-file-observer=blocked", import.meta.url);
    const observerHost = await import(observerUrl.href);
    const observerExecutor = executor(current.plan);
    const observed = await observerHost.prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: observerExecutor.value } });
    try {
      assert.equal(observed.state, "recovery_required", JSON.stringify(observed));
      assert.equal(observerExecutor.calls.preflight, 0);
      assert.equal(observerExecutor.calls.execute, 0);
      assert.equal(installingExecutor.calls.preflight, 0);
      assert.equal(installingExecutor.calls.execute, 0);
    } finally {
      releaseCompletion();
    }
    const installed = await installing;
    assert.equal(installed.state, "completed", JSON.stringify(installed));
    assert.equal(installingExecutor.calls.execute, 1);
  }

  {
    const current = await fixture();
    const installingExecutor = executor(current.plan);
    const handles = new WeakMap();
    const failed = await prepareReviewedMissionTransitionV1(current.input, {
      dispatchDependencies: { executor: installingExecutor.value },
      seedPersistence: {
        openPath: async (path, flags, mode) => {
          const handle = await open(path, flags, mode);
          handles.set(handle, path);
          return handle;
        },
        syncFileHandle: async (handle) => {
          if (handles.get(handle)?.endsWith("request-seed.completing")) throw new Error("injected_completion_file_fsync_failure");
          await handle.sync();
        },
      },
    });
    assert.equal(failed.state, "recovery_required", JSON.stringify(failed));
    assert.equal(failed.code, "REQUEST_SEED_PERSISTENCE_UNCERTAIN");
    assert.equal(existsSync(seedCompletingPath(current.root)), true);
    assert.equal(existsSync(seedCompletionPath(current.root)), false);
    assert.equal(installingExecutor.calls.preflight, 0);
    assert.equal(installingExecutor.calls.execute, 0);
    const observerUrl = new URL("../dist/copilot-fury-reviewed-transition-host-v1.mjs?completion-file-observer=failed", import.meta.url);
    const observerHost = await import(observerUrl.href);
    const observerExecutor = executor(current.plan);
    const observed = await observerHost.prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: observerExecutor.value } });
    assert.equal(observed.state, "recovery_required", JSON.stringify(observed));
    assert.equal(observerExecutor.calls.preflight, 0);
    assert.equal(observerExecutor.calls.execute, 0);
  }
});

test("observers cannot dispatch while final-witness directory fsync is blocked or after it fails", async () => {
  {
    const current = await fixture();
    const installingExecutor = executor(current.plan, "REVISE");
    let finalWitnessLinked = false;
    let releaseDirectory;
    let observeBlockedDirectory;
    const blockedDirectory = new Promise((resolveBlocked) => { observeBlockedDirectory = resolveBlocked; });
    const directoryRelease = new Promise((resolveRelease) => { releaseDirectory = resolveRelease; });
    const installing = prepareReviewedMissionTransitionV1(current.input, {
      dispatchDependencies: { executor: installingExecutor.value },
      seedPersistence: {
        linkPath: async (existingPath, newPath) => {
          await link(existingPath, newPath);
          if (newPath.endsWith("request-seed.complete")) finalWitnessLinked = true;
        },
        syncDirectoryHandle: async (handle) => {
          if (finalWitnessLinked) {
            observeBlockedDirectory();
            await directoryRelease;
            finalWitnessLinked = false;
          }
          await handle.sync();
        },
      },
    });
    await blockedDirectory;
    assert.equal(existsSync(seedCompletingPath(current.root)), true);
    assert.equal(existsSync(seedCompletionPath(current.root)), true);
    const observerUrl = new URL("../dist/copilot-fury-reviewed-transition-host-v1.mjs?completion-directory-observer=blocked", import.meta.url);
    const observerHost = await import(observerUrl.href);
    const observerExecutor = executor(current.plan);
    const observed = await observerHost.prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: observerExecutor.value } });
    try {
      assert.equal(observed.state, "recovery_required", JSON.stringify(observed));
      assert.equal(observerExecutor.calls.preflight, 0);
      assert.equal(observerExecutor.calls.execute, 0);
      assert.equal(installingExecutor.calls.preflight, 0);
      assert.equal(installingExecutor.calls.execute, 0);
    } finally {
      releaseDirectory();
    }
    const installed = await installing;
    assert.equal(installed.state, "completed", JSON.stringify(installed));
    assert.equal(installingExecutor.calls.execute, 1);
  }

  {
    const current = await fixture();
    const installingExecutor = executor(current.plan);
    let finalWitnessLinked = false;
    const failed = await prepareReviewedMissionTransitionV1(current.input, {
      dispatchDependencies: { executor: installingExecutor.value },
      seedPersistence: {
        linkPath: async (existingPath, newPath) => {
          await link(existingPath, newPath);
          if (newPath.endsWith("request-seed.complete")) finalWitnessLinked = true;
        },
        syncDirectoryHandle: async (handle) => {
          if (finalWitnessLinked) throw new Error("injected_final_witness_directory_fsync_failure");
          await handle.sync();
        },
      },
    });
    assert.equal(failed.state, "recovery_required", JSON.stringify(failed));
    assert.equal(failed.code, "REQUEST_SEED_PERSISTENCE_UNCERTAIN");
    assert.equal(existsSync(seedCompletingPath(current.root)), true);
    assert.equal(existsSync(seedCompletionPath(current.root)), true);
    assert.equal(installingExecutor.calls.preflight, 0);
    assert.equal(installingExecutor.calls.execute, 0);
    const observerUrl = new URL("../dist/copilot-fury-reviewed-transition-host-v1.mjs?completion-directory-observer=failed", import.meta.url);
    const observerHost = await import(observerUrl.href);
    const observerExecutor = executor(current.plan);
    const observed = await observerHost.prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: observerExecutor.value } });
    assert.equal(observed.state, "recovery_required", JSON.stringify(observed));
    assert.equal(observerExecutor.calls.preflight, 0);
    assert.equal(observerExecutor.calls.execute, 0);
  }
});

test("partial write and fsync, link, or unlink uncertainty leaves durable recovery on every retry", async () => {
  const faults = {
    partial: {
      writeFileHandle: async (handle, bytes) => {
        const length = Math.max(1, bytes.byteLength - 1);
        await handle.write(bytes, 0, length, null);
        return length;
      },
    },
    "file fsync": { syncFileHandle: async () => { throw new Error("injected_file_fsync_failure"); } },
    "directory fsync": {
      syncDirectoryHandle: async (handle) => {
        if (findInstallMarker(currentFault.root) !== "") throw new Error("injected_directory_fsync_failure");
        await handle.sync();
      },
    },
    link: { linkPath: async () => { throw new Error("injected_link_failure"); } },
    unlink: { unlinkPath: async () => { throw new Error("injected_unlink_failure"); } },
  };
  let currentFault;
  for (const [label, seedPersistence] of Object.entries(faults)) {
    currentFault = await fixture();
    const firstExecutor = executor(currentFault.plan);
    const first = await prepareReviewedMissionTransitionV1(currentFault.input, {
      dispatchDependencies: { executor: firstExecutor.value },
      seedPersistence,
    });
    assert.equal(first.state, "recovery_required", `${label}: ${JSON.stringify(first)}`);
    assert.equal(first.code, "REQUEST_SEED_PERSISTENCE_UNCERTAIN", label);
    assert.notEqual(findInstallMarker(currentFault.root), "", label);
    assert.equal(firstExecutor.calls.preflight, 0, label);
    assert.equal(firstExecutor.calls.execute, 0, label);

    const retryExecutor = executor(currentFault.plan);
    const retry = await prepareReviewedMissionTransitionV1(currentFault.input, { dispatchDependencies: { executor: retryExecutor.value } });
    assert.equal(retry.state, "recovery_required", `${label} retry: ${JSON.stringify(retry)}`);
    assert.equal(retry.code, "REQUEST_SEED_INSTALL_INCOMPLETE", label);
    assert.equal(retryExecutor.calls.preflight, 0, label);
    assert.equal(retryExecutor.calls.execute, 0, label);
  }
});

test("malformed, partial, hard-linked, or aliased durable seeds fail closed before retry dispatch", async () => {
  const mutations = {
    malformed: async (current, path) => writeFile(path, "{\n"),
    partial: async (current, path) => {
      const bytes = await readFile(path);
      await writeFile(path, bytes.subarray(0, Math.floor(bytes.byteLength / 2)));
    },
    hardlink: async (current, path) => link(path, join(current.root, ".shield", "seed-hardlink")),
    alias: async (current, path) => {
      const directory = dirname(path);
      const moved = `${directory}.real`;
      await rename(directory, moved);
      await symlink(moved, directory, "dir");
    },
  };
  for (const [label, mutate] of Object.entries(mutations)) {
    const current = await fixture();
    const firstExecutor = executor(current.plan, "REVISE");
    assert.equal((await prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: firstExecutor.value } })).state, "completed");
    await mutate(current, seedPath(current.root));
    const retryExecutor = executor(current.plan);
    const retry = await prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: retryExecutor.value } });
    assert.equal(retry.state, "recovery_required", `${label}: ${JSON.stringify(retry)}`);
    assert.equal(retryExecutor.calls.preflight, 0, label);
    assert.equal(retryExecutor.calls.execute, 0, label);
    assert.equal(graphExists(current), false, label);
  }
});

test("permissive-mode durable seeds are rejected on direct and converged replay paths", async () => {
  for (const replayPath of ["direct", "converged"]) {
    const current = await fixture();
    const firstExecutor = executor(current.plan, "REVISE");
    assert.equal((await prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: firstExecutor.value } })).state, "completed");
    const path = seedPath(current.root);
    await chmod(path, 0o644);
    let markerRemoval;
    if (replayPath === "converged") {
      const marker = join(dirname(path), "request-seed.installing");
      await writeFile(marker, "installing\n", { mode: 0o600 });
      markerRemoval = new Promise((resolveRemoval, rejectRemoval) => {
        setTimeout(() => unlink(marker).then(resolveRemoval, rejectRemoval), 25);
      });
    }
    const replayExecutor = executor(current.plan);
    const replay = await prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: replayExecutor.value } });
    await markerRemoval;
    assert.equal(replay.state, "recovery_required", `${replayPath}: ${JSON.stringify(replay)}`);
    assert.match(replay.errors.join(" "), /request_seed_(?:unsafe_file|identity_unsafe)/u, replayPath);
    assert.equal(replayExecutor.calls.preflight, 0, replayPath);
    assert.equal(replayExecutor.calls.execute, 0, replayPath);
  }
});

test("a newly committed revised plan digest creates a distinct logical review operation", async () => {
  const current = await fixture();
  const reviseExecutor = executor(current.plan, "REVISE");
  const first = await prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: reviseExecutor.value } });
  assert.equal(first.state, "completed", JSON.stringify(first));
  assert.equal(first.disposition, "REVISE");

  const { schemaId: _schemaId, authority: _authority, id: _id, digest: _digest, ...planInput } = current.plan;
  const rebuilt = buildMissionTransitionPlanV1({
    ...planInput,
    boundedOutcome: "Prepare the corrected bounded implementation transition.",
  });
  assert.equal(rebuilt.state, "built", JSON.stringify(rebuilt));
  assert.notEqual(rebuilt.plan.digest, current.plan.digest);
  await writeFile(join(current.root, current.planPath), `${JSON.stringify(rebuilt.plan)}\n`);
  git(current.root, ["add", current.planPath]);
  git(current.root, ["commit", "--quiet", "-m", "revise transition plan"]);

  const passExecutor = executor(rebuilt.plan);
  const second = await prepareReviewedMissionTransitionV1(current.input, { dispatchDependencies: { executor: passExecutor.value } });
  assert.equal(second.state, "materialized", JSON.stringify(second));
  assert.equal(passExecutor.calls.execute, 1);
  const seeds = execFileSync("find", [join(current.root, COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT), "-name", "request-seed.json"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  assert.equal(seeds.length, 2);
});

test("workspace identity is stable across canonical roots for the same repository lane", async () => {
  const left = await fixture();
  const right = await fixture();
  const leftExecutor = executor(left.plan, "REVISE");
  const rightExecutor = executor(right.plan, "REVISE");
  assert.equal((await prepareReviewedMissionTransitionV1(left.input, { dispatchDependencies: { executor: leftExecutor.value } })).state, "completed");
  assert.equal((await prepareReviewedMissionTransitionV1(right.input, { dispatchDependencies: { executor: rightExecutor.value } })).state, "completed");
  const leftSeed = JSON.parse(await readFile(seedPath(left.root), "utf8"));
  const rightSeed = JSON.parse(await readFile(seedPath(right.root), "utf8"));
  assert.notEqual(left.root, right.root);
  assert.equal(leftSeed.request.repositoryWorkspaceId, rightSeed.request.repositoryWorkspaceId);
  assert.notEqual(leftSeed.request.repositoryRoot, rightSeed.request.repositoryRoot);
});


test("concurrent create-once callers share one seed and invoke the model once", async () => {
  const current = await fixture();
  const fake = executor(current.plan);
  const [left, right] = await Promise.all([
    prepareReviewedMissionTransitionV1(current.input, {
      dispatchDependencies: { executor: fake.value },
      now: () => new Date("2026-08-19T12:02:00.000Z"),
    }),
    prepareReviewedMissionTransitionV1(current.input, {
      dispatchDependencies: { executor: fake.value },
      now: () => new Date("2026-08-19T12:03:00.000Z"),
    }),
  ]);
  assert.equal(fake.calls.execute, 1);
  assert.equal(left.state, "materialized", JSON.stringify({ left, right }));
  assert.deepEqual(right, left);
  const seeds = execFileSync("find", [join(current.root, COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT), "-name", "request-seed.json"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  assert.equal(seeds.length, 1);
});

test("cross-process creation converges on one durable seed and one model execution", async () => {
  const current = await fixture();
  const counter = join(current.root, ".shield", "cross-process-executions.txt");
  const held = join(current.root, ".shield", "seed-install-held");
  const observed = join(current.root, ".shield", "seed-install-observed");
  const release = join(current.root, ".shield", "seed-install-release");
  const hostUrl = new URL("../dist/copilot-fury-reviewed-transition-host-v1.mjs", import.meta.url).href;
  const dispatchUrl = new URL("../dist/copilot-fury-plan-dispatch-v1.mjs", import.meta.url).href;
  const source = `
    import { existsSync } from "node:fs";
    import { appendFile, link, lstat } from "node:fs/promises";
    const [hostUrl, dispatchUrl, input64, plan64, counter, role, held, observed, release] = process.argv.slice(1);
    const { prepareReviewedMissionTransitionV1 } = await import(hostUrl);
    const dispatch = await import(dispatchUrl);
    const input = JSON.parse(Buffer.from(input64, "base64url").toString("utf8"));
    const plan = JSON.parse(Buffer.from(plan64, "base64url").toString("utf8"));
    const executor = {
      async preflight() { return { state: "ready", packageVersion: dispatch.COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: dispatch.COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: dispatch.COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID }; },
      async execute(input) {
        await appendFile(counter, "execute\\n");
        return {
          state: "completed",
          outputText: JSON.stringify({ schemaVersion: 1, contractVersion: dispatch.COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION, authority: "none", reviewerSeatId: "fury", reviewedArtifactId: plan.id, reviewedArtifactRevision: plan.digest, verdict: "REVISE", findings: [{ code: "PLAN_NEEDS_REVISION", message: "revise" }] }),
          observations: { sessionStartObserved: true, sessionId: input.configuration.sessionId, selectedAgent: "fury", model: input.configuration.model, assistantModel: input.configuration.model, runtimeId: dispatch.COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: dispatch.COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID, loadedSdkPackageVersion: dispatch.COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, sessionProducer: dispatch.COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID, sessionProducerVersion: "1.0.79", modelChangeObserved: false, agentSubstitutionObserved: false, unauthorizedToolOrEffectObserved: false, policyDecisions: [] },
        };
      },
      async close() {},
    };
    const seedPersistence = {
      async lstatPath(path) {
        const value = await lstat(path);
        if (role === "second" && path.endsWith("request-seed.installing") && !existsSync(observed)) await appendFile(observed, "observed\\n");
        return value;
      },
      async linkPath(existingPath, newPath) {
        if (role === "first" && newPath.endsWith("request-seed.json")) {
          await appendFile(held, "held\\n");
          while (!existsSync(release)) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
        }
        await link(existingPath, newPath);
      },
    };
    const result = await prepareReviewedMissionTransitionV1(input, { dispatchDependencies: { executor }, seedPersistence });
    process.stdout.write(JSON.stringify(result));
  `;
  const args = [
    hostUrl,
    dispatchUrl,
    Buffer.from(JSON.stringify(current.input)).toString("base64url"),
    Buffer.from(JSON.stringify(current.plan)).toString("base64url"),
    counter,
  ];
  const first = runNodeModule(source, [...args, "first", held, observed, release]);
  await Promise.race([
    waitForPath(held, "first process to hold the install marker"),
    first.then((result) => { throw new Error(`first process exited before holding marker: ${JSON.stringify(result)}`); }),
  ]);
  const second = runNodeModule(source, [...args, "second", held, observed, release]);
  await waitForPath(observed, "second process to observe the active install marker");
  await writeFile(release, "release\n");
  const results = await Promise.all([first, second]);
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  const parsed = results.map(({ stdout }) => JSON.parse(stdout));
  for (const result of parsed) {
    assert.equal(result.state, "completed", JSON.stringify(result));
    assert.equal(result.disposition, "REVISE", JSON.stringify(result));
  }
  assert.equal(parsed[1].receiptId, parsed[0].receiptId);
  assert.equal(parsed[1].evidencePath, parsed[0].evidencePath);
  assert.deepEqual(parsed[1].findings, parsed[0].findings);
  assert.deepEqual(new Set(parsed.map(({ replayed }) => replayed)), new Set([false, true]));
  assert.equal((await readFile(counter, "utf8")).trim().split("\n").length, 1);
  const seeds = execFileSync("find", [join(current.root, COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT), "-name", "request-seed.json"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  assert.equal(seeds.length, 1);
  assert.equal(findInstallMarker(current.root), "");
  assert.equal(graphExists(current), false);
});

test("a dispatch beyond the bounded host wait stays pending and eventually replays the exact terminal receipt", async () => {
  const current = await fixture();
  const counter = join(current.root, ".shield", "slow-cross-process-executions.txt");
  const held = join(current.root, ".shield", "slow-dispatch-held");
  const release = join(current.root, ".shield", "slow-dispatch-release");
  const hostUrl = new URL("../dist/copilot-fury-reviewed-transition-host-v1.mjs", import.meta.url).href;
  const dispatchUrl = new URL("../dist/copilot-fury-plan-dispatch-v1.mjs", import.meta.url).href;
  const source = `
    import { existsSync } from "node:fs";
    import { appendFile } from "node:fs/promises";
    const [hostUrl, dispatchUrl, input64, plan64, counter, role, held, release] = process.argv.slice(1);
    const { prepareReviewedMissionTransitionV1 } = await import(hostUrl);
    const dispatch = await import(dispatchUrl);
    const input = JSON.parse(Buffer.from(input64, "base64url").toString("utf8"));
    const plan = JSON.parse(Buffer.from(plan64, "base64url").toString("utf8"));
    const executor = {
      async preflight() { return { state: "ready", packageVersion: dispatch.COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: dispatch.COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: dispatch.COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID }; },
      async execute(input) {
        await appendFile(counter, "execute\\n");
        if (role === "owner") {
          await appendFile(held, "held\\n");
          while (!existsSync(release)) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
        }
        return {
          state: "completed",
          outputText: JSON.stringify({ schemaVersion: 1, contractVersion: dispatch.COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION, authority: "none", reviewerSeatId: "fury", reviewedArtifactId: plan.id, reviewedArtifactRevision: plan.digest, verdict: "REVISE", findings: [{ code: "PLAN_NEEDS_REVISION", message: "revise" }] }),
          observations: { sessionStartObserved: true, sessionId: input.configuration.sessionId, selectedAgent: "fury", model: input.configuration.model, assistantModel: input.configuration.model, runtimeId: dispatch.COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: dispatch.COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID, loadedSdkPackageVersion: dispatch.COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, sessionProducer: dispatch.COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID, sessionProducerVersion: "1.0.79", modelChangeObserved: false, agentSubstitutionObserved: false, unauthorizedToolOrEffectObserved: false, policyDecisions: [] },
        };
      },
      async close() {},
    };
    const result = await prepareReviewedMissionTransitionV1(input, { dispatchDependencies: { executor } });
    process.stdout.write(JSON.stringify(result));
  `;
  const args = [
    hostUrl,
    dispatchUrl,
    Buffer.from(JSON.stringify(current.input)).toString("base64url"),
    Buffer.from(JSON.stringify(current.plan)).toString("base64url"),
    counter,
  ];
  const owner = runNodeModule(source, [...args, "owner", held, release]);
  await Promise.race([
    waitForPath(held, "owner dispatch to begin model execution"),
    owner.then((result) => { throw new Error(`owner process exited before model hold: ${JSON.stringify(result)}`); }),
  ]);
  const observer = await runNodeModule(source, [...args, "observer", held, release]);
  assert.equal(observer.status, 0, observer.stderr);
  const pending = JSON.parse(observer.stdout);
  assert.equal(pending.state, "blocked", JSON.stringify(pending));
  assert.equal(pending.code, "DISPATCH_PENDING", JSON.stringify(pending));
  assert.equal(graphExists(current), false);
  assert.equal((await readFile(counter, "utf8")).trim().split("\n").length, 1);

  await writeFile(release, "release\n");
  const ownerResult = await owner;
  assert.equal(ownerResult.status, 0, ownerResult.stderr);
  const completed = JSON.parse(ownerResult.stdout);
  assert.equal(completed.state, "completed", JSON.stringify(completed));
  assert.equal(completed.disposition, "REVISE", JSON.stringify(completed));

  const replayProcess = await runNodeModule(source, [...args, "replay", held, release]);
  assert.equal(replayProcess.status, 0, replayProcess.stderr);
  const replayed = JSON.parse(replayProcess.stdout);
  assert.equal(replayed.state, "completed", JSON.stringify(replayed));
  assert.equal(replayed.disposition, "REVISE", JSON.stringify(replayed));
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.receiptId, completed.receiptId);
  assert.equal(replayed.evidencePath, completed.evidencePath);
  assert.deepEqual(replayed.findings, completed.findings);
  assert.equal((await readFile(counter, "utf8")).trim().split("\n").length, 1);
  assert.equal(graphExists(current), false);
});

test("both post-PASS checkpoints close every named mutable identity drift without a graph", async () => {
  const drift = {
    HEAD: async (current) => { git(current.root, ["commit", "--quiet", "--allow-empty", "-m", "drift head"]); },
    journal: async (current) => replaceFileWithSameBytes(current.journalPath),
    plan: async (current) => replaceFileWithSameBytes(join(current.root, current.planPath)),
    card: async (current) => replaceFileWithSameBytes(join(current.root, ".github", "agents", "fury.agent.md")),
    seed: async (current) => replaceFileWithSameBytes(seedPath(current.root)),
    receipt: async (current) => replaceFileWithSameBytes(join(current.root, ".shield", "dispatch-receipts.jsonl")),
  };
  for (const checkpoint of ["afterDispatch", "beforeMaterialization"]) {
    for (const [label, mutate] of Object.entries(drift)) {
      const current = await fixture();
      const fake = executor(current.plan);
      const result = await prepareReviewedMissionTransitionV1(current.input, {
        dispatchDependencies: { executor: fake.value },
        [checkpoint]: async () => mutate(current),
      });
      assert.equal(result.state, "recovery_required", `${checkpoint}/${label}: ${JSON.stringify(result)}`);
      assert.equal(result.code, "POST_PASS_REOBSERVATION_FAILED", `${checkpoint}/${label}`);
      assert.equal(graphExists(current), false, `${checkpoint}/${label}`);
    }
  }
});

test("seed and handoff ancestor replacement or aliasing is rejected at every checkpoint", async () => {
  for (const checkpoint of ["beforeDispatch", "afterDispatch", "beforeMaterialization"]) {
    for (const mode of ["replacement", "alias"]) {
      const current = await fixture();
      const fake = executor(current.plan);
      const mutate = async () => {
        const path = seedPath(current.root);
        const directory = dirname(path);
        const moved = `${directory}.${checkpoint}.${mode}.moved`;
        await rename(directory, moved);
        if (mode === "alias") await symlink(moved, directory, "dir");
        else {
          await mkdir(directory, { mode: 0o700 });
          await rename(join(moved, "request-seed.json"), path);
        }
      };
      const result = await prepareReviewedMissionTransitionV1(current.input, {
        dispatchDependencies: { executor: fake.value },
        [checkpoint]: mutate,
      });
      assert.equal(result.state, "recovery_required", `${checkpoint}/${mode}: ${JSON.stringify(result)}`);
      assert.match(result.errors.join(" "), /seed_ancestor|request_seed_ancestor/u, `${checkpoint}/${mode}`);
      assert.equal(graphExists(current), false, `${checkpoint}/${mode}`);
    }
  }

  for (const checkpoint of ["afterDispatch", "beforeMaterialization"]) {
    for (const mode of ["replacement", "alias"]) {
      const current = await fixture();
      const fake = executor(current.plan);
      let handoff;
      const mutate = async () => {
        assert.ok(handoff);
        const directories = new Set([dirname(join(current.root, handoff.transitionPlanPath)), dirname(join(current.root, handoff.reviewArtifactPath))]);
        for (const directory of directories) {
          const moved = `${directory}.${checkpoint}.${mode}.moved`;
          await rename(directory, moved);
          if (mode === "alias") await symlink(moved, directory, "dir");
          else {
            await mkdir(directory, { mode: 0o700 });
            for (const entry of await readdir(moved)) await rename(join(moved, entry), join(directory, entry));
          }
        }
      };
      const result = await prepareReviewedMissionTransitionV1(current.input, {
        dispatchDependencies: { executor: fake.value },
        afterDispatch: async (dispatch) => {
          handoff = dispatch.handoff;
          if (checkpoint === "afterDispatch") await mutate();
        },
        beforeMaterialization: checkpoint === "beforeMaterialization" ? mutate : undefined,
      });
      assert.equal(result.state, "recovery_required", `${checkpoint}/${mode}: ${JSON.stringify(result)}`);
      assert.match(result.errors.join(" "), /ancestor/u, `${checkpoint}/${mode}`);
      assert.equal(graphExists(current), false, `${checkpoint}/${mode}`);
    }
  }
});

test("receipt resolver identity is rebound field by field to the exact derived request", async () => {
  const current = await fixture();
  const fake = executor(current.plan);
  const substitutions = [
    ["receipt", (identity) => ({ ...identity, receiptId: "receipt:substituted" })],
    ["mission", (identity) => ({ ...identity, parentMissionId: "mission:substituted" })],
    ["mission revision", (identity) => ({ ...identity, parentMissionRevision: "sha256:substituted" })],
    ["session", (identity) => ({ ...identity, parentSessionId: "session:substituted" })],
    ["repository", (identity) => ({ ...identity, repositoryId: "RanSolo/substituted" })],
    ["workspace", (identity) => ({ ...identity, repositoryWorkspaceId: "workspace:substituted" })],
    ["HEAD", (identity) => ({ ...identity, repositoryRevision: "f".repeat(40) })],
    ["subject", (identity) => ({ ...identity, subjectId: "issue:substituted" })],
    ["subject revision", (identity) => ({ ...identity, subjectRevision: "sha256:substituted" })],
    ["plan", (identity) => ({ ...identity, artifactId: "transition-plan:substituted" })],
    ["plan revision", (identity) => ({ ...identity, artifactRevision: "sha256:substituted" })],
    ["seat", (identity) => ({ ...identity, accountableSeatId: "may" })],
    ["configured runtime", (identity) => ({ ...identity, configuredRuntime: { ...identity.configuredRuntime, runtimeId: "runtime:substituted" } })],
    ["configured model", (identity) => ({ ...identity, configuredRuntime: { ...identity.configuredRuntime, model: "model:substituted" } })],
    ["requested runtime", (identity) => ({ ...identity, requestedRuntime: { ...identity.requestedRuntime, runtimeId: "runtime:substituted" } })],
    ["requested model", (identity) => ({ ...identity, requestedRuntime: { ...identity.requestedRuntime, model: "model:substituted" } })],
    ["executor", (identity) => ({ ...identity, toolExecution: { ...identity.toolExecution, executorBindingRef: "executor:substituted" } })],
  ];
  let materializations = 0;
  for (const [label, substitute] of substitutions) {
    const result = await prepareReviewedMissionTransitionV1(current.input, {
      dispatchDependencies: { executor: fake.value },
      resolveDispatchIdentity: async (input) => {
        const resolved = await resolveSeatDispatchIdentityByReceiptIdV1(input);
        if (resolved.state === "invalid") return resolved;
        return { state: "resolved", identity: substitute(resolved.identity) };
      },
      materializeReviewedTransition: async () => {
        materializations += 1;
        return { state: "invalid", code: "must_not_materialize", errors: [] };
      },
    });
    assert.equal(result.state, "recovery_required", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.code, "POST_PASS_REOBSERVATION_FAILED", label);
    assert.match(result.errors.join(" "), /dispatch_resolver_identity_mismatch/u, label);
  }
  assert.equal(fake.calls.execute, 1);
  assert.equal(materializations, 0);
});

test("a correlated resolver and valid raw-ledger substitution still cannot rebind the derived request", async () => {
  const current = await fixture();
  const fake = executor(current.plan);
  const substitutions = [
    ["receipt", (identity) => ({ ...identity, receiptId: "receipt:substituted" })],
    ["mission", (identity) => ({ ...identity, parentMissionId: "mission:substituted" })],
    ["mission revision", (identity) => ({ ...identity, parentMissionRevision: "sha256:substituted" })],
    ["session", (identity) => ({ ...identity, parentSessionId: "session:substituted" })],
    ["repository", (identity) => ({ ...identity, repositoryId: "RanSolo/substituted" })],
    ["workspace", (identity) => ({ ...identity, repositoryWorkspaceId: "workspace:substituted" })],
    ["HEAD", (identity) => ({ ...identity, repositoryRevision: "f".repeat(40) })],
    ["subject", (identity) => ({ ...identity, subjectId: "issue:substituted" })],
    ["subject revision", (identity) => ({ ...identity, subjectRevision: "sha256:substituted" })],
    ["plan", (identity) => ({ ...identity, artifactId: "transition-plan:substituted" })],
    ["plan revision", (identity) => ({ ...identity, artifactRevision: "sha256:substituted" })],
    ["seat", (identity) => ({ ...identity, accountableSeatId: "may" })],
    ["configured runtime", (identity) => ({ ...identity, configuredRuntime: { ...identity.configuredRuntime, runtimeId: "runtime:substituted" } })],
    ["configured model", (identity) => ({ ...identity, configuredRuntime: { ...identity.configuredRuntime, model: "model:substituted" } })],
    ["requested runtime", (identity) => ({ ...identity, requestedRuntime: { ...identity.requestedRuntime, runtimeId: "runtime:substituted" } })],
    ["requested model", (identity) => ({ ...identity, requestedRuntime: { ...identity.requestedRuntime, model: "model:substituted" } })],
    ["executor", (identity) => ({ ...identity, toolExecution: { ...identity.toolExecution, executorBindingRef: "executor:substituted" } })],
  ];
  let materializations = 0;
  for (const [label, substitute] of substitutions) {
    const result = await prepareReviewedMissionTransitionV1(current.input, {
      dispatchDependencies: { executor: fake.value },
      resolveDispatchIdentity: async (input) => {
        const resolved = await resolveSeatDispatchIdentityByReceiptIdV1(input);
        return resolved.state === "resolved" ? { state: "resolved", identity: substitute(resolved.identity) } : resolved;
      },
      readDispatchLedgerSnapshot: async (input) => {
        const snapshot = await readSeatDispatchReceiptLedgerSnapshotV1(input);
        if (snapshot.state === "invalid") return snapshot;
        return {
          state: "accepted",
          value: {
            ...snapshot.value,
            entries: snapshot.value.entries.map((entry) => entry.kind === "dispatch.started" ? substitute(entry) : entry),
            projections: snapshot.value.projections.map(substitute),
          },
        };
      },
      materializeReviewedTransition: async () => {
        materializations += 1;
        throw new Error("must_not_materialize");
      },
    });
    assert.equal(result.state, "recovery_required", `${label}: ${JSON.stringify(result)}`);
    assert.match(result.errors.join(" "), /dispatch_receipt_request_binding_mismatch/u, label);
  }
  assert.equal(fake.calls.execute, 1);
  assert.equal(materializations, 0);
  assert.equal(graphExists(current), false);
});

test("receipt replacement immediately before materialization is recovery-required", async () => {
  const current = await fixture();
  const fake = executor(current.plan);
  const ledgerPath = join(current.root, ".shield", "dispatch-receipts.jsonl");
  const result = await prepareReviewedMissionTransitionV1(current.input, {
    dispatchDependencies: { executor: fake.value },
    beforeMaterialization: async () => {
      const bytes = await readFile(ledgerPath);
      await rename(ledgerPath, `${ledgerPath}.replaced`);
      await writeFile(ledgerPath, bytes);
    },
  });
  assert.equal(result.state, "recovery_required", JSON.stringify(result));
  assert.equal(result.code, "POST_PASS_REOBSERVATION_FAILED");
  assert.match(result.errors.join(" "), /dispatch_receipt_replaced_or_changed/u);
});

test("closed host request rejects caller evidence and path aliases before dispatch", async () => {
  const current = await fixture();
  const fake = executor(current.plan);
  for (const input of [
    { ...current.input, verdict: "PASS" },
    { ...current.input, dispatchReceiptId: "receipt:caller" },
    { ...current.input, transitionPlanPath: `./${current.planPath}` },
  ]) {
    const result = await prepareReviewedMissionTransitionV1(input, { dispatchDependencies: { executor: fake.value } });
    assert.equal(result.state, "invalid", JSON.stringify(result));
  }
  assert.equal(fake.calls.preflight, 0);
  assert.equal(fake.calls.execute, 0);
});

test("prepare-next remains a graph-only consumer and creates no review seed or dispatch claim when the graph is absent", async () => {
  const current = await fixture();
  const cli = new URL("../dist/cli.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [cli.pathname, "mission", "prepare-next", "--mission-id", current.missionId, "--json"], {
    cwd: current.root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, result.stdout);
  assert.equal(existsSync(join(current.root, COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT)), false);
  assert.equal(existsSync(join(current.root, ".shield", "dispatch-receipts.jsonl")), false);
  assert.equal(graphExists(current), false);
});
