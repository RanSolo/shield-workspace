import assert from "node:assert/strict";
import test from "node:test";

import {
  compileGuidedReviewRouteV1,
  createGuidedReviewRouteOverlayV1,
  validateGuidedReviewCompiledRouteV1,
  validateGuidedReviewRouteOverlayV1,
} from "../dist/guided-review-route-overlay-v1.mjs";
import { BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1 } from "../dist/guided-review-playbooks-v1.mjs";

const head = "dad840cc2f6ff1a6bf66d85fb9f5bbac0102ed05";
const backend = BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1.find((entry) => entry.kind === "backend");
assert.ok(backend);

function overlayInput(overrides = {}) {
  return {
    schemaVersion: 1,
    contractVersion: "guided.review.route-overlay.v1",
    overlayId: "overlay:issue-238:backend",
    missionId: "mission:issue-238",
    subjectId: "issue:238",
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/guided-review-238",
    exactRevision: head,
    protectedGraphId: "protected-graph:mission:issue-238",
    protectedGraphDigest: "sha256:PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP",
    templateId: backend.templateId,
    templateVersion: backend.templateVersion,
    templateDigest: backend.templateDigest,
    kind: backend.kind,
    rationale: "Focus the pinned backend route on the exact candidate's unusual authorization boundary.",
    risks: ["Authorization behavior could drift.", "A regression could bypass the intended boundary."],
    acceptanceCriterionMappings: [
      { criterionId: "AC-2", stepIds: ["tests"] },
      { criterionId: "AC-1", stepIds: ["responsible-code", "authorization-boundary"] },
    ],
    inspectionPoints: [{
      inspectionPointId: "inspection:authorization",
      targetStepId: "authorization-boundary",
      title: "Inspect the exact authorization decision",
      instructions: ["Trace the bounded decision without expanding into a full diff."],
      relevantPaths: ["packages/shield-team-system/src/guided-review-route-overlay-v1.mts"],
      evidenceRefs: ["evidence:test:authorization"],
    }],
    overrides: [
      {
        operation: "add_after",
        afterStepId: "effects",
        stageId: "implementation-pass",
        stepId: "authorization-boundary",
        title: "Authorization boundary",
        question: "Does the exact authorization boundary preserve the protected behavior?",
        instructions: ["Inspect the mission-specific decision point."],
        dependsOnStepIds: ["effects"],
        rationale: "This candidate changes an unusual authorization seam.",
      },
      {
        operation: "tighten",
        targetStepId: "tests",
        additionalInstructions: ["Inspect the focused denial-path assertion."],
        additionalRelevantPaths: ["packages/shield-team-system/tests/guided-review-route-overlay-v1.test.mjs"],
        additionalEvidenceRefs: ["evidence:test:route-overlay"],
        rationale: "The generic test step needs one exact-candidate focus.",
      },
      { operation: "remove", targetStepId: "maintainability", rationale: "No unusual maintainability concern exists in this bounded correction." },
    ],
    furySeatId: "fury",
    furyBindingRef: "binding:fury:issue-238",
    furyReasoningRuntimeId: "runtime:fury:test",
    furyModelId: "model:test",
    furyToolExecutorId: "executor:fury:test",
    identityAuthority: "claimed_only",
    ...overrides,
  };
}

function overlay(overrides = {}) {
  const result = createGuidedReviewRouteOverlayV1(overlayInput(overrides));
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}

test("the built-in template registry is version-pinned, content-addressed, and frozen", () => {
  assert.deepEqual(BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1.map(({ templateId, templateVersion, kind }) => ({ templateId, templateVersion, kind })), [
    { templateId: "guided-review:backend:v1", templateVersion: "1", kind: "backend" },
    { templateId: "guided-review:frontend:v1", templateVersion: "1", kind: "frontend" },
    { templateId: "guided-review:spike:v1", templateVersion: "1", kind: "spike" },
  ]);
  assert.match(backend.templateDigest, /^sha256:[A-Za-z0-9_-]{43}$/u);
  assert.match(backend.routeGraphDigest, /^sha256:[A-Za-z0-9_-]{43}$/u);
  assert.ok(Object.isFrozen(BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1));
  assert.ok(Object.isFrozen(backend.stages[0].steps[0]));
});

test("closed overlay validation rejects hostile shape, digest mutation, and template substitution", () => {
  const value = overlay();
  assert.equal(validateGuidedReviewRouteOverlayV1(value).state, "ready");
  assert.equal(createGuidedReviewRouteOverlayV1({ ...overlayInput(), unexpectedModelSeam: "model:any" }).state, "invalid");
  assert.equal(validateGuidedReviewRouteOverlayV1({ ...value, rationale: "Substituted after digest." }).state, "invalid");
  const frontend = BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1.find((entry) => entry.kind === "frontend");
  assert.equal(createGuidedReviewRouteOverlayV1({ ...overlayInput(), templateDigest: frontend.templateDigest }).state, "invalid");
  assert.equal(createGuidedReviewRouteOverlayV1({ ...overlayInput(), protectedGraphId: "not valid whitespace" }).state, "invalid");
  const alternateMissionGraph = createGuidedReviewRouteOverlayV1({
    ...overlayInput(),
    protectedGraphId: "protected-graph:mission:alternate",
    protectedGraphDigest: "sha256:QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  });
  assert.equal(alternateMissionGraph.state, "ready");
  assert.equal(alternateMissionGraph.value.templateDigest, value.templateDigest);
  assert.notEqual(alternateMissionGraph.value.overlayDigest, value.overlayDigest);
  const compiled = compileGuidedReviewRouteV1(value);
  assert.equal(compiled.state, "ready");
  assert.equal(validateGuidedReviewCompiledRouteV1({ ...compiled.value, overlay: { ...compiled.value.overlay, overlayId: "overlay:substituted" } }).state, "invalid");
  assert.equal(validateGuidedReviewCompiledRouteV1({
    ...compiled.value,
    stages: compiled.value.stages.map((stage, index) => index === 0 ? { ...stage, title: "Substituted compiled stage" } : stage),
  }).state, "invalid");
});

test("the compiler applies sorted remove, tighten, and add phases with byte-stable output", () => {
  const first = overlay();
  const reordered = overlay({
    risks: [...overlayInput().risks].reverse(),
    acceptanceCriterionMappings: [...overlayInput().acceptanceCriterionMappings].reverse().map((entry) => ({ ...entry, stepIds: [...entry.stepIds].reverse() })),
    overrides: [...overlayInput().overrides].reverse(),
  });
  assert.deepEqual(reordered, first);
  const compiled = compileGuidedReviewRouteV1(first);
  const repeated = compileGuidedReviewRouteV1(reordered);
  assert.equal(compiled.state, "ready", JSON.stringify(compiled));
  assert.equal(repeated.state, "ready", JSON.stringify(repeated));
  assert.deepEqual(repeated.value, compiled.value);
  assert.equal(repeated.value.compiledRouteDigest, compiled.value.compiledRouteDigest);
  assert.ok(Object.isFrozen(compiled.value));
  const implementation = compiled.value.stages.find((stage) => stage.stageId === "implementation-pass");
  assert.deepEqual(implementation.steps.map((step) => step.stepId), ["responsible-code", "effects", "authorization-boundary"]);
  const tests = compiled.value.stages.flatMap((stage) => stage.steps).find((step) => step.stepId === "tests");
  assert.deepEqual(tests.dependsOnStepIds, ["effects"]);
  assert.match(tests.instructions.at(-1), /denial-path/u);
  const added = implementation.steps.at(-1);
  assert.deepEqual(added.criterionRefs, ["AC-1"]);
  assert.match(added.instructions.at(-2), /inspection:authorization/u);
  assert.deepEqual(added.evidenceRefs, ["evidence:test:authorization"]);
  assert.match(added.instructions.at(-1), /bounded decision/u);
  assert.deepEqual(added.relevantPaths, ["packages/shield-team-system/src/guided-review-route-overlay-v1.mts"]);
  assert.deepEqual(added.evidenceRefs, ["evidence:test:authorization"]);
});

test("core removal, unknown targets, duplicates, and rewrite-shaped tighten operations fail closed", () => {
  const core = overlay({ overrides: [{ operation: "remove", targetStepId: "intent", rationale: "Hostile core removal." }] });
  assert.equal(compileGuidedReviewRouteV1(core).code, "CORE_STEP_REMOVAL");
  for (const targetStepId of ["green", "limitations", "exact-candidate"]) {
    const protectedBoundary = overlay({ overrides: [{ operation: "remove", targetStepId, rationale: "Hostile protected-boundary removal." }] });
    assert.equal(compileGuidedReviewRouteV1(protectedBoundary).code, "CORE_STEP_REMOVAL");
  }
  const unknown = overlay({ overrides: [{ operation: "remove", targetStepId: "not-a-template-step", rationale: "Unknown target." }] });
  assert.equal(compileGuidedReviewRouteV1(unknown).code, "UNKNOWN_OVERRIDE_TARGET");
  assert.equal(createGuidedReviewRouteOverlayV1(overlayInput({ overrides: [
    { operation: "remove", targetStepId: "maintainability", rationale: "First mutation." },
    { operation: "tighten", targetStepId: "maintainability", additionalInstructions: ["Second mutation."], additionalRelevantPaths: [], additionalEvidenceRefs: [], rationale: "Duplicate target." },
  ] })).state, "invalid");
  assert.equal(createGuidedReviewRouteOverlayV1(overlayInput({ overrides: [{
    operation: "tighten", targetStepId: "tests", question: "Rewrite the template question?", additionalInstructions: ["No."],
    additionalRelevantPaths: [], additionalEvidenceRefs: [], rationale: "Attempt a forbidden rewrite.",
  }] })).state, "invalid");
});

test("dependency and acceptance-criterion loss are rejected after overlay expansion", () => {
  const dangling = overlay({ overrides: [{
    operation: "add_after", afterStepId: "effects", stageId: "implementation-pass", stepId: "dangling-step", title: "Dangling",
    question: "Is this dependency valid?", instructions: ["Check it."], dependsOnStepIds: ["missing-step"], rationale: "Adversarial dependency.",
  }] });
  assert.equal(compileGuidedReviewRouteV1(dangling).code, "DANGLING_DEPENDENCY");
  const forward = overlay({ overrides: [{
    operation: "add_after", afterStepId: "effects", stageId: "implementation-pass", stepId: "forward-step", title: "Forward",
    question: "Is this dependency ordered?", instructions: ["Check it."], dependsOnStepIds: ["tests"], rationale: "Adversarial ordering.",
  }] });
  assert.equal(compileGuidedReviewRouteV1(forward).code, "FORWARD_OR_CYCLIC_DEPENDENCY");
  const cycle = overlay({ overrides: [{
    operation: "add_after", afterStepId: "effects", stageId: "implementation-pass", stepId: "cyclic-step", title: "Cycle",
    question: "Is this dependency acyclic?", instructions: ["Check it."], dependsOnStepIds: ["cyclic-step"], rationale: "Adversarial self-cycle.",
  }] });
  assert.equal(compileGuidedReviewRouteV1(cycle).code, "FORWARD_OR_CYCLIC_DEPENDENCY");
  const acLoss = overlay({
    acceptanceCriterionMappings: [{ criterionId: "AC-1", stepIds: ["maintainability"] }],
    inspectionPoints: [],
    overrides: [{ operation: "remove", targetStepId: "maintainability", rationale: "Remove the only AC target." }],
  });
  assert.equal(compileGuidedReviewRouteV1(acLoss).code, "UNCOVERED_ACCEPTANCE_CRITERION");
});

test("formal playbook creation rejects acceptance criteria omitted from Fury's route mapping", async () => {
  const { createFormalGuidedReviewPlaybookV1 } = await import("../dist/guided-review-route-overlay-v1.mjs");
  const compiled = compileGuidedReviewRouteV1(overlay());
  assert.equal(compiled.state, "ready", JSON.stringify(compiled));
  const result = createFormalGuidedReviewPlaybookV1(compiled.value, {
    missionId: "mission:issue-238",
    subjectId: "issue:238",
    repositoryId: "RanSolo/shield-workspace",
    branch: "agent/guided-review-238",
    exactRevision: head,
    title: "Formal backend review",
    participantRelationship: "independent_reviewer",
    acceptanceCriteria: [
      { criterionId: "AC-1", statement: "First criterion." },
      { criterionId: "AC-2", statement: "Second criterion." },
      { criterionId: "AC-3", statement: "Unmapped criterion." },
    ],
    relevantPaths: [],
    evidenceRefs: [],
    plan: { kind: "backend" },
    runtimeHandoff: {},
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "COMPILED_ROUTE_CRITERIA_MISMATCH");
});
