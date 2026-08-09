#!/usr/bin/env node

import { Buffer } from 'node:buffer';
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
import {
  assertOutputOutsideFlightWorktrees,
  compareUtf8,
  inspectExternalArtifactPath,
  readNullDelimitedGitPaths,
} from './convergence-common.mjs';

export const TEARDOWN_REPORT_TYPE = 'feature-flight-teardown-plan';
export const TEARDOWN_REPORT_NOTICE = 'Read-only recovery plan. No worktree, branch, file, archive, or evidence was removed or changed.';
export const TEARDOWN_REPORT_TOOL_VERSION = '1.0.0';
export const ARCHIVE_TYPE = 'feature-flight-recovery-archive';
export const ARCHIVE_PAYLOAD_TYPE = 'feature-flight-recovery-payload';
export const ARCHIVE_PAYLOAD_FORMAT = 'json-base64-v1';

const fileIdentityKey = (item) => `${item.path}\0${item.category}`;
const orderedFiles = (items) => [...items].sort((left, right) => compareUtf8(fileIdentityKey(left), fileIdentityKey(right)));

const validateArtifactIdentity = (value, label, errors) => {
  if (!exactKeys(value, ['path', 'bytes', 'sha256'], label, errors)) return;
  if (!nonEmptyString(value.path) || !Number.isSafeInteger(value.bytes) || value.bytes < 0 ||
      !SHA256_PATTERN.test(value.sha256 ?? '')) errors.push(`${label} is malformed.`);
};

const validateInventoryEntry = (entry, label, errors) => {
  if (!exactKeys(entry, ['path', 'category', 'kind', 'bytes', 'sha256', 'recordedAtHead'], label, errors)) return;
  if (canonicalRelativePath(entry.path) !== entry.path || !['tracked', 'untracked', 'ignored'].includes(entry.category) ||
      !['regular', 'symlink', 'missing', 'unsupported'].includes(entry.kind) ||
      (entry.bytes !== null && (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0)) ||
      (entry.sha256 !== null && !SHA256_PATTERN.test(entry.sha256)) || typeof entry.recordedAtHead !== 'boolean') {
    errors.push(`${label} is malformed.`);
  }
};

const validateArchivedFile = (file, label, errors, { payload = false } = {}) => {
  const fields = ['path', 'category', 'kind', 'bytes', 'sha256', ...(payload ? ['contentBase64'] : [])];
  if (!exactKeys(file, fields, label, errors)) return;
  if (canonicalRelativePath(file.path) !== file.path || !['tracked', 'untracked', 'ignored'].includes(file.category) ||
      !['regular', 'symlink'].includes(file.kind) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
      !SHA256_PATTERN.test(file.sha256 ?? '')) errors.push(`${label} identity is malformed.`);
  if (payload) {
    if (typeof file.contentBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(file.contentBase64)) {
      errors.push(`${label}.contentBase64 must be canonical base64.`);
    } else {
      const bytes = Buffer.from(file.contentBase64, 'base64');
      if (bytes.toString('base64') !== file.contentBase64 || bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
        errors.push(`${label}.contentBase64 does not match its byte count and digest.`);
      }
    }
  }
};

const validateUniqueFiles = (files, label, errors, options) => {
  if (!Array.isArray(files)) {
    errors.push(`${label} must be an array.`);
    return;
  }
  const identities = new Set();
  for (const [index, file] of files.entries()) {
    validateArchivedFile(file, `${label}[${index}]`, errors, options);
    const identity = fileIdentityKey(file);
    if (identities.has(identity)) errors.push(`${label}[${index}] duplicates ${file.category}:${file.path}.`);
    identities.add(identity);
  }
};

export const validateArchive = (archive) => {
  const errors = [];
  if (!exactKeys(archive, [
    'schemaVersion', 'archiveType', 'authority', 'flightId', 'missionId', 'repository',
    'payload', 'files', 'createdAt', 'tool',
  ], 'archive', errors)) return errors;
  if (archive.schemaVersion !== 1 || archive.archiveType !== ARCHIVE_TYPE || archive.authority !== 'none') errors.push('Archive evidence contract is unsupported.');
  if (!nonEmptyString(archive.flightId) || !nonEmptyString(archive.missionId)) errors.push('Archive identity is malformed.');
  if (exactKeys(archive.repository, ['root', 'worktree', 'branch', 'head'], 'archive.repository', errors) &&
      (![archive.repository.root, archive.repository.worktree, archive.repository.branch].every(nonEmptyString) ||
       !GIT_REVISION_PATTERN.test(archive.repository.head ?? ''))) errors.push('Archive repository identity is malformed.');
  if (exactKeys(archive.payload, ['path', 'bytes', 'sha256', 'format'], 'archive.payload', errors) &&
      (!nonEmptyString(archive.payload.path) || !Number.isSafeInteger(archive.payload.bytes) || archive.payload.bytes < 0 ||
       !SHA256_PATTERN.test(archive.payload.sha256 ?? '') || archive.payload.format !== ARCHIVE_PAYLOAD_FORMAT)) {
    errors.push('Archive payload identity is malformed.');
  }
  validateUniqueFiles(archive.files, 'archive.files', errors);
  if (!nonEmptyString(archive.createdAt) || Number.isNaN(Date.parse(archive.createdAt))) errors.push('archive.createdAt must be a timestamp string.');
  if (exactKeys(archive.tool, ['name', 'version'], 'archive.tool', errors) &&
      (!nonEmptyString(archive.tool.name) || !nonEmptyString(archive.tool.version))) errors.push('archive.tool is malformed.');
  return errors;
};

export const validateArchivePayload = (payload) => {
  const errors = [];
  if (!exactKeys(payload, ['schemaVersion', 'payloadType', 'format', 'files'], 'payload', errors)) return errors;
  if (payload.schemaVersion !== 1 || payload.payloadType !== ARCHIVE_PAYLOAD_TYPE || payload.format !== ARCHIVE_PAYLOAD_FORMAT) {
    errors.push('Archive payload contract or format is unsupported.');
  }
  validateUniqueFiles(payload.files, 'payload.files', errors, { payload: true });
  return errors;
};

const validateArchiveEvidenceRecord = (value, label, errors) => {
  if (!exactKeys(value, ['missionId', 'manifests', 'payloads', 'matched', 'errors'], label, errors)) return;
  if (!nonEmptyString(value.missionId) || typeof value.matched !== 'boolean' ||
      !Array.isArray(value.errors) || value.errors.some((error) => !nonEmptyString(error))) errors.push(`${label} result is malformed.`);
  for (const field of ['manifests', 'payloads']) {
    if (!Array.isArray(value[field])) errors.push(`${label}.${field} must be an array.`);
    for (const [index, artifact] of (Array.isArray(value[field]) ? value[field] : []).entries()) {
      validateArtifactIdentity(artifact, `${label}.${field}[${index}]`, errors);
    }
  }
  if (Array.isArray(value.errors) && value.matched !== (value.errors.length === 0)) errors.push(`${label}.matched must exactly reflect whether errors is empty.`);
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
  if (!nonEmptyString(report.flightId) || !/^refs\/heads\//u.test(report.integrationRef ?? '') ||
      !GIT_REVISION_PATTERN.test(report.integrationRevision ?? '')) errors.push('Teardown report flight or exact integration-ref identity is malformed.');
  validateArtifactIdentity(report.plan, 'report.plan', errors);
  if (!Array.isArray(report.archiveEvidence)) errors.push('report.archiveEvidence must be an array.');
  for (const [index, item] of (Array.isArray(report.archiveEvidence) ? report.archiveEvidence : []).entries()) {
    validateArchiveEvidenceRecord(item, `report.archiveEvidence[${index}]`, errors);
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
        (!/^refs\/heads\//u.test(item.refEvidence.ref ?? '') || !GIT_REVISION_PATTERN.test(item.refEvidence.revision ?? '') ||
         typeof item.refEvidence.matchesHead !== 'boolean')) errors.push(`${label}.refEvidence is malformed.`);
    if (!Array.isArray(item.inventory)) errors.push(`${label}.inventory must be an array.`);
    for (const [fileIndex, entry] of (Array.isArray(item.inventory) ? item.inventory : []).entries()) validateInventoryEntry(entry, `${label}.inventory[${fileIndex}]`, errors);
    if (!Array.isArray(item.unrecordedArtifacts)) errors.push(`${label}.unrecordedArtifacts must be an array.`);
    for (const [fileIndex, entry] of (Array.isArray(item.unrecordedArtifacts) ? item.unrecordedArtifacts : []).entries()) validateInventoryEntry(entry, `${label}.unrecordedArtifacts[${fileIndex}]`, errors);
    if (item.archiveEvidence !== null) validateArchiveEvidenceRecord(item.archiveEvidence, `${label}.archiveEvidence`, errors);
    if (item.integration !== null && exactKeys(item.integration, ['ref', 'revision', 'containsHead'], `${label}.integration`, errors) &&
        (!/^refs\/heads\//u.test(item.integration.ref ?? '') || !GIT_REVISION_PATTERN.test(item.integration.revision ?? '') ||
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
  const tracked = readNullDelimitedGitPaths(worktree, ['ls-files', '-z'], 'Tracked-file inventory');
  const untracked = readNullDelimitedGitPaths(worktree, ['ls-files', '--others', '--exclude-standard', '-z'], 'Untracked-file inventory');
  const ignored = readNullDelimitedGitPaths(worktree, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], 'Ignored-file inventory');
  const modified = new Set([
    ...readNullDelimitedGitPaths(worktree, ['diff', '--name-only', '-z'], 'Modified-file inventory'),
    ...readNullDelimitedGitPaths(worktree, ['diff', '--cached', '--name-only', '-z'], 'Staged-file inventory'),
  ]);
  const entries = [];
  for (const path of tracked) entries.push(await inventoryFile(worktree, path, 'tracked', !modified.has(path)));
  for (const path of untracked) entries.push(await inventoryFile(worktree, path, 'untracked', false));
  for (const path of ignored) entries.push(await inventoryFile(worktree, path, 'ignored', false));
  entries.sort((left, right) => compareUtf8(fileIdentityKey(left), fileIdentityKey(right)));
  const unrecorded = entries.filter((entry) =>
    !entry.recordedAtHead && entry.kind !== 'missing' && entry.bytes !== null && entry.sha256 !== null);
  return { entries, unrecorded };
};

const parsePayload = (snapshot, errors) => {
  try {
    return JSON.parse(snapshot.bytes.toString('utf8'));
  } catch (error) {
    errors.push(`Archive payload is not valid JSON: ${error instanceof Error ? error.message : error}`);
    return undefined;
  }
};

const prepareArchive = async (snapshot, plan, payloadSnapshots) => {
  const archive = snapshot.value;
  const errors = validateArchive(archive);
  let payloadSnapshot;
  let payload;
  if (errors.length === 0) {
    const pathObservation = await inspectExternalArtifactPath(plan, archive.payload.path);
    if (!pathObservation.exactCanonical) errors.push('Archive payload path is absent, aliased, or non-canonical.');
    if (!pathObservation.outsideRemovableWorktrees) errors.push(`Archive payload must be outside every removable worktree; observed ${pathObservation.containingWorktree}.`);
    if (pathObservation.canonical) {
      payloadSnapshot = payloadSnapshots.get(pathObservation.canonical);
      if (!payloadSnapshot) {
        try {
          payloadSnapshot = await snapshotFile(pathObservation.canonical);
          payloadSnapshots.set(pathObservation.canonical, payloadSnapshot);
        } catch (error) {
          errors.push(`Archive payload is unavailable or unsafe: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
    if (payloadSnapshot) {
      if (archive.payload.path !== payloadSnapshot.path || archive.payload.bytes !== payloadSnapshot.size ||
          archive.payload.sha256 !== payloadSnapshot.sha256 || archive.payload.format !== ARCHIVE_PAYLOAD_FORMAT) {
        errors.push('Archive payload bytes, digest, path, or format do not match the manifest binding.');
      }
      payload = parsePayload(payloadSnapshot, errors);
      if (payload !== undefined) {
        const payloadErrors = validateArchivePayload(payload);
        errors.push(...payloadErrors);
        if (payloadErrors.length === 0) {
          const projected = payload.files.map(({ contentBase64: _content, ...identity }) => identity);
          if (JSON.stringify(orderedFiles(projected)) !== JSON.stringify(orderedFiles(archive.files))) {
            errors.push('Archive payload inventory does not exactly equal the manifest inventory.');
          }
        }
      }
    }
  }
  return {
    archive,
    manifestSource: artifactIdentity(snapshot),
    payloadSource: payloadSnapshot ? artifactIdentity(payloadSnapshot) : null,
    errors,
  };
};

const archiveEvidenceFor = (mission, observed, unrecorded, entries) => {
  const errors = [];
  if (entries.length !== 1) errors.push(`Recoverability requires exactly one archive manifest; observed ${entries.length}.`);
  for (const entry of entries) errors.push(...entry.errors);
  if (entries.length === 1) {
    const archive = entries[0].archive;
    if (archive.flightId !== mission.plan.flightId || archive.missionId !== mission.id ||
        archive.repository?.root !== mission.plan.repository.root || archive.repository?.worktree !== mission.worktree ||
        archive.repository?.branch !== mission.branch || archive.repository?.head !== observed?.head) {
      errors.push('Archive flight, mission, repository, worktree, branch, or HEAD identity does not match the observed mission.');
    }
    const expected = unrecorded.map(({ path, category, kind, bytes, sha256 }) => ({ path, category, kind, bytes, sha256 }));
    const archivedFiles = Array.isArray(archive.files) ? archive.files : [];
    if (JSON.stringify(orderedFiles(archivedFiles)) !== JSON.stringify(orderedFiles(expected))) {
      errors.push('Archive inventory does not exactly equal the complete unrecorded artifact inventory.');
    }
  }
  return {
    missionId: mission.id,
    manifests: entries.map((entry) => entry.manifestSource).sort((left, right) => compareUtf8(left.path, right.path)),
    payloads: entries.flatMap((entry) => entry.payloadSource ? [entry.payloadSource] : []).sort((left, right) => compareUtf8(left.path, right.path)),
    matched: errors.length === 0,
    errors,
  };
};

export const planTeardown = async ({ planPath, integrationRef, archiveEvidencePaths = [], output }) => {
  const [planSnapshot, ...archiveSnapshots] = await Promise.all([
    readJsonSnapshot(planPath),
    ...archiveEvidencePaths.map((path) => readJsonSnapshot(path)),
  ]);
  const plan = assertPlan(planSnapshot.value);
  const outputPath = output
    ? await assertOutputOutsideFlightWorktrees(plan, output, 'Teardown report output')
    : undefined;
  const expectedIntegrationRef = `refs/heads/${plan.integration.branch}`;
  if (integrationRef !== undefined && integrationRef !== expectedIntegrationRef) {
    throw new Error(`Integration ref must exactly equal ${expectedIntegrationRef}; aliases, tags, commits, and mission refs are unsupported.`);
  }
  const planRoot = await canonicalExistingPath(plan.repository.root).catch(() => undefined);
  const plannedRepository = planRoot === plan.repository.root ? inspectGit(planRoot) : null;
  if (!plannedRepository || plannedRepository.root !== planRoot) {
    throw new Error('Planned repository root is unavailable, non-canonical, or no longer a Git worktree root.');
  }
  let planGitDirectory;
  try {
    planGitDirectory = await canonicalExistingPath(git(planRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  } catch {
    throw new Error('Planned repository common Git directory is unavailable or non-canonical.');
  }
  let baseRefRevision;
  try {
    baseRefRevision = git(planRoot, ['rev-parse', '--verify', `${plan.repository.baseRef}^{commit}`]);
  } catch {
    throw new Error(`Planned repository base ref is unavailable: ${plan.repository.baseRef}.`);
  }
  if (baseRefRevision !== plan.repository.baseRevision) {
    throw new Error(`Planned repository base ref does not resolve to exact base ${plan.repository.baseRevision}.`);
  }
  let integrationRevision;
  try {
    integrationRevision = git(planRoot, ['show-ref', '--verify', '--hash', expectedIntegrationRef]);
  } catch {
    throw new Error(`Exact integration branch ref is unavailable: ${expectedIntegrationRef}.`);
  }
  if (!GIT_REVISION_PATTERN.test(integrationRevision)) throw new Error(`Exact integration branch ref is malformed: ${expectedIntegrationRef}.`);

  const payloadSnapshots = new Map();
  const archives = new Map();
  for (const snapshot of archiveSnapshots) {
    const missionId = snapshot.value?.missionId;
    if (!nonEmptyString(missionId) || !plan.missions.some((mission) => mission.id === missionId)) {
      throw new Error(`Unexpected or malformed archive evidence mission: ${missionId}.`);
    }
    const entry = await prepareArchive(snapshot, plan, payloadSnapshots);
    const group = archives.get(missionId) ?? [];
    group.push(entry);
    archives.set(missionId, group);
  }

  const worktrees = [];
  const archiveRecords = [];
  for (const plannedMission of plan.missions) {
    const mission = { ...plannedMission, plan };
    const path = mission.worktree;
    const archiveEntries = archives.get(mission.id) ?? [];
    if (!existsSync(path)) {
      const archiveEvidence = archiveEntries.length > 0
        ? archiveEvidenceFor(mission, null, [], archiveEntries)
        : null;
      if (archiveEvidence) archiveRecords.push(archiveEvidence);
      worktrees.push({
        missionId: mission.id,
        path,
        disposition: archiveEvidence ? 'preserve-ambiguous-recoverability' : 'already-absent',
        recoverable: archiveEvidence ? false : null,
        observed: null,
        refEvidence: null,
        inventory: [],
        unrecordedArtifacts: [],
        archiveEvidence,
        integration: null,
      });
      continue;
    }
    const canonical = await canonicalExistingPath(path).catch(() => undefined);
    const observed = canonical === path ? inspectGit(path) : null;
    if (!observed || observed.root !== path) {
      const archiveEvidence = archiveEntries.length > 0
        ? archiveEvidenceFor(mission, null, [], archiveEntries)
        : null;
      if (archiveEvidence) archiveRecords.push(archiveEvidence);
      worktrees.push({
        missionId: mission.id,
        path,
        disposition: 'preserve-path-collision',
        recoverable: false,
        observed: null,
        refEvidence: null,
        inventory: [],
        unrecordedArtifacts: [],
        archiveEvidence,
        integration: null,
      });
      continue;
    }
    let worktreeGitDirectory;
    try {
      worktreeGitDirectory = await canonicalExistingPath(git(path, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
    } catch {}
    if (worktreeGitDirectory !== planGitDirectory) {
      const archiveEvidence = archiveEntries.length > 0
        ? archiveEvidenceFor(mission, observed, [], archiveEntries)
        : null;
      if (archiveEvidence) archiveRecords.push(archiveEvidence);
      worktrees.push({
        missionId: mission.id,
        path,
        disposition: 'preserve-foreign-repository',
        recoverable: false,
        observed: { branch: observed.branch, head: observed.head, clean: observed.clean },
        refEvidence: null,
        inventory: [],
        unrecordedArtifacts: [],
        archiveEvidence,
        integration: null,
      });
      continue;
    }
    const { entries, unrecorded } = await inventoryWorktree(path);
    const observedRecord = { branch: observed.branch, head: observed.head, clean: observed.clean };
    let branchRevision = null;
    const branchRef = `refs/heads/${mission.branch}`;
    try { branchRevision = git(path, ['show-ref', '--verify', '--hash', branchRef]); } catch {}
    const refEvidence = branchRevision ? { ref: branchRef, revision: branchRevision, matchesHead: branchRevision === observed.head } : null;
    let containsHead = false;
    try {
      git(path, ['merge-base', '--is-ancestor', observed.head, integrationRevision]);
      containsHead = true;
    } catch {}
    const integration = { ref: expectedIntegrationRef, revision: integrationRevision, containsHead };
    const archiveEvidence = archiveEntries.length > 0
      ? archiveEvidenceFor(mission, observed, unrecorded, archiveEntries)
      : null;
    if (archiveEvidence) archiveRecords.push(archiveEvidence);

    let disposition;
    let recoverable;
    if (observed.branch !== mission.branch) {
      disposition = 'preserve-wrong-branch';
      recoverable = false;
    } else if (!refEvidence?.matchesHead) {
      disposition = 'preserve-missing-exact-ref';
      recoverable = false;
    } else if (archiveEvidence && !archiveEvidence.matched) {
      disposition = 'preserve-ambiguous-recoverability';
      recoverable = false;
    } else if (unrecorded.length > 0 && !archiveEvidence?.matched) {
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

  const report = {
    schemaVersion: 2,
    reportType: TEARDOWN_REPORT_TYPE,
    authority: 'none',
    notice: TEARDOWN_REPORT_NOTICE,
    tool: { name: 'teardown-plan', version: TEARDOWN_REPORT_TOOL_VERSION },
    plannedAt: new Date().toISOString(),
    flightId: plan.flightId,
    plan: artifactIdentity(planSnapshot),
    integrationRef: expectedIntegrationRef,
    integrationRevision,
    archiveEvidence: archiveRecords.sort((left, right) => compareUtf8(left.missionId, right.missionId)),
    worktrees,
  };
  const reportErrors = validateTeardownReport(report);
  if (reportErrors.length > 0) throw new Error(`Produced invalid teardown report:\n- ${reportErrors.join('\n- ')}`);
  const json = stableJson(report);
  if (outputPath) await writeNewFile(outputPath, json);
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
  if (!options.planPath) throw new Error('Usage: teardown-plan.mjs --plan FILE [--integration-ref refs/heads/PLAN_INTEGRATION_BRANCH] [--archive-evidence FILE]... [--output NEW_FILE]');
  return options;
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const report = await planTeardown(options);
  process.stdout.write(stableJson(report));
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
