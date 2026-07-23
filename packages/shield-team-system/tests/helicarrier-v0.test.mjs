import test from "node:test";
import assert from "node:assert/strict";
import { HELICARRIER_V0_ID, runHelicarrierV0 } from "../dist/helicarrier-v0.mjs";

const certification = {
  certificationId: "deterministic-mission-compilation-stage-a-certification.v1",
  certificationCommit: "5fce3051d774c3315eeb86445f6d3724e630cf9b",
  experimentId: "deterministic-mission-compilation-v2",
  compilerId: "shield-compiler@0.1.0-experiment",
  validatorId: "shield-dispatch-validator@0.1.0-experiment",
  rendererId: "canonical-chat-v1",
  targetProfileId: "codex-text.v0",
  registryId: "shield-dispatch-registry.v0",
};

function dependencies(overrides = {}) {
  return {
    certification,
    validate: () => ({ state: "ok", value: { value: { validated: true }, identity: {
      compilerId: certification.compilerId,
      validatorId: certification.validatorId,
      rendererId: certification.rendererId,
      targetProfileId: certification.targetProfileId,
      registryId: certification.registryId,
    } } }),
    compile: () => ({ state: "ok", value: {
      promptBytes: Uint8Array.from([1, 2]),
      provenanceBytes: Uint8Array.from([3]),
      manifestBytes: Uint8Array.from([4, 5]),
    } }),
    ...overrides,
  };
}

test("runs the certified compiler only after identity-bound validation", () => {
  let compiled = 0;
  const result = runHelicarrierV0({ dispatchId: "dispatch-1", envelope: {}, trust: {} }, dependencies({ compile: () => {
    compiled += 1;
    return { state: "ok", value: { promptBytes: Uint8Array.from([1]), provenanceBytes: Uint8Array.from([2]), manifestBytes: Uint8Array.from([3]) } };
  } }));
  assert.equal(result.state, "ok");
  assert.equal(compiled, 1);
  assert.equal(result.value.platformId, HELICARRIER_V0_ID);
  assert.equal(result.value.receipt.dispatchId, "dispatch-1");
  assert.equal(result.value.receipt.certificationCommit, certification.certificationCommit);
});

test("fails closed before compilation on validation failure", () => {
  let compiled = 0;
  const result = runHelicarrierV0({ dispatchId: "dispatch-1", envelope: {}, trust: {} }, dependencies({
    validate: () => ({ state: "invalid", reason: "bad_receipt" }),
    compile: () => { compiled += 1; return { state: "invalid", reason: "should_not_run" }; },
  }));
  assert.deepEqual(result, { state: "invalid", reason: "VALIDATION_FAILED" });
  assert.equal(compiled, 0);
});

test("fails closed on nested compiler identity substitution", () => {
  const result = runHelicarrierV0({ dispatchId: "dispatch-1", envelope: {}, trust: {} }, dependencies({
    validate: () => ({ state: "ok", value: { value: {}, identity: { ...dependencies().validate().value.identity, compilerId: "substituted" } } }),
  }));
  assert.deepEqual(result, { state: "invalid", reason: "NESTED_IDENTITY_MISMATCH" });
});

test("fails closed on malformed compiler output", () => {
  const result = runHelicarrierV0({ dispatchId: "dispatch-1", envelope: {}, trust: {} }, dependencies({ compile: () => ({ state: "ok", value: { promptBytes: new Uint8Array(1), provenanceBytes: new Uint8Array(1) } }) }));
  assert.deepEqual(result, { state: "invalid", reason: "OUTPUT_INVALID" });
});

test("rejects a substituted certification identity", () => {
  const result = runHelicarrierV0({ dispatchId: "dispatch-1", envelope: {}, trust: {} }, dependencies({ certification: { ...certification, certificationCommit: "0000000000000000000000000000000000000000" } }));
  assert.deepEqual(result, { state: "invalid", reason: "INVALID_REQUEST" });
});

test("converts hostile validator and compiler callbacks into closed failures", () => {
  const validation = runHelicarrierV0({ dispatchId: "dispatch-1", envelope: {}, trust: {} }, dependencies({ validate: () => { throw new Error("hostile"); } }));
  assert.deepEqual(validation, { state: "invalid", reason: "VALIDATION_FAILED" });
  const compilation = runHelicarrierV0({ dispatchId: "dispatch-1", envelope: {}, trust: {} }, dependencies({ compile: () => { throw new Error("hostile"); } }));
  assert.deepEqual(compilation, { state: "invalid", reason: "COMPILATION_FAILED" });
});
