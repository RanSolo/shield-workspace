export const RUNNER_CONTRACT_VERSION = 1 as const;
export const RUNNER_EFFECT_CLASSES = [
  "behavioral_implementation",
  "verification",
  "coordination",
] as const;
export const RUNNER_PERMISSION_OUTCOMES = ["allow", "wait", "deny"] as const;
export const RUNNER_EXECUTOR_OUTCOMES = ["completed", "uncertain", "failed"] as const;
export const RUNNER_VALIDATOR_OUTCOMES = ["passed", "failed"] as const;
export const RUNNER_STOP_REASONS = [
  "governance_not_approved", "mission_not_authorized", "execution_not_active", "execute_not_ready",
  "identity_mismatch", "journal_sequence_mismatch", "seat_not_participating", "seat_not_executable",
  "implementation_owner_mismatch", "mode_context_mismatch", "action_not_allowlisted",
  "effect_already_completed", "authorization_wait", "authorization_denied", "authorization_failed",
  "authorization_malformed", "authorization_stale", "executor_failed", "executor_uncertain",
  "executor_malformed", "executor_identity_mismatch", "validator_failed", "validator_malformed",
  "validator_identity_mismatch",
] as const;

export type RunnerEffectClass = (typeof RUNNER_EFFECT_CLASSES)[number];
export type RunnerPermissionOutcome = (typeof RUNNER_PERMISSION_OUTCOMES)[number];
export type RunnerExecutorOutcome = (typeof RUNNER_EXECUTOR_OUTCOMES)[number];
export type RunnerValidatorOutcome = (typeof RUNNER_VALIDATOR_OUTCOMES)[number];
export type RunnerStopReason = (typeof RUNNER_STOP_REASONS)[number];

export interface RunnerModeReference {
  modeId: string;
  modeVersion: string;
  seatId: string;
  activationSource: string;
}

export interface RunnerProjectionSnapshot {
  runnerContractVersion: 1;
  missionId: string;
  subjectId: string;
  revisionId: string;
  evaluatedThroughSequence: number;
  governanceState: "proposed" | "approved" | "paused" | "cancelled";
  missionAuthorizationState: "waiting" | "authorized" | "ineligible" | "invalidated";
  executionStatus: "not-started" | "running" | "completed";
  executeReadiness: "ready" | "waiting" | "blocked" | "invalid";
  participantSeatIds: string[];
  activatedModes: RunnerModeReference[];
}

export interface RunnerResolvedModeContext {
  runnerContractVersion: 1;
  seatId: string;
  modes: RunnerModeReference[];
}

export interface RunnerCyclePlan {
  runnerContractVersion: 1;
  cycleId: string;
  missionId: string;
  subjectId: string;
  revisionId: string;
  evaluatedThroughSequence: number;
  seatId: string;
  activatedModes: RunnerModeReference[];
  actionId: string;
  effectClass: RunnerEffectClass;
  effectKey: string;
  validationId: string;
  stopCondition: "after_one_cycle";
}

export interface RunnerCycleInput {
  runnerContractVersion: 1;
  projection: RunnerProjectionSnapshot;
  resolvedModeContext: RunnerResolvedModeContext;
  actionAllowlist: string[];
  completedEffectKeys: string[];
  plan: RunnerCyclePlan;
}

export interface RunnerPermissionDecision {
  runnerContractVersion: 1;
  decisionId: string;
  outcome: RunnerPermissionOutcome;
  missionId: string;
  subjectId: string;
  revisionId: string;
  evaluatedThroughSequence: number;
  cycleId: string;
  seatId: string;
  actionId: string;
  effectClass: RunnerEffectClass;
  effectKey: string;
  reasonCode: string;
}

export interface RunnerExecutorResult {
  runnerContractVersion: 1;
  outcome: RunnerExecutorOutcome;
  missionId: string;
  subjectId: string;
  revisionId: string;
  evaluatedThroughSequence: number;
  cycleId: string;
  seatId: string;
  actionId: string;
  effectClass: RunnerEffectClass;
  effectKey: string;
  summary: string;
  evidenceRef: string | null;
}

export interface RunnerValidatorResult {
  runnerContractVersion: 1;
  outcome: RunnerValidatorOutcome;
  missionId: string;
  subjectId: string;
  revisionId: string;
  evaluatedThroughSequence: number;
  cycleId: string;
  validationId: string;
  effectKey: string;
  summary: string;
}

export interface RunnerEffectEvidenceCandidate {
  runnerContractVersion: 1;
  candidateKind: "runner.effect_completed";
  missionId: string;
  subjectId: string;
  revisionId: string;
  evaluatedThroughSequence: number;
  intendedJournalSequence: number;
  cycleId: string;
  seatId: string;
  actionId: string;
  effectClass: RunnerEffectClass;
  effectKey: string;
  validationId: string;
  executorEvidenceRef: string;
  executorSummary: string;
  validationSummary: string;
}

export interface RunnerEffectCompletedAppendCandidate {
  runnerContractVersion: 1;
  candidateKind: "runner.effect_completed_append_candidate";
  authority: "non_authoritative";
  missionId: string;
  revisionId: string;
  expectedPreviousSequence: number;
  intendedJournalSequence: number;
  entryType: "effect.completed";
  payload: {
    effectKey: string;
    resultSummary: string;
  };
  runnerEvidence: RunnerEffectEvidenceCandidate;
}

export interface RunnerStoppedResult {
  runnerContractVersion: 1;
  outcome: "stopped";
  reason: RunnerStopReason;
  nextRoute: "coulson";
  missionId: string;
  subjectId: string;
  revisionId: string;
  evaluatedThroughSequence: number;
  cycleId: string;
  actionId: string;
  effectKey: string;
  evidence: null;
  journalAppendCandidate: null;
}

export interface RunnerAdvancedResult {
  runnerContractVersion: 1;
  outcome: "advanced";
  reason: "effect_completed";
  nextRoute: "journal";
  missionId: string;
  subjectId: string;
  revisionId: string;
  evaluatedThroughSequence: number;
  cycleId: string;
  actionId: string;
  effectKey: string;
  evidence: RunnerEffectEvidenceCandidate;
  journalAppendCandidate: RunnerEffectCompletedAppendCandidate;
}

export type RunnerCycleResult = RunnerStoppedResult | RunnerAdvancedResult;
export type RunnerContractResult<T> =
  | { state: "valid"; value: T }
  | { state: "invalid"; code: string; errors: string[] };

export interface RunnerCycleDependencies {
  authorize(input: RunnerCyclePlan): unknown | Promise<unknown>;
  execute(input: RunnerCyclePlan, decision: RunnerPermissionDecision): unknown | Promise<unknown>;
  validate(input: RunnerCyclePlan, result: RunnerExecutorResult): unknown | Promise<unknown>;
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/;
const EFFECT_CLASSES = new Set<string>(RUNNER_EFFECT_CLASSES);
const PERMISSION_OUTCOMES = new Set<string>(RUNNER_PERMISSION_OUTCOMES);
const EXECUTOR_OUTCOMES = new Set<string>(RUNNER_EXECUTOR_OUTCOMES);
const VALIDATOR_OUTCOMES = new Set<string>(RUNNER_VALIDATOR_OUTCOMES);
const STOP_REASONS = new Set<string>(RUNNER_STOP_REASONS);

function valid<T>(value: T): RunnerContractResult<T> {
  return { state: "valid", value };
}

function invalid<T = never>(code: string, errors: string[]): RunnerContractResult<T> {
  return { state: "invalid", code, errors };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactFields(value: unknown, fields: readonly string[], label: string): string[] {
  if (!isPlainObject(value)) return [`${label} must be a plain object.`];
  const allowed = new Set(fields);
  const errors: string[] = [];
  for (const field of fields) if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  for (const field of Reflect.ownKeys(value)) {
    if (typeof field !== "string" || !allowed.has(field)) {
      errors.push(`${label} has unknown field: ${String(field)}.`);
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      errors.push(`${label}.${field} must be an enumerable data field.`);
    }
  }
  return errors;
}

function arrayShapeErrors(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return [`${label} must be a plain array.`];
  const errors: string[] = [];
  for (const field of Reflect.ownKeys(value)) {
    if (field === "length") continue;
    if (typeof field !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(field)) {
      errors.push(`${label} has unknown field: ${String(field)}.`);
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      errors.push(`${label}[${field}] must be an enumerable data field.`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) errors.push(`${label} must not contain sparse positions.`);
  }
  return errors;
}

function deepCopyAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => deepCopyAndFreeze(item))) as T;
  if (isPlainObject(value)) {
    const copy = Object.fromEntries(Object.keys(value).map((key) => [key, deepCopyAndFreeze(value[key])])) as T;
    return Object.freeze(copy);
  }
  return value;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function revision(value: unknown): value is string {
  return typeof value === "string" && REVISION.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2_048;
}

function nonEmptyJournalSummary(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 65_536;
}

function sequence(value: unknown): value is number {
  // Successful cycles reserve the immediately following journal sequence.
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < Number.MAX_SAFE_INTEGER;
}

function validateStringSet(value: unknown, label: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    return [`${label} must be ${allowEmpty ? "an" : "a non-empty"} array.`];
  }
  const errors = arrayShapeErrors(value, label);
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (!identifier(item)) errors.push(`${label}[${index}] is invalid.`);
    else if (seen.has(item)) errors.push(`${label} duplicates ${item}.`);
    else seen.add(item);
  });
  return errors;
}

function validateModeReferences(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return [`${label} must be an array.`];
  const errors = arrayShapeErrors(value, label);
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const itemLabel = `${label}[${index}]`;
    const nested = exactFields(item, ["modeId", "modeVersion", "seatId", "activationSource"], itemLabel);
    errors.push(...nested);
    if (nested.length > 0 || !isPlainObject(item)) return;
    for (const field of ["modeId", "modeVersion", "seatId", "activationSource"] as const) {
      if (!identifier(item[field])) errors.push(`${itemLabel}.${field} is invalid.`);
    }
    if (["modeId", "modeVersion", "seatId", "activationSource"].every((field) => identifier(item[field]))) {
      const key = `${item.seatId}\u0000${item.modeId}\u0000${item.modeVersion}\u0000${item.activationSource}`;
      if (seen.has(key)) errors.push(`${label} contains a duplicate exact mode reference.`);
      else seen.add(key);
    }
  });
  return errors;
}

const PROJECTION_FIELDS = [
  "runnerContractVersion", "missionId", "subjectId", "revisionId", "evaluatedThroughSequence",
  "governanceState", "missionAuthorizationState", "executionStatus", "executeReadiness",
  "participantSeatIds", "activatedModes",
] as const;
const MODE_CONTEXT_FIELDS = ["runnerContractVersion", "seatId", "modes"] as const;
const PLAN_FIELDS = [
  "runnerContractVersion", "cycleId", "missionId", "subjectId", "revisionId", "evaluatedThroughSequence",
  "seatId", "activatedModes", "actionId", "effectClass", "effectKey", "validationId", "stopCondition",
] as const;
const INPUT_FIELDS = [
  "runnerContractVersion", "projection", "resolvedModeContext", "actionAllowlist", "completedEffectKeys", "plan",
] as const;
const PERMISSION_FIELDS = [
  "runnerContractVersion", "decisionId", "outcome", "missionId", "subjectId", "revisionId",
  "evaluatedThroughSequence", "cycleId", "seatId", "actionId", "effectClass", "effectKey", "reasonCode",
] as const;
const EXECUTOR_FIELDS = [
  "runnerContractVersion", "outcome", "missionId", "subjectId", "revisionId", "evaluatedThroughSequence",
  "cycleId", "seatId", "actionId", "effectClass", "effectKey", "summary", "evidenceRef",
] as const;
const VALIDATOR_FIELDS = [
  "runnerContractVersion", "outcome", "missionId", "subjectId", "revisionId", "evaluatedThroughSequence",
  "cycleId", "validationId", "effectKey", "summary",
] as const;
const EVIDENCE_FIELDS = [
  "runnerContractVersion", "candidateKind", "missionId", "subjectId", "revisionId",
  "evaluatedThroughSequence", "intendedJournalSequence", "cycleId", "seatId", "actionId", "effectClass",
  "effectKey", "validationId", "executorEvidenceRef", "executorSummary", "validationSummary",
] as const;
const APPEND_CANDIDATE_FIELDS = [
  "runnerContractVersion", "candidateKind", "authority", "missionId", "revisionId",
  "expectedPreviousSequence", "intendedJournalSequence", "entryType", "payload", "runnerEvidence",
] as const;
const APPEND_PAYLOAD_FIELDS = ["effectKey", "resultSummary"] as const;
const RESULT_FIELDS = [
  "runnerContractVersion", "outcome", "reason", "nextRoute", "missionId", "subjectId", "revisionId",
  "evaluatedThroughSequence", "cycleId", "actionId", "effectKey", "evidence", "journalAppendCandidate",
] as const;

function validateProjection(input: unknown): RunnerContractResult<RunnerProjectionSnapshot> {
  const errors = exactFields(input, PROJECTION_FIELDS, "Runner projection");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_projection", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner projection contract version is unsupported.");
  for (const field of ["missionId", "subjectId"] as const) if (!identifier(input[field])) errors.push(`Runner projection ${field} is invalid.`);
  if (!revision(input.revisionId)) errors.push("Runner projection revisionId is invalid.");
  if (!sequence(input.evaluatedThroughSequence)) errors.push("Runner projection evaluatedThroughSequence is invalid.");
  if (!["proposed", "approved", "paused", "cancelled"].includes(input.governanceState as string)) errors.push("Runner projection governanceState is unsupported.");
  if (!["waiting", "authorized", "ineligible", "invalidated"].includes(input.missionAuthorizationState as string)) errors.push("Runner projection missionAuthorizationState is unsupported.");
  if (!["not-started", "running", "completed"].includes(input.executionStatus as string)) errors.push("Runner projection executionStatus is unsupported.");
  if (!["ready", "waiting", "blocked", "invalid"].includes(input.executeReadiness as string)) errors.push("Runner projection executeReadiness is unsupported.");
  errors.push(...validateStringSet(input.participantSeatIds, "Runner projection participantSeatIds", false));
  errors.push(...validateModeReferences(input.activatedModes, "Runner projection activatedModes"));
  return errors.length > 0 ? invalid("malformed_projection", errors) : valid(input as unknown as RunnerProjectionSnapshot);
}

function validateResolvedModeContext(input: unknown): RunnerContractResult<RunnerResolvedModeContext> {
  const errors = exactFields(input, MODE_CONTEXT_FIELDS, "Resolved mode context");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_mode_context", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Resolved mode context contract version is unsupported.");
  if (!identifier(input.seatId)) errors.push("Resolved mode context seatId is invalid.");
  errors.push(...validateModeReferences(input.modes, "Resolved mode context modes"));
  return errors.length > 0 ? invalid("malformed_mode_context", errors) : valid(input as unknown as RunnerResolvedModeContext);
}

export function validateRunnerCyclePlan(input: unknown): RunnerContractResult<RunnerCyclePlan> {
  const errors = exactFields(input, PLAN_FIELDS, "Runner cycle plan");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_plan", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner cycle plan contract version is unsupported.");
  for (const field of ["cycleId", "missionId", "subjectId", "seatId", "actionId", "effectKey", "validationId"] as const) {
    if (!identifier(input[field])) errors.push(`Runner cycle plan ${field} is invalid.`);
  }
  if (!revision(input.revisionId)) errors.push("Runner cycle plan revisionId is invalid.");
  if (!sequence(input.evaluatedThroughSequence)) errors.push("Runner cycle plan evaluatedThroughSequence is invalid.");
  if (!EFFECT_CLASSES.has(input.effectClass as string)) errors.push("Runner cycle plan effectClass is unsupported.");
  if (input.stopCondition !== "after_one_cycle") errors.push("Runner cycle plan stopCondition is unsupported.");
  errors.push(...validateModeReferences(input.activatedModes, "Runner cycle plan activatedModes"));
  return errors.length > 0 ? invalid("malformed_plan", errors) : valid(input as unknown as RunnerCyclePlan);
}

export function validateRunnerCycleInput(input: unknown): RunnerContractResult<RunnerCycleInput> {
  const errors = exactFields(input, INPUT_FIELDS, "Runner cycle input");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_input", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner cycle input contract version is unsupported.");
  const projection = validateProjection(input.projection);
  const context = validateResolvedModeContext(input.resolvedModeContext);
  const plan = validateRunnerCyclePlan(input.plan);
  if (projection.state === "invalid") errors.push(...projection.errors);
  if (context.state === "invalid") errors.push(...context.errors);
  if (plan.state === "invalid") errors.push(...plan.errors);
  errors.push(...validateStringSet(input.actionAllowlist, "Runner cycle input actionAllowlist", false));
  errors.push(...validateStringSet(input.completedEffectKeys, "Runner cycle input completedEffectKeys", true));
  return errors.length > 0 ? invalid("malformed_input", errors) : valid(input as unknown as RunnerCycleInput);
}

export function validateRunnerPermissionDecision(input: unknown): RunnerContractResult<RunnerPermissionDecision> {
  const errors = exactFields(input, PERMISSION_FIELDS, "Runner permission decision");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_permission", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner permission decision contract version is unsupported.");
  for (const field of ["decisionId", "missionId", "subjectId", "cycleId", "seatId", "actionId", "effectKey", "reasonCode"] as const) {
    if (!identifier(input[field])) errors.push(`Runner permission decision ${field} is invalid.`);
  }
  if (!revision(input.revisionId)) errors.push("Runner permission decision revisionId is invalid.");
  if (!sequence(input.evaluatedThroughSequence)) errors.push("Runner permission decision evaluatedThroughSequence is invalid.");
  if (!PERMISSION_OUTCOMES.has(input.outcome as string)) errors.push("Runner permission decision outcome is unsupported.");
  if (!EFFECT_CLASSES.has(input.effectClass as string)) errors.push("Runner permission decision effectClass is unsupported.");
  return errors.length > 0 ? invalid("malformed_permission", errors) : valid(input as unknown as RunnerPermissionDecision);
}

export function validateRunnerExecutorResult(input: unknown): RunnerContractResult<RunnerExecutorResult> {
  const errors = exactFields(input, EXECUTOR_FIELDS, "Runner executor result");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_executor_result", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner executor result contract version is unsupported.");
  for (const field of ["missionId", "subjectId", "cycleId", "seatId", "actionId", "effectKey"] as const) {
    if (!identifier(input[field])) errors.push(`Runner executor result ${field} is invalid.`);
  }
  if (!revision(input.revisionId)) errors.push("Runner executor result revisionId is invalid.");
  if (!sequence(input.evaluatedThroughSequence)) errors.push("Runner executor result evaluatedThroughSequence is invalid.");
  if (!EXECUTOR_OUTCOMES.has(input.outcome as string)) errors.push("Runner executor result outcome is unsupported.");
  if (!EFFECT_CLASSES.has(input.effectClass as string)) errors.push("Runner executor result effectClass is unsupported.");
  if (!nonEmpty(input.summary)) errors.push("Runner executor result summary must be non-empty.");
  if (input.evidenceRef !== null && !identifier(input.evidenceRef)) errors.push("Runner executor result evidenceRef is invalid.");
  if (input.outcome === "completed" && input.evidenceRef === null) errors.push("Completed executor result requires evidenceRef.");
  if (input.outcome !== "completed" && input.evidenceRef !== null) errors.push("Non-completed executor result cannot include evidenceRef.");
  return errors.length > 0 ? invalid("malformed_executor_result", errors) : valid(input as unknown as RunnerExecutorResult);
}

export function validateRunnerValidatorResult(input: unknown): RunnerContractResult<RunnerValidatorResult> {
  const errors = exactFields(input, VALIDATOR_FIELDS, "Runner validator result");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_validator_result", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner validator result contract version is unsupported.");
  for (const field of ["missionId", "subjectId", "cycleId", "validationId", "effectKey"] as const) {
    if (!identifier(input[field])) errors.push(`Runner validator result ${field} is invalid.`);
  }
  if (!revision(input.revisionId)) errors.push("Runner validator result revisionId is invalid.");
  if (!sequence(input.evaluatedThroughSequence)) errors.push("Runner validator result evaluatedThroughSequence is invalid.");
  if (!VALIDATOR_OUTCOMES.has(input.outcome as string)) errors.push("Runner validator result outcome is unsupported.");
  if (!nonEmpty(input.summary)) errors.push("Runner validator result summary must be non-empty.");
  return errors.length > 0 ? invalid("malformed_validator_result", errors) : valid(input as unknown as RunnerValidatorResult);
}

export function validateRunnerEffectEvidenceCandidate(input: unknown): RunnerContractResult<RunnerEffectEvidenceCandidate> {
  const errors = exactFields(input, EVIDENCE_FIELDS, "Runner effect evidence candidate");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_effect_evidence", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner effect evidence contract version is unsupported.");
  if (input.candidateKind !== "runner.effect_completed") errors.push("Runner effect evidence candidateKind is unsupported.");
  for (const field of [
    "missionId", "subjectId", "cycleId", "seatId", "actionId", "effectKey", "validationId", "executorEvidenceRef",
  ] as const) {
    if (!identifier(input[field])) errors.push(`Runner effect evidence ${field} is invalid.`);
  }
  if (!revision(input.revisionId)) errors.push("Runner effect evidence revisionId is invalid.");
  if (!sequence(input.evaluatedThroughSequence)) errors.push("Runner effect evidence evaluatedThroughSequence is invalid.");
  if (!sequence(input.intendedJournalSequence) ||
      input.intendedJournalSequence !== (input.evaluatedThroughSequence as number) + 1) {
    errors.push("Runner effect evidence intendedJournalSequence must immediately follow its evaluated sequence.");
  }
  if (!EFFECT_CLASSES.has(input.effectClass as string)) errors.push("Runner effect evidence effectClass is unsupported.");
  if (!nonEmpty(input.executorSummary)) errors.push("Runner effect evidence executorSummary must be non-empty.");
  if (!nonEmpty(input.validationSummary)) errors.push("Runner effect evidence validationSummary must be non-empty.");
  return errors.length > 0 ? invalid("malformed_effect_evidence", errors) : valid(input as unknown as RunnerEffectEvidenceCandidate);
}

function effectResultSummary(evidence: RunnerEffectEvidenceCandidate): string {
  return JSON.stringify({
    runnerContractVersion: evidence.runnerContractVersion,
    cycleId: evidence.cycleId,
    revisionId: evidence.revisionId,
    evaluatedThroughSequence: evidence.evaluatedThroughSequence,
    seatId: evidence.seatId,
    actionId: evidence.actionId,
    effectClass: evidence.effectClass,
    validationId: evidence.validationId,
    executorEvidenceRef: evidence.executorEvidenceRef,
    executorSummary: evidence.executorSummary,
    validationSummary: evidence.validationSummary,
  });
}

export function translateRunnerEffectEvidenceCandidate(
  input: unknown,
): RunnerContractResult<RunnerEffectCompletedAppendCandidate> {
  const checked = validateRunnerEffectEvidenceCandidate(input);
  if (checked.state === "invalid") return checked;
  const evidence = deepCopyAndFreeze(checked.value);
  return valid(deepCopyAndFreeze({
    runnerContractVersion: RUNNER_CONTRACT_VERSION,
    candidateKind: "runner.effect_completed_append_candidate",
    authority: "non_authoritative",
    missionId: evidence.missionId,
    revisionId: evidence.revisionId,
    expectedPreviousSequence: evidence.evaluatedThroughSequence,
    intendedJournalSequence: evidence.intendedJournalSequence,
    entryType: "effect.completed",
    payload: {
      effectKey: evidence.effectKey,
      resultSummary: effectResultSummary(evidence),
    },
    runnerEvidence: evidence,
  }));
}

export function validateRunnerEffectCompletedAppendCandidate(
  input: unknown,
): RunnerContractResult<RunnerEffectCompletedAppendCandidate> {
  const errors = exactFields(input, APPEND_CANDIDATE_FIELDS, "Runner journal append candidate");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_append_candidate", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner journal append candidate contract version is unsupported.");
  if (input.candidateKind !== "runner.effect_completed_append_candidate") errors.push("Runner journal append candidateKind is unsupported.");
  if (input.authority !== "non_authoritative") errors.push("Runner journal append candidate must be explicitly non-authoritative.");
  if (!identifier(input.missionId)) errors.push("Runner journal append candidate missionId is invalid.");
  if (!revision(input.revisionId)) errors.push("Runner journal append candidate revisionId is invalid.");
  if (!sequence(input.expectedPreviousSequence)) errors.push("Runner journal append candidate expectedPreviousSequence is invalid.");
  if (!sequence(input.intendedJournalSequence) ||
      input.intendedJournalSequence !== (input.expectedPreviousSequence as number) + 1) {
    errors.push("Runner journal append candidate intendedJournalSequence must immediately follow its expected previous sequence.");
  }
  if (input.entryType !== "effect.completed") errors.push("Runner journal append candidate entryType is unsupported.");
  const payloadErrors = exactFields(input.payload, APPEND_PAYLOAD_FIELDS, "Runner journal append payload");
  errors.push(...payloadErrors);
  if (payloadErrors.length === 0 && isPlainObject(input.payload)) {
    if (!identifier(input.payload.effectKey)) errors.push("Runner journal append payload effectKey is invalid.");
    if (!nonEmptyJournalSummary(input.payload.resultSummary)) {
      errors.push("Runner journal append payload resultSummary must be non-empty.");
    }
  }
  const evidence = validateRunnerEffectEvidenceCandidate(input.runnerEvidence);
  if (evidence.state === "invalid") errors.push(...evidence.errors);
  else if (isPlainObject(input.payload)) {
    if (input.missionId !== evidence.value.missionId || input.revisionId !== evidence.value.revisionId ||
        input.expectedPreviousSequence !== evidence.value.evaluatedThroughSequence ||
        input.intendedJournalSequence !== evidence.value.intendedJournalSequence ||
        input.payload.effectKey !== evidence.value.effectKey || input.payload.resultSummary !== effectResultSummary(evidence.value)) {
      errors.push("Runner journal append candidate does not exactly translate its runner evidence.");
    }
  }
  return errors.length > 0 ? invalid("malformed_append_candidate", errors) : valid(input as unknown as RunnerEffectCompletedAppendCandidate);
}

export function validateRunnerCycleResult(input: unknown): RunnerContractResult<RunnerCycleResult> {
  const errors = exactFields(input, RESULT_FIELDS, "Runner cycle result");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_cycle_result", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner cycle result contract version is unsupported.");
  for (const field of ["missionId", "subjectId", "cycleId", "actionId", "effectKey"] as const) {
    if (!identifier(input[field])) errors.push(`Runner cycle result ${field} is invalid.`);
  }
  if (!revision(input.revisionId)) errors.push("Runner cycle result revisionId is invalid.");
  if (!sequence(input.evaluatedThroughSequence)) errors.push("Runner cycle result evaluatedThroughSequence is invalid.");
  if (input.outcome === "stopped") {
    if (!STOP_REASONS.has(input.reason as string)) errors.push("Stopped runner result reason is unsupported.");
    if (input.nextRoute !== "coulson") errors.push("Stopped runner result must route to Coulson.");
    if (input.evidence !== null) errors.push("Stopped runner result cannot include completion evidence.");
    if (input.journalAppendCandidate !== null) errors.push("Stopped runner result cannot include a journal append candidate.");
  } else if (input.outcome === "advanced") {
    if (input.reason !== "effect_completed") errors.push("Advanced runner result reason is unsupported.");
    if (input.nextRoute !== "journal") errors.push("Advanced runner result must route to the journal boundary.");
    const evidence = validateRunnerEffectEvidenceCandidate(input.evidence);
    const append = validateRunnerEffectCompletedAppendCandidate(input.journalAppendCandidate);
    if (evidence.state === "invalid") errors.push(...evidence.errors);
    if (append.state === "invalid") errors.push(...append.errors);
    if (evidence.state === "valid" && append.state === "valid") {
      const appendEvidenceMatches = EVIDENCE_FIELDS.every((field) =>
        append.value.runnerEvidence[field] === evidence.value[field]);
      if (input.missionId !== evidence.value.missionId || input.subjectId !== evidence.value.subjectId ||
          input.revisionId !== evidence.value.revisionId || input.evaluatedThroughSequence !== evidence.value.evaluatedThroughSequence ||
          input.cycleId !== evidence.value.cycleId || input.actionId !== evidence.value.actionId ||
          input.effectKey !== evidence.value.effectKey || !appendEvidenceMatches) {
        errors.push("Advanced runner result identity does not match its evidence and append candidate.");
      }
    }
  } else {
    errors.push("Runner cycle result outcome is unsupported.");
  }
  return errors.length > 0 ? invalid("malformed_cycle_result", errors) : valid(input as unknown as RunnerCycleResult);
}

function referenceKey(reference: RunnerModeReference): string {
  return `${reference.seatId}\u0000${reference.modeId}\u0000${reference.modeVersion}\u0000${reference.activationSource}`;
}

function sameModeReferences(left: RunnerModeReference[], right: RunnerModeReference[]): boolean {
  if (left.length !== right.length) return false;
  const leftKeys = left.map(referenceKey).sort();
  const rightKeys = right.map(referenceKey).sort();
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function samePlanIdentity(candidate: RunnerPermissionDecision | RunnerExecutorResult, plan: RunnerCyclePlan): boolean {
  return candidate.missionId === plan.missionId && candidate.subjectId === plan.subjectId &&
    candidate.revisionId === plan.revisionId && candidate.evaluatedThroughSequence === plan.evaluatedThroughSequence &&
    candidate.cycleId === plan.cycleId && candidate.seatId === plan.seatId &&
    candidate.actionId === plan.actionId && candidate.effectClass === plan.effectClass && candidate.effectKey === plan.effectKey;
}

function sameValidationIdentity(candidate: RunnerValidatorResult, plan: RunnerCyclePlan): boolean {
  return candidate.missionId === plan.missionId && candidate.subjectId === plan.subjectId &&
    candidate.revisionId === plan.revisionId && candidate.evaluatedThroughSequence === plan.evaluatedThroughSequence &&
    candidate.cycleId === plan.cycleId && candidate.validationId === plan.validationId && candidate.effectKey === plan.effectKey;
}

function stopped(plan: RunnerCyclePlan, reason: RunnerStopReason): RunnerCycleResult {
  return {
    runnerContractVersion: RUNNER_CONTRACT_VERSION,
    outcome: "stopped",
    reason,
    nextRoute: "coulson",
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    revisionId: plan.revisionId,
    evaluatedThroughSequence: plan.evaluatedThroughSequence,
    cycleId: plan.cycleId,
    actionId: plan.actionId,
    effectKey: plan.effectKey,
    evidence: null,
    journalAppendCandidate: null,
  };
}

function finalizedResult(result: RunnerCycleResult): RunnerContractResult<RunnerCycleResult> {
  const checked = validateRunnerCycleResult(result);
  if (checked.state === "invalid") return invalid("internal_result_invalid", checked.errors);
  return valid(deepCopyAndFreeze(checked.value));
}

function preAuthorizationStop(input: RunnerCycleInput): RunnerStopReason | null {
  const { projection, resolvedModeContext, plan } = input;
  if (projection.governanceState !== "approved") return "governance_not_approved";
  if (projection.missionAuthorizationState !== "authorized") return "mission_not_authorized";
  if (projection.executionStatus !== "running") return "execution_not_active";
  if (projection.executeReadiness !== "ready") return "execute_not_ready";
  if (projection.missionId !== plan.missionId || projection.subjectId !== plan.subjectId || projection.revisionId !== plan.revisionId) return "identity_mismatch";
  if (projection.evaluatedThroughSequence !== plan.evaluatedThroughSequence) return "journal_sequence_mismatch";
  if (!projection.participantSeatIds.includes(plan.seatId)) return "seat_not_participating";
  if (plan.seatId === "fitz" || plan.seatId === "simmons") return "seat_not_executable";
  if (plan.effectClass === "behavioral_implementation" && plan.seatId !== "may") return "implementation_owner_mismatch";
  const projectedModes = projection.activatedModes.filter((mode) => mode.seatId === plan.seatId);
  if (resolvedModeContext.seatId !== plan.seatId || !sameModeReferences(projectedModes, plan.activatedModes) ||
      !sameModeReferences(resolvedModeContext.modes, plan.activatedModes)) return "mode_context_mismatch";
  if (!input.actionAllowlist.includes(plan.actionId)) return "action_not_allowlisted";
  if (input.completedEffectKeys.includes(plan.effectKey)) return "effect_already_completed";
  return null;
}

export async function runRunnerCycle(
  input: unknown,
  dependencies: RunnerCycleDependencies,
): Promise<RunnerContractResult<RunnerCycleResult>> {
  const checked = validateRunnerCycleInput(input);
  if (checked.state === "invalid") return checked;
  const cycle = deepCopyAndFreeze(checked.value);
  const earlyStop = preAuthorizationStop(cycle);
  if (earlyStop !== null) return finalizedResult(stopped(cycle.plan, earlyStop));

  let rawDecision: unknown;
  try {
    rawDecision = await dependencies.authorize(cycle.plan);
  } catch {
    return finalizedResult(stopped(cycle.plan, "authorization_failed"));
  }
  const checkedDecision = validateRunnerPermissionDecision(rawDecision);
  if (checkedDecision.state === "invalid") return finalizedResult(stopped(cycle.plan, "authorization_malformed"));
  const decision = deepCopyAndFreeze(checkedDecision.value);
  if (!samePlanIdentity(decision, cycle.plan)) return finalizedResult(stopped(cycle.plan, "authorization_stale"));
  if (decision.outcome === "wait") return finalizedResult(stopped(cycle.plan, "authorization_wait"));
  if (decision.outcome === "deny") return finalizedResult(stopped(cycle.plan, "authorization_denied"));

  let rawExecutorResult: unknown;
  try {
    rawExecutorResult = await dependencies.execute(cycle.plan, decision);
  } catch {
    return finalizedResult(stopped(cycle.plan, "executor_failed"));
  }
  const checkedExecutor = validateRunnerExecutorResult(rawExecutorResult);
  if (checkedExecutor.state === "invalid") return finalizedResult(stopped(cycle.plan, "executor_malformed"));
  const executorResult = deepCopyAndFreeze(checkedExecutor.value);
  if (!samePlanIdentity(executorResult, cycle.plan)) return finalizedResult(stopped(cycle.plan, "executor_identity_mismatch"));
  if (executorResult.outcome === "uncertain") return finalizedResult(stopped(cycle.plan, "executor_uncertain"));
  if (executorResult.outcome === "failed") return finalizedResult(stopped(cycle.plan, "executor_failed"));

  let rawValidatorResult: unknown;
  try {
    rawValidatorResult = await dependencies.validate(cycle.plan, executorResult);
  } catch {
    return finalizedResult(stopped(cycle.plan, "validator_failed"));
  }
  const checkedValidator = validateRunnerValidatorResult(rawValidatorResult);
  if (checkedValidator.state === "invalid") return finalizedResult(stopped(cycle.plan, "validator_malformed"));
  const validatorResult = deepCopyAndFreeze(checkedValidator.value);
  if (!sameValidationIdentity(validatorResult, cycle.plan)) return finalizedResult(stopped(cycle.plan, "validator_identity_mismatch"));
  if (validatorResult.outcome === "failed") return finalizedResult(stopped(cycle.plan, "validator_failed"));

  const evidence: RunnerEffectEvidenceCandidate = {
    runnerContractVersion: RUNNER_CONTRACT_VERSION,
    candidateKind: "runner.effect_completed",
    missionId: cycle.plan.missionId,
    subjectId: cycle.plan.subjectId,
    revisionId: cycle.plan.revisionId,
    evaluatedThroughSequence: cycle.plan.evaluatedThroughSequence,
    intendedJournalSequence: cycle.plan.evaluatedThroughSequence + 1,
    cycleId: cycle.plan.cycleId,
    seatId: cycle.plan.seatId,
    actionId: cycle.plan.actionId,
    effectClass: cycle.plan.effectClass,
    effectKey: cycle.plan.effectKey,
    validationId: cycle.plan.validationId,
    executorEvidenceRef: executorResult.evidenceRef as string,
    executorSummary: executorResult.summary,
    validationSummary: validatorResult.summary,
  };
  const appendCandidate = translateRunnerEffectEvidenceCandidate(evidence);
  if (appendCandidate.state === "invalid") return finalizedResult(stopped(cycle.plan, "validator_malformed"));
  return finalizedResult({
    runnerContractVersion: RUNNER_CONTRACT_VERSION,
    outcome: "advanced",
    reason: "effect_completed",
    nextRoute: "journal",
    missionId: cycle.plan.missionId,
    subjectId: cycle.plan.subjectId,
    revisionId: cycle.plan.revisionId,
    evaluatedThroughSequence: cycle.plan.evaluatedThroughSequence,
    cycleId: cycle.plan.cycleId,
    actionId: cycle.plan.actionId,
    effectKey: cycle.plan.effectKey,
    evidence,
    journalAppendCandidate: appendCandidate.value,
  });
}
