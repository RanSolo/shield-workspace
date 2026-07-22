import { canDispatchSpecialists } from "../contracts/mission-policy.mjs";
import {
  evaluateFuryPlanGateV1,
  isFuryPlanGateArtifactPath,
  normalizeFuryPlanGateInputV1,
} from "../contracts/fury-plan-gate-v1.mjs";
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
  "missionId", "subjectId", "blueprintArtifact", "planGate",
]);
const WORKSPACE_PLAN_FIELDS = Object.freeze([
  "repositoryOwner", "repositoryName", "baseBranch", "branchSlug", "missionBriefPath", "prTitle",
]);
const BLUEPRINT_FIELDS = Object.freeze([
  "artifactId", "artifactPath", "artifactKind", "owningSeatId",
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
        !IMMUTABLE_REVISION.test(outer.artifactRevisionId)) {
      return { state: "invalid", reason: "invalid_fury_plan_gate_binding" };
    }
    const planGate = normalizeFuryPlanGateInputV1(outer.planGate);
    if (planGate.state !== "valid") {
      return { state: "invalid", reason: "invalid_fury_plan_gate_input" };
    }
    return {
      state: "valid",
      input: Object.freeze({
        ...outer,
        workspacePlan: Object.freeze(workspacePlan),
        blueprintArtifact: Object.freeze(blueprintArtifact),
        planGate: planGate.planGate,
      }),
    };
  } catch {
    return { state: "invalid", reason: "delivery_workspace_input_required" };
  }
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
  if (!canDispatchSpecialists({
    missionState: snapshot.missionState,
    approvalSource: snapshot.approvalSource,
  })) {
    return blocked("specialist_dispatch_not_approved");
  }
  const published = createOrUpdatePR(snapshot.workspacePlan, {
    run: options.run,
    cwd: options.cwd,
    body: snapshot.body,
  });
  if (published.state !== "success" && published.state !== "reused") {
    return blocked(published.reason, published.commands);
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
  const planGateEvaluation = evaluateFuryPlanGateV1(snapshot.planGate, {
    schemaVersion: 1,
    assuranceKind: "host_asserted_non_authoritative",
    missionId: snapshot.missionId,
    subjectId: snapshot.subjectId,
    repositoryOwner: checked.receipt.repositoryOwner,
    repositoryName: checked.receipt.repositoryName,
    baseBranch: checked.receipt.baseBranch,
    missionBranch: checked.receipt.branchSlug,
    prNumber: checked.receipt.prNumber,
    blueprintArtifactId: snapshot.blueprintArtifact.artifactId,
    blueprintArtifactPath: snapshot.blueprintArtifact.artifactPath,
    blueprintArtifactKind: snapshot.blueprintArtifact.artifactKind,
    blueprintOwningSeatId: snapshot.blueprintArtifact.owningSeatId,
    currentBlueprintRevisionId: checked.receipt.artifactRevisionId,
  });
  if (planGateEvaluation.dispatchEligibility !== "eligible") {
    return {
      state: "workspace_ready",
      publicationAction: published.action,
      receipt: checked.receipt,
      planGateEvaluation,
      commands: published.commands,
    };
  }
  return {
    state: "dispatch_ready",
    publicationAction: published.action,
    receipt: checked.receipt,
    planGateEvaluation,
    commands: published.commands,
  };
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
