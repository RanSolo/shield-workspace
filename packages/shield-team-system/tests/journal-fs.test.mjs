import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendMissionJournalEntry, readMissionJournal, resolveMissionJournalPaths, safeMissionFilename,
} from "../adapters/journal-fs.mjs";

const ID = "mission/with/path";
const stamp = { value: "2026-01-01T00:00:00Z", provenance: "humanRecorded" };
const event = {
  schemaVersion: 2, eventId: "mission-0", missionId: ID, sequence: 0,
  type: "mission.created", actor: "coulson", previousState: null,
  resultingState: "proposed", timestamp: stamp,
};
const entry = {
  schemaVersion: 1, entryId: "entry-0", missionId: ID, sequence: 0,
  type: "governance.event", timestamp: stamp, payload: { event },
};

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "shield-journal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("uses a bounded base64url filename and confines paths under the journal root", () => {
  const filename = safeMissionFilename(ID);
  assert.equal(filename.state, "valid");
  assert.doesNotMatch(filename.value, /[\\/]/);
  assert.equal(safeMissionFilename("x".repeat(200)).state, "invalid");
  const paths = resolveMissionJournalPaths("/tmp/repo", "../escape");
  assert.equal(paths.state, "valid");
  assert.match(paths.value.journalPath, /\.shield\/journals\//);
});

test("appends, flushes, reads, and replays a journal", async (t) => {
  const baseDir = await temporaryDirectory(t);
  const appended = await appendMissionJournalEntry({ baseDir, missionId: ID, entry });
  assert.equal(appended.state, "valid");
  const read = await readMissionJournal({ baseDir, missionId: ID });
  assert.equal(read.state, "valid");
  assert.equal(read.value.entries.length, 1);
  assert.equal(read.value.projection.missionState, "proposed");
});

test("missing files are valid empty journals", async (t) => {
  const baseDir = await temporaryDirectory(t);
  const read = await readMissionJournal({ baseDir, missionId: ID });
  assert.equal(read.state, "valid");
  assert.deepEqual(read.value.entries, []);
});

test("lock contention fails closed", async (t) => {
  const baseDir = await temporaryDirectory(t);
  const paths = resolveMissionJournalPaths(baseDir, ID).value;
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.lockPath, "held", { flag: "wx" }).catch(async () => {
    const handle = await open(paths.lockPath, "wx"); await handle.close();
  });
  const result = await appendMissionJournalEntry({ baseDir, missionId: ID, entry });
  assert.equal(result.state, "invalid");
  assert.match(result.errors[0], /lock is held/);
});

test("partial tails require recovery and remain untouched", async (t) => {
  const baseDir = await temporaryDirectory(t);
  const paths = resolveMissionJournalPaths(baseDir, ID).value;
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.journalPath, JSON.stringify(entry));
  const before = await readFile(paths.journalPath, "utf8");
  const result = await readMissionJournal({ baseDir, missionId: ID });
  assert.equal(result.code, "recovery_required");
  assert.equal(await readFile(paths.journalPath, "utf8"), before);
});

test("rejects a journal root symlink that escapes the repository", async (t) => {
  const baseDir = await temporaryDirectory(t);
  const outside = await temporaryDirectory(t);
  await mkdir(join(baseDir, ".shield"), { recursive: true });
  await symlink(outside, join(baseDir, ".shield", "journals"));
  const result = await appendMissionJournalEntry({ baseDir, missionId: ID, entry });
  assert.equal(result.state, "invalid");
  assert.match(result.errors[0], /outside the configured base/);
});
