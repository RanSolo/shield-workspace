import assert from 'node:assert/strict';
import { copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkConstruction } from '../scripts/operations/construction-check.mjs';
import { buildFixture } from '../scripts/operations/fixture-build.mjs';
import { diagnoseFlight } from '../scripts/operations/flight-doctor.mjs';
import { prepareFlight } from '../scripts/operations/flight-prep.mjs';
import { sha256, stableJson } from '../scripts/operations/common.mjs';
import { assertPlan } from '../scripts/operations/flight-common.mjs';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();

const fakeGhostscript = (_command, args) => {
  if (args[0] === '--version') return '10.04.0\n';
  const output = args.find((argument) => argument.startsWith('-sOutputFile=')).slice('-sOutputFile='.length);
  copyFileSync(args.at(-1), output);
  return Buffer.alloc(0);
};

const setupPackage = async ({ createWorktree = false } = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'shield-flight-preflight-'));
  const repo = join(root, 'repo');
  const packageRoot = join(root, 'package');
  const fixtureRoot = join(root, 'fixture');
  const worktree = join(root, 'worktree-a');
  await mkdir(repo);
  git(repo, ['init', '--initial-branch=main']);
  git(repo, ['config', 'user.email', 'operations@example.invalid']);
  git(repo, ['config', 'user.name', 'SHIELD Operations']);
  await writeFile(join(repo, 'README.md'), 'base\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'base']);
  const base = git(repo, ['rev-parse', 'HEAD']);
  const manifest = {
    schemaVersion: 1,
    flightId: 'flight:test',
    objective: 'Test exact preflight contracts.',
    repository: { path: repo, baseRef: 'main', baseRevision: base },
    integration: { branch: 'integration/flight-test' },
    lanes: [{ id: 'alpha', chatLabel: 'Chat A', teamLabel: 'Team Alpha' }],
    missions: [{
      id: 'mission:a', slug: 'mission-a', title: 'A', library: 'library-a', lane: 'alpha', branch: 'spike/a', worktree,
      activationWave: 1, dependsOn: [], writablePaths: ['a/**'], scope: 'Test A.', deliverables: ['A'],
    }],
    evaluationContract: { fixtureId: 'nxt-449-planetpress-replacement-v1', version: 1, scorecard: ['maintenance'] },
  };
  const manifestPath = join(root, 'manifest.json');
  await writeFile(manifestPath, stableJson(manifest));
  await prepareFlight({
    manifestPath,
    outputPath: packageRoot,
    packageDependencies: process.platform === 'linux'
      ? undefined
      : { nativeNoReplaceSupported: true, runNativeNoReplaceMove: rename },
  });
  const planPath = join(packageRoot, 'flight-plan.resolved.json');
  const fixture = await buildFixture({ outputDirectory: fixtureRoot, runGhostscript: fakeGhostscript });
  const binding = {
    schemaVersion: 1,
    bindingType: 'feature-flight-fixture-binding',
    authority: 'none',
    flightId: manifest.flightId,
    fixtureId: fixture.manifest.fixtureId,
    fixtureVersion: fixture.manifest.fixtureVersion,
    classification: fixture.manifest.classification,
    containsCustomerData: fixture.manifest.containsCustomerData,
    manifestPath: fixture.manifestHash.path,
    manifestSha256: fixture.manifestHash.sha256,
  };
  await writeFile(join(packageRoot, 'fixture-binding.json'), stableJson(binding));
  if (createWorktree) git(repo, ['worktree', 'add', '-b', 'spike/a', worktree, base]);
  return { root, repo, worktree, packageRoot, fixtureRoot, planPath, base };
};

test('prep artifacts feed construction and doctor consumers without authority', async () => {
  const context = await setupPackage({ createWorktree: true });
  const construction = await checkConstruction({ planPath: context.planPath, requireCreated: true });
  assert.equal(construction.ok, true, construction.errors.join('\n'));
  assert.equal(construction.authority, 'none');
  assert.equal(construction.observations[0].status, 'created-clean');
  const doctor = await diagnoseFlight({ planPath: context.planPath });
  assert.equal(doctor.ok, true, doctor.errors.join('\n'));
  assert.equal(doctor.authority, 'none');
  assert.equal(doctor.fixture.verifiedFiles.length, 9);
});

test('assertPlan and doctor reject substituted producer-derived plan state', async () => {
  const context = await setupPackage();
  const original = JSON.parse(await readFile(context.planPath, 'utf8'));
  const mutations = [
    ['fake integration creation', (plan) => { plan.integration.status = 'created'; }, /integration\.status must equal declared-not-created/u],
    ['fake mission construction', (plan) => { plan.missions[0].constructionStatus = 'created'; }, /constructionStatus must equal planned-not-created/u],
    ['fake mission authority', (plan) => { plan.missions[0].authorityStatus = 'authorized'; }, /authorityStatus must equal not-initialized/u],
    ['false eligibility', (plan) => { plan.missions[0].initialEligibility = 'blocked-by-dependencies'; }, /initialEligibility does not match/u],
    ['duplicate lane', (plan) => { plan.lanes.push({ ...plan.lanes[0] }); }, /Duplicate lane ID/u],
    ['unknown mission lane', (plan) => { plan.missions[0].lane = 'unknown'; }, /references unknown lane/u],
    ['false dependency level', (plan) => { plan.missions[0].dependencyLevel = 1; }, /expected producer-derived level 0/u],
    ['false repository head', (plan) => { plan.repository.inspectedHead = 'f'.repeat(40); }, /inspectedHead must equal the exact base revision/u],
    ['invalid repository observation type', (plan) => { plan.repository.remoteUrl = false; }, /remoteUrl must be null or a non-empty string/u],
    ['recorded construction collision', (plan) => { plan.repository.collisions = ['fake collision']; }, /collisions must be empty/u],
    ['integration branch substitution', (plan) => { plan.integration.branch = plan.repository.inspectedBranch; }, /integration\.branch must differ from the inspected repository branch/u],
    ['mission branch substitution', (plan) => { plan.missions[0].branch = plan.repository.inspectedBranch; }, /mission:a branch must differ from the inspected repository branch/u],
    ['mission root substitution', (plan) => { plan.missions[0].worktree = plan.repository.root; }, /mission:a worktree must differ from the planning repository root/u],
    ['prototype notice substitution', (plan) => { plan.prototype.notice = 'AUTHORIZED'; }, /prototype\.notice must equal the fixed producer notice/u],
  ];
  for (const [label, mutate, pattern] of mutations) {
    const plan = structuredClone(original);
    mutate(plan);
    assert.throws(() => assertPlan(plan), pattern, `${label} must fail assertPlan`);
    await writeFile(context.planPath, stableJson(plan));
    await assert.rejects(diagnoseFlight({ planPath: context.planPath }), pattern, `${label} must fail doctor`);
  }
  await writeFile(context.planPath, stableJson(original));
});

test('assertPlan and doctor reject Darwin aliases of the planning repository root', { skip: process.platform !== 'darwin' }, async () => {
  const context = await setupPackage();
  const plan = JSON.parse(await readFile(context.planPath, 'utf8'));
  plan.missions[0].worktree = plan.repository.root.startsWith('/private/var/')
    ? plan.repository.root.replace(/^\/private\/var/u, '/var')
    : plan.repository.root.replace(/^\/var/u, '/private/var');
  assert.throws(() => assertPlan(plan), /mission:a worktree must differ from the planning repository root/u);
  await writeFile(context.planPath, stableJson(plan));
  await assert.rejects(diagnoseFlight({ planPath: context.planPath }), /mission:a worktree must differ from the planning repository root/u);
});

test('construction check independently rejects the planning repository as an observed mission root', async () => {
  const context = await setupPackage();
  const planBytes = await readFile(context.planPath);
  const plan = JSON.parse(planBytes.toString('utf8'));
  plan.missions[0].worktree = plan.repository.root;
  const construction = await checkConstruction({
    planPath: context.planPath,
    loadedPlan: {
      plan,
      snapshot: { path: context.planPath, size: planBytes.length, sha256: sha256(planBytes) },
    },
  });
  assert.equal(construction.ok, false);
  assert.equal(construction.observations[0].status, 'planning-repository-collision');
  assert.match(construction.errors.join('\n'), /observed mission root equals the currently inspected planning repository root/u);
});

test('construction check and doctor reject same-HEAD planning branch drift', async () => {
  const context = await setupPackage();
  git(context.repo, ['switch', '-c', 'planning-branch-drift']);
  const construction = await checkConstruction({ planPath: context.planPath });
  assert.equal(construction.ok, false);
  assert.match(construction.errors.join('\n'), /Planning repository branch drift: observed planning-branch-drift; expected main/u);
  const doctor = await diagnoseFlight({ planPath: context.planPath });
  assert.equal(doctor.ok, false);
  assert.match(doctor.errors.join('\n'), /Planning repository branch drift: observed planning-branch-drift; expected main/u);
});

test('construction check explicitly rejects stale HEAD and wrong ancestry', async () => {
  const stale = await setupPackage({ createWorktree: true });
  await writeFile(join(stale.worktree, 'later.txt'), 'later\n');
  git(stale.worktree, ['add', 'later.txt']);
  git(stale.worktree, ['commit', '-m', 'later']);
  const staleReport = await checkConstruction({ planPath: stale.planPath, requireCreated: true });
  assert.equal(staleReport.ok, false);
  assert.equal(staleReport.observations[0].status, 'stale-head');
  assert.match(staleReport.errors.join('\n'), /phase HEAD drift/u);

  const wrong = await setupPackage({ createWorktree: true });
  const tree = git(wrong.worktree, ['mktree']);
  const orphan = execFileSync('git', ['-C', wrong.worktree, 'commit-tree', tree, '-m', 'orphan'], {
    encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' },
  }).trim();
  git(wrong.worktree, ['reset', '--hard', orphan]);
  const wrongReport = await checkConstruction({ planPath: wrong.planPath, requireCreated: true });
  assert.equal(wrongReport.ok, false);
  assert.equal(wrongReport.observations[0].status, 'wrong-ancestry');
  assert.match(wrongReport.errors.join('\n'), /ancestry drift/u);
});

test('doctor requires bootstrap receipt, evaluation contract, and exact package closure', async () => {
  const missingReceipt = await setupPackage();
  await unlink(join(missingReceipt.packageRoot, 'bootstrap-receipt.json'));
  const receiptReport = await diagnoseFlight({ planPath: missingReceipt.planPath });
  assert.equal(receiptReport.ok, false);
  assert.match(receiptReport.errors.join('\n'), /Bootstrap receipt is required/u);

  const extra = await setupPackage();
  await writeFile(join(extra.packageRoot, 'extra.json'), '{}\n');
  const extraReport = await diagnoseFlight({ planPath: extra.planPath });
  assert.equal(extraReport.ok, false);
  assert.match(extraReport.errors.join('\n'), /Package closure drift/u);

  const missing = await setupPackage();
  await unlink(join(missing.packageRoot, 'README.md'));
  const missingReport = await diagnoseFlight({ planPath: missing.planPath });
  assert.equal(missingReport.ok, false);
  assert.match(missingReport.errors.join('\n'), /missing or unsafe|closure drift/iu);

  const openEvaluation = await setupPackage();
  const evaluationPath = join(openEvaluation.packageRoot, 'evaluation-contract.json');
  const evaluation = JSON.parse(await readFile(evaluationPath, 'utf8'));
  evaluation.unknown = true;
  await writeFile(evaluationPath, stableJson(evaluation));
  const evaluationReport = await diagnoseFlight({ planPath: openEvaluation.planPath });
  assert.equal(evaluationReport.ok, false);
  assert.match(evaluationReport.errors.join('\n'), /unknown field unknown/u);
});

test('doctor rejects traversing inventory entries and symlinked package artifacts', async () => {
  const traversing = await setupPackage();
  const bootstrapPath = join(traversing.packageRoot, 'bootstrap-receipt.json');
  const bootstrap = JSON.parse(await readFile(bootstrapPath, 'utf8'));
  bootstrap.generatedFiles[0].path = '../escape';
  await writeFile(bootstrapPath, stableJson(bootstrap));
  const traversalReport = await diagnoseFlight({ planPath: traversing.planPath });
  assert.equal(traversalReport.ok, false);
  assert.match(traversalReport.errors.join('\n'), /canonical POSIX-relative/u);

  bootstrap.generatedFiles[0].path = '/absolute-escape';
  await writeFile(bootstrapPath, stableJson(bootstrap));
  const absoluteReport = await diagnoseFlight({ planPath: traversing.planPath });
  assert.equal(absoluteReport.ok, false);
  assert.match(absoluteReport.errors.join('\n'), /canonical POSIX-relative/u);

  const linked = await setupPackage();
  const readme = join(linked.packageRoot, 'README.md');
  const outside = join(linked.root, 'outside.md');
  await writeFile(outside, 'outside\n');
  await unlink(readme);
  await symlink(outside, readme);
  const linkedReport = await diagnoseFlight({ planPath: linked.planPath });
  assert.equal(linkedReport.ok, false);
  assert.match(linkedReport.errors.join('\n'), /symlink|unsafe/iu);
});

test('doctor rejects absolute/traversing fixture entries and fixture symlinks', async () => {
  const context = await setupPackage();
  const manifestPath = join(context.fixtureRoot, 'fixture-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files[0].path = '../escape';
  await writeFile(manifestPath, stableJson(manifest));
  const bindingPath = join(context.packageRoot, 'fixture-binding.json');
  const binding = JSON.parse(await readFile(bindingPath, 'utf8'));
  binding.manifestSha256 = sha256(await readFile(manifestPath));
  await writeFile(bindingPath, stableJson(binding));
  const traversalReport = await diagnoseFlight({ planPath: context.planPath });
  assert.equal(traversalReport.ok, false);
  assert.match(traversalReport.errors.join('\n'), /canonical POSIX-relative/u);

  const linked = await setupPackage();
  const fixtureManifestPath = join(linked.fixtureRoot, 'fixture-manifest.json');
  const fixtureManifest = JSON.parse(await readFile(fixtureManifestPath, 'utf8'));
  const targetEntry = fixtureManifest.files[0];
  const targetPath = join(linked.fixtureRoot, targetEntry.path);
  const outside = join(linked.root, 'fixture-outside');
  await writeFile(outside, 'outside\n');
  await unlink(targetPath);
  await symlink(outside, targetPath);
  const linkedReport = await diagnoseFlight({ planPath: linked.planPath });
  assert.equal(linkedReport.ok, false);
  assert.match(linkedReport.errors.join('\n'), /symlink|unsafe/iu);
});

test('doctor rejects final and intermediate symlinks in supplied fixture manifest paths', async () => {
  const finalLink = await setupPackage();
  const finalBindingPath = join(finalLink.packageRoot, 'fixture-binding.json');
  const finalBinding = JSON.parse(await readFile(finalBindingPath, 'utf8'));
  const linkedManifest = join(finalLink.root, 'fixture-manifest-link.json');
  await symlink(finalBinding.manifestPath, linkedManifest);
  finalBinding.manifestPath = linkedManifest;
  await writeFile(finalBindingPath, stableJson(finalBinding));
  const finalReport = await diagnoseFlight({ planPath: finalLink.planPath });
  assert.equal(finalReport.ok, false);
  assert.match(finalReport.errors.join('\n'), /symlink component/u);

  const intermediateLink = await setupPackage();
  const intermediateBindingPath = join(intermediateLink.packageRoot, 'fixture-binding.json');
  const intermediateBinding = JSON.parse(await readFile(intermediateBindingPath, 'utf8'));
  const linkedFixtureRoot = join(intermediateLink.root, 'fixture-root-link');
  await symlink(intermediateLink.fixtureRoot, linkedFixtureRoot);
  intermediateBinding.manifestPath = join(linkedFixtureRoot, 'fixture-manifest.json');
  await writeFile(intermediateBindingPath, stableJson(intermediateBinding));
  const intermediateReport = await diagnoseFlight({ planPath: intermediateLink.planPath });
  assert.equal(intermediateReport.ok, false);
  assert.match(intermediateReport.errors.join('\n'), /symlink component/u);
});

test('doctor preserves Darwin /var and /private/var fixture path equivalence', { skip: process.platform !== 'darwin' }, async () => {
  const context = await setupPackage();
  const bindingPath = join(context.packageRoot, 'fixture-binding.json');
  const binding = JSON.parse(await readFile(bindingPath, 'utf8'));
  binding.manifestPath = binding.manifestPath.startsWith('/private/var/')
    ? binding.manifestPath.replace(/^\/private\/var/u, '/var')
    : binding.manifestPath.replace(/^\/var/u, '/private/var');
  await writeFile(bindingPath, stableJson(binding));
  const report = await diagnoseFlight({ planPath: context.planPath });
  assert.equal(report.ok, true, report.errors.join('\n'));
});
