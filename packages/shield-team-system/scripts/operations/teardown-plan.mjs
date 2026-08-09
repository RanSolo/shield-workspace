#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { lstat, readlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SHA256_PATTERN,
  canonicalExistingPath,
  exactKeys,
  git,
  inspectGit,
  nonEmptyString,
  readJsonSnapshot,
  sha256,
  snapshotFile,
  stableJson,
  writeNewFile,
} from './common.mjs';
import { assertPlan, canonicalRelativePath, GIT_REVISION_PATTERN } from './flight-common.mjs';
import { artifactIdentity } from './handoff-state.mjs';

export const TEARDOWN_REPORT_TYPE = 'feature-flight-teardown-plan';
export const TEARDOWN_REPORT_NOTICE = 'Read-only recovery plan. No worktree, branch, file, archive, or evidence was removed or changed.';
export const TEARDOWN_REPORT_TOOL_VERSION = '1.0.0';
const ARCHIVE_TYPE = 'feature-flight-recovery-archive';

const splitNull = (value) => value.split('\0').filter((item) => item !== '');

const validateArtifactIdentity = (value, label, errors) => {
  if (!exactKeys(value, ['path', 'bytes', 'sha256'], label, errors)) return;
  if (!nonEmptyString(value.path) || !Number.isSafeInteger(value.bytes) || value.bytes < 0 ||
      !SHA256_PATTERN.test(value.sha256 ?? '')) errors.push(`${label} is malformed.`);
};

const validateInventoryEntry = (entry, label, errors) => {
  if (!exactKeys(entry, ['path', 'category', 'kind', 'bytes', 'sha256', 'recordedAtHead'], label, errors)) return;
  if (!nonEmptyString(entry.path) || !['tracked', 'untracked', 'ignored'].includes(entry.category) ||
      !['regular', 'symlink', 'missing', 'unsupported'].includes(entry.kind) ||
      (entry.bytes !== null && (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0)) ||
      (entry.sha256 !== null && !SHA256_PATTERN.test(entry.sha256)) || typeof entry.recordedAtHead !== 'boolean') {
    errors.push(`${label} is malformed.`);
  }
};

const validateArchive = (archive) => {
  const errors = [];
  if (!exactKeys(archive, [
    'schemaVersion', 'archiveType', 'authority', 'flightId', 'missionId', 'repository',
    'files', 'createdAt', 'tool',
  ], 'archive', errors)) return errors;
  if (archive.schemaVersion !== 1 || archive.archiveType !== ARCHIVE_TYPE || archive.authority !== 'none') errors.push('Archive evidence contract is unsupported.');
  if (!nonEmptyString(archive.flightId) || !nonEmptyString(archive.missionId)) errors.push('Archive identity is malformed.');
  if (exactKeys(archive.repository, ['root', 'worktree', 'branch', 'head'], 'archive.repository', errors) &&
      (![archive.repository.root, archive.repository.worktree, archive.repository.branch].every(nonEmptyString) ||
       !GIT_REVISION_PATTERN.test(archive.repository.head ?? ''))) errors.push('Archive repository identity is malformed.');
  if (!Array.isArray(archive.files)) errors.push('archive.files must be an array.');
  const fileIdentities = new Set();
  for (const [index, file] of (Array.isArray(archive.files) ? archive.files : []).entries()) {
    const label = `archive.files[${index}]`;
    if (!exactKeys(file, ['path', 'category', 'kind', 'bytes', 'sha256'], label, errors)) continue;
    if (canonicalRelativePath(file.path) !== file.path || !['tracked', 'untracked', 'ignored'].includes(file.category) ||
        !['regular', 'symlink'].includes(file.kind) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
        !SHA256_PATTERN.test(file.sha256 ?? '')) errors.push(`${label} is malformed.`);
    const identity = `${file.category}\0${file.path}`;
    if (fileIdentities.has(identity)) errors.push(`${label} duplicates archive file identity ${file.category}:${file.path}.`);
    fileIdentities.add(identity);
  }
  if (!nonEmptyString(archive.createdAt) || Number.isNaN(Date.parse(archive.createdAt))) errors.push('archive.createdAt must be a timestamp string.');
  if (exactKeys(archive.tool, ['name', 'version'], 'archive.tool', errors) &&
      (!nonEmptyString(archive.tool.name) || !nonEmptyString(archive.tool.version))) errors.push('archive.tool is malformed.');
  return errors;
};

export const validateTeardownReport = (report) => {
  const errors = [];
  if (!exactKeys(report, [
    'schemaVersion', 'reportType', 'authority', 'notice', 'tool', 'plannedAt', 'flightId',
    'plan', 'integrationRef', 'integrationRevision', 'archiveEvidence', 'worktrees',
  ], 'report', errors)) return errors;
  if (report.schemaVersion !== 2 || report.reportType !== TEARDOWN_REPORT_TYPE) errors.push('Teardown report contract is unsupported.');
  if (report.authority !== 'none' || report.notice !== TEARDOWN_REPORT_NOTICE) errors.push('Teardown report authority or notice is unsupported.');
  if (exactKeys(report.tool, ['name', 'version'], 'report.tool', errors) &&
      (report.tool.name !== 'teardown-plan' || report.tool.version !== TEARDOWN_REPORT_TOOL_VERSION)) errors.push('Teardown report producer is unsupported.');
  if (!nonEmptyString(report.plannedAt) || Number.isNaN(Date.parse(report.plannedAt))) errors.push('report.plannedAt must be a timestamp string.');
  if (!nonEmptyString(report.flightId) || !nonEmptyString(report.integrationRef) ||
      (report.integrationRevision !== null && !GIT_REVISION_PATTERN.test(report.integrationRevision ?? ''))) errors.push('Teardown report flight or integration identity is malformed.');
  validateArtifactIdentity(report.plan, 'report.plan', errors);
  if (!Array.isArray(report.archiveEvidence)) errors.push('report.archiveEvidence must be an array.');
  for (const [index, item] of (Array.isArray(report.archiveEvidence) ? report.archiveEvidence : []).entries()) {
    const label = `report.archiveEvidence[${index}]`;
    if (!exactKeys(item, ['missionId', 'source'], label, errors)) continue;
    if (!nonEmptyString(item.missionId)) errors.push(`${label}.missionId is malformed.`);
    validateArtifactIdentity(item.source, `${label}.source`, errors);
  }
  if (!Array.isArray(report.worktrees)) errors.push('report.worktrees must be an array.');
  for (const [index, item] of (Array.isArray(report.worktrees) ? report.worktrees : []).entries()) {
    const label = `report.worktrees[${index}]`;
    if (!exactKeys(item, [
      'missionId', 'path', 'disposition', 'recoverable', 'observed', 'refEvidence', 'inventory',
      'unrecordedArtifacts', 'archiveEvidence', 'integration',
    ], label, errors)) continue;
    if (![item.missionId, item.path, item.disposition].every(nonEmptyString) ||
        ![true, false, null].includes(item.recoverable)) errors.push(`${label} identity or recoverability is malformed.`);
    if (item.observed !== null && exactKeys(item.observed, ['branch', 'head', 'clean'], `${label}.observed`, errors) &&
        ((item.observed.branch !== null && !nonEmptyString(item.observed.branch)) ||
         !GIT_REVISION_PATTERN.test(item.observed.head ?? '') || typeof item.observed.clean !== 'boolean')) errors.push(`${label}.observed is malformed.`);
    if (item.refEvidence !== null && exactKeys(item.refEvidence, ['ref', 'revision', 'matchesHead'], `${label}.refEvidence`, errors) &&
        (!nonEmptyString(item.refEvidence.ref) || !GIT_REVISION_PATTERN.test(item.refEvidence.revision ?? '') ||
         typeof item.refEvidence.matchesHead !== 'boolean')) errors.push(`${label}.refEvidence is malformed.`);
    if (!Array.isArray(item.inventory)) errors.push(`${label}.inventory must be an array.`);
    for (const [fileIndex, entry] of (Array.isArray(item.inventory) ? item.inventory : []).entries()) validateInventoryEntry(entry, `${label}.inventory[${fileIndex}]`, errors);
    if (!Array.isArray(item.unrecordedArtifacts)) errors.push(`${label}.unrecordedArtifacts must be an array.`);
    for (const [fileIndex, entry] of (Array.isArray(item.unrecordedArtifacts) ? item.unrecordedArtifacts : []).entries()) validateInventoryEntry(entry, `${label}.unrecordedArtifacts[${fileIndex}]`, errors);
    if (item.archiveEvidence !== null && exactKeys(item.archiveEvidence, ['source', 'matched'], `${label}.archiveEvidence`, errors)) {
      validateArtifactIdentity(item.archiveEvidence.source, `${label}.archiveEvidence.source`, errors);
      if (typeof item.archiveEvidence.matched !== 'boolean') errors.push(`${label}.archiveEvidence.matched must be boolean.`);
    }
    if (item.integration !== null && exactKeys(item.integration, ['ref', 'revision', 'containsHead'], `${label}.integration`, errors) &&
        (!nonEmptyString(item.integration.ref) || (item.integration.revision !== null && !GIT_REVISION_PATTERN.test(item.integration.revision ?? '')) ||
         typeof item.integration.containsHead !== 'boolean')) errors.push(`${label}.integration is malformed.`);
  }
  return errors;
};

const inventoryFile = async (worktree, path, category, recordedAtHead) => {
  const absolutePath = resolve(worktree, path);
  const info = await lstat(absolutePath).catch(() => undefined);
  if (!info) return { path, category, kind: 'missing', bytes: null, sha256: null, recordedAtHead };
  if (info.isSymbolicLink()) {
    const target = await readlink(absolutePath);
    return { path, category, kind: 'symlink', bytes: Buffer.byteLength(target), sha256: sha256(target), recordedAtHead };
  }
  if (!info.isFile()) return { path, category, kind: 'unsupported', bytes: null, sha256: null, recordedAtHead };
  if (recordedAtHead) return { path, category, kind: 'regular', bytes: null, sha256: null, recordedAtHead };
  try {
    const snapshot = await snapshotFile(absolutePath);
    return { path, category, kind: 'regular', bytes: snapshot.size, sha256: snapshot.sha256, recordedAtHead };
  } catch {
    return { path, category, kind: 'unsupported', bytes: null, sha256: null, recordedAtHead };
  }
};

const inventoryWorktree = async (worktree) => {
  const tracked = splitNull(git(worktree, ['ls-files', '-z']));
  const untracked = splitNull(git(worktree, ['ls-files', '--others', '--exclude-standard', '-z']));
  const ignored = splitNull(git(worktree, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z']));
  const modified = new Set([
    ...splitNull(git(worktree, ['diff', '--name-only', '-z'])),
    ...splitNull(git(worktree, ['diff', '--cached', '--name-only', '-z'])),
  ]);
  const entries = [];
  for (const path of tracked) entries.push(await inventoryFile(worktree, path, 'tracked', !modified.has(path)));
  for (const path of untracked) entries.push(await inventoryFile(worktree, path, 'untracked', false));
  for (const path of ignored) entries.push(await inventoryFile(worktree, path, 'ignored', false));
  entries.sort((left, right) => `${left.path}\0${left.category}`.localeCompare(`${right.path}\0${right.category}`));
  const unrecorded = entries.filter((entry) =>
    !entry.recordedAtHead && entry.kind !== 'missing' && entry.bytes !== null && entry.sha256 !== null);
  return { entries, unrecorded };
};

const archiveMatches = (archive, plan, mission, observed, unrecorded) => {
  if (archive.flightId !== plan.flightId || archive.missionId !== mission.id ||
      archive.repository?.root !== plan.repository.root || archive.repository?.worktree !== mission.worktree ||
      archive.repository?.branch !== mission.branch || archive.repository?.head !== observed.head) return false;
  const expected = unrecorded.map(({ path, category, kind, bytes, sha256 }) => ({ path, category, kind, bytes, sha256 }));
  const sort = (items) => [...items].sort((left, right) => `${left.path}\0${left.category}`.localeCompare(`${right.path}\0${right.category}`));
  return JSON.stringify(sort(archive.files ?? [])) === JSON.stringify(sort(expected));
};

export const planTeardown = async ({ planPath, integrationRef, archiveEvidencePaths = [] }) => {
  const [planSnapshot, ...archiveSnapshots] = await Promise.all([
    readJsonSnapshot(planPath),
    ...archiveEvidencePaths.map((path) => readJsonSnapshot(path)),
  ]);
  const plan = assertPlan(planSnapshot.value);
  const resolvedIntegrationRef = integrationRef ?? plan.integration.branch;
  let integrationRevision = null;
  try { integrationRevision = git(plan.repository.root, ['rev-parse', '--verify', `${resolvedIntegrationRef}^{commit}`]); } catch {}

  const archives = new Map();
  const archiveRecords = [];
  for (const snapshot of archiveSnapshots) {
    const archiveErrors = validateArchive(snapshot.value);
    if (archiveErrors.length > 0) throw new Error(`Invalid archive evidence ${snapshot.path}:\n- ${archiveErrors.join('\n- ')}`);
    const missionId = snapshot.value.missionId;
    if (archives.has(missionId)) throw new Error(`Ambiguous archive evidence: multiple archives supplied for ${missionId}.`);
    archives.set(missionId, { archive: snapshot.value, source: artifactIdentity(snapshot) });
    archiveRecords.push({ missionId, source: artifactIdentity(snapshot) });
  }

  const worktrees = [];
  for (const mission of plan.missions) {
    const path = mission.worktree;
    const archiveEntry = archives.get(mission.id);
    if (!existsSync(path)) {
      worktrees.push({
        missionId: mission.id,
        path,
        disposition: archiveEntry ? 'preserve-ambiguous-recoverability' : 'already-absent',
        recoverable: archiveEntry ? false : null,
        observed: null,
        refEvidence: null,
        inventory: [],
        unrecordedArtifacts: [],
        archiveEvidence: archiveEntry ? { source: archiveEntry.source, matched: false } : null,
        integration: null,
      });
      continue;
    }
    const canonical = await canonicalExistingPath(path).catch(() => undefined);
    const observed = canonical === path ? inspectGit(path) : null;
    if (!observed || observed.root !== path) {
      worktrees.push({
        missionId: mission.id,
        path,
        disposition: 'preserve-path-collision',
        recoverable: false,
        observed: null,
        refEvidence: null,
        inventory: [],
        unrecordedArtifacts: [],
        archiveEvidence: archiveEntry ? { source: archiveEntry.source, matched: false } : null,
        integration: null,
      });
      continue;
    }
    const { entries, unrecorded } = await inventoryWorktree(path);
    const observedRecord = { branch: observed.branch, head: observed.head, clean: observed.clean };
    let branchRevision = null;
    try { branchRevision = git(path, ['rev-parse', '--verify', `refs/heads/${mission.branch}^{commit}`]); } catch {}
    const refEvidence = branchRevision ? {
      ref: `refs/heads/${mission.branch}`,
      revision: branchRevision,
      matchesHead: branchRevision === observed.head,
    } : null;
    let containsHead = false;
    if (integrationRevision) {
      try {
        git(path, ['merge-base', '--is-ancestor', observed.head, integrationRevision]);
        containsHead = true;
      } catch {}
    }
    const integration = { ref: resolvedIntegrationRef, revision: integrationRevision, containsHead };
    const archiveMatched = archiveEntry ? archiveMatches(archiveEntry.archive, plan, mission, observed, unrecorded) : false;
    const archiveEvidence = archiveEntry ? { source: archiveEntry.source, matched: archiveMatched } : null;

    let disposition;
    let recoverable;
    if (observed.branch !== mission.branch) {
      disposition = 'preserve-wrong-branch';
      recoverable = false;
    } else if (!refEvidence?.matchesHead) {
      disposition = 'preserve-missing-exact-ref';
      recoverable = false;
    } else if (archiveEntry && !archiveMatched) {
      disposition = 'preserve-ambiguous-recoverability';
      recoverable = false;
    } else if (unrecorded.length > 0 && !archiveMatched) {
      disposition = 'preserve-unrecorded-artifacts';
      recoverable = false;
    } else if (!observed.clean) {
      disposition = 'preserve-dirty';
      recoverable = true;
    } else if (!containsHead) {
      disposition = 'retain-clean-unintegrated';
      recoverable = true;
    } else {
      disposition = 'eligible-for-human-confirmed-removal';
      recoverable = true;
    }
    worktrees.push({
      missionId: mission.id,
      path,
      disposition,
      recoverable,
      observed: observedRecord,
      refEvidence,
      inventory: entries,
      unrecordedArtifacts: unrecorded,
      archiveEvidence,
      integration,
    });
  }

  for (const missionId of archives.keys()) {
    if (!plan.missions.some((mission) => mission.id === missionId)) throw new Error(`Unexpected archive evidence for non-mission ${missionId}.`);
  }
  const report = {
    schemaVersion: 2,
    reportType: TEARDOWN_REPORT_TYPE,
    authority: 'none',
    notice: TEARDOWN_REPORT_NOTICE,
    tool: { name: 'teardown-plan', version: TEARDOWN_REPORT_TOOL_VERSION },
    plannedAt: new Date().toISOString(),
    flightId: plan.flightId,
    plan: artifactIdentity(planSnapshot),
    integrationRef: resolvedIntegrationRef,
    integrationRevision,
    archiveEvidence: archiveRecords.sort((left, right) => left.missionId.localeCompare(right.missionId)),
    worktrees,
  };
  const reportErrors = validateTeardownReport(report);
  if (reportErrors.length > 0) throw new Error(`Produced invalid teardown report:\n- ${reportErrors.join('\n- ')}`);
  return report;
};

const parseArguments = (argv) => {
  const options = { archiveEvidencePaths: [] };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === '--plan') options.planPath = argv.shift();
    else if (flag === '--integration-ref') options.integrationRef = argv.shift();
    else if (flag === '--archive-evidence') options.archiveEvidencePaths.push(argv.shift());
    else if (flag === '--output') options.output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.planPath) throw new Error('Usage: teardown-plan.mjs --plan FILE [--integration-ref REF] [--archive-evidence FILE]... [--output NEW_FILE]');
  return options;
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const report = await planTeardown(options);
  const json = stableJson(report);
  if (options.output) await writeNewFile(options.output, json);
  process.stdout.write(json);
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
