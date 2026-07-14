import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("charter defines the mode request protocol", async () => {
  const charter = await readRepoFile("agents/shield-team-charter.agent.md");

  assert.match(charter, /Agents do not silently attach modes to themselves during execution\./);
  assert.match(charter, /Approved mode requests are mission-scoped unless explicitly promoted to a permanent workflow rule\./);
  assert.match(charter, /## Mode request protocol/);
  assert.match(charter, /The mission record captures the requested mode, requesting agent, reason, approver, and outcome\./);
});

test("seat prompts route mode requests through Maria Hill", async () => {
  const hill = await readRepoFile("agents/maria-hill-orchestrator.agent.md");
  const daisy = await readRepoFile("agents/daisy-johnson-debugger-recon.agent.md");
  const may = await readRepoFile("agents/melinda-may-implementer.agent.md");

  assert.match(hill, /Approve, reject, or escalate agent mode requests\./);
  assert.match(hill, /recording requested modes, approvers, and outcomes for the current mission/);
  assert.match(daisy, /Do not silently attach modes to yourself; request them through Maria Hill\./);
  assert.match(may, /Do not silently attach modes to yourself; request them through Maria Hill\./);
});

test("mission docs and scorecard record mode requests", async () => {
  const missionModes = await readRepoFile("modes/mission-modes.md");
  const playbook = await readRepoFile("playbooks/agent-request-mode.md");
  const scorecard = await readRepoFile("scorecard.md");

  assert.match(missionModes, /## Mid-mission mode requests/);
  assert.match(playbook, /## Rules/);
  assert.match(playbook, /The requesting seat must explain why the mode is needed\./);
  assert.match(scorecard, /#### Mode Requests/);
  assert.match(scorecard, /\| Requested Mode \| Requesting Agent \| Reason \| Approver \| Outcome \|/);
});
