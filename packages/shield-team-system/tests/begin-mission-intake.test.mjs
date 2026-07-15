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
  assert.match(playbook, /4\. Recommend mission modes and proposed seat attachments\./);
  assert.match(playbook, /5\. Present the Mission Brief to Phil Coulson for approval\./);
  assert.match(
    playbook,
    /6\. After approval, activate and attach the approved modes, then dispatch the\s+mission\./,
  );
  assert.match(playbook, /## Lightweight operational path/);
  assert.match(playbook, /Low-risk, reversible operational missions/);
  assert.match(playbook, /Coulson response window/);
  assert.match(playbook, /does not count as Coulson approval/);
  assert.match(playbook, /fully automatic runner is a future capability/);
  assert.match(playbook, /must not infer or merely claim that the window elapsed/);
  assert.match(playbook, /explicit Coulson approval remains required/);
  assert.match(playbook, /all non-lightweight work require Phil Coulson's\s+explicit approval/);
  assert.match(
    playbook,
    /eligible lightweight operational mission may instead\s+activate only through the verified-timeout path/,
  );
  assert.match(playbook, /may dispatch specialist work only after explicit Coulson approval/);
  assert.match(playbook, /does not authorize specialist dispatch/);
  assert.match(playbook, /contracts\/mission-policy\.mjs/);
  assert.match(playbook, /approve`, `edit`, `reject`, `pause`,/);
  assert.match(playbook, /Missing, unknown, or non-boolean risk data fails closed/);
  assert.match(playbook, /One repair is allowed automatically/);
  assert.match(playbook, /hard cap is absolute/);
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
  assert.match(template, /Window opened at \(ISO 8601\):/);
  assert.match(template, /Window evaluated at \(ISO 8601\):/);
  assert.match(template, /Timing evidence source:/);
  assert.match(template, /Hill-approved mission plan if the window expires:/);
  assert.match(template, /## Approval Request/);
  assert.match(template, /Current mission state:/);
  assert.match(template, /Risk flags/);
  assert.match(template, /Completed repairs:/);
  assert.match(template, /Repair hard cap/);
  assert.match(template, /Specialist dispatch authorized:/);
});

test("Hill and Coulson document intake before dispatch", async () => {
  const hill = await readRepoFile("agents/maria-hill-orchestrator.agent.md");
  const coulson = await readRepoFile("agents/phil-coulson-human-player-1.agent.md");

  assert.match(hill, /Begin mission intake: follow `\.\.\/playbooks\/begin-mission\.md`/);
  assert.match(hill, /Produce a Mission Brief before specialist implementation begins/);
  assert.match(hill, /A recommended mode is not active until the Mission Brief records its activation/);
  assert.match(hill, /Only low-risk, reversible operational missions may use the documented Coulson response window/);
  assert.match(hill, /trustworthy host timing evidence or human-recorded ISO 8601 timestamps/);
  assert.match(coulson, /Approve or reject the Mission Brief before implementation is dispatched\./);
  assert.match(coulson, /Silence during a lightweight operational response window is not approval/);
  assert.match(coulson, /Untimestamped or inferred timeout claims require explicit Coulson approval/);
  assert.match(coulson, /approve \/ edit \/ reject \/ pause \/ resume \/ cancel/);
  assert.match(hill, /evaluateLightweightTimeout/);
  assert.match(hill, /canDispatchSpecialists/);
});
