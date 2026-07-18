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

const valid = <T,>(value: T): ContractResult<T> => ({ state: "valid", value });
const invalid = <T = never,>(code: string, message: string): ContractResult<T> => ({ state: "invalid", code, errors: [message] });

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

async function readExisting(path: string): Promise<ContractResult<{ entries: SupervisedJournalEntry[]; projection: SupervisedMissionProjection }> | null> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    if (!stats.isFile()) return invalid("unsafe_path", "Mission journal must be a regular file.");
    return parseSupervisedJournalJsonl(await handle.readFile("utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if ((error as NodeJS.ErrnoException).code === "ELOOP") return invalid("unsafe_path", "Mission journal must not be a symlink.");
    return invalid("journal_unavailable", `Journal read failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function readSupervisedMissionJournal(input: {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
}): Promise<ContractResult<{ entries: SupervisedJournalEntry[]; projection: SupervisedMissionProjection }>> {
  const paths = resolveSupervisedMissionPaths(input.repositoryRoot, input.configuredJournalPath, input.missionId);
  if (paths.state === "invalid") return paths;
  try { await realpath(paths.value.root); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return invalid("mission_missing", `Mission journal does not exist: ${input.missionId}.`);
    return invalid("journal_unavailable", `Journal root verification failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
  const confinement = await verifyConfinement(input.repositoryRoot, paths.value.root);
  if (confinement.state === "invalid") return confinement;
  return (await readExisting(paths.value.journalPath)) ?? invalid("mission_missing", `Mission journal does not exist: ${input.missionId}.`);
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
