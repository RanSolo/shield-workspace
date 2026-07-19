import { isSafeGitHubContent } from "../contracts/workspace-contract.mjs";
import {
  validateAdapterCandidate,
  validateCommunicationRequest,
} from "../dist/adapter-v1.mjs";
import { createOrUpdatePR, defaultRun } from "./pr-workspace.mjs";

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

function blocked(reason, commands = []) {
  return { state: "blocked", reason, commands };
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

function resultCandidate(request, publication, outcome, reason, receiptRef) {
  return {
    adapterContractVersion: 1,
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
    },
  };
}

function checkedCandidate(candidate, commands) {
  const checked = validateAdapterCandidate(candidate);
  return checked.state === "valid"
    ? { state: "candidate", candidate: checked.value, commands }
    : blocked("invalid_result_candidate", commands);
}

function validateJournaledRequest(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
      entry.schemaVersion !== 4 || entry.type !== "communication.requested" ||
      !entry.payload || typeof entry.payload !== "object" || Array.isArray(entry.payload)) {
    return { state: "invalid", reason: "journaled_request_required" };
  }
  const entryFields = ["schemaVersion", "entryId", "missionId", "sequence", "type", "timestamp", "payload"];
  const payloadFields = ["request"];
  if (Object.keys(entry).length !== entryFields.length || entryFields.some((field) => !Object.hasOwn(entry, field)) ||
      Object.keys(entry.payload).length !== payloadFields.length || payloadFields.some((field) => !Object.hasOwn(entry.payload, field)) ||
      !Number.isInteger(entry.sequence) || entry.sequence < 1 ||
      entry.entryId !== `entry:${entry.missionId}:${entry.sequence}` ||
      !entry.timestamp || typeof entry.timestamp !== "object" || Array.isArray(entry.timestamp)) {
    return { state: "invalid", reason: "journaled_request_required" };
  }
  const checked = validateCommunicationRequest(entry.payload.request);
  if (checked.state === "invalid") return { state: "invalid", reason: "invalid_communication_request" };
  if (entry.missionId !== checked.value.missionId) return { state: "invalid", reason: "journaled_request_mission_mismatch" };
  return { state: "valid", request: checked.value };
}

/**
 * Performs one bounded GitHub delivery for an already journaled v4 request.
 * It never decides authority, evidence satisfaction, readiness, or completion.
 */
export function deliverGitHubCommunication(journaledRequest, publication, options = {}) {
  const checked = validateJournaledRequest(journaledRequest);
  if (checked.state === "invalid") return blocked(checked.reason);
  const request = checked.request;
  if (request.adapterId !== "github") return blocked("github_request_required");
  if (!publication || typeof publication !== "object" || Array.isArray(publication)) return blocked("publication_required");
  if (typeof publication.candidateId !== "string" || typeof publication.sourceRef !== "string" ||
      !publication.capturedAt || typeof publication.capturedAt !== "object") return blocked("publication_identity_required");

  const run = options.run ?? defaultRun;
  const cwd = options.cwd;
  const commands = [];
  const head = call(run, commands, "git", ["rev-parse", "HEAD"], { cwd });
  if (head.exitCode !== 0) {
    return checkedCandidate(resultCandidate(request, publication, "failed", failureReason(head), null), commands);
  }
  if (head.stdout.trim() !== request.artifactRevisionId) {
    return checkedCandidate(resultCandidate(request, publication, "failed", "ambiguous_response", null), commands);
  }

  if (request.operation === "publish_mission_brief") {
    if (!publication.workspacePlan || typeof publication.body !== "string") return blocked("mission_brief_publication_required", commands);
    const published = createOrUpdatePR(publication.workspacePlan, { run, cwd, body: publication.body });
    commands.push(...published.commands);
    if (published.state === "success" || published.state === "reused") {
      return checkedCandidate(resultCandidate(request, publication, "delivered", null, published.prUrl), commands);
    }
    const reason = FAILURE_REASONS.has(published.reason) ? published.reason : "host_rejected";
    return checkedCandidate(resultCandidate(request, publication, "failed", reason, null), commands);
  }

  if (!Number.isInteger(publication.prNumber) || publication.prNumber < 1 || typeof publication.body !== "string") {
    return blocked("pr_publication_required", commands);
  }
  if (!isSafeGitHubContent([publication.body]).safe) return blocked("unsafe_github_content", commands);
  const repository = publication.repository;
  if (typeof repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return blocked("repository_required", commands);
  }
  const delivered = call(
    run,
    commands,
    "gh",
    ["pr", "comment", String(publication.prNumber), "--repo", repository, "--body-file", "-"],
    { cwd, input: publication.body },
  );
  if (delivered.exitCode !== 0) {
    return checkedCandidate(resultCandidate(request, publication, "failed", failureReason(delivered), null), commands);
  }
  const receipt = delivered.stdout.trim();
  if (receipt.length === 0) {
    return checkedCandidate(resultCandidate(request, publication, "unknown", "ambiguous_response", null), commands);
  }
  return checkedCandidate(resultCandidate(request, publication, "delivered", null, receipt), commands);
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
