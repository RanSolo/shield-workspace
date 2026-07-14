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
  assert.match(template, /## Approval Request/);
});

test("Hill and Coulson document intake before dispatch", async () => {
  const hill = await readRepoFile("agents/maria-hill-orchestrator.agent.md");
  const coulson = await readRepoFile("agents/phil-coulson-human-player-1.agent.md");

  assert.match(hill, /Begin mission intake: follow `\.\.\/playbooks\/begin-mission\.md`/);
  assert.match(hill, /Produce a Mission Brief before specialist implementation begins/);
  assert.match(coulson, /Approve or reject the Mission Brief before implementation is dispatched\./);
});
