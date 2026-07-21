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
