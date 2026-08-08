#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPlan, inspectPlannedRepository, TOOL_VERSION } from './flight-common.mjs';
import {
  assertNoSymlinkComponents,
  canonicalExistingPath,
  canonicalNewPath,
  inspectGit,
  snapshotFile,
  stableJson,
  writeNewFile,
} from './common.mjs';

const isAncestor = (repositoryPath, ancestor, descendant) => {
  try {
    execFileSync('git', ['-C', repositoryPath, 'merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

export const loadPlanSnapshot = async (planPath) => {
  const snapshot = await snapshotFile(planPath);
  let value;
  try {
    value = JSON.parse(snapshot.bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid flight plan JSON: ${error instanceof Error ? error.message : error}`);
  }
  return { snapshot, plan: assertPlan(value) };
};

export const checkConstruction = async ({ planPath, requireCreated = false, loadedPlan }) => {
  const loaded = loadedPlan ?? await loadPlanSnapshot(planPath);
  const { plan, snapshot } = loaded;
  const repositoryCheck = await inspectPlannedRepository(plan.repository, { requireExactHead: true });
  const errors = [...repositoryCheck.errors];
  if (repositoryCheck.repository && !repositoryCheck.repository.clean) {
    errors.push('Planning repository worktree drift: repository is dirty.');
  }
  const observations = [];

  for (const mission of plan.missions) {
    let expectedPath;
    try {
      await assertNoSymlinkComponents(mission.worktree);
      expectedPath = await canonicalNewPath(mission.worktree);
    } catch (error) {
      errors.push(`${mission.id} controlled worktree path is unsafe: ${error instanceof Error ? error.message : error}`);
      observations.push({
        missionId: mission.id, path: mission.worktree, status: 'unsafe-path', branch: null,
        expectedBranch: mission.branch, head: null, expectedHead: plan.repository.baseRevision, clean: null,
      });
      continue;
    }
    const pathInfo = await lstat(mission.worktree).catch((error) => {
      if (error?.code === 'ENOENT') return undefined;
      throw error;
    });
    if (!pathInfo) {
      observations.push({
        missionId: mission.id, path: expectedPath, status: 'not-created', branch: null,
        expectedBranch: mission.branch, head: null, expectedHead: plan.repository.baseRevision, clean: null,
      });
      if (requireCreated) errors.push(`${mission.id} worktree is not created: ${expectedPath}`);
      continue;
    }

    const canonicalPath = await canonicalExistingPath(mission.worktree).catch(() => undefined);
    const repository = canonicalPath ? inspectGit(canonicalPath) : null;
    const repositoryRoot = repository ? await canonicalExistingPath(repository.root).catch(() => undefined) : undefined;
    if (!repository || !canonicalPath || repositoryRoot !== canonicalPath || canonicalPath !== expectedPath) {
      observations.push({
        missionId: mission.id, path: canonicalPath ?? mission.worktree, status: 'collision-not-worktree', branch: null,
        expectedBranch: mission.branch, head: null, expectedHead: plan.repository.baseRevision, clean: null,
      });
      errors.push(`${mission.id} path identity drift: expected Git worktree root ${expectedPath}; observed ${canonicalPath ?? mission.worktree}.`);
      continue;
    }

    const branchMatches = repository.branch === mission.branch;
    const headMatches = repository.head === plan.repository.baseRevision;
    const ancestryMatches = isAncestor(canonicalPath, plan.repository.baseRevision, repository.head);
    let status = repository.clean ? 'created-clean' : 'created-dirty';
    if (!branchMatches) status = 'wrong-branch';
    else if (!ancestryMatches) status = 'wrong-ancestry';
    else if (!headMatches) status = 'stale-head';
    observations.push({
      missionId: mission.id,
      path: canonicalPath,
      status,
      branch: repository.branch,
      expectedBranch: mission.branch,
      head: repository.head,
      expectedHead: plan.repository.baseRevision,
      clean: repository.clean,
    });
    if (!branchMatches) errors.push(`${mission.id} branch drift: observed ${repository.branch}; expected ${mission.branch}.`);
    if (!ancestryMatches) errors.push(`${mission.id} ancestry drift: ${plan.repository.baseRevision} is not an ancestor of ${repository.head}.`);
    else if (!headMatches) errors.push(`${mission.id} phase HEAD drift: observed ${repository.head}; expected exact base ${plan.repository.baseRevision}.`);
    if (!repository.clean) errors.push(`${mission.id} worktree drift: worktree is dirty.`);
  }

  return {
    schemaVersion: 1,
    reportType: 'flight-construction-check',
    authority: 'none',
    tool: { name: 'construction-check', version: TOOL_VERSION },
    flightId: plan.flightId,
    plan: { path: snapshot.path, bytes: snapshot.size, sha256: snapshot.sha256 },
    requireCreated,
    ok: errors.length === 0,
    errors,
    repository: repositoryCheck.repository,
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
  if (!options.planPath) throw new Error('Usage: shield-ops construction check --plan FILE [--require-created] [--output NEW_FILE]');
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
