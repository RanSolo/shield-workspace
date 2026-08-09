import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, realpath, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FLIGHT_PLAN_NOTICE,
  FLIGHT_STATE_NOTICE,
  LIFECYCLE_TRANSITIONS,
  artifactIdentity,
  validateFlightState,
  validateImmediateTransition,
  validateResolvedPlan,
} from "../scripts/operations/flight-contracts.mjs";
import {
  computeFeatureFlightStatus,
  readFlightJsonSnapshot,
} from "../scripts/operations/feature-flight-controller.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const operationsCli = join(packageRoot, "scripts", "operations", "ops-cli.mjs");

const REVISION = "1".repeat(40);
const OTHER_REVISION = "2".repeat(40);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const clone = (value) => structuredClone(value);

const fixtureRoot = async () => realpath(await mkdtemp(join(tmpdir(), "shield-flight-controller-")));

const planFixture = (root) => ({
  schemaVersion: 1,
  planType: "feature-flight-resolved-plan",
  prototype: {
    name: "flight-prep",
    version: "1.0.0",
    authority: "none",
    notice: FLIGHT_PLAN_NOTICE,
  },
  flightId: "Flight-251",
  objective: "Coordinate the first flight slice.",
  sourceIssue: "#251",
  repository: {
    root,
    remoteUrl: null,
    baseRef: "main",
    baseRevision: REVISION,
    inspectedHead: REVISION,
    inspectedBranch: "planning/main",
    inspectedWorktreeClean: true,
    collisions: [],
  },
  integration: { branch: "flight/integration", status: "declared-not-created" },
  lanes: [
    { id: "Lane-A", chatLabel: "Alpha chat", teamLabel: "Alpha team" },
    { id: "Lane-B", chatLabel: "Bravo chat", teamLabel: "Bravo team" },
  ],
  missions: [
    {
      id: "Mission-A", slug: "mission-a", title: "Alpha", library: "alpha", lane: "Lane-A",
      branch: "agent/alpha", worktree: join(root, "alpha"), activationWave: 1, dependsOn: [],
      writablePaths: ["packages/alpha/**"], scope: "Build alpha.", deliverables: ["Alpha output"],
      dependencyLevel: 0, initialEligibility: "eligible-after-independent-authorization",
      constructionStatus: "planned-not-created", authorityStatus: "not-initialized",
    },
    {
      id: "Mission-B", slug: "mission-b", title: "Bravo", library: "bravo", lane: "Lane-B",
      branch: "agent/bravo", worktree: join(root, "bravo"), activationWave: 1, dependsOn: [],
      writablePaths: ["packages/bravo/**"], scope: "Build bravo.", deliverables: ["Bravo output"],
      dependencyLevel: 0, initialEligibility: "eligible-after-independent-authorization",
      constructionStatus: "planned-not-created", authorityStatus: "not-initialized",
    },
  ],
  evaluationContract: { fixtureId: "fixture-251", version: 1, scorecard: ["status is advisory"] },
});

const revisionForStatus = (status, revision = REVISION) => status === "planned" ? null
  : ["blocked", "failed"].includes(status) ? revision
    : revision;

const stateFixture = (plan, planIdentity, {
  sequence = 0,
  predecessorSha256 = null,
  statuses = {},
  revisions = {},
} = {}) => {
  const missions = Object.fromEntries(plan.missions.map((mission) => {
    const status = statuses[mission.id] ?? "planned";
    return [mission.id, {
      lane: mission.lane,
      activationWave: mission.activationWave,
      status,
      revision: Object.hasOwn(revisions, mission.id) ? revisions[mission.id] : revisionForStatus(status),
      authorityEvidence: null,
    }];
  }));
  const lanes = Object.fromEntries(plan.lanes.map((lane) => {
    const active = plan.missions.filter((mission) => mission.lane === lane.id && missions[mission.id].status === "active");
    return [lane.id, { activeMissionId: active.length === 1 ? active[0].id : null }];
  }));
  const ready = plan.missions.filter((mission) => missions[mission.id].status !== "integrated" &&
    mission.dependsOn.every((dependency) => missions[dependency].status === "integrated"));
  return {
    schemaVersion: 2,
    stateType: "non-authoritative-flight-state",
    authority: "none",
    notice: FLIGHT_STATE_NOTICE,
    flightId: plan.flightId,
    plan: planIdentity,
    sequence,
    predecessorSha256,
    repository: {
      root: plan.repository.root,
      baseRef: plan.repository.baseRef,
      baseRevision: plan.repository.baseRevision,
      integrationBranch: plan.integration.branch,
    },
    wave: { current: ready.length === 0 ? null : Math.min(...ready.map((mission) => mission.activationWave)) },
    lanes,
    missions,
    observedAt: "2026-08-09T12:00:00.000Z",
    tool: { name: sequence === 0 ? "flight-state-init" : "flight-state-successor-recorder", version: "1.0.0" },
  };
};

const writePlan = async (root, plan = planFixture(root)) => {
  const path = join(root, "plan.json");
  const bytes = jsonBytes(plan);
  await writeFile(path, bytes);
  return { plan, snapshot: { path, bytes, sha256: sha256(bytes) }, identity: { path, bytes: bytes.length, sha256: sha256(bytes) } };
};

const writeState = async (root, filename, state) => {
  const path = join(root, filename);
  const bytes = jsonBytes(state);
  await writeFile(path, bytes);
  return { path, bytes, sha256: sha256(bytes) };
};

const runGenesis = async ({ root, planRecord, state }) => {
  const stateSnapshot = await writeState(root, "state.json", state);
  return computeFeatureFlightStatus({
    planPath: planRecord.snapshot.path,
    expectedPlanSha256: planRecord.snapshot.sha256,
    statePath: stateSnapshot.path,
    expectedStateSha256: stateSnapshot.sha256,
    expectedStateSequence: 0,
  });
};

test("valid genesis emits one exact plan-ordered candidate and deterministic stdout data", async () => {
  const root = await fixtureRoot();
  const planRecord = await writePlan(root);
  const state = stateFixture(planRecord.plan, planRecord.identity);
  const first = await runGenesis({ root, planRecord, state });
  const second = await runGenesis({ root, planRecord, state });
  assert.deepEqual(second, first);
  assert.equal(first.authority, "none");
  assert.equal(first.gateEligible, false);
  assert.equal(first.freshness.latestStateProven, false);
  assert.equal(first.freshness.completeHistoryProven, false);
  assert.equal(first.freshness.immediatePredecessorProven, false);
  assert.equal(first.globalStop, null);
  assert.deepEqual(first.nextCandidate, {
    missionId: "Mission-A", lane: "Lane-A", activationWave: 1,
    action: "request-exact-child-authorization",
  });
  assert.equal(first.missions[0].disposition, "candidate");
  assert.equal(first.missions[1].disposition, "not-selected");
  assert.doesNotMatch(JSON.stringify(first), /dispatch_ready/u);
});

test("identical real CLI invocations emit byte-identical stdout", async () => {
  const root = await fixtureRoot();
  const planRecord = await writePlan(root);
  const state = stateFixture(planRecord.plan, planRecord.identity);
  const stateSnapshot = await writeState(root, "state.json", state);
  const args = [
    operationsCli, "flight", "status",
    "--plan", planRecord.snapshot.path,
    "--expected-plan-sha256", planRecord.snapshot.sha256,
    "--state", stateSnapshot.path,
    "--expected-state-sha256", stateSnapshot.sha256,
    "--expected-state-sequence", "0",
  ];
  const first = spawnSync(process.execPath, args, { encoding: "utf8" });
  const second = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.equal(first.stderr, "");
  assert.doesNotMatch(first.stdout, /dispatch_ready/u);
});

test("current authority-derived statuses always apply the authority global stop", async (t) => {
  for (const status of ["authorized", "active", "complete", "integrated", "cancelled", "superseded"]) {
    await t.test(status, async () => {
      const root = await fixtureRoot();
      const planRecord = await writePlan(root);
      const state = stateFixture(planRecord.plan, planRecord.identity, { statuses: { "Mission-A": status } });
      const result = await runGenesis({ root, planRecord, state });
      assert.deepEqual(result.globalStop, { code: "authority-verification-required" });
      assert.equal(result.nextCandidate, null);
      assert.equal(result.missions[0].disposition, "authority-verification-required");
    });
  }
});

test("blocked and failed current states use the lower-precedence operator stop", async (t) => {
  for (const status of ["blocked", "failed"]) {
    await t.test(status, async () => {
      const root = await fixtureRoot();
      const planRecord = await writePlan(root);
      const state = stateFixture(planRecord.plan, planRecord.identity, {
        statuses: { "Mission-A": status }, revisions: { "Mission-A": null },
      });
      const result = await runGenesis({ root, planRecord, state });
      assert.deepEqual(result.globalStop, { code: "operator-disposition-required" });
      assert.equal(result.nextCandidate, null);
      assert.equal(result.missions[0].disposition, "operator-disposition-required");
    });
  }
});

test("a valid predecessor edge proves only that immediate edge and predecessor authority wins precedence", async () => {
  const root = await fixtureRoot();
  const planRecord = await writePlan(root);
  const predecessor = stateFixture(planRecord.plan, planRecord.identity, {
    sequence: 1,
    predecessorSha256: "3".repeat(64),
    statuses: { "Mission-A": "authorized" },
  });
  const predecessorSnapshot = await writeState(root, "predecessor.json", predecessor);
  const current = stateFixture(planRecord.plan, planRecord.identity, {
    sequence: 2,
    predecessorSha256: predecessorSnapshot.sha256,
    statuses: { "Mission-A": "blocked" },
  });
  const currentSnapshot = await writeState(root, "state.json", current);
  const result = await computeFeatureFlightStatus({
    planPath: planRecord.snapshot.path,
    expectedPlanSha256: planRecord.snapshot.sha256,
    statePath: currentSnapshot.path,
    expectedStateSha256: currentSnapshot.sha256,
    expectedStateSequence: 2,
    predecessorStatePath: predecessorSnapshot.path,
    expectedPredecessorSha256: predecessorSnapshot.sha256,
  });
  assert.deepEqual(result.globalStop, { code: "authority-verification-required" });
  assert.deepEqual(result.freshness, {
    latestStateProven: false,
    completeHistoryProven: false,
    immediatePredecessorProven: true,
  });
});

test("every authority-derived predecessor status triggers the authority stop", async (t) => {
  const transitions = new Map([
    ["authorized", "blocked"],
    ["active", "blocked"],
    ["complete", "complete"],
    ["integrated", "integrated"],
    ["cancelled", "cancelled"],
    ["superseded", "superseded"],
  ]);
  for (const [priorStatus, currentStatus] of transitions) {
    await t.test(priorStatus, async () => {
      const root = await fixtureRoot();
      const planRecord = await writePlan(root);
      const predecessor = stateFixture(planRecord.plan, planRecord.identity, {
        sequence: 1, predecessorSha256: "a".repeat(64), statuses: { "Mission-A": priorStatus },
      });
      const predecessorSnapshot = await writeState(root, "predecessor.json", predecessor);
      const current = stateFixture(planRecord.plan, planRecord.identity, {
        sequence: 2,
        predecessorSha256: predecessorSnapshot.sha256,
        statuses: { "Mission-A": currentStatus },
        revisions: { "Mission-A": REVISION },
      });
      const currentSnapshot = await writeState(root, "state.json", current);
      const result = await computeFeatureFlightStatus({
        planPath: planRecord.snapshot.path,
        expectedPlanSha256: planRecord.snapshot.sha256,
        statePath: currentSnapshot.path,
        expectedStateSha256: currentSnapshot.sha256,
        expectedStateSequence: 2,
        predecessorStatePath: predecessorSnapshot.path,
        expectedPredecessorSha256: predecessorSnapshot.sha256,
      });
      assert.deepEqual(result.globalStop, { code: "authority-verification-required" });
      assert.equal(result.nextCandidate, null);
    });
  }
});

test("every immediate transition-table edge is structurally allowed", async () => {
  const root = await fixtureRoot();
  const plan = planFixture(root);
  for (const [from, allowed] of LIFECYCLE_TRANSITIONS) {
    for (const to of allowed) {
      const priorRevision = revisionForStatus(from);
      const currentRevision = priorRevision ?? revisionForStatus(to);
      const predecessor = stateFixture(plan, { path: join(root, "plan.json"), bytes: 1, sha256: "4".repeat(64) }, {
        sequence: 1, predecessorSha256: "5".repeat(64), statuses: { "Mission-A": from }, revisions: { "Mission-A": priorRevision },
      });
      const current = stateFixture(plan, predecessor.plan, {
        sequence: 2, predecessorSha256: "6".repeat(64), statuses: { "Mission-A": to }, revisions: { "Mission-A": currentRevision },
      });
      assert.deepEqual(validateImmediateTransition(plan, predecessor, current), [], `${from} -> ${to}`);
    }
  }
});

test("transition validation rejects lifecycle regression and revision clearing or substitution", async () => {
  const root = await fixtureRoot();
  const plan = planFixture(root);
  const identity = { path: join(root, "plan.json"), bytes: 1, sha256: "4".repeat(64) };
  const authorized = stateFixture(plan, identity, { sequence: 1, predecessorSha256: "5".repeat(64), statuses: { "Mission-A": "authorized" } });
  const planned = stateFixture(plan, identity, { sequence: 2, predecessorSha256: "6".repeat(64) });
  assert.match(validateImmediateTransition(plan, authorized, planned).join("\n"), /not allowed/u);
  const blockedCleared = stateFixture(plan, identity, {
    sequence: 2, predecessorSha256: "6".repeat(64), statuses: { "Mission-A": "blocked" }, revisions: { "Mission-A": null },
  });
  assert.match(validateImmediateTransition(plan, authorized, blockedCleared).join("\n"), /cannot be cleared/u);
  const blockedChanged = clone(blockedCleared);
  blockedChanged.missions["Mission-A"].revision = OTHER_REVISION;
  assert.match(validateImmediateTransition(plan, authorized, blockedChanged).join("\n"), /cannot be substituted/u);
});

test("exact plan/state digest and sequence expectations fail closed", async () => {
  const root = await fixtureRoot();
  const planRecord = await writePlan(root);
  const state = stateFixture(planRecord.plan, planRecord.identity);
  const stateSnapshot = await writeState(root, "state.json", state);
  const base = {
    planPath: planRecord.snapshot.path, expectedPlanSha256: planRecord.snapshot.sha256,
    statePath: stateSnapshot.path, expectedStateSha256: stateSnapshot.sha256, expectedStateSequence: 0,
  };
  await assert.rejects(computeFeatureFlightStatus({ ...base, expectedPlanSha256: "0".repeat(64) }), /Expected plan SHA-256/u);
  await assert.rejects(computeFeatureFlightStatus({ ...base, expectedStateSha256: "0".repeat(64) }), /Expected state SHA-256/u);
  await assert.rejects(computeFeatureFlightStatus({ ...base, expectedStateSequence: 1,
    predecessorStatePath: stateSnapshot.path, expectedPredecessorSha256: stateSnapshot.sha256 }), /Expected state sequence/u);
  await assert.rejects(computeFeatureFlightStatus({ ...base, predecessorStatePath: stateSnapshot.path,
    expectedPredecessorSha256: stateSnapshot.sha256 }), /Genesis state/u);
});

test("non-genesis replay rejects absence, digest drift, discontinuity, cross-plan, revision, and wave drift", async () => {
  const root = await fixtureRoot();
  const planRecord = await writePlan(root);
  const predecessor = stateFixture(planRecord.plan, planRecord.identity, { sequence: 1, predecessorSha256: "7".repeat(64) });
  const predecessorSnapshot = await writeState(root, "predecessor.json", predecessor);
  const current = stateFixture(planRecord.plan, planRecord.identity, { sequence: 2, predecessorSha256: predecessorSnapshot.sha256 });
  const currentSnapshot = await writeState(root, "state.json", current);
  const base = {
    planPath: planRecord.snapshot.path, expectedPlanSha256: planRecord.snapshot.sha256,
    statePath: currentSnapshot.path, expectedStateSha256: currentSnapshot.sha256, expectedStateSequence: 2,
    predecessorStatePath: predecessorSnapshot.path, expectedPredecessorSha256: predecessorSnapshot.sha256,
  };
  await assert.rejects(computeFeatureFlightStatus({ ...base, predecessorStatePath: undefined, expectedPredecessorSha256: undefined }), /requires both predecessor/u);
  await assert.rejects(computeFeatureFlightStatus({ ...base, expectedPredecessorSha256: "8".repeat(64) }), /Expected predecessor SHA-256/u);

  const discontinuous = clone(predecessor);
  discontinuous.sequence = 0;
  discontinuous.predecessorSha256 = null;
  discontinuous.tool.name = "flight-state-init";
  const discontinuousSnapshot = await writeState(root, "discontinuous.json", discontinuous);
  await assert.rejects(computeFeatureFlightStatus({ ...base, predecessorStatePath: discontinuousSnapshot.path,
    expectedPredecessorSha256: discontinuousSnapshot.sha256 }), /predecessorSha256 does not match|sequence must equal/u);

  const wrongPlan = clone(predecessor);
  wrongPlan.plan.sha256 = "9".repeat(64);
  const wrongPlanSnapshot = await writeState(root, "wrong-plan.json", wrongPlan);
  const currentWrongLink = clone(current);
  currentWrongLink.predecessorSha256 = wrongPlanSnapshot.sha256;
  const currentWrongLinkSnapshot = await writeState(root, "current-wrong-link.json", currentWrongLink);
  await assert.rejects(computeFeatureFlightStatus({ ...base, statePath: currentWrongLinkSnapshot.path,
    expectedStateSha256: currentWrongLinkSnapshot.sha256, predecessorStatePath: wrongPlanSnapshot.path,
    expectedPredecessorSha256: wrongPlanSnapshot.sha256 }), /exact supplied plan artifact/u);

  const waveRegressionPrior = clone(predecessor);
  waveRegressionPrior.wave.current = 2;
  assert.match(validateImmediateTransition(planRecord.plan, waveRegressionPrior, current).join("\n"), /regressed/u);
});

test("resolved-plan validator rejects closed-shape and identity attacks", async () => {
  const root = await fixtureRoot();
  const base = planFixture(root);
  const cases = [];
  const unknown = clone(base); unknown.zeta = true; cases.push([unknown, /unknown field zeta/u]);
  const sparse = clone(base); delete sparse.lanes[0]; cases.push([sparse, /must be dense/u]);
  const inherited = Object.assign(Object.create({ inherited: true }), clone(base)); cases.push([inherited, /ordinary object prototype/u]);
  const symbolic = clone(base); symbolic[Symbol("x")] = true; cases.push([symbolic, /symbolic/u]);
  const accessor = clone(base); Object.defineProperty(accessor, "flightId", { enumerable: true, get: () => "Flight-251" }); cases.push([accessor, /accessor/u]);
  const foldedLane = clone(base); foldedLane.lanes[1].id = "lane-a"; cases.push([foldedLane, /duplicates.*ASCII/u]);
  const foldedBranch = clone(base); foldedBranch.missions[1].branch = "AGENT/ALPHA"; cases.push([foldedBranch, /role-distinct/u]);
  const overlap = clone(base); overlap.missions[1].writablePaths = ["PACKAGES/ALPHA/sub/**"]; cases.push([overlap, /ownership overlaps/u]);
  const traversal = clone(base); traversal.missions[0].writablePaths = ["packages/../alpha/**"]; cases.push([traversal, /ownership path/u]);
  const backslash = clone(base); backslash.missions[0].writablePaths = ["packages\\alpha"]; cases.push([backslash, /ownership path/u]);
  const cycle = clone(base);
  cycle.missions[0].dependsOn = ["Mission-B"];
  cycle.missions[0].dependencyLevel = 1;
  cycle.missions[0].initialEligibility = "blocked-by-dependencies";
  cycle.missions[1].dependsOn = ["Mission-A"];
  cycle.missions[1].dependencyLevel = 1;
  cycle.missions[1].initialEligibility = "blocked-by-dependencies";
  cases.push([cycle, /dependency cycle/u]);
  for (const [candidate, pattern] of cases) assert.match(validateResolvedPlan(candidate).join("\n"), pattern);
});

test("state validator rejects closed-shape, membership, lane, and timestamp drift", async () => {
  const root = await fixtureRoot();
  const plan = planFixture(root);
  const identity = { path: join(root, "plan.json"), bytes: 1, sha256: "4".repeat(64) };
  const base = stateFixture(plan, identity);
  const cases = [];
  const unknown = clone(base); unknown.extra = true; cases.push([unknown, /unknown field extra/u]);
  const inherited = Object.assign(Object.create({ inherited: true }), clone(base)); cases.push([inherited, /ordinary object prototype/u]);
  const symbolic = clone(base); symbolic[Symbol("x")] = true; cases.push([symbolic, /symbolic/u]);
  const accessor = clone(base); Object.defineProperty(accessor, "flightId", { enumerable: true, get: () => plan.flightId }); cases.push([accessor, /accessor/u]);
  const missingMission = clone(base); delete missingMission.missions["Mission-B"]; cases.push([missingMission, /Mission-B is required/u]);
  const unknownOccupant = clone(base); unknownOccupant.lanes["Lane-A"].activeMissionId = "Unknown"; cases.push([unknownOccupant, /must equal null/u]);
  const timestamp = clone(base); timestamp.observedAt = "2026-08-09T12:00:00Z"; cases.push([timestamp, /canonical UTC RFC 3339/u]);
  for (const [candidate, pattern] of cases) assert.match(validateFlightState(plan, identity, candidate).join("\n"), pattern);

  const sharedLanePlan = clone(plan);
  sharedLanePlan.missions[1].lane = "Lane-A";
  const ambiguous = stateFixture(sharedLanePlan, identity, {
    statuses: { "Mission-A": "active", "Mission-B": "active" },
  });
  assert.match(validateFlightState(sharedLanePlan, identity, ambiguous).join("\n"), /multiple active missions/u);
});

test("snapshot rejects BOM, malformed UTF-8, symlinks, aliases, and replacement during read", async () => {
  const root = await fixtureRoot();
  const good = join(root, "good.json");
  await writeFile(good, "{}\n");
  const bom = join(root, "bom.json");
  await writeFile(bom, Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]));
  await assert.rejects(readFlightJsonSnapshot(bom), /BOM/u);
  const malformed = join(root, "malformed.json");
  await writeFile(malformed, Buffer.from([0xc3, 0x28]));
  await assert.rejects(readFlightJsonSnapshot(malformed), /valid UTF-8/u);
  const link = join(root, "link.json");
  await symlink(good, link);
  await assert.rejects(readFlightJsonSnapshot(link), /symlinks|canonical aliases/u);
  await assert.rejects(readFlightJsonSnapshot(`${root}/./good.json`), /canonical and absolute/u);
  const replacement = join(root, "replacement.json");
  await writeFile(replacement, "{}\n");
  await assert.rejects(readFlightJsonSnapshot(replacement, {
    afterRead: async () => {
      await rename(replacement, join(root, "original.json"));
      await writeFile(replacement, "{}\n");
    },
  }), /identity changed during snapshot/u);
});

test("artifact identity records exact canonical path, byte length, and digest", async () => {
  const root = await fixtureRoot();
  const path = join(root, "artifact.json");
  await writeFile(path, "{}\n");
  const snapshot = await readFlightJsonSnapshot(path);
  assert.deepEqual(artifactIdentity(snapshot), { path, bytes: 3, sha256: sha256(Buffer.from("{}\n")) });
});
