import { execFileSync } from 'node:child_process';
import { isAbsolute, posix } from 'node:path';

import {
  SHA256_PATTERN,
  canonicalExistingPath,
  exactKeys,
  git,
  inspectGit,
  nonEmptyString,
} from './common.mjs';

export const TOOL_VERSION = '1.0.0';
export const GIT_REVISION_PATTERN = /^[a-f0-9]{40}$/u;
export const MISSION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const POSIX_COMPONENT_PATTERN = /^[A-Za-z0-9._@+-]+$/u;

export const deriveMissionSlug = (missionId) => String(missionId ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/gu, '-')
  .replace(/^-+|-+$/gu, '');

export const canonicalRelativePath = (value, { ownership = false } = {}) => {
  if (typeof value !== 'string' || value === '' || value.trim() !== value) return null;
  if (value.includes('\\') || value.includes('//') || value.startsWith('/') || value.endsWith('/')) return null;
  if (isAbsolute(value)) return null;
  let core = value;
  let suffix = '';
  if (ownership && core.endsWith('/**')) {
    core = core.slice(0, -3);
    suffix = '/**';
  }
  if (core === '' || core.includes('*')) return null;
  const components = core.split('/');
  if (components.some((component) =>
    component === '' || component === '.' || component === '..' || !POSIX_COMPONENT_PATTERN.test(component))) return null;
  const normalized = posix.normalize(core);
  if (normalized !== core || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return `${normalized}${suffix}`;
};

export const normalizeOwnedPath = (value) => {
  const canonical = canonicalRelativePath(value, { ownership: true });
  return canonical?.endsWith('/**') ? canonical.slice(0, -3) : canonical;
};

export const pathMatches = (path, writablePath) => {
  const canonicalPath = canonicalRelativePath(path);
  const canonicalOwnership = canonicalRelativePath(writablePath, { ownership: true });
  if (!canonicalPath || !canonicalOwnership) return false;
  if (canonicalOwnership.endsWith('/**')) {
    const prefix = canonicalOwnership.slice(0, -3);
    return canonicalPath === prefix || canonicalPath.startsWith(`${prefix}/`);
  }
  return canonicalPath === canonicalOwnership;
};

export const pathsOverlap = (left, right) => {
  const normalizedLeft = normalizeOwnedPath(left);
  const normalizedRight = normalizeOwnedPath(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`);
};

const exactKnownKeys = (value, required, optional, label, errors) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${label} contains unknown field ${key}.`);
  for (const key of required) if (!Object.hasOwn(value, key)) errors.push(`${label}.${key} is required.`);
  return true;
};

const validateStringArray = (value, label, errors, { allowEmpty = false } = {}) => {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push(`${label} must be ${allowEmpty ? 'an array' : 'a non-empty array'}.`);
    return false;
  }
  if (value.some((entry) => !nonEmptyString(entry))) errors.push(`${label} must contain only non-empty strings.`);
  return true;
};

export const validateEvaluationContract = (contract, label = 'evaluationContract') => {
  const errors = [];
  if (!exactKeys(contract, ['fixtureId', 'version', 'scorecard'], label, errors)) return errors;
  if (!nonEmptyString(contract.fixtureId)) errors.push(`${label}.fixtureId must be a non-empty string.`);
  if (!Number.isInteger(contract.version) || contract.version < 1) errors.push(`${label}.version must be a positive integer.`);
  if (validateStringArray(contract.scorecard, `${label}.scorecard`, errors) &&
      new Set(contract.scorecard).size !== contract.scorecard.length) errors.push(`${label}.scorecard contains duplicates.`);
  return errors;
};

export const validateBranchRef = (value) => {
  if (!nonEmptyString(value)) return false;
  try {
    execFileSync('git', ['check-ref-format', '--branch', value], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

export const deriveInitialEligibility = (mission) => {
  if (mission.dependsOn.length > 0) return 'blocked-by-dependencies';
  if (mission.activationWave === 1) return 'eligible-after-independent-authorization';
  return 'staged-for-later-wave';
};

export const deriveDependencyLevels = (missions) => {
  const byId = new Map(missions.map((mission) => [mission.id, mission]));
  const levels = new Map();
  const visiting = new Set();
  const visit = (missionId) => {
    if (levels.has(missionId)) return levels.get(missionId);
    if (visiting.has(missionId) || !byId.has(missionId)) return null;
    visiting.add(missionId);
    const dependencyLevels = byId.get(missionId).dependsOn.map((dependency) => visit(dependency));
    visiting.delete(missionId);
    if (dependencyLevels.some((level) => level === null)) return null;
    const level = dependencyLevels.length === 0 ? 0 : Math.max(...dependencyLevels) + 1;
    levels.set(missionId, level);
    return level;
  };
  for (const mission of missions) visit(mission.id);
  return levels;
};

const validateMission = (mission, label, errors, { resolved }) => {
  const manifestFields = [
    'id', 'slug', 'title', 'library', 'lane', 'branch', 'worktree', 'activationWave',
    'dependsOn', 'writablePaths', 'scope', 'deliverables',
  ];
  const resolvedFields = ['dependencyLevel', 'initialEligibility', 'constructionStatus', 'authorityStatus'];
  if (!exactKeys(mission, resolved ? [...manifestFields, ...resolvedFields] : manifestFields, label, errors)) return false;
  for (const field of ['id', 'title', 'library', 'lane', 'branch', 'worktree', 'scope']) {
    if (!nonEmptyString(mission[field])) errors.push(`${label}.${field} must be a non-empty string.`);
  }
  const derivedSlug = deriveMissionSlug(mission.id);
  if (!MISSION_SLUG_PATTERN.test(mission.slug ?? '')) errors.push(`${label}.slug must be a strict lowercase safe slug.`);
  if (mission.slug !== derivedSlug) errors.push(`${label}.slug must equal the derived slug ${derivedSlug || '<empty>'}.`);
  if (!validateBranchRef(mission.branch)) errors.push(`${label}.branch is not a valid Git branch ref.`);
  if (!nonEmptyString(mission.worktree) || !isAbsolute(mission.worktree)) errors.push(`${label}.worktree must be an absolute path.`);
  if (!Number.isInteger(mission.activationWave) || mission.activationWave < 1) errors.push(`${label}.activationWave must be a positive integer.`);
  validateStringArray(mission.dependsOn, `${label}.dependsOn`, errors, { allowEmpty: true });
  if (validateStringArray(mission.writablePaths, `${label}.writablePaths`, errors)) {
    for (const ownedPath of mission.writablePaths) {
      if (canonicalRelativePath(ownedPath, { ownership: true }) !== ownedPath) {
        errors.push(`${label} has non-canonical writable path: ${ownedPath}`);
      }
    }
  }
  validateStringArray(mission.deliverables, `${label}.deliverables`, errors);
  if (resolved) {
    if (!Number.isInteger(mission.dependencyLevel) || mission.dependencyLevel < 0) errors.push(`${label}.dependencyLevel must be a non-negative integer.`);
    if (Array.isArray(mission.dependsOn) && Number.isInteger(mission.activationWave) &&
        mission.initialEligibility !== deriveInitialEligibility(mission)) errors.push(`${label}.initialEligibility does not match its dependencies and activation wave.`);
    if (mission.constructionStatus !== 'planned-not-created') errors.push(`${label}.constructionStatus must equal planned-not-created.`);
    if (mission.authorityStatus !== 'not-initialized') errors.push(`${label}.authorityStatus must equal not-initialized.`);
  }
  return true;
};

const validateMissions = (missions, errors, { resolved }) => {
  if (!Array.isArray(missions) || missions.length === 0) {
    errors.push('missions must contain at least one mission.');
    return;
  }
  const ids = new Set();
  const slugs = new Set();
  const branches = new Set();
  const worktrees = new Set();
  const validMissions = [];
  for (const [index, mission] of missions.entries()) {
    const label = `missions[${index}]`;
    if (!validateMission(mission, label, errors, { resolved })) continue;
    validMissions.push(mission);
    if (ids.has(mission.id)) errors.push(`Duplicate mission ID: ${mission.id}`);
    ids.add(mission.id);
    if (slugs.has(mission.slug)) errors.push(`Mission slug collision: ${mission.slug}`);
    slugs.add(mission.slug);
    if (branches.has(mission.branch)) errors.push(`Duplicate planned branch: ${mission.branch}`);
    branches.add(mission.branch);
    if (worktrees.has(mission.worktree)) errors.push(`Duplicate planned worktree: ${mission.worktree}`);
    worktrees.add(mission.worktree);
  }
  for (const mission of validMissions) {
    for (const dependency of mission.dependsOn ?? []) {
      if (!ids.has(dependency)) errors.push(`${mission.id} has unknown dependency ${dependency}.`);
      if (dependency === mission.id) errors.push(`${mission.id} cannot depend on itself.`);
    }
  }
  const byId = new Map(validMissions.map((mission) => [mission.id, mission]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id, chain = []) => {
    if (visiting.has(id)) {
      errors.push(`Mission dependency cycle: ${[...chain, id].join(' -> ')}`);
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn ?? []) visit(dependency, [...chain, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);

  const ownership = validMissions.flatMap((mission) =>
    (mission.writablePaths ?? []).map((path) => ({ missionId: mission.id, path })),
  );
  for (let left = 0; left < ownership.length; left += 1) {
    for (let right = left + 1; right < ownership.length; right += 1) {
      const a = ownership[left];
      const b = ownership[right];
      if (a.missionId !== b.missionId && pathsOverlap(a.path, b.path)) {
        errors.push(`Writable path collision: ${a.missionId} (${a.path}) and ${b.missionId} (${b.path}).`);
      }
    }
  }
};

export const validateManifestContract = (manifest) => {
  const errors = [];
  const required = ['schemaVersion', 'flightId', 'objective', 'repository', 'integration', 'lanes', 'missions', 'evaluationContract'];
  if (!exactKnownKeys(manifest, required, ['sourceIssue'], 'manifest', errors)) return errors;
  if (manifest.schemaVersion !== 1) errors.push('manifest.schemaVersion must equal 1.');
  for (const field of ['flightId', 'objective']) if (!nonEmptyString(manifest[field])) errors.push(`manifest.${field} must be a non-empty string.`);
  if (Object.hasOwn(manifest, 'sourceIssue') && !nonEmptyString(manifest.sourceIssue)) errors.push('manifest.sourceIssue must be a non-empty string when present.');
  if (exactKeys(manifest.repository, ['path', 'baseRef', 'baseRevision'], 'manifest.repository', errors)) {
    if (!isAbsolute(manifest.repository.path ?? '')) errors.push('manifest.repository.path must be absolute.');
    if (!nonEmptyString(manifest.repository.baseRef)) errors.push('manifest.repository.baseRef must be a non-empty string.');
    if (!GIT_REVISION_PATTERN.test(manifest.repository.baseRevision ?? '')) errors.push('manifest.repository.baseRevision must be an exact 40-character revision.');
  }
  if (exactKeys(manifest.integration, ['branch'], 'manifest.integration', errors) &&
      !validateBranchRef(manifest.integration.branch)) errors.push('manifest.integration.branch is not a valid Git branch ref.');
  if (!Array.isArray(manifest.lanes) || manifest.lanes.length === 0) errors.push('manifest.lanes must contain at least one lane.');
  const laneIds = new Set();
  for (const [index, lane] of (Array.isArray(manifest.lanes) ? manifest.lanes : []).entries()) {
    const label = `manifest.lanes[${index}]`;
    if (!exactKeys(lane, ['id', 'chatLabel', 'teamLabel'], label, errors)) continue;
    for (const field of ['id', 'chatLabel', 'teamLabel']) if (!nonEmptyString(lane[field])) errors.push(`${label}.${field} must be a non-empty string.`);
    if (laneIds.has(lane.id)) errors.push(`Duplicate lane ID: ${lane.id}`);
    laneIds.add(lane.id);
  }
  validateMissions(manifest.missions, errors, { resolved: false });
  for (const mission of (Array.isArray(manifest.missions) ? manifest.missions.filter((entry) => entry && typeof entry === 'object') : [])) {
    if (!laneIds.has(mission.lane)) errors.push(`${mission.id} references unknown lane ${mission.lane}.`);
    if (mission.branch === manifest.integration?.branch) errors.push(`${mission.id} branch must be role-distinct from the integration branch.`);
  }
  errors.push(...validateEvaluationContract(manifest.evaluationContract, 'manifest.evaluationContract'));
  return errors;
};

export const validatePlan = (plan) => {
  const errors = [];
  const required = ['schemaVersion', 'planType', 'prototype', 'flightId', 'objective', 'repository', 'integration', 'lanes', 'missions', 'evaluationContract'];
  if (!exactKnownKeys(plan, required, ['sourceIssue'], 'plan', errors)) return errors;
  if (plan.schemaVersion !== 1) errors.push('Plan schemaVersion must equal 1.');
  if (plan.planType !== 'feature-flight-resolved-plan') errors.push('Plan planType must equal feature-flight-resolved-plan.');
  if (!nonEmptyString(plan.flightId) || !nonEmptyString(plan.objective)) errors.push('Plan flightId and objective are required.');
  if (exactKeys(plan.prototype, ['name', 'version', 'authority', 'notice'], 'plan.prototype', errors)) {
    if (plan.prototype.name !== 'flight-prep' || plan.prototype.version !== TOOL_VERSION || plan.prototype.authority !== 'none') errors.push('Plan prototype identity is unsupported.');
  }
  if (exactKeys(plan.repository, ['root', 'remoteUrl', 'baseRef', 'baseRevision', 'inspectedHead', 'inspectedBranch', 'inspectedWorktreeClean', 'collisions'], 'plan.repository', errors)) {
    if (!nonEmptyString(plan.repository.root) || !isAbsolute(plan.repository.root)) errors.push('Plan repository.root must be absolute.');
    if (!nonEmptyString(plan.repository.baseRef)) errors.push('Plan repository.baseRef is required.');
    if (!GIT_REVISION_PATTERN.test(plan.repository.baseRevision ?? '') || !GIT_REVISION_PATTERN.test(plan.repository.inspectedHead ?? '')) errors.push('Plan repository revisions must be exact 40-character revisions.');
    if (plan.repository.inspectedHead !== plan.repository.baseRevision) errors.push('Plan repository.inspectedHead must equal the exact base revision.');
    if (plan.repository.remoteUrl !== null && !nonEmptyString(plan.repository.remoteUrl)) errors.push('Plan repository.remoteUrl must be null or a non-empty string.');
    if (plan.repository.inspectedBranch !== null && !validateBranchRef(plan.repository.inspectedBranch)) errors.push('Plan repository.inspectedBranch must be null or a valid Git branch ref.');
    if (typeof plan.repository.inspectedWorktreeClean !== 'boolean') errors.push('Plan repository.inspectedWorktreeClean must be boolean.');
    if (!Array.isArray(plan.repository.collisions) || plan.repository.collisions.some((collision) => !nonEmptyString(collision))) errors.push('Plan repository.collisions must be an array of non-empty strings.');
    else if (plan.repository.collisions.length !== 0) errors.push('Plan repository.collisions must be empty for a resolved plan.');
  }
  if (exactKeys(plan.integration, ['branch', 'status'], 'plan.integration', errors)) {
    if (!validateBranchRef(plan.integration.branch)) errors.push('Plan integration.branch is invalid.');
    if (plan.integration.status !== 'declared-not-created') errors.push('Plan integration.status must equal declared-not-created.');
    if (plan.integration.branch === plan.repository?.inspectedBranch) errors.push('Plan integration.branch must differ from the inspected repository branch.');
  }
  if (!Array.isArray(plan.lanes) || plan.lanes.length === 0) errors.push('Plan lanes must not be empty.');
  const laneIds = new Set();
  for (const [index, lane] of (Array.isArray(plan.lanes) ? plan.lanes : []).entries()) {
    const label = `plan.lanes[${index}]`;
    if (!exactKeys(lane, ['id', 'chatLabel', 'teamLabel'], label, errors)) continue;
    for (const field of ['id', 'chatLabel', 'teamLabel']) if (!nonEmptyString(lane[field])) errors.push(`${label}.${field} must be a non-empty string.`);
    if (laneIds.has(lane.id)) errors.push(`Duplicate lane ID: ${lane.id}`);
    laneIds.add(lane.id);
  }
  validateMissions(plan.missions, errors, { resolved: true });
  const resolvedMissions = Array.isArray(plan.missions)
    ? plan.missions.filter((entry) => entry && typeof entry === 'object' && Array.isArray(entry.dependsOn))
    : [];
  const dependencyLevels = deriveDependencyLevels(resolvedMissions);
  for (const mission of resolvedMissions) {
    if (!laneIds.has(mission.lane)) errors.push(`${mission.id} references unknown lane ${mission.lane}.`);
    if (mission.branch === plan.integration?.branch) errors.push(`${mission.id} branch must be role-distinct from the integration branch.`);
    const expectedLevel = dependencyLevels.get(mission.id);
    if (expectedLevel !== undefined && mission.dependencyLevel !== expectedLevel) {
      errors.push(`${mission.id} dependencyLevel is ${mission.dependencyLevel}; expected producer-derived level ${expectedLevel}.`);
    }
  }
  errors.push(...validateEvaluationContract(plan.evaluationContract, 'plan.evaluationContract'));
  return errors;
};

export const assertPlan = (plan) => {
  const errors = validatePlan(plan);
  if (errors.length > 0) throw new Error(`Invalid flight plan:\n- ${errors.join('\n- ')}`);
  return plan;
};

const isAncestor = (repositoryPath, ancestor, descendant) => {
  try {
    execFileSync('git', ['-C', repositoryPath, 'merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

export const inspectPlannedRepository = async (repositoryPlan, { requireExactHead = true } = {}) => {
  const errors = [];
  const expectedRoot = await canonicalExistingPath(repositoryPlan.root).catch(() => undefined);
  if (!expectedRoot) return { repository: null, errors: [`Planned repository is unavailable: ${repositoryPlan.root}`] };
  const repository = inspectGit(expectedRoot);
  if (!repository) return { repository: null, errors: [`Planned repository is not a Git worktree: ${expectedRoot}`] };
  const actualRoot = await canonicalExistingPath(repository.root).catch(() => undefined);
  if (actualRoot !== expectedRoot) errors.push(`Repository identity drift: expected ${expectedRoot}; observed ${actualRoot ?? repository.root}.`);
  let baseRefRevision;
  try {
    baseRefRevision = git(expectedRoot, ['rev-parse', '--verify', `${repositoryPlan.baseRef}^{commit}`]);
  } catch {
    errors.push(`Base ref is unavailable: ${repositoryPlan.baseRef}.`);
  }
  if (baseRefRevision && baseRefRevision !== repositoryPlan.baseRevision) {
    errors.push(`Base ref drift: ${repositoryPlan.baseRef} resolves to ${baseRefRevision}; expected ${repositoryPlan.baseRevision}.`);
  }
  try {
    git(expectedRoot, ['cat-file', '-e', `${repositoryPlan.baseRevision}^{commit}`]);
  } catch {
    errors.push(`Exact base revision is unavailable: ${repositoryPlan.baseRevision}.`);
  }
  if (!isAncestor(expectedRoot, repositoryPlan.baseRevision, repository.head)) {
    errors.push(`Required ancestry drift: ${repositoryPlan.baseRevision} is not an ancestor of ${repository.head}.`);
  }
  if (requireExactHead && repository.head !== repositoryPlan.baseRevision) {
    errors.push(`Phase HEAD drift: repository HEAD is ${repository.head}; expected exact base ${repositoryPlan.baseRevision}.`);
  }
  return { repository: { ...repository, root: expectedRoot, baseRefRevision }, errors };
};

export const validateDigest = (value) => SHA256_PATTERN.test(value ?? '');
