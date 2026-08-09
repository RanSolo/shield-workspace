import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { TextDecoder } from 'node:util';

import {
  canonicalExistingPath,
  canonicalNewPath,
  isPathContained,
  normalizeSystemPathAlias,
} from './common.mjs';
import { canonicalRelativePath } from './flight-common.mjs';

export const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'));

export const parseNullDelimitedGitPaths = (bytes, label = 'Git path output') => {
  if (!(bytes instanceof Uint8Array)) throw new Error(`${label} is not a raw byte snapshot.`);
  if (bytes.length === 0) return [];
  if (bytes.at(-1) !== 0) throw new Error(`${label} is truncated or not NUL-delimited.`);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8.`);
  }
  const paths = text.split('\0');
  paths.pop();
  if (paths.some((path) => path === '')) throw new Error(`${label} contains an empty path record.`);
  for (const path of paths) {
    if (canonicalRelativePath(path) !== path) throw new Error(`${label} contains a noncanonical path: ${JSON.stringify(path)}.`);
  }
  return paths;
};

export const readNullDelimitedGitPaths = (cwd, args, label = 'Git path output') => {
  const bytes = execFileSync('git', ['-C', cwd, ...args], {
    encoding: null,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseNullDelimitedGitPaths(bytes, label);
};

export const orderedChangedPaths = (worktree, baseRevision, head) =>
  readNullDelimitedGitPaths(
    worktree,
    ['diff', '--name-only', '-z', '--diff-filter=ACDMRTUXB', `${baseRevision}..${head}`],
    'Exact base..HEAD changed-path output',
  ).sort(compareUtf8);

const containsOrEquals = (root, candidate) =>
  candidate === root || isPathContained(root, candidate);

const WORKTREE_FIELD = /^(?:HEAD [a-f0-9]{40,64}|branch refs\/heads\/.+|bare|detached|locked(?: .+)?|prunable(?: .+)?)$/u;

export const parseWorktreeListPorcelain = (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.at(-1) !== 0) {
    throw new Error('Git worktree inventory is empty, truncated, or not NUL-delimited.');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('Git worktree inventory is not valid UTF-8.');
  }
  const fields = text.split('\0');
  fields.pop();
  const records = [];
  let record = [];
  for (const field of fields) {
    if (field !== '') {
      record.push(field);
      continue;
    }
    if (record.length === 0 || !record[0].startsWith('worktree ') || record[0].length === 'worktree '.length ||
        record.slice(1).some((item) => !WORKTREE_FIELD.test(item))) {
      throw new Error('Git worktree inventory contains a malformed record.');
    }
    records.push(record[0].slice('worktree '.length));
    record = [];
  }
  if (record.length !== 0 || records.length === 0) throw new Error('Git worktree inventory contains an unterminated or empty record set.');
  return records;
};

export const flightWorktreePaths = async (plan) => {
  const paths = new Set([
    normalizeSystemPathAlias(plan.repository.root),
    ...plan.missions.map((mission) => normalizeSystemPathAlias(mission.worktree)),
  ]);
  const worktreeList = execFileSync('git', ['-C', plan.repository.root, 'worktree', 'list', '--porcelain', '-z'], {
    encoding: null,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const path of parseWorktreeListPorcelain(worktreeList)) {
    const observedPath = normalizeSystemPathAlias(path);
    const canonicalPath = await canonicalExistingPath(observedPath).catch(() => undefined);
    if (canonicalPath === undefined || canonicalPath !== observedPath) {
      throw new Error(`Observed Git worktree path is unresolved or non-canonical: ${observedPath}`);
    }
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
