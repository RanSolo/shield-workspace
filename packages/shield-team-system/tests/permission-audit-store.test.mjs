import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  appendPermissionAuditRecordIfAbsentV1,
  createPermissionAuditFilesystemStore,
  readPermissionAuditLedgerV1,
} from "../dist/permission-audit-store.mjs";
import {
  createPermissionAuditRecord,
  validatePermissionAuditReceipt,
} from "../dist/permission-audit-v1.mjs";
import {
  canonicalJson,
} from "../dist/mission-v2.mjs";

function ledgerPath(repositoryRoot, ledgerId) {
  return join(repositoryRoot, ".shield", "permission-audit", `${createHash("sha256").update(ledgerId, "utf8").digest("base64url")}.jsonl`);
}
function lockPath(repositoryRoot, ledgerId) {
  return `${ledgerPath(repositoryRoot, ledgerId)}.lock`;
}

function baseRecord(overrides = {}) {
  return createPermissionAuditRecord({
    schemaVersion: 1,
    authority: "non_authoritative",
    recordType: "permission.decision",
    recordedAt: "2026-08-01T00:00:00.000Z",
    outcome: "allow",
    ledgerId: "ledger:issue-171",
    recordId: "permission:issue-171:decision",
    decisionId: "decision:issue-171",
    missionId: "mission:issue-171",
    subjectId: "issue-171",
    seatId: "may",
    reasoningRuntimeId: "runtime:issue-171:may",
    toolExecutorId: "executor:codex-host",
    bindingId: "binding:issue-171",
    bindingVersion: 1,
    repositoryId: "repo:issue-171",
    canonicalWritableRoot: "/workspace/issue-171",
    branch: "issue-171/mission",
    revisionId: "0123456789012345678901234567890123456789",
    journalSequence: 12,
    actionId: "approve-permission",
    effectClass: "behavioral_implementation",
    effectKey: "effect:issue-171:permission",
    approvedScope: ["edit"],
    summary: "Permission decision.",
    evidenceRefs: ["attestation:1"],
    ...overrides,
  });
}

function scope(repositoryRoot, ledgerId = "ledger:issue-171") {
  return {
    repositoryRoot,
    ledgerId,
    lockOwnerId: "owner:issue-171",
  };
}

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const TEST_FILE_DIR = dirname(TEST_FILE_PATH);
const PACKAGE_DIST_DIR = resolve(TEST_FILE_DIR, "..", "dist");
const PERMISSION_AUDIT_STORE_PATH = resolve(PACKAGE_DIST_DIR, "permission-audit-store.mjs");
const PERMISSION_AUDIT_V1_PATH = resolve(PACKAGE_DIST_DIR, "permission-audit-v1.mjs");
const MISSION_V2_PATH = resolve(PACKAGE_DIST_DIR, "mission-v2.mjs");

async function runPermissionAuditMockedAppendScenario(scenario) {
  const script = `
    import { mkdtemp } from "node:fs/promises";
    import { join, sep } from "node:path";
    import { tmpdir } from "node:os";
    import { pathToFileURL } from "node:url";
    import { mock } from "node:test";
    import { constants } from "node:fs";
    import { createHash } from "node:crypto";
    import * as realFs from "node:fs/promises";
    import { canonicalJson } from ${JSON.stringify(MISSION_V2_PATH)};

    const scenario = ${JSON.stringify(scenario)};
    const permissionAuditStorePath = ${JSON.stringify(PERMISSION_AUDIT_STORE_PATH)};
    const permissionAuditV1Path = ${JSON.stringify(PERMISSION_AUDIT_V1_PATH)};
    const permissionAuditStoreUrl = pathToFileURL(permissionAuditStorePath);
    const permissionAuditV1Url = pathToFileURL(permissionAuditV1Path);
    const permissionAuditV1RealUrl = permissionAuditV1Url.href + "?real";
    const permissionAuditStoreRealUrl = permissionAuditStoreUrl.href + "?scenario=" + encodeURIComponent(scenario) + "&pathCheck=postCreate";
    const repositoryRoot = await mkdtemp(join(${JSON.stringify(tmpdir())}, "shield-permission-audit-child-"));
    const ledgerId = "ledger:issue-171:" + scenario;
    const scope = {
      repositoryRoot,
      ledgerId,
      lockOwnerId: "owner:issue-171",
    };
    const repositoryRootForChecks = await realFs.realpath(repositoryRoot);
    const shieldDirectoryForChecks = join(repositoryRootForChecks, ".shield");
    const auditDirectoryForChecks = join(repositoryRootForChecks, ".shield", "permission-audit");
    const permissionAuditV1 = await import(permissionAuditV1RealUrl);
    const record = permissionAuditV1.createPermissionAuditRecord({
      schemaVersion: 1,
      authority: "non_authoritative",
      recordType: "permission.decision",
      recordedAt: "2026-08-01T00:00:00.000Z",
      outcome: "allow",
      ledgerId,
      recordId: "record:" + scenario,
      decisionId: "decision:" + scenario,
      missionId: "mission:issue-171",
      subjectId: "issue-171",
      seatId: "may",
      reasoningRuntimeId: "runtime:issue-171:may",
      toolExecutorId: "executor:codex-host",
      bindingId: "binding:issue-171",
      bindingVersion: 1,
      repositoryId: "repo:issue-171",
      canonicalWritableRoot: "/workspace/issue-171",
      branch: "issue-171/mission",
      revisionId: "0123456789012345678901234567890123456789",
      journalSequence: 12,
      actionId: "approve-permission",
      effectClass: "behavioral_implementation",
      effectKey: "effect:issue-171:permission",
      approvedScope: ["edit"],
      summary: "Permission decision.",
      evidenceRefs: ["attestation:1"],
    });

    const permissionAuditDirectorySuffix = sep + ".shield" + sep + "permission-audit";
    const mismatchLine = canonicalJson(permissionAuditV1.createPermissionAuditRecord({
      ...record,
      recordId: "record:" + scenario + ":mismatch",
      decisionId: "decision:" + scenario + ":mismatch",
      journalSequence: 13,
    }));
    const isPostCreateSymlinkScenario = scenario === "shield-post-create-symlink" || scenario === "audit-directory-post-create-symlink";
    let hasCorruptedShieldDirectory = false;
    let hasCorruptedAuditDirectory = false;

    if (scenario === "receipt-mismatch") {
      const mockedReceiptValidationResult = {
        state: "invalid",
        code: "receipt_mismatch",
        errors: ["receipt mismatch"],
      };
      mock.module(permissionAuditV1Url.href, {
        namedExports: {
          ...permissionAuditV1,
          validatePermissionAuditReceipt: () => mockedReceiptValidationResult,
        },
      });
    }

    mock.module("node:fs/promises", {
      exports: {
        ...realFs,
        mkdir: async (path, options) => {
          const result = await realFs.mkdir(path, options);
          if (isPostCreateSymlinkScenario && path === shieldDirectoryForChecks && !hasCorruptedShieldDirectory && scenario === "shield-post-create-symlink") {
            hasCorruptedShieldDirectory = true;
            const shieldRaceTarget = join(repositoryRoot, "shield-race-target");
            await realFs.rm(path, { recursive: true, force: true });
            await realFs.mkdir(shieldRaceTarget, { recursive: true });
            await realFs.symlink(shieldRaceTarget, path);
          }
          if (isPostCreateSymlinkScenario && path === auditDirectoryForChecks && !hasCorruptedAuditDirectory && scenario === "audit-directory-post-create-symlink") {
            hasCorruptedAuditDirectory = true;
            const auditRaceTarget = join(repositoryRoot, "audit-directory-race-target");
            await realFs.rm(path, { recursive: true, force: true });
            await realFs.mkdir(auditRaceTarget, { recursive: true });
            await realFs.symlink(auditRaceTarget, path);
          }
          return result;
        },
        open: async (path, flags, mode) => {
          const handle = await realFs.open(path, flags, mode);

          const isLedgerPath = typeof path === "string" && path.endsWith(".jsonl");
          const isDirectoryOpen = typeof flags === "number" && (flags & constants.O_DIRECTORY) === constants.O_DIRECTORY;
          const isRead = typeof flags === "number" && (flags & constants.O_RDONLY) === constants.O_RDONLY;
          const isWrite = typeof flags === "number" && (flags & constants.O_WRONLY) === constants.O_WRONLY;

          if (scenario === "directory-sync-failure" && isDirectoryOpen && typeof path === "string" && path.endsWith(permissionAuditDirectorySuffix)) {
            await handle.close().catch(() => undefined);
            const error = new Error("permission audit directory sync failure");
            error.code = "EIO";
            throw error;
          }

          if (isLedgerPath && typeof handle.write === "function" && scenario === "short-write" && isWrite) {
            const originalWrite = handle.write.bind(handle);
            handle.write = async (...writeArgs) => {
              const result = await originalWrite(...writeArgs);
              return { ...result, bytesWritten: Math.max(0, result.bytesWritten - 1) };
            };
          }

          if (isLedgerPath && typeof handle.sync === "function" && scenario === "append-sync-failure" && isWrite) {
            handle.sync = async () => {
              throw new Error("simulated append sync failure");
            };
          }

          if (isLedgerPath && typeof handle.readFile === "function" && scenario === "reread-mismatch" && isRead) {
            const originalReadFile = handle.readFile.bind(handle);
            handle.readFile = async (...readArgs) => {
              const value = await originalReadFile(...readArgs);
              if (typeof value !== "string") return String(value);
              return value + mismatchLine + "\\n";
            };
          }

          return handle;
        },
      },
    });

    const permissionAuditStore = await import(permissionAuditStoreRealUrl);
    const result = await permissionAuditStore.appendPermissionAuditRecordIfAbsentV1({ ...scope, record });
    console.log(JSON.stringify({ state: result.state, code: result.code ?? null }));
  `;

  const scriptRoot = await mkdtemp(join(tmpdir(), "shield-permission-audit-child-script-"));
  const scriptPath = join(scriptRoot, "permission-audit-child.mjs");
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

test("missing ledger read is empty, missing path maps to deterministic hash, and per-ledger files differ", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-permission-audit-"));
  const readResult = await readPermissionAuditLedgerV1(scope(repositoryRoot, "ledger:one"));
  assert.equal(readResult.state, "valid", readResult.errors?.join(" "));
  assert.equal(readResult.value.missing, true);
  assert.equal(readResult.value.entries.length, 0);
  assert.equal(readResult.value.bytes, "");
  const expectedPath = ledgerPath(repositoryRoot, "ledger:one");
  assert.equal(readResult.value.ledgerPath.replace(/^\/private/, ""), expectedPath.replace(/^\/private/, ""));

  const otherPath = ledgerPath(repositoryRoot, "ledger:two");
  assert.notEqual(expectedPath, otherPath);
});

test("append writes one canonical line and supports exact replay/readback restart semantics", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-permission-audit-"));
  const writeScope = scope(repositoryRoot, "ledger:issue-171:append");
  const record = baseRecord({ ledgerId: writeScope.ledgerId });
  const appended = await appendPermissionAuditRecordIfAbsentV1({ ...writeScope, record });
  assert.equal(appended.state, "valid", appended.errors?.join(" "));
  assert.equal(appended.value.receipt.appended, true);
  assert.equal(appended.value.receipt.ledgerSequence, 0);
  assert.deepEqual(validatePermissionAuditReceipt(appended.value.receipt, record), { state: "valid", value: appended.value.receipt });

  const readFirst = await readPermissionAuditLedgerV1(writeScope);
  assert.equal(readFirst.state, "valid", readFirst.errors?.join(" "));
  assert.equal(readFirst.value.entries.length, 1);
  assert.deepEqual(readFirst.value.entries[0], record);
  assert.equal(readFirst.value.bytes, appended.value.bytes);
  assert.equal(Buffer.byteLength(readFirst.value.bytes, "utf8"), appended.value.byteLength);

  const replayedBytes = await readFile(ledgerPath(repositoryRoot, writeScope.ledgerId), "utf8");
  assert.equal(replayedBytes, appended.value.bytes);

  const store = createPermissionAuditFilesystemStore(writeScope);
  const reread = await store.appendIfAbsent(record);
  assert.equal(reread.appended, true);
  assert.equal(reread.ledgerSequence, 0);
  const readSecond = await readPermissionAuditLedgerV1(writeScope);
  assert.equal(readSecond.state, "valid", readSecond.errors?.join(" "));
  assert.equal(readSecond.value.bytes, readFirst.value.bytes);
});

test("same recordId returns reconstructed receipt, different payload causes id conflict", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-permission-audit-"));
  const duplicateScope = scope(repositoryRoot, "ledger:issue-171:dup");
  const store = createPermissionAuditFilesystemStore(duplicateScope);

  const original = baseRecord({
    ledgerId: duplicateScope.ledgerId,
    recordId: "record:same",
    decisionId: "decision:same",
  });
  const first = await appendPermissionAuditRecordIfAbsentV1({ ...duplicateScope, record: original });
  assert.equal(first.state, "valid", first.errors?.join(" "));
  const firstBytes = first.value.bytes;

  const repeated = await store.appendIfAbsent(original);
  assert.equal(repeated.appended, true);
  assert.equal(repeated.ledgerSequence, 0);

  const repeatRead = await readPermissionAuditLedgerV1(duplicateScope);
  assert.equal(repeatRead.state, "valid", repeatRead.errors?.join(" "));
  assert.equal(repeatRead.value.bytes, firstBytes);

  const conflicting = baseRecord({
    ...(Object.fromEntries(Object.entries(original).filter(([key]) => key !== "digest"))),
    summary: "conflicting summary",
  });
  const conflict = await appendPermissionAuditRecordIfAbsentV1({
    ...duplicateScope,
    record: conflicting,
  });
  assert.equal(conflict.state, "invalid", conflict.errors?.join(" "));
  assert.equal(conflict.code, "permission_audit_id_conflict");
});

test("replay rejects foreign-ledger, duplicate-key, noncanonical, malformed, and incomplete JSONL", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-permission-audit-"));
  const replayScope = scope(repositoryRoot, "ledger:issue-171:replay");
  const ledger = ledgerPath(repositoryRoot, replayScope.ledgerId);
  await mkdir(dirname(ledger), { recursive: true });

  const foreignRecord = baseRecord({ ledgerId: "ledger:foreign", recordId: "foreign", decisionId: "decision:foreign" });
  await writeFile(ledger, `${canonicalJson(foreignRecord)}\n`);
  const foreignRead = await readPermissionAuditLedgerV1(replayScope);
  assert.equal(foreignRead.state, "invalid", foreignRead.errors?.join(" "));
  assert.equal(foreignRead.code, "permission_audit_replay_invalid");

  const duplicateKey = `{"recordId":"one","recordId":"two"}\n`;
  await writeFile(ledger, duplicateKey);
  const duplicateKeyRead = await readPermissionAuditLedgerV1(replayScope);
  assert.equal(duplicateKeyRead.state, "invalid", duplicateKeyRead.errors?.join(" "));
  assert.equal(duplicateKeyRead.code, "permission_audit_replay_invalid");

  const nonCanonicalRecord = baseRecord({ ledgerId: replayScope.ledgerId });
  const canonicalLine = `${canonicalJson(nonCanonicalRecord)}\n`;
  const parsedRecord = JSON.parse(canonicalLine);
  const reverse = Object.fromEntries(Object.entries(parsedRecord).reverse());
  await writeFile(ledger, `${JSON.stringify(reverse)}\n`);
  const nonCanonicalRead = await readPermissionAuditLedgerV1(replayScope);
  assert.equal(nonCanonicalRead.state, "invalid", nonCanonicalRead.errors?.join(" "));
  assert.equal(nonCanonicalRead.code, "permission_audit_replay_invalid");
  await writeFile(ledger, `${JSON.stringify({ ledgerId: replayScope.ledgerId, bad: "shape" })}`);
  const malformedJson = await readPermissionAuditLedgerV1(replayScope);
  assert.equal(malformedJson.state, "invalid", malformedJson.errors?.join(" "));
  assert.equal(malformedJson.code, "permission_audit_replay_invalid");

  await writeFile(ledger, canonicalLine.slice(0, -1));
  const incomplete = await readPermissionAuditLedgerV1(replayScope);
  assert.equal(incomplete.state, "invalid", incomplete.errors?.join(" "));
  assert.equal(incomplete.code, "permission_audit_replay_invalid");

  await writeFile(ledger, "\n");
  const emptyLine = await readPermissionAuditLedgerV1(replayScope);
  assert.equal(emptyLine.state, "invalid", emptyLine.errors?.join(" "));
  assert.equal(emptyLine.code, "permission_audit_replay_invalid");
});

test("path confinement rejects symlinked shield directory", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-permission-audit-"));
  const escapedTarget = join(repositoryRoot, "escape-target");
  await mkdir(escapedTarget, { recursive: true });
  const shieldPath = join(repositoryRoot, ".shield");
  await symlink(escapedTarget, shieldPath);

  const confined = await readPermissionAuditLedgerV1(scope(repositoryRoot, "ledger:issue-171:symlink"));
  assert.equal(confined.state, "invalid", confined.errors?.join(" "));
  assert.equal(confined.code, "unsafe_path");
  await unlink(shieldPath);
});

test("lock ownership gates append and closed wrapper throws on held lock", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-permission-audit-"));
  const lockScope = scope(repositoryRoot, "ledger:issue-171:lock");
  const first = await appendPermissionAuditRecordIfAbsentV1({
    ...lockScope,
    record: baseRecord({ ledgerId: lockScope.ledgerId, recordId: "lock-start" }),
  });
  assert.equal(first.state, "valid", first.errors?.join(" "));
  const lockHandle = await open(`${first.value.ledgerPath}.lock`, "wx");
  const blocked = await appendPermissionAuditRecordIfAbsentV1({
    ...lockScope,
    record: baseRecord({ ledgerId: lockScope.ledgerId, recordId: "lock-blocked" }),
  });
  assert.equal(blocked.state, "invalid", blocked.errors?.join(" "));
  assert.equal(blocked.code, "permission_audit_lock_held");

  const store = createPermissionAuditFilesystemStore(lockScope);
  await assert.rejects(async () => {
    await store.appendIfAbsent(baseRecord({ ledgerId: lockScope.ledgerId, recordId: "store-lock" }));
  }, (error) => error.code === "permission_audit_lock_held");
  await lockHandle.close();
});

test("append returns recovery_required when lock ownership marker is externally mutated during append", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-permission-audit-"));
  const recoveryScope = scope(repositoryRoot, "ledger:issue-171:lock-recovery");
  const ledger = ledgerPath(repositoryRoot, recoveryScope.ledgerId);
  await mkdir(dirname(ledger), { recursive: true });

  const seedRecord = baseRecord({ ledgerId: recoveryScope.ledgerId, recordId: "seed-0", decisionId: "seed-decision-0" });
  const seedLines = [];
  for (let index = 0; index < 5000; index += 1) {
    seedLines.push(
      `${canonicalJson(
        baseRecord({
          ...seedRecord,
          recordId: `seed-${index}`,
          decisionId: `seed-decision-${index}`,
          journalSequence: index,
        }),
      )}\n`,
    );
  }
  await writeFile(ledger, seedLines.join(""));

  const lockPath = `${ledger}.lock`;

  const mutateLock = async () => {
    for (let attempts = 0; attempts < 5000; attempts += 1) {
      try {
        const marker = await readFile(lockPath, "utf8");
        await writeFile(lockPath, `${marker}::corrupted`);
        return;
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        if (code !== "ENOENT") throw error;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("lock file did not appear during append");
  };

  const appending = appendPermissionAuditRecordIfAbsentV1({
    ...recoveryScope,
    record: baseRecord({ ledgerId: recoveryScope.ledgerId, recordId: "recovery-lock-marker", decisionId: "recovery-decision", journalSequence: 5000 }),
  });
  const mutation = mutateLock();

  const appendResult = await Promise.all([appending, mutation]).then(([result]) => result);
  assert.equal(appendResult.state, "invalid", appendResult.errors?.join(" "));
  assert.equal(appendResult.code, "recovery_required");
});

test("append returns recovery_required on short write", async () => {
  const result = await runPermissionAuditMockedAppendScenario("short-write");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns invalid when .shield becomes a symlink after creation", async () => {
  const result = await runPermissionAuditMockedAppendScenario("shield-post-create-symlink");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns invalid when permission-audit directory becomes a symlink after creation", async () => {
  const result = await runPermissionAuditMockedAppendScenario("audit-directory-post-create-symlink");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when append sync fails", async () => {
  const result = await runPermissionAuditMockedAppendScenario("append-sync-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when permission-audit parent directory sync fails", async () => {
  const result = await runPermissionAuditMockedAppendScenario("directory-sync-failure");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when reread bytes do not match append expectation", async () => {
  const result = await runPermissionAuditMockedAppendScenario("reread-mismatch");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("append returns recovery_required when receipt reconstruction fails", async () => {
  const result = await runPermissionAuditMockedAppendScenario("receipt-mismatch");
  assert.equal(result.state, "invalid", result.errors?.join(" "));
  assert.equal(result.code, "recovery_required");
});

test("malformed lockOwnerId fails before filesystem access for primitive and store APIs", async () => {
  const malformed = scope("/this/path/does/not/exist", "ledger:issue-171:malformed-owner");
  const malformedInput = { ...malformed, lockOwnerId: "owner with spaces" };
  const primitiveRead = await readPermissionAuditLedgerV1(malformedInput);
  assert.equal(primitiveRead.state, "invalid", primitiveRead.errors?.join(" "));
  assert.equal(primitiveRead.code, "malformed_input");

  const primitiveAppend = await appendPermissionAuditRecordIfAbsentV1({
    ...malformedInput,
    record: baseRecord({ ledgerId: malformedInput.ledgerId }),
  });
  assert.equal(primitiveAppend.state, "invalid", primitiveAppend.errors?.join(" "));
  assert.equal(primitiveAppend.code, "malformed_input");

  const closedStore = createPermissionAuditFilesystemStore(malformedInput);
  await assert.rejects(async () => {
    await closedStore.read();
  }, (error) => error.code === "malformed_input");
  await assert.rejects(async () => {
    await closedStore.appendIfAbsent(baseRecord({ ledgerId: malformedInput.ledgerId }));
  }, (error) => error.code === "malformed_input");

  const overlong = "a".repeat(129);
  const overlongInput = { ...malformed, lockOwnerId: overlong };
  const overlongRead = await readPermissionAuditLedgerV1(overlongInput);
  assert.equal(overlongRead.state, "invalid", overlongRead.errors?.join(" "));
  assert.equal(overlongRead.code, "malformed_input");
});

test("path confinement rejects symlinked repository root", async () => {
  const parent = await mkdtemp(join(tmpdir(), "shield-permission-audit-"));
  const target = join(parent, "target");
  const linkedRoot = join(parent, "linked-root");
  await mkdir(target, { recursive: true });
  await symlink(target, linkedRoot);
  const readResult = await readPermissionAuditLedgerV1({
    repositoryRoot: linkedRoot,
    ledgerId: "ledger:issue-171:symlink-root",
    lockOwnerId: "owner:issue-171",
  });
  assert.equal(readResult.state, "invalid", readResult.errors?.join(" "));
  assert.equal(readResult.code, "unsafe_path");
});

test("non-regular ledger and lock paths are rejected", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-permission-audit-"));
  const nonRegularScope = scope(repositoryRoot, "ledger:issue-171:non-regular");
  const ledger = ledgerPath(repositoryRoot, nonRegularScope.ledgerId);
  const lock = lockPath(repositoryRoot, nonRegularScope.ledgerId);

  await mkdir(dirname(ledger), { recursive: true });
  await mkdir(ledger, { recursive: true });
  const ledgerRead = await readPermissionAuditLedgerV1(nonRegularScope);
  assert.equal(ledgerRead.state, "invalid", ledgerRead.errors?.join(" "));
  assert.equal(ledgerRead.code, "unsafe_path");

  await mkdir(lock, { recursive: true });
  const appendResult = await appendPermissionAuditRecordIfAbsentV1({
    ...nonRegularScope,
    record: baseRecord({ ledgerId: nonRegularScope.ledgerId, recordId: "non-regular-lock" }),
  });
  assert.equal(appendResult.state, "invalid", appendResult.errors?.join(" "));
  assert.equal(appendResult.code, "unsafe_path");
});

test("replay enforces decision/invocation/result ordering", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-permission-audit-"));
  const orderingScope = scope(repositoryRoot, "ledger:issue-171:ordering");
  const ledger = ledgerPath(repositoryRoot, orderingScope.ledgerId);
  await mkdir(dirname(ledger), { recursive: true });
  const decision = baseRecord({
    ledgerId: orderingScope.ledgerId,
    recordType: "permission.decision",
    recordId: "decision:ordering",
    decisionId: "decision:ordering",
  });
  const invocation = baseRecord({
    ledgerId: orderingScope.ledgerId,
    recordType: "tool.invocation",
    recordId: "invocation:ordering",
    decisionId: "decision:ordering",
  });
  await writeFile(ledger, `${canonicalJson(invocation)}\n${canonicalJson(decision)}\n`);
  const orderingRead = await readPermissionAuditLedgerV1(orderingScope);
  assert.equal(orderingRead.state, "invalid", orderingRead.errors?.join(" "));
  assert.equal(orderingRead.code, "permission_audit_replay_invalid");
});
