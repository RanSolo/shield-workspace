#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hashFile, readJson, stableJson, writeNewFile } from "./common.mjs";

const TOOL_VERSION = "0.1.0-local-prototype";
const RECOMMENDATIONS = new Set([
  "discard",
  "retain-local",
  "promotion-candidate",
]);

export const harvestTools = async ({ registryPath }) => {
  const absoluteRegistryPath = resolve(registryPath);
  const registryRoot = dirname(absoluteRegistryPath);
  const registry = await readJson(absoluteRegistryPath);
  const errors = [];
  if (registry.schemaVersion !== 1)
    errors.push("Registry schemaVersion must equal 1.");
  if (!Array.isArray(registry.tools) || registry.tools.length === 0)
    errors.push("Registry tools must not be empty.");
  const names = new Set();
  const tools = [];
  for (const [index, entry] of (registry.tools ?? []).entries()) {
    const prefix = `tools[${index}]`;
    if (!entry.name || names.has(entry.name))
      errors.push(`${prefix} name is missing or duplicated.`);
    names.add(entry.name);
    for (const field of ["trigger", "purpose"])
      if (!entry[field]) errors.push(`${entry.name}.${field} is required.`);
    for (const field of [
      "inputs",
      "outputs",
      "errorsPrevented",
      "evidenceImproved",
    ]) {
      if (!Array.isArray(entry[field]))
        errors.push(`${entry.name}.${field} must be an array.`);
    }
    for (const field of [
      "minutesInvested",
      "minutesAvoidedPerUse",
      "reuseCount",
    ]) {
      if (
        entry[field] !== null &&
        (!Number.isFinite(entry[field]) || entry[field] < 0)
      ) {
        errors.push(
          `${entry.name}.${field} must be non-negative or null when unknown.`,
        );
      }
    }
    if (!RECOMMENDATIONS.has(entry.recommendation))
      errors.push(`${entry.name}.recommendation is invalid.`);
    let artifact = null;
    try {
      const hashedArtifact = await hashFile(resolve(registryRoot, entry.path));
      artifact = { ...hashedArtifact, path: entry.path };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    const avoided =
      entry.minutesAvoidedPerUse === null || entry.reuseCount === null
        ? null
        : entry.minutesAvoidedPerUse * entry.reuseCount;
    tools.push({
      ...entry,
      artifact,
      observedMinutesAvoided: avoided,
      netObservedMinutes:
        avoided === null || entry.minutesInvested === null
          ? null
          : avoided - entry.minutesInvested,
    });
  }
  if (errors.length > 0)
    throw new Error(`Invalid tool registry:\n- ${errors.join("\n- ")}`);
  const totals = tools.reduce(
    (summary, tool) => ({
      minutesInvested: summary.minutesInvested + (tool.minutesInvested ?? 0),
      observedMinutesAvoided:
        summary.observedMinutesAvoided + (tool.observedMinutesAvoided ?? 0),
      reuseCount: summary.reuseCount + (tool.reuseCount ?? 0),
      unknownInvestmentCount:
        summary.unknownInvestmentCount + Number(tool.minutesInvested === null),
      unknownAvoidanceCount:
        summary.unknownAvoidanceCount +
        Number(tool.observedMinutesAvoided === null),
    }),
    {
      minutesInvested: 0,
      observedMinutesAvoided: 0,
      reuseCount: 0,
      unknownInvestmentCount: 0,
      unknownAvoidanceCount: 0,
    },
  );
  return {
    schemaVersion: 1,
    reportType: "self-tooling-harvest",
    authority: "none",
    notice:
      "Evidence and recommendations only. Promotion requires separate scope, review, and authority.",
    tool: { name: "tool-harvest", version: TOOL_VERSION },
    registry: { ...(await hashFile(absoluteRegistryPath)), path: registryPath },
    totals: {
      ...totals,
      netObservedMinutes:
        totals.unknownInvestmentCount > 0 || totals.unknownAvoidanceCount > 0
          ? null
          : totals.observedMinutesAvoided - totals.minutesInvested,
    },
    tools,
  };
};

const main = async () => {
  const argv = process.argv.slice(2);
  let registryPath;
  let output;
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--registry") registryPath = argv.shift();
    else if (flag === "--output") output = argv.shift();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!registryPath)
    throw new Error("Usage: tool-harvest.mjs --registry FILE [--output FILE]");
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
