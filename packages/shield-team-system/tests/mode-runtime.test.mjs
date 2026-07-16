import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { RISK_FLAGS } from "../contracts/mission-policy.mjs";
import {
  MAX_MODE_CONTEXT_REFS,
  MODE_MANIFEST_SCHEMA_VERSION,
  createModeRegistry,
  resolveSeatModeContexts,
  validateModeManifest,
} from "../contracts/mode-runtime.mjs";

const stamp = (value) => ({ value, provenance: "humanRecorded" });
const TIME = "2026-01-01T00:00:00Z";

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    modeId: "delivery",
    modeVersion: "1.0.0",
    description: "Bounded delivery workflow.",
    compatibility: { seats: ["may", "daisy"], missionSchemaVersions: [2] },
    contextRefs: ["modes/delivery-mode.md"],
    ...overrides,
  };
}

function mission(overrides = {}) {
  const event = {
    schemaVersion: 2, eventId: "event-0", missionId: "mission-m2-2", sequence: 0,
    type: "mission.created", actor: "coulson", previousState: null,
    resultingState: "proposed", timestamp: stamp(TIME),
  };
  return {
    schemaVersion: 2,
    missionId: "mission-m2-2",
    objective: "Resolve exact mode context.",
    state: "proposed",
    riskFlags: Object.fromEntries(RISK_FLAGS.map((flag) => [flag, false])),
    participants: [{ seatId: "may" }, { seatId: "hill" }],
    activatedModes: [{
      modeId: "delivery", modeVersion: "1.0.0", seatId: "may", activationSource: "coulson",
    }],
    createdAt: stamp(TIME),
    updatedAt: stamp(TIME),
    events: [event],
    ...overrides,
  };
}

test("validates the closed versioned mode-manifest schema", () => {
  assert.equal(MODE_MANIFEST_SCHEMA_VERSION, 1);
  assert.equal(MAX_MODE_CONTEXT_REFS, 32);
  assert.equal(validateModeManifest(manifest()).state, "valid");
  const extra = manifest({ surprise: true });
  const missing = manifest(); delete missing.description;
  for (const value of [extra, missing, Object.create(manifest()), [], null]) {
    assert.equal(validateModeManifest(value).state, "invalid");
  }
});

test("rejects malformed compatibility metadata and unbounded or duplicate references", () => {
  const candidates = [
    manifest({ compatibility: { seats: ["may", "may"], missionSchemaVersions: [2] } }),
    manifest({ compatibility: { seats: ["may"], missionSchemaVersions: [2, 2] } }),
    manifest({ compatibility: Object.create({ seats: ["may"], missionSchemaVersions: [2] }) }),
    manifest({ contextRefs: ["same", "same"] }),
    manifest({ contextRefs: Array.from({ length: 33 }, (_, index) => `context-${index}`) }),
  ];
  for (const value of candidates) assert.equal(validateModeManifest(value).state, "invalid");
});

test("creates a deterministic JSON registry and rejects duplicate exact versions", () => {
  const second = manifest({ modeId: "architecture", modeVersion: "2.0.0" });
  const first = createModeRegistry([manifest(), second]);
  const reversed = createModeRegistry([second, manifest()]);
  assert.deepEqual(first, reversed);
  assert.doesNotThrow(() => JSON.stringify(first.value));
  assert.equal(createModeRegistry([manifest(), manifest()]).state, "invalid");
});

test("resolves exact versions only for participating compatible seats", () => {
  const registry = createModeRegistry([manifest()]).value;
  assert.deepEqual(resolveSeatModeContexts(mission(), registry), {
    state: "valid",
    value: {
      seats: [
        {
          seatId: "may",
          modes: [{
            modeId: "delivery", modeVersion: "1.0.0", activationSource: "coulson",
            description: "Bounded delivery workflow.",
            contextRefs: ["modes/delivery-mode.md"],
          }],
        },
        { seatId: "hill", modes: [] },
      ],
    },
  });
  const unknown = mission({ activatedModes: [{
    modeId: "delivery", modeVersion: "9.0.0", seatId: "may", activationSource: "coulson",
  }] });
  assert.equal(resolveSeatModeContexts(unknown, registry).state, "invalid");
});

test("fails closed on incompatible seats, mission versions, and tampered registries", () => {
  const incompatibleSeat = createModeRegistry([
    manifest({ compatibility: { seats: ["daisy"], missionSchemaVersions: [2] } }),
  ]).value;
  const incompatibleVersion = createModeRegistry([
    manifest({ compatibility: { seats: ["may"], missionSchemaVersions: [3] } }),
  ]).value;
  const inheritedRegistry = Object.create(createModeRegistry([manifest()]).value);
  for (const registry of [incompatibleSeat, incompatibleVersion, inheritedRegistry]) {
    assert.equal(resolveSeatModeContexts(mission(), registry).state, "invalid");
  }
});

test("runtime contract has no environmental dependency", async () => {
  const source = await readFile(new URL("../contracts/mode-runtime.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:/);
  assert.doesNotMatch(source, /\b(?:fetch|process|GitHub|provider|filesystem|Date\.now)\b/i);
});
