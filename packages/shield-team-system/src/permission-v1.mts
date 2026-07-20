import type {
  RunnerCyclePlan,
  RunnerEffectClass,
  RunnerPermissionDecision,
} from "./runner-v1.mjs";
import {
  validateRunnerExecutorResult,
  validateRunnerPermissionDecision,
  type RunnerExecutorResult,
} from "./runner-v1.mjs";
import {
  validatePermissionAuditAppendReceipt,
  validatePermissionAuditRecord,
  type PermissionAuditRecord,
} from "./permission-audit-v1.mjs";

export const PERMISSION_CONTRACT_VERSION = 1 as const;
export const PERMISSION_ATTESTATION_KINDS = ["capability", "repository_root", "writability"] as const;
export const PERMISSION_REASONS = [
  "permission_allowed", "binding_missing", "binding_inactive", "binding_stale",
  "binding_ambiguous",
  "seat_mismatch", "reasoning_runtime_mismatch", "tool_executor_mismatch",
  "repository_mismatch", "root_mismatch", "branch_mismatch", "revision_mismatch",
  "journal_sequence_mismatch", "action_out_of_scope", "effect_class_out_of_scope",
  "effect_key_out_of_scope", "capability_out_of_scope", "attestation_missing",
  "attestation_stale", "attestation_mismatch", "decision_reused",
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

export type PermissionEvaluation = {
  outcome: "allow" | "deny";
  reasonCode: PermissionReason;
  binding: RuntimeBinding | null;
  attestationIds: string[];
};

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

export interface PermissionAuthorizerDependencies {
  getContext(plan: RunnerCyclePlan): unknown | Promise<unknown>;
  appendAuditIfAbsent(record: PermissionAuditRecord): unknown | Promise<unknown>;
}

export interface ToolResultAuditInput {
  plan: RunnerCyclePlan;
  context: PermissionInvocationContext;
  decision: RunnerPermissionDecision;
  outcome: "completed" | "failed" | "uncertain";
  reasonCode: string;
  observedAt: string;
  recordId: string;
}

export interface AuditedExecutorDependencies {
  execute(plan: RunnerCyclePlan, decision: RunnerPermissionDecision): unknown | Promise<unknown>;
  getContext(decision: RunnerPermissionDecision): PermissionInvocationContext | Promise<PermissionInvocationContext>;
  appendAuditIfAbsent(record: PermissionAuditRecord): unknown | Promise<unknown>;
  nextRecordId(decision: RunnerPermissionDecision): string;
  now(): string;
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/;
const EFFECT_CLASSES = new Set<string>(["behavioral_implementation", "verification", "coordination"]);
const ATTESTATION_KINDS = new Set<string>(PERMISSION_ATTESTATION_KINDS);
const CONTEXT_FIELDS = [
  "permissionContractVersion", "journalSchemaVersion", "missionId", "subjectId", "missionRevisionId",
  "artifactRevisionId", "evaluatedThroughSequence", "reasoningRuntimeId", "toolExecutorId", "repositoryId",
  "canonicalWritableRoot", "branch", "requiredCapabilities", "activeBindings", "attestations",
  "evaluatedAt", "decisionId",
] as const;
const BINDING_FIELDS = [
  "bindingSchemaVersion", "bindingId", "bindingVersion", "missionId", "subjectId", "missionRevisionId", "seatId",
  "reasoningRuntimeId", "toolExecutorId", "repositoryId", "canonicalWritableRoot", "branch",
  "artifactRevisionId", "recordedAtSequence", "activeThroughSequence", "lifecycleState", "approvedScope",
  "coulsonAuthorizationRef",
] as const;
const SCOPE_FIELDS = ["actionIds", "effectClasses", "effectKeys", "capabilities"] as const;
const ATTESTATION_FIELDS = [
  "attestationSchemaVersion", "attestationId", "kind", "hostId", "toolExecutorId", "repositoryId",
  "canonicalWritableRoot", "capabilityId", "observedValue", "observedAt", "expiresAt",
] as const;
const ARTIFACT_PAYLOAD_FIELDS = [
  "permissionContractVersion", "decisionId", "reasonCode", "seatId", "reasoningRuntimeId",
  "toolExecutorId", "bindingId", "bindingVersion", "repositoryId", "canonicalWritableRoot",
  "branch", "missionRevisionId", "artifactRevisionId", "journalSequence", "approvedScope",
  "attestationIds",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactFields(value: unknown, fields: readonly string[], label: string): string[] {
  if (!isPlainObject(value)) return [`${label} must be a plain object.`];
  const allowed = new Set(fields);
  const errors: string[] = [];
  for (const field of fields) if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) errors.push(`${label} has unknown field: ${String(key)}.`);
    else {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) errors.push(`${label}.${key} must be an enumerable data field.`);
    }
  }
  return errors;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function validAbsoluteRoot(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && value.length <= 4096 && !value.includes("\0") && !value.includes("/../");
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && /Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function stringSetErrors(value: unknown, label: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return [`${label} must be a plain array.`];
  const errors: string[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) errors.push(`${label} has an unsafe array field.`);
  }
  if (errors.length > 0) return errors;
  if (!allowEmpty && value.length === 0) errors.push(`${label} must not be empty.`);
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (!validIdentifier(item)) errors.push(`${label}[${index}] is invalid.`);
    else if (seen.has(item)) errors.push(`${label} duplicates ${item}.`);
    else seen.add(item);
  });
  if (value.every((item) => typeof item === "string") && value.some((item, index) => index > 0 && String(value[index - 1]).localeCompare(String(item)) >= 0)) errors.push(`${label} must be sorted and unique.`);
  return errors;
}

export function validateRuntimeBinding(input: unknown): { state: "valid"; value: RuntimeBinding } | { state: "invalid"; code: string; errors: string[] } {
  const errors = exactFields(input, BINDING_FIELDS, "Runtime binding");
  if (errors.length > 0 || !isPlainObject(input)) return { state: "invalid", code: "binding_malformed", errors };
  if (input.bindingSchemaVersion !== 1) errors.push("Runtime binding schema version is unsupported.");
  for (const field of ["bindingId", "missionId", "subjectId", "seatId", "reasoningRuntimeId", "toolExecutorId", "repositoryId", "branch", "coulsonAuthorizationRef"] as const) {
    if (!validIdentifier(input[field])) errors.push(`Runtime binding ${field} is invalid.`);
  }
  if (input.reasoningRuntimeId === input.seatId || input.toolExecutorId === input.seatId) {
    errors.push("Runtime and executor identities must not be represented as seat identities.");
  }
  if (!REVISION.test(String(input.missionRevisionId ?? ""))) errors.push("Runtime binding missionRevisionId is invalid.");
  if (!REVISION.test(String(input.artifactRevisionId ?? ""))) errors.push("Runtime binding artifactRevisionId is invalid.");
  if (!validAbsoluteRoot(input.canonicalWritableRoot)) errors.push("Runtime binding canonicalWritableRoot must be canonical and absolute.");
  if (!Number.isSafeInteger(input.bindingVersion) || (input.bindingVersion as number) < 1) errors.push("Runtime binding version is invalid.");
  if (!Number.isSafeInteger(input.recordedAtSequence) || (input.recordedAtSequence as number) < 1) errors.push("Runtime binding recordedAtSequence is invalid.");
  if (input.activeThroughSequence !== null && (!Number.isSafeInteger(input.activeThroughSequence) || (input.activeThroughSequence as number) < (input.recordedAtSequence as number))) errors.push("Runtime binding activeThroughSequence is invalid.");
  if (!["active", "superseded"].includes(String(input.lifecycleState))) errors.push("Runtime binding lifecycleState is unsupported.");
  const scopeErrors = exactFields(input.approvedScope, SCOPE_FIELDS, "Runtime binding scope");
  errors.push(...scopeErrors);
  if (scopeErrors.length === 0 && isPlainObject(input.approvedScope)) {
    errors.push(...stringSetErrors(input.approvedScope.actionIds, "Runtime binding scope actionIds", false));
    errors.push(...stringSetErrors(input.approvedScope.effectKeys, "Runtime binding scope effectKeys", false));
    errors.push(...stringSetErrors(input.approvedScope.capabilities, "Runtime binding scope capabilities", true));
    errors.push(...stringSetErrors(input.approvedScope.effectClasses, "Runtime binding scope effectClasses", false));
    if (Array.isArray(input.approvedScope.effectClasses) && input.approvedScope.effectClasses.some((value) => !EFFECT_CLASSES.has(String(value)))) errors.push("Runtime binding scope effectClasses are invalid.");
  }
  return errors.length > 0 ? { state: "invalid", code: "binding_malformed", errors } : { state: "valid", value: input as unknown as RuntimeBinding };
}

export function validateHostPermissionAttestation(input: unknown): { state: "valid"; value: HostPermissionAttestation } | { state: "invalid"; code: string; errors: string[] } {
  const errors = exactFields(input, ATTESTATION_FIELDS, "Host attestation");
  if (errors.length > 0 || !isPlainObject(input)) return { state: "invalid", code: "attestation_malformed", errors };
  if (input.attestationSchemaVersion !== 1) errors.push("Host attestation schema version is unsupported.");
  for (const field of ["attestationId", "hostId", "toolExecutorId", "repositoryId"] as const) if (!validIdentifier(input[field])) errors.push(`Host attestation ${field} is invalid.`);
  if (!ATTESTATION_KINDS.has(String(input.kind))) errors.push("Host attestation kind is unsupported.");
  if (!validAbsoluteRoot(input.canonicalWritableRoot)) errors.push("Host attestation canonicalWritableRoot must be absolute.");
  if (input.capabilityId !== null && !validIdentifier(input.capabilityId)) errors.push("Host attestation capabilityId is invalid.");
  if (typeof input.observedValue !== "string" && typeof input.observedValue !== "boolean") errors.push("Host attestation observedValue is invalid.");
  if (!validTimestamp(input.observedAt) || !validTimestamp(input.expiresAt) || Date.parse(String(input.expiresAt)) < Date.parse(String(input.observedAt))) errors.push("Host attestation freshness interval is invalid.");
  if (input.kind === "capability" && input.capabilityId === null) errors.push("Capability attestation requires capabilityId.");
  if (input.kind !== "capability" && input.capabilityId !== null) errors.push("Non-capability attestation must not claim capabilityId.");
  return errors.length > 0 ? { state: "invalid", code: "attestation_malformed", errors } : { state: "valid", value: input as unknown as HostPermissionAttestation };
}

export function validatePermissionInvocationContext(input: unknown): { state: "valid"; value: PermissionInvocationContext } | { state: "invalid"; code: string; errors: string[] } {
  const errors = exactFields(input, CONTEXT_FIELDS, "Permission context");
  if (errors.length > 0 || !isPlainObject(input)) return { state: "invalid", code: "permission_context_malformed", errors };
  if (input.permissionContractVersion !== 1) errors.push("Permission contract version is unsupported.");
  if (input.journalSchemaVersion !== 6) errors.push("Permission context requires authoritative journal v6.");
  for (const field of ["missionId", "subjectId"] as const) if (!validIdentifier(input[field])) errors.push(`Permission context ${field} is invalid.`);
  for (const field of ["missionRevisionId", "artifactRevisionId"] as const) if (!REVISION.test(String(input[field] ?? ""))) errors.push(`Permission context ${field} is invalid.`);
  if (!Number.isSafeInteger(input.evaluatedThroughSequence) || (input.evaluatedThroughSequence as number) < 0) errors.push("Permission context evaluatedThroughSequence is invalid.");
  for (const field of ["reasoningRuntimeId", "toolExecutorId", "repositoryId", "branch", "decisionId"] as const) if (!validIdentifier(input[field])) errors.push(`Permission context ${field} is invalid.`);
  if (!validAbsoluteRoot(input.canonicalWritableRoot)) errors.push("Permission context canonicalWritableRoot must be absolute.");
  if (!validTimestamp(input.evaluatedAt)) errors.push("Permission context evaluatedAt is invalid.");
  errors.push(...stringSetErrors(input.requiredCapabilities, "Permission context requiredCapabilities", true));
  if (!Array.isArray(input.activeBindings) || Object.getPrototypeOf(input.activeBindings) !== Array.prototype) errors.push("Permission context activeBindings must be a plain array.");
  else input.activeBindings.forEach((binding, index) => {
    const checked = validateRuntimeBinding(binding);
    if (checked.state === "invalid") errors.push(...checked.errors.map((error) => `activeBindings[${index}]: ${error}`));
    else if (checked.value.lifecycleState !== "active") errors.push(`activeBindings[${index}] is not active.`);
  });
  if (!Array.isArray(input.attestations) || Object.getPrototypeOf(input.attestations) !== Array.prototype) errors.push("Permission context attestations must be a plain array.");
  else {
    const attestationIds = new Set<string>();
    input.attestations.forEach((attestation, index) => {
      const checked = validateHostPermissionAttestation(attestation);
      if (checked.state === "invalid") errors.push(...checked.errors.map((error) => `attestations[${index}]: ${error}`));
      else if (attestationIds.has(checked.value.attestationId)) errors.push(`attestations duplicates ${checked.value.attestationId}.`);
      else attestationIds.add(checked.value.attestationId);
    });
  }
  return errors.length > 0 ? { state: "invalid", code: "permission_context_malformed", errors } : { state: "valid", value: input as unknown as PermissionInvocationContext };
}

export function validatePermissionAuthorizationArtifactPayload(input: unknown):
  { state: "valid"; value: PermissionAuthorizationArtifactPayload } |
  { state: "invalid"; code: string; errors: string[] } {
  const errors = exactFields(input, ARTIFACT_PAYLOAD_FIELDS, "Permission authorization artifact payload");
  if (errors.length > 0 || !isPlainObject(input)) return { state: "invalid", code: "permission_artifact_malformed", errors };
  if (input.permissionContractVersion !== 1) errors.push("Permission artifact contract version is unsupported.");
  for (const field of ["decisionId", "reasonCode", "seatId", "reasoningRuntimeId", "toolExecutorId", "bindingId", "repositoryId", "branch"] as const) {
    if (!validIdentifier(input[field])) errors.push(`Permission artifact ${field} is invalid.`);
  }
  if (!PERMISSION_REASONS.includes(input.reasonCode as PermissionReason)) errors.push("Permission artifact reasonCode is unsupported.");
  if (!Number.isSafeInteger(input.bindingVersion) || (input.bindingVersion as number) < 1) errors.push("Permission artifact bindingVersion is invalid.");
  if (!Number.isSafeInteger(input.journalSequence) || (input.journalSequence as number) < 0) errors.push("Permission artifact journalSequence is invalid.");
  if (!validAbsoluteRoot(input.canonicalWritableRoot)) errors.push("Permission artifact canonicalWritableRoot must be absolute.");
  for (const field of ["missionRevisionId", "artifactRevisionId"] as const) {
    if (!REVISION.test(String(input[field] ?? ""))) errors.push(`Permission artifact ${field} is invalid.`);
  }
  const scopeErrors = exactFields(input.approvedScope, SCOPE_FIELDS, "Permission artifact approvedScope");
  errors.push(...scopeErrors);
  if (scopeErrors.length === 0 && isPlainObject(input.approvedScope)) {
    errors.push(...stringSetErrors(input.approvedScope.actionIds, "Permission artifact actionIds", false));
    errors.push(...stringSetErrors(input.approvedScope.effectClasses, "Permission artifact effectClasses", false));
    errors.push(...stringSetErrors(input.approvedScope.effectKeys, "Permission artifact effectKeys", false));
    errors.push(...stringSetErrors(input.approvedScope.capabilities, "Permission artifact capabilities", true));
    if (Array.isArray(input.approvedScope.effectClasses) && input.approvedScope.effectClasses.some((value) => !EFFECT_CLASSES.has(String(value)))) errors.push("Permission artifact effectClasses are invalid.");
  }
  errors.push(...stringSetErrors(input.attestationIds, "Permission artifact attestationIds", false));
  return errors.length > 0
    ? { state: "invalid", code: "permission_artifact_malformed", errors }
    : { state: "valid", value: input as unknown as PermissionAuthorizationArtifactPayload };
}

function deny(reasonCode: PermissionReason, binding: RuntimeBinding | null = null, attestationIds: string[] = []): PermissionEvaluation {
  return { outcome: "deny", reasonCode, binding, attestationIds };
}

export function evaluatePermission(plan: RunnerCyclePlan, contextInput: unknown): PermissionEvaluation {
  const checked = validatePermissionInvocationContext(contextInput);
  if (checked.state === "invalid") return deny(checked.errors.some((error) => error.includes("attestation")) ? "attestation_mismatch" : "binding_missing");
  const context = checked.value;
  if (context.missionId !== plan.missionId || context.subjectId !== plan.subjectId || context.missionRevisionId !== plan.revisionId) return deny("revision_mismatch");
  if (context.evaluatedThroughSequence !== plan.evaluatedThroughSequence) return deny("journal_sequence_mismatch");
  const matches = context.activeBindings.filter((candidate) => candidate.missionId === plan.missionId && candidate.subjectId === plan.subjectId && candidate.seatId === plan.seatId);
  if (matches.length === 0) return deny("binding_missing");
  if (matches.length !== 1) return deny("binding_ambiguous");
  const binding = matches[0];
  if (binding.lifecycleState !== "active") return deny("binding_inactive", binding);
  if (binding.recordedAtSequence > plan.evaluatedThroughSequence || (binding.activeThroughSequence !== null && binding.activeThroughSequence < plan.evaluatedThroughSequence)) return deny("binding_stale", binding);
  if (binding.missionId !== plan.missionId || binding.subjectId !== plan.subjectId || binding.seatId !== plan.seatId) return deny("seat_mismatch", binding);
  if (binding.reasoningRuntimeId !== context.reasoningRuntimeId) return deny("reasoning_runtime_mismatch", binding);
  if (binding.toolExecutorId !== context.toolExecutorId) return deny("tool_executor_mismatch", binding);
  if (binding.repositoryId !== context.repositoryId) return deny("repository_mismatch", binding);
  if (binding.canonicalWritableRoot !== context.canonicalWritableRoot) return deny("root_mismatch", binding);
  if (binding.branch !== context.branch) return deny("branch_mismatch", binding);
  if (binding.missionRevisionId !== context.missionRevisionId || binding.artifactRevisionId !== context.artifactRevisionId) return deny("revision_mismatch", binding);
  if (plan.evaluatedThroughSequence < binding.recordedAtSequence) return deny("journal_sequence_mismatch", binding);
  if (!binding.approvedScope.actionIds.includes(plan.actionId)) return deny("action_out_of_scope", binding);
  if (!binding.approvedScope.effectClasses.includes(plan.effectClass)) return deny("effect_class_out_of_scope", binding);
  if (!binding.approvedScope.effectKeys.includes(plan.effectKey)) return deny("effect_key_out_of_scope", binding);
  if (context.requiredCapabilities.some((capability) => !binding.approvedScope.capabilities.includes(capability))) return deny("capability_out_of_scope", binding);

  const now = Date.parse(context.evaluatedAt);
  const roots = context.attestations.filter(({ kind }) => kind === "repository_root");
  const writability = context.attestations.filter(({ kind }) => kind === "writability");
  const capabilities = context.requiredCapabilities.map((capability) => context.attestations.filter((attestation) =>
    attestation.kind === "capability" && attestation.capabilityId === capability));
  if (roots.length === 0 || writability.length === 0 || capabilities.some((items) => items.length === 0)) return deny("attestation_missing", binding);
  const expectedCount = 2 + context.requiredCapabilities.length;
  if (roots.length !== 1 || writability.length !== 1 || capabilities.some((items) => items.length !== 1) ||
      context.attestations.length !== expectedCount) return deny("attestation_mismatch", binding);
  const selected = [roots[0], writability[0], ...capabilities.map(([item]) => item)];
  const hostIds = new Set(selected.map(({ hostId }) => hostId));
  if (hostIds.size !== 1 || selected.some((attestation) =>
    attestation.toolExecutorId !== context.toolExecutorId || attestation.repositoryId !== context.repositoryId ||
    attestation.canonicalWritableRoot !== context.canonicalWritableRoot)) return deny("attestation_mismatch", binding);
  if (selected.some((attestation) => Date.parse(attestation.observedAt) > now || now > Date.parse(attestation.expiresAt))) {
    return deny("attestation_stale", binding);
  }
  const root = roots[0];
  const writable = writability[0];
  if (root.observedValue !== context.canonicalWritableRoot || writable.observedValue !== true ||
      capabilities.some(([item]) => item.observedValue !== true)) return deny("attestation_mismatch", binding);
  return {
    outcome: "allow",
    reasonCode: "permission_allowed",
    binding,
    attestationIds: selected.map(({ attestationId }) => attestationId).sort(),
  };
}

function auditIdentity(plan: RunnerCyclePlan, context: PermissionInvocationContext, binding: RuntimeBinding) {
  return {
    missionId: plan.missionId, subjectId: plan.subjectId, seatId: plan.seatId,
    reasoningRuntimeId: context.reasoningRuntimeId, toolExecutorId: context.toolExecutorId,
    bindingId: binding.bindingId, bindingVersion: binding.bindingVersion,
    repositoryId: context.repositoryId, canonicalWritableRoot: context.canonicalWritableRoot,
    branch: context.branch, missionRevisionId: plan.revisionId, artifactRevisionId: context.artifactRevisionId,
    journalSequence: plan.evaluatedThroughSequence,
    cycleId: plan.cycleId, actionId: plan.actionId, effectClass: plan.effectClass, effectKey: plan.effectKey,
  };
}

export function createPermissionAuthorizer(dependencies: PermissionAuthorizerDependencies): (plan: RunnerCyclePlan) => Promise<RunnerPermissionDecision> {
  return async (plan) => {
    const rawContext = await dependencies.getContext(plan);
    const checked = validatePermissionInvocationContext(rawContext);
    if (checked.state === "invalid") throw new Error("permission_context_malformed");
    const context = checked.value;
    const evaluation = evaluatePermission(plan, context);
    const binding = evaluation.binding;
    if (binding === null) throw new Error(evaluation.reasonCode);
    const artifact = {
      artifactSchemaVersion: 1 as const,
      artifactId: `permission-artifact:${context.decisionId}`,
      contentType: "application/json" as const,
      payload: {
        permissionContractVersion: 1,
        decisionId: context.decisionId,
        reasonCode: evaluation.reasonCode,
        seatId: plan.seatId,
        reasoningRuntimeId: context.reasoningRuntimeId,
        toolExecutorId: context.toolExecutorId,
        bindingId: binding.bindingId,
        bindingVersion: binding.bindingVersion,
        repositoryId: context.repositoryId,
        canonicalWritableRoot: context.canonicalWritableRoot,
        branch: context.branch,
        missionRevisionId: plan.revisionId,
        artifactRevisionId: context.artifactRevisionId,
        journalSequence: plan.evaluatedThroughSequence,
        approvedScope: {
          actionIds: [...binding.approvedScope.actionIds],
          effectClasses: [...binding.approvedScope.effectClasses],
          effectKeys: [...binding.approvedScope.effectKeys],
          capabilities: [...binding.approvedScope.capabilities],
        },
        attestationIds: evaluation.attestationIds,
      },
    };
    const decision: RunnerPermissionDecision = {
      runnerContractVersion: 1, decisionId: context.decisionId, outcome: evaluation.outcome,
      missionId: plan.missionId, subjectId: plan.subjectId, revisionId: plan.revisionId,
      evaluatedThroughSequence: plan.evaluatedThroughSequence, cycleId: plan.cycleId,
      seatId: plan.seatId, actionId: plan.actionId, effectClass: plan.effectClass,
      effectKey: plan.effectKey, reasonCode: evaluation.reasonCode, authorizationArtifact: artifact,
    };
    const record: PermissionAuditRecord = {
      schemaVersion: 1, authority: "non_authoritative", recordType: "permission.decision",
      recordId: `audit:${context.decisionId}`, ...auditIdentity(plan, context, binding),
      decisionId: context.decisionId, decision: evaluation.outcome, reasonCode: evaluation.reasonCode,
      observedAt: context.evaluatedAt,
    };
    const validated = validatePermissionAuditRecord(record);
    if (validated.state === "invalid") throw new Error("audit_record_malformed");
    const receipt = await dependencies.appendAuditIfAbsent(validated.value);
    const checkedReceipt = validatePermissionAuditAppendReceipt(receipt, validated.value);
    if (checkedReceipt.state === "invalid") throw new Error("audit_receipt_mismatch");
    return decision;
  };
}

export function createToolResultAuditRecord(input: ToolResultAuditInput): PermissionAuditRecord {
  const checkedDecision = validateRunnerPermissionDecision(input.decision);
  if (checkedDecision.state === "invalid") throw new Error("permission_decision_malformed");
  const checkedArtifact = validatePermissionAuthorizationArtifactPayload(input.decision.authorizationArtifact.payload);
  if (checkedArtifact.state === "invalid") throw new Error("permission_artifact_malformed");
  const artifact = checkedArtifact.value;
  const bindings = input.context.activeBindings.filter((candidate) =>
    candidate.bindingId === artifact.bindingId && candidate.bindingVersion === artifact.bindingVersion);
  if (bindings.length !== 1) throw new Error("binding_missing");
  const binding = bindings[0];
  const evaluation = evaluatePermission(input.plan, input.context);
  if (evaluation.outcome !== "allow" || evaluation.binding?.bindingId !== binding.bindingId ||
      input.decision.outcome !== "allow" || input.decision.decisionId !== input.context.decisionId ||
      artifact.decisionId !== input.decision.decisionId || artifact.reasonCode !== input.decision.reasonCode ||
      artifact.seatId !== input.plan.seatId || artifact.reasoningRuntimeId !== input.context.reasoningRuntimeId ||
      artifact.toolExecutorId !== input.context.toolExecutorId || artifact.repositoryId !== input.context.repositoryId ||
      artifact.canonicalWritableRoot !== input.context.canonicalWritableRoot || artifact.branch !== input.context.branch ||
      artifact.missionRevisionId !== input.plan.revisionId || artifact.artifactRevisionId !== input.context.artifactRevisionId ||
      artifact.journalSequence !== input.plan.evaluatedThroughSequence ||
      JSON.stringify(artifact.approvedScope) !== JSON.stringify(binding.approvedScope) ||
      JSON.stringify(artifact.attestationIds) !== JSON.stringify(evaluation.attestationIds)) {
    throw new Error("permission_decision_stale");
  }
  const record: PermissionAuditRecord = {
    schemaVersion: 1, authority: "non_authoritative", recordType: "tool.result", recordId: input.recordId,
    ...auditIdentity(input.plan, input.context, binding), decisionId: input.decision.decisionId,
    outcome: input.outcome, reasonCode: input.reasonCode, observedAt: input.observedAt,
  };
  const checked = validatePermissionAuditRecord(record);
  if (checked.state === "invalid") throw new Error("audit_record_malformed");
  return checked.value;
}

export function createAuditedExecutor(dependencies: AuditedExecutorDependencies) {
  return async (plan: RunnerCyclePlan, decision: RunnerPermissionDecision): Promise<unknown> => {
    const context = await dependencies.getContext(decision);
    try {
      createToolResultAuditRecord({
        plan,
        context,
        decision,
        outcome: "uncertain",
        reasonCode: "permission_preflight",
        observedAt: context.evaluatedAt,
        recordId: `audit-preflight:${decision.decisionId}`,
      });
    } catch {
      return {
        runnerContractVersion: 1,
        outcome: "failed",
        missionId: plan.missionId,
        subjectId: plan.subjectId,
        revisionId: plan.revisionId,
        evaluatedThroughSequence: plan.evaluatedThroughSequence,
        cycleId: plan.cycleId,
        seatId: plan.seatId,
        actionId: plan.actionId,
        effectClass: plan.effectClass,
        effectKey: plan.effectKey,
        summary: "Permission context changed after authorization; tool invocation was not attempted.",
        evidenceRefs: [plan.cycleId],
      } satisfies RunnerExecutorResult;
    }
    let raw: unknown;
    let forcedOutcome: "failed" | null = null;
    try { raw = await dependencies.execute(plan, decision); }
    catch { forcedOutcome = "failed"; raw = null; }
    const checked = validateRunnerExecutorResult(raw);
    const result: RunnerExecutorResult = checked.state === "valid" ? checked.value : {
      runnerContractVersion: 1,
      outcome: "uncertain",
      missionId: plan.missionId,
      subjectId: plan.subjectId,
      revisionId: plan.revisionId,
      evaluatedThroughSequence: plan.evaluatedThroughSequence,
      cycleId: plan.cycleId,
      seatId: plan.seatId,
      actionId: plan.actionId,
      effectClass: plan.effectClass,
      effectKey: plan.effectKey,
      summary: forcedOutcome === "failed" ? "Executor threw; effect outcome is uncertain." : "Executor returned malformed evidence; effect outcome is uncertain.",
      evidenceRefs: [plan.cycleId],
    };
    const record = createToolResultAuditRecord({
      plan, context, decision,
      outcome: checked.state === "valid" ? checked.value.outcome : "uncertain",
      reasonCode: checked.state === "valid" ? `executor_${checked.value.outcome}` : "executor_uncertain",
      observedAt: dependencies.now(), recordId: dependencies.nextRecordId(decision),
    });
    try {
      const receipt = await dependencies.appendAuditIfAbsent(record);
      const verified = validatePermissionAuditAppendReceipt(receipt, record);
      if (verified.state === "invalid") throw new Error("audit_receipt_mismatch");
    } catch {
      return {
        ...result,
        outcome: "uncertain",
        summary: "Tool result audit append was not durably verified; effect outcome is uncertain.",
        evidenceRefs: [...new Set([plan.cycleId, ...result.evidenceRefs])].slice(0, 16),
      } satisfies RunnerExecutorResult;
    }
    return result;
  };
}
