#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const TEAM_TASK = "@shield/team-system:build";
const PREPARATION_TASK = "@shield/mission-preparation:build";
const DIST_DIRECTORIES = [
  "packages/mission-preparation/dist",
  "packages/shield-team-system/dist",
];
const REQUIRED_OUTPUTS = [
  "packages/mission-preparation/dist/index.mjs",
  "packages/mission-preparation/dist/index.d.mts",
  "packages/shield-team-system/dist/cli.mjs",
  "packages/shield-team-system/dist/cli.d.mts",
];
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined || result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw result.error ?? new Error(`${command} ${args.join(" ")} exited with status ${result.status}.`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function normalizedRelativePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function sortedManifest(workspace) {
  const entries = [];
  for (const directory of DIST_DIRECTORIES) {
    const root = join(workspace, directory);
    const pending = [root];
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Generated output must not be a symlink: ${path}.`);
        if (entry.isDirectory()) pending.push(path);
        else if (entry.isFile()) {
          entries.push(`${sha256(readFileSync(path))}  ${normalizedRelativePath(workspace, path)}`);
        } else throw new Error(`Generated output must be a regular file: ${path}.`);
      }
    }
  }
  entries.sort();
  return `${entries.join("\n")}\n`;
}

function requireOutputs(workspace) {
  for (const output of REQUIRED_OUTPUTS) {
    const path = join(workspace, output);
    if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`Required build output is missing: ${output}.`);
  }
}

function removeOutputs(workspace) {
  for (const directory of DIST_DIRECTORIES) rmSync(join(workspace, directory), { recursive: true, force: true });
}

function plain(output) {
  return output.replace(/\u001b\[[0-9;]*m/gu, "");
}

function requireCacheResult(output, expectedHits, label) {
  const text = plain(output);
  const expected = `Cache:             ${expectedHits}/2 hit (${expectedHits === 2 ? "100" : "0"}%)`;
  if (!text.includes(expected)) throw new Error(`${label} did not report ${expectedHits}/2 local cache hits.`);
  for (const task of [PREPARATION_TASK, TEAM_TASK]) {
    const marker = `> nx run ${task}  [local cache]`;
    if ((expectedHits === 2) !== text.includes(marker)) {
      throw new Error(`${label} reported an unexpected cache state for ${task}.`);
    }
  }
}

function requireExactTaskGraph(rawGraph) {
  const graph = JSON.parse(rawGraph);
  const taskGraph = graph.tasks;
  const taskIds = Object.keys(taskGraph.tasks).sort();
  const expectedTaskIds = [PREPARATION_TASK, TEAM_TASK].sort();
  if (JSON.stringify(taskIds) !== JSON.stringify(expectedTaskIds)) {
    throw new Error(`Unexpected clean-build task set: ${taskIds.join(", ")}.`);
  }
  if (JSON.stringify(taskGraph.dependencies[TEAM_TASK]) !== JSON.stringify([PREPARATION_TASK])) {
    throw new Error(`Missing exact task edge ${TEAM_TASK} -> ${PREPARATION_TASK}.`);
  }
  if (JSON.stringify(taskGraph.dependencies[PREPARATION_TASK]) !== "[]") {
    throw new Error(`${PREPARATION_TASK} has unexpected task dependencies.`);
  }
  for (const [task, output] of [
    [PREPARATION_TASK, "packages/mission-preparation/dist"],
    [TEAM_TASK, "packages/shield-team-system/dist"],
  ]) {
    if (JSON.stringify(taskGraph.tasks[task].outputs) !== JSON.stringify([output])) {
      throw new Error(`${task} does not declare exactly ${output} as its output.`);
    }
  }
}

const repository = resolve(run("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() }).trim());
const commit = run("git", ["rev-parse", "HEAD"], { cwd: repository }).trim();
const temporaryRoot = mkdtempSync(join(tmpdir(), "shield-team-system-clean-build-"));
const archive = join(temporaryRoot, "source.tar");
const workspace = join(temporaryRoot, "workspace");
const cacheDirectory = join(temporaryRoot, "nx-cache");
const workspaceDataDirectory = join(temporaryRoot, "nx-workspace-data");
const proofDirectory = join(temporaryRoot, "proof");

try {
  for (const path of [temporaryRoot, workspace, cacheDirectory, workspaceDataDirectory]) {
    if (!isAbsolute(path)) throw new Error(`Verification path must be absolute: ${path}.`);
  }
  mkdirSync(workspace);
  mkdirSync(cacheDirectory);
  mkdirSync(workspaceDataDirectory);
  mkdirSync(proofDirectory);

  run("git", ["archive", "--format=tar", `--output=${archive}`, commit], { cwd: repository });
  run("tar", ["-xf", archive, "-C", workspace], { cwd: repository });
  if (!existsSync(join(workspace, "package-lock.json"))) throw new Error("The exact commit archive has no package-lock.json.");

  const environment = {
    ...process.env,
    CI: "true",
    NO_COLOR: "1",
    NX_CACHE_DIRECTORY: cacheDirectory,
    NX_WORKSPACE_DATA_DIRECTORY: workspaceDataDirectory,
    NX_DAEMON: "false",
    NX_NO_CLOUD: "true",
    NX_TASKS_RUNNER_DYNAMIC_OUTPUT: "false",
  };
  delete environment.FORCE_COLOR;
  delete environment.NX_CLOUD_ACCESS_TOKEN;

  run("npm", ["ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: workspace,
    env: environment,
  });
  const nx = join(workspace, "node_modules", "nx", "dist", "bin", "nx.js");
  requireExactTaskGraph(run(process.execPath, [nx, "run", TEAM_TASK, "--graph=stdout"], {
    cwd: workspace,
    env: environment,
  }));

  removeOutputs(workspace);
  const firstBuild = run(process.execPath, [nx, "run", TEAM_TASK, "--outputStyle=static"], {
    cwd: workspace,
    env: environment,
  });
  requireCacheResult(firstBuild, 0, "Clean build");
  requireOutputs(workspace);

  const noDeletionHit = run(process.execPath, [nx, "run", TEAM_TASK, "--outputStyle=static"], {
    cwd: workspace,
    env: environment,
  });
  requireCacheResult(noDeletionHit, 2, "Consecutive build");
  requireOutputs(workspace);

  const builtManifest = sortedManifest(workspace);
  writeFileSync(join(proofDirectory, "built.sha256"), builtManifest);
  removeOutputs(workspace);

  const restorationHit = run(process.execPath, [nx, "run", TEAM_TASK, "--outputStyle=static"], {
    cwd: workspace,
    env: environment,
  });
  requireCacheResult(restorationHit, 2, "Deleted-output restoration");
  requireOutputs(workspace);

  const restoredManifest = sortedManifest(workspace);
  writeFileSync(join(proofDirectory, "restored.sha256"), restoredManifest);
  if (restoredManifest !== builtManifest) throw new Error("Restored dist manifests are not byte-identical.");

  const help = run(process.execPath, [join(workspace, "packages/shield-team-system/dist/cli.mjs"), "--help"], {
    cwd: workspace,
    env: environment,
  });
  if (!help.includes("shield mission prepare-next")) throw new Error("CLI help does not expose mission prepare-next.");

  const manifestEntries = builtManifest.trimEnd().split("\n").length;
  process.stdout.write([
    "PASS dependency-aware Team System clean-build proof",
    `commit: ${commit}`,
    `task-edge: ${TEAM_TASK} -> ${PREPARATION_TASK}`,
    "cache-with-outputs: 2/2 local hits",
    "cache-after-delete: 2/2 local hits",
    `dist-manifest-sha256: ${sha256(builtManifest)} (${manifestEntries} files)`,
    "cli-help: shield mission prepare-next",
    "",
  ].join("\n"));
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
