import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, link, unlink, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  LEGACY_REVIEWED_TRANSITION_SEED_ROOT,
  continueLegacyReviewedTransitionV1,
} from "../dist/legacy-reviewed-transition-v1.mjs";
import {
  COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
  COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
  COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
  COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
} from "../dist/copilot-fury-plan-dispatch-v1.mjs";
import { executeAuthorizeWheelsUpV1 } from "../dist/authorize-wheels-up-executor-v1.mjs";
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { appendProfileAwareMissionEntriesAtomicV1 } from "../dist/mission-store.mjs";
import { canonicalJson, computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import { claimSeatDispatchPacketV1, readSeatDispatchReceiptLedgerSnapshotV1 } from "../dist/seat-dispatch-store.mjs";
import {
  MISSION_130_JOURNAL_DIGEST,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
} from "../dist/profile-aware-mission-v1.mjs";
import { prepareOrRefreshWorktreeStateV2, prepareWorktreeStateV1 } from "../dist/worktree-state-v1.mjs";

const FURY_CARD = `---
name: Fury
description: Review exact SHIELD plans and revisions for technical conformance.
argument-hint: Provide the reviewed artifact and exact revision.
target: vscode
user-invocable: true
disable-model-invocation: true
tools: [read, search]
---

Review only the exact plan and return authority none.
`;

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function binding(seatId, keyPair = generateKeyPairSync("ed25519")) {
  const publicKeySpkiBase64 = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    record: {
      schemaVersion: 1,
      bindingId: `binding:legacy:${seatId}`,
      humanPrincipalId: `human:legacy:${seatId}`,
      seatId,
      missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:legacy-test",
      provenanceRef: `repository-policy:legacy-test:${seatId}`,
    },
    privateKey: keyPair.privateKey,
  };
}

async function fixture({ secondPlan = false, markdownPlan = true } = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-legacy-reviewed-transition-")));
  const source = join(parent, "source");
  const root = join(parent, "lane");
  await mkdir(source);
  git(source, ["init", "--quiet", "-b", "main"]);
  git(source, ["config", "user.email", "shield@example.invalid"]);
  git(source, ["config", "user.name", "SHIELD Fixture"]);
  git(source, ["remote", "add", "origin", "git@github.com:RanSolo/legacy-reviewed-transition-fixture.git"]);
  await mkdir(join(source, ".github", "agents"), { recursive: true });
  await writeFile(join(source, ".gitignore"), ".shield/\n");
  await writeFile(join(source, ".github", "agents", "fury.agent.md"), FURY_CARD);
  await writeFile(join(source, "package.json"), "{\"private\":true}\n");
  await writeFile(join(source, "outside-scope.ts"), "export const implemented = true;\n");
  git(source, ["add", ".gitignore", ".github/agents/fury.agent.md", "package.json", "outside-scope.ts"]);
  git(source, ["commit", "--quiet", "-m", "legacy base"]);
  const baseRevision = git(source, ["rev-parse", "HEAD"]);
  git(source, ["worktree", "add", "--quiet", "-b", "issue-341-lane", root, "HEAD"]);

  const coulson = binding("coulson");
  const fitz = binding("fitz");
  const config = createShieldConfig({
    repositoryId: "RanSolo/legacy-reviewed-transition-fixture",
    coulsonBindingRef: coulson.record.signingKeyRef,
    fitzBindingRef: fitz.record.signingKeyRef,
  });
  await mkdir(join(source, ".shield"));
  await writeFile(join(source, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(join(source, ".shield", "trusted-human-bindings.json"), `${JSON.stringify({ schemaVersion: 1, bindings: [coulson.record, fitz.record] }, null, 2)}\n`);
  const prepared = await prepareWorktreeStateV1({ sourceRoot: await realpath(source), destinationRoot: await realpath(root) });
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));

  const missionId = "mission:issue-341-cold-hill-intake";
  const subjectId = "github:RanSolo/legacy-reviewed-transition-fixture/issue/341";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Continue the exact reviewed implementation without another human gate.",
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
  const begun = createProfileAwareMissionBegunEntry(brief, [coulson.record, fitz.record]);
  const journalPath = join(root, config.paths.journals, `${Buffer.from(missionId).toString("base64url")}.jsonl`);
  await mkdir(dirname(journalPath), { recursive: true });
  await writeFile(journalPath, `${JSON.stringify(begun)}\n`);

  const planPath = markdownPlan ? "docs/missions/issue-341-approved-plan.md" : "docs/missions/issue-341-approved-plan.txt";
  await mkdir(join(root, "docs", "missions"), { recursive: true });
  const planBytes = "# Human-reviewed plan\n\nCaller text must never become executable scope.\n";
  await writeFile(join(root, planPath), planBytes);
  const approvedRelativePaths = [
    ".codex/agents/mack.toml",
    ".codex/config.toml",
    planPath,
    "src/implementation.mts",
  ];
  if (secondPlan) {
    const alternate = "docs/missions/issue-341-alternate.md";
    await writeFile(join(root, alternate), "# Alternate\n");
    approvedRelativePaths.splice(1, 0, alternate);
  }
  approvedRelativePaths.sort((left, right) => left.localeCompare(right));
  git(root, ["add", "docs/missions"]);
  git(root, ["commit", "--quiet", "-m", "approved legacy plan"]);
  const artifactRevision = git(root, ["rev-parse", "HEAD"]);

  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  let status;
  try {
    status = await executeAuthorizeWheelsUpV1({
    root: await realpath(root),
    config,
    missionId,
    intent: {
      baseRevision,
      modelId: "model:may-legacy",
      reasoningRuntimeId: "runtime:legacy-reasoner",
      toolExecutorId: "executor:legacy-tool",
      approvedRelativePaths,
      approvedActionIds: ["action:legacy:implement"],
      approvedEffectClasses: ["behavioral_implementation", "verification"],
      approvedEffectKeys: ["effect:legacy:implementation"],
      approvedCapabilities: ["capability:edit"],
      validationCommandIds: ["validation:legacy:test"],
      publicationPaths: (secondPlan ? ["docs/missions/issue-341-alternate.md", planPath] : [planPath]).sort((left, right) => left.localeCompare(right)),
    },
    timestamp: { value: "2026-08-19T12:01:00.000Z", provenance: "hostTrusted" },
    humanMode: false,
    promptOutput: { write() {} },
    dependencies: {
      renderDecision: () => "",
      readPasscode: async () => "test-only",
      signBatch: async (_binding, _passcode, payloads) => payloads.map((payload) => sign(null, Buffer.from(canonicalJson(payload)), coulson.privateKey).toString("base64")),
      appendBatchAtomic: appendProfileAwareMissionEntriesAtomicV1,
    },
  });
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.equal(status, 0);
  await mkdir(join(root, ".codex", "agents"), { recursive: true });
  await writeFile(join(root, ".codex", "agents", "mack.toml"), 'name = "mack"\n');
  await writeFile(join(root, ".codex", "config.toml"), 'reviewer = "mack"\n');
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "implementation.mts"), "export const implemented = true;\n");
  git(root, ["add", ".codex", "src/implementation.mts"]);
  git(root, ["commit", "--quiet", "-m", "authorized implementation"]);
  const headRevision = git(root, ["rev-parse", "HEAD"]);
  const refreshed = await prepareOrRefreshWorktreeStateV2({ sourceRoot: await realpath(source), destinationRoot: await realpath(root) });
  assert.equal(refreshed.state, "refreshed", JSON.stringify(refreshed));
  return {
    sourceRoot: await realpath(source),
    root: await realpath(root),
    repositoryId: config.repositoryId,
    branch: "issue-341-lane",
    missionId,
    missionRevision: brief.revisionId,
    subjectId,
    brief,
    planPath,
    planBytes,
    approvedRelativePaths,
    baseRevision,
    artifactRevision,
    headRevision,
  };
}

function reviseResult(missionId) {
  return Object.freeze({
    contractVersion: "shield.copilot-fury-plan-dispatch.request.v1",
    authority: "none",
    missionId,
    state: "completed",
    disposition: "REVISE",
    findings: Object.freeze([{ code: "TEST", message: "Revise for fixture." }]),
    receiptId: "receipt:test",
    evidencePath: ".shield/audit/test.json",
    replayed: false,
    handoff: null,
  });
}

function repositoryWorkspaceId(current) {
  return `workspace:reviewed-transition:${createHash("sha256")
    .update(`shield-reviewed-transition-workspace-v1\0${canonicalJson({ repositoryId: current.repositoryId, laneBranch: current.branch })}`)
    .digest("base64url").slice(0, 32)}`;
}

async function createBroadMissionClaim(current) {
  const workspace = repositoryWorkspaceId(current);
  const claimed = await claimSeatDispatchPacketV1({
    repositoryRoot: current.root,
    repositoryId: current.repositoryId,
    repositoryWorkspaceId: workspace,
    lockOwnerId: "claim-owner:legacy-broad-scan",
    parentMissionId: current.missionId,
    parentMissionRevision: current.missionRevision,
    parentSessionId: "session:unrelated-parent",
    accountableSeatId: "fury",
    subjectId: current.subjectId,
    subjectRevision: "sha256:unrelated-subject-revision",
    artifactId: "artifact:unrelated-plan",
    artifactRevision: "sha256:unrelated-artifact-revision",
    repositoryRevision: current.headRevision,
    startedAt: "2026-08-19T12:02:00.000Z",
    configuredRuntime: { kind: "runtime.configured", runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, model: "model:unrelated" },
    requestedRuntime: { kind: "runtime.requested", runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, model: "model:unrelated" },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: { kind: "runtime.host_observed.unavailable", reason: "unobserved" },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: { kind: "executor.host_observed.unavailable", reason: "not_observed" },
    packetId: "packet:unrelated-parent-and-artifact",
    packetBytes: new TextEncoder().encode('{"unrelated":true}'),
    inputEvidenceRefs: [],
  });
  assert.equal(claimed.state, "valid", JSON.stringify(claimed));
  return workspace;
}

function realPassExecutor(root) {
  const calls = { preflight: 0, execute: 0 };
  return {
    calls,
    value: {
      async preflight() {
        calls.preflight += 1;
        return {
          state: "ready",
          packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
          runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
          executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
        };
      },
      async execute(input) {
        calls.execute += 1;
        const seedPath = execFileSync("find", [join(root, LEGACY_REVIEWED_TRANSITION_SEED_ROOT), "-name", "derivation-seed.json"], { encoding: "utf8" }).trim();
        const seed = JSON.parse(await readFile(seedPath, "utf8"));
        const plan = seed.carrier.transitionPlan;
        return {
          state: "completed",
          outputText: JSON.stringify({
            schemaVersion: 1,
            contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
            authority: "none",
            reviewerSeatId: "fury",
            reviewedArtifactId: plan.id,
            reviewedArtifactRevision: plan.digest,
            verdict: "PASS",
            findings: [],
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

function graphExists(current) {
  const token = createHash("sha256").update(current.missionId).digest("hex");
  return existsSync(join(current.root, ".shield", "audit", "mission-preparation", token, "reviewed-transition.json"));
}

test("exact #341 legacy lineage derives one closed fresh_authorize_wheels_up carrier without parsing Markdown or writing a virtual file", async () => {
  const current = await fixture();
  const calls = [];
  const result = await continueLegacyReviewedTransitionV1({ missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" }, {
    reviewedTransitionHost: async (input, carrier) => {
      calls.push({ input, carrier });
      return reviseResult(current.missionId);
    },
  });
  assert.equal(result.state, "completed", JSON.stringify(result));
  assert.equal(result.disposition, "REVISE");
  assert.equal(calls.length, 1);
  const { input, carrier } = calls[0];
  assert.deepEqual(input, { missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" });
  assert.equal(carrier.kind, "legacy_derived");
  assert.equal(carrier.transitionPlan.transitionKind, "fresh_authorize_wheels_up");
  assert.equal(carrier.transitionPlan.boundedOutcome, current.brief.objective);
  assert.equal(carrier.transitionPlan.parentPlanCommit, current.artifactRevision);
  assert.equal(carrier.transitionPlan.parentPlanPath, current.planPath);
  assert.equal(carrier.transitionPlan.parentPlanRawSha256, hash(current.planBytes));
  assert.deepEqual(git(current.root, ["diff", "--name-only", current.baseRevision, current.headRevision]).split("\n"), current.approvedRelativePaths);
  assert.deepEqual(carrier.transitionPlan.approvedRelativePaths, current.approvedRelativePaths);
  assert.deepEqual(current.approvedRelativePaths.slice(0, 2), [".codex/agents/mack.toml", ".codex/config.toml"]);
  assert.equal(carrier.transitionPlanRawSha256, hash(carrier.canonicalPlanBytes));
  assert.equal(carrier.provenance.artifactPlanMode, "100644");
  assert.equal(carrier.provenance.currentPlanMode, "100644");
  assert.equal(carrier.provenance.artifactPlanObjectId, carrier.provenance.currentPlanObjectId);
  assert.match(carrier.virtualPath, /^\.shield\/audit\/legacy-reviewed-transition\/sha256:[A-Za-z0-9_-]{43}\/transition-plan\.json$/u);
  assert.equal(existsSync(join(current.root, carrier.virtualPath)), false);
  const seedRoot = join(current.root, LEGACY_REVIEWED_TRANSITION_SEED_ROOT);
  assert.equal(existsSync(seedRoot), true);
});

test("replacement refs cannot substitute the authorized base, plan artifact, or advanced HEAD observations", async (t) => {
  for (const field of ["baseRevision", "artifactRevision", "headRevision"]) {
    await t.test(field, async () => {
      const current = await fixture();
      const replacementTree = field === "baseRevision" ? current.headRevision : current.baseRevision;
      const replacement = git(current.root, ["commit-tree", `${replacementTree}^{tree}`, "-m", `replacement ${field}`]);
      git(current.root, ["replace", current[field], replacement]);
      const originalTree = git(current.root, ["--no-replace-objects", "rev-parse", `${current[field]}^{tree}`]);
      assert.notEqual(git(current.root, ["rev-parse", `${current[field]}^{tree}`]), originalTree, `${field} replacement must affect ordinary Git observation`);
      let modelEffects = 0;
      const result = await continueLegacyReviewedTransitionV1({ missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" }, {
        reviewedTransitionHost: async () => {
          modelEffects += 1;
          return reviseResult(current.missionId);
        },
      });
      assert.equal(result.state, "completed", `${field}: ${JSON.stringify(result)}`);
      assert.equal(modelEffects, 1, field);
    });
  }
});

test("an outside-scope source renamed to an approved path closes before the reviewed-transition host", async () => {
  const current = await fixture();
  await rename(join(current.root, "outside-scope.ts"), join(current.root, "src", "implementation.mts"));
  git(current.root, ["add", "--all"]);
  git(current.root, ["commit", "--quiet", "-m", "rename outside scope into approved path"]);
  assert.equal((await prepareOrRefreshWorktreeStateV2({ sourceRoot: current.sourceRoot, destinationRoot: current.root })).state, "refreshed");
  assert.match(git(current.root, ["diff", "--name-status", current.baseRevision, "HEAD"]), /^R100\s+outside-scope\.ts\s+src\/implementation\.mts$/mu);
  let modelEffects = 0;
  const result = await continueLegacyReviewedTransitionV1({ missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" }, {
    reviewedTransitionHost: async () => {
      modelEffects += 1;
      return reviseResult(current.missionId);
    },
  });
  assert.deepEqual({ state: result.state, code: result.code }, { state: "invalid", code: "LEGACY_STATE_INELIGIBLE" });
  assert.match(result.errors[0], /advanced_head_scope_mismatch/u);
  assert.equal(modelEffects, 0);
});

test("legacy continuation seed replays the exact carrier and conflicts model drift before another host effect", async () => {
  const current = await fixture();
  const carriers = [];
  const host = async (_input, carrier) => { carriers.push(canonicalJson(carrier)); return reviseResult(current.missionId); };
  const request = { missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" };
  assert.equal((await continueLegacyReviewedTransitionV1(request, { reviewedTransitionHost: host })).state, "completed");
  assert.equal((await continueLegacyReviewedTransitionV1(request, { reviewedTransitionHost: host })).state, "completed");
  assert.equal(carriers.length, 2);
  assert.equal(carriers[0], carriers[1]);
  const drift = await continueLegacyReviewedTransitionV1({ ...request, furyModel: "model:fury-other" }, { reviewedTransitionHost: async () => { throw new Error("must not run"); } });
  assert.deepEqual({ state: drift.state, code: drift.code }, { state: "conflict", code: "LEGACY_SEED_CONFLICT" });
});

test("seed persistence rejects concurrent ancestor substitution around create, link, unlink, and fsync without a host or model effect", async (t) => {
  for (const checkpoint of ["create", "link", "unlink", "fsync"]) {
    for (const mode of ["replacement", "alias"]) {
      await t.test(`${checkpoint}/${mode}`, async () => {
        const current = await fixture();
        let substituted = false;
        let modelEffects = 0;
        const handlePaths = new WeakMap();
        const substitute = async (directory) => {
          if (substituted) return;
          substituted = true;
          const moved = `${directory}.${checkpoint}.${mode}.moved`;
          await rename(directory, moved);
          if (mode === "alias") await symlink(moved, directory, "dir");
          else await mkdir(directory, { mode: 0o700 });
        };
        const seedPersistence = {
          openPath: async (path, flags, modeBits) => {
            if (checkpoint === "create" && path.endsWith("derivation-seed.installing")) await substitute(dirname(path));
            const handle = await open(path, flags, modeBits);
            handlePaths.set(handle, path);
            return handle;
          },
          linkPath: async (existingPath, newPath) => {
            if (checkpoint === "link" && newPath.endsWith("derivation-seed.json")) await substitute(dirname(newPath));
            await link(existingPath, newPath);
          },
          unlinkPath: async (path) => {
            if (checkpoint === "unlink" && path.endsWith("derivation-seed.installing")) await substitute(dirname(path));
            await unlink(path);
          },
          syncDirectoryHandle: async (handle) => {
            const path = handlePaths.get(handle);
            if (checkpoint === "fsync" && typeof path === "string" && existsSync(join(path, "derivation-seed.installing")) && existsSync(join(path, "derivation-seed.json"))) {
              await substitute(path);
            }
            await handle.sync();
          },
          lstatPath: lstat,
        };
        const result = await continueLegacyReviewedTransitionV1({ missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" }, {
          seedPersistence,
          reviewedTransitionHost: async () => {
            modelEffects += 1;
            return reviseResult(current.missionId);
          },
        });
        assert.equal(substituted, true, `${checkpoint}/${mode}`);
        assert.equal(result.state, "recovery_required", `${checkpoint}/${mode}: ${JSON.stringify(result)}`);
        assert.match(result.errors.join(" "), /legacy_seed_(?:ancestor|directory)|ENOENT/u, `${checkpoint}/${mode}`);
        assert.equal(modelEffects, 0, `${checkpoint}/${mode}`);
      });
    }
  }
});

test("zero or multiple legacy Markdown candidates and dirty or hard-linked current plans fail before the reviewed-transition host", async (t) => {
  await t.test("zero", async () => {
    const current = await fixture({ markdownPlan: false });
    const result = await continueLegacyReviewedTransitionV1({ missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury" }, { reviewedTransitionHost: async () => { throw new Error("must not run"); } });
    assert.deepEqual({ state: result.state, code: result.code }, { state: "invalid", code: "LEGACY_STATE_INELIGIBLE" });
    assert.match(result.errors[0], /legacy_plan_candidate_missing_or_ambiguous/u);
  });
  await t.test("multiple", async () => {
    const current = await fixture({ secondPlan: true });
    const result = await continueLegacyReviewedTransitionV1({ missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury" }, { reviewedTransitionHost: async () => { throw new Error("must not run"); } });
    assert.deepEqual({ state: result.state, code: result.code }, { state: "invalid", code: "LEGACY_STATE_INELIGIBLE" });
    assert.match(result.errors[0], /legacy_plan_candidate_missing_or_ambiguous/u);
  });
  await t.test("dirty", async () => {
    const current = await fixture();
    await writeFile(join(current.root, "src", "implementation.mts"), "dirty\n");
    const result = await continueLegacyReviewedTransitionV1({ missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury" });
    assert.match(result.errors[0], /workspace_dirty/u);
  });
  await t.test("hardlink", async () => {
    const current = await fixture();
    const outside = join(dirname(current.root), "plan-hardlink.md");
    await link(join(current.root, current.planPath), outside);
    await unlink(join(current.root, current.planPath));
    await link(outside, join(current.root, current.planPath));
    const result = await continueLegacyReviewedTransitionV1({ missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury" });
    assert.match(result.errors[0], /legacy_plan_current_unsafe/u);
  });
});

test("post-authority legacy-plan content and mode changes fail before either seed or host effect", async (t) => {
  for (const mutation of ["content", "mode"]) {
    await t.test(mutation, async () => {
      const current = await fixture();
      const path = join(current.root, current.planPath);
      if (mutation === "content") {
        await writeFile(path, `${current.planBytes}\npost-authority change\n`);
        git(current.root, ["add", current.planPath]);
      } else {
        await chmod(path, 0o755);
        git(current.root, ["update-index", "--chmod=+x", current.planPath]);
      }
      git(current.root, ["commit", "--quiet", "-m", `post-authority legacy plan ${mutation}`]);
      assert.equal((await prepareOrRefreshWorktreeStateV2({ sourceRoot: current.sourceRoot, destinationRoot: current.root })).state, "refreshed");
      let hostEffects = 0;
      const result = await continueLegacyReviewedTransitionV1(
        { missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" },
        { reviewedTransitionHost: async () => { hostEffects += 1; return reviseResult(current.missionId); } },
      );
      assert.deepEqual({ state: result.state, code: result.code }, { state: "invalid", code: "LEGACY_STATE_INELIGIBLE" });
      assert.match(result.errors.join(" "), /legacy_plan_artifact_head_mismatch/u);
      assert.equal(hostEffects, 0);
      assert.equal(existsSync(join(current.root, LEGACY_REVIEWED_TRANSITION_SEED_ROOT)), false);
    });
  }
});

test("broad mission claim without a derivation seed is recovery-required regardless of parent session or artifact", async () => {
  const current = await fixture();
  await createBroadMissionClaim(current);
  let hostEffects = 0;
  const result = await continueLegacyReviewedTransitionV1(
    { missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" },
    { reviewedTransitionHost: async () => { hostEffects += 1; return reviseResult(current.missionId); } },
  );
  assert.deepEqual({ state: result.state, code: result.code }, { state: "recovery_required", code: "LEGACY_SEED_MISSING_AFTER_CLAIM" });
  assert.equal(hostEffects, 0);
  assert.equal(existsSync(join(current.root, LEGACY_REVIEWED_TRANSITION_SEED_ROOT)), false);
});

test("broad mission claim without a request seed is recovery-required on the real derived-source host path", async () => {
  const current = await fixture();
  const input = { missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" };
  assert.equal((await continueLegacyReviewedTransitionV1(input, { reviewedTransitionHost: async () => reviseResult(current.missionId) })).state, "completed");
  await createBroadMissionClaim(current);
  const fake = realPassExecutor(current.root);
  const result = await continueLegacyReviewedTransitionV1(input, {
    reviewedTransitionDependencies: { dispatchDependencies: { executor: fake.value } },
  });
  assert.deepEqual({ state: result.state, code: result.code }, { state: "recovery_required", code: "REQUEST_SEED_MISSING_AFTER_CLAIM" });
  assert.equal(fake.calls.preflight, 0);
  assert.equal(fake.calls.execute, 0);
  assert.equal(graphExists(current), false);
});

test("real derived-source host claims, records PASS, and materializes exactly once", async () => {
  const current = await fixture();
  const fake = realPassExecutor(current.root);
  const result = await continueLegacyReviewedTransitionV1(
    { missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" },
    {
      reviewedTransitionDependencies: {
        dispatchDependencies: { executor: fake.value },
        now: () => new Date("2026-08-19T12:02:00.000Z"),
      },
    },
  );
  assert.equal(result.state, "materialized", JSON.stringify(result));
  assert.equal(fake.calls.execute, 1);
  const ledger = await readSeatDispatchReceiptLedgerSnapshotV1({
    repositoryRoot: current.root,
    repositoryId: current.repositoryId,
    repositoryWorkspaceId: repositoryWorkspaceId(current),
  });
  assert.equal(ledger.state, "valid", JSON.stringify(ledger));
  assert.equal(ledger.value.projections.length, 1);
  assert.equal(ledger.value.projections[0].state, "completed");
  assert.equal(graphExists(current), true);
});

test("pre-materialization provenance drift blocks the real PASS handoff before graph creation", async () => {
  const current = await fixture();
  const fake = realPassExecutor(current.root);
  const result = await continueLegacyReviewedTransitionV1(
    { missionId: current.missionId, repositoryRoot: current.root, furyModel: "model:fury-review" },
    {
      reviewedTransitionDependencies: {
        dispatchDependencies: { executor: fake.value },
        now: () => new Date("2026-08-19T12:02:00.000Z"),
        beforeMaterialization: async () => {
          await writeFile(join(current.root, "src", "implementation.mts"), "export const implemented = 'drifted';\n");
          git(current.root, ["add", "src/implementation.mts"]);
          git(current.root, ["commit", "--quiet", "-m", "pre-materialization provenance drift"]);
          assert.equal((await prepareOrRefreshWorktreeStateV2({ sourceRoot: current.sourceRoot, destinationRoot: current.root })).state, "refreshed");
        },
      },
    },
  );
  assert.deepEqual({ state: result.state, code: result.code }, { state: "recovery_required", code: "LEGACY_POST_DISPATCH_REOBSERVATION_FAILED" });
  assert.equal(fake.calls.execute, 1);
  assert.equal(graphExists(current), false);
});

test("legacy continuation input is closed and rejects caller plan, scope, verdict, receipt, runtime, and authority fields", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield-legacy-closed-input-")));
  for (const field of ["transitionPlanPath", "approvedRelativePaths", "verdict", "dispatchReceiptId", "reasoningRuntimeId", "authority"]) {
    const result = await continueLegacyReviewedTransitionV1({ missionId: "mission:issue-341", repositoryRoot: root, furyModel: "model:fury", [field]: "caller" });
    assert.deepEqual({ state: result.state, code: result.code }, { state: "invalid", code: "MALFORMED_LEGACY_CONTINUATION_REQUEST" });
  }
});
