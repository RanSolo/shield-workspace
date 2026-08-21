import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendSeatDispatchReceiptEntryV1,
} from "../dist/seat-dispatch-store.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";
import * as relayStoreModule from "../scripts/operations/feature-flight-relay-store.mjs";
import {
  FEATURE_FLIGHT_RELAY_HILL_INBOX_DIRECTORY,
  appendFeatureFlightRelayFromSeatDispatchIfAbsentV1,
  deliverFeatureFlightRelayToHillInboxV1,
  deriveFeatureFlightRelayStorePathsV1,
  readFeatureFlightRelayLogV1,
} from "../scripts/operations/feature-flight-relay-store.mjs";
import {
  FEATURE_FLIGHT_RELAY_REQUESTED_OBSERVATION,
  canonicalFeatureFlightRelayBytesV1,
  createFeatureFlightRelayDeliveryReceiptV1,
  createFeatureFlightRelayV1,
} from "../scripts/operations/feature-flight-relay.mjs";

const REPOSITORY_ID = "repo:shield-workspace";
const WORKSPACE_ID = "workspace:issue-248";
const REVISION = "8".repeat(40);

function identity(index = 1, overrides = {}) {
  return {
    receiptId: `receipt:248:${index}`,
    dispatchId: `dispatch:248:${index}`,
    parentMissionId: "mission:issue-248-slice-1",
    parentMissionRevision: REVISION,
    parentSessionId: "session:248:parent",
    childTaskId: `task:248:${index}`,
    childSessionId: `session:248:${index}`,
    accountableSeatId: "may",
    repositoryId: REPOSITORY_ID,
    repositoryWorkspaceId: WORKSPACE_ID,
    repositoryRevision: REVISION,
    subjectId: "issue:248",
    subjectRevision: REVISION,
    artifactId: `artifact:248:slice-1:${index}`,
    artifactRevision: REVISION,
    configuredRuntime: { kind: "runtime.configured", runtimeId: "runtime:codex", model: "model:gpt-5" },
    requestedRuntime: { kind: "runtime.requested", runtimeId: "runtime:codex", model: "model:gpt-5" },
    toolExecution: { kind: "tool.execution.not_requested", reason: "not_requested" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: { kind: "runtime.host_observed.unavailable", reason: "unobserved" },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: { kind: "executor.host_observed.unavailable", reason: "not_observed" },
    ...overrides,
  };
}

function started(index, logSequence, previousLogDigest) {
  return createSeatDispatchStartedEventV1({
    ...identity(index),
    inputEvidenceRefs: [`evidence:wheels-up:248:${index}`],
    timestamp: new Date(Date.UTC(2026, 7, 20, 12, 0, logSequence)).toISOString(),
    logSequence,
    previousLogDigest,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
}

function terminal(previous, kind = "dispatch.completed") {
  return createSeatDispatchLifecycleEventV1({
    ...identity(Number(previous.receiptId.split(":").at(-1)), {
      receiptId: previous.receiptId,
      dispatchId: previous.dispatchId,
      childTaskId: previous.childTaskId,
      childSessionId: previous.childSessionId,
      artifactId: previous.artifactId,
    }),
    kind,
    outputEvidenceRefs: [`evidence:terminal:248:${previous.receiptId}`],
    timestamp: new Date(Date.parse(previous.timestamp) + 1000).toISOString(),
    logSequence: previous.logSequence + 1,
    previousLogDigest: previous.entryDigest,
    lifecycleSequence: 1,
    previousLifecycleDigest: previous.entryDigest,
  });
}

async function appendReceipt(repositoryRoot, event) {
  const result = await appendSeatDispatchReceiptEntryV1({
    repositoryRoot,
    repositoryId: REPOSITORY_ID,
    repositoryWorkspaceId: WORKSPACE_ID,
    event,
    lockOwnerId: `receipt-owner:${event.logSequence}`,
  });
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result;
}

function appendInput(root, terminalEvent, overrides = {}) {
  return {
    root,
    excludedRoots: [],
    lockOwnerId: "owner:may:issue-248",
    repositoryRoot: root,
    receiptId: terminalEvent.receiptId,
    dispatchId: terminalEvent.dispatchId,
    parentMissionId: terminalEvent.parentMissionId,
    parentMissionRevision: terminalEvent.parentMissionRevision,
    parentSessionId: terminalEvent.parentSessionId,
    childTaskId: terminalEvent.childTaskId,
    childSessionId: terminalEvent.childSessionId,
    sourceAccountableSeatId: terminalEvent.accountableSeatId,
    repositoryId: terminalEvent.repositoryId,
    repositoryWorkspaceId: terminalEvent.repositoryWorkspaceId,
    repositoryRevision: terminalEvent.repositoryRevision,
    subjectId: terminalEvent.subjectId,
    subjectRevision: terminalEvent.subjectRevision,
    artifactId: terminalEvent.artifactId,
    artifactRevision: terminalEvent.artifactRevision,
    recipientSeatId: "hill",
    recipientLaneId: "lane:issue-248",
    recipientControllerIdentity: "controller:hill:issue-248",
    requestedObservation: FEATURE_FLIGHT_RELAY_REQUESTED_OBSERVATION,
    ...overrides,
  };
}

async function addDispatch(record, index = record.terminals.length + 1, kind = "dispatch.completed") {
  const previous = record.receiptEntries.at(-1)?.entryDigest ?? null;
  const start = started(index, record.receiptEntries.length, previous);
  const end = terminal(start, kind);
  await appendReceipt(record.root, start);
  await appendReceipt(record.root, end);
  record.receiptEntries.push(start, end);
  record.terminals.push(end);
  return end;
}

async function fixture(kind = "dispatch.completed") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield-relay-store-")));
  await chmod(root, 0o700);
  const record = {
    root,
    receiptEntries: [],
    terminals: [],
    scope: { root, excludedRoots: [], repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID },
  };
  await addDispatch(record, 1, kind);
  return record;
}

const sourceAppend = (record, terminalEvent = record.terminals.at(-1), overrides = {}, injected = {}) =>
  appendFeatureFlightRelayFromSeatDispatchIfAbsentV1(appendInput(record.root, terminalEvent, overrides), injected);
const deliveryInput = (record, pending, overrides = {}) => ({
  root: record.root,
  excludedRoots: [],
  lockOwnerId: "owner:may:issue-248:delivery",
  repositoryId: pending.relay.source.repositoryId,
  repositoryWorkspaceId: pending.relay.source.repositoryWorkspaceId,
  repositoryRevision: pending.relay.source.repositoryRevision,
  relayId: pending.relayId,
  relayDigest: pending.relayDigest,
  recipient: pending.relay.recipient,
  ...overrides,
});
const deliver = (record, pending, overrides = {}, injected = {}) =>
  deliverFeatureFlightRelayToHillInboxV1(deliveryInput(record, pending, overrides), injected);
const pathIsWrite = (flags) => typeof flags === "number" && (flags & fsConstants.O_WRONLY) === fsConstants.O_WRONLY;
const injectedOpen = (decorate) => ({
  async open(path, flags, mode) {
    const handle = await open(path, flags, mode);
    await decorate(path, flags, handle, mode);
    return handle;
  },
});

test("derives from the durable terminal receipt and creates one confined ledger plus monotonic witness", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const paths = deriveFeatureFlightRelayStorePathsV1({ root: record.root, repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID });
  const first = await sourceAppend(record);
  assert.equal(first.state, "valid", first.errors?.join(" "));
  assert.equal(first.value.status, "appended");
  assert.equal(first.value.entry.relay.terminal.entryDigest, record.terminals[0].entryDigest);
  assert.deepEqual(first.value.log.paths, paths);
  assert.equal(first.value.log.witness.entries.length, 1);
  assert.equal(first.value.log.witness.head.relayHeadDigest, first.value.entry.entryDigest);

  const bytes = await readFile(paths.logPath);
  assert.deepEqual(bytes, Buffer.concat([canonicalFeatureFlightRelayBytesV1(first.value.entry), Buffer.from("\n")]));
  for (const path of [paths.directory, paths.witnessDirectory]) assert.equal((await lstat(path)).mode & 0o777, 0o700);
  for (const path of [paths.logPath, paths.witnessPath]) assert.equal((await lstat(path)).mode & 0o777, 0o600);

  const restarted = await readFeatureFlightRelayLogV1(record.scope);
  assert.equal(restarted.state, "valid", restarted.errors?.join(" "));
  assert.equal(restarted.value.replay.inspection.pending[0].nextAction, "await_delivery_binding");
  assert.deepEqual(restarted.value.bytes, bytes);
});

test("exact retry is byte-stable and conflicting recipient reuse fails closed", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const first = await sourceAppend(record);
  const retry = await sourceAppend(record);
  assert.equal(first.state, "valid");
  assert.equal(retry.state, "valid");
  assert.equal(retry.value.status, "duplicate");
  assert.deepEqual(retry.value.log.bytes, first.value.log.bytes);

  const conflict = await sourceAppend(record, record.terminals[0], { recipientControllerIdentity: "controller:hill:other" });
  assert.equal(conflict.code, "source_conflict");
  assert.deepEqual((await readFeatureFlightRelayLogV1(record.scope)).value.bytes, first.value.log.bytes);
});

test("replays global relay and monotonic witness chains", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const first = await sourceAppend(record);
  const secondTerminal = await addDispatch(record);
  const second = await sourceAppend(record, secondTerminal);
  assert.equal(second.state, "valid", second.errors?.join(" "));
  assert.equal(second.value.entry.logSequence, 1);
  assert.equal(second.value.entry.previousLogDigest, first.value.entry.entryDigest);
  assert.equal(second.value.log.replay.inspection.pending.length, 2);
  assert.equal(second.value.log.witness.entries.length, 2);
  assert.equal(second.value.log.witness.entries[1].previousWitnessDigest, second.value.log.witness.entries[0].witnessDigest);
  assert.equal(second.value.log.witness.head.relayHeadDigest, second.value.entry.entryDigest);
});

test("delivers one pending relay through a confined create-once Hill inbox receipt and appends lifecycle witness", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const pendingResult = await sourceAppend(record);
  const pending = pendingResult.value.entry;
  const pendingBytes = Buffer.from(pendingResult.value.log.bytes);
  let receiptOpen;
  const injected = injectedOpen(async (path, flags, _handle, mode) => {
    if (path.includes(FEATURE_FLIGHT_RELAY_HILL_INBOX_DIRECTORY) && path.endsWith(".json") && pathIsWrite(flags)) {
      receiptOpen = { path, flags, mode };
    }
  });

  const delivered = await deliver(record, pending, {}, injected);
  assert.equal(delivered.state, "valid", delivered.errors?.join(" "));
  assert.equal(delivered.value.status, "delivered");
  assert.equal(delivered.value.appended, true);
  assert.equal(delivered.value.entry.kind, "relay.delivered");
  assert.equal(delivered.value.entry.authority, "none");
  assert.deepEqual(delivered.value.entry.deliveryReceipt, delivered.value.deliveryReceipt);
  assert.equal(delivered.value.receiptPath, receiptOpen.path);
  assert.equal(receiptOpen.mode, 0o600);
  assert.equal(receiptOpen.flags & fsConstants.O_EXCL, fsConstants.O_EXCL);
  if (fsConstants.O_NOFOLLOW !== undefined) {
    assert.equal(receiptOpen.flags & fsConstants.O_NOFOLLOW, fsConstants.O_NOFOLLOW);
  }

  const paths = delivered.value.log.paths;
  assert.equal(paths.inboxDirectory, join(record.root, FEATURE_FLIGHT_RELAY_HILL_INBOX_DIRECTORY));
  assert.deepEqual(await readFile(delivered.value.receiptPath), canonicalFeatureFlightRelayBytesV1(delivered.value.deliveryReceipt));
  assert.deepEqual(delivered.value.log.bytes.subarray(0, pendingBytes.length), pendingBytes);
  assert.equal(delivered.value.log.entries.length, 2);
  assert.equal(delivered.value.log.witness.entries.length, 2);
  assert.equal(delivered.value.log.witness.head.relayHeadDigest, delivered.value.entry.entryDigest);
  assert.equal((await lstat(paths.inboxDirectory)).mode & 0o777, 0o700);
  assert.equal((await lstat(delivered.value.receiptPath)).mode & 0o777, 0o600);

  const restarted = await readFeatureFlightRelayLogV1(record.scope);
  assert.equal(restarted.state, "valid", restarted.errors?.join(" "));
  assert.equal(restarted.value.replay.inspection.pending.length, 0);
  assert.equal(restarted.value.replay.inspection.delivered[0].nextAction, "reread_authoritative_state_and_acknowledge");
  assert.equal(restarted.value.replay.inspection.delivered[0].authority, "none");
});

test("exact delivery retry queries the same receipt without another effect or lifecycle append", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const pending = (await sourceAppend(record)).value.entry;
  const first = await deliver(record, pending);
  assert.equal(first.state, "valid", first.errors?.join(" "));
  const receiptBefore = await lstat(first.value.receiptPath);
  const bytesBefore = await readFile(first.value.receiptPath);
  let writes = 0;
  const retry = await deliver(record, pending, {}, injectedOpen(async (_path, flags) => {
    if (pathIsWrite(flags)) writes += 1;
  }));
  assert.equal(retry.state, "valid", retry.errors?.join(" "));
  assert.equal(retry.value.status, "duplicate");
  assert.equal(retry.value.code, "duplicate");
  assert.equal(retry.value.appended, false);
  assert.equal(writes, 0);
  assert.equal(retry.value.entry.entryDigest, first.value.entry.entryDigest);
  assert.deepEqual(retry.value.deliveryReceipt, first.value.deliveryReceipt);
  assert.deepEqual(await readFile(first.value.receiptPath), bytesBefore);
  const receiptAfter = await lstat(first.value.receiptPath);
  assert.equal(receiptAfter.dev, receiptBefore.dev);
  assert.equal(receiptAfter.ino, receiptBefore.ino);
  assert.equal((await readFeatureFlightRelayLogV1(record.scope)).value.entries.length, 2);
});

test("restart reconciles a durable receipt after a crash before delivered lifecycle append", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const pending = (await sourceAppend(record)).value.entry;
  const paths = deriveFeatureFlightRelayStorePathsV1({
    root: record.root,
    repositoryId: REPOSITORY_ID,
    repositoryWorkspaceId: WORKSPACE_ID,
  });
  let failed = false;
  const injected = injectedOpen(async (path, flags, handle) => {
    if (!failed && path === paths.logPath && pathIsWrite(flags)) {
      failed = true;
      handle.write = async () => { const error = new Error("crash before lifecycle append"); error.code = "EIO"; throw error; };
    }
  });
  const crashed = await deliver(record, pending, {}, injected);
  assert.equal(crashed.code, "recovery_required");
  assert.equal((await readFeatureFlightRelayLogV1(record.scope)).value.entries.length, 1);
  assert.equal((await readdir(paths.inboxDirectory)).length, 1);

  const restarted = await deliver(record, pending);
  assert.equal(restarted.state, "valid", restarted.errors?.join(" "));
  assert.equal(restarted.value.status, "delivered");
  assert.equal(restarted.value.log.entries.length, 2);
  assert.equal(restarted.value.log.witness.entries.length, 2);
  assert.equal((await deliver(record, pending)).value.status, "duplicate");
});

test("delivery result precedence binds exact relay, source, and every recipient field", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const pending = (await sourceAppend(record)).value.entry;

  assert.equal((await deliver(record, pending, { repositoryId: "repo:other" })).code, "relay_missing");
  assert.equal((await deliver(record, pending, { relayDigest: "sha256:" + "A".repeat(43) })).code, "conflicting_reuse");
  assert.equal((await deliver(record, pending, { repositoryRevision: "5".repeat(40) })).code, "source_stale");
  for (const [field, value] of [["seatId", "may"], ["laneId", "lane:other"], ["controllerIdentity", "controller:other"]]) {
    const result = await deliver(record, pending, { recipient: { ...pending.relay.recipient, [field]: value } });
    assert.equal(result.code, "recipient_mismatch", field);
  }
  assert.equal((await deliverFeatureFlightRelayToHillInboxV1({ ...deliveryInput(record, pending), unknown: true })).code, "malformed_input");
  await assert.rejects(lstat(join(record.root, FEATURE_FLIGHT_RELAY_HILL_INBOX_DIRECTORY)), { code: "ENOENT" });

  const delivered = await deliver(record, pending);
  await unlink(delivered.value.receiptPath);
  assert.equal((await deliver(record, pending)).code, "delivery_missing");
});

test("valid but non-exact receipt reuse is delivery_stale", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const firstPending = (await sourceAppend(record)).value.entry;
  const first = await deliver(record, firstPending);
  const secondTerminal = await addDispatch(record);
  const secondPending = (await sourceAppend(record, secondTerminal)).value.entry;
  const otherReceipt = createFeatureFlightRelayDeliveryReceiptV1({ relay: secondPending.relay });
  await unlink(first.value.receiptPath);
  await writeFile(first.value.receiptPath, canonicalFeatureFlightRelayBytesV1(otherReceipt), { mode: 0o600 });
  assert.equal((await deliver(record, firstPending)).code, "delivery_stale");
});

test("persisted receipt source disagreement is source_stale", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const pending = (await sourceAppend(record)).value.entry;
  const delivered = await deliver(record, pending);
  const staleRelay = createFeatureFlightRelayV1({
    source: { ...pending.relay.source, repositoryRevision: "5".repeat(40) },
    terminal: pending.relay.terminal,
    recipient: pending.relay.recipient,
    requestedObservation: pending.relay.requestedObservation,
  });
  const staleReceipt = createFeatureFlightRelayDeliveryReceiptV1({ relay: staleRelay });
  await unlink(delivered.value.receiptPath);
  await writeFile(delivered.value.receiptPath, canonicalFeatureFlightRelayBytesV1(staleReceipt), { mode: 0o600 });
  assert.equal((await deliver(record, pending)).code, "source_stale");
});

test("inbox symlinks, aliases, unsafe modes, and inode replacement require recovery", async (t) => {
  await t.test("inbox directory symlink", async () => {
    const record = await fixture();
    t.after(() => rm(record.root, { recursive: true, force: true }));
    const pending = (await sourceAppend(record)).value.entry;
    const outside = await realpath(await mkdtemp(join(tmpdir(), "shield-relay-inbox-outside-")));
    await chmod(outside, 0o700);
    t.after(() => rm(outside, { recursive: true, force: true }));
    await symlink(outside, join(record.root, FEATURE_FLIGHT_RELAY_HILL_INBOX_DIRECTORY), "dir");
    assert.equal((await deliver(record, pending)).code, "recovery_required");
  });

  for (const target of ["receipt-hardlink", "receipt-mode", "receipt-inode-replacement"]) {
    await t.test(target, async () => {
      const record = await fixture();
      t.after(() => rm(record.root, { recursive: true, force: true }));
      const pending = (await sourceAppend(record)).value.entry;
      const delivered = await deliver(record, pending);
      const path = delivered.value.receiptPath;
      if (target === "receipt-hardlink") {
        await link(path, join(record.root, "receipt-alias"));
        assert.equal((await deliver(record, pending)).code, "recovery_required");
      } else if (target === "receipt-mode") {
        await chmod(path, 0o644);
        assert.equal((await deliver(record, pending)).code, "recovery_required");
      } else {
        let replaced = false;
        const injected = injectedOpen(async (openedPath, flags, handle) => {
          if (!replaced && openedPath === path && !pathIsWrite(flags)) {
            replaced = true;
            const original = handle.readFile.bind(handle);
            handle.readFile = async (...args) => {
              const bytes = await original(...args);
              await unlink(path);
              await writeFile(path, bytes, { mode: 0o600 });
              return bytes;
            };
          }
        });
        assert.equal((await deliver(record, pending, {}, injected)).code, "recovery_required");
      }
    });
  }
});

test("receipt provider and delivered lifecycle faults never report delivery success", async (t) => {
  for (const fault of ["receipt-partial", "receipt-sync", "receipt-close", "receipt-readback", "lifecycle-sync", "witness-sync"]) {
    await t.test(fault, async () => {
      const record = await fixture();
      t.after(() => rm(record.root, { recursive: true, force: true }));
      const pending = (await sourceAppend(record)).value.entry;
      const paths = deriveFeatureFlightRelayStorePathsV1({
        root: record.root,
        repositoryId: REPOSITORY_ID,
        repositoryWorkspaceId: WORKSPACE_ID,
      });
      let changed = false;
      const injected = injectedOpen(async (path, flags, handle) => {
        const receiptPath = path.startsWith(paths.inboxDirectory + "/") && path.endsWith(".json");
        if (receiptPath && pathIsWrite(flags)) {
          if (fault === "receipt-partial") {
            const original = handle.write.bind(handle);
            handle.write = async (...args) => {
              const result = await original(...args);
              return { ...result, bytesWritten: result.bytesWritten - 1 };
            };
          }
          if (fault === "receipt-sync") handle.sync = async () => { const error = new Error("sync fault"); error.code = "EIO"; throw error; };
          if (fault === "receipt-close") {
            const original = handle.close.bind(handle);
            handle.close = async () => { await original(); throw new Error("close fault"); };
          }
        } else if (receiptPath && fault === "receipt-readback" && !changed) {
          changed = true;
          const original = handle.readFile.bind(handle);
          handle.readFile = async (...args) => Buffer.from((await original(...args)).toString("utf8").replace("delivery-receipt", "delivery-receipx"));
        } else if (path === paths.logPath && pathIsWrite(flags) && fault === "lifecycle-sync") {
          handle.sync = async () => { const error = new Error("sync fault"); error.code = "EIO"; throw error; };
        } else if (path === paths.witnessPath && pathIsWrite(flags) && fault === "witness-sync") {
          handle.sync = async () => { const error = new Error("sync fault"); error.code = "EIO"; throw error; };
        }
      });
      const result = await deliver(record, pending, {}, injected);
      assert.equal(result.state, "invalid", fault);
      assert.equal(result.code, "recovery_required", fault);
      const restarted = await readFeatureFlightRelayLogV1(record.scope);
      if (fault === "lifecycle-sync") {
        assert.equal(restarted.code, "recovery_required");
      } else if (fault === "witness-sync") {
        assert.equal(restarted.state, "valid", restarted.errors?.join(" "));
        assert.equal(restarted.value.entries.length, 2);
      } else {
        assert.equal(restarted.state, "valid", restarted.errors?.join(" "));
        assert.equal((await deliver(record, pending)).state, "valid");
      }
    });
  }
});

test("fabricated terminal input and caller-fabricated mutation APIs cannot mutate", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const paths = deriveFeatureFlightRelayStorePathsV1({ root: record.root, repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID });
  const fabricated = await sourceAppend(record, record.terminals[0], {
    terminal: { kind: "dispatch.completed", entryDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
  });
  assert.equal(fabricated.code, "malformed_input");
  await assert.rejects(lstat(paths.directory), { code: "ENOENT" });
  await assert.rejects(lstat(paths.witnessDirectory), { code: "ENOENT" });
  assert.equal(relayStoreModule.appendFeatureFlightRelayEntryIfAbsentV1, undefined);
  assert.equal(relayStoreModule.appendFeatureFlightRelaySourceIfAbsentV1, undefined);
  assert.equal(relayStoreModule.createFeatureFlightRelayFilesystemStore, undefined);
});

test("serializes concurrent create-once claims without duplicate relay meaning", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  let releaseSync;
  const release = new Promise((resolve) => { releaseSync = resolve; });
  let signal;
  const acquired = new Promise((resolve) => { signal = resolve; });
  let delayed = false;
  const injected = injectedOpen(async (path, flags, handle) => {
    if (!delayed && path.endsWith(".lock") && pathIsWrite(flags)) {
      delayed = true;
      const original = handle.sync.bind(handle);
      handle.sync = async () => { await original(); signal(); await release; };
    }
  });
  const firstPromise = sourceAppend(record, record.terminals[0], {}, injected);
  await acquired;
  const concurrent = await sourceAppend(record);
  assert.equal(concurrent.code, "relay_lock_held");
  releaseSync();
  assert.equal((await firstPromise).state, "valid");
  assert.equal((await sourceAppend(record)).value.status, "duplicate");
  assert.equal((await readFeatureFlightRelayLogV1(record.scope)).value.entries.length, 1);
});

test("ledger and witness write uncertainty never reports success", async (t) => {
  for (const fault of ["ledger-partial", "ledger-sync", "ledger-close", "ledger-readback", "witness-sync"]) {
    await t.test(fault, async () => {
      const record = await fixture();
      t.after(() => rm(record.root, { recursive: true, force: true }));
      const paths = deriveFeatureFlightRelayStorePathsV1({ root: record.root, repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID });
      let changed = false;
      const injected = injectedOpen(async (path, flags, handle) => {
        if (path === paths.logPath && pathIsWrite(flags)) {
          if (fault === "ledger-partial") {
            const original = handle.write.bind(handle);
            handle.write = async (...args) => { const result = await original(...args); return { ...result, bytesWritten: result.bytesWritten - 1 }; };
          }
          if (fault === "ledger-sync") handle.sync = async () => { const error = new Error("sync fault"); error.code = "EIO"; throw error; };
          if (fault === "ledger-close") {
            const original = handle.close.bind(handle);
            handle.close = async () => { await original(); throw new Error("close fault"); };
          }
        } else if (path === paths.logPath && fault === "ledger-readback" && !changed) {
          changed = true;
          const original = handle.readFile.bind(handle);
          handle.readFile = async (...args) => Buffer.from((await original(...args)).toString("utf8").replace("relay.pending", "relay.pendinx"));
        } else if (path === paths.witnessPath && pathIsWrite(flags) && fault === "witness-sync") {
          handle.sync = async () => { const error = new Error("witness sync fault"); error.code = "EIO"; throw error; };
        }
      });
      const result = await sourceAppend(record, record.terminals[0], {}, injected);
      assert.equal(result.state, "invalid");
      assert.equal(result.code, "recovery_required");
      const restarted = await readFeatureFlightRelayLogV1(record.scope);
      if (fault === "witness-sync") {
        assert.equal(restarted.state, "valid", restarted.errors?.join(" "));
        assert.equal(restarted.value.entries.length, 1);
      } else {
        assert.equal(restarted.code, "recovery_required");
      }
    });
  }
});

test("initialized scope detects ledger deletion, directory deletion, and valid-prefix rollback", async (t) => {
  await t.test("ledger deletion", async () => {
    const record = await fixture();
    t.after(() => rm(record.root, { recursive: true, force: true }));
    const first = await sourceAppend(record);
    await unlink(first.value.log.paths.logPath);
    assert.equal((await readFeatureFlightRelayLogV1(record.scope)).code, "recovery_required");
  });

  await t.test("directory deletion", async () => {
    const record = await fixture();
    t.after(() => rm(record.root, { recursive: true, force: true }));
    const first = await sourceAppend(record);
    await rm(first.value.log.paths.directory, { recursive: true });
    assert.equal((await readFeatureFlightRelayLogV1(record.scope)).code, "recovery_required");
  });

  await t.test("valid-prefix rollback", async () => {
    const record = await fixture();
    t.after(() => rm(record.root, { recursive: true, force: true }));
    const first = await sourceAppend(record);
    const secondTerminal = await addDispatch(record);
    const second = await sourceAppend(record, secondTerminal);
    assert.equal(second.state, "valid");
    await writeFile(second.value.log.paths.logPath, first.value.log.bytes, { mode: 0o600 });
    assert.equal((await readFeatureFlightRelayLogV1(record.scope)).code, "recovery_required");
  });
});

test("partial durable tails and initialized marker rollback fail closed", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const first = await sourceAppend(record);
  const paths = first.value.log.paths;
  await writeFile(paths.logPath, Buffer.concat([first.value.log.bytes, Buffer.from("{")]));
  assert.equal((await readFeatureFlightRelayLogV1(record.scope)).code, "recovery_required");

  await rm(paths.directory, { recursive: true });
  await unlink(paths.witnessPath);
  assert.equal((await readFeatureFlightRelayLogV1(record.scope)).code, "recovery_required");
});

test("rejects symlinks, aliases, unsafe modes, inode replacement, and excluded roots", async (t) => {
  await t.test("symlink root", async () => {
    const target = await realpath(await mkdtemp(join(tmpdir(), "shield-relay-target-")));
    await chmod(target, 0o700);
    const parent = await mkdtemp(join(tmpdir(), "shield-relay-link-"));
    const linked = join(parent, "linked");
    await symlink(target, linked, "dir");
    t.after(() => Promise.all([rm(target, { recursive: true, force: true }), rm(parent, { recursive: true, force: true })]));
    assert.equal((await readFeatureFlightRelayLogV1({ root: linked, excludedRoots: [], repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID })).code, "unsafe_path");
  });

  for (const target of ["directory", "log", "lock", "hardlink", "mode"]) {
    await t.test(target, async () => {
      const record = await fixture();
      t.after(() => rm(record.root, { recursive: true, force: true }));
      const paths = deriveFeatureFlightRelayStorePathsV1({ root: record.root, repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID });
      if (target === "directory") {
        const outside = await realpath(await mkdtemp(join(tmpdir(), "shield-relay-dir-")));
        await chmod(outside, 0o700);
        t.after(() => rm(outside, { recursive: true, force: true }));
        await symlink(outside, paths.directory, "dir");
      } else if (["hardlink", "mode"].includes(target)) {
        await sourceAppend(record);
        if (target === "hardlink") await link(paths.logPath, join(record.root, "ledger-alias"));
        else await chmod(paths.logPath, 0o644);
      } else {
        await mkdir(paths.witnessDirectory, { mode: 0o700 });
        if (target === "log") {
          await mkdir(paths.directory, { mode: 0o700 });
          await symlink(join(record.root, "outside-log"), paths.logPath);
        } else {
          await symlink(join(record.root, "outside-lock"), paths.lockPath);
        }
      }
      const result = ["directory", "lock"].includes(target) ? await sourceAppend(record) : await readFeatureFlightRelayLogV1(record.scope);
      assert.equal(result.code, "unsafe_path");
    });
  }

  await t.test("inode replacement", async () => {
    const record = await fixture();
    t.after(() => rm(record.root, { recursive: true, force: true }));
    const first = await sourceAppend(record);
    const path = first.value.log.paths.logPath;
    let replaced = false;
    const injected = injectedOpen(async (openedPath, flags, handle) => {
      if (!replaced && openedPath === path && !pathIsWrite(flags)) {
        replaced = true;
        const original = handle.readFile.bind(handle);
        handle.readFile = async (...args) => {
          const bytes = await original(...args);
          await unlink(path);
          await writeFile(path, bytes, { mode: 0o600 });
          return bytes;
        };
      }
    });
    assert.equal((await readFeatureFlightRelayLogV1(record.scope, injected)).code, "recovery_required");
  });

  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  assert.equal((await readFeatureFlightRelayLogV1({ ...record.scope, excludedRoots: [record.root] })).code, "unsafe_path");
});

test("hostile input is rejected before mutation", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  assert.equal((await readFeatureFlightRelayLogV1({ ...record.scope, authority: "none" })).code, "malformed_input");
  const sparse = [];
  sparse.length = 1;
  assert.equal((await readFeatureFlightRelayLogV1({ ...record.scope, excludedRoots: sparse })).code, "malformed_input");
  let accesses = 0;
  const accessor = appendInput(record.root, record.terminals[0]);
  Object.defineProperty(accessor, "repositoryId", { enumerable: true, get() { accesses += 1; return REPOSITORY_ID; } });
  assert.equal((await appendFeatureFlightRelayFromSeatDispatchIfAbsentV1(accessor)).code, "malformed_input");
  assert.equal(accesses, 0);
  assert.equal((await readFeatureFlightRelayLogV1(new Proxy(record.scope, {}))).code, "malformed_input");
});

test("directory replacement before append cannot redirect the store", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  await sourceAppend(record);
  const secondTerminal = await addDispatch(record);
  const paths = deriveFeatureFlightRelayStorePathsV1({ root: record.root, repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID });
  let replaced = false;
  const injected = injectedOpen(async (path, flags) => {
    if (!replaced && path.endsWith(".lock") && pathIsWrite(flags)) {
      replaced = true;
      await rename(paths.directory, paths.directory + ".retained");
      await mkdir(paths.directory, { mode: 0o700 });
    }
  });
  assert.equal((await sourceAppend(record, secondTerminal, {}, injected)).code, "recovery_required");
});
