#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstat, mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertNoSymlinkComponents,
  canonicalExistingPath,
  canonicalNewPath,
  git,
  resolveContainedPath,
  sha256,
  snapshotFile,
  stableJson,
  tryGit,
  writeNewFile,
} from './common.mjs';
import {
  TOOL_VERSION,
  canonicalRelativePath,
  validateManifestContract,
} from './flight-common.mjs';

const parseArguments = (argv) => {
  const arguments_ = [...argv];
  const manifestPath = arguments_.shift();
  let outputPath;
  while (arguments_.length > 0) {
    const argument = arguments_.shift();
    if (argument === '--output') {
      outputPath = arguments_.shift();
      if (!outputPath) throw new Error('--output requires a directory path.');
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!manifestPath) throw new Error('Usage: shield-ops flight prep MANIFEST.json [--output NEW_DIRECTORY]');
  return { manifestPath: resolve(manifestPath), outputPath: outputPath && resolve(outputPath) };
};

const gitBranchExists = (repositoryPath, branch) =>
  tryGit(repositoryPath, ['show-ref', '--verify', `refs/heads/${branch}`]) !== undefined ||
  tryGit(repositoryPath, ['show-ref', '--verify', `refs/remotes/origin/${branch}`]) !== undefined;

const isAncestor = (repositoryPath, ancestor, descendant) => {
  try {
    execFileSync('git', ['-C', repositoryPath, 'merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const resolveRepository = async (manifest) => {
  const repositoryPath = await canonicalExistingPath(manifest.repository.path).catch(() => undefined);
  if (!repositoryPath) throw new Error(`Repository path does not exist: ${manifest.repository.path}`);
  const root = await canonicalExistingPath(git(repositoryPath, ['rev-parse', '--show-toplevel']));
  if (root !== repositoryPath) throw new Error(`repository.path must identify the Git root. Resolved root: ${root}`);

  let baseRefRevision;
  try {
    baseRefRevision = git(root, ['rev-parse', '--verify', `${manifest.repository.baseRef}^{commit}`]);
  } catch {
    throw new Error(`Base ref is unavailable: ${manifest.repository.baseRef}`);
  }
  if (baseRefRevision !== manifest.repository.baseRevision) {
    throw new Error(`Base ref drift: ${manifest.repository.baseRef} resolves to ${baseRefRevision}; expected ${manifest.repository.baseRevision}.`);
  }
  try {
    git(root, ['cat-file', '-e', `${manifest.repository.baseRevision}^{commit}`]);
  } catch {
    throw new Error(`Exact base revision is unavailable: ${manifest.repository.baseRevision}`);
  }
  const inspectedHead = git(root, ['rev-parse', 'HEAD']);
  if (!isAncestor(root, manifest.repository.baseRevision, inspectedHead)) {
    throw new Error(`Required ancestry drift: ${manifest.repository.baseRevision} is not an ancestor of ${inspectedHead}.`);
  }
  if (inspectedHead !== manifest.repository.baseRevision) {
    throw new Error(`Phase HEAD drift: repository HEAD is ${inspectedHead}; expected exact base ${manifest.repository.baseRevision}.`);
  }

  const collisions = [];
  if (gitBranchExists(root, manifest.integration.branch)) {
    collisions.push(`Integration branch already exists locally or on origin: ${manifest.integration.branch}`);
  }

  const canonicalWorktrees = new Map();
  const worktreeIdentities = new Map();
  for (const mission of manifest.missions) {
    if (gitBranchExists(root, mission.branch)) {
      collisions.push(`Mission branch already exists locally or on origin: ${mission.branch}`);
    }
    await assertNoSymlinkComponents(mission.worktree);
    const existing = await lstat(mission.worktree).catch((error) => {
      if (error?.code === 'ENOENT') return undefined;
      throw error;
    });
    const canonicalWorktree = existing
      ? await canonicalExistingPath(mission.worktree)
      : await canonicalNewPath(mission.worktree);
    canonicalWorktrees.set(mission.id, canonicalWorktree);
    const priorMission = worktreeIdentities.get(canonicalWorktree);
    if (priorMission) collisions.push(`Canonical worktree collision: ${priorMission} and ${mission.id} resolve to ${canonicalWorktree}.`);
    worktreeIdentities.set(canonicalWorktree, mission.id);
    if (existing) collisions.push(`Mission worktree path already exists: ${mission.worktree}`);
  }

  const status = git(root, ['status', '--porcelain=v1']);
  return {
    repository: {
      root,
      remoteUrl: tryGit(root, ['remote', 'get-url', 'origin']) ?? null,
      baseRef: manifest.repository.baseRef,
      baseRevision: manifest.repository.baseRevision,
      inspectedHead,
      inspectedBranch: tryGit(root, ['branch', '--show-current']) || null,
      inspectedWorktreeClean: status === '',
      collisions,
    },
    canonicalWorktrees,
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

const resolvePlan = (manifest, repositoryResult) => {
  const missionById = new Map(manifest.missions.map((mission) => [mission.id, mission]));
  return {
    schemaVersion: 1,
    planType: 'feature-flight-resolved-plan',
    prototype: {
      name: 'flight-prep',
      version: TOOL_VERSION,
      authority: 'none',
      notice: 'Planning output only. This artifact grants no mission authority or repository effect.',
    },
    flightId: manifest.flightId,
    objective: manifest.objective,
    ...(manifest.sourceIssue ? { sourceIssue: manifest.sourceIssue } : {}),
    repository: repositoryResult.repository,
    integration: { ...manifest.integration, status: 'declared-not-created' },
    lanes: manifest.lanes,
    missions: manifest.missions.map((mission) => ({
      ...mission,
      worktree: repositoryResult.canonicalWorktrees.get(mission.id),
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
    `Set: \`${plan.flightId}\`  \nMission: \`${mission.id}\`  \nLane: \`${mission.lane}\`  \n` +
    `Initial status: **${mission.initialEligibility}**\n\n## Exact construction target\n\n` +
    `- Repository: \`${plan.repository.root}\`\n- Base ref: \`${plan.repository.baseRef}\`\n` +
    `- Resolved base revision: \`${plan.repository.baseRevision}\`\n- Planned branch: \`${mission.branch}\`\n` +
    `- Planned worktree: \`${mission.worktree}\`\n- Integration branch: \`${plan.integration.branch}\` (declared, not created)\n` +
    `- Dependencies: ${mission.dependsOn.length === 0 ? 'none' : mission.dependsOn.map((dependency) => `\`${dependency}\``).join(', ')}\n\n` +
    `## Bounded scope\n\n${mission.scope}\n\nWritable paths:\n${mission.writablePaths.map((ownedPath) => `- \`${ownedPath}\``).join('\n')}\n\n` +
    `Deliverables:\n${mission.deliverables.map((deliverable) => `- ${deliverable}`).join('\n')}\n\n` +
    `## Frozen evidence contract\n\nFixture: \`${contract.fixtureId}\` version \`${contract.version}\`\n\n` +
    `Required scorecard dimensions:\n${contract.scorecard.map((dimension) => `- ${dimension}`).join('\n')}\n\n` +
    '## Fail-closed launch boundary\n\nThis packet is observational and non-authoritative. Before execution, independently authorize this mission against fresh exact repository, branch, base, HEAD, runtime, and executor bindings. Do not merge, deploy, release, or update external systems from this packet.\n';
};

const makeEvidenceTemplate = (plan, mission) => ({
  schemaVersion: 1,
  flightId: plan.flightId,
  missionId: mission.id,
  missionSlug: mission.slug,
  library: mission.library,
  baseRevision: plan.repository.baseRevision,
  implementationRevision: null,
  status: 'pending',
  fixture: { id: plan.evaluationContract.fixtureId, version: plan.evaluationContract.version },
  measurements: { setupMinutes: null, implementationMinutes: null, generationDurationMs: null, outputBytes: null, pageCount: null },
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
    const missions = plan.missions.filter((mission) => mission.lane === lane.id)
      .sort((left, right) => left.activationWave - right.activationWave);
    return `- **${lane.chatLabel} / ${lane.teamLabel}:** ${missions.map((mission) => mission.title).join(' -> ')}`;
  });
  return `# ${plan.flightId} bootstrap package\n\nThis package is observational and non-authoritative. It creates no branches, worktrees, journals, signatures, runtime bindings, approvals, publication rights, or integration rights.\n\nBase: \`${plan.repository.baseRef}\` at \`${plan.repository.baseRevision}\`\n\n## Lane plan\n\n${laneLines.join('\n')}\n\n## Contents\n\n- \`flight-plan.resolved.json\`: closed resolved plan and dependency graph.\n- \`evaluation-contract.json\`: closed fixture and scorecard contract.\n- \`packets/\`: one launch packet per mission slug.\n- \`evidence/\`: one evidence template per mission slug.\n- \`bootstrap-receipt.json\`: closed inventory and construction observations.\n\nEvery mission still requires independent authorization against fresh exact state.\n`;
};

const writePackage = async ({ plan, manifestSnapshot, outputPath }) => {
  const outputRoot = await canonicalNewPath(outputPath);
  if (canonicalRelativePath(basename(outputRoot)) !== basename(outputRoot)) {
    throw new Error(`Output directory name is not a canonical generated name: ${basename(outputRoot)}`);
  }
  if (await lstat(outputRoot).catch(() => undefined)) throw new Error(`Output path already exists: ${outputRoot}`);
  await mkdir(outputRoot, { mode: 0o700 });
  await mkdir(resolveContainedPath(outputRoot, 'packets'), { mode: 0o700 });
  await mkdir(resolveContainedPath(outputRoot, 'evidence'), { mode: 0o700 });

  const toolSnapshot = await snapshotFile(fileURLToPath(import.meta.url));
  const generatedFiles = [];
  const writeArtifact = async (relativePath, content) => {
    if (canonicalRelativePath(relativePath) !== relativePath) throw new Error(`Unsafe generated artifact path: ${relativePath}`);
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    await writeNewFile(resolveContainedPath(outputRoot, relativePath), bytes);
    generatedFiles.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
  };

  await writeArtifact('README.md', makeReadme(plan));
  await writeArtifact('flight-plan.resolved.json', stableJson(plan));
  await writeArtifact('evaluation-contract.json', stableJson(plan.evaluationContract));
  for (const mission of plan.missions) {
    await writeArtifact(`packets/${mission.slug}.md`, makeLaunchPacket(plan, mission));
    await writeArtifact(`evidence/${mission.slug}.json`, stableJson(makeEvidenceTemplate(plan, mission)));
  }

  const receipt = {
    schemaVersion: 1,
    receiptType: 'feature-flight-bootstrap',
    flightId: plan.flightId,
    generatedAt: new Date().toISOString(),
    authority: 'none',
    repository: plan.repository,
    manifest: { path: manifestSnapshot.path, bytes: manifestSnapshot.size, sha256: manifestSnapshot.sha256 },
    tool: { path: toolSnapshot.path, version: TOOL_VERSION, bytes: toolSnapshot.size, sha256: toolSnapshot.sha256 },
    observations: {
      initialEligibleMissions: plan.missions.filter((mission) => mission.initialEligibility === 'eligible-after-independent-authorization').map((mission) => mission.id),
      stagedMissions: plan.missions.filter((mission) => mission.initialEligibility === 'staged-for-later-wave').map((mission) => mission.id),
      initiallyBlockedMissions: plan.missions.filter((mission) => mission.initialEligibility === 'blocked-by-dependencies').map((mission) => mission.id),
      repositoryInspectionWasClean: plan.repository.inspectedWorktreeClean,
      collisions: plan.repository.collisions,
    },
    generatedFiles,
  };
  await writeArtifact('bootstrap-receipt.json', stableJson(receipt));
  return outputRoot;
};

export const prepareFlight = async ({ manifestPath, outputPath }) => {
  const manifestSnapshot = await snapshotFile(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestSnapshot.bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid flight manifest JSON: ${error instanceof Error ? error.message : error}`);
  }
  const errors = validateManifestContract(manifest);
  if (errors.length > 0) throw new Error(`Invalid flight manifest:\n- ${errors.join('\n- ')}`);
  const repositoryResult = await resolveRepository(manifest);
  if (repositoryResult.repository.collisions.length > 0) {
    throw new Error(`Construction collisions detected:\n- ${repositoryResult.repository.collisions.join('\n- ')}`);
  }
  const plan = resolvePlan(manifest, repositoryResult);
  if (outputPath) await writePackage({ plan, manifestSnapshot, outputPath });
  return plan;
};

const main = async () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const result = await prepareFlight(arguments_);
  console.log(`Flight: ${result.flightId}`);
  console.log(`Base: ${result.repository.baseRef} @ ${result.repository.baseRevision}`);
  console.log(`Lanes: ${result.lanes.length}`);
  console.log(`Missions: ${result.missions.length}`);
  console.log('Authority: none (observational planning output only)');
  if (arguments_.outputPath) console.log(`Package: ${arguments_.outputPath}`);
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
