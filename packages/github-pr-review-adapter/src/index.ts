import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
  readonly headRevision: string;
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

export interface GitHubCommandRunner {
  (args: readonly string[]): Promise<string>;
}

const executeFile = promisify(execFile);

export function parseGitHubPullRequestUrl(value: string): GitHubPullRequestUrl {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new TypeError("Only https://github.com pull-request URLs are supported.");
  }
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/u);
  if (!match) throw new TypeError("Expected a GitHub pull-request URL.");
  return { repository: `${match[1]}/${match[2]}`, number: Number(match[3]) };
}

export function createGhCommandRunner(): GitHubCommandRunner {
  return async (args) => (await executeFile("gh", [...args], { maxBuffer: 10 * 1024 * 1024 })).stdout;
}

export async function observeGitHubPullRequest(
  value: string | GitHubPullRequestUrl,
  options: Readonly<{ run?: GitHubCommandRunner; now?: () => string }> = {},
): Promise<GitHubPullRequestObservation> {
  const pullRequest = typeof value === "string" ? parseGitHubPullRequestUrl(value) : value;
  const run = options.run ?? createGhCommandRunner();
  const observed = await json<GitHubPrJson>(await run([
    "pr", "view", String(pullRequest.number), "--repo", pullRequest.repository,
    "--json", "number,title,body,url,baseRefOid,headRefOid,files,closingIssuesReferences,statusCheckRollup",
  ]));
  const linkedIssues = await Promise.all((observed.closingIssuesReferences ?? []).map(async (reference) =>
    json<GitHubIssueJson>(await run([
      "issue", "view", String(reference.number), "--repo", pullRequest.repository,
      "--json", "number,title,body,url,updatedAt",
    ]))));
  const validations = [
    ...(observed.statusCheckRollup ?? []).map((check) => ({
    validationId: `check:${check.name ?? check.context ?? "unnamed"}`,
    name: check.name ?? check.context ?? "Unnamed check",
    status: checkStatus(check),
    conclusion: check.conclusion ?? null,
    details: check.detailsUrl ?? null,
    headRevision: observed.headRefOid,
    })),
    ...reportedBodyValidations(observed.body, observed.headRefOid),
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

function reportedBodyValidations(body: string, headRevision: string): GitHubValidationObservation[] {
  const section = body.match(/^##\s+Validation\s*$([\s\S]*?)(?=^##\s+|$(?![\s\S]))/imu)?.[1] ?? "";
  return [...section.matchAll(/^\s*-\s+(.+?)\s*$/gmu)].map((match, index) => ({
    validationId: `pr-body-validation:${index + 1}`,
    name: "Reported PR validation",
    status: "unknown" as const,
    conclusion: null,
    details: match[1],
    headRevision,
  }));
}

export async function readGitHubPullRequestHead(
  repository: string,
  number: number,
  options: Readonly<{ run?: GitHubCommandRunner }> = {},
): Promise<string> {
  const run = options.run ?? createGhCommandRunner();
  const observed = await json<{ headRefOid: string }>(await run([
    "pr", "view", String(number), "--repo", repository, "--json", "headRefOid",
  ]));
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
