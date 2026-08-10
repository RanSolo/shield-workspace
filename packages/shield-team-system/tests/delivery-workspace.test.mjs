import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  prepareGovernedDeliveryWorkspaceForDispatch,
  prepareDeliveryWorkspaceForDispatch,
  renderMissionHandoff,
  validatePRWorkspaceReceipt,
} from "../public/github.mjs";
import { canonicalJson } from "../dist/mission-v2.mjs";
import {
  createProfileAwareImplementationAuthorityEntryV1,
  createProfileAwareRuntimeBindingRecordedEntryV1,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";
import {
  computeImplementationAuthorityDigest,
  computeRuntimeBindingDigest,
  computeSchema9RuntimeBindingDigest,
} from "../dist/implementation-authority-v1.mjs";
import { resolveSupervisedMissionPaths } from "../dist/mission-store.mjs";
import { deriveFuryPlanReviewEvidenceV1 } from "../dist/fury-plan-review-evidence-v1.mjs";
import {
  appendFuryPlanReviewEvidenceIfAbsentV1,
  readFuryPlanReviewEvidenceLedgerV1,
} from "../dist/fury-plan-review-evidence-store.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";
import { publicationJournalFixture } from "./fixtures/review-publication-journal.mjs";

const head = "0123456789012345678901234567890123456789";
const base = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const execFile = promisify(execFileCallback);

function plan() {
  return {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug: "codex/issue-44-draft-pr-workspace",
    missionBriefPath: "docs/missions/issue-44-draft-pr-workspace-regression.md",
    prTitle: "Regression: enforce the draft PR Mission Workspace",
  };
}

function pr(overrides = {}) {
  return {
    number: 45,
    title: plan().prTitle,
    url: "https://github.com/RanSolo/shield-workspace/pull/45",
    isDraft: true,
    state: "OPEN",
    headRefName: plan().branchSlug,
    headRefOid: head,
    baseRefName: "main",
    ...overrides,
  };
}

function publicationFixture(action, schemaVersion = 8) {
  return publicationJournalFixture({
    schemaVersion,
    missionId: "mission-44",
    subjectId: "issue-44",
    headRevisionId: head,
    baseRevisionId: base,
    branch: plan().branchSlug,
    authorizedPaths: [plan().missionBriefPath],
    permittedEffects: [
      "review.branch.push",
      `review.pull_request.${action}_draft`,
    ],
    operation: "publish_mission_brief",
    targetRef: `github:repository:RanSolo/shield-workspace` +
      `:branch:${plan().branchSlug}:base:main`,
  });
}

const createPublication = publicationFixture("create");
const updatePublication = publicationFixture("update");
const schema9CreatePublication = publicationFixture("create", 9);

function input(overrides = {}) {
  return {
    missionState: "approved",
    approvalSource: "coulson",
    artifactRevisionId: head,
    workspacePlan: plan(),
    body: "Issue 44 Mission Workspace",
    missionId: "mission-44",
    subjectId: "issue-44",
    blueprintArtifact: {
      artifactId: "issue-44-blueprint",
      artifactPath: plan().missionBriefPath,
      artifactKind: "implementation_blueprint",
      owningSeatId: "may",
    },
    planGateCandidate: null,
    publicationRequestId: createPublication.requestId,
    publicationCandidateId: "candidate:mission-44:publication",
    publicationSourceRef: "github:pr:45",
    publicationCapturedAt: {
      value: "2026-07-29T10:04:00Z",
      provenance: "hostTrusted",
    },
    ...overrides,
  };
}

function passingGate(overrides = {}) {
  return {
    planGateSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    review: {
      reviewSchemaVersion: 1,
      contractVersion: "fury.plan-gate.v1",
      assuranceKind: "host_asserted_non_authoritative",
      reviewId: "review-44-1",
      missionId: "mission-44",
      subjectId: "issue-44",
      repositoryOwner: "RanSolo",
      repositoryName: "shield-workspace",
      baseBranch: "main",
      missionBranch: plan().branchSlug,
      prNumber: 45,
      blueprintArtifactId: "issue-44-blueprint",
      blueprintArtifactPath: plan().missionBriefPath,
      blueprintArtifactKind: "implementation_blueprint",
      blueprintOwningSeatId: "may",
      reviewedRevisionId: head,
      verdict: "PASS",
      findings: [],
      reasoningRuntimeId: "runtime:ornith",
      toolExecutorId: "executor:codex-host",
      ...overrides,
    },
    reconciliation: null,
  };
}

function reconciledGate() {
  const reviewedRevisionId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const value = passingGate({
    reviewedRevisionId,
    verdict: "PASS_WITH_REQUIRED_CHANGES",
    findings: [{
      findingId: "finding-1",
      findingClass: "fail_closedness",
      evidenceRefs: ["pr:45#fury-review"],
    }],
  });
  value.reconciliation = {
    reconciliationSchemaVersion: 1,
    contractVersion: "fury.plan-gate.v1",
    assuranceKind: "host_asserted_non_authoritative",
    reconciliationId: "reconciliation-44-1",
    reviewId: "review-44-1",
    missionId: "mission-44",
    subjectId: "issue-44",
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    missionBranch: plan().branchSlug,
    prNumber: 45,
    blueprintArtifactId: "issue-44-blueprint",
    blueprintArtifactPath: plan().missionBriefPath,
    blueprintArtifactKind: "implementation_blueprint",
    blueprintOwningSeatId: "may",
    reviewedRevisionId,
    correctedRevisionId: head,
    additionalArchitectureChange: false,
    dispositions: [{
      findingId: "finding-1",
      disposition: "incorporated",
      evidenceRefs: [`commit:${head}`],
    }],
    reasoningRuntimeId: "runtime:ornith",
    toolExecutorId: "executor:codex-host",
  };
  return value;
}

function furyEvidenceBundle(planGate, publication = updatePublication) {
  const artifactRevisionId = publication.request.artifactRevisionId;
  const reviewedRevision = planGate.review.reviewedRevisionId;
  const dispatchIdentity = {
    receiptId: "receipt:fury:issue-44",
    dispatchId: "dispatch:fury:issue-44",
    parentMissionId: "mission-44",
    parentMissionRevision: publication.request.revisionId,
    parentSessionId: "session:hill:issue-44",
    childTaskId: "task:fury:issue-44-plan",
    childSessionId: "session:fury:issue-44",
    accountableSeatId: "fury",
    repositoryId: "RanSolo/shield-workspace",
    repositoryWorkspaceId: "workspace:issue-44",
    repositoryRevision: reviewedRevision,
    subjectId: "issue-44",
    subjectRevision: reviewedRevision,
    artifactId: "issue-44-blueprint",
    artifactRevision: reviewedRevision,
  };
  const runtime = {
    kind: "runtime.host_observed",
    runtimeId: "runtime:ornith",
    model: "ornith-1.0-35b",
    evidenceRefs: ["host:fury:runtime"],
  };
  const executor = {
    kind: "executor.host_observed",
    executorId: "executor:codex-host",
    evidenceRefs: ["host:fury:executor"],
  };
  const shared = {
    ...dispatchIdentity,
    configuredRuntime: { kind: "runtime.configured", runtimeId: runtime.runtimeId, model: runtime.model },
    requestedRuntime: { kind: "runtime.requested", runtimeId: runtime.runtimeId, model: runtime.model },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:fury:issue-44" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: runtime,
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: executor,
  };
  const started = createSeatDispatchStartedEventV1({
    ...shared,
    inputEvidenceRefs: ["blueprint:issue-44"],
    timestamp: "2026-07-29T10:03:10Z",
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
  const completed = createSeatDispatchLifecycleEventV1({
    ...shared,
    kind: "dispatch.completed",
    outputEvidenceRefs: ["review:issue-44"],
    timestamp: "2026-07-29T10:03:11Z",
    logSequence: 1,
    previousLogDigest: started.entryDigest,
    lifecycleSequence: 1,
    previousLifecycleDigest: started.entryDigest,
  });
  const entries = [started, completed];
  const created = deriveFuryPlanReviewEvidenceV1({
    planGate,
    binding: {
      schemaVersion: 1,
      missionId: "mission-44",
      missionRevisionId: publication.request.revisionId,
      subjectId: "issue-44",
      repositoryId: "RanSolo/shield-workspace",
      baseBranch: "main",
      branch: plan().branchSlug,
      prNumber: 45,
      blueprintArtifactId: "issue-44-blueprint",
      blueprintArtifactPath: plan().missionBriefPath,
      blueprintArtifactKind: "implementation_blueprint",
      blueprintOwningSeatId: "may",
      artifactRevisionId,
      repositoryRevisionId: artifactRevisionId,
    },
    dispatchIdentity,
    rawReceiptEntries: entries,
  });
  assert.equal(created.state, "created");
  const evidence = created.evidence;
  return {
    evidence,
    entries,
    candidate: {
      candidateSchemaVersion: 1,
      contractVersion: "fury.plan-review-evidence.v1",
      evidenceId: evidence.evidenceId,
      evidenceDigest: evidence.evidenceDigest,
      missionId: evidence.missionId,
      missionRevisionId: evidence.missionRevisionId,
      planDigest: evidence.planDigest,
      artifactRevisionId: evidence.artifactRevisionId,
      repositoryRevisionId: evidence.repositoryRevisionId,
    },
  };
}

function runner(responses) {
  const calls = [];
  const run = (executable, args, options = {}) => {
    calls.push({ executable, args, options });
    const response = responses.shift();
    assert.ok(response, `Unexpected command: ${executable} ${args.join(" ")}`);
    return response;
  };
  run.calls = calls;
  return run;
}

const ok = (stdout = "") => ({ exitCode: 0, stdout, stderr: "" });
const initialChecks = () => [
  ok(plan().branchSlug), ok(), ok(plan().missionBriefPath), ok(head), ok(head),
];
const scopeChecks = () => [
  ok("/workspace/shield-workspace"), ok("git@github.com:RanSolo/shield-workspace.git"),
  ok(plan().branchSlug), ok(head), ok(base), ok(),
  ok(`${plan().missionBriefPath}\0`), ok(), ok(), ok(base),
];

function replaySchema9(entries) {
  const result = replayProfileAwareMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

async function createGovernedFixture() {
  const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-delivery-governed-")));
  await mkdir(join(repositoryRoot, "docs", "missions"), { recursive: true });
  await writeFile(join(repositoryRoot, plan().missionBriefPath), "# Governed delivery fixture\n", "utf8");
  await execFile("git", ["-C", repositoryRoot, "init", "-b", plan().branchSlug]);
  await execFile("git", ["-C", repositoryRoot, "add", plan().missionBriefPath]);
  await execFile("git", ["-C", repositoryRoot, "-c", "user.name=shield", "-c", "user.email=shield@example.com", "commit", "-m", "governed fixture"]);
  const { stdout } = await execFile("git", ["-C", repositoryRoot, "rev-parse", "HEAD"]);
  const artifactRevisionId = stdout.trim();
  const publication = publicationJournalFixture({
    schemaVersion: 9,
    missionId: "mission-44",
    subjectId: "issue-44",
    headRevisionId: artifactRevisionId,
    baseRevisionId: base,
    repositoryId: "RanSolo/shield-workspace",
    canonicalRepositoryRoot: repositoryRoot,
    branch: plan().branchSlug,
    authorizedPaths: [plan().missionBriefPath],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
    operation: "publish_mission_brief",
    targetRef: `github:repository:RanSolo/shield-workspace:branch:${plan().branchSlug}:base:main`,
  });
  const entries = structuredClone(publication.entries);
  const trustedBindings = entries[0].payload.trustedBindings;
  let projection = replaySchema9(entries);
  const authorityPayload = {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: "authority:mission-44:governed",
    missionId: "mission-44",
    subjectId: "issue-44",
    seatId: "may",
    missionRevisionId: projection.brief.revisionId,
    artifactRevisionId,
    repositoryId: "RanSolo/shield-workspace",
    canonicalWritableRoot: repositoryRoot,
    branch: plan().branchSlug,
    baseRevision: base,
    headRevision: artifactRevisionId,
    modelId: "model:may:governed",
    approvedRelativePaths: ["src"],
    approvedActionIds: ["edit:implementation"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: ["effect:mission-44:implementation"],
    approvedCapabilities: ["filesystem_write"],
    validationCommandIds: ["validation:mission-44:test"],
    journalSequence: projection.lastSequence + 1,
    humanPrincipalId: trustedBindings[0].humanPrincipalId,
    humanBindingId: trustedBindings[0].bindingId,
    signingKeyRef: trustedBindings[0].signingKeyRef,
    sourceRef: "source:mission-44:implementation-authority",
    evidenceRef: "evidence:mission-44:implementation-authority",
    timestamp: { value: "2026-07-29T10:04:00Z", provenance: "humanRecorded" },
  };
  const authority = publication.signAuthorizationPayload(authorityPayload);
  entries.push(createProfileAwareImplementationAuthorityEntryV1({ projection, trustedBindings, authority }));
  projection = replaySchema9(entries);
  const sequence = projection.lastSequence + 1;
  const runtime = {
    bindingSchemaVersion: 1,
    bindingId: "binding:mission-44:may:governed",
    bindingVersion: 1,
    missionId: "mission-44",
    subjectId: "issue-44",
    missionRevisionId: projection.brief.revisionId,
    seatId: "may",
    reasoningRuntimeId: "runtime:may:governed",
    toolExecutorId: "executor:codex-workspace",
    repositoryId: authorityPayload.repositoryId,
    canonicalWritableRoot: repositoryRoot,
    branch: plan().branchSlug,
    artifactRevisionId,
    recordedAtSequence: sequence,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: ["edit:implementation"],
      effectClasses: ["behavioral_implementation", "verification"],
      effectKeys: ["effect:mission-44:implementation"],
      capabilities: ["filesystem_write"],
    },
    coulsonAuthorizationRef: "authorization:mission-44:may-binding",
  };
  const wrapper = {
    schemaVersion: 1,
    binding: runtime,
    implementationAuthorityRef: authorityPayload.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authorityPayload),
    implementationAuthoritySequence: authorityPayload.journalSequence,
    approvedRelativePaths: ["src"],
    validationCommandIds: ["validation:mission-44:test"],
    modelId: authorityPayload.modelId,
    baseRevision: base,
    headRevision: artifactRevisionId,
  };
  const authorizationPayload = {
    schemaVersion: 1,
    authorizationId: runtime.coulsonAuthorizationRef,
    missionId: "mission-44",
    subjectId: "issue-44",
    seatId: "may",
    bindingId: runtime.bindingId,
    bindingVersion: 1,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeRuntimeBindingDigest(runtime),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(wrapper),
    artifactRevisionId,
    decision: "approved",
    previousJournalSequence: sequence - 1,
    journalSequence: sequence,
    humanPrincipalId: trustedBindings[0].humanPrincipalId,
    humanBindingId: trustedBindings[0].bindingId,
    signingKeyRef: trustedBindings[0].signingKeyRef,
    sourceRef: "source:mission-44:may-binding",
    timestamp: { value: "2026-07-29T10:05:00Z", provenance: "humanRecorded" },
  };
  entries.push(createProfileAwareRuntimeBindingRecordedEntryV1({
    projection,
    trustedBindings,
    binding: wrapper,
    authorization: publication.signAuthorizationPayload(authorizationPayload),
  }));
  projection = replaySchema9(entries);
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", "mission-44");
  assert.equal(paths.state, "valid");
  await mkdir(paths.value.root, { recursive: true });
  await writeFile(paths.value.journalPath, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""), "utf8");
  const bundle = furyEvidenceBundle(passingGate({ reviewedRevisionId: artifactRevisionId }), {
    ...publication,
    request: publication.request,
  });
  return { repositoryRoot, artifactRevisionId, publication, entries, projection, bundle, journalPath: paths.value.journalPath };
}

function governedInput(current, overrides = {}) {
  return {
    artifactRevisionId: current.artifactRevisionId,
    workspacePlan: plan(),
    body: "Issue 44 governed Mission Workspace",
    missionId: "mission-44",
    subjectId: "issue-44",
    blueprintArtifact: {
      artifactId: "issue-44-blueprint",
      artifactPath: plan().missionBriefPath,
      artifactKind: "implementation_blueprint",
      owningSeatId: "may",
    },
    planGateCandidate: current.bundle.candidate,
    publicationRequestId: current.publication.requestId,
    publicationCandidateId: "candidate:mission-44:governed-publication",
    publicationSourceRef: "github:pr:45",
    publicationCapturedAt: { value: "2026-07-29T10:06:00Z", provenance: "hostTrusted" },
    repositoryRoot: current.repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionRevisionId: current.projection.brief.revisionId,
    evaluatedThroughSequence: current.projection.lastSequence,
    ...overrides,
  };
}

function governedInitialChecks(artifactRevisionId) {
  return [ok(plan().branchSlug), ok(), ok(plan().missionBriefPath), ok(artifactRevisionId), ok(artifactRevisionId)];
}

function governedScopeChecks(repositoryRoot, artifactRevisionId) {
  return [
    ok(repositoryRoot), ok("git@github.com:RanSolo/shield-workspace.git"),
    ok(plan().branchSlug), ok(artifactRevisionId), ok(base), ok(),
    ok(`${plan().missionBriefPath}\0`), ok(), ok(), ok(base),
  ];
}

function governedRun(current, finalPR = pr({ headRefOid: current.artifactRevisionId })) {
  return runner([
    ...governedInitialChecks(current.artifactRevisionId),
    ok("[]"),
    ...governedScopeChecks(current.repositoryRoot, current.artifactRevisionId),
    ok(), ok(pr({ headRefOid: current.artifactRevisionId }).url),
    ok(JSON.stringify([pr({ headRefOid: current.artifactRevisionId })])),
    ok(JSON.stringify([finalPR])),
  ]);
}

function governedOptions(current, overrides = {}) {
  return {
    run: governedRun(current),
    loadJournal: () => structuredClone(current.entries),
    loadFuryPlanReviewEvidence: () => [current.bundle.evidence],
    loadFuryDispatchReceiptEntries: () => current.bundle.entries,
    realpath: (value) => value,
    ...overrides,
  };
}

test("approval and verified draft receipt produce workspace_ready while Fury is pending", () => {
  const run = runner([
    ...initialChecks(), ok("[]"), ...scopeChecks(), ok(), ok(pr().url), ok(JSON.stringify([pr()])),
  ]);
  const result = prepareDeliveryWorkspaceForDispatch(input(), {
    run,
    loadJournal: createPublication.loadJournal,
    realpath: (value) => value,
  });

  assert.equal(result.state, "workspace_ready");
  assert.equal(result.planGateEvaluation, null);
  assert.deepEqual(result.planReviewEvidenceEvaluation.reasonCodes, ["INVALID_EVIDENCE_CANDIDATE"]);
  assert.equal(result.publicationAction, "created_draft_pr");
  assert.equal(result.publicationCandidate.candidateKind, "communication_result");
  assert.equal(result.publicationCandidate.payload.outcome, "delivered");
  assert.equal(result.publicationCandidate.payload.targetRef, createPublication.request.targetRef);
  assert.deepEqual(result.receipt, {
    schemaVersion: 1,
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug: plan().branchSlug,
    artifactRevisionId: head,
    prNumber: 45,
    prUrl: pr().url,
    state: "OPEN",
    isDraft: true,
  });
});

test("Delivery Workspace consumes a real schema-9 queued publication request", () => {
  const run = runner([
    ...initialChecks(), ok("[]"), ...scopeChecks(), ok(), ok(pr().url), ok(JSON.stringify([pr()])),
  ]);
  const result = prepareDeliveryWorkspaceForDispatch(input({
    publicationRequestId: schema9CreatePublication.requestId,
    publicationCandidateId: "candidate:mission-44:schema9-publication",
  }), {
    run,
    loadJournal: schema9CreatePublication.loadJournal,
    realpath: (value) => value,
  });
  assert.equal(result.state, "workspace_ready");
  assert.equal(result.publicationCandidate.payload.outcome, "delivered");
  assert.equal(result.publicationCandidate.payload.requestId, schema9CreatePublication.requestId);
});

test("creation, update, and verification failures deny specialist dispatch", () => {
  const creation = prepareDeliveryWorkspaceForDispatch(input(), {
    run: runner([
      ...initialChecks(), ok("[]"), ...scopeChecks(), ok(),
      { exitCode: 1, stdout: "", stderr: "denied" },
    ]),
    loadJournal: createPublication.loadJournal,
    realpath: (value) => value,
  });
  assert.equal(creation.state, "blocked");
  assert.equal(creation.reason, "pr_create_failed");
  assert.equal(creation.publicationCandidate.payload.outcome, "failed");
  assert.equal(creation.publicationCandidate.payload.requestId, createPublication.requestId);

  const update = prepareDeliveryWorkspaceForDispatch(
    input({ publicationRequestId: updatePublication.requestId }),
    {
    run: runner([
      ...initialChecks(), ok(JSON.stringify([pr()])), ...scopeChecks(), ok(),
      { exitCode: 1, stdout: "", stderr: "denied" },
    ]),
    loadJournal: updatePublication.loadJournal,
    realpath: (value) => value,
    },
  );
  assert.equal(update.state, "blocked");
  assert.equal(update.reason, "pr_update_failed");

  const verification = prepareDeliveryWorkspaceForDispatch(input(), {
    run: runner([
      ...initialChecks(), ok("[]"), ...scopeChecks(), ok(), ok(pr().url),
      ok(JSON.stringify([pr({ headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })])),
    ]),
    loadJournal: createPublication.loadJournal,
    realpath: (value) => value,
  });
  assert.equal(verification.state, "blocked");
  assert.equal(verification.reason, "created_pr_failed_readback");

  const updateVerification = prepareDeliveryWorkspaceForDispatch(
    input({ publicationRequestId: updatePublication.requestId }),
    {
    run: runner([
      ...initialChecks(), ok(JSON.stringify([pr()])), ...scopeChecks(), ok(), ok(),
      ok(JSON.stringify([pr({ headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })])),
    ]),
    loadJournal: updatePublication.loadJournal,
    realpath: (value) => value,
    },
  );
  assert.equal(updateVerification.state, "blocked");
  assert.equal(updateVerification.reason, "updated_pr_failed_readback");
});

test("repeated publication reuses and verifies the existing draft PR", () => {
  const run = runner([
    ...initialChecks(), ok(JSON.stringify([pr()])), ...scopeChecks(), ok(), ok(), ok(JSON.stringify([pr()])),
  ]);
  const result = prepareDeliveryWorkspaceForDispatch(
    input({ publicationRequestId: updatePublication.requestId }),
    {
      run,
      loadJournal: updatePublication.loadJournal,
      realpath: (value) => value,
    },
  );

  assert.equal(result.state, "workspace_ready");
  assert.equal(result.publicationAction, "updated_existing_draft_pr");
  assert.equal(result.receipt.prNumber, 45);
  assert.equal(run.calls.filter(({ args }) => args[0] === "pr" && args[1] === "create").length, 0);
  assert.equal(run.calls.filter(({ args }) => args[0] === "pr" && args[1] === "edit").length, 1);
});

test("an exact Fury PASS without durable dispatch evidence blocks after verified readback", () => {
  const bundle = furyEvidenceBundle(passingGate());
  const run = runner([
    ...initialChecks(), ok(JSON.stringify([pr()])), ...scopeChecks(), ok(), ok(), ok(JSON.stringify([pr()])),
  ]);
  const result = prepareDeliveryWorkspaceForDispatch(
    input({
      planGateCandidate: bundle.candidate,
      publicationRequestId: updatePublication.requestId,
    }),
    {
      run,
      loadJournal: updatePublication.loadJournal,
      loadFuryPlanReviewEvidence: () => [bundle.evidence],
      loadFuryDispatchReceiptEntries: () => bundle.entries,
      realpath: (value) => value,
    },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "specialist_dispatch_not_approved");
  assert.equal(run.calls.length, 19);
  assert.equal(result.commands.length, run.calls.length);
});

test("durable store readback feeds the synchronous independent loader boundary end to end", async () => {
  const bundle = furyEvidenceBundle(passingGate());
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-delivery-fury-evidence-"));
  const storeScope = {
    repositoryRoot,
    missionId: "mission-44",
    lockOwnerId: "owner:delivery-workspace-test",
  };
  const appended = await appendFuryPlanReviewEvidenceIfAbsentV1({
    ...storeScope,
    evidence: bundle.evidence,
  });
  assert.equal(appended.state, "valid");
  const readback = await readFuryPlanReviewEvidenceLedgerV1(storeScope);
  assert.equal(readback.state, "valid");
  const result = prepareDeliveryWorkspaceForDispatch(
    input({
      planGateCandidate: bundle.candidate,
      publicationRequestId: updatePublication.requestId,
    }),
    {
      run: runner([
        ...initialChecks(), ok(JSON.stringify([pr()])), ...scopeChecks(), ok(), ok(),
        ok(JSON.stringify([pr()])),
      ]),
      loadJournal: updatePublication.loadJournal,
      loadFuryPlanReviewEvidence: () => readback.value.records,
      loadFuryDispatchReceiptEntries: () => bundle.entries,
      realpath: (value) => value,
    },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "specialist_dispatch_not_approved");
});

test("bounded reconciliation remains blocked while Fury FAIL remains workspace_ready", () => {
  const reconciledBundle = furyEvidenceBundle(reconciledGate());
  const reconciled = prepareDeliveryWorkspaceForDispatch(
    input({
      planGateCandidate: reconciledBundle.candidate,
      publicationRequestId: updatePublication.requestId,
    }),
    { run: runner([
      ...initialChecks(), ok(JSON.stringify([pr()])), ...scopeChecks(), ok(), ok(),
      ok(JSON.stringify([pr()])),
    ]),
      loadJournal: updatePublication.loadJournal,
      loadFuryPlanReviewEvidence: () => [reconciledBundle.evidence],
      loadFuryDispatchReceiptEntries: () => reconciledBundle.entries,
      realpath: (value) => value },
  );
  assert.equal(reconciled.state, "blocked");
  assert.equal(reconciled.reason, "specialist_dispatch_not_approved");

  const failedGate = passingGate({
    verdict: "FAIL",
    findings: [{
      findingId: "finding-1",
      findingClass: "architecture",
      evidenceRefs: ["pr:45#fury-fail"],
    }],
  });
  const failedBundle = furyEvidenceBundle(failedGate);
  const failed = prepareDeliveryWorkspaceForDispatch(
    input({
      publicationRequestId: updatePublication.requestId,
      planGateCandidate: failedBundle.candidate,
    }),
    { run: runner([
      ...initialChecks(), ok(JSON.stringify([pr()])), ...scopeChecks(), ok(), ok(),
      ok(JSON.stringify([pr()])),
    ]),
      loadJournal: updatePublication.loadJournal,
      loadFuryPlanReviewEvidence: () => [failedBundle.evidence],
      loadFuryDispatchReceiptEntries: () => failedBundle.entries,
      realpath: (value) => value },
  );
  assert.equal(failed.state, "workspace_ready");
  assert.deepEqual(failed.planGateEvaluation.reasonCodes, ["REVIEW_FAILED"]);
});

test("malformed blueprint and caller-supplied or malformed gate input block before any command", () => {
  for (const [value, reason] of [
    [input({ blueprintArtifact: { ...input().blueprintArtifact, artifactPath: "docs/other.md" } }), "blueprint_path_mismatch"],
    [input({ planGate: passingGate() }), "delivery_workspace_input_required"],
    [input({ trainingWheelsOff: false }), "delivery_workspace_input_required"],
    [input({ planGateCandidate: { candidateSchemaVersion: 1 } }), "invalid_fury_plan_review_evidence_candidate"],
    [input({ planGateCandidate: undefined }), "invalid_fury_plan_review_evidence_candidate"],
  ]) {
    const run = runner([]);
    const result = prepareDeliveryWorkspaceForDispatch(value, { run });
    assert.equal(result.state, "blocked");
    assert.equal(result.reason, reason);
    assert.deepEqual(result.commands, []);
    assert.equal(run.calls.length, 0);
  }
  const getter = input();
  Object.defineProperty(getter.blueprintArtifact, "artifactId", { get() { throw new Error("no"); } });
  const result = prepareDeliveryWorkspaceForDispatch(getter, { run: runner([]) });
  assert.equal(result.state, "blocked");
  assert.deepEqual(result.commands, []);
});

test("Delivery Workspace preflights exact result identity before any effect", () => {
  const run = runner([]);
  const result = prepareDeliveryWorkspaceForDispatch(
    input({
      publicationCapturedAt: {
        value: "2026-07-29T10:04Z",
        provenance: "hostTrusted",
      },
    }),
    { run, loadJournal: createPublication.loadJournal },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_identity_required");
  assert.equal(run.calls.length, 0);
});

test("receipt identity and expected revision mismatches fail closed", () => {
  const receipt = {
    schemaVersion: 1,
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug: plan().branchSlug,
    artifactRevisionId: head,
    prNumber: 45,
    prUrl: pr().url,
    state: "OPEN",
    isDraft: true,
  };
  const expected = {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug: plan().branchSlug,
    artifactRevisionId: head,
    prNumber: 45,
  };
  for (const [field, value, reason] of [
    ["repositoryOwner", "Other", "receipt_repositoryOwner_mismatch"],
    ["repositoryName", "other", "receipt_repositoryName_mismatch"],
    ["baseBranch", "release", "receipt_baseBranch_mismatch"],
    ["branchSlug", "other/branch", "receipt_branchSlug_mismatch"],
    ["artifactRevisionId", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "receipt_artifactRevisionId_mismatch"],
    ["prNumber", 46, "receipt_prNumber_mismatch"],
  ]) {
    const result = validatePRWorkspaceReceipt(receipt, { ...expected, [field]: value });
    assert.equal(result.state, "invalid");
    assert.equal(result.reason, reason);
  }
  const wrongUrl = validatePRWorkspaceReceipt(
    { ...receipt, prUrl: "https://github.com/RanSolo/other/pull/45" },
    expected,
  );
  assert.equal(wrongUrl.state, "invalid");
  assert.equal(wrongUrl.reason, "receipt_prUrl_mismatch");

  const staleExpectedRevision = prepareDeliveryWorkspaceForDispatch(
    input({ artifactRevisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    { run: runner([]), loadJournal: createPublication.loadJournal },
  );
  assert.equal(staleExpectedRevision.state, "blocked");
  assert.equal(staleExpectedRevision.reason, "publication_binding_mismatch");
});

test("schema-9 create resumes by exact verification and reaches dispatch_ready without mutation", async () => {
  const current = await createGovernedFixture();
  const createRun = governedRun(current);
  const created = await prepareGovernedDeliveryWorkspaceForDispatch(
    governedInput(current, { planGateCandidate: null }),
    governedOptions(current, {
      run: createRun,
      loadFuryPlanReviewEvidence: () => [],
      loadFuryDispatchReceiptEntries: () => [],
    }),
  );
  assert.equal(created.state, "workspace_ready");
  assert.equal(created.publicationAction, "created_draft_pr");
  assert.equal(createRun.calls.length, 19);

  const exactPR = pr({
    body: "Issue 44 governed Mission Workspace",
    headRefOid: current.artifactRevisionId,
  });
  const resumeRun = runner([
    ...governedInitialChecks(current.artifactRevisionId),
    ok(JSON.stringify([exactPR])),
    ...governedScopeChecks(current.repositoryRoot, current.artifactRevisionId),
    ok(JSON.stringify([exactPR])),
  ]);
  const trace = [];
  let journalReads = 0;
  let furyReads = 0;
  let dispatchReads = 0;
  const resumed = await prepareGovernedDeliveryWorkspaceForDispatch(governedInput(current), {
    run: (...args) => {
      trace.push(args[0] === "gh" && args[1][0] === "pr" && args[1][1] === "list"
        ? "command:pr-read"
        : "command:publication");
      return resumeRun(...args);
    },
    loadJournal: () => {
      journalReads += 1;
      trace.push(`journal:${journalReads}`);
      return structuredClone(current.entries);
    },
    loadFuryPlanReviewEvidence: () => {
      furyReads += 1;
      trace.push(`fury:${furyReads}`);
      return [current.bundle.evidence];
    },
    loadFuryDispatchReceiptEntries: () => {
      dispatchReads += 1;
      trace.push(`dispatch:${dispatchReads}`);
      return current.bundle.entries;
    },
    realpath: (value) => value,
  });

  assert.equal(resumed.state, "dispatch_ready", JSON.stringify({ resumed, calls: resumeRun.calls }));
  assert.equal(resumed.publicationAction, "verified_existing_draft_pr");
  assert.equal(resumed.receipt.artifactRevisionId, current.artifactRevisionId);
  assert.equal(resumeRun.calls.length, 17);
  assert.equal(resumeRun.calls.some(({ executable, args }) =>
    executable === "git" && args[0] === "push"), false);
  assert.equal(resumeRun.calls.some(({ executable, args }) =>
    executable === "gh" && args[0] === "pr" && ["create", "edit"].includes(args[1])), false);
  assert.deepEqual(trace.slice(-4), ["journal:3", "command:pr-read", "fury:2", "dispatch:2"]);
  assert.equal(journalReads, 3);
  assert.equal(furyReads, 2);
  assert.equal(dispatchReads, 2);
});

test("governed async workspace reaches dispatch_ready when May implementation paths exclude the exact-bound blueprint", async () => {
  const current = await createGovernedFixture();
  const trace = [];
  const baseRun = governedRun(current);
  let journalReads = 0;
  let furyReads = 0;
  let dispatchReads = 0;
  const result = await prepareGovernedDeliveryWorkspaceForDispatch(governedInput(current), {
    run: (...args) => {
      trace.push(args[0] === "gh" && args[1][0] === "pr" && args[1][1] === "list" ? "command:pr-read" : "command:publication");
      return baseRun(...args);
    },
    loadJournal: () => {
      journalReads += 1;
      trace.push(`journal:${journalReads}`);
      return structuredClone(current.entries);
    },
    loadFuryPlanReviewEvidence: () => {
      furyReads += 1;
      trace.push(`fury:${furyReads}`);
      return [current.bundle.evidence];
    },
    loadFuryDispatchReceiptEntries: () => {
      dispatchReads += 1;
      trace.push(`dispatch:${dispatchReads}`);
      return current.bundle.entries;
    },
    realpath: (value) => value,
  });
  assert.equal(result.state, "dispatch_ready", JSON.stringify({ result, calls: baseRun.calls }));
  assert.equal(result.receipt.artifactRevisionId, current.artifactRevisionId);
  assert.equal(result.planReviewEvidenceEvaluation.dispatchEligibility, "eligible");
  assert.equal(result.planGateEvaluation.dispatchEligibility, "eligible");
  assert.equal(baseRun.calls.length, 20);
  assert.deepEqual(trace.slice(-4), ["journal:3", "command:pr-read", "fury:2", "dispatch:2"]);
  assert.equal(trace.at(-1), "dispatch:2");
  assert.equal(journalReads, 3);
  assert.equal(furyReads, 2);
  assert.equal(dispatchReads, 2);
});

test("governed async workspace preserves early publication while Fury is pending without loading projection", async () => {
  const current = await createGovernedFixture();
  const run = governedRun(current);
  const result = await prepareGovernedDeliveryWorkspaceForDispatch(governedInput(current, {
    planGateCandidate: null,
    configuredJournalPath: ".missing-if-authority-were-loaded",
  }), governedOptions(current, {
    run,
    loadFuryPlanReviewEvidence: () => [],
    loadFuryDispatchReceiptEntries: () => [],
  }));
  assert.equal(result.state, "workspace_ready");
  assert.equal(result.publicationAction, "created_draft_pr");
  assert.equal(run.calls.length, 19);
});

test("governed projection blocks stale sequence, missing journal, and exact root/branch/HEAD mismatches", async () => {
  const current = await createGovernedFixture();
  const stale = await prepareGovernedDeliveryWorkspaceForDispatch(
    governedInput(current, { evaluatedThroughSequence: current.projection.lastSequence - 1 }),
    governedOptions(current),
  );
  assert.equal(stale.state, "blocked");
  assert.equal(stale.reason, "seat_dispatch_projection_sequence_mismatch");

  const missing = await prepareGovernedDeliveryWorkspaceForDispatch(
    governedInput(current, { configuredJournalPath: ".missing-journal" }),
    governedOptions(current),
  );
  assert.equal(missing.state, "blocked");
  assert.equal(missing.reason, "seat_dispatch_projection_journal_invalid");

  for (const [overrides, reason] of [
    [{ repositoryRoot: `${current.repositoryRoot}-other` }, "publication_binding_mismatch"],
    [{ workspacePlan: { ...plan(), branchSlug: "agent/stale-branch" } }, "publication_binding_mismatch"],
    [{ artifactRevisionId: "dddddddddddddddddddddddddddddddddddddddd" }, "publication_binding_mismatch"],
  ]) {
    const run = runner([]);
    const result = await prepareGovernedDeliveryWorkspaceForDispatch(
      governedInput(current, overrides),
      governedOptions(current, { run }),
    );
    assert.equal(result.state, "blocked");
    assert.equal(result.reason, reason);
    assert.equal(run.calls.length, 0);
  }
});

test("governed async workspace blocks independent post-await publication, PR, and Fury drift", async () => {
  const publicationCurrent = await createGovernedFixture();
  let journalReads = 0;
  const publicationDrift = await prepareGovernedDeliveryWorkspaceForDispatch(
    governedInput(publicationCurrent),
    governedOptions(publicationCurrent, {
      loadJournal: () => {
        journalReads += 1;
        return structuredClone(journalReads < 3 ? publicationCurrent.entries : publicationCurrent.publication.entries);
      },
    }),
  );
  assert.equal(publicationDrift.state, "blocked");
  assert.equal(publicationDrift.reason, "publication_drift_after_authority_load");

  const prCurrent = await createGovernedFixture();
  const prDrift = await prepareGovernedDeliveryWorkspaceForDispatch(
    governedInput(prCurrent),
    governedOptions(prCurrent, {
      run: governedRun(prCurrent, pr({ headRefOid: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" })),
    }),
  );
  assert.equal(prDrift.state, "blocked");
  assert.match(prDrift.reason, /^final_receipt_artifactRevisionId_mismatch$/u);

  const furyCurrent = await createGovernedFixture();
  let furyReads = 0;
  const furyDrift = await prepareGovernedDeliveryWorkspaceForDispatch(
    governedInput(furyCurrent),
    governedOptions(furyCurrent, {
      loadFuryPlanReviewEvidence: () => ++furyReads === 1 ? [furyCurrent.bundle.evidence] : [],
    }),
  );
  assert.equal(furyDrift.state, "blocked");
  assert.equal(furyDrift.reason, "fury_evidence_drift_after_authority_load");
});

test("governed async input rejects caller authority, hostile shapes, and malformed projection coordinates before effects", async () => {
  const current = await createGovernedFixture();
  const authority = { ...governedInput(current), trainingWheelsOff: true };
  const accessor = governedInput(current);
  Object.defineProperty(accessor, "repositoryRoot", { enumerable: true, get() { throw new Error("must not read"); } });
  const malformedSequence = governedInput(current, { evaluatedThroughSequence: ["not-started", "running"] });
  const inherited = Object.assign(Object.create({ missionState: "approved" }), governedInput(current));
  const symbol = { ...governedInput(current), [Symbol("authority")]: "coulson" };
  const proxy = new Proxy(governedInput(current), {});
  for (const value of [authority, accessor, malformedSequence, inherited, symbol, proxy]) {
    const run = runner([]);
    const result = await prepareGovernedDeliveryWorkspaceForDispatch(value, governedOptions(current, { run }));
    assert.equal(result.state, "blocked");
    assert.equal(run.calls.length, 0);
  }
  const optionRun = runner([]);
  const optionProxy = await prepareGovernedDeliveryWorkspaceForDispatch(
    governedInput(current),
    new Proxy(governedOptions(current, { run: optionRun }), {}),
  );
  assert.equal(optionProxy.state, "blocked");
  assert.equal(optionProxy.reason, "governed_delivery_workspace_options_invalid");
  assert.equal(optionRun.calls.length, 0);
});

test("handoff rendering derives truthful names from closed seat identity", () => {
  const handoff = renderMissionHandoff({
    seatId: "may",
    kind: "implementation-start",
    summary: "May accepted the approved Issue 44 implementation scope.",
    artifactRevisionId: head,
    mission: "Issue 44 — Minimum safe executor contract",
    status: "Implementation Start",
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-44-minimum-safe-executor",
    prNumber: 66,
    prState: "Draft",
    currentOwnerSeatId: "may",
    workspaceVerification: "Verified",
    blockedState: "No",
    architectureState: "Approved",
    humanInterventions: 1,
    localSeatInvocations: 2,
    premiumAgentInvocations: 0,
    deliveryMode: "Standard S.H.I.E.L.D.",
    missionConfidence: "High",
    nextCheckpoint: "First vertical slice",
    missionContext: "May accepted the approved Issue 44 implementation scope.",
    changesSinceLastCheckpoint: "Initial implementation slice is complete.",
    completed: "Bounded executor contract implemented.",
    evidence: "Validated workspace scope and audit evidence.",
    next: "Fury conformance review.",
    risks: "No new architectural or delivery risks identified.",
    coulsonAction: "Review the draft PR.",
  });
  assert.equal(handoff.state, "valid");
  assert.match(handoff.body, /Melinda May — Implementation Start/);
  assert.match(handoff.body, /## Mission Status/);
  assert.match(handoff.body, /Mission: Issue 44 — Minimum safe executor contract/);
  assert.match(handoff.body, /Current Owner: Melinda May/);
  assert.match(handoff.body, /## Mission Context/);
  assert.match(handoff.body, /## Completed \/ Evidence \/ Next/);
  assert.match(handoff.body, /## Coulson Action/);

  assert.equal(renderMissionHandoff({
    seatId: "runtime:codex",
    kind: "implementation-start",
    summary: "A runtime cannot claim a seat.",
    artifactRevisionId: head,
  }).reason, "unknown_seat");
  assert.equal(renderMissionHandoff({
    seatId: "may",
    seatName: "Leo Fitz",
    kind: "implementation-start",
    summary: "Caller supplied attribution is rejected.",
    artifactRevisionId: head,
  }).reason, "handoff_shape_mismatch");
});
