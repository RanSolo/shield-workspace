import { Buffer } from 'node:buffer';

import {
  canonicalExistingPath,
  canonicalNewPath,
  git,
  isPathContained,
  normalizeSystemPathAlias,
} from './common.mjs';

export const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'));

const containsOrEquals = (root, candidate) =>
  candidate === root || isPathContained(root, candidate);

export const flightWorktreePaths = async (plan) => {
  const paths = new Set([
    normalizeSystemPathAlias(plan.repository.root),
    ...plan.missions.map((mission) => normalizeSystemPathAlias(mission.worktree)),
  ]);
  const worktreeList = git(plan.repository.root, ['worktree', 'list', '--porcelain']);
  for (const line of worktreeList.split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const observedPath = normalizeSystemPathAlias(line.slice('worktree '.length));
    const canonicalPath = await canonicalExistingPath(observedPath).catch(() => observedPath);
    paths.add(canonicalPath);
  }
  return [...paths].sort(compareUtf8);
};

export const assertOutputOutsideFlightWorktrees = async (plan, outputPath, label = 'Output') => {
  const candidate = await canonicalNewPath(outputPath);
  const worktrees = await flightWorktreePaths(plan);
  const containingWorktree = worktrees.find((worktree) => containsOrEquals(worktree, candidate));
  if (containingWorktree) {
    throw new Error(`${label} must be outside every observed or planned worktree; ${candidate} is contained in ${containingWorktree}.`);
  }
  return candidate;
};

export const inspectExternalArtifactPath = async (plan, artifactPath) => {
  const supplied = normalizeSystemPathAlias(artifactPath);
  const canonical = await canonicalExistingPath(artifactPath).catch(() => undefined);
  const missionWorktrees = plan.missions.map((mission) => normalizeSystemPathAlias(mission.worktree));
  const containingWorktree = canonical
    ? missionWorktrees.find((worktree) => containsOrEquals(worktree, canonical))
    : undefined;
  return {
    canonical,
    supplied,
    exactCanonical: canonical !== undefined && supplied === canonical,
    outsideRemovableWorktrees: canonical !== undefined && containingWorktree === undefined,
    containingWorktree: containingWorktree ?? null,
  };
};
