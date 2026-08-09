#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertPlan } from "./flight-common.mjs";
import { readJsonSnapshot, stableJson, writeNewFile } from "./common.mjs";

export const FLIGHT_STATE_TYPE = "non-authoritative-flight-state";
export const FLIGHT_STATE_NOTICE = "Observed coordination state only. Lifecycle status and authorityEvidence do not grant or prove SHIELD or human authority.";
export const FLIGHT_STATE_TOOL_VERSION = "1.0.0";
export const FLIGHT_STATE_GENESIS_PRODUCER = "flight-state-init";
export const FLIGHT_STATE_SUCCESSOR_PRODUCER = "flight-state-successor-recorder";

const artifactIdentity = (snapshot) => ({
  path: snapshot.path,
  bytes: snapshot.size,
  sha256: snapshot.sha256,
});

export const initializeFlightState = async ({ planPath, output }) => {
  const planSnapshot = await readJsonSnapshot(planPath);
  const plan = assertPlan(planSnapshot.value);
  const currentWave = Math.min(...plan.missions.map((mission) => mission.activationWave));
  const state = {
    schemaVersion: 2,
    stateType: FLIGHT_STATE_TYPE,
    authority: "none",
    notice: FLIGHT_STATE_NOTICE,
    flightId: plan.flightId,
    plan: artifactIdentity(planSnapshot),
    sequence: 0,
    predecessorSha256: null,
    repository: {
      root: plan.repository.root,
      baseRef: plan.repository.baseRef,
      baseRevision: plan.repository.baseRevision,
      integrationBranch: plan.integration.branch,
    },
    wave: { current: currentWave },
    lanes: Object.fromEntries(plan.lanes.map((lane) => [lane.id, { activeMissionId: null }])),
    missions: Object.fromEntries(plan.missions.map((mission) => [mission.id, {
      lane: mission.lane,
      activationWave: mission.activationWave,
      status: "planned",
      revision: null,
      authorityEvidence: null,
    }])),
    observedAt: new Date().toISOString(),
    tool: { name: FLIGHT_STATE_GENESIS_PRODUCER, version: FLIGHT_STATE_TOOL_VERSION },
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
    if (flag === "--plan") planPath = argv.shift();
    else if (flag === "--output") output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!planPath || !output) throw new Error("Usage: flight-state-init.mjs --plan FILE --output NEW_FILE");
  const state = await initializeFlightState({ planPath, output });
  process.stdout.write(stableJson(state));
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
