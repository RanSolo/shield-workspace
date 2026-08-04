import { isProxy } from "node:util/types";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { HelicarrierDependenciesV0 } from "./helicarrier-v0.mjs";
import { HELICARRIER_CERTIFIED_NESTED_IDENTITIES } from "./helicarrier-v0.mjs";
import type { Schema9PermissionContextTrustedHostOps } from "./schema9-permission-context-v1.mjs";
import type { createPermissionAuditFilesystemStore } from "./permission-audit-store.mjs";
import type { createMayControlEventFilesystemStore } from "./may-control-event-store.mjs";
import type { runMissionCycle } from "./mission-runtime-v1.mjs";
import type {
  appendSeatDispatchReceiptEntryV1,
  claimSeatDispatchPacketV1,
  readSeatDispatchReceiptLedgerV1,
} from "./seat-dispatch-store.mjs";
import type { readFuryPlanReviewEvidenceLedgerV1 } from "./fury-plan-review-evidence-store.mjs";
import {
  evaluateFuryPlanReviewEvidenceV1,
  type FuryPlanReviewEvidenceExpectedBindingV1,
  type FuryPlanReviewEvidenceV1,
} from "./fury-plan-review-evidence-v1.mjs";
import type { SeatDispatchReceiptEventV1 } from "./seat-dispatch-receipt-v1.mjs";
import type { appendProfileAwareMissionEntryV1, readMissionJournalForDisplay } from "./mission-store.mjs";
import type { ProfileAwareProjectionV1 } from "./profile-aware-mission-v1.mjs";
import {
  assertAuthoritySubsetOfScope,
  computeImplementationAuthorityDigest,
  validateImplementationAuthorityV1,
  validateSchema9RuntimeBindingV1,
  type ImplementationAuthorityV1,
  type Schema9RuntimeBindingV1,
} from "./implementation-authority-v1.mjs";

const INPUT_FIELDS = [
  "repositoryRoot",
  "configuredJournalPath",
  "missionId",
  "hostId",
] as const;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const SAFE_BYTES = /^[ -~]*$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;

const TRUSTED_DEPENDENCY_FIELDS = [
  "observeDeliveryWorkspace",
  "readTrackedFile",
  "readWorkspaceStatus",
  "schema9HostOps",
  "helicarrier",
  "validationCommands",
  "mayControlBaseUrl",
  "runMayControlLoop",
  "createPermissionAuditStore",
  "createMayControlEventStore",
  "readMissionJournal",
  "appendMissionEntry",
  "readFuryEvidence",
  "readDispatchReceipts",
  "claimDispatchPacket",
  "appendDispatchReceipt",
  "runMissionCycle",
] as const;
const TRUSTED_DEPENDENCY_OPTIONAL_FIELDS = ["mayApiToken", "fetchImpl"] as const;
const TRUSTED_HOST_OPS_FIELDS = ["realpath", "access", "execFile", "probeCapability", "now"] as const;
const TRUSTED_VALIDATION_COMMAND_FIELDS = ["commandId", "executable", "args", "timeoutMs"] as const;
const TRUSTED_HELICARRIER_CERTIFICATION_FIELDS = ["certificationId", "certificationCommit", "experimentId", "compilerId", "validatorId", "rendererId", "targetProfileId", "registryId", "frozenDigests"] as const;
const TRUSTED_HELICARRIER_DIGEST_FIELDS = ["compilerSourceTreeSha256", "validatorSourceTreeSha256", "rendererSpecSha256", "registrySha256", "targetProfileSha256"] as const;

const MAX_TEXT_LENGTH = 2048;
const MAX_COMMAND_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_COMMAND_ARGS_LENGTH = 256;
const MAX_VALIDATION_COMMANDS = 128;
const MAX_COMMAND_ARGS = 256;
const TRUSTED_DEPENDENCY_FIELD_SET = new Set<string>([...TRUSTED_DEPENDENCY_FIELDS, ...TRUSTED_DEPENDENCY_OPTIONAL_FIELDS]);
const TRUSTED_HOST_OPS_FIELD_SET = new Set<string>(TRUSTED_HOST_OPS_FIELDS);
const TRUSTED_VALIDATION_COMMAND_FIELD_SET = new Set<string>(TRUSTED_VALIDATION_COMMAND_FIELDS);
const TRUSTED_HELICARRIER_CERTIFICATION_FIELD_SET = new Set<string>(TRUSTED_HELICARRIER_CERTIFICATION_FIELDS);
const TRUSTED_HELICARRIER_DIGEST_FIELD_SET = new Set<string>(TRUSTED_HELICARRIER_DIGEST_FIELDS);
const REQUIRED_HELICARRIER_DEPENDENCY_FIELD_SET = new Set<string>(["certification", "validate", "compile"] as const);

type TrustedDependenciesSnapshotReady = {
  readonly state: "ready";
  readonly value: RunGovernedMayDispatchStepTrustedDependenciesV1;
};
type TrustedDependenciesSnapshotBlocked = {
  readonly state: "blocked";
  readonly code: "dependencies_invalid";
  readonly errors: readonly string[];
};
type TrustedDependenciesSnapshot = TrustedDependenciesSnapshotReady | TrustedDependenciesSnapshotBlocked;

const TRUSTED_DEPENDENCY_ERROR_MISSING_FIELD = "Governed dispatch trusted dependencies must be a plain object with exact expected fields.";
const TRUSTED_DEPENDENCY_ERROR_INACCESSIBLE_FIELDS = "Governed dispatch trusted dependencies must expose only own enumerable data fields.";

export interface RunGovernedMayDispatchStepInputV1 {
  readonly repositoryRoot: string;
  readonly configuredJournalPath: string;
  readonly missionId: string;
  readonly hostId: string;
}

export interface GovernedMayDeliveryWorkspaceObservationV1 {
  readonly repositoryId: string;
  readonly repositoryWorkspaceId: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly baseBranch: string;
  readonly branch: string;
  readonly prNumber: number;
  readonly prUrl: string;
  readonly state: "OPEN";
  readonly isDraft: boolean;
  readonly baseRevision: string;
  readonly headRevision: string;
}

export interface GovernedMayTrackedFileReadV1 {
  readonly repositoryRoot: string;
  readonly revision: string;
  readonly relativePath: string;
}

export interface GovernedMayValidationCommandV1 {
  readonly commandId: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}

export interface GovernedMayControlLoopRequestV1 {
  readonly baseUrl: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly sessionId: string;
  readonly repositoryRoot: string;
  readonly baseRevision: string;
}

export interface GovernedMayControlLoopResultV1 {
  readonly message: string;
  readonly attribution: "untrusted_model_output";
  readonly completedToolCalls: number;
  readonly writeCalls: number;
  readonly validationCalls: number;
  readonly releasedBytes: number;
}

export interface RunGovernedMayDispatchStepTrustedDependenciesV1 {
  readonly observeDeliveryWorkspace: (
    repositoryRoot: string,
  ) => GovernedMayDeliveryWorkspaceObservationV1 | Promise<GovernedMayDeliveryWorkspaceObservationV1>;
  readonly readTrackedFile: (input: GovernedMayTrackedFileReadV1) => Uint8Array | Promise<Uint8Array>;
  readonly readWorkspaceStatus: (repositoryRoot: string) => readonly string[] | Promise<readonly string[]>;
  readonly schema9HostOps: Schema9PermissionContextTrustedHostOps;
  readonly helicarrier: HelicarrierDependenciesV0;
  readonly validationCommands: readonly GovernedMayValidationCommandV1[];
  readonly mayControlBaseUrl: string;
  readonly mayApiToken?: string;
  readonly fetchImpl?: typeof fetch;
  readonly runMayControlLoop: (
    request: GovernedMayControlLoopRequestV1,
    dependencies: Readonly<Record<string, unknown>>,
  ) => Promise<GovernedMayControlLoopResultV1>;
  readonly createPermissionAuditStore: typeof createPermissionAuditFilesystemStore;
  readonly createMayControlEventStore: typeof createMayControlEventFilesystemStore;
  readonly readMissionJournal: typeof readMissionJournalForDisplay;
  readonly appendMissionEntry: typeof appendProfileAwareMissionEntryV1;
  readonly readFuryEvidence: typeof readFuryPlanReviewEvidenceLedgerV1;
  readonly readDispatchReceipts: typeof readSeatDispatchReceiptLedgerV1;
  readonly claimDispatchPacket: typeof claimSeatDispatchPacketV1;
  readonly appendDispatchReceipt: typeof appendSeatDispatchReceiptEntryV1;
  readonly runMissionCycle: typeof runMissionCycle;
}

type RunGovernedMayDispatchStepResultEvidenceV1 = Readonly<Record<string, unknown>>;

export interface RunGovernedMayDispatchStepResultBlockedV1 {
  readonly state: "blocked";
  readonly readiness: "blocked";
  readonly code: string;
  readonly errors: readonly string[];
}

export interface RunGovernedMayDispatchStepResultCompletedV1 {
  readonly state: "completed";
  readonly readiness: "dispatch_ready";
  readonly evidence: RunGovernedMayDispatchStepResultEvidenceV1;
}

export interface RunGovernedMayDispatchStepResultFailedV1 {
  readonly state: "failed";
  readonly readiness: "dispatch_ready";
  readonly evidence: RunGovernedMayDispatchStepResultEvidenceV1;
}

export interface RunGovernedMayDispatchStepResultReplayedV1 {
  readonly state: "replayed";
  readonly readiness: "dispatch_ready";
  readonly evidence: RunGovernedMayDispatchStepResultEvidenceV1;
}

export interface RunGovernedMayDispatchStepResultRecoveryReadyV1 {
  readonly state: "recovery_required";
  readonly readiness: "dispatch_ready";
  readonly code: string;
  readonly errors: readonly string[];
  readonly evidence: RunGovernedMayDispatchStepResultEvidenceV1;
}

export interface RunGovernedMayDispatchStepResultRecoveryIndeterminateV1 {
  readonly state: "recovery_required";
  readonly readiness: "indeterminate";
  readonly code: string;
  readonly errors: readonly string[];
  readonly evidence: RunGovernedMayDispatchStepResultEvidenceV1;
}

export type RunGovernedMayDispatchStepResultV1 =
  | RunGovernedMayDispatchStepResultBlockedV1
  | RunGovernedMayDispatchStepResultCompletedV1
  | RunGovernedMayDispatchStepResultFailedV1
  | RunGovernedMayDispatchStepResultReplayedV1
  | RunGovernedMayDispatchStepResultRecoveryReadyV1
  | RunGovernedMayDispatchStepResultRecoveryIndeterminateV1;

interface InputSnapshotReady {
  readonly state: "ready";
  readonly value: RunGovernedMayDispatchStepInputV1;
}

interface InputSnapshotBlocked {
  readonly state: "blocked";
  readonly code: "input_invalid";
  readonly errors: readonly string[];
}

type InputSnapshot = InputSnapshotReady | InputSnapshotBlocked;

type ActiveMayAuthoritySnapshot =
  | {
      readonly state: "ready";
      readonly authority: ImplementationAuthorityV1;
      readonly bindingWrapper: Schema9RuntimeBindingV1;
      readonly originalSequence: number;
    }
  | {
      readonly state: "recovery_required";
      readonly code: "mission_state_invalid" | "authority_binding_invalid";
      readonly errors: readonly string[];
    };

type CurrentFuryEvidenceSelection =
  | {
      readonly state: "ready";
      readonly record: FuryPlanReviewEvidenceV1;
    }
  | {
      readonly state: "recovery_required";
      readonly code: "fury_evidence_invalid";
      readonly errors: readonly string[];
    };

type CurrentFuryEvidenceEvaluation =
  | {
      readonly state: "ready";
      readonly evidence: Readonly<FuryPlanReviewEvidenceV1>;
      readonly expectedBinding: Readonly<FuryPlanReviewEvidenceExpectedBindingV1>;
    }
  | {
      readonly state: "recovery_required";
      readonly code: "fury_evidence_invalid";
      readonly errors: readonly string[];
    };

const blocked = (code: "input_invalid", errors: readonly unknown[]): InputSnapshotBlocked => ({
  state: "blocked",
  code,
  errors: stableErrors(errors),
});

function plainObject(value: unknown): value is Record<string, unknown> {
  try {
    return value !== null &&
      typeof value === "object" &&
      !isProxy(value) &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function dataField(source: Record<string, unknown>, key: string): { state: "ok"; value: unknown } | { state: "invalid" } {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !Object.hasOwn(descriptor, "value") ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined
  ) {
    return { state: "invalid" };
  }
  return { state: "ok", value: descriptor.value };
}

function trimOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function isSafeConfiguredJournalPath(repositoryRoot: string, configuredJournalPath: string): boolean {
  if (configuredJournalPath.length === 0 || configuredJournalPath.includes("\0")) return false;
  if (isAbsolute(configuredJournalPath)) return false;
  const root = resolve(repositoryRoot);
  const candidate = resolve(root, configuredJournalPath);
  const fromRoot = relative(root, candidate);
  return fromRoot !== "" && fromRoot !== "." && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`);
}

function stableErrors(errors: readonly unknown[]): readonly string[] {
  const normalized = errors
    .flatMap((error) => {
      if (typeof error === "string") {
        const message = error.trim();
        return message.length === 0 ? [] : [message];
      }
      if (error instanceof Error && typeof error.message === "string") {
        const message = error.message.trim();
        return message.length === 0 ? [] : [message];
      }
      return [];
    });
  return Object.freeze([...new Set(normalized.sort())]);
}

function authorityBindingRecovery(
  code: "mission_state_invalid" | "authority_binding_invalid",
  errors: readonly unknown[],
): Extract<ActiveMayAuthoritySnapshot, { state: "recovery_required" }> {
  return { state: "recovery_required", code, errors: stableErrors(errors) };
}

function freezeAuthority(authority: ImplementationAuthorityV1): ImplementationAuthorityV1 {
  return Object.freeze({
    ...authority,
    approvedRelativePaths: Object.freeze([...authority.approvedRelativePaths]),
    approvedActionIds: Object.freeze([...authority.approvedActionIds]),
    approvedEffectClasses: Object.freeze([...authority.approvedEffectClasses]),
    approvedEffectKeys: Object.freeze([...authority.approvedEffectKeys]),
    approvedCapabilities: Object.freeze([...authority.approvedCapabilities]),
    validationCommandIds: Object.freeze([...authority.validationCommandIds]),
    timestamp: Object.freeze({ ...authority.timestamp }),
  });
}

function freezeBindingWrapper(wrapper: Schema9RuntimeBindingV1): Schema9RuntimeBindingV1 {
  const snapshot: Schema9RuntimeBindingV1 = {
    ...wrapper,
    binding: {
      ...wrapper.binding,
      approvedScope: {
        actionIds: [...wrapper.binding.approvedScope.actionIds],
        effectClasses: [...wrapper.binding.approvedScope.effectClasses],
        effectKeys: [...wrapper.binding.approvedScope.effectKeys],
        capabilities: [...wrapper.binding.approvedScope.capabilities],
      },
    },
    approvedRelativePaths: [...wrapper.approvedRelativePaths],
    validationCommandIds: [...wrapper.validationCommandIds],
  };
  Object.freeze(snapshot.binding.approvedScope.actionIds);
  Object.freeze(snapshot.binding.approvedScope.effectClasses);
  Object.freeze(snapshot.binding.approvedScope.effectKeys);
  Object.freeze(snapshot.binding.approvedScope.capabilities);
  Object.freeze(snapshot.binding.approvedScope);
  Object.freeze(snapshot.binding);
  Object.freeze(snapshot.approvedRelativePaths);
  Object.freeze(snapshot.validationCommandIds);
  return Object.freeze(snapshot);
}

function deriveActiveMayAuthorityV1(projection: ProfileAwareProjectionV1): ActiveMayAuthoritySnapshot {
  try {
    if (
      projection.authorization !== "authorized" ||
      (projection.execution !== "not-started" && projection.execution !== "running") ||
      !Number.isSafeInteger(projection.lastSequence) ||
      projection.lastSequence < 0
    ) {
      return authorityBindingRecovery("mission_state_invalid", ["Mission authorization, execution, or sequence is not dispatchable."]);
    }
    if (projection.implementationAuthority === null || projection.implementationAuthorityState !== "authorized") {
      return authorityBindingRecovery("authority_binding_invalid", ["Active Wheels Up implementation authority is missing."]);
    }

    const checkedAuthority = validateImplementationAuthorityV1(projection.implementationAuthority);
    if (checkedAuthority.state === "invalid") {
      return authorityBindingRecovery("authority_binding_invalid", ["Implementation authority is malformed.", ...checkedAuthority.errors]);
    }
    const authority = checkedAuthority.value;
    const authorityDigest = computeImplementationAuthorityDigest(authority);
    if (
      authority.seatId !== "may" ||
      authority.missionId !== projection.missionId ||
      authority.subjectId !== projection.brief.subjectId ||
      authority.missionRevisionId !== projection.brief.revisionId ||
      projection.implementationAuthorityDigest !== authorityDigest
    ) {
      return authorityBindingRecovery("authority_binding_invalid", ["Implementation authority identity or digest is stale or mismatched."]);
    }

    const mayBindings = projection.activeRuntimeBindings.filter((candidate) => candidate.binding.seatId === "may");
    if (mayBindings.length !== 1) {
      return authorityBindingRecovery("authority_binding_invalid", ["Exactly one active May runtime binding is required."]);
    }
    const checkedBinding = validateSchema9RuntimeBindingV1(mayBindings[0]);
    if (checkedBinding.state === "invalid") {
      return authorityBindingRecovery("authority_binding_invalid", ["May runtime binding is malformed.", ...checkedBinding.errors]);
    }
    const wrapper = checkedBinding.value;
    const binding = wrapper.binding;
    const subset = assertAuthoritySubsetOfScope(wrapper, authority);
    if (subset.state === "invalid") {
      return authorityBindingRecovery("authority_binding_invalid", subset.errors);
    }
    if (
      binding.lifecycleState !== "active" ||
      wrapper.implementationAuthorityRef !== authority.authorityRef ||
      wrapper.implementationAuthorityDigest !== authorityDigest ||
      wrapper.implementationAuthoritySequence !== authority.journalSequence ||
      binding.missionId !== authority.missionId ||
      binding.subjectId !== authority.subjectId ||
      binding.missionRevisionId !== authority.missionRevisionId ||
      binding.repositoryId !== authority.repositoryId ||
      binding.canonicalWritableRoot !== authority.canonicalWritableRoot ||
      binding.branch !== authority.branch ||
      binding.artifactRevisionId !== authority.artifactRevisionId ||
      wrapper.baseRevision !== authority.baseRevision ||
      wrapper.headRevision !== authority.headRevision ||
      wrapper.modelId !== authority.modelId ||
      authority.artifactRevisionId !== authority.headRevision ||
      binding.recordedAtSequence > projection.lastSequence ||
      authority.journalSequence > projection.lastSequence
    ) {
      return authorityBindingRecovery("authority_binding_invalid", ["May runtime binding is not exactly bound to the active authority and mission projection."]);
    }

    return Object.freeze({
      state: "ready",
      authority: freezeAuthority(authority),
      bindingWrapper: freezeBindingWrapper(wrapper),
      originalSequence: projection.lastSequence,
    });
  } catch {
    return authorityBindingRecovery("authority_binding_invalid", ["Authority and runtime-binding inspection failed."]);
  }
}

function selectCurrentFuryEvidenceV1(
  records: readonly FuryPlanReviewEvidenceV1[],
  authoritySnapshot: Extract<ActiveMayAuthoritySnapshot, { state: "ready" }>,
): CurrentFuryEvidenceSelection {
  try {
    const authority = authoritySnapshot.authority;
    const matches = records.filter((record) =>
      record.missionId === authority.missionId &&
      record.missionRevisionId === authority.missionRevisionId &&
      record.subjectId === authority.subjectId &&
      record.repositoryId === authority.repositoryId &&
      record.branch === authority.branch &&
      record.artifactRevisionId === authority.artifactRevisionId &&
      record.repositoryRevisionId === authority.headRevision
    );
    if (matches.length !== 1) {
      return {
        state: "recovery_required",
        code: "fury_evidence_invalid",
        errors: stableErrors([`Exactly one current Fury evidence record is required; found ${matches.length}.`]),
      };
    }
    return Object.freeze({ state: "ready", record: matches[0] });
  } catch {
    return {
      state: "recovery_required",
      code: "fury_evidence_invalid",
      errors: stableErrors(["Fury evidence selection failed."]),
    };
  }
}

function evaluateCurrentFuryEvidenceV1(
  records: readonly FuryPlanReviewEvidenceV1[],
  rawReceiptEntries: readonly SeatDispatchReceiptEventV1[],
  selection: Extract<CurrentFuryEvidenceSelection, { state: "ready" }>,
  authoritySnapshot: Extract<ActiveMayAuthoritySnapshot, { state: "ready" }>,
): CurrentFuryEvidenceEvaluation {
  try {
    const authority = authoritySnapshot.authority;
    const record = selection.record;
    const expectedBinding: FuryPlanReviewEvidenceExpectedBindingV1 = Object.freeze({
      schemaVersion: 1,
      missionId: authority.missionId,
      missionRevisionId: authority.missionRevisionId,
      subjectId: authority.subjectId,
      repositoryId: authority.repositoryId,
      baseBranch: record.baseBranch,
      branch: authority.branch,
      prNumber: record.prNumber,
      blueprintArtifactId: record.blueprintArtifactId,
      blueprintArtifactPath: record.blueprintArtifactPath,
      blueprintArtifactKind: "implementation_blueprint",
      blueprintOwningSeatId: "may",
      artifactRevisionId: authority.artifactRevisionId,
      repositoryRevisionId: authority.headRevision,
    });
    const candidate = Object.freeze({
      candidateSchemaVersion: 1 as const,
      contractVersion: "fury.plan-review-evidence.v1" as const,
      evidenceId: record.evidenceId,
      evidenceDigest: record.evidenceDigest,
      missionId: authority.missionId,
      missionRevisionId: authority.missionRevisionId,
      planDigest: record.planDigest,
      artifactRevisionId: authority.artifactRevisionId,
      repositoryRevisionId: authority.headRevision,
    });
    const evaluation = evaluateFuryPlanReviewEvidenceV1(
      candidate,
      records,
      rawReceiptEntries,
      expectedBinding,
    );
    if (
      evaluation.state !== "evaluated" ||
      evaluation.dispatchEligibility !== "eligible" ||
      evaluation.reasonCodes.length !== 0 ||
      evaluation.evidence === null ||
      evaluation.evidence.evidenceId !== record.evidenceId ||
      evaluation.evidence.evidenceDigest !== record.evidenceDigest
    ) {
      return {
        state: "recovery_required",
        code: "fury_evidence_invalid",
        errors: stableErrors([
          "Current Fury evidence is not independently attributed and eligible.",
          ...evaluation.reasonCodes,
        ]),
      };
    }
    return Object.freeze({
      state: "ready",
      evidence: evaluation.evidence,
      expectedBinding: evaluation.binding,
    });
  } catch {
    return {
      state: "recovery_required",
      code: "fury_evidence_invalid",
      errors: stableErrors(["Current Fury evidence evaluation failed."]),
    };
  }
}

function snapshotInput(input: unknown): InputSnapshot {
  if (!plainObject(input)) return blocked("input_invalid", ["Governed dispatch input must be a plain object."]);
  const keys = Reflect.ownKeys(input);
  if (keys.length !== INPUT_FIELDS.length) return blocked("input_invalid", ["Governed dispatch input must contain exactly repositoryRoot, configuredJournalPath, missionId, and hostId."]);
  if (keys.some((key) => typeof key !== "string")) return blocked("input_invalid", ["Governed dispatch input contains non-string keys."]);
  const missing = INPUT_FIELDS.find((field) => !Object.hasOwn(input, field));
  if (missing !== undefined) return blocked("input_invalid", [`Governed dispatch input is missing field ${missing}.`]);

  const unknown = keys.filter((key) => !INPUT_FIELDS.includes(key as (typeof INPUT_FIELDS)[number]));
  if (unknown.length > 0) return blocked("input_invalid", ["Governed dispatch input contains unknown fields."]);

  const repositoryRootField = dataField(input, "repositoryRoot");
  const configuredJournalPathField = dataField(input, "configuredJournalPath");
  const missionIdField = dataField(input, "missionId");
  const hostIdField = dataField(input, "hostId");
  if (repositoryRootField.state === "invalid" || configuredJournalPathField.state === "invalid" || missionIdField.state === "invalid" || hostIdField.state === "invalid") {
    return blocked("input_invalid", ["Governed dispatch input must use enumerable data fields only."]);
  }

  const repositoryRootRaw = trimOrEmpty(repositoryRootField.value);
  const configuredJournalPathRaw = trimOrEmpty(configuredJournalPathField.value);
  const missionIdRaw = trimOrEmpty(missionIdField.value);
  const hostIdRaw = trimOrEmpty(hostIdField.value);

  if (repositoryRootRaw.length === 0 || configuredJournalPathRaw.length === 0 || missionIdRaw.length === 0 || hostIdRaw.length === 0) {
    return blocked("input_invalid", ["Governed dispatch input fields must be non-empty strings."]);
  }
  if (!isAbsolute(repositoryRootRaw) || repositoryRootRaw.includes("\0")) {
    return blocked("input_invalid", ["repositoryRoot must be an absolute path and free of control characters."]);
  }
  const repositoryRoot = resolve(repositoryRootRaw);
  if (!isSafeConfiguredJournalPath(repositoryRoot, configuredJournalPathRaw)) {
    return blocked("input_invalid", ["configuredJournalPath must be a safe repository-relative directory path."]);
  }
  if (!identifier(missionIdRaw) || !identifier(hostIdRaw)) {
    return blocked("input_invalid", ["missionId and hostId must match bounded identifier syntax."]);
  }

  return {
    state: "ready",
    value: Object.freeze({
      repositoryRoot,
      configuredJournalPath: configuredJournalPathRaw,
      missionId: missionIdRaw,
      hostId: hostIdRaw,
    }),
  };
}

function snapshotTrustedDependencies(dependencies: unknown): TrustedDependenciesSnapshot {
  if (!plainObject(dependencies)) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors([TRUSTED_DEPENDENCY_ERROR_MISSING_FIELD]),
    };
  }
  const source = dependencies as Record<string, unknown>;
  const keys = Reflect.ownKeys(source);
  const allKeys = [...TRUSTED_DEPENDENCY_FIELDS, ...TRUSTED_DEPENDENCY_OPTIONAL_FIELDS];

  if (keys.some((key) => typeof key !== "string")) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors(["Governed dispatch trusted dependencies contains symbol keys."]),
    };
  }

  const missing = TRUSTED_DEPENDENCY_FIELDS.find((field) => !Object.hasOwn(source, field));
  if (missing !== undefined) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors([`Governed dispatch trusted dependencies is missing required field ${missing}.`]),
    };
  }

  const unknown = keys.filter((key) => !TRUSTED_DEPENDENCY_FIELD_SET.has(String(key)));
  if (unknown.length > 0) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors(["Governed dispatch trusted dependencies contains unknown fields."]),
    };
  }

  const optionalPresent = TRUSTED_DEPENDENCY_OPTIONAL_FIELDS.filter((field) => Object.hasOwn(source, field));
  if (keys.length !== TRUSTED_DEPENDENCY_FIELDS.length + optionalPresent.length) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors([TRUSTED_DEPENDENCY_ERROR_MISSING_FIELD]),
    };
  }

  for (const key of TRUSTED_DEPENDENCY_FIELDS) {
    if (dataField(source, key).state === "invalid") {
      return {
        state: "blocked",
        code: "dependencies_invalid",
        errors: stableErrors([TRUSTED_DEPENDENCY_ERROR_INACCESSIBLE_FIELDS]),
      };
    }
  }
  for (const key of optionalPresent) {
    if (dataField(source, key).state === "invalid") {
      return {
        state: "blocked",
        code: "dependencies_invalid",
        errors: stableErrors([TRUSTED_DEPENDENCY_ERROR_INACCESSIBLE_FIELDS]),
      };
    }
  }

  const ownData = <T,>(field: string): T => {
    const descriptor = dataField(source, field);
    return descriptor.state === "ok" ? descriptor.value as T : (undefined as T);
  };
  const observeDeliveryWorkspace = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["observeDeliveryWorkspace"]>("observeDeliveryWorkspace");
  const readTrackedFile = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["readTrackedFile"]>("readTrackedFile");
  const readWorkspaceStatus = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["readWorkspaceStatus"]>("readWorkspaceStatus");
  const mayControlBaseUrlField = ownData<unknown>("mayControlBaseUrl");
  const runMayControlLoop = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["runMayControlLoop"]>("runMayControlLoop");
  const createPermissionAuditStore = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["createPermissionAuditStore"]>("createPermissionAuditStore");
  const createMayControlEventStore = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["createMayControlEventStore"]>("createMayControlEventStore");
  const readMissionJournal = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["readMissionJournal"]>("readMissionJournal");
  const appendMissionEntry = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["appendMissionEntry"]>("appendMissionEntry");
  const readFuryEvidence = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["readFuryEvidence"]>("readFuryEvidence");
  const readDispatchReceipts = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["readDispatchReceipts"]>("readDispatchReceipts");
  const claimDispatchPacket = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["claimDispatchPacket"]>("claimDispatchPacket");
  const appendDispatchReceipt = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["appendDispatchReceipt"]>("appendDispatchReceipt");
  const runMissionCycle = ownData<RunGovernedMayDispatchStepTrustedDependenciesV1["runMissionCycle"]>("runMissionCycle");
  if (
    observeDeliveryWorkspace === undefined ||
    readTrackedFile === undefined ||
    readWorkspaceStatus === undefined ||
    mayControlBaseUrlField === undefined ||
    runMayControlLoop === undefined ||
    createPermissionAuditStore === undefined ||
    createMayControlEventStore === undefined ||
    readMissionJournal === undefined ||
    appendMissionEntry === undefined ||
    readFuryEvidence === undefined ||
    readDispatchReceipts === undefined ||
    claimDispatchPacket === undefined ||
    appendDispatchReceipt === undefined ||
    runMissionCycle === undefined
  ) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors([TRUSTED_DEPENDENCY_ERROR_INACCESSIBLE_FIELDS]),
    };
  }
  const mayApiToken = dataField(source, "mayApiToken");
  const fetchImpl = dataField(source, "fetchImpl");

  if (
    typeof observeDeliveryWorkspace !== "function" ||
    typeof readTrackedFile !== "function" ||
    typeof readWorkspaceStatus !== "function" ||
    typeof runMayControlLoop !== "function" ||
    typeof createPermissionAuditStore !== "function" ||
    typeof createMayControlEventStore !== "function" ||
    typeof readMissionJournal !== "function" ||
    typeof appendMissionEntry !== "function" ||
    typeof readFuryEvidence !== "function" ||
    typeof readDispatchReceipts !== "function" ||
    typeof claimDispatchPacket !== "function" ||
    typeof appendDispatchReceipt !== "function" ||
    typeof runMissionCycle !== "function"
  ) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors(["Governed dispatch trusted dependencies has invalid function fields."]),
    };
  }

  const schema9HostOpsSnapshot = snapshotSchema9HostOps(source.schema9HostOps);
  if (schema9HostOpsSnapshot.state === "blocked") return schema9HostOpsSnapshot;

  const helicarrierSnapshot = snapshotHelicarrierDependencies(source.helicarrier);
  if (helicarrierSnapshot.state === "blocked") return helicarrierSnapshot;

  const validationCommandsSnapshot = snapshotValidationCommands(source.validationCommands);
  if (validationCommandsSnapshot.state === "blocked") return validationCommandsSnapshot;

  const mayControlBaseUrl = snapshotBoundedString(mayControlBaseUrlField, MAX_TEXT_LENGTH, "mayControlBaseUrl");
  if (mayControlBaseUrl.state === "blocked") return mayControlBaseUrl;
  try {
    const normalizedUrl = new URL(mayControlBaseUrl.value);
    if (
      normalizedUrl.protocol !== "http:" ||
      (normalizedUrl.hostname !== "127.0.0.1" && normalizedUrl.hostname !== "[::1]") ||
      normalizedUrl.username.length > 0 ||
      normalizedUrl.password.length > 0 ||
      (normalizedUrl.pathname !== "/" && normalizedUrl.pathname !== "") ||
      normalizedUrl.search.length > 0 ||
      normalizedUrl.hash.length > 0
    ) {
      return {
        state: "blocked",
        code: "dependencies_invalid",
        errors: stableErrors(["mayControlBaseUrl must be a credential-free HTTP loopback origin."]),
      };
    }
  } catch {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors(["mayControlBaseUrl must be a valid URL."]),
    };
  }

  const mayApiTokenValue = snapshotOptionalToken(mayApiToken, "mayApiToken");
  if (mayApiTokenValue.state === "blocked") return mayApiTokenValue;

  const fetchImplValue = snapshotOptionalFunction(fetchImpl, "fetchImpl");
  if (fetchImplValue.state === "blocked") return fetchImplValue;

  return {
    state: "ready",
    value: Object.freeze({
      observeDeliveryWorkspace,
      readTrackedFile,
      readWorkspaceStatus,
      schema9HostOps: schema9HostOpsSnapshot.value,
      helicarrier: helicarrierSnapshot.value,
      validationCommands: validationCommandsSnapshot.value,
      mayControlBaseUrl: mayControlBaseUrl.value,
      runMayControlLoop,
      createPermissionAuditStore,
      createMayControlEventStore,
      readMissionJournal,
      appendMissionEntry,
      readFuryEvidence,
      readDispatchReceipts,
      claimDispatchPacket,
      appendDispatchReceipt,
      runMissionCycle,
      ...mayApiTokenValue.state === "ready" && mayApiTokenValue.value !== undefined ? { mayApiToken: mayApiTokenValue.value } : undefined,
      ...fetchImplValue.state === "ready" && fetchImplValue.value !== undefined ? { fetchImpl: fetchImplValue.value } : undefined,
    }),
  };
}

function snapshotBoundedString(
  value: unknown,
  maxLength: number,
  fieldName: string,
): { state: "ready"; value: string } | { state: "blocked"; code: "dependencies_invalid"; errors: readonly string[] } {
  if (typeof value !== "string") {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`${fieldName} must be a string.`]) };
  }
  const valueCopy = value.trim();
  if (valueCopy.length === 0 || valueCopy.length > maxLength) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`${fieldName} must be a bounded non-empty string.`]) };
  }
  if (!SAFE_BYTES.test(valueCopy)) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`${fieldName} has disallowed characters.`]) };
  }
  return { state: "ready", value: valueCopy };
}

function snapshotOptionalToken(
  token: { state: "ok"; value: unknown } | { state: "invalid" },
  fieldName: string,
): { state: "ready"; value: string | undefined } | { state: "blocked"; code: "dependencies_invalid"; errors: readonly string[] } {
  if (token.state === "invalid") return { state: "ready", value: undefined };
  if (token.value === undefined) return { state: "ready", value: undefined };
  const bounded = snapshotBoundedString(token.value, MAX_TEXT_LENGTH, fieldName);
  if (bounded.state === "blocked") return bounded;
  return { state: "ready", value: bounded.value };
}

function snapshotOptionalFunction(
  value: { state: "ok"; value: unknown } | { state: "invalid" },
  fieldName: string,
): { state: "ready"; value: typeof fetch | undefined } | { state: "blocked"; code: "dependencies_invalid"; errors: readonly string[] } {
  if (value.state === "invalid") return { state: "ready", value: undefined };
  if (value.value === undefined) return { state: "ready", value: undefined };
  if (typeof value.value !== "function") {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`${fieldName} must be a function when provided.`]) };
  }
  return { state: "ready", value: value.value as typeof fetch };
}

function snapshotSchema9HostOps(input: unknown):
| { state: "ready"; value: Schema9PermissionContextTrustedHostOps }
| { state: "blocked"; code: "dependencies_invalid"; errors: readonly string[] } {
  if (!plainObject(input)) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["schema9HostOps must be a plain object."]) };
  }
  const hostOps = input as Record<string, unknown>;
  const hostOpsKeys = Reflect.ownKeys(hostOps);
  if (hostOpsKeys.some((key) => typeof key !== "string")) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["schema9HostOps contains symbol keys."]) };
  }
  if (hostOpsKeys.length !== TRUSTED_HOST_OPS_FIELDS.length) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["schema9HostOps must include exactly realpath, access, execFile, probeCapability, and now."]) };
  }
  const missingHostField = TRUSTED_HOST_OPS_FIELDS.find((field) => !Object.hasOwn(hostOps, field));
  if (missingHostField !== undefined) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors([`schema9HostOps is missing ${missingHostField}.`]),
    };
  }
  const unknownHostField = hostOpsKeys.find((key) => !TRUSTED_HOST_OPS_FIELD_SET.has(String(key)));
  if (unknownHostField !== undefined) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors(["schema9HostOps has unknown fields."]),
    };
  }
  for (const key of TRUSTED_HOST_OPS_FIELDS) {
    const descriptor = dataField(hostOps, key);
    if (descriptor.state === "invalid" || typeof descriptor.value !== "function") {
      return {
        state: "blocked",
        code: "dependencies_invalid",
        errors: stableErrors([`schema9HostOps field ${key} must be an own enumerable function.`]),
      };
    }
  }
  return {
    state: "ready",
    value: {
      realpath: hostOps.realpath as Schema9PermissionContextTrustedHostOps["realpath"],
      access: hostOps.access as Schema9PermissionContextTrustedHostOps["access"],
      execFile: hostOps.execFile as Schema9PermissionContextTrustedHostOps["execFile"],
      probeCapability: hostOps.probeCapability as Schema9PermissionContextTrustedHostOps["probeCapability"],
      now: hostOps.now as Schema9PermissionContextTrustedHostOps["now"],
    },
  };
}

function snapshotHelicarrierDependencies(input: unknown):
| { state: "ready"; value: HelicarrierDependenciesV0 }
| { state: "blocked"; code: "dependencies_invalid"; errors: readonly string[] } {
  if (!plainObject(input)) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors(["helicarrier dependencies must be a plain object."]),
    };
  }
  const source = input as Record<string, unknown>;
  const helicarrierKeys = Reflect.ownKeys(source);
  if (helicarrierKeys.some((key) => typeof key !== "string")) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors(["helicarrier dependencies contains symbol keys."]),
    };
  }
  if (helicarrierKeys.length !== 3) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors(["helicarrier dependencies must include certification, validate, and compile."]),
    };
  }
  const requiredHelicarrierFields = ["certification", "validate", "compile"] as const;
  const missingHelicarrierField = requiredHelicarrierFields.find((field) => !Object.hasOwn(source, field));
  if (missingHelicarrierField !== undefined) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`helicarrier dependencies is missing ${missingHelicarrierField}.`]) };
  }
  const unknownHelicarrierField = helicarrierKeys.find((key) => !REQUIRED_HELICARRIER_DEPENDENCY_FIELD_SET.has(String(key)));
  if (unknownHelicarrierField !== undefined) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["helicarrier dependencies has unknown fields."]) };
  }
  for (const field of requiredHelicarrierFields) {
    const descriptor = dataField(source, field);
    if (descriptor.state === "invalid") {
      return {
        state: "blocked",
        code: "dependencies_invalid",
        errors: stableErrors([`helicarrier dependencies field ${field} is not an own enumerable data field.`]),
      };
    }
    if ((field === "validate" || field === "compile") && typeof descriptor.value !== "function") {
      return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`helicarrier dependencies field ${field} must be a function.`]) };
    }
  }
  const certificationSnapshot = snapshotHelicarrierCertification(source.certification);
  if (certificationSnapshot.state === "blocked") return certificationSnapshot;
  return {
    state: "ready",
    value: {
      certification: certificationSnapshot.value,
      validate: source.validate as HelicarrierDependenciesV0["validate"],
      compile: source.compile as HelicarrierDependenciesV0["compile"],
    },
  };
}

function snapshotHelicarrierCertification(input: unknown):
| { state: "ready"; value: HelicarrierDependenciesV0["certification"] }
| { state: "blocked"; code: "dependencies_invalid"; errors: readonly string[] } {
  if (!plainObject(input)) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["helicarrier certification must be a plain object."]) };
  }
  const source = input as Record<string, unknown>;
  const certificationKeys = Reflect.ownKeys(source);
  if (certificationKeys.length !== TRUSTED_HELICARRIER_CERTIFICATION_FIELDS.length) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors(["helicarrier certification must include exactly known identity and frozen digests."]),
    };
  }
  if (certificationKeys.some((key) => typeof key !== "string")) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["helicarrier certification contains symbol keys."]) };
  }
  const missing = TRUSTED_HELICARRIER_CERTIFICATION_FIELDS.find((field) => !Object.hasOwn(source, field));
  if (missing !== undefined) {
    return {
      state: "blocked",
      code: "dependencies_invalid",
      errors: stableErrors([`helicarrier certification is missing ${missing}.`]),
    };
  }
  const unknown = certificationKeys.find((key) => !TRUSTED_HELICARRIER_CERTIFICATION_FIELD_SET.has(String(key)));
  if (unknown !== undefined) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["helicarrier certification has unknown fields."]) };
  }
  for (const field of TRUSTED_HELICARRIER_CERTIFICATION_FIELDS) {
    const descriptor = dataField(source, field);
    if (descriptor.state === "invalid") {
      return {
        state: "blocked",
        code: "dependencies_invalid",
        errors: stableErrors([`helicarrier certification field ${field} is not an own enumerable data field.`]),
      };
    }
  }

  const certificationId = snapshotBoundedString(source.certificationId, MAX_TEXT_LENGTH, "helicarrier certificationId");
  if (certificationId.state === "blocked") return certificationId;
  const certificationCommit = snapshotBoundedString(source.certificationCommit, MAX_TEXT_LENGTH, "helicarrier certificationCommit");
  if (certificationCommit.state === "blocked") return certificationCommit;
  const experimentId = snapshotBoundedString(source.experimentId, MAX_TEXT_LENGTH, "helicarrier experimentId");
  if (experimentId.state === "blocked") return experimentId;
  const compilerId = snapshotBoundedString(source.compilerId, MAX_TEXT_LENGTH, "helicarrier compilerId");
  if (compilerId.state === "blocked") return compilerId;
  const validatorId = snapshotBoundedString(source.validatorId, MAX_TEXT_LENGTH, "helicarrier validatorId");
  if (validatorId.state === "blocked") return validatorId;
  const rendererId = snapshotBoundedString(source.rendererId, MAX_TEXT_LENGTH, "helicarrier rendererId");
  if (rendererId.state === "blocked") return rendererId;
  const targetProfileId = snapshotBoundedString(source.targetProfileId, MAX_TEXT_LENGTH, "helicarrier targetProfileId");
  if (targetProfileId.state === "blocked") return targetProfileId;
  const registryId = snapshotBoundedString(source.registryId, MAX_TEXT_LENGTH, "helicarrier registryId");
  if (registryId.state === "blocked") return registryId;

  if (
    certificationId.value !== "deterministic-mission-compilation-stage-a-certification.v1" ||
    certificationCommit.value !== "5fce3051d774c3315eeb86445f6d3724e630cf9b" ||
    experimentId.value !== "deterministic-mission-compilation-v2" ||
    compilerId.value !== HELICARRIER_CERTIFIED_NESTED_IDENTITIES.compilerId ||
    validatorId.value !== HELICARRIER_CERTIFIED_NESTED_IDENTITIES.validatorId ||
    rendererId.value !== HELICARRIER_CERTIFIED_NESTED_IDENTITIES.rendererId ||
    targetProfileId.value !== HELICARRIER_CERTIFIED_NESTED_IDENTITIES.targetProfileId ||
    registryId.value !== HELICARRIER_CERTIFIED_NESTED_IDENTITIES.registryId
  ) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["helicarrier certification identity mismatch."]) };
  }

  const digestSnapshot = snapshotFrozenDigestBundle(source.frozenDigests);
  if (digestSnapshot.state === "blocked") return digestSnapshot;

  return {
    state: "ready",
    value: Object.freeze({
      certificationId: certificationId.value,
      certificationCommit: certificationCommit.value,
      experimentId: experimentId.value,
      compilerId: compilerId.value,
      validatorId: validatorId.value,
      rendererId: rendererId.value,
      targetProfileId: targetProfileId.value,
      registryId: registryId.value,
      frozenDigests: Object.freeze(digestSnapshot.value),
    }),
  };
}

function snapshotFrozenDigestBundle(input: unknown):
| { state: "ready"; value: HelicarrierDependenciesV0["certification"]["frozenDigests"] }
| { state: "blocked"; code: "dependencies_invalid"; errors: readonly string[] } {
  if (!plainObject(input)) return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["helicarrier frozenDigests must be a plain object."]) };
  const source = input as Record<string, unknown>;
  const digestKeys = Reflect.ownKeys(source);
  if (digestKeys.some((key) => typeof key !== "string") || digestKeys.length !== TRUSTED_HELICARRIER_DIGEST_FIELDS.length) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["helicarrier frozenDigests must include exactly five fields."]) };
  }
  const missing = TRUSTED_HELICARRIER_DIGEST_FIELDS.find((field) => !Object.hasOwn(source, field));
  if (missing !== undefined) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`helicarrier frozenDigests is missing ${missing}.`]) };
  }
  for (const key of TRUSTED_HELICARRIER_DIGEST_FIELDS) {
    const descriptor = dataField(source, key);
    if (descriptor.state === "invalid" || typeof descriptor.value !== "string" || !SHA256_HEX.test(descriptor.value)) {
      return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`helicarrier frozenDigests.${key} must be a sha256 hex digest.`]) };
    }
  }
  const unknown = digestKeys.find((key) => !TRUSTED_HELICARRIER_DIGEST_FIELD_SET.has(String(key)));
  if (unknown !== undefined) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["helicarrier frozenDigests has unknown fields."]) };
  }
  return {
    state: "ready",
    value: {
      compilerSourceTreeSha256: source.compilerSourceTreeSha256 as string,
      validatorSourceTreeSha256: source.validatorSourceTreeSha256 as string,
      rendererSpecSha256: source.rendererSpecSha256 as string,
      registrySha256: source.registrySha256 as string,
      targetProfileSha256: source.targetProfileSha256 as string,
    },
  };
}

function snapshotValidationCommands(input: unknown):
| { state: "ready"; value: readonly GovernedMayValidationCommandV1[] }
| { state: "blocked"; code: "dependencies_invalid"; errors: readonly string[] } {
  if (!Array.isArray(input) || isProxy(input)) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["validationCommands must be an array."]) };
  }
  if (input.length > MAX_VALIDATION_COMMANDS) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["validationCommands has too many entries."]) };
  }
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== "string")) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["validationCommands contains symbol keys."]) };
  }
  if (!keys.every((key) => key === "length" || /^\d+$/.test(String(key)))) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors(["validationCommands contains unknown keys."]) };
  }
  const snapshot: GovernedMayValidationCommandV1[] = [];
  for (let i = 0; i < input.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value") ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      return {
        state: "blocked",
        code: "dependencies_invalid",
        errors: stableErrors([`validationCommands[${i}] must be an own enumerable data element.`]),
      };
    }
    const command = snapshotValidationCommand(descriptor.value, i);
    if (command.state === "blocked") return command;
    snapshot.push(command.value);
  }
  return { state: "ready", value: Object.freeze(snapshot) };
}

function snapshotValidationCommand(
  input: unknown,
  index: number,
): { state: "ready"; value: GovernedMayValidationCommandV1 } | { state: "blocked"; code: "dependencies_invalid"; errors: readonly string[] } {
  if (!plainObject(input)) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`validationCommands[${index}] must be an object.`]) };
  }
  const source = input as Record<string, unknown>;
  const keys = Reflect.ownKeys(source);
  if (keys.some((key) => typeof key !== "string")) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`validationCommands[${index}] contains symbol keys.`]) };
  }
  if (keys.length !== TRUSTED_VALIDATION_COMMAND_FIELDS.length) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`validationCommands[${index}] must contain exactly commandId, executable, args, and timeoutMs.`]) };
  }
  const missing = TRUSTED_VALIDATION_COMMAND_FIELDS.find((field) => !Object.hasOwn(source, field));
  if (missing !== undefined) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`validationCommands[${index}] is missing ${missing}.`]) };
  }
  const unknown = keys.find((key) => !TRUSTED_VALIDATION_COMMAND_FIELD_SET.has(String(key)));
  if (unknown !== undefined) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`validationCommands[${index}] has unknown fields.`]) };
  }
  for (const field of TRUSTED_VALIDATION_COMMAND_FIELDS) {
    const descriptor = dataField(source, field);
    if (descriptor.state === "invalid") {
      return {
        state: "blocked",
        code: "dependencies_invalid",
        errors: stableErrors([`validationCommands[${index}] field ${field} must be an own enumerable data field.`]),
      };
    }
  }
  const commandId = snapshotBoundedString(source.commandId, 255, `validationCommands[${index}].commandId`);
  if (commandId.state === "blocked") return commandId;
  if (!IDENTIFIER.test(commandId.value)) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`validationCommands[${index}].commandId format is invalid.`]) };
  }
  const executable = snapshotBoundedString(source.executable, MAX_TEXT_LENGTH, `validationCommands[${index}].executable`);
  if (executable.state === "blocked") return executable;

  const args = snapshotValidationCommandArgs(source.args, index);
  if (args.state === "blocked") return args;
  if (
    typeof source.timeoutMs !== "number" ||
    !Number.isSafeInteger(source.timeoutMs) ||
    source.timeoutMs <= 0 ||
    source.timeoutMs > MAX_COMMAND_TIMEOUT_MS
  ) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`validationCommands[${index}].timeoutMs must be a bounded safe integer in milliseconds.`]) };
  }

  return {
    state: "ready",
    value: Object.freeze({
      commandId: commandId.value,
      executable: executable.value,
      args: args.value,
      timeoutMs: source.timeoutMs,
    }),
  };
}

function snapshotValidationCommandArgs(
  input: unknown,
  index: number,
): { state: "ready"; value: readonly string[] } | { state: "blocked"; code: "dependencies_invalid"; errors: readonly string[] } {
  if (!Array.isArray(input) || isProxy(input)) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`validationCommands[${index}].args must be an array.`]) };
  }
  if (input.length > MAX_COMMAND_ARGS) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`validationCommands[${index}].args has too many items.`]) };
  }
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== "string") || !keys.every((key) => key === "length" || /^\d+$/.test(String(key)))) {
    return { state: "blocked", code: "dependencies_invalid", errors: stableErrors([`validationCommands[${index}].args contains invalid keys.`]) };
  }
  const snapshot: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value") ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      return {
        state: "blocked",
        code: "dependencies_invalid",
        errors: stableErrors([`validationCommands[${index}].args[${i}] must be an own enumerable data string.`]),
      };
    }
    const value = snapshotBoundedString(descriptor.value, MAX_COMMAND_ARGS_LENGTH, `validationCommands[${index}].args[${i}]`);
    if (value.state === "blocked") return value;
    snapshot.push(value.value);
  }
  return { state: "ready", value: Object.freeze(snapshot) };
}

export async function runGovernedMayDispatchStepV1(
  input: unknown,
  dependencies: unknown,
): Promise<RunGovernedMayDispatchStepResultV1> {
  const inputSnapshot = snapshotInput(input);
  if (inputSnapshot.state === "blocked") {
    return { ...inputSnapshot, readiness: "blocked" };
  }

  const dependenciesSnapshot = snapshotTrustedDependencies(dependencies);
  if (dependenciesSnapshot.state === "blocked") {
    return { ...dependenciesSnapshot, readiness: "blocked" };
  }

  let journal;
  try {
    journal = await dependenciesSnapshot.value.readMissionJournal({
      repositoryRoot: inputSnapshot.value.repositoryRoot,
      configuredJournalPath: inputSnapshot.value.configuredJournalPath,
      missionId: inputSnapshot.value.missionId,
    });
  } catch {
    return {
      state: "recovery_required",
      readiness: "indeterminate",
      code: "journal_invalid",
      errors: Object.freeze(["Mission journal read failed."]),
      evidence: Object.freeze({}),
    };
  }
  if (journal.state === "invalid") {
    return {
      state: "recovery_required",
      readiness: "indeterminate",
      code: journal.code,
      errors: Object.freeze([...journal.errors]),
      evidence: Object.freeze({}),
    };
  }
  if (journal.value.kind !== "profile-aware") {
    return {
      state: "recovery_required",
      readiness: "indeterminate",
      code: "schema_unsupported",
      errors: Object.freeze(["Governed May dispatch requires a schema-9 profile-aware mission journal."]),
      evidence: Object.freeze({}),
    };
  }

  const authoritySnapshot = deriveActiveMayAuthorityV1(journal.value.projection);
  if (authoritySnapshot.state === "recovery_required") {
    return {
      state: "recovery_required",
      readiness: "indeterminate",
      code: authoritySnapshot.code,
      errors: authoritySnapshot.errors,
      evidence: Object.freeze({}),
    };
  }

  let furyLedger;
  try {
    furyLedger = await dependenciesSnapshot.value.readFuryEvidence({
      repositoryRoot: inputSnapshot.value.repositoryRoot,
      missionId: inputSnapshot.value.missionId,
      lockOwnerId: inputSnapshot.value.hostId,
    });
  } catch {
    return {
      state: "recovery_required",
      readiness: "indeterminate",
      code: "fury_evidence_invalid",
      errors: Object.freeze(["Fury evidence ledger read failed."]),
      evidence: Object.freeze({}),
    };
  }
  if (furyLedger.state === "invalid") {
    return {
      state: "recovery_required",
      readiness: "indeterminate",
      code: "fury_evidence_invalid",
      errors: stableErrors([furyLedger.code, ...furyLedger.errors]),
      evidence: Object.freeze({}),
    };
  }
  const furySelection = selectCurrentFuryEvidenceV1(furyLedger.value.records, authoritySnapshot);
  if (furySelection.state === "recovery_required") {
    return {
      ...furySelection,
      readiness: "indeterminate",
      evidence: Object.freeze({}),
    };
  }

  let dispatchLedger;
  try {
    dispatchLedger = await dependenciesSnapshot.value.readDispatchReceipts({
      repositoryRoot: inputSnapshot.value.repositoryRoot,
      repositoryId: authoritySnapshot.authority.repositoryId,
      repositoryWorkspaceId: furySelection.record.furyDispatchIdentity.repositoryWorkspaceId,
    });
  } catch {
    return {
      state: "recovery_required",
      readiness: "indeterminate",
      code: "dispatch_receipt_invalid",
      errors: Object.freeze(["Dispatch receipt ledger read failed."]),
      evidence: Object.freeze({ furyEvidenceId: furySelection.record.evidenceId }),
    };
  }
  if (dispatchLedger.state === "invalid") {
    return {
      state: "recovery_required",
      readiness: "indeterminate",
      code: "dispatch_receipt_invalid",
      errors: stableErrors([dispatchLedger.code, ...dispatchLedger.errors]),
      evidence: Object.freeze({ furyEvidenceId: furySelection.record.evidenceId }),
    };
  }
  const furyEvaluation = evaluateCurrentFuryEvidenceV1(
    furyLedger.value.records,
    dispatchLedger.value.entries,
    furySelection,
    authoritySnapshot,
  );
  if (furyEvaluation.state === "recovery_required") {
    return {
      ...furyEvaluation,
      readiness: "indeterminate",
      evidence: Object.freeze({ furyEvidenceId: furySelection.record.evidenceId }),
    };
  }

  return {
    state: "recovery_required",
    readiness: "indeterminate",
    code: "implementation_incomplete",
    errors: Object.freeze(["Governed May dispatch execution is not implemented."]),
    evidence: Object.freeze({
      authorityRef: authoritySnapshot.authority.authorityRef,
      bindingId: authoritySnapshot.bindingWrapper.binding.bindingId,
      furyEvidenceId: furyEvaluation.evidence.evidenceId,
      furyPlanDigest: furyEvaluation.evidence.planDigest,
      originalSequence: authoritySnapshot.originalSequence,
    }),
  };
}
