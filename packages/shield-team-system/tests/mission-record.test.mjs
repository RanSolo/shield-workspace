import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { RISK_FLAGS, getMissionTransition } from "../contracts/mission-policy.mjs";
import {
  MISSION_EVENT_TYPES,
  MISSION_SCHEMA_VERSION,
  replayMissionEvents,
  validateMissionEvent,
  validateMissionRecord,
} from "../contracts/mission-record.mjs";

const ID = "mission-m2-1";
const TIMES = ["2026-01-01T00:00:00Z", "2026-01-01T00:01:00Z", "2026-01-01T00:02:00Z", "2026-01-01T00:03:00Z"];
const stamp = (value) => ({ value, provenance: "humanRecorded" });

function created(overrides = {}) {
  return {
    schemaVersion: 2, eventId: "event-0", missionId: ID, sequence: 0,
    type: "mission.created", actor: "coulson", previousState: null,
    resultingState: "proposed", timestamp: stamp(TIMES[0]), ...overrides,
  };
}

function decision(sequence, previousState, name, resultingState, overrides = {}) {
  return {
    schemaVersion: 2, eventId: `event-${sequence}`, missionId: ID, sequence,
    type: "mission.decision", actor: "coulson", previousState, resultingState,
    timestamp: stamp(TIMES[Math.min(sequence, 3)]), decision: name, ...overrides,
  };
}

const flags = () => Object.fromEntries(RISK_FLAGS.map((flag) => [flag, false]));

function record(events = [created()], overrides = {}) {
  return {
    schemaVersion: 2, missionId: ID, objective: "Define deterministic replay.",
    state: events.at(-1).resultingState, riskFlags: flags(),
    participants: [{ seatId: "hill" }, { seatId: "may" }],
    activatedModes: [{
      modeId: "delivery", modeVersion: "1.0.0", seatId: "may", activationSource: "coulson",
    }],
    createdAt: stamp(TIMES[0]), updatedAt: stamp(events.at(-1).timestamp.value),
    events, ...overrides,
  };
}

test("exposes and validates the approved initial schema", () => {
  assert.equal(MISSION_SCHEMA_VERSION, 2);
  assert.deepEqual(MISSION_EVENT_TYPES, ["mission.created", "mission.decision"]);
  assert.equal(validateMissionEvent(created()).state, "valid");
  assert.equal(validateMissionRecord(record()).state, "valid");
});

test("replays creation deterministically without environmental inputs", () => {
  const events = [created()];
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  Date.now = () => { throw new Error("hidden clock access"); };
  globalThis.fetch = () => { throw new Error("hidden network access"); };
  let first;
  try {
    first = replayMissionEvents(ID, events);
    assert.deepEqual(first, replayMissionEvents(ID, events));
  } finally {
    Date.now = originalNow;
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
  assert.deepEqual(first, {
    state: "valid",
    value: { missionState: "proposed", lastSequence: 0, lastTimestamp: stamp(TIMES[0]) },
  });
});

test("contract has no filesystem, host, provider, or network imports", async () => {
  const source = await readFile(new URL("../contracts/mission-record.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:/);
  assert.doesNotMatch(source, /\b(?:fetch|process|GitHub|provider|filesystem)\b/i);
  assert.doesNotMatch(source, /Date\.now\s*\(/);
});

test("timestamp validation rejects impossible calendar values and accepts leap-day fractions", () => {
  const invalidValues = [
    "2026-13-01T00:00:00Z",
    "2026-02-31T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:60Z",
    "2023-02-29T00:00:00Z",
  ];
  for (const value of invalidValues) {
    assert.equal(validateMissionEvent(created({ timestamp: stamp(value) })).state, "invalid");
  }
  assert.equal(
    validateMissionEvent(created({ timestamp: stamp("2024-02-29T23:59:59.123Z") })).state,
    "valid",
  );
});

test("replays valid approve, pause, resume, reject, and cancel policy paths", () => {
  const paths = [
    [decision(1, "proposed", "approve", "approved")],
    [decision(1, "proposed", "pause", "paused")],
    [decision(1, "proposed", "reject", "rejected")],
    [decision(1, "proposed", "cancel", "cancelled")],
    [decision(1, "proposed", "approve", "approved"), decision(2, "approved", "pause", "paused"), decision(3, "paused", "resume", "approved", { resumeState: "approved" })],
  ];
  for (const path of paths) {
    const events = [created(), ...path];
    assert.equal(replayMissionEvents(ID, events).value.missionState, path.at(-1).resultingState);
    assert.equal(validateMissionRecord(record(events)).state, "valid");
  }
  assert.equal(getMissionTransition("paused", "resume", { resumeState: "approved" }), "approved");
});

test("replay remains equivalent to every transition currently allowed by policy", () => {
  const cases = [
    [["edit", "proposed", undefined]],
    [["approve", "approved", undefined]],
    [["pause", "paused", undefined]],
    [["reject", "rejected", undefined]],
    [["cancel", "cancelled", undefined]],
    [["approve", "approved", undefined], ["pause", "paused", undefined]],
    [["approve", "approved", undefined], ["cancel", "cancelled", undefined]],
    [["pause", "paused", undefined], ["cancel", "cancelled", undefined]],
    [["pause", "paused", undefined], ["resume", "proposed", "proposed"]],
    [["approve", "approved", undefined], ["pause", "paused", undefined], ["resume", "approved", "approved"]],
  ];

  for (const transitions of cases) {
    const events = [created()];
    let previousState = "proposed";
    for (const [name, resultingState, resumeState] of transitions) {
      const overrides = resumeState === undefined ? {} : { resumeState };
      events.push(decision(events.length, previousState, name, resultingState, overrides));
      previousState = resultingState;
    }
    const result = replayMissionEvents(ID, events);
    assert.equal(result.state, "valid");
    assert.equal(result.value.missionState, previousState);
  }
});

test("rejects invalid, duplicate, and missing sequence positions", () => {
  const candidates = [
    [created({ sequence: -1 })],
    [created(), decision(0, "proposed", "approve", "approved")],
    [created(), decision(2, "proposed", "approve", "approved")],
    [created(), decision(1, "proposed", "approve", "approved"), decision(1, "approved", "pause", "paused")],
  ];
  for (const events of candidates) assert.equal(replayMissionEvents(ID, events).state, "invalid");
});

test("rejects chronology regressions, mismatched mission IDs, and duplicate event IDs", () => {
  const invalid = [
    decision(1, "proposed", "approve", "approved", { timestamp: stamp("2025-01-01T00:00:00Z") }),
    decision(1, "proposed", "approve", "approved", { missionId: "other" }),
    decision(1, "proposed", "approve", "approved", { eventId: "event-0" }),
  ];
  for (const event of invalid) assert.equal(replayMissionEvents(ID, [created(), event]).state, "invalid");
});

test("rejects invalid resumeState, impossible transitions, and state discontinuity", () => {
  const invalid = [
    decision(1, "proposed", "resume", "approved", { resumeState: "approved" }),
    decision(1, "proposed", "approve", "approved", { resumeState: "approved" }),
    decision(1, "proposed", "unknown", "approved"),
    decision(1, "approved", "approve", "approved"),
  ];
  for (const event of invalid) assert.equal(replayMissionEvents(ID, [created(), event]).state, "invalid");
  assert.equal(validateMissionEvent(decision(1, "paused", "resume", "approved")).state, "invalid");
});

test("rejects terminal-state transitions and declared/replayed state mismatch", () => {
  const terminal = [created(), decision(1, "proposed", "reject", "rejected"), decision(2, "rejected", "approve", "approved")];
  assert.equal(replayMissionEvents(ID, terminal).state, "invalid");
  const approved = [created(), decision(1, "proposed", "approve", "approved")];
  assert.equal(validateMissionRecord(record(approved, { state: "proposed" })).state, "invalid");
});

test("rejects unknown, missing, array, and prototype-backed data", () => {
  const extraEvent = created({ surprise: true });
  const missingEvent = created(); delete missingEvent.actor;
  for (const value of [extraEvent, missingEvent, Object.create(created()), [], null]) {
    assert.equal(validateMissionEvent(value).state, "invalid");
  }
  const extra = record(); extra.surprise = true;
  const missing = record(); delete missing.objective;
  const inheritedRisk = record(); inheritedRisk.riskFlags = Object.create(flags());
  const inheritedSeat = record(); inheritedSeat.participants = [Object.create({ seatId: "may" })];
  for (const value of [extra, missing, Object.create(record()), inheritedRisk, inheritedSeat, [], null]) {
    assert.equal(validateMissionRecord(value).state, "invalid");
  }
});

test("rejects malformed nested records and record/event chronology conflicts", () => {
  const missingFlag = flags(); delete missingFlag.production;
  const candidates = [
    record(undefined, { createdAt: stamp("not-a-time") }),
    record(undefined, { createdAt: { value: TIMES[0], provenance: "inferred" } }),
    record(undefined, { participants: [{ seatId: "may", role: "implementer" }] }),
    record(undefined, { activatedModes: [{ modeId: "delivery", seatId: "may" }] }),
    record(undefined, { riskFlags: missingFlag }),
    record(undefined, { riskFlags: { ...flags(), unknown: false } }),
    record([created(), decision(1, "proposed", "approve", "approved")], { updatedAt: stamp("2025-01-01T00:00:00Z") }),
  ];
  for (const value of candidates) assert.equal(validateMissionRecord(value).state, "invalid");
});

test("rejects schema v1 with an explicit unsupported-version result", () => {
  const result = validateMissionRecord(record(undefined, { schemaVersion: 1 }));
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "unsupported_schema_version");
  assert.match(result.errors[0], /schemaVersion 1 is unsupported; expected 2/);
});

test("rejects duplicate participants, duplicate activations, and non-participant activations", () => {
  const activation = {
    modeId: "delivery", modeVersion: "1.0.0", seatId: "may", activationSource: "coulson",
  };
  const candidates = [
    record(undefined, { participants: [{ seatId: "may" }, { seatId: "may" }] }),
    record(undefined, { activatedModes: [activation, { ...activation }] }),
    record(undefined, { activatedModes: [{ ...activation, seatId: "daisy" }] }),
  ];
  for (const value of candidates) assert.equal(validateMissionRecord(value).state, "invalid");
});
