import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
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
  FeatureFlightRelayStoreError,
  appendFeatureFlightRelayEntryIfAbsentV1,
  appendFeatureFlightRelaySourceIfAbsentV1,
  createFeatureFlightRelayFilesystemStore,
  deriveFeatureFlightRelayStorePathsV1,
  readFeatureFlightRelayLogV1,
} from "../scripts/operations/feature-flight-relay-store.mjs";
import {
  FEATURE_FLIGHT_RELAY_REQUESTED_OBSERVATION,
  canonicalFeatureFlightRelayBytesV1,
  createFeatureFlightRelayEntryV1,
  createFeatureFlightRelayV1,
  featureFlightRelayDigestV1,
} from "../scripts/operations/feature-flight-relay.mjs";

const REPOSITORY_ID = "repo:shield-workspace";
const WORKSPACE_ID = "workspace:issue-248";
const REVISION = "8".repeat(40);
const digest = (value) => featureFlightRelayDigestV1({ value }, "shield.test.feature-flight-relay-store.v1");

function relayInput(overrides = {}) {
  const source = {
    receiptId: "receipt:248:1",
    dispatchId: "dispatch:248:1",
    parentMissionId: "mission:issue-248-slice-1",
    parentMissionRevision: REVISION,
    parentSessionId: "session:248:parent",
    childTaskId: "task:248:may",
    childSessionId: "session:248:may",
    sourceAccountableSeatId: "may",
    repositoryId: REPOSITORY_ID,
    repositoryWorkspaceId: WORKSPACE_ID,
    repositoryRevision: REVISION,
    subjectId: "issue:248",
    subjectRevision: REVISION,
    artifactId: "artifact:248:slice-1",
    artifactRevision: REVISION,
    ...overrides.source,
  };
  return {
    source,
    terminal: {
      kind: "dispatch.completed",
      entryDigest: digest("terminal-entry"),
      logSequence: 7,
      lifecycleSequence: 1,
      ...overrides.terminal,
    },
    recipient: {
      seatId: "hill",
      laneId: "lane:issue-248",
      controllerIdentity: "controller:hill:issue-248",
      ...overrides.recipient,
    },
    requestedObservation: FEATURE_FLIGHT_RELAY_REQUESTED_OBSERVATION,
  };
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield-relay-store-")));
  await chmod(root, 0o700);
  const scope = { root, excludedRoots: [], repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID };
  return {
    root,
    scope,
    appendScope: { ...scope, lockOwnerId: "owner:may:issue-248" },
    relay: createFeatureFlightRelayV1(relayInput()),
  };
}

const sourceAppend = (record, injected = {}) => appendFeatureFlightRelaySourceIfAbsentV1({ ...record.appendScope, relay: record.relay }, injected);
const pathIsWrite = (flags) => typeof flags === "number" && (flags & fsConstants.O_WRONLY) === fsConstants.O_WRONLY;
const injectedOpen = (decorate) => ({
  async open(path, flags, mode) {
    const handle = await open(path, flags, mode);
    await decorate(path, flags, handle);
    return handle;
  },
});

test("creates one confined canonical ledger and replays pending after restart", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const paths = deriveFeatureFlightRelayStorePathsV1({ root: record.root, repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID });
  const first = await sourceAppend(record);
  assert.equal(first.state, "valid", first.errors?.join(" "));
  assert.equal(first.value.status, "appended");
  assert.equal(first.value.appended, true);
  assert.deepEqual(first.value.log.paths, paths);
  assert.equal(first.value.entry.kind, "relay.pending");
  assert.equal(first.value.entry.lifecycleSequence, 0);
  assert.equal(first.value.entry.previousLifecycleDigest, null);

  const bytes = await readFile(paths.logPath);
  assert.deepEqual(bytes, Buffer.concat([canonicalFeatureFlightRelayBytesV1(first.value.entry), Buffer.from("\n")]));
  assert.equal((await lstat(paths.directory)).mode & 0o777, 0o700);
  assert.equal((await lstat(paths.logPath)).mode & 0o777, 0o600);

  const restarted = await readFeatureFlightRelayLogV1(record.scope);
  assert.equal(restarted.state, "valid", restarted.errors?.join(" "));
  assert.equal(restarted.value.missing, false);
  assert.equal(restarted.value.replay.inspection.pending.length, 1);
  assert.equal(restarted.value.replay.inspection.pending[0].nextAction, "await_delivery_binding");
  assert.deepEqual(restarted.value.bytes, bytes);
});

test("exact retry is byte-stable and conflicting terminal identity reuse fails closed", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const first = await sourceAppend(record);
  const retry = await sourceAppend(record);
  assert.equal(first.state, "valid");
  assert.equal(retry.state, "valid");
  assert.equal(retry.value.status, "duplicate");
  assert.equal(retry.value.appended, false);
  assert.deepEqual(retry.value.log.bytes, first.value.log.bytes);

  const conflictRelay = createFeatureFlightRelayV1(relayInput({ recipient: { controllerIdentity: "controller:hill:other" } }));
  const conflict = await appendFeatureFlightRelaySourceIfAbsentV1({ ...record.appendScope, relay: conflictRelay });
  assert.equal(conflict.state, "invalid");
  assert.equal(conflict.code, "source_conflict");
  assert.deepEqual((await readFeatureFlightRelayLogV1(record.scope)).value.bytes, first.value.log.bytes);
});

test("replays a global digest chain while keeping one entry per relay lifecycle", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const first = await sourceAppend(record);
  const secondRelay = createFeatureFlightRelayV1(relayInput({
    source: { receiptId: "receipt:248:2", dispatchId: "dispatch:248:2", childTaskId: "task:248:mack", childSessionId: "session:248:mack" },
    terminal: { entryDigest: digest("terminal-entry-2"), logSequence: 9 },
  }));
  const second = await appendFeatureFlightRelaySourceIfAbsentV1({ ...record.appendScope, relay: secondRelay });
  assert.equal(second.state, "valid", second.errors?.join(" "));
  assert.equal(second.value.entry.logSequence, 1);
  assert.equal(second.value.entry.lifecycleSequence, 0);
  assert.equal(second.value.entry.previousLogDigest, first.value.entry.entryDigest);
  assert.equal(second.value.log.replay.inspection.pending.length, 2);

  const duplicateLifecycle = createFeatureFlightRelayEntryV1({
    logSequence: 2,
    previousLogDigest: second.value.entry.entryDigest,
    relay: record.relay,
  });
  const rejected = await appendFeatureFlightRelayEntryIfAbsentV1({ ...record.appendScope, entry: duplicateLifecycle });
  assert.equal(rejected.code, "conflicting_reuse");
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
  const firstPromise = sourceAppend(record, injected);
  await acquired;
  const concurrent = await sourceAppend(record);
  assert.equal(concurrent.code, "relay_lock_held");
  releaseSync();
  assert.equal((await firstPromise).state, "valid");
  assert.equal((await sourceAppend(record)).value.status, "duplicate");
  assert.equal((await readFeatureFlightRelayLogV1(record.scope)).value.entries.length, 1);
});

test("partial write, sync, close, and readback uncertainty never reports success", async (t) => {
  for (const fault of ["partial", "sync", "close", "readback"]) {
    await t.test(fault, async () => {
      const record = await fixture();
      t.after(() => rm(record.root, { recursive: true, force: true }));
      let logReads = 0;
      const injected = injectedOpen(async (path, flags, handle) => {
        if (!path.endsWith(".jsonl")) return;
        if (pathIsWrite(flags)) {
          if (fault === "partial") {
            const original = handle.write.bind(handle);
            handle.write = async (...args) => { const result = await original(...args); return { ...result, bytesWritten: result.bytesWritten - 1 }; };
          }
          if (fault === "sync") handle.sync = async () => { const error = new Error("sync fault"); error.code = "EIO"; throw error; };
          if (fault === "close") {
            const original = handle.close.bind(handle);
            handle.close = async () => { await original(); throw new Error("close fault"); };
          }
        } else if (fault === "readback") {
          const original = handle.readFile.bind(handle);
          handle.readFile = async (...args) => {
            const bytes = await original(...args);
            logReads += 1;
            return logReads === 1 ? Buffer.from(bytes.toString("utf8").replace("relay.pending", "relay.pendinx"), "utf8") : bytes;
          };
        }
      });
      const result = await sourceAppend(record, injected);
      assert.equal(result.state, "invalid");
      assert.equal(result.code, "recovery_required");
      const restart = await readFeatureFlightRelayLogV1(record.scope);
      assert.equal(restart.state, "valid", restart.errors?.join(" "));
      assert.equal(restart.value.entries.length, 1);
    });
  }
});

test("lock interruption, replacement, and release uncertainty are recovery-required", async (t) => {
  for (const fault of ["partial", "sync", "close", "replace", "release"]) {
    await t.test(fault, async () => {
      const record = await fixture();
      t.after(() => rm(record.root, { recursive: true, force: true }));
      let lockPath;
      const injected = {
        ...injectedOpen(async (path, flags, handle) => {
          if (!path.endsWith(".lock") || !pathIsWrite(flags)) return;
          lockPath = path;
          if (fault === "partial") {
            const original = handle.write.bind(handle);
            handle.write = async (...args) => { const result = await original(...args); return { ...result, bytesWritten: result.bytesWritten - 1 }; };
          }
          if (fault === "sync") handle.sync = async () => { const error = new Error("lock sync fault"); error.code = "EIO"; throw error; };
          if (fault === "close") {
            const original = handle.close.bind(handle);
            handle.close = async () => { await original(); throw new Error("lock close fault"); };
          }
          if (fault === "replace") {
            const original = handle.sync.bind(handle);
            handle.sync = async () => { await original(); await unlink(path); await writeFile(path, "foreign-lock\n", { mode: 0o600 }); };
          }
        }),
        async unlink(path) {
          if (fault === "release" && path === lockPath) { const error = new Error("release fault"); error.code = "EIO"; throw error; }
          return unlink(path);
        },
      };
      const result = await sourceAppend(record, injected);
      assert.equal(result.state, "invalid");
      assert.equal(result.code, "recovery_required");
      const read = await readFeatureFlightRelayLogV1(record.scope);
      assert.equal(read.state, "valid", read.errors?.join(" "));
      assert.equal(read.value.entries.length, fault === "release" ? 1 : 0);
      const paths = deriveFeatureFlightRelayStorePathsV1({ root: record.root, repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID });
      await rm(paths.lockPath, { force: true });
    });
  }
});

test("partial durable tails and rollback evidence fail closed", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const first = await sourceAppend(record);
  const paths = first.value.log.paths;
  await writeFile(paths.logPath, Buffer.concat([first.value.log.bytes, Buffer.from("{")]));
  const partial = await readFeatureFlightRelayLogV1(record.scope);
  assert.equal(partial.code, "relay_replay_invalid");

  await writeFile(paths.logPath, Buffer.from("", "utf8"));
  const rollback = await readFeatureFlightRelayLogV1(record.scope);
  assert.equal(rollback.code, "relay_replay_invalid");
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
      } else {
        await mkdir(paths.directory, { mode: 0o700 });
        if (target === "log") await symlink(join(record.root, "outside-log"), paths.logPath);
        if (target === "lock") await symlink(join(record.root, "outside-lock"), paths.lockPath);
        if (target === "hardlink" || target === "mode") {
          await sourceAppend(record);
          if (target === "hardlink") await link(paths.logPath, join(record.root, "ledger-alias"));
          else await chmod(paths.logPath, 0o644);
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

test("hostile input is rejected before mutation and facade preserves closed errors", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  assert.equal((await readFeatureFlightRelayLogV1({ ...record.scope, authority: "none" })).code, "malformed_input");
  const sparse = [];
  sparse.length = 1;
  assert.equal((await readFeatureFlightRelayLogV1({ ...record.scope, excludedRoots: sparse })).code, "malformed_input");
  let accesses = 0;
  const accessor = { ...record.appendScope, relay: record.relay };
  Object.defineProperty(accessor, "repositoryId", { enumerable: true, get() { accesses += 1; return REPOSITORY_ID; } });
  assert.equal((await appendFeatureFlightRelaySourceIfAbsentV1(accessor)).code, "malformed_input");
  assert.equal(accesses, 0);
  assert.equal((await readFeatureFlightRelayLogV1(new Proxy(record.scope, {}))).code, "malformed_input");

  const store = createFeatureFlightRelayFilesystemStore(record.appendScope);
  assert.equal((await store.read()).missing, true);
  assert.equal((await store.appendSource(record.relay)).status, "appended");
  assert.equal((await store.appendSource(record.relay)).status, "duplicate");
  const lockPath = deriveFeatureFlightRelayStorePathsV1({ root: record.root, repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID }).lockPath;
  await writeFile(lockPath, "held\n", { mode: 0o600 });
  await assert.rejects(store.appendSource(record.relay), (error) => error instanceof FeatureFlightRelayStoreError && error.code === "relay_lock_held");
});

test("directory replacement before append cannot redirect the store", async (t) => {
  const record = await fixture();
  t.after(() => rm(record.root, { recursive: true, force: true }));
  const paths = deriveFeatureFlightRelayStorePathsV1({ root: record.root, repositoryId: REPOSITORY_ID, repositoryWorkspaceId: WORKSPACE_ID });
  let replaced = false;
  const injected = injectedOpen(async (path, flags) => {
    if (!replaced && path.endsWith(".lock") && pathIsWrite(flags)) {
      replaced = true;
      await rename(paths.directory, `${paths.directory}.retained`);
      await mkdir(paths.directory, { mode: 0o700 });
    }
  });
  assert.equal((await sourceAppend(record, injected)).code, "recovery_required");
});
