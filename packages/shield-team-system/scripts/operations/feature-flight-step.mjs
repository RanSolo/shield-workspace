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
import {
  canonicalFeatureFlightBytes,
  exactFeatureFlightObject,
  FEATURE_FLIGHT_NEXT_ACTION,
  FEATURE_FLIGHT_RECOVERY_CONTRACT_VERSION,
  FEATURE_FLIGHT_RECOVERY_NOTICE,
  FEATURE_FLIGHT_TERMINAL_NOTICE,
  featureFlightArtifactIdentity,
  featureFlightContract,
  featureFlightDigest,
  featureFlightPayload,
  featureFlightRemoteChallenge,
  validateFeatureFlightRecovery,
  validateFeatureFlightRemoteObservation,
  validateFeatureFlightRemoteObserverDescriptor,
  validateFeatureFlightTerminal,
  validateFeatureFlightTimestamp,
} from "./feature-flight-recovery.mjs";
import * as defaultStepStore from "./feature-flight-step-store.mjs";

export const FEATURE_FLIGHT_STEP_CONTRACT_VERSION = FEATURE_FLIGHT_RECOVERY_CONTRACT_VERSION;

const LEGACY_VERSION = "1.0.0";
const ACTION_ID = "action:feature-flight.daisy.reconnaissance";
const VALIDATION_ID = "validation:feature-flight.daisy-result-v1";
const CLAIM_NOTICE = "Durable execute-once coordination claim only. This artifact grants no authority.";
const RESULT_NOTICE = "Coordination evidence only. This triad is not human acceptance or implementation authority.";
const ADAPTER_POLICY = Object.freeze({ adapterId: "shield.daisy.readonly", adapterVersion: "1.0.0", capabilityClass: "read_only_coordination" });
const CALLER_FIELDS = ["planPath", "expectedPlanSha256", "statePath", "expectedStateSha256", "expectedStateSequence", "maxSteps", "routing"];
const CALLER_OPTIONAL_FIELDS = ["predecessorStatePath", "expectedPredecessorSha256"];
const DEPENDENCY_FIELDS = [
  "loadRunnerCycleInput", "authorizeRunner", "invokeDaisyAdapter", "validateDaisyResult", "observeRepository",
  "observeRemoteBranch", "adapterDescriptor", "remoteObserverDescriptor", "claimStoreRoot", "clock",
];
const DEPENDENCY_OPTIONAL_FIELDS = ["stepStore", "snapshotDependencies"];
const ADAPTER_FIELDS = ["adapterId", "adapterVersion", "capabilityClass", "runtimeId", "executorId"];
const STORE_FIELDS = ["claimStep", "readStep", "arbitrateTerminal", "materializeTerminal", "writeSuccessor", "writeResult"];
const HOST_IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const builtInStepStore = Object.freeze(Object.fromEntries(STORE_FIELDS.map((field) => [field, defaultStepStore[field]])));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalValue = (value) => Array.isArray(value) ? value.map(canonicalValue)
  : value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])])) : value;
const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
const deepCopy = (value) => structuredClone(value);
const sameJson = (left, right) => canonicalJson(left) === canonicalJson(right);
const identity = (snapshot) => ({ path: snapshot.path, bytes: snapshot.bytes.length, sha256: sha256(snapshot.bytes) });
const exactDataObject = exactFeatureFlightObject;
const timestamp = validateFeatureFlightTimestamp;

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
    missionId: prepared.runner.plan.missionId, subjectId: prepared.runner.plan.subjectId, revisionId: prepared.runner.plan.revisionId,
    evaluatedThroughSequence: prepared.runner.plan.evaluatedThroughSequence, cycleId: prepared.runner.plan.cycleId,
    seatId: prepared.runner.plan.seatId, actionId: prepared.runner.plan.actionId, effectClass: prepared.runner.plan.effectClass,
    effectKey: prepared.runner.plan.effectKey, validationId: prepared.runner.plan.validationId, inputSha256: prepared.runnerInputSha256,
  },
  adapter: deepCopy(prepared.adapterDescriptor),
  remoteObserver: deepCopy(prepared.remoteObserverDescriptor),
});

const handoff = (prepared, reason, phase, step = null) => ({
  reason, phase, flightId: prepared.plan.flightId, missionId: prepared.mission.id, effectClaimId: prepared.effectClaimId,
  claim: step?.claim && !step.claim.invalid ? identity(step.claim) : null,
  terminal: step?.terminal && !step.terminal.invalid ? identity(step.terminal) : null,
  recovery: step?.recovery && !step.recovery.invalid ? identity(step.recovery) : null,
  nextAction: FEATURE_FLIGHT_NEXT_ACTION,
});

const PRECHECK_PHASE = Object.freeze({
  precheck_remote_observation_unavailable: "remote_precheck",
  remote_observation_malformed: "remote_precheck",
  remote_descriptor_mismatch: "remote_precheck",
  remote_repository_identity_mismatch: "remote_precheck",
  remote_phase_or_challenge_stale: "remote_precheck",
  preexisting_remote_drift: "remote_precheck",
});
const EPHEMERAL_PHASE = Object.freeze({
  legacy_incomplete: "store_replay", unsupported_or_malformed_store: "store_replay", terminal_conflict: "store_replay",
  store_unavailable: "store_replay", terminal_arbitration_uncertain: "terminal_arbitration",
  successor_materialization_uncertain: "successor_materialization", result_materialization_uncertain: "result_materialization",
  recovery_materialization_uncertain: "recovery_materialization", final_readback_uncertain: "final_readback",
});

const stoppedProjection = (prepared, reason, runnerResult = null) => ({
  schemaVersion: 1, resultType: "feature-flight-step-projection", ...resultBase(prepared), outcome: "stopped", reason,
  phase: PRECHECK_PHASE[reason] ?? "adapter", invocationCount: 0, runnerResult, gateEligible: false,
  handoff: handoff(prepared, reason, PRECHECK_PHASE[reason] ?? "adapter"),
});
const ephemeralRecovery = (prepared, reason, step = null) => ({
  schemaVersion: 1, resultType: "feature-flight-step-projection", ...resultBase(prepared), outcome: "recovery_required", reason,
  phase: EPHEMERAL_PHASE[reason] ?? "store_replay", invocationCount: 0, storeStatus: step?.status ?? "unavailable",
  durable: false, gateEligible: false, handoff: handoff(prepared, reason, EPHEMERAL_PHASE[reason] ?? "store_replay", step),
});

const artifactErrors = (value, fields, type, version = FEATURE_FLIGHT_STEP_CONTRACT_VERSION) => {
  try { exactDataObject(value, fields, [], type); } catch (error) { return [error.message]; }
  const errors = [];
  if (value.schemaVersion !== 1 || value.artifactType !== type || value.authority !== "none") errors.push(`${type} contract envelope is invalid.`);
  try { exactDataObject(value.contract, ["name", "version"], [], `${type}.contract`); }
  catch (error) { errors.push(error.message); }
  if (value.contract?.name !== "shield-feature-flight-step" || value.contract?.version !== version) errors.push(`${type} contract identity is invalid.`);
  return errors;
};

const CLAIM_FIELDS = [
  "schemaVersion", "artifactType", "authority", "notice", "contract", "effectClaimId", "attemptDigest", "flightId", "plan",
  "currentState", "predecessor", "flight", "repository", "runner", "adapter", "remoteObserver", "baselineRemoteObservation", "claimedAt",
];
const LEGACY_CLAIM_FIELDS = CLAIM_FIELDS.filter((field) => !["remoteObserver", "baselineRemoteObservation"].includes(field));
const RESULT_FIELDS = [
  "schemaVersion", "artifactType", "authority", "notice", "contract", "effectClaimId", "attemptDigest", "flightId", "claim",
  "successor", "runnerResult", "runnerResultSha256", "repositoryBefore", "repositoryAfter", "adapter", "remoteObserver",
  "baselineRemoteObservation", "latestRemoteObservation", "invocationCount", "claimedAt", "completedAt", "outcome",
  "effectContainment", "gateEligible",
];
const LEGACY_RESULT_FIELDS = RESULT_FIELDS.filter((field) => !["remoteObserver", "baselineRemoteObservation", "latestRemoteObservation"].includes(field));

const validateAdapter = (value, label) => exactDataObject(value, ADAPTER_FIELDS, [], label);
const validateRepository = (value, label = "repository observation") => {
  exactDataObject(value, ["root", "branch", "head", "clean", "commonGitDirectory", "commonGitDevice", "commonGitInode", "configuredRemoteUrl"], [], label);
  if (typeof value.root !== "string" || typeof value.branch !== "string" || !GIT_REVISION_PATTERN.test(value.head ?? "") || value.clean !== true ||
      typeof value.commonGitDirectory !== "string" || !Number.isSafeInteger(value.commonGitDevice) || value.commonGitDevice < 0 ||
      !Number.isSafeInteger(value.commonGitInode) || value.commonGitInode < 0 || typeof value.configuredRemoteUrl !== "string") {
    throw new Error(`${label} is malformed.`);
  }
  return deepCopy(value);
};

export const validateFeatureFlightStepClaim = (value) => {
  const errors = artifactErrors(value, CLAIM_FIELDS, "feature-flight-step-claim");
  if (errors.length !== 0) return errors;
  try {
    if (!SHA256_PATTERN.test(value.effectClaimId ?? "") || !SHA256_PATTERN.test(value.attemptDigest ?? "") || value.notice !== CLAIM_NOTICE) throw new Error("Claim identity is invalid.");
    timestamp(value.claimedAt, "claim.claimedAt");
    exactDataObject(value.plan, ["path", "bytes", "sha256"], [], "claim.plan");
    exactDataObject(value.currentState, ["path", "bytes", "sha256"], [], "claim.currentState");
    if (value.predecessor !== null) exactDataObject(value.predecessor, ["path", "bytes", "sha256"], [], "claim.predecessor");
    exactDataObject(value.flight, ["sequence", "wave", "missionId", "lane"], [], "claim.flight");
    validateRepository(value.repository, "claim.repository");
    exactDataObject(value.runner, ["missionId", "subjectId", "revisionId", "evaluatedThroughSequence", "cycleId", "seatId", "actionId", "effectClass", "effectKey", "validationId", "inputSha256"], [], "claim.runner");
    validateAdapter(value.adapter, "claim.adapter");
    const descriptor = Object.freeze(deepCopy(value.remoteObserver));
    validateFeatureFlightRemoteObserverDescriptor(descriptor);
    const challenge = featureFlightRemoteChallenge(value.effectClaimId, descriptor, value.baselineRemoteObservation.fullRef, "pre_claim");
    validateFeatureFlightRemoteObservation(value.baselineRemoteObservation, {
      descriptor, fullRef: value.baselineRemoteObservation.fullRef, phase: "pre_claim", challenge,
    });
  } catch (error) { errors.push(error.message); }
  return errors;
};

export const validateFeatureFlightStepSuccessor = (plan, planIdentity, predecessor, value) => {
  try { assertFlightState(plan, planIdentity, value, "successor"); return validateImmediateTransition(plan, predecessor, value); }
  catch (error) { return [error.message]; }
};

export const validateFeatureFlightStepResult = (value) => {
  const errors = artifactErrors(value, RESULT_FIELDS, "feature-flight-step-result");
  if (errors.length !== 0) return errors;
  try {
    if (value.notice !== RESULT_NOTICE || value.outcome !== "completed" || value.invocationCount !== 1 || value.gateEligible !== false ||
        value.effectContainment !== "external_uncertain_repository_unchanged") throw new Error("Result terminal disposition is invalid.");
    if (!sameJson(value.repositoryBefore, value.repositoryAfter)) throw new Error("Result repository readbacks differ.");
    for (const [label, item] of [["result.claim", value.claim], ["result.successor", value.successor]]) exactDataObject(item, ["path", "bytes", "sha256"], [], label);
    validateRepository(value.repositoryBefore, "result.repositoryBefore");
    validateRepository(value.repositoryAfter, "result.repositoryAfter");
    validateAdapter(value.adapter, "result.adapter");
    const descriptor = Object.freeze(deepCopy(value.remoteObserver));
    validateFeatureFlightRemoteObserverDescriptor(descriptor);
    const baselineChallenge = featureFlightRemoteChallenge(value.effectClaimId, descriptor, value.baselineRemoteObservation.fullRef, "pre_claim");
    validateFeatureFlightRemoteObservation(value.baselineRemoteObservation, {
      descriptor, fullRef: value.baselineRemoteObservation.fullRef, phase: "pre_claim", challenge: baselineChallenge,
    });
    const latestChallenge = featureFlightRemoteChallenge(value.effectClaimId, descriptor, value.baselineRemoteObservation.fullRef, "post_adapter");
    validateFeatureFlightRemoteObservation(value.latestRemoteObservation, {
      descriptor, fullRef: value.baselineRemoteObservation.fullRef, phase: "post_adapter", challenge: latestChallenge,
    });
    timestamp(value.claimedAt, "result.claimedAt"); timestamp(value.completedAt, "result.completedAt");
    if (Date.parse(value.completedAt) < Date.parse(value.claimedAt)) throw new Error("Result completion timestamp precedes claim timestamp.");
  } catch (error) { errors.push(error.message); }
  return errors;
};

const snapshotDependencies = (trusted) => {
  exactDataObject(trusted, DEPENDENCY_FIELDS, DEPENDENCY_OPTIONAL_FIELDS, "trustedDependencies");
  if (!Object.isFrozen(trusted)) throw new Error("trustedDependencies must be frozen before dispatch.");
  for (const field of DEPENDENCY_FIELDS.slice(0, 6)) if (typeof trusted[field] !== "function") throw new Error(`trustedDependencies.${field} must be a function.`);
  exactDataObject(trusted.adapterDescriptor, ADAPTER_FIELDS, [], "trustedDependencies.adapterDescriptor");
  if (!Object.isFrozen(trusted.adapterDescriptor)) throw new Error("adapterDescriptor must be frozen.");
  if (!sameJson({ adapterId: trusted.adapterDescriptor.adapterId, adapterVersion: trusted.adapterDescriptor.adapterVersion, capabilityClass: trusted.adapterDescriptor.capabilityClass }, ADAPTER_POLICY) ||
      ![trusted.adapterDescriptor.runtimeId, trusted.adapterDescriptor.executorId].every((entry) => typeof entry === "string" && HOST_IDENTITY_PATTERN.test(entry)) ||
      trusted.adapterDescriptor.runtimeId === trusted.adapterDescriptor.executorId) throw new Error("Trusted Daisy adapter descriptor does not match the fixed policy.");
  const remoteObserverDescriptor = validateFeatureFlightRemoteObserverDescriptor(trusted.remoteObserverDescriptor);
  exactDataObject(trusted.clock, ["now"], [], "trustedDependencies.clock");
  if (!Object.isFrozen(trusted.clock) || typeof trusted.clock.now !== "function") throw new Error("Trusted clock must be a frozen now() dependency.");
  const stepStore = trusted.stepStore ?? builtInStepStore;
  exactDataObject(stepStore, STORE_FIELDS, [], "trustedDependencies.stepStore");
  if (!Object.isFrozen(stepStore)) throw new Error("Trusted stepStore must be frozen.");
  for (const field of STORE_FIELDS) if (typeof stepStore[field] !== "function") throw new Error(`stepStore.${field} must be a function.`);
  const snapshots = trusted.snapshotDependencies ?? Object.freeze({});
  if (trusted.snapshotDependencies !== undefined) {
    if (isProxy(snapshots) || Object.getPrototypeOf(snapshots) !== Object.prototype || !Object.isFrozen(snapshots)) throw new Error("Trusted snapshotDependencies must be a frozen strict plain object.");
    for (const key of Reflect.ownKeys(snapshots)) {
      const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(snapshots, key) : undefined;
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") throw new Error("Trusted snapshotDependencies may contain only own enumerable function fields.");
    }
  }
  return Object.freeze({
    loadRunnerCycleInput: trusted.loadRunnerCycleInput, authorizeRunner: trusted.authorizeRunner,
    invokeDaisyAdapter: trusted.invokeDaisyAdapter, validateDaisyResult: trusted.validateDaisyResult,
    observeRepository: trusted.observeRepository, observeRemoteBranch: trusted.observeRemoteBranch,
    adapterDescriptor: Object.freeze(deepCopy(trusted.adapterDescriptor)), remoteObserverDescriptor,
    claimStoreRoot: trusted.claimStoreRoot, clock: trusted.clock, stepStore, snapshotDependencies: snapshots,
  });
};

const validateCaller = (input) => {
  exactDataObject(input, CALLER_FIELDS, CALLER_OPTIONAL_FIELDS, "Feature Flight step input");
  exactDataObject(input.routing, ["flightId", "missionId"], [], "Feature Flight routing hint");
  if (input.maxSteps !== 1) throw new Error("Feature Flight requires maxSteps:1.");
  if (![input.expectedPlanSha256, input.expectedStateSha256].every((value) => SHA256_PATTERN.test(value ?? ""))) throw new Error("Expected artifact digests are malformed.");
  if (!Number.isSafeInteger(input.expectedStateSequence) || input.expectedStateSequence < 0) throw new Error("Expected state sequence is malformed.");
  const hasPredecessor = input.predecessorStatePath !== undefined || input.expectedPredecessorSha256 !== undefined;
  if ((input.expectedStateSequence === 0) === hasPredecessor) throw new Error("Predecessor flags do not match the state sequence.");
  return deepCopy(input);
};

const runnerSnapshot = async (loaded) => {
  exactDataObject(loaded, ["input", "canonicalBytes", "sha256"], [], "trusted Runner replay");
  const bytes = typeof loaded.canonicalBytes === "string" ? Buffer.from(loaded.canonicalBytes, "utf8") : Buffer.from(loaded.canonicalBytes);
  const checked = validateRunnerCycleInput(loaded.input);
  if (checked.state !== "valid") throw new Error(`Trusted Runner replay is malformed: ${checked.errors.join(" ")}`);
  const input = deepCopy(checked.value);
  const expectedBytes = Buffer.from(canonicalJson(input), "utf8");
  if (!bytes.equals(expectedBytes) || sha256(bytes) !== loaded.sha256 || !SHA256_PATTERN.test(loaded.sha256 ?? "")) throw new Error("Trusted Runner replay canonical bytes or digest do not match its input.");
  return { input, sha256: loaded.sha256 };
};

const successfulStepHostInputs = (trusted) => {
  exactDataObject(trusted, ["adapterDescriptor", "remoteObserverDescriptor", "claimStoreRoot"], [], "successfulStepHostInputs");
  exactDataObject(trusted.adapterDescriptor, ADAPTER_FIELDS, [], "successfulStepHostInputs.adapterDescriptor");
  if (!Object.isFrozen(trusted) || !Object.isFrozen(trusted.adapterDescriptor)) throw new Error("Successful-step host inputs and adapter descriptor must be independently frozen.");
  if (!sameJson({ adapterId: trusted.adapterDescriptor.adapterId, adapterVersion: trusted.adapterDescriptor.adapterVersion, capabilityClass: trusted.adapterDescriptor.capabilityClass }, ADAPTER_POLICY) ||
      ![trusted.adapterDescriptor.runtimeId, trusted.adapterDescriptor.executorId].every((entry) => typeof entry === "string" && HOST_IDENTITY_PATTERN.test(entry)) ||
      trusted.adapterDescriptor.runtimeId === trusted.adapterDescriptor.executorId || typeof trusted.claimStoreRoot !== "string") {
    throw new Error("Successful-step host inputs do not match the fixed policy.");
  }
  return Object.freeze({
    adapterDescriptor: Object.freeze(deepCopy(trusted.adapterDescriptor)),
    remoteObserverDescriptor: validateFeatureFlightRemoteObserverDescriptor(trusted.remoteObserverDescriptor),
    claimStoreRoot: trusted.claimStoreRoot,
  });
};

export const prepareSuccessfulFeatureFlightStepV2 = async (callerValue, structuralStatus, snapshots, loadedRunnerValue, trustedHostInputs) => {
  const caller = validateCaller(callerValue);
  exactDataObject(snapshots, ["plan", "state", "predecessor"], [], "successful-step snapshots");
  const host = successfulStepHostInputs(trustedHostInputs);
  const status = deepCopy(structuralStatus);
  if (status.globalStop?.code !== "authority-verification-required") throw new Error("Feature Flight requires the exact structural authority-verification-required boundary.");
  const { plan: planSnapshot, state: stateSnapshot, predecessor: predecessorSnapshot } = snapshots;
  if (planSnapshot.sha256 !== caller.expectedPlanSha256 || stateSnapshot.sha256 !== caller.expectedStateSha256 ||
      (predecessorSnapshot !== null && predecessorSnapshot.sha256 !== caller.expectedPredecessorSha256)) throw new Error("Flight snapshots changed after structural replay.");
  const plan = assertResolvedPlan(planSnapshot.value); const planArtifact = artifactIdentity(planSnapshot);
  const state = assertFlightState(plan, planArtifact, stateSnapshot.value);
  const predecessor = predecessorSnapshot === null ? null : assertFlightState(plan, planArtifact, predecessorSnapshot.value, "predecessor");
  if (state.sequence !== caller.expectedStateSequence || (predecessor === null ? state.sequence !== 0 :
    predecessor.sequence !== state.sequence - 1 || state.predecessorSha256 !== predecessorSnapshot.sha256 || validateImmediateTransition(plan, predecessor, state).length !== 0)) {
    throw new Error("Flight state does not contain the exact immediate active edge.");
  }
  const loadedRunner = await runnerSnapshot(loadedRunnerValue);
  const runner = loadedRunner.input; const mission = plan.missions.find((candidate) => candidate.id === caller.routing.missionId);
  if (caller.routing.flightId !== plan.flightId || mission === undefined || runner.plan.missionId !== mission.id || runner.projection.missionId !== mission.id ||
      runner.resolvedModeContext.seatId !== "daisy" || runner.plan.seatId !== "daisy" || runner.projection.journalSchemaVersion !== 9 ||
      runner.plan.subjectId !== runner.projection.subjectId || runner.plan.revisionId !== runner.projection.revisionId ||
      runner.plan.evaluatedThroughSequence !== runner.projection.evaluatedThroughSequence || runner.plan.actionId !== ACTION_ID ||
      runner.plan.effectClass !== "coordination" || runner.plan.validationId !== VALIDATION_ID || runner.plan.stopCondition !== "after_one_cycle" ||
      !sameJson(runner.actionAllowlist, [ACTION_ID]) || !runner.projection.participantSeatIds.includes("daisy")) throw new Error("Trusted Runner replay does not bind the fixed active Daisy policy.");
  if (mission.dependsOn.length !== 0 || state.missions[mission.id].status !== "active" || state.lanes[mission.lane].activeMissionId !== mission.id ||
      !GIT_REVISION_PATTERN.test(state.missions[mission.id].revision ?? "") || plan.lanes.some((lane) => lane.id !== mission.lane && state.lanes[lane.id].activeMissionId !== null) ||
      plan.missions.some((candidate) => candidate.id !== mission.id && AUTHORITY_DERIVED_STATUSES.has(state.missions[candidate.id].status)) ||
      (predecessor !== null && plan.missions.some((candidate) => candidate.id !== mission.id && AUTHORITY_DERIVED_STATUSES.has(predecessor.missions[candidate.id].status))) ||
      plan.missions.some((candidate) => candidate.id !== mission.id && OPERATOR_DISPOSITION_STATUSES.has(state.missions[candidate.id].status))) {
    throw new Error("Flight state does not contain one admissible dependency-free active Daisy mission.");
  }
  if (predecessor !== null && !["authorized", "active"].includes(predecessor.missions[mission.id].status)) throw new Error("Selected mission predecessor status is not authorized or active.");
  const effectClaimId = featureFlightDigest({
    domain: "shield-feature-flight-effect-claim.v1", flightId: plan.flightId, planSha256: planArtifact.sha256,
    missionId: mission.id, subjectId: runner.plan.subjectId, missionRevision: runner.plan.revisionId,
    actionId: runner.plan.actionId, effectClass: runner.plan.effectClass, effectKey: runner.plan.effectKey,
  });
  return {
    plan, state, predecessor, mission, runner, effectClaimId, planArtifact,
    stateArtifact: artifactIdentity(stateSnapshot), predecessorArtifact: predecessorSnapshot === null ? null : artifactIdentity(predecessorSnapshot),
    runnerInputSha256: loadedRunner.sha256, adapterDescriptor: host.adapterDescriptor,
    remoteObserverDescriptor: host.remoteObserverDescriptor, claimStoreRoot: host.claimStoreRoot,
    excludedRoots: [plan.repository.root, ...plan.missions.map((candidate) => candidate.worktree)],
  };
};

const prepareDeterministic = async (caller, dependencies) => {
  const status = await computeFeatureFlightStatus(caller, { snapshot: dependencies.snapshotDependencies });
  const [planSnapshot, stateSnapshot, predecessorSnapshot] = await Promise.all([
    readFlightJsonSnapshot(caller.planPath, dependencies.snapshotDependencies), readFlightJsonSnapshot(caller.statePath, dependencies.snapshotDependencies),
    caller.predecessorStatePath === undefined ? null : readFlightJsonSnapshot(caller.predecessorStatePath, dependencies.snapshotDependencies),
  ]);
  const loadedRunner = await dependencies.loadRunnerCycleInput(Object.freeze({
    flightId: caller.routing.flightId, missionId: caller.routing.missionId, plan: artifactIdentity(planSnapshot), state: artifactIdentity(stateSnapshot),
    predecessor: predecessorSnapshot === null ? null : artifactIdentity(predecessorSnapshot),
  }));
  const prepared = await prepareSuccessfulFeatureFlightStepV2(caller, status, Object.freeze({
    plan: planSnapshot, state: stateSnapshot, predecessor: predecessorSnapshot,
  }), loadedRunner, Object.freeze({
    adapterDescriptor: dependencies.adapterDescriptor,
    remoteObserverDescriptor: dependencies.remoteObserverDescriptor,
    claimStoreRoot: dependencies.claimStoreRoot,
  }));
  return { ...prepared, caller, dependencies, invocationCount: 0 };
};

const fullRefFor = (prepared) => `refs/heads/${prepared.mission.branch}`;
const validateLocalPreflight = async (prepared) => {
  const observed = validateRepository(await prepared.dependencies.observeRepository(prepared.mission.worktree));
  const descriptor = prepared.remoteObserverDescriptor;
  if (observed.root !== prepared.mission.worktree || observed.branch !== prepared.mission.branch ||
      observed.head !== prepared.state.missions[prepared.mission.id].revision || observed.commonGitDirectory !== descriptor.commonGitDirectory ||
      observed.commonGitDevice !== descriptor.commonGitDevice || observed.commonGitInode !== descriptor.commonGitInode ||
      observed.root !== descriptor.repositoryRoot || observed.configuredRemoteUrl !== descriptor.configuredRemoteUrl) {
    throw new Error("Host-observed repository identity does not match the active flight mission and observer descriptor.");
  }
  return observed;
};

const observeRemote = async (prepared, phase) => {
  const fullRef = fullRefFor(prepared);
  const challenge = featureFlightRemoteChallenge(prepared.effectClaimId, prepared.remoteObserverDescriptor, fullRef, phase);
  const request = Object.freeze({ repositoryRoot: prepared.mission.worktree, remoteName: "origin", fullRef, phase, challenge });
  let raw;
  try { raw = await prepared.dependencies.observeRemoteBranch(request); }
  catch (error) { error.featureFlightRemoteUnavailable = true; throw error; }
  return validateFeatureFlightRemoteObservation(raw, { descriptor: prepared.remoteObserverDescriptor, fullRef, phase, challenge });
};

const attemptCore = (prepared) => ({
  plan: prepared.planArtifact, currentState: prepared.stateArtifact, predecessor: prepared.predecessorArtifact,
  sequence: prepared.state.sequence, runnerInputSha256: prepared.runnerInputSha256,
  journalSequence: prepared.runner.plan.evaluatedThroughSequence, cycleId: prepared.runner.plan.cycleId,
  validationId: prepared.runner.plan.validationId, repository: prepared.repositoryBefore, adapter: prepared.adapterDescriptor,
  remoteObserver: prepared.remoteObserverDescriptor, baselineRemoteObservation: prepared.baselineRemoteObservation,
});
const buildClaim = (prepared, claimedAt) => ({
  schemaVersion: 1, artifactType: "feature-flight-step-claim", authority: "none", notice: CLAIM_NOTICE,
  contract: featureFlightContract(), effectClaimId: prepared.effectClaimId,
  attemptDigest: featureFlightDigest({ ...attemptCore(prepared), claimedAt }), flightId: prepared.plan.flightId,
  plan: prepared.planArtifact, currentState: prepared.stateArtifact, predecessor: prepared.predecessorArtifact,
  flight: { sequence: prepared.state.sequence, wave: prepared.state.wave.current, missionId: prepared.mission.id, lane: prepared.mission.lane },
  repository: prepared.repositoryBefore, runner: resultBase(prepared).runner, adapter: prepared.adapterDescriptor,
  remoteObserver: prepared.remoteObserverDescriptor, baselineRemoteObservation: prepared.baselineRemoteObservation, claimedAt,
});

const expectedClaimDigest = (claim) => featureFlightDigest({
  plan: claim.plan, currentState: claim.currentState, predecessor: claim.predecessor, sequence: claim.flight.sequence,
  runnerInputSha256: claim.runner.inputSha256, journalSequence: claim.runner.evaluatedThroughSequence,
  cycleId: claim.runner.cycleId, validationId: claim.runner.validationId, repository: claim.repository, adapter: claim.adapter,
  remoteObserver: claim.remoteObserver, baselineRemoteObservation: claim.baselineRemoteObservation, claimedAt: claim.claimedAt,
});

const validatePreparedClaim = (prepared, snapshot) => {
  const claim = snapshot.value; const errors = validateFeatureFlightStepClaim(claim);
  if (claim.attemptDigest !== expectedClaimDigest(claim)) errors.push("Claim attemptDigest does not match exact attempt evidence.");
  if (claim.effectClaimId !== prepared.effectClaimId || claim.flightId !== prepared.plan.flightId || !sameJson(claim.plan, prepared.planArtifact) ||
      !sameJson(claim.currentState, prepared.stateArtifact) || !sameJson(claim.predecessor, prepared.predecessorArtifact) ||
      !sameJson(claim.runner, resultBase(prepared).runner) || !sameJson(claim.adapter, prepared.adapterDescriptor) ||
      !sameJson(claim.remoteObserver, prepared.remoteObserverDescriptor) || claim.repository.root !== prepared.mission.worktree ||
      claim.repository.branch !== prepared.mission.branch || claim.repository.head !== prepared.state.missions[prepared.mission.id].revision || claim.repository.clean !== true ||
      claim.flight.sequence !== prepared.state.sequence || claim.flight.missionId !== prepared.mission.id || claim.flight.lane !== prepared.mission.lane) {
    errors.push("Claim does not match the requested exact step.");
  }
  const challenge = featureFlightRemoteChallenge(prepared.effectClaimId, prepared.remoteObserverDescriptor, fullRefFor(prepared), "pre_claim");
  try { validateFeatureFlightRemoteObservation(claim.baselineRemoteObservation, { descriptor: prepared.remoteObserverDescriptor, fullRef: fullRefFor(prepared), phase: "pre_claim", challenge }); }
  catch (error) { errors.push(error.message); }
  if (errors.length !== 0) throw new Error(errors.join(" "));
  return claim;
};

const validateRunnerResultIdentity = (prepared, claim, runnerResult) => {
  const checked = validateRunnerCycleResult(runnerResult);
  if (checked.state !== "valid" || runnerResult.outcome !== "advanced" || runnerResult.reason !== "effect_completed") throw new Error("Terminal result does not contain one valid advanced Runner result.");
  const candidate = runnerResult.effectRecordCandidate; const payload = candidate.payload; const expected = prepared.runner.plan;
  if (runnerResult.missionId !== expected.missionId || runnerResult.subjectId !== expected.subjectId || runnerResult.revisionId !== expected.revisionId ||
      runnerResult.evaluatedThroughSequence !== expected.evaluatedThroughSequence || runnerResult.cycleId !== expected.cycleId ||
      runnerResult.actionId !== expected.actionId || runnerResult.effectKey !== expected.effectKey || candidate.missionId !== expected.missionId ||
      candidate.subjectId !== expected.subjectId || candidate.revisionId !== expected.revisionId || candidate.expectedPreviousSequence !== expected.evaluatedThroughSequence ||
      payload.cycleId !== expected.cycleId || payload.seatId !== expected.seatId || payload.actionId !== expected.actionId ||
      payload.effectClass !== expected.effectClass || payload.effectKey !== expected.effectKey || claim.runner.validationId !== expected.validationId) {
    throw new Error("Terminal Runner result identity does not match the trusted Runner plan.");
  }
};

const payloadIdentityAt = (path, payload) => ({ path, bytes: payload.bytes, sha256: payload.sha256 });

const validateV2Intent = (prepared, step) => {
  if (!["success_materializable", "success_terminal", "recovery_materializable", "recovery_terminal"].includes(step?.status)) {
    throw new Error("Feature Flight terminal winner is not classifiable.");
  }
  const claim = validatePreparedClaim(prepared, step.claim); const claimIdentity = identity(step.claim); const arbiter = step.terminal.value;
  const errors = validateFeatureFlightTerminal(arbiter);
  if (arbiter.effectClaimId !== claim.effectClaimId || arbiter.attemptDigest !== claim.attemptDigest || !sameJson(arbiter.claim, claimIdentity) ||
      !sameJson(arbiter.hierarchyIdentity, step.hierarchyIdentity)) errors.push("Terminal arbiter does not bind the exact claim hierarchy.");
  if (Date.parse(arbiter.recordedAt) < Date.parse(claim.claimedAt)) errors.push("Terminal arbiter timestamp precedes claim.");
  if (arbiter.terminalKind === "recovery") {
    const recovery = arbiter.recovery?.value;
    errors.push(...validateFeatureFlightRecovery(recovery));
    if (recovery?.effectClaimId !== claim.effectClaimId || recovery?.attemptDigest !== claim.attemptDigest ||
        !sameJson(recovery.claim, claimIdentity) || !sameJson(recovery.baselineRemoteObservation, claim.baselineRemoteObservation) ||
        recovery.recordedAt !== arbiter.recordedAt || recovery.successor !== null) errors.push("Recovery receipt does not bind the exact claim and arbiter.");
    try {
      const descriptor = prepared.remoteObserverDescriptor; const fullRef = fullRefFor(prepared);
      const baselineChallenge = featureFlightRemoteChallenge(claim.effectClaimId, descriptor, fullRef, "pre_claim");
      validateFeatureFlightRemoteObservation(recovery.baselineRemoteObservation, { descriptor, fullRef, phase: "pre_claim", challenge: baselineChallenge });
      if (recovery.latestRemoteObservation !== null) {
        const latestChallenge = featureFlightRemoteChallenge(claim.effectClaimId, descriptor, fullRef, "post_adapter");
        validateFeatureFlightRemoteObservation(recovery.latestRemoteObservation, { descriptor, fullRef, phase: "post_adapter", challenge: latestChallenge });
        if (Date.parse(recovery.latestRemoteObservation.observedAt) > Date.parse(recovery.recordedAt)) throw new Error("Recovery observation exceeds receipt timestamp.");
      }
      if (recovery.reason === "remote_drift" && recovery.latestRemoteObservation.remoteHead === recovery.baselineRemoteObservation.remoteHead) {
        throw new Error("Remote drift recovery does not contain a changed remote head.");
      }
    } catch (error) { errors.push(error.message); }
    if (errors.length !== 0) throw new Error(errors.join(" "));
    return { kind: "recovery", claimIdentity, recoveryIdentity: payloadIdentityAt(step.paths.recovery, arbiter.recovery), recovery };
  }
  const successor = arbiter.successor?.value; const result = arbiter.result?.value;
  const successorIdentity = payloadIdentityAt(step.paths.successor, arbiter.successor);
  errors.push(...validateFeatureFlightStepSuccessor(prepared.plan, prepared.planArtifact, prepared.state, successor), ...validateFeatureFlightStepResult(result));
  if (result?.effectClaimId !== claim.effectClaimId || result.flightId !== claim.flightId ||
      result.attemptDigest !== claim.attemptDigest || !sameJson(result.claim, claimIdentity) || !sameJson(result.successor, successorIdentity) ||
      result.runnerResultSha256 !== featureFlightDigest(result.runnerResult) || !sameJson(result.adapter, claim.adapter) ||
      !sameJson(result.remoteObserver, claim.remoteObserver) || !sameJson(result.repositoryBefore, claim.repository) ||
      !sameJson(result.repositoryAfter, claim.repository) || !sameJson(result.baselineRemoteObservation, claim.baselineRemoteObservation) ||
      result.claimedAt !== claim.claimedAt || result.completedAt !== successor.observedAt || result.completedAt !== arbiter.recordedAt) errors.push("Success result does not bind exact terminal evidence.");
  try {
    validateRunnerResultIdentity(prepared, claim, result.runnerResult);
    const expectedSuccessor = buildActiveToCompleteSuccessor(prepared.plan, prepared.planArtifact, prepared.state, prepared.stateArtifact, prepared.mission.id, result.completedAt);
    if (!sameJson(successor, expectedSuccessor)) throw new Error("Terminal successor is not the exact active-to-complete transition.");
    const baseline = claim.baselineRemoteObservation; const latest = result.latestRemoteObservation;
    if (latest.remoteHead !== baseline.remoteHead || Date.parse(latest.observedAt) < Date.parse(baseline.observedAt) ||
        Date.parse(latest.observedAt) < Date.parse(claim.claimedAt) || Date.parse(latest.observedAt) > Date.parse(result.completedAt)) throw new Error("Terminal remote observation freshness or head is invalid.");
  } catch (error) { errors.push(error.message); }
  if (errors.length !== 0) throw new Error(errors.join(" "));
  return { kind: "success", claimIdentity, successorIdentity, resultIdentity: payloadIdentityAt(step.paths.result, arbiter.result), result };
};

const validateMaterializedV2Terminal = (prepared, step) => {
  if (!["success_terminal", "recovery_terminal"].includes(step?.status)) throw new Error("Feature Flight terminal winner is not fully materialized.");
  const intent = validateV2Intent(prepared, step);
  if (intent.kind === "recovery") {
    if (!sameJson(identity(step.recovery), intent.recoveryIdentity)) throw new Error("Materialized recovery does not match terminal intent.");
    return { ...intent, terminalIdentity: identity(step.terminal), recoveryIdentity: identity(step.recovery) };
  }
  if (!sameJson(identity(step.successor), intent.successorIdentity) || !sameJson(identity(step.result), intent.resultIdentity)) {
    throw new Error("Materialized success receipts do not match terminal intent.");
  }
  return { ...intent, terminalIdentity: identity(step.terminal), successorIdentity: identity(step.successor), resultIdentity: identity(step.result) };
};

export const evaluateSuccessfulFeatureFlightTerminalV2 = (prepared, step) => {
  const terminal = validateMaterializedV2Terminal(prepared, step);
  if (terminal.kind !== "success") throw new Error("Feature Flight terminal winner is not successful.");
  return deepCopy(terminal);
};

const validateLegacyClaim = (prepared, snapshot) => {
  const claim = snapshot.value;
  const errors = artifactErrors(claim, LEGACY_CLAIM_FIELDS, "feature-flight-step-claim", LEGACY_VERSION);
  try {
    timestamp(claim.claimedAt, "legacy claim.claimedAt");
    exactDataObject(claim.plan, ["path", "bytes", "sha256"], [], "legacy claim.plan");
    exactDataObject(claim.currentState, ["path", "bytes", "sha256"], [], "legacy claim.currentState");
    if (claim.predecessor !== null) exactDataObject(claim.predecessor, ["path", "bytes", "sha256"], [], "legacy claim.predecessor");
    exactDataObject(claim.flight, ["sequence", "wave", "missionId", "lane"], [], "legacy claim.flight");
    exactDataObject(claim.repository, ["root", "branch", "head", "clean"], [], "legacy claim.repository");
    exactDataObject(claim.runner, ["missionId", "subjectId", "revisionId", "evaluatedThroughSequence", "cycleId", "seatId", "actionId", "effectClass", "effectKey", "validationId", "inputSha256"], [], "legacy claim.runner");
    validateAdapter(claim.adapter, "legacy claim.adapter");
  } catch (error) { errors.push(error.message); }
  const legacyDigest = featureFlightDigest({
    plan: claim.plan, currentState: claim.currentState, predecessor: claim.predecessor, sequence: claim.flight?.sequence,
    runnerInputSha256: claim.runner?.inputSha256, journalSequence: claim.runner?.evaluatedThroughSequence, cycleId: claim.runner?.cycleId,
    validationId: claim.runner?.validationId, repository: claim.repository, adapter: claim.adapter, claimedAt: claim.claimedAt,
  });
  if (claim.notice !== CLAIM_NOTICE || claim.attemptDigest !== legacyDigest || claim.effectClaimId !== prepared.effectClaimId ||
      !sameJson(claim.plan, prepared.planArtifact) || !sameJson(claim.currentState, prepared.stateArtifact) || !sameJson(claim.predecessor, prepared.predecessorArtifact) ||
      claim.repository?.root !== prepared.mission.worktree || claim.repository?.branch !== prepared.mission.branch ||
      claim.repository?.head !== prepared.state.missions[prepared.mission.id].revision || claim.repository?.clean !== true ||
      claim.flightId !== prepared.plan.flightId || claim.flight?.sequence !== prepared.state.sequence || claim.flight?.wave !== prepared.state.wave.current ||
      claim.flight?.missionId !== prepared.mission.id || claim.flight?.lane !== prepared.mission.lane ||
      !sameJson(claim.runner, resultBase(prepared).runner) || !sameJson(claim.adapter, prepared.adapterDescriptor)) errors.push("Legacy claim exact binding is invalid.");
  if (errors.length !== 0) throw new Error(errors.join(" "));
  return claim;
};

const validateLegacyTriad = (prepared, step) => {
  if (step.status !== "legacy_terminal") throw new Error("Legacy terminal triad is incomplete.");
  const claim = validateLegacyClaim(prepared, step.claim); const successor = step.successor.value; const result = step.result.value;
  const errors = [...artifactErrors(result, LEGACY_RESULT_FIELDS, "feature-flight-step-result", LEGACY_VERSION),
    ...validateFeatureFlightStepSuccessor(prepared.plan, prepared.planArtifact, prepared.state, successor)];
  try {
    exactDataObject(result.claim, ["path", "bytes", "sha256"], [], "legacy result.claim");
    exactDataObject(result.successor, ["path", "bytes", "sha256"], [], "legacy result.successor");
    exactDataObject(result.repositoryBefore, ["root", "branch", "head", "clean"], [], "legacy result.repositoryBefore");
    exactDataObject(result.repositoryAfter, ["root", "branch", "head", "clean"], [], "legacy result.repositoryAfter");
    validateAdapter(result.adapter, "legacy result.adapter");
    timestamp(result.claimedAt, "legacy result.claimedAt"); timestamp(result.completedAt, "legacy result.completedAt");
    if (Date.parse(result.completedAt) < Date.parse(result.claimedAt)) {
      throw new Error("Result completion timestamp precedes claim timestamp.");
    }
    validateRunnerResultIdentity(prepared, claim, result.runnerResult);
    const expectedSuccessor = buildActiveToCompleteSuccessor(prepared.plan, prepared.planArtifact, prepared.state, prepared.stateArtifact, prepared.mission.id, result.completedAt);
    if (!sameJson(successor, expectedSuccessor)) throw new Error("Legacy successor is not bound to the completion timestamp.");
  } catch (error) { errors.push(error.message); }
  if (result.notice !== RESULT_NOTICE || result.flightId !== claim.flightId || !sameJson(result.claim, identity(step.claim)) ||
      !sameJson(result.successor, identity(step.successor)) || result.effectClaimId !== claim.effectClaimId || result.attemptDigest !== claim.attemptDigest ||
      result.runnerResultSha256 !== featureFlightDigest(result.runnerResult) || !sameJson(result.repositoryBefore, claim.repository) ||
      !sameJson(result.repositoryAfter, claim.repository) || !sameJson(result.adapter, claim.adapter) || result.claimedAt !== claim.claimedAt ||
      result.completedAt !== successor.observedAt || result.outcome !== "completed" || result.invocationCount !== 1 ||
      result.effectContainment !== "external_uncertain_repository_unchanged" || result.gateEligible !== false) {
    errors.push("Legacy terminal triad exact binding is invalid.");
  }
  if (errors.length !== 0) throw new Error(errors.join(" "));
  return { claimIdentity: identity(step.claim), successorIdentity: identity(step.successor), resultIdentity: identity(step.result), result };
};

const replayProjection = (prepared, terminal, legacy = false) => ({
  schemaVersion: 1, resultType: "feature-flight-step-projection", ...resultBase(prepared), outcome: legacy ? "legacy_replayed" : "replayed",
  invocationCount: 0, claim: terminal.claimIdentity, terminalArbiter: terminal.terminalIdentity ?? null,
  successor: terminal.successorIdentity, result: terminal.resultIdentity, terminal: terminal.result, gateEligible: false,
});
const durableRecoveryProjection = (prepared, terminal) => ({
  schemaVersion: 1, resultType: "feature-flight-step-projection", ...resultBase(prepared), outcome: "recovery_required",
  reason: terminal.recovery.reason, phase: terminal.recovery.phase, invocationCount: 0, durable: true,
  claim: terminal.claimIdentity, terminalArbiter: terminal.terminalIdentity, recovery: terminal.recoveryIdentity,
  recoveryReceipt: terminal.recovery, gateEligible: false,
  handoff: { ...handoff(prepared, terminal.recovery.reason, terminal.recovery.phase), claim: terminal.claimIdentity, terminal: terminal.terminalIdentity, recovery: terminal.recoveryIdentity },
});

const followWinner = async (prepared, step) => {
  let current = step;
  try { validatePreparedClaim(prepared, current.claim); }
  catch { return ephemeralRecovery(prepared, "unsupported_or_malformed_store", current); }
  try { validateV2Intent(prepared, current); }
  catch { return ephemeralRecovery(prepared, "terminal_conflict", current); }
  if (["success_materializable", "recovery_materializable"].includes(current.status)) {
    try { current = await prepared.dependencies.stepStore.materializeTerminal(storeInput(prepared, { expectedHierarchyIdentity: current.hierarchyIdentity })); }
    catch { return ephemeralRecovery(prepared, current.terminal?.value?.terminalKind === "success" ? "successor_materialization_uncertain" : "recovery_materialization_uncertain", current); }
    if (current.materializationUncertain !== undefined) {
      const reason = current.materializationUncertain === "successor" ? "successor_materialization_uncertain"
        : current.materializationUncertain === "result" ? "result_materialization_uncertain" : "recovery_materialization_uncertain";
      return ephemeralRecovery(prepared, reason, current);
    }
    try { current = await prepared.dependencies.stepStore.readStep(storeInput(prepared, { expectedHierarchyIdentity: current.hierarchyIdentity })); }
    catch { return ephemeralRecovery(prepared, "final_readback_uncertain", current); }
  }
  try {
    const terminal = current.terminal?.value?.terminalKind === "success"
      ? evaluateSuccessfulFeatureFlightTerminalV2(prepared, current)
      : validateMaterializedV2Terminal(prepared, current);
    return terminal.kind === "success" ? replayProjection(prepared, terminal) : durableRecoveryProjection(prepared, terminal);
  } catch { return ephemeralRecovery(prepared, current?.status === "conflicting" ? "terminal_conflict" : "final_readback_uncertain", current); }
};

const buildRecovery = (claimSnapshot, reason, latestRemoteObservation, recordedAt) => ({
  schemaVersion: 1, artifactType: "feature-flight-step-recovery", authority: "none", notice: FEATURE_FLIGHT_RECOVERY_NOTICE,
  contract: featureFlightContract(), effectClaimId: claimSnapshot.value.effectClaimId, attemptDigest: claimSnapshot.value.attemptDigest,
  claim: identity(claimSnapshot), successor: null, reason,
  phase: ({ interrupted_after_claim: "store_replay", adapter_uncertain: "adapter", validation_failed: "validation",
    local_readback_unavailable: "local_readback", local_repository_changed: "local_readback",
    postcheck_remote_observation_unavailable: "remote_postcheck", remote_identity_changed: "remote_postcheck", remote_drift: "remote_postcheck" })[reason],
  baselineRemoteObservation: claimSnapshot.value.baselineRemoteObservation, latestRemoteObservation,
  invocationClassification: ["validation_failed", "local_readback_unavailable", "local_repository_changed", "postcheck_remote_observation_unavailable", "remote_identity_changed", "remote_drift"].includes(reason) ? "one_completed" : "zero_or_unknown",
  effectState: "uncertain_do_not_reinvoke", gateEligible: false, recordedAt, nextAction: FEATURE_FLIGHT_NEXT_ACTION,
});

const terminalizeRecovery = async (prepared, claimSnapshot, hierarchyIdentity, reason, latestRemoteObservation = null) => {
  let recordedAt;
  try { recordedAt = timestamp(await prepared.dependencies.clock.now(), "recovery timestamp"); }
  catch { return ephemeralRecovery(prepared, "terminal_arbitration_uncertain"); }
  if (Date.parse(recordedAt) < Date.parse(claimSnapshot.value.claimedAt) ||
      (latestRemoteObservation !== null && Date.parse(recordedAt) < Date.parse(latestRemoteObservation.observedAt))) return ephemeralRecovery(prepared, "terminal_arbitration_uncertain");
  const recovery = buildRecovery(claimSnapshot, reason, latestRemoteObservation, recordedAt);
  if (validateFeatureFlightRecovery(recovery).length !== 0) return ephemeralRecovery(prepared, "terminal_arbitration_uncertain");
  const terminal = {
    schemaVersion: 1, artifactType: "feature-flight-step-terminal", authority: "none", notice: FEATURE_FLIGHT_TERMINAL_NOTICE,
    contract: featureFlightContract(), effectClaimId: claimSnapshot.value.effectClaimId, attemptDigest: claimSnapshot.value.attemptDigest,
    claim: identity(claimSnapshot), terminalKind: "recovery", successor: null, result: null, recovery: featureFlightPayload(recovery),
    hierarchyIdentity, recordedAt,
  };
  if (validateFeatureFlightTerminal(terminal).length !== 0) return ephemeralRecovery(prepared, "terminal_arbitration_uncertain");
  let arbitration;
  try { arbitration = await prepared.dependencies.stepStore.arbitrateTerminal(storeInput(prepared, { terminal, expectedHierarchyIdentity: hierarchyIdentity })); }
  catch { return ephemeralRecovery(prepared, "terminal_arbitration_uncertain"); }
  let step;
  try { step = await prepared.dependencies.stepStore.readStep(storeInput(prepared, { expectedHierarchyIdentity: hierarchyIdentity })); }
  catch { return ephemeralRecovery(prepared, "terminal_arbitration_uncertain"); }
  if (!arbitration.terminal.bytes.equals(step.terminal?.bytes ?? Buffer.alloc(0))) return ephemeralRecovery(prepared, "terminal_conflict", step);
  const projection = await followWinner(prepared, step);
  return projection.durable === true ? { ...projection, invocationCount: prepared.invocationCount } : projection;
};

const existingDisposition = async (prepared) => {
  let step;
  try { step = await prepared.dependencies.stepStore.readStep(storeInput(prepared)); }
  catch { return ephemeralRecovery(prepared, "store_unavailable"); }
  if (step.status === "absent") return null;
  if (step.status === "legacy_terminal") {
    try { return replayProjection(prepared, validateLegacyTriad(prepared, step), true); }
    catch { return ephemeralRecovery(prepared, "unsupported_or_malformed_store", step); }
  }
  if (["legacy_claim_incomplete", "legacy_successor_incomplete"].includes(step.status)) {
    try {
      validateLegacyClaim(prepared, step.claim);
      if (step.status === "legacy_successor_incomplete" && validateFeatureFlightStepSuccessor(prepared.plan, prepared.planArtifact, prepared.state, step.successor.value).length !== 0) {
        throw new Error("Legacy successor is malformed.");
      }
      return ephemeralRecovery(prepared, "legacy_incomplete", step);
    } catch { return ephemeralRecovery(prepared, "unsupported_or_malformed_store", step); }
  }
  if (["success_materializable", "success_terminal", "recovery_materializable", "recovery_terminal"].includes(step.status)) return followWinner(prepared, step);
  if (step.status === "claim_incomplete") {
    try { validatePreparedClaim(prepared, step.claim); }
    catch { return ephemeralRecovery(prepared, "unsupported_or_malformed_store", step); }
    return terminalizeRecovery(prepared, step.claim, step.hierarchyIdentity, "interrupted_after_claim");
  }
  return ephemeralRecovery(prepared, step.status === "conflicting" ? "terminal_conflict" : "unsupported_or_malformed_store", step);
};

const precheckReason = (error) => {
  if (/phase or challenge/u.test(error?.message ?? "")) return "remote_phase_or_challenge_stale";
  if (/repository\/common-Git identity/u.test(error?.message ?? "")) return "remote_repository_identity_mismatch";
  if (/descriptor fields|observer descriptor/u.test(error?.message ?? "")) return "remote_descriptor_mismatch";
  return "remote_observation_malformed";
};

export const runFeatureFlightStepV1 = async (input, trustedDependencies) => {
  let caller; let dependencies;
  try { caller = validateCaller(input); dependencies = snapshotDependencies(trustedDependencies); }
  catch (error) { throw new Error(`Feature Flight step rejected before effects: ${error.message}`); }
  let prepared;
  try { prepared = await prepareDeterministic(caller, dependencies); }
  catch (error) { throw new Error(`Feature Flight step rejected before effects: ${error.message}`); }

  const existing = await existingDisposition(prepared);
  if (existing !== null) return existing;

  try { prepared.repositoryBefore = await validateLocalPreflight(prepared); }
  catch (error) { throw new Error(`Feature Flight step rejected before effects: ${error.message}`); }
  try { prepared.baselineRemoteObservation = await observeRemote(prepared, "pre_claim"); }
  catch (error) {
    const reason = error?.featureFlightRemoteUnavailable === true ? "precheck_remote_observation_unavailable" : precheckReason(error);
    return stoppedProjection(prepared, reason);
  }
  if (prepared.baselineRemoteObservation.remoteHead !== null && prepared.baselineRemoteObservation.remoteHead !== prepared.repositoryBefore.head) {
    return stoppedProjection(prepared, "preexisting_remote_drift");
  }

  let claimArtifact; let claimHierarchyIdentity; let runnerContract;
  try {
    runnerContract = await runRunnerCycle(prepared.runner, {
      authorize: dependencies.authorizeRunner,
      claim: async () => {
        const claimedAt = timestamp(await dependencies.clock.now(), "claim timestamp");
        const claim = buildClaim(prepared, claimedAt);
        if (validateFeatureFlightStepClaim(claim).length !== 0) return { runnerContractVersion: 1, outcome: "blocked", reason: "invocation_claim_failed" };
        try {
          const claimed = await dependencies.stepStore.claimStep(storeInput(prepared, { claim }));
          if (claimed.status !== "claimed") return { runnerContractVersion: 1, outcome: "blocked", reason: "invocation_claim_conflict" };
          claimArtifact = claimed.claim; claimHierarchyIdentity = claimed.hierarchyIdentity;
          return { runnerContractVersion: 1, outcome: "claimed" };
        } catch { return { runnerContractVersion: 1, outcome: "blocked", reason: "invocation_claim_failed" }; }
      },
      execute: async (plan, decision) => {
        prepared.invocationCount += 1;
        if (prepared.invocationCount !== 1) throw new Error("Daisy adapter invocation count exceeded one.");
        return dependencies.invokeDaisyAdapter(plan, decision, prepared.adapterDescriptor);
      },
      validate: dependencies.validateDaisyResult,
    });
  } catch { runnerContract = null; }
  const runnerResult = runnerContract?.state === "valid" ? runnerContract.value : null;
  if (claimArtifact === undefined || claimHierarchyIdentity === undefined) {
    if (runnerResult?.outcome === "stopped" && !["invocation_claim_conflict", "invocation_claim_failed"].includes(runnerResult.reason)) {
      return stoppedProjection(prepared, runnerResult.reason, runnerResult);
    }
    return (await existingDisposition(prepared)) ?? ephemeralRecovery(prepared, "store_unavailable");
  }
  if (runnerResult?.outcome !== "advanced" || runnerResult.reason !== "effect_completed") {
    const reason = runnerResult?.reason?.startsWith("validator_") ? "validation_failed" : "adapter_uncertain";
    return terminalizeRecovery(prepared, claimArtifact, claimHierarchyIdentity, reason);
  }
  if (prepared.invocationCount !== 1) return terminalizeRecovery(prepared, claimArtifact, claimHierarchyIdentity, "adapter_uncertain");

  let repositoryAfter;
  try { repositoryAfter = validateRepository(await dependencies.observeRepository(prepared.mission.worktree)); }
  catch { return terminalizeRecovery(prepared, claimArtifact, claimHierarchyIdentity, "local_readback_unavailable"); }
  if (!sameJson(repositoryAfter, prepared.repositoryBefore)) return terminalizeRecovery(prepared, claimArtifact, claimHierarchyIdentity, "local_repository_changed");

  let latestRemoteObservation;
  try { latestRemoteObservation = await observeRemote(prepared, "post_adapter"); }
  catch (error) {
    const reason = /repository\/common-Git identity|descriptor fields|phase or challenge/u.test(error?.message ?? "") ? "remote_identity_changed" : "postcheck_remote_observation_unavailable";
    return terminalizeRecovery(prepared, claimArtifact, claimHierarchyIdentity, reason);
  }
  const claim = claimArtifact.value;
  if (Date.parse(latestRemoteObservation.observedAt) < Date.parse(prepared.baselineRemoteObservation.observedAt) ||
      Date.parse(latestRemoteObservation.observedAt) < Date.parse(claim.claimedAt)) {
    return terminalizeRecovery(prepared, claimArtifact, claimHierarchyIdentity, "remote_identity_changed", latestRemoteObservation);
  }
  if (latestRemoteObservation.remoteHead !== prepared.baselineRemoteObservation.remoteHead) {
    return terminalizeRecovery(prepared, claimArtifact, claimHierarchyIdentity, "remote_drift", latestRemoteObservation);
  }

  let completedAt;
  try { completedAt = timestamp(await dependencies.clock.now(), "completion timestamp"); }
  catch { return terminalizeRecovery(prepared, claimArtifact, claimHierarchyIdentity, "adapter_uncertain"); }
  if (Date.parse(completedAt) < Date.parse(latestRemoteObservation.observedAt)) return terminalizeRecovery(prepared, claimArtifact, claimHierarchyIdentity, "remote_identity_changed", latestRemoteObservation);
  const successor = buildActiveToCompleteSuccessor(prepared.plan, prepared.planArtifact, prepared.state, prepared.stateArtifact, prepared.mission.id, completedAt);
  const successorBytes = canonicalFeatureFlightBytes(successor);
  const successorIdentity = featureFlightArtifactIdentity(joinPath(claimArtifact.path, "successor.json"), successorBytes);
  const result = {
    schemaVersion: 1, artifactType: "feature-flight-step-result", authority: "none", notice: RESULT_NOTICE,
    contract: featureFlightContract(), effectClaimId: prepared.effectClaimId, attemptDigest: claim.attemptDigest, flightId: prepared.plan.flightId,
    claim: identity(claimArtifact), successor: successorIdentity, runnerResult, runnerResultSha256: featureFlightDigest(runnerResult),
    repositoryBefore: prepared.repositoryBefore, repositoryAfter, adapter: prepared.adapterDescriptor,
    remoteObserver: prepared.remoteObserverDescriptor, baselineRemoteObservation: prepared.baselineRemoteObservation,
    latestRemoteObservation, invocationCount: 1, claimedAt: claim.claimedAt, completedAt, outcome: "completed",
    effectContainment: "external_uncertain_repository_unchanged", gateEligible: false,
  };
  if (validateFeatureFlightStepResult(result).length !== 0) return terminalizeRecovery(prepared, claimArtifact, claimHierarchyIdentity, "validation_failed", latestRemoteObservation);
  const terminal = {
    schemaVersion: 1, artifactType: "feature-flight-step-terminal", authority: "none", notice: FEATURE_FLIGHT_TERMINAL_NOTICE,
    contract: featureFlightContract(), effectClaimId: prepared.effectClaimId, attemptDigest: claim.attemptDigest,
    claim: identity(claimArtifact), terminalKind: "success", successor: featureFlightPayload(successor), result: featureFlightPayload(result),
    recovery: null, hierarchyIdentity: claimHierarchyIdentity, recordedAt: completedAt,
  };
  try { await dependencies.stepStore.arbitrateTerminal(storeInput(prepared, { terminal, expectedHierarchyIdentity: claimHierarchyIdentity })); }
  catch { return ephemeralRecovery(prepared, "terminal_arbitration_uncertain"); }
  let winner;
  try { winner = await dependencies.stepStore.readStep(storeInput(prepared, { expectedHierarchyIdentity: claimHierarchyIdentity })); }
  catch { return ephemeralRecovery(prepared, "terminal_arbitration_uncertain"); }
  const projection = await followWinner(prepared, winner);
  if (projection.outcome === "replayed") return { ...projection, outcome: "completed", invocationCount: 1 };
  return projection;
};

const joinPath = (claimPath, filename) => `${claimPath.slice(0, claimPath.lastIndexOf("/") + 1)}${filename}`;
