import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseShieldConfig, type DoctorWorktreeState } from "./config.mjs";
import { inspectWorktreeStateV1 } from "./worktree-state-v1.mjs";

export const TEAMMATE_READINESS_CONTRACT_VERSION = "shield.teammate-readiness.v1" as const;
export const TEAMMATE_READINESS_SEATS = Object.freeze(["hill", "daisy", "fury", "may", "mack"] as const);

const CHECK_IDS = [
  "input.closed",
  "repository.root",
  "repository.expected_head",
  "repository.clean",
  "repository.declarations",
  "repository.tracked_shield",
  "package.team_system",
  "host.vscode",
  "host.openai_extension",
  "host.codex_cli",
  "shield.worktree_state",
  "repository.stable",
] as const;
const GIT_CONTEXT_VARIABLES = ["GIT_COMMON_DIR", "GIT_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_WORK_TREE"] as const;

const NEXT_ACTION = Object.freeze({
  invalid_input: "Correct the invocation and supply one absolute --root and one lowercase 40-hex --expected-head.",
  repository_unavailable: "Select the accessible disposable clone root.",
  expected_head_mismatch: "Checkout the expected revision.",
  workspace_dirty: "Inspect and preserve or remove unexpected state.",
  declaration_invalid: "Repair the tracked declarations.",
  tracked_state_present: "Remove tracked runtime state.",
  package_unavailable: "Install the exact lockfile and rebuild.",
  host_probe_failed: "Repair or select the intended VS Code host, OpenAI extension, or Codex CLI named by the failed check.",
  unexpected_policy_state: "Remove copied policy or recreate the clone.",
  malformed_policy_state: "Remove malformed policy state or recreate the clone.",
  repository_drift: "Discard the report and rerun from a stable checkout.",
  not_observed: "Resolve the earlier gating check and rerun the complete preflight.",
  none: "No machine action is required for this check.",
} as const);

type SeatId = (typeof TEAMMATE_READINESS_SEATS)[number];
type CheckId = (typeof CHECK_IDS)[number];
type CheckStatus = "pass" | "fail" | "observed";
type FailureReason = Exclude<keyof typeof NEXT_ACTION, "none" | "not_observed">;
type ProbeClassification = "available" | "unavailable" | "malformed" | "timeout";

export interface TeammateReadinessCheckV1 {
  readonly id: CheckId;
  readonly status: CheckStatus;
  readonly reasonCode: keyof typeof NEXT_ACTION | "uninitialized_worktree";
  readonly nextAction: string;
}

export interface TeammateSeatDeclarationV1 {
  readonly source: "declared";
  readonly seat: SeatId;
  readonly configFile: string;
  readonly name: string;
  readonly model: string;
  readonly reasoningEffort: "low" | "medium" | "high" | "xhigh";
  readonly sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  readonly repositoryInstructions: "AGENTS.md";
}

interface RepositorySnapshotV1 {
  readonly root: string;
  readonly rootIdentity: string;
  readonly branch: string | null;
  readonly head: string;
  readonly porcelainV1: string;
  readonly trackedInventory: string;
}

export interface TeammateHostObservationV1 {
  readonly vscode: {
    readonly classification: ProbeClassification;
    readonly version: string | null;
    readonly build: string | null;
    readonly architecture: string | null;
  };
  readonly openaiExtension: {
    readonly classification: ProbeClassification;
    readonly identifier: "openai.chatgpt";
    readonly version: string | null;
  };
  readonly codexCli: {
    readonly classification: ProbeClassification;
    readonly source: "path" | "unavailable";
    readonly version: string | null;
    readonly executablePath: string | null;
  };
}

export interface TeammateReadinessReportV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof TEAMMATE_READINESS_CONTRACT_VERSION;
  readonly authority: "none";
  readonly disposition: "ready_for_host_confirmation" | "action_required";
  readonly reasonCode: "ready_for_host_confirmation" | FailureReason;
  readonly repository: {
    readonly root: string;
    readonly branch: string | null;
    readonly head: string | null;
    readonly expectedHead: string;
    readonly clean: boolean | null;
  };
  readonly package: {
    readonly name: "@shield/team-system";
    readonly declaredVersion: string | null;
    readonly installedVersion: string | null;
  };
  readonly declarations: readonly TeammateSeatDeclarationV1[];
  readonly trackedShieldPaths: readonly string[];
  readonly host: TeammateHostObservationV1;
  readonly worktreeState: DoctorWorktreeState | null;
  readonly machineChecks: readonly TeammateReadinessCheckV1[];
  readonly hostConfirmations: readonly { readonly id: string; readonly status: "unverified" }[];
}

export type FixedProbeResultV1 =
  | { readonly state: "success"; readonly stdout: string }
  | { readonly state: "unavailable" | "timeout" | "failed"; readonly stdout: "" };

export interface TeammateReadinessDependenciesV1 {
  readonly execute?: (executable: string, args: readonly string[]) => Promise<FixedProbeResultV1>;
  readonly findExecutable?: (name: "code" | "codex") => Promise<string | null>;
  readonly installedPackageIdentity?: () => Promise<{ readonly name: string; readonly version: string } | null>;
  readonly inspectWorktreeState?: (input: { readonly root: string; readonly configPresent: boolean; readonly configValid: boolean }) => Promise<DoctorWorktreeState>;
  readonly beforeFinalObservation?: () => Promise<void>;
}

const EMPTY_HOST: TeammateHostObservationV1 = Object.freeze({
  vscode: Object.freeze({ classification: "unavailable", version: null, build: null, architecture: null }),
  openaiExtension: Object.freeze({ classification: "unavailable", identifier: "openai.chatgpt", version: null }),
  codexCli: Object.freeze({ classification: "unavailable", source: "unavailable", version: null, executablePath: null }),
});

function check(id: CheckId, status: CheckStatus, reasonCode: TeammateReadinessCheckV1["reasonCode"]): TeammateReadinessCheckV1 {
  const nextAction = reasonCode === "host_probe_failed" && id === "host.vscode"
    ? "Repair or select the intended VS Code host."
    : reasonCode === "host_probe_failed" && id === "host.openai_extension"
      ? "Install or repair the intended OpenAI extension."
      : reasonCode === "host_probe_failed" && id === "host.codex_cli"
        ? "Repair the intended Codex CLI installation."
        : reasonCode === "uninitialized_worktree"
    ? "Complete the ordered host confirmations; this observation grants no authority."
    : NEXT_ACTION[reasonCode];
  return Object.freeze({ id, status, reasonCode, nextAction });
}

function notObservedChecks(from: number): TeammateReadinessCheckV1[] {
  return CHECK_IDS.slice(from).map((id) => check(id, "observed", "not_observed"));
}

function cleanGitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of GIT_CONTEXT_VARIABLES) delete environment[name];
  environment.GIT_OPTIONAL_LOCKS = "0";
  return environment;
}

function boundedExec(
  executable: string,
  args: readonly string[],
  timeout = 5_000,
  maxBuffer = 256 * 1024,
  environment?: NodeJS.ProcessEnv,
): Promise<FixedProbeResultV1> {
  return new Promise((completion) => {
    execFile(executable, [...args], { encoding: "utf8", timeout, maxBuffer, shell: false, ...(environment === undefined ? {} : { env: environment }) }, (error, stdout) => {
      if (error === null) return completion({ state: "success", stdout });
      const candidate = error as NodeJS.ErrnoException & { killed?: boolean };
      if (candidate.killed === true || candidate.code === "ETIMEDOUT") return completion({ state: "timeout", stdout: "" });
      if (candidate.code === "ENOENT" || candidate.code === "EACCES") return completion({ state: "unavailable", stdout: "" });
      return completion({ state: "failed", stdout: "" });
    });
  });
}

async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await boundedExec("git", ["-C", root, ...args], 5_000, 4 * 1024 * 1024, cleanGitEnvironment());
  if (result.state !== "success") throw new Error(`git_${result.state}`);
  return result.stdout;
}

async function captureRepository(rootArgument: string): Promise<RepositorySnapshotV1> {
  const canonical = await realpath(rootArgument);
  const stats = await lstat(canonical);
  if (!stats.isDirectory()) throw new Error("root_not_directory");
  await access(canonical, constants.R_OK | constants.X_OK);
  const top = (await git(canonical, ["rev-parse", "--show-toplevel"])).trim();
  if (resolve(top) !== canonical) throw new Error("not_worktree_root");
  const head = (await git(canonical, ["rev-parse", "--verify", "HEAD"])).trim();
  if (!/^[0-9a-f]{40}$/u.test(head)) throw new Error("invalid_head");
  const branchResult = await boundedExec("git", ["-C", canonical, "symbolic-ref", "--quiet", "--short", "HEAD"], 5_000, 256 * 1024, cleanGitEnvironment());
  if (branchResult.state !== "success" && branchResult.state !== "failed") throw new Error("branch_unavailable");
  const porcelainV1 = await git(canonical, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const trackedInventory = await git(canonical, ["ls-files", "-z"]);
  return Object.freeze({
    root: canonical,
    rootIdentity: `${String(stats.dev)}:${String(stats.ino)}`,
    branch: branchResult.state === "success" ? branchResult.stdout.trim() : null,
    head,
    porcelainV1,
    trackedInventory,
  });
}

function sameRepository(left: RepositorySnapshotV1, right: RepositorySnapshotV1): boolean {
  return left.root === right.root && left.rootIdentity === right.rootIdentity && left.branch === right.branch &&
    left.head === right.head && left.porcelainV1 === right.porcelainV1 && left.trackedInventory === right.trackedInventory;
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function parsePackageIdentity(bytes: string): { name: string; version: string } | null {
  try {
    const value: unknown = JSON.parse(bytes);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return typeof record.name === "string" && typeof record.version === "string" && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(record.version)
      ? { name: record.name, version: record.version }
      : null;
  } catch {
    return null;
  }
}

function singleQuotedField(bytes: string, field: string): string | null {
  const matches = [...bytes.matchAll(new RegExp(`^${field}\\s*=\\s*"([^"\\r\\n]+)"\\s*$`, "gmu"))];
  return matches.length === 1 ? matches[0]?.[1] ?? null : null;
}

function configAgentSections(bytes: string): Map<string, string> | null {
  const sections = [...bytes.matchAll(/^\[agents\.([^\]\r\n]+)\]\s*$/gmu)].map((match) => match[1] as string);
  if (sections.length !== TEAMMATE_READINESS_SEATS.length || sections.some((seat) => !TEAMMATE_READINESS_SEATS.includes(seat as SeatId)) || new Set(sections).size !== sections.length) return null;
  const result = new Map<string, string>();
  for (const seat of TEAMMATE_READINESS_SEATS) {
    const start = bytes.indexOf(`[agents.${seat}]`);
    if (start < 0) return null;
    const remainder = bytes.slice(start + `[agents.${seat}]`.length);
    const next = remainder.search(/^\[/mu);
    const section = next < 0 ? remainder : remainder.slice(0, next);
    const configFile = singleQuotedField(section, "config_file");
    const nicknames = [...section.matchAll(/^nickname_candidates\s*=\s*\["([^"\r\n]+)"\]\s*$/gmu)];
    if (configFile !== `agents/${seat}.toml` || nicknames.length !== 1 || nicknames[0]?.[1] !== seat) return null;
    result.set(seat, configFile);
  }
  return result;
}

function parseDeclarations(blobs: ReadonlyMap<string, string>, trackedPaths: readonly string[]): readonly TeammateSeatDeclarationV1[] | null {
  const cards = trackedPaths.filter((path) => path.startsWith(".codex/agents/") && path.endsWith(".toml"));
  const expectedCards = TEAMMATE_READINESS_SEATS.map((seat) => `.codex/agents/${seat}.toml`).sort();
  if (cards.sort().join("\0") !== expectedCards.join("\0")) return null;
  const agents = blobs.get("AGENTS.md");
  const config = blobs.get(".codex/config.toml");
  if (agents === undefined || agents.trim() === "" || config === undefined || configAgentSections(config) === null) return null;
  const declarations: TeammateSeatDeclarationV1[] = [];
  for (const seat of TEAMMATE_READINESS_SEATS) {
    const bytes = blobs.get(`.codex/agents/${seat}.toml`);
    if (bytes === undefined) return null;
    const name = singleQuotedField(bytes, "name");
    const model = singleQuotedField(bytes, "model");
    const reasoningEffort = singleQuotedField(bytes, "model_reasoning_effort");
    const sandboxMode = singleQuotedField(bytes, "sandbox_mode");
    if (name !== seat || model === null || !/^[a-z0-9][a-z0-9.-]+$/u.test(model) ||
      !["low", "medium", "high", "xhigh"].includes(reasoningEffort ?? "") ||
      !["read-only", "workspace-write", "danger-full-access"].includes(sandboxMode ?? "")) return null;
    declarations.push(Object.freeze({
      source: "declared",
      seat,
      configFile: `.codex/agents/${seat}.toml`,
      name,
      model,
      reasoningEffort: reasoningEffort as TeammateSeatDeclarationV1["reasoningEffort"],
      sandboxMode: sandboxMode as TeammateSeatDeclarationV1["sandboxMode"],
      repositoryInstructions: "AGENTS.md",
    }));
  }
  return Object.freeze(declarations);
}

async function expectedCommitMaterial(root: string, expectedHead: string): Promise<{
  declarations: readonly TeammateSeatDeclarationV1[] | null;
  trackedShieldPaths: readonly string[];
  trackedInventoryAvailable: boolean;
  packageIdentity: { name: string; version: string } | null;
}> {
  const tree = await git(root, ["ls-tree", "-r", "-z", "--name-only", expectedHead]).catch(() => null);
  const trackedPaths = tree === null ? [] : tree.split("\0").filter(Boolean);
  const declarationPaths = ["AGENTS.md", ".codex/config.toml", ...TEAMMATE_READINESS_SEATS.map((seat) => `.codex/agents/${seat}.toml`)];
  const blobs = new Map<string, string>();
  for (const path of declarationPaths) {
    const bytes = await git(root, ["show", `${expectedHead}:${path}`]).catch(() => null);
    if (bytes !== null) blobs.set(path, bytes);
  }
  const packageBytes = await git(root, ["show", `${expectedHead}:packages/shield-team-system/package.json`]).catch(() => null);
  return {
    declarations: tree === null ? null : parseDeclarations(blobs, trackedPaths),
    trackedShieldPaths: Object.freeze(trackedPaths.filter((path) => path === ".shield" || path.startsWith(".shield/"))),
    trackedInventoryAvailable: tree !== null,
    packageIdentity: packageBytes === null ? null : parsePackageIdentity(packageBytes),
  };
}

async function defaultFindExecutable(name: "code" | "codex"): Promise<string | null> {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory === "") continue;
    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      const canonical = await realpath(candidate);
      if (isAbsolute(canonical)) return canonical;
    } catch {
      // Continue through the fixed PATH lookup.
    }
  }
  return null;
}

function commandClassification(result: FixedProbeResultV1): Exclude<ProbeClassification, "available" | "malformed"> {
  return result.state === "timeout" ? "timeout" : "unavailable";
}

export async function probeTeammateHostV1(dependencies: Pick<TeammateReadinessDependenciesV1, "execute" | "findExecutable"> = {}): Promise<TeammateHostObservationV1> {
  const execute = dependencies.execute ?? ((executable, args) => boundedExec(executable, args));
  const findExecutable = dependencies.findExecutable ?? defaultFindExecutable;
  const codePath = await findExecutable("code");
  let vscode: TeammateHostObservationV1["vscode"] = { classification: "unavailable", version: null, build: null, architecture: null };
  let openaiExtension: TeammateHostObservationV1["openaiExtension"] = { classification: "unavailable", identifier: "openai.chatgpt", version: null };
  if (codePath !== null) {
    const versionResult = await execute(codePath, ["--version"]);
    if (versionResult.state === "success") {
      const lines = versionResult.stdout.trim().split(/\r?\n/u);
      vscode = lines.length === 3 && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(lines[0] ?? "") &&
        /^[0-9a-f]{40}$/u.test(lines[1] ?? "") && /^(?:arm64|armhf|x64)$/u.test(lines[2] ?? "")
        ? { classification: "available", version: lines[0] as string, build: lines[1] as string, architecture: lines[2] as string }
        : { classification: "malformed", version: null, build: null, architecture: null };
    } else vscode = { classification: commandClassification(versionResult), version: null, build: null, architecture: null };

    const extensionResult = await execute(codePath, ["--list-extensions", "--show-versions"]);
    if (extensionResult.state === "success") {
      const matches = extensionResult.stdout.split(/\r?\n/u).filter((line) => line.startsWith("openai.chatgpt@"));
      const version = matches.length === 1 ? matches[0]?.slice("openai.chatgpt@".length) ?? "" : "";
      openaiExtension = matches.length === 1 && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(version)
        ? { classification: "available", identifier: "openai.chatgpt", version }
        : { classification: "malformed", identifier: "openai.chatgpt", version: null };
    } else openaiExtension = { classification: commandClassification(extensionResult), identifier: "openai.chatgpt", version: null };
  }

  const codexPath = await findExecutable("codex");
  let codexCli: TeammateHostObservationV1["codexCli"] = { classification: "unavailable", source: "unavailable", version: null, executablePath: null };
  if (codexPath !== null) {
    const result = await execute(codexPath, ["--version"]);
    if (result.state === "success") {
      const match = /^codex-cli ([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\r?\n?$/u.exec(result.stdout);
      codexCli = match === null
        ? { classification: "malformed", source: "path", version: null, executablePath: codexPath }
        : { classification: "available", source: "path", version: match[1] as string, executablePath: codexPath };
    } else codexCli = { classification: commandClassification(result), source: "path", version: null, executablePath: codexPath };
  }
  return Object.freeze({ vscode: Object.freeze(vscode), openaiExtension: Object.freeze(openaiExtension), codexCli: Object.freeze(codexCli) });
}

async function defaultInstalledPackageIdentity(): Promise<{ name: string; version: string } | null> {
  try {
    return parsePackageIdentity(await readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
  } catch {
    return null;
  }
}

async function currentWorktreeState(root: string, inspect: NonNullable<TeammateReadinessDependenciesV1["inspectWorktreeState"]>): Promise<DoctorWorktreeState> {
  const path = join(root, ".shield", "config.json");
  let configPresent = false;
  let configValid = false;
  try {
    const stats = await lstat(path);
    configPresent = true;
    if (stats.isFile() && !stats.isSymbolicLink()) configValid = parseShieldConfig(await readFile(path, "utf8")).state === "valid";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") configPresent = true;
  }
  return inspect({ root, configPresent, configValid });
}

function hostConfirmations(): readonly { readonly id: string; readonly status: "unverified" }[] {
  const ids = ["host.agents_window_rendered", "host.account_entitlement"];
  for (const seat of TEAMMATE_READINESS_SEATS) {
    for (const field of ["identity", "model", "reasoning_effort", "sandbox_mode", "repository_instructions", "mcp_inventory", "agent_creation"]) {
      ids.push(`host.seat.${seat}.${field}`);
    }
  }
  return Object.freeze(ids.map((id) => Object.freeze({ id, status: "unverified" as const })));
}

function disposition(checks: readonly TeammateReadinessCheckV1[]): TeammateReadinessReportV1["reasonCode"] {
  const reason = (id: CheckId): FailureReason | null => {
    const entry = checks.find((candidate) => candidate.id === id);
    return entry?.status === "fail" ? entry.reasonCode as FailureReason : null;
  };
  return reason("input.closed") ?? reason("repository.root") ?? reason("repository.expected_head") ??
    reason("repository.stable") ?? reason("repository.clean") ?? reason("repository.declarations") ??
    reason("repository.tracked_shield") ?? reason("package.team_system") ?? reason("host.vscode") ??
    reason("host.openai_extension") ?? reason("host.codex_cli") ?? reason("shield.worktree_state") ??
    "ready_for_host_confirmation";
}

export async function runTeammateReadinessPreflightV1(
  input: { readonly root: string; readonly expectedHead: string },
  dependencies: TeammateReadinessDependenciesV1 = {},
): Promise<TeammateReadinessReportV1> {
  const checks: TeammateReadinessCheckV1[] = [];
  const inputValid = exactObject(input, ["root", "expectedHead"]) && typeof input.root === "string" && isAbsolute(input.root) &&
    typeof input.expectedHead === "string" && /^[0-9a-f]{40}$/u.test(input.expectedHead);
  checks.push(check("input.closed", inputValid ? "pass" : "fail", inputValid ? "none" : "invalid_input"));
  if (!inputValid) {
    checks.push(...notObservedChecks(1));
    return Object.freeze({
      schemaVersion: 1, contractVersion: TEAMMATE_READINESS_CONTRACT_VERSION, authority: "none",
      disposition: "action_required", reasonCode: "invalid_input",
      repository: { root: typeof input.root === "string" ? input.root : "", branch: null, head: null, expectedHead: typeof input.expectedHead === "string" ? input.expectedHead : "", clean: null },
      package: { name: "@shield/team-system" as const, declaredVersion: null, installedVersion: null }, declarations: [], trackedShieldPaths: [],
      host: EMPTY_HOST, worktreeState: null, machineChecks: Object.freeze(checks), hostConfirmations: hostConfirmations(),
    });
  }

  let initial: RepositorySnapshotV1;
  try {
    initial = await captureRepository(input.root);
    checks.push(check("repository.root", "pass", "none"));
  } catch {
    checks.push(check("repository.root", "fail", "repository_unavailable"), ...notObservedChecks(2));
    return Object.freeze({
      schemaVersion: 1, contractVersion: TEAMMATE_READINESS_CONTRACT_VERSION, authority: "none", disposition: "action_required", reasonCode: "repository_unavailable",
      repository: { root: input.root, branch: null, head: null, expectedHead: input.expectedHead, clean: null },
      package: { name: "@shield/team-system" as const, declaredVersion: null, installedVersion: null }, declarations: [], trackedShieldPaths: [], host: EMPTY_HOST,
      worktreeState: null, machineChecks: Object.freeze(checks), hostConfirmations: hostConfirmations(),
    });
  }

  const expectedMatches = initial.head === input.expectedHead;
  checks.push(check("repository.expected_head", expectedMatches ? "pass" : "fail", expectedMatches ? "none" : "expected_head_mismatch"));
  if (!expectedMatches) {
    checks.push(...notObservedChecks(3));
    return Object.freeze({
      schemaVersion: 1, contractVersion: TEAMMATE_READINESS_CONTRACT_VERSION, authority: "none", disposition: "action_required", reasonCode: "expected_head_mismatch",
      repository: { root: initial.root, branch: initial.branch, head: initial.head, expectedHead: input.expectedHead, clean: initial.porcelainV1 === "" },
      package: { name: "@shield/team-system" as const, declaredVersion: null, installedVersion: null }, declarations: [], trackedShieldPaths: [], host: EMPTY_HOST,
      worktreeState: null, machineChecks: Object.freeze(checks), hostConfirmations: hostConfirmations(),
    });
  }

  const material = await expectedCommitMaterial(initial.root, input.expectedHead);
  const installed = await (dependencies.installedPackageIdentity ?? defaultInstalledPackageIdentity)();
  const host = await probeTeammateHostV1(dependencies);
  const worktreeState = await currentWorktreeState(initial.root, dependencies.inspectWorktreeState ?? inspectWorktreeStateV1);
  await dependencies.beforeFinalObservation?.();
  let final: RepositorySnapshotV1 | null = null;
  try { final = await captureRepository(input.root); } catch { /* The final observation is a drift failure. */ }

  checks.push(check("repository.clean", initial.porcelainV1 === "" ? "pass" : "fail", initial.porcelainV1 === "" ? "none" : "workspace_dirty"));
  checks.push(check("repository.declarations", material.declarations !== null ? "pass" : "fail", material.declarations !== null ? "none" : "declaration_invalid"));
  const trackedShieldReady = material.trackedInventoryAvailable && material.trackedShieldPaths.length === 0;
  checks.push(check("repository.tracked_shield", trackedShieldReady ? "pass" : "fail", trackedShieldReady ? "none" : "tracked_state_present"));
  const packageReady = material.packageIdentity?.name === "@shield/team-system" && installed?.name === material.packageIdentity.name && installed.version === material.packageIdentity.version;
  checks.push(check("package.team_system", packageReady ? "pass" : "fail", packageReady ? "none" : "package_unavailable"));
  checks.push(check("host.vscode", host.vscode.classification === "available" ? "pass" : "fail", host.vscode.classification === "available" ? "none" : "host_probe_failed"));
  checks.push(check("host.openai_extension", host.openaiExtension.classification === "available" ? "pass" : "fail", host.openaiExtension.classification === "available" ? "none" : "host_probe_failed"));
  checks.push(check("host.codex_cli", host.codexCli.classification === "available" ? "pass" : "fail", host.codexCli.classification === "available" ? "none" : "host_probe_failed"));
  const worktreeReason = worktreeState.classification === "uninitialized_worktree" ? "uninitialized_worktree" :
    worktreeState.classification === "stale_or_malformed_worktree_state" ? "malformed_policy_state" : "unexpected_policy_state";
  checks.push(check("shield.worktree_state", worktreeState.classification === "uninitialized_worktree" ? "observed" : "fail", worktreeReason));
  checks.push(check("repository.stable", final !== null && sameRepository(initial, final) ? "pass" : "fail", final !== null && sameRepository(initial, final) ? "none" : "repository_drift"));
  const reasonCode = disposition(checks);
  return Object.freeze({
    schemaVersion: 1, contractVersion: TEAMMATE_READINESS_CONTRACT_VERSION, authority: "none",
    disposition: reasonCode === "ready_for_host_confirmation" ? "ready_for_host_confirmation" : "action_required", reasonCode,
    repository: { root: initial.root, branch: initial.branch, head: initial.head, expectedHead: input.expectedHead, clean: initial.porcelainV1 === "" },
    package: { name: "@shield/team-system" as const, declaredVersion: material.packageIdentity?.version ?? null, installedVersion: installed?.version ?? null },
    declarations: material.declarations ?? [], trackedShieldPaths: material.trackedShieldPaths, host, worktreeState,
    machineChecks: Object.freeze(checks), hostConfirmations: hostConfirmations(),
  });
}

export function projectTeammateReadinessForPublicationV1(report: TeammateReadinessReportV1): unknown {
  return Object.freeze({
    ...report,
    repository: Object.freeze({ ...report.repository, root: "<DISPOSABLE_ROOT>" }),
    host: Object.freeze({
      vscode: report.host.vscode,
      openaiExtension: report.host.openaiExtension,
      codexCli: Object.freeze({
        classification: report.host.codexCli.classification,
        source: report.host.codexCli.source,
        version: report.host.codexCli.version,
        extensionIdentifier: report.host.openaiExtension.identifier,
        extensionVersion: report.host.openaiExtension.version,
      }),
    }),
  });
}
