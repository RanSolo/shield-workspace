import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { link, mkdtemp, mkdir, readFile, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function fixture() {
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
  git(sourceRoot, ["commit", "--quiet", "-m", "worktree fixture"]);
  git(sourceRoot, ["worktree", "add", "--quiet", "-b", `lane-${process.pid}-${Date.now()}`, destinationRoot, "HEAD"]);
  const coulson = binding("coulson");
  const fitz = binding("fitz");
  const config = createShieldConfig({
    repositoryId: "RanSolo/worktree-fixture",
    coulsonBindingRef: coulson.signingKeyRef,
    fitzBindingRef: fitz.signingKeyRef,
  });
  await mkdir(join(sourceRoot, ".shield"));
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

test("prepares the exact authority-neutral four-file state and replays without writes", async () => {
  const current = await fixture();
  const first = await prepareWorktreeStateV1(current);
  assert.equal(first.state, "ready", JSON.stringify(first));
  assert.equal(worktreePreparationIsReadyV1(first), true);
  assert.equal(worktreePreparationAuthorityV1(first), "none");
  assert.equal(validateWorktreeStateReceiptV1(first.receipt), true);
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
