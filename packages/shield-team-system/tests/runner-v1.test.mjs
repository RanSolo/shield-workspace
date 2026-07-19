import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RUNNER_CONTRACT_VERSION,
  runRunnerCycle,
  validateRunnerAuthoritativeEffectRecord,
  validateRunnerCycleInput,
  validateRunnerCycleResult,
  validateRunnerOpaqueAuthorizationArtifact,
  validateRunnerPermissionDecision,
  validateRunnerSupervisedEffectCandidate,
} from "../dist/runner-v1.mjs";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  createExecutionEffectEntry,
  createGovernanceEntry,
  createMissionBegunEntry,
  createSupervisedMissionBrief,
  planMissionStep,
  replaySupervisedMissionJournal,
} from "../dist/mission-v2.mjs";

const revisionId = "0123456789012345678901234567890123456789";
const deliveryMode = {
  modeId: "delivery",
  modeVersion: "1.0.0",
  seatId: "may",
  activationSource: "mission-brief",
};
const authorizationArtifact = {
  artifactSchemaVersion: 1,
  artifactId: "permission-artifact:issue-10-compatible",
  contentType: "application/json",
  payload: {
    futureContract: "opaque-to-runner",
    runtimeBinding: { bindingId: "binding:fixture", version: 3 },
    approvedScopes: ["packages/shield-team-system"],
    executor: null,
  },
};

function authoritativeEffect(outcome, overrides = {}) {
  return {
    runnerContractVersion: 1,
    cycleId: "cycle:recorded",
    subjectId: "issue:8",
    revisionId,
    evaluatedThroughSequence: 6,
    seatId: "may",
    actionId: "implement-runner-seam",
    effectClass: "behavioral_implementation",
    effectKey: "effect:issue-8:runner-seam",
    authorizationDecisionId: "decision:recorded",
    outcome,
    reasonCode: outcome === "completed" ? "effect_completed" : "executor_uncertain",
    summary: "Authoritatively replayed effect record.",
    evidenceRefs: ["attempt:recorded"],
    entryId: "entry:mission:issue-8:7",
    missionId: "mission:issue-8",
    journalSequence: 7,
    timestamp: { value: "2026-07-19T16:00:00Z", provenance: "hostTrusted" },
    ...overrides,
  };
}

function cycleInput(overrides = {}) {
  const base = {
    runnerContractVersion: 1,
    projection: {
      runnerContractVersion: 1,
      journalSchemaVersion: 5,
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
      effectRecords: [],
    },
    resolvedModeContext: {
      runnerContractVersion: 1,
      seatId: "may",
      modes: [deliveryMode],
    },
    actionAllowlist: ["implement-runner-seam"],
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
    authorizationArtifact,
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
    evidenceRefs: ["artifact:runner-seam"],
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
        return behaviors.authorize ? behaviors.authorize(plan) : permission(plan);
      },
      async execute(plan, decision) {
        calls.execute += 1;
        return behaviors.execute ? behaviors.execute(plan, decision) : executorResult(plan);
      },
      async validate(plan, result) {
        calls.validate += 1;
        return behaviors.validate ? behaviors.validate(plan, result) : validatorResult(plan);
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

test("allowed cycle preserves the opaque authorization artifact unchanged for exactly one executor call", async () => {
  let observedArtifact;
  const { result, calls } = await run(cycleInput(), {
    execute: (plan, decision) => {
      observedArtifact = decision.authorizationArtifact;
      assert.ok(Object.isFrozen(decision.authorizationArtifact));
      assert.ok(Object.isFrozen(decision.authorizationArtifact.payload));
      return executorResult(plan);
    },
  });

  assert.equal(RUNNER_CONTRACT_VERSION, 1);
  assert.deepEqual(calls, { authorize: 1, execute: 1, validate: 1 });
  assert.deepEqual(observedArtifact, authorizationArtifact);
  assert.equal(result.outcome, "advanced");
  assert.equal(result.reason, "effect_completed");
  assert.equal(result.nextRoute, "journal");
  assert.equal(result.effectRecordCandidate.authority, "non_authoritative");
  assert.equal(result.effectRecordCandidate.journalSchemaVersion, 5);
  assert.equal(result.effectRecordCandidate.payload.outcome, "completed");
  assert.equal(validateRunnerSupervisedEffectCandidate(result.effectRecordCandidate).state, "valid");
  assert.equal(validateRunnerCycleResult(result).state, "valid");
});

test("malformed and non-JSON authorization artifacts fail closed before executor dispatch", async () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const invalidArtifacts = [
    { ...authorizationArtifact, payload: { runtime: undefined } },
    { ...authorizationArtifact, payload: { rate: Number.NaN } },
    { ...authorizationArtifact, payload: cyclic },
    { ...authorizationArtifact, payload: new Map([["binding", "opaque"]]) },
    { ...authorizationArtifact, contentType: "text/plain" },
  ];
  for (const artifact of invalidArtifacts) {
    assert.equal(validateRunnerOpaqueAuthorizationArtifact(artifact).state, "invalid");
    const outcome = await run(cycleInput(), {
      authorize: (plan) => permission(plan, { authorizationArtifact: artifact }),
    });
    assert.equal(outcome.result.reason, "authorization_malformed");
    assert.equal(outcome.result.effectRecordCandidate, null);
    assert.deepEqual(outcome.calls, { authorize: 1, execute: 0, validate: 0 });
  }
});

test("permission envelope remains closed while opaque JSON payload may evolve", () => {
  const plan = cycleInput().plan;
  assert.equal(validateRunnerPermissionDecision(permission(plan)).state, "valid");
  assert.equal(validateRunnerPermissionDecision({ ...permission(plan), futureTopLevelField: true }).state, "invalid");
  assert.equal(validateRunnerPermissionDecision(permission(plan, {
    authorizationArtifact: {
      ...authorizationArtifact,
      payload: { issue10: { runtime: "may-local", bindings: [1, true, null] } },
    },
  })).state, "valid");
});

test("completed and uncertain journal-derived effect records both prevent re-execution", async () => {
  for (const [outcome, reason] of [
    ["completed", "effect_already_completed"],
    ["uncertain", "effect_outcome_uncertain"],
  ]) {
    const record = authoritativeEffect(outcome);
    assert.equal(validateRunnerAuthoritativeEffectRecord(record).state, "valid");
    const attempt = await run(cycleInput({ projection: { effectRecords: [record] } }));
    assert.equal(attempt.result.reason, reason);
    assert.equal(attempt.result.effectRecordCandidate, null);
    assert.deepEqual(attempt.calls, { authorize: 0, execute: 0, validate: 0 });
  }
});

test("effect replay must be carried inside the closed authoritative projection", () => {
  const legacy = { ...cycleInput(), completedEffectKeys: ["effect:issue-8:runner-seam"] };
  assert.equal(validateRunnerCycleInput(legacy).state, "invalid");
  assert.equal(validateRunnerCycleInput(cycleInput({
    projection: { effectRecords: [{ ...authoritativeEffect("completed"), surprise: true }] },
  })).state, "invalid");
});

test("missing or pre-v5 supervised journal schema fails closed before callbacks", async () => {
  const missing = cycleInput();
  delete missing.projection.journalSchemaVersion;
  const candidates = [missing, cycleInput({ projection: { journalSchemaVersion: 4 } })];

  for (const input of candidates) {
    const deps = dependencies();
    assert.equal(validateRunnerCycleInput(input).state, "invalid");
    const result = await runRunnerCycle(input, deps.value);
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "malformed_input");
    assert.deepEqual(deps.calls, { authorize: 0, execute: 0, validate: 0 });
  }
});

test("wait, deny, and pre-dispatch failures never claim an effect attempt", async () => {
  for (const [outcome, reason] of [["wait", "authorization_wait"], ["deny", "authorization_denied"]]) {
    const attempt = await run(cycleInput(), {
      authorize: (plan) => permission(plan, { outcome, reasonCode: `policy_${outcome}` }),
    });
    assert.equal(attempt.result.reason, reason);
    assert.equal(attempt.result.effectRecordCandidate, null);
    assert.deepEqual(attempt.calls, { authorize: 1, execute: 0, validate: 0 });
  }
  const prerequisite = await run(cycleInput({ projection: { executeReadiness: "blocked" } }));
  assert.equal(prerequisite.result.reason, "execute_not_ready");
  assert.equal(prerequisite.result.effectRecordCandidate, null);
  assert.deepEqual(prerequisite.calls, { authorize: 0, execute: 0, validate: 0 });
});

test("every executor-side post-dispatch failure returns an uncertain supervised-journal candidate", async () => {
  const cases = [
    ["executor_failed", () => { throw new Error("executor unavailable"); }],
    ["executor_malformed", () => ({ outcome: "completed" })],
    ["executor_identity_mismatch", (plan) => executorResult(plan, { revisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })],
    ["executor_uncertain", (plan) => executorResult(plan, {
      outcome: "uncertain", summary: "Completion cannot be established.", evidenceRefs: ["attempt:uncertain"],
    })],
    ["executor_failed", (plan) => executorResult(plan, {
      outcome: "failed", summary: "Executor reported failure.", evidenceRefs: ["attempt:failed"],
    })],
  ];
  for (const [reason, execute] of cases) {
    const attempt = await run(cycleInput(), { execute });
    assert.equal(attempt.result.reason, reason);
    assert.equal(attempt.result.effectRecordCandidate.payload.outcome, "uncertain");
    assert.equal(attempt.result.effectRecordCandidate.payload.reasonCode, reason);
    assert.equal(validateRunnerSupervisedEffectCandidate(attempt.result.effectRecordCandidate).state, "valid");
    assert.deepEqual(attempt.calls, { authorize: 1, execute: 1, validate: 0 });
  }
});

test("every validator-side post-dispatch failure returns an uncertain supervised-journal candidate", async () => {
  const cases = [
    ["validator_failed", () => { throw new Error("validator unavailable"); }],
    ["validator_malformed", () => ({ outcome: "passed" })],
    ["validator_identity_mismatch", (plan) => validatorResult(plan, { effectKey: "effect:different" })],
    ["validator_failed", (plan) => validatorResult(plan, { outcome: "failed", summary: "Validation failed." })],
  ];
  for (const [reason, validate] of cases) {
    const attempt = await run(cycleInput(), { validate });
    assert.equal(attempt.result.reason, reason);
    assert.equal(attempt.result.effectRecordCandidate.payload.outcome, "uncertain");
    assert.equal(attempt.result.effectRecordCandidate.payload.reasonCode, reason);
    assert.ok(attempt.result.effectRecordCandidate.payload.evidenceRefs.includes("artifact:runner-seam"));
    assert.equal(validateRunnerCycleResult(attempt.result).state, "valid");
    assert.deepEqual(attempt.calls, { authorize: 1, execute: 1, validate: 1 });
  }
});

function keyBinding(seatId, humanPrincipalId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);
  return {
    privateKey,
    binding: {
      schemaVersion: 1,
      bindingId: `binding:${seatId}`,
      humanPrincipalId,
      seatId,
      missionScope: "*",
      signingKeyRef,
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:maintainer",
      provenanceRef: `repository-config:${seatId}`,
    },
  };
}

function replay(entries) {
  const result = replaySupervisedMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

function approvedRunningV5Mission() {
  const coulson = keyBinding("coulson", "human:coulson");
  const fitz = keyBinding("fitz", "human:fitz");
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId: "mission:runner-restart",
    objective: "Prove uncertain effect replay prevents duplicate execution.",
    subjectId: "issue:8",
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: false,
      externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: ["hill", "may", "fury", "fitz", "coulson"].map((seatId) => ({ seatId })),
    activatedModes: [deliveryMode],
    requireSimmons: false,
    createdAt: { value: "2026-07-19T16:00:00Z", provenance: "humanRecorded" },
  });
  const entries = [createMissionBegunEntry(brief, [coulson.binding, fitz.binding], 5)];
  let projection = replay(entries);
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const payload = {
    schemaVersion: 1,
    evidenceId: "evidence:coulson:runner-restart",
    requirementId: requirement.requirementId,
    missionId: projection.missionId,
    subjectKind: "mission_plan",
    subjectId: projection.brief.subjectId,
    revisionId: projection.brief.revisionId,
    seatId: "coulson",
    evidenceKind: "mission_authorization",
    decision: "approved",
    governanceTarget: "approved",
    humanPrincipalId: coulson.binding.humanPrincipalId,
    bindingId: coulson.binding.bindingId,
    signingKeyRef: coulson.binding.signingKeyRef,
    sourceRef: "manual-signature:runner-restart",
    timestamp: { value: "2026-07-19T16:01:00Z", provenance: "humanRecorded" },
    journalSequence: 1,
  };
  const evidence = {
    payload,
    signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), coulson.privateKey).toString("base64"),
  };
  const approval = createGovernanceEntry(projection, "approve", evidence);
  assert.equal(approval.state, "valid", approval.errors?.join(" "));
  entries.push(approval.value);
  projection = replay(entries);
  const began = planMissionStep(projection, { value: "2026-07-19T16:02:00Z", provenance: "hostTrusted" });
  assert.equal(began.state, "valid", began.errors?.join(" "));
  entries.push(began.value.entry);
  return { entries, projection: replay(entries) };
}

function runnerInputFromProjection(projection, overrides = {}) {
  const plan = {
    runnerContractVersion: 1,
    cycleId: overrides.cycleId ?? "cycle:journal-restart:1",
    missionId: projection.missionId,
    subjectId: projection.brief.subjectId,
    revisionId: projection.brief.revisionId,
    evaluatedThroughSequence: projection.lastSequence,
    seatId: "may",
    activatedModes: [deliveryMode],
    actionId: "implement-runner-seam",
    effectClass: "behavioral_implementation",
    effectKey: "effect:journal-restart",
    validationId: "validation:journal-restart",
    stopCondition: "after_one_cycle",
  };
  return cycleInput({
    projection: {
      journalSchemaVersion: projection.journalSchemaVersion,
      missionId: projection.missionId,
      subjectId: projection.brief.subjectId,
      revisionId: projection.brief.revisionId,
      evaluatedThroughSequence: projection.lastSequence,
      governanceState: projection.governance.state,
      missionAuthorizationState: projection.authorization.state,
      executionStatus: projection.execution.status,
      executeReadiness: projection.readiness.execute.state,
      participantSeatIds: projection.brief.participants.map(({ seatId }) => seatId),
      activatedModes: projection.brief.activatedModes,
      effectRecords: projection.effectRecords,
    },
    plan,
  });
}

test("journal v5 append and replay make an uncertain dispatched effect block the next invocation", async () => {
  const mission = approvedRunningV5Mission();
  const first = await run(runnerInputFromProjection(mission.projection), {
    execute: () => { throw new Error("connection lost after dispatch"); },
  });
  assert.equal(first.result.reason, "executor_failed");
  assert.equal(first.result.effectRecordCandidate.payload.outcome, "uncertain");

  const entry = createExecutionEffectEntry(
    mission.projection,
    first.result.effectRecordCandidate,
    { value: "2026-07-19T16:03:00Z", provenance: "hostTrusted" },
  );
  assert.equal(entry.state, "valid", entry.errors?.join(" "));
  mission.entries.push(entry.value);
  const restartedProjection = replay(mission.entries);
  assert.equal(restartedProjection.journalSchemaVersion, 5);
  assert.equal(restartedProjection.effectRecords.length, 1);
  assert.equal(restartedProjection.effectRecords[0].outcome, "uncertain");
  assert.equal(restartedProjection.readiness.execute.state, "blocked");
  assert.deepEqual(restartedProjection.readiness.execute.reasons, ["uncertain_effect:effect:journal-restart"]);

  const restarted = await run(runnerInputFromProjection(restartedProjection, { cycleId: "cycle:journal-restart:2" }));
  assert.equal(restarted.result.reason, "execute_not_ready");
  assert.equal(restarted.result.effectRecordCandidate, null);
  assert.deepEqual(restarted.calls, { authorize: 0, execute: 0, validate: 0 });
});

test("callback mutation cannot alter bound action or effect identities", async () => {
  const authorizeMutation = await run(cycleInput(), {
    authorize: (plan) => {
      plan.actionId = "unapproved-action";
      return permission(plan);
    },
  });
  assert.equal(authorizeMutation.result.reason, "authorization_failed");
  assert.equal(authorizeMutation.result.effectRecordCandidate, null);
  assert.deepEqual(authorizeMutation.calls, { authorize: 1, execute: 0, validate: 0 });

  const validatorMutation = await run(cycleInput(), {
    validate: (plan) => {
      plan.effectKey = "effect:drift";
      return validatorResult(plan);
    },
  });
  assert.equal(validatorMutation.result.reason, "validator_failed");
  assert.equal(validatorMutation.result.effectRecordCandidate.payload.effectKey, "effect:issue-8:runner-seam");
});

test("pure runner source has no environmental, host, model, clock, or GitHub dependency", async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(resolve(testDirectory, "../src/runner-v1.mts"), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\b(?:fetch|process|Date|setTimeout|setInterval|GitHub)\b/);
  assert.doesNotMatch(source, /(?:node:|from\s+["'](?:fs|path|child_process|http|https|net|tls|dns|os)["'])/);
});
