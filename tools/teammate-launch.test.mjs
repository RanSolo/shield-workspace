import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ProcessUncertain,
  containsCheckoutFilterAttribute,
  createCopilotReceiptAdapter,
  createNativeDependencies,
  inspectBootstrapBytes,
  launchTeammateTrial,
  renderTeammateLaunchResult,
  validateExactCopilotPreflightReport,
  validateExactPreflightReport,
} from "./teammate-launch.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedHead = "fe4c751cd9299e740b3638c590da345ca315059d";
const wrongMain = "79243ee673aecc7506addbd2ee6372dd510e7e7e";
const bootstrapPath = "docs/missions/issue-307-teammate-demo-bootstrap.json";
const bootstrapSha256 = "789d184e31bbd220b81d029849c16399752a1c08c3d1cb973423324395a19664";
const receiptSuffix = ".shield-teammate-launch-v1.json";
const promptPath = ".codex/prompts/issue-307-teammate-demo.md";

function isGit(executable) {
  return basename(executable) === "git";
}

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: workspaceRoot, encoding: "utf8", ...options, stdio: options.stdio ?? "pipe" });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function createBootstrapV2Commit(indexPath) {
  const v1 = JSON.parse(git(["show", `${expectedHead}:${bootstrapPath}`]));
  const v2 = { ...v1, contractVersion: "shield.teammate-demo-bootstrap.v2", agentHost: "github-copilot" };
  const bytes = Buffer.from(`${JSON.stringify(v2, null, 2)}\n`);
  const bootstrapDigest = createHash("sha256").update(bytes).digest("hex");
  const blob = git(["hash-object", "-w", "--stdin"], { input: bytes }).trim();
  const environment = {
    ...process.env,
    GIT_AUTHOR_DATE: "2026-08-17T12:00:00Z",
    GIT_COMMITTER_DATE: "2026-08-17T12:00:00Z",
    GIT_INDEX_FILE: indexPath,
  };
  git(["read-tree", "HEAD"], { env: environment });
  git(["update-index", "--add", "--cacheinfo", `100644,${blob},${bootstrapPath}`], { env: environment });
  for (const path of [v1.reviewedPlanPath, `.codex/prompts/issue-${v1.issueId}-teammate-demo.md`]) {
    const oid = git(["rev-parse", `${expectedHead}:${path}`]).trim();
    git(["update-index", "--add", "--cacheinfo", `100644,${oid},${path}`], { env: environment });
  }
  const tree = git(["write-tree"], { env: environment }).trim();
  const parent = git(["rev-parse", "HEAD"]).trim();
  const head = git(["commit-tree", tree, "-p", parent, "-p", v1.reviewedPlanCommit], {
    env: environment,
    input: "test: bootstrap v2 fixture\n",
  }).trim();
  return { bootstrapDigest, head };
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

function exactReport(root = "/fixture/checkout", head = "a".repeat(40)) {
  const seats = ["hill", "daisy", "fury", "may", "mack"];
  const fields = ["identity", "model", "reasoning_effort", "sandbox_mode", "repository_instructions", "mcp_inventory", "agent_creation"];
  const checkRows = [
    ["input.closed", "pass", "none"], ["repository.root", "pass", "none"],
    ["repository.expected_head", "pass", "none"], ["repository.clean", "pass", "none"],
    ["repository.declarations", "pass", "none"], ["repository.tracked_shield", "pass", "none"],
    ["package.team_system", "pass", "none"], ["host.vscode", "pass", "none"],
    ["host.openai_extension", "pass", "none"], ["host.codex_cli", "pass", "none"],
    ["shield.worktree_state", "observed", "uninitialized_worktree"], ["repository.stable", "pass", "none"],
  ];
  return {
    schemaVersion: 1,
    contractVersion: "shield.teammate-readiness.v1",
    authority: "none",
    disposition: "ready_for_host_confirmation",
    reasonCode: "ready_for_host_confirmation",
    repository: { root, branch: null, head, expectedHead: head, clean: true },
    package: { name: "@shield/team-system", declaredVersion: "0.1.0", installedVersion: "0.1.0" },
    declarations: seats.map((seat) => ({
      source: "declared", seat, configFile: `.codex/agents/${seat}.toml`, name: seat,
      model: "gpt-5.6-sol", reasoningEffort: "high", sandboxMode: "workspace-write", repositoryInstructions: "AGENTS.md",
    })),
    trackedShieldPaths: [],
    host: {
      vscode: { classification: "available", version: "1.133.0", build: "b".repeat(40), architecture: "arm64" },
      openaiExtension: { classification: "available", identifier: "openai.chatgpt", version: "26.810.41047" },
      codexCli: { classification: "available", source: "path", version: "0.147.0-alpha.6.5", executablePath: "/fixture/bin/codex" },
    },
    worktreeState: { classification: "uninitialized_worktree", ok: false, message: "No policy.", receiptDigest: null },
    machineChecks: checkRows.map(([id, status, reasonCode]) => ({ id, status, reasonCode, nextAction: "bounded next action" })),
    hostConfirmations: ["host.agents_window_rendered", "host.account_entitlement", ...seats.flatMap((seat) => fields.map((field) => `host.seat.${seat}.${field}`))]
      .map((id) => ({ id, status: "unverified" })),
  };
}

function exactCopilotReport(root = "/fixture/checkout", head = "a".repeat(40)) {
  const seats = ["hill", "daisy", "fury", "may", "mack"];
  const names = ["Hill", "Daisy", "Fury", "May", "Mack"];
  const checkRows = [
    ["input.closed", "pass", "none"], ["repository.root", "pass", "none"],
    ["repository.expected_head", "pass", "none"], ["repository.clean", "pass", "none"],
    ["repository.copilot_agents", "pass", "none"], ["host.vscode", "pass", "none"],
    ["host.copilot_extension", "pass", "none"], ["repository.stable", "pass", "none"],
  ];
  const artifacts = seats.map((seat, index) => ({ path: `.github/agents/${seat}.agent.md`, sha256: String(index + 1).repeat(64) }));
  return {
    artifacts,
    report: {
      schemaVersion: 1,
      contractVersion: "shield.copilot-teammate-readiness.v1",
      authority: "none",
      adapter: { kind: "github-copilot" },
      disposition: "ready_for_host_confirmation",
      reasonCode: "ready_for_host_confirmation",
      repository: { root, branch: null, head, expectedHead: head, clean: true },
      agents: seats.map((seat, index) => ({
        seat, name: names[index], path: artifacts[index].path, sha256: artifacts[index].sha256, model: "host-selected",
      })),
      host: {
        vscode: { classification: "available", version: "1.133.0", build: "b".repeat(40), architecture: "arm64" },
        copilotExtension: { classification: "available", identifier: "github.copilot-chat", version: "0.32.3" },
        entitlement: { status: "unverified" },
      },
      machineChecks: checkRows.map(([id, status, reasonCode]) => ({ id, status, reasonCode, nextAction: "bounded next action" })),
      hostConfirmations: ["host.copilot_picker_rendered", "host.account_entitlement", ...seats.flatMap((seat) =>
        ["identity", "selected_model", "tools", "instructions", "creation"].map((field) => `host.seat.${seat}.${field}`))]
        .map((id) => ({ id, status: "unverified" })),
    },
  };
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

test("bootstrap v2 requires the explicit GitHub Copilot host while v1 remains unchanged", () => {
  const v1 = JSON.parse(git(["show", `${expectedHead}:${bootstrapPath}`]));
  const v2 = { ...v1, contractVersion: "shield.teammate-demo-bootstrap.v2", agentHost: "github-copilot" };
  const bytes = Buffer.from(`${JSON.stringify(v2)}\n`);
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(inspectBootstrapBytes(bytes, digest).agentHost, "github-copilot");
  for (const host of [undefined, "codex", "github-copilot-cloud"]) {
    const changed = structuredClone(v2);
    if (host === undefined) delete changed.agentHost;
    else changed.agentHost = host;
    const changedBytes = Buffer.from(`${JSON.stringify(changed)}\n`);
    const changedDigest = createHash("sha256").update(changedBytes).digest("hex");
    assert.throws(() => inspectBootstrapBytes(changedBytes, changedDigest), { reasonCode: "bootstrap_mismatch" });
  }
  assert.equal(inspectBootstrapBytes(Buffer.from(`${JSON.stringify(v1)}\n`), createHash("sha256").update(`${JSON.stringify(v1)}\n`).digest("hex")).contractVersion, "shield.teammate-demo-bootstrap.v1");
});

test("tracked checkout filter attributes are rejected", () => {
  assert.equal(containsCheckoutFilterAttribute(Buffer.from("*.png filter=lfs\n")), true);
  assert.equal(containsCheckoutFilterAttribute(Buffer.from("*.txt -filter\n")), true);
  assert.equal(containsCheckoutFilterAttribute(Buffer.from("# *.png filter=lfs\n*.txt text\n")), false);
});

test("Git-common info attributes stop before worktree registration", { timeout: 30_000 }, async () => {
  const target = await fixture("shield-launch-info-attributes-");
  const native = createNativeDependencies();
  const common = await realpath(resolve(workspaceRoot, git(["rev-parse", "--git-common-dir"]).trim()));
  const infoAttributes = join(common, "info", "attributes");
  const dependencies = {
    ...native,
    fs: {
      ...native.fs,
      lstat: async (path) => path === infoAttributes
        ? { isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
        : native.fs.lstat(path),
    },
  };
  try {
    const result = await launchTeammateTrial(input(target.root), dependencies);
    assert.equal(result.reasonCode, "revision_unavailable");
    assert.equal(registered(target.root), false);
  } finally { await cleanup(target); }
});

test("receipt reservation collision stops before worktree registration", { timeout: 30_000 }, async () => {
  const target = await fixture("shield-launch-reservation-");
  await writeFile(`${target.root}${receiptSuffix}.lock`, "reserved\n");
  try {
    const result = await launchTeammateTrial(input(target.root));
    assert.equal(result.reasonCode, "destination_unsafe");
    assert.equal(registered(target.root), false);
  } finally { await cleanup(target); }
});

test("pre-mutation artifact Git uncertainty remains recovery-required", { timeout: 30_000 }, async () => {
  const target = await fixture("shield-launch-artifact-uncertain-");
  const native = createNativeDependencies();
  const dependencies = {
    ...native,
    runProcess: async (executable, args, options) => {
      if (isGit(executable) && args.includes("cat-file")) throw new ProcessUncertain("artifact_timeout");
      return native.runProcess(executable, args, options);
    },
  };
  try {
    const result = await launchTeammateTrial(input(target.root), dependencies);
    assert.equal(result.reasonCode, "recovery_required");
    assert.equal(result.disposition, "recovery_required");
    assert.equal(registered(target.root), false);
  } finally { await cleanup(target); }
});

test("checkout readback Git uncertainty remains recovery-required", { timeout: 30_000 }, async () => {
  const target = await fixture("shield-launch-checkout-uncertain-");
  const native = createNativeDependencies();
  const dependencies = {
    ...native,
    runProcess: async (executable, args, options) => {
      const rootIndex = args.indexOf("-C");
      if (isGit(executable) && args[rootIndex + 1] === target.root && args.includes("--show-toplevel")) {
        throw new ProcessUncertain("checkout_readback_timeout");
      }
      return native.runProcess(executable, args, options);
    },
  };
  try {
    const result = await launchTeammateTrial(input(target.root), dependencies);
    assert.equal(result.reasonCode, "recovery_required");
    assert.equal(result.disposition, "recovery_required");
    assert.equal(registered(target.root), true);
  } finally { await cleanup(target); }
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
      if (isGit(executable) && args.includes("worktree") && args.includes("add") && result.state === "success") return exitResult(19);
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

test("exact teammate-readiness validator rejects nested identity, ordering, classification, and type drift", () => {
  const report = exactReport();
  const context = { input: { root: report.repository.root, expectedHead: report.repository.expectedHead } };
  assert.equal(validateExactPreflightReport(report, context), report);
  for (const mutate of [
    (value) => { value.declarations[1].seat = "may"; },
    (value) => { value.machineChecks.reverse(); },
    (value) => { value.hostConfirmations[2].status = "verified"; },
    (value) => { value.host.vscode.classification = "malformed"; },
    (value) => { value.package.declaredVersion = 1; },
  ]) {
    const changed = structuredClone(report);
    mutate(changed);
    assert.throws(() => validateExactPreflightReport(changed, context), /preflight_schema_or_identity_invalid/u);
  }
  assert.equal(report.machineChecks.length, 12);
  assert.equal(report.hostConfirmations.length, 37);
});

test("Copilot report and durable receipt adapter reject wrong-host identity", () => {
  const { artifacts, report } = exactCopilotReport();
  const context = { input: { root: report.repository.root, expectedHead: report.repository.expectedHead }, artifacts: { copilotAgents: artifacts } };
  assert.equal(validateExactCopilotPreflightReport(report, context), report);
  assert.deepEqual(createCopilotReceiptAdapter(artifacts, report), {
    kind: "github-copilot",
    agents: artifacts,
    extension: { classification: "available", identifier: "github.copilot-chat", version: "0.32.3" },
  });
  for (const mutate of [
    (value) => { value.contractVersion = "shield.teammate-readiness.v1"; },
    (value) => { value.adapter.kind = "codex"; },
    (value) => { value.agents[0].model = "pinned"; },
    (value) => { value.host.copilotExtension.identifier = "openai.chatgpt"; },
    (value) => { value.host.entitlement.status = "verified"; },
  ]) {
    const changed = structuredClone(report);
    mutate(changed);
    assert.throws(() => validateExactCopilotPreflightReport(changed, context), /copilot_preflight_schema_or_identity_invalid/u);
  }
  const wrongHost = structuredClone(report);
  wrongHost.adapter.kind = "codex";
  assert.throws(() => createCopilotReceiptAdapter(artifacts, wrongHost), /copilot_receipt_adapter_invalid/u);
});

test("bootstrap v2 executes the Copilot preflight and binds its complete receipt evidence", { timeout: 300_000 }, async () => {
  const positive = await fixture("shield-launch-copilot-v2-positive-");
  const negative = await fixture("shield-launch-copilot-v2-wrong-host-");
  const decoys = join(positive.base, "decoys");
  await mkdir(decoys);
  await writeFile(join(decoys, "code"), `#!/bin/sh
if [ "$1" = "--version" ]; then printf '1.133.0\\n${"c".repeat(40)}\\narm64\\n'; exit 0; fi
if [ "$1" = "--list-extensions" ] && [ "$2" = "--show-versions" ]; then printf 'github.copilot-chat@0.32.3\\n'; exit 0; fi
exit 95
`);
  await chmod(join(decoys, "code"), 0o755);
  const synthetic = createBootstrapV2Commit(join(positive.base, "synthetic-index"));
  const previousPath = process.env.PATH;
  process.env.PATH = `${decoys}:${previousPath ?? ""}`;
  const native = createNativeDependencies();
  const executableLookups = [];
  const preflightInvocations = [];
  const preflightReports = [];
  const dependencies = (wrongHost) => ({
    ...native,
    fs: {
      ...native.fs,
      access: async (path, mode) => {
        if (["code", "codex"].includes(basename(path))) executableLookups.push(basename(path));
        return native.fs.access(path, mode);
      },
    },
    runProcess: async (executable, args, options) => {
      const result = await native.runProcess(executable, args, options);
      if (executable === process.execPath && args.includes("teammate") && args.includes("preflight")) {
        preflightInvocations.push([...args]);
        if (result.state === "success") {
          const report = JSON.parse(result.stdout);
          preflightReports.push(report);
          if (wrongHost) {
            report.adapter.kind = "codex";
            return { ...result, stdout: `${JSON.stringify(report)}\n` };
          }
        }
      }
      return result;
    },
  });
  try {
    const result = await launchTeammateTrial(
      input(positive.root, synthetic.head, synthetic.bootstrapDigest),
      dependencies(false),
    );
    assert.equal(result.disposition, "ready_for_host_confirmation", JSON.stringify(result));
    const cliPath = join(positive.root, "packages/shield-team-system/dist/cli.mjs");
    assert.deepEqual(preflightInvocations[0], [
      cliPath, "teammate", "preflight", "--root", positive.root,
      "--expected-head", synthetic.head, "--host", "github-copilot", "--json",
    ]);
    assert.equal(executableLookups.includes("code"), true);
    assert.equal(executableLookups.includes("codex"), false);
    const report = preflightReports[0];
    const expectedAgents = ["hill", "daisy", "fury", "may", "mack"].map((seat) => {
      const path = `.github/agents/${seat}.agent.md`;
      return { path, sha256: createHash("sha256").update(git(["show", `${synthetic.head}:${path}`])).digest("hex") };
    });
    assert.deepEqual(report.agents.map(({ path, sha256 }) => ({ path, sha256 })), expectedAgents);
    const receipt = JSON.parse(await readFile(`${positive.root}${receiptSuffix}`, "utf8"));
    assert.equal(receipt.adapter.kind, "github-copilot");
    assert.deepEqual(receipt.adapter.agents, expectedAgents);
    assert.equal(receipt.preflightReportSha256, createHash("sha256").update(stableJson(report)).digest("hex"));
    assert.deepEqual(receipt.adapter.extension, {
      classification: "available",
      identifier: "github.copilot-chat",
      version: "0.32.3",
    });
    assert.deepEqual(result.publicationSafeReceipt.adapter, receipt.adapter);

    const rejected = await launchTeammateTrial(
      input(negative.root, synthetic.head, synthetic.bootstrapDigest),
      dependencies(true),
    );
    assert.equal(rejected.disposition, "action_required");
    assert.equal(rejected.reasonCode, "cli_unavailable");
    assert.equal(registered(negative.root), true);
    assert.equal(preflightInvocations[1].includes("--host"), true);
    assert.equal(preflightReports[1].contractVersion, "shield.copilot-teammate-readiness.v1");
    assert.equal(executableLookups.includes("codex"), false);
    await assert.rejects(readFile(`${negative.root}${receiptSuffix}`), { code: "ENOENT" });
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    await cleanup(negative);
    await cleanup(positive);
  }
});

test("human output prints the receipt-bound issue prompt path", () => {
  const result = {
    disposition: "ready_for_host_confirmation", authority: "none",
    repository: { observedHead: expectedHead }, artifacts: { prompt: { path: promptPath } },
    receipt: { path: "/fixture/receipt.json" }, nextAction: { display: "code --new-window /fixture" },
  };
  const output = renderTeammateLaunchResult(result);
  assert.match(output, /Prompt: \.codex\/prompts\/issue-307-teammate-demo\.md/u);
  assert.doesNotMatch(output, /fresh-hill/u);
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

test("final proof Git uncertainty remains recovery-required", { timeout: 180_000 }, async () => {
  const target = await fixture("shield-launch-final-uncertain-");
  const native = createNativeDependencies();
  let preflightCompleted = false;
  let uncertaintyInjected = false;
  const dependencies = {
    ...native,
    runProcess: async (executable, args, options) => {
      if (preflightCompleted && !uncertaintyInjected && isGit(executable)) {
        uncertaintyInjected = true;
        throw new ProcessUncertain("final_proof_timeout");
      }
      const result = await native.runProcess(executable, args, options);
      if (executable === process.execPath && args.includes("teammate") && args.includes("preflight")) preflightCompleted = true;
      return result;
    },
  };
  try {
    const result = await launchTeammateTrial(input(target.root), dependencies);
    assert.equal(uncertaintyInjected, true);
    assert.equal(result.reasonCode, "recovery_required");
    assert.equal(result.disposition, "recovery_required");
    assert.equal(registered(target.root), true);
  } finally { await cleanup(target); }
});

test("real exact-revision launch suppresses ambient checkout filters, uses fixed Git, and returns one unexecuted open action", { timeout: 180_000 }, async () => {
  const target = await fixture("shield-launch-positive-");
  const decoys = join(target.base, "decoys");
  const shieldMarker = join(target.base, "shield-invoked");
  const nxMarker = join(target.base, "nx-invoked");
  const gitMarker = join(target.base, "git-invoked");
  const filterMarker = join(target.base, "ambient-filter-invoked");
  const openMarker = join(target.base, "code-open-invoked");
  const ambientHome = join(target.base, "ambient-home");
  const ambientAttributes = join(target.base, "ambient-attributes");
  const ambientConfig = join(target.base, "ambient-gitconfig");
  const ambientFilter = join(target.base, "ambient-filter");
  const controlRepository = join(target.base, "ambient-control");
  await mkdir(decoys);
  await mkdir(join(ambientHome, ".config", "git"), { recursive: true });
  await mkdir(controlRepository);
  await writeFile(join(decoys, "shield"), `#!/bin/sh\nprintf invoked > ${JSON.stringify(shieldMarker)}\nexit 97\n`);
  await writeFile(join(decoys, "nx"), `#!/bin/sh\nprintf invoked > ${JSON.stringify(nxMarker)}\nexit 98\n`);
  await writeFile(join(decoys, "git"), `#!/bin/sh\nprintf invoked > ${JSON.stringify(gitMarker)}\nexit 96\n`);
  await writeFile(join(decoys, "code"), `#!/bin/sh\nif [ "$1" = "--new-window" ]; then printf invoked > ${JSON.stringify(openMarker)}; exit 99; fi\nif [ "$1" = "--version" ]; then printf '1.133.0\\n${"a".repeat(40)}\\narm64\\n'; exit 0; fi\nif [ "$1" = "--list-extensions" ] && [ "$2" = "--show-versions" ]; then printf 'openai.chatgpt@26.810.41047\\n'; exit 0; fi\nexit 95\n`);
  await writeFile(ambientAttributes, "* filter=ambient\n");
  await writeFile(join(ambientHome, ".config", "git", "attributes"), "* filter=ambient\n");
  await writeFile(ambientFilter, `#!/bin/sh\ncat\nprintf invoked > ${JSON.stringify(filterMarker)}\n`);
  await writeFile(ambientConfig, `[core]\n\tattributesFile = ${ambientAttributes}\n[filter "ambient"]\n\tclean = ${ambientFilter}\n\tsmudge = ${ambientFilter}\n\trequired = true\n`);
  await Promise.all([
    ...["shield", "nx", "git", "code"].map((name) => chmod(join(decoys, name), 0o755)),
    chmod(ambientFilter, 0o755),
  ]);
  const ambientEnvironment = {
    ...process.env,
    GIT_ATTR_NOSYSTEM: "0",
    GIT_CONFIG_GLOBAL: ambientConfig,
    GIT_CONFIG_SYSTEM: ambientConfig,
    HOME: ambientHome,
  };
  execFileSync("git", ["init", "--quiet"], { cwd: controlRepository, env: ambientEnvironment });
  await writeFile(join(controlRepository, "payload.txt"), "control\n");
  execFileSync("git", ["add", "payload.txt"], { cwd: controlRepository, env: ambientEnvironment });
  assert.equal(await readFile(filterMarker, "utf8"), "invoked");
  await unlink(filterMarker);
  const previousEnvironment = Object.fromEntries(
    ["PATH", "HOME", "GIT_ATTR_NOSYSTEM", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"].map((name) => [name, process.env[name]]),
  );
  process.env.PATH = `${decoys}:${previousEnvironment.PATH ?? ""}`;
  process.env.HOME = ambientHome;
  process.env.GIT_ATTR_NOSYSTEM = "0";
  process.env.GIT_CONFIG_GLOBAL = ambientConfig;
  process.env.GIT_CONFIG_SYSTEM = ambientConfig;
  const native = createNativeDependencies();
  let preflightEnvironment;
  let preflightArguments;
  let preflightOutput;
  let launcherGitConfigured = true;
  const dependencies = {
    ...native,
    runProcess: async (executable, args, options) => {
      if (isGit(executable)) {
        const fsmonitorIndex = args.indexOf("core.fsmonitor=false");
        const attributesIndex = args.indexOf("core.attributesFile=/dev/null");
        launcherGitConfigured &&= fsmonitorIndex > 0 && args[fsmonitorIndex - 1] === "-c" &&
          attributesIndex > 0 && args[attributesIndex - 1] === "-c" && options.env.GIT_ATTR_NOSYSTEM === "1" &&
          executable !== join(decoys, "git");
      }
      if (executable === process.execPath && args.includes("teammate") && args.includes("preflight")) {
        preflightEnvironment = options.env;
        preflightArguments = [...args];
      }
      const processResult = await native.runProcess(executable, args, options);
      if (executable === process.execPath && args.includes("teammate") && args.includes("preflight")) {
        preflightOutput = processResult.stdout;
      }
      return processResult;
    },
  };
  try {
    const result = await launchTeammateTrial(input(target.root), dependencies);
    assert.equal(result.authority, "none");
    assert.equal(result.disposition, "ready_for_host_confirmation", `${JSON.stringify(result)}\n${preflightOutput ?? ""}`);
    assert.equal(result.reasonCode, "ready_for_host_confirmation");
    assert.deepEqual(result.nextAction, {
      executable: "code",
      arguments: ["--new-window", target.root],
      display: `code --new-window ${JSON.stringify(target.root)}`,
    });
    assert.equal(result.repository.expectedHead, expectedHead);
    assert.equal(result.repository.observedHead, expectedHead);
    assert.equal(result.artifacts.bootstrap.sha256, bootstrapSha256);
    assert.equal(result.artifacts.prompt.path, promptPath);
    assert.equal(result.publicationSafeReceipt.repository.sourceRoot, "<SOURCE_ROOT>");
    assert.equal(result.publicationSafeReceipt.repository.disposableRoot, "<DISPOSABLE_ROOT>");
    assert.equal(JSON.stringify(result.publicationSafeReceipt).includes(target.root), false);
    const receipt = JSON.parse(await readFile(`${target.root}${receiptSuffix}`, "utf8"));
    assert.equal(Object.hasOwn(receipt, "authority"), false);
    assert.equal(Object.hasOwn(receipt, "adapter"), false);
    assert.equal(receipt.contractVersion, "shield.teammate-launch.v1");
    assert.equal(receipt.repository.expectedHead, expectedHead);
    assert.equal(receipt.target.nxVersion, "23.1.0");
    assert.match(receipt.target.missionPreparationDistManifestSha256, /^[0-9a-f]{64}$/u);
    assert.match(receipt.target.teamSystemDistManifestSha256, /^[0-9a-f]{64}$/u);
    assert.equal(launcherGitConfigured, true);
    assert.equal(preflightEnvironment.GIT_CONFIG_KEY_3, "core.fsmonitor");
    assert.equal(preflightEnvironment.GIT_CONFIG_VALUE_3, "false");
    assert.equal(preflightEnvironment.GIT_ATTR_NOSYSTEM, "1");
    assert.equal(preflightEnvironment.GIT_CONFIG_COUNT, "6");
    assert.equal(preflightEnvironment.GIT_CONFIG_KEY_5, "core.attributesFile");
    assert.equal(preflightEnvironment.GIT_CONFIG_VALUE_5, "/dev/null");
    assert.equal(preflightEnvironment.SHELL, undefined);
    assert.equal(preflightEnvironment.PATH.includes(decoys), false);
    assert.deepEqual(preflightArguments, [
      join(target.root, "packages/shield-team-system/dist/cli.mjs"),
      "teammate", "preflight", "--root", target.root,
      "--expected-head", expectedHead, "--json",
    ]);
    for (const marker of [shieldMarker, nxMarker, gitMarker, filterMarker, openMarker]) await assert.rejects(readFile(marker), { code: "ENOENT" });
  } finally {
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await cleanup(target);
  }
});
