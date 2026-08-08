import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { initializeFlightState } from "../scripts/operations/flight-state-init.mjs";
import { computeFlightStatus } from "../scripts/operations/hill-kernel.mjs";
import { stableJson } from "../scripts/operations/common.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shield-flight-control-"));
  const plan = {
    schemaVersion: 1,
    flightId: "flight:test-control",
    repository: { root, baseRevision: "a".repeat(40), collisions: [] },
    integration: { branch: "main" },
    missions: [
      { id: "mission:a", title: "A", lane: "alpha", branch: "spike/a", worktree: join(root, "a"), activationWave: 1, dependsOn: [], writablePaths: ["a/**"], deliverables: ["A"] },
      { id: "mission:b", title: "B", lane: "bravo", branch: "spike/b", worktree: join(root, "b"), activationWave: 1, dependsOn: ["mission:a"], writablePaths: ["b/**"], deliverables: ["B"] },
      { id: "mission:c", title: "C", lane: "alpha", branch: "spike/c", worktree: join(root, "c"), activationWave: 2, dependsOn: [], writablePaths: ["c/**"], deliverables: ["C"] },
    ],
  };
  const planPath = join(root, "plan.json");
  await writeFile(planPath, stableJson(plan));
  return { root, plan, planPath };
}

test("state initializer creates one create-only non-authoritative observation", async () => {
  const f = await fixture();
  const output = join(f.root, "state.json");
  const state = await initializeFlightState({ planPath: f.planPath, output });
  assert.equal(state.authority, "none");
  assert.equal(state.missions["mission:a"].status, "planned");
  await assert.rejects(() => initializeFlightState({ planPath: f.planPath, output }), /Refusing to overwrite/u);
});

test("Hill routing exposes only dependency, lane, and wave legal actions", async () => {
  const f = await fixture();
  const statePath = join(f.root, "state.json");
  await writeFile(statePath, stableJson({
    schemaVersion: 1,
    flightId: f.plan.flightId,
    missions: {
      "mission:a": { status: "integrated", revision: "a".repeat(40) },
      "mission:b": { status: "authorized", revision: "b".repeat(40) },
      "mission:c": { status: "planned" },
    },
  }));
  const report = await computeFlightStatus({ planPath: f.planPath, statePath });
  assert.equal(report.authority, "none");
  assert.equal(report.missions.find(({ id }) => id === "mission:b").disposition, "eligible-to-activate");
  assert.equal(report.missions.find(({ id }) => id === "mission:c").disposition, "waiting-for-activation-wave:1");
});

test("Hill routing fails closed when one lane claims two active missions", async () => {
  const f = await fixture();
  const statePath = join(f.root, "unsafe-state.json");
  await writeFile(statePath, stableJson({
    schemaVersion: 1,
    flightId: f.plan.flightId,
    missions: {
      "mission:a": { status: "active", revision: "a".repeat(40) },
      "mission:b": { status: "planned" },
      "mission:c": { status: "active", revision: "c".repeat(40) },
    },
  }));
  await assert.rejects(() => computeFlightStatus({ planPath: f.planPath, statePath }), /multiple active missions/u);
});
