import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256, snapshotFile, stableJson } from "../scripts/operations/common.mjs";
import { PLAN_NOTICE } from "../scripts/operations/flight-common.mjs";
import { prepareFlight } from "../scripts/operations/flight-prep.mjs";
import {
  FLIGHT_STATE_GENESIS_PRODUCER,
  FLIGHT_STATE_SUCCESSOR_PRODUCER,
  initializeFlightState,
} from "../scripts/operations/flight-state-init.mjs";
import { computeFlightStatus, validateRoutingAdviceReport } from "../scripts/operations/hill-kernel.mjs";

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

async function fixture({ integerLikeIds = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "shield-flight-control-"));
  const lanes = integerLikeIds
    ? [
        { id: "2", chatLabel: "Lane two chat", teamLabel: "Lane two team" },
        { id: "1", chatLabel: "Lane one chat", teamLabel: "Lane one team" },
      ]
    : [
        { id: "alpha", chatLabel: "Alpha chat", teamLabel: "Alpha team" },
        { id: "bravo", chatLabel: "Bravo chat", teamLabel: "Bravo team" },
      ];
  const missions = integerLikeIds
    ? [
        mission({ root, id: "2", lane: "2", wave: 1 }),
        mission({ root, id: "1", lane: "1", wave: 2, dependsOn: ["2"] }),
      ]
    : [
        mission({ root, id: "mission:a", lane: "alpha", wave: 1 }),
        mission({ root, id: "mission:b", lane: "bravo", wave: 1, dependsOn: ["mission:a"] }),
        mission({ root, id: "mission:c", lane: "alpha", wave: 2 }),
      ];
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
    lanes,
    missions,
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

const deriveRoutingFields = (context, state) => {
  for (const lane of context.plan.lanes) state.lanes[lane.id].activeMissionId = null;
  for (const plannedMission of context.plan.missions) {
    if (state.missions[plannedMission.id].status === "active") {
      state.lanes[plannedMission.lane].activeMissionId = plannedMission.id;
    }
  }
  const ready = context.plan.missions.filter((plannedMission) =>
    state.missions[plannedMission.id].status !== "integrated" &&
    plannedMission.dependsOn.every((dependency) => state.missions[dependency].status === "integrated"),
  );
  state.wave.current = ready.length === 0
    ? null
    : Math.min(...ready.map((plannedMission) => plannedMission.activationWave));
};

const successor = (context, mutate = () => {}) => {
  const state = structuredClone(context.genesis);
  state.sequence = 1;
  state.predecessorSha256 = context.genesisSnapshot.sha256;
  state.observedAt = "2026-08-08T22:00:00.000Z";
  state.tool.name = FLIGHT_STATE_SUCCESSOR_PRODUCER;
  mutate(state);
  deriveRoutingFields(context, state);
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

const routeTransition = async (context, predecessor, mutateCurrent = () => {}) => {
  const predecessorStored = await writeState(context, predecessor, `predecessor-${Math.random()}.json`);
  const current = structuredClone(predecessor);
  current.sequence = predecessor.sequence + 1;
  current.predecessorSha256 = predecessorStored.snapshot.sha256;
  current.observedAt = "2026-08-08T22:01:00.000Z";
  current.tool.name = FLIGHT_STATE_SUCCESSOR_PRODUCER;
  mutateCurrent(current);
  deriveRoutingFields(context, current);
  const currentStored = await writeState(context, current, `current-${Math.random()}.json`);
  const report = await computeFlightStatus({
    planPath: context.planPath,
    statePath: currentStored.path,
    expectedStateSha256: currentStored.snapshot.sha256,
    expectedStateSequence: current.sequence,
    predecessorStatePath: predecessorStored.path,
    expectedPredecessorSha256: predecessorStored.snapshot.sha256,
  });
  return { report, predecessorStored, current, currentStored };
};

test("flight-state producer emits closed v2 genesis consumed by flight route", async () => {
  const context = await fixture();
  assert.equal(context.genesis.schemaVersion, 2);
  assert.equal(context.genesis.authority, "none");
  assert.equal(context.genesis.sequence, 0);
  assert.equal(context.genesis.predecessorSha256, null);
  assert.equal(context.genesis.tool.name, FLIGHT_STATE_GENESIS_PRODUCER);
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

test("integer-like lane and mission IDs route by plan order, not object enumeration order", async () => {
  const context = await fixture({ integerLikeIds: true });
  assert.deepEqual(context.plan.lanes.map(({ id }) => id), ["2", "1"]);
  assert.deepEqual(context.plan.missions.map(({ id }) => id), ["2", "1"]);
  assert.deepEqual(Object.keys(context.genesis.lanes), ["1", "2"]);
  assert.deepEqual(Object.keys(context.genesis.missions), ["1", "2"]);

  const report = await routeGenesis(context);
  assert.deepEqual(report.missions.map(({ id }) => id), ["2", "1"]);
  assert.deepEqual(report.missions[0].advisoryCandidates, ["request-independent-authority-verification"]);
  assert.deepEqual(report.missions[1].unmetDependencies, ["2"]);
});

test("state producer identity is closed by genesis or successor sequence", async () => {
  const context = await fixture();
  const validSuccessor = successor(context);
  const report = await routeSuccessor(context, validSuccessor);
  assert.equal(validSuccessor.tool.name, FLIGHT_STATE_SUCCESSOR_PRODUCER);
  assert.equal(report.sequence, 1);

  const forgedGenesis = structuredClone(context.genesis);
  forgedGenesis.tool.name = FLIGHT_STATE_SUCCESSOR_PRODUCER;
  const forgedGenesisStored = await writeState(context, forgedGenesis, "forged-genesis-producer.json");
  await assert.rejects(
    () => computeFlightStatus({
      planPath: context.planPath,
      statePath: forgedGenesisStored.path,
      expectedStateSha256: forgedGenesisStored.snapshot.sha256,
      expectedStateSequence: 0,
    }),
    /sequence-specific flight-state-init producer/u,
  );

  const forgedSuccessor = successor(context);
  forgedSuccessor.tool.name = FLIGHT_STATE_GENESIS_PRODUCER;
  await assert.rejects(() => routeSuccessor(context, forgedSuccessor), /sequence-specific flight-state-successor-recorder producer/u);
});

test("routing advice report has one exact closed shape and rejects legacy action fields", async () => {
  const context = await fixture();
  const report = await routeGenesis(context);
  assert.deepEqual(Object.keys(report), [
    "schemaVersion", "reportType", "authority", "notice", "freshnessNotice", "tool", "flightId",
    "sequence", "currentWave", "plan", "state", "predecessor", "stateExpectation", "missions", "advisories",
  ]);
  assert.deepEqual(Object.keys(report.missions[0]), [
    "id", "lane", "activationWave", "status", "revision", "unmetDependencies", "disposition", "advisoryCandidates",
  ]);
  assert.deepEqual(Object.keys(report.advisories[0]), ["missionId", "candidate"]);
  assert.deepEqual(validateRoutingAdviceReport(report), []);

  const withEvents = structuredClone(report);
  withEvents.events = [];
  assert.match(validateRoutingAdviceReport(withEvents).join("\n"), /unknown field events/u);
  const withLegalActions = structuredClone(report);
  withLegalActions.missions[0].legalActions = ["activate"];
  assert.match(validateRoutingAdviceReport(withLegalActions).join("\n"), /unknown field legalActions/u);
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
  await prepareFlight({
    manifestPath,
    outputPath: packagePath,
    packageDependencies: process.platform === "linux"
      ? undefined
      : { nativeNoReplaceSupported: true, runNativeNoReplaceMove: rename },
  });

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

test("closed state rejects mission identity removal but accepts object-key reordering", async () => {
  const context = await fixture();
  const removed = successor(context);
  delete removed.missions["mission:b"];
  await assert.rejects(() => routeSuccessor(context, removed), /exact planned identity membership and cardinality|missing mission:b/u);

  const reordered = successor(context);
  reordered.missions = {
    "mission:b": reordered.missions["mission:b"],
    "mission:a": reordered.missions["mission:a"],
    "mission:c": reordered.missions["mission:c"],
  };
  const report = await routeSuccessor(context, reordered);
  assert.deepEqual(report.missions.map(({ id }) => id), ["mission:a", "mission:b", "mission:c"]);
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

test("every authority-derived lifecycle status replays only through authority verification", async () => {
  const context = await fixture();
  for (const status of ["authorized", "active", "complete", "integrated", "cancelled", "superseded"]) {
    const predecessor = successor(context, (next) => {
      next.missions["mission:a"].status = status;
      next.missions["mission:a"].revision = revision("b");
    });
    const { report } = await routeTransition(context, predecessor);
    const observed = report.missions.find(({ id }) => id === "mission:a");
    assert.equal(observed.disposition, "requires-authority-verification", status);
    assert.deepEqual(observed.advisoryCandidates, ["requires-authority-verification"], status);
    const allCandidates = report.missions.flatMap(({ advisoryCandidates }) => advisoryCandidates);
    assert.equal(allCandidates.every((candidate) => candidate === "requires-authority-verification"), true, status);
    assert.equal(allCandidates.some((candidate) => ["activate", "continue", "complete", "integrate"].includes(candidate)), false, status);
  }
});

test("every authority-derived lifecycle rollback fails closed", async () => {
  const context = await fixture();
  const rollbacks = new Map([
    ["authorized", "planned"],
    ["active", "authorized"],
    ["complete", "active"],
    ["integrated", "complete"],
    ["cancelled", "planned"],
    ["superseded", "planned"],
  ]);
  for (const [priorStatus, currentStatus] of rollbacks) {
    const predecessor = successor(context, (state) => {
      state.missions["mission:a"].status = priorStatus;
      state.missions["mission:a"].revision = revision("b");
    });
    await assert.rejects(
      () => routeTransition(context, predecessor, (state) => {
        state.missions["mission:a"].status = currentStatus;
      }),
      new RegExp(`${priorStatus} -> ${currentStatus} is not allowed`, "u"),
      `${priorStatus} -> ${currentStatus}`,
    );
  }
});

test("authority-derived predecessor state forces verification-only routing after blocking or failure", async () => {
  const context = await fixture();
  for (const currentStatus of ["blocked", "failed"]) {
    const predecessor = successor(context, (state) => {
      state.missions["mission:a"].status = "active";
      state.missions["mission:a"].revision = revision("b");
    });
    const { report } = await routeTransition(context, predecessor, (state) => {
      state.missions["mission:a"].status = currentStatus;
    });
    const allCandidates = report.missions.flatMap(({ advisoryCandidates }) => advisoryCandidates);
    assert.equal(allCandidates.length > 0, true);
    assert.equal(allCandidates.every((candidate) => candidate === "requires-authority-verification"), true);
  }
});

test("cancelled and superseded observations cannot advance lane or wave routing", async () => {
  const context = await fixture();
  for (const status of ["cancelled", "superseded"]) {
    const predecessor = successor(context, (state) => {
      state.missions["mission:a"].status = "active";
      state.missions["mission:a"].revision = revision("b");
    });
    const { report } = await routeTransition(context, predecessor, (state) => {
      state.missions["mission:a"].status = status;
    });
    assert.equal(report.currentWave, 1, status);
    assert.deepEqual(report.missions.find(({ id }) => id === "mission:a").advisoryCandidates, ["requires-authority-verification"]);
    assert.deepEqual(report.missions.find(({ id }) => id === "mission:c").advisoryCandidates, []);
  }
});

test("successor replay rejects revision clearing, revision substitution, and wave regression", async () => {
  const context = await fixture();
  const active = successor(context, (state) => {
    state.missions["mission:a"].status = "active";
    state.missions["mission:a"].revision = revision("b");
  });
  await assert.rejects(
    () => routeTransition(context, active, (state) => {
      state.missions["mission:a"].status = "blocked";
      state.missions["mission:a"].revision = null;
    }),
    /revision cannot be cleared/u,
  );

  const authorized = successor(context, (state) => {
    state.missions["mission:a"].status = "authorized";
    state.missions["mission:a"].revision = revision("b");
  });
  await assert.rejects(
    () => routeTransition(context, authorized, (state) => {
      state.missions["mission:a"].status = "active";
      state.missions["mission:a"].revision = revision("c");
    }),
    /revision cannot be substituted/u,
  );

  const waveTwo = successor(context, (state) => {
    state.missions["mission:a"].status = "integrated";
    state.missions["mission:a"].revision = revision("b");
    state.missions["mission:b"].status = "integrated";
    state.missions["mission:b"].revision = revision("c");
  });
  const predecessorStored = await writeState(context, waveTwo, "wave-two-predecessor.json");
  const regressed = structuredClone(waveTwo);
  regressed.sequence = 2;
  regressed.predecessorSha256 = predecessorStored.snapshot.sha256;
  regressed.observedAt = "2026-08-08T22:02:00.000Z";
  regressed.wave.current = 1;
  const regressedStored = await writeState(context, regressed, "wave-regression.json");
  await assert.rejects(
    () => computeFlightStatus({
      planPath: context.planPath,
      statePath: regressedStored.path,
      expectedStateSha256: regressedStored.snapshot.sha256,
      expectedStateSequence: 2,
      predecessorStatePath: predecessorStored.path,
      expectedPredecessorSha256: predecessorStored.snapshot.sha256,
    }),
    /wave.current is 1; expected 2/u,
  );
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
