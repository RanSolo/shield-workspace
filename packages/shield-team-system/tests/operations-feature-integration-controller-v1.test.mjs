import assert from "node:assert/strict";
import test from "node:test";

import { runFeatureIntegrationControllerV1 } from "../scripts/operations/feature-integration-controller-v1.mjs";

const head = "a".repeat(40);
const tree = `sha256:${"b".repeat(64)}`;

function replay(overrides = {}) {
  return {
    nextStage: "feature_branch_creation", pendingEffect: null, uncertainEffect: false, terminalHeadRevision: head, terminalTreeDigest: tree,
    replayContext: { repositoryId: "RanSolo/shield-workspace", lifecycle: { state: "active" }, activePlan: { featureBranch: "feature/226", expiresAt: "2029-01-01T01:00:00Z" } },
    ...overrides,
  };
}
function input(overrides = {}) {
  return { storeScope: {}, challengeId: "challenge:controller", repositoryObservation: { repositoryId: "RanSolo/shield-workspace", featureBranch: "feature/226", headRevision: head, treeDigest: tree, challengeId: "challenge:controller", observedAt: "2029-01-01T00:00:00Z" }, ...overrides };
}
function deps(projection, stageOwners = {}) {
  return { readJournal: async () => ({ state: "accepted", value: { journal: {} } }), replayJournal: () => ({ state: "valid", value: projection }), stageOwners };
}

test("controller selects one stage without effects until explicit execution", async () => {
  let calls = 0;
  const ready = await runFeatureIntegrationControllerV1(input(), deps(replay(), { feature_branch_creation: async () => { calls += 1; return { state: "accepted" }; } }));
  assert.equal(ready.state, "ready"); assert.equal(ready.stage, "feature_branch_creation"); assert.equal(calls, 0);
  const executed = await runFeatureIntegrationControllerV1(input({ executeStage: true }), deps(replay(), { feature_branch_creation: async () => { calls += 1; return { state: "accepted" }; }, feature_workspace: async () => { calls += 100; } }));
  assert.equal(executed.state, "accepted"); assert.equal(calls, 1);
});

test("controller fails closed on repository drift and pending or uncertain effects", async () => {
  const drift = await runFeatureIntegrationControllerV1(input({ repositoryObservation: { ...input().repositoryObservation, headRevision: "c".repeat(40) } }), deps(replay()));
  assert.equal(drift.state, "blocked"); assert.equal(drift.reason, "repository_drift");
  const pending = await runFeatureIntegrationControllerV1(input(), deps(replay({ pendingEffect: { effectKey: "effect:one" } })));
  assert.equal(pending.state, "recovery_required"); assert.equal(pending.reason, "effect_prepared");
  const uncertain = await runFeatureIntegrationControllerV1(input(), deps(replay({ pendingEffect: { effectKey: "effect:one" }, uncertainEffect: true })));
  assert.equal(uncertain.reason, "effect_uncertain");
});

test("controller maps closed lifecycle outcomes and refuses missing stage owners", async () => {
  assert.equal((await runFeatureIntegrationControllerV1(input(), deps(replay({ replayContext: { ...replay().replayContext, lifecycle: { state: "paused" } } })))).state, "paused");
  assert.equal((await runFeatureIntegrationControllerV1(input(), deps(replay({ replayContext: { ...replay().replayContext, lifecycle: { state: "cancelled" } } })))).state, "cancelled");
  const missing = await runFeatureIntegrationControllerV1(input({ executeStage: true }), deps(replay()));
  assert.equal(missing.state, "blocked"); assert.equal(missing.reason, "stage_owner_unavailable");
});
