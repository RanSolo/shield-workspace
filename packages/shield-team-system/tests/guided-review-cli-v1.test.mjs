import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createGuidedReviewDriverReceiptV1 } from "../dist/guided-review-driver-v1.mjs";
import { createGuidedReviewRuntimeHandoffV1 } from "../dist/guided-review-v1.mjs";

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
  const planInput = {
    schemaVersion: 1,
    contractVersion: "guided.review.v1",
    planId: "plan:issue-238",
    missionId: "mission:issue-238",
    subjectId: "issue:238",
    kind: "spike",
    required: true,
    rationale: "The publication recommendation requires human document review.",
    method: "document_review",
    participantRelationship: "document_reviewer",
    coveredCriterionRefs: ["AC-1"],
    evidenceRequirements: ["Named observation for every question."],
    exactRevision: head,
    gateOwnerSeatId: "coulson",
  };
  await writeFile(join(root, "plan-input.json"), `${JSON.stringify(planInput, null, 2)}\n`);
  run(root, ["plan", "create", "--input", "plan-input.json", "--output", "plan.json"]);
  const plan = JSON.parse(await readFile(join(root, "plan.json"), "utf8"));
  const driver = createGuidedReviewDriverReceiptV1({
    schemaVersion: 1,
    contractVersion: "guided.review.driver.v1",
    driverId: "driver:code-guided",
    driverVersion: "v1",
    executorRef: "executor:test",
    exactRevision: head,
    environmentRef: "environment:test",
    status: "ready",
    capabilities: ["artifact_focus"],
    scenarioRefs: ["scenario:spike"],
    evidenceRefs: ["evidence:guided-review:test"],
    effectClass: "read_only",
    detail: "CLI fixture driver.",
  });
  assert.equal(driver.state, "ready");
  const context = {
    missionId: "mission:issue-238",
    subjectId: "issue:238",
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/guided-review-238",
    exactRevision: head,
    plan,
    title: "Issue 238 Guided Review",
    participantRelationship: "document_reviewer",
    acceptanceCriteria: [{ criterionId: "AC-1", text: "Questions form durable stages." }],
    runtimeHandoff: createGuidedReviewRuntimeHandoffV1({
      status: "ready",
      repositoryId: "RanSolo/shield-workspace",
      canonicalWorktreeRef: "worktree:guided-review-cli",
      branch: "agent/guided-review-238",
      exactRevision: head,
      builderSeatId: "may",
      builderBindingRef: "binding:may:guided-review-cli",
      reasoningRuntimeId: "runtime:may:guided-review-cli",
      toolExecutorId: "executor:test",
      dependencyBuildReceiptRef: "receipt:build:test",
      environmentRef: "environment:test",
      fixtureRef: "fixture:guided-review-cli",
      resourceBindingsRef: "bindings:guided-review-cli:redacted",
      endpointOwnershipRef: "ownership:guided-review-cli",
      portPreflightRef: "preflight:port:guided-review-cli",
      watcherPreflightRef: "preflight:watcher:guided-review-cli",
      externalEffectPolicyRef: "policy:none",
      launchCommandRef: "command:start",
      healthProbeRef: "probe:ready",
      reviewUrl: "http://127.0.0.1:5173/",
      teardownRef: "command:stop",
      recoveryRef: "recovery:guided-review-cli",
      driverReceipt: driver.value,
    }).value,
    relevantPaths: ["packages/shield-team-system/src/guided-review-v1.mts"],
    evidenceRefs: ["evidence:guided-review:test"],
  };
  await writeFile(join(root, "participant.json"), `${JSON.stringify({ participantId: "human:cli-reviewer", relationship: "document_reviewer", seatId: "coulson", bindingRef: "binding:cli-reviewer" }, null, 2)}\n`);
  await writeFile(join(root, "context.json"), `${JSON.stringify(context, null, 2)}\n`);
  run(root, ["playbook", "create", "--kind", "spike", "--input", "context.json", "--output", "playbook.json"]);
  return root;
}

test("CLI creates a playbook and starts with one current question", async () => {
  const root = await fixture();
  const started = run(root, ["start", "--playbook", "playbook.json", "--profile", "publication", "--session-id", "session:cli", "--participant", "participant.json", "--output", "session.json"]);
  const display = JSON.parse(started.stdout);
  assert.equal(display.stage.stageId, "placement-purpose");
  assert.equal(display.stage.checkpointId, "checkpoint:placement-purpose");
  assert.equal(display.step.stepId, "placement");
  assert.equal(typeof display.step.question, "string");
  assert.equal(display.completedSteps, 0);
});

test("CLI atomically persists a decision and advances within the same stage", async () => {
  const root = await fixture();
  run(root, ["start", "--playbook", "playbook.json", "--profile", "publication", "--session-id", "session:cli", "--participant", "participant.json", "--output", "session.json"]);
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
  const duplicate = run(root, ["playbook", "create", "--kind", "spike", "--input", "context.json", "--output", "playbook.json"], 1);
  assert.match(duplicate.stderr, /Refusing to overwrite/u);
  const requiredSkip = run(root, ["publication-choice", "--choice", "no", "--exact-revision", head, "--plan", "plan.json", "--output", "required-skip.json"], 1);
  assert.equal(JSON.parse(requiredSkip.stdout).reasonCode, "GUIDED_REVIEW_REQUIRED");
  const optionalInput = JSON.parse(await readFile(join(root, "plan-input.json"), "utf8"));
  optionalInput.required = false;
  optionalInput.planId = "plan:issue-238:optional";
  optionalInput.rationale = "Automated evidence is sufficient for this candidate.";
  optionalInput.coveredCriterionRefs = [];
  optionalInput.evidenceRequirements = [];
  await writeFile(join(root, "optional-plan-input.json"), `${JSON.stringify(optionalInput, null, 2)}\n`);
  run(root, ["plan", "create", "--input", "optional-plan-input.json", "--output", "optional-plan.json"]);
  const skipped = run(root, ["publication-choice", "--choice", "no", "--exact-revision", head, "--plan", "optional-plan.json", "--output", "skip.json"]);
  const skip = JSON.parse(skipped.stdout);
  assert.equal(skip.authority, "none");
  assert.equal(skip.pinPurpose, "publication");
  const cancelled = run(root, ["publication-choice", "--choice", "cancel", "--exact-revision", head, "--plan", "plan.json", "--output", "cancel.json"]);
  assert.equal(JSON.parse(cancelled.stdout).state, "cancelled");
});

test("CLI rejects a symlinked output parent", async () => {
  const root = await fixture();
  await mkdir(join(root, "real-output"));
  await symlink(join(root, "real-output"), join(root, "linked-output"));
  const result = run(root, ["start", "--playbook", "playbook.json", "--profile", "publication", "--session-id", "session:unsafe", "--participant", "participant.json", "--output", "linked-output/session.json"], 2);
  assert.match(result.stderr, /Output parent must be a real directory/u);
  await assert.rejects(readFile(join(root, "real-output", "session.json")));
});
