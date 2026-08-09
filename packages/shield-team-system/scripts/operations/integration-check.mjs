#!/usr/bin/env node

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
  stableJson,
  writeNewFile,
} from './common.mjs';
import { assertPlan, GIT_REVISION_PATTERN, pathMatches } from './flight-common.mjs';
import { validateHandoffPacket } from './handoff-compile.mjs';
import { artifactIdentity } from './handoff-state.mjs';

export const INTEGRATION_REPORT_TYPE = 'feature-flight-integration-check';
export const INTEGRATION_REPORT_NOTICE = 'Compatibility evidence only. This report grants no merge authority and performs no merge, approval, publication, deployment, or release.';
export const INTEGRATION_REPORT_TOOL_VERSION = '1.0.0';

const validateArtifact = (value, label, errors) => {
  if (!exactKeys(value, ['path', 'bytes', 'sha256'], label, errors)) return;
  if (!nonEmptyString(value.path) || !Number.isSafeInteger(value.bytes) || value.bytes < 0 ||
      !SHA256_PATTERN.test(value.sha256 ?? '')) errors.push(`${label} is malformed.`);
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
  for (const [index, evidence] of (Array.isArray(report.dependencyEvidence) ? report.dependencyEvidence : []).entries()) {
    const label = `report.dependencyEvidence[${index}]`;
    if (!exactKeys(evidence, ['missionId', 'worktree', 'branch', 'revision', 'changedPaths', 'packet'], label, errors)) continue;
    if (![evidence.missionId, evidence.worktree, evidence.branch].every(nonEmptyString) ||
        !GIT_REVISION_PATTERN.test(evidence.revision ?? '') || !Array.isArray(evidence.changedPaths) ||
        evidence.changedPaths.some((path) => !nonEmptyString(path))) errors.push(`${label} is malformed.`);
    validateArtifact(evidence.packet, `${label}.packet`, errors);
  }
  return errors;
};

const orderedChangedPaths = (worktree, baseRevision, head) => {
  const output = git(worktree, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${baseRevision}..${head}`]);
  return output === '' ? [] : output.split('\n');
};

export const checkIntegration = async ({ planPath, targetMissionId, packetPaths }) => {
  const [planSnapshot, ...packetSnapshots] = await Promise.all([
    readJsonSnapshot(planPath),
    ...packetPaths.map((path) => readJsonSnapshot(path)),
  ]);
  const plan = assertPlan(planSnapshot.value);
  const target = plan.missions.find((mission) => mission.id === targetMissionId);
  if (!target) throw new Error(`Target mission is not in the plan: ${targetMissionId}`);
  if (target.dependsOn.length === 0) throw new Error(`${targetMissionId} has no declared integration dependencies.`);

  const errors = [];
  const planIdentity = artifactIdentity(planSnapshot);
  const packets = new Map();
  for (const snapshot of packetSnapshots) {
    const packet = snapshot.value;
    const packetErrors = validateHandoffPacket(packet);
    errors.push(...packetErrors.map((error) => `${snapshot.path}: ${error}`));
    const missionId = packet?.mission?.id;
    if (!nonEmptyString(missionId)) errors.push(`${snapshot.path} has no valid mission id.`);
    else if (packets.has(missionId)) errors.push(`Duplicate packet for ${missionId}.`);
    else packets.set(missionId, { packet, source: artifactIdentity(snapshot) });
  }

  const dependencyIds = new Set(target.dependsOn);
  for (const missionId of packets.keys()) {
    if (!dependencyIds.has(missionId)) errors.push(`Unexpected packet for non-dependency ${missionId}.`);
  }
  if (packetSnapshots.length !== target.dependsOn.length || packets.size !== target.dependsOn.length) {
    errors.push('Supplied packet set does not exactly equal the declared dependency set.');
  }

  const planRoot = await canonicalExistingPath(plan.repository.root).catch(() => undefined);
  if (planRoot !== plan.repository.root) errors.push('Planned repository root is unavailable or non-canonical.');
  let planGitDirectory;
  if (planRoot) {
    try {
      planGitDirectory = await canonicalExistingPath(git(planRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
    } catch {
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
    if (packet.flight?.id !== plan.flightId || !sameArtifact(packet.flight?.plan, planIdentity)) errors.push(`${dependencyId} packet flight or exact plan snapshot was substituted.`);
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
    if (packet.acceptance?.expectedRevision !== packet.repository?.head || packet.acceptance?.phase !== 'green' || packet.acceptance?.ok !== true) {
      errors.push(`${dependencyId} packet acceptance is not bound to packet HEAD.`);
    }
    const receiptDigests = new Set((packet.evidence?.receipts ?? [])
      .map((receipt) => receipt?.source?.sha256)
      .filter((digest) => typeof digest === 'string'));
    const acceptedDigests = new Set(packet.acceptance?.receiptDigests ?? []);
    if (receiptDigests.size !== acceptedDigests.size || [...receiptDigests].some((digest) => !acceptedDigests.has(digest))) {
      errors.push(`${dependencyId} packet receipt set differs from its acceptance binding.`);
    }

    const canonicalWorktree = await canonicalExistingPath(mission.worktree).catch(() => undefined);
    if (canonicalWorktree !== mission.worktree) {
      errors.push(`${dependencyId} worktree is unavailable, aliased, or non-canonical: ${mission.worktree}.`);
      continue;
    }
    const observed = inspectGit(canonicalWorktree);
    if (!observed || observed.root !== canonicalWorktree) {
      errors.push(`${dependencyId} planned worktree is not the current Git worktree.`);
      continue;
    }
    try {
      const worktreeGitDirectory = await canonicalExistingPath(git(canonicalWorktree, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
      if (!planGitDirectory || worktreeGitDirectory !== planGitDirectory) {
        errors.push(`${dependencyId} worktree does not belong to the planned Git repository.`);
      }
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
    let changedPaths = [];
    try { changedPaths = orderedChangedPaths(canonicalWorktree, plan.repository.baseRevision, packet.repository.head); } catch {
      errors.push(`${dependencyId} changed paths could not be recomputed from exact base..HEAD.`);
    }
    if (JSON.stringify(changedPaths) !== JSON.stringify(packet.repository?.changedPaths)) {
      errors.push(`${dependencyId} packet changed paths do not exactly match the live ordered base..HEAD diff.`);
    }
    for (const changedPath of changedPaths) {
      if (!mission.writablePaths.some((ownedPath) => pathMatches(changedPath, ownedPath))) {
        errors.push(`${dependencyId} changed path is outside declared ownership: ${changedPath}`);
      }
    }
    evidence.push({
      missionId: dependencyId,
      worktree: mission.worktree,
      branch: mission.branch,
      revision: packet.repository?.head,
      changedPaths,
      packet: source,
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
  return report;
};

const sameArtifact = (left, right) =>
  left?.path === right?.path && left?.bytes === right?.bytes && left?.sha256 === right?.sha256;

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
  const json = stableJson(report);
  if (options.output) await writeNewFile(options.output, json);
  process.stdout.write(json);
  if (!report.ok) process.exitCode = 2;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
