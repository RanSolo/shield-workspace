import { MISSION_SCHEMA_VERSION, validateMissionRecord } from "./mission-record.mjs";

export const MODE_MANIFEST_SCHEMA_VERSION = 1;
export const MAX_MODE_CONTEXT_REFS = 32;

const MANIFEST_FIELDS = new Set([
  "schemaVersion", "modeId", "modeVersion", "description", "compatibility", "contextRefs",
]);
const COMPATIBILITY_FIELDS = new Set(["seats", "missionSchemaVersions"]);
const REGISTRY_FIELDS = new Set(["schemaVersion", "manifests"]);

const valid = (value) => ({ state: "valid", value });
const invalid = (...errors) => ({ state: "invalid", errors: errors.flat() });

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function fieldErrors(value, fields, label) {
  if (!isPlainObject(value)) return [`${label} must be a plain object.`];
  const errors = [];
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  }
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) errors.push(`${label} has unknown field: ${field}.`);
  }
  return errors;
}

function stringArrayErrors(values, label, { nonEmpty = true } = {}) {
  if (!Array.isArray(values)) return [`${label} must be an array.`];
  const errors = [];
  if (nonEmpty && values.length === 0) errors.push(`${label} must not be empty.`);
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`${label}[${index}] must be a non-empty string.`);
    } else if (seen.has(value)) {
      errors.push(`${label} duplicates value: ${value}.`);
    }
    seen.add(value);
  }
  return errors;
}

function versionArrayErrors(values, label) {
  if (!Array.isArray(values)) return [`${label} must be an array.`];
  const errors = [];
  if (values.length === 0) errors.push(`${label} must not be empty.`);
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isInteger(value) || value <= 0) {
      errors.push(`${label}[${index}] must be a positive integer.`);
    } else if (seen.has(value)) {
      errors.push(`${label} duplicates version: ${value}.`);
    }
    seen.add(value);
  }
  return errors;
}

export function validateModeManifest(manifest) {
  const errors = fieldErrors(manifest, MANIFEST_FIELDS, "Mode manifest");
  if (errors.length > 0) return invalid(errors);
  if (manifest.schemaVersion !== MODE_MANIFEST_SCHEMA_VERSION) {
    errors.push("Mode manifest schemaVersion is unsupported.");
  }
  for (const field of ["modeId", "modeVersion", "description"]) {
    if (typeof manifest[field] !== "string" || manifest[field].trim().length === 0) {
      errors.push(`Mode manifest ${field} must be a non-empty string.`);
    }
  }

  const compatibilityErrors = fieldErrors(
    manifest.compatibility,
    COMPATIBILITY_FIELDS,
    "Mode manifest compatibility",
  );
  errors.push(...compatibilityErrors);
  if (compatibilityErrors.length === 0) {
    errors.push(...stringArrayErrors(manifest.compatibility.seats, "compatibility.seats"));
    errors.push(...versionArrayErrors(
      manifest.compatibility.missionSchemaVersions,
      "compatibility.missionSchemaVersions",
    ));
  }
  errors.push(...stringArrayErrors(manifest.contextRefs, "contextRefs", { nonEmpty: false }));
  if (Array.isArray(manifest.contextRefs) && manifest.contextRefs.length > MAX_MODE_CONTEXT_REFS) {
    errors.push(`contextRefs exceeds the ${MAX_MODE_CONTEXT_REFS}-reference limit.`);
  }
  return errors.length > 0 ? invalid(errors) : valid(manifest);
}

function registryKey(modeId, modeVersion) {
  return `${modeId}\u0000${modeVersion}`;
}

export function createModeRegistry(manifests) {
  if (!Array.isArray(manifests)) return invalid("Mode manifests must be an array.");
  const errors = [];
  const seen = new Set();
  for (let index = 0; index < manifests.length; index += 1) {
    const checked = validateModeManifest(manifests[index]);
    if (checked.state === "invalid") {
      errors.push(...checked.errors.map((error) => `manifests[${index}]: ${error}`));
      continue;
    }
    const key = registryKey(manifests[index].modeId, manifests[index].modeVersion);
    if (seen.has(key)) {
      errors.push(
        `manifests[${index}] duplicates exact mode reference: ` +
        `${manifests[index].modeId}@${manifests[index].modeVersion}.`,
      );
    }
    seen.add(key);
  }
  if (errors.length > 0) return invalid(errors);

  const normalized = manifests.map((manifest) => ({
    ...manifest,
    compatibility: {
      seats: [...manifest.compatibility.seats],
      missionSchemaVersions: [...manifest.compatibility.missionSchemaVersions],
    },
    contextRefs: [...manifest.contextRefs],
  })).sort((left, right) =>
    left.modeId.localeCompare(right.modeId) || left.modeVersion.localeCompare(right.modeVersion));
  return valid({ schemaVersion: MODE_MANIFEST_SCHEMA_VERSION, manifests: normalized });
}

function validateRegistry(registry) {
  const errors = fieldErrors(registry, REGISTRY_FIELDS, "Mode registry");
  if (errors.length > 0) return invalid(errors);
  if (registry.schemaVersion !== MODE_MANIFEST_SCHEMA_VERSION) {
    errors.push("Mode registry schemaVersion is unsupported.");
  }
  const recreated = createModeRegistry(registry.manifests);
  if (recreated.state === "invalid") errors.push(...recreated.errors);
  return errors.length > 0 ? invalid(errors) : recreated;
}

export function resolveSeatModeContexts(missionRecord, registry) {
  const mission = validateMissionRecord(missionRecord);
  if (mission.state === "invalid") return mission;
  const checkedRegistry = validateRegistry(registry);
  if (checkedRegistry.state === "invalid") return checkedRegistry;

  const byReference = new Map(checkedRegistry.value.manifests.map((manifest) => [
    registryKey(manifest.modeId, manifest.modeVersion),
    manifest,
  ]));
  const activationsBySeat = new Map(missionRecord.participants.map(({ seatId }) => [seatId, []]));
  const errors = [];
  for (const activation of missionRecord.activatedModes) {
    const manifest = byReference.get(registryKey(activation.modeId, activation.modeVersion));
    if (!manifest) {
      errors.push(`Unknown exact mode reference: ${activation.modeId}@${activation.modeVersion}.`);
      continue;
    }
    if (!manifest.compatibility.seats.includes(activation.seatId)) {
      errors.push(
        `${activation.modeId}@${activation.modeVersion} is incompatible with seat ` +
        `${activation.seatId}.`,
      );
    }
    if (!manifest.compatibility.missionSchemaVersions.includes(MISSION_SCHEMA_VERSION)) {
      errors.push(
        `${activation.modeId}@${activation.modeVersion} is incompatible with mission schema ` +
        `${MISSION_SCHEMA_VERSION}.`,
      );
    }
    activationsBySeat.get(activation.seatId)?.push({
      modeId: activation.modeId,
      modeVersion: activation.modeVersion,
      activationSource: activation.activationSource,
      description: manifest.description,
      contextRefs: [...manifest.contextRefs],
    });
  }
  if (errors.length > 0) return invalid(errors);

  return valid({
    seats: missionRecord.participants.map(({ seatId }) => ({
      seatId,
      modes: activationsBySeat.get(seatId),
    })),
  });
}
