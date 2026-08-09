#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertPlan, GIT_REVISION_PATTERN } from "./flight-common.mjs";
import {
  SHA256_PATTERN,
  exactKeys,
  nonEmptyString,
  readJsonSnapshot,
  stableJson,
  writeNewFile,
} from "./common.mjs";
import {
  FLIGHT_STATE_GENESIS_PRODUCER,
  FLIGHT_STATE_NOTICE,
  FLIGHT_STATE_SUCCESSOR_PRODUCER,
  FLIGHT_STATE_TOOL_VERSION,
  FLIGHT_STATE_TYPE,
} from "./flight-state-init.mjs";

const TOOL_VERSION = "1.0.0";
const AUTHORITY_DERIVED_STATUSES = new Set(["authorized", "active", "complete", "integrated", "cancelled", "superseded"]);
const ROUTING_TERMINAL_STATUSES = new Set(["integrated"]);
const MISSION_STATUSES = new Set([
  "planned", "authorized", "active", "blocked", "failed", "complete", "integrated", "cancelled", "superseded",
]);
const LIFECYCLE_TRANSITIONS = new Map([
  ["planned", new Set(["planned", "authorized", "cancelled", "superseded"])],
  ["authorized", new Set(["authorized", "active", "blocked", "failed", "cancelled", "superseded"])],
  ["active", new Set(["active", "blocked", "failed", "complete", "cancelled", "superseded"])],
  ["blocked", new Set(["blocked", "active", "failed", "cancelled", "superseded"])],
  ["failed", new Set(["failed", "blocked", "cancelled", "superseded"])],
  ["complete", new Set(["complete", "integrated", "cancelled", "superseded"])],
  ["integrated", new Set(["integrated"])],
  ["cancelled", new Set(["cancelled"])],
  ["superseded", new Set(["superseded"])],
]);
const FRESHNESS_NOTICE = "The expected state SHA-256 and sequence prove only the supplied snapshot; they do not prove that it is the latest flight state.";
const REPORT_NOTICE = "Routing advice only. This report grants no mission or human authority and performs no dispatch, journal mutation, or external effect.";
const ADVISORY_CANDIDATES = new Set([
  "requires-authority-verification",
  "request-recovery-decision",
  "request-blocker-review",
  "request-independent-authority-verification",
]);

const artifactIdentity = (snapshot) => ({
  path: snapshot.path,
  bytes: snapshot.size,
  sha256: snapshot.sha256,
});

const sameArtifactIdentity = (left, right) =>
  left.path === right.path && left.bytes === right.bytes && left.sha256 === right.sha256;

const sameOrderedIdentities = (actual, expected) =>
  actual.length === expected.length && actual.every((identity, index) => identity === expected[index]);

const currentWaveFor = (plan, state) => {
  const dependencyReadyNonterminal = plan.missions.filter((mission) =>
    !ROUTING_TERMINAL_STATUSES.has(state.missions[mission.id].status) &&
    mission.dependsOn.every((dependency) => state.missions[dependency].status === "integrated"),
  );
  return dependencyReadyNonterminal.length === 0
    ? null
    : Math.min(...dependencyReadyNonterminal.map((mission) => mission.activationWave));
};

const validateState = (plan, planIdentity, state, label = "state") => {
  const errors = [];
  if (!exactKeys(state, [
    "schemaVersion", "stateType", "authority", "notice", "flightId", "plan", "sequence",
    "predecessorSha256", "repository", "wave", "lanes", "missions", "observedAt", "tool",
  ], label, errors)) return errors;
  if (state.schemaVersion !== 2) errors.push(`${label}.schemaVersion must equal 2.`);
  if (state.stateType !== FLIGHT_STATE_TYPE) errors.push(`${label}.stateType must equal ${FLIGHT_STATE_TYPE}.`);
  if (state.authority !== "none") errors.push(`${label}.authority must equal none.`);
  if (state.notice !== FLIGHT_STATE_NOTICE) errors.push(`${label}.notice must equal the fixed producer notice.`);
  if (state.flightId !== plan.flightId) errors.push(`${label}.flightId is ${state.flightId}; expected ${plan.flightId}.`);

  if (exactKeys(state.plan, ["path", "bytes", "sha256"], `${label}.plan`, errors)) {
    if (!nonEmptyString(state.plan.path)) errors.push(`${label}.plan.path must be a non-empty string.`);
    if (!Number.isSafeInteger(state.plan.bytes) || state.plan.bytes < 0) errors.push(`${label}.plan.bytes must be a non-negative safe integer.`);
    if (!SHA256_PATTERN.test(state.plan.sha256 ?? "")) errors.push(`${label}.plan.sha256 must be a lowercase SHA-256 digest.`);
    if (!sameArtifactIdentity(state.plan, planIdentity)) errors.push(`${label}.plan does not match the exact supplied plan snapshot.`);
  }
  if (!Number.isSafeInteger(state.sequence) || state.sequence < 0) errors.push(`${label}.sequence must be a non-negative safe integer.`);
  if (state.sequence === 0 && state.predecessorSha256 !== null) errors.push(`${label}.predecessorSha256 must be null only for genesis sequence 0.`);
  if (state.sequence > 0 && !SHA256_PATTERN.test(state.predecessorSha256 ?? "")) errors.push(`${label}.predecessorSha256 must be a lowercase SHA-256 digest after genesis.`);

  if (exactKeys(state.repository, ["root", "baseRef", "baseRevision", "integrationBranch"], `${label}.repository`, errors)) {
    const expectedRepository = {
      root: plan.repository.root,
      baseRef: plan.repository.baseRef,
      baseRevision: plan.repository.baseRevision,
      integrationBranch: plan.integration.branch,
    };
    for (const [field, expected] of Object.entries(expectedRepository)) {
      if (state.repository[field] !== expected) errors.push(`${label}.repository.${field} does not match the resolved plan.`);
    }
  }
  if (exactKeys(state.wave, ["current"], `${label}.wave`, errors) &&
      state.wave.current !== null && (!Number.isSafeInteger(state.wave.current) || state.wave.current < 1)) {
    errors.push(`${label}.wave.current must be null or a positive safe integer.`);
  }

  if (!state.lanes || typeof state.lanes !== "object" || Array.isArray(state.lanes)) {
    errors.push(`${label}.lanes must be an object keyed by planned lane id.`);
  } else {
    const plannedLaneOrder = plan.lanes.map((lane) => lane.id);
    const plannedLaneIds = new Set(plannedLaneOrder);
    if (!sameOrderedIdentities(Object.keys(state.lanes), plannedLaneOrder)) {
      errors.push(`${label}.lanes must preserve the exact planned lane identity and order.`);
    }
    for (const lane of plan.lanes) {
      const record = state.lanes[lane.id];
      if (!record) errors.push(`${label}.lanes is missing ${lane.id}.`);
      else if (exactKeys(record, ["activeMissionId"], `${label}.lanes.${lane.id}`, errors) &&
               record.activeMissionId !== null && !nonEmptyString(record.activeMissionId)) {
        errors.push(`${label}.lanes.${lane.id}.activeMissionId must be null or a non-empty mission id.`);
      }
    }
    for (const laneId of Object.keys(state.lanes)) {
      if (!plannedLaneIds.has(laneId)) errors.push(`${label}.lanes contains unknown lane ${laneId}.`);
    }
  }

  if (!state.missions || typeof state.missions !== "object" || Array.isArray(state.missions)) {
    errors.push(`${label}.missions must be an object keyed by planned mission id.`);
  } else {
    const plannedMissionOrder = plan.missions.map((mission) => mission.id);
    const plannedIds = new Set(plannedMissionOrder);
    if (!sameOrderedIdentities(Object.keys(state.missions), plannedMissionOrder)) {
      errors.push(`${label}.missions must preserve the exact planned mission identity and order.`);
    }
    for (const mission of plan.missions) {
      const record = state.missions[mission.id];
      const missionLabel = `${label}.missions.${mission.id}`;
      if (!record) {
        errors.push(`${label}.missions is missing ${mission.id}.`);
        continue;
      }
      if (!exactKeys(record, ["lane", "activationWave", "status", "revision", "authorityEvidence"], missionLabel, errors)) continue;
      if (record.lane !== mission.lane) errors.push(`${missionLabel}.lane does not match the resolved plan.`);
      if (record.activationWave !== mission.activationWave) errors.push(`${missionLabel}.activationWave does not match the resolved plan.`);
      if (!MISSION_STATUSES.has(record.status)) errors.push(`${missionLabel}.status is unsupported: ${record.status}.`);
      if (record.revision !== null && !GIT_REVISION_PATTERN.test(record.revision ?? "")) errors.push(`${missionLabel}.revision must be null or an exact 40-character revision.`);
      if (AUTHORITY_DERIVED_STATUSES.has(record.status) && !GIT_REVISION_PATTERN.test(record.revision ?? "")) {
        errors.push(`${missionLabel}.status ${record.status} requires an exact revision.`);
      }
      if (record.authorityEvidence !== null) errors.push(`${missionLabel}.authorityEvidence must be null because this contract has no trusted journal verifier.`);
    }
    for (const missionId of Object.keys(state.missions)) {
      if (!plannedIds.has(missionId)) errors.push(`${label}.missions contains unknown mission ${missionId}.`);
    }
  }

  if (!nonEmptyString(state.observedAt) || Number.isNaN(Date.parse(state.observedAt))) errors.push(`${label}.observedAt must be a timestamp string.`);
  if (exactKeys(state.tool, ["name", "version"], `${label}.tool`, errors)) {
    const expectedProducer = state.sequence === 0
      ? FLIGHT_STATE_GENESIS_PRODUCER
      : state.sequence > 0 ? FLIGHT_STATE_SUCCESSOR_PRODUCER : null;
    if (state.tool.name !== expectedProducer || state.tool.version !== FLIGHT_STATE_TOOL_VERSION) {
      errors.push(`${label}.tool must identify the sequence-specific ${expectedProducer ?? "valid"} producer.`);
    }
  }

  if (errors.length === 0) {
    const activeByLane = new Map();
    for (const mission of plan.missions) {
      if (state.missions[mission.id].status !== "active") continue;
      if (activeByLane.has(mission.lane)) {
        errors.push(`Lane ${mission.lane} has multiple active missions: ${activeByLane.get(mission.lane)} and ${mission.id}.`);
      } else activeByLane.set(mission.lane, mission.id);
    }
    for (const lane of plan.lanes) {
      const expectedActiveMissionId = activeByLane.get(lane.id) ?? null;
      if (state.lanes[lane.id].activeMissionId !== expectedActiveMissionId) {
        errors.push(`${label}.lanes.${lane.id}.activeMissionId does not match active mission observations.`);
      }
    }
    for (const mission of plan.missions) {
      const record = state.missions[mission.id];
      const unmet = mission.dependsOn.filter((dependency) => state.missions[dependency].status !== "integrated");
      if (["active", "complete", "integrated"].includes(record.status) && unmet.length > 0) {
        errors.push(`${mission.id} is ${record.status} before integrated dependencies: ${unmet.join(", ")}.`);
      }
    }
    const expectedWave = currentWaveFor(plan, state);
    if (state.wave.current !== expectedWave) errors.push(`${label}.wave.current is ${state.wave.current}; expected ${expectedWave}.`);
  }
  return errors;
};

const validateLifecycleTransition = (plan, predecessor, state) => {
  const errors = [];
  if (predecessor.wave.current === null && state.wave.current !== null) {
    errors.push("Flight wave cannot regress from terminal null to an active wave.");
  } else if (predecessor.wave.current !== null && state.wave.current !== null &&
             state.wave.current < predecessor.wave.current) {
    errors.push(`Flight wave regressed from ${predecessor.wave.current} to ${state.wave.current}.`);
  }
  for (const mission of plan.missions) {
    const prior = predecessor.missions[mission.id];
    const current = state.missions[mission.id];
    if (!prior || !current) continue;
    const allowed = LIFECYCLE_TRANSITIONS.get(prior.status);
    if (!allowed?.has(current.status)) {
      errors.push(`${mission.id} lifecycle transition ${prior.status} -> ${current.status} is not allowed.`);
    }
    if (current.lane !== prior.lane || current.activationWave !== prior.activationWave) {
      errors.push(`${mission.id} lane or activation-wave identity changed across the predecessor transition.`);
    }
    if (prior.revision !== null && current.revision !== prior.revision) {
      errors.push(current.revision === null
        ? `${mission.id} revision cannot be cleared after it is established.`
        : `${mission.id} revision cannot be substituted after it is established.`);
    }
  }
  return errors;
};

const validateArtifactIdentity = (value, label, errors) => {
  if (!exactKeys(value, ["path", "bytes", "sha256"], label, errors)) return;
  if (!nonEmptyString(value.path)) errors.push(`${label}.path must be a non-empty string.`);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0) errors.push(`${label}.bytes must be a non-negative safe integer.`);
  if (!SHA256_PATTERN.test(value.sha256 ?? "")) errors.push(`${label}.sha256 must be a lowercase SHA-256 digest.`);
};

export const validateRoutingAdviceReport = (report) => {
  const errors = [];
  if (!exactKeys(report, [
    "schemaVersion", "reportType", "authority", "notice", "freshnessNotice", "tool", "flightId",
    "sequence", "currentWave", "plan", "state", "predecessor", "stateExpectation", "missions", "advisories",
  ], "report", errors)) return errors;
  if (report.schemaVersion !== 1) errors.push("report.schemaVersion must equal 1.");
  if (report.reportType !== "hill-flight-routing-advice") errors.push("report.reportType must equal hill-flight-routing-advice.");
  if (report.authority !== "none") errors.push("report.authority must equal none.");
  if (report.notice !== REPORT_NOTICE) errors.push("report.notice must equal the fixed producer notice.");
  if (report.freshnessNotice !== FRESHNESS_NOTICE) errors.push("report.freshnessNotice must equal the fixed freshness limitation.");
  if (exactKeys(report.tool, ["name", "version"], "report.tool", errors) &&
      (report.tool.name !== "hill-kernel" || report.tool.version !== TOOL_VERSION)) errors.push("report.tool identity is unsupported.");
  if (!nonEmptyString(report.flightId)) errors.push("report.flightId must be a non-empty string.");
  if (!Number.isSafeInteger(report.sequence) || report.sequence < 0) errors.push("report.sequence must be a non-negative safe integer.");
  if (report.currentWave !== null && (!Number.isSafeInteger(report.currentWave) || report.currentWave < 1)) errors.push("report.currentWave must be null or a positive safe integer.");
  validateArtifactIdentity(report.plan, "report.plan", errors);
  validateArtifactIdentity(report.state, "report.state", errors);
  if (report.predecessor !== null) validateArtifactIdentity(report.predecessor, "report.predecessor", errors);
  if (exactKeys(report.stateExpectation, ["expectedSha256", "expectedSequence", "matchedSuppliedSnapshot", "provesLatestState"], "report.stateExpectation", errors)) {
    if (!SHA256_PATTERN.test(report.stateExpectation.expectedSha256 ?? "")) errors.push("report.stateExpectation.expectedSha256 must be a lowercase SHA-256 digest.");
    if (!Number.isSafeInteger(report.stateExpectation.expectedSequence) || report.stateExpectation.expectedSequence < 0) errors.push("report.stateExpectation.expectedSequence must be a non-negative safe integer.");
    if (report.stateExpectation.matchedSuppliedSnapshot !== true) errors.push("report.stateExpectation.matchedSuppliedSnapshot must equal true.");
    if (report.stateExpectation.provesLatestState !== false) errors.push("report.stateExpectation.provesLatestState must equal false.");
  }
  if (!Array.isArray(report.missions)) errors.push("report.missions must be an array.");
  else for (const [index, mission] of report.missions.entries()) {
    const label = `report.missions[${index}]`;
    if (!exactKeys(mission, ["id", "lane", "activationWave", "status", "revision", "unmetDependencies", "disposition", "advisoryCandidates"], label, errors)) continue;
    if (!nonEmptyString(mission.id) || !nonEmptyString(mission.lane)) errors.push(`${label} identity fields must be non-empty strings.`);
    if (!Number.isSafeInteger(mission.activationWave) || mission.activationWave < 1) errors.push(`${label}.activationWave must be a positive safe integer.`);
    if (!MISSION_STATUSES.has(mission.status)) errors.push(`${label}.status is unsupported.`);
    if (mission.revision !== null && !GIT_REVISION_PATTERN.test(mission.revision ?? "")) errors.push(`${label}.revision must be null or an exact revision.`);
    if (!Array.isArray(mission.unmetDependencies) || mission.unmetDependencies.some((dependency) => !nonEmptyString(dependency))) errors.push(`${label}.unmetDependencies must be an array of non-empty strings.`);
    if (!nonEmptyString(mission.disposition)) errors.push(`${label}.disposition must be a non-empty string.`);
    if (!Array.isArray(mission.advisoryCandidates) || mission.advisoryCandidates.some((candidate) => !ADVISORY_CANDIDATES.has(candidate))) errors.push(`${label}.advisoryCandidates contains an unsupported candidate.`);
  }
  if (!Array.isArray(report.advisories)) errors.push("report.advisories must be an array.");
  else for (const [index, advisory] of report.advisories.entries()) {
    const label = `report.advisories[${index}]`;
    if (!exactKeys(advisory, ["missionId", "candidate"], label, errors)) continue;
    if (!nonEmptyString(advisory.missionId) || !ADVISORY_CANDIDATES.has(advisory.candidate)) errors.push(`${label} is unsupported.`);
  }
  return errors;
};

const requireDigest = (value, name) => {
  if (!SHA256_PATTERN.test(value ?? "")) throw new Error(`${name} must be a lowercase SHA-256 digest.`);
};

export const computeFlightStatus = async ({
  planPath,
  statePath,
  expectedStateSha256,
  expectedStateSequence,
  predecessorStatePath,
  expectedPredecessorSha256,
}) => {
  requireDigest(expectedStateSha256, "expectedStateSha256");
  if (!Number.isSafeInteger(expectedStateSequence) || expectedStateSequence < 0) {
    throw new Error("expectedStateSequence must be a non-negative safe integer.");
  }

  const [planSnapshot, stateSnapshot] = await Promise.all([
    readJsonSnapshot(planPath),
    readJsonSnapshot(statePath),
  ]);
  const plan = assertPlan(planSnapshot.value);
  const planIdentity = artifactIdentity(planSnapshot);
  const state = stateSnapshot.value;
  const errors = validateState(plan, planIdentity, state);
  if (stateSnapshot.sha256 !== expectedStateSha256) errors.push("Expected state SHA-256 does not match the supplied state snapshot.");
  if (state.sequence !== expectedStateSequence) errors.push(`Expected state sequence ${expectedStateSequence} does not match supplied sequence ${state.sequence}.`);
  if (errors.length > 0) throw new Error(`Invalid flight state:\n- ${errors.join("\n- ")}`);

  let predecessorSnapshot = null;
  if (state.sequence === 0) {
    if (predecessorStatePath !== undefined || expectedPredecessorSha256 !== undefined) {
      throw new Error("Genesis state must not supply predecessor snapshot evidence.");
    }
  } else {
    if (!predecessorStatePath) throw new Error("predecessorStatePath is required after genesis.");
    requireDigest(expectedPredecessorSha256, "expectedPredecessorSha256");
    predecessorSnapshot = await readJsonSnapshot(predecessorStatePath);
    const predecessorErrors = validateState(plan, planIdentity, predecessorSnapshot.value, "predecessor");
    if (predecessorSnapshot.sha256 !== expectedPredecessorSha256) predecessorErrors.push("Expected predecessor SHA-256 does not match the supplied predecessor snapshot.");
    if (state.predecessorSha256 !== predecessorSnapshot.sha256) predecessorErrors.push("Current state predecessorSha256 does not match the supplied predecessor snapshot.");
    if (predecessorSnapshot.value.flightId !== state.flightId) predecessorErrors.push("Predecessor flightId does not match the current state.");
    if (!sameArtifactIdentity(predecessorSnapshot.value.plan, state.plan)) predecessorErrors.push("Predecessor plan identity does not match the current state.");
    if (predecessorSnapshot.value.sequence !== state.sequence - 1) predecessorErrors.push("Predecessor sequence must equal current sequence minus one.");
    if (predecessorErrors.length > 0) throw new Error(`Invalid predecessor flight state:\n- ${predecessorErrors.join("\n- ")}`);
    const transitionErrors = validateLifecycleTransition(plan, predecessorSnapshot.value, state);
    if (transitionErrors.length > 0) throw new Error(`Invalid flight state transition:\n- ${transitionErrors.join("\n- ")}`);
  }

  const activeByLane = new Map(plan.lanes.map((lane) => [lane.id, state.lanes[lane.id].activeMissionId]));
  const hasAuthorityDerivedState = [state, predecessorSnapshot?.value].filter(Boolean).some((snapshot) =>
    plan.missions.some((mission) => AUTHORITY_DERIVED_STATUSES.has(snapshot.missions[mission.id].status)),
  );
  const missions = plan.missions.map((mission) => {
    const record = state.missions[mission.id];
    const unmetDependencies = mission.dependsOn.filter(
      (dependency) => state.missions[dependency].status !== "integrated",
    );
    const unverifiedIntegratedDependencies = mission.dependsOn.filter(
      (dependency) => state.missions[dependency].status === "integrated",
    );
    const laneOccupant = activeByLane.get(mission.lane);
    let disposition;
    let advisoryCandidates = [];
    if (AUTHORITY_DERIVED_STATUSES.has(record.status)) {
      disposition = "requires-authority-verification";
      advisoryCandidates = ["requires-authority-verification"];
    } else if (record.status === "failed") {
      disposition = "recovery-required";
      advisoryCandidates = ["request-recovery-decision"];
    } else if (record.status === "blocked") {
      disposition = "blocked";
      advisoryCandidates = ["request-blocker-review"];
    } else if (ROUTING_TERMINAL_STATUSES.has(record.status)) {
      disposition = record.status;
    } else if (unmetDependencies.length > 0) {
      disposition = "waiting-for-integrated-dependencies";
    } else if (unverifiedIntegratedDependencies.length > 0) {
      disposition = "requires-authority-verification";
      advisoryCandidates = ["requires-authority-verification"];
    } else if (laneOccupant && laneOccupant !== mission.id) {
      disposition = `waiting-for-lane:${laneOccupant}`;
    } else if (mission.activationWave > state.wave.current) {
      disposition = `waiting-for-activation-wave:${state.wave.current}`;
    } else {
      disposition = "eligible-for-independent-authority-verification";
      advisoryCandidates = ["request-independent-authority-verification"];
    }
    if (hasAuthorityDerivedState && advisoryCandidates.some((candidate) => candidate !== "requires-authority-verification")) {
      disposition = "requires-authority-verification";
      advisoryCandidates = ["requires-authority-verification"];
    }
    return {
      id: mission.id,
      lane: record.lane,
      activationWave: record.activationWave,
      status: record.status,
      revision: record.revision,
      unmetDependencies,
      disposition,
      advisoryCandidates,
    };
  });

  const report = {
    schemaVersion: 1,
    reportType: "hill-flight-routing-advice",
    authority: "none",
    notice: REPORT_NOTICE,
    freshnessNotice: FRESHNESS_NOTICE,
    tool: { name: "hill-kernel", version: TOOL_VERSION },
    flightId: plan.flightId,
    sequence: state.sequence,
    currentWave: state.wave.current,
    plan: planIdentity,
    state: artifactIdentity(stateSnapshot),
    predecessor: predecessorSnapshot === null ? null : artifactIdentity(predecessorSnapshot),
    stateExpectation: {
      expectedSha256: expectedStateSha256,
      expectedSequence: expectedStateSequence,
      matchedSuppliedSnapshot: true,
      provesLatestState: false,
    },
    missions,
    advisories: missions.flatMap((mission) =>
      mission.advisoryCandidates.map((candidate) => ({ missionId: mission.id, candidate }))),
  };
  const reportErrors = validateRoutingAdviceReport(report);
  if (reportErrors.length > 0) throw new Error(`Invalid routing advice report:\n- ${reportErrors.join("\n- ")}`);
  return report;
};

const parse = (argv) => {
  const options = {};
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--plan") options.planPath = argv.shift();
    else if (flag === "--state") options.statePath = argv.shift();
    else if (flag === "--expected-state-sha256") options.expectedStateSha256 = argv.shift();
    else if (flag === "--expected-state-sequence") {
      const value = argv.shift();
      options.expectedStateSequence = value === undefined ? undefined : Number(value);
    } else if (flag === "--predecessor-state") options.predecessorStatePath = argv.shift();
    else if (flag === "--expected-predecessor-sha256") options.expectedPredecessorSha256 = argv.shift();
    else if (flag === "--output") options.output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.planPath || !options.statePath || options.expectedStateSha256 === undefined || options.expectedStateSequence === undefined) {
    throw new Error("Usage: hill-kernel.mjs --plan FILE --state FILE --expected-state-sha256 SHA256 --expected-state-sequence N [--predecessor-state FILE --expected-predecessor-sha256 SHA256] [--output NEW_FILE]");
  }
  return options;
};

const main = async () => {
  const options = parse(process.argv.slice(2));
  const report = await computeFlightStatus(options);
  const json = stableJson(report);
  if (options.output) await writeNewFile(options.output, json);
  process.stdout.write(json);
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
