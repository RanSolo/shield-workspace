#!/usr/bin/env node

import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, link, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  SHIELD_PACKAGE_VERSION,
  createShieldConfig,
  evaluateDoctor,
  formatShieldConfig,
  parseShieldConfig,
  type DoctorReport,
} from "./config.mjs";

const CONFIG_RELATIVE_PATH = join(".shield", "config.json");
const IGNORE_RELATIVE_PATH = join(".shield", ".gitignore");
const IGNORE_CONTENT = "/journals/\n/reports/\n/tmp/\n";
const execFileAsync = promisify(execFile);
const GIT_CONTEXT_VARIABLES = [
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_WORK_TREE",
] as const;

class CliError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message);
  }
}

interface ParsedOptions {
  values: Map<string, string>;
  flags: Set<string>;
}

interface TargetState {
  exists: boolean;
  content?: string;
}

function cleanGitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of GIT_CONTEXT_VARIABLES) delete environment[name];
  return environment;
}

function usage(): string {
  return [
    "Usage:",
    "  shield init --repository-id <owner/name> --coulson-binding-ref <ref> --fitz-binding-ref <ref> [--simmons-binding-ref <ref>] [--root <path>]",
    "  shield doctor [--root <path>] [--json]",
    "",
    "V0.3-3 supports only init and doctor.",
  ].join("\n");
}

function parseOptions(
  args: string[],
  valueNames: readonly string[],
  flagNames: readonly string[] = [],
): ParsedOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const allowedValues = new Set(valueNames);
  const allowedFlags = new Set(flagNames);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (allowedFlags.has(name)) {
      if (flags.has(name)) throw new CliError(`Duplicate option: ${name}.`);
      flags.add(name);
      continue;
    }
    if (!allowedValues.has(name)) throw new CliError(`Unknown option: ${name}.`);
    if (values.has(name)) throw new CliError(`Duplicate option: ${name}.`);
    const value = args[++index];
    if (value === undefined || value.startsWith("--")) {
      throw new CliError(`${name} requires a value.`);
    }
    values.set(name, value);
  }
  return { values, flags };
}

function required(options: ParsedOptions, name: string): string {
  const value = options.values.get(name);
  if (value === undefined || value.trim() === "") throw new CliError(`Missing required option: ${name}.`);
  return value;
}

async function inspectRoot(rootArgument: string | undefined, writable: boolean): Promise<string> {
  const root = resolve(rootArgument ?? process.cwd());
  let stats;
  try {
    stats = await lstat(root);
  } catch {
    throw new CliError(`Repository root does not exist: ${root}.`);
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new CliError(`Repository root must be a real directory, not a symlink: ${root}.`);
  }
  try {
    await access(root, writable ? constants.R_OK | constants.W_OK : constants.R_OK);
  } catch {
    throw new CliError(
      writable
        ? `Repository root is not readable and writable: ${root}.`
        : `Repository root is not readable: ${root}.`,
    );
  }
  return root;
}

async function repositoryRootIssue(root: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: root,
      encoding: "utf8",
      env: cleanGitEnvironment(),
    });
    if (resolve(stdout.trim()) !== root) {
      return `Selected root is not the Git worktree root: ${root}.`;
    }
  } catch {
    return `Repository root is not an accessible Git worktree: ${root}.`;
  }

  const manifestPath = join(root, "package.json");
  try {
    const stats = await lstat(manifestPath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return `Repository root requires a regular package.json: ${manifestPath}.`;
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
      return `Repository package.json must contain a JSON object: ${manifestPath}.`;
    }
  } catch {
    return `Repository root is missing a readable, parseable package.json: ${manifestPath}.`;
  }
  return null;
}

async function inspectDirectory(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new CliError(`Expected a real directory, not a symlink: ${path}.`);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function inspectTarget(path: string): Promise<TargetState> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new CliError(`Expected a regular file, not a symlink: ${path}.`);
    }
    return { exists: true, content: await readFile(path, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
    throw error;
  }
}

async function createFileWithoutOverwrite(path: string, content: string): Promise<void> {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.shield-${process.pid}.tmp`,
  );
  try {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o644 });
    await link(temporary, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CliError(`Target changed during initialization; nothing was overwritten: ${path}.`);
    }
    throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function runInit(args: string[]): Promise<number> {
  const options = parseOptions(args, [
    "--root",
    "--repository-id",
    "--coulson-binding-ref",
    "--fitz-binding-ref",
    "--simmons-binding-ref",
  ]);
  const root = await inspectRoot(options.values.get("--root"), true);
  const rootIssue = await repositoryRootIssue(root);
  if (rootIssue !== null) throw new CliError(rootIssue);
  const config = createShieldConfig({
    repositoryId: required(options, "--repository-id"),
    coulsonBindingRef: required(options, "--coulson-binding-ref"),
    fitzBindingRef: required(options, "--fitz-binding-ref"),
    ...(options.values.has("--simmons-binding-ref")
      ? { simmonsBindingRef: options.values.get("--simmons-binding-ref") as string }
      : {}),
  });
  const configContent = formatShieldConfig(config);
  const shieldDirectory = join(root, ".shield");
  const configPath = join(root, CONFIG_RELATIVE_PATH);
  const ignorePath = join(root, IGNORE_RELATIVE_PATH);

  const shieldExists = await inspectDirectory(shieldDirectory);
  const configState = await inspectTarget(configPath);
  const ignoreState = await inspectTarget(ignorePath);
  if (configState.exists && configState.content !== configContent) {
    throw new CliError(`Existing configuration differs; refusing to overwrite: ${configPath}.`);
  }
  if (ignoreState.exists && ignoreState.content !== IGNORE_CONTENT) {
    throw new CliError(`Existing SHIELD ignore file differs; refusing to overwrite: ${ignorePath}.`);
  }

  if (!shieldExists) await mkdir(shieldDirectory);
  const created: string[] = [];
  if (!ignoreState.exists) {
    await createFileWithoutOverwrite(ignorePath, IGNORE_CONTENT);
    created.push(IGNORE_RELATIVE_PATH);
  }
  if (!configState.exists) {
    await createFileWithoutOverwrite(configPath, configContent);
    created.push(CONFIG_RELATIVE_PATH);
  }
  if (created.length === 0) {
    process.stdout.write("SHIELD is already initialized; no files changed.\n");
  } else {
    process.stdout.write(`Initialized SHIELD: ${created.join(", ")}\n`);
  }
  return 0;
}

async function installedPackageVersion(): Promise<string | null> {
  try {
    const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
    const manifest = JSON.parse(await readFile(packagePath, "utf8")) as { version?: unknown };
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch {
    return null;
  }
}

function renderDoctor(report: DoctorReport): string {
  const lines = report.checks.map(({ id, ok, message }) => `${ok ? "PASS" : "FAIL"} ${id}: ${message}`);
  lines.push(report.ok ? "SHIELD doctor: healthy." : "SHIELD doctor: action required.");
  return `${lines.join("\n")}\n`;
}

async function runDoctor(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root"], ["--json"]);
  const root = await inspectRoot(options.values.get("--root"), false);
  const rootIssue = await repositoryRootIssue(root);
  const shieldDirectory = join(root, ".shield");
  const configPath = join(root, CONFIG_RELATIVE_PATH);
  await inspectDirectory(shieldDirectory);
  const configState = await inspectTarget(configPath);
  const parsed = configState.exists ? parseShieldConfig(configState.content) : null;
  const report = evaluateDoctor({
    repositoryRootReady: rootIssue === null,
    ...(rootIssue === null ? {} : { repositoryRootIssue: rootIssue }),
    packageVersion: await installedPackageVersion(),
    configPresent: configState.exists,
    ...(parsed?.state === "valid" ? { config: parsed.value } : parsed ? { config: {} } : {}),
  });
  if (parsed?.state === "invalid") {
    const schema = report.checks.find(({ id }) => id === "config-schema");
    if (schema !== undefined) {
      schema.ok = false;
      schema.message = parsed.issues[0]?.message ?? "Configuration is invalid.";
      report.ok = false;
    }
  }
  process.stdout.write(options.flags.has("--json")
    ? `${JSON.stringify(report, null, 2)}\n`
    : renderDoctor(report));
  return report.ok ? 0 : 1;
}

export async function runCli(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (command === undefined || command === "--help" || command === "help") {
    process.stdout.write(`${usage()}\n`);
    return command === undefined ? 2 : 0;
  }
  if (command === "init") return runInit(rest);
  if (command === "doctor") return runDoctor(rest);
  throw new CliError(`Unsupported command: ${command}.\n${usage()}`);
}

try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`SHIELD: ${message}\n`);
  process.exitCode = error instanceof CliError ? error.exitCode : 2;
}

export { SHIELD_PACKAGE_VERSION };
