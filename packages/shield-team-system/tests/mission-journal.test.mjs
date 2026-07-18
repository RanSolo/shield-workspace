import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  JOURNAL_ENTRY_TYPES, JOURNAL_SCHEMA_VERSION, parseJournalJsonl,
  replayMissionJournal, serializeJournalEntry, validateJournalEntry,
} from "../contracts/mission-journal.mjs";

const ID = "mission-journal";
const stamp = (minute) => ({ value: `2026-01-01T00:${String(minute).padStart(2, "0")}:00Z`, provenance: "humanRecorded" });
function missionEvent(sequence, decision, previousState, resultingState, minute = sequence) {
  return sequence === 0 ? {
    schemaVersion: 2, eventId: "mission-0", missionId: ID, sequence: 0,
    type: "mission.created", actor: "coulson", previousState: null,
    resultingState: "proposed", timestamp: stamp(minute),
  } : {
    schemaVersion: 2, eventId: `mission-${sequence}`, missionId: ID, sequence,
    type: "mission.decision", actor: "coulson", previousState, resultingState,
    timestamp: stamp(minute), decision,
  };
}
function entry(sequence, type, payload, minute = sequence) {
  return { schemaVersion: 1, entryId: `entry-${sequence}`, missionId: ID, sequence, type, timestamp: stamp(minute), payload };
}
const governance = (sequence, event) => entry(sequence, "governance.event", { event }, Number(event.timestamp.value.slice(14, 16)));
const transition = (sequence, from, to) => entry(sequence, "execution.transition", { from, to, reason: `${from} to ${to}`, evidenceRef: `evidence-${sequence}` });

test("exposes four closed entry types and validates inherited or unknown data fail closed", () => {
  assert.equal(JOURNAL_SCHEMA_VERSION, 1);
  assert.deepEqual(JOURNAL_ENTRY_TYPES, ["governance.event", "execution.transition", "review.recorded", "effect.completed"]);
  const valid = governance(0, missionEvent(0));
  assert.equal(validateJournalEntry(valid).state, "valid");
  assert.equal(validateJournalEntry({ ...valid, surprise: true }).state, "invalid");
  assert.equal(validateJournalEntry(Object.create(valid)).state, "invalid");
  assert.equal(validateJournalEntry({ ...valid, payload: Object.create(valid.payload) }).state, "invalid");
  assert.equal(validateJournalEntry({ ...valid, timestamp: null }).state, "invalid");
});

test("replays approved execution, effects, reviews, and completion deterministically", () => {
  const entries = [
    governance(0, missionEvent(0)),
    governance(1, missionEvent(1, "approve", "proposed", "approved")),
    transition(2, "not-started", "running"),
    entry(3, "effect.completed", { effectKey: "z-effect", resultSummary: "done" }),
    entry(4, "effect.completed", { effectKey: "a-effect", resultSummary: "done" }),
    entry(5, "review.recorded", { reviewerSeatId: "fitz", verdict: "approved", sourceRef: "pr-review", summary: "pass" }),
    transition(6, "running", "completed"),
  ];
  const first = replayMissionJournal(ID, entries);
  assert.deepEqual(first, replayMissionJournal(ID, entries));
  assert.equal(first.value.missionState, "approved");
  assert.equal(first.value.executionStatus, "completed");
  assert.deepEqual(first.value.completedEffects.map(({ effectKey }) => effectKey), ["a-effect", "z-effect"]);
  assert.equal(first.value.reviewEvidence[0].reviewerSeatId, "fitz");
});

test("governance pause and terminal decisions constrain execution projections", () => {
  const paused = [
    governance(0, missionEvent(0)), governance(1, missionEvent(1, "approve", "proposed", "approved")),
    transition(2, "not-started", "running"), governance(3, missionEvent(2, "pause", "approved", "paused", 3)),
  ];
  assert.equal(replayMissionJournal(ID, paused).value.executionStatus, "blocked");
  const cancelled = [...paused, governance(4, missionEvent(3, "cancel", "paused", "cancelled", 4))];
  assert.equal(replayMissionJournal(ID, cancelled).value.executionStatus, "failed");
  assert.equal(replayMissionJournal(ID, [...cancelled, transition(5, "failed", "running")]).state, "invalid");
});

test("fails closed on sequence, identity, chronology, effect, and governance errors", () => {
  const created = governance(0, missionEvent(0));
  const approved = governance(1, missionEvent(1, "approve", "proposed", "approved"));
  const running = transition(2, "not-started", "running");
  const effect = entry(3, "effect.completed", { effectKey: "same", resultSummary: "done" });
  const cases = [
    [{ ...created, sequence: 2 }],
    [created, { ...approved, entryId: created.entryId }],
    [created, { ...approved, missionId: "other" }],
    [created, { ...approved, timestamp: stamp(0) }, { ...running, timestamp: stamp(0) }],
    [created, running],
    [created, approved, running, effect, { ...effect, sequence: 4, entryId: "entry-4", timestamp: stamp(4) }],
  ];
  for (const values of cases) assert.equal(replayMissionJournal(ID, values).state, "invalid");
});

test("serializes one line and reports malformed or incomplete JSONL as recovery-required", () => {
  const created = governance(0, missionEvent(0));
  const serialized = serializeJournalEntry(created);
  assert.equal(serialized.state, "valid");
  assert.equal(serialized.value.endsWith("\n"), true);
  assert.equal(parseJournalJsonl(ID, serialized.value).state, "valid");
  assert.equal(parseJournalJsonl(ID, serialized.value.trimEnd()).code, "recovery_required");
  assert.equal(parseJournalJsonl(ID, "{bad}\n").code, "recovery_required");
});

test("pure journal contract has no environmental dependency", async () => {
  const source = await readFile(new URL("../contracts/mission-journal.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:/);
  assert.doesNotMatch(source, /\b(?:fetch|process|GitHub|provider|filesystem|Date\.now|localeCompare)\b/i);
});
