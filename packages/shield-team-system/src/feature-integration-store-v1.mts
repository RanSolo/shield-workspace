import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  canonicalFeatureIntegrationJsonV1,
  createFeatureOperationJournalV1,
  replayFeatureOperationJournalV1,
  validateFeatureOperationJournalV1,
  type FeatureOperationJournalEntryV1,
  type FeatureOperationJournalV1,
} from "./feature-integration-v1.mjs";

export const FEATURE_INTEGRATION_STORE_CONTRACT_VERSION = "feature.integration.store.v1" as const;

export interface FeatureIntegrationStoreScopeV1 {
  repositoryRoot: string;
  operationId: string;
  lockOwnerId: string;
}

export interface FeatureIntegrationStorePathsV1 {
  repositoryRoot: string;
  directoryPath: string;
  journalPath: string;
  lockPath: string;
}

export type FeatureIntegrationStoreResultV1<T> =
  | { state: "accepted"; value: Readonly<T> }
  | { state: "blocked"; code: string; errors: readonly string[] }
  | { state: "recovery_required"; code: "durability_uncertain"; journalPath: string; expectedJournalDigest: string | null };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

function accepted<T>(value: T): FeatureIntegrationStoreResultV1<T> {
  return { state: "accepted", value: Object.freeze(structuredClone(value)) };
}
function blocked<T>(code: string, message: string): FeatureIntegrationStoreResultV1<T> {
  return { state: "blocked", code, errors: [message] };
}
function safeName(operationId: string): string {
  return createHash("sha256").update(operationId, "utf8").digest("hex");
}
function strictScope(input: unknown): FeatureIntegrationStoreScopeV1 | null {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.length !== 3 || keys.some((key) => typeof key !== "string" || !["repositoryRoot", "operationId", "lockOwnerId"].includes(key))) return null;
    const value = input as FeatureIntegrationStoreScopeV1;
    if (typeof value.repositoryRoot !== "string" || value.repositoryRoot.length === 0 || typeof value.operationId !== "string" || !IDENTIFIER.test(value.operationId) || typeof value.lockOwnerId !== "string" || !IDENTIFIER.test(value.lockOwnerId)) return null;
    return structuredClone(value);
  } catch { return null; }
}

export async function resolveFeatureIntegrationStorePathsV1(input: unknown): Promise<FeatureIntegrationStoreResultV1<FeatureIntegrationStorePathsV1>> {
  const scope = strictScope(input);
  if (!scope) return blocked("malformed_input", "Feature integration store scope is invalid.");
  try {
    const root = await realpath(scope.repositoryRoot);
    const directoryPath = join(root, ".shield", "feature-integration");
    const name = `${safeName(scope.operationId)}.json`;
    const journalPath = join(directoryPath, name);
    const lockPath = `${journalPath}.lock`;
    const rel = relative(root, journalPath);
    if (rel.startsWith(`..${sep}`) || rel === ".." || resolve(journalPath) !== journalPath) return blocked("path_invalid", "Journal path escapes the repository root.");
    return accepted({ repositoryRoot: root, directoryPath, journalPath, lockPath });
  } catch { return blocked("repository_unavailable", "Repository root is unavailable."); }
}

async function regularOrMissing(path: string): Promise<"regular" | "missing" | "unsafe"> {
  try { const stat = await lstat(path); return stat.isFile() && !stat.isSymbolicLink() ? "regular" : "unsafe"; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unsafe"; }
}

function parseJournal(bytes: string, operationId: string): FeatureIntegrationStoreResultV1<{ journal: FeatureOperationJournalV1; bytes: string }> {
  try {
    if (!bytes.endsWith("\n") || bytes.slice(0, -1).includes("\n")) return blocked("journal_invalid", "Journal bytes are not one canonical record.");
    const parsed = JSON.parse(bytes.slice(0, -1));
    const checked = validateFeatureOperationJournalV1(parsed);
    if (checked.state !== "valid" || checked.value.operationId !== operationId || canonicalFeatureIntegrationJsonV1(checked.value) + "\n" !== bytes) return blocked("journal_invalid", "Journal validation failed.");
    const replay = replayFeatureOperationJournalV1(checked.value);
    if (replay.state !== "valid") return blocked("replay_invalid", `Journal replay failed: ${replay.reason}.`);
    return accepted({ journal: checked.value, bytes });
  } catch { return blocked("journal_invalid", "Journal parsing failed."); }
}

export async function readFeatureOperationJournalStoreV1(input: unknown): Promise<FeatureIntegrationStoreResultV1<{ journal: FeatureOperationJournalV1 | null; bytes: string; journalPath: string }>> {
  const scope = strictScope(input); if (!scope) return blocked("malformed_input", "Feature integration store scope is invalid.");
  const paths = await resolveFeatureIntegrationStorePathsV1(scope); if (paths.state !== "accepted") return paths;
  const kind = await regularOrMissing(paths.value.journalPath);
  if (kind === "missing") return accepted({ journal: null, bytes: "", journalPath: paths.value.journalPath });
  if (kind !== "regular") return blocked("unsafe_file", "Journal must be a regular non-symlink file.");
  try {
    const bytes = await readFile(paths.value.journalPath, "utf8");
    const parsed = parseJournal(bytes, scope.operationId); if (parsed.state !== "accepted") return parsed;
    return accepted({ ...parsed.value, journalPath: paths.value.journalPath });
  } catch { return blocked("read_failed", "Journal read failed."); }
}

async function withLock<T>(scope: FeatureIntegrationStoreScopeV1, run: (paths: FeatureIntegrationStorePathsV1) => Promise<FeatureIntegrationStoreResultV1<T>>): Promise<FeatureIntegrationStoreResultV1<T>> {
  const paths = await resolveFeatureIntegrationStorePathsV1(scope); if (paths.state !== "accepted") return paths;
  try { await mkdir(paths.value.directoryPath, { recursive: true, mode: 0o700 }); }
  catch { return blocked("staging_failed", "Journal directory could not be created."); }
  if (await regularOrMissing(paths.value.directoryPath) !== "unsafe") return blocked("unsafe_file", "Journal directory is not a directory.");
  let handle;
  try {
    handle = await open(paths.value.lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${scope.lockOwnerId}\n`, "utf8"); await handle.sync(); await handle.close(); handle = undefined;
  } catch (error) {
    try { await handle?.close(); } catch {}
    return blocked((error as NodeJS.ErrnoException).code === "EEXIST" ? "lock_conflict" : "lock_failed", "Feature integration journal lock was not acquired.");
  }
  try { return await run(paths.value); }
  finally { try { await unlink(paths.value.lockPath); } catch {} }
}

async function replaceJournal(paths: FeatureIntegrationStorePathsV1, journal: FeatureOperationJournalV1, mode: number): Promise<FeatureIntegrationStoreResultV1<{ journal: FeatureOperationJournalV1; bytes: string; journalPath: string }>> {
  const bytes = `${canonicalFeatureIntegrationJsonV1(journal)}\n`;
  const temporary = join(dirname(paths.journalPath), `.${safeName(journal.operationId)}.${randomUUID()}.tmp`);
  let handle; let replaced = false;
  try {
    handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode);
    await handle.writeFile(bytes, "utf8"); await handle.sync(); await handle.close(); handle = undefined;
    await rename(temporary, paths.journalPath); replaced = true;
    const file = await open(paths.journalPath, constants.O_RDONLY | constants.O_NOFOLLOW); await file.sync(); await file.close();
    const directory = await open(paths.directoryPath, constants.O_RDONLY | constants.O_DIRECTORY); await directory.sync(); await directory.close();
    const observed = await readFile(paths.journalPath, "utf8");
    if (observed !== bytes) return { state: "recovery_required", code: "durability_uncertain", journalPath: paths.journalPath, expectedJournalDigest: journal.journalDigest };
    return accepted({ journal, bytes, journalPath: paths.journalPath });
  } catch {
    try { await handle?.close(); } catch {}
    if (!replaced) { try { await unlink(temporary); } catch {} return blocked("staging_failed", "Journal replacement failed before rename."); }
    return { state: "recovery_required", code: "durability_uncertain", journalPath: paths.journalPath, expectedJournalDigest: journal.journalDigest };
  }
}

export async function initializeFeatureOperationJournalStoreV1(input: FeatureIntegrationStoreScopeV1 & { journal: FeatureOperationJournalV1 }): Promise<FeatureIntegrationStoreResultV1<{ journal: FeatureOperationJournalV1; bytes: string; journalPath: string }>> {
  const scope = strictScope({ repositoryRoot: input?.repositoryRoot, operationId: input?.operationId, lockOwnerId: input?.lockOwnerId });
  if (!scope) return blocked("malformed_input", "Initialize input is invalid.");
  const checked = validateFeatureOperationJournalV1(input.journal); if (checked.state !== "valid" || checked.value.operationId !== scope.operationId || replayFeatureOperationJournalV1(checked.value).state !== "valid") return blocked("journal_invalid", "Initial journal is invalid or not replayable.");
  return withLock(scope, async (paths) => {
    const kind = await regularOrMissing(paths.journalPath);
    if (kind === "unsafe") return blocked("unsafe_file", "Journal path is unsafe.");
    if (kind === "regular") {
      const current = await readFeatureOperationJournalStoreV1(scope);
      if (current.state !== "accepted" || !current.value.journal) return current as FeatureIntegrationStoreResultV1<{ journal: FeatureOperationJournalV1; bytes: string; journalPath: string }>;
      return current.value.journal.journalDigest === checked.value.journalDigest ? accepted({ journal: current.value.journal, bytes: current.value.bytes, journalPath: current.value.journalPath }) : blocked("initialize_conflict", "A different journal already exists.");
    }
    return replaceJournal(paths, checked.value, 0o600);
  });
}

export async function appendFeatureOperationJournalStoreV1(input: FeatureIntegrationStoreScopeV1 & { expectedEntrySequence: number; expectedLatestEntryDigest: string; entry: FeatureOperationJournalEntryV1 }): Promise<FeatureIntegrationStoreResultV1<{ journal: FeatureOperationJournalV1; bytes: string; journalPath: string }>> {
  const scope = strictScope({ repositoryRoot: input?.repositoryRoot, operationId: input?.operationId, lockOwnerId: input?.lockOwnerId });
  if (!scope || !Number.isSafeInteger(input?.expectedEntrySequence) || input.expectedEntrySequence < 1 || !DIGEST.test(input.expectedLatestEntryDigest)) return blocked("malformed_input", "Append input is invalid.");
  return withLock(scope, async (paths) => {
    const current = await readFeatureOperationJournalStoreV1(scope);
    if (current.state !== "accepted" || !current.value.journal) return current.state === "accepted" ? blocked("journal_missing", "Journal is not initialized.") : current;
    const journal = current.value.journal;
    const existing = journal.entries[input.entry.entrySequence];
    if (existing) return existing.entryDigest === input.entry.entryDigest ? accepted({ journal, bytes: current.value.bytes, journalPath: current.value.journalPath }) : blocked("append_conflict", "Entry sequence is already occupied.");
    if (journal.entries.length !== input.expectedEntrySequence || journal.latestAcceptedEntryDigest !== input.expectedLatestEntryDigest || input.entry.entrySequence !== input.expectedEntrySequence || input.entry.previousEntryDigest !== input.expectedLatestEntryDigest || input.entry.operationId !== scope.operationId) return blocked("compare_conflict", "Expected journal sequence or digest does not match.");
    let candidate: FeatureOperationJournalV1;
    try { candidate = createFeatureOperationJournalV1([...journal.entries, input.entry]); }
    catch { return blocked("entry_invalid", "Appended entry is invalid."); }
    if (replayFeatureOperationJournalV1(candidate).state !== "valid") return blocked("replay_invalid", "Appended journal does not replay.");
    const stat = await lstat(paths.journalPath); return replaceJournal(paths, candidate, stat.mode & 0o777);
  });
}

export async function recoverFeatureOperationJournalStoreV1(input: FeatureIntegrationStoreScopeV1 & { baselineJournalDigest: string | null; candidateJournalDigest: string }): Promise<FeatureIntegrationStoreResultV1<{ classification: "unchanged_baseline" | "complete_candidate"; journal: FeatureOperationJournalV1 | null }>> {
  const scope = strictScope({ repositoryRoot: input?.repositoryRoot, operationId: input?.operationId, lockOwnerId: input?.lockOwnerId });
  if (!scope || !(input.baselineJournalDigest === null || DIGEST.test(input.baselineJournalDigest)) || !DIGEST.test(input.candidateJournalDigest)) return blocked("malformed_input", "Recovery input is invalid.");
  const current = await readFeatureOperationJournalStoreV1(scope);
  if (current.state !== "accepted") return blocked("recovery_unverifiable", "Current journal cannot be verified.");
  const digest = current.value.journal?.journalDigest ?? null;
  if (digest === input.candidateJournalDigest) return accepted({ classification: "complete_candidate", journal: current.value.journal });
  if (digest === input.baselineJournalDigest) return accepted({ classification: "unchanged_baseline", journal: current.value.journal });
  return blocked("recovery_unverifiable", "Observed journal is neither baseline nor candidate.");
}
