import assert from "node:assert/strict";
import test from "node:test";

import * as surface from "../feature-flight-adapter.mjs";

const plan = Object.freeze({
  runnerContractVersion: 1,
  cycleId: "cycle:feature-flight:1",
  missionId: "mission:feature-flight:1",
  subjectId: "issue:251",
  revisionId: "a".repeat(40),
  evaluatedThroughSequence: 7,
  seatId: "daisy",
  activatedModes: [],
  actionId: "action:feature-flight.daisy.reconnaissance",
  effectClass: "coordination",
  effectKey: "b".repeat(64),
  validationId: "validation:feature-flight.daisy-result-v1",
  stopCondition: "after_one_cycle",
});

function context() {
  const baselineBytes = Buffer.from("{}", "utf8");
  return Object.freeze({
    fixtureRoot: "/fixture",
    operatorInput: Object.freeze({
      packageArtifactPath: "/package.tgz",
      externalRepositoryRoot: "/external",
      baseRevision: "1".repeat(40),
      headRevision: "2".repeat(40),
      hostConfiguration: Object.freeze({ adapterId: "github", repository: "owner/repo", branch: "feature" }),
      blindStatus: "partially-informed",
      priorSolutionsVisible: false,
      requireSimmons: false,
    }),
    releaseBaselineBytes: baselineBytes,
    launcherHostContext: Object.freeze({
      baselineBytes,
      authoritativeReceiptJournalPath: null,
      attributionContext: null,
      toolingContext: null,
    }),
  });
}

test("adapter exports exactly the injected-launcher factory", () => {
  assert.deepEqual(Object.keys(surface), ["createFeatureFlightAdapterV1"]);
  assert.equal(surface.compose, undefined);
  assert.equal(surface.grade, undefined);
  assert.throws(() => surface.createFeatureFlightAdapterV1({ launchExternalFixture: async () => {}, compose: true }), /not_closed/);
});

test("adapter calls the launcher once and maps ready with exact Runner identity", async () => {
  let calls = 0;
  const adapter = surface.createFeatureFlightAdapterV1({
    launchExternalFixture: async (input) => {
      calls += 1;
      assert.equal(input.fixtureRoot, "/fixture");
      assert.deepEqual(Object.keys(input.operatorInput), [
        "packageArtifactPath", "externalRepositoryRoot", "baseRevision", "headRevision",
        "hostConfiguration", "blindStatus", "priorSolutionsVisible", "requireSimmons",
      ]);
      return { state: "ready" };
    },
  });
  const result = await adapter(plan, Object.freeze({}), context());
  assert.equal(calls, 1);
  assert.equal(result.outcome, "completed");
  for (const field of ["missionId", "subjectId", "revisionId", "evaluatedThroughSequence", "cycleId", "seatId", "actionId", "effectClass", "effectKey"]) {
    assert.equal(result[field], plan[field]);
  }
  assert.ok(result.evidenceRefs.length > 0);
});

test("adapter maps blocked/invalid to failed and throws/structural uncertainty to uncertain", async () => {
  for (const state of ["blocked", "invalid"]) {
    const adapter = surface.createFeatureFlightAdapterV1({ launchExternalFixture: async () => ({ state, reason: "fixture" }) });
    assert.equal((await adapter(plan, {}, context())).outcome, "failed");
  }
  const thrown = surface.createFeatureFlightAdapterV1({ launchExternalFixture: async () => { throw new Error("boom"); } });
  assert.equal((await thrown(plan, {}, context())).outcome, "uncertain");
  const malformed = surface.createFeatureFlightAdapterV1({ launchExternalFixture: async () => ({ state: "unknown" }) });
  assert.equal((await malformed(plan, {}, context())).outcome, "uncertain");
});

test("adapter rejects substituted or open context before launcher invocation", async () => {
  let calls = 0;
  const adapter = surface.createFeatureFlightAdapterV1({ launchExternalFixture: async () => { calls += 1; } });
  await assert.rejects(adapter(plan, {}, { ...context(), authority: "allow" }), /context_not_closed/);
  await assert.rejects(adapter(plan, {}, Object.freeze({ ...context(), operatorInput: { ...context().operatorInput } })), /context_not_closed/);
  await assert.rejects(adapter(plan, {}, context(), "extra"), /arguments_not_closed/);
  assert.equal(calls, 0);
});
