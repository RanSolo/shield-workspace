import { canDispatchSpecialists } from "../contracts/mission-policy.mjs";
import { isSafeGitHubContent } from "../contracts/workspace-contract.mjs";
import { createOrUpdatePR, validatePRWorkspaceReceipt } from "./pr-workspace.mjs";

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
const IMMUTABLE_REVISION = /^[0-9a-f]{40,64}$/;

function blocked(reason, commands = []) {
  return { state: "blocked", reason, commands };
}

/**
 * Performs the Delivery Mode pre-dispatch publication gate. It consumes the
 * existing GitHub publication mechanics and returns no dispatch authorization
 * unless exact workspace readback succeeds.
 */
export function prepareDeliveryWorkspaceForDispatch(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return blocked("delivery_workspace_input_required");
  }
  if (!canDispatchSpecialists({
    missionState: input.missionState,
    approvalSource: input.approvalSource,
  })) {
    return blocked("specialist_dispatch_not_approved");
  }
  const published = createOrUpdatePR(input.workspacePlan, {
    run: options.run,
    cwd: options.cwd,
    body: input.body,
  });
  if (published.state !== "success" && published.state !== "reused") {
    return blocked(published.reason, published.commands);
  }
  const checked = validatePRWorkspaceReceipt(published.receipt, {
    repositoryOwner: input.workspacePlan?.repositoryOwner,
    repositoryName: input.workspacePlan?.repositoryName,
    baseBranch: input.workspacePlan?.baseBranch,
    branchSlug: input.workspacePlan?.branchSlug,
    artifactRevisionId: input.artifactRevisionId,
    prNumber: published.prNumber,
  });
  if (checked.state !== "valid") return blocked(checked.reason, published.commands);
  return {
    state: "dispatch_ready",
    publicationAction: published.action,
    receipt: checked.receipt,
    commands: published.commands,
  };
}

/** Renders attribution from a closed seat map so callers cannot relabel actors. */
export function renderMissionHandoff(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { state: "invalid", reason: "handoff_input_required" };
  }
  const fields = ["seatId", "kind", "summary", "artifactRevisionId"];
  if (Object.keys(input).length !== fields.length || fields.some((field) => !Object.hasOwn(input, field))) {
    return { state: "invalid", reason: "handoff_shape_mismatch" };
  }
  const seatName = SEAT_NAMES[input.seatId];
  if (!seatName) return { state: "invalid", reason: "unknown_seat" };
  if (!HANDOFF_KINDS.has(input.kind)) return { state: "invalid", reason: "unknown_handoff_kind" };
  if (typeof input.summary !== "string" || input.summary.trim().length === 0 ||
      !IMMUTABLE_REVISION.test(input.artifactRevisionId)) {
    return { state: "invalid", reason: "handoff_value_invalid" };
  }
  if (!isSafeGitHubContent([input.summary]).safe) {
    return { state: "invalid", reason: "unsafe_handoff_content" };
  }
  return {
    state: "valid",
    body: [
      `## ${seatName} — ${input.kind}`,
      "",
      `- **Seat:** \`${input.seatId}\``,
      `- **Artifact revision:** \`${input.artifactRevisionId}\``,
      "",
      input.summary.trim(),
    ].join("\n"),
  };
}
