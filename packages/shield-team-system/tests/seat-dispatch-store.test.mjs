import assert from "node:assert/strict";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, open, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  appendSeatDispatchReceiptEntryV1,
  readSeatDispatchReceiptByReceiptIdV1,
  readSeatDispatchReceiptsByParentMissionSessionV1,
  readSeatDispatchReceiptsByChildTaskSessionV1,
} from "../dist/seat-dispatch-store.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dispatchReceiptsFacade = pathToFileURL(join(packageRoot, "dist/dispatch-receipts.mjs")).href;

function readLogBytes(logPath) {
  return open(logPath, constants.O_RDONLY | constants.O_NOFOLLOW).then(async (handle) => {
    try {
      return handle.readFile("utf8");
    } finally {
      await handle.close().catch(() => undefined);
    }
  });
}

function baseIdentity(overrides = {}) {
  return {
    receiptId: "receipt-1",
    dispatchId: "dispatch-1",
    parentMissionId: "mission-1",
    parentMissionRevision: "abcdef1234567890abcdef1234567890abcdef12",
    parentSessionId: "session-1",
    repositoryRevision: "0ff3aa1c8d3e1f4a9c7b5e2d1f3a4c6b7d9e0f12",
    childTaskId: "task-1",
    childSessionId: "child-session-1",
    accountableSeatId: "may",
    repositoryId: "repo-1",
    repositoryWorkspaceId: "workspace-1",
    subjectId: "subject-1",
    subjectRevision: "abcdef1234567890abcdef1234567890abcdef12",
    artifactId: "artifact-1",
    artifactRevision: "abcdef1234567890abcdef1234567890abcdef12",
    inputEvidenceRefs: [],
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: { kind: "runtime.host_observed.unavailable", reason: "unobserved" },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: { kind: "executor.host_observed.unavailable", reason: "not_observed" },
    configuredRuntime: { kind: "runtime.configured", runtimeId: "runtime-1", model: "model:demo" },
    requestedRuntime: { kind: "runtime.requested", runtimeId: "runtime-1", model: "model:demo" },
    toolExecution: { kind: "tool.execution.not_requested", reason: "not_requested" },
    timestamp: "2026-07-29T12:00:00.000Z",
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
    ...overrides,
  };
}

function appendReceipt(repositoryRoot, event, lockOwnerId = "owner-a") {
  return appendSeatDispatchReceiptEntryV1({
    repositoryRoot,
    repositoryId: baseIdentity().repositoryId,
    repositoryWorkspaceId: baseIdentity().repositoryWorkspaceId,
    event,
    lockOwnerId,
  });
}

function started(overrides = {}) {
  return createSeatDispatchStartedEventV1(baseIdentity(overrides));
}

function lifecycle(previous, overrides = {}) {
  return createSeatDispatchLifecycleEventV1({
    ...identityPayload(previous),
    kind: "dispatch.interrupted",
    timestamp: new Date(Date.parse(previous.timestamp) + 1000).toISOString(),
    logSequence: previous.logSequence + 1,
    previousLogDigest: previous.entryDigest,
    lifecycleSequence: previous.lifecycleSequence + 1,
    previousLifecycleDigest: previous.entryDigest,
    ...overrides,
  });
}

function completed(previous, overrides = {}) {
  return createSeatDispatchLifecycleEventV1({
    ...identityPayload(previous),
    kind: "dispatch.completed",
    timestamp: new Date(Date.parse(previous.timestamp) + 1000).toISOString(),
    logSequence: previous.logSequence + 1,
    previousLogDigest: previous.entryDigest,
    lifecycleSequence: previous.lifecycleSequence + 1,
    previousLifecycleDigest: previous.entryDigest,
    ...overrides,
  });
}

function identityPayload(event) {
  return {
    receiptId: event.receiptId,
    dispatchId: event.dispatchId,
    parentMissionId: event.parentMissionId,
    parentMissionRevision: event.parentMissionRevision,
    repositoryRevision: event.repositoryRevision,
    parentSessionId: event.parentSessionId,
    childTaskId: event.childTaskId,
    childSessionId: event.childSessionId,
    accountableSeatId: event.accountableSeatId,
    repositoryId: event.repositoryId,
    repositoryWorkspaceId: event.repositoryWorkspaceId,
    subjectId: event.subjectId,
    subjectRevision: event.subjectRevision,
    artifactId: event.artifactId,
    artifactRevision: event.artifactRevision,
    configuredRuntime: event.configuredRuntime,
    requestedRuntime: event.requestedRuntime,
    toolExecution: event.toolExecution,
    runtimeSelfReport: event.runtimeSelfReport,
    runtimeHostObserved: event.runtimeHostObserved,
    executorSelfReport: event.executorSelfReport,
    executorHostObserved: event.executorHostObserved,
  };
}

async function openLock(repositoryRoot) {
  const lockPath = join(repositoryRoot, ".shield", "dispatch-receipts.jsonl.lock");
  const handle = await open(lockPath, "wx");
  return { handle, lockPath };
}

async function readStoreLogAndAssert(logPath) {
  const bytes = await readLogBytes(logPath);
  return bytes;
}

async function assertBytesPreserved(logPath, action) {
  const before = await readStoreLogAndAssert(logPath);
  const result = await action();
  assert.equal(await readStoreLogAndAssert(logPath), before);
  return { result, before };
}

test("append and reads preserve exact log bytes", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-store-"));
  const start = started();
  const complete = completed(start, {
    timestamp: "2026-07-29T12:00:01.000Z",
    outputEvidenceRefs: ["artifact-output"],
  });

  const startedResult = await appendReceipt(repositoryRoot, start);
  assert.equal(startedResult.state, "valid", startedResult.errors?.join(" "));
  const logPath = startedResult.value.logPath;

  const byParentBefore = await assertBytesPreserved(logPath, async () => readSeatDispatchReceiptsByParentMissionSessionV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    parentMissionId: start.parentMissionId,
    parentSessionId: start.parentSessionId,
  }));
  assert.equal(byParentBefore.result.state, "valid");

  const byReceiptBefore = await assertBytesPreserved(logPath, async () => readSeatDispatchReceiptByReceiptIdV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    receiptId: start.receiptId,
  }));
  assert.equal(byReceiptBefore.result.state, "valid");

  const byChildBefore = await assertBytesPreserved(logPath, async () => readSeatDispatchReceiptsByChildTaskSessionV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    childTaskId: start.childTaskId,
    childSessionId: start.childSessionId,
  }));
  assert.equal(byChildBefore.result.state, "valid");

  const completeResult = await appendReceipt(repositoryRoot, complete, "owner-b");
  assert.equal(completeResult.state, "valid", completeResult.errors?.join(" "));
  assert.equal(completeResult.value.byteLength, Buffer.byteLength(await readLogBytes(logPath), "utf8"));

  const byParentAfter = await assertBytesPreserved(logPath, async () => readSeatDispatchReceiptsByParentMissionSessionV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    parentMissionId: start.parentMissionId,
    parentSessionId: start.parentSessionId,
  }));
  assert.equal(byParentAfter.result.state, "valid");
  assert.equal(byParentAfter.result.value.receipts.length, 1);
  assert.equal(byParentAfter.result.value.receipts[0].state, "completed");

  const byReceiptAfter = await assertBytesPreserved(logPath, async () => readSeatDispatchReceiptByReceiptIdV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    receiptId: start.receiptId,
  }));
  assert.equal(byReceiptAfter.result.state, "valid");
  assert.equal(byReceiptAfter.result.value.receipt.outputEvidenceRefs.length, 1);

  const byChildAfter = await assertBytesPreserved(logPath, async () => readSeatDispatchReceiptsByChildTaskSessionV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    childTaskId: start.childTaskId,
    childSessionId: start.childSessionId,
  }));
  assert.equal(byChildAfter.result.state, "valid");

  const restart = await assertBytesPreserved(logPath, async () => readSeatDispatchReceiptsByParentMissionSessionV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    parentMissionId: start.parentMissionId,
    parentSessionId: start.parentSessionId,
  }));
  assert.equal(restart.result.state, "valid");
  assert.equal(restart.result.value.receipts.length, 1);
});

test("fresh process retrieval is byte-identical and creates no new bytes", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-store-child-"));
  const start = started();
  const complete = completed(start, {
    timestamp: "2026-07-29T12:00:01.000Z",
    outputEvidenceRefs: ["artifact-output"],
  });

  const first = await appendReceipt(repositoryRoot, start);
  assert.equal(first.state, "valid", first.errors?.join(" "));
  const second = await appendReceipt(repositoryRoot, complete, "owner-b");
  assert.equal(second.state, "valid", second.errors?.join(" "));
  const logPath = second.value.logPath;

  const before = await readLogBytes(logPath);
  const script = join(repositoryRoot, "child-retrieval.mjs");
  await writeFile(script, `
    import { readFile } from "node:fs/promises";
    import { open } from "node:fs/promises";
    import { constants } from "node:fs";
    import {
      readSeatDispatchReceiptByReceiptIdV1,
      readSeatDispatchReceiptsByParentMissionSessionV1,
      readSeatDispatchReceiptsByChildTaskSessionV1,
    } from ${JSON.stringify(dispatchReceiptsFacade)};

    const repositoryRoot = ${JSON.stringify(repositoryRoot)};
    const repositoryId = ${JSON.stringify(start.repositoryId)};
    const repositoryWorkspaceId = ${JSON.stringify(start.repositoryWorkspaceId)};
    const receiptId = ${JSON.stringify(start.receiptId)};
    const parentMissionId = ${JSON.stringify(start.parentMissionId)};
    const parentSessionId = ${JSON.stringify(start.parentSessionId)};
    const childTaskId = ${JSON.stringify(start.childTaskId)};
    const childSessionId = ${JSON.stringify(start.childSessionId)};

    const parentResult = await readSeatDispatchReceiptsByParentMissionSessionV1({
      repositoryRoot,
      repositoryId,
      repositoryWorkspaceId,
      parentMissionId,
      parentSessionId,
    });
    const receiptResult = await readSeatDispatchReceiptByReceiptIdV1({
      repositoryRoot,
      repositoryId,
      repositoryWorkspaceId,
      receiptId,
    });
    const childResult = await readSeatDispatchReceiptsByChildTaskSessionV1({
      repositoryRoot,
      repositoryId,
      repositoryWorkspaceId,
      childTaskId,
      childSessionId,
    });
    if (parentResult.state !== "valid" || receiptResult.state !== "valid" || childResult.state !== "valid") {
      throw new Error("invalid child retrieval result");
    }
    const logHandle = await open(parentResult.value.logPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes;
    try {
      bytes = await logHandle.readFile("utf8");
    } finally {
      await logHandle.close().catch(() => undefined);
    }
    process.stdout.write(JSON.stringify({
      parentCount: parentResult.value.receipts.length,
      receiptState: receiptResult.value.receipt.state,
      childCount: childResult.value.receipts.length,
      bytes,
    }));
  `);
  const stdout = execFileSync(process.execPath, [script], { encoding: "utf8" });
  const result = JSON.parse(stdout);
  assert.equal(result.parentCount, 1);
  assert.equal(result.receiptState, "completed");
  assert.equal(result.childCount, 1);
  assert.equal(result.bytes, before);
  assert.equal(await readLogBytes(logPath), before);
  await rm(script);
});

test("non-regular lock target is rejected", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-lockir-"));
  const start = started();
  const first = await appendReceipt(repositoryRoot, start);
  assert.equal(first.state, "valid", first.errors?.join(" "));
  const lockPath = join(dirname(first.value.logPath), "dispatch-receipts.jsonl.lock");
  const before = await readLogBytes(first.value.logPath);

  const lockTarget = lockPath;
  await rm(lockPath, { force: true }).catch(() => undefined);
  await mkdir(lockTarget, { recursive: true });
  const appendResult = await appendSeatDispatchReceiptEntryV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    event: lifecycle(start, { kind: "dispatch.interrupted", timestamp: "2026-07-29T12:00:01.000Z" }),
    lockOwnerId: "owner-regular",
  });
  assert.equal(appendResult.state, "invalid");
  assert.equal(appendResult.code, "unsafe_path");
  assert.equal(await readLogBytes(first.value.logPath), before);
});

test("lock contention does not mutate bytes", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-lock-"));
  const start = started();
  const first = await appendReceipt(repositoryRoot, start);
  assert.equal(first.state, "valid", first.errors?.join(" "));

  const { handle } = await openLock(repositoryRoot);
  const logPath = first.value.logPath;
  const before = await readLogBytes(logPath);

  const next = createSeatDispatchLifecycleEventV1({
    ...identityPayload(start),
    kind: "dispatch.interrupted",
    timestamp: "2026-07-29T12:00:01.000Z",
    logSequence: 1,
    previousLogDigest: start.entryDigest,
    lifecycleSequence: 1,
    previousLifecycleDigest: start.entryDigest,
  });

  const result = await appendSeatDispatchReceiptEntryV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    event: next,
    lockOwnerId: "owner-locked",
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "dispatch_receipt_lock_held");
  assert.equal(await readLogBytes(logPath), before);

  await handle.close();
});

test("scope mismatch in replay is rejected and cannot be repaired", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-scope-"));
  const start = started();
  const first = await appendReceipt(repositoryRoot, start);
  assert.equal(first.state, "valid", first.errors?.join(" "));
  const before = await readLogBytes(first.value.logPath);

  const mismatch = lifecycle(start, {
    kind: "dispatch.completed",
    repositoryWorkspaceId: "workspace-2",
    timestamp: "2026-07-29T12:00:01.000Z",
    outputEvidenceRefs: ["artifact-output"],
  });

  const result = await appendSeatDispatchReceiptEntryV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    event: mismatch,
    lockOwnerId: "owner-scope",
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "mixed_scope");
  assert.equal(await readLogBytes(first.value.logPath), before);
});

test("stale append from shared head is rejected and bytes remain", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-stale-"));
  const start = started();
  const first = await appendReceipt(repositoryRoot, start);
  assert.equal(first.state, "valid", first.errors?.join(" "));

  const winner = lifecycle(start, {
    kind: "dispatch.interrupted",
    timestamp: "2026-07-29T12:00:01.000Z",
  });
  const stale = lifecycle(start, {
    kind: "dispatch.interrupted",
    timestamp: "2026-07-29T12:00:02.000Z",
  });

  const winning = await appendReceipt(repositoryRoot, winner, "owner-winner");
  assert.equal(winning.state, "valid", winning.errors?.join(" "));
  const logPath = winning.value.logPath;
  const before = await readLogBytes(logPath);

  const staleResult = await appendReceipt(repositoryRoot, stale, "owner-stale");
  assert.equal(staleResult.state, "invalid");
  assert.ok(staleResult.code === "global_previous_digest" || staleResult.code === "global_sequence_gap");
  assert.equal(await readLogBytes(logPath), before);
});

test("global sequence mismatch and wrong digest are rejected with no byte change", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-chain-"));
  const start = started();
  const first = await appendReceipt(repositoryRoot, start);
  assert.equal(first.state, "valid", first.errors?.join(" "));

  const before = await readLogBytes(first.value.logPath);

  const badSequence = lifecycle(start, {
    kind: "dispatch.interrupted",
    logSequence: 99,
    previousLogDigest: start.entryDigest,
  });
  const badSequenceResult = await appendReceipt(repositoryRoot, badSequence, "owner-bad-seq");
  assert.equal(badSequenceResult.state, "invalid");
  assert.equal(await readLogBytes(first.value.logPath), before);

  const badDigest = lifecycle(start, {
    kind: "dispatch.interrupted",
    logSequence: 1,
    previousLogDigest: "sha256:" + "a".repeat(43),
  });
  const badDigestResult = await appendReceipt(repositoryRoot, badDigest, "owner-bad-digest");
  assert.equal(badDigestResult.state, "invalid");
  assert.equal(await readLogBytes(first.value.logPath), before);
});

test("malformed tail and noncanonical line are rejected and preserved", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-tail-"));
  const start = started();
  const shield = join(repositoryRoot, ".shield");
  await mkdir(shield, { recursive: true });
  const logPath = join(shield, "dispatch-receipts.jsonl");
  const nonCanonical = `${JSON.stringify(start)}{bad"`;
  await writeFile(logPath, nonCanonical);

  const malformedTail = await readSeatDispatchReceiptByReceiptIdV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    receiptId: start.receiptId,
  });
  assert.equal(malformedTail.state, "invalid");
  assert.equal(malformedTail.code, "recovery_required");
  assert.equal(await readLogBytes(logPath), nonCanonical);

  const canonicalLine = JSON.stringify(start).replace(/,/g, ", ");
  await writeFile(logPath, `${canonicalLine}\n`);
  const canonicalResult = await readSeatDispatchReceiptsByChildTaskSessionV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    childTaskId: start.childTaskId,
    childSessionId: start.childSessionId,
  });
  assert.equal(canonicalResult.state, "invalid");
  assert.equal(canonicalResult.code, "recovery_required");
  assert.equal(await readLogBytes(logPath), `${canonicalLine}\n`);
});

test("duplicate JSON keys are rejected and bytes preserved", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-duplicate-"));
  const start = started();
  const shield = join(repositoryRoot, ".shield");
  await mkdir(shield, { recursive: true });
  const logPath = join(shield, "dispatch-receipts.jsonl");
  const line = JSON.stringify(start).replace('"receiptId":"receipt-1"', '"receiptId":"receipt-1","receiptId":"receipt-dup"');
  await writeFile(logPath, `${line}\n`);

  const read = await readSeatDispatchReceiptByReceiptIdV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    receiptId: start.receiptId,
  });
  assert.equal(read.state, "invalid");
  assert.equal(read.code, "recovery_required");
  assert.equal(await readLogBytes(logPath), `${line}\n`);
});

test("symlinked shield, log, and lock are rejected", async () => {
  const start = started();

  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-shield-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-seat-receipt-outside-"));
  await rm(join(repositoryRoot, ".shield"), { force: true, recursive: true }).catch(() => undefined);
  await symlink(outside, join(repositoryRoot, ".shield"));
  const symlinkShieldResult = await appendSeatDispatchReceiptEntryV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    event: start,
    lockOwnerId: "owner-shield",
  });
  assert.equal(symlinkShieldResult.state, "invalid");
  assert.equal(symlinkShieldResult.code, "unsafe_path");

  const repositoryRoot2 = await mkdtemp(join(tmpdir(), "shield-seat-receipt-loglink-"));
  const outsideLog = await mkdtemp(join(tmpdir(), "shield-seat-receipt-log-target-"));
  await mkdir(join(repositoryRoot2, ".shield"), { recursive: true });
  const outsideTarget = join(outsideLog, "captured.jsonl");
  const lines = `${JSON.stringify(start)}\n`;
  await writeFile(outsideTarget, lines);
  await symlink(outsideTarget, join(repositoryRoot2, ".shield", "dispatch-receipts.jsonl"));

  const logRead = await readSeatDispatchReceiptByReceiptIdV1({
    repositoryRoot: repositoryRoot2,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    receiptId: start.receiptId,
  });
  assert.equal(logRead.state, "invalid");
  assert.equal(logRead.code, "unsafe_path");
  assert.equal(await readLogBytes(outsideTarget), lines);

  const appendWithLinkedLog = await appendSeatDispatchReceiptEntryV1({
    repositoryRoot: repositoryRoot2,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    event: lifecycle(start, {
      kind: "dispatch.interrupted",
      timestamp: "2026-07-29T12:00:01.000Z",
    }),
    lockOwnerId: "owner-link-log",
  });
  assert.equal(appendWithLinkedLog.state, "invalid");
  assert.equal(appendWithLinkedLog.code, "unsafe_path");
  const lockPath = join(repositoryRoot2, ".shield", "dispatch-receipts.jsonl.lock");
  const outsideLock = await mkdtemp(join(tmpdir(), "shield-seat-receipt-lock-target-"));
  const replacement = join(outsideLock, "marker");
  await writeFile(replacement, "\n");
  await symlink(replacement, lockPath);

  const lockResult = await appendSeatDispatchReceiptEntryV1({
    repositoryRoot: repositoryRoot2,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    event: lifecycle(start, { kind: "dispatch.interrupted", timestamp: "2026-07-29T12:00:01.000Z" }),
    lockOwnerId: "owner-lock-link",
  });
  assert.equal(lockResult.state, "invalid");
  assert.equal(lockResult.code, "unsafe_path");
});

test("non-regular log files are rejected", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-irregular-"));
  const start = started();
  const shield = join(repositoryRoot, ".shield");
  const logPath = join(shield, "dispatch-receipts.jsonl");
  await mkdir(shield, { recursive: true });
  await mkdir(logPath, { recursive: true });

  const read = await readSeatDispatchReceiptByReceiptIdV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    receiptId: start.receiptId,
  });
  assert.equal(read.state, "invalid");
  assert.equal(read.code, "unsafe_path");

  const appendResult = await appendReceipt(repositoryRoot, start);
  assert.equal(appendResult.state, "invalid");
  assert.equal(appendResult.code, "unsafe_path");
});

test("malformed scope helpers reject extra fields at every query boundary", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-seat-receipt-boundary-"));
  const start = started();
  const accepted = await appendReceipt(repositoryRoot, start);
  assert.equal(accepted.state, "valid", accepted.errors?.join(" "));

  const before = await readLogBytes(accepted.value.logPath);
  const receiptResult = await readSeatDispatchReceiptByReceiptIdV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    receiptId: start.receiptId,
    extra: "disallowed",
  });
  assert.equal(receiptResult.state, "invalid");

  const parentResult = await readSeatDispatchReceiptsByParentMissionSessionV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    parentMissionId: start.parentMissionId,
    parentSessionId: start.parentSessionId,
    extra: "disallowed",
  });
  assert.equal(parentResult.state, "invalid");

  const childResult = await readSeatDispatchReceiptsByChildTaskSessionV1({
    repositoryRoot,
    repositoryId: start.repositoryId,
    repositoryWorkspaceId: start.repositoryWorkspaceId,
    childTaskId: start.childTaskId,
    childSessionId: start.childSessionId,
    extra: "disallowed",
  });
  assert.equal(childResult.state, "invalid");

  assert.equal(await readLogBytes(accepted.value.logPath), before);
});
