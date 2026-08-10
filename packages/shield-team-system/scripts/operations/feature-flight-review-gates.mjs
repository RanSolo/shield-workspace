import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalJson, replaySupervisedMissionJournal } from "../../dist/mission-v2.mjs";
import { replayProfileAwareMissionJournal } from "../../dist/profile-aware-mission-v1.mjs";
import { normalizeMackLocalValidationRequestV1 } from "../../dist/mack-local-validation-v1.mjs";
import { validateRunnerCycleInput } from "../../dist/runner-v1.mjs";
import { readMackProductionValidationRegistryV1 } from "../model/mack-validation-runner.mjs";
import {
  artifactIdentity,
  assertFlightState,
  assertResolvedPlan,
  GIT_REVISION_PATTERN,
  validateImmediateTransition,
} from "./flight-contracts.mjs";
import { readFlightJsonSnapshot } from "./feature-flight-controller.mjs";
import { canonicalFeatureFlightBytes, featureFlightDigest } from "./feature-flight-recovery.mjs";
import { evaluateSuccessfulFeatureFlightTerminalV2 } from "./feature-flight-step.mjs";
import { strictParseJson } from "../model/strict-json.mjs";

export const FEATURE_FLIGHT_REVIEW_GATES_CONTRACT_VERSION = "1.0.0";
export const FEATURE_FLIGHT_REVIEW_GATES_NOTICE = "Read-only review checkpoint only. This projection grants no authority, satisfies no human gate, and performs no dispatch or state mutation.";

const INPUT_FIELDS = [
  "planPath", "expectedPlanSha256", "statePath", "expectedStateSha256", "expectedStateSequence",
  "predecessorStatePath", "expectedPredecessorSha256", "runnerInputPath", "expectedRunnerInputSha256",
  "claimPath", "expectedClaimSha256", "terminalPath", "expectedTerminalSha256", "successorPath",
  "expectedSuccessorSha256", "resultPath", "expectedResultSha256", "executionJournalPath",
  "expectedExecutionJournalSha256", "mackRequestPath", "expectedMackRequestSha256", "reviewJournalPath",
  "expectedReviewJournalSha256",
];
const DEPENDENCY_FIELDS = ["observeRepository", "mackReplayRegistryRoot", "reviewJournalDescriptor"];
const DEPENDENCY_OPTIONAL_FIELDS = ["readMackRegistry", "snapshotDependencies"];
const SNAPSHOT_DEPENDENCY_FIELDS = new Set(["lstat", "open", "realpath", "beforeRead", "afterRead"]);
const DESCRIPTOR_FIELDS = [
  "schemaVersion", "descriptorType", "journal", "reviewMissionId", "reviewMissionRevisionId",
  "reviewWorkItemSubjectId", "repositoryReviewSubjectId", "sourceRef", "repository", "repositoryRoot",
  "commonGitDirectory", "commonGitDevice", "commonGitInode", "branch", "implementationPaths",
  "approvedTestSurfaces",
];
const REPOSITORY_FIELDS = [
  "repository", "root", "branch", "head", "clean", "commonGitDirectory", "commonGitDevice",
  "commonGitInode", "observedAt",
];
const RAW_DIGEST = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*:)[A-Za-z0-9._\/@# +,=-]{1,512}$/u;

const digestBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const checkpointDigest = (value) => `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("base64url")}`;
const copy = (value) => structuredClone(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, required, optional = [], label = "value") {
  if (!plain(value)) throw new Error(`${label} must be a strict plain object.`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : undefined;
    if (typeof key !== "string" || !allowed.has(key) || descriptor?.enumerable !== true || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
      throw new Error(`${label} contains an unknown or non-data field.`);
    }
  }
  for (const field of required) if (!Object.hasOwn(value, field)) throw new Error(`${label}.${field} is required.`);
  return value;
}

function denseStrings(value, validator, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 512) throw new Error(`${label} is malformed.`);
  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!Object.hasOwn(value, index) || descriptor?.enumerable !== true || !Object.hasOwn(descriptor, "value") || !validator(descriptor.value)) throw new Error(`${label} is malformed.`);
    output.push(descriptor.value);
  }
  if (Reflect.ownKeys(value).some((key) => key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)))) throw new Error(`${label} is malformed.`);
  if (new Set(output).size !== output.length) throw new Error(`${label} contains duplicates.`);
  return output;
}

function frozenDependencies(value) {
  exact(value, DEPENDENCY_FIELDS, DEPENDENCY_OPTIONAL_FIELDS, "trustedDependencies");
  if (!Object.isFrozen(value) || typeof value.observeRepository !== "function" ||
      (value.readMackRegistry !== undefined && typeof value.readMackRegistry !== "function")) throw new Error("trustedDependencies must be frozen and contain read-only functions.");
  if (value.readMackRegistry !== undefined && value.readMackRegistry === value.observeRepository) throw new Error("Trusted dependency function identities must be distinct.");
  if (typeof value.mackReplayRegistryRoot !== "string") throw new Error("mackReplayRegistryRoot is malformed.");
  const descriptor = value.reviewJournalDescriptor;
  exact(descriptor, DESCRIPTOR_FIELDS, [], "reviewJournalDescriptor");
  if (!Object.isFrozen(descriptor)) throw new Error("reviewJournalDescriptor must be frozen.");
  exact(descriptor.journal, ["path", "bytes", "sha256"], [], "reviewJournalDescriptor.journal");
  if (descriptor.schemaVersion !== 1 || descriptor.descriptorType !== "feature-flight-review-journal" ||
      !Number.isSafeInteger(descriptor.journal.bytes) || descriptor.journal.bytes < 1 || !RAW_DIGEST.test(descriptor.journal.sha256 ?? "") ||
      ![descriptor.reviewMissionId, descriptor.reviewMissionRevisionId, descriptor.reviewWorkItemSubjectId,
        descriptor.repositoryReviewSubjectId, descriptor.sourceRef, descriptor.branch].every((entry) => typeof entry === "string" && IDENTIFIER.test(entry)) ||
      typeof descriptor.repository !== "string" || typeof descriptor.repositoryRoot !== "string" || typeof descriptor.commonGitDirectory !== "string" ||
      !Number.isSafeInteger(descriptor.commonGitDevice) || descriptor.commonGitDevice < 0 || !Number.isSafeInteger(descriptor.commonGitInode) || descriptor.commonGitInode < 0) {
    throw new Error("reviewJournalDescriptor is malformed.");
  }
  const implementationPaths = denseStrings(descriptor.implementationPaths, (entry) => typeof entry === "string" && SAFE_PATH.test(entry), "reviewJournalDescriptor.implementationPaths");
  const approvedTestSurfaces = denseStrings(descriptor.approvedTestSurfaces, (entry) => typeof entry === "string" && SAFE_PATH.test(entry), "reviewJournalDescriptor.approvedTestSurfaces");
  const snapshots = value.snapshotDependencies ?? Object.freeze({});
  if (!plain(snapshots) || !Object.isFrozen(snapshots)) throw new Error("snapshotDependencies must be a frozen strict plain object.");
  for (const key of Reflect.ownKeys(snapshots)) {
    const field = typeof key === "string" ? Object.getOwnPropertyDescriptor(snapshots, key) : undefined;
    if (typeof key !== "string" || !SNAPSHOT_DEPENDENCY_FIELDS.has(key) || field?.enumerable !== true || !Object.hasOwn(field, "value") || typeof field.value !== "function") throw new Error("snapshotDependencies may contain only supported function data fields.");
  }
  return Object.freeze({
    observeRepository: value.observeRepository,
    readMackRegistry: value.readMackRegistry ?? readMackProductionValidationRegistryV1,
    mackReplayRegistryRoot: value.mackReplayRegistryRoot,
    reviewJournalDescriptor: Object.freeze({ ...copy(descriptor), implementationPaths, approvedTestSurfaces }),
    snapshotDependencies: snapshots,
  });
}

function callerInput(value) {
  exact(value, INPUT_FIELDS, [], "Feature Flight review-gates input");
  for (const field of INPUT_FIELDS.filter((name) => name.endsWith("Path"))) if (typeof value[field] !== "string") throw new Error(`${field} is malformed.`);
  for (const field of INPUT_FIELDS.filter((name) => name.includes("Sha256"))) if (!RAW_DIGEST.test(value[field] ?? "")) throw new Error(`${field} must be a raw lowercase SHA-256 digest.`);
  if (!Number.isSafeInteger(value.expectedStateSequence) || value.expectedStateSequence < 1) throw new Error("expectedStateSequence must identify a non-genesis active state.");
  return copy(value);
}

async function jsonSnapshot(path, expectedSha256, snapshots, { canonicalFeatureFlight = false } = {}) {
  const snapshot = await readFlightJsonSnapshot(path, snapshots);
  if (snapshot.sha256 !== expectedSha256) throw new Error("artifact_digest_mismatch");
  const parsed = strictParseJson(snapshot.bytes.toString("utf8"), { maxBytes: 12_582_912, maxDepth: 128, rejectControlCharacters: false });
  if (parsed.state !== "valid") throw new Error("artifact_json_invalid");
  if (canonicalFeatureFlight && !snapshot.bytes.equals(canonicalFeatureFlightBytes(parsed.value))) throw new Error("feature_flight_artifact_noncanonical");
  return { ...snapshot, value: parsed.value };
}

async function textSnapshot(path, expectedSha256, snapshots) {
  const { constants: fsConstants } = await import("node:fs");
  const { lstat, open, realpath } = await import("node:fs/promises");
  const { dirname, isAbsolute, normalize, resolve } = await import("node:path");
  const deps = { lstat, open, realpath, ...snapshots };
  if (typeof path !== "string" || !isAbsolute(path) || normalize(path) !== path || resolve(path) !== path) throw new Error("artifact_path_invalid");
  const parent = dirname(path);
  const [canonicalParent, canonicalPath, parentBefore, pathBefore] = await Promise.all([
    deps.realpath(parent).catch(() => null), deps.realpath(path).catch(() => null), deps.lstat(parent).catch(() => null), deps.lstat(path).catch(() => null),
  ]);
  if (canonicalParent !== parent || canonicalPath !== path || !parentBefore?.isDirectory() || parentBefore.isSymbolicLink() || !pathBefore?.isFile() || pathBefore.isSymbolicLink()) throw new Error("artifact_path_invalid");
  const handle = await deps.open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== pathBefore.dev || opened.ino !== pathBefore.ino) throw new Error("artifact_identity_changed");
    await deps.beforeRead?.({ path, handle });
    const bytes = await handle.readFile();
    await deps.afterRead?.({ path, handle });
    const [retained, parentAfter, pathAfter, parentRealAfter, pathRealAfter] = await Promise.all([
      handle.stat(), deps.lstat(parent).catch(() => null), deps.lstat(path).catch(() => null), deps.realpath(parent).catch(() => null), deps.realpath(path).catch(() => null),
    ]);
    if (!retained.isFile() || retained.dev !== opened.dev || retained.ino !== opened.ino || retained.size !== bytes.length ||
        !parentAfter?.isDirectory() || parentAfter.isSymbolicLink() || parentAfter.dev !== parentBefore.dev || parentAfter.ino !== parentBefore.ino ||
        !pathAfter?.isFile() || pathAfter.isSymbolicLink() || pathAfter.dev !== opened.dev || pathAfter.ino !== opened.ino ||
        parentRealAfter !== parent || pathRealAfter !== path || digestBytes(bytes) !== expectedSha256) throw new Error("artifact_identity_changed");
    return { path, bytes, sha256: expectedSha256 };
  } finally { await handle.close(); }
}

function parseJournal(snapshot, schemaVersion) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(snapshot.bytes); } catch { throw new Error("journal_utf8_invalid"); }
  if (!text.endsWith("\n") || text.startsWith("\ufeff")) throw new Error("journal_noncanonical");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 0 || lines.some((line) => line.length === 0)) throw new Error("journal_noncanonical");
  const entries = lines.map((line) => {
    const parsed = strictParseJson(line, { maxBytes: 4_194_304, maxDepth: 128, rejectControlCharacters: false });
    if (parsed.state !== "valid" || canonicalJson(parsed.value) !== line || parsed.value?.schemaVersion !== schemaVersion) throw new Error("journal_noncanonical");
    return parsed.value;
  });
  return entries;
}

function finalResult(checkpoint) {
  const frozen = deepFreeze(checkpoint);
  return Object.freeze({ checkpoint: frozen, digest: checkpointDigest(frozen) });
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

const emptyGate = (seatId, state = "waiting") => ({ seatId, state, requirementRef: null, evidenceRef: null, reasonCodes: [] });

function closedFlight(sourceArtifacts, stopCode = "flight_evidence_recovery_required") {
  return finalResult({
    schemaVersion: 1, projectionType: "feature-flight-review-checkpoint", contractVersion: FEATURE_FLIGHT_REVIEW_GATES_CONTRACT_VERSION,
    authority: "none", gateEligible: false, notice: FEATURE_FLIGHT_REVIEW_GATES_NOTICE, sourceArtifacts,
    binding: null, gates: { mack: emptyGate("mack", "invalid"), fury: emptyGate("fury"), fitz: emptyGate("fitz"), simmons: null, coulson: emptyGate("coulson") },
    phase: "flight_terminal", stopCode, gateSeatId: null, correctionSeatId: null, investigationSuggestionSeatId: null,
    nextAction: "recover_feature_flight_evidence",
  });
}

function currentHumanGate(projection, seatId) {
  const currentRevision = projection.reviewSubject.revisionId;
  const requirements = projection.requirements.filter(({ requiredSeatId, revisionId, subjectKind }) => requiredSeatId === seatId && revisionId === currentRevision && subjectKind === "repository_artifact");
  const current = projection.evidenceHistory.filter(({ seatId: recordSeat, revisionId, lifecycle }) => recordSeat === seatId && revisionId === currentRevision && lifecycle === "current");
  const stale = projection.evidenceHistory.some(({ seatId: recordSeat, lifecycle }) => recordSeat === seatId && lifecycle === "stale");
  if (requirements.length !== 1 || current.length > 1) return { ...emptyGate(seatId, "invalid"), reasonCodes: ["human_review_projection_ambiguous"] };
  const requirementRef = requirements[0].requirementId;
  if (current.length === 0) return { ...emptyGate(seatId, stale ? "stale" : "waiting"), requirementRef, reasonCodes: stale ? ["current_revision_evidence_required"] : [] };
  const evidence = current[0];
  const state = evidence.decision === "approved" ? "satisfied" : evidence.decision === "changes_requested" ? "revise" : evidence.decision === "rejected" ? "rejected" : "invalid";
  return { seatId, state, requirementRef, evidenceRef: evidence.evidenceId, reasonCodes: state === "invalid" ? ["human_review_decision_invalid"] : [] };
}

function furyGate(projection) {
  const currentRevision = projection.reviewSubject.revisionId;
  const current = projection.furyReviews.filter(({ revisionId, lifecycle }) => revisionId === currentRevision && lifecycle === "current");
  const stale = projection.furyReviews.some(({ lifecycle }) => lifecycle === "stale");
  if (current.length > 1) return { ...emptyGate("fury", "invalid"), nextActionSeatId: null, reasonCodes: ["fury_review_ambiguous"] };
  if (current.length === 0) return { ...emptyGate("fury", stale ? "stale" : "waiting"), nextActionSeatId: null, reasonCodes: stale ? ["current_revision_fury_review_required"] : [] };
  const review = current[0];
  return {
    seatId: "fury", state: review.verdict === "approved" ? "pass" : "revise", requirementRef: null,
    evidenceRef: review.reviewId, reasonCodes: [...review.reasons], nextActionSeatId: review.nextActionSeatId,
  };
}

function mackGate(request, requestDigest, readback) {
  if (readback.state === "waiting") return { ...emptyGate("mack", "waiting"), requestRef: request.validationRequestId, reasonCodes: [] };
  if (readback.state === "recovery") return { ...emptyGate("mack", "invalid"), requestRef: request.validationRequestId, reasonCodes: [readback.reasonCode] };
  if (readback.state !== "verified") return { ...emptyGate("mack", "invalid"), requestRef: request.validationRequestId, reasonCodes: [readback.reasonCode ?? "mack_evidence_invalid"] };
  const evidence = readback.evidence;
  if (readback.validationRequestId !== request.validationRequestId || readback.requestDigest !== requestDigest ||
      evidence.validationRequestId !== request.validationRequestId || evidence.requestDigest !== requestDigest || evidence.missionId !== request.missionId ||
      evidence.missionRevisionId !== request.missionRevisionId || evidence.subjectId !== request.subjectId || evidence.repository !== request.repository ||
      evidence.repositoryRoot !== request.repositoryRoot || evidence.canonicalGitDirectory !== request.canonicalGitDirectory || evidence.branch !== request.branch ||
      evidence.baseRevisionId !== request.baseRevisionId || evidence.artifactRevisionId !== request.artifactRevisionId ||
      !same(evidence.implementationPaths, request.repositoryContext.implementationPaths) || evidence.report?.missionId !== request.missionId ||
      evidence.report?.subjectId !== request.subjectId || evidence.report?.repository !== request.repository || evidence.report?.branch !== request.branch ||
      evidence.report?.artifactRevisionId !== request.artifactRevisionId) {
    return { ...emptyGate("mack", "invalid"), requestRef: request.validationRequestId, reasonCodes: ["mack_evidence_exact_binding_mismatch"] };
  }
  const requiredScenariosPass = request.scenarios.filter(({ required }) => required).every(({ scenarioId }) => evidence.report.scenarios.some((scenario) => scenario.scenarioId === scenarioId && scenario.required === true && scenario.covered === true));
  const requiredLanesPass = request.lanes.filter(({ required }) => required).every(({ laneId, commandId }) => evidence.report.lanes.some((lane) => lane.laneId === laneId && lane.commandId === commandId && lane.outcome === "pass"));
  const fullPass = evidence.evidenceSource === "production" && evidence.productionEligibility === "eligible" && evidence.advancementEligibility === "eligible" &&
    evidence.evaluation?.advancementEligibility === "eligible" && evidence.report.status === "pass" && evidence.report.recommendedRoute === "advance" &&
    requiredScenariosPass && requiredLanesPass && evidence.report.limitations.length === 0 && evidence.reasonCodes.length === 0;
  let state = "invalid";
  if (fullPass) state = "pass";
  else if (evidence.report.status === "fail" && ["may", "mack"].includes(evidence.report.recommendedRoute)) state = "revise";
  else if (evidence.report.status === "inconclusive" && ["fury", "daisy"].includes(evidence.report.recommendedRoute)) state = "blocked";
  return {
    seatId: "mack", state, requirementRef: null, requestRef: request.validationRequestId, evidenceRef: evidence.evidenceDigest,
    recordRef: readback.record, recommendedRoute: evidence.report.recommendedRoute, reasonCodes: [...evidence.reasonCodes],
  };
}

function stopFor(gates) {
  const mack = gates.mack;
  if (mack.state === "invalid") return ["mack_validation_invalid", "mack_validation", null, null, null, "inspect_mack_validation_evidence"];
  if (mack.state === "stale") return ["mack_validation_stale", "mack_validation", null, null, null, "refresh_mack_validation_request"];
  if (mack.state === "waiting") return ["mack_validation_required", "mack_validation", "mack", null, null, "await_mack_validation"];
  if (mack.state === "blocked") return ["mack_validation_blocked", "mack_validation", null, null, mack.recommendedRoute, "investigate_mack_validation"];
  if (mack.state === "revise") return ["mack_validation_revise", "mack_validation", null, mack.recommendedRoute, null, "revise_after_mack_validation"];
  if (mack.state !== "pass") return ["mack_validation_invalid", "mack_validation", null, null, null, "inspect_mack_validation_evidence"];
  const fury = gates.fury;
  if (fury.state === "invalid") return ["fury_review_invalid", "fury_review", null, null, null, "inspect_fury_review_evidence"];
  if (fury.state === "stale") return ["fury_review_stale", "fury_review", null, null, null, "refresh_fury_review"];
  if (fury.state === "waiting") return ["fury_review_required", "fury_review", "fury", null, null, "await_fury_review"];
  if (fury.state === "revise") return ["fury_review_changes_requested", "fury_review", null, fury.nextActionSeatId, null, "revise_after_fury_review"];
  if (fury.state !== "pass") return ["fury_review_invalid", "fury_review", null, null, null, "inspect_fury_review_evidence"];
  for (const [name, gate] of [["fitz", gates.fitz], ["simmons", gates.simmons]]) {
    if (gate === null) continue;
    if (gate.state === "invalid") return [`${name}_review_invalid`, `${name}_review`, null, null, null, "inspect_human_review_evidence"];
    if (gate.state === "stale") return [`${name}_review_stale`, `${name}_review`, null, null, null, "refresh_human_review"];
    if (gate.state === "waiting") return [`${name}_review_required`, `${name}_review`, name, null, null, `await_${name}_review`];
    if (gate.state === "revise") return [`${name}_review_changes_requested`, `${name}_review`, name, null, null, "record_human_review_correction"];
    if (gate.state === "rejected") return [`${name}_review_rejected`, `${name}_review`, name, null, null, "resolve_human_review_rejection"];
    if (gate.state !== "satisfied") return [`${name}_review_invalid`, `${name}_review`, null, null, null, "inspect_human_review_evidence"];
  }
  return ["coulson_final_acceptance_required", "final_acceptance", "coulson", null, null, "await_coulson_final_acceptance"];
}

export async function projectFeatureFlightReviewGatesV1(inputValue, trustedDependencies) {
  const input = callerInput(inputValue);
  const dependencies = frozenDependencies(trustedDependencies);
  const sourceArtifacts = {};
  let planSnapshot; let stateSnapshot; let predecessorSnapshot; let runnerSnapshot; let claimSnapshot; let terminalSnapshot; let successorSnapshot; let resultSnapshot;
  let executionJournalSnapshot; let requestSnapshot; let reviewJournalSnapshot; let terminal;
  try {
    [planSnapshot, stateSnapshot, predecessorSnapshot, runnerSnapshot, claimSnapshot, terminalSnapshot, successorSnapshot, resultSnapshot,
      executionJournalSnapshot, requestSnapshot, reviewJournalSnapshot] = await Promise.all([
      jsonSnapshot(input.planPath, input.expectedPlanSha256, dependencies.snapshotDependencies),
      jsonSnapshot(input.statePath, input.expectedStateSha256, dependencies.snapshotDependencies),
      jsonSnapshot(input.predecessorStatePath, input.expectedPredecessorSha256, dependencies.snapshotDependencies),
      jsonSnapshot(input.runnerInputPath, input.expectedRunnerInputSha256, dependencies.snapshotDependencies),
      jsonSnapshot(input.claimPath, input.expectedClaimSha256, dependencies.snapshotDependencies, { canonicalFeatureFlight: true }),
      jsonSnapshot(input.terminalPath, input.expectedTerminalSha256, dependencies.snapshotDependencies, { canonicalFeatureFlight: true }),
      jsonSnapshot(input.successorPath, input.expectedSuccessorSha256, dependencies.snapshotDependencies, { canonicalFeatureFlight: true }),
      jsonSnapshot(input.resultPath, input.expectedResultSha256, dependencies.snapshotDependencies, { canonicalFeatureFlight: true }),
      textSnapshot(input.executionJournalPath, input.expectedExecutionJournalSha256, dependencies.snapshotDependencies),
      jsonSnapshot(input.mackRequestPath, input.expectedMackRequestSha256, dependencies.snapshotDependencies),
      textSnapshot(input.reviewJournalPath, input.expectedReviewJournalSha256, dependencies.snapshotDependencies),
    ]);
    Object.assign(sourceArtifacts, {
      plan: artifactIdentity(planSnapshot), state: artifactIdentity(stateSnapshot), predecessor: artifactIdentity(predecessorSnapshot),
      runnerInput: artifactIdentity(runnerSnapshot), claim: artifactIdentity(claimSnapshot), terminal: artifactIdentity(terminalSnapshot),
      successor: artifactIdentity(successorSnapshot), result: artifactIdentity(resultSnapshot),
      executionJournal: artifactIdentity(executionJournalSnapshot), mackRequest: artifactIdentity(requestSnapshot), reviewJournal: artifactIdentity(reviewJournalSnapshot),
    });
    const plan = assertResolvedPlan(planSnapshot.value);
    const planArtifact = artifactIdentity(planSnapshot);
    const state = assertFlightState(plan, planArtifact, stateSnapshot.value);
    const predecessor = assertFlightState(plan, planArtifact, predecessorSnapshot.value, "predecessor");
    if (state.sequence !== input.expectedStateSequence || state.predecessorSha256 !== predecessorSnapshot.sha256 || predecessor.sequence !== state.sequence - 1 || validateImmediateTransition(plan, predecessor, state).length !== 0) throw new Error("flight_state_edge_invalid");
    const checkedRunner = validateRunnerCycleInput(runnerSnapshot.value);
    if (checkedRunner.state !== "valid" || digestBytes(Buffer.from(canonicalJson(checkedRunner.value), "utf8")) !== runnerSnapshot.sha256) throw new Error("runner_input_invalid");
    const runner = checkedRunner.value;
    const mission = plan.missions.find(({ id }) => id === claimSnapshot.value?.flight?.missionId);
    if (mission === undefined || state.missions[mission.id]?.status !== "active" || state.lanes[mission.lane]?.activeMissionId !== mission.id ||
        runner.plan.missionId !== mission.id || runner.projection.missionId !== mission.id || runner.plan.subjectId !== runner.projection.subjectId ||
        runner.plan.revisionId !== runner.projection.revisionId || runner.plan.evaluatedThroughSequence !== runner.projection.evaluatedThroughSequence) throw new Error("flight_runner_binding_invalid");
    const effectClaimId = featureFlightDigest({
      domain: "shield-feature-flight-effect-claim.v1", flightId: plan.flightId, planSha256: planArtifact.sha256,
      missionId: mission.id, subjectId: runner.plan.subjectId, missionRevision: runner.plan.revisionId,
      actionId: runner.plan.actionId, effectClass: runner.plan.effectClass, effectKey: runner.plan.effectKey,
    });
    const prepared = {
      plan, state, predecessor, mission, runner, effectClaimId, planArtifact, stateArtifact: artifactIdentity(stateSnapshot),
      predecessorArtifact: artifactIdentity(predecessorSnapshot), runnerInputSha256: runnerSnapshot.sha256,
      adapterDescriptor: copy(claimSnapshot.value.adapter), remoteObserverDescriptor: copy(claimSnapshot.value.remoteObserver),
    };
    const step = {
      status: "success_terminal", claim: claimSnapshot, terminal: terminalSnapshot, successor: successorSnapshot, result: resultSnapshot,
      hierarchyIdentity: terminalSnapshot.value.hierarchyIdentity,
      paths: { successor: successorSnapshot.path, result: resultSnapshot.path },
    };
    terminal = evaluateSuccessfulFeatureFlightTerminalV2(prepared, step);
  } catch {
    return closedFlight(sourceArtifacts);
  }

  let executionProjection; let reviewProjection; let descriptor; let repository;
  try {
    const executionReplay = replayProfileAwareMissionJournal(parseJournal(executionJournalSnapshot, 9));
    if (executionReplay.state !== "valid") throw new Error("execution_journal_invalid");
    executionProjection = executionReplay.value;
    const reviewReplay = replaySupervisedMissionJournal(parseJournal(reviewJournalSnapshot, 8));
    if (reviewReplay.state !== "valid") throw new Error("review_journal_invalid");
    reviewProjection = reviewReplay.value;
    descriptor = dependencies.reviewJournalDescriptor;
    if (!same(descriptor.journal, sourceArtifacts.reviewJournal) || descriptor.reviewMissionId !== reviewProjection.missionId ||
        descriptor.reviewMissionRevisionId !== reviewProjection.brief.revisionId || descriptor.reviewWorkItemSubjectId !== reviewProjection.brief.subjectId ||
        descriptor.repositoryReviewSubjectId !== reviewProjection.reviewSubject?.subjectId || descriptor.sourceRef !== reviewProjection.reviewSubject?.sourceRef ||
        input.reviewJournalPath !== descriptor.journal.path || input.expectedReviewJournalSha256 !== descriptor.journal.sha256) throw new Error("review_descriptor_binding_invalid");
  } catch {
    const base = closedFlight(sourceArtifacts, "review_revision_lineage_invalid").checkpoint;
    return finalResult({ ...base, phase: "review_revision_lineage", stopCode: "review_revision_lineage_invalid", nextAction: "repair_review_revision_lineage" });
  }
  try {
    const observedRepository = await dependencies.observeRepository(Object.freeze({ repositoryRoot: descriptor.repositoryRoot, branch: descriptor.branch }));
    exact(observedRepository, REPOSITORY_FIELDS, [], "repository observation");
    repository = copy(observedRepository);
    if (repository.repository !== descriptor.repository || repository.root !== descriptor.repositoryRoot || repository.branch !== descriptor.branch || repository.clean !== true ||
        repository.commonGitDirectory !== descriptor.commonGitDirectory || repository.commonGitDevice !== descriptor.commonGitDevice || repository.commonGitInode !== descriptor.commonGitInode ||
        !GIT_REVISION_PATTERN.test(repository.head ?? "") || repository.head !== reviewProjection.reviewSubject?.revisionId ||
        Number.isNaN(Date.parse(repository.observedAt)) || new Date(repository.observedAt).toISOString() !== repository.observedAt) throw new Error("repository_identity_invalid");
    if (Date.parse(repository.observedAt) < Date.parse(terminal.result.completedAt) || Date.parse(repository.observedAt) < Date.parse(reviewProjection.lastTimestamp.value)) throw new Error("repository_timestamp_rollback");
  } catch {
    const base = closedFlight(sourceArtifacts, "repository_freshness_invalid").checkpoint;
    return finalResult({ ...base, phase: "repository_freshness", stopCode: "repository_freshness_invalid", nextAction: "inspect_repository_identity" });
  }

  const flightCompletionRevision = terminal.result.repositoryAfter.head;
  const currentReviewRevision = reviewProjection.reviewSubject.revisionId;
  try {
    if (executionProjection.missionId !== terminal.result.runnerResult.missionId || executionProjection.brief.revisionId !== terminal.result.runnerResult.revisionId ||
        executionProjection.brief.subjectId !== terminal.result.runnerResult.subjectId || executionProjection.lastSequence !== terminal.result.runnerResult.evaluatedThroughSequence ||
        terminal.result.runnerResult.missionId !== runnerSnapshot.value.projection.missionId || terminal.result.runnerResult.revisionId !== runnerSnapshot.value.projection.revisionId ||
        runnerSnapshot.value.projection.missionAuthorizationState !== executionProjection.authorization || runnerSnapshot.value.projection.executionStatus !== executionProjection.execution ||
        runnerSnapshot.value.projection.executeReadiness !== executionProjection.readiness.execute ||
        !same(runnerSnapshot.value.projection.participantSeatIds, executionProjection.brief.participants.map(({ seatId }) => seatId)) ||
        !same(runnerSnapshot.value.projection.activatedModes, executionProjection.brief.activatedModes) || !same(runnerSnapshot.value.projection.effectRecords, executionProjection.effects) ||
        executionProjection.missionId === reviewProjection.missionId || executionProjection.brief.subjectId !== reviewProjection.brief.subjectId ||
        reviewProjection.brief.subjectId === reviewProjection.reviewSubject.subjectId || reviewProjection.reviewSubject.subjectId !== descriptor.repositoryReviewSubjectId ||
        reviewProjection.reviewSubject.sourceRef !== descriptor.sourceRef || !GIT_REVISION_PATTERN.test(flightCompletionRevision ?? "") ||
        !GIT_REVISION_PATTERN.test(currentReviewRevision ?? "") || repository.head !== currentReviewRevision) throw new Error("cross_binding_invalid");
    const revisions = reviewProjection.reviewRevisions;
    if (!Array.isArray(revisions) || revisions.length === 0 || revisions[0].revisionId !== flightCompletionRevision || revisions[0].supersedesRevisionId !== null ||
        revisions.filter(({ lifecycle }) => lifecycle === "current").length !== 1 || revisions.at(-1).revisionId !== currentReviewRevision ||
        revisions.some(({ revisionId }, index) => !GIT_REVISION_PATTERN.test(revisionId) || (index > 0 && revisions[index].supersedesRevisionId !== revisions[index - 1].revisionId)) ||
        new Set(revisions.map(({ revisionId }) => revisionId)).size !== revisions.length) throw new Error("revision_lineage_invalid");
  } catch {
    const base = closedFlight(sourceArtifacts, "review_revision_lineage_invalid").checkpoint;
    return finalResult({ ...base, phase: "review_revision_lineage", stopCode: "review_revision_lineage_invalid", nextAction: "repair_review_revision_lineage" });
  }

  const normalizedRequest = normalizeMackLocalValidationRequestV1(requestSnapshot.value);
  let mack;
  if (normalizedRequest.state !== "valid") {
    mack = { ...emptyGate("mack", "invalid"), requestRef: null, reasonCodes: ["mack_request_invalid"] };
  } else {
    const request = normalizedRequest.value;
    const stale = request.missionId !== reviewProjection.missionId || request.missionRevisionId !== reviewProjection.brief.revisionId ||
      request.subjectId !== reviewProjection.brief.subjectId || request.repository !== descriptor.repository || request.repositoryRoot !== descriptor.repositoryRoot ||
      request.canonicalGitDirectory !== descriptor.commonGitDirectory || request.branch !== descriptor.branch || request.baseRevisionId !== assertResolvedPlan(planSnapshot.value).repository.baseRevision ||
      request.artifactRevisionId !== currentReviewRevision || !same(request.repositoryContext.implementationPaths, descriptor.implementationPaths) ||
      !same(request.approvedTestSurfaces, descriptor.approvedTestSurfaces);
    if (stale) mack = { ...emptyGate("mack", "stale"), requestRef: request.validationRequestId, reasonCodes: ["mack_request_exact_binding_mismatch"] };
    else {
      const readback = await dependencies.readMackRegistry(request, Object.freeze({
        replayRegistryRoot: dependencies.mackReplayRegistryRoot,
        validationRequestId: request.validationRequestId,
        requestDigest: normalizedRequest.requestDigest,
      })).catch(() => ({ state: "recovery", reasonCode: "mack_registry_readback_uncertain" }));
      try { mack = mackGate(request, normalizedRequest.requestDigest, readback); }
      catch { mack = { ...emptyGate("mack", "invalid"), requestRef: request.validationRequestId, reasonCodes: ["mack_evidence_invalid"] }; }
    }
  }
  const fury = furyGate(reviewProjection);
  const fitz = currentHumanGate(reviewProjection, "fitz");
  const simmons = reviewProjection.brief.requireSimmons ? currentHumanGate(reviewProjection, "simmons") : null;
  const coulson = { ...emptyGate("coulson", "waiting"), reasonCodes: ["fixed_slice4_final_acceptance_stop"] };
  const gates = { mack, fury, fitz, simmons, coulson };
  const [stopCode, phase, gateSeatId, correctionSeatId, investigationSuggestionSeatId, nextAction] = stopFor(gates);
  const checkpoint = {
    schemaVersion: 1, projectionType: "feature-flight-review-checkpoint", contractVersion: FEATURE_FLIGHT_REVIEW_GATES_CONTRACT_VERSION,
    authority: "none", gateEligible: false, notice: FEATURE_FLIGHT_REVIEW_GATES_NOTICE, sourceArtifacts,
    binding: {
      executionMissionId: executionProjection.missionId, executionMissionRevisionId: executionProjection.brief.revisionId,
      reviewMissionId: reviewProjection.missionId, reviewMissionRevisionId: reviewProjection.brief.revisionId,
      executionWorkItemSubjectId: executionProjection.brief.subjectId, reviewWorkItemSubjectId: reviewProjection.brief.subjectId,
      repositoryReviewSubjectId: reviewProjection.reviewSubject.subjectId, flightCompletionRevision, currentReviewRevision,
      repository: descriptor.repository, repositoryRoot: descriptor.repositoryRoot, commonGitDirectory: descriptor.commonGitDirectory,
      commonGitDevice: descriptor.commonGitDevice, commonGitInode: descriptor.commonGitInode, branch: descriptor.branch,
      evaluatedReviewJournalThroughSequence: reviewProjection.lastSequence,
    },
    gates, phase, stopCode, gateSeatId, correctionSeatId, investigationSuggestionSeatId, nextAction,
  };
  return finalResult(checkpoint);
}
