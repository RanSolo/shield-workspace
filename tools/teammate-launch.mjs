#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TEAMMATE_LAUNCH_CONTRACT_VERSION = "shield.teammate-launch.v1";

const HASH_40 = /^[0-9a-f]{40}$/u;
const HASH_64 = /^[0-9a-f]{64}$/u;
const MAX_OUTPUT = 4 * 1024 * 1024;
const RECEIPT_SUFFIX = ".shield-teammate-launch-v1.json";
const EXPECTED_GO_BINDINGS = Object.freeze([
  "acceptedIssue306ImplementationRevision",
  "issue306MergeRevision",
  "reviewedPlanCommit",
  "reviewedPlanSha256",
  "bootstrapSha256",
  "liveBootstrapCheckoutHead",
]);
const NEXT_ACTION = Object.freeze({
  invalid_input: "Correct the invocation and supply the four required closed inputs.",
  source_unavailable: "Run the tracked launcher from an accessible canonical source checkout.",
  revision_unavailable: "Make the exact expected commit available in the launcher's source object repository.",
  bootstrap_missing: "Select an expected revision that contains the supplied tracked bootstrap blob.",
  bootstrap_mismatch: "Use the reviewed bootstrap path, digest, plan, and prompt from the exact expected revision.",
  destination_unsafe: "Choose a new absent path beneath one existing writable canonical non-symlink parent.",
  worktree_create_failed: "Resolve the reported Git worktree creation failure, then choose a new absent destination.",
  checkout_mismatch: "Preserve the checkout for inspection and choose a new destination for the next attempt.",
  dependencies_unavailable: "Restore lockfile-defined npm dependency availability, then choose a new destination.",
  build_unavailable: "Repair the exact target-local two-project Nx build, then choose a new destination.",
  cli_unavailable: "Repair the exact target-local SHIELD CLI, then choose a new destination.",
  preflight_not_ready: "Resolve the authority-neutral preflight finding, then choose a new destination.",
  repository_drift: "Preserve the checkout and receipt boundary for inspection; do not continue from this attempt.",
  receipt_write_failed: "Preserve the checkout and adjacent receipt artifacts for inspection; do not retry in place.",
  recovery_required: "Stop and inspect the retained checkout, Git registration, process state, and receipt boundary.",
});

const BOOTSTRAP_KEYS = Object.freeze([
  "schemaVersion",
  "contractVersion",
  "authority",
  "issueId",
  "acceptedIssue306ImplementationRevision",
  "issue306MergeRevision",
  "reviewedPlanPath",
  "reviewedPlanCommit",
  "reviewedPlanSha256",
  "predecessorBootstrap",
  "requiredMachineDisposition",
  "requiredWorktreeObservation",
  "requiredTerminalDisposition",
  "goEvidenceMustBind",
]);
const PREDECESSOR_KEYS = Object.freeze(["sourceCommit", "planSha256", "status"]);

class LaunchFailure extends Error {
  constructor(reasonCode, detail = "", disposition = "action_required") {
    super(detail || reasonCode);
    this.reasonCode = reasonCode;
    this.detail = detail;
    this.disposition = disposition;
  }
}

export class ProcessUncertain extends Error {}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactObject(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function nulEntries(value) {
  if (value.length === 0) return [];
  const entries = value.split("\0");
  if (entries.at(-1) === "") entries.pop();
  return entries;
}

function pathInside(parent, candidate) {
  const delta = relative(parent, candidate);
  return delta !== "" && delta !== ".." && !delta.startsWith(`..${sep}`) && !isAbsolute(delta);
}

function normalizedRepositoryPath(value, suffix = undefined) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 &&
    !value.includes("\\") && !value.includes("\0") && !value.startsWith("/") &&
    posix.normalize(value) === value && value !== "." && !value.split("/").includes("..") &&
    (suffix === undefined || value.endsWith(suffix));
}

function parseCli(argv) {
  const values = new Map();
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      if (json) throw new LaunchFailure("invalid_input", "duplicate --json");
      json = true;
      continue;
    }
    if (!["--root", "--expected-head", "--bootstrap", "--bootstrap-sha256"].includes(token)) {
      throw new LaunchFailure("invalid_input", `unsupported argument ${token}`);
    }
    if (values.has(token) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
      throw new LaunchFailure("invalid_input", `missing or duplicate value for ${token}`);
    }
    values.set(token, argv[index + 1]);
    index += 1;
  }
  for (const name of ["--root", "--expected-head", "--bootstrap", "--bootstrap-sha256"]) {
    if (!values.has(name)) throw new LaunchFailure("invalid_input", `missing ${name}`);
  }
  return {
    input: {
      root: values.get("--root"),
      expectedHead: values.get("--expected-head"),
      bootstrapPath: values.get("--bootstrap"),
      bootstrapSha256: values.get("--bootstrap-sha256"),
    },
    json,
  };
}

function validateInput(input) {
  if (!exactObject(input, ["root", "expectedHead", "bootstrapPath", "bootstrapSha256"]) ||
      typeof input.root !== "string" || !isAbsolute(input.root) || resolve(input.root) !== input.root ||
      !HASH_40.test(input.expectedHead) || !normalizedRepositoryPath(input.bootstrapPath, ".json") ||
      !HASH_64.test(input.bootstrapSha256)) {
    throw new LaunchFailure("invalid_input", "input does not match the closed launcher contract");
  }
}

function closedEnvironment(extra = {}) {
  const executableDirectory = dirname(process.execPath);
  return {
    HOME: homedir(),
    LANG: "C",
    LC_ALL: "C",
    PATH: [executableDirectory, "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"),
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    ...extra,
  };
}

export function runBoundedProcess(executable, args, options = {}) {
  const timeout = options.timeout ?? 10_000;
  const maxOutput = options.maxOutput ?? MAX_OUTPUT;
  return new Promise((completion, rejection) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    let overflow = false;
    let timedOut = false;
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout);
    const collect = (current, chunk) => {
      if (overflow) return current;
      if (current.length + chunk.length > maxOutput) {
        overflow = true;
        child.kill("SIGKILL");
        return current;
      }
      return Buffer.concat([current, chunk]);
    };
    child.stdout.on("data", (chunk) => { stdout = collect(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = collect(stderr, chunk); });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      completion({ state: "spawn_error", code: null, stdout: "", stderr: "", errorCode: error.code ?? "unknown" });
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut || overflow || signal !== null || code === null) {
        rejection(new ProcessUncertain(timedOut ? "timeout" : overflow ? "output_overflow" : `signal:${signal ?? "unknown"}`));
        return;
      }
      completion({
        state: code === 0 ? "success" : "exit",
        code,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        errorCode: null,
      });
    });
  });
}

export function createNativeDependencies() {
  return Object.freeze({
    runProcess: runBoundedProcess,
    fs: Object.freeze({ access, link, lstat, mkdir, open, readFile, readdir, realpath, unlink }),
  });
}

function gitArguments(root, args) {
  return [
    "--no-optional-locks",
    "-c", "advice.detachedHead=false",
    "-c", "core.autocrlf=false",
    "-c", "core.eol=lf",
    "-c", "core.fsmonitor=false",
    "-c", "core.hooksPath=/dev/null",
    "-C", root,
    ...args,
  ];
}

function gitEnvironment() {
  return closedEnvironment({
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  });
}

async function runGit(context, root, args, options = {}) {
  const result = await context.dependencies.runProcess("git", gitArguments(root, args), {
    cwd: root,
    env: gitEnvironment(),
    timeout: options.timeout ?? 15_000,
    maxOutput: options.maxOutput ?? MAX_OUTPUT,
  });
  if (result.state !== "success") throw new Error(`git_failed:${args[0]}:${result.code ?? result.errorCode}`);
  return result.stdout;
}

async function gitResult(context, root, args, options = {}) {
  return context.dependencies.runProcess("git", gitArguments(root, args), {
    cwd: root,
    env: gitEnvironment(),
    timeout: options.timeout ?? 15_000,
    maxOutput: options.maxOutput ?? MAX_OUTPUT,
  });
}

async function absent(fs, path) {
  try {
    await fs.lstat(path);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function resolveSource(context) {
  const fs = context.dependencies.fs;
  const launcher = await fs.realpath(fileURLToPath(import.meta.url));
  const candidate = resolve(dirname(launcher), "..");
  const root = (await runGit(context, candidate, ["rev-parse", "--show-toplevel"])).trim();
  const canonical = await fs.realpath(root);
  if (canonical !== candidate || !pathInside(canonical, launcher)) throw new Error("launcher_outside_source_root");
  const launcherRelative = relative(canonical, launcher).split(sep).join("/");
  const tracked = (await runGit(context, canonical, ["ls-files", "--error-unmatch", "--", launcherRelative])).trim();
  if (tracked !== launcherRelative) throw new Error("launcher_not_tracked");
  const commonRaw = (await runGit(context, canonical, ["rev-parse", "--git-common-dir"])).trim();
  const common = await fs.realpath(resolve(canonical, commonRaw));
  const sourceHead = (await runGit(context, canonical, ["rev-parse", "--verify", "HEAD"])).trim();
  if (!HASH_40.test(sourceHead)) throw new Error("source_head_invalid");
  const origin = (await runGit(context, canonical, ["remote", "get-url", "origin"])).trim();
  if (origin.length === 0 || origin.includes("\0") || origin.includes("\n")) throw new Error("origin_invalid");
  return { root: canonical, common, sourceHead, origin, launcherRelative };
}

async function validateRevision(context) {
  const expected = context.input.expectedHead;
  const resolved = (await runGit(context, context.source.root, ["rev-parse", "--verify", `${expected}^{commit}`])).trim();
  if (resolved !== expected) throw new Error("revision_not_exact");
  const attributes = nulEntries(await runGit(context, context.source.root, ["ls-tree", "-r", "-z", "--name-only", expected]))
    .filter((path) => basename(path) === ".gitattributes");
  for (const path of attributes) {
    const artifact = await readObjectArtifact(context, expected, path);
    const lines = artifact.bytes.toString("utf8").split(/\r?\n/u);
    if (lines.some((line) => {
      const body = line.replace(/\\ /gu, "_").trim();
      return body !== "" && !body.startsWith("#") && body.split(/\s+/u).slice(1)
        .some((token) => /^(?:-?filter|!filter)(?:=|$)/u.test(token));
    })) throw new Error(`checkout_filter:${path}`);
  }
}

function parseLsTreeEntry(output, expectedPath) {
  const entries = nulEntries(output);
  if (entries.length !== 1) throw new Error("tree_entry_count");
  const match = /^(100644|100755) blob ([0-9a-f]{40})\t([^\0]+)$/u.exec(entries[0]);
  if (match === null || match[3] !== expectedPath) throw new Error("tree_entry_invalid");
  return { mode: match[1], oid: match[2], path: match[3] };
}

async function readObjectArtifact(context, revision, path) {
  if (!normalizedRepositoryPath(path)) throw new Error("artifact_path_invalid");
  const entry = parseLsTreeEntry(
    await runGit(context, context.source.root, ["ls-tree", "-z", revision, "--", path]),
    path,
  );
  const result = await context.dependencies.runProcess("git", gitArguments(context.source.root, ["cat-file", "blob", entry.oid]), {
    cwd: context.source.root,
    env: gitEnvironment(),
    timeout: 15_000,
    maxOutput: MAX_OUTPUT,
  });
  if (result.state !== "success") throw new Error("blob_unavailable");
  const bytes = Buffer.from(result.stdout, "utf8");
  return { ...entry, bytes, sha256: sha256(bytes) };
}

function validateBootstrapObject(value) {
  if (!exactObject(value, BOOTSTRAP_KEYS) || value.schemaVersion !== 1 ||
      value.contractVersion !== "shield.teammate-demo-bootstrap.v1" || value.authority !== "none" ||
      !Number.isSafeInteger(value.issueId) || value.issueId <= 0 ||
      !HASH_40.test(value.acceptedIssue306ImplementationRevision) || !HASH_40.test(value.issue306MergeRevision) ||
      !normalizedRepositoryPath(value.reviewedPlanPath, ".md") || !HASH_40.test(value.reviewedPlanCommit) ||
      !HASH_64.test(value.reviewedPlanSha256) || !exactObject(value.predecessorBootstrap, PREDECESSOR_KEYS) ||
      !HASH_40.test(value.predecessorBootstrap.sourceCommit) || !HASH_64.test(value.predecessorBootstrap.planSha256) ||
      value.predecessorBootstrap.status !== "predecessor_only_not_execution_identity" ||
      value.requiredMachineDisposition !== "ready_for_host_confirmation" ||
      value.requiredWorktreeObservation !== "uninitialized_worktree" ||
      value.requiredTerminalDisposition !== "GO_FOR_TEAMMATE_DEMO" ||
      !Array.isArray(value.goEvidenceMustBind) ||
      value.goEvidenceMustBind.length !== EXPECTED_GO_BINDINGS.length ||
      value.goEvidenceMustBind.some((entry, index) => entry !== EXPECTED_GO_BINDINGS[index])) {
    throw new Error("bootstrap_schema_invalid");
  }
  return value;
}

function jsonPropertyNames(text) {
  const names = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '"') continue;
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") index += 2;
      else if (text[index] === '"') break;
      else index += 1;
    }
    if (index >= text.length) return [];
    let next = index + 1;
    while (/\s/u.test(text[next] ?? "")) next += 1;
    if (text[next] === ":") {
      try { names.push(JSON.parse(text.slice(start, index + 1))); }
      catch { return []; }
    }
  }
  return names;
}

export function inspectBootstrapBytes(bytes, suppliedDigest) {
  if (!Buffer.isBuffer(bytes) || !HASH_64.test(suppliedDigest) || sha256(bytes) !== suppliedDigest) {
    throw new LaunchFailure("bootstrap_mismatch", "bootstrap digest mismatch");
  }
  const text = bytes.toString("utf8");
  const expectedProperties = [...BOOTSTRAP_KEYS, ...PREDECESSOR_KEYS].sort();
  const observedProperties = jsonPropertyNames(text).sort();
  if (observedProperties.length !== expectedProperties.length ||
      observedProperties.some((name, index) => name !== expectedProperties[index])) {
    throw new LaunchFailure("bootstrap_mismatch", "bootstrap JSON has duplicate or unknown properties");
  }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new LaunchFailure("bootstrap_mismatch", "bootstrap JSON is malformed"); }
  try { return validateBootstrapObject(parsed); }
  catch (error) { throw new LaunchFailure("bootstrap_mismatch", error.message); }
}

async function validateArtifacts(context) {
  let bootstrap;
  try { bootstrap = await readObjectArtifact(context, context.input.expectedHead, context.input.bootstrapPath); }
  catch (error) {
    if (String(error.message).includes("tree_entry")) throw new LaunchFailure("bootstrap_missing", error.message);
    throw error;
  }
  const metadata = inspectBootstrapBytes(bootstrap.bytes, context.input.bootstrapSha256);
  const promptPath = `.codex/prompts/issue-${metadata.issueId}-teammate-demo.md`;
  let planAtReview;
  let planAtHead;
  let prompt;
  try {
    for (const revision of [
      metadata.acceptedIssue306ImplementationRevision,
      metadata.issue306MergeRevision,
      metadata.predecessorBootstrap.sourceCommit,
    ]) {
      const resolved = (await runGit(context, context.source.root, ["rev-parse", "--verify", `${revision}^{commit}`])).trim();
      if (resolved !== revision) throw new Error("bootstrap_revision_not_exact");
    }
    for (const [ancestor, descendant] of [
      [metadata.acceptedIssue306ImplementationRevision, metadata.issue306MergeRevision],
      [metadata.issue306MergeRevision, context.input.expectedHead],
      [metadata.reviewedPlanCommit, context.input.expectedHead],
    ]) {
      const ancestry = await gitResult(context, context.source.root, ["merge-base", "--is-ancestor", ancestor, descendant]);
      if (ancestry.state !== "success") throw new Error("bootstrap_revision_ancestry_invalid");
    }
    planAtReview = await readObjectArtifact(context, metadata.reviewedPlanCommit, metadata.reviewedPlanPath);
    planAtHead = await readObjectArtifact(context, context.input.expectedHead, metadata.reviewedPlanPath);
    prompt = await readObjectArtifact(context, context.input.expectedHead, promptPath);
    const predecessorPlan = await readObjectArtifact(context, metadata.predecessorBootstrap.sourceCommit, metadata.reviewedPlanPath);
    if (predecessorPlan.sha256 !== metadata.predecessorBootstrap.planSha256) throw new Error("predecessor_plan_digest_invalid");
  } catch (error) {
    throw new LaunchFailure("bootstrap_mismatch", error.message);
  }
  if (planAtReview.sha256 !== metadata.reviewedPlanSha256 || planAtHead.sha256 !== metadata.reviewedPlanSha256 ||
      planAtReview.oid !== planAtHead.oid) {
    throw new LaunchFailure("bootstrap_mismatch", "reviewed plan object or digest mismatch");
  }
  return { bootstrap, metadata, plan: planAtHead, prompt, promptPath };
}

async function validateDestination(context) {
  const fs = context.dependencies.fs;
  const root = context.input.root;
  const parent = dirname(root);
  if ([resolve("/"), resolve(homedir()), context.source.root, context.source.common].includes(root) ||
      parent === resolve("/") || !pathInside(parent, root)) throw new Error("broad_or_source_destination");
  const parentCanonical = await fs.realpath(parent);
  if (parentCanonical !== parent) throw new Error("aliased_parent");
  const parentStats = await fs.lstat(parent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) throw new Error("parent_not_canonical_directory");
  await fs.access(parent, constants.R_OK | constants.W_OK | constants.X_OK);
  const receiptPath = `${root}${RECEIPT_SUFFIX}`;
  if (!(await absent(fs, root)) || !(await absent(fs, receiptPath))) throw new Error("destination_or_receipt_exists");
  return { parent, parentIdentity: `${parentStats.dev}:${parentStats.ino}`, receiptPath };
}

function registeredWorktrees(output) {
  return output.split(/\n\n/u).map((record) => record.split("\n").find((line) => line.startsWith("worktree "))?.slice(9))
    .filter((value) => value !== undefined).map((value) => resolve(value));
}

async function worktreeRegistered(context) {
  const output = await runGit(context, context.source.root, ["worktree", "list", "--porcelain"]);
  return registeredWorktrees(output).includes(context.input.root);
}

async function createWorktree(context) {
  let result;
  try {
    result = await context.dependencies.runProcess("git", gitArguments(context.source.root, [
      "worktree", "add", "--detach", context.input.root, context.input.expectedHead,
    ]), { cwd: context.source.root, env: gitEnvironment(), timeout: 30_000, maxOutput: MAX_OUTPUT });
  } catch (error) {
    if (error instanceof ProcessUncertain) throw new LaunchFailure("recovery_required", error.message, "recovery_required");
    throw error;
  }
  if (result.state !== "success") {
    try {
      if (await absent(context.dependencies.fs, context.input.root) && !(await worktreeRegistered(context))) {
        throw new LaunchFailure("worktree_create_failed", `git exited ${result.code ?? result.errorCode}`);
      }
    } catch (error) {
      if (error instanceof LaunchFailure) throw error;
    }
    throw new LaunchFailure("recovery_required", "worktree creation post-state is not absent", "recovery_required");
  }
}

async function targetGit(context, args) {
  return runGit(context, context.input.root, args);
}

async function assertParentAndReceipt(context, requireReceiptAbsent = true) {
  const stats = await context.dependencies.fs.lstat(context.destination.parent);
  if (!stats.isDirectory() || stats.isSymbolicLink() || `${stats.dev}:${stats.ino}` !== context.destination.parentIdentity) {
    throw new Error("destination_parent_changed");
  }
  if (requireReceiptAbsent && !(await absent(context.dependencies.fs, context.destination.receiptPath))) {
    throw new Error("receipt_collision");
  }
}

async function assertArtifactFile(context, artifact, path) {
  const absolute = join(context.input.root, ...path.split("/"));
  const stats = await context.dependencies.fs.lstat(absolute);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`artifact_not_regular:${path}`);
  const bytes = await context.dependencies.fs.readFile(absolute);
  if (sha256(bytes) !== artifact.sha256 || !bytes.equals(artifact.bytes)) throw new Error(`artifact_drift:${path}`);
}

async function repositorySnapshot(context, phase, options = {}) {
  const fs = context.dependencies.fs;
  const canonical = await fs.realpath(context.input.root);
  const rootStats = await fs.lstat(canonical);
  if (canonical !== context.input.root || !rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error("target_root_changed");
  const top = (await targetGit(context, ["rev-parse", "--show-toplevel"])).trim();
  const head = (await targetGit(context, ["rev-parse", "--verify", "HEAD"])).trim();
  const branch = await gitResult(context, context.input.root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const status = await targetGit(context, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const tracked = await targetGit(context, ["ls-files", "-z"]);
  const expectedTracked = await targetGit(context, ["ls-tree", "-r", "-z", "--name-only", context.input.expectedHead]);
  if (top.trim() !== context.input.root || head !== context.input.expectedHead || branch.state === "success" ||
      status !== "" || tracked !== expectedTracked || !(await worktreeRegistered(context)) ||
      !(await absent(fs, join(context.input.root, ".shield")))) throw new Error(`repository_state_invalid:${phase}`);
  await assertArtifactFile(context, context.artifacts.bootstrap, context.input.bootstrapPath);
  await assertArtifactFile(context, context.artifacts.plan, context.artifacts.metadata.reviewedPlanPath);
  await assertArtifactFile(context, context.artifacts.prompt, context.artifacts.promptPath);
  const untracked = nulEntries(await targetGit(context, ["ls-files", "--others", "--exclude-standard", "-z"]));
  if (untracked.length !== 0) throw new Error(`untracked_inventory:${phase}:${untracked[0]}`);
  const ignored = nulEntries(await targetGit(context, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]));
  if (options.allowedIgnored !== undefined) options.allowedIgnored(ignored);
  else if (ignored.length !== 0) throw new Error(`ignored_inventory:${phase}:${ignored[0]}`);
  if (options.requireDistAbsent === true) {
    for (const path of ["packages/mission-preparation/dist", "packages/shield-team-system/dist"]) {
      if (!(await absent(fs, join(context.input.root, ...path.split("/"))))) throw new Error(`stale_dist:${path}`);
    }
  }
  return { canonical, rootIdentity: `${rootStats.dev}:${rootStats.ino}`, head, tracked, ignored };
}

function lockfileInventory(lockfile) {
  if (!exactObject(lockfile, ["name", "version", "lockfileVersion", "requires", "packages"]) &&
      !(lockfile !== null && typeof lockfile === "object" && !Array.isArray(lockfile) && lockfile.packages !== null)) {
    throw new Error("lockfile_schema_invalid");
  }
  const packagePaths = Object.keys(lockfile.packages).filter((path) => path.startsWith("node_modules/")).sort();
  if (packagePaths.length === 0) throw new Error("lockfile_dependencies_empty");
  return packagePaths;
}

function dependencyInventoryValidator(packagePaths, extraPrefixes = []) {
  const exactExtras = new Set(["node_modules/.package-lock.json"]);
  return (paths) => {
    for (const path of paths) {
      const lockDefined = path.startsWith("node_modules/.bin/") || packagePaths.some((entry) => path === entry || path.startsWith(`${entry}/`));
      const generated = extraPrefixes.some((entry) => path === entry || path.startsWith(`${entry}/`));
      if (!lockDefined && !generated && !exactExtras.has(path)) throw new Error(`unexpected_ignored_path:${path}`);
    }
  };
}

async function reconcileKnownChildFailure(context, allowedIgnored) {
  await repositorySnapshot(context, "child_failure", { allowedIgnored });
  await assertParentAndReceipt(context);
}

async function runKnownChild(context, executable, args, options, reasonCode, allowedIgnored) {
  let result;
  try { result = await context.dependencies.runProcess(executable, args, options); }
  catch (error) {
    if (error instanceof ProcessUncertain) throw new LaunchFailure("recovery_required", error.message, "recovery_required");
    throw error;
  }
  if (result.state !== "success") {
    try { await reconcileKnownChildFailure(context, allowedIgnored); }
    catch { throw new LaunchFailure("recovery_required", `${reasonCode} post-state cannot be proven`, "recovery_required"); }
    throw new LaunchFailure(reasonCode, `${basename(executable)} exited ${result.code ?? result.errorCode}`);
  }
  return result;
}

function parseJsonOutput(result, label) {
  try { return JSON.parse(result.stdout); }
  catch { throw new Error(`${label}_json_invalid`); }
}

function validateTaskGraph(graph) {
  if (graph === null || typeof graph !== "object" || graph.tasks === null || typeof graph.tasks !== "object") throw new Error("task_graph_missing");
  const tasks = graph.tasks.tasks;
  const dependencies = graph.tasks.dependencies;
  const ids = tasks !== null && typeof tasks === "object" ? Object.keys(tasks).sort() : [];
  if (ids.join("\0") !== ["@shield/mission-preparation:build", "@shield/team-system:build"].sort().join("\0") ||
      !exactObject(dependencies, ids) ||
      dependencies["@shield/team-system:build"]?.length !== 1 ||
      dependencies["@shield/team-system:build"][0] !== "@shield/mission-preparation:build" ||
      dependencies["@shield/mission-preparation:build"]?.length !== 0 ||
      graph.tasks.roots?.length !== 1 || graph.tasks.roots[0] !== "@shield/mission-preparation:build") {
    throw new Error("task_graph_not_exact");
  }
}

async function ensureEmptyDirectory(fs, path) {
  if (!(await absent(fs, path))) throw new Error(`state_directory_exists:${path}`);
  await fs.mkdir(path, { recursive: true, mode: 0o700 });
  if ((await fs.readdir(path)).length !== 0) throw new Error(`state_directory_not_empty:${path}`);
}

async function buildManifest(fs, root, label) {
  const rootStats = await fs.lstat(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error(`${label}_dist_missing`);
  const entries = [];
  async function walk(directory, relativeDirectory) {
    const names = (await fs.readdir(directory)).sort();
    for (const name of names) {
      const absolute = join(directory, name);
      const childRelative = relativeDirectory === "" ? name : `${relativeDirectory}/${name}`;
      const child = await fs.lstat(absolute);
      if (child.isSymbolicLink()) throw new Error(`${label}_dist_symlink:${childRelative}`);
      if (child.isDirectory()) await walk(absolute, childRelative);
      else if (child.isFile()) {
        const bytes = await fs.readFile(absolute);
        entries.push({ path: childRelative, mode: child.mode & 0o777, size: child.size, sha256: sha256(bytes) });
      } else throw new Error(`${label}_dist_non_regular:${childRelative}`);
    }
  }
  await walk(root, "");
  if (entries.length === 0) throw new Error(`${label}_dist_empty`);
  return { entries, digest: sha256(Buffer.from(stableJson(entries))) };
}

function exactPreflightReport(report, context) {
  const topKeys = ["schemaVersion", "contractVersion", "authority", "disposition", "reasonCode", "repository", "package", "declarations", "trackedShieldPaths", "host", "worktreeState", "machineChecks", "hostConfirmations"];
  if (!exactObject(report, topKeys) || report.schemaVersion !== 1 || report.contractVersion !== "shield.teammate-readiness.v1" ||
      report.authority !== "none" || report.disposition !== "ready_for_host_confirmation" ||
      report.reasonCode !== "ready_for_host_confirmation" ||
      !exactObject(report.repository, ["root", "branch", "head", "expectedHead", "clean"]) ||
      report.repository.root !== context.input.root || report.repository.branch !== null ||
      report.repository.head !== context.input.expectedHead || report.repository.expectedHead !== context.input.expectedHead ||
      report.repository.clean !== true || !exactObject(report.package, ["name", "declaredVersion", "installedVersion"]) ||
      report.package.name !== "@shield/team-system" || report.package.declaredVersion !== report.package.installedVersion ||
      !Array.isArray(report.declarations) || !Array.isArray(report.trackedShieldPaths) || report.trackedShieldPaths.length !== 0 ||
      !exactObject(report.host, ["vscode", "openaiExtension", "codexCli"]) ||
      !exactObject(report.host.vscode, ["classification", "version", "build", "architecture"]) ||
      !exactObject(report.host.openaiExtension, ["classification", "identifier", "version"]) ||
      !exactObject(report.host.codexCli, ["classification", "source", "version", "executablePath"]) ||
      !exactObject(report.worktreeState, ["classification", "ok", "message", "receiptDigest"]) ||
      report.worktreeState.classification !== "uninitialized_worktree" || report.worktreeState.ok !== false ||
      typeof report.worktreeState.message !== "string" || report.worktreeState.receiptDigest !== null ||
      !Array.isArray(report.machineChecks) ||
      !Array.isArray(report.hostConfirmations) ||
      report.declarations.some((entry) => !exactObject(entry, ["source", "seat", "configFile", "name", "model", "reasoningEffort", "sandboxMode", "repositoryInstructions"])) ||
      report.machineChecks.some((entry) => !exactObject(entry, ["id", "status", "reasonCode", "nextAction"])) ||
      report.hostConfirmations.some((entry) => !exactObject(entry, ["id", "status"]) || entry.status !== "unverified")) {
    throw new Error("preflight_schema_or_identity_invalid");
  }
  return report;
}

async function installAndBuild(context) {
  const fs = context.dependencies.fs;
  const lockBytes = await fs.readFile(join(context.input.root, "package-lock.json"));
  const lockfile = JSON.parse(lockBytes.toString("utf8"));
  const packagePaths = lockfileInventory(lockfile);
  const dependenciesOnly = dependencyInventoryValidator(packagePaths);
  await runKnownChild(context, "npm", ["ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: context.input.root,
    env: closedEnvironment(),
    timeout: 120_000,
    maxOutput: MAX_OUTPUT,
  }, "dependencies_unavailable", dependenciesOnly);
  try { await repositorySnapshot(context, "dependencies", { allowedIgnored: dependenciesOnly, requireDistAbsent: true }); }
  catch (error) { throw new LaunchFailure("repository_drift", error.message); }

  const rootManifest = JSON.parse((await fs.readFile(join(context.input.root, "package.json"))).toString("utf8"));
  const nxLock = lockfile.packages?.["node_modules/nx"];
  const pinned = rootManifest.devDependencies?.nx;
  const nxPath = join(context.input.root, "node_modules/nx/dist/bin/nx.js");
  const nxStats = await fs.lstat(nxPath);
  if (typeof pinned !== "string" || pinned !== nxLock?.version || !/^\d+\.\d+\.\d+$/u.test(pinned) ||
      !nxStats.isFile() || nxStats.isSymbolicLink()) throw new LaunchFailure("build_unavailable", "pinned Nx identity is unavailable");

  const nxStateRoot = join(context.input.root, "node_modules/.cache/shield-teammate-launch-v1");
  const nxCache = join(nxStateRoot, "nx-cache");
  const nxWorkspaceData = join(nxStateRoot, "workspace-data");
  await ensureEmptyDirectory(fs, nxCache);
  await ensureEmptyDirectory(fs, nxWorkspaceData);
  const nxExtra = ["node_modules/.cache/shield-teammate-launch-v1"];
  const dependenciesAndNx = dependencyInventoryValidator(packagePaths, nxExtra);
  const nxEnvironment = closedEnvironment({
    NX_CACHE_DIRECTORY: nxCache,
    NX_CLOUD: "false",
    NX_DAEMON: "false",
    NX_SKIP_NX_CACHE: "true",
    NX_TASKS_RUNNER_DYNAMIC_OUTPUT: "false",
    NX_WORKSPACE_DATA_DIRECTORY: nxWorkspaceData,
  });
  const graphResult = await runKnownChild(context, process.execPath, [nxPath, "run", "@shield/team-system:build", "--graph=stdout"], {
    cwd: context.input.root, env: nxEnvironment, timeout: 60_000, maxOutput: MAX_OUTPUT,
  }, "build_unavailable", dependenciesAndNx);
  try { validateTaskGraph(parseJsonOutput(graphResult, "task_graph")); }
  catch (error) { throw new LaunchFailure("build_unavailable", error.message); }

  const distPrefixes = ["packages/mission-preparation/dist", "packages/shield-team-system/dist"];
  const builtInventory = dependencyInventoryValidator(packagePaths, [...nxExtra, ...distPrefixes]);
  await runKnownChild(context, process.execPath, [nxPath, "run", "@shield/team-system:build", "--skipNxCache"], {
    cwd: context.input.root, env: nxEnvironment, timeout: 120_000, maxOutput: MAX_OUTPUT,
  }, "build_unavailable", builtInventory);
  try { await repositorySnapshot(context, "build", { allowedIgnored: builtInventory }); }
  catch (error) { throw new LaunchFailure("repository_drift", error.message); }
  const missionPreparation = await buildManifest(fs, join(context.input.root, "packages/mission-preparation/dist"), "mission_preparation");
  const teamSystem = await buildManifest(fs, join(context.input.root, "packages/shield-team-system/dist"), "team_system");
  for (const required of [
    "packages/mission-preparation/dist/index.mjs",
    "packages/shield-team-system/dist/cli.mjs",
  ]) {
    const stats = await fs.lstat(join(context.input.root, ...required.split("/")));
    if (!stats.isFile() || stats.isSymbolicLink()) throw new LaunchFailure("build_unavailable", `required build output missing: ${required}`);
  }
  return { lockfileDigest: sha256(lockBytes), nxVersion: pinned, nxStateRoot, packagePaths, builtInventory, missionPreparation, teamSystem };
}

async function runPreflight(context) {
  const cli = join(context.input.root, "packages/shield-team-system/dist/cli.mjs");
  let result;
  try {
    result = await context.dependencies.runProcess(process.execPath, [
      cli, "teammate", "preflight", "--root", context.input.root,
      "--expected-head", context.input.expectedHead, "--json",
    ], {
      cwd: context.input.root,
      env: { ...process.env, NX_CLOUD: "false", NX_DAEMON: "false" },
      timeout: 30_000,
      maxOutput: MAX_OUTPUT,
    });
  } catch (error) {
    if (error instanceof ProcessUncertain) throw new LaunchFailure("recovery_required", error.message, "recovery_required");
    throw error;
  }
  if (result.state !== "success") {
    try { await reconcileKnownChildFailure(context, context.build.builtInventory); }
    catch { throw new LaunchFailure("recovery_required", "CLI post-state cannot be proven", "recovery_required"); }
    if (result.state === "exit") {
      try {
        const report = JSON.parse(result.stdout);
        if (report?.contractVersion === "shield.teammate-readiness.v1" && report?.authority === "none" &&
            report?.disposition === "action_required" && typeof report.reasonCode === "string") {
          throw new LaunchFailure("preflight_not_ready", report.reasonCode);
        }
      } catch (error) {
        if (error instanceof LaunchFailure) throw error;
      }
    }
    throw new LaunchFailure("cli_unavailable", `target CLI exited ${result.code ?? result.errorCode}`);
  }
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new LaunchFailure("cli_unavailable", "target CLI returned malformed JSON"); }
  try { exactPreflightReport(parsed, context); }
  catch (error) {
    if (parsed?.contractVersion === "shield.teammate-readiness.v1" && parsed?.authority === "none" && parsed?.disposition === "action_required") {
      throw new LaunchFailure("preflight_not_ready", `${parsed.reasonCode ?? "unknown"}`);
    }
    throw new LaunchFailure("cli_unavailable", error.message);
  }
  return { digest: sha256(Buffer.from(stableJson(parsed))), report: parsed };
}

async function finalProof(context) {
  await repositorySnapshot(context, "final", { allowedIgnored: context.build.builtInventory });
  const missionPreparation = await buildManifest(context.dependencies.fs, join(context.input.root, "packages/mission-preparation/dist"), "mission_preparation");
  const teamSystem = await buildManifest(context.dependencies.fs, join(context.input.root, "packages/shield-team-system/dist"), "team_system");
  if (missionPreparation.digest !== context.build.missionPreparation.digest || teamSystem.digest !== context.build.teamSystem.digest) {
    throw new Error("dist_manifest_drift");
  }
  await assertParentAndReceipt(context);
}

function repositoryId(origin) {
  const match = /(?:github\.com[/:])([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(origin);
  return match === null ? `git-origin-sha256:${sha256(Buffer.from(origin))}` : `${match[1]}/${match[2]}`;
}

function makeReceipt(context) {
  const teamPackagePath = join(context.input.root, "packages/shield-team-system/package.json");
  const cliPath = join(context.input.root, "packages/shield-team-system/dist/cli.mjs");
  return Promise.all([
    context.dependencies.fs.readFile(teamPackagePath),
    context.dependencies.fs.readFile(cliPath),
  ]).then(([packageBytes, cliBytes]) => {
    const body = {
      schemaVersion: 1,
      contractVersion: TEAMMATE_LAUNCH_CONTRACT_VERSION,
      repository: {
        id: repositoryId(context.source.origin),
        sourceRoot: context.source.root,
        sourceHead: context.source.sourceHead,
        expectedHead: context.input.expectedHead,
        observedHead: context.input.expectedHead,
        disposableRoot: context.input.root,
      },
      artifacts: {
        bootstrap: { path: context.input.bootstrapPath, sha256: context.artifacts.bootstrap.sha256 },
        reviewedPlan: {
          path: context.artifacts.metadata.reviewedPlanPath,
          commit: context.artifacts.metadata.reviewedPlanCommit,
          sha256: context.artifacts.plan.sha256,
        },
        prompt: { path: context.artifacts.promptPath, sha256: context.artifacts.prompt.sha256 },
      },
      target: {
        package: { name: "@shield/team-system", sha256: sha256(packageBytes) },
        cli: { path: "packages/shield-team-system/dist/cli.mjs", sha256: sha256(cliBytes) },
        nxVersion: context.build.nxVersion,
        lockfileSha256: context.build.lockfileDigest,
        missionPreparationDistManifestSha256: context.build.missionPreparation.digest,
        teamSystemDistManifestSha256: context.build.teamSystem.digest,
      },
      preflightReportSha256: context.preflight.digest,
      receipt: { path: context.destination.receiptPath },
    };
    return { ...body, receiptDigest: sha256(Buffer.from(stableJson(body))) };
  });
}

async function fsyncDirectory(fs, path) {
  const handle = await fs.open(path, "r");
  try { await handle.sync(); }
  finally { await handle.close(); }
}

async function publishReceipt(context, receipt) {
  const fs = context.dependencies.fs;
  const destination = context.destination.receiptPath;
  const nonce = randomBytes(12).toString("hex");
  const temporary = `${destination}.tmp-${process.pid}-${nonce}`;
  const reservation = `${destination}.lock`;
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  try {
    await assertParentAndReceipt(context);
    const temporaryHandle = await fs.open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try { await temporaryHandle.writeFile(bytes); await temporaryHandle.sync(); }
    finally { await temporaryHandle.close(); }
    const reservationHandle = await fs.open(reservation, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try { await reservationHandle.sync(); }
    finally { await reservationHandle.close(); }
    await assertParentAndReceipt(context);
    await fs.link(temporary, destination);
    await fs.unlink(temporary);
    await fs.unlink(reservation);
    await fsyncDirectory(fs, context.destination.parent);
    const observed = await fs.readFile(destination);
    if (!observed.equals(bytes)) throw new Error("receipt_readback_mismatch");
    const parsed = JSON.parse(observed.toString("utf8"));
    const { receiptDigest, ...body } = parsed;
    if (!HASH_64.test(receiptDigest) || receiptDigest !== sha256(Buffer.from(stableJson(body)))) throw new Error("receipt_digest_mismatch");
  } catch (error) { throw error; }
}

function publicationSafe(receipt) {
  const projected = JSON.parse(JSON.stringify(receipt));
  projected.repository.sourceRoot = "<SOURCE_ROOT>";
  projected.repository.disposableRoot = "<DISPOSABLE_ROOT>";
  projected.receipt.path = `<DISPOSABLE_ROOT>${RECEIPT_SUFFIX}`;
  return projected;
}

function failureResult(failure) {
  return {
    schemaVersion: 1,
    contractVersion: TEAMMATE_LAUNCH_CONTRACT_VERSION,
    authority: "none",
    disposition: failure.disposition,
    reasonCode: failure.reasonCode,
    nextAction: NEXT_ACTION[failure.reasonCode],
  };
}

export async function launchTeammateTrial(input, dependencies = createNativeDependencies()) {
  const context = { input, dependencies };
  try {
    validateInput(input);
    try { context.source = await resolveSource(context); }
    catch (error) { throw new LaunchFailure("source_unavailable", error.message); }
    try { await validateRevision(context); }
    catch (error) {
      if (error instanceof ProcessUncertain) throw new LaunchFailure("recovery_required", error.message, "recovery_required");
      throw new LaunchFailure("revision_unavailable", error.message);
    }
    context.artifacts = await validateArtifacts(context);
    try { context.destination = await validateDestination(context); }
    catch (error) { throw new LaunchFailure("destination_unsafe", error.message); }
    await createWorktree(context);
    try { await repositorySnapshot(context, "checkout", { requireDistAbsent: true }); await assertParentAndReceipt(context); }
    catch (error) { throw new LaunchFailure("checkout_mismatch", error.message); }
    context.build = await installAndBuild(context);
    context.preflight = await runPreflight(context);
    try { await finalProof(context); }
    catch (error) { throw new LaunchFailure("repository_drift", error.message); }
    const receipt = await makeReceipt(context);
    try { await publishReceipt(context, receipt); }
    catch (error) {
      const disposition = error instanceof ProcessUncertain ? "recovery_required" : "recovery_required";
      throw new LaunchFailure(error?.code === "EEXIST" ? "receipt_write_failed" : "receipt_write_failed", error.message, disposition);
    }
    return {
      schemaVersion: 1,
      contractVersion: TEAMMATE_LAUNCH_CONTRACT_VERSION,
      authority: "none",
      disposition: "ready_for_host_confirmation",
      reasonCode: "ready_for_host_confirmation",
      repository: {
        id: receipt.repository.id,
        expectedHead: input.expectedHead,
        observedHead: input.expectedHead,
        root: input.root,
      },
      artifacts: receipt.artifacts,
      receipt: { path: context.destination.receiptPath, digest: receipt.receiptDigest },
      publicationSafeReceipt: publicationSafe(receipt),
      nextAction: { executable: "code", arguments: ["--new-window", input.root], display: `code --new-window ${JSON.stringify(input.root)}` },
    };
  } catch (error) {
    if (error instanceof LaunchFailure) return failureResult(error);
    if (error instanceof ProcessUncertain) return failureResult(new LaunchFailure("recovery_required", error.message, "recovery_required"));
    return failureResult(new LaunchFailure("recovery_required", error instanceof Error ? error.message : String(error), "recovery_required"));
  }
}

function render(result) {
  if (result.disposition === "ready_for_host_confirmation") {
    return [
      `SHIELD teammate launch: ${result.disposition}; authority: ${result.authority}.`,
      `HEAD: ${result.repository.observedHead}`,
      `Receipt: ${result.receipt.path}`,
      `NEXT (operator-visible action; not executed): ${result.nextAction.display}`,
      "",
    ].join("\n");
  }
  return `SHIELD teammate launch: ${result.disposition} (${result.reasonCode}); authority: ${result.authority}.\nNEXT: ${result.nextAction}\n`;
}

async function main(argv) {
  let parsed;
  try { parsed = parseCli(argv); }
  catch (error) {
    const result = failureResult(error instanceof LaunchFailure ? error : new LaunchFailure("invalid_input"));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 2;
  }
  const result = await launchTeammateTrial(parsed.input);
  process.stdout.write(parsed.json ? `${JSON.stringify(result, null, 2)}\n` : render(result));
  if (result.disposition === "ready_for_host_confirmation") return 0;
  if (result.reasonCode === "invalid_input") return 2;
  return result.disposition === "recovery_required" ? 3 : 1;
}

let isMain = false;
try { isMain = import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href; }
catch { isMain = import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href; }
if (isMain) process.exitCode = await main(process.argv.slice(2));
