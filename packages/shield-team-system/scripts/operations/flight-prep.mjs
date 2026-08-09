#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
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
  PLAN_NOTICE,
  TOOL_VERSION,
  canonicalRelativePath,
  deriveDependencyLevels,
  deriveInitialEligibility,
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

const sanitizedRemoteIdentity = (rawRemoteUrl) => {
  if (!rawRemoteUrl) return null;
  const remoteUrl = rawRemoteUrl.trim();
  if (remoteUrl === '') return null;

  if (/^[a-z][a-z\d+.-]*:\/\//iu.test(remoteUrl)) {
    let parsed;
    try {
      parsed = new URL(remoteUrl);
    } catch {
      throw new Error('Origin remote URL cannot be safely reduced to a credential-free repository identity.');
    }
    if (parsed.protocol === 'file:') return null;
    const repositoryPath = parsed.pathname.replace(/^\/+|\/+$/gu, '');
    if (!parsed.host || !repositoryPath) {
      throw new Error('Origin remote URL cannot be safely reduced to a credential-free repository identity.');
    }
    return `${parsed.host}/${repositoryPath}`;
  }

  const scpLike = /^(?:[^@/:\s]+@)?(\[[^\]]+\]|[^/:\s]+):\/?([^?#]+?)(?:[?#].*)?$/u.exec(remoteUrl);
  if (scpLike) return `${scpLike[1]}/${scpLike[2].replace(/\/+$/u, '')}`;

  // Local-path remotes have no stable host/repository identity and are not
  // needed for the observational plan contract.
  if (!remoteUrl.includes('@')) return null;
  throw new Error('Origin remote URL cannot be safely reduced to a credential-free repository identity.');
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
  const remoteUrl = sanitizedRemoteIdentity(tryGit(root, ['remote', 'get-url', 'origin']));
  return {
    repository: {
      root,
      remoteUrl,
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

const resolvePlan = (manifest, repositoryResult) => {
  const dependencyLevels = deriveDependencyLevels(manifest.missions);
  return {
    schemaVersion: 1,
    planType: 'feature-flight-resolved-plan',
    prototype: {
      name: 'flight-prep',
      version: TOOL_VERSION,
      authority: 'none',
      notice: PLAN_NOTICE,
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
      dependencyLevel: dependencyLevels.get(mission.id),
      initialEligibility: deriveInitialEligibility(mission),
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

const defaultPackageDependencies = { chmod, lstat, mkdir, mkdtemp, open, rename, rm, writeNewFile };

const syncDirectory = async (path, dependencies) => {
  const handle = await dependencies.open(path, fsConstants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
};

const writePackage = async ({ plan, manifestSnapshot, outputPath, injectedDependencies }) => {
  const dependencies = { ...defaultPackageDependencies, ...injectedDependencies };
  const finalRoot = await canonicalNewPath(outputPath);
  if (canonicalRelativePath(basename(finalRoot)) !== basename(finalRoot)) {
    throw new Error(`Output directory name is not a canonical generated name: ${basename(finalRoot)}`);
  }
  if (await dependencies.lstat(finalRoot).catch(() => undefined)) throw new Error(`Output path already exists: ${finalRoot}`);

  const toolSnapshot = await snapshotFile(fileURLToPath(import.meta.url));
  const parent = dirname(finalRoot);
  let stagingRoot;
  try {
    stagingRoot = await dependencies.mkdtemp(join(parent, `.${basename(finalRoot)}.staging-`));
    await dependencies.chmod(stagingRoot, 0o700);
    await dependencies.mkdir(resolveContainedPath(stagingRoot, 'packets'), { mode: 0o700 });
    await dependencies.mkdir(resolveContainedPath(stagingRoot, 'evidence'), { mode: 0o700 });

    const generatedFiles = [];
    const writeArtifact = async (relativePath, content) => {
      if (canonicalRelativePath(relativePath) !== relativePath) throw new Error(`Unsafe generated artifact path: ${relativePath}`);
      const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
      await dependencies.writeNewFile(resolveContainedPath(stagingRoot, relativePath), bytes);
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
    await syncDirectory(resolveContainedPath(stagingRoot, 'packets'), dependencies);
    await syncDirectory(resolveContainedPath(stagingRoot, 'evidence'), dependencies);
    await syncDirectory(stagingRoot, dependencies);

    if (await dependencies.lstat(finalRoot).catch(() => undefined)) throw new Error(`Output path already exists: ${finalRoot}`);
    await dependencies.rename(stagingRoot, finalRoot);
    stagingRoot = undefined;
    await syncDirectory(parent, dependencies);
    return finalRoot;
  } catch (error) {
    if (stagingRoot) await dependencies.rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
};

export const prepareFlight = async ({ manifestPath, outputPath, packageDependencies }) => {
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
  if (outputPath) await writePackage({ plan, manifestSnapshot, outputPath, injectedDependencies: packageDependencies });
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
