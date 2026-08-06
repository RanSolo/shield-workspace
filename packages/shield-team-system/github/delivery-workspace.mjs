import { canDispatchSpecialists } from "../contracts/mission-policy.mjs";
import { isProxy } from "node:util/types";
import {
  isFuryPlanGateArtifactPath,
} from "../contracts/fury-plan-gate-v1.mjs";
import {
  evaluateFuryPlanReviewEvidenceV1,
  normalizeFuryPlanReviewEvidenceCandidateV1,
} from "../dist/fury-plan-review-evidence-v1.mjs";
import { canonicalJson } from "../dist/mission-v2.mjs";
import { loadSchema9SeatDispatchProjectionV1 } from "../dist/schema9-seat-dispatch-projection-v1.mjs";
import { isSafeGitHubContent } from "../contracts/workspace-contract.mjs";
import {
  createGitHubPublicationResultCandidate,
  validateGitHubPublicationResultIdentity,
} from "./adapter-v1.mjs";
import { createOrUpdatePR, defaultRun, validatePRWorkspaceReceipt } from "./pr-workspace.mjs";
import { resolveJournaledPublicationRequest } from "./publication-gate.mjs";

const SEAT_NAMES = Object.freeze({
  hill: "Maria Hill",
  daisy: "Daisy Johnson",
  fury: "Nick Fury",
  may: "Melinda May",
  fitz: "Leo Fitz",
  simmons: "Jemma Simmons",
  coulson: "Phil Coulson",
});
const HANDOFF_KINDS = new Set([
  "mission-brief",
  "reconnaissance",
  "architecture-decision",
  "implementation-start",
  "implementation-blocked",
  "implementation-complete",
  "validation",
  "sanity-review",
  "ready-for-review",
  "technical-review",
  "product-review",
  "mission-decision",
]);
const HANDOFF_OPTIONAL_FIELDS = new Set([
  "mission",
  "status",
  "repository",
  "branch",
  "prNumber",
  "prState",
  "currentOwnerSeatId",
  "workspaceVerification",
  "blockedState",
  "architectureState",
  "humanInterventions",
  "localSeatInvocations",
  "premiumAgentInvocations",
  "deliveryMode",
  "missionConfidence",
  "nextCheckpoint",
  "missionContext",
  "changesSinceLastCheckpoint",
  "completed",
  "evidence",
  "next",
  "risks",
  "coulsonAction",
]);
const IMMUTABLE_REVISION = /^[0-9a-f]{40,64}$/;
const GATE_IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._:/#@-]{0,126}[A-Za-z0-9])?$/;
const DELIVERY_INPUT_FIELDS = Object.freeze([
  "missionState", "approvalSource", "artifactRevisionId", "workspacePlan", "body",
  "missionId", "subjectId", "blueprintArtifact", "planGateCandidate", "publicationRequestId",
  "publicationCandidateId", "publicationSourceRef", "publicationCapturedAt",
]);
const WORKSPACE_PLAN_FIELDS = Object.freeze([
  "repositoryOwner", "repositoryName", "baseBranch", "branchSlug", "missionBriefPath", "prTitle",
]);
const BLUEPRINT_FIELDS = Object.freeze([
  "artifactId", "artifactPath", "artifactKind", "owningSeatId",
]);
const GOVERNED_DELIVERY_INPUT_FIELDS = Object.freeze([
  "artifactRevisionId", "workspacePlan", "body", "missionId", "subjectId",
  "blueprintArtifact", "planGateCandidate", "publicationRequestId",
  "publicationCandidateId", "publicationSourceRef", "publicationCapturedAt",
  "repositoryRoot", "configuredJournalPath", "missionRevisionId",
  "evaluatedThroughSequence",
]);
const GOVERNED_OPTION_FIELDS = new Set([
  "loadJournal", "loadFuryPlanReviewEvidence", "loadFuryDispatchReceiptEntries",
  "run", "cwd", "realpath",
]);

function blocked(reason, commands = []) {
  return { state: "blocked", reason, commands };
}

function dataRecord(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string") ||
      fields.some((field) => !keys.includes(field)) || keys.some((key) => !fields.includes(key))) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) return null;
    result[field] = descriptor.value;
  }
  return result;
}

function gateIdentifier(value) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= 128 &&
    GATE_IDENTIFIER.test(value);
}

function titleCaseKind(kind) {
  return kind.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function textOr(value, fallback) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function countOr(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? String(value) : fallback;
}

function seatLabelOr(value, fallback) {
  return typeof value === "string" && Object.hasOwn(SEAT_NAMES, value) ? SEAT_NAMES[value] : fallback;
}

function normalizeDeliveryInput(input) {
  try {
    const outer = dataRecord(input, DELIVERY_INPUT_FIELDS);
    if (outer === null) return { state: "invalid", reason: "delivery_workspace_input_required" };
    const workspacePlan = dataRecord(outer.workspacePlan, WORKSPACE_PLAN_FIELDS);
    if (workspacePlan === null) return { state: "invalid", reason: "invalid_workspace_plan" };
    if (["repositoryOwner", "repositoryName", "baseBranch", "branchSlug"].some(
      (field) => !gateIdentifier(workspacePlan[field]),
    ) || !isFuryPlanGateArtifactPath(workspacePlan.missionBriefPath) ||
        typeof workspacePlan.prTitle !== "string" || workspacePlan.prTitle.trim().length === 0) {
      return { state: "invalid", reason: "invalid_workspace_plan" };
    }
    const blueprintArtifact = dataRecord(outer.blueprintArtifact, BLUEPRINT_FIELDS);
    if (blueprintArtifact === null || !gateIdentifier(blueprintArtifact.artifactId) ||
        blueprintArtifact.artifactKind !== "implementation_blueprint" ||
        blueprintArtifact.owningSeatId !== "may" ||
        !isFuryPlanGateArtifactPath(blueprintArtifact.artifactPath)) {
      return { state: "invalid", reason: "invalid_blueprint_artifact" };
    }
    if (blueprintArtifact.artifactPath !== workspacePlan.missionBriefPath) {
      return { state: "invalid", reason: "blueprint_path_mismatch" };
    }
    if (!gateIdentifier(outer.missionId) || !gateIdentifier(outer.subjectId) ||
        !IMMUTABLE_REVISION.test(outer.artifactRevisionId) ||
        !gateIdentifier(outer.publicationRequestId) ||
        !gateIdentifier(outer.publicationCandidateId) ||
        !gateIdentifier(outer.publicationSourceRef)) {
      return { state: "invalid", reason: "invalid_fury_plan_gate_binding" };
    }
    const capturedAt = dataRecord(
      outer.publicationCapturedAt,
      ["value", "provenance"],
    );
    if (capturedAt === null) {
      return { state: "invalid", reason: "invalid_publication_candidate" };
    }
    const planGateCandidate = normalizeFuryPlanReviewEvidenceCandidateV1(outer.planGateCandidate);
    if (planGateCandidate.state !== "valid") {
      return { state: "invalid", reason: "invalid_fury_plan_review_evidence_candidate" };
    }
    return {
      state: "valid",
      input: Object.freeze({
        ...outer,
        workspacePlan: Object.freeze(workspacePlan),
        blueprintArtifact: Object.freeze(blueprintArtifact),
        publicationCapturedAt: Object.freeze(capturedAt),
        planGateCandidate: planGateCandidate.candidate,
      }),
    };
  } catch {
    return { state: "invalid", reason: "delivery_workspace_input_required" };
  }
}

function governedDataRecord(value, fields) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string") ||
        fields.some((field) => !keys.includes(field)) || keys.some((key) => !fields.includes(key))) return null;
    const output = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) return null;
      output[field] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function normalizeGovernedDeliveryInput(input) {
  const outer = governedDataRecord(input, GOVERNED_DELIVERY_INPUT_FIELDS);
  if (outer === null) return { state: "invalid", reason: "governed_delivery_workspace_input_required" };
  const workspacePlan = governedDataRecord(outer.workspacePlan, WORKSPACE_PLAN_FIELDS);
  if (workspacePlan === null) return { state: "invalid", reason: "invalid_workspace_plan" };
  const blueprintArtifact = governedDataRecord(outer.blueprintArtifact, BLUEPRINT_FIELDS);
  if (blueprintArtifact === null) return { state: "invalid", reason: "invalid_blueprint_artifact" };
  const publicationCapturedAt = governedDataRecord(outer.publicationCapturedAt, ["value", "provenance"]);
  if (publicationCapturedAt === null) return { state: "invalid", reason: "invalid_publication_candidate" };
  if (typeof outer.repositoryRoot !== "string" || outer.repositoryRoot.trim().length === 0 ||
      typeof outer.configuredJournalPath !== "string" || outer.configuredJournalPath.trim().length === 0 ||
      !gateIdentifier(outer.missionRevisionId) || !Number.isSafeInteger(outer.evaluatedThroughSequence) ||
      outer.evaluatedThroughSequence < 0) {
    return { state: "invalid", reason: "invalid_schema9_projection_binding" };
  }
  const legacy = normalizeDeliveryInput({
    missionState: "derived_from_schema9",
    approvalSource: "derived_from_schema9",
    artifactRevisionId: outer.artifactRevisionId,
    workspacePlan,
    body: outer.body,
    missionId: outer.missionId,
    subjectId: outer.subjectId,
    blueprintArtifact,
    planGateCandidate: outer.planGateCandidate,
    publicationRequestId: outer.publicationRequestId,
    publicationCandidateId: outer.publicationCandidateId,
    publicationSourceRef: outer.publicationSourceRef,
    publicationCapturedAt,
  });
  if (legacy.state !== "valid") return legacy;
  return {
    state: "valid",
    input: Object.freeze({
      ...legacy.input,
      repositoryRoot: outer.repositoryRoot.trim(),
      configuredJournalPath: outer.configuredJournalPath.trim(),
      missionRevisionId: outer.missionRevisionId,
      evaluatedThroughSequence: outer.evaluatedThroughSequence,
    }),
  };
}

function snapshotGovernedOptions(options) {
  try {
    if (options === null || typeof options !== "object" || Array.isArray(options) ||
        isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(options);
    if (keys.some((key) => typeof key !== "string" || !GOVERNED_OPTION_FIELDS.has(key))) return null;
    const snapshot = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(options, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) return null;
      snapshot[key] = descriptor.value;
    }
    if (typeof snapshot.loadJournal !== "function" ||
        typeof snapshot.loadFuryPlanReviewEvidence !== "function" ||
        typeof snapshot.loadFuryDispatchReceiptEntries !== "function" ||
        (snapshot.run !== undefined && typeof snapshot.run !== "function") ||
        (snapshot.realpath !== undefined && typeof snapshot.realpath !== "function") ||
        (snapshot.cwd !== undefined && typeof snapshot.cwd !== "string")) return null;
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function loadFuryInputs(options) {
  try {
    return {
      reviewEvidence: options.loadFuryPlanReviewEvidence(),
      receiptEntries: options.loadFuryDispatchReceiptEntries(),
    };
  } catch {
    return { reviewEvidence: undefined, receiptEntries: undefined };
  }
}

function furyExpectedBinding(snapshot, publication, receipt) {
  return {
    schemaVersion: 1,
    missionId: snapshot.missionId,
    missionRevisionId: publication.request.revisionId,
    subjectId: snapshot.subjectId,
    repositoryId: `${receipt.repositoryOwner}/${receipt.repositoryName}`,
    baseBranch: receipt.baseBranch,
    branch: receipt.branchSlug,
    prNumber: receipt.prNumber,
    blueprintArtifactId: snapshot.blueprintArtifact.artifactId,
    blueprintArtifactPath: snapshot.blueprintArtifact.artifactPath,
    blueprintArtifactKind: snapshot.blueprintArtifact.artifactKind,
    blueprintOwningSeatId: snapshot.blueprintArtifact.owningSeatId,
    artifactRevisionId: receipt.artifactRevisionId,
    repositoryRevisionId: receipt.artifactRevisionId,
  };
}

function evaluateFurySnapshot(snapshot, publication, receipt, options) {
  const fury = loadFuryInputs(options);
  return evaluateFuryPlanReviewEvidenceV1(
    snapshot.planGateCandidate,
    fury.reviewEvidence,
    fury.receiptEntries,
    furyExpectedBinding(snapshot, publication, receipt),
  );
}

function runReadOnly(run, commands, executable, args, options) {
  let result;
  try {
    result = run(executable, args, options);
  } catch (error) {
    result = { exitCode: -1, stdout: "", stderr: String(error?.message ?? error) };
  }
  if (!result || typeof result !== "object" || !Number.isInteger(result.exitCode) ||
      typeof result.stdout !== "string" || typeof result.stderr !== "string") {
    result = { exitCode: -1, stdout: "", stderr: "Runner returned an invalid result." };
  }
  commands.push({ executable, args: [...args], exitCode: result.exitCode });
  return result;
}

function readCurrentDraftPRReceipt(snapshot, expectedReceipt, options, commands) {
  const run = options.run ?? defaultRun;
  const result = runReadOnly(
    run,
    commands,
    "gh",
    [
      "pr", "list", "--repo", `${snapshot.workspacePlan.repositoryOwner}/${snapshot.workspacePlan.repositoryName}`,
      "--head", snapshot.workspacePlan.branchSlug, "--state", "all",
      "--json", "number,title,url,isDraft,state,headRefName,headRefOid,baseRefName",
    ],
    { cwd: options.cwd },
  );
  if (result.exitCode !== 0) return { state: "invalid", reason: "final_pr_read_failed" };
  let values;
  try {
    values = JSON.parse(result.stdout);
  } catch {
    return { state: "invalid", reason: "final_pr_read_invalid_json" };
  }
  if (!Array.isArray(values) || values.length !== 1) return { state: "invalid", reason: "final_pr_read_ambiguous" };
  const value = values[0];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { state: "invalid", reason: "final_pr_read_invalid" };
  const receipt = validatePRWorkspaceReceipt({
    schemaVersion: 1,
    repositoryOwner: snapshot.workspacePlan.repositoryOwner,
    repositoryName: snapshot.workspacePlan.repositoryName,
    baseBranch: value.baseRefName,
    branchSlug: value.headRefName,
    artifactRevisionId: value.headRefOid,
    prNumber: value.number,
    prUrl: value.url,
    state: value.state,
    isDraft: value.isDraft,
  }, {
    repositoryOwner: expectedReceipt.repositoryOwner,
    repositoryName: expectedReceipt.repositoryName,
    baseBranch: expectedReceipt.baseBranch,
    branchSlug: expectedReceipt.branchSlug,
    artifactRevisionId: expectedReceipt.artifactRevisionId,
    prNumber: expectedReceipt.prNumber,
  });
  return receipt.state === "valid" ? receipt : { state: "invalid", reason: `final_${receipt.reason}` };
}

function publicationMatchesProjection(snapshot, publication, receipt, projection) {
  const authority = projection.implementationAuthority.authority;
  const binding = projection.mayRuntimeBinding.binding;
  return projection.purpose === "specialist_dispatch" &&
    projection.missionAuthorization.state === "authorized" &&
    projection.profile.executionReadiness === "ready" &&
    projection.lifecycle.execution === "not-started" &&
    projection.authorityPath === "explicit_wheels_up" &&
    projection.materialGateDisposition === "not_applicable_explicit_authority" &&
    projection.missionId === snapshot.missionId &&
    projection.subjectId === snapshot.subjectId &&
    projection.missionRevisionId === snapshot.missionRevisionId &&
    projection.artifactRevisionId === snapshot.artifactRevisionId &&
    projection.evaluatedThroughSequence === snapshot.evaluatedThroughSequence &&
    publication.evaluatedThroughSequence === projection.evaluatedThroughSequence &&
    publication.request.missionId === projection.missionId &&
    publication.request.subjectId === projection.subjectId &&
    publication.request.revisionId === projection.missionRevisionId &&
    publication.request.artifactRevisionId === projection.artifactRevisionId &&
    publication.authority.missionId === projection.missionId &&
    publication.authority.subjectId === projection.subjectId &&
    publication.authority.missionRevisionId === projection.missionRevisionId &&
    publication.authority.repositoryId === authority.repositoryId &&
    publication.authority.canonicalRepositoryRoot === authority.canonicalWritableRoot &&
    publication.authority.branch === authority.branch &&
    publication.authority.baseRevisionId === authority.baseRevision &&
    publication.authority.headRevisionId === authority.headRevision &&
    authority.repositoryId === `${receipt.repositoryOwner}/${receipt.repositoryName}` &&
    authority.canonicalWritableRoot === projection.repositoryObservations[1].canonicalRoot &&
    authority.branch === receipt.branchSlug &&
    authority.headRevision === receipt.artifactRevisionId &&
    binding.binding.repositoryId === authority.repositoryId &&
    binding.binding.canonicalWritableRoot === authority.canonicalWritableRoot &&
    binding.binding.branch === authority.branch &&
    binding.binding.artifactRevisionId === authority.artifactRevisionId;
}

/**
 * Performs the Delivery Mode pre-dispatch publication gate. It consumes the
 * existing GitHub publication mechanics and returns no dispatch authorization
 * unless exact workspace readback succeeds.
 */
export function prepareDeliveryWorkspaceForDispatch(input, options = {}) {
  const normalized = normalizeDeliveryInput(input);
  if (normalized.state !== "valid") return blocked(normalized.reason);
  const snapshot = normalized.input;
  const publication = resolveJournaledPublicationRequest(
    snapshot.publicationRequestId,
    { loadJournal: options.loadJournal },
  );
  if (publication.state !== "allowed") return blocked(publication.reason);
  const publicationIdentity = {
    candidateId: snapshot.publicationCandidateId,
    sourceRef: snapshot.publicationSourceRef,
    capturedAt: snapshot.publicationCapturedAt,
  };
  const identity = validateGitHubPublicationResultIdentity(
    publication,
    publicationIdentity,
  );
  if (identity.state !== "valid") return blocked(identity.reason);
  const verifiedPublicationIdentity = identity.value;
  if (publication.request.missionId !== snapshot.missionId ||
      publication.request.subjectId !== snapshot.subjectId ||
      publication.request.artifactRevisionId !== snapshot.artifactRevisionId ||
      publication.authority.repositoryId !==
        `${snapshot.workspacePlan.repositoryOwner}/${snapshot.workspacePlan.repositoryName}` ||
      publication.authority.branch !== snapshot.workspacePlan.branchSlug) {
    return blocked("publication_binding_mismatch");
  }
  const published = createOrUpdatePR(snapshot.workspacePlan, {
    run: options.run,
    cwd: options.cwd,
    body: snapshot.body,
    publicationRequestId: snapshot.publicationRequestId,
    loadJournal: options.loadJournal,
    realpath: options.realpath,
  });
  if (published.state !== "success" && published.state !== "reused") {
    if (!published.publicationScope) {
      return blocked(published.reason, published.commands);
    }
    const candidate = createGitHubPublicationResultCandidate(
      publication.request,
      verifiedPublicationIdentity,
      "failed",
      "host_rejected",
      null,
      published.publicationScope,
    );
    return candidate.state === "candidate"
      ? {
        ...blocked(published.reason, published.commands),
        publicationCandidate: candidate.candidate,
      }
      : blocked(candidate.reason, published.commands);
  }
  const candidate = createGitHubPublicationResultCandidate(
    publication.request,
    verifiedPublicationIdentity,
    "delivered",
    null,
    published.prUrl,
    published.publicationScope,
  );
  if (candidate.state !== "candidate") {
    return blocked(candidate.reason, published.commands);
  }
  const checked = validatePRWorkspaceReceipt(published.receipt, {
    repositoryOwner: snapshot.workspacePlan.repositoryOwner,
    repositoryName: snapshot.workspacePlan.repositoryName,
    baseBranch: snapshot.workspacePlan.baseBranch,
    branchSlug: snapshot.workspacePlan.branchSlug,
    artifactRevisionId: snapshot.artifactRevisionId,
    prNumber: published.prNumber,
  });
  if (checked.state !== "valid") return blocked(checked.reason, published.commands);
  let reviewEvidence;
  let furyReceiptEntries;
  try {
    reviewEvidence = typeof options.loadFuryPlanReviewEvidence === "function"
      ? options.loadFuryPlanReviewEvidence()
      : undefined;
    furyReceiptEntries = typeof options.loadFuryDispatchReceiptEntries === "function"
      ? options.loadFuryDispatchReceiptEntries()
      : undefined;
  } catch {
    reviewEvidence = undefined;
    furyReceiptEntries = undefined;
  }
  const planReviewEvidenceEvaluation = evaluateFuryPlanReviewEvidenceV1(
    snapshot.planGateCandidate,
    reviewEvidence,
    furyReceiptEntries,
    {
      schemaVersion: 1,
      missionId: snapshot.missionId,
      missionRevisionId: publication.request.revisionId,
      subjectId: snapshot.subjectId,
      repositoryId: `${checked.receipt.repositoryOwner}/${checked.receipt.repositoryName}`,
      baseBranch: checked.receipt.baseBranch,
      branch: checked.receipt.branchSlug,
      prNumber: checked.receipt.prNumber,
      blueprintArtifactId: snapshot.blueprintArtifact.artifactId,
      blueprintArtifactPath: snapshot.blueprintArtifact.artifactPath,
      blueprintArtifactKind: snapshot.blueprintArtifact.artifactKind,
      blueprintOwningSeatId: snapshot.blueprintArtifact.owningSeatId,
      artifactRevisionId: checked.receipt.artifactRevisionId,
      repositoryRevisionId: checked.receipt.artifactRevisionId,
    },
  );
  const planGateEvaluation = planReviewEvidenceEvaluation.state === "evaluated"
    ? planReviewEvidenceEvaluation.planGateEvaluation
    : null;
  if (planReviewEvidenceEvaluation.dispatchEligibility !== "eligible") {
    return {
      state: "workspace_ready",
      publicationAction: published.action,
      receipt: checked.receipt,
      publicationCandidate: candidate.candidate,
      planReviewEvidenceEvaluation,
      planGateEvaluation,
      commands: published.commands,
    };
  }
  if (!canDispatchSpecialists({
    missionState: snapshot.missionState,
    approvalSource: snapshot.approvalSource,
  })) {
    return blocked("specialist_dispatch_not_approved", published.commands);
  }
  return {
    state: "dispatch_ready",
    publicationAction: published.action,
    receipt: checked.receipt,
    publicationCandidate: candidate.candidate,
    planReviewEvidenceEvaluation,
    planGateEvaluation,
    commands: published.commands,
  };
}

/**
 * Adds governed specialist dispatch composition without changing the legacy
 * synchronous workspace API. Publication remains early; schema-9 authority is
 * loaded only after independently attributed Fury evidence is eligible.
 */
export async function prepareGovernedDeliveryWorkspaceForDispatch(input, options = {}) {
  const normalized = normalizeGovernedDeliveryInput(input);
  if (normalized.state !== "valid") return blocked(normalized.reason);
  const trusted = snapshotGovernedOptions(options);
  if (trusted === null) return blocked("governed_delivery_workspace_options_invalid");
  const snapshot = normalized.input;

  const publication = resolveJournaledPublicationRequest(
    snapshot.publicationRequestId,
    { loadJournal: trusted.loadJournal },
  );
  if (publication.state !== "allowed") return blocked(publication.reason);
  const publicationIdentity = {
    candidateId: snapshot.publicationCandidateId,
    sourceRef: snapshot.publicationSourceRef,
    capturedAt: snapshot.publicationCapturedAt,
  };
  const identity = validateGitHubPublicationResultIdentity(publication, publicationIdentity);
  if (identity.state !== "valid") return blocked(identity.reason);
  if (publication.request.missionId !== snapshot.missionId ||
      publication.request.subjectId !== snapshot.subjectId ||
      publication.request.revisionId !== snapshot.missionRevisionId ||
      publication.request.artifactRevisionId !== snapshot.artifactRevisionId ||
      publication.authority.repositoryId !== `${snapshot.workspacePlan.repositoryOwner}/${snapshot.workspacePlan.repositoryName}` ||
      publication.authority.canonicalRepositoryRoot !== snapshot.repositoryRoot ||
      publication.authority.branch !== snapshot.workspacePlan.branchSlug) {
    return blocked("publication_binding_mismatch");
  }

  const published = createOrUpdatePR(snapshot.workspacePlan, {
    run: trusted.run,
    cwd: trusted.cwd,
    body: snapshot.body,
    publicationRequestId: snapshot.publicationRequestId,
    loadJournal: trusted.loadJournal,
    realpath: trusted.realpath,
  });
  if (published.state !== "success" && published.state !== "reused") {
    if (!published.publicationScope) return blocked(published.reason, published.commands);
    const failedCandidate = createGitHubPublicationResultCandidate(
      publication.request,
      identity.value,
      "failed",
      "host_rejected",
      null,
      published.publicationScope,
    );
    return failedCandidate.state === "candidate"
      ? { ...blocked(published.reason, published.commands), publicationCandidate: failedCandidate.candidate }
      : blocked(failedCandidate.reason, published.commands);
  }
  const candidate = createGitHubPublicationResultCandidate(
    publication.request,
    identity.value,
    "delivered",
    null,
    published.prUrl,
    published.publicationScope,
  );
  if (candidate.state !== "candidate") return blocked(candidate.reason, published.commands);
  const checked = validatePRWorkspaceReceipt(published.receipt, {
    repositoryOwner: snapshot.workspacePlan.repositoryOwner,
    repositoryName: snapshot.workspacePlan.repositoryName,
    baseBranch: snapshot.workspacePlan.baseBranch,
    branchSlug: snapshot.workspacePlan.branchSlug,
    artifactRevisionId: snapshot.artifactRevisionId,
    prNumber: published.prNumber,
  });
  if (checked.state !== "valid") return blocked(checked.reason, published.commands);

  const initialFuryEvaluation = evaluateFurySnapshot(snapshot, publication, checked.receipt, trusted);
  const initialPlanGateEvaluation = initialFuryEvaluation.state === "evaluated"
    ? initialFuryEvaluation.planGateEvaluation
    : null;
  if (initialFuryEvaluation.dispatchEligibility !== "eligible") {
    return {
      state: "workspace_ready",
      publicationAction: published.action,
      receipt: checked.receipt,
      publicationCandidate: candidate.candidate,
      planReviewEvidenceEvaluation: initialFuryEvaluation,
      planGateEvaluation: initialPlanGateEvaluation,
      commands: published.commands,
    };
  }

  const projectionResult = await loadSchema9SeatDispatchProjectionV1({
    purpose: "specialist_dispatch",
    repositoryRoot: snapshot.repositoryRoot,
    configuredJournalPath: snapshot.configuredJournalPath,
    missionId: snapshot.missionId,
    expectedSubjectId: snapshot.subjectId,
    expectedMissionRevisionId: snapshot.missionRevisionId,
    expectedEvaluatedThroughSequence: snapshot.evaluatedThroughSequence,
    trustedHostOps: {},
  });
  if (projectionResult.state !== "ready") {
    return blocked(`seat_dispatch_projection_${projectionResult.code}`, published.commands);
  }
  const projection = projectionResult.projection;
  const commands = [...published.commands];

  let finalJournalEntries;
  try {
    finalJournalEntries = trusted.loadJournal();
  } catch {
    return blocked("final_publication_journal_load_failed", commands);
  }
  const finalPublication = resolveJournaledPublicationRequest(
    snapshot.publicationRequestId,
    { loadJournal: () => finalJournalEntries },
  );
  if (finalPublication.state !== "allowed") return blocked(`final_${finalPublication.reason}`, commands);
  const finalIdentity = validateGitHubPublicationResultIdentity(finalPublication, publicationIdentity);
  if (finalIdentity.state !== "valid") return blocked(`final_${finalIdentity.reason}`, commands);
  if (canonicalJson(publication) !== canonicalJson(finalPublication)) {
    return blocked("publication_drift_after_authority_load", commands);
  }

  const finalReceipt = readCurrentDraftPRReceipt(snapshot, checked.receipt, trusted, commands);
  if (finalReceipt.state !== "valid") return blocked(finalReceipt.reason, commands);

  const finalFuryEvaluation = evaluateFurySnapshot(snapshot, finalPublication, finalReceipt.receipt, trusted);
  if (finalFuryEvaluation.dispatchEligibility !== "eligible" ||
      canonicalJson(initialFuryEvaluation) !== canonicalJson(finalFuryEvaluation)) {
    return blocked("fury_evidence_drift_after_authority_load", commands);
  }
  const finalPlanGateEvaluation = finalFuryEvaluation.state === "evaluated"
    ? finalFuryEvaluation.planGateEvaluation
    : null;
  if (finalPlanGateEvaluation?.dispatchEligibility !== "eligible") {
    return blocked("fury_plan_gate_not_eligible", commands);
  }
  if (!publicationMatchesProjection(snapshot, finalPublication, finalReceipt.receipt, projection)) {
    return blocked("seat_dispatch_projection_binding_mismatch", commands);
  }

  const dispatchReady = {
    state: "dispatch_ready",
    publicationAction: published.action,
    receipt: finalReceipt.receipt,
    publicationCandidate: candidate.candidate,
    planReviewEvidenceEvaluation: finalFuryEvaluation,
    planGateEvaluation: finalPlanGateEvaluation,
    commands,
  };
  const denied = blocked("specialist_dispatch_not_approved", commands);
  const policySnapshot = {
    missionState: "approved",
    approvalSource: "coulson",
    specialistDispatchApprovalSource: "coulson",
  };
  const allowed = canDispatchSpecialists(policySnapshot);
  return allowed ? dispatchReady : denied;
}

/** Renders attribution from a closed seat map so callers cannot relabel actors. */
export function renderMissionHandoff(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { state: "invalid", reason: "handoff_input_required" };
  }
  const fields = ["seatId", "kind", "summary", "artifactRevisionId"];
  const keys = Object.keys(input);
  if (keys.some((field) => !fields.includes(field) && !HANDOFF_OPTIONAL_FIELDS.has(field)) ||
      fields.some((field) => !Object.hasOwn(input, field))) {
    return { state: "invalid", reason: "handoff_shape_mismatch" };
  }
  const seatName = SEAT_NAMES[input.seatId];
  if (!seatName) return { state: "invalid", reason: "unknown_seat" };
  if (!HANDOFF_KINDS.has(input.kind)) return { state: "invalid", reason: "unknown_handoff_kind" };
  if (typeof input.summary !== "string" || input.summary.trim().length === 0 ||
      !IMMUTABLE_REVISION.test(input.artifactRevisionId)) {
    return { state: "invalid", reason: "handoff_value_invalid" };
  }
  if (input.currentOwnerSeatId !== undefined && !SEAT_NAMES[input.currentOwnerSeatId]) {
    return { state: "invalid", reason: "unknown_seat" };
  }
  if (input.prNumber !== undefined && (!Number.isInteger(input.prNumber) || input.prNumber < 1)) {
    return { state: "invalid", reason: "handoff_value_invalid" };
  }
  for (const field of HANDOFF_OPTIONAL_FIELDS) {
    if (field === "prNumber" || field === "humanInterventions" || field === "localSeatInvocations" || field === "premiumAgentInvocations") continue;
    if (input[field] !== undefined && typeof input[field] !== "string") {
      return { state: "invalid", reason: "handoff_value_invalid" };
    }
  }
  if (typeof input.humanInterventions !== "undefined" && (!Number.isInteger(input.humanInterventions) || input.humanInterventions < 0)) {
    return { state: "invalid", reason: "handoff_value_invalid" };
  }
  if (typeof input.localSeatInvocations !== "undefined" && (!Number.isInteger(input.localSeatInvocations) || input.localSeatInvocations < 0)) {
    return { state: "invalid", reason: "handoff_value_invalid" };
  }
  if (typeof input.premiumAgentInvocations !== "undefined" && (!Number.isInteger(input.premiumAgentInvocations) || input.premiumAgentInvocations < 0)) {
    return { state: "invalid", reason: "handoff_value_invalid" };
  }
  const body = [
    `## ${seatName} — ${titleCaseKind(input.kind)}`,
    "",
    "## Mission Status",
    "",
    `Mission: ${textOr(input.mission, "Unknown")}`,
    `Stage/Status: ${textOr(input.status, titleCaseKind(input.kind))}`,
    `Repository: ${textOr(input.repository, "Not observable")}`,
    `Branch: ${textOr(input.branch, "Not observable")}`,
    `PR: ${input.prNumber !== undefined ? `#${input.prNumber} — ${textOr(input.prState, "Unknown")}` : "Not observable"}`,
    `Current Owner: ${seatLabelOr(input.currentOwnerSeatId, "Not observable")}`,
    `Workspace: ${textOr(input.workspaceVerification, "Not observable")}`,
    `Blocked: ${textOr(input.blockedState, "Unknown")}`,
    `Architecture: ${textOr(input.architectureState, "Unknown")}`,
    `Human Interventions: ${countOr(input.humanInterventions, "Not observable")}`,
    `Local Seat Invocations: ${countOr(input.localSeatInvocations, "Not observable")}`,
    `Premium Agent Invocations: ${countOr(input.premiumAgentInvocations, "Not observable")}`,
    `Delivery Mode: ${textOr(input.deliveryMode, "Not observable")}`,
    `Mission Confidence: ${textOr(input.missionConfidence, "Not observable")}`,
    `Next Checkpoint: ${textOr(input.nextCheckpoint, "Not observable")}`,
    "",
    "## Mission Context",
    "",
    textOr(input.missionContext, input.summary.trim()),
    "",
    "## Changes Since Last Checkpoint",
    "",
    textOr(input.changesSinceLastCheckpoint, "No additional changes reported."),
    "",
    "## Completed / Evidence / Next",
    "",
    `Completed: ${textOr(input.completed, "Not observable")}`,
    `Evidence: ${textOr(input.evidence, "Not observable")}`,
    `Next: ${textOr(input.next, "Not observable")}`,
    "",
    "## Risks",
    "",
    textOr(input.risks, "No new architectural or delivery risks identified."),
    "",
    "## Coulson Action",
    "",
    textOr(input.coulsonAction, "None"),
  ].join("\n");
  if (!isSafeGitHubContent([body]).safe) {
    return { state: "invalid", reason: "unsafe_handoff_content" };
  }
  return {
    state: "valid",
    body,
  };
}
