import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { renameSync } from "node:fs";
import { lstat, mkdtemp, readFile, readlink, realpath, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MAY_CONTROL_LOOP_LIMITS,
  MAY_TOOL_DEFINITIONS,
  MAY_TOOL_MAPPINGS,
  runMayControlLoop,
  runMayToolCall,
} from "../scripts/model/may-tool-executor.mjs";
import {
  computeMayPlannedOperationsSequenceEffectKeyV1,
  normalizeMayPlannedToolOperationsV1,
} from "../dist/may-tool-effect-v1.mjs";

const missionRevision = "0123456789012345678901234567890123456789";
const baseRevision = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function executableIdentity(info) {
  return `${info.dev}:${info.ino}:${info.mode}:${info.size}:${info.mtimeMs}`;
}

function regularFileIdentity(info) {
  return `${info.dev}:${info.ino}:${info.mode}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
}

async function plannedOperations(root, overrides = {}) {
  const target = join(root, "src/approved.txt");
  const targetInfo = await stat(target).catch(() => null);
  const executable = await realpath(process.execPath);
  const executableInfo = await stat(executable);
  return [
    {
      toolName: "writeFile",
      path: "src/approved.txt",
      content: "after\n",
      precondition: targetInfo === null
        ? { kind: "absent" }
        : { kind: "present", regularFileIdentity: regularFileIdentity(targetInfo), sha256: digest(await readFile(target)) },
      ...overrides.write,
    },
    {
      toolName: "runValidation",
      commandId: "focused",
      executable,
      args: ["-e", "console.log('validation ok')"],
      timeoutMs: 2_000,
      executableIdentity: executableIdentity(executableInfo),
      ...overrides.validation,
    },
  ];
}

function request(root, toolName, args) {
  return {
    sessionId: "session:issue-42:1", toolCallId: `call:${toolName}:1`, toolName,
    arguments: JSON.stringify(args), repositoryRoot: root, baseRevision,
  };
}

function plan(toolName, effectKey = `effect:issue-42:${toolName}`) {
  const mapping = MAY_TOOL_MAPPINGS[toolName];
  return {
    runnerContractVersion: 1, cycleId: `cycle:issue-42:${toolName}`, missionId: "mission:issue-42",
    subjectId: "issue:42", revisionId: missionRevision, evaluatedThroughSequence: 8, seatId: "may",
    activatedModes: [{ modeId: "implementer", modeVersion: "1.0.0", seatId: "may", activationSource: "mission-brief" }],
    actionId: mapping.actionId, effectClass: mapping.effectClass, effectKey,
    validationId: `validation:issue-42:${toolName}`, stopCondition: "after_one_cycle",
  };
}

function binding(root, toolName, effectKey = `effect:issue-42:${toolName}`, overrides = {}) {
  const mapping = MAY_TOOL_MAPPINGS[toolName];
  return {
    bindingSchemaVersion: 1, bindingId: "runtime-binding:may:issue-42", bindingVersion: 1,
    missionId: "mission:issue-42", subjectId: "issue:42", missionRevisionId: missionRevision,
    seatId: "may", reasoningRuntimeId: "ornith-1.0-35b:2", toolExecutorId: "executor:may-local",
    repositoryId: "repo:shield", canonicalWritableRoot: root, branch: "codex/issue-42-may-executor",
    artifactRevisionId: baseRevision, recordedAtSequence: 7, activeThroughSequence: null,
    lifecycleState: "active", approvedScope: {
      actionIds: [mapping.actionId], effectClasses: [mapping.effectClass],
      effectKeys: [effectKey], capabilities: [mapping.capability],
    }, coulsonAuthorizationRef: "authorization:issue-42:1", ...overrides,
  };
}

function attestation(root, kind, capability) {
  return {
    attestationSchemaVersion: 1, attestationId: `attestation:${kind}:${capability ?? "root"}`, kind,
    hostId: "host:local", toolExecutorId: "executor:may-local", repositoryId: "repo:shield",
    canonicalWritableRoot: root, capabilityId: kind === "capability" ? capability : null,
    observedValue: kind === "repository_root" ? root : true,
    observedAt: "2026-07-21T20:00:00Z", expiresAt: "2026-07-21T20:10:00Z",
  };
}

function permissionContext(root, toolName, effectKey = `effect:issue-42:${toolName}`, overrides = {}) {
  const mapping = MAY_TOOL_MAPPINGS[toolName];
  return {
    permissionContractVersion: 1, journalSchemaVersion: 6,
    missionId: "mission:issue-42", subjectId: "issue:42", missionRevisionId: missionRevision,
    artifactRevisionId: baseRevision, evaluatedThroughSequence: 8,
    reasoningRuntimeId: "ornith-1.0-35b:2", toolExecutorId: "executor:may-local",
    repositoryId: "repo:shield", canonicalWritableRoot: root, branch: "codex/issue-42-may-executor",
    requiredCapabilities: [mapping.capability], activeBindings: [binding(root, toolName, effectKey)],
    attestations: [
      attestation(root, "capability", mapping.capability),
      attestation(root, "repository_root", mapping.capability),
      attestation(root, "writability", mapping.capability),
    ],
    evaluatedAt: "2026-07-21T20:05:00Z", decisionId: `decision:issue-42:${toolName}:${digest(effectKey).slice(0, 12)}`,
    ...overrides,
  };
}

function dependencies(root, toolName, overrides = {}) {
  const ledger = [];
  let requestedEffectKey = `effect:issue-42:${toolName}`;
  const appendIfAbsent = async (record) => {
    if (ledger.some((item) => item.recordId === record.recordId)) return { appended: false };
    ledger.push(record);
    return {
      schemaVersion: 1, ledgerId: record.ledgerId, recordId: record.recordId,
      decisionId: record.decisionId, digest: record.digest, appended: true,
      ledgerSequence: ledger.length - 1,
    };
  };
  return {
    ledger, ledgerId: "ledger:issue-42", repositoryId: "repo:shield",
    reasoningRuntimeId: "ornith-1.0-35b:2", toolExecutorId: "executor:may-local",
    approvedFiles: ["src/approved.txt"],
    validationCommands: [{ commandId: "focused", executable: process.execPath, args: ["-e", "console.log('validation ok')"], timeoutMs: 2_000 }],
    nextCallSlot: async (slot) => { requestedEffectKey = slot.effectKey; return plan(toolName, requestedEffectKey); },
    getAuthorizationContext: async () => permissionContext(root, toolName, requestedEffectKey),
    getExecutionContext: async () => permissionContext(root, toolName, requestedEffectKey),
    appendIfAbsent, nextResultRecordId: () => `audit:result:issue-42:${toolName}`,
    now: () => "2026-07-21T20:06:00Z", readWorkspaceRevision: async () => baseRevision,
    readWorkspaceStatus: async () => [],
    nextTemporaryName: () => ".shield-may-12345678.tmp", monotonicNow: () => Date.now(),
    ...overrides,
  };
}

async function workspace(context, prefix = "shield-may-executor-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(root, { recursive: true, force: true }));
  await import("node:fs/promises").then(({ mkdir }) => mkdir(join(root, "src")));
  return realpath(root);
}

test("publishes exactly the two closed May implementation tools", () => {
  assert.deepEqual(MAY_TOOL_DEFINITIONS.map((item) => item.function.name), ["writeFile", "runValidation"]);
  for (const item of MAY_TOOL_DEFINITIONS) assert.equal(item.function.parameters.additionalProperties, false);
});

test("normalizes one to three ordered writes and rejects malformed operation sequences", async (context) => {
  const root = await workspace(context);
  const legacy = await plannedOperations(root);
  const validation = legacy.at(-1);
  const writes = ["one.txt", "two.txt", "three.txt"].map((name) => ({
    toolName: "writeFile", path: `src/${name}`, content: `${name}\n`, precondition: { kind: "absent" },
  }));
  const maximum = [...writes, validation];
  assert.deepEqual(normalizeMayPlannedToolOperationsV1(legacy), legacy);
  assert.deepEqual(normalizeMayPlannedToolOperationsV1(maximum), maximum);
  assert.equal(computeMayPlannedOperationsSequenceEffectKeyV1(legacy), null);
  const sequenceKey = computeMayPlannedOperationsSequenceEffectKeyV1(maximum);
  assert.match(sequenceKey, /^effect:may-sequence:sha256:[0-9a-f]{64}$/u);
  assert.notEqual(sequenceKey, computeMayPlannedOperationsSequenceEffectKeyV1([writes[1], writes[0], writes[2], validation]));
  const identityChanged = structuredClone(maximum);
  identityChanged[0].precondition = { kind: "present", regularFileIdentity: "1:2:3:4:5:6", sha256: digest("") };
  assert.notEqual(sequenceKey, computeMayPlannedOperationsSequenceEffectKeyV1(identityChanged));

  const malformed = [
    [],
    [validation],
    [validation, writes[0]],
    [writes[0], validation, writes[1]],
    [...writes, { ...writes[2], path: "src/four.txt" }, validation],
    [writes[0], { ...writes[0] }, validation],
    [writes[0], validation, validation],
  ];
  for (const operations of malformed) assert.throws(() => normalizeMayPlannedToolOperationsV1(operations), /may_planned_operations_malformed/u);
  const sparse = [writes[0], validation];
  delete sparse[0];
  assert.throws(() => normalizeMayPlannedToolOperationsV1(sparse), /may_planned_operations_malformed/u);
  assert.throws(() => normalizeMayPlannedToolOperationsV1(new Proxy([writes[0], validation], {})), /may_planned_operations_malformed/u);
  let accessorCalls = 0;
  const accessorBacked = [writes[0], validation];
  Object.defineProperty(accessorBacked, "0", { enumerable: true, get: () => { accessorCalls += 1; return writes[0]; } });
  assert.throws(() => normalizeMayPlannedToolOperationsV1(accessorBacked), /may_planned_operations_malformed/u);
  assert.equal(accessorCalls, 0);
});

test("writes one approved file at the bound revision and records decision, invocation, and result", async (context) => {
  const root = await workspace(context);
  await writeFile(join(root, "src/approved.txt"), "before\n", "utf8");
  const deps = dependencies(root, "writeFile");
  const result = await runMayToolCall(request(root, "writeFile", {
    path: "src/approved.txt", content: "after\n", expectedSha256: digest("before\n"),
  }), deps);
  assert.equal(await readFile(join(root, "src/approved.txt"), "utf8"), "after\n");
  assert.deepEqual(result, {
    state: "completed", code: "file_written", path: "src/approved.txt", bytes: 6,
    sha256: digest("after\n"), attribution: "host_observed_tool_result",
  });
  assert.deepEqual(deps.ledger.map((item) => item.recordType), ["permission.decision", "tool.invocation", "tool.result"]);
  assert.equal(JSON.stringify(deps.ledger).includes("after"), false);
});

test("temporary-name collisions preserve the pre-existing file", async (context) => {
  const root = await workspace(context);
  const temporaryPath = join(root, "src/.shield-may-12345678.tmp");
  const repeatedRequest = request(root, "writeFile", {
    path: "src/approved.txt", content: "after\n", expectedSha256: "absent",
  });
  await writeFile(temporaryPath, "pre-existing\n", "utf8");
  const initialIdentity = regularFileIdentity(await lstat(temporaryPath));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() => runMayToolCall(repeatedRequest, dependencies(root, "writeFile")), /may_tool_execution_failed/u);
    assert.equal(await readFile(temporaryPath, "utf8"), "pre-existing\n");
    assert.equal(regularFileIdentity(await lstat(temporaryPath)), initialIdentity);
  }
});

test("temporary symlink collisions preserve the symlink and its external target", async (context) => {
  const root = await workspace(context);
  const externalRoot = await mkdtemp(join(tmpdir(), "shield-may-external-target-"));
  context.after(() => rm(externalRoot, { recursive: true, force: true }));
  const externalPath = join(externalRoot, "preserved.txt");
  const temporaryPath = join(root, "src/.shield-may-12345678.tmp");
  const repeatedRequest = request(root, "writeFile", {
    path: "src/approved.txt", content: "after\n", expectedSha256: "absent",
  });
  await writeFile(externalPath, "outside\n", "utf8");
  await symlink(externalPath, temporaryPath);
  const initialSymlink = await lstat(temporaryPath);
  const initialExternalIdentity = regularFileIdentity(await lstat(externalPath));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() => runMayToolCall(repeatedRequest, dependencies(root, "writeFile")), /may_tool_execution_failed/u);
    const currentSymlink = await lstat(temporaryPath);
    assert.equal(currentSymlink.isSymbolicLink(), true);
    assert.equal(`${currentSymlink.dev}:${currentSymlink.ino}`, `${initialSymlink.dev}:${initialSymlink.ino}`);
    assert.equal(await readlink(temporaryPath), externalPath);
    assert.equal(await readFile(externalPath, "utf8"), "outside\n");
    assert.equal(regularFileIdentity(await lstat(externalPath)), initialExternalIdentity);
  }
});

test("the same temporary identity can retry after a collision is removed", async (context) => {
  const root = await workspace(context);
  const temporaryPath = join(root, "src/.shield-may-12345678.tmp");
  const repeatedRequest = request(root, "writeFile", {
    path: "src/approved.txt", content: "after\n", expectedSha256: "absent",
  });
  await writeFile(temporaryPath, "collision\n", "utf8");

  await assert.rejects(() => runMayToolCall(repeatedRequest, dependencies(root, "writeFile")), /may_tool_execution_failed/u);
  assert.equal(await readFile(temporaryPath, "utf8"), "collision\n");
  await unlink(temporaryPath);

  const result = await runMayToolCall(repeatedRequest, dependencies(root, "writeFile"));
  assert.equal(result.code, "file_written");
  assert.equal(await readFile(join(root, "src/approved.txt"), "utf8"), "after\n");
  assert.equal(await lstat(temporaryPath).catch(() => null), null);
});

test("cleanup preserves a substituted temporary path after creation", async (context) => {
  const root = await workspace(context);
  const temporaryPath = join(root, "src/.shield-may-12345678.tmp");
  const ownedPath = join(root, "src/owned-temporary.txt");
  let statusReads = 0;
  const deps = dependencies(root, "writeFile", {
    readWorkspaceStatus: async () => {
      statusReads += 1;
      if (statusReads === 4) {
        await rename(temporaryPath, ownedPath);
        await writeFile(temporaryPath, "substitute\n", "utf8");
        return ["src/unapproved.txt"];
      }
      return [];
    },
  });

  await assert.rejects(() => runMayToolCall(request(root, "writeFile", {
    path: "src/approved.txt", content: "after\n", expectedSha256: "absent",
  }), deps), /may_workspace_scope_mismatch/u);

  assert.equal(await readFile(ownedPath, "utf8"), "after\n");
  assert.equal(await readFile(temporaryPath, "utf8"), "substitute\n");
});

test("runs only an exact allowlisted command without a shell and releases bounded output after audit", async (context) => {
  const root = await workspace(context);
  const deps = dependencies(root, "runValidation");
  const result = await runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps);
  assert.equal(result.code, "validation_completed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "validation ok\n");
  assert.equal(result.stderr, "");
  assert.deepEqual(deps.ledger.map((item) => item.recordType), ["permission.decision", "tool.invocation", "tool.result"]);
});

test("records nonzero validation as failed and releases no command output", async (context) => {
  const root = await workspace(context);
  const deps = dependencies(root, "runValidation", {
    validationCommands: [{ commandId: "focused", executable: process.execPath, args: ["-e", "console.error('failed');process.exit(3)"], timeoutMs: 2_000 }],
  });
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps), /may_validation_nonzero_exit/u);
  assert.equal(deps.ledger.at(-1).outcome, "failed");
  assert.equal(JSON.stringify(deps.ledger).includes("failed\\n"), false);
});

test("records terminating-signal validation as failed", async (context) => {
  const root = await workspace(context);
  const deps = dependencies(root, "runValidation", {
    validationCommands: [{ commandId: "focused", executable: process.execPath, args: ["-e", "process.kill(process.pid,'SIGTERM')"], timeoutMs: 2_000 }],
  });
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps), /may_validation_signal/u);
  assert.equal(deps.ledger.at(-1).outcome, "failed");
});

test("fails before permission or effects for stale revision, stale digest, unapproved path, and command ID", async (context) => {
  const root = await workspace(context);
  await writeFile(join(root, "src/approved.txt"), "before\n", "utf8");
  const staleRevision = dependencies(root, "writeFile", { readWorkspaceRevision: async () => "1111111111111111111111111111111111111111" });
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", { path: "src/approved.txt", content: "x", expectedSha256: digest("before\n") }), staleRevision), /may_workspace_revision_mismatch/u);
  assert.equal(staleRevision.ledger.length, 0);
  const dirtyOutsideScope = dependencies(root, "writeFile", { readWorkspaceStatus: async () => ["src/unapproved.txt"] });
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", { path: "src/approved.txt", content: "x", expectedSha256: digest("before\n") }), dirtyOutsideScope), /may_workspace_scope_mismatch/u);
  assert.equal(dirtyOutsideScope.ledger.length, 0);
  const staleDigest = dependencies(root, "writeFile");
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", { path: "src/approved.txt", content: "x", expectedSha256: digest("other") }), staleDigest), /may_file_digest_mismatch/u);
  assert.equal(await readFile(join(root, "src/approved.txt"), "utf8"), "before\n");
  const wrongPath = dependencies(root, "writeFile");
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", { path: "src/other.txt", content: "x", expectedSha256: "absent" }), wrongPath), /may_path_not_approved/u);
  const wrongCommand = dependencies(root, "runValidation");
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "not-approved" }), wrongCommand), /may_validation_command_not_approved/u);
});

test("denies sensitive, traversing, duplicate-key, oversized, and unpaired-surrogate arguments", async (context) => {
  const root = await workspace(context);
  const deps = dependencies(root, "writeFile");
  for (const argumentsJson of [
    '{"path":"../escape","content":"x","expectedSha256":"absent"}',
    '{"path":".env","content":"x","expectedSha256":"absent"}',
    '{"path":"src/approved.txt","path":"src/other.txt","content":"x","expectedSha256":"absent"}',
  ]) {
    await assert.rejects(() => runMayToolCall({ ...request(root, "writeFile", {}), arguments: argumentsJson }, deps));
  }
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", { path: "src/approved.txt", content: "x".repeat(262_145), expectedSha256: "absent" }), deps), /may_tool_arguments_malformed/u);
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", { path: "src/approved.txt", content: "\ud800", expectedSha256: "absent" }), deps), /may_tool_arguments_malformed/u);
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", { path: "src/approved.txt", content: "a\u0000b", expectedSha256: "absent" }), deps), /may_tool_arguments_malformed/u);
  assert.equal(deps.ledger.length, 0);
});

test("denies symlink targets before permission or writes", async (context) => {
  const root = await workspace(context);
  const outside = join(root, "outside.txt");
  await writeFile(outside, "outside\n", "utf8");
  await symlink(outside, join(root, "src/approved.txt"));
  const deps = dependencies(root, "writeFile");
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", { path: "src/approved.txt", content: "changed\n", expectedSha256: digest("outside\n") }), deps), /may_path_symlink_denied/u);
  assert.equal(await readFile(outside, "utf8"), "outside\n");
  assert.deepEqual(deps.ledger.map((item) => item.recordType), ["permission.decision", "tool.invocation", "tool.result"]);
  assert.equal(deps.ledger.at(-1).outcome, "failed");
});

test("wrong seat, runtime, executor, root, artifact revision, or capability fails closed", async (context) => {
  const root = await workspace(context);
  const cases = [
    { nextCallSlot: async () => ({ ...plan("runValidation"), seatId: "daisy" }) },
    { getAuthorizationContext: async (activePlan) => permissionContext(root, "runValidation", activePlan.effectKey, { reasoningRuntimeId: "other-runtime" }) },
    { getAuthorizationContext: async (activePlan) => permissionContext(root, "runValidation", activePlan.effectKey, { toolExecutorId: "other-executor" }) },
    { getAuthorizationContext: async (activePlan) => permissionContext(root, "runValidation", activePlan.effectKey, { canonicalWritableRoot: "/other/root" }) },
    { getAuthorizationContext: async (activePlan) => permissionContext(root, "runValidation", activePlan.effectKey, { artifactRevisionId: "1111111111111111111111111111111111111111" }) },
    { getAuthorizationContext: async (activePlan) => permissionContext(root, "runValidation", activePlan.effectKey, { requiredCapabilities: ["filesystem_write"] }) },
  ];
  for (const overrides of cases) {
    const deps = dependencies(root, "runValidation", overrides);
    await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps));
    assert.equal(deps.ledger.length, 0);
  }
});

test("permission slots must bind the exact requested file content or validation command effect", async (context) => {
  const root = await workspace(context);
  const wrongSlot = dependencies(root, "writeFile", {
    nextCallSlot: async () => plan("writeFile", "effect:wrong"),
  });
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", {
    path: "src/approved.txt", content: "new\n", expectedSha256: "absent",
  }), wrongSlot), /may_authority_slot_mismatch/u);
  assert.equal(wrongSlot.ledger.length, 0);

  const observed = [];
  for (const content of ["first\n", "second\n"]) {
    const deps = dependencies(root, "writeFile", {
      nextCallSlot: async (slot) => { observed.push(slot.effectKey); throw new Error("stop_after_effect_key"); },
    });
    await assert.rejects(() => runMayToolCall(request(root, "writeFile", {
      path: "src/approved.txt", content, expectedSha256: "absent",
    }), deps), /stop_after_effect_key/u);
  }
  assert.notEqual(observed[0], observed[1]);
  assert.match(observed[0], /^effect:may:sha256:[0-9a-f]{64}$/u);
});

test("governed write independently rechecks the planned file identity and exact bytes", async (context) => {
  const root = await workspace(context);
  await writeFile(join(root, "src/approved.txt"), "before\n", "utf8");
  const planned = await plannedOperations(root);
  const deps = dependencies(root, "writeFile", { plannedToolOperations: planned });
  const result = await runMayToolCall(request(root, "writeFile", {
    path: "src/approved.txt", content: "after\n", expectedSha256: digest("before\n"),
  }), deps);
  assert.equal(result.code, "file_written");

  await writeFile(join(root, "src/replacement.txt"), "after\n", "utf8");
  const stalePlanned = await plannedOperations(root);
  await writeFile(join(root, "src/replacement.txt"), "after\n", "utf8");
  await rename(join(root, "src/replacement.txt"), join(root, "src/approved.txt"));
  const stale = dependencies(root, "writeFile", { plannedToolOperations: stalePlanned });
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", {
    path: "src/approved.txt", content: "after\n", expectedSha256: digest("after\n"),
  }), stale), /may_planned_write_mismatch/u);

  await writeFile(join(root, "src/approved.txt"), "before\n", "utf8");
  const racedPlan = await plannedOperations(root);
  await writeFile(join(root, "src/replacement.txt"), "before\n", "utf8");
  const raced = dependencies(root, "writeFile", {
    plannedToolOperations: racedPlan,
    nextTemporaryName: () => {
      renameSync(join(root, "src/replacement.txt"), join(root, "src/approved.txt"));
      return ".shield-may-12345678.tmp";
    },
  });
  await assert.rejects(() => runMayToolCall(request(root, "writeFile", {
    path: "src/approved.txt", content: "after\n", expectedSha256: digest("before\n"),
  }), raced), /may_file_identity_changed/u);
});

test("governed validation independently rechecks the exact planned executable identity", async (context) => {
  const root = await workspace(context);
  const planned = await plannedOperations(root, { validation: { executableIdentity: "1:2:3:4:5" } });
  const deps = dependencies(root, "runValidation", { plannedToolOperations: planned });
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps), /may_planned_operation_mismatch/u);
  assert.equal(deps.ledger.length, 0);
});

test("withholds validation output when the result audit receipt is not verified", async (context) => {
  const root = await workspace(context);
  const deps = dependencies(root, "runValidation");
  const original = deps.appendIfAbsent;
  deps.appendIfAbsent = async (record) => record.recordType === "tool.result" ? { appended: false } : original(record);
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps), /may_tool_result_not_releasable/u);
  assert.deepEqual(deps.ledger.map((item) => item.recordType), ["permission.decision", "tool.invocation"]);
});

test("post-effect workspace scope drift is recorded uncertain and stops output release", async (context) => {
  const root = await workspace(context);
  let observations = 0;
  const deps = dependencies(root, "runValidation", {
    readWorkspaceStatus: async () => {
      observations += 1;
      return observations >= 3 ? ["src/unapproved.txt"] : [];
    },
  });
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps), /may_workspace_scope_mismatch/u);
  assert.equal(deps.ledger.at(-1).outcome, "uncertain");
  assert.match(deps.ledger.at(-1).summary, /uncertain \(may_workspace_scope_mismatch\)/u);
});

test("validation is observational and stops if an allowlisted command changes an approved path", async (context) => {
  const root = await workspace(context);
  let observations = 0;
  const deps = dependencies(root, "runValidation", {
    readWorkspaceStatus: async () => {
      observations += 1;
      return observations >= 3 ? ["src/approved.txt"] : [];
    },
  });
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps), /may_validation_workspace_changed/u);
  assert.equal(deps.ledger.at(-1).outcome, "uncertain");
  assert.match(deps.ledger.at(-1).summary, /uncertain \(may_validation_workspace_changed\)/u);
});

test("validation detects content mutation when an approved dirty-path list is unchanged", async (context) => {
  const root = await workspace(context);
  await writeFile(join(root, "src/approved.txt"), "before\n", "utf8");
  const deps = dependencies(root, "runValidation", {
    readWorkspaceStatus: async () => ["src/approved.txt"],
    validationCommands: [{
      commandId: "focused",
      executable: process.execPath,
      args: ["-e", "require('node:fs').writeFileSync('src/approved.txt','mutated\\n')"],
      timeoutMs: 2_000,
    }],
  });
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps), /may_validation_workspace_changed/u);
  assert.equal(await readFile(join(root, "src/approved.txt"), "utf8"), "mutated\n");
  assert.equal(deps.ledger.at(-1).outcome, "uncertain");
  assert.match(deps.ledger.at(-1).summary, /uncertain \(may_validation_workspace_changed\)/u);
});

test("validation detects same-content replacement when an approved dirty-path list is unchanged", async (context) => {
  const root = await workspace(context);
  await writeFile(join(root, "src/approved.txt"), "before\n", "utf8");
  const deps = dependencies(root, "runValidation", {
    readWorkspaceStatus: async () => ["src/approved.txt"],
    validationCommands: [{
      commandId: "focused",
      executable: process.execPath,
      args: ["-e", "const f=require('node:fs');f.writeFileSync('src/replacement.txt','before\\n');f.renameSync('src/replacement.txt','src/approved.txt')"],
      timeoutMs: 2_000,
    }],
  });
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps), /may_validation_workspace_changed/u);
  assert.equal(deps.ledger.at(-1).outcome, "uncertain");
});

test("validation timeout and executable replacement fail closed", async (context) => {
  const root = await workspace(context);
  const timeout = dependencies(root, "runValidation", {
    validationCommands: [{ commandId: "focused", executable: process.execPath, args: ["-e", "setTimeout(()=>{},1000)"], timeoutMs: 5 }],
  });
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), timeout), /may_validation_timeout/u);
  assert.equal(timeout.ledger.at(-1).outcome, "uncertain");

  const fake = join(root, "validator");
  await writeFile(fake, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const changed = dependencies(root, "runValidation", {
    validationCommands: [{ commandId: "focused", executable: fake, args: [], timeoutMs: 100 }],
  });
  let reads = 0;
  changed.readWorkspaceRevision = async () => {
    reads += 1;
    if (reads === 2) await writeFile(fake, "#!/bin/sh\nexit 1\n", { mode: 0o700 });
    return baseRevision;
  };
  await assert.rejects(() => runMayToolCall(request(root, "runValidation", { commandId: "focused" }), changed), /may_validation_executable_changed/u);
});

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

function modelResponse() {
  return {
    models: [{
      key: "ornith-1.0-35b",
      loaded_instances: [{ id: "ornith-1.0-35b:2" }],
      capabilities: { trained_for_tool_use: true },
    }],
  };
}

function toolCall(id, name, args) {
  return {
    choices: [{ message: { role: "assistant", content: null, tool_calls: [
      { id, type: "function", function: { name, arguments: JSON.stringify(args) } },
    ] } }],
  };
}

function finalMayResponse() {
  return { choices: [{ message: { role: "assistant", content: "May report: fixture repaired and focused validation passes." } }] };
}

function controlRequest(root) {
  return {
    baseUrl: "http://127.0.0.1:1234",
    model: "ornith-1.0-35b",
    systemPrompt: "Implement only the approved fixture repair.",
    userPrompt: "Repair src/approved.txt and run focused validation.",
    sessionId: "session:issue-42:loop",
    repositoryRoot: root,
    baseRevision,
  };
}

function controlDependencies(root, fetchImpl, overrides = {}) {
  let resultCounter = 0;
  const events = [];
  return {
    ...dependencies(root, "writeFile", {
      fetchImpl,
      appendControlEvent: async (event) => {
        events.push(event);
        return { eventId: event.eventId, appended: true };
      },
      readWorkspaceStatus: async () => {
        try {
          await readFile(join(root, "src/approved.txt"), "utf8");
          return ["src/approved.txt"];
        } catch {
          return [];
        }
      },
      nextCallSlot: async (slot) => {
        const mapping = MAY_TOOL_MAPPINGS[slot.toolName];
        return {
          ...plan(slot.toolName, slot.effectKey),
          cycleId: `cycle:issue-42:${slot.toolCallId}`,
          validationId: `validation:issue-42:${slot.toolCallId}`,
          actionId: mapping.actionId,
          effectClass: mapping.effectClass,
        };
      },
      getAuthorizationContext: async (activePlan) => {
        const toolName = activePlan.actionId === "repository.write_file" ? "writeFile" : "runValidation";
        return permissionContext(root, toolName, activePlan.effectKey, { decisionId: `decision:issue-42:${activePlan.cycleId}:authorize` });
      },
      getExecutionContext: async (decision) => {
        const toolName = decision.actionId === "repository.write_file" ? "writeFile" : "runValidation";
        return permissionContext(root, toolName, decision.effectKey, { decisionId: decision.decisionId });
      },
      nextResultRecordId: () => {
        resultCounter += 1;
        return `audit:result:issue-42:loop:${resultCounter}`;
      },
      validationCommands: [{
        commandId: "focused",
        executable: process.execPath,
        args: ["-e", "const f=require('node:fs');const v=f.readFileSync('src/approved.txt','utf8');if(v!=='fixed\\n'){console.error('not fixed');process.exit(2)}console.log('validation ok')"],
        timeoutMs: 2_000,
      }],
      ...overrides,
    }),
    events,
  };
}

async function threeWriteControlFixture(root) {
  const executable = await realpath(process.execPath);
  const info = await stat(executable);
  const writes = ["one", "two", "three"].map((name) => ({
    toolName: "writeFile",
    path: `src/${name}.txt`,
    content: `${name}\n`,
    precondition: { kind: "absent" },
  }));
  const validationScript = "const f=require('node:fs');for(const n of ['one','two','three'])if(f.readFileSync(`src/${n}.txt`,'utf8')!==`${n}\\n`)process.exit(2)";
  const validation = {
    toolName: "runValidation",
    commandId: "focused",
    executable,
    args: ["-e", validationScript],
    timeoutMs: 2_000,
    executableIdentity: executableIdentity(info),
  };
  return { writes, validation, plannedToolOperations: [...writes, validation], validationScript };
}

async function existingWritePaths(root, writes) {
  const states = await Promise.all(writes.map(async ({ path }) => ({ path, exists: await stat(join(root, path)).then(() => true, () => false) })));
  return states.filter(({ exists }) => exists).map(({ path }) => path).sort();
}

test("May control loop performs one successful write-validation cycle and final report", async (context) => {
  const root = await workspace(context);
  const responses = [
    modelResponse(),
    toolCall("call:write:fix", "writeFile", { path: "src/approved.txt", content: "fixed\n", expectedSha256: "absent" }),
    toolCall("call:validate:ok", "runValidation", { commandId: "focused" }),
    finalMayResponse(),
  ];
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return jsonResponse(responses.shift());
  };
  const deps = controlDependencies(root, fetchImpl);
  const result = await runMayControlLoop(controlRequest(root), deps);
  assert.equal(await readFile(join(root, "src/approved.txt"), "utf8"), "fixed\n");
  assert.equal(result.attribution, "untrusted_model_output");
  assert.equal(result.completedToolCalls, 2);
  assert.equal(result.writeCalls, 1);
  assert.equal(result.validationCalls, 1);
  assert.match(result.message, /fixture repaired/u);
  const governedRequests = requests.filter(({ url }) => url.endsWith("/v1/chat/completions"));
  assert.equal(governedRequests.length, 3);
  for (const { options } of governedRequests) {
    const body = JSON.parse(options.body);
    assert.deepEqual({ temperature: body.temperature, top_p: body.top_p, top_k: body.top_k }, {
      temperature: 0.6, top_p: 0.95, top_k: 20,
    });
  }
  assert.equal(deps.ledger.filter((item) => item.recordType === "permission.decision").length, 2);
  assert.equal(deps.events.at(0).code, "may_control_started");
  assert.equal(deps.events.at(-1).code, "may_control_completed");
});

test("May control loop performs three exact ordered writes and one final validation", async (context) => {
  const root = await workspace(context);
  const fixture = await threeWriteControlFixture(root);
  const responses = [
    modelResponse(),
    ...fixture.writes.map((operation, index) => toolCall(`call:write:${index + 1}`, "writeFile", {
      path: operation.path, content: operation.content, expectedSha256: "absent",
    })),
    toolCall("call:validation:final", "runValidation", { commandId: "focused" }),
    finalMayResponse(),
  ];
  const deps = controlDependencies(root, async () => jsonResponse(responses.shift()), {
    approvedFiles: fixture.writes.map(({ path }) => path),
    plannedToolOperations: fixture.plannedToolOperations,
    validationCommands: [{ commandId: "focused", executable: process.execPath, args: ["-e", fixture.validationScript], timeoutMs: 2_000 }],
    readWorkspaceStatus: async () => existingWritePaths(root, fixture.writes),
  });
  const result = await runMayControlLoop(controlRequest(root), deps);
  assert.deepEqual(await Promise.all(fixture.writes.map(({ path }) => readFile(join(root, path), "utf8"))), ["one\n", "two\n", "three\n"]);
  assert.deepEqual({ completedToolCalls: result.completedToolCalls, writeCalls: result.writeCalls, validationCalls: result.validationCalls }, {
    completedToolCalls: 4, writeCalls: 3, validationCalls: 1,
  });
  assert.deepEqual(deps.events.map(({ code }) => code), [
    "may_control_started", "may_control_writeFile_completed", "may_control_writeFile_completed",
    "may_control_writeFile_completed", "may_control_runValidation_completed", "may_control_completed",
  ]);
  assert.equal(deps.ledger.filter(({ recordType }) => recordType === "tool.result").length, 4);
});

test("May control loop rejects reordered, omitted, repeated, and substituted operations before the mismatch effect", async (context) => {
  const scenarios = [
    {
      name: "reordered",
      calls: (fixture) => [toolCall("call:validation:first", "runValidation", { commandId: "focused" })],
      written: [],
    },
    {
      name: "omitted",
      calls: (fixture) => [toolCall("call:write:one", "writeFile", { path: fixture.writes[0].path, content: fixture.writes[0].content, expectedSha256: "absent" }), finalMayResponse()],
      written: ["one"],
    },
    {
      name: "repeated",
      calls: (fixture) => [
        toolCall("call:write:one", "writeFile", { path: fixture.writes[0].path, content: fixture.writes[0].content, expectedSha256: "absent" }),
        toolCall("call:write:repeat", "writeFile", { path: fixture.writes[0].path, content: fixture.writes[0].content, expectedSha256: "absent" }),
      ],
      written: ["one"],
    },
    {
      name: "substituted",
      calls: (fixture) => [toolCall("call:write:substitute", "writeFile", { path: fixture.writes[0].path, content: "substitute\n", expectedSha256: "absent" })],
      written: [],
    },
  ];
  for (const scenario of scenarios) {
    const root = await workspace(context, `shield-may-${scenario.name}-`);
    const fixture = await threeWriteControlFixture(root);
    const responses = [modelResponse(), ...scenario.calls(fixture)];
    const deps = controlDependencies(root, async () => jsonResponse(responses.shift()), {
      approvedFiles: fixture.writes.map(({ path }) => path),
      plannedToolOperations: fixture.plannedToolOperations,
      validationCommands: [{ commandId: "focused", executable: process.execPath, args: ["-e", fixture.validationScript], timeoutMs: 2_000 }],
      readWorkspaceStatus: async () => existingWritePaths(root, fixture.writes),
    });
    await assert.rejects(() => runMayControlLoop(controlRequest(root), deps), /may_control_(?:sequence_mismatch|protocol_incomplete)/u, scenario.name);
    for (const operation of fixture.writes) {
      const exists = await stat(join(root, operation.path)).then(() => true, () => false);
      assert.equal(exists, scenario.written.includes(operation.content.trim()), `${scenario.name}: ${operation.path}`);
    }
  }
});

test("May control loop stops after a mid-sequence failure with only the completed prefix durable", async (context) => {
  const root = await workspace(context);
  const fixture = await threeWriteControlFixture(root);
  await writeFile(join(root, fixture.writes[1].path), "occupied\n", "utf8");
  const responses = [
    modelResponse(),
    toolCall("call:write:one", "writeFile", { path: fixture.writes[0].path, content: fixture.writes[0].content, expectedSha256: "absent" }),
    toolCall("call:write:two", "writeFile", { path: fixture.writes[1].path, content: fixture.writes[1].content, expectedSha256: "absent" }),
  ];
  const deps = controlDependencies(root, async () => jsonResponse(responses.shift()), {
    approvedFiles: fixture.writes.map(({ path }) => path),
    plannedToolOperations: fixture.plannedToolOperations,
    validationCommands: [{ commandId: "focused", executable: process.execPath, args: ["-e", fixture.validationScript], timeoutMs: 2_000 }],
    readWorkspaceStatus: async () => existingWritePaths(root, fixture.writes),
  });
  await assert.rejects(() => runMayControlLoop(controlRequest(root), deps), /may_file_digest_mismatch/u);
  assert.equal(await readFile(join(root, fixture.writes[0].path), "utf8"), "one\n");
  assert.equal(await readFile(join(root, fixture.writes[1].path), "utf8"), "occupied\n");
  assert.equal(await stat(join(root, fixture.writes[2].path)).then(() => true, () => false), false);
  assert.deepEqual(deps.events.filter(({ code }) => code.endsWith("_completed")).map(({ code }) => code), ["may_control_writeFile_completed"]);
  assert.equal(deps.ledger.filter(({ recordType, outcome }) => recordType === "tool.result" && outcome === "completed").length, 1);
});

test("May control loop stops after nonzero validation and cannot advance to correction or final report", async (context) => {
  const root = await workspace(context);
  const responses = [
    modelResponse(),
    toolCall("call:write:bad", "writeFile", { path: "src/approved.txt", content: "bad\n", expectedSha256: "absent" }),
    toolCall("call:validate:bad", "runValidation", { commandId: "focused" }),
    toolCall("call:write:fix", "writeFile", { path: "src/approved.txt", content: "fixed\n", expectedSha256: digest("bad\n") }),
  ];
  let requests = 0;
  const deps = controlDependencies(root, async () => {
    requests += 1;
    return jsonResponse(responses.shift());
  });
  await assert.rejects(() => runMayControlLoop(controlRequest(root), deps), /may_validation_nonzero_exit/u);
  assert.equal(await readFile(join(root, "src/approved.txt"), "utf8"), "bad\n");
  assert.equal(requests, 3);
  assert.equal(deps.ledger.at(-1).outcome, "failed");
  assert.equal(deps.events.at(-1).code, "may_validation_nonzero_exit");
});

test("May control loop requires runtime identity, validation before final report, and event receipts", async (context) => {
  const root = await workspace(context);
  await assert.rejects(() => runMayControlLoop(controlRequest(root), controlDependencies(root, async () => jsonResponse(modelResponse()), {
    reasoningRuntimeId: "ornith-1.0-35b:other",
  })), /may_control_runtime_mismatch/u);

  const earlyFinal = [modelResponse(), finalMayResponse()];
  await assert.rejects(() => runMayControlLoop(controlRequest(root), controlDependencies(root, async () => jsonResponse(earlyFinal.shift()))), /may_control_protocol_incomplete/u);

  const badReceipt = [modelResponse()];
  await assert.rejects(() => runMayControlLoop(controlRequest(root), controlDependencies(root, async () => jsonResponse(badReceipt.shift()), {
    appendControlEvent: async (event) => ({ eventId: event.eventId, appended: false }),
  })), /may_control_event_receipt_invalid/u);
});

test("May control loop fails closed on duplicate calls and uncertain executor outcomes", async (context) => {
  const root = await workspace(context);
  const duplicate = [
    modelResponse(),
    { choices: [{ message: { role: "assistant", content: null, tool_calls: [
      { id: "call:dup", type: "function", function: { name: "writeFile", arguments: JSON.stringify({ path: "src/approved.txt", content: "bad\n", expectedSha256: "absent" }) } },
      { id: "call:dup", type: "function", function: { name: "runValidation", arguments: JSON.stringify({ commandId: "focused" }) } },
    ] } }] },
  ];
  await assert.rejects(() => runMayControlLoop(controlRequest(root), controlDependencies(root, async () => jsonResponse(duplicate.shift()))), /may_control_tool_call_id_reused/u);

  const drift = [
    modelResponse(),
    toolCall("call:validate:uncertain", "runValidation", { commandId: "focused" }),
  ];
  const deps = controlDependencies(root, async () => jsonResponse(drift.shift()), {
    readWorkspaceStatus: async () => ["src/unapproved.txt"],
  });
  await assert.rejects(() => runMayControlLoop(controlRequest(root), deps), /may_workspace_scope_mismatch/u);
  assert.equal(deps.events.at(-1).code, "may_workspace_scope_mismatch");
});

test("May control loop publishes bounded limits and closed tool set", () => {
  assert.equal(MAY_CONTROL_LOOP_LIMITS.calls, 8);
  assert.deepEqual(MAY_TOOL_DEFINITIONS.map((item) => item.function.name), ["writeFile", "runValidation"]);
});
