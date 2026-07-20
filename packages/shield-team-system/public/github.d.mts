import type {
  AdapterCandidateEnvelope,
  AdapterTimestamp,
} from "../dist/adapter-v1.mjs";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  executable: string,
  args: string[],
  options?: { cwd?: string; input?: string; timeoutMs?: number },
) => CommandResult;

export interface JournaledCommunicationRequest {
  schemaVersion: 4;
  entryId: string;
  missionId: string;
  sequence: number;
  type: "communication.requested";
  timestamp: AdapterTimestamp;
  payload: { request: unknown };
}

export interface GitHubPublication {
  candidateId: string;
  sourceRef: string;
  capturedAt: AdapterTimestamp;
  body?: string;
  repository?: string;
  prNumber?: number;
  workspacePlan?: Record<string, unknown>;
}

export type GitHubAdapterResult =
  | { state: "candidate"; candidate: AdapterCandidateEnvelope; commands: Array<{ executable: string; args: string[]; exitCode: number }> }
  | { state: "blocked"; reason: string; commands: Array<{ executable: string; args: string[]; exitCode: number }> };

export interface PRWorkspaceReceipt {
  schemaVersion: 1;
  repositoryOwner: string;
  repositoryName: string;
  baseBranch: string;
  branchSlug: string;
  artifactRevisionId: string;
  prNumber: number;
  prUrl: string;
  state: "OPEN";
  isDraft: true;
}

export interface DeliveryWorkspacePlan {
  repositoryOwner: string;
  repositoryName: string;
  baseBranch: string;
  branchSlug: string;
  missionBriefPath: string;
  prTitle: string;
}

export declare const FURY_PLAN_GATE_SCHEMA_VERSION: 1;
export declare const FURY_PLAN_GATE_CONTRACT_VERSION: "fury.plan-gate.v1";
export declare const FURY_PLAN_GATE_MAX_FINDINGS: 16;
export declare const FURY_PLAN_GATE_VERDICTS: readonly [
  "PASS", "PASS_WITH_REQUIRED_CHANGES", "FAIL",
];
export type FuryPlanGateVerdict = (typeof FURY_PLAN_GATE_VERDICTS)[number];
export declare const FURY_PLAN_GATE_FINDING_CLASSES: readonly [
  "architecture", "authority", "compatibility", "replay_safety", "fail_closedness",
  "implementation_boundary", "validation_readiness", "operational_completeness",
];
export type FuryPlanGateFindingClass = (typeof FURY_PLAN_GATE_FINDING_CLASSES)[number];
export declare const FURY_PLAN_GATE_REASON_CODES: readonly [
  "INVALID_EXPECTED_BINDING", "PLAN_REVIEW_REQUIRED", "INVALID_PLAN_REVIEW",
  "REPLAY_BINDING_MISMATCH", "REVIEW_REVISION_STALE", "REVIEW_FAILED",
  "RECONCILIATION_REQUIRED", "INVALID_RECONCILIATION", "RECONCILIATION_BINDING_MISMATCH",
  "CORRECTED_REVISION_NOT_DISTINCT", "ADDITIONAL_ARCHITECTURE_CHANGE_REVIEW_REQUIRED",
  "REQUIRED_CHANGE_SET_MISMATCH", "RECONCILIATION_REVISION_STALE",
];
export type FuryPlanGateReasonCode = (typeof FURY_PLAN_GATE_REASON_CODES)[number];

export interface BlueprintArtifactAssertionV1 {
  artifactId: string;
  artifactPath: string;
  artifactKind: "implementation_blueprint";
  owningSeatId: "may";
}

export interface FuryPlanGateFindingV1 {
  findingId: string;
  findingClass: FuryPlanGateFindingClass;
  evidenceRefs: readonly string[];
}

export interface FuryPlanReviewV1 {
  reviewSchemaVersion: 1;
  contractVersion: "fury.plan-gate.v1";
  assuranceKind: "host_asserted_non_authoritative";
  reviewId: string;
  missionId: string;
  subjectId: string;
  repositoryOwner: string;
  repositoryName: string;
  baseBranch: string;
  missionBranch: string;
  prNumber: number;
  blueprintArtifactId: string;
  blueprintArtifactPath: string;
  blueprintArtifactKind: "implementation_blueprint";
  blueprintOwningSeatId: "may";
  reviewedRevisionId: string;
  verdict: FuryPlanGateVerdict;
  findings: readonly FuryPlanGateFindingV1[];
  reasoningRuntimeId: string | null;
  toolExecutorId: string | null;
}

export interface FuryPlanGateDispositionV1 {
  findingId: string;
  disposition: "incorporated";
  evidenceRefs: readonly string[];
}

export interface FuryPlanReconciliationV1 {
  reconciliationSchemaVersion: 1;
  contractVersion: "fury.plan-gate.v1";
  assuranceKind: "host_asserted_non_authoritative";
  reconciliationId: string;
  reviewId: string;
  missionId: string;
  subjectId: string;
  repositoryOwner: string;
  repositoryName: string;
  baseBranch: string;
  missionBranch: string;
  prNumber: number;
  blueprintArtifactId: string;
  blueprintArtifactPath: string;
  blueprintArtifactKind: "implementation_blueprint";
  blueprintOwningSeatId: "may";
  reviewedRevisionId: string;
  correctedRevisionId: string;
  additionalArchitectureChange: false;
  dispositions: readonly FuryPlanGateDispositionV1[];
  reasoningRuntimeId: string | null;
  toolExecutorId: string | null;
}

export interface FuryPlanGateEnvelopeV1 {
  planGateSchemaVersion: 1;
  contractVersion: "fury.plan-gate.v1";
  review: FuryPlanReviewV1;
  reconciliation: FuryPlanReconciliationV1 | null;
}

export interface FuryPlanGateExpectedBindingV1 {
  schemaVersion: 1;
  assuranceKind: "host_asserted_non_authoritative";
  missionId: string;
  subjectId: string;
  repositoryOwner: string;
  repositoryName: string;
  baseBranch: string;
  missionBranch: string;
  prNumber: number;
  blueprintArtifactId: string;
  blueprintArtifactPath: string;
  blueprintArtifactKind: "implementation_blueprint";
  blueprintOwningSeatId: "may";
  currentBlueprintRevisionId: string;
}

export type FuryPlanGateEvaluationV1 =
  | {
      state: "evaluated";
      planGateSchemaVersion: 1;
      contractVersion: "fury.plan-gate.v1";
      authority: "non_authoritative";
      evidenceAssurance: "reference_only_unverified";
      dispatchEligibility: "eligible" | "ineligible";
      reviewerSeatId: "fury";
      verifierSeatId: "hill" | null;
      verdict: FuryPlanGateVerdict | null;
      reasonCodes: readonly FuryPlanGateReasonCode[];
      binding: Readonly<FuryPlanGateExpectedBindingV1>;
      review: Readonly<FuryPlanReviewV1> | null;
      reconciliation: Readonly<FuryPlanReconciliationV1> | null;
    }
  | {
      state: "invalid";
      planGateSchemaVersion: 1;
      authority: "non_authoritative";
      dispatchEligibility: "ineligible";
      reasonCodes: readonly FuryPlanGateReasonCode[];
    };

export type DeliveryWorkspaceResult =
  | {
      state: "workspace_ready";
      publicationAction: "created_draft_pr" | "updated_existing_draft_pr";
      receipt: PRWorkspaceReceipt;
      planGateEvaluation: FuryPlanGateEvaluationV1;
      commands: Array<{ executable: string; args: string[]; exitCode: number }>;
    }
  | {
      state: "dispatch_ready";
      publicationAction: "created_draft_pr" | "updated_existing_draft_pr";
      receipt: PRWorkspaceReceipt;
      planGateEvaluation: FuryPlanGateEvaluationV1;
      commands: Array<{ executable: string; args: string[]; exitCode: number }>;
    }
  | {
      state: "blocked";
      reason: string;
      commands: Array<{ executable: string; args: string[]; exitCode: number }>;
    };

export function deliverGitHubCommunication(
  journaledRequest: JournaledCommunicationRequest,
  publication: GitHubPublication,
  options?: { run?: CommandRunner; cwd?: string },
): GitHubAdapterResult;

export function createGitHubHumanEvidenceCandidate(input: {
  candidateId: string;
  missionId: string;
  subjectId: string;
  revisionId: string;
  humanPrincipalId: string;
  bindingId: string;
  sourceRef: string;
  capturedAt: AdapterTimestamp;
  evidence: unknown;
}): { state: "candidate"; candidate: AdapterCandidateEnvelope } | { state: "blocked"; reason: string; errors: string[] };

export function prepareDeliveryWorkspaceForDispatch(
  input: {
    missionState: string;
    approvalSource: string;
    artifactRevisionId: string;
    workspacePlan: DeliveryWorkspacePlan;
    body: string;
    missionId: string;
    subjectId: string;
    blueprintArtifact: BlueprintArtifactAssertionV1;
    planGate: FuryPlanGateEnvelopeV1 | null;
  },
  options?: { run?: CommandRunner; cwd?: string },
): DeliveryWorkspaceResult;

export function evaluateFuryPlanGateV1(
  planGate: unknown,
  expected: unknown,
): FuryPlanGateEvaluationV1;

export function validatePRWorkspaceReceipt(
  receipt: unknown,
  expected: {
    repositoryOwner: string;
    repositoryName: string;
    baseBranch: string;
    branchSlug: string;
    artifactRevisionId: string;
    prNumber?: number;
  },
): { state: "valid"; receipt: PRWorkspaceReceipt } | { state: "invalid"; reason: string };

export function renderMissionHandoff(input: {
  seatId: "hill" | "daisy" | "fury" | "may" | "fitz" | "simmons" | "coulson";
  kind:
    | "mission-brief"
    | "reconnaissance"
    | "architecture-decision"
    | "implementation-start"
    | "implementation-blocked"
    | "implementation-complete"
    | "validation"
    | "sanity-review"
    | "ready-for-review"
    | "technical-review"
    | "product-review"
    | "mission-decision";
  summary: string;
  artifactRevisionId: string;
}): { state: "valid"; body: string } | { state: "invalid"; reason: string };
