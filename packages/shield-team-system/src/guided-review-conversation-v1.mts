import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalJson } from "./mission-v2.mjs";

export const GUIDED_REVIEW_QUESTION_CONTRACT_VERSION = "guided.review.question.v1" as const;
export const GUIDED_REVIEW_ANSWER_CONTRACT_VERSION = "guided.review.answer.v1" as const;
export const GUIDED_REVIEW_AUTOMATED_CHECK_CONTRACT_VERSION = "guided.review.automated-check.v1" as const;
export const GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE_CONTRACT_VERSION = "guided.review.automated-check-source.v1" as const;
export const GUIDED_REVIEW_FOLLOW_UP_CONTRACT_VERSION = "guided.review.follow-up.v1" as const;
export const GUIDED_REVIEW_ACCEPTED_ANSWERS_V1 = Object.freeze(["PASS", "FAIL", "NOT_OBSERVED", "CONDITIONAL_PASS"] as const);

export type GuidedReviewConversationDispositionV1 = "pass" | "fail" | "not_observed" | "conditional_pass";

export interface GuidedReviewQuestionEnvelopeInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_QUESTION_CONTRACT_VERSION;
  readonly missionId: string;
  readonly exactRevision: string;
  readonly requestDigest: string;
  readonly sessionId: string;
  readonly sessionDigest: string;
  readonly stageId: string;
  readonly checkpointId: string;
  readonly stepId: string;
  readonly projectionDigest: string;
  readonly question: string;
}

export interface GuidedReviewQuestionEnvelopeV1 extends GuidedReviewQuestionEnvelopeInputV1 {
  readonly questionDigest: string;
}

export interface GuidedReviewAnswerEnvelopeInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_ANSWER_CONTRACT_VERSION;
  readonly questionDigest: string;
  readonly rawResponse: string;
  readonly finding: string | null;
  readonly condition: string | null;
}

export interface GuidedReviewAnswerEnvelopeV1 extends GuidedReviewAnswerEnvelopeInputV1 {
  readonly answerDigest: string;
}

export interface GuidedReviewAutomatedCheckReceiptInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_AUTOMATED_CHECK_CONTRACT_VERSION;
  readonly authority: "none";
  readonly provenance: "host_exact_source_bytes";
  readonly missionId: string;
  readonly repositoryId: string;
  readonly canonicalRoot: string;
  readonly requestDigest: string;
  readonly sessionId: string;
  readonly sessionDigest: string;
  readonly exactRevision: string;
  readonly evidenceSourceId: string;
  readonly sourceByteSha256: string;
  readonly commandId: string;
  readonly command: string;
  readonly argv: readonly string[];
  readonly outcome: "passed" | "failed" | "not_run";
  readonly exitCode: number | null;
}

export interface GuidedReviewAutomatedCheckSourceEntryV1 {
  readonly commandId: string;
  readonly command: string;
  readonly argv: readonly string[];
  readonly outcome: "passed" | "failed" | "not_run";
  readonly exitCode: number | null;
}

export interface GuidedReviewAutomatedCheckSourceInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE_CONTRACT_VERSION;
  readonly authority: "none";
  readonly provenance: "persisted_advisory_command_observation";
  readonly missionId: string;
  readonly repositoryId: string;
  readonly canonicalRoot: string;
  readonly requestDigest: string;
  readonly sessionId: string;
  readonly sessionDigest: string;
  readonly exactRevision: string;
  readonly evidenceSourceId: string;
  readonly checks: readonly GuidedReviewAutomatedCheckSourceEntryV1[];
}

export interface GuidedReviewAutomatedCheckSourceV1 extends GuidedReviewAutomatedCheckSourceInputV1 {
  readonly sourceDigest: string;
}

export interface GuidedReviewAutomatedCheckReceiptV1 extends GuidedReviewAutomatedCheckReceiptInputV1 {
  readonly receiptDigest: string;
}

export interface GuidedReviewIssueIdentityV1 {
  readonly repositoryId: string;
  readonly number: number;
  readonly nodeId: string;
  readonly url: string;
}

export interface GuidedReviewFollowUpInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_FOLLOW_UP_CONTRACT_VERSION;
  readonly authority: "none";
  readonly effect: "external_issue_creation_not_authorized";
  readonly missionId: string;
  readonly repositoryId: string;
  readonly exactRevision: string;
  readonly sessionId: string;
  readonly sourceDecisionId: string;
  readonly sourceDecisionDigest: string;
  readonly finding: string;
  readonly blocking: false;
  readonly parentIssue: GuidedReviewIssueIdentityV1 | null;
  readonly linkedIssue: GuidedReviewIssueIdentityV1 | null;
}

export interface GuidedReviewFollowUpV1 extends GuidedReviewFollowUpInputV1 {
  readonly followUpDigest: string;
}

export type GuidedReviewConversationResultV1<T> = Readonly<{ state: "ready"; value: T }> |
  Readonly<{ state: "invalid"; code: string; errors: readonly string[] }>;

export type ParseGuidedReviewResponseResultV1 = Readonly<
  | { state: "recognized"; disposition: GuidedReviewConversationDispositionV1; canonicalResponse: typeof GUIDED_REVIEW_ACCEPTED_ANSWERS_V1[number] }
  | { state: "confirmation_required" }
>;

const QUESTION_FIELDS = ["schemaVersion", "contractVersion", "missionId", "exactRevision", "requestDigest", "sessionId", "sessionDigest",
  "stageId", "checkpointId", "stepId", "projectionDigest", "question"] as const;
const ANSWER_FIELDS = ["schemaVersion", "contractVersion", "questionDigest", "rawResponse", "finding", "condition"] as const;
const CHECK_FIELDS = ["schemaVersion", "contractVersion", "authority", "provenance", "missionId", "repositoryId", "canonicalRoot",
  "requestDigest", "sessionId", "sessionDigest", "exactRevision", "evidenceSourceId", "sourceByteSha256", "commandId", "command", "argv",
  "outcome", "exitCode"] as const;
const CHECK_SOURCE_FIELDS = ["schemaVersion", "contractVersion", "authority", "provenance", "missionId", "repositoryId", "canonicalRoot",
  "requestDigest", "sessionId", "sessionDigest", "exactRevision", "evidenceSourceId", "checks"] as const;
const CHECK_SOURCE_ENTRY_FIELDS = ["commandId", "command", "argv", "outcome", "exitCode"] as const;
const FOLLOW_UP_FIELDS = ["schemaVersion", "contractVersion", "authority", "effect", "missionId", "repositoryId", "exactRevision", "sessionId",
  "sourceDecisionId", "sourceDecisionDigest", "finding", "blocking", "parentIssue", "linkedIssue"] as const;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const BYTE_SHA256 = /^sha256:[0-9a-f]{64}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function exactText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum && !value.includes("\u0000");
}
function snapshot<T>(value: T): T {
  const output = JSON.parse(canonicalJson(value)) as T;
  const freeze = (candidate: unknown): void => {
    if (candidate !== null && typeof candidate === "object") {
      for (const child of Object.values(candidate)) freeze(child);
      Object.freeze(candidate);
    }
  };
  freeze(output);
  return output;
}
function digest(value: unknown): string { return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`; }
function invalid<T>(code: string, error: string): GuidedReviewConversationResultV1<T> {
  return Object.freeze({ state: "invalid", code, errors: Object.freeze([error]) });
}
function validQuestionInput(value: unknown): value is GuidedReviewQuestionEnvelopeInputV1 {
  return exact(value, QUESTION_FIELDS) && value.schemaVersion === 1 && value.contractVersion === GUIDED_REVIEW_QUESTION_CONTRACT_VERSION &&
    id(value.missionId) && typeof value.exactRevision === "string" && REVISION.test(value.exactRevision) &&
    typeof value.requestDigest === "string" && DIGEST.test(value.requestDigest) && id(value.sessionId) &&
    typeof value.sessionDigest === "string" && DIGEST.test(value.sessionDigest) && id(value.stageId) && id(value.checkpointId) && id(value.stepId) &&
    typeof value.projectionDigest === "string" && DIGEST.test(value.projectionDigest) && exactText(value.question, 500);
}

export function parseGuidedReviewResponseV1(input: unknown): ParseGuidedReviewResponseResultV1 {
  if (typeof input !== "string" || input.length === 0 || input.length > 8000 || !/^[\u0009\u0020A-Za-z_]+$/u.test(input)) {
    return Object.freeze({ state: "confirmation_required" });
  }
  const token = input.replace(/^[ \t]+|[ \t]+$/gu, "").toUpperCase();
  const disposition = token === "PASS" ? "pass" : token === "FAIL" ? "fail" : token === "NOT_OBSERVED" ? "not_observed" :
    token === "CONDITIONAL_PASS" ? "conditional_pass" : null;
  return disposition === null ? Object.freeze({ state: "confirmation_required" }) : Object.freeze({ state: "recognized", disposition,
    canonicalResponse: token as typeof GUIDED_REVIEW_ACCEPTED_ANSWERS_V1[number] });
}

function validAnswerInput(value: unknown): value is GuidedReviewAnswerEnvelopeInputV1 {
  if (!exact(value, ANSWER_FIELDS) || value.schemaVersion !== 1 || value.contractVersion !== GUIDED_REVIEW_ANSWER_CONTRACT_VERSION ||
      typeof value.questionDigest !== "string" || !DIGEST.test(value.questionDigest) || typeof value.rawResponse !== "string" ||
      value.rawResponse.length === 0 || value.rawResponse.length > 8000 || value.rawResponse.includes("\u0000") ||
      (value.finding !== null && !exactText(value.finding, 4000)) || (value.condition !== null && !exactText(value.condition, 4000))) return false;
  const parsed = parseGuidedReviewResponseV1(value.rawResponse);
  if (parsed.state === "confirmation_required") return value.finding === null && value.condition === null;
  if (parsed.disposition === "pass") return value.finding === null && value.condition === null;
  if (parsed.disposition === "conditional_pass") return value.finding === null;
  return value.condition === null;
}

export function createGuidedReviewQuestionEnvelopeV1(input: unknown): GuidedReviewConversationResultV1<GuidedReviewQuestionEnvelopeV1> {
  if (!validQuestionInput(input)) return invalid("MALFORMED_GUIDED_REVIEW_QUESTION", "Guided Review question envelope is malformed, open, or unbound.");
  const body = snapshot(input);
  return Object.freeze({ state: "ready", value: snapshot({ ...body, questionDigest: digest(body) }) });
}

export function validateGuidedReviewQuestionEnvelopeV1(input: unknown): GuidedReviewConversationResultV1<GuidedReviewQuestionEnvelopeV1> {
  if (!plain(input) || typeof input.questionDigest !== "string" || !DIGEST.test(input.questionDigest)) {
    return invalid("MALFORMED_GUIDED_REVIEW_QUESTION", "Guided Review question envelope digest is malformed.");
  }
  const { questionDigest, ...body } = input;
  const created = createGuidedReviewQuestionEnvelopeV1(body);
  return created.state === "ready" && created.value.questionDigest === questionDigest && canonicalJson(input) === canonicalJson(created.value)
    ? created : invalid("MALFORMED_GUIDED_REVIEW_QUESTION", "Guided Review question envelope content identity is invalid.");
}

export function createGuidedReviewAnswerEnvelopeV1(input: unknown): GuidedReviewConversationResultV1<GuidedReviewAnswerEnvelopeV1> {
  if (!validAnswerInput(input)) return invalid("MALFORMED_GUIDED_REVIEW_ANSWER", "Guided Review answer envelope is malformed, open, or contains invalid detail bytes.");
  const body = snapshot(input);
  return Object.freeze({ state: "ready", value: snapshot({ ...body, answerDigest: digest(body) }) });
}

export function validateGuidedReviewAnswerEnvelopeV1(input: unknown): GuidedReviewConversationResultV1<GuidedReviewAnswerEnvelopeV1> {
  if (!plain(input) || typeof input.answerDigest !== "string" || !DIGEST.test(input.answerDigest)) {
    return invalid("MALFORMED_GUIDED_REVIEW_ANSWER", "Guided Review answer envelope digest is malformed.");
  }
  const { answerDigest, ...body } = input;
  const created = createGuidedReviewAnswerEnvelopeV1(body);
  return created.state === "ready" && created.value.answerDigest === answerDigest && canonicalJson(input) === canonicalJson(created.value)
    ? created : invalid("MALFORMED_GUIDED_REVIEW_ANSWER", "Guided Review answer envelope content identity is invalid.");
}

function validCheckResult(value: Record<string, unknown>): boolean {
  if (!id(value.commandId) || !exactText(value.command, 256) || !Array.isArray(value.argv) || value.argv.length > 64 ||
      !value.argv.every((entry) => typeof entry === "string" && entry.length <= 1000 && !entry.includes("\u0000")) ||
      !["passed", "failed", "not_run"].includes(value.outcome as string)) return false;
  if (value.outcome === "not_run") return value.exitCode === null;
  return Number.isSafeInteger(value.exitCode) && (value.outcome === "passed" ? value.exitCode === 0 : value.exitCode !== 0);
}

function validCheckInput(value: unknown): value is GuidedReviewAutomatedCheckReceiptInputV1 {
  return exact(value, CHECK_FIELDS) && value.schemaVersion === 1 && value.contractVersion === GUIDED_REVIEW_AUTOMATED_CHECK_CONTRACT_VERSION &&
    value.authority === "none" && value.provenance === "host_exact_source_bytes" && id(value.missionId) && exactText(value.repositoryId, 256) &&
    typeof value.canonicalRoot === "string" && value.canonicalRoot.startsWith("/") && value.canonicalRoot.length <= 2000 &&
    typeof value.requestDigest === "string" && DIGEST.test(value.requestDigest) && id(value.sessionId) &&
    typeof value.sessionDigest === "string" && DIGEST.test(value.sessionDigest) && typeof value.exactRevision === "string" &&
    REVISION.test(value.exactRevision) && id(value.evidenceSourceId) && typeof value.sourceByteSha256 === "string" &&
    BYTE_SHA256.test(value.sourceByteSha256) && validCheckResult(value);
}

function validCheckSourceInput(value: unknown): value is GuidedReviewAutomatedCheckSourceInputV1 {
  if (!exact(value, CHECK_SOURCE_FIELDS) || value.schemaVersion !== 1 ||
      value.contractVersion !== GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE_CONTRACT_VERSION || value.authority !== "none" ||
      value.provenance !== "persisted_advisory_command_observation" || !id(value.missionId) || !exactText(value.repositoryId, 256) ||
      typeof value.canonicalRoot !== "string" || !value.canonicalRoot.startsWith("/") || value.canonicalRoot.length > 2000 ||
      typeof value.requestDigest !== "string" || !DIGEST.test(value.requestDigest) || !id(value.sessionId) ||
      typeof value.sessionDigest !== "string" || !DIGEST.test(value.sessionDigest) || typeof value.exactRevision !== "string" ||
      !REVISION.test(value.exactRevision) || !id(value.evidenceSourceId) || !Array.isArray(value.checks) ||
      value.checks.length === 0 || value.checks.length > 64) return false;
  const ids = new Set<string>();
  for (const entry of value.checks) {
    if (!exact(entry, CHECK_SOURCE_ENTRY_FIELDS) || !validCheckResult(entry) || ids.has(entry.commandId as string)) return false;
    ids.add(entry.commandId as string);
  }
  return true;
}

export function createGuidedReviewAutomatedCheckSourceV1(input: unknown): GuidedReviewConversationResultV1<GuidedReviewAutomatedCheckSourceV1> {
  if (!validCheckSourceInput(input)) return invalid("MALFORMED_GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE", "Automated check source is malformed, open, authoritative, or outcome-inconsistent.");
  const body = snapshot(input);
  return Object.freeze({ state: "ready", value: snapshot({ ...body, sourceDigest: digest(body) }) });
}

export function validateGuidedReviewAutomatedCheckSourceV1(input: unknown): GuidedReviewConversationResultV1<GuidedReviewAutomatedCheckSourceV1> {
  if (!plain(input) || typeof input.sourceDigest !== "string" || !DIGEST.test(input.sourceDigest)) {
    return invalid("MALFORMED_GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE", "Automated check source digest is malformed.");
  }
  const { sourceDigest, ...body } = input;
  const created = createGuidedReviewAutomatedCheckSourceV1(body);
  return created.state === "ready" && created.value.sourceDigest === sourceDigest && canonicalJson(input) === canonicalJson(created.value)
    ? created : invalid("MALFORMED_GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE", "Automated check source content identity is invalid.");
}

export function createGuidedReviewAutomatedCheckReceiptV1(input: unknown): GuidedReviewConversationResultV1<GuidedReviewAutomatedCheckReceiptV1> {
  if (!validCheckInput(input)) return invalid("MALFORMED_GUIDED_REVIEW_AUTOMATED_CHECK", "Automated check receipt is malformed, open, or outcome-inconsistent.");
  const body = snapshot(input);
  return Object.freeze({ state: "ready", value: snapshot({ ...body, receiptDigest: digest(body) }) });
}

export function validateGuidedReviewAutomatedCheckReceiptV1(input: unknown): GuidedReviewConversationResultV1<GuidedReviewAutomatedCheckReceiptV1> {
  if (!plain(input) || typeof input.receiptDigest !== "string" || !DIGEST.test(input.receiptDigest)) {
    return invalid("MALFORMED_GUIDED_REVIEW_AUTOMATED_CHECK", "Automated check receipt digest is malformed.");
  }
  const { receiptDigest, ...body } = input;
  const created = createGuidedReviewAutomatedCheckReceiptV1(body);
  return created.state === "ready" && created.value.receiptDigest === receiptDigest && canonicalJson(input) === canonicalJson(created.value)
    ? created : invalid("MALFORMED_GUIDED_REVIEW_AUTOMATED_CHECK", "Automated check receipt content identity is invalid.");
}

function validIssue(value: unknown): value is GuidedReviewIssueIdentityV1 {
  return exact(value, ["repositoryId", "number", "nodeId", "url"]) && typeof value.repositoryId === "string" && REPOSITORY.test(value.repositoryId) &&
    Number.isSafeInteger(value.number) && (value.number as number) > 0 && id(value.nodeId) && exactText(value.url, 2000) &&
    value.url === `https://github.com/${value.repositoryId}/issues/${value.number}`;
}

function validFollowUpInput(value: unknown): value is GuidedReviewFollowUpInputV1 {
  return exact(value, FOLLOW_UP_FIELDS) && value.schemaVersion === 1 && value.contractVersion === GUIDED_REVIEW_FOLLOW_UP_CONTRACT_VERSION &&
    value.authority === "none" && value.effect === "external_issue_creation_not_authorized" && id(value.missionId) &&
    typeof value.repositoryId === "string" && REPOSITORY.test(value.repositoryId) && typeof value.exactRevision === "string" &&
    REVISION.test(value.exactRevision) && id(value.sessionId) && id(value.sourceDecisionId) && typeof value.sourceDecisionDigest === "string" &&
    DIGEST.test(value.sourceDecisionDigest) && exactText(value.finding, 4000) && value.blocking === false &&
    (value.parentIssue === null || validIssue(value.parentIssue)) && (value.linkedIssue === null || validIssue(value.linkedIssue));
}

export function createGuidedReviewFollowUpV1(input: unknown): GuidedReviewConversationResultV1<GuidedReviewFollowUpV1> {
  if (!validFollowUpInput(input)) return invalid("MALFORMED_GUIDED_REVIEW_FOLLOW_UP", "Guided Review follow-up is malformed, authoritative, open, or identity-incomplete.");
  const body = snapshot(input);
  return Object.freeze({ state: "ready", value: snapshot({ ...body, followUpDigest: digest(body) }) });
}

export function validateGuidedReviewFollowUpV1(input: unknown): GuidedReviewConversationResultV1<GuidedReviewFollowUpV1> {
  if (!plain(input) || typeof input.followUpDigest !== "string" || !DIGEST.test(input.followUpDigest)) {
    return invalid("MALFORMED_GUIDED_REVIEW_FOLLOW_UP", "Guided Review follow-up digest is malformed.");
  }
  const { followUpDigest, ...body } = input;
  const created = createGuidedReviewFollowUpV1(body);
  return created.state === "ready" && created.value.followUpDigest === followUpDigest && canonicalJson(input) === canonicalJson(created.value)
    ? created : invalid("MALFORMED_GUIDED_REVIEW_FOLLOW_UP", "Guided Review follow-up content identity is invalid.");
}
