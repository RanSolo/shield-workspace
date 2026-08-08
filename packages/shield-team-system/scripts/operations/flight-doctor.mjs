#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkConstruction } from './construction-check.mjs';
import { assertPlan } from './flight-common.mjs';
import { hashFile, inspectGit, readJson, stableJson, writeNewFile } from './common.mjs';

const TOOL_VERSION = '0.1.0-local-prototype';

export const diagnoseFlight = async ({ planPath }) => {
  const plan = assertPlan(await readJson(planPath));
  const construction = await checkConstruction({ planPath, requireCreated: false });
  const errors = [...construction.errors];
  const warnings = [];
  const packageDirectory = dirname(resolve(planPath));
  const bootstrapPath = join(packageDirectory, 'bootstrap-receipt.json');
  const packageFiles = [];
  let fixture = null;
  if (existsSync(bootstrapPath)) {
    const bootstrap = await readJson(bootstrapPath);
    if (bootstrap.flightId !== plan.flightId) errors.push('Bootstrap receipt flightId does not match the plan.');
    for (const artifact of bootstrap.generatedFiles ?? []) {
      const path = join(packageDirectory, artifact.path);
      if (!existsSync(path)) errors.push(`Bootstrap artifact is missing: ${artifact.path}`);
      else {
        const actual = await hashFile(path);
        packageFiles.push(actual);
        if (actual.sha256 !== artifact.sha256) errors.push(`Bootstrap artifact hash changed: ${artifact.path}`);
      }
    }
  } else warnings.push('No bootstrap-receipt.json exists beside the plan.');

  if (plan.evaluationContract?.fixtureId) {
    const bindingPath = join(packageDirectory, 'fixture-binding.json');
    if (!existsSync(bindingPath)) {
      errors.push(`Flight names fixture ${plan.evaluationContract.fixtureId} but has no fixture-binding.json.`);
    } else {
      const binding = await readJson(bindingPath);
      if (binding.flightId !== plan.flightId) errors.push('Fixture binding flightId does not match the plan.');
      if (binding.fixtureId !== plan.evaluationContract.fixtureId) errors.push('Fixture binding fixtureId does not match the evaluation contract.');
      if (binding.fixtureVersion !== plan.evaluationContract.version) errors.push('Fixture binding version does not match the evaluation contract.');
      if (binding.classification !== 'synthetic-test-data' || binding.containsCustomerData !== false) {
        errors.push('Fixture binding does not prove synthetic, customer-free data.');
      }
      if (!existsSync(binding.manifestPath ?? '')) {
        errors.push(`Fixture manifest is unavailable: ${binding.manifestPath}`);
      } else {
        const manifestSource = await hashFile(binding.manifestPath);
        if (manifestSource.sha256 !== binding.manifestSha256) errors.push('Fixture manifest SHA-256 does not match its binding.');
        const manifest = await readJson(binding.manifestPath);
        if (manifest.fixtureId !== binding.fixtureId || manifest.fixtureVersion !== binding.fixtureVersion) {
          errors.push('Fixture manifest identity does not match its binding.');
        }
        const verifiedFiles = [];
        for (const entry of manifest.files ?? []) {
          const path = join(dirname(resolve(binding.manifestPath)), entry.path);
          if (!existsSync(path)) errors.push(`Fixture artifact is missing: ${entry.path}`);
          else {
            const actual = await hashFile(path);
            verifiedFiles.push(actual);
            if (actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes) {
              errors.push(`Fixture artifact identity changed: ${entry.path}`);
            }
          }
        }
        fixture = { binding: await hashFile(bindingPath), manifest: manifestSource, verifiedFiles };
      }
    }
  }

  const repository = inspectGit(plan.repository?.root ?? '');
  if (!repository) errors.push(`Planned repository is unavailable: ${plan.repository?.root}`);
  else {
    if (repository.root !== resolve(plan.repository.root)) errors.push('Planned repository root resolves elsewhere.');
    if (repository.dirty) warnings.push('Planning repository is dirty; do not infer an exact construction base from the working tree.');
  }
  if (plan.repository?.collisions?.length > 0) errors.push(...plan.repository.collisions);

  return {
    schemaVersion: 1,
    reportType: 'flight-doctor',
    authority: 'none',
    tool: { name: 'flight-doctor', version: TOOL_VERSION },
    flightId: plan.flightId,
    plan: await hashFile(planPath),
    ok: errors.length === 0,
    errors,
    warnings,
    repository,
    construction: construction.observations,
    verifiedPackageFiles: packageFiles,
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
  if (!planPath) throw new Error('Usage: flight-doctor.mjs --plan FILE [--output FILE]');
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
