import type {
  AdapterCandidateEnvelope,
  AdapterTimestamp,
} from "../dist/adapter-v1.mjs";
import type {
  ReviewPublicationBindingV1,
} from "../dist/review-publication-v1.mjs";
import type {
  FuryPlanReviewEvidenceCandidateV1,
  FuryPlanReviewEvidenceEvaluationV1,
} from "../dist/fury-plan-review-evidence-v1.mjs";
import type {
  FeatureObservationChallengeV2,
  FeatureIntegrationReplayProjectionV2,
  FeatureIntegrationTrustAnchorV2,
  FeatureOperationJournalV2,
  FeatureTransitionRequestV2,
  SignedFeatureAdmissionObservationV2,
  SignedFeatureExpiryObservationV2,
  SignedFeatureObservationChallengeV2,
  SignedFeatureTransitionObservationV2,
  SignedFeatureWorkspaceObservationV2,
} from "../dist/feature-integration-v1.mjs";

export * from "../dist/review-publication-v1.mjs";
export {
  FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION,
  FURY_PLAN_REVIEW_EVIDENCE_REASON_CODES,
  FURY_PLAN_REVIEW_EVIDENCE_SCHEMA_VERSION,
  evaluateFuryPlanReviewEvidenceV1,
  replayFuryPlanReviewEvidenceLedgerV1,
} from "../dist/fury-plan-review-evidence-v1.mjs";
export type {
  FuryPlanReviewEvidenceCandidateV1,
  FuryPlanReviewEvidenceEvaluationV1,
} from "../dist/fury-plan-review-evidence-v1.mjs";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface FeatureIntegrationGitHubRefObservationV1 {
  repositoryId: string;
  fullRef: string;
  exists: boolean;
  headRevision: string | null;
  challengeId: string;
}

export interface FeatureIntegrationGitHubPullRequestObservationV1 {
  pullRequestId: string;
  url: string;
  draft: boolean;
  headBranch: string;
  headRevision: string;
  baseBranch: string;
}

export type FeatureIntegrationGitHubEffectResultV1 =
  | { state: "effect_result"; outcome: "applied"; challengeId: string; receiptRef?: string }
  | { state: "effect_result"; outcome: "not_applied" | "uncertain"; challengeId: string; reason: string }
  | { state: "blocked"; reason: string };

export function observeFeatureIntegrationRefV1(input: { repositoryId: string; fullRef: string; challengeId: string }, options?: { run?: CommandRunner; cwd?: string }):
  { state: "observed"; observation: FeatureIntegrationGitHubRefObservationV1 } | { state: "blocked"; reason: string };
export function createFeatureIntegrationRefV1(input: { repositoryId: string; fullRef: string; sourceRevision: string; challengeId: string }, options?: { run?: CommandRunner; cwd?: string }): FeatureIntegrationGitHubEffectResultV1;
export function observeFeatureIntegrationRepositoryV1(input: { repositoryId: string; featureBranch: string; challengeId: string }, options?: { run?: CommandRunner; cwd?: string }): { state: "observed"; observation: Record<string, unknown> } | { state: "blocked"; reason: string };
export function observeFeatureIntegrationDraftPullRequestsV1(input: { repositoryId: string; headBranch: string; baseBranch: string; challengeId: string }, options?: { run?: CommandRunner; cwd?: string }):
  { state: "observed"; observation: { repositoryId: string; headBranch: string; baseBranch: string; pullRequests: FeatureIntegrationGitHubPullRequestObservationV1[]; challengeId: string } } | { state: "blocked"; reason: string };
export function createFeatureIntegrationDraftPullRequestV1(input: { repositoryId: string; headBranch: string; baseBranch: string; title: string; body: string; challengeId: string }, options?: { run?: CommandRunner; cwd?: string }): FeatureIntegrationGitHubEffectResultV1;
export function observeFeatureIntegrationPullRequestV1(input: { repositoryId: string; pullRequestId: number; challengeId: string }, options?: { run?: CommandRunner; cwd?: string }): { state: "observed"; observation: Record<string, unknown> } | { state: "blocked"; reason: string };
export function observeFeatureIntegrationCommitV1(input: { repositoryId: string; headRevision: string; challengeId: string }, options?: { run?: CommandRunner; cwd?: string }): { state: "observed"; observation: { repositoryId: string; headRevision: string; treeDigest: string; gitTreeRevision: string; challengeId: string } } | { state: "blocked"; reason: string };
export function integrateFeatureIntegrationPullRequestV1(input: { repositoryId: string; pullRequestId: number; expectedHeadRevision: string; targetFeatureBranch: string; integrationMethod: "merge_commit" | "rebase_merge" | "squash"; challengeId: string }, options?: { run?: CommandRunner; cwd?: string }): FeatureIntegrationGitHubEffectResultV1;

export type FeatureIntegrationAdapterReasonV2 = "adapter_unavailable" | "authentication_failed" | "authorization_failed" | "rate_limited" | "timeout" | "host_rejected" | "not_found" | "malformed_response" | "ambiguous_response" | "network_failed" | "unknown";
export declare const FEATURE_INTEGRATION_ADAPTER_REASONS_V2: readonly FeatureIntegrationAdapterReasonV2[];
export interface FeatureIntegrationAdapterOptionsV2 {
  run: (command: string, args: readonly string[], options: { cwd: string; input: string | null }) => { status: number | null; stdout: string; stderr: string; errorCode: string | null };
  cwd: string;
}
export type FeatureIntegrationAdapterResultV2<T> = { state: "observed"; observation: T } | { state: "blocked"; reason: FeatureIntegrationAdapterReasonV2 };
export interface FeatureIntegrationPullRequestProofV2 {
  pullRequestId: number; url: string; state: "open" | "closed" | "merged"; draft: boolean; headBranch: string; headRevision: string; baseBranch: string;
  merged: boolean; mergeRevision: string | null;
  checkState: "successful" | "not_successful" | "unknown"; conflictingPullRequestCount: number; pullRequestCommitHeads: readonly string[];
}
export interface FeatureIntegrationTargetProofV2 { targetRef: string; headRevision: string; treeDigest: string }
export interface FeatureIntegrationCommitMethodProofV2 { headRevision: string; integrationMethodEvidence: "verified" | "ambiguous"; resultingCommitParents: readonly string[]; rebasedCommits: readonly { sourceCommit: string; resultCommit: string; parentCommit: string; treeDigest: string }[] }
export function observeFeatureIntegrationPullRequestProofV2(input: { repositoryId: string; pullRequestId: number; challengeId: string }, options: FeatureIntegrationAdapterOptionsV2): Promise<FeatureIntegrationAdapterResultV2<FeatureIntegrationPullRequestProofV2>>;
export function observeFeatureIntegrationTargetProofV2(input: { repositoryId: string; targetRef: string; challengeId: string }, options: FeatureIntegrationAdapterOptionsV2): Promise<FeatureIntegrationAdapterResultV2<FeatureIntegrationTargetProofV2>>;
export function observeFeatureIntegrationCommitMethodProofV2(input: { repositoryId: string; headRevision: string; priorHeadRevision: string; integrationMethod: "merge_commit" | "rebase_merge" | "squash"; pullRequestCommitHeads: readonly string[]; challengeId: string }, options: FeatureIntegrationAdapterOptionsV2): Promise<FeatureIntegrationAdapterResultV2<FeatureIntegrationCommitMethodProofV2>>;
export function integrateFeatureIntegrationPullRequestV2(input: { repositoryId: string; pullRequestId: number; expectedHeadRevision: string; targetFeatureBranch: string; integrationMethod: "merge_commit" | "rebase_merge" | "squash"; challengeId: string }, options: FeatureIntegrationAdapterOptionsV2): Promise<{ state: "effect_result"; outcome: "applied" | "not_applied" | "uncertain"; resultingHeadRevision?: string; reason?: FeatureIntegrationAdapterReasonV2 } | { state: "blocked"; reason: FeatureIntegrationAdapterReasonV2 }>;

export interface FeatureGitHubObservationProducerConfigV2 {
  adapterOptions: FeatureIntegrationAdapterOptionsV2;
  producerId: string;
  signEnvelope: (domain: string, payload: unknown) => Promise<{ payload: unknown; signatureBase64: string }>;
  clock: () => string;
}
export interface FeatureGitHubObservationProducerV2 {
  signChallenge(input: FeatureObservationChallengeV2): Promise<SignedFeatureObservationChallengeV2>;
  executeTransition(input: { request: FeatureTransitionRequestV2; preparationEntryDigest: string; signedChallenge?: SignedFeatureObservationChallengeV2 }): Promise<unknown>;
  observeAndSignWorkspace(input: unknown): Promise<SignedFeatureWorkspaceObservationV2>;
  observeAndSignTransition(input: { request: FeatureTransitionRequestV2; preparationEntryDigest: string; signedChallenge?: SignedFeatureObservationChallengeV2; expectedRestoredTreeDigest?: string }): Promise<SignedFeatureTransitionObservationV2>;
  observeAndSignAdmission(input: unknown): Promise<SignedFeatureAdmissionObservationV2>;
  observeAndSignExpiry(input: unknown): Promise<SignedFeatureExpiryObservationV2>;
}
export function createGitHubFeatureObservationProducerV2(config: FeatureGitHubObservationProducerConfigV2): { state: "ready"; producer: FeatureGitHubObservationProducerV2 } | { state: "unavailable"; reason: "producer_unavailable" };

export type FeatureOperationJournalStoreResultV2<T> =
  | { state: "accepted"; value: Readonly<T> }
  | { state: "blocked"; reason: string }
  | { state: "recovery_required"; reason: "durability_uncertain" };
export interface FeatureOperationJournalStoreV2 {
  initializeJournal(input: { journal: FeatureOperationJournalV2 }): Promise<FeatureOperationJournalStoreResultV2<{ journal: FeatureOperationJournalV2; bytes: string; journalPath: string }>>;
  readJournal(): Promise<FeatureOperationJournalStoreResultV2<{ journal: FeatureOperationJournalV2 | null; bytes: string; journalPath: string }>>;
  appendEntry(input: { expectedJournalDigest: string; expectedEntrySequence: number; expectedLatestEntryDigest: string; entry: FeatureOperationJournalV2["entries"][number] }): Promise<FeatureOperationJournalStoreResultV2<{ journal: FeatureOperationJournalV2; bytes: string; journalPath: string }>>;
  recoverJournal(input: { baselineJournalDigest: string; candidateJournalDigest: string }): Promise<FeatureOperationJournalStoreResultV2<{ classification: "unchanged_baseline" | "complete_candidate"; journal: FeatureOperationJournalV2 }>>;
}
export function createFeatureOperationJournalStoreV2(input: {
  repositoryRoot: string;
  operationId: string;
  lockOwnerId: string;
  trustAnchor: FeatureIntegrationTrustAnchorV2;
}): Promise<{ state: "ready"; store: FeatureOperationJournalStoreV2 } | { state: "blocked"; reason: "invalid_input" }>;

export function executeFeatureIntegrationWorkspaceStageV2(input: {
  stage: "integration" | "rollback";
  replay: FeatureIntegrationReplayProjectionV2;
  journal: FeatureOperationJournalV2;
  stageInput: Readonly<Record<string, unknown>>;
  storeScope: FeatureOperationJournalStoreV2;
  trustAnchor: FeatureIntegrationTrustAnchorV2;
  repositoryProducer: FeatureGitHubObservationProducerV2;
}): Promise<
  | { state: "accepted"; appendedEntryDigest: string }
  | { state: "blocked" | "recovery_required"; reason: "invalid_input" | "authorization_invalid" | "replay_invalid" | "compare_conflict" | "producer_unavailable" | "authentication_unavailable" | "durability_uncertain" | "execution_receipt_unavailable" | "effect_uncertain"; appendedEntryDigest: string | null }
>;

export interface GovernedRollbackWorkspaceReceiptV2 {
  sourceMissionId: string; repositoryId: string; baseHeadRevision: string; rollbackBranch: string; restoredTreeDigest: string;
  pullRequestId: string; pullRequestHeadRevision: string; pullRequestTargetBranch: string; draft: true; sourceAuthorityDigest: string;
  sourceJournalDigest: string; completionReceiptDigest: string; sourceEffectKeys: readonly string[]; evidenceDigests: readonly string[];
}
export function computeGovernedRollbackWorkspaceReceiptDigestV2(input: GovernedRollbackWorkspaceReceiptV2): string;
export function createRollbackMissionHandoffReadyV2(input: { replay: FeatureIntegrationReplayProjectionV2 }): Record<string, unknown>;
export function acceptGovernedRollbackWorkspaceV2(input: {
  replay: FeatureIntegrationReplayProjectionV2;
  journal: FeatureOperationJournalV2;
  handoff: Readonly<Record<string, unknown>>;
  sourceJournal: unknown;
  receipt: GovernedRollbackWorkspaceReceiptV2;
  storeScope: FeatureOperationJournalStoreV2;
  trustAnchor: FeatureIntegrationTrustAnchorV2;
}): Promise<{ state: "accepted"; appendedEntryDigest: string } | { state: "blocked" | "recovery_required"; reason: string; appendedEntryDigest: string | null }>;

export function prepareFeatureIntegrationWorkspaceEffectV1(input: Record<string, unknown>): { state: "prepared"; entry: Record<string, unknown>; candidate: Record<string, unknown> } | { state: "blocked"; reason: string };
export function invokeFeatureIntegrationWorkspaceEffectV1(input: Record<string, unknown>, options?: { run?: CommandRunner; cwd?: string }): FeatureIntegrationGitHubEffectResultV1;
export function observeFeatureIntegrationWorkspaceEffectV1(input: Record<string, unknown>, options?: { run?: CommandRunner; cwd?: string }): { state: "observed"; observation: unknown } | { state: "blocked"; reason: string };
export function reconcileFeatureIntegrationWorkspaceEffectV1(input: Record<string, unknown>): { state: "accepted" | "not_applied"; entryKind: string; payload: Record<string, unknown> } | { state: "blocked"; reason: string };
export function executeFeatureIntegrationWorkspaceStageV1(input: Record<string, unknown>, options?: { run?: CommandRunner; cwd?: string }): Promise<Record<string, unknown>>;
export function createRollbackMissionHandoffReadyV1(input: Record<string, unknown>): Record<string, unknown>;
export function acceptGovernedRollbackWorkspaceV1(input: Record<string, unknown>): Record<string, unknown>;
export function prepareFeatureIntegrationTransitionEffectV1(input: Record<string, unknown>): Record<string, unknown>;
export function invokeFeatureIntegrationTransitionEffectV1(input: Record<string, unknown>, options?: { run?: CommandRunner; cwd?: string }): FeatureIntegrationGitHubEffectResultV1;
export function observeFeatureIntegrationTransitionV1(input: Record<string, unknown>, options?: { run?: CommandRunner; cwd?: string }): Record<string, unknown>;
export function reconcileFeatureIntegrationTransitionV1(input: Record<string, unknown>): Record<string, unknown>;

export type CommandRunner = (
  executable: string,
  args: string[],
  options?: { cwd?: string; input?: string; timeoutMs?: number },
) => CommandResult;

export interface GitHubPublication {
  candidateId: string;
  sourceRef: string;
  capturedAt: AdapterTimestamp;
  body?: string;
  repository?: string;
  prNumber?: number;
  workspacePlan?: Record<string, unknown>;
  proposedChangedPaths: string[];
}

export type GitHubAdapterResult =
  | { state: "candidate"; candidate: AdapterCandidateEnvelope; commands: Array<{ executable: string; args: string[]; exitCode: number }> }
  | { state: "blocked"; reason: string; commands: Array<{ executable: string; args: string[]; exitCode: number }> };

export type GitHubFollowUpSourceKind = "review" | "review_comment" | "check_run" | "status_check";
export type GitHubFollowUpFindingClass =
  | "implementation"
  | "evidence"
  | "architecture_conformance"
  | "advisory"
  | "false_positive"
  | "human_decision";

export interface GitHubFollowUpSourceFinding {
  findingId: string;
  sourceKind: GitHubFollowUpSourceKind;
  sourceRef: string;
  headRefOid: string;
  classification: GitHubFollowUpFindingClass;
  blocking: boolean;
  summary: string;
}

export interface GitHubFollowUpCandidateInput {
  candidateId: string;
  missionId: string;
  subjectId: string;
  revisionId: string;
  sourceRef: string;
  capturedAt: AdapterTimestamp;
  repository: string;
  branch: string;
  prNumber: number;
  headRefOid: string;
  reviewSourceRefs: readonly string[];
  findings: readonly GitHubFollowUpSourceFinding[];
}

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
      publicationAction: "created_draft_pr" | "updated_existing_draft_pr" | "verified_existing_draft_pr";
      receipt: PRWorkspaceReceipt;
      publicationScope?: {
        scopeDigest: string;
        binding: Readonly<ReviewPublicationBindingV1>;
      };
      publicationCandidate: AdapterCandidateEnvelope;
      planReviewEvidenceEvaluation: FuryPlanReviewEvidenceEvaluationV1;
      planGateEvaluation: FuryPlanGateEvaluationV1 | null;
      commands: Array<{ executable: string; args: string[]; exitCode: number }>;
    }
  | {
      state: "dispatch_ready";
      publicationAction: "created_draft_pr" | "updated_existing_draft_pr" | "verified_existing_draft_pr";
      receipt: PRWorkspaceReceipt;
      publicationScope?: {
        scopeDigest: string;
        binding: Readonly<ReviewPublicationBindingV1>;
      };
      publicationCandidate: AdapterCandidateEnvelope;
      planReviewEvidenceEvaluation: FuryPlanReviewEvidenceEvaluationV1;
      planGateEvaluation: FuryPlanGateEvaluationV1 | null;
      commands: Array<{ executable: string; args: string[]; exitCode: number }>;
    }
  | {
      state: "blocked";
      reason: string;
      publicationCandidate?: AdapterCandidateEnvelope;
      commands: Array<{ executable: string; args: string[]; exitCode: number }>;
    };

export function deliverGitHubCommunication(
  publicationRequestId: string,
  publication: GitHubPublication,
  options: {
    loadJournal: () => unknown[];
    run?: CommandRunner;
    cwd?: string;
    realpath?: (path: string) => string;
  },
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

export function createGitHubFollowUpCandidate(
  input: GitHubFollowUpCandidateInput,
): { state: "candidate"; candidate: AdapterCandidateEnvelope } | { state: "blocked"; reason: string; errors?: string[]; commands?: [] };

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
    planGateCandidate: FuryPlanReviewEvidenceCandidateV1 | null;
    publicationRequestId: string;
    publicationCandidateId: string;
    publicationSourceRef: string;
    publicationCapturedAt: AdapterTimestamp;
  },
  options: {
    loadJournal: () => unknown[];
    loadFuryPlanReviewEvidence: () => unknown;
    loadFuryDispatchReceiptEntries: () => unknown;
    run?: CommandRunner;
    cwd?: string;
    realpath?: (path: string) => string;
  },
): DeliveryWorkspaceResult;

export interface GovernedDeliveryWorkspaceInputV1 {
  artifactRevisionId: string;
  workspacePlan: DeliveryWorkspacePlan;
  body: string;
  missionId: string;
  subjectId: string;
  blueprintArtifact: BlueprintArtifactAssertionV1;
  planGateCandidate: FuryPlanReviewEvidenceCandidateV1 | null;
  publicationRequestId: string;
  publicationCandidateId: string;
  publicationSourceRef: string;
  publicationCapturedAt: AdapterTimestamp;
  repositoryRoot: string;
  configuredJournalPath: string;
  missionRevisionId: string;
  evaluatedThroughSequence: number;
}

export function prepareGovernedDeliveryWorkspaceForDispatch(
  input: GovernedDeliveryWorkspaceInputV1,
  options: {
    loadJournal: () => unknown[];
    loadFuryPlanReviewEvidence: () => unknown;
    loadFuryDispatchReceiptEntries: () => unknown;
    run?: CommandRunner;
    cwd?: string;
    realpath?: (path: string) => string;
  },
): Promise<DeliveryWorkspaceResult>;

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
  mission?: string;
  status?: string;
  repository?: string;
  branch?: string;
  prNumber?: number;
  prState?: string;
  currentOwnerSeatId?: "hill" | "daisy" | "fury" | "may" | "fitz" | "simmons" | "coulson";
  workspaceVerification?: string;
  blockedState?: string;
  architectureState?: string;
  humanInterventions?: number;
  localSeatInvocations?: number;
  premiumAgentInvocations?: number;
  deliveryMode?: string;
  missionConfidence?: string;
  nextCheckpoint?: string;
  missionContext?: string;
  changesSinceLastCheckpoint?: string;
  completed?: string;
  evidence?: string;
  next?: string;
  risks?: string;
  coulsonAction?: string;
}): { state: "valid"; body: string } | { state: "invalid"; reason: string };
