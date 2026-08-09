#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import {
  SHA256_PATTERN,
  canonicalExistingPath,
  exactKeys,
  git,
  inspectGit,
  isPlainObject,
  nonEmptyString,
  readJsonSnapshot,
  snapshotFile,
  stableJson,
  writeNewFile,
} from './common.mjs';
import { assertPlan, canonicalRelativePath, GIT_REVISION_PATTERN, pathMatches } from './flight-common.mjs';
import { evaluateAcceptanceSnapshots } from './acceptance-check.mjs';
import {
  sameArtifactIdentity,
  validateAcceptanceReport,
  validateEvidenceManifest,
  validateHandoffPacket,
  validateReceipt,
} from './handoff-compile.mjs';
import {
  artifactIdentity,
  validateHandoffPredecessor,
  validateHandoffState,
} from './handoff-state.mjs';
import { assertOutputOutsideFlightWorktrees, compareUtf8, orderedChangedPaths } from './convergence-common.mjs';

export const INTEGRATION_REPORT_TYPE = 'feature-flight-integration-check';
export const INTEGRATION_REPORT_NOTICE = 'Compatibility evidence only. This report grants no merge authority and performs no merge, approval, publication, deployment, or release.';
export const INTEGRATION_REPORT_TOOL_VERSION = '1.0.0';

const validateArtifact = (value, label, errors) => {
  if (!exactKeys(value, ['path', 'bytes', 'sha256'], label, errors)) return;
  if (!nonEmptyString(value.path) || !Number.isSafeInteger(value.bytes) || value.bytes < 0 ||
      !SHA256_PATTERN.test(value.sha256 ?? '')) errors.push(`${label} is malformed.`);
};

const validateSourceSet = (sources, label, errors, registerSource) => {
  if (!exactKeys(sources, ['state', 'predecessor', 'acceptance', 'spec', 'manifest', 'receipts', 'artifacts'], label, errors)) return;
  if (sources.state !== null) validateArtifact(sources.state, `${label}.state`, errors);
  if (sources.predecessor !== null) validateArtifact(sources.predecessor, `${label}.predecessor`, errors);
  if (sources.acceptance !== null) validateArtifact(sources.acceptance, `${label}.acceptance`, errors);
  if (sources.spec !== null) validateArtifact(sources.spec, `${label}.spec`, errors);
  if (sources.manifest !== null) validateArtifact(sources.manifest, `${label}.manifest`, errors);
  for (const [role, source] of [['state', sources.state], ['predecessor', sources.predecessor], ['acceptance', sources.acceptance], ['spec', sources.spec], ['manifest', sources.manifest]]) {
    if (source !== null) registerSource(source, `${label}.${role}`);
  }
  if (!Array.isArray(sources.receipts)) errors.push(`${label}.receipts must be an array.`);
  for (const [index, receipt] of (Array.isArray(sources.receipts) ? sources.receipts : []).entries()) {
    const receiptLabel = `${label}.receipts[${index}]`;
    if (!exactKeys(receipt, ['receiptId', 'source'], receiptLabel, errors)) continue;
    if (!nonEmptyString(receipt.receiptId)) errors.push(`${receiptLabel}.receiptId is malformed.`);
    validateArtifact(receipt.source, `${receiptLabel}.source`, errors);
    registerSource(receipt.source, receiptLabel);
  }
  if (!Array.isArray(sources.artifacts)) errors.push(`${label}.artifacts must be an array.`);
  for (const [index, artifact] of (Array.isArray(sources.artifacts) ? sources.artifacts : []).entries()) {
    const artifactLabel = `${label}.artifacts[${index}]`;
    if (!exactKeys(artifact, ['receiptId', 'artifactPath', 'source'], artifactLabel, errors)) continue;
    if (!nonEmptyString(artifact.receiptId) || !nonEmptyString(artifact.artifactPath)) errors.push(`${artifactLabel} identity is malformed.`);
    validateArtifact(artifact.source, `${artifactLabel}.source`, errors);
    registerSource(artifact.source, artifactLabel);
  }
};

export const validateIntegrationReport = (report) => {
  const errors = [];
  if (!exactKeys(report, [
    'schemaVersion', 'reportType', 'authority', 'notice', 'tool', 'checkedAt', 'flightId',
    'targetMissionId', 'integrationBranch', 'plan', 'ok', 'errors', 'dependencyEvidence',
  ], 'report', errors)) return errors;
  if (report.schemaVersion !== 2 || report.reportType !== INTEGRATION_REPORT_TYPE) errors.push('Integration report contract is unsupported.');
  if (report.authority !== 'none' || report.notice !== INTEGRATION_REPORT_NOTICE) errors.push('Integration report authority or notice is unsupported.');
  if (exactKeys(report.tool, ['name', 'version'], 'report.tool', errors) &&
      (report.tool.name !== 'integration-check' || report.tool.version !== INTEGRATION_REPORT_TOOL_VERSION)) errors.push('Integration report producer is unsupported.');
  if (!nonEmptyString(report.checkedAt) || Number.isNaN(Date.parse(report.checkedAt))) errors.push('report.checkedAt must be a timestamp string.');
  if (![report.flightId, report.targetMissionId, report.integrationBranch].every(nonEmptyString)) errors.push('Integration report identity is malformed.');
  validateArtifact(report.plan, 'report.plan', errors);
  if (typeof report.ok !== 'boolean' || !Array.isArray(report.errors) || report.errors.some((item) => !nonEmptyString(item))) errors.push('Integration report result is malformed.');
  if (Array.isArray(report.errors) && report.ok !== (report.errors.length === 0)) errors.push('report.ok must exactly reflect whether errors is empty.');
  if (!Array.isArray(report.dependencyEvidence)) errors.push('report.dependencyEvidence must be an array.');
  const sourcePaths = new Map();
  const registerSource = (source, label) => {
    if (!nonEmptyString(source?.path)) return;
    const previous = sourcePaths.get(source.path);
    if (previous !== undefined) errors.push(`${label} reuses canonical source path already registered by ${previous}.`);
    else sourcePaths.set(source.path, label);
  };
  for (const [index, evidence] of (Array.isArray(report.dependencyEvidence) ? report.dependencyEvidence : []).entries()) {
    const label = `report.dependencyEvidence[${index}]`;
    if (!exactKeys(evidence, ['missionId', 'worktree', 'branch', 'revision', 'changedPaths', 'packet', 'sources'], label, errors)) continue;
    if (![evidence.missionId, evidence.worktree, evidence.branch].every(nonEmptyString) ||
        !GIT_REVISION_PATTERN.test(evidence.revision ?? '') || !Array.isArray(evidence.changedPaths) ||
        evidence.changedPaths.some((path) => canonicalRelativePath(path) !== path)) errors.push(`${label} is malformed.`);
    validateArtifact(evidence.packet, `${label}.packet`, errors);
    validateSourceSet(evidence.sources, `${label}.sources`, errors, registerSource);
  }
  return errors;
};

const parseJsonSnapshot = (snapshot, label, errors) => {
  try {
    return JSON.parse(snapshot.bytes.toString('utf8'));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : error}`);
    return undefined;
  }
};

const sourceReader = () => {
  const observations = new Map();
  const registrations = new Map();
  return async (identity, label, errors, { json = true, logicalSource } = {}) => {
    if (!isPlainObject(logicalSource)) {
      errors.push(`${label} has no closed packet/role logical source identity.`);
      return undefined;
    }
    if (!identity || !nonEmptyString(identity.path)) {
      errors.push(`${label} has no bound source path.`);
      return undefined;
    }
    const canonical = await canonicalExistingPath(identity.path).catch(() => undefined);
    const cacheKey = canonical ?? identity.path;
    if (canonical !== undefined) {
      const registration = JSON.stringify(logicalSource);
      const previous = registrations.get(canonical);
      if (previous !== undefined && previous.registration !== registration) {
        errors.push(`${label} reuses canonical source ${canonical} already registered by ${previous.label}.`);
      } else if (previous === undefined) {
        registrations.set(canonical, { registration, label });
      }
    }
    let observation = observations.get(cacheKey);
    if (!observation) {
      try {
        observation = { snapshot: await snapshotFile(identity.path), error: null };
      } catch (error) {
        observation = { snapshot: null, error: error instanceof Error ? error.message : String(error) };
      }
      observations.set(cacheKey, observation);
    }
    if (!observation.snapshot) {
      errors.push(`${label} source is absent or unsafe: ${observation.error}`);
      return undefined;
    }
    const { snapshot } = observation;
    if (canonical !== identity.path || snapshot.path !== identity.path) {
      errors.push(`${label} source path is aliased or non-canonical.`);
    }
    if (!sameArtifactIdentity(identity, artifactIdentity(snapshot))) {
      errors.push(`${label} source bytes or digest do not match the packet binding.`);
    }
    return json ? { ...snapshot, value: parseJsonSnapshot(snapshot, label, errors) } : snapshot;
  };
};

const bindingKey = (item) => JSON.stringify([
  item?.criterionId,
  item?.phase,
  item?.commandId,
  item?.receiptId,
  item?.receiptSha256,
  item?.path,
]);

const artifactKey = (item) => JSON.stringify([item?.receiptId, item?.path, item?.bytes, item?.sha256]);

const replayPacketSources = async ({
  packet,
  packetSource,
  mission,
  plan,
  planIdentity,
  worktree,
  head,
  evidenceTool,
  readSource,
  errors,
}) => {
  const sourceEvidence = {
    state: null,
    predecessor: null,
    acceptance: null,
    spec: null,
    manifest: null,
    receipts: [],
    artifacts: [],
  };
  const logicalSource = (role, detail = {}) => ({
    packetPath: packetSource.path,
    packetSha256: packetSource.sha256,
    missionId: mission.id,
    role,
    ...detail,
  });
  const packetReceiptList = Array.isArray(packet.evidence?.receipts) ? packet.evidence.receipts : [];
  const packetReceipts = new Map(packetReceiptList.map((receipt) => [receipt?.source?.sha256, receipt]));
  const receiptSnapshots = new Map();
  for (const [index, packetReceipt] of packetReceiptList.entries()) {
    const receiptSnapshot = await readSource(packetReceipt?.source, `${mission.id} packet receipt[${index}]`, errors, {
      logicalSource: logicalSource('receipt', { receiptId: packetReceipt?.receiptId }),
    });
    if (!receiptSnapshot) continue;
    sourceEvidence.receipts.push({ receiptId: packetReceipt.receiptId, source: artifactIdentity(receiptSnapshot) });
    receiptSnapshots.set(packetReceipt.source.sha256, receiptSnapshot);
  }

  const stateSnapshot = await readSource(packet.state?.source, `${mission.id} state`, errors, {
    logicalSource: logicalSource('state'),
  });
  const state = stateSnapshot?.value;
  if (isPlainObject(state)) {
    errors.push(...validateHandoffState(plan, planIdentity, state, `${mission.id} state`));
    if (state.flight?.id !== plan.flightId || state.mission?.id !== mission.id ||
        state.repository?.root !== plan.repository.root || state.repository?.worktree !== mission.worktree ||
        state.repository?.branch !== mission.branch || state.repository?.baseRevision !== plan.repository.baseRevision ||
        state.repository?.head !== head || state.sequence !== packet.sequence ||
        JSON.stringify(state.predecessor) !== JSON.stringify(packet.predecessor)) {
      errors.push(`${mission.id} state source does not exactly match packet and live repository identity.`);
    }
    if (packet.sequence === 0 && packet.predecessor !== null) errors.push(`${mission.id} genesis packet has predecessor evidence.`);
    if (packet.sequence > 0 && packet.predecessor) {
      const predecessorSnapshot = await readSource(packet.predecessor, `${mission.id} predecessor state`, errors, {
        logicalSource: logicalSource('predecessor'),
      });
      if (isPlainObject(predecessorSnapshot?.value)) {
        errors.push(...validateHandoffState(plan, planIdentity, predecessorSnapshot.value, `${mission.id} predecessor`));
        validateHandoffPredecessor(state, predecessorSnapshot, packet.predecessor.sha256, errors);
        sourceEvidence.predecessor = artifactIdentity(predecessorSnapshot);
      }
    }
  }

  const acceptanceSnapshot = await readSource(packet.acceptance?.report, `${mission.id} acceptance report`, errors, {
    logicalSource: logicalSource('acceptance'),
  });
  const specSnapshot = await readSource(packet.acceptance?.spec, `${mission.id} acceptance spec`, errors, {
    logicalSource: logicalSource('spec'),
  });
  const manifestSnapshot = await readSource(packet.acceptance?.manifest, `${mission.id} evidence manifest`, errors, {
    logicalSource: logicalSource('manifest'),
  });
  const acceptance = acceptanceSnapshot?.value;
  const spec = specSnapshot?.value;
  const manifest = manifestSnapshot?.value;
  if (acceptance !== undefined) errors.push(...validateAcceptanceReport(acceptance).map((error) => `${mission.id}: ${error}`));
  if (manifest !== undefined) errors.push(...validateEvidenceManifest(manifest).map((error) => `${mission.id}: ${error}`));
  if (isPlainObject(acceptance) && isPlainObject(spec) && isPlainObject(manifest)) {
    const acceptanceSummaries = Array.isArray(acceptance.receiptSummaries) ? acceptance.receiptSummaries : [];
    const manifestReceipts = Array.isArray(manifest.receipts) ? manifest.receipts : [];
    if (acceptance.missionId !== mission.id || spec.missionId !== mission.id || manifest.missionId !== mission.id ||
        acceptance.specPath !== specSnapshot.path || acceptance.specSha256 !== specSnapshot.sha256 ||
        acceptance.manifestPath !== manifestSnapshot.path || acceptance.manifestSha256 !== manifestSnapshot.sha256 ||
        acceptance.specSha256 !== manifest.specSha256 || acceptance.phase !== manifest.phase ||
        acceptance.expectedRevision !== manifest.expectedRevision || acceptance.phase !== packet.acceptance?.phase ||
        acceptance.ok !== packet.acceptance?.ok || acceptance.expectedRevision !== packet.acceptance?.expectedRevision) {
      errors.push(`${mission.id} acceptance report, manifest, and packet bindings do not exactly agree.`);
    }
    const canonicalSpecRoot = nonEmptyString(spec.repository?.root)
      ? await canonicalExistingPath(spec.repository.root).catch(() => undefined)
      : undefined;
    if (canonicalSpecRoot !== worktree || spec.repository?.root !== worktree || spec.repository?.branch !== mission.branch) {
      errors.push(`${mission.id} acceptance spec repository root or branch does not exactly match the canonical planned mission worktree.`);
    }
    if (acceptance.phase !== 'green' || acceptance.ok !== true || acceptance.errors?.length !== 0 ||
        acceptance.expectedRevision !== head) {
      errors.push(`${mission.id} replayed acceptance is not passing GREEN evidence at live HEAD.`);
    }

    const summaries = new Set(acceptanceSummaries.map(bindingKey));
    const mappings = new Set(manifestReceipts.map(bindingKey));
    if (summaries.size !== acceptanceSummaries.length || mappings.size !== manifestReceipts.length ||
        summaries.size !== mappings.size || [...summaries].some((key) => !mappings.has(key))) {
      errors.push(`${mission.id} replayed acceptance receipt set does not exactly equal its manifest set.`);
    }

    const packetReceiptDigests = Array.isArray(packet.acceptance?.receiptDigests)
      ? packet.acceptance.receiptDigests
      : [];
    const acceptedDigests = new Set(packetReceiptDigests);
    const manifestDigests = new Set(manifestReceipts.map((mapping) => mapping.receiptSha256));
    if (packetReceipts.size !== packetReceiptList.length || acceptedDigests.size !== packetReceiptDigests.length ||
        manifestDigests.size !== manifestReceipts.length || packetReceipts.size !== manifestDigests.size ||
        [...manifestDigests].some((digest) => !packetReceipts.has(digest) || !acceptedDigests.has(digest))) {
      errors.push(`${mission.id} packet, acceptance, and manifest receipt digest sets differ.`);
    }

    const replayedArtifacts = [];
    for (const [index, mapping] of manifestReceipts.entries()) {
      if (!isPlainObject(mapping)) continue;
      const packetReceipt = packetReceipts.get(mapping.receiptSha256);
      if (!packetReceipt) continue;
      const receiptSnapshot = receiptSnapshots.get(mapping.receiptSha256);
      if (!receiptSnapshot) continue;
      if (resolve(dirname(manifestSnapshot.path), mapping.path) !== receiptSnapshot.path ||
          packetReceipt.receiptId !== mapping.receiptId) {
        errors.push(`${mission.id} receipt ${mapping.receiptId} source path or identity was substituted.`);
      }
      if (isPlainObject(receiptSnapshot.value)) {
        errors.push(...validateReceipt(receiptSnapshot.value, mapping, acceptance, mission, {
          worktree,
          head,
        }, evidenceTool, `${mission.id} receipt[${index}]`));
        for (const artifact of (Array.isArray(receiptSnapshot.value.artifacts) ? receiptSnapshot.value.artifacts : [])) {
          if (!isPlainObject(artifact)) continue;
          const expected = { receiptId: mapping.receiptId, ...artifact };
          replayedArtifacts.push(expected);
          const absolutePath = resolve(worktree, artifact.path);
          const actual = await readSource({ path: absolutePath, bytes: artifact.bytes, sha256: artifact.sha256 },
            `${mission.id} receipt artifact ${artifact.path}`, errors, {
              json: false,
              logicalSource: logicalSource('artifact', { receiptId: mapping.receiptId, artifactPath: artifact.path }),
            });
          if (actual) sourceEvidence.artifacts.push({
            receiptId: mapping.receiptId,
            artifactPath: artifact.path,
            source: artifactIdentity(actual),
          });
        }
      }
    }
    const expectedArtifacts = [...replayedArtifacts].sort((left, right) => compareUtf8(artifactKey(left), artifactKey(right)));
    const packetArtifacts = [...(Array.isArray(packet.evidence?.artifacts) ? packet.evidence.artifacts : [])]
      .sort((left, right) => compareUtf8(artifactKey(left), artifactKey(right)));
    if (JSON.stringify(expectedArtifacts) !== JSON.stringify(packetArtifacts)) {
      errors.push(`${mission.id} packet artifact identities do not exactly equal replayed receipt artifacts.`);
    }
    const recomputedAcceptance = await evaluateAcceptanceSnapshots({
      spec: specSnapshot,
      manifest: manifestSnapshot,
      receiptSnapshots: [...receiptSnapshots.values()],
      expectedSpecSha256: acceptance.specSha256,
      phase: acceptance.phase,
      expectedRevision: acceptance.expectedRevision ?? undefined,
      tool: evidenceTool,
    });
    if (!isDeepStrictEqual(recomputedAcceptance, acceptance)) {
      errors.push(`${mission.id} acceptance report does not exactly equal full semantics recomputed from canonical source snapshots.`);
    }
  }

  if (stateSnapshot) sourceEvidence.state = artifactIdentity(stateSnapshot);
  if (acceptanceSnapshot) sourceEvidence.acceptance = artifactIdentity(acceptanceSnapshot);
  if (specSnapshot) sourceEvidence.spec = artifactIdentity(specSnapshot);
  if (manifestSnapshot) sourceEvidence.manifest = artifactIdentity(manifestSnapshot);
  sourceEvidence.receipts.sort((left, right) => compareUtf8(left.receiptId, right.receiptId));
  sourceEvidence.artifacts.sort((left, right) => compareUtf8(`${left.receiptId}\0${left.artifactPath}`, `${right.receiptId}\0${right.artifactPath}`));
  return sourceEvidence;
};

export const checkIntegration = async ({ planPath, targetMissionId, packetPaths, output }) => {
  const [planSnapshot, ...packetSnapshots] = await Promise.all([
    readJsonSnapshot(planPath),
    ...packetPaths.map((path) => readJsonSnapshot(path)),
  ]);
  const plan = assertPlan(planSnapshot.value);
  const outputPath = output
    ? await assertOutputOutsideFlightWorktrees(plan, output, 'Integration report output')
    : undefined;
  const target = plan.missions.find((mission) => mission.id === targetMissionId);
  if (!target) throw new Error(`Target mission is not in the plan: ${targetMissionId}`);
  if (target.dependsOn.length === 0) throw new Error(`${targetMissionId} has no declared integration dependencies.`);

  const errors = [];
  const planIdentity = artifactIdentity(planSnapshot);
  const evidenceTool = await snapshotFile(fileURLToPath(new URL('./evidence-run.mjs', import.meta.url)));
  const readSource = sourceReader();
  const packets = new Map();
  for (const snapshot of packetSnapshots) {
    const packet = snapshot.value;
    errors.push(...validateHandoffPacket(packet).map((error) => `${snapshot.path}: ${error}`));
    const missionId = packet?.mission?.id;
    if (!nonEmptyString(missionId)) errors.push(`${snapshot.path} has no valid mission id.`);
    else if (packets.has(missionId)) errors.push(`Duplicate packet for ${missionId}.`);
    else packets.set(missionId, { packet, source: artifactIdentity(snapshot) });
  }

  const dependencyIds = new Set(target.dependsOn);
  for (const missionId of packets.keys()) if (!dependencyIds.has(missionId)) errors.push(`Unexpected packet for non-dependency ${missionId}.`);
  if (packetSnapshots.length !== target.dependsOn.length || packets.size !== target.dependsOn.length) {
    errors.push('Supplied packet set does not exactly equal the declared dependency set.');
  }

  const planRoot = await canonicalExistingPath(plan.repository.root).catch(() => undefined);
  if (planRoot !== plan.repository.root) errors.push('Planned repository root is unavailable or non-canonical.');
  let planGitDirectory;
  if (planRoot) {
    try { planGitDirectory = await canonicalExistingPath(git(planRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir'])); } catch {
      errors.push('Planned repository Git identity is unavailable.');
    }
  }
  let baseRefRevision;
  try { baseRefRevision = git(plan.repository.root, ['rev-parse', '--verify', `${plan.repository.baseRef}^{commit}`]); } catch {}
  if (baseRefRevision !== plan.repository.baseRevision) {
    errors.push(`Base ref drift: ${plan.repository.baseRef} resolves to ${baseRefRevision}; expected ${plan.repository.baseRevision}.`);
  }

  const evidence = [];
  for (const dependencyId of target.dependsOn) {
    const mission = plan.missions.find((candidate) => candidate.id === dependencyId);
    const entry = packets.get(dependencyId);
    if (!entry) {
      errors.push(`Missing exact packet for dependency ${dependencyId}.`);
      continue;
    }
    const { packet, source } = entry;
    if (!['checkout', 'review'].includes(packet.mode)) errors.push(`${dependencyId} packet mode ${packet.mode} cannot prove completion.`);
    if (packet.flight?.id !== plan.flightId || !sameArtifactIdentity(packet.flight?.plan, planIdentity)) errors.push(`${dependencyId} packet flight or exact plan snapshot was substituted.`);
    if (JSON.stringify(packet.mission) !== JSON.stringify({
      id: mission.id,
      title: mission.title,
      lane: mission.lane,
      writablePaths: mission.writablePaths,
      deliverables: mission.deliverables,
    })) errors.push(`${dependencyId} packet mission contract does not exactly match the resolved plan.`);
    if (packet.repository?.root !== plan.repository.root || packet.repository?.worktree !== mission.worktree ||
        packet.repository?.branch !== mission.branch || packet.repository?.baseRef !== plan.repository.baseRef ||
        packet.repository?.baseRevision !== plan.repository.baseRevision || packet.repository?.clean !== true) {
      errors.push(`${dependencyId} packet repository identity does not exactly match the resolved plan.`);
    }

    const canonicalWorktree = await canonicalExistingPath(mission.worktree).catch(() => undefined);
    const observed = canonicalWorktree === mission.worktree ? inspectGit(canonicalWorktree) : null;
    if (!observed || observed.root !== canonicalWorktree) {
      errors.push(`${dependencyId} planned worktree is unavailable, aliased, or not the current Git worktree.`);
    } else {
      try {
        const worktreeGitDirectory = await canonicalExistingPath(git(canonicalWorktree, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
        if (!planGitDirectory || worktreeGitDirectory !== planGitDirectory) errors.push(`${dependencyId} worktree does not belong to the planned Git repository.`);
      } catch {
        errors.push(`${dependencyId} worktree Git identity is unavailable.`);
      }
      if (observed.branch !== mission.branch || observed.head !== packet.repository?.head || observed.clean !== true) {
        errors.push(`${dependencyId} packet is stale for current branch, HEAD, or cleanliness.`);
      }
      let branchRevision;
      try { branchRevision = git(canonicalWorktree, ['rev-parse', '--verify', `refs/heads/${mission.branch}^{commit}`]); } catch {}
      if (branchRevision !== packet.repository?.head) errors.push(`${dependencyId} branch ref no longer resolves to packet HEAD.`);
      try { git(canonicalWorktree, ['merge-base', '--is-ancestor', plan.repository.baseRevision, packet.repository?.head ?? '']); } catch {
        errors.push(`${dependencyId} packet HEAD does not descend from exact plan base.`);
      }
    }

    let changedPaths = [];
    if (observed) {
      try { changedPaths = orderedChangedPaths(canonicalWorktree, plan.repository.baseRevision, packet.repository.head); } catch {
        errors.push(`${dependencyId} changed paths could not be recomputed from exact base..HEAD.`);
      }
    }
    if (JSON.stringify(changedPaths) !== JSON.stringify(packet.repository?.changedPaths)) {
      errors.push(`${dependencyId} packet changed paths do not exactly match the live ordered base..HEAD diff.`);
    }
    for (const changedPath of changedPaths) {
      if (!mission.writablePaths.some((ownedPath) => pathMatches(changedPath, ownedPath))) {
        errors.push(`${dependencyId} changed path is outside declared ownership: ${changedPath}`);
      }
    }
    const sources = await replayPacketSources({
      packet,
      packetSource: source,
      mission,
      plan,
      planIdentity,
      worktree: mission.worktree,
      head: observed?.head ?? packet.repository?.head,
      evidenceTool,
      readSource,
      errors,
    });
    evidence.push({
      missionId: dependencyId,
      worktree: mission.worktree,
      branch: mission.branch,
      revision: GIT_REVISION_PATTERN.test(packet.repository?.head ?? '') ? packet.repository.head : plan.repository.baseRevision,
      changedPaths,
      packet: source,
      sources,
    });
  }

  const changedOwners = new Map();
  for (const item of evidence) {
    for (const path of item.changedPaths) {
      if (changedOwners.has(path)) errors.push(`Exact changed-path collision: ${path} in ${changedOwners.get(path)} and ${item.missionId}.`);
      else changedOwners.set(path, item.missionId);
    }
  }

  const report = {
    schemaVersion: 2,
    reportType: INTEGRATION_REPORT_TYPE,
    authority: 'none',
    notice: INTEGRATION_REPORT_NOTICE,
    tool: { name: 'integration-check', version: INTEGRATION_REPORT_TOOL_VERSION },
    checkedAt: new Date().toISOString(),
    flightId: plan.flightId,
    targetMissionId,
    integrationBranch: plan.integration.branch,
    plan: planIdentity,
    ok: errors.length === 0,
    errors,
    dependencyEvidence: evidence,
  };
  const reportErrors = validateIntegrationReport(report);
  if (reportErrors.length > 0) throw new Error(`Produced invalid integration report:\n- ${reportErrors.join('\n- ')}`);
  const json = stableJson(report);
  if (outputPath) await writeNewFile(outputPath, json);
  return report;
};

const parse = (argv) => {
  const options = { packetPaths: [] };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === '--plan') options.planPath = argv.shift();
    else if (flag === '--target-mission') options.targetMissionId = argv.shift();
    else if (flag === '--packet') options.packetPaths.push(argv.shift());
    else if (flag === '--output') options.output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.planPath || !options.targetMissionId) {
    throw new Error('Usage: integration-check.mjs --plan FILE --target-mission ID --packet FILE... [--output NEW_FILE]');
  }
  return options;
};

const main = async () => {
  const options = parse(process.argv.slice(2));
  const report = await checkIntegration(options);
  process.stdout.write(stableJson(report));
  if (!report.ok) process.exitCode = 2;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
