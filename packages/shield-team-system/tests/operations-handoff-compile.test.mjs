import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { compileHandoff } from '../scripts/operations/handoff-compile.mjs';

const runGit = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'shield-handoff-'));
  const repo = join(root, 'repo');
  await mkdir(join(repo, 'allowed'), { recursive: true });
  runGit(root, ['init', repo]);
  runGit(repo, ['config', 'user.email', 'prototype@example.invalid']);
  runGit(repo, ['config', 'user.name', 'Prototype']);
  await writeFile(join(repo, 'README.md'), 'base\n');
  runGit(repo, ['add', '.']);
  runGit(repo, ['commit', '-m', 'base']);
  const base = runGit(repo, ['rev-parse', 'HEAD']);
  runGit(repo, ['checkout', '-b', 'spike/test']);
  await writeFile(join(repo, 'allowed', 'result.txt'), 'evidence\n');
  runGit(repo, ['add', '.']);
  runGit(repo, ['commit', '-m', 'result']);
  const head = runGit(repo, ['rev-parse', 'HEAD']);

  const missionId = 'mission:test';
  const planPath = join(root, 'plan.json');
  const acceptancePath = join(root, 'acceptance.json');
  const statePath = join(root, 'state.json');
  const receiptPath = join(root, 'receipt.json');
  await writeJson(planPath, {
    schemaVersion: 1,
    flightId: 'flight:test',
    repository: { baseRevision: base },
    missions: [{
      id: missionId,
      title: 'Test mission',
      branch: 'spike/test',
      writablePaths: ['allowed/**'],
      deliverables: ['Evidence'],
    }],
  });
  await writeJson(acceptancePath, {
    schemaVersion: 1,
    reportType: 'acceptance-traceability',
    missionId,
    phase: 'green',
    ok: true,
    expectedRevision: head,
  });
  await writeJson(statePath, {
    schemaVersion: 1,
    missionId,
    currentGate: 'implementation-complete',
    decisions: [],
    processExperiments: [],
    toolsCreated: [],
    risks: [],
    blockers: [],
    recommendedNextAction: 'Begin exact-head review.',
  });
  await writeJson(receiptPath, {
    schemaVersion: 1,
    receiptType: 'local-command-evidence',
    receiptId: 'evidence:test',
    missionId,
    result: { exitCode: 0 },
    git: { after: { head, dirty: false } },
  });
  return { root, repo, base, head, missionId, planPath, acceptancePath, statePath, receiptPath };
};

const optionsFor = (f, suffix = 'output') => ({
  flightPlan: f.planPath,
  missionId: f.missionId,
  worktree: f.repo,
  acceptanceReport: f.acceptancePath,
  state: f.statePath,
  receipts: [f.receiptPath],
  outputDir: join(f.root, suffix),
  mode: 'checkout',
});

test('compiles an exact clean scoped checkout packet', async () => {
  const f = await fixture();
  const result = await compileHandoff(optionsFor(f));
  assert.equal(result.packet.repository.head, f.head);
  assert.deepEqual(result.packet.repository.changedPaths, ['allowed/result.txt']);
  assert.equal(result.packet.authority, 'none');
  assert.match(await readFile(result.markdownPath, 'utf8'), /grants no human approval/u);
});

test('rejects a dirty worktree', async () => {
  const f = await fixture();
  await writeFile(join(f.repo, 'allowed', 'result.txt'), 'dirty\n');
  await assert.rejects(() => compileHandoff(optionsFor(f)), /Worktree must be clean/u);
});

test('rejects a branch mismatch', async () => {
  const f = await fixture();
  runGit(f.repo, ['branch', '-m', 'spike/wrong']);
  await assert.rejects(() => compileHandoff(optionsFor(f)), /mission requires spike\/test/u);
});

test('rejects changes outside writable paths', async () => {
  const f = await fixture();
  await writeFile(join(f.repo, 'outside.txt'), 'outside\n');
  runGit(f.repo, ['add', '.']);
  runGit(f.repo, ['commit', '-m', 'outside']);
  const nextHead = runGit(f.repo, ['rev-parse', 'HEAD']);
  const acceptance = JSON.parse(await readFile(f.acceptancePath, 'utf8'));
  acceptance.expectedRevision = nextHead;
  await writeJson(f.acceptancePath, acceptance);
  const receipt = JSON.parse(await readFile(f.receiptPath, 'utf8'));
  receipt.git.after.head = nextHead;
  await writeJson(f.receiptPath, receipt);
  await assert.rejects(() => compileHandoff(optionsFor(f)), /outside mission scope: outside.txt/u);
});

test('rejects stale evidence', async () => {
  const f = await fixture();
  const receipt = JSON.parse(await readFile(f.receiptPath, 'utf8'));
  receipt.git.after.head = f.base;
  await writeJson(f.receiptPath, receipt);
  await assert.rejects(() => compileHandoff(optionsFor(f)), /revision is .* expected/u);
});

test('compiles a non-completion resume packet without GREEN evidence', async () => {
  const f = await fixture();
  await writeJson(f.acceptancePath, {
    schemaVersion: 1,
    reportType: 'acceptance-traceability',
    missionId: f.missionId,
    phase: 'structure',
    ok: true,
    expectedRevision: null,
  });
  const options = optionsFor(f, 'resume');
  options.mode = 'resume';
  options.receipts = [];
  const result = await compileHandoff(options);
  assert.equal(result.packet.mode, 'resume');
  assert.equal(result.packet.repository.head, f.head);
  assert.equal(result.packet.acceptance.phase, 'structure');
});
