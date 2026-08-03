import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdtemp,
  mkdir,
  open,
  realpath,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  appendMayControlEventIfAbsentV1,
  createMayControlEventFilesystemStore,
  MayControlEventStoreError,
  readMayControlEventLogV1,
} from "../dist/may-control-event-store.mjs";
import { canonicalJson } from "../dist/mission-v2.mjs";

function deterministicLogPath(repositoryRoot, sessionId) {
  return join(
    repositoryRoot,
    ".shield",
    "may-control-events",
    `${createHash("sha256").update(sessionId, "utf8").digest("base64url")}.jsonl`,
  );
}

function mkEvent(sessionId, counter, code, toolCallId = null, overrides = {}) {
  return {
    mayControlEventSchemaVersion: 1,
    authority: "non_authoritative",
    eventId: `may-control-event:${sessionId}:${counter}`,
    sessionId,
    code,
    counter,
    toolCallId,
    evidenceRefs: [`may-control:${sessionId}`],
    ...overrides,
  };
}

function normalizePath(input) {
  return input.replace(/^\/private/, "");
}

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const TEST_FILE_DIR = dirname(TEST_FILE_PATH);
const PACKAGE_DIST_DIR = resolve(TEST_FILE_DIR, "..", "dist");
const MAY_CONTROL_EVENT_STORE_PATH = resolve(PACKAGE_DIST_DIR, "may-control-event-store.mjs");
const TEMPORARY_MISSION_V2_SOURCE = `export function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, childValue]) => [key, canonicalValue(childValue)]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}
`;

async function runMayControlMockedAppendScenario(scenario) {
  const scriptRoot = await mkdtemp(join(tmpdir(), "shield-may-control-child-script-"));
  const temporaryStorePath = join(scriptRoot, "may-control-event-store.mjs");
  const temporaryMissionPath = join(scriptRoot, "mission-v2.mjs");
  await copyFile(MAY_CONTROL_EVENT_STORE_PATH, temporaryStorePath);
  await writeFile(temporaryMissionPath, TEMPORARY_MISSION_V2_SOURCE, "utf8");

  const script = `
    import { mkdtemp } from "node:fs/promises";
    import { dirname, join } from "node:path";
    import { tmpdir } from "node:os";
    import { pathToFileURL } from "node:url";
    import { mock } from "node:test";
    import { constants } from "node:fs";
    import { createHash } from "node:crypto";
    import * as realFs from "node:fs/promises";
    import { canonicalJson } from ${JSON.stringify(temporaryMissionPath)};

    const scenario = ${JSON.stringify(scenario)};
    const storePath = ${JSON.stringify(temporaryStorePath)};
    const storeUrl = pathToFileURL(storePath);
    const storeRealUrl = storeUrl.href + "?scenario=" + encodeURIComponent(scenario) + "&pathCheck=postCreate";
    const repositoryRoot = await mkdtemp(join(${JSON.stringify(tmpdir())}, "shield-may-control-child-"));
    const sessionId = "session:issue-171:" + scenario;
    const lockOwnerId = "owner:issue-171";
    const repositoryRootForChecks = await realFs.realpath(repositoryRoot);
    const shieldDirectoryForChecks = join(repositoryRootForChecks, ".shield");
    const auditDirectoryForChecks = join(shieldDirectoryForChecks, "may-control-events");
    const logPathForChecks = join(auditDirectoryForChecks, createHash("sha256").update(sessionId, "utf8").digest("base64url") + ".jsonl");
    const lockPathForChecks = logPathForChecks + ".lock";
    const markerForOwner = "may-control-event:" + lockOwnerId;
    const initialEvent = {
      mayControlEventSchemaVersion: 1,
      authority: "non_authoritative",
      eventId: "may-control-event:" + sessionId + ":1",
      sessionId,
      code: "may_control_started",
      counter: 1,
      toolCallId: null,
      evidenceRefs: ["may-control:" + sessionId],
    };
    const mutatedEvent = {
      mayControlEventSchemaVersion: 1,
      authority: "non_authoritative",
      eventId: "may-control-event:" + sessionId + ":2",
      sessionId,
      code: "may_control_writeFile_completed",
      counter: 2,
      toolCallId: "call:write:1",
      evidenceRefs: ["may-control:" + sessionId],
    };
    const isPostAppendMutationScenario =
      scenario === "post-append-reread-bytes-mismatch" ||
      scenario === "post-append-replay-readback-failure";
    const event = isPostAppendMutationScenario ? mutatedEvent : initialEvent;
    const logLine = canonicalJson(initialEvent) + "\\n";
    if (scenario === "uncertain-sequence-violation-overrides" || isPostAppendMutationScenario) {
      await realFs.mkdir(dirname(logPathForChecks), { recursive: true });
      await realFs.writeFile(logPathForChecks, logLine, "utf8");
    }

    const lockDirectory = dirname(lockPathForChecks);
    const logDirectory = dirname(logPathForChecks);
    let lockParentSyncCalls = 0;
    let logReadFileCalls = 0;

    mock.module("node:fs/promises", {
      exports: {
        ...realFs,
        open: async (path, flags, mode) => {
          const handle = await realFs.open(path, flags, mode);
          const isLockPath = typeof path === "string" && path === lockPathForChecks;
          const isLockDirectory = typeof path === "string" && path === lockDirectory;
          const isLogDirectory = typeof path === "string" && path === logDirectory;
          const isDirectoryOpen = typeof flags === "number" && (flags & constants.O_DIRECTORY) === constants.O_DIRECTORY;
          const isWrite = typeof flags === "number" && (flags & constants.O_WRONLY) === constants.O_WRONLY;
          const isRead = typeof flags === "number" && (flags & constants.O_WRONLY) !== constants.O_WRONLY;
          const isLogPath = typeof path === "string" && path === logPathForChecks;

          if (scenario === "lock-marker-short-write" && isWrite && isLockPath) {
            const originalWrite = handle.write.bind(handle);
            handle.write = async (...writeArgs) => {
              const result = await originalWrite(...writeArgs);
              return { ...result, bytesWritten: Math.max(0, result.bytesWritten - 1) };
            };
          }

          if (scenario === "log-append-short-write" && isWrite && isLogPath) {
            const originalWrite = handle.write.bind(handle);
            handle.write = async (...writeArgs) => {
              const result = await originalWrite(...writeArgs);
              return { ...result, bytesWritten: Math.max(0, result.bytesWritten - 1) };
            };
          }

          if (scenario === "log-sync-failure" && isWrite && isLogPath) {
            handle.sync = async () => {
              const error = new Error("simulated log append sync failure");
              error.code = "EIO";
              throw error;
            };
          }

          if (scenario === "lock-marker-sync-failure" && isWrite && isLockPath) {
            handle.sync = async () => {
              const error = new Error("simulated lock marker sync failure");
              error.code = "EIO";
              throw error;
            };
          }

          if (scenario === "lock-path-replaced-with-matching-marker" && isWrite && isLockPath) {
            const originalSync = handle.sync.bind(handle);
            handle.sync = async () => {
              await originalSync();
              await realFs.unlink(lockPathForChecks);
              await realFs.writeFile(lockPathForChecks, markerForOwner, "utf8");
            };
          }

          if ((scenario === "first-lock-parent-sync-failure" || scenario === "second-lock-parent-sync-failure") && isDirectoryOpen && isLockDirectory) {
            const originalSync = handle.sync.bind(handle);
            const syncIndex = ++lockParentSyncCalls;
            handle.sync = async () => {
              if (scenario === "first-lock-parent-sync-failure" && syncIndex === 1) {
                const error = new Error("simulated first lock parent sync failure");
                error.code = "EIO";
                throw error;
              }
              if (scenario === "second-lock-parent-sync-failure" && syncIndex === 2) {
                const error = new Error("simulated second lock parent sync failure");
                error.code = "EIO";
                throw error;
              }
              return originalSync();
            };
          }

          if (scenario === "repository-root-sync-failure" && isDirectoryOpen && path === repositoryRootForChecks) {
            handle.sync = async () => {
              const error = new Error("simulated repository root sync failure");
              error.code = "EIO";
              throw error;
            };
          }

          if (scenario === "shield-sync-failure" && isDirectoryOpen && path === shieldDirectoryForChecks) {
            handle.sync = async () => {
              const error = new Error("simulated shield directory sync failure");
              error.code = "EIO";
              throw error;
            };
          }

          if (scenario === "may-control-events-sync-failure" && isDirectoryOpen && path === shieldDirectoryForChecks) {
            handle.sync = async () => {
              const error = new Error("simulated may-control-events sync failure");
              error.code = "EIO";
              throw error;
            };
          }

          if (scenario === "first-log-parent-sync-failure" && isDirectoryOpen && isLogDirectory) {
            handle.sync = async () => {
              const error = new Error("simulated first log parent sync failure");
              error.code = "EIO";
              throw error;
            };
          }

          if ((scenario === "lock-metadata-drift" || scenario === "uncertain-sequence-violation-overrides") && isRead && isLockPath) {
            const originalReadFile = handle.readFile.bind(handle);
            handle.readFile = async (...readFileArgs) => {
              await originalReadFile(...readFileArgs);
              return markerForOwner + "-drift";
            };
            const originalStat = handle.stat.bind(handle);
            handle.stat = async () => {
              const stats = await originalStat();
              return { ...stats, ino: Number(stats.ino) + 1, dev: Number(stats.dev) + 1 };
            };
          }

          if (
            (scenario === "post-append-reread-bytes-mismatch" || scenario === "post-append-replay-readback-failure") &&
            isRead &&
            isLogPath
          ) {
            const originalReadFile = handle.readFile.bind(handle);
            handle.readFile = async (...readFileArgs) => {
              const bytes = await originalReadFile(...readFileArgs);
              const text = typeof bytes === "string" ? bytes : bytes.toString("utf8");
              logReadFileCalls += 1;
              if (logReadFileCalls <= 1) {
                return bytes;
              }
              if (scenario === "post-append-reread-bytes-mismatch") {
                return Buffer.from(
                  text.replace(
                    '"toolCallId":"call:write:1"',
                    '"toolCallId":"call:write:2"',
                  ),
                  "utf8",
                );
              }
              if (scenario === "post-append-replay-readback-failure") {
                return Buffer.from("not-json", "utf8");
              }
              return bytes;
            };
          }

          return handle;
        },
        unlink: async (path) => {
          if (scenario === "release-unlink-failure" && path === lockPathForChecks) {
            const error = new Error("simulated lock release unlink failure");
            error.code = "EIO";
            throw error;
          }
          return realFs.unlink(path);
        },
      },
    });

    const store = await import(storeRealUrl);
    const result = await store.appendMayControlEventIfAbsentV1({
      repositoryRoot,
      sessionId,
      lockOwnerId,
      event,
    });
    console.log(JSON.stringify({ state: result.state, code: result.code ?? null }));
  `;

  const scriptPath = join(scriptRoot, "may-control-child.mjs");
  await writeFile(scriptPath, script, "utf8");

  const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", scriptPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (child.status !== 0) {
    assert.fail(`child process failed with status ${child.status}: ${child.stdout}${child.stderr}`);
  }
  const output = child.stdout.trim();
  if (output.length === 0) {
    assert.fail(`child process did not emit JSON output: ${child.stderr}`);
  }
  try {
    return JSON.parse(output);
  } catch {
    assert.fail(`child process emitted non-JSON output: ${output}`);
  }
}

test("missing read is empty and deterministic sha256(base64url) path plus lock-sibling contention path", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-may-control-missing-"));
  const sessionId = "session:issue-171:missing";
  const canonicalRoot = await realpath(repositoryRoot);
  const expectedLog = deterministicLogPath(canonicalRoot, sessionId);

  const readResult = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(readResult.state, "valid", readResult.errors?.join(" "));
  assert.equal(readResult.value.missing, true);
  assert.equal(readResult.value.orderedEvents.length, 0);
  assert.equal(readResult.value.bytes, "");
  assert.equal(normalizePath(readResult.value.logPath), normalizePath(expectedLog));
  assert.equal(normalizePath(`${readResult.value.logPath}.lock`), normalizePath(`${expectedLog}.lock`));

  await mkdir(dirname(expectedLog), { recursive: true });
  const lockHandle = await open(`${expectedLog}.lock`, "wx");
  const blocked = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 1, "may_control_started"),
  });
  assert.equal(blocked.state, "invalid", blocked.errors?.join(" "));
  assert.equal(blocked.code, "may_control_event_lock_held");
  await lockHandle.close();
});

test("happy append/restart read sequence with started, writeFile, runValidation, completed", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-may-control-sequence-"));
  const sessionId = "session:issue-171:happy";
  const events = [
    mkEvent(sessionId, 1, "may_control_started"),
    mkEvent(sessionId, 2, "may_control_writeFile_completed", "call:write:1"),
    mkEvent(sessionId, 3, "may_control_runValidation_completed", "call:validate:1"),
    mkEvent(sessionId, 4, "may_control_completed"),
  ];

  let expectedBytes = "";
  for (const event of events) {
    const appendResult = await appendMayControlEventIfAbsentV1({
      repositoryRoot,
      sessionId,
      lockOwnerId: "owner:issue-171",
      event,
    });
    assert.equal(appendResult.state, "valid", appendResult.errors?.join(" "));
    assert.deepEqual(appendResult.value.receipt, { eventId: event.eventId, appended: true });
    expectedBytes += `${canonicalJson(event)}\n`;
    assert.equal(appendResult.value.bytes, expectedBytes);
  }

  const readResult = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(readResult.state, "valid", readResult.errors?.join(" "));
  assert.equal(readResult.value.bytes, expectedBytes);
  assert.equal(readResult.value.terminalState.state, "terminal");
  assert.equal(readResult.value.terminalState.code, "may_control_completed");
  assert.equal(readResult.value.terminalState.counter, 4);
  assert.equal(readResult.value.terminalState.index, 3);

  const restarted = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(restarted.state, "valid", restarted.errors?.join(" "));
  assert.equal(restarted.value.bytes, expectedBytes);
  assert.deepEqual(restarted.value.orderedEvents, events);
  assert.deepEqual(restarted.value.terminalState, readResult.value.terminalState);
});

test("setup_error is valid as the first terminal and active-loop error can close a started session", async () => {
  const setupSession = await mkdtemp(join(tmpdir(), "shield-may-control-setup-"));
  const setupId = "session:issue-171:setup";
  const setup = await appendMayControlEventIfAbsentV1({
    repositoryRoot: setupSession,
    sessionId: setupId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(setupId, 1, "setup_error"),
  });
  assert.equal(setup.state, "valid", setup.errors?.join(" "));
  const setupRead = await readMayControlEventLogV1({ repositoryRoot: setupSession, sessionId: setupId });
  assert.equal(setupRead.state, "valid", setupRead.errors?.join(" "));
  assert.deepEqual(setupRead.value.terminalState, {
    state: "terminal",
    code: "setup_error",
    counter: 1,
    eventId: setup.value.receipt.eventId,
    index: 0,
  });

  const activeSession = await mkdtemp(join(tmpdir(), "shield-may-control-active-error-"));
  const activeId = "session:issue-171:active";
  const start = mkEvent(activeId, 1, "may_control_started");
  const started = await appendMayControlEventIfAbsentV1({
    repositoryRoot: activeSession,
    sessionId: activeId,
    lockOwnerId: "owner:issue-171",
    event: start,
  });
  assert.equal(started.state, "valid", started.errors?.join(" "));
  const error = await appendMayControlEventIfAbsentV1({
    repositoryRoot: activeSession,
    sessionId: activeId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(activeId, 2, "active_loop_error"),
  });
  assert.equal(error.state, "valid", error.errors?.join(" "));
  const read = await readMayControlEventLogV1({ repositoryRoot: activeSession, sessionId: activeId });
  assert.equal(read.state, "valid", read.errors?.join(" "));
  assert.equal(read.value.terminalState.code, "active_loop_error");
});

test("lifecycle failures: tool completion before start, duplicate start, completed without validation, event after terminal", async () => {
  const repo1 = await mkdtemp(join(tmpdir(), "shield-may-control-tool-before-start-"));
  const session1 = "session:issue-171:before-start";
  const beforeStart = await appendMayControlEventIfAbsentV1({
    repositoryRoot: repo1,
    sessionId: session1,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(session1, 1, "may_control_writeFile_completed", "call:validation"),
  });
  assert.equal(beforeStart.state, "invalid", beforeStart.errors?.join(" "));
  assert.equal(beforeStart.code, "may_control_event_sequence_violation");

  const repo2 = await mkdtemp(join(tmpdir(), "shield-may-control-duplicate-start-"));
  const session2 = "session:issue-171:duplicate-start";
  await appendMayControlEventIfAbsentV1({
    repositoryRoot: repo2,
    sessionId: session2,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(session2, 1, "may_control_started"),
  });
  const duplicateStart = await appendMayControlEventIfAbsentV1({
    repositoryRoot: repo2,
    sessionId: session2,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(session2, 2, "may_control_started"),
  });
  assert.equal(duplicateStart.state, "invalid", duplicateStart.errors?.join(" "));
  assert.equal(duplicateStart.code, "may_control_event_sequence_violation");

  const repo3 = await mkdtemp(join(tmpdir(), "shield-may-control-no-validation-"));
  const session3 = "session:issue-171:no-validation";
  await appendMayControlEventIfAbsentV1({
    repositoryRoot: repo3,
    sessionId: session3,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(session3, 1, "may_control_started"),
  });
  const withoutValidation = await appendMayControlEventIfAbsentV1({
    repositoryRoot: repo3,
    sessionId: session3,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(session3, 2, "may_control_completed"),
  });
  assert.equal(withoutValidation.state, "invalid", withoutValidation.errors?.join(" "));
  assert.equal(withoutValidation.code, "may_control_event_sequence_violation");

  const repo4 = await mkdtemp(join(tmpdir(), "shield-may-control-after-terminal-"));
  const session4 = "session:issue-171:after-terminal";
  await appendMayControlEventIfAbsentV1({
    repositoryRoot: repo4,
    sessionId: session4,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(session4, 1, "may_control_started"),
  });
  await appendMayControlEventIfAbsentV1({
    repositoryRoot: repo4,
    sessionId: session4,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(session4, 2, "may_control_writeFile_completed", "call:write"),
  });
  await appendMayControlEventIfAbsentV1({
    repositoryRoot: repo4,
    sessionId: session4,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(session4, 3, "may_control_runValidation_completed", "call:validate"),
  });
  await appendMayControlEventIfAbsentV1({
    repositoryRoot: repo4,
    sessionId: session4,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(session4, 4, "may_control_completed"),
  });
  const afterTerminal = await appendMayControlEventIfAbsentV1({
    repositoryRoot: repo4,
    sessionId: session4,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(session4, 5, "may_control_started"),
  });
  assert.equal(afterTerminal.state, "invalid", afterTerminal.errors?.join(" "));
  assert.equal(afterTerminal.code, "may_control_event_sequence_violation");
});

test("toolCallId is only valid on writeFile/runValidation completions and must be unique", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-may-control-toolcall-"));
  const sessionId = "session:issue-171:toolcall";
  const start = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 1, "may_control_started"),
  });
  assert.equal(start.state, "valid", start.errors?.join(" "));

  const startedWithToolCall = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 2, "may_control_started", "call:bad"),
  });
  assert.equal(startedWithToolCall.state, "invalid", startedWithToolCall.errors?.join(" "));
  assert.equal(startedWithToolCall.code, "may_control_event_sequence_violation");

  const writeNoToolCall = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 2, "may_control_writeFile_completed"),
  });
  assert.equal(writeNoToolCall.state, "invalid", writeNoToolCall.errors?.join(" "));
  assert.equal(writeNoToolCall.code, "may_control_event_sequence_violation");

  const validationNoToolCall = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 2, "may_control_runValidation_completed"),
  });
  assert.equal(validationNoToolCall.state, "invalid", validationNoToolCall.errors?.join(" "));
  assert.equal(validationNoToolCall.code, "may_control_event_sequence_violation");

  const write = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 2, "may_control_writeFile_completed", "call:shared"),
  });
  assert.equal(write.state, "valid", write.errors?.join(" "));
  const validation = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 3, "may_control_runValidation_completed", "call:shared"),
  });
  assert.equal(validation.state, "invalid", validation.errors?.join(" "));
  assert.equal(validation.code, "may_control_event_sequence_violation");

  const completedWithToolCall = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 3, "may_control_completed", "call:complete"),
  });
  assert.equal(completedWithToolCall.state, "invalid", completedWithToolCall.errors?.join(" "));
  assert.equal(completedWithToolCall.code, "may_control_event_sequence_violation");
});

test("counter gap/regression and duplicate/id-conflict append handling preserves bytes", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-may-control-gap-"));
  const sessionId = "session:issue-171:gap";
  await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 1, "may_control_started"),
  });
  const writeEvent = mkEvent(sessionId, 2, "may_control_writeFile_completed", "call:write");
  const firstAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: writeEvent,
  });
  assert.equal(firstAppend.state, "valid", firstAppend.errors?.join(" "));

  const readBeforeGap = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(readBeforeGap.state, "valid", readBeforeGap.errors?.join(" "));

  const gap = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 4, "may_control_runValidation_completed", "call:validate"),
  });
  assert.equal(gap.state, "invalid", gap.errors?.join(" "));
  assert.equal(gap.code, "may_control_event_sequence_violation");
  const readAfterGap = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(readAfterGap.state, "valid", readAfterGap.errors?.join(" "));
  assert.equal(readAfterGap.value.bytes, readBeforeGap.value.bytes);

  const duplicate = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: writeEvent,
  });
  assert.equal(duplicate.state, "invalid", duplicate.errors?.join(" "));
  assert.equal(duplicate.code, "may_control_event_sequence_violation");
  const readAfterDuplicate = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(readAfterDuplicate.state, "valid", readAfterDuplicate.errors?.join(" "));
  assert.equal(readAfterDuplicate.value.bytes, readBeforeGap.value.bytes);

  const conflicting = mkEvent(sessionId, 2, "may_control_writeFile_completed", "call:write-conflict");
  const changedPayload = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: conflicting,
  });
  assert.equal(changedPayload.state, "invalid", changedPayload.errors?.join(" "));
  assert.equal(changedPayload.code, "may_control_event_id_conflict");
});

test("replay rejects zero-byte, malformed JSON, duplicate key, noncanonical JSON, empty line, truncated tail, foreign session, persisted duplicate", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-may-control-replay-"));
  const sessionId = "session:issue-171:replay";
  const canonicalRoot = await realpath(repositoryRoot);
  const logPath = deterministicLogPath(canonicalRoot, sessionId);
  const base = mkEvent(sessionId, 1, "may_control_started");
  const baseLine = `${canonicalJson(base)}\n`;
  const duplicated = `${baseLine}${baseLine}`;
  const foreign = mkEvent("session:issue-171:foreign", 1, "may_control_started");

  await mkdir(dirname(logPath), { recursive: true });

  await writeFile(logPath, "");
  const empty = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(empty.state, "invalid", empty.errors?.join(" "));
  assert.equal(empty.code, "may_control_event_replay_invalid");

  await writeFile(logPath, "not-json");
  const malformed = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(malformed.state, "invalid", malformed.errors?.join(" "));
  assert.equal(malformed.code, "may_control_event_replay_invalid");

  await writeFile(logPath, `${canonicalJson({ ...base, bad: base.eventId })}`);
  const malformedObject = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(malformedObject.state, "invalid", malformedObject.errors?.join(" "));
  assert.equal(malformedObject.code, "may_control_event_replay_invalid");

  await writeFile(logPath, `{"sessionId":"${sessionId}","sessionId":"${sessionId}","evidenceRefs":[]}\n`);
  const duplicateKey = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(duplicateKey.state, "invalid", duplicateKey.errors?.join(" "));
  assert.equal(duplicateKey.code, "may_control_event_replay_invalid");

  const reversed = Object.fromEntries(Object.entries(base).reverse());
  await writeFile(logPath, `${JSON.stringify(reversed)}\n`);
  const nonCanonical = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(nonCanonical.state, "invalid", nonCanonical.errors?.join(" "));
  assert.equal(nonCanonical.code, "may_control_event_replay_invalid");

  await writeFile(logPath, `${canonicalJson(base)}`);
  const truncatedTail = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(truncatedTail.state, "invalid", truncatedTail.errors?.join(" "));
  assert.equal(truncatedTail.code, "may_control_event_replay_invalid");

  await writeFile(logPath, "\n");
  const emptyLine = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(emptyLine.state, "invalid", emptyLine.errors?.join(" "));
  assert.equal(emptyLine.code, "may_control_event_replay_invalid");

  await writeFile(logPath, `${canonicalJson(foreign)}\n`);
  const foreignSession = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(foreignSession.state, "invalid", foreignSession.errors?.join(" "));
  assert.equal(foreignSession.code, "may_control_event_replay_invalid");

  await writeFile(logPath, duplicated);
  const persistedDuplicate = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(persistedDuplicate.state, "invalid", persistedDuplicate.errors?.join(" "));
  assert.equal(persistedDuplicate.code, "may_control_event_replay_invalid");
});

test("factory read returns full value; appendControlEvent returns exact receipt; invalid factory primitive preserves code", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-may-control-factory-"));
  const sessionId = "session:issue-171:factory";
  const scope = {
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
  };
  const store = createMayControlEventFilesystemStore(scope);
  const event = mkEvent(sessionId, 1, "may_control_started");
  const receipt = await store.appendControlEvent(event);
  assert.deepEqual(receipt, { eventId: event.eventId, appended: true });

  const directRead = await readMayControlEventLogV1({
    repositoryRoot,
    sessionId,
  });
  assert.equal(directRead.state, "valid", directRead.errors?.join(" "));
  const factoryRead = await store.read();
  assert.deepEqual(factoryRead, directRead.value);
  assert.equal(factoryRead.orderedEvents.length, 1);

  assert.throws(
    () => {
      createMayControlEventFilesystemStore({
        repositoryRoot,
        sessionId: "not valid session",
        lockOwnerId: "owner:issue-171",
      });
    },
    (error) => error instanceof MayControlEventStoreError && error.code === "malformed_input",
  );
  await assert.rejects(
    () => store.appendControlEvent("not-event"),
    (error) => error instanceof MayControlEventStoreError && error.code === "malformed_input",
  );
});

test("malformed read/append input shapes reject missing, extra, and undefined fields plus bad identifiers", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-may-control-malformed-"));
  const sessionId = "session:issue-171:malformed";
  const lockOwnerId = "owner:issue-171";
  const badSessionId = "bad session id";

  const missingRead = await readMayControlEventLogV1({ repositoryRoot });
  assert.equal(missingRead.state, "invalid", missingRead.errors?.join(" "));
  assert.equal(missingRead.code, "malformed_input");

  const extraRead = await readMayControlEventLogV1({ repositoryRoot, sessionId, extra: true });
  assert.equal(extraRead.state, "invalid", extraRead.errors?.join(" "));
  assert.equal(extraRead.code, "malformed_input");

  const undefinedRepoRead = await readMayControlEventLogV1({ repositoryRoot: undefined, sessionId });
  assert.equal(undefinedRepoRead.state, "invalid", undefinedRepoRead.errors?.join(" "));
  assert.equal(undefinedRepoRead.code, "malformed_input");

  const badSessionRead = await readMayControlEventLogV1({
    repositoryRoot,
    sessionId: badSessionId,
  });
  assert.equal(badSessionRead.state, "invalid", badSessionRead.errors?.join(" "));
  assert.equal(badSessionRead.code, "malformed_input");

  const missingEventField = { ...mkEvent(sessionId, 1, "may_control_started") };
  delete missingEventField.authority;
  const missingEventFieldAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId,
    event: missingEventField,
  });
  assert.equal(missingEventFieldAppend.state, "invalid", missingEventFieldAppend.errors?.join(" "));
  assert.equal(missingEventFieldAppend.code, "malformed_input");

  const extraEventField = { ...mkEvent(sessionId, 1, "may_control_started"), extra: true };
  const extraEventFieldAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId,
    event: extraEventField,
  });
  assert.equal(extraEventFieldAppend.state, "invalid", extraEventFieldAppend.errors?.join(" "));
  assert.equal(extraEventFieldAppend.code, "malformed_input");

  const undefinedEventField = { ...mkEvent(sessionId, 1, "may_control_started"), evidenceRefs: undefined };
  const undefinedEventFieldAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId,
    event: undefinedEventField,
  });
  assert.equal(undefinedEventFieldAppend.state, "invalid", undefinedEventFieldAppend.errors?.join(" "));
  assert.equal(undefinedEventFieldAppend.code, "malformed_input");

  const badSessionAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId: badSessionId,
    lockOwnerId,
    event: mkEvent(badSessionId, 1, "may_control_started"),
  });
  assert.equal(badSessionAppend.state, "invalid", badSessionAppend.errors?.join(" "));
  assert.equal(badSessionAppend.code, "malformed_input");

  const badOwnerAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner?not-allowed",
    event: mkEvent(sessionId, 1, "may_control_started"),
  });
  assert.equal(badOwnerAppend.state, "invalid", badOwnerAppend.errors?.join(" "));
  assert.equal(badOwnerAppend.code, "malformed_input");
});

test("repositoryRoot path validation rejects relative, non-directory, symlink, and unwritable roots", async () => {
  const sessionId = "session:issue-171:repository-root-paths";

  const relativeRoot = await mkdtemp(join(".", "shield-may-control-relative-root-"));
  const relativeRead = await readMayControlEventLogV1({ repositoryRoot: relativeRoot, sessionId });
  assert.equal(relativeRead.state, "invalid", relativeRead.errors?.join(" "));
  assert.equal(relativeRead.code, "malformed_input");
  const relativeAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot: relativeRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 1, "may_control_started"),
  });
  assert.equal(relativeAppend.state, "invalid", relativeAppend.errors?.join(" "));
  assert.equal(relativeAppend.code, "malformed_input");

  const realRoot = await mkdtemp(join(tmpdir(), "shield-may-control-root-base-"));
  const nonDirectoryRoot = join(realRoot, "not-a-directory");
  await writeFile(nonDirectoryRoot, "not a directory");
  const nonDirectoryRead = await readMayControlEventLogV1({ repositoryRoot: nonDirectoryRoot, sessionId });
  assert.equal(nonDirectoryRead.state, "invalid", nonDirectoryRead.errors?.join(" "));
  assert.equal(nonDirectoryRead.code, "unsafe_path");
  const nonDirectoryAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot: nonDirectoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 2, "may_control_started"),
  });
  assert.equal(nonDirectoryAppend.state, "invalid", nonDirectoryAppend.errors?.join(" "));
  assert.equal(nonDirectoryAppend.code, "unsafe_path");

  const realLinkRoot = await mkdtemp(join(tmpdir(), "shield-may-control-root-target-"));
  const aliasParent = await mkdtemp(join(tmpdir(), "shield-may-control-root-link-parent-"));
  const symlinkRoot = join(aliasParent, "repository-root");
  await symlink(realLinkRoot, symlinkRoot);
  const symlinkRead = await readMayControlEventLogV1({ repositoryRoot: symlinkRoot, sessionId });
  assert.equal(symlinkRead.state, "invalid", symlinkRead.errors?.join(" "));
  assert.equal(symlinkRead.code, "unsafe_path");
  const symlinkAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot: symlinkRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 3, "may_control_started"),
  });
  assert.equal(symlinkAppend.state, "invalid", symlinkAppend.errors?.join(" "));
  assert.equal(symlinkAppend.code, "unsafe_path");

  const unwritableRoot = await mkdtemp(join(tmpdir(), "shield-may-control-root-readonly-"));
  await chmod(unwritableRoot, 0o400);
  const unwritableRead = await readMayControlEventLogV1({ repositoryRoot: unwritableRoot, sessionId });
  assert.equal(unwritableRead.state, "invalid", unwritableRead.errors?.join(" "));
  assert.equal(unwritableRead.code, "may_control_event_unavailable");
  const unwritableAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot: unwritableRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 4, "may_control_started"),
  });
  assert.equal(unwritableAppend.state, "invalid", unwritableAppend.errors?.join(" "));
  assert.equal(unwritableAppend.code, "may_control_event_unavailable");
});

test("absolute repository root without read/write access is rejected before lockable mutation", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-may-control-readwrite-access-"));
  const sessionId = "session:issue-171:readwrite-access";
  await chmod(repositoryRoot, 0o500);

  const read = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(read.state, "invalid", read.errors?.join(" "));
  assert.equal(read.code, "may_control_event_unavailable");

  const append = await appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event: mkEvent(sessionId, 1, "may_control_started"),
  });
  assert.equal(append.state, "invalid", append.errors?.join(" "));
  assert.equal(append.code, "may_control_event_unavailable");
  await assert.rejects(() => lstat(join(repositoryRoot, ".shield")), { code: "ENOENT" });
});

test("descriptor safety rejects accessor/symbol/non-enumerable/sparse/unsafe-prototype/proxy/cycle shapes", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-may-control-descriptor-"));
  const sessionId = "session:issue-171:descriptor-safety";
  const lockOwnerId = "owner:issue-171";
  const check = async (event) => {
    const result = await appendMayControlEventIfAbsentV1({
      repositoryRoot,
      sessionId,
      lockOwnerId,
      event,
    });
    assert.equal(result.state, "invalid", result.errors?.join(" "));
    assert.equal(result.code, "malformed_input");
  };

  const accessorEvent = mkEvent(sessionId, 1, "may_control_started");
  Object.defineProperty(accessorEvent, "eventId", {
    get() {
      return `may-control-event:${sessionId}:1`;
    },
    enumerable: true,
  });
  await check(accessorEvent);

  const symbolEvent = mkEvent(sessionId, 1, "may_control_started");
  symbolEvent[Symbol("descriptor")] = "unsafe";
  await check(symbolEvent);

  const nonEnumerableEvent = mkEvent(sessionId, 1, "may_control_started");
  Object.defineProperty(nonEnumerableEvent, "code", {
    value: "may_control_started",
    enumerable: false,
  });
  await check(nonEnumerableEvent);

  const sparseEvidence = mkEvent(sessionId, 1, "may_control_started");
  const sparseRefs = [`may-control:${sessionId}`];
  delete sparseRefs[0];
  sparseEvidence.evidenceRefs = sparseRefs;
  await check(sparseEvidence);

  const unsafePrototype = Object.create(null);
  const sourceEvent = mkEvent(sessionId, 1, "may_control_started");
  Object.defineProperties(
    unsafePrototype,
    Object.fromEntries(
      Object.entries(sourceEvent).map(([key, value]) => [
        key,
        {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        },
      ]),
    ),
  );
  await check(unsafePrototype);

  const proxyEvent = new Proxy(mkEvent(sessionId, 1, "may_control_started"), {
    ownKeys() {
      throw new Error("reflective proxy failure");
    },
  });
  await check(proxyEvent);

  const cyclicEvent = mkEvent(sessionId, 1, "may_control_started");
  const refs = [];
  refs[0] = cyclicEvent;
  cyclicEvent.evidenceRefs = refs;
  await check(cyclicEvent);
});

test("append snapshots event payload before async work against post-call mutation races", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-may-control-race-"));
  const sessionId = "session:issue-171:mutation-race";
  const event = mkEvent(sessionId, 1, "may_control_started");
  const appendPromise = appendMayControlEventIfAbsentV1({
    repositoryRoot,
    sessionId,
    lockOwnerId: "owner:issue-171",
    event,
  });

  event.eventId = "may-control-event:session:issue-171:mutated:999";
  event.code = "may_control_completed";
  event.counter = 999;

  const appendResult = await appendPromise;
  assert.equal(appendResult.state, "valid", appendResult.errors?.join(" "));

  const readResult = await readMayControlEventLogV1({ repositoryRoot, sessionId });
  assert.equal(readResult.state, "valid", readResult.errors?.join(" "));
  assert.equal(readResult.value.orderedEvents[0].counter, 1);
  assert.equal(readResult.value.orderedEvents[0].code, "may_control_started");
});

test("symlink/non-regular attacks on control-event directories, log, and lock paths fail closed", async () => {
  const sessionId = "session:issue-171:path-attacks";
  const lockOwnerId = "owner:issue-171";

  const shieldRoot = await mkdtemp(join(tmpdir(), "shield-may-control-shield-path-"));
  const shieldTarget = join(shieldRoot, ".shield-target");
  await writeFile(shieldTarget, "blocked");
  await symlink(shieldTarget, join(shieldRoot, ".shield"));
  const shieldRead = await readMayControlEventLogV1({ repositoryRoot: shieldRoot, sessionId });
  assert.equal(shieldRead.state, "invalid", shieldRead.errors?.join(" "));
  assert.equal(shieldRead.code, "unsafe_path");
  const shieldAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot: shieldRoot,
    sessionId,
    lockOwnerId,
    event: mkEvent(sessionId, 1, "may_control_started"),
  });
  assert.equal(shieldAppend.state, "invalid", shieldAppend.errors?.join(" "));
  assert.equal(shieldAppend.code, "unsafe_path");

  const auditRoot = await mkdtemp(join(tmpdir(), "shield-may-control-audit-path-"));
  await mkdir(join(auditRoot, ".shield"), { recursive: true });
  const auditTarget = join(auditRoot, ".shield", "may-control-events");
  await writeFile(auditTarget, "bad directory");
  const auditRead = await readMayControlEventLogV1({ repositoryRoot: auditRoot, sessionId: "session:issue-171:may-control-events" });
  assert.equal(auditRead.state, "invalid", auditRead.errors?.join(" "));
  assert.equal(auditRead.code, "unsafe_path");
  const auditAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot: auditRoot,
    sessionId: "session:issue-171:may-control-events",
    lockOwnerId,
    event: mkEvent("session:issue-171:may-control-events", 1, "may_control_started"),
  });
  assert.equal(auditAppend.state, "invalid", auditAppend.errors?.join(" "));
  assert.equal(auditAppend.code, "unsafe_path");

  const logRoot = await mkdtemp(join(tmpdir(), "shield-may-control-log-path-"));
  const logSession = "session:issue-171:log-path";
  const canonicalLogRoot = await realpath(logRoot);
  const logPath = deterministicLogPath(canonicalLogRoot, logSession);
  await mkdir(dirname(logPath), { recursive: true });
  await symlink(logRoot, logPath);
  const logRead = await readMayControlEventLogV1({ repositoryRoot: logRoot, sessionId: logSession });
  assert.equal(logRead.state, "invalid", logRead.errors?.join(" "));
  assert.equal(logRead.code, "unsafe_path");
  const logAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot: logRoot,
    sessionId: logSession,
    lockOwnerId,
    event: mkEvent(logSession, 1, "may_control_started"),
  });
  assert.equal(logAppend.state, "invalid", logAppend.errors?.join(" "));
  assert.equal(logAppend.code, "unsafe_path");

  const lockRoot = await mkdtemp(join(tmpdir(), "shield-may-control-lock-path-"));
  const lockSession = "session:issue-171:lock-path";
  const canonicalLockRoot = await realpath(lockRoot);
  const lockPath = `${deterministicLogPath(canonicalLockRoot, lockSession)}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  await mkdir(lockPath);
  const lockAppend = await appendMayControlEventIfAbsentV1({
    repositoryRoot: lockRoot,
    sessionId: lockSession,
    lockOwnerId,
    event: mkEvent(lockSession, 1, "may_control_started"),
  });
  assert.equal(lockAppend.state, "invalid", lockAppend.errors?.join(" "));
  assert.equal(lockAppend.code, "unsafe_path");
});

test("append returns recovery_required when lock marker is short written", async () => {
  const result = await runMayControlMockedAppendScenario("lock-marker-short-write");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when lock marker sync fails", async () => {
  const result = await runMayControlMockedAppendScenario("lock-marker-sync-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when lock path is replaced after marker write with matching marker", async () => {
  const result = await runMayControlMockedAppendScenario("lock-path-replaced-with-matching-marker");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when first lock-parent sync fails after acquisition", async () => {
  const result = await runMayControlMockedAppendScenario("first-lock-parent-sync-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when lock unlink is verified and fails", async () => {
  const result = await runMayControlMockedAppendScenario("release-unlink-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when second lock-parent sync fails", async () => {
  const result = await runMayControlMockedAppendScenario("second-lock-parent-sync-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when lock marker/inode/dev drift before release", async () => {
  const result = await runMayControlMockedAppendScenario("lock-metadata-drift");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when uncertainty overrides deterministic sequence violation after namespace drift", async () => {
  const result = await runMayControlMockedAppendScenario("uncertain-sequence-violation-overrides");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when repository root directory sync fails", async () => {
  const result = await runMayControlMockedAppendScenario("repository-root-sync-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when .shield directory sync fails", async () => {
  const result = await runMayControlMockedAppendScenario("shield-sync-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when may-control-events directory sync fails", async () => {
  const result = await runMayControlMockedAppendScenario("may-control-events-sync-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when first log parent directory sync fails", async () => {
  const result = await runMayControlMockedAppendScenario("first-log-parent-sync-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when log append is short written", async () => {
  const result = await runMayControlMockedAppendScenario("log-append-short-write");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when log append sync fails", async () => {
  const result = await runMayControlMockedAppendScenario("log-sync-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when post-append reread bytes mismatch overrides narrower replay checks", async () => {
  const result = await runMayControlMockedAppendScenario("post-append-reread-bytes-mismatch");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when post-append replay/readback fails", async () => {
  const result = await runMayControlMockedAppendScenario("post-append-replay-readback-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});
