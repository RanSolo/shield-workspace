import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdtemp, mkdir, open, readFile, readdir, realpath, rename, stat, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
  WORKTREE_STATE_EXCLUSIONS,
  WORKTREE_STATE_INSTALLED_PATHS,
  inspectWorktreeStateV1,
  prepareWorktreeStateV1,
  prepareWorktreeStateV1ForTest,
  validateWorktreeStateReceiptV1,
  worktreePreparationAuthorityV1,
  worktreePreparationIsReadyV1,
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

async function fixture({ trackedFiles = [] } = {}) {
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
  const config = createShieldConfig({
    repositoryId: "RanSolo/worktree-fixture",
    coulsonBindingRef: coulson.signingKeyRef,
    fitzBindingRef: fitz.signingKeyRef,
  });
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

  const outside = structuredClone(prepared.receipt);
  outside.trackedBaselineExclusions[0].path = ".shield/evidence/outside.jsonl";
  assert.equal(validateWorktreeStateReceiptV1(withReceiptDigest(outside)), false);

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
