import assert from "node:assert/strict";
import test from "node:test";

import {
  TDD_MISSION_EXPECTATION_AMENDMENT_KINDS,
  TDD_MISSION_FAILURE_CLASSIFICATIONS,
  validateTddMissionStrategyContractV1,
} from "../dist/tdd-mission-v1.mjs";

const REVISION = "fb2d9c7ba6c0d312d93a5debc0f105de1805563d";
const OLD_CONTRACT_DIGEST = "sha256:old_contract_digest";
const AMENDED_CONTRACT_DIGEST = "sha256:amended_contract_digest";

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

function packet(packetId, criterionIds, couplingRationale = null) {
  return { packetId, criterionIds, couplingRationale };
}

function strategyContract(
  criteria = [criterion()],
  packets = criteria.map((item) => packet(item.traceability.mayPacketId, [item.criterionId])),
) {
  return {
    schemaVersion: 1,
    contractVersion: "tdd.mission.v1",
    criteria,
    packets,
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
  assert.notEqual(result.contract.criteria, input.criteria);
  assert.notEqual(result.contract.packets, input.packets);
});
