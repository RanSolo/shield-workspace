#!/usr/bin/env node

import { lstat, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkConstruction, loadPlanSnapshot } from './construction-check.mjs';
import {
  SHA256_PATTERN,
  canonicalExistingPath,
  exactKeys,
  resolveContainedPath,
  snapshotFile,
  stableJson,
  writeNewFile,
} from './common.mjs';
import {
  TOOL_VERSION,
  canonicalRelativePath,
  validateEvaluationContract,
} from './flight-common.mjs';

const parseJsonSnapshot = (snapshot, label) => {
  try {
    return JSON.parse(snapshot.bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : error}`);
  }
};

const snapshotIdentity = (snapshot) => ({ path: snapshot.path, bytes: snapshot.size, sha256: snapshot.sha256 });

const expectedGeneratedPaths = (plan) => [
  'README.md',
  'flight-plan.resolved.json',
  'evaluation-contract.json',
  ...plan.missions.flatMap((mission) => [`packets/${mission.slug}.md`, `evidence/${mission.slug}.json`]),
];

const validateHashIdentity = (value, label, errors, { relativePath = false } = {}) => {
  if (!exactKeys(value, ['path', 'bytes', 'sha256'], label, errors)) return;
  if (relativePath) {
    if (canonicalRelativePath(value.path) !== value.path) errors.push(`${label}.path must be canonical POSIX-relative.`);
  } else if (!isAbsolute(value.path ?? '')) errors.push(`${label}.path must be absolute.`);
  if (!Number.isInteger(value.bytes) || value.bytes < 0) errors.push(`${label}.bytes must be a non-negative integer.`);
  if (!SHA256_PATTERN.test(value.sha256 ?? '')) errors.push(`${label}.sha256 must be a lowercase SHA-256 digest.`);
};

const validateRepositoryRecord = (value, label, errors) => {
  if (!exactKeys(value, ['root', 'remoteUrl', 'baseRef', 'baseRevision', 'inspectedHead', 'inspectedBranch', 'inspectedWorktreeClean', 'collisions'], label, errors)) return;
  if (!isAbsolute(value.root ?? '')) errors.push(`${label}.root must be absolute.`);
  if (!Array.isArray(value.collisions)) errors.push(`${label}.collisions must be an array.`);
};

const validateBootstrap = (receipt, plan) => {
  const errors = [];
  if (!exactKeys(receipt, ['schemaVersion', 'receiptType', 'flightId', 'generatedAt', 'authority', 'repository', 'manifest', 'tool', 'observations', 'generatedFiles'], 'bootstrap', errors)) return errors;
  if (receipt.schemaVersion !== 1 || receipt.receiptType !== 'feature-flight-bootstrap') errors.push('Bootstrap receipt contract/version is unsupported.');
  if (receipt.authority !== 'none') errors.push('Bootstrap receipt authority must equal none.');
  if (receipt.flightId !== plan.flightId) errors.push('Bootstrap receipt flightId does not match the plan.');
  validateRepositoryRecord(receipt.repository, 'bootstrap.repository', errors);
  if (stableJson(receipt.repository) !== stableJson(plan.repository)) errors.push('Bootstrap repository binding does not exactly match the plan.');
  validateHashIdentity(receipt.manifest, 'bootstrap.manifest', errors);
  if (exactKeys(receipt.tool, ['path', 'version', 'bytes', 'sha256'], 'bootstrap.tool', errors)) {
    if (!isAbsolute(receipt.tool.path ?? '') || receipt.tool.version !== TOOL_VERSION || !Number.isInteger(receipt.tool.bytes) || !SHA256_PATTERN.test(receipt.tool.sha256 ?? '')) errors.push('Bootstrap tool identity is invalid or unsupported.');
  }
  if (exactKeys(receipt.observations, ['initialEligibleMissions', 'stagedMissions', 'initiallyBlockedMissions', 'repositoryInspectionWasClean', 'collisions'], 'bootstrap.observations', errors)) {
    for (const field of ['initialEligibleMissions', 'stagedMissions', 'initiallyBlockedMissions', 'collisions']) {
      if (!Array.isArray(receipt.observations[field])) errors.push(`bootstrap.observations.${field} must be an array.`);
    }
    if (typeof receipt.observations.repositoryInspectionWasClean !== 'boolean') errors.push('bootstrap.observations.repositoryInspectionWasClean must be boolean.');
  }
  if (!Array.isArray(receipt.generatedFiles) || receipt.generatedFiles.length === 0) {
    errors.push('Bootstrap generatedFiles must be a non-empty exact inventory.');
  } else {
    for (const [index, artifact] of receipt.generatedFiles.entries()) validateHashIdentity(artifact, `bootstrap.generatedFiles[${index}]`, errors, { relativePath: true });
    const paths = receipt.generatedFiles.map((entry) => entry?.path);
    if (new Set(paths).size !== paths.length) errors.push('Bootstrap generatedFiles contains duplicate paths.');
    const expected = expectedGeneratedPaths(plan).sort();
    const actual = [...paths].sort();
    if (stableJson(actual) !== stableJson(expected)) errors.push(`Bootstrap inventory closure drift: expected [${expected.join(', ')}]; observed [${actual.join(', ')}].`);
  }
  return errors;
};

const validateFixtureBinding = (binding, plan) => {
  const errors = [];
  if (!exactKeys(binding, ['schemaVersion', 'bindingType', 'authority', 'flightId', 'fixtureId', 'fixtureVersion', 'classification', 'containsCustomerData', 'manifestPath', 'manifestSha256'], 'fixtureBinding', errors)) return errors;
  if (binding.schemaVersion !== 1 || binding.bindingType !== 'feature-flight-fixture-binding') errors.push('Fixture binding contract/version is unsupported.');
  if (binding.authority !== 'none') errors.push('Fixture binding authority must equal none.');
  if (binding.flightId !== plan.flightId) errors.push('Fixture binding flightId does not match the plan.');
  if (binding.fixtureId !== plan.evaluationContract.fixtureId) errors.push('Fixture binding fixtureId does not match the evaluation contract.');
  if (binding.fixtureVersion !== plan.evaluationContract.version) errors.push('Fixture binding version does not match the evaluation contract.');
  if (binding.classification !== 'synthetic-test-data' || binding.containsCustomerData !== false) errors.push('Fixture binding does not bind synthetic, customer-free data.');
  if (!isAbsolute(binding.manifestPath ?? '')) errors.push('Fixture binding manifestPath must be absolute.');
  if (!SHA256_PATTERN.test(binding.manifestSha256 ?? '')) errors.push('Fixture binding manifestSha256 is invalid.');
  return errors;
};

const validateFixtureManifest = (manifest) => {
  const errors = [];
  if (!exactKeys(manifest, ['schemaVersion', 'manifestType', 'fixtureId', 'fixtureVersion', 'classification', 'containsCustomerData', 'containsCredentials', 'assetProvenance', 'intendedUse', 'files'], 'fixtureManifest', errors)) return errors;
  if (manifest.schemaVersion !== 1 || manifest.manifestType !== 'synthetic-pdf-fixture') errors.push('Fixture manifest contract/version is unsupported.');
  if (manifest.classification !== 'synthetic-test-data' || manifest.containsCustomerData !== false || manifest.containsCredentials !== false) errors.push('Fixture manifest classification is invalid.');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) errors.push('Fixture manifest files must be a non-empty exact inventory.');
  else {
    for (const [index, entry] of manifest.files.entries()) validateHashIdentity(entry, `fixtureManifest.files[${index}]`, errors, { relativePath: true });
    const paths = manifest.files.map((entry) => entry?.path);
    if (new Set(paths).size !== paths.length) errors.push('Fixture manifest contains duplicate paths.');
  }
  return errors;
};

const validateFixtureReceipt = (receipt, manifestSnapshot, binding) => {
  const errors = [];
  if (!exactKeys(receipt, ['schemaVersion', 'receiptType', 'authority', 'fixtureId', 'fixtureVersion', 'manifest', 'tool', 'ghostscriptVersion'], 'fixtureReceipt', errors)) return errors;
  if (receipt.schemaVersion !== 1 || receipt.receiptType !== 'synthetic-fixture-build' || receipt.authority !== 'none') errors.push('Fixture build receipt contract/version/authority is unsupported.');
  if (receipt.fixtureId !== binding.fixtureId || receipt.fixtureVersion !== binding.fixtureVersion) errors.push('Fixture build receipt identity does not match its binding.');
  validateHashIdentity(receipt.manifest, 'fixtureReceipt.manifest', errors, { relativePath: true });
  if (receipt.manifest?.path !== 'fixture-manifest.json' || receipt.manifest?.bytes !== manifestSnapshot.size || receipt.manifest?.sha256 !== manifestSnapshot.sha256) errors.push('Fixture build receipt manifest digest binding changed.');
  if (exactKeys(receipt.tool, ['path', 'version', 'bytes', 'sha256'], 'fixtureReceipt.tool', errors)) {
    if (!isAbsolute(receipt.tool.path ?? '') || receipt.tool.version !== TOOL_VERSION || !Number.isInteger(receipt.tool.bytes) || !SHA256_PATTERN.test(receipt.tool.sha256 ?? '')) errors.push('Fixture build receipt tool identity is invalid or unsupported.');
  }
  if (typeof receipt.ghostscriptVersion !== 'string' || !/^\d+(?:\.\d+)+/u.test(receipt.ghostscriptVersion)) errors.push('Fixture build receipt Ghostscript version is invalid.');
  return errors;
};

const inventoryTree = async (root) => {
  const files = [];
  const directories = [];
  const symlinks = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const relativePath = relative(root, path).split('\\').join('/');
      const info = await lstat(path);
      if (info.isSymbolicLink()) symlinks.push(relativePath);
      else if (info.isDirectory()) {
        directories.push(relativePath);
        await walk(path);
      } else if (info.isFile()) files.push(relativePath);
      else symlinks.push(relativePath);
    }
  };
  await walk(root);
  return { files: files.sort(), directories: directories.sort(), symlinks: symlinks.sort() };
};

export const diagnoseFlight = async ({ planPath }) => {
  const loadedPlan = await loadPlanSnapshot(planPath);
  const { plan, snapshot: planSnapshot } = loadedPlan;
  const construction = await checkConstruction({ planPath, requireCreated: false, loadedPlan });
  const errors = [...construction.errors];
  const warnings = [];
  const packageDirectory = dirname(planSnapshot.path);
  const verifiedPackageFiles = [];
  let bootstrap;
  let fixture = null;

  const bootstrapPath = resolveContainedPath(packageDirectory, 'bootstrap-receipt.json');
  const evaluationPath = resolveContainedPath(packageDirectory, 'evaluation-contract.json');
  const bindingPath = resolveContainedPath(packageDirectory, 'fixture-binding.json');
  let bootstrapSnapshot;
  let evaluationSnapshot;
  let bindingSnapshot;

  try {
    bootstrapSnapshot = await snapshotFile(bootstrapPath);
    bootstrap = parseJsonSnapshot(bootstrapSnapshot, 'bootstrap-receipt.json');
    errors.push(...validateBootstrap(bootstrap, plan));
  } catch (error) {
    errors.push(`Bootstrap receipt is required and invalid or unavailable: ${error instanceof Error ? error.message : error}`);
  }

  try {
    evaluationSnapshot = await snapshotFile(evaluationPath);
    const evaluation = parseJsonSnapshot(evaluationSnapshot, 'evaluation-contract.json');
    errors.push(...validateEvaluationContract(evaluation, 'evaluationContract'));
    if (stableJson(evaluation) !== stableJson(plan.evaluationContract)) errors.push('Evaluation contract does not exactly match the resolved plan.');
  } catch (error) {
    errors.push(`Evaluation contract is required and invalid or unavailable: ${error instanceof Error ? error.message : error}`);
  }

  if (bootstrap?.generatedFiles && Array.isArray(bootstrap.generatedFiles)) {
    const preloaded = new Map([
      ['flight-plan.resolved.json', planSnapshot],
      ...(evaluationSnapshot ? [['evaluation-contract.json', evaluationSnapshot]] : []),
    ]);
    for (const artifact of bootstrap.generatedFiles) {
      if (canonicalRelativePath(artifact?.path) !== artifact?.path) continue;
      try {
        const artifactSnapshot = preloaded.get(artifact.path) ?? await snapshotFile(resolveContainedPath(packageDirectory, artifact.path));
        verifiedPackageFiles.push(snapshotIdentity(artifactSnapshot));
        if (artifactSnapshot.size !== artifact.bytes || artifactSnapshot.sha256 !== artifact.sha256) {
          errors.push(`Bootstrap artifact identity changed: ${artifact.path}`);
        }
      } catch (error) {
        errors.push(`Bootstrap artifact is missing or unsafe: ${artifact.path}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  let binding;
  try {
    bindingSnapshot = await snapshotFile(bindingPath);
    binding = parseJsonSnapshot(bindingSnapshot, 'fixture-binding.json');
    errors.push(...validateFixtureBinding(binding, plan));
  } catch (error) {
    errors.push(`Fixture binding is required and invalid or unavailable: ${error instanceof Error ? error.message : error}`);
  }

  if (binding && isAbsolute(binding.manifestPath ?? '')) {
    try {
      const canonicalManifestPath = await canonicalExistingPath(binding.manifestPath);
      const manifestSnapshot = await snapshotFile(canonicalManifestPath);
      const manifest = parseJsonSnapshot(manifestSnapshot, 'fixture manifest');
      errors.push(...validateFixtureManifest(manifest));
      if (manifestSnapshot.sha256 !== binding.manifestSha256) errors.push('Fixture manifest SHA-256 does not match its binding.');
      if (manifest.fixtureId !== binding.fixtureId || manifest.fixtureVersion !== binding.fixtureVersion) errors.push('Fixture manifest identity does not match its binding.');
      const fixtureRoot = dirname(manifestSnapshot.path);
      const verifiedFiles = [];
      for (const entry of (Array.isArray(manifest.files) ? manifest.files : [])) {
        if (canonicalRelativePath(entry?.path) !== entry?.path) continue;
        try {
          const entrySnapshot = await snapshotFile(resolveContainedPath(fixtureRoot, entry.path));
          verifiedFiles.push(snapshotIdentity(entrySnapshot));
          if (entrySnapshot.size !== entry.bytes || entrySnapshot.sha256 !== entry.sha256) errors.push(`Fixture artifact identity changed: ${entry.path}`);
        } catch (error) {
          errors.push(`Fixture artifact is missing or unsafe: ${entry.path}: ${error instanceof Error ? error.message : error}`);
        }
      }
      const receiptPath = resolveContainedPath(fixtureRoot, 'build-receipt.json');
      const receiptSnapshot = await snapshotFile(receiptPath);
      const receipt = parseJsonSnapshot(receiptSnapshot, 'fixture build receipt');
      errors.push(...validateFixtureReceipt(receipt, manifestSnapshot, binding));
      const fixtureTree = await inventoryTree(fixtureRoot);
      const expectedFixtureFiles = [
        ...(Array.isArray(manifest.files) ? manifest.files.map((entry) => entry?.path) : []),
        'fixture-manifest.json', 'build-receipt.json',
      ].sort();
      if (fixtureTree.symlinks.length > 0) errors.push(`Fixture contains symlink or non-regular entries: ${fixtureTree.symlinks.join(', ')}.`);
      if (stableJson(fixtureTree.files) !== stableJson(expectedFixtureFiles) || fixtureTree.directories.length > 0) {
        errors.push(`Fixture package closure drift: expected [${expectedFixtureFiles.join(', ')}]; observed [${fixtureTree.files.join(', ')}].`);
      }
      fixture = {
        binding: snapshotIdentity(bindingSnapshot), manifest: snapshotIdentity(manifestSnapshot),
        receipt: snapshotIdentity(receiptSnapshot), verifiedFiles,
      };
    } catch (error) {
      errors.push(`Fixture package is invalid or unavailable: ${error instanceof Error ? error.message : error}`);
    }
  }

  try {
    const packageTree = await inventoryTree(packageDirectory);
    const expectedFiles = [...expectedGeneratedPaths(plan), 'bootstrap-receipt.json', 'fixture-binding.json'].sort();
    const expectedDirectories = ['evidence', 'packets'];
    if (packageTree.symlinks.length > 0) errors.push(`Package contains symlink or non-regular entries: ${packageTree.symlinks.join(', ')}.`);
    if (stableJson(packageTree.files) !== stableJson(expectedFiles) || stableJson(packageTree.directories) !== stableJson(expectedDirectories)) {
      errors.push(`Package closure drift: expected files [${expectedFiles.join(', ')}]; observed [${packageTree.files.join(', ')}].`);
    }
  } catch (error) {
    errors.push(`Package closure could not be inspected: ${error instanceof Error ? error.message : error}`);
  }

  if (plan.repository.collisions.length > 0) errors.push(...plan.repository.collisions.map((collision) => `Recorded construction collision: ${collision}`));
  return {
    schemaVersion: 1,
    reportType: 'flight-doctor',
    authority: 'none',
    tool: { name: 'flight-doctor', version: TOOL_VERSION },
    flightId: plan.flightId,
    plan: snapshotIdentity(planSnapshot),
    ok: errors.length === 0,
    errors,
    warnings,
    repository: construction.repository,
    construction: construction.observations,
    verifiedPackageFiles,
    fixture,
  };
};

const main = async () => {
  const argv = process.argv.slice(2);
  let planPath;
  let output;
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === '--plan') planPath = argv.shift();
    else if (flag === '--output') output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!planPath) throw new Error('Usage: shield-ops flight doctor --plan FILE [--output NEW_FILE]');
  const report = await diagnoseFlight({ planPath });
  const json = stableJson(report);
  if (output) await writeNewFile(output, json);
  process.stdout.write(json);
  if (!report.ok) process.exitCode = 2;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
