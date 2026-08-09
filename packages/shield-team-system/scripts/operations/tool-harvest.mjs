#!/usr/bin/env node

import { lstat } from "node:fs/promises";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertNoSymlinkComponents,
  canonicalExistingPath,
  exactKeys,
  git,
  isPathContained,
  nonEmptyString,
  readJsonSnapshot,
  snapshotFile,
  stableJson,
  writeNewFile,
} from "./common.mjs";

const TOOL_VERSION = "0.1.0-local-prototype";
const REGISTRY_FIELDS = ["schemaVersion", "artifactRoot", "tools"];
const TOOL_FIELDS = [
  "name",
  "path",
  "trigger",
  "purpose",
  "inputs",
  "outputs",
  "minutesInvested",
  "minutesAvoidedPerUse",
  "reuseCount",
  "errorsPrevented",
  "evidenceImproved",
  "recommendation",
];
const RECOMMENDATIONS = new Set([
  "discard",
  "retain-local",
  "promotion-candidate",
]);
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[/\\]/u;
const NON_PORTABLE_PATH_CHARACTER = /[\\\u0000-\u001f\u007f]/u;

const validateStringArray = (value, label, errors) => {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return;
  }
  if (value.some((entry) => !nonEmptyString(entry))) {
    errors.push(`${label} must contain only non-empty strings.`);
  }
};

const validateMeasurement = (value, label, errors, { integer = false } = {}) => {
  if (value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(`${label} must be a finite non-negative number or null when unknown.`);
    return;
  }
  if (integer && !Number.isSafeInteger(value)) {
    errors.push(`${label} must be a safe non-negative integer or null when unknown.`);
  }
};

const isPortableLocator = (value, { allowTraversal }) => {
  if (!nonEmptyString(value) || posix.isAbsolute(value) || WINDOWS_ABSOLUTE_PATH.test(value) ||
      NON_PORTABLE_PATH_CHARACTER.test(value) || posix.normalize(value) !== value) {
    return false;
  }
  const components = value.split("/");
  return allowTraversal || !components.includes("..");
};

const finiteArithmetic = (value, label, errors) => {
  if (!Number.isFinite(value)) {
    errors.push(`${label} exceeds the finite numeric range.`);
    return null;
  }
  return value;
};

const addFinite = (left, right, label, errors, { integer = false } = {}) => {
  const value = finiteArithmetic(left + right, label, errors);
  if (value !== null && integer && !Number.isSafeInteger(value)) {
    errors.push(`${label} exceeds the safe integer range.`);
    return null;
  }
  return value;
};

const registryErrors = (registry) => {
  const errors = [];
  if (!exactKeys(registry, REGISTRY_FIELDS, "registry", errors)) return errors;
  if (registry.schemaVersion !== 1) errors.push("registry.schemaVersion must equal 1.");
  if (!isPortableLocator(registry.artifactRoot, { allowTraversal: true })) {
    errors.push("registry.artifactRoot must be a normalized portable registry-relative POSIX locator.");
  }
  if (!Array.isArray(registry.tools) || registry.tools.length === 0) {
    errors.push("registry.tools must be a non-empty array.");
    return errors;
  }

  const names = new Set();
  const paths = new Set();
  for (const [index, entry] of registry.tools.entries()) {
    const label = `registry.tools[${index}]`;
    if (!exactKeys(entry, TOOL_FIELDS, label, errors)) continue;
    if (!nonEmptyString(entry.name)) {
      errors.push(`${label}.name must be a non-empty string.`);
    } else if (names.has(entry.name)) {
      errors.push(`${label}.name duplicates ${entry.name}.`);
    } else {
      names.add(entry.name);
    }
    if (!isPortableLocator(entry.path, { allowTraversal: false }) || entry.path === ".") {
      errors.push(`${label}.path must be a normalized repository-relative POSIX file path without traversal.`);
    } else if (paths.has(entry.path)) {
      errors.push(`${label}.path duplicates ${entry.path}.`);
    } else {
      paths.add(entry.path);
    }
    for (const field of ["trigger", "purpose"]) {
      if (!nonEmptyString(entry[field])) errors.push(`${label}.${field} must be a non-empty string.`);
    }
    for (const field of ["inputs", "outputs", "errorsPrevented", "evidenceImproved"]) {
      validateStringArray(entry[field], `${label}.${field}`, errors);
    }
    validateMeasurement(entry.minutesInvested, `${label}.minutesInvested`, errors);
    validateMeasurement(entry.minutesAvoidedPerUse, `${label}.minutesAvoidedPerUse`, errors);
    validateMeasurement(entry.reuseCount, `${label}.reuseCount`, errors, { integer: true });
    if (!RECOMMENDATIONS.has(entry.recommendation)) {
      errors.push(`${label}.recommendation is invalid.`);
    }
  }
  return errors;
};

const resolveArtifactRoot = async (registryDirectory, locator) => {
  try {
    const candidate = resolve(registryDirectory, ...locator.split("/"));
    await assertNoSymlinkComponents(candidate);
    const canonicalRoot = await canonicalExistingPath(candidate);
    const discoveredRoot = await canonicalExistingPath(
      git(canonicalRoot, ["rev-parse", "--path-format=absolute", "--show-toplevel"]),
    );
    if (canonicalRoot !== discoveredRoot) throw new Error("not the Git root");
    return canonicalRoot;
  } catch {
    throw new Error("Invalid tool registry:\n- registry.artifactRoot must resolve without symlinks to the canonical Git root.");
  }
};

const derivedToolValues = (entry, index, errors) => {
  const label = `registry.tools[${index}]`;
  let observedMinutesAvoided = null;
  if (entry.minutesAvoidedPerUse !== null && entry.reuseCount !== null) {
    observedMinutesAvoided = finiteArithmetic(
      entry.minutesAvoidedPerUse * entry.reuseCount,
      `${label}.observedMinutesAvoided`,
      errors,
    );
  }
  let netObservedMinutes = null;
  if (observedMinutesAvoided !== null && entry.minutesInvested !== null) {
    netObservedMinutes = finiteArithmetic(
      observedMinutesAvoided - entry.minutesInvested,
      `${label}.netObservedMinutes`,
      errors,
    );
  }
  return { observedMinutesAvoided, netObservedMinutes };
};

const summarize = (tools, errors) => {
  const summary = {
    knownMinutesInvested: 0,
    knownObservedMinutesAvoided: 0,
    knownReuseCount: 0,
    knownNetObservedMinutes: 0,
    unknownInvestmentCount: 0,
    unknownAvoidanceCount: 0,
    unknownReuseCount: 0,
    unknownNetObservedMinutesCount: 0,
  };
  for (const tool of tools) {
    if (tool.minutesInvested === null) summary.unknownInvestmentCount += 1;
    else summary.knownMinutesInvested = addFinite(
      summary.knownMinutesInvested,
      tool.minutesInvested,
      "totals.knownMinutesInvested",
      errors,
    );

    if (tool.observedMinutesAvoided === null) summary.unknownAvoidanceCount += 1;
    else summary.knownObservedMinutesAvoided = addFinite(
      summary.knownObservedMinutesAvoided,
      tool.observedMinutesAvoided,
      "totals.knownObservedMinutesAvoided",
      errors,
    );

    if (tool.reuseCount === null) summary.unknownReuseCount += 1;
    else summary.knownReuseCount = addFinite(
      summary.knownReuseCount,
      tool.reuseCount,
      "totals.knownReuseCount",
      errors,
      { integer: true },
    );

    if (tool.netObservedMinutes === null) summary.unknownNetObservedMinutesCount += 1;
    else summary.knownNetObservedMinutes = addFinite(
      summary.knownNetObservedMinutes,
      tool.netObservedMinutes,
      "totals.knownNetObservedMinutes",
      errors,
    );
  }
  return {
    minutesInvested: summary.unknownInvestmentCount === 0 ? summary.knownMinutesInvested : null,
    knownMinutesInvested: summary.knownMinutesInvested,
    unknownInvestmentCount: summary.unknownInvestmentCount,
    observedMinutesAvoided: summary.unknownAvoidanceCount === 0
      ? summary.knownObservedMinutesAvoided
      : null,
    knownObservedMinutesAvoided: summary.knownObservedMinutesAvoided,
    unknownAvoidanceCount: summary.unknownAvoidanceCount,
    reuseCount: summary.unknownReuseCount === 0 ? summary.knownReuseCount : null,
    knownReuseCount: summary.knownReuseCount,
    unknownReuseCount: summary.unknownReuseCount,
    netObservedMinutes: summary.unknownNetObservedMinutesCount === 0
      ? summary.knownNetObservedMinutes
      : null,
    knownNetObservedMinutes: summary.knownNetObservedMinutes,
    unknownNetObservedMinutesCount: summary.unknownNetObservedMinutesCount,
  };
};

export const harvestTools = async ({ registryPath }) => {
  const absoluteRegistryPath = resolve(registryPath);
  const registrySnapshot = await readJsonSnapshot(absoluteRegistryPath);
  const registry = registrySnapshot.value;
  const errors = registryErrors(registry);
  if (errors.length > 0) throw new Error(`Invalid tool registry:\n- ${errors.join("\n- ")}`);

  const artifactRoot = await resolveArtifactRoot(dirname(absoluteRegistryPath), registry.artifactRoot);
  const derived = registry.tools.map((entry, index) => derivedToolValues(entry, index, errors));
  if (errors.length > 0) throw new Error(`Invalid tool registry:\n- ${errors.join("\n- ")}`);

  const artifactCandidates = [];
  const canonicalArtifactPaths = new Set();
  for (const [index, entry] of registry.tools.entries()) {
    const candidate = resolve(artifactRoot, ...entry.path.split("/"));
    const label = `registry.tools[${index}].path`;
    try {
      if (!isPathContained(artifactRoot, candidate)) throw new Error("escape");
      await assertNoSymlinkComponents(candidate);
      const canonicalCandidate = await canonicalExistingPath(candidate);
      if (!isPathContained(artifactRoot, canonicalCandidate)) {
        errors.push(`${label} canonical path must remain within artifactRoot.`);
      }
      if (canonicalArtifactPaths.has(canonicalCandidate)) {
        errors.push(`${label} collides with another canonical artifact path.`);
      } else {
        canonicalArtifactPaths.add(canonicalCandidate);
      }
      if (canonicalCandidate !== candidate) {
        errors.push(`${label} must exactly match its canonical artifact path.`);
      }
      const info = await lstat(candidate);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("not a regular file");
      artifactCandidates[index] = candidate;
    } catch {
      errors.push(`${label} must identify a non-symlink regular file within artifactRoot.`);
    }
  }
  if (errors.length > 0) throw new Error(`Invalid tool registry:\n- ${errors.join("\n- ")}`);

  const snapshots = [];
  for (const candidate of artifactCandidates) snapshots.push(await snapshotFile(candidate));

  const tools = registry.tools.map((entry, index) => ({
    name: entry.name,
    path: entry.path,
    trigger: entry.trigger,
    purpose: entry.purpose,
    inputs: [...entry.inputs],
    outputs: [...entry.outputs],
    minutesInvested: entry.minutesInvested,
    minutesAvoidedPerUse: entry.minutesAvoidedPerUse,
    reuseCount: entry.reuseCount,
    errorsPrevented: [...entry.errorsPrevented],
    evidenceImproved: [...entry.evidenceImproved],
    recommendation: entry.recommendation,
    artifact: {
      path: entry.path,
      bytes: snapshots[index].size,
      sha256: snapshots[index].sha256,
    },
    observedMinutesAvoided: derived[index].observedMinutesAvoided,
    netObservedMinutes: derived[index].netObservedMinutes,
  }));
  const totals = summarize(tools, errors);
  if (errors.length > 0) throw new Error(`Invalid tool registry:\n- ${errors.join("\n- ")}`);

  return {
    schemaVersion: 1,
    reportType: "self-tooling-harvest",
    authority: "none",
    notice:
      "Evidence and recommendations only. Promotion requires separate scope, review, and authority.",
    tool: { name: "tool-harvest", version: TOOL_VERSION },
    registry: {
      artifactRoot: registry.artifactRoot,
      bytes: registrySnapshot.size,
      sha256: registrySnapshot.sha256,
    },
    totals,
    tools,
  };
};

const usage = "Usage: tool-harvest.mjs --registry FILE [--output NEW_FILE]";

const parseArguments = (argv) => {
  const values = new Map();
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag !== "--registry" && flag !== "--output") throw new Error(`Unknown option: ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    const value = argv.shift();
    if (!nonEmptyString(value) || value.startsWith("--")) throw new Error(`Option ${flag} requires a value.`);
    values.set(flag, value);
  }
  if (!values.has("--registry")) throw new Error(usage);
  return { registryPath: values.get("--registry"), output: values.get("--output") };
};

const main = async () => {
  const { registryPath, output } = parseArguments(process.argv.slice(2));
  const report = await harvestTools({ registryPath });
  const json = stableJson(report);
  if (output) await writeNewFile(output, json);
  process.stdout.write(json);
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
