import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildMissionTransitionPlanReviewV1,
  validateMissionTransitionPlanReviewV1,
  computeMissionTransitionPlanReviewDigestV1,
  computeMissionTransitionPlanReviewIdV1,
  MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION,
  resolvePreparedMissionTransitionV1,
  resolvePreparedMissionTransitionV1ForTest,
} from "../dist/mission-preparation-host-v1.mjs";
import {
  computeCanonicalContractDigestV1,
  computeContentIdV1,
  computeRawReceiptSetSha256V1,
} from "@shield/mission-preparation";
import {
  buildMissionTransitionPlanV1,
} from "../dist/mission-builder-v1.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";
import {
  materializeReviewedMissionTransitionV1,
} from "../dist/mission-preparation-host-v1.mjs";
import {
  readSeatDispatchReceiptLedgerSnapshotV1,
} from "../dist/seat-dispatch-store.mjs";
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { canonicalJson, computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
  createProfileAwareImplementationAuthorityRevocationEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  createProfileAwareReviewPublicationAuthorizationEntryV1,
  createProfileAwareRuntimeBindingSupersessionEntryV1,
  MISSION_130_JOURNAL_DIGEST,
} from "../dist/profile-aware-mission-v1.mjs";
import { appendProfileAwareMissionEntriesAtomicV1, readMissionJournalForDisplay } from "../dist/mission-store.mjs";
import { executeAuthorizeWheelsUpV1, validateAuthorizeWheelsUpInput } from "../dist/authorize-wheels-up-executor-v1.mjs";
import { executeReviewPublicationAuthorizationV1 } from "../dist/review-publication-executor-v1.mjs";
import { signerTestOnly } from "../dist/mission-signer.mjs";
import {
  worktreePreparationAuthorityV1,
  worktreePreparationIsReadyV1,
} from "../dist/worktree-state-v1.mjs";
import {
  computeImplementationAuthorityDigest,
  computeRuntimeBindingDigest,
  computeSchema9RuntimeBindingDigest,
} from "../dist/implementation-authority-v1.mjs";
import { computeReviewPublicationAuthorityDigest } from "../dist/review-publication-v1.mjs";

const CLI = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

const MISSION_ID = "mission:issue-270";
const SUBJECT_ID = "github:RanSolo/shield-workspace/issue/270";
const REPOSITORY_ID = "RanSolo/shield-workspace";
const WORKSPACE_ID = "workspace:issue-270";
const SUBJECT_REVISION = "a".repeat(40);
const REPOSITORY_REVISION = "b".repeat(40);
const PARENT_MISSION_REVISION = "c".repeat(40);
const BASE_TIMESTAMP = "2026-08-01T00:00:00.000Z";

test("worktree preparation provenance remains authority-none and cannot replace live mission observations", async () => {
  const provenance = {
    state: "ready",
    authority: "none",
    receipt: { receiptDigest: "a".repeat(64) },
  };
  assert.equal(worktreePreparationIsReadyV1(provenance), true);
  assert.equal(worktreePreparationAuthorityV1(provenance), "none");
  const result = await resolvePreparedMissionTransitionV1({
    missionId: MISSION_ID,
    repositoryRoot: "/tmp/not-observed",
    worktreePreparationReceipt: provenance.receipt,
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reasonCode, "invalid_resolution_input");
});

test("exported prepared resolver result is the closed five-state union", async () => {
  const declaration = await readFile(new URL("../dist/mission-preparation-host-v1.d.mts", import.meta.url), "utf8");
  const start = declaration.indexOf("export type ResolvePreparedMissionTransitionResultV1");
  const end = declaration.indexOf(">;", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const union = declaration.slice(start, end + 2);
  assert.match(union, /state: "ready"/u);
  assert.match(union, /state: "blocked"/u);
  assert.match(union, /state: "already_authorized"/u);
  assert.match(union, /PreparedPublicationReadyResultV1/u);
  assert.match(union, /PreparedPublicationAlreadyAuthorizedResultV1/u);
});

function transitionPlanBase(overrides = {}) {
  return {
    missionId: MISSION_ID,
    subjectId: SUBJECT_ID,
    repositoryId: REPOSITORY_ID,
    planningBaseRevision: "d".repeat(40),
    parentPlanCommit: "e".repeat(40),
    parentPlanPath: "docs/missions/issue-270-turnkey-preparation-plan.md",
    parentPlanRawSha256: "f".repeat(64),
    transitionKind: "fresh_authorize_wheels_up",
    boundedOutcome: "Authorize wheels up transition for issue 270.",
    approvedRelativePaths: ["packages/shield-team-system/src"],
    publicationPaths: ["docs/missions/issue-270-turnkey-preparation-plan.md"],
    approvedActionIds: ["action:issue-270"],
    approvedEffectClasses: ["behavioral_implementation"],
    approvedEffectKeys: ["effect:issue-270"],
    approvedCapabilities: ["capability:issue-270"],
    validationCommandIds: ["validation:issue-270"],
    modelId: "model:issue-270",
    reasoningRuntimeId: "runtime:issue-270",
    toolExecutorId: "executor:issue-270",
    exclusions: [
      "review.comment.publish",
      "review.pull_request.update_draft",
      "review.pull_request.mark_ready",
      "merge",
      "deployment",
      "release",
      "final_acceptance",
    ],
    ...overrides,
  };
}

function transitionPlan(overrides = {}) {
  const built = buildMissionTransitionPlanV1(transitionPlanBase(overrides));
  assert.equal(built.state, "built");
  return built.plan;
}

function reviewForPlan(plan, overrides = {}) {
  const built = buildReview({
    ...transitionPlanReview({
      missionId: plan.missionId,
      subjectId: plan.subjectId,
      repositoryId: plan.repositoryId,
      planningBaseRevision: plan.planningBaseRevision,
      parentPlanCommit: plan.parentPlanCommit,
      parentPlanPath: plan.parentPlanPath,
      parentPlanRawSha256: plan.parentPlanRawSha256,
      transitionPlanId: plan.id,
      transitionPlanDigest: plan.digest,
      reviewedArtifactId: plan.id,
      reviewedArtifactRevision: plan.digest,
      ...overrides,
    }),
    ...overrides,
  });
  if (built && typeof built === "object" && "reviewId" in built && "reviewDigest" in built && !("state" in built)) {
    return built;
  }
  assert.equal(built.state, "built");
  return built.review;
}

function expectedBinding(plan, overrides = {}) {
  return {
    schemaVersion: 1,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    parentPlanCommit: plan.parentPlanCommit,
    parentPlanPath: plan.parentPlanPath,
    parentPlanRawSha256: plan.parentPlanRawSha256,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    reviewedArtifactId: plan.id,
    reviewedArtifactRevision: plan.digest,
    ...overrides,
  };
}

function dispatchIdentity(plan, review, overrides = {}) {
  return {
    receiptId: "receipt:fury:issue-270",
    dispatchId: "dispatch:fury:issue-270",
    parentMissionId: plan.missionId,
    parentMissionRevision: PARENT_MISSION_REVISION,
    parentSessionId: "session:fury:issue-270",
    repositoryRevision: REPOSITORY_REVISION,
    childTaskId: "task:fury:issue-270",
    childSessionId: "session:fury:issue-270",
    accountableSeatId: "fury",
    repositoryId: plan.repositoryId,
    repositoryWorkspaceId: WORKSPACE_ID,
    subjectId: plan.subjectId,
    subjectRevision: SUBJECT_REVISION,
    artifactId: plan.id,
    artifactRevision: plan.digest,
    configuredRuntime: { kind: "runtime.configured", runtimeId: review.reviewerRuntimeId, model: review.reviewerModelId },
    requestedRuntime: { kind: "runtime.requested", runtimeId: review.reviewerRuntimeId, model: review.reviewerModelId },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:fury:issue-270" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: {
      kind: "runtime.host_observed",
      runtimeId: review.reviewerRuntimeId,
      model: review.reviewerModelId,
      evidenceRefs: ["host:fury:runtime"],
    },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: {
      kind: "executor.host_observed",
      executorId: review.reviewerExecutorId,
      evidenceRefs: ["host:fury:executor"],
    },
    timestamp: BASE_TIMESTAMP,
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
    ...overrides,
  };
}

function dispatchStarted(identity, overrides = {}) {
  return createSeatDispatchStartedEventV1({
    ...dispatchIdentityPayload(identity),
    timestamp: identity.timestamp,
    logSequence: identity.logSequence,
    previousLogDigest: identity.previousLogDigest,
    lifecycleSequence: identity.lifecycleSequence,
    previousLifecycleDigest: identity.previousLifecycleDigest,
    inputEvidenceRefs: ["artifact:source"],
    ...overrides,
  });
}

function dispatchIdentityPayload(identity) {
  return {
    receiptId: identity.receiptId,
    dispatchId: identity.dispatchId,
    parentMissionId: identity.parentMissionId,
    parentMissionRevision: identity.parentMissionRevision,
    parentSessionId: identity.parentSessionId,
    repositoryRevision: identity.repositoryRevision,
    childTaskId: identity.childTaskId,
    childSessionId: identity.childSessionId,
    accountableSeatId: identity.accountableSeatId,
    repositoryId: identity.repositoryId,
    repositoryWorkspaceId: identity.repositoryWorkspaceId,
    subjectId: identity.subjectId,
    subjectRevision: identity.subjectRevision,
    artifactId: identity.artifactId,
    artifactRevision: identity.artifactRevision,
    configuredRuntime: identity.configuredRuntime,
    requestedRuntime: identity.requestedRuntime,
    toolExecution: identity.toolExecution,
    runtimeSelfReport: identity.runtimeSelfReport,
    runtimeHostObserved: identity.runtimeHostObserved,
    executorSelfReport: identity.executorSelfReport,
    executorHostObserved: identity.executorHostObserved,
  };
}

function dispatchLifecycle(previousEvent, identity, kind, overrides = {}) {
  return createSeatDispatchLifecycleEventV1({
    ...dispatchIdentityPayload(identity),
    kind,
    timestamp: new Date(Date.parse(previousEvent.timestamp) + 1000).toISOString(),
    logSequence: previousEvent.logSequence + 1,
    previousLogDigest: previousEvent.entryDigest,
    lifecycleSequence: previousEvent.lifecycleSequence + 1,
    previousLifecycleDigest: previousEvent.entryDigest,
    ...overrides,
  });
}

function dispatchLifecycleInterleaved(previousReceiptEvent, previousLogEvent, identity, kind, overrides = {}) {
  return createSeatDispatchLifecycleEventV1({
    ...dispatchIdentityPayload(identity),
    kind,
    timestamp: new Date(Date.parse(previousLogEvent.timestamp) + 1000).toISOString(),
    logSequence: previousLogEvent.logSequence + 1,
    previousLogDigest: previousLogEvent.entryDigest,
    lifecycleSequence: previousReceiptEvent.lifecycleSequence + 1,
    previousLifecycleDigest: previousReceiptEvent.entryDigest,
    ...overrides,
  });
}

function canonicalDispatchEventLine(event) {
  const kind = event.kind;
  if (kind !== "dispatch.started" && kind !== "dispatch.interrupted" && kind !== "dispatch.resumed" && kind !== "dispatch.completed" && kind !== "dispatch.failed" && kind !== "dispatch.cancelled") {
    return JSON.stringify(event);
  }
  const baseFields = [
    "schemaVersion",
    "contractVersion",
    "kind",
    "receiptId",
    "dispatchId",
    "parentMissionId",
    "parentMissionRevision",
    "repositoryRevision",
    "parentSessionId",
    "childTaskId",
    "childSessionId",
    "accountableSeatId",
    "repositoryId",
    "repositoryWorkspaceId",
    "subjectId",
    "subjectRevision",
    "artifactId",
    "artifactRevision",
    "configuredRuntime",
    "requestedRuntime",
    "toolExecution",
    "runtimeSelfReport",
    "runtimeHostObserved",
    "executorSelfReport",
    "executorHostObserved",
    "timestamp",
    "logSequence",
    "previousLogDigest",
    "lifecycleSequence",
    "previousLifecycleDigest",
  ];
  const canonicalKeys = kind === "dispatch.started"
    ? [...baseFields, "entryDigest", "inputEvidenceRefs"]
    : [...baseFields, "entryDigest", ...(kind === "dispatch.interrupted" || kind === "dispatch.resumed" ? [] : ["outputEvidenceRefs"])];
  const canonical = {};
  for (const key of canonicalKeys) {
    if (Object.hasOwn(event, key)) {
      // @ts-expect-error direct passthrough from fixture objects
      canonical[key] = event[key];
    }
  }
  return JSON.stringify(canonical);
}

function reviewOutputRefs(review) {
  return [review.reviewId, review.reviewDigest, review.reviewedArtifactId, review.reviewedArtifactRevision];
}

async function writeDispatchLog(repositoryRoot, events) {
  const logPath = join(repositoryRoot, ".shield", "dispatch-receipts.jsonl");
  await mkdir(join(repositoryRoot, ".shield"), { recursive: true });
  await writeFile(logPath, events.map((event) => `${canonicalDispatchEventLine(event)}\n`).join(""), "utf8");
}

function materializationInput(plan, review, binding, identity, repositoryRoot) {
  return {
    missionId: plan.missionId,
    repositoryRoot,
    transitionPlan: plan,
    reviewArtifact: review,
    expectedBinding: binding,
    dispatchIdentity: identity,
  };
}

function repository() {
  return mkdtemp(join(tmpdir(), "shield-270-host-"));
}

function transitionPlanReview(overrides = {}) {
  return {
    schemaVersion: 1,
    contractVersion: MISSION_TRANSITION_PLAN_REVIEW_CONTRACT_VERSION,
    authority: "none",
    missionId: "mission:issue-270",
    subjectId: "github:RanSolo/shield-workspace/issue/270",
    repositoryId: "RanSolo/shield-workspace",
    planningBaseRevision: "a".repeat(40),
    parentPlanCommit: "b".repeat(40),
    parentPlanPath: "docs/missions/issue-270-turnkey-preparation-plan.md",
    parentPlanRawSha256: "c".repeat(64),
    transitionPlanId: `transition-plan:${"d".repeat(43)}`,
    transitionPlanDigest: `sha256:${"e".repeat(43)}`,
    verdict: "PASS",
    reviewerSeatId: "fury",
    reviewerRuntimeId: "runtime:issue-270",
    reviewerModelId: "model:issue-270",
    reviewerExecutorId: "executor:issue-270",
    reviewedArtifactId: `transition-plan:${"d".repeat(43)}`,
    reviewedArtifactRevision: `sha256:${"e".repeat(43)}`,
    ...overrides,
  };
}

function buildReview(overrides = {}) {
  const built = buildMissionTransitionPlanReviewV1(transitionPlanReview(overrides));
  if (built !== null && typeof built === "object" && "reviewId" in built && "reviewDigest" in built && !("state" in built)) {
    return built;
  }
  assert.equal(built.state, "built");
  return built.review;
}

function assertMalformed(result) {
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "malformed_transition_plan_review_input");
}

test("compute helpers are deterministic for closed ordinary data ordering", () => {
  const normal = transitionPlanReview();
  const ordered = transitionPlanReview();
  const reversed = {};
  for (const key of Object.keys(ordered).reverse()) {
    // @ts-expect-error deliberate property re-ordering.
    reversed[key] = ordered[key];
  }

  const forwardDigest = computeMissionTransitionPlanReviewDigestV1(normal);
  const reversedDigest = computeMissionTransitionPlanReviewDigestV1(reversed);
  const buildDigest = computeMissionTransitionPlanReviewDigestV1(buildReview());
  const reviewIdFromDigest = computeMissionTransitionPlanReviewIdV1(buildDigest);

  assert.equal(forwardDigest, reversedDigest);
  assert.equal(forwardDigest, buildDigest);
  assert.equal(reviewIdFromDigest.startsWith("transition-plan-review:"), true);
});

test("build is deterministic, closed, and mutation-isolated", () => {
  const first = buildReview();
  const second = buildReview();
  assert.equal(first.reviewDigest, second.reviewDigest);
  assert.equal(first.reviewId, second.reviewId);

  const mutable = transitionPlanReview();
  const immutable = buildReview();
  mutable.missionId = "mission:tamper";
  assert.notEqual(immutable.missionId, mutable.missionId);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(immutable));
});

test("hostile objects are rejected as non-closed ordinary data", () => {
  assertMalformed(buildMissionTransitionPlanReviewV1({ ...transitionPlanReview(), extra: true }));
  assertMalformed(buildMissionTransitionPlanReviewV1(new Proxy(transitionPlanReview(), {})));
  assertMalformed(buildMissionTransitionPlanReviewV1(Object.assign(Object.create({ missionId: "mission:bad" }), transitionPlanReview())));

  const symbolized = transitionPlanReview();
  Object.defineProperty(symbolized, Symbol("fury"), { value: "bad", enumerable: true });
  assertMalformed(buildMissionTransitionPlanReviewV1(symbolized));

  const nonEnumerable = transitionPlanReview();
  Object.defineProperty(nonEnumerable, "subjectId", { value: "github:bad", enumerable: false });
  assertMalformed(buildMissionTransitionPlanReviewV1(nonEnumerable));

  const cyclic = transitionPlanReview();
  cyclic.self = cyclic;
  assertMalformed(buildMissionTransitionPlanReviewV1(cyclic));
});

test("accessors are never invoked during rejection", () => {
  let getterCalls = 0;
  const accessor = transitionPlanReview();
  Object.defineProperty(accessor, "missionId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "mission:accessor";
    },
  });

  const validateResult = validateMissionTransitionPlanReviewV1(accessor);
  assert.equal(validateResult.state, "invalid");
  assert.equal(getterCalls, 0);
});

test("identity tamper and deterministic helper recomputation are rejected", () => {
  const artifact = buildReview();

  const tamperedDigest = { ...artifact, reviewDigest: `sha256:${"0".repeat(43)}` };
  const digestResult = validateMissionTransitionPlanReviewV1(tamperedDigest);
  assert.equal(digestResult.state, "invalid");
  assert.equal(digestResult.errors.includes("mission.transition-plan-review-v1 reviewDigest is invalid."), true);

  const tamperedId = { ...artifact, reviewId: "transition-plan-review:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
  const idResult = validateMissionTransitionPlanReviewV1(tamperedId);
  assert.equal(idResult.state, "invalid");
  assert.equal(idResult.errors.includes("mission.transition-plan-review-v1 reviewId is invalid."), true);

  const artifactDigestByHelpers = computeMissionTransitionPlanReviewDigestV1(artifact);
  assert.equal(artifactDigestByHelpers, artifact.reviewDigest);
  assert.equal(computeMissionTransitionPlanReviewIdV1(artifactDigestByHelpers), artifact.reviewId);
});

test("binding fields and runtime/executor separation are enforced", () => {
  const runtimeExecutorSame = buildMissionTransitionPlanReviewV1(transitionPlanReview({ reviewerExecutorId: "runtime:issue-270" }));
  assert.equal(runtimeExecutorSame.state, "invalid");
  assert.equal(runtimeExecutorSame.errors.includes("reviewerRuntimeId_and_reviewerExecutorId_must_differ"), true);

  const artifact = buildReview();

  const badArtifact = validateMissionTransitionPlanReviewV1({ ...artifact, reviewedArtifactId: `transition-plan:${"f".repeat(43)}` });
  assert.equal(badArtifact.state, "invalid");
  assert.equal(badArtifact.errors.includes("reviewed_artifact_binding_id_mismatch"), true);

  const badArtifactRevision = validateMissionTransitionPlanReviewV1({ ...artifact, reviewedArtifactRevision: `sha256:${"g".repeat(43)}` });
  assert.equal(badArtifactRevision.state, "invalid");
  assert.equal(badArtifactRevision.errors.includes("reviewed_artifact_binding_revision_mismatch"), true);
});

test("materialize selects the named Fury receipt from interleaved logs and produces deterministic binding", async () => {
  const plan = transitionPlan();
  const review = reviewForPlan(plan);
  const binding = expectedBinding(plan);
  const identity = dispatchIdentity(plan, review);
  const rival = dispatchIdentity(plan, review, {
    receiptId: "receipt:fury:rival",
    dispatchId: "dispatch:fury:rival",
    childTaskId: "task:fury:rival",
    childSessionId: "session:fury:rival",
    accountableSeatId: "may",
    artifactId: `transition-plan:${"g".repeat(43)}`,
    artifactRevision: `sha256:${"g".repeat(43)}`,
  });

  const repositoryRoot = await repository();
  const furyStart = dispatchStarted(identity);
  const rivalStart = dispatchStarted(rival, {
    timestamp: new Date(Date.parse(furyStart.timestamp) + 1000).toISOString(),
    logSequence: 1,
    previousLogDigest: furyStart.entryDigest,
    inputEvidenceRefs: ["artifact:rival-source"],
  });
  const rivalCompleted = dispatchLifecycleInterleaved(rivalStart, rivalStart, rival, "dispatch.completed", {
    outputEvidenceRefs: ["artifact:rival-output"],
  });
  const furyInterrupted = dispatchLifecycleInterleaved(furyStart, rivalCompleted, identity, "dispatch.interrupted");
  const furyResumed = dispatchLifecycleInterleaved(furyInterrupted, furyInterrupted, identity, "dispatch.resumed");
  const furyCompleted = dispatchLifecycleInterleaved(furyResumed, furyResumed, identity, "dispatch.completed", {
    outputEvidenceRefs: reviewOutputRefs(review),
  });
  await writeDispatchLog(repositoryRoot, [furyStart, rivalStart, rivalCompleted, furyInterrupted, furyResumed, furyCompleted]);

  const result = await materializeReviewedMissionTransitionV1(materializationInput(plan, review, binding, identity, repositoryRoot));
  assert.equal(result.state, "materialized", JSON.stringify(result));
  assert.equal(typeof result.bytes, "string");
  const graph = JSON.parse(await readFile(result.graphPath, "utf8"));
  assert.equal(graph.schemaId, "mission.reviewed-transition-graph.v1");
  assert.equal(graph.transitionPlan.id, plan.id);

  const snapshot = await readSeatDispatchReceiptLedgerSnapshotV1({
    repositoryRoot,
    repositoryId: plan.repositoryId,
    repositoryWorkspaceId: identity.repositoryWorkspaceId,
  });
  assert.equal(snapshot.state, "valid", snapshot.errors?.join(" "));
  const selectedRawReceipts = snapshot.value.rawEntryBytes.filter((_, index) => snapshot.value.entries[index].receiptId === identity.receiptId);
  const rawReceiptSet = computeRawReceiptSetSha256V1({ rawReceipts: selectedRawReceipts });
  assert.equal(rawReceiptSet.state, "valid");
  assert.equal(graph.parentPlanReviewEvidence.rawReceiptSetSha256, rawReceiptSet.value);

  const again = await materializeReviewedMissionTransitionV1(materializationInput(plan, review, binding, identity, repositoryRoot));
  assert.equal(again.state, "already_materialized");
  assert.equal(again.graphPath, result.graphPath);
});

test("materialize ignores non-closed host orchestration-only input and rejects extra authority/CLI fields", async () => {
  const plan = transitionPlan();
  const review = reviewForPlan(plan);
  const input = materializationInput(plan, review, expectedBinding(plan), dispatchIdentity(plan, review), await repository());
  const result = await materializeReviewedMissionTransitionV1({
    ...input,
    compiler: { kind: "compiler" },
    signer: { kind: "signer" },
    missionAuthorizeCommand: "/bin/true",
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "invalid_materialization_input");
});

test("materialize rejects wrong top-level mission identifier", async () => {
  const plan = transitionPlan();
  const review = reviewForPlan(plan);
  const identity = dispatchIdentity(plan, review);
  const repositoryRoot = await repository();

  const start = dispatchStarted(identity);
  const completed = dispatchLifecycle(start, identity, "dispatch.completed", {
    outputEvidenceRefs: reviewOutputRefs(review),
  });
  await writeDispatchLog(repositoryRoot, [start, completed]);

  const result = await materializeReviewedMissionTransitionV1({
    ...materializationInput(plan, review, expectedBinding(plan), identity, repositoryRoot),
    missionId: "mission:issue-999",
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "invalid_materialization_input");
});

test("materialize rejects binding mismatches for mission, plan, artifact, and revision", async () => {
  const plan = transitionPlan();
  const review = reviewForPlan(plan);
  const identity = dispatchIdentity(plan, review);
  const repositoryRoot = await repository();

  const start = dispatchStarted(identity);
  const completed = dispatchLifecycle(start, identity, "dispatch.completed", {
    outputEvidenceRefs: reviewOutputRefs(review),
  });
  await writeDispatchLog(repositoryRoot, [start, completed]);

  const mismatchBinding = {
    ...expectedBinding(plan),
    missionId: "mission:wrong-270",
    transitionPlanId: `transition-plan:${"f".repeat(43)}`,
    transitionPlanDigest: `sha256:${"f".repeat(43)}`,
    reviewedArtifactId: `transition-plan:${"g".repeat(43)}`,
    reviewedArtifactRevision: `sha256:${"g".repeat(43)}`,
  };
  const result = await materializeReviewedMissionTransitionV1(materializationInput(
    plan,
    review,
    mismatchBinding,
    identity,
    repositoryRoot,
  ));
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "invalid_expected_binding");
  assert.ok(result.errors.includes("mission_binding_mismatch"));
  assert.ok(result.errors.includes("transition_plan_id_binding_mismatch"));
  assert.ok(result.errors.includes("reviewed_artifact_id_binding_mismatch"));
});

test("materialize rejects missing terminal lifecycle and wrong-seat receipts", async () => {
  const plan = transitionPlan();
  const review = reviewForPlan(plan);
  const identity = dispatchIdentity(plan, review);
  const repositoryRoot = await repository();

  const started = dispatchStarted(identity);
  const partial = dispatchLifecycle(started, identity, "dispatch.interrupted");
  await writeDispatchLog(repositoryRoot, [started, partial]);

  const noTerminal = await materializeReviewedMissionTransitionV1(materializationInput(plan, review, expectedBinding(plan), identity, repositoryRoot));
  assert.equal(noTerminal.state, "invalid");
  assert.equal(noTerminal.code, "invalid_attribution");
  assert.ok(noTerminal.errors.includes("non_terminal_lifecycle"));

  const rival = dispatchIdentity(plan, review, {
    receiptId: "receipt:may:wrong-seat",
    dispatchId: "dispatch:may:wrong-seat",
    childTaskId: "task:may:wrong-seat",
    childSessionId: "session:may:wrong-seat",
    accountableSeatId: "may",
  });
  const rivalStarted = dispatchStarted(rival);
  const rivalCompleted = dispatchLifecycle(rivalStarted, rival, "dispatch.completed", {
    outputEvidenceRefs: ["artifact:rival-output"],
  });
  const wrongSeatRepositoryRoot = await repository();
  await writeDispatchLog(wrongSeatRepositoryRoot, [rivalStarted, rivalCompleted]);

  const wrongSeat = await materializeReviewedMissionTransitionV1(materializationInput(plan, review, expectedBinding(plan), identity, wrongSeatRepositoryRoot));
  assert.equal(wrongSeat.state, "invalid");
  assert.equal(wrongSeat.code, "invalid_attribution");
  assert.ok(wrongSeat.errors.includes("forged_seat_label"));
});

test("materialize fails when dispatch ledger has duplicate receipt entries", async () => {
  const plan = transitionPlan();
  const review = reviewForPlan(plan);
  const identity = dispatchIdentity(plan, review);
  const repositoryRoot = await repository();

  const start = dispatchStarted(identity);
  const duplicateStart = dispatchStarted(identity, {
    timestamp: new Date(Date.parse(start.timestamp) + 1000).toISOString(),
    logSequence: 1,
    previousLogDigest: start.entryDigest,
  });
  await writeDispatchLog(repositoryRoot, [start, duplicateStart]);

  const result = await materializeReviewedMissionTransitionV1(materializationInput(plan, review, expectedBinding(plan), identity, repositoryRoot));
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "invalid_receipt_snapshot");
});

test("materialize rejects stale repository revision and reviewer runtime/model/executor substitution", async () => {
  const plan = transitionPlan();
  const review = reviewForPlan(plan);
  const ledgerIdentity = dispatchIdentity(plan, review, { repositoryRevision: "9".repeat(40) });
  const inputIdentity = dispatchIdentity(plan, review, { repositoryRevision: "a".repeat(40) });
  const repositoryRoot = await repository();

  const staleStart = dispatchStarted(ledgerIdentity);
  const staleCompleted = dispatchLifecycle(staleStart, ledgerIdentity, "dispatch.completed", {
    outputEvidenceRefs: reviewOutputRefs(review),
  });
  await writeDispatchLog(repositoryRoot, [staleStart, staleCompleted]);

  const staleRevision = await materializeReviewedMissionTransitionV1(materializationInput(plan, review, expectedBinding(plan), inputIdentity, repositoryRoot));
  assert.equal(staleRevision.state, "invalid");
  assert.equal(staleRevision.code, "invalid_attribution");
  assert.ok(staleRevision.errors.includes("stale_repository_revision"));

  const substitutedIdentity = dispatchIdentity(plan, review, {
    runtimeHostObserved: {
      kind: "runtime.host_observed",
      runtimeId: "runtime:substituted",
      model: "model:substituted",
      evidenceRefs: ["host:fury:runtime:substituted"],
    },
    executorHostObserved: {
      kind: "executor.host_observed",
      executorId: "executor:substituted",
      evidenceRefs: ["host:fury:executor:substituted"],
    },
  });
  const substituteRoot = await repository();
  const substituteStart = dispatchStarted(substitutedIdentity);
  const substituteCompleted = dispatchLifecycle(substituteStart, substitutedIdentity, "dispatch.completed", {
    outputEvidenceRefs: reviewOutputRefs(review),
  });
  await writeDispatchLog(substituteRoot, [substituteStart, substituteCompleted]);

  const mismatch = await materializeReviewedMissionTransitionV1(materializationInput(plan, review, expectedBinding(plan), substitutedIdentity, substituteRoot));
  assert.equal(mismatch.state, "invalid");
  assert.equal(mismatch.code, "reviewer_declaration_mismatch");
});

test("materialize fails on forged review identity", async () => {
  const plan = transitionPlan();
  const review = reviewForPlan(plan, {
    reviewerRuntimeId: "runtime:substitute",
  });
  const forged = {
    ...review,
    reviewId: `transition-plan-review:${"q".repeat(43)}`,
  };
  const identity = dispatchIdentity(plan, review);
  const repositoryRoot = await repository();
  const start = dispatchStarted(identity);
  const completed = dispatchLifecycle(start, identity, "dispatch.completed", {
    outputEvidenceRefs: reviewOutputRefs(review),
  });
  await writeDispatchLog(repositoryRoot, [start, completed]);

  const result = await materializeReviewedMissionTransitionV1(materializationInput(plan, forged, expectedBinding(plan), identity, repositoryRoot));
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "invalid_review_artifact");
});

test("materialize binds raw receipt set deterministically and reports conflict when receipt set changes", async () => {
  const plan = transitionPlan();
  const review = reviewForPlan(plan);
  const identity = dispatchIdentity(plan, review);
  const repositoryRoot = await repository();

  const start = dispatchStarted(identity);
  const completed = dispatchLifecycle(start, identity, "dispatch.completed", {
    outputEvidenceRefs: reviewOutputRefs(review),
  });
  await writeDispatchLog(repositoryRoot, [start, completed]);

  const first = await materializeReviewedMissionTransitionV1(materializationInput(plan, review, expectedBinding(plan), identity, repositoryRoot));
  assert.equal(first.state, "materialized", JSON.stringify(first));

  const tamperedCompleted = dispatchLifecycle(start, identity, "dispatch.completed", {
    timestamp: completed.timestamp,
    logSequence: 1,
    previousLogDigest: start.entryDigest,
    outputEvidenceRefs: [...reviewOutputRefs(review), "artifact:tampered"],
  });
  await writeDispatchLog(repositoryRoot, [start, tamperedCompleted]);

  const second = await materializeReviewedMissionTransitionV1(materializationInput(plan, review, expectedBinding(plan), identity, repositoryRoot));
  assert.equal(second.state, "materialization_conflict");
  assert.equal(second.existingGraphId, first.graphId);
  assert.equal(second.existingGraphDigest, first.graphDigest);
});

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, LANG: "C", LC_ALL: "C" } }).trim();
}

function reidentifyContract(artifact, overrides = {}) {
  const { id: _id, digest: _digest, ...body } = { ...artifact, ...overrides };
  const digest = computeCanonicalContractDigestV1({ schemaId: body.schemaId, body });
  assert.equal(digest.state, "valid", JSON.stringify(digest));
  const id = computeContentIdV1({ schemaId: body.schemaId, digest: digest.value });
  assert.equal(id.state, "valid", JSON.stringify(id));
  return { ...body, id: id.value, digest: digest.value };
}

function expectedPreparation(fresh, overrides = {}) {
  return {
    plan: fresh.plan,
    reviewEvidence: fresh.reviewEvidence,
    intent: fresh.intent,
    observation: fresh.observation,
    selection: fresh.selection,
    candidate: fresh.candidate,
    receipt: fresh.preparationReceipt,
    ...overrides,
  };
}

async function protectedFixtureSnapshot(fixture) {
  return {
    config: await readFile(join(fixture.repositoryRoot, ".shield", "config.json")),
    journal: await readFile(fixture.journalPath),
    preparationStore: await readFile(fixture.graphPath),
    dispatchLog: await readFile(join(fixture.repositoryRoot, ".shield", "dispatch-receipts.jsonl")),
    signer: await readFile(fixture.signerPath),
    head: git(fixture.repositoryRoot, ["rev-parse", "HEAD"]),
    status: git(fixture.repositoryRoot, ["status", "--short"]),
  };
}

async function nonAttackerEvidenceSnapshot(fixture) {
  const { journal: _journal, ...snapshot } = await protectedFixtureSnapshot(fixture);
  return snapshot;
}

async function authorizeResolutionFixture(fixture, intentOverrides = {}) {
  const fresh = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });
  assert.equal(fresh.state, "ready", JSON.stringify(fresh));
  const intent = validateAuthorizeWheelsUpInput({ ...fresh.candidate.actionInput, ...intentOverrides });
  const calls = { render: 0, pin: 0, sign: 0, append: 0 };
  await executeAuthorizeWheelsUpV1({
    root: fixture.repositoryRoot,
    config: fixture.config,
    missionId: MISSION_ID,
    intent,
    timestamp: { value: "2026-08-11T12:01:00Z", provenance: "hostTrusted" },
    humanMode: false,
    promptOutput: { write: () => {} },
    dependencies: {
      renderDecision: () => { calls.render += 1; return "{}"; },
      readPasscode: async () => { calls.pin += 1; return "unused"; },
      signBatch: async (_binding, _passcode, payloads) => {
        calls.sign += 1;
        return payloads.map((payload) => sign(null, Buffer.from(canonicalJson(payload)), fixture.privateKey).toString("base64"));
      },
      appendBatchAtomic: async (input) => { calls.append += 1; return appendProfileAwareMissionEntriesAtomicV1(input); },
    },
  });
  assert.deepEqual(calls, { render: 1, pin: 1, sign: 1, append: 1 });
}

async function currentProfileJournal(fixture) {
  const current = await readMissionJournalForDisplay({
    repositoryRoot: fixture.repositoryRoot,
    configuredJournalPath: fixture.config.paths.journals,
    missionId: MISSION_ID,
  });
  assert.equal(current.state, "valid", JSON.stringify(current));
  assert.equal(current.value.kind, "profile-aware");
  return current.value;
}

async function appendJournalEntry(fixture, entry) {
  const bytes = await readFile(fixture.journalPath, "utf8");
  await writeFile(fixture.journalPath, `${bytes}${JSON.stringify(entry)}\n`);
}

function signedPayload(payload, privateKey) {
  return {
    payload,
    signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64"),
  };
}

async function appendRuntimeReplacement(fixture) {
  const current = await currentProfileJournal(fixture);
  const projection = current.projection;
  const prior = projection.activeRuntimeBindings[0];
  assert.ok(prior);
  const authorizationId = `authorization:runtime-binding:${projection.lastSequence + 1}`;
  const replacementBinding = {
    ...prior.binding,
    bindingVersion: prior.binding.bindingVersion + 1,
    reasoningRuntimeId: "runtime:replacement-270",
    recordedAtSequence: projection.lastSequence + 1,
    coulsonAuthorizationRef: authorizationId,
  };
  const replacement = { ...prior, binding: replacementBinding };
  const timestamp = { value: "2026-08-11T12:02:00Z", provenance: "hostTrusted" };
  const payload = {
    schemaVersion: 1,
    authorizationId,
    missionId: projection.missionId,
    subjectId: projection.brief.subjectId,
    seatId: "may",
    bindingId: replacementBinding.bindingId,
    bindingVersion: replacementBinding.bindingVersion,
    priorBindingId: prior.binding.bindingId,
    priorBindingVersion: prior.binding.bindingVersion,
    bindingDigest: computeRuntimeBindingDigest(replacementBinding),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(replacement),
    artifactRevisionId: replacementBinding.artifactRevisionId,
    decision: "approved",
    previousJournalSequence: projection.lastSequence,
    journalSequence: projection.lastSequence + 1,
    humanPrincipalId: fixture.binding.humanPrincipalId,
    humanBindingId: fixture.binding.bindingId,
    signingKeyRef: fixture.binding.signingKeyRef,
    sourceRef: `test:runtime-replacement:${projection.lastSequence + 1}`,
    timestamp,
  };
  const entry = createProfileAwareRuntimeBindingSupersessionEntryV1({
    projection,
    trustedBindings: current.entries[0].payload.trustedBindings,
    priorBindingId: prior.binding.bindingId,
    priorBindingVersion: prior.binding.bindingVersion,
    binding: replacement,
    authorization: signedPayload(payload, fixture.privateKey),
  });
  await appendJournalEntry(fixture, entry);
}

async function appendDuplicatePublicationAuthority(fixture) {
  const current = await currentProfileJournal(fixture);
  const projection = current.projection;
  const prior = projection.publicationAuthorizations[0].authority;
  const sequence = projection.lastSequence + 1;
  const authority = { ...prior, authorityRef: `authorization:${MISSION_ID}:review-publish:${sequence}` };
  const timestamp = { value: "2026-08-11T12:02:00Z", provenance: "hostTrusted" };
  const payload = {
    schemaVersion: 1,
    authorizationId: authority.authorityRef,
    authorityDigest: computeReviewPublicationAuthorityDigest(authority),
    missionId: projection.missionId,
    subjectId: projection.brief.subjectId,
    missionRevisionId: projection.brief.revisionId,
    artifactRevisionId: authority.headRevisionId,
    authorityKind: "wheels_up",
    previousJournalSequence: projection.lastSequence,
    journalSequence: sequence,
    humanPrincipalId: fixture.binding.humanPrincipalId,
    humanBindingId: fixture.binding.bindingId,
    signingKeyRef: fixture.binding.signingKeyRef,
    sourceRef: `test:publication-duplicate:${sequence}`,
    timestamp,
  };
  const entry = createProfileAwareReviewPublicationAuthorizationEntryV1({
    projection,
    trustedBindings: current.entries[0].payload.trustedBindings,
    authority,
    authorization: signedPayload(payload, fixture.privateKey),
  });
  await appendJournalEntry(fixture, entry);
}

async function appendAuthorityRevocation(fixture) {
  const current = await currentProfileJournal(fixture);
  const projection = current.projection;
  const authority = projection.implementationAuthority;
  assert.ok(authority);
  const sequence = projection.lastSequence + 1;
  const payload = {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityRef: authority.authorityRef,
    authorityDigest: projection.implementationAuthorityDigest ?? computeImplementationAuthorityDigest(authority),
    authoritySequence: authority.journalSequence,
    missionId: projection.missionId,
    subjectId: projection.brief.subjectId,
    missionRevisionId: projection.brief.revisionId,
    previousJournalSequence: projection.lastSequence,
    journalSequence: sequence,
    humanPrincipalId: fixture.binding.humanPrincipalId,
    humanBindingId: fixture.binding.bindingId,
    signingKeyRef: fixture.binding.signingKeyRef,
    sourceRef: `test:authority-revocation:${sequence}`,
    timestamp: { value: "2026-08-11T12:02:00Z", provenance: "hostTrusted" },
  };
  const entry = createProfileAwareImplementationAuthorityRevocationEntryV1({
    projection,
    trustedBindings: current.entries[0].payload.trustedBindings,
    revocation: signedPayload(payload, fixture.privateKey),
  });
  await appendJournalEntry(fixture, entry);
}

async function resolutionFixture({
  implementationPath = "implementation.md",
  approvedRelativePaths = [implementationPath],
} = {}) {
  const repositoryRoot = await repository();
  await mkdir(join(repositoryRoot, ".shield"));
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const homeRoot = await mkdtemp(join(tmpdir(), "shield-270-signer-home-"));
  const createdSigner = await signerTestOnly.createSigner(
    { seatId: "coulson", bindingId: "binding:coulson", humanPrincipalId: "human:coulson" },
    "turnkey-passcode",
    { homeDirectory: homeRoot, generateKeyPair: () => ({ privateKey, publicKey }) },
  );
  const publicKeySpkiBase64 = createdSigner.publicKeySpkiBase64;
  const signingKeyRef = createdSigner.signingKeyRef;
  const binding = {
    schemaVersion: 1, bindingId: "binding:coulson", humanPrincipalId: "human:coulson", seatId: "coulson", missionScope: "*",
    signingKeyRef, publicKeySpkiBase64, validFromSequence: 0, validThroughSequence: null,
    attestedBy: "repository-policy:maintainer", provenanceRef: "repository-config:coulson",
  };
  const config = createShieldConfig({
    repositoryId: REPOSITORY_ID,
    repositoryTrustProfileId: "coulson_only_platform_review",
    coulsonBindingRef: signingKeyRef,
  });
  await writeFile(join(repositoryRoot, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(join(repositoryRoot, ".shield", ".gitignore"), "/journals/\n/audit/\n/tmp/\n/dispatch-receipts.jsonl\n");
  await writeFile(join(repositoryRoot, "package.json"), "{\"private\":true}\n");
  git(repositoryRoot, ["init", "-q"]);
  git(repositoryRoot, ["config", "user.email", "shield@example.invalid"]);
  git(repositoryRoot, ["config", "user.name", "SHIELD Host Fixture"]);
  git(repositoryRoot, ["remote", "add", "origin", `https://github.com/${REPOSITORY_ID}.git`]);
  git(repositoryRoot, ["add", ".shield/config.json", ".shield/.gitignore", "package.json"]);
  git(repositoryRoot, ["commit", "-qm", "preparation base"]);
  const baseRevision = git(repositoryRoot, ["rev-parse", "HEAD"]);
  await mkdir(dirname(join(repositoryRoot, implementationPath)), { recursive: true });
  await writeFile(join(repositoryRoot, implementationPath), "bounded implementation\n");
  git(repositoryRoot, ["add", implementationPath]);
  git(repositoryRoot, ["commit", "-qm", "preparation head"]);
  const headRevision = git(repositoryRoot, ["rev-parse", "HEAD"]);

  const plan = transitionPlan({
    planningBaseRevision: baseRevision,
    publicationPaths: [implementationPath],
    approvedRelativePaths,
  });
  const review = reviewForPlan(plan);
  const identity = dispatchIdentity(plan, review, { repositoryRevision: headRevision });
  const start = dispatchStarted(identity);
  const completed = dispatchLifecycle(start, identity, "dispatch.completed", { outputEvidenceRefs: reviewOutputRefs(review) });
  await writeDispatchLog(repositoryRoot, [start, completed]);
  await mkdir(join(repositoryRoot, ".shield", "tmp"));
  await writeFile(join(repositoryRoot, ".shield", "tmp", "transition-plan.json"), `${JSON.stringify(plan)}\n`);
  await writeFile(join(repositoryRoot, ".shield", "tmp", "transition-review.json"), `${JSON.stringify(review)}\n`);
  const recorded = spawnSync(process.execPath, [CLI, "mission", "record-reviewed-transition",
    "--transition-plan", ".shield/tmp/transition-plan.json", "--review-artifact", ".shield/tmp/transition-review.json",
    "--dispatch-receipt-id", identity.receiptId, "--mission-id", MISSION_ID, "--root", repositoryRoot], {
    cwd: repositoryRoot, encoding: "utf8", env: { ...process.env, HOME: homeRoot },
  });
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(JSON.parse(recorded.stdout).state, "materialized");

  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2, missionId: MISSION_ID, objective: "Exercise turnkey mission preparation.", subjectId: SUBJECT_ID,
    riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false },
    participants: ["hill", "may", "coulson", "fitz"].map((seatId) => ({ seatId })), activatedModes: [], requireSimmons: false,
    createdAt: { value: "2026-08-11T12:00:00Z", provenance: "humanRecorded" }, profileId: "standard", profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"], requiredFinalAcceptanceGateRoleIds: ["coulson"], predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const begun = createProfileAwareMissionBegunEntry(brief, [binding]);
  const journalPath = join(repositoryRoot, ".shield", "journals", `${Buffer.from(MISSION_ID).toString("base64url")}.jsonl`);
  await mkdir(join(repositoryRoot, ".shield", "journals"));
  await writeFile(journalPath, `${JSON.stringify(begun)}\n`);
  return {
    repositoryRoot,
    config,
    plan,
    privateKey,
    binding,
    headRevision,
    journalPath,
    graphPath: JSON.parse(recorded.stdout).graphPath,
    signerPath: createdSigner.signerPath,
    homeRoot,
    implementationPath,
  };
}

test("resolve compiles a fresh candidate, blocks before a PIN on drift, executes once, and returns an idempotent retry", async () => {
  const fixture = await resolutionFixture();
  const fresh = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });
  assert.equal(fresh.state, "ready", JSON.stringify(fresh));
  assert.deepEqual(fresh.candidate.actionInput, validateAuthorizeWheelsUpInput(fresh.candidate.actionInput));

  await writeFile(join(fixture.repositoryRoot, "dirty.txt"), "dirty\n");
  const blocked = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.reasonCode, "repository_observation_stale");
  const blockedCli = spawnSync(process.execPath, [CLI, "mission", "prepare-next", "--mission-id", MISSION_ID, "--root", fixture.repositoryRoot, "--json", "--passcode-stdin"], {
    cwd: fixture.repositoryRoot, encoding: "utf8", input: "unused\n", env: { ...process.env, HOME: fixture.homeRoot },
  });
  assert.equal(blockedCli.status, 1);
  assert.equal(JSON.parse(blockedCli.stdout).reasonCode, "repository_observation_stale");
  assert.doesNotMatch(blockedCli.stderr, /Passcode:/u);
  await import("node:fs/promises").then(({ unlink }) => unlink(join(fixture.repositoryRoot, "dirty.txt")));

  const calls = { render: 0, pin: 0, sign: 0, append: 0 };
  const executed = await executeAuthorizeWheelsUpV1({
    root: fixture.repositoryRoot,
    config: fixture.config,
    missionId: MISSION_ID,
    intent: validateAuthorizeWheelsUpInput(fresh.candidate.actionInput),
    timestamp: { value: "2026-08-11T12:01:00Z", provenance: "hostTrusted" },
    humanMode: false,
    promptOutput: { write: () => {} },
    expectedPreparation: expectedPreparation(fresh),
    dependencies: {
      renderDecision: () => { calls.render += 1; return "{}"; },
      readPasscode: async () => { calls.pin += 1; return "unused"; },
      signBatch: async (_binding, _passcode, payloads) => { calls.sign += 1; return payloads.map((payload) => sign(null, Buffer.from(canonicalJson(payload)), fixture.privateKey).toString("base64")); },
      appendBatchAtomic: async (input) => { calls.append += 1; return appendProfileAwareMissionEntriesAtomicV1(input); },
    },
  });
  assert.equal(executed, 0);
  assert.deepEqual(calls, { render: 1, pin: 1, sign: 1, append: 1 });

  const retry = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });
  assert.equal(retry.state, "already_authorized", JSON.stringify(retry));
  assert.equal(retry.headRevision, fixture.headRevision);
  assert.equal(retry.endingJournalSequence, 4);
});

test("resolve selects deterministic publication readiness at a clean strict descendant", async () => {
  const fixture = await resolutionFixture({
    implementationPath: "implementation/initial.md",
    approvedRelativePaths: ["implementation"],
  });
  await authorizeResolutionFixture(fixture);
  await writeFile(join(fixture.repositoryRoot, "implementation", "nested.md"), "review-ready change\n");
  git(fixture.repositoryRoot, ["add", "implementation/nested.md"]);
  git(fixture.repositoryRoot, ["commit", "-qm", "advance implementation"]);
  const publicationHead = git(fixture.repositoryRoot, ["rev-parse", "HEAD"]);

  const result = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });

  assert.equal(result.state, "publication_ready", JSON.stringify(result));
  assert.equal(result.protectedGraph.graphId.length > 0, true);
  assert.deepEqual(result.publicationIntent, {
    baseRevision: fixture.plan.planningBaseRevision,
    authorizedPaths: ["implementation/initial.md", "implementation/nested.md"],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
  });
  assert.equal(result.observation.initialHeadRevision, fixture.headRevision);
  assert.equal(result.observation.headRevision, publicationHead);
  assert.equal(result.observation.initialHeadAncestor, true);
  assert.equal(result.observation.workspaceClean, true);
  assert.deepEqual(result.observation.changedPaths, ["implementation/initial.md", "implementation/nested.md"]);

  const previousHome = process.env.HOME;
  process.env.HOME = fixture.homeRoot;
  try {
    const calls = { render: 0, pin: 0, sign: 0, append: 0 };
    const executed = await executeReviewPublicationAuthorizationV1({
      mode: "prepared",
      root: fixture.repositoryRoot,
      missionId: MISSION_ID,
      intent: result.publicationIntent,
      expectedPreparation: result,
      timestamp: { value: "2026-08-11T12:03:00Z", provenance: "hostTrusted" },
      humanMode: false,
      decisionOutput: { write: () => {} },
    }, {
      renderDecision: () => { calls.render += 1; return "{}"; },
      readPasscode: async () => { calls.pin += 1; return "unused"; },
      signPayload: async (_binding, _passcode, payload) => {
        calls.sign += 1;
        return sign(null, Buffer.from(canonicalJson(payload)), fixture.privateKey).toString("base64");
      },
      appendEntryAtomic: async (input) => {
        calls.append += 1;
        return appendProfileAwareMissionEntriesAtomicV1(input);
      },
    });
    assert.deepEqual(calls, { render: 1, pin: 1, sign: 1, append: 1 });
    const bytesAfterAuthorization = await readFile(fixture.journalPath, "utf8");

    const retry = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });
    assert.deepEqual(retry, {
      schemaVersion: 1,
      state: "publication_already_authorized",
      missionId: MISSION_ID,
      missionRevisionId: result.observation.missionRevisionId,
      authorizationId: executed.authorizationId,
      authorityDigest: executed.authorityDigest,
      journalSequence: executed.journalSequence,
    });
    assert.equal(await readFile(fixture.journalPath, "utf8"), bytesAfterAuthorization);

    await writeFile(join(fixture.repositoryRoot, "implementation", "nested.md"), "changed retry meaning\n");
    git(fixture.repositoryRoot, ["add", "implementation/nested.md"]);
    git(fixture.repositoryRoot, ["commit", "-qm", "change publication meaning"]);
    const changed = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });
    assert.equal(changed.state, "blocked", JSON.stringify(changed));
    assert.equal(changed.reasonCode, "authority_conflict");
    assert.equal(await readFile(fixture.journalPath, "utf8"), bytesAfterAuthorization);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test("publication selection fails closed on dirty, empty, scope-escaped, non-descendant, and non-regular changes", async () => {
  const variants = [
    {
      name: "dirty",
      reasonCode: "repository_observation_stale",
      mutate: async (fixture) => {
        await writeFile(join(fixture.repositoryRoot, fixture.implementationPath), "dirty implementation\n");
      },
    },
    {
      name: "empty",
      reasonCode: "authority_conflict",
      mutate: async (fixture) => {
        git(fixture.repositoryRoot, ["rm", "-q", fixture.implementationPath]);
        git(fixture.repositoryRoot, ["commit", "-qm", "remove implementation change"]);
      },
    },
    {
      name: "segment escape",
      reasonCode: "authority_conflict",
      mutate: async (fixture) => {
        await mkdir(join(fixture.repositoryRoot, "implementation.md-extra"));
        await writeFile(join(fixture.repositoryRoot, "implementation.md-extra", "escape.md"), "escape\n");
        git(fixture.repositoryRoot, ["add", "implementation.md-extra/escape.md"]);
        git(fixture.repositoryRoot, ["commit", "-qm", "attempt segment escape"]);
      },
    },
    {
      name: "non-descendant",
      reasonCode: "repository_observation_stale",
      mutate: async (fixture) => {
        git(fixture.repositoryRoot, ["checkout", "-q", "-B", "main", fixture.plan.planningBaseRevision]);
        await writeFile(join(fixture.repositoryRoot, fixture.implementationPath), "divergent implementation\n");
        git(fixture.repositoryRoot, ["add", fixture.implementationPath]);
        git(fixture.repositoryRoot, ["commit", "-qm", "divergent implementation"]);
      },
    },
    {
      name: "symlink",
      reasonCode: "repository_observation_stale",
      mutate: async (fixture) => {
        await unlink(join(fixture.repositoryRoot, fixture.implementationPath));
        await symlink("package.json", join(fixture.repositoryRoot, fixture.implementationPath));
        git(fixture.repositoryRoot, ["add", fixture.implementationPath]);
        git(fixture.repositoryRoot, ["commit", "-qm", "replace implementation with symlink"]);
      },
    },
  ];

  for (const variant of variants) {
    const fixture = await resolutionFixture();
    await authorizeResolutionFixture(fixture);
    await variant.mutate(fixture);
    const journalBefore = await readFile(fixture.journalPath);

    const result = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });

    assert.equal(result.state, "blocked", `${variant.name}: ${JSON.stringify(result)}`);
    assert.equal(result.reasonCode, variant.reasonCode, variant.name);
    assert.deepEqual(await readFile(fixture.journalPath), journalBefore, variant.name);
  }
});

test("real prepare-next CLI performs one key turn and an exact retry does not prompt or append", async () => {
  const fixture = await resolutionFixture();
  const first = spawnSync(process.execPath, [CLI, "mission", "prepare-next", "--mission-id", MISSION_ID, "--root", fixture.repositoryRoot, "--json", "--passcode-stdin"], {
    cwd: fixture.repositoryRoot,
    encoding: "utf8",
    input: "turnkey-passcode\n",
    env: { ...process.env, HOME: fixture.homeRoot },
  });
  assert.equal(first.status, 0, first.stderr);
  const receipt = JSON.parse(first.stdout);
  assert.equal(receipt.endingJournalSequence, 4);
  assert.deepEqual(receipt.constituents.map(({ eventType }) => eventType), [
    "governance.decided", "implementation.authorized", "runtime.binding_recorded", "review.publication_authorized",
  ]);
  const bytesAfterFirst = await readFile(fixture.journalPath, "utf8");

  const retry = spawnSync(process.execPath, [CLI, "mission", "prepare-next", "--mission-id", MISSION_ID, "--root", fixture.repositoryRoot, "--human"], {
    cwd: fixture.repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, HOME: fixture.homeRoot },
  });
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(retry.stdout, /^state: already_authorized\n/u);
  assert.equal(retry.stdout.includes(`authorizationManifestDigest: ${receipt.manifestDigest}\n`), true);
  assert.doesNotMatch(`${retry.stdout}${retry.stderr}`, /Passcode:/u);
  assert.equal(await readFile(fixture.journalPath, "utf8"), bytesAfterFirst);
});

test("executor rejects forged candidate identity, action projection, and linked observation projection before renderer or PIN", async () => {
  const fixture = await resolutionFixture();
  const fresh = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });
  assert.equal(fresh.state, "ready", JSON.stringify(fresh));
  const baseline = await protectedFixtureSnapshot(fixture);

  const forgedIdentity = reidentifyContract(fresh.candidate, {
    missionId: "mission:issue-999",
    decisionProjection: { ...fresh.candidate.decisionProjection, missionId: "mission:issue-999" },
  });
  const forgedAction = reidentifyContract(fresh.candidate, {
    actionInput: { ...fresh.candidate.actionInput, approvedActionIds: ["action:forged"] },
    decisionProjection: { ...fresh.candidate.decisionProjection, approvedActionIds: ["action:forged"] },
  });
  const forgedObservation = reidentifyContract(fresh.observation, { planningBaseRevision: "9".repeat(40) });
  const forgedObservationCandidate = reidentifyContract(fresh.candidate, {
    observationId: forgedObservation.id,
    observationDigest: forgedObservation.digest,
  });
  const cases = [
    { candidate: forgedIdentity, observation: fresh.observation, message: /preparation receipt does not bind/u },
    {
      candidate: forgedAction,
      observation: fresh.observation,
      suppliedIntent: validateAuthorizeWheelsUpInput(forgedAction.actionInput),
      message: /preparation receipt does not bind/u,
    },
    { candidate: fresh.candidate, observation: forgedObservation, message: /preparation receipt does not bind/u },
    { candidate: forgedObservationCandidate, observation: forgedObservation, message: /preparation receipt does not bind/u },
  ];

  for (const forged of cases) {
    const calls = { render: 0, pin: 0, sign: 0, append: 0 };
    await assert.rejects(() => executeAuthorizeWheelsUpV1({
      root: fixture.repositoryRoot,
      config: fixture.config,
      missionId: MISSION_ID,
      intent: forged.suppliedIntent ?? validateAuthorizeWheelsUpInput(fresh.candidate.actionInput),
      timestamp: { value: "2026-08-11T12:01:00Z", provenance: "hostTrusted" },
      humanMode: false,
      promptOutput: { write: () => {} },
      expectedPreparation: expectedPreparation(fresh, { candidate: forged.candidate, observation: forged.observation }),
      dependencies: {
        renderDecision: () => { calls.render += 1; return "{}"; },
        readPasscode: async () => { calls.pin += 1; return "unused"; },
        signBatch: async () => { calls.sign += 1; return []; },
        appendBatchAtomic: async () => { calls.append += 1; return { state: "invalid", code: "unexpected", errors: ["unexpected"] }; },
      },
    }), forged.message);
    assert.deepEqual(calls, { render: 0, pin: 0, sign: 0, append: 0 });
    assert.deepEqual(await protectedFixtureSnapshot(fixture), baseline);
  }
});

test("production executor rejects a forged legacy intent before renderer, PIN, signing, or append", async () => {
  const fixture = await resolutionFixture();
  const fresh = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });
  assert.equal(fresh.state, "ready", JSON.stringify(fresh));
  const baseline = await protectedFixtureSnapshot(fixture);
  const forgedIntent = validateAuthorizeWheelsUpInput({
    ...fresh.candidate.actionInput,
    approvedActionIds: ["action:forged-legacy-intent"],
  });
  const calls = { render: 0, pin: 0, sign: 0, append: 0 };

  await assert.rejects(() => executeAuthorizeWheelsUpV1({
    root: fixture.repositoryRoot,
    config: fixture.config,
    missionId: MISSION_ID,
    intent: forgedIntent,
    timestamp: { value: "2026-08-11T12:01:00Z", provenance: "hostTrusted" },
    humanMode: false,
    promptOutput: { write: () => {} },
    expectedPreparation: expectedPreparation(fresh),
    dependencies: {
      renderDecision: () => { calls.render += 1; return "{}"; },
      readPasscode: async () => { calls.pin += 1; return "unused"; },
      signBatch: async () => { calls.sign += 1; return []; },
      appendBatchAtomic: async () => { calls.append += 1; return { state: "invalid", code: "unexpected", errors: ["unexpected"] }; },
    },
  }), /input intent does not match the receipt-bound executor intent/u);

  assert.deepEqual(calls, { render: 0, pin: 0, sign: 0, append: 0 });
  assert.deepEqual(await protectedFixtureSnapshot(fixture), baseline);
});

test("already-authorized retry rejects partial, replaced, duplicate, revoked, and graph-mismatched provenance without effects", async () => {
  const variants = [
    {
      name: "partial",
      mutate: async (fixture) => {
        const lines = (await readFile(fixture.journalPath, "utf8")).trimEnd().split("\n");
        await writeFile(fixture.journalPath, `${lines.slice(0, 2).join("\n")}\n`);
      },
    },
    { name: "replaced", mutate: appendRuntimeReplacement },
    { name: "duplicate", mutate: appendDuplicatePublicationAuthority },
    { name: "revoked", mutate: appendAuthorityRevocation },
    { name: "mismatched", intentOverrides: { approvedActionIds: ["action:mismatched-270"] }, mutate: async () => {} },
  ];

  for (const variant of variants) {
    const fixture = await resolutionFixture();
    await authorizeResolutionFixture(fixture, variant.intentOverrides);
    await variant.mutate(fixture);
    const baseline = await protectedFixtureSnapshot(fixture);

    const result = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });
    assert.equal(result.state, "blocked", `${variant.name}: ${JSON.stringify(result)}`);
    assert.equal(result.reasonCode, "authority_conflict", variant.name);
    if (variant.name === "duplicate") assert.match(result.errors.join(" "), /#279/u);
    assert.deepEqual(await protectedFixtureSnapshot(fixture), baseline, variant.name);

    const cli = spawnSync(process.execPath, [CLI, "mission", "prepare-next", "--mission-id", MISSION_ID, "--root", fixture.repositoryRoot, "--json", "--passcode-stdin"], {
      cwd: fixture.repositoryRoot,
      encoding: "utf8",
      input: "must-not-be-read\n",
      env: { ...process.env, HOME: fixture.homeRoot },
    });
    assert.equal(cli.status, 1, `${variant.name}: ${cli.stderr}`);
    assert.equal(JSON.parse(cli.stdout).reasonCode, "authority_conflict", variant.name);
    assert.doesNotMatch(`${cli.stdout}${cli.stderr}`, /Passcode:|SHIELD_WHEELS_UP_MANIFEST_BEGIN/u, variant.name);
    assert.deepEqual(await protectedFixtureSnapshot(fixture), baseline, variant.name);
  }
});

test("already-authorized replay rejects one-snapshot journal replacement, malformed bytes, and differently-authorized bytes", async () => {
  for (const variant of ["malformed", "differently-authorized"]) {
    const fixture = await resolutionFixture();
    await authorizeResolutionFixture(fixture);
    const lines = (await readFile(fixture.journalPath, "utf8")).trimEnd().split("\n");
    assert.equal(lines.length, 5);
    if (variant === "malformed") lines[2] = "{";
    else lines[1] = lines[1].replace('"decision":"approved"', '"decision":"rejected"');
    await writeFile(fixture.journalPath, `${lines.join("\n")}\n`);
    const baseline = await protectedFixtureSnapshot(fixture);
    const result = await resolvePreparedMissionTransitionV1({ missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot });
    assert.equal(result.state, "blocked", `${variant}: ${JSON.stringify(result)}`);
    assert.equal(result.reasonCode, "authority_conflict", variant);
    assert.deepEqual(await protectedFixtureSnapshot(fixture), baseline, variant);
    const cli = spawnSync(process.execPath, [CLI, "mission", "prepare-next", "--mission-id", MISSION_ID, "--root", fixture.repositoryRoot, "--json", "--passcode-stdin"], {
      cwd: fixture.repositoryRoot,
      encoding: "utf8",
      input: "must-not-be-read\n",
      env: { ...process.env, HOME: fixture.homeRoot },
    });
    assert.equal(cli.status, 1, `${variant}: ${cli.stderr}`);
    assert.equal(JSON.parse(cli.stdout).reasonCode, "authority_conflict", variant);
    assert.doesNotMatch(`${cli.stdout}${cli.stderr}`, /Passcode:|SHIELD_WHEELS_UP_MANIFEST_BEGIN/u, variant);
    assert.deepEqual(await protectedFixtureSnapshot(fixture), baseline, variant);
  }

  const fixture = await resolutionFixture();
  await authorizeResolutionFixture(fixture);
  const originalBytes = await readFile(fixture.journalPath);
  const replacementBytes = Buffer.from(originalBytes.toString("utf8").replace('"decision":"approved"', '"decision":"rejected"'));
  const baseline = await nonAttackerEvidenceSnapshot(fixture);
  let attacked = false;
  const result = await resolvePreparedMissionTransitionV1ForTest(
    { missionId: MISSION_ID, repositoryRoot: fixture.repositoryRoot },
    {
      readHandle: async (handle, size) => {
        const bytes = Buffer.alloc(size);
        let offset = 0;
        while (offset < size) {
          const read = await handle.read(bytes, offset, size - offset, offset);
          if (read.bytesRead === 0) break;
          offset += read.bytesRead;
        }
        assert.equal(offset, size);
        if (!attacked) {
          attacked = true;
          await rename(fixture.journalPath, `${fixture.journalPath}.attacker-original`);
          await writeFile(fixture.journalPath, replacementBytes);
        }
        return bytes;
      },
    },
  );
  assert.equal(attacked, true);
  assert.equal(result.state, "blocked", JSON.stringify(result));
  assert.equal(result.reasonCode, "authority_conflict");
  assert.deepEqual(await nonAttackerEvidenceSnapshot(fixture), baseline);
});
