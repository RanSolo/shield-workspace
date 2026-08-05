import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("charter encodes seat boundaries plus Hill-controlled specialist iteration", async () => {
  const charter = await readRepoFile("agents/shield-team-charter.agent.md");

  assert.match(charter, /Maria Hill never owns production code changes\./);
  assert.match(
    charter,
    /Daisy Johnson may make limited mechanical or reconnaissance edits only when the mission explicitly calls for them/,
  );
  assert.match(charter, /Melinda May owns all production implementation/);
  assert.match(charter, /Nick Fury owns technical judgment, plan shaping, and brief mentoring review passes/);
  assert.match(charter, /## Specialist iteration protocol/);
  assert.match(charter, /return the artifact to the same owner/);
  assert.match(charter, /A stall is held for evidence or\s+rerouted/);
});

test("seat prompts preserve the approved implementation boundaries", async () => {
  const hill = await readRepoFile("agents/maria-hill-orchestrator.agent.md");
  const daisy = await readRepoFile("agents/daisy-johnson-debugger-recon.agent.md");
  const may = await readRepoFile("agents/melinda-may-implementer.agent.md");
  const fury = await readRepoFile("agents/nick-fury-architect.agent.md");
  const mack = await readRepoFile("agents/alphonso-mack-validation.agent.md");

  assert.match(hill, /Never own production code changes\./);
  assert.match(
    daisy,
    /Do not edit files unless the Mission Brief or Maria Hill explicitly approves limited mechanical or reconnaissance edits\./,
  );
  assert.match(daisy, /Do not take over production implementation from Melinda May\./);
  assert.match(fury, /Strategic technical mentor/);
  assert.match(fury, /default move is to improve it first when the path is recoverable/);
  assert.match(may, /Own all production implementation\./);
  assert.match(may, /## Stuck protocol/);
  assert.match(mack, /Independent validation specialist/);
  assert.match(mack, /You do not implement production behavior/);
  assert.match(mack, /exact repository and implementation HEAD/);
  assert.match(mack, /emit only the closed\s+analysis candidate/i);
  assert.match(mack, /Do not emit a\s+`mack\.validation\.v0` report/i);
  assert.match(mack, /host derives all bindings/i);
  assert.match(mack, /receive no repository or\s+process tools/i);
});

test("governed local Mack documentation preserves the narrow exact-revision boundary", async () => {
  const rootAgents = await readRepoFile("../../AGENTS.md");
  const readme = await readRepoFile("scripts/model/README.md");
  const mack = await readRepoFile("agents/alphonso-mack-validation.agent.md");

  for (const document of [rootAgents, readme, mack]) {
    assert.match(document, /governed[\s\S]{0,80}(?:local[\s-])?(?:validation )?runner/i);
    assert.match(document, /exact-revision/i);
    assert.match(document, /local model[\s\S]{0,100}(?:never|not)[\s\S]{0,60}(?:authority|source of authority)/i);
  }
  assert.match(readme, /host constructs the unchanged `mack\.validation\.v0`/i);
  assert.match(readme, /Dependency-injected\s+test evidence[\s\S]{0,80}always labeled synthetic\s+and ineligible/i);
  assert.match(readme, /model satisfaction alone can never establish it/i);
  assert.match(readme, /external replay registry uses request-scoped atomic locks/i);
  assert.match(readme, /Only the non-injected production runner can promote eligibility/i);
  assert.match(readme, /does not enable generic Mack V0\.3 dispatch/i);
  assert.match(readme, /`ask-local mack` remains an ungoverned text helper/i);
});

test("May profiles preserve blueprint boundaries across local and hosted runtimes", async () => {
  const hostedMay = await readRepoFile("../../.codex/agents/may.toml");
  const localMay = await readRepoFile("agents/melinda-may-implementer.agent.md");
  const charter = await readRepoFile("agents/shield-team-charter.agent.md");

  for (const mayProfile of [hostedMay, localMay]) {
    assert.match(
      mayProfile,
      /author(?:s)? or correct(?: only)? (?:a |the )?(?:May-owned )?non-authoritative\s+(?:implementation\s+)?blueprint/i,
    );
    assert.match(mayProfile, /Fury technical review/i);
    assert.match(mayProfile, /exact-revision plan\s+gate/i);
  }

  assert.match(localMay, /Blueprint output is advisory and never implementation authority\./);
  assert.match(localMay, /Own all production implementation\./);
  assert.match(
    localMay,
    /implement\s+only [\s\S]* after actual Coulson Wheels Up and the eligible\s+exact-revision plan gate/i,
  );
  assert.match(
    hostedMay,
    /hosted or local runtime does\s+not alter these duties/i,
  );
  assert.match(
    hostedMay,
    /implement the exact[\s\S]* after the existing Coulson Wheels Up and exact-revision plan\s+gate[\s\S]* are satisfied/i,
  );
  assert.match(hostedMay, /model = "gpt-5\.3-codex-spark"/);
  assert.match(localMay, /model: Claude Sonnet 4\.5 \(copilot\)/);

  assert.match(
    charter,
    /Melinda May owns all production implementation and the non-authoritative implementation blueprint/,
  );
  assert.match(
    charter,
    /may produce production effects only after actual Coulson Wheels Up and the eligible exact-revision Fury plan gate/i,
  );
  assert.match(
    charter,
    /must not treat Fury technical review as implementation authority/,
  );
});

test("debugger mode applies evidence-based iteration across specialist seats", async () => {
  const debuggerMode = await readRepoFile("modes/debugger-mode.md");

  assert.match(debuggerMode, /## Evidence-based iteration/);
  assert.match(debuggerMode, /Daisy, May, or Fury handoff/);
  assert.match(debuggerMode, /fixed\s+repair count never determines the route/);
});
