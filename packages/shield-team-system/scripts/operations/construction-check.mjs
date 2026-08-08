#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPlan } from './flight-common.mjs';
import { hashFile, inspectGit, readJson, stableJson, writeNewFile } from './common.mjs';

const TOOL_VERSION = '0.1.0-local-prototype';

export const checkConstruction = async ({ planPath, requireCreated = false }) => {
  const plan = assertPlan(await readJson(planPath));
  const observations = [];
  const errors = [];
  for (const mission of plan.missions) {
    const path = resolve(mission.worktree);
    if (!existsSync(path)) {
      observations.push({ missionId: mission.id, path, status: 'not-created', branch: null, head: null, clean: null });
      if (requireCreated) errors.push(`${mission.id} worktree is not created: ${path}`);
      continue;
    }
    const repository = inspectGit(path);
    if (!repository || repository.root !== path) {
      observations.push({ missionId: mission.id, path, status: 'collision-not-worktree', branch: null, head: null, clean: null });
      errors.push(`${mission.id} path exists but is not the root of a Git worktree: ${path}`);
      continue;
    }
    const branchMatches = repository.branch === mission.branch;
    observations.push({
      missionId: mission.id,
      path,
      status: branchMatches ? (repository.dirty ? 'created-dirty' : 'created-clean') : 'wrong-branch',
      branch: repository.branch,
      expectedBranch: mission.branch,
      head: repository.head,
      clean: !repository.dirty,
    });
    if (!branchMatches) errors.push(`${mission.id} branch is ${repository.branch}; expected ${mission.branch}.`);
  }
  return {
    schemaVersion: 1,
    reportType: 'flight-construction-check',
    authority: 'none',
    tool: { name: 'construction-check', version: TOOL_VERSION },
    flightId: plan.flightId,
    plan: await hashFile(planPath),
    requireCreated,
    ok: errors.length === 0,
    errors,
    observations,
  };
};

const parse = (argv) => {
  const options = { requireCreated: false };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === '--plan') options.planPath = argv.shift();
    else if (flag === '--require-created') options.requireCreated = true;
    else if (flag === '--output') options.output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.planPath) throw new Error('Usage: construction-check.mjs --plan FILE [--require-created] [--output FILE]');
  return options;
};

const main = async () => {
  const options = parse(process.argv.slice(2));
  const report = await checkConstruction(options);
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
