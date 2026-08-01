import { constants } from "node:fs";
import { mkdir, open, realpath, unlink } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import {
  parseSupervisedJournalJsonl,
  serializeSupervisedJournalEntry,
  type ContractResult,
  type SupervisedJournalEntry,
  type SupervisedMissionProjection,
} from "./mission-v2.mjs";
import {
  replayProfileAwareMissionJournal,
  type ProfileAwareMissionEntryV1,
  type ProfileAwareProjectionV1,
} from "./profile-aware-mission-v1.mjs";

const valid = <T,>(value: T): ContractResult<T> => ({ state: "valid", value });
const invalid = <T = never,>(code: string, message: string): ContractResult<T> => ({ state: "invalid", code, errors: [message] });
const invalidMany = <T = never,>(code: string, errors: string[]): ContractResult<T> => ({ state: "invalid", code, errors: [...errors] });

type MissionJournalReadInput = {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
};

export type MissionJournalDisplay =
  | { kind: "supervised"; entries: SupervisedJournalEntry[]; projection: SupervisedMissionProjection }
  | { kind: "profile-aware"; entries: ProfileAwareMissionEntryV1[]; projection: ProfileAwareProjectionV1 };

export interface MissionJournalPaths {
  root: string;
  journalPath: string;
  lockPath: string;
}

export function supervisedMissionFilename(missionId: string): ContractResult<string> {
  if (typeof missionId !== "string" || missionId.trim().length === 0) return invalid("malformed", "missionId must be non-empty.");
  const encoded = Buffer.from(missionId, "utf8").toString("base64url");
  if (encoded.length === 0 || encoded.length > 180) return invalid("malformed", "Encoded missionId exceeds the filename limit.");
  return valid(`${encoded}.jsonl`);
}

export function resolveSupervisedMissionPaths(
  repositoryRoot: string,
  configuredJournalPath: string,
  missionId: string,
): ContractResult<MissionJournalPaths> {
  if (typeof repositoryRoot !== "string" || typeof configuredJournalPath !== "string") return invalid("malformed", "Repository and journal paths are required.");
  const filename = supervisedMissionFilename(missionId);
  if (filename.state === "invalid") return filename;
  const base = resolve(repositoryRoot);
  const root = resolve(base, configuredJournalPath);
  const fromBase = relative(base, root);
  if (fromBase === ".." || fromBase.startsWith(`..${sep}`) || fromBase === "") return invalid("unsafe_path", "Configured journal root escapes or equals the repository root.");
  const journalPath = resolve(root, filename.value);
  const lockPath = `${journalPath}.lock`;
  for (const candidate of [journalPath, lockPath]) {
    const fromRoot = relative(root, candidate);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || candidate === root) return invalid("unsafe_path", "Mission journal path escapes its root.");
  }
  return valid({ root, journalPath, lockPath });
}

async function verifyConfinement(repositoryRoot: string, journalRoot: string): Promise<ContractResult<string>> {
  try {
    const [realRepository, realJournalRoot] = await Promise.all([realpath(repositoryRoot), realpath(journalRoot)]);
    const fromRepository = relative(realRepository, realJournalRoot);
    if (fromRepository === ".." || fromRepository.startsWith(`..${sep}`) || fromRepository === "") {
      return invalid("unsafe_path", "Journal root resolves outside or equals the repository root.");
    }
    return valid(realJournalRoot);
  } catch (error) {
    return invalid("journal_unavailable", `Journal root verification failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
}

async function readExistingText(path: string): Promise<ContractResult<string> | null> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    if (!stats.isFile()) return invalid("unsafe_path", "Mission journal must be a regular file.");
    return valid(await handle.readFile("utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if ((error as NodeJS.ErrnoException).code === "ELOOP") return invalid("unsafe_path", "Mission journal must not be a symlink.");
    return invalid("journal_unavailable", `Journal read failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readExisting(path: string): Promise<ContractResult<{ entries: SupervisedJournalEntry[]; projection: SupervisedMissionProjection }> | null> {
  const text = await readExistingText(path);
  return text === null || text.state === "invalid" ? text : parseSupervisedJournalJsonl(text.value);
}

async function readVerifiedJournalText(input: MissionJournalReadInput): Promise<ContractResult<string>> {
  const paths = resolveSupervisedMissionPaths(input.repositoryRoot, input.configuredJournalPath, input.missionId);
  if (paths.state === "invalid") return paths;
  try { await realpath(paths.value.root); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return invalid("mission_missing", `Mission journal does not exist: ${input.missionId}.`);
    return invalid("journal_unavailable", `Journal root verification failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
  const confinement = await verifyConfinement(input.repositoryRoot, paths.value.root);
  if (confinement.state === "invalid") return confinement;
  return (await readExistingText(paths.value.journalPath)) ?? invalid("mission_missing", `Mission journal does not exist: ${input.missionId}.`);
}

function parseJournalLines(text: string): ContractResult<unknown[]> {
  if (text.length === 0) return invalid("malformed", "Journal text must be non-empty.");
  if (!text.endsWith("\n")) return invalid("recovery_required", "Journal has an incomplete final line.");
  const lines = text.slice(0, -1).split("\n");
  const entries: unknown[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].length === 0) return invalid("malformed", `Journal line ${index + 1} is empty.`);
    try { entries.push(JSON.parse(lines[index])); }
    catch { return invalid("recovery_required", `Journal line ${index + 1} is malformed JSON.`); }
  }
  return valid(entries);
}

export async function readSupervisedMissionJournal(input: MissionJournalReadInput): Promise<ContractResult<{ entries: SupervisedJournalEntry[]; projection: SupervisedMissionProjection }>> {
  const text = await readVerifiedJournalText(input);
  return text.state === "invalid" ? text : parseSupervisedJournalJsonl(text.value);
}

export async function readMissionJournalForDisplay(input: MissionJournalReadInput): Promise<ContractResult<MissionJournalDisplay>> {
  const text = await readVerifiedJournalText(input);
  if (text.state === "invalid") return text;
  const parsed = parseJournalLines(text.value);
  if (parsed.state === "invalid") return parsed;
  let hasProfileAware = false;
  let hasOther = false;
  for (const [index, entry] of parsed.value.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry) || typeof (entry as { schemaVersion?: unknown }).schemaVersion !== "number") {
      return invalid("malformed", `Journal line ${index + 1} schemaVersion is invalid.`);
    }
    const schemaVersion = (entry as { schemaVersion: number }).schemaVersion;
    if (!Number.isInteger(schemaVersion) || schemaVersion < 2 || schemaVersion > 9) {
      return invalid("unsupported_schema", `Journal line ${index + 1} schemaVersion is unsupported.`);
    }
    if (schemaVersion === 9) hasProfileAware = true;
    else hasOther = true;
  }
  if (hasProfileAware && hasOther) return invalid("schema_mixed", "Schema 9 entries cannot be mixed with legacy journal entries.");
  if (hasProfileAware) {
    const replay = replayProfileAwareMissionJournal(parsed.value);
    if (replay.state === "invalid") return invalidMany(replay.code, replay.errors);
    if (replay.value.missionId !== input.missionId) return invalid("mission_mismatch", "Journal missionId does not match the requested mission.");
    return valid({ kind: "profile-aware", entries: parsed.value as ProfileAwareMissionEntryV1[], projection: replay.value });
  }
  const replay = parseSupervisedJournalJsonl(text.value);
  if (replay.state === "invalid") return replay;
  if (replay.value.projection.missionId !== input.missionId) return invalid("mission_mismatch", "Journal missionId does not match the requested mission.");
  return valid({ kind: "supervised", entries: replay.value.entries, projection: replay.value.projection });
}

export async function appendSupervisedMissionEntry(input: {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  entry: SupervisedJournalEntry;
}): Promise<ContractResult<{ journalPath: string; projection: SupervisedMissionProjection }>> {
  const paths = resolveSupervisedMissionPaths(input.repositoryRoot, input.configuredJournalPath, input.missionId);
  if (paths.state === "invalid") return paths;
  if (input.entry.missionId !== input.missionId) return invalid("mission_mismatch", "Entry missionId does not match.");
  try { await mkdir(paths.value.root, { recursive: true }); }
  catch (error) { return invalid("journal_unavailable", `Journal directory creation failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`); }
  const confinement = await verifyConfinement(input.repositoryRoot, paths.value.root);
  if (confinement.state === "invalid") return confinement;
  let lockHandle;
  try { lockHandle = await open(paths.value.lockPath, "wx"); }
  catch (error) {
    return invalid(
      (error as NodeJS.ErrnoException).code === "EEXIST" ? "journal_lock_held" : "journal_unavailable",
      (error as NodeJS.ErrnoException).code === "EEXIST" ? "Journal lock is held." : "Journal lock acquisition failed.",
    );
  }
  try {
    const current = await readExisting(paths.value.journalPath);
    if (current?.state === "invalid") return current;
    const entries = current?.value.entries ?? [];
    if (input.entry.sequence !== entries.length) return invalid("sequence_invalid", `Entry sequence must be ${entries.length}.`);
    const candidateText = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}${entries.length > 0 ? "\n" : ""}${serializeSupervisedJournalEntry(input.entry)}`;
    const candidate = parseSupervisedJournalJsonl(candidateText);
    if (candidate.state === "invalid") return candidate;
    let journalHandle;
    try {
      journalHandle = await open(
        paths.value.journalPath,
        constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
        0o644,
      );
      const stats = await journalHandle.stat();
      if (!stats.isFile()) throw Object.assign(new Error("unsafe journal target"), { code: "UNSAFE_PATH" });
      const serialized = serializeSupervisedJournalEntry(input.entry);
      const write = await journalHandle.write(serialized, null, "utf8");
      if (write.bytesWritten !== Buffer.byteLength(serialized, "utf8")) throw Object.assign(new Error("short write"), { code: "SHORT_WRITE" });
      await journalHandle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "unknown_error";
      return code === "ELOOP" || code === "UNSAFE_PATH"
        ? invalid("unsafe_path", "Mission journal must be a regular file and must not be a symlink.")
        : invalid("recovery_required", `Journal append or sync is uncertain: ${code}.`);
    } finally {
      await journalHandle?.close().catch(() => undefined);
    }
    return valid({ journalPath: paths.value.journalPath, projection: candidate.value.projection });
  } finally {
    await lockHandle.close().catch(() => undefined);
    await unlink(paths.value.lockPath).catch(() => undefined);
  }
}

export async function initializeSupervisedMissionJournal(input: {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  entries: SupervisedJournalEntry[];
}): Promise<ContractResult<{ journalPath: string; projection: SupervisedMissionProjection }>> {
  const paths = resolveSupervisedMissionPaths(input.repositoryRoot, input.configuredJournalPath, input.missionId);
  if (paths.state === "invalid") return paths;
  if (input.entries.length === 0 || input.entries.some((entry, index) => entry.missionId !== input.missionId || entry.sequence !== index)) return invalid("sequence_invalid", "Initial mission entries must be contiguous and match the mission.");
  try { await mkdir(paths.value.root, { recursive: true }); }
  catch (error) { return invalid("journal_unavailable", `Journal directory creation failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`); }
  const confinement = await verifyConfinement(input.repositoryRoot, paths.value.root); if (confinement.state === "invalid") return confinement;
  let lockHandle;
  try { lockHandle = await open(paths.value.lockPath, "wx"); }
  catch (error) { return invalid((error as NodeJS.ErrnoException).code === "EEXIST" ? "journal_lock_held" : "journal_unavailable", "Journal lock acquisition failed."); }
  try {
    const existing = await readExisting(paths.value.journalPath); if (existing !== null) return invalid("mission_exists", `Mission journal already exists: ${input.missionId}.`);
    const serialized = input.entries.map(serializeSupervisedJournalEntry).join("");
    const candidate = parseSupervisedJournalJsonl(serialized); if (candidate.state === "invalid") return candidate;
    let handle;
    try {
      handle = await open(paths.value.journalPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
      const write = await handle.write(serialized, null, "utf8"); if (write.bytesWritten !== Buffer.byteLength(serialized)) throw Object.assign(new Error("short write"), { code: "SHORT_WRITE" });
      await handle.sync();
    } catch (error) { return invalid("recovery_required", `Journal initialization or sync is uncertain: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`); }
    finally { await handle?.close().catch(() => undefined); }
    return valid({ journalPath: paths.value.journalPath, projection: candidate.value.projection });
  } finally { await lockHandle.close().catch(() => undefined); await unlink(paths.value.lockPath).catch(() => undefined); }
}
