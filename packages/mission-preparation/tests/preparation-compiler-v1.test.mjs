import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import * as api from "../dist/index.mjs";

const exclusions = ["review.comment.publish", "review.pull_request.update_draft", "review.pull_request.mark_ready", "merge", "deployment", "release", "final_acceptance"];

function unwrap(result) {
  assert.equal(result.state, "valid", result.state === "invalid" ? result.errors.join(" ") : "");
  return result.value;
}

function artifact(body) {
  const digest = unwrap(api.computeCanonicalContractDigestV1({ schemaId: body.schemaId, body }));
  return { ...body, id: unwrap(api.computeContentIdV1({ schemaId: body.schemaId, digest })), digest };
}

function initialArtifact(body, prefix) {
  const serialized = unwrap(api.canonicalJsonV1({ value: body }));
  const digest = `sha256:${createHash("sha256").update(Buffer.concat([
    Buffer.from(body.schemaId), Buffer.from([0]), Buffer.from(serialized),
  ])).digest("base64url")}`;
  return { ...body, id: `${prefix}:${digest.slice("sha256:".length)}`, digest };
}

function withoutAddress(value) {
  const { id, digest, ...body } = value;
  return body;
}

function graph(changes = {}) {
  const transitionKind = changes.plan?.transitionKind ?? "fresh_authorize_wheels_up";
  const plan = artifact({
    schemaId: "mission.transition-plan.v1", authority: "none", missionId: "mission:issue-269", subjectId: "issue-269", repositoryId: "RanSolo/shield-workspace",
    planningBaseRevision: "a".repeat(40), parentPlanCommit: "b".repeat(40), parentPlanPath: "docs/missions/issue-268-key-turn-plan.md", parentPlanRawSha256: "c".repeat(64),
    transitionKind, boundedOutcome: "Prepare exactly one authority-none candidate.",
    approvedRelativePaths: ["package-lock.json", "packages/mission-preparation/package.json"],
    publicationPaths: ["docs/missions/issue-268-key-turn-plan.md", "docs/missions/issue-269-mission-preparation-plan.md"],
    approvedActionIds: ["repository.run_validation", "repository.write_file"], approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: ["effect:issue-269:implementation", "effect:issue-269:validation"], approvedCapabilities: ["filesystem_write", "process_execute"],
    validationCommandIds: ["validation:build", "validation:test"], modelId: "gpt-5.6-sol", reasoningRuntimeId: "runtime:codex-hosted-may-sol",
    toolExecutorId: "executor:codex-hosted-workspace-tools", exclusions, ...changes.plan,
  });
  const reviewEvidence = artifact({
    schemaId: "mission.parent-plan-review-evidence.v1", authority: "none", repositoryId: plan.repositoryId, planningBaseRevision: plan.planningBaseRevision,
    parentPlanCommit: plan.parentPlanCommit, parentPlanPath: plan.parentPlanPath, parentPlanRawSha256: plan.parentPlanRawSha256, transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest, verdict: "PASS", reviewerSeatId: "fury", reviewerRuntimeId: "runtime:fury-hosted", reviewerModelId: "gpt-fury",
    reviewerExecutorId: "executor:fury-tools", rawReceiptSetSha256: `sha256:${"d".repeat(64)}`, attributionClass: "team_system_projection",
    preparationEligibility: "preparationEligible", ...changes.review,
  });
  const intent = artifact({
    schemaId: "mission.transition-intent.v1", authority: "none", missionId: plan.missionId, subjectId: plan.subjectId, repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision, transitionPlanId: plan.id, transitionPlanDigest: plan.digest, parentReviewEvidenceId: reviewEvidence.id,
    parentReviewEvidenceDigest: reviewEvidence.digest, transitionKind, preparationEligibility: "preparationEligible", ...changes.intent,
  });
  const observation = transitionKind === "initial_runtime_binding" ? initialArtifact({
    schemaId: "mission.initial-runtime-binding-observation.v1", authority: "none", missionId: plan.missionId, subjectId: plan.subjectId,
    missionRevisionId: `sha256:${"M".repeat(43)}`, repositoryId: plan.repositoryId, canonicalRoot: "/private/tmp/shield-worktree",
    branch: "agent/issue-269-mission-preparation", planningBaseRevision: plan.planningBaseRevision, headRevision: "e".repeat(40), baseAncestor: true,
    workspaceClean: true, symlinkPaths: [], gitlinkPaths: [], missionSchemaVersion: 9, authorizationState: "authorized",
    implementationAuthorityState: "authorized", finalAcceptanceState: "waiting", executionState: "not-started", implementationAuthorityCount: 1,
    runtimeBindingCount: 0, activeRuntimeBindingCount: 0, pendingCoulsonMissionAuthorizationCount: 0, journalSequence: 2,
    journalSha256: `sha256:${"f".repeat(64)}`, signerBindingId: "binding:coulson:1", signingKeyRef: `ed25519:sha256:${"A".repeat(43)}`,
    signerBindingMatchCount: 1, implementationAuthorityRef: "authority:mission:issue-269:2", implementationAuthorityDigest: `sha256:${"I".repeat(43)}`,
    implementationAuthoritySequence: 2, authorityMissionId: plan.missionId, authoritySubjectId: plan.subjectId, authorityRepositoryId: plan.repositoryId,
    authorityCanonicalWritableRoot: "/private/tmp/shield-worktree", authorityBranch: "agent/issue-269-mission-preparation",
    authorityBaseRevision: plan.planningBaseRevision, authorityHeadRevision: "e".repeat(40), authorityArtifactRevisionId: "e".repeat(40), authorityModelId: plan.modelId,
    authorityApprovedRelativePaths: [...plan.approvedRelativePaths], authorityApprovedActionIds: [...plan.approvedActionIds],
    authorityApprovedEffectClasses: [...plan.approvedEffectClasses], authorityApprovedEffectKeys: [...plan.approvedEffectKeys],
    authorityApprovedCapabilities: [...plan.approvedCapabilities], authorityValidationCommandIds: [...plan.validationCommandIds],
    remainingHumanGates: ["coulson.final_acceptance", "fitz.technical_review"], preparationEligibility: "preparationEligible", ...changes.observation,
  }, "initial-runtime-binding-observation") : artifact({
    schemaId: "mission.fresh-authorize-wheels-up-observation.v1", authority: "none", missionId: plan.missionId, subjectId: plan.subjectId, repositoryId: plan.repositoryId,
    canonicalRoot: "/private/tmp/shield-worktree", branch: "agent/issue-269-mission-preparation", planningBaseRevision: plan.planningBaseRevision,
    baseRevision: plan.planningBaseRevision, headRevision: "e".repeat(40), baseAncestor: true, workspaceClean: true, changedPaths: [...plan.publicationPaths],
    symlinkPaths: [], gitlinkPaths: [], missionSchemaVersion: 9, authorizationState: "waiting", implementationAuthorityState: "waiting",
    finalAcceptanceState: "waiting", executionState: "not-started", implementationAuthorityCount: 0, runtimeBindingCount: 0, activeRuntimeBindingCount: 0,
    publicationAuthorizationCount: 0, pendingCoulsonMissionAuthorizationCount: 1, journalSequence: 7, journalSha256: `sha256:${"f".repeat(64)}`,
    signerBindingId: "binding:coulson:1", signingKeyRef: `ed25519:sha256:${"A".repeat(43)}`, signerBindingMatchCount: 1,
    remainingHumanGates: ["coulson.final_acceptance", "fitz.technical_review"], preparationEligibility: "preparationEligible", ...changes.observation,
  });
  return { plan, reviewEvidence, intent, observation };
}

function reasonCode(values) {
  const result = api.selectNextTransitionV1(values);
  assert.equal(result.state, "selected");
  return result.selection.reasonCode;
}

test("the selector implements rows 1 through 7", () => {
  assert.deepEqual(api.selectNextTransitionV1({}), { state: "invalid", reasonCode: "invalid_preparation_input", errors: ["Preparation argument has unexpected fields."] });
  assert.equal(reasonCode(graph({ observation: { missionId: "mission:other" } })), "reviewed_plan_mismatch");
  assert.equal(reasonCode(graph({ review: { verdict: "FAIL" } })), "parent_plan_review_ineligible");
  assert.equal(reasonCode(graph({ review: { attributionClass: "synthetic_test" } })), "parent_plan_review_ineligible");
  assert.equal(reasonCode(graph({ observation: { workspaceClean: false } })), "repository_observation_stale");
  assert.equal(reasonCode(graph({ observation: { branch: "HEAD" } })), "repository_observation_stale");
  assert.equal(reasonCode(graph({ observation: { missionSchemaVersion: 8 } })), "fresh_wheels_up_state_ineligible");
  assert.equal(reasonCode(graph({ observation: { signerBindingId: null, signingKeyRef: null, signerBindingMatchCount: 0 } })), "freshness_evidence_incomplete");
  assert.equal(reasonCode(graph()), null);
  assert.equal(reasonCode(graph({ observation: { journalSequence: 0 } })), null);
});

test("first-match precedence is stable for pairwise and wider failures", () => {
  const cases = [
    [{ observation: { missionId: "mission:other" }, review: { verdict: "FAIL" } }, "reviewed_plan_mismatch"],
    [{ review: { verdict: "FAIL" }, observation: { workspaceClean: false } }, "parent_plan_review_ineligible"],
    [{ observation: { workspaceClean: false, missionSchemaVersion: 8 } }, "repository_observation_stale"],
    [{ observation: { missionSchemaVersion: 8, signerBindingId: null, signingKeyRef: null, signerBindingMatchCount: 0 } }, "fresh_wheels_up_state_ineligible"],
    [{ review: { verdict: "FAIL" }, observation: { workspaceClean: false, missionSchemaVersion: 8, signerBindingId: null, signingKeyRef: null, signerBindingMatchCount: 0 } }, "parent_plan_review_ineligible"],
  ];
  for (const [changes, expected] of cases) assert.equal(reasonCode(graph(changes)), expected);
});

test("ready preparation derives the exact candidate and receipt graph", () => {
  const values = graph();
  const prepared = api.prepareMissionTransitionV1(values);
  assert.equal(prepared.state, "ready");
  assert.equal(prepared.selection.transitionKind, "authorize-wheels-up");
  assert.deepEqual(prepared.candidate.eventKinds, ["governance.decided", "implementation.authorized", "runtime.binding_recorded", "review.publication_authorized"]);
  assert.deepEqual(prepared.candidate.publicationEffects, ["review.branch.push", "review.pull_request.create_draft"]);
  assert.deepEqual(prepared.candidate.exclusions, exclusions);
  assert.equal(prepared.candidate.actionInput.baseRevision, values.plan.planningBaseRevision);
  assert.equal(prepared.candidate.decisionProjection.headRevision, values.observation.headRevision);
  assert.equal(prepared.receipt.candidateId, prepared.candidate.id);
  assert.equal(prepared.receipt.rawReceiptSetSha256, values.reviewEvidence.rawReceiptSetSha256);
  assert.equal("productionEligible" in prepared.candidate, false);
  assert.equal(Object.isFrozen(prepared.candidate.actionInput.approvedRelativePaths), true);

  const compiled = api.compileFreshAuthorizeWheelsUpCandidateV1({ ...values, selection: prepared.selection });
  assert.equal(compiled.state, "valid");
  assert.deepEqual(compiled.value, prepared.candidate);
});

test("initial runtime binding uses a distinct closed observation and candidate contract", () => {
  const values = graph({ plan: { transitionKind: "initial_runtime_binding" } });
  const prepared = api.prepareMissionTransitionV1(values);
  assert.equal(prepared.state, "ready", prepared.errors?.join(" "));
  assert.equal(prepared.selection.transitionKind, "initial-runtime-binding");
  assert.equal(prepared.candidate.schemaId, "mission.initial-runtime-binding-candidate.v1");
  assert.match(prepared.candidate.id, /^initial-runtime-binding-candidate:[A-Za-z0-9_-]{43}$/u);
  assert.equal(prepared.candidate.bindingId, `binding:${values.plan.missionId}:may:1`);
  assert.equal("eventKinds" in prepared.candidate, false);
  assert.equal("publicationEffects" in prepared.candidate, false);
  assert.equal("publicationPaths" in prepared.candidate.actionInput, false);
  assert.equal("publicationPaths" in prepared.candidate.decisionProjection, false);
  assert.equal(api.validateFreshAuthorizeWheelsUpCandidateV1({ artifact: prepared.candidate }).state, "invalid");
  assert.equal(prepared.receipt.candidateId, prepared.candidate.id);

  assert.equal(reasonCode(graph({ plan: { transitionKind: "initial_runtime_binding" }, observation: { authorityModelId: "model:other" } })), "implementation_authority_mismatch");
  assert.equal(reasonCode(graph({ plan: { transitionKind: "initial_runtime_binding" }, observation: { authorityArtifactRevisionId: "9".repeat(40) } })), "implementation_authority_mismatch");
  assert.equal(reasonCode(graph({ plan: { transitionKind: "initial_runtime_binding" }, observation: { runtimeBindingCount: 1 } })), "initial_runtime_binding_state_ineligible");
});

test("blocked preparation emits only a content-addressed selection", () => {
  const result = api.prepareMissionTransitionV1(graph({ observation: { workspaceClean: false } }));
  assert.equal(result.state, "blocked");
  assert.deepEqual(Object.keys(result).sort(), ["selection", "state"]);
  assert.match(result.selection.id, /^next-transition-selection:/);
});

test("digest edge substitution and stale ready selections cannot compile", () => {
  const values = graph();
  const prepared = api.prepareMissionTransitionV1(values);
  assert.equal(prepared.state, "ready");
  const other = graph({ observation: { headRevision: "9".repeat(40) } });
  assert.equal(api.compileFreshAuthorizeWheelsUpCandidateV1({ ...other, selection: prepared.selection }).state, "invalid");

  const changedIntent = artifact({ ...withoutAddress(values.intent), transitionPlanDigest: `sha256:${"Z".repeat(43)}` });
  assert.equal(reasonCode({ ...values, intent: changedIntent }), "reviewed_plan_mismatch");
});

test("fixed facts cannot be overridden even with recomputed addresses", () => {
  const result = api.prepareMissionTransitionV1(graph());
  assert.equal(result.state, "ready");
  const changedEvents = artifact({ ...withoutAddress(result.candidate), eventKinds: ["implementation.authorized"] });
  const changedEffects = artifact({ ...withoutAddress(result.candidate), publicationEffects: ["review.pull_request.mark_ready"] });
  const changedExclusions = artifact({ ...withoutAddress(result.candidate), exclusions: ["merge"] });
  for (const candidate of [changedEvents, changedEffects, changedExclusions]) {
    assert.equal(api.validateFreshAuthorizeWheelsUpCandidateV1({ artifact: candidate }).state, "invalid");
  }
  assert.equal(api.prepareMissionTransitionV1({ ...graph(), eventKinds: [] }).state, "invalid");
});

test("May identity aliasing is rejected while permitted reviewer equalities remain eligible", () => {
  assert.equal(reasonCode(graph({ plan: { modelId: "runtime:codex-hosted-may-sol" } })), "reviewed_plan_mismatch");
  assert.equal(reasonCode(graph({ plan: { modelId: "may" } })), "reviewed_plan_mismatch");
  const crossStage = graph({ review: { reviewerRuntimeId: "runtime:codex-hosted-may-sol", reviewerModelId: "gpt-5.6-sol", reviewerExecutorId: "executor:codex-hosted-workspace-tools" } });
  assert.equal(reasonCode(crossStage), null);
});

test("input mutation and hostile caller objects cannot affect or throw from results", () => {
  const values = graph();
  const prepared = api.prepareMissionTransitionV1(values);
  assert.equal(prepared.state, "ready");
  values.plan.approvedRelativePaths.push("z");
  assert.equal(prepared.candidate.actionInput.approvedRelativePaths.includes("z"), false);

  let invoked = false;
  const proxy = new Proxy({}, { ownKeys() { invoked = true; throw new Error("caller code"); } });
  assert.doesNotThrow(() => api.prepareMissionTransitionV1({ plan: proxy, reviewEvidence: {}, intent: {}, observation: {} }));
  assert.equal(invoked, false);
});
