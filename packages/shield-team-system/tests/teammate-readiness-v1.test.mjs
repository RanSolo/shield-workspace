import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  TEAMMATE_READINESS_CONTRACT_VERSION,
  TEAMMATE_READINESS_SEATS,
  probeTeammateHostV1,
  projectTeammateReadinessForPublicationV1,
  runTeammateReadinessPreflightV1,
} from "../dist/teammate-readiness-v1.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "dist", "cli.mjs");
const CHECK_IDS = [
  "input.closed", "repository.root", "repository.expected_head", "repository.clean",
  "repository.declarations", "repository.tracked_shield", "package.team_system",
  "host.vscode", "host.openai_extension", "host.codex_cli", "shield.worktree_state", "repository.stable",
];

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function seatCard(seat) {
  const values = {
    hill: ["gpt-5.6-sol", "medium", "workspace-write"],
    daisy: ["gpt-5.3-codex-spark", "medium", "read-only"],
    fury: ["gpt-5.6-sol", "high", "read-only"],
    may: ["gpt-5.6-sol", "high", "workspace-write"],
    mack: ["gpt-5.3-codex-spark", "medium", "workspace-write"],
  }[seat];
  return `name = "${seat}"\ndescription = "fixture"\nmodel = "${values[0]}"\nmodel_reasoning_effort = "${values[1]}"\nsandbox_mode = "${values[2]}"\ndeveloper_instructions = """\nfixture\n"""\n`;
}

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "shield-teammate-readiness-"));
  await mkdir(join(root, ".codex", "agents"), { recursive: true });
  await mkdir(join(root, "packages", "shield-team-system"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# Fixture instructions\n");
  let config = "[agents]\nenabled = true\n";
  for (const seat of TEAMMATE_READINESS_SEATS) {
    config += `\n[agents.${seat}]\ndescription = "fixture"\nconfig_file = "agents/${seat}.toml"\nnickname_candidates = ["${seat}"]\n`;
    await writeFile(join(root, ".codex", "agents", `${seat}.toml`), seatCard(seat));
  }
  if (options.invalidDeclaration) config = config.replace('config_file = "agents/may.toml"', 'config_file = "agents/hill.toml"');
  await writeFile(join(root, ".codex", "config.toml"), config);
  await writeFile(join(root, "packages", "shield-team-system", "package.json"), JSON.stringify({ name: "@shield/team-system", version: options.declaredVersion ?? "0.1.0" }));
  if (options.trackedShield) {
    await mkdir(join(root, ".shield", "journals"), { recursive: true });
    await writeFile(join(root, ".shield", "journals", "history.jsonl"), "{}\n");
  }
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  return { root, head: git(root, ["rev-parse", "HEAD"]) };
}

function uninitialized() {
  return { classification: "uninitialized_worktree", ok: false, message: "No policy.", receiptDigest: null };
}

function goodDependencies(overrides = {}) {
  return {
    installedPackageIdentity: async () => ({ name: "@shield/team-system", version: "0.1.0" }),
    inspectWorktreeState: async () => uninitialized(),
    findExecutable: async (name) => `/fixture/bin/${name}`,
    execute: async (executable, args) => {
      if (executable.endsWith("/code") && args[0] === "--version") {
        return { state: "success", stdout: `1.133.0\n${"a".repeat(40)}\narm64\n` };
      }
      if (executable.endsWith("/code")) return { state: "success", stdout: "publisher.other@1.0.0\nopenai.chatgpt@26.810.41047\n" };
      return { state: "success", stdout: "codex-cli 0.147.0-alpha.6.5\n" };
    },
    ...overrides,
  };
}

test("emits the closed report, exact machine-check order, and ordered unverified host confirmations", async () => {
  const f = await fixture();
  const before = git(f.root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const report = await runTeammateReadinessPreflightV1({ root: f.root, expectedHead: f.head }, goodDependencies());
  const after = git(f.root, ["status", "--porcelain=v1", "--untracked-files=all"]);

  assert.equal(report.contractVersion, TEAMMATE_READINESS_CONTRACT_VERSION);
  assert.equal(report.authority, "none");
  assert.equal(report.disposition, "ready_for_host_confirmation");
  assert.equal(report.reasonCode, "ready_for_host_confirmation");
  assert.deepEqual(report.machineChecks.map(({ id }) => id), CHECK_IDS);
  assert.deepEqual(report.machineChecks.map(({ status }) => status), ["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "observed", "pass"]);
  assert.equal(report.machineChecks[10].reasonCode, "uninitialized_worktree");
  assert.deepEqual(report.declarations.map(({ seat }) => seat), TEAMMATE_READINESS_SEATS);
  assert.ok(report.declarations.every(({ source }) => source === "declared"));
  assert.equal(report.hostConfirmations.length, 37);
  assert.deepEqual(report.hostConfirmations.slice(0, 4).map(({ id }) => id), [
    "host.agents_window_rendered", "host.account_entitlement", "host.seat.hill.identity", "host.seat.hill.model",
  ]);
  assert.equal(report.hostConfirmations.at(-1).id, "host.seat.mack.agent_creation");
  assert.ok(report.hostConfirmations.every(({ status }) => status === "unverified"));
  assert.equal(before, "");
  assert.equal(after, "");
});

test("rejects non-closed input and does not call probes", async () => {
  let probed = false;
  const report = await runTeammateReadinessPreflightV1(
    { root: "relative", expectedHead: "ABC" },
    goodDependencies({ execute: async () => { probed = true; return { state: "failed", stdout: "" }; } }),
  );
  assert.equal(report.reasonCode, "invalid_input");
  assert.equal(report.machineChecks[0].status, "fail");
  assert.ok(report.machineChecks.slice(1).every(({ reasonCode }) => reasonCode === "not_observed"));
  assert.equal(probed, false);
});

test("expected-HEAD mismatch gates before host probes", async () => {
  const f = await fixture();
  let probed = false;
  const report = await runTeammateReadinessPreflightV1(
    { root: f.root, expectedHead: "b".repeat(40) },
    goodDependencies({ execute: async () => { probed = true; return { state: "failed", stdout: "" }; } }),
  );
  assert.equal(report.reasonCode, "expected_head_mismatch");
  assert.equal(report.machineChecks[2].status, "fail");
  assert.equal(probed, false);
});

test("repository drift has precedence over initial dirty and declaration failures", async () => {
  const f = await fixture({ invalidDeclaration: true });
  await writeFile(join(f.root, "initial-untracked.txt"), "preserve\n");
  const report = await runTeammateReadinessPreflightV1({ root: f.root, expectedHead: f.head }, goodDependencies({
    beforeFinalObservation: async () => writeFile(join(f.root, "later-untracked.txt"), "drift\n"),
  }));
  assert.equal(report.reasonCode, "repository_drift");
  assert.equal(report.machineChecks.find(({ id }) => id === "repository.clean").reasonCode, "workspace_dirty");
  assert.equal(report.machineChecks.find(({ id }) => id === "repository.declarations").reasonCode, "declaration_invalid");
});

test("applies fixed failure precedence after stability", async () => {
  const f = await fixture({ invalidDeclaration: true, trackedShield: true, declaredVersion: "0.2.0" });
  await writeFile(join(f.root, "dirty.txt"), "dirty\n");
  const report = await runTeammateReadinessPreflightV1({ root: f.root, expectedHead: f.head }, goodDependencies({
    installedPackageIdentity: async () => null,
    findExecutable: async () => null,
    inspectWorktreeState: async () => ({ classification: "prepared_worktree", ok: true, message: "prepared", receiptDigest: "digest" }),
  }));
  assert.equal(report.reasonCode, "workspace_dirty");
  assert.equal(report.machineChecks.find(({ id }) => id === "repository.tracked_shield").reasonCode, "tracked_state_present");
  assert.equal(report.machineChecks.find(({ id }) => id === "package.team_system").reasonCode, "package_unavailable");
  assert.equal(report.machineChecks.find(({ id }) => id === "host.vscode").reasonCode, "host_probe_failed");
  assert.equal(report.machineChecks.find(({ id }) => id === "shield.worktree_state").reasonCode, "unexpected_policy_state");
});

test("maps every doctor worktree classification without treating uninitialized as authority", async () => {
  for (const [classification, reasonCode, status] of [
    ["uninitialized_worktree", "ready_for_host_confirmation", "observed"],
    ["manual_policy_present", "unexpected_policy_state", "fail"],
    ["prepared_worktree", "unexpected_policy_state", "fail"],
    ["stale_or_malformed_worktree_state", "malformed_policy_state", "fail"],
  ]) {
    const f = await fixture();
    const report = await runTeammateReadinessPreflightV1({ root: f.root, expectedHead: f.head }, goodDependencies({
      inspectWorktreeState: async () => ({ classification, ok: classification !== "stale_or_malformed_worktree_state", message: classification, receiptDigest: null }),
    }));
    assert.equal(report.reasonCode, reasonCode);
    assert.equal(report.machineChecks.find(({ id }) => id === "shield.worktree_state").status, status);
    assert.equal(report.authority, "none");
  }
});

test("classifies fixed host probes as available, unavailable, timeout, or malformed", async () => {
  const unavailable = await probeTeammateHostV1({ findExecutable: async () => null });
  assert.equal(unavailable.vscode.classification, "unavailable");
  assert.equal(unavailable.openaiExtension.classification, "unavailable");
  assert.equal(unavailable.codexCli.classification, "unavailable");

  const timeout = await probeTeammateHostV1({
    findExecutable: async (name) => `/bin/${name}`,
    execute: async () => ({ state: "timeout", stdout: "" }),
  });
  assert.equal(timeout.vscode.classification, "timeout");
  assert.equal(timeout.openaiExtension.classification, "timeout");
  assert.equal(timeout.codexCli.classification, "timeout");

  const malformed = await probeTeammateHostV1({
    findExecutable: async (name) => `/bin/${name}`,
    execute: async () => ({ state: "success", stdout: "not a version\n" }),
  });
  assert.equal(malformed.vscode.classification, "malformed");
  assert.equal(malformed.openaiExtension.classification, "malformed");
  assert.equal(malformed.codexCli.classification, "malformed");
});

test("publication projection removes the raw root and executable path", async () => {
  const f = await fixture();
  const report = await runTeammateReadinessPreflightV1({ root: f.root, expectedHead: f.head }, goodDependencies());
  const projected = projectTeammateReadinessForPublicationV1(report);
  const bytes = JSON.stringify(projected);
  assert.equal(projected.repository.root, "<DISPOSABLE_ROOT>");
  assert.equal("executablePath" in projected.host.codexCli, false);
  assert.doesNotMatch(bytes, new RegExp(f.root.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(bytes, /\/fixture\/bin\/codex/u);
  assert.deepEqual(projected.host.codexCli, {
    classification: "available", source: "path", version: "0.147.0-alpha.6.5",
    extensionIdentifier: "openai.chatgpt", extensionVersion: "26.810.41047",
  });
});

test("CLI closes usage input with exit 2 and returns authority-none JSON for an exact mismatch", async () => {
  const usage = spawnSync(process.execPath, [cli, "teammate", "preflight", "--root", "/tmp"], { encoding: "utf8" });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /Missing required option: --expected-head/u);

  const f = await fixture();
  const mismatch = spawnSync(process.execPath, [cli, "teammate", "preflight", "--root", f.root, "--expected-head", "c".repeat(40), "--json"], { encoding: "utf8" });
  assert.equal(mismatch.status, 1);
  const report = JSON.parse(mismatch.stdout);
  assert.equal(report.authority, "none");
  assert.equal(report.reasonCode, "expected_head_mismatch");
});
