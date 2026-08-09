#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalNewPath,
  git,
  hashFile,
  inspectGit,
  readJsonSnapshot,
  stableJson,
  tryGit,
  writeNewFile,
} from './common.mjs';

const TOOL_VERSION = '0.1.0-local-prototype';
const MODES = new Set(['checkout', 'resume', 'review']);

const parseArguments = (argv) => {
  const options = { mode: 'checkout', receipts: [] };
  while (argv.length > 0) {
    const option = argv.shift();
    if (option === '--flight-plan') options.flightPlan = argv.shift();
    else if (option === '--mission-id') options.missionId = argv.shift();
    else if (option === '--worktree') options.worktree = argv.shift();
    else if (option === '--acceptance-report') options.acceptanceReport = argv.shift();
    else if (option === '--state') options.state = argv.shift();
    else if (option === '--receipt') options.receipts.push(argv.shift());
    else if (option === '--output-dir') options.outputDir = argv.shift();
    else if (option === '--mode') options.mode = argv.shift();
    else throw new Error(`Unknown option: ${option}`);
  }
  for (const name of ['flightPlan', 'missionId', 'worktree', 'acceptanceReport', 'state', 'outputDir']) {
    if (!options[name]) throw new Error(`--${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} is required.`);
  }
  if (!MODES.has(options.mode)) throw new Error(`Unknown mode: ${options.mode}`);
  return options;
};

const pathMatches = (path, writablePath) => {
  const normalized = writablePath.replace(/^\.\//u, '');
  if (normalized.endsWith('/**')) {
    const prefix = normalized.slice(0, -3).replace(/\/$/u, '');
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === normalized;
};

const validateState = (state, missionId) => {
  const errors = [];
  if (state.schemaVersion !== 1) errors.push('State schemaVersion must equal 1.');
  if (state.missionId !== missionId) errors.push(`State mission is ${state.missionId}; expected ${missionId}.`);
  if (typeof state.currentGate !== 'string' || state.currentGate.trim() === '') {
    errors.push('State currentGate is required.');
  }
  for (const field of ['decisions', 'processExperiments', 'toolsCreated', 'risks', 'blockers']) {
    if (!Array.isArray(state[field])) errors.push(`State ${field} must be an array.`);
  }
  if (typeof state.recommendedNextAction !== 'string' || state.recommendedNextAction.trim() === '') {
    errors.push('State recommendedNextAction is required.');
  }
  return errors;
};

const makeMarkdown = (packet) => {
  const changed = packet.repository.changedPaths.length === 0
    ? '- None'
    : packet.repository.changedPaths.map((path) => `- \`${path}\``).join('\n');
  const blockers = packet.state.blockers.length === 0
    ? '- None declared'
    : packet.state.blockers.map((blocker) => `- ${blocker}`).join('\n');
  return `# ${packet.mode} packet: ${packet.mission.title}\n\n` +
    `This is non-authoritative coordination evidence. It grants no human approval or publication authority.\n\n` +
    `- Mission: \`${packet.mission.id}\`\n` +
    `- Branch: \`${packet.repository.branch}\`\n` +
    `- Exact revision: \`${packet.repository.head}\`\n` +
    `- Base revision: \`${packet.repository.baseRevision}\`\n` +
    `- Gate: ${packet.state.currentGate}\n` +
    `- Acceptance: ${packet.acceptance.phase} / ${packet.acceptance.ok ? 'PASS' : 'FAIL'}\n\n` +
    `## Changed paths\n\n${changed}\n\n` +
    `## Blockers\n\n${blockers}\n\n` +
    `## Recommended next action\n\n${packet.state.recommendedNextAction}\n`;
};

export const compileHandoff = async (options) => {
  const flightPlanPath = resolve(options.flightPlan);
  const acceptancePath = resolve(options.acceptanceReport);
  const statePath = resolve(options.state);
  const outputDirectory = await canonicalNewPath(options.outputDir);
  const worktree = resolve(options.worktree);

  const [flightPlanSnapshot, acceptanceSnapshot, stateSnapshot] = await Promise.all([
    readJsonSnapshot(flightPlanPath),
    readJsonSnapshot(acceptancePath),
    readJsonSnapshot(statePath),
  ]);
  const flightPlan = flightPlanSnapshot.value;
  const acceptance = acceptanceSnapshot.value;
  const state = stateSnapshot.value;
  const mission = flightPlan.missions?.find((candidate) => candidate.id === options.missionId);
  if (!mission) throw new Error(`Mission not found in flight plan: ${options.missionId}`);

  const errors = validateState(state, options.missionId);
  const repository = inspectGit(worktree);
  if (!repository) errors.push(`Worktree is not a Git repository: ${worktree}`);
  const baseRevision = flightPlan.repository?.baseRevision;
  let changedPaths = [];
  if (repository) {
    if (repository.root !== worktree) errors.push(`Worktree resolves to ${repository.root}; expected ${worktree}.`);
    if (repository.branch !== mission.branch) {
      errors.push(`Branch is ${repository.branch}; mission requires ${mission.branch}.`);
    }
    if (repository.clean !== true) errors.push('Worktree must be clean at handoff compilation.');
    const resolvedBase = baseRevision
      ? tryGit(worktree, ['rev-parse', '--verify', `${baseRevision}^{commit}`])
      : undefined;
    if (!resolvedBase) {
      errors.push(`Base revision is unavailable: ${baseRevision}.`);
    } else if (git(worktree, ['merge-base', baseRevision, repository.head]) !== baseRevision) {
      errors.push(`Base revision ${baseRevision} is not an ancestor of ${repository.head}.`);
    } else {
      const changed = git(worktree, ['diff', '--name-only', `${baseRevision}...${repository.head}`]);
      changedPaths = changed === '' ? [] : changed.split('\n');
      for (const path of changedPaths) {
        if (!(mission.writablePaths ?? []).some((writablePath) => pathMatches(path, writablePath))) {
          errors.push(`Changed path is outside mission scope: ${path}`);
        }
      }
    }
  }

  if (acceptance.reportType !== 'acceptance-traceability' || acceptance.schemaVersion !== 1) {
    errors.push('Acceptance report is not supported.');
  }
  if (acceptance.missionId !== options.missionId) {
    errors.push(`Acceptance mission is ${acceptance.missionId}; expected ${options.missionId}.`);
  }
  if (options.mode !== 'resume') {
    if (acceptance.phase !== 'green' || acceptance.ok !== true) {
      errors.push(`${options.mode} requires a passing GREEN acceptance report.`);
    }
    if (repository && acceptance.expectedRevision !== repository.head) {
      errors.push(`Acceptance revision is ${acceptance.expectedRevision}; expected ${repository.head}.`);
    }
  }

  const receipts = [];
  for (const receiptPath of options.receipts) {
    const absolutePath = resolve(receiptPath);
    const receipt = (await readJsonSnapshot(absolutePath)).value;
    if (receipt.receiptType !== 'local-command-evidence' || receipt.schemaVersion !== 1) {
      errors.push(`${absolutePath} is not a supported evidence receipt.`);
    }
    if (receipt.missionId !== options.missionId) {
      errors.push(`${absolutePath} mission is ${receipt.missionId}; expected ${options.missionId}.`);
    }
    if (repository && receipt.git?.after?.head !== repository.head) {
      errors.push(`${absolutePath} revision is ${receipt.git?.after?.head}; expected ${repository.head}.`);
    }
    if (receipt.git?.after?.dirty !== false) errors.push(`${absolutePath} does not prove a clean worktree.`);
    if (receipt.result?.exitCode !== 0) errors.push(`${absolutePath} records a failing command.`);
    receipts.push({ ...(await hashFile(absolutePath)), receiptId: receipt.receiptId ?? null });
  }
  if (options.mode !== 'resume' && receipts.length === 0) errors.push(`${options.mode} requires at least one receipt.`);

  if (errors.length > 0) throw new Error(`Handoff compilation failed:\n- ${errors.join('\n- ')}`);

  const packet = {
    schemaVersion: 1,
    packetType: 'exact-mission-handoff',
    authority: 'none',
    notice: 'Coordination evidence only. This packet grants no human approval or publication authority.',
    mode: options.mode,
    compiledAt: new Date().toISOString(),
    tool: { name: 'handoff-compile', version: TOOL_VERSION },
    flight: { id: flightPlan.flightId ?? null, plan: await hashFile(flightPlanPath) },
    mission: {
      id: mission.id,
      title: mission.title,
      lane: mission.lane ?? null,
      writablePaths: mission.writablePaths,
      deliverables: mission.deliverables,
    },
    repository: {
      root: repository.root,
      branch: repository.branch,
      head: repository.head,
      clean: repository.clean,
      baseRevision,
      changedPaths,
    },
    acceptance: {
      report: await hashFile(acceptancePath),
      phase: acceptance.phase,
      ok: acceptance.ok,
      expectedRevision: acceptance.expectedRevision,
    },
    receipts,
    state,
    stateSource: await hashFile(statePath),
  };
  try {
    await mkdir(outputDirectory, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`Refusing existing output directory: ${outputDirectory}`);
    throw error;
  }
  const jsonPath = await writeNewFile(`${outputDirectory}/handoff.json`, stableJson(packet));
  const markdownPath = await writeNewFile(`${outputDirectory}/handoff.md`, makeMarkdown(packet));
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
