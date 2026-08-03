import { constants } from "node:fs";
import { access, chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { stdin as input, stdout as outputStream } from "node:process";
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
import { appendSupervisedMissionEntry, initializeSupervisedMissionJournal, readMissionJournalForDisplay, readSupervisedMissionJournal } from "./mission-store.mjs";
import type { ProfileAwareProjectionV1 } from "./profile-aware-mission-v1.mjs";
import { createDelegationLogEntry, DELEGATED_INVALIDATION_REASONS, type SignedWheelsOffDelegation, type SignedWheelsOffRevocation, type WheelsOffEligibility } from "./delegation-v1.mjs";
import { appendDelegationEntry, readDelegationLog } from "./delegation-store.mjs";
import { createSigner, signWithSigner } from "./mission-signer.mjs";

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

function profileAwareStatusText(projection: ProfileAwareProjectionV1): string {
  const satisfied = new Set(projection.evidence.map(({ requirementId }) => requirementId));
  const pending = projection.requirements
    .filter(({ requirementId }) => !satisfied.has(requirementId))
    .map(({ requirementId, requiredRoleId }) => `${requiredRoleId}:pending:${requirementId}`);
  return [
    `Mission: ${projection.missionId}`,
    `Revision: ${projection.brief.revisionId}`,
    `Profile: ${projection.brief.profileId}@${projection.brief.profileVersion}`,
    `Authorization: ${projection.authorization}`,
    `Execution: ${projection.execution}`,
    `Readiness (execute): ${projection.readiness.execute}`,
    `Readiness (accept): ${projection.readiness.accept}`,
    `Final acceptance: ${projection.finalAcceptance}`,
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

async function passcodeFromOptions(options: ParsedOptions): Promise<string> {
  if (options.flags.has("--passcode-stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const passcode = Buffer.concat(chunks).toString("utf8").trim();
    if (!passcode) throw new MissionCliError("Passcode input was empty.");
    return passcode;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new MissionCliError("Passcode prompt requires a TTY; use --passcode-stdin for automation.");
  return await readInteractivePasscode(input, outputStream);
}

export async function readInteractivePasscode(
  inputStream: {
    setRawMode: (mode: boolean) => void;
    on: (event: string, listener: (chunk: Buffer) => void) => void;
    off: (event: string, listener: (chunk: Buffer) => void) => void;
    resume: () => void;
    pause: () => void;
  },
  outputStream: { write: (output: string) => void },
): Promise<string> {
  const setupFailureMessage = "Passcode prompt failed.";
  outputStream.write("Passcode: ");
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let finished = false;
    let setupFailure = false;
    let outcome: "success" | "cancelled" | "empty" = "empty";
    let passcode = "";
    let isResuming = false;
    let cleanupDone = false;
    let cleanupFailure: MissionCliError | null = null;

    const registerCleanupFailure = () => {
      if (!cleanupFailure) cleanupFailure = new MissionCliError(setupFailureMessage);
    };

    const attemptCleanupAction = (action: () => void): void => {
      try {
        action();
      } catch (error) {
        registerCleanupFailure();
      }
    };

    const runCleanup = (): void => {
      if (cleanupDone) return;
      cleanupDone = true;
      attemptCleanupAction(() => {
        inputStream.off("data", onData);
      });
      attemptCleanupAction(() => {
        inputStream.setRawMode(false);
      });
      attemptCleanupAction(() => {
        inputStream.pause();
      });
      attemptCleanupAction(() => {
        outputStream.write("\n");
      });
    };

    const finish = (): void => {
      if (finished) return;
      finished = true;
      runCleanup();
      if (cleanupFailure) {
        reject(cleanupFailure);
        return;
      }
      if (setupFailure) {
        reject(new MissionCliError(setupFailureMessage));
        return;
      }
      if (outcome === "empty") {
        reject(new MissionCliError("Passcode input was empty."));
        return;
      }
      if (outcome === "cancelled") {
        reject(new MissionCliError("Passcode prompt cancelled."));
        return;
      }
      resolve(passcode);
    };

    const settle = (nextOutcome: "success" | "cancelled" | "empty", nextPasscode = passcode): void => {
      if (settled) return;
      settled = true;
      outcome = nextOutcome;
      passcode = nextPasscode;
      if (!isResuming) finish();
    };

    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (settled) return;
        if (byte === 3) {
          settle("cancelled");
          return;
        }
        if (byte === 10 || byte === 13) {
          settle(passcode ? "success" : "empty", passcode);
          return;
        }
        if (byte === 127 || byte === 8) {
          passcode = passcode.slice(0, -1);
        } else if (byte >= 32) {
          passcode += String.fromCharCode(byte);
        }
      }
    };

    try {
      inputStream.setRawMode(true);
      inputStream.on("data", onData);
      isResuming = true;
      inputStream.resume();
      isResuming = false;
      if (settled) finish();
    } catch (error) {
      setupFailure = true;
      settled = true;
      isResuming = false;
      finish();
    }
  });
}

async function signerSetup(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--seat"], ["--json", "--passcode-stdin"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const seat = options.values.get("--seat") ?? "coulson";
  if (seat !== "coulson") throw new MissionCliError("Only the Coulson signer can be provisioned by this command.");
  const registryPath = join(root, BINDINGS_PATH);
  const registry = unwrap(validateTrustedBindingRegistry(await jsonFile(registryPath, "Trusted binding registry"))) as TrustedBindingRegistry;
  const bindings = unwrap(validateRepositoryBindings(registry, config.trustedHumanBindingRefs, "*", false));
  const current = bindings.find(({ seatId }) => seatId === seat);
  if (!current) throw new MissionCliError("Configured Coulson binding is missing.", 1);
  const passcode = await passcodeFromOptions(options);
  const signerBinding = {
    bindingId: current.bindingId,
    humanPrincipalId: current.humanPrincipalId,
    signingKeyRef: current.signingKeyRef,
    publicKeySpkiBase64: current.publicKeySpkiBase64,
  };
  const signerPath = await createSigner(signerBinding, passcode);
  const nextRegistry = { ...registry, bindings: registry.bindings.map((binding) => binding.seatId === seat ? { ...binding, signingKeyRef: signerBinding.signingKeyRef, publicKeySpkiBase64: signerBinding.publicKeySpkiBase64 } : binding) };
  const nextConfig = { ...config, trustedHumanBindingRefs: config.trustedHumanBindingRefs.map((ref) => ref.seatId === seat ? { ...ref, bindingRef: signerBinding.signingKeyRef } : ref) };
  await writeFile(registryPath, `${JSON.stringify(nextRegistry, null, 2)}\n`);
  await chmod(registryPath, 0o600);
  await writeFile(join(root, CONFIG_PATH), `${JSON.stringify(nextConfig, null, 2)}\n`);
  output(
    { signerPath, signingKeyRef: signerBinding.signingKeyRef },
    options.flags.has("--json"),
    `Coulson signer created at ${signerPath}.\nThis is a one-time host setup for future missions.\nExisting mission journals retain the binding captured at begin and must continue using their original signer.`,
  );
  return 0;
}

async function authorize(args: string[]): Promise<number> {
  const options = parseOptions(args, ["--root", "--mission-id"], ["--json", "--passcode-stdin"]);
  const root = await exactRoot(options.values.get("--root"), true);
  const config = await repositoryConfig(root);
  const missionId = required(options, "--mission-id");
  const current = await currentMission(root, config, missionId);
  const requirement = current.projection.requirements.find(({ evidenceKind, requiredSeatId, supersedesRequirementId }) => evidenceKind === "mission_authorization" && requiredSeatId === "coulson" && supersedesRequirementId === null);
  if (!requirement) throw new MissionCliError("Current mission has no pending Coulson authorization requirement.", 1);
  const binding = current.projection.trustedBindings.find(({ seatId }) => seatId === "coulson");
  if (!binding) throw new MissionCliError("Mission has no Coulson trusted binding.", 1);
  const passcode = await passcodeFromOptions(options);
  const payload = {
    schemaVersion: 1 as const,
    evidenceId: `evidence:coulson:${current.projection.lastSequence + 1}`,
    requirementId: requirement.requirementId,
    missionId,
    subjectKind: "mission_plan" as const,
    subjectId: current.projection.brief.subjectId,
    revisionId: current.projection.brief.revisionId,
    seatId: "coulson" as const,
    evidenceKind: "mission_authorization" as const,
    decision: "approved" as const,
    governanceTarget: "approved" as const,
    humanPrincipalId: binding.humanPrincipalId,
    bindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `passcode-signer:${missionId}`,
    timestamp: { value: new Date().toISOString(), provenance: "hostTrusted" as const },
    journalSequence: current.projection.lastSequence + 1,
  };
  let signatureBase64: string;
  try {
    signatureBase64 = await signWithSigner(binding.signingKeyRef, passcode, payload);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new MissionCliError("No local Coulson signer was found for this mission binding. Run `shield mission signer setup --seat coulson` before beginning new missions, or use detached signed evidence for missions bound to another key.", 1);
    }
    if (error instanceof Error) throw new MissionCliError(error.message, 1);
    throw error;
  }
  const entry = unwrap(createGovernanceEntry(current.projection, "approve", { payload, signatureBase64 }, null));
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
  const current = unwrap(await readMissionJournalForDisplay(missionPaths(root, config, missionId)));
  const human = current.kind === "profile-aware"
    ? profileAwareStatusText(current.projection)
    : statusText(current.projection);
  if (command === "status") {
    output(current.projection, options.flags.has("--json"), human);
  } else {
    const report = { projection: current.projection, entries: current.entries };
    output(report, options.flags.has("--json"), `${human}\nJournal entries: ${current.entries.length}`);
  }
  return 0;
}

export function missionUsage(): string {
  return [
    "  shield mission begin --brief <file> [--root <path>] [--json]",
    "  shield mission begin --authorization delegated --brief <file> --delegation <revision> --eligibility <file> [--root <path>] [--json]",
    "  shield mission signer setup [--seat coulson] [--root <path>] [--passcode-stdin] [--json]",
    "  shield mission authorize --mission-id <id> [--root <path>] [--passcode-stdin] [--json]",
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
    if (action === "authorize") return authorize(rest);
    if (action === "signer" && rest[0] === "setup") return signerSetup(rest.slice(1));
    if (action === "approve" || action === "pause" || action === "resume" || action === "cancel") return governance(action, rest);
    if (action === "step") return step(rest);
    if (action === "invalidate") return invalidate(rest);
    if (action === "status" || action === "report") return show(action, rest);
  }
  if (group === "evidence" && action === "record") return recordEvidence(rest);
  if (group === "delegation" && (action === "grant" || action === "revoke")) return delegation(action, rest);
  throw new MissionCliError(`Unsupported supervised mission command.\n${missionUsage()}`);
}
