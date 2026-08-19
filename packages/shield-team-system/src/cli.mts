#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, link, lstat, mkdir, open, readFile, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  REPOSITORY_TRUST_PROFILE_IDS,
  CONFIGURED_HOST_ADAPTER_IDS,
  SHIELD_PACKAGE_VERSION,
  createShieldConfig,
  composeCopilotDoctorReportV1,
  evaluateDoctor,
  formatShieldConfig,
  migrateShieldConfig,
  parseShieldConfig,
  type ConfiguredHostAdapterId,
  type RepositoryTrustProfileId,
  type ShieldConfig,
  type ShieldConfigV1,
  type ShieldConfigV2,
  type ShieldConfigV3,
  type DoctorReportV2,
  type CopilotDoctorReportV1,
} from "./config.mjs";
import {
  STARTER_PIPELINE_IDS,
  createStarterPipelineSelectionV1,
  validateStarterPipelineId,
  type StarterPipelineId,
} from "./pipeline-starter-v1.mjs";
import { MissionCliError, missionUsage, runMissionCli } from "./mission-cli.mjs";
import { GuidedReviewCliError, guidedReviewUsage, runGuidedReviewCli } from "./guided-review-cli-v1.mjs";
import {
  inspectWorktreeStateV1,
  prepareWorktreeStateV1,
  worktreePreparationIsReadyV1,
  type WorktreePreparationResultV1,
} from "./worktree-state-v1.mjs";
import {
  runTeammateReadinessPreflightV1,
  type TeammateReadinessReportV1,
} from "./teammate-readiness-v1.mjs";
import {
  runCopilotTeammateReadinessPreflightV1,
  type CopilotTeammateReadinessReportV1,
} from "./copilot-teammate-readiness-v1.mjs";
import { probeCopilotFuryDispatchCapabilityV1 } from "./copilot-fury-plan-dispatch-v1.mjs";

const CONFIG_RELATIVE_PATH = join(".shield", "config.json");
const PIPELINE_PROFILE_RELATIVE_PATH = join(".shield", "pipeline-profile.json");
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
    `  shield init --repository-id <owner/name> --coulson-binding-ref <ref> [--repository-trust-profile <${REPOSITORY_TRUST_PROFILE_IDS.join("|")}>] [--fitz-binding-ref <ref>] [--simmons-binding-ref <ref>] [--adapters <${CONFIGURED_HOST_ADAPTER_IDS.join(",")}>] [--migrate-config] [--starter-pipeline <${STARTER_PIPELINE_IDS.join("|")}>] [--root <path>]`,
    "  shield doctor [--root <path>] [--host github-copilot] [--json]",
    "  shield worktree prepare --source-root <path> --root <destination> [--json]",
    "  shield teammate preflight --root <absolute-path> --expected-head <40-lowercase-hex> [--host github-copilot] [--json]",
    "",
    guidedReviewUsage(),
    "",
    missionUsage(),
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

function semanticJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(semanticJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${semanticJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function semanticConfigJson(config: ShieldConfig): string {
  return semanticJson({
    ...config,
    supportedSeatIds: [...config.supportedSeatIds].sort(),
    supportedModeIds: [...config.supportedModeIds].sort(),
    trustedHumanBindingRefs: [...config.trustedHumanBindingRefs]
      .sort((left, right) => left.seatId.localeCompare(right.seatId) || left.bindingRef.localeCompare(right.bindingRef)),
  });
}

function configuredAdaptersOption(value: string | undefined): ConfiguredHostAdapterId[] {
  if (value === undefined) return ["github"];
  const entries = value.split(",");
  if (entries.length === 0 || entries.some((entry) => entry.length === 0 || entry.trim() !== entry)) {
    throw new CliError("--adapters must be a non-empty normalized comma-separated list.");
  }
  const seen = new Set<string>();
  let previous = -1;
  for (const entry of entries) {
    if (!CONFIGURED_HOST_ADAPTER_IDS.includes(entry as ConfiguredHostAdapterId)) {
      throw new CliError(`Unsupported configured host adapter: ${entry}.`);
    }
    if (seen.has(entry)) throw new CliError("--adapters must contain unique adapters.");
    const registryIndex = CONFIGURED_HOST_ADAPTER_IDS.indexOf(entry as ConfiguredHostAdapterId);
    if (registryIndex <= previous) {
      throw new CliError("--adapters must follow the frozen configured-host registry order.");
    }
    seen.add(entry);
    previous = registryIndex;
  }
  return entries as ConfiguredHostAdapterId[];
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

async function repositoryRootIssue(root: string, options: { allowMissingPackage?: boolean } = {}): Promise<string | null> {
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
  } catch (error) {
    if (options.allowMissingPackage && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
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

async function readPackageScripts(root: string): Promise<Record<string, string>> {
  const manifestPath = join(root, "package.json");
  let manifestText: string;
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const manifest = JSON.parse(manifestText) as {
    scripts?: unknown;
  };
  if (manifest.scripts === undefined || manifest.scripts === null || typeof manifest.scripts !== "object" || Array.isArray(manifest.scripts)) {
    return {};
  }
  const scripts: Record<string, string> = {};
  for (const [name, value] of Object.entries(manifest.scripts)) {
    if (typeof value === "string" && value.trim().length > 0) {
      scripts[name] = value;
    }
  }
  return scripts;
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

type ConfigMigrationFileHandle = Pick<
  Awaited<ReturnType<typeof open>>,
  "chmod" | "close" | "read" | "stat" | "sync" | "write"
>;

export interface ConfigMigrationOperations {
  open(path: string, flags: number, mode?: number): Promise<ConfigMigrationFileHandle>;
  lstat(path: string): ReturnType<typeof lstat>;
  readdir(path: string): Promise<string[]>;
  rename(source: string, destination: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface ConfigMigrationDependencies {
  nonce?: () => string;
  operations?: Partial<ConfigMigrationOperations>;
}

const DEFAULT_CONFIG_MIGRATION_OPERATIONS: ConfigMigrationOperations = {
  open: async (path, flags, mode) => open(path, flags, mode),
  lstat,
  readdir: async (path) => readdir(path),
  rename,
  unlink,
};

function sameIdentity(left: { dev: number | bigint; ino: number | bigint }, right: { dev: number | bigint; ino: number | bigint }): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function fileMode(stats: { mode: number | bigint }): number {
  return typeof stats.mode === "bigint" ? Number(stats.mode & 0o7777n) : stats.mode & 0o7777;
}

async function exactHandleBytes(handle: ConfigMigrationFileHandle, size: number): Promise<Buffer> {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const result = await handle.read(bytes, offset, size - offset, offset);
    if (result.bytesRead === 0) throw new Error("File read was incomplete.");
    offset += result.bytesRead;
  }
  return bytes;
}

async function syncDirectory(path: string, operations: ConfigMigrationOperations): Promise<void> {
  const handle = await operations.open(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
  try { await handle.sync(); } finally { await handle.close(); }
}

async function pathIdentity(
  path: string,
  expected: { dev: number | bigint; ino: number | bigint; mode: number },
  operations: ConfigMigrationOperations,
): Promise<boolean> {
  const stats = await operations.lstat(path);
  return !stats.isSymbolicLink() && stats.isFile() && sameIdentity(stats, expected) && fileMode(stats) === expected.mode;
}

async function absent(path: string, operations: ConfigMigrationOperations): Promise<boolean> {
  try { await operations.lstat(path); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
}

async function configMigrationRecoveryIssue(
  configPath: string,
  operations: ConfigMigrationOperations = DEFAULT_CONFIG_MIGRATION_OPERATIONS,
): Promise<string | null> {
  const parent = dirname(configPath);
  const tempPrefix = `.${basename(configPath)}.migrate-`;
  const siblings = await operations.readdir(parent);
  if (siblings.some((name) => name.startsWith(tempPrefix) && name.endsWith(".tmp"))) {
    return "recovery_required: orphaned configuration migration temporary state requires identity-safe operator recovery.";
  }
  if (!await absent(`${configPath}.migrate.lock`, operations)) {
    return "recovery_required: configuration migration lock or conflicting state is present.";
  }
  return null;
}

export async function migrateConfigFile(
  configPath: string,
  expectedOriginalBytes: string,
  expectedLegacy: ShieldConfigV1 | ShieldConfigV2,
  candidate: ShieldConfigV3,
  dependencies: ConfigMigrationDependencies = {},
): Promise<void> {
  const nonce = dependencies.nonce ?? (() => randomBytes(16).toString("hex"));
  const operations: ConfigMigrationOperations = {
    ...DEFAULT_CONFIG_MIGRATION_OPERATIONS,
    ...dependencies.operations,
  };
  const parent = dirname(configPath);
  const lockPath = `${configPath}.migrate.lock`;
  const tempPrefix = `.${basename(configPath)}.migrate-`;
  let tempPath: string | null = null;
  let lockHandle: ConfigMigrationFileHandle | null = null;
  let sourceHandle: ConfigMigrationFileHandle | null = null;
  let tempHandle: ConfigMigrationFileHandle | null = null;
  let installedHandle: ConfigMigrationFileHandle | null = null;
  let lockIdentity: { dev: number | bigint; ino: number | bigint; mode: number } | null = null;
  let tempIdentity: { dev: number | bigint; ino: number | bigint; mode: number } | null = null;
  let sourceIdentity: { dev: number | bigint; ino: number | bigint; mode: number } | null = null;
  let renameAttempted = false;
  let recoveryRequired = false;
  let operationError: unknown;
  const lockToken = `shield-config-migration:v1:${nonce()}\n`;
  let lockExpectedBytes = "";
  const candidateBytes = formatShieldConfig(candidate);

  try {
    const recoveryIssue = await configMigrationRecoveryIssue(configPath, operations);
    if (recoveryIssue !== null) throw new CliError(recoveryIssue);

    lockHandle = await operations.open(lockPath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await lockHandle.chmod(0o600);
    const lockStats = await lockHandle.stat();
    lockIdentity = { dev: lockStats.dev, ino: lockStats.ino, mode: 0o600 };
    const lockWrite = await lockHandle.write(Buffer.from(lockToken), 0, Buffer.byteLength(lockToken), 0);
    if (lockWrite.bytesWritten !== Buffer.byteLength(lockToken)) throw new Error("Migration lock write was incomplete.");
    lockExpectedBytes = lockToken;
    await lockHandle.sync();
    await syncDirectory(parent, operations);
    if (!await pathIdentity(lockPath, lockIdentity, operations) ||
        (await lockHandle.stat()).size !== Buffer.byteLength(lockToken) ||
        !(await exactHandleBytes(lockHandle, Buffer.byteLength(lockToken))).equals(Buffer.from(lockToken))) {
      throw new Error("Migration lock identity or marker is invalid.");
    }

    sourceHandle = await operations.open(configPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const sourceStats = await sourceHandle.stat();
    if (!sourceStats.isFile()) throw new Error("Configuration source is not a regular file.");
    sourceIdentity = { dev: sourceStats.dev, ino: sourceStats.ino, mode: fileMode(sourceStats) };
    if (!await pathIdentity(configPath, sourceIdentity, operations)) throw new Error("Configuration source identity changed.");
    const sourceBytes = await exactHandleBytes(sourceHandle, Number(sourceStats.size));
    if (!sourceBytes.equals(Buffer.from(expectedOriginalBytes))) throw new Error("Configuration source bytes changed.");
    const reparsed = parseShieldConfig(sourceBytes.toString("utf8"));
    if (reparsed.state === "invalid" || reparsed.value.schemaVersion === 3 ||
        semanticConfigJson(reparsed.value) !== semanticConfigJson(expectedLegacy)) {
      throw new Error("Configuration source meaning changed.");
    }

    const generatedNonce = nonce();
    if (!/^[a-f0-9]{16,128}$/u.test(generatedNonce)) throw new Error("Configuration migration nonce is invalid.");
    tempPath = join(parent, `${tempPrefix}${generatedNonce}.tmp`);
    tempHandle = await operations.open(tempPath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await tempHandle.chmod(0o600);
    const initialTempStats = await tempHandle.stat();
    tempIdentity = { dev: initialTempStats.dev, ino: initialTempStats.ino, mode: 0o600 };
    if (!await pathIdentity(tempPath, tempIdentity, operations)) throw new Error("Migration temporary identity is invalid.");
    const candidateBuffer = Buffer.from(candidateBytes);
    const tempWrite = await tempHandle.write(candidateBuffer, 0, candidateBuffer.length, 0);
    if (tempWrite.bytesWritten !== candidateBuffer.length) throw new Error("Migration temporary write was incomplete.");
    await tempHandle.sync();
    if ((await tempHandle.stat()).size !== candidateBuffer.length) throw new Error("Migration temporary size is not exact.");
    const written = await exactHandleBytes(tempHandle, candidateBuffer.length);
    if (!written.equals(candidateBuffer)) throw new Error("Migration temporary readback is not exact.");
    await tempHandle.chmod(sourceIdentity.mode);
    tempIdentity.mode = sourceIdentity.mode;
    await tempHandle.sync();
    if (!await pathIdentity(tempPath, tempIdentity, operations) || fileMode(await tempHandle.stat()) !== sourceIdentity.mode) {
      throw new Error("Migration temporary mode restoration failed.");
    }

    if ((await sourceHandle.stat()).size !== sourceBytes.length ||
        !(await exactHandleBytes(sourceHandle, sourceBytes.length)).equals(sourceBytes) ||
        !await pathIdentity(configPath, sourceIdentity, operations)) {
      throw new Error("Configuration source changed before replacement.");
    }
    if ((await lockHandle.stat()).size !== Buffer.byteLength(lockToken)) throw new Error("Migration lock marker size changed before replacement.");
    const lockBytes = await exactHandleBytes(lockHandle, Buffer.byteLength(lockToken));
    if (!lockBytes.equals(Buffer.from(lockToken)) || !await pathIdentity(lockPath, lockIdentity, operations)) {
      throw new Error("Migration lock marker or path changed before replacement.");
    }

    renameAttempted = true;
    await operations.rename(tempPath, configPath);
    await syncDirectory(parent, operations);
    installedHandle = await operations.open(configPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const installedBytes = await exactHandleBytes(installedHandle, candidateBuffer.length);
    const installedStats = await installedHandle.stat();
    const installed = parseShieldConfig(installedBytes.toString("utf8"));
    if (!installedStats.isFile() || !sameIdentity(installedStats, tempIdentity) ||
        fileMode(installedStats) !== tempIdentity.mode || installedStats.size !== candidateBuffer.length ||
        !installedBytes.equals(candidateBuffer) || !await pathIdentity(configPath, tempIdentity, operations) ||
        installed.state === "invalid" ||
        semanticConfigJson(installed.value) !== semanticConfigJson(candidate)) {
      throw new Error("Installed configuration identity, readback, or meaning is not exact.");
    }
  } catch (error) {
    operationError = error;
    recoveryRequired = renameAttempted || (error instanceof CliError && error.message.startsWith("recovery_required:"));
  }

  if (tempHandle !== null && tempIdentity === null) recoveryRequired = true;
  if (lockHandle !== null && lockIdentity === null) recoveryRequired = true;
  if (installedHandle !== null) {
    try { await installedHandle.close(); } catch { recoveryRequired = true; }
    installedHandle = null;
  }
  if (tempHandle !== null) {
    try { await tempHandle.close(); } catch { recoveryRequired = true; }
    tempHandle = null;
  }
  if (!renameAttempted && tempPath !== null && tempIdentity !== null) {
    try {
      if (!await pathIdentity(tempPath, tempIdentity, operations)) throw new Error("Temporary identity changed during cleanup.");
      await operations.unlink(tempPath);
      if (!await absent(tempPath, operations)) throw new Error("Temporary cleanup could not be verified.");
    } catch { recoveryRequired = true; }
  } else if (!renameAttempted && tempPath !== null && tempHandle === null && tempIdentity === null) {
    try { if (!await absent(tempPath, operations)) recoveryRequired = true; } catch { recoveryRequired = true; }
  }
  if (sourceHandle !== null) {
    try { await sourceHandle.close(); } catch { recoveryRequired = true; }
  }
  if (lockHandle !== null && lockIdentity !== null) {
    try {
      if ((await lockHandle.stat()).size !== Buffer.byteLength(lockExpectedBytes) ||
          !(await exactHandleBytes(lockHandle, Buffer.byteLength(lockExpectedBytes))).equals(Buffer.from(lockExpectedBytes)) ||
          !await pathIdentity(lockPath, lockIdentity, operations)) {
        throw new Error("Migration lock identity changed during release.");
      }
      await lockHandle.close();
      lockHandle = null;
      if (!await pathIdentity(lockPath, lockIdentity, operations)) throw new Error("Migration lock path changed during release.");
      await operations.unlink(lockPath);
      if (!await absent(lockPath, operations)) throw new Error("Migration lock release could not be verified.");
      await syncDirectory(parent, operations);
    } catch { recoveryRequired = true; }
  }
  if (lockHandle !== null) {
    try { await lockHandle.close(); } catch { recoveryRequired = true; }
  }

  if (recoveryRequired) {
    const classification = operationError instanceof CliError && operationError.message.startsWith("recovery_required:")
      ? operationError.message
      : "recovery_required: configuration migration state is uncertain";
    throw new CliError(`${classification}; do not retry blindly.`);
  }
  if (operationError !== undefined) {
    throw new CliError(`Configuration migration failed before rename; original preserved: ${operationError instanceof Error ? operationError.message : String(operationError)}`);
  }
}

async function runInit(args: string[]): Promise<number> {
  const options = parseOptions(args, [
    "--root",
    "--repository-id",
    "--repository-trust-profile",
    "--coulson-binding-ref",
    "--fitz-binding-ref",
    "--simmons-binding-ref",
    "--adapters",
    "--starter-pipeline",
  ], ["--migrate-config"]);
  const adapterIds = configuredAdaptersOption(options.values.get("--adapters"));
  const starterPipelineId = options.values.get("--starter-pipeline");
  if (starterPipelineId !== undefined && !validateStarterPipelineId(starterPipelineId)) {
    throw new CliError(`Unsupported starter pipeline: ${starterPipelineId}.`);
  }
  const repositoryTrustProfileId = options.values.get("--repository-trust-profile") ?? "signed_human_gates";
  if (!REPOSITORY_TRUST_PROFILE_IDS.includes(repositoryTrustProfileId as RepositoryTrustProfileId)) {
    throw new CliError(`Unsupported repository trust profile: ${repositoryTrustProfileId}.`);
  }
  if (repositoryTrustProfileId === "coulson_only_platform_review" &&
      (options.values.has("--fitz-binding-ref") || options.values.has("--simmons-binding-ref"))) {
    throw new CliError("Repository trust profile coulson_only_platform_review rejects --fitz-binding-ref and --simmons-binding-ref.");
  }
  const root = await inspectRoot(options.values.get("--root"), true);
  const rootIssue = await repositoryRootIssue(root, { allowMissingPackage: starterPipelineId !== undefined });
  if (rootIssue !== null) throw new CliError(rootIssue);
  const config = createShieldConfig({
    repositoryId: required(options, "--repository-id"),
    adapterIds,
    repositoryTrustProfileId: repositoryTrustProfileId as RepositoryTrustProfileId,
    coulsonBindingRef: required(options, "--coulson-binding-ref"),
    ...(repositoryTrustProfileId === "signed_human_gates"
      ? { fitzBindingRef: required(options, "--fitz-binding-ref") }
      : {}),
    ...(options.values.has("--simmons-binding-ref")
      ? { simmonsBindingRef: options.values.get("--simmons-binding-ref") as string }
      : {}),
  });
  const configContent = formatShieldConfig(config);
  const shieldDirectory = join(root, ".shield");
  const configPath = join(root, CONFIG_RELATIVE_PATH);
  const pipelineProfilePath = join(root, PIPELINE_PROFILE_RELATIVE_PATH);
  const ignorePath = join(root, IGNORE_RELATIVE_PATH);

  const shieldExists = await inspectDirectory(shieldDirectory);
  const configState = await inspectTarget(configPath);
  const pipelineProfileState = starterPipelineId !== undefined ? await inspectTarget(pipelineProfilePath) : { exists: false };
  const ignoreState = await inspectTarget(ignorePath);
  let legacyMigration: { bytes: string; config: ShieldConfigV1 | ShieldConfigV2 } | null = null;
  if (configState.exists) {
    const existing = parseShieldConfig(configState.content);
    if (existing.state === "invalid") {
      throw new CliError(`Existing configuration differs; refusing to overwrite: ${configPath}.`);
    }
    if (options.flags.has("--migrate-config") && existing.value.schemaVersion === 3) {
      const recoveryIssue = await configMigrationRecoveryIssue(configPath);
      if (recoveryIssue !== null) throw new CliError(`${recoveryIssue} Do not retry blindly.`);
    }
    if (existing.value.schemaVersion === 1 || existing.value.schemaVersion === 2) {
      const migrated = migrateShieldConfig(existing.value);
      if (semanticConfigJson(migrated) !== semanticConfigJson(config)) {
        throw new CliError(`Existing schema-${existing.value.schemaVersion} configuration differs from the requested migration; refusing to overwrite: ${configPath}.`);
      }
      legacyMigration = { bytes: configState.content as string, config: existing.value };
      if (starterPipelineId === undefined) {
        if (ignoreState.exists && ignoreState.content !== IGNORE_CONTENT) {
          throw new CliError(`Existing SHIELD ignore file differs; refusing to overwrite: ${ignorePath}.`);
        }
        if (!options.flags.has("--migrate-config")) {
          process.stdout.write(`SHIELD schema-${existing.value.schemaVersion} configuration is already initialized; no files changed.\n`);
          return 0;
        }
      }
    } else if (semanticConfigJson(existing.value) !== semanticConfigJson(config)) {
      throw new CliError(`Existing configuration differs; refusing to overwrite: ${configPath}.`);
    }
  }
  if (ignoreState.exists && ignoreState.content !== IGNORE_CONTENT) {
    throw new CliError(`Existing SHIELD ignore file differs; refusing to overwrite: ${ignorePath}.`);
  }
  let pipelineProfileContent: string | null = null;
  let starterHasNoSupportedLanes = false;
  if (starterPipelineId !== undefined) {
    const packageScripts = await readPackageScripts(root);
    const starterSelection = createStarterPipelineSelectionV1({
      repositoryId: config.repositoryId,
      starterPipelineId: starterPipelineId as StarterPipelineId,
      packageScripts,
      discoveredAt: new Date(0).toISOString(),
    });
    pipelineProfileContent = `${JSON.stringify(starterSelection.profile, null, 2)}\n`;
    if (pipelineProfileState.exists && pipelineProfileState.content !== pipelineProfileContent) {
      throw new CliError(`Existing starter pipeline profile differs; refusing to overwrite: ${pipelineProfilePath}.`);
    }
    starterHasNoSupportedLanes = starterSelection.profile.supported.length === 0;
  }
  if (!shieldExists) await mkdir(shieldDirectory);
  let migrated = false;
  if (legacyMigration !== null && options.flags.has("--migrate-config")) {
    await migrateConfigFile(configPath, legacyMigration.bytes, legacyMigration.config, config);
    migrated = true;
  }
  if (starterPipelineId !== undefined) {
    if (pipelineProfileContent === null) throw new CliError("Starter pipeline preflight was not completed.");
    if (!pipelineProfileState.exists && starterHasNoSupportedLanes) {
      process.stdout.write(
        `Starter pipeline ${starterPipelineId} selected, but no matching package scripts were discovered; lanes were recorded as unavailable.\n`,
      );
    }
    if (!pipelineProfileState.exists) {
      await createFileWithoutOverwrite(pipelineProfilePath, pipelineProfileContent);
    }
  }
  const created: string[] = [];
  if (!ignoreState.exists) {
    await createFileWithoutOverwrite(ignorePath, IGNORE_CONTENT);
    created.push(IGNORE_RELATIVE_PATH);
  }
  if (!configState.exists) {
    await createFileWithoutOverwrite(configPath, configContent);
    created.push(CONFIG_RELATIVE_PATH);
  }
  if (starterPipelineId !== undefined && !pipelineProfileState.exists) {
    created.push(PIPELINE_PROFILE_RELATIVE_PATH);
  }
  if (created.length === 0 && !migrated) {
    process.stdout.write("SHIELD is already initialized; no files changed.\n");
  } else if (created.length === 0) {
    process.stdout.write(`Migrated SHIELD configuration: ${CONFIG_RELATIVE_PATH}\n`);
  } else if (migrated) {
    process.stdout.write(`Migrated SHIELD configuration and initialized: ${created.join(", ")}\n`);
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

function renderDoctor(report: DoctorReportV2): string {
  const lines = report.checks.map((entry) => {
    const suffix = "adapterId" in entry ? ` [${entry.adapterId ?? "unclassified"}]` : "";
    return `${entry.ok ? "PASS" : "FAIL"} ${entry.id}${suffix}: ${entry.message}`;
  });
  lines.push(`${report.worktreeState.ok ? "PASS" : "FAIL"} worktree-state [${report.worktreeState.classification}]: ${report.worktreeState.message}`);
  lines.push(report.ok ? "SHIELD doctor: healthy." : "SHIELD doctor: action required.");
  return `${lines.join("\n")}\n`;
}

function renderCopilotDoctor(report: CopilotDoctorReportV1): string {
  return `${renderDoctor(report.doctor)}${report.hostCapability.disposition === "ready" ? "PASS" : "FAIL"} host-capability [github-copilot]: ${report.hostCapability.reasonCode}; NEXT: ${report.hostCapability.nextAction}\n${report.ok ? "SHIELD doctor host selection: healthy." : "SHIELD doctor host selection: action required."}\n`;
}

async function runDoctor(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--host"], ["--json"]);
  const host = options.values.get("--host");
  if (host !== undefined && host !== "github-copilot") throw new CliError(`Unsupported doctor host: ${host}.`);
  const root = await inspectRoot(options.values.get("--root"), false);
  const rootIssue = await repositoryRootIssue(root);
  const shieldDirectory = join(root, ".shield");
  const configPath = join(root, CONFIG_RELATIVE_PATH);
  let configState: TargetState = { exists: false };
  let configFilesystemUnsafe = false;
  try {
    await inspectDirectory(shieldDirectory);
    configState = await inspectTarget(configPath);
  } catch {
    configFilesystemUnsafe = true;
  }
  const parsed = configState.exists ? parseShieldConfig(configState.content) : null;
  let rawConfig: unknown;
  if (configState.exists && parsed?.state === "invalid") {
    try { rawConfig = JSON.parse(configState.content as string) as unknown; }
    catch { rawConfig = undefined; }
  }
  const report = evaluateDoctor({
    repositoryRootReady: rootIssue === null,
    ...(rootIssue === null ? {} : { repositoryRootIssue: rootIssue }),
    packageVersion: await installedPackageVersion(),
    configPresent: configState.exists || configFilesystemUnsafe,
    ...(parsed?.state === "valid"
      ? { config: parsed.value }
      : parsed?.state === "invalid" && rawConfig !== undefined
        ? { config: rawConfig }
        : {}),
    worktreeState: await inspectWorktreeStateV1({
      root,
      configPresent: configState.exists || configFilesystemUnsafe,
      configValid: parsed?.state === "valid",
    }),
  });
  if (parsed?.state === "invalid" && parsed.issues[0]?.code === "invalid_json") {
    const schema = report.checks.find(({ id }) => id === "config-schema");
    if (schema !== undefined) {
      schema.ok = false;
      schema.message = parsed.issues[0]?.message ?? "Configuration is invalid.";
      report.ok = false;
    }
  }
  if (host === "github-copilot") {
    let expectedHead = "0".repeat(40);
    try {
      const observed = await execFileAsync("git", ["rev-parse", "--verify", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        env: cleanGitEnvironment(),
      });
      const candidate = observed.stdout.trim();
      if (/^[0-9a-f]{40}$/u.test(candidate)) expectedHead = candidate;
    } catch { /* The capability reports repository unavailability. */ }
    const selected = composeCopilotDoctorReportV1(
      report,
      await probeCopilotFuryDispatchCapabilityV1({ repositoryRoot: root, expectedHead }),
    );
    process.stdout.write(options.flags.has("--json") ? `${JSON.stringify(selected, null, 2)}\n` : renderCopilotDoctor(selected));
    return selected.ok ? 0 : 1;
  }
  process.stdout.write(options.flags.has("--json") ? `${JSON.stringify(report, null, 2)}\n` : renderDoctor(report));
  return report.ok ? 0 : 1;
}

function renderWorktreePreparation(result: WorktreePreparationResultV1): string {
  if (!worktreePreparationIsReadyV1(result)) {
    return `${result.state.toUpperCase()}: ${result.reasonCode}\n${result.summary}\nNEXT: ${result.nextAction}\n`;
  }
  const receipt = result.receipt;
  return [
    result.state === "ready" ? "READY" : "ALREADY PREPARED",
    `Destination: ${receipt.destination.root}`,
    `Repository: ${receipt.repositoryId}`,
    `Branch: ${receipt.destination.branch ?? "detached"}`,
    `HEAD: ${receipt.destination.head}`,
    `Receipt: ${receipt.receiptDigest}`,
    "",
  ].join("\n");
}

async function runWorktree(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand !== "prepare") throw new CliError(`Unsupported worktree command: ${subcommand ?? "missing"}.\n${usage()}`);
  const options = parseOptions(rest, ["--source-root", "--root"], ["--json"]);
  const sourceRoot = required(options, "--source-root");
  const destinationRoot = required(options, "--root");
  const result = await prepareWorktreeStateV1({ sourceRoot, destinationRoot });
  process.stdout.write(options.flags.has("--json")
    ? `${JSON.stringify(result, null, 2)}\n`
    : renderWorktreePreparation(result));
  return worktreePreparationIsReadyV1(result) ? 0 : 1;
}

function renderTeammateReadiness(report: TeammateReadinessReportV1 | CopilotTeammateReadinessReportV1): string {
  const lines = [
    `SHIELD teammate preflight: ${report.disposition} (${report.reasonCode}); authority: ${report.authority}.`,
    ...report.machineChecks.map((entry) =>
      `${entry.status.toUpperCase()} ${entry.id}: ${entry.reasonCode}${entry.status === "pass" ? "" : `; NEXT: ${entry.nextAction}`}`
    ),
    `Host confirmations: ${report.hostConfirmations.length} ordered items remain unverified.`,
  ];
  return `${lines.join("\n")}\n`;
}

async function runTeammate(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand !== "preflight") throw new CliError(`Unsupported teammate command: ${subcommand ?? "missing"}.\n${usage()}`);
  const options = parseOptions(rest, ["--root", "--expected-head", "--host"], ["--json"]);
  const root = required(options, "--root");
  const expectedHead = required(options, "--expected-head");
  const host = options.values.get("--host");
  if (host !== undefined && host !== "github-copilot") throw new CliError(`Unsupported teammate host: ${host}.`);
  const report = host === "github-copilot"
    ? await runCopilotTeammateReadinessPreflightV1({ root, expectedHead })
    : await runTeammateReadinessPreflightV1({ root, expectedHead });
  process.stdout.write(options.flags.has("--json") ? `${JSON.stringify(report, null, 2)}\n` : renderTeammateReadiness(report));
  return report.reasonCode === "invalid_input" ? 2 : report.disposition === "ready_for_host_confirmation" ? 0 : 1;
}

export async function runCli(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (command === undefined || command === "--help" || command === "help") {
    process.stdout.write(`${usage()}\n`);
    return command === undefined ? 2 : 0;
  }
  if (command === "init") return runInit(rest);
  if (command === "doctor") return runDoctor(rest);
  if (command === "worktree") return runWorktree(rest);
  if (command === "teammate") return runTeammate(rest);
  if (command === "guided-review") return runGuidedReviewCli(rest);
  if (command === "mission" || command === "evidence" || command === "delegation") return runMissionCli([command, ...rest]);
  throw new CliError(`Unsupported command: ${command}.\n${usage()}`);
}

let cliIsMain = false;
if (process.argv[1] !== undefined) {
  try { cliIsMain = fileURLToPath(import.meta.url) === await realpath(resolve(process.argv[1])); }
  catch { cliIsMain = import.meta.url === pathToFileURL(resolve(process.argv[1])).href; }
}
if (cliIsMain) {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`SHIELD: ${message}\n`);
    process.exitCode = error instanceof CliError || error instanceof MissionCliError || error instanceof GuidedReviewCliError ? error.exitCode : 2;
  }
}

export { SHIELD_PACKAGE_VERSION };
