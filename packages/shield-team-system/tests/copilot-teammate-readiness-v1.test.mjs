import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function hostDependencies(extension = "github.copilot-chat@0.32.3\n") {
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
        if (args[0] === "--version") return { state: "success", stdout: `1.133.0\n${"a".repeat(40)}\narm64\n` };
        return { state: "success", stdout: extension };
      },
    },
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

test("Copilot preflight fails closed for a wrong extension, stale revision, or agent drift", async () => {
  const target = await fixture();
  try {
    const wrongHost = hostDependencies("openai.chatgpt@26.810.41047\n").dependencies;
    const wrongExtension = await runCopilotTeammateReadinessPreflightV1({ root: target.root, expectedHead: target.head }, wrongHost);
    assert.equal(wrongExtension.disposition, "action_required");
    assert.equal(wrongExtension.host.copilotExtension.classification, "malformed");
    assert.equal(wrongExtension.machineChecks.find((entry) => entry.id === "host.copilot_extension").status, "fail");

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
