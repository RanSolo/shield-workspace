import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  COPILOT_AGENT_PATHS,
  COPILOT_TEAMMATE_READINESS_CONTRACT_VERSION,
  probeCopilotTeammateHostV1,
  projectCopilotTeammateReadinessForPublicationV1,
  runCopilotTeammateReadinessPreflightV1,
} from "../dist/copilot-teammate-readiness-v1.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shield-copilot-readiness-"));
  await mkdir(join(root, ".github", "agents"), { recursive: true });
  for (const path of COPILOT_AGENT_PATHS) {
    await writeFile(join(root, path), await readFile(join(workspaceRoot, path)));
  }
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "SHIELD Test"]);
  git(root, ["config", "user.email", "shield-test@example.invalid"]);
  git(root, ["add", ".github/agents"]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  return { root, head: git(root, ["rev-parse", "HEAD"]) };
}

function hostDependencies(
  extension = "github.copilot-chat@0.32.3\n",
  version = { state: "success", stdout: `1.133.0\n${"a".repeat(40)}\narm64\n` },
) {
  const calls = [];
  return {
    calls,
    dependencies: {
      findExecutable: async (name) => {
        calls.push(["find", name]);
        return "/fixture/bin/code";
      },
      execute: async (_executable, args) => {
        calls.push(["execute", ...args]);
        if (args[0] === "--version") return version;
        return typeof extension === "string" ? { state: "success", stdout: extension } : extension;
      },
    },
  };
}

function capability(disposition = "ready", reasonCode = "ready") {
  return {
    schemaVersion: 1,
    contractVersion: "shield.copilot-fury-dispatch-capability.v1",
    authority: "none",
    disposition,
    reasonCode,
    nextAction: disposition === "ready" ? "No machine action is required for this capability." : `Resolve ${reasonCode} and rerun.`,
  };
}

test("Copilot host probe observes only VS Code and github.copilot-chat", async () => {
  const { calls, dependencies } = hostDependencies();
  const host = await probeCopilotTeammateHostV1(dependencies);
  assert.equal(host.vscode.classification, "available");
  assert.deepEqual(host.copilotExtension, { classification: "available", identifier: "github.copilot-chat", version: "0.32.3" });
  assert.deepEqual(host.entitlement, { status: "unverified" });
  assert.deepEqual(calls, [
    ["find", "code"],
    ["execute", "--version"],
    ["execute", "--list-extensions", "--show-versions"],
  ]);
  assert.doesNotMatch(JSON.stringify(calls), /codex|openai\.chatgpt/u);
});

test("Copilot preflight binds ordered agent blobs, host-selected models, and unverified confirmations", async () => {
  const target = await fixture();
  try {
    const { dependencies } = hostDependencies();
    const report = await runCopilotTeammateReadinessPreflightV1({ root: target.root, expectedHead: target.head }, dependencies);
    assert.equal(report.contractVersion, COPILOT_TEAMMATE_READINESS_CONTRACT_VERSION);
    assert.equal(report.authority, "none");
    assert.deepEqual(report.adapter, { kind: "github-copilot" });
    assert.equal(report.disposition, "ready_for_host_confirmation");
    assert.deepEqual(report.agents.map(({ seat, path, model }) => ({ seat, path, model })), [
      { seat: "hill", path: ".github/agents/hill.agent.md", model: "host-selected" },
      { seat: "daisy", path: ".github/agents/daisy.agent.md", model: "host-selected" },
      { seat: "fury", path: ".github/agents/fury.agent.md", model: "host-selected" },
      { seat: "may", path: ".github/agents/may.agent.md", model: "host-selected" },
      { seat: "mack", path: ".github/agents/mack.agent.md", model: "host-selected" },
    ]);
    assert.ok(report.agents.every((agent) => /^[0-9a-f]{64}$/u.test(agent.sha256)));
    assert.deepEqual(report.machineChecks.map(({ id }) => id), [
      "input.closed",
      "repository.root",
      "repository.expected_head",
      "repository.clean",
      "repository.copilot_agents",
      "platform.fury_dispatch",
      "host.vscode",
      "host.copilot_extension",
      "repository.stable",
    ]);
    assert.deepEqual(report.machineChecks.find(({ id }) => id === "platform.fury_dispatch"), {
      id: "platform.fury_dispatch",
      status: "pass",
      reasonCode: "ready",
      nextAction: "No machine action is required for this capability.",
    });
    assert.equal(report.hostConfirmations.length, 27);
    assert.deepEqual(report.hostConfirmations.slice(0, 4), [
      { id: "host.copilot_picker_rendered", status: "unverified" },
      { id: "host.account_entitlement", status: "unverified" },
      { id: "host.seat.hill.identity", status: "unverified" },
      { id: "host.seat.hill.selected_model", status: "unverified" },
    ]);
    assert.ok(report.hostConfirmations.every((entry) => entry.status === "unverified"));
    const projected = projectCopilotTeammateReadinessForPublicationV1(report);
    assert.equal(projected.repository.root, "<DISPOSABLE_ROOT>");
    assert.equal(JSON.stringify(projected).includes(target.root), false);
  } finally {
    await rm(target.root, { recursive: true, force: false });
  }
});

test("Copilot preflight uses the shared Fury capability row and fails before readiness", async () => {
  const target = await fixture();
  const canonicalRoot = await realpath(target.root);
  let probes = 0;
  try {
    const report = await runCopilotTeammateReadinessPreflightV1(
      { root: target.root, expectedHead: target.head },
      {
        ...hostDependencies().dependencies,
        async probeFuryDispatchCapability(input) {
          probes += 1;
          assert.deepEqual(input, { repositoryRoot: canonicalRoot, expectedHead: target.head });
          return capability("unavailable", "copilot_sdk_version_mismatch");
        },
      },
    );
    assert.equal(probes, 1);
    assert.equal(report.disposition, "action_required");
    assert.equal(report.reasonCode, "copilot_sdk_version_mismatch");
    assert.deepEqual(report.machineChecks.find(({ id }) => id === "platform.fury_dispatch"), {
      id: "platform.fury_dispatch",
      status: "fail",
      reasonCode: "copilot_sdk_version_mismatch",
      nextAction: "Resolve copilot_sdk_version_mismatch and rerun.",
    });
    const projected = projectCopilotTeammateReadinessForPublicationV1(report);
    assert.equal(JSON.stringify(projected).includes(target.root), false);
  } finally {
    await rm(target.root, { recursive: true, force: false });
  }
});

test("closed Copilot extension observations remain advisory and preserve unverified host confirmations", async () => {
  const target = await fixture();
  const cases = [
    ["bundled or unlisted", "", "unavailable", "copilot_extension_not_observed"],
    ["wrong-PATH extension inventory", "openai.chatgpt@26.810.41047\n", "unavailable", "copilot_extension_not_observed"],
    ["malformed entry", "github.copilot-chat@not-semver\n", "malformed", "copilot_extension_observation_malformed"],
    ["duplicate entries", "github.copilot-chat@0.32.3\ngithub.copilot-chat@0.32.3\n", "malformed", "copilot_extension_observation_malformed"],
    ["timed out probe", { state: "timeout", stdout: "" }, "timeout", "copilot_extension_observation_timeout"],
    ["failed probe", { state: "failed", stdout: "" }, "unavailable", "copilot_extension_not_observed"],
  ];
  try {
    for (const [label, extension, classification, reasonCode] of cases) {
      const report = await runCopilotTeammateReadinessPreflightV1(
        { root: target.root, expectedHead: target.head },
        hostDependencies(extension).dependencies,
      );
      assert.equal(report.disposition, "ready_for_host_confirmation", label);
      assert.deepEqual(report.host.copilotExtension, {
        classification,
        identifier: "github.copilot-chat",
        version: null,
      }, label);
      assert.deepEqual(report.machineChecks.find((entry) => entry.id === "host.copilot_extension"), {
        id: "host.copilot_extension",
        status: "observed",
        reasonCode,
        nextAction: "Confirm the Copilot picker, account entitlement, and required agents visibly in VS Code.",
      }, label);
      assert.ok(report.hostConfirmations.every((entry) => entry.status === "unverified"), label);
    }
  } finally {
    await rm(target.root, { recursive: true, force: false });
  }
});

test("available Copilot extension uses the closed advisory no-action row", async () => {
  const target = await fixture();
  try {
    const report = await runCopilotTeammateReadinessPreflightV1(
      { root: target.root, expectedHead: target.head },
      hostDependencies().dependencies,
    );
    assert.deepEqual(report.machineChecks.find((entry) => entry.id === "host.copilot_extension"), {
      id: "host.copilot_extension",
      status: "observed",
      reasonCode: "none",
      nextAction: "No machine action is required for this check.",
    });
  } finally {
    await rm(target.root, { recursive: true, force: false });
  }
});

test("Copilot preflight still blocks absent or malformed VS Code host observations", async () => {
  const target = await fixture();
  const versions = [
    { state: "unavailable", stdout: "" },
    { state: "success", stdout: "not-a-vscode-version\n" },
  ];
  try {
    for (const version of versions) {
      const report = await runCopilotTeammateReadinessPreflightV1(
        { root: target.root, expectedHead: target.head },
        hostDependencies("", version).dependencies,
      );
      assert.equal(report.disposition, "action_required");
      assert.equal(report.reasonCode, "host_probe_failed");
      assert.equal(report.machineChecks.find((entry) => entry.id === "host.vscode").status, "fail");
      assert.equal(report.machineChecks.find((entry) => entry.id === "host.copilot_extension").status, "observed");
    }
  } finally {
    await rm(target.root, { recursive: true, force: false });
  }
});

test("Copilot preflight still blocks missing or malformed agent cards", async () => {
  for (const malformed of [false, true]) {
    const target = await fixture();
    try {
      const mayCard = join(target.root, ".github/agents/may.agent.md");
      if (malformed) await writeFile(mayCard, "malformed\n");
      else await unlink(mayCard);
      git(target.root, ["add", "-A"]);
      git(target.root, ["commit", "--quiet", "-m", malformed ? "malformed card" : "missing card"]);
      const head = git(target.root, ["rev-parse", "HEAD"]);
      const report = await runCopilotTeammateReadinessPreflightV1(
        { root: target.root, expectedHead: head },
        hostDependencies("").dependencies,
      );
      assert.equal(report.disposition, "action_required");
      assert.equal(report.reasonCode, "declaration_invalid");
      assert.equal(report.machineChecks.find((entry) => entry.id === "repository.copilot_agents").status, "fail");
      assert.equal(report.machineChecks.find((entry) => entry.id === "host.copilot_extension").status, "observed");
    } finally {
      await rm(target.root, { recursive: true, force: false });
    }
  }
});

test("Copilot preflight fails closed for a stale revision or agent drift", async () => {
  const target = await fixture();
  try {
    const stale = await runCopilotTeammateReadinessPreflightV1({ root: target.root, expectedHead: "b".repeat(40) }, hostDependencies().dependencies);
    assert.equal(stale.reasonCode, "expected_head_mismatch");
    assert.deepEqual(stale.agents, []);

    await writeFile(join(target.root, ".github/agents/may.agent.md"), "drift\n");
    const dirty = await runCopilotTeammateReadinessPreflightV1({ root: target.root, expectedHead: target.head }, hostDependencies().dependencies);
    assert.equal(dirty.reasonCode, "workspace_dirty");
    assert.equal(dirty.repository.clean, false);
  } finally {
    await rm(target.root, { recursive: true, force: false });
  }
});

test("Copilot preflight rejects open input and repository drift", async () => {
  const invalid = await runCopilotTeammateReadinessPreflightV1({ root: "/tmp", expectedHead: "a".repeat(40), host: "github-copilot" });
  assert.equal(invalid.reasonCode, "invalid_input");
  assert.equal(invalid.authority, "none");

  const target = await fixture();
  try {
    const report = await runCopilotTeammateReadinessPreflightV1(
      { root: target.root, expectedHead: target.head },
      {
        ...hostDependencies().dependencies,
        beforeFinalObservation: async () => writeFile(join(target.root, "drift.txt"), "drift\n"),
      },
    );
    assert.equal(report.machineChecks.find((entry) => entry.id === "repository.stable").status, "fail");
    assert.equal(report.disposition, "action_required");
  } finally {
    await rm(target.root, { recursive: true, force: false });
  }
});
