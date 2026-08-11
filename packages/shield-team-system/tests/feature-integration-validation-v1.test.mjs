import assert from "node:assert/strict";
import test from "node:test";

import { createFeatureIntegrationEntryV1 } from "../dist/feature-integration-v1.mjs";
import { acceptFeatureCumulativeValidationV1, executeFeatureCumulativeValidationCommandsV1, prepareFeatureCumulativeValidationV1 } from "../dist/feature-integration-validation-v1.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

function prepared() {
  return createFeatureIntegrationEntryV1({ operationId: "operation:test", entrySequence: 3, entryKind: "effect_prepared", previousEntryDigest: digest("a"), payload: { effectClass: "cumulative_validation", candidate: {}, candidateDigest: digest("b"), effectKey: "effect:cumulative:one", requestDigest: digest("c") } });
}

test("cumulative command execution preserves exact order, targets, cache status, and terminal failures", () => {
  const calls = [];
  const result = executeFeatureCumulativeValidationCommandsV1({
    preparedEntry: prepared(),
    request: { commandIds: ["build", "test"], targetIds: ["@shield/team-system"] },
    commands: [
      { commandId: "build", executable: "npx", args: ["nx", "build"], targetIds: ["@shield/team-system"] },
      { commandId: "test", executable: "node", args: ["--test"], targetIds: ["@shield/team-system"] },
    ],
    run(executable, args) { calls.push([executable, ...args]); return { exitCode: calls.length === 1 ? 0 : 1, stdout: "out", stderr: "err", cached: calls.length === 1 }; },
  });
  assert.equal(result.state, "accepted"); assert.equal(result.value.outcome, "failed");
  assert.deepEqual(calls, [["npx", "nx", "build"], ["node", "--test"]]);
  assert.deepEqual(result.value.receipts.map((item) => item.cached), [true, false]);
});

test("runner exceptions are uncertainty, not validation failure", () => {
  const result = executeFeatureCumulativeValidationCommandsV1({ preparedEntry: prepared(), request: { commandIds: ["build"], targetIds: ["team"] }, commands: [{ commandId: "build", executable: "npx", args: [], targetIds: ["team"] }], run() { throw new Error("network"); } });
  assert.equal(result.state, "effect_uncertain"); assert.equal(result.reason, "runner_threw");
});

test("preparation and acceptance reject caller assertions without signed exact authority and Mack evidence", () => {
  assert.equal(prepareFeatureCumulativeValidationV1({ replay: { nextStage: "cumulative_validation", pendingEffect: null }, signedAuthority: {}, request: {}, candidate: {}, trustedBindings: [], observedAt: "2029-01-01T00:00:00Z", previousEntryDigest: digest("d") }).state, "blocked");
  assert.equal(acceptFeatureCumulativeValidationV1({ replay: {}, preparedEntry: prepared(), signedAuthority: {}, request: {}, execution: {}, mackEvidence: {}, identity: {}, observedAt: {}, observationProvenance: "" }).state, "blocked");
});
