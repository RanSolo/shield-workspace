import { constants } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseShieldConfig, type ShieldConfig } from "./config.mjs";
import {
  createEvidenceEntry,
  createGovernanceEntry,
  createMissionBegunEntry,
  planMissionStep,
  validateRepositoryBindings,
  validateSupervisedMissionBrief,
  validateTrustedBindingRegistry,
  type ContractResult,
  type SignedHumanEvidence,
  type SupervisedMissionProjection,
  type TrustedBindingRegistry,
} from "./mission-v2.mjs";
import { appendSupervisedMissionEntry, readSupervisedMissionJournal } from "./mission-store.mjs";

const CONFIG_PATH = join(".shield", "config.json");
const BINDINGS_PATH = join(".shield", "trusted-human-bindings.json");

export class MissionCliError extends Error {
  constructor(message: string, readonly exitCode: 1 | 2 = 2) {
    super(message);
  }
}

interface ParsedOptions {
  values: Map<string, string>;
  flags: Set<string>;
}

function parseOptions(args: string[], valueNames: readonly string[], flagNames: readonly string[] = []): ParsedOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const allowedValues = new Set(valueNames);
  const allowedFlags = new Set(flagNames);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (allowedFlags.has(name)) {
      if (flags.has(name)) throw new MissionCliError(`Duplicate option: ${name}.`);
      flags.add(name);
      continue;
    }
    if (!allowedValues.has(name)) throw new MissionCliError(`Unknown option: ${name}.`);
    if (values.has(name)) throw new MissionCliError(`Duplicate option: ${name}.`);
    const value = args[++index];
    if (value === undefined || value.startsWith("--")) throw new MissionCliError(`${name} requires a value.`);
    values.set(name, value);
  }
  return { values, flags };
}

function required(options: ParsedOptions, name: string): string {
  const value = options.values.get(name);
  if (value === undefined || value.trim() === "") throw new MissionCliError(`Missing required option: ${name}.`);
  return value;
}

async function exactRoot(rootArgument: string | undefined, writable: boolean): Promise<string> {
  const root = resolve(rootArgument ?? process.cwd());
  try {
    const stats = await lstat(root);
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new MissionCliError(`Repository root must be a real directory: ${root}.`);
    await access(root, writable ? constants.R_OK | constants.W_OK : constants.R_OK);
  } catch (error) {
    if (error instanceof MissionCliError) throw error;
    throw new MissionCliError(`Repository root is inaccessible: ${root}.`);
  }
  return root;
}

async function regularTextFile(path: string, label: string): Promise<string> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new MissionCliError(`${label} must be a regular file: ${path}.`);
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof MissionCliError) throw error;
    throw new MissionCliError(`${label} is missing or unreadable: ${path}.`);
  }
}

async function jsonFile(path: string, label: string): Promise<unknown> {
  try { return JSON.parse(await regularTextFile(path, label)); }
  catch (error) {
    if (error instanceof MissionCliError) throw error;
    throw new MissionCliError(`${label} contains malformed JSON: ${path}.`);
  }
}

async function repositoryConfig(root: string): Promise<ShieldConfig> {
  const parsed = parseShieldConfig(await regularTextFile(join(root, CONFIG_PATH), "SHIELD configuration"));
  if (parsed.state === "invalid") throw new MissionCliError(parsed.issues.map(({ message }) => message).join(" "), 1);
  return parsed.value;
}

function unwrap<T>(result: ContractResult<T>): T {
  if (result.state === "invalid") throw new MissionCliError(`${result.code}: ${result.errors.join(" ")}`, 1);
  return result.value;
}

function output(value: unknown, json: boolean, human: string): void {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${human}\n`);
}

function missionPaths(root: string, config: ShieldConfig, missionId: string) {
  return { repositoryRoot: root, configuredJournalPath: config.paths.journals, missionId };
}

async function currentMission(root: string, config: ShieldConfig, missionId: string) {
  return unwrap(await readSupervisedMissionJournal(missionPaths(root, config, missionId)));
}

function statusText(projection: SupervisedMissionProjection): string {
  const pending = projection.readiness.accept.requirementStatuses
    .filter(({ status }) => status !== "satisfied")
    .map(({ requirementId, requiredSeatId, status }) => `${requiredSeatId}:${status}:${requirementId}`);
  return [
    `Mission: ${projection.missionId}`,
    `Revision: ${projection.brief.revisionId}`,
    `Governance: ${projection.governance.state}`,
    `Execution: ${projection.execution.status}`,
    `Readiness (execute): ${projection.readiness.execute.state}`,
    `Readiness (accept): ${projection.readiness.accept.state}`,
    `Communication: ${projection.communication.state}`,
    `Pending human evidence: ${pending.length > 0 ? pending.join(", ") : "none"}`,
    `Next journal sequence: ${projection.lastSequence + 1}`,
  ].join("\n");
}

async function begin(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--brief"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const brief = unwrap(validateSupervisedMissionBrief(await jsonFile(resolve(root, required(options, "--brief")), "Mission brief")));
  const registry = unwrap(validateTrustedBindingRegistry(await jsonFile(join(root, BINDINGS_PATH), "Trusted binding registry"))) as TrustedBindingRegistry;
  const bindings = unwrap(validateRepositoryBindings(registry, config.trustedHumanBindingRefs, brief.missionId, brief.requireSimmons));
  const appended = unwrap(await appendSupervisedMissionEntry({
    ...missionPaths(root, config, brief.missionId),
    entry: createMissionBegunEntry(brief, bindings),
  }));
  output(
    { journalPath: appended.journalPath, projection: appended.projection },
    options.flags.has("--json"),
    `Mission ${brief.missionId} proposed at ${brief.revisionId}.\n${statusText(appended.projection)}`,
  );
  return 0;
}

async function governance(command: "approve" | "pause" | "resume" | "cancel", args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--evidence", "--resume-state"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = await currentMission(root, config, missionId);
  const evidence = await jsonFile(resolve(root, required(options, "--evidence")), "Signed evidence") as SignedHumanEvidence;
  const resumeStateValue = options.values.get("--resume-state");
  if (command === "resume" && resumeStateValue !== "proposed" && resumeStateValue !== "approved") {
    throw new MissionCliError("resume requires --resume-state proposed|approved.");
  }
  if (command !== "resume" && resumeStateValue !== undefined) throw new MissionCliError("--resume-state is allowed only for resume.");
  const entry = unwrap(createGovernanceEntry(
    current.projection,
    command,
    evidence,
    command === "resume" ? resumeStateValue as "proposed" | "approved" : null,
  ));
  const appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), statusText(appended.projection));
  return 0;
}

async function step(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = await currentMission(root, config, missionId);
  const planned = unwrap(planMissionStep(current.projection, {
    value: new Date().toISOString(),
    provenance: "hostTrusted",
  }));
  if (planned.entry === null) {
    output({ outcome: planned.outcome, projection: current.projection }, options.flags.has("--json"), `Mission ${missionId} is already execution-complete; no journal entry was appended.`);
    return 0;
  }
  const appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, missionId), entry: planned.entry }));
  output({ outcome: planned.outcome, projection: appended.projection }, options.flags.has("--json"), statusText(appended.projection));
  return 0;
}

async function recordEvidence(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--evidence"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = await currentMission(root, config, missionId);
  const evidence = await jsonFile(resolve(root, required(options, "--evidence")), "Signed evidence") as SignedHumanEvidence;
  const entry = unwrap(createEvidenceEntry(current.projection, evidence));
  const appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), statusText(appended.projection));
  return 0;
}

async function show(command: "status" | "report", args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), false);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = await currentMission(root, config, missionId);
  if (command === "status") {
    output(current.projection, options.flags.has("--json"), statusText(current.projection));
  } else {
    const report = { projection: current.projection, entries: current.entries };
    output(report, options.flags.has("--json"), `${statusText(current.projection)}\nJournal entries: ${current.entries.length}`);
  }
  return 0;
}

export function missionUsage(): string {
  return [
    "  shield mission begin --brief <file> [--root <path>] [--json]",
    "  shield mission approve|pause|cancel --mission-id <id> --evidence <file> [--root <path>] [--json]",
    "  shield mission resume --mission-id <id> --evidence <file> --resume-state <proposed|approved> [--root <path>] [--json]",
    "  shield mission status|step|report --mission-id <id> [--root <path>] [--json]",
    "  shield evidence record --mission-id <id> --evidence <file> [--root <path>] [--json]",
  ].join("\n");
}

export async function runMissionCli(args: string[]): Promise<number> {
  const [group, action, ...rest] = args;
  if (group === "mission") {
    if (action === "begin") return begin(rest);
    if (action === "approve" || action === "pause" || action === "resume" || action === "cancel") return governance(action, rest);
    if (action === "step") return step(rest);
    if (action === "status" || action === "report") return show(action, rest);
  }
  if (group === "evidence" && action === "record") return recordEvidence(rest);
  throw new MissionCliError(`Unsupported supervised mission command.\n${missionUsage()}`);
}
