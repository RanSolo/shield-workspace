import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, link, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  computeCanonicalContractDigestV1,
  computeContentIdV1,
} from "@shield/mission-preparation";
import {
  MISSION_REVIEWED_TRANSITION_GRAPH_ID_PREFIX,
  MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID,
  MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_VERSION,
  MISSION_REVIEWED_TRANSITION_GRAPH_FILE,
  buildMissionReviewedTransitionGraphV1,
  computeMissionReviewedTransitionGraphDigestV1,
  computeMissionReviewedTransitionGraphIdV1,
  deriveMissionReviewedTransitionGraphMaterializationPathV1,
  validateMissionReviewedTransitionGraphV1,
  materializeMissionReviewedTransitionGraphV1,
  readMissionReviewedTransitionGraphV1,
  readMissionReviewedTransitionGraphV1ForTest,
} from "../dist/mission-preparation-store-v1.mjs";
import { canonicalJson } from "../dist/mission-v2.mjs";

const EXCLUSIONS = ["review.comment.publish", "review.pull_request.update_draft", "review.pull_request.mark_ready", "merge", "deployment", "release", "final_acceptance"];

function contract(value, schemaId) {
  const artifact = {
    schemaId,
    authority: "none",
    ...value,
  };
  const digestResult = computeCanonicalContractDigestV1({ schemaId, body: artifact });
  assert.equal(digestResult.state, "valid");
  const idResult = computeContentIdV1({ schemaId, digest: digestResult.value });
  assert.equal(idResult.state, "valid");
  return {
    schemaId,
    authority: "none",
    ...value,
    id: idResult.value,
    digest: digestResult.value,
  };
}

function transitionPlan(overrides = {}) {
  return contract({
    missionId: "mission:issue-270",
    subjectId: "issue:270",
    repositoryId: "RanSolo/shield-workspace",
    planningBaseRevision: "1111111111111111111111111111111111111111",
    parentPlanCommit: "2222222222222222222222222222222222222222",
    parentPlanPath: "missions/issue-270/plan.json",
    parentPlanRawSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    transitionKind: "fresh_authorize_wheels_up",
    boundedOutcome: "Authorize wheels up transition for issue 270.",
    approvedRelativePaths: ["src/mission.ts"],
    publicationPaths: ["docs/issue-270.md"],
    approvedActionIds: ["action:issue-270"],
    approvedEffectClasses: ["behavioral_implementation"],
    approvedEffectKeys: ["effect:issue-270"],
    approvedCapabilities: ["capability:issue-270"],
    validationCommandIds: ["validation:issue-270"],
    modelId: "model:issue-270",
    reasoningRuntimeId: "runtime:issue-270",
    toolExecutorId: "executor:issue-270",
    exclusions: EXCLUSIONS,
    ...overrides,
  }, "mission.transition-plan.v1");
}

function enrichedTransitionPlan(overrides = {}) {
  const legacy = transitionPlan();
  const { id: _legacyId, digest: _legacyDigest, schemaId: _legacySchema, ...legacyBody } = legacy;
  const template = contract({
    schemaVersion: 2, missionId: legacy.missionId, objective: legacy.boundedOutcome, subjectId: legacy.subjectId,
    riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false },
    participants: [{ seatId: "coulson" }, { seatId: "may" }], activatedModes: [{ modeId: "delivery", modeVersion: "1", seatId: "may", activationSource: "hill_reviewed" }],
    requireSimmons: false, createdAt: { value: "2026-08-13T12:00:00Z", provenance: "humanRecorded" }, profileId: "standard", profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"], requiredFinalAcceptanceGateRoleIds: ["coulson"], predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: `sha256:${"a".repeat(64)}`,
  }, "mission.profile-aware-intake-template.v1");
  return contract({ ...legacyBody, intakeTemplate: template, ...overrides }, "mission.transition-plan.v2");
}

function parentPlanReviewEvidence(plan, overrides = {}) {
  return contract({
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    parentPlanCommit: plan.parentPlanCommit,
    parentPlanPath: plan.parentPlanPath,
    parentPlanRawSha256: plan.parentPlanRawSha256,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    verdict: "PASS",
    reviewerSeatId: "fury",
    reviewerRuntimeId: "runtime:reviewer-270-a",
    reviewerModelId: "model:reviewer-270",
    reviewerExecutorId: "executor:reviewer-270",
    rawReceiptSetSha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    attributionClass: "team_system_projection",
    preparationEligibility: "preparationEligible",
    ...overrides,
  }, "mission.parent-plan-review-evidence.v1");
}

function transitionIntent(plan, review, overrides = {}) {
  return contract({
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    parentReviewEvidenceId: review.id,
    parentReviewEvidenceDigest: review.digest,
    transitionKind: "fresh_authorize_wheels_up",
    preparationEligibility: "preparationEligible",
    ...overrides,
  }, "mission.transition-intent.v1");
}

function graphInput() {
  const transition = transitionPlan();
  const review = parentPlanReviewEvidence(transition);
  return {
    transitionPlan: transition,
    parentPlanReviewEvidence: review,
    transitionIntent: transitionIntent(transition, review),
  };
}

function graphInputForMissionId(missionId, overrides = {}) {
  const transition = transitionPlan({ missionId, ...overrides.transitionPlan });
  const review = parentPlanReviewEvidence(transition, overrides.review);
  const intent = transitionIntent(transition, review, overrides.intent);
  return {
    transitionPlan: transition,
    parentPlanReviewEvidence: review,
    transitionIntent: intent,
  };
}

async function withMaterializationRoot(prefix = "shield-mps-270-") {
  return mkdtemp(join(tmpdir(), prefix));
}

function cloneStatsWithMutation(stats, mutate) {
  const clone = Object.create(Object.getPrototypeOf(stats));
  Object.defineProperties(clone, Object.getOwnPropertyDescriptors(stats));
  mutate(clone);
  return clone;
}

function materializationInput(repositoryRoot, graph) {
  return { repositoryRoot, graph };
}

test("build and validate mission reviewed transition graph snapshots are frozen and deterministic", () => {
  const input = graphInput();
  const built = buildMissionReviewedTransitionGraphV1(input);
  assert.equal(built.state, "built");

  const expectedDigest = computeMissionReviewedTransitionGraphDigestV1({
    schemaVersion: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_VERSION,
    schemaId: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID,
    authority: "none",
    transitionPlan: input.transitionPlan,
    parentPlanReviewEvidence: input.parentPlanReviewEvidence,
    transitionIntent: input.transitionIntent,
  });
  assert.equal(built.graph.graphDigest, expectedDigest);
  assert.equal(built.graph.graphId, computeMissionReviewedTransitionGraphIdV1(expectedDigest));
  assert.equal(built.graph.graphId.startsWith(MISSION_REVIEWED_TRANSITION_GRAPH_ID_PREFIX), true);

  assert.ok(Object.isFrozen(built.graph));
  assert.ok(Object.isFrozen(built.graph.transitionPlan));
  assert.ok(Object.isFrozen(built.graph.parentPlanReviewEvidence));
  assert.ok(Object.isFrozen(built.graph.transitionIntent));

  input.transitionPlan.subjectId = "issue:mutated";
  assert.equal(built.graph.transitionPlan.subjectId, "issue:270");

  const validated = validateMissionReviewedTransitionGraphV1(built.graph);
  assert.equal(validated.state, "valid");
  assert.deepEqual(validated.value, built.graph);
  assert.ok(Object.isFrozen(validated.value));
});

test("reviewed graph digest covers the complete enriched intake template while legacy bytes remain valid", () => {
  const transition = enrichedTransitionPlan();
  const review = parentPlanReviewEvidence(transition);
  const built = buildMissionReviewedTransitionGraphV1({ transitionPlan: transition, parentPlanReviewEvidence: review, transitionIntent: transitionIntent(transition, review) });
  assert.equal(built.state, "built", built.errors?.join(" "));
  assert.equal(validateMissionReviewedTransitionGraphV1(built.graph).state, "valid");
  const { id: _templateId, digest: _templateDigest, schemaId: _templateSchema, authority: _templateAuthority, ...templateBody } = transition.intakeTemplate;
  const changed = enrichedTransitionPlan({ intakeTemplate: contract({ ...templateBody, riskFlags: { ...transition.intakeTemplate.riskFlags, deploy: true } }, "mission.profile-aware-intake-template.v1") });
  assert.notEqual(changed.digest, transition.digest);
  const changedReview = parentPlanReviewEvidence(changed);
  const changedGraph = buildMissionReviewedTransitionGraphV1({ transitionPlan: changed, parentPlanReviewEvidence: changedReview, transitionIntent: transitionIntent(changed, changedReview) });
  assert.equal(changedGraph.state, "built");
  assert.notEqual(changedGraph.graph.graphDigest, built.graph.graphDigest);
  assert.equal(validateMissionReviewedTransitionGraphV1(buildMissionReviewedTransitionGraphV1(graphInput()).graph).state, "valid");
});

test("build rejects hostile graph input and never evaluates malicious accessors", () => {
  const accessorInput = graphInput();
  let getterCalls = 0;
  Object.defineProperty(accessorInput, "transitionPlan", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return graphInput().transitionPlan;
    },
  });
  assert.equal(buildMissionReviewedTransitionGraphV1(accessorInput).code, "malformed_reviewed_transition_graph_input");
  assert.equal(getterCalls, 0);

  assert.equal(buildMissionReviewedTransitionGraphV1({ ...graphInput(), extra: true }).code, "malformed_reviewed_transition_graph_input");
  assert.equal(buildMissionReviewedTransitionGraphV1(new Proxy(graphInput(), {})).code, "malformed_reviewed_transition_graph_input");

  const valid = buildMissionReviewedTransitionGraphV1(graphInput());
  assert.equal(valid.state, "built");
  const candidate = {
    ...valid.graph,
    transitionPlan: transitionPlan({ missionId: "issue:tamper" }),
  };
  assert.equal(validateMissionReviewedTransitionGraphV1(candidate).state, "invalid");
  assert.equal(candidate.transitionPlan.missionId, "issue:tamper");
  assert.equal(validateMissionReviewedTransitionGraphV1(candidate).errors.includes("transition_plan_and_intent_identity_mismatch"), true);

  let validateGetterCalls = 0;
  const validateInput = {
    ...valid.graph,
    transitionIntent: {
      ...valid.graph.transitionIntent,
    },
  };
  Object.defineProperty(validateInput.transitionIntent, "parentReviewEvidenceId", {
    enumerable: true,
    get() {
      validateGetterCalls += 1;
      return valid.graph.transitionIntent.parentReviewEvidenceId;
    },
  });
  assert.equal(validateMissionReviewedTransitionGraphV1(validateInput).state, "invalid");
  assert.equal(validateGetterCalls, 0);
});

test("cross-binding mismatch is rejected before any identity trust is recomputed", () => {
  const wrongIntent = graphInput();
  const alternatePlan = transitionPlan({ missionId: "mission:other-270" });
  const alternateReview = parentPlanReviewEvidence(alternatePlan);
  wrongIntent.transitionIntent = transitionIntent(alternatePlan, alternateReview);
  const badIntent = buildMissionReviewedTransitionGraphV1(wrongIntent);
  assert.equal(badIntent.state, "invalid");
  assert.equal(badIntent.errors.includes("transition_plan_and_intent_identity_mismatch"), true);

  const wrongReview = graphInput();
  wrongReview.parentPlanReviewEvidence = parentPlanReviewEvidence(wrongReview.transitionPlan, {
    transitionPlanDigest: `sha256:${"c".repeat(43)}`,
  });
  const badReview = buildMissionReviewedTransitionGraphV1(wrongReview);
  assert.equal(badReview.state, "invalid");
  assert.equal(badReview.errors.includes("parent_review_transition_plan_reference_mismatch"), true);

  const wrongOutcome = graphInput();
  wrongOutcome.parentPlanReviewEvidence = parentPlanReviewEvidence(wrongOutcome.transitionPlan, {
    verdict: "PASS_WITH_REQUIRED_CHANGES",
  });
  wrongOutcome.transitionIntent = transitionIntent(wrongOutcome.transitionPlan, wrongOutcome.parentPlanReviewEvidence);
  const badOutcome = buildMissionReviewedTransitionGraphV1(wrongOutcome);
  assert.equal(badOutcome.state, "invalid");
  assert.equal(badOutcome.errors.includes("parent_review_projection_mismatch"), true);
});

test("validation rejects stale or corrupted graph identity and identity tamper", () => {
  const built = buildMissionReviewedTransitionGraphV1(graphInput());
  assert.equal(built.state, "built");
  const graph = built.graph;

  const badDigest = validateMissionReviewedTransitionGraphV1({
    ...graph,
    graphDigest: `${graph.graphDigest.slice(0, -1)}a`,
  });
  assert.equal(badDigest.state, "invalid");
  assert.equal(badDigest.errors.includes("Mission reviewed transition graph digest is invalid."), true);

  const badId = validateMissionReviewedTransitionGraphV1({
    ...graph,
    graphId: `${graph.graphId.slice(0, -1)}a`,
  });
  assert.equal(badId.state, "invalid");
  assert.equal(badId.errors.includes("Mission reviewed transition graph identity is invalid."), true);

  const staleBinding = validateMissionReviewedTransitionGraphV1({
    ...graph,
    transitionIntent: transitionIntent(graph.transitionPlan, graph.parentPlanReviewEvidence, {
      parentReviewEvidenceId: `${graph.transitionIntent.parentReviewEvidenceId.slice(0, -1)}a`,
    }),
  });
  assert.equal(staleBinding.state, "invalid");
  assert.equal(staleBinding.errors.includes("parent_review_projection_mismatch"), true);
});

test("validated results are immutable snapshots and do not share mutable input", () => {
  const input = graphInput();
  const built = buildMissionReviewedTransitionGraphV1(input);
  assert.equal(built.state, "built");
  assert.throws(() => {
    built.graph.transitionIntent.transitionKind = "authorize-wheels-up";
  }, TypeError);

  const result = validateMissionReviewedTransitionGraphV1(built.graph);
  assert.equal(result.state, "valid");
  input.parentPlanReviewEvidence.verdict = "FAIL";
  assert.equal(result.state, "valid");
  assert.equal(result.value.parentPlanReviewEvidence.verdict, "PASS");
});

test("deriveMissionReviewedTransitionGraphMaterializationPathV1 uses mission-id digest and scoped directories", () => {
  const missionId = "mission:issue-270";
  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1("/tmp/repo-issue-270", missionId);

  assert.equal(paths.missionIdDigest, createHash("sha256").update(missionId, "utf8").digest("hex"));
  assert.equal(paths.repositoryRoot, "/tmp/repo-issue-270");
  assert.equal(paths.shieldDirectory.endsWith(".shield"), true);
  assert.equal(paths.auditDirectory.endsWith(".shield/audit"), true);
  assert.equal(paths.missionPreparationDirectory.endsWith(".shield/audit/mission-preparation"), true);
  assert.equal(paths.missionDirectory.endsWith(`.shield/audit/mission-preparation/${paths.missionIdDigest}`), true);
  assert.equal(paths.graphPath, join(paths.missionDirectory, MISSION_REVIEWED_TRANSITION_GRAPH_FILE));
});

test("materialize tolerates conventional preexisting .shield directory mode", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  const resolvedRoot = await realpath(repositoryRoot);
  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(resolvedRoot, "mission:issue-270");
  await mkdir(paths.shieldDirectory, { mode: 0o755 });

  try {
    const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
    assert.equal(result.state, "materialized");
    assert.equal(result.graphPath.endsWith(paths.graphPath), true);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("materialize creates durable directories with exact modes and writes 600 final bytes", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  const resolvedRoot = await realpath(repositoryRoot);
  const derived = deriveMissionReviewedTransitionGraphMaterializationPathV1(resolvedRoot, "mission:issue-270");

  try {
    const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
    assert.equal(result.state, "materialized");
    assert.equal(result.graphPath.endsWith(derived.graphPath), true);
    assert.equal(result.graphId, built.graph.graphId);
    assert.equal(result.graphDigest, built.graph.graphDigest);

    const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(repositoryRoot, "mission:issue-270");
    const missionDirectoryStats = await lstat(paths.missionDirectory);
    const auditStats = await lstat(paths.missionPreparationDirectory);
    assert.equal((missionDirectoryStats.mode & 0o777), 0o700);
    assert.equal((auditStats.mode & 0o777), 0o700);
    const graphStats = await lstat(result.graphPath);
    assert.equal(graphStats.nlink, 1);
    assert.equal((graphStats.mode & 0o777), 0o600);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("materialize is idempotent and reports already_materialized", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  try {
    const first = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
    assert.equal(first.state, "materialized");

    const second = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
    assert.equal(second.state, "already_materialized");
    assert.equal(second.graphId, built.graph.graphId);
    assert.equal(second.graphDigest, built.graph.graphDigest);
    assert.equal(first.graphPath, second.graphPath);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("protected reader returns only exact canonical bytes from anchored protected directories", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  try {
    const materialized = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
    assert.equal(materialized.state, "materialized");
    const read = await readMissionReviewedTransitionGraphV1({ repositoryRoot, missionId: "mission:issue-270" });
    assert.equal(read.state, "read", JSON.stringify(read));
    assert.equal(read.bytes, canonicalJson(built.graph));
    assert.deepEqual(read.graph, built.graph);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("protected reader rejects hostile closed-data input without invoking accessors", async () => {
  let getterCalls = 0;
  const input = { missionId: "mission:issue-270", repositoryRoot: "/tmp" };
  Object.defineProperty(input, "missionId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "mission:issue-270";
    },
  });
  const accessor = await readMissionReviewedTransitionGraphV1(input);
  assert.equal(accessor.state, "invalid");
  assert.equal(accessor.code, "reviewed_transition_graph_unavailable");
  assert.equal(getterCalls, 0);

  const proxy = await readMissionReviewedTransitionGraphV1(new Proxy({ missionId: "mission:issue-270", repositoryRoot: "/tmp" }, {}));
  assert.equal(proxy.state, "invalid");
  assert.equal(proxy.code, "reviewed_transition_graph_unavailable");
});

test("protected reader rejects partial, noncanonical, and unsafe-mode artifacts", async () => {
  for (const mutation of ["partial", "noncanonical", "directory-mode"]) {
    const repositoryRoot = await withMaterializationRoot();
    const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
    assert.equal(built.state, "built");
    try {
      const materialized = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
      assert.equal(materialized.state, "materialized");
      const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(await realpath(repositoryRoot), "mission:issue-270");
      if (mutation === "partial") await writeFile(paths.graphPath, canonicalJson(built.graph).slice(0, -1), { mode: 0o600 });
      if (mutation === "noncanonical") await writeFile(paths.graphPath, `${canonicalJson(built.graph)}\n`, { mode: 0o600 });
      if (mutation === "directory-mode") await chmod(paths.auditDirectory, 0o755);

      const read = await readMissionReviewedTransitionGraphV1({ repositoryRoot, missionId: "mission:issue-270" });
      assert.equal(read.state, "invalid", mutation);
      assert.equal(read.code, "reviewed_transition_graph_unavailable", mutation);
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  }
});

test("protected reader rejects file, root, and directory identity or metadata mutation plus close uncertainty", async () => {
  for (const mutation of [
    "file-replaced", "file-mutated", "file-inode-mutated", "file-mode-mutated", "file-link-mutated", "file-time-mutated",
    "root-replaced", "root-metadata-mutated", "root-realpath-replaced", "directory-replaced", "directory-metadata-mutated", "close-uncertain",
  ]) {
    const repositoryRoot = await withMaterializationRoot();
    const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
    assert.equal(built.state, "built");
    try {
      const materialized = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
      assert.equal(materialized.state, "materialized");
      const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(await realpath(repositoryRoot), "mission:issue-270");
      let graphLstatCalls = 0;
      let missionDirectoryLstatCalls = 0;
      let rootLstatCalls = 0;
      let rootRealpathCalls = 0;
      let handleStatCalls = 0;
      let closeCalls = 0;
      const read = await readMissionReviewedTransitionGraphV1ForTest(
        { repositoryRoot, missionId: "mission:issue-270" },
        {
          lstatPath: async (path) => {
            const stats = await lstat(path);
            if (path === repositoryRoot || path === paths.repositoryRoot) {
              rootLstatCalls += 1;
              if (mutation === "root-replaced" && rootLstatCalls === 3) {
                return cloneStatsWithMutation(stats, (changed) => {
                  changed.ino = typeof changed.ino === "bigint" ? changed.ino + 1n : changed.ino + 1;
                });
              }
              if (mutation === "root-metadata-mutated" && rootLstatCalls === 3) {
                return cloneStatsWithMutation(stats, (changed) => { changed.ctimeMs += 1; });
              }
            }
            if (path === paths.graphPath) {
              graphLstatCalls += 1;
              if (mutation === "file-replaced" && graphLstatCalls === 2) {
                return cloneStatsWithMutation(stats, (changed) => {
                  changed.ino = typeof changed.ino === "bigint" ? changed.ino + 1n : changed.ino + 1;
                });
              }
            }
            if (path === paths.missionDirectory) {
              missionDirectoryLstatCalls += 1;
              if (mutation === "directory-replaced" && missionDirectoryLstatCalls === 2) {
                return cloneStatsWithMutation(stats, (changed) => {
                  changed.ino = typeof changed.ino === "bigint" ? changed.ino + 1n : changed.ino + 1;
                });
              }
              if (mutation === "directory-metadata-mutated" && missionDirectoryLstatCalls === 2) {
                return cloneStatsWithMutation(stats, (changed) => { changed.size += 1; });
              }
            }
            return stats;
          },
          realpathPath: async (path) => {
            const resolved = await realpath(path);
            if (path === repositoryRoot || path === paths.repositoryRoot) {
              rootRealpathCalls += 1;
              if (mutation === "root-realpath-replaced" && rootRealpathCalls === 4) return `${resolved}-replaced`;
            }
            return resolved;
          },
          statHandle: async (handle) => {
            const stats = await handle.stat();
            handleStatCalls += 1;
            if (mutation === "file-mutated" && handleStatCalls === 2) {
              return cloneStatsWithMutation(stats, (changed) => { changed.size += 1; });
            }
            if (mutation === "file-inode-mutated" && handleStatCalls === 2) {
              return cloneStatsWithMutation(stats, (changed) => {
                changed.ino = typeof changed.ino === "bigint" ? changed.ino + 1n : changed.ino + 1;
              });
            }
            if (mutation === "file-mode-mutated" && handleStatCalls === 2) {
              return cloneStatsWithMutation(stats, (changed) => { changed.mode ^= 0o100; });
            }
            if (mutation === "file-link-mutated" && handleStatCalls === 2) {
              return cloneStatsWithMutation(stats, (changed) => { changed.nlink += 1; });
            }
            if (mutation === "file-time-mutated" && handleStatCalls === 2) {
              return cloneStatsWithMutation(stats, (changed) => { changed.mtimeMs += 1; });
            }
            return stats;
          },
          closeHandle: async (handle) => {
            closeCalls += 1;
            await handle.close();
            if (mutation === "close-uncertain" && closeCalls === 1) throw new Error("simulated close uncertainty");
          },
        },
      );
      assert.equal(read.state, "invalid", mutation);
      assert.equal(read.code, "reviewed_transition_graph_unavailable", mutation);
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  }
});

test("existing mismatched valid graph is detected as materialization_conflict", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const firstInput = graphInputForMissionId("mission:issue-270");
  const secondInput = graphInputForMissionId("mission:issue-270", {
    review: {
      rawReceiptSetSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  });
  const first = buildMissionReviewedTransitionGraphV1(firstInput);
  const second = buildMissionReviewedTransitionGraphV1(secondInput);
  assert.equal(first.state, "built");
  assert.equal(second.state, "built");
  assert.notEqual(first.graph.graphDigest, second.graph.graphDigest);
  const graphPath = deriveMissionReviewedTransitionGraphMaterializationPathV1(repositoryRoot, "mission:issue-270").graphPath;

  try {
    const materialized = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, first.graph));
    assert.equal(materialized.state, "materialized");
    const before = await readFile(graphPath, "utf8");

    const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, second.graph));
    assert.equal(result.state, "materialization_conflict");
    assert.equal(result.existingGraphId, first.graph.graphId);
    assert.equal(result.existingGraphDigest, first.graph.graphDigest);

    const after = await readFile(graphPath, "utf8");
    assert.equal(after, before);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("existing malformed or partial final file is treated as recovery_required", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(repositoryRoot, "mission:issue-270");
  await mkdir(paths.missionDirectory, { mode: 0o700, recursive: true });
  const partial = canonicalJson(built.graph).slice(0, 6);
  await writeFile(paths.graphPath, partial, { mode: 0o600 });

  try {
    const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
    assert.equal(result.state, "recovery_required");
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("existing symbolic-link final artifact is treated as recovery_required", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(repositoryRoot, "mission:issue-270");
  await mkdir(paths.missionDirectory, { mode: 0o700, recursive: true });
  const redirectTarget = join(paths.missionPreparationDirectory, "redirection.json");
  await writeFile(redirectTarget, canonicalJson(built.graph), { mode: 0o600 });
  await symlink(redirectTarget, paths.graphPath);

  try {
    const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
    assert.equal(result.state, "recovery_required");
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("existing hard-linked final artifact is rejected and not overwritten", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(repositoryRoot, "mission:issue-270");
  await mkdir(paths.missionDirectory, { mode: 0o700, recursive: true });
  const backing = join(paths.missionPreparationDirectory, "backing.json");
  await writeFile(backing, canonicalJson(built.graph), { mode: 0o600 });
  await link(backing, paths.graphPath);

  try {
    const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
    assert.equal(result.state, "recovery_required");
    const linkTargetStats = await lstat(backing);
    const finalStats = await lstat(paths.graphPath);
    assert.equal(linkTargetStats.nlink, 2);
    assert.equal(finalStats.nlink, 2);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("existing final with incorrect mode is treated as recovery_required", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(repositoryRoot, "mission:issue-270");
  await mkdir(paths.missionDirectory, { mode: 0o700, recursive: true });
  await writeFile(paths.graphPath, canonicalJson(built.graph), { mode: 0o644 });

  try {
    const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
    assert.equal(result.state, "recovery_required");
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("preexisting secure directory symlink causes invalid materialization input", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(repositoryRoot, "mission:issue-270");
  await mkdir(paths.shieldDirectory, { mode: 0o700, recursive: true });
  await rm(paths.auditDirectory, { recursive: true, force: true }).catch(() => undefined);
  await symlink("/tmp", paths.auditDirectory);

  try {
    const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph));
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "invalid_materialization_input");
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("directory replacement during install is detected as recovery_required", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  const resolvedRoot = await realpath(repositoryRoot);
  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(resolvedRoot, "mission:issue-270");

  let parentLstatCalls = 0;
  const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph), {
    lstatPath: async (path) => {
      const stats = await lstat(path);
      if (!path.includes(paths.missionIdDigest) || path.endsWith(MISSION_REVIEWED_TRANSITION_GRAPH_FILE)) {
        return stats;
      }
      parentLstatCalls += 1;
      if (parentLstatCalls <= 1) {
        return stats;
      }
      return cloneStatsWithMutation(stats, (mutated) => {
        mutated.ino = typeof mutated.ino === "bigint" ? mutated.ino + 1n : mutated.ino + 1;
      });
    },
  });

  try {
    assert.equal(result.state, "recovery_required");
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("final-link collision with same bytes can be retried into already_materialized", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(repositoryRoot, "mission:issue-270");
  let linkAttempts = 0;

  const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph), {
    randomBytes: () => Buffer.from("0000000000000000"),
    linkPath: async (source, destination) => {
      linkAttempts += 1;
      if (linkAttempts === 1) {
        await writeFile(destination, canonicalJson(built.graph), { mode: 0o600 });
        const error = new Error("simulated race");
        error.code = "EEXIST";
        throw error;
      }
      return link(source, destination);
    },
  });

  try {
    assert.equal(result.state, "already_materialized");
    assert.equal(result.graphPath.endsWith(paths.graphPath), true);
    const bytes = await readFile(paths.graphPath, "utf8");
    assert.equal(bytes, canonicalJson(built.graph));
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("verify-readback close failure before final link returns recovery_required and no final artifact", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");
  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(repositoryRoot, "mission:issue-270");
  let closeCalls = 0;
  try {
    const result = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph), {
      randomBytes: () => Buffer.from("0000000000000007"),
      closeHandle: async (handle) => {
        closeCalls += 1;
        if (closeCalls === 1) {
          await handle.close();
          const error = new Error("verify-close-failure");
          error.code = "EIO";
          throw error;
        }
        return handle.close();
      },
    });
    assert.equal(result.state, "recovery_required");
    await assert.rejects(() => readFile(paths.graphPath, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("write/sync/close/link/unlink/readback uncertainty yields recovery_required", async () => {
  const repositoryRoot = await withMaterializationRoot();
  const built = buildMissionReviewedTransitionGraphV1(graphInputForMissionId("mission:issue-270"));
  assert.equal(built.state, "built");

  try {
    const shortWrite = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph), {
      randomBytes: () => Buffer.from("0000000000000001"),
      writeHandle: () => Promise.resolve(0),
    });
    assert.equal(shortWrite.state, "recovery_required");

    const syncFail = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph), {
      randomBytes: () => Buffer.from("0000000000000002"),
      syncHandle: async () => {
        const error = new Error("sync-failure");
        error.code = "EIO";
        throw error;
      },
    });
    assert.equal(syncFail.state, "recovery_required");

    const closeFail = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph), {
      randomBytes: () => Buffer.from("0000000000000003"),
      closeHandle: async (handle) => {
        await handle.close();
        const error = new Error("close-failure");
        error.code = "EIO";
        throw error;
      },
    });
    assert.equal(closeFail.state, "recovery_required");

    const linkFail = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph), {
      randomBytes: () => Buffer.from("0000000000000004"),
      linkPath: async () => {
        const error = new Error("link-failure");
        error.code = "EIO";
        throw error;
      },
    });
    assert.equal(linkFail.state, "recovery_required");

    const unlinkFail = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph), {
      randomBytes: () => Buffer.from("0000000000000005"),
      unlinkPath: async () => {
        const error = new Error("unlink-failure");
        error.code = "EIO";
        throw error;
      },
    });
    assert.equal(unlinkFail.state, "recovery_required");

    let readCalls = 0;
    const finalReadbackFail = await materializeMissionReviewedTransitionGraphV1(materializationInput(repositoryRoot, built.graph), {
      randomBytes: () => Buffer.from("0000000000000006"),
      readHandle: async (handle, size) => {
        const value = await handle.readFile("utf8");
        readCalls += 1;
        if (readCalls >= 2) {
          return `${value}x`;
        }
        return value;
      },
    });
    assert.equal(finalReadbackFail.state, "recovery_required");
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});
