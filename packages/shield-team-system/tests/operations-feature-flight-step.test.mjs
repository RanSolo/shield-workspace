import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  FEATURE_FLIGHT_STEP_CONTRACT_VERSION,
  runFeatureFlightStepV1,
  validateFeatureFlightStepClaim,
  validateFeatureFlightStepResult,
  validateFeatureFlightStepSuccessor,
} from "../scripts/operations/feature-flight-step.mjs";
import {
  FLIGHT_PLAN_NOTICE,
  FLIGHT_STATE_NOTICE,
  artifactIdentity,
  buildActiveToCompleteSuccessor,
  validateFlightState,
  validateImmediateTransition,
} from "../scripts/operations/flight-contracts.mjs";

const REVISION = "4".repeat(40);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalValue = (value) => Array.isArray(value) ? value.map(canonicalValue)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
    : value;
const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
const fileBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

const planFixture = (repositoryRoot, worktree) => ({
  schemaVersion: 1,
  planType: "feature-flight-resolved-plan",
  prototype: { name: "flight-prep", version: "1.0.0", authority: "none", notice: FLIGHT_PLAN_NOTICE },
  flightId: "mission:flight-251",
  objective: "Run one active Daisy coordination cycle.",
  sourceIssue: "#251",
  repository: {
    root: repositoryRoot, remoteUrl: null, baseRef: "main", baseRevision: REVISION, inspectedHead: REVISION,
    inspectedBranch: "planning/main", inspectedWorktreeClean: true, collisions: [],
  },
  integration: { branch: "flight/integration", status: "declared-not-created" },
  lanes: [{ id: "lane-daisy", chatLabel: "Daisy chat", teamLabel: "Daisy team" }],
  missions: [{
    id: "mission:daisy-251", slug: "mission-daisy-251", title: "Daisy reconnaissance", library: "team-system",
    lane: "lane-daisy", branch: "agent/daisy-251", worktree, activationWave: 1, dependsOn: [],
    writablePaths: ["packages/shield-team-system/**"], scope: "Read-only coordination.", deliverables: ["Coordination result"],
    dependencyLevel: 0, initialEligibility: "eligible-after-independent-authorization",
    constructionStatus: "planned-not-created", authorityStatus: "not-initialized",
  }],
  evaluationContract: { fixtureId: "fixture-251-slice-2", version: 1, scorecard: ["one cycle"] },
});

const stateFixture = (plan, planIdentity, status, sequence, predecessorSha256) => ({
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
  wave: { current: 1 },
  lanes: { "lane-daisy": { activeMissionId: status === "active" ? "mission:daisy-251" : null } },
  missions: {
    "mission:daisy-251": { lane: "lane-daisy", activationWave: 1, status, revision: REVISION, authorityEvidence: null },
  },
  observedAt: "2026-08-09T12:00:00.000Z",
  tool: { name: sequence === 0 ? "flight-state-init" : "flight-state-successor-recorder", version: "1.0.0" },
});

const runnerInput = () => {
  const mode = { modeId: "reconnaissance", modeVersion: "1.0.0", seatId: "daisy", activationSource: "mission-brief" };
  return {
    runnerContractVersion: 1,
    projection: {
      runnerContractVersion: 1, journalSchemaVersion: 9, missionId: "mission:daisy-251", subjectId: "issue:251",
      revisionId: REVISION, evaluatedThroughSequence: 11, governanceState: "approved", missionAuthorizationState: "authorized",
      executionStatus: "running", executeReadiness: "ready", participantSeatIds: ["hill", "daisy", "fury"],
      activatedModes: [mode], effectRecords: [],
    },
    resolvedModeContext: { runnerContractVersion: 1, seatId: "daisy", modes: [mode] },
    actionAllowlist: ["action:feature-flight.daisy.reconnaissance"],
    plan: {
      runnerContractVersion: 1, cycleId: "cycle:flight-251:daisy:1", missionId: "mission:daisy-251", subjectId: "issue:251",
      revisionId: REVISION, evaluatedThroughSequence: 11, seatId: "daisy", activatedModes: [mode],
      actionId: "action:feature-flight.daisy.reconnaissance", effectClass: "coordination",
      effectKey: "effect:flight-251:daisy-recon", validationId: "validation:feature-flight.daisy-result-v1",
      stopCondition: "after_one_cycle",
    },
  };
};

const permission = (plan, outcome = "allow") => ({
  runnerContractVersion: 1, decisionId: "decision:flight-251:daisy:1", outcome,
  missionId: plan.missionId, subjectId: plan.subjectId, revisionId: plan.revisionId,
  evaluatedThroughSequence: plan.evaluatedThroughSequence, cycleId: plan.cycleId, seatId: plan.seatId,
  actionId: plan.actionId, effectClass: plan.effectClass, effectKey: plan.effectKey, reasonCode: "authorized",
  authorizationArtifact: { artifactSchemaVersion: 1, artifactId: "authority:flight-251:daisy", contentType: "application/json", payload: { source: "schema-9-replay" } },
});

const executor = (plan, overrides = {}) => ({
  runnerContractVersion: 1, outcome: "completed", missionId: plan.missionId, subjectId: plan.subjectId,
  revisionId: plan.revisionId, evaluatedThroughSequence: plan.evaluatedThroughSequence, cycleId: plan.cycleId,
  seatId: plan.seatId, actionId: plan.actionId, effectClass: plan.effectClass, effectKey: plan.effectKey,
  summary: "Daisy completed read-only coordination.", evidenceRefs: ["evidence:daisy:coordination"], ...overrides,
});

const validator = (plan, overrides = {}) => ({
  runnerContractVersion: 1, outcome: "passed", missionId: plan.missionId, subjectId: plan.subjectId,
  revisionId: plan.revisionId, evaluatedThroughSequence: plan.evaluatedThroughSequence, cycleId: plan.cycleId,
  validationId: plan.validationId, effectKey: plan.effectKey, summary: "Daisy result is structurally valid.", ...overrides,
});

const fixture = async (behaviors = {}) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-feature-flight-step-")));
  const repositoryRoot = join(parent, "repository");
  const worktree = join(repositoryRoot, "daisy-worktree");
  const artifactRoot = join(parent, "artifacts");
  const storeRoot = join(parent, "claim-store");
  await Promise.all([mkdir(worktree, { recursive: true }), mkdir(artifactRoot), mkdir(storeRoot, { mode: 0o700 })]);
  await chmod(storeRoot, 0o700);
  const plan = planFixture(repositoryRoot, worktree);
  const planPath = join(artifactRoot, "plan.json");
  const planBytes = fileBytes(plan);
  await writeFile(planPath, planBytes);
  const planIdentity = { path: planPath, bytes: planBytes.length, sha256: sha256(planBytes) };
  const predecessor = stateFixture(plan, planIdentity, "authorized", 0, null);
  const predecessorPath = join(artifactRoot, "state-0.json");
  const predecessorBytes = fileBytes(predecessor);
  await writeFile(predecessorPath, predecessorBytes);
  const current = stateFixture(plan, planIdentity, "active", 1, sha256(predecessorBytes));
  const statePath = join(artifactRoot, "state-1.json");
  const stateBytes = fileBytes(current);
  await writeFile(statePath, stateBytes);
  const input = {
    planPath, expectedPlanSha256: sha256(planBytes), statePath, expectedStateSha256: sha256(stateBytes), expectedStateSequence: 1,
    predecessorStatePath: predecessorPath, expectedPredecessorSha256: sha256(predecessorBytes), maxSteps: 1,
    routing: { flightId: plan.flightId, missionId: "mission:daisy-251" },
  };
  const calls = { load: 0, authorize: 0, invoke: 0, validate: 0, observe: 0, clock: 0 };
  const inputRunner = runnerInput();
  const times = ["2026-08-09T13:00:00.000Z", "2026-08-09T13:00:01.000Z"];
  const descriptor = Object.freeze({
    adapterId: "shield.daisy.readonly", adapterVersion: "1.0.0", capabilityClass: "read_only_coordination",
    runtimeId: "runtime:hosted-daisy", executorId: "executor:host-tools",
  });
  const clock = Object.freeze({ now: async () => times[Math.min(calls.clock++, times.length - 1)] });
  const dependencies = Object.freeze({
    async loadRunnerCycleInput(context) {
      calls.load += 1;
      return behaviors.load ? behaviors.load(context, inputRunner) : {
        input: inputRunner, canonicalBytes: Buffer.from(canonicalJson(inputRunner)), sha256: sha256(Buffer.from(canonicalJson(inputRunner))),
      };
    },
    async authorizeRunner(plan) { calls.authorize += 1; return behaviors.authorize ? behaviors.authorize(plan) : permission(plan); },
    async invokeDaisyAdapter(plan, decision, observedDescriptor) {
      calls.invoke += 1;
      assert.deepEqual(observedDescriptor, descriptor);
      return behaviors.invoke ? behaviors.invoke(plan, decision) : executor(plan);
    },
    async validateDaisyResult(plan, result) { calls.validate += 1; return behaviors.validate ? behaviors.validate(plan, result) : validator(plan); },
    async observeRepository(root) {
      calls.observe += 1;
      return behaviors.observe ? behaviors.observe(root, calls.observe) : { root: worktree, branch: "agent/daisy-251", head: REVISION, clean: true };
    },
    adapterDescriptor: descriptor,
    claimStoreRoot: storeRoot,
    clock,
  });
  return { parent, repositoryRoot, worktree, artifactRoot, storeRoot, plan, planIdentity, predecessor, current, input, dependencies, calls };
};

test("one authorized active Daisy cycle writes claim, successor, result and returns an exact terminal triad", async () => {
  const f = await fixture();
  const result = await runFeatureFlightStepV1(f.input, f.dependencies);
  assert.equal(FEATURE_FLIGHT_STEP_CONTRACT_VERSION, "1.0.0");
  assert.equal(result.outcome, "completed");
  assert.equal(result.invocationCount, 1);
  assert.deepEqual(f.calls, { load: 1, authorize: 1, invoke: 1, validate: 1, observe: 2, clock: 2 });
  assert.equal(result.terminal.effectContainment, "external_uncertain_repository_unchanged");
  assert.equal(result.terminal.gateEligible, false);
  const directory = join(f.storeRoot, "effects", result.effectClaimId);
  const [claim, successor, terminal] = await Promise.all([
    readFile(join(directory, "claim.json"), "utf8").then(JSON.parse),
    readFile(join(directory, "successor.json"), "utf8").then(JSON.parse),
    readFile(join(directory, "result.json"), "utf8").then(JSON.parse),
  ]);
  assert.deepEqual(validateFeatureFlightStepClaim(claim), []);
  assert.deepEqual(validateFeatureFlightStepSuccessor(f.plan, f.planIdentity, f.current, successor), []);
  assert.deepEqual(validateFeatureFlightStepResult(terminal), []);
  assert.equal(successor.sequence, 2);
  assert.equal(successor.missions["mission:daisy-251"].status, "complete");
  assert.equal(successor.lanes["lane-daisy"].activeMissionId, null);
});

test("exact retry replays the terminal triad without authorization, invocation, or writes", async () => {
  const f = await fixture();
  const first = await runFeatureFlightStepV1(f.input, f.dependencies);
  const before = { ...f.calls };
  const replay = await runFeatureFlightStepV1(f.input, f.dependencies);
  assert.equal(first.outcome, "completed");
  assert.equal(replay.outcome, "replayed");
  assert.equal(replay.invocationCount, 0);
  assert.equal(f.calls.load, before.load + 1);
  assert.equal(f.calls.observe, before.observe + 1);
  assert.equal(f.calls.authorize, before.authorize);
  assert.equal(f.calls.invoke, before.invoke);
  assert.equal(f.calls.validate, before.validate);
  assert.equal(f.calls.clock, before.clock);
});

test("alternate active state and later journal replay retain one invariant effect claim and cannot invoke twice", async () => {
  const f = await fixture();
  const first = await runFeatureFlightStepV1(f.input, f.dependencies);
  assert.equal(first.outcome, "completed");

  const alternate = structuredClone(f.current);
  alternate.sequence = 2;
  alternate.predecessorSha256 = f.input.expectedStateSha256;
  alternate.observedAt = "2026-08-09T12:30:00.000Z";
  const alternatePath = join(f.artifactRoot, "state-2-alternate-active.json");
  const alternateBytes = fileBytes(alternate);
  await writeFile(alternatePath, alternateBytes);
  const alternateInput = {
    ...f.input,
    statePath: alternatePath,
    expectedStateSha256: sha256(alternateBytes),
    expectedStateSequence: 2,
    predecessorStatePath: f.input.statePath,
    expectedPredecessorSha256: f.input.expectedStateSha256,
  };
  const stateConflict = await runFeatureFlightStepV1(alternateInput, f.dependencies);
  assert.equal(stateConflict.effectClaimId, first.effectClaimId);
  assert.equal(stateConflict.outcome, "recovery_required");
  assert.equal(f.calls.invoke, 1);

  const laterDependencies = Object.freeze({
    ...f.dependencies,
    async loadRunnerCycleInput(_context) {
      f.calls.load += 1;
      const changed = runnerInput();
      changed.projection.evaluatedThroughSequence = 12;
      changed.plan.evaluatedThroughSequence = 12;
      changed.plan.cycleId = "cycle:flight-251:daisy:2";
      const bytes = Buffer.from(canonicalJson(changed));
      return { input: changed, canonicalBytes: bytes, sha256: sha256(bytes) };
    },
  });
  const journalConflict = await runFeatureFlightStepV1(f.input, laterDependencies);
  assert.equal(journalConflict.effectClaimId, first.effectClaimId);
  assert.equal(journalConflict.outcome, "recovery_required");
  assert.equal(f.calls.invoke, 1);
});

test("simultaneous calls invoke Daisy at most once and the loser never returns ordinary stopped", async () => {
  let release;
  const entered = new Promise((resolveEntered) => { release = resolveEntered; });
  let first = true;
  const f = await fixture({
    invoke: async (plan) => {
      if (first) { first = false; await entered; }
      return executor(plan);
    },
  });
  const one = runFeatureFlightStepV1(f.input, f.dependencies);
  await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  const two = runFeatureFlightStepV1(f.input, f.dependencies);
  await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  release();
  const results = await Promise.all([one, two]);
  assert.equal(f.calls.invoke, 1);
  assert.ok(results.some((result) => result.outcome === "completed"));
  assert.ok(results.every((result) => result.outcome !== "stopped"));
  assert.ok(results.every((result) => ["completed", "recovery_required", "replayed"].includes(result.outcome)));
});

test("pre-claim Runner denial is stopped and creates no effect directory", async () => {
  const f = await fixture({ authorize: (plan) => permission(plan, "deny") });
  const result = await runFeatureFlightStepV1(f.input, f.dependencies);
  assert.equal(result.outcome, "stopped");
  assert.equal(result.invocationCount, 0);
  assert.deepEqual(f.calls, { load: 1, authorize: 1, invoke: 0, validate: 0, observe: 1, clock: 0 });
});

test("post-claim adapter failure leaves recovery-required evidence and no successor", async () => {
  const f = await fixture({ invoke: async () => { throw new Error("adapter failed"); } });
  const result = await runFeatureFlightStepV1(f.input, f.dependencies);
  assert.equal(result.outcome, "recovery_required");
  assert.equal(result.invocationCount, 1);
  const directory = join(f.storeRoot, "effects", result.effectClaimId);
  await readFile(join(directory, "claim.json"));
  await assert.rejects(readFile(join(directory, "successor.json")), /ENOENT/u);
});

test("wrong active identity, blocked peer, dependencies, adapter policy, and mutable dependencies fail before claim", async (t) => {
  await t.test("dirty repository", async () => {
    const f = await fixture({ observe: (root) => ({ root, branch: "agent/daisy-251", head: REVISION, clean: false }) });
    await assert.rejects(runFeatureFlightStepV1(f.input, f.dependencies), /before effects.*repository identity/u);
    assert.equal(f.calls.invoke, 0);
  });
  await t.test("non-Daisy Runner replay", async () => {
    const f = await fixture({
      load: (_context, value) => {
        const changed = structuredClone(value);
        changed.plan.seatId = "may";
        changed.resolvedModeContext.seatId = "may";
        changed.plan.activatedModes[0].seatId = "may";
        changed.resolvedModeContext.modes[0].seatId = "may";
        changed.projection.activatedModes[0].seatId = "may";
        const bytes = Buffer.from(canonicalJson(changed));
        return { input: changed, canonicalBytes: bytes, sha256: sha256(bytes) };
      },
    });
    await assert.rejects(runFeatureFlightStepV1(f.input, f.dependencies), /fixed active Daisy policy/u);
    assert.equal(f.calls.invoke, 0);
  });
  await t.test("mutable dependency envelope", async () => {
    const f = await fixture();
    const mutable = { ...f.dependencies };
    await assert.rejects(runFeatureFlightStepV1(f.input, mutable), /must be frozen/u);
    assert.equal(f.calls.load, 0);
  });
  await t.test("wrong adapter", async () => {
    const f = await fixture();
    const wrong = Object.freeze({ ...f.dependencies, adapterDescriptor: Object.freeze({ ...f.dependencies.adapterDescriptor, adapterId: "other" }) });
    await assert.rejects(runFeatureFlightStepV1(f.input, wrong), /fixed Slice 2 policy/u);
    assert.equal(f.calls.load, 0);
  });
});

test("successor builder allows only the legal active-to-complete edge", async () => {
  const f = await fixture();
  const successor = buildActiveToCompleteSuccessor(
    f.plan, f.planIdentity, f.current,
    { path: f.input.statePath, bytes: fileBytes(f.current).length, sha256: f.input.expectedStateSha256 },
    "mission:daisy-251", "2026-08-09T13:00:01.000Z",
  );
  assert.deepEqual(validateFlightState(f.plan, f.planIdentity, successor), []);
  assert.deepEqual(validateImmediateTransition(f.plan, f.current, successor), []);
  await assert.rejects(async () => buildActiveToCompleteSuccessor(
    f.plan, f.planIdentity, f.predecessor,
    { path: f.input.predecessorStatePath, bytes: 1, sha256: f.input.expectedPredecessorSha256 },
    "mission:daisy-251", "2026-08-09T13:00:01.000Z",
  ), /must currently be active/u);
});
