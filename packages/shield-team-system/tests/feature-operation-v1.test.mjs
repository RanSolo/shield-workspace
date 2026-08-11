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
  FEATURE_OPERATION_DERIVATION_KINDS,
  FEATURE_OPERATION_FIXED_EXCLUSIONS,
  FEATURE_OPERATION_PROHIBITED_EFFECTS,
  FEATURE_OPERATION_SCHEMA_VERSION,
  compareFeatureOperationAmendmentV1,
  computeFeatureOperationAuthorityDigestV1,
  computeFeatureOperationDerivedCandidateDigestV1,
  computeFeatureOperationPlanDigestV1,
  evaluateFeatureOperationDerivedCandidateV1,
  validateFeatureOperationAuthorityV1,
  validateFeatureOperationDerivedCandidateV1,
  validateFeatureOperationPlanV1,
  validateFeatureOperationReplayContextV1,
  validateSignedFeatureOperationAuthorityV1,
  verifySignedFeatureOperationAuthorityV1,
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

const effectKeys = [
  "effect:child:implement",
  "effect:child:initiate",
  "effect:child:integrate",
  "effect:child:publish",
  "effect:child:rollback",
  "effect:feature:create",
  "effect:workspace:publish",
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
    allowedActionIds: ["action:edit"],
    allowedEffectKeys: effectKeys,
    allowedCapabilityIds: ["capability:write"],
    allowedValidationIds: ["validation:test"],
    allowedPublicationOperations: ["publication:draft_pr"],
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
  return {
    relativePaths: [path],
    actionIds: ["action:edit"],
    effectKeys: [effectKey],
    capabilityIds: ["capability:write"],
    validationIds: ["validation:test"],
    publicationOperations: ["publication:draft_pr"],
    requiredGates: { mack: true, fury: true, humanGateIds: ["fitz"] },
    exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS,
    requestedAttempts: 1,
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
  featureBranch: candidate("feature_branch_create", { sourceRevision: plan.baseRevision, targetBranch: plan.featureBranch }, "effect:feature:create"),
  workspacePr: candidate("feature_workspace_draft_pr_create", { sourceBranch: plan.featureBranch, targetBranch: plan.baseBranch, draftOnly: true }, "effect:workspace:publish"),
  initiation: candidate("child_initiation", { childId: "child:alpha", sourceFeatureHead: plan.baseRevision, childBranch: "agent/child-alpha" }, "effect:child:initiate"),
  implementation: candidate("child_implementation", { childId: "child:alpha", childBaseRevision: plan.baseRevision, childBranch: "agent/child-alpha" }, "effect:child:implement"),
  publication: candidate("child_draft_pr_create", { childId: "child:alpha", childBranch: "agent/child-alpha", childHeadRevision: revision("b"), targetBranch: plan.featureBranch, draftOnly: true }, "effect:child:publish"),
  integration: candidate("child_merge_to_feature", {
    childId: "child:alpha",
    childBranch: "agent/child-alpha",
    childHeadRevision: revision("b"),
    childTreeDigest: digest("5"),
    targetBranch: plan.featureBranch,
    integrationMethod: "merge_commit",
    predecessorIntegrationReceiptDigest: null,
    reviewEvidenceRefs: ["evidence:fitz", "evidence:fury", "evidence:mack"],
  }, "effect:child:integrate"),
};

function integrationReplay() {
  const replay = replayContext();
  replay.transitions.push({
    kind: "integration",
    operationSequence: 1,
    effectKey: "effect:child:integrate",
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
    effectKey: "effect:child:integrate",
    priorHeadRevision: plan.baseRevision,
    priorTreeDigest: plan.baseTreeDigest,
    resultingHeadRevision: revision("c"),
    resultingTreeDigest: digest("3"),
    receiptDigest: digest("4"),
    reverted: false,
  }];
  replay.consumedEffectKeys = ["effect:child:integrate", "effect:genesis"];
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
}, "effect:child:rollback");

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
  assert.equal(plan.planDigest, "sha256:72d520921f663da6fe0aa5df72777f3bbf6a2d24297e1013334f4122ceff3fb9");
  assert.equal(authority.authorityDigest, "sha256:888fcb9a9139fc976d2ee8a3bf3209eea1fb59e0408447ba1fa8346d6eb71fd8");
  assert.equal(envelope.signatureBase64, "+l+QlANUOsy41ztCNT7MoJnZ5mhQTTu7U5BVET3VSWkzlDJvOVBIVT0O27Xg2nzcevPxpElgZxDJv8HFiwJYAA==");
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
    effectKey: "effect:child:rollback",
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
    effectKey: "effect:child:rollback",
    revertedIntegrationReceiptDigest: digest("4"),
    priorHeadRevision: revision("c"),
    priorTreeDigest: digest("3"),
    resultingHeadRevision: revision("d"),
    resultingTreeDigest: plan.baseTreeDigest,
    receiptDigest: digest("9"),
  }];
  rolledBack.consumedEffectKeys = ["effect:child:integrate", "effect:child:rollback", "effect:genesis", "effect:workspace:publish"];
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
    effectKey: "effect:child:rollback:again",
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
  const zero = withCandidateDigest({
    ...candidates.implementation,
    requestedScope: { ...candidates.implementation.requestedScope, requestedAttempts: 0 },
  });
  assert.equal(evaluate(zero).state, "eligible");
  assert.throws(() => computeFeatureOperationDerivedCandidateDigestV1({
    ...candidates.implementation,
    requestedScope: { ...candidates.implementation.requestedScope, effectKeys: ["effect:z", "effect:a"] },
  }), TypeError);
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
    (value) => { value.children[0].allowedActionIds = ["action:edit", "action:format"]; },
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
  const beta = candidate("child_initiation", { childId: "child:beta", sourceFeatureHead: plan.baseRevision, childBranch: "agent/child-beta" }, "effect:child:initiate");
  beta.requestedScope = requestedScope("effect:child:initiate", "packages/beta");
  beta.candidateDigest = computeFeatureOperationDerivedCandidateDigestV1({ ...beta, candidateDigest: ZERO_DIGEST });
  assert.deepEqual(evaluate(beta), { state: "blocked", reasonCode: "CHILD_OR_DEPENDENCY_INELIGIBLE" });
  const stale = withCandidateDigest({ ...candidates.initiation, sourceFeatureHead: revision("f") });
  assert.deepEqual(evaluate(stale), { state: "blocked", reasonCode: "FEATURE_OR_CHILD_REVISION_STALE" });
  const reusedReplay = replayContext({ consumedEffectKeys: ["effect:child:initiate", "effect:genesis"] });
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
