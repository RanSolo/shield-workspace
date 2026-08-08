#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPlan, MISSION_STATUSES, terminalStatuses } from './flight-common.mjs';
import { hashFile, readJson, stableJson, writeNewFile } from './common.mjs';

const TOOL_VERSION = '0.1.0-local-prototype';

const validateState = (plan, state) => {
  const errors = [];
  if (state.schemaVersion !== 1) errors.push('State schemaVersion must equal 1.');
  if (state.flightId !== plan.flightId) errors.push(`State flight is ${state.flightId}; expected ${plan.flightId}.`);
  if (!state.missions || typeof state.missions !== 'object' || Array.isArray(state.missions)) {
    errors.push('State missions must be an object keyed by mission id.');
    return errors;
  }
  const plannedIds = new Set(plan.missions.map((mission) => mission.id));
  for (const mission of plan.missions) {
    const record = state.missions[mission.id];
    if (!record) errors.push(`Missing state for ${mission.id}.`);
    else {
      if (!MISSION_STATUSES.has(record.status)) errors.push(`${mission.id} has unknown status ${record.status}.`);
      if (['authorized', 'active', 'complete', 'integrated'].includes(record.status) && !record.revision) {
        errors.push(`${mission.id} status ${record.status} requires an exact revision.`);
      }
    }
  }
  for (const id of Object.keys(state.missions)) {
    if (!plannedIds.has(id)) errors.push(`State contains unknown mission ${id}.`);
  }
  return errors;
};

export const computeFlightStatus = async ({ planPath, statePath }) => {
  const [plan, state] = await Promise.all([readJson(planPath), readJson(statePath)]);
  assertPlan(plan);
  const errors = validateState(plan, state);
  if (errors.length > 0) throw new Error(`Invalid flight state:\n- ${errors.join('\n- ')}`);

  const activeByLane = new Map();
  for (const mission of plan.missions) {
    if (state.missions[mission.id].status === 'active') {
      if (activeByLane.has(mission.lane)) {
        errors.push(`Lane ${mission.lane} has multiple active missions: ${activeByLane.get(mission.lane)} and ${mission.id}.`);
      } else activeByLane.set(mission.lane, mission.id);
    }
  }
  for (const mission of plan.missions) {
    const record = state.missions[mission.id];
    const unmet = (mission.dependsOn ?? []).filter(
      (dependency) => state.missions[dependency]?.status !== 'integrated',
    );
    if (['active', 'complete', 'integrated'].includes(record.status) && unmet.length > 0) {
      errors.push(`${mission.id} is ${record.status} before integrated dependencies: ${unmet.join(', ')}.`);
    }
  }
  if (errors.length > 0) throw new Error(`Unsafe flight state:\n- ${errors.join('\n- ')}`);

  const dependencyReadyNonterminal = plan.missions.filter((mission) =>
    !terminalStatuses.has(state.missions[mission.id].status) &&
    (mission.dependsOn ?? []).every((dependency) => state.missions[dependency]?.status === 'integrated'),
  );
  const currentWave = dependencyReadyNonterminal.length === 0
    ? null
    : Math.min(...dependencyReadyNonterminal.map((mission) => mission.activationWave ?? 1));

  const missions = plan.missions.map((mission) => {
    const record = state.missions[mission.id];
    const unmetDependencies = (mission.dependsOn ?? []).filter(
      (dependency) => state.missions[dependency]?.status !== 'integrated',
    );
    const laneOccupant = activeByLane.get(mission.lane);
    let disposition;
    let legalActions = [];
    if (terminalStatuses.has(record.status)) disposition = record.status;
    else if (record.status === 'complete') {
      disposition = 'ready-for-exact-review-and-integration';
      legalActions = ['compile-checkout', 'review', 'integrate-after-required-human-gates'];
    } else if (record.status === 'active') {
      disposition = 'active';
      legalActions = ['continue', 'block', 'fail', 'complete'];
    } else if (record.status === 'failed') {
      disposition = 'recovery-required';
      legalActions = ['resume-after-recovery-decision', 'cancel', 'supersede'];
    } else if (record.status === 'blocked') {
      disposition = 'blocked';
      legalActions = ['resume-after-blocker-clears', 'cancel', 'supersede'];
    } else if (unmetDependencies.length > 0) {
      disposition = 'waiting-for-integrated-dependencies';
    } else if (laneOccupant && laneOccupant !== mission.id) {
      disposition = `waiting-for-lane:${laneOccupant}`;
    } else if ((mission.activationWave ?? 1) > currentWave) {
      disposition = `waiting-for-activation-wave:${currentWave}`;
    } else if (record.status === 'authorized') {
      disposition = 'eligible-to-activate';
      legalActions = ['activate'];
    } else {
      disposition = 'eligible-for-independent-authorization';
      legalActions = ['authorize-with-fresh-exact-binding'];
    }
    return {
      id: mission.id,
      lane: mission.lane,
      status: record.status,
      revision: record.revision ?? null,
      unmetDependencies,
      disposition,
      legalActions,
    };
  });

  return {
    schemaVersion: 1,
    reportType: 'hill-flight-status',
    authority: 'none',
    notice: 'Routing advice only. This report grants no mission or human authority.',
    tool: { name: 'hill-kernel', version: TOOL_VERSION },
    flightId: plan.flightId,
    currentWave,
    plan: await hashFile(planPath),
    state: await hashFile(statePath),
    missions,
    events: missions.flatMap((mission) => mission.legalActions.map((action) => ({ missionId: mission.id, action }))),
  };
};

const parse = (argv) => {
  const options = {};
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === '--plan') options.planPath = argv.shift();
    else if (flag === '--state') options.statePath = argv.shift();
    else if (flag === '--output') options.output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.planPath || !options.statePath) throw new Error('Usage: hill-kernel.mjs --plan FILE --state FILE [--output FILE]');
  return options;
};

const main = async () => {
  const options = parse(process.argv.slice(2));
  const report = await computeFlightStatus(options);
  const json = stableJson(report);
  if (options.output) await writeNewFile(options.output, json);
  process.stdout.write(json);
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
