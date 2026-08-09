import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkAcceptance } from '../scripts/operations/acceptance-check.mjs';
import { sha256 } from '../scripts/operations/common.mjs';
import { PLAN_NOTICE } from '../scripts/operations/flight-common.mjs';
import { compileHandoff, validateHandoffPacket } from '../scripts/operations/handoff-compile.mjs';
import { recordHandoffState, validateHandoffState } from '../scripts/operations/handoff-state.mjs';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const digest = async (path) => sha256(await readFile(path));

const missionRecord = ({ id, lane, branch, worktree, writablePath, dependsOn = [], activationWave = 1 }) => ({
  id,
  slug: id.replace(':', '-'),
  title: id,
  library: 'test-library',
  lane,
  branch,
  worktree,
  activationWave,
  dependsOn,
  writablePaths: [`${writablePath}/**`],
  scope: `Implement ${id}`,
  deliverables: [`Deliver ${id}`],
  dependencyLevel: dependsOn.length === 0 ? 0 : 1,
  initialEligibility: dependsOn.length === 0 ? 'eligible-after-independent-authorization' : 'blocked-by-dependencies',
  constructionStatus: 'planned-not-created',
  authorityStatus: 'not-initialized',
});

export const createConvergenceFixture = async ({ twoDependencies = false } = {}) => {
  const temporary = await mkdtemp(join(tmpdir(), 'shield-handoff-'));
  const root = await realpath(temporary);
  const repository = join(root, 'repository');
  await mkdir(repository);
  git(repository, ['init', '--initial-branch=main']);
  git(repository, ['config', 'user.email', 'operations@example.invalid']);
  git(repository, ['config', 'user.name', 'SHIELD Operations']);
  await writeFile(join(repository, 'README.md'), 'base\n');
  git(repository, ['add', '.']);
  git(repository, ['commit', '-m', 'base']);
  const base = git(repository, ['rev-parse', 'HEAD']);

  const worktreeA = join(root, 'worktree-a');
  git(repository, ['worktree', 'add', '-b', 'spike/a', worktreeA, base]);
  await mkdir(join(worktreeA, 'a'));
  await writeFile(join(worktreeA, 'a', 'result.txt'), 'a\n');
  git(worktreeA, ['add', '.']);
  git(worktreeA, ['commit', '-m', 'a result']);

  const missions = [missionRecord({
    id: 'mission:a', lane: 'alpha', branch: 'spike/a', worktree: worktreeA, writablePath: 'a',
  })];
  let worktreeB;
  if (twoDependencies) {
    worktreeB = join(root, 'worktree-b');
    git(repository, ['worktree', 'add', '-b', 'spike/b', worktreeB, base]);
    await mkdir(join(worktreeB, 'b'));
    await writeFile(join(worktreeB, 'b', 'result.txt'), 'b\n');
    git(worktreeB, ['add', '.']);
    git(worktreeB, ['commit', '-m', 'b result']);
    missions.push(missionRecord({
      id: 'mission:b', lane: 'bravo', branch: 'spike/b', worktree: worktreeB, writablePath: 'b',
    }));
    missions.push(missionRecord({
      id: 'mission:integration',
      lane: 'alpha',
      branch: 'spike/integration',
      worktree: join(root, 'worktree-integration'),
      writablePath: 'integration',
      dependsOn: ['mission:a', 'mission:b'],
      activationWave: 2,
    }));
  }
  const plan = {
    schemaVersion: 1,
    planType: 'feature-flight-resolved-plan',
    prototype: { name: 'flight-prep', version: '1.0.0', authority: 'none', notice: PLAN_NOTICE },
    flightId: 'flight:test',
    objective: 'Test exact convergence contracts',
    repository: {
      root: repository,
      remoteUrl: null,
      baseRef: 'main',
      baseRevision: base,
      inspectedHead: base,
      inspectedBranch: 'main',
      inspectedWorktreeClean: true,
      collisions: [],
    },
    integration: { branch: 'feature/test', status: 'declared-not-created' },
    lanes: [
      { id: 'alpha', chatLabel: 'Alpha', teamLabel: 'Team Alpha' },
      ...(twoDependencies ? [{ id: 'bravo', chatLabel: 'Bravo', teamLabel: 'Team Bravo' }] : []),
    ],
    missions,
    evaluationContract: { fixtureId: 'fixture:test', version: 1, scorecard: ['correctness'] },
  };
  const planPath = join(root, 'plan.json');
  await writeJson(planPath, plan);
  return { root, repository, base, plan, planPath, worktreeA, worktreeB };
};

export const createHandoffInputs = async (fixture, missionId, suffix = missionId.at(-1)) => {
  const mission = fixture.plan.missions.find((candidate) => candidate.id === missionId);
  const head = git(mission.worktree, ['rev-parse', 'HEAD']);
  const directory = join(fixture.root, `evidence-${suffix}`);
  await mkdir(directory);
  const statusPath = join(directory, 'status.json');
  const statePath = join(directory, 'state.json');
  const receiptPath = join(directory, 'receipt.json');
  const manifestPath = join(directory, 'manifest.json');
  const acceptancePath = join(directory, 'acceptance.json');
  const specPath = join(directory, 'spec.json');
  await writeJson(statusPath, {
    currentGate: 'implementation-complete',
    decisions: [],
    processExperiments: [],
    toolsCreated: [],
    risks: [],
    blockers: [],
    recommendedNextAction: 'Begin exact-head review.',
  });
  await recordHandoffState({
    planPath: fixture.planPath,
    missionId,
    worktree: mission.worktree,
    statusPath,
    sequence: 0,
    output: statePath,
  });
  const sourceSha256 = '0'.repeat(64);
  const emptyHash = sha256('');
  const evidenceToolPath = fileURLToPath(new URL('../scripts/operations/evidence-run.mjs', import.meta.url));
  const artifactPath = `${missionId.at(-1)}/result.txt`;
  const artifactBytes = await readFile(join(mission.worktree, artifactPath));
  await writeJson(specPath, {
    schemaVersion: 1,
    specType: 'mission-acceptance-spec',
    missionId,
    source: { key: 'source:test', sha256: sourceSha256, criteriaCount: 1 },
    repository: { root: mission.worktree, branch: mission.branch },
    commands: [{ id: 'test', executable: '/usr/bin/true', argv: [], timeoutMs: 1000, artifacts: [artifactPath] }],
    criteria: [{
      id: 'criterion:test',
      sourceText: 'It works',
      validation: {
        mode: 'automated',
        testPaths: ['test/convergence.test.mjs'],
        commandIds: ['test'],
        negativeCaseRequired: false,
        negativeTestPaths: [],
      },
    }],
  });
  const specSha256 = await digest(specPath);
  await writeJson(receiptPath, {
    schemaVersion: 1,
    receiptType: 'mission-command-evidence',
    receiptId: `evidence:${suffix}`,
    evidence: {
      classification: 'contract-relative-structural-evidence',
      authority: 'none',
      provenance: false,
      executionAttestation: false,
    },
    specSha256,
    commandId: 'test',
    command: { executable: '/usr/bin/true', argv: [] },
    repository: {
      beforeRoot: mission.worktree,
      beforeBranch: mission.branch,
      beforeHead: head,
      beforeClean: true,
      afterRoot: mission.worktree,
      afterBranch: mission.branch,
      afterHead: head,
      afterClean: true,
    },
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 0,
    timeoutMs: 1000,
    result: { status: 'completed', exitCode: 0, signal: null, timedOut: false, spawnError: null, artifactErrors: [] },
    output: {
      stdout: { text: '', sha256: emptyHash, truncated: false },
      stderr: { text: '', sha256: emptyHash, truncated: false },
    },
    artifacts: [{ path: artifactPath, bytes: artifactBytes.length, sha256: sha256(artifactBytes) }],
    tool: { name: 'evidence-run', version: '1.0.0', path: evidenceToolPath, sha256: await digest(evidenceToolPath) },
  });
  const receiptSha256 = await digest(receiptPath);
  const mapping = {
    criterionId: 'criterion:test',
    phase: 'green',
    commandId: 'test',
    receiptId: `evidence:${suffix}`,
    receiptSha256,
    path: 'receipt.json',
    expectedRevision: head,
  };
  await writeJson(manifestPath, {
    schemaVersion: 1,
    manifestType: 'mission-evidence-manifest',
    missionId,
    specSha256,
    phase: 'green',
    expectedRevision: head,
    receipts: [mapping],
    redNotApplicable: [{ criterionId: 'criterion:test', rationale: 'Existing behavior is not meaningfully red-testable in this fixture.' }],
    manualEvidence: [],
  });
  const acceptance = await checkAcceptance({
    specPath,
    manifestPath,
    expectedSpecSha256: specSha256,
    phase: 'green',
    expectedRevision: head,
  });
  assert.equal(acceptance.ok, true, acceptance.errors.join('\n'));
  await writeJson(acceptancePath, acceptance);
  const options = {
    flightPlan: fixture.planPath,
    missionId,
    worktree: mission.worktree,
    acceptanceReport: acceptancePath,
    evidenceManifest: manifestPath,
    state: statePath,
    expectedStateSha256: await digest(statePath),
    expectedStateSequence: 0,
    receipts: [receiptPath],
    outputDir: join(directory, 'handoff-output'),
    mode: 'checkout',
  };
  return { directory, mission, head, statusPath, statePath, specPath, receiptPath, manifestPath, acceptancePath, options };
};

test('handoff state and packet producers emit closed v2 contracts from single exact snapshots', async () => {
  const fixture = await createConvergenceFixture();
  const inputs = await createHandoffInputs(fixture, 'mission:a');
  const state = JSON.parse(await readFile(inputs.statePath, 'utf8'));
  assert.deepEqual(validateHandoffState(fixture.plan, state.flight.plan, state), []);
  const result = await compileHandoff(inputs.options);
  assert.deepEqual(validateHandoffPacket(result.packet), []);
  assert.equal(result.packet.flight.id, fixture.plan.flightId);
  assert.equal(result.packet.repository.worktree, inputs.mission.worktree);
  assert.equal(result.packet.repository.head, inputs.head);
  assert.deepEqual(result.packet.repository.changedPaths, ['a/result.txt']);
  assert.equal(result.packet.sequence, 0);
  assert.equal(result.packet.predecessor, null);
  assert.deepEqual(result.packet.acceptance.spec, {
    path: inputs.specPath,
    bytes: (await readFile(inputs.specPath)).length,
    sha256: await digest(inputs.specPath),
  });
  assert.equal(result.packet.authority, 'none');
  assert.match(await readFile(result.markdownPath, 'utf8'), /grants no human approval/u);
});

test('handoff compile rejects forged acceptance receipt sets and unknown state fields', async () => {
  const fixture = await createConvergenceFixture();
  const forged = await createHandoffInputs(fixture, 'mission:a', 'forged');
  const acceptance = JSON.parse(await readFile(forged.acceptancePath, 'utf8'));
  acceptance.receiptSummaries = [];
  await writeJson(forged.acceptancePath, acceptance);
  await assert.rejects(() => compileHandoff(forged.options), /receipt digest set does not exactly equal/u);

  const forgedReceipt = await createHandoffInputs(fixture, 'mission:a', 'forged-receipt');
  const receipt = JSON.parse(await readFile(forgedReceipt.receiptPath, 'utf8'));
  receipt.output.stdout.text = 'forged output';
  await writeJson(forgedReceipt.receiptPath, receipt);
  const manifest = JSON.parse(await readFile(forgedReceipt.manifestPath, 'utf8'));
  manifest.receipts[0].receiptSha256 = await digest(forgedReceipt.receiptPath);
  await writeJson(forgedReceipt.manifestPath, manifest);
  const forgedReport = JSON.parse(await readFile(forgedReceipt.acceptancePath, 'utf8'));
  forgedReport.receiptSummaries[0].receiptSha256 = manifest.receipts[0].receiptSha256;
  forgedReport.manifestSha256 = await digest(forgedReceipt.manifestPath);
  await writeJson(forgedReceipt.acceptancePath, forgedReport);
  await assert.rejects(() => compileHandoff(forgedReceipt.options), /sha256 does not bind the stored output text/u);

  const unknown = await createHandoffInputs(fixture, 'mission:a', 'unknown');
  const state = JSON.parse(await readFile(unknown.statePath, 'utf8'));
  state.unexpected = true;
  await writeJson(unknown.statePath, state);
  unknown.options.expectedStateSha256 = await digest(unknown.statePath);
  await assert.rejects(() => compileHandoff(unknown.options), /state contains unknown field unexpected/u);
});

test('handoff compile recomputes full GREEN criterion semantics and rejects empty automated evidence', async () => {
  const fixture = await createConvergenceFixture();
  const inputs = await createHandoffInputs(fixture, 'mission:a', 'forged-green');
  const manifest = JSON.parse(await readFile(inputs.manifestPath, 'utf8'));
  manifest.receipts = [];
  await writeJson(inputs.manifestPath, manifest);
  const acceptance = JSON.parse(await readFile(inputs.acceptancePath, 'utf8'));
  acceptance.manifestSha256 = await digest(inputs.manifestPath);
  acceptance.receiptSummaries = [];
  acceptance.criteria = [];
  acceptance.ok = true;
  acceptance.errors = [];
  await writeJson(inputs.acceptancePath, acceptance);
  await assert.rejects(() => compileHandoff({
    ...inputs.options,
    receipts: [],
  }), /does not exactly equal full acceptance semantics|requires GREEN evidence/u);

  const aliased = await createHandoffInputs(fixture, 'mission:a', 'aliased-spec');
  const specAlias = join(aliased.directory, 'spec-alias.json');
  await symlink(aliased.specPath, specAlias);
  const aliasedAcceptance = JSON.parse(await readFile(aliased.acceptancePath, 'utf8'));
  aliasedAcceptance.specPath = specAlias;
  await writeJson(aliased.acceptancePath, aliasedAcceptance);
  await assert.rejects(() => compileHandoff(aliased.options), /non-symlink regular file/u);
});

test('handoff compile rejects a zero-receipt manual acceptance spec bound to the wrong repository', async () => {
  const fixture = await createConvergenceFixture();
  const inputs = await createHandoffInputs(fixture, 'mission:a', 'wrong-spec-repository');
  const spec = JSON.parse(await readFile(inputs.specPath, 'utf8'));
  spec.repository.root = fixture.repository;
  spec.commands = [];
  spec.criteria = [{
    id: 'criterion:manual',
    sourceText: 'A reviewer confirms the result.',
    validation: { mode: 'manual', procedure: ['Inspect the result.'], expectedResult: 'The result is correct.' },
  }];
  await writeJson(inputs.specPath, spec);
  const specSha256 = await digest(inputs.specPath);
  await writeJson(inputs.manifestPath, {
    schemaVersion: 1,
    manifestType: 'mission-evidence-manifest',
    missionId: 'mission:a',
    specSha256,
    phase: 'green',
    expectedRevision: inputs.head,
    receipts: [],
    redNotApplicable: [],
    manualEvidence: [{
      criterionId: 'criterion:manual',
      performedBy: 'reviewer:test',
      performedAt: '2026-01-01T00:00:00.000Z',
      revision: inputs.head,
      observation: 'The result is correct.',
    }],
  });
  const acceptance = await checkAcceptance({
    specPath: inputs.specPath,
    manifestPath: inputs.manifestPath,
    expectedSpecSha256: specSha256,
    phase: 'green',
    expectedRevision: inputs.head,
  });
  assert.equal(acceptance.ok, true, acceptance.errors.join('\n'));
  await writeJson(inputs.acceptancePath, acceptance);
  await assert.rejects(() => compileHandoff({
    ...inputs.options,
    receipts: [],
  }), /spec repository root and branch do not exactly match/u);
});

test('handoff changed-path reader rejects whitespace and control names without trimming', async (context) => {
  const cases = [
    { name: 'leading whitespace', path: (worktree) => join(worktree, 'a', ' leading.txt') },
    { name: 'newline and control', path: (worktree) => join(worktree, 'a', 'line\ncontrol-\u0001.txt') },
  ];
  for (const item of cases) {
    await context.test(item.name, async () => {
      const fixture = await createConvergenceFixture();
      await writeFile(item.path(fixture.worktreeA), 'adversarial\n');
      git(fixture.worktreeA, ['add', '-A']);
      git(fixture.worktreeA, ['commit', '-m', `add ${item.name}`]);
      const inputs = await createHandoffInputs(fixture, 'mission:a', `path-${item.name.replaceAll(' ', '-')}`);
      await assert.rejects(
        () => compileHandoff(inputs.options),
        /noncanonical path|not valid UTF-8/u,
      );
    });
  }
});

test('handoff compile verifies receipt-declared artifact bytes in the exact worktree', async () => {
  const fixture = await createConvergenceFixture();
  const inputs = await createHandoffInputs(fixture, 'mission:a', 'artifact-forgery');
  const receipt = JSON.parse(await readFile(inputs.receiptPath, 'utf8'));
  receipt.artifacts[0].sha256 = 'f'.repeat(64);
  await writeJson(inputs.receiptPath, receipt);
  const receiptSha256 = await digest(inputs.receiptPath);
  const manifest = JSON.parse(await readFile(inputs.manifestPath, 'utf8'));
  manifest.receipts[0].receiptSha256 = receiptSha256;
  await writeJson(inputs.manifestPath, manifest);
  const acceptance = JSON.parse(await readFile(inputs.acceptancePath, 'utf8'));
  acceptance.receiptSummaries[0].receiptSha256 = receiptSha256;
  acceptance.manifestSha256 = await digest(inputs.manifestPath);
  await writeJson(inputs.acceptancePath, acceptance);
  await assert.rejects(
    () => compileHandoff(inputs.options),
    /artifact a\/result.txt does not match actual worktree bytes/u,
  );
});

test('handoff state and packet outputs must remain outside all observed and planned worktrees', async () => {
  const fixture = await createConvergenceFixture();
  const inputs = await createHandoffInputs(fixture, 'mission:a', 'confined-output');
  const stateOutput = join(fixture.worktreeA, 'state-output.json');
  await assert.rejects(() => recordHandoffState({
    planPath: fixture.planPath,
    missionId: 'mission:a',
    worktree: fixture.worktreeA,
    statusPath: inputs.statusPath,
    sequence: 0,
    output: stateOutput,
  }), /outside every observed or planned worktree/u);
  await assert.rejects(() => readFile(stateOutput), /ENOENT/u);

  const outputDir = join(fixture.worktreeA, 'handoff-output');
  await assert.rejects(
    () => compileHandoff({ ...inputs.options, outputDir }),
    /outside every observed or planned worktree/u,
  );
  await assert.rejects(() => readFile(join(outputDir, 'handoff.json')), /ENOENT/u);

  const observedOnly = join(fixture.root, 'observed\ncontrol\tworktree');
  git(fixture.repository, ['worktree', 'add', '-b', 'scratch/observed-only', observedOnly, fixture.base]);
  const observedOutput = join(observedOnly, 'state-output.json');
  await assert.rejects(() => recordHandoffState({
    planPath: fixture.planPath,
    missionId: 'mission:a',
    worktree: fixture.worktreeA,
    statusPath: inputs.statusPath,
    sequence: 0,
    output: observedOutput,
  }), /outside every observed or planned worktree/u);
  await assert.rejects(() => readFile(observedOutput), /ENOENT/u);

  await rename(observedOnly, `${observedOnly}-moved`);
  await assert.rejects(() => recordHandoffState({
    planPath: fixture.planPath,
    missionId: 'mission:a',
    worktree: fixture.worktreeA,
    statusPath: inputs.statusPath,
    sequence: 0,
    output: join(fixture.root, 'outside-state.json'),
  }), /unresolved or non-canonical/u);
});

test('handoff compile rejects dirty, stale, branch, and canonical alias drift', async () => {
  const fixture = await createConvergenceFixture();
  const dirty = await createHandoffInputs(fixture, 'mission:a', 'dirty');
  await writeFile(join(fixture.worktreeA, 'a', 'result.txt'), 'dirty\n');
  await assert.rejects(() => compileHandoff(dirty.options), /Worktree must be clean/u);
  git(fixture.worktreeA, ['restore', 'a/result.txt']);

  const stale = await createHandoffInputs(fixture, 'mission:a', 'stale');
  git(fixture.worktreeA, ['commit', '--allow-empty', '-m', 'advance']);
  await assert.rejects(() => compileHandoff(stale.options), /exact live mission repository state/u);

  const alias = join(fixture.root, 'worktree-alias');
  await symlink(fixture.worktreeA, alias);
  const aliased = await createHandoffInputs(fixture, 'mission:a', 'alias');
  aliased.options.worktree = alias;
  await assert.rejects(() => compileHandoff(aliased.options), /canonical and contain no alias or symlink/u);
});

test('successor state requires the exact sequence-minus-one predecessor and compile rechecks it', async () => {
  const fixture = await createConvergenceFixture();
  const inputs = await createHandoffInputs(fixture, 'mission:a', 'successor');
  const successorPath = join(inputs.directory, 'state-1.json');
  const predecessorSha256 = await digest(inputs.statePath);
  await recordHandoffState({
    planPath: fixture.planPath,
    missionId: 'mission:a',
    worktree: fixture.worktreeA,
    statusPath: inputs.statusPath,
    sequence: 1,
    predecessorStatePath: inputs.statePath,
    expectedPredecessorSha256: predecessorSha256,
    output: successorPath,
  });
  const successorOptions = {
    ...inputs.options,
    state: successorPath,
    expectedStateSha256: await digest(successorPath),
    expectedStateSequence: 1,
    predecessorState: inputs.statePath,
    expectedPredecessorSha256: predecessorSha256,
    outputDir: join(inputs.directory, 'successor-output'),
  };
  const result = await compileHandoff(successorOptions);
  assert.equal(result.packet.sequence, 1);
  assert.equal(result.packet.predecessor.sequence, 0);

  await assert.rejects(() => compileHandoff({
    ...successorOptions,
    expectedPredecessorSha256: 'f'.repeat(64),
    outputDir: join(inputs.directory, 'broken-predecessor-output'),
  }), /Expected predecessor SHA-256 does not match/u);
});

test('resume packets preserve incomplete closed acceptance without claiming completion', async () => {
  const fixture = await createConvergenceFixture();
  const inputs = await createHandoffInputs(fixture, 'mission:a', 'resume');
  const manifest = JSON.parse(await readFile(inputs.manifestPath, 'utf8'));
  manifest.phase = 'structure';
  manifest.expectedRevision = null;
  manifest.receipts = [];
  manifest.redNotApplicable = [];
  await writeJson(inputs.manifestPath, manifest);
  const acceptance = JSON.parse(await readFile(inputs.acceptancePath, 'utf8'));
  acceptance.manifestSha256 = await digest(inputs.manifestPath);
  acceptance.phase = 'structure';
  acceptance.expectedRevision = null;
  acceptance.receiptSummaries = [];
  acceptance.criteria[0].greenEvidence = 0;
  await writeJson(inputs.acceptancePath, acceptance);
  const result = await compileHandoff({
    ...inputs.options,
    acceptanceReport: inputs.acceptancePath,
    evidenceManifest: inputs.manifestPath,
    receipts: [],
    outputDir: join(inputs.directory, 'resume-output'),
    mode: 'resume',
  });
  assert.equal(result.packet.mode, 'resume');
  assert.equal(result.packet.acceptance.phase, 'structure');
  assert.equal(result.packet.acceptance.expectedRevision, null);
  assert.deepEqual(result.packet.evidence.receipts, []);
});

test('resume packets accept valid RED acceptance with a completed failing RED receipt', async () => {
  const fixture = await createConvergenceFixture();
  const inputs = await createHandoffInputs(fixture, 'mission:a', 'resume-red');
  const receipt = JSON.parse(await readFile(inputs.receiptPath, 'utf8'));
  receipt.result.exitCode = 1;
  await writeJson(inputs.receiptPath, receipt);
  const receiptSha256 = await digest(inputs.receiptPath);
  const manifest = JSON.parse(await readFile(inputs.manifestPath, 'utf8'));
  manifest.phase = 'red';
  manifest.receipts[0].phase = 'red';
  manifest.receipts[0].receiptSha256 = receiptSha256;
  manifest.redNotApplicable = [];
  await writeJson(inputs.manifestPath, manifest);
  const acceptance = await checkAcceptance({
    specPath: inputs.specPath,
    manifestPath: inputs.manifestPath,
    expectedSpecSha256: await digest(inputs.specPath),
    phase: 'red',
    expectedRevision: inputs.head,
  });
  assert.equal(acceptance.ok, true, acceptance.errors.join('\n'));
  await writeJson(inputs.acceptancePath, acceptance);
  const result = await compileHandoff({
    ...inputs.options,
    mode: 'resume',
    outputDir: join(inputs.directory, 'resume-red-output'),
  });
  assert.equal(result.packet.mode, 'resume');
  assert.equal(result.packet.acceptance.phase, 'red');
  assert.equal(result.packet.acceptance.ok, true);
  assert.equal(result.packet.evidence.receipts[0].receiptId, 'evidence:resume-red');
});
