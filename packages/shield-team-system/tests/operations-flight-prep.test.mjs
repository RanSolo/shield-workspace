import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import { prepareFlight } from '../scripts/operations/flight-prep.mjs';

const git = (path, args) =>
  execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();

const makeRepository = async () => {
  const path = await mkdtemp(join(tmpdir(), 'flight-prep-repo-'));
  git(path, ['init', '-b', 'main']);
  git(path, ['config', 'user.name', 'Flight Prep Test']);
  git(path, ['config', 'user.email', 'flight-prep@example.invalid']);
  await writeFile(join(path, 'README.md'), 'fixture\n');
  git(path, ['add', 'README.md']);
  git(path, ['commit', '-m', 'fixture']);
  return path;
};

const makeManifest = (repositoryPath) => ({
  schemaVersion: 1,
  flightId: 'flight:test',
  objective: 'Test a flight plan.',
  repository: { path: repositoryPath, baseRef: 'main' },
  integration: { branch: 'feature/test' },
  lanes: [
    { id: 'alpha', chatLabel: 'Chat A', teamLabel: 'Team Alpha' },
    { id: 'bravo', chatLabel: 'Chat B', teamLabel: 'Team Bravo' },
  ],
  missions: [
    {
      id: 'mission:test:a',
      title: 'Mission A',
      library: 'a',
      lane: 'alpha',
      branch: 'spike/a',
      worktree: join(dirname(repositoryPath), `${basename(repositoryPath)}-worktree-a`),
      activationWave: 1,
      dependsOn: [],
      writablePaths: ['experiments/a/**'],
      scope: 'Test A.',
      deliverables: ['Evidence A'],
    },
    {
      id: 'mission:test:b',
      title: 'Mission B',
      library: 'b',
      lane: 'bravo',
      branch: 'spike/b',
      worktree: join(dirname(repositoryPath), `${basename(repositoryPath)}-worktree-b`),
      activationWave: 2,
      dependsOn: ['mission:test:a'],
      writablePaths: ['experiments/b/**'],
      scope: 'Test B.',
      deliverables: ['Evidence B'],
    },
  ],
  evaluationContract: { fixtureId: 'fixture', version: 1, scorecard: ['maintenance'] },
});

const writeManifest = async (directory, manifest) => {
  const path = join(directory, 'manifest.json');
  await writeFile(path, JSON.stringify(manifest, null, 2));
  return path;
};

test('validates and writes a non-authoritative package', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-output-'));
  const manifestPath = await writeManifest(directory, makeManifest(repositoryPath));
  const outputPath = join(directory, 'generated');

  const plan = await prepareFlight({ manifestPath, outputPath });
  assert.equal(plan.repository.baseRevision, git(repositoryPath, ['rev-parse', 'HEAD']));
  assert.equal(plan.missions[0].initialEligibility, 'eligible-after-independent-authorization');
  assert.equal(plan.missions[1].initialEligibility, 'blocked-by-dependencies');

  const receipt = JSON.parse(await readFile(join(outputPath, 'bootstrap-receipt.json'), 'utf8'));
  assert.equal(receipt.authority, 'none');
  assert.deepEqual(receipt.observations.initiallyBlockedMissions, ['mission:test:b']);
});

test('fails closed on a dependency cycle', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-cycle-'));
  const manifest = makeManifest(repositoryPath);
  manifest.missions[0].dependsOn = ['mission:test:b'];
  const manifestPath = await writeManifest(directory, manifest);

  await assert.rejects(prepareFlight({ manifestPath }), /Mission dependency cycle/u);
});

test('fails closed on writable path overlap', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-paths-'));
  const manifest = makeManifest(repositoryPath);
  manifest.missions[1].writablePaths = ['experiments/a/results/**'];
  const manifestPath = await writeManifest(directory, manifest);

  await assert.rejects(prepareFlight({ manifestPath }), /Writable path collision/u);
});

test('fails closed when a planned worktree already exists', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-collision-'));
  const manifest = makeManifest(repositoryPath);
  await mkdir(manifest.missions[0].worktree, { recursive: true });
  const manifestPath = await writeManifest(directory, manifest);

  await assert.rejects(prepareFlight({ manifestPath }), /worktree path already exists/u);
});
