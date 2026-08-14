import assert from "node:assert/strict";
import test from "node:test";

import { executeRuntimeBindingV1 } from "../dist/runtime-binding-executor-v1.mjs";

function dependencies(calls) {
  return {
    renderDecision: () => { calls.render += 1; return "decision"; },
    readPasscode: async () => { calls.pin += 1; return "passcode"; },
    signPayload: async () => { calls.sign += 1; return "signature"; },
    appendEntryLegacy: async () => { calls.legacy += 1; throw new Error("unexpected append"); },
    appendEntryAtomic: async () => { calls.atomic += 1; throw new Error("unexpected append"); },
  };
}

function input(overrides = {}) {
  return {
    mode: "legacy",
    root: "/private/tmp/does-not-exist",
    missionId: "mission:issue-297",
    intent: { reasoningRuntimeId: "runtime:may", toolExecutorId: "executor:may" },
    timestamp: { value: "2026-08-13T12:00:00Z", provenance: "hostTrusted" },
    humanMode: false,
    decisionOutput: { write: () => {} },
    ...overrides,
  };
}

test("explicit executor modes reject overlap and malformed input before any key turn or append", async () => {
  for (const malformed of [
    input({ mode: "supersession" }),
    input({ expectedPreparation: {} }),
    input({ intent: { reasoningRuntimeId: "runtime:may", toolExecutorId: "executor:may", bindingId: "caller-authored" } }),
    { ...input(), unexpected: true },
    input({ mode: "prepared" }),
  ]) {
    const calls = { render: 0, pin: 0, sign: 0, legacy: 0, atomic: 0 };
    await assert.rejects(executeRuntimeBindingV1(malformed, dependencies(calls)), /executor input|binding input/iu);
    assert.deepEqual(calls, { render: 0, pin: 0, sign: 0, legacy: 0, atomic: 0 });
  }
});
