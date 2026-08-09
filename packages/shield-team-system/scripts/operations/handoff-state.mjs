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
  normalizeSystemPathAlias,
  readJsonSnapshot,
  stableJson,
  writeNewFile,
} from './common.mjs';
import { assertPlan, GIT_REVISION_PATTERN } from './flight-common.mjs';
import { assertOutputOutsideFlightWorktrees } from './convergence-common.mjs';

export const HANDOFF_STATE_TYPE = 'non-authoritative-mission-handoff-state';
export const HANDOFF_STATE_NOTICE = 'Coordination state only. This snapshot grants no human approval, mission authority, merge authority, or publication authority.';
export const HANDOFF_STATE_TOOL_VERSION = '1.0.0';
export const HANDOFF_STATE_GENESIS_PRODUCER = 'handoff-state-init';
export const HANDOFF_STATE_SUCCESSOR_PRODUCER = 'handoff-state-successor-recorder';

export const artifactIdentity = (snapshot) => ({
  path: snapshot.path,
  bytes: snapshot.size,
  sha256: snapshot.sha256,
});

const sameArtifact = (left, right) =>
  left?.path === right?.path && left?.bytes === right?.bytes && left?.sha256 === right?.sha256;

const validateArtifact = (value, label, errors) => {
  if (!exactKeys(value, ['path', 'bytes', 'sha256'], label, errors)) return;
  if (!nonEmptyString(value.path)) errors.push(`${label}.path must be a non-empty string.`);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0) errors.push(`${label}.bytes must be a non-negative safe integer.`);
  if (!SHA256_PATTERN.test(value.sha256 ?? '')) errors.push(`${label}.sha256 must be a lowercase SHA-256 digest.`);
};

const validateStatus = (status, label, errors) => {
  if (!exactKeys(status, [
    'currentGate', 'decisions', 'processExperiments', 'toolsCreated', 'risks', 'blockers',
    'recommendedNextAction',
  ], label, errors)) return;
  if (!nonEmptyString(status.currentGate)) errors.push(`${label}.currentGate must be a non-empty string.`);
  for (const field of ['decisions', 'processExperiments', 'toolsCreated', 'risks', 'blockers']) {
    if (!Array.isArray(status[field]) || status[field].some((item) => !nonEmptyString(item))) {
      errors.push(`${label}.${field} must be an array of non-empty strings.`);
    }
  }
  if (!nonEmptyString(status.recommendedNextAction)) {
    errors.push(`${label}.recommendedNextAction must be a non-empty string.`);
  }
};

export const validateHandoffState = (plan, planIdentity, state, label = 'state') => {
  const errors = [];
  if (!exactKeys(state, [
    'schemaVersion', 'stateType', 'authority', 'notice', 'tool', 'flight', 'mission',
    'repository', 'sequence', 'predecessor', 'recordedAt', 'status',
  ], label, errors)) return errors;
  if (state.schemaVersion !== 2) errors.push(`${label}.schemaVersion must equal 2.`);
  if (state.stateType !== HANDOFF_STATE_TYPE) errors.push(`${label}.stateType must equal ${HANDOFF_STATE_TYPE}.`);
  if (state.authority !== 'none') errors.push(`${label}.authority must equal none.`);
  if (state.notice !== HANDOFF_STATE_NOTICE) errors.push(`${label}.notice must equal the fixed producer notice.`);
  if (exactKeys(state.tool, ['name', 'version'], `${label}.tool`, errors)) {
    const expectedName = state.sequence === 0
      ? HANDOFF_STATE_GENESIS_PRODUCER
      : HANDOFF_STATE_SUCCESSOR_PRODUCER;
    if (state.tool.name !== expectedName || state.tool.version !== HANDOFF_STATE_TOOL_VERSION) {
      errors.push(`${label}.tool must identify the sequence-specific ${expectedName} producer.`);
    }
  }
  if (exactKeys(state.flight, ['id', 'plan'], `${label}.flight`, errors)) {
    if (state.flight.id !== plan.flightId) errors.push(`${label}.flight.id does not match the resolved plan.`);
    validateArtifact(state.flight.plan, `${label}.flight.plan`, errors);
    if (!sameArtifact(state.flight.plan, planIdentity)) errors.push(`${label}.flight.plan does not match the supplied plan snapshot.`);
  }
  if (exactKeys(state.mission, ['id'], `${label}.mission`, errors) &&
      !plan.missions.some((mission) => mission.id === state.mission.id)) {
    errors.push(`${label}.mission.id is not in the resolved plan.`);
  }
  if (exactKeys(state.repository, ['root', 'worktree', 'branch', 'baseRevision', 'head'], `${label}.repository`, errors)) {
    if (state.repository.root !== plan.repository.root) errors.push(`${label}.repository.root does not match the resolved plan.`);
    if (!GIT_REVISION_PATTERN.test(state.repository.baseRevision ?? '')) errors.push(`${label}.repository.baseRevision must be an exact revision.`);
    if (!GIT_REVISION_PATTERN.test(state.repository.head ?? '')) errors.push(`${label}.repository.head must be an exact revision.`);
    const mission = plan.missions.find((candidate) => candidate.id === state.mission?.id);
    if (mission) {
      if (state.repository.worktree !== mission.worktree) errors.push(`${label}.repository.worktree does not match the mission.`);
      if (state.repository.branch !== mission.branch) errors.push(`${label}.repository.branch does not match the mission.`);
      if (state.repository.baseRevision !== plan.repository.baseRevision) errors.push(`${label}.repository.baseRevision does not match the plan.`);
    }
  }
  if (!Number.isSafeInteger(state.sequence) || state.sequence < 0) {
    errors.push(`${label}.sequence must be a non-negative safe integer.`);
  }
  if (state.sequence === 0) {
    if (state.predecessor !== null) errors.push(`${label}.predecessor must be null for genesis sequence 0.`);
  } else if (exactKeys(state.predecessor, ['path', 'bytes', 'sha256', 'sequence'], `${label}.predecessor`, errors)) {
    if (!nonEmptyString(state.predecessor.path)) errors.push(`${label}.predecessor.path must be a non-empty string.`);
    if (!Number.isSafeInteger(state.predecessor.bytes) || state.predecessor.bytes < 0) errors.push(`${label}.predecessor.bytes must be a non-negative safe integer.`);
    if (!SHA256_PATTERN.test(state.predecessor.sha256 ?? '')) errors.push(`${label}.predecessor.sha256 must be a lowercase SHA-256 digest.`);
    if (state.predecessor.sequence !== state.sequence - 1) errors.push(`${label}.predecessor.sequence must equal sequence minus one.`);
  }
  if (!nonEmptyString(state.recordedAt) || Number.isNaN(Date.parse(state.recordedAt))) {
    errors.push(`${label}.recordedAt must be a timestamp string.`);
  }
  validateStatus(state.status, `${label}.status`, errors);
  return errors;
};

export const validateHandoffPredecessor = (state, predecessorSnapshot, expectedDigest, errors = []) => {
  if (predecessorSnapshot.sha256 !== expectedDigest) {
    errors.push('Expected predecessor SHA-256 does not match the supplied predecessor snapshot.');
  }
  if (state.predecessor?.sha256 !== predecessorSnapshot.sha256 ||
      state.predecessor?.path !== predecessorSnapshot.path ||
      state.predecessor?.bytes !== predecessorSnapshot.size) {
    errors.push('Current state predecessor identity does not match the supplied predecessor snapshot.');
  }
  const predecessor = predecessorSnapshot.value;
  if (predecessor.sequence !== state.sequence - 1) errors.push('Predecessor sequence must equal current sequence minus one.');
  if (predecessor.flight?.id !== state.flight?.id || !sameArtifact(predecessor.flight?.plan, state.flight?.plan)) {
    errors.push('Predecessor flight or plan identity does not match the current state.');
  }
  if (predecessor.mission?.id !== state.mission?.id ||
      JSON.stringify(predecessor.repository) !== JSON.stringify(state.repository)) {
    errors.push('Predecessor mission or repository identity does not match the current state.');
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

export const recordHandoffState = async ({
  planPath,
  missionId,
  worktree,
  statusPath,
  sequence,
  predecessorStatePath,
  expectedPredecessorSha256,
  output,
}) => {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('sequence must be a non-negative safe integer.');
  const [planSnapshot, statusSnapshot] = await Promise.all([
    readJsonSnapshot(planPath),
    readJsonSnapshot(statusPath),
  ]);
  const plan = assertPlan(planSnapshot.value);
  const mission = plan.missions.find((candidate) => candidate.id === missionId);
  if (!mission) throw new Error(`Mission not found in flight plan: ${missionId}`);
  const outputPath = await assertOutputOutsideFlightWorktrees(plan, output, 'Handoff state output');
  const statusErrors = [];
  validateStatus(statusSnapshot.value, 'status', statusErrors);
  if (statusErrors.length > 0) throw new Error(`Invalid handoff status input:\n- ${statusErrors.join('\n- ')}`);
  const canonicalWorktree = await requireCanonicalWorktree(worktree, mission);
  const observed = inspectGit(canonicalWorktree);
  if (!observed || observed.root !== canonicalWorktree) throw new Error('Mission worktree identity does not match the selected Git worktree.');
  if (observed.branch !== mission.branch) throw new Error(`Worktree branch is ${observed.branch}; expected ${mission.branch}.`);
  const canonicalPlanRoot = await canonicalExistingPath(plan.repository.root).catch(() => undefined);
  if (canonicalPlanRoot !== plan.repository.root) throw new Error('Plan repository root is unavailable or non-canonical.');
  const planGitDirectory = await canonicalExistingPath(git(plan.repository.root, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const worktreeGitDirectory = await canonicalExistingPath(git(canonicalWorktree, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  if (planGitDirectory !== worktreeGitDirectory) throw new Error('Mission worktree does not belong to the planned Git repository.');
  const baseRefRevision = git(plan.repository.root, ['rev-parse', '--verify', `${plan.repository.baseRef}^{commit}`]);
  if (baseRefRevision !== plan.repository.baseRevision) throw new Error(`Base ref ${plan.repository.baseRef} does not resolve to exact base ${plan.repository.baseRevision}.`);
  const branchRevision = git(canonicalWorktree, ['rev-parse', '--verify', `refs/heads/${mission.branch}^{commit}`]);
  if (branchRevision !== observed.head) throw new Error('Mission branch ref does not resolve to current HEAD.');
  try {
    git(canonicalWorktree, ['merge-base', '--is-ancestor', plan.repository.baseRevision, observed.head]);
  } catch {
    throw new Error(`Base revision ${plan.repository.baseRevision} is not an ancestor of ${observed.head}.`);
  }

  let predecessor = null;
  let predecessorSnapshot;
  if (sequence === 0) {
    if (predecessorStatePath !== undefined || expectedPredecessorSha256 !== undefined) {
      throw new Error('Genesis handoff state must not supply predecessor evidence.');
    }
  } else {
    if (!predecessorStatePath || !SHA256_PATTERN.test(expectedPredecessorSha256 ?? '')) {
      throw new Error('A predecessor snapshot and expected SHA-256 are required after genesis.');
    }
    predecessorSnapshot = await readJsonSnapshot(predecessorStatePath);
    predecessor = { ...artifactIdentity(predecessorSnapshot), sequence: predecessorSnapshot.value.sequence };
  }

  const state = {
    schemaVersion: 2,
    stateType: HANDOFF_STATE_TYPE,
    authority: 'none',
    notice: HANDOFF_STATE_NOTICE,
    tool: {
      name: sequence === 0 ? HANDOFF_STATE_GENESIS_PRODUCER : HANDOFF_STATE_SUCCESSOR_PRODUCER,
      version: HANDOFF_STATE_TOOL_VERSION,
    },
    flight: { id: plan.flightId, plan: artifactIdentity(planSnapshot) },
    mission: { id: mission.id },
    repository: {
      root: plan.repository.root,
      worktree: canonicalWorktree,
      branch: mission.branch,
      baseRevision: plan.repository.baseRevision,
      head: observed.head,
    },
    sequence,
    predecessor,
    recordedAt: new Date().toISOString(),
    status: statusSnapshot.value,
  };
  const errors = validateHandoffState(plan, artifactIdentity(planSnapshot), state);
  if (predecessorSnapshot) {
    errors.push(...validateHandoffState(plan, artifactIdentity(planSnapshot), predecessorSnapshot.value, 'predecessor'));
    validateHandoffPredecessor(state, predecessorSnapshot, expectedPredecessorSha256, errors);
  }
  if (errors.length > 0) throw new Error(`Invalid handoff state:\n- ${errors.join('\n- ')}`);
  await writeNewFile(outputPath, stableJson(state));
  return state;
};

const parseArguments = (argv) => {
  const options = {};
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === '--plan') options.planPath = argv.shift();
    else if (flag === '--mission') options.missionId = argv.shift();
    else if (flag === '--worktree') options.worktree = argv.shift();
    else if (flag === '--status') options.statusPath = argv.shift();
    else if (flag === '--sequence') options.sequence = Number(argv.shift());
    else if (flag === '--predecessor-state') options.predecessorStatePath = argv.shift();
    else if (flag === '--expected-predecessor-sha256') options.expectedPredecessorSha256 = argv.shift();
    else if (flag === '--output') options.output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.planPath || !options.missionId || !options.worktree || !options.statusPath ||
      !Number.isSafeInteger(options.sequence) || !options.output) {
    throw new Error('Usage: handoff-state.mjs --plan FILE --mission ID --worktree PATH --status FILE --sequence N [--predecessor-state FILE --expected-predecessor-sha256 SHA256] --output NEW_FILE');
  }
  return options;
};

const main = async () => {
  const state = await recordHandoffState(parseArguments(process.argv.slice(2)));
  process.stdout.write(stableJson(state));
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
