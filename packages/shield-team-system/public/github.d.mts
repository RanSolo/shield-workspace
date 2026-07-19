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

export type DeliveryWorkspaceResult =
  | {
      state: "dispatch_ready";
      publicationAction: "created_draft_pr" | "updated_existing_draft_pr";
      receipt: PRWorkspaceReceipt;
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
  },
  options?: { run?: CommandRunner; cwd?: string },
): DeliveryWorkspaceResult;

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
