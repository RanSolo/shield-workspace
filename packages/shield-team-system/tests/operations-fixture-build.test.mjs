import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildFixture } from '../scripts/operations/fixture-build.mjs';
import { hashFile } from '../scripts/operations/common.mjs';

test('builds a closed synthetic PDF fixture with exact hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nxt449-fixture-'));
  const output = join(root, 'fixture');
  const result = await buildFixture({ outputDirectory: output });
  assert.equal(result.manifest.classification, 'synthetic-test-data');
  assert.equal(result.manifest.containsCustomerData, false);
  assert.equal(result.manifest.files.length, 9);
  for (const entry of result.manifest.files) {
    const actual = await hashFile(join(output, entry.path));
    assert.equal(actual.sha256, entry.sha256);
    assert.equal(actual.bytes, entry.bytes);
  }
  assert.match((await readFile(join(output, 'source-template.pdf'))).subarray(0, 8).toString(), /^%PDF-1\.7/u);
  await assert.rejects(() => buildFixture({ outputDirectory: output }), /Refusing existing fixture directory/u);
});
