import { posix } from "node:path";
import { isProxy } from "node:util/types";

export const LEGACY_CONFIG_SCHEMA_VERSION = 1 as const;
export const CONFIG_SCHEMA_V2_VERSION = 2 as const;
export const CONFIG_SCHEMA_VERSION = 3 as const;
export const SUPPORTED_CONFIG_SCHEMA_VERSIONS = Object.freeze([
  LEGACY_CONFIG_SCHEMA_VERSION,
  CONFIG_SCHEMA_V2_VERSION,
  CONFIG_SCHEMA_VERSION,
] as const);
export const LEGACY_DOCTOR_REPORT_VERSION = 1 as const;
export const DOCTOR_REPORT_VERSION = 2 as const;
export const SHIELD_PACKAGE_VERSION = "0.1.0" as const;
export const SUPPORTED_ADAPTER_IDS = Object.freeze(["github"] as const);
export const CONFIGURED_HOST_ADAPTER_IDS = Object.freeze(["github", "atlassian"] as const);
export const SUPPORTED_SEAT_IDS = [
  "hill",
  "daisy",
  "fury",
  "may",
  "coulson",
  "fitz",
  "simmons",
] as const;
export const SUPPORTED_MODE_IDS = ["delivery", "debugger"] as const;
export const HUMAN_AUTHORITY_SEAT_IDS = ["coulson", "fitz", "simmons"] as const;
export const REPOSITORY_TRUST_PROFILE_CONTRACT_VERSION = "repository.trust-profile.v1" as const;
export const REPOSITORY_TRUST_PROFILE_IDS = Object.freeze([
  "signed_human_gates",
  "coulson_only_platform_review",
] as const);

export type AdapterId = (typeof SUPPORTED_ADAPTER_IDS)[number];
export type ConfiguredHostAdapterId = (typeof CONFIGURED_HOST_ADAPTER_IDS)[number];
export type SeatId = (typeof SUPPORTED_SEAT_IDS)[number];
export type ModeId = (typeof SUPPORTED_MODE_IDS)[number];
export type HumanAuthoritySeatId = (typeof HUMAN_AUTHORITY_SEAT_IDS)[number];
export type RepositoryTrustProfileId = (typeof REPOSITORY_TRUST_PROFILE_IDS)[number];
export type ShieldPathKind = "journals" | "artifacts" | "reports" | "temp";

export interface RepositoryTrustProfileV1 {
  readonly contractVersion: "repository.trust-profile.v1";
  readonly profileId: RepositoryTrustProfileId;
  readonly requiredShieldSigningSeatIds: readonly HumanAuthoritySeatId[];
  readonly optionalShieldSigningSeatIds: readonly HumanAuthoritySeatId[];
  readonly fitzSource: "shield_ed25519_binding" | "github_required_review_external";
  readonly simmonsSource: "conditional_shield_ed25519_binding" | "conditional_external_feedback";
  readonly externalEvidenceAdmission: "not_admitted";
}

export const REPOSITORY_TRUST_PROFILES_V1: readonly RepositoryTrustProfileV1[] = Object.freeze([
  Object.freeze({
    contractVersion: REPOSITORY_TRUST_PROFILE_CONTRACT_VERSION,
    profileId: "signed_human_gates",
    requiredShieldSigningSeatIds: Object.freeze(["coulson", "fitz"] as const),
    optionalShieldSigningSeatIds: Object.freeze(["simmons"] as const),
    fitzSource: "shield_ed25519_binding",
    simmonsSource: "conditional_shield_ed25519_binding",
    externalEvidenceAdmission: "not_admitted",
  }),
  Object.freeze({
    contractVersion: REPOSITORY_TRUST_PROFILE_CONTRACT_VERSION,
    profileId: "coulson_only_platform_review",
    requiredShieldSigningSeatIds: Object.freeze(["coulson"] as const),
    optionalShieldSigningSeatIds: Object.freeze([] as const),
    fitzSource: "github_required_review_external",
    simmonsSource: "conditional_external_feedback",
    externalEvidenceAdmission: "not_admitted",
  }),
]);

export interface TrustedHumanBindingRef {
  seatId: HumanAuthoritySeatId;
  bindingRef: string;
}

export type ShieldPaths = Readonly<Record<ShieldPathKind, string>>;

interface ShieldConfigCommon {
  repositoryId: string;
  supportedSeatIds: SeatId[];
  supportedModeIds: ModeId[];
  trustedHumanBindingRefs: TrustedHumanBindingRef[];
  paths: ShieldPaths;
}

export interface ShieldConfigV1 extends ShieldConfigCommon {
  schemaVersion: 1;
  adapterId: AdapterId;
}

export interface ShieldConfigV2 extends ShieldConfigCommon {
  schemaVersion: 2;
  adapterId: AdapterId;
  repositoryTrustProfileId: RepositoryTrustProfileId;
}

export interface ShieldConfigV3 extends ShieldConfigCommon {
  schemaVersion: 3;
  adapterIds: ConfiguredHostAdapterId[];
  repositoryTrustProfileId: RepositoryTrustProfileId;
}

export type ShieldConfig = ShieldConfigV1 | ShieldConfigV2 | ShieldConfigV3;

export interface ConfigIssue {
  code: string;
  path: string;
  message: string;
}

export type ConfigValidationResult =
  | { state: "valid"; value: ShieldConfig }
  | { state: "invalid"; issues: ConfigIssue[] };

export interface CreateShieldConfigInput {
  repositoryId: string;
  adapterIds?: readonly ConfiguredHostAdapterId[];
  coulsonBindingRef: string;
  repositoryTrustProfileId?: RepositoryTrustProfileId;
  fitzBindingRef?: string;
  simmonsBindingRef?: string;
}

export type DoctorCheckId =
  | "repository-root"
  | "package-version"
  | "config-present"
  | "config-schema"
  | "adapter"
  | "seats"
  | "modes"
  | "bindings"
  | "paths";

export interface DoctorCheck {
  id: DoctorCheckId;
  ok: boolean;
  message: string;
}

export interface DoctorInput {
  repositoryRootReady: boolean;
  repositoryRootIssue?: string;
  packageVersion: string | null;
  configPresent: boolean;
  config?: unknown;
  worktreeState?: DoctorWorktreeState;
}

export type DoctorWorktreeStateClassification =
  | "uninitialized_worktree"
  | "manual_policy_present"
  | "prepared_worktree"
  | "stale_or_malformed_worktree_state";

export interface DoctorWorktreeState {
  classification: DoctorWorktreeStateClassification;
  ok: boolean;
  message: string;
  receiptDigest: string | null;
}

export interface DoctorReport {
  reportVersion: 1;
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorAdapterCheckV2 {
  id: "adapter";
  ok: boolean;
  message: string;
  adapterId: ConfiguredHostAdapterId | null;
}

export type DoctorNonAdapterCheckIdV2 = Exclude<DoctorCheckId, "adapter">;
export interface DoctorNonAdapterCheckV2 {
  id: DoctorNonAdapterCheckIdV2;
  ok: boolean;
  message: string;
}
export type DoctorCheckV2 = DoctorNonAdapterCheckV2 | DoctorAdapterCheckV2;

export interface DoctorReportV2 {
  reportVersion: 2;
  ok: boolean;
  checks: DoctorCheckV2[];
  worktreeState: DoctorWorktreeState;
}

export const COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION = "shield.copilot-fury-dispatch-capability.v1" as const;
export const COPILOT_FURY_DISPATCH_CAPABILITY_REASON_CODES = Object.freeze([
  "invalid_input",
  "repository_unavailable",
  "expected_head_mismatch",
  "workspace_dirty",
  "fury_card_unavailable",
  "fury_card_shadowed",
  "dispatch_receipt_path_unsafe",
  "copilot_sdk_unavailable",
  "copilot_sdk_version_mismatch",
  "copilot_sdk_exports_invalid",
  "copilot_stdio_projection_unsafe",
  "repository_drift",
  "ready",
] as const);
export type CopilotFuryDispatchCapabilityReasonV1 = (typeof COPILOT_FURY_DISPATCH_CAPABILITY_REASON_CODES)[number];

export const COPILOT_FURY_DISPATCH_CAPABILITY_NEXT_ACTIONS = Object.freeze({
  invalid_input: "Supply one canonical absolute repository root and the exact expected 40-character lowercase Git HEAD.",
  repository_unavailable: "Restore an accessible canonical Git worktree and rerun the capability probe.",
  expected_head_mismatch: "Check out the exact expected revision and rerun the capability probe.",
  workspace_dirty: "Restore a clean worktree at the expected revision and rerun the capability probe.",
  fury_card_unavailable: "Restore the exact-HEAD repository Fury agent card and rerun the capability probe.",
  fury_card_shadowed: "Remove the ambient same-name user Fury card and rerun with repository-default card precedence.",
  dispatch_receipt_path_unsafe: "Repair the canonical .shield dispatch-receipt path and permissions, then rerun the capability probe.",
  copilot_sdk_unavailable: "Install the pinned @github/copilot-sdk dependency and rerun the capability probe.",
  copilot_sdk_version_mismatch: "Install @github/copilot-sdk 1.0.11 and rerun the capability probe.",
  copilot_sdk_exports_invalid: "Restore the required CopilotClient and RuntimeConnection.forStdio exports and rerun the capability probe.",
  copilot_stdio_projection_unsafe: "Restore the closed stdio runtime projection and rerun the capability probe.",
  repository_drift: "Restore one stable clean repository/card state and rerun the capability probe.",
  ready: "No machine action is required for this capability.",
} satisfies Record<CopilotFuryDispatchCapabilityReasonV1, string>);

export interface CopilotFuryResolvedCardIdentityV1 {
  readonly sourceKind: "repository" | "explicit_user_override";
  readonly logicalRef: string;
  readonly contentDigest: string;
  readonly repositoryRevision: string | null;
  readonly precedenceObservations: readonly Readonly<{
    sourceKind: "repository" | "user";
    logicalRef: string;
    disposition: "selected" | "absent" | "shadowing_rejected" | "not_selected_explicit_override";
    contentDigest: string | null;
  }>[];
}

export interface CopilotFuryDispatchCapabilityReportV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION;
  readonly authority: "none";
  readonly disposition: "ready" | "unavailable";
  readonly reasonCode: CopilotFuryDispatchCapabilityReasonV1;
  readonly nextAction: string;
  readonly repository: {
    readonly before: { readonly root: string; readonly branch: string | null; readonly head: string | null; readonly clean: boolean | null };
    readonly after: { readonly root: string; readonly branch: string | null; readonly head: string | null; readonly clean: boolean | null };
  };
  readonly package: { readonly name: "@github/copilot-sdk"; readonly version: string | null };
  readonly target: { readonly runtimeId: "github-copilot-sdk:1.0.11"; readonly executorId: "copilot-agent" };
  readonly card: CopilotFuryResolvedCardIdentityV1 | null;
  readonly dispatchReceipt: {
    readonly logicalPath: ".shield/dispatch-receipts.jsonl";
    readonly lockLogicalPath: ".shield/dispatch-receipts.jsonl.lock";
    readonly safety: "safe" | "unsafe";
  };
}

export interface CopilotDoctorReportV1 {
  readonly reportVersion: 1;
  readonly contractVersion: "shield.doctor.host-selected.v1";
  readonly authority: "none";
  readonly host: "github-copilot";
  readonly ok: boolean;
  readonly doctor: DoctorReportV2;
  readonly hostCapability: CopilotFuryDispatchCapabilityReportV1;
}

const CAPABILITY_REPORT_FIELDS = [
  "schemaVersion", "contractVersion", "authority", "disposition", "reasonCode", "nextAction",
  "repository", "package", "target", "card", "dispatchReceipt",
] as const;
const CAPABILITY_REPOSITORY_FIELDS = ["before", "after"] as const;
const CAPABILITY_REPOSITORY_OBSERVATION_FIELDS = ["root", "branch", "head", "clean"] as const;
const CAPABILITY_PACKAGE_FIELDS = ["name", "version"] as const;
const CAPABILITY_TARGET_FIELDS = ["runtimeId", "executorId"] as const;
const CAPABILITY_CARD_FIELDS = ["sourceKind", "logicalRef", "contentDigest", "repositoryRevision", "precedenceObservations"] as const;
const CAPABILITY_PRECEDENCE_FIELDS = ["sourceKind", "logicalRef", "disposition", "contentDigest"] as const;
const CAPABILITY_RECEIPT_FIELDS = ["logicalPath", "lockLogicalPath", "safety"] as const;
const CAPABILITY_GIT_REVISION = /^[0-9a-f]{40}$/u;
const CAPABILITY_SHA256 = /^[0-9a-f]{64}$/u;

function capabilityDataObject(value: unknown, fields: readonly string[]): Record<string, unknown> | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return null;
    const projection: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined) return null;
      projection[field] = descriptor.value;
    }
    return projection;
  } catch { return null; }
}

function capabilityArray(value: unknown, length: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || isProxy(value) || value.length !== length) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || keys.at(-1) !== "length") return null;
    const projected: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      if (keys[index] !== String(index)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined) return null;
      projected.push(descriptor.value);
    }
    return projected;
  } catch { return null; }
}

function capabilityRepositoryObservation(value: unknown): CopilotFuryDispatchCapabilityReportV1["repository"]["before"] | null {
  const observed = capabilityDataObject(value, CAPABILITY_REPOSITORY_OBSERVATION_FIELDS);
  if (observed === null || typeof observed.root !== "string" ||
      !(observed.branch === null || typeof observed.branch === "string") ||
      !(observed.head === null || typeof observed.head === "string" && CAPABILITY_GIT_REVISION.test(observed.head)) ||
      !(observed.clean === null || typeof observed.clean === "boolean")) return null;
  return Object.freeze({ root: observed.root, branch: observed.branch, head: observed.head, clean: observed.clean });
}

function capabilityCard(value: unknown): CopilotFuryResolvedCardIdentityV1 | null {
  const card = capabilityDataObject(value, CAPABILITY_CARD_FIELDS);
  if (card === null || (card.sourceKind !== "repository" && card.sourceKind !== "explicit_user_override") ||
      typeof card.logicalRef !== "string" || typeof card.contentDigest !== "string" || !CAPABILITY_SHA256.test(card.contentDigest) ||
      !(card.repositoryRevision === null || typeof card.repositoryRevision === "string" && CAPABILITY_GIT_REVISION.test(card.repositoryRevision))) return null;
  const observations = capabilityArray(card.precedenceObservations, 2);
  if (observations === null) return null;
  const projected = observations.map((entry) => capabilityDataObject(entry, CAPABILITY_PRECEDENCE_FIELDS));
  if (projected.some((entry) => entry === null)) return null;
  const repository = projected[0] as Record<string, unknown>;
  const user = projected[1] as Record<string, unknown>;
  const observationValid = (entry: Record<string, unknown>) =>
    (entry.sourceKind === "repository" || entry.sourceKind === "user") && typeof entry.logicalRef === "string" &&
    (entry.disposition === "selected" || entry.disposition === "absent" || entry.disposition === "shadowing_rejected" || entry.disposition === "not_selected_explicit_override") &&
    (entry.contentDigest === null || typeof entry.contentDigest === "string" && CAPABILITY_SHA256.test(entry.contentDigest));
  if (!observationValid(repository) || !observationValid(user) || repository.sourceKind !== "repository" ||
      repository.logicalRef !== ".github/agents/fury.agent.md" || user.sourceKind !== "user" || user.logicalRef !== "user://agents/fury.agent.md") return null;
  if (card.sourceKind === "repository") {
    if (card.logicalRef !== ".github/agents/fury.agent.md" || card.repositoryRevision === null || repository.disposition !== "selected" ||
        repository.contentDigest !== card.contentDigest || user.disposition !== "absent" || user.contentDigest !== null) return null;
  } else if (card.logicalRef !== "user://agents/fury.agent.md" || card.repositoryRevision !== null || user.disposition !== "selected" ||
      user.contentDigest !== card.contentDigest || !((repository.disposition === "absent" && repository.contentDigest === null) ||
      (repository.disposition === "not_selected_explicit_override" && typeof repository.contentDigest === "string"))) return null;
  return Object.freeze({
    sourceKind: card.sourceKind,
    logicalRef: card.logicalRef,
    contentDigest: card.contentDigest,
    repositoryRevision: card.repositoryRevision,
    precedenceObservations: Object.freeze(projected.map((entry) => Object.freeze({ ...(entry as Record<string, unknown>) }))) as CopilotFuryResolvedCardIdentityV1["precedenceObservations"],
  });
}

export function validateAndProjectCopilotFuryDispatchCapabilityReportV1(
  value: unknown,
): CopilotFuryDispatchCapabilityReportV1 {
  const report = capabilityDataObject(value, CAPABILITY_REPORT_FIELDS);
  const repository = report === null ? null : capabilityDataObject(report.repository, CAPABILITY_REPOSITORY_FIELDS);
  const before = repository === null ? null : capabilityRepositoryObservation(repository.before);
  const after = repository === null ? null : capabilityRepositoryObservation(repository.after);
  const packageObservation = report === null ? null : capabilityDataObject(report.package, CAPABILITY_PACKAGE_FIELDS);
  const target = report === null ? null : capabilityDataObject(report.target, CAPABILITY_TARGET_FIELDS);
  const receipt = report === null ? null : capabilityDataObject(report.dispatchReceipt, CAPABILITY_RECEIPT_FIELDS);
  const card = report?.card === null ? null : capabilityCard(report?.card);
  const reasonCode = report?.reasonCode;
  const validReason = typeof reasonCode === "string" && COPILOT_FURY_DISPATCH_CAPABILITY_REASON_CODES.includes(reasonCode as CopilotFuryDispatchCapabilityReasonV1);
  if (report === null || before === null || after === null || packageObservation === null || target === null || receipt === null ||
      report.schemaVersion !== 1 || report.contractVersion !== COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION || report.authority !== "none" ||
      (report.disposition !== "ready" && report.disposition !== "unavailable") || !validReason ||
      report.nextAction !== COPILOT_FURY_DISPATCH_CAPABILITY_NEXT_ACTIONS[reasonCode as CopilotFuryDispatchCapabilityReasonV1] ||
      (report.disposition === "ready") !== (reasonCode === "ready") ||
      packageObservation.name !== "@github/copilot-sdk" || !(packageObservation.version === null || typeof packageObservation.version === "string") ||
      target.runtimeId !== "github-copilot-sdk:1.0.11" || target.executorId !== "copilot-agent" ||
      receipt.logicalPath !== ".shield/dispatch-receipts.jsonl" || receipt.lockLogicalPath !== ".shield/dispatch-receipts.jsonl.lock" ||
      (receipt.safety !== "safe" && receipt.safety !== "unsafe") || (report.card !== null && card === null) ||
      before.root !== after.root || (reasonCode !== "repository_drift" && before.head !== after.head) ||
      (card?.sourceKind === "repository" && (before.head === null || card.repositoryRevision !== before.head)) ||
      (reasonCode === "dispatch_receipt_path_unsafe" && receipt.safety !== "unsafe") ||
      (reasonCode === "ready" && (packageObservation.version !== "1.0.11" || card === null || receipt.safety !== "safe" ||
        before.root === "" || before.root !== after.root || before.branch !== after.branch || before.head === null || before.head !== after.head ||
        before.clean !== true || after.clean !== true))) {
    throw new Error("copilot_fury_dispatch_capability_report_invalid");
  }
  return Object.freeze({
    schemaVersion: 1,
    contractVersion: COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION,
    authority: "none",
    disposition: report.disposition,
    reasonCode: reasonCode as CopilotFuryDispatchCapabilityReasonV1,
    nextAction: report.nextAction as string,
    repository: Object.freeze({ before, after }),
    package: Object.freeze({ name: "@github/copilot-sdk", version: packageObservation.version as string | null }),
    target: Object.freeze({ runtimeId: "github-copilot-sdk:1.0.11", executorId: "copilot-agent" }),
    card,
    dispatchReceipt: Object.freeze({
      logicalPath: ".shield/dispatch-receipts.jsonl",
      lockLogicalPath: ".shield/dispatch-receipts.jsonl.lock",
      safety: receipt.safety as "safe" | "unsafe",
    }),
  });
}

export function composeCopilotDoctorReportV1(
  doctor: DoctorReportV2,
  hostCapability: unknown,
): CopilotDoctorReportV1 {
  const capability = validateAndProjectCopilotFuryDispatchCapabilityReportV1(hostCapability);
  return {
    reportVersion: 1,
    contractVersion: "shield.doctor.host-selected.v1",
    authority: "none",
    host: "github-copilot",
    ok: doctor.ok && capability.disposition === "ready",
    doctor,
    hostCapability: capability,
  };
}

const CONFIG_V1_FIELDS = [
  "schemaVersion",
  "repositoryId",
  "adapterId",
  "supportedSeatIds",
  "supportedModeIds",
  "trustedHumanBindingRefs",
  "paths",
] as const;
const CONFIG_V2_FIELDS = [
  ...CONFIG_V1_FIELDS,
  "repositoryTrustProfileId",
] as const;
const CONFIG_V3_FIELDS = [
  "schemaVersion",
  "repositoryId",
  "adapterIds",
  "supportedSeatIds",
  "supportedModeIds",
  "trustedHumanBindingRefs",
  "paths",
  "repositoryTrustProfileId",
] as const;
const PATH_FIELDS = ["journals", "artifacts", "reports", "temp"] as const;
const BINDING_FIELDS = ["seatId", "bindingRef"] as const;
const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const BINDING_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const CREDENTIAL_MARKER = /(?:password|token|secret|api[_-]?key)\s*[:=]|private[_-]?key/i;
const UNCONFIGURED_BINDING_MARKER = /(?:^|[._:/-])(?:placeholder|unconfigured|unset|todo|tbd)(?:$|[._:/-])/i;

function isSupportedConfigSchemaVersion(value: unknown): value is 1 | 2 | 3 {
  return value === LEGACY_CONFIG_SCHEMA_VERSION ||
    value === CONFIG_SCHEMA_V2_VERSION || value === CONFIG_SCHEMA_VERSION;
}

function isConfiguredHostAdapterId(value: unknown): value is ConfiguredHostAdapterId {
  return CONFIGURED_HOST_ADAPTER_IDS.includes(value as ConfiguredHostAdapterId);
}

function validateConfiguredHostAdapterIds(
  value: unknown,
  path: string,
  issues: ConfigIssue[],
): value is ConfiguredHostAdapterId[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(issue("invalid_array", path, `${path} must be a non-empty array.`));
    return false;
  }
  const seen = new Set<ConfiguredHostAdapterId>();
  let valid = true;
  let previousIndex = -1;
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const entryPath = `${path}[${index}]`;
    if (!isConfiguredHostAdapterId(entry)) {
      issues.push(issue("unsupported_adapter", entryPath, `${entryPath} is not a configured host adapter.`));
      valid = false;
      continue;
    }
    if (seen.has(entry)) {
      issues.push(issue("duplicate_value", entryPath, `${path} contains a duplicate adapter.`));
      valid = false;
    }
    const registryIndex = CONFIGURED_HOST_ADAPTER_IDS.indexOf(entry);
    if (registryIndex <= previousIndex) {
      issues.push(issue("invalid_order", path, `${path} must follow CONFIGURED_HOST_ADAPTER_IDS order.`));
      valid = false;
    }
    seen.add(entry);
    previousIndex = registryIndex;
  }
  return valid;
}

function isRepositoryTrustProfileId(value: unknown): value is RepositoryTrustProfileId {
  return value === "signed_human_gates" || value === "coulson_only_platform_review";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function issue(code: string, path: string, message: string): ConfigIssue {
  return { code, path, message };
}

function exactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  path: string,
  issues: ConfigIssue[],
  allowedFields: readonly string[] = fields,
): void {
  const allowed = new Set(allowedFields);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      issues.push(issue("missing_field", `${path}.${field}`, `${path} is missing field: ${field}.`));
    }
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      issues.push(issue("unknown_field", `${path}.${field}`, `${path} has unknown field: ${field}.`));
    }
  }
}

function validateKnownStringArray<T extends string>(
  value: unknown,
  supported: readonly T[],
  path: string,
  issues: ConfigIssue[],
): value is T[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(issue("invalid_array", path, `${path} must be a non-empty array.`));
    return false;
  }
  const seen = new Set<string>();
  let valid = true;
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const entryPath = `${path}[${index}]`;
    if (typeof entry !== "string" || !supported.includes(entry as T)) {
      issues.push(issue("unsupported_value", entryPath, `${entryPath} is unsupported.`));
      valid = false;
    } else if (seen.has(entry)) {
      issues.push(issue("duplicate_value", entryPath, `${path} duplicates ${entry}.`));
      valid = false;
    }
    if (typeof entry === "string") seen.add(entry);
  }
  for (const required of supported) {
    if (!seen.has(required)) {
      issues.push(issue("missing_supported_value", path, `${path} is missing required value: ${required}.`));
      valid = false;
    }
  }
  return valid;
}

function safeShieldPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return false;
  if (value.includes("\\") || value.includes("\0") || posix.isAbsolute(value)) return false;
  if (!value.startsWith(".shield/")) return false;
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return posix.normalize(value) === value;
}

function bindingRefIsSafe(value: unknown): value is string {
  return typeof value === "string" && BINDING_REF.test(value) &&
    !value.includes("://") && !CREDENTIAL_MARKER.test(value);
}

export function getRepositoryTrustProfileV1(profileId: RepositoryTrustProfileId): RepositoryTrustProfileV1 {
  const profile = REPOSITORY_TRUST_PROFILES_V1.find((candidate) => candidate.profileId === profileId);
  if (profile === undefined) throw new Error(`Unsupported repository trust profile: ${String(profileId)}.`);
  return profile;
}

export function repositoryTrustProfileId(config: ShieldConfig): RepositoryTrustProfileId {
  return config.schemaVersion === LEGACY_CONFIG_SCHEMA_VERSION
    ? "signed_human_gates"
    : config.repositoryTrustProfileId;
}

export function configuredAdapterIds(config: ShieldConfig): ConfiguredHostAdapterId[] {
  return config.schemaVersion === CONFIG_SCHEMA_VERSION
    ? [...config.adapterIds]
    : [config.adapterId];
}

export function validateShieldConfig(input: unknown): ConfigValidationResult {
  const issues: ConfigIssue[] = [];
  if (!isPlainObject(input)) {
    return { state: "invalid", issues: [issue("invalid_object", "config", "Config must be a plain object.")] };
  }
  const schemaVersion = input.schemaVersion;
  const fields = schemaVersion === CONFIG_SCHEMA_VERSION
    ? CONFIG_V3_FIELDS
    : schemaVersion === CONFIG_SCHEMA_V2_VERSION ? CONFIG_V2_FIELDS : CONFIG_V1_FIELDS;
  exactFields(
    input,
    fields,
    "config",
    issues,
    isSupportedConfigSchemaVersion(schemaVersion) ? fields : CONFIG_V3_FIELDS,
  );

  if (!isSupportedConfigSchemaVersion(schemaVersion)) {
    issues.push(issue(
      "unsupported_schema_version",
      "config.schemaVersion",
      `Config schemaVersion must be one of: ${SUPPORTED_CONFIG_SCHEMA_VERSIONS.join(", ")}.`,
    ));
  }
  if (typeof input.repositoryId !== "string" || !REPOSITORY_ID.test(input.repositoryId)) {
    issues.push(issue(
      "invalid_repository_id",
      "config.repositoryId",
      "repositoryId must use the form owner/name.",
    ));
  }
  if (schemaVersion === CONFIG_SCHEMA_VERSION) {
    validateConfiguredHostAdapterIds(input.adapterIds, "config.adapterIds", issues);
  } else if (!SUPPORTED_ADAPTER_IDS.includes(input.adapterId as AdapterId)) {
    issues.push(issue("unsupported_adapter", "config.adapterId", "adapterId must be github for schema 1 and 2."));
  }
  validateKnownStringArray(input.supportedSeatIds, SUPPORTED_SEAT_IDS, "config.supportedSeatIds", issues);
  validateKnownStringArray(input.supportedModeIds, SUPPORTED_MODE_IDS, "config.supportedModeIds", issues);

  let profileId: RepositoryTrustProfileId | undefined;
  if (schemaVersion === LEGACY_CONFIG_SCHEMA_VERSION) {
    profileId = "signed_human_gates";
  } else if (schemaVersion === CONFIG_SCHEMA_V2_VERSION || schemaVersion === CONFIG_SCHEMA_VERSION) {
    if (!isRepositoryTrustProfileId(input.repositoryTrustProfileId)) {
      issues.push(issue(
        "unsupported_repository_trust_profile",
        "config.repositoryTrustProfileId",
        "config.repositoryTrustProfileId must be signed_human_gates or coulson_only_platform_review.",
      ));
    } else {
      profileId = input.repositoryTrustProfileId;
    }
  }

  const bindingSeats = new Set<string>();
  if (!Array.isArray(input.trustedHumanBindingRefs)) {
    issues.push(issue(
      "invalid_bindings",
      "config.trustedHumanBindingRefs",
      "trustedHumanBindingRefs must be an array.",
    ));
  } else {
    for (let index = 0; index < input.trustedHumanBindingRefs.length; index += 1) {
      const binding = input.trustedHumanBindingRefs[index];
      const path = `config.trustedHumanBindingRefs[${index}]`;
      if (!isPlainObject(binding)) {
        issues.push(issue("invalid_binding", path, `${path} must be a plain object.`));
        continue;
      }
      exactFields(binding, BINDING_FIELDS, path, issues);
      if (!HUMAN_AUTHORITY_SEAT_IDS.includes(binding.seatId as HumanAuthoritySeatId)) {
        issues.push(issue("unsupported_binding_seat", `${path}.seatId`, `${path}.seatId is unsupported.`));
      } else if (bindingSeats.has(binding.seatId as string)) {
        issues.push(issue("duplicate_binding_seat", `${path}.seatId`, `${path}.seatId is duplicated.`));
      } else {
        bindingSeats.add(binding.seatId as string);
      }
      if (!bindingRefIsSafe(binding.bindingRef)) {
        issues.push(issue(
          "unsafe_binding_ref",
          `${path}.bindingRef`,
          `${path}.bindingRef must be an opaque credential-free identifier.`,
        ));
      } else if (profileId === "coulson_only_platform_review" &&
          UNCONFIGURED_BINDING_MARKER.test(binding.bindingRef)) {
        issues.push(issue(
          "unconfigured_binding_ref",
          `${path}.bindingRef`,
          `${path}.bindingRef must be a configured SHIELD signing binding reference.`,
        ));
      }
    }
  }
  const requiredSeats = profileId === undefined
    ? []
    : profileId === "coulson_only_platform_review" ? ["coulson"] : ["coulson", "fitz"];
  for (const requiredSeat of requiredSeats) {
    if (!bindingSeats.has(requiredSeat)) {
      issues.push(issue(
        "missing_required_binding",
        "config.trustedHumanBindingRefs",
        `A configured SHIELD signing binding reference is required for ${requiredSeat}.`,
      ));
    }
  }
  if (profileId === "coulson_only_platform_review") {
    for (const contradictorySeat of ["fitz", "simmons"]) {
      if (bindingSeats.has(contradictorySeat)) {
        issues.push(issue(
          "contradictory_binding",
          "config.trustedHumanBindingRefs",
          `Repository trust profile coulson_only_platform_review does not admit a ${contradictorySeat} SHIELD binding reference.`,
        ));
      }
    }
    if (Array.isArray(input.trustedHumanBindingRefs) && input.trustedHumanBindingRefs.length !== 1) {
      issues.push(issue(
        "invalid_binding_cardinality",
        "config.trustedHumanBindingRefs",
        "Repository trust profile coulson_only_platform_review requires exactly one configured human binding reference.",
      ));
    }
  }

  const pathValues: string[] = [];
  if (!isPlainObject(input.paths)) {
    issues.push(issue("invalid_paths", "config.paths", "paths must be a plain object."));
  } else {
    exactFields(input.paths, PATH_FIELDS, "config.paths", issues);
    for (const field of PATH_FIELDS) {
      const value = input.paths[field];
      if (!safeShieldPath(value)) {
        issues.push(issue(
          "unsafe_path",
          `config.paths.${field}`,
          `${field} must be a normalized repository-relative path below .shield/.`,
        ));
      } else {
        pathValues.push(value);
      }
    }
  }
  for (let left = 0; left < pathValues.length; left += 1) {
    for (let right = left + 1; right < pathValues.length; right += 1) {
      const a = pathValues[left];
      const b = pathValues[right];
      if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
        issues.push(issue("overlapping_paths", "config.paths", `Configured paths overlap: ${a} and ${b}.`));
      }
    }
  }

  return issues.length > 0
    ? { state: "invalid", issues }
    : { state: "valid", value: input as unknown as ShieldConfig };
}

export function createShieldConfig(input: CreateShieldConfigInput): ShieldConfigV3 {
  const profileId = input.repositoryTrustProfileId ?? "signed_human_gates";
  if (!isRepositoryTrustProfileId(profileId)) {
    throw new Error(`Unsupported repository trust profile: ${String(profileId)}.`);
  }
  const bindings: TrustedHumanBindingRef[] = [
    { seatId: "coulson", bindingRef: input.coulsonBindingRef },
  ];
  if (profileId === "signed_human_gates") {
    if (input.fitzBindingRef === undefined) {
      throw new Error("Repository trust profile signed_human_gates requires a Fitz binding reference.");
    }
    bindings.push({ seatId: "fitz", bindingRef: input.fitzBindingRef });
  } else if (input.fitzBindingRef !== undefined || input.simmonsBindingRef !== undefined) {
    throw new Error("Repository trust profile coulson_only_platform_review rejects Fitz and Simmons binding references.");
  }
  if (input.simmonsBindingRef !== undefined) {
    bindings.push({ seatId: "simmons", bindingRef: input.simmonsBindingRef });
  }
  const adapterIds: ConfiguredHostAdapterId[] = input.adapterIds === undefined ? ["github"] : [...input.adapterIds];
  const candidate: ShieldConfigV3 = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    repositoryTrustProfileId: profileId,
    repositoryId: input.repositoryId,
    adapterIds,
    supportedSeatIds: [...SUPPORTED_SEAT_IDS],
    supportedModeIds: [...SUPPORTED_MODE_IDS],
    trustedHumanBindingRefs: bindings,
    paths: {
      journals: ".shield/journals",
      artifacts: ".shield/artifacts",
      reports: ".shield/reports",
      temp: ".shield/tmp",
    },
  };
  const checked = validateShieldConfig(candidate);
  if (checked.state === "invalid") {
    throw new Error(checked.issues.map(({ message }) => message).join(" "));
  }
  return checked.value as ShieldConfigV3;
}

function defensiveConfig(config: ShieldConfig): ShieldConfig {
  const common = {
    repositoryId: config.repositoryId,
    supportedSeatIds: [...config.supportedSeatIds],
    supportedModeIds: [...config.supportedModeIds],
    trustedHumanBindingRefs: config.trustedHumanBindingRefs.map(({ seatId, bindingRef }) => ({ seatId, bindingRef })),
    paths: { ...config.paths },
  };
  if (config.schemaVersion === LEGACY_CONFIG_SCHEMA_VERSION) {
    return { schemaVersion: 1, adapterId: config.adapterId, ...common };
  }
  if (config.schemaVersion === CONFIG_SCHEMA_V2_VERSION) {
    return {
      schemaVersion: 2,
      repositoryTrustProfileId: config.repositoryTrustProfileId,
      adapterId: config.adapterId,
      ...common,
    };
  }
  return {
    schemaVersion: 3,
    repositoryTrustProfileId: config.repositoryTrustProfileId,
    adapterIds: [...config.adapterIds],
    ...common,
  };
}

export function migrateShieldConfig(config: ShieldConfig): ShieldConfigV3 {
  const checked = validateShieldConfig(config);
  if (checked.state === "invalid") {
    throw new Error(checked.issues.map(({ message }) => message).join(" "));
  }
  const copy = defensiveConfig(checked.value);
  const migrated: ShieldConfigV3 = copy.schemaVersion === CONFIG_SCHEMA_VERSION
    ? copy
    : {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      repositoryTrustProfileId: copy.schemaVersion === LEGACY_CONFIG_SCHEMA_VERSION
        ? "signed_human_gates"
        : copy.repositoryTrustProfileId,
      repositoryId: copy.repositoryId,
      adapterIds: [copy.adapterId],
      supportedSeatIds: [...copy.supportedSeatIds],
      supportedModeIds: [...copy.supportedModeIds],
      trustedHumanBindingRefs: copy.trustedHumanBindingRefs.map(({ seatId, bindingRef }) => ({ seatId, bindingRef })),
      paths: { ...copy.paths },
    };
  const migratedCheck = validateShieldConfig(migrated);
  if (migratedCheck.state === "invalid") {
    throw new Error(migratedCheck.issues.map(({ message }) => message).join(" "));
  }
  return defensiveConfig(migratedCheck.value) as ShieldConfigV3;
}

export function parseShieldConfig(text: unknown): ConfigValidationResult {
  if (typeof text !== "string") {
    return { state: "invalid", issues: [issue("invalid_json", "config", "Config content must be text.")] };
  }
  try {
    return validateShieldConfig(JSON.parse(text));
  } catch {
    return { state: "invalid", issues: [issue("invalid_json", "config", "Config contains malformed JSON.")] };
  }
}

export function formatShieldConfig(config: unknown): string {
  const checked = validateShieldConfig(config);
  if (checked.state === "invalid") {
    throw new Error(checked.issues.map(({ message }) => message).join(" "));
  }
  return `${JSON.stringify(checked.value, null, 2)}\n`;
}

function doctorConfiguredAdapterIds(config: unknown): ConfiguredHostAdapterId[] | null {
  if (!isPlainObject(config)) return null;
  if (config.schemaVersion === LEGACY_CONFIG_SCHEMA_VERSION || config.schemaVersion === CONFIG_SCHEMA_V2_VERSION) {
    return config.adapterId === "github" ? ["github"] : null;
  }
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) return null;
  const adapterIssues: ConfigIssue[] = [];
  return validateConfiguredHostAdapterIds(config.adapterIds, "config.adapterIds", adapterIssues) &&
      adapterIssues.length === 0
    ? [...config.adapterIds]
    : null;
}

export function evaluateDoctor(input: DoctorInput): DoctorReportV2 {
  const validation = input.configPresent ? validateShieldConfig(input.config) : null;
  const issues = validation?.state === "invalid" ? validation.issues : [];
  const classifiedPrefixes = [
    "config.schemaVersion",
    "config.repositoryId",
    "config.adapterId",
    "config.adapterIds",
    "config.supportedSeatIds",
    "config.supportedModeIds",
    "config.repositoryTrustProfileId",
    "config.trustedHumanBindingRefs",
    "config.paths",
  ] as const;
  const check = (id: DoctorNonAdapterCheckIdV2, ok: boolean, message: string): DoctorNonAdapterCheckV2 => ({ id, ok, message });
  const category = (id: DoctorNonAdapterCheckIdV2, prefixes: readonly string[], success: string): DoctorNonAdapterCheckV2 => {
    const matching = issues.filter(({ path }) => prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)));
    return check(id, matching.length === 0, matching.length === 0 ? success : matching[0].message);
  };

  const beforeAdapter: DoctorNonAdapterCheckV2[] = [
    check(
      "repository-root",
      input.repositoryRootReady,
      input.repositoryRootReady
        ? "Repository root is an accessible Git JavaScript/TypeScript repository."
        : input.repositoryRootIssue ?? "Repository root is missing, inaccessible, or incompatible.",
    ),
    check(
      "package-version",
      input.packageVersion === SHIELD_PACKAGE_VERSION,
      input.packageVersion === SHIELD_PACKAGE_VERSION
        ? `Package version ${SHIELD_PACKAGE_VERSION} is supported.`
        : `Expected package version ${SHIELD_PACKAGE_VERSION}; received ${input.packageVersion ?? "unknown"}.`,
    ),
    check(
      "config-present",
      input.configPresent,
      input.configPresent ? "Configuration is present." : "Missing .shield/config.json; run shield init.",
    ),
    category(
      "config-schema",
      ["config.schemaVersion", "config.repositoryId"],
      "Configuration schema and repository identity are valid.",
    ),
  ];
  let adapterChecks: DoctorAdapterCheckV2[];
  const rawAdapterIssues = issues.filter(({ path }) =>
    path === "config.adapterId" || path.startsWith("config.adapterId[") ||
    path === "config.adapterIds" || path.startsWith("config.adapterIds[")
  );
  const doctorAdapterIds = input.configPresent ? doctorConfiguredAdapterIds(input.config) : null;
  if (doctorAdapterIds !== null && rawAdapterIssues.length === 0) {
    adapterChecks = doctorAdapterIds.map((adapterId) => ({
      id: "adapter",
      adapterId,
      ok: true,
      message: `Configured host adapter ${adapterId} is admitted by repository configuration.`,
    }));
  } else {
    adapterChecks = [{
      id: "adapter",
      adapterId: null,
      ok: false,
      message: input.configPresent
        ? rawAdapterIssues.length > 0
          ? "Configured host adapter selection is invalid."
          : "Configuration is invalid; configured host adapters are unavailable."
        : "Configuration is unavailable for this check.",
    }];
  }
  const afterAdapter: DoctorNonAdapterCheckV2[] = [
    category("seats", ["config.supportedSeatIds"], "Configured seats are supported and unique."),
    category("modes", ["config.supportedModeIds"], "Configured modes are supported and unique."),
    category(
      "bindings",
      ["config.repositoryTrustProfileId", "config.trustedHumanBindingRefs"],
      isPlainObject(input.config) &&
          (input.config.schemaVersion === LEGACY_CONFIG_SCHEMA_VERSION ||
           input.config.repositoryTrustProfileId === "signed_human_gates")
        ? "Repository trust profile signed_human_gates configures Coulson and Fitz binding references as required cryptographic seats; Simmons remains optional for product-sensitive missions."
        : "Repository trust profile coulson_only_platform_review configures Coulson as the only required cryptographic seat. Fitz is GitHub-enforced external review; Simmons is conditional external feedback; neither is admitted as SHIELD evidence.",
    ),
    category("paths", ["config.paths"], "Configured SHIELD paths are safe and distinct."),
  ];
  const checks: DoctorCheckV2[] = [...beforeAdapter, ...adapterChecks, ...afterAdapter];
  const unclassified = issues.find(({ path }) => !classifiedPrefixes.some((prefix) =>
    path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)
  ));
  if (unclassified !== undefined) {
    const schema = checks.find(({ id }) => id === "config-schema");
    if (schema !== undefined) {
      schema.ok = false;
      schema.message = unclassified.message;
    }
  }
  if (!input.configPresent) {
    for (const entry of checks.slice(3)) {
      entry.ok = false;
      entry.message = "Configuration is unavailable for this check.";
    }
  }
  const worktreeState = input.worktreeState ?? (input.configPresent && validation?.state === "valid"
    ? {
        classification: "manual_policy_present" as const,
        ok: true,
        message: "Valid manually initialized policy is present; no worktree preparation receipt exists.",
        receiptDigest: null,
      }
    : input.configPresent
      ? {
          classification: "stale_or_malformed_worktree_state" as const,
          ok: false,
          message: "Existing worktree policy is malformed and no valid preparation receipt is available.",
          receiptDigest: null,
        }
      : {
          classification: "uninitialized_worktree" as const,
          ok: false,
          message: "No worktree policy is present; run shield worktree prepare with an explicit source, or run shield init.",
          receiptDigest: null,
        });
  return {
    reportVersion: DOCTOR_REPORT_VERSION,
    ok: checks.every(({ ok }) => ok) && worktreeState.ok,
    checks,
    worktreeState,
  };
}
