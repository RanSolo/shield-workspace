#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPlan } from './flight-common.mjs';
import { git, hashFile, inspectGit, readJsonSnapshot, stableJson, tryGit, writeNewFile } from './common.mjs';

const TOOL_VERSION = '0.1.0-local-prototype';

export const planTeardown = async ({ planPath, integrationRef }) => {
  const plan = assertPlan((await readJsonSnapshot(planPath)).value);
  const repositoryRoot = plan.repository?.root;
  const resolvedIntegrationRef = integrationRef ?? plan.integration?.branch;
  const integrationRevision = repositoryRoot && resolvedIntegrationRef
    ? tryGit(repositoryRoot, ['rev-parse', '--verify', `${resolvedIntegrationRef}^{commit}`])
    : undefined;
  const worktrees = [];
  for (const mission of plan.missions) {
    const path = resolve(mission.worktree);
    if (!existsSync(path)) {
      worktrees.push({ missionId: mission.id, path, disposition: 'already-absent', recoverable: true });
      continue;
    }
    const observed = inspectGit(path);
    if (!observed || observed.root !== path) {
      worktrees.push({ missionId: mission.id, path, disposition: 'preserve-path-collision', recoverable: null });
      continue;
    }
    if (observed.branch !== mission.branch) {
      worktrees.push({ missionId: mission.id, path, disposition: 'preserve-wrong-branch', recoverable: true, observed });
      continue;
    }
    if (observed.dirty) {
      worktrees.push({ missionId: mission.id, path, disposition: 'preserve-dirty', recoverable: true, observed });
      continue;
    }
    const mergeBase = integrationRevision ? git(path, ['merge-base', observed.head, integrationRevision]) : null;
    const integrated = mergeBase === observed.head;
    worktrees.push({
      missionId: mission.id,
      path,
      disposition: integrated ? 'eligible-for-human-confirmed-removal' : 'retain-clean-unintegrated',
      recoverable: true,
      observed,
      integrationRef: resolvedIntegrationRef ?? null,
      integrationRevision: integrationRevision ?? null,
    });
  }
  return {
    schemaVersion: 1,
    reportType: 'feature-flight-teardown-plan',
    authority: 'none',
    notice: 'Read-only recovery plan. No worktree, branch, file, or evidence was removed.',
    tool: { name: 'teardown-plan', version: TOOL_VERSION },
    flightId: plan.flightId,
    plan: await hashFile(planPath),
    integrationRef: resolvedIntegrationRef ?? null,
    integrationRevision: integrationRevision ?? null,
    worktrees,
  };
};

const main = async () => {
  const argv = process.argv.slice(2);
  let planPath;
  let integrationRef;
  let output;
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === '--plan') planPath = argv.shift();
    else if (flag === '--integration-ref') integrationRef = argv.shift();
    else if (flag === '--output') output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!planPath) throw new Error('Usage: teardown-plan.mjs --plan FILE [--integration-ref REF] [--output FILE]');
  const report = await planTeardown({ planPath, integrationRef });
  const json = stableJson(report);
  if (output) await writeNewFile(output, json);
  process.stdout.write(json);
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
