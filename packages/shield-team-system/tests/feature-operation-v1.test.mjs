import assert from "node:assert/strict";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import test from "node:test";

import {
  FEATURE_OPERATION_AUTHORITY_KIND,
  FEATURE_OPERATION_BLOCKED_REASONS,
  FEATURE_OPERATION_CONTRACT_VERSION,
  FEATURE_OPERATION_CONTRACT_VERSION_V2,
  FEATURE_OPERATION_DERIVATION_KINDS,
  FEATURE_OPERATION_FIXED_EXCLUSIONS,
  FEATURE_OPERATION_PROHIBITED_EFFECTS,
  FEATURE_OPERATION_SCHEMA_VERSION,
  FEATURE_OPERATION_SCHEMA_VERSION_V2,
  compareFeatureOperationAmendmentV1,
  computeFeatureOperationAuthorityDigestV1,
  computeFeatureOperationDerivedCandidateDigestV1,
  computeFeatureOperationPlanDigestV1,
  computeFeatureOperationAuthorityDigestV2,
  computeFeatureOperationDerivedCandidateDigestV2,
  computeFeatureOperationPlanDigestV2,
  evaluateFeatureOperationDerivedCandidateV1,
  evaluateFeatureOperationDerivedCandidateV2,
  validateFeatureOperationAuthorityV1,
  validateFeatureOperationDerivedCandidateV1,
  validateFeatureOperationPlanV1,
  validateFeatureOperationReplayContextV1,
  validateFeatureOperationAuthorityV2,
  validateFeatureOperationDerivedCandidateV2,
  validateFeatureOperationPlanV2,
  validateFeatureOperationReplayContextV2,
  validateSignedFeatureOperationAuthorityV1,
  verifySignedFeatureOperationAuthorityV1,
  verifySignedFeatureOperationAuthorityV2,
} from "@shield/team-system/feature-operation";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";

const ZERO_DIGEST = `sha256:${"0".repeat(64)}`;
const digest = (character) => `sha256:${character.repeat(64)}`;
const revision = (character) => character.repeat(40);
const copy = (value) => structuredClone(value);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
      .map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function independentlyDigest(kind, value, ownDigestField) {
  const content = copy(value);
  delete content[ownDigestField];
  const framed = Buffer.concat([
    Buffer.from("shield.feature-operation.v1\0", "ascii"),
    Buffer.from(`${kind}\0`, "ascii"),
    Buffer.from(JSON.stringify(canonical(content)), "utf8"),
  ]);
  return `sha256:${createHash("sha256").update(framed).digest("hex")}`;
}

const privateKey = createPrivateKey({
  key: Buffer.from(`302e020100300506032b657004220420${"42".repeat(32)}`, "hex"),
  format: "der",
  type: "pkcs8",
});
const publicKey = createPublicKey(privateKey);
const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);

function withPlanDigest(input) {
  const plan = { ...copy(input), planDigest: ZERO_DIGEST };
  plan.planDigest = computeFeatureOperationPlanDigestV1(plan);
  return plan;
}

function withAuthorityDigest(input) {
  const authority = { ...copy(input), authorityDigest: ZERO_DIGEST };
  authority.authorityDigest = computeFeatureOperationAuthorityDigestV1(authority);
  return authority;
}

function withCandidateDigest(input) {
  const candidate = { ...copy(input), candidateDigest: ZERO_DIGEST };
  candidate.candidateDigest = computeFeatureOperationDerivedCandidateDigestV1(candidate);
  return candidate;
}

function signAuthority(authority) {
  const bytes = Buffer.concat([
    Buffer.from("shield.feature-operation.authority.signature.v1\0", "ascii"),
    Buffer.from(JSON.stringify(canonical(authority)), "utf8"),
  ]);
  return { payload: copy(authority), signatureBase64: sign(null, bytes, privateKey).toString("base64") };
}

const effectKey = (derivation, character) => `effect:${derivation}:${character.repeat(64)}`;
const effects = {
  childPublication: effectKey("child_draft_pr_create", "1"),
  childImplementation: effectKey("child_implementation", "2"),
  childInitiation: effectKey("child_initiation", "3"),
  childIntegration: effectKey("child_merge_to_feature", "4"),
  childRollback: effectKey("child_revert_on_feature", "5"),
  featureBranch: effectKey("feature_branch_create", "6"),
  workspacePublication: effectKey("feature_workspace_draft_pr_create", "7"),
  betaInitiation: effectKey("child_initiation", "8"),
};
const effectKeys = [
  effects.childPublication,
  effects.childImplementation,
  effects.childInitiation,
  effects.childIntegration,
  effects.childRollback,
  effects.featureBranch,
  effects.workspacePublication,
];
const childDerivations = FEATURE_OPERATION_DERIVATION_KINDS.filter((item) => item.startsWith("child_"));

function child(childId, order, dependsOn, path) {
  return {
    childId,
    order,
    objective: `Implement ${childId}`,
    dependsOn,
    branchName: `agent/${childId.replace(":", "-")}`,
    repositoryId: "repo:shield",
    riskClassification: "moderate",
    acceptanceCriterionIds: [order === 0 ? "criterion:alpha" : "criterion:beta"],
    permittedDerivations: childDerivations,
    allowedRelativePaths: [path],
    allowedActionIds: ["branch_create", "draft_pr_create", "integrate", "repository_edit", "revert"],
    allowedEffectKeys: effectKeys,
    allowedCapabilityIds: ["child_branch_write", "child_pr_write", "feature_branch_write", "feature_workspace_pr_write", "repository_write"],
    allowedValidationIds: ["build", "test"],
    allowedPublicationOperations: ["draft_pr_create"],
    requiredGates: { mack: true, fury: true, humanGateIds: ["fitz"] },
    exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS,
    maxImplementationAttempts: 3,
    maxPublicationAttempts: 2,
    maxIntegrationAttempts: 2,
    maxRollbackAttempts: 1,
    maxRetries: 2,
  };
}

const plan = withPlanDigest({
  schemaVersion: 1,
  contractVersion: "feature.operation.v1",
  operationId: "operation:225",
  objective: "Deliver one finite feature operation",
  sourceProvenance: { authority: "none", sourceRef: "issue:225" },
  repositoryId: "repo:shield",
  baseBranch: "main",
  baseRevision: revision("a"),
  baseTreeDigest: digest("1"),
  featureBranch: "feature/issue-225",
  acceptanceCriteria: [
    { criterionId: "criterion:alpha", statement: "Alpha is complete" },
    { criterionId: "criterion:beta", statement: "Beta is complete" },
  ],
  children: [
    child("child:alpha", 0, [], "packages/alpha"),
    child("child:beta", 1, ["child:alpha"], "packages/beta"),
  ],
  eligibilityOrder: ["child:alpha", "child:beta"],
  integrationPolicy: { targetBranch: "feature/issue-225", allowedMethods: ["merge_commit", "squash"] },
  lifecyclePolicy: {
    amendmentsRequireFreshAuthority: true,
    pauseSupported: true,
    cancellationSupported: true,
    rollbackMethod: "revert_commit",
    expiryEnforced: true,
    escalationOnAmbiguity: true,
  },
  limits: {
    maxDurationSeconds: 3600,
    maxChildren: 2,
    maxConcurrency: 1,
    maxFeatureBranchCreateAttempts: 1,
    maxFeatureWorkspaceDraftPrAttempts: 1,
    maxTotalChildAttempts: 20,
    maxTotalIntegrationAttempts: 4,
    maxTotalRollbackAttempts: 2,
    maxCapturedEvidence: 20,
  },
  finalGates: { fitzRequired: true, simmons: "conditional", coulsonRequired: true },
  exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS,
  expiresAt: "2029-05-01T01:00:00Z",
  planSequence: 0,
  predecessorPlanDigest: null,
});

const authority = withAuthorityDigest({
  schemaVersion: 1,
  contractVersion: "feature.operation.v1",
  authorityKind: "epic_wheels_up",
  authorityId: "authority:225:0",
  missionId: "mission:225",
  operationId: plan.operationId,
  plan,
  planDigest: plan.planDigest,
  repositoryId: plan.repositoryId,
  baseBranch: plan.baseBranch,
  baseRevision: plan.baseRevision,
  featureBranch: plan.featureBranch,
  operationSequence: 7,
  journalSequence: 12,
  issuedAt: "2029-05-01T00:00:00Z",
  expiresAt: "2029-05-01T01:00:00Z",
  limits: plan.limits,
  permittedDerivations: FEATURE_OPERATION_DERIVATION_KINDS,
  prohibitedEffects: FEATURE_OPERATION_PROHIBITED_EFFECTS,
  humanPrincipalId: "human:coulson",
  humanBindingId: "binding:coulson:225",
  signingKeyRef,
});
const envelope = signAuthority(authority);
const binding = {
  schemaVersion: 1,
  bindingId: authority.humanBindingId,
  humanPrincipalId: authority.humanPrincipalId,
  seatId: "coulson",
  missionScope: authority.missionId,
  signingKeyRef,
  publicKeySpkiBase64,
  validFromSequence: 0,
  validThroughSequence: null,
  attestedBy: "repository-policy:maintainer",
  provenanceRef: "repository-config:coulson",
};
const verificationInput = {
  expectedMissionId: authority.missionId,
  expectedOperationId: authority.operationId,
  expectedOperationSequence: authority.operationSequence,
  expectedJournalSequence: authority.journalSequence,
  trustedBindings: [binding],
};

function reviewEvidence(head = revision("b")) {
  return [
    { evidenceRef: "evidence:fitz", gateType: "human", gateId: "fitz", childId: "child:alpha", repositoryId: plan.repositoryId, headRevision: head, sourceRecordDigest: digest("6") },
    { evidenceRef: "evidence:fury", gateType: "fury", gateId: "fury", childId: "child:alpha", repositoryId: plan.repositoryId, headRevision: head, sourceRecordDigest: digest("7") },
    { evidenceRef: "evidence:mack", gateType: "mack", gateId: "mack", childId: "child:alpha", repositoryId: plan.repositoryId, headRevision: head, sourceRecordDigest: digest("8") },
  ];
}

function replayContext(overrides = {}) {
  const evidence = reviewEvidence();
  return {
    schemaVersion: 1,
    contractVersion: "feature.operation.v1",
    repositoryId: plan.repositoryId,
    operationId: plan.operationId,
    activePlan: copy(plan),
    activePlanDigest: plan.planDigest,
    verifiedAuthorityId: authority.authorityId,
    verifiedAuthorityDigest: authority.authorityDigest,
    acceptedAuthorityOperationSequence: authority.operationSequence,
    currentJournalSequence: authority.journalSequence,
    acceptedPlanLineage: [{ planSequence: 0, planDigest: plan.planDigest, predecessorPlanDigest: null, authorityDigest: authority.authorityDigest, active: true }],
    acceptedAmendmentDigests: [],
    lifecycle: { state: "active", atOperationSequence: 0 },
    transitions: [{
      kind: "genesis",
      operationSequence: 0,
      effectKey: "effect:genesis",
      priorHeadRevision: plan.baseRevision,
      priorTreeDigest: plan.baseTreeDigest,
      resultingHeadRevision: plan.baseRevision,
      resultingTreeDigest: plan.baseTreeDigest,
      receiptDigest: digest("2"),
    }],
    acceptedIntegrations: [],
    acceptedRollbacks: [],
    consumedEffectKeys: ["effect:genesis"],
    childCounters: [
      { childId: "child:alpha", initiationAttempts: 0, implementationAttempts: 0, publicationAttempts: 0, integrationAttempts: 0, rollbackAttempts: 0, retryAttempts: 0 },
      { childId: "child:beta", initiationAttempts: 0, implementationAttempts: 0, publicationAttempts: 0, integrationAttempts: 0, rollbackAttempts: 0, retryAttempts: 0 },
    ],
    activeLeases: [],
    operationCounters: {
      featureBranchCreateAttempts: 0,
      featureWorkspaceDraftPrAttempts: 0,
      totalChildAttempts: 0,
      totalIntegrationAttempts: 0,
      totalRollbackAttempts: 0,
      capturedEvidenceCount: evidence.length,
    },
    observedAt: { value: "2029-05-01T00:30:00Z", provenance: "hostTrusted" },
    acceptedReviewEvidence: evidence,
    ...copy(overrides),
  };
}

function requestedScope(effectKey, path = "packages/alpha") {
  const derivation = effectKey.split(":")[1];
  const policies = {
    feature_branch_create: { actionIds: ["branch_create"], capabilityIds: ["feature_branch_write"], validationIds: [], publicationOperations: [] },
    feature_workspace_draft_pr_create: { actionIds: ["draft_pr_create"], capabilityIds: ["feature_workspace_pr_write"], validationIds: [], publicationOperations: ["draft_pr_create"] },
    child_initiation: { actionIds: ["branch_create"], capabilityIds: ["child_branch_write"], validationIds: [], publicationOperations: [] },
    child_implementation: { actionIds: ["repository_edit"], capabilityIds: ["repository_write"], validationIds: ["build", "test"], publicationOperations: [] },
    child_draft_pr_create: { actionIds: ["draft_pr_create"], capabilityIds: ["child_pr_write"], validationIds: [], publicationOperations: ["draft_pr_create"] },
    child_merge_to_feature: { actionIds: ["integrate"], capabilityIds: ["feature_branch_write"], validationIds: ["test"], publicationOperations: [] },
    child_revert_on_feature: { actionIds: ["revert"], capabilityIds: ["feature_branch_write"], validationIds: ["test"], publicationOperations: [] },
  };
  const policy = policies[derivation];
  return {
    relativePaths: [path],
    actionIds: policy?.actionIds ?? [],
    effectKeys: [effectKey],
    capabilityIds: policy?.capabilityIds ?? [],
    validationIds: policy?.validationIds ?? [],
    publicationOperations: policy?.publicationOperations ?? [],
    requiredGates: { mack: true, fury: true, humanGateIds: ["fitz"] },
    exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS,
    requestedAttempts: 1,
    requestedRetries: 0,
  };
}

function candidate(derivationKind, extra, effectKey) {
  const stages = {
    feature_branch_create: "initiation",
    feature_workspace_draft_pr_create: "initiation",
    child_initiation: "initiation",
    child_implementation: "implementation",
    child_draft_pr_create: "child_publication",
    child_merge_to_feature: "integration",
    child_revert_on_feature: "rollback",
  };
  return withCandidateDigest({
    schemaVersion: 1,
    contractVersion: "feature.operation.v1",
    repositoryId: plan.repositoryId,
    operationId: plan.operationId,
    planDigest: plan.planDigest,
    authorityDigest: authority.authorityDigest,
    stage: stages[derivationKind],
    derivationKind,
    effectKey,
    requestedScope: requestedScope(effectKey),
    ...extra,
  });
}

const candidates = {
  featureBranch: candidate("feature_branch_create", { sourceRevision: plan.baseRevision, targetBranch: plan.featureBranch }, effects.featureBranch),
  workspacePr: candidate("feature_workspace_draft_pr_create", { sourceBranch: plan.featureBranch, targetBranch: plan.baseBranch, draftOnly: true }, effects.workspacePublication),
  initiation: candidate("child_initiation", { childId: "child:alpha", sourceFeatureHead: plan.baseRevision, childBranch: "agent/child-alpha" }, effects.childInitiation),
  implementation: candidate("child_implementation", { childId: "child:alpha", childBaseRevision: plan.baseRevision, childBranch: "agent/child-alpha" }, effects.childImplementation),
  publication: candidate("child_draft_pr_create", { childId: "child:alpha", childBranch: "agent/child-alpha", childHeadRevision: revision("b"), targetBranch: plan.featureBranch, draftOnly: true }, effects.childPublication),
  integration: candidate("child_merge_to_feature", {
    childId: "child:alpha",
    childBranch: "agent/child-alpha",
    childHeadRevision: revision("b"),
    childTreeDigest: digest("5"),
    targetBranch: plan.featureBranch,
    integrationMethod: "merge_commit",
    predecessorIntegrationReceiptDigest: null,
    reviewEvidenceRefs: ["evidence:fitz", "evidence:fury", "evidence:mack"],
  }, effects.childIntegration),
};

function integrationReplay() {
  const replay = replayContext();
  replay.transitions.push({
    kind: "integration",
    operationSequence: 1,
    effectKey: effects.childIntegration,
    priorHeadRevision: plan.baseRevision,
    priorTreeDigest: plan.baseTreeDigest,
    resultingHeadRevision: revision("c"),
    resultingTreeDigest: digest("3"),
    receiptDigest: digest("4"),
    childId: "child:alpha",
    childHeadRevision: revision("b"),
    childTreeDigest: digest("5"),
  });
  replay.acceptedIntegrations = [{
    childId: "child:alpha",
    operationSequence: 1,
    effectKey: effects.childIntegration,
    priorHeadRevision: plan.baseRevision,
    priorTreeDigest: plan.baseTreeDigest,
    resultingHeadRevision: revision("c"),
    resultingTreeDigest: digest("3"),
    receiptDigest: digest("4"),
    reverted: false,
  }];
  replay.consumedEffectKeys = [effects.childIntegration, "effect:genesis"].sort();
  replay.childCounters[0].integrationAttempts = 1;
  replay.operationCounters.totalIntegrationAttempts = 1;
  return replay;
}

const rollbackCandidate = candidate("child_revert_on_feature", {
  childId: "child:alpha",
  integrationReceiptDigest: digest("4"),
  integrationHeadRevision: revision("c"),
  integrationTreeDigest: digest("3"),
  expectedRestoredTreeDigest: plan.baseTreeDigest,
  targetBranch: plan.featureBranch,
  rollbackMethod: "revert_commit",
}, effects.childRollback);

function evaluate(candidateInput, replayInput = replayContext(), planInput = plan, envelopeInput = envelope, verification = verificationInput) {
  return evaluateFeatureOperationDerivedCandidateV1(planInput, envelopeInput, verification, replayInput, candidateInput);
}

test("publishes the fixed Feature Operation constants", () => {
  assert.equal(FEATURE_OPERATION_SCHEMA_VERSION, 1);
  assert.equal(FEATURE_OPERATION_CONTRACT_VERSION, "feature.operation.v1");
  assert.equal(FEATURE_OPERATION_AUTHORITY_KIND, "epic_wheels_up");
  assert.deepEqual(FEATURE_OPERATION_BLOCKED_REASONS, [
    "PLAN_INVALID", "SIGNED_AUTHORITY_INVALID", "TRUSTED_COULSON_BINDING_INVALID", "AUTHORITY_SIGNATURE_INVALID",
    "REPLAY_CONTEXT_INVALID", "IDENTITY_OR_DIGEST_MISMATCH", "AUTHORITY_OR_LINEAGE_INACTIVE", "LIFECYCLE_BLOCKED",
    "SEQUENCE_MISMATCH", "AUTHORITY_EXPIRED", "CANDIDATE_INVALID", "STAGE_OR_EVIDENCE_INAPPLICABLE",
    "CHILD_OR_DEPENDENCY_INELIGIBLE", "FEATURE_OR_CHILD_REVISION_STALE", "SCOPE_NOT_STRICT_SUBSET",
    "BRANCH_TARGET_OR_METHOD_INVALID", "INTEGRATION_EVIDENCE_INVALID", "BOUNDS_EXHAUSTED", "EFFECT_KEY_REUSED",
  ]);
});

test("validates frozen defensive copies and fixed independent digest/signature vectors", () => {
  const planResult = validateFeatureOperationPlanV1(plan);
  const authorityResult = validateFeatureOperationAuthorityV1(authority);
  const envelopeResult = validateSignedFeatureOperationAuthorityV1(envelope);
  assert.equal(planResult.state, "valid");
  assert.equal(authorityResult.state, "valid");
  assert.equal(envelopeResult.state, "valid");
  assert.notEqual(planResult.value, plan);
  assert.equal(Object.isFrozen(planResult.value.children[0].requiredGates), true);
  assert.equal(Object.isFrozen(authorityResult.value.plan), true);
  assert.equal(plan.planDigest, independentlyDigest("plan", plan, "planDigest"));
  assert.equal(authority.authorityDigest, independentlyDigest("authority", authority, "authorityDigest"));
  assert.equal(candidates.integration.candidateDigest, independentlyDigest("candidate", candidates.integration, "candidateDigest"));
  assert.equal(plan.planDigest, "sha256:1d1b791bff0684cd4d3a224bc3c69b58060de4d7d6397a413c2c393a4662807b");
  assert.equal(authority.authorityDigest, "sha256:c9c99465d3a629e93cfb4aff4dda4452f92ad0c9d7590a982c4ebbd3b3e0a406");
  assert.equal(envelope.signatureBase64, "8HF0cHaDKS8u3n6dSfCnwgnpxQnTOPlQboL2J0D4Nr2+Jj2bXTaRzUn0lChRZGV+z0zh3ydk0m98t46XqAjXDQ==");
  const signatureBytes = Buffer.concat([
    Buffer.from("shield.feature-operation.authority.signature.v1\0", "ascii"),
    Buffer.from(JSON.stringify(canonical(authority)), "utf8"),
  ]);
  assert.equal(verify(null, signatureBytes, publicKey, Buffer.from(envelope.signatureBase64, "base64")), true);
  assert.equal(verifySignedFeatureOperationAuthorityV1(envelope, verificationInput).state, "verified");
});

test("accepts every separately bounded candidate stage and never performs an effect", () => {
  for (const [name, value] of Object.entries(candidates)) {
    assert.equal(validateFeatureOperationDerivedCandidateV1(value).state, "valid", name);
    const result = evaluate(value);
    assert.equal(result.state, "eligible", name);
    assert.equal(result.currentFeatureHead, plan.baseRevision);
    assert.equal(result.currentFeatureTreeDigest, plan.baseTreeDigest);
  }
  const rollback = evaluate(rollbackCandidate, integrationReplay());
  assert.equal(rollback.state, "eligible");
  assert.equal(rollback.currentFeatureHead, revision("c"));
  assert.equal(rollback.currentFeatureTreeDigest, digest("3"));
});

test("requires positive effect attempts and blocks each stage at its exact signed boundary", () => {
  const stageCases = [
    {
      name: "branch creation",
      candidate: candidates.featureBranch,
      boundaryReplay: replayContext(),
      exhaustedReplay: (() => {
        const value = replayContext();
        value.operationCounters.featureBranchCreateAttempts = plan.limits.maxFeatureBranchCreateAttempts;
        return value;
      })(),
    },
    {
      name: "implementation",
      candidate: candidates.implementation,
      boundaryReplay: replayContext(),
      exhaustedReplay: (() => {
        const value = replayContext();
        value.childCounters[0].implementationAttempts = plan.children[0].maxImplementationAttempts;
        value.operationCounters.totalChildAttempts = plan.children[0].maxImplementationAttempts;
        return value;
      })(),
    },
    {
      name: "publication",
      candidate: candidates.publication,
      boundaryReplay: replayContext(),
      exhaustedReplay: (() => {
        const value = replayContext();
        value.childCounters[0].publicationAttempts = plan.children[0].maxPublicationAttempts;
        value.operationCounters.totalChildAttempts = plan.children[0].maxPublicationAttempts;
        return value;
      })(),
    },
    {
      name: "integration",
      candidate: candidates.integration,
      boundaryReplay: replayContext(),
      exhaustedReplay: (() => {
        const value = replayContext();
        value.childCounters[0].integrationAttempts = plan.children[0].maxIntegrationAttempts;
        value.operationCounters.totalIntegrationAttempts = plan.children[0].maxIntegrationAttempts;
        return value;
      })(),
    },
    {
      name: "rollback",
      candidate: rollbackCandidate,
      boundaryReplay: integrationReplay(),
      exhaustedReplay: (() => {
        const value = integrationReplay();
        value.childCounters[0].rollbackAttempts = plan.children[0].maxRollbackAttempts;
        value.operationCounters.totalRollbackAttempts = plan.children[0].maxRollbackAttempts;
        return value;
      })(),
    },
  ];

  for (const stageCase of stageCases) {
    assert.equal(stageCase.candidate.requestedScope.requestedAttempts, 1, `${stageCase.name} boundary request`);
    assert.equal(evaluate(stageCase.candidate, stageCase.boundaryReplay).state, "eligible", `${stageCase.name} boundary`);
    assert.deepEqual(evaluate(stageCase.candidate, stageCase.exhaustedReplay),
      { state: "blocked", reasonCode: "BOUNDS_EXHAUSTED" }, `${stageCase.name} exhausted`);
    const zero = copy(stageCase.candidate);
    zero.requestedScope.requestedAttempts = 0;
    assert.equal(validateFeatureOperationDerivedCandidateV1(zero).state, "invalid", `${stageCase.name} zero`);
    assert.throws(() => computeFeatureOperationDerivedCandidateDigestV1({ ...zero, candidateDigest: ZERO_DIGEST }), TypeError,
      `${stageCase.name} zero digest`);
  }
});

test("binds host-trusted replay time to the verified authority issuance and expiry window", () => {
  const at = (value, provenance = "hostTrusted") => replayContext({ observedAt: { value, provenance } });
  assert.deepEqual(evaluate(candidates.initiation, at("2029-04-30T23:59:59.999999999Z")),
    { state: "blocked", reasonCode: "REPLAY_CONTEXT_INVALID" });
  assert.equal(evaluate(candidates.initiation, at(authority.issuedAt)).state, "eligible");
  assert.equal(evaluate(candidates.initiation, at("2029-05-01T00:59:59.999999999Z")).state, "eligible");
  assert.deepEqual(evaluate(candidates.initiation, at(authority.expiresAt)),
    { state: "blocked", reasonCode: "AUTHORITY_EXPIRED" });
  assert.deepEqual(evaluate(candidates.initiation, at("2029-05-01T01:00:00.000000001Z")),
    { state: "blocked", reasonCode: "AUTHORITY_EXPIRED" });
  assert.equal(validateFeatureOperationReplayContextV1(at("2029-05-01T00:30:00Z", "callerSupplied")).state, "invalid");
  assert.deepEqual(evaluate(candidates.initiation, at("2029-05-01T00:30:00Z", "callerSupplied")),
    { state: "blocked", reasonCode: "REPLAY_CONTEXT_INVALID" });

  const preIssuance = at("2029-04-30T23:59:59.999999999Z");
  const identityDrift = withCandidateDigest({ ...candidates.initiation, operationId: "operation:other" });
  assert.deepEqual(evaluate(identityDrift, preIssuance), { state: "blocked", reasonCode: "REPLAY_CONTEXT_INVALID" });

  const lineageDrift = copy(preIssuance);
  lineageDrift.acceptedPlanLineage[0].active = false;
  assert.deepEqual(evaluate(candidates.initiation, lineageDrift), { state: "blocked", reasonCode: "REPLAY_CONTEXT_INVALID" });

  const lifecycleDrift = copy(preIssuance);
  lifecycleDrift.lifecycle.state = "paused";
  assert.deepEqual(evaluate(candidates.initiation, lifecycleDrift), { state: "blocked", reasonCode: "REPLAY_CONTEXT_INVALID" });

  const sequenceDrift = copy(preIssuance);
  sequenceDrift.acceptedAuthorityOperationSequence += 1;
  assert.deepEqual(evaluate(candidates.initiation, sequenceDrift), { state: "blocked", reasonCode: "REPLAY_CONTEXT_INVALID" });
});

test("fails closed for unsigned, malformed, untrusted, stale, duplicate, conflicting, and bad signatures", () => {
  assert.equal(validateSignedFeatureOperationAuthorityV1(authority).state, "invalid");
  assert.equal(verifySignedFeatureOperationAuthorityV1(authority, verificationInput).state, "invalid");
  assert.equal(verifySignedFeatureOperationAuthorityV1(envelope, { ...verificationInput, trustedBindings: [] }).state, "invalid");
  assert.equal(verifySignedFeatureOperationAuthorityV1(envelope, { ...verificationInput, trustedBindings: [binding, copy(binding)] }).state, "invalid");
  assert.equal(verifySignedFeatureOperationAuthorityV1(envelope, {
    ...verificationInput,
    trustedBindings: [{ ...binding, validThroughSequence: 11 }],
  }).state, "invalid");
  assert.equal(verifySignedFeatureOperationAuthorityV1(envelope, {
    ...verificationInput,
    trustedBindings: [{ ...binding, humanPrincipalId: "human:other" }],
  }).state, "invalid");
  assert.equal(verifySignedFeatureOperationAuthorityV1(envelope, {
    ...verificationInput,
    trustedBindings: [{ ...binding, missionScope: "*" }],
  }).state, "invalid");
  assert.equal(verifySignedFeatureOperationAuthorityV1(envelope, { ...verificationInput, expectedOperationSequence: 8 }).state, "invalid");
  assert.equal(verifySignedFeatureOperationAuthorityV1(envelope, { ...verificationInput, expectedJournalSequence: 13 }).state, "invalid");
  const badSignature = { ...envelope, signatureBase64: Buffer.alloc(64).toString("base64") };
  assert.equal(verifySignedFeatureOperationAuthorityV1(badSignature, verificationInput).state, "invalid");
  assert.deepEqual(evaluate(candidates.initiation, replayContext(), plan, badSignature), { state: "blocked", reasonCode: "AUTHORITY_SIGNATURE_INVALID" });
});

test("validates contiguous genesis, integration, and rollback replay without rewriting history", () => {
  const integrated = integrationReplay();
  const integratedResult = validateFeatureOperationReplayContextV1(integrated);
  assert.equal(integratedResult.state, "valid");
  assert.notEqual(integrated.transitions[1].childHeadRevision, integrated.transitions[1].resultingHeadRevision);
  const integratedAtCurrentSequence = integrationReplay();
  integratedAtCurrentSequence.lifecycle.atOperationSequence = 1;
  assert.equal(validateFeatureOperationReplayContextV1(integratedAtCurrentSequence).state, "valid");
  const futureLifecycle = replayContext();
  futureLifecycle.lifecycle.atOperationSequence = 999;
  assert.equal(validateFeatureOperationReplayContextV1(futureLifecycle).state, "invalid");

  const rolledBack = integrationReplay();
  rolledBack.transitions.push({
    kind: "rollback",
    operationSequence: 2,
    effectKey: effects.childRollback,
    priorHeadRevision: revision("c"),
    priorTreeDigest: digest("3"),
    resultingHeadRevision: revision("d"),
    resultingTreeDigest: plan.baseTreeDigest,
    receiptDigest: digest("9"),
    childId: "child:alpha",
    revertedIntegrationReceiptDigest: digest("4"),
  });
  rolledBack.acceptedIntegrations[0].reverted = true;
  rolledBack.acceptedRollbacks = [{
    childId: "child:alpha",
    operationSequence: 2,
    effectKey: effects.childRollback,
    revertedIntegrationReceiptDigest: digest("4"),
    priorHeadRevision: revision("c"),
    priorTreeDigest: digest("3"),
    resultingHeadRevision: revision("d"),
    resultingTreeDigest: plan.baseTreeDigest,
    receiptDigest: digest("9"),
  }];
  rolledBack.consumedEffectKeys = [effects.childIntegration, effects.childRollback, effects.workspacePublication, "effect:genesis"].sort();
  rolledBack.childCounters[0].rollbackAttempts = 1;
  rolledBack.operationCounters.totalRollbackAttempts = 1;
  rolledBack.lifecycle.atOperationSequence = 2;
  const result = validateFeatureOperationReplayContextV1(rolledBack);
  assert.equal(result.state, "valid");
  assert.equal(result.value.acceptedIntegrations[0].reverted, true);
  assert.equal(result.value.acceptedRollbacks.length, 1);

  const invalidMutations = [
    (value) => { value.transitions[1].operationSequence = 3; },
    (value) => { value.transitions[1].effectKey = "effect:genesis"; },
    (value) => { value.transitions[1].receiptDigest = value.transitions[0].receiptDigest; },
    (value) => { value.transitions[1].priorHeadRevision = revision("f"); },
    (value) => { value.acceptedIntegrations[0].resultingTreeDigest = digest("f"); },
  ];
  for (const mutate of invalidMutations) {
    const invalid = integrationReplay();
    mutate(invalid);
    assert.equal(validateFeatureOperationReplayContextV1(invalid).state, "invalid");
  }
  const wrongTree = copy(rolledBack);
  wrongTree.transitions[2].resultingTreeDigest = digest("f");
  wrongTree.acceptedRollbacks[0].resultingTreeDigest = digest("f");
  assert.equal(validateFeatureOperationReplayContextV1(wrongTree).state, "invalid");

  const pending = integrationReplay();
  pending.lifecycle = { state: "rollback_pending", atOperationSequence: 1 };
  assert.deepEqual(evaluate(candidates.initiation, pending), { state: "blocked", reasonCode: "LIFECYCLE_BLOCKED" });
  for (const state of ["rollback_failed", "rollback_uncertain"]) {
    const uncertain = integrationReplay();
    uncertain.lifecycle = { state, atOperationSequence: 1 };
    assert.equal(validateFeatureOperationReplayContextV1(uncertain).state, "invalid");
  }
  const nonterminal = copy(rolledBack);
  nonterminal.transitions.push({
    ...nonterminal.transitions[2],
    operationSequence: 3,
    effectKey: effectKey("child_revert_on_feature", "9"),
    priorHeadRevision: revision("d"),
    priorTreeDigest: plan.baseTreeDigest,
    resultingHeadRevision: revision("e"),
    receiptDigest: digest("a"),
    revertedIntegrationReceiptDigest: digest("4"),
  });
  assert.equal(validateFeatureOperationReplayContextV1(nonterminal).state, "invalid");
});

test("keeps stage fields closed and review evidence integration-only", () => {
  for (const [name, value] of Object.entries(candidates)) {
    const polluted = { ...value, reviewEvidenceRefs: [] };
    if (name === "integration") polluted.sourceRevision = plan.baseRevision;
    assert.equal(validateFeatureOperationDerivedCandidateV1(polluted).state, "invalid", name);
  }
  const missing = withCandidateDigest({ ...candidates.integration, reviewEvidenceRefs: [] });
  assert.deepEqual(evaluate(missing), { state: "blocked", reasonCode: "STAGE_OR_EVIDENCE_INAPPLICABLE" });
  const staleEvidence = withCandidateDigest({ ...candidates.integration, reviewEvidenceRefs: ["evidence:mack"] });
  assert.deepEqual(evaluate(staleEvidence), { state: "blocked", reasonCode: "INTEGRATION_EVIDENCE_INVALID" });
  const duplicateReplay = replayContext();
  duplicateReplay.acceptedReviewEvidence.push({ ...duplicateReplay.acceptedReviewEvidence[2], evidenceRef: "evidence:mack:duplicate" });
  duplicateReplay.operationCounters.capturedEvidenceCount += 1;
  assert.deepEqual(evaluate(candidates.integration, duplicateReplay), { state: "blocked", reasonCode: "INTEGRATION_EVIDENCE_INVALID" });
});

test("rejects semantic effect aliases, case drift, dangerous operations, and cross-stage reinterpretation", () => {
  const invalidPlanMutations = [
    (value) => { value.children[0].allowedActionIds = ["action:release"]; },
    (value) => { value.children[0].allowedEffectKeys = ["effect:release"]; },
    (value) => { value.children[0].allowedEffectKeys = ["effect:child_implementation:Release"]; },
    (value) => { value.children[0].allowedCapabilityIds = ["capability:deploy"]; },
    (value) => { value.children[0].allowedPublicationOperations = ["merge-to-main"]; },
    (value) => { value.children[0].allowedValidationIds = ["Release"]; },
    (value) => { value.integrationPolicy.allowedMethods = ["deploy"]; },
    (value) => { value.integrationPolicy.allowedMethods = ["Deploy"]; },
    (value) => { value.integrationPolicy.allowedMethods = ["deployment"]; },
  ];
  for (const mutate of invalidPlanMutations) {
    const value = copy(plan);
    mutate(value);
    value.planDigest = ZERO_DIGEST;
    assert.throws(() => computeFeatureOperationPlanDigestV1(value), TypeError);
  }

  const invalidCandidates = [
    { ...candidates.implementation, effectKey: "effect:release", requestedScope: { ...candidates.implementation.requestedScope, effectKeys: ["effect:release"] } },
    { ...candidates.implementation, effectKey: "effect:child_implementation:Release", requestedScope: { ...candidates.implementation.requestedScope, effectKeys: ["effect:child_implementation:Release"] } },
    { ...candidates.implementation, effectKey: effects.childInitiation, requestedScope: { ...candidates.implementation.requestedScope, effectKeys: [effects.childInitiation] } },
    { ...candidates.implementation, requestedScope: { ...candidates.implementation.requestedScope, actionIds: ["action:repository_edit"] } },
    { ...candidates.implementation, requestedScope: { ...candidates.implementation.requestedScope, capabilityIds: ["Repository_Write"] } },
    { ...candidates.integration, integrationMethod: "deploy" },
  ];
  for (const value of invalidCandidates) {
    assert.throws(() => computeFeatureOperationDerivedCandidateDigestV1({ ...copy(value), candidateDigest: ZERO_DIGEST }), TypeError);
  }
});

test("enforces segment paths, canonical sets, exact branches, gates, exclusions, numeric bounds, and strict derivation subsets", () => {
  const descendant = withCandidateDigest({
    ...candidates.implementation,
    requestedScope: { ...candidates.implementation.requestedScope, relativePaths: ["packages/alpha/src/index.mts"] },
  });
  assert.equal(evaluate(descendant).state, "eligible");
  const sibling = withCandidateDigest({
    ...candidates.implementation,
    requestedScope: { ...candidates.implementation.requestedScope, relativePaths: ["packages/alphabet"] },
  });
  assert.deepEqual(evaluate(sibling), { state: "blocked", reasonCode: "SCOPE_NOT_STRICT_SUBSET" });
  const weakGate = withCandidateDigest({
    ...candidates.implementation,
    requestedScope: { ...candidates.implementation.requestedScope, requiredGates: { mack: false, fury: true, humanGateIds: ["fitz"] } },
  });
  assert.deepEqual(evaluate(weakGate), { state: "blocked", reasonCode: "SCOPE_NOT_STRICT_SUBSET" });
  const missingExclusion = withCandidateDigest({
    ...candidates.implementation,
    requestedScope: { ...candidates.implementation.requestedScope, exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS.slice(1) },
  });
  assert.deepEqual(evaluate(missingExclusion), { state: "blocked", reasonCode: "SCOPE_NOT_STRICT_SUBSET" });
  const wrongBranch = withCandidateDigest({ ...candidates.publication, targetBranch: "main" });
  assert.deepEqual(evaluate(wrongBranch), { state: "blocked", reasonCode: "BRANCH_TARGET_OR_METHOD_INVALID" });
  const exhausted = withCandidateDigest({
    ...candidates.implementation,
    requestedScope: { ...candidates.implementation.requestedScope, requestedAttempts: 4 },
  });
  assert.deepEqual(evaluate(exhausted), { state: "blocked", reasonCode: "BOUNDS_EXHAUSTED" });
  assert.throws(() => computeFeatureOperationDerivedCandidateDigestV1({
    ...candidates.implementation,
    requestedScope: { ...candidates.implementation.requestedScope, effectKeys: ["effect:z", "effect:a"] },
  }), TypeError);
});

test("enforces signed attempt, retry, evidence, concurrency, and deterministic eligibility-order bounds", () => {
  const boundary = replayContext();
  boundary.childCounters[0].implementationAttempts = 3;
  boundary.childCounters[0].retryAttempts = 2;
  boundary.operationCounters.totalChildAttempts = 3;
  boundary.activeLeases = [{
    leaseId: "lease:alpha",
    childId: "child:alpha",
    derivationKind: "child_implementation",
    effectKey: effects.childImplementation,
    attemptNumber: 3,
    retryNumber: 2,
    acquiredAtOperationSequence: 0,
  }];
  assert.equal(validateFeatureOperationReplayContextV1(boundary).state, "valid");

  const overLimitMutations = [
    (value) => { value.childCounters[0].implementationAttempts = 4; value.operationCounters.totalChildAttempts = 4; },
    (value) => { value.childCounters[0].integrationAttempts = 3; value.operationCounters.totalIntegrationAttempts = 3; },
    (value) => { value.childCounters[0].rollbackAttempts = 2; value.operationCounters.totalRollbackAttempts = 2; },
    (value) => { value.childCounters[0].retryAttempts = 3; },
    (value) => { value.operationCounters.featureBranchCreateAttempts = 2; },
    (value) => { value.operationCounters.featureWorkspaceDraftPrAttempts = 2; },
  ];
  for (const mutate of overLimitMutations) {
    const value = replayContext();
    mutate(value);
    assert.equal(validateFeatureOperationReplayContextV1(value).state, "invalid");
  }

  const retryExhausted = replayContext();
  retryExhausted.childCounters[0].implementationAttempts = 2;
  retryExhausted.childCounters[0].retryAttempts = 2;
  retryExhausted.operationCounters.totalChildAttempts = 2;
  const retryCandidate = withCandidateDigest({
    ...candidates.implementation,
    requestedScope: { ...candidates.implementation.requestedScope, requestedAttempts: 1, requestedRetries: 1 },
  });
  assert.deepEqual(evaluate(retryCandidate, retryExhausted), { state: "blocked", reasonCode: "BOUNDS_EXHAUSTED" });

  const evidenceBoundary = replayContext();
  for (let index = evidenceBoundary.acceptedReviewEvidence.length; index < plan.limits.maxCapturedEvidence; index += 1) {
    evidenceBoundary.acceptedReviewEvidence.push({
      evidenceRef: `evidence:extra:${index}`,
      gateType: "human",
      gateId: "fitz",
      childId: "child:alpha",
      repositoryId: plan.repositoryId,
      headRevision: revision("b"),
      sourceRecordDigest: `sha256:${index.toString(16).padStart(64, "0")}`,
    });
  }
  evidenceBoundary.operationCounters.capturedEvidenceCount = plan.limits.maxCapturedEvidence;
  assert.equal(validateFeatureOperationReplayContextV1(evidenceBoundary).state, "valid");
  const evidenceOver = copy(evidenceBoundary);
  evidenceOver.acceptedReviewEvidence.push({ ...evidenceOver.acceptedReviewEvidence.at(-1), evidenceRef: "evidence:extra:overflow", sourceRecordDigest: digest("f") });
  evidenceOver.operationCounters.capturedEvidenceCount += 1;
  assert.equal(validateFeatureOperationReplayContextV1(evidenceOver).state, "invalid");

  const concurrentOver = replayContext();
  concurrentOver.childCounters[0].initiationAttempts = 1;
  concurrentOver.childCounters[1].initiationAttempts = 1;
  concurrentOver.operationCounters.totalChildAttempts = 2;
  concurrentOver.activeLeases = [
    { leaseId: "lease:alpha", childId: "child:alpha", derivationKind: "child_initiation", effectKey: effects.childInitiation, attemptNumber: 1, retryNumber: 0, acquiredAtOperationSequence: 0 },
    { leaseId: "lease:beta", childId: "child:beta", derivationKind: "child_initiation", effectKey: effects.betaInitiation, attemptNumber: 1, retryNumber: 0, acquiredAtOperationSequence: 0 },
  ];
  assert.equal(validateFeatureOperationReplayContextV1(concurrentOver).state, "invalid");

  const independentPlanValue = copy(plan);
  independentPlanValue.children[1].dependsOn = [];
  independentPlanValue.children[1].allowedEffectKeys = [...independentPlanValue.children[1].allowedEffectKeys, effects.betaInitiation].sort();
  independentPlanValue.limits.maxConcurrency = 2;
  const independentPlan = withPlanDigest(independentPlanValue);
  const independentAuthority = withAuthorityDigest({
    ...copy(authority),
    plan: independentPlan,
    planDigest: independentPlan.planDigest,
    limits: independentPlan.limits,
  });
  const independentEnvelope = signAuthority(independentAuthority);
  const independentVerification = { ...verificationInput, trustedBindings: [binding] };
  const independentReplay = replayContext();
  independentReplay.activePlan = independentPlan;
  independentReplay.activePlanDigest = independentPlan.planDigest;
  independentReplay.verifiedAuthorityDigest = independentAuthority.authorityDigest;
  independentReplay.acceptedPlanLineage[0].planDigest = independentPlan.planDigest;
  independentReplay.acceptedPlanLineage[0].authorityDigest = independentAuthority.authorityDigest;
  const independentCandidate = (childId, branchName, path, effectKey) => withCandidateDigest({
    ...copy(candidates.initiation),
    planDigest: independentPlan.planDigest,
    authorityDigest: independentAuthority.authorityDigest,
    childId,
    childBranch: branchName,
    effectKey,
    requestedScope: requestedScope(effectKey, path),
  });
  const alpha = independentCandidate("child:alpha", "agent/child-alpha", "packages/alpha", effects.childInitiation);
  const beta = independentCandidate("child:beta", "agent/child-beta", "packages/beta", effects.betaInitiation);
  assert.equal(evaluateFeatureOperationDerivedCandidateV1(independentPlan, independentEnvelope, independentVerification, independentReplay, alpha).state, "eligible");
  assert.deepEqual(
    evaluateFeatureOperationDerivedCandidateV1(independentPlan, independentEnvelope, independentVerification, independentReplay, beta),
    { state: "blocked", reasonCode: "CHILD_OR_DEPENDENCY_INELIGIBLE" },
  );
  independentReplay.childCounters[0].initiationAttempts = 1;
  independentReplay.operationCounters.totalChildAttempts = 1;
  independentReplay.activeLeases = [{
    leaseId: "lease:alpha",
    childId: "child:alpha",
    derivationKind: "child_initiation",
    effectKey: effects.childInitiation,
    attemptNumber: 1,
    retryNumber: 0,
    acquiredAtOperationSequence: 0,
  }];
  assert.equal(validateFeatureOperationReplayContextV1(independentReplay).state, "valid");
  assert.equal(evaluateFeatureOperationDerivedCandidateV1(independentPlan, independentEnvelope, independentVerification, independentReplay, beta).state, "eligible");
  independentReplay.childCounters[1].initiationAttempts = 1;
  independentReplay.operationCounters.totalChildAttempts = 2;
  independentReplay.activeLeases.push({
    leaseId: "lease:beta",
    childId: "child:beta",
    derivationKind: "child_initiation",
    effectKey: effects.betaInitiation,
    attemptNumber: 1,
    retryNumber: 0,
    acquiredAtOperationSequence: 0,
  });
  assert.equal(validateFeatureOperationReplayContextV1(independentReplay).state, "valid");

  const lowTotalPlanValue = copy(plan);
  lowTotalPlanValue.limits.maxTotalChildAttempts = 2;
  const lowTotalPlan = withPlanDigest(lowTotalPlanValue);
  const totalBoundary = replayContext();
  totalBoundary.activePlan = lowTotalPlan;
  totalBoundary.activePlanDigest = lowTotalPlan.planDigest;
  totalBoundary.acceptedPlanLineage[0].planDigest = lowTotalPlan.planDigest;
  totalBoundary.childCounters[0].implementationAttempts = 2;
  totalBoundary.childCounters[0].retryAttempts = 2;
  totalBoundary.operationCounters.totalChildAttempts = 2;
  assert.equal(validateFeatureOperationReplayContextV1(totalBoundary).state, "valid");
  totalBoundary.childCounters[0].implementationAttempts = 3;
  totalBoundary.operationCounters.totalChildAttempts = 3;
  assert.equal(validateFeatureOperationReplayContextV1(totalBoundary).state, "invalid");
});

test("binds active leases to globally valid, child-permitted derivations and exact effect classes", () => {
  const leased = replayContext();
  leased.childCounters[0].implementationAttempts = 1;
  leased.operationCounters.totalChildAttempts = 1;
  leased.activeLeases = [{
    leaseId: "lease:alpha",
    childId: "child:alpha",
    derivationKind: "child_implementation",
    effectKey: effects.childImplementation,
    attemptNumber: 1,
    retryNumber: 0,
    acquiredAtOperationSequence: 0,
  }];
  assert.equal(validateFeatureOperationReplayContextV1(leased).state, "valid");

  const omittedDerivationValue = copy(plan);
  omittedDerivationValue.children[0].permittedDerivations = omittedDerivationValue.children[0].permittedDerivations
    .filter((item) => item !== "child_implementation");
  const omittedDerivationPlan = withPlanDigest(omittedDerivationValue);
  assert.equal(validateFeatureOperationPlanV1(omittedDerivationPlan).state, "valid");
  const omittedDerivationReplay = copy(leased);
  omittedDerivationReplay.activePlan = omittedDerivationPlan;
  omittedDerivationReplay.activePlanDigest = omittedDerivationPlan.planDigest;
  omittedDerivationReplay.acceptedPlanLineage[0].planDigest = omittedDerivationPlan.planDigest;
  assert.equal(validateFeatureOperationReplayContextV1(omittedDerivationReplay).state, "invalid");

  const invalidLeaseMutations = [
    (value) => { value.activeLeases[0].derivationKind = "child_deploy"; },
    (value) => { value.activeLeases[0].derivationKind = "feature_branch_create"; },
    (value) => { value.activeLeases[0].effectKey = effects.childInitiation; },
    (value) => { value.activeLeases[0].effectKey = effectKey("child_implementation", "a"); },
  ];
  for (const mutate of invalidLeaseMutations) {
    const value = copy(leased);
    mutate(value);
    assert.equal(validateFeatureOperationReplayContextV1(value).state, "invalid");
  }
});

test("allows only contiguous amendment edges and classifies narrowing versus material changes", () => {
  const successor = (mutate) => {
    const value = copy(plan);
    value.planSequence = 1;
    value.predecessorPlanDigest = plan.planDigest;
    mutate(value);
    return withPlanDigest(value);
  };
  assert.deepEqual(compareFeatureOperationAmendmentV1(plan, plan), { state: "valid", classification: "identical" });
  const narrowing = successor((value) => {
    value.children[0].allowedRelativePaths = ["packages/alpha/src"];
    value.children[0].maxImplementationAttempts = 2;
    value.expiresAt = "2029-05-01T00:59:59Z";
  });
  assert.deepEqual(compareFeatureOperationAmendmentV1(plan, narrowing), { state: "valid", classification: "pure_narrowing" });
  const semanticNoOp = successor(() => {});
  assert.deepEqual(compareFeatureOperationAmendmentV1(plan, semanticNoOp), { state: "valid", classification: "material" });
  const mutations = [
    (value) => { value.children[0].riskClassification = "high"; },
    (value) => { value.acceptanceCriteria[0].statement = "Changed acceptance"; },
    (value) => { value.integrationPolicy.allowedMethods = ["merge_commit", "rebase_merge", "squash"]; },
    (value) => { value.children[0].requiredGates.humanGateIds = []; },
    (value) => { value.expiresAt = "2029-05-01T01:00:01Z"; },
    (value) => { value.children[0].maxImplementationAttempts = 4; },
    (value) => { value.children[1].dependsOn = []; },
    (value) => { value.baseBranch = "trunk"; },
    (value) => { value.children[0].allowedEffectKeys = [...value.children[0].allowedEffectKeys, effectKey("child_implementation", "a")].sort(); },
  ];
  for (const mutate of mutations) {
    assert.deepEqual(compareFeatureOperationAmendmentV1(plan, successor(mutate)), { state: "valid", classification: "material" });
  }
  const noncontiguous = copy(semanticNoOp);
  noncontiguous.planSequence = 2;
  noncontiguous.planDigest = ZERO_DIGEST;
  noncontiguous.planDigest = computeFeatureOperationPlanDigestV1(noncontiguous);
  assert.equal(compareFeatureOperationAmendmentV1(plan, noncontiguous).state, "invalid");
  const removedChild = successor((value) => {
    value.children = [value.children[0]];
    value.eligibilityOrder = ["child:alpha"];
    value.limits.maxChildren = 1;
  });
  assert.deepEqual(compareFeatureOperationAmendmentV1(plan, removedChild), { state: "valid", classification: "material" });
  assert.deepEqual(evaluate(candidates.initiation, replayContext(), narrowing), { state: "blocked", reasonCode: "IDENTITY_OR_DIGEST_MISMATCH" });
});

test("returns stable blocked reasons in approved precedence", () => {
  const invalidPlan = { ...plan, unexpected: true };
  assert.deepEqual(evaluate({}, {}, invalidPlan, {}, {}), { state: "blocked", reasonCode: "PLAN_INVALID" });
  assert.deepEqual(evaluate(candidates.initiation, replayContext(), plan, authority), { state: "blocked", reasonCode: "SIGNED_AUTHORITY_INVALID" });
  assert.deepEqual(evaluate(candidates.initiation, replayContext(), plan, envelope, { ...verificationInput, trustedBindings: [] }), { state: "blocked", reasonCode: "TRUSTED_COULSON_BINDING_INVALID" });
  assert.deepEqual(evaluate(candidates.initiation, { ...replayContext(), unexpected: true }), { state: "blocked", reasonCode: "REPLAY_CONTEXT_INVALID" });
  const wrongIdentity = withCandidateDigest({ ...candidates.initiation, operationId: "operation:other" });
  assert.deepEqual(evaluate(wrongIdentity), { state: "blocked", reasonCode: "IDENTITY_OR_DIGEST_MISMATCH" });
  assert.deepEqual(evaluate(candidates.initiation, replayContext({ lifecycle: { state: "paused", atOperationSequence: 0 } })), { state: "blocked", reasonCode: "LIFECYCLE_BLOCKED" });
  assert.deepEqual(evaluate(candidates.initiation, replayContext({ acceptedAuthorityOperationSequence: 8 })), { state: "blocked", reasonCode: "SEQUENCE_MISMATCH" });
  assert.deepEqual(evaluate(candidates.initiation, replayContext({ observedAt: { value: authority.expiresAt, provenance: "hostTrusted" } })), { state: "blocked", reasonCode: "AUTHORITY_EXPIRED" });
  assert.deepEqual(evaluate({ ...candidates.initiation, candidateDigest: ZERO_DIGEST }), { state: "blocked", reasonCode: "CANDIDATE_INVALID" });
  const beta = candidate("child_initiation", { childId: "child:beta", sourceFeatureHead: plan.baseRevision, childBranch: "agent/child-beta" }, effects.childInitiation);
  beta.requestedScope = requestedScope(effects.childInitiation, "packages/beta");
  beta.candidateDigest = computeFeatureOperationDerivedCandidateDigestV1({ ...beta, candidateDigest: ZERO_DIGEST });
  assert.deepEqual(evaluate(beta), { state: "blocked", reasonCode: "CHILD_OR_DEPENDENCY_INELIGIBLE" });
  const stale = withCandidateDigest({ ...candidates.initiation, sourceFeatureHead: revision("f") });
  assert.deepEqual(evaluate(stale), { state: "blocked", reasonCode: "FEATURE_OR_CHILD_REVISION_STALE" });
  const reusedReplay = replayContext({ consumedEffectKeys: [effects.childInitiation, "effect:genesis"].sort() });
  assert.deepEqual(evaluate(candidates.initiation, reusedReplay), { state: "blocked", reasonCode: "EFFECT_KEY_REUSED" });

  const multiFault = copy(candidates.integration);
  multiFault.targetBranch = "main";
  multiFault.reviewEvidenceRefs = ["evidence:missing"];
  multiFault.candidateDigest = computeFeatureOperationDerivedCandidateDigestV1({ ...multiFault, candidateDigest: ZERO_DIGEST });
  assert.deepEqual(evaluate(multiFault), { state: "blocked", reasonCode: "BRANCH_TARGET_OR_METHOD_INVALID" });
  const reordered = Object.fromEntries(Object.entries(multiFault).reverse());
  assert.deepEqual(evaluate(reordered), { state: "blocked", reasonCode: "BRANCH_TARGET_OR_METHOD_INVALID" });
});

test("rejects wildcard, dangerous, deferred, aliasing, and hostile JSON-equivalent structures", () => {
  const invalidPlans = [
    { ...plan, baseRevision: "*" },
    { ...plan, featureBranch: "main" },
    { ...plan, children: [{ ...plan.children[0], allowedRelativePaths: ["packages/alpha/../beta"] }, plan.children[1]] },
    { ...plan, children: [{ ...plan.children[0], allowedEffectKeys: ["release"] }, plan.children[1]] },
    { ...plan, children: [{ ...plan.children[0], allowedActionIds: ["dynamic-command-selection"] }, plan.children[1]] },
  ];
  for (const value of invalidPlans) {
    assert.throws(() => computeFeatureOperationPlanDigestV1({ ...copy(value), planDigest: ZERO_DIGEST }), TypeError);
  }
  assert.throws(() => computeFeatureOperationPlanDigestV1({ ...copy(plan), expiresAt: "2029-02-30T00:00:00Z", planDigest: ZERO_DIGEST }), TypeError);
  const overlongAuthority = { ...copy(authority), expiresAt: "2029-05-01T01:00:00.000000001Z", authorityDigest: ZERO_DIGEST };
  assert.throws(() => computeFeatureOperationAuthorityDigestV1(overlongAuthority), TypeError);
  const accessor = copy(plan);
  Object.defineProperty(accessor, "objective", { enumerable: true, get: () => plan.objective });
  assert.equal(validateFeatureOperationPlanV1(accessor).state, "invalid");
  assert.equal(validateFeatureOperationPlanV1(new Proxy(plan, {})).state, "invalid");
  assert.equal(validateFeatureOperationPlanV1(Object.assign(Object.create({ inherited: true }), plan)).state, "invalid");
  const symbol = copy(plan);
  symbol[Symbol("hidden")] = true;
  assert.equal(validateFeatureOperationPlanV1(symbol).state, "invalid");
  const sparse = copy(plan);
  sparse.children = new Array(2);
  sparse.children[0] = copy(plan.children[0]);
  assert.equal(validateFeatureOperationPlanV1(sparse).state, "invalid");
  const extraArrayProperty = copy(plan);
  extraArrayProperty.children.extra = true;
  assert.equal(validateFeatureOperationPlanV1(extraArrayProperty).state, "invalid");
});

function independentlyDigestV2(domain, value, ownDigestField) {
  const content = copy(value);
  delete content[ownDigestField];
  return `sha256:${createHash("sha256").update(Buffer.concat([
    Buffer.from(domain, "ascii"), Buffer.from([0]), Buffer.from(JSON.stringify(canonical(content)), "utf8"),
  ])).digest("hex")}`;
}

function hardenedFixture() {
  const hardenedPlan = {
    ...copy(plan),
    schemaVersion: 2,
    contractVersion: "feature.operation.v2",
    protocol: { version: 2, observationProducerBindingsDigest: digest("a"), humanBindingsDigest: digest("b") },
    finalGates: { policyVersion: 2, fitzRequired: true, simmonsRequired: false, coulsonRequired: true },
    planDigest: ZERO_DIGEST,
  };
  hardenedPlan.planDigest = computeFeatureOperationPlanDigestV2(hardenedPlan);
  const hardenedAuthority = {
    ...copy(authority),
    schemaVersion: 2,
    contractVersion: "feature.operation.v2",
    plan: hardenedPlan,
    planDigest: hardenedPlan.planDigest,
    authorityDigest: ZERO_DIGEST,
  };
  hardenedAuthority.authorityDigest = computeFeatureOperationAuthorityDigestV2(hardenedAuthority);
  const bytes = Buffer.concat([
    Buffer.from("shield.feature-operation.authority-signature.v2", "ascii"), Buffer.from([0]),
    Buffer.from(JSON.stringify(canonical(hardenedAuthority)), "utf8"),
  ]);
  const signedAuthority = { payload: copy(hardenedAuthority), signatureBase64: sign(null, bytes, privateKey).toString("base64") };
  const hardenedReplay = {
    ...replayContext(),
    schemaVersion: 2,
    contractVersion: "feature.operation.v2",
    activePlan: copy(hardenedPlan),
    activePlanDigest: hardenedPlan.planDigest,
    verifiedAuthorityDigest: hardenedAuthority.authorityDigest,
    acceptedPlanLineage: [{ planSequence: 0, planDigest: hardenedPlan.planDigest, predecessorPlanDigest: null, authorityDigest: hardenedAuthority.authorityDigest, active: true }],
  };
  const hardenedCandidate = {
    ...copy(candidates.initiation),
    schemaVersion: 2,
    contractVersion: "feature.operation.v2",
    planDigest: hardenedPlan.planDigest,
    authorityDigest: hardenedAuthority.authorityDigest,
    candidateDigest: ZERO_DIGEST,
  };
  hardenedCandidate.candidateDigest = computeFeatureOperationDerivedCandidateDigestV2(hardenedCandidate);
  const verification = { ...verificationInput, trustedBindings: [binding] };
  return { hardenedPlan, hardenedAuthority, signedAuthority, hardenedReplay, hardenedCandidate, verification };
}

test("keeps hardened feature-operation contracts additive and protocol-separated", () => {
  const fixture = hardenedFixture();
  assert.equal(FEATURE_OPERATION_SCHEMA_VERSION_V2, 2);
  assert.equal(FEATURE_OPERATION_CONTRACT_VERSION_V2, "feature.operation.v2");
  assert.equal(validateFeatureOperationPlanV1(fixture.hardenedPlan).state, "invalid");
  assert.equal(validateFeatureOperationPlanV2(plan).state, "invalid");
  assert.equal(validateFeatureOperationPlanV2(fixture.hardenedPlan).state, "valid");
  assert.equal(validateFeatureOperationAuthorityV2(fixture.hardenedAuthority).state, "valid");
  assert.equal(validateFeatureOperationReplayContextV2(fixture.hardenedReplay).state, "valid");
  assert.equal(validateFeatureOperationDerivedCandidateV2(fixture.hardenedCandidate).state, "valid");
  assert.equal(verifySignedFeatureOperationAuthorityV2(fixture.signedAuthority, fixture.verification).state, "verified");
  assert.equal(fixture.hardenedPlan.planDigest, independentlyDigestV2("shield.feature-operation.plan.v2", fixture.hardenedPlan, "planDigest"));
  assert.equal(fixture.hardenedAuthority.authorityDigest, independentlyDigestV2("shield.feature-operation.authority.v2", fixture.hardenedAuthority, "authorityDigest"));
  assert.equal(fixture.hardenedCandidate.candidateDigest, independentlyDigestV2("shield.feature-operation.candidate.v2", fixture.hardenedCandidate, "candidateDigest"));
  assert.equal(evaluateFeatureOperationDerivedCandidateV2(fixture.hardenedPlan, fixture.signedAuthority, fixture.verification, fixture.hardenedReplay, fixture.hardenedCandidate).state, "eligible");
});

test("hardened feature-operation parsers reject mixed, extra, accessor, and substituted values", () => {
  const fixture = hardenedFixture();
  assert.equal(validateFeatureOperationPlanV2({ ...fixture.hardenedPlan, contractVersion: "feature.operation.v1" }).state, "invalid");
  assert.equal(validateFeatureOperationPlanV2({ ...fixture.hardenedPlan, extra: true }).state, "invalid");
  assert.equal(validateFeatureOperationPlanV2({ ...fixture.hardenedPlan, protocol: { ...fixture.hardenedPlan.protocol, version: 3 } }).state, "invalid");
  assert.equal(validateFeatureOperationPlanV2({ ...fixture.hardenedPlan, finalGates: { fitzRequired: true, simmons: "conditional", coulsonRequired: true } }).state, "invalid");
  assert.equal(validateFeatureOperationPlanV2({ ...fixture.hardenedPlan, planDigest: digest("f") }).code, "digest_mismatch");
  const accessor = copy(fixture.hardenedPlan);
  Object.defineProperty(accessor, "objective", { enumerable: true, get: () => fixture.hardenedPlan.objective });
  assert.equal(validateFeatureOperationPlanV2(accessor).state, "invalid");
  assert.equal(validateFeatureOperationPlanV2(new Proxy(fixture.hardenedPlan, {})).state, "invalid");
  const substitutedSignature = copy(fixture.signedAuthority);
  substitutedSignature.signatureBase64 = Buffer.from(substitutedSignature.signatureBase64, "base64").map((byte, index) => index === 0 ? byte ^ 1 : byte).toString("base64");
  assert.equal(verifySignedFeatureOperationAuthorityV2(substitutedSignature, fixture.verification).code, "signature_invalid");
});

test("validates all seven exact V2 candidate variants without cross-variant reinterpretation", () => {
  const fixture = hardenedFixture();
  const variants = [...Object.values(candidates), rollbackCandidate].map((legacy) => {
    const value = {
      ...copy(legacy),
      schemaVersion: 2,
      contractVersion: "feature.operation.v2",
      planDigest: fixture.hardenedPlan.planDigest,
      authorityDigest: fixture.hardenedAuthority.authorityDigest,
      candidateDigest: ZERO_DIGEST,
    };
    value.candidateDigest = computeFeatureOperationDerivedCandidateDigestV2(value);
    return value;
  });
  assert.equal(variants.length, 7);
  assert.deepEqual(variants.map((value) => value.derivationKind).sort(), [...FEATURE_OPERATION_DERIVATION_KINDS]);
  for (const value of variants) {
    assert.equal(validateFeatureOperationDerivedCandidateV2(value).state, "valid", value.derivationKind);
    const substituted = copy(value);
    substituted.derivationKind = value.derivationKind === "feature_branch_create" ? "child_initiation" : "feature_branch_create";
    assert.equal(validateFeatureOperationDerivedCandidateV2(substituted).state, "invalid", value.derivationKind);
    const extra = { ...value, unrelatedVariantField: true };
    assert.equal(validateFeatureOperationDerivedCandidateV2(extra).state, "invalid", value.derivationKind);
  }
});
