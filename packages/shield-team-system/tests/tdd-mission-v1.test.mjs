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
  return {
    criterionId: "AC-162-1",
    strategy: "tdd_selected",
    rationale: "The acceptance boundary is deterministic and regression-prone.",
    riskFactors: ["behavioral regression", "incorrect validation sequencing"],
    preImplementationContract: executableContract,
    laterValidation: "required",
    ...overrides,
  };
}

function strategyContract(criteria = [criterion()]) {
  return {
    schemaVersion: 1,
    contractVersion: "tdd.mission.v1",
    criteria,
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
  const duplicate = validateTddMissionStrategyContractV1(strategyContract([
    criterion(),
    criterion({ rationale: "A second record cannot reuse the same stable ID." }),
  ]));
  assert.equal(duplicate.state, "invalid");

  const missingRisks = validateTddMissionStrategyContractV1(strategyContract([
    criterion({ riskFactors: [] }),
  ]));
  assert.equal(missingRisks.state, "invalid");
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
  assert.notEqual(result.contract.criteria, input.criteria);
});
