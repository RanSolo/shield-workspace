import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, relative, resolve, sep } from "node:path";
import {
  parseSupervisedJournalJsonl,
  serializeSupervisedJournalEntry,
  canonicalJson,
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

type ProfileAwareJournalInput = {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  entry: ProfileAwareMissionEntryV1;
};

type ProfileAwareLockToken = {
  marker: string;
  path: string;
  ino: number;
  dev: number;
};

type ProfileAwareReadResult = {
  bytes: string;
  entries: ProfileAwareMissionEntryV1[];
  projection: ProfileAwareProjectionV1;
};

const PROFILE_AWARE_LOCK_PREFIX = "mission-profile-aware-lock:v1";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function lineJson(entry: ProfileAwareMissionEntryV1): string {
  return `${canonicalJson(entry)}\n`;
}

function lineLength(line: string): number {
  return Buffer.byteLength(line, "utf8");
}

function snapshotProfileAwareInput(input: unknown): ContractResult<ProfileAwareJournalInput> {
  if (!isPlainObject(input)) return invalid("malformed_input", "Profile-aware mission append input is not a closed object.");
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 4 || keys.some((key) => typeof key !== "string")) {
    return invalid("malformed_input", "Profile-aware mission append input has unknown fields.");
  }
  if (
    !Object.hasOwn(input, "repositoryRoot") ||
    !Object.hasOwn(input, "configuredJournalPath") ||
    !Object.hasOwn(input, "missionId") ||
    !Object.hasOwn(input, "entry")
  ) {
    return invalid("malformed_input", "Profile-aware mission append input is missing fields.");
  }
  const repositoryRoot = input.repositoryRoot;
  const configuredJournalPath = input.configuredJournalPath;
  const missionId = input.missionId;
  const suppliedEntry = input.entry;
  if (typeof repositoryRoot !== "string" || typeof configuredJournalPath !== "string" || typeof missionId !== "string") {
    return invalid("malformed_input", "Profile-aware mission append input must include string repositoryRoot, configuredJournalPath, and missionId.");
  }
  if (!isPlainObject(suppliedEntry)) return invalid("malformed_input", "Profile-aware mission append entry is not a closed object.");
  let canonicalEntry: string;
  try {
    canonicalEntry = canonicalJson(suppliedEntry);
  } catch {
    return invalid("malformed", "Profile-aware mission append entry cannot be canonicalized.");
  }
  const entry = JSON.parse(canonicalEntry) as ProfileAwareMissionEntryV1;
  if (typeof entry !== "object" || entry === null || entry.schemaVersion !== 9) {
    return invalid("unsupported_schema", "Profile-aware mission append supports schema 9 entries only.");
  }
  return valid({
    repositoryRoot,
    configuredJournalPath,
    missionId,
    entry,
  });
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

async function syncDirectory(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
    await handle.sync();
    return true;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function parseProfileAwareJournalText(text: string): Promise<ContractResult<ProfileAwareReadResult>> {
  const parsed = parseJournalLines(text);
  if (parsed.state === "invalid") return parsed;
  if (parsed.value.length === 0) return invalid("malformed", "Profile-aware mission journal must contain entries.");
  let hasProfileAware = false;
  let hasLegacy = false;
  for (const [index, entry] of parsed.value.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry) || typeof (entry as { schemaVersion?: unknown }).schemaVersion !== "number") {
      return invalid("malformed", `Journal line ${index + 1} is malformed.`);
    }
    const schemaVersion = (entry as { schemaVersion: number }).schemaVersion;
    if (!Number.isInteger(schemaVersion)) return invalid("unsupported_schema", `Journal line ${index + 1} has non-integer schemaVersion.`);
    if (schemaVersion === 9) hasProfileAware = true;
    else hasLegacy = true;
  }
  if (!hasProfileAware) return invalid("unsupported_schema", "Profile-aware mission append requires schema 9 entries.");
  if (hasLegacy) return invalid("schema_mixed", "Schema 9 entries cannot be mixed with legacy journal entries.");
  const replay = replayProfileAwareMissionJournal(parsed.value);
  if (replay.state === "invalid") return invalidMany(replay.code, replay.errors);
  return valid({
    bytes: text,
    entries: parsed.value as ProfileAwareMissionEntryV1[],
    projection: replay.value,
  });
}

async function readProfileAwareMissionJournal(paths: MissionJournalPaths): Promise<ContractResult<ProfileAwareReadResult>> {
  const text = await readExistingText(paths.journalPath);
  if (text === null) return invalid("mission_missing", `Mission journal does not exist: ${paths.journalPath}.`);
  if (text.state === "invalid") return text;
  return parseProfileAwareJournalText(text.value);
}

function verifyProfileAwareLockToken(token: ProfileAwareLockToken): Promise<boolean> {
  return open(token.path, constants.O_RDONLY | constants.O_NOFOLLOW)
    .then(async (handle) => {
      try {
        const stats = await handle.stat();
        if (!stats.isFile() || Number(stats.ino) !== token.ino || Number(stats.dev) !== token.dev) return false;
        const marker = await handle.readFile("utf8");
        return marker === token.marker;
      } finally {
        await handle.close().catch(() => undefined);
      }
    })
    .catch(() => false);
}

function isMatchingLockToken(path: string, token: ProfileAwareLockToken): Promise<boolean> {
  return lstat(path)
    .then((stats) => {
      return stats.isFile() && Number(stats.ino) === token.ino && Number(stats.dev) === token.dev;
    })
    .catch(() => false);
}

async function acquireProfileAwareLock(paths: MissionJournalPaths): Promise<ContractResult<ProfileAwareLockToken>> {
  let nonce: string;
  try {
    nonce = randomBytes(24).toString("base64url");
  } catch {
    return invalid("recovery_required", "Profile-aware mission lock entropy source failed.");
  }

  try {
    const existing = await lstat(paths.lockPath);
    if (!existing.isFile() || existing.isSymbolicLink()) {
      return invalid("unsafe_path", "Mission journal lock must be a regular file.");
    }
    return invalid("journal_lock_held", "Mission journal lock is held.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      if ((error as NodeJS.ErrnoException).code === "ELOOP") return invalid("unsafe_path", "Mission journal lock must not be a symbolic path.");
      return invalid("journal_unavailable", `Mission journal lock check failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
    }
  }

  let handle;
  try {
    handle = await open(paths.lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const marker = `${canonicalJson({ marker: PROFILE_AWARE_LOCK_PREFIX, nonce })}\n`;
    const written = await handle.write(marker, null, "utf8");
    if (written.bytesWritten !== Buffer.byteLength(marker, "utf8")) {
      return invalid("recovery_required", "Mission journal lock write was incomplete.");
    }
    await handle.sync();
    const stats = await handle.stat();
    const token: ProfileAwareLockToken = {
      marker,
      path: paths.lockPath,
      ino: Number(stats.ino),
      dev: Number(stats.dev),
    };
    if (!await syncDirectory(paths.root)) {
      return invalid("recovery_required", "Mission journal lock parent directory sync failed.");
    }
    if (!await verifyProfileAwareLockToken(token)) {
      return invalid("recovery_required", "Mission journal lock marker changed after durable creation.");
    }
    return valid(token);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return invalid("journal_lock_held", "Mission journal lock is held.");
    if (code === "ELOOP") return invalid("unsafe_path", "Mission journal lock must not be a symbolic path.");
    return invalid("journal_unavailable", `Mission journal lock acquisition failed: ${code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function releaseProfileAwareLock(token: ProfileAwareLockToken): Promise<ContractResult<never>> {
  if (!await verifyProfileAwareLockToken(token) || !await isMatchingLockToken(token.path, token)) {
    return invalid("recovery_required", "Mission journal lock identity or marker changed before release.");
  }
  try {
    await unlink(token.path);
  } catch (error) {
    return invalid("recovery_required", `Mission journal lock unlink failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
  try {
    await lstat(token.path);
    return invalid("recovery_required", "Mission journal lock path was replaced during release.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return invalid("recovery_required", "Mission journal lock unlink could not be verified.");
    }
  }
  if (!await syncDirectory(dirname(token.path))) {
    return invalid("recovery_required", "Mission journal lock parent directory sync failed after unlink.");
  }
  return valid(undefined as never);
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

export async function appendProfileAwareMissionEntryV1(input: unknown): Promise<ContractResult<{ journalPath: string; projection: ProfileAwareProjectionV1 }>> {
  const checked = snapshotProfileAwareInput(input);
  if (checked.state === "invalid") return checked;

  const paths = resolveSupervisedMissionPaths(checked.value.repositoryRoot, checked.value.configuredJournalPath, checked.value.missionId);
  if (paths.state === "invalid") return paths;

  if (checked.value.entry.missionId !== checked.value.missionId) {
    return invalid("mission_mismatch", "Entry missionId does not match the requested mission.");
  }

  let rootPreExisting = true;
  try { await realpath(paths.value.root); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") rootPreExisting = false;
    else return invalid("journal_unavailable", `Journal root verification failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }

  try {
    await mkdir(paths.value.root, { recursive: true });
    if (!rootPreExisting && !await syncDirectory(dirname(paths.value.root))) {
      return invalid("recovery_required", "Mission journal parent directory sync failed after creation.");
    }
  } catch (error) {
    return invalid("journal_unavailable", `Journal directory creation failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }

  const confinement = await verifyConfinement(checked.value.repositoryRoot, paths.value.root);
  if (confinement.state === "invalid") return confinement;

  const token = await acquireProfileAwareLock(paths.value);
  if (token.state === "invalid") return token;

  let result: ContractResult<{ journalPath: string; projection: ProfileAwareProjectionV1 }>;
  try {
    const before = await readProfileAwareMissionJournal(paths.value);
    if (before.state === "invalid") {
      result = before;
    } else {
      if (before.value.projection.missionId !== checked.value.missionId) {
        result = invalid("mission_mismatch", "Mission identity changed while reading journal.");
      } else {
        const expectedSequence = before.value.projection.lastSequence + 1;
        if (checked.value.entry.sequence !== expectedSequence) {
          result = invalid("sequence_invalid", `Entry sequence must be ${expectedSequence}.`);
        } else {
          const candidateEntries: ProfileAwareMissionEntryV1[] = [...before.value.entries, checked.value.entry];
          const candidateReplay = replayProfileAwareMissionJournal(candidateEntries);
          if (candidateReplay.state === "invalid") {
            result = invalidMany(candidateReplay.code, candidateReplay.errors);
          } else {
            const line = lineJson(checked.value.entry);
            const lineBytes = lineLength(line);
            let journalHandle;
            try {
              journalHandle = await open(
                paths.value.journalPath,
                constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
                0o644,
              );
              const stats = await journalHandle.stat();
              if (!stats.isFile()) {
                result = invalid("unsafe_path", "Mission journal must be a regular file.");
              } else {
                const written = await journalHandle.write(line, null, "utf8");
                if (written.bytesWritten !== lineBytes) {
                  result = invalid("recovery_required", "Mission journal append write was incomplete.");
                } else {
                  await journalHandle.sync();
                  const after = await readProfileAwareMissionJournal(paths.value);
                  if (after.state === "invalid") {
                    result = invalidMany(
                      "recovery_required",
                      after.errors.length > 0 ? after.errors : ["Profile-aware journal reread failed after append."],
                    );
                  } else if (after.value.bytes !== `${before.value.bytes}${line}`) {
                    result = invalid("recovery_required", "Profile-aware mission append readback is not exact.");
                  } else {
                    result = valid({ journalPath: paths.value.journalPath, projection: after.value.projection });
                  }
                }
              }
            } catch (error) {
              const code = (error as NodeJS.ErrnoException).code;
              if (code === "ELOOP") {
                result = invalid("unsafe_path", "Mission journal must not be a symlink.");
              } else {
                result = invalid("recovery_required", `Mission journal append or sync failed: ${code ?? "unknown_error"}.`);
              }
            } finally {
              await journalHandle?.close().catch(() => undefined);
            }
            if (result?.state !== "invalid" && !rootPreExisting) {
              if (!await syncDirectory(dirname(paths.value.journalPath))) {
                result = invalid("recovery_required", "Mission journal parent directory sync failed after creation.");
              }
            }
          }
        }
      }
    }
  } catch (error) {
    result = invalid("recovery_required", `Profile-aware mission append failed unexpectedly: ${error instanceof Error ? error.message : String(error)}.`);
  }

  const released = await releaseProfileAwareLock(token.value);
  if (released.state === "invalid") return invalidMany("recovery_required", released.errors);
  return result;
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
