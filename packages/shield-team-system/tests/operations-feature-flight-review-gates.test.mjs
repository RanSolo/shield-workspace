import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test, { after } from "node:test";

import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  createEvidenceEntry,
  createFuryReviewEntry,
  createMissionBegunEntry,
  createReviewEvidenceRequirements,
  createReviewSubjectSupersessionEntry,
  createSupervisedMissionBrief,
  replaySupervisedMissionJournal,
} from "../dist/mission-v2.mjs";
import {
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  MISSION_130_JOURNAL_DIGEST,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";
import {
  FEATURE_FLIGHT_REVIEW_GATES_CONTRACT_VERSION,
  projectFeatureFlightReviewGatesV1,
} from "../scripts/operations/feature-flight-review-gates.mjs";
import { runFeatureFlightStepV1 } from "../scripts/operations/feature-flight-step.mjs";
import { FLIGHT_PLAN_NOTICE, FLIGHT_STATE_NOTICE } from "../scripts/operations/flight-contracts.mjs";

const IMPLEMENTATION_PATHS = ["packages/shield-team-system/scripts/operations/feature-flight-review-gates.mjs"];
const TEST_SURFACES = ["packages/shield-team-system/tests/operations-feature-flight-review-gates.test.mjs"];
const execFile = promisify(execFileCallback);
const runnerPath = fileURLToPath(new URL("../scripts/model/mack-validation-runner.mjs", import.meta.url));

const rawDigest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("base64url")}`;
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const canonicalValue = (value) => Array.isArray(value) ? value.map(canonicalValue) : value !== null && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])])) : value;
const frozenBytes = (value) => {
  const bytes = Buffer.from(value);
  return { contentBase64: bytes.toString("base64"), sha256: digest(bytes), truncated: false };
};

const sharedRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-review-gates-shared-")));
const templateRepository = join(sharedRoot, "template-repository");
await execFile("git", ["init", "-q", templateRepository]);
await execFile("git", ["-C", templateRepository, "config", "user.email", "review@example.test"]);
await execFile("git", ["-C", templateRepository, "config", "user.name", "Review Fixture"]);
await execFile("git", ["-C", templateRepository, "checkout", "-q", "-b", "agent/issue-251"]);
await execFile("git", ["-C", templateRepository, "remote", "add", "origin", "git@github.com:RanSolo/shield-workspace.git"]);
const implementationFile = join(templateRepository, IMPLEMENTATION_PATHS[0]);
await mkdir(dirname(implementationFile), { recursive: true });
await writeFile(implementationFile, "export const reviewGateFixture = 0;\n");
await execFile("git", ["-C", templateRepository, "add", IMPLEMENTATION_PATHS[0]]);
await execFile("git", ["-C", templateRepository, "commit", "-q", "-m", "base"]);
const BASE = (await execFile("git", ["-C", templateRepository, "rev-parse", "HEAD"], { encoding: "utf8" })).stdout.trim();
await writeFile(implementationFile, "export const reviewGateFixture = 1;\n");
await execFile("git", ["-C", templateRepository, "commit", "-qam", "flight completion"]);
const A = (await execFile("git", ["-C", templateRepository, "rev-parse", "HEAD"], { encoding: "utf8" })).stdout.trim();
await writeFile(implementationFile, "export const reviewGateFixture = 2;\n");
await execFile("git", ["-C", templateRepository, "commit", "-qam", "review revision"]);
const B = (await execFile("git", ["-C", templateRepository, "rev-parse", "HEAD"], { encoding: "utf8" })).stdout.trim();

const modelAnalyses = new Map();
const modelKeys = new Map();
const modelServer = createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/api/v1/models") {
    response.end(JSON.stringify({ models: [...modelKeys].map(([key, instance]) => ({ key, loaded_instances: [{ id: instance }] })) }));
    return;
  }
  if (request.url === "/api/v1/chat") {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const analysis = modelAnalyses.get(body.model);
      response.end(JSON.stringify({ model: body.model, output: [{ type: "message", content: JSON.stringify(analysis) }], stats: { input_tokens: 20, output_tokens: 8, total_tokens: 28 } }));
    });
    return;
  }
  response.statusCode = 404;
  response.end("{}");
});
await new Promise((resolveListen, rejectListen) => {
  modelServer.once("error", rejectListen);
  modelServer.listen(0, "127.0.0.1", resolveListen);
});
after(async () => {
  await new Promise((resolveClose) => modelServer.close(resolveClose));
  await rm(sharedRoot, { recursive: true, force: true });
});
let mackFixtureCounter = 0;

function authority(seatId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    privateKey,
    binding: {
      schemaVersion: 1, bindingId: `binding:${seatId}`, humanPrincipalId: `human:${seatId}`, seatId, missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64), publicKeySpkiBase64, validFromSequence: 0,
      validThroughSequence: null, attestedBy: "repository-policy:test", provenanceRef: `test:${seatId}`,
    },
  };
}

const signed = (actor, payload) => ({ payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), actor.privateKey).toString("base64") });

function executionJournal() {
  const coulson = authority("coulson");
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2, missionId: "mission:execution-251", objective: "Execute the bounded Feature Flight coordination effect.",
    subjectId: "github:RanSolo/shield-workspace/issue/251", riskFlags: { production: false, destructive: false, migration: false,
      credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false },
    participants: ["hill", "daisy", "coulson"].map((seatId) => ({ seatId })),
    activatedModes: [{ modeId: "reconnaissance", modeVersion: "1.0.0", seatId: "daisy", activationSource: "mission-brief" }], requireSimmons: false,
    createdAt: { value: "2026-08-09T11:00:00Z", provenance: "hostTrusted" }, profileId: "standard", profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"], requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130", predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const entries = [createProfileAwareMissionBegunEntry(brief, [coulson.binding])];
  let replay = replayProfileAwareMissionJournal(entries);
  assert.equal(replay.state, "valid", replay.errors?.join(" "));
  const requirement = replay.value.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const payload = {
    schemaVersion: 1, evidenceId: "evidence:execution:coulson", requirementId: requirement.requirementId,
    missionId: brief.missionId, revisionId: brief.revisionId, seatId: "coulson", evidenceKind: "mission_authorization",
    decision: "approved", humanPrincipalId: coulson.binding.humanPrincipalId, bindingId: coulson.binding.bindingId,
    signingKeyRef: coulson.binding.signingKeyRef, sourceRef: "test:execution-authorization",
    timestamp: { value: "2026-08-09T11:01:00Z", provenance: "hostTrusted" }, journalSequence: 1,
  };
  entries.push({ schemaVersion: 9, entryId: `entry:${brief.missionId}:1`, missionId: brief.missionId, sequence: 1,
    type: "governance.decided", timestamp: payload.timestamp, payload: { evidence: signed(coulson, payload) } });
  entries.push({ schemaVersion: 9, entryId: `entry:${brief.missionId}:2`, missionId: brief.missionId, sequence: 2,
    type: "execution.transition", timestamp: { value: "2026-08-09T11:02:00Z", provenance: "hostTrusted" }, payload: { from: "not-started", to: "running" } });
  replay = replayProfileAwareMissionJournal(entries);
  assert.equal(replay.state, "valid", replay.errors?.join(" "));
  return { brief, entries, projection: replay.value };
}

function reviewJournal({ requireSimmons = false, revision = A, furyVerdict = null, furyNextSeat = "may", fitzDecision = null, simmonsDecision = null, staleHistory = false } = {}) {
  const coulson = authority("coulson");
  const fitz = authority("fitz");
  const simmons = authority("simmons");
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1, missionId: "mission:review-251", objective: "Review the exact Feature Flight implementation revision.",
    subjectId: "github:RanSolo/shield-workspace/issue/251", riskFlags: { production: false, destructive: false, migration: false,
      credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false },
    participants: ["hill", "fury", "fitz", "coulson", ...(requireSimmons ? ["simmons"] : [])].map((seatId) => ({ seatId })),
    activatedModes: [], requireSimmons, createdAt: { value: "2026-08-09T12:00:00Z", provenance: "hostTrusted" },
  });
  const initial = { schemaVersion: 1, subjectKind: "repository_artifact", subjectId: "github:RanSolo/shield-workspace/pull/251",
    revisionId: A, supersedesRevisionId: null, sourceRef: "github:pr:251:A" };
  const entries = [createMissionBegunEntry(brief, [coulson.binding, fitz.binding, ...(requireSimmons ? [simmons.binding] : [])], 8, initial)];
  const replay = () => {
    const result = replaySupervisedMissionJournal(entries);
    assert.equal(result.state, "valid", result.errors?.join(" "));
    return result.value;
  };
  const addFury = (verdict, nextActionSeatId) => {
    const projection = replay();
    const sequence = entries.length;
    const review = {
      schemaVersion: 1, reviewId: `review:${projection.reviewSubject.revisionId}:${verdict}`, missionId: brief.missionId,
      subjectKind: "repository_artifact", subjectId: projection.reviewSubject.subjectId, revisionId: projection.reviewSubject.revisionId,
      reviewerSeatId: "fury", verdict, reasons: verdict === "approved" ? ["architecture_conforms"] : ["changes_required"], findings: [],
      decidedAt: { value: `2026-08-09T12:0${sequence}:00Z`, provenance: "hostTrusted" },
      provenance: { assuranceKind: "host_asserted_non_authoritative", sourceRef: `test:fury:${sequence}`,
        reasoningRuntimeId: "runtime:fury-test", toolExecutorId: "executor:fury-test" },
      nextActionSeatId: verdict === "approved" ? "hill" : nextActionSeatId,
      draftDisposition: verdict === "approved" ? "remain_draft" : "return_to_draft",
    };
    const created = createFuryReviewEntry(projection, review);
    assert.equal(created.state, "valid", created.errors?.join(" "));
    entries.push(created.value);
  };
  const addHuman = (actor, decision) => {
    const projection = replay();
    const requirement = projection.requirements.find(({ requiredSeatId }) => requiredSeatId === actor.binding.seatId);
    const sequence = entries.length;
    const payload = {
      schemaVersion: 1, evidenceId: `evidence:${actor.binding.seatId}:${projection.reviewSubject.revisionId}:${sequence}`,
      requirementId: requirement.requirementId, missionId: brief.missionId, subjectKind: requirement.subjectKind,
      subjectId: requirement.subjectId, revisionId: requirement.revisionId, seatId: actor.binding.seatId,
      evidenceKind: requirement.evidenceKind, decision, governanceTarget: null, humanPrincipalId: actor.binding.humanPrincipalId,
      bindingId: actor.binding.bindingId, signingKeyRef: actor.binding.signingKeyRef, sourceRef: `test:${actor.binding.seatId}:${sequence}`,
      timestamp: { value: `2026-08-09T12:${String(sequence).padStart(2, "0")}:30Z`, provenance: "humanRecorded" }, journalSequence: sequence,
    };
    const created = createEvidenceEntry(projection, signed(actor, payload));
    assert.equal(created.state, "valid", created.errors?.join(" "));
    entries.push(created.value);
  };
  if (staleHistory) { addFury("approved", "hill"); addHuman(fitz, "approved"); }
  if (revision === B) {
    const projection = replay();
    const next = { ...initial, revisionId: B, supersedesRevisionId: A, sourceRef: "github:pr:251:B" };
    const created = createReviewSubjectSupersessionEntry(projection, next, { value: "2026-08-09T12:05:00Z", provenance: "hostTrusted" });
    assert.equal(created.state, "valid", created.errors?.join(" "));
    entries.push(created.value);
  }
  if (furyVerdict !== null) addFury(furyVerdict, furyNextSeat);
  if (fitzDecision !== null) addHuman(fitz, fitzDecision);
  if (simmonsDecision !== null) addHuman(simmons, simmonsDecision);
  return { brief, entries, projection: replay(), initial, authorities: { fitz, simmons } };
}

function planFixture(root, worktree) {
  return {
    schemaVersion: 1, planType: "feature-flight-resolved-plan",
    prototype: { name: "flight-prep", version: "1.0.0", authority: "none", notice: FLIGHT_PLAN_NOTICE },
    flightId: "mission:flight-review-251", objective: "Run one Daisy cycle before review.", sourceIssue: "#251",
    repository: { root, remoteUrl: null, baseRef: "main", baseRevision: BASE, inspectedHead: BASE, inspectedBranch: "main", inspectedWorktreeClean: true, collisions: [] },
    integration: { branch: "flight/integration", status: "declared-not-created" },
    lanes: [{ id: "lane-daisy", chatLabel: "Daisy", teamLabel: "Daisy" }],
    missions: [{ id: "mission:execution-251", slug: "mission-execution-251", title: "Daisy execution", library: "team-system", lane: "lane-daisy",
      branch: "agent/issue-251", worktree, activationWave: 1, dependsOn: [], writablePaths: ["packages/shield-team-system/**"],
      scope: "Read-only coordination.", deliverables: ["Terminal"], dependencyLevel: 0, initialEligibility: "eligible-after-independent-authorization",
      constructionStatus: "planned-not-created", authorityStatus: "not-initialized" }],
    evaluationContract: { fixtureId: "slice4", version: 1, scorecard: ["review"] },
  };
}

function stateFixture(plan, planIdentity, status, sequence, predecessorSha256) {
  return {
    schemaVersion: 2, stateType: "non-authoritative-flight-state", authority: "none", notice: FLIGHT_STATE_NOTICE,
    flightId: plan.flightId, plan: planIdentity, sequence, predecessorSha256,
    repository: { root: plan.repository.root, baseRef: plan.repository.baseRef, baseRevision: plan.repository.baseRevision, integrationBranch: plan.integration.branch },
    wave: { current: 1 }, lanes: { "lane-daisy": { activeMissionId: status === "active" ? "mission:execution-251" : null } },
    missions: { "mission:execution-251": { lane: "lane-daisy", activationWave: 1, status, revision: A, authorityEvidence: null } },
    observedAt: "2026-08-09T12:30:00.000Z", tool: { name: sequence === 0 ? "flight-state-init" : "flight-state-successor-recorder", version: "1.0.0" },
  };
}

function runnerInput(execution) {
  const mode = { modeId: "reconnaissance", modeVersion: "1.0.0", seatId: "daisy", activationSource: "mission-brief" };
  return {
    runnerContractVersion: 1,
    projection: { runnerContractVersion: 1, journalSchemaVersion: 9, missionId: execution.brief.missionId, subjectId: execution.brief.subjectId,
      revisionId: execution.brief.revisionId, evaluatedThroughSequence: execution.projection.lastSequence, governanceState: "approved",
      missionAuthorizationState: "authorized", executionStatus: "running", executeReadiness: "ready", participantSeatIds: ["hill", "daisy", "coulson"], activatedModes: [mode], effectRecords: [] },
    resolvedModeContext: { runnerContractVersion: 1, seatId: "daisy", modes: [mode] }, actionAllowlist: ["action:feature-flight.daisy.reconnaissance"],
    plan: { runnerContractVersion: 1, cycleId: "cycle:review-251", missionId: execution.brief.missionId, subjectId: execution.brief.subjectId,
      revisionId: execution.brief.revisionId, evaluatedThroughSequence: execution.projection.lastSequence, seatId: "daisy", activatedModes: [mode],
      actionId: "action:feature-flight.daisy.reconnaissance", effectClass: "coordination", effectKey: "effect:review-251:daisy",
      validationId: "validation:feature-flight.daisy-result-v1", stopCondition: "after_one_cycle" },
  };
}

async function mackRequest(f, review, revision, profile = "pass") {
  mackFixtureCounter += 1;
  const executable = await realpath(process.execPath);
  const [executableBytes, diffResult, sourceResult] = await Promise.all([
    readFile(executable),
    execFile("git", ["-C", f.worktree, "diff", "--binary", "--no-ext-diff", "--full-index", BASE, revision, "--"], { encoding: "buffer", maxBuffer: 8_388_608 }),
    execFile("git", ["-C", f.worktree, "show", `${revision}:${IMPLEMENTATION_PATHS[0]}`], { encoding: "buffer", maxBuffer: 8_388_608 }),
  ]);
  const address = modelServer.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const modelKey = `fixture/review-${mackFixtureCounter}`;
  const modelInstance = `review-instance-${mackFixtureCounter}`;
  modelKeys.set(modelKey, modelInstance);
  const request = {
    schemaVersion: 1, contractVersion: "mack.local-validation.v1", seatId: "mack", missionId: review.brief.missionId,
    missionRevisionId: review.brief.revisionId, subjectId: review.brief.subjectId, repository: "RanSolo/shield-workspace",
    repositoryRoot: f.worktree, canonicalGitDirectory: f.commonGitDirectory, branch: "agent/issue-251", baseRevisionId: BASE,
    artifactRevisionId: revision, validationRequestId: `validation:review-251:${revision}:${mackFixtureCounter}`,
    model: { provider: "lmstudio", baseUrl: `http://127.0.0.1:${address.port}`, modelKey },
    toolExecutorId: "executor:local-mack-validation-v1", scenarios: [{ scenarioId: "slice4", required: true, description: "Slice 4 focused validation passes." }],
    lanes: [{ laneId: "focused", commandId: "test:slice4", executable, executableSha256: digest(executableBytes),
      argv: ["-e", "process.exit(0)"], workingDirectory: f.worktree, timeoutMs: 30000,
      environment: [{ name: "LANG", value: "C" }, { name: "LC_ALL", value: "C" }], required: true, scenarioIds: ["slice4"] }],
    approvedTestSurfaces: TEST_SURFACES, repositoryContext: { implementationPaths: IMPLEMENTATION_PATHS, diff: frozenBytes("diff\n"),
      sources: [{ path: IMPLEMENTATION_PATHS[0], ...frozenBytes(sourceResult.stdout) }] },
    missionArtifacts: [{ artifactId: "artifact:slice4-plan", path: "docs/missions/issue-251-helicarrier-v0-slice-4-plan.md", ...frozenBytes("plan\n") }],
  };
  request.repositoryContext.diff = frozenBytes(diffResult.stdout);
  const assessments = request.scenarios.map(({ scenarioId }) => ({ scenarioId, assessment: profile === "may" ? "failed" : "satisfied", summary: "Host evidence supports this scenario." }));
  const variants = {
    pass: { findings: [], limitations: [], recommendedRoute: "advance" },
    may: { findings: [{ findingId: "finding:production", classification: "production_defect", route: "may" }], limitations: [], recommendedRoute: "may" },
    mack: { findings: [{ findingId: "finding:test", classification: "test_defect", route: "mack" }], limitations: [], recommendedRoute: "mack" },
    fury: { findings: [{ findingId: "finding:architecture", classification: "advisory_gap", route: "fury" }], limitations: [], recommendedRoute: "fury" },
    daisy: { findings: [{ findingId: "finding:environment", classification: "environment_limitation", route: "daisy" }], limitations: ["environment unavailable"], recommendedRoute: "daisy" },
    advisory: { findings: [{ findingId: "finding:advisory", classification: "advisory_gap", route: "daisy" }], limitations: [], recommendedRoute: "daisy" },
  };
  assert.ok(Object.hasOwn(variants, profile));
  modelAnalyses.set(modelInstance, { scenarioAssessments: assessments, ...variants[profile] });
  return request;
}

async function writeProductionRegistry(request, replayRegistryRoot) {
  await mkdir(replayRegistryRoot, { mode: 0o700 });
  const commandRegistry = request.lanes.map(({ commandId, executable, executableSha256, argv, workingDirectory, timeoutMs, environment }) => ({
    commandId, executable, executableSha256, argv, workingDirectory, timeoutMs, environment,
  }));
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [runnerPath], {
      cwd: request.repositoryRoot,
      env: { ...process.env, SHIELD_MACK_COMMAND_REGISTRY_JSON: JSON.stringify(commandRegistry), SHIELD_MACK_REPLAY_REGISTRY_ROOT: replayRegistryRoot },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", rejectRun);
    child.once("close", (code, signal) => code === 0 ? resolveRun() : rejectRun(new Error(`mack_cli_failed:${code}:${signal ?? "none"}:${Buffer.concat(stderr).toString("utf8")}`)));
    child.stdin.end(JSON.stringify(request));
  });
}

async function fixture(options = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-review-gates-")));
  const repositoryRoot = join(parent, "repository");
  const worktree = join(repositoryRoot, "worktree");
  const artifacts = join(parent, "artifacts");
  const storeRoot = join(parent, "step-store");
  await mkdir(repositoryRoot);
  await execFile("git", ["clone", "-q", "--no-hardlinks", templateRepository, worktree]);
  await execFile("git", ["-C", worktree, "checkout", "-q", "-B", "agent/issue-251", A]);
  await execFile("git", ["-C", worktree, "remote", "set-url", "origin", "git@github.com:RanSolo/shield-workspace.git"]);
  const commonGitDirectory = await realpath((await execFile("git", ["-C", worktree, "rev-parse", "--absolute-git-dir"], { encoding: "utf8" })).stdout.trim());
  const commonGitStatus = await lstat(commonGitDirectory);
  await Promise.all([mkdir(artifacts), mkdir(storeRoot, { mode: 0o700 })]);
  const execution = executionJournal();
  const plan = planFixture(repositoryRoot, worktree);
  const planPath = join(artifacts, "plan.json");
  const planBytes = jsonBytes(plan); await writeFile(planPath, planBytes);
  const planIdentity = { path: planPath, bytes: planBytes.length, sha256: rawDigest(planBytes) };
  const predecessor = stateFixture(plan, planIdentity, "authorized", 0, null);
  const predecessorPath = join(artifacts, "state-0.json"); const predecessorBytes = jsonBytes(predecessor); await writeFile(predecessorPath, predecessorBytes);
  const state = stateFixture(plan, planIdentity, "active", 1, rawDigest(predecessorBytes));
  const statePath = join(artifacts, "state-1.json"); const stateBytes = jsonBytes(state); await writeFile(statePath, stateBytes);
  const runner = runnerInput(execution); const runnerPath = join(artifacts, "runner.json"); const runnerBytes = Buffer.from(canonicalJson(runner)); await writeFile(runnerPath, runnerBytes);
  const descriptor = Object.freeze({ adapterId: "shield.daisy.readonly", adapterVersion: "1.0.0", capabilityClass: "read_only_coordination", runtimeId: "runtime:daisy", executorId: "executor:daisy" });
  const remote = Object.freeze({ observerId: "shield.feature-flight.remote-observer", observerVersion: "1.0.0", capabilityClass: "remote_branch_read_only",
    runtimeId: "runtime:remote", executorId: "executor:remote", remoteName: "origin", urlNormalization: "shield-git-remote-url-v1", repositoryRoot: worktree,
    commonGitDirectory, commonGitDevice: commonGitStatus.dev, commonGitInode: commonGitStatus.ino, configuredRemoteUrl: "git@github.com:RanSolo/shield-workspace.git",
    remoteUrlIdentity: "ssh://git@github.com/RanSolo/shield-workspace" });
  let clock = 0; let remoteCalls = 0;
  const stepDependencies = Object.freeze({
    loadRunnerCycleInput: async () => ({ input: runner, canonicalBytes: runnerBytes, sha256: rawDigest(runnerBytes) }),
    authorizeRunner: async (cycle) => ({ runnerContractVersion: 1, decisionId: "decision:review-251", outcome: "allow", missionId: cycle.missionId,
      subjectId: cycle.subjectId, revisionId: cycle.revisionId, evaluatedThroughSequence: cycle.evaluatedThroughSequence, cycleId: cycle.cycleId, seatId: cycle.seatId,
      actionId: cycle.actionId, effectClass: cycle.effectClass, effectKey: cycle.effectKey, reasonCode: "authorized",
      authorizationArtifact: { artifactSchemaVersion: 1, artifactId: "authority:review-251", contentType: "application/json", payload: {} } }),
    invokeDaisyAdapter: async (cycle) => ({ runnerContractVersion: 1, outcome: "completed", missionId: cycle.missionId, subjectId: cycle.subjectId,
      revisionId: cycle.revisionId, evaluatedThroughSequence: cycle.evaluatedThroughSequence, cycleId: cycle.cycleId, seatId: cycle.seatId, actionId: cycle.actionId,
      effectClass: cycle.effectClass, effectKey: cycle.effectKey, summary: "done", evidenceRefs: ["evidence:daisy"] }),
    validateDaisyResult: async (cycle) => ({ runnerContractVersion: 1, outcome: "passed", missionId: cycle.missionId, subjectId: cycle.subjectId,
      revisionId: cycle.revisionId, evaluatedThroughSequence: cycle.evaluatedThroughSequence, cycleId: cycle.cycleId, validationId: cycle.validationId,
      effectKey: cycle.effectKey, summary: "valid" }),
    observeRepository: async () => ({ root: worktree, branch: "agent/issue-251", head: A, clean: true, commonGitDirectory, commonGitDevice: commonGitStatus.dev,
      commonGitInode: commonGitStatus.ino, configuredRemoteUrl: remote.configuredRemoteUrl }),
    observeRemoteBranch: async (request) => ({ schemaVersion: 1, artifactType: "feature-flight-remote-observation", contractVersion: "2.0.0", authority: "none",
      notice: "Read-only remote observation only. This value grants no authority.", repositoryRoot: worktree, commonGitDirectory, commonGitDevice: commonGitStatus.dev,
      commonGitInode: commonGitStatus.ino, observer: { observerId: remote.observerId, observerVersion: remote.observerVersion, runtimeId: remote.runtimeId, executorId: remote.executorId },
      remoteName: "origin", remoteUrlIdentity: remote.remoteUrlIdentity, fullRef: request.fullRef, remoteHead: A,
      observedAt: remoteCalls++ === 0 ? "2026-08-09T12:59:59.000Z" : "2026-08-09T13:00:00.500Z", phase: request.phase, challenge: request.challenge }),
    adapterDescriptor: descriptor, remoteObserverDescriptor: remote, claimStoreRoot: storeRoot,
    clock: Object.freeze({ now: async () => ["2026-08-09T13:00:00.000Z", "2026-08-09T13:00:01.000Z"][Math.min(clock++, 1)] }),
  });
  const stepInput = { planPath, expectedPlanSha256: rawDigest(planBytes), statePath, expectedStateSha256: rawDigest(stateBytes), expectedStateSequence: 1,
    predecessorStatePath: predecessorPath, expectedPredecessorSha256: rawDigest(predecessorBytes), maxSteps: 1, routing: { flightId: plan.flightId, missionId: execution.brief.missionId } };
  const completed = await runFeatureFlightStepV1(stepInput, stepDependencies);
  assert.equal(completed.outcome, "completed", JSON.stringify(completed));
  const effectRoot = join(storeRoot, "effects", completed.effectClaimId);
  const review = reviewJournal(options.review);
  const revision = review.projection.reviewSubject.revisionId;
  if (revision === B) await execFile("git", ["-C", worktree, "reset", "-q", "--hard", B]);
  const executionJournalPath = join(artifacts, "execution.jsonl"); const executionBytes = Buffer.from(`${execution.entries.map(canonicalJson).join("\n")}\n`); await writeFile(executionJournalPath, executionBytes);
  const reviewJournalPath = join(artifacts, "review.jsonl"); const reviewBytes = Buffer.from(`${review.entries.map(canonicalJson).join("\n")}\n`); await writeFile(reviewJournalPath, reviewBytes);
  const request = await mackRequest({ worktree, commonGitDirectory }, review, options.requestRevision ?? revision, options.mackProfile ?? "pass");
  const requestPath = join(artifacts, "mack-request.json"); const requestBytes = jsonBytes(request); await writeFile(requestPath, requestBytes);
  const artifact = async (name) => { const bytes = await readFile(join(effectRoot, `${name}.json`)); return { path: join(effectRoot, `${name}.json`), sha256: rawDigest(bytes) }; };
  const [claim, terminal, successor, result] = await Promise.all(["claim", "terminal", "successor", "result"].map(artifact));
  const input = { planPath, expectedPlanSha256: rawDigest(planBytes), statePath, expectedStateSha256: rawDigest(stateBytes), expectedStateSequence: 1,
    predecessorStatePath: predecessorPath, expectedPredecessorSha256: rawDigest(predecessorBytes), runnerInputPath: runnerPath, expectedRunnerInputSha256: rawDigest(runnerBytes),
    claimPath: claim.path, expectedClaimSha256: claim.sha256, terminalPath: terminal.path, expectedTerminalSha256: terminal.sha256,
    successorPath: successor.path, expectedSuccessorSha256: successor.sha256, resultPath: result.path, expectedResultSha256: result.sha256,
    executionJournalPath, expectedExecutionJournalSha256: rawDigest(executionBytes), mackRequestPath: requestPath, expectedMackRequestSha256: rawDigest(requestBytes),
    reviewJournalPath, expectedReviewJournalSha256: rawDigest(reviewBytes) };
  const reviewDescriptor = Object.freeze({ schemaVersion: 1, descriptorType: "feature-flight-review-journal",
    journal: { path: reviewJournalPath, bytes: reviewBytes.length, sha256: rawDigest(reviewBytes) }, reviewMissionId: review.brief.missionId,
    reviewMissionRevisionId: review.brief.revisionId, reviewWorkItemSubjectId: review.brief.subjectId, repositoryReviewSubjectId: review.projection.reviewSubject.subjectId,
    sourceRef: review.projection.reviewSubject.sourceRef, repository: "RanSolo/shield-workspace", repositoryRoot: worktree, commonGitDirectory,
    commonGitDevice: commonGitStatus.dev, commonGitInode: commonGitStatus.ino, branch: "agent/issue-251", implementationPaths: IMPLEMENTATION_PATHS, approvedTestSurfaces: TEST_SURFACES });
  const mackReplayRegistryRoot = join(parent, "mack-registry");
  if (options.mackEvidence !== false && (options.requestRevision ?? revision) === revision) await writeProductionRegistry(request, mackReplayRegistryRoot);
  else await mkdir(mackReplayRegistryRoot, { mode: 0o700 });
  const dependencies = Object.freeze({ observeRepository: async () => ({ repository: "RanSolo/shield-workspace", root: worktree, branch: "agent/issue-251", head: revision,
    clean: true, commonGitDirectory, commonGitDevice: commonGitStatus.dev, commonGitInode: commonGitStatus.ino, observedAt: "2026-08-09T14:00:00.000Z" }),
    mackReplayRegistryRoot, reviewJournalDescriptor: reviewDescriptor, adapterDescriptor: descriptor,
    remoteObserverDescriptor: remote, featureFlightStepStoreRoot: storeRoot });
  return { parent, input, dependencies, review, request, requestPath, artifacts, reviewJournalPath, worktree, commonGitDirectory,
    commonGitStatus, storeRoot, mackReplayRegistryRoot, effectRoot };
}

test("missing Mack evidence stops at the exact protected request and identical bytes replay deterministically", async (t) => {
  const f = await fixture({ mackEvidence: false }); t.after(() => rm(f.parent, { recursive: true, force: true }));
  const first = await projectFeatureFlightReviewGatesV1(f.input, f.dependencies);
  const second = await projectFeatureFlightReviewGatesV1(f.input, f.dependencies);
  assert.deepEqual(second, first);
  assert.equal(FEATURE_FLIGHT_REVIEW_GATES_CONTRACT_VERSION, "1.0.0");
  assert.equal(first.checkpoint.stopCode, "mack_validation_required");
  assert.equal(first.checkpoint.gateSeatId, "mack");
  assert.equal(first.checkpoint.authority, "none");
  assert.equal(first.checkpoint.gateEligible, false);
  assert.notEqual(first.checkpoint.binding.executionMissionId, first.checkpoint.binding.reviewMissionId);
  assert.notEqual(first.checkpoint.binding.executionWorkItemSubjectId, first.checkpoint.binding.repositoryReviewSubjectId);
  assert.equal(first.checkpoint.binding.flightCompletionRevision, A);
  assert.equal(first.checkpoint.binding.currentReviewRevision, A);
});

test("current Mack, Fury, and Fitz pass only to the fixed unsatisfied Coulson final stop", async (t) => {
  const f = await fixture({ review: { furyVerdict: "approved", fitzDecision: "approved" } }); t.after(() => rm(f.parent, { recursive: true, force: true }));
  const result = await projectFeatureFlightReviewGatesV1(f.input, f.dependencies);
  assert.equal(result.checkpoint.gates.mack.state, "pass");
  assert.equal(result.checkpoint.gates.fury.state, "pass");
  assert.equal(result.checkpoint.gates.fitz.state, "satisfied");
  assert.equal(result.checkpoint.stopCode, "coulson_final_acceptance_required");
  assert.equal(result.checkpoint.gateSeatId, "coulson");
  assert.equal(result.checkpoint.correctionSeatId, null);
});

test("controller rejects Mack reader injection and cannot convert an absent protected record into a fake pass", async (t) => {
  const f = await fixture({ mackEvidence: false }); t.after(() => rm(f.parent, { recursive: true, force: true }));
  let fakeCalls = 0;
  const injected = Object.freeze({ ...f.dependencies, readMackRegistry: async () => {
    fakeCalls += 1;
    return { state: "verified" };
  } });
  await assert.rejects(() => projectFeatureFlightReviewGatesV1(f.input, injected), /unknown or non-data field/u);
  assert.equal(fakeCalls, 0);
  const result = await projectFeatureFlightReviewGatesV1(f.input, f.dependencies);
  assert.equal(result.checkpoint.gates.mack.state, "waiting");
  assert.equal(result.checkpoint.stopCode, "mack_validation_required");
});

test("retained store hierarchy and shared fixed Daisy policy reject independent substitutions", async (t) => {
  const hierarchy = await fixture({ mackEvidence: false }); t.after(() => rm(hierarchy.parent, { recursive: true, force: true }));
  const displaced = `${hierarchy.effectRoot}-displaced`;
  const replacement = `${hierarchy.effectRoot}-replacement`;
  await cp(hierarchy.effectRoot, replacement, { recursive: true, preserveTimestamps: true });
  await rename(hierarchy.effectRoot, displaced);
  await rename(replacement, hierarchy.effectRoot);
  assert.equal((await projectFeatureFlightReviewGatesV1(hierarchy.input, hierarchy.dependencies)).checkpoint.stopCode, "flight_evidence_recovery_required");

  const policy = await fixture({ mackEvidence: false }); t.after(() => rm(policy.parent, { recursive: true, force: true }));
  const runner = JSON.parse(await readFile(policy.input.runnerInputPath, "utf8"));
  runner.actionAllowlist.push("action:feature-flight.unapproved");
  const runnerBytes = Buffer.from(canonicalJson(runner));
  await writeFile(policy.input.runnerInputPath, runnerBytes);
  const policyInput = { ...policy.input, expectedRunnerInputSha256: rawDigest(runnerBytes) };
  assert.equal((await projectFeatureFlightReviewGatesV1(policyInput, policy.dependencies)).checkpoint.stopCode, "flight_evidence_recovery_required");
});

test("descriptor and live repository identity cannot substitute a different repository at the same revision", async (t) => {
  const f = await fixture({ mackEvidence: false }); t.after(() => rm(f.parent, { recursive: true, force: true }));
  const reviewJournalDescriptor = Object.freeze({ ...f.dependencies.reviewJournalDescriptor, repository: "OtherOrg/other-repository" });
  const dependencies = Object.freeze({ ...f.dependencies, reviewJournalDescriptor, observeRepository: async () => ({
    repository: "OtherOrg/other-repository", root: f.worktree, branch: "agent/issue-251", head: A, clean: true,
    commonGitDirectory: f.commonGitDirectory, commonGitDevice: f.commonGitStatus.dev, commonGitInode: f.commonGitStatus.ino,
    observedAt: "2026-08-09T14:00:00.000Z",
  }) });
  const result = await projectFeatureFlightReviewGatesV1(f.input, dependencies);
  assert.equal(result.checkpoint.stopCode, "repository_freshness_invalid");
  assert.equal(result.checkpoint.gates.mack.state, "invalid");
});

test("Mack protected-registry recovery has a dedicated seatless stop", async (t) => {
  const f = await fixture({ mackEvidence: false }); t.after(() => rm(f.parent, { recursive: true, force: true }));
  const key = createHash("sha256").update(f.request.validationRequestId).digest("hex");
  await writeFile(join(f.mackReplayRegistryRoot, `${key}.lock`), "uncertain\n", { mode: 0o600 });
  const result = await projectFeatureFlightReviewGatesV1(f.input, f.dependencies);
  assert.equal(result.checkpoint.gates.mack.state, "recovery");
  assert.equal(result.checkpoint.phase, "mack_registry_recovery");
  assert.equal(result.checkpoint.stopCode, "mack_registry_recovery_required");
  assert.equal(result.checkpoint.nextAction, "recover_mack_validation_registry");
  assert.equal(result.checkpoint.gateSeatId, null);
  assert.equal(result.checkpoint.correctionSeatId, null);
  assert.equal(result.checkpoint.investigationSuggestionSeatId, null);
});

test("real production Mack routes preserve mack, fury, and advisory-pass classifications", async (t) => {
  for (const vector of [
    { profile: "mack", stopCode: "mack_validation_revise", correction: "mack", investigation: null },
    { profile: "fury", stopCode: "mack_validation_blocked", correction: null, investigation: "fury" },
  ]) {
    const f = await fixture({ mackProfile: vector.profile }); t.after(() => rm(f.parent, { recursive: true, force: true }));
    const result = await projectFeatureFlightReviewGatesV1(f.input, f.dependencies);
    assert.equal(result.checkpoint.gates.mack.recommendedRoute, vector.profile);
    assert.equal(result.checkpoint.stopCode, vector.stopCode);
    assert.equal(result.checkpoint.correctionSeatId, vector.correction);
    assert.equal(result.checkpoint.investigationSuggestionSeatId, vector.investigation);
  }
  const advisory = await fixture({ mackProfile: "advisory", review: { furyVerdict: "approved", fitzDecision: "approved" } });
  t.after(() => rm(advisory.parent, { recursive: true, force: true }));
  const result = await projectFeatureFlightReviewGatesV1(advisory.input, advisory.dependencies);
  assert.equal(result.checkpoint.gates.mack.state, "pass");
  assert.equal(result.checkpoint.gates.mack.recommendedRoute, "advance");
  assert.equal(result.checkpoint.stopCode, "coulson_final_acceptance_required");
});

test("Fury changes_requested preserves the validated nextActionSeatId exactly", async (t) => {
  const f = await fixture({ review: { furyVerdict: "changes_requested", furyNextSeat: "daisy" } }); t.after(() => rm(f.parent, { recursive: true, force: true }));
  const result = await projectFeatureFlightReviewGatesV1(f.input, f.dependencies);
  assert.equal(result.checkpoint.stopCode, "fury_review_changes_requested");
  assert.equal(result.checkpoint.correctionSeatId, "daisy");
  assert.equal(result.checkpoint.gateSeatId, null);
});

test("A to B supersession keeps A stale, restarts at Mack, then exposes current-revision Fury stale history", async (t) => {
  const staleRequest = await fixture({ review: { revision: B, staleHistory: true }, requestRevision: A });
  t.after(() => rm(staleRequest.parent, { recursive: true, force: true }));
  let result = await projectFeatureFlightReviewGatesV1(staleRequest.input, staleRequest.dependencies);
  assert.equal(result.checkpoint.binding.flightCompletionRevision, A);
  assert.equal(result.checkpoint.binding.currentReviewRevision, B);
  assert.equal(result.checkpoint.stopCode, "mack_validation_stale");

  const current = await fixture({ review: { revision: B, staleHistory: true } });
  t.after(() => rm(current.parent, { recursive: true, force: true }));
  result = await projectFeatureFlightReviewGatesV1(current.input, current.dependencies);
  assert.equal(result.checkpoint.gates.mack.state, "pass");
  assert.equal(result.checkpoint.gates.fury.state, "stale");
  assert.equal(result.checkpoint.stopCode, "fury_review_stale");
});

test("conditional Simmons remains a distinct human-only stop and non-approval names no correction seat", async (t) => {
  const waiting = await fixture({ review: { requireSimmons: true, furyVerdict: "approved", fitzDecision: "approved" } });
  t.after(() => rm(waiting.parent, { recursive: true, force: true }));
  let result = await projectFeatureFlightReviewGatesV1(waiting.input, waiting.dependencies);
  assert.equal(result.checkpoint.stopCode, "simmons_review_required");
  assert.equal(result.checkpoint.gateSeatId, "simmons");
  const revised = await fixture({ review: { requireSimmons: true, furyVerdict: "approved", fitzDecision: "approved", simmonsDecision: "changes_requested" } });
  t.after(() => rm(revised.parent, { recursive: true, force: true }));
  result = await projectFeatureFlightReviewGatesV1(revised.input, revised.dependencies);
  assert.equal(result.checkpoint.stopCode, "simmons_review_changes_requested");
  assert.equal(result.checkpoint.gateSeatId, "simmons");
  assert.equal(result.checkpoint.correctionSeatId, null);
});

test("the closed Mack and Fitz stop matrix preserves correction, investigation, gate, and rejection identities", async (t) => {
  const vectors = [
    {
      name: "Mack May revision",
      mackProfile: "may",
      stopCode: "mack_validation_revise", correctionSeatId: "may", investigationSuggestionSeatId: null,
    },
    {
      name: "Mack Daisy investigation",
      mackProfile: "daisy",
      stopCode: "mack_validation_blocked", correctionSeatId: null, investigationSuggestionSeatId: "daisy",
    },
  ];
  for (const vector of vectors) {
    const f = await fixture({ mackProfile: vector.mackProfile }); t.after(() => rm(f.parent, { recursive: true, force: true }));
    const result = await projectFeatureFlightReviewGatesV1(f.input, f.dependencies);
    assert.equal(result.checkpoint.stopCode, vector.stopCode, vector.name);
    assert.equal(result.checkpoint.correctionSeatId, vector.correctionSeatId, vector.name);
    assert.equal(result.checkpoint.investigationSuggestionSeatId, vector.investigationSuggestionSeatId, vector.name);
  }
  const invalid = await fixture(); t.after(() => rm(invalid.parent, { recursive: true, force: true }));
  const invalidRecord = join(invalid.mackReplayRegistryRoot, `${createHash("sha256").update(invalid.request.validationRequestId).digest("hex")}.json`);
  await writeFile(invalidRecord, "{}\n", { mode: 0o600 });
  const invalidResult = await projectFeatureFlightReviewGatesV1(invalid.input, invalid.dependencies);
  assert.equal(invalidResult.checkpoint.stopCode, "mack_validation_invalid");
  assert.equal(invalidResult.checkpoint.correctionSeatId, null);
  assert.equal(invalidResult.checkpoint.investigationSuggestionSeatId, null);
  for (const decision of ["changes_requested", "rejected"]) {
    const f = await fixture({ review: { furyVerdict: "approved", fitzDecision: decision } }); t.after(() => rm(f.parent, { recursive: true, force: true }));
    const result = await projectFeatureFlightReviewGatesV1(f.input, f.dependencies);
    assert.equal(result.checkpoint.stopCode, decision === "changes_requested" ? "fitz_review_changes_requested" : "fitz_review_rejected");
    assert.equal(result.checkpoint.gateSeatId, "fitz");
    assert.equal(result.checkpoint.correctionSeatId, null);
  }
});

test("conflicting review replay, A-B-A reuse, repository drift, and dirty current HEAD fail closed before Mack", async (t) => {
  const conflict = await fixture({ review: { furyVerdict: "approved" } }); t.after(() => rm(conflict.parent, { recursive: true, force: true }));
  const entries = conflict.review.entries;
  const projection = conflict.review.projection;
  const review = { schemaVersion: 1, reviewId: "review:conflict", missionId: projection.missionId, subjectKind: "repository_artifact",
    subjectId: projection.reviewSubject.subjectId, revisionId: projection.reviewSubject.revisionId, reviewerSeatId: "fury", verdict: "approved",
    reasons: ["conflict"], findings: [], decidedAt: { value: "2026-08-09T12:09:00Z", provenance: "hostTrusted" },
    provenance: { assuranceKind: "host_asserted_non_authoritative", sourceRef: "test:conflict", reasoningRuntimeId: "runtime:fury", toolExecutorId: "executor:fury" },
    nextActionSeatId: "hill", draftDisposition: "remain_draft" };
  entries.push({ schemaVersion: 8, entryId: `entry:${projection.missionId}:${entries.length}`, missionId: projection.missionId, sequence: entries.length,
    type: "fury.review_approved", timestamp: review.decidedAt, payload: { review } });
  const conflictBytes = Buffer.from(`${entries.map(canonicalJson).join("\n")}\n`); await writeFile(conflict.reviewJournalPath, conflictBytes);
  const conflictInput = { ...conflict.input, expectedReviewJournalSha256: rawDigest(conflictBytes) };
  const conflictDescriptor = Object.freeze({ ...conflict.dependencies.reviewJournalDescriptor, journal: { path: conflict.reviewJournalPath, bytes: conflictBytes.length, sha256: rawDigest(conflictBytes) } });
  const conflictDeps = Object.freeze({ ...conflict.dependencies, reviewJournalDescriptor: conflictDescriptor });
  assert.equal((await projectFeatureFlightReviewGatesV1(conflictInput, conflictDeps)).checkpoint.stopCode, "review_revision_lineage_invalid");

  const reused = await fixture({ review: { revision: B } }); t.after(() => rm(reused.parent, { recursive: true, force: true }));
  const reusedProjection = reused.review.projection;
  const reuseSubject = { ...reused.review.initial, supersedesRevisionId: B, sourceRef: "github:pr:251:A-reused" };
  const requirements = createReviewEvidenceRequirements(reused.review.brief, reuseSubject, reused.review.entries.length, reusedProjection.requirements);
  reused.review.entries.push({ schemaVersion: 8, entryId: `entry:${reusedProjection.missionId}:${reused.review.entries.length}`, missionId: reusedProjection.missionId,
    sequence: reused.review.entries.length, type: "subject.revision_superseded", timestamp: { value: "2026-08-09T12:10:00Z", provenance: "hostTrusted" },
    payload: { reviewSubject: reuseSubject, requirements } });
  const reuseBytes = Buffer.from(`${reused.review.entries.map(canonicalJson).join("\n")}\n`); await writeFile(reused.reviewJournalPath, reuseBytes);
  const reuseInput = { ...reused.input, expectedReviewJournalSha256: rawDigest(reuseBytes) };
  const reuseDescriptor = Object.freeze({ ...reused.dependencies.reviewJournalDescriptor, journal: { path: reused.reviewJournalPath, bytes: reuseBytes.length, sha256: rawDigest(reuseBytes) } });
  assert.equal((await projectFeatureFlightReviewGatesV1(reuseInput, Object.freeze({ ...reused.dependencies, reviewJournalDescriptor: reuseDescriptor }))).checkpoint.stopCode, "review_revision_lineage_invalid");

  for (const observed of [{ head: B }, { clean: false }]) {
    const current = await fixture(); t.after(() => rm(current.parent, { recursive: true, force: true }));
    const dependencies = Object.freeze({ ...current.dependencies, observeRepository: async () => ({ repository: "RanSolo/shield-workspace", root: current.dependencies.reviewJournalDescriptor.repositoryRoot,
      branch: "agent/issue-251", head: observed.head ?? A, clean: observed.clean ?? true, commonGitDirectory: current.dependencies.reviewJournalDescriptor.commonGitDirectory,
      commonGitDevice: current.commonGitStatus.dev, commonGitInode: current.commonGitStatus.ino, observedAt: "2026-08-09T14:00:00.000Z" }) });
    assert.equal((await projectFeatureFlightReviewGatesV1(current.input, dependencies)).checkpoint.stopCode, "repository_freshness_invalid");
  }
});

test("hostile dependency accessors and missing or substituted terminal bytes are rejected without mutation", async (t) => {
  const f = await fixture(); t.after(() => rm(f.parent, { recursive: true, force: true }));
  let accessed = false;
  const hostile = {};
  Object.defineProperty(hostile, "observeRepository", { enumerable: true, get() { accessed = true; throw new Error("must_not_run"); } });
  Object.freeze(hostile);
  await assert.rejects(() => projectFeatureFlightReviewGatesV1(f.input, hostile));
  assert.equal(accessed, false);
  const substituted = { ...f.input, expectedResultSha256: "f".repeat(64) };
  const result = await projectFeatureFlightReviewGatesV1(substituted, f.dependencies);
  assert.equal(result.checkpoint.stopCode, "flight_evidence_recovery_required");
  assert.equal(result.checkpoint.authority, "none");
  assert.equal(result.checkpoint.gateEligible, false);
});
