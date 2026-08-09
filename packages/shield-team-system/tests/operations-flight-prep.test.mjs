import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, open, readdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';

import { prepareFlight } from '../scripts/operations/flight-prep.mjs';
import { writeNewFile } from '../scripts/operations/common.mjs';

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

test('persists only a credential-free remote identity', async () => {
  const repositoryPath = await makeRepository();
  const canarySecret = 'FLIGHT_REMOTE_CANARY_7ad182';
  git(repositoryPath, ['remote', 'add', 'origin', `https://flight-user:${canarySecret}@example.invalid/org/repo.git?access_token=${canarySecret}#${canarySecret}`]);
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-remote-'));
  const manifestPath = await writeManifest(directory, makeManifest(repositoryPath));
  const outputPath = join(directory, 'generated');

  const result = await prepareFlight({ manifestPath, outputPath });

  assert.equal(result.repository.remoteUrl, 'example.invalid/org/repo.git');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${canarySecret}|flight-user`, 'u'));
  for (const relativePath of await readdir(outputPath, { recursive: true })) {
    const path = join(outputPath, relativePath);
    if ((await lstat(path)).isFile()) {
      assert.doesNotMatch(await readFile(path, 'utf8'), new RegExp(`${canarySecret}|flight-user`, 'u'), relativePath);
    }
  }

  git(repositoryPath, ['remote', 'set-url', 'origin', 'git@example.invalid:org/repo.git']);
  const scpResult = await prepareFlight({ manifestPath });
  assert.equal(scpResult.repository.remoteUrl, 'example.invalid/org/repo.git');
});

test('fails closed without echoing malformed or unsupported credential-bearing remotes', async () => {
  const malformedRemotes = [
    'user:FLIGHT_REMOTE_MALFORMED_CANARY@host:org/repo.git',
    'https:user:FLIGHT_REMOTE_MALFORMED_CANARY@host/org/repo.git',
    'ftp://user:FLIGHT_REMOTE_MALFORMED_CANARY@host/org/repo.git',
  ];
  for (const [index, remoteUrl] of malformedRemotes.entries()) {
    const repositoryPath = await makeRepository();
    git(repositoryPath, ['remote', 'add', 'origin', remoteUrl]);
    const directory = await mkdtemp(join(tmpdir(), `flight-prep-malformed-remote-${index}-`));
    const manifestPath = await writeManifest(directory, makeManifest(repositoryPath));
    const outputPath = join(directory, 'generated');
    await assert.rejects(prepareFlight({ manifestPath, outputPath }), (error) => {
      assert.match(error.message, /cannot be safely|unsupported protocol/u);
      assert.doesNotMatch(error.message, /FLIGHT_REMOTE_MALFORMED_CANARY/u);
      return true;
    });
    assert.equal(await lstat(outputPath).catch(() => undefined), undefined);
    assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith('.generated.')), []);
  }
});

test('removes staging and publishes no final package when an artifact write fails', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-atomic-failure-'));
  const manifestPath = await writeManifest(directory, makeManifest(repositoryPath));
  const outputPath = join(directory, 'generated');
  let writes = 0;

  await assert.rejects(prepareFlight({
    manifestPath,
    outputPath,
    packageDependencies: {
      writeNewFile: async (path, bytes) => {
        writes += 1;
        if (writes === 3) throw new Error('injected artifact write failure');
        return writeNewFile(path, bytes);
      },
    },
  }), /injected artifact write failure/u);

  assert.equal(await lstat(outputPath).catch(() => undefined), undefined);
  assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith('.generated.')), []);
});

test('serializes cooperating concurrent publishers with an atomic sibling reservation', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-concurrent-'));
  const manifestPath = await writeManifest(directory, makeManifest(repositoryPath));
  const outputPath = join(directory, 'generated');
  let releaseFirstWrite;
  const firstWriteReleased = new Promise((resolve) => { releaseFirstWrite = resolve; });
  let signalFirstWrite;
  const firstWriteStarted = new Promise((resolve) => { signalFirstWrite = resolve; });
  let firstWrite = true;

  const firstPublisher = prepareFlight({
    manifestPath,
    outputPath,
    packageDependencies: {
      writeNewFile: async (path, bytes) => {
        if (firstWrite) {
          firstWrite = false;
          signalFirstWrite();
          await firstWriteReleased;
        }
        return writeNewFile(path, bytes);
      },
    },
  });
  await firstWriteStarted;
  await assert.rejects(prepareFlight({ manifestPath, outputPath }), /already reserved/u);
  releaseFirstWrite();
  await firstPublisher;

  assert.ok(await lstat(join(outputPath, 'bootstrap-receipt.json')));
  assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith('.generated.')), []);
});

test('acquisition failure does not delete a lock replacement raced after identity validation', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-lock-acquire-race-'));
  const manifestPath = await writeManifest(directory, makeManifest(repositoryPath));
  const outputPath = join(directory, 'generated');
  const lockPath = join(directory, '.generated.publish.lock');
  const displacedOwnedLock = `${lockPath}.owned-displaced`;
  let replaced = false;

  await assert.rejects(prepareFlight({
    manifestPath,
    outputPath,
    packageDependencies: {
      open: async (path, ...arguments_) => {
        const handle = await open(path, ...arguments_);
        if (path !== lockPath) return handle;
        return {
          stat: () => handle.stat(),
          sync: async () => { throw new Error('injected acquisition sync failure'); },
          close: () => handle.close(),
        };
      },
      lstat: async (path) => {
        if (path === lockPath && !replaced) {
          const ownedIdentity = await lstat(path);
          await rename(path, displacedOwnedLock);
          await writeFile(path, 'foreign replacement\n');
          replaced = true;
          return ownedIdentity;
        }
        return lstat(path);
      },
    },
  }), /injected acquisition sync failure/u);

  const quarantine = (await readdir(directory)).find((name) => name.startsWith('.generated.publish.lock.release-'));
  assert.ok(quarantine, 'the raced replacement must remain quarantined instead of being deleted');
  assert.equal(await readFile(join(directory, quarantine), 'utf8'), 'foreign replacement\n');
  assert.ok(await lstat(displacedOwnedLock));
  assert.equal(await lstat(outputPath).catch(() => undefined), undefined);
});

test('retains a raced destination and removes only its owned reservation and staging', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-raced-output-'));
  const manifestPath = await writeManifest(directory, makeManifest(repositoryPath));
  const outputPath = join(directory, 'generated');

  await assert.rejects(prepareFlight({
    manifestPath,
    outputPath,
    packageDependencies: {
      beforePublish: async ({ finalRoot }) => {
        assert.equal(finalRoot, outputPath);
        await mkdir(finalRoot);
        await writeFile(join(finalRoot, 'raced-writer-marker'), 'must survive\n');
      },
    },
  }), /Create-only atomic package publication/u);

  assert.ok((await lstat(outputPath)).isDirectory());
  assert.equal(await readFile(join(outputPath, 'raced-writer-marker'), 'utf8'), 'must survive\n');
  assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith('.generated.')), []);
});

test('rejects a successful no-clobber no-op when staging did not move', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-no-clobber-no-op-'));
  const manifestPath = await writeManifest(directory, makeManifest(repositoryPath));
  const outputPath = join(directory, 'generated');

  await assert.rejects(prepareFlight({
    manifestPath,
    outputPath,
    packageDependencies: {
      beforePublish: async ({ finalRoot }) => {
        await mkdir(finalRoot);
        await writeFile(join(finalRoot, 'existing'), 'foreign\n');
      },
      runNativeNoReplaceMove: () => undefined,
    },
  }), /returned an invalid filesystem state/u);

  assert.equal(await readFile(join(outputPath, 'existing'), 'utf8'), 'foreign\n');
  assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith('.generated.')), []);
});

test('reports a published complete package when post-rename parent sync fails', async () => {
  const repositoryPath = await makeRepository();
  const directory = await mkdtemp(join(tmpdir(), 'flight-prep-post-rename-sync-'));
  const manifestPath = await writeManifest(directory, makeManifest(repositoryPath));
  const outputPath = join(directory, 'generated');

  await assert.rejects(prepareFlight({
    manifestPath,
    outputPath,
    packageDependencies: {
      syncDirectory: async (path) => {
        if (path === directory) throw new Error('injected parent sync failure');
      },
    },
  }), /Complete flight package was published.*durability sync failed.*injected parent sync failure/u);

  assert.ok(await lstat(join(outputPath, 'bootstrap-receipt.json')));
  assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith('.generated.')), []);
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
