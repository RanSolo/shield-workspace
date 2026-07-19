import { constants } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseShieldConfig, type ShieldConfig } from "./config.mjs";
import {
  createDelegatedAuthorizationEntry,
  createDelegatedInvalidationEntry,
  createEvidenceEntry,
  createGovernanceEntry,
  createMissionBegunEntry,
  planMissionStep,
  replaySupervisedMissionJournal,
  validateRepositoryBindings,
  validateSupervisedMissionBrief,
  validateTrustedBindingRegistry,
  type ContractResult,
  type SignedHumanEvidence,
  type SupervisedMissionProjection,
  type TrustedBindingRegistry,
} from "./mission-v2.mjs";
import { appendSupervisedMissionEntry, initializeSupervisedMissionJournal, readSupervisedMissionJournal } from "./mission-store.mjs";
import { createDelegationLogEntry, DELEGATED_INVALIDATION_REASONS, type SignedWheelsOffDelegation, type SignedWheelsOffRevocation, type WheelsOffEligibility } from "./delegation-v1.mjs";
import { appendDelegationEntry, readDelegationLog } from "./delegation-store.mjs";

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
    `Authorization: ${projection.authorization.source}/${projection.authorization.state}`,
    `Authorization revisions: mission=${projection.authorization.missionRevisionId}, delegation=${projection.authorization.delegationRevisionId ?? "none"}, eligibility=${projection.authorization.eligibilityRevisionId ?? "none"}`,
    `Execution: ${projection.execution.status}`,
    `Readiness (execute): ${projection.readiness.execute.state}`,
    `Readiness (accept): ${projection.readiness.accept.state}`,
    `Communication: ${projection.communication.state}`,
    `Pending human evidence: ${pending.length > 0 ? pending.join(", ") : "none"}`,
    `Next journal sequence: ${projection.lastSequence + 1}`,
  ].join("\n");
}

async function begin(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--brief", "--authorization", "--delegation", "--eligibility"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const brief = unwrap(validateSupervisedMissionBrief(await jsonFile(resolve(root, required(options, "--brief")), "Mission brief")));
  const registry = unwrap(validateTrustedBindingRegistry(await jsonFile(join(root, BINDINGS_PATH), "Trusted binding registry"))) as TrustedBindingRegistry;
  const bindings = unwrap(validateRepositoryBindings(registry, config.trustedHumanBindingRefs, brief.missionId, brief.requireSimmons));
  const authorization = options.values.get("--authorization") ?? "supervised";
  if (authorization !== "supervised" && authorization !== "delegated") throw new MissionCliError("--authorization must be supervised or delegated.");
  if (authorization === "supervised" && (options.values.has("--delegation") || options.values.has("--eligibility"))) throw new MissionCliError("Supervised begin cannot include delegation inputs.");
  let appended;
  if (authorization === "supervised") {
    appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, brief.missionId), entry: createMissionBegunEntry(brief, bindings) }));
  } else {
    const delegationRef = required(options, "--delegation");
    const eligibility = await jsonFile(resolve(root, required(options, "--eligibility")), "Wheels Off eligibility") as WheelsOffEligibility;
    const coulson = bindings.find(({ seatId }) => seatId === "coulson"); if (!coulson) throw new MissionCliError("Configured Coulson binding is missing.", 1);
    const log = unwrap(await readDelegationLog({ repositoryRoot: root, repositoryId: config.repositoryId, binding: coulson }));
    const begun = createMissionBegunEntry(brief, bindings, 3);
    const begunProjection = unwrap(replaySupervisedMissionJournal([begun]));
    const delegated = unwrap(createDelegatedAuthorizationEntry({
      projection: begunProjection,
      repositoryId: config.repositoryId,
      delegationRevisionId: delegationRef,
      delegationLog: log.entries,
      eligibility,
      evaluatedAt: { value: new Date().toISOString(), provenance: "hostTrusted" },
    }));
    appended = unwrap(await initializeSupervisedMissionJournal({ ...missionPaths(root, config, brief.missionId), entries: [begun, delegated] }));
  }
  output(
    { journalPath: appended.journalPath, projection: appended.projection },
    options.flags.has("--json"),
    `Mission ${brief.missionId} proposed at ${brief.revisionId}.\n${statusText(appended.projection)}`,
  );
  return appended.projection.authorization.state === "ineligible" ? 1 : 0;
}

async function delegation(command: "grant" | "revoke", args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--evidence"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true); const config = await repositoryConfig(root);
  const registry = unwrap(validateTrustedBindingRegistry(await jsonFile(join(root, BINDINGS_PATH), "Trusted binding registry"))) as TrustedBindingRegistry;
  const bindings = unwrap(validateRepositoryBindings(registry, config.trustedHumanBindingRefs, "*", false));
  const coulson = bindings.find(({ seatId }) => seatId === "coulson"); if (!coulson) throw new MissionCliError("Configured Coulson binding is missing.", 1);
  const envelope = await jsonFile(resolve(root, required(options, "--evidence")), "Signed delegation evidence") as SignedWheelsOffDelegation | SignedWheelsOffRevocation;
  const entry = createDelegationLogEntry(envelope, command === "grant" ? "delegation.granted" : "delegation.revoked");
  const projection = unwrap(await appendDelegationEntry({ repositoryRoot: root, repositoryId: config.repositoryId, binding: coulson, entry }));
  output(projection, options.flags.has("--json"), `Delegation ${command} recorded at sequence ${entry.sequence}.`); return 0;
}

async function invalidate(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id", "--reason"], ["--json"]);
  const root = await exactRoot(options.values.get("--root"), true); const config = await repositoryConfig(root); const missionId = required(options, "--mission-id");
  const reason = required(options, "--reason"); if (!DELEGATED_INVALIDATION_REASONS.includes(reason as never)) throw new MissionCliError("Unsupported delegated invalidation reason.");
  const current = await currentMission(root, config, missionId);
  const entry = unwrap(createDelegatedInvalidationEntry(current.projection, reason as never, { value: new Date().toISOString(), provenance: "hostTrusted" }));
  const appended = unwrap(await appendSupervisedMissionEntry({ ...missionPaths(root, config, missionId), entry }));
  output(appended.projection, options.flags.has("--json"), statusText(appended.projection)); return 0;
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
    "  shield mission begin --authorization delegated --brief <file> --delegation <revision> --eligibility <file> [--root <path>] [--json]",
    "  shield mission approve|pause|cancel --mission-id <id> --evidence <file> [--root <path>] [--json]",
    "  shield mission resume --mission-id <id> --evidence <file> --resume-state <proposed|approved> [--root <path>] [--json]",
    "  shield mission status|step|report --mission-id <id> [--root <path>] [--json]",
    "  shield evidence record --mission-id <id> --evidence <file> [--root <path>] [--json]",
    "  shield mission invalidate --mission-id <id> --reason <reason> [--root <path>] [--json]",
    "  shield delegation grant|revoke --evidence <file> [--root <path>] [--json]",
  ].join("\n");
}

export async function runMissionCli(args: string[]): Promise<number> {
  const [group, action, ...rest] = args;
  if (group === "mission") {
    if (action === "begin") return begin(rest);
    if (action === "approve" || action === "pause" || action === "resume" || action === "cancel") return governance(action, rest);
    if (action === "step") return step(rest);
    if (action === "invalidate") return invalidate(rest);
    if (action === "status" || action === "report") return show(action, rest);
  }
  if (group === "evidence" && action === "record") return recordEvidence(rest);
  if (group === "delegation" && (action === "grant" || action === "revoke")) return delegation(action, rest);
  throw new MissionCliError(`Unsupported supervised mission command.\n${missionUsage()}`);
}
