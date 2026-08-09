import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
import * as productionStepStore from "../scripts/operations/feature-flight-step-store.mjs";

const REVISION = "4".repeat(40);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalValue = (value) => Array.isArray(value) ? value.map(canonicalValue)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
    : value;
const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
const fileBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const persistedBytes = (value) => Buffer.from(`${JSON.stringify(canonicalValue(value), null, 2)}\n`, "utf8");
const artifactIdentityFor = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });

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

const stateFixture = (plan, planIdentity, status, sequence, predecessorSha256, peerStatus = "planned") => ({
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
  wave: { current: plan.missions.find((mission) => mission.id === "mission:daisy-251").activationWave },
  lanes: Object.fromEntries(plan.lanes.map((lane) => [lane.id, {
    activeMissionId: lane.id === "lane-daisy" && status === "active" ? "mission:daisy-251" : null,
  }])),
  missions: Object.fromEntries(plan.missions.map((mission) => {
    const missionStatus = mission.id === "mission:daisy-251" ? status : peerStatus;
    return [mission.id, {
      lane: mission.lane, activationWave: mission.activationWave, status: missionStatus,
      revision: missionStatus === "planned" ? null : REVISION, authorityEvidence: null,
    }];
  })),
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
  const peerWorktree = join(repositoryRoot, "peer-worktree");
  const artifactRoot = join(parent, "artifacts");
  const storeRoot = join(parent, "claim-store");
  await Promise.all([mkdir(worktree, { recursive: true }), mkdir(peerWorktree, { recursive: true }), mkdir(artifactRoot), mkdir(storeRoot, { mode: 0o700 })]);
  await chmod(storeRoot, 0o700);
  const plan = planFixture(repositoryRoot, worktree);
  if (behaviors.peerStatus !== undefined || behaviors.selectedDependsOn === true) {
    plan.lanes.push({ id: "lane-peer", chatLabel: "Peer chat", teamLabel: "Peer team" });
    plan.missions.push({
      id: "mission:peer-251", slug: "mission-peer-251", title: "Peer mission", library: "peer",
      lane: "lane-peer", branch: "agent/peer-251", worktree: peerWorktree, activationWave: 1, dependsOn: [],
      writablePaths: ["packages/peer/**"], scope: "Peer scope.", deliverables: ["Peer output"], dependencyLevel: 0,
      initialEligibility: "eligible-after-independent-authorization", constructionStatus: "planned-not-created", authorityStatus: "not-initialized",
    });
    if (behaviors.selectedDependsOn === true) {
      Object.assign(plan.missions[0], {
        activationWave: 2, dependsOn: ["mission:peer-251"], dependencyLevel: 1, initialEligibility: "blocked-by-dependencies",
      });
    }
  }
  const planPath = join(artifactRoot, "plan.json");
  const planBytes = fileBytes(plan);
  await writeFile(planPath, planBytes);
  const planIdentity = { path: planPath, bytes: planBytes.length, sha256: sha256(planBytes) };
  const peerStatus = behaviors.selectedDependsOn === true ? "integrated" : "planned";
  const predecessor = stateFixture(plan, planIdentity, "authorized", 0, null, peerStatus);
  const predecessorPath = join(artifactRoot, "state-0.json");
  const predecessorBytes = fileBytes(predecessor);
  await writeFile(predecessorPath, predecessorBytes);
  const current = stateFixture(plan, planIdentity, "active", 1, sha256(predecessorBytes), behaviors.peerStatus ?? peerStatus);
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
  return { parent, repositoryRoot, worktree, peerWorktree, artifactRoot, storeRoot, plan, planIdentity, predecessor, current, input, dependencies, calls };
};

const withDependencies = (fixtureRecord, overrides) => Object.freeze({ ...fixtureRecord.dependencies, ...overrides });

const rewriteCanonical = async (path, mutate) => {
  const value = JSON.parse(await readFile(path, "utf8"));
  mutate(value);
  const bytes = persistedBytes(value);
  await writeFile(path, bytes);
  return { value, bytes, identity: artifactIdentityFor(path, bytes) };
};

const frozenStore = (overrides = {}) => Object.freeze({
  claimStep: productionStepStore.claimStep,
  readStep: productionStepStore.readStep,
  writeSuccessor: productionStepStore.writeSuccessor,
  writeResult: productionStepStore.writeResult,
  ...overrides,
});

const replaceDirectory = async (path) => {
  await rename(path, `${path}.retained-original`);
  await mkdir(path, { mode: 0o700 });
  await chmod(path, 0o700);
};

const transplantClaimParent = async (identity, kind) => {
  if (kind === "root") {
    const retainedRoot = `${identity.root.path}.retained-parent`;
    await rename(identity.root.path, retainedRoot);
    await mkdir(identity.root.path, { mode: 0o700 });
    await rename(join(retainedRoot, "effects"), identity.effects.path);
    return;
  }
  const retainedEffects = `${identity.effects.path}.retained-parent`;
  await rename(identity.effects.path, retainedEffects);
  await mkdir(identity.effects.path, { mode: 0o700 });
  await rename(join(retainedEffects, identity.effect.path.slice(identity.effects.path.length + 1)), identity.effect.path);
};

const wrappedHandle = (handle, overrides = {}) => ({
  stat: (...args) => handle.stat(...args),
  write: (...args) => handle.write(...args),
  sync: (...args) => handle.sync(...args),
  close: (...args) => handle.close(...args),
  readFile: (...args) => handle.readFile(...args),
  ...overrides,
});

const attemptDigestForClaim = (claim) => sha256(Buffer.from(canonicalJson({
  plan: claim.plan,
  currentState: claim.currentState,
  predecessor: claim.predecessor,
  sequence: claim.flight.sequence,
  runnerInputSha256: claim.runner.inputSha256,
  journalSequence: claim.runner.evaluatedThroughSequence,
  cycleId: claim.runner.cycleId,
  validationId: claim.runner.validationId,
  repository: claim.repository,
  adapter: claim.adapter,
  claimedAt: claim.claimedAt,
})));

const authoritativeRunnerEffect = (outcome) => ({
  runnerContractVersion: 1,
  cycleId: "cycle:recorded-251",
  subjectId: "issue:251",
  revisionId: REVISION,
  evaluatedThroughSequence: 10,
  seatId: "daisy",
  actionId: "action:feature-flight.daisy.reconnaissance",
  effectClass: "coordination",
  effectKey: "effect:flight-251:daisy-recon",
  authorizationDecisionId: "decision:recorded-251",
  outcome,
  reasonCode: outcome === "completed" ? "effect_completed" : "executor_uncertain",
  summary: "Previously recorded Daisy effect.",
  evidenceRefs: ["evidence:recorded-251"],
  entryId: "entry:mission:daisy-251:11",
  missionId: "mission:daisy-251",
  journalSequence: 11,
  timestamp: { value: "2026-08-09T11:00:00.000Z", provenance: "hostTrusted" },
});

const runnerMutation = (mutate) => (_context, value) => {
  const changed = structuredClone(value);
  mutate(changed);
  const bytes = Buffer.from(canonicalJson(changed));
  return { input: changed, canonicalBytes: bytes, sha256: sha256(bytes) };
};

const assertEffectsAbsent = async (f) => assert.rejects(lstat(join(f.storeRoot, "effects")), /ENOENT/u);

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
  const storeCalls = { claim: 0, read: 0, successor: 0, result: 0 };
  const store = frozenStore({
    claimStep: async (input) => { storeCalls.claim += 1; return productionStepStore.claimStep(input); },
    readStep: async (input) => { storeCalls.read += 1; return productionStepStore.readStep(input); },
    writeSuccessor: async (input) => { storeCalls.successor += 1; return productionStepStore.writeSuccessor(input); },
    writeResult: async (input) => { storeCalls.result += 1; return productionStepStore.writeResult(input); },
  });
  const dependencies = withDependencies(f, { stepStore: store });
  const first = await runFeatureFlightStepV1(f.input, dependencies);
  const before = { ...f.calls };
  const storeBefore = { ...storeCalls };
  const replay = await runFeatureFlightStepV1(f.input, dependencies);
  assert.equal(first.outcome, "completed");
  assert.equal(replay.outcome, "replayed");
  assert.equal(replay.invocationCount, 0);
  assert.equal(f.calls.load, before.load + 1);
  assert.equal(f.calls.observe, before.observe + 1);
  assert.equal(f.calls.authorize, before.authorize);
  assert.equal(f.calls.invoke, before.invoke);
  assert.equal(f.calls.validate, before.validate);
  assert.equal(f.calls.clock, before.clock);
  assert.deepEqual(storeCalls, { ...storeBefore, read: storeBefore.read + 1 });
});

test("terminal replay rejects canonical substitutions in every independently bound domain", async (t) => {
  const cases = [
    ["attempt evidence timestamp", async ({ claimPath, resultPath }) => {
      const claim = await rewriteCanonical(claimPath, (value) => { value.claimedAt = "2026-08-09T13:00:00.500Z"; });
      await rewriteCanonical(resultPath, (value) => { value.claim = claim.identity; value.claimedAt = claim.value.claimedAt; });
    }],
    ["Runner mission identity", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      const missionId = "mission:substituted-251";
      value.runnerResult.missionId = missionId;
      value.runnerResult.effectRecordCandidate.missionId = missionId;
      value.runnerResultSha256 = sha256(Buffer.from(canonicalJson(value.runnerResult)));
    })],
    ["Runner subject identity", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.runnerResult.subjectId = "issue:substituted-251";
      value.runnerResult.effectRecordCandidate.subjectId = "issue:substituted-251";
      value.runnerResult.effectRecordCandidate.payload.subjectId = "issue:substituted-251";
      value.runnerResultSha256 = sha256(Buffer.from(canonicalJson(value.runnerResult)));
    })],
    ["Runner revision identity", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.runnerResult.revisionId = "6".repeat(40);
      value.runnerResult.effectRecordCandidate.revisionId = "6".repeat(40);
      value.runnerResult.effectRecordCandidate.payload.revisionId = "6".repeat(40);
      value.runnerResultSha256 = sha256(Buffer.from(canonicalJson(value.runnerResult)));
    })],
    ["Runner journal sequence", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.runnerResult.evaluatedThroughSequence = 12;
      value.runnerResult.effectRecordCandidate.expectedPreviousSequence = 12;
      value.runnerResult.effectRecordCandidate.intendedJournalSequence = 13;
      value.runnerResult.effectRecordCandidate.payload.evaluatedThroughSequence = 12;
      value.runnerResultSha256 = sha256(Buffer.from(canonicalJson(value.runnerResult)));
    })],
    ["Runner cycle identity", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.runnerResult.cycleId = "cycle:substituted-251";
      value.runnerResult.effectRecordCandidate.payload.cycleId = "cycle:substituted-251";
      value.runnerResultSha256 = sha256(Buffer.from(canonicalJson(value.runnerResult)));
    })],
    ["Runner action identity", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.runnerResult.actionId = "action:substituted-251";
      value.runnerResult.effectRecordCandidate.payload.actionId = "action:substituted-251";
      value.runnerResultSha256 = sha256(Buffer.from(canonicalJson(value.runnerResult)));
    })],
    ["Runner effect key", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.runnerResult.effectKey = "effect:substituted-251";
      value.runnerResult.effectRecordCandidate.payload.effectKey = "effect:substituted-251";
      value.runnerResultSha256 = sha256(Buffer.from(canonicalJson(value.runnerResult)));
    })],
    ["Runner seat attribution", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.runnerResult.effectRecordCandidate.payload.seatId = "may";
      value.runnerResultSha256 = sha256(Buffer.from(canonicalJson(value.runnerResult)));
    })],
    ["Runner effect class", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.runnerResult.effectRecordCandidate.payload.effectClass = "verification";
      value.runnerResultSha256 = sha256(Buffer.from(canonicalJson(value.runnerResult)));
    })],
    ["result flight", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => { value.flightId = "mission:other-flight"; })],
    ["repository pair", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.repositoryBefore.branch = "agent/substituted";
      value.repositoryAfter.branch = "agent/substituted";
    })],
    ["repository before only", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.repositoryBefore.branch = "agent/substituted-before";
    })],
    ["repository after only", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.repositoryAfter.branch = "agent/substituted-after";
    })],
    ["result adapter", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => { value.adapter.runtimeId = "runtime:substituted"; })],
    ["completion timestamp", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.completedAt = "2026-08-09T13:00:02.000Z";
    })],
    ["successor observation", async ({ successorPath, resultPath }) => {
      const successor = await rewriteCanonical(successorPath, (value) => { value.observedAt = "2026-08-09T13:00:02.000Z"; });
      await rewriteCanonical(resultPath, (value) => { value.successor = successor.identity; });
    }],
    ["claim validation identity with recomputed attempt digest", async ({ claimPath, resultPath }) => {
      const claim = await rewriteCanonical(claimPath, (value) => {
        value.runner.validationId = "validation:substituted";
        value.attemptDigest = attemptDigestForClaim(value);
      });
      await rewriteCanonical(resultPath, (value) => {
        value.claim = claim.identity;
        value.attemptDigest = claim.value.attemptDigest;
      });
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const f = await fixture();
      const completed = await runFeatureFlightStepV1(f.input, f.dependencies);
      const directory = join(f.storeRoot, "effects", completed.effectClaimId);
      await mutate({
        claimPath: join(directory, "claim.json"),
        successorPath: join(directory, "successor.json"),
        resultPath: join(directory, "result.json"),
      });
      const replay = await runFeatureFlightStepV1(f.input, f.dependencies);
      assert.equal(replay.outcome, "recovery_required");
      assert.equal(replay.reason, "terminal_triad_conflict");
      assert.equal(f.calls.invoke, 1);
    });
  }
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

test("directory replacement at claim readback, writes, or retained triad hierarchy never reports success", async (t) => {
  for (const phase of ["claim-readback", "successor-write", "result-write", "final-read", "final-effects", "final-root"]) {
    await t.test(phase, async () => {
      const f = await fixture();
      let replaced = false;
      const replaceOnce = async (path) => {
        if (replaced) return;
        replaced = true;
        await replaceDirectory(path);
      };
      const store = phase === "claim-readback" ? frozenStore({
        claimStep: (input) => productionStepStore.claimStep(input, {
          lstat: async (path) => {
            if (path.endsWith("/claim.json")) await replaceOnce(dirname(path));
            return lstat(path);
          },
        }),
      }) : phase === "successor-write" ? frozenStore({
        writeSuccessor: async (input) => {
          await replaceOnce(input.expectedHierarchyIdentity.effect.path);
          return productionStepStore.writeSuccessor(input);
        },
      }) : phase === "result-write" ? frozenStore({
        writeResult: async (input) => {
          await replaceOnce(input.expectedHierarchyIdentity.effect.path);
          return productionStepStore.writeResult(input);
        },
      }) : frozenStore({
        readStep: async (input) => {
          if (input.expectedHierarchyIdentity !== undefined) {
            const target = phase === "final-root" ? f.storeRoot
              : phase === "final-effects" ? join(f.storeRoot, "effects")
                : input.expectedHierarchyIdentity.effect.path;
            await replaceOnce(target);
          }
          return productionStepStore.readStep(input);
        },
      });
      const result = await runFeatureFlightStepV1(f.input, withDependencies(f, { stepStore: store }));
      assert.equal(result.outcome, "recovery_required");
      assert.equal(replaced, true);
      assert.equal(f.calls.invoke, phase === "claim-readback" ? 0 : 1);
    });
  }
});

test("claim hierarchy identity detects root and effects parent transplants at every post-claim boundary", async (t) => {
  for (const parentKind of ["root", "effects"]) {
    for (const phase of ["successor", "result", "final-read"]) {
      await t.test(`${parentKind} transplant before ${phase}`, async () => {
        const f = await fixture();
        let transplanted = false;
        const transplantOnce = async (identity) => {
          if (transplanted) return;
          transplanted = true;
          await transplantClaimParent(identity, parentKind);
        };
        const store = phase === "successor" ? frozenStore({
          writeSuccessor: async (input) => {
            await transplantOnce(input.expectedHierarchyIdentity);
            return productionStepStore.writeSuccessor(input);
          },
        }) : phase === "result" ? frozenStore({
          writeResult: async (input) => {
            await transplantOnce(input.expectedHierarchyIdentity);
            return productionStepStore.writeResult(input);
          },
        }) : frozenStore({
          readStep: async (input) => {
            if (input.expectedHierarchyIdentity !== undefined) await transplantOnce(input.expectedHierarchyIdentity);
            return productionStepStore.readStep(input);
          },
        });
        const result = await runFeatureFlightStepV1(f.input, withDependencies(f, { stepStore: store }));
        assert.equal(result.outcome, "recovery_required");
        assert.equal(result.reason, phase === "successor" ? "successor_write_uncertain"
          : phase === "result" ? "result_write_uncertain" : "final_readback_uncertain");
        assert.equal(f.calls.invoke, 1);
        assert.equal(transplanted, true);
        const effectPath = join(f.storeRoot, "effects", result.effectClaimId);
        if (phase === "successor") {
          await assert.rejects(readFile(join(effectPath, "successor.json")), /ENOENT/u);
          await assert.rejects(readFile(join(effectPath, "result.json")), /ENOENT/u);
        } else if (phase === "result") {
          await readFile(join(effectPath, "successor.json"));
          await assert.rejects(readFile(join(effectPath, "result.json")), /ENOENT/u);
        } else {
          await Promise.all([readFile(join(effectPath, "successor.json")), readFile(join(effectPath, "result.json"))]);
        }
      });
    }
  }
});

test("claim boundary rereads post-mkdir and invocation-claim failures as recovery-required", async (t) => {
  await t.test("post-mkdir claim open failure", async () => {
    const f = await fixture();
    const store = frozenStore({
      claimStep: (input) => productionStepStore.claimStep(input, {
        open: async (path, flags, mode) => {
          if (path.endsWith("/claim.json") && (flags & fsConstants.O_WRONLY) !== 0) throw new Error("injected claim open failure");
          return open(path, flags, mode);
        },
      }),
    });
    const result = await runFeatureFlightStepV1(f.input, withDependencies(f, { stepStore: store }));
    assert.equal(result.outcome, "recovery_required");
    assert.equal(result.reason, "incomplete_step");
    assert.equal(result.storeStatus, "malformed");
    assert.equal(f.calls.invoke, 0);
    const effects = await lstat(join(f.storeRoot, "effects"));
    assert.equal(effects.isDirectory(), true);
    const directory = join(f.storeRoot, "effects", result.effectClaimId);
    await assert.rejects(readFile(join(directory, "successor.json")), /ENOENT/u);
    await assert.rejects(readFile(join(directory, "result.json")), /ENOENT/u);
  });
  for (const outcome of ["throw", "conflict"]) {
    await t.test(`invocation claim ${outcome}`, async () => {
      const f = await fixture();
      const store = frozenStore({
        claimStep: outcome === "throw" ? async () => { throw new Error("claim failed"); }
          : async () => ({ status: "exists", step: { status: "claimed" } }),
      });
      const result = await runFeatureFlightStepV1(f.input, withDependencies(f, { stepStore: store }));
      assert.equal(result.outcome, "recovery_required");
      assert.equal(result.reason, "claim_boundary_uncertain");
      assert.notEqual(result.outcome, "stopped");
      assert.equal(f.calls.invoke, 0);
      await assertEffectsAbsent(f);
    });
  }
  await t.test("invocation claim clock failure", async () => {
    const f = await fixture();
    const clock = Object.freeze({ now: async () => { throw new Error("clock failed"); } });
    const result = await runFeatureFlightStepV1(f.input, withDependencies(f, { clock }));
    assert.equal(result.outcome, "recovery_required");
    assert.equal(result.reason, "claim_boundary_uncertain");
    assert.notEqual(result.outcome, "stopped");
    assert.equal(f.calls.invoke, 0);
    await assertEffectsAbsent(f);
  });
});

test("partial write, sync, close, and directory durability faults never invoke or report a claim", async (t) => {
  const cases = [
    ["partial-write", (handle) => wrappedHandle(handle, { write: async (bytes) => ({ bytesWritten: bytes.length - 1 }) })],
    ["file-sync", (handle) => wrappedHandle(handle, { sync: async () => { throw new Error("injected file sync failure"); } })],
    ["file-close", (handle) => {
      let failed = false;
      return wrappedHandle(handle, { close: async () => {
        if (!failed) { failed = true; throw new Error("injected file close failure"); }
        return handle.close();
      } });
    }],
  ];
  for (const [name, wrap] of cases) {
    await t.test(name, async () => {
      const f = await fixture();
      const store = frozenStore({
        claimStep: (input) => productionStepStore.claimStep(input, {
          open: async (path, flags, mode) => {
            const handle = await open(path, flags, mode);
            return path.endsWith("/claim.json") && (flags & fsConstants.O_WRONLY) !== 0 ? wrap(handle) : handle;
          },
        }),
      });
      const result = await runFeatureFlightStepV1(f.input, withDependencies(f, { stepStore: store }));
      assert.equal(result.outcome, "recovery_required");
      assert.equal(f.calls.invoke, 0);
    });
  }
  await t.test("effects directory sync", async () => {
    const f = await fixture();
    const store = frozenStore({
      claimStep: (input) => productionStepStore.claimStep(input, {
        open: async (path, flags, mode) => {
          const handle = await open(path, flags, mode);
          return path.endsWith("/effects") ? wrappedHandle(handle, { sync: async () => { throw new Error("injected directory sync failure"); } }) : handle;
        },
      }),
    });
    const result = await runFeatureFlightStepV1(f.input, withDependencies(f, { stepStore: store }));
    assert.equal(result.outcome, "recovery_required");
    assert.equal(f.calls.invoke, 0);
  });
});

test("successor and result partial-write, sync, close, and parent-durability faults never report success", async (t) => {
  for (const artifact of ["successor", "result"]) {
    for (const fault of ["partial-write", "file-sync", "file-close", "directory-sync"]) {
      await t.test(`${artifact} ${fault}`, async () => {
        const f = await fixture();
        const filename = `${artifact}.json`;
        const writeWithFault = (input) => {
          const effectDirectory = input.expectedHierarchyIdentity.effect.path;
          return productionStepStore[artifact === "successor" ? "writeSuccessor" : "writeResult"](input, {
            open: async (path, flags, mode) => {
              const handle = await open(path, flags, mode);
              if (fault === "directory-sync" && path === effectDirectory) {
                return wrappedHandle(handle, { sync: async () => { throw new Error("injected directory durability failure"); } });
              }
              if (!path.endsWith(`/${filename}`) || (flags & fsConstants.O_WRONLY) === 0) return handle;
              if (fault === "partial-write") return wrappedHandle(handle, { write: async (bytes) => ({ bytesWritten: bytes.length - 1 }) });
              if (fault === "file-sync") return wrappedHandle(handle, { sync: async () => { throw new Error("injected file sync failure"); } });
              if (fault === "file-close") {
                let failed = false;
                return wrappedHandle(handle, { close: async () => {
                  if (!failed) { failed = true; throw new Error("injected file close failure"); }
                  return handle.close();
                } });
              }
              return handle;
            },
          });
        };
        const store = artifact === "successor" ? frozenStore({ writeSuccessor: writeWithFault })
          : frozenStore({ writeResult: writeWithFault });
        const dependencies = withDependencies(f, { stepStore: store });
        const first = await runFeatureFlightStepV1(f.input, dependencies);
        assert.equal(first.outcome, "recovery_required");
        assert.equal(first.reason, artifact === "successor" ? "successor_write_uncertain" : "result_write_uncertain");
        assert.equal(f.calls.invoke, 1);
        const retry = await runFeatureFlightStepV1(f.input, dependencies);
        const completeResultWasWritten = artifact === "result" && fault !== "partial-write";
        assert.equal(retry.outcome, completeResultWasWritten ? "replayed" : "recovery_required");
        assert.equal(f.calls.invoke, 1);
      });
    }
  }
});

test("pre-claim Runner denial is stopped and creates no effect directory", async () => {
  const f = await fixture({ authorize: (plan) => permission(plan, "deny") });
  const result = await runFeatureFlightStepV1(f.input, f.dependencies);
  assert.equal(result.outcome, "stopped");
  assert.equal(result.invocationCount, 0);
  assert.deepEqual(f.calls, { load: 1, authorize: 1, invoke: 0, validate: 0, observe: 1, clock: 0 });
});

test("stale and malformed trusted Runner replay is rejected before callbacks and artifacts", async (t) => {
  const cases = [
    ["stale digest", (_context, value) => {
      const bytes = Buffer.from(canonicalJson(value));
      return { input: value, canonicalBytes: bytes, sha256: "0".repeat(64) };
    }],
    ["malformed input", (_context, value) => {
      const changed = structuredClone(value);
      delete changed.plan.validationId;
      const bytes = Buffer.from(canonicalJson(changed));
      return { input: changed, canonicalBytes: bytes, sha256: sha256(bytes) };
    }],
    ["noncanonical bytes", (_context, value) => {
      const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
      return { input: value, canonicalBytes: bytes, sha256: sha256(bytes) };
    }],
  ];
  for (const [name, load] of cases) {
    await t.test(name, async () => {
      const f = await fixture({ load });
      await assert.rejects(runFeatureFlightStepV1(f.input, f.dependencies), /before effects/u);
      assert.deepEqual(f.calls, { load: 1, authorize: 0, invoke: 0, validate: 0, observe: 0, clock: 0 });
      await assertEffectsAbsent(f);
    });
  }
});

test("every reachable pre-claim Runner stop classification remains stopped without an effect", async (t) => {
  const cases = [
    ["governance_not_approved", { load: runnerMutation((value) => { value.projection.governanceState = "proposed"; }) }],
    ["mission_not_authorized", { load: runnerMutation((value) => { value.projection.missionAuthorizationState = "waiting"; }) }],
    ["execution_not_active", { load: runnerMutation((value) => { value.projection.executionStatus = "not-started"; }) }],
    ["execute_not_ready", { load: runnerMutation((value) => { value.projection.executeReadiness = "blocked"; }) }],
    ["mode_context_mismatch", { load: runnerMutation((value) => {
      value.resolvedModeContext.modes = [{ ...value.resolvedModeContext.modes[0], modeId: "delivery" }];
    }) }],
    ["effect_already_completed", { load: runnerMutation((value) => { value.projection.effectRecords = [authoritativeRunnerEffect("completed")]; }) }],
    ["effect_outcome_uncertain", { load: runnerMutation((value) => { value.projection.effectRecords = [authoritativeRunnerEffect("uncertain")]; }) }],
    ["authorization_failed", { authorize: async () => { throw new Error("authorization unavailable"); } }],
    ["authorization_malformed", { authorize: () => ({}) }],
    ["authorization_stale", { authorize: (plan) => ({ ...permission(plan, "allow"), cycleId: "cycle:stale-251" }) }],
    ["authorization_wait", { authorize: (plan) => permission(plan, "wait") }],
    ["authorization_denied", { authorize: (plan) => permission(plan, "deny") }],
  ];
  for (const [reason, behavior] of cases) {
    await t.test(reason, async () => {
      const f = await fixture(behavior);
      const result = await runFeatureFlightStepV1(f.input, f.dependencies);
      assert.equal(result.outcome, "stopped");
      assert.equal(result.runnerResult.reason, reason);
      assert.equal(result.invocationCount, 0);
      assert.equal(f.calls.invoke, 0);
      assert.equal(f.calls.validate, 0);
      assert.equal(f.calls.authorize, reason.startsWith("authorization_") ? 1 : 0);
      assert.equal(f.calls.load, 1);
      assert.equal(f.calls.observe, 1);
      assert.equal(f.calls.clock, 0);
      await assertEffectsAbsent(f);
    });
  }
});

test("every reachable post-claim Runner stop is recovery-required and cannot invoke on retry", async (t) => {
  const cases = [
    ["executor throw", { invoke: async () => { throw new Error("executor failed"); } }, 0],
    ["executor failed", { invoke: (plan) => executor(plan, { outcome: "failed" }) }, 0],
    ["executor uncertain", { invoke: (plan) => executor(plan, { outcome: "uncertain" }) }, 0],
    ["executor malformed", { invoke: () => ({}) }, 0],
    ["executor identity", { invoke: (plan) => executor(plan, { missionId: "mission:other-251" }) }, 0],
    ["validator throw", { validate: async () => { throw new Error("validator failed"); } }, 1],
    ["validator failed", { validate: (plan) => validator(plan, { outcome: "failed" }) }, 1],
    ["validator malformed", { validate: () => ({}) }, 1],
    ["validator identity", { validate: (plan) => validator(plan, { effectKey: "effect:other-251" }) }, 1],
  ];
  for (const [name, behavior, validatorCalls] of cases) {
    await t.test(name, async () => {
      const f = await fixture(behavior);
      const first = await runFeatureFlightStepV1(f.input, f.dependencies);
      assert.equal(first.outcome, "recovery_required");
      assert.equal(first.reason, "incomplete_step");
      assert.equal(first.storeStatus, "claimed");
      assert.equal(f.calls.invoke, 1);
      assert.equal(f.calls.validate, validatorCalls);
      const directory = join(f.storeRoot, "effects", first.effectClaimId);
      await readFile(join(directory, "claim.json"));
      await assert.rejects(readFile(join(directory, "successor.json")), /ENOENT/u);
      await assert.rejects(readFile(join(directory, "result.json")), /ENOENT/u);
      const retry = await runFeatureFlightStepV1(f.input, f.dependencies);
      assert.equal(retry.outcome, "recovery_required");
      assert.equal(retry.reason, "incomplete_step");
      assert.equal(f.calls.invoke, 1);
    });
  }
});

test("post-claim adapter failure leaves recovery-required evidence and no successor", async () => {
  const f = await fixture({ invoke: async () => { throw new Error("adapter failed"); } });
  const result = await runFeatureFlightStepV1(f.input, f.dependencies);
  assert.equal(result.outcome, "recovery_required");
  assert.equal(result.invocationCount, 1);
  const directory = join(f.storeRoot, "effects", result.effectClaimId);
  await readFile(join(directory, "claim.json"));
  await assert.rejects(readFile(join(directory, "successor.json")), /ENOENT/u);
  await assert.rejects(readFile(join(directory, "result.json")), /ENOENT/u);
  const retry = await runFeatureFlightStepV1(f.input, f.dependencies);
  assert.equal(retry.outcome, "recovery_required");
  assert.equal(retry.reason, "incomplete_step");
  assert.equal(retry.storeStatus, "claimed");
  assert.equal(f.calls.invoke, 1);
});

test("partial-artifact replay never performs a second invocation", async (t) => {
  await t.test("successor only", async () => {
    const f = await fixture();
    let failResult = true;
    const store = frozenStore({ writeResult: async (input) => {
      if (failResult) { failResult = false; throw new Error("result write unavailable"); }
      return productionStepStore.writeResult(input);
    } });
    const dependencies = withDependencies(f, { stepStore: store });
    const first = await runFeatureFlightStepV1(f.input, dependencies);
    assert.equal(first.outcome, "recovery_required");
    assert.equal(first.reason, "result_write_uncertain");
    const directory = join(f.storeRoot, "effects", first.effectClaimId);
    await Promise.all([readFile(join(directory, "claim.json")), readFile(join(directory, "successor.json"))]);
    await assert.rejects(readFile(join(directory, "result.json")), /ENOENT/u);
    const retry = await runFeatureFlightStepV1(f.input, dependencies);
    assert.equal(retry.outcome, "recovery_required");
    assert.equal(retry.reason, "incomplete_step");
    assert.equal(retry.storeStatus, "successor_only");
    assert.equal(f.calls.invoke, 1);
  });
  await t.test("result without successor", async () => {
    const f = await fixture();
    const completed = await runFeatureFlightStepV1(f.input, f.dependencies);
    const successorPath = join(f.storeRoot, "effects", completed.effectClaimId, "successor.json");
    await rename(successorPath, `${successorPath}.retained`);
    const retry = await runFeatureFlightStepV1(f.input, f.dependencies);
    assert.equal(retry.outcome, "recovery_required");
    assert.equal(retry.reason, "incomplete_step");
    assert.equal(retry.storeStatus, "malformed");
    assert.equal(f.calls.invoke, 1);
  });
});

test("a completed step cannot be replayed through a caller-selected alternate parent", async () => {
  const f = await fixture();
  const completed = await runFeatureFlightStepV1(f.input, f.dependencies);
  assert.equal(completed.outcome, "completed");
  await assert.rejects(runFeatureFlightStepV1({
    ...f.input, claimStoreRoot: join(f.parent, "alternate-parent"),
  }, f.dependencies), /rejected before effects/u);
  assert.equal(f.calls.invoke, 1);
  assert.equal(f.calls.authorize, 1);
});

test("malformed and noncanonical persisted artifacts fail replay closed without reinvocation", async (t) => {
  const cases = [
    ["malformed JSON", async (path) => writeFile(path, "{") , "store_unavailable"],
    ["noncanonical bytes", async (path) => {
      const value = JSON.parse(await readFile(path, "utf8"));
      await writeFile(path, JSON.stringify(value));
    }, "store_unavailable"],
    ["canonical unknown field", async (path) => rewriteCanonical(path, (value) => { value.surprise = true; }), "terminal_triad_conflict"],
  ];
  for (const [name, mutate, reason] of cases) {
    await t.test(name, async () => {
      const f = await fixture();
      const completed = await runFeatureFlightStepV1(f.input, f.dependencies);
      const claimPath = join(f.storeRoot, "effects", completed.effectClaimId, "claim.json");
      await mutate(claimPath);
      const replay = await runFeatureFlightStepV1(f.input, f.dependencies);
      assert.equal(replay.outcome, "recovery_required");
      assert.equal(replay.reason, reason);
      assert.equal(f.calls.invoke, 1);
    });
  }
});

test("final triad readback faults return recovery and a later exact retry only replays", async () => {
  const f = await fixture();
  const store = frozenStore({ readStep: async (input) => {
    if (input.expectedHierarchyIdentity !== undefined) throw new Error("injected final readback fault");
    return productionStepStore.readStep(input);
  } });
  const first = await runFeatureFlightStepV1(f.input, withDependencies(f, { stepStore: store }));
  assert.equal(first.outcome, "recovery_required");
  assert.equal(first.reason, "final_readback_uncertain");
  assert.equal(f.calls.invoke, 1);
  const directory = join(f.storeRoot, "effects", first.effectClaimId);
  await Promise.all(["claim.json", "successor.json", "result.json"].map((name) => readFile(join(directory, name))));
  const replay = await runFeatureFlightStepV1(f.input, f.dependencies);
  assert.equal(replay.outcome, "replayed");
  assert.equal(replay.invocationCount, 0);
  assert.equal(f.calls.invoke, 1);
});

test("repository mutation, validator defect, and executor attribution substitution remain nonterminal", async (t) => {
  const cases = [
    ["repository mutation", { observe: (root, count) => ({ root, branch: "agent/daisy-251", head: REVISION, clean: count === 1 }) }],
    ["validator throw", { validate: async () => { throw new Error("validator defect"); } }],
    ["validator identity", { validate: (plan) => validator(plan, { validationId: "validation:substituted" }) }],
    ["executor attribution", { invoke: (plan) => executor(plan, { seatId: "may" }) }],
  ];
  for (const [name, behavior] of cases) {
    await t.test(name, async () => {
      const f = await fixture(behavior);
      const result = await runFeatureFlightStepV1(f.input, f.dependencies);
      assert.equal(result.outcome, "recovery_required");
      assert.equal(f.calls.invoke, 1);
      const directory = join(f.storeRoot, "effects", result.effectClaimId);
      await assert.rejects(readFile(join(directory, "successor.json")), /ENOENT/u);
    });
  }
});

test("store symlink, alias, and mode drift fail closed without authorization or invocation", async (t) => {
  await t.test("root alias", async () => {
    const f = await fixture();
    const alias = `${f.storeRoot}/../claim-store`;
    const result = await runFeatureFlightStepV1(f.input, withDependencies(f, { claimStoreRoot: alias }));
    assert.equal(result.outcome, "recovery_required");
    assert.equal(f.calls.authorize, 0);
    assert.equal(f.calls.invoke, 0);
  });
  await t.test("symlink root", async () => {
    const f = await fixture();
    const link = join(f.parent, "claim-store-link");
    await symlink(f.storeRoot, link, "dir");
    const result = await runFeatureFlightStepV1(f.input, withDependencies(f, { claimStoreRoot: link }));
    assert.equal(result.outcome, "recovery_required");
    assert.equal(f.calls.authorize, 0);
    assert.equal(f.calls.invoke, 0);
  });
  await t.test("root mode", async () => {
    const f = await fixture();
    await chmod(f.storeRoot, 0o755);
    const result = await runFeatureFlightStepV1(f.input, f.dependencies);
    assert.equal(result.outcome, "recovery_required");
    assert.equal(f.calls.authorize, 0);
    assert.equal(f.calls.invoke, 0);
  });
  for (const kind of ["symlink", "mode"]) {
    await t.test(`claim ${kind}`, async () => {
      const f = await fixture();
      const completed = await runFeatureFlightStepV1(f.input, f.dependencies);
      const claimPath = join(f.storeRoot, "effects", completed.effectClaimId, "claim.json");
      if (kind === "symlink") {
        const retained = `${claimPath}.retained`;
        await rename(claimPath, retained);
        await symlink(retained, claimPath);
      } else {
        await chmod(claimPath, 0o644);
      }
      const replay = await runFeatureFlightStepV1(f.input, f.dependencies);
      assert.equal(replay.outcome, "recovery_required");
      assert.equal(f.calls.invoke, 1);
    });
  }
});

test("traversal, case-fold, repository overlap, and caller alternate-parent store roots fail closed", async (t) => {
  const cases = [
    ["traversal alias", async (f) => ({ dependencies: withDependencies(f, { claimStoreRoot: `${f.storeRoot}/../claim-store` }) })],
    ["case-fold collision", async (f) => {
      const root = join(f.parent, "REPOSITORY", "nested-store");
      await mkdir(root, { recursive: true, mode: 0o700 });
      await chmod(root, 0o700);
      return { dependencies: withDependencies(f, { claimStoreRoot: root }) };
    }],
    ["repository overlap", async (f) => {
      const root = join(f.worktree, "claim-store");
      await mkdir(root, { mode: 0o700 });
      return { dependencies: withDependencies(f, { claimStoreRoot: root }) };
    }],
    ["caller alternate parent", async (f) => ({ input: { ...f.input, claimStoreRoot: join(f.parent, "alternate-store") } })],
  ];
  for (const [name, arrange] of cases) {
    await t.test(name, async () => {
      const f = await fixture();
      const arranged = await arrange(f);
      if (name === "caller alternate parent") {
        await assert.rejects(runFeatureFlightStepV1(arranged.input, f.dependencies), /rejected before effects/u);
      } else {
        const result = await runFeatureFlightStepV1(f.input, arranged.dependencies);
        assert.equal(result.outcome, "recovery_required");
        assert.equal(result.reason, "store_unavailable");
      }
      assert.equal(f.calls.authorize, 0);
      assert.equal(f.calls.invoke, 0);
    });
  }
});

test("an active Daisy mission plus any blocked or failed peer stops before claim", async (t) => {
  for (const peerStatus of ["blocked", "failed"]) {
    await t.test(peerStatus, async () => {
      const f = await fixture({ peerStatus });
      const genesis = stateFixture(f.plan, f.planIdentity, "active", 0, null, peerStatus);
      const stateBytes = fileBytes(genesis);
      await writeFile(f.input.statePath, stateBytes);
      const input = {
        planPath: f.input.planPath,
        expectedPlanSha256: f.input.expectedPlanSha256,
        statePath: f.input.statePath,
        expectedStateSha256: sha256(stateBytes),
        expectedStateSequence: 0,
        maxSteps: 1,
        routing: f.input.routing,
      };
      await assert.rejects(runFeatureFlightStepV1(input, f.dependencies), /admissible dependency-free active Daisy mission/u);
      assert.equal(f.calls.authorize, 0);
      assert.equal(f.calls.invoke, 0);
    });
  }
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
  await t.test("runtime and executor collision", async () => {
    const f = await fixture();
    const collision = Object.freeze({
      ...f.dependencies,
      adapterDescriptor: Object.freeze({
        ...f.dependencies.adapterDescriptor,
        executorId: f.dependencies.adapterDescriptor.runtimeId,
      }),
    });
    await assert.rejects(runFeatureFlightStepV1(f.input, collision), /fixed Slice 2 policy/u);
    assert.equal(f.calls.load, 0);
  });
  await t.test("unbounded runtime identity", async () => {
    const f = await fixture();
    const malformed = Object.freeze({
      ...f.dependencies,
      adapterDescriptor: Object.freeze({ ...f.dependencies.adapterDescriptor, runtimeId: `runtime:${"x".repeat(300)}` }),
    });
    await assert.rejects(runFeatureFlightStepV1(f.input, malformed), /fixed Slice 2 policy/u);
    assert.equal(f.calls.load, 0);
  });
});

test("wrong mission, repository identity, lane, and nonempty dependency inputs fail before effects", async (t) => {
  const cases = [
    ["mission", 1, 0, async (f) => ({ input: { ...f.input, routing: { ...f.input.routing, missionId: "mission:missing-251" } } })],
    ["worktree", 1, 1, async (f) => ({ dependencies: withDependencies(f, {
      observeRepository: async () => { f.calls.observe += 1; return { root: f.peerWorktree, branch: "agent/daisy-251", head: REVISION, clean: true }; },
    }) })],
    ["branch", 1, 1, async (f) => ({ dependencies: withDependencies(f, {
      observeRepository: async () => { f.calls.observe += 1; return { root: f.worktree, branch: "agent/wrong-251", head: REVISION, clean: true }; },
    }) })],
    ["HEAD", 1, 1, async (f) => ({ dependencies: withDependencies(f, {
      observeRepository: async () => { f.calls.observe += 1; return { root: f.worktree, branch: "agent/daisy-251", head: "5".repeat(40), clean: true }; },
    }) })],
    ["lane", 0, 0, async (f) => {
      const changed = structuredClone(f.current);
      changed.lanes["lane-daisy"].activeMissionId = null;
      const bytes = fileBytes(changed);
      await writeFile(f.input.statePath, bytes);
      return { input: { ...f.input, expectedStateSha256: sha256(bytes) } };
    }],
  ];
  for (const [name, expectedLoad, expectedObserve, arrange] of cases) {
    await t.test(name, async () => {
      const f = await fixture();
      const arranged = await arrange(f);
      await assert.rejects(runFeatureFlightStepV1(arranged.input ?? f.input, arranged.dependencies ?? f.dependencies), /before effects/u);
      assert.equal(f.calls.authorize, 0);
      assert.equal(f.calls.invoke, 0);
      assert.equal(f.calls.validate, 0);
      assert.equal(f.calls.clock, 0);
      assert.equal(f.calls.load, expectedLoad);
      assert.equal(f.calls.observe, expectedObserve);
      await assertEffectsAbsent(f);
    });
  }
  await t.test("nonempty dependencies", async () => {
    const f = await fixture({ selectedDependsOn: true });
    await assert.rejects(runFeatureFlightStepV1(f.input, f.dependencies), /admissible dependency-free active Daisy mission/u);
    assert.equal(f.calls.authorize, 0);
    assert.equal(f.calls.invoke, 0);
    assert.equal(f.calls.validate, 0);
    assert.equal(f.calls.clock, 0);
    await assertEffectsAbsent(f);
  });
});

test("excluded seats, effects, actions, validation, and adapter policy variants fail before effects", async (t) => {
  for (const seat of ["hill", "may", "mack", "fury", "coulson", "fitz", "simmons"]) {
    await t.test(`seat ${seat}`, async () => {
      const f = await fixture({ load: runnerMutation((value) => {
        const mode = { ...value.plan.activatedModes[0], seatId: seat };
        value.plan.seatId = seat;
        value.plan.activatedModes = [mode];
        value.resolvedModeContext.seatId = seat;
        value.resolvedModeContext.modes = [mode];
        value.projection.activatedModes = [mode];
        if (!value.projection.participantSeatIds.includes(seat)) value.projection.participantSeatIds.push(seat);
      }) });
      await assert.rejects(runFeatureFlightStepV1(f.input, f.dependencies), /before effects/u);
      assert.equal(f.calls.authorize, 0);
      assert.equal(f.calls.invoke, 0);
      assert.equal(f.calls.validate, 0);
      assert.equal(f.calls.clock, 0);
      await assertEffectsAbsent(f);
    });
  }
  const runnerCases = [
    ["verification effect", (value) => { value.plan.effectClass = "verification"; }],
    ["behavioral effect", (value) => { value.plan.effectClass = "behavioral_implementation"; }],
    ["action", (value) => { value.plan.actionId = "action:other-251"; value.actionAllowlist.push("action:other-251"); }],
    ["validation", (value) => { value.plan.validationId = "validation:other-251"; }],
  ];
  for (const [name, mutate] of runnerCases) {
    await t.test(name, async () => {
      const f = await fixture({ load: runnerMutation(mutate) });
      await assert.rejects(runFeatureFlightStepV1(f.input, f.dependencies), /fixed active Daisy policy/u);
      assert.equal(f.calls.authorize, 0);
      assert.equal(f.calls.invoke, 0);
      assert.equal(f.calls.validate, 0);
      assert.equal(f.calls.clock, 0);
      await assertEffectsAbsent(f);
    });
  }
  for (const [field, value] of [["adapterId", "other"], ["adapterVersion", "2.0.0"], ["capabilityClass", "implementation"]]) {
    await t.test(`adapter ${field}`, async () => {
      const f = await fixture();
      const descriptor = Object.freeze({ ...f.dependencies.adapterDescriptor, [field]: value });
      await assert.rejects(runFeatureFlightStepV1(f.input, withDependencies(f, { adapterDescriptor: descriptor })), /fixed Slice 2 policy/u);
      assert.equal(f.calls.load, 0);
      await assertEffectsAbsent(f);
    });
  }
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
