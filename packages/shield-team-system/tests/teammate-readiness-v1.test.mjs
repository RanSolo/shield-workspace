import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, stat, utimes, writeFile } from "node:fs/promises";
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
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import { prepareWorktreeStateV1 } from "../dist/worktree-state-v1.mjs";

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

function cliEnvironment(overrides = {}) {
  const environment = { ...process.env, ...overrides };
  delete environment.FORCE_COLOR;
  delete environment.NO_COLOR;
  return environment;
}

function seatCard(seat) {
  const values = {
    hill: ["gpt-5.6-luna", "medium", "workspace-write"],
    daisy: ["gpt-5.6-terra", "medium", "read-only"],
    fury: ["gpt-5.6-sol", "high", "read-only"],
    may: ["gpt-5.6-luna", "high", "workspace-write"],
    mack: ["gpt-5.6-terra", "medium", "workspace-write"],
  }[seat];
  return `name = "${seat}"\ndescription = "fixture"\nmodel = "${values[0]}"\nmodel_reasoning_effort = "${values[1]}"\nsandbox_mode = "${values[2]}"\ndeveloper_instructions = """\nfixture\n"""\n`;
}

function humanBinding(seatId) {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    schemaVersion: 1,
    bindingId: `binding:readiness:${seatId}`,
    humanPrincipalId: `human:readiness:${seatId}`,
    seatId,
    missionScope: "*",
    signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:readiness-test",
    provenanceRef: `repository-policy:readiness-test:${seatId}`,
  };
}

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "shield-teammate-readiness-"));
  await mkdir(join(root, ".codex", "agents"), { recursive: true });
  await mkdir(join(root, "packages", "shield-team-system"), { recursive: true });
  if (!options.missingAgents) await writeFile(join(root, "AGENTS.md"), "# Fixture instructions\n");
  let config = "[agents]\nenabled = true\n";
  for (const seat of TEAMMATE_READINESS_SEATS) {
    config += `\n[agents.${seat}]\ndescription = "fixture"\nconfig_file = "agents/${seat}.toml"\nnickname_candidates = ["${seat}"]\n`;
    await writeFile(join(root, ".codex", "agents", `${seat}.toml`), seatCard(seat));
  }
  if (options.invalidDeclaration) config = config.replace('config_file = "agents/may.toml"', 'config_file = "agents/hill.toml"');
  await writeFile(join(root, ".codex", "config.toml"), config);
  await writeFile(join(root, "packages", "shield-team-system", "package.json"), JSON.stringify({ name: "@shield/team-system", version: options.declaredVersion ?? "0.1.0" }));
  if (options.preparedWorktree) await writeFile(join(root, ".gitignore"), ".shield/\n");
  if (options.trackedShield) {
    await mkdir(join(root, ".shield", "journals"), { recursive: true });
    await writeFile(join(root, ".shield", "journals", "history.jsonl"), "{}\n");
  }
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  git(root, ["config", "user.name", "Fixture"]);
  if (options.preparedWorktree) git(root, ["remote", "add", "origin", "git@github.com:RanSolo/readiness-fixture.git"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  if (!options.preparedWorktree) return { root, head };

  const canonicalSourceRoot = await realpath(root);
  const destinationRoot = `${canonicalSourceRoot}-prepared`;
  git(root, ["worktree", "add", "--quiet", "-b", `readiness-${process.pid}-${Date.now()}`, destinationRoot, "HEAD"]);
  const canonicalDestinationRoot = await realpath(destinationRoot);
  const coulson = humanBinding("coulson");
  const fitz = humanBinding("fitz");
  const shieldConfig = createShieldConfig({
    repositoryId: "RanSolo/readiness-fixture",
    coulsonBindingRef: coulson.signingKeyRef,
    fitzBindingRef: fitz.signingKeyRef,
  });
  await mkdir(join(canonicalSourceRoot, ".shield"), { recursive: true });
  await writeFile(join(canonicalSourceRoot, ".shield", "config.json"), formatShieldConfig(shieldConfig));
  await writeFile(join(canonicalSourceRoot, ".shield", "trusted-human-bindings.json"), `${JSON.stringify({ schemaVersion: 1, bindings: [coulson, fitz] }, null, 2)}\n`);
  const prepared = await prepareWorktreeStateV1({ sourceRoot: canonicalSourceRoot, destinationRoot: canonicalDestinationRoot });
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));
  return { root: canonicalDestinationRoot, sourceRoot: canonicalSourceRoot, head, prepared };
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
  assert.deepEqual(report.declarations, [
    ["hill", "gpt-5.6-luna", "medium", "workspace-write"],
    ["daisy", "gpt-5.6-terra", "medium", "read-only"],
    ["fury", "gpt-5.6-sol", "high", "read-only"],
    ["may", "gpt-5.6-luna", "high", "workspace-write"],
    ["mack", "gpt-5.6-terra", "medium", "workspace-write"],
  ].map(([seat, model, reasoningEffort, sandboxMode]) => ({
    source: "declared", seat, configFile: `.codex/agents/${seat}.toml`, name: seat,
    model, reasoningEffort, sandboxMode, repositoryInstructions: "AGENTS.md",
  })));
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

test("inaccessible root emits the complete closed report before any probe", async () => {
  let probed = false;
  const root = join(tmpdir(), `shield-missing-${process.pid}-${Date.now()}`);
  const report = await runTeammateReadinessPreflightV1(
    { root, expectedHead: "b".repeat(40) },
    goodDependencies({ execute: async () => { probed = true; return { state: "failed", stdout: "" }; } }),
  );
  assert.equal(report.reasonCode, "repository_unavailable");
  assert.deepEqual(report.machineChecks.map(({ id }) => id), CHECK_IDS);
  assert.equal(report.machineChecks[1].status, "fail");
  assert.ok(report.machineChecks.slice(2).every(({ reasonCode }) => reasonCode === "not_observed"));
  assert.equal(probed, false);
});

test("detects branch, HEAD, tracked-inventory, and root-identity drift", async (context) => {
  const cases = [
    ["branch", async (f) => { git(f.root, ["checkout", "--quiet", "-b", "drift-branch"]); }],
    ["HEAD", async (f) => { git(f.root, ["commit", "--quiet", "--allow-empty", "-m", "drift head"]); }],
    ["tracked inventory", async (f) => {
      await writeFile(join(f.root, "staged-drift.txt"), "drift\n");
      git(f.root, ["add", "staged-drift.txt"]);
    }],
    ["root identity", async (f) => {
      const moved = `${f.root}-original`;
      await rename(f.root, moved);
      execFileSync("git", ["clone", "--quiet", "--no-hardlinks", moved, f.root], { stdio: "pipe" });
    }],
  ];
  for (const [name, mutate] of cases) {
    await context.test(name, async () => {
      const f = await fixture();
      const report = await runTeammateReadinessPreflightV1({ root: f.root, expectedHead: f.head }, goodDependencies({
        beforeFinalObservation: async () => mutate(f),
      }));
      assert.equal(report.reasonCode, "repository_drift");
      assert.equal(report.machineChecks.find(({ id }) => id === "repository.stable").reasonCode, "repository_drift");
    });
  }
});

test("applies the complete fixed first-match precedence", async (context) => {
  const cases = [
    ["repository_drift", { invalidDeclaration: true, trackedShield: true }, async (f) => {
      await writeFile(join(f.root, "initial-dirty.txt"), "dirty\n");
      return goodDependencies({
        installedPackageIdentity: async () => null,
        findExecutable: async () => null,
        inspectWorktreeState: async () => ({ classification: "prepared_worktree", ok: true, message: "prepared", receiptDigest: "digest" }),
        beforeFinalObservation: async () => writeFile(join(f.root, "later-drift.txt"), "drift\n"),
      });
    }],
    ["workspace_dirty", { invalidDeclaration: true, trackedShield: true }, async (f) => {
      await writeFile(join(f.root, "dirty.txt"), "dirty\n");
      return goodDependencies({ installedPackageIdentity: async () => null, findExecutable: async () => null,
        inspectWorktreeState: async () => ({ classification: "prepared_worktree", ok: true, message: "prepared", receiptDigest: "digest" }) });
    }],
    ["declaration_invalid", { invalidDeclaration: true, trackedShield: true }, async () => goodDependencies({
      installedPackageIdentity: async () => null, findExecutable: async () => null,
      inspectWorktreeState: async () => ({ classification: "prepared_worktree", ok: true, message: "prepared", receiptDigest: "digest" }),
    })],
    ["tracked_state_present", { trackedShield: true }, async () => goodDependencies({
      installedPackageIdentity: async () => null, findExecutable: async () => null,
      inspectWorktreeState: async () => ({ classification: "prepared_worktree", ok: true, message: "prepared", receiptDigest: "digest" }),
    })],
    ["package_unavailable", {}, async () => goodDependencies({ installedPackageIdentity: async () => null, findExecutable: async () => null,
      inspectWorktreeState: async () => ({ classification: "prepared_worktree", ok: true, message: "prepared", receiptDigest: "digest" }) })],
    ["host_probe_failed", {}, async () => goodDependencies({ findExecutable: async () => null,
      inspectWorktreeState: async () => ({ classification: "prepared_worktree", ok: true, message: "prepared", receiptDigest: "digest" }) })],
    ["unexpected_policy_state", {}, async () => goodDependencies({
      inspectWorktreeState: async () => ({ classification: "prepared_worktree", ok: true, message: "prepared", receiptDigest: "digest" }),
    })],
    ["malformed_policy_state", {}, async () => goodDependencies({
      inspectWorktreeState: async () => ({ classification: "stale_or_malformed_worktree_state", ok: false, message: "stale", receiptDigest: null }),
    })],
    ["ready_for_host_confirmation", {}, async () => goodDependencies()],
  ];
  for (const [reasonCode, fixtureOptions, dependencies] of cases) {
    await context.test(reasonCode, async () => {
      const f = await fixture(fixtureOptions);
      const report = await runTeammateReadinessPreflightV1({ root: f.root, expectedHead: f.head }, await dependencies(f));
      assert.equal(report.reasonCode, reasonCode);
    });
  }
});

test("retains tracked .shield inventory when a declaration blob is missing", async () => {
  const f = await fixture({ missingAgents: true, trackedShield: true });
  const report = await runTeammateReadinessPreflightV1({ root: f.root, expectedHead: f.head }, goodDependencies());
  assert.equal(report.reasonCode, "declaration_invalid");
  assert.equal(report.machineChecks.find(({ id }) => id === "repository.declarations").status, "fail");
  assert.equal(report.machineChecks.find(({ id }) => id === "repository.tracked_shield").status, "fail");
  assert.deepEqual(report.trackedShieldPaths, [".shield/journals/history.jsonl"]);
});

test("readiness Git probes preserve stale index bytes and metadata", async () => {
  const f = await fixture();
  const trackedPath = join(f.root, "AGENTS.md");
  const trackedBytes = await readFile(trackedPath);
  await writeFile(trackedPath, trackedBytes);
  await utimes(trackedPath, new Date("2001-01-01T00:00:00.000Z"), new Date("2001-01-01T00:00:00.000Z"));
  const indexRelative = git(f.root, ["rev-parse", "--git-path", "index"]);
  const indexPath = resolve(f.root, indexRelative);
  const beforeBytes = await readFile(indexPath);
  const before = await stat(indexPath, { bigint: true });
  const report = await runTeammateReadinessPreflightV1({ root: f.root, expectedHead: f.head }, goodDependencies());
  const afterBytes = await readFile(indexPath);
  const after = await stat(indexPath, { bigint: true });
  const metadata = ({ dev, ino, mode, nlink, uid, gid, rdev, size, blksize, blocks, mtimeNs, ctimeNs, birthtimeNs }) =>
    ({ dev, ino, mode, nlink, uid, gid, rdev, size, blksize, blocks, mtimeNs, ctimeNs, birthtimeNs });
  assert.equal(report.reasonCode, "ready_for_host_confirmation");
  assert.deepEqual(afterBytes, beforeBytes);
  assert.deepEqual(metadata(after), metadata(before));
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

test("readiness integration classifies prepared policy through the real worktree inspector", async () => {
  const f = await fixture({ preparedWorktree: true });
  const dependencies = goodDependencies();
  delete dependencies.inspectWorktreeState;
  const report = await runTeammateReadinessPreflightV1({ root: f.root, expectedHead: f.head }, dependencies);
  assert.equal(report.reasonCode, "unexpected_policy_state");
  assert.equal(report.worktreeState.classification, "prepared_worktree");
  assert.equal(report.worktreeState.receiptDigest, f.prepared.receipt.receiptDigest);
  assert.equal(report.machineChecks.find(({ id }) => id === "shield.worktree_state").reasonCode, "unexpected_policy_state");
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

test("CLI routes supplied malformed JSON inputs through the closed evaluator with exit 2", async () => {
  for (const args of [
    ["--root", "relative", "--expected-head", "a".repeat(40)],
    ["--root", "/tmp", "--expected-head", "ABC"],
  ]) {
    const result = spawnSync(process.execPath, [cli, "teammate", "preflight", ...args, "--json"], { encoding: "utf8", env: cliEnvironment() });
    assert.equal(result.status, 2);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.equal(report.reasonCode, "invalid_input");
    assert.equal(report.machineChecks.length, 12);
    assert.deepEqual(report.machineChecks.map(({ id }) => id), CHECK_IDS);
    assert.equal(report.machineChecks[0].status, "fail");
    assert.equal(report.machineChecks[0].reasonCode, "invalid_input");
    assert.ok(report.machineChecks.slice(1).every(({ reasonCode }) => reasonCode === "not_observed"));
  }
});

test("CLI closes missing usage, returns exact mismatch exit 1, and ready exit 0", async () => {
  const usage = spawnSync(process.execPath, [cli, "teammate", "preflight", "--root", "/tmp"], { encoding: "utf8" });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /Missing required option: --expected-head/u);

  const f = await fixture();
  const mismatch = spawnSync(process.execPath, [cli, "teammate", "preflight", "--root", f.root, "--expected-head", "c".repeat(40), "--json"], { encoding: "utf8" });
  assert.equal(mismatch.status, 1);
  const report = JSON.parse(mismatch.stdout);
  assert.equal(report.authority, "none");
  assert.equal(report.reasonCode, "expected_head_mismatch");

  const bin = await mkdtemp(join(tmpdir(), "shield-readiness-bin-"));
  await writeFile(join(bin, "code"), `#!/bin/sh\nif [ "$1" = "--version" ]; then printf '1.133.0\\n${"a".repeat(40)}\\narm64\\n'; else printf 'openai.chatgpt@26.810.41047\\n'; fi\n`);
  await writeFile(join(bin, "codex"), "#!/bin/sh\nprintf 'codex-cli 0.147.0-alpha.6.5\\n'\n");
  await chmod(join(bin, "code"), 0o755);
  await chmod(join(bin, "codex"), 0o755);
  const ready = spawnSync(process.execPath, [cli, "teammate", "preflight", "--root", f.root, "--expected-head", f.head, "--json"], {
    encoding: "utf8", env: cliEnvironment({ PATH: `${bin}:${process.env.PATH ?? ""}` }),
  });
  assert.equal(ready.status, 0, ready.stderr);
  assert.equal(JSON.parse(ready.stdout).reasonCode, "ready_for_host_confirmation");
});
