import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { basename, dirname, relative, resolve, sep } from "node:path";
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

type ProfileAwareBatchJournalInput = {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  entries: ProfileAwareMissionEntryV1[];
  expectedStartingJournalSha256: string;
};

export type ProfileAwareBatchReceipt = {
  journalPath: string;
  projection: ProfileAwareProjectionV1;
  startingSequence: number;
  endingSequence: number;
  startingJournalSha256: string;
  finalJournalSha256: string;
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

export function journalByteSha256(bytes: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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

function snapshotProfileAwareBatchInput(input: unknown): ContractResult<ProfileAwareBatchJournalInput> {
  if (!isPlainObject(input)) return invalid("malformed_input", "Profile-aware mission batch input is not a closed object.");
  const fields = ["repositoryRoot", "configuredJournalPath", "missionId", "entries", "expectedStartingJournalSha256"] as const;
  const keys = Reflect.ownKeys(input);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key as typeof fields[number])) ||
      fields.some((field) => {
        const descriptor = descriptors[field];
        return !descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable;
      })) {
    return invalid("malformed_input", "Profile-aware mission batch input has unknown or unsafe fields.");
  }
  const repositoryRoot = descriptors.repositoryRoot.value;
  const configuredJournalPath = descriptors.configuredJournalPath.value;
  const missionId = descriptors.missionId.value;
  const expectedStartingJournalSha256 = descriptors.expectedStartingJournalSha256.value;
  const suppliedEntries = descriptors.entries.value;
  if (typeof repositoryRoot !== "string" || typeof configuredJournalPath !== "string" || typeof missionId !== "string" ||
      typeof expectedStartingJournalSha256 !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(expectedStartingJournalSha256)) {
    return invalid("malformed_input", "Profile-aware mission batch identity or digest is malformed.");
  }
  if (!Array.isArray(suppliedEntries) || Object.getPrototypeOf(suppliedEntries) !== Array.prototype ||
      suppliedEntries.length < 1 || suppliedEntries.length > 32 || Reflect.ownKeys(suppliedEntries).length !== suppliedEntries.length + 1) {
    return invalid("malformed_input", "Profile-aware mission batch entries must be a non-empty dense array.");
  }
  const arrayDescriptors = Object.getOwnPropertyDescriptors(suppliedEntries);
  for (let index = 0; index < suppliedEntries.length; index += 1) {
    const descriptor = arrayDescriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
      return invalid("malformed_input", "Profile-aware mission batch entries contain unsafe elements.");
    }
  }
  let entries: ProfileAwareMissionEntryV1[];
  try {
    entries = JSON.parse(canonicalJson(suppliedEntries)) as ProfileAwareMissionEntryV1[];
  } catch {
    return invalid("malformed", "Profile-aware mission batch entries cannot be canonicalized.");
  }
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!isPlainObject(entry) || entry.schemaVersion !== 9 || entry.missionId !== missionId) {
      return invalid("unsupported_schema", "Profile-aware mission batch supports only matching schema 9 entries.");
    }
    if (index > 0 && entry.sequence !== entries[index - 1].sequence + 1) {
      return invalid("sequence_invalid", "Profile-aware mission batch sequences must be contiguous.");
    }
  }
  return valid({ repositoryRoot, configuredJournalPath, missionId, entries, expectedStartingJournalSha256 });
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

async function ensureProfileAwareJournalRoot(
  repositoryRoot: string,
  journalRoot: string,
): Promise<ContractResult<never>> {
  const lexicalRepositoryRoot = resolve(repositoryRoot);
  let repositoryStats;
  try {
    repositoryStats = await lstat(lexicalRepositoryRoot);
  } catch (error) {
    return invalid("journal_unavailable", `Repository root verification failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
  if (repositoryStats.isSymbolicLink() || !repositoryStats.isDirectory()) {
    return invalid("unsafe_path", "Repository root must be a real directory.");
  }

  const fromRepository = relative(lexicalRepositoryRoot, journalRoot);
  if (fromRepository === "" || fromRepository === ".." || fromRepository.startsWith(`..${sep}`)) {
    return invalid("unsafe_path", "Journal root escapes or equals the repository root.");
  }

  let current = lexicalRepositoryRoot;
  for (const component of fromRepository.split(sep)) {
    current = resolve(current, component);
    let created = false;
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        return invalid("unsafe_path", "Profile-aware journal path components must be real directories.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return invalid("journal_unavailable", `Journal directory verification failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
      }
      try {
        await mkdir(current);
        created = true;
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") {
          return invalid("journal_unavailable", `Journal directory creation failed: ${(mkdirError as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
        }
      }
      try {
        const stats = await lstat(current);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          return invalid("unsafe_path", "Profile-aware journal path components must be real directories.");
        }
      } catch (verifyError) {
        return invalid("journal_unavailable", `Created journal directory verification failed: ${(verifyError as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
      }
    }
    if (created && (!await syncDirectory(current) || !await syncDirectory(dirname(current)))) {
      return invalid("recovery_required", "Profile-aware journal directory creation could not be made durable.");
    }
  }
  return valid(undefined as never);
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

export async function initializeProfileAwareMissionJournalV1(input: unknown): Promise<ContractResult<{ journalPath: string; projection: ProfileAwareProjectionV1 }>> {
  const checked = snapshotProfileAwareInput(input);
  if (checked.state === "invalid") return checked;
  const { repositoryRoot, configuredJournalPath, missionId, entry } = checked.value;
  if (entry.missionId !== missionId) return invalid("mission_mismatch", "Initial entry missionId does not match the requested mission.");
  if (entry.sequence !== 0 || entry.type !== "mission.begun") {
    return invalid("sequence_invalid", "Profile-aware initialization requires exactly one sequence-0 mission.begun entry.");
  }

  const candidateReplay = replayProfileAwareMissionJournal([entry]);
  if (candidateReplay.state === "invalid") return invalidMany(candidateReplay.code, candidateReplay.errors);
  if (candidateReplay.value.missionId !== missionId) return invalid("mission_mismatch", "Initial profile-aware projection does not match the requested mission.");
  const candidateBytes = lineJson(entry);

  const paths = resolveSupervisedMissionPaths(repositoryRoot, configuredJournalPath, missionId);
  if (paths.state === "invalid") return paths;
  const root = await ensureProfileAwareJournalRoot(repositoryRoot, paths.value.root);
  if (root.state === "invalid") return root;
  const confinement = await verifyConfinement(repositoryRoot, paths.value.root);
  if (confinement.state === "invalid") return confinement;

  const token = await acquireProfileAwareLock(paths.value);
  if (token.state === "invalid") return token;

  let result: ContractResult<{ journalPath: string; projection: ProfileAwareProjectionV1 }>;
  try {
    const existing = await readExistingText(paths.value.journalPath);
    if (existing !== null) {
      result = existing.state === "invalid"
        ? existing
        : invalid("mission_exists", `Mission journal already exists: ${missionId}.`);
    } else {
      let handle;
      try {
        handle = await open(
          paths.value.journalPath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o644,
        );
        const stats = await handle.stat();
        if (!stats.isFile()) {
          result = invalid("unsafe_path", "Mission journal must be a regular file.");
        } else {
          const write = await handle.write(candidateBytes, null, "utf8");
          if (write.bytesWritten !== lineLength(candidateBytes)) {
            result = invalid("recovery_required", "Profile-aware mission initialization write was incomplete.");
          } else {
            await handle.sync();
            result = valid({ journalPath: paths.value.journalPath, projection: candidateReplay.value });
          }
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EEXIST") result = invalid("mission_exists", `Mission journal already exists: ${missionId}.`);
        else if (code === "ELOOP") result = invalid("unsafe_path", "Mission journal must not be a symlink.");
        else result = invalid("recovery_required", `Profile-aware mission initialization or sync failed: ${code ?? "unknown_error"}.`);
      } finally {
        await handle?.close().catch(() => undefined);
      }

      if (result.state === "valid") {
        if (!await syncDirectory(paths.value.root)) {
          result = invalid("recovery_required", "Profile-aware mission journal parent directory sync failed after creation.");
        } else {
          const after = await readProfileAwareMissionJournal(paths.value);
          if (after.state === "invalid") {
            result = invalidMany("recovery_required", after.errors.length > 0 ? after.errors : ["Profile-aware journal reread failed after initialization."]);
          } else if (after.value.bytes !== candidateBytes) {
            result = invalid("recovery_required", "Profile-aware mission initialization readback is not exact.");
          } else {
            result = valid({ journalPath: paths.value.journalPath, projection: after.value.projection });
          }
        }
      }
    }
  } catch (error) {
    result = invalid("recovery_required", `Profile-aware mission initialization failed unexpectedly: ${error instanceof Error ? error.message : String(error)}.`);
  }

  const released = await releaseProfileAwareLock(token.value);
  if (released.state === "invalid") return invalidMany("recovery_required", released.errors);
  return result;
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

type AtomicBatchStage =
  | "locked"
  | "validated"
  | "temp_opened"
  | "temp_written"
  | "temp_synced"
  | "live_revalidated"
  | "mode_restored"
  | "before_rename"
  | "renamed"
  | "directory_synced"
  | "readback_verified"
  | "temp_absence_verified"
  | "lock_released";

type AtomicBatchDependencies = {
  nonce: (size: number) => Uint8Array;
  stage: (stage: AtomicBatchStage) => Promise<void>;
  openTemp: (path: string, flags: number, mode: number) => Promise<unknown>;
  statTemp: (handle: unknown) => Promise<{
    dev: number | bigint;
    ino: number | bigint;
    mode: number;
    size: number;
    isFile: () => boolean;
    isSymbolicLink: () => boolean;
  }>;
  writeTemp: (handle: unknown, content: string) => Promise<number>;
  syncTemp: (handle: unknown) => Promise<void>;
  renameTemp: (source: string, destination: string) => Promise<void>;
};

function defaultAtomicBatchDependencies(): AtomicBatchDependencies {
  return {
    nonce: randomBytes,
    stage: async () => undefined,
    openTemp: (path, flags, mode) => open(path, flags, mode),
    statTemp: (handle) => (handle as Awaited<ReturnType<typeof open>>).stat(),
    writeTemp: async (handle, content) => (await (handle as Awaited<ReturnType<typeof open>>).write(content, 0, "utf8")).bytesWritten,
    syncTemp: (handle) => (handle as Awaited<ReturnType<typeof open>>).sync(),
    renameTemp: rename,
  };
}

function sameFileIdentity(
  left: { dev: number | bigint; ino: number | bigint },
  right: { dev: number | bigint; ino: number | bigint },
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function matchingBatchTemps(paths: MissionJournalPaths): Promise<ContractResult<string[]>> {
  const prefix = `${basename(paths.journalPath)}.batch-`;
  try {
    const names = await readdir(paths.root);
    return valid(names.filter((name) => name.startsWith(prefix) && name.endsWith(".tmp")));
  } catch (error) {
    return invalid("journal_unavailable", `Batch temporary-file scan failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
}

async function readJournalHandle(path: string): Promise<ContractResult<{
  bytes: string;
  identity: { dev: number | bigint; ino: number | bigint };
  mode: number;
}>> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    if (!stats.isFile() || stats.isSymbolicLink()) return invalid("unsafe_path", "Mission journal must be a retained regular file.");
    return valid({
      bytes: await handle.readFile("utf8"),
      identity: { dev: stats.dev, ino: stats.ino },
      mode: stats.mode & 0o777,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return invalid(code === "ELOOP" ? "unsafe_path" : "journal_unavailable", `Mission journal identity read failed: ${code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function cleanupRetainedTemp(
  path: string,
  identity: { dev: number | bigint; ino: number | bigint },
  root: string,
): Promise<boolean> {
  try {
    const observed = await lstat(path);
    if (observed.isSymbolicLink() || !observed.isFile() || !sameFileIdentity(identity, observed)) return false;
    await unlink(path);
    try {
      await lstat(path);
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
    }
    return await syncDirectory(root);
  } catch {
    return false;
  }
}

async function provePathAbsent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

async function appendProfileAwareMissionEntriesAtomicWithDependencies(
  input: unknown,
  dependencies: AtomicBatchDependencies,
): Promise<ContractResult<ProfileAwareBatchReceipt>> {
  const checked = snapshotProfileAwareBatchInput(input);
  if (checked.state === "invalid") return checked;
  const paths = resolveSupervisedMissionPaths(
    checked.value.repositoryRoot,
    checked.value.configuredJournalPath,
    checked.value.missionId,
  );
  if (paths.state === "invalid") return paths;
  const confinement = await verifyConfinement(checked.value.repositoryRoot, paths.value.root);
  if (confinement.state === "invalid") return confinement;

  const token = await acquireProfileAwareLock(paths.value);
  if (token.state === "invalid") return token;
  let result: ContractResult<ProfileAwareBatchReceipt> = invalid("journal_batch_failed", "Profile-aware mission batch did not complete.");
  let renameAttempted = false;
  let tempPath: string | null = null;
  let tempCreationState: "not_attempted" | "uncertain" | "opened" = "not_attempted";
  let tempIdentity: { dev: number | bigint; ino: number | bigint } | null = null;
  let tempHandle: Awaited<ReturnType<typeof open>> | undefined;
  let closeUncertain = false;

  try {
    await dependencies.stage("locked");
    const orphans = await matchingBatchTemps(paths.value);
    if (orphans.state === "invalid") {
      result = orphans;
    } else if (orphans.value.length > 0) {
      result = invalid("recovery_required", "An orphan profile-aware batch temporary file requires identity-safe operator recovery.");
    } else {
      const before = await readProfileAwareMissionJournal(paths.value);
      const original = await readJournalHandle(paths.value.journalPath);
      if (before.state === "invalid") {
        result = before;
      } else if (original.state === "invalid") {
        result = original;
      } else if (before.value.bytes !== original.value.bytes ||
          journalByteSha256(original.value.bytes) !== checked.value.expectedStartingJournalSha256) {
        result = invalid("journal_stale", "Mission journal bytes do not match the expected starting digest.");
      } else if (before.value.projection.missionId !== checked.value.missionId) {
        result = invalid("mission_mismatch", "Mission identity changed while preparing the batch.");
      } else if (checked.value.entries[0].sequence !== before.value.projection.lastSequence + 1) {
        result = invalid("sequence_invalid", `First batch sequence must be ${before.value.projection.lastSequence + 1}.`);
      } else {
        const candidateEntries = [...before.value.entries, ...checked.value.entries];
        const candidateReplay = replayProfileAwareMissionJournal(candidateEntries);
        if (candidateReplay.state === "invalid") {
          result = invalidMany(candidateReplay.code, candidateReplay.errors);
        } else {
          const candidateBytes = `${before.value.bytes}${checked.value.entries.map(lineJson).join("")}`;
          await dependencies.stage("validated");
          let nonce: string;
          try {
            nonce = Buffer.from(dependencies.nonce(24)).toString("base64url");
            if (!/^[A-Za-z0-9_-]{32}$/u.test(nonce)) throw new Error();
          } catch {
            throw new Error("Batch temporary-file entropy failed.");
          }
          tempPath = resolve(paths.value.root, `${basename(paths.value.journalPath)}.batch-${nonce}.tmp`);
          const fromRoot = relative(paths.value.root, tempPath);
          if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || dirname(tempPath) !== paths.value.root) {
            throw new Error("Batch temporary-file confinement failed.");
          }
          tempCreationState = "uncertain";
          tempHandle = await dependencies.openTemp(
            tempPath,
            constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
            0o600,
          ) as Awaited<ReturnType<typeof open>>;
          tempCreationState = "opened";
          const opened = await dependencies.statTemp(tempHandle);
          tempIdentity = { dev: opened.dev, ino: opened.ino };
          const openedPath = await lstat(tempPath);
          if (!opened.isFile() || opened.isSymbolicLink() || (opened.mode & 0o777) !== 0o600 ||
              openedPath.isSymbolicLink() || !openedPath.isFile() || !sameFileIdentity(tempIdentity, openedPath)) {
            throw new Error("Batch temporary-file identity is invalid.");
          }
          await dependencies.stage("temp_opened");
          const bytesWritten = await dependencies.writeTemp(tempHandle, candidateBytes);
          if (bytesWritten !== lineLength(candidateBytes)) throw new Error("Batch temporary-file write was incomplete.");
          const written = await dependencies.statTemp(tempHandle);
          if (!sameFileIdentity(tempIdentity, written) || written.size !== lineLength(candidateBytes) || (written.mode & 0o777) !== 0o600) {
            throw new Error("Batch temporary-file size or identity changed.");
          }
          const verification = Buffer.alloc(lineLength(candidateBytes));
          const readback = await tempHandle.read(verification, 0, verification.length, 0);
          if (readback.bytesRead !== verification.length || verification.toString("utf8") !== candidateBytes) {
            throw new Error("Batch temporary-file bytes are not exact.");
          }
          await dependencies.stage("temp_written");
          await dependencies.syncTemp(tempHandle);
          await dependencies.stage("temp_synced");

          if (!await verifyProfileAwareLockToken(token.value)) throw new Error("Mission journal lock changed before batch replacement.");
          const live = await readJournalHandle(paths.value.journalPath);
          if (live.state === "invalid" || !sameFileIdentity(original.value.identity, live.value.identity) ||
              live.value.mode !== original.value.mode || live.value.bytes !== original.value.bytes ||
              journalByteSha256(live.value.bytes) !== checked.value.expectedStartingJournalSha256) {
            throw new Error("Mission journal changed before batch replacement.");
          }
          await dependencies.stage("live_revalidated");
          await tempHandle.chmod(original.value.mode);
          await dependencies.syncTemp(tempHandle);
          const modeChecked = await dependencies.statTemp(tempHandle);
          const tempPathChecked = await lstat(tempPath);
          if (!modeChecked.isFile() || !sameFileIdentity(tempIdentity, modeChecked) || (modeChecked.mode & 0o777) !== original.value.mode ||
              tempPathChecked.isSymbolicLink() || !tempPathChecked.isFile() || !sameFileIdentity(tempIdentity, tempPathChecked) ||
              (tempPathChecked.mode & 0o777) !== original.value.mode) {
            throw new Error("Batch temporary-file mode or identity changed before replacement.");
          }
          await dependencies.stage("mode_restored");
          const finalTempBytes = Buffer.alloc(lineLength(candidateBytes));
          const finalTempRead = await tempHandle.read(finalTempBytes, 0, finalTempBytes.length, 0);
          const finalLive = await readJournalHandle(paths.value.journalPath);
          if (finalTempRead.bytesRead !== finalTempBytes.length || finalTempBytes.toString("utf8") !== candidateBytes ||
              !await verifyProfileAwareLockToken(token.value) || finalLive.state === "invalid" ||
              !sameFileIdentity(original.value.identity, finalLive.value.identity) || finalLive.value.mode !== original.value.mode ||
              finalLive.value.bytes !== original.value.bytes ||
              journalByteSha256(finalLive.value.bytes) !== checked.value.expectedStartingJournalSha256) {
            throw new Error("Batch journal or temporary bytes changed immediately before replacement.");
          }
          await dependencies.stage("before_rename");
          renameAttempted = true;
          await dependencies.renameTemp(tempPath, paths.value.journalPath);
          await dependencies.stage("renamed");
          const installed = await lstat(paths.value.journalPath);
          if (installed.isSymbolicLink() || !installed.isFile() || !sameFileIdentity(tempIdentity, installed) ||
              (installed.mode & 0o777) !== original.value.mode) {
            throw new Error("Installed batch journal mode or identity is invalid.");
          }
          await tempHandle.close();
          tempHandle = undefined;
          if (!await syncDirectory(paths.value.root)) throw new Error("Batch journal parent directory sync failed.");
          await dependencies.stage("directory_synced");
          const after = await readProfileAwareMissionJournal(paths.value);
          if (after.state === "invalid" || after.value.bytes !== candidateBytes ||
              canonicalJson(after.value.projection) !== canonicalJson(candidateReplay.value)) {
            throw new Error("Batch journal durable readback or replay is not exact.");
          }
          await dependencies.stage("readback_verified");
          const remainingTemps = await matchingBatchTemps(paths.value);
          if (remainingTemps.state === "invalid" || remainingTemps.value.length !== 0) {
            throw new Error("Batch temporary-file absence could not be proven.");
          }
          await dependencies.stage("temp_absence_verified");
          result = valid({
            journalPath: paths.value.journalPath,
            projection: after.value.projection,
            startingSequence: before.value.projection.lastSequence,
            endingSequence: after.value.projection.lastSequence,
            startingJournalSha256: checked.value.expectedStartingJournalSha256,
            finalJournalSha256: journalByteSha256(after.value.bytes),
          });
        }
      }
    }
  } catch (error) {
    result = invalid(
      renameAttempted ? "recovery_required" : "journal_batch_failed",
      renameAttempted
        ? "Batch journal replacement may have occurred; inspect replay before retrying."
        : `Batch journal replacement failed before rename: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (tempHandle) {
    try { await tempHandle.close(); } catch { closeUncertain = true; }
  }
  if (!renameAttempted && tempCreationState !== "not_attempted" && tempPath !== null) {
    const cleanupProven = tempIdentity === null
      ? await provePathAbsent(tempPath)
      : await cleanupRetainedTemp(tempPath, tempIdentity, paths.value.root);
    if (!cleanupProven) {
      result = invalid("recovery_required", "Batch temporary-file cleanup could not be proven.");
    }
  }
  if (closeUncertain) result = invalid("recovery_required", "Batch temporary-file handle close is uncertain.");

  const released = await releaseProfileAwareLock(token.value);
  if (released.state === "invalid") return invalidMany("recovery_required", released.errors);
  try {
    await dependencies.stage("lock_released");
  } catch {
    return invalid("recovery_required", "Batch lock release completion could not be reported safely.");
  }
  return result;
}

export async function appendProfileAwareMissionEntriesAtomicV1(input: unknown): Promise<ContractResult<ProfileAwareBatchReceipt>> {
  return appendProfileAwareMissionEntriesAtomicWithDependencies(input, defaultAtomicBatchDependencies());
}

export const atomicBatchStoreTestOnly = Object.freeze({
  append: (
    input: unknown,
    overrides: Partial<AtomicBatchDependencies>,
  ): Promise<ContractResult<ProfileAwareBatchReceipt>> => appendProfileAwareMissionEntriesAtomicWithDependencies(input, {
    ...defaultAtomicBatchDependencies(),
    ...overrides,
  }),
});

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
