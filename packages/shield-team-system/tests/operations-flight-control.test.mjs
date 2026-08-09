import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256, snapshotFile, stableJson } from "../scripts/operations/common.mjs";
import { PLAN_NOTICE } from "../scripts/operations/flight-common.mjs";
import { prepareFlight } from "../scripts/operations/flight-prep.mjs";
import { initializeFlightState } from "../scripts/operations/flight-state-init.mjs";
import { computeFlightStatus } from "../scripts/operations/hill-kernel.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "scripts", "operations", "ops-cli.mjs");
const revision = (character) => character.repeat(40);

const mission = ({ root, id, lane, wave, dependsOn = [] }) => ({
  id,
  slug: id.replace("mission:", "mission-"),
  title: id,
  library: `library-${id}`,
  lane,
  branch: `agent/${id.replace("mission:", "")}`,
  worktree: join(root, id.replace(":", "-")),
  activationWave: wave,
  dependsOn,
  writablePaths: [`output/${id.replace(":", "-")}/**`],
  scope: `Implement ${id}.`,
  deliverables: [`Deliver ${id}.`],
  dependencyLevel: dependsOn.length,
  initialEligibility: dependsOn.length > 0
    ? "blocked-by-dependencies"
    : wave === 1 ? "eligible-after-independent-authorization" : "staged-for-later-wave",
  constructionStatus: "planned-not-created",
  authorityStatus: "not-initialized",
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shield-flight-control-"));
  const plan = {
    schemaVersion: 1,
    planType: "feature-flight-resolved-plan",
    prototype: { name: "flight-prep", version: "1.0.0", authority: "none", notice: PLAN_NOTICE },
    flightId: "flight:test-control",
    objective: "Test closed Feature Flight routing.",
    repository: {
      root,
      remoteUrl: null,
      baseRef: "refs/heads/main",
      baseRevision: revision("a"),
      inspectedHead: revision("a"),
      inspectedBranch: "main",
      inspectedWorktreeClean: true,
      collisions: [],
    },
    integration: { branch: "integration/control", status: "declared-not-created" },
    lanes: [
      { id: "alpha", chatLabel: "Alpha chat", teamLabel: "Alpha team" },
      { id: "bravo", chatLabel: "Bravo chat", teamLabel: "Bravo team" },
    ],
    missions: [
      mission({ root, id: "mission:a", lane: "alpha", wave: 1 }),
      mission({ root, id: "mission:b", lane: "bravo", wave: 1, dependsOn: ["mission:a"] }),
      mission({ root, id: "mission:c", lane: "alpha", wave: 2 }),
    ],
    evaluationContract: { fixtureId: "fixture:synthetic", version: 1, scorecard: ["correctness"] },
  };
  const planPath = join(root, "flight-plan.resolved.json");
  await writeFile(planPath, stableJson(plan));
  const genesisPath = join(root, "flight-state-0.json");
  const genesis = await initializeFlightState({ planPath, output: genesisPath });
  const genesisSnapshot = await snapshotFile(genesisPath);
  return { root, plan, planPath, genesis, genesisPath, genesisSnapshot };
}

const writeState = async (context, state, name = `flight-state-${state.sequence}.json`) => {
  const path = join(context.root, name);
  await writeFile(path, stableJson(state));
  return { path, snapshot: await snapshotFile(path) };
};

const routeGenesis = (context, overrides = {}) => computeFlightStatus({
  planPath: context.planPath,
  statePath: context.genesisPath,
  expectedStateSha256: context.genesisSnapshot.sha256,
  expectedStateSequence: 0,
  ...overrides,
});

const successor = (context, mutate = () => {}) => {
  const state = structuredClone(context.genesis);
  state.sequence = 1;
  state.predecessorSha256 = context.genesisSnapshot.sha256;
  state.observedAt = "2026-08-08T22:00:00.000Z";
  mutate(state);
  return state;
};

const routeSuccessor = async (context, state, overrides = {}) => {
  const current = await writeState(context, state, `flight-state-${state.sequence}-${Math.random()}.json`);
  return computeFlightStatus({
    planPath: context.planPath,
    statePath: current.path,
    expectedStateSha256: current.snapshot.sha256,
    expectedStateSequence: state.sequence,
    predecessorStatePath: context.genesisPath,
    expectedPredecessorSha256: context.genesisSnapshot.sha256,
    ...overrides,
  });
};

test("flight-state producer emits closed v2 genesis consumed by flight route", async () => {
  const context = await fixture();
  assert.equal(context.genesis.schemaVersion, 2);
  assert.equal(context.genesis.authority, "none");
  assert.equal(context.genesis.sequence, 0);
  assert.equal(context.genesis.predecessorSha256, null);
  assert.equal(context.genesis.missions["mission:a"].lane, "alpha");
  assert.equal(context.genesis.missions["mission:c"].activationWave, 2);
  assert.equal(context.genesis.plan.sha256, sha256(await readFile(context.planPath)));

  const report = await routeGenesis(context);
  assert.equal(report.authority, "none");
  assert.equal(report.stateExpectation.matchedSuppliedSnapshot, true);
  assert.equal(report.stateExpectation.provesLatestState, false);
  assert.match(report.freshnessNotice, /do not prove that it is the latest/u);
  assert.equal(report.missions[0].advisoryCandidates[0], "request-independent-authority-verification");
  assert.equal(Object.hasOwn(report.missions[0], "legalActions"), false);
  await assert.rejects(
    () => initializeFlightState({ planPath: context.planPath, output: context.genesisPath }),
    /Refusing to overwrite/u,
  );
});

test("flight-prep resolved-plan output is consumed by state-init and route", async () => {
  const root = await mkdtemp(join(tmpdir(), "shield-flight-control-producers-"));
  const repositoryPath = join(root, "repository");
  await mkdir(repositoryPath);
  const git = (arguments_) => execFileSync("git", ["-C", repositoryPath, ...arguments_], { encoding: "utf8" }).trim();
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Flight Control Test"]);
  git(["config", "user.email", "flight-control@example.invalid"]);
  await writeFile(join(repositoryPath, "README.md"), "fixture\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "fixture"]);
  const manifest = {
    schemaVersion: 1,
    flightId: "flight:producer-consumer",
    objective: "Prove the persisted producer-consumer contract.",
    repository: { path: repositoryPath, baseRef: "main", baseRevision: git(["rev-parse", "HEAD"]) },
    integration: { branch: "integration/producer-consumer" },
    lanes: [{ id: "alpha", chatLabel: "Alpha chat", teamLabel: "Alpha team" }],
    missions: [{
      id: "mission:producer-consumer",
      slug: "mission-producer-consumer",
      title: "Producer consumer",
      library: "fixture",
      lane: "alpha",
      branch: "agent/producer-consumer",
      worktree: join(root, "mission-worktree"),
      activationWave: 1,
      dependsOn: [],
      writablePaths: ["output/**"],
      scope: "Prove compatibility.",
      deliverables: ["Compatibility evidence"],
    }],
    evaluationContract: { fixtureId: "fixture:producer-consumer", version: 1, scorecard: ["correctness"] },
  };
  const manifestPath = join(root, "manifest.json");
  const packagePath = join(root, "package");
  await writeFile(manifestPath, stableJson(manifest));
  await prepareFlight({ manifestPath, outputPath: packagePath });

  const planPath = join(packagePath, "flight-plan.resolved.json");
  const statePath = join(root, "flight-state.json");
  await initializeFlightState({ planPath, output: statePath });
  const stateSnapshot = await snapshotFile(statePath);
  const report = await computeFlightStatus({
    planPath,
    statePath,
    expectedStateSha256: stateSnapshot.sha256,
    expectedStateSequence: 0,
  });
  assert.equal(report.flightId, manifest.flightId);
  assert.equal(report.plan.sha256, sha256(await readFile(planPath)));
  assert.deepEqual(report.missions[0].advisoryCandidates, ["request-independent-authority-verification"]);
});

test("route requires exact expected current snapshot digest and sequence", async () => {
  const context = await fixture();
  await assert.rejects(
    () => computeFlightStatus({ planPath: context.planPath, statePath: context.genesisPath, expectedStateSequence: 0 }),
    /expectedStateSha256/u,
  );
  await assert.rejects(
    () => computeFlightStatus({ planPath: context.planPath, statePath: context.genesisPath, expectedStateSha256: context.genesisSnapshot.sha256 }),
    /expectedStateSequence/u,
  );
  await assert.rejects(() => routeGenesis(context, { expectedStateSha256: revision("f") + "f".repeat(24) }), /Expected state SHA-256/u);
  await assert.rejects(() => routeGenesis(context, { expectedStateSequence: 1 }), /Expected state sequence/u);
});

test("route rejects stale or wrong plan, flight, mission, repository, and revision bindings", async () => {
  const context = await fixture();
  const cases = [
    ["plan digest", (state) => { state.plan.sha256 = "b".repeat(64); }, /exact supplied plan snapshot/u],
    ["flight", (state) => { state.flightId = "flight:wrong"; }, /flightId/u],
    ["mission", (state) => { state.missions["mission:unknown"] = structuredClone(state.missions["mission:a"]); }, /unknown mission/u],
    ["repository", (state) => { state.repository.baseRevision = revision("b"); }, /repository\.baseRevision/u],
    ["revision", (state) => { state.missions["mission:a"].revision = "main"; }, /exact 40-character revision/u],
  ];
  for (const [name, mutate, pattern] of cases) {
    const state = structuredClone(context.genesis);
    mutate(state);
    const stored = await writeState(context, state, `${name.replace(" ", "-")}.json`);
    await assert.rejects(
      () => computeFlightStatus({
        planPath: context.planPath,
        statePath: stored.path,
        expectedStateSha256: stored.snapshot.sha256,
        expectedStateSequence: 0,
      }),
      pattern,
      name,
    );
  }
});

test("closed state rejects unknown fields at every nested contract level", async () => {
  const context = await fixture();
  const cases = [
    (state) => { state.unknown = true; },
    (state) => { state.plan.unknown = true; },
    (state) => { state.repository.unknown = true; },
    (state) => { state.wave.unknown = true; },
    (state) => { state.lanes.alpha.unknown = true; },
    (state) => { state.missions["mission:a"].unknown = true; },
    (state) => { state.tool.unknown = true; },
  ];
  for (const [index, mutate] of cases.entries()) {
    const state = structuredClone(context.genesis);
    mutate(state);
    const stored = await writeState(context, state, `unknown-${index}.json`);
    await assert.rejects(
      () => computeFlightStatus({
        planPath: context.planPath,
        statePath: stored.path,
        expectedStateSha256: stored.snapshot.sha256,
        expectedStateSequence: 0,
      }),
      /unknown field/u,
    );
  }
});

test("resolved-plan and state consumers reject missing lane and activation wave instead of defaulting", async () => {
  for (const field of ["lane", "activationWave"]) {
    const context = await fixture();
    const plan = structuredClone(context.plan);
    delete plan.missions[0][field];
    await writeFile(context.planPath, stableJson(plan));
    await assert.rejects(() => routeGenesis(context), new RegExp(`${field} is required`, "u"));
  }

  const context = await fixture();
  for (const field of ["lane", "activationWave"]) {
    const state = structuredClone(context.genesis);
    delete state.missions["mission:a"][field];
    const stored = await writeState(context, state, `missing-state-${field}.json`);
    await assert.rejects(
      () => computeFlightStatus({
        planPath: context.planPath,
        statePath: stored.path,
        expectedStateSha256: stored.snapshot.sha256,
        expectedStateSequence: 0,
      }),
      new RegExp(`${field} is required`, "u"),
    );
  }
});

test("null authority evidence never promotes authority-derived lifecycle observations", async () => {
  const context = await fixture();
  for (const status of ["authorized", "active", "complete", "integrated"]) {
    const state = successor(context, (next) => {
      next.missions["mission:a"].status = status;
      next.missions["mission:a"].revision = revision("b");
      if (status === "active") next.lanes.alpha.activeMissionId = "mission:a";
    });
    const report = await routeSuccessor(context, state);
    const observed = report.missions.find(({ id }) => id === "mission:a");
    assert.equal(observed.disposition, "requires-authority-verification", status);
    assert.deepEqual(observed.advisoryCandidates, ["requires-authority-verification"], status);
    const allCandidates = report.missions.flatMap(({ advisoryCandidates }) => advisoryCandidates);
    assert.equal(allCandidates.every((candidate) => candidate === "requires-authority-verification"), true, status);
    assert.equal(allCandidates.some((candidate) => ["activate", "continue", "complete", "integrate"].includes(candidate)), false, status);
  }
});

test("forged authority evidence fails closed", async () => {
  const context = await fixture();
  const state = successor(context, (next) => {
    next.missions["mission:a"].status = "authorized";
    next.missions["mission:a"].revision = revision("b");
    next.missions["mission:a"].authorityEvidence = { authority: "approved", signature: "forged" };
  });
  await assert.rejects(() => routeSuccessor(context, state), /authorityEvidence must be null/u);
});

test("route validates exact predecessor digest, identity, sequence, and genesis use", async () => {
  const context = await fixture();
  const valid = successor(context);
  const report = await routeSuccessor(context, valid);
  assert.equal(report.predecessor.sha256, context.genesisSnapshot.sha256);

  const stored = await writeState(context, valid, "successor-for-errors.json");
  const base = {
    planPath: context.planPath,
    statePath: stored.path,
    expectedStateSha256: stored.snapshot.sha256,
    expectedStateSequence: 1,
  };
  await assert.rejects(() => computeFlightStatus(base), /predecessorStatePath is required/u);
  await assert.rejects(
    () => computeFlightStatus({
      ...base,
      predecessorStatePath: join(context.root, "missing-predecessor.json"),
      expectedPredecessorSha256: context.genesisSnapshot.sha256,
    }),
    /not a non-symlink regular file/u,
  );
  await assert.rejects(
    () => computeFlightStatus({ ...base, predecessorStatePath: context.genesisPath }),
    /expectedPredecessorSha256/u,
  );
  await assert.rejects(
    () => computeFlightStatus({
      ...base,
      predecessorStatePath: context.genesisPath,
      expectedPredecessorSha256: "f".repeat(64),
    }),
    /Expected predecessor SHA-256/u,
  );

  const wrongSequence = structuredClone(valid);
  wrongSequence.sequence = 2;
  const wrongSequenceStored = await writeState(context, wrongSequence, "wrong-predecessor-sequence.json");
  await assert.rejects(
    () => computeFlightStatus({
      planPath: context.planPath,
      statePath: wrongSequenceStored.path,
      expectedStateSha256: wrongSequenceStored.snapshot.sha256,
      expectedStateSequence: 2,
      predecessorStatePath: context.genesisPath,
      expectedPredecessorSha256: context.genesisSnapshot.sha256,
    }),
    /sequence must equal current sequence minus one/u,
  );

  const brokenDigest = structuredClone(valid);
  brokenDigest.predecessorSha256 = "e".repeat(64);
  const brokenStored = await writeState(context, brokenDigest, "broken-predecessor-digest.json");
  await assert.rejects(
    () => computeFlightStatus({
      planPath: context.planPath,
      statePath: brokenStored.path,
      expectedStateSha256: brokenStored.snapshot.sha256,
      expectedStateSequence: 1,
      predecessorStatePath: context.genesisPath,
      expectedPredecessorSha256: context.genesisSnapshot.sha256,
    }),
    /predecessorSha256 does not match/u,
  );

  await assert.rejects(
    () => routeGenesis(context, {
      predecessorStatePath: context.genesisPath,
      expectedPredecessorSha256: context.genesisSnapshot.sha256,
    }),
    /Genesis state must not supply predecessor/u,
  );
  const badGenesis = structuredClone(context.genesis);
  badGenesis.predecessorSha256 = context.genesisSnapshot.sha256;
  const badGenesisStored = await writeState(context, badGenesis, "bad-genesis.json");
  await assert.rejects(
    () => computeFlightStatus({
      planPath: context.planPath,
      statePath: badGenesisStored.path,
      expectedStateSha256: badGenesisStored.snapshot.sha256,
      expectedStateSequence: 0,
    }),
    /must be null only for genesis/u,
  );
});

test("route rejects cross-flight and cross-plan predecessor snapshots", async () => {
  const context = await fixture();
  const other = await fixture();
  const state = successor(context);
  state.predecessorSha256 = other.genesisSnapshot.sha256;
  const stored = await writeState(context, state, "cross-flight-successor.json");
  await assert.rejects(
    () => computeFlightStatus({
      planPath: context.planPath,
      statePath: stored.path,
      expectedStateSha256: stored.snapshot.sha256,
      expectedStateSequence: 1,
      predecessorStatePath: other.genesisPath,
      expectedPredecessorSha256: other.genesisSnapshot.sha256,
    }),
    /predecessor.*(?:flightId|plan)/isu,
  );
});

test("route CLI help and failures require externally expected state evidence", async () => {
  const context = await fixture();
  const missing = spawnSync(process.execPath, [
    cli, "flight", "route", "--plan", context.planPath, "--state", context.genesisPath,
  ], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--expected-state-sha256 SHA256 --expected-state-sequence N/u);

  const successorState = successor(context);
  const successorStored = await writeState(context, successorState, "cli-successor.json");
  const missingPredecessor = spawnSync(process.execPath, [
    cli, "flight", "route",
    "--plan", context.planPath,
    "--state", successorStored.path,
    "--expected-state-sha256", successorStored.snapshot.sha256,
    "--expected-state-sequence", "1",
  ], { encoding: "utf8" });
  assert.equal(missingPredecessor.status, 1);
  assert.match(missingPredecessor.stderr, /predecessorStatePath is required/u);

  const valid = spawnSync(process.execPath, [
    cli, "flight", "route",
    "--plan", context.planPath,
    "--state", context.genesisPath,
    "--expected-state-sha256", context.genesisSnapshot.sha256,
    "--expected-state-sequence", "0",
  ], { encoding: "utf8" });
  assert.equal(valid.status, 0, valid.stderr);
  const report = JSON.parse(valid.stdout);
  assert.equal(report.stateExpectation.provesLatestState, false);
});
