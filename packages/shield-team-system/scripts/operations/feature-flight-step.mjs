import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { runRunnerCycle, validateRunnerCycleInput, validateRunnerCycleResult } from "../../dist/runner-v1.mjs";
import {
  artifactIdentity,
  assertFlightState,
  assertResolvedPlan,
  AUTHORITY_DERIVED_STATUSES,
  buildActiveToCompleteSuccessor,
  GIT_REVISION_PATTERN,
  OPERATOR_DISPOSITION_STATUSES,
  SHA256_PATTERN,
  validateImmediateTransition,
} from "./flight-contracts.mjs";
import { computeFeatureFlightStatus, readFlightJsonSnapshot } from "./feature-flight-controller.mjs";
import * as defaultStepStore from "./feature-flight-step-store.mjs";

export const FEATURE_FLIGHT_STEP_CONTRACT_VERSION = "1.0.0";

const ACTION_ID = "action:feature-flight.daisy.reconnaissance";
const VALIDATION_ID = "validation:feature-flight.daisy-result-v1";
const CLAIM_NOTICE = "Durable execute-once coordination claim only. This artifact grants no authority.";
const RESULT_NOTICE = "Coordination evidence only. This triad is not human acceptance or implementation authority.";
const ADAPTER_POLICY = Object.freeze({
  adapterId: "shield.daisy.readonly",
  adapterVersion: "1.0.0",
  capabilityClass: "read_only_coordination",
});
const CALLER_FIELDS = [
  "planPath", "expectedPlanSha256", "statePath", "expectedStateSha256", "expectedStateSequence",
  "maxSteps", "routing",
];
const CALLER_OPTIONAL_FIELDS = ["predecessorStatePath", "expectedPredecessorSha256"];
const DEPENDENCY_FIELDS = [
  "loadRunnerCycleInput", "authorizeRunner", "invokeDaisyAdapter", "validateDaisyResult",
  "observeRepository", "adapterDescriptor", "claimStoreRoot", "clock",
];
const DEPENDENCY_OPTIONAL_FIELDS = ["stepStore", "snapshotDependencies"];
const DESCRIPTOR_FIELDS = ["adapterId", "adapterVersion", "capabilityClass", "runtimeId", "executorId"];
const STORE_FIELDS = ["claimStep", "readStep", "writeSuccessor", "writeResult"];
const HOST_IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const builtInStepStore = Object.freeze(Object.fromEntries(STORE_FIELDS.map((field) => [field, defaultStepStore[field]])));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalValue = (value) => Array.isArray(value) ? value.map(canonicalValue)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
    : value;
const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
const digestValue = (value) => sha256(Buffer.from(canonicalJson(value), "utf8"));
const deepCopy = (value) => JSON.parse(JSON.stringify(value));
const sameJson = (left, right) => canonicalJson(left) === canonicalJson(right);

const exactDataObject = (value, required, optional = [], label = "object") => {
  let proxy = true;
  try { proxy = isProxy(value); } catch {}
  if (proxy || value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a strict plain object.`);
  }
  const allowed = new Set([...required, ...optional]);
  const names = Object.getOwnPropertyNames(value);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error(`${label} must not contain symbol fields.`);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!allowed.has(name) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
      throw new Error(`${label}.${name} is unknown or is not an own enumerable data field.`);
    }
  }
  for (const field of required) if (!Object.hasOwn(value, field)) throw new Error(`${label}.${field} is required.`);
  return value;
};

const timestamp = (value, label) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
      Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`${label} must be canonical UTC with milliseconds.`);
  return value;
};

const identity = (snapshot) => ({ path: snapshot.path, bytes: snapshot.bytes.length, sha256: sha256(snapshot.bytes) });
const storeInput = (prepared, extra = {}) => ({
  root: prepared.claimStoreRoot,
  excludedRoots: prepared.excludedRoots,
  effectClaimId: prepared.effectClaimId,
  ...extra,
});

const resultBase = (prepared) => ({
  authority: "none",
  contractVersion: FEATURE_FLIGHT_STEP_CONTRACT_VERSION,
  flightId: prepared.plan.flightId,
  missionId: prepared.mission.id,
  effectClaimId: prepared.effectClaimId,
  plan: prepared.planArtifact,
  state: prepared.stateArtifact,
  predecessor: prepared.predecessorArtifact,
  runner: {
    missionId: prepared.runner.plan.missionId,
    subjectId: prepared.runner.plan.subjectId,
    revisionId: prepared.runner.plan.revisionId,
    evaluatedThroughSequence: prepared.runner.plan.evaluatedThroughSequence,
    cycleId: prepared.runner.plan.cycleId,
    seatId: prepared.runner.plan.seatId,
    actionId: prepared.runner.plan.actionId,
    effectClass: prepared.runner.plan.effectClass,
    effectKey: prepared.runner.plan.effectKey,
    validationId: prepared.runner.plan.validationId,
    inputSha256: prepared.runnerInputSha256,
  },
  adapter: deepCopy(prepared.adapterDescriptor),
});

const stoppedProjection = (prepared, runnerResult) => ({
  schemaVersion: 1,
  resultType: "feature-flight-step-projection",
  ...resultBase(prepared),
  outcome: "stopped",
  invocationCount: 0,
  runnerResult,
  gateEligible: false,
});

const recoveryProjection = (prepared, reason, step = null) => ({
  schemaVersion: 1,
  resultType: "feature-flight-step-projection",
  ...resultBase(prepared),
  outcome: "recovery_required",
  reason,
  invocationCount: prepared.invocationCount ?? 0,
  storeStatus: step?.status ?? "unavailable",
  gateEligible: false,
});

const artifactErrors = (value, fields, type) => {
  try { exactDataObject(value, fields, [], type); } catch (error) { return [error.message]; }
  const errors = [];
  if (value.schemaVersion !== 1) errors.push(`${type}.schemaVersion must equal 1.`);
  if (value.artifactType !== type) errors.push(`${type}.artifactType is invalid.`);
  if (value.authority !== "none") errors.push(`${type}.authority must equal none.`);
  return errors;
};

const CLAIM_FIELDS = [
  "schemaVersion", "artifactType", "authority", "notice", "contract", "effectClaimId", "attemptDigest",
  "flightId", "plan", "currentState", "predecessor", "flight", "repository", "runner", "adapter", "claimedAt",
];
const RESULT_FIELDS = [
  "schemaVersion", "artifactType", "authority", "notice", "contract", "effectClaimId", "attemptDigest", "flightId",
  "claim", "successor", "runnerResult", "runnerResultSha256", "repositoryBefore", "repositoryAfter", "adapter",
  "invocationCount", "claimedAt", "completedAt", "outcome", "effectContainment", "gateEligible",
];

export const validateFeatureFlightStepClaim = (value) => {
  const errors = artifactErrors(value, CLAIM_FIELDS, "feature-flight-step-claim");
  if (errors.length === 0) {
    if (!SHA256_PATTERN.test(value.effectClaimId ?? "") || !SHA256_PATTERN.test(value.attemptDigest ?? "")) errors.push("Claim digests are malformed.");
    if (value.notice !== CLAIM_NOTICE) errors.push("Claim notice is invalid.");
    try { timestamp(value.claimedAt, "claim.claimedAt"); } catch (error) { errors.push(error.message); }
    try {
      exactDataObject(value.contract, ["name", "version"], [], "claim.contract");
      exactDataObject(value.plan, ["path", "bytes", "sha256"], [], "claim.plan");
      exactDataObject(value.currentState, ["path", "bytes", "sha256"], [], "claim.currentState");
      if (value.predecessor !== null) exactDataObject(value.predecessor, ["path", "bytes", "sha256"], [], "claim.predecessor");
      exactDataObject(value.flight, ["sequence", "wave", "missionId", "lane"], [], "claim.flight");
      exactDataObject(value.repository, ["root", "branch", "head", "clean"], [], "claim.repository");
      exactDataObject(value.runner, [
        "missionId", "subjectId", "revisionId", "evaluatedThroughSequence", "cycleId", "seatId", "actionId", "effectClass",
        "effectKey", "validationId", "inputSha256",
      ], [], "claim.runner");
      exactDataObject(value.adapter, DESCRIPTOR_FIELDS, [], "claim.adapter");
      if (value.contract.name !== "shield-feature-flight-step" || value.contract.version !== FEATURE_FLIGHT_STEP_CONTRACT_VERSION) {
        errors.push("Claim contract identity is invalid.");
      }
    } catch (error) { errors.push(error.message); }
  }
  return errors;
};

export const validateFeatureFlightStepSuccessor = (plan, planIdentity, predecessor, value) => {
  try {
    assertFlightState(plan, planIdentity, value, "successor");
    const edge = validateImmediateTransition(plan, predecessor, value);
    return edge;
  } catch (error) { return [error.message]; }
};

export const validateFeatureFlightStepResult = (value) => {
  const errors = artifactErrors(value, RESULT_FIELDS, "feature-flight-step-result");
  if (errors.length === 0) {
    if (value.notice !== RESULT_NOTICE) errors.push("Result notice is invalid.");
    if (value.outcome !== "completed" || value.invocationCount !== 1 || value.gateEligible !== false ||
        value.effectContainment !== "external_uncertain_repository_unchanged") errors.push("Result terminal disposition is invalid.");
    if (!sameJson(value.repositoryBefore, value.repositoryAfter)) errors.push("Result repository readbacks differ.");
    try {
      exactDataObject(value.contract, ["name", "version"], [], "result.contract");
      exactDataObject(value.claim, ["path", "bytes", "sha256"], [], "result.claim");
      exactDataObject(value.successor, ["path", "bytes", "sha256"], [], "result.successor");
      exactDataObject(value.repositoryBefore, ["root", "branch", "head", "clean"], [], "result.repositoryBefore");
      exactDataObject(value.repositoryAfter, ["root", "branch", "head", "clean"], [], "result.repositoryAfter");
      exactDataObject(value.adapter, DESCRIPTOR_FIELDS, [], "result.adapter");
      if (value.contract.name !== "shield-feature-flight-step" || value.contract.version !== FEATURE_FLIGHT_STEP_CONTRACT_VERSION) {
        errors.push("Result contract identity is invalid.");
      }
      timestamp(value.claimedAt, "result.claimedAt");
      timestamp(value.completedAt, "result.completedAt");
      if (Date.parse(value.completedAt) < Date.parse(value.claimedAt)) errors.push("Result completion timestamp precedes claim timestamp.");
    } catch (error) { errors.push(error.message); }
  }
  return errors;
};

const validateTriad = (prepared, step) => {
  if (step?.status !== "terminal") throw new Error("Feature Flight step is not terminal.");
  const claim = step.claim.value;
  const successor = step.successor.value;
  const result = step.result.value;
  const errors = [
    ...validateFeatureFlightStepClaim(claim),
    ...validateFeatureFlightStepSuccessor(prepared.plan, prepared.planArtifact, prepared.state, successor),
    ...validateFeatureFlightStepResult(result),
  ];
  const claimIdentity = identity(step.claim);
  const successorIdentity = identity(step.successor);
  const expectedAttemptDigest = digestValue({
    plan: claim.plan,
    currentState: claim.currentState,
    predecessor: claim.predecessor,
    sequence: claim.flight?.sequence,
    runnerInputSha256: claim.runner?.inputSha256,
    journalSequence: claim.runner?.evaluatedThroughSequence,
    cycleId: claim.runner?.cycleId,
    validationId: claim.runner?.validationId,
    repository: claim.repository,
    adapter: claim.adapter,
    claimedAt: claim.claimedAt,
  });
  if (claim.attemptDigest !== expectedAttemptDigest) errors.push("Claim attemptDigest does not match its exact canonical attempt evidence.");
  if (claim.effectClaimId !== prepared.effectClaimId || claim.flightId !== prepared.plan.flightId ||
      !sameJson(claim.plan, prepared.planArtifact) || !sameJson(claim.currentState, prepared.stateArtifact) ||
      !sameJson(claim.predecessor, prepared.predecessorArtifact) || !sameJson(claim.runner, resultBase(prepared).runner) ||
      !sameJson(claim.adapter, prepared.adapterDescriptor) || !sameJson(claim.repository, prepared.repositoryBefore) ||
      !sameJson(claim.flight, {
        sequence: prepared.state.sequence, wave: prepared.state.wave.current, missionId: prepared.mission.id, lane: prepared.mission.lane,
      })) errors.push("Claim does not match the requested exact step.");
  if (result.effectClaimId !== claim.effectClaimId || result.attemptDigest !== claim.attemptDigest || result.flightId !== prepared.plan.flightId ||
      !sameJson(result.claim, claimIdentity) || !sameJson(result.successor, successorIdentity) ||
      result.runnerResultSha256 !== digestValue(result.runnerResult) || !sameJson(result.adapter, claim.adapter) ||
      !sameJson(result.adapter, prepared.adapterDescriptor) || !sameJson(result.repositoryBefore, prepared.repositoryBefore) ||
      !sameJson(result.repositoryAfter, prepared.repositoryBefore) || result.claimedAt !== claim.claimedAt ||
      result.completedAt !== successor.observedAt) errors.push("Terminal result does not bind the exact prepared claim, successor, repository, and timestamps.");
  const runnerChecked = validateRunnerCycleResult(result.runnerResult);
  if (runnerChecked.state !== "valid" || result.runnerResult.outcome !== "advanced" || result.runnerResult.reason !== "effect_completed") {
    errors.push("Terminal result does not contain one valid advanced Runner result.");
  } else {
    const runner = result.runnerResult;
    const candidate = runner.effectRecordCandidate;
    const payload = candidate.payload;
    if (runner.missionId !== prepared.runner.plan.missionId || runner.missionId !== claim.runner.missionId ||
        runner.subjectId !== prepared.runner.plan.subjectId || runner.subjectId !== claim.runner.subjectId ||
        runner.revisionId !== prepared.runner.plan.revisionId || runner.revisionId !== claim.runner.revisionId ||
        runner.evaluatedThroughSequence !== prepared.runner.plan.evaluatedThroughSequence ||
        runner.evaluatedThroughSequence !== claim.runner.evaluatedThroughSequence ||
        runner.cycleId !== prepared.runner.plan.cycleId || runner.cycleId !== claim.runner.cycleId ||
        runner.actionId !== prepared.runner.plan.actionId || runner.actionId !== claim.runner.actionId ||
        runner.effectKey !== prepared.runner.plan.effectKey || runner.effectKey !== claim.runner.effectKey ||
        candidate.missionId !== runner.missionId || candidate.subjectId !== runner.subjectId || candidate.revisionId !== runner.revisionId ||
        candidate.journalSchemaVersion !== prepared.runner.projection.journalSchemaVersion ||
        candidate.expectedPreviousSequence !== runner.evaluatedThroughSequence || payload.cycleId !== runner.cycleId ||
        payload.subjectId !== runner.subjectId || payload.revisionId !== runner.revisionId ||
        payload.evaluatedThroughSequence !== runner.evaluatedThroughSequence ||
        payload.seatId !== prepared.runner.plan.seatId || payload.seatId !== claim.runner.seatId ||
        payload.actionId !== prepared.runner.plan.actionId || payload.actionId !== claim.runner.actionId ||
        payload.effectClass !== prepared.runner.plan.effectClass || payload.effectClass !== claim.runner.effectClass ||
        payload.effectKey !== prepared.runner.plan.effectKey || payload.effectKey !== claim.runner.effectKey ||
        claim.runner.validationId !== prepared.runner.plan.validationId) {
      errors.push("Terminal Runner result identity does not exactly match the trusted Runner plan and claim.");
    }
  }
  let expectedSuccessor;
  try {
    expectedSuccessor = buildActiveToCompleteSuccessor(
      prepared.plan, prepared.planArtifact, prepared.state, prepared.stateArtifact, prepared.mission.id, result.completedAt,
    );
  } catch {}
  if (expectedSuccessor === undefined || !sameJson(successor, expectedSuccessor) ||
      successor.predecessorSha256 !== prepared.stateArtifact.sha256 || successor.sequence !== prepared.state.sequence + 1 ||
      successor.missions[prepared.mission.id].status !== "complete" || successor.missions[prepared.mission.id].revision !== prepared.repositoryBefore.head) {
    errors.push("Terminal successor does not complete the selected exact active mission.");
  }
  if (errors.length > 0) throw new Error(errors.join(" "));
  return { claim, successor, result, claimIdentity, successorIdentity, resultIdentity: identity(step.result) };
};

const snapshotDependencies = (trusted) => {
  exactDataObject(trusted, DEPENDENCY_FIELDS, DEPENDENCY_OPTIONAL_FIELDS, "trustedDependencies");
  if (!Object.isFrozen(trusted)) throw new Error("trustedDependencies must be frozen before dispatch.");
  for (const field of DEPENDENCY_FIELDS.slice(0, 5)) if (typeof trusted[field] !== "function") throw new Error(`trustedDependencies.${field} must be a function.`);
  exactDataObject(trusted.adapterDescriptor, DESCRIPTOR_FIELDS, [], "trustedDependencies.adapterDescriptor");
  if (!Object.isFrozen(trusted.adapterDescriptor)) throw new Error("adapterDescriptor must be frozen.");
  if (!sameJson({
    adapterId: trusted.adapterDescriptor.adapterId,
    adapterVersion: trusted.adapterDescriptor.adapterVersion,
    capabilityClass: trusted.adapterDescriptor.capabilityClass,
  }, ADAPTER_POLICY) || ![trusted.adapterDescriptor.runtimeId, trusted.adapterDescriptor.executorId].every((entry) =>
    typeof entry === "string" && HOST_IDENTITY_PATTERN.test(entry)) ||
      trusted.adapterDescriptor.runtimeId === trusted.adapterDescriptor.executorId) {
    throw new Error("Trusted Daisy adapter descriptor does not match the fixed Slice 2 policy.");
  }
  exactDataObject(trusted.clock, ["now"], [], "trustedDependencies.clock");
  if (!Object.isFrozen(trusted.clock) || typeof trusted.clock.now !== "function") throw new Error("Trusted clock must be a frozen now() dependency.");
  const stepStore = trusted.stepStore ?? builtInStepStore;
  exactDataObject(stepStore, STORE_FIELDS, [], "trustedDependencies.stepStore");
  if (!Object.isFrozen(stepStore)) throw new Error("Trusted stepStore must be frozen.");
  for (const field of STORE_FIELDS) if (typeof stepStore[field] !== "function") throw new Error(`stepStore.${field} must be a function.`);
  const snapshots = trusted.snapshotDependencies ?? Object.freeze({});
  if (trusted.snapshotDependencies !== undefined) {
    if (isProxy(snapshots) || Object.getPrototypeOf(snapshots) !== Object.prototype || !Object.isFrozen(snapshots)) {
      throw new Error("Trusted snapshotDependencies must be a frozen strict plain object.");
    }
    for (const key of Reflect.ownKeys(snapshots)) {
      const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(snapshots, key) : undefined;
      if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") {
        throw new Error("Trusted snapshotDependencies may contain only own enumerable function fields.");
      }
    }
  }
  return Object.freeze({
    loadRunnerCycleInput: trusted.loadRunnerCycleInput,
    authorizeRunner: trusted.authorizeRunner,
    invokeDaisyAdapter: trusted.invokeDaisyAdapter,
    validateDaisyResult: trusted.validateDaisyResult,
    observeRepository: trusted.observeRepository,
    adapterDescriptor: Object.freeze(deepCopy(trusted.adapterDescriptor)),
    claimStoreRoot: trusted.claimStoreRoot,
    clock: trusted.clock,
    stepStore,
    snapshotDependencies: snapshots,
  });
};

const validateCaller = (input) => {
  exactDataObject(input, CALLER_FIELDS, CALLER_OPTIONAL_FIELDS, "Feature Flight step input");
  exactDataObject(input.routing, ["flightId", "missionId"], [], "Feature Flight routing hint");
  if (input.maxSteps !== 1) throw new Error("Feature Flight Slice 2 requires maxSteps:1.");
  if (![input.expectedPlanSha256, input.expectedStateSha256].every((value) => SHA256_PATTERN.test(value ?? ""))) throw new Error("Expected artifact digests are malformed.");
  if (!Number.isSafeInteger(input.expectedStateSequence) || input.expectedStateSequence < 0) throw new Error("Expected state sequence is malformed.");
  const hasPredecessor = input.predecessorStatePath !== undefined || input.expectedPredecessorSha256 !== undefined;
  if ((input.expectedStateSequence === 0) === hasPredecessor) throw new Error("Predecessor flags do not match the state sequence.");
  return deepCopy(input);
};

const validateRepository = (value) => {
  exactDataObject(value, ["root", "branch", "head", "clean"], [], "repository observation");
  if (typeof value.root !== "string" || typeof value.branch !== "string" || !GIT_REVISION_PATTERN.test(value.head ?? "") || typeof value.clean !== "boolean") {
    throw new Error("Repository observation is malformed.");
  }
  return deepCopy(value);
};

const runnerSnapshot = async (loaded) => {
  exactDataObject(loaded, ["input", "canonicalBytes", "sha256"], [], "trusted Runner replay");
  const bytes = typeof loaded.canonicalBytes === "string" ? Buffer.from(loaded.canonicalBytes, "utf8")
    : Buffer.from(loaded.canonicalBytes);
  const checked = validateRunnerCycleInput(loaded.input);
  if (checked.state !== "valid") throw new Error(`Trusted Runner replay is malformed: ${checked.errors.join(" ")}`);
  const input = deepCopy(checked.value);
  const expectedBytes = Buffer.from(canonicalJson(input), "utf8");
  if (!bytes.equals(expectedBytes) || sha256(bytes) !== loaded.sha256 || !SHA256_PATTERN.test(loaded.sha256 ?? "")) {
    throw new Error("Trusted Runner replay canonical bytes or digest do not match its input.");
  }
  return { input, sha256: loaded.sha256 };
};

const prepare = async (caller, dependencies) => {
  const status = await computeFeatureFlightStatus(caller, { snapshot: dependencies.snapshotDependencies });
  if (status.globalStop?.code !== "authority-verification-required") throw new Error("Slice 2 requires the exact structural authority-verification-required boundary.");
  const [planSnapshot, stateSnapshot, predecessorSnapshot] = await Promise.all([
    readFlightJsonSnapshot(caller.planPath, dependencies.snapshotDependencies),
    readFlightJsonSnapshot(caller.statePath, dependencies.snapshotDependencies),
    caller.predecessorStatePath === undefined ? null : readFlightJsonSnapshot(caller.predecessorStatePath, dependencies.snapshotDependencies),
  ]);
  if (planSnapshot.sha256 !== caller.expectedPlanSha256 || stateSnapshot.sha256 !== caller.expectedStateSha256 ||
      (predecessorSnapshot !== null && predecessorSnapshot.sha256 !== caller.expectedPredecessorSha256)) throw new Error("Flight snapshots changed after structural replay.");
  const plan = assertResolvedPlan(planSnapshot.value);
  const planArtifact = artifactIdentity(planSnapshot);
  const state = assertFlightState(plan, planArtifact, stateSnapshot.value);
  const predecessor = predecessorSnapshot === null ? null : assertFlightState(plan, planArtifact, predecessorSnapshot.value, "predecessor");
  const loadedRunner = await runnerSnapshot(await dependencies.loadRunnerCycleInput(Object.freeze({
    flightId: caller.routing.flightId,
    missionId: caller.routing.missionId,
    plan: planArtifact,
    state: artifactIdentity(stateSnapshot),
    predecessor: predecessorSnapshot === null ? null : artifactIdentity(predecessorSnapshot),
  })));
  const runner = loadedRunner.input;
  const mission = plan.missions.find((candidate) => candidate.id === caller.routing.missionId);
  if (caller.routing.flightId !== plan.flightId || mission === undefined || runner.plan.missionId !== mission.id ||
      runner.projection.missionId !== mission.id || runner.resolvedModeContext.seatId !== "daisy" || runner.plan.seatId !== "daisy" ||
      runner.projection.journalSchemaVersion !== 9 || runner.plan.subjectId !== runner.projection.subjectId ||
      runner.plan.revisionId !== runner.projection.revisionId || runner.plan.evaluatedThroughSequence !== runner.projection.evaluatedThroughSequence ||
      runner.plan.actionId !== ACTION_ID || runner.plan.effectClass !== "coordination" || runner.plan.validationId !== VALIDATION_ID ||
      runner.plan.stopCondition !== "after_one_cycle" || !runner.actionAllowlist.includes(ACTION_ID) ||
      !runner.projection.participantSeatIds.includes("daisy")) throw new Error("Trusted Runner replay does not bind the fixed active Daisy policy.");
  if (mission.dependsOn.length !== 0 || state.missions[mission.id].status !== "active" ||
      state.lanes[mission.lane].activeMissionId !== mission.id || !GIT_REVISION_PATTERN.test(state.missions[mission.id].revision ?? "") ||
      plan.lanes.some((lane) => lane.id !== mission.lane && state.lanes[lane.id].activeMissionId !== null) ||
      plan.missions.some((candidate) => candidate.id !== mission.id && AUTHORITY_DERIVED_STATUSES.has(state.missions[candidate.id].status)) ||
      (predecessor !== null && plan.missions.some((candidate) => candidate.id !== mission.id &&
        AUTHORITY_DERIVED_STATUSES.has(predecessor.missions[candidate.id].status))) ||
      plan.missions.some((candidate) => candidate.id !== mission.id && OPERATOR_DISPOSITION_STATUSES.has(state.missions[candidate.id].status))) {
    throw new Error("Flight state does not contain one admissible dependency-free active Daisy mission.");
  }
  if (predecessor !== null && !["authorized", "active"].includes(predecessor.missions[mission.id].status)) {
    throw new Error("Selected mission predecessor status is not authorized or active.");
  }
  const repositoryBefore = validateRepository(await dependencies.observeRepository(mission.worktree));
  if (repositoryBefore.root !== mission.worktree || repositoryBefore.branch !== mission.branch ||
      repositoryBefore.head !== state.missions[mission.id].revision || repositoryBefore.clean !== true) {
    throw new Error("Host-observed repository identity does not match the active flight mission.");
  }
  const effectClaimId = digestValue({
    domain: "shield-feature-flight-effect-claim.v1",
    flightId: plan.flightId,
    planSha256: planArtifact.sha256,
    missionId: mission.id,
    subjectId: runner.plan.subjectId,
    missionRevision: runner.plan.revisionId,
    actionId: runner.plan.actionId,
    effectClass: runner.plan.effectClass,
    effectKey: runner.plan.effectKey,
  });
  return {
    caller, dependencies, plan, state, predecessor, mission, runner, effectClaimId,
    planArtifact, stateArtifact: artifactIdentity(stateSnapshot),
    predecessorArtifact: predecessorSnapshot === null ? null : artifactIdentity(predecessorSnapshot),
    runnerInputSha256: loadedRunner.sha256, repositoryBefore,
    adapterDescriptor: dependencies.adapterDescriptor,
    claimStoreRoot: dependencies.claimStoreRoot,
    excludedRoots: [plan.repository.root, ...plan.missions.map((candidate) => candidate.worktree)],
    invocationCount: 0,
  };
};

const attemptCore = (prepared) => ({
  plan: prepared.planArtifact,
  currentState: prepared.stateArtifact,
  predecessor: prepared.predecessorArtifact,
  sequence: prepared.state.sequence,
  runnerInputSha256: prepared.runnerInputSha256,
  journalSequence: prepared.runner.plan.evaluatedThroughSequence,
  cycleId: prepared.runner.plan.cycleId,
  validationId: prepared.runner.plan.validationId,
  repository: prepared.repositoryBefore,
  adapter: prepared.adapterDescriptor,
});

const buildClaim = (prepared, claimedAt) => {
  const attemptDigest = digestValue({ ...attemptCore(prepared), claimedAt });
  return {
    schemaVersion: 1,
    artifactType: "feature-flight-step-claim",
    authority: "none",
    notice: CLAIM_NOTICE,
    contract: { name: "shield-feature-flight-step", version: FEATURE_FLIGHT_STEP_CONTRACT_VERSION },
    effectClaimId: prepared.effectClaimId,
    attemptDigest,
    flightId: prepared.plan.flightId,
    plan: prepared.planArtifact,
    currentState: prepared.stateArtifact,
    predecessor: prepared.predecessorArtifact,
    flight: { sequence: prepared.state.sequence, wave: prepared.state.wave.current, missionId: prepared.mission.id, lane: prepared.mission.lane },
    repository: prepared.repositoryBefore,
    runner: resultBase(prepared).runner,
    adapter: prepared.adapterDescriptor,
    claimedAt,
  };
};

const existingDisposition = async (prepared) => {
  let step;
  try { step = await prepared.dependencies.stepStore.readStep(storeInput(prepared)); }
  catch { return recoveryProjection(prepared, "store_unavailable"); }
  if (step.status === "absent") return null;
  if (step.status === "terminal") {
    try {
      const triad = validateTriad(prepared, step);
      return {
        schemaVersion: 1, resultType: "feature-flight-step-projection", ...resultBase(prepared), outcome: "replayed",
        invocationCount: 0, claim: triad.claimIdentity, successor: triad.successorIdentity, result: triad.resultIdentity,
        terminal: triad.result, gateEligible: false,
      };
    } catch { return recoveryProjection(prepared, "terminal_triad_conflict", step); }
  }
  return recoveryProjection(prepared, step.status === "conflicting" ? "attempt_conflict" : "incomplete_step", step);
};

export const runFeatureFlightStepV1 = async (input, trustedDependencies) => {
  let caller;
  let dependencies;
  try {
    caller = validateCaller(input);
    dependencies = snapshotDependencies(trustedDependencies);
  } catch (error) {
    throw new Error(`Feature Flight step rejected before effects: ${error.message}`);
  }
  let prepared;
  try { prepared = await prepare(caller, dependencies); }
  catch (error) { throw new Error(`Feature Flight step rejected before effects: ${error.message}`); }

  const existing = await existingDisposition(prepared);
  if (existing !== null) return existing;

  let claimReached = false;
  let claimArtifact;
  let claimDirectoryIdentity;
  let runnerContract;
  try {
    runnerContract = await runRunnerCycle(prepared.runner, {
      authorize: dependencies.authorizeRunner,
      claim: async () => {
        claimReached = true;
        const claimedAt = timestamp(await dependencies.clock.now(), "claim timestamp");
        const claim = buildClaim(prepared, claimedAt);
        if (validateFeatureFlightStepClaim(claim).length > 0) return { runnerContractVersion: 1, outcome: "blocked", reason: "invocation_claim_failed" };
        try {
          const claimed = await dependencies.stepStore.claimStep(storeInput(prepared, { claim }));
          if (claimed.status !== "claimed") return { runnerContractVersion: 1, outcome: "blocked", reason: "invocation_claim_conflict" };
          claimArtifact = claimed.claim;
          claimDirectoryIdentity = claimed.directoryIdentity;
          return { runnerContractVersion: 1, outcome: "claimed" };
        } catch {
          return { runnerContractVersion: 1, outcome: "blocked", reason: "invocation_claim_failed" };
        }
      },
      execute: async (plan, decision) => {
        prepared.invocationCount += 1;
        if (prepared.invocationCount !== 1) throw new Error("Daisy adapter invocation count exceeded one.");
        return dependencies.invokeDaisyAdapter(plan, decision, prepared.adapterDescriptor);
      },
      validate: dependencies.validateDaisyResult,
    });
  } catch {
    runnerContract = null;
  }
  const runnerResult = runnerContract?.state === "valid" ? runnerContract.value : null;
  if (runnerResult?.outcome !== "advanced" || runnerResult.reason !== "effect_completed") {
    if (!claimReached) return stoppedProjection(prepared, runnerResult);
    return (await existingDisposition(prepared)) ?? recoveryProjection(prepared, "claim_boundary_uncertain");
  }
  if (prepared.invocationCount !== 1 || claimArtifact === undefined || claimDirectoryIdentity === undefined) {
    return recoveryProjection(prepared, "invocation_or_claim_uncertain");
  }

  let repositoryAfter;
  try { repositoryAfter = validateRepository(await dependencies.observeRepository(prepared.mission.worktree)); }
  catch { return recoveryProjection(prepared, "repository_readback_unavailable"); }
  if (!sameJson(repositoryAfter, prepared.repositoryBefore)) return recoveryProjection(prepared, "repository_changed_after_daisy");

  let successor;
  let successorSnapshot;
  try {
    const completedAt = timestamp(await dependencies.clock.now(), "completion timestamp");
    successor = buildActiveToCompleteSuccessor(
      prepared.plan, prepared.planArtifact, prepared.state, prepared.stateArtifact, prepared.mission.id, completedAt,
    );
    successorSnapshot = await dependencies.stepStore.writeSuccessor(storeInput(prepared, {
      successor, expectedDirectoryIdentity: claimDirectoryIdentity,
    }));
    const successorErrors = validateFeatureFlightStepSuccessor(prepared.plan, prepared.planArtifact, prepared.state, successorSnapshot.value);
    if (successorErrors.length > 0) throw new Error(successorErrors.join(" "));
    const claim = claimArtifact.value;
    const result = {
      schemaVersion: 1,
      artifactType: "feature-flight-step-result",
      authority: "none",
      notice: RESULT_NOTICE,
      contract: { name: "shield-feature-flight-step", version: FEATURE_FLIGHT_STEP_CONTRACT_VERSION },
      effectClaimId: prepared.effectClaimId,
      attemptDigest: claim.attemptDigest,
      flightId: prepared.plan.flightId,
      claim: identity(claimArtifact),
      successor: identity(successorSnapshot),
      runnerResult,
      runnerResultSha256: digestValue(runnerResult),
      repositoryBefore: prepared.repositoryBefore,
      repositoryAfter,
      adapter: prepared.adapterDescriptor,
      invocationCount: 1,
      claimedAt: claim.claimedAt,
      completedAt,
      outcome: "completed",
      effectContainment: "external_uncertain_repository_unchanged",
      gateEligible: false,
    };
    const resultErrors = validateFeatureFlightStepResult(result);
    if (resultErrors.length > 0) throw new Error(resultErrors.join(" "));
    await dependencies.stepStore.writeResult(storeInput(prepared, {
      result, expectedDirectoryIdentity: claimDirectoryIdentity,
    }));
  } catch {
    return recoveryProjection(prepared, successorSnapshot === undefined ? "successor_write_uncertain" : "result_write_uncertain");
  }

  let terminal;
  try {
    terminal = await dependencies.stepStore.readStep(storeInput(prepared, { expectedDirectoryIdentity: claimDirectoryIdentity }));
    const triad = validateTriad(prepared, terminal);
    return {
      schemaVersion: 1, resultType: "feature-flight-step-projection", ...resultBase(prepared), outcome: "completed",
      invocationCount: 1, claim: triad.claimIdentity, successor: triad.successorIdentity, result: triad.resultIdentity,
      terminal: triad.result, gateEligible: false,
    };
  } catch {
    return recoveryProjection(prepared, "final_readback_uncertain", terminal);
  }
};
