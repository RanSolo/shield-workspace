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
  wave: { current: 1 },
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
  if (behaviors.peerStatus !== undefined) {
    plan.lanes.push({ id: "lane-peer", chatLabel: "Peer chat", teamLabel: "Peer team" });
    plan.missions.push({
      id: "mission:peer-251", slug: "mission-peer-251", title: "Peer mission", library: "peer",
      lane: "lane-peer", branch: "agent/peer-251", worktree: peerWorktree, activationWave: 1, dependsOn: [],
      writablePaths: ["packages/peer/**"], scope: "Peer scope.", deliverables: ["Peer output"], dependencyLevel: 0,
      initialEligibility: "eligible-after-independent-authorization", constructionStatus: "planned-not-created", authorityStatus: "not-initialized",
    });
  }
  const planPath = join(artifactRoot, "plan.json");
  const planBytes = fileBytes(plan);
  await writeFile(planPath, planBytes);
  const planIdentity = { path: planPath, bytes: planBytes.length, sha256: sha256(planBytes) };
  const predecessor = stateFixture(plan, planIdentity, "authorized", 0, null, "planned");
  const predecessorPath = join(artifactRoot, "state-0.json");
  const predecessorBytes = fileBytes(predecessor);
  await writeFile(predecessorPath, predecessorBytes);
  const current = stateFixture(plan, planIdentity, "active", 1, sha256(predecessorBytes), behaviors.peerStatus);
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
    ["Runner seat attribution", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.runnerResult.effectRecordCandidate.payload.seatId = "may";
      value.runnerResultSha256 = sha256(Buffer.from(canonicalJson(value.runnerResult)));
    })],
    ["result flight", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => { value.flightId = "mission:other-flight"; })],
    ["repository pair", async ({ resultPath }) => rewriteCanonical(resultPath, (value) => {
      value.repositoryBefore.branch = "agent/substituted";
      value.repositoryAfter.branch = "agent/substituted";
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
          await replaceOnce(input.expectedDirectoryIdentity.path);
          return productionStepStore.writeSuccessor(input);
        },
      }) : phase === "result-write" ? frozenStore({
        writeResult: async (input) => {
          await replaceOnce(input.expectedDirectoryIdentity.path);
          return productionStepStore.writeResult(input);
        },
      }) : frozenStore({
        readStep: async (input) => {
          if (input.expectedDirectoryIdentity !== undefined) {
            const target = phase === "final-root" ? f.storeRoot
              : phase === "final-effects" ? join(f.storeRoot, "effects")
                : input.expectedDirectoryIdentity.path;
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
    assert.equal(result.storeStatus, "malformed");
    assert.equal(f.calls.invoke, 0);
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
      assert.notEqual(result.outcome, "stopped");
      assert.equal(f.calls.invoke, 0);
    });
  }
  await t.test("invocation claim clock failure", async () => {
    const f = await fixture();
    const clock = Object.freeze({ now: async () => { throw new Error("clock failed"); } });
    const result = await runFeatureFlightStepV1(f.input, withDependencies(f, { clock }));
    assert.equal(result.outcome, "recovery_required");
    assert.notEqual(result.outcome, "stopped");
    assert.equal(f.calls.invoke, 0);
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
