import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("dynamic mode composition keeps identity separate from expertise", async () => {
  const playbook = await readRepoFile("playbooks/dynamic-mode-composition.md");
  const missionModes = await readRepoFile("modes/mission-modes.md");

  assert.match(playbook, /Agents define identity, responsibilities, authority, and boundaries\./);
  assert.match(playbook, /Modes define reusable expertise, tools, workflows, and mission context\./);
  assert.match(missionModes, /seats define identity, authority, and responsibility/);
  assert.match(missionModes, /modes define reusable expertise, tools, and mission context/);
  assert.match(missionModes, /only participating seats receive loaded modes for the current mission/);
});

test("Hill and the scorecard document per-seat mode attachments", async () => {
  const hill = await readRepoFile("agents/maria-hill-orchestrator.agent.md");
  const scorecard = await readRepoFile("scorecard.md");

  assert.match(hill, /Attach one or more modes to each participating seat based on the mission\./);
  assert.match(hill, /documenting mode attachments for each participating seat/);
  assert.match(scorecard, /#### Mode Attachments/);
  assert.match(scorecard, /\| Seat \| Attached Modes \| Reason \|/);
});
