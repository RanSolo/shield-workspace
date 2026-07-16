import { mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { parseJournalJsonl, serializeJournalEntry } from "../contracts/mission-journal.mjs";

const valid = (value) => ({ state: "valid", value });
const invalid = (...errors) => ({ state: "invalid", errors: errors.flat() });

export function safeMissionFilename(missionId) {
  if (typeof missionId !== "string" || missionId.trim().length === 0) return invalid("missionId must be a non-empty string.");
  const encoded = Buffer.from(missionId, "utf8").toString("base64url");
  if (encoded.length === 0 || encoded.length > 180) return invalid("Encoded missionId exceeds the safe filename limit.");
  return valid(`${encoded}.jsonl`);
}
export function resolveMissionJournalPaths(baseDir, missionId) {
  if (typeof baseDir !== "string" || baseDir.trim().length === 0) return invalid("baseDir must be a non-empty string.");
  const filename = safeMissionFilename(missionId);
  if (filename.state === "invalid") return filename;
  const root = resolve(baseDir, ".shield", "journals");
  const journalPath = resolve(root, filename.value), lockPath = `${journalPath}.lock`;
  for (const candidate of [journalPath, lockPath]) {
    const pathFromRoot = relative(root, candidate);
    if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === ".." || candidate === root) return invalid("Journal path escapes the configured root.");
  }
  return valid({ root, journalPath, lockPath });
}
async function readExisting(journalPath, missionId) {
  try { return parseJournalJsonl(missionId, await readFile(journalPath, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") return parseJournalJsonl(missionId, "");
    return invalid(`Journal read failed: ${error?.code ?? "unknown_error"}.`);
  }
}
async function verifyRealConfinement(baseDir, root) {
  try {
    const [realBase, realRoot] = await Promise.all([realpath(baseDir), realpath(root)]);
    const fromBase = relative(realBase, realRoot);
    if (fromBase === ".." || fromBase.startsWith(`..${sep}`)) {
      return invalid("Journal root resolves outside the configured base directory.");
    }
    return valid(realRoot);
  } catch (error) {
    return invalid(`Journal root verification failed: ${error?.code ?? "unknown_error"}.`);
  }
}
export async function readMissionJournal({ baseDir, missionId } = {}) {
  const paths = resolveMissionJournalPaths(baseDir, missionId);
  if (paths.state === "invalid") return paths;
  try { await realpath(paths.value.root); }
  catch (error) {
    if (error?.code === "ENOENT") return parseJournalJsonl(missionId, "");
    return invalid(`Journal root verification failed: ${error?.code ?? "unknown_error"}.`);
  }
  const confinement = await verifyRealConfinement(baseDir, paths.value.root);
  return confinement.state === "invalid" ? confinement : readExisting(paths.value.journalPath, missionId);
}
export async function appendMissionJournalEntry({ baseDir, missionId, entry } = {}) {
  const paths = resolveMissionJournalPaths(baseDir, missionId);
  if (paths.state === "invalid") return paths;
  const serialized = serializeJournalEntry(entry);
  if (serialized.state === "invalid") return serialized;
  if (entry.missionId !== missionId) return invalid("Entry missionId does not match.");
  try { await mkdir(paths.value.root, { recursive: true }); }
  catch (error) { return invalid(`Journal directory creation failed: ${error?.code ?? "unknown_error"}.`); }
  const confinement = await verifyRealConfinement(baseDir, paths.value.root);
  if (confinement.state === "invalid") return confinement;
  let lockHandle;
  try { lockHandle = await open(paths.value.lockPath, "wx"); }
  catch (error) { return invalid(error?.code === "EEXIST" ? "Journal lock is held." : "Journal lock acquisition failed."); }
  try {
    const current = await readExisting(paths.value.journalPath, missionId);
    if (current.state === "invalid") return current;
    if (entry.sequence !== current.value.entries.length) return invalid(`Entry sequence must be ${current.value.entries.length}.`);
    const existingText = current.value.entries.map((value) => JSON.stringify(value)).join("\n");
    const candidate = parseJournalJsonl(missionId, `${existingText}${existingText ? "\n" : ""}${serialized.value}`);
    if (candidate.state === "invalid") return candidate;
    let journalHandle;
    try {
      journalHandle = await open(paths.value.journalPath, "a");
      const write = await journalHandle.write(serialized.value, null, "utf8");
      if (write.bytesWritten !== Buffer.byteLength(serialized.value, "utf8")) {
        throw Object.assign(new Error("short write"), { code: "SHORT_WRITE" });
      }
      await journalHandle.sync();
    } catch (error) {
      return { state: "invalid", code: "recovery_required", errors: [`Journal append or sync is uncertain: ${error?.code ?? "unknown_error"}.`] };
    } finally { await journalHandle?.close().catch(() => {}); }
    return valid({ journalPath: paths.value.journalPath, lastSequence: entry.sequence, projection: candidate.value.projection });
  } finally {
    await lockHandle.close().catch(() => {});
    await unlink(paths.value.lockPath).catch(() => {});
  }
}
