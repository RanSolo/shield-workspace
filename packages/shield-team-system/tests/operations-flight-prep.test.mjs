import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';

import { prepareFlight } from '../scripts/operations/flight-prep.mjs';

const git = (path, args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();

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
  repository: { path: repositoryPath, baseRef: 'main', baseRevision: git(repositoryPath, ['rev-parse', 'HEAD']) },
  integration: { branch: 'feature/test' },
  lanes: [
    { id: 'alpha', chatLabel: 'Chat A', teamLabel: 'Team Alpha' },
    { id: 'bravo', chatLabel: 'Chat B', teamLabel: 'Team Bravo' },
  ],
  missions: [
    {
      id: 'mission:test:a', slug: 'mission-test-a', title: 'Mission A', library: 'a', lane: 'alpha', branch: 'spike/a',
      worktree: join(dirname(repositoryPath), `${basename(repositoryPath)}-worktree-a`), activationWave: 1,
      dependsOn: [], writablePaths: ['experiments/a/**'], scope: 'Test A.', deliverables: ['Evidence A'],
    },
    {
      id: 'mission:test:b', slug: 'mission-test-b', title: 'Mission B', library: 'b', lane: 'bravo', branch: 'spike/b',
      worktree: join(dirname(repositoryPath), `${basename(repositoryPath)}-worktree-b`), activationWave: 2,
      dependsOn: ['mission:test:a'], writablePaths: ['experiments/b/**'], scope: 'Test B.', deliverables: ['Evidence B'],
    },
  ],
  evaluationContract: { fixtureId: 'fixture', version: 1, scorecard: ['maintenance'] },
});

const writeManifest = async (directory, manifest) => {
  const path = join(directory, 'manifest.json');
  await writeFile(path, JSON.stringify(manifest, null, 2));
  return path;
};

test('validates and writes a confined non-authoritative package', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-output-'));
  const manifestPath = await writeManifest(directory, makeManifest(repositoryPath));
  const outputPath = join(directory, 'generated');
  const result = await prepareFlight({ manifestPath, outputPath });
  assert.equal(result.repository.baseRevision, git(repositoryPath, ['rev-parse', 'HEAD']));
  assert.equal(result.missions[0].initialEligibility, 'eligible-after-independent-authorization');
  assert.equal(result.missions[1].initialEligibility, 'blocked-by-dependencies');
  const receipt = JSON.parse(await readFile(join(outputPath, 'bootstrap-receipt.json'), 'utf8'));
  assert.equal(receipt.authority, 'none');
  assert.equal(receipt.generatedFiles.length, 7);
  assert.deepEqual(receipt.observations.initiallyBlockedMissions, ['mission:test:b']);
});

test('rejects dependency cycles and canonical ownership aliases', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-validation-'));
  const cycle = makeManifest(repositoryPath);
  cycle.missions[0].dependsOn = ['mission:test:b'];
  await assert.rejects(prepareFlight({ manifestPath: await writeManifest(directory, cycle) }), /Mission dependency cycle/u);

  for (const alias of ['/absolute', '', '.', '..', 'experiments\\a', 'experiments//a', 'experiments/a/../b', './experiments/a']) {
    const aliasDirectory = await mkdtemp(join(tmpdir(), 'flight-prep-alias-'));
    const manifest = makeManifest(repositoryPath);
    manifest.missions[0].writablePaths = [alias];
    await assert.rejects(prepareFlight({ manifestPath: await writeManifest(aliasDirectory, manifest) }), /non-canonical writable path/u);
  }
});

test('rejects ownership overlap, unsafe slugs, and derived slug collisions', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-slug-'));
  const overlap = makeManifest(repositoryPath);
  overlap.missions[1].writablePaths = ['experiments/a/results/**'];
  await assert.rejects(prepareFlight({ manifestPath: await writeManifest(directory, overlap) }), /Writable path collision/u);

  const unsafeDirectory = await mkdtemp(join(tmpdir(), 'flight-prep-unsafe-slug-'));
  const unsafe = makeManifest(repositoryPath);
  unsafe.missions[0].slug = '../escape';
  await assert.rejects(prepareFlight({ manifestPath: await writeManifest(unsafeDirectory, unsafe) }), /strict lowercase safe slug/u);

  const collisionDirectory = await mkdtemp(join(tmpdir(), 'flight-prep-slug-collision-'));
  const collision = makeManifest(repositoryPath);
  collision.missions[1].id = 'mission-test-a';
  collision.missions[1].slug = 'mission-test-a';
  collision.missions[1].dependsOn = [];
  await assert.rejects(prepareFlight({ manifestPath: await writeManifest(collisionDirectory, collision) }), /Mission slug collision/u);
});

test('rejects invalid or role-equal refs and stale exact bases', async () => {
  const repositoryPath = await makeRepository();
  const invalidDirectory = await mkdtemp(join(tmpdir(), 'flight-prep-ref-'));
  const invalid = makeManifest(repositoryPath);
  invalid.missions[0].branch = 'bad ref';
  await assert.rejects(prepareFlight({ manifestPath: await writeManifest(invalidDirectory, invalid) }), /valid Git branch ref/u);

  const equalDirectory = await mkdtemp(join(tmpdir(), 'flight-prep-equal-ref-'));
  const equal = makeManifest(repositoryPath);
  equal.missions[0].branch = equal.integration.branch;
  await assert.rejects(prepareFlight({ manifestPath: await writeManifest(equalDirectory, equal) }), /role-distinct/u);

  const staleDirectory = await mkdtemp(join(tmpdir(), 'flight-prep-stale-'));
  const stale = makeManifest(repositoryPath);
  await writeFile(join(repositoryPath, 'later.txt'), 'later\n');
  git(repositoryPath, ['add', 'later.txt']);
  git(repositoryPath, ['commit', '-m', 'later']);
  await assert.rejects(prepareFlight({ manifestPath: await writeManifest(staleDirectory, stale) }), /Base ref drift/u);
});

test('rejects existing and symlinked controlled worktree targets', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-collision-'));
  const manifest = makeManifest(repositoryPath);
  await mkdir(manifest.missions[0].worktree);
  await assert.rejects(prepareFlight({ manifestPath: await writeManifest(directory, manifest) }), /worktree path already exists/u);

  const linkedRepositoryPath = await makeRepository();
  const linkedDirectory = await mkdtemp(join(tmpdir(), 'flight-prep-linked-'));
  const linked = makeManifest(linkedRepositoryPath);
  const target = await mkdtemp(join(tmpdir(), 'flight-prep-link-target-'));
  await symlink(target, linked.missions[0].worktree);
  await assert.rejects(prepareFlight({ manifestPath: await writeManifest(linkedDirectory, linked) }), /symlink component/u);
});

test('treats macOS /var and /private/var worktree aliases as one identity', { skip: process.platform !== 'darwin' }, async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-macos-alias-'));
  const manifest = makeManifest(repositoryPath);
  const first = manifest.missions[0].worktree;
  manifest.missions[1].worktree = first.startsWith('/private/var/') ? first.replace(/^\/private\/var/u, '/var') : first.replace(/^\/var/u, '/private/var');
  await assert.rejects(prepareFlight({ manifestPath: await writeManifest(directory, manifest) }), /Canonical worktree collision/u);
});
