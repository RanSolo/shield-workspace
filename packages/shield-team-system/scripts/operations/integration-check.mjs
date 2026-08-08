#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPlan, pathMatches } from './flight-common.mjs';
import { hashFile, readJson, stableJson, writeNewFile } from './common.mjs';

const TOOL_VERSION = '0.1.0-local-prototype';

export const checkIntegration = async ({ planPath, targetMissionId, packetPaths }) => {
  const plan = assertPlan(await readJson(planPath));
  const target = plan.missions.find((mission) => mission.id === targetMissionId);
  if (!target) throw new Error(`Target mission is not in the plan: ${targetMissionId}`);
  if ((target.dependsOn ?? []).length === 0) throw new Error(`${targetMissionId} has no declared integration dependencies.`);

  const errors = [];
  const packets = new Map();
  for (const path of packetPaths) {
    const absolutePath = resolve(path);
    const packet = await readJson(absolutePath);
    const missionId = packet.mission?.id;
    if (!missionId) errors.push(`${absolutePath} has no mission id.`);
    else if (packets.has(missionId)) errors.push(`Duplicate packet for ${missionId}.`);
    else packets.set(missionId, { packet, source: await hashFile(absolutePath) });
  }

  const evidence = [];
  for (const dependencyId of target.dependsOn) {
    const entry = packets.get(dependencyId);
    const mission = plan.missions.find((candidate) => candidate.id === dependencyId);
    if (!entry) {
      errors.push(`Missing exact packet for dependency ${dependencyId}.`);
      continue;
    }
    const { packet, source } = entry;
    if (packet.schemaVersion !== 1 || packet.packetType !== 'exact-mission-handoff') {
      errors.push(`${dependencyId} packet type is unsupported.`);
    }
    if (!['checkout', 'review'].includes(packet.mode)) errors.push(`${dependencyId} packet mode ${packet.mode} cannot prove completion.`);
    if (packet.acceptance?.phase !== 'green' || packet.acceptance?.ok !== true) {
      errors.push(`${dependencyId} does not carry passing GREEN acceptance.`);
    }
    if (packet.acceptance?.expectedRevision !== packet.repository?.head) {
      errors.push(`${dependencyId} acceptance is not bound to packet HEAD.`);
    }
    if (packet.repository?.clean !== true) errors.push(`${dependencyId} packet does not prove a clean tree.`);
    if (packet.repository?.branch !== mission?.branch) {
      errors.push(`${dependencyId} branch is ${packet.repository?.branch}; expected ${mission?.branch}.`);
    }
    for (const changedPath of packet.repository?.changedPaths ?? []) {
      if (!(mission?.writablePaths ?? []).some((ownedPath) => pathMatches(changedPath, ownedPath))) {
        errors.push(`${dependencyId} changed path is outside declared ownership: ${changedPath}`);
      }
    }
    evidence.push({
      missionId: dependencyId,
      revision: packet.repository?.head ?? null,
      changedPaths: packet.repository?.changedPaths ?? [],
      packet: source,
    });
  }
  for (const missionId of packets.keys()) {
    if (!target.dependsOn.includes(missionId)) errors.push(`Unexpected packet for non-dependency ${missionId}.`);
  }

  const changedOwners = new Map();
  for (const item of evidence) {
    for (const path of item.changedPaths) {
      if (changedOwners.has(path)) errors.push(`Exact changed-path collision: ${path} in ${changedOwners.get(path)} and ${item.missionId}.`);
      else changedOwners.set(path, item.missionId);
    }
  }

  return {
    schemaVersion: 1,
    reportType: 'feature-flight-integration-check',
    authority: 'none',
    notice: 'Compatibility evidence only. This report does not merge, approve, publish, deploy, or release.',
    tool: { name: 'integration-check', version: TOOL_VERSION },
    flightId: plan.flightId,
    targetMissionId,
    integrationBranch: plan.integration?.branch ?? null,
    plan: await hashFile(planPath),
    ok: errors.length === 0,
    errors,
    dependencyEvidence: evidence,
  };
};

const parse = (argv) => {
  const options = { packetPaths: [] };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === '--plan') options.planPath = argv.shift();
    else if (flag === '--target-mission') options.targetMissionId = argv.shift();
    else if (flag === '--packet') options.packetPaths.push(argv.shift());
    else if (flag === '--output') options.output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.planPath || !options.targetMissionId) {
    throw new Error('Usage: integration-check.mjs --plan FILE --target-mission ID --packet FILE... [--output FILE]');
  }
  return options;
};

const main = async () => {
  const options = parse(process.argv.slice(2));
  const report = await checkIntegration(options);
  const json = stableJson(report);
  if (options.output) await writeNewFile(options.output, json);
  process.stdout.write(json);
  if (!report.ok) process.exitCode = 2;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
