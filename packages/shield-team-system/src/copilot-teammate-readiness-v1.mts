import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, realpath } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";

import {
  parseCopilotAgentCardV1,
  probeCopilotFuryDispatchCapabilityV1,
  type CopilotAgentCardV1,
  type CopilotAgentHandoffV1,
  type CopilotFuryDispatchCapabilityReportV1,
} from "./copilot-fury-plan-dispatch-v1.mjs";
import { validateAndProjectCopilotFuryDispatchCapabilityReportV1 } from "./config.mjs";

export { parseCopilotAgentCardV1, type CopilotAgentCardV1, type CopilotAgentHandoffV1 };

export const COPILOT_TEAMMATE_READINESS_CONTRACT_VERSION = "shield.copilot-teammate-readiness.v1" as const;
export const COPILOT_TEAMMATE_ADAPTER_KIND = "github-copilot" as const;
export const COPILOT_TEAMMATE_SEATS = Object.freeze(["hill", "daisy", "fury", "may", "mack"] as const);
export const COPILOT_AGENT_PATHS = Object.freeze(
  COPILOT_TEAMMATE_SEATS.map((seat) => `.github/agents/${seat}.agent.md`),
);

type CopilotSeatId = (typeof COPILOT_TEAMMATE_SEATS)[number];
type ProbeClassification = "available" | "unavailable" | "malformed" | "timeout";

export interface CopilotTeammateReadinessReportV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof COPILOT_TEAMMATE_READINESS_CONTRACT_VERSION;
  readonly authority: "none";
  readonly adapter: { readonly kind: typeof COPILOT_TEAMMATE_ADAPTER_KIND };
  readonly disposition: "ready_for_host_confirmation" | "action_required";
  readonly reasonCode: string;
  readonly repository: {
    readonly root: string;
    readonly branch: string | null;
    readonly head: string | null;
    readonly expectedHead: string;
    readonly clean: boolean | null;
  };
  readonly agents: readonly {
    readonly seat: CopilotSeatId;
    readonly name: string;
    readonly path: string;
    readonly sha256: string;
    readonly model: "host-selected";
  }[];
  readonly host: {
    readonly vscode: { readonly classification: ProbeClassification; readonly version: string | null; readonly build: string | null; readonly architecture: string | null };
    readonly copilotExtension: { readonly classification: ProbeClassification; readonly identifier: "github.copilot-chat"; readonly version: string | null };
    readonly entitlement: { readonly status: "unverified" };
  };
  readonly machineChecks: readonly { readonly id: string; readonly status: "pass" | "fail" | "observed"; readonly reasonCode: string; readonly nextAction: string }[];
  readonly hostConfirmations: readonly { readonly id: string; readonly status: "unverified" }[];
}

export type CopilotFixedProbeResultV1 =
  | { readonly state: "success"; readonly stdout: string }
  | { readonly state: "unavailable" | "timeout" | "failed"; readonly stdout: "" };

export interface CopilotTeammateReadinessDependenciesV1 {
  readonly execute?: (executable: string, args: readonly string[]) => Promise<CopilotFixedProbeResultV1>;
  readonly findExecutable?: (name: "code") => Promise<string | null>;
  readonly beforeFinalObservation?: () => Promise<void>;
  readonly probeFuryDispatchCapability?: (
    input: { readonly repositoryRoot: string; readonly expectedHead: string },
  ) => Promise<unknown>;
}

const REQUIRED_KEYS = Object.freeze([
  "name", "description", "argument-hint", "target", "user-invocable",
  "disable-model-invocation", "tools",
]);
const EXPECTED_NAMES = Object.freeze(["Hill", "Daisy", "Fury", "May", "Mack"]);
const EXPECTED_TOOLS = Object.freeze({
  hill: Object.freeze(["read", "search", "web", "agent"]),
  daisy: Object.freeze(["read", "search", "web"]),
  fury: Object.freeze(["read", "search", "web"]),
  may: Object.freeze(["read", "search", "web", "edit", "execute"]),
  mack: Object.freeze(["read", "search", "execute"]),
} satisfies Record<CopilotSeatId, readonly string[]>);
const SPECIALIST_NAMES = Object.freeze(["Daisy", "Fury", "May", "Mack"]);
const HOST_FIELDS = Object.freeze(["identity", "selected_model", "tools", "instructions", "creation"]);
const GIT_CONTEXT_VARIABLES = Object.freeze(["GIT_COMMON_DIR", "GIT_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_WORK_TREE"]);

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

export function validateCopilotAgentSetV1(
  blobs: ReadonlyMap<string, string>,
): readonly { readonly seat: CopilotSeatId; readonly name: string; readonly path: string; readonly sha256: string; readonly model: "host-selected" }[] {
  if (blobs.size !== COPILOT_AGENT_PATHS.length || COPILOT_AGENT_PATHS.some((path) => !blobs.has(path))) throw new Error("copilot_agent_inventory_invalid");
  const cards = new Map<string, CopilotAgentCardV1>();
  for (const path of COPILOT_AGENT_PATHS) cards.set(path, parseCopilotAgentCardV1(blobs.get(path) as string));
  const names = new Map<string, string>();
  const result: { seat: CopilotSeatId; name: string; path: string; sha256: string; model: "host-selected" }[] = [];
  COPILOT_TEAMMATE_SEATS.forEach((seat, index) => {
    const path = COPILOT_AGENT_PATHS[index] as string;
    const text = blobs.get(path) as string;
    const card = cards.get(path) as CopilotAgentCardV1;
    const frontmatter = card.frontmatter;
    const allowedKeys = seat === "hill" ? [...REQUIRED_KEYS, "agents", "handoffs"] : REQUIRED_KEYS;
    if (!exactObject(frontmatter, allowedKeys) || frontmatter.name !== EXPECTED_NAMES[index] || frontmatter.target !== "vscode" ||
        frontmatter["user-invocable"] !== true || frontmatter["disable-model-invocation"] !== (seat !== "hill") ||
        frontmatter.tools.join("\0") !== EXPECTED_TOOLS[seat].join("\0") || Object.hasOwn(frontmatter, "model")) {
      throw new Error("copilot_agent_contract_invalid");
    }
    if (names.has(frontmatter.name)) throw new Error("copilot_agent_name_duplicate");
    names.set(frontmatter.name, path);
    result.push({ seat, name: frontmatter.name, path, sha256: createHash("sha256").update(text).digest("hex"), model: "host-selected" });
  });
  const hill = cards.get(COPILOT_AGENT_PATHS[0] as string)?.frontmatter;
  if (hill?.agents?.join("\0") !== SPECIALIST_NAMES.join("\0") || hill.handoffs?.length !== SPECIALIST_NAMES.length ||
      hill.handoffs.some((handoff, index) => handoff.agent !== SPECIALIST_NAMES[index] || handoff.send !== false || !names.has(handoff.agent))) {
    throw new Error("copilot_agent_routes_invalid");
  }
  return Object.freeze(result.map((entry) => Object.freeze(entry)));
}

function cleanGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  for (const name of GIT_CONTEXT_VARIABLES) delete environment[name];
  return environment;
}

function boundedExec(executable: string, args: readonly string[], environment?: NodeJS.ProcessEnv): Promise<CopilotFixedProbeResultV1> {
  return new Promise((completion) => {
    execFile(executable, [...args], { encoding: "utf8", timeout: 5_000, maxBuffer: 4 * 1024 * 1024, shell: false, ...(environment === undefined ? {} : { env: environment }) }, (error, stdout) => {
      if (error === null) return completion({ state: "success", stdout });
      const candidate = error as NodeJS.ErrnoException & { killed?: boolean };
      if (candidate.killed === true || candidate.code === "ETIMEDOUT") return completion({ state: "timeout", stdout: "" });
      if (candidate.code === "ENOENT" || candidate.code === "EACCES") return completion({ state: "unavailable", stdout: "" });
      return completion({ state: "failed", stdout: "" });
    });
  });
}

async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await boundedExec("git", ["-C", root, ...args], cleanGitEnvironment());
  if (result.state !== "success") throw new Error(`git_${result.state}`);
  return result.stdout;
}

interface RepositorySnapshot {
  readonly root: string;
  readonly identity: string;
  readonly branch: string | null;
  readonly head: string;
  readonly status: string;
  readonly inventory: string;
}

async function captureRepository(rootArgument: string): Promise<RepositorySnapshot> {
  const root = await realpath(rootArgument);
  const stats = await lstat(root);
  if (!stats.isDirectory()) throw new Error("repository_root_invalid");
  await access(root, constants.R_OK | constants.X_OK);
  if (resolve((await git(root, ["rev-parse", "--show-toplevel"])).trim()) !== root) throw new Error("repository_root_invalid");
  const head = (await git(root, ["rev-parse", "--verify", "HEAD"])).trim();
  if (!/^[0-9a-f]{40}$/u.test(head)) throw new Error("repository_head_invalid");
  const branchResult = await boundedExec("git", ["-C", root, "symbolic-ref", "--quiet", "--short", "HEAD"], cleanGitEnvironment());
  if (branchResult.state !== "success" && branchResult.state !== "failed") throw new Error("repository_branch_invalid");
  return Object.freeze({
    root,
    identity: `${String(stats.dev)}:${String(stats.ino)}`,
    branch: branchResult.state === "success" ? branchResult.stdout.trim() : null,
    head,
    status: await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    inventory: await git(root, ["ls-files", "-z"]),
  });
}

async function expectedAgentBlobs(root: string, expectedHead: string): Promise<ReadonlyMap<string, string>> {
  const inventory = (await git(root, ["ls-tree", "-r", "-z", "--name-only", expectedHead, "--", ".github/agents"]))
    .split("\0").filter(Boolean);
  if (inventory.join("\0") !== [...COPILOT_AGENT_PATHS].sort().join("\0")) throw new Error("copilot_agent_inventory_invalid");
  const blobs = new Map<string, string>();
  for (const path of COPILOT_AGENT_PATHS) blobs.set(path, await git(root, ["show", `${expectedHead}:${path}`]));
  return blobs;
}

async function defaultFindExecutable(): Promise<string | null> {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory === "") continue;
    const candidate = join(directory, "code");
    try {
      await access(candidate, constants.X_OK);
      const canonical = await realpath(candidate);
      if (isAbsolute(canonical)) return canonical;
    } catch { /* Continue through PATH. */ }
  }
  return null;
}

function unavailableHost(): CopilotTeammateReadinessReportV1["host"] {
  return Object.freeze({
    vscode: Object.freeze({ classification: "unavailable" as const, version: null, build: null, architecture: null }),
    copilotExtension: Object.freeze({ classification: "unavailable" as const, identifier: "github.copilot-chat" as const, version: null }),
    entitlement: Object.freeze({ status: "unverified" as const }),
  });
}

export async function probeCopilotTeammateHostV1(
  dependencies: Pick<CopilotTeammateReadinessDependenciesV1, "execute" | "findExecutable"> = {},
): Promise<CopilotTeammateReadinessReportV1["host"]> {
  const execute = dependencies.execute ?? ((executable, args) => boundedExec(executable, args));
  const code = await (dependencies.findExecutable ?? defaultFindExecutable)("code");
  if (code === null) return unavailableHost();
  const versionResult = await execute(code, ["--version"]);
  const extensionResult = await execute(code, ["--list-extensions", "--show-versions"]);
  let vscode: CopilotTeammateReadinessReportV1["host"]["vscode"];
  if (versionResult.state === "success") {
    const lines = versionResult.stdout.trim().split(/\r?\n/u);
    vscode = lines.length === 3 && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(lines[0] ?? "") &&
      /^[0-9a-f]{40}$/u.test(lines[1] ?? "") && /^(?:arm64|armhf|x64)$/u.test(lines[2] ?? "")
      ? { classification: "available", version: lines[0] as string, build: lines[1] as string, architecture: lines[2] as string }
      : { classification: "malformed", version: null, build: null, architecture: null };
  } else vscode = { classification: versionResult.state === "timeout" ? "timeout" : "unavailable", version: null, build: null, architecture: null };
  let copilotExtension: CopilotTeammateReadinessReportV1["host"]["copilotExtension"];
  if (extensionResult.state === "success") {
    const matches = extensionResult.stdout.split(/\r?\n/u).filter((line) => line.startsWith("github.copilot-chat@"));
    const version = matches.length === 1 ? matches[0]?.slice("github.copilot-chat@".length) ?? "" : "";
    copilotExtension = matches.length === 0
      ? { classification: "unavailable", identifier: "github.copilot-chat", version: null }
      : matches.length === 1 && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(version)
      ? { classification: "available", identifier: "github.copilot-chat", version }
      : { classification: "malformed", identifier: "github.copilot-chat", version: null };
  } else copilotExtension = { classification: extensionResult.state === "timeout" ? "timeout" : "unavailable", identifier: "github.copilot-chat", version: null };
  return Object.freeze({ vscode: Object.freeze(vscode), copilotExtension: Object.freeze(copilotExtension), entitlement: Object.freeze({ status: "unverified" }) });
}

function hostConfirmations(): readonly { readonly id: string; readonly status: "unverified" }[] {
  const ids = ["host.copilot_picker_rendered", "host.account_entitlement"];
  for (const seat of COPILOT_TEAMMATE_SEATS) for (const field of HOST_FIELDS) ids.push(`host.seat.${seat}.${field}`);
  return Object.freeze(ids.map((id) => Object.freeze({ id, status: "unverified" as const })));
}

function check(id: string, pass: boolean, failure: string): CopilotTeammateReadinessReportV1["machineChecks"][number] {
  const reasonCode = pass ? "none" : failure;
  const nextAction = pass ? "No machine action is required for this check." : `Resolve ${failure} and rerun the complete Copilot preflight.`;
  return Object.freeze({ id, status: pass ? "pass" : "fail", reasonCode, nextAction });
}

function copilotExtensionObservation(
  classification: ProbeClassification,
): CopilotTeammateReadinessReportV1["machineChecks"][number] {
  const observations = {
    available: {
      reasonCode: "none",
      nextAction: "No machine action is required for this check.",
    },
    unavailable: {
      reasonCode: "copilot_extension_not_observed",
      nextAction: "Confirm the Copilot picker, account entitlement, and required agents visibly in VS Code.",
    },
    malformed: {
      reasonCode: "copilot_extension_observation_malformed",
      nextAction: "Confirm the Copilot picker, account entitlement, and required agents visibly in VS Code.",
    },
    timeout: {
      reasonCode: "copilot_extension_observation_timeout",
      nextAction: "Confirm the Copilot picker, account entitlement, and required agents visibly in VS Code.",
    },
  } satisfies Record<ProbeClassification, { readonly reasonCode: string; readonly nextAction: string }>;
  return Object.freeze({ id: "host.copilot_extension", status: "observed", ...observations[classification] });
}

function furyDispatchCapabilityCheck(
  capability: CopilotFuryDispatchCapabilityReportV1 | null,
): CopilotTeammateReadinessReportV1["machineChecks"][number] {
  return Object.freeze({
    id: "platform.fury_dispatch",
    status: capability?.disposition === "ready" ? "pass" : "fail",
    reasonCode: capability?.reasonCode ?? "fury_card_unavailable",
    nextAction: capability?.nextAction ?? "Restore the exact-HEAD repository Fury agent card and rerun the capability probe.",
  });
}

function sameRepository(left: RepositorySnapshot, right: RepositorySnapshot): boolean {
  return left.root === right.root && left.identity === right.identity && left.branch === right.branch && left.head === right.head &&
    left.status === right.status && left.inventory === right.inventory;
}

export async function runCopilotTeammateReadinessPreflightV1(
  input: { readonly root: string; readonly expectedHead: string },
  dependencies: CopilotTeammateReadinessDependenciesV1 = {},
): Promise<CopilotTeammateReadinessReportV1> {
  const inputValid = exactObject(input, ["root", "expectedHead"]) && typeof input.root === "string" && isAbsolute(input.root) &&
    resolve(input.root) === input.root && typeof input.expectedHead === "string" && /^[0-9a-f]{40}$/u.test(input.expectedHead);
  let initial: RepositorySnapshot | null = null;
  let agents: CopilotTeammateReadinessReportV1["agents"] = [];
  let declarationsReady = false;
  let capability: CopilotFuryDispatchCapabilityReportV1 | null = null;
  if (inputValid) {
    try {
      initial = await captureRepository(input.root);
      if (initial.head === input.expectedHead) {
        agents = validateCopilotAgentSetV1(await expectedAgentBlobs(initial.root, input.expectedHead));
        declarationsReady = true;
      }
    } catch { /* A closed machine check reports the failure. */ }
  }
  if (initial !== null && declarationsReady) {
    const probe = dependencies.probeFuryDispatchCapability ?? probeCopilotFuryDispatchCapabilityV1;
    try {
      capability = validateAndProjectCopilotFuryDispatchCapabilityReportV1(
        await probe({ repositoryRoot: initial.root, expectedHead: input.expectedHead }),
      );
    }
    catch { /* The closed capability row reports unavailability. */ }
  }
  const host = inputValid && initial !== null ? await probeCopilotTeammateHostV1(dependencies) : unavailableHost();
  await dependencies.beforeFinalObservation?.();
  let final: RepositorySnapshot | null = null;
  if (initial !== null) try { final = await captureRepository(input.root); } catch { /* Report repository drift. */ }
  const checks = Object.freeze([
    check("input.closed", inputValid, "invalid_input"),
    check("repository.root", initial !== null, "repository_unavailable"),
    check("repository.expected_head", initial?.head === input.expectedHead, "expected_head_mismatch"),
    check("repository.clean", initial?.status === "", "workspace_dirty"),
    check("repository.copilot_agents", declarationsReady, "declaration_invalid"),
    furyDispatchCapabilityCheck(capability),
    check("host.vscode", host.vscode.classification === "available", "host_probe_failed"),
    copilotExtensionObservation(host.copilotExtension.classification),
    check("repository.stable", initial !== null && final !== null && sameRepository(initial, final), "repository_drift"),
  ]);
  const failed = checks.find((entry) => entry.status === "fail");
  const reasonCode = failed?.reasonCode ?? "ready_for_host_confirmation";
  return Object.freeze({
    schemaVersion: 1,
    contractVersion: COPILOT_TEAMMATE_READINESS_CONTRACT_VERSION,
    authority: "none",
    adapter: Object.freeze({ kind: COPILOT_TEAMMATE_ADAPTER_KIND }),
    disposition: failed === undefined ? "ready_for_host_confirmation" : "action_required",
    reasonCode,
    repository: Object.freeze({
      root: initial?.root ?? (typeof input.root === "string" ? input.root : ""),
      branch: initial?.branch ?? null,
      head: initial?.head ?? null,
      expectedHead: typeof input.expectedHead === "string" ? input.expectedHead : "",
      clean: initial === null ? null : initial.status === "",
    }),
    agents,
    host,
    machineChecks: checks,
    hostConfirmations: hostConfirmations(),
  });
}

export function projectCopilotTeammateReadinessForPublicationV1(report: CopilotTeammateReadinessReportV1): unknown {
  return Object.freeze({ ...report, repository: Object.freeze({ ...report.repository, root: "<DISPOSABLE_ROOT>" }) });
}
