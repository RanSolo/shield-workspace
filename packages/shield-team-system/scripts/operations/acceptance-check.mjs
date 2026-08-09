#!/usr/bin/env node

import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  exactKeys,
  isPlainObject,
  nonEmptyString,
  readJsonSnapshot,
  SHA256_PATTERN,
  sha256,
  snapshotFile,
  stableJson,
  validateAcceptanceSpec,
  writeNewFile,
} from './common.mjs';
import { EVIDENCE_TOOL_NAME, EVIDENCE_TOOL_VERSION } from './evidence-run.mjs';

const TOOL_VERSION = '1.0.0';
const PHASES = new Set(['structure', 'red', 'green']);
const REVISION_PATTERN = /^[a-f0-9]{40,64}$/u;

const parseArguments = (argv) => {
  const options = { phase: 'structure' };
  while (argv.length > 0) {
    const option = argv.shift();
    if (option === '--spec') options.specPath = argv.shift();
    else if (option === '--manifest') options.manifestPath = argv.shift();
    else if (option === '--expected-spec-sha256') options.expectedSpecSha256 = argv.shift();
    else if (option === '--phase') options.phase = argv.shift();
    else if (option === '--expected-revision') options.expectedRevision = argv.shift();
    else if (option === '--markdown') options.markdown = argv.shift();
    else if (option === '--report') options.report = argv.shift();
    else throw new Error(`Unknown option: ${option}`);
  }
  if (!options.specPath || !options.manifestPath || !options.expectedSpecSha256) {
    throw new Error('Usage: acceptance-check.mjs --spec FILE --manifest FILE --expected-spec-sha256 SHA256 [--phase structure|red|green] [--expected-revision SHA] [--markdown FILE] [--report FILE]');
  }
  if (!PHASES.has(options.phase)) throw new Error(`Unknown phase: ${options.phase}`);
  if (options.phase !== 'structure' && !options.expectedRevision) throw new Error(`--expected-revision is required for phase ${options.phase}.`);
  return options;
};

const validateManifest = (manifest) => {
  const errors = [];
  if (!exactKeys(manifest, ['schemaVersion', 'manifestType', 'missionId', 'specSha256', 'phase', 'expectedRevision', 'receipts', 'redNotApplicable', 'manualEvidence'], 'manifest', errors)) return errors;
  if (manifest.schemaVersion !== 1) errors.push('manifest.schemaVersion must equal 1.');
  if (manifest.manifestType !== 'mission-evidence-manifest') errors.push('manifest.manifestType must equal mission-evidence-manifest.');
  if (!nonEmptyString(manifest.missionId)) errors.push('manifest.missionId must be a non-empty string.');
  if (!SHA256_PATTERN.test(manifest.specSha256)) errors.push('manifest.specSha256 must be a lowercase SHA-256 digest.');
  if (!PHASES.has(manifest.phase)) errors.push('manifest.phase must equal structure, red, or green.');
  if (manifest.expectedRevision !== null && !REVISION_PATTERN.test(manifest.expectedRevision)) errors.push('manifest.expectedRevision must be null or an exact Git revision.');

  if (!Array.isArray(manifest.receipts)) errors.push('manifest.receipts must be an array.');
  for (const [index, item] of (Array.isArray(manifest.receipts) ? manifest.receipts : []).entries()) {
    const label = `manifest.receipts[${index}]`;
    if (!exactKeys(item, ['criterionId', 'phase', 'commandId', 'receiptId', 'receiptSha256', 'path', 'expectedRevision'], label, errors)) continue;
    if (!nonEmptyString(item.criterionId)) errors.push(`${label}.criterionId must be a non-empty string.`);
    if (item.phase !== 'red' && item.phase !== 'green') errors.push(`${label}.phase must equal red or green.`);
    if (!nonEmptyString(item.commandId)) errors.push(`${label}.commandId must be a non-empty string.`);
    if (!nonEmptyString(item.receiptId)) errors.push(`${label}.receiptId must be a non-empty string.`);
    if (!SHA256_PATTERN.test(item.receiptSha256)) errors.push(`${label}.receiptSha256 must be a lowercase SHA-256 digest.`);
    if (!nonEmptyString(item.path) || isAbsolute(item.path)) errors.push(`${label}.path must be a relative path.`);
    if (!REVISION_PATTERN.test(item.expectedRevision)) errors.push(`${label}.expectedRevision must be an exact Git revision.`);
  }
  if (!Array.isArray(manifest.redNotApplicable)) errors.push('manifest.redNotApplicable must be an array.');
  for (const [index, item] of (Array.isArray(manifest.redNotApplicable) ? manifest.redNotApplicable : []).entries()) {
    const label = `manifest.redNotApplicable[${index}]`;
    if (!exactKeys(item, ['criterionId', 'rationale'], label, errors)) continue;
    if (!nonEmptyString(item.criterionId)) errors.push(`${label}.criterionId must be a non-empty string.`);
    if (!nonEmptyString(item.rationale)) errors.push(`${label}.rationale must be a non-empty string.`);
  }
  if (!Array.isArray(manifest.manualEvidence)) errors.push('manifest.manualEvidence must be an array.');
  for (const [index, item] of (Array.isArray(manifest.manualEvidence) ? manifest.manualEvidence : []).entries()) {
    const label = `manifest.manualEvidence[${index}]`;
    if (!exactKeys(item, ['criterionId', 'performedBy', 'performedAt', 'revision', 'observation'], label, errors)) continue;
    if (!nonEmptyString(item.criterionId)) errors.push(`${label}.criterionId must be a non-empty string.`);
    if (!nonEmptyString(item.performedBy)) errors.push(`${label}.performedBy must be a non-empty string.`);
    if (!nonEmptyString(item.performedAt) || Number.isNaN(Date.parse(item.performedAt))) errors.push(`${label}.performedAt must be an ISO-compatible timestamp.`);
    if (!REVISION_PATTERN.test(item.revision)) errors.push(`${label}.revision must be an exact Git revision.`);
    if (!nonEmptyString(item.observation)) errors.push(`${label}.observation must be a non-empty string.`);
  }
  return errors;
};

const validateOutput = (value, label, errors) => {
  if (!exactKeys(value, ['text', 'sha256', 'truncated'], label, errors)) return;
  if (typeof value.text !== 'string') errors.push(`${label}.text must be a string.`);
  if (!SHA256_PATTERN.test(value.sha256) || value.sha256 !== sha256(typeof value.text === 'string' ? value.text : '')) errors.push(`${label}.sha256 does not bind the stored output text.`);
  if (typeof value.truncated !== 'boolean') errors.push(`${label}.truncated must be boolean.`);
};

const validateReceipt = ({ receipt, mapping, spec, tool }) => {
  const errors = [];
  const rootKeys = ['schemaVersion', 'receiptType', 'receiptId', 'evidence', 'specSha256', 'commandId', 'command', 'repository', 'startedAt', 'completedAt', 'durationMs', 'timeoutMs', 'result', 'output', 'artifacts', 'tool'];
  if (!exactKeys(receipt, rootKeys, 'receipt', errors)) return errors;
  if (receipt.schemaVersion !== 1) errors.push('receipt.schemaVersion must equal 1.');
  if (receipt.receiptType !== 'mission-command-evidence') errors.push('receipt.receiptType must equal mission-command-evidence.');
  if (receipt.receiptId !== mapping.receiptId) errors.push('receipt.receiptId does not match its manifest binding.');
  if (receipt.specSha256 !== spec.sha256) errors.push('receipt.specSha256 does not match the acceptance spec.');
  if (receipt.commandId !== mapping.commandId) errors.push('receipt.commandId does not match its manifest binding.');

  if (exactKeys(receipt.evidence, ['classification', 'authority', 'provenance', 'executionAttestation'], 'receipt.evidence', errors)) {
    if (receipt.evidence.classification !== 'contract-relative-structural-evidence' || receipt.evidence.authority !== 'none' || receipt.evidence.provenance !== false || receipt.evidence.executionAttestation !== false) errors.push('receipt.evidence overstates or changes the non-authoritative evidence contract.');
  }
  const declaredCommand = (Array.isArray(spec.value?.commands) ? spec.value.commands : []).find((candidate) => candidate.id === mapping.commandId);
  if (!declaredCommand) errors.push(`Manifest references command not declared by spec: ${mapping.commandId}`);
  if (exactKeys(receipt.command, ['executable', 'argv'], 'receipt.command', errors) && declaredCommand) {
    if (receipt.command.executable !== declaredCommand.executable || JSON.stringify(receipt.command.argv) !== JSON.stringify(declaredCommand.argv)) errors.push('receipt.command does not exactly match the spec-declared executable and argv.');
  }
  if (exactKeys(receipt.repository, ['beforeRoot', 'beforeBranch', 'beforeHead', 'beforeClean', 'afterRoot', 'afterBranch', 'afterHead', 'afterClean'], 'receipt.repository', errors)) {
    if (receipt.repository.beforeRoot !== spec.value?.repository?.root || receipt.repository.afterRoot !== spec.value?.repository?.root || receipt.repository.beforeRoot !== receipt.repository.afterRoot) errors.push('receipt repository roots do not match the acceptance spec and each other.');
    if (receipt.repository.beforeBranch !== spec.value?.repository?.branch || receipt.repository.afterBranch !== spec.value?.repository?.branch || receipt.repository.beforeBranch !== receipt.repository.afterBranch) errors.push('receipt repository branches do not match the acceptance spec and each other.');
    if (receipt.repository.beforeHead !== mapping.expectedRevision || receipt.repository.afterHead !== mapping.expectedRevision) errors.push('receipt does not bind clean before and after state to the manifest revision.');
    if (receipt.repository.beforeClean !== true || receipt.repository.afterClean !== true) errors.push('receipt does not bind clean before and after worktree state.');
  }
  if (!nonEmptyString(receipt.startedAt) || Number.isNaN(Date.parse(receipt.startedAt)) || !nonEmptyString(receipt.completedAt) || Number.isNaN(Date.parse(receipt.completedAt))) errors.push('receipt timestamps must be valid.');
  const measuredDuration = Date.parse(receipt.completedAt) - Date.parse(receipt.startedAt);
  if (!Number.isInteger(receipt.durationMs) || receipt.durationMs < 0 || receipt.durationMs !== measuredDuration) errors.push('receipt.durationMs does not match its timestamps.');
  if (receipt.timeoutMs !== declaredCommand?.timeoutMs) errors.push('receipt.timeoutMs does not match the spec-declared timeout.');

  if (exactKeys(receipt.result, ['status', 'exitCode', 'signal', 'timedOut', 'spawnError', 'artifactErrors'], 'receipt.result', errors)) {
    if (!['completed', 'timed-out', 'spawn-failed'].includes(receipt.result.status)) errors.push('receipt.result.status is unsupported.');
    if (receipt.result.exitCode !== null && !Number.isInteger(receipt.result.exitCode)) errors.push('receipt.result.exitCode must be an integer or null.');
    if (receipt.result.signal !== null && !nonEmptyString(receipt.result.signal)) errors.push('receipt.result.signal must be a non-empty string or null.');
    if (typeof receipt.result.timedOut !== 'boolean') errors.push('receipt.result.timedOut must be boolean.');
    if (receipt.result.spawnError !== null && typeof receipt.result.spawnError !== 'string') errors.push('receipt.result.spawnError must be a string or null.');
    if (receipt.result.status === 'completed' && (receipt.result.timedOut || receipt.result.spawnError !== null)) errors.push('completed receipt has contradictory timeout or spawn failure state.');
    if (receipt.result.status === 'timed-out' && !receipt.result.timedOut) errors.push('timed-out receipt must set timedOut true.');
    if (receipt.result.status === 'spawn-failed' && !nonEmptyString(receipt.result.spawnError)) errors.push('spawn-failed receipt must include spawnError.');
    if (!Array.isArray(receipt.result.artifactErrors)) errors.push('receipt.result.artifactErrors must be an array.');
    for (const [index, item] of (Array.isArray(receipt.result.artifactErrors) ? receipt.result.artifactErrors : []).entries()) {
      if (!exactKeys(item, ['path', 'error'], `receipt.result.artifactErrors[${index}]`, errors)) continue;
      if (!nonEmptyString(item.path) || !nonEmptyString(item.error)) errors.push(`receipt.result.artifactErrors[${index}] requires path and error.`);
    }
  }
  if (exactKeys(receipt.output, ['stdout', 'stderr'], 'receipt.output', errors)) {
    validateOutput(receipt.output.stdout, 'receipt.output.stdout', errors);
    validateOutput(receipt.output.stderr, 'receipt.output.stderr', errors);
  }
  if (!Array.isArray(receipt.artifacts)) errors.push('receipt.artifacts must be an array.');
  for (const [index, item] of (Array.isArray(receipt.artifacts) ? receipt.artifacts : []).entries()) {
    const label = `receipt.artifacts[${index}]`;
    if (!exactKeys(item, ['path', 'bytes', 'sha256'], label, errors)) continue;
    if (!nonEmptyString(item.path) || !Number.isInteger(item.bytes) || item.bytes < 0 || !SHA256_PATTERN.test(item.sha256)) errors.push(`${label} is malformed.`);
  }
  if (declaredCommand) {
    const recordedPaths = [...(receipt.artifacts ?? []).map((item) => item.path), ...(receipt.result?.artifactErrors ?? []).map((item) => item.path)];
    if (new Set(recordedPaths).size !== recordedPaths.length || JSON.stringify([...recordedPaths].sort()) !== JSON.stringify([...declaredCommand.artifacts].sort())) errors.push('receipt artifact results do not exactly equal the spec-declared artifact set.');
  }
  if (exactKeys(receipt.tool, ['name', 'version', 'path', 'sha256'], 'receipt.tool', errors)) {
    if (receipt.tool.name !== EVIDENCE_TOOL_NAME || receipt.tool.version !== EVIDENCE_TOOL_VERSION || receipt.tool.path !== tool.path || receipt.tool.sha256 !== tool.sha256) errors.push('receipt.tool does not match the current evidence-run tool identity and hash.');
  }
  return errors;
};

const makeMarkdown = (report) => {
  const rows = report.criteria.map((criterion) => `| ${criterion.id} | ${criterion.mode} | ${criterion.redEvidence} | ${criterion.greenEvidence} | ${criterion.manualEvidence} |`);
  const errorSection = report.errors.length === 0 ? 'No traceability errors detected.' : report.errors.map((error) => `- ${error}`).join('\n');
  return `# Acceptance traceability: ${report.missionId}\n\n` +
    `Phase: **${report.phase}**  \n` +
    `Disposition: **${report.ok ? 'PASS' : 'FAIL'}**  \n` +
    `Evidence classification: **contract-relative structural evidence; authority:none**  \n` +
    `Expected revision: \`${report.expectedRevision ?? 'not required'}\`\n\n` +
    `| Criterion | Mode | RED receipts | GREEN receipts | Manual records |\n` +
    `| --- | --- | ---: | ---: | ---: |\n${rows.join('\n')}\n\n` +
    `## Findings\n\n${errorSection}\n`;
};

export const evaluateAcceptanceSnapshots = async ({
  spec,
  manifest,
  receiptSnapshots,
  expectedSpecSha256,
  phase = 'structure',
  expectedRevision,
  tool,
}) => {
  if (!PHASES.has(phase)) throw new Error(`Unknown phase: ${phase}`);
  if (!SHA256_PATTERN.test(expectedSpecSha256 ?? '')) throw new Error('Expected spec SHA-256 must be a lowercase digest.');
  if (phase !== 'structure' && !REVISION_PATTERN.test(expectedRevision ?? '')) throw new Error(`An exact expected revision is required for phase ${phase}.`);
  const specValue = isPlainObject(spec.value) ? spec.value : {};
  const manifestValue = isPlainObject(manifest.value) ? manifest.value : {};
  const errors = validateAcceptanceSpec(spec.value);
  if (nonEmptyString(specValue.repository?.root)) {
    const canonicalRoot = await realpath(specValue.repository.root).catch(() => undefined);
    if (canonicalRoot !== specValue.repository.root) errors.push('Acceptance spec repository root is not an existing canonical path.');
  }
  if (spec.sha256 !== expectedSpecSha256) errors.push(`Acceptance spec digest is ${spec.sha256}; expected ${expectedSpecSha256}.`);
  errors.push(...validateManifest(manifest.value));
  if (manifestValue.missionId !== specValue.missionId) errors.push('Evidence manifest missionId does not match the acceptance spec.');
  if (manifestValue.specSha256 !== spec.sha256) errors.push('Evidence manifest does not bind the snapshotted acceptance spec digest.');
  if (manifestValue.phase !== phase) errors.push(`Evidence manifest phase is ${manifestValue.phase}; expected ${phase}.`);
  if (manifestValue.expectedRevision !== (expectedRevision ?? null)) errors.push('Evidence manifest expectedRevision does not match the requested gate revision.');
  if (phase === 'structure' && ((manifestValue.receipts?.length ?? 0) !== 0 || (manifestValue.redNotApplicable?.length ?? 0) !== 0 || (manifestValue.manualEvidence?.length ?? 0) !== 0)) errors.push('Structure manifest must not contain post-run evidence.');
  if (phase === 'red' && (manifestValue.manualEvidence?.length ?? 0) !== 0) errors.push('RED manifest must not contain manual GREEN evidence.');

  const receiptSummaries = [];
  const receiptsById = new Map();
  const suppliedByPath = new Map();
  for (const snapshot of receiptSnapshots) {
    if (suppliedByPath.has(snapshot.path)) errors.push(`Supplied receipt snapshot path is duplicated: ${snapshot.path}.`);
    suppliedByPath.set(snapshot.path, snapshot);
  }
  const seenIds = new Set();
  const seenDigests = new Set();
  const seenPaths = new Set();
  const consumedPaths = new Set();
  const manifestDirectory = dirname(manifest.path);
  const manifestReceipts = Array.isArray(manifestValue.receipts) ? manifestValue.receipts : [];
  for (const [index, mapping] of manifestReceipts.entries()) {
    const label = `manifest.receipts[${index}]`;
    if (!isPlainObject(mapping)) continue;
    if (seenIds.has(mapping.receiptId)) errors.push(`${label} reuses receipt ID ${mapping.receiptId}.`);
    if (seenDigests.has(mapping.receiptSha256)) errors.push(`${label} reuses receipt digest ${mapping.receiptSha256}.`);
    if (seenPaths.has(mapping.path)) errors.push(`${label} reuses receipt path ${mapping.path}.`);
    seenIds.add(mapping.receiptId);
    seenDigests.add(mapping.receiptSha256);
    seenPaths.add(mapping.path);
    const receiptPath = resolve(manifestDirectory, mapping.path ?? '');
    const pathFromManifest = relative(manifestDirectory, receiptPath);
    if (!mapping.path || pathFromManifest === '..' || pathFromManifest.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
      errors.push(`${label}.path escapes the manifest directory.`);
      continue;
    }
    const receipt = suppliedByPath.get(receiptPath);
    if (!receipt) {
      errors.push(`${label}: exact receipt snapshot is absent.`);
      continue;
    }
    consumedPaths.add(receipt.path);
    if (receipt.sha256 !== mapping.receiptSha256) errors.push(`${label} digest does not match the snapshotted receipt bytes.`);
    errors.push(...validateReceipt({ receipt: receipt.value, mapping, spec, tool }).map((error) => `${label}: ${error}`));
    receiptsById.set(mapping.receiptId, receipt.value);
    receiptSummaries.push({ criterionId: mapping.criterionId, phase: mapping.phase, commandId: mapping.commandId, receiptId: mapping.receiptId, receiptSha256: receipt.sha256, path: mapping.path });
  }
  if (receiptSummaries.length !== manifestReceipts.length || seenIds.size !== manifestReceipts.length ||
      seenDigests.size !== manifestReceipts.length || consumedPaths.size !== suppliedByPath.size) {
    errors.push('Manifest and snapshotted receipt sets are not exactly equal.');
  }

  const specCriteria = Array.isArray(specValue.criteria) ? specValue.criteria : [];
  const criterionById = new Map(specCriteria.map((criterion) => [criterion.id, criterion]));
  const rationaleIds = new Set();
  for (const item of (Array.isArray(manifestValue.redNotApplicable) ? manifestValue.redNotApplicable : [])) {
    if (!isPlainObject(item)) continue;
    const criterion = criterionById.get(item.criterionId);
    if (!criterion || criterion.validation?.mode !== 'automated') errors.push(`RED rationale references non-automated criterion ${item.criterionId}.`);
    if (rationaleIds.has(item.criterionId)) errors.push(`Duplicate RED rationale for ${item.criterionId}.`);
    rationaleIds.add(item.criterionId);
  }
  const manualIds = new Set();
  for (const item of (Array.isArray(manifestValue.manualEvidence) ? manifestValue.manualEvidence : [])) {
    if (!isPlainObject(item)) continue;
    const criterion = criterionById.get(item.criterionId);
    if (!criterion || criterion.validation?.mode !== 'manual') errors.push(`Manual evidence references non-manual criterion ${item.criterionId}.`);
    if (manualIds.has(item.criterionId)) errors.push(`Duplicate manual evidence for ${item.criterionId}.`);
    if (item.revision !== expectedRevision) errors.push(`${item.criterionId} manual evidence revision does not match the gate revision.`);
    manualIds.add(item.criterionId);
  }

  for (const mapping of manifestReceipts) {
    if (!isPlainObject(mapping)) continue;
    const criterion = criterionById.get(mapping.criterionId);
    if (!criterion || criterion.validation?.mode !== 'automated') {
      errors.push(`Receipt mapping references non-automated criterion ${mapping.criterionId}.`);
      continue;
    }
    if (!Array.isArray(criterion.validation.commandIds) || !criterion.validation.commandIds.includes(mapping.commandId)) errors.push(`${mapping.criterionId} does not declare command ${mapping.commandId}.`);
    if (phase === 'red' && mapping.phase !== 'red') errors.push('RED manifest may contain only RED receipts.');
    if (phase === 'red' && mapping.phase === 'red' && mapping.expectedRevision !== expectedRevision) errors.push(`${mapping.criterionId} RED receipt is not bound to the RED gate revision.`);
    if (phase === 'green' && mapping.phase === 'green' && mapping.expectedRevision !== expectedRevision) errors.push(`${mapping.criterionId} GREEN receipt is not bound to the gate revision.`);
    const receipt = receiptsById.get(mapping.receiptId);
    if (receipt && mapping.phase === 'red' && (receipt.result?.status !== 'completed' || !Number.isInteger(receipt.result?.exitCode) || receipt.result.exitCode === 0)) errors.push(`${mapping.criterionId} RED receipt must record a completed failing command.`);
    if (receipt && mapping.phase === 'green' && (receipt.result?.status !== 'completed' || receipt.result?.exitCode !== 0 || receipt.result?.timedOut !== false || receipt.result?.artifactErrors?.length !== 0)) errors.push(`${mapping.criterionId} GREEN receipt must record a completed successful command and all artifact hashes.`);
  }

  if (phase !== 'structure') {
    for (const criterion of specCriteria) {
      if (!isPlainObject(criterion) || !isPlainObject(criterion.validation)) continue;
      if (criterion.validation.mode === 'automated') {
        const mappings = manifestReceipts.filter((item) => isPlainObject(item) && item.criterionId === criterion.id);
        const redMappings = mappings.filter((item) => item.phase === 'red');
        const greenMappings = mappings.filter((item) => item.phase === 'green');
        if (redMappings.length === 0 && !rationaleIds.has(criterion.id)) errors.push(`${criterion.id} requires RED evidence or a RED-not-applicable rationale.`);
        if (phase === 'green' && greenMappings.length === 0) errors.push(`${criterion.id} requires GREEN evidence.`);
      } else if (phase === 'green' && !manualIds.has(criterion.id)) {
        errors.push(`${criterion.id} requires manual evidence.`);
      }
    }
  }

  return {
    schemaVersion: 1,
    reportType: 'acceptance-traceability',
    evidence: { classification: 'contract-relative-structural-evidence', authority: 'none', provenance: false, executionAttestation: false },
    tool: { name: 'acceptance-check', version: TOOL_VERSION },
    missionId: specValue.missionId ?? null,
    source: specValue.source ?? null,
    specPath: spec.path,
    specSha256: spec.sha256,
    manifestPath: manifest.path,
    manifestSha256: manifest.sha256,
    phase,
    expectedRevision: expectedRevision ?? null,
    ok: errors.length === 0,
    errors,
    receiptSummaries,
    criteria: specCriteria.map((criterion) => ({
      id: criterion.id,
      sourceText: criterion.sourceText,
      mode: criterion.validation?.mode,
      redEvidence: manifestReceipts.filter((item) => item.criterionId === criterion.id && item.phase === 'red').length,
      greenEvidence: manifestReceipts.filter((item) => item.criterionId === criterion.id && item.phase === 'green').length,
      manualEvidence: (Array.isArray(manifestValue.manualEvidence) ? manifestValue.manualEvidence : []).filter((item) => item.criterionId === criterion.id).length,
    })),
  };
};

export const checkAcceptance = async ({ specPath, manifestPath, expectedSpecSha256, phase = 'structure', expectedRevision }, injected = {}) => {
  if (!PHASES.has(phase)) throw new Error(`Unknown phase: ${phase}`);
  if (!SHA256_PATTERN.test(expectedSpecSha256 ?? '')) throw new Error('Expected spec SHA-256 must be a lowercase digest.');
  if (phase !== 'structure' && !REVISION_PATTERN.test(expectedRevision ?? '')) throw new Error(`An exact expected revision is required for phase ${phase}.`);

  const [spec, manifest, tool] = await Promise.all([
    readJsonSnapshot(specPath, injected.snapshotDependencies),
    readJsonSnapshot(manifestPath, injected.snapshotDependencies),
    snapshotFile(fileURLToPath(new URL('./evidence-run.mjs', import.meta.url))),
  ]);
  const manifestReceipts = Array.isArray(manifest.value?.receipts) ? manifest.value.receipts : [];
  const receiptPaths = new Set();
  for (const mapping of manifestReceipts) {
    if (!isPlainObject(mapping) || !nonEmptyString(mapping.path)) continue;
    const receiptPath = resolve(dirname(manifest.path), mapping.path);
    const relativePath = relative(dirname(manifest.path), receiptPath);
    if (relativePath === '..' || relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) continue;
    receiptPaths.add(receiptPath);
  }
  const receiptSnapshots = (await Promise.all([...receiptPaths].map((path) =>
    readJsonSnapshot(path, injected.snapshotDependencies).catch(() => null)))).filter((snapshot) => snapshot !== null);
  return evaluateAcceptanceSnapshots({
    spec,
    manifest,
    receiptSnapshots,
    expectedSpecSha256,
    phase,
    expectedRevision,
    tool,
  });
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const report = await checkAcceptance(options);
  const markdown = makeMarkdown(report);
  if (options.markdown) await writeNewFile(options.markdown, markdown);
  if (options.report) await writeNewFile(options.report, stableJson(report));
  process.stdout.write(markdown);
  if (!report.ok) process.exitCode = 2;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
