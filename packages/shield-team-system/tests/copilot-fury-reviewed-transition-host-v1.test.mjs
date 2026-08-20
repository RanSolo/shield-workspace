import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  COPILOT_FURY_REVIEWED_TRANSITION_REPAIR_LIMIT,
  COPILOT_FURY_REVIEWED_TRANSITION_SEED_ROOT,
  prepareReviewedMissionTransitionV1,
} from "../dist/copilot-fury-reviewed-transition-host-v1.mjs";
import {
  COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
  COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
  COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
  COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
} from "../dist/copilot-fury-plan-dispatch-v1.mjs";
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { buildMissionTransitionPlanV1 } from "../dist/mission-builder-v1.mjs";
import { resolveSeatDispatchIdentityByReceiptIdV1 } from "../dist/mission-preparation-host-v1.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
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
  return {
    root: await realpath(root),
    missionId,
    plan: built.plan,
    planPath,
    input: { missionId, repositoryRoot: await realpath(root), transitionPlanPath: planPath, furyModel: "model:fury" },
  };
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

  const conflictingExecutor = executor(current.plan);
  const conflict = await prepareReviewedMissionTransitionV1({ ...current.input, furyModel: "model:other-fury" }, { dispatchDependencies: { executor: conflictingExecutor.value } });
  assert.equal(conflict.state, "conflict", JSON.stringify(conflict));
  assert.equal(conflict.code, "REQUEST_SEED_CONFLICT");
  assert.equal(conflictingExecutor.calls.preflight, 0);
  assert.equal(conflictingExecutor.calls.execute, 0);
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

test("post-PASS repository drift closes before graph materialization", async () => {
  const current = await fixture();
  const fake = executor(current.plan);
  const result = await prepareReviewedMissionTransitionV1(current.input, {
    dispatchDependencies: { executor: fake.value },
    afterDispatch: async () => writeFile(join(current.root, "drift.txt"), "drift\n"),
  });
  assert.equal(result.state, "recovery_required", JSON.stringify(result));
  assert.equal(result.code, "POST_PASS_REOBSERVATION_FAILED");
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
