import type { RunnerCyclePlan, RunnerEffectClass, RunnerPermissionDecision, RunnerExecutorResult, RunnerOpaqueAuthorizationArtifact, RunnerJsonValue } from "./runner-v1.mjs";
import { validateRunnerExecutorResult, validateRunnerPermissionDecision } from "./runner-v1.mjs";
import {
  createPermissionAuditRecord,
  validatePermissionAuditReceipt,
  type PermissionAuditAppender,
  type PermissionAuditRecord,
} from "./permission-audit-v1.mjs";

export const PERMISSION_CONTRACT_VERSION = 1 as const;
export const PERMISSION_ATTESTATION_KINDS = ["capability", "repository_root", "writability"] as const;
export const PERMISSION_REASONS = [
  "permission_allowed", "binding_missing", "binding_inactive", "binding_stale", "binding_ambiguous",
  "seat_mismatch", "reasoning_runtime_mismatch", "tool_executor_mismatch", "repository_mismatch",
  "root_mismatch", "branch_mismatch", "revision_mismatch", "journal_sequence_mismatch",
  "action_out_of_scope", "effect_class_out_of_scope", "effect_key_out_of_scope",
  "capability_out_of_scope", "attestation_missing", "attestation_stale", "attestation_mismatch",
] as const;

export type PermissionReason = (typeof PERMISSION_REASONS)[number];
export type PermissionAttestationKind = (typeof PERMISSION_ATTESTATION_KINDS)[number];

export interface RuntimeBindingScope {
  actionIds: string[];
  effectClasses: RunnerEffectClass[];
  effectKeys: string[];
  capabilities: string[];
}

export interface RuntimeBinding {
  bindingSchemaVersion: 1;
  bindingId: string;
  bindingVersion: number;
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  seatId: string;
  reasoningRuntimeId: string;
  toolExecutorId: string;
  repositoryId: string;
  canonicalWritableRoot: string;
  branch: string;
  artifactRevisionId: string;
  recordedAtSequence: number;
  activeThroughSequence: number | null;
  lifecycleState: "active" | "superseded";
  approvedScope: RuntimeBindingScope;
  coulsonAuthorizationRef: string;
}

export interface HostPermissionAttestation {
  attestationSchemaVersion: 1;
  attestationId: string;
  kind: PermissionAttestationKind;
  hostId: string;
  toolExecutorId: string;
  repositoryId: string;
  canonicalWritableRoot: string;
  capabilityId: string | null;
  observedValue: string | boolean;
  observedAt: string;
  expiresAt: string;
}

export interface PermissionInvocationContext {
  permissionContractVersion: 1;
  journalSchemaVersion: 6;
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  artifactRevisionId: string;
  evaluatedThroughSequence: number;
  reasoningRuntimeId: string;
  toolExecutorId: string;
  repositoryId: string;
  canonicalWritableRoot: string;
  branch: string;
  requiredCapabilities: string[];
  activeBindings: RuntimeBinding[];
  attestations: HostPermissionAttestation[];
  evaluatedAt: string;
  decisionId: string;
}

export interface PermissionAuthorizationArtifactPayload {
  permissionContractVersion: 1;
  decisionId: string;
  reasonCode: PermissionReason;
  seatId: string;
  reasoningRuntimeId: string;
  toolExecutorId: string;
  bindingId: string;
  bindingVersion: number;
  repositoryId: string;
  canonicalWritableRoot: string;
  branch: string;
  missionRevisionId: string;
  artifactRevisionId: string;
  journalSequence: number;
  approvedScope: RuntimeBindingScope;
  attestationIds: string[];
}

export interface PermissionEvaluation {
  outcome: "allow" | "deny";
  reasonCode: PermissionReason;
  binding: RuntimeBinding | null;
  attestationIds: string[];
}

export interface PermissionAuthorizerDependencies extends PermissionAuditAppender {
  getContext(plan: RunnerCyclePlan): unknown | Promise<unknown>;
}

export interface AuditedExecutorDependencies extends PermissionAuditAppender {
  execute(plan: RunnerCyclePlan, decision: RunnerPermissionDecision): unknown | Promise<unknown>;
  getContext(decision: RunnerPermissionDecision): unknown | Promise<unknown>;
  nextRecordId(decision: RunnerPermissionDecision): string;
  now(): string;
}

type PermissionResult<T> = { state: "valid"; value: T } | { state: "invalid"; code: string; errors: string[] };
const invalid = <T = never,>(code: string, ...errors: string[]): PermissionResult<T> => ({ state: "invalid", code, errors: errors.flat() });
const valid = <T,>(value: T): PermissionResult<T> => ({ state: "valid", value });
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/;
const HUMAN_ONLY_SEATS = new Set(["coulson", "fitz", "simmons"]);
const EFFECT_CLASSES = new Set(["behavioral_implementation", "verification", "coordination"]);
const BINDING_FIELDS = ["bindingSchemaVersion", "bindingId", "bindingVersion", "missionId", "subjectId", "missionRevisionId", "seatId", "reasoningRuntimeId", "toolExecutorId", "repositoryId", "canonicalWritableRoot", "branch", "artifactRevisionId", "recordedAtSequence", "activeThroughSequence", "lifecycleState", "approvedScope", "coulsonAuthorizationRef"] as const;
const SCOPE_FIELDS = ["actionIds", "effectClasses", "effectKeys", "capabilities"] as const;
const ATTESTATION_FIELDS = ["attestationSchemaVersion", "attestationId", "kind", "hostId", "toolExecutorId", "repositoryId", "canonicalWritableRoot", "capabilityId", "observedValue", "observedAt", "expiresAt"] as const;
const CONTEXT_FIELDS = ["permissionContractVersion", "journalSchemaVersion", "missionId", "subjectId", "missionRevisionId", "artifactRevisionId", "evaluatedThroughSequence", "reasoningRuntimeId", "toolExecutorId", "repositoryId", "canonicalWritableRoot", "branch", "requiredCapabilities", "activeBindings", "attestations", "evaluatedAt", "decisionId"] as const;
const ARTIFACT_FIELDS = ["permissionContractVersion", "decisionId", "reasonCode", "seatId", "reasoningRuntimeId", "toolExecutorId", "bindingId", "bindingVersion", "repositoryId", "canonicalWritableRoot", "branch", "missionRevisionId", "artifactRevisionId", "journalSequence", "approvedScope", "attestationIds"] as const;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value: unknown, fields: readonly string[], label: string): string[] {
  if (!plain(value)) return [`${label} must be a plain object.`];
  const allowed = new Set(fields);
  const errors: string[] = [];
  for (const field of fields) if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : undefined;
    if (typeof key !== "string" || !allowed.has(key)) errors.push(`${label} has unknown field: ${String(key)}.`);
    else if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) errors.push(`${label}.${key} must be an enumerable data field.`);
  }
  return errors;
}

function id(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function root(value: unknown): value is string { return typeof value === "string" && value.startsWith("/") && !value.includes("\0") && !value.includes("/../") && value.length <= 4096; }
function time(value: unknown): value is string { return typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value)); }

function stringSet(value: unknown, label: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return [`${label} must be a plain array.`];
  const errors: string[] = [];
  const seen = new Set<string>();
  if (!allowEmpty && value.length === 0) errors.push(`${label} must not be empty.`);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) { errors.push(`${label} must not be sparse.`); continue; }
    const item = Object.getOwnPropertyDescriptor(value, String(index))?.value;
    if (!id(item)) errors.push(`${label}[${index}] is invalid.`);
    else if (seen.has(item)) errors.push(`${label} duplicates ${item}.`);
    else seen.add(item);
  }
  if (value.every((item) => typeof item === "string") && value.some((item, index) => index > 0 && String(value[index - 1]).localeCompare(String(item)) >= 0)) errors.push(`${label} must be sorted and unique.`);
  return errors;
}

function scopeErrors(value: unknown, label: string): string[] {
  const errors = exact(value, SCOPE_FIELDS, label);
  if (errors.length > 0 || !plain(value)) return errors;
  errors.push(...stringSet(value.actionIds, `${label} actionIds`, false), ...stringSet(value.effectClasses, `${label} effectClasses`, false), ...stringSet(value.effectKeys, `${label} effectKeys`, false), ...stringSet(value.capabilities, `${label} capabilities`));
  if (Array.isArray(value.effectClasses) && value.effectClasses.some((item) => !EFFECT_CLASSES.has(String(item)))) errors.push(`${label} effectClasses are invalid.`);
  return errors;
}

export function validateRuntimeBinding(input: unknown): PermissionResult<RuntimeBinding> {
  const errors = exact(input, BINDING_FIELDS, "Runtime binding");
  if (errors.length > 0 || !plain(input)) return invalid("binding_malformed", ...errors);
  if (input.bindingSchemaVersion !== 1) errors.push("Runtime binding schema version is unsupported.");
  for (const field of ["bindingId", "missionId", "subjectId", "seatId", "reasoningRuntimeId", "toolExecutorId", "repositoryId", "branch", "coulsonAuthorizationRef"] as const) if (!id(input[field])) errors.push(`Runtime binding ${field} is invalid.`);
  if (HUMAN_ONLY_SEATS.has(String(input.seatId))) errors.push("Human-only seats cannot receive runtime bindings.");
  if (input.seatId === input.reasoningRuntimeId || input.seatId === input.toolExecutorId) errors.push("Runtime and executor identities cannot be seats.");
  if (!REVISION.test(String(input.missionRevisionId ?? "")) || !REVISION.test(String(input.artifactRevisionId ?? ""))) errors.push("Runtime binding revisions are invalid.");
  if (!root(input.canonicalWritableRoot)) errors.push("Runtime binding writable root is invalid.");
  if (!Number.isSafeInteger(input.bindingVersion) || (input.bindingVersion as number) < 1 || !Number.isSafeInteger(input.recordedAtSequence) || (input.recordedAtSequence as number) < 1) errors.push("Runtime binding version or sequence is invalid.");
  if (input.activeThroughSequence !== null && (!Number.isSafeInteger(input.activeThroughSequence) || (input.activeThroughSequence as number) < (input.recordedAtSequence as number))) errors.push("Runtime binding activeThroughSequence is invalid.");
  if (input.lifecycleState !== "active" && input.lifecycleState !== "superseded") errors.push("Runtime binding lifecycle state is invalid.");
  errors.push(...scopeErrors(input.approvedScope, "Runtime binding scope"));
  return errors.length > 0 ? invalid("binding_malformed", ...errors) : valid(input as unknown as RuntimeBinding);
}

export function validateHostPermissionAttestation(input: unknown): PermissionResult<HostPermissionAttestation> {
  const errors = exact(input, ATTESTATION_FIELDS, "Host attestation");
  if (errors.length > 0 || !plain(input)) return invalid("attestation_malformed", ...errors);
  if (input.attestationSchemaVersion !== 1 || !PERMISSION_ATTESTATION_KINDS.includes(input.kind as PermissionAttestationKind)) errors.push("Host attestation version or kind is invalid.");
  for (const field of ["attestationId", "hostId", "toolExecutorId", "repositoryId"] as const) if (!id(input[field])) errors.push(`Host attestation ${field} is invalid.`);
  if (!root(input.canonicalWritableRoot)) errors.push("Host attestation writable root is invalid.");
  if (input.capabilityId !== null && !id(input.capabilityId)) errors.push("Host attestation capabilityId is invalid.");
  if (input.kind === "capability" ? input.capabilityId === null : input.capabilityId !== null) errors.push("Host attestation capability identity is inconsistent with its kind.");
  if (typeof input.observedValue !== "string" && typeof input.observedValue !== "boolean") errors.push("Host attestation observedValue is invalid.");
  if (!time(input.observedAt) || !time(input.expiresAt) || Date.parse(String(input.expiresAt)) < Date.parse(String(input.observedAt))) errors.push("Host attestation freshness interval is invalid.");
  return errors.length > 0 ? invalid("attestation_malformed", ...errors) : valid(input as unknown as HostPermissionAttestation);
}

export function validatePermissionInvocationContext(input: unknown): PermissionResult<PermissionInvocationContext> {
  const errors = exact(input, CONTEXT_FIELDS, "Permission context");
  if (errors.length > 0 || !plain(input)) return invalid("permission_context_malformed", ...errors);
  if (input.permissionContractVersion !== 1 || input.journalSchemaVersion !== 6) errors.push("Permission context requires contract v1 and journal v6.");
  for (const field of ["missionId", "subjectId", "reasoningRuntimeId", "toolExecutorId", "repositoryId", "branch", "decisionId"] as const) if (!id(input[field])) errors.push(`Permission context ${field} is invalid.`);
  if (!REVISION.test(String(input.missionRevisionId ?? "")) || !REVISION.test(String(input.artifactRevisionId ?? ""))) errors.push("Permission context revisions are invalid.");
  if (!root(input.canonicalWritableRoot) || !time(input.evaluatedAt) || !Number.isSafeInteger(input.evaluatedThroughSequence) || (input.evaluatedThroughSequence as number) < 0) errors.push("Permission context root, time, or sequence is invalid.");
  errors.push(...stringSet(input.requiredCapabilities, "Permission context requiredCapabilities"));
  if (!Array.isArray(input.activeBindings) || Object.getPrototypeOf(input.activeBindings) !== Array.prototype) errors.push("Permission context activeBindings must be a plain array.");
  else input.activeBindings.forEach((binding, index) => { const checked = validateRuntimeBinding(binding); if (checked.state === "invalid") errors.push(...checked.errors.map((error) => `activeBindings[${index}]: ${error}`)); else if (checked.value.lifecycleState !== "active") errors.push(`activeBindings[${index}] is not active.`); });
  if (!Array.isArray(input.attestations) || Object.getPrototypeOf(input.attestations) !== Array.prototype) errors.push("Permission context attestations must be a plain array.");
  else {
    const ids = new Set<string>();
    input.attestations.forEach((attestation, index) => { const checked = validateHostPermissionAttestation(attestation); if (checked.state === "invalid") errors.push(...checked.errors.map((error) => `attestations[${index}]: ${error}`)); else if (ids.has(checked.value.attestationId)) errors.push(`attestations duplicates ${checked.value.attestationId}.`); else ids.add(checked.value.attestationId); });
  }
  return errors.length > 0 ? invalid("permission_context_malformed", ...errors) : valid(input as unknown as PermissionInvocationContext);
}

export function validatePermissionAuthorizationArtifactPayload(input: unknown): PermissionResult<PermissionAuthorizationArtifactPayload> {
  const errors = exact(input, ARTIFACT_FIELDS, "Permission artifact");
  if (errors.length > 0 || !plain(input)) return invalid("permission_artifact_malformed", ...errors);
  if (input.permissionContractVersion !== 1 || !PERMISSION_REASONS.includes(input.reasonCode as PermissionReason)) errors.push("Permission artifact version or reason is invalid.");
  for (const field of ["decisionId", "seatId", "reasoningRuntimeId", "toolExecutorId", "bindingId", "repositoryId", "branch"] as const) if (!id(input[field])) errors.push(`Permission artifact ${field} is invalid.`);
  if (!REVISION.test(String(input.missionRevisionId ?? "")) || !REVISION.test(String(input.artifactRevisionId ?? "")) || !root(input.canonicalWritableRoot)) errors.push("Permission artifact revisions or root are invalid.");
  if (!Number.isSafeInteger(input.bindingVersion) || (input.bindingVersion as number) < 1 || !Number.isSafeInteger(input.journalSequence) || (input.journalSequence as number) < 0) errors.push("Permission artifact binding version or sequence is invalid.");
  errors.push(...scopeErrors(input.approvedScope, "Permission artifact approvedScope"), ...stringSet(input.attestationIds, "Permission artifact attestationIds", false));
  return errors.length > 0 ? invalid("permission_artifact_malformed", ...errors) : valid(input as unknown as PermissionAuthorizationArtifactPayload);
}

const deny = (reasonCode: PermissionReason, binding: RuntimeBinding | null = null, attestationIds: string[] = []): PermissionEvaluation => ({ outcome: "deny", reasonCode, binding, attestationIds });

export function evaluatePermission(plan: RunnerCyclePlan, contextInput: unknown): PermissionEvaluation {
  const checked = validatePermissionInvocationContext(contextInput);
  if (checked.state === "invalid") return deny(checked.errors.some((error) => error.includes("attestation")) ? "attestation_mismatch" : "binding_missing");
  const context = checked.value;
  if (context.missionId !== plan.missionId || context.subjectId !== plan.subjectId || context.missionRevisionId !== plan.revisionId) return deny("revision_mismatch");
  if (context.evaluatedThroughSequence !== plan.evaluatedThroughSequence) return deny("journal_sequence_mismatch");
  const matches = context.activeBindings.filter((binding) => binding.missionId === plan.missionId && binding.subjectId === plan.subjectId && binding.seatId === plan.seatId);
  if (matches.length === 0) return deny("binding_missing");
  if (matches.length > 1) return deny("binding_ambiguous");
  const binding = matches[0];
  if (binding.lifecycleState !== "active") return deny("binding_inactive", binding);
  if (binding.recordedAtSequence > plan.evaluatedThroughSequence || (binding.activeThroughSequence !== null && binding.activeThroughSequence < plan.evaluatedThroughSequence)) return deny("binding_stale", binding);
  if (binding.reasoningRuntimeId !== context.reasoningRuntimeId) return deny("reasoning_runtime_mismatch", binding);
  if (binding.toolExecutorId !== context.toolExecutorId) return deny("tool_executor_mismatch", binding);
  if (binding.repositoryId !== context.repositoryId) return deny("repository_mismatch", binding);
  if (binding.canonicalWritableRoot !== context.canonicalWritableRoot) return deny("root_mismatch", binding);
  if (binding.branch !== context.branch) return deny("branch_mismatch", binding);
  if (binding.missionRevisionId !== context.missionRevisionId || binding.artifactRevisionId !== context.artifactRevisionId) return deny("revision_mismatch", binding);
  if (!binding.approvedScope.actionIds.includes(plan.actionId)) return deny("action_out_of_scope", binding);
  if (!binding.approvedScope.effectClasses.includes(plan.effectClass)) return deny("effect_class_out_of_scope", binding);
  if (!binding.approvedScope.effectKeys.includes(plan.effectKey)) return deny("effect_key_out_of_scope", binding);
  if (context.requiredCapabilities.some((capability) => !binding.approvedScope.capabilities.includes(capability))) return deny("capability_out_of_scope", binding);
  const roots = context.attestations.filter(({ kind }) => kind === "repository_root");
  const writability = context.attestations.filter(({ kind }) => kind === "writability");
  const capabilities = context.requiredCapabilities.map((capability) => context.attestations.filter((item) => item.kind === "capability" && item.capabilityId === capability));
  if (roots.length === 0 || writability.length === 0 || capabilities.some((items) => items.length === 0)) return deny("attestation_missing", binding);
  if (roots.length !== 1 || writability.length !== 1 || capabilities.some((items) => items.length !== 1) || context.attestations.length !== 2 + context.requiredCapabilities.length) return deny("attestation_mismatch", binding);
  const selected = [roots[0], writability[0], ...capabilities.map(([item]) => item)];
  if (new Set(selected.map(({ hostId }) => hostId)).size !== 1 || selected.some((item) => item.toolExecutorId !== context.toolExecutorId || item.repositoryId !== context.repositoryId || item.canonicalWritableRoot !== context.canonicalWritableRoot)) return deny("attestation_mismatch", binding);
  const now = Date.parse(context.evaluatedAt);
  if (selected.some((item) => Date.parse(item.observedAt) > now || now > Date.parse(item.expiresAt))) return deny("attestation_stale", binding);
  if (roots[0].observedValue !== context.canonicalWritableRoot || writability[0].observedValue !== true || capabilities.some(([item]) => item.observedValue !== true)) return deny("attestation_mismatch", binding);
  return { outcome: "allow", reasonCode: "permission_allowed", binding, attestationIds: selected.map(({ attestationId }) => attestationId).sort() };
}

function artifact(plan: RunnerCyclePlan, context: PermissionInvocationContext, evaluation: PermissionEvaluation, binding: RuntimeBinding): RunnerOpaqueAuthorizationArtifact {
  const payload: PermissionAuthorizationArtifactPayload = {
    permissionContractVersion: 1, decisionId: context.decisionId, reasonCode: evaluation.reasonCode,
    seatId: plan.seatId, reasoningRuntimeId: context.reasoningRuntimeId, toolExecutorId: context.toolExecutorId,
    bindingId: binding.bindingId, bindingVersion: binding.bindingVersion, repositoryId: context.repositoryId,
    canonicalWritableRoot: context.canonicalWritableRoot, branch: context.branch, missionRevisionId: plan.revisionId,
    artifactRevisionId: context.artifactRevisionId, journalSequence: plan.evaluatedThroughSequence,
    approvedScope: { actionIds: [...binding.approvedScope.actionIds], effectClasses: [...binding.approvedScope.effectClasses], effectKeys: [...binding.approvedScope.effectKeys], capabilities: [...binding.approvedScope.capabilities] },
    attestationIds: [...evaluation.attestationIds],
  };
  return { artifactSchemaVersion: 1, artifactId: `permission-artifact:${context.decisionId}`, contentType: "application/json", payload: payload as unknown as { [key: string]: RunnerJsonValue } };
}

function auditRecord(plan: RunnerCyclePlan, context: PermissionInvocationContext, binding: RuntimeBinding, recordType: "permission.decision" | "tool.result", outcome: "allow" | "deny" | "completed" | "failed" | "uncertain", recordId: string, recordedAt: string, summary: string | null, evidenceRefs: string[]): PermissionAuditRecord {
  return createPermissionAuditRecord({ recordId, recordType, recordedAt, decisionId: context.decisionId, outcome,
    missionId: plan.missionId, subjectId: plan.subjectId, seatId: plan.seatId, reasoningRuntimeId: context.reasoningRuntimeId,
    toolExecutorId: context.toolExecutorId, bindingId: binding.bindingId, bindingVersion: binding.bindingVersion,
    repositoryId: context.repositoryId, canonicalWritableRoot: context.canonicalWritableRoot, branch: context.branch,
    revisionId: plan.revisionId, journalSequence: plan.evaluatedThroughSequence, actionId: plan.actionId,
    effectClass: plan.effectClass, effectKey: plan.effectKey,
    approvedScope: [...binding.approvedScope.actionIds, ...binding.approvedScope.effectClasses, ...binding.approvedScope.effectKeys, ...binding.approvedScope.capabilities].sort(),
    summary, evidenceRefs });
}

export function createPermissionAuthorizer(dependencies: PermissionAuthorizerDependencies) {
  const used = new Set<string>();
  return async (plan: RunnerCyclePlan): Promise<RunnerPermissionDecision> => {
    const checked = validatePermissionInvocationContext(await dependencies.getContext(plan));
    if (checked.state === "invalid") throw new Error("permission_context_malformed");
    const context = checked.value;
    if (used.has(context.decisionId)) throw new Error("decision_reused");
    const evaluation = evaluatePermission(plan, context);
    if (evaluation.binding === null) throw new Error(evaluation.reasonCode);
    const binding = evaluation.binding;
    const decision: RunnerPermissionDecision = { runnerContractVersion: 1, decisionId: context.decisionId, outcome: evaluation.outcome,
      missionId: plan.missionId, subjectId: plan.subjectId, revisionId: plan.revisionId, evaluatedThroughSequence: plan.evaluatedThroughSequence,
      cycleId: plan.cycleId, seatId: plan.seatId, actionId: plan.actionId, effectClass: plan.effectClass, effectKey: plan.effectKey,
      reasonCode: evaluation.reasonCode, authorizationArtifact: artifact(plan, context, evaluation, binding) };
    const record = auditRecord(plan, context, binding, "permission.decision", evaluation.outcome, `audit:${context.decisionId}`, context.evaluatedAt, null, evaluation.attestationIds);
    const receipt = await dependencies.appendIfAbsent(record);
    if (validatePermissionAuditReceipt(receipt, record).state === "invalid") throw new Error("audit_receipt_mismatch");
    used.add(context.decisionId);
    return decision;
  };
}

function exactDecision(plan: RunnerCyclePlan, decision: RunnerPermissionDecision, context: PermissionInvocationContext): RuntimeBinding | null {
  if (validateRunnerPermissionDecision(decision).state === "invalid" || decision.outcome !== "allow" || decision.decisionId !== context.decisionId) return null;
  const checkedArtifact = validatePermissionAuthorizationArtifactPayload(decision.authorizationArtifact.payload);
  if (checkedArtifact.state === "invalid") return null;
  const value = checkedArtifact.value;
  const evaluation = evaluatePermission(plan, context);
  const binding = evaluation.binding;
  if (evaluation.outcome !== "allow" || binding === null || value.reasonCode !== evaluation.reasonCode || value.bindingId !== binding.bindingId || value.bindingVersion !== binding.bindingVersion || value.reasoningRuntimeId !== context.reasoningRuntimeId || value.toolExecutorId !== context.toolExecutorId || value.repositoryId !== context.repositoryId || value.canonicalWritableRoot !== context.canonicalWritableRoot || value.branch !== context.branch || value.missionRevisionId !== plan.revisionId || value.artifactRevisionId !== context.artifactRevisionId || value.journalSequence !== plan.evaluatedThroughSequence || JSON.stringify(value.approvedScope) !== JSON.stringify(binding.approvedScope) || JSON.stringify(value.attestationIds) !== JSON.stringify(evaluation.attestationIds)) return null;
  return binding;
}

export function createAuditedExecutor(dependencies: AuditedExecutorDependencies) {
  return async (plan: RunnerCyclePlan, decision: RunnerPermissionDecision): Promise<RunnerExecutorResult> => {
    const failed = (summary: string): RunnerExecutorResult => ({ runnerContractVersion: 1, outcome: "failed", missionId: plan.missionId, subjectId: plan.subjectId, revisionId: plan.revisionId, evaluatedThroughSequence: plan.evaluatedThroughSequence, cycleId: plan.cycleId, seatId: plan.seatId, actionId: plan.actionId, effectClass: plan.effectClass, effectKey: plan.effectKey, summary, evidenceRefs: [`not-attempted:${plan.cycleId}`] });
    let context: PermissionInvocationContext;
    try {
      const checked = validatePermissionInvocationContext(await dependencies.getContext(decision));
      if (checked.state === "invalid") return failed("Fresh permission context is malformed; tool invocation was not attempted.");
      context = checked.value;
    } catch { return failed("Fresh permission context could not be acquired; tool invocation was not attempted."); }
    const binding = exactDecision(plan, decision, context);
    if (binding === null) return failed("Permission changed after authorization; tool invocation was not attempted.");
    let raw: unknown;
    try { raw = await dependencies.execute(plan, decision); }
    catch { raw = null; }
    const checked = validateRunnerExecutorResult(raw);
    const result: RunnerExecutorResult = checked.state === "valid" ? checked.value : { ...failed("Executor result is unavailable or malformed; effect outcome is uncertain."), outcome: "uncertain", evidenceRefs: [plan.cycleId] };
    const record = auditRecord(plan, context, binding, "tool.result", result.outcome, dependencies.nextRecordId(decision), dependencies.now(), result.summary, result.evidenceRefs);
    try {
      const receipt = await dependencies.appendIfAbsent(record);
      if (validatePermissionAuditReceipt(receipt, record).state === "invalid") throw new Error("receipt");
    } catch {
      return { ...result, outcome: "uncertain", summary: "Tool result audit append was not durably verified; effect outcome is uncertain.", evidenceRefs: [...new Set([plan.cycleId, ...result.evidenceRefs])].slice(0, 16) };
    }
    return result;
  };
}
