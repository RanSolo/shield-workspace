import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkAcceptance } from '../scripts/operations/acceptance-check.mjs';
import { sha256 } from '../scripts/operations/common.mjs';
import { runEvidence } from '../scripts/operations/evidence-run.mjs';

const git = (path, args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
const writeJson = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

const makeFixture = async () => {
  const repository = await realpath(await mkdtemp(join(tmpdir(), 'acceptance-check-')));
  git(repository, ['init', '-b', 'main']);
  git(repository, ['config', 'user.name', 'Acceptance Test']);
  git(repository, ['config', 'user.email', 'acceptance@example.invalid']);
  await writeFile(join(repository, 'README.md'), 'fixture\n');
  await writeFile(join(repository, '.gitignore'), '.receipts/\nspec.json\nmanifest.json\n');
  git(repository, ['add', 'README.md', '.gitignore']);
  git(repository, ['commit', '-m', 'fixture']);
  await mkdir(join(repository, '.receipts'));
  const revision = git(repository, ['rev-parse', 'HEAD']);
  const spec = {
    schemaVersion: 1,
    specType: 'mission-acceptance-spec',
    missionId: 'mission:test',
    source: { key: 'TEST-1', sha256: 'b'.repeat(64), criteriaCount: 2 },
    repository: { root: repository, branch: 'main' },
    commands: [
      { id: 'red-test', executable: process.execPath, argv: ['-e', 'process.exit(3)'], timeoutMs: 5_000, artifacts: [] },
      { id: 'green-test', executable: process.execPath, argv: ['-e', 'process.exit(0)'], timeoutMs: 5_000, artifacts: [] },
    ],
    criteria: [
      {
        id: 'AC-1',
        sourceText: 'The generated document opens.',
        validation: { mode: 'automated', testPaths: ['test/document.test.ts'], commandIds: ['red-test', 'green-test'], negativeCaseRequired: true, negativeTestPaths: ['test/document.test.ts'] },
      },
      {
        id: 'AC-2',
        sourceText: 'Product can visually edit the template.',
        validation: { mode: 'manual', procedure: ['Open the Designer.', 'Move a field.', 'Preview the PDF.'], expectedResult: 'The preview reflects the visual edit.' },
      },
    ],
  };
  const specPath = join(repository, 'spec.json');
  await writeJson(specPath, spec);
  const specBytes = await readFile(specPath);
  return { repository, revision, spec, specPath, specSha256: sha256(specBytes), manifestPath: join(repository, 'manifest.json') };
};

const baseManifest = (fixture, phase, expectedRevision = null) => ({
  schemaVersion: 1,
  manifestType: 'mission-evidence-manifest',
  missionId: fixture.spec.missionId,
  specSha256: fixture.specSha256,
  phase,
  expectedRevision,
  receipts: [],
  redNotApplicable: [],
  manualEvidence: [],
});

const runReceipt = async (fixture, commandId, name) => {
  const path = join(fixture.repository, '.receipts', `${name}.json`);
  const { receipt } = await runEvidence({ output: path, specPath: fixture.specPath, expectedSpecSha256: fixture.specSha256, commandId });
  const bytes = await readFile(path);
  return { path, relativePath: `.receipts/${name}.json`, receipt, sha256: sha256(bytes) };
};

const mapping = (fixture, receipt, phase, commandId) => ({
  criterionId: 'AC-1',
  phase,
  commandId,
  receiptId: receipt.receipt.receiptId,
  receiptSha256: receipt.sha256,
  path: receipt.relativePath,
  expectedRevision: fixture.revision,
});

const check = (fixture, phase, expectedRevision) => checkAcceptance({
  specPath: fixture.specPath,
  manifestPath: fixture.manifestPath,
  expectedSpecSha256: fixture.specSha256,
  phase,
  expectedRevision,
});

test('passes a complete closed structural spec and empty manifest', async () => {
  const fixture = await makeFixture();
  await writeJson(fixture.manifestPath, baseManifest(fixture, 'structure'));
  const report = await check(fixture, 'structure');
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.evidence.authority, 'none');
  assert.equal(report.evidence.provenance, false);
});

test('rejects unknown spec and manifest fields and a missing externally supplied spec digest', async () => {
  const fixture = await makeFixture();
  fixture.spec.unexpected = true;
  await writeJson(fixture.specPath, fixture.spec);
  const changedSha = sha256(await readFile(fixture.specPath));
  const manifest = baseManifest({ ...fixture, specSha256: changedSha }, 'structure');
  manifest.unexpected = true;
  await writeJson(fixture.manifestPath, manifest);
  const report = await checkAcceptance({ specPath: fixture.specPath, manifestPath: fixture.manifestPath, expectedSpecSha256: changedSha });
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /unknown field unexpected/u);
  await assert.rejects(checkAcceptance({ specPath: fixture.specPath, manifestPath: fixture.manifestPath }), /Expected spec SHA-256/u);
});

test('accepts exact RED evidence at its manifest-bound baseline revision', async () => {
  const fixture = await makeFixture();
  const red = await runReceipt(fixture, 'red-test', 'red');
  const manifest = baseManifest(fixture, 'red', fixture.revision);
  manifest.receipts.push(mapping(fixture, red, 'red', 'red-test'));
  await writeJson(fixture.manifestPath, manifest);
  const report = await check(fixture, 'red', fixture.revision);
  assert.equal(report.ok, true, report.errors.join('\n'));
});

test('accepts exact GREEN, prior RED, and manual evidence', async () => {
  const fixture = await makeFixture();
  const red = await runReceipt(fixture, 'red-test', 'red');
  const green = await runReceipt(fixture, 'green-test', 'green');
  const manifest = baseManifest(fixture, 'green', fixture.revision);
  manifest.receipts.push(mapping(fixture, red, 'red', 'red-test'), mapping(fixture, green, 'green', 'green-test'));
  manifest.manualEvidence.push({ criterionId: 'AC-2', performedBy: 'operator:test', performedAt: '2026-08-07T00:00:00.000Z', revision: fixture.revision, observation: 'The field moved and the preview updated.' });
  await writeJson(fixture.manifestPath, manifest);
  const report = await check(fixture, 'green', fixture.revision);
  assert.equal(report.ok, true, report.errors.join('\n'));
});

test('rejects a forged minimal receipt and receipt-byte digest replacement', async () => {
  const fixture = await makeFixture();
  const forgedPath = join(fixture.repository, '.receipts', 'forged.json');
  const forged = { schemaVersion: 1, receiptType: 'mission-command-evidence', receiptId: 'evidence:forged' };
  await writeJson(forgedPath, forged);
  const manifest = baseManifest(fixture, 'red', fixture.revision);
  manifest.receipts.push({ criterionId: 'AC-1', phase: 'red', commandId: 'red-test', receiptId: forged.receiptId, receiptSha256: sha256(await readFile(forgedPath)), path: '.receipts/forged.json', expectedRevision: fixture.revision });
  await writeJson(fixture.manifestPath, manifest);
  let report = await check(fixture, 'red', fixture.revision);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /receipt\.(?:evidence|specSha256|commandId).*required/u);

  manifest.receipts[0].receiptSha256 = 'c'.repeat(64);
  await writeJson(fixture.manifestPath, manifest);
  report = await check(fixture, 'red', fixture.revision);
  assert.match(report.errors.join('\n'), /digest does not match/u);
});

test('rejects missing or wrong command, root, branch, and tool bindings', async (t) => {
  const cases = [
    ['command', (receipt) => { receipt.commandId = 'wrong'; }],
    ['missing command', (receipt) => { delete receipt.command; }],
    ['root', (receipt) => { receipt.repository.root = '/wrong/root'; }],
    ['missing root', (receipt) => { delete receipt.repository.root; }],
    ['branch', (receipt) => { receipt.repository.branch = 'wrong-branch'; }],
    ['missing branch', (receipt) => { delete receipt.repository.branch; }],
    ['tool', (receipt) => { receipt.tool.sha256 = 'd'.repeat(64); }],
    ['missing tool', (receipt) => { delete receipt.tool; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const fixture = await makeFixture();
    const red = await runReceipt(fixture, 'red-test', 'red');
    mutate(red.receipt);
    await writeJson(red.path, red.receipt);
    red.sha256 = sha256(await readFile(red.path));
    const manifest = baseManifest(fixture, 'red', fixture.revision);
    manifest.receipts.push(mapping(fixture, red, 'red', 'red-test'));
    await writeJson(fixture.manifestPath, manifest);
    const report = await check(fixture, 'red', fixture.revision);
    assert.equal(report.ok, false);
    const missingField = name.slice(8);
    const expected = name === 'missing command' || name === 'missing tool'
      ? new RegExp(`receipt\\.${missingField} is required`, 'u')
      : name.startsWith('missing ')
        ? new RegExp(`receipt\\.repository\\.${missingField} is required`, 'u')
        : new RegExp(name, 'u');
    assert.match(report.errors.join('\n'), expected);
  });
});

test('rejects duplicate receipt ID, digest, and path reuse', async () => {
  const fixture = await makeFixture();
  const red = await runReceipt(fixture, 'red-test', 'red');
  const manifest = baseManifest(fixture, 'red', fixture.revision);
  const item = mapping(fixture, red, 'red', 'red-test');
  manifest.receipts.push(item, { ...item });
  await writeJson(fixture.manifestPath, manifest);
  const report = await check(fixture, 'red', fixture.revision);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /reuses receipt ID/u);
  assert.match(report.errors.join('\n'), /reuses receipt digest/u);
  assert.match(report.errors.join('\n'), /sets are not exactly equal/u);
});

test('snapshots spec bytes from one retained file handle despite path replacement', async () => {
  const fixture = await makeFixture();
  await writeJson(fixture.manifestPath, baseManifest(fixture, 'structure'));
  const originalSha = fixture.specSha256;
  let replaced = false;
  const injectedOpen = async (path, flags) => {
    const handle = await open(path, flags);
    if (!replaced && path === fixture.specPath) {
      replaced = true;
      await rename(fixture.specPath, `${fixture.specPath}.original`);
      await writeJson(fixture.specPath, { replaced: true });
    }
    return handle;
  };
  const report = await checkAcceptance({ specPath: fixture.specPath, manifestPath: fixture.manifestPath, expectedSpecSha256: originalSha }, { snapshotDependencies: { open: injectedOpen } });
  assert.equal(replaced, true);
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.specSha256, originalSha);
});
