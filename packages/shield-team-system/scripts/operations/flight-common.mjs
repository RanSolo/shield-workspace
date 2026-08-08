import { isAbsolute, normalize, sep } from 'node:path';

export const MISSION_STATUSES = new Set([
  'planned',
  'authorized',
  'active',
  'blocked',
  'complete',
  'integrated',
  'failed',
  'cancelled',
  'superseded',
]);

export const terminalStatuses = new Set(['integrated', 'cancelled', 'superseded']);

export const normalizeOwnedPath = (value) => value.replace(/\/\*\*?$/u, '').replace(/\/$/u, '');

export const pathMatches = (path, writablePath) => {
  const normalized = writablePath.replace(/^\.\//u, '');
  if (normalized.endsWith('/**')) {
    const prefix = normalized.slice(0, -3).replace(/\/$/u, '');
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === normalized;
};

export const pathsOverlap = (left, right) => {
  const normalizedLeft = normalizeOwnedPath(left);
  const normalizedRight = normalizeOwnedPath(right);
  return normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`);
};

export const validatePlan = (plan) => {
  const errors = [];
  if (plan.schemaVersion !== 1) errors.push('Plan schemaVersion must equal 1.');
  if (typeof plan.flightId !== 'string' || plan.flightId === '') errors.push('Plan flightId is required.');
  if (!Array.isArray(plan.missions) || plan.missions.length === 0) {
    errors.push('Plan missions must not be empty.');
    return errors;
  }
  const ids = new Set();
  const branches = new Set();
  const worktrees = new Set();
  for (const mission of plan.missions) {
    if (!mission.id) errors.push('Every mission requires an id.');
    if (ids.has(mission.id)) errors.push(`Duplicate mission id: ${mission.id}`);
    ids.add(mission.id);
    if (!mission.branch) errors.push(`${mission.id} requires a branch.`);
    if (branches.has(mission.branch)) errors.push(`Duplicate mission branch: ${mission.branch}`);
    branches.add(mission.branch);
    if (!isAbsolute(mission.worktree ?? '')) errors.push(`${mission.id} requires an absolute worktree.`);
    if (worktrees.has(mission.worktree)) errors.push(`Duplicate mission worktree: ${mission.worktree}`);
    worktrees.add(mission.worktree);
    if (!Array.isArray(mission.dependsOn)) errors.push(`${mission.id} dependsOn must be an array.`);
    if (!Array.isArray(mission.writablePaths) || mission.writablePaths.length === 0) {
      errors.push(`${mission.id} requires writablePaths.`);
    }
    for (const path of mission.writablePaths ?? []) {
      const normalized = normalize(path);
      if (isAbsolute(path) || normalized === '..' || normalized.startsWith(`..${sep}`)) {
        errors.push(`${mission.id} has unsafe writable path: ${path}`);
      }
    }
  }
  for (const mission of plan.missions) {
    for (const dependency of mission.dependsOn ?? []) {
      if (!ids.has(dependency)) errors.push(`${mission.id} has unknown dependency ${dependency}.`);
      if (dependency === mission.id) errors.push(`${mission.id} cannot depend on itself.`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(plan.missions.map((mission) => [mission.id, mission]));
  const visit = (id, chain = []) => {
    if (visiting.has(id)) {
      errors.push(`Dependency cycle: ${[...chain, id].join(' -> ')}`);
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn ?? []) visit(dependency, [...chain, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);

  const ownership = plan.missions.flatMap((mission) =>
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
  return errors;
};

export const assertPlan = (plan) => {
  const errors = validatePlan(plan);
  if (errors.length > 0) throw new Error(`Invalid flight plan:\n- ${errors.join('\n- ')}`);
  return plan;
};
