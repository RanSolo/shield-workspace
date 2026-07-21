import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MAY_TOOL_DEFINITIONS,
  MAY_TOOL_MAPPINGS,
  runMayToolCall,
} from "../scripts/model/may-tool-executor.mjs";

const missionRevision = "0123456789012345678901234567890123456789";
const baseRevision = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
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
    evaluatedAt: "2026-07-21T20:05:00Z", decisionId: `decision:issue-42:${toolName}:1`,
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

test("returns a nonzero validation result so May can perform a bounded correction", async (context) => {
  const root = await workspace(context);
  const deps = dependencies(root, "runValidation", {
    validationCommands: [{ commandId: "focused", executable: process.execPath, args: ["-e", "console.error('failed');process.exit(3)"], timeoutMs: 2_000 }],
  });
  const result = await runMayToolCall(request(root, "runValidation", { commandId: "focused" }), deps);
  assert.equal(result.exitCode, 3);
  assert.equal(result.stderr, "failed\n");
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
