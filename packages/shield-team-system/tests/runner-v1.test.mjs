import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RUNNER_CONTRACT_VERSION,
  runRunnerCycle,
  translateRunnerEffectEvidenceCandidate,
  validateRunnerCyclePlan,
  validateRunnerCycleResult,
  validateRunnerEffectCompletedAppendCandidate,
  validateRunnerEffectEvidenceCandidate,
  validateRunnerExecutorResult,
  validateRunnerPermissionDecision,
  validateRunnerValidatorResult,
} from "../dist/runner-v1.mjs";

const revisionId = "0123456789012345678901234567890123456789";
const deliveryMode = {
  modeId: "delivery",
  modeVersion: "1.0.0",
  seatId: "may",
  activationSource: "mission-brief",
};

function cycleInput(overrides = {}) {
  const base = {
    runnerContractVersion: 1,
    projection: {
      runnerContractVersion: 1,
      missionId: "mission:issue-8",
      subjectId: "issue:8",
      revisionId,
      evaluatedThroughSequence: 7,
      governanceState: "approved",
      missionAuthorizationState: "authorized",
      executionStatus: "running",
      executeReadiness: "ready",
      participantSeatIds: ["hill", "may", "fury", "fitz", "coulson"],
      activatedModes: [deliveryMode],
    },
    resolvedModeContext: {
      runnerContractVersion: 1,
      seatId: "may",
      modes: [deliveryMode],
    },
    actionAllowlist: ["implement-runner-seam"],
    completedEffectKeys: [],
    plan: {
      runnerContractVersion: 1,
      cycleId: "cycle:issue-8:1",
      missionId: "mission:issue-8",
      subjectId: "issue:8",
      revisionId,
      evaluatedThroughSequence: 7,
      seatId: "may",
      activatedModes: [deliveryMode],
      actionId: "implement-runner-seam",
      effectClass: "behavioral_implementation",
      effectKey: "effect:issue-8:runner-seam",
      validationId: "validation:issue-8:runner-seam",
      stopCondition: "after_one_cycle",
    },
  };
  return {
    ...base,
    ...overrides,
    projection: { ...base.projection, ...overrides.projection },
    resolvedModeContext: { ...base.resolvedModeContext, ...overrides.resolvedModeContext },
    plan: { ...base.plan, ...overrides.plan },
  };
}

function permission(plan, overrides = {}) {
  return {
    runnerContractVersion: 1,
    decisionId: "decision:issue-8:1",
    outcome: "allow",
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    revisionId: plan.revisionId,
    evaluatedThroughSequence: plan.evaluatedThroughSequence,
    cycleId: plan.cycleId,
    seatId: plan.seatId,
    actionId: plan.actionId,
    effectClass: plan.effectClass,
    effectKey: plan.effectKey,
    reasonCode: "authorized",
    ...overrides,
  };
}

function executorResult(plan, overrides = {}) {
  return {
    runnerContractVersion: 1,
    outcome: "completed",
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    revisionId: plan.revisionId,
    evaluatedThroughSequence: plan.evaluatedThroughSequence,
    cycleId: plan.cycleId,
    seatId: plan.seatId,
    actionId: plan.actionId,
    effectClass: plan.effectClass,
    effectKey: plan.effectKey,
    summary: "Implemented the bounded runner seam.",
    evidenceRef: "artifact:runner-seam",
    ...overrides,
  };
}

function validatorResult(plan, overrides = {}) {
  return {
    runnerContractVersion: 1,
    outcome: "passed",
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    revisionId: plan.revisionId,
    evaluatedThroughSequence: plan.evaluatedThroughSequence,
    cycleId: plan.cycleId,
    validationId: plan.validationId,
    effectKey: plan.effectKey,
    summary: "Focused validation passed.",
    ...overrides,
  };
}

function dependencies(behaviors = {}) {
  const calls = { authorize: 0, execute: 0, validate: 0 };
  return {
    calls,
    value: {
      async authorize(plan) {
        calls.authorize += 1;
        if (behaviors.authorize) return behaviors.authorize(plan);
        return permission(plan);
      },
      async execute(plan, decision) {
        calls.execute += 1;
        if (behaviors.execute) return behaviors.execute(plan, decision);
        return executorResult(plan);
      },
      async validate(plan, result) {
        calls.validate += 1;
        if (behaviors.validate) return behaviors.validate(plan, result);
        return validatorResult(plan);
      },
    },
  };
}

async function run(input = cycleInput(), behaviors = {}) {
  const deps = dependencies(behaviors);
  const result = await runRunnerCycle(input, deps.value);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return { result: result.value, calls: deps.calls };
}

test("one allowed cycle invokes each injected boundary exactly once and returns journal-ready evidence", async () => {
  assert.equal(RUNNER_CONTRACT_VERSION, 1);
  const { result, calls } = await run();

  assert.deepEqual(calls, { authorize: 1, execute: 1, validate: 1 });
  assert.equal(result.outcome, "advanced");
  assert.equal(result.reason, "effect_completed");
  assert.equal(result.nextRoute, "journal");
  assert.deepEqual(result.evidence, {
    runnerContractVersion: 1,
    candidateKind: "runner.effect_completed",
    missionId: "mission:issue-8",
    subjectId: "issue:8",
    revisionId,
    evaluatedThroughSequence: 7,
    intendedJournalSequence: 8,
    cycleId: "cycle:issue-8:1",
    seatId: "may",
    actionId: "implement-runner-seam",
    effectClass: "behavioral_implementation",
    effectKey: "effect:issue-8:runner-seam",
    validationId: "validation:issue-8:runner-seam",
    executorEvidenceRef: "artifact:runner-seam",
    executorSummary: "Implemented the bounded runner seam.",
    validationSummary: "Focused validation passed.",
  });
  assert.equal(result.journalAppendCandidate.authority, "non_authoritative");
  assert.equal(result.journalAppendCandidate.entryType, "effect.completed");
});

test("public evidence, append-candidate, and cycle-result validators preserve exact translation", async () => {
  const { result } = await run();
  assert.equal(validateRunnerEffectEvidenceCandidate(result.evidence).state, "valid");
  assert.equal(validateRunnerEffectCompletedAppendCandidate(result.journalAppendCandidate).state, "valid");
  assert.equal(validateRunnerCycleResult(result).state, "valid");

  const translated = translateRunnerEffectEvidenceCandidate(result.evidence);
  assert.equal(translated.state, "valid");
  assert.deepEqual(translated.value, result.journalAppendCandidate);

  assert.equal(validateRunnerEffectEvidenceCandidate({
    ...result.evidence,
    intendedJournalSequence: 99,
  }).state, "invalid");
  assert.equal(validateRunnerEffectCompletedAppendCandidate({
    ...result.journalAppendCandidate,
    authority: "authoritative",
  }).state, "invalid");
  assert.equal(validateRunnerEffectCompletedAppendCandidate({
    ...result.journalAppendCandidate,
    payload: { ...result.journalAppendCandidate.payload, effectKey: "effect:different" },
  }).state, "invalid");
  assert.equal(validateRunnerCycleResult({ ...result, actionId: "different-action" }).state, "invalid");

  const stopped = await run(cycleInput({ completedEffectKeys: ["effect:issue-8:runner-seam"] }));
  assert.equal(validateRunnerCycleResult(stopped.result).state, "valid");
  assert.equal(validateRunnerCycleResult({
    ...stopped.result,
    journalAppendCandidate: result.journalAppendCandidate,
  }).state, "invalid");
});

test("wait and deny permission outcomes stop before executor dispatch", async () => {
  for (const [outcome, reason] of [["wait", "authorization_wait"], ["deny", "authorization_denied"]]) {
    const { result, calls } = await run(cycleInput(), {
      authorize: (plan) => permission(plan, { outcome, reasonCode: `policy_${outcome}` }),
    });
    assert.equal(result.reason, reason);
    assert.deepEqual(calls, { authorize: 1, execute: 0, validate: 0 });
  }
});

test("stale authorization and mismatched projection identity fail closed", async () => {
  const stale = await run(cycleInput(), {
    authorize: (plan) => permission(plan, { evaluatedThroughSequence: plan.evaluatedThroughSequence - 1 }),
  });
  assert.equal(stale.result.reason, "authorization_stale");
  assert.deepEqual(stale.calls, { authorize: 1, execute: 0, validate: 0 });

  const mismatch = await run(cycleInput({ projection: { revisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } }));
  assert.equal(mismatch.result.reason, "identity_mismatch");
  assert.deepEqual(mismatch.calls, { authorize: 0, execute: 0, validate: 0 });
});

test("every authoritative pre-authorization prerequisite fails closed before callbacks", async () => {
  const wrongMode = { ...deliveryMode, modeVersion: "2.0.0" };
  const cases = [
    ["governance_not_approved", { projection: { governanceState: "paused" } }],
    ["mission_not_authorized", { projection: { missionAuthorizationState: "waiting" } }],
    ["execution_not_active", { projection: { executionStatus: "not-started" } }],
    ["execute_not_ready", { projection: { executeReadiness: "blocked" } }],
    ["journal_sequence_mismatch", { plan: { evaluatedThroughSequence: 6 } }],
    ["seat_not_participating", { projection: { participantSeatIds: ["hill", "fury", "fitz", "coulson"] } }],
    ["mode_context_mismatch", { resolvedModeContext: { modes: [wrongMode] } }],
    ["action_not_allowlisted", { actionAllowlist: ["different-action"] }],
  ];
  for (const [reason, overrides] of cases) {
    const outcome = await run(cycleInput(overrides));
    assert.equal(outcome.result.reason, reason);
    assert.deepEqual(outcome.calls, { authorize: 0, execute: 0, validate: 0 }, reason);
  }
});

test("thrown and malformed authorization results stop before execution", async () => {
  const cases = [
    ["authorization_failed", () => { throw new Error("permission boundary unavailable"); }],
    ["authorization_malformed", () => ({ outcome: "allow" })],
  ];
  for (const [reason, authorize] of cases) {
    const outcome = await run(cycleInput(), { authorize });
    assert.equal(outcome.result.reason, reason);
    assert.deepEqual(outcome.calls, { authorize: 1, execute: 0, validate: 0 });
  }
});

test("authoritative completed-effect replay is deterministic and prevents re-execution", async () => {
  const replayInput = cycleInput({ completedEffectKeys: ["effect:issue-8:runner-seam"] });
  const first = await run(replayInput);
  const restarted = await run(structuredClone(replayInput));

  assert.equal(first.result.reason, "effect_already_completed");
  assert.deepEqual(first.result, restarted.result);
  assert.deepEqual(first.calls, { authorize: 0, execute: 0, validate: 0 });
  assert.deepEqual(restarted.calls, { authorize: 0, execute: 0, validate: 0 });
});

test("thrown, malformed, and uncertain executor outcomes stop without validation or retry", async () => {
  const cases = [
    ["executor_failed", () => { throw new Error("executor unavailable"); }],
    ["executor_malformed", () => ({ outcome: "completed" })],
    ["executor_uncertain", (plan) => executorResult(plan, {
      outcome: "uncertain",
      summary: "Effect completion could not be established.",
      evidenceRef: null,
    })],
  ];
  for (const [reason, execute] of cases) {
    const { result, calls } = await run(cycleInput(), { execute });
    assert.equal(result.reason, reason);
    assert.deepEqual(calls, { authorize: 1, execute: 1, validate: 0 });
    assert.equal(result.evidence, null);
    assert.equal(result.nextRoute, "coulson");
  }
});

test("validator failure is an explicit stop and never produces completion evidence", async () => {
  const { result, calls } = await run(cycleInput(), {
    validate: (plan) => validatorResult(plan, { outcome: "failed", summary: "Contract test failed." }),
  });
  assert.equal(result.reason, "validator_failed");
  assert.equal(result.evidence, null);
  assert.deepEqual(calls, { authorize: 1, execute: 1, validate: 1 });
});

test("executor and validator identity drift cannot produce completion evidence", async () => {
  const executorDrift = await run(cycleInput(), {
    execute: (plan) => executorResult(plan, { revisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
  });
  assert.equal(executorDrift.result.reason, "executor_identity_mismatch");
  assert.deepEqual(executorDrift.calls, { authorize: 1, execute: 1, validate: 0 });

  const validatorDrift = await run(cycleInput(), {
    validate: (plan) => validatorResult(plan, { validationId: "validation:different" }),
  });
  assert.equal(validatorDrift.result.reason, "validator_identity_mismatch");
  assert.deepEqual(validatorDrift.calls, { authorize: 1, execute: 1, validate: 1 });
  assert.equal(validatorDrift.result.evidence, null);
});

test("authorization callback cannot mutate the plan into a non-allowlisted action", async () => {
  const input = cycleInput();
  const calls = { authorize: 0, execute: 0, validate: 0 };
  const outcome = await runRunnerCycle(input, {
    authorize(plan) {
      calls.authorize += 1;
      plan.actionId = "unapproved-action";
      return permission(plan);
    },
    execute() {
      calls.execute += 1;
      return null;
    },
    validate() {
      calls.validate += 1;
      return null;
    },
  });

  assert.equal(outcome.state, "valid");
  assert.equal(outcome.value.outcome, "stopped");
  assert.equal(outcome.value.reason, "authorization_failed");
  assert.equal(outcome.value.actionId, "implement-runner-seam");
  assert.equal(outcome.value.evidence, null);
  assert.equal(outcome.value.journalAppendCandidate, null);
  assert.deepEqual(calls, { authorize: 1, execute: 0, validate: 0 });
  assert.equal(input.plan.actionId, "implement-runner-seam");
});

test("executor callback cannot mutate bound identities or reach validation", async () => {
  const input = cycleInput();
  const calls = { authorize: 0, execute: 0, validate: 0 };
  const outcome = await runRunnerCycle(input, {
    authorize(plan) {
      calls.authorize += 1;
      return permission(plan);
    },
    execute(plan) {
      calls.execute += 1;
      plan.revisionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      return executorResult(plan);
    },
    validate() {
      calls.validate += 1;
      return null;
    },
  });

  assert.equal(outcome.state, "valid");
  assert.equal(outcome.value.outcome, "stopped");
  assert.equal(outcome.value.reason, "executor_failed");
  assert.equal(outcome.value.revisionId, revisionId);
  assert.equal(outcome.value.evidence, null);
  assert.equal(outcome.value.journalAppendCandidate, null);
  assert.deepEqual(calls, { authorize: 1, execute: 1, validate: 0 });
  assert.equal(input.plan.revisionId, revisionId);
});

test("validator callback cannot mutate effect identity or drift completion evidence", async () => {
  const input = cycleInput();
  const calls = { authorize: 0, execute: 0, validate: 0 };
  const outcome = await runRunnerCycle(input, {
    authorize(plan) {
      calls.authorize += 1;
      return permission(plan);
    },
    execute(plan) {
      calls.execute += 1;
      return executorResult(plan);
    },
    validate(plan) {
      calls.validate += 1;
      plan.effectKey = "effect:unapproved";
      return validatorResult(plan);
    },
  });

  assert.equal(outcome.state, "valid");
  assert.equal(outcome.value.outcome, "stopped");
  assert.equal(outcome.value.reason, "validator_failed");
  assert.equal(outcome.value.effectKey, "effect:issue-8:runner-seam");
  assert.equal(outcome.value.evidence, null);
  assert.equal(outcome.value.journalAppendCandidate, null);
  assert.deepEqual(calls, { authorize: 1, execute: 1, validate: 1 });
  assert.equal(input.plan.effectKey, "effect:issue-8:runner-seam");
});

test("Hill cannot own behavioral implementation and Fitz or Simmons cannot be dispatched", async () => {
  const cases = [
    ["hill", "implementation_owner_mismatch"],
    ["fitz", "seat_not_executable"],
    ["simmons", "seat_not_executable"],
  ];
  for (const [seatId, reason] of cases) {
    const mode = { ...deliveryMode, seatId };
    const input = cycleInput({
      projection: {
        participantSeatIds: ["hill", "may", "fury", "fitz", "simmons", "coulson"],
        activatedModes: [mode],
      },
      resolvedModeContext: { seatId, modes: [mode] },
      plan: { seatId, activatedModes: [mode] },
    });
    const outcome = await run(input);
    assert.equal(outcome.result.reason, reason, seatId);
    assert.deepEqual(outcome.calls, { authorize: 0, execute: 0, validate: 0 }, seatId);
  }
});

test("closed result contracts reject missing, unknown, inherited, and inconsistent values", () => {
  const plan = cycleInput().plan;
  assert.equal(validateRunnerCyclePlan(plan).state, "valid");
  assert.equal(validateRunnerCyclePlan({ ...plan, unexpected: true }).state, "invalid");
  const inherited = Object.create(plan);
  assert.equal(validateRunnerCyclePlan(inherited).state, "invalid");

  const decision = permission(plan);
  const { decisionId: _missing, ...missingDecisionId } = decision;
  assert.equal(validateRunnerPermissionDecision(missingDecisionId).state, "invalid");
  assert.equal(validateRunnerPermissionDecision({ ...decision, outcome: "maybe" }).state, "invalid");

  const completed = executorResult(plan);
  assert.equal(validateRunnerExecutorResult({ ...completed, evidenceRef: null }).state, "invalid");
  assert.equal(validateRunnerExecutorResult({ ...completed, outcome: "uncertain" }).state, "invalid");

  const checked = validatorResult(plan);
  assert.equal(validateRunnerValidatorResult({ ...checked, surprise: true }).state, "invalid");
  assert.equal(validateRunnerValidatorResult({ ...checked, outcome: "unknown" }).state, "invalid");
});

test("pure runner source has no environmental, host, model, clock, or GitHub dependency", async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(resolve(testDirectory, "../src/runner-v1.mts"), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\b(?:fetch|process|Date|setTimeout|setInterval|GitHub)\b/);
  assert.doesNotMatch(source, /(?:node:|from\s+["'](?:fs|path|child_process|http|https|net|tls|dns|os)["'])/);
});
