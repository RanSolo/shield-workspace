import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { constants } from "node:fs";
import { chmod, link, lstat, mkdtemp, mkdir, open, readFile, readdir, realpath, rename, stat, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
  WORKTREE_STATE_EXCLUSIONS,
  WORKTREE_STATE_INSTALLED_PATHS,
  inspectWorktreeStateV1,
  prepareOrRefreshWorktreeStateV2,
  prepareOrRefreshWorktreeStateV2ForTest,
  prepareWorktreeStateV1,
  prepareWorktreeStateV1ForTest,
  validateWorktreeStateReceiptV1,
  validateWorktreeStateReceiptV2,
  validateWorktreeStateReceiptFileChainV1OrV2,
  worktreePreparationAuthorityV1,
  worktreePreparationIsReadyV1,
  worktreePreparationIsReadyV2,
} from "../dist/worktree-state-v1.mjs";

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function gitInput(root, args, input) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", input }).trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function withReceiptDigest(receipt) {
  const { receiptDigest: _ignored, ...body } = receipt;
  return { ...body, receiptDigest: sha256(canonicalJson(body)) };
}

async function writeReceipt(root, receipt) {
  await writeFile(join(root, ".shield", "worktree-state.json"), `${canonicalJson(receipt)}\n`);
}

async function assertStaleDoctor(root) {
  const result = await inspectWorktreeStateV1({ root, configPresent: true, configValid: true });
  assert.deepEqual(result, {
    classification: "stale_or_malformed_worktree_state",
    ok: false,
    message: "Worktree preparation receipt or installed policy is stale, malformed, unsafe, or belongs to another repository.",
    receiptDigest: null,
  });
}

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await handle.sync(); } finally { await handle.close(); }
}

function binding(seatId) {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    schemaVersion: 1,
    bindingId: `binding:worktree:${seatId}`,
    humanPrincipalId: `human:worktree:${seatId}`,
    seatId,
    missionScope: "*",
    signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:worktree-test",
    provenanceRef: `repository-policy:worktree-test:${seatId}`,
  };
}

async function fixture({ trackedFiles = [], paths = {} } = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-worktree-state-")));
  const sourceRoot = join(parent, "source");
  const destinationRoot = join(parent, "destination");
  await mkdir(sourceRoot);
  git(sourceRoot, ["init", "--quiet"]);
  git(sourceRoot, ["config", "user.email", "shield@example.invalid"]);
  git(sourceRoot, ["config", "user.name", "SHIELD Worktree Fixture"]);
  git(sourceRoot, ["remote", "add", "origin", "git@github.com:RanSolo/worktree-fixture.git"]);
  await writeFile(join(sourceRoot, ".gitignore"), ".shield/\n");
  await writeFile(join(sourceRoot, "package.json"), "{\"private\":true}\n");
  git(sourceRoot, ["add", ".gitignore", "package.json"]);
  for (const file of trackedFiles) {
    await mkdir(dirname(join(sourceRoot, file.path)), { recursive: true });
    await writeFile(join(sourceRoot, file.path), file.bytes);
    git(sourceRoot, ["add", "--force", "--", file.path]);
  }
  git(sourceRoot, ["commit", "--quiet", "-m", "worktree fixture"]);
  git(sourceRoot, ["worktree", "add", "--quiet", "-b", `lane-${process.pid}-${Date.now()}`, destinationRoot, "HEAD"]);
  const coulson = binding("coulson");
  const fitz = binding("fitz");
  const createdConfig = createShieldConfig({
    repositoryId: "RanSolo/worktree-fixture",
    coulsonBindingRef: coulson.signingKeyRef,
    fitzBindingRef: fitz.signingKeyRef,
  });
  const config = { ...createdConfig, paths: { ...createdConfig.paths, ...paths } };
  await mkdir(join(sourceRoot, ".shield"), { recursive: true });
  await writeFile(join(sourceRoot, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(
    join(sourceRoot, ".shield", "trusted-human-bindings.json"),
    `${JSON.stringify({ schemaVersion: 1, bindings: [coulson, fitz] }, null, 2)}\n`,
  );
  return {
    sourceRoot: await realpath(sourceRoot),
    destinationRoot: await realpath(destinationRoot),
  };
}

const TRACKED_JOURNALS = [
  {
    path: ".shield/journals/bWlzc2lvbjppc3N1ZS0xMzAtcnVudGltZS12Mg.jsonl",
    bytes: "{\"schemaVersion\":9,\"missionId\":\"mission:issue-130-runtime-v2\"}\n",
  },
  {
    path: ".shield/journals/bWlzc2lvbjppc3N1ZS0xMzEtcHJvZmlsZS12MQ.jsonl",
    bytes: "{\"schemaVersion\":9,\"missionId\":\"mission:issue-131-profile-v1\"}\n",
  },
];

async function trackedFixture() {
  return fixture({ trackedFiles: TRACKED_JOURNALS });
}

async function advanceDestination(current, message = "advance prepared lane") {
  const path = join(current.destinationRoot, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.advance = (manifest.advance ?? 0) + 1;
  await writeFile(path, `${JSON.stringify(manifest)}\n`);
  git(current.destinationRoot, ["add", "package.json"]);
  git(current.destinationRoot, ["commit", "--quiet", "-m", message]);
}

function runAbruptRefresh(current, operation, occurrence) {
  const source = `
    import { pathToFileURL } from "node:url";
    const [modulePath, sourceRoot, destinationRoot, operation, occurrenceText] = process.argv.slice(1);
    const { prepareOrRefreshWorktreeStateV2ForTest } = await import(pathToFileURL(modulePath).href);
    let observed = 0;
    await prepareOrRefreshWorktreeStateV2ForTest({ sourceRoot, destinationRoot }, {
      nonce: () => "crashboundary",
      filesystem: ({ operation: current }) => {
        if (current === operation && ++observed === Number(occurrenceText)) process.kill(process.pid, "SIGKILL");
      },
    });
    process.exitCode = 91;
  `;
  const modulePath = new URL("../dist/worktree-state-v1.mjs", import.meta.url).pathname;
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
      "--input-type=module", "--eval", source, modulePath, current.sourceRoot, current.destinationRoot, operation, String(occurrence),
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectChild);
    child.once("close", (status, signal) => resolveChild({ status, signal, stderr }));
  });
}

async function installRepresentativeMissionState(root) {
  const records = [];
  for (const [relative, bytes] of [
    [".shield/journals/mission.jsonl", "journal\n"],
    [".shield/reports/mission.json", "report\n"],
    [".shield/tmp/mission/scratch.json", "temporary mission data\n"],
    [".shield/artifacts/result.json", "artifact\n"],
    [".shield/audit/evidence.json", "audit\n"],
    [".shield/runtime/context.json", "runtime\n"],
    [".shield/dispatch-receipts.jsonl", "dispatch\n"],
  ]) {
    const path = join(root, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    records.push({ path, bytes: await readFile(path), stats: await lstat(path) });
  }
  return records;
}

async function assertMissionStateIdentity(records) {
  for (const before of records) {
    const after = await lstat(before.path);
    assert.deepEqual(await readFile(before.path), before.bytes, before.path);
    assert.equal(after.dev, before.stats.dev, before.path);
    assert.equal(after.ino, before.stats.ino, before.path);
  }
}

function successorReceipt(predecessor, head) {
  return withReceiptDigest({
    schemaVersion: 1,
    contractVersion: "worktree.state.v2",
    authority: "none",
    state: "refreshed",
    reasonCode: "prepared_state_refreshed",
    summary: "Prepared-worktree provenance was refreshed after an exact same-branch fast-forward; no authority was granted.",
    repositoryId: predecessor.repositoryId,
    commonGitDirectory: predecessor.commonGitDirectory,
    destination: { ...predecessor.destination, head },
    policy: predecessor.policy,
    publicBindings: predecessor.publicBindings,
    trackedBaselineExclusions: predecessor.trackedBaselineExclusions ?? [],
    installedPaths: predecessor.installedPaths,
    installedByteDigests: predecessor.installedByteDigests,
    exclusions: predecessor.exclusions,
    supersedes: {
      contractVersion: predecessor.contractVersion,
      receiptDigest: predecessor.receiptDigest,
      destinationBranch: predecessor.destination.branch,
      destinationHead: predecessor.destination.head,
    },
  });
}

test("prepares the exact authority-neutral four-file state and replays without writes", async () => {
  const current = await fixture();
  const first = await prepareWorktreeStateV1(current);
  assert.equal(first.state, "ready", JSON.stringify(first));
  assert.equal(worktreePreparationIsReadyV1(first), true);
  assert.equal(worktreePreparationAuthorityV1(first), "none");
  assert.equal(validateWorktreeStateReceiptV1(first.receipt), true);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.receipt), true);
  assert.equal(Object.isFrozen(first.receipt.source), true);
  assert.equal(Object.isFrozen(first.receipt.publicBindings), true);
  assert.equal(Object.hasOwn(first.receipt, "trackedBaselineExclusions"), false);
  assert.equal(validateWorktreeStateReceiptV1({ ...first.receipt, authority: "wheels_up" }), false);
  assert.equal(validateWorktreeStateReceiptV1({ ...first.receipt, extra: true }), false);
  assert.deepEqual(first.receipt.installedPaths, WORKTREE_STATE_INSTALLED_PATHS);
  assert.deepEqual(first.receipt.exclusions, WORKTREE_STATE_EXCLUSIONS);
  assert.deepEqual(
    await import("node:fs/promises").then(({ readdir }) => readdir(join(current.destinationRoot, ".shield"))).then((entries) => entries.sort()),
    [".gitignore", "config.json", "trusted-human-bindings.json", "worktree-state.json"],
  );
  assert.equal(
    await readFile(join(current.destinationRoot, ".shield", "config.json"), "utf8"),
    await readFile(join(current.sourceRoot, ".shield", "config.json"), "utf8"),
  );
  const before = await readFile(join(current.destinationRoot, ".shield", "worktree-state.json"));
  const replay = await prepareWorktreeStateV1(current);
  assert.equal(replay.state, "already_prepared");
  assert.equal(replay.receipt.receiptDigest, first.receipt.receiptDigest);
  assert.deepEqual(await readFile(join(current.destinationRoot, ".shield", "worktree-state.json")), before);
  assert.equal(git(current.destinationRoot, ["status", "--porcelain"]), "");

  const doctor = await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: true, configValid: true });
  assert.deepEqual(doctor, {
    classification: "prepared_worktree",
    ok: true,
    message: "Prepared worktree policy and immutable provenance receipt are exact.",
    receiptDigest: first.receipt.receiptDigest,
  });
  await writeFile(join(current.destinationRoot, ".shield", "config.json"), "{}\n");
  const stale = await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: true, configValid: false });
  assert.equal(stale.classification, "stale_or_malformed_worktree_state");
  assert.equal(stale.ok, false);
});

test("accepts mission-local state directories after preparation without weakening policy siblings", async () => {
  const current = await fixture();
  const prepared = await prepareWorktreeStateV1(current);
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));
  const receiptBytes = await readFile(join(current.destinationRoot, ".shield", "worktree-state.json"));
  await mkdir(join(current.destinationRoot, ".shield", "journals"), { recursive: true });
  await writeFile(join(current.destinationRoot, ".shield", "journals", "mission.jsonl"), "{\"sequence\":0}\n");
  await mkdir(join(current.destinationRoot, ".shield", "reports"), { recursive: true });
  await writeFile(join(current.destinationRoot, ".shield", "reports", "mission.json"), "{}\n");
  await mkdir(join(current.destinationRoot, ".shield", "tmp", "mission"), { recursive: true });
  await writeFile(join(current.destinationRoot, ".shield", "tmp", "mission", "scratch.json"), "{}\n");

  const doctor = await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: true, configValid: true });
  assert.deepEqual(doctor, {
    classification: "prepared_worktree",
    ok: true,
    message: "Prepared worktree policy and immutable provenance receipt are exact; mission-local state directories are present.",
    receiptDigest: prepared.receipt.receiptDigest,
  });
  const replay = await prepareWorktreeStateV1(current);
  assert.equal(replay.state, "already_prepared", JSON.stringify(replay));
  assert.deepEqual(await readFile(join(current.destinationRoot, ".shield", "worktree-state.json")), receiptBytes);
  assert.equal(git(current.destinationRoot, ["status", "--porcelain"]), "");

  const unknown = await fixture();
  assert.equal((await prepareWorktreeStateV1(unknown)).state, "ready");
  await mkdir(join(unknown.destinationRoot, ".shield", "evidence"));
  await writeFile(join(unknown.destinationRoot, ".shield", "evidence", "local.json"), "{}\n");
  await assertStaleDoctor(unknown.destinationRoot);
  const unknownReplay = await prepareWorktreeStateV1(unknown);
  assert.equal(unknownReplay.state, "blocked");
  assert.equal(unknownReplay.reasonCode, "prepared_state_stale");

  const symlinked = await fixture();
  assert.equal((await prepareWorktreeStateV1(symlinked)).state, "ready");
  await symlink("../package.json", join(symlinked.destinationRoot, ".shield", "tmp"));
  await assertStaleDoctor(symlinked.destinationRoot);
  const symlinkedReplay = await prepareWorktreeStateV1(symlinked);
  assert.equal(symlinkedReplay.state, "blocked");
  assert.equal(symlinkedReplay.reasonCode, "prepared_state_stale");

  const file = await fixture();
  assert.equal((await prepareWorktreeStateV1(file)).state, "ready");
  await writeFile(join(file.destinationRoot, ".shield", "tmp"), "not a directory\n");
  await assertStaleDoctor(file.destinationRoot);
  const fileReplay = await prepareWorktreeStateV1(file);
  assert.equal(fileReplay.state, "blocked");
  assert.equal(fileReplay.reasonCode, "prepared_state_stale");

  const unsafeMode = await fixture();
  assert.equal((await prepareWorktreeStateV1(unsafeMode)).state, "ready");
  await mkdir(join(unsafeMode.destinationRoot, ".shield", "journals"));
  await chmod(join(unsafeMode.destinationRoot, ".shield", "journals"), 0o777);
  await assertStaleDoctor(unsafeMode.destinationRoot);
  const unsafeModeReplay = await prepareWorktreeStateV1(unsafeMode);
  assert.equal(unsafeModeReplay.state, "blocked");
  assert.equal(unsafeModeReplay.reasonCode, "prepared_state_stale");
});

test("derives admitted mission-state roots and ignore bytes from the installed configuration", async () => {
  const paths = {
    journals: ".shield/mission-state/journals",
    reports: ".shield/mission-state/reports",
    temp: ".shield/runtime/scratch",
  };
  const current = await fixture({ paths });
  const prepared = await prepareWorktreeStateV1(current);
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));
  assert.equal(
    await readFile(join(current.destinationRoot, ".shield", ".gitignore"), "utf8"),
    "/mission-state/journals/\n/mission-state/reports/\n/runtime/scratch/\n",
  );
  await mkdir(join(current.destinationRoot, paths.journals), { recursive: true });
  await writeFile(join(current.destinationRoot, paths.journals, "mission.jsonl"), "{\"sequence\":0}\n");
  await mkdir(join(current.destinationRoot, paths.reports), { recursive: true });
  await writeFile(join(current.destinationRoot, paths.reports, "mission.json"), "{}\n");
  await mkdir(join(current.destinationRoot, paths.temp, "mission"), { recursive: true });
  await writeFile(join(current.destinationRoot, paths.temp, "mission", "scratch.json"), "{}\n");

  const doctor = await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: true, configValid: true });
  assert.equal(doctor.classification, "prepared_worktree");
  assert.match(doctor.message, /mission-local state directories are present/u);
  assert.equal((await prepareWorktreeStateV1(current)).state, "already_prepared");

  const defaultsNotConfigured = await fixture({ paths });
  assert.equal((await prepareWorktreeStateV1(defaultsNotConfigured)).state, "ready");
  await mkdir(join(defaultsNotConfigured.destinationRoot, ".shield", "journals"));
  await writeFile(join(defaultsNotConfigured.destinationRoot, ".shield", "journals", "unexpected.jsonl"), "{}\n");
  await assertStaleDoctor(defaultsNotConfigured.destinationRoot);
  const rejected = await prepareWorktreeStateV1(defaultsNotConfigured);
  assert.equal(rejected.state, "blocked");
  assert.equal(rejected.reasonCode, "prepared_state_stale");
});

test("retains admitted mission-state identities through replay and rejects replacement or unsafe mode", async () => {
  for (const scenario of ["replacement", "wrong-mode"]) {
    const current = await fixture();
    assert.equal((await prepareWorktreeStateV1(current)).state, "ready");
    const journals = join(current.destinationRoot, ".shield", "journals");
    await mkdir(journals);
    await writeFile(join(journals, "mission.jsonl"), "{\"sequence\":0}\n");
    const receiptBytes = await readFile(join(current.destinationRoot, ".shield", "worktree-state.json"));
    const replayed = await prepareWorktreeStateV1ForTest(current, {
      phase: async (phase) => {
        if (phase !== "before_replay_ready") return;
        if (scenario === "replacement") {
          await rename(journals, join(dirname(current.destinationRoot), `displaced-journals-${process.pid}-${Date.now()}`));
          await mkdir(journals);
          await writeFile(join(journals, "mission.jsonl"), "{\"sequence\":0}\n");
        } else {
          await chmod(journals, 0o777);
        }
      },
    });
    assert.equal(replayed.state, "blocked", `${scenario}: ${JSON.stringify(replayed)}`);
    assert.equal(replayed.reasonCode, "source_policy_drift", scenario);
    assert.deepEqual(await readFile(join(current.destinationRoot, ".shield", "worktree-state.json")), receiptBytes);
  }
});

test("real prepared-worktree inspection preserves stale index bytes and metadata", async () => {
  const current = await fixture();
  const prepared = await prepareWorktreeStateV1(current);
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));

  const trackedPath = join(current.destinationRoot, "package.json");
  const trackedBytes = await readFile(trackedPath);
  await writeFile(trackedPath, trackedBytes);
  await utimes(trackedPath, new Date("2001-01-01T00:00:00.000Z"), new Date("2001-01-01T00:00:00.000Z"));
  const indexOutput = git(current.destinationRoot, ["rev-parse", "--git-path", "index"]);
  const indexPath = resolve(current.destinationRoot, indexOutput);
  const beforeBytes = await readFile(indexPath);
  const before = await stat(indexPath, { bigint: true });

  const inspected = await inspectWorktreeStateV1({
    root: current.destinationRoot,
    configPresent: true,
    configValid: true,
  });
  const afterBytes = await readFile(indexPath);
  const after = await stat(indexPath, { bigint: true });
  const metadata = ({ dev, ino, mode, nlink, uid, gid, rdev, size, blksize, blocks, mtimeNs, ctimeNs, birthtimeNs }) =>
    ({ dev, ino, mode, nlink, uid, gid, rdev, size, blksize, blocks, mtimeNs, ctimeNs, birthtimeNs });

  assert.equal(inspected.classification, "prepared_worktree");
  assert.equal(inspected.receiptDigest, prepared.receipt.receiptDigest);
  assert.deepEqual(afterBytes, beforeBytes);
  assert.deepEqual(metadata(after), metadata(before));
});

test("prepares the real linked-worktree bootstrap-journal baseline without rewriting it", async () => {
  const current = await trackedFixture();
  await writeFile(join(current.sourceRoot, TRACKED_JOURNALS[0].path), "source-only-new-head\n");
  git(current.sourceRoot, ["add", "--force", "--", TRACKED_JOURNALS[0].path]);
  git(current.sourceRoot, ["commit", "--quiet", "-m", "advance source journal independently"]);
  assert.notEqual(git(current.sourceRoot, ["rev-parse", "HEAD"]), git(current.destinationRoot, ["rev-parse", "HEAD"]));
  const before = await Promise.all(TRACKED_JOURNALS.map(async ({ path }) => ({
    path,
    bytes: await readFile(join(current.destinationRoot, path)),
    stats: await lstat(join(current.destinationRoot, path)),
  })));
  const prepared = await prepareWorktreeStateV1(current);
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));
  assert.equal(worktreePreparationAuthorityV1(prepared), "none");
  assert.equal(validateWorktreeStateReceiptV1(prepared.receipt), true);
  assert.equal(Object.isFrozen(prepared.receipt.trackedBaselineExclusions), true);
  assert.deepEqual(
    prepared.receipt.trackedBaselineExclusions,
    [...TRACKED_JOURNALS].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path))).map(({ path, bytes }) => {
      const oid = git(current.destinationRoot, ["rev-parse", `HEAD:${path}`]);
      return { path, gitMode: "100644", headBlobOid: oid, indexBlobOid: oid, byteSha256: sha256(bytes) };
    }),
  );
  assert.deepEqual(
    (await readdir(join(current.destinationRoot, ".shield"))).sort(),
    [".gitignore", "config.json", "journals", "trusted-human-bindings.json", "worktree-state.json"],
  );
  for (const prior of before) {
    const after = await lstat(join(current.destinationRoot, prior.path));
    assert.equal(after.dev, prior.stats.dev, prior.path);
    assert.equal(after.ino, prior.stats.ino, prior.path);
    assert.deepEqual(await readFile(join(current.destinationRoot, prior.path)), prior.bytes, prior.path);
  }
  const receiptBytes = await readFile(join(current.destinationRoot, ".shield", "worktree-state.json"));
  const replay = await prepareWorktreeStateV1(current);
  assert.equal(replay.state, "already_prepared", JSON.stringify(replay));
  assert.deepEqual(await readFile(join(current.destinationRoot, ".shield", "worktree-state.json")), receiptBytes);
  const doctor = await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: true, configValid: true });
  assert.equal(doctor.classification, "prepared_worktree");
  assert.equal(git(current.destinationRoot, ["status", "--porcelain"]), "");
});

test("binds tracked baselines to the configured custom journal root for ready, replay, and doctor", async () => {
  const paths = {
    journals: ".shield/mission-state/journals",
    reports: ".shield/mission-state/reports",
    temp: ".shield/runtime/scratch",
  };
  const trackedPath = `${paths.journals}/bootstrap/custom.jsonl`;
  const current = await fixture({
    paths,
    trackedFiles: [{ path: trackedPath, bytes: "custom-root\n" }],
  });
  const prepared = await prepareWorktreeStateV1(current);
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));
  assert.deepEqual(prepared.receipt.trackedBaselineExclusions.map(({ path }) => path), [trackedPath]);
  assert.equal(validateWorktreeStateReceiptV1(prepared.receipt), true);

  const replay = await prepareWorktreeStateV1(current);
  assert.equal(replay.state, "already_prepared", JSON.stringify(replay));
  const doctor = await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: true, configValid: true });
  assert.equal(doctor.classification, "prepared_worktree");
  assert.equal(doctor.receiptDigest, prepared.receipt.receiptDigest);

  const wrongRootReceipt = structuredClone(prepared.receipt);
  wrongRootReceipt.trackedBaselineExclusions[0].path = ".shield/journals/bootstrap/custom.jsonl";
  const digestBoundWrongRoot = withReceiptDigest(wrongRootReceipt);
  assert.equal(validateWorktreeStateReceiptV1(digestBoundWrongRoot), true);
  await writeReceipt(current.destinationRoot, digestBoundWrongRoot);
  const rejectedReplay = await prepareWorktreeStateV1(current);
  assert.equal(rejectedReplay.state, "blocked");
  assert.equal(rejectedReplay.reasonCode, "prepared_state_stale");
  await assertStaleDoctor(current.destinationRoot);

  const unconfiguredDefault = await fixture({
    paths,
    trackedFiles: [{ path: ".shield/journals/unconfigured.jsonl", bytes: "unconfigured-default\n" }],
  });
  const rejectedReady = await prepareWorktreeStateV1(unconfiguredDefault);
  assert.equal(rejectedReady.state, "blocked");
  assert.equal(rejectedReady.reasonCode, "destination_conflict");
  assert.equal(await exists(join(unconfiguredDefault.destinationRoot, ".shield", "config.json")), false);
});

test("allows only exact tracked journal files and necessary real ancestors", async () => {
  const nested = await fixture({ trackedFiles: [{ path: ".shield/journals/bootstrap/nested.jsonl", bytes: "nested\n" }] });
  const nestedResult = await prepareWorktreeStateV1(nested);
  assert.equal(nestedResult.state, "ready", JSON.stringify(nestedResult));
  assert.deepEqual(nestedResult.receipt.trackedBaselineExclusions.map(({ path }) => path), [".shield/journals/bootstrap/nested.jsonl"]);

  const outside = await fixture({ trackedFiles: [{ path: ".shield/evidence/bootstrap.json", bytes: "{}\n" }] });
  const outsideResult = await prepareWorktreeStateV1(outside);
  assert.equal(outsideResult.state, "blocked");
  assert.equal(outsideResult.reasonCode, "destination_conflict");
  assert.equal(await exists(join(outside.destinationRoot, ".shield", "config.json")), false);

  const emptyAncestor = await trackedFixture();
  await mkdir(join(emptyAncestor.destinationRoot, ".shield", "journals", "extra"));
  const emptyAncestorResult = await prepareWorktreeStateV1(emptyAncestor);
  assert.equal(emptyAncestorResult.state, "blocked");
  assert.equal(emptyAncestorResult.reasonCode, "destination_conflict");

  const extraMissionState = await trackedFixture();
  await mkdir(join(extraMissionState.destinationRoot, ".shield", "evidence"));
  await writeFile(join(extraMissionState.destinationRoot, ".shield", "evidence", "local.json"), "{}\n");
  const extraMissionResult = await prepareWorktreeStateV1(extraMissionState);
  assert.equal(extraMissionResult.state, "blocked");
  assert.equal(extraMissionResult.reasonCode, "destination_conflict");

  const untrackedJournal = await trackedFixture();
  await writeFile(join(untrackedJournal.destinationRoot, ".shield", "journals", "local.jsonl"), "local\n");
  const untrackedResult = await prepareWorktreeStateV1(untrackedJournal);
  assert.equal(untrackedResult.state, "blocked");
  assert.equal(untrackedResult.reasonCode, "destination_conflict");

  const modified = await trackedFixture();
  await writeFile(join(modified.destinationRoot, TRACKED_JOURNALS[0].path), "modified\n");
  const modifiedResult = await prepareWorktreeStateV1(modified);
  assert.equal(modifiedResult.state, "blocked");
  assert.equal(modifiedResult.reasonCode, "destination_dirty");
});

test("rejects hostile tracked journal identities before destination mutation", async () => {
  for (const scenario of ["symlink", "fifo", "hardlink", "ancestor-symlink"]) {
    const current = await trackedFixture();
    const path = join(current.destinationRoot, TRACKED_JOURNALS[0].path);
    const result = await prepareWorktreeStateV1ForTest(current, {
      phase: async (phase) => {
        if (phase !== "repositories_observed") return;
        if (scenario === "ancestor-symlink") {
          const journals = join(current.destinationRoot, ".shield", "journals");
          await rename(journals, `${journals}-real`);
          await symlink("journals-real", journals);
          return;
        }
        await unlink(path);
        if (scenario === "symlink") await symlink(join(current.sourceRoot, TRACKED_JOURNALS[0].path), path);
        else if (scenario === "fifo") execFileSync("mkfifo", [path]);
        else await link(join(current.sourceRoot, TRACKED_JOURNALS[0].path), path);
      },
    });
    assert.equal(result.state, "blocked", `${scenario}: ${JSON.stringify(result)}`);
    assert.equal(result.reasonCode, "destination_conflict", scenario);
    assert.equal(await exists(join(current.destinationRoot, ".shield", "config.json")), false, scenario);
  }
});

test("requires identical destination HEAD and live stage-zero index baseline sets", async () => {
  const blobMismatch = await trackedFixture();
  const blobMismatchResult = await prepareWorktreeStateV1ForTest(blobMismatch, {
    phase: (phase) => {
      if (phase === "repositories_observed") {
        const oid = gitInput(blobMismatch.destinationRoot, ["hash-object", "-w", "--stdin"], "index-only\n");
        git(blobMismatch.destinationRoot, ["update-index", "--cacheinfo", "100644", oid, TRACKED_JOURNALS[0].path]);
      }
    },
  });
  assert.equal(blobMismatchResult.state, "blocked");
  assert.equal(blobMismatchResult.reasonCode, "destination_conflict");

  const modeMismatch = await trackedFixture();
  const modeMismatchResult = await prepareWorktreeStateV1ForTest(modeMismatch, {
    phase: (phase) => {
      if (phase === "repositories_observed") {
        git(modeMismatch.destinationRoot, ["update-index", "--chmod=+x", "--", TRACKED_JOURNALS[0].path]);
      }
    },
  });
  assert.equal(modeMismatchResult.state, "blocked");
  assert.equal(modeMismatchResult.reasonCode, "destination_conflict");
});

test("revalidates retained tracked baseline identities across lock, install, ready, and replay boundaries", async () => {
  for (const phaseName of ["before_destination_mutation", "lock_acquired", "before_install"]) {
    const current = await trackedFixture();
    const result = await prepareWorktreeStateV1ForTest(current, {
      phase: async (phase) => {
        if (phase !== phaseName) return;
        const path = join(current.destinationRoot, TRACKED_JOURNALS[0].path);
        if (phase === "before_install") {
          await unlink(path);
          await link(join(current.sourceRoot, TRACKED_JOURNALS[0].path), path);
        } else {
          await writeFile(path, `${phaseName}\n`);
        }
      },
    });
    assert.equal(result.state, "blocked", `${phaseName}: ${JSON.stringify(result)}`);
    for (const relative of WORKTREE_STATE_INSTALLED_PATHS) {
      assert.equal(await exists(join(current.destinationRoot, relative)), false, `${phaseName}: ${relative}`);
    }
  }

  const readyRace = await trackedFixture();
  const readyResult = await prepareWorktreeStateV1ForTest(readyRace, {
    phase: async (phase) => {
      if (phase === "before_ready") await writeFile(join(readyRace.destinationRoot, TRACKED_JOURNALS[0].path), "ready-race\n");
    },
  });
  assert.equal(readyResult.state, "recovery_required");
  assert.equal(readyResult.reasonCode, "filesystem_outcome_uncertain");

  const replayRace = await trackedFixture();
  assert.equal((await prepareWorktreeStateV1(replayRace)).state, "ready");
  const storedReceipt = await readFile(join(replayRace.destinationRoot, ".shield", "worktree-state.json"));
  const replayResult = await prepareWorktreeStateV1ForTest(replayRace, {
    phase: async (phase) => {
      if (phase === "before_replay_ready") await writeFile(join(replayRace.destinationRoot, TRACKED_JOURNALS[0].path), "replay-race\n");
    },
  });
  assert.equal(replayResult.state, "blocked");
  assert.deepEqual(await readFile(join(replayRace.destinationRoot, ".shield", "worktree-state.json")), storedReceipt);
});

test("rejects post-capture out-of-tree hardlinks at every baseline boundary", async () => {
  for (const phaseName of ["before_destination_mutation", "lock_acquired", "before_install"]) {
    const current = await trackedFixture();
    const baselinePath = join(current.destinationRoot, TRACKED_JOURNALS[0].path);
    const hardlinkPath = join(current.destinationRoot, `outside-baseline-${phaseName}`);
    const result = await prepareWorktreeStateV1ForTest(current, {
      phase: async (phase) => {
        if (phase === phaseName) await link(baselinePath, hardlinkPath);
      },
    });
    assert.equal(result.state, "blocked", `${phaseName}: ${JSON.stringify(result)}`);
    assert.equal((await lstat(baselinePath)).nlink, 2, phaseName);
    for (const relative of WORKTREE_STATE_INSTALLED_PATHS) {
      assert.equal(await exists(join(current.destinationRoot, relative)), false, `${phaseName}: ${relative}`);
    }
  }

  const ready = await trackedFixture();
  const readyBaseline = join(ready.destinationRoot, TRACKED_JOURNALS[0].path);
  const readyResult = await prepareWorktreeStateV1ForTest(ready, {
    phase: async (phase) => {
      if (phase === "before_ready") await link(readyBaseline, join(ready.destinationRoot, "outside-baseline-ready"));
    },
  });
  assert.equal(readyResult.state, "recovery_required", JSON.stringify(readyResult));
  assert.equal((await lstat(readyBaseline)).nlink, 2);

  const replay = await trackedFixture();
  assert.equal((await prepareWorktreeStateV1(replay)).state, "ready");
  const replayBaseline = join(replay.destinationRoot, TRACKED_JOURNALS[0].path);
  const receiptBytes = await readFile(join(replay.destinationRoot, ".shield", "worktree-state.json"));
  const replayResult = await prepareWorktreeStateV1ForTest(replay, {
    phase: async (phase) => {
      if (phase === "before_replay_ready") await link(replayBaseline, join(replay.destinationRoot, "outside-baseline-replay"));
    },
  });
  assert.equal(replayResult.state, "blocked", JSON.stringify(replayResult));
  assert.equal((await lstat(replayBaseline)).nlink, 2);
  assert.deepEqual(await readFile(join(replay.destinationRoot, ".shield", "worktree-state.json")), receiptBytes);
});

test("binds optional tracked baseline exclusions into receipts and rejects live tamper", async () => {
  const current = await trackedFixture();
  const prepared = await prepareWorktreeStateV1(current);
  assert.equal(prepared.state, "ready");

  const reversed = structuredClone(prepared.receipt);
  reversed.trackedBaselineExclusions.reverse();
  assert.equal(validateWorktreeStateReceiptV1(withReceiptDigest(reversed)), false);

  const empty = structuredClone(prepared.receipt);
  empty.trackedBaselineExclusions = [];
  assert.equal(validateWorktreeStateReceiptV1(withReceiptDigest(empty)), false);

  const duplicate = structuredClone(prepared.receipt);
  duplicate.trackedBaselineExclusions[1].path = duplicate.trackedBaselineExclusions[0].path;
  assert.equal(validateWorktreeStateReceiptV1(withReceiptDigest(duplicate)), false);

  const differentlyScoped = structuredClone(prepared.receipt);
  differentlyScoped.trackedBaselineExclusions[0].path = ".shield/evidence/outside.jsonl";
  assert.equal(validateWorktreeStateReceiptV1(withReceiptDigest(differentlyScoped)), true);

  const malformedPath = structuredClone(prepared.receipt);
  malformedPath.trackedBaselineExclusions[0].path = "evidence/outside.jsonl";
  assert.equal(validateWorktreeStateReceiptV1(withReceiptDigest(malformedPath)), false);

  const sixtyFour = structuredClone(prepared.receipt);
  sixtyFour.trackedBaselineExclusions[0].headBlobOid = "a".repeat(64);
  sixtyFour.trackedBaselineExclusions[0].indexBlobOid = "a".repeat(64);
  assert.equal(validateWorktreeStateReceiptV1(withReceiptDigest(sixtyFour)), true);

  for (let length = 41; length <= 63; length += 1) {
    const malformedOid = structuredClone(prepared.receipt);
    malformedOid.trackedBaselineExclusions[0].headBlobOid = "a".repeat(length);
    malformedOid.trackedBaselineExclusions[0].indexBlobOid = "a".repeat(length);
    assert.equal(validateWorktreeStateReceiptV1(withReceiptDigest(malformedOid)), false, `OID length ${length}`);
  }

  const tampered = structuredClone(prepared.receipt);
  tampered.trackedBaselineExclusions[0].byteSha256 = "0".repeat(64);
  assert.equal(validateWorktreeStateReceiptV1(tampered), false);
  const digestBoundTamper = withReceiptDigest(tampered);
  assert.equal(validateWorktreeStateReceiptV1(digestBoundTamper), true);
  await writeReceipt(current.destinationRoot, digestBoundTamper);
  const replay = await prepareWorktreeStateV1(current);
  assert.equal(replay.state, "blocked");
  assert.equal(replay.reasonCode, "prepared_state_stale");
  await assertStaleDoctor(current.destinationRoot);

  const substituted = await trackedFixture();
  const substitutedPrepared = await prepareWorktreeStateV1(substituted);
  assert.equal(substitutedPrepared.state, "ready");
  const oidSubstitution = structuredClone(substitutedPrepared.receipt);
  const substituteOid = oidSubstitution.trackedBaselineExclusions[0].headBlobOid === "f".repeat(40)
    ? "e".repeat(40)
    : "f".repeat(40);
  oidSubstitution.trackedBaselineExclusions[0].headBlobOid = substituteOid;
  oidSubstitution.trackedBaselineExclusions[0].indexBlobOid = substituteOid;
  const digestBoundOidSubstitution = withReceiptDigest(oidSubstitution);
  assert.equal(validateWorktreeStateReceiptV1(digestBoundOidSubstitution), true);
  await writeReceipt(substituted.destinationRoot, digestBoundOidSubstitution);
  const substitutedReplay = await prepareWorktreeStateV1(substituted);
  assert.equal(substitutedReplay.state, "blocked");
  assert.equal(substitutedReplay.reasonCode, "prepared_state_stale");
  await assertStaleDoctor(substituted.destinationRoot);
});

test("baseline-bearing receipts become stale after live baseline removal or change", async () => {
  const removed = await trackedFixture();
  assert.equal((await prepareWorktreeStateV1(removed)).state, "ready");
  git(removed.destinationRoot, ["rm", "--quiet", "--", TRACKED_JOURNALS[0].path]);
  git(removed.destinationRoot, ["commit", "--quiet", "-m", "remove tracked baseline"]);
  const removedReplay = await prepareWorktreeStateV1(removed);
  assert.equal(removedReplay.state, "blocked");
  assert.equal(removedReplay.reasonCode, "prepared_state_stale");
  await assertStaleDoctor(removed.destinationRoot);

  const changed = await trackedFixture();
  assert.equal((await prepareWorktreeStateV1(changed)).state, "ready");
  await writeFile(join(changed.destinationRoot, TRACKED_JOURNALS[0].path), "changed tracked baseline\n");
  git(changed.destinationRoot, ["add", "--force", "--", TRACKED_JOURNALS[0].path]);
  git(changed.destinationRoot, ["commit", "--quiet", "-m", "change tracked baseline"]);
  const changedReplay = await prepareWorktreeStateV1(changed);
  assert.equal(changedReplay.state, "blocked");
  assert.equal(changedReplay.reasonCode, "prepared_state_stale");
  await assertStaleDoctor(changed.destinationRoot);
});

test("accepts legacy baseline-free v1 receipts only while the live tracked baseline remains empty", async () => {
  const current = await fixture();
  const prepared = await prepareWorktreeStateV1(current);
  assert.equal(prepared.state, "ready");
  assert.equal(Object.hasOwn(prepared.receipt, "trackedBaselineExclusions"), false);
  const path = ".shield/journals/late-bootstrap.jsonl";
  await mkdir(dirname(join(current.destinationRoot, path)), { recursive: true });
  await writeFile(join(current.destinationRoot, path), "late\n");
  git(current.destinationRoot, ["add", "--force", "--", path]);
  git(current.destinationRoot, ["commit", "--quiet", "-m", "add late tracked baseline"]);
  const replay = await prepareWorktreeStateV1(current);
  assert.equal(replay.state, "blocked");
  assert.equal(replay.reasonCode, "prepared_state_stale");
});

test("blocks dirty and detached destinations before mutation", async () => {
  const dirty = await fixture();
  await writeFile(join(dirty.destinationRoot, "dirty.txt"), "dirty\n");
  const dirtyResult = await prepareWorktreeStateV1(dirty);
  assert.equal(dirtyResult.state, "blocked");
  assert.equal(dirtyResult.reasonCode, "destination_dirty");

  const detached = await fixture();
  git(detached.destinationRoot, ["checkout", "--quiet", "--detach"]);
  const detachedResult = await prepareWorktreeStateV1(detached);
  assert.equal(detachedResult.state, "blocked");
  assert.equal(detachedResult.reasonCode, "destination_detached");
});

test("blocks malformed policy agreement and source descriptor drift", async () => {
  const malformed = await fixture();
  const configPath = join(malformed.sourceRoot, ".shield", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.trustedHumanBindingRefs[0].bindingRef = "ed25519:sha256:not-the-registry-key";
  await writeFile(configPath, `${JSON.stringify(config)}\n`);
  const mismatch = await prepareWorktreeStateV1(malformed);
  assert.equal(mismatch.state, "blocked");
  assert.equal(mismatch.reasonCode, "source_policy_mismatch");

  const drift = await fixture();
  const driftResult = await prepareWorktreeStateV1ForTest(drift, {
    phase: async (phase) => {
      if (phase === "source_captured") {
        await writeFile(join(drift.sourceRoot, ".shield", "config.json"), "{}\n");
      }
    },
  });
  assert.equal(driftResult.state, "blocked");
  assert.equal(driftResult.reasonCode, "source_policy_drift");
});

test("revalidates before the first destination mutation, on replay, and after before_ready", async () => {
  const beforeMutation = await fixture();
  const beforeMutationResult = await prepareWorktreeStateV1ForTest(beforeMutation, {
    phase: async (phase) => {
      if (phase === "before_destination_mutation") {
        await writeFile(join(beforeMutation.sourceRoot, ".shield", "config.json"), "{}\n");
      }
    },
  });
  assert.equal(beforeMutationResult.state, "blocked");
  assert.equal(beforeMutationResult.reasonCode, "source_policy_drift");
  await assert.rejects(() => lstat(join(beforeMutation.destinationRoot, ".shield")), { code: "ENOENT" });

  const replayed = await fixture();
  assert.equal((await prepareWorktreeStateV1(replayed)).state, "ready");
  const replayResult = await prepareWorktreeStateV1ForTest(replayed, {
    phase: async (phase) => {
      if (phase === "before_replay_ready") {
        await writeFile(join(replayed.sourceRoot, ".shield", "config.json"), "{}\n");
      }
    },
  });
  assert.equal(replayResult.state, "blocked");
  assert.equal(replayResult.reasonCode, "source_policy_drift");

  const finalBoundary = await fixture();
  const finalResult = await prepareWorktreeStateV1ForTest(finalBoundary, {
    phase: async (phase) => {
      if (phase === "before_ready") {
        await writeFile(join(finalBoundary.sourceRoot, ".shield", "config.json"), "{}\n");
      }
    },
  });
  assert.equal(finalResult.state, "recovery_required");
  assert.equal(finalResult.reasonCode, "filesystem_outcome_uncertain");
});

test("rejects symlink, FIFO, and hardlink source policy substitutions without hanging", async () => {
  const symlinked = await fixture();
  const symlinkConfig = join(symlinked.sourceRoot, ".shield", "config.json");
  await unlink(symlinkConfig);
  await symlink("../../package.json", symlinkConfig);
  const symlinkResult = await prepareWorktreeStateV1(symlinked);
  assert.equal(symlinkResult.state, "blocked");
  assert.equal(symlinkResult.reasonCode, "source_policy_unsafe");

  const fifo = await fixture();
  const fifoConfig = join(fifo.sourceRoot, ".shield", "config.json");
  await unlink(fifoConfig);
  execFileSync("mkfifo", [fifoConfig]);
  const fifoResult = await prepareWorktreeStateV1(fifo);
  assert.equal(fifoResult.state, "blocked");
  assert.equal(fifoResult.reasonCode, "source_policy_unsafe");

  const hardlinked = await fixture();
  const hardlinkConfig = join(hardlinked.sourceRoot, ".shield", "config.json");
  await link(hardlinkConfig, join(hardlinked.sourceRoot, ".shield", "config-hardlink.json"));
  const hardlinkResult = await prepareWorktreeStateV1(hardlinked);
  assert.equal(hardlinkResult.state, "blocked");
  assert.equal(hardlinkResult.reasonCode, "source_policy_unsafe");
});

test("serializes concurrent preparation and detects path substitution", async () => {
  const concurrent = await fixture();
  let release;
  const paused = new Promise((resolve) => { release = resolve; });
  let locked;
  const lockObserved = new Promise((resolve) => { locked = resolve; });
  const first = prepareWorktreeStateV1ForTest(concurrent, {
    phase: async (phase) => {
      if (phase === "lock_acquired") {
        locked();
        await paused;
      }
    },
  });
  await lockObserved;
  try {
    const rival = await prepareWorktreeStateV1(concurrent);
    assert.equal(rival.state, "blocked");
    assert.equal(rival.reasonCode, "preparation_in_progress");
  } finally {
    release();
  }
  assert.equal((await first).state, "ready");

  const substituted = await fixture();
  const result = await prepareWorktreeStateV1ForTest(substituted, {
    phase: async (phase) => {
      if (phase === "before_install") {
        await symlink("../../package.json", join(substituted.destinationRoot, ".shield", ".gitignore"));
      }
    },
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reasonCode, "destination_conflict");
  assert.equal(await readFile(join(substituted.destinationRoot, "package.json"), "utf8"), "{\"private\":true}\n");
});

test("tracks lock and temporary artifacts immediately and closes cleanup uncertainty", async () => {
  for (const operation of [
    "after_lock_create",
    "after_lock_file_sync",
    "after_temporary_create",
    "after_temporary_file_sync",
  ]) {
    const current = await fixture();
    let injected = false;
    const result = await prepareWorktreeStateV1ForTest(current, {
      filesystem: ({ operation: observed }) => {
        if (!injected && observed === operation) {
          injected = true;
          throw new Error(`injected ${operation}`);
        }
      },
    });
    assert.equal(injected, true, operation);
    assert.equal(result.state, "blocked", `${operation}: ${JSON.stringify(result)}`);
    assert.equal(result.reasonCode, "operation_failed", operation);
    assert.deepEqual(await readdir(join(current.destinationRoot, ".shield")), [], operation);
    assert.equal((await prepareWorktreeStateV1(current)).state, "ready", operation);
  }

  for (const syncOccurrence of [1, 2]) {
    const current = await fixture();
    let observed = 0;
    const result = await prepareWorktreeStateV1ForTest(current, {
      syncDirectoryPath: async (path) => {
        if (++observed === syncOccurrence) throw new Error(`injected pre-install directory sync ${syncOccurrence}`);
        await syncDirectory(path);
      },
    });
    assert.equal(result.state, "blocked", JSON.stringify(result));
    assert.equal(result.reasonCode, "operation_failed");
    assert.deepEqual(await readdir(join(current.destinationRoot, ".shield")), []);
    assert.equal((await prepareWorktreeStateV1(current)).state, "ready");
  }

  const uncertain = await fixture();
  let creationFailure = false;
  let cleanupFailure = false;
  const result = await prepareWorktreeStateV1ForTest(uncertain, {
    filesystem: ({ operation }) => {
      if (!creationFailure && operation === "after_temporary_create") {
        creationFailure = true;
        throw new Error("injected temporary failure");
      }
      if (!cleanupFailure && operation === "before_cleanup_directory_sync") {
        cleanupFailure = true;
        throw new Error("injected cleanup sync uncertainty");
      }
    },
  });
  assert.equal(creationFailure, true);
  assert.equal(cleanupFailure, true);
  assert.equal(result.state, "recovery_required");
  assert.equal(result.reasonCode, "filesystem_outcome_uncertain");
});

test("installation fault seam returns recovery without compensating final-file deletion", async () => {
  const cases = [
    { operation: "linkPath", occurrence: 1, installedCount: 0 },
    { operation: "linkPath", occurrence: 2, installedCount: 1 },
    { operation: "syncDirectoryPath", occurrence: 3, installedCount: 1 },
    { operation: "syncDirectoryPath", occurrence: 4, installedCount: 1 },
    { operation: "syncDirectoryPath", occurrence: 5, installedCount: 2 },
    { operation: "unlinkPath", occurrence: 2, installedCount: 2 },
    { operation: "readInstalledPath", occurrence: 2, installedCount: 2 },
  ];
  for (const fault of cases) {
    const current = await fixture();
    let observed = 0;
    const fail = () => {
      if (++observed === fault.occurrence) throw new Error(`injected ${fault.operation} ${fault.occurrence}`);
    };
    const dependencies = fault.operation === "linkPath"
      ? { linkPath: async (source, destination) => { fail(); await link(source, destination); } }
      : fault.operation === "syncDirectoryPath"
        ? { syncDirectoryPath: async (path) => { fail(); await syncDirectory(path); } }
        : fault.operation === "unlinkPath"
          ? { unlinkPath: async (path) => { fail(); await unlink(path); } }
          : { readInstalledPath: async (path) => { fail(); return readFile(path); } };
    const result = await prepareWorktreeStateV1ForTest(current, dependencies);
    assert.equal(result.state, "recovery_required", `${fault.operation}: ${JSON.stringify(result)}`);
    assert.equal(result.reasonCode, "filesystem_outcome_uncertain", fault.operation);
    for (let index = 0; index < WORKTREE_STATE_INSTALLED_PATHS.length; index += 1) {
      assert.equal(
        await exists(join(current.destinationRoot, WORKTREE_STATE_INSTALLED_PATHS[index])),
        index < fault.installedCount,
        `${fault.operation}: final path ${index}`,
      );
    }
  }
});

test("lock unlink and final directory-sync uncertainty override ready while exact completion replays", async () => {
  const lockUnlink = await fixture();
  let lockFault = false;
  const lockResult = await prepareWorktreeStateV1ForTest(lockUnlink, {
    unlinkPath: async (path) => {
      if (!lockFault && path.endsWith("/.worktree-prepare.lock")) {
        lockFault = true;
        throw new Error("injected lock unlink uncertainty");
      }
      await unlink(path);
    },
  });
  assert.equal(lockFault, true);
  assert.equal(lockResult.state, "recovery_required");
  assert.equal(await exists(join(lockUnlink.destinationRoot, ".shield", ".worktree-prepare.lock")), true);
  for (const relative of WORKTREE_STATE_INSTALLED_PATHS) {
    assert.equal(await exists(join(lockUnlink.destinationRoot, relative)), true, relative);
  }

  const finalSync = await fixture();
  let syncFault = false;
  let lockUnlinked = false;
  const syncResult = await prepareWorktreeStateV1ForTest(finalSync, {
    unlinkPath: async (path) => {
      await unlink(path);
      if (path.endsWith("/.worktree-prepare.lock")) lockUnlinked = true;
    },
    syncDirectoryPath: async (path) => {
      if (lockUnlinked && !syncFault) {
        syncFault = true;
        throw new Error("injected final directory sync uncertainty");
      }
      await syncDirectory(path);
    },
  });
  assert.equal(syncFault, true);
  assert.equal(syncResult.state, "recovery_required");
  assert.equal(await exists(join(finalSync.destinationRoot, ".shield", ".worktree-prepare.lock")), false);
  for (const relative of WORKTREE_STATE_INSTALLED_PATHS) {
    assert.equal(await exists(join(finalSync.destinationRoot, relative)), true, relative);
  }
  const replay = await prepareWorktreeStateV1(finalSync);
  assert.equal(replay.state, "already_prepared", JSON.stringify(replay));
});

test("reports interruption after installation as recovery-required and exact retry as prepared", async () => {
  const current = await fixture();
  const interrupted = await prepareWorktreeStateV1ForTest(current, {
    phase: (phase) => {
      if (phase === "after_install") throw new Error("injected interruption");
    },
  });
  assert.equal(interrupted.state, "recovery_required");
  assert.equal(interrupted.reasonCode, "filesystem_outcome_uncertain");
  const retry = await prepareWorktreeStateV1(current);
  assert.equal(retry.state, "already_prepared");
});

test("prepares two independent linked-worktree lanes concurrently", async () => {
  const first = await fixture();
  const secondRoot = join(first.sourceRoot, "..", `destination-two-${process.pid}-${Date.now()}`);
  git(first.sourceRoot, ["worktree", "add", "--quiet", "-b", `lane-two-${process.pid}-${Date.now()}`, secondRoot, "HEAD"]);
  const second = { sourceRoot: first.sourceRoot, destinationRoot: await realpath(secondRoot) };
  const [left, right] = await Promise.all([prepareWorktreeStateV1(first), prepareWorktreeStateV1(second)]);
  assert.equal(left.state, "ready");
  assert.equal(right.state, "ready");
  assert.notEqual(left.receipt.destination.root, right.receipt.destination.root);
  assert.equal(left.receipt.commonGitDirectory, right.receipt.commonGitDirectory);
});

test("classifies manual and uninitialized policy without repairing either", async () => {
  const current = await fixture();
  const uninitialized = await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: false, configValid: false });
  assert.equal(uninitialized.classification, "uninitialized_worktree");
  assert.equal(uninitialized.ok, false);
  const manual = await inspectWorktreeStateV1({ root: current.sourceRoot, configPresent: true, configValid: true });
  assert.equal(manual.classification, "manual_policy_present");
  assert.equal(manual.ok, true);
});

test("rejects unsafe source, destination, and doctor ancestor components", async () => {
  const aliased = await fixture();
  const aliasRoot = join(aliased.sourceRoot, "..", "ancestor-alias");
  await symlink(await realpath(join(aliased.sourceRoot, "..")), aliasRoot);
  const aliasResult = await prepareWorktreeStateV1({
    sourceRoot: join(aliasRoot, "source"),
    destinationRoot: aliased.destinationRoot,
  });
  assert.equal(aliasResult.state, "blocked");
  assert.equal(aliasResult.reasonCode, "root_invalid");
  await assert.rejects(() => lstat(join(aliased.destinationRoot, ".shield")), { code: "ENOENT" });
  const aliasDoctor = await inspectWorktreeStateV1({
    root: join(aliasRoot, "destination"),
    configPresent: false,
    configValid: false,
  });
  assert.equal(aliasDoctor.classification, "stale_or_malformed_worktree_state");

  const sourceAncestor = await fixture();
  const realPolicy = join(sourceAncestor.sourceRoot, ".shield-real");
  await rename(join(sourceAncestor.sourceRoot, ".shield"), realPolicy);
  await symlink(".shield-real", join(sourceAncestor.sourceRoot, ".shield"));
  const sourceResult = await prepareWorktreeStateV1(sourceAncestor);
  assert.equal(sourceResult.state, "blocked");
  assert.equal(sourceResult.reasonCode, "source_policy_unsafe");

  const doctorUnsafe = await fixture();
  await symlink(join(doctorUnsafe.sourceRoot, ".shield"), join(doctorUnsafe.destinationRoot, ".shield"));
  const doctorResult = await inspectWorktreeStateV1({
    root: doctorUnsafe.destinationRoot,
    configPresent: false,
    configValid: false,
  });
  assert.equal(doctorResult.classification, "stale_or_malformed_worktree_state");
  assert.equal(doctorResult.ok, false);
});

test("refreshes a clean same-branch fast-forward into one deterministic v2 chain without touching mission state", async () => {
  const current = await fixture();
  const prepared = await prepareOrRefreshWorktreeStateV2(current);
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));
  const activePath = join(current.destinationRoot, ".shield", "worktree-state.json");
  const predecessorBytes = await readFile(activePath);
  await mkdir(join(current.destinationRoot, ".shield", "journals"), { recursive: true });
  await mkdir(join(current.destinationRoot, ".shield", "audit"), { recursive: true });
  await mkdir(join(current.destinationRoot, ".shield", "artifacts"), { recursive: true });
  await mkdir(join(current.destinationRoot, ".shield", "runtime"), { recursive: true });
  await mkdir(join(current.destinationRoot, ".shield", "tmp"), { recursive: true });
  const missionPaths = [
    [join(current.destinationRoot, ".shield", "journals", "mission.jsonl"), "journal\n"],
    [join(current.destinationRoot, ".shield", "audit", "receipt.json"), "audit\n"],
    [join(current.destinationRoot, ".shield", "artifacts", "result.json"), "artifact\n"],
    [join(current.destinationRoot, ".shield", "runtime", "context.json"), "runtime\n"],
    [join(current.destinationRoot, ".shield", "tmp", "scratch.json"), "tmp\n"],
    [join(current.destinationRoot, ".shield", "dispatch-receipts.jsonl"), "dispatch\n"],
  ];
  for (const [path, bytes] of missionPaths) await writeFile(path, bytes);
  const beforeMission = await Promise.all(missionPaths.map(async ([path]) => ({
    path,
    bytes: await readFile(path),
    stats: await lstat(path),
  })));
  await writeFile(join(current.destinationRoot, "package.json"), "{\"private\":true,\"version\":1}\n");
  git(current.destinationRoot, ["add", "package.json"]);
  git(current.destinationRoot, ["commit", "--quiet", "-m", "advance prepared lane"]);

  const refreshed = await prepareOrRefreshWorktreeStateV2(current);
  assert.equal(refreshed.state, "refreshed", JSON.stringify(refreshed));
  assert.equal(worktreePreparationIsReadyV2(refreshed), true);
  assert.equal(validateWorktreeStateReceiptV2(refreshed.receipt), true);
  assert.deepEqual(Object.keys(refreshed).sort(), [
    "authority", "contractVersion", "destinationRoot", "exclusions", "nextAction", "reasonCode", "receipt",
    "receiptDigest", "schemaVersion", "sourceRoot", "state", "summary",
  ].sort());
  assert.deepEqual(Object.keys(refreshed.receipt).sort(), [
    "authority", "commonGitDirectory", "contractVersion", "destination", "exclusions", "installedByteDigests",
    "installedPaths", "policy", "publicBindings", "reasonCode", "receiptDigest", "repositoryId", "schemaVersion",
    "state", "summary", "supersedes", "trackedBaselineExclusions",
  ].sort());
  const { receiptDigest: resultDigest, ...resultBody } = refreshed;
  assert.equal(resultDigest, sha256(canonicalJson(resultBody)));
  assert.equal(validateWorktreeStateReceiptV2(withReceiptDigest({ ...refreshed.receipt, extra: true })), false);
  assert.equal(refreshed.receipt.supersedes.receiptDigest, prepared.receipt.receiptDigest);
  assert.equal(refreshed.receipt.supersedes.destinationHead, prepared.receipt.destination.head);
  assert.equal(refreshed.receipt.destination.head, git(current.destinationRoot, ["rev-parse", "HEAD"]));
  assert.deepEqual(
    await readFile(join(current.destinationRoot, ".shield", "worktree-state-receipts", `${prepared.receipt.receiptDigest}.json`)),
    predecessorBytes,
  );
  assert.equal(await validateWorktreeStateReceiptFileChainV1OrV2(current.destinationRoot, refreshed.receipt), true);
  for (const before of beforeMission) {
    const after = await lstat(before.path);
    assert.deepEqual(await readFile(before.path), before.bytes);
    assert.equal(after.dev, before.stats.dev);
    assert.equal(after.ino, before.stats.ino);
  }
  const successorBytes = await readFile(activePath);
  const alternateSource = join(dirname(current.destinationRoot), "alternate-source");
  git(current.sourceRoot, ["worktree", "add", "--quiet", "-b", `source-${process.pid}-${Date.now()}`, alternateSource, "HEAD"]);
  await mkdir(join(alternateSource, ".shield"));
  for (const name of ["config.json", "trusted-human-bindings.json"]) {
    await writeFile(join(alternateSource, ".shield", name), await readFile(join(current.sourceRoot, ".shield", name)));
  }
  const replay = await prepareOrRefreshWorktreeStateV2({
    sourceRoot: await realpath(alternateSource),
    destinationRoot: current.destinationRoot,
  });
  assert.equal(replay.state, "already_refreshed", JSON.stringify(replay));
  assert.equal(replay.receipt.receiptDigest, refreshed.receipt.receiptDigest);
  assert.equal(Object.hasOwn(replay.receipt, "source"), false);
  assert.deepEqual(await readFile(activePath), successorBytes);
  assert.deepEqual(await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: true, configValid: true }), {
    classification: "prepared_worktree",
    ok: true,
    message: "Prepared worktree policy and immutable provenance receipt are exact; mission-local state directories are present.",
    receiptDigest: refreshed.receipt.receiptDigest,
  });
});

test("refresh blocks dirty, detached, renamed, rewritten, policy-drifted, and unsafe baseline states before archive mutation", async (context) => {
  const cases = [
    ["dirty", "destination_dirty", async (current) => writeFile(join(current.destinationRoot, "dirty.txt"), "dirty\n")],
    ["detached", "destination_detached", async (current) => { git(current.destinationRoot, ["checkout", "--quiet", "--detach"]); }],
    ["renamed", "predecessor_branch_mismatch", async (current) => { git(current.destinationRoot, ["branch", "-m", `renamed-${Date.now()}`]); }],
    ["rewritten", "predecessor_not_ancestor", async (current) => {
      await writeFile(join(current.destinationRoot, "package.json"), "{\"private\":true,\"rewritten\":true}\n");
      git(current.destinationRoot, ["add", "package.json"]);
      git(current.destinationRoot, ["commit", "--quiet", "--amend", "-m", "rewritten lane"]);
    }],
    ["policy drift", "prepared_state_stale", async (current) => {
      const path = join(current.sourceRoot, ".shield", "config.json");
      const parsed = JSON.parse(await readFile(path, "utf8"));
      await writeFile(path, `${JSON.stringify(parsed)}\n`);
      await advanceDestination(current);
    }],
    ["unsafe baseline", "destination_conflict", async (current) => {
      const path = join(current.destinationRoot, TRACKED_JOURNALS[0].path);
      const duplicate = join(dirname(current.destinationRoot), "journal-hardlink-source.jsonl");
      await writeFile(duplicate, await readFile(path));
      await unlink(path);
      await link(duplicate, path);
    }, trackedFixture],
  ];
  for (const [name, reasonCode, mutate, create = fixture] of cases) {
    await context.test(name, async () => {
      const current = await create();
      const prepared = await prepareOrRefreshWorktreeStateV2(current);
      assert.equal(prepared.state, "ready");
      const activePath = join(current.destinationRoot, ".shield", "worktree-state.json");
      const activeBytes = await readFile(activePath);
      await mutate(current);
      const result = await prepareOrRefreshWorktreeStateV2(current);
      assert.equal(result.state, "blocked", JSON.stringify(result));
      assert.equal(result.reasonCode, reasonCode);
      assert.deepEqual(await readFile(activePath), activeBytes);
      assert.equal(await exists(join(current.destinationRoot, ".shield", "worktree-state-receipts")), false);
    });
  }
});

test("refresh binds the current tracked baseline after a safe committed change", async () => {
  const current = await trackedFixture();
  const prepared = await prepareOrRefreshWorktreeStateV2(current);
  assert.equal(prepared.state, "ready");
  const changedPath = join(current.destinationRoot, TRACKED_JOURNALS[0].path);
  await writeFile(changedPath, "changed tracked mission baseline\n");
  git(current.destinationRoot, ["add", "--force", "--", TRACKED_JOURNALS[0].path]);
  git(current.destinationRoot, ["commit", "--quiet", "-m", "advance tracked mission baseline"]);
  const refreshed = await prepareOrRefreshWorktreeStateV2(current);
  assert.equal(refreshed.state, "refreshed", JSON.stringify(refreshed));
  const record = refreshed.receipt.trackedBaselineExclusions.find(({ path }) => path === TRACKED_JOURNALS[0].path);
  assert.equal(record.byteSha256, sha256(await readFile(changedPath)));
  assert.equal(record.headBlobOid, git(current.destinationRoot, ["rev-parse", `HEAD:${TRACKED_JOURNALS[0].path}`]));
});

test("replacement refs cannot alter V2 baseline construction, chain identity, replay, or doctor verdicts", async () => {
  const current = await trackedFixture();
  const prepared = await prepareOrRefreshWorktreeStateV2(current);
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));
  const predecessorHead = prepared.receipt.destination.head;
  const baselinePath = join(current.destinationRoot, TRACKED_JOURNALS[0].path);
  await writeFile(baselinePath, "replacement-immune current baseline\n");
  git(current.destinationRoot, ["add", "--force", "--", TRACKED_JOURNALS[0].path]);
  git(current.destinationRoot, ["commit", "--quiet", "-m", "advance replacement-immune baseline"]);
  const currentHead = git(current.destinationRoot, ["--no-replace-objects", "rev-parse", "HEAD"]);
  const predecessorTree = git(current.destinationRoot, ["--no-replace-objects", "rev-parse", `${predecessorHead}^{tree}`]);
  const currentTree = git(current.destinationRoot, ["--no-replace-objects", "rev-parse", `${currentHead}^{tree}`]);
  const predecessorReplacement = git(current.destinationRoot, ["commit-tree", currentTree, "-m", "replacement predecessor"]);
  const currentReplacement = git(current.destinationRoot, ["commit-tree", predecessorTree, "-m", "replacement current"]);
  git(current.destinationRoot, ["replace", predecessorHead, predecessorReplacement]);
  git(current.destinationRoot, ["replace", currentHead, currentReplacement]);
  assert.notEqual(
    git(current.destinationRoot, ["rev-parse", `${currentHead}:${TRACKED_JOURNALS[0].path}`]),
    git(current.destinationRoot, ["--no-replace-objects", "rev-parse", `${currentHead}:${TRACKED_JOURNALS[0].path}`]),
  );

  const refreshed = await prepareOrRefreshWorktreeStateV2(current);
  assert.equal(refreshed.state, "refreshed", JSON.stringify(refreshed));
  assert.equal(refreshed.receipt.destination.head, currentHead);
  assert.equal(
    refreshed.receipt.trackedBaselineExclusions[0].headBlobOid,
    git(current.destinationRoot, ["--no-replace-objects", "rev-parse", `${currentHead}:${TRACKED_JOURNALS[0].path}`]),
  );
  assert.equal(await validateWorktreeStateReceiptFileChainV1OrV2(current.destinationRoot, refreshed.receipt), true);
  const replacedDoctor = await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: true, configValid: true });
  assert.equal(replacedDoctor.classification, "prepared_worktree");
  assert.equal(replacedDoctor.receiptDigest, refreshed.receipt.receiptDigest);

  git(current.destinationRoot, ["replace", "-d", predecessorHead]);
  git(current.destinationRoot, ["replace", "-d", currentHead]);
  const replay = await prepareOrRefreshWorktreeStateV2(current);
  assert.equal(replay.state, "already_refreshed", JSON.stringify(replay));
  assert.equal(replay.receipt.receiptDigest, refreshed.receipt.receiptDigest);
  assert.equal(await validateWorktreeStateReceiptFileChainV1OrV2(current.destinationRoot, replay.receipt), true);
  assert.deepEqual(
    await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: true, configValid: true }),
    replacedDoctor,
  );
});

test("a valid 256-predecessor chain cannot be extended and remains byte-exact", async () => {
  const current = await fixture();
  const prepared = await prepareOrRefreshWorktreeStateV2(current);
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));
  const archiveRoot = join(current.destinationRoot, ".shield", "worktree-state-receipts");
  await mkdir(archiveRoot, { mode: 0o700 });
  let active = prepared.receipt;
  for (let index = 1; index <= 256; index += 1) {
    git(current.destinationRoot, ["commit", "--quiet", "--allow-empty", "-m", `receipt chain ${index}`]);
    const head = git(current.destinationRoot, ["--no-replace-objects", "rev-parse", "HEAD"]);
    await writeFile(join(archiveRoot, `${active.receiptDigest}.json`), `${canonicalJson(active)}\n`);
    active = successorReceipt(active, head);
  }
  await writeReceipt(current.destinationRoot, active);
  assert.equal(await validateWorktreeStateReceiptFileChainV1OrV2(current.destinationRoot, active), true);
  await advanceDestination(current, "attempt receipt chain 257");
  const activePath = join(current.destinationRoot, ".shield", "worktree-state.json");
  const activeBytes = await readFile(activePath);
  const archiveBefore = await Promise.all((await readdir(archiveRoot)).sort().map(async (name) => [name, await readFile(join(archiveRoot, name))]));

  const rejected = await prepareOrRefreshWorktreeStateV2(current);
  assert.equal(rejected.state, "blocked", JSON.stringify(rejected));
  assert.equal(rejected.reasonCode, "receipt_chain_invalid");
  assert.deepEqual(await readFile(activePath), activeBytes);
  const archiveAfter = await Promise.all((await readdir(archiveRoot)).sort().map(async (name) => [name, await readFile(join(archiveRoot, name))]));
  assert.deepEqual(archiveAfter, archiveBefore);
});

test("missing, substituted, and extra archive entries fail closed and make doctor unhealthy", async (context) => {
  for (const kind of ["missing", "substituted", "extra"]) {
    await context.test(kind, async () => {
      const current = await fixture();
      const prepared = await prepareOrRefreshWorktreeStateV2(current);
      await advanceDestination(current);
      const refreshed = await prepareOrRefreshWorktreeStateV2(current);
      assert.equal(refreshed.state, "refreshed", JSON.stringify(refreshed));
      const archiveRoot = join(current.destinationRoot, ".shield", "worktree-state-receipts");
      const predecessorPath = join(archiveRoot, `${prepared.receipt.receiptDigest}.json`);
      if (kind === "missing") await unlink(predecessorPath);
      if (kind === "substituted") await writeFile(predecessorPath, "{}\n");
      if (kind === "extra") await writeFile(join(archiveRoot, `${"0".repeat(64)}.json`), "{}\n");
      const replay = await prepareOrRefreshWorktreeStateV2(current);
      assert.equal(replay.state, kind === "missing" ? "recovery_required" : "blocked", JSON.stringify(replay));
      if (kind !== "missing") assert.equal(replay.reasonCode, "prepared_state_stale");
      assert.equal((await inspectWorktreeStateV1({ root: current.destinationRoot, configPresent: true, configValid: true })).ok, false);
    });
  }
});

test("refresh filesystem seams return recovery without deleting ambiguous durable state", async (context) => {
  const operations = [
    "archive_directory_create", "archive_file_create", "archive_file_sync", "archive_readback", "successor_file_create",
    "successor_file_sync", "active_receipt_replace", "active_receipt_readback", "directory_sync", "lock_release",
  ];
  for (const operation of operations) {
    await context.test(operation, async () => {
      const current = await fixture();
      assert.equal((await prepareOrRefreshWorktreeStateV2(current)).state, "ready");
      await advanceDestination(current, `advance for ${operation}`);
      let injected = false;
      const result = await prepareOrRefreshWorktreeStateV2ForTest(current, {
        nonce: () => "faultboundary",
        filesystem: ({ operation: observed }) => {
          if (!injected && observed === operation) {
            injected = true;
            throw new Error(`injected ${operation}`);
          }
        },
      });
      assert.equal(injected, true, operation);
      assert.equal(result.state, "recovery_required", JSON.stringify(result));
      const entries = await readdir(join(current.destinationRoot, ".shield"));
      if (operation === "successor_file_create" || operation === "successor_file_sync") {
        assert.equal(entries.some((name) => name.startsWith(".worktree-refresh-") && name.endsWith(".tmp")), true);
      }
      if (operation === "active_receipt_replace" || operation === "active_receipt_readback" || operation === "lock_release") {
        const replay = await prepareOrRefreshWorktreeStateV2(current);
        assert.equal(replay.state, "already_refreshed", JSON.stringify(replay));
      }
    });
  }
});

test("abrupt child termination retains each durable seam state and preserves mission state", async (context) => {
  const cases = [
    { operation: "archive_directory_create", occurrence: 1, phase: "old_empty_archive", expected: "refreshed" },
    { operation: "directory_sync", occurrence: 1, phase: "old_empty_archive", expected: "refreshed" },
    { operation: "archive_file_create", occurrence: 1, phase: "partial_archive", expected: "blocked" },
    { operation: "archive_file_sync", occurrence: 1, phase: "old_exact_archive", expected: "refreshed" },
    { operation: "archive_readback", occurrence: 1, phase: "old_exact_archive", expected: "refreshed" },
    { operation: "directory_sync", occurrence: 2, phase: "old_exact_archive", expected: "refreshed" },
    { operation: "successor_file_create", occurrence: 1, phase: "temporary", expected: "recovery_required" },
    { operation: "successor_file_sync", occurrence: 1, phase: "temporary", expected: "recovery_required" },
    { operation: "directory_sync", occurrence: 3, phase: "temporary", expected: "recovery_required" },
    { operation: "active_receipt_replace", occurrence: 1, phase: "new_active", expected: "already_refreshed" },
    { operation: "active_receipt_readback", occurrence: 1, phase: "new_active", expected: "already_refreshed" },
    { operation: "directory_sync", occurrence: 4, phase: "new_active", expected: "already_refreshed" },
    { operation: "lock_release", occurrence: 1, phase: "new_active_unlocked", expected: "already_refreshed" },
    { operation: "directory_sync", occurrence: 5, phase: "new_active_unlocked", expected: "already_refreshed" },
  ];
  for (const crash of cases) {
    await context.test(`${crash.operation}:${crash.occurrence}`, async () => {
      const current = await fixture();
      const prepared = await prepareOrRefreshWorktreeStateV2(current);
      assert.equal(prepared.state, "ready", JSON.stringify(prepared));
      const missionState = await installRepresentativeMissionState(current.destinationRoot);
      await advanceDestination(current, `abrupt ${crash.operation}:${crash.occurrence}`);
      const activePath = join(current.destinationRoot, ".shield", "worktree-state.json");
      const predecessorBytes = await readFile(activePath);
      const child = await runAbruptRefresh(current, crash.operation, crash.occurrence);
      assert.equal(child.signal, "SIGKILL", `${JSON.stringify(crash)}: ${child.stderr}`);
      assert.equal(child.status, null, JSON.stringify(crash));

      const shieldRoot = join(current.destinationRoot, ".shield");
      const entries = (await readdir(shieldRoot)).sort();
      const lockPath = join(shieldRoot, ".worktree-prepare.lock");
      const lockPresent = entries.includes(".worktree-prepare.lock");
      const temporaryNames = entries.filter((name) => name.startsWith(".worktree-refresh-") && name.endsWith(".tmp"));
      const archiveRoot = join(shieldRoot, "worktree-state-receipts");
      const archiveNames = await exists(archiveRoot) ? (await readdir(archiveRoot)).sort() : [];
      const retainedActive = await readFile(activePath);
      await assertMissionStateIdentity(missionState);

      assert.equal(lockPresent, !crash.phase.endsWith("unlocked"), JSON.stringify(crash));
      assert.equal(temporaryNames.length > 0, crash.phase === "temporary", JSON.stringify(crash));
      assert.equal(retainedActive.equals(predecessorBytes), !crash.phase.startsWith("new_active"), JSON.stringify(crash));
      if (crash.phase === "old_empty_archive") assert.deepEqual(archiveNames, []);
      if (crash.phase === "partial_archive") {
        assert.deepEqual(archiveNames, [`${prepared.receipt.receiptDigest}.json`]);
        assert.equal((await readFile(join(archiveRoot, archiveNames[0]))).length, 0);
      }
      if (["old_exact_archive", "temporary", "new_active", "new_active_unlocked"].includes(crash.phase)) {
        assert.deepEqual(archiveNames, [`${prepared.receipt.receiptDigest}.json`]);
        assert.deepEqual(await readFile(join(archiveRoot, archiveNames[0])), predecessorBytes);
      }

      if (lockPresent) {
        const locked = await prepareOrRefreshWorktreeStateV2(current);
        assert.equal(locked.state, "blocked", JSON.stringify(locked));
        assert.equal(locked.reasonCode, "preparation_in_progress");
        await unlink(lockPath);
        await syncDirectory(shieldRoot);
      }
      const observed = await prepareOrRefreshWorktreeStateV2(current);
      assert.equal(observed.state, crash.expected, `${JSON.stringify(crash)}: ${JSON.stringify(observed)}`);
      if (crash.phase === "partial_archive") assert.equal(observed.reasonCode, "prepared_state_stale");
      await assertMissionStateIdentity(missionState);
    });
  }
});

test("concurrent refreshes serialize on the existing destination lock", async () => {
  const current = await fixture();
  assert.equal((await prepareOrRefreshWorktreeStateV2(current)).state, "ready");
  await advanceDestination(current);
  let announceLock;
  let releaseLock;
  const locked = new Promise((resolveLocked) => { announceLock = resolveLocked; });
  const resume = new Promise((resolveResume) => { releaseLock = resolveResume; });
  const first = prepareOrRefreshWorktreeStateV2ForTest(current, {
    phase: async (phase) => {
      if (phase === "lock_acquired") {
        announceLock();
        await resume;
      }
    },
  });
  await locked;
  const rival = await prepareOrRefreshWorktreeStateV2(current);
  assert.equal(rival.state, "blocked", JSON.stringify(rival));
  assert.equal(rival.reasonCode, "preparation_in_progress");
  releaseLock();
  assert.equal((await first).state, "refreshed");
});
