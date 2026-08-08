#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPlan } from './flight-common.mjs';
import { hashFile, readJson, stableJson, writeNewFile } from './common.mjs';

const TOOL_VERSION = '0.1.0-local-prototype';

export const initializeFlightState = async ({ planPath, output }) => {
  const plan = assertPlan(await readJson(planPath));
  const state = {
    schemaVersion: 1,
    stateType: 'non-authoritative-flight-observation',
    authority: 'none',
    notice: 'Observed coordination state only. A status value does not grant or prove SHIELD or human authority.',
    flightId: plan.flightId,
    plan: await hashFile(planPath),
    initializedAt: new Date().toISOString(),
    tool: { name: 'flight-state-init', version: TOOL_VERSION },
    missions: Object.fromEntries(plan.missions.map((mission) => [mission.id, {
      status: 'planned',
      revision: null,
      authorityEvidence: null,
      updatedAt: null,
    }])),
  };
  await writeNewFile(output, stableJson(state));
  return state;
};

const main = async () => {
  const argv = process.argv.slice(2);
  let planPath;
  let output;
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === '--plan') planPath = argv.shift();
    else if (flag === '--output') output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!planPath || !output) throw new Error('Usage: flight-state-init.mjs --plan FILE --output NEW_FILE');
  const state = await initializeFlightState({ planPath, output });
  process.stdout.write(stableJson(state));
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
