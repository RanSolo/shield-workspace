import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import { credentialBearingArgument, redact, sha256, writeReservedOutput } from '../scripts/operations/common.mjs';
import { runEvidence } from '../scripts/operations/evidence-run.mjs';

const git = (path, args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
const reserveOutput = async (path) => {
  await writeFile(path, '', { flag: 'wx', mode: 0o600 });
  return path;
};
const makeOutput = async (name) => reserveOutput(join(await realpath(await mkdtemp(join(tmpdir(), 'evidence-output-'))), name));

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
    argv: ['-e', "require('fs').writeFileSync('artifacts/result.txt', 'evidence'); console.log('safe-output'); console.log(process.env.TEST_SECRET ?? 'env-clean')"],
    timeoutMs: 5_000,
    artifacts: ['artifacts/result.txt'],
    ...commandOverrides,
  };
  const spec = {
    schemaVersion: 2,
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
    assert.equal(receipt.evidence.producerAuthentication, false);
    assert.equal(receipt.evidence.effectContainment, 'uncertain');
    assert.equal(receipt.evidence.gateEligible, false);
    assert.match(receipt.output.stdout.text, /safe-output/u);
    assert.match(receipt.output.stdout.text, /env-clean/u);
    assert.doesNotMatch(await readFile(output, 'utf8'), /super-secret|must-not-cross-boundary/u);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
  } finally {
    if (priorSecret === undefined) delete process.env.TEST_SECRET;
    else process.env.TEST_SECRET = priorSecret;
  }
});

test('redacts complete credential values identically from stdout and stderr', async () => {
  const repository = await makeRepository();
  const spec = await writeSpec(repository, { argv: ['-e', 'process.exit(0)'], artifacts: [] });
  const output = await makeOutput('redacted.json');
  const adversarialOutput = [
    'Authorization: Bearer header.secret.remainder trailing-secret',
    'authorization: Basic basic-header.secret.remainder trailing-basic-header',
    'Bearer bearer.secret.remainder',
    'Basic basic.secret.remainder==',
    'tool --token token.secret.remainder --secret "quoted secret remainder" --password=password.secret.remainder',
    'expanded --api-key api.secret --access-token access.secret --passcode pass.secret --authorization auth.secret',
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signatureRemainder',
    'unsecured-jwt eyJhbGciOiJub25lIn0.e30.',
    'one-character-signature eyJhbGciOiJub25lIn0.e30.x',
    'structured {"apiKey":"json-secret","nested":{"access_token":"nested-secret"}}',
    'structured-array {"apiKey":["array-secret-one","array-secret-two"],"nested":[{"password":"nested-array-secret"},{"safe":"ok"}]}',
    'ordinary-dotted-values 12.34.56 release.2026.08',
    'json-without-alg e30.e30.x',
    '',
  ].join('\n');
  const expected = [
    'Authorization: [REDACTED]',
    'authorization: [REDACTED]',
    'Bearer [REDACTED]',
    'Basic [REDACTED]',
    'tool --token [REDACTED] --secret [REDACTED] --password=[REDACTED]',
    'expanded --api-key [REDACTED] --access-token [REDACTED] --passcode [REDACTED] --authorization [REDACTED]',
    'jwt [REDACTED]',
    'unsecured-jwt [REDACTED]',
    'one-character-signature [REDACTED]',
    'structured {"apiKey":"[REDACTED]","nested":{"access_token":"[REDACTED]"}}',
    'structured-array {"apiKey":"[REDACTED]","nested":[{"password":"[REDACTED]"},{"safe":"ok"}]}',
    'ordinary-dotted-values 12.34.56 release.2026.08',
    'json-without-alg e30.e30.x',
    '',
  ].join('\n');

  const { receipt, exitCode } = await runEvidence(
    { output, specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'test' },
    {
      execute: async () => ({
        status: 'completed',
        code: 0,
        signal: null,
        timedOut: false,
        error: null,
        stdout: { bytes: Buffer.from(adversarialOutput), truncated: false },
        stderr: { bytes: Buffer.from(adversarialOutput), truncated: false },
      }),
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(receipt.output.stdout.text, expected);
  assert.equal(receipt.output.stderr.text, expected);
  const serialized = await readFile(output, 'utf8');
  assert.doesNotMatch(
    serialized,
    /header\.secret|trailing-secret|basic-header\.secret|trailing-basic-header|bearer\.secret|basic\.secret|token\.secret|quoted secret|password\.secret|api\.secret|access\.secret|pass\.secret|auth\.secret|json-secret|nested-secret|array-secret|nested-array-secret|eyJhbGci|signatureRemainder/u,
  );
  assert.deepEqual(receipt.evidence, {
    classification: 'advisory-structural-consistency',
    authority: 'none',
    provenance: false,
    executionAttestation: false,
    producerAuthentication: false,
    effectContainment: 'uncertain',
    gateEligible: false,
  });
});

test('redacts balanced structured fragments with suffixes and newlines without rewriting harmless JSON', () => {
  const suffixed = 'prefix {"token":["probe-one","probe-two"],"safe":true} trailing text';
  assert.equal(redact(suffixed), 'prefix {"token":"[REDACTED]","safe":true} trailing text');

  const multiline = 'prefix {\n  "nested": {\n    "api_key": ["probe-one", "probe-two"]\n  }\n} suffix';
  assert.equal(redact(multiline), 'prefix {"nested":{"api_key":"[REDACTED]"}} suffix');
  assert.doesNotMatch(redact(multiline), /probe-one|probe-two/u);

  const harmless = '{"safe": "value", "nested": [1, 2]}';
  assert.equal(redact(harmless), harmless);
  assert.equal(credentialBearingArgument(harmless), false);
});

test('rejects credential-bearing argv before execution or receipt persistence', async (t) => {
  const candidates = [
    ['separate flag', ['--token', 'secret-value']],
    ['assigned flag', ['--api-key=secret-value']],
    ['embedded flags', ['sh -c "tool --access-token secret-value"']],
    ['authorization flag', ['--authorization', 'secret-value']],
    ['passcode assignment', ['--passcode=secret-value']],
    ['structured JSON', ['{"accessToken":"secret-value"}']],
    ['nested structured JSON', ['{"safe":[{"api_key":["one","two"]}]}']],
    ['known token', ['github_pat_secretvalue']],
    ['JWT', ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature']],
  ];
  for (const [name, argv] of candidates) await t.test(name, async () => {
    const repository = await makeRepository();
    const spec = await writeSpec(repository, { argv, artifacts: [] });
    const output = await makeOutput(`${name.replaceAll(' ', '-')}.json`);
    let executed = false;
    await assert.rejects(
      runEvidence(
        { output, specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'test' },
        { execute: async () => { executed = true; throw new Error('must not execute'); } },
      ),
      /credential-bearing argument/u,
    );
    assert.equal(executed, false);
    assert.equal(await readFile(output, 'utf8'), '');
  });
});

test('external effects remain explicitly containment-uncertain and non-gate-eligible', async () => {
  const repository = await makeRepository();
  const spec = await writeSpec(repository, { argv: ['-e', 'process.exit(0)'], artifacts: [] });
  const external = await makeOutput('external-effect.txt');
  const output = await makeOutput('external-effect-receipt.json');
  const { receipt } = await runEvidence(
    { output, specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'test' },
    { execute: async () => {
      await writeFile(external, 'external effect\n');
      return { status: 'completed', code: 0, signal: null, timedOut: false, error: null, stdout: { bytes: Buffer.alloc(0), truncated: false }, stderr: { bytes: Buffer.alloc(0), truncated: false } };
    } },
  );
  assert.equal(receipt.evidence.effectContainment, 'uncertain');
  assert.equal(receipt.evidence.gateEligible, false);
  assert.equal(await readFile(external, 'utf8'), 'external effect\n');
});

test('a detached descendant cannot promote a receipt beyond containment-uncertain advisory evidence', async () => {
  const repository = await makeRepository();
  const external = await makeOutput('detached-effect.txt');
  const childSource = `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(external)}, 'detached effect\\n'), 75)`;
  const parentSource = `const child=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{detached:true,stdio:'ignore'});child.unref()`;
  const spec = await writeSpec(repository, { argv: ['-e', parentSource], artifacts: [] });
  const { receipt } = await runEvidence({
    output: await makeOutput('detached-effect-receipt.json'),
    specPath: spec.path,
    expectedSpecSha256: spec.sha256,
    commandId: 'test',
  });
  await delay(200);
  assert.equal(await readFile(external, 'utf8'), 'detached effect\n');
  assert.equal(receipt.evidence.effectContainment, 'uncertain');
  assert.equal(receipt.evidence.gateEligible, false);
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
  const output = await reserveOutput(join(repository, 'receipt.json'));
  let executed = false;
  await assert.rejects(
    runEvidence(
      { output, specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'test' },
      { execute: async () => { executed = true; throw new Error('must not execute'); } },
    ),
    /outside the measured repository/u,
  );
  assert.equal(executed, false);
  assert.equal(await readFile(output, 'utf8'), '');
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

test('reserved-output writer rejects symlink parents and targets', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'evidence-symlink-')));
  const realParent = join(root, 'real');
  const linkedParent = join(root, 'linked');
  await mkdir(realParent);
  await symlink(realParent, linkedParent);
  await assert.rejects(writeReservedOutput(join(linkedParent, 'receipt.json'), '{}\n'), /canonical non-symlink/u);
  const target = join(realParent, 'target.json');
  const foreign = join(realParent, 'foreign.json');
  await writeFile(foreign, 'foreign\n');
  await symlink(foreign, target);
  await assert.rejects(writeReservedOutput(target, '{}\n'), /precreated non-symlink/u);
  assert.equal((await lstat(target)).isSymbolicLink(), true);
  assert.equal(await readFile(foreign, 'utf8'), 'foreign\n');
});

test('reserved-output writer fsyncs file and parent and rolls retained output back on failure', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'evidence-durable-')));
  const durable = join(root, 'durable.json');
  await reserveOutput(durable);
  let syncCalls = 0;
  await writeReservedOutput(durable, '{}\n', { sync: async (handle) => { syncCalls += 1; await handle.sync(); } });
  assert.equal(syncCalls, 2);
  assert.equal((await stat(durable)).mode & 0o777, 0o600);

  const failed = join(root, 'failed.json');
  await reserveOutput(failed);
  await assert.rejects(writeReservedOutput(failed, '{}\n', { write: async () => { throw new Error('injected write failure'); } }), /injected write failure/u);
  assert.equal(await readFile(failed, 'utf8'), '');

  const unsynced = join(root, 'unsynced.json');
  await reserveOutput(unsynced);
  await assert.rejects(writeReservedOutput(unsynced, '{}\n', { sync: async () => { throw new Error('injected fsync failure'); } }), /became uncertain and rollback failed/u);
  assert.equal(await readFile(unsynced, 'utf8'), '');
});

test('reserved-output parent swaps never place evidence bytes in a foreign target', async (t) => {
  for (const hook of ['beforeTargetOpen', 'beforeWrite', 'afterWrite']) await t.test(hook, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'evidence-parent-swap-')));
    const parent = join(root, 'evidence');
    const retainedParent = join(root, 'retained');
    const target = join(parent, 'receipt.json');
    await mkdir(parent);
    await reserveOutput(target);
    let swapped = false;
    const swap = async () => {
      if (swapped) return;
      swapped = true;
      await rename(parent, retainedParent);
      await mkdir(parent);
      await reserveOutput(target);
    };
    await assert.rejects(
      writeReservedOutput(target, 'sensitive-evidence\n', { [hook]: swap }),
      /identity changed/u,
    );
    assert.equal(await readFile(target, 'utf8'), '');
    assert.equal(await readFile(join(retainedParent, 'receipt.json'), 'utf8'), '');
  });
});

test('retains the reserved output identity across command execution', async () => {
  const repository = await makeRepository();
  const spec = await writeSpec(repository, { argv: ['-e', 'process.exit(0)'], artifacts: [] });
  const output = await makeOutput('execution-swap.json');
  const originalParent = dirname(output);
  const retainedParent = `${originalParent}-retained`;
  await assert.rejects(
    runEvidence(
      { output, specPath: spec.path, expectedSpecSha256: spec.sha256, commandId: 'test' },
      { execute: async () => {
        await rename(originalParent, retainedParent);
        await mkdir(originalParent);
        await reserveOutput(output);
        return { status: 'completed', code: 0, signal: null, timedOut: false, error: null, stdout: { bytes: Buffer.alloc(0), truncated: false }, stderr: { bytes: Buffer.alloc(0), truncated: false } };
      } },
    ),
    /identity changed/u,
  );
  assert.equal(await readFile(output, 'utf8'), '');
  assert.equal(await readFile(join(retainedParent, 'execution-swap.json'), 'utf8'), '');
});
