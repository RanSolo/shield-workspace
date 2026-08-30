import { githubReadFields, runGitHubReadCommand } from "./github-read-runner.js";

export interface GitHubPullRequestUrl {
  readonly repository: string;
  readonly number: number;
}

export interface GitHubPullRequestFile {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
  readonly changeType: string;
}

export interface GitHubValidationObservation {
  readonly validationId: string;
  readonly name: string;
  readonly status: "passed" | "failed" | "pending" | "unknown";
  readonly conclusion: string | null;
  readonly details: string | null;
  readonly verification: "github_check" | "unverified";
  readonly revisionBinding: "observed_pr_head" | "claim_exact_sha" | "none";
  readonly headRevision: string | null;
}

export interface GitHubPullRequestObservation {
  readonly schemaVersion: 1;
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly baseRevision: string;
  readonly headRevision: string;
  readonly changedFiles: readonly GitHubPullRequestFile[];
  readonly linkedIssues: readonly {
    number: number;
    title: string;
    body: string;
    url: string;
    updatedAt: string;
  }[];
  readonly validations: readonly GitHubValidationObservation[];
  readonly observedAt: string;
}

export interface GitHubReadClient {
  viewPullRequest(repository: string, number: number): Promise<unknown>;
  viewIssue(repository: string, number: number): Promise<unknown>;
  readPullRequestHead(repository: string, number: number): Promise<unknown>;
}

export function parseGitHubPullRequestUrl(value: string): GitHubPullRequestUrl {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new TypeError("Only https://github.com pull-request URLs are supported.");
  }
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/u);
  if (!match) throw new TypeError("Expected a GitHub pull-request URL.");
  return { repository: `${match[1]}/${match[2]}`, number: Number(match[3]) };
}

function createGitHubReadClient(): GitHubReadClient {
  return {
    viewPullRequest: async (repository, number) => json(await runGitHubReadCommand([
      "pr", "view", String(number), "--repo", repository, "--json", githubReadFields.pr,
    ])),
    viewIssue: async (repository, number) => json(await runGitHubReadCommand([
      "issue", "view", String(number), "--repo", repository, "--json", githubReadFields.issue,
    ])),
    readPullRequestHead: async (repository, number) => json(await runGitHubReadCommand([
      "pr", "view", String(number), "--repo", repository, "--json", githubReadFields.head,
    ])),
  };
}

export async function observeGitHubPullRequest(
  value: string | GitHubPullRequestUrl,
  options: Readonly<{ client?: GitHubReadClient; now?: () => string }> = {},
): Promise<GitHubPullRequestObservation> {
  const pullRequest = typeof value === "string" ? parseGitHubPullRequestUrl(value) : value;
  const client = options.client ?? createGitHubReadClient();
  const observed = await asJson<GitHubPrJson>(await client.viewPullRequest(pullRequest.repository, pullRequest.number));
  const linkedIssues = await Promise.all((observed.closingIssuesReferences ?? []).map(async (reference) =>
    asJson<GitHubIssueJson>(await client.viewIssue(pullRequest.repository, reference.number))));
  const validations = [
    ...(observed.statusCheckRollup ?? []).map((check) => ({
    validationId: `check:${check.name ?? check.context ?? "unnamed"}`,
    name: check.name ?? check.context ?? "Unnamed check",
    status: checkStatus(check),
    conclusion: check.conclusion ?? null,
    details: check.detailsUrl ?? null,
    verification: "github_check" as const,
    revisionBinding: "observed_pr_head" as const,
    headRevision: observed.headRefOid,
    })),
    ...reportedBodyValidations(observed.body),
  ];
  return {
    schemaVersion: 1,
    repository: pullRequest.repository,
    number: observed.number,
    title: observed.title,
    body: observed.body,
    url: observed.url,
    baseRevision: observed.baseRefOid,
    headRevision: observed.headRefOid,
    changedFiles: observed.files ?? [],
    linkedIssues,
    validations,
    observedAt: (options.now ?? (() => new Date().toISOString()))(),
  };
}

function reportedBodyValidations(body: string): GitHubValidationObservation[] {
  const section = body.match(/^##\s+Validation\s*$([\s\S]*?)(?=^##\s+|$(?![\s\S]))/imu)?.[1] ?? "";
  return [...section.matchAll(/^\s*-\s+(.+?)\s*$/gmu)].map((match, index) => ({
    validationId: `pr-body-validation:${index + 1}`,
    name: "Reported PR validation",
    status: "unknown" as const,
    conclusion: null,
    details: match[1],
    verification: "unverified" as const,
    revisionBinding: exactRevision(match[1]) ? "claim_exact_sha" as const : "none" as const,
    headRevision: exactRevision(match[1]),
  }));
}

export async function readGitHubPullRequestHead(
  repository: string,
  number: number,
  options: Readonly<{ client?: GitHubReadClient }> = {},
): Promise<string> {
  const client = options.client ?? createGitHubReadClient();
  const observed = await asJson<{ headRefOid: string }>(await client.readPullRequestHead(repository, number));
  return observed.headRefOid;
}

function checkStatus(check: GitHubStatusCheck): GitHubValidationObservation["status"] {
  const state = `${check.conclusion ?? check.state ?? ""}`.toLowerCase();
  if (["success", "successful", "passed"].includes(state)) return "passed";
  if (["failure", "failed", "cancelled", "timed_out", "action_required"].includes(state)) return "failed";
  if (["queued", "in_progress", "pending"].includes(state)) return "pending";
  return "unknown";
}

async function json<T>(text: string): Promise<T> {
  return JSON.parse(text) as T;
}

async function asJson<T>(value: unknown): Promise<T> {
  return typeof value === "string" ? json<T>(value) : value as T;
}

function exactRevision(claim: string): string | null {
  if (!/\bvalidat(?:e|ed|ion)\b/iu.test(claim)) return null;
  const revisions = claim.match(/\b[0-9a-f]{40}\b/gu) ?? [];
  return revisions.length === 1 ? revisions[0] : null;
}

interface GitHubPrJson {
  number: number;
  title: string;
  body: string;
  url: string;
  baseRefOid: string;
  headRefOid: string;
  files?: GitHubPullRequestFile[];
  closingIssuesReferences?: { number: number }[];
  statusCheckRollup?: GitHubStatusCheck[];
}

interface GitHubIssueJson {
  number: number;
  title: string;
  body: string;
  url: string;
  updatedAt: string;
}

interface GitHubStatusCheck {
  name?: string | null;
  context?: string | null;
  state?: string | null;
  conclusion?: string | null;
  detailsUrl?: string | null;
}
