import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("delivery mode defines the planned-work contract and role boundaries", async () => {
  const mode = await readRepoFile("modes/delivery-mode.md");

  assert.match(mode, /We know what we want to build\. Deliver it\./);
  assert.match(mode, /Use Debugger Mode instead when the primary task is to explain a defect/);
  assert.match(mode, /Delivery Mode begins with `\.\.\/playbooks\/begin-mission\.md`/);
  assert.match(mode, /Maria Hill \(Orchestrator\).*owns intake, routing, operational coordination/s);
  assert.match(mode, /Melinda May \(Implementer\).*owns production implementation/s);
  assert.match(mode, /Daisy Johnson.*evidence that reduces implementation\s+uncertainty/s);
  assert.match(mode, /Nick Fury.*reviews the architecture/s);
  assert.match(mode, /Nick Fury.*implementation still matches the approved plan/s);
  assert.match(mode, /Leo Fitz.*performs the technical review/s);
  assert.match(mode, /Jemma Simmons.*reviews acceptance criteria/s);
  assert.match(mode, /Phil Coulson.*approves the Mission Brief/s);
  assert.match(mode, /Only participating seats receive Delivery Mode context/);
  assert.match(mode, /Require explicit Phil Coulson approval before specialist dispatch/);
  assert.match(mode, /Delivery Mode cannot use the lightweight operational timeout path/);
  assert.match(mode, /Fury implementation sanity-review status/);
});

test("delivery playbook encodes stages, readiness, and validation gates", async () => {
  const playbook = await readRepoFile("playbooks/delivery-mode.md");

  for (const stage of [
    "1. Mission Intake",
    "2. Requirements & Scope",
    "3. Architecture Review",
    "4. Implementation",
    "5. Validation",
    "6. Fury Implementation Sanity Review",
    "7. Technical Review",
    "8. Product Review",
    "9. Pull Request Finalization",
  ]) {
    assert.match(playbook, new RegExp(`### ${stage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }

  for (const condition of [
    "Objective is clear.",
    "Scope is defined.",
    "Acceptance criteria exist.",
    "Architecture is approved.",
    "Risks are documented.",
    "Required modes are attached to participating seats.",
    "Validation plan exists.",
    "Pull request target is known.",
  ]) {
    assert.match(playbook, new RegExp(condition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(playbook, /Only after every Definition of Ready condition is satisfied may Melinda May\s+begin implementation/);
  assert.match(playbook, /Implementation or test failures return to Melinda May/);
  assert.match(playbook, /Missing evidence returns to Daisy Johnson/);
  assert.match(playbook, /Architecture concerns return to Nick Fury/);
  assert.match(playbook, /gives brief, high-leverage guidance/);
  assert.match(playbook, /implementation still matches the approved plan/);
  assert.match(playbook, /Delivery Mode begins with `\.\/begin-mission\.md`/);
  assert.match(playbook, /requires explicit\s+Phil Coulson approval/);
  assert.match(playbook, /cannot activate through the lightweight operational\s+timeout path/);
  assert.match(playbook, /Delivery Mode is never eligible for the lightweight\s+operational timeout path/);
  assert.match(playbook, /produces the draft Mission Brief/);
  assert.match(playbook, /records recommended participants and modes in the Mission Brief/);
  assert.match(playbook, /creates or updates a draft pull\s+request.*so Leo Fitz has a review surface/s);
  assert.match(playbook, /Fury implementation sanity-review status/);
  assert.match(playbook, /Scope or acceptance ambiguity returns to Phil Coulson/);
  assert.match(playbook, /Maria Hill handles GitHub coordination/);
});

test("begin mission playbook is present for delivery mode intake", async () => {
  const playbook = await readRepoFile("playbooks/begin-mission.md");
  const template = await readRepoFile("playbooks/repo-context/mission-brief-template.md");

  assert.match(playbook, /# Begin Mission/);
  assert.match(playbook, /Mission Brief is the canonical intake artifact/);
  assert.match(playbook, /all non-lightweight work require Phil Coulson's\s+explicit approval/);
  assert.match(playbook, /does not authorize specialist dispatch/);
  assert.match(template, /# Mission Brief Template/);
  assert.match(template, /## Activation Status/);
});

test("delivery mode is registered for planned engineering work", async () => {
  const index = await readRepoFile("modes/mission-modes.md");
  const charter = await readRepoFile("agents/shield-team-charter.agent.md");
  const hill = await readRepoFile("agents/maria-hill-orchestrator.agent.md");
  const readme = await readRepoFile("README.md");

  assert.match(index, /2\. \*\*Delivery Mode\*\*/);
  assert.match(index, /planned engineering work with a known desired\s+outcome, load \*\*Delivery Mode\*\*/);
  assert.match(charter, /\*\*Delivery Mode\*\* — `\.\.\/modes\/delivery-mode\.md`/);
  assert.match(hill, /Delivery Mode for planned engineering work with a known outcome/);
  assert.match(readme, /\*\*Delivery Mode\*\* handles planned engineering work/);
});
