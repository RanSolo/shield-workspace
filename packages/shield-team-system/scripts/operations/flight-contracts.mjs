import { isAbsolute, normalize, parse as parsePath, sep } from "node:path";

export const FLIGHT_PLAN_TYPE = "feature-flight-resolved-plan";
export const FLIGHT_PLAN_SCHEMA_VERSION = 1;
export const FLIGHT_PLAN_NOTICE = "Planning output only. This artifact grants no mission authority or repository effect.";
export const FLIGHT_STATE_TYPE = "non-authoritative-flight-state";
export const FLIGHT_STATE_SCHEMA_VERSION = 2;
export const FLIGHT_STATE_NOTICE = "Observed coordination state only. Lifecycle status and authorityEvidence do not grant or prove SHIELD or human authority.";
export const FLIGHT_STATE_GENESIS_TOOL = "flight-state-init";
export const FLIGHT_STATE_SUCCESSOR_TOOL = "flight-state-successor-recorder";
export const FLIGHT_CONTRACT_VERSION = "1.0.0";

export const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
export const GIT_REVISION_PATTERN = /^[a-f0-9]{40}$/u;
export const MISSION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ASCII_IDENTITY_PATTERN = /^[\x20-\x7e]+$/u;
const BRANCH_CHARACTER_PATTERN = /^[A-Za-z0-9._/@+\-]+$/u;
const STATUS_VALUES = new Set([
  "planned", "authorized", "active", "blocked", "failed", "complete", "integrated", "cancelled", "superseded",
]);
export const AUTHORITY_DERIVED_STATUSES = new Set([
  "authorized", "active", "complete", "integrated", "cancelled", "superseded",
]);
export const OPERATOR_DISPOSITION_STATUSES = new Set(["blocked", "failed"]);
export const LIFECYCLE_TRANSITIONS = new Map([
  ["planned", new Set(["planned", "authorized", "cancelled", "superseded"])],
  ["authorized", new Set(["authorized", "active", "blocked", "failed", "cancelled", "superseded"])],
  ["active", new Set(["active", "blocked", "failed", "complete", "cancelled", "superseded"])],
  ["blocked", new Set(["blocked", "active", "failed", "cancelled", "superseded"])],
  ["failed", new Set(["failed", "blocked", "cancelled", "superseded"])],
  ["complete", new Set(["complete", "integrated", "cancelled", "superseded"])],
  ["integrated", new Set(["integrated"])],
  ["cancelled", new Set(["cancelled"])],
  ["superseded", new Set(["superseded"])],
]);

const asciiCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
export const asciiFold = (value) => value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
const isHumanString = (value) => isNonEmptyString(value) && !value.includes("\uFEFF");
const isAsciiIdentity = (value) => isNonEmptyString(value) && ASCII_IDENTITY_PATTERN.test(value);
const isSafePositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const isSafeNonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;

const ownStructure = (value, required, optional, label, errors) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  let prototype;
  let names;
  let symbols;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    names = Object.getOwnPropertyNames(value);
    symbols = Object.getOwnPropertySymbols(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    errors.push(`${label} structure cannot be inspected.`);
    return false;
  }
  let structural = false;
  if (prototype !== Object.prototype) {
    errors.push(`${label} must have the ordinary object prototype and no inherited data.`);
    structural = true;
  }
  if (symbols.length > 0) {
    errors.push(`${label} must not contain symbolic fields.`);
    structural = true;
  }
  for (const name of [...names].sort(asciiCompare)) {
    const descriptor = descriptors[name];
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
      errors.push(`${label}.${name} must be a data field, not an accessor.`);
      structural = true;
    } else if (descriptor?.enumerable !== true) {
      errors.push(`${label}.${name} must be an enumerable data field.`);
      structural = true;
    }
  }
  for (const field of required) {
    if (!Object.hasOwn(value, field)) errors.push(`${label}.${field} is required.`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const field of names.filter((name) => !allowed.has(name)).sort(asciiCompare)) {
    errors.push(`${label} contains unknown field ${field}.`);
  }
  return !structural && required.every((field) => Object.hasOwn(value, field)) &&
    names.every((field) => allowed.has(field));
};

const denseArray = (value, label, errors, { allowEmpty = false } = {}) => {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be ${allowEmpty ? "an array" : "a non-empty array"}.`);
    return false;
  }
  let valid = true;
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    errors.push(`${label} must have the ordinary array prototype.`);
    valid = false;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    errors.push(`${label} must not contain symbolic fields.`);
    valid = false;
  }
  const names = Object.getOwnPropertyNames(value);
  const allowed = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  for (const name of names.filter((entry) => !allowed.has(entry)).sort(asciiCompare)) {
    errors.push(`${label} contains unknown field ${name}.`);
    valid = false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      errors.push(`${label} must be dense; index ${index} is missing.`);
      valid = false;
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
      errors.push(`${label}[${index}] must be a data element, not an accessor.`);
      valid = false;
    }
  }
  if (!allowEmpty && value.length === 0) {
    errors.push(`${label} must be a non-empty array.`);
    valid = false;
  }
  return valid;
};

const validateStringArray = (value, label, errors, options = {}) => {
  if (!denseArray(value, label, errors, options)) return false;
  let valid = true;
  for (const [index, entry] of value.entries()) {
    if (!isHumanString(entry)) {
      errors.push(`${label}[${index}] must be a non-empty non-BOM string.`);
      valid = false;
    }
  }
  return valid;
};

const duplicateFolded = (values, label, errors) => {
  const seen = new Map();
  for (const [index, value] of values.entries()) {
    if (!isAsciiIdentity(value)) continue;
    const key = asciiFold(value);
    if (seen.has(key)) errors.push(`${label}[${index}] duplicates ${label}[${seen.get(key)}] under ASCII identity comparison.`);
    else seen.set(key, index);
  }
};

export const deriveMissionSlug = (missionId) => typeof missionId === "string"
  ? missionId.replace(/[^A-Za-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").toLowerCase()
  : "";

export const validateBranchRef = (value) => isAsciiIdentity(value) &&
  BRANCH_CHARACTER_PATTERN.test(value) &&
  !value.startsWith("/") && !value.endsWith("/") &&
  !value.startsWith(".") && !value.endsWith(".") &&
  !value.includes("//") && !value.includes("..") && !value.includes("@{") &&
  !value.endsWith(".lock");

const canonicalWorktree = (value) => {
  if (!isAsciiIdentity(value) || !isAbsolute(value) || normalize(value) !== value) return false;
  const root = parsePath(value).root;
  return value === root || !value.endsWith(sep);
};

const writablePathCore = (value) => value.endsWith("/**") ? value.slice(0, -3) : value;
export const validateWritablePath = (value) => {
  if (!isAsciiIdentity(value) || value.includes("\uFEFF") || value.includes("\\") || value.startsWith("/") || value.endsWith("/")) return false;
  const core = writablePathCore(value);
  if (core.length === 0 || core.includes("*") || core.includes("//")) return false;
  const components = core.split("/");
  return components.every((component) => component !== "" && component !== "." && component !== "..") &&
    !isAbsolute(value);
};

export const writablePathsOverlap = (left, right) => {
  const a = asciiFold(writablePathCore(left));
  const b = asciiFold(writablePathCore(right));
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
};

const validateArtifactIdentity = (value, label, errors) => {
  if (!ownStructure(value, ["path", "bytes", "sha256"], [], label, errors)) return false;
  if (!isNonEmptyString(value.path)) errors.push(`${label}.path must be a non-empty string.`);
  if (!isSafeNonNegativeInteger(value.bytes)) errors.push(`${label}.bytes must be a non-negative safe integer.`);
  if (!SHA256_PATTERN.test(value.sha256 ?? "")) errors.push(`${label}.sha256 must be a raw lowercase SHA-256 digest.`);
  return true;
};

export const artifactIdentity = (snapshot) => ({
  path: snapshot.path,
  bytes: snapshot.bytes.length,
  sha256: snapshot.sha256,
});

export const sameArtifactIdentity = (left, right) => left?.path === right?.path &&
  left?.bytes === right?.bytes && left?.sha256 === right?.sha256;

const deriveInitialEligibility = (mission) => {
  if (mission.dependsOn.length > 0) return "blocked-by-dependencies";
  if (mission.activationWave === 1) return "eligible-after-independent-authorization";
  return "staged-for-later-wave";
};

const deriveDependencyLevels = (missions) => {
  const byId = new Map(missions.map((mission) => [mission.id, mission]));
  const levels = new Map();
  const visiting = new Set();
  const visit = (id) => {
    if (levels.has(id)) return levels.get(id);
    if (visiting.has(id) || !byId.has(id)) return null;
    visiting.add(id);
    const dependencies = byId.get(id).dependsOn.map(visit);
    visiting.delete(id);
    if (dependencies.some((level) => level === null)) return null;
    const level = dependencies.length === 0 ? 0 : Math.max(...dependencies) + 1;
    levels.set(id, level);
    return level;
  };
  for (const mission of missions) visit(mission.id);
  return levels;
};

const validateMission = (mission, index, errors) => {
  const label = `plan.missions[${index}]`;
  const fields = [
    "id", "slug", "title", "library", "lane", "branch", "worktree", "activationWave", "dependsOn",
    "writablePaths", "scope", "deliverables", "dependencyLevel", "initialEligibility", "constructionStatus", "authorityStatus",
  ];
  if (!ownStructure(mission, fields, [], label, errors)) return false;
  for (const field of ["id", "lane", "branch", "worktree"]) {
    if (!isAsciiIdentity(mission[field])) errors.push(`${label}.${field} must be a non-empty printable ASCII string.`);
  }
  for (const field of ["title", "library", "scope"]) {
    if (!isHumanString(mission[field])) errors.push(`${label}.${field} must be a non-empty non-BOM string.`);
  }
  if (!isAsciiIdentity(mission.slug) || !MISSION_SLUG_PATTERN.test(mission.slug)) errors.push(`${label}.slug must be a lowercase ASCII slug.`);
  const expectedSlug = deriveMissionSlug(mission.id);
  if (mission.slug !== expectedSlug) errors.push(`${label}.slug must equal derived slug ${expectedSlug || "<empty>"}.`);
  if (!validateBranchRef(mission.branch)) errors.push(`${label}.branch is not a valid opaque flight branch.`);
  if (!canonicalWorktree(mission.worktree)) errors.push(`${label}.worktree must be an already-normalized absolute ASCII path.`);
  if (!isSafePositiveInteger(mission.activationWave)) errors.push(`${label}.activationWave must be a positive safe integer.`);
  if (validateStringArray(mission.dependsOn, `${label}.dependsOn`, errors, { allowEmpty: true })) {
    for (const [dependencyIndex, dependency] of mission.dependsOn.entries()) {
      if (!isAsciiIdentity(dependency)) errors.push(`${label}.dependsOn[${dependencyIndex}] must be printable ASCII.`);
    }
    duplicateFolded(mission.dependsOn, `${label}.dependsOn`, errors);
  }
  if (validateStringArray(mission.writablePaths, `${label}.writablePaths`, errors)) {
    for (const [pathIndex, path] of mission.writablePaths.entries()) {
      if (!validateWritablePath(path)) errors.push(`${label}.writablePaths[${pathIndex}] is not a normalized relative ownership path.`);
    }
    duplicateFolded(mission.writablePaths, `${label}.writablePaths`, errors);
  }
  validateStringArray(mission.deliverables, `${label}.deliverables`, errors);
  if (!isSafeNonNegativeInteger(mission.dependencyLevel)) errors.push(`${label}.dependencyLevel must be a non-negative safe integer.`);
  if (Array.isArray(mission.dependsOn) && Number.isSafeInteger(mission.activationWave) &&
      mission.initialEligibility !== deriveInitialEligibility(mission)) {
    errors.push(`${label}.initialEligibility does not match dependencies and activation wave.`);
  }
  if (mission.constructionStatus !== "planned-not-created") errors.push(`${label}.constructionStatus must equal planned-not-created.`);
  if (mission.authorityStatus !== "not-initialized") errors.push(`${label}.authorityStatus must equal not-initialized.`);
  return true;
};

export const validateResolvedPlan = (plan) => {
  const errors = [];
  const topFields = [
    "schemaVersion", "planType", "prototype", "flightId", "objective", "repository", "integration",
    "lanes", "missions", "evaluationContract",
  ];
  if (!ownStructure(plan, topFields, ["sourceIssue"], "plan", errors)) return errors;
  if (plan.schemaVersion !== FLIGHT_PLAN_SCHEMA_VERSION) errors.push("plan.schemaVersion must equal 1.");
  if (plan.planType !== FLIGHT_PLAN_TYPE) errors.push(`plan.planType must equal ${FLIGHT_PLAN_TYPE}.`);
  if (!isAsciiIdentity(plan.flightId)) errors.push("plan.flightId must be a non-empty printable ASCII string.");
  if (!isHumanString(plan.objective)) errors.push("plan.objective must be a non-empty non-BOM string.");
  if (Object.hasOwn(plan, "sourceIssue") && !isHumanString(plan.sourceIssue)) errors.push("plan.sourceIssue must be a non-empty non-BOM string when present.");

  if (ownStructure(plan.prototype, ["name", "version", "authority", "notice"], [], "plan.prototype", errors)) {
    if (plan.prototype.name !== "flight-prep" || plan.prototype.version !== FLIGHT_CONTRACT_VERSION || plan.prototype.authority !== "none") {
      errors.push("plan.prototype identity must equal flight-prep 1.0.0 with authority none.");
    }
    if (plan.prototype.notice !== FLIGHT_PLAN_NOTICE) errors.push("plan.prototype.notice must equal the fixed planning notice.");
  }

  if (ownStructure(plan.repository, [
    "root", "remoteUrl", "baseRef", "baseRevision", "inspectedHead", "inspectedBranch", "inspectedWorktreeClean", "collisions",
  ], [], "plan.repository", errors)) {
    if (!isAsciiIdentity(plan.repository.root) || !isAbsolute(plan.repository.root)) errors.push("plan.repository.root must be an absolute printable ASCII path.");
    if (plan.repository.remoteUrl !== null && !isAsciiIdentity(plan.repository.remoteUrl)) errors.push("plan.repository.remoteUrl must be null or non-empty printable ASCII.");
    if (!validateBranchRef(plan.repository.baseRef)) errors.push("plan.repository.baseRef is not a valid opaque flight ref.");
    if (!GIT_REVISION_PATTERN.test(plan.repository.baseRevision ?? "")) errors.push("plan.repository.baseRevision must be a lowercase 40-hex revision.");
    if (!GIT_REVISION_PATTERN.test(plan.repository.inspectedHead ?? "")) errors.push("plan.repository.inspectedHead must be a lowercase 40-hex revision.");
    if (plan.repository.inspectedHead !== plan.repository.baseRevision) errors.push("plan.repository.inspectedHead must equal plan.repository.baseRevision.");
    if (plan.repository.inspectedBranch !== null && !validateBranchRef(plan.repository.inspectedBranch)) errors.push("plan.repository.inspectedBranch must be null or a valid opaque flight ref.");
    if (typeof plan.repository.inspectedWorktreeClean !== "boolean") errors.push("plan.repository.inspectedWorktreeClean must be boolean.");
    if (denseArray(plan.repository.collisions, "plan.repository.collisions", errors, { allowEmpty: true }) && plan.repository.collisions.length !== 0) {
      errors.push("plan.repository.collisions must be empty.");
    }
  }

  if (ownStructure(plan.integration, ["branch", "status"], [], "plan.integration", errors)) {
    if (!validateBranchRef(plan.integration.branch)) errors.push("plan.integration.branch is not a valid opaque flight ref.");
    if (plan.integration.status !== "declared-not-created") errors.push("plan.integration.status must equal declared-not-created.");
  }

  const laneIds = [];
  if (denseArray(plan.lanes, "plan.lanes", errors)) {
    for (const [index, lane] of plan.lanes.entries()) {
      const label = `plan.lanes[${index}]`;
      if (!ownStructure(lane, ["id", "chatLabel", "teamLabel"], [], label, errors)) continue;
      if (!isAsciiIdentity(lane.id)) errors.push(`${label}.id must be a non-empty printable ASCII string.`);
      if (!isHumanString(lane.chatLabel)) errors.push(`${label}.chatLabel must be a non-empty non-BOM string.`);
      if (!isHumanString(lane.teamLabel)) errors.push(`${label}.teamLabel must be a non-empty non-BOM string.`);
      laneIds.push(lane.id);
    }
    duplicateFolded(laneIds, "plan lane identities", errors);
  }

  const validMissions = [];
  if (denseArray(plan.missions, "plan.missions", errors)) {
    for (const [index, mission] of plan.missions.entries()) if (validateMission(mission, index, errors)) validMissions.push(mission);
  }
  for (const field of ["id", "slug", "branch", "worktree"]) duplicateFolded(validMissions.map((mission) => mission[field]), `plan mission ${field} identities`, errors);
  const missionIds = new Map(validMissions.map((mission) => [mission.id, mission]));
  const foldedMissionIds = new Map(validMissions.map((mission) => [asciiFold(mission.id), mission.id]));
  const foldedLaneIds = new Map(laneIds.map((id) => [asciiFold(id), id]));
  for (const mission of validMissions) {
    if (!foldedLaneIds.has(asciiFold(mission.lane))) errors.push(`${mission.id} references unknown lane ${mission.lane}.`);
    else if (foldedLaneIds.get(asciiFold(mission.lane)) !== mission.lane) errors.push(`${mission.id} lane must use the canonical plan lane bytes.`);
    for (const dependency of mission.dependsOn) {
      if (!foldedMissionIds.has(asciiFold(dependency))) errors.push(`${mission.id} has unknown dependency ${dependency}.`);
      else if (foldedMissionIds.get(asciiFold(dependency)) !== dependency) errors.push(`${mission.id} dependency ${dependency} must use canonical mission ID bytes.`);
      if (dependency === mission.id) errors.push(`${mission.id} cannot depend on itself.`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (id, chain = []) => {
    if (visiting.has(id)) {
      errors.push(`Mission dependency cycle: ${[...chain, id].join(" -> ")}.`);
      return;
    }
    if (visited.has(id) || !missionIds.has(id)) return;
    visiting.add(id);
    for (const dependency of missionIds.get(id).dependsOn) visit(dependency, [...chain, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const mission of validMissions) visit(mission.id);
  const levels = deriveDependencyLevels(validMissions);
  for (const mission of validMissions) {
    const expected = levels.get(mission.id);
    if (expected !== undefined && mission.dependencyLevel !== expected) errors.push(`${mission.id} dependencyLevel must equal ${expected}.`);
  }

  const ownership = validMissions.flatMap((mission) => mission.writablePaths.map((path) => ({ missionId: mission.id, path })));
  for (let left = 0; left < ownership.length; left += 1) {
    for (let right = left + 1; right < ownership.length; right += 1) {
      const a = ownership[left];
      const b = ownership[right];
      if (a.missionId !== b.missionId && validateWritablePath(a.path) && validateWritablePath(b.path) && writablePathsOverlap(a.path, b.path)) {
        errors.push(`Writable path ownership overlaps: ${a.missionId} (${a.path}) and ${b.missionId} (${b.path}).`);
      }
    }
  }

  const branchRoles = [
    ["integration", plan.integration?.branch],
    ["inspected", plan.repository?.inspectedBranch],
    ...validMissions.map((mission) => [`mission ${mission.id}`, mission.branch]),
  ].filter(([, branch]) => branch !== null && branch !== undefined && validateBranchRef(branch));
  for (let left = 0; left < branchRoles.length; left += 1) {
    for (let right = left + 1; right < branchRoles.length; right += 1) {
      if (asciiFold(branchRoles[left][1]) === asciiFold(branchRoles[right][1])) {
        errors.push(`${branchRoles[left][0]} branch must be role-distinct from ${branchRoles[right][0]} branch.`);
      }
    }
  }

  if (ownStructure(plan.evaluationContract, ["fixtureId", "version", "scorecard"], [], "plan.evaluationContract", errors)) {
    if (!isHumanString(plan.evaluationContract.fixtureId)) errors.push("plan.evaluationContract.fixtureId must be a non-empty non-BOM string.");
    if (!isSafePositiveInteger(plan.evaluationContract.version)) errors.push("plan.evaluationContract.version must be a positive safe integer.");
    if (validateStringArray(plan.evaluationContract.scorecard, "plan.evaluationContract.scorecard", errors)) {
      const seen = new Set();
      for (const [index, item] of plan.evaluationContract.scorecard.entries()) {
        if (seen.has(item)) errors.push(`plan.evaluationContract.scorecard[${index}] is duplicated.`);
        seen.add(item);
      }
    }
  }
  return errors;
};

export const assertResolvedPlan = (plan) => {
  const errors = validateResolvedPlan(plan);
  if (errors.length > 0) throw new Error(`Invalid resolved flight plan:\n- ${errors.join("\n- ")}`);
  return plan;
};

export const currentWaveFor = (plan, state) => {
  const candidates = plan.missions.filter((mission) => state.missions[mission.id].status !== "integrated" &&
    mission.dependsOn.every((dependency) => state.missions[dependency].status === "integrated"));
  return candidates.length === 0 ? null : Math.min(...candidates.map((mission) => mission.activationWave));
};

export const validateFlightState = (plan, planIdentity, state, label = "state") => {
  const errors = [];
  const fields = [
    "schemaVersion", "stateType", "authority", "notice", "flightId", "plan", "sequence", "predecessorSha256",
    "repository", "wave", "lanes", "missions", "observedAt", "tool",
  ];
  if (!ownStructure(state, fields, [], label, errors)) return errors;
  if (state.schemaVersion !== FLIGHT_STATE_SCHEMA_VERSION) errors.push(`${label}.schemaVersion must equal 2.`);
  if (state.stateType !== FLIGHT_STATE_TYPE) errors.push(`${label}.stateType must equal ${FLIGHT_STATE_TYPE}.`);
  if (state.authority !== "none") errors.push(`${label}.authority must equal none.`);
  if (state.notice !== FLIGHT_STATE_NOTICE) errors.push(`${label}.notice must equal the fixed state notice.`);
  if (state.flightId !== plan.flightId) errors.push(`${label}.flightId must equal the resolved plan flightId.`);
  if (validateArtifactIdentity(state.plan, `${label}.plan`, errors) && !sameArtifactIdentity(state.plan, planIdentity)) {
    errors.push(`${label}.plan must equal the exact supplied plan artifact identity.`);
  }
  if (!isSafeNonNegativeInteger(state.sequence)) errors.push(`${label}.sequence must be a non-negative safe integer.`);
  if (state.sequence === 0 && state.predecessorSha256 !== null) errors.push(`${label}.predecessorSha256 must be null at sequence 0.`);
  if (state.sequence > 0 && !SHA256_PATTERN.test(state.predecessorSha256 ?? "")) errors.push(`${label}.predecessorSha256 must be a raw lowercase SHA-256 after genesis.`);

  if (ownStructure(state.repository, ["root", "baseRef", "baseRevision", "integrationBranch"], [], `${label}.repository`, errors)) {
    const expected = {
      root: plan.repository.root,
      baseRef: plan.repository.baseRef,
      baseRevision: plan.repository.baseRevision,
      integrationBranch: plan.integration.branch,
    };
    for (const field of Object.keys(expected)) if (state.repository[field] !== expected[field]) errors.push(`${label}.repository.${field} must equal the resolved plan declaration.`);
  }
  if (ownStructure(state.wave, ["current"], [], `${label}.wave`, errors) &&
      state.wave.current !== null && !isSafePositiveInteger(state.wave.current)) errors.push(`${label}.wave.current must be null or a positive safe integer.`);

  const laneRecordsValid = ownStructure(state.lanes, plan.lanes.map((lane) => lane.id), [], `${label}.lanes`, errors);
  if (laneRecordsValid) {
    for (const lane of plan.lanes) {
      const laneLabel = `${label}.lanes.${lane.id}`;
      if (!ownStructure(state.lanes[lane.id], ["activeMissionId"], [], laneLabel, errors)) continue;
      const occupant = state.lanes[lane.id].activeMissionId;
      if (occupant !== null && !isAsciiIdentity(occupant)) errors.push(`${laneLabel}.activeMissionId must be null or a printable ASCII mission ID.`);
    }
  }

  const missionRecordsValid = ownStructure(state.missions, plan.missions.map((mission) => mission.id), [], `${label}.missions`, errors);
  if (missionRecordsValid) {
    for (const mission of plan.missions) {
      const record = state.missions[mission.id];
      const missionLabel = `${label}.missions.${mission.id}`;
      if (!ownStructure(record, ["lane", "activationWave", "status", "revision", "authorityEvidence"], [], missionLabel, errors)) continue;
      if (record.lane !== mission.lane) errors.push(`${missionLabel}.lane must equal the resolved plan lane.`);
      if (record.activationWave !== mission.activationWave) errors.push(`${missionLabel}.activationWave must equal the resolved plan wave.`);
      if (!STATUS_VALUES.has(record.status)) errors.push(`${missionLabel}.status is unsupported.`);
      if (record.status === "planned" && record.revision !== null) errors.push(`${missionLabel}.planned status requires a null revision.`);
      else if (OPERATOR_DISPOSITION_STATUSES.has(record.status) && record.revision !== null && !GIT_REVISION_PATTERN.test(record.revision ?? "")) {
        errors.push(`${missionLabel}.${record.status} revision must be null or lowercase 40-hex.`);
      } else if (STATUS_VALUES.has(record.status) && record.status !== "planned" && !OPERATOR_DISPOSITION_STATUSES.has(record.status) &&
                 !GIT_REVISION_PATTERN.test(record.revision ?? "")) {
        errors.push(`${missionLabel}.${record.status} status requires a lowercase 40-hex revision.`);
      }
      if (record.authorityEvidence !== null) errors.push(`${missionLabel}.authorityEvidence must be null.`);
    }
  }

  if (!isNonEmptyString(state.observedAt) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(state.observedAt) ||
      Number.isNaN(Date.parse(state.observedAt)) || new Date(state.observedAt).toISOString() !== state.observedAt) {
    errors.push(`${label}.observedAt must be canonical UTC RFC 3339 with milliseconds.`);
  }
  if (ownStructure(state.tool, ["name", "version"], [], `${label}.tool`, errors)) {
    const expectedName = state.sequence === 0 ? FLIGHT_STATE_GENESIS_TOOL : FLIGHT_STATE_SUCCESSOR_TOOL;
    if (state.tool.name !== expectedName || state.tool.version !== FLIGHT_CONTRACT_VERSION) errors.push(`${label}.tool must identify ${expectedName} 1.0.0.`);
  }

  if (errors.length === 0) {
    const activeByLane = new Map(plan.lanes.map((lane) => [lane.id, []]));
    for (const mission of plan.missions) {
      if (state.missions[mission.id].status === "active") activeByLane.get(mission.lane).push(mission.id);
    }
    for (const lane of plan.lanes) {
      const active = activeByLane.get(lane.id);
      const expected = active.length === 1 ? active[0] : null;
      if (active.length > 1) errors.push(`${label}.lanes.${lane.id} has multiple active missions.`);
      if (state.lanes[lane.id].activeMissionId !== expected) errors.push(`${label}.lanes.${lane.id}.activeMissionId must equal ${expected ?? "null"}.`);
    }
    const expectedWave = currentWaveFor(plan, state);
    if (state.wave.current !== expectedWave) errors.push(`${label}.wave.current must equal recomputed wave ${expectedWave ?? "null"}.`);
  }
  return errors;
};

export const assertFlightState = (plan, planIdentity, state, label = "state") => {
  const errors = validateFlightState(plan, planIdentity, state, label);
  if (errors.length > 0) throw new Error(`Invalid ${label} flight state:\n- ${errors.join("\n- ")}`);
  return state;
};

export const validateImmediateTransition = (plan, predecessor, state) => {
  const errors = [];
  if (predecessor.wave.current === null && state.wave.current !== null) errors.push("Flight wave cannot change from null back to a number.");
  else if (predecessor.wave.current !== null && state.wave.current !== null && state.wave.current < predecessor.wave.current) {
    errors.push(`Flight wave regressed from ${predecessor.wave.current} to ${state.wave.current}.`);
  }
  for (const mission of plan.missions) {
    const prior = predecessor.missions[mission.id];
    const current = state.missions[mission.id];
    if (!LIFECYCLE_TRANSITIONS.get(prior.status)?.has(current.status)) errors.push(`${mission.id} transition ${prior.status} -> ${current.status} is not allowed.`);
    if (current.lane !== prior.lane || current.activationWave !== prior.activationWave) errors.push(`${mission.id} lane or activation wave changed.`);
    if (prior.revision !== null && current.revision !== prior.revision) {
      errors.push(current.revision === null ? `${mission.id} revision cannot be cleared.` : `${mission.id} revision cannot be substituted.`);
    }
  }
  return errors;
};
