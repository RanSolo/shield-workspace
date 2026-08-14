import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { MessageChannel } from "node:worker_threads";

import * as api from "../dist/index.mjs";

const exclusions = [
  "review.comment.publish",
  "review.pull_request.update_draft",
  "review.pull_request.mark_ready",
  "merge",
  "deployment",
  "release",
  "final_acceptance",
];

function unwrap(result) {
  assert.equal(result.state, "valid", result.state === "invalid" ? result.errors.join(" ") : "");
  return result.value;
}

function artifact(body) {
  const digest = unwrap(api.computeCanonicalContractDigestV1({ schemaId: body.schemaId, body }));
  const id = unwrap(api.computeContentIdV1({ schemaId: body.schemaId, digest }));
  return { ...body, id, digest };
}

function intakeTemplate(overrides = {}) {
  return artifact({
    schemaId: "mission.profile-aware-intake-template.v1",
    authority: "none",
    schemaVersion: 2,
    missionId: "mission:issue-269",
    objective: "Compile the reviewed fresh Wheels Up transition.",
    subjectId: "issue-269",
    riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false },
    participants: [{ seatId: "coulson" }, { seatId: "may" }],
    activatedModes: [{ modeId: "delivery", modeVersion: "1", seatId: "may", activationSource: "hill_reviewed" }],
    requireSimmons: false,
    createdAt: { value: "2026-08-13T12:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: `sha256:${"a".repeat(64)}`,
    ...overrides,
  });
}

function fixture() {
  const plan = artifact({
    schemaId: "mission.transition-plan.v1",
    authority: "none",
    missionId: "mission:issue-269",
    subjectId: "issue-269",
    repositoryId: "RanSolo/shield-workspace",
    planningBaseRevision: "a".repeat(40),
    parentPlanCommit: "b".repeat(40),
    parentPlanPath: "docs/missions/issue-268-key-turn-plan.md",
    parentPlanRawSha256: "c".repeat(64),
    transitionKind: "fresh_authorize_wheels_up",
    boundedOutcome: "Compile the reviewed fresh Wheels Up transition.",
    approvedRelativePaths: ["package-lock.json", "packages/mission-preparation/package.json"].sort((a, b) => a.localeCompare(b)),
    publicationPaths: ["docs/missions/issue-268-key-turn-plan.md", "docs/missions/issue-269-mission-preparation-plan.md"].sort(),
    approvedActionIds: ["repository.run_validation", "repository.write_file"].sort((a, b) => a.localeCompare(b)),
    approvedEffectClasses: ["behavioral_implementation", "verification"].sort((a, b) => a.localeCompare(b)),
    approvedEffectKeys: ["effect:issue-269:implementation", "effect:issue-269:validation"].sort((a, b) => a.localeCompare(b)),
    approvedCapabilities: ["filesystem_write", "process_execute"].sort((a, b) => a.localeCompare(b)),
    validationCommandIds: ["validation:build", "validation:test"].sort((a, b) => a.localeCompare(b)),
    modelId: "gpt-5.6-sol",
    reasoningRuntimeId: "runtime:codex-hosted-may-sol",
    toolExecutorId: "executor:codex-hosted-workspace-tools",
    exclusions,
  });
  const reviewEvidence = artifact({
    schemaId: "mission.parent-plan-review-evidence.v1",
    authority: "none",
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    parentPlanCommit: plan.parentPlanCommit,
    parentPlanPath: plan.parentPlanPath,
    parentPlanRawSha256: plan.parentPlanRawSha256,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    verdict: "PASS",
    reviewerSeatId: "fury",
    reviewerRuntimeId: "runtime:fury-hosted",
    reviewerModelId: "gpt-fury",
    reviewerExecutorId: "executor:fury-tools",
    rawReceiptSetSha256: `sha256:${"d".repeat(64)}`,
    attributionClass: "team_system_projection",
    preparationEligibility: "preparationEligible",
  });
  const intent = artifact({
    schemaId: "mission.transition-intent.v1",
    authority: "none",
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    parentReviewEvidenceId: reviewEvidence.id,
    parentReviewEvidenceDigest: reviewEvidence.digest,
    transitionKind: "fresh_authorize_wheels_up",
    preparationEligibility: "preparationEligible",
  });
  const observation = artifact({
    schemaId: "mission.fresh-authorize-wheels-up-observation.v1",
    authority: "none",
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    repositoryId: plan.repositoryId,
    canonicalRoot: "/private/tmp/shield-worktree",
    branch: "agent/issue-269-mission-preparation",
    planningBaseRevision: plan.planningBaseRevision,
    baseRevision: plan.planningBaseRevision,
    headRevision: "e".repeat(40),
    baseAncestor: true,
    workspaceClean: true,
    changedPaths: [...plan.publicationPaths],
    symlinkPaths: [],
    gitlinkPaths: [],
    missionSchemaVersion: 9,
    authorizationState: "waiting",
    implementationAuthorityState: "waiting",
    finalAcceptanceState: "waiting",
    executionState: "not-started",
    implementationAuthorityCount: 0,
    runtimeBindingCount: 0,
    activeRuntimeBindingCount: 0,
    publicationAuthorizationCount: 0,
    pendingCoulsonMissionAuthorizationCount: 1,
    journalSequence: 7,
    journalSha256: `sha256:${"f".repeat(64)}`,
    signerBindingId: "binding:coulson:1",
    signingKeyRef: `ed25519:sha256:${"A".repeat(43)}`,
    signerBindingMatchCount: 1,
    remainingHumanGates: ["coulson.final_acceptance", "fitz.technical_review"],
    preparationEligibility: "preparationEligible",
  });
  return { plan, reviewEvidence, intent, observation };
}

test("the package exposes exactly the approved runtime API", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "canonicalJsonV1",
    "compileFreshAuthorizeWheelsUpCandidateV1",
    "computeCanonicalContractDigestV1",
    "computeContentIdV1",
    "computeRawReceiptSetSha256V1",
    "prepareMissionTransitionV1",
    "selectNextTransitionV1",
    "validateFreshAuthorizeWheelsUpCandidateV1",
    "validateFreshAuthorizeWheelsUpObservationV1",
    "validateNextTransitionSelectionV1",
    "validateParentPlanReviewEvidenceV1",
    "validatePreparationReceiptV1",
    "validateProfileAwareMissionIntakeTemplateV1",
    "validateTransitionIntentV1",
    "validateTransitionPlanV1",
    "validateTransitionPlanV1OrV2",
    "validateTransitionPlanV2",
  ].sort());
});

test("reviewed intake template and transition plan v2 are closed content-addressed contracts", () => {
  const template = intakeTemplate();
  assert.equal(api.validateProfileAwareMissionIntakeTemplateV1({ artifact: template }).state, "valid");
  assert.match(template.id, /^profile-aware-intake-template:[A-Za-z0-9_-]{43}$/u);
  const legacy = fixture().plan;
  const { id: _id, digest: _digest, schemaId: _schemaId, ...legacyBody } = legacy;
  const plan = artifact({ ...legacyBody, schemaId: "mission.transition-plan.v2", intakeTemplate: template });
  assert.equal(api.validateTransitionPlanV2({ artifact: plan }).state, "valid");
  assert.equal(api.validateTransitionPlanV1OrV2({ artifact: plan }).state, "valid");
  assert.match(plan.id, /^transition-plan:[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(plan.digest, legacy.digest);
  assert.equal(api.validateTransitionPlanV1({ artifact: plan }).state, "invalid");

  const otherTemplate = intakeTemplate({ missionId: "mission:other" });
  const substituted = artifact({ ...legacyBody, schemaId: "mission.transition-plan.v2", intakeTemplate: otherTemplate });
  assert.equal(api.validateTransitionPlanV2({ artifact: substituted }).state, "invalid");
  assert.equal(api.validateTransitionPlanV2({ artifact: { ...plan, intakeTemplate: { ...template, digest: `sha256:${"Z".repeat(43)}` } } }).state, "invalid");
});

test("intake template rejects hostile, non-canonical, duplicate, unsorted, oversized, and extra data", () => {
  const body = ({ id, digest, ...value }) => value;
  const valid = intakeTemplate();
  const variants = [
    { participants: [{ seatId: "may" }, { seatId: "coulson" }] },
    { participants: [{ seatId: "coulson" }, { seatId: "coulson" }] },
    { participants: [{ seatId: "coulson" }] },
    { participants: Array.from({ length: 17 }, (_, index) => ({ seatId: `seat:${String(index).padStart(2, "0")}` })) },
    { activatedModes: [] },
    { activatedModes: [{ modeId: "delivery", modeVersion: "1", seatId: "may", activationSource: "z" }, { modeId: "delivery", modeVersion: "1", seatId: "may", activationSource: "a" }] },
    { requiredExecutionGateRoleIds: ["coulson", "coulson"] },
    { profileId: "high_assurance", requiredExecutionGateRoleIds: ["coulson"], requireSimmons: false },
    { extra: true },
  ];
  for (const override of variants) {
    const candidate = artifact({ ...body(valid), ...override });
    assert.equal(api.validateProfileAwareMissionIntakeTemplateV1({ artifact: candidate }).state, "invalid");
  }
  let invoked = false;
  const accessor = { ...body(valid) };
  Object.defineProperty(accessor, "participants", { enumerable: true, get() { invoked = true; return []; } });
  assert.equal(api.validateProfileAwareMissionIntakeTemplateV1({ artifact: accessor }).state, "invalid");
  assert.equal(invoked, false);
  assert.equal(api.validateProfileAwareMissionIntakeTemplateV1({ artifact: new Proxy(valid, {}) }).state, "invalid");
  const hidden = body(valid);
  Object.defineProperty(hidden, "hidden", { value: true });
  assert.equal(api.validateProfileAwareMissionIntakeTemplateV1({ artifact: hidden }).state, "invalid");
});

test("canonical JSON uses UTF-16 ordering without normalization", () => {
  const result = api.canonicalJsonV1({ value: { "é": 4, z: 3, Z: 2, "e\u0301": 1 } });
  assert.deepEqual(result, { state: "valid", value: "{\"Z\":2,\"é\":1,\"z\":3,\"é\":4}" });
  assert.notEqual(unwrap(api.canonicalJsonV1({ value: "é" })), unwrap(api.canonicalJsonV1({ value: "e\u0301" })));
});

test("hostile and non-canonical data is rejected without invoking caller code", () => {
  let invoked = false;
  const accessor = {};
  Object.defineProperty(accessor, "x", { enumerable: true, get() { invoked = true; return 1; } });
  assert.equal(api.canonicalJsonV1({ value: accessor }).state, "invalid");
  assert.equal(invoked, false);

  const proxy = new Proxy({}, { ownKeys() { invoked = true; throw new Error("trap"); } });
  assert.equal(api.canonicalJsonV1({ value: proxy }).state, "invalid");
  assert.equal(invoked, false);

  const sparse = [];
  sparse.length = 1;
  for (const value of [-0, Number.NaN, Number.POSITIVE_INFINITY, undefined, sparse, new Date(), { [Symbol("x")]: 1 }]) {
    assert.equal(api.canonicalJsonV1({ value }).state, "invalid");
  }
  const hidden = {};
  Object.defineProperty(hidden, "x", { value: 1 });
  assert.equal(api.canonicalJsonV1({ value: hidden }).state, "invalid");
  assert.equal(api.canonicalJsonV1({ value: {}, extra: true }).state, "invalid");
});

test("revoked proxy arguments are rejected", () => {
  const { proxy, revoke } = Proxy.revocable({ value: { z: 1 } }, {});
  revoke();
  const result = api.canonicalJsonV1(proxy);
  assert.equal(result.state, "invalid");
  assert.equal(result.reasonCode, "invalid_preparation_input");
});

test("canonical contract digest and ID are stable in a fresh process", () => {
  const body = { schemaId: "mission.transition-intent.v1", authority: "none", value: { z: 1, A: 2 } };
  const local = unwrap(api.computeCanonicalContractDigestV1({ schemaId: body.schemaId, body }));
  const source = `import {computeCanonicalContractDigestV1 as f} from ${JSON.stringify(new URL("../dist/index.mjs", import.meta.url).href)};console.log(f(${JSON.stringify({ schemaId: body.schemaId, body })}).value)`;
  const fresh = execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8" }).trim();
  assert.equal(fresh, local);
  assert.match(unwrap(api.computeContentIdV1({ schemaId: body.schemaId, digest: local })), /^transition-intent:[A-Za-z0-9_-]{43}$/);
});

test("raw receipt framing binds count, lengths, order, and bytes", () => {
  const receipts = [new Uint8Array([0, 1]), new Uint8Array([2, 3, 4])];
  const count = Buffer.alloc(8); count.writeBigUInt64BE(2n);
  const one = Buffer.alloc(8); one.writeBigUInt64BE(2n);
  const two = Buffer.alloc(8); two.writeBigUInt64BE(3n);
  const frame = Buffer.concat([Buffer.from("mission.raw-receipt-set.v1"), Buffer.from([0]), count, one, Buffer.from(receipts[0]), two, Buffer.from(receipts[1])]);
  const expected = `sha256:${createHash("sha256").update(frame).digest("hex")}`;
  assert.equal(unwrap(api.computeRawReceiptSetSha256V1({ rawReceipts: receipts })), expected);
  const variants = [
    [receipts[1], receipts[0]],
    [new Uint8Array([0]), receipts[1]],
    [new Uint8Array([0, 2]), receipts[1]],
    [receipts[0], new Uint8Array([2, 3, 4, 0])],
  ];
  for (const rawReceipts of variants) assert.notEqual(unwrap(api.computeRawReceiptSetSha256V1({ rawReceipts })), expected);
  assert.equal(api.computeRawReceiptSetSha256V1({ rawReceipts: [] }).state, "invalid");
  assert.equal(api.computeRawReceiptSetSha256V1({ rawReceipts: Array.from({ length: 129 }, () => new Uint8Array([1])) }).state, "invalid");
  assert.equal(api.computeRawReceiptSetSha256V1({ rawReceipts: [new Uint8Array()] }).state, "invalid");
  assert.equal(api.computeRawReceiptSetSha256V1({ rawReceipts: [new Uint8Array(1_048_577)] }).state, "invalid");
});

test("detached receipt bytes are rejected without throwing", () => {
  const receipt = new Uint8Array([1, 2, 3, 4]);
  const detached = new MessageChannel();
  detached.port1.postMessage(receipt, [receipt.buffer]);
  detached.port1.close();
  detached.port2.close();
  const result = api.computeRawReceiptSetSha256V1({ rawReceipts: [receipt] });
  assert.equal(result.state, "invalid");
  assert.equal(result.reasonCode, "invalid_preparation_input");
});

test("all seven validators recompute IDs and recursively freeze clones", () => {
  const values = fixture();
  const ready = api.prepareMissionTransitionV1(values);
  assert.equal(ready.state, "ready");
  const cases = [
    [api.validateTransitionPlanV1, values.plan],
    [api.validateParentPlanReviewEvidenceV1, values.reviewEvidence],
    [api.validateTransitionIntentV1, values.intent],
    [api.validateFreshAuthorizeWheelsUpObservationV1, values.observation],
    [api.validateNextTransitionSelectionV1, ready.selection],
    [api.validateFreshAuthorizeWheelsUpCandidateV1, ready.candidate],
    [api.validatePreparationReceiptV1, ready.receipt],
  ];
  for (const [validate, value] of cases) {
    const checked = validate({ artifact: value });
    assert.equal(checked.state, "valid");
    assert.notEqual(checked.value, value);
    assert.equal(Object.isFrozen(checked), true);
    assert.equal(Object.isFrozen(checked.value), true);
  }
  const substituted = { ...values.plan, digest: `sha256:${"A".repeat(43)}` };
  assert.equal(api.validateTransitionPlanV1({ artifact: substituted }).state, "invalid");
  assert.equal(api.validateTransitionPlanV1({ artifact: { ...values.plan, productionEligible: true } }).state, "invalid");
});

test("review attribution equality rules are exact", () => {
  const { reviewEvidence } = fixture();
  const body = ({ id, digest, ...rest }) => rest;
  const permittedModelAlias = artifact({ ...body(reviewEvidence), reviewerModelId: reviewEvidence.reviewerRuntimeId });
  assert.equal(api.validateParentPlanReviewEvidenceV1({ artifact: permittedModelAlias }).state, "valid");
  for (const changed of [
    { reviewerRuntimeId: "fury" },
    { reviewerExecutorId: "fury" },
    { reviewerExecutorId: reviewEvidence.reviewerRuntimeId },
  ]) {
    assert.equal(api.validateParentPlanReviewEvidenceV1({ artifact: artifact({ ...body(reviewEvidence), ...changed }) }).state, "invalid");
  }
});

test("transition plan and intent preserve the initial-runtime-binding graph identity", () => {
  const values = fixture();
  const body = ({ id, digest, ...rest }) => rest;
  const plan = artifact({ ...body(values.plan), transitionKind: "initial_runtime_binding" });
  const intent = artifact({
    ...body(values.intent),
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    transitionKind: "initial_runtime_binding",
  });
  assert.equal(api.validateTransitionPlanV1({ artifact: plan }).state, "valid");
  assert.equal(api.validateTransitionIntentV1({ artifact: intent }).state, "valid");
  assert.notEqual(plan.id, values.plan.id);
  assert.notEqual(intent.id, values.intent.id);
});
