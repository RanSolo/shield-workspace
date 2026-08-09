import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { checkIntegration, validateIntegrationReport } from '../scripts/operations/integration-check.mjs';
import { planTeardown, validateTeardownReport } from '../scripts/operations/teardown-plan.mjs';
import { compileHandoff } from '../scripts/operations/handoff-compile.mjs';
import { createConvergenceFixture, createHandoffInputs } from './operations-handoff-compile.test.mjs';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

const completedFlight = async () => {
  const fixture = await createConvergenceFixture({ twoDependencies: true });
  const aInputs = await createHandoffInputs(fixture, 'mission:a', 'integration-a');
  const bInputs = await createHandoffInputs(fixture, 'mission:b', 'integration-b');
  const a = await compileHandoff(aInputs.options);
  const b = await compileHandoff(bInputs.options);
  return { fixture, aInputs, bInputs, aPath: a.jsonPath, bPath: b.jsonPath };
};

test('integration re-resolves every exact dependency packet and emits a closed non-merge report', async () => {
  const flight = await completedFlight();
  const report = await checkIntegration({
    planPath: flight.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [flight.aPath, flight.bPath],
  });
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.authority, 'none');
  assert.match(report.notice, /grants no merge authority/u);
  assert.deepEqual(validateIntegrationReport(report), []);
  assert.deepEqual(report.dependencyEvidence.map((item) => item.changedPaths), [['a/result.txt'], ['b/result.txt']]);
});

test('integration rejects missing, unexpected, fabricated, stale, and substituted packets', async () => {
  const flight = await completedFlight();
  const missing = await checkIntegration({
    planPath: flight.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [flight.aPath],
  });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join('\n'), /Missing exact packet for dependency mission:b/u);

  const original = JSON.parse(await readFile(flight.aPath, 'utf8'));
  const fabricatedPath = join(flight.fixture.root, 'fabricated-packet.json');
  await writeJson(fabricatedPath, {
    ...original,
    repository: { ...original.repository, changedPaths: ['a/fabricated.txt'] },
  });
  const fabricated = await checkIntegration({
    planPath: flight.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [fabricatedPath, flight.bPath],
  });
  assert.equal(fabricated.ok, false);
  assert.match(fabricated.errors.join('\n'), /changed paths do not exactly match/u);

  const substitutedPath = join(flight.fixture.root, 'substituted-packet.json');
  await writeJson(substitutedPath, {
    ...original,
    flight: { ...original.flight, id: 'flight:forged' },
    repository: { ...original.repository, branch: 'spike/substituted' },
  });
  const substituted = await checkIntegration({
    planPath: flight.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [substitutedPath, flight.bPath],
  });
  assert.equal(substituted.ok, false);
  assert.match(substituted.errors.join('\n'), /substituted|repository identity/u);

  git(flight.fixture.worktreeA, ['commit', '--allow-empty', '-m', 'move dependency ref']);
  const stale = await checkIntegration({
    planPath: flight.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [flight.aPath, flight.bPath],
  });
  assert.equal(stale.ok, false);
  assert.match(stale.errors.join('\n'), /packet is stale|no longer resolves/u);

  const unexpectedPath = join(flight.fixture.root, 'unexpected-packet.json');
  await writeJson(unexpectedPath, {
    ...original,
    mission: { ...original.mission, id: 'mission:unexpected' },
  });
  const unexpected = await checkIntegration({
    planPath: flight.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [flight.aPath, flight.bPath, unexpectedPath],
  });
  assert.equal(unexpected.ok, false);
  assert.match(unexpected.errors.join('\n'), /Unexpected packet for non-dependency/u);
});

test('teardown inventories tracked, untracked, and ignored files and preserves unrecorded artifacts', async () => {
  const fixture = await createConvergenceFixture();
  await writeFile(join(fixture.worktreeA, 'untracked.txt'), 'untracked\n');
  await writeFile(join(fixture.worktreeA, '.git', 'info-placeholder'), '').catch(() => {});
  const excludePath = git(fixture.worktreeA, ['rev-parse', '--git-path', 'info/exclude']);
  await writeFile(excludePath, 'ignored.bin\n', { flag: 'a' });
  await writeFile(join(fixture.worktreeA, 'ignored.bin'), 'ignored\n');

  const report = await planTeardown({ planPath: fixture.planPath, integrationRef: 'main' });
  assert.deepEqual(validateTeardownReport(report), []);
  const worktree = report.worktrees[0];
  assert.equal(worktree.disposition, 'preserve-unrecorded-artifacts');
  assert.equal(worktree.recoverable, false);
  assert.ok(worktree.inventory.some((item) => item.category === 'tracked'));
  assert.ok(worktree.inventory.some((item) => item.category === 'untracked' && item.path === 'untracked.txt'));
  assert.ok(worktree.inventory.some((item) => item.category === 'ignored' && item.path === 'ignored.bin'));
  assert.match(report.notice, /No worktree.*removed/u);
});

test('teardown rejects ambiguous archive recoverability without changing the worktree', async () => {
  const fixture = await createConvergenceFixture();
  await writeFile(join(fixture.worktreeA, 'artifact.bin'), 'artifact\n');
  const observedHead = git(fixture.worktreeA, ['rev-parse', 'HEAD']);
  const archivePath = join(fixture.root, 'archive.json');
  await writeJson(archivePath, {
    schemaVersion: 1,
    archiveType: 'feature-flight-recovery-archive',
    authority: 'none',
    flightId: fixture.plan.flightId,
    missionId: 'mission:a',
    repository: {
      root: fixture.repository,
      worktree: fixture.worktreeA,
      branch: 'spike/a',
      head: observedHead,
    },
    files: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    tool: { name: 'external-archive', version: '1.0.0' },
  });
  const report = await planTeardown({
    planPath: fixture.planPath,
    integrationRef: 'main',
    archiveEvidencePaths: [archivePath],
  });
  assert.equal(report.worktrees[0].disposition, 'preserve-ambiguous-recoverability');
  assert.equal(report.worktrees[0].archiveEvidence.matched, false);
  assert.equal(await readFile(join(fixture.worktreeA, 'artifact.bin'), 'utf8'), 'artifact\n');
});
