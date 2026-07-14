import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("charter encodes Hill, Daisy, and May boundaries plus stuck protocol", async () => {
  const charter = await readRepoFile("agents/shield-team-charter.agent.md");

  assert.match(charter, /Maria Hill never owns production code changes\./);
  assert.match(
    charter,
    /Daisy Johnson may make limited mechanical or reconnaissance edits only when the mission explicitly calls for them/,
  );
  assert.match(charter, /Melinda May owns all production implementation/);
  assert.match(charter, /Nick Fury owns technical judgment, plan shaping, and brief mentoring review passes/);
  assert.match(charter, /## Stuck protocol/);
  assert.match(charter, /Melinda May reports blocked\./);
  assert.match(charter, /Maria Hill requests additional reconnaissance from Daisy Johnson\./);
});

test("seat prompts preserve the approved implementation boundaries", async () => {
  const hill = await readRepoFile("agents/maria-hill-orchestrator.agent.md");
  const daisy = await readRepoFile("agents/daisy-johnson-debugger-recon.agent.md");
  const may = await readRepoFile("agents/melinda-may-implementer.agent.md");
  const fury = await readRepoFile("agents/nick-fury-architect.agent.md");

  assert.match(hill, /Never own production code changes\./);
  assert.match(
    daisy,
    /Do not edit files unless the mission explicitly asks for limited mechanical or reconnaissance edits\./,
  );
  assert.match(daisy, /Do not take over production implementation from Melinda May\./);
  assert.match(fury, /Strategic technical mentor/);
  assert.match(fury, /default move is to improve it first when the path is recoverable/);
  assert.match(may, /Own all production implementation\./);
  assert.match(may, /## Stuck protocol/);
});

test("debugger mode documents the stuck protocol", async () => {
  const debuggerMode = await readRepoFile("modes/debugger-mode.md");

  assert.match(debuggerMode, /## Stuck protocol/);
  assert.match(debuggerMode, /Melinda May reports blocked\./);
  assert.match(debuggerMode, /Maria Hill requests additional reconnaissance from Daisy Johnson\./);
  assert.match(debuggerMode, /Maria Hill consults Nick Fury if architecture is involved\./);
});
