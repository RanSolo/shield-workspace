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
