import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("begin mission playbook defines the canonical intake workflow", async () => {
  const playbook = await readRepoFile("playbooks/begin-mission.md");

  assert.match(playbook, /# Begin Mission/);
  assert.match(
    playbook,
    /Define a repeatable mission intake process that runs before any implementation\s+work\./,
  );
  assert.match(playbook, /1\. Understand the objective\./);
  assert.match(playbook, /2\. Gather context\./);
  assert.match(playbook, /3\. Produce the Mission Brief\./);
  assert.match(playbook, /4\. Select and attach mission modes\./);
  assert.match(playbook, /5\. Present the Mission Brief to Phil Coulson for approval\./);
  assert.match(playbook, /6\. Dispatch the mission only after approval\./);
  assert.match(playbook, /## Lightweight operational path/);
  assert.match(playbook, /Low-risk, reversible operational missions/);
  assert.match(playbook, /Coulson response window/);
  assert.match(playbook, /does not count as Coulson approval/);
  assert.match(playbook, /## Recommended versus activated modes/);
  assert.match(playbook, /Recommended modes are proposals/);
  assert.match(playbook, /Activated modes are the modes actually attached/);
});

test("mission brief template captures the required intake artifact", async () => {
  const template = await readRepoFile("playbooks/repo-context/mission-brief-template.md");

  assert.match(template, /# Mission Brief Template/);
  assert.match(template, /## Objective/);
  assert.match(template, /## Constraints/);
  assert.match(template, /## Success Criteria/);
  assert.match(template, /## Risks/);
  assert.match(template, /## Recommended Participants/);
  assert.match(template, /## Suggested Modes/);
  assert.match(template, /## Activation Status/);
  assert.match(template, /Coulson response window:/);
  assert.match(template, /Hill-approved mission plan if the window expires:/);
  assert.match(template, /## Approval Request/);
});

test("Hill and Coulson document intake before dispatch", async () => {
  const hill = await readRepoFile("agents/maria-hill-orchestrator.agent.md");
  const coulson = await readRepoFile("agents/phil-coulson-human-player-1.agent.md");

  assert.match(hill, /Begin mission intake: follow `\.\.\/playbooks\/begin-mission\.md`/);
  assert.match(hill, /Produce a Mission Brief before specialist implementation begins/);
  assert.match(hill, /A recommended mode is not active until the Mission Brief records its activation/);
  assert.match(hill, /Only low-risk, reversible operational missions may use the documented Coulson response window/);
  assert.match(coulson, /Approve or reject the Mission Brief before implementation is dispatched\./);
  assert.match(coulson, /Silence during a lightweight operational response window is not approval/);
});
