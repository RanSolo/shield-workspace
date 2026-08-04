import assert from "node:assert/strict";
import test from "node:test";

import { runGovernedMayDispatchStepV1 } from "../dist/governed-may-dispatch-v1.mjs";

const certification = Object.freeze({
  certificationId: "deterministic-mission-compilation-stage-a-certification.v1",
  certificationCommit: "5fce3051d774c3315eeb86445f6d3724e630cf9b",
  experimentId: "deterministic-mission-compilation-v2",
  compilerId: "shield-compiler@0.1.0-experiment",
  validatorId: "shield-dispatch-validator@0.1.0-experiment",
  rendererId: "canonical-chat-v1",
  targetProfileId: "codex-text.v0",
  registryId: "shield-dispatch-registry.v0",
  frozenDigests: Object.freeze({
    compilerSourceTreeSha256: "4d5d2e21178f1f8edee61b162a8fa3e4df82cd83d04eeb51efa9906887ae5e5f",
    validatorSourceTreeSha256: "eee02a6c9dca56c781382ffe6a7d7e161e993f8a4baa8566064512f914f4abaa",
    rendererSpecSha256: "d05a8331ed11356bac5bd438c186efc53e9e51db3ef42026a02080d6a40b57d0",
    registrySha256: "57aecedb7a4f8740a6cc7328e334d5c8e1fea5b8620e692310ca3b170c52ce33",
    targetProfileSha256: "7f032f5f2db1f7b73d249252510622dd3e8acd2daf5e72c7a788f3cb2c4e8d8a",
  }),
});

function validInput() {
  return {
    repositoryRoot: "/tmp/shield-governed-may",
    configuredJournalPath: ".shield/missions",
    missionId: "mission:issue-170",
    hostId: "host:test",
  };
}

function validDependencies(callCounts, overrides = {}) {
  const sentinel = (name) => (..._args) => {
    callCounts[name] = (callCounts[name] ?? 0) + 1;
    throw new Error(`unexpected dependency call: ${name}`);
  };
  return {
    observeDeliveryWorkspace: sentinel("observeDeliveryWorkspace"),
    readTrackedFile: sentinel("readTrackedFile"),
    readWorkspaceStatus: sentinel("readWorkspaceStatus"),
    schema9HostOps: {
      realpath: sentinel("realpath"),
      access: sentinel("access"),
      execFile: sentinel("execFile"),
      probeCapability: sentinel("probeCapability"),
      now: sentinel("now"),
    },
    helicarrier: {
      certification,
      validate: sentinel("helicarrier.validate"),
      compile: sentinel("helicarrier.compile"),
    },
    validationCommands: [],
    mayControlBaseUrl: "http://127.0.0.1:1234",
    runMayControlLoop: sentinel("runMayControlLoop"),
    createPermissionAuditStore: sentinel("createPermissionAuditStore"),
    createMayControlEventStore: sentinel("createMayControlEventStore"),
    readMissionJournal: sentinel("readMissionJournal"),
    appendMissionEntry: sentinel("appendMissionEntry"),
    readFuryEvidence: sentinel("readFuryEvidence"),
    readDispatchReceipts: sentinel("readDispatchReceipts"),
    claimDispatchPacket: sentinel("claimDispatchPacket"),
    appendDispatchReceipt: sentinel("appendDispatchReceipt"),
    runMissionCycle: sentinel("runMissionCycle"),
    ...overrides,
  };
}

test("rejects invalid input before inspecting hostile dependencies", async () => {
  const dependencies = Object.create(null);
  Object.defineProperty(dependencies, "observeDeliveryWorkspace", {
    enumerable: true,
    get() {
      throw new Error("dependencies must not be inspected");
    },
  });

  const result = await runGovernedMayDispatchStepV1({}, dependencies);

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "input_invalid");
});

test("rejects invalid dependencies after valid input", async () => {
  const result = await runGovernedMayDispatchStepV1(validInput(), {});

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "dependencies_invalid");
});

test("returns journal_invalid when the mission journal read throws", async () => {
  const callCounts = {};
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
    readMissionJournal: async () => {
      callCounts.readMissionJournal = (callCounts.readMissionJournal ?? 0) + 1;
      throw new Error("unavailable");
    },
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.readiness, "indeterminate");
  assert.equal(result.code, "journal_invalid");
  assert.equal(callCounts.readMissionJournal, 1);
});

test("preserves a validated invalid journal result", async () => {
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies({}, {
    readMissionJournal: async () => ({ state: "invalid", code: "schema_mixed", errors: ["mixed journal"] }),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.readiness, "indeterminate");
  assert.equal(result.code, "schema_mixed");
  assert.deepEqual(result.errors, ["mixed journal"]);
});

test("rejects a non-profile-aware journal before other dependencies", async () => {
  const callCounts = {};
  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "supervised", entries: [], projection: {} } }),
  }));

  assert.equal(result.state, "recovery_required");
  assert.equal(result.readiness, "indeterminate");
  assert.equal(result.code, "schema_unsupported");
  assert.deepEqual(callCounts, {});
});

test("stops without effects after a valid profile-aware journal", async () => {
  const callCounts = {};

  const result = await runGovernedMayDispatchStepV1(validInput(), validDependencies(callCounts, {
    readMissionJournal: async () => ({ state: "valid", value: { kind: "profile-aware", entries: [], projection: {} } }),
  }));

  assert.deepEqual(result, {
    state: "recovery_required",
    readiness: "indeterminate",
    code: "implementation_incomplete",
    errors: ["Governed May dispatch execution is not implemented."],
    evidence: {},
  });
  assert.deepEqual(callCounts, {});
});
