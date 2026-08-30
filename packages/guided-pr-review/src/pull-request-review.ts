export interface AcceptanceCriterion {
  readonly criterionId: string;
  readonly text: string;
  readonly sourceIssueNumber: number;
}

export interface PullRequestFile {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
  readonly changeType: string;
}

export interface LinkedIssueSnapshot {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly updatedAt: string;
}

export interface PullRequestSnapshot {
  readonly schemaVersion: 1;
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly baseRevision: string;
  readonly headRevision: string;
  readonly changedFiles: readonly PullRequestFile[];
  readonly linkedIssues: readonly LinkedIssueSnapshot[];
  readonly observedAt: string;
}

export interface CriterionCoverageInput {
  readonly criterionId: string;
  readonly summary: string;
  readonly filePaths: readonly string[];
  readonly evidence: readonly string[];
  readonly reportedValidation: string;
  readonly openGaps: readonly string[];
  readonly reviewQuestion: string;
}

export interface CriterionReview {
  readonly criterion: AcceptanceCriterion;
  readonly summary: string;
  readonly files: readonly PullRequestFile[];
  readonly evidence: readonly string[];
  readonly reportedValidation: string;
  readonly openGaps: readonly string[];
  readonly reviewQuestion: string;
}

export interface PullRequestReviewPacket {
  readonly schemaVersion: 1;
  readonly packetId: string;
  readonly packetDigest: string;
  readonly pullRequest: Readonly<{
    repository: string;
    number: number;
    title: string;
    url: string;
    baseRevision: string;
    headRevision: string;
    observedAt: string;
  }>;
  readonly criteria: readonly CriterionReview[];
}

export interface TrailLearningStep {
  readonly stepId: string;
  readonly sourceQuote: string;
  readonly purpose: string;
  readonly question: string;
  readonly explanation: string;
  readonly whyItMatters: string;
}

export interface TrailCheckpoint {
  readonly checkpointId: string;
  readonly title: string;
  readonly reviewMode: "disposition";
  readonly dispositionOptions: readonly ["pass", "question", "needs_qa", "revise"];
  readonly journeyGroup: Readonly<{ groupId: string; title: string }>;
  readonly learningSteps: readonly TrailLearningStep[];
}

export function acceptanceCriteriaFromIssue(issue: LinkedIssueSnapshot): readonly AcceptanceCriterion[] {
  const criteria = [...issue.body.matchAll(/^\s*-\s*\[[ xX]\]\s+(.+?)\s*$/gmu)]
    .map((match, index) => ({
      criterionId: `issue-${issue.number}-ac-${index + 1}`,
      text: match[1].trim(),
      sourceIssueNumber: issue.number,
    }));
  if (criteria.length === 0) {
    throw new TypeError(`Issue #${issue.number} has no Markdown acceptance-criteria checklist.`);
  }
  return Object.freeze(criteria.map((criterion) => Object.freeze(criterion)));
}

export async function compilePullRequestReview(
  snapshot: PullRequestSnapshot,
  coverage: readonly CriterionCoverageInput[],
): Promise<PullRequestReviewPacket> {
  validateSnapshot(snapshot);
  const criteria = snapshot.linkedIssues.flatMap(acceptanceCriteriaFromIssue);
  const expectedIds = new Set(criteria.map((criterion) => criterion.criterionId));
  const suppliedIds = new Set<string>();
  const filesByPath = new Map(snapshot.changedFiles.map((file) => [file.path, file]));

  const reviews = coverage.map((entry) => {
    if (!expectedIds.has(entry.criterionId)) throw new TypeError(`Unknown criterion ${entry.criterionId}.`);
    if (suppliedIds.has(entry.criterionId)) throw new TypeError(`Duplicate coverage for ${entry.criterionId}.`);
    suppliedIds.add(entry.criterionId);
    requireText(entry.summary, `${entry.criterionId} summary`);
    requireText(entry.reviewQuestion, `${entry.criterionId} review question`);
    requireText(entry.reportedValidation, `${entry.criterionId} reported validation`);
    if (entry.evidence.length === 0 || entry.evidence.some((item) => !item.trim())) {
      throw new TypeError(`${entry.criterionId} requires explicit evidence.`);
    }
    const files = entry.filePaths.map((path) => {
      const file = filesByPath.get(path);
      if (!file) throw new TypeError(`${entry.criterionId} references unchanged file ${path}.`);
      return file;
    });
    const criterion = criteria.find((candidate) => candidate.criterionId === entry.criterionId)!;
    return Object.freeze({
      criterion,
      summary: entry.summary.trim(),
      files: Object.freeze(files.map((file) => Object.freeze({ ...file }))),
      evidence: Object.freeze(entry.evidence.map((item) => item.trim())),
      reportedValidation: entry.reportedValidation.trim(),
      openGaps: Object.freeze(entry.openGaps.map((item) => item.trim()).filter(Boolean)),
      reviewQuestion: entry.reviewQuestion.trim(),
    });
  });

  const missing = criteria.filter((criterion) => !suppliedIds.has(criterion.criterionId));
  if (missing.length) throw new TypeError(`Missing coverage for ${missing.map((item) => item.criterionId).join(", ")}.`);
  const material = {
    schemaVersion: 1 as const,
    pullRequest: {
      repository: snapshot.repository,
      number: snapshot.number,
      title: snapshot.title,
      url: snapshot.url,
      baseRevision: snapshot.baseRevision,
      headRevision: snapshot.headRevision,
      observedAt: snapshot.observedAt,
    },
    criteria: reviews,
  };
  const packetDigest = await sha256Json(material);
  return Object.freeze({
    ...material,
    packetId: `pr-review:${snapshot.repository}#${snapshot.number}:${packetDigest.slice(7, 23)}`,
    packetDigest,
    criteria: Object.freeze(reviews),
  });
}

export function compareReviewRevision(
  packet: PullRequestReviewPacket,
  liveHeadRevision: string,
): Readonly<{ state: "current" } | { state: "stale"; reviewedHead: string; liveHead: string }> {
  requireRevision(liveHeadRevision, "live head revision");
  return packet.pullRequest.headRevision === liveHeadRevision
    ? Object.freeze({ state: "current" as const })
    : Object.freeze({ state: "stale" as const, reviewedHead: packet.pullRequest.headRevision, liveHead: liveHeadRevision });
}

export function renderPullRequestReviewMarkdown(packet: PullRequestReviewPacket): string {
  const lines = [
    `# Guided Code Review · PR #${packet.pullRequest.number}`,
    "",
    `**${packet.pullRequest.title}**`,
    "",
    `- Repository: \`${packet.pullRequest.repository}\``,
    `- Pull request: ${packet.pullRequest.url}`,
    `- Base revision: \`${packet.pullRequest.baseRevision}\``,
    `- Exact review revision: \`${packet.pullRequest.headRevision}\``,
    `- Packet: \`${packet.packetId}\``,
    "",
    "> Review the delivered change criterion by criterion. PASS means the cited evidence supports the acceptance criterion at the exact review revision. Use Revise, Question, or Needs QA when it does not.",
  ];
  for (const [index, review] of packet.criteria.entries()) {
    const quote = criterionQuote(index, review.criterion.text);
    lines.push(
      "",
      `## Acceptance criterion ${index + 1}`,
      "",
      quote,
      "",
      "### What changed",
      "",
      review.summary,
      "",
      "### Changed-file evidence",
      "",
      ...(review.files.length
        ? review.files.map((file) => `- \`${file.path}\` — +${file.additions} / -${file.deletions} (${file.changeType.toLowerCase()})`)
        : ["- No changed file is claimed as direct evidence for this criterion."]),
      "",
      "### Supporting evidence",
      "",
      ...review.evidence.map((item) => `- ${item}`),
      "",
      "### Reported validation",
      "",
      review.reportedValidation,
      "",
      "### Open gaps",
      "",
      ...(review.openGaps.length ? review.openGaps.map((item) => `- ${item}`) : ["- None identified in the authored review evidence."]),
      "",
      "### Review question",
      "",
      review.reviewQuestion,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function createPullRequestReviewCheckpoints(packet: PullRequestReviewPacket): readonly TrailCheckpoint[] {
  return Object.freeze(packet.criteria.map((review, index) => Object.freeze({
    checkpointId: review.criterion.criterionId,
    title: `Acceptance criterion ${index + 1}`,
    reviewMode: "disposition" as const,
    dispositionOptions: ["pass", "question", "needs_qa", "revise"] as const,
    journeyGroup: Object.freeze({ groupId: "acceptance-criteria", title: "Acceptance criteria" }),
    learningSteps: Object.freeze([Object.freeze({
      stepId: `${review.criterion.criterionId}-review`,
      sourceQuote: criterionQuote(index, review.criterion.text),
      purpose: `Decide whether PR #${packet.pullRequest.number} satisfies this acceptance criterion at the exact review revision.`,
      question: review.reviewQuestion,
      explanation: review.summary,
      whyItMatters: "Acceptance criteria are the promised outcomes; changed files and validation are evidence, not substitutes for the outcome.",
    })]),
  })));
}

function criterionQuote(index: number, text: string): string {
  return `Acceptance criterion ${index + 1}: ${text}`;
}

function validateSnapshot(snapshot: PullRequestSnapshot): void {
  if (snapshot.schemaVersion !== 1) throw new TypeError("Unsupported pull-request snapshot schema.");
  requireText(snapshot.repository, "repository");
  requireText(snapshot.title, "pull request title");
  requireText(snapshot.url, "pull request URL");
  requireRevision(snapshot.baseRevision, "base revision");
  requireRevision(snapshot.headRevision, "head revision");
  if (!Number.isSafeInteger(snapshot.number) || snapshot.number < 1) throw new TypeError("Invalid pull request number.");
  if (snapshot.linkedIssues.length === 0) throw new TypeError("At least one linked issue is required.");
  const paths = new Set<string>();
  for (const file of snapshot.changedFiles) {
    requireText(file.path, "changed file path");
    if (paths.has(file.path)) throw new TypeError(`Duplicate changed file ${file.path}.`);
    paths.add(file.path);
  }
}

function requireRevision(value: string, label: string): void {
  if (!/^[0-9a-f]{40}$/u.test(value)) throw new TypeError(`Invalid ${label}.`);
}

function requireText(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`Missing ${label}.`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON requires finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError("Canonical JSON supports only plain JSON values.");
}

async function sha256Json(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
