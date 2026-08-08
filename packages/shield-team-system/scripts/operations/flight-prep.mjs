#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = '0.1.0-local-prototype';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const git = (repositoryPath, args) =>
  execFileSync('git', ['-C', repositoryPath, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const runGitCheck = (repositoryPath, args) => {
  try {
    return git(repositoryPath, args);
  } catch {
    return undefined;
  }
};

const parseArguments = (argv) => {
  const arguments_ = [...argv];
  const manifestPath = arguments_.shift();
  let outputPath;

  while (arguments_.length > 0) {
    const argument = arguments_.shift();
    if (argument === '--output') {
      outputPath = arguments_.shift();
      if (!outputPath) throw new Error('--output requires a directory path.');
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!manifestPath) {
    throw new Error('Usage: flight-prep.mjs MANIFEST.json [--output DIRECTORY]');
  }

  return { manifestPath: resolve(manifestPath), outputPath: outputPath && resolve(outputPath) };
};

const assertString = (value, field, errors) => {
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${field} must be a string.`);
};

const normalizeOwnedPath = (value) => value.replace(/\/\*\*?$/u, '').replace(/\/$/u, '');

const pathsOverlap = (left, right) => {
  const normalizedLeft = normalizeOwnedPath(left);
  const normalizedRight = normalizeOwnedPath(right);
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`)
  );
};

const validateRelativeOwnedPath = (value) => {
  if (typeof value !== 'string' || value.trim() === '') return false;
  if (isAbsolute(value)) return false;
  const normalized = normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${sep}`);
};

const validateManifest = (manifest) => {
  const errors = [];
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must equal 1.');
  assertString(manifest.flightId, 'flightId', errors);
  assertString(manifest.objective, 'objective', errors);
  assertString(manifest.repository?.path, 'repository.path', errors);
  assertString(manifest.repository?.baseRef, 'repository.baseRef', errors);
  assertString(manifest.integration?.branch, 'integration.branch', errors);

  if (!Array.isArray(manifest.lanes) || manifest.lanes.length === 0) {
    errors.push('lanes must contain at least one lane.');
  }
  if (!Array.isArray(manifest.missions) || manifest.missions.length === 0) {
    errors.push('missions must contain at least one mission.');
  }

  const lanes = manifest.lanes ?? [];
  const missions = manifest.missions ?? [];
  const laneIds = new Set();
  for (const [index, lane] of lanes.entries()) {
    assertString(lane.id, `lanes[${index}].id`, errors);
    assertString(lane.chatLabel, `lanes[${index}].chatLabel`, errors);
    if (laneIds.has(lane.id)) errors.push(`Duplicate lane ID: ${lane.id}`);
    laneIds.add(lane.id);
  }

  const missionIds = new Set();
  const branches = new Set();
  const worktrees = new Set();
  for (const [index, mission] of missions.entries()) {
    const prefix = `missions[${index}]`;
    assertString(mission.id, `${prefix}.id`, errors);
    assertString(mission.title, `${prefix}.title`, errors);
    assertString(mission.lane, `${prefix}.lane`, errors);
    assertString(mission.branch, `${prefix}.branch`, errors);
    assertString(mission.worktree, `${prefix}.worktree`, errors);
    if (!Number.isInteger(mission.activationWave) || mission.activationWave < 1) {
      errors.push(`${mission.id} activationWave must be a positive integer.`);
    }

    if (missionIds.has(mission.id)) errors.push(`Duplicate mission ID: ${mission.id}`);
    missionIds.add(mission.id);
    if (!laneIds.has(mission.lane)) errors.push(`${mission.id} references unknown lane ${mission.lane}.`);

    if (branches.has(mission.branch)) errors.push(`Duplicate planned branch: ${mission.branch}`);
    branches.add(mission.branch);
    if (worktrees.has(mission.worktree)) errors.push(`Duplicate planned worktree: ${mission.worktree}`);
    worktrees.add(mission.worktree);

    if (!isAbsolute(mission.worktree ?? '')) {
      errors.push(`${mission.id} worktree must be an absolute path.`);
    }
    if (!Array.isArray(mission.dependsOn)) errors.push(`${mission.id} dependsOn must be an array.`);
    if (!Array.isArray(mission.writablePaths) || mission.writablePaths.length === 0) {
      errors.push(`${mission.id} must declare writablePaths.`);
    } else {
      for (const ownedPath of mission.writablePaths) {
        if (!validateRelativeOwnedPath(ownedPath)) {
          errors.push(`${mission.id} has invalid writable path: ${ownedPath}`);
        }
      }
    }
    if (!Array.isArray(mission.deliverables) || mission.deliverables.length === 0) {
      errors.push(`${mission.id} must declare deliverables.`);
    }
  }

  for (const mission of missions) {
    for (const dependency of mission.dependsOn ?? []) {
      if (!missionIds.has(dependency)) errors.push(`${mission.id} has unknown dependency ${dependency}.`);
      if (dependency === mission.id) errors.push(`${mission.id} cannot depend on itself.`);
    }
  }

  const missionById = new Map(missions.map((mission) => [mission.id, mission]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (missionId, path = []) => {
    if (visiting.has(missionId)) {
      errors.push(`Mission dependency cycle: ${[...path, missionId].join(' -> ')}`);
      return;
    }
    if (visited.has(missionId) || !missionById.has(missionId)) return;
    visiting.add(missionId);
    for (const dependency of missionById.get(missionId).dependsOn ?? []) {
      visit(dependency, [...path, missionId]);
    }
    visiting.delete(missionId);
    visited.add(missionId);
  };
  for (const mission of missions) visit(mission.id);

  const ownedPaths = missions.flatMap((mission) =>
    (mission.writablePaths ?? []).map((ownedPath) => ({ missionId: mission.id, ownedPath })),
  );
  for (let leftIndex = 0; leftIndex < ownedPaths.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ownedPaths.length; rightIndex += 1) {
      const left = ownedPaths[leftIndex];
      const right = ownedPaths[rightIndex];
      if (left.missionId !== right.missionId && pathsOverlap(left.ownedPath, right.ownedPath)) {
        errors.push(
          `Writable path collision: ${left.missionId} (${left.ownedPath}) and ${right.missionId} (${right.ownedPath}).`,
        );
      }
    }
  }

  if (!manifest.evaluationContract || typeof manifest.evaluationContract !== 'object') {
    errors.push('evaluationContract is required.');
  }

  return errors;
};

const resolveRepository = async (manifest) => {
  const repositoryPath = resolve(manifest.repository.path);
  const repositoryStat = await stat(repositoryPath).catch(() => undefined);
  if (!repositoryStat?.isDirectory()) throw new Error(`Repository path does not exist: ${repositoryPath}`);

  const root = git(repositoryPath, ['rev-parse', '--show-toplevel']);
  if (resolve(root) !== repositoryPath) {
    throw new Error(`repository.path must be the Git root. Resolved root: ${root}`);
  }

  const baseRevision = git(repositoryPath, ['rev-parse', `${manifest.repository.baseRef}^{commit}`]);
  const remoteUrl = runGitCheck(repositoryPath, ['remote', 'get-url', 'origin']);
  const status = git(repositoryPath, ['status', '--porcelain=v1']);

  const collisions = [];
  if (runGitCheck(repositoryPath, ['show-ref', '--verify', `refs/heads/${manifest.integration.branch}`])) {
    collisions.push(`Integration branch already exists locally: ${manifest.integration.branch}`);
  }
  if (runGitCheck(repositoryPath, ['show-ref', '--verify', `refs/remotes/origin/${manifest.integration.branch}`])) {
    collisions.push(`Integration branch already exists on origin: ${manifest.integration.branch}`);
  }

  for (const mission of manifest.missions) {
    if (runGitCheck(repositoryPath, ['show-ref', '--verify', `refs/heads/${mission.branch}`])) {
      collisions.push(`Mission branch already exists locally: ${mission.branch}`);
    }
    if (runGitCheck(repositoryPath, ['show-ref', '--verify', `refs/remotes/origin/${mission.branch}`])) {
      collisions.push(`Mission branch already exists on origin: ${mission.branch}`);
    }
    if (existsSync(mission.worktree)) collisions.push(`Mission worktree path already exists: ${mission.worktree}`);
  }

  return {
    root: repositoryPath,
    remoteUrl,
    baseRef: manifest.repository.baseRef,
    baseRevision,
    inspectedWorktreeDirty: status !== '',
    collisions,
  };
};

const dependencyLevel = (missionId, missionById, cache = new Map()) => {
  if (cache.has(missionId)) return cache.get(missionId);
  const mission = missionById.get(missionId);
  const level = mission.dependsOn.length === 0
    ? 0
    : Math.max(...mission.dependsOn.map((dependency) => dependencyLevel(dependency, missionById, cache))) + 1;
  cache.set(missionId, level);
  return level;
};

const initialEligibility = (mission) => {
  if (mission.dependsOn.length > 0) return 'blocked-by-dependencies';
  if (mission.activationWave === 1) return 'eligible-after-independent-authorization';
  return 'staged-for-later-wave';
};

const resolvePlan = (manifest, repository) => {
  const missionById = new Map(manifest.missions.map((mission) => [mission.id, mission]));
  return {
    schemaVersion: 1,
    prototype: {
      name: 'flight-prep',
      version: TOOL_VERSION,
      authority: 'none',
      notice: 'Planning output only. This artifact grants no mission authority or repository effect.',
    },
    flightId: manifest.flightId,
    objective: manifest.objective,
    sourceIssue: manifest.sourceIssue,
    repository,
    integration: {
      ...manifest.integration,
      status: 'declared-not-created',
    },
    lanes: manifest.lanes,
    missions: manifest.missions.map((mission) => ({
      ...mission,
      dependencyLevel: dependencyLevel(mission.id, missionById),
      initialEligibility: initialEligibility(mission),
      constructionStatus: 'planned-not-created',
      authorityStatus: 'not-initialized',
    })),
    evaluationContract: manifest.evaluationContract,
  };
};

const makeLaunchPacket = (plan, mission) => {
  const contract = plan.evaluationContract;
  return `# ${mission.title}\n\n` +
    `Set: \`${plan.flightId}\`  \n` +
    `Mission: \`${mission.id}\`  \n` +
    `Lane: \`${mission.lane}\`  \n` +
    `Initial status: **${mission.initialEligibility}**\n\n` +
    `## Exact construction target\n\n` +
    `- Repository: \`${plan.repository.root}\`\n` +
    `- Base ref: \`${plan.repository.baseRef}\`\n` +
    `- Resolved base revision: \`${plan.repository.baseRevision}\`\n` +
    `- Planned branch: \`${mission.branch}\`\n` +
    `- Planned worktree: \`${mission.worktree}\`\n` +
    `- Integration branch: \`${plan.integration.branch}\` (declared, not created)\n` +
    `- Dependencies: ${mission.dependsOn.length === 0 ? 'none' : mission.dependsOn.map((dependency) => `\`${dependency}\``).join(', ')}\n\n` +
    `## Bounded scope\n\n` +
    `${mission.scope}\n\n` +
    `Writable paths:\n${mission.writablePaths.map((ownedPath) => `- \`${ownedPath}\``).join('\n')}\n\n` +
    `Deliverables:\n${mission.deliverables.map((deliverable) => `- ${deliverable}`).join('\n')}\n\n` +
    `## Frozen evidence contract\n\n` +
    `Fixture: \`${contract.fixtureId}\` version \`${contract.version}\`\n\n` +
    `Required scorecard dimensions:\n${contract.scorecard.map((dimension) => `- ${dimension}`).join('\n')}\n\n` +
    `## Fail-closed launch boundary\n\n` +
    `This packet is non-authoritative. Before execution, initialize and independently authorize this mission against fresh exact repository, root, branch, base, HEAD, runtime, and executor bindings. Refresh or replace this packet if any exact construction target changes. Do not merge, deploy, release, or update Jira from this packet.\n`;
};

const makeEvidenceTemplate = (plan, mission) => ({
  schemaVersion: 1,
  flightId: plan.flightId,
  missionId: mission.id,
  library: mission.library,
  baseRevision: plan.repository.baseRevision,
  implementationRevision: null,
  status: 'pending',
  fixture: {
    id: plan.evaluationContract.fixtureId,
    version: plan.evaluationContract.version,
  },
  measurements: {
    setupMinutes: null,
    implementationMinutes: null,
    generationDurationMs: null,
    outputBytes: null,
    pageCount: null,
  },
  scorecard: Object.fromEntries(plan.evaluationContract.scorecard.map((dimension) => [dimension, null])),
  capabilities: {},
  advantages: [],
  disadvantages: [],
  risks: [],
  artifacts: [],
  validation: [],
  notes: [],
});

const makeReadme = (plan) => {
  const laneLines = plan.lanes.map((lane) => {
    const missions = plan.missions
      .filter((mission) => mission.lane === lane.id)
      .sort((left, right) => left.activationWave - right.activationWave);
    return `- **${lane.chatLabel} / ${lane.teamLabel}:** ${missions.map((mission) => mission.title).join(' -> ')}`;
  });
  return `# ${plan.flightId} local bootstrap package\n\n` +
    `This package was generated by a local non-authoritative prototype. It creates no branches, worktrees, journals, signatures, runtime bindings, approvals, publication rights, or integration rights.\n\n` +
    `Base: \`${plan.repository.baseRef}\` at \`${plan.repository.baseRevision}\`\n\n` +
    `## Lane plan\n\n${laneLines.join('\n')}\n\n` +
    `## Contents\n\n` +
    `- \`flight-plan.resolved.json\`: exact resolved plan and dependency graph.\n` +
    `- \`evaluation-contract.json\`: common fixture and scorecard contract.\n` +
    `- \`packets/\`: one non-authoritative launch packet per mission.\n` +
    `- \`evidence/\`: one evidence template per mission.\n` +
    `- \`bootstrap-receipt.json\`: hashes and construction observations.\n\n` +
    `Every mission must still be initialized and authorized independently against fresh exact state.\n`;
};

const writePackage = async ({ plan, manifestBytes, manifestPath, outputPath }) => {
  if (existsSync(outputPath)) throw new Error(`Output path already exists: ${outputPath}`);

  await mkdir(join(outputPath, 'packets'), { recursive: true });
  await mkdir(join(outputPath, 'evidence'), { recursive: true });

  const toolPath = fileURLToPath(import.meta.url);
  const toolBytes = await readFile(toolPath);
  const generatedFiles = [];
  const writeArtifact = async (path, content) => {
    await writeFile(join(outputPath, path), content, { encoding: 'utf8', flag: 'wx' });
    generatedFiles.push({ path, sha256: sha256(content) });
  };

  await writeArtifact('README.md', makeReadme(plan));
  await writeArtifact('flight-plan.resolved.json', stableJson(plan));
  await writeArtifact('evaluation-contract.json', stableJson(plan.evaluationContract));

  for (const mission of plan.missions) {
    const slug = mission.id.replaceAll(':', '-');
    await writeArtifact(`packets/${slug}.md`, makeLaunchPacket(plan, mission));
    await writeArtifact(`evidence/${slug}.json`, stableJson(makeEvidenceTemplate(plan, mission)));
  }

  const receipt = {
    schemaVersion: 1,
    flightId: plan.flightId,
    generatedAt: new Date().toISOString(),
    authority: 'none',
    repository: plan.repository,
    manifest: {
      path: manifestPath,
      sha256: sha256(manifestBytes),
    },
    tool: {
      path: toolPath,
      version: TOOL_VERSION,
      sha256: sha256(toolBytes),
    },
    observations: {
      initialEligibleMissions: plan.missions
        .filter((mission) => mission.initialEligibility === 'eligible-after-independent-authorization')
        .map((mission) => mission.id),
      stagedMissions: plan.missions
        .filter((mission) => mission.initialEligibility === 'staged-for-later-wave')
        .map((mission) => mission.id),
      initiallyBlockedMissions: plan.missions
        .filter((mission) => mission.initialEligibility === 'blocked-by-dependencies')
        .map((mission) => mission.id),
      repositoryInspectionWasDirty: plan.repository.inspectedWorktreeDirty,
      collisions: plan.repository.collisions,
    },
    generatedFiles,
  };
  await writeArtifact('bootstrap-receipt.json', stableJson(receipt));
};

export const prepareFlight = async ({ manifestPath, outputPath }) => {
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const errors = validateManifest(manifest);
  if (errors.length > 0) throw new Error(`Invalid flight manifest:\n- ${errors.join('\n- ')}`);

  const repository = await resolveRepository(manifest);
  if (repository.collisions.length > 0) {
    throw new Error(`Construction collisions detected:\n- ${repository.collisions.join('\n- ')}`);
  }
  const plan = resolvePlan(manifest, repository);

  if (outputPath) await writePackage({ plan, manifestBytes, manifestPath, outputPath });
  return plan;
};

const main = async () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const plan = await prepareFlight(arguments_);
  console.log(`Flight: ${plan.flightId}`);
  console.log(`Base: ${plan.repository.baseRef} @ ${plan.repository.baseRevision}`);
  console.log(`Lanes: ${plan.lanes.length}`);
  console.log(`Missions: ${plan.missions.length}`);
  console.log(
    `Initially eligible: ${plan.missions.filter((mission) => mission.initialEligibility === 'eligible-after-independent-authorization').length}`,
  );
  console.log(
    `Staged: ${plan.missions.filter((mission) => mission.initialEligibility === 'staged-for-later-wave').length}`,
  );
  console.log(
    `Initially blocked: ${plan.missions.filter((mission) => mission.initialEligibility === 'blocked-by-dependencies').length}`,
  );
  console.log('Authority: none (planning output only)');
  if (arguments_.outputPath) console.log(`Package: ${arguments_.outputPath}`);
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
