import assert from "node:assert/strict";
import test from "node:test";

import {
  validateTddMissionStrategyContractV1,
} from "../dist/tdd-mission-v1.mjs";

const executableContract = {
  contractId: "contract:ac-162-1",
  kind: "executable",
  checkpointId: "checkpoint:ac-162-1:red",
  expectedBehavior: "The criterion strategy is accepted before implementation.",
};

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
  assert.ok(Object.isFrozen(result.contract.packets));
  assert.ok(Object.isFrozen(result.contract.packets[0]));
  assert.ok(Object.isFrozen(result.contract.packets[0].criterionIds));
  assert.notEqual(result.contract.criteria, input.criteria);
  assert.notEqual(result.contract.packets, input.packets);
});
