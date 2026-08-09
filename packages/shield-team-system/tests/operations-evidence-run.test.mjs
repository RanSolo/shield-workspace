import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256, writeNewFile } from '../scripts/operations/common.mjs';
import { runEvidence } from '../scripts/operations/evidence-run.mjs';

const git = (path, args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
const makeOutput = async (name) => join(await realpath(await mkdtemp(join(tmpdir(), 'evidence-output-'))), name);

const makeRepository = async () => {
  const created = await mkdtemp(join(tmpdir(), 'evidence-run-'));
  const path = await realpath(created);
  git(path, ['init', '-b', 'main']);
  git(path, ['config', 'user.name', 'Evidence Test']);
  git(path, ['config', 'user.email', 'evidence@example.invalid']);
  await writeFile(join(path, 'README.md'), 'fixture\n');
  await writeFile(join(path, '.gitignore'), '.receipts/\nartifacts/\nspec.json\n');
  git(path, ['add', 'README.md', '.gitignore']);
  git(path, ['commit', '-m', 'fixture']);
  await mkdir(join(path, '.receipts'));
  await mkdir(join(path, 'artifacts'));
  return path;
};

const writeSpec = async (repository, commandOverrides = {}) => {
  const command = {
    id: 'test',
    executable: process.execPath,
    argv: ['-e', "require('fs').writeFileSync('artifacts/result.txt', 'evidence'); console.log('token=' + ['super', 'secret'].join('-')); console.log(process.env.TEST_SECRET ?? 'env-clean')"],
    timeoutMs: 5_000,
    artifacts: ['artifacts/result.txt'],
    ...commandOverrides,
  };
  const spec = {
    schemaVersion: 1,
    specType: 'mission-acceptance-spec',
    missionId: 'mission:test',
    source: { key: 'TEST-1', sha256: 'b'.repeat(64), criteriaCount: 1 },
    repository: { root: repository, branch: 'main' },
    commands: [command],
    criteria: [{
      id: 'AC-1',
      sourceText: 'The command is structurally evidenced.',
      validation: { mode: 'automated', testPaths: ['test/example.test.mjs'], commandIds: ['test'], negativeCaseRequired: false, negativeTestPaths: [] },
    }],
  };
  const path = join(repository, 'spec.json');
  const bytes = `${JSON.stringify(spec, null, 2)}\n`;
  await writeFile(path, bytes);
  return { path, spec, sha256: sha256(bytes) };
};

test('executes only the selected spec command and writes a closed, private receipt', async () => {
  const repository = await makeRepository();
  const spec = await writeSpec(repository);
  const output = await makeOutput('pass.json');
  const priorSecret = process.env.TEST_SECRET;
  process.env.TEST_SECRET = 'must-not-cross-boundary';
  try {
    const { receipt, exitCode } = await runEvidence({ output, specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'test' });
    assert.equal(exitCode, 0);
    assert.equal(receipt.command.executable, process.execPath);
    assert.deepEqual(receipt.command.argv, spec.spec.commands[0].argv);
    assert.equal(receipt.repository.beforeRoot, repository);
    assert.equal(receipt.repository.afterRoot, repository);
    assert.equal(receipt.repository.beforeBranch, 'main');
    assert.equal(receipt.repository.afterBranch, 'main');
    assert.equal(receipt.repository.beforeHead, git(repository, ['rev-parse', 'HEAD']));
    assert.equal(receipt.repository.afterHead, receipt.repository.beforeHead);
    assert.equal(receipt.repository.beforeClean, true);
    assert.equal(receipt.repository.afterClean, true);
    assert.equal(receipt.artifacts.length, 1);
    assert.equal(receipt.evidence.authority, 'none');
    assert.equal(receipt.evidence.provenance, false);
    assert.match(receipt.output.stdout.text, /token=\[REDACTED\]/u);
    assert.match(receipt.output.stdout.text, /env-clean/u);
    assert.doesNotMatch(await readFile(output, 'utf8'), /super-secret|must-not-cross-boundary/u);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
  } finally {
    if (priorSecret === undefined) delete process.env.TEST_SECRET;
    else process.env.TEST_SECRET = priorSecret;
  }
});

test('rejects a wrong spec digest and an undeclared command before execution', async () => {
  const repository = await makeRepository();
  const spec = await writeSpec(repository);
  await assert.rejects(
    runEvidence({ output: await makeOutput('wrong.json'), specPath: spec.path, expectedSpecSha256: 'c'.repeat(64), commandId: 'test' }),
    /spec digest/u,
  );
  await assert.rejects(
    runEvidence({ output: await makeOutput('unknown.json'), specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'not-declared' }),
    /not declared/u,
  );
});

test('truthfully records timeout and signal state with stdin disabled', async () => {
  const repository = await makeRepository();
  const spec = await writeSpec(repository, { argv: ['-e', 'setInterval(() => {}, 1000)'], timeoutMs: 30, artifacts: [] });
  const { receipt, exitCode } = await runEvidence({ output: await makeOutput('timeout.json'), specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'test' });
  assert.equal(exitCode, 2);
  assert.equal(receipt.result.status, 'timed-out');
  assert.equal(receipt.result.timedOut, true);
  assert.match(receipt.result.signal, /^SIG/u);
  assert.equal(receipt.result.exitCode, null);
});

test('fails closed when a declared artifact is missing', async () => {
  const repository = await makeRepository();
  const spec = await writeSpec(repository, { argv: ['-e', 'process.exit(0)'], artifacts: ['artifacts/missing.txt'] });
  const { receipt, exitCode } = await runEvidence({ output: await makeOutput('missing.json'), specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'test' });
  assert.equal(exitCode, 2);
  assert.equal(receipt.result.artifactErrors.length, 1);
  assert.equal(receipt.artifacts.length, 0);
});

test('rejects unignored receipt output inside the measured repository before execution', async () => {
  const repository = await makeRepository();
  const spec = await writeSpec(repository, { argv: ['-e', 'process.exit(0)'], artifacts: [] });
  const output = join(repository, 'receipt.json');
  let executed = false;
  await assert.rejects(
    runEvidence(
      { output, specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'test' },
      { execute: async () => { executed = true; throw new Error('must not execute'); } },
    ),
    /outside the measured repository/u,
  );
  assert.equal(executed, false);
  await assert.rejects(lstat(output), (error) => error?.code === 'ENOENT');
});

test('records and rejects same-HEAD branch switches and detached HEAD', async (t) => {
  const cases = [
    ['branch switch', "require('child_process').execFileSync('git', ['switch', '-c', 'alternate'])", 'alternate'],
    ['detached HEAD', "require('child_process').execFileSync('git', ['switch', '--detach'])", null],
  ];
  for (const [name, script, expectedAfterBranch] of cases) await t.test(name, async () => {
    const repository = await makeRepository();
    const spec = await writeSpec(repository, { argv: ['-e', script], artifacts: [] });
    const { receipt, exitCode } = await runEvidence({ output: await makeOutput(`${name.replaceAll(' ', '-')}.json`), specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'test' });
    assert.equal(exitCode, 2);
    assert.equal(receipt.repository.beforeRoot, repository);
    assert.equal(receipt.repository.afterRoot, repository);
    assert.equal(receipt.repository.beforeBranch, 'main');
    assert.equal(receipt.repository.afterBranch, expectedAfterBranch);
    assert.equal(receipt.repository.beforeHead, receipt.repository.afterHead);
    assert.equal(receipt.repository.beforeClean, true);
    assert.equal(receipt.repository.afterClean, true);
  });
});

test('create-only writer rejects symlink parents and targets', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'evidence-symlink-')));
  const realParent = join(root, 'real');
  const linkedParent = join(root, 'linked');
  await mkdir(realParent);
  await symlink(realParent, linkedParent);
  await assert.rejects(writeNewFile(join(linkedParent, 'receipt.json'), '{}\n'), /canonical non-symlink/u);
  const target = join(realParent, 'target.json');
  const foreign = join(realParent, 'foreign.json');
  await writeFile(foreign, 'foreign\n');
  await symlink(foreign, target);
  await assert.rejects(writeNewFile(target, '{}\n'), /overwrite/u);
  assert.equal((await lstat(target)).isSymbolicLink(), true);
  assert.equal(await readFile(foreign, 'utf8'), 'foreign\n');
});

test('create-only writer fsyncs file and parent and removes its inode on injected write failure', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'evidence-durable-')));
  const durable = join(root, 'durable.json');
  let syncCalls = 0;
  await writeNewFile(durable, '{}\n', { sync: async (handle) => { syncCalls += 1; await handle.sync(); } });
  assert.equal(syncCalls, 2);
  assert.equal((await stat(durable)).mode & 0o777, 0o600);

  const failed = join(root, 'failed.json');
  await assert.rejects(writeNewFile(failed, '{}\n', { write: async () => { throw new Error('injected write failure'); } }), /injected write failure/u);
  await assert.rejects(lstat(failed), (error) => error?.code === 'ENOENT');

  const unsynced = join(root, 'unsynced.json');
  await assert.rejects(writeNewFile(unsynced, '{}\n', { sync: async () => { throw new Error('injected fsync failure'); } }), /injected fsync failure/u);
  await assert.rejects(lstat(unsynced), (error) => error?.code === 'ENOENT');
});
