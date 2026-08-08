import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runEvidence } from '../scripts/operations/evidence-run.mjs';

const git = (path, args) =>
  execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();

const makeRepository = async () => {
  const path = await mkdtemp(join(tmpdir(), 'evidence-run-'));
  git(path, ['init', '-b', 'main']);
  git(path, ['config', 'user.name', 'Evidence Test']);
  git(path, ['config', 'user.email', 'evidence@example.invalid']);
  await writeFile(join(path, 'README.md'), 'fixture\n');
  git(path, ['add', 'README.md']);
  git(path, ['commit', '-m', 'fixture']);
  return path;
};

test('records exact command evidence and hashes declared artifacts', async () => {
  const repository = await makeRepository();
  const output = join(repository, '.receipts', 'pass.json');
  const command = [
    process.execPath,
    '-e',
    "require('fs').writeFileSync('artifact.txt', 'evidence'); console.log('token=super-secret')",
  ];
  const { receipt, exitCode } = await runEvidence({
    output,
    cwd: repository,
    missionId: 'mission:test',
    artifacts: ['artifact.txt'],
    command,
  });

  assert.equal(exitCode, 0);
  assert.equal(receipt.git.before.head, git(repository, ['rev-parse', 'HEAD']));
  assert.equal(receipt.artifacts.length, 1);
  assert.match(receipt.output.stdout, /token=\[REDACTED\]/u);
  assert.doesNotMatch(await readFile(output, 'utf8'), /super-secret/u);
});

test('records a failing command without claiming success', async () => {
  const repository = await makeRepository();
  const output = join(repository, '.receipts', 'failure.json');
  const { receipt, exitCode } = await runEvidence({
    output,
    cwd: repository,
    artifacts: [],
    command: [process.execPath, '-e', 'process.exit(7)'],
  });

  assert.equal(exitCode, 7);
  assert.equal(receipt.result.exitCode, 7);
});

test('fails the wrapper when a declared artifact is missing', async () => {
  const repository = await makeRepository();
  const output = join(repository, '.receipts', 'missing.json');
  const { receipt, exitCode } = await runEvidence({
    output,
    cwd: repository,
    artifacts: ['missing.pdf'],
    command: [process.execPath, '-e', 'process.exit(0)'],
  });

  assert.equal(exitCode, 2);
  assert.equal(receipt.result.artifactErrors.length, 1);
});
