import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  appendFuryPlanReviewEvidenceIfAbsentV1,
  createFuryPlanReviewEvidenceFilesystemStore,
  readFuryPlanReviewEvidenceLedgerV1,
} from "../dist/fury-plan-review-evidence-store.mjs";
import { deriveFuryPlanReviewEvidenceV1 } from "../dist/fury-plan-review-evidence-v1.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";
import { canonicalJson } from "../dist/mission-v2.mjs";

const missionId = "mission:issue-172";
const missionRevision = `sha256:${"A".repeat(43)}`;
const head = "1".repeat(40);

function scope(repositoryRoot, overrides = {}) {
  return { repositoryRoot, missionId, lockOwnerId: "owner:issue-172", ...overrides };
}

function ledgerPath(repositoryRoot) {
  const name = createHash("sha256").update(missionId, "utf8").digest("base64url");
  return join(repositoryRoot, ".shield", "audit", "fury-plan-reviews", `${name}.jsonl`);
}

function binding() {
  return {
    schemaVersion: 1,
    missionId,
    missionRevisionId: missionRevision,
    subjectId: "github:RanSolo/shield-workspace/issue/172",
    repositoryId: "RanSolo/shield-workspace",
    baseBranch: "main",
    branch: "agent/issue-172-fury-review-evidence",
    prNumber: 180,
    blueprintArtifactId: "issue-172-blueprint",
    blueprintArtifactPath: "docs/missions/issue-172-may-blueprint.md",
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    artifactRevisionId: head,
    repositoryRevisionId: head,
  };
}

function gate() {
  return {
    planGateSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    review: {
      reviewSchemaVersion: 1,
      contractVersion: "fury.plan-gate.v1",
      assuranceKind: "host_asserted_non_authoritative",
      reviewId: "review:issue-172:1",
      missionId,
      subjectId: "github:RanSolo/shield-workspace/issue/172",
      repositoryOwner: "RanSolo",
      repositoryName: "shield-workspace",
      baseBranch: "main",
      missionBranch: "agent/issue-172-fury-review-evidence",
      prNumber: 180,
      blueprintArtifactId: "issue-172-blueprint",
      blueprintArtifactPath: "docs/missions/issue-172-may-blueprint.md",
      blueprintArtifactKind: "implementation_blueprint",
      blueprintOwningSeatId: "may",
      reviewedRevisionId: head,
      verdict: "PASS",
      findings: [],
      reasoningRuntimeId: "runtime:fury-hosted",
      toolExecutorId: "executor:codex-host",
    },
    reconciliation: null,
  };
}

function identity(suffix = "1") {
  return {
    receiptId: `receipt:fury:${suffix}`,
    dispatchId: `dispatch:fury:${suffix}`,
    parentMissionId: missionId,
    parentMissionRevision: missionRevision,
    parentSessionId: "session:hill:172",
    childTaskId: `task:fury:${suffix}`,
    childSessionId: `session:fury:${suffix}`,
    accountableSeatId: "fury",
    repositoryId: "RanSolo/shield-workspace",
    repositoryWorkspaceId: "workspace:issue-172",
    repositoryRevision: head,
    subjectId: "github:RanSolo/shield-workspace/issue/172",
    subjectRevision: head,
    artifactId: "issue-172-blueprint",
    artifactRevision: head,
  };
}

function entries(dispatchIdentity, model = "gpt-5.6-sol") {
  const runtime = {
    kind: "runtime.host_observed",
    runtimeId: "runtime:fury-hosted",
    model,
    evidenceRefs: [`host:runtime:${model}`],
  };
  const executor = {
    kind: "executor.host_observed",
    executorId: "executor:codex-host",
    evidenceRefs: ["host:executor"],
  };
  const shared = {
    ...dispatchIdentity,
    configuredRuntime: { kind: "runtime.configured", runtimeId: runtime.runtimeId, model },
    requestedRuntime: { kind: "runtime.requested", runtimeId: runtime.runtimeId, model },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:fury" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: runtime,
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: executor,
  };
  const started = createSeatDispatchStartedEventV1({
    ...shared,
    inputEvidenceRefs: ["blueprint:172"],
    timestamp: "2026-08-03T18:00:00Z",
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
  const completed = createSeatDispatchLifecycleEventV1({
    ...shared,
    kind: "dispatch.completed",
    outputEvidenceRefs: ["review:172"],
    timestamp: "2026-08-03T18:00:01Z",
    logSequence: 1,
    previousLogDigest: started.entryDigest,
    lifecycleSequence: 1,
    previousLifecycleDigest: started.entryDigest,
  });
  return [started, completed];
}

function evidence(suffix = "1", model = "gpt-5.6-sol") {
  const dispatchIdentity = identity(suffix);
  const result = deriveFuryPlanReviewEvidenceV1({
    planGate: gate(), binding: binding(), dispatchIdentity,
    rawReceiptEntries: entries(dispatchIdentity, model),
  });
  assert.equal(result.state, "created");
  return result.evidence;
}

test("missing read, canonical append, idempotent append, and restart readback", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-fury-evidence-"));
  const missing = await readFuryPlanReviewEvidenceLedgerV1(scope(repositoryRoot));
  assert.equal(missing.state, "valid");
  assert.equal(missing.value.missing, true);
  const record = evidence();
  const first = await appendFuryPlanReviewEvidenceIfAbsentV1({ ...scope(repositoryRoot), evidence: record });
  const second = await appendFuryPlanReviewEvidenceIfAbsentV1({ ...scope(repositoryRoot), evidence: record });
  assert.equal(first.state, "valid");
  assert.equal(second.state, "valid");
  assert.equal(first.value.bytes, `${canonicalJson(record)}\n`);
  assert.equal(second.value.bytes, first.value.bytes);
  assert.equal(second.value.records.length, 1);
  const restarted = createFuryPlanReviewEvidenceFilesystemStore(scope(repositoryRoot));
  assert.deepEqual((await restarted.read()).records, [record]);
});

test("concurrent append never writes duplicate evidence", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-fury-evidence-concurrent-"));
  const record = evidence();
  const results = await Promise.all([
    appendFuryPlanReviewEvidenceIfAbsentV1({ ...scope(repositoryRoot, { lockOwnerId: "owner:a" }), evidence: record }),
    appendFuryPlanReviewEvidenceIfAbsentV1({ ...scope(repositoryRoot, { lockOwnerId: "owner:b" }), evidence: record }),
  ]);
  assert.ok(results.some((result) => result.state === "valid"));
  const readback = await readFuryPlanReviewEvidenceLedgerV1(scope(repositoryRoot));
  assert.equal(readback.state, "valid");
  assert.equal(readback.value.records.length, 1);
});

test("concurrent conflicting reviews persist at most one complete record", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-fury-evidence-concurrent-conflict-"));
  const records = [evidence("1", "gpt-5.6-sol"), evidence("2", "gpt-5.6-sol-v2")];
  const results = await Promise.all(records.map((record, index) =>
    appendFuryPlanReviewEvidenceIfAbsentV1({
      ...scope(repositoryRoot, { lockOwnerId: `owner:conflict:${index}` }), evidence: record,
    })));
  assert.equal(results.filter((result) => result.state === "valid").length, 1);
  const readback = await readFuryPlanReviewEvidenceLedgerV1(scope(repositoryRoot));
  assert.equal(readback.state, "valid");
  assert.equal(readback.value.records.length, 1);
  assert.ok(records.some((record) => record.evidenceId === readback.value.records[0].evidenceId));
});

test("same review key with different independently observed model conflicts without mutation", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-fury-evidence-conflict-"));
  const firstRecord = evidence("1", "gpt-5.6-sol");
  const conflictingRecord = evidence("2", "gpt-5.6-sol-v2");
  const first = await appendFuryPlanReviewEvidenceIfAbsentV1({ ...scope(repositoryRoot), evidence: firstRecord });
  const conflict = await appendFuryPlanReviewEvidenceIfAbsentV1({ ...scope(repositoryRoot), evidence: conflictingRecord });
  assert.equal(first.state, "valid");
  assert.equal(conflict.state, "invalid");
  assert.equal(conflict.code, "review_evidence_conflict");
  assert.equal(await readFile(ledgerPath(repositoryRoot), "utf8"), `${canonicalJson(firstRecord)}\n`);
});

test("noncanonical, malformed, and incomplete ledger bytes fail closed", async () => {
  for (const bytes of ["{}\n", "{broken}\n", "{}"] ) {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-fury-evidence-malformed-"));
    await mkdir(dirname(ledgerPath(repositoryRoot)), { recursive: true });
    await writeFile(ledgerPath(repositoryRoot), bytes, "utf8");
    const result = await readFuryPlanReviewEvidenceLedgerV1(scope(repositoryRoot));
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "evidence_replay_invalid");
  }
});

test("symlinked audit path fails closed before append", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-fury-evidence-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-fury-evidence-outside-"));
  await symlink(outside, join(repositoryRoot, ".shield"));
  const result = await appendFuryPlanReviewEvidenceIfAbsentV1({
    ...scope(repositoryRoot), evidence: evidence(),
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "unsafe_path");
});

test("symlinked review directory fails closed before append", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-fury-evidence-review-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-fury-evidence-review-outside-"));
  const auditDirectory = join(repositoryRoot, ".shield", "audit");
  await mkdir(auditDirectory, { recursive: true });
  await symlink(outside, join(auditDirectory, "fury-plan-reviews"));
  const result = await appendFuryPlanReviewEvidenceIfAbsentV1({
    ...scope(repositoryRoot), evidence: evidence(),
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "unsafe_path");
});

test("symlinked lock path fails closed as unsafe without touching its target", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-fury-evidence-lock-symlink-"));
  const target = join(await mkdtemp(join(tmpdir(), "shield-fury-evidence-lock-target-")), "target");
  await mkdir(dirname(ledgerPath(repositoryRoot)), { recursive: true });
  await writeFile(target, "outside\n", "utf8");
  await symlink(target, `${ledgerPath(repositoryRoot)}.lock`);
  const result = await appendFuryPlanReviewEvidenceIfAbsentV1({
    ...scope(repositoryRoot), evidence: evidence(),
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "unsafe_path");
  assert.equal(await readFile(target, "utf8"), "outside\n");
});

test("lock release failure overrides a durable append with recovery_required", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-fury-evidence-release-"));
  const record = evidence();
  const testFile = fileURLToPath(import.meta.url);
  const storePath = resolve(dirname(testFile), "..", "dist", "fury-plan-review-evidence-store.mjs");
  const script = `
    import { mock } from "node:test";
    import * as realFs from "node:fs/promises";
    import { pathToFileURL } from "node:url";
    mock.module("node:fs/promises", { namedExports: {
      ...realFs,
      unlink: async (path) => {
        if (String(path).endsWith(".lock")) {
          const error = new Error("fault"); error.code = "EIO"; throw error;
        }
        return realFs.unlink(path);
      },
    }});
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href + "?release-fault");
    const result = await store.appendFuryPlanReviewEvidenceIfAbsentV1({
      repositoryRoot: ${JSON.stringify(repositoryRoot)},
      missionId: ${JSON.stringify(missionId)},
      lockOwnerId: "owner:release-fault",
      evidence: ${JSON.stringify(record)},
    });
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module", "-e", script], {
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "recovery_required");
});

test("lock marker drift overrides a durable append with recovery_required", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-fury-evidence-marker-drift-"));
  const record = evidence();
  const testFile = fileURLToPath(import.meta.url);
  const storePath = resolve(dirname(testFile), "..", "dist", "fury-plan-review-evidence-store.mjs");
  const script = `
    import { constants } from "node:fs";
    import { mock } from "node:test";
    import * as realFs from "node:fs/promises";
    import { pathToFileURL } from "node:url";
    mock.module("node:fs/promises", { namedExports: {
      ...realFs,
      open: async (path, flags, mode) => {
        const handle = await realFs.open(path, flags, mode);
        if (String(path).endsWith(".lock") && !(flags & constants.O_WRONLY) && !(flags & constants.O_RDWR)) {
          return {
            stat: (...args) => handle.stat(...args),
            readFile: async (...args) => String(await handle.readFile(...args)) + "drift",
            close: (...args) => handle.close(...args),
          };
        }
        return handle;
      },
    }});
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href + "?marker-drift");
    const result = await store.appendFuryPlanReviewEvidenceIfAbsentV1({
      repositoryRoot: ${JSON.stringify(repositoryRoot)},
      missionId: ${JSON.stringify(missionId)},
      lockOwnerId: "owner:marker-drift",
      evidence: ${JSON.stringify(record)},
    });
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module", "-e", script], {
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "recovery_required");
});

test("durability and replacement fault points never report success", async () => {
  const testFile = fileURLToPath(import.meta.url);
  const storePath = resolve(dirname(testFile), "..", "dist", "fury-plan-review-evidence-store.mjs");
  const record = evidence();
  for (const scenario of [
    "lock-short-write",
    "lock-file-sync",
    "append-short-write",
    "append-file-sync",
    "readback-drift",
    "shield-parent-sync",
    "audit-parent-sync",
    "review-parent-sync",
    "lock-replacement",
  ]) {
    const repositoryRoot = await mkdtemp(join(tmpdir(), `shield-fury-evidence-${scenario}-`));
    const script = `
      import { constants } from "node:fs";
      import { mock } from "node:test";
      import * as realFs from "node:fs/promises";
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      const scenario = ${JSON.stringify(scenario)};
      const repositoryRoot = ${JSON.stringify(repositoryRoot)};
      const canonicalRoot = await realFs.realpath(repositoryRoot);
      let lockReadCount = 0;
      mock.module("node:fs/promises", { namedExports: {
        ...realFs,
        open: async (path, flags, mode) => {
          const handle = await realFs.open(path, flags, mode);
          const text = String(path);
          const writable = Boolean(flags & constants.O_WRONLY) || Boolean(flags & constants.O_RDWR);
          const parentSyncTarget = scenario === "shield-parent-sync" ? canonicalRoot
            : scenario === "audit-parent-sync" ? join(canonicalRoot, ".shield")
            : scenario === "review-parent-sync" ? join(canonicalRoot, ".shield", "audit")
            : null;
          if (parentSyncTarget === text && Boolean(flags & constants.O_DIRECTORY)) {
            return { sync: async () => { const error = new Error("fault"); error.code = "EIO"; throw error; }, close: (...args) => handle.close(...args) };
          }
          if (text.endsWith(".lock") && writable && scenario === "lock-short-write") {
            return {
              stat: (...args) => handle.stat(...args),
              write: async (...args) => { const value = await handle.write(...args); return { ...value, bytesWritten: Math.max(0, value.bytesWritten - 1) }; },
              sync: (...args) => handle.sync(...args),
              close: (...args) => handle.close(...args),
            };
          }
          if (text.endsWith(".lock") && writable && scenario === "lock-file-sync") {
            return {
              stat: (...args) => handle.stat(...args),
              write: (...args) => handle.write(...args),
              sync: async () => { const error = new Error("fault"); error.code = "EIO"; throw error; },
              close: (...args) => handle.close(...args),
            };
          }
          if (text.endsWith(".jsonl") && writable && scenario === "append-short-write") {
            return {
              stat: (...args) => handle.stat(...args),
              write: async (...args) => { const value = await handle.write(...args); return { ...value, bytesWritten: Math.max(0, value.bytesWritten - 1) }; },
              sync: (...args) => handle.sync(...args),
              close: (...args) => handle.close(...args),
            };
          }
          if (text.endsWith(".jsonl") && writable && scenario === "append-file-sync") {
            return {
              stat: (...args) => handle.stat(...args),
              write: (...args) => handle.write(...args),
              sync: async () => { const error = new Error("fault"); error.code = "EIO"; throw error; },
              close: (...args) => handle.close(...args),
            };
          }
          if (text.endsWith(".jsonl") && !writable && scenario === "readback-drift") {
            return {
              stat: (...args) => handle.stat(...args),
              readFile: async (...args) => String(await handle.readFile(...args)) + "drift",
              close: (...args) => handle.close(...args),
            };
          }
          if (text.endsWith(".lock") && !writable && scenario === "lock-replacement") {
            lockReadCount += 1;
            return {
              stat: async (...args) => {
                const stats = await handle.stat(...args);
                return lockReadCount >= 2 ? { ...stats, ino: Number(stats.ino) + 1 } : stats;
              },
              readFile: (...args) => handle.readFile(...args),
              close: (...args) => handle.close(...args),
            };
          }
          return handle;
        },
      }});
      const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href + "?" + scenario);
      const result = await store.appendFuryPlanReviewEvidenceIfAbsentV1({
        repositoryRoot,
        missionId: ${JSON.stringify(missionId)},
        lockOwnerId: "owner:fault",
        evidence: ${JSON.stringify(record)},
      });
      process.stdout.write(JSON.stringify(result));
    `;
    const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module", "-e", script], {
      encoding: "utf8",
    });
    assert.equal(child.status, 0, `${scenario}: ${child.stderr}`);
    const result = JSON.parse(child.stdout);
    assert.equal(result.state, "invalid", scenario);
    assert.equal(result.code, "recovery_required", scenario);
  }
});
