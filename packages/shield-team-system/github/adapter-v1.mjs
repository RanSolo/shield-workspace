import { isSafeGitHubContent } from "../contracts/workspace-contract.mjs";
import { validateAdapterCandidate } from "../dist/adapter-v1.mjs";
import { evaluateReviewPublicationV1 } from "../dist/review-publication-v1.mjs";
import {
  createOrUpdatePR,
  defaultRun,
  evaluatePRPublicationScope,
} from "./pr-workspace.mjs";
import { resolveJournaledPublicationRequest } from "./publication-gate.mjs";

const FAILURE_REASONS = new Set([
  "adapter_unavailable",
  "authentication_failed",
  "authorization_failed",
  "rate_limited",
  "timeout",
  "host_rejected",
  "not_found",
  "malformed_response",
  "ambiguous_response",
  "network_failed",
  "unknown",
]);
const WORKSPACE_PLAN_FIELDS = Object.freeze([
  "repositoryOwner",
  "repositoryName",
  "baseBranch",
  "branchSlug",
  "missionBriefPath",
  "prTitle",
]);

function blocked(reason, commands = []) {
  return { state: "blocked", reason, commands };
}

function dataValues(value, fields, exact = false) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string") ||
        fields.some((field) => !keys.includes(field)) ||
        (exact && (keys.length !== fields.length ||
          keys.some((key) => !fields.includes(key))))) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
        return null;
      }
      result[field] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function snapshotPublicationEffectInput(operation, publication) {
  if (operation === "publish_mission_brief") {
    const input = dataValues(publication, ["workspacePlan", "body"]);
    if (input === null) return null;
    const workspacePlan = dataValues(input.workspacePlan, WORKSPACE_PLAN_FIELDS, true);
    if (workspacePlan === null) return null;
    return Object.freeze({
      workspacePlan: Object.freeze(workspacePlan),
      body: input.body,
    });
  }
  const input = dataValues(publication, ["prNumber", "body", "repository"]);
  return input === null ? null : Object.freeze(input);
}

function exactPlain(value, fields) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field));
}

function classifyFinding(source) {
  if (!exactPlain(source, ["findingId", "sourceKind", "sourceRef", "headRefOid", "classification", "blocking", "summary"])) {
    return null;
  }
  const routeToSeatId = {
    implementation: "may",
    evidence: "daisy",
    architecture_conformance: "fury",
    advisory: "hill",
    false_positive: "hill",
    human_decision: "coulson",
  }[source.classification];
  if (!routeToSeatId) return null;
  return {
    findingId: source.findingId,
    sourceKind: source.sourceKind,
    sourceRef: source.sourceRef,
    headRefOid: source.headRefOid,
    classification: source.classification,
    routeToSeatId,
    blocking: source.blocking,
    requiresFuryFollowUp: source.classification === "architecture_conformance",
    summary: source.summary,
  };
}

function call(run, commands, executable, args, options) {
  let result;
  try {
    result = run(executable, args, options);
  } catch (error) {
    result = { exitCode: -1, stdout: "", stderr: String(error?.message ?? error) };
  }
  if (!result || typeof result !== "object" || !Number.isInteger(result.exitCode)) {
    result = { exitCode: -1, stdout: "", stderr: "Runner returned an invalid result." };
  }
  commands.push({ executable, args: [...args], exitCode: result.exitCode });
  return result;
}

function failureReason(result) {
  const text = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`.toLowerCase();
  if (/authenticat|not logged|credential/.test(text)) return "authentication_failed";
  if (/forbidden|permission|not authorized/.test(text)) return "authorization_failed";
  if (/rate.?limit/.test(text)) return "rate_limited";
  if (/timeout|timed out/.test(text)) return "timeout";
  if (/not found|could not resolve/.test(text)) return "not_found";
  if (/network|offline|connection|dns/.test(text)) return "network_failed";
  return "host_rejected";
}

function resultCandidate(request, publication, outcome, reason, receiptRef, scope) {
  return {
    adapterContractVersion: 2,
    adapterId: "github",
    candidateId: publication.candidateId,
    candidateKind: "communication_result",
    missionId: request.missionId,
    subjectId: request.subjectId,
    revisionId: request.revisionId,
    humanPrincipalId: null,
    bindingId: null,
    sourceRef: publication.sourceRef,
    capturedAt: publication.capturedAt,
    payload: {
      requestId: request.requestId,
      outcome,
      failureReason: reason,
      receiptRef,
      operation: request.operation,
      targetRef: request.targetRef,
      scopeDigest: scope.scopeDigest,
      publicationBinding: scope.binding,
    },
  };
}

export function createGitHubPublicationResultCandidate(
  request,
  publication,
  outcome,
  reason,
  receiptRef,
  scope,
) {
  const candidate = resultCandidate(
    request,
    publication,
    outcome,
    reason,
    receiptRef,
    scope,
  );
  const checked = validateAdapterCandidate(candidate);
  return checked.state === "valid"
    ? { state: "candidate", candidate: checked.value }
    : { state: "blocked", reason: "invalid_result_candidate" };
}

export function validateGitHubPublicationResultIdentity(resolved, publication) {
  if (!resolved || resolved.state !== "allowed") {
    return { state: "blocked", reason: "publication_request_missing" };
  }
  let snapshot;
  try {
    if (!publication || typeof publication !== "object" || Array.isArray(publication) ||
        Object.getPrototypeOf(publication) !== Object.prototype) {
      return { state: "blocked", reason: "publication_identity_required" };
    }
    const descriptors = Object.getOwnPropertyDescriptors(publication);
    const candidateId = descriptors.candidateId;
    const sourceRef = descriptors.sourceRef;
    const capturedAt = descriptors.capturedAt;
    if (!candidateId || !sourceRef || !capturedAt ||
        !("value" in candidateId) || candidateId.get || candidateId.set ||
        !("value" in sourceRef) || sourceRef.get || sourceRef.set ||
        !("value" in capturedAt) || capturedAt.get || capturedAt.set ||
        !capturedAt.value || typeof capturedAt.value !== "object" ||
        Array.isArray(capturedAt.value) ||
        Object.getPrototypeOf(capturedAt.value) !== Object.prototype) {
      return { state: "blocked", reason: "publication_identity_required" };
    }
    const time = Object.getOwnPropertyDescriptors(capturedAt.value);
    if (Reflect.ownKeys(time).length !== 2 ||
        !time.value || !("value" in time.value) || time.value.get || time.value.set ||
        !time.provenance || !("value" in time.provenance) ||
        time.provenance.get || time.provenance.set) {
      return { state: "blocked", reason: "publication_identity_required" };
    }
    snapshot = Object.freeze({
      candidateId: candidateId.value,
      sourceRef: sourceRef.value,
      capturedAt: Object.freeze({
        value: time.value.value,
        provenance: time.provenance.value,
      }),
    });
  } catch {
    return { state: "blocked", reason: "publication_identity_required" };
  }
  if (resolved.usedCandidateIds.includes(snapshot.candidateId)) {
    return { state: "blocked", reason: "duplicate_candidate" };
  }
  const authority = resolved.authority;
  const request = resolved.request;
  const scope = evaluateReviewPublicationV1(authority, {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    missionId: authority.missionId,
    subjectId: authority.subjectId,
    missionRevisionId: authority.missionRevisionId,
    repositoryId: authority.repositoryId,
    canonicalRepositoryRoot: authority.canonicalRepositoryRoot,
    branch: authority.branch,
    baseRevisionId: authority.baseRevisionId,
    headRevisionId: authority.headRevisionId,
    proposedChangedPaths: request.proposedChangedPaths,
    observedChangedPaths: request.proposedChangedPaths,
    requestedEffects: request.requestedEffects,
    observedSymlinkPaths: [],
    observedGitlinkPaths: [],
    workspaceClean: true,
  });
  if (scope.state !== "allowed") {
    return { state: "blocked", reason: "publication_binding_mismatch" };
  }
  return createGitHubPublicationResultCandidate(
    request,
    snapshot,
    "unknown",
    "unknown",
    null,
    scope,
  ).state === "candidate"
    ? { state: "valid", value: snapshot }
    : { state: "blocked", reason: "publication_identity_required" };
}

function checkedCandidate(candidate, commands) {
  const checked = validateAdapterCandidate(candidate);
  return checked.state === "valid"
    ? { state: "candidate", candidate: checked.value, commands }
    : blocked("invalid_result_candidate", commands);
}

/**
 * Performs one bounded GitHub delivery for an exact queued request selected
 * from a fully replayed durable v8 journal.
 * It never decides authority, evidence satisfaction, readiness, or completion.
 */
export function deliverGitHubCommunication(publicationRequestId, publication, options = {}) {
  const resolved = resolveJournaledPublicationRequest(publicationRequestId, {
    loadJournal: options.loadJournal,
  });
  if (resolved.state !== "allowed") return blocked(resolved.reason);
  const request = resolved.request;
  if (request.adapterId !== "github") return blocked("github_request_required");
  const publicationEffect = snapshotPublicationEffectInput(request.operation, publication);
  if (publicationEffect === null) return blocked("publication_input_required");
  const identity = validateGitHubPublicationResultIdentity(resolved, publication);
  if (identity.state !== "valid") return blocked(identity.reason);
  const publicationIdentity = identity.value;

  const run = options.run ?? defaultRun;
  const cwd = options.cwd;
  const commands = [];
  if (request.operation === "publish_mission_brief") {
    if (typeof publicationEffect.body !== "string") return blocked("mission_brief_publication_required", commands);
    const published = createOrUpdatePR(publicationEffect.workspacePlan, {
      run,
      cwd,
      body: publicationEffect.body,
      publicationRequestId,
      loadJournal: options.loadJournal,
      realpath: options.realpath,
    });
    commands.push(...published.commands);
    if (published.state === "success" || published.state === "reused") {
      return checkedCandidate(
        resultCandidate(
          request,
          publicationIdentity,
          "delivered",
          null,
          published.prUrl,
          published.publicationScope,
        ),
        commands,
      );
    }
    if (published.publicationScope) {
      const reason = FAILURE_REASONS.has(published.reason) ? published.reason : "host_rejected";
      return checkedCandidate(
        resultCandidate(
          request,
          publicationIdentity,
          "failed",
          reason,
          null,
          published.publicationScope,
        ),
        commands,
      );
    }
    return blocked(published.reason, commands);
  }

  if (!Number.isInteger(publicationEffect.prNumber) || publicationEffect.prNumber < 1 ||
      typeof publicationEffect.body !== "string") {
    return blocked("pr_publication_required", commands);
  }
  if (!isSafeGitHubContent([publicationEffect.body]).safe) return blocked("unsafe_github_content", commands);
  const repository = publicationEffect.repository;
  if (typeof repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return blocked("repository_required", commands);
  }
  if (JSON.stringify(request.requestedEffects) !== JSON.stringify(["review.comment.publish"])) {
    return blocked("publication_effect_mismatch", commands);
  }
  if (request.targetRef !== `github:pr:${publicationEffect.prNumber}`) {
    return blocked("publication_target_mismatch", commands);
  }
  const scope = evaluatePRPublicationScope(
    resolved.authority,
    request.proposedChangedPaths,
    request.requestedEffects,
    { run, cwd, realpath: options.realpath },
  );
  commands.push(...scope.commands);
  if (scope.state !== "allowed") return blocked(scope.reason, commands);
  if (scope.binding.repositoryId !== repository) return blocked("publication_binding_mismatch", commands);
  const delivered = call(
    run,
    commands,
    "gh",
    ["pr", "comment", String(publicationEffect.prNumber), "--repo", repository, "--body-file", "-"],
    { cwd, input: publicationEffect.body },
  );
  if (delivered.exitCode !== 0) {
    return checkedCandidate(resultCandidate(request, publicationIdentity, "failed", failureReason(delivered), null, scope), commands);
  }
  const receipt = delivered.stdout.trim();
  if (receipt.length === 0) {
    return checkedCandidate(resultCandidate(request, publicationIdentity, "unknown", "ambiguous_response", null, scope), commands);
  }
  return checkedCandidate(resultCandidate(request, publicationIdentity, "delivered", null, receipt, scope), commands);
}

/** Converts a GitHub review/comment record into a host-neutral candidate. */
export function createGitHubHumanEvidenceCandidate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return blocked("candidate_required");
  const candidate = {
    adapterContractVersion: 1,
    adapterId: "github",
    candidateId: input.candidateId,
    candidateKind: "human_evidence",
    missionId: input.missionId,
    subjectId: input.subjectId,
    revisionId: input.revisionId,
    humanPrincipalId: input.humanPrincipalId,
    bindingId: input.bindingId,
    sourceRef: input.sourceRef,
    capturedAt: input.capturedAt,
    payload: { evidence: input.evidence },
  };
  const checked = validateAdapterCandidate(candidate);
  return checked.state === "valid"
    ? { state: "candidate", candidate: checked.value }
    : { state: "blocked", reason: checked.code, errors: checked.errors };
}

/**
 * Converts exact-head GitHub review/check activity into a non-authoritative
 * Follow-up Mode snapshot. The adapter reports unresolved facts only; Hill and
 * the Kernel retain routing, readiness, authority, merge, and completion.
 */
export function createGitHubFollowUpCandidate(input) {
  if (!exactPlain(input, [
    "candidateId",
    "missionId",
    "subjectId",
    "revisionId",
    "sourceRef",
    "capturedAt",
    "repository",
    "branch",
    "prNumber",
    "headRefOid",
    "reviewSourceRefs",
    "findings",
  ])) {
    return blocked("follow_up_snapshot_required");
  }
  if (input.revisionId !== input.headRefOid) return blocked("follow_up_head_mismatch");
  if (!Array.isArray(input.findings) || !Array.isArray(input.reviewSourceRefs)) return blocked("follow_up_snapshot_required");

  const findings = [];
  for (const source of input.findings) {
    const finding = classifyFinding(source);
    if (!finding) return blocked("follow_up_finding_malformed");
    findings.push(finding);
  }

  const candidate = {
    adapterContractVersion: 1,
    adapterId: "github",
    candidateId: input.candidateId,
    candidateKind: "follow_up_snapshot",
    missionId: input.missionId,
    subjectId: input.subjectId,
    revisionId: input.revisionId,
    humanPrincipalId: null,
    bindingId: null,
    sourceRef: input.sourceRef,
    capturedAt: input.capturedAt,
    payload: {
      lifecycleState: findings.length === 0 ? "awaiting_review" : "follow_up_required",
      repository: input.repository,
      branch: input.branch,
      prNumber: input.prNumber,
      headRefOid: input.headRefOid,
      reviewSourceRefs: input.reviewSourceRefs,
      findings,
      replyRequirements: {
        concise: true,
        includeResolution: true,
        includeValidation: true,
        includeUnresolved: true,
      },
    },
  };
  const checked = validateAdapterCandidate(candidate);
  return checked.state === "valid"
    ? { state: "candidate", candidate: checked.value }
    : { state: "blocked", reason: checked.code, errors: checked.errors };
}
