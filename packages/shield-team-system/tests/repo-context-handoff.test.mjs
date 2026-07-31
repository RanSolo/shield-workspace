import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("repo context discovery defines the small-packet rubric for every specialist seat", async () => {
  const playbook = await readRepoFile("playbooks/repo-context-discovery.md");

  assert.match(playbook, /## Small-Packet Specialist Rubric/);
  assert.match(playbook, /applies to local and hosted specialist runs/i);
  assert.match(playbook, /workflow\s+guidance for packet assembly and handoff quality/i);
  assert.match(playbook, /not dispatch\s+permission, tool authorization, implementation authority, or a human gate/i);
  assert.match(playbook, /common control envelope is mandatory and does not count as payload/i);
  assert.match(playbook, /Maria Hill:\*\* one assembled context-pack artifact/i);
  assert.match(playbook, /Daisy Johnson:\*\* one primary evidence target/i);
  assert.match(playbook, /Nick Fury:\*\* one exact plan or implementation-review artifact/i);
  assert.match(playbook, /Melinda May:\*\* one approved implementation slice/i);
  assert.match(playbook, /Alphonso Mackenzie:\*\* one validation lane bound to the exact implementation\s+HEAD/i);
  assert.match(playbook, /Expansion beyond one primary artifact requires a stated reason/i);
  assert.match(playbook, /Keep work within one seat when:/);
  assert.match(playbook, /Split or reroute to another seat when:/);
  assert.match(playbook, /packet breadth can be narrowed or split into sequential packets without\s+changing seat ownership/i);
  assert.match(playbook, /accountable\s+owner, work category, authority surface, or human gate changed/i);
  assert.match(playbook, /Mission Brief[\s\S]*current\s+objective[\s\S]*exact allowed files[\s\S]*output contract[\s\S]*delta-only carry-forward/i);
  assert.match(playbook, /discard the\s+malformed delta/i);
  assert.match(playbook, /retain the last accepted artifact/i);
  assert.match(playbook, /narrow the packet/i);
  assert.match(playbook, /return the narrowed packet to the same owner/i);
  assert.match(playbook, /Hill reroutes only\s+when the work category changes/i);
  assert.match(playbook, /## Specialist Packet Stop-and-Narrow/);
  assert.match(playbook, /packet expands beyond one primary artifact without a stated reason/i);
  assert.match(playbook, /allowed files exceed the smallest objective-bound slice/i);
  assert.match(playbook, /duplicates Mission Brief, prior artifact, or evidence bodies/i);
  assert.match(playbook, /carry-forward base is absent, stale, or mismatched/i);
  assert.match(playbook, /response leaks scratchpad or chain-of-thought/i);
  assert.match(playbook, /response invents capabilities or authority/i);
  assert.match(playbook, /response shape does not match the requested output contract/i);
  assert.match(playbook, /Escalate only when the packet exposes material ambiguity, risk,\s+authority changes, or a required human gate/i);
  assert.match(playbook, /"reasoning leakage" means scratchpad, chain-of-thought/i);
});

test("seat handoff template requires revision lineage, runtime identity, and delta-only carry-forward", async () => {
  const template = await readRepoFile("playbooks/repo-context/seat-handoff-template.md");

  assert.match(template, /## Control Envelope/);
  assert.match(template, /Mission Brief reference:/);
  assert.match(template, /Mission Brief revision:/);
  assert.match(template, /Repository:/);
  assert.match(template, /Exact source or implementation revision:/);
  assert.match(template, /Assigned seat:/);
  assert.match(template, /Current objective:/);
  assert.match(template, /Actual reasoning runtime \/ model:/);
  assert.match(template, /Tool-executor identity \(if tools are used\):/);
  assert.match(template, /## Allowed Payload/);
  assert.match(template, /Primary artifact:/);
  assert.match(template, /Exact allowed files \(read or write mode\):/);
  assert.match(template, /Output contract:/);
  assert.match(template, /Prior accepted artifact:/);
  assert.match(template, /Prior accepted artifact revision:/);
  assert.match(template, /Delta-only carry-forward against that base:/);
  assert.match(template, /Reject carry-forward if the base is absent, stale, or mismatched/i);
  assert.match(template, /Allowed files do not themselves grant write permission/i);
});

test("technical design distinguishes rubric coverage from missing enforcement", async () => {
  const design = await readRepoFile("TECHNICAL_DESIGN.md");

  assert.match(design, /packet sizing, packet lineage, and stop-trigger detection are not yet\s+machine-enforced/i);
  assert.match(design, /persisted as a specialist-packet contract/i);
  assert.match(design, /Extend the existing runner with a versioned specialist-packet contract/i);
  assert.match(design, /preserving\s+evidence-bound,\s+non-numeric\s+specialist iteration/i);
  assert.doesNotMatch(design, /at most\s+three repair cycles before human escalation/i);
});
