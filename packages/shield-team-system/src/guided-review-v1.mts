import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalJson } from "./mission-v2.mjs";

export const GUIDED_REVIEW_SCHEMA_VERSION = 1 as const;
export const GUIDED_REVIEW_CONTRACT_VERSION = "guided.review.v1" as const;
export const GUIDED_REVIEW_PLAYBOOK_KINDS = ["product_qa", "code", "document"] as const;
export const GUIDED_REVIEW_PROFILES = ["exploration", "acceptance", "publication"] as const;
export const GUIDED_REVIEW_DISPOSITIONS = ["pass", "fail", "conditional_pass", "not_observed"] as const;
export const GUIDED_REVIEW_PUBLICATION_CHOICES = ["yes", "no", "cancel"] as const;

export type GuidedReviewPlaybookKindV1 = (typeof GUIDED_REVIEW_PLAYBOOK_KINDS)[number];
export type GuidedReviewProfileV1 = (typeof GUIDED_REVIEW_PROFILES)[number];
export type GuidedReviewDispositionV1 = (typeof GUIDED_REVIEW_DISPOSITIONS)[number];
export type GuidedReviewPublicationChoiceV1 = (typeof GUIDED_REVIEW_PUBLICATION_CHOICES)[number];
export type GuidedReviewStepStateV1 = "pending" | "passed" | "failed" | "conditional" | "not_observed" | "stale";
export type GuidedReviewStageStateV1 = "locked" | "active" | "passed" | "blocked" | "stale";

export interface GuidedReviewCriterionV1 {
  readonly criterionId: string;
  readonly text: string;
}

export interface GuidedReviewStepV1 {
  readonly stepId: string;
  readonly title: string;
  readonly question: string;
  readonly instructions: readonly string[];
  readonly criterionRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly relevantPaths: readonly string[];
  readonly dependsOnStepIds: readonly string[];
}

export interface GuidedReviewStageV1 {
  readonly stageId: string;
  readonly checkpointId: string;
  readonly title: string;
  readonly purpose: string;
  readonly steps: readonly GuidedReviewStepV1[];
}

export interface GuidedReviewRuntimeHandoffV1 {
  readonly status: "ready" | "blocked" | "externally_uncertain";
  readonly receiptDigest: string;
  readonly exactRevision: string;
  readonly environmentRef: string;
  readonly launchCommandRef: string;
  readonly healthProbeRef: string;
  readonly reviewUrl: string;
  readonly teardownRef: string;
  readonly externalEffectPolicyRef: string;
}

export interface GuidedReviewPlaybookInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_CONTRACT_VERSION;
  readonly playbookId: string;
  readonly kind: GuidedReviewPlaybookKindV1;
  readonly title: string;
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryId: string;
  readonly branch: string;
  readonly exactRevision: string;
  readonly participantRelationship: "builder" | "independent_reviewer" | "product_reviewer" | "document_reviewer";
  readonly acceptanceCriteria: readonly GuidedReviewCriterionV1[];
  readonly runtimeHandoff: GuidedReviewRuntimeHandoffV1;
  readonly stages: readonly GuidedReviewStageV1[];
}

export interface GuidedReviewPlaybookV1 extends GuidedReviewPlaybookInputV1 {
  readonly playbookDigest: string;
}

export interface GuidedReviewDecisionV1 {
  readonly decisionId: string;
  readonly stepId: string;
  readonly exactRevision: string;
  readonly disposition: GuidedReviewDispositionV1;
  readonly observation: string;
  readonly evidenceRefs: readonly string[];
  readonly finding: string | null;
  readonly condition: string | null;
  readonly decidedAt: string;
}

export interface GuidedReviewRevisionV1 {
  readonly previousRevision: string;
  readonly exactRevision: string;
  readonly rationale: string;
  readonly staleStepIds: readonly string[];
  readonly revisedAt: string;
}

export interface GuidedReviewSessionV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_CONTRACT_VERSION;
  readonly sessionId: string;
  readonly playbookDigest: string;
  readonly missionId: string;
  readonly subjectId: string;
  readonly profile: GuidedReviewProfileV1;
  readonly exactRevision: string;
  readonly runtimeHandoff: GuidedReviewRuntimeHandoffV1;
  readonly state: "active" | "blocked" | "completed" | "cancelled";
  readonly currentStageId: string | null;
  readonly currentStepId: string | null;
  readonly stepStates: Readonly<Record<string, GuidedReviewStepStateV1>>;
  readonly stageStates: Readonly<Record<string, GuidedReviewStageStateV1>>;
  readonly decisions: readonly GuidedReviewDecisionV1[];
  readonly revisions: readonly GuidedReviewRevisionV1[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly sessionDigest: string;
}

export interface GuidedReviewPublicationForkV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_CONTRACT_VERSION;
  readonly authority: "none";
  readonly choice: GuidedReviewPublicationChoiceV1;
  readonly state: "pin_required" | "cancelled" | "blocked";
  readonly exactRevision: string;
  readonly guidedReviewDisposition: "completed" | "skipped_by_operator" | "cancelled" | "ineligible";
  readonly sessionDigest: string | null;
  readonly pinPurpose: "guided_review_and_publication" | "publication" | null;
  readonly reasonCode: string | null;
  readonly summary: string;
  readonly forkDigest: string;
}

export type GuidedReviewResultV1<T> =
  | Readonly<{ state: "ready"; value: T }>
  | Readonly<{ state: "invalid"; code: string; errors: readonly string[] }>;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@# +:=,-]+$/u;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Reflect.ownKeys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field));
}

function id(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function revision(value: unknown): value is string { return typeof value === "string" && REVISION.test(value); }
function digest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function text(value: unknown, max = 4000): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function uniqueStrings(value: unknown, validator: (entry: unknown) => entry is string, allowEmpty = true): value is readonly string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= 256 &&
    value.every(validator) && new Set(value).size === value.length;
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`;
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

function invalid<T>(code: string, ...errors: string[]): GuidedReviewResultV1<T> {
  return { state: "invalid", code, errors: Object.freeze(errors) };
}

function validCriterion(value: unknown): value is GuidedReviewCriterionV1 {
  return exact(value, ["criterionId", "text"]) && id(value.criterionId) && text(value.text, 2000);
}

function validStep(value: unknown): value is GuidedReviewStepV1 {
  return exact(value, ["stepId", "title", "question", "instructions", "criterionRefs", "evidenceRefs", "relevantPaths", "dependsOnStepIds"]) &&
    id(value.stepId) && text(value.title, 200) && text(value.question, 500) && value.question.endsWith("?") &&
    (value.question.match(/\?/gu)?.length ?? 0) === 1 &&
    uniqueStrings(value.instructions, (entry): entry is string => text(entry, 2000), false) &&
    uniqueStrings(value.criterionRefs, id) && uniqueStrings(value.evidenceRefs, id) &&
    uniqueStrings(value.relevantPaths, (entry): entry is string => typeof entry === "string" && SAFE_PATH.test(entry) && entry.length <= 512) &&
    uniqueStrings(value.dependsOnStepIds, id);
}

function validStage(value: unknown): value is GuidedReviewStageV1 {
  return exact(value, ["stageId", "checkpointId", "title", "purpose", "steps"]) && id(value.stageId) && id(value.checkpointId) && text(value.title, 200) &&
    text(value.purpose, 1000) && Array.isArray(value.steps) && value.steps.length > 0 && value.steps.length <= 64 &&
    value.steps.every(validStep) && new Set(value.steps.map((step) => step.stepId)).size === value.steps.length;
}

function validRuntime(value: unknown): value is GuidedReviewRuntimeHandoffV1 {
  return exact(value, ["status", "receiptDigest", "exactRevision", "environmentRef", "launchCommandRef", "healthProbeRef", "reviewUrl", "teardownRef", "externalEffectPolicyRef"]) &&
    ["ready", "blocked", "externally_uncertain"].includes(value.status as string) && digest(value.receiptDigest) &&
    revision(value.exactRevision) && id(value.environmentRef) && id(value.launchCommandRef) && id(value.healthProbeRef) &&
    typeof value.reviewUrl === "string" && value.reviewUrl.length > 0 && value.reviewUrl.length <= 2048 &&
    id(value.teardownRef) && id(value.externalEffectPolicyRef);
}

function validPlaybookInput(value: unknown): value is GuidedReviewPlaybookInputV1 {
  const fields = ["schemaVersion", "contractVersion", "playbookId", "kind", "title", "missionId", "subjectId", "repositoryId", "branch", "exactRevision", "participantRelationship", "acceptanceCriteria", "runtimeHandoff", "stages"];
  if (!exact(value, fields) || value.schemaVersion !== 1 || value.contractVersion !== GUIDED_REVIEW_CONTRACT_VERSION ||
      !id(value.playbookId) || !GUIDED_REVIEW_PLAYBOOK_KINDS.includes(value.kind as GuidedReviewPlaybookKindV1) ||
      !text(value.title, 200) || !id(value.missionId) || !id(value.subjectId) ||
      typeof value.repositoryId !== "string" || !REPOSITORY.test(value.repositoryId) || !id(value.branch) || !revision(value.exactRevision) ||
      !["builder", "independent_reviewer", "product_reviewer", "document_reviewer"].includes(value.participantRelationship as string) ||
      !Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.length === 0 || !value.acceptanceCriteria.every(validCriterion) ||
      new Set(value.acceptanceCriteria.map((criterion) => criterion.criterionId)).size !== value.acceptanceCriteria.length ||
      !validRuntime(value.runtimeHandoff) || !Array.isArray(value.stages) || value.stages.length === 0 || value.stages.length > 32 ||
      !value.stages.every(validStage) || new Set(value.stages.map((stage) => stage.stageId)).size !== value.stages.length ||
      new Set(value.stages.map((stage) => stage.checkpointId)).size !== value.stages.length) return false;
  const criteria = new Set(value.acceptanceCriteria.map((criterion) => criterion.criterionId));
  const steps = value.stages.flatMap((stage) => stage.steps);
  const stepIds = new Set(steps.map((step) => step.stepId));
  if (stepIds.size !== steps.length || value.runtimeHandoff.exactRevision !== value.exactRevision) return false;
  return steps.every((step) => step.criterionRefs.every((criterion) => criteria.has(criterion)) &&
    step.dependsOnStepIds.every((dependency) => stepIds.has(dependency) && dependency !== step.stepId));
}

export function createGuidedReviewPlaybookV1(input: unknown): GuidedReviewResultV1<GuidedReviewPlaybookV1> {
  if (!validPlaybookInput(input)) return invalid("MALFORMED_PLAYBOOK", "Guided Review playbook is malformed or not closed.");
  const orderedSteps = input.stages.flatMap((stage) => stage.steps);
  const positions = new Map(orderedSteps.map((step, index) => [step.stepId, index]));
  if (orderedSteps.some((step) => step.dependsOnStepIds.some((dependency) => (positions.get(dependency) ?? Infinity) >= (positions.get(step.stepId) ?? -1)))) {
    return invalid("FORWARD_OR_CYCLIC_DEPENDENCY", "Each step dependency must refer to an earlier step in the visible route.");
  }
  const body = snapshot(input);
  return { state: "ready", value: snapshot({ ...body, playbookDigest: sha256(body) }) };
}

function playbookValid(value: unknown): value is GuidedReviewPlaybookV1 {
  if (!plain(value) || !Object.hasOwn(value, "playbookDigest")) return false;
  const { playbookDigest, ...body } = value;
  return digest(playbookDigest) && validPlaybookInput(body) && sha256(body) === playbookDigest;
}

function route(playbook: GuidedReviewPlaybookV1, states: Readonly<Record<string, GuidedReviewStepStateV1>>): {
  state: GuidedReviewSessionV1["state"];
  currentStageId: string | null;
  currentStepId: string | null;
  stageStates: Record<string, GuidedReviewStageStateV1>;
} {
  const stageStates: Record<string, GuidedReviewStageStateV1> = {};
  let currentStageId: string | null = null;
  let currentStepId: string | null = null;
  let blocked = false;
  for (const stage of playbook.stages) {
    const values = stage.steps.map((step) => states[step.stepId]);
    let stageState: GuidedReviewStageStateV1;
    if (values.some((value) => value === "failed" || value === "not_observed")) stageState = "blocked";
    else if (values.some((value) => value === "stale")) stageState = "stale";
    else if (values.every((value) => value === "passed" || value === "conditional")) stageState = "passed";
    else if (currentStageId === null && !blocked) stageState = "active";
    else stageState = "locked";
    stageStates[stage.stageId] = stageState;
    if (stageState === "blocked" || stageState === "stale") blocked = true;
    if (currentStageId === null && (stageState === "active" || stageState === "stale" || stageState === "blocked")) {
      currentStageId = stage.stageId;
      currentStepId = stage.steps.find((step) => ["pending", "stale", "failed", "not_observed"].includes(states[step.stepId] ?? "pending"))?.stepId ?? null;
    }
  }
  if (currentStepId === null && Object.values(stageStates).every((value) => value === "passed")) {
    return { state: "completed", currentStageId: null, currentStepId: null, stageStates };
  }
  return { state: blocked ? "blocked" : "active", currentStageId, currentStepId, stageStates };
}

function sessionBody(session: Omit<GuidedReviewSessionV1, "sessionDigest">): Omit<GuidedReviewSessionV1, "sessionDigest"> {
  return snapshot(session);
}

function withSessionDigest(session: Omit<GuidedReviewSessionV1, "sessionDigest">): GuidedReviewSessionV1 {
  const body = sessionBody(session);
  return snapshot({ ...body, sessionDigest: sha256(body) });
}

function validSession(playbook: GuidedReviewPlaybookV1, session: unknown): session is GuidedReviewSessionV1 {
  if (!plain(session) || !digest(session.sessionDigest)) return false;
  const { sessionDigest, ...body } = session;
  if (sha256(body) !== sessionDigest || session.playbookDigest !== playbook.playbookDigest ||
      session.missionId !== playbook.missionId || session.subjectId !== playbook.subjectId || !revision(session.exactRevision) ||
      !validRuntime(session.runtimeHandoff) || session.runtimeHandoff.exactRevision !== session.exactRevision ||
      !GUIDED_REVIEW_PROFILES.includes(session.profile as GuidedReviewProfileV1) || !id(session.sessionId) || !timestamp(session.startedAt) || !timestamp(session.updatedAt) ||
      !["active", "blocked", "completed", "cancelled"].includes(session.state as string) ||
      !(session.currentStageId === null || id(session.currentStageId)) || !(session.currentStepId === null || id(session.currentStepId)) ||
      !plain(session.stepStates) || !plain(session.stageStates) || !Array.isArray(session.decisions) || !Array.isArray(session.revisions) ||
      !session.decisions.every(validDecision) || new Set(session.decisions.map((decision) => decision.decisionId)).size !== session.decisions.length ||
      !session.revisions.every(validRevisionRecord)) return false;
  if (session.profile !== "exploration" && session.runtimeHandoff.status !== "ready") return false;
  const expectedSteps = playbook.stages.flatMap((stage) => stage.steps.map((step) => step.stepId)).sort();
  const expectedStages = playbook.stages.map((stage) => stage.stageId).sort();
  if (canonicalJson(Object.keys(session.stepStates).sort()) !== canonicalJson(expectedSteps) ||
      canonicalJson(Object.keys(session.stageStates).sort()) !== canonicalJson(expectedStages) ||
      Object.values(session.stepStates).some((state) => !["pending", "passed", "failed", "conditional", "not_observed", "stale"].includes(state as string)) ||
      Object.values(session.stageStates).some((state) => !["locked", "active", "passed", "blocked", "stale"].includes(state as string)) ||
      session.decisions.some((decision) => !expectedSteps.includes(decision.stepId)) ||
      session.revisions.some((entry) => entry.staleStepIds.some((stepId) => !expectedSteps.includes(stepId)))) return false;
  let expectedRevision = playbook.exactRevision;
  const admittedRevisions = new Set([expectedRevision]);
  for (const entry of session.revisions) {
    if (entry.previousRevision !== expectedRevision || entry.exactRevision === entry.previousRevision) return false;
    expectedRevision = entry.exactRevision;
    admittedRevisions.add(expectedRevision);
  }
  if (session.exactRevision !== expectedRevision || session.decisions.some((decision) => !admittedRevisions.has(decision.exactRevision))) return false;
  const startedAt = session.startedAt as string;
  const eventTimes = [startedAt, ...session.decisions.map((decision) => decision.decidedAt), ...session.revisions.map((entry) => entry.revisedAt)];
  if (eventTimes.some((value) => value < startedAt) || session.updatedAt !== [...eventTimes].sort().at(-1)) return false;
  const latestByStep = new Map<string, GuidedReviewDecisionV1>();
  for (const decision of session.decisions) latestByStep.set(decision.stepId, decision);
  const currentlyStaled = new Set(session.revisions.at(-1)?.staleStepIds ?? []);
  const decisionState = (decision: GuidedReviewDecisionV1): GuidedReviewStepStateV1 => decision.disposition === "pass" ? "passed" :
    decision.disposition === "conditional_pass" ? "conditional" : decision.disposition === "fail" ? "failed" : "not_observed";
  for (const stepId of expectedSteps) {
    const state = session.stepStates[stepId];
    const latest = latestByStep.get(stepId);
    if (state === "pending" && latest !== undefined) return false;
    if (state === "stale" && (!currentlyStaled.has(stepId) || latest?.exactRevision === session.exactRevision)) return false;
    if (state !== "pending" && state !== "stale" && (latest === undefined || decisionState(latest) !== state)) return false;
    if (currentlyStaled.has(stepId) && state !== "stale" && latest?.exactRevision !== session.exactRevision) return false;
  }
  const derived = route(playbook, session.stepStates as Readonly<Record<string, GuidedReviewStepStateV1>>);
  return session.state === derived.state && session.currentStageId === derived.currentStageId && session.currentStepId === derived.currentStepId &&
    canonicalJson(session.stageStates) === canonicalJson(derived.stageStates);
}

export function startGuidedReviewSessionV1(playbookInput: unknown, input: unknown): GuidedReviewResultV1<GuidedReviewSessionV1> {
  if (!playbookValid(playbookInput)) return invalid("INVALID_PLAYBOOK", "Playbook digest or shape is invalid.");
  if (!exact(input, ["sessionId", "profile", "startedAt"]) || !id(input.sessionId) ||
      !GUIDED_REVIEW_PROFILES.includes(input.profile as GuidedReviewProfileV1) || !timestamp(input.startedAt)) {
    return invalid("MALFORMED_SESSION_START", "Session start input is malformed or not closed.");
  }
  if (input.profile !== "exploration" && playbookInput.runtimeHandoff.status !== "ready") {
    return invalid("RUNTIME_NOT_READY", "Acceptance and publication review require a ready builder runtime handoff.");
  }
  const stepStates = Object.fromEntries(playbookInput.stages.flatMap((stage) => stage.steps.map((step) => [step.stepId, "pending"]))) as Record<string, GuidedReviewStepStateV1>;
  const derived = route(playbookInput, stepStates);
  return { state: "ready", value: withSessionDigest({
    schemaVersion: 1,
    contractVersion: GUIDED_REVIEW_CONTRACT_VERSION,
    sessionId: input.sessionId,
    playbookDigest: playbookInput.playbookDigest,
    missionId: playbookInput.missionId,
    subjectId: playbookInput.subjectId,
    profile: input.profile as GuidedReviewProfileV1,
    exactRevision: playbookInput.exactRevision,
    runtimeHandoff: playbookInput.runtimeHandoff,
    state: derived.state,
    currentStageId: derived.currentStageId,
    currentStepId: derived.currentStepId,
    stepStates,
    stageStates: derived.stageStates,
    decisions: [],
    revisions: [],
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
  }) };
}

function validDecision(value: unknown): value is GuidedReviewDecisionV1 {
  if (!(exact(value, ["decisionId", "stepId", "exactRevision", "disposition", "observation", "evidenceRefs", "finding", "condition", "decidedAt"]) &&
    id(value.decisionId) && id(value.stepId) && revision(value.exactRevision) && GUIDED_REVIEW_DISPOSITIONS.includes(value.disposition as GuidedReviewDispositionV1) &&
    text(value.observation, 8000) && uniqueStrings(value.evidenceRefs, id) && (value.finding === null || text(value.finding, 4000)) &&
    (value.condition === null || text(value.condition, 4000)) && timestamp(value.decidedAt))) return false;
  if ((value.disposition === "fail" || value.disposition === "not_observed") !== (value.finding !== null)) return false;
  return (value.disposition === "conditional_pass") === (value.condition !== null);
}

function validRevisionRecord(value: unknown): value is GuidedReviewRevisionV1 {
  return exact(value, ["previousRevision", "exactRevision", "rationale", "staleStepIds", "revisedAt"]) &&
    revision(value.previousRevision) && revision(value.exactRevision) && text(value.rationale, 4000) &&
    uniqueStrings(value.staleStepIds, id, false) && timestamp(value.revisedAt);
}

export function decideGuidedReviewStepV1(playbookInput: unknown, sessionInput: unknown, decisionInput: unknown): GuidedReviewResultV1<GuidedReviewSessionV1> {
  if (!playbookValid(playbookInput)) return invalid("INVALID_PLAYBOOK", "Playbook digest or shape is invalid.");
  if (!validSession(playbookInput, sessionInput)) return invalid("INVALID_SESSION", "Session digest or binding is invalid.");
  if (!validDecision(decisionInput)) return invalid("MALFORMED_DECISION", "Step decision is malformed or not closed.");
  if (sessionInput.state === "completed" || sessionInput.state === "cancelled") return invalid("SESSION_TERMINAL", "Terminal sessions cannot accept decisions.");
  if (decisionInput.stepId !== sessionInput.currentStepId) return invalid("OUT_OF_ORDER_DECISION", "Only the currently displayed question may be decided.");
  if (decisionInput.exactRevision !== sessionInput.exactRevision) return invalid("DECISION_REVISION_MISMATCH", "Step decision must bind the session's exact revision.");
  if (sessionInput.decisions.some((decision) => decision.decisionId === decisionInput.decisionId)) return invalid("DUPLICATE_DECISION", "Decision ID was already consumed.");
  if (decisionInput.disposition === "fail" && decisionInput.finding === null) return invalid("FINDING_REQUIRED", "FAIL requires a durable finding.");
  if (decisionInput.disposition === "conditional_pass" && decisionInput.condition === null) return invalid("CONDITION_REQUIRED", "Conditional PASS requires a durable condition.");
  if (decisionInput.disposition === "not_observed" && decisionInput.finding === null) return invalid("FINDING_REQUIRED", "Not observed requires a durable finding.");
  if (["pass", "conditional_pass"].includes(decisionInput.disposition) && decisionInput.finding !== null) return invalid("UNEXPECTED_FINDING", "PASS dispositions cannot carry a blocking finding.");
  if (["pass", "fail", "not_observed"].includes(decisionInput.disposition) && decisionInput.condition !== null) return invalid("UNEXPECTED_CONDITION", "Only conditional PASS may carry a condition.");
  const stepState: GuidedReviewStepStateV1 = decisionInput.disposition === "pass" ? "passed" :
    decisionInput.disposition === "conditional_pass" ? "conditional" : decisionInput.disposition === "fail" ? "failed" : "not_observed";
  const stepStates = { ...sessionInput.stepStates, [decisionInput.stepId]: stepState };
  const derived = route(playbookInput, stepStates);
  const { sessionDigest: _sessionDigest, ...sessionBodyInput } = sessionInput;
  return { state: "ready", value: withSessionDigest({
    ...sessionBodyInput,
    exactRevision: sessionInput.exactRevision,
    state: derived.state,
    currentStageId: derived.currentStageId,
    currentStepId: derived.currentStepId,
    stepStates,
    stageStates: derived.stageStates,
    decisions: [...sessionInput.decisions, snapshot(decisionInput)],
    revisions: [...sessionInput.revisions],
    updatedAt: decisionInput.decidedAt,
  }) };
}

export function reviseGuidedReviewSessionV1(playbookInput: unknown, sessionInput: unknown, input: unknown): GuidedReviewResultV1<GuidedReviewSessionV1> {
  if (!playbookValid(playbookInput)) return invalid("INVALID_PLAYBOOK", "Playbook digest or shape is invalid.");
  if (!validSession(playbookInput, sessionInput)) return invalid("INVALID_SESSION", "Session digest or binding is invalid.");
  if (!exact(input, ["exactRevision", "runtimeHandoff", "affectedStepIds", "rationale", "revisedAt"]) || !revision(input.exactRevision) ||
      !validRuntime(input.runtimeHandoff) || input.runtimeHandoff.exactRevision !== input.exactRevision ||
      !uniqueStrings(input.affectedStepIds, id, false) || !text(input.rationale, 4000) || !timestamp(input.revisedAt)) {
    return invalid("MALFORMED_REVISION", "Revision transition is malformed or not closed.");
  }
  if (input.exactRevision === sessionInput.exactRevision) return invalid("REVISION_UNCHANGED", "A correction must produce a new exact revision.");
  if (sessionInput.profile !== "exploration" && input.runtimeHandoff.status !== "ready") {
    return invalid("RUNTIME_NOT_READY", "Formal correction replay requires a ready builder runtime handoff for the new revision.");
  }
  const allSteps = new Set(playbookInput.stages.flatMap((stage) => stage.steps.map((step) => step.stepId)));
  if (input.affectedStepIds.some((stepId) => !allSteps.has(stepId))) return invalid("UNKNOWN_AFFECTED_STEP", "Affected step is not in the playbook.");
  const reverse = new Map<string, string[]>();
  for (const step of playbookInput.stages.flatMap((stage) => stage.steps)) {
    for (const dependency of step.dependsOnStepIds) reverse.set(dependency, [...(reverse.get(dependency) ?? []), step.stepId]);
  }
  const stale = new Set<string>(input.affectedStepIds);
  const queue = [...stale];
  while (queue.length > 0) {
    for (const dependent of reverse.get(queue.shift() as string) ?? []) {
      if (!stale.has(dependent)) { stale.add(dependent); queue.push(dependent); }
    }
  }
  const stepStates = { ...sessionInput.stepStates };
  for (const stepId of stale) stepStates[stepId] = "stale";
  const derived = route(playbookInput, stepStates);
  const revisionRecord: GuidedReviewRevisionV1 = snapshot({
    previousRevision: sessionInput.exactRevision,
    exactRevision: input.exactRevision,
    rationale: input.rationale,
    staleStepIds: [...stale],
    revisedAt: input.revisedAt,
  });
  const { sessionDigest: _sessionDigest, ...sessionBodyInput } = sessionInput;
  return { state: "ready", value: withSessionDigest({
    ...sessionBodyInput,
    exactRevision: input.exactRevision,
    runtimeHandoff: input.runtimeHandoff,
    state: derived.state,
    currentStageId: derived.currentStageId,
    currentStepId: derived.currentStepId,
    stepStates,
    stageStates: derived.stageStates,
    decisions: [...sessionInput.decisions],
    revisions: [...sessionInput.revisions, revisionRecord],
    updatedAt: input.revisedAt,
  }) };
}

export function evaluateGuidedReviewPublicationForkV1(input: unknown): GuidedReviewResultV1<GuidedReviewPublicationForkV1> {
  if (!exact(input, ["choice", "exactRevision", "playbook", "session"]) ||
      !GUIDED_REVIEW_PUBLICATION_CHOICES.includes(input.choice as GuidedReviewPublicationChoiceV1) || !revision(input.exactRevision)) {
    return invalid("MALFORMED_PUBLICATION_FORK", "Publication fork is malformed or not closed.");
  }
  const choice = input.choice as GuidedReviewPublicationChoiceV1;
  const exactRevision = input.exactRevision as string;
  let body: Omit<GuidedReviewPublicationForkV1, "forkDigest">;
  if (choice === "cancel") {
    body = { schemaVersion: 1, contractVersion: GUIDED_REVIEW_CONTRACT_VERSION, authority: "none", choice, state: "cancelled", exactRevision,
      guidedReviewDisposition: "cancelled", sessionDigest: null, pinPurpose: null, reasonCode: null, summary: "No PIN and no publication effect." };
  } else if (choice === "no") {
    body = { schemaVersion: 1, contractVersion: GUIDED_REVIEW_CONTRACT_VERSION, authority: "none", choice, state: "pin_required", exactRevision,
      guidedReviewDisposition: "skipped_by_operator", sessionDigest: null, pinPurpose: "publication", reasonCode: null,
      summary: "Guided Review skipped for the exact candidate; one ordinary publication PIN remains." };
  } else if (!playbookValid(input.playbook) || !validSession(input.playbook, input.session) || input.session.profile !== "publication" ||
      input.session.state !== "completed" || input.session.exactRevision !== exactRevision) {
    body = { schemaVersion: 1, contractVersion: GUIDED_REVIEW_CONTRACT_VERSION, authority: "none", choice, state: "blocked", exactRevision,
      guidedReviewDisposition: "ineligible", sessionDigest: plain(input.session) && digest(input.session.sessionDigest) ? input.session.sessionDigest : null,
      pinPurpose: null, reasonCode: "GUIDED_REVIEW_INCOMPLETE_OR_STALE", summary: "Completed publication-profile Guided Review evidence for the exact candidate is required." };
  } else {
    body = { schemaVersion: 1, contractVersion: GUIDED_REVIEW_CONTRACT_VERSION, authority: "none", choice, state: "pin_required", exactRevision,
      guidedReviewDisposition: "completed", sessionDigest: input.session.sessionDigest, pinPurpose: "guided_review_and_publication", reasonCode: null,
      summary: "One combined Guided Review and exact-candidate publication PIN remains." };
  }
  return { state: "ready", value: snapshot({ ...body, forkDigest: sha256(body) }) };
}

export function renderGuidedReviewChecklistV1(playbookInput: unknown, sessionInput: unknown): GuidedReviewResultV1<string> {
  if (!playbookValid(playbookInput)) return invalid("INVALID_PLAYBOOK", "Playbook digest or shape is invalid.");
  if (!validSession(playbookInput, sessionInput)) return invalid("INVALID_SESSION", "Session digest or binding is invalid.");
  const decisions = new Map(sessionInput.decisions.map((decision) => [decision.stepId, decision]));
  const lines = [
    `# ${playbookInput.title} — reusable review checklist`, "",
    `- Exact revision: \`${sessionInput.exactRevision}\``,
    `- Playbook: \`${playbookInput.playbookId}\``,
    `- Profile: \`${sessionInput.profile}\``, "",
  ];
  for (const stage of playbookInput.stages) {
    lines.push(`## ${stage.title}`, "", stage.purpose, "");
    for (const step of stage.steps) {
      const decision = decisions.get(step.stepId);
      const checked = ["passed", "conditional"].includes(sessionInput.stepStates[step.stepId] ?? "pending") ? "x" : " ";
      lines.push(`- [${checked}] ${step.title}: ${step.question}`);
      if (decision) lines.push(`  - Observation: ${decision.observation}`);
      if (decision?.condition) lines.push(`  - Carried condition: ${decision.condition}`);
      if (decision?.finding) lines.push(`  - Finding: ${decision.finding}`);
    }
    lines.push("");
  }
  return { state: "ready", value: `${lines.join("\n")}\n` };
}

export function summarizeGuidedReviewSessionV1(playbookInput: unknown, sessionInput: unknown): GuidedReviewResultV1<Readonly<{
  exactRevision: string;
  completedStages: number;
  totalStages: number;
  completedSteps: number;
  totalSteps: number;
  corrections: number;
  findings: readonly string[];
  conditions: readonly string[];
  currentStageId: string | null;
  currentStepId: string | null;
  state: GuidedReviewSessionV1["state"];
}>> {
  if (!playbookValid(playbookInput)) return invalid("INVALID_PLAYBOOK", "Playbook digest or shape is invalid.");
  if (!validSession(playbookInput, sessionInput)) return invalid("INVALID_SESSION", "Session digest or binding is invalid.");
  const steps = Object.values(sessionInput.stepStates);
  return { state: "ready", value: snapshot({
    exactRevision: sessionInput.exactRevision,
    completedStages: Object.values(sessionInput.stageStates).filter((state) => state === "passed").length,
    totalStages: playbookInput.stages.length,
    completedSteps: steps.filter((state) => state === "passed" || state === "conditional").length,
    totalSteps: steps.length,
    corrections: sessionInput.revisions.length,
    findings: sessionInput.decisions.flatMap((decision) => decision.finding === null ? [] : [decision.finding]),
    conditions: sessionInput.decisions.flatMap((decision) => decision.condition === null ? [] : [decision.condition]),
    currentStageId: sessionInput.currentStageId,
    currentStepId: sessionInput.currentStepId,
    state: sessionInput.state,
  }) };
}
