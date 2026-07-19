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
  "effect_already_completed", "effect_outcome_uncertain", "authorization_wait", "authorization_denied", "authorization_failed",
  "authorization_malformed", "authorization_stale", "executor_failed", "executor_uncertain",
  "executor_malformed", "executor_identity_mismatch", "validator_failed", "validator_malformed",
  "validator_identity_mismatch",
] as const;

export type RunnerEffectClass = (typeof RUNNER_EFFECT_CLASSES)[number];
export type RunnerPermissionOutcome = (typeof RUNNER_PERMISSION_OUTCOMES)[number];
export type RunnerExecutorOutcome = (typeof RUNNER_EXECUTOR_OUTCOMES)[number];
export type RunnerValidatorOutcome = (typeof RUNNER_VALIDATOR_OUTCOMES)[number];
export type RunnerStopReason = (typeof RUNNER_STOP_REASONS)[number];
export type RunnerJsonValue = null | boolean | number | string | RunnerJsonValue[] | { [key: string]: RunnerJsonValue };

export interface RunnerOpaqueAuthorizationArtifact {
  artifactSchemaVersion: 1;
  artifactId: string;
  contentType: "application/json";
  payload: { [key: string]: RunnerJsonValue };
}

export interface RunnerModeReference {
  modeId: string;
  modeVersion: string;
  seatId: string;
  activationSource: string;
}

export interface RunnerProjectionSnapshot {
  runnerContractVersion: 1;
  journalSchemaVersion: 5;
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
  effectRecords: RunnerAuthoritativeEffectRecord[];
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
  authorizationArtifact: RunnerOpaqueAuthorizationArtifact;
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
  evidenceRefs: string[];
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

export interface RunnerExecutionEffectPayload {
  runnerContractVersion: 1;
  cycleId: string;
  subjectId: string;
  revisionId: string;
  evaluatedThroughSequence: number;
  seatId: string;
  actionId: string;
  effectClass: string;
  effectKey: string;
  authorizationDecisionId: string;
  outcome: "completed" | "uncertain";
  reasonCode: string;
  summary: string;
  evidenceRefs: string[];
}

export interface RunnerSupervisedEffectCandidate {
  runnerContractVersion: 1;
  candidateKind: "runner.supervised_effect_record";
  authority: "non_authoritative";
  journalSchemaVersion: 5;
  missionId: string;
  subjectId: string;
  revisionId: string;
  expectedPreviousSequence: number;
  intendedJournalSequence: number;
  payload: RunnerExecutionEffectPayload;
}

export interface RunnerAuthoritativeEffectRecord extends RunnerExecutionEffectPayload {
  entryId: string;
  missionId: string;
  journalSequence: number;
  timestamp: {
    value: string;
    provenance: "humanRecorded" | "hostTrusted";
  };
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
  effectRecordCandidate: RunnerSupervisedEffectCandidate | null;
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
  effectRecordCandidate: RunnerSupervisedEffectCandidate;
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
const POST_DISPATCH_STOP_REASONS = new Set<string>([
  "executor_failed", "executor_uncertain", "executor_malformed", "executor_identity_mismatch",
  "validator_failed", "validator_malformed", "validator_identity_mismatch",
]);

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
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      copy.push(deepCopyAndFreeze(Object.getOwnPropertyDescriptor(value, String(index))?.value));
    }
    return Object.freeze(copy) as T;
  }
  if (isPlainObject(value)) {
    const copy = Object.fromEntries(Object.keys(value).map((key) => [key, deepCopyAndFreeze(value[key])])) as T;
    return Object.freeze(copy);
  }
  return value;
}

function jsonPayloadErrors(value: unknown): string[] {
  const errors: string[] = [];
  const visiting = new WeakSet<object>();
  let nodes = 0;
  const visit = (current: unknown, path: string, depth: number): void => {
    nodes += 1;
    if (nodes > 2_048) { errors.push("Authorization artifact payload exceeds 2048 JSON nodes."); return; }
    if (depth > 16) { errors.push(`${path} exceeds maximum JSON depth 16.`); return; }
    if (current === null || typeof current === "boolean") return;
    if (typeof current === "string") {
      if (current.length > 16_384) errors.push(`${path} exceeds maximum JSON string length.`);
      return;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) errors.push(`${path} must be a finite JSON number.`);
      return;
    }
    if (typeof current !== "object") { errors.push(`${path} is not JSON-safe.`); return; }
    if (visiting.has(current)) { errors.push(`${path} contains a JSON cycle.`); return; }
    visiting.add(current);
    if (Array.isArray(current)) {
      const shapeErrors = arrayShapeErrors(current, path);
      errors.push(...shapeErrors);
      if (shapeErrors.length > 0) { visiting.delete(current); return; }
      for (let index = 0; index < current.length; index += 1) {
        visit(Object.getOwnPropertyDescriptor(current, String(index))?.value, `${path}[${index}]`, depth + 1);
      }
    } else if (isPlainObject(current)) {
      if (Object.keys(current).length > 256) errors.push(`${path} exceeds 256 JSON object fields.`);
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== "string" || key.length === 0 || key.length > 256) {
          errors.push(`${path} has an invalid JSON object key.`);
          continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
          errors.push(`${path}.${key} must be an enumerable JSON data field.`);
          continue;
        }
        visit(descriptor.value, `${path}.${key}`, depth + 1);
      }
    } else errors.push(`${path} must be a plain JSON object or array.`);
    visiting.delete(current);
  };
  if (!isPlainObject(value)) return ["Authorization artifact payload must be a plain JSON object."];
  visit(value, "Authorization artifact payload", 0);
  return errors;
}

export function validateRunnerOpaqueAuthorizationArtifact(
  input: unknown,
): RunnerContractResult<RunnerOpaqueAuthorizationArtifact> {
  const errors = exactFields(input, AUTHORIZATION_ARTIFACT_FIELDS, "Runner authorization artifact");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_authorization_artifact", errors);
  if (input.artifactSchemaVersion !== 1) errors.push("Runner authorization artifact schema version is unsupported.");
  if (!identifier(input.artifactId)) errors.push("Runner authorization artifact artifactId is invalid.");
  if (input.contentType !== "application/json") errors.push("Runner authorization artifact contentType is unsupported.");
  errors.push(...jsonPayloadErrors(input.payload));
  return errors.length > 0
    ? invalid("malformed_authorization_artifact", errors)
    : valid(input as unknown as RunnerOpaqueAuthorizationArtifact);
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
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}

function sequence(value: unknown): value is number {
  // Successful cycles reserve the immediately following journal sequence.
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < Number.MAX_SAFE_INTEGER;
}

function isoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
    hour <= 23 && minute <= 59 && second <= 59;
}

function validateStringSet(value: unknown, label: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value)) {
    return [`${label} must be ${allowEmpty ? "an" : "a non-empty"} array.`];
  }
  const errors = arrayShapeErrors(value, label);
  if (errors.length > 0) return errors;
  if (!allowEmpty && value.length === 0) return [`${label} must be a non-empty array.`];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = Object.getOwnPropertyDescriptor(value, String(index))?.value;
    if (!identifier(item)) errors.push(`${label}[${index}] is invalid.`);
    else if (seen.has(item)) errors.push(`${label} duplicates ${item}.`);
    else seen.add(item);
  }
  return errors;
}

function validateEffectEvidenceRefs(value: unknown, label: string): string[] {
  const errors = validateStringSet(value, label, false);
  if (errors.length > 0) return errors;
  if (Array.isArray(value) && value.length > 16) errors.push(`${label} must contain at most 16 references.`);
  return errors;
}

function validateModeReferences(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return [`${label} must be an array.`];
  const errors = arrayShapeErrors(value, label);
  if (errors.length > 0) return errors;
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = Object.getOwnPropertyDescriptor(value, String(index))?.value;
    const itemLabel = `${label}[${index}]`;
    const nested = exactFields(item, ["modeId", "modeVersion", "seatId", "activationSource"], itemLabel);
    errors.push(...nested);
    if (nested.length > 0 || !isPlainObject(item)) continue;
    for (const field of ["modeId", "modeVersion", "seatId", "activationSource"] as const) {
      if (!identifier(item[field])) errors.push(`${itemLabel}.${field} is invalid.`);
    }
    if (["modeId", "modeVersion", "seatId", "activationSource"].every((field) => identifier(item[field]))) {
      const key = `${item.seatId}\u0000${item.modeId}\u0000${item.modeVersion}\u0000${item.activationSource}`;
      if (seen.has(key)) errors.push(`${label} contains a duplicate exact mode reference.`);
      else seen.add(key);
    }
  }
  return errors;
}

const PROJECTION_FIELDS = [
  "runnerContractVersion", "journalSchemaVersion", "missionId", "subjectId", "revisionId", "evaluatedThroughSequence",
  "governanceState", "missionAuthorizationState", "executionStatus", "executeReadiness",
  "participantSeatIds", "activatedModes", "effectRecords",
] as const;
const MODE_CONTEXT_FIELDS = ["runnerContractVersion", "seatId", "modes"] as const;
const PLAN_FIELDS = [
  "runnerContractVersion", "cycleId", "missionId", "subjectId", "revisionId", "evaluatedThroughSequence",
  "seatId", "activatedModes", "actionId", "effectClass", "effectKey", "validationId", "stopCondition",
] as const;
const INPUT_FIELDS = [
  "runnerContractVersion", "projection", "resolvedModeContext", "actionAllowlist", "plan",
] as const;
const PERMISSION_FIELDS = [
  "runnerContractVersion", "decisionId", "outcome", "missionId", "subjectId", "revisionId",
  "evaluatedThroughSequence", "cycleId", "seatId", "actionId", "effectClass", "effectKey", "reasonCode",
  "authorizationArtifact",
] as const;
const EXECUTOR_FIELDS = [
  "runnerContractVersion", "outcome", "missionId", "subjectId", "revisionId", "evaluatedThroughSequence",
  "cycleId", "seatId", "actionId", "effectClass", "effectKey", "summary", "evidenceRefs",
] as const;
const VALIDATOR_FIELDS = [
  "runnerContractVersion", "outcome", "missionId", "subjectId", "revisionId", "evaluatedThroughSequence",
  "cycleId", "validationId", "effectKey", "summary",
] as const;
const AUTHORIZATION_ARTIFACT_FIELDS = ["artifactSchemaVersion", "artifactId", "contentType", "payload"] as const;
const EFFECT_PAYLOAD_FIELDS = [
  "runnerContractVersion", "cycleId", "subjectId", "revisionId", "evaluatedThroughSequence", "seatId",
  "actionId", "effectClass", "effectKey", "authorizationDecisionId", "outcome", "reasonCode", "summary",
  "evidenceRefs",
] as const;
const EFFECT_CANDIDATE_FIELDS = [
  "runnerContractVersion", "candidateKind", "authority", "journalSchemaVersion", "missionId", "subjectId",
  "revisionId", "expectedPreviousSequence", "intendedJournalSequence", "payload",
] as const;
const EFFECT_RECORD_FIELDS = [
  ...EFFECT_PAYLOAD_FIELDS, "entryId", "missionId", "journalSequence", "timestamp",
] as const;
const TIMESTAMP_FIELDS = ["value", "provenance"] as const;
const RESULT_FIELDS = [
  "runnerContractVersion", "outcome", "reason", "nextRoute", "missionId", "subjectId", "revisionId",
  "evaluatedThroughSequence", "cycleId", "actionId", "effectKey", "effectRecordCandidate",
] as const;

function validateProjection(input: unknown): RunnerContractResult<RunnerProjectionSnapshot> {
  const errors = exactFields(input, PROJECTION_FIELDS, "Runner projection");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_projection", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner projection contract version is unsupported.");
  if (input.journalSchemaVersion !== 5) errors.push("Runner projection requires supervised journal schema v5.");
  for (const field of ["missionId", "subjectId"] as const) if (!identifier(input[field])) errors.push(`Runner projection ${field} is invalid.`);
  if (!revision(input.revisionId)) errors.push("Runner projection revisionId is invalid.");
  if (!sequence(input.evaluatedThroughSequence)) errors.push("Runner projection evaluatedThroughSequence is invalid.");
  if (!["proposed", "approved", "paused", "cancelled"].includes(input.governanceState as string)) errors.push("Runner projection governanceState is unsupported.");
  if (!["waiting", "authorized", "ineligible", "invalidated"].includes(input.missionAuthorizationState as string)) errors.push("Runner projection missionAuthorizationState is unsupported.");
  if (!["not-started", "running", "completed"].includes(input.executionStatus as string)) errors.push("Runner projection executionStatus is unsupported.");
  if (!["ready", "waiting", "blocked", "invalid"].includes(input.executeReadiness as string)) errors.push("Runner projection executeReadiness is unsupported.");
  errors.push(...validateStringSet(input.participantSeatIds, "Runner projection participantSeatIds", false));
  errors.push(...validateModeReferences(input.activatedModes, "Runner projection activatedModes"));
  if (!Array.isArray(input.effectRecords)) errors.push("Runner projection effectRecords must be an array.");
  else {
    const shapeErrors = arrayShapeErrors(input.effectRecords, "Runner projection effectRecords");
    errors.push(...shapeErrors);
    if (shapeErrors.length === 0) {
      const effectKeys = new Set<string>();
      for (let index = 0; index < input.effectRecords.length; index += 1) {
        const record = Object.getOwnPropertyDescriptor(input.effectRecords, String(index))?.value;
        const checked = validateRunnerAuthoritativeEffectRecord(record);
        if (checked.state === "invalid") errors.push(...checked.errors.map((error) => `effectRecords[${index}]: ${error}`));
        else {
          if (checked.value.missionId !== input.missionId || checked.value.subjectId !== input.subjectId ||
              checked.value.revisionId !== input.revisionId || checked.value.journalSequence > (input.evaluatedThroughSequence as number)) {
            errors.push(`effectRecords[${index}] does not belong to the exact projection revision and sequence.`);
          }
          if (effectKeys.has(checked.value.effectKey)) errors.push(`effectRecords[${index}] duplicates effectKey ${checked.value.effectKey}.`);
          effectKeys.add(checked.value.effectKey);
        }
      }
    }
  }
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
  const artifact = validateRunnerOpaqueAuthorizationArtifact(input.authorizationArtifact);
  if (artifact.state === "invalid") errors.push(...artifact.errors);
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
  errors.push(...validateStringSet(input.evidenceRefs, "Runner executor result evidenceRefs", true));
  if (input.outcome === "completed" && Array.isArray(input.evidenceRefs) && input.evidenceRefs.length === 0) {
    errors.push("Completed executor result requires at least one evidenceRef.");
  }
  if (Array.isArray(input.evidenceRefs) && input.evidenceRefs.length > 15) {
    errors.push("Runner executor result supports at most 15 evidenceRefs in addition to its cycle attempt reference.");
  }
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

function effectPayloadValueErrors(input: Record<string, unknown>, label: string): string[] {
  const errors: string[] = [];
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push(`${label} runnerContractVersion is unsupported.`);
  for (const field of ["cycleId", "subjectId", "seatId", "actionId", "effectKey", "authorizationDecisionId", "reasonCode"] as const) {
    if (!identifier(input[field])) errors.push(`${label} ${field} is invalid.`);
  }
  if (!revision(input.revisionId)) errors.push(`${label} revisionId is invalid.`);
  if (!sequence(input.evaluatedThroughSequence)) errors.push(`${label} evaluatedThroughSequence is invalid.`);
  if (!EFFECT_CLASSES.has(input.effectClass as string)) errors.push(`${label} effectClass is unsupported.`);
  if (input.outcome !== "completed" && input.outcome !== "uncertain") errors.push(`${label} outcome is unsupported.`);
  if (!nonEmptyJournalSummary(input.summary)) errors.push(`${label} summary must be non-empty.`);
  errors.push(...validateEffectEvidenceRefs(input.evidenceRefs, `${label} evidenceRefs`));
  return errors;
}

export function validateRunnerExecutionEffectPayload(
  input: unknown,
): RunnerContractResult<RunnerExecutionEffectPayload> {
  const errors = exactFields(input, EFFECT_PAYLOAD_FIELDS, "Runner execution effect payload");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_effect_payload", errors);
  errors.push(...effectPayloadValueErrors(input, "Runner execution effect payload"));
  return errors.length > 0 ? invalid("malformed_effect_payload", errors) : valid(input as unknown as RunnerExecutionEffectPayload);
}

export function validateRunnerSupervisedEffectCandidate(
  input: unknown,
): RunnerContractResult<RunnerSupervisedEffectCandidate> {
  const errors = exactFields(input, EFFECT_CANDIDATE_FIELDS, "Runner supervised effect candidate");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_effect_candidate", errors);
  if (input.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push("Runner effect candidate contract version is unsupported.");
  if (input.candidateKind !== "runner.supervised_effect_record") errors.push("Runner effect candidate kind is unsupported.");
  if (input.authority !== "non_authoritative") errors.push("Runner effect candidate must be explicitly non-authoritative.");
  if (input.journalSchemaVersion !== 5) errors.push("Runner effect candidate requires supervised journal v5.");
  if (!identifier(input.missionId) || !identifier(input.subjectId)) errors.push("Runner effect candidate mission identity is invalid.");
  if (!revision(input.revisionId)) errors.push("Runner effect candidate revisionId is invalid.");
  if (!sequence(input.expectedPreviousSequence) || !sequence(input.intendedJournalSequence) ||
      input.intendedJournalSequence !== (input.expectedPreviousSequence as number) + 1) {
    errors.push("Runner effect candidate journal sequence is invalid.");
  }
  const payload = validateRunnerExecutionEffectPayload(input.payload);
  if (payload.state === "invalid") errors.push(...payload.errors);
  else if (input.subjectId !== payload.value.subjectId || input.revisionId !== payload.value.revisionId ||
      input.expectedPreviousSequence !== payload.value.evaluatedThroughSequence) {
    errors.push("Runner effect candidate identity does not match its payload.");
  }
  return errors.length > 0 ? invalid("malformed_effect_candidate", errors) : valid(input as unknown as RunnerSupervisedEffectCandidate);
}

export function validateRunnerAuthoritativeEffectRecord(
  input: unknown,
): RunnerContractResult<RunnerAuthoritativeEffectRecord> {
  const errors = exactFields(input, EFFECT_RECORD_FIELDS, "Runner authoritative effect record");
  if (errors.length > 0 || !isPlainObject(input)) return invalid("malformed_effect_record", errors);
  errors.push(...effectPayloadValueErrors(input, "Runner authoritative effect record"));
  if (!identifier(input.entryId) || !identifier(input.missionId)) errors.push("Runner authoritative effect record journal identity is invalid.");
  if (!sequence(input.journalSequence) || input.journalSequence !== (input.evaluatedThroughSequence as number) + 1) {
    errors.push("Runner authoritative effect record journal sequence is invalid.");
  }
  const timestampErrors = exactFields(input.timestamp, TIMESTAMP_FIELDS, "Runner authoritative effect record timestamp");
  errors.push(...timestampErrors);
  if (timestampErrors.length === 0 && isPlainObject(input.timestamp)) {
    if (!isoUtcTimestamp(input.timestamp.value)) errors.push("Runner authoritative effect record timestamp value is invalid.");
    if (input.timestamp.provenance !== "humanRecorded" && input.timestamp.provenance !== "hostTrusted") {
      errors.push("Runner authoritative effect record timestamp provenance is unsupported.");
    }
  }
  return errors.length > 0 ? invalid("malformed_effect_record", errors) : valid(input as unknown as RunnerAuthoritativeEffectRecord);
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
    if (input.effectRecordCandidate !== null) {
      const candidate = validateRunnerSupervisedEffectCandidate(input.effectRecordCandidate);
      if (candidate.state === "invalid") errors.push(...candidate.errors);
      else if (candidate.value.payload.outcome !== "uncertain") errors.push("Stopped runner effect candidate must be uncertain.");
    }
    if (POST_DISPATCH_STOP_REASONS.has(input.reason as string) !== (input.effectRecordCandidate !== null)) {
      errors.push("Runner stop must carry an uncertain effect candidate exactly when executor dispatch occurred.");
    }
  } else if (input.outcome === "advanced") {
    if (input.reason !== "effect_completed") errors.push("Advanced runner result reason is unsupported.");
    if (input.nextRoute !== "journal") errors.push("Advanced runner result must route to the journal boundary.");
    const candidate = validateRunnerSupervisedEffectCandidate(input.effectRecordCandidate);
    if (candidate.state === "invalid") errors.push(...candidate.errors);
    else if (candidate.value.payload.outcome !== "completed") errors.push("Advanced runner effect candidate must be completed.");
  } else {
    errors.push("Runner cycle result outcome is unsupported.");
  }
  if (isPlainObject(input.effectRecordCandidate)) {
    const candidate = validateRunnerSupervisedEffectCandidate(input.effectRecordCandidate);
    if (candidate.state === "valid" && (input.missionId !== candidate.value.missionId ||
        input.subjectId !== candidate.value.subjectId || input.revisionId !== candidate.value.revisionId ||
        input.evaluatedThroughSequence !== candidate.value.expectedPreviousSequence ||
        input.cycleId !== candidate.value.payload.cycleId || input.actionId !== candidate.value.payload.actionId ||
        input.effectKey !== candidate.value.payload.effectKey)) errors.push("Runner result identity does not match its effect candidate.");
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

function stopped(
  plan: RunnerCyclePlan,
  reason: RunnerStopReason,
  effectRecordCandidate: RunnerSupervisedEffectCandidate | null = null,
): RunnerCycleResult {
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
    effectRecordCandidate,
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
  const priorEffect = projection.effectRecords.find((record) => record.effectKey === plan.effectKey);
  if (priorEffect?.outcome === "completed") return "effect_already_completed";
  if (priorEffect?.outcome === "uncertain") return "effect_outcome_uncertain";
  return null;
}

function effectEvidenceRefs(plan: RunnerCyclePlan, executorResult?: RunnerExecutorResult): string[] {
  return [...new Set([plan.cycleId, ...(executorResult?.evidenceRefs ?? [])])].slice(0, 16);
}

function effectSummary(
  reasonCode: string,
  executorResult?: RunnerExecutorResult,
  validatorResult?: RunnerValidatorResult,
): string {
  const details = [
    `Runner outcome: ${reasonCode}.`,
    executorResult === undefined ? "Executor result unavailable." : `Executor: ${executorResult.summary}`,
    validatorResult === undefined ? "Validator result unavailable." : `Validator: ${validatorResult.summary}`,
  ].join(" ");
  return details.slice(0, 512);
}

function effectCandidate(
  plan: RunnerCyclePlan,
  decision: RunnerPermissionDecision,
  outcome: "completed" | "uncertain",
  reasonCode: string,
  executorResult?: RunnerExecutorResult,
  validatorResult?: RunnerValidatorResult,
): RunnerSupervisedEffectCandidate {
  return {
    runnerContractVersion: RUNNER_CONTRACT_VERSION,
    candidateKind: "runner.supervised_effect_record",
    authority: "non_authoritative",
    journalSchemaVersion: 5,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    revisionId: plan.revisionId,
    expectedPreviousSequence: plan.evaluatedThroughSequence,
    intendedJournalSequence: plan.evaluatedThroughSequence + 1,
    payload: {
      runnerContractVersion: RUNNER_CONTRACT_VERSION,
      cycleId: plan.cycleId,
      subjectId: plan.subjectId,
      revisionId: plan.revisionId,
      evaluatedThroughSequence: plan.evaluatedThroughSequence,
      seatId: plan.seatId,
      actionId: plan.actionId,
      effectClass: plan.effectClass,
      effectKey: plan.effectKey,
      authorizationDecisionId: decision.decisionId,
      outcome,
      reasonCode,
      summary: effectSummary(reasonCode, executorResult, validatorResult),
      evidenceRefs: effectEvidenceRefs(plan, executorResult),
    },
  };
}

function postDispatchStop(
  plan: RunnerCyclePlan,
  decision: RunnerPermissionDecision,
  reason: Extract<RunnerStopReason,
    | "executor_failed" | "executor_uncertain" | "executor_malformed" | "executor_identity_mismatch"
    | "validator_failed" | "validator_malformed" | "validator_identity_mismatch">,
  executorResult?: RunnerExecutorResult,
  validatorResult?: RunnerValidatorResult,
): RunnerContractResult<RunnerCycleResult> {
  return finalizedResult(stopped(
    plan,
    reason,
    effectCandidate(plan, decision, "uncertain", reason, executorResult, validatorResult),
  ));
}

export async function runRunnerCycle(
  input: unknown,
  dependencies: RunnerCycleDependencies,
): Promise<RunnerContractResult<RunnerCycleResult>> {
  let checked: RunnerContractResult<RunnerCycleInput>;
  try {
    checked = validateRunnerCycleInput(input);
  } catch {
    return invalid("malformed_input", ["Runner cycle input could not be safely inspected."]);
  }
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
  let checkedDecision: RunnerContractResult<RunnerPermissionDecision>;
  try {
    checkedDecision = validateRunnerPermissionDecision(rawDecision);
  } catch {
    return finalizedResult(stopped(cycle.plan, "authorization_malformed"));
  }
  if (checkedDecision.state === "invalid") return finalizedResult(stopped(cycle.plan, "authorization_malformed"));
  const decision = deepCopyAndFreeze(checkedDecision.value);
  if (!samePlanIdentity(decision, cycle.plan)) return finalizedResult(stopped(cycle.plan, "authorization_stale"));
  if (decision.outcome === "wait") return finalizedResult(stopped(cycle.plan, "authorization_wait"));
  if (decision.outcome === "deny") return finalizedResult(stopped(cycle.plan, "authorization_denied"));

  let rawExecutorResult: unknown;
  try {
    rawExecutorResult = await dependencies.execute(cycle.plan, decision);
  } catch {
    return postDispatchStop(cycle.plan, decision, "executor_failed");
  }
  let checkedExecutor: RunnerContractResult<RunnerExecutorResult>;
  try {
    checkedExecutor = validateRunnerExecutorResult(rawExecutorResult);
  } catch {
    return postDispatchStop(cycle.plan, decision, "executor_malformed");
  }
  if (checkedExecutor.state === "invalid") return postDispatchStop(cycle.plan, decision, "executor_malformed");
  const executorResult = deepCopyAndFreeze(checkedExecutor.value);
  if (!samePlanIdentity(executorResult, cycle.plan)) return postDispatchStop(cycle.plan, decision, "executor_identity_mismatch");
  if (executorResult.outcome === "uncertain") return postDispatchStop(cycle.plan, decision, "executor_uncertain", executorResult);
  if (executorResult.outcome === "failed") return postDispatchStop(cycle.plan, decision, "executor_failed", executorResult);

  let rawValidatorResult: unknown;
  try {
    rawValidatorResult = await dependencies.validate(cycle.plan, executorResult);
  } catch {
    return postDispatchStop(cycle.plan, decision, "validator_failed", executorResult);
  }
  let checkedValidator: RunnerContractResult<RunnerValidatorResult>;
  try {
    checkedValidator = validateRunnerValidatorResult(rawValidatorResult);
  } catch {
    return postDispatchStop(cycle.plan, decision, "validator_malformed", executorResult);
  }
  if (checkedValidator.state === "invalid") return postDispatchStop(cycle.plan, decision, "validator_malformed", executorResult);
  const validatorResult = deepCopyAndFreeze(checkedValidator.value);
  if (!sameValidationIdentity(validatorResult, cycle.plan)) {
    return postDispatchStop(cycle.plan, decision, "validator_identity_mismatch", executorResult);
  }
  if (validatorResult.outcome === "failed") {
    return postDispatchStop(cycle.plan, decision, "validator_failed", executorResult, validatorResult);
  }
  const completedCandidate = effectCandidate(
    cycle.plan, decision, "completed", "effect_completed", executorResult, validatorResult,
  );
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
    effectRecordCandidate: completedCandidate,
  });
}
