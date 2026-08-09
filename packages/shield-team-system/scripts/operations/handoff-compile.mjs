#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import {
  SHA256_PATTERN,
  canonicalExistingPath,
  exactKeys,
  git,
  inspectGit,
  nonEmptyString,
  normalizeSystemPathAlias,
  readJsonSnapshot,
  sha256,
  snapshotFile,
  stableJson,
  writeNewFile,
} from './common.mjs';
import { assertPlan, canonicalRelativePath, GIT_REVISION_PATTERN, pathMatches } from './flight-common.mjs';
import { evaluateAcceptanceSnapshots } from './acceptance-check.mjs';
import {
  artifactIdentity,
  validateHandoffPredecessor,
  validateHandoffState,
} from './handoff-state.mjs';
import { assertOutputOutsideFlightWorktrees, compareUtf8, orderedChangedPaths } from './convergence-common.mjs';

export const HANDOFF_PACKET_TYPE = 'exact-mission-handoff';
export const HANDOFF_PACKET_NOTICE = 'Coordination evidence only. This packet grants no human approval, mission authority, merge authority, or publication authority.';
export const HANDOFF_PACKET_TOOL_VERSION = '1.0.0';
const MODES = new Set(['checkout', 'resume', 'review']);

export const sameArtifactIdentity = (left, right) =>
  left?.path === right?.path && left?.bytes === right?.bytes && left?.sha256 === right?.sha256;

const validateArtifact = (value, label, errors) => {
  if (!exactKeys(value, ['path', 'bytes', 'sha256'], label, errors)) return;
  if (!nonEmptyString(value.path)) errors.push(`${label}.path must be a non-empty string.`);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0) errors.push(`${label}.bytes must be a non-negative safe integer.`);
  if (!SHA256_PATTERN.test(value.sha256 ?? '')) errors.push(`${label}.sha256 must be a lowercase SHA-256 digest.`);
};

const validateStringArray = (value, label, errors, { allowEmpty = true } = {}) => {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => !nonEmptyString(item))) {
    errors.push(`${label} must be ${allowEmpty ? 'an array' : 'a non-empty array'} of non-empty strings.`);
  }
};

export const validateAcceptanceReport = (report) => {
  const errors = [];
  if (!exactKeys(report, [
    'schemaVersion', 'reportType', 'evidence', 'tool', 'missionId', 'source', 'specPath',
    'specSha256', 'manifestPath', 'manifestSha256', 'phase', 'expectedRevision', 'ok',
    'errors', 'receiptSummaries', 'criteria',
  ], 'acceptance', errors)) return errors;
  if (report.schemaVersion !== 1 || report.reportType !== 'acceptance-traceability') errors.push('Acceptance report contract is unsupported.');
  if (exactKeys(report.evidence, ['classification', 'authority', 'provenance', 'executionAttestation'], 'acceptance.evidence', errors) &&
      (report.evidence.classification !== 'contract-relative-structural-evidence' || report.evidence.authority !== 'none' ||
       report.evidence.provenance !== false || report.evidence.executionAttestation !== false)) {
    errors.push('Acceptance evidence contract is not non-authoritative structural evidence.');
  }
  if (exactKeys(report.tool, ['name', 'version'], 'acceptance.tool', errors) &&
      (report.tool.name !== 'acceptance-check' || report.tool.version !== '1.0.0')) errors.push('Acceptance producer is unsupported.');
  if (!nonEmptyString(report.missionId)) errors.push('acceptance.missionId must be a non-empty string.');
  if (exactKeys(report.source, ['key', 'sha256', 'criteriaCount'], 'acceptance.source', errors)) {
    if (!nonEmptyString(report.source.key) || !SHA256_PATTERN.test(report.source.sha256 ?? '') ||
        !Number.isSafeInteger(report.source.criteriaCount) || report.source.criteriaCount < 1) errors.push('acceptance.source is malformed.');
  }
  if (!nonEmptyString(report.specPath) || !SHA256_PATTERN.test(report.specSha256 ?? '') ||
      !nonEmptyString(report.manifestPath) || !SHA256_PATTERN.test(report.manifestSha256 ?? '')) errors.push('Acceptance artifact bindings are malformed.');
  if (!['structure', 'red', 'green'].includes(report.phase)) errors.push('acceptance.phase is unsupported.');
  if (report.expectedRevision !== null && !GIT_REVISION_PATTERN.test(report.expectedRevision ?? '')) errors.push('acceptance.expectedRevision is malformed.');
  if (typeof report.ok !== 'boolean') errors.push('acceptance.ok must be boolean.');
  validateStringArray(report.errors, 'acceptance.errors', errors);
  if (!Array.isArray(report.receiptSummaries)) errors.push('acceptance.receiptSummaries must be an array.');
  for (const [index, summary] of (Array.isArray(report.receiptSummaries) ? report.receiptSummaries : []).entries()) {
    const label = `acceptance.receiptSummaries[${index}]`;
    if (!exactKeys(summary, ['criterionId', 'phase', 'commandId', 'receiptId', 'receiptSha256', 'path'], label, errors)) continue;
    if (![summary.criterionId, summary.commandId, summary.receiptId, summary.path].every(nonEmptyString) ||
        !['red', 'green'].includes(summary.phase) || !SHA256_PATTERN.test(summary.receiptSha256 ?? '')) errors.push(`${label} is malformed.`);
  }
  if (!Array.isArray(report.criteria)) errors.push('acceptance.criteria must be an array.');
  for (const [index, criterion] of (Array.isArray(report.criteria) ? report.criteria : []).entries()) {
    const label = `acceptance.criteria[${index}]`;
    if (!exactKeys(criterion, ['id', 'sourceText', 'mode', 'redEvidence', 'greenEvidence', 'manualEvidence'], label, errors)) continue;
    if (!nonEmptyString(criterion.id) || !nonEmptyString(criterion.sourceText) || !['automated', 'manual'].includes(criterion.mode) ||
        [criterion.redEvidence, criterion.greenEvidence, criterion.manualEvidence].some((count) => !Number.isSafeInteger(count) || count < 0)) errors.push(`${label} is malformed.`);
  }
  return errors;
};

export const validateEvidenceManifest = (manifest) => {
  const errors = [];
  if (!exactKeys(manifest, [
    'schemaVersion', 'manifestType', 'missionId', 'specSha256', 'phase', 'expectedRevision',
    'receipts', 'redNotApplicable', 'manualEvidence',
  ], 'manifest', errors)) return errors;
  if (manifest.schemaVersion !== 1 || manifest.manifestType !== 'mission-evidence-manifest') errors.push('Evidence manifest contract is unsupported.');
  if (!nonEmptyString(manifest.missionId) || !SHA256_PATTERN.test(manifest.specSha256 ?? '')) errors.push('Evidence manifest identity is malformed.');
  if (!['structure', 'red', 'green'].includes(manifest.phase)) errors.push('manifest.phase is unsupported.');
  if (manifest.expectedRevision !== null && !GIT_REVISION_PATTERN.test(manifest.expectedRevision ?? '')) errors.push('manifest.expectedRevision is malformed.');
  if (!Array.isArray(manifest.receipts)) errors.push('manifest.receipts must be an array.');
  const receiptIds = new Set();
  const receiptDigests = new Set();
  const receiptPaths = new Set();
  for (const [index, mapping] of (Array.isArray(manifest.receipts) ? manifest.receipts : []).entries()) {
    const label = `manifest.receipts[${index}]`;
    if (!exactKeys(mapping, ['criterionId', 'phase', 'commandId', 'receiptId', 'receiptSha256', 'path', 'expectedRevision'], label, errors)) continue;
    if (![mapping.criterionId, mapping.commandId, mapping.receiptId].every(nonEmptyString) ||
        canonicalRelativePath(mapping.path) !== mapping.path ||
        !['red', 'green'].includes(mapping.phase) || !SHA256_PATTERN.test(mapping.receiptSha256 ?? '') ||
        !GIT_REVISION_PATTERN.test(mapping.expectedRevision ?? '')) errors.push(`${label} is malformed.`);
    if (receiptIds.has(mapping.receiptId)) errors.push(`${label} duplicates receiptId ${mapping.receiptId}.`);
    if (receiptDigests.has(mapping.receiptSha256)) errors.push(`${label} duplicates receiptSha256 ${mapping.receiptSha256}.`);
    if (receiptPaths.has(mapping.path)) errors.push(`${label} duplicates path ${mapping.path}.`);
    receiptIds.add(mapping.receiptId);
    receiptDigests.add(mapping.receiptSha256);
    receiptPaths.add(mapping.path);
  }
  if (!Array.isArray(manifest.redNotApplicable)) errors.push('manifest.redNotApplicable must be an array.');
  for (const [index, item] of (Array.isArray(manifest.redNotApplicable) ? manifest.redNotApplicable : []).entries()) {
    if (!exactKeys(item, ['criterionId', 'rationale'], `manifest.redNotApplicable[${index}]`, errors) ||
        !nonEmptyString(item.criterionId) || !nonEmptyString(item.rationale)) errors.push(`manifest.redNotApplicable[${index}] is malformed.`);
  }
  if (!Array.isArray(manifest.manualEvidence)) errors.push('manifest.manualEvidence must be an array.');
  for (const [index, item] of (Array.isArray(manifest.manualEvidence) ? manifest.manualEvidence : []).entries()) {
    const label = `manifest.manualEvidence[${index}]`;
    if (!exactKeys(item, ['criterionId', 'performedBy', 'performedAt', 'revision', 'observation'], label, errors)) continue;
    if (![item.criterionId, item.performedBy, item.performedAt, item.observation].every(nonEmptyString) ||
        !GIT_REVISION_PATTERN.test(item.revision ?? '')) errors.push(`${label} is malformed.`);
  }
  return errors;
};

export const validateReceipt = (receipt, mapping, acceptance, mission, repository, evidenceTool, label) => {
  const errors = [];
  if (!exactKeys(receipt, [
    'schemaVersion', 'receiptType', 'receiptId', 'evidence', 'specSha256', 'commandId', 'command',
    'repository', 'startedAt', 'completedAt', 'durationMs', 'timeoutMs', 'result', 'output',
    'artifacts', 'tool',
  ], label, errors)) return errors;
  if (receipt.schemaVersion !== 1 || receipt.receiptType !== 'mission-command-evidence') errors.push(`${label} contract is unsupported.`);
  if (receipt.receiptId !== mapping.receiptId || receipt.specSha256 !== acceptance.specSha256 || receipt.commandId !== mapping.commandId) errors.push(`${label} identity does not match acceptance and manifest bindings.`);
  if (exactKeys(receipt.evidence, ['classification', 'authority', 'provenance', 'executionAttestation'], `${label}.evidence`, errors) &&
      (receipt.evidence.classification !== 'contract-relative-structural-evidence' || receipt.evidence.authority !== 'none' ||
       receipt.evidence.provenance !== false || receipt.evidence.executionAttestation !== false)) errors.push(`${label}.evidence is unsupported.`);
  if (exactKeys(receipt.command, ['executable', 'argv'], `${label}.command`, errors)) {
    if (!nonEmptyString(receipt.command.executable) || !Array.isArray(receipt.command.argv) || receipt.command.argv.some((item) => typeof item !== 'string')) errors.push(`${label}.command is malformed.`);
  }
  if (exactKeys(receipt.repository, ['beforeRoot', 'beforeBranch', 'beforeHead', 'beforeClean', 'afterRoot', 'afterBranch', 'afterHead', 'afterClean'], `${label}.repository`, errors)) {
    if (receipt.repository.beforeRoot !== repository.worktree || receipt.repository.afterRoot !== repository.worktree ||
        receipt.repository.beforeBranch !== mission.branch || receipt.repository.afterBranch !== mission.branch ||
        receipt.repository.beforeHead !== mapping.expectedRevision || receipt.repository.afterHead !== mapping.expectedRevision ||
        receipt.repository.beforeClean !== true || receipt.repository.afterClean !== true) errors.push(`${label}.repository is not bound to the clean exact mission worktree and receipt revision.`);
  }
  if (!nonEmptyString(receipt.startedAt) || Number.isNaN(Date.parse(receipt.startedAt)) ||
      !nonEmptyString(receipt.completedAt) || Number.isNaN(Date.parse(receipt.completedAt)) ||
      !Number.isSafeInteger(receipt.durationMs) || receipt.durationMs < 0 ||
      !Number.isSafeInteger(receipt.timeoutMs) || receipt.timeoutMs < 1) errors.push(`${label} timing fields are malformed.`);
  if (!Number.isNaN(Date.parse(receipt.startedAt)) && !Number.isNaN(Date.parse(receipt.completedAt)) &&
      receipt.durationMs !== Date.parse(receipt.completedAt) - Date.parse(receipt.startedAt)) {
    errors.push(`${label}.durationMs does not match its timestamps.`);
  }
  if (exactKeys(receipt.result, ['status', 'exitCode', 'signal', 'timedOut', 'spawnError', 'artifactErrors'], `${label}.result`, errors)) {
    const completedCleanly = receipt.result.status === 'completed' && receipt.result.signal === null &&
      receipt.result.timedOut === false && receipt.result.spawnError === null &&
      Array.isArray(receipt.result.artifactErrors) && receipt.result.artifactErrors.length === 0;
    if (mapping.phase === 'green' && (!completedCleanly || receipt.result.exitCode !== 0)) {
      errors.push(`${label} does not record successful GREEN evidence.`);
    }
    if (mapping.phase === 'red' && (!completedCleanly || !Number.isInteger(receipt.result.exitCode) || receipt.result.exitCode === 0)) {
      errors.push(`${label} does not record a completed failing RED command.`);
    }
  }
  if (exactKeys(receipt.output, ['stdout', 'stderr'], `${label}.output`, errors)) {
    for (const stream of ['stdout', 'stderr']) {
      const outputLabel = `${label}.output.${stream}`;
      if (!exactKeys(receipt.output[stream], ['text', 'sha256', 'truncated'], outputLabel, errors)) continue;
      if (typeof receipt.output[stream].text !== 'string' || !SHA256_PATTERN.test(receipt.output[stream].sha256 ?? '') ||
          typeof receipt.output[stream].truncated !== 'boolean') errors.push(`${outputLabel} is malformed.`);
      if (typeof receipt.output[stream].text === 'string' && receipt.output[stream].sha256 !== sha256(receipt.output[stream].text)) {
        errors.push(`${outputLabel}.sha256 does not bind the stored output text.`);
      }
    }
  }
  if (!Array.isArray(receipt.artifacts)) errors.push(`${label}.artifacts must be an array.`);
  for (const [index, artifact] of (Array.isArray(receipt.artifacts) ? receipt.artifacts : []).entries()) {
    const artifactLabel = `${label}.artifacts[${index}]`;
    if (!exactKeys(artifact, ['path', 'bytes', 'sha256'], artifactLabel, errors)) continue;
    if (canonicalRelativePath(artifact.path) !== artifact.path || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0 ||
        !SHA256_PATTERN.test(artifact.sha256 ?? '')) errors.push(`${artifactLabel} is malformed.`);
  }
  if (exactKeys(receipt.tool, ['name', 'version', 'path', 'sha256'], `${label}.tool`, errors) &&
      (receipt.tool.name !== 'evidence-run' || receipt.tool.version !== '1.0.0' ||
       receipt.tool.path !== evidenceTool.path || receipt.tool.sha256 !== evidenceTool.sha256)) {
    errors.push(`${label}.tool does not match the current evidence producer identity.`);
  }
  return errors;
};

const validatePacketArtifact = (value, label, errors) => validateArtifact(value, label, errors);

export const validateHandoffPacket = (packet) => {
  const errors = [];
  if (!exactKeys(packet, [
    'schemaVersion', 'packetType', 'authority', 'notice', 'mode', 'compiledAt', 'tool',
    'flight', 'mission', 'repository', 'sequence', 'predecessor', 'state', 'acceptance', 'evidence',
  ], 'packet', errors)) return errors;
  if (packet.schemaVersion !== 2 || packet.packetType !== HANDOFF_PACKET_TYPE) errors.push('Packet contract is unsupported.');
  if (packet.authority !== 'none' || packet.notice !== HANDOFF_PACKET_NOTICE) errors.push('Packet authority or notice is unsupported.');
  if (!MODES.has(packet.mode)) errors.push('packet.mode is unsupported.');
  if (!nonEmptyString(packet.compiledAt) || Number.isNaN(Date.parse(packet.compiledAt))) errors.push('packet.compiledAt must be a timestamp string.');
  if (exactKeys(packet.tool, ['name', 'version'], 'packet.tool', errors) &&
      (packet.tool.name !== 'handoff-compile' || packet.tool.version !== HANDOFF_PACKET_TOOL_VERSION)) errors.push('Packet producer is unsupported.');
  if (exactKeys(packet.flight, ['id', 'plan'], 'packet.flight', errors)) {
    if (!nonEmptyString(packet.flight.id)) errors.push('packet.flight.id must be a non-empty string.');
    validatePacketArtifact(packet.flight.plan, 'packet.flight.plan', errors);
  }
  if (exactKeys(packet.mission, ['id', 'title', 'lane', 'writablePaths', 'deliverables'], 'packet.mission', errors)) {
    if (![packet.mission.id, packet.mission.title, packet.mission.lane].every(nonEmptyString)) errors.push('Packet mission identity is malformed.');
    validateStringArray(packet.mission.writablePaths, 'packet.mission.writablePaths', errors, { allowEmpty: false });
    validateStringArray(packet.mission.deliverables, 'packet.mission.deliverables', errors, { allowEmpty: false });
  }
  if (exactKeys(packet.repository, ['root', 'worktree', 'branch', 'baseRef', 'baseRevision', 'head', 'clean', 'changedPaths'], 'packet.repository', errors)) {
    if (![packet.repository.root, packet.repository.worktree, packet.repository.branch, packet.repository.baseRef].every(nonEmptyString) ||
        !GIT_REVISION_PATTERN.test(packet.repository.baseRevision ?? '') || !GIT_REVISION_PATTERN.test(packet.repository.head ?? '') ||
        packet.repository.clean !== true) errors.push('Packet repository identity is malformed.');
    if (!Array.isArray(packet.repository.changedPaths) ||
        packet.repository.changedPaths.some((path) => canonicalRelativePath(path) !== path)) {
      errors.push('packet.repository.changedPaths must contain only canonical relative paths.');
    }
  }
  if (!Number.isSafeInteger(packet.sequence) || packet.sequence < 0) errors.push('packet.sequence must be a non-negative safe integer.');
  if (packet.sequence === 0) {
    if (packet.predecessor !== null) errors.push('packet.predecessor must be null at genesis.');
  } else if (exactKeys(packet.predecessor, ['path', 'bytes', 'sha256', 'sequence'], 'packet.predecessor', errors)) {
    if (!nonEmptyString(packet.predecessor.path) || !Number.isSafeInteger(packet.predecessor.bytes) || packet.predecessor.bytes < 0 ||
        !SHA256_PATTERN.test(packet.predecessor.sha256 ?? '') || packet.predecessor.sequence !== packet.sequence - 1) errors.push('packet.predecessor is malformed.');
  }
  if (exactKeys(packet.state, ['source'], 'packet.state', errors)) validatePacketArtifact(packet.state.source, 'packet.state.source', errors);
  if (exactKeys(packet.acceptance, ['spec', 'report', 'manifest', 'phase', 'ok', 'expectedRevision', 'receiptDigests'], 'packet.acceptance', errors)) {
    validatePacketArtifact(packet.acceptance.spec, 'packet.acceptance.spec', errors);
    validatePacketArtifact(packet.acceptance.report, 'packet.acceptance.report', errors);
    validatePacketArtifact(packet.acceptance.manifest, 'packet.acceptance.manifest', errors);
    if (!['structure', 'red', 'green'].includes(packet.acceptance.phase) || typeof packet.acceptance.ok !== 'boolean' ||
        (packet.acceptance.expectedRevision !== null && !GIT_REVISION_PATTERN.test(packet.acceptance.expectedRevision ?? ''))) {
      errors.push('Packet acceptance binding is malformed.');
    }
    if (packet.mode !== 'resume' && (packet.acceptance.phase !== 'green' || packet.acceptance.ok !== true ||
        !GIT_REVISION_PATTERN.test(packet.acceptance.expectedRevision ?? ''))) {
      errors.push('Completion packet acceptance is not passing GREEN evidence at an exact revision.');
    }
    if (!Array.isArray(packet.acceptance.receiptDigests) || packet.acceptance.receiptDigests.some((digest) => !SHA256_PATTERN.test(digest ?? ''))) errors.push('packet.acceptance.receiptDigests is malformed.');
  }
  if (exactKeys(packet.evidence, ['receipts', 'artifacts'], 'packet.evidence', errors)) {
    if (!Array.isArray(packet.evidence.receipts)) errors.push('packet.evidence.receipts must be an array.');
    for (const [index, receipt] of (Array.isArray(packet.evidence.receipts) ? packet.evidence.receipts : []).entries()) {
      const label = `packet.evidence.receipts[${index}]`;
      if (!exactKeys(receipt, ['receiptId', 'source'], label, errors)) continue;
      if (!nonEmptyString(receipt.receiptId)) errors.push(`${label}.receiptId is malformed.`);
      validatePacketArtifact(receipt.source, `${label}.source`, errors);
    }
    if (!Array.isArray(packet.evidence.artifacts)) errors.push('packet.evidence.artifacts must be an array.');
    for (const [index, artifact] of (Array.isArray(packet.evidence.artifacts) ? packet.evidence.artifacts : []).entries()) {
      const label = `packet.evidence.artifacts[${index}]`;
      if (!exactKeys(artifact, ['receiptId', 'path', 'bytes', 'sha256'], label, errors)) continue;
      if (!nonEmptyString(artifact.receiptId) || !nonEmptyString(artifact.path) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0 ||
          !SHA256_PATTERN.test(artifact.sha256 ?? '')) errors.push(`${label} is malformed.`);
    }
  }
  return errors;
};

const requireCanonicalWorktree = async (value, mission) => {
  const supplied = normalizeSystemPathAlias(resolve(value));
  const canonical = await canonicalExistingPath(value);
  if (supplied !== canonical) throw new Error(`Worktree path must be canonical and contain no alias or symlink components: ${value}`);
  if (mission.worktree !== canonical) throw new Error(`Canonical supplied worktree ${canonical} does not equal mission worktree ${mission.worktree}.`);
  return canonical;
};

const parseArguments = (argv) => {
  const options = { mode: 'checkout', receipts: [] };
  while (argv.length > 0) {
    const option = argv.shift();
    if (option === '--flight-plan') options.flightPlan = argv.shift();
    else if (option === '--mission-id') options.missionId = argv.shift();
    else if (option === '--worktree') options.worktree = argv.shift();
    else if (option === '--acceptance-report') options.acceptanceReport = argv.shift();
    else if (option === '--evidence-manifest') options.evidenceManifest = argv.shift();
    else if (option === '--state') options.state = argv.shift();
    else if (option === '--expected-state-sha256') options.expectedStateSha256 = argv.shift();
    else if (option === '--expected-state-sequence') options.expectedStateSequence = Number(argv.shift());
    else if (option === '--predecessor-state') options.predecessorState = argv.shift();
    else if (option === '--expected-predecessor-sha256') options.expectedPredecessorSha256 = argv.shift();
    else if (option === '--receipt') options.receipts.push(argv.shift());
    else if (option === '--output-dir') options.outputDir = argv.shift();
    else if (option === '--mode') options.mode = argv.shift();
    else throw new Error(`Unknown option: ${option}`);
  }
  for (const name of ['flightPlan', 'missionId', 'worktree', 'acceptanceReport', 'evidenceManifest', 'state', 'expectedStateSha256', 'outputDir']) {
    if (!options[name]) throw new Error(`--${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} is required.`);
  }
  if (!Number.isSafeInteger(options.expectedStateSequence) || options.expectedStateSequence < 0) throw new Error('--expected-state-sequence must be a non-negative safe integer.');
  if (!MODES.has(options.mode)) throw new Error(`Unknown mode: ${options.mode}`);
  return options;
};

const makeMarkdown = (packet) => {
  const changed = packet.repository.changedPaths.length === 0
    ? '- None'
    : packet.repository.changedPaths.map((path) => `- \`${path}\``).join('\n');
  return `# ${packet.mode} packet: ${packet.mission.title}\n\n` +
    `${HANDOFF_PACKET_NOTICE}\n\n` +
    `- Flight: \`${packet.flight.id}\`\n` +
    `- Mission: \`${packet.mission.id}\`\n` +
    `- Branch: \`${packet.repository.branch}\`\n` +
    `- Exact revision: \`${packet.repository.head}\`\n` +
    `- Base revision: \`${packet.repository.baseRevision}\`\n` +
    `- State sequence: \`${packet.sequence}\`\n\n` +
    `## Changed paths\n\n${changed}\n\n` +
    `## Recommended next action\n\n${packet.stateStatus.recommendedNextAction}\n`;
};

export const compileHandoff = async (options) => {
  if (!SHA256_PATTERN.test(options.expectedStateSha256 ?? '')) throw new Error('Expected state SHA-256 must be a lowercase digest.');
  if (!Number.isSafeInteger(options.expectedStateSequence) || options.expectedStateSequence < 0) throw new Error('Expected state sequence must be a non-negative safe integer.');
  if (!MODES.has(options.mode)) throw new Error(`Unknown mode: ${options.mode}`);
  if (existsSync(resolve(options.outputDir))) throw new Error(`Refusing existing output directory: ${resolve(options.outputDir)}`);

  const [planSnapshot, acceptanceSnapshot, manifestSnapshot, stateSnapshot, ...receiptSnapshots] = await Promise.all([
    readJsonSnapshot(options.flightPlan),
    readJsonSnapshot(options.acceptanceReport),
    readJsonSnapshot(options.evidenceManifest),
    readJsonSnapshot(options.state),
    ...options.receipts.map((path) => readJsonSnapshot(path)),
  ]);
  const evidenceToolSnapshot = await snapshotFile(fileURLToPath(new URL('./evidence-run.mjs', import.meta.url)));
  const specSnapshot = await readJsonSnapshot(acceptanceSnapshot.value?.specPath);
  const plan = assertPlan(planSnapshot.value);
  const mission = plan.missions.find((candidate) => candidate.id === options.missionId);
  if (!mission) throw new Error(`Mission not found in flight plan: ${options.missionId}`);
  const outputDirectory = await assertOutputOutsideFlightWorktrees(plan, options.outputDir, 'Handoff packet output directory');
  const worktree = await requireCanonicalWorktree(options.worktree, mission);
  const repository = inspectGit(worktree);
  const errors = [];
  if (!repository || repository.root !== worktree) errors.push(`Worktree is not the selected Git worktree: ${worktree}`);
  if (repository?.branch !== mission.branch) errors.push(`Branch is ${repository?.branch}; mission requires ${mission.branch}.`);
  if (repository?.clean !== true) errors.push('Worktree must be clean at handoff compilation.');
  const planRoot = await canonicalExistingPath(plan.repository.root).catch(() => undefined);
  if (planRoot !== plan.repository.root) errors.push('Plan repository root is unavailable or non-canonical.');
  if (planRoot && repository) {
    try {
      const planGitDirectory = await canonicalExistingPath(git(planRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
      const worktreeGitDirectory = await canonicalExistingPath(git(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
      if (planGitDirectory !== worktreeGitDirectory) errors.push('Mission worktree does not belong to the planned Git repository.');
    } catch {
      errors.push('Planned repository or mission worktree Git identity is unavailable.');
    }
  }
  const baseRefRevision = planRoot ? (() => {
    try { return git(planRoot, ['rev-parse', '--verify', `${plan.repository.baseRef}^{commit}`]); } catch { return undefined; }
  })() : undefined;
  if (baseRefRevision !== plan.repository.baseRevision) errors.push(`Base ref ${plan.repository.baseRef} does not resolve to exact base ${plan.repository.baseRevision}.`);
  let branchRevision;
  try { branchRevision = git(worktree, ['rev-parse', '--verify', `refs/heads/${mission.branch}^{commit}`]); } catch {}
  if (repository && branchRevision !== repository.head) errors.push(`Mission branch ref does not resolve to current HEAD ${repository.head}.`);
  try { git(worktree, ['merge-base', '--is-ancestor', plan.repository.baseRevision, repository?.head ?? '']); } catch {
    errors.push(`Base revision ${plan.repository.baseRevision} is not an ancestor of ${repository?.head}.`);
  }

  const planIdentity = artifactIdentity(planSnapshot);
  const state = stateSnapshot.value;
  errors.push(...validateHandoffState(plan, planIdentity, state));
  if (stateSnapshot.sha256 !== options.expectedStateSha256) errors.push('Expected state SHA-256 does not match the supplied state snapshot.');
  if (state.sequence !== options.expectedStateSequence) errors.push(`Expected state sequence ${options.expectedStateSequence} does not match supplied sequence ${state.sequence}.`);
  if (state.flight?.id !== plan.flightId || state.mission?.id !== mission.id ||
      state.repository?.root !== plan.repository.root || state.repository?.worktree !== worktree ||
      state.repository?.branch !== mission.branch || state.repository?.baseRevision !== plan.repository.baseRevision ||
      state.repository?.head !== repository?.head) errors.push('Handoff state identity is not bound to the exact live mission repository state.');

  let predecessorSnapshot = null;
  if (state.sequence === 0) {
    if (options.predecessorState !== undefined || options.expectedPredecessorSha256 !== undefined) errors.push('Genesis state must not supply predecessor evidence.');
  } else if (!options.predecessorState || !SHA256_PATTERN.test(options.expectedPredecessorSha256 ?? '')) {
    errors.push('A predecessor snapshot and expected SHA-256 are required after genesis.');
  } else {
    predecessorSnapshot = await readJsonSnapshot(options.predecessorState);
    errors.push(...validateHandoffState(plan, planIdentity, predecessorSnapshot.value, 'predecessor'));
    validateHandoffPredecessor(state, predecessorSnapshot, options.expectedPredecessorSha256, errors);
  }

  const acceptance = acceptanceSnapshot.value;
  const manifest = manifestSnapshot.value;
  errors.push(...validateAcceptanceReport(acceptance), ...validateEvidenceManifest(manifest));
  const specRepository = specSnapshot.value?.repository;
  const canonicalSpecRoot = nonEmptyString(specRepository?.root)
    ? await canonicalExistingPath(specRepository.root).catch(() => undefined)
    : undefined;
  if (canonicalSpecRoot !== worktree || specRepository?.root !== worktree || specRepository?.branch !== mission.branch) {
    errors.push('Acceptance spec repository root and branch do not exactly match the canonical mission worktree and planned branch.');
  }
  if (acceptance.specPath !== specSnapshot.path || acceptance.specSha256 !== specSnapshot.sha256) {
    errors.push('Acceptance report does not bind the canonical supplied acceptance spec snapshot.');
  }
  if (acceptance.missionId !== mission.id || manifest.missionId !== mission.id) errors.push('Acceptance report and evidence manifest must match the mission.');
  if (acceptance.manifestPath !== manifestSnapshot.path || acceptance.manifestSha256 !== manifestSnapshot.sha256) errors.push('Acceptance report does not bind the supplied evidence manifest snapshot.');
  if (acceptance.specSha256 !== manifest.specSha256) errors.push('Acceptance report and evidence manifest spec digests differ.');
  if (acceptance.phase !== manifest.phase || acceptance.expectedRevision !== manifest.expectedRevision) errors.push('Acceptance report and evidence manifest gate bindings differ.');
  if (options.mode !== 'resume' && (acceptance.phase !== 'green' || acceptance.ok !== true || acceptance.errors?.length !== 0)) errors.push(`${options.mode} requires a passing GREEN acceptance report.`);
  if (options.mode !== 'resume' &&
      (acceptance.expectedRevision !== repository?.head || manifest.expectedRevision !== repository?.head)) {
    errors.push('Acceptance report and evidence manifest are not bound to current HEAD.');
  }

  const mappingByDigest = new Map();
  for (const mapping of (Array.isArray(manifest.receipts) ? manifest.receipts : [])) {
    if (mappingByDigest.has(mapping.receiptSha256)) errors.push(`Duplicate manifest receipt digest: ${mapping.receiptSha256}`);
    mappingByDigest.set(mapping.receiptSha256, mapping);
    if (options.mode !== 'resume' && mapping.phase === 'green' && mapping.expectedRevision !== repository?.head) {
      errors.push(`GREEN receipt ${mapping.receiptId} is not evidence at current HEAD.`);
    }
  }
  const summarySet = new Set((Array.isArray(acceptance.receiptSummaries) ? acceptance.receiptSummaries : []).map((item) =>
    JSON.stringify([item.criterionId, item.phase, item.commandId, item.receiptId, item.receiptSha256, item.path])));
  const mappingSet = new Set((Array.isArray(manifest.receipts) ? manifest.receipts : []).map((item) =>
    JSON.stringify([item.criterionId, item.phase, item.commandId, item.receiptId, item.receiptSha256, item.path])));
  if (summarySet.size !== acceptance.receiptSummaries?.length || mappingSet.size !== manifest.receipts?.length ||
      summarySet.size !== mappingSet.size || [...summarySet].some((item) => !mappingSet.has(item))) {
    errors.push('Acceptance receipt digest set does not exactly equal the evidence manifest receipt set.');
  }
  if (receiptSnapshots.length !== mappingByDigest.size) errors.push('Supplied receipt set does not exactly equal the evidence manifest receipt set.');

  const recomputedAcceptance = await evaluateAcceptanceSnapshots({
    spec: specSnapshot,
    manifest: manifestSnapshot,
    receiptSnapshots,
    expectedSpecSha256: acceptance.specSha256,
    phase: acceptance.phase,
    expectedRevision: acceptance.expectedRevision ?? undefined,
    tool: evidenceToolSnapshot,
  });
  if (!isDeepStrictEqual(recomputedAcceptance, acceptance)) {
    errors.push('Acceptance report does not exactly equal full acceptance semantics recomputed from canonical source snapshots.');
  }

  const receiptRecords = [];
  const artifactRecords = [];
  const artifactSnapshots = new Map();
  const suppliedDigests = new Set();
  for (const [index, snapshot] of receiptSnapshots.entries()) {
    if (suppliedDigests.has(snapshot.sha256)) errors.push(`Duplicate supplied receipt digest: ${snapshot.sha256}`);
    suppliedDigests.add(snapshot.sha256);
    const mapping = mappingByDigest.get(snapshot.sha256);
    if (!mapping) {
      errors.push(`${snapshot.path} is not in the evidence manifest receipt set.`);
      continue;
    }
    if (resolve(dirname(manifestSnapshot.path), mapping.path) !== snapshot.path) errors.push(`${snapshot.path} does not match its manifest-relative receipt path.`);
    errors.push(...validateReceipt(snapshot.value, mapping, acceptance, mission, {
      worktree,
      head: repository?.head,
    }, evidenceToolSnapshot, `receipt[${index}]`));
    receiptRecords.push({ receiptId: mapping.receiptId, source: artifactIdentity(snapshot) });
    for (const artifact of (Array.isArray(snapshot.value.artifacts) ? snapshot.value.artifacts : [])) {
      artifactRecords.push({ receiptId: mapping.receiptId, ...artifact });
      try {
        let artifactSnapshot = artifactSnapshots.get(artifact.path);
        if (!artifactSnapshot) {
          artifactSnapshot = await snapshotFile(resolve(worktree, artifact.path));
          artifactSnapshots.set(artifact.path, artifactSnapshot);
        }
        if (artifactSnapshot.size !== artifact.bytes || artifactSnapshot.sha256 !== artifact.sha256) {
          errors.push(`Receipt ${mapping.receiptId} artifact ${artifact.path} does not match actual worktree bytes.`);
        }
      } catch (error) {
        errors.push(`Receipt ${mapping.receiptId} artifact ${artifact.path} is unavailable or unsafe: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  if ([...mappingByDigest.keys()].some((digest) => !suppliedDigests.has(digest))) errors.push('Evidence manifest contains a receipt not present in the supplied receipt set.');

  const changedPaths = repository ? orderedChangedPaths(worktree, plan.repository.baseRevision, repository.head) : [];
  for (const path of changedPaths) {
    if (!mission.writablePaths.some((ownedPath) => pathMatches(path, ownedPath))) errors.push(`Changed path is outside mission scope: ${path}`);
  }
  if (errors.length > 0) throw new Error(`Handoff compilation failed:\n- ${errors.join('\n- ')}`);

  const packet = {
    schemaVersion: 2,
    packetType: HANDOFF_PACKET_TYPE,
    authority: 'none',
    notice: HANDOFF_PACKET_NOTICE,
    mode: options.mode,
    compiledAt: new Date().toISOString(),
    tool: { name: 'handoff-compile', version: HANDOFF_PACKET_TOOL_VERSION },
    flight: { id: plan.flightId, plan: planIdentity },
    mission: {
      id: mission.id,
      title: mission.title,
      lane: mission.lane,
      writablePaths: [...mission.writablePaths],
      deliverables: [...mission.deliverables],
    },
    repository: {
      root: plan.repository.root,
      worktree,
      branch: mission.branch,
      baseRef: plan.repository.baseRef,
      baseRevision: plan.repository.baseRevision,
      head: repository.head,
      clean: true,
      changedPaths,
    },
    sequence: state.sequence,
    predecessor: state.predecessor,
    state: { source: artifactIdentity(stateSnapshot) },
    acceptance: {
      spec: artifactIdentity(specSnapshot),
      report: artifactIdentity(acceptanceSnapshot),
      manifest: artifactIdentity(manifestSnapshot),
      phase: acceptance.phase,
      ok: acceptance.ok,
      expectedRevision: acceptance.expectedRevision,
      receiptDigests: [...suppliedDigests].sort(compareUtf8),
    },
    evidence: {
      receipts: receiptRecords.sort((left, right) => compareUtf8(left.receiptId, right.receiptId)),
      artifacts: artifactRecords.sort((left, right) => compareUtf8(`${left.receiptId}\0${left.path}`, `${right.receiptId}\0${right.path}`)),
    },
  };
  const packetErrors = validateHandoffPacket(packet);
  if (packetErrors.length > 0) throw new Error(`Produced invalid handoff packet:\n- ${packetErrors.join('\n- ')}`);

  await mkdir(outputDirectory, { mode: 0o700 });
  const jsonPath = await writeNewFile(`${outputDirectory}/handoff.json`, stableJson(packet));
  const markdownPath = await writeNewFile(`${outputDirectory}/handoff.md`, makeMarkdown({ ...packet, stateStatus: state.status }));
  return { packet, jsonPath, markdownPath };
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const result = await compileHandoff(options);
  console.log(`Exact ${options.mode} packet: ${result.jsonPath}`);
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
