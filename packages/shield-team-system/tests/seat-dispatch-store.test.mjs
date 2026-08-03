import assert from "node:assert/strict";
import { constants } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  replaySeatDispatchReceiptsV1,
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

function packetClaimKey(input) {
  return createHash("sha256")
    .update(`seat-dispatch-claim-v1\0${input.parentMissionId}\0${input.parentSessionId}\0${input.packetId}`, "utf8")
    .digest("base64url")
    .slice(0, 32);
}

async function assertMalformedPacketBeforeFs(packet, label) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-malformed-matrix-"));
  const result = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { packetBytes: packet }));
  assert.equal(result.state, "invalid", label);
  assert.equal(result.code, "malformed_packet", label);
  assert.equal(Object.hasOwn(result, "executionDisposition"), false, label);
  await assert.rejects(lstat(join(repositoryRoot, ".shield")), (error) => error?.code === "ENOENT", label);
}

async function assertAcceptedPacket(packet, label) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-accepted-matrix-"));
  const result = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { packetBytes: packet }));
  assert.equal(result.state, "valid", `${label}: ${result.errors?.join(" ") ?? ""}`);
  assert.equal(result.value.claimStatus, "claimed", label);
  return { repositoryRoot, result };
}

async function runPacketClaimFaultScenario(scenario) {
  const scriptRoot = await mkdtemp(join(tmpdir(), "shield-packet-fault-script-"));
  const scriptPath = join(scriptRoot, "packet-claim-fault.mjs");
  const { packetBytes: _packetBytes, ...serializedInput } = packetClaimInput("/placeholder");
  const script = `
    import { constants } from "node:fs";
    import * as realCrypto from "node:crypto";
    import * as realFs from "node:fs/promises";
    import { join } from "node:path";
    import { tmpdir } from "node:os";
    import { mock } from "node:test";

    const scenario = ${JSON.stringify(scenario)};
    const repositoryRoot = await realFs.mkdtemp(join(tmpdir(), "shield-packet-fault-child-"));
    const repositoryRootForChecks = await realFs.realpath(repositoryRoot);
    const shieldDirectory = join(repositoryRootForChecks, ".shield");
    const lockPath = join(shieldDirectory, "dispatch-receipts.jsonl.lock");
    const logPath = join(shieldDirectory, "dispatch-receipts.jsonl");
    const baseInput = ${JSON.stringify(serializedInput)};
    baseInput.repositoryRoot = repositoryRoot;
    if (scenario.lockOwnerId) baseInput.lockOwnerId = scenario.lockOwnerId;
    const claimInput = (overrides = {}) => ({
      ...baseInput,
      packetBytes: new TextEncoder().encode('{"alpha":1,"half":0.5}'),
      ...overrides,
    });
    let phase = "setup";
    let faultTriggered = false;
    let lockReadOpens = 0;
    let logReads = 0;
    let afterLockUnlink = false;
    let capturedMarker = null;

    mock.module("node:crypto", {
      exports: {
        createHash: realCrypto.createHash,
        randomBytes: (...args) => {
          if (phase === "fault" && scenario.fault === "entropy-failure") {
            faultTriggered = true;
            const error = new Error("simulated entropy failure");
            error.code = "EIO";
            throw error;
          }
          return realCrypto.randomBytes(...args);
        },
      },
    });

    mock.module("node:fs/promises", {
      exports: {
        ...realFs,
        open: async (path, flags, mode) => {
          const handle = await realFs.open(path, flags, mode);
          const isNumericFlags = typeof flags === "number";
          const isWrite = isNumericFlags && (flags & constants.O_WRONLY) === constants.O_WRONLY;
          const isDirectory = isNumericFlags && (flags & constants.O_DIRECTORY) === constants.O_DIRECTORY;
          const isLock = typeof path === "string" && path === lockPath;
          const isLog = typeof path === "string" && path === logPath;
          const fault = phase === "fault" ? scenario.fault : "none";

          if (isLock && isWrite && fault === "inspect-marker") {
            const originalWrite = handle.write.bind(handle);
            handle.write = async (...args) => {
              capturedMarker = String(args[0]);
              return originalWrite(...args);
            };
          }

          if (isLock && isWrite && fault === "lock-short-write") {
            const originalWrite = handle.write.bind(handle);
            handle.write = async (...args) => {
              const result = await originalWrite(...args);
              faultTriggered = true;
              return { ...result, bytesWritten: Math.max(0, result.bytesWritten - 1) };
            };
          }
          if (isLock && isWrite && fault === "lock-sync-failure") {
            handle.sync = async () => {
              faultTriggered = true;
              const error = new Error("simulated lock sync failure");
              error.code = "EIO";
              throw error;
            };
          }
          if (isDirectory && path === repositoryRootForChecks && fault === "repository-root-sync-failure") {
            handle.sync = async () => {
              faultTriggered = true;
              const error = new Error("simulated repository root sync failure");
              error.code = "EIO";
              throw error;
            };
          }
          if (isDirectory && path === shieldDirectory && ["lock-parent-sync-failure", "post-sync-lock-disappearance", "post-sync-lock-replacement", "post-sync-marker-tamper"].includes(fault)) {
            const originalSync = handle.sync.bind(handle);
            handle.sync = async () => {
              await originalSync();
              faultTriggered = true;
              if (fault === "lock-parent-sync-failure") {
                const error = new Error("simulated lock parent sync failure");
                error.code = "EIO";
                throw error;
              }
              if (fault === "post-sync-lock-disappearance") {
                await realFs.unlink(lockPath);
              } else if (fault === "post-sync-lock-replacement") {
                const marker = await realFs.readFile(lockPath);
                await realFs.unlink(lockPath);
                await realFs.writeFile(lockPath, marker);
              } else {
                const marker = await realFs.readFile(lockPath, "utf8");
                await realFs.writeFile(lockPath, marker + "tamper", "utf8");
              }
            };
          }
          if (isDirectory && path === shieldDirectory && fault === "release-parent-sync-failure" && afterLockUnlink) {
            handle.sync = async () => {
              faultTriggered = true;
              const error = new Error("simulated release parent sync failure");
              error.code = "EIO";
              throw error;
            };
          }
          if (isLock && !isWrite) {
            lockReadOpens += 1;
            if (phase === "fault" && ["release-marker-inode-drift", "release-marker-drift", "release-dev-drift", "release-ino-drift"].includes(scenario.fault) && lockReadOpens >= 2) {
              const originalReadFile = handle.readFile.bind(handle);
              if (scenario.fault === "release-marker-inode-drift" || scenario.fault === "release-marker-drift") {
                handle.readFile = async (...args) => {
                  const marker = await originalReadFile(...args);
                  faultTriggered = true;
                  return typeof marker === "string" ? marker + "drift" : Buffer.concat([marker, Buffer.from("drift")]);
                };
              }
              const originalStat = handle.stat.bind(handle);
              handle.stat = async () => {
                const stats = await originalStat();
                faultTriggered = true;
                return {
                  ...stats,
                  ino: scenario.fault === "release-marker-inode-drift" || scenario.fault === "release-ino-drift"
                    ? Number(stats.ino) + 1 : Number(stats.ino),
                  dev: scenario.fault === "release-marker-inode-drift" || scenario.fault === "release-dev-drift"
                    ? Number(stats.dev) + 1 : Number(stats.dev),
                };
              };
            }
          }
          if (isLog && isWrite && scenario.fault === "append-short-write" && phase === "fault") {
            const originalWrite = handle.write.bind(handle);
            handle.write = async (...args) => {
              const result = await originalWrite(...args);
              faultTriggered = true;
              return { ...result, bytesWritten: Math.max(0, result.bytesWritten - 1) };
            };
          }
          if (isLog && isWrite && scenario.fault === "append-sync-failure" && phase === "fault") {
            handle.sync = async () => {
              faultTriggered = true;
              const error = new Error("simulated append sync failure");
              error.code = "EIO";
              throw error;
            };
          }
          if (isLog && !isWrite && scenario.fault === "append-readback-failure" && phase === "fault") {
            const originalReadFile = handle.readFile.bind(handle);
            handle.readFile = async (...args) => {
              const bytes = await originalReadFile(...args);
              logReads += 1;
              if (logReads >= 1) {
                faultTriggered = true;
                const text = typeof bytes === "string" ? bytes : bytes.toString("utf8");
                return text.replace('"subjectId":"subject-1"', '"subjectId":"subject-drift"');
              }
              return bytes;
            };
          }
          return handle;
        },
        unlink: async (path) => {
          if (phase === "fault" && scenario.fault === "release-unlink-failure" && path === lockPath) {
            faultTriggered = true;
            const error = new Error("simulated release unlink failure");
            error.code = "EIO";
            throw error;
          }
          const result = await realFs.unlink(path);
          if (phase === "fault" && path === lockPath) afterLockUnlink = true;
          return result;
        },
        lstat: async (path) => {
          if (phase === "fault" && scenario.fault === "release-absence-drift" && afterLockUnlink && path === lockPath) {
            faultTriggered = true;
            return { isSymbolicLink: () => false, isFile: () => true, ino: 1, dev: 1 };
          }
          return realFs.lstat(path);
        },
      },
    });

    const store = await import(${JSON.stringify(seatDispatchStoreModule)} + "?fault=" + encodeURIComponent(scenario.name));
    if (scenario.pending === "already_claimed" || scenario.pending === "conflict") {
      const setup = await store.claimSeatDispatchPacketV1(claimInput());
      if (setup.state !== "valid" || setup.value.claimStatus !== "claimed") throw new Error("fault setup claim failed");
    } else if (scenario.pending === "replay_invalid") {
      await realFs.mkdir(shieldDirectory, { recursive: true });
      await realFs.writeFile(logPath, '{"incomplete":true', "utf8");
    }

    phase = "fault";
    lockReadOpens = 0;
    logReads = 0;
    const overrides = scenario.pending === "conflict"
      ? { subjectRevision: "abcdef1234567890abcdef1234567890abcdef13" }
      : {};
    const result = await store.claimSeatDispatchPacketV1(claimInput(overrides));
    const summary = {
      state: result.state,
      code: result.state === "invalid" ? result.code : null,
      claimStatus: result.state === "valid" ? result.value.claimStatus : null,
      hasDisposition: result.state === "valid" && Object.hasOwn(result.value, "executionDisposition"),
      faultTriggered,
      capturedMarker,
      restart: null,
    };

    if (["append-short-write", "append-sync-failure", "append-readback-failure"].includes(scenario.fault)) {
      phase = "restart";
      const restart = await store.claimSeatDispatchPacketV1(claimInput({ startedAt: "2026-07-29T12:00:01.000Z" }));
      summary.restart = {
        state: restart.state,
        code: restart.state === "invalid" ? restart.code : null,
        claimStatus: restart.state === "valid" ? restart.value.claimStatus : null,
        hasDisposition: restart.state === "valid" && Object.hasOwn(restart.value, "executionDisposition"),
      };
    }
    process.stdout.write(JSON.stringify(summary));
  `;
  await writeFile(scriptPath, script, "utf8");
  const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", scriptPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (child.status !== 0) assert.fail(`fault child failed (${scenario.name}): ${child.stdout}${child.stderr}`);
  try {
    return JSON.parse(child.stdout.trim());
  } catch {
    assert.fail(`fault child emitted invalid JSON (${scenario.name}): ${child.stdout}${child.stderr}`);
  }
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

test("claim lock acquisition fails closed across durable marker fault points", async () => {
  const scenarios = [
    ["lock marker short write", "lock-short-write"],
    ["lock marker sync", "lock-sync-failure"],
    ["lock parent sync", "lock-parent-sync-failure"],
    ["post-sync disappearance", "post-sync-lock-disappearance"],
    ["post-sync replacement", "post-sync-lock-replacement"],
    ["post-sync marker tamper", "post-sync-marker-tamper"],
  ];
  for (const [name, fault] of scenarios) {
    const result = await runPacketClaimFaultScenario({ name, fault, pending: "claimed" });
    assert.equal(result.faultTriggered, true, name);
    assert.equal(result.state, "invalid", name);
    assert.equal(result.code, "recovery_required", name);
    assert.equal(result.hasDisposition, false, name);
  }
});

test("claim fails closed for held lock, repository sync, and entropy failures", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-lock-held-"));
  const shieldDirectory = join(repositoryRoot, ".shield");
  const lockPath = join(shieldDirectory, "dispatch-receipts.jsonl.lock");
  const tamperedMarker = '{"lockOwnerId":"other","nonce":"tampered","version":1}\n';
  await mkdir(shieldDirectory);
  await writeFile(lockPath, tamperedMarker);
  const held = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot));
  assert.equal(held.state, "invalid");
  assert.equal(held.code, "dispatch_receipt_lock_held");
  assert.equal(Object.hasOwn(held, "executionDisposition"), false);
  assert.equal(await readLogBytes(lockPath), tamperedMarker);
  await assert.rejects(lstat(join(shieldDirectory, "dispatch-receipts.jsonl")), (error) => error?.code === "ENOENT");

  for (const [name, fault] of [
    ["repository root sync", "repository-root-sync-failure"],
    ["entropy", "entropy-failure"],
  ]) {
    const result = await runPacketClaimFaultScenario({ name, fault, pending: "claimed" });
    assert.equal(result.faultTriggered, true, name);
    assert.equal(result.state, "invalid", name);
    assert.equal(result.code, "recovery_required", name);
    assert.equal(result.hasDisposition, false, name);
  }
});

test("claim lock marker is exact canonical JSON with delimiter-safe owner and 32-byte nonce", async () => {
  const lockOwnerId = "owner:issue-173:delimiter-safe";
  const result = await runPacketClaimFaultScenario({
    name: "inspect canonical marker",
    fault: "inspect-marker",
    pending: "claimed",
    lockOwnerId,
  });
  assert.equal(result.state, "valid");
  assert.equal(result.claimStatus, "claimed");
  assert.equal(result.hasDisposition, true);
  assert.equal(typeof result.capturedMarker, "string");
  assert.equal(result.capturedMarker.endsWith("\n"), true);
  const marker = JSON.parse(result.capturedMarker.slice(0, -1));
  assert.deepEqual(Object.keys(marker), ["lockOwnerId", "nonce", "version"]);
  assert.equal(marker.lockOwnerId, lockOwnerId);
  assert.equal(marker.version, 1);
  assert.match(marker.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(marker.nonce, "base64url").byteLength, 32);
  assert.equal(result.capturedMarker, `${JSON.stringify({ lockOwnerId, nonce: marker.nonce, version: 1 })}\n`);
});

test("claim release identity, unlink, absence, and directory-sync uncertainty overrides claimed", async () => {
  const scenarios = [
    ["release marker and inode drift", "release-marker-inode-drift"],
    ["release unlink failure", "release-unlink-failure"],
    ["release absence verification", "release-absence-drift"],
    ["release parent sync", "release-parent-sync-failure"],
  ];
  for (const [name, fault] of scenarios) {
    const result = await runPacketClaimFaultScenario({ name, fault, pending: "claimed" });
    assert.equal(result.faultTriggered, true, name);
    assert.equal(result.state, "invalid", name);
    assert.equal(result.code, "recovery_required", name);
    assert.equal(result.hasDisposition, false, name);
  }
});

test("claim release rejects marker, device, and inode drift independently", async () => {
  for (const [name, fault] of [
    ["marker drift", "release-marker-drift"],
    ["device drift", "release-dev-drift"],
    ["inode drift", "release-ino-drift"],
  ]) {
    const result = await runPacketClaimFaultScenario({ name, fault, pending: "claimed" });
    assert.equal(result.faultTriggered, true, name);
    assert.equal(result.state, "invalid", name);
    assert.equal(result.code, "recovery_required", name);
    assert.equal(result.hasDisposition, false, name);
  }
});

test("release uncertainty is the final override for every representative pending result", async () => {
  for (const pending of ["claimed", "already_claimed", "conflict", "replay_invalid"]) {
    const result = await runPacketClaimFaultScenario({
      name: `release override ${pending}`,
      fault: "release-unlink-failure",
      pending,
    });
    assert.equal(result.faultTriggered, true, pending);
    assert.equal(result.state, "invalid", pending);
    assert.equal(result.code, "recovery_required", pending);
    assert.equal(result.hasDisposition, false, pending);
  }
});

test("uncertain append restart is already claimed or fail-closed, never freshly executable", async () => {
  for (const [name, fault] of [
    ["append short write", "append-short-write"],
    ["append sync", "append-sync-failure"],
    ["append readback", "append-readback-failure"],
  ]) {
    const result = await runPacketClaimFaultScenario({ name, fault, pending: "claimed" });
    assert.equal(result.faultTriggered, true, name);
    assert.equal(result.state, "invalid", name);
    assert.equal(result.code, "recovery_required", name);
    assert.equal(result.hasDisposition, false, name);
    assert.notEqual(result.restart, null, name);
    assert.equal(result.restart.hasDisposition, false, name);
    if (result.restart.state === "valid") {
      assert.equal(result.restart.claimStatus, "already_claimed", name);
    } else {
      assert.notEqual(result.restart.code, null, name);
    }
    assert.notEqual(result.restart.claimStatus, "claimed", name);
  }
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

test("packetBytes requires intrinsic Uint8Array brand before filesystem access", async () => {
  const invalidPacketViews = [
    new Int8Array([123, 125]),
    new Uint16Array([123, 125]),
    new DataView(new ArrayBuffer(8)),
    new Proxy(packetBytes("{}"), {}),
  ];
  if (typeof SharedArrayBuffer === "function") {
    invalidPacketViews.push(new Uint8Array(new SharedArrayBuffer(8)));
  }
  for (const packetView of invalidPacketViews) {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-brand-"));
    const result = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { packetBytes: packetView }));
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "malformed_input");
    assert.equal(Object.hasOwn(result, "executionDisposition"), false);
    await assert.rejects(lstat(join(repositoryRoot, ".shield")), (error) => error?.code === "ENOENT");
  }
});

test("startedAt enforces Gregorian UTC components and normalizes valid leap day", async () => {
  for (const startedAt of [
    "2026-00-01T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-01-00T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2025-02-29T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:60Z",
  ]) {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-timestamp-invalid-"));
    const result = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { startedAt }));
    assert.equal(result.state, "invalid", startedAt);
    assert.equal(result.code, "malformed_input", startedAt);
    assert.equal(Object.hasOwn(result, "executionDisposition"), false);
    await assert.rejects(lstat(join(repositoryRoot, ".shield")), (error) => error?.code === "ENOENT");
  }

  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-timestamp-leap-"));
  const leapDay = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    startedAt: "2024-02-29T23:59:59.123456789Z",
  }));
  assert.equal(leapDay.state, "valid", leapDay.errors?.join(" "));
  assert.equal(leapDay.value.claimStatus, "claimed");
  assert.equal(leapDay.value.receipt.startedAt, "2024-02-29T23:59:59.123Z");
});

test("packet parser rejects malformed byte, string, and object forms before filesystem access", async () => {
  const malformedPackets = [
    ["non-JSON", packetBytes("not-json")],
    ["trailing packet data", packetBytes("{} true")],
    ["invalid UTF-8", new Uint8Array([0xff])],
    ["truncated UTF-8", new Uint8Array([0xe2, 0x82])],
    ["overlong UTF-8", new Uint8Array([0xc0, 0xaf])],
    ["UTF-8 BOM", new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])],
    ["lone surrogate key", packetBytes('{"\\ud800":1}')],
    ["lone surrogate value", packetBytes('{"value":"\\udfff"}')],
    ["duplicate decoded key", packetBytes('{"value":1,"value":2}')],
  ];
  for (const [label, packet] of malformedPackets) await assertMalformedPacketBeforeFs(packet, label);
});

test("packet byte, depth, and container limits enforce exact boundaries", async () => {
  const exactBytes = packetBytes(`{"value":"${"a".repeat(1_048_576 - 12)}"}`);
  assert.equal(exactBytes.byteLength, 1_048_576);
  await assertAcceptedPacket(exactBytes, "1048576 bytes");
  await assertMalformedPacketBeforeFs(new Uint8Array([...exactBytes, 0x20]), "1048577 bytes");

  await assertAcceptedPacket(packetBytes(`${"[".repeat(64)}null${"]".repeat(64)}`), "depth 64");
  await assertMalformedPacketBeforeFs(packetBytes(`${"[".repeat(65)}null${"]".repeat(65)}`), "depth 65");

  const array10k = `[${Array.from({ length: 10_000 }, () => "0").join(",")}]`;
  await assertAcceptedPacket(packetBytes(array10k), "array size 10000");
  await assertMalformedPacketBeforeFs(packetBytes(`[${array10k.slice(1, -1)},0]`), "array size 10001");

  const objectEntries = Array.from({ length: 10_000 }, (_, index) => `"k${index}":0`);
  await assertAcceptedPacket(packetBytes(`{${objectEntries.join(",")}}`), "object size 10000");
  await assertMalformedPacketBeforeFs(packetBytes(`{${objectEntries.join(",")},"overflow":0}`), "object size 10001");
});

test("packet canonicalization preserves semantic equivalence and array-order conflict", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-canonical-equivalence-"));
  const first = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    packetBytes: packetBytes('{"alpha":"é","items":[1,2]}'),
  }));
  assert.equal(first.state, "valid", first.errors?.join(" "));
  const before = await readLogBytes(first.value.logPath);

  const equivalent = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    packetBytes: packetBytes('{ "items" : [1,2], "alpha" : "\\u00e9" }'),
  }));
  assert.equal(equivalent.state, "valid", equivalent.errors?.join(" "));
  assert.equal(equivalent.value.claimStatus, "already_claimed");
  assert.equal(Object.hasOwn(equivalent.value, "executionDisposition"), false);

  const reorderedArray = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    packetBytes: packetBytes('{"alpha":"é","items":[2,1]}'),
  }));
  assert.equal(reorderedArray.state, "invalid");
  assert.equal(reorderedArray.code, "packet_claim_conflict");
  assert.equal(Object.hasOwn(reorderedArray, "executionDisposition"), false);
  assert.equal(await readLogBytes(first.value.logPath), before);
});

test("packet digest hashes canonical UTF-8 bytes without a trailing newline", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-digest-bytes-"));
  const result = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    packetBytes: packetBytes('{ "b" : 2, "a" : 1 }'),
  }));
  assert.equal(result.state, "valid", result.errors?.join(" "));
  const canonical = Buffer.from('{"a":1,"b":2}', "utf8");
  const expected = `sha256:${createHash("sha256").update(canonical).digest("base64url")}`;
  const newlineDigest = `sha256:${createHash("sha256").update(Buffer.concat([canonical, Buffer.from("\n")])).digest("base64url")}`;
  assert.equal(result.value.packetDigest, expected);
  assert.notEqual(result.value.packetDigest, newlineDigest);
});

test("accepted numeric classes are canonicalization-idempotent", async () => {
  const numericClasses = [
    ["zero", "0", "0"],
    ["negative zero", "-0", "0"],
    ["safe integer", "9007199254740991", "9007199254740991"],
    ["binary fraction", "0.5", "0.5"],
    ["binary fraction eighth", "0.125", "0.125"],
    ["exponent", "1e3", "1000"],
    ["exact high magnitude", "9007199254740992", "9007199254740992"],
  ];
  for (const [label, source, canonical] of numericClasses) {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-number-idempotent-"));
    const first = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { packetBytes: packetBytes(`{"value":${source}}`) }));
    assert.equal(first.state, "valid", label);
    const retry = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
      startedAt: "2026-07-29T12:00:01.000Z",
      packetBytes: packetBytes(`{"value":${canonical}}`),
    }));
    assert.equal(retry.state, "valid", label);
    assert.equal(retry.value.claimStatus, "already_claimed", label);
    assert.equal(Object.hasOwn(retry.value, "executionDisposition"), false, label);
  }
});

test("outer claim input rejects unsafe shapes and snapshots mutable packet bytes", async () => {
  class ClaimInput {}
  const shapeCases = [
    ["class", (base) => Object.assign(new ClaimInput(), base)],
    ["array", (base) => Object.assign([], base)],
    ["null prototype", (base) => Object.assign(Object.create(null), base)],
    ["inherited", (base) => Object.create(base)],
    ["symbol", (base) => Object.assign({ ...base }, { [Symbol("extra")]: true })],
    ["extra", (base) => ({ ...base, extra: true })],
    ["non-enumerable", (base) => {
      const input = { ...base };
      Object.defineProperty(input, "packetId", { value: base.packetId, enumerable: false });
      return input;
    }],
    ["accessor", (base) => {
      const input = { ...base };
      Object.defineProperty(input, "repositoryId", { enumerable: true, get() { throw new Error("must not run"); } });
      return input;
    }],
  ];
  for (const [label, createInput] of shapeCases) {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-shape-"));
    const result = await claimSeatDispatchPacketV1(createInput(packetClaimInput(repositoryRoot)));
    assert.equal(result.state, "invalid", label);
    assert.equal(result.code, "malformed_input", label);
    assert.equal(Object.hasOwn(result, "executionDisposition"), false, label);
    await assert.rejects(lstat(join(repositoryRoot, ".shield")), (error) => error?.code === "ENOENT", label);
  }

  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-snapshot-mutation-"));
  const mutable = packetBytes('{"value":1}');
  const pending = claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { packetBytes: mutable }));
  mutable.set(packetBytes('{"value":2}'));
  const claimed = await pending;
  assert.equal(claimed.state, "valid", claimed.errors?.join(" "));
  const originalRetry = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
    startedAt: "2026-07-29T12:00:01.000Z",
    packetBytes: packetBytes('{"value":1}'),
  }));
  assert.equal(originalRetry.state, "valid");
  assert.equal(originalRetry.value.claimStatus, "already_claimed");
  const mutatedRetry = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, { packetBytes: packetBytes('{"value":2}') }));
  assert.equal(mutatedRetry.state, "invalid");
  assert.equal(mutatedRetry.code, "packet_claim_conflict");
  assert.equal(Object.hasOwn(mutatedRetry, "executionDisposition"), false);
});

test("claim API rejects derived identity and event-kind overrides before mutation", async () => {
  for (const field of ["receiptId", "dispatchId", "childTaskId", "childSessionId", "kind"]) {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-derived-override-"));
    const value = field === "kind" ? "dispatch.completed" : `${field}-override`;
    const result = await claimSeatDispatchPacketV1({ ...packetClaimInput(repositoryRoot), [field]: value });
    assert.equal(result.state, "invalid", field);
    assert.equal(result.code, "malformed_input", field);
    assert.equal(Object.hasOwn(result, "executionDisposition"), false, field);
    await assert.rejects(lstat(join(repositoryRoot, ".shield")), (error) => error?.code === "ENOENT", field);
  }
});

test("direct-filesystem forged packet binding is not treated as claim authority", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-forged-binding-"));
  const input = packetClaimInput(repositoryRoot);
  const claimKey = packetClaimKey(input);
  const forged = started({
    receiptId: `receipt:${claimKey}`,
    dispatchId: `dispatch:${claimKey}`,
    childTaskId: `task:${claimKey}`,
    childSessionId: `session:${claimKey}`,
    inputEvidenceRefs: [`evidence:packet-binding:seat-dispatch-v1:${claimKey}:sha256:${"A".repeat(43)}`],
  });
  const replay = replaySeatDispatchReceiptsV1([forged]);
  assert.equal(replay.state, "valid", replay.reasonCodes?.join(" "));
  const shieldDirectory = join(repositoryRoot, ".shield");
  const logPath = join(shieldDirectory, "dispatch-receipts.jsonl");
  const forgedBytes = `${JSON.stringify(replay.entries[0])}\n`;
  await mkdir(shieldDirectory);
  await writeFile(logPath, forgedBytes);
  const result = await claimSeatDispatchPacketV1(input);
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "packet_claim_conflict");
  assert.equal(Object.hasOwn(result, "executionDisposition"), false);
  assert.equal(await readLogBytes(logPath), forgedBytes);
});

test("derived child task and session collisions fail closed without mutation", async () => {
  for (const collision of ["childTaskId", "childSessionId"]) {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-child-collision-"));
    const input = packetClaimInput(repositoryRoot);
    const claimKey = packetClaimKey(input);
    const existing = started({
      receiptId: `unrelated-receipt-${collision}`,
      dispatchId: `unrelated-dispatch-${collision}`,
      parentMissionId: `unrelated-mission-${collision}`,
      parentSessionId: `unrelated-session-${collision}`,
      childTaskId: collision === "childTaskId" ? `task:${claimKey}` : `unrelated-task-${collision}`,
      childSessionId: collision === "childSessionId" ? `session:${claimKey}` : `unrelated-child-session-${collision}`,
    });
    const replay = replaySeatDispatchReceiptsV1([existing]);
    assert.equal(replay.state, "valid", replay.reasonCodes?.join(" "));
    const shieldDirectory = join(repositoryRoot, ".shield");
    const logPath = join(shieldDirectory, "dispatch-receipts.jsonl");
    const before = `${JSON.stringify(replay.entries[0])}\n`;
    await mkdir(shieldDirectory);
    await writeFile(logPath, before);
    const result = await claimSeatDispatchPacketV1(input);
    assert.equal(result.state, "invalid", collision);
    assert.equal(result.code, "packet_claim_conflict", collision);
    assert.equal(Object.hasOwn(result, "executionDisposition"), false, collision);
    assert.equal(await readLogBytes(logPath), before, collision);
  }
});

test("normalized start drift fails closed without changing the claimed row", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-packet-start-drift-"));
  const first = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot));
  assert.equal(first.state, "valid", first.errors?.join(" "));
  const before = await readLogBytes(first.value.logPath);
  const driftCases = [
    ["mission revision", { parentMissionRevision: "abcdef1234567890abcdef1234567890abcdef13" }],
    ["repository id", { repositoryId: "repo-2" }],
    ["workspace", { repositoryWorkspaceId: "workspace-2" }],
    ["repository revision", { repositoryRevision: "0ff3aa1c8d3e1f4a9c7b5e2d1f3a4c6b7d9e0f13" }],
    ["accountable seat", { accountableSeatId: "fury" }],
    ["subject id", { subjectId: "subject-2" }],
    ["subject revision", { subjectRevision: "abcdef1234567890abcdef1234567890abcdef13" }],
    ["artifact id", { artifactId: "artifact-2" }],
    ["artifact revision", { artifactRevision: "abcdef1234567890abcdef1234567890abcdef13" }],
    ["configured runtime", { configuredRuntime: { kind: "runtime.configured", runtimeId: "runtime-2", model: "model:demo" } }],
    ["requested runtime", { requestedRuntime: { kind: "runtime.requested", runtimeId: "runtime-2", model: "model:demo" } }],
    ["tool", { toolExecution: { kind: "tool.execution.requested", executorBindingRef: "executor-1" } }],
    ["runtime self", { runtimeSelfReport: { kind: "runtime.self_report.observed", runtimeId: "runtime-1", model: "model:demo", evidenceRefs: ["runtime-self"] } }],
    ["runtime host", { runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: "runtime-1", model: "model:demo", evidenceRefs: ["runtime-host"] } }],
    ["executor self", { executorSelfReport: { kind: "executor.self_report.observed", executorId: "executor-1", evidenceRefs: ["executor-self"] } }],
    ["executor host", { executorHostObserved: { kind: "executor.host_observed", executorId: "executor-1", evidenceRefs: ["executor-host"] } }],
    ["input evidence", { inputEvidenceRefs: ["caller-evidence"] }],
  ];
  for (const [label, overrides] of driftCases) {
    const result = await claimSeatDispatchPacketV1(packetClaimInput(repositoryRoot, {
      startedAt: "2026-07-29T12:00:01.000Z",
      ...overrides,
    }));
    assert.equal(result.state, "invalid", label);
    assert.equal(result.code, "packet_claim_conflict", label);
    assert.equal(Object.hasOwn(result, "executionDisposition"), false, label);
    assert.equal(await readLogBytes(first.value.logPath), before, label);
  }
});

test("claim distinguishes stable scope drift from unrelated foreign and internally mixed ledgers", async () => {
  const foreignRoot = await mkdtemp(join(tmpdir(), "shield-packet-foreign-scope-"));
  const foreign = await claimSeatDispatchPacketV1(packetClaimInput(foreignRoot, {
    repositoryId: "foreign-repo",
    repositoryWorkspaceId: "foreign-workspace",
    packetId: "foreign-packet",
  }));
  assert.equal(foreign.state, "valid", foreign.errors?.join(" "));
  const foreignBytes = await readLogBytes(foreign.value.logPath);
  const unrelated = await claimSeatDispatchPacketV1(packetClaimInput(foreignRoot));
  assert.equal(unrelated.state, "invalid");
  assert.equal(unrelated.code, "mixed_scope");
  assert.equal(Object.hasOwn(unrelated, "executionDisposition"), false);
  assert.equal(await readLogBytes(foreign.value.logPath), foreignBytes);

  const mixedRoot = await mkdtemp(join(tmpdir(), "shield-packet-internal-mixed-scope-"));
  const first = started();
  const second = started({
    receiptId: "receipt-2",
    dispatchId: "dispatch-2",
    parentMissionId: "mission-2",
    parentSessionId: "session-2",
    childTaskId: "task-2",
    childSessionId: "child-session-2",
    repositoryId: "foreign-repo",
    repositoryWorkspaceId: "foreign-workspace",
    subjectId: "subject-2",
    artifactId: "artifact-2",
    logSequence: 1,
    previousLogDigest: first.entryDigest,
  });
  const shieldDirectory = join(mixedRoot, ".shield");
  const mixedLogPath = join(shieldDirectory, "dispatch-receipts.jsonl");
  const mixedReplay = replaySeatDispatchReceiptsV1([first, second]);
  assert.equal(mixedReplay.state, "valid", mixedReplay.reasonCodes?.join(" "));
  const mixedBytes = mixedReplay.entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
  await mkdir(shieldDirectory);
  await writeFile(mixedLogPath, mixedBytes);
  const mixed = await claimSeatDispatchPacketV1(packetClaimInput(mixedRoot));
  assert.equal(mixed.state, "invalid");
  assert.equal(mixed.code, "mixed_scope", mixed.errors?.join(" "));
  assert.equal(Object.hasOwn(mixed, "executionDisposition"), false);
  assert.equal(await readLogBytes(mixedLogPath), mixedBytes);
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

  const dedupeRoot = await mkdtemp(join(tmpdir(), "shield-packet-evidence-dedupe-"));
  const deduped = await claimSeatDispatchPacketV1(packetClaimInput(dedupeRoot, {
    inputEvidenceRefs: ["caller-a", "caller-a", "caller-b", "caller-a"],
  }));
  assert.equal(deduped.state, "valid", deduped.errors?.join(" "));
  assert.equal(deduped.value.receipt.inputEvidenceRefs.length, 3);
  assert.deepEqual(deduped.value.receipt.inputEvidenceRefs.slice(0, 2), ["caller-a", "caller-b"]);
  assert.match(deduped.value.receipt.inputEvidenceRefs[2], /^evidence:packet-binding:seat-dispatch-v1:/);

  const overflowRoot = await mkdtemp(join(tmpdir(), "shield-packet-evidence-overflow-"));
  const overflow = await claimSeatDispatchPacketV1(packetClaimInput(overflowRoot, {
    inputEvidenceRefs: [...fifteen, "evidence-15"],
  }));
  assert.equal(overflow.state, "invalid");
  assert.equal(overflow.code, "malformed_input");

  const reservedRoot = await mkdtemp(join(tmpdir(), "shield-packet-evidence-reserved-"));
  const reserved = await claimSeatDispatchPacketV1(packetClaimInput(reservedRoot, {
    inputEvidenceRefs: ["evidence:packet-binding:seat-dispatch-v1:caller-spoof"],
  }));
  assert.equal(reserved.state, "invalid");
  assert.equal(reserved.code, "malformed_input");
  assert.equal(Object.hasOwn(reserved, "executionDisposition"), false);
  await assert.rejects(lstat(join(reservedRoot, ".shield")), (error) => error?.code === "ENOENT");

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
