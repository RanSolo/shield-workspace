import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ProcessUncertain,
  createNativeDependencies,
  inspectBootstrapBytes,
  launchTeammateTrial,
} from "./teammate-launch.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedHead = "fe4c751cd9299e740b3638c590da345ca315059d";
const wrongMain = "79243ee673aecc7506addbd2ee6372dd510e7e7e";
const bootstrapPath = "docs/missions/issue-307-teammate-demo-bootstrap.json";
const bootstrapSha256 = "789d184e31bbd220b81d029849c16399752a1c08c3d1cb973423324395a19664";
const receiptSuffix = ".shield-teammate-launch-v1.json";

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: workspaceRoot, encoding: "utf8", stdio: options.stdio ?? "pipe" });
}

function input(root, head = expectedHead, digest = bootstrapSha256, path = bootstrapPath) {
  return { root, expectedHead: head, bootstrapPath: path, bootstrapSha256: digest };
}

async function fixture(prefix) {
  const base = await mkdtemp(join(await realpath(tmpdir()), prefix));
  return { base, root: join(base, "checkout") };
}

function registered(root) {
  return git(["worktree", "list", "--porcelain"]).split(/\n\n/u)
    .some((record) => record.split("\n").includes(`worktree ${root}`));
}

async function cleanup({ base, root }) {
  if (registered(root)) execFileSync("git", ["worktree", "remove", root], { cwd: workspaceRoot, stdio: "pipe" });
  for (const path of [`${root}${receiptSuffix}`, `${root}${receiptSuffix}.lock`]) {
    try { await unlink(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  await rm(base, { recursive: true, force: false });
}

function exitResult(code) {
  return { state: "exit", code, stdout: "", stderr: "injected failure", errorCode: null };
}

test("bootstrap parser rejects stale, malformed, and authority-bearing packets", () => {
  const bytes = Buffer.from(git(["show", `${expectedHead}:${bootstrapPath}`]));
  assert.equal(inspectBootstrapBytes(bytes, bootstrapSha256).authority, "none");
  assert.throws(() => inspectBootstrapBytes(bytes, "0".repeat(64)), { reasonCode: "bootstrap_mismatch" });

  const malformed = JSON.parse(bytes.toString("utf8"));
  malformed.authority = "wheels_up";
  const malformedBytes = Buffer.from(`${JSON.stringify(malformed)}\n`);
  const digest = createHash("sha256").update(malformedBytes).digest("hex");
  assert.throws(() => inspectBootstrapBytes(malformedBytes, digest), { reasonCode: "bootstrap_mismatch" });

  const unknown = JSON.parse(bytes.toString("utf8"));
  unknown.callerReady = true;
  const unknownBytes = Buffer.from(`${JSON.stringify(unknown)}\n`);
  const unknownDigest = createHash("sha256").update(unknownBytes).digest("hex");
  assert.throws(() => inspectBootstrapBytes(unknownBytes, unknownDigest), { reasonCode: "bootstrap_mismatch" });
});

test("wrong-main and missing bootstrap stop before mutation and emit no open action", { timeout: 30_000 }, async () => {
  const target = await fixture("shield-launch-wrong-main-");
  try {
    const result = await launchTeammateTrial(input(target.root, wrongMain));
    assert.equal(result.authority, "none");
    assert.equal(result.disposition, "action_required");
    assert.equal(result.reasonCode, "bootstrap_missing");
    assert.doesNotMatch(JSON.stringify(result), /code --new-window/u);
    assert.equal(registered(target.root), false);
  } finally { await cleanup(target); }
});

test("an interrupted worktree boundary is recovery-required and never cleaned automatically", { timeout: 30_000 }, async () => {
  const target = await fixture("shield-launch-worktree-boundary-");
  const native = createNativeDependencies();
  const dependencies = {
    ...native,
    runProcess: async (executable, args, options) => {
      const result = await native.runProcess(executable, args, options);
      if (executable === "git" && args.includes("worktree") && args.includes("add") && result.state === "success") return exitResult(19);
      return result;
    },
  };
  try {
    const result = await launchTeammateTrial(input(target.root), dependencies);
    assert.equal(result.disposition, "recovery_required");
    assert.equal(result.reasonCode, "recovery_required");
    assert.equal(registered(target.root), true);
    assert.doesNotMatch(JSON.stringify(result), /code --new-window/u);
  } finally { await cleanup(target); }
});

test("normal install failure is reconciled as actionable while process uncertainty fails closed", { timeout: 60_000 }, async () => {
  for (const uncertainty of [false, true]) {
    const target = await fixture(uncertainty ? "shield-launch-install-uncertain-" : "shield-launch-install-exit-");
    const native = createNativeDependencies();
    const dependencies = {
      ...native,
      runProcess: async (executable, args, options) => {
        if (executable === "npm" && args[0] === "ci") {
          if (uncertainty) throw new ProcessUncertain("injected_timeout");
          return exitResult(23);
        }
        return native.runProcess(executable, args, options);
      },
    };
    try {
      const result = await launchTeammateTrial(input(target.root), dependencies);
      assert.equal(result.authority, "none");
      assert.equal(result.reasonCode, uncertainty ? "recovery_required" : "dependencies_unavailable");
      assert.equal(result.disposition, uncertainty ? "recovery_required" : "action_required");
      assert.equal(registered(target.root), true);
    } finally { await cleanup(target); }
  }
});

test("target-local build failure cannot fall back to PATH nx", { timeout: 180_000 }, async () => {
  const target = await fixture("shield-launch-build-exit-");
  const native = createNativeDependencies();
  const dependencies = {
    ...native,
    runProcess: async (executable, args, options) => {
      if (executable === process.execPath && args.includes("@shield/team-system:build") && args.includes("--skipNxCache")) return exitResult(29);
      return native.runProcess(executable, args, options);
    },
  };
  try {
    const result = await launchTeammateTrial(input(target.root), dependencies);
    assert.equal(result.disposition, "action_required");
    assert.equal(result.reasonCode, "build_unavailable");
    assert.doesNotMatch(JSON.stringify(result), /code --new-window/u);
  } finally { await cleanup(target); }
});

test("partial receipt publication is recovery-required and retains the proven checkout", { timeout: 180_000 }, async () => {
  const target = await fixture("shield-launch-receipt-fault-");
  const native = createNativeDependencies();
  const failure = Object.assign(new Error("injected partial durability"), { code: "EIO" });
  const dependencies = { ...native, fs: { ...native.fs, link: async () => { throw failure; } } };
  try {
    const result = await launchTeammateTrial(input(target.root), dependencies);
    assert.equal(result.disposition, "recovery_required");
    assert.equal(result.reasonCode, "receipt_write_failed");
    assert.equal(registered(target.root), true);
    await assert.rejects(readFile(`${target.root}${receiptSuffix}`), { code: "ENOENT" });
    assert.doesNotMatch(JSON.stringify(result), /code --new-window/u);
  } finally { await cleanup(target); }
});

test("real exact-revision launch uses no global shield or PATH nx and returns one unexecuted open action", { timeout: 180_000 }, async () => {
  const target = await fixture("shield-launch-positive-");
  const decoys = join(target.base, "decoys");
  const shieldMarker = join(target.base, "shield-invoked");
  const nxMarker = join(target.base, "nx-invoked");
  const openMarker = join(target.base, "code-open-invoked");
  const actualCode = execFileSync("sh", ["-c", "command -v code"], { encoding: "utf8" }).trim();
  await mkdir(decoys);
  await writeFile(join(decoys, "shield"), `#!/bin/sh\nprintf invoked > ${JSON.stringify(shieldMarker)}\nexit 97\n`);
  await writeFile(join(decoys, "nx"), `#!/bin/sh\nprintf invoked > ${JSON.stringify(nxMarker)}\nexit 98\n`);
  await writeFile(join(decoys, "code"), `#!/bin/sh\nif [ "$1" = "--new-window" ]; then printf invoked > ${JSON.stringify(openMarker)}; exit 99; fi\nexec ${JSON.stringify(actualCode)} "$@"\n`);
  await Promise.all(["shield", "nx", "code"].map((name) => chmod(join(decoys, name), 0o755)));
  const previousPath = process.env.PATH;
  process.env.PATH = `${decoys}:${previousPath ?? ""}`;
  try {
    const result = await launchTeammateTrial(input(target.root));
    assert.equal(result.authority, "none");
    assert.equal(result.disposition, "ready_for_host_confirmation");
    assert.equal(result.reasonCode, "ready_for_host_confirmation");
    assert.deepEqual(result.nextAction, {
      executable: "code",
      arguments: ["--new-window", target.root],
      display: `code --new-window ${JSON.stringify(target.root)}`,
    });
    assert.equal(result.repository.expectedHead, expectedHead);
    assert.equal(result.repository.observedHead, expectedHead);
    assert.equal(result.artifacts.bootstrap.sha256, bootstrapSha256);
    assert.equal(result.publicationSafeReceipt.repository.sourceRoot, "<SOURCE_ROOT>");
    assert.equal(result.publicationSafeReceipt.repository.disposableRoot, "<DISPOSABLE_ROOT>");
    assert.equal(JSON.stringify(result.publicationSafeReceipt).includes(target.root), false);
    const receipt = JSON.parse(await readFile(`${target.root}${receiptSuffix}`, "utf8"));
    assert.equal(Object.hasOwn(receipt, "authority"), false);
    assert.equal(receipt.repository.expectedHead, expectedHead);
    assert.equal(receipt.target.nxVersion, "23.1.0");
    assert.match(receipt.target.missionPreparationDistManifestSha256, /^[0-9a-f]{64}$/u);
    assert.match(receipt.target.teamSystemDistManifestSha256, /^[0-9a-f]{64}$/u);
    for (const marker of [shieldMarker, nxMarker, openMarker]) await assert.rejects(readFile(marker), { code: "ENOENT" });
  } finally {
    process.env.PATH = previousPath;
    await cleanup(target);
  }
});
