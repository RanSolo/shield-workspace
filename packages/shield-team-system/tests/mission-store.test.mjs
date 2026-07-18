import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  computeEd25519SigningKeyRef,
  createMissionBegunEntry,
  createSupervisedMissionBrief,
  serializeSupervisedJournalEntry,
} from "../dist/mission-v2.mjs";
import {
  appendSupervisedMissionEntry,
  readSupervisedMissionJournal,
  resolveSupervisedMissionPaths,
} from "../dist/mission-store.mjs";

function fixtureEntry() {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId: "mission:store-fixture",
    objective: "Exercise the durable supervised mission journal.",
    subjectId: "mission-plan:store-fixture",
    riskFlags: {
      production: false, destructive: false, migration: false,
      credentialsOrSecurity: false, externalCommunication: false,
      merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: [{ seatId: "coulson" }, { seatId: "fitz" }],
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-07-18T20:00:00Z", provenance: "humanRecorded" },
  });
  const binding = {
    schemaVersion: 1,
    bindingId: "binding:coulson",
    humanPrincipalId: "human:coulson",
    seatId: "coulson",
    missionScope: "*",
    signingKeyRef,
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:coulson",
  };
  return { brief, entry: createMissionBegunEntry(brief, [binding]) };
}

test("append, sync, and restart replay preserve the exact durable projection", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-"));
  const { brief, entry } = fixtureEntry();
  const input = { repositoryRoot, configuredJournalPath: ".shield/journals", missionId: brief.missionId };
  const appended = await appendSupervisedMissionEntry({ ...input, entry });
  assert.equal(appended.state, "valid", appended.errors?.join(" "));

  const firstRead = await readSupervisedMissionJournal(input);
  const restartRead = await readSupervisedMissionJournal(input);
  assert.equal(firstRead.state, "valid", firstRead.errors?.join(" "));
  assert.deepEqual(restartRead, firstRead);
  assert.equal(await readFile(appended.value.journalPath, "utf8"), serializeSupervisedJournalEntry(entry));
});

test("an existing lock fails closed without changing journal bytes", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-lock-"));
  const { brief, entry } = fixtureEntry();
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", brief.missionId).value;
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.journalPath, serializeSupervisedJournalEntry(entry));
  const lock = await open(paths.lockPath, "wx");
  const before = await readFile(paths.journalPath, "utf8");
  try {
    const result = await appendSupervisedMissionEntry({ repositoryRoot, configuredJournalPath: ".shield/journals", missionId: brief.missionId, entry });
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "journal_lock_held");
    assert.equal(await readFile(paths.journalPath, "utf8"), before);
  } finally {
    await lock.close();
  }
});

test("an incomplete tail requires recovery and is never repaired implicitly", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-tail-"));
  const { brief, entry } = fixtureEntry();
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", brief.missionId).value;
  await mkdir(paths.root, { recursive: true });
  const partial = `${serializeSupervisedJournalEntry(entry)}{\"schemaVersion\":2`;
  await writeFile(paths.journalPath, partial);
  const result = await readSupervisedMissionJournal({ repositoryRoot, configuredJournalPath: ".shield/journals", missionId: brief.missionId });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "recovery_required");
  assert.equal(await readFile(paths.journalPath, "utf8"), partial);
});

test("a symlinked journal root cannot escape the repository", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-store-outside-"));
  const { brief, entry } = fixtureEntry();
  await mkdir(join(repositoryRoot, ".shield"), { recursive: true });
  await symlink(outside, join(repositoryRoot, ".shield", "journals"));
  const result = await appendSupervisedMissionEntry({
    repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: brief.missionId,
    entry,
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "unsafe_path");
});

test("a per-mission journal symlink cannot escape on read or append", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-file-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-store-file-outside-"));
  const { brief, entry } = fixtureEntry();
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", brief.missionId).value;
  await mkdir(paths.root, { recursive: true });
  const outsideJournal = join(outside, "captured.jsonl");
  const outsideBytes = serializeSupervisedJournalEntry(entry);
  await writeFile(outsideJournal, outsideBytes);
  await symlink(outsideJournal, paths.journalPath);

  const input = { repositoryRoot, configuredJournalPath: ".shield/journals", missionId: brief.missionId };
  const readResult = await readSupervisedMissionJournal(input);
  assert.equal(readResult.state, "invalid");
  assert.equal(readResult.code, "unsafe_path");

  const appendResult = await appendSupervisedMissionEntry({ ...input, entry });
  assert.equal(appendResult.state, "invalid");
  assert.equal(appendResult.code, "unsafe_path");
  assert.equal(await readFile(outsideJournal, "utf8"), outsideBytes);
});
