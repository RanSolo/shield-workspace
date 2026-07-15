import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("backlog refinement playbook stays planning-only", async () => {
  const playbook = await readRepoFile("playbooks/backlog-refinement.md");

  assert.match(playbook, /# Backlog Refinement/);
  assert.match(playbook, /This playbook does not implement work\./);
  assert.match(playbook, /This playbook does not modify GitHub issues by itself\./);
  assert.match(playbook, /Produce a backlog refinement report without mutating GitHub\./);
  assert.match(playbook, /That follow-up work should be handled as a separate mutation mission\./);
});

test("backlog refinement assigns Hill, Fury, and Coulson responsibilities", async () => {
  const hill = await readRepoFile("agents/maria-hill-orchestrator.agent.md");
  const fury = await readRepoFile("agents/nick-fury-architect.agent.md");
  const coulson = await readRepoFile("agents/phil-coulson-human-player-1.agent.md");

  assert.match(hill, /Backlog refinement: follow `\.\.\/playbooks\/backlog-refinement\.md`/);
  assert.match(hill, /Organize newly created backlog items into a recommended roadmap/);
  assert.match(fury, /review roadmap sequencing when backlog organization is on the table/);
  assert.match(fury, /When given a backlog refinement report:/);
  assert.match(coulson, /Approve or reject backlog refinement reports before any follow-up issue mutation mission begins\./);
});
