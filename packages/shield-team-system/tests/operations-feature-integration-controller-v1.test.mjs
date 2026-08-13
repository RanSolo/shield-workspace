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
  return { storeScope: {}, challengeId: "challenge:controller", ...overrides };
}
function observation(overrides = {}) {
  return { state: "observed", observation: { repositoryId: "RanSolo/shield-workspace", featureBranch: "feature/226", headRevision: head, treeDigest: tree, challengeId: "challenge:controller", observationProvenance: "github.feature-integration.v1:challenge:controller", observedAt: "2029-01-01T00:00:00Z", ...overrides } };
}
function deps(projection, stageOwners = {}, repositoryObservation = observation()) {
  return { readJournal: async () => ({ state: "accepted", value: { journal: {} } }), replayJournal: () => ({ state: "valid", value: projection }), observeRepository: async () => repositoryObservation, stageOwners };
}

test("controller selects one stage without effects until explicit execution", async () => {
  let calls = 0;
  const ready = await runFeatureIntegrationControllerV1(input(), deps(replay(), { feature_branch_creation: async () => { calls += 1; return { state: "accepted" }; } }));
  assert.equal(ready.state, "ready"); assert.equal(ready.stage, "feature_branch_creation"); assert.equal(calls, 0);
  const executed = await runFeatureIntegrationControllerV1(input({ executeStage: true }), deps(replay(), { feature_branch_creation: async () => { calls += 1; return { state: "accepted" }; }, feature_workspace: async () => { calls += 100; } }));
  assert.equal(executed.state, "accepted"); assert.equal(calls, 1);
});

test("controller fails closed on repository drift and pending or uncertain effects", async () => {
  const drift = await runFeatureIntegrationControllerV1(input(), deps(replay(), {}, observation({ headRevision: "c".repeat(40) })));
  assert.equal(drift.state, "blocked"); assert.equal(drift.reason, "repository_drift");
  const pending = await runFeatureIntegrationControllerV1(input(), deps(replay({ pendingEffect: { effectKey: "effect:one" } })));
  assert.equal(pending.state, "recovery_required"); assert.equal(pending.reason, "effect_prepared");
  const uncertain = await runFeatureIntegrationControllerV1(input(), deps(replay({ pendingEffect: { effectKey: "effect:one" }, uncertainEffect: true })));
  assert.equal(uncertain.reason, "effect_uncertain");
});

test("controller rejects caller-fabricated observations and requires trusted adapter provenance before effects", async () => {
  let effects = 0;
  const fabricated = await runFeatureIntegrationControllerV1(input({ executeStage: true, repositoryObservation: { repositoryId: "RanSolo/shield-workspace", featureBranch: "feature/226", headRevision: head, treeDigest: tree, challengeId: "challenge:controller", observedAt: "2029-01-01T00:00:00Z" } }), deps(replay(), { feature_branch_creation: async () => { effects += 1; return { state: "accepted" }; } }, observation({ observationProvenance: "caller:asserted" })));
  assert.equal(fabricated.state, "blocked");
  assert.equal(fabricated.reason, "repository_observation_untrusted");
  assert.equal(effects, 0);
});

test("controller maps closed lifecycle outcomes and refuses missing stage owners", async () => {
  assert.equal((await runFeatureIntegrationControllerV1(input(), deps(replay({ replayContext: { ...replay().replayContext, lifecycle: { state: "paused" } } })))).state, "paused");
  assert.equal((await runFeatureIntegrationControllerV1(input(), deps(replay({ replayContext: { ...replay().replayContext, lifecycle: { state: "cancelled" } } })))).state, "cancelled");
  const missing = await runFeatureIntegrationControllerV1(input({ executeStage: true }), deps(replay()));
  assert.equal(missing.state, "blocked"); assert.equal(missing.reason, "stage_owner_unavailable");
});

test("controller keeps terminal rollback dispositions closed while routing applied validation and uncertain recovery", async () => {
  const cases = [
    { lifecycle: "cancelled", closedState: "cancelled", observedAt: "2029-01-01T00:00:00Z" },
    { lifecycle: "expired", closedState: "blocked", observedAt: "2029-01-01T01:00:00Z" },
    { lifecycle: "superseded", closedState: "split", observedAt: "2029-01-01T00:00:00Z" },
  ];

  for (const item of cases) {
    const replayContext = { ...replay().replayContext, lifecycle: { state: item.lifecycle } };
    let cumulativeCalls = 0;
    let ordinaryCalls = 0;
    const owners = {
      cumulative_validation: async () => { cumulativeCalls += 1; return { state: "accepted" }; },
      feature_branch_creation: async () => { ordinaryCalls += 1; return { state: "accepted" }; },
    };
    const repositoryObservation = observation({ observedAt: item.observedAt });

    const appliedProjection = replay({ replayContext, nextStage: "cumulative_validation" });
    const ready = await runFeatureIntegrationControllerV1(input(), deps(appliedProjection, owners, repositoryObservation));
    assert.equal(ready.state, "ready", `${item.lifecycle}:applied:ready`);
    assert.equal(ready.stage, "cumulative_validation", `${item.lifecycle}:applied:stage`);
    const executed = await runFeatureIntegrationControllerV1(input({ executeStage: true }), deps(appliedProjection, owners, repositoryObservation));
    assert.equal(executed.state, "accepted", `${item.lifecycle}:applied:executed`);
    assert.equal(cumulativeCalls, 1, `${item.lifecycle}:applied:cumulative-calls`);
    assert.equal(ordinaryCalls, 0, `${item.lifecycle}:applied:ordinary-calls`);

    const notApplied = await runFeatureIntegrationControllerV1(input({ executeStage: true }), deps(replay({ replayContext, nextStage: "lifecycle_only" }), owners, repositoryObservation));
    assert.equal(notApplied.state, item.closedState, `${item.lifecycle}:not-applied`);
    const uncertain = await runFeatureIntegrationControllerV1(input({ executeStage: true }), deps(replay({ replayContext, nextStage: "blocked", pendingEffect: { effectKey: "effect:rollback" }, uncertainEffect: true }), owners, repositoryObservation));
    assert.equal(uncertain.state, "recovery_required", `${item.lifecycle}:uncertain:state`);
    assert.equal(uncertain.reason, "effect_uncertain", `${item.lifecycle}:uncertain:reason`);
    assert.equal(cumulativeCalls, 1, `${item.lifecycle}:uncertain:no-cumulative-call`);
    assert.equal(ordinaryCalls, 0, `${item.lifecycle}:uncertain:no-ordinary-call`);
  }
});
