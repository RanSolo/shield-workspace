import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";

import {
  createGuidedReviewAutomatedCheckReceiptV1,
  createGuidedReviewQuestionEnvelopeV1,
  parseGuidedReviewResponseV1,
  validateGuidedReviewAutomatedCheckReceiptV1,
  validateGuidedReviewAutomatedCheckSourceV1,
  validateGuidedReviewAnswerEnvelopeV1,
  validateGuidedReviewQuestionEnvelopeV1,
  GUIDED_REVIEW_ACCEPTED_ANSWERS_V1,
  type GuidedReviewAnswerEnvelopeV1,
  type GuidedReviewAutomatedCheckReceiptV1,
  type GuidedReviewConversationDispositionV1,
  type GuidedReviewQuestionEnvelopeV1,
} from "./guided-review-conversation-v1.mjs";
import {
  projectCurrentGuidedReviewStepHostV1,
  revalidateGuidedReviewProjectionContextHostV1,
  type GuidedReviewProjectionContextHostResultV1,
  type GuidedReviewProjectionHostResultV1,
  type ProjectCurrentGuidedReviewStepHostInputV1,
} from "./guided-review-projection-host-v1.mjs";
import type { GuidedReviewReadyV1 } from "./guided-review-route-resolution-host-v1.mjs";
import { answerCurrentGuidedReviewSessionHostV1 } from "./guided-review-session-host-v1.mjs";
import type { PreparedPublicationReadyResultV1 } from "./mission-preparation-host-v1.mjs";
import { canonicalJson } from "./mission-v2.mjs";

export interface CurrentGuidedReviewQuestionHostInputV1 {
  readonly repositoryRoot: string;
  readonly preparation: PreparedPublicationReadyResultV1;
  readonly resolution: GuidedReviewReadyV1;
  readonly expectedSessionDigest: string;
}

export interface RevalidateCurrentGuidedReviewQuestionHostInputV1 extends CurrentGuidedReviewQuestionHostInputV1 {
  readonly expectedQuestionDigest: string;
}

export interface AnswerGuidedReviewConversationHostInputV1 {
  readonly repositoryRoot: string;
  readonly preparation: PreparedPublicationReadyResultV1;
  readonly resolution: GuidedReviewReadyV1;
  readonly questionEnvelope: GuidedReviewQuestionEnvelopeV1;
  readonly answerEnvelope: GuidedReviewAnswerEnvelopeV1;
  readonly decidedAt: string;
}

export type GuidedReviewAutomatedChecksV1 = Readonly<
  | { state: "unavailable"; receipts: readonly [] }
  | { state: "available"; receipts: readonly GuidedReviewAutomatedCheckReceiptV1[] }
>;

export type CurrentGuidedReviewQuestionHostResultV1 = Readonly<
  | { state: "question_ready"; questionEnvelope: GuidedReviewQuestionEnvelopeV1; projection: Extract<GuidedReviewProjectionHostResultV1, { state: "ready" }>;
      automatedChecks: GuidedReviewAutomatedChecksV1 }
  | { state: "invalid"; code: string; errors: readonly string[]; projection?: GuidedReviewProjectionHostResultV1 }
>;

export type RevalidateCurrentGuidedReviewQuestionHostResultV1 = Readonly<
  | { state: "question_ready"; questionEnvelope: GuidedReviewQuestionEnvelopeV1;
      projection: Extract<GuidedReviewProjectionContextHostResultV1, { state: "ready" }>;
      automatedChecks: GuidedReviewAutomatedChecksV1 }
  | { state: "invalid"; code: string; errors: readonly string[] }
>;

export type AnswerGuidedReviewConversationHostResultV1 = Readonly<
  | { state: "confirmation_required"; code: "GUIDED_REVIEW_ANSWER_CONFIRMATION_REQUIRED"; questionEnvelope: GuidedReviewQuestionEnvelopeV1;
      acceptedAnswers: typeof GUIDED_REVIEW_ACCEPTED_ANSWERS_V1 }
  | { state: "follow_up_required"; code: "GUIDED_REVIEW_ANSWER_FOLLOW_UP_REQUIRED"; questionEnvelope: GuidedReviewQuestionEnvelopeV1;
      canonicalAnswer: typeof GUIDED_REVIEW_ACCEPTED_ANSWERS_V1[number]; requiredField: "finding" | "condition" }
  | { state: "answered"; priorQuestionDigest: string; decisionId: string | null; newSessionDigest: string; completed: boolean;
      nextQuestionEnvelope: GuidedReviewQuestionEnvelopeV1 | null; projection: GuidedReviewProjectionHostResultV1 }
  | { state: "invalid"; code: string; errors: readonly string[] }
>;

export interface GuidedReviewConversationHostDependenciesV1 {
  readonly projectCurrent: typeof projectCurrentGuidedReviewStepHostV1;
  readonly revalidateCurrent: typeof revalidateGuidedReviewProjectionContextHostV1;
  readonly answerCurrent: typeof answerCurrentGuidedReviewSessionHostV1;
  readonly readAutomatedCheckSourceBytes: (input: CurrentGuidedReviewQuestionHostInputV1) => Promise<string | null>;
}

export const GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE_FILENAME_V1 = "automated-check-source.json" as const;

export interface GuidedReviewAutomatedCheckSourceReadDependenciesV1 {
  readonly afterSourceRead?: () => Promise<void>;
}

function secureSourceStat(stat: Stats): boolean {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && (stat.mode & 0o777) === 0o600 &&
    stat.size >= 1 && stat.size <= 2 * 1024 * 1024;
}

function sameSourceIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mode === right.mode &&
    left.nlink === right.nlink && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs &&
    left.isFile() === right.isFile() && left.isSymbolicLink() === right.isSymbolicLink();
}

export async function readGuidedReviewAutomatedCheckSourceBytesHostV1(
  input: CurrentGuidedReviewQuestionHostInputV1,
  dependencies: GuidedReviewAutomatedCheckSourceReadDependenciesV1 = Object.freeze({}),
): Promise<string | null> {
  const packageDirectory = input.resolution.paths?.packageDirectory;
  if (typeof packageDirectory !== "string") return null;
  const path = join(packageDirectory, GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE_FILENAME_V1);
  try {
    const before = await lstat(path);
    if (!secureSourceStat(before)) return null;
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (!secureSourceStat(opened) || !sameSourceIdentity(before, opened)) return null;
      const bytes = await handle.readFile("utf8");
      await dependencies.afterSourceRead?.();
      const after = await handle.stat();
      const pathAfter = await lstat(path);
      return secureSourceStat(after) && secureSourceStat(pathAfter) && sameSourceIdentity(opened, after) &&
        sameSourceIdentity(after, pathAfter) && Buffer.byteLength(bytes, "utf8") === opened.size ? bytes : null;
    } finally { await handle.close(); }
  } catch { return null; }
}

const DEFAULT_DEPENDENCIES: GuidedReviewConversationHostDependenciesV1 = Object.freeze({
  projectCurrent: projectCurrentGuidedReviewStepHostV1,
  revalidateCurrent: revalidateGuidedReviewProjectionContextHostV1,
  answerCurrent: answerCurrentGuidedReviewSessionHostV1,
  readAutomatedCheckSourceBytes: readGuidedReviewAutomatedCheckSourceBytesHostV1,
});
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const AUTOMATED_CHECKS_UNAVAILABLE: GuidedReviewAutomatedChecksV1 = Object.freeze({ state: "unavailable", receipts: Object.freeze([]) as readonly [] });

function invalid(code: string, error: string): AnswerGuidedReviewConversationHostResultV1 {
  return Object.freeze({ state: "invalid", code, errors: Object.freeze([error]) });
}

async function automatedChecks(
  input: CurrentGuidedReviewQuestionHostInputV1,
  material: Extract<GuidedReviewProjectionContextHostResultV1, { state: "ready" }>["projection"],
  readSource: GuidedReviewConversationHostDependenciesV1["readAutomatedCheckSourceBytes"],
): Promise<GuidedReviewAutomatedChecksV1 | Readonly<{ state: "invalid"; code: string; errors: readonly string[] }>> {
  const bytes = await readSource(input);
  if (bytes === null) return AUTOMATED_CHECKS_UNAVAILABLE;
  let parsed: unknown;
  try { parsed = JSON.parse(bytes) as unknown; }
  catch { return Object.freeze({ state: "invalid", code: "MALFORMED_GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE",
    errors: Object.freeze(["Automated check source bytes are malformed."]) }); }
  const source = validateGuidedReviewAutomatedCheckSourceV1(parsed);
  if (source.state !== "ready" || bytes !== canonicalJson(source.state === "ready" ? source.value : parsed)) {
    return Object.freeze({ state: "invalid", code: "MALFORMED_GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE",
      errors: Object.freeze(["Automated check source bytes are not one exact closed canonical source."]) });
  }
  const expected = input.preparation.observation;
  if (source.value.missionId !== material.missionId || source.value.repositoryId !== expected.repositoryId ||
      source.value.canonicalRoot !== expected.canonicalRoot || source.value.requestDigest !== material.requestDigest ||
      source.value.sessionId !== material.sessionId || source.value.sessionDigest !== material.sessionDigest ||
      source.value.exactRevision !== material.exactRevision) {
    return Object.freeze({ state: "invalid", code: "GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE_STALE",
      errors: Object.freeze(["Automated check source is not bound to the exact current mission, repository, request, session, and revision."]) });
  }
  const sourceByteSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const verified: GuidedReviewAutomatedCheckReceiptV1[] = [];
  for (const check of source.value.checks) {
    const created = createGuidedReviewAutomatedCheckReceiptV1({ schemaVersion: 1, contractVersion: "guided.review.automated-check.v1",
      authority: "none", provenance: "host_exact_source_bytes", missionId: source.value.missionId,
      repositoryId: source.value.repositoryId, canonicalRoot: source.value.canonicalRoot, requestDigest: source.value.requestDigest,
      sessionId: source.value.sessionId, sessionDigest: source.value.sessionDigest, exactRevision: source.value.exactRevision,
      evidenceSourceId: source.value.evidenceSourceId, sourceByteSha256, ...check });
    if (created.state !== "ready" || validateGuidedReviewAutomatedCheckReceiptV1(created.state === "ready" ? created.value : null).state !== "ready") {
      return Object.freeze({ state: "invalid", code: "MALFORMED_GUIDED_REVIEW_AUTOMATED_CHECK",
        errors: Object.freeze(["Host-projected automated check receipt is invalid."]) });
    }
    verified.push(created.value);
  }
  verified.sort((left, right) => left.commandId.localeCompare(right.commandId) || left.receiptDigest.localeCompare(right.receiptDigest));
  return Object.freeze({ state: "available", receipts: Object.freeze(verified) });
}

function questionForProjection(
  input: CurrentGuidedReviewQuestionHostInputV1,
  material: Extract<GuidedReviewProjectionContextHostResultV1, { state: "ready" }>["projection"],
): Readonly<
  | { state: "question_ready"; questionEnvelope: GuidedReviewQuestionEnvelopeV1; automatedChecks: GuidedReviewAutomatedChecksV1 }
  | { state: "invalid"; code: string; errors: readonly string[] }
> {
  const stage = input.resolution.playbook.stages.find((candidate) => candidate.stageId === material.stageId);
  const step = stage?.steps.find((candidate) => candidate.stepId === material.stepId);
  if (stage === undefined || step === undefined || stage.checkpointId !== material.checkpointId ||
      material.missionId !== input.preparation.missionId || material.exactRevision !== input.resolution.exactRevision ||
      material.requestDigest !== input.resolution.request.requestDigest || material.sessionDigest !== input.expectedSessionDigest) {
    return Object.freeze({ state: "invalid", code: "GUIDED_REVIEW_ANSWER_STALE",
      errors: Object.freeze(["Current question cannot be bound to the exact stored session, route, projection, and HEAD."]) });
  }
  const created = createGuidedReviewQuestionEnvelopeV1({ schemaVersion: 1, contractVersion: "guided.review.question.v1",
    missionId: material.missionId, exactRevision: material.exactRevision, requestDigest: material.requestDigest,
    sessionId: material.sessionId, sessionDigest: material.sessionDigest, stageId: material.stageId,
    checkpointId: material.checkpointId, stepId: material.stepId, projectionDigest: material.projectionDigest, question: step.question });
  if (created.state !== "ready") return Object.freeze({ state: "invalid", code: created.code, errors: created.errors });
  return Object.freeze({ state: "question_ready", questionEnvelope: created.value, automatedChecks: AUTOMATED_CHECKS_UNAVAILABLE });
}

export async function currentGuidedReviewQuestionHostV1(
  input: CurrentGuidedReviewQuestionHostInputV1,
  dependencies: Pick<GuidedReviewConversationHostDependenciesV1, "projectCurrent"> &
    Partial<Pick<GuidedReviewConversationHostDependenciesV1, "readAutomatedCheckSourceBytes">> = DEFAULT_DEPENDENCIES,
): Promise<CurrentGuidedReviewQuestionHostResultV1> {
  const projection = await dependencies.projectCurrent(input as ProjectCurrentGuidedReviewStepHostInputV1);
  if (projection.state !== "ready") return Object.freeze({ state: "invalid", code: projection.code, errors: projection.errors, projection });
  const question = questionForProjection(input, projection.projection);
  if (question.state !== "question_ready") return question;
  const checks = await automatedChecks(input, projection.projection,
    dependencies.readAutomatedCheckSourceBytes ?? DEFAULT_DEPENDENCIES.readAutomatedCheckSourceBytes);
  return checks.state === "invalid" ? checks : Object.freeze({ ...question, projection, automatedChecks: checks });
}

export async function revalidateCurrentGuidedReviewQuestionHostV1(
  input: RevalidateCurrentGuidedReviewQuestionHostInputV1,
  dependencies: Pick<GuidedReviewConversationHostDependenciesV1, "revalidateCurrent"> = DEFAULT_DEPENDENCIES,
): Promise<RevalidateCurrentGuidedReviewQuestionHostResultV1> {
  const projection = await dependencies.revalidateCurrent(input as ProjectCurrentGuidedReviewStepHostInputV1);
  if (projection.state !== "ready") return Object.freeze({ state: "invalid", code: projection.code, errors: projection.errors });
  const question = questionForProjection(input, projection.projection);
  if (question.state !== "question_ready" || question.questionEnvelope.questionDigest !== input.expectedQuestionDigest) {
    return Object.freeze({ state: "invalid", code: "GUIDED_REVIEW_ANSWER_STALE",
      errors: Object.freeze(["Supplied question digest is not the exact current read-only question context."]) });
  }
  return Object.freeze({ ...question, projection });
}

function decisionInput(disposition: GuidedReviewConversationDispositionV1, canonicalResponse: string, answer: GuidedReviewAnswerEnvelopeV1) {
  return Object.freeze({ disposition, observation: canonicalResponse,
    finding: disposition === "fail" || disposition === "not_observed" ? answer.finding : null,
    condition: disposition === "conditional_pass" ? answer.condition : null });
}

export async function answerGuidedReviewConversationHostV1(
  input: AnswerGuidedReviewConversationHostInputV1,
  dependencies: GuidedReviewConversationHostDependenciesV1 = DEFAULT_DEPENDENCIES,
): Promise<AnswerGuidedReviewConversationHostResultV1> {
  const question = validateGuidedReviewQuestionEnvelopeV1(input.questionEnvelope);
  const answer = validateGuidedReviewAnswerEnvelopeV1(input.answerEnvelope);
  if (question.state !== "ready") return invalid(question.code, question.errors.join(" "));
  if (answer.state !== "ready") return invalid(answer.code, answer.errors.join(" "));
  if (answer.value.questionDigest !== question.value.questionDigest || typeof input.decidedAt !== "string" || !TIMESTAMP.test(input.decidedAt) ||
      Number.isNaN(Date.parse(input.decidedAt))) return invalid("GUIDED_REVIEW_ANSWER_STALE", "Answer does not reference the displayed exact question or canonical decision time.");
  const parsed = parseGuidedReviewResponseV1(answer.value.rawResponse);
  if (parsed.state === "confirmation_required") return Object.freeze({ state: "confirmation_required",
    code: "GUIDED_REVIEW_ANSWER_CONFIRMATION_REQUIRED", questionEnvelope: question.value, acceptedAnswers: GUIDED_REVIEW_ACCEPTED_ANSWERS_V1 });
  if ((parsed.disposition === "fail" || parsed.disposition === "not_observed") && answer.value.finding === null) {
    return Object.freeze({ state: "follow_up_required", code: "GUIDED_REVIEW_ANSWER_FOLLOW_UP_REQUIRED", questionEnvelope: question.value,
      canonicalAnswer: parsed.canonicalResponse, requiredField: "finding" });
  }
  if (parsed.disposition === "conditional_pass" && answer.value.condition === null) {
    return Object.freeze({ state: "follow_up_required", code: "GUIDED_REVIEW_ANSWER_FOLLOW_UP_REQUIRED", questionEnvelope: question.value,
      canonicalAnswer: parsed.canonicalResponse, requiredField: "condition" });
  }
  const current = await dependencies.revalidateCurrent({ repositoryRoot: input.repositoryRoot, preparation: input.preparation,
    resolution: input.resolution, expectedSessionDigest: question.value.sessionDigest });
  if (current.state !== "ready") return invalid("GUIDED_REVIEW_ANSWER_STALE", current.errors.join(" "));
  const rebound = questionForProjection({ repositoryRoot: input.repositoryRoot, preparation: input.preparation,
    resolution: input.resolution, expectedSessionDigest: question.value.sessionDigest }, current.projection);
  if (rebound.state !== "question_ready" || canonicalJson(rebound.questionEnvelope) !== canonicalJson(question.value)) {
    return invalid("GUIDED_REVIEW_ANSWER_STALE", "Displayed question is no longer the exact current question, projection, session, step, or HEAD.");
  }
  const selected = decisionInput(parsed.disposition, parsed.canonicalResponse, answer.value);
  const decided = await dependencies.answerCurrent({ repositoryRoot: input.repositoryRoot, resolution: input.resolution,
    expectedSessionDigest: question.value.sessionDigest, ...selected, decidedAt: input.decidedAt });
  if (decided.state !== "ready") return invalid(decided.code === "GUIDED_REVIEW_ANSWER_STALE" ? decided.code : "GUIDED_REVIEW_ANSWER_STALE",
    decided.errors.join(" "));
  const session = decided.value;
  const decisionId = session.decisions.at(-1)?.decisionId ?? null;
  if (session.state === "completed") return Object.freeze({ state: "answered", priorQuestionDigest: question.value.questionDigest,
    decisionId, newSessionDigest: session.sessionDigest, completed: true, nextQuestionEnvelope: null,
    projection: Object.freeze({ state: "projection_unavailable", code: "GUIDED_REVIEW_PROJECTION_UNAVAILABLE",
      errors: Object.freeze(["Completed Guided Review has no next current-step projection."]) }) });
  const next = await currentGuidedReviewQuestionHostV1({ repositoryRoot: input.repositoryRoot, preparation: input.preparation,
    resolution: input.resolution, expectedSessionDigest: session.sessionDigest }, { projectCurrent: dependencies.projectCurrent });
  return next.state === "question_ready"
    ? Object.freeze({ state: "answered", priorQuestionDigest: question.value.questionDigest, decisionId,
      newSessionDigest: session.sessionDigest, completed: false, nextQuestionEnvelope: next.questionEnvelope, projection: next.projection })
    : Object.freeze({ state: "answered", priorQuestionDigest: question.value.questionDigest, decisionId,
      newSessionDigest: session.sessionDigest, completed: false, nextQuestionEnvelope: null,
      projection: next.projection ?? Object.freeze({ state: "projection_unavailable", code: "GUIDED_REVIEW_PROJECTION_UNAVAILABLE",
        errors: next.errors }) });
}
