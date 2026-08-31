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

export interface ValidationObservation {
  readonly validationId: string;
  readonly name: string;
  readonly status: "passed" | "failed" | "pending" | "unknown";
  readonly conclusion: string | null;
  readonly details: string | null;
  readonly verification: "github_check" | "unverified";
  readonly revisionBinding: "observed_pr_head" | "claim_exact_sha" | "none";
  readonly headRevision: string | null;
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
  readonly validations: readonly ValidationObservation[];
  readonly observedAt: string;
}

export type PullRequestAnchorField = "number" | "title" | "url" | "base_revision" | "head_revision";
export type IssueAnchorField = "number" | "title" | "url" | "body";

export type EvidenceAnchorInput =
  | Readonly<{ kind: "pull_request"; field: PullRequestAnchorField }>
  | Readonly<{ kind: "issue"; issueNumber: number; field: IssueAnchorField }>
  | Readonly<{ kind: "file"; path: string }>
  | Readonly<{ kind: "pr_body"; excerpt: string }>
  | Readonly<{ kind: "validation"; validationId: string }>;

export interface EvidenceProvenance {
  readonly source: "pull_request" | "issue" | "file" | "pr_body" | "validation";
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly headRevision: string;
  readonly issueNumber?: number;
}

export type EvidenceAnchor =
  | Readonly<{
      kind: "pull_request";
      field: PullRequestAnchorField;
      value: string | number;
      provenance: EvidenceProvenance;
    }>
  | Readonly<{
      kind: "issue";
      field: IssueAnchorField;
      value: string | number;
      provenance: EvidenceProvenance;
    }>
  | Readonly<{
      kind: "file";
      file: PullRequestFile;
      provenance: EvidenceProvenance;
    }>
  | Readonly<{
      kind: "pr_body";
      excerpt: string;
      provenance: EvidenceProvenance;
    }>
  | Readonly<{
      kind: "validation";
      validation: ValidationObservation;
      provenance: EvidenceProvenance;
    }>;

export type EvidenceSlotInput =
  | Readonly<{ state: "available"; anchors: readonly EvidenceAnchorInput[] }>
  | Readonly<{ state: "unavailable"; reason: string }>;

export type OpenGapSlotInput =
  | Readonly<{ state: "available"; items: readonly string[] }>
  | Readonly<{ state: "unavailable"; reason: string }>;

export interface CriterionCoverageInput {
  readonly criterionId: string;
  readonly explanation: string;
  readonly evidence: Readonly<{
    commitment: EvidenceSlotInput;
    changedFileOrDiff: EvidenceSlotInput;
    reportedValidation: EvidenceSlotInput;
    openGap: OpenGapSlotInput;
  }>;
  readonly reviewQuestion: string;
}

export type EvidenceSlot =
  | Readonly<{ state: "available"; anchors: readonly EvidenceAnchor[] }>
  | Readonly<{ state: "unavailable"; reason: string }>;

export type OpenGapSlot =
  | Readonly<{ state: "available"; items: readonly string[] }>
  | Readonly<{ state: "unavailable"; reason: string }>;

export interface CriterionReview {
  readonly criterion: AcceptanceCriterion;
  readonly guidance: Readonly<{
    explanation: string;
    reviewQuestion: string;
  }>;
  readonly evidence: Readonly<{
    commitment: EvidenceSlot;
    changedFileOrDiff: EvidenceSlot;
    reportedValidation: EvidenceSlot;
    openGap: OpenGapSlot;
  }>;
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
  const issuesByNumber = new Map(snapshot.linkedIssues.map((issue) => [issue.number, issue]));
  const validationsById = new Map(snapshot.validations.map((validation) => [validation.validationId, validation]));

  const reviews = coverage.map((entry) => {
    if (!expectedIds.has(entry.criterionId)) throw new TypeError(`Unknown criterion ${entry.criterionId}.`);
    if (suppliedIds.has(entry.criterionId)) throw new TypeError(`Duplicate coverage for ${entry.criterionId}.`);
    suppliedIds.add(entry.criterionId);
    requireText(entry.explanation, `${entry.criterionId} explanation`);
    requireText(entry.reviewQuestion, `${entry.criterionId} review question`);
    if (!entry.evidence || typeof entry.evidence !== "object") throw new TypeError(`${entry.criterionId} requires canonical evidence slots.`);
    const resolve = (slot: EvidenceSlotInput, label: string, allowed: readonly EvidenceAnchorInput["kind"][]): EvidenceSlot => {
      if (!slot || slot.state === "unavailable") {
        requireText(slot?.reason, `${entry.criterionId} ${label} unavailable reason`);
        return Object.freeze({ state: "unavailable" as const, reason: slot.reason.trim() });
      }
      if (slot.state !== "available" || !Array.isArray(slot.anchors) || slot.anchors.length === 0) {
        throw new TypeError(`${entry.criterionId} ${label} requires typed evidence anchors or unavailable-with-reason.`);
      }
      const anchors = slot.anchors.map((anchor) => {
        if (!allowed.includes(anchor.kind)) throw new TypeError(`${entry.criterionId} ${label} contains an invalid anchor kind.`);
        return resolveAnchor(anchor, snapshot, filesByPath, issuesByNumber, validationsById, entry.criterionId);
      });
      return Object.freeze({ state: "available" as const, anchors: Object.freeze(anchors) });
    };
    const openGap = entry.evidence.openGap;
    let openGapSlot: OpenGapSlot;
    if (!openGap || openGap.state === "unavailable") {
      requireText(openGap?.reason, `${entry.criterionId} open-gap unavailable reason`);
      openGapSlot = Object.freeze({ state: "unavailable", reason: openGap.reason.trim() });
    } else if (openGap.state === "available" && Array.isArray(openGap.items)) {
      openGapSlot = Object.freeze({ state: "available", items: Object.freeze(openGap.items.map((item) => item.trim()).filter(Boolean)) });
    } else throw new TypeError(`${entry.criterionId} open-gap slot is malformed.`);
    const criterion = criteria.find((candidate) => candidate.criterionId === entry.criterionId)!;
    return Object.freeze({
      criterion,
      guidance: Object.freeze({
        explanation: entry.explanation.trim(),
        reviewQuestion: entry.reviewQuestion.trim(),
      }),
      evidence: Object.freeze({
        commitment: resolve(entry.evidence.commitment, "commitment", ["pull_request", "issue", "pr_body"]),
        changedFileOrDiff: resolve(entry.evidence.changedFileOrDiff, "changed-file/diff", ["file"]),
        reportedValidation: resolve(entry.evidence.reportedValidation, "reported-validation", ["validation"]),
        openGap: openGapSlot,
      }),
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
    },
    criteria: reviews,
  };
  const packetDigest = await sha256Json(material);
  return Object.freeze({
    ...material,
    pullRequest: Object.freeze({ ...material.pullRequest, observedAt: snapshot.observedAt }),
    packetId: `pr-review:${snapshot.repository}#${snapshot.number}:${packetDigest.slice(7, 23)}`,
    packetDigest,
    criteria: Object.freeze(reviews),
  });
}

export async function calculatePullRequestReviewPacketDigest(packet: PullRequestReviewPacket): Promise<string> {
  return sha256Json({
    schemaVersion: packet.schemaVersion,
    pullRequest: {
      repository: packet.pullRequest.repository,
      number: packet.pullRequest.number,
      title: packet.pullRequest.title,
      url: packet.pullRequest.url,
      baseRevision: packet.pullRequest.baseRevision,
      headRevision: packet.pullRequest.headRevision,
    },
    criteria: packet.criteria,
  });
}

export async function verifyPullRequestReviewPacket(packet: PullRequestReviewPacket): Promise<void> {
  const digest = await calculatePullRequestReviewPacketDigest(packet);
  if (digest !== packet.packetDigest) throw new TypeError("Prepared packet digest does not match its canonical contents.");
  const expectedId = `pr-review:${packet.pullRequest.repository}#${packet.pullRequest.number}:${digest.slice(7, 23)}`;
  if (packet.packetId !== expectedId) throw new TypeError("Prepared packet ID does not match its canonical contents.");
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
    "> Review the delivered change criterion by criterion. PASS means the cited observed anchors support the acceptance criterion at the exact review revision. Use Revise, Question, or Needs QA when it does not.",
  ];
  for (const [index, review] of packet.criteria.entries()) {
    const quote = criterionQuote(index, review.criterion.text);
    lines.push(
      "",
      `## Acceptance criterion ${index + 1}`,
      "",
      quote,
      "",
      "### Commitment",
      "",
      ...formatEvidenceSlot(review.evidence.commitment),
      "",
      "### Changed-file / diff evidence",
      "",
      ...formatEvidenceSlot(review.evidence.changedFileOrDiff),
      "",
      "### Reported validation",
      "",
      ...formatEvidenceSlot(review.evidence.reportedValidation),
      "",
      "### Open gaps",
      "",
      ...(review.evidence.openGap.state === "available"
        ? (review.evidence.openGap.items.length ? review.evidence.openGap.items.map((item) => `- ${item}`) : ["- None identified."])
        : [`- Unavailable: ${review.evidence.openGap.reason}`]),
      "",
      "### Authored guidance",
      "",
      review.guidance.explanation,
      "",
      "### Review question",
      "",
      review.guidance.reviewQuestion,
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
      question: review.guidance.reviewQuestion,
      explanation: review.guidance.explanation,
      whyItMatters: "Acceptance criteria are the promised outcomes; observed anchors are evidence, while the decision remains human-owned.",
    })]),
  })));
}

export async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function resolveAnchor(
  input: EvidenceAnchorInput,
  snapshot: PullRequestSnapshot,
  filesByPath: ReadonlyMap<string, PullRequestFile>,
  issuesByNumber: ReadonlyMap<number, LinkedIssueSnapshot>,
  validationsById: ReadonlyMap<string, ValidationObservation>,
  criterionId: string,
): EvidenceAnchor {
  const provenance = (source: EvidenceProvenance["source"], issueNumber?: number): EvidenceProvenance => ({
    source,
    repository: snapshot.repository,
    pullRequestNumber: snapshot.number,
    headRevision: snapshot.headRevision,
    ...(issueNumber === undefined ? {} : { issueNumber }),
  });
  if (input.kind === "pull_request") {
    const values: Record<PullRequestAnchorField, string | number> = {
      number: snapshot.number,
      title: snapshot.title,
      url: snapshot.url,
      base_revision: snapshot.baseRevision,
      head_revision: snapshot.headRevision,
    };
    return Object.freeze({ kind: input.kind, field: input.field, value: values[input.field], provenance: provenance("pull_request") });
  }
  if (input.kind === "issue") {
    const issue = issuesByNumber.get(input.issueNumber);
    if (!issue) throw new TypeError(`${criterionId} references an issue that was not observed as linked.`);
    const values: Record<IssueAnchorField, string | number> = {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      body: issue.body,
    };
    return Object.freeze({ kind: input.kind, field: input.field, value: values[input.field], provenance: provenance("issue", issue.number) });
  }
  if (input.kind === "file") {
    const file = filesByPath.get(input.path);
    if (!file) throw new TypeError(`${criterionId} references unchanged file ${input.path}.`);
    return Object.freeze({ kind: input.kind, file: Object.freeze({ ...file }), provenance: provenance("file") });
  }
  if (input.kind === "pr_body") {
    requireText(input.excerpt, `${criterionId} PR-body excerpt`);
    if (!snapshot.body.includes(input.excerpt)) throw new TypeError(`${criterionId} references PR-body text not present in the observed PR.`);
    return Object.freeze({ kind: input.kind, excerpt: input.excerpt, provenance: provenance("pr_body") });
  }
  const validation = validationsById.get(input.validationId);
  if (!validation) throw new TypeError(`${criterionId} references validation ${input.validationId} that was not observed.`);
  if (validation.headRevision === null || validation.revisionBinding === "none") {
    throw new TypeError(`${criterionId} references a revision-unbound validation.`);
  }
  if (validation.headRevision !== snapshot.headRevision) throw new TypeError(`${criterionId} references validation for a different PR head.`);
  return Object.freeze({ kind: input.kind, validation: Object.freeze({ ...validation }), provenance: provenance("validation") });
}

function formatAnchor(anchor: EvidenceAnchor): string {
  if (anchor.kind === "pull_request") return `- PR field \`${anchor.field}\`: \`${String(anchor.value)}\` (observed at ${anchor.provenance.headRevision})`;
  if (anchor.kind === "issue") return `- Issue #${anchor.provenance.issueNumber} field \`${anchor.field}\`: observed from the linked issue`;
  if (anchor.kind === "file") return `- File \`${anchor.file.path}\`: +${anchor.file.additions} / -${anchor.file.deletions} (${anchor.file.changeType.toLowerCase()}) at ${anchor.provenance.headRevision}`;
  if (anchor.kind === "pr_body") return `- PR-body excerpt: ${anchor.excerpt}`;
  return `- Validation \`${anchor.validation.name}\`: ${anchor.validation.status} at ${anchor.validation.headRevision} (${anchor.validation.verification})`;
}

function formatEvidenceSlot(slot: EvidenceSlot): string[] {
  return slot.state === "available" ? slot.anchors.map(formatAnchor) : [`- Unavailable: ${slot.reason}`];
}

function criterionQuote(index: number, text: string): string {
  return `Acceptance criterion ${index + 1}: ${text}`;
}

function validateSnapshot(snapshot: PullRequestSnapshot): void {
  if (snapshot.schemaVersion !== 1) throw new TypeError("Unsupported pull-request snapshot schema.");
  requireText(snapshot.repository, "repository");
  requireText(snapshot.title, "pull request title");
  requireText(snapshot.body, "pull request body");
  requireText(snapshot.url, "pull request URL");
  requireRevision(snapshot.baseRevision, "base revision");
  requireRevision(snapshot.headRevision, "head revision");
  requireText(snapshot.observedAt, "observation time");
  if (!Number.isSafeInteger(snapshot.number) || snapshot.number < 1) throw new TypeError("Invalid pull request number.");
  if (snapshot.linkedIssues.length === 0) throw new TypeError("At least one linked issue is required.");
  const paths = new Set<string>();
  for (const file of snapshot.changedFiles) {
    requireText(file.path, "changed file path");
    if (paths.has(file.path)) throw new TypeError(`Duplicate changed file ${file.path}.`);
    paths.add(file.path);
  }
  const validationIds = new Set<string>();
  for (const validation of snapshot.validations) {
    requireText(validation.validationId, "validation ID");
    requireText(validation.name, "validation name");
    if (!["github_check", "unverified"].includes(validation.verification)) throw new TypeError("Invalid validation verification.");
    if (!["observed_pr_head", "claim_exact_sha", "none"].includes(validation.revisionBinding)) throw new TypeError("Invalid validation revision binding.");
    if (validation.verification === "github_check" && validation.revisionBinding !== "observed_pr_head") {
      throw new TypeError("GitHub check validation must bind to the observed PR head.");
    }
    if (validation.verification === "unverified" && validation.revisionBinding === "observed_pr_head") {
      throw new TypeError("Unverified validation cannot bind implicitly to the observed PR head.");
    }
    if (validation.headRevision === null) {
      if (validation.revisionBinding !== "none") throw new TypeError("Revision-bound validation is missing its head revision.");
    } else {
      if (validation.revisionBinding === "none") throw new TypeError("Revision-unbound validation cannot carry a head revision.");
      requireRevision(validation.headRevision, "validation head revision");
    }
    if (validationIds.has(validation.validationId)) throw new TypeError(`Duplicate validation ${validation.validationId}.`);
    validationIds.add(validation.validationId);
  }
}

function requireRevision(value: string, label: string): void {
  if (!/^[0-9a-f]{40}$/u.test(value)) throw new TypeError(`Invalid ${label}.`);
}

function requireText(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`Missing ${label}.`);
}

async function sha256Json(value: unknown): Promise<string> {
  return sha256Text(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON requires finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}`;
  throw new TypeError("Canonical JSON supports only plain JSON values.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
