import type { RiskAssessment, RiskFlags } from "./mission.mjs";

export interface ContentSafetyResult {
  safe: boolean;
  reason?: string;
}

export interface MissionWorkspaceInput {
  repositoryOwner: string;
  repositoryName: string;
  baseBranch: string;
  branchSlug: string;
  missionBriefPath: string;
  prTitle: string;
  missionObjective: string;
  coulsonApprovalSource: string;
  coulsonApprovedAt: string;
  riskFlags: RiskFlags;
  prBody?: string;
  participants?: string[];
  activatedModes?: string[];
  pendingDecisions?: string[];
  validationStatus?: string;
}

export interface MissionWorkspacePlan {
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly baseBranch: string;
  readonly branchSlug: string;
  readonly missionBriefPath: string;
  readonly prTitle: string;
  readonly missionObjective: string;
  readonly coulsonApprovalSource: string;
  readonly coulsonApprovedAt: string;
  readonly riskFlags: Readonly<RiskFlags>;
  readonly prBody?: string;
  readonly validationStatus?: string;
  readonly participants: readonly string[];
  readonly activatedModes: readonly string[];
  readonly pendingDecisions: readonly string[];
  readonly risk: RiskAssessment;
}

export type WorkspaceValidationResult =
  | { state: "valid"; plan: MissionWorkspacePlan }
  | { state: "invalid"; errors: string[] };

export function classifyWorkspaceRisk(flags: unknown): RiskAssessment;
export function isSafeGitHubContent(texts: unknown): ContentSafetyResult;
export function validateMissionWorkspaceInput(input: unknown): WorkspaceValidationResult;
export function generatePRBody(plan: MissionWorkspacePlan, nowISO: string): string;
