import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkAcceptance } from '../scripts/operations/acceptance-check.mjs';

const revision = 'a'.repeat(40);

const makeContract = () => ({
  schemaVersion: 1,
  missionId: 'mission:test',
  source: { key: 'TEST-1', sha256: 'b'.repeat(64), criteriaCount: 2 },
  criteria: [
    {
      id: 'AC-1',
      sourceText: 'The generated document opens.',
      validation: {
        mode: 'automated',
        testPaths: ['test/document.test.ts'],
        commands: ['npm test'],
        negativeCaseRequired: true,
        negativeTestPaths: ['test/document.test.ts'],
      },
      evidence: { redReceipts: [], greenReceipts: [] },
    },
    {
      id: 'AC-2',
      sourceText: 'Product can visually edit the template.',
      validation: {
        mode: 'manual',
        procedure: ['Open the Designer.', 'Move a field.', 'Preview the PDF.'],
        expectedResult: 'The preview reflects the visual edit.',
      },
      evidence: { manual: [] },
    },
  ],
});

const makeReceipt = ({ exitCode, head = revision }) => ({
  schemaVersion: 1,
  receiptType: 'local-command-evidence',
  missionId: 'mission:test',
  result: { exitCode },
  git: { after: { head, dirty: false } },
});

const writeJson = async (path, value) => writeFile(path, JSON.stringify(value, null, 2));

test('passes a complete structural contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'acceptance-structure-'));
  const contractPath = join(directory, 'contract.json');
  await writeJson(contractPath, makeContract());

  const report = await checkAcceptance({ contractPath });
  assert.equal(report.ok, true);
});

test('fails when source criteria disappear', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'acceptance-count-'));
  const contract = makeContract();
  contract.criteria.pop();
  const contractPath = join(directory, 'contract.json');
  await writeJson(contractPath, contract);

  const report = await checkAcceptance({ contractPath });
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /Source criterion count/u);
});

test('accepts failing RED evidence at its declared baseline revision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'acceptance-red-'));
  const contract = makeContract();
  contract.criteria[0].evidence.redReceipts = ['red.json'];
  contract.criteria[0].evidence.redRevision = revision;
  const contractPath = join(directory, 'contract.json');
  await writeJson(contractPath, contract);
  await writeJson(join(directory, 'red.json'), makeReceipt({ exitCode: 1 }));

  const report = await checkAcceptance({ contractPath, phase: 'red', expectedRevision: revision });
  assert.equal(report.ok, true);
});

test('accepts exact GREEN and manual evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'acceptance-green-'));
  const contract = makeContract();
  contract.criteria[0].redNotApplicableRationale = 'Existing behavior already passed at intake.';
  contract.criteria[0].evidence.greenReceipts = ['green.json'];
  contract.criteria[1].evidence.manual = [
    {
      performedBy: 'operator:test',
      performedAt: '2026-08-07T00:00:00.000Z',
      revision,
      observation: 'The field moved and the preview updated.',
    },
  ];
  const contractPath = join(directory, 'contract.json');
  await writeJson(contractPath, contract);
  await writeJson(join(directory, 'green.json'), makeReceipt({ exitCode: 0 }));

  const report = await checkAcceptance({ contractPath, phase: 'green', expectedRevision: revision });
  assert.equal(report.ok, true);
});

test('rejects stale GREEN evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'acceptance-stale-'));
  const contract = makeContract();
  contract.criteria[0].redNotApplicableRationale = 'Existing behavior already passed at intake.';
  contract.criteria[0].evidence.greenReceipts = ['green.json'];
  contract.criteria[1].evidence.manual = [
    {
      performedBy: 'operator:test',
      performedAt: '2026-08-07T00:00:00.000Z',
      revision,
      observation: 'Observed.',
    },
  ];
  const contractPath = join(directory, 'contract.json');
  await writeJson(contractPath, contract);
  await writeJson(join(directory, 'green.json'), makeReceipt({ exitCode: 0, head: 'c'.repeat(40) }));

  const report = await checkAcceptance({ contractPath, phase: 'green', expectedRevision: revision });
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /expected a{40}/u);
});
