import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  computeMackLocalValidationRequestDigestV1,
  createMackLocalValidationEvidenceV1,
  normalizeMackLocalValidationRequestV1,
} from "../dist/mack-local-validation-v1.mjs";

const emptyDigest = "sha256:47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("base64url")}`;
}

function frozenBytes(value) {
  const bytes = Buffer.from(value);
  return { contentBase64: bytes.toString("base64"), sha256: digest(bytes), truncated: false };
}

function request(overrides = {}) {
  const root = "/tmp/mack-local-fixture";
  return {
    schemaVersion: 1,
    contractVersion: "mack.local-validation.v1",
    seatId: "mack",
    missionId: "mission:issue-196",
    missionRevisionId: `sha256:${"A".repeat(43)}`,
    subjectId: "github:RanSolo/shield-workspace/issue/196",
    repository: "RanSolo/shield-workspace",
    repositoryRoot: root,
    canonicalGitDirectory: `${root}/.git`,
    branch: "agent/issue-196",
    baseRevisionId: "1".repeat(40),
    artifactRevisionId: "2".repeat(40),
    validationRequestId: "validation:issue-196:request-1",
    model: { provider: "lmstudio", baseUrl: "http://127.0.0.1:1234", modelKey: "google/gemma-4-31b-qat" },
    toolExecutorId: "executor:local-mack-validation-v1",
    scenarios: [
      { scenarioId: "focused-contract", required: true, description: "The focused contract suite passes." },
      { scenarioId: "regression", required: true, description: "The package regression suite passes." },
      { scenarioId: "advisory", required: false, description: "Optional review context is inspected." },
    ],
    lanes: [
      {
        laneId: "focused",
        commandId: "test:focused",
        executable: "/usr/bin/node",
        executableSha256: `sha256:${"B".repeat(43)}`,
        argv: ["--test", "focused.test.mjs"],
        workingDirectory: root,
        timeoutMs: 30_000,
        environment: [{ name: "LANG", value: "C" }, { name: "LC_ALL", value: "C" }],
        required: true,
        scenarioIds: ["focused-contract"],
      },
      {
        laneId: "regression",
        commandId: "test:regression",
        executable: "/usr/bin/node",
        executableSha256: `sha256:${"B".repeat(43)}`,
        argv: ["--test", "regression.test.mjs"],
        workingDirectory: root,
        timeoutMs: 60_000,
        environment: [{ name: "LANG", value: "C" }, { name: "LC_ALL", value: "C" }],
        required: true,
        scenarioIds: ["regression", "advisory"],
      },
    ],
    approvedTestSurfaces: ["packages/shield-team-system/tests/mack-local-validation-v1.test.mjs"],
    repositoryContext: {
      implementationPaths: ["packages/shield-team-system/src/mack-local-validation-v1.mts"],
      diff: frozenBytes("diff --git a/file b/file\n"),
      sources: [{ path: "packages/shield-team-system/src/mack-local-validation-v1.mts", ...frozenBytes("export {};\n") }],
    },
    missionArtifacts: [{ artifactId: "artifact:issue-196:plan", path: "docs/missions/issue-196-local-mack-plan.md", ...frozenBytes("approved plan\n") }],
    ...overrides,
  };
}

function normalizedRequest(value = request()) {
  const result = normalizeMackLocalValidationRequestV1(value);
  assert.equal(result.state, "valid", JSON.stringify(result));
  return result;
}

function gitObservation(value) {
  return {
    repository: value.repository,
    canonicalRepositoryRoot: value.repositoryRoot,
    canonicalTopLevel: value.repositoryRoot,
    canonicalGitDirectory: `${value.repositoryRoot}/.git`,
    branch: value.branch,
    headRevisionId: value.artifactRevisionId,
    statusPorcelainBytes: 0,
    statusPorcelainSha256: emptyDigest,
    changedPaths: [...value.repositoryContext.implementationPaths],
  };
}

function runtimeObservation() {
  return {
    provider: "lmstudio",
    origin: "http://127.0.0.1:1234",
    observedModelKey: "google/gemma-4-31b-qat",
    loadedInstanceId: "gemma-4-31b-instance",
  };
}

function receipt(lane, overrides = {}) {
  return {
    laneId: lane.laneId,
    commandId: lane.commandId,
    executable: lane.executable,
    executableSha256: lane.executableSha256,
    argv: [...lane.argv],
    workingDirectory: lane.workingDirectory,
    environment: lane.environment.map((entry) => ({ ...entry })),
    startedAt: "2026-08-05T12:00:00.000Z",
    endedAt: "2026-08-05T12:00:01.000Z",
    exitCode: 0,
    signal: null,
    timedOut: false,
    launchError: null,
    stdout: { sha256: emptyDigest, bytes: 0, truncated: false },
    stderr: { sha256: emptyDigest, bytes: 0, truncated: false },
    ...overrides,
  };
}

function analysis(value) {
  return {
    scenarioAssessments: value.scenarios.map(({ scenarioId }) => ({ scenarioId, assessment: "satisfied", summary: "Host evidence supports this scenario." })),
    findings: [],
    limitations: [],
    recommendedRoute: "advance",
  };
}

function creationInput({ receiptOverrides = {}, analysisOverrides = {}, ...overrides } = {}) {
  const normalized = normalizedRequest();
  const value = normalized.value;
  return {
    request: value,
    requestDigest: normalized.requestDigest,
    preInferenceGit: gitObservation(value),
    postInferenceGit: gitObservation(value),
    preInferenceRuntime: runtimeObservation(),
    postInferenceRuntime: runtimeObservation(),
    commandReceipts: value.lanes.map((lane, index) => receipt(lane, index === 0 ? receiptOverrides : {})),
    repositoryContextVerified: true,
    missionArtifactsVerified: true,
    promptSha256: `sha256:${"C".repeat(43)}`,
    responseSha256: `sha256:${"D".repeat(43)}`,
    providerCounters: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    modelAnalysis: { ...analysis(value), ...analysisOverrides },
    ...overrides,
  };
}

test("direct construction creates only exact attributed synthetic evidence", () => {
  const created = createMackLocalValidationEvidenceV1(creationInput());
  assert.equal(created.state, "created", JSON.stringify(created));
  assert.equal(created.evidence.authority, "non_authoritative");
  assert.equal(created.evidence.reasoningRuntimeId, "gemma-4-31b-instance");
  assert.equal(created.evidence.reasoningModel, "google/gemma-4-31b-qat");
  assert.equal(created.evidence.toolExecutorId, "executor:local-mack-validation-v1");
  assert.notEqual(created.evidence.reasoningRuntimeId, created.evidence.toolExecutorId);
  assert.equal(created.evidence.report.assuranceKind, "host_asserted_non_authoritative");
  assert.equal(created.evidence.report.status, "pass");
  assert.equal(created.evidence.report.recommendedRoute, "advance");
  assert.equal(created.evidence.evidenceSource, "synthetic");
  assert.equal(created.evidence.productionEligibility, "ineligible");
  assert.equal(created.evidence.advancementEligibility, "ineligible");
  assert.ok(created.evidence.reasonCodes.includes("SYNTHETIC_EVIDENCE"));
  assert.equal(Object.isFrozen(created.evidence), true);
  assert.equal(Object.isFrozen(created.evidence.commandReceipts), true);
  assert.equal(Object.isFrozen(created.evidence.commandReceipts[0].stdout), true);
  assert.throws(() => { created.evidence.commandReceipts[0].stdout.bytes = 99; }, TypeError);
});

test("a caller-supplied production provenance cannot promote direct construction", () => {
  const created = createMackLocalValidationEvidenceV1({ ...creationInput(), evidenceSource: "production" });
  assert.equal(created.state, "created");
  assert.equal(created.evidence.report.status, "pass");
  assert.equal(created.evidence.evaluation.advancementEligibility, "eligible");
  assert.equal(created.evidence.evidenceSource, "synthetic");
  assert.equal(created.evidence.productionEligibility, "ineligible");
  assert.equal(created.evidence.advancementEligibility, "ineligible");
  assert.ok(created.evidence.reasonCodes.includes("SYNTHETIC_EVIDENCE"));
});

test("required-scenario mappings are non-vacuous, unique, closed, and require a required lane", () => {
  const cases = [
    (value) => { value.lanes[0].scenarioIds = []; },
    (value) => { value.lanes[0].scenarioIds = ["focused-contract", "focused-contract"]; },
    (value) => { value.lanes[0].scenarioIds = ["unknown-scenario"]; },
    (value) => { value.lanes[0].required = false; },
  ];
  for (const mutate of cases) {
    const value = structuredClone(request());
    mutate(value);
    assert.equal(normalizeMackLocalValidationRequestV1(value).state, "invalid");
  }
});

test("duplicate scenario, lane, command, and mission-artifact identities are rejected", () => {
  const cases = [
    (value) => { value.scenarios[1].scenarioId = value.scenarios[0].scenarioId; },
    (value) => { value.lanes[1].laneId = value.lanes[0].laneId; },
    (value) => { value.lanes[1].commandId = value.lanes[0].commandId; },
    (value) => { value.missionArtifacts.push(structuredClone(value.missionArtifacts[0])); },
  ];
  for (const mutate of cases) {
    const value = structuredClone(request());
    mutate(value);
    assert.equal(normalizeMackLocalValidationRequestV1(value).state, "invalid");
  }
});

test("host receipts, not model recommendation, derive failed, timeout, launch, and truncation outcomes", () => {
  const cases = [
    [{ exitCode: 1 }, "fail"],
    [{ exitCode: null, timedOut: true }, "environment_blocked"],
    [{ exitCode: null, launchError: "enoent" }, "unavailable"],
    [{ stdout: { sha256: emptyDigest, bytes: 0, truncated: true } }, "inconclusive"],
  ];
  for (const [receiptOverrides, outcome] of cases) {
    const created = createMackLocalValidationEvidenceV1(creationInput({ receiptOverrides }));
    assert.equal(created.state, "created", JSON.stringify(created));
    assert.equal(created.evidence.report.lanes[0].outcome, outcome);
    assert.equal(created.evidence.report.scenarios[0].covered, false, "model satisfaction cannot override a failed host lane");
    assert.equal(created.evidence.advancementEligibility, "ineligible");
  }
});

test("failed and uncertain ordered model assessments veto host-derived coverage", () => {
  const input = creationInput();
  input.modelAnalysis = {
    ...input.modelAnalysis,
    scenarioAssessments: input.modelAnalysis.scenarioAssessments.map((item, index) => index === 0 ? { ...item, assessment: "failed" } : item),
    findings: [{ findingId: "finding:production", classification: "production_defect", route: "may" }],
    recommendedRoute: "advance",
  };
  const created = createMackLocalValidationEvidenceV1(input);
  assert.equal(created.state, "created");
  assert.equal(created.evidence.report.scenarios[0].covered, false);
  assert.equal(created.evidence.report.status, "fail");
  assert.equal(created.evidence.report.recommendedRoute, "may");
  assert.equal(created.evidence.advancementEligibility, "ineligible");

  const uncertain = creationInput();
  uncertain.modelAnalysis = {
    ...uncertain.modelAnalysis,
    scenarioAssessments: uncertain.modelAnalysis.scenarioAssessments.map((item, index) => index === 0 ? { ...item, assessment: "uncertain" } : item),
  };
  const uncertainCreated = createMackLocalValidationEvidenceV1(uncertain);
  assert.equal(uncertainCreated.state, "created");
  assert.equal(uncertainCreated.evidence.report.scenarios[0].covered, false);
  assert.equal(uncertainCreated.evidence.report.status, "inconclusive");
});

test("request digest, frozen order, context proof, and pre/post identities fail closed", () => {
  const cases = [
    (input) => { input.requestDigest = `sha256:${"Z".repeat(43)}`; },
    (input) => { input.commandReceipts.reverse(); },
    (input) => { input.repositoryContextVerified = false; },
    (input) => { input.postInferenceGit.branch = "other"; },
    (input) => { input.postInferenceRuntime.loadedInstanceId = "other-instance"; },
    (input) => { input.preInferenceRuntime.loadedInstanceId = input.request.toolExecutorId; input.postInferenceRuntime.loadedInstanceId = input.request.toolExecutorId; },
  ];
  for (const mutate of cases) {
    const input = structuredClone(creationInput());
    mutate(input);
    assert.equal(createMackLocalValidationEvidenceV1(input).state, "invalid");
  }
});

test("model output cannot add status, identity, command results, unknown fields, or reordered scenarios", () => {
  const additions = [
    { status: "pass" },
    { artifactRevisionId: "2".repeat(40) },
    { commandResults: [{ exitCode: 0 }] },
    { assuranceKind: "authoritative" },
  ];
  for (const addition of additions) {
    const input = creationInput();
    input.modelAnalysis = { ...input.modelAnalysis, ...addition };
    assert.equal(createMackLocalValidationEvidenceV1(input).state, "invalid");
  }
  const reordered = creationInput();
  reordered.modelAnalysis.scenarioAssessments.reverse();
  assert.equal(createMackLocalValidationEvidenceV1(reordered).state, "invalid");
});

test("request normalization binds complete digest-verified context and canonical request identity", () => {
  const valid = normalizedRequest();
  assert.equal(valid.requestDigest, computeMackLocalValidationRequestDigestV1(valid.value));
  const mismatched = request();
  mismatched.repositoryContext.sources[0].contentBase64 = Buffer.from("substituted\n").toString("base64");
  assert.equal(normalizeMackLocalValidationRequestV1(mismatched).state, "invalid");
  const truncated = request();
  truncated.repositoryContext.diff.truncated = true;
  assert.equal(normalizeMackLocalValidationRequestV1(truncated).state, "invalid");
});

test("hostile proxy and accessor inputs fail closed without executing accessors", () => {
  let accessed = false;
  const accessor = {};
  Object.defineProperty(accessor, "schemaVersion", { enumerable: true, get() { accessed = true; throw new Error("must_not_run"); } });
  assert.equal(normalizeMackLocalValidationRequestV1(accessor).state, "invalid");
  assert.equal(accessed, false);
  const hostile = new Proxy({}, { getPrototypeOf() { throw new Error("hostile"); } });
  assert.equal(normalizeMackLocalValidationRequestV1(hostile).state, "invalid");
  assert.equal(createMackLocalValidationEvidenceV1(hostile).state, "invalid");
});
