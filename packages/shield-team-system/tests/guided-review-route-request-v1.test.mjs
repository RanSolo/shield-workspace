import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, link, mkdtemp, mkdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1 } from "../dist/guided-review-playbooks-v1.mjs";
import { createGuidedReviewDriverReceiptV1 } from "../dist/guided-review-driver-v1.mjs";
import {
  createGuidedReviewPlanV1,
  createGuidedReviewRuntimeHandoffV1,
} from "../dist/guided-review-v1.mjs";
import {
  createGuidedReviewRouteRequestV1,
  materializeGuidedReviewRouteRequestV1,
  readGuidedReviewRouteRequestV1,
  resolveGuidedReviewRoutePackagePathsV1,
  validateGuidedReviewRouteRequestV1,
} from "../dist/guided-review-route-request-v1.mjs";
import { canonicalJson } from "../dist/mission-v2.mjs";

const head = "1".repeat(40);
const digest = (character) => `sha256:${character.repeat(43)}`;
const template = BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1.find(({ kind }) => kind === "backend");
assert.ok(template);

function input(overrides = {}) {
  const missionId = overrides.missionId ?? "mission:issue-238";
  const subjectId = overrides.subjectId ?? "issue:238";
  const repositoryId = overrides.repositoryId ?? "RanSolo/shield-workspace";
  const branch = overrides.branch ?? "agent/guided-review-238";
  const exactRevision = overrides.exactRevision ?? head;
  const policyMode = overrides.policyMode ?? "required";
  const kind = overrides.kind ?? "backend";
  const participantRelationship = overrides.participantRelationship ?? "independent_reviewer";
  const planResult = createGuidedReviewPlanV1({
    schemaVersion: 1,
    contractVersion: "guided.review.v1",
    planId: "plan:route-request:238",
    missionId,
    subjectId,
    kind,
    required: policyMode === "required",
    rationale: "Prepare a Fury-authored exact-head review route.",
    method: "code_review",
    participantRelationship,
    coveredCriterionRefs: ["AC-1"],
    evidenceRequirements: ["Exact-head named observations."],
    exactRevision,
    gateOwnerSeatId: "coulson",
  });
  assert.equal(planResult.state, "ready", JSON.stringify(planResult));
  const driverResult = createGuidedReviewDriverReceiptV1({
    schemaVersion: 1,
    contractVersion: "guided.review.driver.v1",
    driverId: "driver:route-request",
    driverVersion: "v1",
    executorRef: "executor:route-request",
    exactRevision,
    environmentRef: "environment:route-request",
    status: "ready",
    capabilities: ["code_review"],
    scenarioRefs: ["scenario:route-request"],
    evidenceRefs: ["evidence:route-request"],
    effectClass: "read_only",
    detail: "Exact-head route-request fixture.",
  });
  assert.equal(driverResult.state, "ready", JSON.stringify(driverResult));
  const runtimeResult = createGuidedReviewRuntimeHandoffV1({
    status: "ready",
    repositoryId,
    canonicalWorktreeRef: "worktree:route-request",
    branch,
    exactRevision,
    builderSeatId: "may",
    builderBindingRef: "binding:may:route-request",
    reasoningRuntimeId: "runtime:route-request",
    toolExecutorId: "executor:route-request",
    dependencyBuildReceiptRef: "receipt:build:route-request",
    environmentRef: "environment:route-request",
    fixtureRef: "fixture:route-request",
    resourceBindingsRef: "bindings:route-request:redacted",
    endpointOwnershipRef: "ownership:route-request",
    portPreflightRef: "preflight:port:route-request",
    watcherPreflightRef: "preflight:watcher:route-request",
    externalEffectPolicyRef: "policy:no-external-effects",
    launchCommandRef: "command:route-request",
    healthProbeRef: "probe:route-request",
    reviewUrl: "http://127.0.0.1:4173/",
    teardownRef: "command:stop:route-request",
    recoveryRef: "recovery:route-request",
    driverReceipt: driverResult.value,
  });
  assert.equal(runtimeResult.state, "ready", JSON.stringify(runtimeResult));
  return {
    schemaVersion: 1,
    contractVersion: "guided.review.route-request.v1",
    authority: "none",
    missionId,
    missionRevisionId: digest("A"),
    subjectId,
    repositoryId,
    branch,
    exactRevision,
    protectedGraphId: "graph:route-request:238",
    protectedGraphDigest: digest("B"),
    transitionPlanId: "transition-plan:route-request:238",
    transitionPlanDigest: digest("C"),
    parentPlanReviewEvidenceId: "parent-review:route-request:238",
    parentPlanReviewEvidenceDigest: digest("D"),
    policyMode,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    templateDigest: template.templateDigest,
    templateRouteGraphDigest: template.routeGraphDigest,
    kind,
    plan: planResult.value,
    acceptanceCriteria: [{ criterionId: "AC-1", text: "Fury prepares the exact formal route lazily." }],
    runtimeHandoff: runtimeResult.value,
    participantRelationship,
    ...overrides,
  };
}

function request(overrides = {}) {
  const result = createGuidedReviewRouteRequestV1(input(overrides));
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}

async function root(prefix = "shield-guided-route-request-") {
  return mkdtemp(join(tmpdir(), prefix));
}

test("route preparation request is closed, content-addressed, and cross-bound exactly", () => {
  const body = input();
  const created = createGuidedReviewRouteRequestV1(body);
  assert.equal(created.state, "ready", JSON.stringify(created));
  const expectedDigest = `sha256:${createHash("sha256").update(canonicalJson(body)).digest("base64url")}`;
  assert.equal(created.value.requestDigest, expectedDigest);
  assert.equal(created.value.requestId, `guided-review-route-request:${expectedDigest.slice("sha256:".length)}`);
  assert.equal(validateGuidedReviewRouteRequestV1(created.value).state, "ready");
  assert.equal(createGuidedReviewRouteRequestV1({ ...body, extra: true }).state, "invalid");
  assert.equal(validateGuidedReviewRouteRequestV1({ ...created.value, requestId: "guided-review-route-request:substituted" }).state, "invalid");
  assert.equal(validateGuidedReviewRouteRequestV1({ ...created.value, exactRevision: "2".repeat(40) }).state, "invalid");

  const mismatches = [
    { plan: request().plan, missionId: "mission:substituted" },
    { plan: request().plan, subjectId: "issue:substituted" },
    { runtimeHandoff: request().runtimeHandoff, repositoryId: "RanSolo/substituted" },
    { runtimeHandoff: request().runtimeHandoff, branch: "agent/substituted" },
    { runtimeHandoff: request().runtimeHandoff, exactRevision: "2".repeat(40) },
    { templateDigest: digest("E") },
    { templateRouteGraphDigest: digest("F") },
    { policyMode: "operator_optional" },
    { participantRelationship: "builder" },
  ];
  for (const mismatch of mismatches) {
    assert.equal(createGuidedReviewRouteRequestV1({ ...body, ...mismatch }).state, "invalid", JSON.stringify(mismatch));
  }
});

test("package paths are deterministic beneath the request content ID", async () => {
  const workspaceRoot = await root();
  const value = request();
  const resolved = await resolveGuidedReviewRoutePackagePathsV1(workspaceRoot, value);
  assert.equal(resolved.state, "ready", JSON.stringify(resolved));
  const contentId = value.requestDigest.slice("sha256:".length);
  const directory = join(workspaceRoot, ".shield", "tmp", "guided-review", contentId);
  assert.deepEqual(resolved.value, {
    contentId,
    packageDirectory: directory,
    routeRequestPath: join(directory, "route-request.json"),
    routeOverlayPath: join(directory, "route-overlay.json"),
    playbookPath: join(directory, "playbook.json"),
    sessionPath: join(directory, "session.json"),
  });
});

test("materialization is exclusive, identical retry is idempotent, and conflicting bytes are preserved", async () => {
  const workspaceRoot = await root();
  const value = request();
  const first = await materializeGuidedReviewRouteRequestV1(workspaceRoot, value);
  assert.equal(first.state, "ready", JSON.stringify(first));
  const bytes = await readFile(first.value.routeRequestPath, "utf8");
  assert.equal(bytes, canonicalJson(value));
  const retry = await materializeGuidedReviewRouteRequestV1(workspaceRoot, value);
  assert.equal(retry.state, "ready", JSON.stringify(retry));
  assert.deepEqual(retry.value, first.value);
  assert.equal(await readFile(first.value.routeRequestPath, "utf8"), bytes);

  await unlink(first.value.routeRequestPath);
  await writeFile(first.value.routeRequestPath, "conflicting bytes\n", { mode: 0o600 });
  const conflict = await materializeGuidedReviewRouteRequestV1(workspaceRoot, value);
  assert.equal(conflict.state, "invalid");
  assert.equal(conflict.code, "REQUEST_ALREADY_EXISTS");
  assert.equal(await readFile(first.value.routeRequestPath, "utf8"), "conflicting bytes\n");
});

test("readback rejects symlinked, hard-linked, replaced, and malformed request bytes", async (t) => {
  await t.test("symlink", async () => {
    const workspaceRoot = await root();
    const value = request();
    const materialized = await materializeGuidedReviewRouteRequestV1(workspaceRoot, value);
    assert.equal(materialized.state, "ready");
    const outside = join(await root("shield-guided-route-request-outside-"), "request.json");
    await writeFile(outside, `${canonicalJson(value)}\n`, { mode: 0o600 });
    await unlink(materialized.value.routeRequestPath);
    await symlink(outside, materialized.value.routeRequestPath);
    assert.equal((await readGuidedReviewRouteRequestV1(workspaceRoot, materialized.value.contentId)).state, "invalid");
  });

  await t.test("hard link", async () => {
    const workspaceRoot = await root();
    const value = request();
    const materialized = await materializeGuidedReviewRouteRequestV1(workspaceRoot, value);
    assert.equal(materialized.state, "ready");
    const outside = join(await root("shield-guided-route-request-hardlink-"), "request.json");
    await link(materialized.value.routeRequestPath, outside);
    assert.equal((await readGuidedReviewRouteRequestV1(workspaceRoot, materialized.value.contentId)).state, "invalid");
  });

  for (const [name, bytes] of [["replaced", `${canonicalJson(request({ exactRevision: "2".repeat(40) }))}\n`], ["malformed", "{}\n"]]) {
    await t.test(name, async () => {
      const workspaceRoot = await root();
      const value = request();
      const materialized = await materializeGuidedReviewRouteRequestV1(workspaceRoot, value);
      assert.equal(materialized.state, "ready");
      await unlink(materialized.value.routeRequestPath);
      await writeFile(materialized.value.routeRequestPath, bytes, { mode: 0o600 });
      await chmod(materialized.value.routeRequestPath, 0o600);
      assert.equal((await readGuidedReviewRouteRequestV1(workspaceRoot, materialized.value.contentId)).state, "invalid");
    });
  }
});

test("materialization rejects symlinked package ancestry", async () => {
  const workspaceRoot = await root();
  const outside = await root("shield-guided-route-request-ancestry-");
  await mkdir(join(workspaceRoot, ".shield"));
  await symlink(outside, join(workspaceRoot, ".shield", "tmp"));
  const result = await materializeGuidedReviewRouteRequestV1(workspaceRoot, request());
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "REQUEST_MATERIALIZATION_FAILED");
});
