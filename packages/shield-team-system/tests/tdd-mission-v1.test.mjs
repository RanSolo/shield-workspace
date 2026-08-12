import assert from "node:assert/strict";
import test from "node:test";
import * as tddMissionV1 from "../dist/tdd-mission-v1.mjs";

import {
  TDD_MISSION_DECISIONS,
  TDD_MISSION_EVIDENCE_STAGES,
  TDD_MISSION_EXPECTATION_AMENDMENT_KINDS,
  TDD_MISSION_FAILURE_CLASSIFICATIONS,
  evaluateTddMissionV1,
  validateTddMissionStrategyContractV1,
} from "../dist/tdd-mission-v1.mjs";

const REVISION = "fb2d9c7ba6c0d312d93a5debc0f105de1805563d";
const GREEN_REVISION = "50e818f1a624016c6a850334e0574353b54c2324";
const REFACTOR_REVISION = "7ac35df137c6f12559429cfea693f089b1df8d1e";
const MISSION_HEAD_REVISION = "635975c0abcb4e3ea22108660cfbc2947f17cb5c";
const PLANNING_TREE = "8a756afae0b0586fe1f9911a4b2d18f7650c24a1";
const GREEN_TREE = "650bca49fd1f33bf7da5d637f9f196712a75ea7f";
const REFACTOR_TREE = "4625506e302d60c00d2390266624133a384ca68b";
const MISSION_HEAD_TREE = "9ea6d7469326d87db9b23063c54c983486944bd4";
const CANONICAL_ROOT = "/workspace/shield-workspace";
const CONTRACT_DIGEST = "sha256:acceptance_contract_digest";
const OLD_CONTRACT_DIGEST = "sha256:old_contract_digest";
const AMENDED_CONTRACT_DIGEST = "sha256:amended_contract_digest";
const PACKET_PATHS = [
  "packages/shield-team-system/src/tdd-mission-v1.mts",
  "packages/shield-team-system/tests/tdd-mission-v1.test.mjs",
];

const executableContract = {
  contractId: "contract:ac-162-1",
  kind: "executable",
  checkpointId: "checkpoint:ac-162-1:red",
  expectedBehavior: "The criterion strategy is accepted before implementation.",
};

function preparedState(criterionId = "AC-162-1", overrides = {}) {
  return {
    contractGeneration: 0,
    state: "contract_prepared",
    evidenceId: `evidence:${criterionId.toLowerCase()}:prepared`,
    ownerSeatId: "mack",
    contractId: `contract:${criterionId.toLowerCase()}`,
    checkpointId: `checkpoint:${criterionId.toLowerCase()}:red`,
    revisionId: REVISION,
    expectedFailureClassification: "missing_behavior",
    implementationAuthority: false,
    outcome: "not_run",
    failureEvidence: null,
    furyContractDisposition: null,
    ...overrides,
  };
}

function redState(criterionId = "AC-162-1", overrides = {}) {
  const state = preparedState(criterionId, {
    state: "red_established",
    evidenceId: `evidence:${criterionId.toLowerCase()}:red`,
    outcome: "failed",
    failureEvidence: {
      kind: "executable_failure",
      command: `node --test checkpoint:${criterionId.toLowerCase()}:red`,
      checkpointId: `checkpoint:${criterionId.toLowerCase()}:red`,
      revisionId: REVISION,
      exitCode: 1,
      observedFailureClassification: "missing_behavior",
    },
    furyContractDisposition: {
      contractGeneration: 0,
      evidenceId: `review:fury:${criterionId.toLowerCase()}:contract`,
      reviewerSeatId: "fury",
      contractId: `contract:${criterionId.toLowerCase()}`,
      acceptanceContractDigest: CONTRACT_DIGEST,
      disposition: "approved",
    },
  });
  return {
    ...state,
    ...overrides,
    failureEvidence: overrides.failureEvidence === undefined
      ? state.failureEvidence
      : overrides.failureEvidence,
    furyContractDisposition: overrides.furyContractDisposition === undefined
      ? state.furyContractDisposition
      : overrides.furyContractDisposition,
  };
}

function expectationAmendment(
  criterionId = "AC-162-1",
  amendmentKind = "changed",
  overrides = {},
) {
  const base = {
    edgeId: `edge:${criterionId.toLowerCase()}:0:1`,
    criterionId,
    amendmentKind,
    oldContractGeneration: 0,
    oldContractDigest: OLD_CONTRACT_DIGEST,
    oldContractSnapshot: null,
    amendedContractGeneration: 1,
    amendedContractDigest: AMENDED_CONTRACT_DIGEST,
    amendedContractSnapshot: null,
    predecessorFuryReviewEvidenceId: `review:fury:${criterionId.toLowerCase()}:predecessor`,
    originalExpectationEvidenceRef: `expectation:${criterionId.toLowerCase()}:original`,
    failureClassification: "stale_expectation",
    intentPreservationRationale:
      "The expectation changes syntax while preserving the accepted behavior boundary.",
    contractRelevant: true,
    furyDisposition: {
      contractGeneration: 1,
      evidenceId: `review:fury:${criterionId.toLowerCase()}:amendment`,
      reviewerSeatId: "fury",
      criterionId,
      amendmentKind,
      oldContractDigest: OLD_CONTRACT_DIGEST,
      amendedContractDigest: AMENDED_CONTRACT_DIGEST,
      disposition: "approved",
    },
    fitzVerification: {
      contractGeneration: 1,
      evidenceId: `verification:fitz:${criterionId.toLowerCase()}:amendment`,
      verifierSeatId: "fitz",
      criterionId,
      amendmentKind,
      oldContractDigest: OLD_CONTRACT_DIGEST,
      amendedContractDigest: AMENDED_CONTRACT_DIGEST,
      disposition: "verified",
    },
    freshRerun: {
      contractGeneration: 1,
      evidenceId: `evidence:${criterionId.toLowerCase()}:amendment-rerun`,
      ownerSeatId: "mack",
      criterionId,
      oldContractDigest: OLD_CONTRACT_DIGEST,
      revisionId: REVISION,
      command: `node --test checkpoint:${criterionId.toLowerCase()}:amendment`,
      outcome: "failed",
      exitCode: 1,
      observedFailureClassification: "stale_expectation",
    },
    freshStrategyRationale: null,
    invalidatedEvidenceRefs: {
      implementationAuthorityReceiptRef: `authority:${criterionId.toLowerCase()}:old`,
      greenReceiptRef: `green:${criterionId.toLowerCase()}:old`,
      refactorReceiptRef: `refactor:${criterionId.toLowerCase()}:old`,
      mackValidationReceiptRef: `validation:${criterionId.toLowerCase()}:old`,
      conformanceReceiptRef: `conformance:${criterionId.toLowerCase()}:old`,
    },
  };
  return {
    ...base,
    ...overrides,
    furyDisposition: overrides.furyDisposition === undefined
      ? base.furyDisposition
      : overrides.furyDisposition,
    fitzVerification: overrides.fitzVerification === undefined
      ? base.fitzVerification
      : overrides.fitzVerification,
    freshRerun: overrides.freshRerun === undefined
      ? base.freshRerun
      : overrides.freshRerun,
    invalidatedEvidenceRefs: overrides.invalidatedEvidenceRefs === undefined
      ? base.invalidatedEvidenceRefs
      : overrides.invalidatedEvidenceRefs,
  };
}

function criterion(overrides = {}) {
  const criterionId = overrides.criterionId ?? "AC-162-1";
  const packetId = overrides.traceability?.mayPacketId ?? `packet:${criterionId.toLowerCase()}`;
  return {
    contractGeneration: 0,
    criterionId,
    strategy: "tdd_selected",
    rationale: "The acceptance boundary is deterministic and regression-prone.",
    riskFactors: ["behavioral regression", "incorrect validation sequencing"],
    preImplementationContract: {
      ...executableContract,
      contractId: `contract:${criterionId.toLowerCase()}`,
      checkpointId: `checkpoint:${criterionId.toLowerCase()}:red`,
    },
    acceptanceExpectation: {
      state: "active",
      expectedBehavior: executableContract.expectedBehavior,
    },
    preImplementationStateEvidence: preparedState(criterionId),
    expectationAmendment: null,
    implementationAuthorityEvidence: null,
    greenEvidence: null,
    refactorEvidence: null,
    laterValidation: "required",
    disposition: "implemented_and_proven",
    ...overrides,
    traceability: {
      planRequirementId: `requirement:${criterionId.toLowerCase()}`,
      mackCheckpointId: `checkpoint:${criterionId.toLowerCase()}:red`,
      mayPacketId: packetId,
      revisionId: `revision:${criterionId.toLowerCase()}`,
      validationEvidenceId: `validation:${criterionId.toLowerCase()}`,
      furyReviewId: `review:fury:${criterionId.toLowerCase()}`,
      humanReviewId: `review:human:${criterionId.toLowerCase()}`,
      ...overrides.traceability,
    },
  };
}

function packet(packetId, criterionIds, couplingRationale = null, minimalPaths = PACKET_PATHS) {
  return {
    packetId,
    criterionIds,
    couplingRationale,
    minimalPaths,
    requiredInterfaces: ["interface:tdd-mission-v1"],
    allowedEffects: ["effect:behavioral-implementation", "effect:verification"],
    focusedValidation: [{
      checkpointId: `checkpoint:${packetId}:focused`,
      commandId: "validation:issue-162:focused-node-test",
      command: "node --test tests/tdd-mission-v1.test.mjs",
      executableKind: "test",
    }],
    expectedOutput: "The packet criterion is proven with exact evidence.",
    stopConditions: ["The reviewed contract or authorized scope changes."],
    successor: "exact_head_mack_validation",
  };
}

function implementationAuthority(
  criterionId = "AC-162-1",
  transition = "green",
  overrides = {},
) {
  return {
    contractGeneration: 0,
    evidenceId: `authority:${criterionId.toLowerCase()}:${transition}`,
    authorityKind: "implementation",
    grantorSeatId: "coulson",
    authorizedSeatId: "may",
    criterionId,
    packetId: `packet:${criterionId.toLowerCase()}`,
    contractDigest: CONTRACT_DIGEST,
    transition,
    authorizedPaths: PACKET_PATHS,
    authorizedEffects: ["effect:behavioral-implementation", "effect:verification"],
    ...overrides,
  };
}

function validationReceipt(
  criterionId = "AC-162-1",
  revisionId = GREEN_REVISION,
  overrides = {},
) {
  return {
    evidenceId: `receipt:mack:${criterionId.toLowerCase()}:${revisionId.slice(0, 7)}`,
    checkpointId: `checkpoint:packet:${criterionId.toLowerCase()}:focused`,
    commandId: "validation:issue-162:focused-node-test",
    command: "node --test tests/tdd-mission-v1.test.mjs",
    executableKind: "test",
    outcome: "passed",
    exitCode: 0,
    ...overrides,
  };
}

function mackBundle(
  criterionId = "AC-162-1",
  transitionKind = "green",
  revisionId = GREEN_REVISION,
  treeDigest = GREEN_TREE,
  overrides = {},
) {
  const receipt = validationReceipt(criterionId, revisionId);
  const base = {
    bundleId: `bundle:mack:${criterionId.toLowerCase()}:${transitionKind}`,
    transitionKind,
    missionId: "mission:issue-162:p6",
    planDigest: "sha256:issue_162_tdd_intent_plan",
    contractGeneration: 0,
    acceptanceContractDigest: CONTRACT_DIGEST,
    packetId: `packet:${criterionId.toLowerCase()}`,
    transitionEvidenceId: `${transitionKind}:${criterionId.toLowerCase()}`,
    resultRevisionId: revisionId,
    resultTreeDigest: treeDigest,
    ownerSeatId: "mack",
    runtimeId: "runtime:mack:hosted",
    modelId: "model:mack:gpt-5",
    executorId: "executor:mack:codex",
    receipts: [receipt],
  };
  return {
    ...base,
    ...overrides,
    receipts: overrides.receipts === undefined ? base.receipts : overrides.receipts,
  };
}

function packetFuryReview(
  criterionId = "AC-162-1",
  transitionKind = "green",
  revisionId = GREEN_REVISION,
  treeDigest = GREEN_TREE,
  overrides = {},
) {
  return {
    reviewId: `review:fury:packet:${criterionId.toLowerCase()}:${transitionKind}`,
    reviewerSeatId: "fury",
    runtimeId: "runtime:fury:hosted",
    modelId: "model:fury:gpt-5",
    executorId: "executor:fury:codex",
    missionId: "mission:issue-162:p6",
    planDigest: "sha256:issue_162_tdd_intent_plan",
    contractGeneration: 0,
    acceptanceContractDigest: CONTRACT_DIGEST,
    packetId: `packet:${criterionId.toLowerCase()}`,
    transitionKind,
    transitionEvidenceId: `${transitionKind}:${criterionId.toLowerCase()}`,
    resultRevisionId: revisionId,
    resultTreeDigest: treeDigest,
    mackBundleId: `bundle:mack:${criterionId.toLowerCase()}:${transitionKind}`,
    verdict: "PASS",
    findings: [],
    sourceRefs: [
      `bundle:mack:${criterionId.toLowerCase()}:${transitionKind}`,
      `source:fury:${criterionId.toLowerCase()}:${transitionKind}`,
    ],
    ...overrides,
  };
}

function greenEvidence(criterionId = "AC-162-1", overrides = {}) {
  const base = {
    contractGeneration: 0,
    state: "green_proven",
    evidenceId: `green:${criterionId.toLowerCase()}`,
    ownerSeatId: "may",
    criterionId,
    packetId: `packet:${criterionId.toLowerCase()}`,
    contractDigest: CONTRACT_DIGEST,
    missionId: "mission:issue-162:p6",
    planDigest: "sha256:issue_162_tdd_intent_plan",
    acceptanceContractDigest: CONTRACT_DIGEST,
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/issue-162-tdd-intent",
    predecessorRevisionId: REVISION,
    predecessorTreeDigest: PLANNING_TREE,
    resultRevisionId: GREEN_REVISION,
    resultTreeDigest: GREEN_TREE,
    transitionKind: "green",
    observedPaths: PACKET_PATHS,
    observedEffects: ["effect:behavioral-implementation", "effect:verification"],
    authorityEvidenceRef: `authority:${criterionId.toLowerCase()}:green`,
    checkpointId: `checkpoint:packet:${criterionId.toLowerCase()}:focused`,
    commandId: "validation:issue-162:focused-node-test",
    command: "node --test tests/tdd-mission-v1.test.mjs",
    outcome: "passed",
    focusedMackEvidenceRef: `receipt:mack:${criterionId.toLowerCase()}:${GREEN_REVISION.slice(0, 7)}`,
    implementationKind: "smallest_correct_green",
    cleanupBundled: false,
    mackValidationBundle: mackBundle(criterionId),
    packetFuryReview: packetFuryReview(criterionId),
  };
  return {
    ...base,
    ...overrides,
    mackValidationBundle: overrides.mackValidationBundle === undefined
      ? base.mackValidationBundle
      : overrides.mackValidationBundle,
    packetFuryReview: overrides.packetFuryReview === undefined
      ? base.packetFuryReview
      : overrides.packetFuryReview,
  };
}

function refactorEvidence(criterionId = "AC-162-1", overrides = {}) {
  const base = {
    contractGeneration: 0,
    state: "refactor_proven",
    evidenceId: `refactor:${criterionId.toLowerCase()}`,
    ownerSeatId: "may",
    criterionId,
    packetId: `packet:${criterionId.toLowerCase()}`,
    contractDigest: CONTRACT_DIGEST,
    missionId: "mission:issue-162:p6",
    planDigest: "sha256:issue_162_tdd_intent_plan",
    acceptanceContractDigest: CONTRACT_DIGEST,
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/issue-162-tdd-intent",
    predecessorRevisionId: GREEN_REVISION,
    predecessorTreeDigest: GREEN_TREE,
    resultRevisionId: REFACTOR_REVISION,
    resultTreeDigest: REFACTOR_TREE,
    transitionKind: "refactor",
    greenRevisionId: GREEN_REVISION,
    observedPaths: [PACKET_PATHS[0]],
    observedEffects: ["effect:behavioral-implementation"],
    authorityEvidenceRef: `authority:${criterionId.toLowerCase()}:refactor`,
    checkpointId: `checkpoint:packet:${criterionId.toLowerCase()}:focused`,
    commandId: "validation:issue-162:focused-node-test",
    command: "node --test tests/tdd-mission-v1.test.mjs",
    outcome: "passed",
    focusedMackEvidenceRef: `receipt:mack:${criterionId.toLowerCase()}:${REFACTOR_REVISION.slice(0, 7)}`,
    implementationKind: "behavior_preserving_refactor",
    behaviorPreserved: true,
    failureSemanticsPreserved: true,
    authoritySemanticsPreserved: true,
    persistenceSemanticsPreserved: true,
    riskPreserved: true,
    implementationAuthorityEvidence: implementationAuthority(
      criterionId,
      "refactor",
      {
        authorizedPaths: [PACKET_PATHS[0]],
        authorizedEffects: ["effect:behavioral-implementation"],
      },
    ),
    mackValidationBundle: mackBundle(
      criterionId,
      "refactor",
      REFACTOR_REVISION,
      REFACTOR_TREE,
    ),
    packetFuryReview: packetFuryReview(
      criterionId,
      "refactor",
      REFACTOR_REVISION,
      REFACTOR_TREE,
    ),
  };
  return {
    ...base,
    ...overrides,
    implementationAuthorityEvidence: overrides.implementationAuthorityEvidence === undefined
      ? base.implementationAuthorityEvidence
      : overrides.implementationAuthorityEvidence,
    mackValidationBundle: overrides.mackValidationBundle === undefined
      ? base.mackValidationBundle
      : overrides.mackValidationBundle,
    packetFuryReview: overrides.packetFuryReview === undefined
      ? base.packetFuryReview
      : overrides.packetFuryReview,
  };
}

function strategyContract(
  criteria = [criterion()],
  packets = criteria.map((item) => packet(item.traceability.mayPacketId, [item.criterionId])),
) {
  const contractGeneration = criteria[0]?.contractGeneration ?? 0;
  const candidate = {
    schemaVersion: 1,
    contractVersion: "tdd.mission.v1",
    contractGeneration,
    acceptanceContractDigest: CONTRACT_DIGEST,
    criteria,
    packets,
  };
  const acceptanceContractDigest = tddMissionV1
    .deriveTddMissionAcceptanceContractDigestV1(candidate) ?? CONTRACT_DIGEST;
  const bindDigest = (value) => {
    try {
      if (Array.isArray(value)) return value.map(bindDigest);
      if (value === null || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
        key,
        (key === "acceptanceContractDigest" || key === "contractDigest") &&
          nested === CONTRACT_DIGEST
          ? acceptanceContractDigest
          : bindDigest(nested),
      ]));
    } catch {
      return value;
    }
  };
  return {
    ...candidate,
    acceptanceContractDigest,
    criteria: bindDigest(criteria),
  };
}

function canonicalSort(values) {
  return [...values].sort((left, right) => {
    const leftKey = JSON.stringify(left, Object.keys(left ?? {}).sort());
    const rightKey = JSON.stringify(right, Object.keys(right ?? {}).sort());
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function contractSnapshot(contractGeneration, criteria, packets) {
  return {
    schemaVersion: 1,
    contractVersion: "tdd.mission.v1",
    contractGeneration,
    criteria: criteria.map((item) => ({
      criterionId: item.criterionId,
      strategy: item.strategy,
      rationale: item.rationale,
      riskFactors: canonicalSort(item.riskFactors),
      laterValidation: item.laterValidation,
      disposition: item.disposition,
      acceptanceExpectation: item.acceptanceExpectation,
      preImplementationContract: item.preImplementationContract,
      traceability: {
        planRequirementId: item.traceability.planRequirementId,
        mackCheckpointId: item.traceability.mackCheckpointId,
        mayPacketId: item.traceability.mayPacketId,
        humanReviewId: item.traceability.humanReviewId,
      },
    })).sort((left, right) => left.criterionId.localeCompare(right.criterionId)),
    packets: packets.map((item) => ({
      ...item,
      criterionIds: canonicalSort(item.criterionIds),
      minimalPaths: canonicalSort(item.minimalPaths),
      requiredInterfaces: canonicalSort(item.requiredInterfaces),
      allowedEffects: canonicalSort(item.allowedEffects),
      focusedValidation: canonicalSort(item.focusedValidation),
      stopConditions: canonicalSort(item.stopConditions),
    })).sort((left, right) => left.packetId.localeCompare(right.packetId)),
  };
}

function generationOne(value) {
  if (Array.isArray(value)) return value.map(generationOne);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    key === "contractGeneration" ? 1 : generationOne(nested),
  ]));
}

function amendedStrategyContract({ oldStrategy = "tdd_selected", amendmentKind = "changed" } = {}) {
  const criterionId = "AC-162-1";
  const oldBehavior = executableContract.expectedBehavior;
  const amendedBehavior = amendmentKind === "changed"
    ? "The amended criterion strategy is accepted before implementation."
    : oldBehavior;
  const oldCriterion = criterion(oldStrategy === "tdd_declined" ? {
    strategy: "tdd_declined",
    rationale: "The original criterion has no executable pre-implementation seam.",
    preImplementationContract: null,
    preImplementationStateEvidence: null,
  } : {});
  const packets = [packet("packet:ac-162-1", [criterionId])];
  const oldSnapshot = contractSnapshot(0, [oldCriterion], packets);
  const oldDigest = tddMissionV1.deriveTddMissionAcceptanceContractDigestV1(oldSnapshot);
  assert.match(oldDigest, /^sha256:[A-Za-z0-9_-]+$/u);

  const becomesDeclined = amendmentKind === "removed" || oldStrategy === "tdd_declined";
  const activeBase = generationOne(criterion({
    strategy: becomesDeclined ? "tdd_declined" : "tdd_selected",
    rationale: oldCriterion.rationale,
    acceptanceExpectation: {
      state: amendmentKind === "removed" ? "removed" : "active",
      expectedBehavior: amendedBehavior,
    },
    preImplementationContract: becomesDeclined ? null : {
      ...executableContract,
      expectedBehavior: amendedBehavior,
    },
    preImplementationStateEvidence: becomesDeclined ? null : redState(criterionId, {
      contractGeneration: 1,
      furyContractDisposition: {
        ...redState().furyContractDisposition,
        contractGeneration: 1,
      },
    }),
    expectationAmendment: null,
  }));
  const activeSnapshot = contractSnapshot(1, [activeBase], packets);
  const activeDigest = tddMissionV1.deriveTddMissionAcceptanceContractDigestV1(activeSnapshot);
  assert.match(activeDigest, /^sha256:[A-Za-z0-9_-]+$/u);
  const amendment = expectationAmendment(criterionId, amendmentKind, {
    edgeId: "edge:ac-162-1:0:1",
    oldContractGeneration: 0,
    oldContractDigest: oldDigest,
    oldContractSnapshot: oldSnapshot,
    amendedContractGeneration: 1,
    amendedContractDigest: activeDigest,
    amendedContractSnapshot: activeSnapshot,
    predecessorFuryReviewEvidenceId: "review:fury:ac-162-1:predecessor",
    freshStrategyRationale: becomesDeclined
      ? "The fresh amended strategy remains declined without manufacturing Red evidence."
      : null,
    furyDisposition: {
      ...expectationAmendment().furyDisposition,
      contractGeneration: 1,
      amendmentKind,
      oldContractDigest: oldDigest,
      amendedContractDigest: activeDigest,
    },
    fitzVerification: {
      ...expectationAmendment().fitzVerification,
      contractGeneration: 1,
      amendmentKind,
      oldContractDigest: oldDigest,
      amendedContractDigest: activeDigest,
    },
    freshRerun: {
      ...expectationAmendment().freshRerun,
      contractGeneration: 1,
      oldContractDigest: oldDigest,
    },
  });
  const activeCriterion = {
    ...activeBase,
    expectationAmendment: amendment,
  };
  const bindDigest = (value) => {
    if (Array.isArray(value)) return value.map(bindDigest);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      (key === "acceptanceContractDigest" || key === "contractDigest") &&
        nested === CONTRACT_DIGEST
        ? activeDigest
        : bindDigest(nested),
    ]));
  };
  return {
    contract: {
      schemaVersion: 1,
      contractVersion: "tdd.mission.v1",
      contractGeneration: 1,
      acceptanceContractDigest: activeDigest,
      criteria: [bindDigest(activeCriterion)],
      packets,
    },
    oldSnapshot,
    oldDigest,
    activeSnapshot,
    activeDigest,
  };
}

function revokedArray() {
  const { proxy, revoke } = Proxy.revocable([], {});
  revoke();
  return proxy;
}

function exactEvidence({
  evidenceId,
  stage,
  seatId,
  revisionId,
  treeDigest,
  command = null,
  checkpointId,
  outcome,
  failureClassification = null,
  sourceRefs,
  successor,
  stopCondition = null,
  decisionOwnerSeatId = null,
  criterionId = "AC-162-1",
  packetId = "packet:ac-162-1",
  startRevisionId = revisionId,
  startTreeDigest = treeDigest,
  endRevisionId = revisionId,
  endTreeDigest = treeDigest,
  exitCode,
  testCounts,
  cacheEvidence,
  contractGeneration = 0,
}) {
  const commandExitCode = exitCode ?? (command === null ? null : outcome === "failed" ? 1 : 0);
  const commandTestCounts = testCounts ?? (command === null ? null : {
    total: 1,
    passed: outcome === "passed" ? 1 : 0,
    failed: outcome === "failed" ? 1 : 0,
    skipped: 0,
    cancelled: 0,
    todo: 0,
  });
  return {
    contractGeneration,
    evidenceId,
    missionId: "mission:issue-162:p6",
    planDigest: "sha256:issue_162_tdd_intent_plan",
    acceptanceContractDigest: CONTRACT_DIGEST,
    criterionId,
    packetId,
    stage,
    seatId,
    runtimeId: `runtime:${seatId}:hosted`,
    modelId: `model:${seatId}:gpt-5`,
    executorId: `executor:${seatId}:codex`,
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/issue-162-tdd-intent",
    cwd: "/workspace/shield-workspace/packages/shield-team-system",
    startRevisionId,
    startTreeDigest,
    endRevisionId,
    endTreeDigest,
    revisionId: endRevisionId,
    treeDigest: endTreeDigest,
    command,
    exitCode: commandExitCode,
    testCounts: commandTestCounts,
    cacheEvidence: cacheEvidence ?? (command === null ? null : "cache:not_applicable"),
    checkpointId,
    outcome,
    failureClassification,
    sourceRefs,
    successor,
    stopCondition,
    decisionOwnerSeatId,
  };
}

function terminalCommandReceipt(checkpointId, overrides = {}) {
  const table = {
    "checkpoint:issue-162:terminal:focused": {
      commandId: "validation:issue-162:focused-node-test",
      command: "node --test packages/shield-team-system/tests/tdd-mission-v1.test.mjs",
      executableKind: "test",
    },
    "checkpoint:issue-162:terminal:build": {
      commandId: "validation:issue-162:nx-build",
      command: "npm exec nx run @shield/team-system:build",
      executableKind: "build",
    },
    "checkpoint:issue-162:terminal:test": {
      commandId: "validation:issue-162:nx-test",
      command: "npm exec nx run @shield/team-system:test",
      executableKind: "test",
    },
  };
  const configured = table[checkpointId];
  const testCounts = configured.executableKind === "test" ? {
    total: 1, passed: 1, failed: 0, skipped: 0, cancelled: 0, todo: 0,
  } : null;
  return {
    evidenceId: `receipt:mack:${checkpointId.split(":").at(-1)}`,
    checkpointId,
    ...configured,
    outcome: "passed",
    exitCode: 0,
    testCounts,
    cacheEvidence: "cache:not_applicable",
    failureClassification: null,
    sourceRefs: [`command:${configured.commandId}`],
    ...overrides,
  };
}

function cumulativeMackBundle(contract, includeRefactor, overrides = {}) {
  const transitionBundleRefs = [
    "bundle:mack:ac-162-1:green",
    ...(includeRefactor ? ["bundle:mack:ac-162-1:refactor"] : []),
  ];
  const base = {
    bundleId: "bundle:mack:mission:terminal",
    missionId: "mission:issue-162:p6",
    planDigest: "sha256:issue_162_tdd_intent_plan",
    acceptanceContractDigest: contract.acceptanceContractDigest,
    contractGeneration: contract.contractGeneration,
    ownerSeatId: "mack",
    runtimeId: "runtime:mack:hosted",
    modelId: "model:mack:gpt-5",
    executorId: "executor:mack:codex",
    canonicalRoot: CANONICAL_ROOT,
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/issue-162-tdd-intent",
    headRevisionId: MISSION_HEAD_REVISION,
    headTreeDigest: MISSION_HEAD_TREE,
    changedPaths: PACKET_PATHS,
    trackedClean: true,
    transitionBundleRefs,
    dispositionRefs: ["disposition:ac-162-1:implemented"],
    receipts: [
      terminalCommandReceipt("checkpoint:issue-162:terminal:focused"),
      terminalCommandReceipt("checkpoint:issue-162:terminal:build"),
      terminalCommandReceipt("checkpoint:issue-162:terminal:test"),
    ],
  };
  return { ...base, ...overrides };
}

function furyTerminalReceipt(contract, includeRefactor, overrides = {}) {
  return {
    evidenceId: "receipt:fury:mission:terminal",
    missionId: "mission:issue-162:p6",
    planDigest: "sha256:issue_162_tdd_intent_plan",
    acceptanceContractDigest: contract.acceptanceContractDigest,
    contractGeneration: contract.contractGeneration,
    reviewerSeatId: "fury",
    runtimeId: "runtime:fury:hosted",
    modelId: "model:fury:gpt-5",
    executorId: "executor:fury:codex",
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/issue-162-tdd-intent",
    headRevisionId: MISSION_HEAD_REVISION,
    headTreeDigest: MISSION_HEAD_TREE,
    mackBundleRef: "bundle:mack:mission:terminal",
    transitionReviewRefs: [
      "review:fury:packet:ac-162-1:green",
      ...(includeRefactor ? ["review:fury:packet:ac-162-1:refactor"] : []),
    ],
    dispositionRefs: ["disposition:ac-162-1:implemented"],
    verdict: "PASS",
    command: null,
    exitCode: null,
    testCounts: null,
    cacheEvidence: null,
    failureClassification: null,
    ...overrides,
  };
}

function fullFlowMission({ includeRefactor = true, disposition, evidence } = {}) {
  const finalRevision = includeRefactor ? REFACTOR_REVISION : GREEN_REVISION;
  const finalTree = includeRefactor ? REFACTOR_TREE : GREEN_TREE;
  const implemented = criterion({
    preImplementationStateEvidence: redState(),
    implementationAuthorityEvidence: implementationAuthority(),
    greenEvidence: greenEvidence(),
    refactorEvidence: includeRefactor ? refactorEvidence() : null,
    disposition: disposition ?? "implemented_and_proven",
    traceability: {
      revisionId: finalRevision,
      validationEvidenceId: "bundle:mack:mission:terminal",
      furyReviewId: "receipt:fury:mission:terminal",
      humanReviewId: "review:human:ac-162-1",
    },
  });
  const contract = strategyContract([implemented]);
  const records = evidence ?? [
    exactEvidence({
      evidenceId: "evidence:ac-162-1:strategy",
      stage: "strategy_recorded",
      seatId: "hill",
      revisionId: REVISION,
      treeDigest: PLANNING_TREE,
      checkpointId: "requirement:ac-162-1",
      outcome: "recorded",
      sourceRefs: ["requirement:ac-162-1"],
      successor: "contract_prepared",
    }),
    exactEvidence({
      evidenceId: "evidence:ac-162-1:prepared",
      stage: "contract_prepared",
      seatId: "mack",
      revisionId: REVISION,
      treeDigest: PLANNING_TREE,
      checkpointId: "checkpoint:ac-162-1:red",
      outcome: "prepared",
      sourceRefs: ["contract:ac-162-1"],
      successor: "red_established",
    }),
    exactEvidence({
      evidenceId: "evidence:ac-162-1:red",
      stage: "red_established",
      seatId: "mack",
      revisionId: REVISION,
      treeDigest: PLANNING_TREE,
      command: "node --test checkpoint:ac-162-1:red",
      checkpointId: "checkpoint:ac-162-1:red",
      outcome: "failed",
      failureClassification: "missing_behavior",
      sourceRefs: [
        "evidence:ac-162-1:prepared",
        "review:fury:ac-162-1:contract",
      ],
      successor: "implementation_authorized",
    }),
    exactEvidence({
      evidenceId: "authority:ac-162-1:green",
      stage: "implementation_authorized",
      seatId: "coulson",
      revisionId: REVISION,
      treeDigest: PLANNING_TREE,
      checkpointId: "authority:ac-162-1:green",
      outcome: "authorized",
      sourceRefs: ["evidence:ac-162-1:red"],
      successor: "green_proven",
    }),
    exactEvidence({
      evidenceId: "green:ac-162-1",
      stage: "green_proven",
      seatId: "may",
      revisionId: GREEN_REVISION,
      treeDigest: GREEN_TREE,
      startRevisionId: REVISION,
      startTreeDigest: PLANNING_TREE,
      checkpointId: "green:ac-162-1",
      outcome: "passed",
      sourceRefs: ["authority:ac-162-1:green"],
      successor: includeRefactor ? "refactor_proven" : "mack_validation_complete",
    }),
    ...(includeRefactor ? [exactEvidence({
      evidenceId: "refactor:ac-162-1",
      stage: "refactor_proven",
      seatId: "may",
      revisionId: REFACTOR_REVISION,
      treeDigest: REFACTOR_TREE,
      startRevisionId: GREEN_REVISION,
      startTreeDigest: GREEN_TREE,
      checkpointId: "refactor:ac-162-1",
      outcome: "passed",
      sourceRefs: ["green:ac-162-1", "authority:ac-162-1:refactor"],
      successor: "mack_validation_complete",
    })] : []),
  ];
  const boundRecords = records.map((item) => item.acceptanceContractDigest === CONTRACT_DIGEST
    ? { ...item, acceptanceContractDigest: contract.acceptanceContractDigest }
    : item);
  return {
    schemaVersion: 1,
    contractVersion: "tdd.mission.v1",
    missionId: "mission:issue-162:p6",
    planDigest: "sha256:issue_162_tdd_intent_plan",
    reviewedAcceptanceContractDigest: contract.acceptanceContractDigest,
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/issue-162-tdd-intent",
    planningRevisionId: REVISION,
    planningTreeDigest: PLANNING_TREE,
    headRevisionId: MISSION_HEAD_REVISION,
    headTreeDigest: MISSION_HEAD_TREE,
    reviewedPredecessorContract: null,
    strategyContract: contract,
    evidence: boundRecords,
    cumulativeMackValidationBundle: cumulativeMackBundle(contract, includeRefactor),
    furyTerminalReceipt: furyTerminalReceipt(contract, includeRefactor),
  };
}

function rebindMissionStrategy(base, contract, evidence = base.evidence) {
  const dispositionRefs = evidence
    .filter((item) => item.stage === "disposition_recorded")
    .map((item) => item.evidenceId);
  const implemented = contract.criteria.filter(
    (item) => item.disposition === "implemented_and_proven",
  );
  const terminalDispositionRefs = [
    ...implemented.map((item) => `disposition:${item.criterionId.toLowerCase()}:implemented`),
    ...dispositionRefs,
  ];
  const transitionBundleRefs = implemented.flatMap((item) => [
    item.greenEvidence?.mackValidationBundle.bundleId,
    item.refactorEvidence?.mackValidationBundle.bundleId,
  ]).filter(Boolean);
  const transitionReviewRefs = implemented.flatMap((item) => [
    item.greenEvidence?.packetFuryReview.reviewId,
    item.refactorEvidence?.packetFuryReview.reviewId,
  ]).filter(Boolean);
  const changedPaths = implemented.flatMap((item) => [
    ...(item.greenEvidence?.observedPaths ?? []),
    ...(item.refactorEvidence?.observedPaths ?? []),
  ]).filter((path, index, paths) => paths.indexOf(path) === index);
  return {
    ...base,
    reviewedAcceptanceContractDigest: contract.acceptanceContractDigest,
    reviewedPredecessorContract: null,
    strategyContract: contract,
    evidence: evidence.map((item) => ({
      ...item,
      contractGeneration: contract.contractGeneration,
      acceptanceContractDigest: contract.acceptanceContractDigest,
    })),
    cumulativeMackValidationBundle: {
      ...base.cumulativeMackValidationBundle,
      contractGeneration: contract.contractGeneration,
      acceptanceContractDigest: contract.acceptanceContractDigest,
      transitionBundleRefs,
      dispositionRefs: terminalDispositionRefs,
      changedPaths,
    },
    furyTerminalReceipt: {
      ...base.furyTerminalReceipt,
      contractGeneration: contract.contractGeneration,
      acceptanceContractDigest: contract.acceptanceContractDigest,
      transitionReviewRefs,
      dispositionRefs: terminalDispositionRefs,
    },
  };
}

function amendedFlowMission({ oldStrategy = "tdd_selected", amendmentKind = "changed" } = {}) {
  const amendment = amendedStrategyContract({ oldStrategy, amendmentKind });
  const activeCriterion = amendment.contract.criteria[0];
  const activeDigest = amendment.activeDigest;
  const activeSelected = activeCriterion.strategy === "tdd_selected";
  const completedCriterion = {
    ...activeCriterion,
    implementationAuthorityEvidence: {
      ...implementationAuthority("AC-162-1", "green", { contractDigest: activeDigest }),
      contractGeneration: 1,
    },
    greenEvidence: {
      ...greenEvidence("AC-162-1", { contractDigest: activeDigest }),
      contractGeneration: 1,
      acceptanceContractDigest: activeDigest,
      mackValidationBundle: {
        ...mackBundle("AC-162-1"),
        contractGeneration: 1,
        acceptanceContractDigest: activeDigest,
      },
      packetFuryReview: {
        ...packetFuryReview("AC-162-1"),
        contractGeneration: 1,
        acceptanceContractDigest: activeDigest,
      },
    },
    traceability: {
      ...activeCriterion.traceability,
      revisionId: GREEN_REVISION,
      validationEvidenceId: "bundle:mack:mission:terminal",
      furyReviewId: "receipt:fury:mission:terminal",
    },
  };
  const contract = {
    ...amendment.contract,
    criteria: [completedCriterion],
  };
  const records = [
    exactEvidence({
      evidenceId: "evidence:ac-162-1:strategy:g1",
      stage: "strategy_recorded",
      seatId: "hill",
      revisionId: REVISION,
      treeDigest: PLANNING_TREE,
      checkpointId: "requirement:ac-162-1",
      outcome: "recorded",
      sourceRefs: ["requirement:ac-162-1"],
      successor: activeSelected ? "contract_prepared" : "implementation_authorized",
      contractGeneration: 1,
    }),
    ...(activeSelected ? [
      exactEvidence({
        evidenceId: "evidence:ac-162-1:prepared:g1",
        stage: "contract_prepared",
        seatId: "mack",
        revisionId: REVISION,
        treeDigest: PLANNING_TREE,
        checkpointId: "checkpoint:ac-162-1:red",
        outcome: "prepared",
        sourceRefs: ["contract:ac-162-1"],
        successor: "red_established",
        contractGeneration: 1,
      }),
      exactEvidence({
        evidenceId: "evidence:ac-162-1:red",
        stage: "red_established",
        seatId: "mack",
        revisionId: REVISION,
        treeDigest: PLANNING_TREE,
        command: "node --test checkpoint:ac-162-1:red",
        checkpointId: "checkpoint:ac-162-1:red",
        outcome: "failed",
        failureClassification: "missing_behavior",
        sourceRefs: [
          "evidence:ac-162-1:prepared:g1",
          "review:fury:ac-162-1:contract",
        ],
        successor: "implementation_authorized",
        contractGeneration: 1,
      }),
    ] : []),
    exactEvidence({
      evidenceId: "authority:ac-162-1:green",
      stage: "implementation_authorized",
      seatId: "coulson",
      revisionId: REVISION,
      treeDigest: PLANNING_TREE,
      checkpointId: "authority:ac-162-1:green",
      outcome: "authorized",
      sourceRefs: [activeSelected
        ? "evidence:ac-162-1:red"
        : "evidence:ac-162-1:strategy:g1"],
      successor: "green_proven",
      contractGeneration: 1,
    }),
    exactEvidence({
      evidenceId: "green:ac-162-1",
      stage: "green_proven",
      seatId: "may",
      revisionId: GREEN_REVISION,
      treeDigest: GREEN_TREE,
      startRevisionId: REVISION,
      startTreeDigest: PLANNING_TREE,
      checkpointId: "green:ac-162-1",
      outcome: "passed",
      sourceRefs: ["authority:ac-162-1:green"],
      successor: "mack_validation_complete",
      contractGeneration: 1,
    }),
  ].map((item) => ({
    ...item,
    acceptanceContractDigest: activeDigest,
  }));
  return {
    schemaVersion: 1,
    contractVersion: "tdd.mission.v1",
    missionId: "mission:issue-162:p6",
    planDigest: "sha256:issue_162_tdd_intent_plan",
    reviewedAcceptanceContractDigest: activeDigest,
    reviewedPredecessorContract: {
      contractGeneration: 0,
      acceptanceContractDigest: amendment.oldDigest,
      snapshot: amendment.oldSnapshot,
      furyReview: {
        evidenceId: "review:fury:ac-162-1:predecessor",
        reviewerSeatId: "fury",
        missionId: "mission:issue-162:p6",
        planDigest: "sha256:issue_162_tdd_intent_plan",
        contractGeneration: 0,
        acceptanceContractDigest: amendment.oldDigest,
        reviewedRevisionId: REVISION,
        reviewedTreeDigest: PLANNING_TREE,
        disposition: "approved",
        sourceRefs: ["source:fury:predecessor"],
      },
    },
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/issue-162-tdd-intent",
    planningRevisionId: REVISION,
    planningTreeDigest: PLANNING_TREE,
    headRevisionId: MISSION_HEAD_REVISION,
    headTreeDigest: MISSION_HEAD_TREE,
    strategyContract: contract,
    evidence: records,
    cumulativeMackValidationBundle: cumulativeMackBundle(contract, false),
    furyTerminalReceipt: furyTerminalReceipt(contract, false),
  };
}

test("acceptance identity matches the empty and nonempty golden vectors", () => {
  assert.equal(tddMissionV1.deriveTddMissionAcceptanceContractDigestV1({
    schemaVersion: 1,
    contractVersion: "tdd.mission.v1",
    contractGeneration: 0,
    criteria: [],
    packets: [],
  }), "sha256:cmUeaevhL6GckHGcclInnDdHUnXPSabx14PBwSSOAik");

  const golden = {
    schemaVersion: 1,
    contractVersion: "tdd.mission.v1",
    contractGeneration: 0,
    criteria: [{
      criterionId: "AC-A",
      strategy: "tdd_selected",
      rationale: "closed behavior",
      riskFactors: ["regression"],
      laterValidation: "required",
      disposition: "implemented_and_proven",
      acceptanceExpectation: { state: "active", expectedBehavior: "A holds" },
      preImplementationContract: {
        contractId: "contract:A",
        kind: "executable",
        checkpointId: "checkpoint:A",
        expectedBehavior: "A holds",
      },
      traceability: {
        planRequirementId: "requirement:A",
        mackCheckpointId: "checkpoint:A",
        mayPacketId: "packet:A",
        humanReviewId: null,
      },
    }, {
      criterionId: "AC-B",
      strategy: "tdd_declined",
      rationale: "documentation only",
      riskFactors: ["documentation"],
      laterValidation: "required",
      disposition: "implemented_and_proven",
      acceptanceExpectation: {
        state: "active",
        expectedBehavior: "B remains documented",
      },
      preImplementationContract: null,
      traceability: {
        planRequirementId: "requirement:B",
        mackCheckpointId: "checkpoint:B",
        mayPacketId: "packet:B",
        humanReviewId: "review:human:B",
      },
    }],
    packets: [{
      packetId: "packet:A",
      criterionIds: ["AC-A"],
      couplingRationale: null,
      minimalPaths: ["src/a.mts"],
      requiredInterfaces: ["interface:a"],
      allowedEffects: ["effect:a"],
      focusedValidation: [{
        checkpointId: "checkpoint:A",
        commandId: "validation:A",
        command: "node --test a.test.mjs",
        executableKind: "test",
      }],
      expectedOutput: "A passes",
      stopConditions: ["scope changes"],
      successor: "packet:B",
    }, {
      packetId: "packet:B",
      criterionIds: ["AC-B"],
      couplingRationale: null,
      minimalPaths: ["docs/b.md"],
      requiredInterfaces: ["interface:b"],
      allowedEffects: ["effect:b"],
      focusedValidation: [{
        checkpointId: "checkpoint:B",
        commandId: "validation:B",
        command: "node --test b.test.mjs",
        executableKind: "test",
      }],
      expectedOutput: "B passes",
      stopConditions: ["scope changes"],
      successor: "mission_complete",
    }],
  };
  assert.equal(
    tddMissionV1.deriveTddMissionAcceptanceContractDigestV1(golden),
    "sha256:Bl22e_4j7ILiD1lrj7UHMqBzjqHtOdSl7bWMgyhNasM",
  );
});

test("acceptance identity sorts permitted sets and changes with behavior-bearing content", () => {
  const firstCriterion = criterion();
  const firstPacket = packet("packet:ac-162-1", ["AC-162-1"]);
  const first = strategyContract([firstCriterion], [firstPacket]);
  const reordered = strategyContract([{
    ...firstCriterion,
    riskFactors: [...firstCriterion.riskFactors].reverse(),
  }], [{
    ...firstPacket,
    minimalPaths: [...firstPacket.minimalPaths].reverse(),
    allowedEffects: [...firstPacket.allowedEffects].reverse(),
  }]);
  assert.equal(first.acceptanceContractDigest, reordered.acceptanceContractDigest);

  const changedBehavior = strategyContract([criterion({
    acceptanceExpectation: {
      state: "active",
      expectedBehavior: "The criterion now has materially different accepted behavior.",
    },
    preImplementationContract: {
      ...executableContract,
      expectedBehavior: "The criterion now has materially different accepted behavior.",
    },
  })]);
  assert.notEqual(first.acceptanceContractDigest, changedBehavior.acceptanceContractDigest);
});

test("contract generation is explicit, safe, and caller digest substitution is rejected", () => {
  const validContract = strategyContract();
  assert.equal(validateTddMissionStrategyContractV1(validContract).state, "valid");

  const { contractGeneration: _generation, ...missingGeneration } = validContract;
  for (const candidate of [
    missingGeneration,
    { ...validContract, contractGeneration: -1 },
    { ...validContract, contractGeneration: Number.MAX_SAFE_INTEGER + 1 },
    { ...validContract, acceptanceContractDigest: "sha256:caller_substitution" },
  ]) {
    const result = validateTddMissionStrategyContractV1(candidate);
    assert.equal(result.state, "invalid");
  }
  const missingCriterionGeneration = structuredClone(validContract);
  delete missingCriterionGeneration.criteria[0].contractGeneration;
  assert.equal(
    validateTddMissionStrategyContractV1(missingCriterionGeneration).state,
    "invalid",
  );
});

test("selected TDD requires an executable pre-implementation contract", () => {
  const valid = validateTddMissionStrategyContractV1(strategyContract());
  assert.equal(valid.state, "valid");
  assert.equal(valid.contract.criteria[0].preImplementationContract.kind, "executable");

  const missing = validateTddMissionStrategyContractV1(strategyContract([
    criterion({ preImplementationContract: null }),
  ]));
  assert.equal(missing.state, "invalid");
  assert.deepEqual(missing.reasonCodes, ["VALIDATION_CONTRACT_MISSING"]);
});

test("declined TDD remains valid only with rationale and required later validation", () => {
  const declined = criterion({
    strategy: "tdd_declined",
    rationale: "The criterion is documentation-only and has no executable pre-implementation seam.",
    riskFactors: ["manual interpretation"],
    preImplementationContract: null,
    preImplementationStateEvidence: null,
  });
  const valid = validateTddMissionStrategyContractV1(strategyContract([declined]));
  assert.equal(valid.state, "valid");
  assert.equal(valid.contract.criteria[0].laterValidation, "required");

  const missingRationale = validateTddMissionStrategyContractV1(strategyContract([
    { ...declined, rationale: "  " },
  ]));
  assert.equal(missingRationale.state, "invalid");
  assert.deepEqual(missingRationale.reasonCodes, ["STRATEGY_RATIONALE_MISSING"]);

  const skippedValidation = validateTddMissionStrategyContractV1(strategyContract([
    { ...declined, laterValidation: "skipped" },
  ]));
  assert.equal(skippedValidation.state, "invalid");
  assert.deepEqual(skippedValidation.reasonCodes, ["MALFORMED_INPUT"]);
});

test("criterion IDs and risk factors are present and stable", () => {
  const second = criterion({ criterionId: "AC-162-2" });
  const duplicate = validateTddMissionStrategyContractV1(strategyContract([
    criterion(),
    criterion({ rationale: "A second record cannot reuse the same stable ID." }),
  ], [packet("packet:ac-162-1", ["AC-162-1"])]));
  assert.equal(duplicate.state, "invalid");

  const missingRisks = validateTddMissionStrategyContractV1(strategyContract([
    criterion({ riskFactors: [] }),
  ]));
  assert.equal(missingRisks.state, "invalid");

  const unique = validateTddMissionStrategyContractV1(strategyContract([
    criterion(),
    second,
  ]));
  assert.equal(unique.state, "valid");
});

test("one criterion per packet preserves the exact traceability spine and disposition", () => {
  const result = validateTddMissionStrategyContractV1(strategyContract());
  assert.equal(result.state, "valid");
  assert.equal(result.contract.criteria[0].disposition, "implemented_and_proven");
  assert.deepEqual(result.contract.criteria[0].traceability, {
    planRequirementId: "requirement:ac-162-1",
    mackCheckpointId: "checkpoint:ac-162-1:red",
    mayPacketId: "packet:ac-162-1",
    revisionId: "revision:ac-162-1",
    validationEvidenceId: "validation:ac-162-1",
    furyReviewId: "review:fury:ac-162-1",
    humanReviewId: "review:human:ac-162-1",
  });
  assert.deepEqual(result.contract.packets[0].criterionIds, ["AC-162-1"]);
});

test("packet contracts close every required operational boundary", () => {
  const result = validateTddMissionStrategyContractV1(strategyContract());
  assert.equal(result.state, "valid");
  assert.deepEqual(result.contract.packets[0], {
    packetId: "packet:ac-162-1",
    criterionIds: ["AC-162-1"],
    couplingRationale: null,
    minimalPaths: PACKET_PATHS,
    requiredInterfaces: ["interface:tdd-mission-v1"],
    allowedEffects: ["effect:behavioral-implementation", "effect:verification"],
    focusedValidation: [{
      checkpointId: "checkpoint:packet:ac-162-1:focused",
      commandId: "validation:issue-162:focused-node-test",
      command: "node --test tests/tdd-mission-v1.test.mjs",
      executableKind: "test",
    }],
    expectedOutput: "The packet criterion is proven with exact evidence.",
    stopConditions: ["The reviewed contract or authorized scope changes."],
    successor: "exact_head_mack_validation",
  });

  for (const field of [
    "requiredInterfaces",
    "allowedEffects",
    "focusedValidation",
    "expectedOutput",
    "stopConditions",
    "successor",
  ]) {
    const incompletePacket = packet("packet:ac-162-1", ["AC-162-1"]);
    delete incompletePacket[field];
    const incomplete = validateTddMissionStrategyContractV1(strategyContract(
      [criterion()],
      [incompletePacket],
    ));
    assert.equal(incomplete.state, "invalid");
    assert.deepEqual(incomplete.reasonCodes, ["MALFORMED_INPUT"]);
  }
});

test("two or three tightly coupled criteria require a rationale", () => {
  for (const count of [2, 3]) {
    const criteria = Array.from({ length: count }, (_, index) => criterion({
      criterionId: `AC-162-${index + 1}`,
      traceability: { mayPacketId: "packet:coupled" },
    }));
    const missing = validateTddMissionStrategyContractV1(strategyContract(
      criteria,
      [packet("packet:coupled", criteria.map((item) => item.criterionId))],
    ));
    assert.equal(missing.state, "invalid");
    assert.deepEqual(missing.reasonCodes, ["PACKET_COUPLING_RATIONALE_MISSING"]);

    const valid = validateTddMissionStrategyContractV1(strategyContract(
      criteria,
      [packet(
        "packet:coupled",
        criteria.map((item) => item.criterionId),
        "These criteria share one indivisible acceptance boundary.",
      )],
    ));
    assert.equal(valid.state, "valid");
  }
});

test("missing and duplicate criterion ownership block", () => {
  const criteria = [criterion(), criterion({ criterionId: "AC-162-2" })];
  const missing = validateTddMissionStrategyContractV1(strategyContract(
    criteria,
    [packet("packet:ac-162-1", ["AC-162-1"])],
  ));
  assert.equal(missing.state, "invalid");
  assert.deepEqual(missing.reasonCodes, ["PACKET_CRITERION_MISSING"]);

  const duplicate = validateTddMissionStrategyContractV1(strategyContract(
    criteria,
    [
      packet("packet:ac-162-1", ["AC-162-1"]),
      packet("packet:duplicate", ["AC-162-1"]),
      packet("packet:ac-162-2", ["AC-162-2"]),
    ],
  ));
  assert.equal(duplicate.state, "invalid");
  assert.deepEqual(duplicate.reasonCodes, ["PACKET_CRITERION_DUPLICATED"]);
});

test("four or more criteria return only the packet-size exception result", () => {
  const criteria = Array.from({ length: 4 }, (_, index) => criterion({
    criterionId: `AC-162-${index + 1}`,
    traceability: { mayPacketId: "packet:oversized" },
  }));
  const result = validateTddMissionStrategyContractV1(strategyContract(
    criteria,
    [packet("packet:oversized", criteria.map((item) => item.criterionId))],
  ));
  assert.equal(result.state, "packet_size_exception_required");
  assert.deepEqual(result.reasonCodes, ["PACKET_SIZE_LIMIT_EXCEEDED"]);
  assert.deepEqual(result.packetIds, ["packet:oversized"]);
});

test("missing dispositions and mismatched traceability block", () => {
  const { disposition: _disposition, ...withoutDisposition } = criterion();
  const missing = validateTddMissionStrategyContractV1(strategyContract([withoutDisposition]));
  assert.equal(missing.state, "invalid");
  assert.deepEqual(missing.reasonCodes, ["CRITERION_DISPOSITION_MISSING"]);

  const mismatched = criterion({
    traceability: { mackCheckpointId: "checkpoint:somewhere-else" },
  });
  const result = validateTddMissionStrategyContractV1(strategyContract([mismatched]));
  assert.equal(result.state, "invalid");
  assert.deepEqual(result.reasonCodes, ["TRACEABILITY_BINDING_MISMATCH"]);
});

test("failure classifications are closed and a Mack scaffold is never PASS or authority", () => {
  assert.deepEqual(TDD_MISSION_FAILURE_CLASSIFICATIONS, [
    "missing_behavior",
    "product_defect",
    "stale_expectation",
    "environment_failure",
    "harness_defect",
    "authority_failure",
    "insufficient_evidence",
  ]);

  const prepared = validateTddMissionStrategyContractV1(strategyContract());
  assert.equal(prepared.state, "valid");
  assert.equal(
    prepared.contract.criteria[0].preImplementationStateEvidence.state,
    "contract_prepared",
  );
  assert.equal(prepared.contract.criteria[0].preImplementationStateEvidence.ownerSeatId, "mack");
  assert.equal(prepared.contract.criteria[0].preImplementationStateEvidence.outcome, "not_run");
  assert.equal(
    prepared.contract.criteria[0].preImplementationStateEvidence.implementationAuthority,
    false,
  );

  const claimedPass = validateTddMissionStrategyContractV1(strategyContract([
    criterion({ preImplementationStateEvidence: preparedState("AC-162-1", { outcome: "passed" }) }),
  ]));
  assert.equal(claimedPass.state, "invalid");
  assert.deepEqual(claimedPass.reasonCodes, ["SCAFFOLD_TREATED_AS_PASS"]);

  for (const preImplementationStateEvidence of [
    preparedState("AC-162-1", { ownerSeatId: "may" }),
    preparedState("AC-162-1", { implementationAuthority: true }),
  ]) {
    const invalidScaffold = validateTddMissionStrategyContractV1(strategyContract([
      criterion({ preImplementationStateEvidence }),
    ]));
    assert.equal(invalidScaffold.state, "invalid");
    assert.deepEqual(invalidScaffold.reasonCodes, ["RED_NOT_ESTABLISHED"]);
  }
});

test("Red establishes only from executable exact-run failure evidence reviewed by Fury", () => {
  const result = validateTddMissionStrategyContractV1(strategyContract([
    criterion({ preImplementationStateEvidence: redState() }),
  ]));
  assert.equal(result.state, "valid");
  assert.equal(result.contract.criteria[0].preImplementationStateEvidence.state, "red_established");
  assert.equal(result.contract.criteria[0].preImplementationStateEvidence.outcome, "failed");
  assert.equal(
    result.contract.criteria[0].preImplementationStateEvidence.failureEvidence
      .observedFailureClassification,
    "missing_behavior",
  );
  assert.equal(
    result.contract.criteria[0].preImplementationStateEvidence.furyContractDisposition.disposition,
    "approved",
  );
});

test("wrong-reason and missing executable failure evidence block Red", () => {
  const wrongReasonEvidence = redState().failureEvidence;
  const wrongReason = validateTddMissionStrategyContractV1(strategyContract([
    criterion({
      preImplementationStateEvidence: redState("AC-162-1", {
        failureEvidence: {
          ...wrongReasonEvidence,
          observedFailureClassification: "environment_failure",
        },
      }),
    }),
  ]));
  assert.equal(wrongReason.state, "invalid");
  assert.deepEqual(wrongReason.reasonCodes, ["WRONG_FAILURE_REASON"]);

  for (const failureEvidence of [null, { ...redState().failureEvidence, exitCode: 0 }]) {
    const missing = validateTddMissionStrategyContractV1(strategyContract([
      criterion({ preImplementationStateEvidence: redState("AC-162-1", { failureEvidence }) }),
    ]));
    assert.equal(missing.state, "invalid");
    assert.deepEqual(missing.reasonCodes, ["FAILURE_EVIDENCE_MISSING"]);
  }

  const inexactRevision = validateTddMissionStrategyContractV1(strategyContract([
    criterion({
      preImplementationStateEvidence: redState("AC-162-1", {
        revisionId: "revision:not-exact",
      }),
    }),
  ]));
  assert.equal(inexactRevision.state, "invalid");
  assert.deepEqual(inexactRevision.reasonCodes, ["RED_NOT_ESTABLISHED"]);
});

test("Red requires Fury disposition of the intended contract", () => {
  for (const furyContractDisposition of [
    null,
    { ...redState().furyContractDisposition, contractId: "contract:different" },
    { ...redState().furyContractDisposition, disposition: "changes_requested" },
  ]) {
    const result = validateTddMissionStrategyContractV1(strategyContract([
      criterion({
        preImplementationStateEvidence: redState("AC-162-1", { furyContractDisposition }),
      }),
    ]));
    assert.equal(result.state, "invalid");
    assert.deepEqual(result.reasonCodes, ["RED_NOT_ESTABLISHED"]);
  }
});

test("changed and removed expectations require complete amendment evidence", () => {
  assert.deepEqual(TDD_MISSION_EXPECTATION_AMENDMENT_KINDS, ["changed", "removed"]);
  for (const amendmentKind of TDD_MISSION_EXPECTATION_AMENDMENT_KINDS) {
    const { contract } = amendedStrategyContract({ amendmentKind });
    const result = validateTddMissionStrategyContractV1(contract);
    assert.equal(result.state, "valid");
    assert.equal(result.contract.criteria[0].expectationAmendment.amendmentKind, amendmentKind);
    assert.equal(
      result.contract.criteria[0].expectationAmendment.freshRerun
        .observedFailureClassification,
      "stale_expectation",
    );
  }
});

test("incomplete amendment evidence blocks changed or removed expectations", () => {
  for (const amendmentKind of ["changed", "removed"]) {
    const { contract } = amendedStrategyContract({ amendmentKind });
    assert.equal(validateTddMissionStrategyContractV1(contract).state, "valid");
    const mutations = [
      (amendment) => { amendment.originalExpectationEvidenceRef = ""; },
      (amendment) => { amendment.failureClassification = "missing_behavior"; },
      (amendment) => { amendment.intentPreservationRationale = "  "; },
      (amendment) => { amendment.furyDisposition = null; },
      (amendment) => { amendment.fitzVerification = null; },
      (amendment) => { amendment.freshRerun = null; },
      (amendment) => {
        amendment.freshRerun.observedFailureClassification = "missing_behavior";
      },
      (amendment) => {
        amendment.freshRerun.oldContractDigest = "sha256:different_old";
      },
      (amendment) => { amendment.freshRerun.revisionId = "revision:not-exact"; },
      (amendment) => { amendment.freshRerun.exitCode = 0; },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(contract);
      mutate(candidate.criteria[0].expectationAmendment);
      const result = validateTddMissionStrategyContractV1(candidate);
      assert.equal(result.state, "invalid", amendmentKind);
      assert.deepEqual(result.reasonCodes, ["EXPECTATION_AMENDMENT_INCOMPLETE"]);
    }
  }
});

test("Fury and Fitz amendment evidence bind criterion, kind, and both digests", () => {
  const { contract } = amendedStrategyContract();
  const complete = contract.criteria[0].expectationAmendment;
  const mismatchedEvidence = [
    { furyDisposition: { ...complete.furyDisposition, criterionId: "AC-162-other" } },
    { furyDisposition: { ...complete.furyDisposition, amendmentKind: "removed" } },
    { furyDisposition: { ...complete.furyDisposition, oldContractDigest: "sha256:different_old" } },
    {
      furyDisposition: {
        ...complete.furyDisposition,
        amendedContractDigest: "sha256:different_amended",
      },
    },
    { fitzVerification: { ...complete.fitzVerification, criterionId: "AC-162-other" } },
    { fitzVerification: { ...complete.fitzVerification, amendmentKind: "removed" } },
    {
      fitzVerification: {
        ...complete.fitzVerification,
        oldContractDigest: "sha256:different_old",
      },
    },
    {
      fitzVerification: {
        ...complete.fitzVerification,
        amendedContractDigest: "sha256:different_amended",
      },
    },
  ];
  for (const override of mismatchedEvidence) {
    const result = validateTddMissionStrategyContractV1({
      ...contract,
      criteria: [{
        ...contract.criteria[0],
        expectationAmendment: { ...complete, ...override },
      }],
    });
    assert.equal(result.state, "invalid");
    assert.deepEqual(result.reasonCodes, ["EXPECTATION_AMENDMENT_INCOMPLETE"]);
  }

  const notContractRelevant = validateTddMissionStrategyContractV1({
    ...contract,
    criteria: [{
      ...contract.criteria[0],
      expectationAmendment: {
        ...complete,
        contractRelevant: false,
        furyDisposition: null,
      },
    }],
  });
  assert.equal(notContractRelevant.state, "valid");
});

test("fresh stale-expectation rerun does not establish Red and invalidates downstream refs", () => {
  const { contract, oldDigest, activeDigest } = amendedStrategyContract();
  const result = validateTddMissionStrategyContractV1(contract);
  assert.equal(result.state, "valid");
  assert.equal(
    result.contract.criteria[0].preImplementationStateEvidence.state,
    "red_established",
  );
  assert.deepEqual(result.amendmentEffects[0], {
    criterionId: "AC-162-1",
    amendmentKind: "changed",
    oldContractGeneration: 0,
    oldContractDigest: oldDigest,
    amendedContractGeneration: 1,
    amendedContractDigest: activeDigest,
    invalidatedEvidenceRefs: {
      implementationAuthorityReceiptRef: "authority:ac-162-1:old",
      greenReceiptRef: "green:ac-162-1:old",
      refactorReceiptRef: "refactor:ac-162-1:old",
      mackValidationReceiptRef: "validation:ac-162-1:old",
      conformanceReceiptRef: "conformance:ac-162-1:old",
    },
    successorState: "contract_prepared",
    requiredBeforeImplementation: [
      "fresh_reviewed_red",
      "fresh_amended_digest_coulson_authority",
    ],
    coulsonAuthorityContractDigest: activeDigest,
  });

  const staleRed = structuredClone(contract);
  staleRed.criteria[0].preImplementationStateEvidence.contractGeneration = 0;
  const staleRedResult = validateTddMissionStrategyContractV1(staleRed);
  assert.equal(staleRedResult.state, "invalid");
  assert.deepEqual(staleRedResult.reasonCodes, ["RED_NOT_ESTABLISHED"]);
});

test("declined TDD amendments return to a freshly justified strategy", () => {
  const { contract, activeDigest } = amendedStrategyContract({
    oldStrategy: "tdd_declined",
    amendmentKind: "changed",
  });
  const result = validateTddMissionStrategyContractV1(contract);
  assert.equal(result.state, "valid");
  assert.equal(result.amendmentEffects[0].successorState, "strategy_recorded");
  assert.deepEqual(result.amendmentEffects[0].requiredBeforeImplementation, [
    "fresh_amended_digest_coulson_authority",
  ]);
  assert.equal(
    result.amendmentEffects[0].coulsonAuthorityContractDigest,
    activeDigest,
  );

  const missingFreshRationale = validateTddMissionStrategyContractV1({
    ...contract,
    criteria: [{
      ...contract.criteria[0],
      expectationAmendment: {
        ...contract.criteria[0].expectationAmendment,
        freshStrategyRationale: " ",
      },
    }],
  });
  assert.equal(missingFreshRationale.state, "invalid");
  assert.deepEqual(missingFreshRationale.reasonCodes, ["EXPECTATION_AMENDMENT_INCOMPLETE"]);
});

test("selected and declined changed and removed amendments form exact contiguous edges", () => {
  for (const oldStrategy of ["tdd_selected", "tdd_declined"]) {
    for (const amendmentKind of ["changed", "removed"]) {
      const { contract } = amendedStrategyContract({ oldStrategy, amendmentKind });
      const result = validateTddMissionStrategyContractV1(contract);
      assert.equal(result.state, "valid", `${oldStrategy} ${amendmentKind}`);
      assert.equal(result.contract.contractGeneration, 1);
      assert.equal(result.contract.criteria[0].expectationAmendment.oldContractGeneration, 0);
      assert.equal(result.contract.criteria[0].expectationAmendment.amendedContractGeneration, 1);
      assert.equal(
        result.contract.criteria[0].acceptanceExpectation.state,
        amendmentKind === "removed" ? "removed" : "active",
      );
    }
  }
});

test("amendment edges reject skips, stale generations, unreviewed snapshots, and collateral drift", () => {
  const { contract } = amendedStrategyContract();
  const cases = [];

  const skipped = structuredClone(contract);
  skipped.contractGeneration = 2;
  skipped.criteria[0].contractGeneration = 2;
  skipped.criteria[0].expectationAmendment.amendedContractGeneration = 2;
  cases.push(skipped);

  const staleEvidence = structuredClone(contract);
  staleEvidence.criteria[0].preImplementationStateEvidence.contractGeneration = 0;
  cases.push(staleEvidence);

  const unreviewedOldSnapshot = structuredClone(contract);
  unreviewedOldSnapshot.criteria[0].expectationAmendment.oldContractSnapshot.criteria[0]
    .rationale = "collateral unreviewed predecessor drift";
  cases.push(unreviewedOldSnapshot);

  const mismatchedActiveSnapshot = structuredClone(contract);
  mismatchedActiveSnapshot.criteria[0].expectationAmendment.amendedContractSnapshot.criteria[0]
    .riskFactors.push("collateral drift");
  cases.push(mismatchedActiveSnapshot);

  const generationOnly = structuredClone(contract);
  generationOnly.criteria[0].expectationAmendment.oldContractSnapshot.criteria[0]
    .acceptanceExpectation = structuredClone(
      generationOnly.criteria[0].expectationAmendment.amendedContractSnapshot.criteria[0]
        .acceptanceExpectation,
    );
  cases.push(generationOnly);

  const missingAmendment = structuredClone(contract);
  missingAmendment.criteria[0].expectationAmendment = null;
  cases.push(missingAmendment);

  for (const candidate of cases) {
    const result = validateTddMissionStrategyContractV1(candidate);
    assert.equal(result.state, "invalid");
  }
});

test("supplied amendment snapshots reject unknown top-level, criterion, and traceability fields", () => {
  for (const amendmentKind of ["changed", "removed"]) {
    const { contract } = amendedStrategyContract({ amendmentKind });
    assert.equal(validateTddMissionStrategyContractV1(contract).state, "valid");
    const mutations = [
      (snapshot) => { snapshot.unknownTopLevel = "not digest material"; },
      (snapshot) => { snapshot.criteria[0].unknownCriterion = "not digest material"; },
      (snapshot) => {
        snapshot.criteria[0].traceability.unknownTraceability = "not digest material";
      },
    ];
    for (const snapshotName of ["oldContractSnapshot", "amendedContractSnapshot"]) {
      for (const mutate of mutations) {
        const candidate = structuredClone(contract);
        mutate(candidate.criteria[0].expectationAmendment[snapshotName]);
        const result = validateTddMissionStrategyContractV1(candidate);
        assert.equal(result.state, "invalid", `${amendmentKind} ${snapshotName}`);
        assert.deepEqual(result.reasonCodes, ["EXPECTATION_AMENDMENT_INCOMPLETE"]);
      }
    }
  }
});

test("selected and declined amendments complete only with fresh generation-one evidence", () => {
  for (const oldStrategy of ["tdd_selected", "tdd_declined"]) {
    for (const amendmentKind of ["changed", "removed"]) {
      const input = amendedFlowMission({ oldStrategy, amendmentKind });
      const result = evaluateTddMissionV1(input);
      assert.equal(result.state, "eligible", `${oldStrategy} ${amendmentKind}`);
      assert.equal(result.input.strategyContract.contractGeneration, 1);
      assert.ok(result.input.evidence.every((item) => item.contractGeneration === 1));
    }
  }
});

test("amended missions reject stale receipts, stale scaffold substitution, and predecessor substitution", () => {
  const input = amendedFlowMission();
  const staleReceipt = structuredClone(input);
  staleReceipt.evidence.at(-1).contractGeneration = 0;
  assert.deepEqual(evaluateTddMissionV1(staleReceipt).reasonCodes, [
    "BINDING_DIGEST_MISMATCH",
  ]);

  const staleScaffold = structuredClone(input);
  staleScaffold.evidence.find((item) => item.stage === "contract_prepared")
    .contractGeneration = 0;
  assert.deepEqual(evaluateTddMissionV1(staleScaffold).reasonCodes, [
    "BINDING_DIGEST_MISMATCH",
  ]);

  const substitutedPredecessor = structuredClone(input);
  substitutedPredecessor.reviewedPredecessorContract.furyReview.evidenceId =
    "review:fury:substituted-predecessor";
  assert.deepEqual(evaluateTddMissionV1(substitutedPredecessor).reasonCodes, [
    "EXPECTATION_AMENDMENT_INCOMPLETE",
  ]);
});

test("predecessor Fury evidence identity is unique across active contract and exact evidence", () => {
  const input = amendedFlowMission();
  const amendment = input.strategyContract.criteria[0].expectationAmendment;
  const collidingIds = [
    amendment.furyDisposition.evidenceId,
    amendment.fitzVerification.evidenceId,
    amendment.freshRerun.evidenceId,
    input.strategyContract.criteria[0].preImplementationStateEvidence.evidenceId,
    input.strategyContract.criteria[0].preImplementationStateEvidence
      .furyContractDisposition.evidenceId,
    input.strategyContract.criteria[0].implementationAuthorityEvidence.evidenceId,
    input.strategyContract.criteria[0].greenEvidence.evidenceId,
    input.strategyContract.criteria[0].greenEvidence.mackValidationBundle.bundleId,
    input.evidence[0].evidenceId,
  ];
  for (const evidenceId of collidingIds) {
    const candidate = structuredClone(input);
    candidate.reviewedPredecessorContract.furyReview.evidenceId = evidenceId;
    candidate.strategyContract.criteria[0].expectationAmendment
      .predecessorFuryReviewEvidenceId = evidenceId;
    const result = evaluateTddMissionV1(candidate);
    assert.equal(result.state, "blocked");
    assert.deepEqual(result.reasonCodes, ["EVIDENCE_SCHEMA_INVALID"]);
  }
});

test("reviewed Red never grants Green without explicit implementation authority", () => {
  const reviewedRed = criterion({ preImplementationStateEvidence: redState() });
  const redOnly = validateTddMissionStrategyContractV1(strategyContract([reviewedRed]));
  assert.equal(redOnly.state, "valid");
  assert.equal(redOnly.contract.criteria[0].implementationAuthorityEvidence, null);
  assert.equal(redOnly.contract.criteria[0].greenEvidence, null);

  const unauthorizedGreen = validateTddMissionStrategyContractV1(strategyContract([{
    ...reviewedRed,
    greenEvidence: greenEvidence(),
  }]));
  assert.equal(unauthorizedGreen.state, "invalid");
  assert.deepEqual(unauthorizedGreen.reasonCodes, ["IMPLEMENTATION_AUTHORITY_MISSING"]);
});

test("selected and declined strategies require authority before May Green", () => {
  const selected = criterion({
    preImplementationStateEvidence: redState(),
    implementationAuthorityEvidence: implementationAuthority(),
    greenEvidence: greenEvidence(),
  });
  const selectedResult = validateTddMissionStrategyContractV1(strategyContract([selected]));
  assert.equal(selectedResult.state, "valid");
  assert.equal(selectedResult.contract.criteria[0].greenEvidence.ownerSeatId, "may");
  assert.equal(
    selectedResult.contract.criteria[0].greenEvidence.mackValidationBundle.ownerSeatId,
    "mack",
  );

  const authorityBeforeRed = validateTddMissionStrategyContractV1(strategyContract([criterion({
    implementationAuthorityEvidence: implementationAuthority(),
  })]));
  assert.equal(authorityBeforeRed.state, "invalid");
  assert.deepEqual(authorityBeforeRed.reasonCodes, ["RED_NOT_ESTABLISHED"]);

  const declined = criterion({
    strategy: "tdd_declined",
    rationale: "The criterion is documentation-only and has no executable pre-implementation seam.",
    preImplementationContract: null,
    preImplementationStateEvidence: null,
    implementationAuthorityEvidence: implementationAuthority(),
    greenEvidence: greenEvidence(),
  });
  const declinedResult = validateTddMissionStrategyContractV1(strategyContract([declined]));
  assert.equal(declinedResult.state, "valid");
});

test("Packet B accepts complete Green-only and Green-plus-Refactor transition proof", () => {
  const greenOnly = criterion({
    preImplementationStateEvidence: redState(),
    implementationAuthorityEvidence: implementationAuthority(),
    greenEvidence: greenEvidence(),
  });
  const greenAndRefactor = { ...greenOnly, refactorEvidence: refactorEvidence() };
  for (const candidate of [greenOnly, greenAndRefactor]) {
    const result = validateTddMissionStrategyContractV1(strategyContract([candidate]));
    assert.equal(result.state, "valid");
  }
});

test("Packet B rejects path, effect, command, and checkpoint substitution", () => {
  const substitutions = [
    { observedPaths: ["packages/shield-team-system/src/outside.mts"] },
    { observedPaths: [PACKET_PATHS[0], PACKET_PATHS[0]] },
    { observedEffects: ["effect:outside"] },
    { observedEffects: ["effect:verification", "effect:verification"] },
    { command: "node --test substituted.test.mjs" },
    { commandId: "validation:substituted" },
    { checkpointId: "checkpoint:substituted" },
  ];
  for (const override of substitutions) {
    const candidate = criterion({
      preImplementationStateEvidence: redState(),
      implementationAuthorityEvidence: implementationAuthority(),
      greenEvidence: greenEvidence("AC-162-1", override),
    });
    const result = validateTddMissionStrategyContractV1(strategyContract([candidate]));
    assert.equal(result.state, "invalid");
  }

  const configuredPacket = packet("packet:ac-162-1", ["AC-162-1"]);
  const mappingCollision = {
    ...configuredPacket,
    focusedValidation: [
      ...configuredPacket.focusedValidation,
      { ...configuredPacket.focusedValidation[0], command: "node --test substituted.test.mjs" },
    ],
  };
  assert.equal(validateTddMissionStrategyContractV1(strategyContract(
    [criterion()],
    [mappingCollision],
  )).state, "invalid");
});

test("Packet B rejects missing or replayed transition authority and Green proof reuse", () => {
  const green = greenEvidence();
  const base = criterion({
    preImplementationStateEvidence: redState(),
    implementationAuthorityEvidence: implementationAuthority(),
    greenEvidence: green,
  });
  const cases = [
    { ...base, implementationAuthorityEvidence: null },
    {
      ...base,
      refactorEvidence: refactorEvidence("AC-162-1", {
        implementationAuthorityEvidence: implementationAuthority("AC-162-1", "refactor", {
          evidenceId: implementationAuthority().evidenceId,
          authorizedPaths: [PACKET_PATHS[0]],
          authorizedEffects: ["effect:behavioral-implementation"],
        }),
      }),
    },
    {
      ...base,
      refactorEvidence: refactorEvidence("AC-162-1", {
        focusedMackEvidenceRef: green.focusedMackEvidenceRef,
        mackValidationBundle: {
          ...mackBundle("AC-162-1", "refactor", REFACTOR_REVISION, REFACTOR_TREE),
          receipts: green.mackValidationBundle.receipts,
        },
      }),
    },
    {
      ...base,
      refactorEvidence: refactorEvidence("AC-162-1", {
        mackValidationBundle: {
          ...mackBundle("AC-162-1", "refactor", REFACTOR_REVISION, REFACTOR_TREE),
          bundleId: green.mackValidationBundle.bundleId,
        },
      }),
    },
    {
      ...base,
      refactorEvidence: refactorEvidence("AC-162-1", {
        packetFuryReview: {
          ...packetFuryReview("AC-162-1", "refactor", REFACTOR_REVISION, REFACTOR_TREE),
          reviewId: green.packetFuryReview.reviewId,
        },
      }),
    },
  ];
  for (const candidate of cases) {
    const result = validateTddMissionStrategyContractV1(strategyContract([candidate]));
    assert.equal(result.state, "invalid");
  }
});

test("Packet B closes Mack bundle and packet Fury review bindings", () => {
  const bundle = mackBundle();
  const review = packetFuryReview();
  const mutations = [
    { unexpected: true },
    { mackValidationBundle: { ...bundle, unexpected: true } },
    { mackValidationBundle: { ...bundle, missionId: "mission:substituted" } },
    { mackValidationBundle: { ...bundle, planDigest: "sha256:substituted" } },
    { mackValidationBundle: { ...bundle, contractGeneration: 1 } },
    { mackValidationBundle: { ...bundle, acceptanceContractDigest: "sha256:substituted" } },
    { mackValidationBundle: { ...bundle, packetId: "packet:substituted" } },
    { mackValidationBundle: { ...bundle, transitionKind: "refactor" } },
    { mackValidationBundle: { ...bundle, transitionEvidenceId: "green:other" } },
    { mackValidationBundle: { ...bundle, resultRevisionId: REFACTOR_REVISION } },
    { mackValidationBundle: { ...bundle, resultTreeDigest: REFACTOR_TREE } },
    { mackValidationBundle: { ...bundle, ownerSeatId: "may" } },
    { mackValidationBundle: { ...bundle, receipts: [] } },
    { mackValidationBundle: { ...bundle, receipts: [...bundle.receipts, bundle.receipts[0]] } },
    {
      mackValidationBundle: {
        ...bundle,
        receipts: [{ ...bundle.receipts[0], commandId: "validation:substituted" }],
      },
    },
    {
      mackValidationBundle: {
        ...bundle,
        receipts: [{ ...bundle.receipts[0], executableKind: "build" }],
      },
    },
    { packetFuryReview: { ...review, unexpected: true } },
    { packetFuryReview: { ...review, reviewerSeatId: "mack" } },
    { packetFuryReview: { ...review, missionId: "mission:substituted" } },
    { packetFuryReview: { ...review, contractGeneration: 1 } },
    { packetFuryReview: { ...review, packetId: "packet:substituted" } },
    { packetFuryReview: { ...review, transitionKind: "refactor" } },
    { packetFuryReview: { ...review, transitionEvidenceId: "green:other" } },
    { packetFuryReview: { ...review, mackBundleId: "bundle:mack:other" } },
    { packetFuryReview: { ...review, resultRevisionId: REFACTOR_REVISION } },
    { packetFuryReview: { ...review, verdict: "REVISE" } },
    { packetFuryReview: { ...review, sourceRefs: [] } },
  ];
  for (const override of mutations) {
    const candidate = criterion({
      preImplementationStateEvidence: redState(),
      implementationAuthorityEvidence: implementationAuthority(),
      greenEvidence: greenEvidence("AC-162-1", override),
    });
    const result = validateTddMissionStrategyContractV1(strategyContract([candidate]));
    assert.equal(result.state, "invalid");
  }
});

test("Green rejects non-May ownership, bundled cleanup, excess scope, and missing Mack proof", () => {
  const reviewedRed = redState();
  const authority = implementationAuthority();
  const cases = [
    [
      criterion({
        preImplementationStateEvidence: reviewedRed,
        implementationAuthorityEvidence: authority,
        greenEvidence: greenEvidence("AC-162-1", { ownerSeatId: "daisy" }),
      }),
      "SEAT_OWNERSHIP_MISMATCH",
    ],
    [
      criterion({
        preImplementationStateEvidence: reviewedRed,
        implementationAuthorityEvidence: { ...authority, authorizedSeatId: "daisy" },
        greenEvidence: greenEvidence(),
      }),
      "SEAT_OWNERSHIP_MISMATCH",
    ],
    [
      criterion({
        preImplementationStateEvidence: reviewedRed,
        implementationAuthorityEvidence: authority,
        greenEvidence: greenEvidence("AC-162-1", { cleanupBundled: true }),
      }),
      "GREEN_NOT_SMALLEST",
    ],
    [
      criterion({
        preImplementationStateEvidence: reviewedRed,
        implementationAuthorityEvidence: {
          ...authority,
          authorizedPaths: [...PACKET_PATHS, "packages/shield-team-system/src/unrelated.mts"],
        },
        greenEvidence: greenEvidence("AC-162-1", {
          observedPaths: [...PACKET_PATHS, "packages/shield-team-system/src/unrelated.mts"],
        }),
      }),
      "PACKET_SCOPE_EXCEEDED",
    ],
    [
      criterion({
        preImplementationStateEvidence: reviewedRed,
        implementationAuthorityEvidence: authority,
        greenEvidence: greenEvidence("AC-162-1", { mackValidationBundle: null }),
      }),
      "MACK_EVIDENCE_MISSING",
    ],
  ];

  for (const [candidate, reasonCode] of cases) {
    const result = validateTddMissionStrategyContractV1(strategyContract([candidate]));
    assert.equal(result.state, "invalid");
    assert.deepEqual(result.reasonCodes, [reasonCode]);
  }
});

test("Refactor is optional, separately authorized, exact, and behavior-preserving", () => {
  const green = greenEvidence();
  const base = criterion({
    preImplementationStateEvidence: redState(),
    implementationAuthorityEvidence: implementationAuthority(),
    greenEvidence: green,
  });
  const withoutRefactor = validateTddMissionStrategyContractV1(strategyContract([base]));
  assert.equal(withoutRefactor.state, "valid");
  assert.equal(withoutRefactor.contract.criteria[0].refactorEvidence, null);

  const withRefactor = validateTddMissionStrategyContractV1(strategyContract([{
    ...base,
    refactorEvidence: refactorEvidence(),
  }]));
  assert.equal(withRefactor.state, "valid");
  assert.equal(withRefactor.contract.criteria[0].refactorEvidence.ownerSeatId, "may");
  assert.notEqual(
    withRefactor.contract.criteria[0].refactorEvidence.resultRevisionId,
    withRefactor.contract.criteria[0].greenEvidence.resultRevisionId,
  );

  const invalidRefactors = [
    refactorEvidence("AC-162-1", { contractDigest: "sha256:changed_contract_digest" }),
    refactorEvidence("AC-162-1", { resultRevisionId: GREEN_REVISION }),
    refactorEvidence("AC-162-1", { behaviorPreserved: false }),
    refactorEvidence("AC-162-1", { failureSemanticsPreserved: false }),
    refactorEvidence("AC-162-1", { authoritySemanticsPreserved: false }),
    refactorEvidence("AC-162-1", { persistenceSemanticsPreserved: false }),
    refactorEvidence("AC-162-1", { riskPreserved: false }),
    refactorEvidence("AC-162-1", {
      implementationAuthorityEvidence: implementationAuthority("AC-162-1", "refactor", {
        evidenceId: implementationAuthority().evidenceId,
        authorizedPaths: [PACKET_PATHS[0]],
      }),
    }),
  ];
  for (const refactor of invalidRefactors) {
    const result = validateTddMissionStrategyContractV1(strategyContract([{
      ...base,
      refactorEvidence: refactor,
    }]));
    assert.equal(result.state, "invalid");
    assert.deepEqual(result.reasonCodes, ["REFACTOR_NOT_BEHAVIOR_PRESERVING"]);
  }
});

test("Refactor cannot precede proven Green and amendment invalidation blocks stale transitions", () => {
  const beforeGreen = validateTddMissionStrategyContractV1(strategyContract([criterion({
    preImplementationStateEvidence: redState(),
    implementationAuthorityEvidence: implementationAuthority(),
    refactorEvidence: refactorEvidence(),
  })]));
  assert.equal(beforeGreen.state, "invalid");
  assert.deepEqual(beforeGreen.reasonCodes, ["GREEN_EVIDENCE_MISSING"]);

  const amended = validateTddMissionStrategyContractV1(strategyContract([criterion({
    expectationAmendment: expectationAmendment(),
    implementationAuthorityEvidence: implementationAuthority("AC-162-1", "green", {
      contractDigest: AMENDED_CONTRACT_DIGEST,
    }),
    greenEvidence: greenEvidence("AC-162-1", { contractDigest: AMENDED_CONTRACT_DIGEST }),
  })]));
  assert.equal(amended.state, "invalid");
  assert.deepEqual(amended.reasonCodes, ["EXPECTATION_AMENDMENT_INCOMPLETE"]);
});

test("validated strategy contracts are immutable copies", () => {
  const input = strategyContract();
  const result = validateTddMissionStrategyContractV1(input);
  assert.equal(result.state, "valid");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.contract));
  assert.ok(Object.isFrozen(result.contract.criteria));
  assert.ok(Object.isFrozen(result.contract.criteria[0]));
  assert.ok(Object.isFrozen(result.contract.criteria[0].riskFactors));
  assert.ok(Object.isFrozen(result.contract.criteria[0].traceability));
  assert.ok(Object.isFrozen(result.contract.criteria[0].preImplementationStateEvidence));
  assert.ok(Object.isFrozen(result.amendmentEffects));
  assert.ok(Object.isFrozen(result.contract.packets));
  assert.ok(Object.isFrozen(result.contract.packets[0]));
  assert.ok(Object.isFrozen(result.contract.packets[0].criterionIds));
  assert.ok(Object.isFrozen(result.contract.packets[0].minimalPaths));
  assert.notEqual(result.contract.criteria, input.criteria);
  assert.notEqual(result.contract.packets, input.packets);
});

test("revoked nested-array proxies fail closed without escaping the evaluator", () => {
  const revokedCriteria = { ...strategyContract(), criteria: revokedArray() };
  const revokedRisks = strategyContract([criterion({ riskFactors: revokedArray() })]);
  const revokedCriterionIds = strategyContract(
    [criterion()],
    [packet("packet:ac-162-1", revokedArray())],
  );
  for (const candidate of [revokedCriteria, revokedRisks, revokedCriterionIds]) {
    let result;
    assert.doesNotThrow(() => {
      result = validateTddMissionStrategyContractV1(candidate);
    });
    assert.equal(result.state, "invalid");
    assert.deepEqual(result.reasonCodes, ["MALFORMED_INPUT"]);
  }

  const missionWithRevokedEvidence = {
    ...fullFlowMission(),
    evidence: revokedArray(),
  };
  let missionResult;
  assert.doesNotThrow(() => {
    missionResult = evaluateTddMissionV1(missionWithRevokedEvidence);
  });
  assert.equal(missionResult.state, "blocked");
  assert.deepEqual(missionResult.reasonCodes, ["MALFORMED_INPUT"]);

  const mission = fullFlowMission();
  const missionWithRevokedSourceRefs = {
    ...mission,
    evidence: mission.evidence.map((item, index) => index === 0
      ? { ...item, sourceRefs: revokedArray() }
      : item),
  };
  assert.doesNotThrow(() => {
    missionResult = evaluateTddMissionV1(missionWithRevokedSourceRefs);
  });
  assert.equal(missionResult.state, "blocked");
  assert.deepEqual(missionResult.reasonCodes, ["EVIDENCE_SCHEMA_INVALID"]);
});

test("terminal decisions and exact evidence stages are closed", () => {
  assert.deepEqual(TDD_MISSION_DECISIONS, [
    "eligible",
    "blocked",
    "packet_size_exception_required",
  ]);
  assert.deepEqual(TDD_MISSION_EVIDENCE_STAGES, [
    "strategy_recorded",
    "contract_prepared",
    "red_established",
    "implementation_authorized",
    "green_proven",
    "refactor_proven",
    "mack_validation_complete",
    "fury_conformance_complete",
    "disposition_recorded",
  ]);
});

test("bounded mission traverses reviewed Red, authorized May Green, optional Refactor, Mack, and Fury", () => {
  for (const includeRefactor of [false, true]) {
    const result = evaluateTddMissionV1(fullFlowMission({ includeRefactor }));
    assert.equal(result.state, "eligible");
    assert.deepEqual(result.reasonCodes, []);
    assert.deepEqual(result.criterionIds, ["AC-162-1"]);
    assert.equal(result.successor, "mission_complete");
    assert.equal(result.stopCondition, null);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.input));
    assert.ok(Object.isFrozen(result.input.evidence));
    assert.ok(Object.isFrozen(result.input.evidence[0].sourceRefs));
  }
});

test("terminal Fury references every realized packet review while cumulative Mack remains separate", () => {
  const input = fullFlowMission({ includeRefactor: true });
  const terminalMack = input.cumulativeMackValidationBundle;
  const focusedReceipt = input.strategyContract.criteria[0].refactorEvidence
    .mackValidationBundle.receipts[0];
  assert.ok(terminalMack.receipts.every((receipt) => receipt.command !== focusedReceipt.command));

  const missingGreenReview = structuredClone(input);
  const terminalFury = missingGreenReview.furyTerminalReceipt;
  terminalFury.transitionReviewRefs = terminalFury.transitionReviewRefs.filter(
    (sourceRef) => sourceRef !== "review:fury:packet:ac-162-1:green",
  );
  const result = evaluateTddMissionV1(missingGreenReview);
  assert.equal(result.state, "blocked");
  assert.deepEqual(result.reasonCodes, ["REVIEW_EVIDENCE_MISSING"]);
});

test("reviewed acceptance-contract digest is anchored and propagated through every receipt", () => {
  const input = fullFlowMission();
  assert.equal(
    input.strategyContract.acceptanceContractDigest,
    tddMissionV1.deriveTddMissionAcceptanceContractDigestV1(input.strategyContract),
  );
  assert.ok(input.evidence.every((item) =>
    item.acceptanceContractDigest === input.reviewedAcceptanceContractDigest));

  const wrongReviewAnchor = evaluateTddMissionV1({
    ...input,
    reviewedAcceptanceContractDigest: "sha256:different_reviewed_contract",
  });
  assert.equal(wrongReviewAnchor.state, "blocked");
  assert.deepEqual(wrongReviewAnchor.reasonCodes, ["BINDING_DIGEST_MISMATCH"]);

  const substitutedReceipt = evaluateTddMissionV1({
    ...input,
    evidence: input.evidence.map((item, index) => index === 0
      ? { ...item, acceptanceContractDigest: "sha256:substituted_contract" }
      : item),
  });
  assert.equal(substitutedReceipt.state, "blocked");
  assert.deepEqual(substitutedReceipt.reasonCodes, ["BINDING_DIGEST_MISMATCH"]);

  const selfConsistentTransition = criterion({
    preImplementationStateEvidence: redState(),
    implementationAuthorityEvidence: implementationAuthority("AC-162-1", "green", {
      contractDigest: "sha256:substituted_contract",
    }),
    greenEvidence: greenEvidence("AC-162-1", {
      contractDigest: "sha256:substituted_contract",
    }),
  });
  const substitutedTransition = validateTddMissionStrategyContractV1(
    strategyContract([selfConsistentTransition]),
  );
  assert.equal(substitutedTransition.state, "invalid");
  assert.deepEqual(substitutedTransition.reasonCodes, ["BINDING_DIGEST_MISMATCH"]);
});

test("Packet C terminal bundle closes repository observations and three command receipts", () => {
  const input = fullFlowMission();
  const bundle = input.cumulativeMackValidationBundle;
  const validation = bundle.receipts[0];
  assert.deepEqual(validation.testCounts, {
    total: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    todo: 0,
  });
  assert.equal(validation.exitCode, 0);
  assert.equal(validation.cacheEvidence, "cache:not_applicable");
  assert.equal(bundle.canonicalRoot, CANONICAL_ROOT);
  assert.equal(bundle.modelId, "model:mack:gpt-5");
  assert.equal(bundle.receipts.length, 3);

  for (const field of [
    "canonicalRoot", "repositoryId", "branch", "headRevisionId", "headTreeDigest",
    "changedPaths", "trackedClean", "modelId",
  ]) {
    const malformed = structuredClone(input);
    delete malformed.cumulativeMackValidationBundle[field];
    const result = evaluateTddMissionV1(malformed);
    assert.equal(result.state, "blocked");
    assert.deepEqual(result.reasonCodes, ["EVIDENCE_SCHEMA_INVALID"]);
  }

  const receiptMutations = [
    (receipts) => { receipts.pop(); },
    (receipts) => { receipts.push({ ...receipts[0], evidenceId: "receipt:extra" }); },
    (receipts) => { receipts[1] = { ...receipts[0] }; },
    (receipts) => { receipts[0].checkpointId = "checkpoint:substituted"; },
    (receipts) => { receipts[0].commandId = "validation:substituted"; },
    (receipts) => { receipts[0].command = "node --test substituted.mjs"; },
    (receipts) => { receipts[0].executableKind = "build"; },
    (receipts) => { receipts[0].unexpected = true; },
  ];
  for (const mutate of receiptMutations) {
    const candidate = structuredClone(input);
    mutate(candidate.cumulativeMackValidationBundle.receipts);
    const result = evaluateTddMissionV1(candidate);
    assert.equal(result.state, "blocked");
    assert.deepEqual(result.reasonCodes, ["EVIDENCE_SCHEMA_INVALID"]);
  }
  for (const target of ["cumulativeMackValidationBundle", "furyTerminalReceipt"]) {
    const candidate = structuredClone(input);
    candidate[target].unexpected = true;
    assert.deepEqual(evaluateTddMissionV1(candidate).reasonCodes, ["EVIDENCE_SCHEMA_INVALID"]);
  }
});

test("Packet C rejects stale terminal points and inexact transition/disposition references", () => {
  const input = fullFlowMission({ includeRefactor: true });
  const mutations = [
    (item) => { item.headRevisionId = GREEN_REVISION; },
    (item) => { item.headTreeDigest = GREEN_TREE; },
    (item) => { item.cumulativeMackValidationBundle.headRevisionId = GREEN_REVISION; },
    (item) => { item.cumulativeMackValidationBundle.headTreeDigest = GREEN_TREE; },
    (item) => { item.furyTerminalReceipt.headRevisionId = GREEN_REVISION; },
    (item) => { item.furyTerminalReceipt.headTreeDigest = GREEN_TREE; },
    (item) => { item.cumulativeMackValidationBundle.transitionBundleRefs.pop(); },
    (item) => { item.cumulativeMackValidationBundle.transitionBundleRefs.push("bundle:extra"); },
    (item) => { item.cumulativeMackValidationBundle.transitionBundleRefs.push(
      item.cumulativeMackValidationBundle.transitionBundleRefs[0],
    ); },
    (item) => { item.cumulativeMackValidationBundle.dispositionRefs = []; },
    (item) => { item.furyTerminalReceipt.transitionReviewRefs.pop(); },
    (item) => { item.furyTerminalReceipt.transitionReviewRefs.push("review:fury:extra"); },
    (item) => { item.furyTerminalReceipt.dispositionRefs = []; },
    (item) => { item.furyTerminalReceipt.mackBundleRef = "bundle:substituted"; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(input);
    mutate(candidate);
    assert.equal(evaluateTddMissionV1(candidate).state, "blocked");
  }
});

test("Packet C enforces truthful PASS receipt semantics", () => {
  const input = fullFlowMission();
  const mutations = [
    (receipt) => { receipt.exitCode = 1; },
    (receipt) => { receipt.testCounts.total = 2; },
    (receipt) => { receipt.testCounts.failed = 1; receipt.testCounts.passed = 0; },
    (receipt) => { receipt.testCounts.cancelled = 1; receipt.testCounts.passed = 0; },
    (receipt) => { receipt.testCounts.total = -1; },
    (receipt) => { receipt.outcome = "failed"; receipt.exitCode = 0; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(input);
    mutate(candidate.cumulativeMackValidationBundle.receipts[0]);
    assert.equal(evaluateTddMissionV1(candidate).state, "blocked");
  }
  const buildWithCounts = structuredClone(input);
  buildWithCounts.cumulativeMackValidationBundle.receipts[1].testCounts = {
    total: 1, passed: 1, failed: 0, skipped: 0, cancelled: 0, todo: 0,
  };
  assert.equal(evaluateTddMissionV1(buildWithCounts).state, "blocked");
});

test("Packet C closes failed executable classifications and source/count rules", () => {
  const input = fullFlowMission();
  const productTest = terminalCommandReceipt("checkpoint:issue-162:terminal:focused", {
    outcome: "failed", exitCode: 1, failureClassification: "product_defect",
    testCounts: { total: 1, passed: 0, failed: 1, skipped: 0, cancelled: 0, todo: 0 },
  });
  const environmentTest = terminalCommandReceipt("checkpoint:issue-162:terminal:focused", {
    outcome: "failed", exitCode: 1, failureClassification: "environment_failure",
    testCounts: null, sourceRefs: ["environment:node"],
  });
  const harnessTest = terminalCommandReceipt("checkpoint:issue-162:terminal:focused", {
    outcome: "failed", exitCode: 1, failureClassification: "harness_defect",
    testCounts: null, sourceRefs: ["harness:test-runner"],
  });
  const productBuild = terminalCommandReceipt("checkpoint:issue-162:terminal:build", {
    outcome: "failed", exitCode: 1, failureClassification: "product_defect",
    sourceRefs: ["diagnostic:tsc"],
  });
  const environmentBuild = terminalCommandReceipt("checkpoint:issue-162:terminal:build", {
    outcome: "failed", exitCode: 1, failureClassification: "environment_failure",
    sourceRefs: ["environment:nx"],
  });
  const harnessBuild = terminalCommandReceipt("checkpoint:issue-162:terminal:build", {
    outcome: "failed", exitCode: 1, failureClassification: "harness_defect",
    sourceRefs: ["harness:nx-runner"],
  });
  for (const [receipt, index] of [
    [productTest, 0], [environmentTest, 0], [harnessTest, 0], [productBuild, 1],
    [environmentBuild, 1], [harnessBuild, 1],
  ]) {
    const candidate = structuredClone(input);
    candidate.cumulativeMackValidationBundle.receipts[index] = receipt;
    const result = evaluateTddMissionV1(candidate);
    assert.equal(result.state, "blocked");
    assert.deepEqual(result.reasonCodes, ["MACK_EVIDENCE_MISSING"]);
  }
  const invalids = [
    [{ ...productTest, exitCode: 0 }, 0],
    [{ ...productTest, failureClassification: "missing_behavior" }, 0],
    [{ ...productTest, testCounts: null }, 0],
    [{ ...productTest, testCounts: { ...productTest.testCounts, total: 2 } }, 0],
    [{ ...productTest, testCounts: { ...productTest.testCounts, failed: -1 } }, 0],
    [{ ...productTest, testCounts: {
      total: 1, passed: 0, failed: 0, skipped: 0, cancelled: 0, todo: 1,
    } }, 0],
    [{ ...environmentTest, testCounts: productTest.testCounts }, 0],
    [{ ...environmentTest, sourceRefs: ["harness:wrong"] }, 0],
    [{ ...harnessTest, sourceRefs: ["environment:wrong"] }, 0],
    [{ ...productBuild, sourceRefs: ["environment:wrong"] }, 1],
    [{ ...productBuild, testCounts: productTest.testCounts }, 1],
    [{ ...environmentBuild, sourceRefs: ["diagnostic:wrong"] }, 1],
    [{ ...harnessBuild, sourceRefs: ["environment:wrong"] }, 1],
  ];
  for (const [receipt, index] of invalids) {
    const candidate = structuredClone(input);
    candidate.cumulativeMackValidationBundle.receipts[index] = receipt;
    const result = evaluateTddMissionV1(candidate);
    assert.equal(result.state, "blocked");
    assert.deepEqual(result.reasonCodes, ["EVIDENCE_SCHEMA_INVALID"]);
  }

  for (const field of ["command", "exitCode", "testCounts", "failureClassification", "cacheEvidence"]) {
    const malformed = structuredClone(input);
    malformed.furyTerminalReceipt[field] = field === "command" ? "node --test x" : 1;
    const result = evaluateTddMissionV1(malformed);
    assert.equal(result.state, "blocked");
    assert.deepEqual(result.reasonCodes, ["EVIDENCE_SCHEMA_INVALID"]);
  }
});

test("Green and Refactor remain traceable to packet revisions before mission HEAD", () => {
  for (const includeRefactor of [false, true]) {
    const input = fullFlowMission({ includeRefactor });
    const result = evaluateTddMissionV1({
      ...input,
      headRevisionId: MISSION_HEAD_REVISION,
      headTreeDigest: MISSION_HEAD_TREE,
    });
    assert.equal(result.state, "eligible");
    assert.equal(
      result.input.strategyContract.criteria[0].traceability.revisionId,
      includeRefactor ? REFACTOR_REVISION : GREEN_REVISION,
    );
    assert.equal(result.input.headRevisionId, MISSION_HEAD_REVISION);
  }
});

test("stale exact-revision evidence blocks mission completion", () => {
  const input = fullFlowMission();
  const result = evaluateTddMissionV1({
    ...input,
    furyTerminalReceipt: { ...input.furyTerminalReceipt, headTreeDigest: GREEN_TREE },
  });
  assert.equal(result.state, "blocked");
  assert.deepEqual(result.reasonCodes, ["STALE_EXACT_REVISION_EVIDENCE"]);
  assert.deepEqual(result.criterionIds, ["AC-162-1"]);
});

test("incomplete deferred and not-applicable dispositions cannot complete", () => {
  for (const disposition of [
    "deferred_with_linked_issue",
    "not_applicable_with_evidence",
  ]) {
    const declined = criterion({
      strategy: "tdd_declined",
      rationale: "This documentation-only criterion has no executable pre-implementation seam.",
      preImplementationContract: null,
      preImplementationStateEvidence: null,
      disposition,
      traceability: { revisionId: GREEN_REVISION },
    });
    const contract = strategyContract([declined]);
    const input = rebindMissionStrategy(
      fullFlowMission({ includeRefactor: false }),
      contract,
      [exactEvidence({
        evidenceId: "evidence:ac-162-1:strategy",
        stage: "strategy_recorded",
        seatId: "hill",
        revisionId: REVISION,
        treeDigest: PLANNING_TREE,
        checkpointId: "requirement:ac-162-1",
        outcome: "recorded",
        sourceRefs: ["requirement:ac-162-1"],
        successor: "disposition_recorded",
      })],
    );
    const result = evaluateTddMissionV1(input);
    assert.equal(result.state, "blocked");
    assert.deepEqual(result.reasonCodes, ["DISPOSITION_EVIDENCE_MISSING"]);
  }
});

test("deferred needs a linked issue and not-applicable needs exact disposition evidence", () => {
  for (const [criterionDisposition, outcome, sourceRefs] of [
    ["deferred_with_linked_issue", "deferred", ["issue:#163"]],
    ["not_applicable_with_evidence", "not_applicable", ["evidence:analysis:ac-162-1"]],
  ]) {
    const declined = criterion({
      strategy: "tdd_declined",
      rationale: "This documentation-only criterion has no executable pre-implementation seam.",
      preImplementationContract: null,
      preImplementationStateEvidence: null,
      disposition: criterionDisposition,
      traceability: { revisionId: GREEN_REVISION },
    });
    const contract = strategyContract([declined]);
    const input = rebindMissionStrategy(
      fullFlowMission({ includeRefactor: false }),
      contract,
      [
        exactEvidence({
          evidenceId: "evidence:ac-162-1:strategy",
          stage: "strategy_recorded",
          seatId: "hill",
          revisionId: REVISION,
          treeDigest: PLANNING_TREE,
          checkpointId: "requirement:ac-162-1",
          outcome: "recorded",
          sourceRefs: ["requirement:ac-162-1"],
          successor: "disposition_recorded",
        }),
        exactEvidence({
          evidenceId: `evidence:ac-162-1:${outcome}`,
          stage: "disposition_recorded",
          seatId: "hill",
          revisionId: MISSION_HEAD_REVISION,
          treeDigest: MISSION_HEAD_TREE,
          checkpointId: `disposition:ac-162-1:${outcome}`,
          outcome,
          sourceRefs,
          successor: "mission_complete",
        }),
      ],
    );
    assert.equal(evaluateTddMissionV1(input).state, "eligible");
  }
});

test("blocked_pending_explicit_decision remains blocked with its named owner", () => {
  const declined = criterion({
    strategy: "tdd_declined",
    rationale: "An explicit product decision is required before implementation.",
    preImplementationContract: null,
    preImplementationStateEvidence: null,
    disposition: "blocked_pending_explicit_decision",
    traceability: { revisionId: GREEN_REVISION },
  });
  const contract = strategyContract([declined]);
  const input = rebindMissionStrategy(
    fullFlowMission({ includeRefactor: false }),
    contract,
    [
      exactEvidence({
        evidenceId: "evidence:ac-162-1:strategy",
        stage: "strategy_recorded",
        seatId: "hill",
        revisionId: REVISION,
        treeDigest: PLANNING_TREE,
        checkpointId: "requirement:ac-162-1",
        outcome: "recorded",
        sourceRefs: ["requirement:ac-162-1"],
        successor: "disposition_recorded",
      }),
      exactEvidence({
        evidenceId: "evidence:ac-162-1:decision-pending",
        stage: "disposition_recorded",
        seatId: "hill",
        revisionId: MISSION_HEAD_REVISION,
        treeDigest: MISSION_HEAD_TREE,
        checkpointId: "decision:ac-162-1:pending",
        outcome: "pending_decision",
        sourceRefs: ["decision-request:ac-162-1"],
        successor: null,
        stopCondition: "await_product_owner_decision",
        decisionOwnerSeatId: "coulson",
      }),
    ],
  );
  const result = evaluateTddMissionV1(input);
  assert.equal(result.state, "blocked");
  assert.deepEqual(result.reasonCodes, ["BLOCKED_PENDING_EXPLICIT_DECISION"]);
  assert.equal(result.stopCondition, "await_product_owner_decision");
  assert.equal(result.decisionOwnerSeatId, "coulson");
});

test("mission evaluator preserves the packet-size exception decision", () => {
  const criteria = Array.from({ length: 4 }, (_, index) => criterion({
    criterionId: `AC-162-${index + 1}`,
    traceability: { mayPacketId: "packet:oversized" },
  }));
  const input = fullFlowMission();
  const result = evaluateTddMissionV1({
    ...input,
    strategyContract: strategyContract(criteria, [
      packet("packet:oversized", criteria.map((item) => item.criterionId)),
    ]),
    evidence: [],
  });
  assert.equal(result.state, "packet_size_exception_required");
  assert.deepEqual(result.reasonCodes, ["PACKET_SIZE_LIMIT_EXCEEDED"]);
  assert.equal(result.stopCondition, "feature_hill_packet_size_exception");
});
