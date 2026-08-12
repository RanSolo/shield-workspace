import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

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
    if (workspacePlan === null ||
        WORKSPACE_PLAN_FIELDS.some((field) => typeof workspacePlan[field] !== "string")) {
      return null;
    }
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

const FEATURE_INTEGRATION_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const FEATURE_INTEGRATION_REF = /^refs\/heads\/(?!main$)(?!.*(?:^|\/)\.\.?$)[A-Za-z0-9._/-]{1,255}$/u;
const FEATURE_INTEGRATION_REVISION = /^[0-9a-f]{40}$/u;

function featureIntegrationInput(input, fields) {
  const value = dataValues(input, fields, true);
  return value && FEATURE_INTEGRATION_REPOSITORY.test(value.repositoryId) &&
    typeof value.challengeId === "string" && value.challengeId.length > 0 ? value : null;
}

function featureIntegrationCall(run, executable, args, options) {
  try {
    const result = run(executable, args, options);
    return result && Number.isInteger(result.exitCode) && typeof result.stdout === "string" && typeof result.stderr === "string"
      ? result : { exitCode: -1, stdout: "", stderr: "invalid runner result" };
  } catch (error) { return { exitCode: -1, stdout: "", stderr: String(error?.message ?? error) }; }
}

function parseFeatureIntegrationJson(result) {
  if (result.exitCode !== 0) return { state: "blocked", reason: failureReason(result) };
  try { return { state: "observed", value: JSON.parse(result.stdout) }; }
  catch { return { state: "blocked", reason: "malformed_response" }; }
}

/** Observes exact repository identity, main default, merge methods and branch protection. */
export function observeFeatureIntegrationRepositoryV1(input, options = {}) {
  const value = featureIntegrationInput(input, ["repositoryId", "featureBranch", "challengeId"]);
  if (!value || typeof value.featureBranch !== "string" || value.featureBranch === "main") return { state: "blocked", reason: "invalid_repository_observation" };
  const run = options.run ?? defaultRun;
  const repository = parseFeatureIntegrationJson(featureIntegrationCall(run, "gh", ["api", `repos/${value.repositoryId}`], { cwd: options.cwd }));
  if (repository.state !== "observed" || repository.value?.full_name !== value.repositoryId || repository.value?.default_branch !== "main") return { state: "blocked", reason: repository.reason ?? "repository_identity_mismatch" };
  const protectionResult = featureIntegrationCall(run, "gh", ["api", `repos/${value.repositoryId}/branches/${encodeURIComponent(value.featureBranch)}/protection`], { cwd: options.cwd });
  let protection;
  if (protectionResult.exitCode !== 0 && /404|not found/i.test(`${protectionResult.stdout}\n${protectionResult.stderr}`)) protection = { protected: false, requiredChecks: [], enforceAdmins: false, forcePushesAllowed: null };
  else {
    const parsed = parseFeatureIntegrationJson(protectionResult); if (parsed.state !== "observed") return parsed;
    const checks = parsed.value?.required_status_checks?.contexts ?? [];
    if (!Array.isArray(checks) || checks.some((item) => typeof item !== "string")) return { state: "blocked", reason: "malformed_response" };
    protection = { protected: true, requiredChecks: [...checks].sort(), enforceAdmins: parsed.value?.enforce_admins?.enabled === true, forcePushesAllowed: parsed.value?.allow_force_pushes?.enabled === true };
  }
  const methods = [repository.value.allow_merge_commit === true ? "merge_commit" : null, repository.value.allow_rebase_merge === true ? "rebase_merge" : null, repository.value.allow_squash_merge === true ? "squash" : null].filter(Boolean);
  return { state: "observed", observation: { repositoryId: value.repositoryId, defaultBranch: "main", featureBranch: value.featureBranch, allowedIntegrationMethods: methods, protection, challengeId: value.challengeId } };
}

/** Observes one exact non-main branch ref for the feature-integration workflow. */
export function observeFeatureIntegrationRefV1(input, options = {}) {
  const value = featureIntegrationInput(input, ["repositoryId", "fullRef", "challengeId"]);
  if (!value || !FEATURE_INTEGRATION_REF.test(value.fullRef)) return { state: "blocked", reason: "invalid_ref_observation" };
  const run = options.run ?? defaultRun;
  const result = featureIntegrationCall(run, "gh", ["api", `repos/${value.repositoryId}/git/ref/${value.fullRef.slice("refs/".length)}`], { cwd: options.cwd });
  if (result.exitCode !== 0 && /not found|404/i.test(`${result.stdout}\n${result.stderr}`)) return { state: "observed", observation: { repositoryId: value.repositoryId, fullRef: value.fullRef, exists: false, headRevision: null, challengeId: value.challengeId } };
  const parsed = parseFeatureIntegrationJson(result); if (parsed.state !== "observed") return parsed;
  const record = parsed.value;
  if (!record || record.ref !== value.fullRef || !record.object || record.object.type !== "commit" || !FEATURE_INTEGRATION_REVISION.test(record.object.sha)) return { state: "blocked", reason: "malformed_response" };
  return { state: "observed", observation: { repositoryId: value.repositoryId, fullRef: value.fullRef, exists: true, headRevision: record.object.sha, challengeId: value.challengeId } };
}

/** Creates one exact feature or child branch; main and force updates are unrepresentable. */
export function createFeatureIntegrationRefV1(input, options = {}) {
  const value = featureIntegrationInput(input, ["repositoryId", "fullRef", "sourceRevision", "challengeId"]);
  if (!value || !FEATURE_INTEGRATION_REF.test(value.fullRef) || !FEATURE_INTEGRATION_REVISION.test(value.sourceRevision)) return { state: "blocked", reason: "invalid_ref_creation" };
  const run = options.run ?? defaultRun;
  const body = JSON.stringify({ ref: value.fullRef, sha: value.sourceRevision });
  const result = featureIntegrationCall(run, "gh", ["api", "--method", "POST", `repos/${value.repositoryId}/git/refs`, "--input", "-"], { cwd: options.cwd, input: body });
  if (result.exitCode !== 0) return { state: "effect_result", outcome: /already exists|422/i.test(`${result.stdout}\n${result.stderr}`) ? "uncertain" : "not_applied", reason: failureReason(result), challengeId: value.challengeId };
  const parsed = parseFeatureIntegrationJson(result);
  if (parsed.state !== "observed" || parsed.value?.ref !== value.fullRef || parsed.value?.object?.sha !== value.sourceRevision) return { state: "effect_result", outcome: "uncertain", reason: "ambiguous_response", challengeId: value.challengeId };
  return { state: "effect_result", outcome: "applied", challengeId: value.challengeId };
}

/** Observes all open PRs for an exact head/base pair without selecting among ambiguous results. */
export function observeFeatureIntegrationDraftPullRequestsV1(input, options = {}) {
  const value = featureIntegrationInput(input, ["repositoryId", "headBranch", "baseBranch", "challengeId"]);
  if (!value || typeof value.headBranch !== "string" || typeof value.baseBranch !== "string" || value.headBranch === "main") return { state: "blocked", reason: "invalid_pr_observation" };
  const run = options.run ?? defaultRun;
  const result = featureIntegrationCall(run, "gh", ["pr", "list", "--repo", value.repositoryId, "--state", "open", "--head", value.headBranch, "--base", value.baseBranch, "--json", "number,url,isDraft,headRefName,headRefOid,baseRefName"], { cwd: options.cwd });
  const parsed = parseFeatureIntegrationJson(result); if (parsed.state !== "observed" || !Array.isArray(parsed.value)) return { state: "blocked", reason: parsed.reason ?? "malformed_response" };
  const observations = parsed.value.map((item) => ({ pullRequestId: Number.isInteger(item?.number) ? String(item.number) : null, url: item?.url, draft: item?.isDraft, headBranch: item?.headRefName, headRevision: item?.headRefOid, baseBranch: item?.baseRefName }));
  if (observations.some((item) => item.pullRequestId === null || typeof item.url !== "string" || typeof item.draft !== "boolean" || item.headBranch !== value.headBranch || item.baseBranch !== value.baseBranch || !FEATURE_INTEGRATION_REVISION.test(item.headRevision))) return { state: "blocked", reason: "malformed_response" };
  return { state: "observed", observation: { repositoryId: value.repositoryId, headBranch: value.headBranch, baseBranch: value.baseBranch, pullRequests: observations, challengeId: value.challengeId } };
}

/** Creates only a draft PR for an exact non-main source branch and exact target. */
export function createFeatureIntegrationDraftPullRequestV1(input, options = {}) {
  const value = featureIntegrationInput(input, ["repositoryId", "headBranch", "baseBranch", "title", "body", "challengeId"]);
  if (!value || typeof value.headBranch !== "string" || value.headBranch === "main" || typeof value.baseBranch !== "string" || typeof value.title !== "string" || typeof value.body !== "string" || !isSafeGitHubContent([value.title, value.body]).safe) return { state: "blocked", reason: "invalid_draft_pr_creation" };
  const run = options.run ?? defaultRun;
  const result = featureIntegrationCall(run, "gh", ["pr", "create", "--repo", value.repositoryId, "--head", value.headBranch, "--base", value.baseBranch, "--draft", "--title", value.title, "--body-file", "-"], { cwd: options.cwd, input: value.body });
  if (result.exitCode !== 0) return { state: "effect_result", outcome: /already exists/i.test(`${result.stdout}\n${result.stderr}`) ? "uncertain" : "not_applied", reason: failureReason(result), challengeId: value.challengeId };
  const url = result.stdout.trim();
  return /^https:\/\/github\.com\//u.test(url) ? { state: "effect_result", outcome: "applied", receiptRef: url, challengeId: value.challengeId } : { state: "effect_result", outcome: "uncertain", reason: "ambiguous_response", challengeId: value.challengeId };
}

/** Observes one exact PR including target, draft state, mergeability and checks. */
export function observeFeatureIntegrationPullRequestV1(input, options = {}) {
  const value = featureIntegrationInput(input, ["repositoryId", "pullRequestId", "challengeId"]);
  if (!value || !Number.isInteger(value.pullRequestId) || value.pullRequestId < 1) return { state: "blocked", reason: "invalid_pr_observation" };
  const run = options.run ?? defaultRun;
  const result = featureIntegrationCall(run, "gh", ["pr", "view", String(value.pullRequestId), "--repo", value.repositoryId, "--json", "number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,mergedAt,mergeCommit"], { cwd: options.cwd });
  const parsed = parseFeatureIntegrationJson(result); if (parsed.state !== "observed") return parsed;
  const item = parsed.value;
  if (item?.number !== value.pullRequestId || typeof item.url !== "string" || typeof item.state !== "string" || typeof item.isDraft !== "boolean" || typeof item.headRefName !== "string" || !FEATURE_INTEGRATION_REVISION.test(item.headRefOid) || typeof item.baseRefName !== "string" || !Array.isArray(item.statusCheckRollup)) return { state: "blocked", reason: "malformed_response" };
  const checks = item.statusCheckRollup.map((check) => ({ id: check.context ?? check.name, status: check.conclusion ?? check.state ?? check.status }));
  if (checks.some((check) => typeof check.id !== "string" || typeof check.status !== "string")) return { state: "blocked", reason: "malformed_response" };
  return { state: "observed", observation: { repositoryId: value.repositoryId, pullRequestId: String(value.pullRequestId), url: item.url, state: item.state, draft: item.isDraft, headBranch: item.headRefName, headRevision: item.headRefOid, baseBranch: item.baseRefName, mergeable: item.mergeable, mergeStateStatus: item.mergeStateStatus, checks, mergedAt: item.mergedAt ?? null, mergeCommitRevision: item.mergeCommit?.oid ?? null, challengeId: value.challengeId } };
}

/** Observes the exact tree of one commit. */
export function observeFeatureIntegrationCommitV1(input, options = {}) {
  const value = featureIntegrationInput(input, ["repositoryId", "headRevision", "challengeId"]);
  if (!value || !FEATURE_INTEGRATION_REVISION.test(value.headRevision)) return { state: "blocked", reason: "invalid_commit_observation" };
  const run = options.run ?? defaultRun;
  const result = featureIntegrationCall(run, "gh", ["api", `repos/${value.repositoryId}/git/commits/${value.headRevision}`], { cwd: options.cwd });
  const parsed = parseFeatureIntegrationJson(result); if (parsed.state !== "observed" || parsed.value?.sha !== value.headRevision || !FEATURE_INTEGRATION_REVISION.test(parsed.value?.tree?.sha)) return { state: "blocked", reason: parsed.reason ?? "malformed_response" };
  return { state: "observed", observation: { repositoryId: value.repositoryId, headRevision: value.headRevision, treeDigest: `sha256:${createHash("sha256").update(parsed.value.tree.sha, "ascii").digest("hex")}`, gitTreeRevision: parsed.value.tree.sha, challengeId: value.challengeId } };
}

/** Integrates one already-observed child or rollback PR into a non-main feature branch. */
export function integrateFeatureIntegrationPullRequestV1(input, options = {}) {
  const value = featureIntegrationInput(input, ["repositoryId", "pullRequestId", "expectedHeadRevision", "targetFeatureBranch", "integrationMethod", "challengeId"]);
  if (!value || !Number.isInteger(value.pullRequestId) || value.pullRequestId < 1 || !FEATURE_INTEGRATION_REVISION.test(value.expectedHeadRevision) || typeof value.targetFeatureBranch !== "string" || value.targetFeatureBranch === "main" || !["merge_commit", "rebase_merge", "squash"].includes(value.integrationMethod)) return { state: "blocked", reason: "invalid_integration_request" };
  const method = { merge_commit: "merge", rebase_merge: "rebase", squash: "squash" }[value.integrationMethod];
  const run = options.run ?? defaultRun;
  const result = featureIntegrationCall(run, "gh", ["api", "--method", "PUT", `repos/${value.repositoryId}/pulls/${value.pullRequestId}/merge`, "-f", `merge_method=${method}`, "-f", `sha=${value.expectedHeadRevision}`], { cwd: options.cwd });
  if (result.exitCode !== 0) {
    const combined = `${result.stdout}\n${result.stderr}`;
    const notApplied = /conflict|not mergeable|required check|head branch was modified|405|409/i.test(combined);
    return { state: "effect_result", outcome: notApplied ? "not_applied" : "uncertain", reason: failureReason(result), challengeId: value.challengeId };
  }
  const parsed = parseFeatureIntegrationJson(result);
  if (parsed.state !== "observed" || parsed.value?.merged !== true || !FEATURE_INTEGRATION_REVISION.test(parsed.value?.sha)) return { state: "effect_result", outcome: "uncertain", reason: "ambiguous_response", challengeId: value.challengeId };
  return { state: "effect_result", outcome: "applied", resultingHeadRevision: parsed.value.sha, challengeId: value.challengeId };
}

const FEATURE_INTEGRATION_ADAPTER_REASONS_V2 = Object.freeze([
  "adapter_unavailable", "authentication_failed", "authorization_failed", "rate_limited", "timeout", "host_rejected",
  "not_found", "malformed_response", "ambiguous_response", "network_failed", "unknown",
]);
const V2_METHODS = Object.freeze(["merge_commit", "rebase_merge", "squash"]);

function exactV2(value, fields) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== fields.length) return null;
    const output = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || descriptor.value === undefined) return null;
      output[field] = descriptor.value;
    }
    return output;
  } catch { return null; }
}

function adapterOptionsV2(input) {
  const value = exactV2(input, ["run", "cwd"]);
  return value && typeof value.run === "function" && typeof value.cwd === "string" && value.cwd.length > 0 ? value : null;
}

function adapterInputV2(input, fields) {
  const value = exactV2(input, fields);
  return value && FEATURE_INTEGRATION_REPOSITORY.test(value.repositoryId) && typeof value.challengeId === "string" && value.challengeId.length > 0 ? value : null;
}

function adapterReasonV2(result) {
  const text = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}\n${result?.errorCode ?? ""}`.toLowerCase();
  if (/authenticat|not logged|credential|bad credentials/.test(text)) return "authentication_failed";
  if (/forbidden|permission|not authorized|resource not accessible/.test(text)) return "authorization_failed";
  if (/rate.?limit|secondary rate/.test(text)) return "rate_limited";
  if (/timeout|timed out|etimedout/.test(text)) return "timeout";
  if (/not found|could not resolve to|\b404\b/.test(text)) return "not_found";
  if (/unprocessable|conflict|rejected|\b4\d\d\b/.test(text)) return "host_rejected";
  if (/network|offline|connection|dns|econn|enotfound/.test(text)) return "network_failed";
  if (/enoent|not installed|command not found/.test(text)) return "adapter_unavailable";
  return "unknown";
}

function callV2(options, args) {
  let result;
  try { result = options.run("gh", args, { cwd: options.cwd, input: null }); }
  catch (error) { return { state: "blocked", reason: adapterReasonV2({ stderr: String(error?.message ?? error) }) }; }
  const value = exactV2(result, ["status", "stdout", "stderr", "errorCode"]);
  if (!value || !(value.status === null || Number.isInteger(value.status)) || typeof value.stdout !== "string" || typeof value.stderr !== "string" || !(value.errorCode === null || typeof value.errorCode === "string")) return { state: "blocked", reason: "malformed_response" };
  if (value.status !== 0) return { state: "blocked", reason: adapterReasonV2(value) };
  try { return { state: "observed", value: JSON.parse(value.stdout) }; }
  catch { return { state: "blocked", reason: "malformed_response" }; }
}

function checkStateV2(checks) {
  if (!Array.isArray(checks)) return null;
  if (checks.length === 0) return "unknown";
  const states = checks.map((check) => check?.conclusion ?? check?.state ?? check?.status);
  if (states.some((state) => typeof state !== "string")) return null;
  if (states.every((state) => /success|neutral|skipped/i.test(state))) return "successful";
  if (states.some((state) => /failure|error|cancel|timed_out|action_required/i.test(state))) return "not_successful";
  return "unknown";
}

/** Returns a closed, challenge-correlated proof for one pull request. */
export async function observeFeatureIntegrationPullRequestProofV2(input, options) {
  const value = adapterInputV2(input, ["repositoryId", "pullRequestId", "challengeId"]), configured = adapterOptionsV2(options);
  if (!value || !configured || !Number.isInteger(value.pullRequestId) || value.pullRequestId < 1) return { state: "blocked", reason: "adapter_unavailable" };
  const viewed = callV2(configured, ["pr", "view", String(value.pullRequestId), "--repo", value.repositoryId, "--json", "number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergedAt,mergeCommit,mergeMethod,statusCheckRollup,commits"]);
  if (viewed.state !== "observed") return viewed;
  const item = viewed.value;
  const checkState = checkStateV2(item?.statusCheckRollup);
  const commits = Array.isArray(item?.commits) ? item.commits.map((commit) => commit?.oid) : null;
  if (item?.number !== value.pullRequestId || typeof item.url !== "string" || !["OPEN", "CLOSED", "MERGED"].includes(item.state) || typeof item.isDraft !== "boolean" ||
      typeof item.headRefName !== "string" || !FEATURE_INTEGRATION_REVISION.test(item.headRefOid) || typeof item.baseRefName !== "string" || checkState === null ||
      !commits || commits.some((commit) => !FEATURE_INTEGRATION_REVISION.test(commit))) return { state: "blocked", reason: "malformed_response" };
  const inventory = callV2(configured, ["pr", "list", "--repo", value.repositoryId, "--state", "open", "--head", item.headRefName, "--base", item.baseRefName, "--json", "number"]);
  if (inventory.state !== "observed") return inventory;
  if (!Array.isArray(inventory.value) || inventory.value.some((pull) => !Number.isInteger(pull?.number))) return { state: "blocked", reason: "malformed_response" };
  const merged = item.state === "MERGED" || item.mergedAt !== null && item.mergedAt !== undefined;
  const mergeRevision = item.mergeCommit?.oid ?? null;
  if (merged !== (mergeRevision !== null) || (mergeRevision !== null && !FEATURE_INTEGRATION_REVISION.test(mergeRevision))) return { state: "blocked", reason: "ambiguous_response" };
  const mergeMethod = ({ MERGE: "merge_commit", REBASE: "rebase_merge", SQUASH: "squash" })[item.mergeMethod] ??
    (V2_METHODS.includes(item.mergeMethod) ? item.mergeMethod : null);
  return { state: "observed", observation: { pullRequestId: value.pullRequestId, url: item.url, state: item.state.toLowerCase(), draft: item.isDraft,
    headBranch: item.headRefName, headRevision: item.headRefOid, baseBranch: item.baseRefName, merged, mergeRevision, mergeMethod, checkState,
    conflictingPullRequestCount: inventory.value.filter((pull) => pull.number !== value.pullRequestId).length, pullRequestCommitHeads: commits } };
}

/** Returns the exact commit and tree currently named by a non-main target ref. */
export async function observeFeatureIntegrationTargetProofV2(input, options) {
  const value = adapterInputV2(input, ["repositoryId", "targetRef", "challengeId"]), configured = adapterOptionsV2(options);
  if (!value || !configured || !FEATURE_INTEGRATION_REF.test(value.targetRef)) return { state: "blocked", reason: "adapter_unavailable" };
  const ref = callV2(configured, ["api", `repos/${value.repositoryId}/git/ref/${value.targetRef.slice("refs/".length)}`]);
  if (ref.state !== "observed") return ref;
  if (ref.value?.ref !== value.targetRef || ref.value?.object?.type !== "commit" || !FEATURE_INTEGRATION_REVISION.test(ref.value?.object?.sha)) return { state: "blocked", reason: "malformed_response" };
  const commit = callV2(configured, ["api", `repos/${value.repositoryId}/git/commits/${ref.value.object.sha}`]);
  if (commit.state !== "observed") return commit;
  if (commit.value?.sha !== ref.value.object.sha || !FEATURE_INTEGRATION_REVISION.test(commit.value?.tree?.sha)) return { state: "blocked", reason: "malformed_response" };
  return { state: "observed", observation: { targetRef: value.targetRef, headRevision: ref.value.object.sha,
    treeDigest: `sha256:${createHash("sha256").update(commit.value.tree.sha, "ascii").digest("hex")}` } };
}

function commitProofV2(repositoryId, revision, options) {
  const observed = callV2(options, ["api", `repos/${repositoryId}/git/commits/${revision}`]);
  if (observed.state !== "observed") return observed;
  const parents = Array.isArray(observed.value?.parents) ? observed.value.parents.map((parent) => parent?.sha) : null;
  if (observed.value?.sha !== revision || !parents || parents.some((parent) => !FEATURE_INTEGRATION_REVISION.test(parent)) || !FEATURE_INTEGRATION_REVISION.test(observed.value?.tree?.sha)) return { state: "blocked", reason: "malformed_response" };
  return { state: "observed", value: { parents, treeDigest: `sha256:${createHash("sha256").update(observed.value.tree.sha, "ascii").digest("hex")}` } };
}

/** Proves method-specific commit ancestry independently from the merge response. */
export async function observeFeatureIntegrationCommitMethodProofV2(input, options) {
  const value = adapterInputV2(input, ["repositoryId", "headRevision", "integrationMethod", "pullRequestCommitHeads", "challengeId"]), configured = adapterOptionsV2(options);
  if (!value || !configured || !FEATURE_INTEGRATION_REVISION.test(value.headRevision) || !V2_METHODS.includes(value.integrationMethod) || !Array.isArray(value.pullRequestCommitHeads) || value.pullRequestCommitHeads.some((revision) => !FEATURE_INTEGRATION_REVISION.test(revision))) return { state: "blocked", reason: "adapter_unavailable" };
  const head = commitProofV2(value.repositoryId, value.headRevision, configured);
  if (head.state !== "observed") return head;
  const rebasedCommits = [];
  if (value.integrationMethod === "rebase_merge") {
    const chain = [];
    let current = value.headRevision;
    for (let index = value.pullRequestCommitHeads.length - 1; index >= 0; index -= 1) {
      const resultCommit = commitProofV2(value.repositoryId, current, configured);
      if (resultCommit.state !== "observed" || resultCommit.value.parents.length !== 1) return resultCommit.state === "observed" ? { state: "blocked", reason: "ambiguous_response" } : resultCommit;
      const sourceCommit = commitProofV2(value.repositoryId, value.pullRequestCommitHeads[index], configured);
      if (sourceCommit.state !== "observed") return sourceCommit;
      if (sourceCommit.value.treeDigest !== resultCommit.value.treeDigest) return { state: "blocked", reason: "ambiguous_response" };
      chain.push({ sourceCommit: value.pullRequestCommitHeads[index], resultCommit: current, parentCommit: resultCommit.value.parents[0], treeDigest: resultCommit.value.treeDigest });
      current = resultCommit.value.parents[0];
    }
    rebasedCommits.push(...chain.reverse());
  }
  return { state: "observed", observation: { headRevision: value.headRevision, resultingCommitParents: head.value.parents, rebasedCommits } };
}

export { FEATURE_INTEGRATION_ADAPTER_REASONS_V2 };
