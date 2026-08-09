import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../scripts/operations/common.mjs';
import { compareUtf8, parseWorktreeListPorcelain } from '../scripts/operations/convergence-common.mjs';
import { checkIntegration, validateIntegrationReport } from '../scripts/operations/integration-check.mjs';
import {
  ARCHIVE_PAYLOAD_FORMAT,
  ARCHIVE_PAYLOAD_TYPE,
  planTeardown,
  validateTeardownReport,
} from '../scripts/operations/teardown-plan.mjs';
import { compileHandoff } from '../scripts/operations/handoff-compile.mjs';
import { createConvergenceFixture, createHandoffInputs } from './operations-handoff-compile.test.mjs';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const sourceIdentity = async (path) => {
  const bytes = await readFile(path);
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
};

const createIntegrationBranch = (fixture) => {
  git(fixture.repository, ['branch', fixture.plan.integration.branch, fixture.base]);
  return `refs/heads/${fixture.plan.integration.branch}`;
};

const createArchiveEvidence = async (fixture, {
  relativePath = 'artifact.bin',
  category = 'untracked',
  content = Buffer.from('artifact\n'),
  payloadPath = join(fixture.root, 'archive-payload.json'),
  archivePath = join(fixture.root, 'archive.json'),
} = {}) => {
  const observedHead = git(fixture.worktreeA, ['rev-parse', 'HEAD']);
  const file = {
    path: relativePath,
    category,
    kind: 'regular',
    bytes: content.length,
    sha256: sha256(content),
  };
  await writeJson(payloadPath, {
    schemaVersion: 1,
    payloadType: ARCHIVE_PAYLOAD_TYPE,
    format: ARCHIVE_PAYLOAD_FORMAT,
    files: [{ ...file, contentBase64: content.toString('base64') }],
  });
  const payload = await sourceIdentity(payloadPath);
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
    payload: { ...payload, format: ARCHIVE_PAYLOAD_FORMAT },
    files: [file],
    createdAt: '2026-01-01T00:00:00.000Z',
    tool: { name: 'external-archive', version: '1.0.0' },
  });
  return { archivePath, payloadPath, file };
};

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
  assert.equal(report.dependencyEvidence[0].sources.state.path, flight.aInputs.statePath);
  assert.deepEqual(report.dependencyEvidence[0].sources.spec, await sourceIdentity(flight.aInputs.specPath));
  assert.deepEqual(report.dependencyEvidence[0].sources.receipts, [{
    receiptId: 'evidence:integration-a',
    source: await sourceIdentity(flight.aInputs.receiptPath),
  }]);
  assert.deepEqual(report.dependencyEvidence[0].sources.artifacts, [{
    receiptId: 'evidence:integration-a',
    artifactPath: 'a/result.txt',
    source: await sourceIdentity(join(flight.fixture.worktreeA, 'a/result.txt')),
  }]);
  const openReport = structuredClone(report);
  openReport.dependencyEvidence[0].sources.fabricated = true;
  assert.match(validateIntegrationReport(openReport).join('\n'), /sources contains unknown field fabricated/u);
  const collidingReport = structuredClone(report);
  collidingReport.dependencyEvidence[0].sources.spec = collidingReport.dependencyEvidence[0].sources.state;
  assert.match(validateIntegrationReport(collidingReport).join('\n'), /reuses canonical source path/u);
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

test('integration replays every canonical packet-bound source and rejects stale, absent, aliased, substituted, and fabricated evidence', async () => {
  {
    const flight = await completedFlight();
    await writeFile(flight.aInputs.acceptancePath, `${await readFile(flight.aInputs.acceptancePath, 'utf8')} `);
    const report = await checkIntegration({
      planPath: flight.fixture.planPath,
      targetMissionId: 'mission:integration',
      packetPaths: [flight.aPath, flight.bPath],
    });
    assert.equal(report.ok, false);
    assert.match(report.errors.join('\n'), /acceptance report source bytes or digest/u);
  }

  {
    const flight = await completedFlight();
    const packet = JSON.parse(await readFile(flight.aPath, 'utf8'));
    packet.state.source.path = join(flight.fixture.root, 'absent-state.json');
    const packetPath = join(flight.fixture.root, 'absent-source-packet.json');
    await writeJson(packetPath, packet);
    const report = await checkIntegration({
      planPath: flight.fixture.planPath,
      targetMissionId: 'mission:integration',
      packetPaths: [packetPath, flight.bPath],
    });
    assert.equal(report.ok, false);
    assert.match(report.errors.join('\n'), /state source is absent or unsafe/u);
  }

  {
    const flight = await completedFlight();
    const packet = JSON.parse(await readFile(flight.aPath, 'utf8'));
    packet.acceptance.report.path = join(flight.fixture.root, 'absent-acceptance.json');
    const packetPath = join(flight.fixture.root, 'absent-acceptance-packet.json');
    await writeJson(packetPath, packet);
    const report = await checkIntegration({
      planPath: flight.fixture.planPath,
      targetMissionId: 'mission:integration',
      packetPaths: [packetPath, flight.bPath],
    });
    assert.equal(report.ok, false);
    assert.match(report.errors.join('\n'), /acceptance report source is absent or unsafe/u);
    const evidence = report.dependencyEvidence.find((item) => item.missionId === 'mission:a');
    assert.deepEqual(evidence.sources.receipts, packet.evidence.receipts.map(({ receiptId, source }) => ({ receiptId, source })));
  }

  {
    const flight = await completedFlight();
    const packet = JSON.parse(await readFile(flight.aPath, 'utf8'));
    const aliasPath = join(flight.fixture.root, 'state-alias.json');
    await symlink(flight.aInputs.statePath, aliasPath);
    packet.state.source.path = aliasPath;
    const packetPath = join(flight.fixture.root, 'aliased-source-packet.json');
    await writeJson(packetPath, packet);
    const report = await checkIntegration({
      planPath: flight.fixture.planPath,
      targetMissionId: 'mission:integration',
      packetPaths: [packetPath, flight.bPath],
    });
    assert.equal(report.ok, false);
    assert.match(report.errors.join('\n'), /state source (?:is absent or unsafe|path is aliased)/u);
  }

  {
    const flight = await completedFlight();
    const packetA = JSON.parse(await readFile(flight.aPath, 'utf8'));
    const packetB = JSON.parse(await readFile(flight.bPath, 'utf8'));
    packetA.state.source = packetB.state.source;
    const packetPath = join(flight.fixture.root, 'substituted-source-packet.json');
    await writeJson(packetPath, packetA);
    await assert.rejects(() => checkIntegration({
      planPath: flight.fixture.planPath,
      targetMissionId: 'mission:integration',
      packetPaths: [packetPath, flight.bPath],
    }), /reuses canonical source path/u);
  }

  {
    const flight = await completedFlight();
    const packet = JSON.parse(await readFile(flight.aPath, 'utf8'));
    const fabricatedState = JSON.parse(await readFile(flight.aInputs.statePath, 'utf8'));
    fabricatedState.fabricated = true;
    const fabricatedStatePath = join(flight.fixture.root, 'fabricated-state.json');
    await writeJson(fabricatedStatePath, fabricatedState);
    packet.state.source = await sourceIdentity(fabricatedStatePath);
    const packetPath = join(flight.fixture.root, 'fabricated-source-packet.json');
    await writeJson(packetPath, packet);
    const report = await checkIntegration({
      planPath: flight.fixture.planPath,
      targetMissionId: 'mission:integration',
      packetPaths: [packetPath, flight.bPath],
    });
    assert.equal(report.ok, false);
    assert.match(report.errors.join('\n'), /state contains unknown field fabricated/u);
  }

  {
    const flight = await completedFlight();
    const packetA = JSON.parse(await readFile(flight.aPath, 'utf8'));
    const packetB = JSON.parse(await readFile(flight.bPath, 'utf8'));
    packetA.evidence.receipts[0].source = packetB.evidence.receipts[0].source;
    const packetPath = join(flight.fixture.root, 'substituted-receipt-packet.json');
    await writeJson(packetPath, packetA);
    await assert.rejects(() => checkIntegration({
      planPath: flight.fixture.planPath,
      targetMissionId: 'mission:integration',
      packetPaths: [packetPath, flight.bPath],
    }), /reuses canonical source path/u);
  }
});

test('integration rejects canonical source reuse across packet roles and packet identities', async () => {
  const samePacket = await completedFlight();
  const packetA = JSON.parse(await readFile(samePacket.aPath, 'utf8'));
  packetA.acceptance.spec = packetA.acceptance.manifest;
  const samePacketPath = join(samePacket.fixture.root, 'same-packet-source-collision.json');
  await writeJson(samePacketPath, packetA);
  await assert.rejects(() => checkIntegration({
    planPath: samePacket.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [samePacketPath, samePacket.bPath],
  }), /reuses canonical source path/u);

  const crossPacket = await completedFlight();
  const first = JSON.parse(await readFile(crossPacket.aPath, 'utf8'));
  const second = JSON.parse(await readFile(crossPacket.bPath, 'utf8'));
  second.acceptance.spec = first.acceptance.spec;
  const crossPacketPath = join(crossPacket.fixture.root, 'cross-packet-source-collision.json');
  await writeJson(crossPacketPath, second);
  await assert.rejects(() => checkIntegration({
    planPath: crossPacket.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [crossPacket.aPath, crossPacketPath],
  }), /reuses canonical source path/u);
});

test('integration recomputes acceptance-spec coverage instead of trusting a forged GREEN report', async () => {
  const flight = await completedFlight();
  const manifest = JSON.parse(await readFile(flight.aInputs.manifestPath, 'utf8'));
  manifest.receipts = [];
  await writeJson(flight.aInputs.manifestPath, manifest);
  const acceptance = JSON.parse(await readFile(flight.aInputs.acceptancePath, 'utf8'));
  acceptance.manifestSha256 = (await sourceIdentity(flight.aInputs.manifestPath)).sha256;
  acceptance.receiptSummaries = [];
  acceptance.criteria = [];
  acceptance.ok = true;
  acceptance.errors = [];
  await writeJson(flight.aInputs.acceptancePath, acceptance);
  const packet = JSON.parse(await readFile(flight.aPath, 'utf8'));
  packet.acceptance.report = await sourceIdentity(flight.aInputs.acceptancePath);
  packet.acceptance.manifest = await sourceIdentity(flight.aInputs.manifestPath);
  packet.acceptance.receiptDigests = [];
  packet.evidence.receipts = [];
  packet.evidence.artifacts = [];
  const packetPath = join(flight.fixture.root, 'forged-green-packet.json');
  await writeJson(packetPath, packet);
  const report = await checkIntegration({
    planPath: flight.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [packetPath, flight.bPath],
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /does not exactly equal full semantics recomputed/u);
});

test('integration verifies receipt-declared artifact bytes and confines output outside every flight worktree', async () => {
  const staleArtifact = await completedFlight();
  await writeFile(join(staleArtifact.fixture.worktreeA, 'a/result.txt'), 'substituted artifact\n');
  const report = await checkIntegration({
    planPath: staleArtifact.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [staleArtifact.aPath, staleArtifact.bPath],
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /receipt artifact a\/result.txt source bytes or digest/u);

  const confined = await completedFlight();
  const output = join(confined.fixture.worktreeA, 'integration-report.json');
  await assert.rejects(() => checkIntegration({
    planPath: confined.fixture.planPath,
    targetMissionId: 'mission:integration',
    packetPaths: [confined.aPath, confined.bPath],
    output,
  }), /outside every observed or planned worktree/u);
  await assert.rejects(() => readFile(output), /ENOENT/u);
});

test('teardown inventories tracked, untracked, and ignored files and preserves unrecorded artifacts', async () => {
  const fixture = await createConvergenceFixture();
  const integrationRef = createIntegrationBranch(fixture);
  await writeFile(join(fixture.worktreeA, 'untracked.txt'), 'untracked\n');
  await writeFile(join(fixture.worktreeA, '.git', 'info-placeholder'), '').catch(() => {});
  const excludePath = git(fixture.worktreeA, ['rev-parse', '--git-path', 'info/exclude']);
  await writeFile(excludePath, 'ignored.bin\n', { flag: 'a' });
  await writeFile(join(fixture.worktreeA, 'ignored.bin'), 'ignored\n');

  const report = await planTeardown({ planPath: fixture.planPath, integrationRef });
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
  const integrationRef = createIntegrationBranch(fixture);
  await writeFile(join(fixture.worktreeA, 'artifact.bin'), 'artifact\n');
  const evidence = await createArchiveEvidence(fixture);
  const archive = JSON.parse(await readFile(evidence.archivePath, 'utf8'));
  archive.payload.sha256 = 'f'.repeat(64);
  await writeJson(evidence.archivePath, archive);
  const report = await planTeardown({
    planPath: fixture.planPath,
    integrationRef,
    archiveEvidencePaths: [evidence.archivePath],
  });
  assert.equal(report.worktrees[0].disposition, 'preserve-ambiguous-recoverability');
  assert.equal(report.worktrees[0].archiveEvidence.matched, false);
  assert.equal(await readFile(join(fixture.worktreeA, 'artifact.bin'), 'utf8'), 'artifact\n');
});

test('teardown requires the exact planned integration branch ref before ancestry checks', async () => {
  const fixture = await createConvergenceFixture();
  const exactRef = createIntegrationBranch(fixture);
  git(fixture.repository, ['tag', fixture.plan.integration.branch, fixture.base]);
  for (const substitutedRef of [
    fixture.plan.integration.branch,
    `refs/tags/${fixture.plan.integration.branch}`,
    fixture.base,
    'refs/heads/spike/a',
    'main',
  ]) {
    await assert.rejects(
      () => planTeardown({ planPath: fixture.planPath, integrationRef: substitutedRef }),
      new RegExp(`exactly equal ${exactRef.replaceAll('/', '\\/')}`, 'u'),
    );
  }
  const report = await planTeardown({ planPath: fixture.planPath, integrationRef: exactRef });
  assert.equal(report.integrationRef, exactRef);

  const missing = await createConvergenceFixture();
  await assert.rejects(
    () => planTeardown({ planPath: missing.planPath }),
    /Exact integration branch ref is unavailable/u,
  );
});

test('teardown proves recoverability from exact external payload bytes and complete inventory', async () => {
  const fixture = await createConvergenceFixture();
  const integrationRef = createIntegrationBranch(fixture);
  await writeFile(join(fixture.worktreeA, 'artifact.bin'), 'artifact\n');
  const evidence = await createArchiveEvidence(fixture);
  const report = await planTeardown({
    planPath: fixture.planPath,
    integrationRef,
    archiveEvidencePaths: [evidence.archivePath],
  });
  assert.deepEqual(validateTeardownReport(report), []);
  const worktree = report.worktrees[0];
  assert.equal(worktree.archiveEvidence.matched, true, worktree.archiveEvidence.errors.join('\n'));
  assert.equal(worktree.recoverable, true);
  assert.equal(worktree.disposition, 'preserve-dirty');
  assert.deepEqual(worktree.archiveEvidence.payloads, [await sourceIdentity(evidence.payloadPath)]);
});

test('teardown rejects internal, absent, substituted, and incomplete archive payloads and confines report output', async () => {
  {
    const fixture = await createConvergenceFixture();
    const integrationRef = createIntegrationBranch(fixture);
    await writeFile(join(fixture.worktreeA, 'artifact.bin'), 'artifact\n');
    const evidence = await createArchiveEvidence(fixture, {
      payloadPath: join(fixture.worktreeA, 'payload.json'),
    });
    const report = await planTeardown({
      planPath: fixture.planPath,
      integrationRef,
      archiveEvidencePaths: [evidence.archivePath],
    });
    assert.equal(report.worktrees[0].recoverable, false);
    assert.match(report.worktrees[0].archiveEvidence.errors.join('\n'), /outside every removable worktree/u);
  }

  {
    const fixture = await createConvergenceFixture();
    const integrationRef = createIntegrationBranch(fixture);
    await writeFile(join(fixture.worktreeA, 'artifact.bin'), 'artifact\n');
    const evidence = await createArchiveEvidence(fixture);
    const archive = JSON.parse(await readFile(evidence.archivePath, 'utf8'));
    archive.payload.path = join(fixture.root, 'missing-payload.json');
    await writeJson(evidence.archivePath, archive);
    const report = await planTeardown({
      planPath: fixture.planPath,
      integrationRef,
      archiveEvidencePaths: [evidence.archivePath],
    });
    assert.equal(report.worktrees[0].recoverable, false);
    assert.match(report.worktrees[0].archiveEvidence.errors.join('\n'), /absent, aliased, or non-canonical/u);
  }

  {
    const fixture = await createConvergenceFixture();
    const integrationRef = createIntegrationBranch(fixture);
    await writeFile(join(fixture.worktreeA, 'artifact.bin'), 'artifact\n');
    const evidence = await createArchiveEvidence(fixture);
    const payload = JSON.parse(await readFile(evidence.payloadPath, 'utf8'));
    payload.files[0].contentBase64 = Buffer.from('substituted\n').toString('base64');
    await writeJson(evidence.payloadPath, payload);
    const archive = JSON.parse(await readFile(evidence.archivePath, 'utf8'));
    archive.payload = { ...await sourceIdentity(evidence.payloadPath), format: ARCHIVE_PAYLOAD_FORMAT };
    await writeJson(evidence.archivePath, archive);
    const report = await planTeardown({
      planPath: fixture.planPath,
      integrationRef,
      archiveEvidencePaths: [evidence.archivePath],
    });
    assert.equal(report.worktrees[0].recoverable, false);
    assert.match(report.worktrees[0].archiveEvidence.errors.join('\n'), /does not match its byte count and digest/u);
  }

  {
    const fixture = await createConvergenceFixture();
    const integrationRef = createIntegrationBranch(fixture);
    await writeFile(join(fixture.worktreeA, 'artifact.bin'), 'artifact\n');
    await writeFile(join(fixture.worktreeA, 'second.bin'), 'second\n');
    const evidence = await createArchiveEvidence(fixture);
    const report = await planTeardown({
      planPath: fixture.planPath,
      integrationRef,
      archiveEvidencePaths: [evidence.archivePath],
    });
    assert.equal(report.worktrees[0].recoverable, false);
    assert.match(report.worktrees[0].archiveEvidence.errors.join('\n'), /complete unrecorded artifact inventory/u);
  }

  {
    const fixture = await createConvergenceFixture();
    const integrationRef = createIntegrationBranch(fixture);
    const output = join(fixture.worktreeA, 'teardown-report.json');
    await assert.rejects(
      () => planTeardown({ planPath: fixture.planPath, integrationRef, output }),
      /outside every observed or planned worktree/u,
    );
    await assert.rejects(() => readFile(output), /ENOENT/u);
  }
});

test('persisted convergence ordering is locale-independent UTF-8 byte order', () => {
  assert.deepEqual(['ä', 'z', 'a'].sort(compareUtf8), ['a', 'z', 'ä']);
});

test('worktree porcelain parser preserves newline and control paths and rejects malformed records', () => {
  const controlledPath = '/tmp/worktree\nwith-tab\tand-control-\u0001';
  const bytes = Buffer.from(`worktree ${controlledPath}\0HEAD ${'a'.repeat(40)}\0detached\0\0`, 'utf8');
  assert.deepEqual(parseWorktreeListPorcelain(bytes), [controlledPath]);
  assert.throws(() => parseWorktreeListPorcelain(Buffer.from(`worktree ${controlledPath}\nHEAD ${'a'.repeat(40)}\n`, 'utf8')), /NUL-delimited/u);
  assert.throws(() => parseWorktreeListPorcelain(Buffer.from(`HEAD ${'a'.repeat(40)}\0\0`, 'utf8')), /malformed record/u);
  assert.throws(() => parseWorktreeListPorcelain(Buffer.from(`worktree ${controlledPath}\0unknown field\0\0`, 'utf8')), /malformed record/u);
});
