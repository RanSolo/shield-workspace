import { isProxy, isSharedArrayBuffer } from "node:util/types";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

import type { HelicarrierDependenciesV0 } from "./helicarrier-v0.mjs";
import { HELICARRIER_CERTIFIED_NESTED_IDENTITIES, runHelicarrierV0 } from "./helicarrier-v0.mjs";
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
import type {
  SeatDispatchReceiptEventV1,
  SeatDispatchReceiptEventStartedV1,
  SeatDispatchReceiptProjectionV1,
} from "./seat-dispatch-receipt-v1.mjs";
import type { appendProfileAwareMissionEntryV1, readMissionJournalForDisplay } from "./mission-store.mjs";
import { canonicalJson } from "./mission-v2.mjs";
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
const ORIGINAL_SEQUENCE_EVIDENCE_PREFIX = "evidence:governed-may-original-sequence:";

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
const DELIVERY_WORKSPACE_FIELDS = [
  "repositoryId", "repositoryWorkspaceId", "repositoryOwner", "repositoryName",
  "baseBranch", "branch", "prNumber", "prUrl", "state", "isDraft",
  "baseRevision", "headRevision",
] as const;

const MAX_TEXT_LENGTH = 2048;
const MAX_COMMAND_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_COMMAND_ARGS_LENGTH = 256;
const MAX_VALIDATION_COMMANDS = 128;
const MAX_COMMAND_ARGS = 256;
const MAX_BLUEPRINT_BYTES = 1_048_576;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get;
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
      readonly currentSequence: number;
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

interface GovernedMayDispatchIdentityV1 {
  readonly parentSessionId: string;
  readonly packetId: string;
  readonly claimBindingPrefix: string;
}

type DeliveryWorkspaceSnapshot =
  | { readonly state: "ready"; readonly value: GovernedMayDeliveryWorkspaceObservationV1 }
  | { readonly state: "blocked"; readonly code: "workspace_invalid"; readonly errors: readonly string[] };

type BlueprintBytesSnapshot =
  | { readonly state: "ready"; readonly value: Uint8Array; readonly digest: string }
  | { readonly state: "blocked"; readonly code: "blueprint_invalid"; readonly errors: readonly string[] };

type DerivedDispatchEnvelopeSnapshot =
  | { readonly state: "ready"; readonly value: Readonly<Record<string, unknown>>; readonly canonicalBytes: Uint8Array; readonly digest: string }
  | { readonly state: "blocked"; readonly code: "dispatch_envelope_invalid"; readonly errors: readonly string[] };

type GovernedMayReceiptReplayV1 =
  | {
      readonly state: "fresh";
      readonly originalSequence: number;
      readonly identity: GovernedMayDispatchIdentityV1;
    }
  | {
      readonly state: "terminal";
      readonly originalSequence: number;
      readonly identity: GovernedMayDispatchIdentityV1;
      readonly receipt: SeatDispatchReceiptProjectionV1;
    }
  | {
      readonly state: "recovery_required";
      readonly code: "dispatch_receipt_recovery_required";
      readonly errors: readonly string[];
      readonly evidence: Readonly<Record<string, unknown>>;
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
      currentSequence: projection.lastSequence,
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

function deriveGovernedMayDispatchIdentityV1(
  authoritySnapshot: Extract<ActiveMayAuthoritySnapshot, { state: "ready" }>,
  furyEvaluation: Extract<CurrentFuryEvidenceEvaluation, { state: "ready" }>,
  originalSequence: number,
): GovernedMayDispatchIdentityV1 {
  const authority = authoritySnapshot.authority;
  const evidence = furyEvaluation.evidence;
  const identityDigest = createHash("sha256").update(canonicalJson({
    identityContractVersion: "governed-may-dispatch.identity.v1",
    missionRevisionId: authority.missionRevisionId,
    furyEvidenceId: evidence.evidenceId,
    furyEvidenceDigest: evidence.evidenceDigest,
    furyPlanDigest: evidence.planDigest,
    blueprintArtifactId: evidence.blueprintArtifactId,
    blueprintArtifactPath: evidence.blueprintArtifactPath,
    blueprintArtifactRevisionId: evidence.artifactRevisionId,
    originalSequence,
  }), "utf8").digest("base64url");
  const parentSessionId = `session:governed-may:${identityDigest.slice(0, 32)}`;
  const packetId = `packet:governed-may:${identityDigest}`;
  const claimKey = createHash("sha256").update(new TextEncoder().encode(
    `seat-dispatch-claim-v1\0${authority.missionId}\0${parentSessionId}\0${packetId}`,
  )).digest("base64url").slice(0, 32);
  return Object.freeze({
    parentSessionId,
    packetId,
    claimBindingPrefix: `evidence:packet-binding:seat-dispatch-v1:${claimKey}:`,
  });
}

function originalSequenceEvidenceRef(sequence: number): string {
  return `${ORIGINAL_SEQUENCE_EVIDENCE_PREFIX}${sequence}`;
}

function recoverOriginalSequence(start: SeatDispatchReceiptEventStartedV1): number | null {
  const refs = start.inputEvidenceRefs.filter((ref) => ref.startsWith(ORIGINAL_SEQUENCE_EVIDENCE_PREFIX));
  if (refs.length !== 1) return null;
  const raw = refs[0].slice(ORIGINAL_SEQUENCE_EVIDENCE_PREFIX.length);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw)) return null;
  const sequence = Number(raw);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
}

function classifyGovernedMayReceiptReplayV1(
  entries: readonly SeatDispatchReceiptEventV1[],
  projections: readonly SeatDispatchReceiptProjectionV1[],
  authoritySnapshot: Extract<ActiveMayAuthoritySnapshot, { state: "ready" }>,
  furyEvaluation: Extract<CurrentFuryEvidenceEvaluation, { state: "ready" }>,
): GovernedMayReceiptReplayV1 {
  try {
    const authority = authoritySnapshot.authority;
    const fury = furyEvaluation.evidence;
    const workspaceId = fury.furyDispatchIdentity.repositoryWorkspaceId;
    const relatedStarts = entries.filter((entry): entry is SeatDispatchReceiptEventStartedV1 =>
      entry.kind === "dispatch.started" &&
      entry.accountableSeatId === "may" &&
      entry.parentMissionId === authority.missionId &&
      entry.parentMissionRevision === authority.missionRevisionId &&
      entry.repositoryId === authority.repositoryId &&
      entry.repositoryWorkspaceId === workspaceId &&
      entry.repositoryRevision === authority.headRevision &&
      entry.subjectId === authority.subjectId &&
      entry.subjectRevision === authority.artifactRevisionId &&
      entry.artifactId === fury.blueprintArtifactId &&
      entry.artifactRevision === fury.artifactRevisionId
    );
    if (relatedStarts.length === 0) {
      const originalSequence = authoritySnapshot.currentSequence;
      return Object.freeze({
        state: "fresh",
        originalSequence,
        identity: deriveGovernedMayDispatchIdentityV1(authoritySnapshot, furyEvaluation, originalSequence),
      });
    }
    if (relatedStarts.length !== 1) {
      return {
        state: "recovery_required",
        code: "dispatch_receipt_recovery_required",
        errors: stableErrors([`Expected at most one governed May dispatch start; found ${relatedStarts.length}.`]),
        evidence: Object.freeze({ receiptIds: Object.freeze(relatedStarts.map(({ receiptId }) => receiptId).sort()) }),
      };
    }

    const start = relatedStarts[0];
    const originalSequence = recoverOriginalSequence(start);
    if (originalSequence === null || originalSequence > authoritySnapshot.currentSequence) {
      return {
        state: "recovery_required",
        code: "dispatch_receipt_recovery_required",
        errors: stableErrors(["Governed May dispatch start has missing or invalid original-sequence evidence."]),
        evidence: Object.freeze({ receiptId: start.receiptId }),
      };
    }
    const identity = deriveGovernedMayDispatchIdentityV1(authoritySnapshot, furyEvaluation, originalSequence);
    const packetBindings = start.inputEvidenceRefs.filter((ref) => ref.startsWith(identity.claimBindingPrefix));
    if (
      start.parentSessionId !== identity.parentSessionId ||
      packetBindings.length !== 1 ||
      !/^evidence:packet-binding:seat-dispatch-v1:[A-Za-z0-9_-]{32}:sha256:[A-Za-z0-9_-]{43}$/u.test(packetBindings[0])
    ) {
      return {
        state: "recovery_required",
        code: "dispatch_receipt_recovery_required",
        errors: stableErrors(["Governed May dispatch start does not match the recovered packet identity."]),
        evidence: Object.freeze({ receiptId: start.receiptId, originalSequence }),
      };
    }
    const receipts = projections.filter(({ receiptId }) => receiptId === start.receiptId);
    if (receipts.length !== 1) {
      return {
        state: "recovery_required",
        code: "dispatch_receipt_recovery_required",
        errors: stableErrors(["Governed May dispatch receipt projection is missing or ambiguous."]),
        evidence: Object.freeze({ receiptId: start.receiptId, originalSequence }),
      };
    }
    const receipt = receipts[0];
    if (receipt.state === "completed" || receipt.state === "failed" || receipt.state === "cancelled") {
      return Object.freeze({ state: "terminal", originalSequence, identity, receipt });
    }
    return {
      state: "recovery_required",
      code: "dispatch_receipt_recovery_required",
      errors: stableErrors(["Governed May dispatch has durable nonterminal receipt evidence."]),
      evidence: Object.freeze({
        receiptId: receipt.receiptId,
        dispatchId: receipt.dispatchId,
        parentSessionId: receipt.parentSessionId,
        state: receipt.state,
        originalSequence,
      }),
    };
  } catch {
    return {
      state: "recovery_required",
      code: "dispatch_receipt_recovery_required",
      errors: stableErrors(["Governed May dispatch receipt classification failed."]),
      evidence: Object.freeze({}),
    };
  }
}

function snapshotDeliveryWorkspaceObservationV1(input: unknown): DeliveryWorkspaceSnapshot {
  if (!plainObject(input)) {
    return { state: "blocked", code: "workspace_invalid", errors: stableErrors(["Delivery workspace observation must be a plain object."]) };
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== DELIVERY_WORKSPACE_FIELDS.length ||
    keys.some((key) => typeof key !== "string") ||
    DELIVERY_WORKSPACE_FIELDS.some((field) => !Object.hasOwn(input, field)) ||
    keys.some((key) => typeof key === "string" && !DELIVERY_WORKSPACE_FIELDS.includes(key as (typeof DELIVERY_WORKSPACE_FIELDS)[number]))
  ) {
    return { state: "blocked", code: "workspace_invalid", errors: stableErrors(["Delivery workspace observation has an invalid field set."]) };
  }
  for (const field of DELIVERY_WORKSPACE_FIELDS) {
    if (dataField(input, field).state === "invalid") {
      return { state: "blocked", code: "workspace_invalid", errors: stableErrors(["Delivery workspace observation must use enumerable data fields only."]) };
    }
  }
  const value = input as unknown as GovernedMayDeliveryWorkspaceObservationV1;
  const stringFields = [
    "repositoryId", "repositoryWorkspaceId", "repositoryOwner", "repositoryName",
    "baseBranch", "branch", "prUrl", "baseRevision", "headRevision",
  ] as const;
  if (
    stringFields.some((field) => typeof value[field] !== "string" || value[field].length === 0 || value[field].length > MAX_TEXT_LENGTH) ||
    !identifier(value.repositoryWorkspaceId) ||
    !identifier(value.baseBranch) ||
    !identifier(value.branch) ||
    value.repositoryId !== `${value.repositoryOwner}/${value.repositoryName}` ||
    !/^[A-Za-z0-9_.-]+$/u.test(value.repositoryOwner) ||
    !/^[A-Za-z0-9_.-]+$/u.test(value.repositoryName) ||
    !Number.isSafeInteger(value.prNumber) ||
    value.prNumber < 1 ||
    value.state !== "OPEN" ||
    typeof value.isDraft !== "boolean" ||
    !/^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{40,64})$/u.test(value.baseRevision) ||
    !/^[0-9a-f]{40,64}$/u.test(value.headRevision) ||
    value.prUrl !== `https://github.com/${value.repositoryOwner}/${value.repositoryName}/pull/${value.prNumber}`
  ) {
    return { state: "blocked", code: "workspace_invalid", errors: stableErrors(["Delivery workspace observation has invalid values."]) };
  }
  return { state: "ready", value: Object.freeze({ ...value }) };
}

function bindDeliveryWorkspaceV1(
  observation: GovernedMayDeliveryWorkspaceObservationV1,
  authoritySnapshot: Extract<ActiveMayAuthoritySnapshot, { state: "ready" }>,
  furyEvaluation: Extract<CurrentFuryEvidenceEvaluation, { state: "ready" }>,
): DeliveryWorkspaceSnapshot {
  const authority = authoritySnapshot.authority;
  const fury = furyEvaluation.evidence;
  if (
    observation.repositoryId !== authority.repositoryId ||
    observation.repositoryWorkspaceId !== fury.furyDispatchIdentity.repositoryWorkspaceId ||
    observation.baseBranch !== fury.baseBranch ||
    observation.branch !== authority.branch ||
    observation.prNumber !== fury.prNumber ||
    observation.baseRevision !== authority.baseRevision ||
    observation.headRevision !== authority.headRevision ||
    observation.headRevision !== fury.repositoryRevisionId ||
    observation.headRevision !== fury.artifactRevisionId
  ) {
    return {
      state: "blocked",
      code: "workspace_invalid",
      errors: stableErrors(["Live delivery workspace does not exactly match authority and Fury evidence."]),
    };
  }
  return { state: "ready", value: observation };
}

function snapshotBlueprintBytesV1(input: unknown): BlueprintBytesSnapshot {
  if (isProxy(input) || typedArrayBufferGetter === undefined || typedArrayTagGetter === undefined) {
    return { state: "blocked", code: "blueprint_invalid", errors: stableErrors(["Tracked blueprint must be a genuine Uint8Array."]) };
  }
  try {
    if (typedArrayTagGetter.call(input) !== "Uint8Array") {
      return { state: "blocked", code: "blueprint_invalid", errors: stableErrors(["Tracked blueprint must be a genuine Uint8Array."]) };
    }
    const backing = typedArrayBufferGetter.call(input) as ArrayBufferLike;
    if (isSharedArrayBuffer(backing)) {
      return { state: "blocked", code: "blueprint_invalid", errors: stableErrors(["Tracked blueprint must not use SharedArrayBuffer."]) };
    }
    const value = new Uint8Array(input as Uint8Array);
    if (value.byteLength === 0 || value.byteLength > MAX_BLUEPRINT_BYTES) {
      return { state: "blocked", code: "blueprint_invalid", errors: stableErrors(["Tracked blueprint must contain between 1 and 1048576 bytes."]) };
    }
    const digest = `sha256:${createHash("sha256").update(value).digest("base64url")}`;
    return { state: "ready", value, digest };
  } catch {
    return { state: "blocked", code: "blueprint_invalid", errors: stableErrors(["Tracked blueprint must be a genuine Uint8Array."]) };
  }
}

function deriveDispatchEnvelopeV1(
  authoritySnapshot: Extract<ActiveMayAuthoritySnapshot, { state: "ready" }>,
  furyEvaluation: Extract<CurrentFuryEvidenceEvaluation, { state: "ready" }>,
  workspace: GovernedMayDeliveryWorkspaceObservationV1,
  blueprint: Extract<BlueprintBytesSnapshot, { state: "ready" }>,
  identity: GovernedMayDispatchIdentityV1,
  originalSequence: number,
  validationCommands: readonly GovernedMayValidationCommandV1[],
): DerivedDispatchEnvelopeSnapshot {
  const authority = authoritySnapshot.authority;
  const wrapper = authoritySnapshot.bindingWrapper;
  const binding = wrapper.binding;
  const commandIds = validationCommands.map((command) => command.commandId);
  if (new Set(commandIds).size !== commandIds.length) {
    return { state: "blocked", code: "dispatch_envelope_invalid", errors: stableErrors(["Validation command registry contains duplicate command IDs."]) };
  }
  const unresolved = wrapper.validationCommandIds.filter((commandId) => !commandIds.includes(commandId));
  if (unresolved.length > 0) {
    return { state: "blocked", code: "dispatch_envelope_invalid", errors: stableErrors([`Validation command IDs are not present in the trusted registry: ${unresolved.join(", ")}.`]) };
  }
  const value = Object.freeze({
    contractVersion: "governed-may-dispatch-envelope.v1",
    missionId: authority.missionId,
    subjectId: authority.subjectId,
    missionRevisionId: authority.missionRevisionId,
    originalSequence,
    repositoryId: authority.repositoryId,
    repositoryRoot: authority.canonicalWritableRoot,
    repositoryWorkspaceId: workspace.repositoryWorkspaceId,
    baseBranch: workspace.baseBranch,
    branch: authority.branch,
    prNumber: workspace.prNumber,
    baseRevision: authority.baseRevision,
    headRevision: authority.headRevision,
    furyEvidenceId: furyEvaluation.evidence.evidenceId,
    furyEvidenceDigest: furyEvaluation.evidence.evidenceDigest,
    furyPlanDigest: furyEvaluation.evidence.planDigest,
    blueprintArtifactId: furyEvaluation.evidence.blueprintArtifactId,
    blueprintArtifactPath: furyEvaluation.evidence.blueprintArtifactPath,
    blueprintRevision: furyEvaluation.evidence.repositoryRevisionId,
    blueprintDigest: blueprint.digest,
    blueprintByteLength: blueprint.value.byteLength,
    seatId: "may",
    reasoningRuntimeId: binding.reasoningRuntimeId,
    modelId: wrapper.modelId,
    toolExecutorId: binding.toolExecutorId,
    implementationAuthorityRef: authority.authorityRef,
    runtimeBindingId: binding.bindingId,
    runtimeBindingVersion: binding.bindingVersion,
    requestedRelativePaths: Object.freeze([...wrapper.approvedRelativePaths]),
    requestedActionIds: Object.freeze([...binding.approvedScope.actionIds]),
    requestedEffectClasses: Object.freeze([...binding.approvedScope.effectClasses]),
    requestedEffectKeys: Object.freeze([...binding.approvedScope.effectKeys]),
    requestedCapabilities: Object.freeze([...binding.approvedScope.capabilities]),
    validationCommandIds: Object.freeze([...wrapper.validationCommandIds]),
    outputContract: Object.freeze(["changed_files", "tests_run", "unresolved_risks"]),
    stopCondition: "after_one_cycle",
    parentSessionId: identity.parentSessionId,
    packetId: identity.packetId,
  });
  const canonicalBytes = new TextEncoder().encode(canonicalJson(value));
  if (canonicalBytes.byteLength > MAX_BLUEPRINT_BYTES) {
    return { state: "blocked", code: "dispatch_envelope_invalid", errors: stableErrors(["Canonical dispatch envelope exceeds the 1048576-byte packet limit."]) };
  }
  const digest = `sha256:${createHash("sha256").update(canonicalBytes).digest("base64url")}`;
  return { state: "ready", value, canonicalBytes, digest };
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
  const mayReplay = classifyGovernedMayReceiptReplayV1(
    dispatchLedger.value.entries,
    dispatchLedger.value.projections,
    authoritySnapshot,
    furyEvaluation,
  );
  if (mayReplay.state === "recovery_required") {
    return {
      ...mayReplay,
      readiness: "dispatch_ready",
    };
  }
  if (mayReplay.state === "terminal") {
    return {
      state: "replayed",
      readiness: "dispatch_ready",
      evidence: Object.freeze({
        receiptId: mayReplay.receipt.receiptId,
        dispatchId: mayReplay.receipt.dispatchId,
        childTaskId: mayReplay.receipt.childTaskId,
        childSessionId: mayReplay.receipt.childSessionId,
        parentSessionId: mayReplay.identity.parentSessionId,
        packetId: mayReplay.identity.packetId,
        originalSequence: mayReplay.originalSequence,
        terminalState: mayReplay.receipt.state,
        furyEvidenceId: furyEvaluation.evidence.evidenceId,
      }),
    };
  }
  const originalSequence = mayReplay.originalSequence;
  const dispatchIdentity = mayReplay.identity;

  let workspaceObservation;
  try {
    workspaceObservation = await dependenciesSnapshot.value.observeDeliveryWorkspace(inputSnapshot.value.repositoryRoot);
  } catch {
    return {
      state: "blocked",
      readiness: "blocked",
      code: "workspace_invalid",
      errors: Object.freeze(["Delivery workspace observation failed."]),
    };
  }
  const workspaceSnapshot = snapshotDeliveryWorkspaceObservationV1(workspaceObservation);
  if (workspaceSnapshot.state === "blocked") {
    return { ...workspaceSnapshot, readiness: "blocked" };
  }
  const workspaceBinding = bindDeliveryWorkspaceV1(workspaceSnapshot.value, authoritySnapshot, furyEvaluation);
  if (workspaceBinding.state === "blocked") {
    return { ...workspaceBinding, readiness: "blocked" };
  }

  let blueprintBytes;
  try {
    blueprintBytes = await dependenciesSnapshot.value.readTrackedFile(Object.freeze({
      repositoryRoot: inputSnapshot.value.repositoryRoot,
      revision: furyEvaluation.evidence.repositoryRevisionId,
      relativePath: furyEvaluation.evidence.blueprintArtifactPath,
    }));
  } catch {
    return {
      state: "blocked",
      readiness: "blocked",
      code: "blueprint_invalid",
      errors: Object.freeze(["Tracked blueprint read failed."]),
    };
  }
  const blueprintSnapshot = snapshotBlueprintBytesV1(blueprintBytes);
  if (blueprintSnapshot.state === "blocked") {
    return { ...blueprintSnapshot, readiness: "blocked" };
  }
  const envelopeSnapshot = deriveDispatchEnvelopeV1(
    authoritySnapshot,
    furyEvaluation,
    workspaceBinding.value,
    blueprintSnapshot,
    dispatchIdentity,
    originalSequence,
    dependenciesSnapshot.value.validationCommands,
  );
  if (envelopeSnapshot.state === "blocked") {
    return { ...envelopeSnapshot, readiness: "blocked" };
  }
  const helicarrierTrust = Object.freeze({
    contractVersion: "governed-may-helicarrier-trust.v1",
    missionRevisionId: authoritySnapshot.authority.missionRevisionId,
    furyEvidenceId: furyEvaluation.evidence.evidenceId,
    furyEvidenceDigest: furyEvaluation.evidence.evidenceDigest,
    blueprintDigest: blueprintSnapshot.digest,
    blueprintByteLength: blueprintSnapshot.value.byteLength,
    blueprintBytesBase64: Buffer.from(blueprintSnapshot.value).toString("base64"),
    dispatchEnvelopeDigest: envelopeSnapshot.digest,
  });
  const helicarrierResult = runHelicarrierV0(Object.freeze({
    dispatchId: dispatchIdentity.packetId,
    envelope: envelopeSnapshot.value,
    trust: helicarrierTrust,
  }), dependenciesSnapshot.value.helicarrier);
  if (helicarrierResult.state === "invalid") {
    return {
      state: "blocked",
      readiness: "blocked",
      code: "helicarrier_invalid",
      errors: Object.freeze([`Helicarrier rejected the derived dispatch: ${helicarrierResult.reason}.`]),
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
      originalSequence,
      packetId: dispatchIdentity.packetId,
      parentSessionId: dispatchIdentity.parentSessionId,
      blueprintArtifactId: furyEvaluation.evidence.blueprintArtifactId,
      blueprintArtifactPath: furyEvaluation.evidence.blueprintArtifactPath,
      blueprintByteLength: blueprintSnapshot.value.byteLength,
      blueprintDigest: blueprintSnapshot.digest,
      blueprintRevision: furyEvaluation.evidence.repositoryRevisionId,
      dispatchEnvelopeByteLength: envelopeSnapshot.canonicalBytes.byteLength,
      dispatchEnvelopeDigest: envelopeSnapshot.digest,
      helicarrierManifestDigest: helicarrierResult.value.receipt.manifestDigest,
      helicarrierPromptDigest: helicarrierResult.value.receipt.promptDigest,
      helicarrierProvenanceDigest: helicarrierResult.value.receipt.provenanceDigest,
      prNumber: workspaceBinding.value.prNumber,
      repositoryWorkspaceId: workspaceBinding.value.repositoryWorkspaceId,
    }),
  };
}
