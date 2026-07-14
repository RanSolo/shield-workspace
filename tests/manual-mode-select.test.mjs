import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("manual mode select is documented as an optional override", async () => {
  const missionModes = await readRepoFile("modes/mission-modes.md");
  const playbook = await readRepoFile("playbooks/manual-mode-select.md");

  assert.match(missionModes, /## Manual mode select/);
  assert.match(missionModes, /manual selection overrides automatic mode assignment for that mission/);
  assert.match(playbook, /Manual mode selection is optional\./);
  assert.match(
    playbook,
    /The default Hill-driven workflow remains unchanged when no manual override is\s+provided\./,
  );
});

test("Hill and Coulson prompts reflect manual mode selection", async () => {
  const hill = await readRepoFile("agents/maria-hill-orchestrator.agent.md");
  const coulson = await readRepoFile("agents/phil-coulson-human-player-1.agent.md");
  const scorecard = await readRepoFile("scorecard.md");

  assert.match(hill, /Honor manual character and mode selections when a human operator provides them\./);
  assert.match(coulson, /Choose one or more mission modes when manual mode selection is needed/);
  assert.match(scorecard, /\*\*Mode Selection Source:\*\* Automatic \/ Manual/);
  assert.match(scorecard, /\*\*Selected Modes:\*\*/);
});
