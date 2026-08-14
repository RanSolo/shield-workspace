import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "dist/cli.mjs");
const head = "1234567890abcdef1234567890abcdef12345678";

function run(root, args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [cli, "guided-review", ...args, "--root", root, "--json"], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
  return result;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shield-guided-review-"));
  const context = {
    missionId: "mission:issue-238",
    subjectId: "issue:238",
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/guided-review-238",
    exactRevision: head,
    title: "Issue 238 Guided Review",
    acceptanceCriteria: [{ criterionId: "AC-1", text: "Questions form durable stages." }],
    runtimeHandoff: {
      status: "ready",
      receiptDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      exactRevision: head,
      environmentRef: "environment:test",
      launchCommandRef: "command:start",
      healthProbeRef: "probe:ready",
      reviewUrl: "http://127.0.0.1:5173/",
      teardownRef: "command:stop",
      externalEffectPolicyRef: "policy:none",
    },
    relevantPaths: ["packages/shield-team-system/src/guided-review-v1.mts"],
    evidenceRefs: ["evidence:guided-review:test"],
  };
  await writeFile(join(root, "context.json"), `${JSON.stringify(context, null, 2)}\n`);
  run(root, ["playbook", "create", "--kind", "document", "--input", "context.json", "--output", "playbook.json"]);
  return root;
}

test("CLI creates a playbook and starts with one current question", async () => {
  const root = await fixture();
  const started = run(root, ["start", "--playbook", "playbook.json", "--profile", "publication", "--session-id", "session:cli", "--output", "session.json"]);
  const display = JSON.parse(started.stdout);
  assert.equal(display.stage.stageId, "placement-purpose");
  assert.equal(display.stage.checkpointId, "checkpoint:placement-purpose");
  assert.equal(display.step.stepId, "placement");
  assert.equal(typeof display.step.question, "string");
  assert.equal(display.completedSteps, 0);
});

test("CLI atomically persists a decision and advances within the same stage", async () => {
  const root = await fixture();
  run(root, ["start", "--playbook", "playbook.json", "--profile", "publication", "--session-id", "session:cli", "--output", "session.json"]);
  const decided = run(root, ["decide", "--playbook", "playbook.json", "--session", "session.json", "--decision-id", "decision:1", "--disposition", "pass", "--observation", "The page is beside its source material."]);
  const display = JSON.parse(decided.stdout);
  assert.equal(display.stage.stageId, "placement-purpose");
  assert.equal(display.step.stepId, "purpose");
  const session = JSON.parse(await readFile(join(root, "session.json"), "utf8"));
  assert.equal(session.decisions.length, 1);
  assert.equal(session.stepStates.placement, "passed");
  assert.equal(session.stageStates["placement-purpose"], "active");
});

test("CLI refuses output overwrite and emits non-authoritative skip/cancel fork evidence", async () => {
  const root = await fixture();
  const duplicate = run(root, ["playbook", "create", "--kind", "document", "--input", "context.json", "--output", "playbook.json"], 1);
  assert.match(duplicate.stderr, /Refusing to overwrite/u);
  const skipped = run(root, ["publication-choice", "--choice", "no", "--exact-revision", head, "--output", "skip.json"]);
  const skip = JSON.parse(skipped.stdout);
  assert.equal(skip.authority, "none");
  assert.equal(skip.pinPurpose, "publication");
  const cancelled = run(root, ["publication-choice", "--choice", "cancel", "--exact-revision", head, "--output", "cancel.json"]);
  assert.equal(JSON.parse(cancelled.stdout).state, "cancelled");
});

test("CLI rejects a symlinked output parent", async () => {
  const root = await fixture();
  await mkdir(join(root, "real-output"));
  await symlink(join(root, "real-output"), join(root, "linked-output"));
  const result = run(root, ["start", "--playbook", "playbook.json", "--profile", "publication", "--session-id", "session:unsafe", "--output", "linked-output/session.json"], 2);
  assert.match(result.stderr, /Output parent must be a real directory/u);
  await assert.rejects(readFile(join(root, "real-output", "session.json")));
});
