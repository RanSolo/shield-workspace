import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { harvestTools } from "../scripts/operations/tool-harvest.mjs";
import { sha256, stableJson } from "../scripts/operations/common.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const operationsCli = join(packageRoot, "scripts", "operations", "ops-cli.mjs");

const tool = (overrides = {}) => ({
  name: "helper",
  path: "tools/helper.mjs",
  trigger: "Repeated check",
  purpose: "Make the check deterministic",
  inputs: ["state"],
  outputs: ["report"],
  minutesInvested: 10,
  minutesAvoidedPerUse: 4,
  reuseCount: 3,
  errorsPrevented: ["stale state"],
  evidenceImproved: ["exact hash"],
  recommendation: "promotion-candidate",
  ...overrides,
});

const createRepository = async (prefix = "shield-tool-harvest-") => {
  const root = await mkdtemp(join(tmpdir(), prefix));
  execFileSync("git", ["init", "--quiet", root]);
  await mkdir(join(root, "registry"));
  await mkdir(join(root, "tools"));
  await writeFile(join(root, "tools", "helper.mjs"), "export const answer = 42;\n");
  return { root, registryPath: join(root, "registry", "tool-registry.json") };
};

const writeRegistry = async (registryPath, tools = [tool()], overrides = {}) => {
  const content = stableJson({
    schemaVersion: 1,
    artifactRoot: "..",
    tools,
    ...overrides,
  });
  await writeFile(registryPath, content);
  return content;
};

test("harvest emits a closed portable report bound to one registry snapshot", async () => {
  const { registryPath } = await createRepository();
  const registryBytes = await writeRegistry(registryPath);
  const report = await harvestTools({ registryPath });

  assert.equal(report.authority, "none");
  assert.deepEqual(report.registry, {
    artifactRoot: "..",
    bytes: Buffer.byteLength(registryBytes),
    sha256: sha256(registryBytes),
  });
  assert.deepEqual(Object.keys(report.tools[0]), [
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
    "artifact",
    "observedMinutesAvoided",
    "netObservedMinutes",
  ]);
  assert.deepEqual(report.tools[0].artifact, {
    path: "tools/helper.mjs",
    bytes: 26,
    sha256: sha256("export const answer = 42;\n"),
  });
  assert.equal(stableJson(report).includes(registryPath), false);
});

test("harvest preserves null aggregates and labels known subtotals and unknown counts", async () => {
  const { root, registryPath } = await createRepository("shield-tool-unknown-");
  await writeFile(join(root, "tools", "unknown.mjs"), "export {};\n");
  await writeRegistry(registryPath, [
    tool(),
    tool({
      name: "unknown-helper",
      path: "tools/unknown.mjs",
      minutesInvested: null,
      minutesAvoidedPerUse: null,
      reuseCount: null,
    }),
  ]);

  const report = await harvestTools({ registryPath });
  assert.deepEqual(report.totals, {
    minutesInvested: null,
    knownMinutesInvested: 10,
    unknownInvestmentCount: 1,
    observedMinutesAvoided: null,
    knownObservedMinutesAvoided: 12,
    unknownAvoidanceCount: 1,
    reuseCount: null,
    knownReuseCount: 3,
    unknownReuseCount: 1,
    netObservedMinutes: null,
    knownNetObservedMinutes: 2,
    unknownNetObservedMinutesCount: 1,
  });
});

test("harvest rejects unknown and malformed registry fields before emitting output", async () => {
  const { registryPath } = await createRepository("shield-tool-closed-");
  await writeRegistry(registryPath, [tool({ secretCanary: "do-not-copy" })]);
  await assert.rejects(
    harvestTools({ registryPath }),
    /contains unknown field secretCanary/u,
  );

  await writeRegistry(registryPath, [tool()], { unexpected: true });
  await assert.rejects(
    harvestTools({ registryPath }),
    /contains unknown field unexpected/u,
  );

  await writeRegistry(registryPath, [{ ...tool(), inputs: "state" }]);
  await assert.rejects(harvestTools({ registryPath }), /inputs must be an array/u);
});

test("harvest rejects absolute, traversing, duplicate, and symlinked artifact paths", async () => {
  const { root, registryPath } = await createRepository("shield-tool-paths-");
  const invalidPaths = [
    "/tmp/helper.mjs",
    "../helper.mjs",
    "tools/../tools/helper.mjs",
    "./tools/helper.mjs",
    "C:/tools/helper.mjs",
    "tools\\helper.mjs",
  ];
  for (const path of invalidPaths) {
    await writeRegistry(registryPath, [tool({ path })]);
    await assert.rejects(harvestTools({ registryPath }), /repository-relative POSIX file path/u);
  }

  await writeRegistry(registryPath, [tool(), tool({ name: "copy" })]);
  await assert.rejects(harvestTools({ registryPath }), /path duplicates tools\/helper\.mjs/u);

  await symlink(join(root, "tools"), join(root, "linked-tools"));
  await writeRegistry(registryPath, [tool({ path: "linked-tools/helper.mjs" })]);
  await assert.rejects(harvestTools({ registryPath }), /non-symlink regular file within artifactRoot/u);
});

test("harvest rejects canonical case aliases and collisions on a case-insensitive macOS volume", async (context) => {
  if (process.platform !== "darwin") return context.skip("requires macOS");
  const { root, registryPath } = await createRepository("shield-tool-case-alias-");
  const aliasPath = join(root, "tools", "HELPER.mjs");
  const canonicalAlias = await realpath(aliasPath).catch(() => undefined);
  if (canonicalAlias === undefined || canonicalAlias === aliasPath) {
    return context.skip("requires a case-insensitive filesystem");
  }

  await writeRegistry(registryPath, [tool({ path: "tools/HELPER.mjs" })]);
  await assert.rejects(harvestTools({ registryPath }), /must exactly match its canonical artifact path/u);

  await writeRegistry(registryPath, [
    tool(),
    tool({ name: "case-alias", path: "tools/HELPER.mjs" }),
  ]);
  await assert.rejects(
    harvestTools({ registryPath }),
    /collides with another canonical artifact path/u,
  );

  await writeRegistry(registryPath);
  const report = await harvestTools({ registryPath });
  assert.deepEqual(await harvestTools({ registryPath }), report);
});

test("case-sensitive repositories preserve distinct portable artifact casing", async (context) => {
  const first = await createRepository("shield-tool-case-sensitive-a-");
  const aliasPath = join(first.root, "tools", "HELPER.mjs");
  if (await realpath(aliasPath).catch(() => undefined)) {
    return context.skip("requires a case-sensitive filesystem");
  }
  await writeFile(aliasPath, "export const upper = true;\n");
  const entries = [
    tool(),
    tool({ name: "upper-helper", path: "tools/HELPER.mjs" }),
  ];
  await writeRegistry(first.registryPath, entries);

  const second = await createRepository("shield-tool-case-sensitive-b-");
  await writeFile(join(second.root, "tools", "HELPER.mjs"), "export const upper = true;\n");
  await writeRegistry(second.registryPath, entries);

  const firstReport = await harvestTools({ registryPath: first.registryPath });
  assert.deepEqual(firstReport.tools.map(({ path }) => path), [
    "tools/helper.mjs",
    "tools/HELPER.mjs",
  ]);
  assert.deepEqual(await harvestTools({ registryPath: second.registryPath }), firstReport);
});

test("harvest requires artifactRoot to be a portable locator for the canonical Git root", async () => {
  const { registryPath } = await createRepository("shield-tool-root-");
  await writeRegistry(registryPath, [tool()], { artifactRoot: "." });
  await assert.rejects(harvestTools({ registryPath }), /canonical Git root/u);

  await writeRegistry(registryPath, [tool()], { artifactRoot: dirname(registryPath) });
  await assert.rejects(harvestTools({ registryPath }), /portable registry-relative POSIX locator/u);
});

test("harvest rejects derived and aggregate numeric overflow", async () => {
  const { root, registryPath } = await createRepository("shield-tool-overflow-");
  await writeRegistry(registryPath, [tool({ minutesAvoidedPerUse: 1e308, reuseCount: 2 })]);
  await assert.rejects(harvestTools({ registryPath }), /observedMinutesAvoided exceeds/u);

  await writeFile(join(root, "tools", "second.mjs"), "export {};\n");
  await writeRegistry(registryPath, [
    tool({ minutesInvested: 1e308, minutesAvoidedPerUse: 0 }),
    tool({ name: "second", path: "tools/second.mjs", minutesInvested: 1e308, minutesAvoidedPerUse: 0 }),
  ]);
  await assert.rejects(harvestTools({ registryPath }), /knownMinutesInvested exceeds/u);

  await writeRegistry(registryPath, [
    tool({ reuseCount: Number.MAX_SAFE_INTEGER, minutesAvoidedPerUse: 0 }),
    tool({ name: "second", path: "tools/second.mjs", reuseCount: 1, minutesAvoidedPerUse: 0 }),
  ]);
  await assert.rejects(harvestTools({ registryPath }), /knownReuseCount exceeds the safe integer range/u);
});

test("portable registry and artifact locators replay identically in another Git root", async () => {
  const first = await createRepository("shield-tool-replay-a-");
  const second = await createRepository("shield-tool-replay-b-");
  await writeRegistry(first.registryPath);
  await writeRegistry(second.registryPath);

  const firstReport = await harvestTools({ registryPath: first.registryPath });
  assert.deepEqual(await harvestTools({ registryPath: first.registryPath }), firstReport);
  assert.deepEqual(await harvestTools({ registryPath: second.registryPath }), firstReport);
});

test("shield-ops rejects duplicate and incomplete tool-harvest CLI options", async () => {
  const { registryPath } = await createRepository("shield-tool-cli-");
  await writeRegistry(registryPath);
  const cases = [
    [["tool", "harvest", "--registry"], /--registry requires a value/u],
    [["tool", "harvest", "--registry", registryPath, "--output"], /--output requires a value/u],
    [["tool", "harvest", "--registry", registryPath, "--registry", registryPath], /Duplicate option: --registry/u],
    [["tool", "harvest", "--registry", registryPath, "--output", "first.json", "--output", "second.json"], /Duplicate option: --output/u],
  ];
  for (const [argv, expected] of cases) {
    const result = spawnSync(process.execPath, [operationsCli, ...argv], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, expected);
    assert.equal(result.stdout, "");
  }
});
