import assert from "node:assert/strict";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, open, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  appendSeatDispatchReceiptEntryV1,
  claimSeatDispatchPacketV1,
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
const seatDispatchStoreModule = pathToFileURL(join(packageRoot, "dist/seat-dispatch-store.mjs")).href;

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

function packetBytes(value) {
  return new TextEncoder().encode(value);
}

function packetClaimInput(repositoryRoot, overrides = {}) {
  const identity = baseIdentity();
  return {
    repositoryRoot,
    repositoryId: identity.repositoryId,
    repositoryWorkspaceId: identity.repositoryWorkspaceId,
    lockOwnerId: "claim-owner",
    parentMissionId: identity.parentMissionId,
    parentMissionRevision: identity.parentMissionRevision,
    parentSessionId: identity.parentSessionId,
    accountableSeatId: identity.accountableSeatId,
    subjectId: identity.subjectId,
    subjectRevision: identity.subjectRevision,
    artifactId: identity.artifactId,
    artifactRevision: identity.artifactRevision,
    repositoryRevision: identity.repositoryRevision,
    startedAt: identity.timestamp,
    configuredRuntime: identity.configuredRuntime,
    requestedRuntime: identity.requestedRuntime,
    toolExecution: identity.toolExecution,
    runtimeSelfReport: identity.runtimeSelfReport,
    runtimeHostObserved: identity.runtimeHostObserved,
    executorSelfReport: identity.executorSelfReport,
    executorHostObserved: identity.executorHostObserved,
    packetId: "packet-1",
    packetBytes: packetBytes('{"alpha":1,"half":0.5}'),
    inputEvidenceRefs: [],
    ...overrides,
  };
}

test("atomic packet claim returns execute_once once and exact retry is non-executable", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-claim-"));
  const first = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot));
  assert.equal(first.state, "valid", first.errors?.join(" "));
  assert.equal(first.value.claimStatus, "claimed");
  assert.equal(first.value.executionDisposition, "execute_once");
  assert.match(first.value.packetDigest, /^sha256:[A-Za-z0-9_-]{43}$/);
  assert.equal(first.value.receipt.inputEvidenceRefs.length, 1);
  assert.match(first.value.receipt.inputEvidenceRefs[0], /^evidence:packet-binding:seat-dispatch-v1:/);
  const before = await readLogBytes(first.value.logPath);

  const duplicate = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    startedAt: "2026-07-29T12:00:01.000Z",
    packetBytes: packetBytes('{ "half" : 0.5, "alpha" : 1 }'),
  }));
  assert.equal(duplicate.state, "valid", duplicate.errors?.join(" "));
  assert.equal(duplicate.value.claimStatus, "already_claimed");
  assert.equal(Object.hasOwn(duplicate.value, "executionDisposition"), false);
  assert.equal(duplicate.value.receipt.startedAt, "2026-07-29T12:00:00.000Z");
  assert.equal(await readLogBytes(first.value.logPath), before);
});

test("packet claim conflicts on changed packet or normalized start fields", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-conflict-"));
  const first = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { packetBytes: packetBytes('{"v":1}') }));
  assert.equal(first.state, "valid", first.errors?.join(" "));
  const before = await readLogBytes(first.value.logPath);

  const changedPacket = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { packetBytes: packetBytes('{"v":2}') }));
  assert.equal(changedPacket.state, "invalid");
  assert.equal(changedPacket.code, "packet_claim_conflict");
  assert.equal(Object.hasOwn(changedPacket, "executionDisposition"), false);

  const staleSubject = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    packetBytes: packetBytes('{"v":1}'),
    subjectRevision: "abcdef1234567890abcdef1234567890abcdef13",
  }));
  assert.equal(staleSubject.state, "invalid");
  assert.equal(staleSubject.code, "packet_claim_conflict");
  assert.equal(await readLogBytes(first.value.logPath), before);
});

test("concurrent identical packet claims expose at most one execute_once and persist one start", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-concurrent-"));
  const results = await Promise.all(Array.from({ length: 4 }, () =>
    claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot))
  ));
  const executable = results.filter((result) =>
    result.state === "valid" && result.value.claimStatus === "claimed" && result.value.executionDisposition === "execute_once"
  );
  assert.ok(executable.length <= 1);
  for (const result of results) {
    if (result === executable[0]) continue;
    assert.equal(result.state === "valid" && Object.hasOwn(result.value, "executionDisposition"), false);
    if (result.state === "valid") assert.equal(result.value.claimStatus, "already_claimed");
    else assert.equal(result.code, "dispatch_receipt_lock_held");
  }

  const retry = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    startedAt: "2026-07-29T12:00:01.000Z",
  }));
  assert.equal(retry.state, "valid", retry.errors?.join(" "));
  assert.equal(retry.value.claimStatus, "already_claimed");
  assert.equal(Object.hasOwn(retry.value, "executionDisposition"), false);
  const rows = (await readLogBytes(retry.value.logPath)).trimEnd().split("\n").map((line) => JSON.parse(line));
  assert.equal(rows.filter((row) => row.kind === "dispatch.started").length, 1);
});

test("fresh-process start survives restart as non-executable already_claimed", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-restart-"));
  const { packetBytes: _packetBytes, ...childInput } = packetClaimInput(repositoryRoot);
  const childScript = `
    import { claimSeatDispatchPacketV1 } from ${JSON.stringify(seatDispatchStoreModule)};
    const input = JSON.parse(process.env.SHIELD_PACKET_CLAIM_INPUT);
    input.packetBytes = new TextEncoder().encode('{"alpha":1,"half":0.5}');
    const result = await claimSeatDispatchPacketV1(input);
    process.stdout.write(JSON.stringify({
      state: result.state,
      claimStatus: result.state === "valid" ? result.value.claimStatus : null,
      executionDisposition: result.state === "valid" ? result.value.executionDisposition : null,
      errors: result.state === "invalid" ? result.errors : [],
    }));
  `;
  const child = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", childScript], {
    encoding: "utf8",
    env: { ...process.env, SHIELD_PACKET_CLAIM_INPUT: JSON.stringify(childInput) },
  }));
  assert.equal(child.state, "valid", child.errors?.join(" "));
  assert.equal(child.claimStatus, "claimed");
  assert.equal(child.executionDisposition, "execute_once");

  const logPath = join(repositoryRoot, ".shield", "dispatch-receipts.jsonl");
  const before = await readLogBytes(logPath);
  const restarted = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    startedAt: "2026-07-29T12:00:02.000Z",
  }));
  assert.equal(restarted.state, "valid", restarted.errors?.join(" "));
  assert.equal(restarted.value.claimStatus, "already_claimed");
  assert.equal(Object.hasOwn(restarted.value, "executionDisposition"), false);
  assert.equal(await readLogBytes(logPath), before);
});

test("packet claim fails closed and preserves an incomplete existing ledger", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-malformed-ledger-"));
  const shieldDirectory = join(repositoryRoot, ".shield");
  const logPath = join(shieldDirectory, "dispatch-receipts.jsonl");
  const malformedBytes = '{"schemaVersion":1';
  await mkdir(shieldDirectory);
  await writeFile(logPath, malformedBytes);

  const result = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot));
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "recovery_required");
  assert.equal(Object.hasOwn(result, "executionDisposition"), false);
  assert.equal(await readLogBytes(logPath), malformedBytes);
});

test("claim snapshot rejects proxies, accessors, and SharedArrayBuffer without property execution", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-input-"));
  let traps = 0;
  const proxy = new Proxy(packetClaimInput(repositoryRoot), {
    get() { traps += 1; throw new Error("must not run"); },
    ownKeys() { traps += 1; throw new Error("must not run"); },
  });
  const proxyResult = await claimSeatDispatchPacketV1(proxy);
  assert.equal(proxyResult.state, "invalid");
  assert.equal(proxyResult.code, "malformed_input");
  assert.equal(traps, 0);

  let getters = 0;
  const accessor = packetClaimInput(repositoryRoot);
  Object.defineProperty(accessor, "packetBytes", {
    enumerable: true,
    get() { getters += 1; return packetBytes("{}"); },
  });
  const accessorResult = await claimSeatDispatchPacketV1(accessor);
  assert.equal(accessorResult.state, "invalid");
  assert.equal(accessorResult.code, "malformed_input");
  assert.equal(getters, 0);

  if (typeof SharedArrayBuffer === "function") {
    const shared = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
      packetBytes: new Uint8Array(new SharedArrayBuffer(8)),
    }));
    assert.equal(shared.state, "invalid");
    assert.equal(shared.code, "malformed_input");
  }
});

test("malformed scalar input precedes malformed packet without filesystem mutation", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-precedence-"));
  const result = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    repositoryId: "invalid repository identity",
    packetBytes: packetBytes("{malformed"),
  }));
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "malformed_input");
  assert.equal(Object.hasOwn(result, "executionDisposition"), false);
  await assert.rejects(lstat(join(repositoryRoot, ".shield")), (error) => error?.code === "ENOENT");
});

test("claim numeric profile rejects rounded decimals and accepts exact binary fractions", async () => {
  for (const token of [
    "0.1",
    "0.1000000000000000055511151231257827021181583404541015625",
    "9007199254740993",
    "1e309",
    "1e-400",
    "1.0000000000000001",
  ]) {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-number-invalid-"));
    const result = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { packetBytes: packetBytes(`{\"value\":${token}}`) }));
    assert.equal(result.state, "invalid", token);
    assert.equal(result.code, "malformed_packet", token);
    assert.equal(Object.hasOwn(result, "executionDisposition"), false);
  }
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-number-valid-"));
  const exact = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    packetBytes: packetBytes('{"zero":-0,"half":0.5,"large":9007199254740992}'),
  }));
  assert.equal(exact.state, "valid", exact.errors?.join(" "));
  assert.equal(exact.value.claimStatus, "claimed");
});

test("claim reserves one receipt evidence slot and public append rejects binding spoof", async () => {
  const fifteen = Array.from({ length: 15 }, (_, index) => `evidence-${index}`);
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-evidence-"));
  const accepted = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { inputEvidenceRefs: fifteen }));
  assert.equal(accepted.state, "valid", accepted.errors?.join(" "));
  assert.equal(accepted.value.receipt.inputEvidenceRefs.length, 16);

  const overflowRoot = await mkdtemp(join(tmpdir(), "shield-packet-evidence-overflow-"));
  const overflow = await claimSeatDispatchPacketV1(packetClaimInput(overflowRoot, {
    inputEvidenceRefs: [...fifteen, "evidence-15"],
  }));
  assert.equal(overflow.state, "invalid");
  assert.equal(overflow.code, "malformed_input");

  const spoofRoot = await mkdtemp(join(tmpdir(), "shield-packet-evidence-spoof-"));
  const spoof = started({ inputEvidenceRefs: ["evidence:packet-binding:seat-dispatch-v1:spoof:sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"] });
  const spoofResult = await appendReceipt(spoofRoot, spoof);
  assert.equal(spoofResult.state, "invalid");
  assert.equal(spoofResult.code, "malformed_input");
});

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
