import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
import { normalizeMackLocalValidationRequestV1 } from "../dist/mack-local-validation-v1.mjs";
import {
  FEATURE_FLIGHT_REVIEW_GATES_CONTRACT_VERSION,
  projectFeatureFlightReviewGatesV1,
} from "../scripts/operations/feature-flight-review-gates.mjs";
import { runFeatureFlightStepV1 } from "../scripts/operations/feature-flight-step.mjs";
import { FLIGHT_PLAN_NOTICE, FLIGHT_STATE_NOTICE } from "../scripts/operations/flight-contracts.mjs";

const BASE = "1".repeat(40);
const A = "a".repeat(40);
const B = "b".repeat(40);
const IMPLEMENTATION_PATHS = ["packages/shield-team-system/scripts/operations/feature-flight-review-gates.mjs"];
const TEST_SURFACES = ["packages/shield-team-system/tests/operations-feature-flight-review-gates.test.mjs"];

const rawDigest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("base64url")}`;
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const canonicalValue = (value) => Array.isArray(value) ? value.map(canonicalValue) : value !== null && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])])) : value;
const frozenBytes = (value) => {
  const bytes = Buffer.from(value);
  return { contentBase64: bytes.toString("base64"), sha256: digest(bytes), truncated: false };
};

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

function mackRequest(f, review, revision) {
  return {
    schemaVersion: 1, contractVersion: "mack.local-validation.v1", seatId: "mack", missionId: review.brief.missionId,
    missionRevisionId: review.brief.revisionId, subjectId: review.brief.subjectId, repository: "RanSolo/shield-workspace",
    repositoryRoot: f.worktree, canonicalGitDirectory: f.commonGitDirectory, branch: "agent/issue-251", baseRevisionId: BASE,
    artifactRevisionId: revision, validationRequestId: `validation:review-251:${revision}`, model: { provider: "lmstudio", baseUrl: "http://127.0.0.1:1234", modelKey: "fixture/model" },
    toolExecutorId: "executor:local-mack-validation-v1", scenarios: [{ scenarioId: "slice4", required: true, description: "Slice 4 focused validation passes." }],
    lanes: [{ laneId: "focused", commandId: "test:slice4", executable: "/usr/bin/node", executableSha256: `sha256:${"B".repeat(43)}`,
      argv: ["--test", TEST_SURFACES[0]], workingDirectory: f.worktree, timeoutMs: 30000, environment: [{ name: "LANG", value: "C" }], required: true, scenarioIds: ["slice4"] }],
    approvedTestSurfaces: TEST_SURFACES, repositoryContext: { implementationPaths: IMPLEMENTATION_PATHS, diff: frozenBytes("diff\n"),
      sources: [{ path: IMPLEMENTATION_PATHS[0], ...frozenBytes("export {};\n") }] },
    missionArtifacts: [{ artifactId: "artifact:slice4-plan", path: "docs/missions/issue-251-helicarrier-v0-slice-4-plan.md", ...frozenBytes("plan\n") }],
  };
}

function passingReadback(request) {
  const normalized = normalizeMackLocalValidationRequestV1(request);
  assert.equal(normalized.state, "valid");
  const evidence = {
    validationRequestId: request.validationRequestId, requestDigest: normalized.requestDigest, missionId: request.missionId,
    missionRevisionId: request.missionRevisionId, subjectId: request.subjectId, repository: request.repository,
    repositoryRoot: request.repositoryRoot, canonicalGitDirectory: request.canonicalGitDirectory, branch: request.branch,
    baseRevisionId: request.baseRevisionId, artifactRevisionId: request.artifactRevisionId,
    implementationPaths: [...request.repositoryContext.implementationPaths],
    evidenceSource: "production", productionEligibility: "eligible", advancementEligibility: "eligible", evaluation: { advancementEligibility: "eligible" },
    report: { missionId: request.missionId, subjectId: request.subjectId, repository: request.repository, branch: request.branch,
      artifactRevisionId: request.artifactRevisionId, status: "pass", recommendedRoute: "advance", scenarios: [{ scenarioId: "slice4", required: true, covered: true }],
      lanes: [{ laneId: "focused", commandId: "test:slice4", outcome: "pass" }], limitations: [] }, reasonCodes: [],
    evidenceDigest: `sha256:${"E".repeat(43)}`,
  };
  return { state: "verified", validationRequestId: request.validationRequestId, requestDigest: normalized.requestDigest,
    record: { path: "/tmp/mack-registry/record.json", bytes: 1, sha256: `sha256:${"R".repeat(43)}` }, evidence };
}

async function fixture(options = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-review-gates-")));
  const repositoryRoot = join(parent, "repository");
  const worktree = join(repositoryRoot, "worktree");
  const commonGitDirectory = join(repositoryRoot, ".git");
  const artifacts = join(parent, "artifacts");
  const storeRoot = join(parent, "step-store");
  await Promise.all([mkdir(worktree, { recursive: true }), mkdir(commonGitDirectory, { recursive: true }), mkdir(artifacts), mkdir(storeRoot, { mode: 0o700 })]);
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
    commonGitDirectory, commonGitDevice: 42, commonGitInode: 251, configuredRemoteUrl: "git@github.com:RanSolo/shield-workspace.git",
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
    observeRepository: async () => ({ root: worktree, branch: "agent/issue-251", head: A, clean: true, commonGitDirectory, commonGitDevice: 42,
      commonGitInode: 251, configuredRemoteUrl: remote.configuredRemoteUrl }),
    observeRemoteBranch: async (request) => ({ schemaVersion: 1, artifactType: "feature-flight-remote-observation", contractVersion: "2.0.0", authority: "none",
      notice: "Read-only remote observation only. This value grants no authority.", repositoryRoot: worktree, commonGitDirectory, commonGitDevice: 42,
      commonGitInode: 251, observer: { observerId: remote.observerId, observerVersion: remote.observerVersion, runtimeId: remote.runtimeId, executorId: remote.executorId },
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
  const executionJournalPath = join(artifacts, "execution.jsonl"); const executionBytes = Buffer.from(`${execution.entries.map(canonicalJson).join("\n")}\n`); await writeFile(executionJournalPath, executionBytes);
  const reviewJournalPath = join(artifacts, "review.jsonl"); const reviewBytes = Buffer.from(`${review.entries.map(canonicalJson).join("\n")}\n`); await writeFile(reviewJournalPath, reviewBytes);
  const revision = review.projection.reviewSubject.revisionId;
  const request = mackRequest({ worktree, commonGitDirectory }, review, options.requestRevision ?? revision);
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
    commonGitDevice: 42, commonGitInode: 251, branch: "agent/issue-251", implementationPaths: IMPLEMENTATION_PATHS, approvedTestSurfaces: TEST_SURFACES });
  const readback = options.readback === undefined ? (() => passingReadback(request)) : (() => options.readback(request));
  const dependencies = Object.freeze({ observeRepository: async () => ({ repository: "RanSolo/shield-workspace", root: worktree, branch: "agent/issue-251", head: revision,
    clean: true, commonGitDirectory, commonGitDevice: 42, commonGitInode: 251, observedAt: "2026-08-09T14:00:00.000Z" }),
    readMackRegistry: async () => readback(), mackReplayRegistryRoot: join(parent, "mack-registry"), reviewJournalDescriptor: reviewDescriptor });
  return { parent, input, dependencies, review, request, requestPath, artifacts, reviewJournalPath };
}

test("missing Mack evidence stops at the exact protected request and identical bytes replay deterministically", async (t) => {
  const f = await fixture({ readback: () => ({ state: "waiting" }) }); t.after(() => rm(f.parent, { recursive: true, force: true }));
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
      readback: (request) => { const value = passingReadback(request); value.evidence.productionEligibility = "ineligible"; value.evidence.advancementEligibility = "ineligible"; value.evidence.evaluation.advancementEligibility = "ineligible"; value.evidence.report.status = "fail"; value.evidence.report.recommendedRoute = "may"; value.evidence.reasonCodes = ["MODEL_BLOCKING_FINDING"]; return value; },
      stopCode: "mack_validation_revise", correctionSeatId: "may", investigationSuggestionSeatId: null,
    },
    {
      name: "Mack Daisy investigation",
      readback: (request) => { const value = passingReadback(request); value.evidence.productionEligibility = "ineligible"; value.evidence.advancementEligibility = "ineligible"; value.evidence.evaluation.advancementEligibility = "ineligible"; value.evidence.report.status = "inconclusive"; value.evidence.report.recommendedRoute = "daisy"; value.evidence.report.limitations = ["environment unavailable"]; value.evidence.reasonCodes = ["MODEL_LIMITATION"]; return value; },
      stopCode: "mack_validation_blocked", correctionSeatId: null, investigationSuggestionSeatId: "daisy",
    },
    {
      name: "Mack invalid",
      readback: () => ({ state: "invalid", reasonCode: "mack_production_evidence_invalid" }),
      stopCode: "mack_validation_invalid", correctionSeatId: null, investigationSuggestionSeatId: null,
    },
  ];
  for (const vector of vectors) {
    const f = await fixture({ readback: vector.readback }); t.after(() => rm(f.parent, { recursive: true, force: true }));
    const result = await projectFeatureFlightReviewGatesV1(f.input, f.dependencies);
    assert.equal(result.checkpoint.stopCode, vector.stopCode, vector.name);
    assert.equal(result.checkpoint.correctionSeatId, vector.correctionSeatId, vector.name);
    assert.equal(result.checkpoint.investigationSuggestionSeatId, vector.investigationSuggestionSeatId, vector.name);
  }
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
      commonGitDevice: 42, commonGitInode: 251, observedAt: "2026-08-09T14:00:00.000Z" }) });
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
