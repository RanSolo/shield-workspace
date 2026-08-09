import assert from 'node:assert/strict';
import { copyFileSync } from 'node:fs';
import { lstat, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildFixture } from '../scripts/operations/fixture-build.mjs';
import { hashFile } from '../scripts/operations/common.mjs';

const fakeGhostscript = (_command, args) => {
  if (args[0] === '--version') return '10.04.0\n';
  const output = args.find((argument) => argument.startsWith('-sOutputFile=')).slice('-sOutputFile='.length);
  copyFileSync(args.at(-1), output);
  return Buffer.alloc(0);
};

test('builds and atomically publishes a closed synthetic PDF fixture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nxt449-fixture-'));
  const output = join(root, 'fixture');
  const result = await buildFixture({ outputDirectory: output, runGhostscript: fakeGhostscript });
  assert.equal(result.manifest.manifestType, 'synthetic-pdf-fixture');
  assert.equal(result.manifest.classification, 'synthetic-test-data');
  assert.equal(result.manifest.containsCustomerData, false);
  assert.equal(result.manifest.files.length, 9);
  assert.equal((await lstat(output)).mode & 0o777, 0o700);
  for (const entry of result.manifest.files) {
    const actual = await hashFile(join(output, entry.path));
    assert.equal(actual.sha256, entry.sha256);
    assert.equal(actual.bytes, entry.bytes);
  }
  const receipt = JSON.parse(await readFile(join(output, 'build-receipt.json'), 'utf8'));
  assert.equal(receipt.authority, 'none');
  assert.equal(receipt.ghostscriptVersion, '10.04.0');
  assert.match((await readFile(join(output, 'source-template.pdf'))).subarray(0, 8).toString(), /^%PDF-1\.7/u);
  await assert.rejects(() => buildFixture({ outputDirectory: output, runGhostscript: fakeGhostscript }), /Refusing existing fixture directory/u);
});

test('missing Ghostscript fails before creating output or staging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nxt449-fixture-no-gs-'));
  const output = join(root, 'fixture');
  await assert.rejects(
    buildFixture({ outputDirectory: output, runGhostscript: () => { throw new Error('ENOENT'); } }),
    /Ghostscript preflight failed before output creation/u,
  );
  assert.equal(await lstat(output).catch(() => undefined), undefined);
  assert.deepEqual(await readdir(root), []);
});

test('failing Ghostscript conversion leaves no published or staged partial output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nxt449-fixture-bad-gs-'));
  const output = join(root, 'fixture');
  let calls = 0;
  await assert.rejects(buildFixture({
    outputDirectory: output,
    runGhostscript: () => {
      calls += 1;
      if (calls === 1) return '10.04.0\n';
      throw new Error('conversion failed');
    },
  }), /conversion failed/u);
  assert.equal(await lstat(output).catch(() => undefined), undefined);
  assert.deepEqual(await readdir(root), []);
});
