import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import {
  GUIDED_REVIEW_DISPOSITIONS,
  GUIDED_REVIEW_PLAYBOOK_KINDS,
  GUIDED_REVIEW_PROFILES,
  GUIDED_REVIEW_PUBLICATION_CHOICES,
  decideGuidedReviewStepV1,
  evaluateGuidedReviewPublicationForkV1,
  renderGuidedReviewChecklistV1,
  reviseGuidedReviewSessionV1,
  startGuidedReviewSessionV1,
  summarizeGuidedReviewSessionV1,
  type GuidedReviewPlaybookV1,
  type GuidedReviewSessionV1,
} from "./guided-review-v1.mjs";
import { createBuiltInGuidedReviewPlaybookV1 } from "./guided-review-playbooks-v1.mjs";

export class GuidedReviewCliError extends Error {
  constructor(message: string, readonly exitCode = 2) { super(message); }
}

interface Options { values: Map<string, string>; flags: Set<string> }

export function guidedReviewUsage(): string {
  return [
    "Guided Review:",
    `  shield guided-review playbook create --kind <${GUIDED_REVIEW_PLAYBOOK_KINDS.join("|")}> --input <context.json> --output <playbook.json> [--root <path>] [--json]`,
    `  shield guided-review start --playbook <playbook.json> --profile <${GUIDED_REVIEW_PROFILES.join("|")}> --session-id <id> --output <session.json> [--root <path>] [--json]`,
    "  shield guided-review status --playbook <playbook.json> --session <session.json> [--root <path>] [--json]",
    `  shield guided-review decide --playbook <playbook.json> --session <session.json> --decision-id <id> --disposition <${GUIDED_REVIEW_DISPOSITIONS.join("|")}> --observation <text> [--evidence-refs <id,id>] [--finding <text>] [--condition <text>] [--root <path>] [--json]`,
    "  shield guided-review revise --playbook <playbook.json> --session <session.json> --exact-revision <revision> --runtime-handoff <receipt.json> --affected-steps <id,id> --rationale <text> [--root <path>] [--json]",
    "  shield guided-review checklist --playbook <playbook.json> --session <session.json> --output <checklist.md> [--root <path>] [--json]",
    `  shield guided-review publication-choice --choice <${GUIDED_REVIEW_PUBLICATION_CHOICES.join("|")}> --exact-revision <revision> --output <fork.json> [--playbook <playbook.json> --session <session.json>] [--root <path>] [--json]`,
  ].join("\n");
}

function parse(args: string[], valueNames: readonly string[], flagNames: readonly string[] = ["--json"]): Options {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const allowedValues = new Set(valueNames);
  const allowedFlags = new Set(flagNames);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (allowedFlags.has(name)) {
      if (flags.has(name)) throw new GuidedReviewCliError(`Duplicate option: ${name}.`);
      flags.add(name);
      continue;
    }
    if (!allowedValues.has(name)) throw new GuidedReviewCliError(`Unknown option: ${name}.`);
    if (values.has(name)) throw new GuidedReviewCliError(`Duplicate option: ${name}.`);
    const value = args[++index];
    if (value === undefined || value.startsWith("--")) throw new GuidedReviewCliError(`${name} requires a value.`);
    values.set(name, value);
  }
  return { values, flags };
}

function required(options: Options, name: string): string {
  const value = options.values.get(name);
  if (value === undefined || value.trim().length === 0) throw new GuidedReviewCliError(`Missing required option: ${name}.`);
  return value;
}

function list(value: string | undefined): string[] {
  if (value === undefined || value.length === 0) return [];
  const entries = value.split(",");
  if (entries.some((entry) => entry.length === 0 || entry.trim() !== entry) || new Set(entries).size !== entries.length) {
    throw new GuidedReviewCliError("Comma-separated values must be normalized and unique.");
  }
  return entries;
}

async function rootPath(value: string | undefined): Promise<string> {
  const candidate = resolve(value ?? process.cwd());
  const stats = await lstat(candidate).catch(() => null);
  if (stats === null || stats.isSymbolicLink() || !stats.isDirectory()) throw new GuidedReviewCliError(`Root is not a real directory: ${candidate}.`);
  return realpath(candidate);
}

function inside(root: string, value: string): string {
  const candidate = resolve(root, value);
  const relation = relative(root, candidate);
  if (relation === "" || relation === ".." || relation.startsWith(`..${isAbsolute(relation) ? "" : "/"}`) || isAbsolute(relation)) {
    throw new GuidedReviewCliError(`Path must resolve beneath the repository root: ${value}.`);
  }
  return candidate;
}

async function jsonFile<T>(path: string): Promise<{ value: T; bytes: string }> {
  const bytes = await readUtf8File(path);
  try { return { value: JSON.parse(bytes) as T, bytes }; }
  catch { throw new GuidedReviewCliError(`Input is not valid JSON: ${path}.`); }
}

async function readUtf8File(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null);
  if (handle === null) throw new GuidedReviewCliError(`Input must be a real file: ${path}.`);
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.nlink !== 1) throw new GuidedReviewCliError(`Input must be a singly linked regular file: ${path}.`);
    return await handle.readFile("utf8");
  } finally { await handle.close(); }
}

async function ensureRealDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  const [stats, canonical] = await Promise.all([lstat(path), realpath(path)]);
  if (stats.isSymbolicLink() || !stats.isDirectory() || canonical !== resolve(path)) {
    throw new GuidedReviewCliError(`Output parent must be a real directory: ${path}.`);
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_DIRECTORY ?? 0));
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writeExclusive(path: string, bytes: string): Promise<void> {
  await ensureRealDirectory(dirname(path));
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new GuidedReviewCliError(`Refusing to overwrite existing output: ${path}.`, 1);
    throw error;
  });
  try { await handle.writeFile(bytes, "utf8"); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(dirname(path));
}

async function replaceExact(path: string, expectedBytes: string, bytes: string): Promise<void> {
  await ensureRealDirectory(dirname(path));
  const lockPath = `${path}.lock`;
  const lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new GuidedReviewCliError(`Guided Review session is already being updated: ${path}.`, 1);
    throw error;
  });
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    await lock.sync();
    const current = await readUtf8File(path);
    if (current !== expectedBytes) throw new GuidedReviewCliError("Guided Review session changed concurrently; reload status before deciding.", 1);
    const output = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await output.writeFile(bytes, "utf8"); await output.sync(); } finally { await output.close(); }
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } finally {
    await lock.close();
    await unlink(temporary).catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    await syncDirectory(dirname(path));
  }
}

function jsonBytes(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }

function unwrap<T>(result: { state: "ready"; value: T } | { state: "invalid"; code: string; errors: readonly string[] }): T {
  if (result.state === "invalid") throw new GuidedReviewCliError(`${result.code}: ${result.errors.join(" ")}`, 1);
  return result.value;
}

function currentDisplay(playbook: GuidedReviewPlaybookV1, session: GuidedReviewSessionV1): Record<string, unknown> {
  const summary = unwrap(summarizeGuidedReviewSessionV1(playbook, session));
  const stage = playbook.stages.find((entry) => entry.stageId === session.currentStageId) ?? null;
  const step = stage?.steps.find((entry) => entry.stepId === session.currentStepId) ?? null;
  return {
    ...summary,
    sessionDigest: session.sessionDigest,
    stage: stage === null ? null : { stageId: stage.stageId, checkpointId: stage.checkpointId, title: stage.title, purpose: stage.purpose },
    step: step === null ? null : { stepId: step.stepId, title: step.title, question: step.question, instructions: step.instructions,
      criterionRefs: step.criterionRefs, evidenceRefs: step.evidenceRefs, relevantPaths: step.relevantPaths },
  };
}

function render(display: Record<string, unknown>): string {
  const stage = display.stage as { title: string } | null;
  const step = display.step as { title: string; question: string; instructions: readonly string[] } | null;
  const lines = [
    `GUIDED REVIEW — ${String(display.state).toUpperCase()}`,
    `Revision: ${display.exactRevision}`,
    `Progress: ${display.completedStages}/${display.totalStages} stages; ${display.completedSteps}/${display.totalSteps} questions`,
  ];
  if (stage && step) lines.push("", `STAGE — ${stage.title}`, `QUESTION — ${step.title}`, "", step.question, "", ...step.instructions.map((entry) => `- ${entry}`));
  else lines.push("", "All stages complete. Review the journey recap before the publication choice.");
  return `${lines.join("\n")}\n`;
}

function output(value: unknown, human: string, json: boolean): void {
  process.stdout.write(json ? jsonBytes(value) : human);
}

async function playbookCreate(args: string[]): Promise<number> {
  const options = parse(args, ["--kind", "--input", "--output", "--root"]);
  const root = await rootPath(options.values.get("--root"));
  const kind = required(options, "--kind");
  if (!GUIDED_REVIEW_PLAYBOOK_KINDS.includes(kind as never)) throw new GuidedReviewCliError(`Unsupported playbook kind: ${kind}.`);
  const context = await jsonFile<unknown>(inside(root, required(options, "--input")));
  const playbook = unwrap(createBuiltInGuidedReviewPlaybookV1(kind as never, context.value as never));
  const target = inside(root, required(options, "--output"));
  await writeExclusive(target, jsonBytes(playbook));
  output(playbook, `Created ${kind} Guided Review playbook: ${target}\nDigest: ${playbook.playbookDigest}\n`, options.flags.has("--json"));
  return 0;
}

async function start(args: string[]): Promise<number> {
  const options = parse(args, ["--playbook", "--profile", "--session-id", "--output", "--root"]);
  const root = await rootPath(options.values.get("--root"));
  const playbook = (await jsonFile<GuidedReviewPlaybookV1>(inside(root, required(options, "--playbook")))).value;
  const profile = required(options, "--profile");
  if (!GUIDED_REVIEW_PROFILES.includes(profile as never)) throw new GuidedReviewCliError(`Unsupported profile: ${profile}.`);
  const session = unwrap(startGuidedReviewSessionV1(playbook, { sessionId: required(options, "--session-id"), profile, startedAt: new Date().toISOString() }));
  const target = inside(root, required(options, "--output"));
  await writeExclusive(target, jsonBytes(session));
  const display = currentDisplay(playbook, session);
  output(display, render(display), options.flags.has("--json"));
  return 0;
}

async function loadPair(options: Options, root: string): Promise<{ playbook: GuidedReviewPlaybookV1; session: GuidedReviewSessionV1; sessionBytes: string; sessionPath: string }> {
  const playbook = (await jsonFile<GuidedReviewPlaybookV1>(inside(root, required(options, "--playbook")))).value;
  const sessionPath = inside(root, required(options, "--session"));
  const session = await jsonFile<GuidedReviewSessionV1>(sessionPath);
  return { playbook, session: session.value, sessionBytes: session.bytes, sessionPath };
}

async function status(args: string[]): Promise<number> {
  const options = parse(args, ["--playbook", "--session", "--root"]);
  const root = await rootPath(options.values.get("--root"));
  const pair = await loadPair(options, root);
  const display = currentDisplay(pair.playbook, pair.session);
  output(display, render(display), options.flags.has("--json"));
  return 0;
}

async function decide(args: string[]): Promise<number> {
  const options = parse(args, ["--playbook", "--session", "--decision-id", "--disposition", "--observation", "--evidence-refs", "--finding", "--condition", "--root"]);
  const root = await rootPath(options.values.get("--root"));
  const pair = await loadPair(options, root);
  const disposition = required(options, "--disposition");
  if (!GUIDED_REVIEW_DISPOSITIONS.includes(disposition as never)) throw new GuidedReviewCliError(`Unsupported disposition: ${disposition}.`);
  const session = unwrap(decideGuidedReviewStepV1(pair.playbook, pair.session, {
    decisionId: required(options, "--decision-id"),
    stepId: pair.session.currentStepId,
    exactRevision: pair.session.exactRevision,
    disposition,
    observation: required(options, "--observation"),
    evidenceRefs: list(options.values.get("--evidence-refs")),
    finding: options.values.get("--finding") ?? null,
    condition: options.values.get("--condition") ?? null,
    decidedAt: new Date().toISOString(),
  }));
  await replaceExact(pair.sessionPath, pair.sessionBytes, jsonBytes(session));
  const display = currentDisplay(pair.playbook, session);
  output(display, render(display), options.flags.has("--json"));
  return 0;
}

async function revise(args: string[]): Promise<number> {
  const options = parse(args, ["--playbook", "--session", "--exact-revision", "--runtime-handoff", "--affected-steps", "--rationale", "--root"]);
  const root = await rootPath(options.values.get("--root"));
  const pair = await loadPair(options, root);
  const runtimeHandoff = (await jsonFile<unknown>(inside(root, required(options, "--runtime-handoff")))).value;
  const session = unwrap(reviseGuidedReviewSessionV1(pair.playbook, pair.session, {
    exactRevision: required(options, "--exact-revision"),
    runtimeHandoff,
    affectedStepIds: list(required(options, "--affected-steps")),
    rationale: required(options, "--rationale"),
    revisedAt: new Date().toISOString(),
  }));
  await replaceExact(pair.sessionPath, pair.sessionBytes, jsonBytes(session));
  const display = currentDisplay(pair.playbook, session);
  output(display, render(display), options.flags.has("--json"));
  return 0;
}

async function checklist(args: string[]): Promise<number> {
  const options = parse(args, ["--playbook", "--session", "--output", "--root"]);
  const root = await rootPath(options.values.get("--root"));
  const pair = await loadPair(options, root);
  const markdown = unwrap(renderGuidedReviewChecklistV1(pair.playbook, pair.session));
  const target = inside(root, required(options, "--output"));
  await writeExclusive(target, markdown);
  const result = { outputPath: target, exactRevision: pair.session.exactRevision, sessionDigest: pair.session.sessionDigest };
  output(result, `Created reusable review checklist: ${target}\n`, options.flags.has("--json"));
  return 0;
}

async function publicationChoice(args: string[]): Promise<number> {
  const options = parse(args, ["--choice", "--exact-revision", "--output", "--playbook", "--session", "--root"]);
  const root = await rootPath(options.values.get("--root"));
  const choice = required(options, "--choice");
  if (!GUIDED_REVIEW_PUBLICATION_CHOICES.includes(choice as never)) throw new GuidedReviewCliError(`Unsupported publication choice: ${choice}.`);
  const hasPlaybook = options.values.has("--playbook");
  const hasSession = options.values.has("--session");
  if (hasPlaybook !== hasSession || (choice === "yes" && !hasPlaybook)) throw new GuidedReviewCliError("YES requires both --playbook and --session; NO and CANCEL accept either neither or both.");
  const pair = hasPlaybook ? await loadPair(options, root) : null;
  const fork = unwrap(evaluateGuidedReviewPublicationForkV1({ choice, exactRevision: required(options, "--exact-revision"), playbook: pair?.playbook ?? null, session: pair?.session ?? null }));
  const target = inside(root, required(options, "--output"));
  await writeExclusive(target, jsonBytes(fork));
  output(fork, `${fork.summary}\nState: ${fork.state}\nAuthority: none\n`, options.flags.has("--json"));
  return fork.state === "blocked" ? 1 : 0;
}

export async function runGuidedReviewCli(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (command === undefined || command === "help" || command === "--help") {
    process.stdout.write(`${guidedReviewUsage()}\n`);
    return command === undefined ? 2 : 0;
  }
  if (command === "playbook" && rest[0] === "create") return playbookCreate(rest.slice(1));
  if (command === "start") return start(rest);
  if (command === "status") return status(rest);
  if (command === "decide") return decide(rest);
  if (command === "revise") return revise(rest);
  if (command === "checklist") return checklist(rest);
  if (command === "publication-choice") return publicationChoice(rest);
  throw new GuidedReviewCliError(`Unsupported Guided Review command: ${command ?? "<missing>"}.\n${guidedReviewUsage()}`);
}
