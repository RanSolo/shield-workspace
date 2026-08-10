import assert from "node:assert/strict";
import { copyFile, link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rm } from "node:fs/promises";
import test from "node:test";

import {
  FEATURE_FLIGHT_MEASUREMENT_NAMESPACE,
  buildFeatureFlightMeasurementEnvelopeFromProjection,
  buildFeatureFlightMeasurementRecord,
  classifyFeatureFlightMeasurementPersistence,
  deriveFeatureFlightMeasurementPath,
  persistFeatureFlightMeasurement,
  readFeatureFlightMeasurement,
  validateFeatureFlightMeasurementRecord,
  writeFeatureFlightMeasurement,
} from "../scripts/operations/feature-flight-measurement.mjs";

const hash = (value) => value;
const sha = "a".repeat(64);
const measurementIntentId = "measurement:intent:one";

const timestampA = "2026-08-10T00:00:00.000Z";
const timestampB = "2026-08-10T00:00:00.500Z";

const makeFixtureRoot = async () => realpath(await mkdtemp(join(tmpdir(), "feature-flight-measurement-")));

const baseSnapshot = () => ({
  measurementIntentId,
  durableArtifactRoot: undefined,
  effectClaimId: "e".repeat(64),
  attemptDigest: "d".repeat(64),
  mission: "mission:feature-flight",
  subject: "subject:test",
  missionRevision: "f".repeat(64),
  repository: "RanSolo/shield-workspace",
  branch: "agent/delivery",
  headRevision: "b".repeat(40),
  plan: { path: "/plan.json", bytes: 32, sha256: hash("1".repeat(64)) },
  state: { path: "/state.json", bytes: 32, sha256: hash("2".repeat(64)) },
  predecessor: null,
  runnerInput: { path: "/input.json", bytes: 64, sha256: hash("3".repeat(64)) },
  fixture: { path: "/fixture.json", bytes: 64, sha256: hash("4".repeat(64)) },
  package: { path: "/package.json", bytes: 64, sha256: hash("5".repeat(64)) },
  authority: { type: "feature-flight", digest: hash("6".repeat(64)), gateEligible: false, sequence: 9, identity: { path: "/authority.json", bytes: 64, sha256: hash("7".repeat(64)) } },
  binding: { bindingId: "binding:test", runtime: "runtime:test", executor: "executor:test", seat: "seat:test", identity: { path: "/binding.json", bytes: 64, sha256: hash("8".repeat(64)) } },
  seat: "seat:test",
  adapter: "adapter:test",
  runtime: "runtime:test",
  model: "model:test",
  executor: "executor:test-2",
  commandStartAt: timestampA,
  commandCompletedAt: timestampB,
  packetByteCount: 64,
  packetDigest: hash("9".repeat(64)),
  processedInput: null,
  generatedOutput: null,
  reasoningToken: null,
  uniqueInjectedContext: null,
  contextChainPosition: null,
  hillAction: null,
  retryCount: null,
  correctionCount: null,
  interventionCount: null,
  cancellation: null,
  providerCounter: null,
});

const withNamespace = async (root) => {
  const measurementNamespace = join(root, FEATURE_FLIGHT_MEASUREMENT_NAMESPACE, "e".repeat(64));
  await mkdir(dirname(measurementNamespace), { recursive: true, mode: 0o700 });
  await mkdir(measurementNamespace, { mode: 0o700 });
  return measurementNamespace;
};

const measurementEnvelope = ({ root, projection }) => {
  const snapshot = baseSnapshot();
  snapshot.durableArtifactRoot = root;
  return buildFeatureFlightMeasurementEnvelopeFromProjection({
    projection,
    ...snapshot,
    snapshot,
  });
};

const measurementPath = ({ root }) => deriveFeatureFlightMeasurementPath({
  durableArtifactRoot: root,
  effectClaimId: "e".repeat(64),
  measurementIntentId,
});

test("measurement persistence classification follows exact durable-only table", () => {
  assert.equal(classifyFeatureFlightMeasurementPersistence({ outcome: "completed", durable: false }), "fresh");
  assert.equal(classifyFeatureFlightMeasurementPersistence({ outcome: "replayed", durable: false }), "replay");
  assert.equal(classifyFeatureFlightMeasurementPersistence({ outcome: "recovery_required", durable: true }), "recovery");
  assert.equal(classifyFeatureFlightMeasurementPersistence({ outcome: "stopped", durable: false }), null);
  assert.equal(classifyFeatureFlightMeasurementPersistence({ outcome: "recovery_required", durable: false }), null);
});

test("buildFeatureFlightMeasurementRecord and envelope validators enforce stable identity and no-authority contract", () => {
  const envelope = measurementEnvelope({
    root: "/repo",
    projection: { outcome: "completed", reason: "effect_completed", durable: false },
  });
  const record = buildFeatureFlightMeasurementRecord(envelope);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.authority, "none");
  assert.equal(record.gateEligible, false);
  assert.match(record.notice, /cannot authorize, review, complete, route, publish, or accept a mission/u);
  assert.equal(record.measurementIntentId, measurementIntentId);
  assert.deepEqual(validateFeatureFlightMeasurementRecord(record), []);
});

test("measurement envelope accepts the 40-hex Feature Flight Git HEAD shape", () => {
  const envelope = measurementEnvelope({
    root: "/repo",
    projection: { outcome: "completed", reason: "effect_completed", durable: false },
  });
  assert.equal(envelope.headRevision, "b".repeat(40));
  assert.throws(
    () => buildFeatureFlightMeasurementRecord({ ...envelope, headRevision: "b".repeat(64) }),
    /headRevision is malformed/u,
  );
});

test("write creates measurement once, then idempotently replays the same tuple", async () => {
  const root = await makeFixtureRoot();
  await withNamespace(root);
  const envelope = measurementEnvelope({
    root,
    projection: { outcome: "completed", reason: "effect_completed", durable: false },
  });
  const first = await writeFeatureFlightMeasurement(envelope);
  assert.equal(first.state, "created");
  const parsed = JSON.parse((await readFile(first.path, "utf8")));
  assert.equal(parsed.measurementIntentId, measurementIntentId);
  const second = await writeFeatureFlightMeasurement(envelope);
  assert.equal(second.state, "replayed");
  assert.equal(second.digest, first.digest);
});

test("writer securely provisions and durably syncs the fixed tree from an empty 0700 root", async () => {
  const root = await makeFixtureRoot();
  const envelope = measurementEnvelope({
    root,
    projection: { outcome: "completed", reason: "effect_completed", durable: true },
  });
  const handlePaths = new Map();
  const events = [];
  const result = await writeFeatureFlightMeasurement(envelope, {
    mkdir: async (path, options) => {
      events.push(`mkdir:${path}`);
      return mkdir(path, options);
    },
    open: async (...args) => {
      const handle = await open(...args);
      handlePaths.set(handle, args[0]);
      return handle;
    },
    sync: async (handle) => {
      events.push(`sync:${handlePaths.get(handle)}`);
      return handle.sync();
    },
    close: async (handle) => {
      events.push(`close:${handlePaths.get(handle)}`);
      return handle.close();
    },
  });
  assert.equal(result.state, "created");

  const shieldRoot = join(root, ".shield");
  const namespace = join(root, FEATURE_FLIGHT_MEASUREMENT_NAMESPACE);
  const effectDirectory = dirname(result.path);
  for (const path of [root, shieldRoot, namespace, effectDirectory]) {
    assert.equal((await lstat(path)).mode & 0o777, 0o700);
  }
  for (const [child, parent] of [[shieldRoot, root], [namespace, shieldRoot], [effectDirectory, namespace]]) {
    const createdAt = events.indexOf(`mkdir:${child}`);
    assert.ok(createdAt >= 0);
    assert.ok(events.indexOf(`sync:${parent}`, createdAt + 1) > createdAt);
  }
  const fileClosedAt = events.indexOf(`close:${result.path}`);
  assert.ok(fileClosedAt >= 0);
  assert.ok(events.indexOf(`sync:${effectDirectory}`, fileClosedAt + 1) > fileClosedAt);
});

test("writer fails closed before provisioning when O_NOFOLLOW is unavailable", async () => {
  const root = await makeFixtureRoot();
  const envelope = measurementEnvelope({
    root,
    projection: { outcome: "completed", reason: "effect_completed", durable: true },
  });
  const result = await writeFeatureFlightMeasurement(envelope, { noFollowFlag: undefined });
  assert.equal(result.state, "recovery_required");
  assert.match(result.reason, /O_NOFOLLOW is required/u);
  assert.deepEqual(await readdir(root), []);
  const readback = await readFeatureFlightMeasurement({
    path: measurementPath({ root }),
    snapshotDependencies: { noFollowFlag: undefined },
  });
  assert.equal(readback.state, "recovery_required");
  assert.match(readback.reason, /O_NOFOLLOW is required/u);
});

test("writer rejects retained namespace directories that are not mode 0700", async () => {
  const root = await makeFixtureRoot();
  const shieldRoot = join(root, ".shield");
  await mkdir(shieldRoot, { mode: 0o755 });
  const envelope = measurementEnvelope({
    root,
    projection: { outcome: "completed", reason: "effect_completed", durable: true },
  });
  const result = await writeFeatureFlightMeasurement(envelope);
  assert.equal(result.state, "recovery_required");
  assert.match(result.reason, /must be 0700/u);
  assert.deepEqual(await readdir(shieldRoot), []);
});

test("writer detects replacement of a retained effect directory", async () => {
  const root = await makeFixtureRoot();
  const envelope = measurementEnvelope({
    root,
    projection: { outcome: "completed", reason: "effect_completed", durable: true },
  });
  const result = await writeFeatureFlightMeasurement(envelope, {
    afterWrite: async ({ parent }) => {
      await rename(parent, `${parent}.moved`);
      await mkdir(parent, { mode: 0o700 });
    },
  });
  assert.equal(result.state, "recovery_required");
  assert.match(result.reason, /Retained measurement directory identity changed/u);
});

test("writer fails closed when the retained parent cannot be synced after file close", async () => {
  const root = await makeFixtureRoot();
  await withNamespace(root);
  const envelope = measurementEnvelope({
    root,
    projection: { outcome: "completed", reason: "effect_completed", durable: true },
  });
  const handlePaths = new Map();
  let measurementClosed = false;
  const result = await writeFeatureFlightMeasurement(envelope, {
    open: async (...args) => {
      const handle = await open(...args);
      handlePaths.set(handle, args[0]);
      return handle;
    },
    close: async (handle) => {
      if (handlePaths.get(handle) === measurementPath({ root })) measurementClosed = true;
      return handle.close();
    },
    sync: async (handle) => {
      if (measurementClosed && handlePaths.get(handle) === dirname(measurementPath({ root }))) {
        throw new Error("parent sync blocked");
      }
      return handle.sync();
    },
  });
  assert.equal(result.state, "recovery_required");
  assert.match(result.reason, /Measurement parent sync failed.*parent sync blocked/u);
});

test("completed measurement is the stable winner for a later replay invocation", async () => {
  const root = await makeFixtureRoot();
  await withNamespace(root);
  const completed = measurementEnvelope({
    root,
    projection: { outcome: "completed", reason: "effect_completed", durable: true },
  });
  const first = await writeFeatureFlightMeasurement(completed);
  assert.equal(first.state, "created");

  const replayed = await writeFeatureFlightMeasurement({
    ...completed,
    stepOutcome: "replayed",
    stepReason: "terminal_replayed",
    measurementPersistence: "replay",
    commandStartAt: "2026-08-10T00:01:00.000Z",
    commandCompletedAt: "2026-08-10T00:01:00.250Z",
  });
  assert.equal(replayed.state, "replayed");
  assert.equal(replayed.digest, first.digest);
  assert.deepEqual(replayed.record, first.record);
  assert.equal(replayed.record.measurementTuple.stepOutcome, "completed");
  assert.equal(replayed.record.measurementTuple.measurementPersistence, "fresh");
  assert.deepEqual(replayed.record.measurementTuple.command, first.record.measurementTuple.command);
});

test("skip writes for non-durable step outcomes while leaving filesystem untouched", async () => {
  const root = await makeFixtureRoot();
  const envelope = {
    ...measurementEnvelope({ root, projection: { outcome: "completed", reason: "effect_completed", durable: false } }),
    stepOutcome: "stopped",
    stepReason: "stop",
    stepDurable: false,
    measurementPersistence: "fresh",
  };
  const skipped = await writeFeatureFlightMeasurement(envelope);
  assert.equal(skipped.state, "skipped");
  await assert.rejects(readFile(skipped.path));
  assert.deepEqual(await readdir(root), []);
});

test("read existing malformed or non-canonical measurement as recovery-required", async () => {
  const root = await makeFixtureRoot();
  await withNamespace(root);
  const path = measurementPath({ root });
  await writeFile(path, "not-json", { mode: 0o600 });
  const envelope = measurementEnvelope({ root, projection: { outcome: "completed", reason: "effect_completed", durable: false } });
  const measured = await writeFeatureFlightMeasurement(envelope);
  assert.equal(measured.state, "recovery_required");
  assert.match(measured.reason, /measurement_record_malformed|measurement_record_non_canonical|measurement file identity|json_|unexpected/u);
});

test("reject path substitution via symlinked namespace alias at read/write boundary", async () => {
  const root = await makeFixtureRoot();
  const namespace = join(root, FEATURE_FLIGHT_MEASUREMENT_NAMESPACE, "e".repeat(64));
  await mkdir(dirname(namespace), { recursive: true });
  const aliasTarget = await mkdtemp(join(tmpdir(), "measurement-namespace-"));
  const aliasTargetReal = await realpath(await mkdtemp(join(tmpdir(), "measurement-namespace-target-")));
  await mkdir(join(aliasTargetReal, "x"));
  const targetEffect = join(aliasTargetReal, "e".repeat(64));
  await mkdir(targetEffect);
  const payload = join(root, ".shield");
  await rm(payload, { recursive: true, force: true });
  await symlink(join(aliasTargetReal, FEATURE_FLIGHT_MEASUREMENT_NAMESPACE), payload, "dir");
  await writeFile(join(targetEffect, `${measurementIntentId}.json`), '{"bad":true}', { mode: 0o600 });

  const envelope = measurementEnvelope({
    root,
    projection: { outcome: "completed", reason: "effect_completed", durable: false },
  });
  const result = await writeFeatureFlightMeasurement(envelope);
  assert.equal(result.state, "recovery_required");
  assert.match(result.reason, /non-follow|alias|measurement path/u);
});

test("reject hard-link collision when reading existing measurement file", async () => {
  const root = await makeFixtureRoot();
  await withNamespace(root);
  const path = measurementPath({ root });
  const staging = join(root, "stage.json");
  await writeFile(staging, "{\"x\":1}");
  await link(staging, path);

  const envelope = measurementEnvelope({ root, projection: { outcome: "completed", reason: "effect_completed", durable: false } });
  const result = await writeFeatureFlightMeasurement(envelope);
  assert.equal(result.state, "recovery_required");
  assert.match(result.reason, /no hard links/);
});

test("readback mismatch surfaces recovery-required and cannot change winner", async () => {
  const root = await makeFixtureRoot();
  await withNamespace(root);
  const envelope = measurementEnvelope({ root, projection: { outcome: "completed", reason: "effect_completed", durable: false } });
  const first = await writeFeatureFlightMeasurement(envelope);
  assert.equal(first.state, "created");
  const path = first.path;
  const readback = await readFeatureFlightMeasurement({
    path,
    snapshotDependencies: {
      read: async () => Buffer.from("{}"),
    },
  });
  assert.equal(readback.state, "recovery_required");
  assert.match(readback.reason, /schemaVersion|measurementRecord|measurementTuple/iu);
});

test("sync/close uncertainty is treated as recovery boundary", async () => {
  const root = await makeFixtureRoot();
  await withNamespace(root);
  const envelope = measurementEnvelope({
    root,
    projection: { outcome: "completed", reason: "effect_completed", durable: false },
  });
  const syncFailure = await writeFeatureFlightMeasurement(envelope, {
    sync: async () => { throw new Error("sync blocked"); },
  });
  assert.equal(syncFailure.state, "recovery_required");

  const closeFailure = await writeFeatureFlightMeasurement(envelope, {
    close: async (handle) => {
      await handle.close();
      throw new Error("close blocked");
    },
  });
  assert.equal(closeFailure.state, "recovery_required");
});

test("small explicit API persists from step projection and snapshot", async () => {
  const root = await makeFixtureRoot();
  await withNamespace(root);
  const envelope = measurementEnvelope({ root, projection: { outcome: "completed", reason: "effect_completed", durable: false } });
  const snapshot = { ...baseSnapshot(), durableArtifactRoot: root };
  snapshot.packetByteCount = envelope.packetByteCount;
  snapshot.packetDigest = envelope.packetDigest;
  snapshot.commandStartAt = timestampA;
  snapshot.commandCompletedAt = timestampB;
  const result = await persistFeatureFlightMeasurement({
    projection: { outcome: "completed", reason: "effect_completed", durable: false },
    snapshot,
  });
  assert.equal(result.state, "created");
  const replay = await persistFeatureFlightMeasurement({
    projection: { outcome: "completed", reason: "effect_completed", durable: false },
    snapshot,
  });
  assert.equal(replay.state, "replayed");
});
