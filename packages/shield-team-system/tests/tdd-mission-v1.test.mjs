import assert from "node:assert/strict";
import test from "node:test";

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
    criterionId,
    amendmentKind,
    oldContractDigest: OLD_CONTRACT_DIGEST,
    amendedContractDigest: AMENDED_CONTRACT_DIGEST,
    originalExpectationEvidenceRef: `expectation:${criterionId.toLowerCase()}:original`,
    failureClassification: "stale_expectation",
    intentPreservationRationale:
      "The expectation changes syntax while preserving the accepted behavior boundary.",
    contractRelevant: true,
    furyDisposition: {
      evidenceId: `review:fury:${criterionId.toLowerCase()}:amendment`,
      reviewerSeatId: "fury",
      criterionId,
      amendmentKind,
      oldContractDigest: OLD_CONTRACT_DIGEST,
      amendedContractDigest: AMENDED_CONTRACT_DIGEST,
      disposition: "approved",
    },
    fitzVerification: {
      evidenceId: `verification:fitz:${criterionId.toLowerCase()}:amendment`,
      verifierSeatId: "fitz",
      criterionId,
      amendmentKind,
      oldContractDigest: OLD_CONTRACT_DIGEST,
      amendedContractDigest: AMENDED_CONTRACT_DIGEST,
      disposition: "verified",
    },
    freshRerun: {
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
    criterionId,
    strategy: "tdd_selected",
    rationale: "The acceptance boundary is deterministic and regression-prone.",
    riskFactors: ["behavioral regression", "incorrect validation sequencing"],
    preImplementationContract: {
      ...executableContract,
      contractId: `contract:${criterionId.toLowerCase()}`,
      checkpointId: `checkpoint:${criterionId.toLowerCase()}:red`,
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
    focusedValidation: ["node --test tests/tdd-mission-v1.test.mjs"],
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
    evidenceId: `authority:${criterionId.toLowerCase()}:${transition}`,
    authorityKind: "implementation",
    grantorSeatId: "coulson",
    authorizedSeatId: "may",
    criterionId,
    packetId: `packet:${criterionId.toLowerCase()}`,
    contractDigest: CONTRACT_DIGEST,
    transition,
    authorizedPaths: PACKET_PATHS,
    ...overrides,
  };
}

function mackEvidence(
  criterionId = "AC-162-1",
  revisionId = GREEN_REVISION,
  overrides = {},
) {
  return {
    evidenceId: `validation:mack:${criterionId.toLowerCase()}:${revisionId.slice(0, 7)}`,
    ownerSeatId: "mack",
    criterionId,
    packetId: `packet:${criterionId.toLowerCase()}`,
    contractDigest: CONTRACT_DIGEST,
    revisionId,
    command: `node --test checkpoint:${criterionId.toLowerCase()}:focused`,
    outcome: "passed",
    exitCode: 0,
    focus: "packet",
    ...overrides,
  };
}

function greenEvidence(criterionId = "AC-162-1", overrides = {}) {
  const base = {
    state: "green_proven",
    evidenceId: `green:${criterionId.toLowerCase()}`,
    ownerSeatId: "may",
    criterionId,
    packetId: `packet:${criterionId.toLowerCase()}`,
    contractDigest: CONTRACT_DIGEST,
    revisionId: GREEN_REVISION,
    changedPaths: PACKET_PATHS,
    implementationKind: "smallest_correct_green",
    cleanupBundled: false,
    mackEvidence: mackEvidence(criterionId),
  };
  return {
    ...base,
    ...overrides,
    mackEvidence: overrides.mackEvidence === undefined ? base.mackEvidence : overrides.mackEvidence,
  };
}

function refactorEvidence(criterionId = "AC-162-1", overrides = {}) {
  const base = {
    state: "refactor_proven",
    evidenceId: `refactor:${criterionId.toLowerCase()}`,
    ownerSeatId: "may",
    criterionId,
    packetId: `packet:${criterionId.toLowerCase()}`,
    contractDigest: CONTRACT_DIGEST,
    greenRevisionId: GREEN_REVISION,
    revisionId: REFACTOR_REVISION,
    changedPaths: [PACKET_PATHS[0]],
    implementationKind: "behavior_preserving_refactor",
    behaviorPreserved: true,
    failureSemanticsPreserved: true,
    authoritySemanticsPreserved: true,
    persistenceSemanticsPreserved: true,
    riskPreserved: true,
    implementationAuthorityEvidence: implementationAuthority(
      criterionId,
      "refactor",
      { authorizedPaths: [PACKET_PATHS[0]] },
    ),
    mackEvidence: mackEvidence(criterionId, REFACTOR_REVISION),
  };
  return {
    ...base,
    ...overrides,
    implementationAuthorityEvidence: overrides.implementationAuthorityEvidence === undefined
      ? base.implementationAuthorityEvidence
      : overrides.implementationAuthorityEvidence,
    mackEvidence: overrides.mackEvidence === undefined ? base.mackEvidence : overrides.mackEvidence,
  };
}

function strategyContract(
  criteria = [criterion()],
  packets = criteria.map((item) => packet(item.traceability.mayPacketId, [item.criterionId])),
) {
  const amendedDigest = criteria.find((item) => item.expectationAmendment !== null)
    ?.expectationAmendment?.amendedContractDigest;
  return {
    schemaVersion: 1,
    contractVersion: "tdd.mission.v1",
    acceptanceContractDigest: amendedDigest ?? CONTRACT_DIGEST,
    criteria,
    packets,
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
      validationEvidenceId: "validation:ac-162-1",
      furyReviewId: "review:fury:ac-162-1",
      humanReviewId: "review:human:ac-162-1",
    },
  });
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
    exactEvidence({
      evidenceId: "validation:ac-162-1",
      stage: "mack_validation_complete",
      seatId: "mack",
      revisionId: finalRevision,
      treeDigest: finalTree,
      command: "node --test checkpoint:ac-162-1:focused",
      checkpointId: "checkpoint:ac-162-1:red",
      outcome: "passed",
      sourceRefs: [includeRefactor ? "refactor:ac-162-1" : "green:ac-162-1"],
      successor: "fury_conformance_complete",
    }),
    exactEvidence({
      evidenceId: "review:fury:ac-162-1",
      stage: "fury_conformance_complete",
      seatId: "fury",
      revisionId: finalRevision,
      treeDigest: finalTree,
      checkpointId: "review:fury:ac-162-1",
      outcome: "passed",
      sourceRefs: ["validation:ac-162-1", "review:human:ac-162-1"],
      successor: "mission_complete",
    }),
  ];
  return {
    schemaVersion: 1,
    contractVersion: "tdd.mission.v1",
    missionId: "mission:issue-162:p6",
    planDigest: "sha256:issue_162_tdd_intent_plan",
    reviewedAcceptanceContractDigest: CONTRACT_DIGEST,
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/issue-162-tdd-intent",
    planningRevisionId: REVISION,
    planningTreeDigest: PLANNING_TREE,
    headRevisionId: finalRevision,
    headTreeDigest: finalTree,
    strategyContract: strategyContract([implemented]),
    evidence: records,
  };
}

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
    focusedValidation: ["node --test tests/tdd-mission-v1.test.mjs"],
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
    const result = validateTddMissionStrategyContractV1(strategyContract([
      criterion({ expectationAmendment: expectationAmendment("AC-162-1", amendmentKind) }),
    ]));
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
  const complete = expectationAmendment();
  const incompleteAmendments = [
    { ...complete, originalExpectationEvidenceRef: "" },
    { ...complete, failureClassification: "missing_behavior" },
    { ...complete, intentPreservationRationale: "  " },
    { ...complete, furyDisposition: null },
    { ...complete, fitzVerification: null },
    { ...complete, freshRerun: null },
    {
      ...complete,
      freshRerun: {
        ...complete.freshRerun,
        observedFailureClassification: "missing_behavior",
      },
    },
    {
      ...complete,
      freshRerun: {
        ...complete.freshRerun,
        oldContractDigest: "sha256:different_old",
      },
    },
    {
      ...complete,
      freshRerun: { ...complete.freshRerun, revisionId: "revision:not-exact" },
    },
    {
      ...complete,
      freshRerun: { ...complete.freshRerun, exitCode: 0 },
    },
  ];
  for (const amendment of incompleteAmendments) {
    const result = validateTddMissionStrategyContractV1(strategyContract([
      criterion({ expectationAmendment: amendment }),
    ]));
    assert.equal(result.state, "invalid");
    assert.deepEqual(result.reasonCodes, ["EXPECTATION_AMENDMENT_INCOMPLETE"]);
  }
});

test("Fury and Fitz amendment evidence bind criterion, kind, and both digests", () => {
  const complete = expectationAmendment();
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
    const result = validateTddMissionStrategyContractV1(strategyContract([
      criterion({ expectationAmendment: expectationAmendment("AC-162-1", "changed", override) }),
    ]));
    assert.equal(result.state, "invalid");
    assert.deepEqual(result.reasonCodes, ["EXPECTATION_AMENDMENT_INCOMPLETE"]);
  }

  const notContractRelevant = validateTddMissionStrategyContractV1(strategyContract([
    criterion({
      expectationAmendment: expectationAmendment("AC-162-1", "changed", {
        contractRelevant: false,
        furyDisposition: null,
      }),
    }),
  ]));
  assert.equal(notContractRelevant.state, "valid");
});

test("fresh stale-expectation rerun does not establish Red and invalidates downstream refs", () => {
  const result = validateTddMissionStrategyContractV1(strategyContract([
    criterion({ expectationAmendment: expectationAmendment() }),
  ]));
  assert.equal(result.state, "valid");
  assert.equal(
    result.contract.criteria[0].preImplementationStateEvidence.state,
    "contract_prepared",
  );
  assert.deepEqual(result.amendmentEffects[0], {
    criterionId: "AC-162-1",
    amendmentKind: "changed",
    oldContractDigest: OLD_CONTRACT_DIGEST,
    amendedContractDigest: AMENDED_CONTRACT_DIGEST,
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
    coulsonAuthorityContractDigest: AMENDED_CONTRACT_DIGEST,
  });

  const staleRed = validateTddMissionStrategyContractV1(strategyContract([
    criterion({
      preImplementationStateEvidence: redState(),
      expectationAmendment: expectationAmendment(),
    }),
  ]));
  assert.equal(staleRed.state, "invalid");
  assert.deepEqual(staleRed.reasonCodes, ["EXPECTATION_AMENDMENT_INCOMPLETE"]);
});

test("declined TDD amendments return to a freshly justified strategy", () => {
  const declined = criterion({
    strategy: "tdd_declined",
    rationale: "The criterion remains unsuitable for a pre-implementation executable test.",
    preImplementationContract: null,
    preImplementationStateEvidence: null,
    expectationAmendment: expectationAmendment("AC-162-1", "removed", {
      freshStrategyRationale:
        "The amended behavior remains documentation-only and still has no executable seam.",
    }),
  });
  const result = validateTddMissionStrategyContractV1(strategyContract([declined]));
  assert.equal(result.state, "valid");
  assert.equal(result.amendmentEffects[0].successorState, "strategy_recorded");
  assert.deepEqual(result.amendmentEffects[0].requiredBeforeImplementation, [
    "fresh_amended_digest_coulson_authority",
  ]);
  assert.equal(
    result.amendmentEffects[0].coulsonAuthorityContractDigest,
    AMENDED_CONTRACT_DIGEST,
  );

  const missingFreshRationale = validateTddMissionStrategyContractV1(strategyContract([{
    ...declined,
    expectationAmendment: {
      ...declined.expectationAmendment,
      freshStrategyRationale: " ",
    },
  }]));
  assert.equal(missingFreshRationale.state, "invalid");
  assert.deepEqual(missingFreshRationale.reasonCodes, ["EXPECTATION_AMENDMENT_INCOMPLETE"]);
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
  assert.equal(selectedResult.contract.criteria[0].greenEvidence.mackEvidence.focus, "packet");

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
          changedPaths: [...PACKET_PATHS, "packages/shield-team-system/src/unrelated.mts"],
        }),
      }),
      "PACKET_SCOPE_EXCEEDED",
    ],
    [
      criterion({
        preImplementationStateEvidence: reviewedRed,
        implementationAuthorityEvidence: authority,
        greenEvidence: greenEvidence("AC-162-1", { mackEvidence: null }),
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
    withRefactor.contract.criteria[0].refactorEvidence.revisionId,
    withRefactor.contract.criteria[0].greenEvidence.revisionId,
  );

  const invalidRefactors = [
    refactorEvidence("AC-162-1", { contractDigest: "sha256:changed_contract_digest" }),
    refactorEvidence("AC-162-1", { revisionId: GREEN_REVISION }),
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

test("reviewed acceptance-contract digest is anchored and propagated through every receipt", () => {
  const input = fullFlowMission();
  assert.equal(input.strategyContract.acceptanceContractDigest, CONTRACT_DIGEST);
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
      mackEvidence: mackEvidence("AC-162-1", GREEN_REVISION, {
        contractDigest: "sha256:substituted_contract",
      }),
    }),
  });
  const substitutedTransition = validateTddMissionStrategyContractV1(
    strategyContract([selfConsistentTransition]),
  );
  assert.equal(substitutedTransition.state, "invalid");
  assert.deepEqual(substitutedTransition.reasonCodes, ["BINDING_DIGEST_MISMATCH"]);
});

test("exact evidence requires execution metadata and retains truthful test/cache records", () => {
  const input = fullFlowMission();
  const validation = input.evidence.find((item) => item.stage === "mack_validation_complete");
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
  assert.equal(validation.cwd, "/workspace/shield-workspace/packages/shield-team-system");
  assert.equal(validation.modelId, "model:mack:gpt-5");

  for (const field of [
    "cwd",
    "startRevisionId",
    "startTreeDigest",
    "endRevisionId",
    "endTreeDigest",
    "exitCode",
    "testCounts",
    "cacheEvidence",
    "modelId",
  ]) {
    const malformedValidation = { ...validation };
    delete malformedValidation[field];
    const malformed = evaluateTddMissionV1({
      ...input,
      evidence: input.evidence.map((item) =>
        item.stage === "mack_validation_complete" ? malformedValidation : item),
    });
    assert.equal(malformed.state, "blocked");
    assert.deepEqual(malformed.reasonCodes, ["EVIDENCE_SCHEMA_INVALID"]);
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
  const evidence = input.evidence.map((item) => item.stage === "fury_conformance_complete"
    ? {
        ...item,
        endRevisionId: GREEN_REVISION,
        endTreeDigest: GREEN_TREE,
        revisionId: GREEN_REVISION,
        treeDigest: GREEN_TREE,
      }
    : item);
  const result = evaluateTddMissionV1({ ...input, evidence });
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
    const input = {
      ...fullFlowMission({ includeRefactor: false }),
      strategyContract: strategyContract([declined]),
      evidence: [exactEvidence({
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
    };
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
    const input = {
      ...fullFlowMission({ includeRefactor: false }),
      strategyContract: strategyContract([declined]),
      evidence: [
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
          revisionId: GREEN_REVISION,
          treeDigest: GREEN_TREE,
          checkpointId: `disposition:ac-162-1:${outcome}`,
          outcome,
          sourceRefs,
          successor: "mission_complete",
        }),
      ],
    };
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
  const input = {
    ...fullFlowMission({ includeRefactor: false }),
    strategyContract: strategyContract([declined]),
    evidence: [
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
        revisionId: GREEN_REVISION,
        treeDigest: GREEN_TREE,
        checkpointId: "decision:ac-162-1:pending",
        outcome: "pending_decision",
        sourceRefs: ["decision-request:ac-162-1"],
        successor: null,
        stopCondition: "await_product_owner_decision",
        decisionOwnerSeatId: "coulson",
      }),
    ],
  };
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
