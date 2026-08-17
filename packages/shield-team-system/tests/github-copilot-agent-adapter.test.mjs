import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  COPILOT_AGENT_PATHS,
  parseCopilotAgentCardV1,
  validateCopilotAgentSetV1,
} from "../dist/copilot-teammate-readiness-v1.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const planningBase = "e37461f022544bdbd4246e00057a29e6047c2d04";
const expectedFiles = ["daisy.agent.md", "fury.agent.md", "hill.agent.md", "mack.agent.md", "may.agent.md"];
const pathsBySeat = new Map(COPILOT_AGENT_PATHS.map((path) => [path.split("/").at(-1).replace(".agent.md", ""), path]));

async function trackedCards() {
  return new Map(await Promise.all(COPILOT_AGENT_PATHS.map(async (path) => [path, await readFile(join(workspaceRoot, path), "utf8")])));
}

test("workspace exposes exactly the five closed Copilot seat cards", async () => {
  assert.deepEqual((await readdir(join(workspaceRoot, ".github/agents"))).sort(), expectedFiles);
  const declarations = validateCopilotAgentSetV1(await trackedCards());
  assert.deepEqual(declarations.map(({ seat, name, path, model }) => ({ seat, name, path, model })), [
    { seat: "hill", name: "Hill", path: ".github/agents/hill.agent.md", model: "host-selected" },
    { seat: "daisy", name: "Daisy", path: ".github/agents/daisy.agent.md", model: "host-selected" },
    { seat: "fury", name: "Fury", path: ".github/agents/fury.agent.md", model: "host-selected" },
    { seat: "may", name: "May", path: ".github/agents/may.agent.md", model: "host-selected" },
    { seat: "mack", name: "Mack", path: ".github/agents/mack.agent.md", model: "host-selected" },
  ]);
  assert.ok(declarations.every((entry) => /^[0-9a-f]{64}$/u.test(entry.sha256)));
});

test("frontmatter preserves exact capability, invocation, and routing boundaries", async () => {
  const cards = await trackedCards();
  const expectedTools = {
    hill: ["read", "search", "web", "agent"],
    daisy: ["read", "search", "web"],
    fury: ["read", "search", "web"],
    may: ["read", "search", "web", "edit", "execute"],
    mack: ["read", "search", "execute"],
  };
  const parsed = new Map([...pathsBySeat].map(([seat, path]) => [seat, parseCopilotAgentCardV1(cards.get(path))]));
  for (const [seat, card] of parsed) {
    assert.equal(card.frontmatter.target, "vscode");
    assert.equal(card.frontmatter["user-invocable"], true);
    assert.equal(card.frontmatter["disable-model-invocation"], seat !== "hill");
    assert.deepEqual(card.frontmatter.tools, expectedTools[seat]);
    assert.equal(Object.hasOwn(card.frontmatter, "model"), false);
    if (seat !== "hill") {
      assert.equal(Object.hasOwn(card.frontmatter, "agents"), false);
      assert.equal(Object.hasOwn(card.frontmatter, "handoffs"), false);
      assert.equal(card.frontmatter.tools.includes("agent"), false);
    }
  }
  const hill = parsed.get("hill").frontmatter;
  assert.deepEqual(hill.agents, ["Daisy", "Fury", "May", "Mack"]);
  assert.deepEqual(hill.handoffs.map(({ agent, send }) => ({ agent, send })), [
    { agent: "Daisy", send: false }, { agent: "Fury", send: false },
    { agent: "May", send: false }, { agent: "Mack", send: false },
  ]);
  assert.equal(JSON.stringify(hill.handoffs).includes("model"), false);
  for (const target of hill.agents) {
    assert.equal([...parsed.values()].filter((card) => card.frontmatter.name === target).length, 1);
  }
});

test("strict parser rejects duplicate, unknown, mistyped, and open nested frontmatter", async () => {
  const hill = (await trackedCards()).get(pathsBySeat.get("hill"));
  for (const changed of [
    hill.replace("name: Hill\n", "name: Hill\nname: Other\n"),
    hill.replace("name: Hill\n", "model: pinned\nname: Hill\n"),
    hill.replace("user-invocable: true", "user-invocable: yes"),
    hill.replace("    send: false", "    model: pinned\n    send: false"),
    hill.replace("tools: [read, search, web, agent]", "tools: read, search, web, agent"),
  ]) assert.throws(() => parseCopilotAgentCardV1(changed));
});

test("seat bodies preserve shared and seat-specific governance", async () => {
  const parsed = new Map([...await trackedCards()].map(([path, text]) => [path.split("/").at(-1).replace(".agent.md", ""), parseCopilotAgentCardV1(text).body]));
  for (const body of parsed.values()) {
    assert.match(body, /Coulson, Fitz, and Simmons are human seats and cannot be simulated/u);
    assert.match(body, /Missing,\nstale, malformed, ambiguous, or conflicting authority fails closed/u);
    assert.match(body, /exact repository revision/u);
    assert.match(body, /merge, deployment, release, destructive effect, or expanded scope/u);
    assert.match(body, /Report only\nactions and evidence that actually occurred/u);
    assert.match(body, /cross-seat\s+orchestration need to Hill|cross-seat orchestration back through Hill/u);
  }
  assert.match(parsed.get("hill"), /Coordinate[\s\S]*do not own production implementation/u);
  assert.match(parsed.get("daisy"), /without editing, implementing, or deciding architecture/u);
  assert.match(parsed.get("fury"), /technical review[\s\S]*grants no human authority/u);
  assert.match(parsed.get("may"), /exact\nFury-approved plan after separately recorded Coulson authority/u);
  assert.match(parsed.get("mack"), /independently and never modify production behavior/u);
  assert.match(parsed.get("fury"), /versioned launcher and Mack validation packet/u);
  assert.match(parsed.get("fury"), /identity evidence is absent or inconsistent/u);
  assert.match(parsed.get("fury"), /Without an\nexecution tool, never claim independent Git verification/u);
});

test("Codex seat adapter remains byte-identical to the planning base", () => {
  execFileSync("git", ["diff", "--exit-code", planningBase, "--", ".codex/agents"], { cwd: workspaceRoot, stdio: "pipe" });
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", planningBase, "--", ".codex/agents"], { cwd: workspaceRoot, encoding: "utf8" });
  assert.deepEqual(files.trim().split("\n").sort(), [
    ".codex/agents/daisy.toml", ".codex/agents/fury.toml", ".codex/agents/hill.toml", ".codex/agents/mack.toml", ".codex/agents/may.toml",
  ]);
});

test("teammate trial distinguishes Copilot picker discovery from Codex subagents", async () => {
  const guide = await readFile(join(workspaceRoot, "docs/operations/vscode-agents-teammate-trial.md"), "utf8");
  assert.match(guide, /\.github\/agents\/\*\.agent\.md[\s\S]*VS Code\nCopilot agent picker/u);
  assert.match(guide, /\.codex\/config\.toml[\s\S]*Codex subagents/u);
  assert.match(guide, /visibly discovers exactly `Hill`, `Daisy`, `Fury`,\n`May`, and `Mack` in the Copilot picker/u);
  assert.match(guide, /agentHost: "github-copilot"[\s\S]*shield\.copilot-teammate-readiness\.v1/u);
  assert.match(guide, /--host github-copilot --json/u);
  assert.match(guide, /github\.copilot-chat/u);
  assert.match(guide, /does not probe\nthe OpenAI extension or a global Codex CLI/u);
});
